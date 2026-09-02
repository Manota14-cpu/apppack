import { describe, expect, it } from "vitest";
import { etiquetaPeriodo, PERIODOS } from "@/lib/informes";

describe("períodos del informe", () => {
  it("«0» significa todo el historial, no cero días", () => {
    expect(etiquetaPeriodo(0)).toBe("Desde el principio");
  });

  it("nombra los rangos en castellano llano", () => {
    expect(etiquetaPeriodo(7)).toBe("Últimos 7 días");
    expect(etiquetaPeriodo(30)).toBe("Últimos 30 días");
    expect(etiquetaPeriodo(90)).toBe("Últimos 90 días");
  });

  it("cada período ofrecido tiene su etiqueta", () => {
    for (const p of PERIODOS) {
      expect(etiquetaPeriodo(p).length).toBeGreaterThan(0);
    }
  });
});
