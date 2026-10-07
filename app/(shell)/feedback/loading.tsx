/**
 * Loading skeleton de /feedback.
 *
 * FORMA REAL (Disposicion.tsx, 2026-10-06): a la izquierda `px-6 py-8` con la cabecera, las pestañas, la fila de
 * herramientas y, en la vista que abre por defecto (la Bandeja), la lista y el reporte en un solo marco; a la
 * derecha el panel, a toda la altura.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import PanelLateral from "@/components/ui/PanelLateral";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function FeedbackLoading() {
  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <div className={cn(SHELL_DEFAULT, "min-w-0 flex-1 space-y-5 pb-12")}>
        <div className="space-y-4">
          <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[30rem] max-w-full" className="mb-0" />
          <div className="flex gap-4 border-b border-line pb-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" delay={40} />
            <Skeleton className="h-5 w-20" delay={80} />
            <Skeleton className="h-5 w-20" delay={120} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-9 w-[22rem] max-w-full" />
          <Skeleton className="h-9 w-[30rem] max-w-full" delay={40} />
        </div>
        <SkeletonPanel minH="min-h-[34rem]" bodyClassName="grid lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-0 border-b border-line lg:border-b-0 lg:border-r">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2 border-b border-line px-3.5 py-3">
                <Skeleton className="h-3 w-40" delay={i * 40} />
                <Skeleton className="h-3 w-full" delay={i * 40 + 20} />
                <Skeleton className="h-3 w-28" delay={i * 40 + 40} />
              </div>
            ))}
          </div>
          <div className="space-y-4 p-6">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" delay={40} />
            <Skeleton className="h-3 w-4/5" delay={60} />
            <Skeleton className="h-12 w-full" delay={80} />
          </div>
        </SkeletonPanel>
      </div>
      <PanelLateral etiqueta="Decidir" ancho="lg:w-[340px]" gap="gap-5">
        <SkeletonPanel minH="min-h-[6rem]" bodyClassName="space-y-2 p-3.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-full" delay={40} />
          <Skeleton className="h-3 w-3/4" delay={60} />
        </SkeletonPanel>
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-full" delay={40} />
          <Skeleton className="h-9 w-full" delay={80} />
        </div>
      </PanelLateral>
    </div>
  );
}
