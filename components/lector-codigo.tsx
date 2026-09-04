"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, Keyboard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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

/** Cada cuánto se mira la imagen. 250 ms alcanza y no calienta el teléfono. */
const INTERVALO_MS = 250;

/** Cuánto se ignora un código ya leído, para no cargarlo diez veces seguidas. */
const ESPERA_REPETIDO_MS = 1500;

/**
 * La cámara leyendo códigos.
 *
 * Vive aparte porque hay dos usos distintos con el mismo mecanismo: en
 * Productos, escanear lleva a mover stock; en la caja, suma un renglón al
 * ticket y sigue esperando el próximo. Lo único que comparten es esto, así
 * que es lo único que se comparte.
 *
 * `continuo` decide si sigue leyendo después de un acierto. En el mostrador
 * sí — se pasan varios productos seguidos por el lector; en el ajuste de
 * stock no, porque cambiar de producto mientras se escribe una cantidad
 * sería una forma segura de cargar la salida equivocada.
 */
export function LectorCodigo({
  onLeido,
  continuo = false,
  activo = true,
}: {
  onLeido: (codigo: string) => void;
  continuo?: boolean;
  activo?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ultimoRef = useRef<{ codigo: string; cuando: number } | null>(null);
  // El callback se guarda en una ref para que cambiarlo no reinicie la cámara:
  // volver a pedir el stream en cada render la haría parpadear sin parar.
  const onLeidoRef = useRef(onLeido);
  useEffect(() => {
    onLeidoRef.current = onLeido;
  }, [onLeido]);

  const [soportado, setSoportado] = useState<boolean | null>(null);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!activo) return;

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

            // El mismo código sigue delante de la cámara durante un rato:
            // sin esta guarda se cargaría una vez por cuadro.
            const ahora = Date.now();
            const ultimo = ultimoRef.current;
            if (ultimo && ultimo.codigo === leido && ahora - ultimo.cuando < ESPERA_REPETIDO_MS) {
              return;
            }
            ultimoRef.current = { codigo: leido, cuando: ahora };

            if (!continuo && timer) clearInterval(timer);
            navigator.vibrate?.(60);
            onLeidoRef.current(leido);
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
  }, [activo, continuo]);

  return (
    <div className="space-y-3">
      {soportado === false ? (
        <p className="flex items-start gap-2 rounded-xl border border-border p-3 text-caption text-muted-foreground">
          <Keyboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Este navegador no lee códigos con la cámara. Funciona en Chrome para Android; mientras
            tanto, escribí el código a mano.
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
        <Label htmlFor="lector-manual">Código</Label>
        <div className="flex gap-2">
          <Input
            id="lector-manual"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="7790000000000"
            inputMode="numeric"
            className="font-mono"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const v = manual.trim();
              if (!v) return;
              onLeidoRef.current(v);
              setManual("");
            }}
          />
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => {
              const v = manual.trim();
              if (!v) return;
              onLeidoRef.current(v);
              setManual("");
            }}
            disabled={!manual.trim()}
          >
            Buscar
          </Button>
        </div>
      </div>
    </div>
  );
}
