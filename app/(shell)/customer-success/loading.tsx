/**
 * Loading skeleton de /customer-success — loadPortfolio es la query más cara del
 * sistema; sin esto la navegación quedaba congelada.
 *
 * FORMA REAL (page.tsx → CsDashboard + CsPanel), en este orden:
 *   1. KpiCards      grid-cols-2 gap-3 md:grid-cols-4  (tiles de contador)
 *   2. alertsSlot    título + filtros del feed + tarjetas de alerta
 *   3. 4 DashCards   grid-cols-1 LG:grid-cols-2 gap-4  (cada una: título + chart)
 *   4. CsPanel       acciones · Expansión · PortfolioGrid (stats + filtros + grupos)
 */
import {
  PageHeaderSkeleton,
  Skeleton,
  SkeletonPanel,
  SkeletonChart,
  CardsSkeleton,
  ListSkeleton,
} from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CustomerSuccessLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-48" descWidth="w-80" />

      {/* ── CsDashboard (space-y-4 mb-8) ─────────────────────────────────── */}
      <div className="space-y-4 mb-8">
        {/* KpiCards — 4 contadores (5 si el rol ve datos de partner). */}
        <CardsSkeleton
          count={4}
          columns={4}
          breakpoint="md"
          variant="tile"
          minH="min-h-[78px]"
          className="gap-3"
        />

        {/* Slot de alertas del watchdog — va ARRIBA de los charts, como en el real. */}
        <section>
          <Skeleton className="h-3.5 w-28 mb-2" />
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Skeleton className="h-7 w-32" rounded="md" />
            <Skeleton className="h-7 w-28" rounded="md" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <ListSkeleton rows={3} lines={2} />
        </section>

        {/* Los 4 charts. El grid real abre en `lg:` — con `md:` el skeleton
            reflowaba en tablet al llegar la página. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonPanel key={i} minH="min-h-[208px]" bodyClassName="p-4">
              <Skeleton className="h-3.5 w-44 mb-3" delay={i * 60} />
              <div className="h-[150px]">
                <SkeletonChart bars={5} />
              </div>
            </SkeletonPanel>
          ))}
        </div>
      </div>

      {/* ── CsPanel (space-y-7) ──────────────────────────────────────────── */}
      <div className="space-y-7">
        {/* Acciones: actualizar señales · partner · watchdog */}
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <Skeleton className="h-7 w-56" rounded="md" />
          <Skeleton className="h-7 w-40" rounded="md" />
          <Skeleton className="h-7 w-36" rounded="md" />
        </div>

        {/* 📈 Expansión y renovaciones — filas compactas dentro de un panel. */}
        <section>
          <Skeleton className="h-3.5 w-64 mb-2" />
          <ListSkeleton rows={3} lines={1} compact trailing />
        </section>

        {/* PortfolioGrid (space-y-7): tablero de control + filtros + grupos. */}
        <div className="space-y-7">
          <CardsSkeleton
            count={4}
            columns={4}
            breakpoint="sm"
            variant="tile"
            minH="min-h-[68px]"
            className="gap-3"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-64" rounded="lg" />
            <Skeleton className="h-8 w-32" rounded="md" />
          </div>
          <ListSkeleton rows={6} lines={2} trailing groups={2} />
        </div>
      </div>
    </div>
  );
}
