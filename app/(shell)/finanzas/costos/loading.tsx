/**
 * Loading skeleton de /finanzas/costos.
 *
 * FORMA REAL (page.tsx → FinanzasCostosClient → CostosPanel): PageHeader SIN
 * acción · banner ámbar de "cifras estimadas" · sub-nav de 3 pills (Costos
 * fijos | Gastos | Movimientos) · y la vista "fijos": fila de CTA (leyenda +
 * "Agregar costo"), 2 tiles de burn a ANCHO COMPLETO en `grid-cols-2` fijo,
 * buscador, y la lista agrupada POR CATEGORÍA — paneles delineados con cabecera
 * (categoría · N + subtotal/mes) y filas adentro, NO una tabla.
 */
import { PageHeaderSkeleton, SkeletonTabs, Skeleton, SkeletonPanel, CardsSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

/** Un grupo de categoría: cabecera + filas de costo. */
function GrupoCategoria({ rows, delay = 0 }: { rows: number; delay?: number }) {
  return (
    <SkeletonPanel
      minH={rows === 3 ? "min-h-[126px]" : "min-h-[84px]"}
      bodyClassName="p-0"
      header={
        <div className="flex items-center gap-2">
          <Skeleton className="h-2.5 w-36" delay={delay} />
          <Skeleton className="h-2.5 w-24 ml-auto" delay={delay + 40} />
        </div>
      }
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-4 py-2.5 border-b border-line last:border-0"
        >
          <Skeleton className="h-3.5 flex-1 max-w-[220px]" delay={delay + i * 60} />
          <Skeleton className="h-4 w-20 flex-shrink-0" delay={delay + i * 60 + 40} />
          <Skeleton className="h-3.5 w-24 flex-shrink-0" delay={delay + i * 60 + 80} />
        </div>
      ))}
    </SkeletonPanel>
  );
}

export default function CostosLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      {/* Sin `action`: el PageHeader de FinanzasCostosClient no tiene botón. */}
      <PageHeaderSkeleton titleWidth="w-44" descWidth="w-96 max-w-full" />

      <div className="space-y-4">
        {/* Banner "Cifras estimadas — referencia para dirección, no contabilidad." */}
        <SkeletonPanel minH="min-h-[34px]" bodyClassName="px-3 py-2">
          <Skeleton className="h-3 w-80 max-w-full" />
        </SkeletonPanel>

        {/* Sub-nav Costos fijos | Gastos | Movimientos (pills) */}
        <SkeletonTabs count={3} variant="pill" className="gap-1.5" />

        {/* Leyenda + CTA "Agregar costo" */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-3 w-80 max-w-full" />
          <Skeleton className="h-7 w-28 ml-auto flex-shrink-0" rounded="lg" />
        </div>

        {/* Burn mensual estimado CRC / USD — grid-cols-2 fijo, ancho completo */}
        <CardsSkeleton
          count={2}
          columns={2}
          variant="tile"
          minH="min-h-[84px]"
          className="grid-cols-2 gap-3"
        />

        {/* Buscador por nombre o persona (INPUT_CLS) */}
        <Skeleton className="h-9 w-full" rounded="lg" />

        {/* Lista agrupada por categoría */}
        <GrupoCategoria rows={3} />
        <GrupoCategoria rows={2} delay={120} />
      </div>
    </div>
  );
}
