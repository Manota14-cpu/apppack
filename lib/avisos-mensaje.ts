/**
 * Cómo se escribe el aviso de reposición.
 *
 * Vive aparte de `avisos.ts` —que consulta la base y por eso es server-only—
 * porque esto es transformación pura: entra un resumen, sale el texto. Así se
 * prueba solo, que es donde está el criterio delicado (qué se dice primero,
 * qué se resume, cómo se escapa un nombre dentro del HTML del correo).
 */

export interface ProductoCritico {
  nombre: string;
  stock: number;
  stock_minimo: number;
  unidad_medida: string;
}

export interface Aviso {
  criticos: ProductoCritico[];
  /** Cuántos de los críticos están directamente en cero. */
  agotados: number;
  pedidos: { cantidad: number; monto: number };
  /** Huella del contenido, para no repetir el mismo aviso todos los días. */
  huella: string;
  hayAlgo: boolean;
}

/** Cuántos productos se listan en el mensaje antes de resumir el resto. */
const MAX_EN_MENSAJE = 15;

const money = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

export function asuntoDeAviso(aviso: Aviso): string {
  const partes: string[] = [];
  if (aviso.criticos.length > 0) {
    partes.push(
      `${aviso.criticos.length} ${aviso.criticos.length === 1 ? "producto" : "productos"} por reponer`
    );
  }
  if (aviso.pedidos.cantidad > 0) {
    partes.push(
      `${aviso.pedidos.cantidad} ${aviso.pedidos.cantidad === 1 ? "pedido" : "pedidos"} sin atender`
    );
  }
  return partes.length > 0 ? `AppPack: ${partes.join(" y ")}` : "AppPack: todo en orden";
}

/**
 * Versión en texto plano.
 *
 * Es la que va al webhook y la que lee un cliente de correo sin HTML, así que
 * tiene que bastarse sola: quien la lee no debería necesitar abrir la app para
 * entender qué pasa.
 */
export function textoDeAviso(aviso: Aviso, urlApp: string): string {
  const lineas: string[] = [];

  if (aviso.pedidos.cantidad > 0) {
    lineas.push(
      `PEDIDOS SIN ATENDER: ${aviso.pedidos.cantidad} por ${money(aviso.pedidos.monto)}`,
      `${urlApp}/pedidos`,
      ""
    );
  }

  if (aviso.criticos.length > 0) {
    lineas.push(
      `POR REPONER: ${aviso.criticos.length}${aviso.agotados > 0 ? ` (${aviso.agotados} sin stock)` : ""}`
    );
    for (const p of aviso.criticos.slice(0, MAX_EN_MENSAJE)) {
      const estado = p.stock === 0 ? "SIN STOCK" : `quedan ${p.stock}`;
      lineas.push(`  · ${p.nombre} — ${estado} de ${p.stock_minimo} ${p.unidad_medida}`);
    }
    if (aviso.criticos.length > MAX_EN_MENSAJE) {
      lineas.push(`  … y ${aviso.criticos.length - MAX_EN_MENSAJE} más`);
    }
    lineas.push(`${urlApp}/productos?stock=bajo`, "");
  }

  if (lineas.length === 0) {
    lineas.push("Nada que reponer y ningún pedido sin atender.", "");
  }

  return lineas.join("\n").trimEnd();
}

/** Escapa lo que se interpola en el HTML del correo. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function htmlDeAviso(aviso: Aviso, urlApp: string): string {
  const bloques: string[] = [];

  if (aviso.pedidos.cantidad > 0) {
    bloques.push(`
      <div style="border-left:3px solid #0e653b;padding:12px 16px;margin:0 0 20px;background:#f3f7f4">
        <div style="font-size:22px;font-weight:700;color:#0e653b">
          ${aviso.pedidos.cantidad} ${aviso.pedidos.cantidad === 1 ? "pedido" : "pedidos"} sin atender
        </div>
        <div style="color:#4c584f;margin-top:2px">${esc(money(aviso.pedidos.monto))} esperando que los prepares</div>
        <a href="${esc(urlApp)}/pedidos" style="display:inline-block;margin-top:10px;color:#0e653b;font-weight:600">Ver los pedidos →</a>
      </div>`);
  }

  if (aviso.criticos.length > 0) {
    const filas = aviso.criticos
      .slice(0, MAX_EN_MENSAJE)
      .map(
        (p) => `
        <tr>
          <td style="padding:7px 0;border-bottom:1px solid #e6eae3">${esc(p.nombre)}</td>
          <td style="padding:7px 0;border-bottom:1px solid #e6eae3;text-align:right;white-space:nowrap;color:${
            p.stock === 0 ? "#a62b22" : "#a65a00"
          };font-weight:600">
            ${p.stock === 0 ? "sin stock" : `quedan ${p.stock}`}
          </td>
          <td style="padding:7px 0 7px 14px;border-bottom:1px solid #e6eae3;text-align:right;white-space:nowrap;color:#6e7a71">
            mínimo ${p.stock_minimo} ${esc(p.unidad_medida)}
          </td>
        </tr>`
      )
      .join("");

    const resto =
      aviso.criticos.length > MAX_EN_MENSAJE
        ? `<p style="color:#6e7a71;margin:10px 0 0">y ${aviso.criticos.length - MAX_EN_MENSAJE} más</p>`
        : "";

    bloques.push(`
      <div style="margin:0 0 20px">
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">
          ${aviso.criticos.length} ${aviso.criticos.length === 1 ? "producto por reponer" : "productos por reponer"}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>
        ${resto}
        <a href="${esc(urlApp)}/productos?stock=bajo" style="display:inline-block;margin-top:12px;color:#0e653b;font-weight:600">Ver el listado →</a>
      </div>`);
  }

  if (bloques.length === 0) {
    bloques.push(
      `<p style="color:#4c584f">Nada que reponer y ningún pedido sin atender.</p>`
    );
  }

  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f6f7f4;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#16201a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d8ded6;border-radius:6px;padding:24px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6e7a71;margin-bottom:16px">
      AppPack · Pack Distribuidora
    </div>
    ${bloques.join("")}
    <p style="color:#6e7a71;font-size:12px;margin:24px 0 0;padding-top:16px;border-top:1px solid #e6eae3">
      Este aviso se manda una vez por día, y solo cuando hay algo que atender.
    </p>
  </div>
</body></html>`;
}
