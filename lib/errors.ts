import "server-only";

/**
 * Traducción de errores de Postgres a mensajes que le sirvan al usuario.
 *
 * El detalle técnico se loguea en el servidor; al usuario le llega solo la
 * explicación en castellano, sin nombres de tablas ni de columnas.
 */

interface ErrorPostgres {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
  routine?: string;
}

const POR_CODIGO: Record<string, string> = {
  "23502": "Faltan datos obligatorios para guardar el registro.",
  "23503": "No se puede completar: el registro está vinculado a otro que no existe.",
  "23505": "Ya existe un producto con ese SKU. Los códigos no pueden repetirse.",
  "23514": "Alguno de los valores está fuera del rango permitido.",
  "22P02": "Alguno de los valores tiene un formato inválido.",
  "42P01": "Falta preparar la base de datos. Ejecutá la migración desde Configuración.",
  "42883": "Falta preparar la base de datos. Ejecutá la migración desde Configuración.",
  "42703": "La base no tiene la estructura esperada. Ejecutá la migración.",
  "3D000": "La base de datos indicada no existe. Revisá DATABASE_URL.",
  "28P01": "Usuario o contraseña de la base incorrectos. Revisá DATABASE_URL.",
  ECONNREFUSED: "No se pudo conectar con la base de datos.",
  ENOTFOUND: "No se encontró el servidor de la base de datos. Revisá DATABASE_URL.",
  ETIMEDOUT: "La base de datos tardó demasiado en responder.",
};

/** Mensajes que las funciones de la base emiten a propósito para el usuario final. */
const DE_NEGOCIO = ["Stock insuficiente", "Producto no encontrado"];

/** Constraints con un mensaje mejor que el genérico de su código. */
const POR_CONSTRAINT: Record<string, string> = {
  uq_productos_sku: "Ya existe un producto con ese SKU. Los códigos no pueden repetirse.",
  productos_stock_no_negativo: "El stock no puede quedar negativo.",
  productos_precios_no_negativos: "Los precios no pueden ser negativos.",
  movimientos_tipo_valido: "El tipo de movimiento no es válido.",
};

export function mensajeDeError(error: unknown, contexto: string): string {
  const err = (error ?? {}) as ErrorPostgres;

  console.error(`[${contexto}]`, {
    code: err.code,
    constraint: err.constraint,
    message: err.message,
    detail: err.detail,
  });

  const original = err.message ?? "";

  const negocio = DE_NEGOCIO.find((m) => original.includes(m));
  if (negocio) return original.slice(original.indexOf(negocio));

  if (err.constraint && POR_CONSTRAINT[err.constraint]) return POR_CONSTRAINT[err.constraint]!;
  if (err.code && POR_CODIGO[err.code]) return POR_CODIGO[err.code]!;

  if (/DATABASE_URL/.test(original)) return original;

  return "No se pudo completar la operación. Revisá los datos e intentá de nuevo.";
}

export function fallo(error: unknown, contexto: string): { success: false; error: string } {
  return { success: false, error: mensajeDeError(error, contexto) };
}

export function falloDeValidacion(mensaje: string): { success: false; error: string } {
  return { success: false, error: mensaje };
}
