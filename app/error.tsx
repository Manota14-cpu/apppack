"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[error.tsx]", error.message, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertCircle className="h-7 w-7 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-display">Algo salió mal</h1>
        <p className="max-w-sm text-body text-muted-foreground">
          No se pudo cargar esta página. Probá de nuevo; si sigue pasando, revisá el estado de la base en
          Configuración.
        </p>
      </div>

      {process.env.NODE_ENV === "development" && (
        <details className="w-full max-w-md rounded-xl border border-border bg-white/[0.03] p-4 text-left">
          <summary className="cursor-pointer text-caption font-medium text-muted-foreground">Detalle técnico</summary>
          <pre className="mt-2 overflow-auto text-[11px] text-muted-foreground">{error.stack}</pre>
        </details>
      )}

      <div className="flex justify-center gap-3">
        <Button onClick={reset} size="lg">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Reintentar
        </Button>
        <Button variant="outline" asChild size="lg">
          <Link href="/dashboard">
            <Home className="h-4 w-4" aria-hidden="true" />
            Volver al inicio
          </Link>
        </Button>
      </div>
    </div>
  );
}
