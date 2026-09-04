import { describe, expect, it } from "vitest";
import {
  construirLibroCatalogo,
  construirLibroPlantilla,
  leerCatalogo,
  type ProductoCatalogo,
} from "@/lib/excel-cliente";

const catalogo: ProductoCatalogo[] = [
  {
    nombre: "Bolsa camiseta 30x40",
    sku: "BOL-BOL-001",
    categoria: "Bolsas",
    unidad_medida: "x100u",
    precio_costo: 1150,
    precio_venta: 1990,
    stock: 600,
    stock_minimo: 30,
  },
  {
    nombre: "Vaso plástico 500cc",
    sku: "VAS-VAS-002",
    categoria: "Vasos",
    unidad_medida: "x50u",
    precio_costo: 800,
    precio_venta: 1250,
    stock: 340,
    stock_minimo: 0,
  },
];

/** Convierte el libro en el `File` que recibiría la importación. */
async function comoArchivo(productos: ProductoCatalogo[]): Promise<File> {
  const libro = await construirLibroCatalogo(productos);
  const buffer = await libro.xlsx.writeBuffer();
  return new File([buffer], "catalogo.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("el catálogo exportado se puede volver a importar", () => {
  it("reconoce todas las columnas que importan", async () => {
    // Los encabezados se embellecieron para que el archivo se lea mejor. Este
    // test existe porque ese cambio es exactamente el que rompería la ida y
    // vuelta sin que nadie se entere hasta intentar subirlo.
    const { columnasDetectadas } = await leerCatalogo(await comoArchivo(catalogo));
    const campos = Object.values(columnasDetectadas);
    for (const campo of ["nombre", "sku", "precio_costo", "precio_venta", "stock", "stock_minimo"]) {
      expect(campos).toContain(campo);
    }
  });

  it("devuelve exactamente los productos exportados, sin filas de más", async () => {
    // Una fila de totales al pie se leería como un producto llamado
    // "2 productos" con un stock enorme. Por eso el resumen vive en otra hoja.
    const { filas, totalFilas } = await leerCatalogo(await comoArchivo(catalogo));
    expect(totalFilas).toBe(catalogo.length);
    expect(filas.map((f) => f.nombre)).toEqual(catalogo.map((p) => p.nombre));
  });

  it("los números vuelven como números, no como el texto con signo peso", async () => {
    const { filas } = await leerCatalogo(await comoArchivo(catalogo));
    const primera = filas[0]!;
    expect(primera.precio_venta).toBe(1990);
    expect(primera.precio_costo).toBe(1150);
    expect(primera.stock).toBe(600);
    expect(primera.stock_minimo).toBe(30);
  });

  it("un stock mínimo en cero sobrevive la vuelta", async () => {
    // Es el caso que un `if (valor)` mal escrito convertiría en «sin dato».
    const { filas } = await leerCatalogo(await comoArchivo(catalogo));
    expect(filas[1]!.stock_minimo).toBe(0);
  });

  it("categoría y unidad se ignoran a propósito: la importación no las aplica", async () => {
    const { columnasIgnoradas } = await leerCatalogo(await comoArchivo(catalogo));
    expect(columnasIgnoradas).toContain("Categoría");
    expect(columnasIgnoradas).toContain("Unidad");
  });

  it("un catálogo vacío no rompe la lectura", async () => {
    const { totalFilas } = await leerCatalogo(await comoArchivo([]));
    expect(totalFilas).toBe(0);
  });
});

describe("la plantilla se puede completar e importar", () => {
  it("sus encabezados los reconoce el lector", async () => {
    const libro = await construirLibroPlantilla();
    const buffer = await libro.xlsx.writeBuffer();
    const archivo = new File([buffer], "plantilla.xlsx");
    const { columnasDetectadas, totalFilas } = await leerCatalogo(archivo);

    expect(Object.values(columnasDetectadas)).toContain("nombre");
    // La fila de ejemplo, y nada más: las instrucciones viven en otra hoja
    // justamente para que el lector —que solo mira la primera— no las tome
    // como un producto llamado "Cómo usar esta plantilla".
    expect(totalFilas).toBe(1);
  });

  it("las instrucciones están fuera de la hoja que se importa", async () => {
    const libro = await construirLibroPlantilla();
    expect(libro.worksheets[0]!.name).toBe("Productos");
    expect(libro.worksheets.map((h) => h.name)).toContain("Instrucciones");
  });
});
