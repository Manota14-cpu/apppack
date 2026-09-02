"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ImageOff, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  agregarImagenPorUrl,
  eliminarImagen,
  imagenesDe,
  moverImagen,
  puedeSubirArchivos,
  subirImagen,
} from "@/lib/actions/imagenes-actions";
import { MAX_IMAGENES } from "@/lib/validation";
import type { ImagenProducto, ProductoConCategoria } from "@/types/database.types";

/**
 * Fotos del producto.
 *
 * Las imágenes no se sirven por `next/image` sino con `<img>`: vienen de
 * dominios que el administrador elige en el momento, y `next/image` exige
 * declarar cada dominio de antemano en la configuración. La alternativa sería
 * rechazar direcciones de un servicio nuevo hasta el próximo despliegue.
 */
export function ImagenesDialog({
  producto,
  onOpenChange,
  onListo,
}: {
  producto: ProductoConCategoria | null;
  onOpenChange: (o: boolean) => void;
  onListo: () => void;
}) {
  const [imagenes, setImagenes] = useState<ImagenProducto[] | null>(null);
  const [url, setUrl] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [subidaDisponible, setSubidaDisponible] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const abierto = producto !== null;

  // El diálogo se monta al abrirse, así que el estado ya arranca en blanco y
  // no hace falta limpiarlo acá: el efecto solo trae los datos.
  useEffect(() => {
    if (!producto) return;
    imagenesDe(producto.id).then(setImagenes);
    puedeSubirArchivos().then(setSubidaDisponible);
  }, [producto]);

  async function refrescar(id: string) {
    setImagenes(await imagenesDe(id));
    onListo();
  }

  async function agregarUrl() {
    if (!producto) return;
    setOcupado(true);
    try {
      const r = await agregarImagenPorUrl(producto.id, url, producto.nombre);
      if (!r.success) return void toast.error(r.error);
      setUrl("");
      toast.success("Imagen agregada");
      await refrescar(producto.id);
    } finally {
      setOcupado(false);
    }
  }

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo || !producto) return;

    setOcupado(true);
    try {
      const fd = new FormData();
      fd.set("archivo", archivo);
      const r = await subirImagen(producto.id, fd);
      if (!r.success) return void toast.error(r.error);
      toast.success("Foto subida");
      await refrescar(producto.id);
    } finally {
      setOcupado(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  async function borrar(imagenId: string) {
    if (!producto) return;
    const r = await eliminarImagen(imagenId);
    if (!r.success) return void toast.error(r.error);
    await refrescar(producto.id);
  }

  async function mover(imagenId: string, direccion: "arriba" | "abajo") {
    if (!producto) return;
    const r = await moverImagen(imagenId, direccion);
    if (!r.success) return void toast.error(r.error);
    await refrescar(producto.id);
  }

  const lleno = (imagenes?.length ?? 0) >= MAX_IMAGENES;

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fotos del producto</DialogTitle>
          <DialogDescription>
            {producto?.nombre}. La primera es la que se ve en el listado de la tienda; mientras no
            haya ninguna, se dibuja el icono.
          </DialogDescription>
        </DialogHeader>

        {imagenes === null ? (
          <Skeleton className="h-32 w-full" />
        ) : imagenes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
            <ImageOff className="h-7 w-7 text-muted-foreground/40" strokeWidth={1} aria-hidden="true" />
            <p className="text-caption text-muted-foreground">Este producto todavía no tiene fotos.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {imagenes.map((img, i) => (
              <li key={img.id} className="flex items-center gap-3 rounded-xl border border-border p-2">
                <img
                  src={img.url}
                  alt={img.alt ?? ""}
                  className="h-14 w-14 shrink-0 rounded-lg bg-white/[0.04] object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-caption text-muted-foreground">{img.url}</p>
                  {i === 0 && <p className="text-overline text-foreground/70">Principal</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mover(img.id, "arriba")}
                    disabled={i === 0}
                    aria-label="Subir en el orden"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mover(img.id, "abajo")}
                    disabled={i === imagenes.length - 1}
                    aria-label="Bajar en el orden"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => borrar(img.id)}
                    aria-label="Quitar imagen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!lleno && (
          <div className="space-y-4 border-t border-border pt-4">
            {subidaDisponible ? (
              <div className="space-y-1.5">
                <Label htmlFor="img-archivo">Subir una foto</Label>
                <input
                  ref={archivoRef}
                  id="img-archivo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  capture="environment"
                  onChange={subir}
                  disabled={ocupado}
                  className="block w-full text-caption text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-white/[0.09] file:px-3 file:py-2 file:text-caption file:font-medium file:text-foreground"
                />
                <p className="text-caption text-muted-foreground">
                  JPG, PNG, WebP o AVIF, hasta 5 MB. Desde el celular abre la cámara.
                </p>
              </div>
            ) : (
              <p className="flex items-start gap-2 rounded-xl border border-border p-3 text-caption text-muted-foreground">
                <Upload className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Para subir fotos desde el celular falta crear un almacén de Blob en Vercel. Hasta
                  entonces, pegá abajo la dirección de una imagen que ya esté publicada.
                </span>
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="img-url">Dirección de una imagen</Label>
              <div className="flex gap-2">
                <Input
                  id="img-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void agregarUrl();
                    }
                  }}
                />
                <Button onClick={agregarUrl} disabled={ocupado || !url.trim()} className="shrink-0">
                  Agregar
                </Button>
              </div>
            </div>
          </div>
        )}

        {lleno && (
          <p className="border-t border-border pt-4 text-caption text-muted-foreground">
            Llegaste al máximo de {MAX_IMAGENES} fotos. Quitá alguna para agregar otra.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
