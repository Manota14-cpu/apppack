"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { AlertTriangle, Database, DollarSign, Package, PackageX, RefreshCw } from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { LowStockAlert } from "@/components/dashboard/low-stock-alert";
import { RecentMovements } from "@/components/dashboard/recent-movements";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { MetricasStock, MovimientoConProducto } from "@/types/database.types";

// recharts pesa bastante: se carga aparte para no engordar el bundle inicial.
const StockChart = dynamic(() => import("@/components/dashboard/stock-chart").then((m) => m.StockChart), {
  ssr: false,
  loading: () => <div className="h-[372px] rounded-2xl border border-border bg-card" />,
});

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

interface Props {
  metricas: MetricasStock;
  movimientos: MovimientoConProducto[];
  faltaMigracion: boolean;
}

export function DashboardClient({ metricas, movimientos, faltaMigracion }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actualizado, setActualizado] = useState<Date | null>(null);

  function refrescar() {
    startTransition(() => {
      router.refresh();
      setActualizado(new Date());
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="text-[28px] font-bold tracking-tight">Pack Distribuidora</h1>
          <p className="text-caption mt-1.5 text-muted-foreground">
            {actualizado
              ? `Actualizado a las ${actualizado.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
              : "Control de stock y catálogo"}
          </p>
        </motion.div>
        <Button variant="ghost" size="sm" onClick={refrescar} disabled={isPending} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} aria-hidden="true" />
          {isPending ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>

      {faltaMigracion && (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Falta preparar la base de datos</p>
              <p className="text-caption text-muted-foreground">
                Hasta que ejecutes la migración no vas a poder crear productos ni mover stock. Está todo explicado
                en Configuración.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/configuracion">Ver cómo</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <QuickActions />

      {/* Cada métrica accionable lleva a la lista ya filtrada. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          titulo="Productos activos"
          valor={metricas.total_productos.toLocaleString("es-AR")}
          detalle={`${Number(metricas.unidades_totales).toLocaleString("es-AR")} unidades en total`}
          icono={<Package className="h-4 w-4" />}
          href="/productos"
          index={0}
        />
        <MetricCard
          titulo="Valor de inventario"
          valor={money(Number(metricas.valor_costo))}
          detalle={`${money(Number(metricas.valor_venta))} a precio de venta`}
          icono={<DollarSign className="h-4 w-4" />}
          index={1}
        />
        <MetricCard
          titulo="Stock bajo"
          valor={metricas.stock_bajo.toLocaleString("es-AR")}
          detalle={metricas.stock_bajo > 0 ? "Necesitan reposición" : "Todo por encima del mínimo"}
          icono={<AlertTriangle className="h-4 w-4" />}
          href="/productos?stock=bajo"
          tono={metricas.stock_bajo > 0 ? "alerta" : undefined}
          index={2}
        />
        <MetricCard
          titulo="Sin stock"
          valor={metricas.sin_stock.toLocaleString("es-AR")}
          detalle={metricas.sin_stock > 0 ? "Agotados" : "Ninguno agotado"}
          icono={<PackageX className="h-4 w-4" />}
          href="/productos?stock=sin"
          tono={metricas.sin_stock > 0 ? "critico" : undefined}
          index={3}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <StockChart data={metricas.stock_por_categoria} />
        </div>
        <LowStockAlert productos={metricas.productos_criticos} />
      </div>

      <RecentMovements movimientos={movimientos} />
    </div>
  );
}
