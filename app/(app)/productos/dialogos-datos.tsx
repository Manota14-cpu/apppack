"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  aplicarSkus,
  guardarCostos,
  productosSinCosto,
  proponerSkus,
  type ProductoSinDato,
  type SkuPropuesto,
} from "@/lib/actions/productos-actions";
import { margen } from "@/lib/precios";

const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

/**
 * Carga rápida de precios de costo.
 *
 * Una sola columna editable, ordenada por precio de venta descendente: los
 * productos caros son los que más distorsionan el valor de inventario, así que
 * cargar los primeros diez ya arregla la mayor parte del número.
 */
export function CostosDialog({
  open,
  onOpenChange,
  onListo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onListo: () => void;
}) {
  const [filas, setFilas] = useState<ProductoSinDato[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  // Se monta al abrirse, así que no hay estado viejo que limpiar.
  useEffect(() => {
    productosSinCosto().then(setFilas);
  }, []);

  const cargados = Object.entries(valores).filter(([, v]) => Number(v) > 0);

  async function guardar() {
    setGuardando(true);
    try {
      const r = await guardarCostos(
        cargados.map(([id, v]) => ({ id, precio_costo: Number(v) }))
      );
      if (!r.success) return void toast.error(r.error);
      toast.success(`${r.guardados} ${r.guardados === 1 ? "costo guardado" : "costos guardados"}`);
      onOpenChange(false);
      onListo();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar costos</DialogTitle>
          <DialogDescription>
            Sin precio de costo, el valor de inventario del panel ignora al producto y no hay
            margen que calcular. Podés cargar los que sepas y dejar el resto para después.
          </DialogDescription>
        </DialogHeader>

        {filas === null ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filas.length === 0 ? (
          <p className="rounded-xl border border-border p-6 text-center text-caption text-muted-foreground">
            Todos los productos activos ya tienen su costo cargado.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {filas.map((f) => {
                const valor = valores[f.id] ?? "";
                const m = margen(f.precio_venta, Number(valor));
                return (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-caption font-medium">{f.nombre}</p>
                      <p className="text-caption text-muted-foreground">
                        {f.categoria} · vende a {money(f.precio_venta)}
                        {m !== null && ` · margen ${m}%`}
                      </p>
                    </div>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      inputMode="numeric"
                      value={valor}
                      onChange={(e) => setValores((p) => ({ ...p, [f.id]: e.target.value }))}
                      placeholder="Costo"
                      aria-label={`Precio de costo de ${f.nombre}`}
                      className="h-10 w-28 shrink-0 text-right"
                    />
                  </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-end gap-2 pt-2">
              <span className="mr-auto text-caption text-muted-foreground" aria-live="polite">
                {cargados.length} de {filas.length} cargados
              </span>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={guardando || cargados.length === 0}>
                {guardando ? "Guardando…" : `Guardar ${cargados.length}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Genera SKUs para los productos que no tienen, revisables antes de aplicar.
 *
 * El SKU es la llave con la que la importación de Excel reconoce un producto
 * existente: sin él solo puede crear, así que subir una lista de precios
 * duplicaría el catálogo entero en vez de actualizarlo.
 */
export function SkusDialog({
  open,
  onOpenChange,
  onListo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onListo: () => void;
}) {
  const [propuestas, setPropuestas] = useState<SkuPropuesto[] | null>(null);
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [aplicando, setAplicando] = useState(false);

  // Se monta al abrirse, así que no hay estado viejo que limpiar.
  useEffect(() => {
    proponerSkus().then(setPropuestas);
  }, []);

  const finales = (propuestas ?? []).map((p) => ({
    id: p.id,
    sku: (editados[p.id] ?? p.sku).trim(),
  }));
  const validos = finales.filter((f) => f.sku.length > 0);
  const repetidos = new Set(
    validos.map((f) => f.sku.toUpperCase()).filter((s, i, a) => a.indexOf(s) !== i)
  );

  async function aplicar() {
    if (repetidos.size > 0) {
      return void toast.error("Hay SKUs repetidos entre los propuestos. Corregilos antes de aplicar.");
    }
    setAplicando(true);
    try {
      const r = await aplicarSkus(validos);
      if (!r.success) return void toast.error(r.error);
      toast.success(`${r.aplicados} ${r.aplicados === 1 ? "SKU asignado" : "SKUs asignados"}`);
      onOpenChange(false);
      onListo();
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generar SKUs</DialogTitle>
          <DialogDescription>
            Tres letras de la categoría, tres del producto y un correlativo. Podés editar
            cualquiera antes de aplicar; los que dejes vacíos no se tocan.
          </DialogDescription>
        </DialogHeader>

        {propuestas === null ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : propuestas.length === 0 ? (
          <p className="rounded-xl border border-border p-6 text-center text-caption text-muted-foreground">
            Todos los productos ya tienen SKU.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {propuestas.map((p) => {
                const valor = editados[p.id] ?? p.sku;
                const duplicado = repetidos.has(valor.trim().toUpperCase());
                return (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-caption font-medium">{p.nombre}</p>
                      <p className="text-caption text-muted-foreground">{p.categoria}</p>
                    </div>
                    <Input
                      value={valor}
                      onChange={(e) => setEditados((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      maxLength={64}
                      aria-label={`SKU de ${p.nombre}`}
                      aria-invalid={duplicado}
                      className={`h-10 w-40 shrink-0 font-mono text-caption ${
                        duplicado ? "border-destructive" : ""
                      }`}
                    />
                  </li>
                );
              })}
            </ul>

            {repetidos.size > 0 && (
              <p className="text-caption text-destructive">
                Hay {repetidos.size} {repetidos.size === 1 ? "SKU repetido" : "SKUs repetidos"}. Un
                SKU tiene que ser único para que la importación no confunda dos productos.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={aplicar} disabled={aplicando || validos.length === 0}>
                {aplicando ? "Aplicando…" : `Asignar ${validos.length}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
