"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import {
  ADMIN_COOKIE,
  DURACION_SESION_MS,
  crearTokenSesion,
  getAdminPassword,
  passwordMatches,
} from "@/lib/admin-auth";
import { limpiarIntentos, registrarFallo, verificarLimite } from "@/lib/rate-limit";

export interface EstadoFormulario {
  error: string | null;
}

/** Identifica al cliente para limitar intentos. Detrás de proxy, usa la IP reenviada. */
async function identidadCliente(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "local";
}

function describirEspera(segundos: number): string {
  if (segundos < 60) return `${segundos} segundos`;
  const minutos = Math.ceil(segundos / 60);
  return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
}

export async function iniciarSesion(
  _prev: EstadoFormulario,
  formData: FormData
): Promise<EstadoFormulario> {
  const esperada = getAdminPassword();
  if (!esperada) {
    return { error: "El servidor no tiene configurada la contraseña de administrador (ADMIN_PASSWORD)." };
  }

  const clave = await identidadCliente();
  const limite = verificarLimite(clave);
  if (!limite.permitido) {
    return { error: `Demasiados intentos fallidos. Probá de nuevo en ${describirEspera(limite.segundosRestantes)}.` };
  }

  const password = String(formData.get("password") ?? "");
  if (!password || !passwordMatches(password, esperada)) {
    const tras = registrarFallo(clave);
    if (!tras.permitido) {
      return { error: `Demasiados intentos fallidos. Probá de nuevo en ${describirEspera(tras.segundosRestantes)}.` };
    }
    if (tras.intentosRestantes <= 2) {
      const restantes =
        tras.intentosRestantes === 1 ? "Te queda 1 intento" : `Te quedan ${tras.intentosRestantes} intentos`;
      return { error: `Contraseña incorrecta. ${restantes} antes del bloqueo temporal.` };
    }
    return { error: "Contraseña incorrecta." };
  }

  const token = crearTokenSesion();
  if (!token) return { error: "No se pudo iniciar la sesión. Revisá la configuración del servidor." };

  limpiarIntentos(clave);

  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(DURACION_SESION_MS / 1000),
  });
  redirect("/dashboard");
}

export async function cerrarSesion() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  redirect("/login");
}
