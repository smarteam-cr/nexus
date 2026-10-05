/**
 * Loading skeleton de /audits.
 *
 * FORMA REAL (page.tsx → ListadoDeAuditorias): SHELL_DEFAULT · PageHeader con la acción «Nueva
 * auditoría» (cuando hay alguna, que es el caso común) · el segmentado de filtros · tabla de 6
 * columnas (Portal · Capturada · Lecturas · Análisis · Comprobar a mano · Contactos) sin buscador.
 */
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function AuditsLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-52" descWidth="w-[34rem] max-w-full" action />
      <Skeleton className="mb-4 h-[34px] w-96 max-w-full" rounded="lg" />
      <TableSkeleton columns={6} rows={6} />
    </div>
  );
}
