/**
 * Loading skeleton de /cobranza — la página resuelve 7 queries en un Promise.all
 * antes del primer byte; sin esto la navegación quedaba congelada. Replica el
 * landing real: header con acción, tabs, cards de resumen de la cola y tabla.
 */
import { PageHeaderSkeleton, Skeleton, CardsSkeleton, TableSkeleton } from "@/components/ui";

export default function CobranzaLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-72" action />

      {/* Tabs Cobros / Clientes / Proyección / Alertas / Reportes / Corte */}
      <div className="flex items-center gap-2 mb-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-7 w-24" rounded="lg" delay={i * 40} />
        ))}
      </div>

      {/* Cards de resumen (vencido / esta quincena / más adelante) */}
      <CardsSkeleton count={3} columns={3} cardClassName="h-20" className="mb-6" />

      <TableSkeleton columns={6} rows={8} />
    </div>
  );
}
