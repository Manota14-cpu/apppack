/**
 * Qué es un gasto y cuáles cuentan para saber si el mes cerró bien.
 *
 * Vive fuera de los Server Actions a propósito: son datos y funciones puras,
 * las usan tanto el servidor como el navegador, y así se pueden probar sin
 * levantar una base.
 */

export interface CategoriaGasto {
  valor: string;
  etiqueta: string;
  /**
   * Si se resta del resultado del período.
   *
   * Comprar mercadería NO es una pérdida: son pesos que se cambiaron por
   * cajas que están en la estantería. Recién cuando esa mercadería se vende
   * se convierte en costo, y para entonces el informe ya la contó como costo
   * de lo vendido. Restarla también acá sería contar la misma plata dos veces
   * y mostrar meses en rojo que en realidad fueron buenos.
   */
  enResultado: boolean;
}

export const CATEGORIAS_GASTO: readonly CategoriaGasto[] = [
  { valor: "mercaderia", etiqueta: "Mercadería y proveedores", enResultado: false },
  { valor: "envios", etiqueta: "Envíos y fletes", enResultado: true },
  { valor: "servicios", etiqueta: "Luz, agua, internet", enResultado: true },
  { valor: "alquiler", etiqueta: "Alquiler", enResultado: true },
  { valor: "sueldos", etiqueta: "Sueldos y cargas", enResultado: true },
  { valor: "impuestos", etiqueta: "Impuestos y tasas", enResultado: true },
  { valor: "transporte", etiqueta: "Combustible y vehículo", enResultado: true },
  { valor: "mantenimiento", etiqueta: "Mantenimiento y arreglos", enResultado: true },
  { valor: "insumos", etiqueta: "Insumos y limpieza", enResultado: true },
  { valor: "bancario", etiqueta: "Comisiones y bancos", enResultado: true },
  { valor: "otro", etiqueta: "Otro", enResultado: true },
] as const;

export const VALORES_CATEGORIA_GASTO = CATEGORIAS_GASTO.map((c) => c.valor);

const POR_VALOR = new Map(CATEGORIAS_GASTO.map((c) => [c.valor, c]));

/**
 * El nombre que se muestra. Una categoría desconocida se muestra tal cual en
 * vez de desaparecer: si alguna vez entra un valor viejo o cargado a mano, es
 * mejor verlo raro que no verlo.
 */
export function etiquetaCategoria(valor: string): string {
  return POR_VALOR.get(valor)?.etiqueta ?? valor;
}

/** Si la categoría se resta del resultado. Lo desconocido se cuenta como gasto. */
export function cuentaEnResultado(valor: string): boolean {
  return POR_VALOR.get(valor)?.enResultado ?? true;
}

export const PERIODOS_GASTO = [30, 90, 365, 0] as const;

export function etiquetaPeriodoGasto(dias: number): string {
  if (dias === 0) return "Todos";
  if (dias === 365) return "Último año";
  return `Últimos ${dias} días`;
}

interface GastoSumable {
  categoria: string;
  monto: number;
}

export interface ResumenGastos {
  /** Todo lo anotado, incluida la mercadería. */
  total: number;
  /** Lo que se resta del resultado: todo menos las compras de mercadería. */
  operativos: number;
  /** Lo que se pagó a proveedores por mercadería. */
  mercaderia: number;
  cantidad: number;
  porCategoria: { categoria: string; total: number; cantidad: number }[];
}

/**
 * Suma los gastos separando lo operativo de la compra de mercadería.
 *
 * Se devuelven los tres números en vez de solo el que interesa porque el total
 * es el que responde "cuánta plata salió" y el operativo es el que responde
 * "cuánto me costó tener abierto", y confundirlos es el error que este
 * apartado existe para evitar.
 */
export function resumirGastos(gastos: GastoSumable[]): ResumenGastos {
  const porCategoria = new Map<string, { total: number; cantidad: number }>();
  let total = 0;
  let operativos = 0;
  let mercaderia = 0;

  for (const g of gastos) {
    const monto = Number(g.monto) || 0;
    total += monto;
    if (cuentaEnResultado(g.categoria)) operativos += monto;
    else mercaderia += monto;

    const actual = porCategoria.get(g.categoria) ?? { total: 0, cantidad: 0 };
    actual.total += monto;
    actual.cantidad += 1;
    porCategoria.set(g.categoria, actual);
  }

  return {
    total,
    operativos,
    mercaderia,
    cantidad: gastos.length,
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}

/** Hoy en aaaa-mm-dd y en hora local, para el valor por defecto del formulario. */
export function hoyLocal(referencia = new Date()): string {
  const mes = String(referencia.getMonth() + 1).padStart(2, "0");
  const dia = String(referencia.getDate()).padStart(2, "0");
  return `${referencia.getFullYear()}-${mes}-${dia}`;
}

/**
 * Convierte un aaaa-mm-dd en una fecha del día correcto.
 *
 * `new Date("2026-09-06")` se interpreta como medianoche UTC, que en Argentina
 * son las 21 del 5: la planilla mostraría todos los gastos un día antes. Por
 * eso se arma por partes.
 */
export function fechaLocal(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1);
}
