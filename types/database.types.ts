export interface Categoria {
  id: string;
  nombre: string;
  color: string | null;
  created_at: string;
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
  created_at: string;
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
  created_at: string;
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
  telefono: string;
  email: string | null;
  direccion: string;
  localidad: string;
  provincia: string;
  notas: string | null;
  total: number;
  created_at: string;
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
  created_at: string;
}

// ─────────────────────────────  Recuentos  ─────────────────────────────

export const ESTADOS_RECUENTO = ["abierto", "cerrado", "anulado"] as const;

export interface ItemRecuento {
  id: string;
  producto_id: string;
  nombre: string;
  sku: string | null;
  unidad_medida: string;
  /** Stock del sistema al momento de anotarse. */
  esperado: number;
  /** Lo contado de verdad. Null mientras no se haya contado. */
  contado: number | null;
}

export interface Recuento {
  id: string;
  numero: number;
  estado: string;
  nota: string | null;
  created_at: string;
  closed_at: string | null;
  items: ItemRecuento[];
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
