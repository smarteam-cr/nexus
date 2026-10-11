/**
 * Loading de /tareas/por-cliente.
 *
 * FORMA REAL: PageHeader · la línea que aclara qué es y el segmentado del período · una tabla con una fila por empresa
 * (nombre, abiertas, hechas, horas, proyectos), agrupada por ámbito.
 */
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function PorClienteLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-5 pb-12">
        <PageHeaderSkeleton titleWidth="w-64" descWidth="w-96" action />
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-3 w-56" delay={40} />
        </div>
        <TableSkeleton rows={8} columns={5} />
      </div>
    </div>
  );
}
