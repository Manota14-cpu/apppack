import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { cajaAbierta, historialCajas } from "@/lib/actions/caja-actions";
import { CajaClient } from "./caja-client";
import CajaLoading from "./loading";

/**
 * La caja de mostrador.
 *
 * Hasta acá, una venta que no entraba por la tienda solo se podía cargar como
 * «salida de stock»: movía el número pero no decía a cuánto se vendió ni a
 * quién, así que esa plata no figuraba en ningún informe. Ahora una venta de
 * mostrador es una venta como cualquier otra, con su precio y su medio de pago.
 */
async function getCaja() {
  await requerirSesion();
  const [abierta, historial] = await Promise.all([cajaAbierta(), historialCajas()]);
  return { abierta, historial };
}

export default function CajaPage() {
  return (
    <Suspense fallback={<CajaLoading />}>
      <CajaData />
    </Suspense>
  );
}

async function CajaData() {
  const data = await getCaja();
  return <CajaClient {...data} />;
}
