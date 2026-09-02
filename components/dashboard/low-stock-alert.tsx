"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProductoResumen } from "@/types/database.types";

const cant = (n: number) => Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });

export function LowStockAlert({ productos }: { productos: ProductoResumen[] }) {
  if (productos.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Reposición</CardTitle></CardHeader>
        <CardContent className="flex h-[280px] flex-col items-center justify-center gap-2.5 text-center">
          <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-body font-medium">Todo en orden</p>
          <p className="text-caption text-muted-foreground">Ningún producto por debajo del mínimo.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Reposición</CardTitle>
        <Badge variant="warning">{productos.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-3">
        {productos.map((p) => {
          const agotado = Number(p.stock) === 0;
          return (
            <Link
              key={p.id}
              href="/productos?stock=bajo"
              className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-2.5 transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <AlertTriangle
                className={`h-4 w-4 shrink-0 ${agotado ? "text-destructive" : "text-warning"}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">{p.nombre}</p>
                <p className="text-caption text-muted-foreground">
                  {cant(p.stock)} de {cant(p.stock_minimo)} {p.unidad_medida}
                </p>
              </div>
              <Badge variant={agotado ? "destructive" : "warning"}>{agotado ? "Agotado" : "Bajo"}</Badge>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
