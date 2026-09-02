"use server";

import { revalidatePath } from "next/cache";
import { requerirSesion } from "@/lib/guard";
import { consultar, consultarUna, consultarValor, ejecutar } from "@/lib/db";
import { fallo, falloDeValidacion } from "@/lib/errors";
import { avisarATienda } from "@/lib/revalidar-tienda";
import { imagenSchema, MAX_IMAGENES } from "@/lib/validation";
import type { ImagenProducto } from "@/types/database.types";

/** Formatos que la tienda sabe mostrar y que pesan poco. */
const TIPOS_ACEPTADOS = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
/** Tope por archivo (5 MB): una foto de celular entra de sobra. */
const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

export async function imagenesDe(productoId: string): Promise<ImagenProducto[]> {
  await requerirSesion();
  try {
    return await consultar<ImagenProducto>(
      `select id, url, alt, "sortOrder" as orden
         from "ProductImage" where "productId" = $1
        order by "sortOrder", id`,
      [productoId.slice(0, 64)]
    );
  } catch (error) {
    console.error("[imagenes:listar]", error);
    return [];
  }
}

async function siguienteOrden(productoId: string): Promise<number> {
  const n = await consultarValor<number>(
    `select coalesce(max("sortOrder"), -1) + 1 from "ProductImage" where "productId" = $1`,
    [productoId]
  );
  return Number(n ?? 0);
}

async function hayLugar(productoId: string): Promise<boolean> {
  const n = await consultarValor<number>(
    `select count(*)::int from "ProductImage" where "productId" = $1`,
    [productoId]
  );
  return Number(n ?? 0) < MAX_IMAGENES;
}

/** Agrega una imagen que ya vive en otro lado, pegando su dirección. */
export async function agregarImagenPorUrl(productoId: string, url: string, alt: string) {
  await requerirSesion();

  const parsed = imagenSchema.safeParse({ productoId, url, alt });
  if (!parsed.success) {
    return falloDeValidacion(parsed.error.issues[0]?.message ?? "La imagen no es válida.");
  }
  const d = parsed.data;

  try {
    if (!(await hayLugar(d.productoId))) {
      return falloDeValidacion(`Un producto no puede tener más de ${MAX_IMAGENES} imágenes.`);
    }

    await ejecutar(
      `insert into "ProductImage" (id, url, alt, "sortOrder", "productId")
       values ((gen_random_uuid())::text, $1, $2, $3, $4)`,
      [d.url, d.alt, await siguienteOrden(d.productoId), d.productoId]
    );
  } catch (error) {
    return fallo(error, "imagenes:agregarUrl");
  }

  revalidatePath("/productos");
  await avisarATienda();
  return { success: true as const };
}

/** Está configurado el almacenamiento para subir fotos desde el celular. */
export async function puedeSubirArchivos(): Promise<boolean> {
  await requerirSesion();
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Sube una foto desde el dispositivo.
 *
 * Necesita un almacén de Blob de Vercel; si no está configurado no se rompe
 * nada: el diálogo sigue aceptando direcciones pegadas a mano, que es el
 * camino que funciona sin infraestructura adicional.
 */
export async function subirImagen(productoId: string, formData: FormData) {
  await requerirSesion();

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return falloDeValidacion(
      "Todavía no hay almacenamiento de fotos configurado. Por ahora podés pegar la dirección de una imagen."
    );
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return falloDeValidacion("Elegí una foto para subir.");
  }
  if (!(TIPOS_ACEPTADOS as readonly string[]).includes(archivo.type)) {
    return falloDeValidacion("El archivo tiene que ser una imagen JPG, PNG, WebP o AVIF.");
  }
  if (archivo.size > MAX_BYTES_IMAGEN) {
    return falloDeValidacion("La foto supera los 5 MB. Sacala con menos resolución o comprimila.");
  }

  const id = productoId.slice(0, 64);

  try {
    if (!(await hayLugar(id))) {
      return falloDeValidacion(`Un producto no puede tener más de ${MAX_IMAGENES} imágenes.`);
    }

    const producto = await consultarUna<{ slug: string; nombre: string }>(
      `select slug, name as nombre from "Product" where id = $1`,
      [id]
    );
    if (!producto) return falloDeValidacion("El producto no existe.");

    const { put } = await import("@vercel/blob");
    const extension = archivo.type.split("/")[1] ?? "jpg";
    const { url } = await put(`productos/${producto.slug}.${extension}`, archivo, {
      access: "public",
      token,
      // Dos fotos del mismo producto no deben pisarse entre sí.
      addRandomSuffix: true,
      contentType: archivo.type,
    });

    await ejecutar(
      `insert into "ProductImage" (id, url, alt, "sortOrder", "productId")
       values ((gen_random_uuid())::text, $1, $2, $3, $4)`,
      [url, producto.nombre, await siguienteOrden(id), id]
    );
  } catch (error) {
    return fallo(error, "imagenes:subir");
  }

  revalidatePath("/productos");
  await avisarATienda();
  return { success: true as const };
}

export async function eliminarImagen(imagenId: string) {
  await requerirSesion();

  try {
    // La foto se borra del catálogo pero no del almacén: si alguien pegó la
    // misma dirección en otro producto, borrarla dejaría un hueco allá.
    await ejecutar(`delete from "ProductImage" where id = $1`, [imagenId.slice(0, 64)]);
  } catch (error) {
    return fallo(error, "imagenes:eliminar");
  }

  revalidatePath("/productos");
  await avisarATienda();
  return { success: true as const };
}

/** Mueve una imagen en el orden: la primera es la que se ve en el listado. */
export async function moverImagen(imagenId: string, direccion: "arriba" | "abajo") {
  await requerirSesion();

  try {
    const actual = await consultarUna<{ producto_id: string; orden: number }>(
      `select "productId" as producto_id, "sortOrder" as orden
         from "ProductImage" where id = $1`,
      [imagenId.slice(0, 64)]
    );
    if (!actual) return falloDeValidacion("La imagen ya no existe.");

    const vecina = await consultarUna<{ id: string; orden: number }>(
      direccion === "arriba"
        ? `select id, "sortOrder" as orden from "ProductImage"
            where "productId" = $1 and "sortOrder" < $2
            order by "sortOrder" desc limit 1`
        : `select id, "sortOrder" as orden from "ProductImage"
            where "productId" = $1 and "sortOrder" > $2
            order by "sortOrder" asc limit 1`,
      [actual.producto_id, actual.orden]
    );
    // Ya está en la punta: no es un error, simplemente no hay a dónde moverla.
    if (!vecina) return { success: true as const };

    await ejecutar(`update "ProductImage" set "sortOrder" = $2 where id = $1`, [
      imagenId.slice(0, 64),
      vecina.orden,
    ]);
    await ejecutar(`update "ProductImage" set "sortOrder" = $2 where id = $1`, [
      vecina.id,
      actual.orden,
    ]);
  } catch (error) {
    return fallo(error, "imagenes:mover");
  }

  revalidatePath("/productos");
  await avisarATienda();
  return { success: true as const };
}
