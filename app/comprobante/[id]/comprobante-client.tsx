"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ETIQUETA_PAGO, type Pedido } from "@/types/database.types";
import { money } from "@/lib/formato";


const fechaHora = (valor: string | Date) =>
  new Date(valor).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * El ticket.
 *
 * Se dibuja con estilos propios, no con los de la app: lo que se imprime tiene
 * que verse igual en cualquier impresora, y el tema oscuro del panel gastaría
 * un cartucho entero en fondo negro.
 *
 * El ancho fijo de 72 mm es el de una impresora térmica de 80 mm con sus
 * márgenes. En una hoja A4 sale igual, arriba a la izquierda.
 */
export function ComprobanteImprimible({ pedido }: { pedido: Pedido }) {
  const router = useRouter();
  const params = useSearchParams();
  const imprimirSolo = params.get("imprimir") === "1";

  useEffect(() => {
    if (!imprimirSolo) return;
    // Un pequeño respiro para que las fuentes carguen antes del diálogo: sin
    // esto, la primera impresión sale con la tipografía de reserva.
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [imprimirSolo]);

  const unidades = pedido.items.reduce((s, i) => s + i.cantidad, 0);
  const efectivoDelTicket = pedido.pagos
    .filter((p) => p.metodo === "efectivo")
    .reduce((s, p) => s + p.monto, 0);

  return (
    <>
      <style>{`
        :root { color-scheme: light; }
        body { background: #f1f2ef; margin: 0; }
        .hoja {
          width: 72mm;
          margin: 16px auto;
          padding: 6mm 5mm;
          background: #fff;
          color: #111;
          font-family: ui-monospace, "SFMono-Regular", "Menlo", "Consolas", monospace;
          font-size: 11.5px;
          line-height: 1.45;
          box-shadow: 0 2px 18px rgba(0,0,0,.14);
        }
        .centro { text-align: center; }
        .negocio { font-size: 15px; font-weight: 700; letter-spacing: .04em; }
        .sep { border-top: 1px dashed #999; margin: 7px 0; }
        .fila { display: flex; justify-content: space-between; gap: 8px; }
        .fila span:last-child { white-space: nowrap; }
        .items { margin: 0; padding: 0; list-style: none; }
        .items li { margin-bottom: 5px; }
        .detalle { color: #555; }
        .total { font-size: 15px; font-weight: 700; }
        .aclaracion { font-size: 10px; color: #444; }
        .acciones {
          max-width: 72mm; margin: 0 auto 40px; display: flex; gap: 8px;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .acciones button {
          flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #c8ccc6;
          background: #fff; color: #111; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .acciones button.primario { background: #0e653b; border-color: #0e653b; color: #fff; }
        @media print {
          body { background: #fff; }
          .hoja { width: auto; margin: 0; padding: 0; box-shadow: none; }
          .acciones { display: none; }
          @page { margin: 6mm; }
        }
      `}</style>

      <div className="hoja">
        <div className="centro">
          <div className="negocio">PACK DISTRIBUIDORA</div>
          <div className="detalle">Descartables · Rafaela, Santa Fe</div>
        </div>

        <div className="sep" />

        <div className="fila">
          <span>Comprobante</span>
          <span>N° {pedido.numero}</span>
        </div>
        <div className="fila">
          <span>Fecha</span>
          <span>{fechaHora(pedido.created_at)}</span>
        </div>
        {pedido.nombre && (
          <div className="fila">
            <span>Cliente</span>
            <span>{pedido.nombre}</span>
          </div>
        )}
        {pedido.pagos.length === 1 && pedido.pagos[0] && (
          <div className="fila">
            <span>Pago</span>
            <span>{ETIQUETA_PAGO[pedido.pagos[0].metodo] ?? pedido.pagos[0].metodo}</span>
          </div>
        )}

        <div className="sep" />

        <ul className="items">
          {pedido.items.map((i) => (
            <li key={i.id}>
              <div>{i.nombre}</div>
              <div className="fila">
                <span className="detalle">
                  {i.cantidad} {i.unidad_medida} × {money(i.precio)}
                </span>
                <span>{money(i.precio * i.cantidad)}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="sep" />

        <div className="fila">
          <span className="detalle">
            {pedido.items.length} {pedido.items.length === 1 ? "renglón" : "renglones"} ·{" "}
            {unidades} {unidades === 1 ? "unidad" : "unidades"}
          </span>
        </div>
        <div className="fila total">
          <span>TOTAL</span>
          <span>{money(pedido.total)}</span>
        </div>

        {/* Con más de un medio, el detalle es lo que el cliente revisa. */}
        {pedido.pagos.length > 1 && (
          <>
            <div className="sep" />
            {pedido.pagos.map((pago, i) => (
              <div className="fila" key={i}>
                <span className="detalle">{ETIQUETA_PAGO[pago.metodo] ?? pago.metodo}</span>
                <span>{money(pago.monto)}</span>
              </div>
            ))}
          </>
        )}

        {pedido.recibido !== null && pedido.recibido > 0 && (
          <>
            <div className="sep" />
            <div className="fila">
              <span className="detalle">Paga con</span>
              <span>{money(pedido.recibido)}</span>
            </div>
            <div className="fila">
              <span className="detalle">Vuelto</span>
              <span>{money(Math.max(0, pedido.recibido - efectivoDelTicket))}</span>
            </div>
          </>
        )}

        {pedido.notas && (
          <>
            <div className="sep" />
            <div className="detalle">{pedido.notas}</div>
          </>
        )}

        <div className="sep" />

        {/* Decirlo importa: un papel que parece factura sin serlo le trae un
            problema al negocio, no a quien lo imprime. */}
        <div className="centro aclaracion">
          <div>DOCUMENTO NO FISCAL</div>
          <div>No válido como factura</div>
          <div style={{ marginTop: 6 }}>¡Gracias por su compra!</div>
        </div>
      </div>

      <div className="acciones">
        <button type="button" onClick={() => router.back()}>
          Volver
        </button>
        <button type="button" className="primario" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
    </>
  );
}
