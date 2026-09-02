"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import type { Categoria } from "@/types/database.types";
import { actualizarCategoria, crearCategoria, eliminarCategoria } from "@/lib/actions/productos-actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categorias: Categoria[];
  onCambio: () => void;
}

/** ABM de categorías. Antes solo se podían crear, nunca renombrar ni borrar. */
export function CategoriasDialog({ open, onOpenChange, categorias, onCambio }: Props) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<Categoria | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleCrear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      const form = e.currentTarget;
      const r = await crearCategoria(new FormData(form));
      if (!r.success) return void toast.error(r.error);
      toast.success("Categoría creada");
      form.reset();
      onCambio();
    } finally {
      setEnviando(false);
    }
  }

  async function handleActualizar(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await actualizarCategoria(id, new FormData(e.currentTarget));
      if (!r.success) return void toast.error(r.error);
      toast.success("Categoría actualizada");
      setEditandoId(null);
      onCambio();
    } finally {
      setEnviando(false);
    }
  }

  async function handleEliminar() {
    if (!aEliminar) return;
    const r = await eliminarCategoria(aEliminar.id);
    if (!r.success) return void toast.error(r.error);
    toast.success(`«${aEliminar.nombre}» eliminada`);
    setAEliminar(null);
    onCambio();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Categorías</DialogTitle>
            <DialogDescription>
              Al eliminar una categoría, sus productos quedan sin categoría — no se borra ninguno.
            </DialogDescription>
          </DialogHeader>

          <ul className="flex flex-col gap-1.5">
            {categorias.length === 0 && (
              <li className="py-6 text-center text-caption text-muted-foreground">Todavía no hay categorías.</li>
            )}
            {categorias.map((c) =>
              editandoId === c.id ? (
                <li key={c.id}>
                  <form onSubmit={(e) => handleActualizar(e, c.id)} className="flex items-center gap-2">
                    <input type="color" name="color" defaultValue={c.color ?? "#7f8c9a"}
                      className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent"
                      aria-label="Color de la categoría" />
                    <Input name="nombre" defaultValue={c.nombre} required maxLength={80} autoFocus className="h-9" />
                    <Button type="submit" variant="ghost" size="sm" disabled={enviando} aria-label="Guardar">
                      <Check className="h-4 w-4 text-success" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditandoId(null)} aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </form>
                </li>
              ) : (
                <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="h-3 w-3 shrink-0 rounded-full border border-white/20"
                    style={{ background: c.color ?? "transparent" }} aria-hidden="true" />
                  <span className="flex-1 truncate text-body">{c.nombre}</span>
                  <Button variant="ghost" size="sm" aria-label={`Renombrar ${c.nombre}`} onClick={() => setEditandoId(c.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Eliminar ${c.nombre}`}
                    className="text-destructive hover:text-destructive" onClick={() => setAEliminar(c)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              )
            )}
          </ul>

          <form onSubmit={handleCrear} className="mt-2 space-y-3 border-t border-border pt-4">
            <p className="text-section">Nueva categoría</p>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="cat-color">Color</Label>
                <input id="cat-color" type="color" name="color" defaultValue="#2E7D32"
                  className="h-12 w-12 cursor-pointer rounded-xl border border-border bg-transparent" />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="cat-nombre">Nombre *</Label>
                <Input id="cat-nombre" name="nombre" required maxLength={80} placeholder="Ej: Bolsas" />
              </div>
              <Button type="submit" disabled={enviando}>
                <Plus className="h-4 w-4" />{enviando ? "Creando…" : "Agregar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aEliminar !== null}
        onOpenChange={(o) => !o && setAEliminar(null)}
        titulo="¿Eliminar categoría?"
        descripcion={aEliminar ? `Los productos de «${aEliminar.nombre}» quedarán sin categoría. Ningún producto se borra.` : ""}
        confirmar="Eliminar"
        destructivo
        onConfirm={handleEliminar}
      />
    </>
  );
}
