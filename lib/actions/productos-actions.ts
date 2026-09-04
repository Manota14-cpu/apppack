"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import {
  consultar,
  consultarUna,
  consultarValor,
  ejecutar,
  enTransaccion,
  enTransaccionConMotivo,
} from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { paraBusqueda } from "@/lib/sql";
import { avisarATienda } from "@/lib/revalidar-tienda";
import { nuevoPrecio } from "@/lib/precios";
import {
  ajusteMasivoPreciosSchema,
  ajusteStockSchema,
  cambioMasivoSchema,
  caracteristicasDesdeTexto,
  categoriaSchema,
  costosMasivosSchema,
  descuentoDesdePrecios,
  filaImportacionSchema,
  formDataAObjeto,
  MAX_FILAS_IMPORTACION,
  primerError,
  productoSchema,
  sugerirSku,
  type DatosProducto,
} from "@/lib/validation";
import type { CambioPrecio, Categoria } from "@/types/database.types";

function revalidarTodo() {
  revalidatePath("/productos");
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  revalidatePath("/informes");
  revalidatePath("/pedidos");
  revalidatePath("/caja");
  revalidatePath("/configuracion");
}

/**
 * Convierte los datos del formulario en el jsonb que esperan `crear_producto`
 * y `actualizar_producto`.
 *
 * Acá se resuelve la oferta: el formulario pide solo el precio anterior y el
 * porcentaje del badge sale de la diferencia, para que el «-20%» y el precio
 * tachado no puedan contarle al cliente dos historias distintas.
 */
function aPayload(d: DatosProducto): string {
  const oferta = descuentoDesdePrecios(d.precio_venta, d.precio_anterior);
  return JSON.stringify({
    nombre: d.nombre,
    descripcion: d.descripcion,
    descripcion_larga: d.descripcion_larga,
    // Ya serializado: si se mandara el array, `->>` lo devolvería con
    // espacios entre elementos y cada guardado reescribiría la columna con
    // un texto distinto aunque el contenido fuera idéntico.
    caracteristicas: JSON.stringify(caracteristicasDesdeTexto(d.caracteristicas_texto)),
    sku: d.sku,
    codigo_barras: d.codigo_barras,
    categoria_id: d.categoria_id,
    unidad_medida: d.unidad_medida,
    precio_costo: d.precio_costo,
    precio_venta: d.precio_venta,
    precio_anterior: oferta.precio_anterior,
    descuento: oferta.descuento,
    stock: d.stock,
    stock_minimo: d.stock_minimo,
    peso_gramos: d.peso_gramos,
    dimensiones: d.dimensiones,
    destacado: d.destacado,
    mas_vendido: d.mas_vendido,
    es_nuevo: d.es_nuevo,
    puntuacion: d.puntuacion,
    cantidad_mayorista_min: d.cantidad_mayorista_min,
    precio_mayorista: d.precio_mayorista,
    meta_titulo: d.meta_titulo,
    meta_descripcion: d.meta_descripcion,
    icono: d.icono,
  });
}

// ─────────────────────────────  Productos  ─────────────────────────────

export async function crearProducto(formData: FormData) {
  await requerirSesion();

  const parsed = productoSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));

  try {
    // La función arma el slug, completa lo que la tienda exige y registra el
    // movimiento de carga inicial, todo en una transacción.
    await consultarValor<string>(`select crear_producto($1::jsonb)`, [aPayload(parsed.data)]);
  } catch (error) {
    return fallo(error, "productos:crear");
  }

  revalidarTodo();
  await avisarATienda();
  return { success: true as const };
}

export async function actualizarProducto(productoId: string, formData: FormData) {
  await requerirSesion();

  const parsed = productoSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));

  let slug: string | null = null;
  try {
    slug = await enTransaccionConMotivo("Edición del producto", async (cx) => {
      await cx.query(`select actualizar_producto($1, $2::jsonb)`, [
        productoId,
        aPayload(parsed.data),
      ]);
      const { rows } = await cx.query<{ slug: string }>(
        `select slug from "Product" where id = $1`,
        [productoId]
      );
      return rows[0]?.slug ?? null;
    });
  } catch (error) {
    return fallo(error, "productos:actualizar");
  }

  revalidarTodo();
  await avisarATienda(slug ? [slug] : []);
  return { success: true as const };
}

async function cambiarActivo(productoId: string, activo: boolean, contexto: string) {
  try {
    // `active = false` también lo saca de la web: la tienda solo lista activos.
    await consultar(`update "Product" set active = $2, "updatedAt" = now() where id = $1`, [
      productoId,
      activo,
    ]);
  } catch (error) {
    return fallo(error, contexto);
  }
  revalidarTodo();
  await avisarATienda();
  return { success: true as const };
}

export async function eliminarProducto(productoId: string) {
  await requerirSesion();
  return cambiarActivo(productoId, false, "productos:eliminar");
}

export async function restaurarProducto(productoId: string) {
  await requerirSesion();
  return cambiarActivo(productoId, true, "productos:restaurar");
}

// ─────────────────────────────  Stock  ─────────────────────────────

export async function ajustarStock(productoId: string, cantidad: number, motivo: string) {
  await requerirSesion();

  const parsed = ajusteStockSchema.safeParse({ productoId, cantidad, motivo });
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    const resultante = await consultarValor<number>(`select ajustar_stock($1, $2, $3, $4)`, [
      d.productoId,
      Math.round(d.cantidad),
      d.motivo,
      d.cantidad > 0 ? "entrada" : "salida",
    ]);
    revalidarTodo();
    await avisarATienda();
    return { success: true as const, stockResultante: Number(resultante ?? 0) };
  } catch (error) {
    return fallo(error, "productos:ajustarStock");
  }
}

// ────────────────────────  Historial de precios  ────────────────────────

export async function historialPrecios(productoId: string): Promise<CambioPrecio[]> {
  await requerirSesion();
  try {
    return await consultar<CambioPrecio>(
      `select id, "productId" as producto_id, "oldPrice" as precio_anterior,
              "newPrice" as precio_nuevo, "oldCostPrice" as costo_anterior,
              "newCostPrice" as costo_nuevo, reason as motivo, "createdAt" as created_at
         from "PriceChange"
        where "productId" = $1
        order by "createdAt" desc
        limit 40`,
      [productoId]
    );
  } catch (error) {
    console.error("[productos:historialPrecios]", error);
    return [];
  }
}

// ─────────────────────────  Acciones masivas  ─────────────────────────

export interface VistaPrevioPrecio {
  id: string;
  nombre: string;
  precio_venta: number;
  precio_venta_nuevo: number;
  precio_costo: number;
  precio_costo_nuevo: number;
}

type EntradaAjustePrecios = {
  ids: string[];
  porcentaje: number;
  aplicarA: "venta" | "costo" | "ambos";
  redondeo: number;
  motivo?: string;
};

/**
 * Calcula el «antes → después» sin escribir nada.
 *
 * Subir precios de a uno cada vez que llega una lista nueva es la tarea que
 * más se repite, y también la más fácil de arruinar sin querer: por eso la
 * confirmación muestra los números finales, no el porcentaje.
 */
export async function previsualizarAjustePrecios(entrada: EntradaAjustePrecios) {
  await requerirSesion();

  const parsed = ajusteMasivoPreciosSchema.safeParse(entrada);
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    const filas = await consultar<{
      id: string;
      nombre: string;
      precio_venta: number;
      precio_costo: number;
    }>(
      `select id, name as nombre, price as precio_venta, coalesce("costPrice", 0) as precio_costo
         from "Product" where id = any($1::text[]) order by name`,
      [d.ids]
    );

    const vista: VistaPrevioPrecio[] = filas.map((f) => ({
      ...f,
      precio_venta_nuevo:
        d.aplicarA === "costo" ? f.precio_venta : nuevoPrecio(f.precio_venta, d.porcentaje, d.redondeo),
      precio_costo_nuevo:
        d.aplicarA === "venta" ? f.precio_costo : nuevoPrecio(f.precio_costo, d.porcentaje, d.redondeo),
    }));

    return { success: true as const, vista };
  } catch (error) {
    return fallo(error, "productos:previsualizarPrecios");
  }
}

export async function aplicarAjustePrecios(entrada: EntradaAjustePrecios) {
  await requerirSesion();

  const parsed = ajusteMasivoPreciosSchema.safeParse(entrada);
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    const actualizados = await enTransaccionConMotivo(d.motivo, async (cx) => {
      const { rows } = await cx.query<{
        id: string;
        precio_venta: number;
        precio_costo: number;
        precio_anterior: number | null;
      }>(
        `select id, price as precio_venta, coalesce("costPrice", 0) as precio_costo,
                "oldPrice" as precio_anterior
           from "Product" where id = any($1::text[]) for update`,
        [d.ids]
      );

      let n = 0;
      for (const f of rows) {
        const venta =
          d.aplicarA === "costo" ? f.precio_venta : nuevoPrecio(f.precio_venta, d.porcentaje, d.redondeo);
        const costo =
          d.aplicarA === "venta" ? f.precio_costo : nuevoPrecio(f.precio_costo, d.porcentaje, d.redondeo);
        if (venta === f.precio_venta && costo === f.precio_costo) continue;

        // El precio tachado se remarca junto con el precio de venta. Si se
        // quedara quieto, una suba del 30% dejaría al producto "en oferta"
        // más caro que su propio precio anterior.
        const anteriorRemarcado =
          f.precio_anterior === null || venta === f.precio_venta
            ? f.precio_anterior
            : nuevoPrecio(f.precio_anterior, d.porcentaje, d.redondeo);
        const oferta = descuentoDesdePrecios(venta, anteriorRemarcado);

        await cx.query(
          `update "Product" set
             price = $2, "costPrice" = $3,
             "oldPrice" = $4, discount = $5,
             "updatedAt" = now()
           where id = $1`,
          [f.id, venta, costo, oferta.precio_anterior, oferta.descuento]
        );
        n++;
      }
      return n;
    });

    revalidarTodo();
    await avisarATienda();
    return { success: true as const, actualizados };
  } catch (error) {
    return fallo(error, "productos:aplicarPrecios");
  }
}

type EntradaCambioMasivo = {
  ids: string[];
  categoria_id?: string | null;
  destacado?: boolean | null;
  mas_vendido?: boolean | null;
  es_nuevo?: boolean | null;
  activo?: boolean | null;
};

/** Cambia en lote lo que no es precio: categoría, destacados, visibilidad. */
export async function cambiarMasivo(entrada: EntradaCambioMasivo) {
  await requerirSesion();

  const parsed = cambioMasivoSchema.safeParse(entrada);
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  // `null` significa «no tocar este campo», así que un cambio sin ningún
  // campo elegido no debería escribir un UPDATE vacío.
  const nadaQueHacer =
    d.categoria_id === null &&
    d.destacado === null &&
    d.mas_vendido === null &&
    d.es_nuevo === null &&
    d.activo === null;
  if (nadaQueHacer) return falloDeValidacion("Elegí al menos un cambio para aplicar.");

  try {
    const actualizados = await ejecutar(
      `update "Product" set
         "categoryId" = coalesce($2, "categoryId"),
         featured     = coalesce($3, featured),
         "bestSeller" = coalesce($4, "bestSeller"),
         "isNew"      = coalesce($5, "isNew"),
         active       = coalesce($6, active),
         "updatedAt"  = now()
       where id = any($1::text[])`,
      [d.ids, d.categoria_id, d.destacado, d.mas_vendido, d.es_nuevo, d.activo]
    );

    revalidarTodo();
    await avisarATienda();
    return { success: true as const, actualizados };
  } catch (error) {
    return fallo(error, "productos:cambiarMasivo");
  }
}

// ───────────────────────  Costos y SKUs faltantes  ───────────────────────

export interface ProductoSinDato {
  id: string;
  nombre: string;
  categoria: string;
  sku: string | null;
  precio_venta: number;
  precio_costo: number;
}

/**
 * Productos cuyo costo hay que atender.
 *
 * No solo los que no lo tienen: también los que tienen uno tan bajo respecto
 * del precio que no puede ser real. Un costo de relleno pasa el chequeo de
 * "está cargado" y después hace que el informe muestre 97% de margen con toda
 * confianza — miente peor que un campo vacío, porque el vacío se nota.
 */
export async function productosSinCosto(): Promise<ProductoSinDato[]> {
  await requerirSesion();
  try {
    return await consultar<ProductoSinDato>(
      `select p.id, p.name as nombre, c.name as categoria, p.sku,
              p.price as precio_venta, coalesce(p."costPrice", 0) as precio_costo
         from "Product" p join "Category" c on c.id = p."categoryId"
        where p.active
          and (coalesce(p."costPrice", 0) = 0
               or (p.price > 0 and p."costPrice" < p.price * 0.15))
        order by p.price desc, p.name
        limit 500`
    );
  } catch (error) {
    console.error("[productos:sinCosto]", error);
    return [];
  }
}

export async function guardarCostos(costos: { id: string; precio_costo: number }[]) {
  await requerirSesion();

  const parsed = costosMasivosSchema.safeParse({ costos });
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));

  // Un costo en cero es «todavía no lo sé», no un dato cargado: filtrarlos
  // evita escribir filas que no cambian nada.
  const utiles = parsed.data.costos.filter((c) => c.precio_costo > 0);
  if (utiles.length === 0) return falloDeValidacion("No cargaste ningún costo mayor a cero.");

  try {
    await enTransaccionConMotivo("Carga de costos", async (cx) => {
      for (const c of utiles) {
        await cx.query(`update "Product" set "costPrice" = $2, "updatedAt" = now() where id = $1`, [
          c.id,
          c.precio_costo,
        ]);
      }
    });
    revalidarTodo();
    return { success: true as const, guardados: utiles.length };
  } catch (error) {
    return fallo(error, "productos:guardarCostos");
  }
}

export interface SkuPropuesto {
  id: string;
  nombre: string;
  categoria: string;
  sku: string;
}

/**
 * Propone un SKU para cada producto que no tenga, sin escribir nada.
 *
 * El SKU es la llave con la que la importación de Excel reconoce un producto
 * que ya existe: sin él solo puede crear, así que subir una lista de precios
 * duplicaría el catálogo entero.
 */
export async function proponerSkus(): Promise<SkuPropuesto[]> {
  await requerirSesion();

  try {
    const [sinSku, usados] = await Promise.all([
      consultar<{ id: string; nombre: string; categoria: string }>(
        `select p.id, p.name as nombre, c.name as categoria
           from "Product" p join "Category" c on c.id = p."categoryId"
          where coalesce(p.sku, '') = ''
          order by c.name, p.name
          limit 500`
      ),
      consultar<{ sku: string }>(`select sku from "Product" where coalesce(sku, '') <> ''`),
    ]);

    const tomados = new Set(usados.map((u) => u.sku.toUpperCase()));
    const correlativo = new Map<string, number>();

    return sinSku.map((p) => {
      let sku = "";
      // Se avanza el correlativo hasta encontrar uno libre en vez de asumir
      // que el primero lo está: puede haber SKUs cargados a mano que choquen.
      do {
        const n = (correlativo.get(p.categoria) ?? 0) + 1;
        correlativo.set(p.categoria, n);
        sku = sugerirSku(p.categoria, p.nombre, n);
      } while (tomados.has(sku));
      tomados.add(sku);
      return { ...p, sku };
    });
  } catch (error) {
    console.error("[productos:proponerSkus]", error);
    return [];
  }
}

export async function aplicarSkus(pares: { id: string; sku: string }[]) {
  await requerirSesion();

  if (!Array.isArray(pares) || pares.length === 0) {
    return falloDeValidacion("No hay SKUs para aplicar.");
  }

  const limpios = pares
    .filter((p) => typeof p?.id === "string" && typeof p?.sku === "string")
    .map((p) => ({ id: p.id.slice(0, 64), sku: p.sku.trim().slice(0, 64) }))
    .filter((p) => p.id && p.sku);

  if (limpios.length === 0) return falloDeValidacion("No hay SKUs válidos para aplicar.");

  try {
    await enTransaccion(async (cx) => {
      for (const p of limpios) {
        await cx.query(`update "Product" set sku = $2, "updatedAt" = now() where id = $1`, [
          p.id,
          p.sku,
        ]);
      }
    });
    revalidarTodo();
    return { success: true as const, aplicados: limpios.length };
  } catch (error) {
    return fallo(error, "productos:aplicarSkus");
  }
}

// ─────────────────────────────  Categorías  ─────────────────────────────

export async function crearCategoria(formData: FormData) {
  await requerirSesion();

  const parsed = categoriaSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));

  try {
    const id = await consultarValor<string>(`select crear_categoria($1)`, [parsed.data.nombre]);
    const categoria = await consultarUna<Categoria>(
      `select id, name as nombre, null::text as color, now() as created_at
         from "Category" where id = $1`,
      [id]
    );
    revalidarTodo();
    return { success: true as const, categoria };
  } catch (error) {
    return fallo(error, "categorias:crear");
  }
}

export async function actualizarCategoria(categoriaId: string, formData: FormData) {
  await requerirSesion();

  const parsed = categoriaSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));

  try {
    await consultar(`update "Category" set name = $2 where id = $1`, [
      categoriaId,
      parsed.data.nombre,
    ]);
  } catch (error) {
    return fallo(error, "categorias:actualizar");
  }

  revalidarTodo();
  await avisarATienda();
  return { success: true as const };
}

export async function eliminarCategoria(categoriaId: string) {
  await requerirSesion();

  try {
    // En la tienda la categoría es obligatoria para cada producto, así que
    // no se puede vaciar: hay que mover los productos antes de borrarla.
    const enUso = await consultarValor<number>(
      `select count(*)::int from "Product" where "categoryId" = $1`,
      [categoriaId]
    );
    if ((enUso ?? 0) > 0) {
      return falloDeValidacion(
        `No se puede eliminar: hay ${enUso} ${enUso === 1 ? "producto" : "productos"} en esta categoría. Movelos a otra primero.`
      );
    }

    await consultar(`delete from "Category" where id = $1`, [categoriaId]);
  } catch (error) {
    return fallo(error, "categorias:eliminar");
  }

  revalidarTodo();
  await avisarATienda();
  return { success: true as const };
}

// ─────────────────────────────  Búsqueda  ─────────────────────────────

export interface ResultadoBusqueda {
  id: string;
  nombre: string;
  sku: string | null;
  stock: number;
  unidad_medida: string;
}

export async function buscarProductos(query: string): Promise<ResultadoBusqueda[]> {
  await requerirSesion();
  const termino = query.trim();
  if (!termino) return [];

  try {
    return await consultar<ResultadoBusqueda>(
      `select id, name as nombre, sku, "stockAvailable" as stock, unit as unidad_medida
         from "Product"
        where active and (name ilike $1 or sku ilike $1 or barcode ilike $1)
        order by name
        limit 8`,
      [paraBusqueda(termino)]
    );
  } catch (error) {
    console.error("[productos:buscar]", error);
    return [];
  }
}

/**
 * Busca un producto por su código de barras exacto, para el escáner.
 *
 * Se separa de la búsqueda general porque el escáner necesita una respuesta
 * inequívoca: o es ese producto o no hay ninguno, sin lista de candidatos.
 */
export async function buscarPorCodigo(codigo: string): Promise<ResultadoBusqueda | null> {
  await requerirSesion();
  const limpio = codigo.trim();
  if (!limpio || limpio.length > 64) return null;

  try {
    return await consultarUna<ResultadoBusqueda>(
      `select id, name as nombre, sku, "stockAvailable" as stock, unit as unidad_medida
         from "Product"
        where active and (barcode = $1 or sku = $1)
        limit 1`,
      [limpio]
    );
  } catch (error) {
    console.error("[productos:buscarPorCodigo]", error);
    return null;
  }
}

/** Guarda el código leído por el escáner en un producto que todavía no lo tenía. */
export async function asignarCodigoBarras(productoId: string, codigo: string) {
  await requerirSesion();

  const limpio = codigo.trim();
  if (!limpio || limpio.length > 64) return falloDeValidacion("El código no es válido.");

  try {
    const dueño = await consultarUna<{ id: string; nombre: string }>(
      `select id, name as nombre from "Product" where barcode = $1 and id <> $2`,
      [limpio, productoId]
    );
    if (dueño) {
      return falloDeValidacion(`Ese código ya está asignado a «${dueño.nombre}».`);
    }

    await consultar(`update "Product" set barcode = $2, "updatedAt" = now() where id = $1`, [
      productoId,
      limpio,
    ]);
  } catch (error) {
    return fallo(error, "productos:asignarCodigo");
  }

  revalidarTodo();
  return { success: true as const };
}

// ─────────────────────────────  Importación  ─────────────────────────────

export interface ResumenImportacion {
  creados: number;
  actualizados: number;
  errores: { fila: number; nombre: string; motivo: string }[];
}

/**
 * Importa un lote de productos al catálogo de la tienda.
 *
 * Corre entero dentro de una transacción: o entra todo o no entra nada. Toda
 * diferencia de stock se registra como movimiento en vez de escribirse directo.
 */
export async function importarProductos(filas: unknown[]) {
  await requerirSesion();

  if (!Array.isArray(filas) || filas.length === 0) {
    return falloDeValidacion("El archivo no tiene filas para importar.");
  }
  if (filas.length > MAX_FILAS_IMPORTACION) {
    return falloDeValidacion(
      `El archivo supera el máximo de ${MAX_FILAS_IMPORTACION.toLocaleString("es-AR")} filas.`
    );
  }

  const validas: ReturnType<typeof filaImportacionSchema.parse>[] = [];
  const errores: ResumenImportacion["errores"] = [];

  filas.forEach((cruda, i) => {
    const parsed = filaImportacionSchema.safeParse(cruda);
    if (!parsed.success) {
      const nombre = (cruda as { nombre?: unknown })?.nombre;
      errores.push({
        // +2: la fila 1 son los encabezados y las planillas cuentan desde 1.
        fila: i + 2,
        nombre: typeof nombre === "string" ? nombre : "(sin nombre)",
        motivo: primerError(parsed.error),
      });
      return;
    }
    validas.push(parsed.data);
  });

  if (validas.length === 0) {
    return { success: true as const, creados: 0, actualizados: 0, errores };
  }

  try {
    const { creados, actualizados } = await enTransaccionConMotivo(
      "Importación de lista",
      async (cx) => {
        let creados = 0;
        let actualizados = 0;

        for (const f of validas) {
          const existente = f.sku
            ? (
                await cx.query<{ id: string; stock: number }>(
                  `select id, "stockAvailable" as stock from "Product" where sku = $1`,
                  [f.sku]
                )
              ).rows[0]
            : undefined;

          if (existente) {
            await cx.query(
              `update "Product" set
                 name = $2,
                 "costPrice" = coalesce($3, "costPrice"),
                 price = coalesce($4, price),
                 "minStock" = coalesce($5, "minStock"),
                 "updatedAt" = now()
               where id = $1`,
              [
                existente.id,
                f.nombre,
                f.precio_costo ?? null,
                f.precio_venta ?? null,
                f.stock_minimo ?? null,
              ]
            );
            actualizados++;

            if (f.stock !== undefined && f.stock !== Number(existente.stock)) {
              const delta = Math.round(f.stock - Number(existente.stock));
              await cx.query(`select ajustar_stock($1, $2, $3, $4)`, [
                existente.id,
                delta,
                "Ajuste por importación",
                delta > 0 ? "entrada" : "salida",
              ]);
            }
          } else {
            await cx.query(`select crear_producto($1::jsonb)`, [
              JSON.stringify({
                nombre: f.nombre,
                sku: f.sku ?? null,
                unidad_medida: "unidad",
                precio_costo: f.precio_costo ?? 0,
                precio_venta: f.precio_venta ?? 0,
                stock: f.stock ?? 0,
                stock_minimo: f.stock_minimo ?? 0,
              }),
            ]);
            creados++;
          }
        }

        return { creados, actualizados };
      }
    );

    revalidarTodo();
    await avisarATienda();
    return { success: true as const, creados, actualizados, errores };
  } catch (error) {
    return fallo(error, "productos:importar");
  }
}
