import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { cajaAbiertaParaGasto, listarGastos } from "@/lib/actions/gastos-actions";
import { GastosClient } from "./gastos-client";
import GastosLoading from "./loading";

interface Params {
  q?: string;
  categoria?: string;
  dias?: string;
}

/**
 * Los gastos del negocio.
 *
 * Hasta acá la app sabía cuánto entraba y cuánto costaba la mercadería, pero
 * no lo que se paga para tener la persiana levantada: el flete, la luz, el
 * alquiler. Sin eso, «ganancia» era un número que siempre sobraba.
 */
async function getGastos(params: Params) {
  await requerirSesion();

  const dias = Number(params.dias ?? 90);
  const [gastos, caja] = await Promise.all([
    listarGastos({
      q: params.q,
      categoria: params.categoria,
      dias: Number.isFinite(dias) ? dias : 90,
    }),
    cajaAbiertaParaGasto(),
  ]);

  return {
    gastos,
    caja,
    filtros: {
      q: params.q ?? "",
      categoria: params.categoria ?? "todas",
      dias: String(Number.isFinite(dias) ? dias : 90),
    },
  };
}

export default async function GastosPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <Suspense key={JSON.stringify(params)} fallback={<GastosLoading />}>
      <GastosData params={params} />
    </Suspense>
  );
}

async function GastosData({ params }: { params: Params }) {
  const data = await getGastos(params);
  return <GastosClient {...data} />;
}
