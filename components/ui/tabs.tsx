"use client";

import { createContext, useContext, useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Pestañas simples, sin dependencias.
 *
 * Las de un formulario tienen un requisito que no es obvio: los campos de las
 * pestañas que no se ven siguen montados, ocultos con `hidden`. Si se
 * desmontaran, el `FormData` del envío solo llevaría los campos de la pestaña
 * abierta y guardar desde «Datos» borraría todo lo cargado en «Web».
 */
interface Ctx {
  valor: string;
  setValor: (v: string) => void;
  idBase: string;
}
const TabsCtx = createContext<Ctx | null>(null);

function useTabs(componente: string): Ctx {
  const ctx = useContext(TabsCtx);
  if (!ctx) throw new Error(`<${componente}> tiene que estar dentro de <Tabs>`);
  return ctx;
}

export function Tabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [valor, setValor] = useState(defaultValue);
  const idBase = useId();
  return (
    <TabsCtx.Provider value={{ valor, setValor, idBase }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 rounded-xl border border-border bg-white/[0.02] p-1", className)}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  pendiente,
}: {
  value: string;
  children: React.ReactNode;
  /** Marca la pestaña cuando tiene algo cargado, para que no pase inadvertida. */
  pendiente?: boolean;
}) {
  const { valor, setValor, idBase } = useTabs("TabsTrigger");
  const activo = valor === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${idBase}-tab-${value}`}
      aria-selected={activo}
      aria-controls={`${idBase}-panel-${value}`}
      onClick={() => setValor(value)}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-caption font-medium transition-colors",
        activo
          ? "bg-white/[0.09] text-foreground"
          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
      )}
    >
      {children}
      {pendiente && <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { valor, idBase } = useTabs("TabsContent");
  const activo = valor === value;
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      hidden={!activo}
      className={className}
    >
      {children}
    </div>
  );
}
