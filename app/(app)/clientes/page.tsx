import { Suspense } from "react";
import { requerirSesion } from "@/lib/guard";
import { listarClientes } from "@/lib/actions/clientes-actions";
import { ClientesClient } from "./clientes-client";
import ClientesLoading from "./loading";

interface Params {
  q?: string;
  estado?: string;
}

/**
 * La agenda de clientes.
 *
 * No es una libreta suelta: cada cliente se enlaza con sus ventas, así que la
 * ficha responde «cuánto me compró» y «hace cuánto que no viene» — que con el
 * nombre escrito a mano en cada pedido no se podía saber.
 */
async function getClientes(params: Params) {
  await requerirSesion();
  const clientes = await listarClientes(params);
  return {
    clientes,
    filtros: { q: params.q ?? "", estado: params.estado ?? "activos" },
  };
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  return (
    <Suspense key={JSON.stringify(params)} fallback={<ClientesLoading />}>
      <ClientesData params={params} />
    </Suspense>
  );
}

async function ClientesData({ params }: { params: Params }) {
  const data = await getClientes(params);
  return <ClientesClient {...data} />;
}
