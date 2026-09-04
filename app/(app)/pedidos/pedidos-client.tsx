"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Download,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PaginationLinks } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  cambiarEstadoPedido,
  eliminarPedido,
  guardarNotaPedido,
} from "@/lib/actions/pedidos-actions";
import { descargarPedidos } from "@/lib/excel-cliente";
import { ESTADOS_PEDIDO, ETIQUETA_PAGO, type Fecha, type Pedido } from "@/types/database.types";

const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

const fechaHora = (valor: Fecha) =>
  new Date(valor).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const ETIQUETA: Record<string, string> = {
  pendiente: "Pendiente",
  preparando: "Preparando",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const VARIANTE: Record<string, "default" | "warning" | "success" | "destructive"> = {
  pendiente: "warning",
  preparando: "default",
  entregado: "success",
  cancelado: "destructive",
};

/** Deja solo los dígitos y le pone el código de país que espera wa.me. */
function linkWhatsApp(telefono: string, numero: number, nombre: string): string {
  const digitos = telefono.replace(/[^0-9]/g, "");
  const conPais = digitos.startsWith("54") ? digitos : `54${digitos.replace(/^0/, "")}`;
  const texto = encodeURIComponent(
    `Hola ${nombre}, te escribo por tu pedido #${numero} de Pack Distribuidora.`
  );
  return `https://wa.me/${conPais}?text=${texto}`;
}

interface Props {
  pedidos: Pedido[];
  total: number;
  pagina: number;
  pageSize: number;
  resumen: Record<string, { cantidad: number; monto: number }>;
  filtroEstado: string;
}

export function PedidosClient({ pedidos, total, pagina, pageSize, resumen, filtroEstado }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [abierto, setAbierto] = useState<string | null>(null);
  const [aCancelar, setACancelar] = useState<Pedido | null>(null);
  const [aEliminar, setAEliminar] = useState<Pedido | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  async function descargar() {
    setDescargando(true);
    try {
      await descargarPedidos(
        pedidos.map((p) => ({
          numero: p.numero,
          estado: p.estado,
          canal: p.canal,
          nombre: p.nombre,
          telefono: p.telefono,
          direccion: p.direccion,
          localidad: p.localidad,
          provincia: p.provincia,
          metodo_pago: p.metodo_pago,
          notas: p.notas,
          total: p.total,
          created_at: p.created_at,
          items: p.items.map((i) => ({
            nombre: i.nombre,
            unidad_medida: i.unidad_medida,
            precio: i.precio,
            cantidad: i.cantidad,
          })),
        })),
        filtroEstado === "todos" ? "" : filtroEstado
      );
      toast.success("Pedidos descargados", {
        description:
          filtroEstado === "todos"
            ? "Se descargó lo que estás viendo en esta página."
            : `Solo los pedidos en estado «${ETIQUETA[filtroEstado] ?? filtroEstado}» de esta página.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar");
    } finally {
      setDescargando(false);
    }
  }

  async function confirmarEliminacion() {
    if (!aEliminar) return;
    const pedido = aEliminar;
    setAEliminar(null);
    setOcupado(pedido.id);
    try {
      const r = await eliminarPedido(pedido.id);
      if (!r.success) return void toast.error(r.error);
      toast.success(`Pedido #${r.numero} eliminado`, {
        description: "Si tenía stock descontado, volvió al catálogo.",
      });
      startTransition(() => router.refresh());
    } finally {
      setOcupado(null);
    }
  }

  function filtrar(estado: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (estado === "todos") params.delete("estado");
    else params.set("estado", estado);
    params.delete("page");
    startTransition(() => {
      router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
    });
  }

  async function cambiar(pedido: Pedido, estado: string) {
    // Cancelar devuelve stock a la estantería: no es un cambio de etiqueta y
    // merece una confirmación explícita.
    if (estado === "cancelado") {
      setACancelar(pedido);
      return;
    }
    setOcupado(pedido.id);
    try {
      const r = await cambiarEstadoPedido(pedido.id, estado);
      if (!r.success) return void toast.error(r.error);
      toast.success(`Pedido #${pedido.numero}: ${ETIQUETA[estado] ?? estado}`);
      startTransition(() => router.refresh());
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarCancelacion() {
    if (!aCancelar) return;
    const pedido = aCancelar;
    setACancelar(null);
    setOcupado(pedido.id);
    try {
      const r = await cambiarEstadoPedido(pedido.id, "cancelado");
      if (!r.success) return void toast.error(r.error);
      toast.success(`Pedido #${pedido.numero} cancelado`, {
        description: "El stock volvió al catálogo.",
      });
      startTransition(() => router.refresh());
    } finally {
      setOcupado(null);
    }
  }

  async function guardarNota(pedido: Pedido, nota: string) {
    const r = await guardarNotaPedido(pedido.id, nota);
    if (!r.success) return void toast.error(r.error);
    toast.success("Nota guardada");
    startTransition(() => router.refresh());
  }

  const pendientes = resumen.pendiente ?? { cantidad: 0, monto: 0 };
  const preparando = resumen.preparando ?? { cantidad: 0, monto: 0 };
  const porAtender = pendientes.cantidad + preparando.cantidad;
  const montoPorAtender = pendientes.monto + preparando.monto;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Pedidos</h1>
          <p className="text-caption text-muted-foreground">
            {porAtender > 0
              ? `${porAtender} sin entregar · ${money(montoPorAtender)}`
              : `${total.toLocaleString("es-AR")} ${total === 1 ? "pedido" : "pedidos"} en total`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={descargar}
          disabled={descargando || pedidos.length === 0}
        >
          <Download className="h-4 w-4" />
          {descargando ? "Generando…" : "Descargar"}
        </Button>
        <Select value={filtroEstado} onValueChange={filtrar}>
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS_PEDIDO.map((e) => (
              <SelectItem key={e} value={e}>
                {ETIQUETA[e]}
                {resumen[e] ? ` (${resumen[e].cantidad})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-body-lg font-semibold">
              {filtroEstado === "todos" ? "Todavía no hay pedidos" : "No hay pedidos con ese estado"}
            </p>
            <p className="text-caption text-muted-foreground">
              Los pedidos que hagan tus clientes desde la tienda aparecen acá.
            </p>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5" aria-label="Listado de pedidos">
          {pedidos.map((p) => {
            const expandido = abierto === p.id;
            const unidades = p.items.reduce((s, i) => s + i.cantidad, 0);

            return (
              <li key={p.id} className="rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-start gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => setAbierto(expandido ? null : p.id)}
                    aria-expanded={expandido}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  >
                    <span className="mt-0.5 text-muted-foreground" aria-hidden="true">
                      {expandido ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-num font-semibold">#{p.numero}</span>
                        <span className="font-medium">{p.nombre}</span>
                        <Badge variant={VARIANTE[p.estado] ?? "default"}>
                          {ETIQUETA[p.estado] ?? p.estado}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block text-caption text-muted-foreground">
                        {[fechaHora(p.created_at), p.localidad].filter(Boolean).join(" · ")} ·{" "}
                        {p.items.length}{" "}
                        {p.items.length === 1 ? "renglón" : "renglones"}, {unidades}{" "}
                        {unidades === 1 ? "unidad" : "unidades"}
                      </span>
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono-num text-body-lg font-semibold">{money(p.total)}</span>
                    <Select
                      value={p.estado}
                      onValueChange={(v) => cambiar(p, v)}
                      disabled={ocupado === p.id}
                    >
                      <SelectTrigger className="h-9 w-[140px]" aria-label={`Estado del pedido ${p.numero}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_PEDIDO.map((e) => (
                          <SelectItem key={e} value={e}>
                            {ETIQUETA[e]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {expandido && (
                  <div className="space-y-4 border-t border-border p-4">
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {p.items.map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="text-caption">{i.nombre}</span>
                            <span className="ml-2 text-caption text-muted-foreground">
                              {i.unidad_medida}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono-num text-caption">
                            {i.cantidad} × {money(i.precio)} ={" "}
                            <strong>{money(i.cantidad * i.precio)}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5 text-caption">
                        {p.direccion && (
                          <p className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span>
                              {[p.direccion, p.localidad, p.provincia].filter(Boolean).join(", ")}
                            </span>
                          </p>
                        )}
                        {p.telefono && (
                          <p className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <a href={`tel:${p.telefono}`} className="hover:underline">
                              {p.telefono}
                            </a>
                          </p>
                        )}
                        {p.metodo_pago && (
                          <p className="text-muted-foreground">
                            Cobrado por {ETIQUETA_PAGO[p.metodo_pago] ?? p.metodo_pago}
                          </p>
                        )}
                        {p.requiere_factura && (
                          <p className="flex items-start gap-2">
                            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span>
                              Requiere factura
                              {p.razon_social && ` · ${p.razon_social}`}
                              {p.dni_cuit && ` · ${p.dni_cuit}`}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor={`nota-${p.id}`}>Nota interna</Label>
                        <Textarea
                          id={`nota-${p.id}`}
                          rows={2}
                          defaultValue={p.notas ?? ""}
                          placeholder="Para vos: cómo prepararlo, cuándo se entrega…"
                          onBlur={(e) => {
                            if (e.target.value.trim() !== (p.notas ?? "").trim()) {
                              void guardarNota(p, e.target.value);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {p.telefono && (
                        <a
                          href={linkWhatsApp(p.telefono, p.numero, p.nombre)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-caption font-medium transition-colors hover:bg-white/[0.04]"
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden="true" />
                          Escribirle por WhatsApp
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        className="ml-auto text-destructive hover:text-destructive"
                        onClick={() => setAEliminar(p)}
                        disabled={ocupado === p.id}
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <PaginationLinks total={total} page={pagina} pageSize={pageSize} />

      <ConfirmDialog
        open={aEliminar !== null}
        onOpenChange={(o) => !o && setAEliminar(null)}
        titulo="¿Eliminar el pedido para siempre?"
        descripcion={
          aEliminar
            ? `El pedido #${aEliminar.numero} desaparece del historial y deja de figurar en los informes. ${
                aEliminar.estado === "cancelado"
                  ? "Ya estaba cancelado, así que el stock no cambia."
                  : `Las ${aEliminar.items.reduce((s, i) => s + i.cantidad, 0)} unidades vuelven al stock antes de borrarlo.`
              } Si solo querés dejar de contarlo, cancelalo: eso conserva la historia.`
            : ""
        }
        confirmar="Eliminar para siempre"
        onConfirm={confirmarEliminacion}
        destructivo
      />

      <ConfirmDialog
        open={aCancelar !== null}
        onOpenChange={(o) => !o && setACancelar(null)}
        titulo="¿Cancelar el pedido?"
        descripcion={
          aCancelar
            ? `El pedido #${aCancelar.numero} de ${aCancelar.nombre} pasa a cancelado y las ${aCancelar.items.reduce((s, i) => s + i.cantidad, 0)} unidades vuelven al stock, con su movimiento en el historial.`
            : ""
        }
        confirmar="Cancelar pedido"
        onConfirm={confirmarCancelacion}
        destructivo
      />
    </div>
  );
}
