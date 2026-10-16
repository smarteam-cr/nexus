/**
 * Loading de /para-ti/reunion/[eventoId] (el resumen antes de una reunión).
 *
 * FORMA REAL: PageHeader con «← Para ti» y un botón · una grilla de dos columnas con los bloques (quién viene, la
 * última vez, lo pendiente, el siguiente paso, tickets).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function PrepararLaReunionLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-72" descWidth="w-60" />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonPanel key={i} minH="min-h-[180px]" bodyClassName="p-4 space-y-2">
            <Skeleton className="h-3 w-28" delay={i * 40} />
            <Skeleton className="h-3.5 w-64 max-w-full" delay={i * 40 + 20} />
            <Skeleton className="h-3 w-48 max-w-full" delay={i * 40 + 40} />
            <Skeleton className="h-3.5 w-56 max-w-full" delay={i * 40 + 60} />
          </SkeletonPanel>
        ))}
      </div>
    </div>
  );
}
