#!/usr/bin/env node
/**
 * Aplica el esquema (y opcionalmente los datos de ejemplo) a la base indicada
 * por DATABASE_URL.
 *
 *   node scripts/db.mjs setup   → aplica db/schema.sql
 *   node scripts/db.mjs seed    → aplica db/seed.sql
 *   node scripts/db.mjs check   → informa qué piezas existen
 *
 * Ambos scripts SQL son idempotentes: se pueden correr más de una vez.
 */
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Lee DATABASE_URL de .env.local o .env sin depender de otro paquete. */
function cargarUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  for (const archivo of [".env.local", ".env"]) {
    const ruta = join(raiz, archivo);
    if (!existsSync(ruta)) continue;
    const m = readFileSync(ruta, "utf8").match(/^\s*DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/m);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

const url = cargarUrl();
if (!url) {
  console.error("Falta DATABASE_URL. Copiá .env.example a .env.local y completala.");
  process.exit(1);
}

const comando = process.argv[2] ?? "setup";
const esLocal = url.includes("localhost") || url.includes("127.0.0.1");

const cliente = new pg.Client({
  connectionString: url,
  ssl: esLocal ? false : { rejectUnauthorized: true },
});

const PIEZAS = `
  select
    to_regclass('public."Product"')       is not null as "tabla Product",
    to_regclass('public."Category"')      is not null as "tabla Category",
    to_regclass('public."StockMovement"') is not null as "tabla StockMovement",
    exists (select 1 from information_schema.columns
             where table_name='Product' and column_name='minStock')  as "columna minStock",
    exists (select 1 from information_schema.columns
             where table_name='Product' and column_name='costPrice') as "columna costPrice",
    to_regclass('public."Order"')         is not null as "tabla Order",
    to_regclass('public."PriceChange"')   is not null as "tabla PriceChange",
    to_regclass('public."CashSession"')   is not null as "tabla CashSession",
    to_regprocedure('public.ajustar_stock(text,int,text,text)')       is not null as "función ajustar_stock",
    to_regprocedure('public.crear_producto(jsonb)')                   is not null as "función crear_producto",
    to_regprocedure('public.actualizar_producto(text,jsonb)')         is not null as "función actualizar_producto",
    to_regprocedure('public.crear_categoria(text,text,text)')         is not null as "función crear_categoria",
    to_regprocedure('public.cambiar_estado_pedido(text,text)')        is not null as "función cambiar_estado_pedido",
    to_regprocedure('public.abrir_caja(int,text)')                    is not null as "función abrir_caja",
    to_regprocedure('public.cobrar_mostrador(jsonb)')                 is not null as "función cobrar_mostrador",
    to_regprocedure('public.mover_caja(text,text,int,text)')          is not null as "función mover_caja",
    to_regprocedure('public.cerrar_caja(text,int,text)')              is not null as "función cerrar_caja",
    to_regprocedure('public.metricas_stock()')                        is not null as "función metricas_stock",
    exists (select 1 from pg_trigger
             where tgname = 'apppack_precio_historial' and not tgisinternal) as "disparador de precios"
`;

async function mostrarEstado() {
  const { rows } = await cliente.query(PIEZAS);
  const piezas = rows[0];
  let todoOk = true;
  for (const [nombre, existe] of Object.entries(piezas)) {
    if (!existe) todoOk = false;
    console.log(`  ${existe ? "✓" : "✗"} ${nombre}`);
  }
  return todoOk;
}

async function aplicar(archivo) {
  const ruta = join(raiz, "db", archivo);
  if (!existsSync(ruta)) {
    console.error(`No se encontró db/${archivo}`);
    process.exit(1);
  }
  console.log(`Aplicando db/${archivo}…`);
  await cliente.query(readFileSync(ruta, "utf8"));
  console.log("Listo.\n");
}

try {
  await cliente.connect();

  const { rows } = await cliente.query(
    "select current_database() as base, split_part(version(),' on ',1) as version"
  );
  console.log(`Conectado a ${new URL(url).hostname} · base "${rows[0].base}" · ${rows[0].version}\n`);

  if (comando === "setup") {
    await aplicar("schema.sql");
    console.log("Verificación:");
    const ok = await mostrarEstado();
    console.log(ok ? "\nEstructura al día." : "\nFaltan piezas — revisá los errores de arriba.");
    if (!ok) process.exitCode = 1;
  } else if (comando === "seed") {
    await aplicar("seed.sql");
    const { rows: c } = await cliente.query(`select count(*)::int as n from "Product"`);
    console.log(`Productos en el catálogo: ${c[0].n}`);
  } else if (comando === "check") {
    console.log("Estado del esquema:");
    const ok = await mostrarEstado();
    if (!ok) process.exitCode = 1;
  } else {
    console.error(`Comando desconocido: ${comando}. Usá setup, seed o check.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error("\nERROR:", error.message);
  if (error.code) console.error("Código:", error.code);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
