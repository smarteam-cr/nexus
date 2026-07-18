/**
 * Loading skeleton para /sessions.
 *
 * Se renderiza INSTANTÁNEAMENTE al navegar a /sessions, mientras el RSC
 * server-side hace las queries pesadas (sesiones + transcripts + HubSpot lookup).
 *
 * Reduce drásticamente la sensación de "página congelada" porque el browser
 * pinta este shell apenas el usuario hace click — no espera al SSR completo.
 */

import { Skeleton, Spinner } from "@/components/ui";

export default function SessionsLoading() {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar skeleton (replica la estructura real con buscador + 4 secciones) */}
      <aside className="w-72 flex-shrink-0 border-r border-line flex flex-col overflow-hidden">
        {/* Buscador */}
        <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-line">
          <Skeleton className="h-8" />
        </div>
        {/* Items por sección */}
        <div className="flex flex-col flex-1 overflow-hidden py-3 px-2 space-y-4">
          {[[0, 1, 2, 3, 4], [0, 1, 2], [0, 1], [0, 1, 2, 3]].map((items, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-28 ml-2" delay={i * 50} />
              {items.map((j) => (
                <Skeleton key={j} className="h-9" rounded="lg" delay={i * 50 + j * 30} />
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* Panel derecho — placeholder discreto */}
      <div className="flex-1 flex flex-col items-center justify-center text-fg-muted text-sm gap-3">
        <Spinner size="lg" color="border-brand/60" />
        <span>Cargando sesiones…</span>
      </div>
    </div>
  );
}
