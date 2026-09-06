import { describe, expect, it } from "vitest";
import { normalizarNumero, parsearNumero, tieneSeparadores } from "@/lib/monto";

describe("parsearNumero", () => {
  it("lee un importe escrito como se escribe acá", () => {
    // El caso que rompía: el campo quedaba vacío y no se podía anotar el gasto.
    expect(parsearNumero("169.261,00")).toBe(169261);
    expect(parsearNumero("1.234.567,89")).toBe(1234567.89);
  });

  it("un punto seguido de tres dígitos son miles, no decimales", () => {
    // Este es el que hacía daño en silencio: el navegador leía 169,261 pesos
    // como ciento sesenta y nueve, y lo guardaba sin quejarse.
    expect(parsearNumero("169.261")).toBe(169261);
    expect(parsearNumero("1.500")).toBe(1500);
    expect(parsearNumero("1.234.567")).toBe(1234567);
  });

  it("uno o dos dígitos después del separador son decimales", () => {
    expect(parsearNumero("169,26")).toBe(169.26);
    expect(parsearNumero("1500,5")).toBe(1500.5);
    expect(parsearNumero("169.26")).toBe(169.26);
  });

  it("entiende también el formato en inglés", () => {
    // Sale así de cualquier planilla o sistema en inglés; manda el separador
    // que aparece último.
    expect(parsearNumero("1,234.56")).toBe(1234.56);
    expect(parsearNumero("169,261")).toBe(169261);
  });

  it("ignora el signo peso y los espacios", () => {
    expect(parsearNumero("$ 169.261,00")).toBe(169261);
    expect(parsearNumero(" 1.500 ")).toBe(1500);
    expect(parsearNumero("$1.500.-")).toBe(1500);
  });

  it("un número sin separadores se lee tal cual", () => {
    expect(parsearNumero("169261")).toBe(169261);
    expect(parsearNumero("0")).toBe(0);
  });

  it("acepta negativos", () => {
    expect(parsearNumero("-1.500")).toBe(-1500);
  });

  it("sin número devuelve null, no cero", () => {
    // Cero y «vacío» no significan lo mismo: un campo opcional en blanco tiene
    // que quedar sin valor, no en cero.
    expect(parsearNumero("")).toBeNull();
    expect(parsearNumero("   ")).toBeNull();
    expect(parsearNumero("abc")).toBeNull();
    expect(parsearNumero(",")).toBeNull();
  });

  it("no se rompe con null o undefined", () => {
    expect(parsearNumero(null as unknown as string)).toBeNull();
    expect(parsearNumero(undefined as unknown as string)).toBeNull();
  });
});

describe("normalizarNumero", () => {
  it("devuelve un número plano, listo para el servidor", () => {
    expect(normalizarNumero("169.261,00")).toBe("169261");
    expect(normalizarNumero("1.234,50")).toBe("1234.5");
  });

  it("vacío sigue siendo vacío", () => {
    expect(normalizarNumero("")).toBe("");
    expect(normalizarNumero("abc")).toBe("");
  });

  it("lo normalizado se vuelve a leer igual", () => {
    for (const t of ["169.261,00", "1.500", "1,234.56", "0", "-1.500"]) {
      expect(parsearNumero(normalizarNumero(t))).toBe(parsearNumero(t));
    }
  });
});

describe("tieneSeparadores", () => {
  it("detecta cuándo mostrarle al usuario qué entendimos", () => {
    expect(tieneSeparadores("169.261")).toBe(true);
    expect(tieneSeparadores("1500,5")).toBe(true);
    expect(tieneSeparadores("169261")).toBe(false);
    expect(tieneSeparadores("")).toBe(false);
  });
});
