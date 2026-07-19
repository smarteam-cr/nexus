/**
 * Loading skeleton de /sales (Análisis de ventas).
 *
 * FORMA REAL (page.tsx → SalesClient, contenedor `p-6 space-y-5`): header con
 * contador a la derecha · barra de búsqueda + 3 filtros por vendedor · lista
 * (`space-y-6`) de tarjetas de prospecto (rounded-2xl p-5: nombre + dominio,
 * chips de rep, 3 líneas de sesiones, botón de analizar).
 * NO hay tabla: el TableSkeleton anterior prometía una pantalla inexistente.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";

export default function SalesLoading() {
  // El contenedor lo escribe SalesClient a mano (`p-6 space-y-5`) — no es
  // ninguno de los SHELL_* de lib/ui/page-shell.ts; se iguala el valor.
  return (
    <div className="p-6 space-y-5">
      <PageHeaderSkeleton titleWidth="w-52" descWidth="w-64" action className="mb-0" />

      {/* Búsqueda + filtros por vendedor */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Skeleton className="h-10 flex-1" rounded="xl" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-9 w-20" rounded="xl" />
          <Skeleton className="h-9 w-24" rounded="xl" />
          <Skeleton className="h-9 w-24" rounded="xl" />
        </div>
      </div>

      {/* Tarjetas de prospecto */}
      <div className="space-y-6">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonPanel
            key={i}
            minH="min-h-[168px]"
            className="rounded-2xl"
            bodyClassName="p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-40" delay={i * 60} />
              <Skeleton className="h-2.5 w-28" delay={i * 60 + 30} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Skeleton className="h-4 w-20" rounded="full" delay={i * 60 + 60} />
              <Skeleton className="h-4 w-24" rounded="full" delay={i * 60 + 90} />
              <Skeleton className="h-2.5 w-56" delay={i * 60 + 120} />
            </div>
            {/* Preview de sesiones (hasta 3) */}
            <div className="space-y-1.5 pt-1">
              <Skeleton className="h-2.5 w-3/4" delay={i * 60 + 150} />
              <Skeleton className="h-2.5 w-2/3" delay={i * 60 + 180} />
              <Skeleton className="h-2.5 w-1/2" delay={i * 60 + 210} />
            </div>
          </SkeletonPanel>
        ))}
      </div>
    </div>
  );
}
