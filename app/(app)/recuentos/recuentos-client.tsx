"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Play, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  abrirRecuento,
  anotarConteos,
  anularRecuento,
  cerrarRecuento,
  type RecuentoResumen,
} from "@/lib/actions/recuentos-actions";
import type { Categoria, Recuento } from "@/types/database.types";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });

interface Props {
  abierto: Recuento | null;
  historial: RecuentoResumen[];
  categorias: Categoria[];
}

export function RecuentosClient({ abierto, historial, categorias }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [ocupado, setOcupado] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  // Los conteos viven en memoria hasta que se guardan: escribir "12" pasa por
  // "1" y guardar en cada tecla dejaría un rastro de números que nunca existieron.
  const [conteos, setConteos] = useState<Record<string, string>>({});
  const [aCerrar, setACerrar] = useState(false);
  const [aAnular, setAAnular] = useState(false);

  const refrescar = () => startTransition(() => router.refresh());

  const items = useMemo(() => {
    if (!abierto) return [];
    const t = busqueda.trim().toLowerCase();
    if (!t) return abierto.items;
    return abierto.items.filter(
      (i) => i.nombre.toLowerCase().includes(t) || (i.sku ?? "").toLowerCase().includes(t)
    );
  }, [abierto, busqueda]);

  const valorDe = (productoId: string, guardado: number | null) =>
    conteos[productoId] ?? (guardado === null ? "" : String(guardado));

  const contados = abierto
    ? abierto.items.filter((i) => valorDe(i.producto_id, i.contado).trim() !== "").length
    : 0;

  const diferencias = abierto
    ? abierto.items.filter((i) => {
        const v = valorDe(i.producto_id, i.contado).trim();
        return v !== "" && Number(v) !== i.esperado;
      }).length
    : 0;

  const sinGuardar = Object.keys(conteos).length > 0;

  async function crear() {
    setOcupado(true);
    try {
      const r = await abrirRecuento(nota, categoria === "todas" ? null : categoria);
      if (!r.success) return void toast.error(r.error);
      toast.success("Recuento abierto");
      setNuevoAbierto(false);
      setNota("");
      refrescar();
    } finally {
      setOcupado(false);
    }
  }

  async function guardar() {
    if (!abierto || !sinGuardar) return;
    setOcupado(true);
    try {
      const r = await anotarConteos(
        abierto.id,
        Object.entries(conteos).map(([productoId, v]) => ({
          productoId,
          contado: v.trim() === "" ? null : Number(v),
        }))
      );
      if (!r.success) return void toast.error(r.error);
      toast.success(`${r.guardados} ${r.guardados === 1 ? "conteo guardado" : "conteos guardados"}`);
      setConteos({});
      refrescar();
    } finally {
      setOcupado(false);
    }
  }

  async function cerrar() {
    if (!abierto) return;
    setACerrar(false);
    setOcupado(true);
    try {
      // Lo que quedó escrito y sin guardar se guarda primero: si no, cerrar
      // descartaría en silencio el trabajo del último tramo del depósito.
      if (sinGuardar) {
        const previo = await anotarConteos(
          abierto.id,
          Object.entries(conteos).map(([productoId, v]) => ({
            productoId,
            contado: v.trim() === "" ? null : Number(v),
          }))
        );
        if (!previo.success) return void toast.error(previo.error);
        setConteos({});
      }

      const r = await cerrarRecuento(abierto.id);
      if (!r.success) return void toast.error(r.error);
      toast.success(`Recuento cerrado`, {
        description:
          r.ajustes === 0
            ? "No hubo diferencias: el sistema ya coincidía con el depósito."
            : `${r.ajustes} ${r.ajustes === 1 ? "ajuste generado" : "ajustes generados"}, con su movimiento en el historial.`,
      });
      refrescar();
    } finally {
      setOcupado(false);
    }
  }

  async function anular() {
    if (!abierto) return;
    setAAnular(false);
    const r = await anularRecuento(abierto.id);
    if (!r.success) return void toast.error(r.error);
    toast.success("Recuento anulado", { description: "No se cambió ningún stock." });
    setConteos({});
    refrescar();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Recuentos</h1>
          <p className="text-caption text-muted-foreground">
            {abierto
              ? `Recuento #${abierto.numero} en curso · ${contados} de ${abierto.items.length} contados`
              : "Contá el depósito y dejá que AppPack genere los ajustes"}
          </p>
        </div>
        {!abierto && (
          <Button onClick={() => setNuevoAbierto(true)}>
            <Play className="h-4 w-4" />
            Empezar recuento
          </Button>
        )}
      </div>

      {abierto ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
            <div>
              <p className="text-overline text-muted-foreground">Contados</p>
              <p className="font-mono-num text-body-lg font-semibold">
                {contados} / {abierto.items.length}
              </p>
            </div>
            <div>
              <p className="text-overline text-muted-foreground">Diferencias</p>
              <p className="font-mono-num text-body-lg font-semibold">{diferencias}</p>
            </div>
            {abierto.nota && (
              <p className="text-caption text-muted-foreground">{abierto.nota}</p>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setAAnular(true)} disabled={ocupado}>
                Anular
              </Button>
              <Button variant="outline" onClick={guardar} disabled={ocupado || !sinGuardar}>
                {sinGuardar ? "Guardar lo contado" : "Todo guardado"}
              </Button>
              <Button onClick={() => setACerrar(true)} disabled={ocupado || contados === 0}>
                <ClipboardCheck className="h-4 w-4" />
                Cerrar y ajustar
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Buscar en el recuento…"
              className="pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              aria-label="Buscar producto dentro del recuento"
            />
          </div>

          <ul className="divide-y divide-border rounded-xl border border-border">
            {items.map((i) => {
              const valor = valorDe(i.producto_id, i.contado);
              const hayValor = valor.trim() !== "";
              const diferencia = hayValor ? Number(valor) - i.esperado : 0;

              return (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-caption font-medium">{i.nombre}</p>
                    <p className="text-caption text-muted-foreground">
                      {i.sku ?? "Sin SKU"} · sistema: {i.esperado} {i.unidad_medida}
                    </p>
                  </div>

                  {hayValor && diferencia !== 0 && (
                    <Badge variant={diferencia > 0 ? "success" : "destructive"}>
                      {diferencia > 0 ? "+" : ""}
                      {diferencia}
                    </Badge>
                  )}

                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={valor}
                    onChange={(e) =>
                      setConteos((prev) => ({ ...prev, [i.producto_id]: e.target.value }))
                    }
                    placeholder="Contado"
                    aria-label={`Cantidad contada de ${i.nombre}`}
                    className="h-10 w-24 shrink-0 text-right"
                  />
                </li>
              );
            })}
          </ul>

          {items.length === 0 && (
            <p className="rounded-xl border border-border p-6 text-center text-caption text-muted-foreground">
              Ningún producto del recuento coincide con esa búsqueda.
            </p>
          )}
        </>
      ) : historial.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <ClipboardCheck className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-body-lg font-semibold">Todavía no hiciste ningún recuento</p>
            <p className="text-caption text-muted-foreground">
              Abrís uno, recorrés el depósito anotando lo que hay de verdad y al cerrarlo se
              generan todos los ajustes juntos.
            </p>
          </div>
          <Button onClick={() => setNuevoAbierto(true)}>
            <Play className="h-4 w-4" />
            Empezar recuento
          </Button>
        </div>
      ) : null}

      {historial.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-body font-semibold">Recuentos anteriores</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {historial.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <span className="font-mono-num font-semibold">#{r.numero}</span>
                <Badge
                  variant={
                    r.estado === "cerrado" ? "success" : r.estado === "anulado" ? "outline" : "warning"
                  }
                >
                  {r.estado}
                </Badge>
                <span className="text-caption text-muted-foreground">
                  {fecha(r.created_at)} · {r.contados} de {r.productos} contados
                  {r.estado === "cerrado" &&
                    ` · ${r.diferencias} ${r.diferencias === 1 ? "diferencia" : "diferencias"}`}
                </span>
                {r.nota && <span className="text-caption text-muted-foreground">· {r.nota}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Abrir un recuento ── */}
      <Dialog open={nuevoAbierto} onOpenChange={setNuevoAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Empezar un recuento</DialogTitle>
            <DialogDescription>
              Se toma una foto del stock actual para comparar contra lo que cuentes. Nada cambia
              hasta que lo cierres.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Alcance</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todo el catálogo</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Solo {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                Contar una categoría por vez es más llevadero que el depósito entero.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rec-nota">Nota</Label>
              <Textarea
                id="rec-nota"
                rows={2}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: recuento de fin de mes"
                maxLength={200}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setNuevoAbierto(false)}>
                Cancelar
              </Button>
              <Button onClick={crear} disabled={ocupado}>
                {ocupado ? "Abriendo…" : "Abrir recuento"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aCerrar}
        onOpenChange={setACerrar}
        titulo="¿Cerrar el recuento?"
        descripcion={
          diferencias === 0
            ? "No hay diferencias entre lo contado y el sistema: no se va a generar ningún ajuste."
            : `Se van a generar hasta ${diferencias} ${diferencias === 1 ? "ajuste" : "ajustes"} de stock, cada uno con su movimiento en el historial. Los productos que no contaste quedan como están.`
        }
        confirmar="Cerrar y ajustar"
        onConfirm={cerrar}
      />

      <ConfirmDialog
        open={aAnular}
        onOpenChange={setAAnular}
        titulo="¿Anular el recuento?"
        descripcion="Se descarta todo lo contado y no se cambia ningún stock."
        confirmar="Anular"
        onConfirm={anular}
        destructivo
      />
    </div>
  );
}
