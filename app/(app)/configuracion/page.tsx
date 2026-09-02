import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { consultarUna } from "@/lib/db";
import { ConfiguracionClient } from "./configuracion-client";
import ConfiguracionLoading from "./loading";

/** Comprueba que estén las funciones que AppPack agrega sobre el catálogo. */
async function verificarEstructura() {
  const faltantes: string[] = [];

  const piezas = await consultarUna<{
    tabla_producto: boolean;
    tabla_movimientos: boolean;
    col_min_stock: boolean;
    col_costo: boolean;
    fn_ajustar: boolean;
    fn_crear: boolean;
    fn_metricas: boolean;
  }>(`
    select
      to_regclass('public."Product"')       is not null as tabla_producto,
      to_regclass('public."StockMovement"') is not null as tabla_movimientos,
      exists (select 1 from information_schema.columns
               where table_name = 'Product' and column_name = 'minStock') as col_min_stock,
      exists (select 1 from information_schema.columns
               where table_name = 'Product' and column_name = 'costPrice') as col_costo,
      to_regprocedure('public.ajustar_stock(text,int,text,text)')                              is not null as fn_ajustar,
      to_regprocedure('public.crear_producto(text,text,text,text,text,text,int,int,int,int)')  is not null as fn_crear,
      to_regprocedure('public.metricas_stock()')                                               is not null as fn_metricas
  `);

  if (!piezas?.tabla_producto) faltantes.push("la tabla Product");
  if (!piezas?.tabla_movimientos) faltantes.push("la tabla StockMovement");
  if (!piezas?.col_min_stock) faltantes.push("la columna minStock");
  if (!piezas?.col_costo) faltantes.push("la columna costPrice");
  if (!piezas?.fn_ajustar) faltantes.push("la función ajustar_stock");
  if (!piezas?.fn_crear) faltantes.push("la función crear_producto");
  if (!piezas?.fn_metricas) faltantes.push("la función metricas_stock");

  return { ok: faltantes.length === 0, faltantes };
}

/** Datos de conexión, sin exponer credenciales. */
async function datosDelServidor() {
  try {
    const info = await consultarUna<{ base: string; version: string }>(
      `select current_database() as base, split_part(version(), ' on ', 1) as version`
    );
    let host = "desconocido";
    try {
      host = new URL(process.env.DATABASE_URL ?? "").hostname;
    } catch {
      /* DATABASE_URL ausente o mal formada */
    }
    return { host, base: info?.base ?? "—", version: info?.version ?? "—" };
  } catch {
    return { host: "desconocido", base: "—", version: "—" };
  }
}

async function getConfiguracion() {
  await requerirSesion();

  const estructura = await verificarEstructura();
  const servidor = await datosDelServidor();

  if (!estructura.ok) {
    return {
      totales: { productos: 0, categorias: 0, movimientos: 0, inactivos: 0 },
      estructura,
      servidor,
    };
  }

  const totales = await consultarUna<{
    productos: number; categorias: number; movimientos: number; inactivos: number;
  }>(`
    select
      (select count(*)::int from "Product" where active)     as productos,
      (select count(*)::int from "Product" where not active) as inactivos,
      (select count(*)::int from "Category")                 as categorias,
      (select count(*)::int from "StockMovement")            as movimientos
  `);

  return {
    totales: totales ?? { productos: 0, categorias: 0, movimientos: 0, inactivos: 0 },
    estructura,
    servidor,
  };
}

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={<ConfiguracionLoading />}>
      <ConfiguracionData />
    </Suspense>
  );
}

async function ConfiguracionData() {
  const data = await getConfiguracion();
  return <ConfiguracionClient {...data} />;
}
