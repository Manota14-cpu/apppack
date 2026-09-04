"use client";

import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, ArrowRight, PackagePlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Fecha, MovimientoConProducto } from "@/types/database.types";

const ICONOS: Record<string, typeof ArrowUpCircle> = {
  entrada: ArrowUpCircle,
  salida: ArrowDownCircle,
  creacion: PackagePlus,
};

function tiempoRelativo(fecha: Fecha): string {
  const minutos = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `hace ${dias} d`;
  return new Date(fecha).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

export function RecentMovements({ movimientos }: { movimientos: MovimientoConProducto[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Movimientos recientes</CardTitle>
        <Link
          href="/movimientos"
          className="flex items-center gap-1 text-caption text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded"
        >
          Ver todos <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="pt-3">
        {movimientos.length === 0 ? (
          <p className="py-10 text-center text-caption text-muted-foreground">
            Todavía no hay movimientos de stock.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {movimientos.map((m) => {
              const Icono = ICONOS[m.tipo] ?? PackagePlus;
              const esSalida = m.tipo === "salida";
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${
                      esSalida ? "bg-destructive/12 text-destructive" : "bg-success/12 text-success"
                    }`}
                    aria-hidden="true"
                  >
                    <Icono className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium">{m.productos?.nombre ?? "Producto eliminado"}</p>
                    <p className="truncate text-caption text-muted-foreground">{m.motivo || m.tipo}</p>
                  </div>
                  <span className={`shrink-0 font-mono-num text-body font-semibold ${esSalida ? "text-destructive" : "text-success"}`}>
                    {esSalida ? "−" : "+"}{Number(m.cantidad).toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                  </span>
                  <span className="w-20 shrink-0 text-right text-caption text-muted-foreground">
                    {tiempoRelativo(m.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
