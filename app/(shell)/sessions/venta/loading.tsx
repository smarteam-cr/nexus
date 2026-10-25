/**
 * Loading de /sessions/venta («Reuniones de venta», S1 y S2).
 *
 * FORMA REAL: PageHeader con «← Salud de las reuniones» · las dos pestañas · la lista de empresas (una fila por empresa:
 * su nombre, su clase y cuántas reuniones tiene).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ReunionesDeVentaLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeaderSkeleton titleWidth="w-52" descWidth="w-[30rem] max-w-full" />
      <div className="flex gap-6 border-b border-line pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" delay={20} />
      </div>
      <SkeletonPanel minH="min-h-[320px]" bodyClassName="divide-y divide-line">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-4 w-44" delay={i * 30} />
              <Skeleton className="h-4 w-16 rounded-full" delay={i * 30 + 10} />
            </div>
            <Skeleton className="h-3 w-56" delay={i * 30 + 20} />
          </div>
        ))}
      </SkeletonPanel>
    </div>
  );
}
