import "server-only";
import pg, { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Postgres devuelve `numeric` y `bigint` como string para no perder precisión,
 * y el driver respeta eso. Sin esto, `stock <= stock_minimo` compararía textos
 * ("9" > "10" da true) y `count(*)` llegaría como "42".
 *
 * Los montos y cantidades de esta app entran de sobra en un number de JS, así
 * que se convierten una sola vez acá en lugar de recordar hacerlo en cada
 * consulta. Es también el comportamiento que tenía la API de Supabase.
 */
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v))); // numeric
pg.types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10))); // int8 / count()

/**
 * Conexión a Postgres.
 *
 * Reemplaza al cliente de Supabase: ahora se habla con la base por el protocolo
 * de Postgres, sin API REST de por medio. La cadena de conexión vive solo en el
 * servidor — nunca llega al navegador — así que no hace falta RLS.
 *
 * El pool se guarda en globalThis para que el hot reload de Next en desarrollo
 * no abra una conexión nueva en cada recarga.
 */

const globalParaPg = globalThis as unknown as { _poolAppPack?: Pool };

function crearPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta la variable de entorno DATABASE_URL. Copiala de .env.example y completala con tu cadena de Neon."
    );
  }

  return new Pool({
    connectionString,
    // Neon (y cualquier Postgres administrado) exige TLS.
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: true },
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function pool(): Pool {
  if (!globalParaPg._poolAppPack) {
    globalParaPg._poolAppPack = crearPool();
    globalParaPg._poolAppPack.on("error", (err) => {
      console.error("[db] error en una conexión inactiva:", err.message);
    });
  }
  return globalParaPg._poolAppPack;
}

/** Consulta que devuelve varias filas. */
export async function consultar<T extends QueryResultRow>(
  sql: string,
  valores: unknown[] = []
): Promise<T[]> {
  const { rows } = await pool().query<T>(sql, valores);
  return rows;
}

/** Consulta que devuelve una fila o ninguna. */
export async function consultarUna<T extends QueryResultRow>(
  sql: string,
  valores: unknown[] = []
): Promise<T | null> {
  const rows = await consultar<T>(sql, valores);
  return rows[0] ?? null;
}

/** Consulta que devuelve un único valor escalar. */
export async function consultarValor<T>(sql: string, valores: unknown[] = []): Promise<T | null> {
  const { rows } = await pool().query(sql, valores);
  const fila = rows[0];
  if (!fila) return null;
  return Object.values(fila)[0] as T;
}

/**
 * Ejecuta varias sentencias dentro de una transacción.
 * Si algo falla, se revierte todo.
 */
export async function enTransaccion<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool().connect();
  try {
    await cliente.query("begin");
    const resultado = await fn(cliente);
    await cliente.query("commit");
    return resultado;
  } catch (error) {
    await cliente.query("rollback").catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Postgres devuelve `numeric` como string para no perder precisión.
 * Estas ayudas lo normalizan antes de que llegue a la interfaz.
 */
export function aNumero(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Igual que `enTransaccion`, pero deja anotado el motivo del cambio de precio.
 *
 * El disparador `apppack_precio_historial` guarda cada cambio de `price` o
 * `costPrice` y lee el motivo de una variable de sesión. `set_config(..., true)`
 * la limita a esta transacción, así que no se filtra a la siguiente consulta
 * que reutilice la misma conexión del pool.
 */
export async function enTransaccionConMotivo<T>(
  motivo: string,
  fn: (cliente: PoolClient) => Promise<T>
): Promise<T> {
  return enTransaccion(async (cx) => {
    await cx.query("select set_config('apppack.motivo', $1, true)", [motivo.slice(0, 200)]);
    return fn(cx);
  });
}

/** Sentencia de escritura: devuelve cuántas filas tocó. */
export async function ejecutar(sql: string, valores: unknown[] = []): Promise<number> {
  const { rowCount } = await pool().query(sql, valores);
  return rowCount ?? 0;
}
