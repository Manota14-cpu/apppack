import { z } from "zod";

/**
 * Campo numérico que llega como string desde un <input type="number">.
 *
 * Se redondea a entero porque el catálogo de la tienda guarda precios y stock
 * como enteros (pesos sin centavos, unidades completas).
 */
const numeroPositivo = (etiqueta: string) =>
  z.coerce
    .number({ message: `${etiqueta} tiene que ser un número` })
    .min(0, `${etiqueta} no puede ser negativo`)
    .max(99_999_999, `${etiqueta} es demasiado grande`)
    .transform((n) => Math.round(n))
    .default(0);

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Superaste el máximo de ${max} caracteres`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

export const UNIDADES = ["unidad", "kg", "litro", "metro", "caja", "paquete"] as const;

export const productoSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(160, "El nombre es demasiado largo"),
  descripcion: textoOpcional(600),
  sku: textoOpcional(64),
  codigo_barras: textoOpcional(64),
  // Los ids del catálogo de la tienda son cuid (texto), no uuid.
  categoria_id: z.string().trim().max(64).transform((v) => (v === "" ? null : v)).nullable().default(null),
  unidad_medida: z.enum(UNIDADES).default("unidad"),
  precio_costo: numeroPositivo("El precio de costo"),
  precio_venta: numeroPositivo("El precio de venta"),
  stock: numeroPositivo("El stock"),
  stock_minimo: numeroPositivo("El stock mínimo"),
});

export const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre de la categoría es obligatorio").max(80, "El nombre es demasiado largo"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "El color no es válido")
    .nullable()
    .catch(null)
    .default(null),
});

export const ajusteStockSchema = z.object({
  productoId: z.string().trim().min(1, "Producto inválido").max(64),
  cantidad: z.coerce
    .number({ message: "La cantidad tiene que ser un número" })
    .transform((n) => Math.round(n))
    .refine((n) => n !== 0, "La cantidad no puede ser cero")
    .refine((n) => Math.abs(n) <= 1_000_000, "La cantidad es demasiado grande"),
  motivo: z.string().trim().min(1, "Indicá un motivo").max(200, "El motivo es demasiado largo"),
});

export const filaImportacionSchema = z.object({
  nombre: z.string().trim().min(1).max(160),
  sku: z.string().trim().max(64).optional(),
  precio_costo: z.coerce.number().min(0).max(99_999_999).transform((n) => Math.round(n)).optional(),
  precio_venta: z.coerce.number().min(0).max(99_999_999).transform((n) => Math.round(n)).optional(),
  stock: z.coerce.number().min(0).max(99_999_999).transform((n) => Math.round(n)).optional(),
  stock_minimo: z.coerce.number().min(0).max(99_999_999).transform((n) => Math.round(n)).optional(),
});

export type FilaImportacion = z.infer<typeof filaImportacionSchema>;

/** Tope de filas por importación, para no disparar una operación interminable. */
export const MAX_FILAS_IMPORTACION = 5000;
/** Tope de tamaño del archivo a importar (8 MB). */
export const MAX_BYTES_IMPORTACION = 8 * 1024 * 1024;

/** Convierte un FormData plano en objeto, para pasarlo por un schema de zod. */
export function formDataAObjeto(formData: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  formData.forEach((valor, clave) => {
    obj[clave] = String(valor);
  });
  return obj;
}

/** Primer mensaje de error legible de un ZodError. */
export function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Los datos ingresados no son válidos.";
}
