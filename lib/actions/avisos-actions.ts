"use server";

import { requerirSesion } from "@/lib/guard";
import { consultarUna } from "@/lib/db";
import { fallo } from "@/lib/errors";
import { construirAviso } from "@/lib/avisos";
import { canalesConfigurados, enviarAviso, type CanalConfigurado } from "@/lib/notificaciones";

export interface EstadoAvisos {
  canales: CanalConfigurado[];
  ultimo: { fecha: string; canales: string; ok: boolean; detalle: string | null } | null;
  pendiente: { porReponer: number; agotados: number; pedidos: number };
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  await requerirSesion();

  const [aviso, ultimo] = await Promise.all([
    construirAviso(),
    consultarUna<{ fecha: string; canales: string; ok: boolean; detalle: string | null }>(
      `select "createdAt" as fecha, channels as canales, ok, detail as detalle
         from "Notification" where type = 'reposicion'
        order by "createdAt" desc limit 1`
    ),
  ]);

  return {
    canales: canalesConfigurados(),
    ultimo,
    pendiente: {
      porReponer: aviso.criticos.length,
      agotados: aviso.agotados,
      pedidos: aviso.pedidos.cantidad,
    },
  };
}

/**
 * Manda el aviso ahora mismo, se haya mandado o no hoy.
 *
 * Es el botón de «probar»: sirve para confirmar que el correo llega antes de
 * confiar en que va a llegar solo a las ocho de la mañana.
 */
export async function enviarAvisoDePrueba() {
  await requerirSesion();

  if (canalesConfigurados().length === 0) {
    return {
      success: false as const,
      error: "Todavía no hay ningún canal configurado. Mirá las instrucciones de abajo.",
    };
  }

  try {
    const aviso = await construirAviso();
    const resultado = await enviarAviso(aviso);

    if (resultado.enviados.length === 0) {
      return {
        success: false as const,
        error: resultado.fallos[0]?.motivo ?? "No se pudo enviar por ningún canal.",
      };
    }

    return {
      success: true as const,
      enviados: resultado.enviados,
      fallos: resultado.fallos,
      hayAlgo: aviso.hayAlgo,
    };
  } catch (error) {
    return fallo(error, "avisos:prueba");
  }
}
