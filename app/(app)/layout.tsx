import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin-auth";
import { consultarValor } from "@/lib/db";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { ErrorBoundary } from "@/components/error-boundary";

/**
 * Cantidad de productos por reponer, para el aviso de la barra superior.
 *
 * La base devuelve solo el número, contra un índice parcial. Antes se traían
 * todos los productos en cada navegación para contarlos en memoria.
 */
async function contarStockBajo(): Promise<number> {
  try {
    const n = await consultarValor<number>(
      `select count(*)::int from "Product" where active and "stockAvailable" <= "minStock"`
    );
    return n ?? 0;
  } catch {
    // Si falta la migración o la base no responde, el aviso simplemente no aparece.
    return 0;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminAuthed())) redirect("/login");

  const stockBajo = await contarStockBajo();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar stockBajoCount={stockBajo} />
        <main className="flex-1 px-4 pb-24 pt-6 lg:px-8 lg:pb-10 lg:pt-8">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <MobileNav />
        <CommandPalette />
      </div>
    </div>
  );
}
