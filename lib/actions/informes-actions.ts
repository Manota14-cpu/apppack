"use server";

import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna } from "@/lib/db";
import type { Informe, Inmovilizado, VentaProducto } from "@/lib/informes";
import { PERIODOS } from "@/lib/informes";

function diasValidos(dias: number): number {
  return (PERIODOS as readonly number[]).includes(dias) ? dias : 30;
}

/**
 * El informe completo.
 *
 * El ingreso sale de los pedidos, que son los únicos que llevan precio. Las
 * salidas cargadas a mano —una venta de mostrador, por ejemplo— mueven el
 * stock pero no dicen a cuánto se vendió, así que se cuentan aparte en vez de
 * hacerlas figurar como cero y ensuciar el margen.
 */
export async function obtenerInforme(dias: number): Promise<Informe> {
  await requerirSesion();

  const d = diasValidos(dias);
  // `0` significa «todo»: se usa una fecha imposible de superar hacia atrás.
  const desde = d === 0 ? "1970-01-01" : new Date(Date.now() - d * 86_400_000).toISOString();

  const [resumen, porProducto, inmovilizado, movimientos, porCanal] = await Promise.all([
    consultarUna<{
      pedidos: number;
      unidades: number;
      ingreso: number;
      costo: number;
      salidas_sin_precio: number;
      costo_dudoso: number;
    }>(
      `select
         (select count(*)::int from "Order"
           where status <> 'cancelado' and "createdAt" >= $1::timestamptz)      as pedidos,
         coalesce((select sum(i.quantity)::int from "OrderItem" i
             join "Order" o on o.id = i."orderId"
            where o.status <> 'cancelado' and o."createdAt" >= $1::timestamptz), 0) as unidades,
         coalesce((select sum(i.price * i.quantity)::bigint from "OrderItem" i
             join "Order" o on o.id = i."orderId"
            where o.status <> 'cancelado' and o."createdAt" >= $1::timestamptz), 0) as ingreso,
         coalesce((select sum(coalesce(p."costPrice", 0) * i.quantity)::bigint
             from "OrderItem" i
             join "Order" o on o.id = i."orderId"
             join "Product" p on p.id = i."productId"
            where o.status <> 'cancelado' and o."createdAt" >= $1::timestamptz), 0) as costo,
         (select count(*)::int from "StockMovement"
           where type = 'salida' and "createdAt" >= $1::timestamptz)            as salidas_sin_precio,
         (select count(distinct i."productId")::int
            from "OrderItem" i
            join "Order" o on o.id = i."orderId"
            join "Product" p on p.id = i."productId"
           where o.status <> 'cancelado' and o."createdAt" >= $1::timestamptz
             and p.price > 0 and coalesce(p."costPrice", 0) > 0
             and p."costPrice" < p.price * 0.15)                                as costo_dudoso`,
      [desde]
    ),

    consultar<VentaProducto>(
      `select i."productId" as producto_id,
              coalesce(p.name, i.name)                     as nombre,
              sum(i.quantity)::int                         as unidades,
              sum(i.price * i.quantity)::bigint            as ingreso,
              sum(coalesce(p."costPrice", 0) * i.quantity)::bigint as costo,
              case when sum(i.price * i.quantity) > 0
                        and sum(coalesce(p."costPrice", 0) * i.quantity) > 0
                   then round(
                     (sum(i.price * i.quantity) - sum(coalesce(p."costPrice", 0) * i.quantity))
                       * 100.0 / sum(i.price * i.quantity)
                   )::int
              end                                          as margen
         from "OrderItem" i
         join "Order" o on o.id = i."orderId"
         left join "Product" p on p.id = i."productId"
        where o.status <> 'cancelado' and o."createdAt" >= $1::timestamptz
        group by i."productId", coalesce(p.name, i.name)
        order by sum(i.price * i.quantity) desc
        limit 50`,
      [desde]
    ),

    // Capital dormido: lo que está en la estantería sin moverse. La carga
    // inicial no cuenta como movimiento — si contara, todo el catálogo
    // parecería recién tocado el día que se vinculó con AppPack.
    consultar<Inmovilizado>(
      `select p.id, p.name as nombre, c.name as categoria,
              p."stockAvailable" as stock, p.unit as unidad_medida,
              (p."stockAvailable" * coalesce(p."costPrice", 0))::bigint as capital,
              (select extract(day from now() - max(m."createdAt"))::int
                 from "StockMovement" m
                where m."productId" = p.id and m.type <> 'creacion') as dias_quieto
         from "Product" p
         join "Category" c on c.id = p."categoryId"
        where p.active and p."stockAvailable" > 0
          and not exists (
            select 1 from "OrderItem" i
              join "Order" o on o.id = i."orderId"
             where i."productId" = p.id
               and o.status <> 'cancelado'
               and o."createdAt" >= $1::timestamptz
          )
        order by (p."stockAvailable" * coalesce(p."costPrice", 0)) desc
        limit 25`,
      [desde]
    ),

    consultar<{ tipo: string; cantidad: number }>(
      `select type as tipo, sum(quantity)::int as cantidad
         from "StockMovement"
        where "createdAt" >= $1::timestamptz and type <> 'creacion'
        group by type order by sum(quantity) desc`,
      [desde]
    ),

    consultar<{ canal: string; pedidos: number; ingreso: number }>(
      `select channel as canal, count(*)::int as pedidos,
              coalesce(sum(total), 0)::bigint as ingreso
         from "Order"
        where status <> 'cancelado' and "createdAt" >= $1::timestamptz
        group by channel
        order by sum(total) desc`,
      [desde]
    ),
  ]);

  const ingreso = Number(resumen?.ingreso ?? 0);
  const costo = Number(resumen?.costo ?? 0);
  const pedidos = resumen?.pedidos ?? 0;

  const capitalQuieto = inmovilizado.reduce((s, p) => s + Number(p.capital), 0);

  return {
    dias: d,
    ventas: {
      pedidos,
      unidades: resumen?.unidades ?? 0,
      ingreso,
      costo,
      margen: ingreso > 0 && costo > 0 ? Math.round(((ingreso - costo) / ingreso) * 100) : null,
      ticket_promedio: pedidos > 0 ? Math.round(ingreso / pedidos) : 0,
    },
    porProducto: porProducto.map((v) => ({
      ...v,
      unidades: Number(v.unidades),
      ingreso: Number(v.ingreso),
      costo: Number(v.costo),
    })),
    inmovilizado: inmovilizado.map((p) => ({ ...p, capital: Number(p.capital) })),
    capitalQuieto,
    movimientos,
    salidasSinPrecio: resumen?.salidas_sin_precio ?? 0,
    ventasConCostoDudoso: resumen?.costo_dudoso ?? 0,
    porCanal: porCanal.map((c) => ({ ...c, ingreso: Number(c.ingreso) })),
  };
}
