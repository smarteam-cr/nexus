/**
 * Esqueleto de /customer-success/rentabilidad — FORMA REAL (page.tsx → Rentabilidad): cabecera con el período · pestañas ·
 * 4 cifras · la tabla del margen por cuenta.
 */
import { CardsSkeleton, PageHeaderSkeleton, SkeletonPanel, SkeletonTabs, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function RentabilidadLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-96" action />
      <SkeletonTabs />
      <CardsSkeleton count={4} columns={4} breakpoint="lg" variant="tile" minH="min-h-[96px]" />
      <SkeletonPanel minH="min-h-[520px]" header>
        <TableSkeleton columns={8} rows={12} />
      </SkeletonPanel>
    </div>
  );
}
