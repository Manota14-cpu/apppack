"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  FolderCog,
  Image as ImageIcon,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  ScanLine,
  Search,
  Star,
  Tag,
  TrendingUp,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PaginationLinks } from "@/components/ui/pagination";
import { toast } from "sonner";
import { useDebounce } from "@/lib/use-debounce";
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
import { CamposProducto } from "./campos-producto";
import {
  AvisoDatosFaltantes,
  BarraSeleccion,
  CasillaFila,
  EtiquetasMasivasDialog,
  PreciosMasivosDialog,
} from "./acciones-masivas";
import { CostosDialog, SkusDialog } from "./dialogos-datos";
import { ImagenesDialog } from "./imagenes-dialog";
import { HistorialPreciosDialog } from "./historial-precios-dialog";
import { EscanerDialog } from "./escaner-dialog";
import { descargarCatalogo } from "@/lib/excel-cliente";

const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
const cant = (n: number) => Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });

function nivelStock(p: ProductoConCategoria): { variante: "default" | "warning" | "destructive"; texto: string } {
  const stock = Number(p.stock);
  if (stock === 0) return { variante: "destructive", texto: "Sin stock" };
  if (stock <= Number(p.stock_minimo)) return { variante: "warning", texto: "Stock bajo" };
  return { variante: "default", texto: "En stock" };
}

/** Carteles comerciales que la tienda muestra, para verlos de un vistazo. */
function Carteles({ p }: { p: ProductoConCategoria }) {
  const marcas: { texto: string; icono: typeof Star }[] = [];
  if (p.descuento) marcas.push({ texto: `-${p.descuento}%`, icono: Tag });
  if (p.destacado) marcas.push({ texto: "Portada", icono: Star });
  if (p.mas_vendido) marcas.push({ texto: "Más vendido", icono: TrendingUp });
  if (marcas.length === 0) return null;

  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {marcas.map((m) => (
        <Badge key={m.texto} variant="outline">
          <m.icono className="h-2.5 w-2.5" aria-hidden="true" />
          {m.texto}
        </Badge>
      ))}
      {p.es_nuevo && <Badge variant="outline">Nuevo</Badge>}
    </span>
  );
}

interface Props {
  productos: ProductoConCategoria[];
  categorias: Categoria[];
  total: number;
  pagina: number;
  pageSize: number;
  unidadesEnUso: string[];
  sinSku: number;
  sinCosto: number;
  filtros: { q: string; categoria: string; stock: string; estado: string };
}

export function ProductosClient({
  productos,
  categorias,
  total,
  pagina,
  pageSize,
  unidadesEnUso,
  sinSku,
  sinCosto,
  filtros,
}: Props) {
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

  // ── Selección múltiple ─────────────────────────────────────────────
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  // Lo seleccionado se cruza con lo que está a la vista en vez de vaciarse al
  // cambiar de página. Así una acción masiva no puede alcanzar productos que
  // el usuario ya no tiene delante, y no hace falta un efecto que limpie.
  const idsSeleccionados = useMemo(
    () => productos.filter((p) => seleccion.has(p.id)).map((p) => p.id),
    [productos, seleccion]
  );

  function alternar(id: string, marcado: boolean) {
    setSeleccion((prev) => {
      const siguiente = new Set(prev);
      if (marcado) siguiente.add(id);
      else siguiente.delete(id);
      return siguiente;
    });
  }

  const todosMarcados = productos.length > 0 && productos.every((p) => seleccion.has(p.id));

  // ── Diálogos ───────────────────────────────────────────────────────
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [editando, setEditando] = useState<ProductoConCategoria | null>(null);
  const [ajustando, setAjustando] = useState<{ producto: ProductoConCategoria; signo: 1 | -1 } | null>(null);
  const [aEliminar, setAEliminar] = useState<ProductoConCategoria | null>(null);
  const [categoriasAbierto, setCategoriasAbierto] = useState(false);
  const [importarAbierto, setImportarAbierto] = useState(false);
  const [preciosAbierto, setPreciosAbierto] = useState(false);
  const [etiquetasAbierto, setEtiquetasAbierto] = useState(false);
  const [costosAbierto, setCostosAbierto] = useState(false);
  const [skusAbierto, setSkusAbierto] = useState(false);
  const [escanerAbierto, setEscanerAbierto] = useState(false);
  const [verImagenesDe, setVerImagenesDe] = useState<ProductoConCategoria | null>(null);
  const [verHistorialDe, setVerHistorialDe] = useState<ProductoConCategoria | null>(null);
  const [enviando, setEnviando] = useState(false);

  const viendoEliminados = filtros.estado === "eliminados";

  const refrescar = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  function trasAccionMasiva() {
    setSeleccion(new Set());
    refrescar();
  }

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
      toast.success(`${ajustando.signo === 1 ? "Entrada" : "Salida"} registrada`, {
        description: `${ajustando.producto.nombre} — stock ahora: ${cant(r.stockResultante)}`,
      });
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
          <Button variant="outline" size="sm" onClick={() => setEscanerAbierto(true)}>
            <ScanLine className="h-4 w-4" />
            <span className="hidden sm:inline">Escanear</span>
          </Button>
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

      {!viendoEliminados && (
        <AvisoDatosFaltantes
          sinSku={sinSku}
          sinCosto={sinCosto}
          onSkus={() => setSkusAbierto(true)}
          onCostos={() => setCostosAbierto(true)}
        />
      )}

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
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      {!viendoEliminados && (
                        <span className="pt-1">
                          <CasillaFila
                            marcada={seleccion.has(p.id)}
                            onCambio={(m) => alternar(p.id, m)}
                            nombre={p.nombre}
                          />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">{p.nombre}</p>
                        <p className="text-caption text-muted-foreground mt-0.5">
                          {p.sku ?? "Sin SKU"} · {p.categorias?.nombre ?? "Sin categoría"}
                          {p.imagenes === 0 && " · sin foto"}
                        </p>
                        <Carteles p={p} />
                      </div>
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
                    <div className="text-right">
                      {p.precio_anterior && (
                        <p className="font-mono-num text-caption text-muted-foreground line-through">
                          {money(p.precio_anterior)}
                        </p>
                      )}
                      <p className="font-mono-num text-body-lg font-semibold">{money(p.precio_venta)}</p>
                    </div>
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
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" className="flex-1" onClick={() => setEditando(p)}>
                          <Pencil className="h-3.5 w-3.5" />Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setVerImagenesDe(p)}>
                          <ImageIcon className="h-3.5 w-3.5" />Fotos
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setVerHistorialDe(p)}>
                          <TrendingUp className="h-3.5 w-3.5" />Precios
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setAEliminar(p)}>
                          <Trash2 className="h-3.5 w-3.5" />
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
                    {!viendoEliminados && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={todosMarcados}
                          onChange={(e) =>
                            setSeleccion(e.target.checked ? new Set(productos.map((p) => p.id)) : new Set())
                          }
                          aria-label="Seleccionar todos los productos de esta página"
                        />
                      </TableHead>
                    )}
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
                        {!viendoEliminados && (
                          <TableCell>
                            <CasillaFila
                              marcada={seleccion.has(p.id)}
                              onCambio={(m) => alternar(p.id, m)}
                              nombre={p.nombre}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <span className="font-medium">{p.nombre}</span>
                          {p.descripcion && <p className="text-caption text-muted-foreground mt-0.5 line-clamp-1">{p.descripcion}</p>}
                          <Carteles p={p} />
                        </TableCell>
                        <TableCell><span className="text-caption text-muted-foreground">{p.sku ?? "—"}</span></TableCell>
                        <TableCell>{p.categorias?.nombre ?? <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right font-mono-num">
                          {p.precio_anterior && (
                            <span className="mr-1.5 text-caption text-muted-foreground line-through">
                              {money(p.precio_anterior)}
                            </span>
                          )}
                          {money(p.precio_venta)}
                        </TableCell>
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
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Fotos de ${p.nombre}${p.imagenes === 0 ? " (sin fotos)" : ""}`}
                                className={p.imagenes === 0 ? "text-warning hover:text-warning" : ""}
                                onClick={() => setVerImagenesDe(p)}
                              >
                                <ImageIcon className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" aria-label={`Historial de precios de ${p.nombre}`} onClick={() => setVerHistorialDe(p)}>
                                <TrendingUp className="h-3.5 w-3.5" />
                              </Button>
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

      <BarraSeleccion
        cantidad={idsSeleccionados.length}
        onLimpiar={() => setSeleccion(new Set())}
        onPrecios={() => setPreciosAbierto(true)}
        onEtiquetas={() => setEtiquetasAbierto(true)}
      />

      {/* ── Diálogo: crear ── */}
      <Dialog open={crearAbierto} onOpenChange={setCrearAbierto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
            <DialogDescription>El stock inicial queda registrado como movimiento de carga.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCrear} className="space-y-4">
            <CamposProducto categorias={categorias} unidadesEnUso={unidadesEnUso} />
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
              {/* La clave fuerza un formulario nuevo por producto: sin ella,
                  React reusaría los campos y mostraría los valores del anterior. */}
              <CamposProducto
                key={editando.id}
                categorias={categorias}
                unidadesEnUso={unidadesEnUso}
                producto={editando}
              />
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

      <PreciosMasivosDialog
        open={preciosAbierto}
        onOpenChange={setPreciosAbierto}
        ids={idsSeleccionados}
        onListo={trasAccionMasiva}
      />
      <EtiquetasMasivasDialog
        open={etiquetasAbierto}
        onOpenChange={setEtiquetasAbierto}
        ids={idsSeleccionados}
        categorias={categorias}
        onListo={trasAccionMasiva}
      />
      {/* Estos cinco se montan al abrirse en vez de vivir siempre en el árbol:
          cada uno consulta la base al aparecer, y montarlos recién ahí evita
          tener que acordarse de limpiar su estado del producto anterior. */}
      {costosAbierto && (
        <CostosDialog open onOpenChange={setCostosAbierto} onListo={refrescar} />
      )}
      {skusAbierto && <SkusDialog open onOpenChange={setSkusAbierto} onListo={refrescar} />}
      {escanerAbierto && (
        <EscanerDialog open onOpenChange={setEscanerAbierto} onListo={refrescar} />
      )}
      {verImagenesDe && (
        <ImagenesDialog
          key={verImagenesDe.id}
          producto={verImagenesDe}
          onOpenChange={(o) => !o && setVerImagenesDe(null)}
          onListo={refrescar}
        />
      )}
      {verHistorialDe && (
        <HistorialPreciosDialog
          key={verHistorialDe.id}
          producto={verHistorialDe}
          onOpenChange={(o) => !o && setVerHistorialDe(null)}
        />
      )}
    </div>
  );
}
