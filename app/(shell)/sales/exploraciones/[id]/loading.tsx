/**
 * Loading skeleton de /sales/exploraciones/[id] (el lienzo de una exploración).
 *
 * FORMA REAL (page.tsx → LienzoDeExploracion): `SHELL_DEFAULT` · migas «Ventas › Exploraciones ›
 * empresa» · el resumen (la línea de «Qué sigue» y las ocho tarjetas del marco, de a cuatro) · la
 * barra de las cuatro pestañas · y la primera (Exploración): el panel del agente, la tarjeta de
 * industria y perfil y la de áreas en juego.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonTabs } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function Casilla({ minH }: { minH: string }) {
  return (
    <SkeletonPanel minH={minH} className="p-4">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-2 h-2.5 w-3/4" delay={120} />
      <Skeleton className="mt-4 h-2.5 w-1/2" delay={220} />
    </SkeletonPanel>
  );
}

export default function ExploracionLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <Skeleton className="h-2.5 w-52 mb-2" />
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-72" />
      <div className="space-y-5">
        {/* El resumen: «Qué sigue» y las ocho tarjetas, de a cuatro. */}
        <SkeletonPanel minH="min-h-[300px]">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="mt-2 h-3 w-2/3" delay={120} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <SkeletonPanel key={i} minH="min-h-[6.5rem]" bodyClassName="p-3">
                <Skeleton className="h-3 w-24" delay={i * 30} />
              </SkeletonPanel>
            ))}
          </div>
        </SkeletonPanel>
        <SkeletonTabs count={4} />
        <Casilla minH="min-h-[72px]" />
        <Casilla minH="min-h-[160px]" />
        <Casilla minH="min-h-[112px]" />
      </div>
    </div>
  );
}
