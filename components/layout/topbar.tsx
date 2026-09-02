"use client";

import Link from "next/link";
import { AlertTriangle, ClipboardList, LogOut, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cerrarSesion } from "@/app/login/actions";

export function Topbar({
  stockBajoCount,
  pedidosPendientes,
}: {
  stockBajoCount: number;
  pedidosPendientes: number;
}) {
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

        {/* Un pedido sin atender es plata esperando: avisa igual que el stock bajo. */}
        {pedidosPendientes > 0 && (
          <Link
            href="/pedidos?estado=pendiente"
            className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/[0.06] px-2.5 py-1.5 text-caption font-semibold transition-colors hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="tabular-nums">{pedidosPendientes}</span>
            <span className="hidden sm:inline">
              {pedidosPendientes === 1 ? "pedido" : "pedidos"}
            </span>
          </Link>
        )}

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

        {/* En el celular la barra inferior ya no lleva a Configuración —cinco
            destinos era el límite—, así que el acceso vive acá. */}
        <Link
          href="/configuracion"
          aria-label="Configuración"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 lg:hidden"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Link>

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
