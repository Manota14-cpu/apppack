"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Paginación como enlaces reales: cada página es una URL, así se puede
 * compartir, marcar y volver con el botón atrás del navegador.
 */
export function PaginationLinks({ total, page, pageSize }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPaginas = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));

  if (totalPaginas <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("page");
    else params.set("page", String(p));
    return params.size ? `${pathname}?${params}` : pathname;
  };

  // Ventana de páginas con extremos siempre visibles, para poder saltar lejos.
  const paginas: (number | "…")[] = [];
  const agregar = (n: number) => { if (!paginas.includes(n)) paginas.push(n); };
  agregar(1);
  if (page - 2 > 2) paginas.push("…");
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPaginas - 1, page + 1); i++) agregar(i);
  if (page + 2 < totalPaginas - 1) paginas.push("…");
  if (totalPaginas > 1) agregar(totalPaginas);

  const desde = (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  const claseFlecha = (deshabilitado: boolean) =>
    cn(
      "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
      deshabilitado
        ? "pointer-events-none text-muted-foreground/40"
        : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
    );

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
      aria-label="Paginación"
    >
      <p className="text-caption text-muted-foreground">
        {desde.toLocaleString("es-AR")}–{hasta.toLocaleString("es-AR")} de {total.toLocaleString("es-AR")}
      </p>
      <div className="flex items-center gap-1">
        <Link href={href(page - 1)} aria-label="Página anterior" aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined} className={claseFlecha(page <= 1)} scroll={false}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>

        {paginas.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-caption text-muted-foreground" aria-hidden="true">…</span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              scroll={false}
              aria-label={`Página ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-caption font-medium tabular-nums transition-colors",
                p === page
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              )}
            >
              {p}
            </Link>
          )
        )}

        <Link href={href(page + 1)} aria-label="Página siguiente" aria-disabled={page >= totalPaginas}
          tabIndex={page >= totalPaginas ? -1 : undefined} className={claseFlecha(page >= totalPaginas)} scroll={false}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
