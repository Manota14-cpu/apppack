"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descripcion: string;
  confirmar?: string;
  cancelar?: string;
  destructivo?: boolean;
  onConfirm: () => void | Promise<void>;
}

/** Reemplaza al `confirm()` del navegador, que no se puede estilar ni traducir. */
export function ConfirmDialog({
  open,
  onOpenChange,
  titulo,
  descripcion,
  confirmar = "Confirmar",
  cancelar = "Cancelar",
  destructivo = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [procesando, setProcesando] = useState(false);

  async function handleConfirm() {
    if (procesando) return;
    setProcesando(true);
    try {
      await onConfirm();
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={destructivo ? "flex items-center gap-2 text-destructive" : undefined}>
            {destructivo && <AlertTriangle className="h-5 w-5" aria-hidden="true" />}
            {titulo}
          </DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={procesando}>
            {cancelar}
          </Button>
          <Button variant={destructivo ? "destructive" : "default"} onClick={handleConfirm} disabled={procesando}>
            {procesando ? "Procesando…" : confirmar}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
