import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { consultar } from "@/lib/db";
import { CAMPOS_PRODUCTO, DESDE_PRODUCTOS, paraBusqueda } from "@/lib/sql";
import { ProductosClient } from "./productos-client";
import ProductosLoading from "./loading";
import type { Categoria, ProductoConCategoria } from "@/types/database.types";

const PAGE_SIZE = 25;

interface Params {
  q?: string;
  categoria?: string;
  stock?: string;
  estado?: string;
  page?: string;
}

/**
 * Lee el catálogo de la tienda. Búsqueda, filtros y paginación se resuelven
 * en Postgres, no en el navegador.
 */
async function getProductos(params: Params) {
  await requerirSesion();

  const paginaPedida = Math.max(1, Number(params.page) || 1);
  const condiciones: string[] = ["p.active = $1"];
  const valores: unknown[] = [params.estado !== "eliminados"];

  const termino = params.q?.trim();
  if (termino) {
    valores.push(paraBusqueda(termino));
    const i = valores.length;
    condiciones.push(`(p.name ilike $${i} or p.sku ilike $${i} or p.barcode ilike $${i})`);
  }

  if (params.categoria && params.categoria !== "todas" && params.categoria !== "sin") {
    valores.push(params.categoria);
    condiciones.push(`p."categoryId" = $${valores.length}`);
  }

  if (params.stock === "sin") condiciones.push(`p."stockAvailable" = 0`);
  if (params.stock === "bajo") condiciones.push(`p."stockAvailable" <= p."minStock" and p."stockAvailable" > 0`);

  const where = condiciones.join(" and ");

  // Se cuenta primero para acotar la página: pedir ?page=999 dejaba una
  // pantalla vacía y sin navegación para volver.
  const [conteo, categorias] = await Promise.all([
    consultar<{ total: number }>(
      `select count(*)::int as total ${DESDE_PRODUCTOS} where ${where}`,
      valores
    ),
    consultar<Categoria>(
      `select id, name as nombre, null::text as color, null::timestamptz as created_at
         from "Category" order by name`
    ),
  ]);

  const total = conteo[0]?.total ?? 0;
  const pagina = Math.min(paginaPedida, Math.max(1, Math.ceil(total / PAGE_SIZE)));

  const productos = await consultar<ProductoConCategoria>(
    `select ${CAMPOS_PRODUCTO} ${DESDE_PRODUCTOS}
      where ${where}
      order by p.name
      limit ${PAGE_SIZE} offset ${(pagina - 1) * PAGE_SIZE}`,
    valores
  );

  return {
    productos,
    categorias,
    total,
    pagina,
    pageSize: PAGE_SIZE,
    filtros: {
      q: params.q ?? "",
      categoria: params.categoria ?? "todas",
      stock: params.stock ?? "todos",
      estado: params.estado ?? "activos",
    },
  };
}

export default async function ProductosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <Suspense key={JSON.stringify(params)} fallback={<ProductosLoading />}>
      <ProductosData params={params} />
    </Suspense>
  );
}

async function ProductosData({ params }: { params: Params }) {
  const data = await getProductos(params);
  return <ProductosClient {...data} />;
}
