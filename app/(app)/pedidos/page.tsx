import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { consultar } from "@/lib/db";
import { CAMPOS_PEDIDO } from "@/lib/sql";
import { PedidosClient } from "./pedidos-client";
import PedidosLoading from "./loading";
import type { Pedido } from "@/types/database.types";

const PAGE_SIZE = 25;

interface Params {
  estado?: string;
  page?: string;
}

const ESTADOS_VALIDOS = new Set(["pendiente", "preparando", "entregado", "cancelado"]);

/**
 * Los pedidos que entran por la tienda.
 *
 * Hasta ahora se guardaban en la base y no se veían en ningún lado: ni AppPack
 * los mostraba ni el panel de la tienda, que decía «próximamente». Había plata
 * esperando en una tabla que nadie miraba.
 */
async function getPedidos(params: Params) {
  await requerirSesion();

  const paginaPedida = Math.max(1, Number(params.page) || 1);
  const filtro = params.estado && ESTADOS_VALIDOS.has(params.estado) ? params.estado : null;

  const where = filtro ? `where o.status = $1` : "";
  const valores = filtro ? [filtro] : [];

  const [conteo, porEstado] = await Promise.all([
    consultar<{ total: number }>(
      `select count(*)::int as total from "Order" o ${where}`,
      valores
    ),
    consultar<{ estado: string; n: number; monto: number }>(
      `select status as estado, count(*)::int as n, coalesce(sum(total), 0)::int as monto
         from "Order" group by status`
    ),
  ]);

  const total = conteo[0]?.total ?? 0;
  const pagina = Math.min(paginaPedida, Math.max(1, Math.ceil(total / PAGE_SIZE)));

  const pedidos = await consultar<Pedido>(
    `select ${CAMPOS_PEDIDO}
       from "Order" o
       ${where}
      order by o.number desc
      limit ${PAGE_SIZE} offset ${(pagina - 1) * PAGE_SIZE}`,
    valores
  );

  const resumen = Object.fromEntries(
    porEstado.map((e) => [e.estado, { cantidad: e.n, monto: e.monto }])
  );

  return {
    pedidos,
    total,
    pagina,
    pageSize: PAGE_SIZE,
    resumen,
    filtroEstado: filtro ?? "todos",
  };
}

export default async function PedidosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <Suspense key={JSON.stringify(params)} fallback={<PedidosLoading />}>
      <PedidosData params={params} />
    </Suspense>
  );
}

async function PedidosData({ params }: { params: Params }) {
  const data = await getPedidos(params);
  return <PedidosClient {...data} />;
}
