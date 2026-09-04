/**
 * Una fecha que viene de la base.
 *
 * El driver de Postgres devuelve las columnas `timestamp` como `Date`, y Next
 * las conserva al cruzar del servidor al cliente. Declararlas `string` era una
 * mentira que compilaba: `new Date(x)` funciona con las dos, así que todo
 * andaba… hasta que alguien escribió `.slice(0, 10)` sobre una fecha y reventó
 * recién al descargar un archivo. Con este tipo, eso no compila.
 */
export type Fecha = string | Date;

export interface Categoria {
  id: string;
  nombre: string;
  color: string | null;
  created_at: Fecha;
}

export interface Producto {
  id: string;
  categoria_id: string | null;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  codigo_barras: string | null;
  imagen_url: string | null;
  unidad_medida: string;
  precio_costo: number;
  precio_venta: number;
  stock: number;
  stock_minimo: number;
  activo: boolean;
  created_at: Fecha;
  updated_at: string;
}

/**
 * Campos que la tienda muestra y que hasta ahora no se podían editar en
 * ningún lado: al retirar el editor de productos de la web, AppPack se quedó
 * con nueve campos de los veintiséis que existen. Estos son los otros.
 */
export interface ProductoWeb {
  slug: string;
  descripcion_larga: string | null;
  /** Viñetas de la ficha del producto. En la base viaja como array JSON. */
  caracteristicas: string[];
  /** Precio tachado. Si está, la tienda muestra la oferta. */
  precio_anterior: number | null;
  /** Porcentaje del badge «-20%». Se calcula a partir del precio anterior. */
  descuento: number | null;
  peso_gramos: number | null;
  dimensiones: string | null;
  destacado: boolean;
  mas_vendido: boolean;
  es_nuevo: boolean;
  puntuacion: number;
  cantidad_mayorista_min: number | null;
  precio_mayorista: number | null;
  meta_titulo: string | null;
  meta_descripcion: string | null;
  /** Nombre de icono de lucide, que la tienda usa cuando no hay foto. */
  icono: string;
  /** Unidades comprometidas en pedidos. Solo informativo. */
  stock_reservado: number;
}

export interface ProductoConCategoria extends Producto, ProductoWeb {
  categorias: { nombre: string; color: string | null } | null;
  /** Cantidad de imágenes cargadas, para avisar cuáles se ven sin foto. */
  imagenes: number;
}

export interface ProductoResumen {
  id: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
  unidad_medida: string;
}

export interface MovimientoStock {
  id: string;
  producto_id: string;
  tipo: string;
  cantidad: number;
  stock_resultante: number;
  motivo: string | null;
  created_at: Fecha;
}

export interface MovimientoConProducto extends MovimientoStock {
  productos: { nombre: string; sku: string | null } | null;
}

/** Devuelto por la RPC `metricas_stock`. */
export interface MetricasStock {
  total_productos: number;
  valor_costo: number;
  valor_venta: number;
  unidades_totales: number;
  stock_bajo: number;
  sin_stock: number;
  inactivos: number;
  /** Productos activos sin precio de costo: distorsionan el valor de inventario. */
  sin_costo: number;
  /** Con un costo tan bajo respecto del precio que no puede ser real. */
  costo_dudoso: number;
  /** Productos activos sin SKU: la importación no puede actualizarlos. */
  sin_sku: number;
  /** Productos activos sin ninguna imagen: la web los muestra con un icono. */
  sin_imagen: number;
  pedidos_pendientes: number;
  productos_criticos: ProductoResumen[];
  stock_por_categoria: { categoria: string; color: string | null; unidades: number }[];
}

// ─────────────────────────────  Pedidos  ─────────────────────────────

export const ESTADOS_PEDIDO = ["pendiente", "preparando", "entregado", "cancelado"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export interface ItemPedido {
  id: string;
  producto_id: string | null;
  nombre: string;
  unidad_medida: string;
  precio: number;
  cantidad: number;
}

export interface Pedido {
  id: string;
  numero: number;
  canal: string;
  estado: string;
  tipo_cliente: string | null;
  nombre: string;
  razon_social: string | null;
  dni_cuit: string | null;
  requiere_factura: boolean;
  // Una venta de mostrador no tiene domicilio ni teléfono: son datos ausentes
  // de verdad, no cadenas vacías que finjan serlo.
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  notas: string | null;
  total: number;
  /** Medio de pago. Solo en ventas de mostrador. */
  metodo_pago: string | null;
  /** Turno de caja en el que se cobró, si fue por mostrador. */
  caja_id: string | null;
  created_at: Fecha;
  items: ItemPedido[];
}

// ─────────────────────────────  Precios  ─────────────────────────────

export interface CambioPrecio {
  id: string;
  producto_id: string;
  precio_anterior: number;
  precio_nuevo: number;
  costo_anterior: number | null;
  costo_nuevo: number | null;
  motivo: string | null;
  created_at: Fecha;
}

// ───────────────────────────────  Caja  ───────────────────────────────

export const METODOS_PAGO = ["efectivo", "transferencia", "tarjeta", "otro"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ETIQUETA_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

export interface VentaCaja {
  id: string;
  numero: number;
  nombre: string;
  total: number;
  metodo_pago: string;
  notas: string | null;
  created_at: Fecha;
  renglones: number;
  unidades: number;
}

export interface TotalesCaja {
  efectivo: number;
  transferencia: number;
  tarjeta: number;
  otro: number;
  total: number;
  cantidad: number;
}

export interface Caja {
  id: string;
  numero: number;
  estado: string;
  /** Con cuánto efectivo arrancó el turno. */
  fondo: number;
  /** Lo contado al cerrar. Null mientras siga abierta. */
  contado: number | null;
  nota: string | null;
  opened_at: Fecha;
  closed_at: Fecha | null;
  ventas: VentaCaja[];
  totales: TotalesCaja;
}

/** Un renglón del cobro, antes de confirmarlo. */
export interface ItemCobro {
  producto_id: string | null;
  nombre: string;
  unidad_medida: string;
  precio: number;
  cantidad: number;
  /** Lo que hay en góndola, para no cobrar más de lo que se puede entregar. */
  stock: number;
}

// ─────────────────────────────  Imágenes  ─────────────────────────────

export interface ImagenProducto {
  id: string;
  url: string;
  alt: string | null;
  orden: number;
}

/** Estructura de base incompleta: falta correr la migración. */
export interface EstadoMigracion {
  ok: boolean;
  detalle: string | null;
}
