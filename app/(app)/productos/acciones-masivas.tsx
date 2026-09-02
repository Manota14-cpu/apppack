"use client";

import { useState } from "react";
import { ArrowRight, Percent, Tags, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  aplicarAjustePrecios,
  cambiarMasivo,
  previsualizarAjustePrecios,
  type VistaPrevioPrecio,
} from "@/lib/actions/productos-actions";
import { REDONDEOS } from "@/lib/validation";
import type { Categoria } from "@/types/database.types";

const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

/** Barra que aparece al seleccionar productos, sin empujar el listado. */
export function BarraSeleccion({
  cantidad,
  onLimpiar,
  onPrecios,
  onEtiquetas,
}: {
  cantidad: number;
  onLimpiar: () => void;
  onPrecios: () => void;
  onEtiquetas: () => void;
}) {
  if (cantidad === 0) return null;

  return (
    <div className="sticky bottom-20 z-30 lg:bottom-4">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-2.5 shadow-lg backdrop-blur-xl">
        <span className="pl-2 text-caption font-medium" aria-live="polite">
          {cantidad} {cantidad === 1 ? "seleccionado" : "seleccionados"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={onPrecios}>
            <Percent className="h-3.5 w-3.5" />
            Cambiar precios
          </Button>
          <Button size="sm" variant="secondary" onClick={onEtiquetas}>
            <Tags className="h-3.5 w-3.5" />
            Categoría y carteles
          </Button>
          <Button size="sm" variant="ghost" onClick={onLimpiar} aria-label="Limpiar selección">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Remarcación por porcentaje.
 *
 * Confirma mostrando los precios finales, no el porcentaje: un 12% aplicado a
 * treinta productos es un número que nadie puede verificar de cabeza, y el
 * error se descubriría recién en la tienda.
 */
export function PreciosMasivosDialog({
  open,
  onOpenChange,
  ids,
  onListo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: string[];
  onListo: () => void;
}) {
  const [porcentaje, setPorcentaje] = useState("10");
  const [aplicarA, setAplicarA] = useState<"venta" | "costo" | "ambos">("venta");
  const [redondeo, setRedondeo] = useState("10");
  const [vista, setVista] = useState<VistaPrevioPrecio[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function cerrar(o: boolean) {
    if (!o) setVista(null);
    onOpenChange(o);
  }

  const entrada = () => ({
    ids,
    porcentaje: Number(porcentaje),
    aplicarA,
    redondeo: Number(redondeo),
    motivo: `Ajuste masivo ${Number(porcentaje) > 0 ? "+" : ""}${porcentaje}%`,
  });

  async function verPrevio() {
    setOcupado(true);
    try {
      const r = await previsualizarAjustePrecios(entrada());
      if (!r.success) return void toast.error(r.error);
      setVista(r.vista);
    } finally {
      setOcupado(false);
    }
  }

  async function aplicar() {
    setOcupado(true);
    try {
      const r = await aplicarAjustePrecios(entrada());
      if (!r.success) return void toast.error(r.error);
      toast.success(
        `${r.actualizados} ${r.actualizados === 1 ? "producto actualizado" : "productos actualizados"}`
      );
      cerrar(false);
      onListo();
    } finally {
      setOcupado(false);
    }
  }

  const cambian = vista?.filter(
    (v) => v.precio_venta_nuevo !== v.precio_venta || v.precio_costo_nuevo !== v.precio_costo
  );

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cambiar precios</DialogTitle>
          <DialogDescription>
            {ids.length} {ids.length === 1 ? "producto seleccionado" : "productos seleccionados"}.
            Vas a ver los precios finales antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        {vista === null ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="m-pct">Porcentaje</Label>
              <div className="relative">
                <Input
                  id="m-pct"
                  type="number"
                  step="0.5"
                  value={porcentaje}
                  onChange={(e) => setPorcentaje(e.target.value)}
                  inputMode="decimal"
                  autoFocus
                  className="pr-9"
                />
                <span
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                >
                  %
                </span>
              </div>
              <p className="text-caption text-muted-foreground">
                Negativo para bajar precios. Ejemplo: -15 aplica un 15% de descuento.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Aplicar a</Label>
                <Select value={aplicarA} onValueChange={(v) => setAplicarA(v as typeof aplicarA)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="venta">Precio de venta</SelectItem>
                    <SelectItem value="costo">Precio de costo</SelectItem>
                    <SelectItem value="ambos">Los dos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Redondear a</Label>
                <Select value={redondeo} onValueChange={setRedondeo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REDONDEOS.map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        {r === 1 ? "Al peso" : `Múltiplo de ${r}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-caption text-muted-foreground">
              Los productos en oferta remarcan también su precio tachado, para que no queden
              «rebajados» por encima de su precio anterior.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => cerrar(false)}>
                Cancelar
              </Button>
              <Button onClick={verPrevio} disabled={ocupado || !porcentaje}>
                {ocupado ? "Calculando…" : "Ver el resultado"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {cambian && cambian.length === 0 ? (
              <p className="rounded-xl border border-border p-4 text-caption text-muted-foreground">
                Con ese porcentaje y ese redondeo, ningún precio cambia.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {vista.map((v) => {
                  const cambiaVenta = v.precio_venta_nuevo !== v.precio_venta;
                  const cambiaCosto = v.precio_costo_nuevo !== v.precio_costo;
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-caption">{v.nombre}</span>
                      <span className="flex shrink-0 items-center gap-1.5 font-mono-num text-caption">
                        {cambiaVenta ? (
                          <>
                            <span className="text-muted-foreground line-through">
                              {money(v.precio_venta)}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                            <span className="font-semibold">{money(v.precio_venta_nuevo)}</span>
                          </>
                        ) : cambiaCosto ? (
                          <>
                            <span className="text-overline text-muted-foreground">costo</span>
                            <span className="text-muted-foreground line-through">
                              {money(v.precio_costo)}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                            <span className="font-semibold">{money(v.precio_costo_nuevo)}</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">sin cambio</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setVista(null)}>
                Volver
              </Button>
              <Button onClick={aplicar} disabled={ocupado || cambian?.length === 0}>
                {ocupado
                  ? "Aplicando…"
                  : `Aplicar a ${cambian?.length ?? 0} ${cambian?.length === 1 ? "producto" : "productos"}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Estado de tres posiciones: dejar como está, encender o apagar. */
type Tri = "sin-cambio" | "si" | "no";
const aBool = (t: Tri): boolean | null => (t === "sin-cambio" ? null : t === "si");

export function EtiquetasMasivasDialog({
  open,
  onOpenChange,
  ids,
  categorias,
  onListo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ids: string[];
  categorias: Categoria[];
  onListo: () => void;
}) {
  const [categoria, setCategoria] = useState("sin-cambio");
  const [destacado, setDestacado] = useState<Tri>("sin-cambio");
  const [masVendido, setMasVendido] = useState<Tri>("sin-cambio");
  const [esNuevo, setEsNuevo] = useState<Tri>("sin-cambio");
  const [visible, setVisible] = useState<Tri>("sin-cambio");
  const [ocupado, setOcupado] = useState(false);

  async function aplicar() {
    setOcupado(true);
    try {
      const r = await cambiarMasivo({
        ids,
        categoria_id: categoria === "sin-cambio" ? null : categoria,
        destacado: aBool(destacado),
        mas_vendido: aBool(masVendido),
        es_nuevo: aBool(esNuevo),
        activo: aBool(visible),
      });
      if (!r.success) return void toast.error(r.error);
      toast.success(
        `${r.actualizados} ${r.actualizados === 1 ? "producto actualizado" : "productos actualizados"}`
      );
      onOpenChange(false);
      onListo();
    } finally {
      setOcupado(false);
    }
  }

  const campos: { etiqueta: string; ayuda: string; valor: Tri; set: (t: Tri) => void }[] = [
    { etiqueta: "Destacado", ayuda: "Sale en la portada", valor: destacado, set: setDestacado },
    { etiqueta: "Más vendido", ayuda: "Lleva cartel y sube en el orden", valor: masVendido, set: setMasVendido },
    { etiqueta: "Novedad", ayuda: "Lleva cartel «Nuevo»", valor: esNuevo, set: setEsNuevo },
    { etiqueta: "Visible en la tienda", ayuda: "Apagado, deja de aparecer", valor: visible, set: setVisible },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Categoría y carteles</DialogTitle>
          <DialogDescription>
            Lo que dejes en «Sin cambio» no se toca en ninguno de los{" "}
            {ids.length} {ids.length === 1 ? "producto" : "productos"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sin-cambio">Sin cambio</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {campos.map((c) => (
            <div key={c.etiqueta} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-caption font-medium">{c.etiqueta}</p>
                <p className="text-caption text-muted-foreground">{c.ayuda}</p>
              </div>
              <Select value={c.valor} onValueChange={(v) => c.set(v as Tri)}>
                <SelectTrigger className="w-[140px] shrink-0" aria-label={c.etiqueta}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin-cambio">Sin cambio</SelectItem>
                  <SelectItem value="si">Encender</SelectItem>
                  <SelectItem value="no">Apagar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={aplicar} disabled={ocupado}>
              {ocupado ? "Aplicando…" : "Aplicar cambios"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Casilla de selección de una fila.
 *
 * Lleva su propia etiqueta con el nombre del producto: una columna de casillas
 * sin nombre le suena a un lector de pantalla como veinticinco «casilla,
 * casilla, casilla» sin decir de qué.
 */
export function CasillaFila({
  marcada,
  onCambio,
  nombre,
}: {
  marcada: boolean;
  onCambio: (m: boolean) => void;
  nombre: string;
}) {
  return (
    <Checkbox
      checked={marcada}
      onChange={(e) => onCambio(e.target.checked)}
      aria-label={`Seleccionar ${nombre}`}
    />
  );
}

/** Cartelito con lo que falta cargar, para que el hueco no pase inadvertido. */
export function AvisoDatosFaltantes({
  sinSku,
  sinCosto,
  costoDudoso,
  onSkus,
  onCostos,
}: {
  sinSku: number;
  sinCosto: number;
  /** Con un costo tan bajo respecto del precio que no puede ser real. */
  costoDudoso: number;
  onSkus: () => void;
  onCostos: () => void;
}) {
  if (sinSku === 0 && sinCosto === 0 && costoDudoso === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning/[0.06] px-4 py-3">
      <Badge variant="warning">Datos incompletos</Badge>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
        {sinSku > 0 && (
          <span>
            <strong className="text-foreground">{sinSku}</strong> sin SKU — la importación no puede
            actualizarlos y duplicaría el catálogo.
          </span>
        )}
        {sinCosto > 0 && (
          <span>
            <strong className="text-foreground">{sinCosto}</strong> sin costo — el valor de
            inventario los ignora.
          </span>
        )}
        {/* Un costo inventado miente peor que uno ausente: el número vacío se
            nota, el inventado se cree. */}
        {costoDudoso > 0 && (
          <span>
            <strong className="text-foreground">{costoDudoso}</strong> con un costo que deja más
            del 85% de margen — si es de relleno, el margen del informe es ficción.
          </span>
        )}
      </div>
      <div className="ml-auto flex gap-2">
        {sinSku > 0 && (
          <Button size="sm" variant="outline" onClick={onSkus}>
            Generar SKUs
          </Button>
        )}
        {(sinCosto > 0 || costoDudoso > 0) && (
          <Button size="sm" variant="outline" onClick={onCostos}>
            {sinCosto > 0 ? "Cargar costos" : "Revisar costos"}
          </Button>
        )}
      </div>
    </div>
  );
}
