import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_GASTO,
  cuentaEnResultado,
  etiquetaCategoria,
  fechaLocal,
  hoyLocal,
  resumirGastos,
} from "@/lib/gastos";
import { gastoSchema } from "@/lib/validation";

describe("categorías de gasto", () => {
  it("la mercadería no se resta del resultado", () => {
    // Es la regla que evita restar la misma plata dos veces: la compra ya se
    // cuenta como costo cuando ese stock se vende.
    expect(cuentaEnResultado("mercaderia")).toBe(false);
  });

  it("todo lo demás sí se resta", () => {
    for (const c of CATEGORIAS_GASTO) {
      if (c.valor !== "mercaderia") expect(cuentaEnResultado(c.valor)).toBe(true);
    }
  });

  it("una categoría desconocida se cuenta como gasto y se muestra tal cual", () => {
    // Preferible verla rara en la lista a que desaparezca de los totales.
    expect(cuentaEnResultado("inventada")).toBe(true);
    expect(etiquetaCategoria("inventada")).toBe("inventada");
  });

  it("las categorías conocidas tienen nombre en castellano", () => {
    expect(etiquetaCategoria("envios")).toBe("Envíos y fletes");
  });

  it("no hay valores repetidos", () => {
    const valores = CATEGORIAS_GASTO.map((c) => c.valor);
    expect(new Set(valores).size).toBe(valores.length);
  });
});

describe("resumirGastos", () => {
  const gastos = [
    { categoria: "envios", monto: 5000 },
    { categoria: "servicios", monto: 12000 },
    { categoria: "mercaderia", monto: 80000 },
    { categoria: "envios", monto: 3000 },
  ];

  it("separa lo operativo de la compra de mercadería", () => {
    const r = resumirGastos(gastos);
    expect(r.total).toBe(100_000);
    expect(r.operativos).toBe(20_000);
    expect(r.mercaderia).toBe(80_000);
    expect(r.cantidad).toBe(4);
  });

  it("agrupa por categoría y ordena por monto", () => {
    const r = resumirGastos(gastos);
    expect(r.porCategoria[0]).toEqual({ categoria: "mercaderia", total: 80_000, cantidad: 1 });
    expect(r.porCategoria.find((c) => c.categoria === "envios")).toEqual({
      categoria: "envios",
      total: 8000,
      cantidad: 2,
    });
  });

  it("sin gastos da todo en cero, no NaN", () => {
    const r = resumirGastos([]);
    expect(r).toMatchObject({ total: 0, operativos: 0, mercaderia: 0, cantidad: 0 });
    expect(r.porCategoria).toEqual([]);
  });
});

describe("fechas de gasto", () => {
  it("un aaaa-mm-dd no se corre un día para atrás", () => {
    // `new Date("2026-09-06")` es medianoche UTC, que en Argentina son las 21
    // del día 5: la planilla mostraría todos los gastos un día antes.
    const d = fechaLocal("2026-09-06");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(6);
  });

  it("hoyLocal y fechaLocal son la misma fecha ida y vuelta", () => {
    const hoy = new Date();
    const d = fechaLocal(hoyLocal(hoy));
    expect(d.getDate()).toBe(hoy.getDate());
    expect(d.getMonth()).toBe(hoy.getMonth());
  });

  it("hoyLocal rellena mes y día con cero", () => {
    expect(hoyLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("gastoSchema", () => {
  const base = { fecha: "2026-01-15", categoria: "envios", concepto: "Flete", monto: "5000" };

  it("acepta un gasto mínimo y redondea el monto", () => {
    const r = gastoSchema.parse({ ...base, monto: "5000.4" });
    expect(r.monto).toBe(5000);
    expect(r.metodo_pago).toBe("efectivo");
    expect(r.proveedor).toBeNull();
    expect(r.caja_id).toBeNull();
  });

  it("un monto de cero o negativo no es un gasto", () => {
    expect(gastoSchema.safeParse({ ...base, monto: "0" }).success).toBe(false);
    expect(gastoSchema.safeParse({ ...base, monto: "-100" }).success).toBe(false);
  });

  it("hay que decir qué se pagó", () => {
    expect(gastoSchema.safeParse({ ...base, concepto: "   " }).success).toBe(false);
  });

  it("rechaza una categoría que no existe", () => {
    expect(gastoSchema.safeParse({ ...base, categoria: "cualquiera" }).success).toBe(false);
  });

  it("rechaza un día que no existe", () => {
    // Sin esto, el 31 de febrero se guardaría como 3 de marzo sin avisar.
    expect(gastoSchema.safeParse({ ...base, fecha: "2026-02-31" }).success).toBe(false);
    expect(gastoSchema.safeParse({ ...base, fecha: "15/01/2026" }).success).toBe(false);
  });

  it("rechaza una fecha futura, que casi siempre es un año mal tipeado", () => {
    expect(gastoSchema.safeParse({ ...base, fecha: "2036-01-15" }).success).toBe(false);
  });

  it("acepta hoy aunque el servidor esté en otra zona horaria", () => {
    expect(gastoSchema.safeParse({ ...base, fecha: hoyLocal() }).success).toBe(true);
  });
});
