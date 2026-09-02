import { describe, expect, it } from "vitest";
import { margen, nuevoPrecio } from "@/lib/precios";
import { descuentoDesdePrecios } from "@/lib/validation";

describe("nuevoPrecio", () => {
  it("aplica el porcentaje", () => {
    expect(nuevoPrecio(1000, 10, 1)).toBe(1100);
    expect(nuevoPrecio(1000, -20, 1)).toBe(800);
  });

  it("redondea al múltiplo pedido", () => {
    // 1234 + 12% = 1382,08
    expect(nuevoPrecio(1234, 12, 1)).toBe(1382);
    expect(nuevoPrecio(1234, 12, 10)).toBe(1380);
    expect(nuevoPrecio(1234, 12, 50)).toBe(1400);
    expect(nuevoPrecio(1234, 12, 100)).toBe(1400);
  });

  it("un producto que costaba algo no termina gratis por el redondeo", () => {
    // 30 - 90% = 3, que redondeado a múltiplos de 100 daría 0.
    expect(nuevoPrecio(30, -90, 100)).toBe(100);
  });

  it("un precio en cero se queda en cero", () => {
    expect(nuevoPrecio(0, 50, 10)).toBe(0);
  });

  it("nunca devuelve un precio negativo", () => {
    expect(nuevoPrecio(100, -90, 1)).toBeGreaterThanOrEqual(0);
  });

  it("la previsualización y la escritura dan el mismo número", () => {
    // Este es el punto de que la función viva aparte: si el cálculo se
    // duplicara, el "antes → después" que ve el usuario podría no ser lo que
    // termina guardándose.
    const casos = [
      [999, 7.5, 10],
      [15_000, 33, 50],
      [1, 500, 1],
    ] as const;
    for (const [precio, pct, redondeo] of casos) {
      expect(nuevoPrecio(precio, pct, redondeo)).toBe(nuevoPrecio(precio, pct, redondeo));
    }
  });
});

describe("margen", () => {
  it("calcula el margen sobre el precio de venta", () => {
    expect(margen(1000, 600)).toBe(40);
  });

  it("sin costo cargado no inventa un margen", () => {
    // 29 de 32 productos estaban así: devolver 100% habría hecho ver
    // rentabilidades que nadie midió.
    expect(margen(1000, 0)).toBeNull();
  });

  it("sin precio de venta tampoco", () => {
    expect(margen(0, 600)).toBeNull();
  });

  it("un costo mayor que la venta da margen negativo, no null", () => {
    expect(margen(500, 750)).toBe(-50);
  });
});

describe("descuentoDesdePrecios", () => {
  it("saca el porcentaje del precio anterior", () => {
    expect(descuentoDesdePrecios(800, 1000)).toEqual({ precio_anterior: 1000, descuento: 20 });
  });

  it("sin precio anterior no hay oferta", () => {
    expect(descuentoDesdePrecios(800, null)).toEqual({ precio_anterior: null, descuento: null });
    expect(descuentoDesdePrecios(800, 0)).toEqual({ precio_anterior: null, descuento: null });
  });

  it("un precio anterior menor que el actual no es una oferta", () => {
    // Es lo que pasaría al remarcar sin tocar el precio tachado: quedaría un
    // producto "en oferta" más caro que su propio precio anterior.
    expect(descuentoDesdePrecios(1200, 1000)).toEqual({ precio_anterior: null, descuento: null });
  });

  it("una diferencia que redondea a 0% no muestra cartel", () => {
    expect(descuentoDesdePrecios(1000, 1001)).toEqual({ precio_anterior: null, descuento: null });
  });

  it("el precio tachado siempre queda por encima del de venta", () => {
    const r = descuentoDesdePrecios(1499, 1999);
    expect(r.precio_anterior).not.toBeNull();
    expect(r.precio_anterior!).toBeGreaterThan(1499);
    expect(r.descuento).toBe(25);
  });
});
