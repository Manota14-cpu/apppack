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

// ─────────────────────────  Presentación  ─────────────────────────
//
// Todas las planillas se ven igual: encabezado verde fijo, filtro, montos con
// signo peso y separador de miles, fechas como fechas de verdad. Lo último no
// es cosmético — una fecha guardada como texto no se puede ordenar ni filtrar
// por rango, que es lo primero que uno hace al abrir el archivo.

type Fecha = string | Date;

const PESOS = '"$"#,##0';
const ENTERO = "#,##0";
const FECHA_HORA = "dd/mm/yyyy hh:mm";

/** El verde de la marca, para que el archivo se reconozca como del negocio. */
const VERDE = "FF0E653B";
const FILA_ALTERNA = "FFF4F6F3";
const BORDE = "FFDDE2DB";

type Alineacion = "left" | "right" | "center";

interface Columna {
  titulo: string;
  clave: string;
  ancho: number;
  formato?: string;
  alinear?: Alineacion;
}

type Hoja = import("exceljs").Worksheet;
type Libro = import("exceljs").Workbook;

/**
 * Escribe el encabezado y deja la hoja lista para recibir filas.
 *
 * `filaInicial` existe porque el catálogo se vuelve a importar y su lector
 * espera los encabezados en la fila 1; las planillas que solo se leen pueden
 * darse el lujo de un título arriba.
 */
function encabezar(hoja: Hoja, columnas: Columna[], filaInicial = 1) {
  hoja.columns = columnas.map((c) => ({ key: c.clave, width: c.ancho }));

  const fila = hoja.getRow(filaInicial);
  columnas.forEach((c, i) => {
    const celda = fila.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    celda.alignment = { vertical: "middle", horizontal: c.alinear ?? "left" };
  });
  fila.height = 22;

  // El encabezado queda a la vista al bajar, y el filtro permite ordenar sin
  // tener que seleccionar el rango a mano.
  hoja.views = [{ state: "frozen", ySplit: filaInicial }];
  hoja.autoFilter = {
    from: { row: filaInicial, column: 1 },
    to: { row: filaInicial, column: columnas.length },
  };
}

/** Aplica formato de número, alineación y rayado a las filas ya escritas. */
function pintarCuerpo(hoja: Hoja, columnas: Columna[], desde: number, hasta: number) {
  for (let n = desde; n <= hasta; n++) {
    const fila = hoja.getRow(n);
    const alterna = (n - desde) % 2 === 1;

    columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1);
      if (c.formato) celda.numFmt = c.formato;
      celda.alignment = { vertical: "middle", horizontal: c.alinear ?? "left" };
      if (alterna) {
        celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILA_ALTERNA } };
      }
      celda.border = { bottom: { style: "hair", color: { argb: BORDE } } };
    });
  }
}

/** Fila de totales al pie, para no tener que sumar a mano. */
function totalizar(
  hoja: Hoja,
  columnas: Columna[],
  valores: Record<string, string | number>
) {
  const fila = hoja.addRow(valores);
  columnas.forEach((c, i) => {
    const celda = fila.getCell(i + 1);
    celda.font = { bold: true };
    if (c.formato && typeof celda.value === "number") celda.numFmt = c.formato;
    celda.alignment = { vertical: "middle", horizontal: c.alinear ?? "left" };
    celda.border = { top: { style: "thin", color: { argb: VERDE } } };
  });
  return fila;
}

/** Título de sección dentro de una hoja de bloques. */
function titulo(hoja: Hoja, texto: string, ancho: number) {
  const fila = hoja.addRow([texto]);
  hoja.mergeCells(fila.number, 1, fila.number, ancho);
  const celda = fila.getCell(1);
  celda.font = { bold: true, size: 12, color: { argb: VERDE } };
  celda.alignment = { vertical: "middle" };
  fila.height = 20;
  return fila;
}

/** Par etiqueta / valor, con el número alineado a la derecha. */
function dato(
  hoja: Hoja,
  etiqueta: string,
  valor: string | number | Date | null,
  formato?: string
) {
  const fila = hoja.addRow([etiqueta, valor ?? "—"]);
  fila.getCell(1).font = { color: { argb: "FF55605A" } };
  const v = fila.getCell(2);
  if (formato && typeof valor === "number") v.numFmt = formato;
  v.alignment = { horizontal: "right" };
  v.font = { bold: true };
  return fila;
}

/** Primera letra en mayúscula, para no mostrar los valores crudos de la base. */
function comoTitulo(texto: string): string {
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ETIQUETA_MEDIO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

async function descargar(libro: Libro, nombre: string) {
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

/** aaaa-mm-dd en hora local, para nombrar archivos. */
function soloElDia(valor: Fecha): string {
  const d = new Date(valor);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// ─────────────────────────────  Catálogo  ─────────────────────────────
//
// Estas dos hojas se vuelven a importar, así que los encabezados van en la
// fila 1 y con nombres que el lector reconoce. Se puede embellecer el formato
// —y conviene— pero no los títulos.

const COLUMNAS_CATALOGO: Columna[] = [
  { titulo: "Nombre", clave: "nombre", ancho: 42 },
  { titulo: "SKU", clave: "sku", ancho: 16 },
  { titulo: "Categoría", clave: "categoria", ancho: 22 },
  { titulo: "Unidad", clave: "unidad_medida", ancho: 12, alinear: "center" },
  { titulo: "Precio costo", clave: "precio_costo", ancho: 14, formato: PESOS, alinear: "right" },
  { titulo: "Precio venta", clave: "precio_venta", ancho: 14, formato: PESOS, alinear: "right" },
  { titulo: "Stock", clave: "stock", ancho: 12, formato: ENTERO, alinear: "right" },
  { titulo: "Stock mínimo", clave: "stock_minimo", ancho: 14, formato: ENTERO, alinear: "right" },
];

export async function construirLibroPlantilla(): Promise<Libro> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Productos");

  const columnas = COLUMNAS_CATALOGO.filter((c) => c.clave !== "categoria");
  encabezar(hoja, columnas);

  hoja.addRow({
    nombre: "Bolsa camiseta 30x40 x100",
    sku: "BOL-001",
    unidad_medida: "x100u",
    precio_costo: 1150,
    precio_venta: 1890,
    stock: 95,
    stock_minimo: 30,
  });
  pintarCuerpo(hoja, columnas, 2, 2);

  // Las instrucciones van en otra hoja a propósito: la importación lee solo
  // la primera, y una nota suelta ahí se leería como un producto más.
  const guia = libro.addWorksheet("Instrucciones");
  guia.getColumn(1).width = 96;
  const lineas = [
    "Cómo usar esta plantilla",
    "",
    "1. Borrá la fila de ejemplo de la hoja «Productos».",
    "2. Cargá un producto por fila. Solo «Nombre» es obligatorio.",
    "3. Guardá el archivo e importalo desde Productos → Importar.",
    "",
    "El SKU es la llave. Si coincide con el de un producto que ya existe, la",
    "importación lo actualiza; si está vacío, crea uno nuevo. Por eso conviene",
    "exportar el catálogo, editarlo y volver a subirlo, en vez de partir de cero.",
    "",
    "Si cambiás el stock, la diferencia queda registrada como un movimiento,",
    "igual que si la hubieras cargado a mano.",
  ];
  lineas.forEach((texto, i) => {
    const fila = guia.addRow([texto]);
    if (i === 0) fila.getCell(1).font = { bold: true, size: 13, color: { argb: VERDE } };
    else fila.getCell(1).font = { color: { argb: "FF33403A" } };
  });

  return libro;
}

/** Plantilla vacía con los encabezados correctos y una fila de ejemplo. */
export async function descargarPlantilla() {
  const libro = await construirLibroPlantilla();
  await descargar(libro, "apppack-plantilla-productos.xlsx");
}

export interface ProductoCatalogo {
  nombre: string;
  sku: string | null;
  categoria: string | null;
  unidad_medida: string;
  precio_costo: number;
  precio_venta: number;
  stock: number;
  stock_minimo: number;
}

/**
 * Arma el libro del catálogo, sin descargarlo.
 *
 * Está separado de `descargarCatalogo` para poder comprobar en una prueba que
 * lo que sale se puede volver a leer: este archivo es el único que hace ida y
 * vuelta, y romper esa propiedad no se notaría hasta que alguien lo importe.
 */
export async function construirLibroCatalogo(productos: ProductoCatalogo[]): Promise<Libro> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Productos");

  encabezar(hoja, COLUMNAS_CATALOGO);
  productos.forEach((p) => hoja.addRow(p));
  pintarCuerpo(hoja, COLUMNAS_CATALOGO, 2, productos.length + 1);

  // Sin fila de totales: este archivo está pensado para editarlo y volver a
  // subirlo, y el lector tomaría ese pie como un producto más. El resumen va
  // en su propia hoja, donde no molesta.
  const resumen = libro.addWorksheet("Resumen");
  resumen.getColumn(1).width = 30;
  resumen.getColumn(2).width = 18;
  const unidades = productos.reduce((s, p) => s + p.stock, 0);
  const valorCosto = productos.reduce((s, p) => s + p.stock * p.precio_costo, 0);
  const valorVenta = productos.reduce((s, p) => s + p.stock * p.precio_venta, 0);
  titulo(resumen, "Resumen del catálogo", 2);
  dato(resumen, "Productos", productos.length, ENTERO);
  dato(resumen, "Unidades en stock", unidades, ENTERO);
  dato(resumen, "Valor a precio de costo", valorCosto, PESOS);
  dato(resumen, "Valor a precio de venta", valorVenta, PESOS);
  dato(resumen, "Sin SKU", productos.filter((p) => !p.sku).length, ENTERO);
  dato(resumen, "Exportado", new Date()).getCell(2).numFmt = FECHA_HORA;

  return libro;
}

/** Exporta el catálogo completo, ya listo para editar y volver a importar. */
export async function descargarCatalogo() {
  const respuesta = await fetch("/api/catalogo/exportar");
  if (!respuesta.ok) throw new Error("No se pudo obtener el catálogo.");
  const { productos } = (await respuesta.json()) as { productos: ProductoCatalogo[] };

  const libro = await construirLibroCatalogo(productos);
  await descargar(libro, `apppack-catalogo-${soloElDia(new Date())}.xlsx`);
}

// ─────────────────────────────  Pedidos  ─────────────────────────────

export interface PedidoExportable {
  numero: number;
  estado: string;
  canal: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  localidad: string | null;
  provincia: string | null;
  metodo_pago: string | null;
  pagos: { metodo: string; monto: number }[];
  notas: string | null;
  total: number;
  created_at: Fecha;
  items: { nombre: string; unidad_medida: string; precio: number; cantidad: number }[];
}

const COLUMNAS_PEDIDOS: Columna[] = [
  { titulo: "N°", clave: "numero", ancho: 8, formato: ENTERO, alinear: "right" },
  { titulo: "Fecha", clave: "fecha", ancho: 18, formato: FECHA_HORA },
  { titulo: "Estado", clave: "estado", ancho: 14 },
  { titulo: "Canal", clave: "canal", ancho: 13 },
  { titulo: "Cliente", clave: "nombre", ancho: 26 },
  { titulo: "Teléfono", clave: "telefono", ancho: 16 },
  { titulo: "Dirección", clave: "direccion", ancho: 30 },
  { titulo: "Localidad", clave: "localidad", ancho: 16 },
  { titulo: "Medio de pago", clave: "metodo_pago", ancho: 16 },
  { titulo: "Detalle del pago", clave: "detalle_pago", ancho: 34 },
  { titulo: "Renglones", clave: "renglones", ancho: 11, formato: ENTERO, alinear: "right" },
  { titulo: "Unidades", clave: "unidades", ancho: 11, formato: ENTERO, alinear: "right" },
  { titulo: "Total", clave: "total", ancho: 14, formato: PESOS, alinear: "right" },
  { titulo: "Notas", clave: "notas", ancho: 34 },
];

const COLUMNAS_RENGLONES: Columna[] = [
  { titulo: "Pedido", clave: "numero", ancho: 9, formato: ENTERO, alinear: "right" },
  { titulo: "Fecha", clave: "fecha", ancho: 18, formato: FECHA_HORA },
  { titulo: "Estado", clave: "estado", ancho: 14 },
  { titulo: "Producto", clave: "producto", ancho: 42 },
  { titulo: "Unidad", clave: "unidad", ancho: 12, alinear: "center" },
  { titulo: "Cantidad", clave: "cantidad", ancho: 11, formato: ENTERO, alinear: "right" },
  { titulo: "Precio unitario", clave: "precio", ancho: 16, formato: PESOS, alinear: "right" },
  { titulo: "Subtotal", clave: "subtotal", ancho: 15, formato: PESOS, alinear: "right" },
];

/**
 * Exporta pedidos en dos hojas.
 *
 * Una fila por pedido no alcanza para revisar qué se vendió, y una fila por
 * renglón hace imposible sumar totales sin contarlos dos veces. Con las dos
 * hojas cada pregunta tiene su tabla, y ninguna miente por agregación.
 */
export async function construirLibroPedidos(pedidos: PedidoExportable[]): Promise<Libro> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();

  const hoja = libro.addWorksheet("Pedidos");
  encabezar(hoja, COLUMNAS_PEDIDOS);

  const detalle = libro.addWorksheet("Renglones");
  encabezar(detalle, COLUMNAS_RENGLONES);

  for (const p of pedidos) {
    const unidades = p.items.reduce((s, i) => s + i.cantidad, 0);
    hoja.addRow({
      numero: p.numero,
      fecha: new Date(p.created_at),
      estado: comoTitulo(p.estado),
      canal: comoTitulo(p.canal),
      nombre: p.nombre,
      telefono: p.telefono ?? "—",
      direccion: p.direccion ?? "—",
      localidad: p.localidad ?? "—",
      metodo_pago: p.metodo_pago ? (ETIQUETA_MEDIO[p.metodo_pago] ?? p.metodo_pago) : "—",
      // Con un solo medio la columna anterior ya lo dice; el detalle importa
      // cuando la venta se pagó con varios.
      detalle_pago:
        p.pagos.length > 1
          ? p.pagos
              .map((g) => `${ETIQUETA_MEDIO[g.metodo] ?? g.metodo} ${g.monto.toLocaleString("es-AR")}`)
              .join(" + ")
          : "",
      renglones: p.items.length,
      unidades,
      total: p.total,
      notas: p.notas ?? "",
    });

    for (const i of p.items) {
      detalle.addRow({
        numero: p.numero,
        fecha: new Date(p.created_at),
        estado: comoTitulo(p.estado),
        producto: i.nombre,
        unidad: i.unidad_medida,
        cantidad: i.cantidad,
        precio: i.precio,
        subtotal: i.precio * i.cantidad,
      });
    }
  }

  pintarCuerpo(hoja, COLUMNAS_PEDIDOS, 2, pedidos.length + 1);
  const totalRenglones = pedidos.reduce((s, p) => s + p.items.length, 0);
  pintarCuerpo(detalle, COLUMNAS_RENGLONES, 2, totalRenglones + 1);

  if (pedidos.length > 0) {
    // Los cancelados no suman: si contaran, el total del pie diría que se
    // vendió plata que volvió al stock.
    const vigentes = pedidos.filter((p) => p.estado !== "cancelado");
    totalizar(hoja, COLUMNAS_PEDIDOS, {
      nombre: `Total de ${vigentes.length} ${vigentes.length === 1 ? "pedido" : "pedidos"} (sin cancelados)`,
      unidades: vigentes.reduce((s, p) => s + p.items.reduce((t, i) => t + i.cantidad, 0), 0),
      renglones: vigentes.reduce((s, p) => s + p.items.length, 0),
      total: vigentes.reduce((s, p) => s + p.total, 0),
    });

    totalizar(detalle, COLUMNAS_RENGLONES, {
      producto: "Total (sin cancelados)",
      cantidad: vigentes.reduce((s, p) => s + p.items.reduce((t, i) => t + i.cantidad, 0), 0),
      subtotal: vigentes.reduce(
        (s, p) => s + p.items.reduce((t, i) => t + i.precio * i.cantidad, 0),
        0
      ),
    });
  }

  return libro;
}

export async function descargarPedidos(pedidos: PedidoExportable[], sufijo = "") {
  const libro = await construirLibroPedidos(pedidos);
  const hoy = soloElDia(new Date());
  await descargar(libro, `apppack-pedidos${sufijo ? `-${sufijo}` : ""}-${hoy}.xlsx`);
}

// ───────────────────────────────  Caja  ───────────────────────────────

export interface CajaExportable {
  numero: number;
  estado: string;
  fondo: number;
  contado: number | null;
  nota: string | null;
  opened_at: Fecha;
  closed_at: Fecha | null;
  totales: {
    efectivo: number;
    transferencia: number;
    tarjeta: number;
    otro: number;
    total: number;
    cantidad: number;
  };
  retirado: number;
  ingresado: number;
  movimientos: {
    tipo: string;
    monto: number;
    motivo: string;
    created_at: Fecha;
  }[];
  ventas: {
    numero: number;
    nombre: string;
    total: number;
    metodo_pago: string;
    notas: string | null;
    created_at: Fecha;
    renglones: number;
    unidades: number;
  }[];
}

const COLUMNAS_VENTAS_CAJA: Columna[] = [
  { titulo: "N°", clave: "numero", ancho: 8, formato: ENTERO, alinear: "right" },
  { titulo: "Hora", clave: "hora", ancho: 18, formato: FECHA_HORA },
  { titulo: "Cliente", clave: "cliente", ancho: 26 },
  { titulo: "Medio de pago", clave: "medio", ancho: 16 },
  { titulo: "Renglones", clave: "renglones", ancho: 11, formato: ENTERO, alinear: "right" },
  { titulo: "Unidades", clave: "unidades", ancho: 11, formato: ENTERO, alinear: "right" },
  { titulo: "Total", clave: "total", ancho: 14, formato: PESOS, alinear: "right" },
  { titulo: "Notas", clave: "notas", ancho: 30 },
];

const ANCHO_ARQUEO = 4;

/**
 * El turno de caja: el arqueo arriba, después los movimientos y las ventas.
 *
 * Va en dos hojas: la primera es la que se mira e imprime al cerrar, la
 * segunda es el detalle de cada cobro. La diferencia se pinta —roja si falta,
 * verde si sobra— porque es el único número del archivo que exige una
 * explicación.
 */
export async function construirLibroCaja(caja: CajaExportable): Promise<Libro> {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();

  // ── Hoja 1: el arqueo ──
  const hoja = libro.addWorksheet("Arqueo");
  hoja.getColumn(1).width = 30;
  hoja.getColumn(2).width = 18;
  hoja.getColumn(3).width = 22;
  hoja.getColumn(4).width = 30;

  const cabecera = hoja.addRow([`Turno de caja #${caja.numero}`]);
  hoja.mergeCells(cabecera.number, 1, cabecera.number, ANCHO_ARQUEO);
  const t = cabecera.getCell(1);
  t.value = `Turno de caja #${caja.numero}`;
  t.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  cabecera.height = 30;

  hoja.addRow([]);
  dato(hoja, "Estado", comoTitulo(caja.estado));
  dato(hoja, "Abierta", new Date(caja.opened_at)).getCell(2).numFmt = FECHA_HORA;
  if (caja.closed_at) {
    dato(hoja, "Cerrada", new Date(caja.closed_at)).getCell(2).numFmt = FECHA_HORA;
  } else {
    dato(hoja, "Cerrada", "Sigue abierta");
  }
  if (caja.nota) dato(hoja, "Nota", caja.nota);

  hoja.addRow([]);
  titulo(hoja, "Efectivo en el cajón", ANCHO_ARQUEO);
  dato(hoja, "Fondo inicial", caja.fondo, PESOS);
  dato(hoja, "Cobrado en efectivo", caja.totales.efectivo, PESOS);
  dato(hoja, "Agregado durante el turno", caja.ingresado, PESOS);
  dato(hoja, "Retirado durante el turno", -caja.retirado, PESOS);

  const esperado = caja.fondo + caja.totales.efectivo + caja.ingresado - caja.retirado;
  const filaEsperado = dato(hoja, "Debería haber", esperado, PESOS);
  filaEsperado.getCell(1).font = { bold: true };
  filaEsperado.getCell(2).border = { top: { style: "thin", color: { argb: VERDE } } };

  dato(hoja, "Contado al cerrar", caja.contado, PESOS);

  const diferencia = caja.contado === null ? null : caja.contado - esperado;
  const filaDif = dato(hoja, "Diferencia", diferencia, PESOS);
  if (diferencia !== null && diferencia !== 0) {
    // El único número del archivo que obliga a averiguar qué pasó.
    const rojo = diferencia < 0;
    filaDif.getCell(2).font = { bold: true, color: { argb: rojo ? "FFA62B22" : "FF0E653B" } };
    filaDif.getCell(3).value = rojo ? "Falta efectivo" : "Sobra efectivo";
    filaDif.getCell(3).font = { color: { argb: rojo ? "FFA62B22" : "FF0E653B" } };
  } else if (diferencia === 0) {
    filaDif.getCell(3).value = "Cuadra exacto";
    filaDif.getCell(3).font = { color: { argb: "FF55605A" } };
  }

  hoja.addRow([]);
  titulo(hoja, "Cobrado por medio de pago", ANCHO_ARQUEO);
  dato(hoja, "Efectivo", caja.totales.efectivo, PESOS);
  dato(hoja, "Transferencia", caja.totales.transferencia, PESOS);
  dato(hoja, "Tarjeta", caja.totales.tarjeta, PESOS);
  dato(hoja, "Otro", caja.totales.otro, PESOS);
  const filaTotal = dato(hoja, "Total cobrado", caja.totales.total, PESOS);
  filaTotal.getCell(1).font = { bold: true };
  filaTotal.getCell(2).border = { top: { style: "thin", color: { argb: VERDE } } };
  dato(hoja, "Cantidad de ventas", caja.totales.cantidad, ENTERO);

  if (caja.movimientos.length > 0) {
    hoja.addRow([]);
    titulo(hoja, "Movimientos de efectivo", ANCHO_ARQUEO);
    const enc = hoja.addRow(["Hora", "Monto", "Tipo", "Motivo"]);
    enc.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    });

    for (const m of caja.movimientos) {
      const f = hoja.addRow([
        new Date(m.created_at),
        m.tipo === "retiro" ? -m.monto : m.monto,
        comoTitulo(m.tipo),
        m.motivo,
      ]);
      f.getCell(1).numFmt = FECHA_HORA;
      f.getCell(2).numFmt = PESOS;
      f.getCell(2).alignment = { horizontal: "right" };
      if (m.tipo === "retiro") f.getCell(2).font = { color: { argb: "FFA65A00" } };
    }
  }

  // ── Hoja 2: las ventas del turno ──
  const ventas = libro.addWorksheet("Ventas");
  encabezar(ventas, COLUMNAS_VENTAS_CAJA);
  for (const v of caja.ventas) {
    ventas.addRow({
      numero: v.numero,
      hora: new Date(v.created_at),
      cliente: v.nombre,
      medio: ETIQUETA_MEDIO[v.metodo_pago] ?? v.metodo_pago,
      renglones: v.renglones,
      unidades: v.unidades,
      total: v.total,
      notas: v.notas ?? "",
    });
  }
  pintarCuerpo(ventas, COLUMNAS_VENTAS_CAJA, 2, caja.ventas.length + 1);

  if (caja.ventas.length > 0) {
    totalizar(ventas, COLUMNAS_VENTAS_CAJA, {
      cliente: `Total de ${caja.ventas.length} ${caja.ventas.length === 1 ? "venta" : "ventas"}`,
      renglones: caja.ventas.reduce((s, v) => s + v.renglones, 0),
      unidades: caja.ventas.reduce((s, v) => s + v.unidades, 0),
      total: caja.ventas.reduce((s, v) => s + v.total, 0),
    });
  }

  return libro;
}

export async function descargarCaja(caja: CajaExportable) {
  const libro = await construirLibroCaja(caja);
  await descargar(libro, `apppack-caja-${caja.numero}-${soloElDia(caja.opened_at)}.xlsx`);
}
