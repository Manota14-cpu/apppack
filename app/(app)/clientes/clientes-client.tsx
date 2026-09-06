"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Download,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { money } from "@/lib/formato";
import { useDebounce } from "@/lib/use-debounce";
import { descargarClientes } from "@/lib/excel-cliente";
import {
  actualizarCliente,
  archivarCliente,
  comprasDelCliente,
  crearCliente,
} from "@/lib/actions/clientes-actions";
import type { Cliente, CompraCliente, Fecha } from "@/types/database.types";

const fecha = (valor: Fecha) =>
  new Date(valor).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });

/** Cuántos días pasaron, para saber si hace rato que no viene. */
function diasDesde(valor: Fecha): number {
  return Math.floor((Date.now() - new Date(valor).getTime()) / 86_400_000);
}

/** Deja el teléfono como lo espera wa.me, con el código de país. */
function linkWhatsApp(telefono: string, nombre: string): string {
  const digitos = telefono.replace(/[^0-9]/g, "");
  const conPais = digitos.startsWith("54") ? digitos : `54${digitos.replace(/^0/, "")}`;
  const texto = encodeURIComponent(`Hola ${nombre}, te escribo de Pack Distribuidora.`);
  return `https://wa.me/${conPais}?text=${texto}`;
}

interface Props {
  clientes: Cliente[];
  filtros: { q: string; estado: string };
}

export function ClientesClient({ clientes, filtros }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [busqueda, setBusqueda] = useState(filtros.q);
  const busquedaDebounced = useDebounce(busqueda, 300);
  const primeraCarga = useRef(true);

  const actualizarUrl = useCallback(
    (cambios: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (!valor || valor === "activos") params.delete(clave);
        else params.set(clave, valor);
      }
      startTransition(() => {
        router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      return;
    }
    if (busquedaDebounced !== filtros.q) actualizarUrl({ q: busquedaDebounced || null });
  }, [busquedaDebounced, filtros.q, actualizarUrl]);

  const [crearAbierto, setCrearAbierto] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [verFicha, setVerFicha] = useState<Cliente | null>(null);
  const [descargando, setDescargando] = useState(false);

  const refrescar = () => startTransition(() => router.refresh());
  const archivados = filtros.estado === "archivados";

  async function alternarArchivo(c: Cliente) {
    const r = await archivarCliente(c.id, !c.activo);
    if (!r.success) return void toast.error(r.error);
    toast.success(c.activo ? `«${c.nombre}» archivado` : `«${c.nombre}» recuperado`);
    refrescar();
  }

  async function descargar() {
    setDescargando(true);
    try {
      await descargarClientes(clientes);
      toast.success("Clientes descargados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Clientes</h1>
          <p className="text-caption text-muted-foreground">
            {clientes.length === 0
              ? archivados
                ? "No hay clientes archivados"
                : "Todavía no cargaste ninguno"
              : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}${archivados ? " archivados" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={descargar}
            disabled={descargando || clientes.length === 0}
          >
            <Download className="h-4 w-4" />
            {descargando ? "Generando…" : "Descargar"}
          </Button>
          <Button size="sm" onClick={() => setCrearAbierto(true)}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, teléfono, correo o ciudad…"
            aria-label="Buscar clientes"
          />
        </div>
        <Select value={filtros.estado} onValueChange={(v) => actualizarUrl({ estado: v })}>
          <SelectTrigger className="w-[160px]" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="archivados">Archivados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {clientes.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <Users className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-body-lg font-semibold">
              {filtros.q ? "Ningún cliente coincide" : "Todavía no hay clientes"}
            </p>
            <p className="mx-auto max-w-md text-caption text-muted-foreground">
              {filtros.q
                ? "Probá con otro nombre, teléfono o ciudad."
                : "Cargá los que compran seguido. Después los elegís desde la caja y la venta les queda asociada, así podés ver cuánto compró cada uno."}
            </p>
          </div>
          {!filtros.q && (
            <Button onClick={() => setCrearAbierto(true)}>
              <Plus className="h-4 w-4" />
              Nuevo cliente
            </Button>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5" aria-label="Listado de clientes">
          {clientes.map((c) => {
            const dias = c.ultima_compra ? diasDesde(c.ultima_compra) : null;
            return (
              <li key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setVerFicha(c)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-medium leading-snug">{c.nombre}</p>
                    <p className="text-caption text-muted-foreground mt-0.5">
                      {[c.telefono, c.ciudad, c.email].filter(Boolean).join(" · ") ||
                        "Sin datos de contacto"}
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.telefono && (
                      <a
                        href={linkWhatsApp(c.telefono, c.nombre)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Escribirle a ${c.nombre} por WhatsApp`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditando(c)}
                      aria-label={`Editar ${c.nombre}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => alternarArchivo(c)}
                      aria-label={c.activo ? `Archivar ${c.nombre}` : `Recuperar ${c.nombre}`}
                    >
                      {c.activo ? (
                        <Archive className="h-3.5 w-3.5" />
                      ) : (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {c.compras > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-3">
                    <span className="text-caption">
                      <span className="text-muted-foreground">Compró </span>
                      <strong className="font-mono-num">{c.compras}</strong>
                      <span className="text-muted-foreground">
                        {c.compras === 1 ? " vez · " : " veces · "}
                      </span>
                      <strong className="font-mono-num">{money(c.gastado)}</strong>
                    </span>
                    {dias !== null && (
                      // Un cliente bueno que hace tres meses que no aparece es
                      // información: por eso se muestra el tiempo, no la fecha.
                      <Badge variant={dias > 90 ? "warning" : "outline"}>
                        {dias === 0
                          ? "Compró hoy"
                          : dias === 1
                            ? "Ayer"
                            : `Hace ${dias} días`}
                      </Badge>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {crearAbierto && (
        <ClienteDialog
          titulo="Nuevo cliente"
          onOpenChange={setCrearAbierto}
          onListo={refrescar}
        />
      )}
      {editando && (
        <ClienteDialog
          key={editando.id}
          titulo={`Editar ${editando.nombre}`}
          cliente={editando}
          onOpenChange={(o) => !o && setEditando(null)}
          onListo={refrescar}
        />
      )}
      {verFicha && <FichaDialog cliente={verFicha} onCerrar={() => setVerFicha(null)} />}
    </div>
  );
}

function ClienteDialog({
  titulo,
  cliente,
  onOpenChange,
  onListo,
}: {
  titulo: string;
  cliente?: Cliente;
  onOpenChange: (o: boolean) => void;
  onListo: () => void;
}) {
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      const datos = new FormData(e.currentTarget);
      const r = cliente
        ? await actualizarCliente(cliente.id, datos)
        : await crearCliente(datos);
      if (!r.success) return void toast.error(r.error);
      toast.success(cliente ? "Cliente actualizado" : "Cliente guardado");
      onOpenChange(false);
      onListo();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Solo el nombre es obligatorio. Lo demás se completa cuando lo sepas.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cl-nombre">Nombre *</Label>
            <Input
              id="cl-nombre"
              name="nombre"
              defaultValue={cliente?.nombre}
              required
              maxLength={160}
              autoFocus={!cliente}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cl-telefono">Teléfono</Label>
              <Input
                id="cl-telefono"
                name="telefono"
                type="tel"
                inputMode="tel"
                defaultValue={cliente?.telefono ?? ""}
                maxLength={40}
                placeholder="3492 301333"
                aria-describedby="cl-telefono-ayuda"
              />
              <p id="cl-telefono-ayuda" className="text-caption text-muted-foreground">
                Con esto se habilita el botón de WhatsApp.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-email">Correo</Label>
              <Input
                id="cl-email"
                name="email"
                type="email"
                inputMode="email"
                defaultValue={cliente?.email ?? ""}
                maxLength={160}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-ciudad">Ciudad</Label>
              <Input
                id="cl-ciudad"
                name="ciudad"
                defaultValue={cliente?.ciudad ?? ""}
                maxLength={80}
                placeholder="Rafaela"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-direccion">Dirección</Label>
              <Input
                id="cl-direccion"
                name="direccion"
                defaultValue={cliente?.direccion ?? ""}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-dni">DNI o CUIT</Label>
              <Input
                id="cl-dni"
                name="dni_cuit"
                defaultValue={cliente?.dni_cuit ?? ""}
                maxLength={20}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-razon">Razón social</Label>
              <Input
                id="cl-razon"
                name="razon_social"
                defaultValue={cliente?.razon_social ?? ""}
                maxLength={160}
                placeholder="Si factura a nombre de un comercio"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-notas">Notas</Label>
            <Textarea
              id="cl-notas"
              name="notas"
              rows={2}
              defaultValue={cliente?.notas ?? ""}
              maxLength={600}
              placeholder="Ej: compra los martes, pide factura A"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : cliente ? "Guardar cambios" : "Guardar cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ETIQUETA_CANAL: Record<string, string> = {
  mostrador: "Mostrador",
  whatsapp: "Tienda web",
  devolucion: "Devolución",
};

function FichaDialog({ cliente, onCerrar }: { cliente: Cliente; onCerrar: () => void }) {
  const [compras, setCompras] = useState<CompraCliente[] | null>(null);

  useEffect(() => {
    comprasDelCliente(cliente.id).then(setCompras);
  }, [cliente.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente.nombre}</DialogTitle>
          <DialogDescription>
            {cliente.compras > 0
              ? `${cliente.compras} ${cliente.compras === 1 ? "compra" : "compras"} por ${money(cliente.gastado)}`
              : "Todavía no le vendiste nada"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5 rounded-xl border border-border p-4 text-caption">
            {cliente.telefono && (
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a href={`tel:${cliente.telefono}`} className="hover:underline">
                  {cliente.telefono}
                </a>
              </p>
            )}
            {cliente.email && (
              <p className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a href={`mailto:${cliente.email}`} className="hover:underline">
                  {cliente.email}
                </a>
              </p>
            )}
            {(cliente.direccion || cliente.ciudad) && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{[cliente.direccion, cliente.ciudad].filter(Boolean).join(", ")}</span>
              </p>
            )}
            {(cliente.razon_social || cliente.dni_cuit) && (
              <p className="text-muted-foreground">
                {[cliente.razon_social, cliente.dni_cuit].filter(Boolean).join(" · ")}
              </p>
            )}
            {cliente.notas && <p className="text-muted-foreground">{cliente.notas}</p>}
          </div>

          <div className="space-y-2">
            <p className="text-caption font-semibold">Compras</p>
            {compras === null ? (
              <Skeleton className="h-20 w-full" />
            ) : compras.length === 0 ? (
              <p className="rounded-xl border border-border p-6 text-center text-caption text-muted-foreground">
                Sin compras registradas. Elegilo desde la caja al cobrar y van a aparecer acá.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {compras.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                    <span className="font-mono-num font-semibold">#{c.numero}</span>
                    <span className="text-caption text-muted-foreground">{fecha(c.created_at)}</span>
                    <span className="min-w-0 flex-1 text-caption text-muted-foreground">
                      {ETIQUETA_CANAL[c.canal] ?? c.canal} · {c.renglones}{" "}
                      {c.renglones === 1 ? "renglón" : "renglones"}
                    </span>
                    {c.estado === "cancelado" && <Badge variant="destructive">Cancelado</Badge>}
                    <span className="font-mono-num text-caption font-semibold">
                      {money(c.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onCerrar}>Cerrar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
