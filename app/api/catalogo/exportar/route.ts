import { NextResponse } from "next/server";
import { isAdminAuthed } from "@/lib/admin-auth";
import { consultar } from "@/lib/db";

interface FilaExport {
  nombre: string;
  sku: string | null;
  categoria: string;
  unidad_medida: string;
  precio_costo: number;
  precio_venta: number;
  stock: number;
  stock_minimo: number;
}

/** Catálogo completo para exportar a Excel. */
export async function GET() {
  if (!(await isAdminAuthed())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const productos = await consultar<FilaExport>(
      `select p.name as nombre, p.sku, c.name as categoria, p.unit as unidad_medida,
              coalesce(p."costPrice", 0) as precio_costo, p.price as precio_venta,
              p."stockAvailable" as stock, p."minStock" as stock_minimo
         from "Product" p
         join "Category" c on c.id = p."categoryId"
        where p.active
        order by p.name
        limit 20000`
    );
    return NextResponse.json({ productos });
  } catch (error) {
    console.error("[api:catalogo:exportar]", error);
    return NextResponse.json({ error: "No se pudo obtener el catálogo" }, { status: 500 });
  }
}
