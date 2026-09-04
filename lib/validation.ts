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

/** Igual que el anterior, pero un campo vacío significa «sin valor», no cero. */
const numeroOpcional = (etiqueta: string, max = 99_999_999) =>
  z
    .preprocess(
      (v) => (v === "" || v === undefined || v === null ? null : v),
      z.coerce
        .number({ message: `${etiqueta} tiene que ser un número` })
        .min(0, `${etiqueta} no puede ser negativo`)
        .max(max, `${etiqueta} es demasiado grande`)
        .transform((n) => Math.round(n))
        .nullable()
    )
    .default(null);

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Superaste el máximo de ${max} caracteres`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

/**
 * Una casilla desmarcada no viaja en el FormData: llega como `undefined`.
 * Sin este preprocesado, destildar «Destacado» no lo apagaría nunca.
 */
const casilla = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/**
 * Sugerencias de unidad, no una lista cerrada.
 *
 * En este catálogo la unidad describe el envase — "x50u", "combo", "x100u" —
 * y 28 de los 30 productos usan una forma así. Como enum habría rechazado
 * casi todo el catálogo al guardarlo; peor todavía, la tienda lee esta cadena
 * con una expresión regular para decidir qué es un pack mayorista, así que
 * normalizarla a "unidad" cambiaría lo que el cliente ve.
 */
export const UNIDADES_SUGERIDAS = [
  "unidad", "x1u", "x3u", "x5u", "x10u", "x20u", "x25u", "x50u", "x100u",
  "combo", "kg", "litro", "metro", "caja", "paquete",
] as const;

/**
 * Ilustraciones que la tienda sabe dibujar cuando el producto no tiene foto.
 *
 * La lista es exactamente la de `ILLUSTRATIONS` en la tienda, ni una más: un
 * nombre que no esté ahí cae en el dibujo genérico, así que ofrecer opciones
 * de más sería ofrecer opciones que no hacen nada. Los valores son nombres de
 * iconos de lucide; la etiqueta es lo que se lee en el desplegable.
 */
export const ICONOS = [
  { valor: "Package", etiqueta: "Bandejas y envases" },
  { valor: "CupSoda", etiqueta: "Vasos" },
  { valor: "Disc", etiqueta: "Platos" },
  { valor: "Utensils", etiqueta: "Cubiertos" },
  { valor: "ShoppingBag", etiqueta: "Bolsas" },
  { valor: "Layers", etiqueta: "Film y envoltorios" },
  { valor: "StickyNote", etiqueta: "Servilletas" },
  { valor: "ChefHat", etiqueta: "Gastronomía" },
  { valor: "PartyPopper", etiqueta: "Eventos" },
  { valor: "SprayCan", etiqueta: "Limpieza" },
] as const;

export const VALORES_ICONO = ICONOS.map((i) => i.valor) as unknown as [string, ...string[]];

/** Máximo de viñetas en la ficha del producto: más que esto no se lee. */
export const MAX_CARACTERISTICAS = 12;

/**
 * Las viñetas se editan como texto, una por línea, y se guardan como array
 * JSON — que es como la tienda las lee.
 */
export function caracteristicasDesdeTexto(texto: string): string[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, MAX_CARACTERISTICAS)
    .map((l) => l.slice(0, 160));
}

/**
 * `features` viaja como texto JSON porque Prisma declara la columna como
 * String. Puede venir mal formada si alguna vez se cargó a mano, así que esto
 * nunca tira: un producto con las viñetas rotas se edita igual.
 */
export function leerCaracteristicas(crudo: unknown): string[] {
  if (Array.isArray(crudo)) return crudo.filter((x): x is string => typeof x === "string");
  if (typeof crudo !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(crudo);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const productoSchema = z.object({
  // ── Datos básicos ──
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(160, "El nombre es demasiado largo"),
  descripcion: textoOpcional(600),
  sku: textoOpcional(64),
  codigo_barras: textoOpcional(64),
  // Los ids del catálogo de la tienda son cuid (texto), no uuid.
  categoria_id: z.string().trim().max(64).transform((v) => (v === "" ? null : v)).nullable().default(null),
  unidad_medida: z
    .string()
    .trim()
    .max(24, "La unidad es demasiado larga")
    .transform((v) => (v === "" ? "unidad" : v))
    .default("unidad"),
  precio_costo: numeroPositivo("El precio de costo"),
  precio_venta: numeroPositivo("El precio de venta"),
  stock: numeroPositivo("El stock"),
  stock_minimo: numeroPositivo("El stock mínimo"),

  // ── Comercial: lo que decide cómo se ve el producto en la tienda ──
  precio_anterior: numeroOpcional("El precio anterior"),
  destacado: casilla,
  mas_vendido: casilla,
  es_nuevo: casilla,
  cantidad_mayorista_min: numeroOpcional("La cantidad mayorista mínima", 1_000_000),
  precio_mayorista: numeroOpcional("El precio mayorista"),
  puntuacion: z.coerce
    .number({ message: "La puntuación tiene que ser un número" })
    .min(0, "La puntuación va de 0 a 5")
    .max(5, "La puntuación va de 0 a 5")
    .default(0),

  // ── Ficha web ──
  descripcion_larga: textoOpcional(4000),
  caracteristicas_texto: z.string().max(2400).default(""),
  peso_gramos: numeroOpcional("El peso", 1_000_000),
  dimensiones: textoOpcional(80),
  // `catch` en vez de fallar: un icono desconocido cae en el genérico, que es
  // lo que la tienda dibujaría igual, en lugar de trabar el guardado entero.
  icono: z.enum(VALORES_ICONO).catch("Package").default("Package"),
  meta_titulo: textoOpcional(70),
  meta_descripcion: textoOpcional(170),
});

export type DatosProducto = z.infer<typeof productoSchema>;

/**
 * El badge «-20%» y el precio tachado tienen que contar la misma historia.
 * En vez de pedir los dos por separado —que es como quedaron contradiciéndose—
 * se pide solo el precio anterior y el porcentaje sale de ahí.
 */
export function descuentoDesdePrecios(
  precioVenta: number,
  precioAnterior: number | null
): { precio_anterior: number | null; descuento: number | null } {
  if (!precioAnterior || precioAnterior <= precioVenta) return { precio_anterior: null, descuento: null };
  const pct = Math.round(((precioAnterior - precioVenta) / precioAnterior) * 100);
  // Un 0% redondeado no es una oferta: sería un badge que no dice nada.
  if (pct <= 0) return { precio_anterior: null, descuento: null };
  return { precio_anterior: precioAnterior, descuento: pct };
}

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

// ─────────────────────────  Acciones masivas  ─────────────────────────

/** Tope de productos por operación masiva, para que una acción no se eternice. */
export const MAX_SELECCION = 500;

const idsSeleccionados = z
  .array(z.string().trim().min(1).max(64))
  .min(1, "No seleccionaste ningún producto")
  .max(MAX_SELECCION, `No se pueden procesar más de ${MAX_SELECCION} productos a la vez`);

export const REDONDEOS = [1, 10, 50, 100] as const;

export const ajusteMasivoPreciosSchema = z.object({
  ids: idsSeleccionados,
  porcentaje: z.coerce
    .number({ message: "El porcentaje tiene que ser un número" })
    .min(-90, "No se puede bajar más del 90%")
    .max(500, "No se puede subir más del 500%")
    .refine((n) => n !== 0, "Un 0% no cambiaría nada"),
  // Qué precio se toca: la venta, el costo o los dos.
  aplicarA: z.enum(["venta", "costo", "ambos"]).default("venta"),
  redondeo: z.coerce
    .number()
    .refine(
      (n): n is (typeof REDONDEOS)[number] => (REDONDEOS as readonly number[]).includes(n),
      "Redondeo inválido"
    )
    .default(1),
  motivo: z.string().trim().max(200).default("Ajuste masivo de precios"),
});

export const cambioMasivoSchema = z.object({
  ids: idsSeleccionados,
  categoria_id: z.string().trim().min(1).max(64).nullable().default(null),
  destacado: z.boolean().nullable().default(null),
  mas_vendido: z.boolean().nullable().default(null),
  es_nuevo: z.boolean().nullable().default(null),
  activo: z.boolean().nullable().default(null),
});

export const costosMasivosSchema = z.object({
  costos: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        precio_costo: z.coerce.number().min(0).max(99_999_999).transform((n) => Math.round(n)),
      })
    )
    .min(1, "No cargaste ningún costo")
    .max(MAX_SELECCION, `No se pueden guardar más de ${MAX_SELECCION} costos a la vez`),
});

/** Quita acentos y deja solo letras y números, para armar códigos. */
function soloAlfanumerico(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Un SKU legible que sirva tanto de código interno como de etiqueta impresa:
 * tres letras de la categoría, tres del producto y un correlativo.
 */
export function sugerirSku(categoria: string, nombre: string, n: number): string {
  const cat = (soloAlfanumerico(categoria) + "GEN").slice(0, 3);
  const prod = (soloAlfanumerico(nombre) + "XXX").slice(0, 3);
  return `${cat}-${prod}-${String(n).padStart(3, "0")}`;
}

// ─────────────────────────────  Pedidos  ─────────────────────────────

export const estadoPedidoSchema = z.object({
  pedidoId: z.string().trim().min(1, "Pedido inválido").max(64),
  estado: z.enum(["pendiente", "preparando", "entregado", "cancelado"]),
});

// ────────────────────────────  Imágenes  ────────────────────────────

export const MAX_IMAGENES = 8;

export const imagenSchema = z.object({
  productoId: z.string().trim().min(1, "Producto inválido").max(64),
  url: z
    .string()
    .trim()
    .min(1, "Pegá la dirección de la imagen")
    .max(2000, "La dirección es demasiado larga")
    .refine(
      (v) => /^https:\/\/\S+$/i.test(v),
      "Tiene que ser una dirección que empiece con https://"
    ),
  alt: textoOpcional(160),
});

// ───────────────────────────  Importación  ───────────────────────────

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

// ───────────────────────────────  Caja  ───────────────────────────────

export const METODOS_PAGO_VALIDOS = ["efectivo", "transferencia", "tarjeta", "otro"] as const;

/** Tope de renglones por cobro: más que esto no es un mostrador, es un pedido. */
export const MAX_RENGLONES_COBRO = 60;

export const aperturaCajaSchema = z.object({
  fondo: z.coerce
    .number({ message: "El fondo tiene que ser un número" })
    .min(0, "El fondo no puede ser negativo")
    .max(99_999_999, "El fondo es demasiado grande")
    .transform((n) => Math.round(n))
    .default(0),
  nota: z.string().trim().max(200).default(""),
});

export const cierreCajaSchema = z.object({
  cajaId: z.string().trim().min(1, "Caja inválida").max(64),
  contado: z.coerce
    .number({ message: "Lo contado tiene que ser un número" })
    .min(0, "No puede ser negativo")
    .max(99_999_999, "Es demasiado grande")
    .transform((n) => Math.round(n))
    .default(0),
  nota: z.string().trim().max(400).default(""),
});

export const cobroSchema = z.object({
  cajaId: z.string().trim().min(1, "Caja inválida").max(64),
  nombre: z.string().trim().max(160).default(""),
  metodoPago: z.enum(METODOS_PAGO_VALIDOS).default("efectivo"),
  notas: z.string().trim().max(400).default(""),
  items: z
    .array(
      z.object({
        producto_id: z.string().trim().max(64).nullable().default(null),
        nombre: z.string().trim().min(1, "Falta el nombre de un renglón").max(160),
        unidad_medida: z.string().trim().max(24).default("unidad"),
        precio: z.coerce.number().min(0).max(99_999_999).transform((n) => Math.round(n)),
        cantidad: z.coerce
          .number()
          .int("La cantidad tiene que ser entera")
          .min(1, "La cantidad tiene que ser al menos 1")
          .max(1_000_000),
      })
    )
    .min(1, "No hay nada para cobrar")
    .max(MAX_RENGLONES_COBRO, `No se pueden cobrar más de ${MAX_RENGLONES_COBRO} renglones juntos`),
});

/** El total del cobro, calculado en un solo lugar para que no discrepe. */
export function totalDeCobro(items: { precio: number; cantidad: number }[]): number {
  return items.reduce((s, i) => s + i.precio * i.cantidad, 0);
}
