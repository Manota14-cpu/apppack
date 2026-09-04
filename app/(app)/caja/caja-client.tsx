"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  ScanLine,
  Search,
  Trash2,
  Wallet,
  X,
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
import { LectorCodigo } from "@/components/lector-codigo";
import { money } from "@/lib/formato";
import { useDebounce } from "@/lib/use-debounce";
import {
  abrirCaja,
  buscarParaCobrar,
  cerrarCaja,
  cobrar,
  devolver,
  moverCaja,
  verCaja,
  type CajaResumen,
  type ProductoParaCobrar,
} from "@/lib/actions/caja-actions";
import { buscarPorCodigo } from "@/lib/actions/productos-actions";
import { descargarCaja } from "@/lib/excel-cliente";
import { calcularVuelto, totalDeCobro } from "@/lib/validation";
import {
  ETIQUETA_PAGO,
  METODOS_PAGO,
  type Caja,
  type Fecha,
  type ItemCobro,
  type VentaCaja,
} from "@/types/database.types";


const hora = (valor: Fecha) =>
  new Date(valor).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

const fechaHora = (valor: Fecha) =>
  new Date(valor).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Lo que debería haber en el cajón, contando retiros e ingresos. */
function efectivoEsperado(caja: Caja): number {
  return caja.fondo + caja.totales.efectivo + caja.ingresado - caja.retirado;
}

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
  const [devolverAbierto, setDevolverAbierto] = useState(false);
  const [verTurno, setVerTurno] = useState<string | null>(null);

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
            <Button variant="outline" size="sm" onClick={() => setDevolverAbierto(true)}>
              <RotateCcw className="h-4 w-4" />
              Devolución
            </Button>
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
          <MovimientosDeCaja caja={abierta} onCambio={refrescar} />
          <VentasDelTurno ventas={abierta.ventas} />
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
                {/* Se puede abrir en pantalla: antes había que descargar el
                    Excel para responder «cuánto se hizo ayer». */}
                <button
                  type="button"
                  onClick={() => setVerTurno(c.id)}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left"
                >
                  <span className="font-mono-num font-semibold">#{c.numero}</span>
                  <Badge variant={c.estado === "abierta" ? "warning" : "default"}>{c.estado}</Badge>
                  <span className="min-w-0 text-caption text-muted-foreground">
                    {fechaHora(c.opened_at)}
                    {c.closed_at && ` → ${hora(c.closed_at)}`} · {c.ventas}{" "}
                    {c.ventas === 1 ? "venta" : "ventas"}
                  </span>
                </button>
                {c.diferencia !== null && c.diferencia !== 0 && (
                  <Badge variant={c.diferencia > 0 ? "default" : "destructive"}>
                    {c.diferencia > 0 ? "sobra " : "falta "}
                    {money(Math.abs(c.diferencia))}
                  </Badge>
                )}
                <span className="font-mono-num text-caption font-semibold">{money(c.total)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => descargar(c.id)}
                  aria-label={`Descargar turno ${c.numero}`}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AbrirCajaDialog open={abrirAbierto} onOpenChange={setAbrirAbierto} onListo={refrescar} />
      {abierta && (
        <>
          <CerrarCajaDialog
            open={cerrarAbierto}
            onOpenChange={setCerrarAbierto}
            caja={abierta}
            onListo={refrescar}
          />
          <DevolucionDialog
            open={devolverAbierto}
            onOpenChange={setDevolverAbierto}
            caja={abierta}
            onListo={refrescar}
          />
        </>
      )}
      {verTurno && <TurnoDialog cajaId={verTurno} onCerrar={() => setVerTurno(null)} />}
    </div>
  );
}

function TotalesDelTurno({ caja }: { caja: Caja }) {
  const esperado = efectivoEsperado(caja);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Dato
        titulo="Cobrado"
        valor={money(caja.totales.total)}
        pie={`${caja.totales.cantidad} ${caja.totales.cantidad === 1 ? "venta" : "ventas"}`}
      />
      <Dato titulo="Efectivo" valor={money(caja.totales.efectivo)} pie={`fondo ${money(caja.fondo)}`} />
      <Dato
        titulo="Debería haber en caja"
        valor={money(esperado)}
        pie={
          caja.retirado > 0 || caja.ingresado > 0
            ? `fondo + efectivo${caja.ingresado > 0 ? ` + ${money(caja.ingresado)}` : ""}${caja.retirado > 0 ? ` − ${money(caja.retirado)}` : ""}`
            : "fondo + cobrado en efectivo"
        }
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

// ────────────────────────────  El mostrador  ────────────────────────────

/** Un tramo del cobro mientras se arma, antes de validarlo. */
interface TramoPago {
  metodo: string;
  monto: string;
}

function Mostrador({ caja, onCobrado }: { caja: Caja; onCobrado: () => void }) {
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda, 250);
  const [resultados, setResultados] = useState<ProductoParaCobrar[]>([]);
  const [items, setItems] = useState<ItemCobro[]>([]);
  const [nombre, setNombre] = useState("");
  const [notas, setNotas] = useState("");
  const [cobrando, setCobrando] = useState(false);
  const [escanerAbierto, setEscanerAbierto] = useState(false);

  const [pagos, setPagos] = useState<TramoPago[]>([{ metodo: "efectivo", monto: "" }]);
  const [recibido, setRecibido] = useState("");

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

  // El primer tramo se completa solo con lo que falta: en la venta común —un
  // solo medio de pago— no hay que escribir el importe.
  const pagosConMontos = useMemo(() => {
    const explicitos = pagos.map((p) => Math.round(Number(p.monto) || 0));
    const sumaOtros = explicitos.slice(1).reduce((s, m) => s + m, 0);
    const primero = pagos[0]?.monto.trim() ? explicitos[0]! : Math.max(0, total - sumaOtros);
    return pagos.map((p, i) => ({ metodo: p.metodo, monto: i === 0 ? primero : explicitos[i]! }));
  }, [pagos, total]);

  const cobrado = pagosConMontos.reduce((s, p) => s + p.monto, 0);
  const enEfectivo = pagosConMontos
    .filter((p) => p.metodo === "efectivo")
    .reduce((s, p) => s + p.monto, 0);
  const vuelto = calcularVuelto(Number(recibido) || 0, enEfectivo);
  const cuadra = items.length > 0 && cobrado === total;

  function agregarProducto(p: ProductoParaCobrar) {
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

  async function porCodigo(codigo: string) {
    const encontrado = await buscarPorCodigo(codigo);
    if (!encontrado) {
      return void toast.error("Ningún producto tiene ese código", {
        description: "Asignáselo desde Productos → Escanear.",
      });
    }
    if (encontrado.stock <= 0) {
      return void toast.error(`«${encontrado.nombre}» no tiene stock`);
    }
    agregarProducto({
      id: encontrado.id,
      nombre: encontrado.nombre,
      sku: encontrado.sku,
      precio: 0,
      stock: encontrado.stock,
      unidad_medida: encontrado.unidad_medida,
    });
    // El precio no viene en la búsqueda por código: se completa consultando el
    // catálogo, para no cobrar un cero por descuido.
    const [conPrecio] = await buscarParaCobrar(encontrado.nombre);
    if (conPrecio) {
      setItems((prev) =>
        prev.map((x) => (x.producto_id === encontrado.id ? { ...x, precio: conPrecio.precio } : x))
      );
    }
    toast.success(`${encontrado.nombre} agregado`);
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

  function limpiar() {
    setItems([]);
    setNombre("");
    setNotas("");
    setPagos([{ metodo: "efectivo", monto: "" }]);
    setRecibido("");
  }

  async function confirmar() {
    if (!cuadra) return;
    setCobrando(true);
    try {
      const r = await cobrar({
        cajaId: caja.id,
        nombre,
        notas,
        recibido: Number(recibido) || 0,
        pagos: pagosConMontos.filter((p) => p.monto > 0),
        items: items.map(({ stock: _stock, ...resto }) => resto),
      });
      if (!r.success) return void toast.error(r.error);
      toast.success(`Venta #${r.numero} cobrada`, {
        description: vuelto > 0 ? `Vuelto: ${money(vuelto)}` : money(r.total),
      });
      limpiar();
      onCobrado();
    } finally {
      setCobrando(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-body font-semibold">Cobrar</h2>
          <Button variant="outline" size="sm" onClick={() => setEscanerAbierto(true)}>
            <ScanLine className="h-3.5 w-3.5" />
            Escanear
          </Button>
        </div>

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
                  onClick={() => agregarProducto(p)}
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
            Buscá o escaneá un producto para empezar el ticket.
          </p>
        ) : (
          <RenglonesDelTicket
            items={items}
            onCantidad={cambiarCantidad}
            onPrecio={cambiarPrecio}
            onQuitar={(i) => setItems((prev) => prev.filter((_, j) => j !== i))}
          />
        )}

        {items.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
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
                <Input
                  id="caja-notas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Opcional"
                  maxLength={400}
                />
              </div>
            </div>

            <Pagos
              pagos={pagos}
              montos={pagosConMontos}
              total={total}
              cobrado={cobrado}
              onCambiar={setPagos}
            />

            {enEfectivo > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="caja-recibido">Con cuánto paga</Label>
                  <Input
                    id="caja-recibido"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={recibido}
                    onChange={(e) => setRecibido(e.target.value)}
                    placeholder={String(enEfectivo)}
                  />
                </div>
                <div className="flex items-end">
                  {/* La cuenta que hoy hace el cajero de cabeza con la cola
                      esperando. */}
                  <div className="w-full rounded-xl border border-border p-3">
                    <p className="text-overline text-muted-foreground">Vuelto</p>
                    <p className="font-mono-num text-[22px] font-bold leading-none">
                      {money(vuelto)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div>
                <p className="font-mono-num text-[26px] font-bold leading-none tracking-tight">
                  {money(total)}
                </p>
                {!cuadra && (
                  <p className="text-caption text-warning mt-1">
                    {cobrado < total
                      ? `Faltan ${money(total - cobrado)} por asignar`
                      : `Hay ${money(cobrado - total)} de más en los pagos`}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={limpiar}>
                  Vaciar
                </Button>
                <Button onClick={confirmar} disabled={cobrando || !cuadra}>
                  {cobrando ? "Cobrando…" : `Cobrar ${money(total)}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={escanerAbierto} onOpenChange={setEscanerAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escanear productos</DialogTitle>
            <DialogDescription>
              Cada código que leas suma un renglón al ticket. Podés pasar varios seguidos sin
              cerrar esta ventana.
            </DialogDescription>
          </DialogHeader>
          {escanerAbierto && <LectorCodigo onLeido={porCodigo} continuo />}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setEscanerAbierto(false)}>Listo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RenglonesDelTicket({
  items,
  onCantidad,
  onPrecio,
  onQuitar,
  conTope = true,
}: {
  items: ItemCobro[];
  onCantidad: (indice: number, delta: number) => void;
  onPrecio: (indice: number, valor: string) => void;
  onQuitar: (indice: number) => void;
  /**
   * En una devolución la mercadería entra en vez de salir: no hay tope de
   * stock que respetar ni un «quedan N» que tenga sentido mostrar.
   */
  conTope?: boolean;
}) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {items.map((it, i) => (
        <li key={it.producto_id ?? i} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-caption font-medium">{it.nombre}</span>
            <span className="block text-caption text-muted-foreground">
              {it.unidad_medida}
              {conTope ? ` · quedan ${it.stock}` : ""}
            </span>
          </span>

          <span className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCantidad(i, -1)}
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
              onClick={() => onCantidad(i, 1)}
              disabled={conTope && it.cantidad >= it.stock}
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
            onChange={(e) => onPrecio(i, e.target.value)}
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
            onClick={() => onQuitar(i)}
            aria-label={`Quitar ${it.nombre} del ticket`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Los medios de pago de una venta.
 *
 * El primer tramo se completa solo con lo que falta, así la venta de todos los
 * días —un solo medio— no obliga a escribir el importe. Agregar un segundo
 * tramo es lo que cubre "mitad efectivo, mitad transferencia".
 */
function Pagos({
  pagos,
  montos,
  total,
  cobrado,
  onCambiar,
}: {
  pagos: TramoPago[];
  montos: { metodo: string; monto: number }[];
  total: number;
  cobrado: number;
  onCambiar: (p: TramoPago[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Cómo paga</Label>
        {pagos.length < 4 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCambiar([...pagos, { metodo: "transferencia", monto: "" }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Otro medio
          </Button>
        )}
      </div>

      {pagos.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select
            value={p.metodo}
            onValueChange={(v) => {
              const copia = [...pagos];
              copia[i] = { ...copia[i]!, metodo: v };
              onCambiar(copia);
            }}
          >
            <SelectTrigger className="flex-1" aria-label={`Medio de pago ${i + 1}`}>
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

          <Input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={p.monto}
            onChange={(e) => {
              const copia = [...pagos];
              copia[i] = { ...copia[i]!, monto: e.target.value };
              onCambiar(copia);
            }}
            placeholder={i === 0 ? String(montos[0]?.monto ?? total) : "0"}
            aria-label={`Importe del medio de pago ${i + 1}`}
            className="h-10 w-32 text-right"
          />

          {pagos.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCambiar(pagos.filter((_, j) => j !== i))}
              aria-label={`Quitar el medio de pago ${i + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      {pagos.length > 1 && (
        <p className="text-caption text-muted-foreground">
          Asignado {money(cobrado)} de {money(total)}.
        </p>
      )}
    </div>
  );
}

function MovimientosDeCaja({ caja, onCambio }: { caja: Caja; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<"retiro" | "ingreso">("retiro");
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function abrir(cual: "retiro" | "ingreso") {
    setTipo(cual);
    setMonto("");
    setMotivo("");
    setAbierto(true);
  }

  async function guardar() {
    setOcupado(true);
    try {
      const r = await moverCaja(caja.id, tipo, Number(monto) || 0, motivo);
      if (!r.success) return void toast.error(r.error);
      toast.success(tipo === "retiro" ? "Retiro anotado" : "Ingreso anotado", {
        description: `${money(Number(monto) || 0)} — ${motivo}`,
      });
      setAbierto(false);
      onCambio();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-body font-semibold">Movimientos de efectivo</h2>
            <p className="text-caption text-muted-foreground">
              Plata que entra o sale del cajón sin ser una venta.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => abrir("retiro")}>
              <ArrowUpRight className="h-3.5 w-3.5" />
              Retirar
            </Button>
            <Button variant="outline" size="sm" onClick={() => abrir("ingreso")}>
              <ArrowDownLeft className="h-3.5 w-3.5" />
              Agregar
            </Button>
          </div>
        </div>

        {caja.movimientos.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {caja.movimientos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                <span className="text-caption text-muted-foreground">{hora(m.created_at)}</span>
                <span className="min-w-0 flex-1 truncate text-caption">{m.motivo}</span>
                <span
                  className={`font-mono-num text-caption font-semibold ${
                    m.tipo === "retiro" ? "text-warning" : "text-foreground"
                  }`}
                >
                  {m.tipo === "retiro" ? "−" : "+"}
                  {money(m.monto)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tipo === "retiro" ? "Retirar efectivo" : "Agregar efectivo"}</DialogTitle>
            <DialogDescription>
              {tipo === "retiro"
                ? "Lo que saques deja de contar como faltante en el cierre."
                : "Cambio o refuerzo que se suma al cajón."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mov-monto">Monto ($)</Label>
              <Input
                id="mov-monto"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mov-motivo">Motivo *</Label>
              <Input
                id="mov-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={tipo === "retiro" ? "Ej: flete, depósito al banco" : "Ej: cambio"}
                maxLength={200}
                aria-describedby="mov-motivo-ayuda"
              />
              <p id="mov-motivo-ayuda" className="text-caption text-muted-foreground">
                Es obligatorio. A fin de mes, un retiro sin motivo se lee igual que un faltante.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button
                onClick={guardar}
                disabled={ocupado || !motivo.trim() || !(Number(monto) > 0)}
              >
                {ocupado ? "Guardando…" : tipo === "retiro" ? "Retirar" : "Agregar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function VentasDelTurno({ ventas }: { ventas: VentaCaja[] }) {
  if (ventas.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-body font-semibold">Ventas del turno</h2>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {ventas.map((v) => {
          const esDevolucion = v.canal === "devolucion";
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
              <span className="font-mono-num font-semibold">#{v.numero}</span>
              <span className="text-caption text-muted-foreground">{hora(v.created_at)}</span>
              <span className="min-w-0 flex-1 truncate text-caption">
                {v.nombre} · {Math.abs(v.unidades)}{" "}
                {Math.abs(v.unidades) === 1 ? "unidad" : "unidades"}
              </span>
              {esDevolucion && <Badge variant="warning">Devolución</Badge>}
              <Badge variant="outline">{ETIQUETA_PAGO[v.metodo_pago] ?? v.metodo_pago}</Badge>
              <span
                className={`font-mono-num text-caption font-semibold ${esDevolucion ? "text-warning" : ""}`}
              >
                {money(v.total)}
              </span>
              <a
                href={`/comprobante/${v.id}?imprimir=1`}
                target="_blank"
                rel="noreferrer"
                aria-label={`Imprimir el comprobante de la venta ${v.numero}`}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ────────────────────────────  Devoluciones  ────────────────────────────

/**
 * Registrar una devolución.
 *
 * Se parte de una venta del turno cuando la hay —así los precios y las
 * cantidades ya vienen bien— y si no, se busca en el stock. La plata sale del
 * cajón y la mercadería vuelve, las dos cosas anotadas.
 */
function DevolucionDialog({
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
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda, 250);
  const [resultados, setResultados] = useState<ProductoParaCobrar[]>([]);
  const [items, setItems] = useState<ItemCobro[]>([]);
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [nombre, setNombre] = useState("");
  const [notas, setNotas] = useState("");
  const [ocupado, setOcupado] = useState(false);

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
  const ventas = caja.ventas.filter((v) => v.canal !== "devolucion");

  function agregar(p: { id: string; nombre: string; unidad_medida: string; precio: number }) {
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
          stock: 0,
        },
      ];
    });
    setBusqueda("");
    setResultados([]);
  }

  async function confirmar() {
    setOcupado(true);
    try {
      const r = await devolver({
        cajaId: caja.id,
        pedidoId: null,
        nombre,
        notas,
        metodoPago,
        items: items.map(({ stock: _stock, ...resto }) => resto),
      });
      if (!r.success) return void toast.error(r.error);
      toast.success(`Devolución #${r.numero} registrada`, {
        description: `${money(r.total)} salieron de la caja y la mercadería volvió al stock.`,
      });
      setItems([]);
      setNombre("");
      setNotas("");
      onOpenChange(false);
      onListo();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar una devolución</DialogTitle>
          <DialogDescription>
            La mercadería vuelve al stock y la plata sale del cajón. Queda como una venta en
            negativo, así los informes y el arqueo la restan solos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {ventas.length > 0 && (
            <div className="space-y-1.5">
              <Label>Ventas de este turno</Label>
              <p className="text-caption text-muted-foreground">
                Tocá un renglón para cargarlo con su precio de venta.
              </p>
              <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {ventas.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-caption">
                      #{v.numero} · {v.nombre} · {hora(v.created_at)}
                    </span>
                    <span className="shrink-0 font-mono-num text-caption">{money(v.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
              placeholder="Buscar el producto que vuelve…"
              aria-label="Buscar producto a devolver"
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
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-caption text-muted-foreground">
              Buscá el producto que te devuelven.
            </p>
          ) : (
            <RenglonesDelTicket
              conTope={false}
              items={items}
              onCantidad={(i, delta) =>
                setItems((prev) => {
                  const copia = [...prev];
                  const it = copia[i];
                  if (!it) return prev;
                  copia[i] = { ...it, cantidad: Math.max(1, it.cantidad + delta) };
                  return copia;
                })
              }
              onPrecio={(i, valor) =>
                setItems((prev) => {
                  const copia = [...prev];
                  const it = copia[i];
                  if (!it) return prev;
                  copia[i] = { ...it, precio: Math.max(0, Math.round(Number(valor) || 0)) };
                  return copia;
                })
              }
              onQuitar={(i) => setItems((prev) => prev.filter((_, j) => j !== i))}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Cómo se devuelve</Label>
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
              <Label htmlFor="dev-nombre">Cliente</Label>
              <Input
                id="dev-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Opcional"
                maxLength={160}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dev-notas">Motivo</Label>
            <Textarea
              id="dev-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: vino fallado, se equivocó de medida"
              maxLength={400}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <span className="font-mono-num text-[22px] font-bold leading-none text-warning">
              −{money(total)}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={ocupado || items.length === 0}>
                {ocupado ? "Registrando…" : "Registrar devolución"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────  Ver un turno ya cerrado  ───────────────────────

function TurnoDialog({ cajaId, onCerrar }: { cajaId: string; onCerrar: () => void }) {
  const [caja, setCaja] = useState<Caja | null>(null);

  useEffect(() => {
    verCaja(cajaId).then(setCaja);
  }, [cajaId]);

  const esperado = caja ? efectivoEsperado(caja) : 0;
  const diferencia = caja?.contado === null || !caja ? null : caja.contado - esperado;

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{caja ? `Turno #${caja.numero}` : "Cargando…"}</DialogTitle>
          <DialogDescription>
            {caja
              ? `${fechaHora(caja.opened_at)}${caja.closed_at ? ` → ${hora(caja.closed_at)}` : " · sigue abierto"}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {caja && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6 rounded-xl border border-border p-4">
              <div>
                <p className="text-overline text-muted-foreground">Cobrado</p>
                <p className="font-mono-num text-body-lg font-semibold">
                  {money(caja.totales.total)}
                </p>
              </div>
              <div>
                <p className="text-overline text-muted-foreground">Efectivo esperado</p>
                <p className="font-mono-num text-body-lg font-semibold">{money(esperado)}</p>
              </div>
              <div>
                <p className="text-overline text-muted-foreground">Contado</p>
                <p className="font-mono-num text-body-lg font-semibold">
                  {caja.contado === null ? "—" : money(caja.contado)}
                </p>
              </div>
              {diferencia !== null && (
                <div>
                  <p className="text-overline text-muted-foreground">Diferencia</p>
                  <p
                    className={`font-mono-num text-body-lg font-semibold ${
                      diferencia === 0 ? "" : diferencia > 0 ? "text-foreground" : "text-warning"
                    }`}
                  >
                    {diferencia === 0 ? "Cuadra" : money(diferencia)}
                  </p>
                </div>
              )}
            </div>

            {caja.nota && <p className="text-caption text-muted-foreground">{caja.nota}</p>}

            {caja.movimientos.length > 0 && (
              <div className="space-y-2">
                <p className="text-caption font-semibold">Movimientos de efectivo</p>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {caja.movimientos.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-caption text-muted-foreground">
                        {hora(m.created_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-caption">{m.motivo}</span>
                      <span className="font-mono-num text-caption font-semibold">
                        {m.tipo === "retiro" ? "−" : "+"}
                        {money(m.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <VentasDelTurno ventas={caja.ventas} />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={async () => {
                  await descargarCaja(caja);
                  toast.success(`Turno #${caja.numero} descargado`);
                }}
              >
                <Download className="h-4 w-4" />
                Descargar
              </Button>
              <Button onClick={onCerrar}>Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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

  const esperado = efectivoEsperado(caja);
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
            {caja.retirado > 0 && (
              <div>
                <p className="text-overline text-muted-foreground">Retirado</p>
                <p className="font-mono-num text-body-lg font-semibold">
                  −{money(caja.retirado)}
                </p>
              </div>
            )}
            {caja.ingresado > 0 && (
              <div>
                <p className="text-overline text-muted-foreground">Agregado</p>
                <p className="font-mono-num text-body-lg font-semibold">
                  +{money(caja.ingresado)}
                </p>
              </div>
            )}
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
