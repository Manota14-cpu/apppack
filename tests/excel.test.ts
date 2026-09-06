import { describe, expect, it } from "vitest";
import {
  construirLibroCatalogo,
  construirLibroPlantilla,
  leerCatalogo,
  construirLibroGastos,
  type GastoExportable,
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

describe("planilla de gastos", () => {
  const gastos: GastoExportable[] = [
    {
      fecha: "2026-09-05",
      categoria: "envios",
      concepto: "Flete a Rafaela",
      monto: 15000,
      metodo_pago: "efectivo",
      proveedor: "Transportes Belgrano",
      comprobante: "R-0087",
      notas: null,
      caja_numero: 2,
    },
    {
      fecha: "2026-09-01",
      categoria: "mercaderia",
      concepto: "Compra de bolsas",
      monto: 80000,
      metodo_pago: "transferencia",
      proveedor: null,
      comprobante: null,
      notas: null,
      caja_numero: null,
    },
  ];

  it("escribe la fecha como fecha, no como texto", async () => {
    // Guardada como texto no se puede ordenar ni filtrar por rango, que es lo
    // primero que uno hace al abrir el archivo.
    const hoja = (await construirLibroGastos(gastos, "Últimos 90 días")).getWorksheet("Gastos")!;
    const celda = hoja.getRow(2).getCell(1).value;
    expect(celda).toBeInstanceOf(Date);
    expect((celda as Date).getDate()).toBe(5);
    expect((celda as Date).getMonth()).toBe(8);
  });

  it("muestra la categoría en castellano, no el valor de la base", async () => {
    const hoja = (await construirLibroGastos(gastos, "x")).getWorksheet("Gastos")!;
    expect(hoja.getRow(2).getCell(3).value).toBe("Envíos y fletes");
  });

  it("el pie suma todos los gastos", async () => {
    const hoja = (await construirLibroGastos(gastos, "x")).getWorksheet("Gastos")!;
    expect(hoja.getRow(4).getCell(4).value).toBe(95_000);
  });

  it("el resumen separa la mercadería del costo de tener abierto", async () => {
    const hoja = (await construirLibroGastos(gastos, "Últimos 90 días")).getWorksheet("Resumen")!;
    const filas: unknown[] = [];
    hoja.eachRow((f) => filas.push(f.getCell(2).value));
    expect(filas).toContain(95_000); // total
    expect(filas).toContain(15_000); // operativos
    expect(filas).toContain(80_000); // mercadería
  });

  it("dice cuáles categorías restan del resultado", async () => {
    const hoja = (await construirLibroGastos(gastos, "x")).getWorksheet("Resumen")!;
    const texto = JSON.stringify(hoja.getSheetValues());
    // La columna marca cuáles restan, y la aclaración explica por qué la
    // mercadería no: el archivo se manda por mail y se lee sin la app al lado.
    expect(texto).toContain('"Mercadería y proveedores",1,80000,"No"');
    expect(texto).toContain('"Envíos y fletes",1,15000,"Sí"');
    expect(texto).toContain("no se resta del resultado");
  });

  it("sin gastos no rompe ni inventa una fila de totales", async () => {
    const libro = await construirLibroGastos([], "x");
    const hoja = libro.getWorksheet("Gastos")!;
    expect(hoja.rowCount).toBe(1); // solo el encabezado
    expect(libro.getWorksheet("Resumen")).toBeDefined();
  });
});
