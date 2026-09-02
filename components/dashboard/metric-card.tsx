"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  titulo: string;
  valor: string;
  detalle?: string;
  icono: React.ReactNode;
  /** Si se pasa, la tarjeta entera es un enlace a la vista ya filtrada. */
  href?: string;
  tono?: "alerta" | "critico";
  index?: number;
}

export function MetricCard({ titulo, valor, detalle, icono, href, tono, index = 0 }: MetricCardProps) {
  const contenido = (
    <Card
      className={cn(
        "h-full overflow-hidden",
        href && "transition-colors hover:border-white/20",
        tono === "critico" && "border-destructive/30",
        tono === "alerta" && "border-warning/30"
      )}
    >
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-overline uppercase tracking-[0.06em] text-muted-foreground">{titulo}</p>
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
              tono === "critico"
                ? "bg-destructive/12 text-destructive"
                : tono === "alerta"
                  ? "bg-warning/12 text-warning"
                  : "bg-white/[0.07] text-foreground/80"
            )}
            aria-hidden="true"
          >
            {icono}
          </div>
        </div>

        <p className="mt-3 font-mono text-kpi tracking-tight tabular-nums">{valor}</p>

        <div className="mt-auto flex items-center gap-1.5 pt-2">
          {detalle && <p className="text-caption text-muted-foreground">{detalle}</p>}
          {href && (
            <ArrowRight
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover/card:translate-x-0.5"
              aria-hidden="true"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 + index * 0.06, ease: [0.16, 1, 0.3, 1] }}
    >
      {href ? (
        <Link
          href={href}
          className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label={`${titulo}: ${valor}. Ver detalle`}
        >
          {contenido}
        </Link>
      ) : (
        contenido
      )}
    </motion.div>
  );
}
