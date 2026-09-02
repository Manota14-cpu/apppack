"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckboxCampo } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  descuentoDesdePrecios,
  ICONOS,
  MAX_CARACTERISTICAS,
  UNIDADES_SUGERIDAS,
} from "@/lib/validation";
import type { Categoria, ProductoConCategoria } from "@/types/database.types";

const money = (n: number) => `$${Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

/**
 * Formulario completo de producto.
 *
 * Cubre los veintiséis campos de `Product`, no los nueve con los que se quedó
 * AppPack al retirarse el editor de la tienda. Con solo aquellos nueve no se
 * podía poner nada en oferta, ni destacar un producto en la portada, ni sacarlo
 * de ahí: los campos existían y se mostraban al cliente, pero nadie podía
 * tocarlos.
 *
 * Van en pestañas porque veintiséis campos seguidos convierten el alta rápida
 * de un producto en un trámite. Los campos de las pestañas cerradas siguen
 * montados —ocultos, no desmontados— para que el envío los lleve todos.
 */
export function CamposProducto({
  categorias,
  unidadesEnUso,
  producto,
}: {
  categorias: Categoria[];
  /** Unidades que ya usa el catálogo, para ofrecerlas como sugerencia. */
  unidadesEnUso: string[];
  producto?: ProductoConCategoria;
}) {
  const editando = !!producto;

  const [categoriaId, setCategoriaId] = useState(producto?.categoria_id ?? "");
  const sugerencias = [...new Set([...unidadesEnUso, ...UNIDADES_SUGERIDAS])];
  const [icono, setIcono] = useState(producto?.icono ?? "Package");

  // La oferta se muestra en vivo: el usuario carga el precio anterior y ve el
  // badge exacto que va a salir en la tienda, en vez de cargar dos números que
  // podrían contradecirse.
  const [precioVenta, setPrecioVenta] = useState(producto ? Number(producto.precio_venta) : 0);
  const [precioAnterior, setPrecioAnterior] = useState(
    producto?.precio_anterior ? Number(producto.precio_anterior) : 0
  );
  const oferta = descuentoDesdePrecios(precioVenta, precioAnterior || null);

  const hayComercial =
    !!producto &&
    (producto.destacado ||
      producto.mas_vendido ||
      producto.es_nuevo ||
      !!producto.precio_anterior ||
      !!producto.precio_mayorista);

  return (
    <Tabs defaultValue="datos" className="space-y-4">
      <TabsList>
        <TabsTrigger value="datos">Datos</TabsTrigger>
        <TabsTrigger value="comercial" pendiente={hayComercial}>
          Comercial
        </TabsTrigger>
        <TabsTrigger value="web">Ficha web</TabsTrigger>
      </TabsList>

      {/* ── Datos: lo mínimo para que el producto exista ── */}
      <TabsContent value="datos" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="f-nombre">Nombre *</Label>
          <Input
            id="f-nombre"
            name="nombre"
            defaultValue={producto?.nombre}
            required
            maxLength={160}
            autoFocus={!editando}
          />
          {editando && (
            <p className="text-caption text-muted-foreground">
              Cambiar el nombre cambia también la dirección del producto en la web.
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="f-descripcion">Descripción corta</Label>
          <Textarea
            id="f-descripcion"
            name="descripcion"
            rows={2}
            defaultValue={producto?.descripcion ?? ""}
            maxLength={600}
            placeholder="La línea que se lee debajo del nombre en el listado."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-sku">SKU</Label>
          <Input
            id="f-sku"
            name="sku"
            defaultValue={producto?.sku ?? ""}
            maxLength={64}
            placeholder="Código interno único"
            aria-describedby="f-sku-ayuda"
          />
          <p id="f-sku-ayuda" className="text-caption text-muted-foreground">
            Es la llave con la que la importación de Excel reconoce este producto.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-codigo">Código de barras</Label>
          <Input
            id="f-codigo"
            name="codigo_barras"
            defaultValue={producto?.codigo_barras ?? ""}
            maxLength={64}
            inputMode="numeric"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Categoría</Label>
          <Select value={categoriaId} onValueChange={setCategoriaId}>
            <SelectTrigger>
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="categoria_id" value={categoriaId} />
        </div>

<div className="space-y-1.5">
          <Label htmlFor="f-unidad">Unidad de venta</Label>
          <Input
            id="f-unidad"
            name="unidad_medida"
            list="unidades-sugeridas"
            defaultValue={producto?.unidad_medida ?? "unidad"}
            maxLength={24}
            aria-describedby="f-unidad-ayuda"
          />
          <datalist id="unidades-sugeridas">
            {sugerencias.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <p id="f-unidad-ayuda" className="text-caption text-muted-foreground">
            Cómo se vende: «x50u», «combo», «unidad». La tienda lo muestra tal cual y usa las
            formas «x50u» en adelante para el filtro de packs mayoristas.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-costo">Precio costo ($)</Label>
          <Input
            id="f-costo"
            name="precio_costo"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            defaultValue={producto ? Number(producto.precio_costo) : 0}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-venta">Precio venta ($)</Label>
          <Input
            id="f-venta"
            name="precio_venta"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            value={precioVenta}
            onChange={(e) => setPrecioVenta(Number(e.target.value) || 0)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-stock">{editando ? "Stock actual" : "Stock inicial"}</Label>
          <Input
            id="f-stock"
            name="stock"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            defaultValue={producto ? Number(producto.stock) : 0}
            disabled={editando}
            aria-describedby={editando ? "f-stock-ayuda" : undefined}
          />
          {editando && (
            <p id="f-stock-ayuda" className="text-caption text-muted-foreground">
              Usá Entrada o Salida para que el cambio quede en el historial.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-minimo">Stock mínimo</Label>
          <Input
            id="f-minimo"
            name="stock_minimo"
            type="number"
            step="1"
            min="0"
            inputMode="numeric"
            defaultValue={producto ? Number(producto.stock_minimo) : 0}
            aria-describedby="f-minimo-ayuda"
          />
          <p id="f-minimo-ayuda" className="text-caption text-muted-foreground">
            Por debajo de esto, AppPack lo marca como «por reponer».
          </p>
        </div>
      </TabsContent>

      {/* ── Comercial: lo que decide cómo se vende ── */}
      <TabsContent value="comercial" className="space-y-5">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-body font-semibold">Oferta</h3>
            {oferta.descuento ? (
              <Badge variant="success">-{oferta.descuento}% en la tienda</Badge>
            ) : (
              <span className="text-caption text-muted-foreground">Sin oferta</span>
            )}
          </div>

          <div className="mt-3 space-y-1.5">
            <Label htmlFor="f-anterior">Precio anterior ($)</Label>
            <Input
              id="f-anterior"
              name="precio_anterior"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              value={precioAnterior || ""}
              onChange={(e) => setPrecioAnterior(Number(e.target.value) || 0)}
              placeholder="Vacío = sin oferta"
              aria-describedby="f-anterior-ayuda"
            />
            <p id="f-anterior-ayuda" className="text-caption text-muted-foreground">
              {oferta.precio_anterior
                ? `La tienda muestra ${money(oferta.precio_anterior)} tachado junto a ${money(precioVenta)}.`
                : "El porcentaje del cartel se calcula solo, para que el precio tachado y el «-%» no se contradigan."}
            </p>
            {precioAnterior > 0 && !oferta.descuento && (
              <p className="text-caption text-warning">
                El precio anterior tiene que ser mayor que el de venta para que sea una oferta.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <h3 className="text-body font-semibold">Dónde aparece</h3>
          <div className="mt-3 space-y-3">
            <CheckboxCampo
              id="f-destacado"
              name="destacado"
              defaultChecked={producto?.destacado ?? false}
              etiqueta="Destacado"
              ayuda="Sale en la portada, en «Productos destacados»."
            />
            <CheckboxCampo
              id="f-masvendido"
              name="mas_vendido"
              defaultChecked={producto?.mas_vendido ?? false}
              etiqueta="Más vendido"
              ayuda="Lleva cartel y sube en el orden «Más vendidos»."
            />
            <CheckboxCampo
              id="f-esnuevo"
              name="es_nuevo"
              defaultChecked={producto?.es_nuevo ?? false}
              etiqueta="Novedad"
              ayuda="Lleva cartel «Nuevo» y encabeza el orden «Novedades»."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="f-mayqty">Cantidad mínima mayorista</Label>
            <Input
              id="f-mayqty"
              name="cantidad_mayorista_min"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              defaultValue={producto?.cantidad_mayorista_min ?? ""}
              placeholder="Vacío = sin precio mayorista"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-mayprecio">Precio mayorista ($)</Label>
            <Input
              id="f-mayprecio"
              name="precio_mayorista"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              defaultValue={producto?.precio_mayorista ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-puntuacion">Puntuación (0 a 5)</Label>
            <Input
              id="f-puntuacion"
              name="puntuacion"
              type="number"
              step="0.1"
              min="0"
              max="5"
              inputMode="decimal"
              defaultValue={producto ? Number(producto.puntuacion) : 0}
              aria-describedby="f-puntuacion-ayuda"
            />
            <p id="f-puntuacion-ayuda" className="text-caption text-muted-foreground">
              Las estrellas de la ficha. Se cargan a mano: no hay reseñas de clientes.
            </p>
          </div>
        </div>
      </TabsContent>

      {/* ── Ficha web: lo que lee el cliente y lo que lee Google ── */}
      <TabsContent value="web" className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="f-larga">Descripción larga</Label>
          <Textarea
            id="f-larga"
            name="descripcion_larga"
            rows={4}
            defaultValue={producto?.descripcion_larga ?? ""}
            maxLength={4000}
            placeholder="El texto completo de la ficha del producto."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-caract">Características</Label>
          <Textarea
            id="f-caract"
            name="caracteristicas_texto"
            rows={5}
            defaultValue={(producto?.caracteristicas ?? []).join("\n")}
            maxLength={2400}
            placeholder={"Capacidad 500cc\nPP cristal transparente\nPack x50 unidades"}
            aria-describedby="f-caract-ayuda"
          />
          <p id="f-caract-ayuda" className="text-caption text-muted-foreground">
            Una por línea. Salen como viñetas en la ficha. Hasta {MAX_CARACTERISTICAS}.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="f-peso">Peso (gramos)</Label>
            <Input
              id="f-peso"
              name="peso_gramos"
              type="number"
              step="1"
              min="0"
              inputMode="numeric"
              defaultValue={producto?.peso_gramos ?? ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-dim">Medidas</Label>
            <Input
              id="f-dim"
              name="dimensiones"
              defaultValue={producto?.dimensiones ?? ""}
              maxLength={80}
              placeholder="30x20x10 cm"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Icono</Label>
          <Select value={icono} onValueChange={setIcono}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ICONOS.map((i) => (
                <SelectItem key={i.valor} value={i.valor}>
                  {i.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="icono" value={icono} />
          <p className="text-caption text-muted-foreground">
            Es lo que la tienda dibuja mientras el producto no tenga foto.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-metatitulo">Título para Google</Label>
          <Input
            id="f-metatitulo"
            name="meta_titulo"
            defaultValue={producto?.meta_titulo ?? ""}
            maxLength={70}
            placeholder="Se usa el nombre del producto si lo dejás vacío."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-metadesc">Descripción para Google</Label>
          <Textarea
            id="f-metadesc"
            name="meta_descripcion"
            rows={2}
            defaultValue={producto?.meta_descripcion ?? ""}
            maxLength={170}
            placeholder="El resumen que aparece bajo el título en los resultados de búsqueda."
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
