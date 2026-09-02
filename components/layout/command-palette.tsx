"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Search } from "lucide-react";
import { buscarProductos } from "@/lib/actions/productos-actions";

interface Resultado {
  id: string;
  nombre: string;
  sku: string | null;
  stock: number;
  unidad_medida: string;
}

const DEBOUNCE_MS = 220;

export function CommandPalette() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [seleccionado, setSeleccionado] = useState(0);
  const [buscando, setBuscando] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Descarta respuestas de búsquedas que quedaron viejas. */
  const pedidoActual = useRef(0);

  const abrir = useCallback((valor: boolean) => {
    setAbierto(valor);
    // El reinicio va acá y no en un efecto: es consecuencia directa de la acción.
    setQuery("");
    setResultados([]);
    setSeleccionado(0);
    setBuscando(false);
    pedidoActual.current++;
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((previo) => {
          if (!previo) {
            setQuery("");
            setResultados([]);
            setSeleccionado(0);
            setBuscando(false);
            pedidoActual.current++;
          }
          return !previo;
        });
      }
      if (e.key === "Escape") setAbierto(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

  /** El debounce vive en el manejador del input, no en un efecto sobre el estado. */
  function handleChange(valor: string) {
    setQuery(valor);
    if (temporizador.current) clearTimeout(temporizador.current);

    const termino = valor.trim();
    if (!termino) {
      pedidoActual.current++;
      setResultados([]);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    temporizador.current = setTimeout(async () => {
      const pedido = ++pedidoActual.current;
      try {
        const data = await buscarProductos(termino);
        if (pedido !== pedidoActual.current) return; // llegó tarde
        setResultados(data as Resultado[]);
        setSeleccionado(0);
      } finally {
        if (pedido === pedidoActual.current) setBuscando(false);
      }
    }, DEBOUNCE_MS);
  }

  const irA = useCallback(
    (r: Resultado) => {
      setAbierto(false);
      // Lleva a la lista ya filtrada. Antes el parámetro se ignoraba.
      router.push(`/productos?q=${encodeURIComponent(r.sku || r.nombre)}`);
    },
    [router]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSeleccionado((p) => Math.min(p + 1, resultados.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSeleccionado((p) => Math.max(p - 1, 0));
    }
    if (e.key === "Enter") {
      const elegido = resultados[seleccionado];
      if (elegido) irA(elegido);
    }
  }

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      onClick={() => abrir(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar productos"
    >
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="glass-strong relative w-full max-w-lg overflow-hidden rounded-2xl border shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-placeholder"
            placeholder="Buscar productos por nombre o SKU…"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            aria-label="Búsqueda rápida de productos"
            aria-controls="paleta-resultados"
            aria-activedescendant={resultados[seleccionado] ? `resultado-${seleccionado}` : undefined}
          />
          <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-overline text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        {resultados.length > 0 && (
          <ul id="paleta-resultados" className="max-h-80 overflow-y-auto p-1.5" role="listbox">
            {resultados.map((r, i) => (
              <li key={r.id} role="option" aria-selected={i === seleccionado} id={`resultado-${i}`}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    i === seleccionado
                      ? "bg-white/[0.09] text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.05]"
                  }`}
                  onClick={() => irA(r)}
                  onMouseEnter={() => setSeleccionado(i)}
                >
                  <Package className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-foreground">{r.nombre}</span>
                    {r.sku && <span className="block truncate text-caption text-muted-foreground">{r.sku}</span>}
                  </span>
                  <span className="shrink-0 font-mono-num text-caption text-muted-foreground">
                    {Number(r.stock).toLocaleString("es-AR", { maximumFractionDigits: 2 })} {r.unidad_medida}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {query.trim() && !buscando && resultados.length === 0 && (
          <p className="px-6 py-8 text-center text-caption text-muted-foreground" role="status">
            Sin resultados para «{query.trim()}»
          </p>
        )}
        {buscando && resultados.length === 0 && (
          <p className="px-6 py-8 text-center text-caption text-muted-foreground" role="status">
            Buscando…
          </p>
        )}
      </div>
    </div>
  );
}
