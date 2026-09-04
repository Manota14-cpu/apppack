"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna, consultarValor, ejecutar } from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { CAMPOS_PEDIDO } from "@/lib/sql";
import { avisarATienda } from "@/lib/revalidar-tienda";
import { edicionPedidoSchema, estadoPedidoSchema, primerError } from "@/lib/validation";
import type { Pedido } from "@/types/database.types";

function revalidarPedidos() {
  revalidatePath("/pedidos");
  revalidatePath("/caja");
  revalidatePath("/dashboard");
  revalidatePath("/informes");
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

/**
 * Borra un pedido para siempre.
 *
 * Antes de borrar devuelve el stock, si el pedido todavía lo tenía descontado:
 * si no, las unidades desaparecerían del sistema sin haber salido del depósito
 * y el stock quedaría mintiendo para siempre, sin ningún rastro que permita
 * descubrir por qué.
 *
 * A diferencia de cancelar, esto no deja historia: el pedido no vuelve a
 * figurar en los informes. Cancelar es lo que casi siempre conviene; borrar
 * existe para sacar de en medio una prueba o un pedido cargado por error.
 */
export async function eliminarPedido(pedidoId: string) {
  await requerirSesion();

  const id = pedidoId.trim().slice(0, 64);
  if (!id) return falloDeValidacion("Pedido inválido.");

  try {
    const pedido = await consultarUna<{ numero: number; estado: string }>(
      `select number as numero, status as estado from "Order" where id = $1`,
      [id]
    );
    if (!pedido) return falloDeValidacion("Ese pedido ya no existe.");

    // Un pedido cancelado ya devolvió su stock: devolverlo otra vez lo
    // duplicaría. `cambiar_estado_pedido` es la única puerta a esa devolución,
    // así que se pasa por ahí en vez de repetir la lógica.
    if (pedido.estado !== "cancelado") {
      await consultar(`select cambiar_estado_pedido($1, 'cancelado')`, [id]);
    }

    // Los renglones se van con él por la cascada declarada en el esquema.
    await ejecutar(`delete from "Order" where id = $1`, [id]);

    revalidarPedidos();
    await avisarATienda();
    return { success: true as const, numero: pedido.numero };
  } catch (error) {
    return fallo(error, "pedidos:eliminar");
  }
}

/**
 * Reemplaza los renglones de un pedido.
 *
 * El stock se reconcilia por diferencia dentro de la base: lo que se agregó
 * sale del depósito, lo que se quitó vuelve, y cada movimiento queda anotado
 * como «Edición del pedido #N». Corregir una cantidad sin eso dejaría el stock
 * mintiendo, que es exactamente el problema que la app existe para evitar.
 */
export async function editarPedido(entrada: {
  pedidoId: string;
  nombre: string;
  notas: string;
  items: {
    producto_id: string | null;
    nombre: string;
    unidad_medida: string;
    precio: number;
    cantidad: number;
  }[];
}) {
  await requerirSesion();

  const parsed = edicionPedidoSchema.safeParse(entrada);
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    const resultado = await consultarValor<{ numero: number; total: number }>(
      `select editar_pedido($1, $2::jsonb)`,
      [d.pedidoId, JSON.stringify({ nombre: d.nombre, notas: d.notas, items: d.items })]
    );

    revalidarPedidos();
    await avisarATienda();
    return {
      success: true as const,
      numero: Number(resultado?.numero ?? 0),
      total: Number(resultado?.total ?? 0),
    };
  } catch (error) {
    return fallo(error, "pedidos:editar");
  }
}
