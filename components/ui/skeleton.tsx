import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-skeleton rounded-lg bg-white/[0.06]", className)} {...props} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="mx-auto max-w-6xl space-y-8" aria-busy="true" aria-label="Cargando panel">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-11 w-80 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-[372px] rounded-2xl lg:col-span-2" />
        <Skeleton className="h-[372px] rounded-2xl" />
      </div>
    </div>
  );
}

export function SkeletonTabla({ filas = 8 }: { filas?: number }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-12 w-full max-w-sm rounded-xl" />
        <Skeleton className="h-11 w-[170px] rounded-xl" />
        <Skeleton className="h-11 w-[160px] rounded-xl" />
      </div>
      <div className="space-y-2 rounded-xl border border-border p-4">
        {Array.from({ length: filas }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
