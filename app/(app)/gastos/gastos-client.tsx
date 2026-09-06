"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Download, Lock, Pencil, Plus, Receipt, Search, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputNumero } from "@/components/ui/input-numero";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { money } from "@/lib/formato";
import { useDebounce } from "@/lib/use-debounce";
import { descargarGastos } from "@/lib/excel-cliente";
import {
  CATEGORIAS_GASTO,
  PERIODOS_GASTO,
  etiquetaCategoria,
  etiquetaPeriodoGasto,
  hoyLocal,
  resumirGastos,
} from "@/lib/gastos";
import { METODOS_PAGO } from "@/types/database.types";
import { actualizarGasto, borrarGasto, crearGasto } from "@/lib/actions/gastos-actions";
import type { Gasto } from "@/types/database.types";

const ETIQUETA_MEDIO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  otro: "Otro",
};

/** aaaa-mm-dd a «6 sep 2026», sin que la zona horaria corra el día. */
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  gastos: Gasto[];
  caja: { id: string; numero: number } | null;
  filtros: { q: string; categoria: string; dias: string };
}

export function GastosClient({ gastos, caja, filtros }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [busqueda, setBusqueda] = useState(filtros.q);
  const busquedaDebounced = useDebounce(busqueda, 300);
  const primeraCarga = useRef(true);

  const actualizarUrl = useCallback(
    (cambios: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (!valor || valor === "todas" || valor === "90") params.delete(clave);
        else params.set(clave, valor);
      }
      startTransition(() => {
        router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    if (busquedaDebounced !== filtros.q) actualizarUrl({ q: busquedaDebounced || null });
  }, [busquedaDebounced, filtros.q, actualizarUrl]);

  const [crearAbierto, setCrearAbierto] = useState(false);
  const [editando, setEditando] = useState<Gasto | null>(null);
  const [borrando, setBorrando] = useState<Gasto | null>(null);
  const [descargando, setDescargando] = useState(false);

  const resumen = useMemo(() => resumirGastos(gastos), [gastos]);
  const refrescar = () => startTransition(() => router.refresh());

  async function confirmarBorrado() {
    if (!borrando) return;
    const r = await borrarGasto(borrando.id);
    if (!r.success) return void toast.error(r.error);
    toast.success("Gasto borrado");
    setBorrando(null);
    refrescar();
  }

  async function descargar() {
    setDescargando(true);
    try {
      await descargarGastos(gastos, etiquetaPeriodoGasto(Number(filtros.dias)));
      toast.success("Gastos descargados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Gastos</h1>
          <p className="text-caption text-muted-foreground">
            Lo que se paga para tener abierto: fletes, servicios, proveedores.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={descargar}
            disabled={descargando || gastos.length === 0}
          >
            <Download className="h-4 w-4" />
            {descargando ? "Generando…" : "Descargar"}
          </Button>
          <Button size="sm" onClick={() => setCrearAbierto(true)}>
            <Plus className="h-4 w-4" />
            Anotar gasto
          </Button>
        </div>
      </div>

      {gastos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Resumen
            titulo="Total del período"
            valor={money(resumen.total)}
            detalle={`${resumen.cantidad} ${resumen.cantidad === 1 ? "gasto" : "gastos"}`}
          />
          <Resumen
            titulo="Costo de tener abierto"
            valor={money(resumen.operativos)}
            detalle="Todo menos las compras de mercadería"
          />
          <Resumen
            titulo="Mercadería"
            valor={money(resumen.mercaderia)}
            detalle="No es pérdida: es stock que todavía no vendiste"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por concepto, proveedor o comprobante…"
            aria-label="Buscar gastos"
          />
        </div>
        <Select value={filtros.categoria} onValueChange={(v) => actualizarUrl({ categoria: v })}>
          <SelectTrigger className="w-[190px]" aria-label="Filtrar por categoría">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {CATEGORIAS_GASTO.map((c) => (
              <SelectItem key={c.valor} value={c.valor}>
                {c.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtros.dias} onValueChange={(v) => actualizarUrl({ dias: v })}>
          <SelectTrigger className="w-[160px]" aria-label="Filtrar por período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS_GASTO.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {etiquetaPeriodoGasto(d)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {gastos.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <Receipt className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-body-lg font-semibold">
              {filtros.q || filtros.categoria !== "todas"
                ? "Ningún gasto coincide"
                : "Todavía no anotaste gastos"}
            </p>
            <p className="mx-auto max-w-md text-caption text-muted-foreground">
              {filtros.q || filtros.categoria !== "todas"
                ? "Probá con otro texto, otra categoría o un período más largo."
                : "Anotá un flete, la boleta de la luz o un pago a un proveedor. Con eso los informes pueden decir qué quedó de verdad, no solo cuánto se vendió."}
            </p>
          </div>
          {!filtros.q && (
            <Button onClick={() => setCrearAbierto(true)}>
              <Plus className="h-4 w-4" />
              Anotar gasto
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5" aria-label="Listado de gastos">
          {gastos.map((g) => (
            <li key={g.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{g.concepto}</p>
                  <p className="mt-0.5 text-caption text-muted-foreground">
                    {[
                      fechaCorta(g.fecha),
                      etiquetaCategoria(g.categoria),
                      ETIQUETA_MEDIO[g.metodo_pago] ?? g.metodo_pago,
                      g.proveedor,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(g.comprobante || g.notas) && (
                    <p className="mt-1 text-caption text-muted-foreground/80">
                      {[g.comprobante && `Comprobante ${g.comprobante}`, g.notas]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono-num font-semibold">{money(g.monto)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditando(g)}
                    aria-label={`Editar ${g.concepto}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setBorrando(g)}
                    aria-label={`Borrar ${g.concepto}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {g.caja_id && (
                <div className="mt-3 border-t border-border pt-3">
                  <Badge variant={g.caja_abierta ? "outline" : "default"}>
                    {g.caja_abierta ? (
                      <Wallet className="mr-1 h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                    )}
                    {g.caja_abierta
                      ? `Salió de la caja #${g.caja_numero}`
                      : `Salió de la caja #${g.caja_numero}, ya cerrada`}
                  </Badge>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {crearAbierto && (
        <GastoDialog
          titulo="Anotar gasto"
          caja={caja}
          onOpenChange={setCrearAbierto}
          onListo={refrescar}
        />
      )}
      {editando && (
        <GastoDialog
          key={editando.id}
          titulo="Editar gasto"
          gasto={editando}
          caja={caja}
          onOpenChange={(o) => !o && setEditando(null)}
          onListo={refrescar}
        />
      )}

      <ConfirmDialog
        open={borrando !== null}
        onOpenChange={(o) => !o && setBorrando(null)}
        titulo="¿Borrar este gasto?"
        descripcion={
          borrando?.caja_id && borrando.caja_abierta
            ? `Se borra «${borrando.concepto}» y también el retiro que dejó en la caja #${borrando.caja_numero}.`
            : `Se borra «${borrando?.concepto}». No se puede deshacer.`
        }
        confirmar="Borrar"
        destructivo
        onConfirm={confirmarBorrado}
      />
    </div>
  );
}

function Resumen({
  titulo,
  valor,
  detalle,
}: {
  titulo: string;
  valor: string;
  detalle: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-caption text-muted-foreground">{titulo}</p>
      <p className="mt-1 font-mono-num text-[20px] font-semibold">{valor}</p>
      <p className="mt-0.5 text-caption text-muted-foreground/80">{detalle}</p>
    </div>
  );
}

function GastoDialog({
  titulo,
  gasto,
  caja,
  onOpenChange,
  onListo,
}: {
  titulo: string;
  gasto?: Gasto;
  caja: { id: string; numero: number } | null;
  onOpenChange: (o: boolean) => void;
  onListo: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [metodo, setMetodo] = useState(gasto?.metodo_pago ?? "efectivo");
  const [categoria, setCategoria] = useState(gasto?.categoria ?? "envios");
  // Marcado solo si el gasto ya salía de ESTE turno: uno de una caja cerrada
  // no se puede volver a descontar de la que está abierta ahora.
  const [deLaCaja, setDeLaCaja] = useState(
    gasto ? gasto.caja_id !== null && gasto.caja_id === caja?.id : false
  );

  const cerradoPorArqueo = Boolean(gasto?.caja_id && !gasto.caja_abierta);
  const puedeSalirDeCaja = caja !== null && metodo === "efectivo" && !cerradoPorArqueo;

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      const datos = new FormData(e.currentTarget);
      const r = gasto ? await actualizarGasto(gasto.id, datos) : await crearGasto(datos);
      if (!r.success) return void toast.error(r.error);
      toast.success(gasto ? "Gasto actualizado" : "Gasto anotado");
      onOpenChange(false);
      onListo();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            La fecha es la del gasto, no la del día en que lo anotás.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ga-concepto">Qué se pagó *</Label>
            <Input
              id="ga-concepto"
              name="concepto"
              defaultValue={gasto?.concepto}
              required
              maxLength={200}
              placeholder="Ej: flete a Rafaela, boleta de luz de agosto"
              autoFocus={!gasto}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ga-monto">Monto *</Label>
              <InputNumero
                id="ga-monto"
                name="monto"
                defaultValue={gasto?.monto ?? ""}
                placeholder="169.261,00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ga-fecha">Fecha *</Label>
              <Input
                id="ga-fecha"
                name="fecha"
                type="date"
                defaultValue={gasto?.fecha ?? hoyLocal()}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ga-categoria">Categoría *</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger id="ga-categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_GASTO.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="categoria" value={categoria} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ga-metodo">Cómo se pagó</Label>
              <Select
                value={metodo}
                onValueChange={(v) => {
                  setMetodo(v);
                  // Una transferencia no vacía el cajón: descontarla del turno
                  // dejaría el arqueo corto por una plata que nunca salió.
                  if (v !== "efectivo") setDeLaCaja(false);
                }}
              >
                <SelectTrigger id="ga-metodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO.map((m) => (
                    <SelectItem key={m} value={m}>
                      {ETIQUETA_MEDIO[m] ?? m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="metodo_pago" value={metodo} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ga-proveedor">Proveedor</Label>
              <Input
                id="ga-proveedor"
                name="proveedor"
                defaultValue={gasto?.proveedor ?? ""}
                maxLength={160}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ga-comprobante">Nº de comprobante</Label>
              <Input
                id="ga-comprobante"
                name="comprobante"
                defaultValue={gasto?.comprobante ?? ""}
                maxLength={60}
                placeholder="Para encontrar el papel después"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ga-notas">Notas</Label>
            <Textarea
              id="ga-notas"
              name="notas"
              rows={2}
              defaultValue={gasto?.notas ?? ""}
              maxLength={600}
            />
          </div>

          {cerradoPorArqueo ? (
            <p className="rounded-xl border border-border px-3 py-2.5 text-caption text-muted-foreground">
              Este gasto salió de la caja #{gasto?.caja_numero}, que ya se cerró. Su arqueo se hizo
              con este importe, así que no se puede modificar: si hay un error, anotá el ajuste como
              un gasto nuevo.
            </p>
          ) : (
            puedeSalirDeCaja && (
              <label
                htmlFor="ga-caja"
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <Checkbox
                  id="ga-caja"
                  className="mt-0.5"
                  checked={deLaCaja}
                  onChange={(e) => setDeLaCaja(e.target.checked)}
                />
                <span className="text-caption">
                  <span className="block font-medium">Lo pagué con la plata de la caja #{caja?.numero}</span>
                  <span className="block text-muted-foreground">
                    Deja el retiro anotado en el turno, así el cierre no marca un faltante.
                  </span>
                </span>
              </label>
            )
          )}
          <input type="hidden" name="caja_id" value={deLaCaja && caja ? caja.id : ""} />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || cerradoPorArqueo}>
              {enviando ? "Guardando…" : gasto ? "Guardar cambios" : "Anotar gasto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
