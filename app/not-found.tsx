import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground text-lg font-bold">?</div>
      <h1 className="text-display">Página no encontrada</h1>
      <p className="max-w-sm text-body text-muted-foreground">La página que buscás no existe o fue movida.</p>
      <Link href="/dashboard" className="mt-2 rounded-xl bg-foreground px-6 py-2.5 text-caption font-semibold text-background transition-opacity hover:opacity-90">
        Volver al inicio
      </Link>
    </div>
  );
}