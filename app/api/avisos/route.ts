import { NextRequest, NextResponse } from "next/server";
import { ejecutarChequeoDiario, secretoValido } from "@/lib/avisos-tarea";

/**
 * El chequeo diario de reposición, que dispara la tarea programada de Vercel.
 *
 * Vercel manda `Authorization: Bearer $CRON_SECRET`. Sin ese secreto
 * configurado el endpoint no atiende a nadie: es una ruta pública que consulta
 * la base y manda correos, así que dejarla abierta sería regalar un botón para
 * inundar la casilla y hacer trabajar al servidor.
 */
export const dynamic = "force-dynamic";
/** El aviso manda correos y llama servicios externos: puede tardar más que una página. */
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Falta CRON_SECRET: la tarea de avisos no está configurada." },
      { status: 501 }
    );
  }

  const cabecera = req.headers.get("authorization");
  const token = cabecera?.startsWith("Bearer ") ? cabecera.slice(7) : null;
  if (!secretoValido(token)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const resultado = await ejecutarChequeoDiario();
    return NextResponse.json(resultado);
  } catch (error) {
    console.error("[api:avisos]", error);
    return NextResponse.json({ error: "El chequeo falló." }, { status: 500 });
  }
}
