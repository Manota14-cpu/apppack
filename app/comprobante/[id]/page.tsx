import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/guard";
import { consultarUna } from "@/lib/db";
import { CAMPOS_PEDIDO } from "@/lib/sql";
import { ComprobanteImprimible } from "./comprobante-client";
import type { Pedido } from "@/types/database.types";

/**
 * El comprobante de una venta, listo para imprimir.
 *
 * Vive fuera del grupo `(app)` a propósito: ahí heredaría la barra lateral y la
 * superior, y lo que sale del ticket tiene que ser la venta y nada más.
 *
 * No es una factura. Emitir un comprobante fiscal requiere estar integrado con
 * ARCA, y hacer pasar por factura algo que no lo es le traería un problema al
 * negocio, así que el ticket lo dice en letras.
 */
export default async function ComprobantePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirSesion();

  const { id } = await params;
  const pedido = await consultarUna<Pedido>(
    `select ${CAMPOS_PEDIDO} from "Order" o where o.id = $1`,
    [id.slice(0, 64)]
  );

  if (!pedido) notFound();

  return <ComprobanteImprimible pedido={pedido} />;
}
