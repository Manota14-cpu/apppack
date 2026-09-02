import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { consultar } from "@/lib/db";
import { CAMPOS_MOVIMIENTO, DESDE_MOVIMIENTOS, paraBusqueda } from "@/lib/sql";
import { MovimientosClient } from "./movimientos-client";
import MovimientosLoading from "./loading";
import type { MovimientoConProducto } from "@/types/database.types";

const PAGE_SIZE = 30;

interface Params {
  q?: string;
  tipo?: string;
  page?: string;
}

async function getMovimientos(params: Params) {
  await requerirSesion();

  const paginaPedida = Math.max(1, Number(params.page) || 1);
  const condiciones: string[] = ["true"];
  const valores: unknown[] = [];

  if (params.tipo && params.tipo !== "todos") {
    valores.push(params.tipo);
    condiciones.push(`m.type = $${valores.length}`);
  }

  const termino = params.q?.trim();
  if (termino) {
    valores.push(paraBusqueda(termino));
    const i = valores.length;
    condiciones.push(`(p.name ilike $${i} or p.sku ilike $${i})`);
  }

  const where = condiciones.join(" and ");

  const conteo = await consultar<{ total: number }>(
    `select count(*)::int as total ${DESDE_MOVIMIENTOS} where ${where}`,
    valores
  );

  const total = conteo[0]?.total ?? 0;
  const pagina = Math.min(paginaPedida, Math.max(1, Math.ceil(total / PAGE_SIZE)));

  const movimientos = await consultar<MovimientoConProducto>(
    `select ${CAMPOS_MOVIMIENTO} ${DESDE_MOVIMIENTOS}
      where ${where}
      order by m."createdAt" desc
      limit ${PAGE_SIZE} offset ${(pagina - 1) * PAGE_SIZE}`,
    valores
  );

  return {
    movimientos,
    total,
    pagina,
    pageSize: PAGE_SIZE,
    filtros: { q: params.q ?? "", tipo: params.tipo ?? "todos" },
  };
}

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <Suspense key={JSON.stringify(params)} fallback={<MovimientosLoading />}>
      <MovimientosData params={params} />
    </Suspense>
  );
}

async function MovimientosData({ params }: { params: Params }) {
  const data = await getMovimientos(params);
  return <MovimientosClient {...data} />;
}
