import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { consultarUna } from "@/lib/db";
import { estadoAvisos } from "@/lib/actions/avisos-actions";
import { ConfiguracionClient } from "./configuracion-client";
import ConfiguracionLoading from "./loading";

/** Comprueba que estén las funciones que AppPack agrega sobre el catálogo. */
async function verificarEstructura() {
  const faltantes: string[] = [];

  const piezas = await consultarUna<{
    tabla_producto: boolean;
    tabla_movimientos: boolean;
    tabla_pedidos: boolean;
    tabla_precios: boolean;
    tabla_caja: boolean;
    col_min_stock: boolean;
    col_costo: boolean;
    fn_ajustar: boolean;
    fn_crear: boolean;
    fn_actualizar: boolean;
    fn_pedido: boolean;
    fn_caja: boolean;
    fn_metricas: boolean;
    disparador_precios: boolean;
  }>(`
    select
      to_regclass('public."Product"')       is not null as tabla_producto,
      to_regclass('public."StockMovement"') is not null as tabla_movimientos,
      to_regclass('public."Order"')         is not null as tabla_pedidos,
      to_regclass('public."PriceChange"')   is not null as tabla_precios,
      to_regclass('public."CashSession"')   is not null as tabla_caja,
      exists (select 1 from information_schema.columns
               where table_name = 'Product' and column_name = 'minStock') as col_min_stock,
      exists (select 1 from information_schema.columns
               where table_name = 'Product' and column_name = 'costPrice') as col_costo,
      to_regprocedure('public.ajustar_stock(text,int,text,text)') is not null as fn_ajustar,
      to_regprocedure('public.crear_producto(jsonb)')             is not null as fn_crear,
      to_regprocedure('public.actualizar_producto(text,jsonb)')   is not null as fn_actualizar,
      to_regprocedure('public.cambiar_estado_pedido(text,text)')  is not null as fn_pedido,
      to_regprocedure('public.cobrar_mostrador(jsonb)')           is not null as fn_caja,
      to_regprocedure('public.metricas_stock()')                  is not null as fn_metricas,
      exists (select 1 from pg_trigger
               where tgname = 'apppack_precio_historial'
                 and not tgisinternal)                            as disparador_precios
  `);

  if (!piezas?.tabla_producto) faltantes.push("la tabla Product");
  if (!piezas?.tabla_movimientos) faltantes.push("la tabla StockMovement");
  if (!piezas?.tabla_pedidos) faltantes.push("la tabla Order");
  if (!piezas?.tabla_precios) faltantes.push("la tabla PriceChange");
  if (!piezas?.tabla_caja) faltantes.push("la tabla CashSession");
  if (!piezas?.col_min_stock) faltantes.push("la columna minStock");
  if (!piezas?.col_costo) faltantes.push("la columna costPrice");
  if (!piezas?.fn_ajustar) faltantes.push("la función ajustar_stock");
  if (!piezas?.fn_crear) faltantes.push("la función crear_producto");
  if (!piezas?.fn_actualizar) faltantes.push("la función actualizar_producto");
  if (!piezas?.fn_pedido) faltantes.push("la función cambiar_estado_pedido");
  if (!piezas?.fn_caja) faltantes.push("la función cobrar_mostrador");
  if (!piezas?.fn_metricas) faltantes.push("la función metricas_stock");
  if (!piezas?.disparador_precios) faltantes.push("el disparador del historial de precios");

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
      avisos: null,
    };
  }

  const avisos = await estadoAvisos();

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
    avisos,
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
