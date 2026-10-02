/**
 * Loading skeleton de /sales/exploraciones/[id] (el lienzo de una exploración).
 *
 * FORMA REAL (page.tsx → LienzoDeExploracion): la cabecera de la ficha a todo el ancho (h-14, con
 * borde abajo) · `px-6 py-8` · el nombre de la pieza con su flecha (el selector) · y el Resumen, que
 * es la pieza que abre: la línea de «Qué sigue» y las ocho tarjetas del marco, de a cuatro.
 */
import { Skeleton, SkeletonPanel } from "@/components/ui";

export default function ExploracionLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line px-4">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-3 w-48" delay={80} />
      </div>
      <div className="space-y-6 px-6 py-8">
        <Skeleton className="h-5 w-36" />
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
      </div>
    </div>
  );
}
