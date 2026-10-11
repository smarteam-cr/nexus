/**
 * Loading skeleton de /finanzas/modelo-de-comisiones.
 *
 * FORMA REAL (page.tsx → ModeloDeComisiones): PageHeader sin acción · el estado vacío punteado (ícono, título,
 * descripción y un enlace).
 */
import { PageHeaderSkeleton, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ComisionesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-6">
        <PageHeaderSkeleton titleWidth="w-32" descWidth="w-[32rem] max-w-full" />
        <div className="min-h-[260px] rounded-xl border border-dashed border-line flex flex-col items-center justify-center gap-3 px-6 py-16">
          <Skeleton className="h-12 w-12" rounded="lg" />
          <Skeleton className="h-3.5 w-64 max-w-full" delay={60} />
          <Skeleton className="h-3 w-80 max-w-full" delay={120} />
          <Skeleton className="h-3 w-40" delay={180} />
        </div>
      </div>
    </div>
  );
}
