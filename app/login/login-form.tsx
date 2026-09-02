"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { iniciarSesion, type EstadoFormulario } from "./actions";

const estadoInicial: EstadoFormulario = { error: null };

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? "Ingresando…" : "Ingresar"}
    </Button>
  );
}

export function LoginForm() {
  // useActionState reemplaza a useFormState, eliminado en React 19.
  const [estado, accion] = useActionState(iniciarSesion, estadoInicial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Panel de administración</CardTitle>
        <CardDescription>Ingresá la contraseña para gestionar el catálogo y el stock.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={accion} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              required
              autoFocus
              autoComplete="current-password"
            />
          </div>

          {estado.error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-caption text-destructive" role="alert">
              {estado.error}
            </p>
          )}

          <BotonEnviar />
        </form>
      </CardContent>
    </Card>
  );
}
