"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebounce } from "@/lib/use-debounce";
import {
  buscarClientes,
  crearClienteRapido,
  type ClienteBreve,
} from "@/lib/actions/clientes-actions";

export interface ClienteElegido {
  id: string | null;
  nombre: string;
}

/**
 * A quién se le vende.
 *
 * Escribir un nombre suelto sigue funcionando —en el mostrador la mayoría de
 * las ventas son a alguien que pasa una sola vez—, pero si se elige un cliente
 * de la agenda la venta le queda asociada y su ficha empieza a decir cuánto
 * compró. Y si es alguien nuevo que va a volver, se guarda en el momento con
 * dos campos: cargar ocho con la cola esperando no lo hace nadie.
 */
export function SelectorCliente({
  valor,
  onCambiar,
}: {
  valor: ClienteElegido;
  onCambiar: (v: ClienteElegido) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const busquedaDebounced = useDebounce(busqueda, 250);
  const [resultados, setResultados] = useState<ClienteBreve[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [ofreciendoGuardar, setOfreciendoGuardar] = useState(false);

  useEffect(() => {
    const termino = busquedaDebounced.trim();
    if (termino.length < 2) return;
    let vigente = true;
    buscarClientes(termino).then((r) => {
      if (vigente) setResultados(r);
    });
    return () => {
      vigente = false;
    };
  }, [busquedaDebounced]);

  function elegir(c: ClienteBreve) {
    onCambiar({ id: c.id, nombre: c.nombre });
    setBusqueda("");
    setResultados([]);
    setOfreciendoGuardar(false);
  }

  function limpiar() {
    onCambiar({ id: null, nombre: "" });
    setBusqueda("");
    setResultados([]);
    setOfreciendoGuardar(false);
    setTelefono("");
  }

  async function guardarNuevo() {
    const nombre = busqueda.trim() || valor.nombre.trim();
    if (!nombre) return;
    setGuardando(true);
    try {
      const r = await crearClienteRapido(nombre, telefono);
      if (!r.success) return void toast.error(r.error);
      toast.success(`«${r.nombre}» guardado en clientes`);
      onCambiar({ id: r.id ?? null, nombre: r.nombre });
      setBusqueda("");
      setResultados([]);
      setOfreciendoGuardar(false);
      setTelefono("");
    } finally {
      setGuardando(false);
    }
  }

  // Ya hay un cliente elegido de la agenda.
  if (valor.id) {
    return (
      <div className="space-y-1.5">
        <Label>Cliente</Label>
        <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate text-caption font-medium">{valor.nombre}</span>
          <Button variant="ghost" size="sm" onClick={limpiar} aria-label="Quitar el cliente">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  const sinResultados = busquedaDebounced.trim().length >= 2 && resultados.length === 0;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="caja-cliente">Cliente</Label>
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="caja-cliente"
          className="pl-9"
          value={busqueda || valor.nombre}
          onChange={(e) => {
            const v = e.target.value;
            setBusqueda(v);
            // Lo escrito vale como nombre aunque no se elija nadie de la
            // agenda: la mayoría de las ventas del mostrador son así.
            onCambiar({ id: null, nombre: v });
            if (v.trim().length < 2) {
              setResultados([]);
              setOfreciendoGuardar(false);
            }
          }}
          placeholder="Opcional — buscá en la agenda o escribí un nombre"
          maxLength={160}
        />
      </div>

      {resultados.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => elegir(c)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-caption font-medium">{c.nombre}</span>
                  {(c.telefono || c.ciudad) && (
                    <span className="block text-caption text-muted-foreground">
                      {[c.telefono, c.ciudad].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sinResultados && !ofreciendoGuardar && (
        <button
          type="button"
          onClick={() => setOfreciendoGuardar(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-caption text-muted-foreground transition-colors hover:bg-white/[0.04]"
        >
          <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            «{busquedaDebounced.trim()}» no está en la agenda. Guardarlo como cliente
          </span>
        </button>
      )}

      {ofreciendoGuardar && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="caja-cliente-tel">Teléfono</Label>
            <Input
              id="caja-cliente-tel"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Opcional"
              maxLength={40}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOfreciendoGuardar(false)}>
              Ahora no
            </Button>
            <Button size="sm" onClick={guardarNuevo} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar cliente"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
