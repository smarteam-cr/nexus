/**
 * Loading de /finanzas/plan-de-cobranza.
 *
 * FORMA REAL (page.tsx → PlanDeCobranzaPanel): PageHeader sin acción · «Qué hace Nexus ahora» con
 * 7 renglones de dos líneas · «Lo que falta» con 3 números en vivo y un bloque por persona (3) ·
 * «Lo que espera una decisión» con 4 renglones.
 */
import { CardsSkeleton, PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function PlanDeCobranzaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-44" descWidth="w-[28rem] max-w-full" />

      <div className="max-w-3xl space-y-8">
        {/* Qué hace Nexus ahora: 7 renglones */}
        <div className="space-y-3">
          <Skeleton className="h-3.5 w-44" />
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonPanel key={i} minH="min-h-[64px]" bodyClassName="px-4 py-3 space-y-1.5">
                <Skeleton className="h-3.5 w-56 max-w-full" delay={i * 40} />
                <Skeleton className="h-3 w-full" delay={i * 40 + 20} />
              </SkeletonPanel>
            ))}
          </div>
        </div>

        {/* Lo que falta: 3 números en vivo + un bloque por persona */}
        <div className="space-y-3">
          <Skeleton className="h-3.5 w-52" />
          <CardsSkeleton count={3} columns={3} breakpoint="md" variant="tile" minH="min-h-[88px]" className="gap-2" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-1.5 pt-1">
              <Skeleton className="h-3.5 w-28" delay={i * 60} />
              <Skeleton className="h-3 w-full" delay={i * 60 + 20} />
              <Skeleton className="h-3 w-3/4" delay={i * 60 + 40} />
            </div>
          ))}
        </div>

        {/* Lo que espera una decisión: 4 renglones */}
        <div className="space-y-3">
          <Skeleton className="h-3.5 w-48" />
          <SkeletonPanel minH="min-h-[200px]" bodyClassName="p-0">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <Skeleton className="h-5 w-12 flex-shrink-0" rounded="full" delay={i * 40} />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-full" delay={i * 40 + 20} />
                  <Skeleton className="h-2.5 w-48" delay={i * 40 + 40} />
                </div>
              </div>
            ))}
          </SkeletonPanel>
        </div>
      </div>
    </div>
  );
}
