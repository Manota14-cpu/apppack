"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Wallet,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNav = [
  { nombre: "Panel", href: "/dashboard", icono: LayoutDashboard },
  { nombre: "Productos", href: "/productos", icono: Package },
  { nombre: "Caja", href: "/caja", icono: Wallet },
  { nombre: "Pedidos", href: "/pedidos", icono: ClipboardList },
  { nombre: "Historial", href: "/movimientos", icono: History },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/[0.04] bg-black/90 backdrop-blur-2xl pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      role="navigation"
      aria-label="Navegación móvil"
    >
      <ul className="flex w-full" role="list">
        {mobileNav.map((item) => {
          const activo = pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-caption transition-colors",
                  activo
                    ? "text-white"
                    : "text-muted-foreground/60"
                )}
                aria-current={activo ? "page" : undefined}
              >
                <item.icono className="h-[18px] w-[18px]" strokeWidth={activo ? 2 : 1.5} aria-hidden="true" />
                <span className="text-[10px] font-medium">{item.nombre}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
