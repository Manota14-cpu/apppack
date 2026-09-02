import "server-only";
import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin-auth";

/**
 * Punto único de control de acceso.
 *
 * Toda lectura y toda Server Action llama a esto antes de tocar la base. Así el
 * chequeo de sesión no es una convención que haya que recordar en cada función
 * nueva: es la primera línea de todas.
 */
export async function requerirSesion(): Promise<void> {
  if (!(await isAdminAuthed())) redirect("/login");
}
