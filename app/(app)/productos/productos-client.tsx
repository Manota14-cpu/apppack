"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  FolderCog,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PaginationLinks } from "@/components/ui/pagination";
import { toast } from "sonner";
import { useDebounce } from "@/lib/use-debounce";
import { UNIDADES } from "@/lib/validation";
import type { Categoria, ProductoConCategoria } from "@/types/database.types";
import {
  actualizarProducto,
  ajustarStock,
  crearProducto,
  eliminarProducto,
  restaurarProducto,
} from "@/lib/actions/productos-actions";
import { CategoriasDialog } from "./categorias-dialog";
import { ImportarDialog } from "./importar-dialog";
import { descargarCatalogo } from "@/lib/excel-cliente";

const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
const cant = (n: number) => Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });

function nivelStock(p: ProductoConCategoria): { variante: "default" | "warning" | "destructive"; texto: string } {
  const stock = Number(p.stock);
  if (stock === 0) return { variante: "destructive", texto: "Sin stock" };
  if (stock <= Number(p.stock_minimo)) return { variante: "warning", texto: "Stock bajo" };
  return { variante: "default", texto: "En stock" };
}

interface Props {
  productos: ProductoConCategoria[];
  categorias: Categoria[];
  total: number;
  pagina: number;
  pageSize: number;
  filtros: { q: string; categoria: string; stock: string; estado: string };
}

export function ProductosClient({ productos, categorias, total, pagina, pageSize, filtros }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // ── Filtros sincronizados con la URL ───────────────────────────────
  const [busqueda, setBusqueda] = useState(filtros.q);
  const busquedaDebounced = useDebounce(busqueda, 300);
  const primeraCarga = useRef(true);

  const actualizarUrl = useCallback(
    (cambios: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === null || valor === "" || valor === "todas" || valor === "todos" || valor === "activos") {
          params.delete(clave);
        } else {
          params.set(clave, valor);
        }
      }
      if (!("page" in cambios)) params.delete("page");
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

  // ── Diálogos ───────────────────────────────────────────────────────
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [editando, setEditando] = useState<ProductoConCategoria | null>(null);
  const [ajustando, setAjustando] = useState<{ producto: ProductoConCategoria; signo: 1 | -1 } | null>(null);
  const [aEliminar, setAEliminar] = useState<ProductoConCategoria | null>(null);
  const [categoriasAbierto, setCategoriasAbierto] = useState(false);
  const [importarAbierto, setImportarAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const viendoEliminados = filtros.estado === "eliminados";

  const refrescar = () => startTransition(() => router.refresh());

  // ── Acciones ───────────────────────────────────────────────────────
  async function handleCrear(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      const r = await crearProducto(new FormData(e.currentTarget));
      if (!r.success) return void toast.error(r.error);
      toast.success("Producto creado");
      setCrearAbierto(false);
      refrescar();
    } finally {
      setEnviando(false);
    }
  }

  async function handleEditar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editando || enviando) return;
    setEnviando(true);
    try {
      const r = await actualizarProducto(editando.id, new FormData(e.currentTarget));
      if (!r.success) return void toast.error(r.error);
      toast.success("Producto actualizado");
      setEditando(null);
      refrescar();
    } finally {
      setEnviando(false);
    }
  }

  async function handleAjustar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ajustando || enviando) return;
    const form = new FormData(e.currentTarget);
    const cantidad = Math.abs(Number(form.get("cantidad")) || 0);
    const motivo = String(form.get("motivo") ?? "").trim();
    if (cantidad <= 0) return void toast.error("Ingresá una cantidad mayor a cero");

    setEnviando(true);
    try {
      const r = await ajustarStock(ajustando.producto.id, cantidad * ajustando.signo, motivo || "Sin motivo");
      if (!r.success) return void toast.error(r.error);
      toast.success(
        `${ajustando.signo === 1 ? "Entrada" : "Salida"} registrada`,
        { description: `${ajustando.producto.nombre} — stock ahora: ${cant(r.stockResultante)}` }
      );
      setAjustando(null);
      refrescar();
    } finally {
      setEnviando(false);
    }
  }

  async function handleEliminar() {
    if (!aEliminar) return;
    const r = await eliminarProducto(aEliminar.id);
    if (!r.success) return void toast.error(r.error);
    toast.success("Producto eliminado", { description: "Podés recuperarlo desde el filtro «Eliminados»." });
    setAEliminar(null);
    refrescar();
  }

  async function handleRestaurar(p: ProductoConCategoria) {
    const r = await restaurarProducto(p.id);
    if (!r.success) return void toast.error(r.error);
    toast.success(`«${p.nombre}» restaurado`);
    refrescar();
  }

  async function handleExportar() {
    try {
      await descargarCatalogo();
      toast.success("Catálogo exportado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo exportar");
    }
  }

  const hayFiltros = !!filtros.q || filtros.categoria !== "todas" || filtros.stock !== "todos" || viendoEliminados;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* ── Encabezado ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">Productos</h1>
          <p className="text-caption text-muted-foreground">
            {total === 0
              ? viendoEliminados
                ? "No hay productos eliminados"
                : "Sin resultados"
              : `${total.toLocaleString("es-AR")} ${total === 1 ? "producto" : "productos"}${viendoEliminados ? (total === 1 ? " eliminado" : " eliminados") : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCategoriasAbierto(true)}>
            <FolderCog className="h-4 w-4" />
            <span className="hidden sm:inline">Categorías</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportarAbierto(true)}>
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Importar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportar}>
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button size="sm" onClick={() => setCrearAbierto(true)}>
            <Plus className="h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar por nombre, SKU o código…"
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            aria-label="Buscar productos"
          />
        </div>
        <Select value={filtros.categoria} onValueChange={(v) => actualizarUrl({ categoria: v })}>
          <SelectTrigger className="w-[170px]" aria-label="Filtrar por categoría"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            <SelectItem value="sin">Sin categoría</SelectItem>
            {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtros.stock} onValueChange={(v) => actualizarUrl({ stock: v })}>
          <SelectTrigger className="w-[160px]" aria-label="Filtrar por stock"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo el stock</SelectItem>
            <SelectItem value="bajo">Stock bajo</SelectItem>
            <SelectItem value="sin">Sin stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtros.estado} onValueChange={(v) => actualizarUrl({ estado: v })}>
          <SelectTrigger className="w-[150px]" aria-label="Filtrar por estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="eliminados">Eliminados</SelectItem>
          </SelectContent>
        </Select>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={() => startTransition(() => { setBusqueda(""); router.replace(pathname, { scroll: false }); })}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* ── Sin resultados ── */}
      {productos.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-border py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <Package className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-body-lg font-semibold">{hayFiltros ? "No hay productos que coincidan" : "Todavía no hay productos"}</p>
            <p className="text-caption text-muted-foreground">
              {hayFiltros ? "Probá cambiando los filtros o la búsqueda." : "Creá el primero a mano o importá tu catálogo desde un Excel."}
            </p>
          </div>
          {!hayFiltros && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setCrearAbierto(true)}><Plus className="h-4 w-4" />Nuevo producto</Button>
              <Button variant="outline" onClick={() => setImportarAbierto(true)}><Upload className="h-4 w-4" />Importar Excel</Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Móvil: tarjetas ── */}
          <ul className="flex flex-col gap-2.5 lg:hidden" aria-label="Listado de productos">
            {productos.map((p) => {
              const nivel = nivelStock(p);
              return (
                <li key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{p.nombre}</p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        {p.sku ?? "Sin SKU"} · {p.categorias?.nombre ?? "Sin categoría"}
                      </p>
                    </div>
                    <Badge variant={nivel.variante}>{nivel.texto}</Badge>
                  </div>

                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-overline text-muted-foreground">Stock</p>
                      <p className="font-mono text-[26px] font-bold leading-none tracking-tight">
                        {cant(p.stock)}
                        <span className="ml-1.5 text-caption font-medium text-muted-foreground">{p.unidad_medida}</span>
                      </p>
                    </div>
                    <p className="font-mono-num text-body-lg font-semibold">{money(p.precio_venta)}</p>
                  </div>

                  {viendoEliminados ? (
                    <Button variant="outline" className="mt-4 w-full" onClick={() => handleRestaurar(p)}>
                      <RotateCcw className="h-4 w-4" />Restaurar
                    </Button>
                  ) : (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button variant="secondary" className="h-12" onClick={() => setAjustando({ producto: p, signo: 1 })}>
                          <ArrowUpCircle className="h-4 w-4" />Entrada
                        </Button>
                        <Button variant="secondary" className="h-12" onClick={() => setAjustando({ producto: p, signo: -1 })}>
                          <ArrowDownCircle className="h-4 w-4" />Salida
                        </Button>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="ghost" size="sm" className="flex-1" onClick={() => setEditando(p)}>
                          <Pencil className="h-3.5 w-3.5" />Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setAEliminar(p)}>
                          <Trash2 className="h-3.5 w-3.5" />Eliminar
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {/* ── Escritorio: tabla ── */}
          <div className="hidden rounded-xl border border-border lg:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Precio venta</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos.map((p) => {
                    const nivel = nivelStock(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="font-medium">{p.nombre}</span>
                          {p.descripcion && <p className="text-caption text-muted-foreground mt-0.5 line-clamp-1">{p.descripcion}</p>}
                        </TableCell>
                        <TableCell><span className="text-caption text-muted-foreground">{p.sku ?? "—"}</span></TableCell>
                        <TableCell>{p.categorias?.nombre ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right font-mono-num">{money(p.precio_venta)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono-num font-medium">{cant(p.stock)} {p.unidad_medida}</span>
                            {nivel.variante !== "default" && <Badge variant={nivel.variante}>{nivel.texto}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {viendoEliminados ? (
                            <div className="flex justify-end">
                              <Button variant="outline" size="sm" onClick={() => handleRestaurar(p)}>
                                <RotateCcw className="h-3.5 w-3.5" />Restaurar
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button variant="secondary" size="sm" onClick={() => setAjustando({ producto: p, signo: 1 })}>
                                <ArrowUpCircle className="h-3.5 w-3.5" />Entrada
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => setAjustando({ producto: p, signo: -1 })}>
                                <ArrowDownCircle className="h-3.5 w-3.5" />Salida
                              </Button>
                              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
                              <Button variant="ghost" size="sm" aria-label={`Editar ${p.nombre}`} onClick={() => setEditando(p)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Eliminar ${p.nombre}`}
                                className="text-destructive hover:text-destructive"
                                onClick={() => setAEliminar(p)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <PaginationLinks total={total} page={pagina} pageSize={pageSize} />
        </>
      )}

      {/* ── Diálogo: crear ── */}
      <Dialog open={crearAbierto} onOpenChange={setCrearAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
            <DialogDescription>El stock inicial queda registrado como movimiento de carga.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCrear} className="space-y-4">
            <CamposProducto categorias={categorias} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setCrearAbierto(false)}>Cancelar</Button>
              <Button type="submit" disabled={enviando}>{enviando ? "Creando…" : "Crear producto"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: editar ── */}
      <Dialog open={editando !== null} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
            <DialogDescription>El stock se cambia con entradas y salidas, no desde acá.</DialogDescription>
          </DialogHeader>
          {editando && (
            <form onSubmit={handleEditar} className="space-y-4">
              <CamposProducto categorias={categorias} producto={editando} />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                <Button type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Guardar cambios"}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Diálogo: ajustar stock ── */}
      <Dialog open={ajustando !== null} onOpenChange={(o) => !o && setAjustando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ajustando?.signo === 1 ? "Entrada de stock" : "Salida de stock"}</DialogTitle>
            <DialogDescription>
              {ajustando && `${ajustando.producto.nombre} — stock actual: ${cant(ajustando.producto.stock)} ${ajustando.producto.unidad_medida}`}
            </DialogDescription>
          </DialogHeader>
          {ajustando && (
            <form onSubmit={handleAjustar} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ajuste-cantidad">Cantidad</Label>
                <Input id="ajuste-cantidad" name="cantidad" type="number" step="0.01" min="0.01"
                  defaultValue="1" required autoFocus inputMode="decimal" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ajuste-motivo">Motivo</Label>
                <Textarea id="ajuste-motivo" name="motivo" rows={2}
                  defaultValue={ajustando.signo === 1 ? "Ingreso de mercadería" : "Salida de mercadería"}
                  placeholder="Ej: compra a proveedor, rotura, devolución…" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setAjustando(null)}>Cancelar</Button>
                <Button type="submit" disabled={enviando}>
                  {enviando ? "Registrando…" : ajustando.signo === 1 ? "Confirmar entrada" : "Confirmar salida"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={aEliminar !== null}
        onOpenChange={(o) => !o && setAEliminar(null)}
        titulo="¿Eliminar producto?"
        descripcion={
          aEliminar
            ? `«${aEliminar.nombre}» deja de aparecer en el catálogo. Su historial de movimientos se conserva y podés recuperarlo con el filtro «Eliminados».`
            : ""
        }
        confirmar="Eliminar"
        onConfirm={handleEliminar}
        destructivo
      />

      <CategoriasDialog
        open={categoriasAbierto}
        onOpenChange={setCategoriasAbierto}
        categorias={categorias}
        onCambio={refrescar}
      />

      <ImportarDialog open={importarAbierto} onOpenChange={setImportarAbierto} onImportado={refrescar} />
    </div>
  );
}

/** Campos compartidos por los formularios de alta y edición. */
function CamposProducto({ categorias, producto }: { categorias: Categoria[]; producto?: ProductoConCategoria }) {
  const [categoriaId, setCategoriaId] = useState(producto?.categoria_id ?? "");
  const [unidad, setUnidad] = useState(producto?.unidad_medida ?? "unidad");
  const editando = !!producto;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="f-nombre">Nombre *</Label>
        <Input id="f-nombre" name="nombre" defaultValue={producto?.nombre} required maxLength={160} autoFocus={!editando} />
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="f-descripcion">Descripción</Label>
        <Textarea id="f-descripcion" name="descripcion" rows={2} defaultValue={producto?.descripcion ?? ""} maxLength={600} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-sku">SKU</Label>
        <Input id="f-sku" name="sku" defaultValue={producto?.sku ?? ""} maxLength={64} placeholder="Código interno único" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-codigo">Código de barras</Label>
        <Input id="f-codigo" name="codigo_barras" defaultValue={producto?.codigo_barras ?? ""} maxLength={64} />
      </div>
      <div className="space-y-1.5">
        <Label>Categoría</Label>
        <Select value={categoriaId} onValueChange={setCategoriaId}>
          <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
          <SelectContent>
            {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <input type="hidden" name="categoria_id" value={categoriaId} />
      </div>
      <div className="space-y-1.5">
        <Label>Unidad de medida</Label>
        <Select value={unidad} onValueChange={setUnidad}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNIDADES.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
        <input type="hidden" name="unidad_medida" value={unidad} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-costo">Precio costo ($)</Label>
        <Input id="f-costo" name="precio_costo" type="number" step="0.01" min="0" inputMode="decimal"
          defaultValue={producto ? Number(producto.precio_costo) : 0} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-venta">Precio venta ($)</Label>
        <Input id="f-venta" name="precio_venta" type="number" step="0.01" min="0" inputMode="decimal"
          defaultValue={producto ? Number(producto.precio_venta) : 0} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-stock">{editando ? "Stock actual" : "Stock inicial"}</Label>
        <Input id="f-stock" name="stock" type="number" step="0.01" min="0" inputMode="decimal"
          defaultValue={producto ? Number(producto.stock) : 0} disabled={editando}
          aria-describedby={editando ? "f-stock-ayuda" : undefined} />
        {editando && (
          <p id="f-stock-ayuda" className="text-caption text-muted-foreground">
            Usá Entrada o Salida para que el cambio quede en el historial.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="f-minimo">Stock mínimo</Label>
        <Input id="f-minimo" name="stock_minimo" type="number" step="0.01" min="0" inputMode="decimal"
          defaultValue={producto ? Number(producto.stock_minimo) : 0} />
      </div>
    </div>
  );
}
