/**
 * components/finanzas/skeletons.tsx — piezas de carga compartidas de Finanzas.
 *
 * Las 3 hojas de costos por categoría (Herramientas · Planillas · Costos fijos)
 * tienen la MISMA forma, así que su skeleton vive una sola vez: si la forma real
 * cambia, se corrige acá y las tres quedan al día (el riesgo que evita es el de
 * tres copias divergiendo hasta que ninguna calza con lo que se pinta).
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, CardsSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

/**
 * Cáscara de una hoja de categoría: header · banner ámbar · fila de toggle ·
 * leyenda + CTA · 2 tiles de burn · buscador · un panel de lista.
 * Sin la fila de pills: esa vive solo en el Resumen.
 */
/**
 * ⚠ FILAS FIJAS a propósito. Antes esto era una prop y el `minH` se armaba en
 * runtime (`min-h-[${42 + filas * 42}px]`): Tailwind escanea el FUENTE, así que
 * esa clase no se generaba nunca y la altura reservada era un no-op silencioso
 * -justo el olvido que `minH` obligatoria existe para volver error. Los 3
 * consumidores usaban el default, así que la perilla solo servía para romperlo.
 * Si mañana hace falta variarla, el minH tiene que salir de un mapa de clases
 * LITERALES, no de una interpolación.
 */
const FILAS_LISTA = 6;
/** 6 filas × ~37px (py-2.5 + contenido h-4 + borde). El header va aparte. */
const MIN_H_LISTA = "min-h-[222px]";

export function CostosCategoriaSkeleton() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-80 max-w-full" />

      <div className="space-y-4">
        {/* Banner "Cifras estimadas — referencia para dirección, no contabilidad." */}
        <SkeletonPanel minH="min-h-[34px]" bodyClassName="px-3 py-2">
          <Skeleton className="h-3 w-80 max-w-full" />
        </SkeletonPanel>

        {/* Fila del toggle "Mostrar datos" (a la derecha, sin pills a la izquierda) */}
        <div className="flex items-center">
          <Skeleton className="h-7 w-32 ml-auto" rounded="lg" />
        </div>

        {/* Leyenda + CTA "Agregar costo" */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-3 w-72 max-w-full" />
          <Skeleton className="h-7 w-28 ml-auto flex-shrink-0" rounded="lg" />
        </div>

        {/* Burn de la categoría, CRC / USD — grid-cols-2 fijo */}
        <CardsSkeleton
          count={2}
          columns={2}
          variant="tile"
          minH="min-h-[84px]"
          className="grid-cols-2 gap-3"
        />

        {/* Buscador */}
        <Skeleton className="h-9 w-full" rounded="lg" />

        {/* La lista: un panel delineado con cabecera (categoría · N + subtotal) */}
        <SkeletonPanel
          minH={MIN_H_LISTA}
          bodyClassName="p-0"
          header={
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-36" />
              <Skeleton className="h-2.5 w-24 ml-auto" delay={40} />
            </div>
          }
        >
          {Array.from({ length: FILAS_LISTA }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-4 py-2.5 border-b border-line last:border-0"
            >
              <Skeleton className="h-3.5 flex-1 max-w-[220px]" delay={i * 60} />
              <Skeleton className="h-4 w-20 flex-shrink-0" delay={i * 60 + 40} />
              <Skeleton className="h-3.5 w-24 flex-shrink-0" delay={i * 60 + 80} />
            </div>
          ))}
        </SkeletonPanel>
      </div>
    </div>
  );
}
