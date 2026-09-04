"use client";

import { useEffect, useState } from "react";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { historialPrecios } from "@/lib/actions/productos-actions";
import { margen } from "@/lib/precios";
import type { CambioPrecio, Fecha, ProductoConCategoria } from "@/types/database.types";

const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const fecha = (valor: Fecha) =>
  new Date(valor).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Historial de precios de un producto.
 *
 * El stock siempre tuvo su historial de movimientos; el precio no, y con
 * inflación «¿cuánto costaba esto en marzo?» era una pregunta sin respuesta.
 * Lo alimenta un disparador en la base, así que también registra las
 * remarcaciones masivas y cualquier cambio hecho por fuera de este panel.
 */
export function HistorialPreciosDialog({
  producto,
  onOpenChange,
}: {
  producto: ProductoConCategoria | null;
  onOpenChange: (o: boolean) => void;
}) {
  const [cambios, setCambios] = useState<CambioPrecio[] | null>(null);

  // Se monta al abrirse: el estado ya arranca vacío.
  useEffect(() => {
    if (!producto) return;
    historialPrecios(producto.id).then(setCambios);
  }, [producto]);

  const actual = producto ? Number(producto.precio_venta) : 0;
  const costoActual = producto ? Number(producto.precio_costo) : 0;
  const m = margen(actual, costoActual);

  return (
    <Dialog open={producto !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de precios</DialogTitle>
          <DialogDescription>{producto?.nombre}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-6 rounded-xl border border-border p-4">
          <div>
            <p className="text-overline text-muted-foreground">Precio hoy</p>
            <p className="font-mono-num text-body-lg font-semibold">{money(actual)}</p>
          </div>
          <div>
            <p className="text-overline text-muted-foreground">Costo</p>
            <p className="font-mono-num text-body-lg font-semibold">
              {costoActual > 0 ? money(costoActual) : "—"}
            </p>
          </div>
          <div>
            <p className="text-overline text-muted-foreground">Margen</p>
            <p className="font-mono-num text-body-lg font-semibold">{m !== null ? `${m}%` : "—"}</p>
          </div>
        </div>

        {cambios === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : cambios.length === 0 ? (
          <p className="rounded-xl border border-border p-6 text-center text-caption text-muted-foreground">
            Todavía no hubo cambios de precio registrados. A partir de ahora, cada uno queda
            anotado acá.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {cambios.map((c) => {
              const cambioVenta = c.precio_nuevo !== c.precio_anterior;
              const subio = c.precio_nuevo > c.precio_anterior;
              const pct =
                c.precio_anterior > 0
                  ? Math.round(((c.precio_nuevo - c.precio_anterior) / c.precio_anterior) * 100)
                  : null;

              return (
                <li key={c.id} className="px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {cambioVenta ? (
                        <p className="flex items-center gap-1.5 font-mono-num text-caption">
                          <span className="text-muted-foreground line-through">
                            {money(c.precio_anterior)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          <span className="font-semibold">{money(c.precio_nuevo)}</span>
                          {pct !== null && pct !== 0 && (
                            <span
                              className={`inline-flex items-center gap-0.5 ${
                                subio ? "text-warning" : "text-success"
                              }`}
                            >
                              {subio ? (
                                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <TrendingDown className="h-3 w-3" aria-hidden="true" />
                              )}
                              {pct > 0 ? "+" : ""}
                              {pct}%
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="font-mono-num text-caption">
                          <span className="text-muted-foreground">Costo: </span>
                          {c.costo_anterior !== null ? money(c.costo_anterior) : "—"} →{" "}
                          <span className="font-semibold">
                            {c.costo_nuevo !== null ? money(c.costo_nuevo) : "—"}
                          </span>
                        </p>
                      )}
                      {c.motivo && (
                        <p className="mt-0.5 text-caption text-muted-foreground">{c.motivo}</p>
                      )}
                    </div>
                    <time
                      className="shrink-0 text-caption text-muted-foreground"
                      dateTime={new Date(c.created_at).toISOString()}
                    >
                      {fecha(c.created_at)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
