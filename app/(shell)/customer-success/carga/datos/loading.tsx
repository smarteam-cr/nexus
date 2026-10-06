/**
 * Esqueleto de «Qué datos hay» — FORMA REAL (page.tsx → QueDatosHay): cabecera con «Volver a medir» · qué tan
 * completo está · la tabla de datos · el modelo y el plan en dos columnas.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function DatosDeLaCargaLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-96" descWidth="w-96" action />
      <SkeletonPanel minH="min-h-[96px]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-2.5 w-full" />
        </div>
      </SkeletonPanel>
      <SkeletonPanel minH="min-h-[520px]" header>
        <TableSkeleton columns={5} rows={12} />
      </SkeletonPanel>
    </div>
  );
}
