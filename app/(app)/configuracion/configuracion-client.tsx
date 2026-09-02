"use client";

import { useState } from "react";
import { CheckCircle2, Database, Download, LogOut, Server, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { exportarBackup } from "@/lib/actions/backup-actions";
import { cerrarSesion } from "@/app/login/actions";

interface Props {
  totales: { productos: number; categorias: number; movimientos: number; inactivos: number };
  estructura: { ok: boolean; faltantes: string[] };
  servidor: { host: string; base: string; version: string };
}

export function ConfiguracionClient({ totales, estructura, servidor }: Props) {
  const [exportando, setExportando] = useState(false);

  async function handleBackup() {
    if (exportando) return;
    setExportando(true);
    try {
      const r = await exportarBackup();
      if (!r.success) return void toast.error(r.error);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `apppack-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup descargado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar el backup");
    } finally {
      setExportando(false);
    }
  }

  const stats = [
    { valor: totales.productos, etiqueta: "Productos" },
    { valor: totales.categorias, etiqueta: "Categorías" },
    { valor: totales.movimientos, etiqueta: "Movimientos" },
    { valor: totales.inactivos, etiqueta: "Eliminados" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Configuración</h1>
        <p className="text-caption text-muted-foreground">Estado de la base, backups y sesión</p>
      </div>

      <Card className={estructura.ok ? undefined : "border-destructive/40"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" aria-hidden="true" />
            Base de datos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-3">
          {estructura.ok ? (
            <p className="flex items-center gap-2 text-body text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Estructura al día. Todo listo para operar.
            </p>
          ) : (
            <>
              <p className="flex items-start gap-2 text-body text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Falta aplicar el esquema: no se encontró {estructura.faltantes.join(", ")}.
                  Hasta hacerlo no vas a poder crear productos ni mover stock.
                </span>
              </p>
              <div className="rounded-xl border border-border bg-white/[0.03] p-4 text-caption text-muted-foreground">
                <p className="mb-2 text-foreground">Ejecutá en la terminal, desde la carpeta del proyecto:</p>
                <code className="block rounded bg-black/50 px-3 py-2 text-foreground">npm run db:setup</code>
                <p className="mt-2">
                  También podés abrir <code className="rounded bg-white/[0.08] px-1.5 py-0.5">db/schema.sql</code> en
                  DBeaver y ejecutarlo con <strong className="text-foreground">Alt+X</strong> (Execute script).
                </p>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.etiqueta}>
                <p className="font-mono text-[26px] font-bold leading-none tabular-nums">
                  {s.valor.toLocaleString("es-AR")}
                </p>
                <p className="mt-1.5 text-caption text-muted-foreground">{s.etiqueta}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-4 text-caption text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" aria-hidden="true" />
              {servidor.host}
            </span>
            <span>base: <code className="rounded bg-white/[0.08] px-1.5 py-0.5">{servidor.base}</code></span>
            <span>{servidor.version}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" aria-hidden="true" />
            Backup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          <p className="text-body text-muted-foreground">
            Descarga un JSON con productos, categorías e historial completo de movimientos.
          </p>
          <Button onClick={handleBackup} disabled={exportando}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {exportando ? "Generando…" : "Descargar backup"}
          </Button>
          <p className="text-caption text-muted-foreground">
            Para editar el catálogo en Excel y volver a subirlo, usá Exportar e Importar en la sección Productos.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Acceso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-3">
          <p className="text-body text-muted-foreground">
            El panel se protege con una contraseña de administrador. Cada ingreso genera una sesión propia
            que vence a las 12 horas.
          </p>
          <p className="text-caption text-muted-foreground">
            Para cambiarla, actualizá{" "}
            <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-foreground">ADMIN_PASSWORD</code> en el
            servidor y reiniciá. Eso además cierra al instante todas las sesiones abiertas en cualquier dispositivo.
          </p>
          <form action={cerrarSesion}>
            <Button type="submit" variant="outline">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
