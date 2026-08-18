/**
 * Loading skeleton de /settings/gasto-ia.
 *
 * FORMA REAL (page.tsx, contenedor SHELL_DEFAULT): header + tres tarjetas de número en
 * grilla de 3 + un panel de dos columnas + dos tablas. El skeleton NO hereda el de
 * /settings: esa pantalla son tres paneles apilados y prometería otra cosa.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function FilaDeTabla({ delay }: { delay: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-line px-5 py-2.5 last:border-0">
      <Skeleton className="h-3 flex-1 max-w-[240px]" delay={delay} />
      <Skeleton className="h-3 w-16 ml-auto flex-shrink-0" delay={delay + 20} />
      <Skeleton className="h-3 w-12 flex-shrink-0" delay={delay + 40} />
      <Skeleton className="h-3 w-16 flex-shrink-0" delay={delay + 60} />
    </div>
  );
}

export default function GastoDeIaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-96" />

      {/* Los tres números */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <SkeletonPanel key={i} minH="min-h-[124px]" bodyClassName="p-5 space-y-2">
            <Skeleton className="h-2.5 w-20" delay={i * 40} />
            <Skeleton className="h-8 w-28" delay={i * 40 + 40} />
            <Skeleton className="h-3 w-24" delay={i * 40 + 80} />
          </SkeletonPanel>
        ))}
      </div>

      {/* Quién lo disparó */}
      <SkeletonPanel className="mt-6" minH="min-h-[140px]" bodyClassName="p-5 space-y-4">
        <Skeleton className="h-3.5 w-56" delay={200} />
        <Skeleton className="h-2.5 w-full max-w-xl" delay={240} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-7 w-32" delay={280} />
          <Skeleton className="h-7 w-32" delay={320} />
        </div>
      </SkeletonPanel>

      {/* Las dos tablas */}
      {[0, 1].map((t) => (
        <SkeletonPanel key={t} className="mt-6" minH="min-h-[200px]" bodyClassName="">
          <div className="border-b border-line px-5 py-4">
            <Skeleton className="h-3.5 w-64" delay={360 + t * 200} />
          </div>
          {[0, 1, 2, 3].map((f) => (
            <FilaDeTabla key={f} delay={400 + t * 200 + f * 40} />
          ))}
        </SkeletonPanel>
      ))}
    </div>
  );
}
