/**
 * Loading skeleton de /sales/exploraciones.
 *
 * FORMA REAL (page.tsx → ListaDeExploraciones): `SHELL_DEFAULT` · migas «Ventas › Exploraciones»
 * arriba del título (por eso la línea fina extra: PageHeaderSkeleton no las dibuja) · una `Table`
 * con buscador y el botón «Nueva exploración», y 6 columnas: empresa · industria · áreas · qué sigue
 * · lista para proponer · actualizada.
 */
import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ExploracionesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <Skeleton className="h-2.5 w-36 mb-2" />
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[28rem]" />
      <TableSkeleton columns={6} rows={6} toolbar toolbarActions={1} />
    </div>
  );
}
