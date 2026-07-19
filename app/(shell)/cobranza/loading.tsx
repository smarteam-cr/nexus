/**
 * Loading skeleton de /cobranza — la página resuelve 7 queries en un Promise.all
 * antes del primer byte; sin esto la navegación quedaba congelada.
 *
 * FORMA REAL (page.tsx → CobranzaClient → ColaCobros): header con acción global
 * "Registrar pago" · 6 tabs SUBRAYADOS (no pills) · y como landing la COLA DE
 * COBROS: 3 tiles de resumen, la fila de filtros, y los grupos "Vencidos" /
 * "Esta quincena" (el tercero, "Más adelante", nace COLAPSADO: solo su
 * encabezado). No hay tabla en el landing — la tabla vive en el tab "Clientes".
 */
import { PageHeaderSkeleton, SkeletonTabs, Skeleton, CardsSkeleton, ListSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CobranzaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-28" descWidth="w-96 max-w-full" action />

      {/* Cobros · Clientes · Proyección · Alertas · Reportes · Corte semanal */}
      <SkeletonTabs count={6} className="mb-6" />

      <div className="space-y-4">
        {/* Vencido · Por cobrar esta quincena · Promesas (grid gap-3 sm:grid-cols-3) */}
        <CardsSkeleton
          count={3}
          columns={3}
          breakpoint="sm"
          variant="tile"
          minH="min-h-[88px]"
          className="gap-3"
        />

        {/* Filtros: buscador + segmentado de moneda + contador */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-2.5 w-28" />
        </div>

        {/* Grupos expandidos: Vencidos · Esta quincena */}
        <ListSkeleton groups={2} rows={6} lines={1} trailing />

        {/* "Más adelante" arranca colapsado: solo el encabezado clickeable */}
        <Skeleton className="h-2.5 w-40" />
      </div>
    </div>
  );
}
