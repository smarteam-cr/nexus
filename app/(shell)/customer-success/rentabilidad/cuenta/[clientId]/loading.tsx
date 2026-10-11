/**
 * Esqueleto de /customer-success/rentabilidad/cuenta/[clientId] — calcula el margen de cada mes del trimestre.
 *
 * FORMA REAL (page.tsx → MargenDeLaCuenta): cabecera · 4 cifras · mes a mes · quién la atendió y su factor en dos
 * columnas · lo que respondió el equipo.
 */
import { CardsSkeleton, PageHeaderSkeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function MargenDeLaCuentaLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-96" />
      <CardsSkeleton count={4} columns={4} breakpoint="lg" variant="tile" minH="min-h-[96px]" />
      <SkeletonPanel minH="min-h-[200px]" header>
        <TableSkeleton columns={7} rows={3} />
      </SkeletonPanel>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <SkeletonPanel minH="min-h-[220px]" header>
          <TableSkeleton columns={4} rows={4} />
        </SkeletonPanel>
        <SkeletonPanel minH="min-h-[220px]" header>
          <TableSkeleton columns={2} rows={6} />
        </SkeletonPanel>
      </div>
    </div>
  );
}
