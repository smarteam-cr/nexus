/**
 * Esqueleto de /customer-success/limpieza — la lista lee los proyectos de HubSpot y los servicios de Cobranza.
 *
 * FORMA REAL (page.tsx → ListaDeLimpieza): cabecera con migas · una fila de cuentas por motivo · una tabla por
 * responsable.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function LimpiezaDeHubspotLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[32rem]" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-6 w-32 rounded-full" delay={i * 40} />
        ))}
      </div>
      {[0, 1].map((i) => (
        <SkeletonPanel key={i} minH="min-h-[220px]" header>
          <TableSkeleton columns={4} rows={4} />
        </SkeletonPanel>
      ))}
    </div>
  );
}
