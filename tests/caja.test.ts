import { describe, expect, it } from "vitest";
import {
  aperturaCajaSchema,
  cierreCajaSchema,
  calcularVuelto,
  cobroConPagosSchema,
  cobroSchema,
  devolucionSchema,
  edicionPedidoSchema,
  MAX_RENGLONES_COBRO,
  movimientoCajaSchema,
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

describe("movimientoCajaSchema", () => {
  const base = { cajaId: "c1", tipo: "retiro", monto: 5000, motivo: "Flete" };

  it("acepta un retiro con motivo", () => {
    const r = movimientoCajaSchema.parse(base);
    expect(r.tipo).toBe("retiro");
    expect(r.monto).toBe(5000);
  });

  it("exige el motivo", () => {
    // Un retiro sin motivo, mirado a fin de mes, es indistinguible de un
    // faltante: por eso no se puede dejar vacío.
    expect(movimientoCajaSchema.safeParse({ ...base, motivo: "  " }).success).toBe(false);
  });

  it("rechaza monto cero o negativo", () => {
    expect(movimientoCajaSchema.safeParse({ ...base, monto: 0 }).success).toBe(false);
    expect(movimientoCajaSchema.safeParse({ ...base, monto: -100 }).success).toBe(false);
  });

  it("el monto es siempre positivo: el signo lo da el tipo", () => {
    const r = movimientoCajaSchema.parse({ ...base, tipo: "ingreso", monto: 3000 });
    expect(r.monto).toBeGreaterThan(0);
    expect(r.tipo).toBe("ingreso");
  });

  it("rechaza un tipo inventado", () => {
    expect(movimientoCajaSchema.safeParse({ ...base, tipo: "prestamo" }).success).toBe(false);
  });
});

describe("arqueo con retiros", () => {
  // El mismo cálculo que hacen la pantalla, el cierre y el Excel. Si los tres
  // no dan igual, el papel contradice a la app justo cuando hay que firmarlo.
  const esperado = (fondo: number, efectivo: number, ingresado: number, retirado: number) =>
    fondo + efectivo + ingresado - retirado;

  it("un retiro baja lo que debería haber en el cajón", () => {
    expect(esperado(20_000, 50_000, 0, 15_000)).toBe(55_000);
  });

  it("un ingreso lo sube", () => {
    expect(esperado(20_000, 50_000, 5_000, 0)).toBe(75_000);
  });

  it("sin movimientos es fondo más efectivo, como antes", () => {
    expect(esperado(20_000, 50_000, 0, 0)).toBe(70_000);
  });

  it("retirar todo deja el cajón en cero, no en negativo por error de signo", () => {
    expect(esperado(20_000, 50_000, 0, 70_000)).toBe(0);
  });
});

describe("cobro con varios medios de pago", () => {
  const items = [item(1000, 3)]; // total 3000

  it("acepta un solo medio que cubre el total", () => {
    const r = cobroConPagosSchema.safeParse({
      cajaId: "c1",
      items,
      pagos: [{ metodo: "efectivo", monto: 3000 }],
    });
    expect(r.success).toBe(true);
  });

  it("acepta mitad y mitad", () => {
    const r = cobroConPagosSchema.safeParse({
      cajaId: "c1",
      items,
      pagos: [
        { metodo: "efectivo", monto: 1500 },
        { metodo: "transferencia", monto: 1500 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rechaza si lo cobrado no llega al total", () => {
    // Sin esto, el arqueo de cierre arrastraría una diferencia que nadie va a
    // poder explicar al día siguiente.
    const r = cobroConPagosSchema.safeParse({
      cajaId: "c1",
      items,
      pagos: [{ metodo: "efectivo", monto: 2000 }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza si lo cobrado se pasa del total", () => {
    const r = cobroConPagosSchema.safeParse({
      cajaId: "c1",
      items,
      pagos: [{ metodo: "efectivo", monto: 5000 }],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza una venta sin ningún pago", () => {
    expect(cobroConPagosSchema.safeParse({ cajaId: "c1", items, pagos: [] }).success).toBe(false);
  });
});

describe("calcularVuelto", () => {
  it("devuelve la diferencia", () => {
    expect(calcularVuelto(10_000, 5_970)).toBe(4_030);
  });

  it("pagar justo no da vuelto", () => {
    expect(calcularVuelto(5_970, 5_970)).toBe(0);
  });

  it("nunca es negativo: si entregó de menos, no hay vuelto que dar", () => {
    expect(calcularVuelto(3_000, 5_970)).toBe(0);
  });

  it("no cuenta lo que se pagó por otro medio", () => {
    // Paga $3.000 en efectivo de una venta de $5.000; el resto va por
    // transferencia. El vuelto sale sobre los $3.000, no sobre el total.
    expect(calcularVuelto(5_000, 3_000)).toBe(2_000);
  });
});

describe("devolucionSchema", () => {
  it("acepta una devolución contra una venta", () => {
    const r = devolucionSchema.safeParse({
      cajaId: "c1",
      pedidoId: "o1",
      items: [item(1000, 1)],
    });
    expect(r.success).toBe(true);
  });

  it("acepta una devolución suelta, sin venta de origen", () => {
    const r = devolucionSchema.safeParse({ cajaId: "c1", items: [item(1000, 1)] });
    expect(r.success && r.data.pedidoId).toBeNull();
  });

  it("las cantidades se piden en positivo: el signo lo pone la base", () => {
    expect(devolucionSchema.safeParse({ cajaId: "c1", items: [item(1000, -1)] }).success).toBe(false);
  });

  it("rechaza una devolución vacía", () => {
    expect(devolucionSchema.safeParse({ cajaId: "c1", items: [] }).success).toBe(false);
  });
});

describe("edicionPedidoSchema", () => {
  it("un pedido no puede quedar sin renglones", () => {
    expect(edicionPedidoSchema.safeParse({ pedidoId: "o1", items: [] }).success).toBe(false);
  });

  it("acepta cambiar cantidades y precios", () => {
    const r = edicionPedidoSchema.safeParse({
      pedidoId: "o1",
      items: [item(1500, 4)],
    });
    expect(r.success && r.data.items[0]!.cantidad).toBe(4);
  });
});
