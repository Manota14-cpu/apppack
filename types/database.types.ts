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

export interface ProductoConCategoria extends Producto {
  categorias: { nombre: string; color: string | null } | null;
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
  productos_criticos: ProductoResumen[];
  stock_por_categoria: { categoria: string; color: string | null; unidades: number }[];
}

/** Estructura de base incompleta: falta correr la migración. */
export interface EstadoMigracion {
  ok: boolean;
  detalle: string | null;
}
