import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin-auth";
import { consultarUna } from "@/lib/db";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { ErrorBoundary } from "@/components/error-boundary";

/**
 * Los dos avisos de la barra superior, en una sola consulta.
 *
 * La base devuelve solo los números, contra sus índices. Antes se traían todos
 * los productos en cada navegación para contarlos en memoria.
 */
async function contarAvisos(): Promise<{ stockBajo: number; pedidos: number }> {
  try {
    const fila = await consultarUna<{ stock_bajo: number; pedidos: number }>(
      `select
         (select count(*)::int from "Product"
           where active and "stockAvailable" <= "minStock")            as stock_bajo,
         (select count(*)::int from "Order" where status = 'pendiente') as pedidos`
    );
    return { stockBajo: fila?.stock_bajo ?? 0, pedidos: fila?.pedidos ?? 0 };
  } catch {
    // Si falta la migración o la base no responde, los avisos no aparecen y el
    // resto del panel sigue funcionando.
    return { stockBajo: 0, pedidos: 0 };
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminAuthed())) redirect("/login");

  const avisos = await contarAvisos();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar stockBajoCount={avisos.stockBajo} pedidosPendientes={avisos.pedidos} />
        <main className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10 lg:pt-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <MobileNav />
        <CommandPalette />
      </div>
    </div>
  );
}
