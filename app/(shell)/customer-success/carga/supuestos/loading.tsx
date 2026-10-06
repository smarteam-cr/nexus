/**
 * Esqueleto de «Cómo se calcula la carga» — FORMA REAL (page.tsx → Supuestos): cabecera con el botón de guardar ·
 * bloques de supuestos a la izquierda · «Con estos valores» a la derecha (360 px).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function SupuestosLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-64" descWidth="w-96" action />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <SkeletonPanel key={i} minH="min-h-[180px]" header>
              <div className="space-y-3">
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-4 w-full" delay={(i * 3 + j) * 40} />
                ))}
              </div>
            </SkeletonPanel>
          ))}
        </div>
        <SkeletonPanel minH="min-h-[360px]" header>
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-3 w-full" delay={i * 40} />
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </div>
  );
}
