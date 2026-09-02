/**
 * Los números del negocio, no los del inventario.
 *
 * El panel dice cómo está el stock hoy. Esto dice qué pasó: qué se vendió, qué
 * dejó margen y qué lleva meses ocupando lugar sin moverse. Recién ahora tiene
 * sentido calcularlo — hasta que los costos estuvieron cargados, cualquier
 * margen habría sido una división por un cero disfrazado.
 */

/** Ventanas de tiempo que se pueden pedir, en días. `0` es «todo». */
export const PERIODOS = [7, 30, 90, 0] as const;
export type Periodo = (typeof PERIODOS)[number];

export function etiquetaPeriodo(dias: number): string {
  if (dias === 0) return "Desde el principio";
  if (dias === 7) return "Últimos 7 días";
  if (dias === 30) return "Últimos 30 días";
  return `Últimos ${dias} días`;
}

export interface VentaProducto {
  producto_id: string | null;
  nombre: string;
  unidades: number;
  ingreso: number;
  /** Costo estimado con el costo ACTUAL del producto, no el de la venta. */
  costo: number;
  /** Null cuando el producto ya no existe o no tiene costo cargado. */
  margen: number | null;
}

export interface Inmovilizado {
  id: string;
  nombre: string;
  categoria: string;
  stock: number;
  unidad_medida: string;
  /** Plata quieta: stock por costo. */
  capital: number;
  /** Días desde el último movimiento que no sea la carga inicial. */
  dias_quieto: number | null;
}

export interface Informe {
  dias: number;
  ventas: {
    pedidos: number;
    unidades: number;
    ingreso: number;
    costo: number;
    /** Null si no hay ingreso del que calcularlo. */
    margen: number | null;
    ticket_promedio: number;
  };
  porProducto: VentaProducto[];
  inmovilizado: Inmovilizado[];
  capitalQuieto: number;
  /** Movimientos de stock del período, por tipo. */
  movimientos: { tipo: string; cantidad: number }[];
  /** Cuántas ventas hubo por fuera de la tienda, que este informe no puede valorizar. */
  salidasSinPrecio: number;
  /**
   * Productos vendidos cuyo costo deja más del 85% de margen.
   *
   * Un margen así en descartables no es un buen negocio: es un costo de
   * relleno. El informe lo dice en vez de presentar el porcentaje como si
   * fuera un hallazgo.
   */
  ventasConCostoDudoso: number;
}
