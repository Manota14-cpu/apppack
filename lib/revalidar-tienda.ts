import "server-only";

/**
 * Le avisa a la tienda que el catálogo cambió, para que rehaga sus páginas.
 *
 * Sin esto, la web sirve páginas cacheadas hasta 60 segundos y a veces hace
 * falta refrescar dos veces (la primera devuelve la copia vieja y recién
 * entonces se regenera). Con el aviso, el cambio se ve en el próximo reload.
 *
 * Es deliberadamente silencioso y no bloqueante: si la tienda no responde, o
 * si todavía no se configuró el secreto compartido, AppPack ya guardó en la
 * base y el cambio se va a ver igual cuando venza el caché. Un panel de stock
 * no debería fallar porque la web esté caída.
 */
const URL_TIENDA = process.env.TIENDA_URL?.replace(/\/$/, "");
const SECRETO = process.env.REVALIDATE_SECRET;

/** Cuánto se espera a la tienda antes de seguir sin ella. */
const ESPERA_MS = 4000;

export function tiendaAvisable(): boolean {
  return Boolean(URL_TIENDA && SECRETO);
}

export async function avisarATienda(slugs: string[] = []): Promise<void> {
  if (!URL_TIENDA || !SECRETO) return;

  try {
    await fetch(`${URL_TIENDA}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-apppack-secret": SECRETO },
      body: JSON.stringify({ slugs: slugs.filter(Boolean).slice(0, 50) }),
      signal: AbortSignal.timeout(ESPERA_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.warn(
      "[revalidar-tienda] no se pudo avisar; el cambio se verá cuando venza el caché:",
      error instanceof Error ? error.message : error
    );
  }
}
