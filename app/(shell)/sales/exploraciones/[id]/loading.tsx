/**
 * Loading skeleton de /sales/exploraciones/[id] (el lienzo de una exploración).
 *
 * FORMA REAL (page.tsx → LienzoDeExploracion): la cabecera de la ficha a todo el ancho (h-14, con
 * borde abajo) y, debajo, tres columnas: la barra de las piezas (13,5rem), el Resumen al centro —su
 * nombre y las ocho tarjetas del marco, de a cuatro— y el panel de contexto (19rem) desde xl.
 */
import { Skeleton, SkeletonPanel } from "@/components/ui";

export default function ExploracionLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line px-4">
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-3 w-48" delay={80} />
      </div>
      <div className="flex-1 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[13.5rem_minmax(0,1fr)_19rem]">
        {/* Las piezas. */}
        <div className="space-y-3 border-b border-line px-5 py-5 lg:border-b-0 lg:border-r">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-3 w-28" delay={i * 30} />
          ))}
        </div>
        {/* El Resumen: su nombre y las ocho tarjetas. */}
        <div className="space-y-6 px-6 py-6 xl:px-8">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-2/3" delay={80} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <SkeletonPanel key={i} minH="min-h-[8.5rem]" bodyClassName="p-4">
                <Skeleton className="h-3 w-24" delay={i * 30} />
              </SkeletonPanel>
            ))}
          </div>
        </div>
        {/* El contexto: qué sigue y la cuadrícula del marco. */}
        <div className="hidden space-y-4 border-l border-line px-5 py-6 xl:block">
          <SkeletonPanel minH="min-h-[6rem]">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-2 h-3 w-40" delay={80} />
          </SkeletonPanel>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <SkeletonPanel key={i} minH="min-h-[3rem]" bodyClassName="p-2">
                <Skeleton className="h-2.5 w-4" delay={i * 20} />
              </SkeletonPanel>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
