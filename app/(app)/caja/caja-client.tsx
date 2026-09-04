"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Minus,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDebounce } from "@/lib/use-debounce";
import {
  abrirCaja,
  buscarParaCobrar,
  cerrarCaja,
  cobrar,
  verCaja,
  type CajaResumen,
  type ProductoParaCobrar,
} from "@/lib/actions/caja-actions";
import { descargarCaja } from "@/lib/excel-cliente";
import { totalDeCobro } from "@/lib/validation";
import {
  ETIQUETA_PAGO,
  METODOS_PAGO,
  type Caja,
  type Fecha,
  type ItemCobro,
} from "@/types/database.types";

const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const hora = (valor: Fecha) =>
  new Date(valor).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

const fechaHora = (valor: Fecha) =>
  new Date(valor).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

interface Props {
  abierta: Caja | null;
  historial: CajaResumen[];
}

export function CajaClient({ abierta, historial }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refrescar = () => startTransition(() => router.refresh());

  const [abrirAbierto, setAbrirAbierto] = useState(false);
  const [cerrarAbierto, setCerrarAbierto] = useState(false);

  async function descargar(cajaId: string) {
    const caja = await verCaja(cajaId);
    if (!caja) return void toast.error("No se pudo leer el turno.");
    await descargarCaja(caja);
    toast.success(`Turno #${caja.numero} descargado`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Caja</h1>
          <p className="text-caption text-muted-foreground">
            {abierta
              ? `Turno #${abierta.numero} abierto desde las ${hora(abierta.opened_at)}`
              : "Cobrá en el mostrador y llevá el arqueo del día"}
          </p>
        </div>
        {abierta ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => descargar(abierta.id)}>
              <Download className="h-4 w-4" />
              Descargar
            </Button>
            <Button size="sm" onClick={() => setCerrarAbierto(true)}>
              Cerrar caja
            </Button>
          </div>
        ) : (
          <Button onClick={() => setAbrirAbierto(true)}>
            <Wallet className="h-4 w-4" />
            Abrir caja
          </Button>
        )}
      </div>

      {abierta ? (
        <>
          <TotalesDelTurno caja={abierta} />
          <Mostrador caja={abierta} onCobrado={refrescar} />
          <VentasDelTurno caja={abierta} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <Wallet className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-body-lg font-semibold">No hay ninguna caja abierta</p>
            <p className="mx-auto max-w-md text-caption text-muted-foreground">
              Abrí un turno para cobrar en el mostrador. Cada venta descuenta stock igual que un
              pedido de la tienda, y al cerrar te queda el arqueo para descargar.
            </p>
          </div>
          <Button onClick={() => setAbrirAbierto(true)}>
            <Wallet className="h-4 w-4" />
            Abrir caja
          </Button>
        </div>
      )}

      {historial.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-body font-semibold">Turnos anteriores</h2>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {historial.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-3">
                <span className="font-mono-num font-semibold">#{c.numero}</span>
                <Badge variant={c.estado === "abierta" ? "warning" : "default"}>{c.estado}</Badge>
                <span className="min-w-0 flex-1 text-caption text-muted-foreground">
                  {fechaHora(c.opened_at)}
                  {c.closed_at && ` → ${hora(c.closed_at)}`} · {c.ventas}{" "}
                  {c.ventas === 1 ? "venta" : "ventas"}
                </span>
                {c.diferencia !== null && c.diferencia !== 0 && (
                  <Badge variant={c.diferencia > 0 ? "default" : "destructive"}>
                    {c.diferencia > 0 ? "sobra " : "falta "}
                    {money(Math.abs(c.diferencia))}
                  </Badge>
                )}
                <span className="font-mono-num text-caption font-semibold">{money(c.total)}</span>
                <Button variant="ghost" size="sm" onClick={() => descargar(c.id)} aria-label={`Descargar turno ${c.numero}`}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AbrirCajaDialog open={abrirAbierto} onOpenChange={setAbrirAbierto} onListo={refrescar} />
      {abierta && (
        <CerrarCajaDialog
          open={cerrarAbierto}
          onOpenChange={setCerrarAbierto}
          caja={abierta}
          onListo={refrescar}
        />
      )}
    </div>
  );
}

function TotalesDelTurno({ caja }: { caja: Caja }) {
  const esperado = caja.fondo + caja.totales.efectivo;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Dato titulo="Cobrado" valor={money(caja.totales.total)} pie={`${caja.totales.cantidad} ${caja.totales.cantidad === 1 ? "venta" : "ventas"}`} />
      <Dato titulo="Efectivo" valor={money(caja.totales.efectivo)} pie={`fondo ${money(caja.fondo)}`} />
      <Dato
        titulo="Debería haber en caja"
        valor={money(esperado)}
        pie="fondo + cobrado en efectivo"
      />
      <Dato
        titulo="Otros medios"
        valor={money(caja.totales.transferencia + caja.totales.tarjeta + caja.totales.otro)}
        pie="transferencia, tarjeta y otros"
      />
    </div>
  );
}

function Dato({ titulo, valor, pie }: { titulo: string; valor: string; pie: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-overline text-muted-foreground">{titulo}</p>
        <p className="mt-1 font-mono-num text-[24px] font-bold leading-none tracking-tight">{valor}</p>
        <p className="text-caption text-muted-foreground mt-1.5">{pie}</p>
      </CardContent>
    </Card>
  );
}

/** El mostrador: buscar, armar el ticket y cobrar. */
function Mostrador({ caja, onCobrado }: { caja: Caja; onCobrado: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda, 250);
  const [resultados, setResultados] = useState<ProductoParaCobrar[]>([]);
  const [items, setItems] = useState<ItemCobro[]>([]);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [nombre, setNombre] = useState("");
  const [notas, setNotas] = useState("");
  const [cobrando, setCobrando] = useState(false);

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

  function agregar(p: ProductoParaCobrar) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.producto_id === p.id);
      if (i >= 0) {
        const copia = [...prev];
        // No se puede cobrar más de lo que hay: el tope es el stock real.
        copia[i] = { ...copia[i]!, cantidad: Math.min(copia[i]!.cantidad + 1, p.stock) };
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
          stock: p.stock,
        },
      ];
    });
    setBusqueda("");
    setResultados([]);
  }

  function cambiarCantidad(indice: number, delta: number) {
    setItems((prev) => {
      const copia = [...prev];
      const item = copia[indice];
      if (!item) return prev;
      const nueva = Math.min(Math.max(item.cantidad + delta, 1), Math.max(item.stock, 1));
      copia[indice] = { ...item, cantidad: nueva };
      return copia;
    });
  }

  function cambiarPrecio(indice: number, valor: string) {
    setItems((prev) => {
      const copia = [...prev];
      const item = copia[indice];
      if (!item) return prev;
      copia[indice] = { ...item, precio: Math.max(0, Math.round(Number(valor) || 0)) };
      return copia;
    });
  }

  async function confirmar() {
    if (items.length === 0) return;
    setCobrando(true);
    try {
      const r = await cobrar({
        cajaId: caja.id,
        nombre,
        metodoPago,
        notas,
        items: items.map(({ stock: _stock, ...resto }) => resto),
      });
      if (!r.success) return void toast.error(r.error);
      toast.success(`Venta #${r.numero} cobrada`, { description: money(r.total) });
      setItems([]);
      setNombre("");
      setNotas("");
      onCobrado();
    } finally {
      setCobrando(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="text-body font-semibold">Cobrar</h2>

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
            placeholder="Buscar en el stock por nombre, SKU o código…"
            aria-label="Buscar producto para cobrar"
          />
        </div>

        {resultados.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => agregar(p)}
                  disabled={p.stock <= 0}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-caption font-medium">{p.nombre}</span>
                    <span className="block text-caption text-muted-foreground">
                      {p.sku ?? "Sin SKU"} ·{" "}
                      {p.stock > 0 ? `${p.stock} ${p.unidad_medida}` : "sin stock"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono-num text-caption font-semibold">
                    {money(p.precio)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-caption text-muted-foreground">
            Buscá un producto para empezar el ticket.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {items.map((it, i) => (
              <li key={it.producto_id ?? i} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption font-medium">{it.nombre}</span>
                  <span className="block text-caption text-muted-foreground">
                    {it.unidad_medida} · quedan {it.stock}
                  </span>
                </span>

                <span className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => cambiarCantidad(i, -1)}
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
                    onClick={() => cambiarCantidad(i, 1)}
                    disabled={it.cantidad >= it.stock}
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
                  onChange={(e) => cambiarPrecio(i, e.target.value)}
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
                  aria-label={`Quitar ${it.nombre} del ticket`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Medio de pago</Label>
                <Select value={metodoPago} onValueChange={setMetodoPago}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODOS_PAGO.map((m) => (
                      <SelectItem key={m} value={m}>
                        {ETIQUETA_PAGO[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="caja-nombre">Cliente</Label>
                <Input
                  id="caja-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Opcional"
                  maxLength={160}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="caja-notas">Nota</Label>
                <Textarea
                  id="caja-notas"
                  rows={1}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Opcional"
                  maxLength={400}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <span className="font-mono-num text-[26px] font-bold leading-none tracking-tight">
                {money(total)}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setItems([])}>
                  Vaciar
                </Button>
                <Button onClick={confirmar} disabled={cobrando}>
                  {cobrando ? "Cobrando…" : `Cobrar ${money(total)}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VentasDelTurno({ caja }: { caja: Caja }) {
  if (caja.ventas.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-body font-semibold">Ventas del turno</h2>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {caja.ventas.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
            <span className="font-mono-num font-semibold">#{v.numero}</span>
            <span className="text-caption text-muted-foreground">{hora(v.created_at)}</span>
            <span className="min-w-0 flex-1 truncate text-caption">
              {v.nombre} · {v.unidades} {v.unidades === 1 ? "unidad" : "unidades"}
            </span>
            <Badge variant="outline">{ETIQUETA_PAGO[v.metodo_pago] ?? v.metodo_pago}</Badge>
            <span className="font-mono-num text-caption font-semibold">{money(v.total)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AbrirCajaDialog({
  open,
  onOpenChange,
  onListo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onListo: () => void;
}) {
  const [fondo, setFondo] = useState("0");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function abrir() {
    setOcupado(true);
    try {
      const r = await abrirCaja(Number(fondo) || 0, nota);
      if (!r.success) return void toast.error(r.error);
      toast.success("Caja abierta");
      onOpenChange(false);
      setFondo("0");
      setNota("");
      onListo();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir caja</DialogTitle>
          <DialogDescription>
            El fondo es el efectivo con el que arranca el turno. Al cerrar se compara contra lo que
            haya de verdad, así que anotarlo bien es lo que hace que la diferencia signifique algo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="caja-fondo">Fondo inicial ($)</Label>
            <Input
              id="caja-fondo"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={fondo}
              onChange={(e) => setFondo(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caja-nota-apertura">Nota</Label>
            <Textarea
              id="caja-nota-apertura"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: turno mañana"
              maxLength={200}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={abrir} disabled={ocupado}>
              {ocupado ? "Abriendo…" : "Abrir caja"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CerrarCajaDialog({
  open,
  onOpenChange,
  caja,
  onListo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  caja: Caja;
  onListo: () => void;
}) {
  const [contado, setContado] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const esperado = caja.fondo + caja.totales.efectivo;
  const hayContado = contado.trim() !== "";
  const diferencia = hayContado ? Math.round(Number(contado) || 0) - esperado : null;

  async function cerrar() {
    setOcupado(true);
    try {
      const r = await cerrarCaja(caja.id, Number(contado) || 0, nota);
      if (!r.success) return void toast.error(r.error);

      const d = r.arqueo?.diferencia ?? 0;
      toast.success(`Turno #${caja.numero} cerrado`, {
        description:
          d === 0
            ? "La caja cuadra exacta."
            : d > 0
              ? `Sobran ${money(d)} respecto de lo esperado.`
              : `Faltan ${money(Math.abs(d))} respecto de lo esperado.`,
      });

      // Se descarga solo: es el momento en que el dato sirve, y pedirlo
      // después obliga a acordarse de un turno que ya se cerró.
      const completa = await verCaja(caja.id);
      if (completa) await descargarCaja(completa);

      onOpenChange(false);
      onListo();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>
            Contá el efectivo que hay y anotalo. Al cerrar se descarga el turno completo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-6 rounded-xl border border-border p-4">
            <div>
              <p className="text-overline text-muted-foreground">Fondo</p>
              <p className="font-mono-num text-body-lg font-semibold">{money(caja.fondo)}</p>
            </div>
            <div>
              <p className="text-overline text-muted-foreground">Cobrado en efectivo</p>
              <p className="font-mono-num text-body-lg font-semibold">
                {money(caja.totales.efectivo)}
              </p>
            </div>
            <div>
              <p className="text-overline text-muted-foreground">Debería haber</p>
              <p className="font-mono-num text-body-lg font-semibold">{money(esperado)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="caja-contado">Efectivo contado ($)</Label>
            <Input
              id="caja-contado"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
              placeholder={String(esperado)}
              autoFocus
            />
            {diferencia !== null && (
              <p
                className={`text-caption ${diferencia === 0 ? "text-muted-foreground" : diferencia > 0 ? "text-foreground" : "text-warning"}`}
              >
                {diferencia === 0
                  ? "Cuadra exacto."
                  : diferencia > 0
                    ? `Sobran ${money(diferencia)}.`
                    : `Faltan ${money(Math.abs(diferencia))}.`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="caja-nota-cierre">Nota del cierre</Label>
            <Textarea
              id="caja-nota-cierre"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: se pagó un flete de la caja"
              maxLength={400}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={cerrar} disabled={ocupado || !hayContado}>
              {ocupado ? "Cerrando…" : "Cerrar y descargar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
