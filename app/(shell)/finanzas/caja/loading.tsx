/**
 * Loading skeleton de /finanzas/caja.
 *
 * FORMA REAL (page.tsx → DondeEstaLaPlata): PageHeader con acción · una línea de la revisión del día · 4 cifras en
 * `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` · el panel de cuentas (filas de nombre, saldo y fecha) · el panel de los
 * pagos de la semana (filas de fecha, concepto y monto) · y la tabla de quincenas de 5 columnas.
 */
import { CardsSkeleton, PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function Filas({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line px-4 py-2.5 last:border-0">
          <Skeleton className="h-3 w-14" delay={r * 40} />
          <Skeleton className="h-3.5 flex-1" delay={r * 40 + 20} />
          <Skeleton className="h-3.5 w-24" delay={r * 40 + 40} />
        </div>
      ))}
    </>
  );
}

export default function CajaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton titleWidth="w-48" descWidth="w-[28rem] max-w-full" />
        <Skeleton className="h-3 w-80 max-w-full" />
        <CardsSkeleton count={4} columns={4} breakpoint="lg" variant="tile" minH="min-h-[96px]" className="gap-3" />
        <SkeletonPanel minH="min-h-[160px]" bodyClassName="p-0" header={<Skeleton className="h-3.5 w-28" />}>
          <Filas n={3} />
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[200px]" bodyClassName="p-0" header={<Skeleton className="h-3.5 w-56" />}>
          <Filas n={4} />
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[220px]" bodyClassName="p-0" header={<Skeleton className="h-3.5 w-64" />}>
          <Filas n={5} />
        </SkeletonPanel>
      </div>
    </div>
  );
}
