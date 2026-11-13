/**
 * Loading skeleton de /finanzas/goals («Metas y bonos»).
 *
 * FORMA REAL (page.tsx → MetasDeGerencia): PageHeader con el botón «Nueva meta» · una línea con la comisión de HubSpot
 * de hoy · y una tarjeta por meta: nombre y premio con «Editar», el avance contra el objetivo, la barra, la línea de
 * lo que falta y el corte, y el bloque «Cómo se mide». Hoy son tres metas.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

const METAS = 3;

export default function MetasYBonosLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-96 max-w-full" />
      <div className="space-y-4">
        <Skeleton className="h-3 w-80 max-w-full" />
        {Array.from({ length: METAS }).map((_, i) => (
          <SkeletonPanel key={i} minH="min-h-[220px]" bodyClassName="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-64 max-w-full" delay={i * 60} />
              <Skeleton className="ml-auto h-7 w-16 flex-shrink-0" />
            </div>
            <Skeleton className="h-3 w-48" delay={i * 60 + 20} />
            <Skeleton className="h-6 w-56" delay={i * 60 + 40} />
            <Skeleton className="h-2.5 w-full" delay={i * 60 + 60} />
            <Skeleton className="h-3 w-72 max-w-full" delay={i * 60 + 80} />
            <Skeleton className="h-12 w-full" delay={i * 60 + 100} />
          </SkeletonPanel>
        ))}
      </div>
    </div>
  );
}
