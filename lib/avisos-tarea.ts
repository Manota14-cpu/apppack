import "server-only";
import { timingSafeEqual } from "crypto";
import { consultar, ejecutar } from "@/lib/db";
import { construirAviso, DIAS_ENTRE_RECORDATORIOS, type Aviso } from "@/lib/avisos";
import { canalesConfigurados, enviarAviso } from "@/lib/notificaciones";

export interface ResultadoTarea {
  estado: "enviado" | "sin-novedades" | "repetido" | "sin-canales";
  enviados?: string[];
  fallos?: { canal: string; motivo: string }[];
}

/** Compara el secreto de la tarea en tiempo constante. */
export function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * El chequeo diario.
 *
 * Solo escribe si hay algo que decir, y no repite el mismo aviso todos los
 * días: un correo idéntico cada mañana se vuelve ruido que se archiva sin
 * leer, y entonces la función deja de servir justo cuando hace falta. Se
 * vuelve a mandar cuando el contenido cambia, o pasada una semana como
 * recordatorio de que el problema sigue ahí.
 */
export async function ejecutarChequeoDiario(): Promise<ResultadoTarea> {
  if (canalesConfigurados().length === 0) return { estado: "sin-canales" };

  const aviso: Aviso = await construirAviso();
  if (!aviso.hayAlgo) return { estado: "sin-novedades" };

  const previos = await consultar<{ digest: string; dias: number }>(
    `select digest, extract(day from now() - "createdAt")::int as dias
       from "Notification"
      where type = 'reposicion' and ok
      order by "createdAt" desc limit 1`
  );
  const previo = previos[0];

  if (previo && previo.digest === aviso.huella && previo.dias < DIAS_ENTRE_RECORDATORIOS) {
    return { estado: "repetido" };
  }

  const resultado = await enviarAviso(aviso);

  await ejecutar(
    `insert into "Notification" (type, digest, channels, ok, detail)
     values ('reposicion', $1, $2, $3, $4)`,
    [
      aviso.huella,
      resultado.enviados.join(",") || "ninguno",
      resultado.enviados.length > 0,
      resultado.fallos.length > 0
        ? resultado.fallos.map((f) => `${f.canal}: ${f.motivo}`).join(" · ").slice(0, 500)
        : null,
    ]
  );

  return { estado: "enviado", enviados: resultado.enviados, fallos: resultado.fallos };
}
