"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna, consultarValor, enTransaccion } from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { paraBusqueda } from "@/lib/sql";
import {
  ajusteStockSchema,
  categoriaSchema,
  filaImportacionSchema,
  formDataAObjeto,
  MAX_FILAS_IMPORTACION,
  primerError,
  productoSchema,
} from "@/lib/validation";
import type { Categoria } from "@/types/database.types";

function revalidarTodo() {
  revalidatePath("/productos");
  revalidatePath("/movimientos");
  revalidatePath("/dashboard");
  revalidatePath("/configuracion");
}

// ─────────────────────────────  Productos  ─────────────────────────────

export async function crearProducto(formData: FormData) {
  await requerirSesion();

  const parsed = productoSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    // La función arma el slug, completa lo que la tienda exige y registra el
    // movimiento de carga inicial, todo en una transacción.
    await consultarValor<string>(
      `select crear_producto($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        d.nombre, d.descripcion, d.sku, d.codigo_barras, d.categoria_id,
        d.unidad_medida, d.precio_costo, d.precio_venta, d.stock, d.stock_minimo,
      ]
    );
  } catch (error) {
    return fallo(error, "productos:crear");
  }

  revalidarTodo();
  return { success: true as const };
}

export async function actualizarProducto(productoId: string, formData: FormData) {
  await requerirSesion();

  const parsed = productoSchema.safeParse(formDataAObjeto(formData));
  if (!parsed.success) return falloDeValidacion(primerError(parsed.error));
  const d = parsed.data;

  try {
    // El stock no se toca acá: solo cambia por movimientos trazables.
    await consultar(
      `update "Product" set
         name = $2, description = $3, sku = $4, barcode = $5,
         "categoryId" = coalesce($6, "categoryId"), unit = $7,
         "costPrice" = $8, price = $9, "minStock" = $10, "updatedAt" = now()
       where id = $1`,
      [
        productoId, d.nombre, d.descripcion, d.sku, d.codigo_barras,
        d.categoria_id, d.unidad_medida, d.precio_costo, d.precio_venta, d.stock_minimo,
      ]
    );
  } catch (error) {
    return fallo(error, "productos:actualizar");
  }

  revalidarTodo();
  return { success: true as const };
}

async function cambiarActivo(productoId: string, activo: boolean, contexto: string) {
  try {
    // `active = false` también lo saca de la web: la tienda solo lista activos.
    await consultar(`update "Product" set active = $2, "updatedAt" = now() where id = $1`, [
      productoId, activo,
    ]);
  } catch (error) {
    return fallo(error, contexto);
  }
  revalidarTodo();
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
      d.productoId, Math.round(d.cantidad), d.motivo, d.cantidad > 0 ? "entrada" : "salida",
    ]);
    revalidarTodo();
    return { success: true as const, stockResultante: Number(resultante ?? 0) };
  } catch (error) {
    return fallo(error, "productos:ajustarStock");
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
      categoriaId, parsed.data.nombre,
    ]);
  } catch (error) {
    return fallo(error, "categorias:actualizar");
  }

  revalidarTodo();
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
    const { creados, actualizados } = await enTransaccion(async (cx) => {
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
              existente.id, f.nombre,
              f.precio_costo ?? null, f.precio_venta ?? null, f.stock_minimo ?? null,
            ]
          );
          actualizados++;

          if (f.stock !== undefined && f.stock !== Number(existente.stock)) {
            const delta = Math.round(f.stock - Number(existente.stock));
            await cx.query(`select ajustar_stock($1, $2, $3, $4)`, [
              existente.id, delta, "Ajuste por importación", delta > 0 ? "entrada" : "salida",
            ]);
          }
        } else {
          await cx.query(
            `select crear_producto($1, null, $2, null, null, 'unidad', $3, $4, $5, $6)`,
            [
              f.nombre, f.sku ?? null,
              f.precio_costo ?? 0, f.precio_venta ?? 0, f.stock ?? 0, f.stock_minimo ?? 0,
            ]
          );
          creados++;
        }
      }

      return { creados, actualizados };
    });

    revalidarTodo();
    return { success: true as const, creados, actualizados, errores };
  } catch (error) {
    return fallo(error, "productos:importar");
  }
}
