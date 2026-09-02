import { describe, expect, it } from "vitest";
import {
  caracteristicasDesdeTexto,
  ICONOS,
  leerCaracteristicas,
  MAX_CARACTERISTICAS,
  productoSchema,
  sugerirSku,
} from "@/lib/validation";

describe("caracteristicasDesdeTexto", () => {
  it("una viñeta por línea", () => {
    expect(caracteristicasDesdeTexto("Capacidad 500cc\nPP cristal\nPack x50")).toEqual([
      "Capacidad 500cc",
      "PP cristal",
      "Pack x50",
    ]);
  });

  it("descarta líneas vacías y espacios sueltos", () => {
    expect(caracteristicasDesdeTexto("  Uno  \n\n   \nDos\n")).toEqual(["Uno", "Dos"]);
  });

  it("corta en el máximo en lugar de guardar una lista interminable", () => {
    const muchas = Array.from({ length: 40 }, (_, i) => `Item ${i}`).join("\n");
    expect(caracteristicasDesdeTexto(muchas)).toHaveLength(MAX_CARACTERISTICAS);
  });

  it("un texto vacío no deja una viñeta en blanco", () => {
    expect(caracteristicasDesdeTexto("")).toEqual([]);
    expect(caracteristicasDesdeTexto("\n\n")).toEqual([]);
  });
});

describe("leerCaracteristicas", () => {
  it("lee el JSON que guarda la columna", () => {
    expect(leerCaracteristicas('["Uno","Dos"]')).toEqual(["Uno", "Dos"]);
  });

  it("un JSON roto no rompe la edición del producto", () => {
    expect(leerCaracteristicas("[esto no es json")).toEqual([]);
    expect(leerCaracteristicas("")).toEqual([]);
    expect(leerCaracteristicas(null)).toEqual([]);
  });

  it("descarta lo que no sea texto dentro del array", () => {
    expect(leerCaracteristicas('["Uno", 5, null, "Dos"]')).toEqual(["Uno", "Dos"]);
  });

  it("ida y vuelta: lo que se escribe es lo que se lee", () => {
    const original = ["Capacidad 500cc", "Pack x50"];
    expect(leerCaracteristicas(JSON.stringify(original))).toEqual(original);
  });
});

describe("sugerirSku", () => {
  it("arma un código legible con categoría, producto y correlativo", () => {
    expect(sugerirSku("Bolsas", "Bolsa camiseta", 1)).toBe("BOL-BOL-001");
  });

  it("ignora acentos y signos", () => {
    expect(sugerirSku("Film y envoltorios", "Papel aluminio", 12)).toBe("FIL-PAP-012");
  });

  it("completa cuando el nombre es más corto que tres letras", () => {
    const sku = sugerirSku("A", "B", 3);
    expect(sku).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-003$/);
  });

  it("dos productos distintos de la misma categoría no colisionan", () => {
    expect(sugerirSku("Vasos", "Vaso 500cc", 1)).not.toBe(sugerirSku("Vasos", "Vaso 300cc", 2));
  });
});

describe("productoSchema", () => {
  const base = { nombre: "Vaso 500cc", precio_venta: "1200" };

  it("una casilla ausente significa apagada, no «sin cambio»", () => {
    // Sin este comportamiento, destildar «Destacado» no lo apagaría nunca: el
    // FormData simplemente no manda las casillas sin marcar.
    const r = productoSchema.parse(base);
    expect(r.destacado).toBe(false);
    expect(r.mas_vendido).toBe(false);
    expect(r.es_nuevo).toBe(false);
  });

  it("una casilla marcada llega como «on» y se entiende", () => {
    const r = productoSchema.parse({ ...base, destacado: "on" });
    expect(r.destacado).toBe(true);
  });

  it("un campo numérico vacío es «sin valor», no cero", () => {
    // Un peso de 0 gramos y un peso sin cargar no son lo mismo: la tienda
    // muestra el primero y omite el segundo.
    const r = productoSchema.parse({ ...base, peso_gramos: "", precio_anterior: "" });
    expect(r.peso_gramos).toBeNull();
    expect(r.precio_anterior).toBeNull();
  });

  it("redondea los precios a enteros, como los guarda la tienda", () => {
    const r = productoSchema.parse({ ...base, precio_venta: "1200.7", precio_costo: "800.2" });
    expect(r.precio_venta).toBe(1201);
    expect(r.precio_costo).toBe(800);
  });

  it("rechaza una puntuación fuera de 0 a 5", () => {
    expect(productoSchema.safeParse({ ...base, puntuacion: "9" }).success).toBe(false);
  });

  it("un icono desconocido cae en el de reserva en vez de fallar", () => {
    const r = productoSchema.parse({ ...base, icono: "IconoQueNoExiste" });
    expect(r.icono).toBe("Package");
  });

  it("el nombre es obligatorio", () => {
    expect(productoSchema.safeParse({ nombre: "   " }).success).toBe(false);
  });

  it("un texto opcional vacío se guarda como nulo, no como cadena vacía", () => {
    const r = productoSchema.parse({ ...base, sku: "  ", meta_titulo: "" });
    expect(r.sku).toBeNull();
    expect(r.meta_titulo).toBeNull();
  });
});

describe("iconos", () => {
  it("acepta los iconos que el catálogo ya usa", () => {
    // Esto lo encontró una prueba en el navegador: la lista original era
    // inventada y no incluía PartyPopper, Disc, StickyNote, ChefHat ni
    // SprayCan. Guardar cualquiera de esos 11 productos les habría cambiado
    // el dibujo por el genérico sin avisar.
    const enUso = ["Package", "ShoppingBag", "CupSoda", "Utensils", "Disc",
                   "StickyNote", "ChefHat", "SprayCan", "Layers", "PartyPopper"];
    for (const icono of enUso) {
      expect(productoSchema.parse({ nombre: "X", icono }).icono).toBe(icono);
    }
  });

  it("cada icono ofrecido tiene una etiqueta legible", () => {
    for (const i of ICONOS) {
      expect(i.etiqueta.length).toBeGreaterThan(0);
      expect(i.etiqueta).not.toBe(i.valor);
    }
  });
});
