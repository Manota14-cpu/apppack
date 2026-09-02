"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna, consultarValor, ejecutar, enTransaccion } from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { avisarATienda } from "@/lib/revalidar-tienda";
import { recuentoConteoSchema } from "@/lib/validation";
import type { Recuento } from "@/types/database.types";

function revalidarRecuentos() {
  revalidatePath("/recuentos");
  revalidatePath("/productos");
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
}

const CAMPOS_RECUENTO = `
  r.id, r.number as numero, r.status as estado, r.note as nota,
  r."createdAt" as created_at, r."closedAt" as closed_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', it.id, 'producto_id', it."productId", 'nombre', p.name,
             'sku', p.sku, 'unidad_medida', p.unit,
             'esperado', it.expected, 'contado', it.counted
           ) order by p.name)
      from "StockCountItem" it
      join "Product" p on p.id = it."productId"
     where it."countId" = r.id
  ), '[]'::jsonb) as items
`;

export async function recuentoAbierto(): Promise<Recuento | null> {
  await requerirSesion();
  try {
    return await consultarUna<Recuento>(
      `select ${CAMPOS_RECUENTO} from "StockCount" r where r.status = 'abierto' limit 1`
    );
  } catch (error) {
    console.error("[recuentos:abierto]", error);
    return null;
  }
}

export async function abrirRecuento(nota: string, categoriaId: string | null) {
  await requerirSesion();

  try {
    const id = await consultarValor<string>(`select abrir_recuento($1, $2)`, [
      nota.trim().slice(0, 200),
      categoriaId && categoriaId !== "todas" ? categoriaId.slice(0, 64) : null,
    ]);
    revalidarRecuentos();
    return { success: true as const, id };
  } catch (error) {
    return fallo(error, "recuentos:abrir");
  }
}

/**
 * Anota lo contado de un producto.
 *
 * No ajusta el stock todavía: durante el recuento solo se toma nota, y todos
 * los ajustes se generan juntos al cerrar. Así se puede recorrer el depósito
 * sin ir dejando movimientos a medio hacer.
 */
export async function anotarConteo(recuentoId: string, productoId: string, contado: number | null) {
  await requerirSesion();

  const parsed = recuentoConteoSchema.safeParse({ recuentoId, productoId, contado });
  if (!parsed.success) return falloDeValidacion("La cantidad contada no es válida.");
  const d = parsed.data;

  try {
    const filas = await ejecutar(
      `update "StockCountItem" set counted = $3
        where "countId" = $1 and "productId" = $2
          and exists (select 1 from "StockCount" c
                       where c.id = $1 and c.status = 'abierto')`,
      [d.recuentoId, d.productoId, d.contado]
    );
    if (filas === 0) {
      return falloDeValidacion("Este recuento ya no está abierto.");
    }
  } catch (error) {
    return fallo(error, "recuentos:anotar");
  }

  revalidatePath("/recuentos");
  return { success: true as const };
}

/** Anota varias cantidades de una vez, para no ir de a una consulta por producto. */
export async function anotarConteos(
  recuentoId: string,
  conteos: { productoId: string; contado: number | null }[]
) {
  await requerirSesion();

  if (!Array.isArray(conteos) || conteos.length === 0) {
    return falloDeValidacion("No hay conteos para guardar.");
  }

  try {
    const guardados = await enTransaccion(async (cx) => {
      const abierto = await cx.query(
        `select 1 from "StockCount" where id = $1 and status = 'abierto' for update`,
        [recuentoId.slice(0, 64)]
      );
      if (abierto.rowCount === 0) throw new Error("RECUENTO_CERRADO");

      let n = 0;
      for (const c of conteos.slice(0, 1000)) {
        const parsed = recuentoConteoSchema.safeParse({
          recuentoId,
          productoId: c.productoId,
          contado: c.contado,
        });
        if (!parsed.success) continue;
        const { rowCount } = await cx.query(
          `update "StockCountItem" set counted = $3 where "countId" = $1 and "productId" = $2`,
          [parsed.data.recuentoId, parsed.data.productoId, parsed.data.contado]
        );
        n += rowCount ?? 0;
      }
      return n;
    });

    revalidatePath("/recuentos");
    return { success: true as const, guardados };
  } catch (error) {
    if (error instanceof Error && error.message === "RECUENTO_CERRADO") {
      return falloDeValidacion("Este recuento ya no está abierto.");
    }
    return fallo(error, "recuentos:anotarVarios");
  }
}

/**
 * Cierra el recuento y genera todos los ajustes de una vez.
 *
 * La diferencia se calcula contra el stock del momento de cerrar, no contra la
 * foto de cuando se abrió: si entró mercadería en el medio, lo que manda es lo
 * que se contó.
 */
export async function cerrarRecuento(recuentoId: string) {
  await requerirSesion();

  try {
    const ajustes = await consultarValor<number>(`select cerrar_recuento($1)`, [
      recuentoId.slice(0, 64),
    ]);
    revalidarRecuentos();
    await avisarATienda();
    return { success: true as const, ajustes: Number(ajustes ?? 0) };
  } catch (error) {
    return fallo(error, "recuentos:cerrar");
  }
}

export async function anularRecuento(recuentoId: string) {
  await requerirSesion();

  try {
    const filas = await ejecutar(
      `update "StockCount" set status = 'anulado', "closedAt" = now()
        where id = $1 and status = 'abierto'`,
      [recuentoId.slice(0, 64)]
    );
    if (filas === 0) return falloDeValidacion("Este recuento ya no está abierto.");
  } catch (error) {
    return fallo(error, "recuentos:anular");
  }

  revalidarRecuentos();
  return { success: true as const };
}

export interface RecuentoResumen {
  id: string;
  numero: number;
  estado: string;
  nota: string | null;
  created_at: string;
  closed_at: string | null;
  productos: number;
  contados: number;
  diferencias: number;
}

export async function historialRecuentos(): Promise<RecuentoResumen[]> {
  await requerirSesion();
  try {
    return await consultar<RecuentoResumen>(
      `select r.id, r.number as numero, r.status as estado, r.note as nota,
              r."createdAt" as created_at, r."closedAt" as closed_at,
              count(it.*)::int as productos,
              count(it.counted)::int as contados,
              count(*) filter (where it.counted is not null and it.counted <> it.expected)::int as diferencias
         from "StockCount" r
         left join "StockCountItem" it on it."countId" = r.id
        group by r.id
        order by r.number desc
        limit 30`
    );
  } catch (error) {
    console.error("[recuentos:historial]", error);
    return [];
  }
}
