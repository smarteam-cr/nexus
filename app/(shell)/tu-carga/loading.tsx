/**
 * Esqueleto de /tu-carga — la carga lee un mes de reuniones y todos los cronogramas.
 *
 * FORMA REAL (page.tsx → TuCarga): cabecera · 4 cifras · el gráfico de 8 semanas · tus cuentas y «¿Cuánto te tomó?»
 * a la izquierda, «Cómo se calcula» a la derecha.
 */
import { CardsSkeleton, PageHeaderSkeleton, Skeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function TuCargaLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-32" descWidth="w-96" />
      <CardsSkeleton count={4} columns={4} breakpoint="lg" variant="tile" minH="min-h-[96px]" />
      <SkeletonPanel minH="min-h-[280px]" header>
        <div className="flex h-[200px] items-end gap-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-3 flex-1" delay={i * 30} />
          ))}
        </div>
      </SkeletonPanel>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SkeletonPanel minH="min-h-[320px]" header>
          <TableSkeleton columns={6} rows={6} />
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
