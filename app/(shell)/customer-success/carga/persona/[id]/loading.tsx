/**
 * Esqueleto de la 1:1 — FORMA REAL (page.tsx → UnoAUno): migas y cabecera · barras de horas por semana · sus
 * cuentas (tabla) y el simulador, en dos columnas.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonChart, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function UnoAUnoLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-64" descWidth="w-0" action />
      <SkeletonPanel minH="min-h-[300px]" header>
        <SkeletonChart bars={8} />
      </SkeletonPanel>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SkeletonPanel minH="min-h-[320px]" header>
          <TableSkeleton columns={8} rows={7} />
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[200px]" header>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-3 w-full" delay={i * 50} />
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </div>
  );
}
