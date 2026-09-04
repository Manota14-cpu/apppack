/**
 * Cómo se escriben los números en pantalla.
 *
 * Vivía repetido en cada pantalla, y con las devoluciones esa repetición se
 * volvió un problema visible: cada copia armaba el importe pegando el signo
 * peso adelante, así que un negativo salía «$-1.000» en vez de «−$1.000».
 */

/** Un importe en pesos. El menos va antes del símbolo, como se lee. */
export function money(valor: number): string {
  const n = Number(valor) || 0;
  const absoluto = Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  // El signo es el menos tipográfico (−), no el guion del teclado: alineado
  // con los dígitos y sin partirse al final de una línea.
  return n < 0 ? `−$${absoluto}` : `$${absoluto}`;
}

/** Una cantidad, con separador de miles. */
export function cantidad(valor: number, decimales = 0): string {
  return Number(valor).toLocaleString("es-AR", { maximumFractionDigits: decimales });
}
