"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useDebounce } from "@/lib/use-debounce";
import { money } from "@/lib/formato";
import { editarPedido } from "@/lib/actions/pedidos-actions";
import { buscarParaCobrar, type ProductoParaCobrar } from "@/lib/actions/caja-actions";
import { totalDeCobro } from "@/lib/validation";
import type { Pedido } from "@/types/database.types";


interface Renglon {
  producto_id: string | null;
  nombre: string;
  unidad_medida: string;
  precio: number;
  cantidad: number;
}

/**
 * Corregir un pedido ya cargado.
 *
 * El stock se reconcilia por diferencia en la base: subir una cantidad la
 * descuenta del depósito, bajarla la devuelve, y cada movimiento queda anotado.
 * Sin eso, corregir un pedido dejaría el stock mintiendo — que es justamente
 * lo que esta app existe para evitar.
 */
export function EditarPedidoDialog({
  pedido,
  onOpenChange,
  onListo,
}: {
  pedido: Pedido;
  onOpenChange: (o: boolean) => void;
  onListo: () => void;
}) {
  // El diálogo se monta por pedido —lleva su id como `key`—, así que el estado
  // arranca ya cargado. Hacerlo en un efecto obligaría a un render extra y a
  // acordarse de limpiarlo al cambiar de pedido.
  const [items, setItems] = useState<Renglon[]>(() =>
    pedido.items.map((i) => ({
      producto_id: i.producto_id,
      nombre: i.nombre,
      unidad_medida: i.unidad_medida,
      precio: i.precio,
      cantidad: i.cantidad,
    }))
  );
  const [nombre, setNombre] = useState(pedido.nombre);
  const [notas, setNotas] = useState(pedido.notas ?? "");
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda, 250);
  const [resultados, setResultados] = useState<ProductoParaCobrar[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const termino = busquedaDebounced.trim();
    if (termino.length < 2) return;
    let vigente = true;
    buscarParaCobrar(termino).then((r) => {
      if (vigente) setResultados(r);
    });
    return () => {
      vigente = false;
    };
  }, [busquedaDebounced]);

  const total = useMemo(() => totalDeCobro(items), [items]);
  const original = pedido.total;
  const diferencia = total - original;

  function agregar(p: ProductoParaCobrar) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.producto_id === p.id);
      if (i >= 0) {
        const copia = [...prev];
        copia[i] = { ...copia[i]!, cantidad: copia[i]!.cantidad + 1 };
        return copia;
      }
      return [
        ...prev,
        {
          producto_id: p.id,
          nombre: p.nombre,
          unidad_medida: p.unidad_medida,
          precio: p.precio,
          cantidad: 1,
        },
      ];
    });
    setBusqueda("");
    setResultados([]);
  }

  async function guardar() {
    setGuardando(true);
    try {
      const r = await editarPedido({ pedidoId: pedido.id, nombre, notas, items });
      if (!r.success) return void toast.error(r.error);
      toast.success(`Pedido #${r.numero} actualizado`, {
        description:
          diferencia === 0
            ? money(r.total)
            : `${money(r.total)} · ${diferencia > 0 ? "+" : ""}${money(diferencia)} respecto de antes`,
      });
      onOpenChange(false);
      onListo();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar el pedido #{pedido.numero}</DialogTitle>
          <DialogDescription>
            Al guardar, el stock se ajusta por la diferencia: lo que agregues sale del depósito y lo
            que quites vuelve, con su movimiento en el historial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                if (e.target.value.trim().length < 2) setResultados([]);
              }}
              placeholder="Agregar un producto al pedido…"
              aria-label="Buscar producto para agregar al pedido"
            />
          </div>

          {resultados.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => agregar(p)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 truncate text-caption font-medium">{p.nombre}</span>
                    <span className="shrink-0 font-mono-num text-caption">{money(p.precio)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-caption text-warning">
              Un pedido no puede quedar sin renglones. Agregá al menos uno, o cerrá sin guardar.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {items.map((it, i) => (
                <li key={it.producto_id ?? i} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-caption font-medium">
                    {it.nombre}
                  </span>

                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setItems((prev) => {
                          const copia = [...prev];
                          copia[i] = { ...copia[i]!, cantidad: Math.max(1, copia[i]!.cantidad - 1) };
                          return copia;
                        })
                      }
                      disabled={it.cantidad <= 1}
                      aria-label={`Quitar uno de ${it.nombre}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-8 text-center font-mono-num text-caption font-semibold">
                      {it.cantidad}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setItems((prev) => {
                          const copia = [...prev];
                          copia[i] = { ...copia[i]!, cantidad: copia[i]!.cantidad + 1 };
                          return copia;
                        })
                      }
                      aria-label={`Agregar uno de ${it.nombre}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </span>

                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={it.precio}
                    onChange={(e) =>
                      setItems((prev) => {
                        const copia = [...prev];
                        copia[i] = {
                          ...copia[i]!,
                          precio: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        };
                        return copia;
                      })
                    }
                    aria-label={`Precio de ${it.nombre}`}
                    className="h-10 w-28 shrink-0 text-right"
                  />

                  <span className="w-24 shrink-0 text-right font-mono-num text-caption font-semibold">
                    {money(it.precio * it.cantidad)}
                  </span>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Quitar ${it.nombre} del pedido`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ed-nombre">Cliente</Label>
              <Input
                id="ed-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={160}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ed-notas">Nota interna</Label>
              <Textarea
                id="ed-notas"
                rows={1}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                maxLength={1000}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div>
              <p className="font-mono-num text-[22px] font-bold leading-none">{money(total)}</p>
              {diferencia !== 0 && (
                <p className="text-caption text-muted-foreground mt-1">
                  antes {money(original)} · {diferencia > 0 ? "+" : ""}
                  {money(diferencia)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={guardando || items.length === 0}>
                {guardando ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
