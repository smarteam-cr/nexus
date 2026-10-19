/**
 * Esqueleto de /customer-success/propuestas — la lista arma la salud de cada proyecto con la cartera.
 *
 * FORMA REAL (page.tsx → PropuestasDelVigia): cabecera con migas · el rótulo con cuántas · una fila por propuesta.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function PropuestasDelVigiaLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[32rem]" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        {[0, 1, 2, 3].map((i) => (
          <SkeletonPanel key={i} minH="min-h-[104px]" bodyClassName="space-y-2 px-4 py-3.5">
            <Skeleton className="h-3 w-48" delay={i * 40} />
            <Skeleton className="h-4 w-96 max-w-full" delay={i * 40} />
            <Skeleton className="h-3 w-80 max-w-full" delay={i * 40} />
          </SkeletonPanel>
        ))}
      </div>
    </div>
  );
}
