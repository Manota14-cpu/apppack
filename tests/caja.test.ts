import { describe, expect, it } from "vitest";
import {
  aperturaCajaSchema,
  cierreCajaSchema,
  cobroSchema,
  MAX_RENGLONES_COBRO,
  totalDeCobro,
} from "@/lib/validation";

const item = (precio: number, cantidad: number) => ({
  producto_id: "p1",
  nombre: "Bolsa camiseta",
  unidad_medida: "x100u",
  precio,
  cantidad,
});

describe("totalDeCobro", () => {
  it("suma precio por cantidad de cada renglón", () => {
    expect(totalDeCobro([item(1990, 2), item(500, 3)])).toBe(5480);
  });

  it("un ticket vacío vale cero, no NaN", () => {
    expect(totalDeCobro([])).toBe(0);
  });

  it("el mismo cálculo que confirma el botón es el que se cobra", () => {
    // Vive en un solo lugar justamente por esto: si el total del botón y el
    // del servidor se calcularan por separado, el cliente podría pagar un
    // número distinto del que quedó registrado.
    const items = [item(1234, 7), item(99, 11)];
    expect(totalDeCobro(items)).toBe(1234 * 7 + 99 * 11);
  });
});

describe("cobroSchema", () => {
  const base = { cajaId: "c1", items: [item(1000, 1)] };

  it("acepta un cobro mínimo y pone efectivo por defecto", () => {
    const r = cobroSchema.parse(base);
    expect(r.metodoPago).toBe("efectivo");
    expect(r.nombre).toBe("");
  });

  it("rechaza un ticket vacío", () => {
    expect(cobroSchema.safeParse({ cajaId: "c1", items: [] }).success).toBe(false);
  });

  it("rechaza cantidades de cero o negativas", () => {
    expect(cobroSchema.safeParse({ ...base, items: [item(1000, 0)] }).success).toBe(false);
    expect(cobroSchema.safeParse({ ...base, items: [item(1000, -2)] }).success).toBe(false);
  });

  it("rechaza cantidades fraccionadas: no se venden media bolsa", () => {
    expect(cobroSchema.safeParse({ ...base, items: [item(1000, 1.5)] }).success).toBe(false);
  });

  it("acepta precio cero, que es una bonificación válida", () => {
    expect(cobroSchema.safeParse({ ...base, items: [item(0, 1)] }).success).toBe(true);
  });

  it("rechaza un medio de pago inventado", () => {
    expect(cobroSchema.safeParse({ ...base, metodoPago: "cripto" }).success).toBe(false);
  });

  it("corta un ticket absurdamente largo", () => {
    const muchos = Array.from({ length: MAX_RENGLONES_COBRO + 1 }, () => item(100, 1));
    expect(cobroSchema.safeParse({ ...base, items: muchos }).success).toBe(false);
  });

  it("un renglón suelto sin producto del catálogo sigue siendo válido", () => {
    // Sirve para cobrar algo que no está cargado sin frenar la venta.
    const r = cobroSchema.safeParse({
      ...base,
      items: [{ ...item(500, 1), producto_id: null }],
    });
    expect(r.success && r.data.items[0]!.producto_id).toBeNull();
  });
});

describe("apertura y cierre", () => {
  it("un fondo vacío es cero, no un error", () => {
    expect(aperturaCajaSchema.parse({}).fondo).toBe(0);
  });

  it("rechaza un fondo negativo", () => {
    expect(aperturaCajaSchema.safeParse({ fondo: -100 }).success).toBe(false);
  });

  it("redondea el efectivo contado a pesos enteros", () => {
    const r = cierreCajaSchema.parse({ cajaId: "c1", contado: "15000.6" });
    expect(r.contado).toBe(15001);
  });

  it("contar cero es válido: puede no haber quedado efectivo", () => {
    expect(cierreCajaSchema.safeParse({ cajaId: "c1", contado: 0 }).success).toBe(true);
  });
});
