"use client";

import { useState } from "react";
import { BellRing, Check, Mail, Send, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { enviarAvisoDePrueba } from "@/lib/actions/avisos-actions";
import type { EstadoAvisos } from "@/lib/actions/avisos-actions";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Estado de los avisos automáticos.
 *
 * Un aviso que quizá funciona no sirve de nada: si no estás seguro de que va a
 * llegar, vas a seguir entrando a mirar el panel igual. Por eso esta sección
 * dice sin rodeos si hay un canal configurado, qué se mandó por última vez, y
 * deja probar el envío en el momento en vez de esperar a mañana a las ocho.
 */
export function AvisosSeccion({ estado }: { estado: EstadoAvisos }) {
  const [enviando, setEnviando] = useState(false);
  const configurado = estado.canales.length > 0;

  async function probar() {
    setEnviando(true);
    try {
      const r = await enviarAvisoDePrueba();
      if (!r.success) return void toast.error(r.error);
      toast.success(`Aviso enviado por ${r.enviados.join(" y ")}`, {
        description: r.hayAlgo
          ? "Con lo que hay para atender ahora mismo."
          : "No hay nada que reponer, así que fue un aviso vacío a propósito.",
      });
      if (r.fallos.length > 0) {
        toast.error(`Falló ${r.fallos[0]!.canal}`, { description: r.fallos[0]!.motivo });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
              <BellRing className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium">Avisos de reposición</p>
              <p className="text-caption text-muted-foreground">
                Todas las mañanas a las 8, AppPack mira el stock y los pedidos. Si hay algo que
                atender, te escribe; si no, no te molesta.
              </p>
            </div>
          </div>
          {configurado ? (
            <Badge variant="success">
              <Check className="h-2.5 w-2.5" aria-hidden="true" />
              Activo
            </Badge>
          ) : (
            <Badge variant="warning">Sin configurar</Badge>
          )}
        </div>

        {/* Qué se mandaría si el chequeo corriera ahora mismo. */}
        <div className="flex flex-wrap gap-6 rounded-xl border border-border p-4">
          <div>
            <p className="text-overline text-muted-foreground">Por reponer</p>
            <p className="font-mono-num text-body-lg font-semibold">
              {estado.pendiente.porReponer}
              {estado.pendiente.agotados > 0 && (
                <span className="ml-1.5 text-caption font-normal text-muted-foreground">
                  {estado.pendiente.agotados} sin stock
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-overline text-muted-foreground">Pedidos sin atender</p>
            <p className="font-mono-num text-body-lg font-semibold">{estado.pendiente.pedidos}</p>
          </div>
          <div className="ml-auto self-center">
            <Button variant="outline" size="sm" onClick={probar} disabled={enviando || !configurado}>
              <Send className="h-3.5 w-3.5" />
              {enviando ? "Enviando…" : "Enviar una prueba"}
            </Button>
          </div>
        </div>

        {configurado ? (
          <ul className="space-y-2">
            {estado.canales.map((c) => (
              <li
                key={c.nombre}
                className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-caption"
              >
                {c.nombre === "email" ? (
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Webhook className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="font-medium">{c.nombre === "email" ? "Correo" : "Webhook"}</span>
                <span className="truncate text-muted-foreground">{c.destino}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-3 rounded-xl border border-border p-4 text-caption">
            <p className="text-muted-foreground">
              Para que funcione hace falta una variable de entorno en Vercel. Cualquiera de las dos
              alcanza:
            </p>

            <div>
              <p className="font-medium">Por correo — lo más rápido</p>
              <p className="text-muted-foreground">
                Creá una cuenta gratuita en resend.com y copiá la clave. Después, en Vercel:
                <code className="mx-1 rounded bg-white/[0.06] px-1.5 py-0.5">RESEND_API_KEY</code>y
                <code className="mx-1 rounded bg-white/[0.06] px-1.5 py-0.5">AVISOS_EMAIL_DESTINO</code>
                con tu dirección.
              </p>
            </div>

            <div>
              <p className="font-medium">Por webhook — si querés que llegue a WhatsApp</p>
              <p className="text-muted-foreground">
                <code className="mr-1 rounded bg-white/[0.06] px-1.5 py-0.5">AVISOS_WEBHOOK_URL</code>
                apuntando a donde quieras. AppPack manda el aviso ya escrito, listo para reenviar.
                Mandar un WhatsApp automático desde un número de empresa requiere aprobación de Meta,
                así que no es cosa de cinco minutos: por eso el webhook queda abierto en vez de
                prometerte algo que después no se puede activar.
              </p>
            </div>

            <p className="text-muted-foreground">
              También hace falta
              <code className="mx-1 rounded bg-white/[0.06] px-1.5 py-0.5">CRON_SECRET</code>
              (cualquier texto largo al azar), que es lo que autoriza la tarea diaria.
            </p>
          </div>
        )}

        {estado.ultimo && (
          <p className="text-caption text-muted-foreground">
            Último aviso: {fechaHora(estado.ultimo.fecha)} por {estado.ultimo.canales}
            {!estado.ultimo.ok && " — falló"}
            {estado.ultimo.detalle && ` · ${estado.ultimo.detalle}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
