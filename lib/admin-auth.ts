import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const ADMIN_COOKIE = "apppack_session";

/** Duración de una sesión. Vencida, hay que volver a ingresar la contraseña. */
export const DURACION_SESION_MS = 1000 * 60 * 60 * 12; // 12 horas

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}

/**
 * Clave con la que se firman los tokens de sesión.
 *
 * Se deriva de ADMIN_PASSWORD (y opcionalmente de SESSION_SECRET). Consecuencia
 * buscada: cambiar cualquiera de las dos invalida al instante TODAS las sesiones
 * emitidas — es la forma de "cerrar sesión en todos los dispositivos".
 */
function claveDeFirma(): Buffer | null {
  const password = getAdminPassword();
  if (!password) return null;
  return createHash("sha256")
    .update(`apppack-session-v1:${password}:${process.env.SESSION_SECRET ?? ""}`)
    .digest();
}

function comparacionSegura(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Compara la contraseña ingresada contra la esperada, en tiempo constante. */
export function passwordMatches(input: string, expected: string): boolean {
  if (!expected) return false;
  return comparacionSegura(
    createHash("sha256").update(input).digest("hex"),
    createHash("sha256").update(expected).digest("hex")
  );
}

/**
 * Emite un token de sesión: identificador aleatorio + vencimiento, firmado con HMAC.
 *
 * A diferencia de guardar el hash de la contraseña en la cookie, este valor es
 * distinto en cada login, no sirve para deducir la contraseña y deja de valer solo.
 */
export function crearTokenSesion(): string | null {
  const clave = claveDeFirma();
  if (!clave) return null;

  const payload = JSON.stringify({
    jti: randomBytes(24).toString("base64url"),
    exp: Date.now() + DURACION_SESION_MS,
  });
  const cuerpo = Buffer.from(payload, "utf8").toString("base64url");
  const firma = createHmac("sha256", clave).update(cuerpo).digest("base64url");
  return `${cuerpo}.${firma}`;
}

/** Valida firma y vencimiento de un token. */
export function tokenEsValido(token: string | undefined): boolean {
  if (!token) return false;
  const clave = claveDeFirma();
  if (!clave) return false;

  const partes = token.split(".");
  if (partes.length !== 2) return false;
  const [cuerpo, firma] = partes as [string, string];

  const esperada = createHmac("sha256", clave).update(cuerpo).digest("base64url");
  if (!comparacionSegura(firma, esperada)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as { exp?: number };
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  return tokenEsValido(store.get(ADMIN_COOKIE)?.value);
}
