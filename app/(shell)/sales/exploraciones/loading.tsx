/**
 * Loading skeleton de /sales/exploraciones.
 *
 * FORMA REAL (page.tsx): `SHELL_DEFAULT` · migas «Ventas › Exploraciones» arriba del título (por eso
 * la línea fina extra: PageHeaderSkeleton no las dibuja) · «En curso»: una `Table` con buscador y 6
 * columnas (empresa · industria · áreas · qué sigue · lista para proponer · actualizada) · «Todas las
 * empresas»: el buscador de HubSpot y su lista. «Llegaron por el test» se pide en el navegador y
 * reserva su propio lugar.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ExploracionesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <Skeleton className="h-2.5 w-36 mb-2" />
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-[28rem]" />
      <Skeleton className="h-4 w-20 mb-2" />
      <TableSkeleton columns={6} rows={3} toolbar toolbarActions={0} className="mb-6" />
      <SkeletonPanel minH="min-h-[22rem]">
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-[38px] w-full" rounded="lg" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </SkeletonPanel>
    </div>
  );
}
