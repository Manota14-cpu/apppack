import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { consultar } from "@/lib/db";
import { historialRecuentos, recuentoAbierto } from "@/lib/actions/recuentos-actions";
import { RecuentosClient } from "./recuentos-client";
import RecuentosLoading from "./loading";
import type { Categoria } from "@/types/database.types";

/**
 * Recuentos físicos de inventario.
 *
 * Antes no había forma ordenada de contar el depósito: se ajustaba producto
 * por producto sin saber cuál ya se había contado, y cada corrección quedaba
 * como un movimiento suelto sin nada que las relacionara.
 */
async function getRecuentos() {
  await requerirSesion();

  const [abierto, historial, categorias] = await Promise.all([
    recuentoAbierto(),
    historialRecuentos(),
    consultar<Categoria>(
      `select id, name as nombre, null::text as color, null::timestamptz as created_at
         from "Category" order by name`
    ),
  ]);

  return { abierto, historial, categorias };
}

export default function RecuentosPage() {
  return (
    <Suspense fallback={<RecuentosLoading />}>
      <RecuentosData />
    </Suspense>
  );
}

async function RecuentosData() {
  const data = await getRecuentos();
  return <RecuentosClient {...data} />;
}
