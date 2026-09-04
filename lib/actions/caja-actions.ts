"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna, consultarValor } from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { avisarATienda } from "@/lib/revalidar-tienda";
import {
  aperturaCajaSchema,
  cierreCajaSchema,
  cobroConPagosSchema,
  devolucionSchema,
  movimientoCajaSchema,
  primerError,
} from "@/lib/validation";
import type { Caja, Fecha } from "@/types/database.types";

function revalidarCaja() {
  revalidatePath("/caja");
  revalidatePath("/pedidos");
  revalidatePath("/productos");
  revalidatePath("/movimientos");
  revalidatePath("/informes");
  revalidatePath("/dashboard");
}

/**
 * Un turno de caja con sus ventas y sus totales por medio de pago.
 *
 * Los totales se calculan en la base y no sumando en el cliente: el arqueo de
 * cierre se compara contra este número, así que tiene que salir de la misma
 * fuente que el resto.
 */
const CAMPOS_CAJA = `
  c.id,
  c.number                as numero,
  c.status                as estado,
  c."openingFloat"        as fondo,
  c."countedCash"         as contado,
  c.note                  as nota,
  c."openedAt"            as opened_at,
  c."closedAt"            as closed_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'numero', o.number, 'nombre', o.nombre,
             'total', o.total, 'canal', o.channel,
             'metodo_pago', coalesce(o."paymentMethod", 'efectivo'),
             'notas', o.notas, 'created_at', o."createdAt",
             'renglones', (select count(*)::int from "OrderItem" i where i."orderId" = o.id),
             'unidades', (select coalesce(sum(i.quantity), 0)::int from "OrderItem" i where i."orderId" = o.id)
           ) order by o.number desc)
      from "Order" o
     where o."sessionId" = c.id and o.status <> 'cancelado'
  ), '[]'::jsonb) as ventas,
  -- Los totales por medio salen de la tabla de pagos, no de la etiqueta: en
  -- una venta pagada mitad y mitad la etiqueta dice "mixto", y repartirla por
  -- ahí sumaría el importe entero a un solo medio.
  (
    select jsonb_build_object(
      'efectivo',      coalesce(sum(pg.amount) filter (where pg.method = 'efectivo'), 0),
      'transferencia', coalesce(sum(pg.amount) filter (where pg.method = 'transferencia'), 0),
      'tarjeta',       coalesce(sum(pg.amount) filter (where pg.method = 'tarjeta'), 0),
      'otro',          coalesce(sum(pg.amount) filter (where pg.method = 'otro'), 0),
      'total',         coalesce((select sum(o2.total) from "Order" o2
                                  where o2."sessionId" = c.id and o2.status <> 'cancelado'), 0),
      'cantidad',      (select count(*) from "Order" o3
                         where o3."sessionId" = c.id and o3.status <> 'cancelado')
    )
    from "OrderPayment" pg
    join "Order" o on o.id = pg."orderId"
    where o."sessionId" = c.id and o.status <> 'cancelado'
  ) as totales,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id, 'tipo', m.type, 'monto', m.amount,
             'motivo', m.reason, 'created_at', m."createdAt"
           ) order by m."createdAt" desc)
      from "CashMovement" m where m."sessionId" = c.id
  ), '[]'::jsonb) as movimientos,
  (select coalesce(sum(amount), 0)::int from "CashMovement" m
    where m."sessionId" = c.id and m.type = 'retiro')   as retirado,
  (select coalesce(sum(amount), 0)::int from "CashMovement" m
    where m."sessionId" = c.id and m.type = 'ingreso')  as ingresado
`;

export async function cajaAbierta(): Promise<Caja | null> {
  await requerirSesion();
  try {
    return await consultarUna<Caja>(
      `select ${CAMPOS_CAJA} from "CashSession" c where c.status = 'abierta' limit 1`
    );
  } catch (error) {
    console.error("[caja:abierta]", error);
    return null;
  }
}

export async function verCaja(cajaId: string): Promise<Caja | null> {
  await requerirSesion();
  try {
    return await consultarUna<Caja>(
      `select ${CAMPOS_CAJA} from "CashSession" c where c.id = $1`,
      [cajaId.slice(0, 64)]
    );
  } catch (error) {
    console.error("[caja:ver]", error);
    return null;
  }
}

export interface CajaResumen {
  id: string;
  numero: number;
  estado: string;
  fondo: number;
  contado: number | null;
  opened_at: Fecha;
  closed_at: Fecha | null;
  ventas: number;
  total: number;
  efectivo: number;
  /** Contado menos esperado. Negativo es faltante. */
  diferencia: number | null;
}

export async function historialCajas(): Promise<CajaResumen[]> {
  await requerirSesion();
  try {
    return await consultar<CajaResumen>(
      `select c.id, c.number as numero, c.status as estado,
              c."openingFloat" as fondo, c."countedCash" as contado,
              c."openedAt" as opened_at, c."closedAt" as closed_at,
              (select count(*)::int from "Order" o
                where o."sessionId" = c.id and o.status <> 'cancelado')      as ventas,
              (select coalesce(sum(o.total), 0)::int from "Order" o
                where o."sessionId" = c.id and o.status <> 'cancelado')      as total,
              (select coalesce(sum(pg.amount), 0)::int from "OrderPayment" pg
                 join "Order" o on o.id = pg."orderId"
                where o."sessionId" = c.id and o.status <> 'cancelado'
                  and pg.method = 'efectivo')                                as efectivo,
              case when c."countedCash" is not null then
                c."countedCash" - (
                  c."openingFloat"
                  + (select coalesce(sum(pg.amount), 0)::int from "OrderPayment" pg
                       join "Order" o on o.id = pg."orderId"
                      where o."sessionId" = c.id and o.status <> 'cancelado'
                        and pg.method = 'efectivo')
                  + (select coalesce(sum(m.amount), 0)::int from "CashMovement" m
                      where m."sessionId" = c.id and m.type = 'ingreso')
                  - (select coalesce(sum(m.amount), 0)::int from "CashMovement" m
                      where m."sessionId" = c.id and m.type = 'retiro'))
              end                                                            as diferencia
         from "CashSession" c
        order by c.number desc
        limit 60`
    );
  } catch (error) {
    console.error("[caja:historial]", error);
    return [];
  }
}

/**
 * Anota un retiro o un ingreso de efectivo.
 *
 * Va contra el arqueo: lo que sale con motivo anotado deja de contar como
 * faltante al cerrar.
 */
export async function moverCaja(
  cajaId: string,
  tipo: string,
  monto: number,
  motivo: string
) {
  await requerirSesion();

  const parsed = movimientoCajaSchema.safeParse({ cajaId, tipo, monto, motivo });
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    await consultarValor<string>(`select mover_caja($1, $2, $3, $4)`, [
      d.cajaId,
      d.tipo,
      d.monto,
      d.motivo,
    ]);
    revalidatePath("/caja");
    return { success: true as const };
  } catch (error) {
    return fallo(error, "caja:mover");
  }
}

export async function abrirCaja(fondo: number, nota: string) {
  await requerirSesion();

  const parsed = aperturaCajaSchema.safeParse({ fondo, nota });
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));

  try {
    const id = await consultarValor<string>(`select abrir_caja($1, $2)`, [
      parsed.data.fondo,
      parsed.data.nota,
    ]);
    revalidarCaja();
    return { success: true as const, id };
  } catch (error) {
    return fallo(error, "caja:abrir");
  }
}

type Renglon = {
  producto_id: string | null;
  nombre: string;
  unidad_medida: string;
  precio: number;
  cantidad: number;
};

type EntradaCobro = {
  cajaId: string;
  nombre: string;
  notas: string;
  recibido: number;
  pagos: { metodo: string; monto: number }[];
  items: Renglon[];
};

type EntradaDevolucion = {
  cajaId: string;
  pedidoId: string | null;
  nombre: string;
  notas: string;
  metodoPago: string;
  items: Renglon[];
};

/**
 * Cobra una venta de mostrador.
 *
 * Es el mismo camino que un pedido de la tienda: crea la venta y descuenta el
 * stock en una sola operación, dentro de la base. Si a un renglón no le
 * alcanza el stock, no queda media venta cobrada — y el mensaje nombra el
 * producto, que es lo único útil con el cliente esperando enfrente.
 */
export async function cobrar(entrada: EntradaCobro) {
  await requerirSesion();

  const parsed = cobroConPagosSchema.safeParse(entrada);
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    const resultado = await consultarValor<{ numero: number; total: number }>(
      `select cobrar_mostrador($1::jsonb)`,
      [
        JSON.stringify({
          caja_id: d.cajaId,
          nombre: d.nombre,
          notas: d.notas,
          recibido: d.recibido,
          pagos: d.pagos,
          items: d.items,
        }),
      ]
    );

    revalidarCaja();
    // Lo que se acaba de vender ya no está disponible en la web.
    await avisarATienda();

    return {
      success: true as const,
      numero: Number(resultado?.numero ?? 0),
      total: Number(resultado?.total ?? 0),
    };
  } catch (error) {
    return fallo(error, "caja:cobrar");
  }
}

/**
 * Registra una devolución.
 *
 * Es una venta al revés: la mercadería vuelve al stock y la plata sale del
 * cajón. Se guarda en la misma tabla con importes negativos, así los informes
 * y el arqueo la restan solos, sin ningún caso especial.
 */
export async function devolver(entrada: EntradaDevolucion) {
  await requerirSesion();

  const parsed = devolucionSchema.safeParse(entrada);
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    const resultado = await consultarValor<{ numero: number; total: number }>(
      `select devolver_mostrador($1::jsonb)`,
      [
        JSON.stringify({
          caja_id: d.cajaId,
          pedido_id: d.pedidoId,
          nombre: d.nombre,
          notas: d.notas,
          metodo_pago: d.metodoPago,
          items: d.items,
        }),
      ]
    );

    revalidarCaja();
    await avisarATienda();

    return {
      success: true as const,
      numero: Number(resultado?.numero ?? 0),
      total: Number(resultado?.total ?? 0),
    };
  } catch (error) {
    return fallo(error, "caja:devolver");
  }
}

export interface Arqueo {
  fondo: number;
  efectivo: number;
  total: number;
  retiros: number;
  ingresos: number;
  esperado: number;
  contado: number;
  /** Contado menos esperado. Negativo es faltante. */
  diferencia: number;
}

export async function cerrarCaja(cajaId: string, contado: number, nota: string) {
  await requerirSesion();

  const parsed = cierreCajaSchema.safeParse({ cajaId, contado, nota });
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));

  try {
    const arqueo = await consultarValor<Arqueo>(`select cerrar_caja($1, $2, $3)`, [
      parsed.data.cajaId,
      parsed.data.contado,
      parsed.data.nota,
    ]);
    revalidarCaja();
    return { success: true as const, arqueo: arqueo ?? null };
  } catch (error) {
    return fallo(error, "caja:cerrar");
  }
}

export interface ProductoParaCobrar {
  id: string;
  nombre: string;
  sku: string | null;
  precio: number;
  stock: number;
  unidad_medida: string;
}

/**
 * Busca en el stock para cobrar.
 *
 * Devuelve también el stock, que es el dato que decide si se puede vender: en
 * el mostrador no sirve encontrar el producto si no se sabe si queda.
 */
export async function buscarParaCobrar(query: string): Promise<ProductoParaCobrar[]> {
  await requerirSesion();
  const termino = query.trim();
  if (termino.length < 2) return [];

  try {
    const { paraBusqueda } = await import("@/lib/sql");
    return await consultar<ProductoParaCobrar>(
      `select id, name as nombre, sku, price as precio,
              "stockAvailable" as stock, unit as unidad_medida
         from "Product"
        where active and (name ilike $1 or sku ilike $1 or barcode ilike $1)
        order by ("stockAvailable" = 0), name
        limit 12`,
      [paraBusqueda(termino)]
    );
  } catch (error) {
    console.error("[caja:buscar]", error);
    return [];
  }
}
