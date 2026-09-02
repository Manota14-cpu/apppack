"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  History,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navegacion = [
  { nombre: "Dashboard", href: "/dashboard", icono: LayoutDashboard },
  { nombre: "Productos", href: "/productos", icono: Package },
  { nombre: "Movimientos", href: "/movimientos", icono: History },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-white/[0.04] bg-black px-3 py-5 lg:flex" role="navigation" aria-label="Navegación principal">
      <div className="flex items-center gap-2.5 px-3 pb-8">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white text-black text-sm font-bold" aria-hidden="true">
          A
        </div>
        <span className="font-bold text-[18px] tracking-tight">AppPack</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="Secciones">
        <ul className="flex flex-col gap-0.5" role="list">
          {navegacion.map((item) => {
            const activo = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="relative block"
                  aria-current={activo ? "page" : undefined}
                >
                  {activo && (
                    <motion.div
                      layoutId="nav-activo"
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-white"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      aria-hidden="true"
                    />
                  )}
                  <div
                    className={cn(
                      "relative ml-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-caption transition-all duration-200",
                      activo
                        ? "bg-white/8 text-foreground font-semibold"
                        : "text-muted-foreground/80 hover:bg-white/[0.03] hover:text-foreground"
                    )}
                  >
                    <item.icono className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
                    {item.nombre}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Link
        href="/configuracion"
        className={cn(
          "ml-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-caption transition-all duration-200",
          pathname.startsWith("/configuracion")
            ? "bg-white/8 text-foreground font-semibold"
            : "text-muted-foreground/80 hover:bg-white/[0.03] hover:text-foreground"
        )}
        aria-current={pathname.startsWith("/configuracion") ? "page" : undefined}
      >
        <Settings className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden="true" />
        Configuración
      </Link>
    </aside>
  );
}
