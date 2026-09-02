import "server-only";
import { asuntoDeAviso, htmlDeAviso, textoDeAviso, type Aviso } from "@/lib/avisos";

/**
 * Por dónde sale el aviso.
 *
 * Dos canales, los dos por HTTP y sin librerías: agregar un SDK para mandar un
 * correo por día sería traer un paquete entero para una petición.
 *
 * Sobre WhatsApp: mandar un mensaje que inicia el negocio —que es el caso de
 * un aviso automático— requiere la WhatsApp Business Platform con plantillas
 * aprobadas por Meta. No es algo que se configure en cinco minutos, así que no
 * se promete acá. El canal de webhook cubre ese caso: apuntándolo a un puente
 * de WhatsApp o a una automatización, el aviso llega igual.
 */

const URL_APP = process.env.APPPACK_URL?.replace(/\/$/, "") ?? "https://apppack.vercel.app";

/** Cuánto se espera a cada servicio antes de darlo por fallado. */
const ESPERA_MS = 8000;

export interface CanalConfigurado {
  nombre: "email" | "webhook";
  destino: string;
}

export function canalesConfigurados(): CanalConfigurado[] {
  const canales: CanalConfigurado[] = [];

  const destinoEmail = process.env.AVISOS_EMAIL_DESTINO;
  if (process.env.RESEND_API_KEY && destinoEmail) {
    canales.push({ nombre: "email", destino: destinoEmail });
  }

  const webhook = process.env.AVISOS_WEBHOOK_URL;
  if (webhook) {
    // Solo el dominio: la URL de un webhook suele llevar un token en la ruta.
    let destino = "webhook";
    try {
      destino = new URL(webhook).host;
    } catch {
      // Una URL mal escrita se informa como tal en vez de romper la pantalla.
      destino = "dirección inválida";
    }
    canales.push({ nombre: "webhook", destino });
  }

  return canales;
}

export interface ResultadoEnvio {
  enviados: string[];
  fallos: { canal: string; motivo: string }[];
}

async function porEmail(aviso: Aviso): Promise<void> {
  const clave = process.env.RESEND_API_KEY;
  const para = process.env.AVISOS_EMAIL_DESTINO;
  if (!clave || !para) throw new Error("Falta RESEND_API_KEY o AVISOS_EMAIL_DESTINO");

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${clave}`, "content-type": "application/json" },
    body: JSON.stringify({
      // El remitente por defecto es el de pruebas de Resend, que funciona sin
      // verificar dominio pero solo escribe a la casilla de la cuenta.
      from: process.env.AVISOS_EMAIL_ORIGEN ?? "AppPack <onboarding@resend.dev>",
      to: [para],
      subject: asuntoDeAviso(aviso),
      text: textoDeAviso(aviso, URL_APP),
      html: htmlDeAviso(aviso, URL_APP),
    }),
    signal: AbortSignal.timeout(ESPERA_MS),
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text().catch(() => "");
    throw new Error(`Resend respondió ${respuesta.status}: ${cuerpo.slice(0, 200)}`);
  }
}

async function porWebhook(aviso: Aviso): Promise<void> {
  const url = process.env.AVISOS_WEBHOOK_URL;
  if (!url) throw new Error("Falta AVISOS_WEBHOOK_URL");

  const respuesta = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      titulo: asuntoDeAviso(aviso),
      // `texto` va listo para reenviar tal cual por WhatsApp o Telegram; el
      // resto viene desarmado por si del otro lado se quiere componer distinto.
      texto: textoDeAviso(aviso, URL_APP),
      por_reponer: aviso.criticos.length,
      agotados: aviso.agotados,
      pedidos_pendientes: aviso.pedidos.cantidad,
      pedidos_monto: aviso.pedidos.monto,
      productos: aviso.criticos,
      url: URL_APP,
    }),
    signal: AbortSignal.timeout(ESPERA_MS),
  });

  if (!respuesta.ok) {
    throw new Error(`El webhook respondió ${respuesta.status}`);
  }
}

/**
 * Manda el aviso por todos los canales configurados.
 *
 * Nunca tira: que falle el correo no debería impedir que salga el webhook, ni
 * hacer fallar la tarea programada entera. Lo que pasó vuelve en el resultado
 * y queda registrado.
 */
export async function enviarAviso(aviso: Aviso): Promise<ResultadoEnvio> {
  const canales = canalesConfigurados();
  const enviados: string[] = [];
  const fallos: ResultadoEnvio["fallos"] = [];

  await Promise.all(
    canales.map(async (canal) => {
      try {
        if (canal.nombre === "email") await porEmail(aviso);
        else await porWebhook(aviso);
        enviados.push(canal.nombre);
      } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        console.error(`[avisos:${canal.nombre}]`, motivo);
        fallos.push({ canal: canal.nombre, motivo });
      }
    })
  );

  return { enviados, fallos };
}
