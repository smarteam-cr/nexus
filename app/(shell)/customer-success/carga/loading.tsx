/**
 * Esqueleto de /customer-success/carga — la carga lee un mes de reuniones y todos los cronogramas.
 *
 * FORMA REAL (page.tsx → CargaDelEquipo): cabecera · 4 cifras · tabla de utilización por semana (una fila por
 * persona) · señales y «Cómo se calcula» en dos columnas · cada cuenta frente a su complejidad.
 */
import { CardsSkeleton, PageHeaderSkeleton, Skeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CargaDelEquipoLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-48" descWidth="w-96" action />
      <CardsSkeleton count={4} columns={4} breakpoint="lg" variant="tile" minH="min-h-[96px]" />
      <SkeletonPanel minH="min-h-[360px]" header>
        <TableSkeleton columns={8} rows={7} />
      </SkeletonPanel>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SkeletonPanel minH="min-h-[240px]" header>
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" delay={i * 50} />
            ))}
          </div>
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[240px]" header>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-3 w-full" delay={i * 40} />
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </div>
  );
}
