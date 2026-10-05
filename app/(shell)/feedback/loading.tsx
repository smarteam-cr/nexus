/**
 * Loading skeleton de /feedback.
 *
 * FORMA REAL (page.tsx): `px-6 py-8` > `space-y-6` con la cabecera, las pestañas y, en la vista que abre
 * por defecto (la Bandeja), tres columnas: la lista, el reporte y el panel de decidir.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function FeedbackLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[30rem] max-w-full" className="mb-0" />
        <div className="flex gap-4 border-b border-line pb-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-24" delay={40} />
          <Skeleton className="h-5 w-20" delay={80} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)_300px]">
          <SkeletonPanel minH="min-h-[32rem]" bodyClassName="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" delay={i * 40} />
            ))}
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[32rem]" bodyClassName="space-y-3 p-5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" delay={40} />
            <Skeleton className="h-3 w-4/5" delay={60} />
            <Skeleton className="h-12 w-full" delay={80} />
          </SkeletonPanel>
          <SkeletonPanel minH="min-h-[20rem]" bodyClassName="space-y-3 p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-full" delay={40} />
            <Skeleton className="h-9 w-full" delay={80} />
          </SkeletonPanel>
        </div>
      </div>
    </div>
  );
}
