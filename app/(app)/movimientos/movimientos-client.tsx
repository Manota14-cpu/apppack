"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { History, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PaginationLinks } from "@/components/ui/pagination";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useDebounce } from "@/lib/use-debounce";
import type { MovimientoConProducto } from "@/types/database.types";

const VARIANTE: Record<string, "default" | "success" | "warning" | "destructive" | "outline"> = {
  entrada: "success",
  salida: "destructive",
  creacion: "outline",
  ajuste: "warning",
};

const cant = (n: number) => Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });

interface Props {
  movimientos: MovimientoConProducto[];
  total: number;
  pagina: number;
  pageSize: number;
  filtros: { q: string; tipo: string };
}

export function MovimientosClient({ movimientos, total, pagina, pageSize, filtros }: Props) {
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
        if (!valor || valor === "todos") params.delete(clave);
        else params.set(clave, valor);
      }
      params.delete("page");
      startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false }));
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

  const hayFiltros = !!filtros.q || filtros.tipo !== "todos";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Movimientos de stock</h1>
        <p className="text-caption text-muted-foreground">
          {total === 0 ? "Sin movimientos" : `${total.toLocaleString("es-AR")} ${total === 1 ? "movimiento" : "movimientos"}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar por producto o SKU…"
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar movimientos"
          />
        </div>
        <Select value={filtros.tipo} onValueChange={(v) => actualizarUrl({ tipo: v })}>
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            <SelectItem value="entrada">Entradas</SelectItem>
            <SelectItem value="salida">Salidas</SelectItem>
            <SelectItem value="creacion">Carga inicial</SelectItem>
            <SelectItem value="ajuste">Ajustes</SelectItem>
          </SelectContent>
        </Select>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={() => { setBusqueda(""); startTransition(() => router.replace(pathname, { scroll: false })); }}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {movimientos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border py-20 text-center">
          <History className="h-8 w-8 text-muted-foreground" strokeWidth={1.2} aria-hidden="true" />
          <p className="text-body font-medium">{hayFiltros ? "Ningún movimiento coincide" : "Todavía no hay movimientos"}</p>
          <p className="text-caption text-muted-foreground">
            {hayFiltros ? "Probá con otros filtros." : "Cada entrada o salida de stock va a aparecer acá."}
          </p>
        </div>
      ) : (
        <>
          {/* Móvil */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {movimientos.map((m) => (
              <li key={m.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.productos?.nombre ?? "Producto eliminado"}</p>
                    <p className="text-caption text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <Badge variant={VARIANTE[m.tipo] ?? "default"}>{m.tipo}</Badge>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-3">
                  <span className={`font-mono-num text-body-lg font-semibold ${m.tipo === "salida" ? "text-destructive" : "text-success"}`}>
                    {m.tipo === "salida" ? "−" : "+"}{cant(m.cantidad)}
                  </span>
                  <span className="text-caption text-muted-foreground">Quedó en {cant(m.stock_resultante)}</span>
                </div>
                {m.motivo && <p className="mt-2 text-caption text-muted-foreground">{m.motivo}</p>}
              </li>
            ))}
          </ul>

          {/* Escritorio */}
          <div className="hidden rounded-xl border border-border lg:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Stock resultante</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-caption text-muted-foreground">
                        {new Date(m.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{m.productos?.nombre ?? "Producto eliminado"}</span>
                        {m.productos?.sku && <span className="ml-1.5 text-caption text-muted-foreground">{m.productos.sku}</span>}
                      </TableCell>
                      <TableCell><Badge variant={VARIANTE[m.tipo] ?? "default"}>{m.tipo}</Badge></TableCell>
                      <TableCell className={`text-right font-mono-num font-medium ${m.tipo === "salida" ? "text-destructive" : "text-success"}`}>
                        {m.tipo === "salida" ? "−" : "+"}{cant(m.cantidad)}
                      </TableCell>
                      <TableCell className="text-right font-mono-num">{cant(m.stock_resultante)}</TableCell>
                      <TableCell className="max-w-xs truncate text-caption text-muted-foreground">{m.motivo ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <PaginationLinks total={total} page={pagina} pageSize={pageSize} />
        </>
      )}
    </div>
  );
}
