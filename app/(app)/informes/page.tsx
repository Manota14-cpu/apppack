import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { obtenerInforme } from "@/lib/actions/informes-actions";
import { InformesClient } from "./informes-client";
import InformesLoading from "./loading";

interface Params {
  dias?: string;
}

/**
 * Los números del negocio.
 *
 * El panel muestra cómo está el stock hoy; esto muestra qué pasó. Recién ahora
 * se puede calcular el margen: hasta que los costos estuvieron cargados,
 * cualquier porcentaje habría salido de una división por cero disfrazada.
 */
async function getInforme(params: Params) {
  await requerirSesion();
  const dias = Number(params.dias);
  return obtenerInforme(Number.isFinite(dias) ? dias : 30);
}

export default async function InformesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <Suspense key={JSON.stringify(params)} fallback={<InformesLoading />}>
      <InformesData params={params} />
    </Suspense>
  );
}

async function InformesData({ params }: { params: Params }) {
  const informe = await getInforme(params);
  return <InformesClient informe={informe} />;
}
