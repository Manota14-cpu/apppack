import "server-only";
import { createHash } from "crypto";
import { consultarUna } from "@/lib/db";
import type { Aviso, ProductoCritico } from "@/lib/avisos-mensaje";

export type { Aviso, ProductoCritico };
export { asuntoDeAviso, htmlDeAviso, textoDeAviso } from "@/lib/avisos-mensaje";

/**
 * El aviso diario de reposición.
 *
 * Las alertas de stock bajo solo existían si entrabas a mirar el panel. Esto
 * es lo que hace que la app trabaje sin vos: una vez por día mira la base y,
 * si hay algo que atender, te escribe.
 */

/** Aunque nada haya cambiado, se vuelve a avisar pasado este tiempo. */
export const DIAS_ENTRE_RECORDATORIOS = 7;

interface FilaAviso {
  criticos: ProductoCritico[] | null;
  agotados: number;
  pedidos_cantidad: number;
  pedidos_monto: number;
}

export async function construirAviso(): Promise<Aviso> {
  const fila = await consultarUna<FilaAviso>(
    `select
       coalesce((
         select jsonb_agg(x) from (
           select name as nombre, "stockAvailable" as stock,
                  "minStock" as stock_minimo, unit as unidad_medida
             from "Product"
            where active and "stockAvailable" <= "minStock"
            order by "stockAvailable" asc, name asc
            limit 100
         ) x
       ), '[]'::jsonb) as criticos,
       (select count(*)::int from "Product"
         where active and "stockAvailable" = 0)                as agotados,
       (select count(*)::int from "Order"
         where status = 'pendiente')                           as pedidos_cantidad,
       (select coalesce(sum(total), 0)::int from "Order"
         where status = 'pendiente')                           as pedidos_monto`
  );

  const criticos = fila?.criticos ?? [];
  const pedidos = {
    cantidad: fila?.pedidos_cantidad ?? 0,
    monto: fila?.pedidos_monto ?? 0,
  };

  // La huella incluye los nombres y las cantidades, no solo el conteo: si se
  // repone uno y cae otro, el total no cambia pero el aviso sí tiene que salir.
  const huella = createHash("sha256")
    .update(
      JSON.stringify({
        c: criticos.map((p) => `${p.nombre}:${p.stock}`),
        p: pedidos.cantidad,
      })
    )
    .digest("hex")
    .slice(0, 32);

  return {
    criticos,
    agotados: fila?.agotados ?? 0,
    pedidos,
    huella,
    hayAlgo: criticos.length > 0 || pedidos.cantidad > 0,
  };
}
