/**
 * Loading skeleton de /sales/exploraciones/[id] (el lienzo de una exploración).
 *
 * FORMA REAL (page.tsx → LienzoDeExploracion): `SHELL_DEFAULT` · migas «Ventas › Exploraciones ›
 * empresa» · el cartel de «Qué sigue» · la barra de los cinco pasos · y el primer paso
 * (Preparación): la tarjeta de industria y perfil, la de áreas en juego y dos casillas lado a lado.
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
        {/* El cartel de «Qué sigue»: título y una línea. */}
        <SkeletonPanel minH="min-h-[64px]" className="p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-2.5 w-2/3" delay={120} />
        </SkeletonPanel>
        <SkeletonTabs count={5} />
        <Casilla minH="min-h-[160px]" />
        <Casilla minH="min-h-[112px]" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Casilla minH="min-h-[128px]" />
          <Casilla minH="min-h-[128px]" />
        </div>
      </div>
    </div>
  );
}
