"use client";

import Link from "next/link";
import { AlertTriangle, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cerrarSesion } from "@/app/login/actions";

export function Topbar({ stockBajoCount }: { stockBajoCount: number }) {
  function abrirPaleta() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl lg:px-6">
      <span className="truncate text-caption font-semibold text-muted-foreground">
        Pack Distribuidora — Panel de stock
      </span>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={abrirPaleta}
          className="hidden items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-caption text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:flex"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Buscar
          <kbd className="rounded border border-border px-1 text-overline">Ctrl K</kbd>
        </button>

        {stockBajoCount > 0 && (
          <Link
            href="/productos?stock=bajo"
            className="flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-caption font-semibold text-warning transition-colors hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="tabular-nums">{stockBajoCount}</span>
            <span className="hidden sm:inline">por reponer</span>
          </Link>
        )}

        <form action={cerrarSesion}>
          <Button type="submit" variant="ghost" size="sm" className="gap-1.5">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
