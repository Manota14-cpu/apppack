"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna, ejecutar } from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { CAMPOS_PEDIDO } from "@/lib/sql";
import { avisarATienda } from "@/lib/revalidar-tienda";
import { estadoPedidoSchema } from "@/lib/validation";
import type { Pedido } from "@/types/database.types";

function revalidarPedidos() {
  revalidatePath("/pedidos");
  revalidatePath("/dashboard");
  revalidatePath("/productos");
  revalidatePath("/movimientos");
}

/**
 * Cambia el estado de un pedido.
 *
 * Cancelar devuelve el stock a la estantería y reabrir lo vuelve a descontar;
 * eso pasa dentro de `cambiar_estado_pedido`, en la base, para que el estado y
 * el stock no puedan quedar desfasados si algo falla a mitad de camino.
 */
export async function cambiarEstadoPedido(pedidoId: string, estado: string) {
  await requerirSesion();

  const parsed = estadoPedidoSchema.safeParse({ pedidoId, estado });
  if (!parsed.success) return falloDeValidacion("Estado de pedido inválido.");

  try {
    await consultar(`select cambiar_estado_pedido($1, $2)`, [
      parsed.data.pedidoId,
      parsed.data.estado,
    ]);
  } catch (error) {
    return fallo(error, "pedidos:cambiarEstado");
  }

  revalidarPedidos();
  await avisarATienda();
  return { success: true as const };
}

export async function verPedido(pedidoId: string): Promise<Pedido | null> {
  await requerirSesion();
  try {
    return await consultarUna<Pedido>(
      `select ${CAMPOS_PEDIDO} from "Order" o where o.id = $1`,
      [pedidoId]
    );
  } catch (error) {
    console.error("[pedidos:ver]", error);
    return null;
  }
}

/** Nota interna del pedido: no la ve el cliente, solo sirve para preparar. */
export async function guardarNotaPedido(pedidoId: string, nota: string) {
  await requerirSesion();

  const limpia = nota.trim().slice(0, 1000);
  try {
    await ejecutar(`update "Order" set notas = $2 where id = $1`, [
      pedidoId.slice(0, 64),
      limpia === "" ? null : limpia,
    ]);
  } catch (error) {
    return fallo(error, "pedidos:guardarNota");
  }

  revalidarPedidos();
  return { success: true as const };
}
