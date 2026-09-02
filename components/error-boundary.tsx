"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertCircle className="h-7 w-7 text-destructive" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-section">Algo salió mal en esta sección</h2>
            <p className="text-body text-muted-foreground">
              Podés reintentar sin perder lo que hayas guardado.
            </p>
          </div>

          {process.env.NODE_ENV === "development" && (
            <details className="rounded-xl border border-border bg-white/[0.03] p-4 text-left">
              <summary className="cursor-pointer text-caption font-medium text-muted-foreground">
                Detalle técnico
              </summary>
              <pre className="mt-2 overflow-auto text-[11px] text-muted-foreground">{error.stack}</pre>
            </details>
          )}

          <div className="flex justify-center gap-3">
            <Button onClick={() => this.setState({ error: null })}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reintentar
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                <Home className="h-4 w-4" aria-hidden="true" />
                Ir al inicio
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
