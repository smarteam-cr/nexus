/**
 * Loading skeleton de /finanzas/caja-neta.
 *
 * FORMA REAL (page.tsx → FinanzasCajaNetaClient → CajaNetaPanel): PageHeader sin
 * acción · fila de leyenda + botón "Actualizar" · banner de honestidad
 * (cobertura del lado entra) · **4** tiles en `grid-cols-2 md:grid-cols-4`
 * (neto esta quincena, próxima quincena, del horizonte, burn mensual) · el panel
 * "Entra vs sale por período" con su gráfico de barras+línea · y la tabla de
 * buckets de 4 columnas (Período · Entra · Sale · Neto), SIN avatar por fila.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonChart, CardsSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

const BUCKETS = 7;

export default function CajaNetaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-32" descWidth="w-96 max-w-full" />

      <div className="space-y-4">
        {/* Leyenda + botón "Actualizar" */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-3 w-96 max-w-full" />
          <Skeleton className="h-7 w-24 ml-auto flex-shrink-0" />
        </div>

        {/* Banner de honestidad (cobertura + aviso de estimados) */}
        <SkeletonPanel minH="min-h-[52px]" bodyClassName="px-4 py-3 space-y-2">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-2.5 w-1/3" delay={60} />
        </SkeletonPanel>

        {/* 4 tiles de neto — grid-cols-2 md:grid-cols-4 */}
        <CardsSkeleton
          count={4}
          columns={4}
          breakpoint="md"
          variant="tile"
          minH="min-h-[96px]"
          className="gap-3"
        />

        {/* Panel "Entra vs sale por período": título + toggle CRC|USD + chart 240px */}
        <SkeletonPanel minH="min-h-[300px]" bodyClassName="px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-3.5 w-52" />
            <Skeleton className="h-6 w-24 ml-auto flex-shrink-0" />
          </div>
          <Skeleton className="h-2.5 w-full max-w-lg" delay={60} />
          <div className="h-[240px]">
            <SkeletonChart bars={BUCKETS} />
          </div>
        </SkeletonPanel>

        {/* Tabla de buckets: Período · Entra · Sale · Neto (celdas numéricas, sin avatar) */}
        <SkeletonPanel
          minH="min-h-[280px]"
          bodyClassName="p-0"
          header={
            <div className="flex items-center gap-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-2.5 flex-1" delay={i * 40} />
              ))}
            </div>
          }
        >
          {Array.from({ length: BUCKETS }).map((_, r) => (
            <div
              key={r}
              className="flex items-center gap-4 px-4 py-2.5 border-b border-line last:border-0"
            >
              <Skeleton className="h-3.5 flex-1" delay={r * 40} />
              {[0, 1, 2].map((c) => (
                <Skeleton key={c} className="h-3.5 flex-1" delay={r * 40 + c * 20} />
              ))}
            </div>
          ))}
        </SkeletonPanel>
      </div>
    </div>
  );
}
