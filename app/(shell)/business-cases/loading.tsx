/**
 * Loading skeleton de /business-cases.
 *
 * FORMA REAL (page.tsx, rediseño del 2026-10-05): SHELL_DEFAULT · PageHeader («Propuestas» +
 * descripción, con «Nueva propuesta» a la derecha) · las pestañas por estado con «Mías / De todo el
 * equipo» y la búsqueda a la derecha · y la TABLA de seis columnas (Propuesta, Tipo, Estado, El
 * cliente, La arma, HubSpot). El skeleton copia esa forma: si anunciara una lista y llegara una
 * tabla, la pantalla saltaría al cargar.
 */
import { PageHeaderSkeleton, SkeletonTabs, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function BusinessCasesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-32" descWidth="w-96" action />
      <SkeletonTabs count={4} className="mb-4" />
      <TableSkeleton columns={6} rows={8} />
    </div>
  );
}
