"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileDown, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { descargarPlantilla, leerCatalogo, type ResultadoLectura } from "@/lib/excel-cliente";
import { importarProductos, type ResumenImportacion } from "@/lib/actions/productos-actions";
import { MAX_BYTES_IMPORTACION, MAX_FILAS_IMPORTACION } from "@/lib/validation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportado: () => void;
}

type Etapa = "elegir" | "revisar" | "resultado";

/**
 * Importación en tres pasos: elegir archivo, revisar qué se detectó y recién
 * ahí confirmar. Antes se escribía en la base apenas se elegía el archivo,
 * sin que el usuario viera qué iba a pasar.
 */
export function ImportarDialog({ open, onOpenChange, onImportado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>("elegir");
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);

  function reiniciar() {
    setEtapa("elegir");
    setLectura(null);
    setNombreArchivo("");
    setResumen(null);
    setProcesando(false);
  }

  function cerrar(abierto: boolean) {
    onOpenChange(abierto);
    if (!abierto) setTimeout(reiniciar, 200);
  }

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_BYTES_IMPORTACION) {
      toast.error(`El archivo pesa más de ${Math.round(MAX_BYTES_IMPORTACION / 1024 / 1024)} MB.`);
      return;
    }

    setProcesando(true);
    try {
      const resultado = await leerCatalogo(file);
      if (resultado.filas.length === 0) {
        toast.error("No se encontró ninguna fila con nombre de producto.");
        return;
      }
      if (resultado.filas.length > MAX_FILAS_IMPORTACION) {
        toast.error(`El archivo tiene ${resultado.filas.length} filas y el máximo es ${MAX_FILAS_IMPORTACION}.`);
        return;
      }
      setLectura(resultado);
      setNombreArchivo(file.name);
      setEtapa("revisar");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setProcesando(false);
    }
  }

  async function handleConfirmar() {
    if (!lectura || procesando) return;
    setProcesando(true);
    try {
      const r = await importarProductos(lectura.filas);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      setResumen({ creados: r.creados, actualizados: r.actualizados, errores: r.errores });
      setEtapa("resultado");
      onImportado();
    } finally {
      setProcesando(false);
    }
  }

  const vistaPrevia = lectura?.filas.slice(0, 5) ?? [];

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar productos</DialogTitle>
          <DialogDescription>
            {etapa === "elegir" && "Desde un Excel (.xlsx) o CSV. Los productos se emparejan por SKU."}
            {etapa === "revisar" && `${nombreArchivo} — revisá antes de confirmar.`}
            {etapa === "resultado" && "Resultado de la importación."}
          </DialogDescription>
        </DialogHeader>

        {/* ── Paso 1 ── */}
        {etapa === "elegir" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <FileSpreadsheet className="mx-auto h-9 w-9 text-muted-foreground/50" strokeWidth={1.2} aria-hidden="true" />
              <p className="mt-3 text-body font-medium">Elegí tu archivo</p>
              <p className="mt-1 text-caption text-muted-foreground">
                Necesita al menos una columna de nombre. Reconoce SKU, costo, precio, stock y mínimo.
              </p>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleArchivo} />
              <Button className="mt-4" onClick={() => inputRef.current?.click()} disabled={procesando}>
                <Upload className="h-4 w-4" />{procesando ? "Leyendo…" : "Seleccionar archivo"}
              </Button>
            </div>
            <button
              type="button"
              onClick={() => descargarPlantilla().catch(() => toast.error("No se pudo generar la plantilla"))}
              className="flex w-full items-center justify-center gap-2 text-caption text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              Descargar plantilla de ejemplo
            </button>
          </div>
        )}

        {/* ── Paso 2 ── */}
        {etapa === "revisar" && lectura && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border p-4">
                <p className="text-overline text-muted-foreground">Filas encontradas</p>
                <p className="mt-1 font-mono text-[26px] font-bold leading-none">{lectura.totalFilas}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-overline text-muted-foreground">Columnas usadas</p>
                <p className="mt-1 font-mono text-[26px] font-bold leading-none">
                  {Object.keys(lectura.columnasDetectadas).length}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-section">Columnas detectadas</p>
              <ul className="flex flex-wrap gap-1.5">
                {Object.entries(lectura.columnasDetectadas).map(([origen, destino]) => (
                  <li key={origen} className="rounded-md bg-white/[0.06] px-2 py-1 text-caption">
                    <span className="text-muted-foreground">{origen}</span>
                    <span className="mx-1.5 text-muted-foreground/60" aria-hidden="true">→</span>
                    <span className="font-medium">{destino}</span>
                  </li>
                ))}
              </ul>
              {lectura.columnasIgnoradas.length > 0 && (
                <p className="text-caption text-muted-foreground">
                  Se ignoran: {lectura.columnasIgnoradas.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-section">Primeras filas</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">SKU</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Precio</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vistaPrevia.map((f, i) => (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2">{f.nombre}</td>
                        <td className="px-3 py-2 text-muted-foreground">{f.sku ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.precio_venta ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{f.stock ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {lectura.totalFilas > vistaPrevia.length && (
                <p className="text-caption text-muted-foreground">
                  …y {lectura.totalFilas - vistaPrevia.length} filas más.
                </p>
              )}
            </div>

            <p className="rounded-lg border border-border bg-white/[0.03] p-3 text-caption text-muted-foreground">
              Los productos con un SKU que ya existe se actualizan; el resto se crea. Toda diferencia de stock
              queda registrada como movimiento.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={reiniciar} disabled={procesando}>Elegir otro archivo</Button>
              <Button onClick={handleConfirmar} disabled={procesando}>
                {procesando ? "Importando…" : `Importar ${lectura.totalFilas} productos`}
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 3 ── */}
        {etapa === "resultado" && resumen && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              <div>
                <p className="font-medium">Importación terminada</p>
                <p className="text-caption text-muted-foreground">
                  {resumen.creados} creados · {resumen.actualizados} actualizados
                </p>
              </div>
            </div>

            {resumen.errores.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-section text-destructive">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  {resumen.errores.length} {resumen.errores.length === 1 ? "fila con problemas" : "filas con problemas"}
                </p>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fila</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Producto</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.errores.map((e, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.fila || "—"}</td>
                          <td className="px-3 py-2">{e.nombre}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={reiniciar}>Importar otro archivo</Button>
              <Button onClick={() => cerrar(false)}>Listo</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
