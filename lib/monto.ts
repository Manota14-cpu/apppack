/**
 * Leer un número escrito como se escribe en Argentina.
 *
 * `<input type="number">` solo entiende el formato del inglés: el punto es la
 * coma decimal y no existe separador de miles. Escribir «169.261,00» dejaba el
 * campo vacío, y —mucho peor— «169.261» se guardaba como ciento sesenta y
 * nueve pesos sin avisar nada, porque para el navegador ese punto era un
 * decimal perfectamente válido.
 *
 * Acá el texto se lee entero y se decide qué es cada separador, en vez de
 * confiar en el navegador.
 */

/** Todo lo que no sea dígito, separador o signo se descarta: «$ 169.261,00». */
const RUIDO = /[^0-9.,-]/g;

/**
 * Convierte lo escrito en un número, o `null` si no hay ninguno.
 *
 * Reglas, en orden:
 *
 * 1. Si están el punto y la coma, manda el que aparece último: es el decimal,
 *    y el otro es separador de miles. Así entran tanto «1.234,56» como el
 *    «1,234.56» que sale de cualquier sistema en inglés.
 * 2. Si hay un solo tipo de separador y aparece más de una vez, son miles:
 *    «1.234.567».
 * 3. Si aparece una sola vez, decide cuántos dígitos lo siguen. Exactamente
 *    tres son miles («169.261», «1.500»); uno o dos son decimales («169,26»).
 *    Nadie escribe pesos con tres decimales, así que la regla no se cruza con
 *    ningún uso real.
 */
export function parsearNumero(texto: string): number | null {
  const limpio = String(texto ?? "").replace(RUIDO, "");
  if (!limpio) return null;

  const negativo = limpio.startsWith("-");
  const cuerpo = limpio.replace(/-/g, "");
  if (!cuerpo) return null;

  const puntos = (cuerpo.match(/\./g) ?? []).length;
  const comas = (cuerpo.match(/,/g) ?? []).length;

  let normalizado: string;

  if (puntos > 0 && comas > 0) {
    const decimal = cuerpo.lastIndexOf(".") > cuerpo.lastIndexOf(",") ? "." : ",";
    const miles = decimal === "." ? "," : ".";
    normalizado = cuerpo.split(miles).join("").replace(decimal, ".");
  } else if (puntos + comas === 0) {
    normalizado = cuerpo;
  } else {
    const sep = puntos > 0 ? "." : ",";
    const veces = puntos + comas;
    const despues = cuerpo.length - cuerpo.lastIndexOf(sep) - 1;
    normalizado =
      veces > 1 || despues === 3
        ? cuerpo.split(sep).join("") // separador de miles
        : cuerpo.replace(sep, "."); // separador decimal
  }

  const n = Number.parseFloat(normalizado);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * El texto que se manda al servidor: un número plano, sin separadores.
 *
 * Vacío cuando no hay nada escrito, para que un campo opcional siga
 * significando «sin valor» y no cero.
 */
export function normalizarNumero(texto: string): string {
  const n = parsearNumero(texto);
  return n === null ? "" : String(n);
}

/** Si lo escrito usa separadores, conviene mostrarle al usuario qué entendimos. */
export function tieneSeparadores(texto: string): boolean {
  return /[.,]/.test(String(texto ?? ""));
}
