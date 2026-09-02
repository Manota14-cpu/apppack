/**
 * Lectura y escritura de planillas en el navegador, con exceljs.
 *
 * Reemplaza a `xlsx` (SheetJS), que tenía Prototype Pollution y ReDoS sin
 * versión corregida publicada en npm — justo en el punto donde entra un
 * archivo subido por el usuario.
 *
 * exceljs se carga con import dinámico para que no pese en el bundle inicial.
 */

export interface FilaCatalogo {
  nombre: string;
  sku?: string;
  precio_costo?: number;
  precio_venta?: number;
  stock?: number;
  stock_minimo?: number;
}

/** Encabezados que aceptamos, incluyendo los nombres habituales en listas de proveedor. */
const ALIAS: Record<string, keyof FilaCatalogo> = {
  nombre: "nombre",
  producto: "nombre",
  descripcion: "nombre",
  detalle: "nombre",
  articulo: "nombre",
  sku: "sku",
  codigo: "sku",
  cod: "sku",
  "codigo interno": "sku",
  precio_costo: "precio_costo",
  "precio costo": "precio_costo",
  costo: "precio_costo",
  "p costo": "precio_costo",
  precio_venta: "precio_venta",
  "precio venta": "precio_venta",
  precio: "precio_venta",
  venta: "precio_venta",
  "p unit": "precio_venta",
  "precio unitario": "precio_venta",
  stock: "stock",
  cantidad: "stock",
  existencia: "stock",
  stock_minimo: "stock_minimo",
  "stock minimo": "stock_minimo",
  minimo: "stock_minimo",
};

function normalizar(texto: string): string {
  return texto
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 _]/g, "")
    .replace(/\s+/g, " ");
}

function aNumero(valor: unknown): number | undefined {
  if (valor === null || valor === undefined || valor === "") return undefined;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : undefined;
  // Tolera "$ 1.234,56" y "1,234.56"
  const limpio = String(valor).replace(/[^\d,.-]/g, "");
  if (!limpio) return undefined;
  const conPunto =
    limpio.lastIndexOf(",") > limpio.lastIndexOf(".")
      ? limpio.replace(/\./g, "").replace(",", ".")
      : limpio.replace(/,/g, "");
  const n = Number(conPunto);
  return Number.isFinite(n) ? n : undefined;
}

function textoDeCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") {
    const v = valor as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return String(v.result);
  }
  return String(valor);
}

export interface ResultadoLectura {
  filas: FilaCatalogo[];
  columnasDetectadas: Record<string, string>;
  columnasIgnoradas: string[];
  totalFilas: number;
}

/** Lee la primera hoja del archivo y mapea sus columnas a los campos del catálogo. */
export async function leerCatalogo(file: File): Promise<ResultadoLectura> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();

  if (file.name.toLowerCase().endsWith(".csv")) {
    const texto = await file.text();
    const hoja = libro.addWorksheet("csv");
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
    const separador = (lineas[0]?.match(/;/g)?.length ?? 0) > (lineas[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
    lineas.forEach((linea) => {
      hoja.addRow(linea.split(separador).map((c) => c.trim().replace(/^"|"$/g, "")));
    });
  } else {
    await libro.xlsx.load(await file.arrayBuffer());
  }

  const hoja = libro.worksheets[0];
  if (!hoja) throw new Error("El archivo no tiene ninguna hoja.");

  const encabezados: string[] = [];
  hoja.getRow(1).eachCell({ includeEmpty: true }, (celda, col) => {
    encabezados[col - 1] = textoDeCelda(celda.value);
  });

  const mapa = new Map<number, keyof FilaCatalogo>();
  const columnasDetectadas: Record<string, string> = {};
  const columnasIgnoradas: string[] = [];

  encabezados.forEach((titulo, i) => {
    if (!titulo?.trim()) return;
    const campo = ALIAS[normalizar(titulo)];
    if (campo && ![...mapa.values()].includes(campo)) {
      mapa.set(i, campo);
      columnasDetectadas[titulo] = campo;
    } else {
      columnasIgnoradas.push(titulo);
    }
  });

  if (![...mapa.values()].includes("nombre")) {
    throw new Error(
      "No se encontró una columna de nombre. El archivo necesita una columna llamada «nombre», «producto» o «descripción»."
    );
  }

  const filas: FilaCatalogo[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    if (numero === 1) return;

    const registro: Partial<FilaCatalogo> = {};
    mapa.forEach((campo, indice) => {
      const valor = fila.getCell(indice + 1).value;
      if (campo === "nombre" || campo === "sku") {
        const texto = textoDeCelda(valor).trim();
        if (texto) registro[campo] = texto;
      } else {
        const n = aNumero(valor);
        if (n !== undefined) registro[campo] = n;
      }
    });

    if (registro.nombre) filas.push(registro as FilaCatalogo);
  });

  return { filas, columnasDetectadas, columnasIgnoradas, totalFilas: filas.length };
}

async function descargar(libro: import("exceljs").Workbook, nombre: string) {
  const buffer = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Plantilla vacía con los encabezados correctos y una fila de ejemplo. */
export async function descargarPlantilla() {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Productos");

  hoja.columns = [
    { header: "nombre", key: "nombre", width: 42 },
    { header: "sku", key: "sku", width: 16 },
    { header: "precio_costo", key: "precio_costo", width: 14 },
    { header: "precio_venta", key: "precio_venta", width: 14 },
    { header: "stock", key: "stock", width: 12 },
    { header: "stock_minimo", key: "stock_minimo", width: 14 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.addRow({
    nombre: "Bolsa camiseta 30x40 x100",
    sku: "BOL-001",
    precio_costo: 1150,
    precio_venta: 1890,
    stock: 95,
    stock_minimo: 30,
  });

  await descargar(libro, "apppack-plantilla-productos.xlsx");
}

/** Exporta el catálogo completo, ya listo para editar y volver a importar. */
export async function descargarCatalogo() {
  const respuesta = await fetch("/api/catalogo/exportar");
  if (!respuesta.ok) throw new Error("No se pudo obtener el catálogo.");
  const { productos } = (await respuesta.json()) as {
    productos: {
      nombre: string; sku: string | null; categoria: string | null; unidad_medida: string;
      precio_costo: number; precio_venta: number; stock: number; stock_minimo: number;
    }[];
  };

  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Productos");

  hoja.columns = [
    { header: "nombre", key: "nombre", width: 42 },
    { header: "sku", key: "sku", width: 16 },
    { header: "categoria", key: "categoria", width: 18 },
    { header: "unidad_medida", key: "unidad_medida", width: 14 },
    { header: "precio_costo", key: "precio_costo", width: 14 },
    { header: "precio_venta", key: "precio_venta", width: 14 },
    { header: "stock", key: "stock", width: 12 },
    { header: "stock_minimo", key: "stock_minimo", width: 14 },
  ];
  hoja.getRow(1).font = { bold: true };
  productos.forEach((p) => hoja.addRow(p));

  await descargar(libro, `apppack-catalogo-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
