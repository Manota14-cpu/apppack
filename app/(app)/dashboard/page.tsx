import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarValor } from "@/lib/db";
import { CAMPOS_MOVIMIENTO, DESDE_MOVIMIENTOS } from "@/lib/sql";
import { DashboardClient } from "./dashboard-client";
import DashboardLoading from "./loading";
import type { MetricasStock, MovimientoConProducto } from "@/types/database.types";

const METRICAS_VACIAS: MetricasStock = {
  total_productos: 0, valor_costo: 0, valor_venta: 0, unidades_totales: 0,
  stock_bajo: 0, sin_stock: 0, inactivos: 0,
  sin_costo: 0, costo_dudoso: 0, sin_sku: 0, sin_imagen: 0, pedidos_pendientes: 0,
  productos_criticos: [], stock_por_categoria: [],
};

/** Códigos que indican que falta aplicar el esquema, no un fallo real. */
const FALTA_ESTRUCTURA = ["42883", "42P01", "42703"];

async function getDashboard() {
  await requerirSesion();

  try {
    const [metricas, movimientos] = await Promise.all([
      consultarValor<MetricasStock>("select metricas_stock()"),
      consultar<MovimientoConProducto>(
        `select ${CAMPOS_MOVIMIENTO} ${DESDE_MOVIMIENTOS} order by m."createdAt" desc limit 8`
      ),
    ]);

    return { metricas: metricas ?? METRICAS_VACIAS, movimientos, faltaMigracion: false };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code && FALTA_ESTRUCTURA.includes(code)) {
      return { metricas: METRICAS_VACIAS, movimientos: [], faltaMigracion: true };
    }
    throw error;
  }
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardData />
    </Suspense>
  );
}

async function DashboardData() {
  const data = await getDashboard();
  return <DashboardClient {...data} />;
}
