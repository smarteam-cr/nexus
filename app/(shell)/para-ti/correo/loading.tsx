/**
 * Loading de /para-ti/correo (el correo de la mañana en vista previa).
 *
 * FORMA REAL: PageHeader con «← Para ti» · una tarjeta centrada con el encabezado del correo (Para, Asunto) y dos
 * listas (reuniones de hoy, para hoy).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CorreoDeLaMananaLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-96 max-w-full" />
      <SkeletonPanel minH="min-h-[360px]" className="mx-auto max-w-2xl" bodyClassName="p-5 space-y-4">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-3 w-72" delay={40} />
        <Skeleton className="h-4 w-64" delay={80} />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-3.5 w-full max-w-md" delay={120 + i * 30} />
        ))}
      </SkeletonPanel>
    </div>
  );
}
