"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, CameraOff, Keyboard, Link2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ajustarStock,
  asignarCodigoBarras,
  buscarPorCodigo,
  buscarProductos,
  type ResultadoBusqueda,
} from "@/lib/actions/productos-actions";
import { useDebounce } from "@/lib/use-debounce";

/**
 * `BarcodeDetector` es una API del navegador que todavía no está en la
 * definición estándar de TypeScript. Se declara lo mínimo que se usa acá.
 */
interface CodigoDetectado {
  rawValue: string;
}
interface DetectorDeCodigos {
  detect(fuente: CanvasImageSource): Promise<CodigoDetectado[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: {
      new (opciones?: { formats?: string[] }): DetectorDeCodigos;
      getSupportedFormats(): Promise<string[]>;
    };
  }
}

/** Formatos de las etiquetas que circulan en un depósito. */
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

/** Cada cuánto se mira la imagen de la cámara. 250 ms alcanza y no calienta el teléfono. */
const INTERVALO_MS = 250;

type Estado = "buscando" | "encontrado" | "sin-resultado";

export function EscanerDialog({
  open,
  onOpenChange,
  onListo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onListo: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [soportado, setSoportado] = useState<boolean | null>(null);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [estado, setEstado] = useState<Estado>("buscando");
  const [producto, setProducto] = useState<ResultadoBusqueda | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [ocupado, setOcupado] = useState(false);

  // Asignación del código a un producto que todavía no lo tiene. Es el momento
  // natural para hacerlo: estás parado en la estantería con la caja en la mano.
  const [buscando, setBuscando] = useState("");
  const busquedaDebounced = useDebounce(buscando, 300);
  const [candidatos, setCandidatos] = useState<ResultadoBusqueda[]>([]);

  const buscar = useCallback(async (valor: string) => {
    const encontrado = await buscarPorCodigo(valor);
    if (encontrado) {
      setProducto(encontrado);
      setEstado("encontrado");
      // Una vibración corta confirma la lectura sin obligar a mirar la pantalla
      // mientras se tiene el teléfono apuntando a la caja.
      navigator.vibrate?.(60);
    } else {
      setProducto(null);
      setEstado("sin-resultado");
    }
  }, []);

  useEffect(() => {
    const termino = busquedaDebounced.trim();
    if (termino.length < 2) return;
    let vigente = true;
    buscarProductos(termino).then((r) => {
      if (vigente) setCandidatos(r);
    });
    return () => {
      vigente = false;
    };
  }, [busquedaDebounced]);

  async function asignar(producto: ResultadoBusqueda) {
    setOcupado(true);
    try {
      const r = await asignarCodigoBarras(producto.id, codigo.trim());
      if (!r.success) return void toast.error(r.error);
      toast.success(`Código asignado a «${producto.nombre}»`);
      setBuscando("");
      setCandidatos([]);
      // Se pasa solo al modo entrada/salida: casi siempre se escanea para
      // mover stock, no solo para etiquetar.
      setProducto(producto);
      setEstado("encontrado");
      onListo();
    } finally {
      setOcupado(false);
    }
  }

  // ── Cámara ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    let cancelado = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function arrancar() {
      if (typeof window === "undefined" || !window.BarcodeDetector || !navigator.mediaDevices) {
        setSoportado(false);
        return;
      }
      setSoportado(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const detector = new window.BarcodeDetector!({ formats: FORMATOS });
        timer = setInterval(async () => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          try {
            const codigos = await detector.detect(video);
            const leido = codigos[0]?.rawValue?.trim();
            if (!leido) return;
            // Una vez que hay lectura se corta el bucle: seguir mirando
            // reemplazaría el producto mientras se escribe la cantidad.
            if (timer) clearInterval(timer);
            setCodigo(leido);
            await buscar(leido);
          } catch {
            // Un cuadro que no se pudo analizar no es un error: sigue el próximo.
          }
        }, INTERVALO_MS);
      } catch {
        if (!cancelado) {
          setErrorCamara(
            "No se pudo abrir la cámara. Revisá los permisos del navegador o cargá el código a mano."
          );
        }
      }
    }

    void arrancar();

    return () => {
      cancelado = true;
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, buscar]);

  async function registrar(signo: 1 | -1) {
    if (!producto) return;
    const n = Math.abs(Number(cantidad) || 0);
    if (n <= 0) return void toast.error("Ingresá una cantidad mayor a cero");

    setOcupado(true);
    try {
      const r = await ajustarStock(
        producto.id,
        n * signo,
        signo === 1 ? "Entrada por escáner" : "Salida por escáner"
      );
      if (!r.success) return void toast.error(r.error);
      toast.success(`${signo === 1 ? "Entrada" : "Salida"} registrada`, {
        description: `${producto.nombre} — stock ahora: ${r.stockResultante}`,
      });
      // Se queda abierto y listo para el próximo: en un recuento se escanean
      // muchos seguidos y cerrar el diálogo en cada uno sería insufrible.
      setProducto({ ...producto, stock: r.stockResultante });
      onListo();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escanear código</DialogTitle>
          <DialogDescription>
            Apuntá la cámara al código de barras para registrar una entrada o una salida.
          </DialogDescription>
        </DialogHeader>

        {soportado === false ? (
          <p className="flex items-start gap-2 rounded-xl border border-border p-3 text-caption text-muted-foreground">
            <Keyboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Este navegador no lee códigos con la cámara. Funciona en Chrome para Android; mientras
              tanto, escribí el código a mano acá abajo.
            </span>
          </p>
        ) : errorCamara ? (
          <p className="flex items-start gap-2 rounded-xl border border-border p-3 text-caption text-muted-foreground">
            <CameraOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorCamara}</span>
          </p>
        ) : (
          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-video w-full object-cover"
              aria-label="Vista de la cámara"
            />
            <div
              className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-white/70"
              aria-hidden="true"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="esc-codigo">Código</Label>
          <div className="flex gap-2">
            <Input
              id="esc-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="7790000000000"
              inputMode="numeric"
              className="font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void buscar(codigo.trim());
                }
              }}
            />
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => buscar(codigo.trim())}
              disabled={!codigo.trim()}
            >
              Buscar
            </Button>
          </div>
        </div>

        {estado === "sin-resultado" && (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <p className="flex items-start gap-2 text-caption text-muted-foreground">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Ningún producto tiene ese código todavía. Buscá cuál es y se lo asigno: la próxima
                vez que lo escanees te lleva directo a él.
              </span>
            </p>

            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                value={buscando}
                onChange={(e) => {
                  setBuscando(e.target.value);
                  if (e.target.value.trim().length < 2) setCandidatos([]);
                }}
                placeholder="Buscar por nombre o SKU…"
                aria-label="Buscar el producto al que asignar el código"
              />
            </div>

            {busquedaDebounced.trim().length >= 2 && candidatos.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {candidatos.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => asignar(c)}
                      disabled={ocupado}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-caption font-medium">{c.nombre}</span>
                        <span className="block text-caption text-muted-foreground">
                          {c.sku ?? "Sin SKU"} · {c.stock} {c.unidad_medida}
                        </span>
                      </span>
                      <span className="shrink-0 text-caption font-medium text-foreground/80">
                        Asignar
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {busquedaDebounced.trim().length >= 2 && candidatos.length === 0 && (
              <p className="text-caption text-muted-foreground">
                Ningún producto coincide con esa búsqueda.
              </p>
            )}
          </div>
        )}

        {estado === "encontrado" && producto && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div>
              <p className="font-medium">{producto.nombre}</p>
              <p className="text-caption text-muted-foreground">
                {producto.sku ?? "Sin SKU"} · stock actual:{" "}
                <span className="font-mono-num">{producto.stock}</span> {producto.unidad_medida}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="esc-cantidad">Cantidad</Label>
              <Input
                id="esc-cantidad"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button className="h-12" variant="secondary" onClick={() => registrar(1)} disabled={ocupado}>
                <ArrowUpCircle className="h-4 w-4" />
                Entrada
              </Button>
              <Button className="h-12" variant="secondary" onClick={() => registrar(-1)} disabled={ocupado}>
                <ArrowDownCircle className="h-4 w-4" />
                Salida
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
