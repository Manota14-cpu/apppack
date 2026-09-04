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

// ─────────────────────────  Pedidos y caja  ─────────────────────────

/** Las fechas llegan como Date desde la base y como string desde un JSON. */
type Fecha = string | Date;

const fechaHora = (valor: Fecha) =>
  new Date(valor).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** aaaa-mm-dd, para nombrar el archivo sin depender del huso del navegador. */
function soloElDia(valor: Fecha): string {
  const d = new Date(valor);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

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
  notas: string | null;
  total: number;
  created_at: Fecha;
  items: { nombre: string; unidad_medida: string; precio: number; cantidad: number }[];
}

/**
 * Exporta pedidos en dos hojas.
 *
 * Una fila por pedido no alcanza para revisar qué se vendió, y una fila por
 * renglón hace imposible sumar totales sin contarlos dos veces. Con las dos
 * hojas cada pregunta tiene su tabla, y ninguna miente por agregación.
 */
export async function descargarPedidos(pedidos: PedidoExportable[], sufijo = "") {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();

  const hoja = libro.addWorksheet("Pedidos");
  hoja.columns = [
    { header: "numero", key: "numero", width: 10 },
    { header: "fecha", key: "fecha", width: 18 },
    { header: "estado", key: "estado", width: 13 },
    { header: "canal", key: "canal", width: 12 },
    { header: "cliente", key: "nombre", width: 26 },
    { header: "telefono", key: "telefono", width: 16 },
    { header: "direccion", key: "direccion", width: 30 },
    { header: "localidad", key: "localidad", width: 16 },
    { header: "provincia", key: "provincia", width: 14 },
    { header: "medio_de_pago", key: "metodo_pago", width: 16 },
    { header: "renglones", key: "renglones", width: 11 },
    { header: "unidades", key: "unidades", width: 11 },
    { header: "total", key: "total", width: 14 },
    { header: "notas", key: "notas", width: 34 },
  ];
  hoja.getRow(1).font = { bold: true };

  const detalle = libro.addWorksheet("Renglones");
  detalle.columns = [
    { header: "pedido", key: "numero", width: 10 },
    { header: "fecha", key: "fecha", width: 18 },
    { header: "estado", key: "estado", width: 13 },
    { header: "producto", key: "producto", width: 40 },
    { header: "unidad", key: "unidad", width: 12 },
    { header: "cantidad", key: "cantidad", width: 11 },
    { header: "precio_unitario", key: "precio", width: 16 },
    { header: "subtotal", key: "subtotal", width: 14 },
  ];
  detalle.getRow(1).font = { bold: true };

  for (const p of pedidos) {
    hoja.addRow({
      numero: p.numero,
      fecha: fechaHora(p.created_at),
      estado: p.estado,
      canal: p.canal,
      nombre: p.nombre,
      telefono: p.telefono ?? "",
      direccion: p.direccion ?? "",
      localidad: p.localidad ?? "",
      provincia: p.provincia ?? "",
      metodo_pago: p.metodo_pago ?? "",
      renglones: p.items.length,
      unidades: p.items.reduce((s, i) => s + i.cantidad, 0),
      total: p.total,
      notas: p.notas ?? "",
    });

    for (const i of p.items) {
      detalle.addRow({
        numero: p.numero,
        fecha: fechaHora(p.created_at),
        estado: p.estado,
        producto: i.nombre,
        unidad: i.unidad_medida,
        cantidad: i.cantidad,
        precio: i.precio,
        subtotal: i.precio * i.cantidad,
      });
    }
  }

  const hoy = soloElDia(new Date());
  await descargar(libro, `apppack-pedidos${sufijo ? `-${sufijo}` : ""}-${hoy}.xlsx`);
}

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

/** El turno de caja: el arqueo arriba y cada cobro debajo. */
export async function descargarCaja(caja: CajaExportable) {
  const ExcelJS = (await import("exceljs")).default;
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(`Caja ${caja.numero}`);

  const esperado = caja.fondo + caja.totales.efectivo + caja.ingresado - caja.retirado;
  const diferencia = caja.contado === null ? null : caja.contado - esperado;

  const titulo = (texto: string) => {
    const fila = hoja.addRow([texto]);
    fila.font = { bold: true };
    return fila;
  };

  titulo(`Turno de caja #${caja.numero}`);
  hoja.addRow(["Estado", caja.estado]);
  hoja.addRow(["Abierta", fechaHora(caja.opened_at)]);
  hoja.addRow(["Cerrada", caja.closed_at ? fechaHora(caja.closed_at) : "sigue abierta"]);
  if (caja.nota) hoja.addRow(["Nota", caja.nota]);
  hoja.addRow([]);

  titulo("Arqueo");
  hoja.addRow(["Fondo inicial", caja.fondo]);
  hoja.addRow(["Cobrado en efectivo", caja.totales.efectivo]);
  hoja.addRow(["Agregado al cajón", caja.ingresado]);
  hoja.addRow(["Retirado del cajón", -caja.retirado]);
  hoja.addRow(["Efectivo esperado en caja", esperado]);
  hoja.addRow(["Contado al cerrar", caja.contado ?? "—"]);
  // La diferencia es el número por el que existe el turno: sin él, cerrar la
  // caja sería solo apagar la luz.
  hoja.addRow(["Diferencia", diferencia ?? "—"]);
  hoja.addRow([]);

  titulo("Cobrado por medio de pago");
  hoja.addRow(["Efectivo", caja.totales.efectivo]);
  hoja.addRow(["Transferencia", caja.totales.transferencia]);
  hoja.addRow(["Tarjeta", caja.totales.tarjeta]);
  hoja.addRow(["Otro", caja.totales.otro]);
  hoja.addRow(["Total cobrado", caja.totales.total]);
  hoja.addRow(["Ventas", caja.totales.cantidad]);
  hoja.addRow([]);

  if (caja.movimientos.length > 0) {
    titulo("Movimientos de efectivo");
    const enc = hoja.addRow(["hora", "tipo", "motivo", "monto"]);
    enc.font = { bold: true };
    for (const m of caja.movimientos) {
      hoja.addRow([
        fechaHora(m.created_at),
        m.tipo,
        m.motivo,
        m.tipo === "retiro" ? -m.monto : m.monto,
      ]);
    }
    hoja.addRow([]);
  }

  titulo("Ventas del turno");
  const encabezado = hoja.addRow([
    "venta", "hora", "cliente", "medio_de_pago", "renglones", "unidades", "total", "notas",
  ]);
  encabezado.font = { bold: true };

  for (const v of caja.ventas) {
    hoja.addRow([
      v.numero,
      fechaHora(v.created_at),
      v.nombre,
      v.metodo_pago,
      v.renglones,
      v.unidades,
      v.total,
      v.notas ?? "",
    ]);
  }

  hoja.getColumn(1).width = 26;
  hoja.getColumn(2).width = 20;
  hoja.getColumn(3).width = 24;
  hoja.getColumn(4).width = 16;
  for (const i of [5, 6, 7]) hoja.getColumn(i).width = 12;
  hoja.getColumn(8).width = 30;

  await descargar(libro, `apppack-caja-${caja.numero}-${soloElDia(caja.opened_at)}.xlsx`);
}
