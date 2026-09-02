"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, BarChart3, History, Settings } from "lucide-react";

const acciones = [
  { label: "Nuevo producto", icono: Plus, href: "/productos", variant: "default" as const },
  // En el celular la barra inferior está llena, así que este es el camino a
  // Informes desde el teléfono.
  { label: "Informes", icono: BarChart3, href: "/informes", variant: "secondary" as const },
  { label: "Ver movimientos", icono: History, href: "/movimientos", variant: "secondary" as const },
  { label: "Configuración", icono: Settings, href: "/configuracion", variant: "secondary" as const },
];

export function QuickActions() {
  return (
    <div className="flex flex-wrap gap-3">
      {acciones.map((accion, i) => (
        <motion.div
          key={accion.href}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 + i * 0.06, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          <Button asChild variant={accion.variant} size="default">
            <Link href={accion.href}>
              <accion.icono className="h-4 w-4" />
              {accion.label}
            </Link>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}
