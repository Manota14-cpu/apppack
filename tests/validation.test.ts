import { describe, expect, it } from "vitest";
import {
  ajusteStockSchema,
  categoriaSchema,
  filaImportacionSchema,
  formDataAObjeto,
  productoSchema,
} from "@/lib/validation";

// El catálogo de la tienda usa ids cuid (texto), no uuid.
const ID = "cmg0x7q2b0000v8k4h3z1a2b3";

/** Arma el objeto tal como llega desde el <form> real: todo strings. */
function form(campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  return formDataAObjeto(fd);
}

describe("productoSchema", () => {
  it("acepta un producto mínimo y aplica los valores por defecto", () => {
    const r = productoSchema.safeParse(form({ nombre: "Bolsa 30x40" }));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.nombre).toBe("Bolsa 30x40");
    expect(r.data.unidad_medida).toBe("unidad");
    expect(r.data.stock).toBe(0);
    expect(r.data.precio_venta).toBe(0);
  });

  it("rechaza el nombre vacío o solo espacios", () => {
    expect(productoSchema.safeParse(form({ nombre: "   " })).success).toBe(false);
    expect(productoSchema.safeParse(form({ nombre: "" })).success).toBe(false);
  });

  it("rechaza precios y stock negativos", () => {
    expect(productoSchema.safeParse(form({ nombre: "X", precio_venta: "-1" })).success).toBe(false);
    expect(productoSchema.safeParse(form({ nombre: "X", stock: "-5" })).success).toBe(false);
  });

  it("convierte los números que llegan como texto", () => {
    const r = productoSchema.safeParse(form({ nombre: "X", precio_venta: "1890", stock: "95" }));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.precio_venta).toBe(1890);
    expect(r.data.stock).toBe(95);
  });

  it("convierte los campos de texto vacíos en null, no en cadena vacía", () => {
    const r = productoSchema.safeParse(form({ nombre: "X", sku: "", descripcion: "" }));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.sku).toBeNull();
    expect(r.data.descripcion).toBeNull();
  });

  it("trata la categoría vacía como sin categoría", () => {
    const r = productoSchema.safeParse(form({ nombre: "X", categoria_id: "" }));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.categoria_id).toBeNull();
  });

  it("acepta las unidades de envase que usa el catálogo", () => {
    // Este test decía lo contrario: exigía que la unidad fuera de una lista
    // cerrada. Contra la base real resultó que 28 de los 30 productos usan
    // formas como "x50u" o "combo", así que el enum habría rechazado casi
    // todo el catálogo. Además la tienda lee esta cadena para decidir qué es
    // un pack mayorista, con lo cual normalizarla cambiaría lo que se ve.
    for (const unidad of ["x50u", "combo", "x100u", "x1u", "unidad"]) {
      const r = productoSchema.safeParse(form({ nombre: "X", unidad_medida: unidad }));
      expect(r.success && r.data.unidad_medida).toBe(unidad);
    }
  });

  it("una unidad vacía cae en «unidad» en vez de quedar en blanco", () => {
    const r = productoSchema.safeParse(form({ nombre: "X", unidad_medida: "  " }));
    expect(r.success && r.data.unidad_medida).toBe("unidad");
  });

  it("recorta los espacios sobrantes del nombre", () => {
    const r = productoSchema.safeParse(form({ nombre: "  Lavandina  " }));
    expect(r.success && r.data.nombre).toBe("Lavandina");
  });
});

describe("ajusteStockSchema", () => {
  it("acepta entradas y salidas", () => {
    expect(ajusteStockSchema.safeParse({ productoId: ID, cantidad: 10, motivo: "Compra" }).success).toBe(true);
    expect(ajusteStockSchema.safeParse({ productoId: ID, cantidad: -3, motivo: "Rotura" }).success).toBe(true);
  });

  it("rechaza cantidad cero: no es un movimiento", () => {
    expect(ajusteStockSchema.safeParse({ productoId: ID, cantidad: 0, motivo: "Nada" }).success).toBe(false);
  });

  it("exige un motivo", () => {
    expect(ajusteStockSchema.safeParse({ productoId: ID, cantidad: 5, motivo: "" }).success).toBe(false);
    expect(ajusteStockSchema.safeParse({ productoId: ID, cantidad: 5, motivo: "  " }).success).toBe(false);
  });

  it("rechaza un id vacío", () => {
    expect(ajusteStockSchema.safeParse({ productoId: "", cantidad: 5, motivo: "X" }).success).toBe(false);
    expect(ajusteStockSchema.safeParse({ productoId: "   ", cantidad: 5, motivo: "X" }).success).toBe(false);
  });

  it("redondea la cantidad: el stock de la tienda es entero", () => {
    const r = ajusteStockSchema.safeParse({ productoId: ID, cantidad: 2.7, motivo: "X" });
    expect(r.success && r.data.cantidad).toBe(3);
  });
});

describe("categoriaSchema", () => {
  it("acepta un color hexadecimal válido", () => {
    const r = categoriaSchema.safeParse({ nombre: "Bolsas", color: "#2E7D32" });
    expect(r.success && r.data.color).toBe("#2E7D32");
  });

  it("descarta un color inválido en vez de fallar", () => {
    const r = categoriaSchema.safeParse({ nombre: "Bolsas", color: "verde" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.color).toBeNull();
  });

  it("exige nombre", () => {
    expect(categoriaSchema.safeParse({ nombre: "" }).success).toBe(false);
  });
});

describe("filaImportacionSchema", () => {
  it("acepta una fila completa", () => {
    const r = filaImportacionSchema.safeParse({
      nombre: "Bolsa camiseta", sku: "BOL-001", precio_venta: 1890, stock: 95,
    });
    expect(r.success).toBe(true);
  });

  it("acepta una fila con solo el nombre", () => {
    expect(filaImportacionSchema.safeParse({ nombre: "Producto suelto" }).success).toBe(true);
  });

  it("rechaza una fila sin nombre", () => {
    expect(filaImportacionSchema.safeParse({ sku: "X-1", stock: 5 }).success).toBe(false);
  });

  it("rechaza stock negativo", () => {
    expect(filaImportacionSchema.safeParse({ nombre: "X", stock: -2 }).success).toBe(false);
  });
});
