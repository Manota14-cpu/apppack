"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna, consultarValor, ejecutar } from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { paraBusqueda } from "@/lib/sql";
import { formDataAObjeto, gastoSchema, primerError } from "@/lib/validation";
import type { Gasto } from "@/types/database.types";

function revalidarGastos() {
  revalidatePath("/gastos");
  // La caja, porque un gasto en efectivo le deja un retiro; los informes,
  // porque cambian el resultado del período.
  revalidatePath("/caja");
  revalidatePath("/informes");
}

/**
 * La fecha se pide como texto y no como `date`.
 *
 * El driver convierte una columna `date` a un Date con hora de la zona del
 * servidor, y en Argentina eso corre el día para atrás: un gasto del 6 se
 * mostraba como del 5. Formateándolo en Postgres no hay conversión que lo
 * mueva.
 */
const CAMPOS_GASTO = `
  e.id,
  to_char(e.fecha, 'YYYY-MM-DD') as fecha,
  e.categoria,
  e.concepto,
  e.monto,
  e."metodoPago"  as metodo_pago,
  e.proveedor,
  e.comprobante,
  e.notas,
  e."sessionId"   as caja_id,
  s.number        as caja_numero,
  coalesce(s.status = 'abierta', false) as caja_abierta,
  e."createdAt"   as created_at
`;

/** `0` días significa «todos». */
function desdeCuando(dias: number): string {
  if (!Number.isFinite(dias) || dias <= 0) return "1970-01-01";
  const d = new Date(Date.now() - dias * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function listarGastos(params: {
  q?: string;
  categoria?: string;
  dias?: number;
}): Promise<Gasto[]> {
  await requerirSesion();

  const condiciones: string[] = ["e.fecha >= $1::date"];
  const valores: unknown[] = [desdeCuando(params.dias ?? 90)];

  if (params.categoria && params.categoria !== "todas") {
    valores.push(params.categoria.slice(0, 40));
    condiciones.push(`e.categoria = $${valores.length}`);
  }

  const termino = params.q?.trim();
  if (termino) {
    valores.push(paraBusqueda(termino));
    const i = valores.length;
    condiciones.push(
      `(e.concepto ilike $${i} or e.proveedor ilike $${i} or e.comprobante ilike $${i} or e.notas ilike $${i})`
    );
  }

  try {
    return await consultar<Gasto>(
      `select ${CAMPOS_GASTO}
         from "Expense" e
         left join "CashSession" s on s.id = e."sessionId"
        where ${condiciones.join(" and ")}
        order by e.fecha desc, e."createdAt" desc
        limit 1000`,
      valores
    );
  } catch (error) {
    console.error("[gastos:listar]", error);
    return [];
  }
}

/** El id del turno abierto, para ofrecer descontar el gasto del cajón. */
export async function cajaAbiertaParaGasto(): Promise<{ id: string; numero: number } | null> {
  await requerirSesion();
  try {
    return await consultarUna<{ id: string; numero: number }>(
      `select id, number as numero from "CashSession" where status = 'abierta' limit 1`
    );
  } catch (error) {
    console.error("[gastos:cajaAbierta]", error);
    return null;
  }
}

/**
 * Solo el efectivo sale del cajón.
 *
 * Si se marcó «lo pagué con la plata de la caja» pero el medio es una
 * transferencia, descontarlo del turno haría que el arqueo diera de menos por
 * una plata que nunca estuvo en el cajón.
 */
function cajaDelGasto(metodo: string, cajaId: string | null): string | null {
  if (!cajaId) return null;
  return metodo === "efectivo" ? cajaId : null;
}

export async function crearGasto(formData: FormData) {
  await requerirSesion();

  const parsed = gastoSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  if (d.caja_id && d.metodo_pago !== "efectivo") {
    return falloDeValidacion(
      "Solo un gasto en efectivo sale del cajón. Cambiá el medio de pago o destildá la caja."
    );
  }

  try {
    const id = await consultarValor<string>(`select registrar_gasto($1::jsonb)`, [
      JSON.stringify({
        fecha: d.fecha,
        categoria: d.categoria,
        concepto: d.concepto,
        monto: d.monto,
        metodo_pago: d.metodo_pago,
        proveedor: d.proveedor,
        comprobante: d.comprobante,
        notas: d.notas,
        caja_id: cajaDelGasto(d.metodo_pago, d.caja_id),
      }),
    ]);

    revalidarGastos();
    return { success: true as const, id };
  } catch (error) {
    return fallo(error, "gastos:crear");
  }
}

export async function actualizarGasto(gastoId: string, formData: FormData) {
  await requerirSesion();

  const parsed = gastoSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  if (d.caja_id && d.metodo_pago !== "efectivo") {
    return falloDeValidacion(
      "Solo un gasto en efectivo sale del cajón. Cambiá el medio de pago o destildá la caja."
    );
  }

  try {
    await ejecutar(`select editar_gasto($1, $2::jsonb)`, [
      gastoId.slice(0, 64),
      JSON.stringify({
        fecha: d.fecha,
        categoria: d.categoria,
        concepto: d.concepto,
        monto: d.monto,
        metodo_pago: d.metodo_pago,
        proveedor: d.proveedor,
        comprobante: d.comprobante,
        notas: d.notas,
        caja_id: cajaDelGasto(d.metodo_pago, d.caja_id),
      }),
    ]);
  } catch (error) {
    return fallo(error, "gastos:actualizar");
  }

  revalidarGastos();
  return { success: true as const };
}

/**
 * Borra un gasto.
 *
 * A diferencia de un cliente, un gasto sí se borra: no tiene nada colgando y
 * una anotación equivocada solo ensucia el informe. Lo único que la base no
 * deja borrar es un gasto que salió de una caja ya cerrada, porque su arqueo
 * ya lo contó.
 */
export async function borrarGasto(gastoId: string) {
  await requerirSesion();

  try {
    await ejecutar(`select borrar_gasto($1)`, [gastoId.slice(0, 64)]);
  } catch (error) {
    return fallo(error, "gastos:borrar");
  }

  revalidarGastos();
  return { success: true as const };
}
