import { REDONDEOS } from "@/lib/validation";

export type Redondeo = (typeof REDONDEOS)[number];

/**
 * Aplica un porcentaje y redondea al múltiplo pedido.
 *
 * Vive aparte de las acciones porque lo usan dos caminos que tienen que dar
 * exactamente el mismo número: la previsualización que ve el usuario antes de
 * confirmar, y la escritura real. Si se calcularan por separado, el "antes →
 * después" que mostró la pantalla podría no ser lo que terminó guardándose.
 */
export function nuevoPrecio(actual: number, porcentaje: number, redondeo: Redondeo): number {
  const bruto = actual * (1 + porcentaje / 100);
  const paso = redondeo > 0 ? redondeo : 1;
  const redondeado = Math.round(bruto / paso) * paso;
  // Un precio nunca baja de cero, y si había precio no se vuelve gratis.
  if (actual > 0 && redondeado <= 0) return paso;
  return Math.max(0, redondeado);
}

/** Margen sobre el precio de venta, en porcentaje. Null si no hay con qué calcularlo. */
export function margen(precioVenta: number, precioCosto: number): number | null {
  if (!precioVenta || precioVenta <= 0 || !precioCosto || precioCosto <= 0) return null;
  return Math.round(((precioVenta - precioCosto) / precioVenta) * 100);
}
