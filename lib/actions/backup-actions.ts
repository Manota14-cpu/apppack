"use server";

import { requerirSesion } from "@/lib/guard";
import { consultar } from "@/lib/db";
import { fallo } from "@/lib/errors";

/** Descarga completa del catálogo y su historial, en JSON. */
export async function exportarBackup() {
  await requerirSesion();

  try {
    const [productos, categorias, movimientos] = await Promise.all([
      consultar(`select * from "Product" order by name`),
      consultar(`select * from "Category" order by name`),
      consultar(`select * from "StockMovement" order by "createdAt" desc limit 50000`),
    ]);

    return {
      success: true as const,
      data: {
        aplicacion: "apppack",
        version: 4,
        exportado: new Date().toISOString(),
        productos,
        categorias,
        movimientos,
      },
    };
  } catch (error) {
    return fallo(error, "backup:exportar");
  }
}
