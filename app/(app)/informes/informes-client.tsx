"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Info, PackageSearch, TrendingUp, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PERIODOS, etiquetaPeriodo, type Informe } from "@/lib/informes";
import { money } from "@/lib/formato";

const num = (n: number) => Number(n).toLocaleString("es-AR");

const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  entrada: "Entradas",
  salida: "Salidas",
  venta: "Vendido",
  ajuste: "Ajustes",
  devolucion: "Devuelto",
};

const ETIQUETA_CANAL: Record<string, string> = {
  mostrador: "Mostrador",
  whatsapp: "Tienda web",
  devolucion: "Devoluciones",
};

export function InformesClient({ informe }: { informe: Informe }) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  function cambiarPeriodo(valor: string) {
    startTransition(() => {
      router.replace(valor === "30" ? pathname : `${pathname}?dias=${valor}`, { scroll: false });
    });
  }

  const { ventas } = informe;
  const huboVentas = ventas.pedidos > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Informes</h1>
          <p className="text-caption text-muted-foreground">
            Qué se vendió, qué dejó margen y qué está quieto
          </p>
        </div>
        <Select value={String(informe.dias)} onValueChange={cambiarPeriodo}>
          <SelectTrigger className="w-[190px]" aria-label="Período del informe">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS.map((p) => (
              <SelectItem key={p} value={String(p)}>
                {etiquetaPeriodo(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Resumen del período ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Resumen titulo="Vendido" valor={money(ventas.ingreso)} detalle={`${num(ventas.pedidos)} ${ventas.pedidos === 1 ? "pedido" : "pedidos"}`} />
        <Resumen
          titulo="Margen"
          valor={ventas.margen !== null ? `${ventas.margen}%` : "—"}
          detalle={
            ventas.margen !== null
              ? `${money(ventas.ingreso - ventas.costo)} sobre ${money(ventas.costo)} de costo`
              : "Falta el costo de lo vendido"
          }
        />
        <Resumen titulo="Unidades" valor={num(ventas.unidades)} detalle="Salidas por pedido" />
        <Resumen
          titulo="Ticket promedio"
          valor={ventas.ticket_promedio > 0 ? money(ventas.ticket_promedio) : "—"}
          detalle={huboVentas ? "Por pedido" : "Sin pedidos en el período"}
        />
      </div>

      {/* Un margen del 97% en descartables no es un buen negocio: es un costo
          de relleno. Vale más decirlo que dejar que el número se lea solo. */}
      {informe.ventasConCostoDudoso > 0 && (
        <Card className="border-warning/40">
          <CardContent className="flex items-start gap-2.5 p-4 text-caption">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="text-muted-foreground">
              <strong className="text-foreground">
                El margen de arriba no es creíble para{" "}
                {informe.ventasConCostoDudoso}{" "}
                {informe.ventasConCostoDudoso === 1 ? "producto" : "productos"} vendidos.
              </strong>{" "}
              Tienen un costo cargado tan bajo respecto del precio que deja más del 85% de margen.
              En descartables eso no pasa: lo más probable es que el costo sea de relleno.{" "}
              <Link href="/productos" className="underline">
                Revisalos en Productos
              </Link>{" "}
              y el margen pasa a servir para decidir.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Lo que este informe NO puede ver, dicho antes de que alguien saque
          conclusiones de un número incompleto. */}
      {informe.salidasSinPrecio > 0 && (
        <Card>
          <CardContent className="flex items-start gap-2.5 p-4 text-caption text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Hubo <strong className="text-foreground">{informe.salidasSinPrecio}</strong>{" "}
              {informe.salidasSinPrecio === 1 ? "salida cargada" : "salidas cargadas"} a mano en el
              período. Mueven el stock pero no dicen a cuánto se vendió, así que no entran en el
              ingreso ni en el margen de arriba. Si vendés por mostrador, esa plata no está
              contada acá.
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Qué se vendió ── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-body font-semibold">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
          Qué se vendió
        </h2>

        {informe.porProducto.length === 0 ? (
          <p className="rounded-xl border border-border p-6 text-center text-caption text-muted-foreground">
            No hubo ventas en este período. Probá con un rango más largo.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {informe.porProducto.map((v) => (
              <li
                key={`${v.producto_id ?? v.nombre}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-caption font-medium">{v.nombre}</span>
                <span className="font-mono-num text-caption text-muted-foreground">
                  {num(v.unidades)} u.
                </span>
                {v.margen !== null && (
                  <Badge variant={v.margen >= 30 ? "success" : v.margen > 0 ? "default" : "warning"}>
                    {v.margen}% margen
                  </Badge>
                )}
                <span className="font-mono-num text-caption font-semibold">{money(v.ingreso)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── De dónde vino la plata ── */}
      {informe.porCanal.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-body font-semibold">De dónde vino</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {informe.porCanal.map((c) => {
              const parte =
                ventas.ingreso > 0 ? Math.round((c.ingreso / ventas.ingreso) * 100) : 0;
              return (
                <li key={c.canal} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                  <span className="min-w-0 flex-1 text-caption font-medium">
                    {ETIQUETA_CANAL[c.canal] ?? c.canal}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {num(c.pedidos)} {c.pedidos === 1 ? "venta" : "ventas"}
                  </span>
                  {parte > 0 && <Badge variant="outline">{parte}%</Badge>}
                  <span className="font-mono-num text-caption font-semibold">
                    {money(c.ingreso)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-caption text-muted-foreground">
            Las devoluciones figuran en negativo, así que restan del canal por el que salieron.
          </p>
        </section>
      )}

      {/* ── Movimientos de stock ── */}
      {informe.movimientos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-body font-semibold">Movimiento de stock</h2>
          <div className="flex flex-wrap gap-6 rounded-xl border border-border p-4">
            {informe.movimientos.map((m) => (
              <div key={m.tipo}>
                <p className="text-overline text-muted-foreground">
                  {ETIQUETA_MOVIMIENTO[m.tipo] ?? m.tipo}
                </p>
                <p className="font-mono-num text-body-lg font-semibold">{num(m.cantidad)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Capital dormido ── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-body font-semibold">
            <PackageSearch className="h-4 w-4" aria-hidden="true" />
            Sin vender en el período
          </h2>
          {informe.capitalQuieto > 0 && (
            <p className="text-caption text-muted-foreground">
              <strong className="text-foreground">{money(informe.capitalQuieto)}</strong> de
              mercadería quieta
            </p>
          )}
        </div>

        {informe.inmovilizado.length === 0 ? (
          <p className="rounded-xl border border-border p-6 text-center text-caption text-muted-foreground">
            Todo el catálogo con stock tuvo al menos una venta en el período.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {informe.inmovilizado.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-caption font-medium">{p.nombre}</span>
                    <span className="block text-caption text-muted-foreground">
                      {p.categoria}
                      {p.dias_quieto !== null
                        ? ` · sin moverse hace ${p.dias_quieto} ${p.dias_quieto === 1 ? "día" : "días"}`
                        : " · nunca se movió"}
                    </span>
                  </span>
                  <span className="font-mono-num text-caption text-muted-foreground">
                    {num(p.stock)} {p.unidad_medida}
                  </span>
                  <span className="font-mono-num text-caption font-semibold">{money(p.capital)}</span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted-foreground">
              Es plata comprada que todavía no volvió. No significa que esté mal: significa que
              antes de reponer alguno de estos, conviene mirar por qué no sale.{" "}
              <Link href="/productos" className="underline">
                Ver el catálogo
              </Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Resumen({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-overline text-muted-foreground">{titulo}</p>
        <p className="mt-1 font-mono-num text-[26px] font-bold leading-none tracking-tight">
          {valor}
        </p>
        <p className="text-caption text-muted-foreground mt-1.5">{detalle}</p>
      </CardContent>
    </Card>
  );
}
