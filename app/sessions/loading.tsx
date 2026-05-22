/**
 * Loading skeleton para /sessions.
 *
 * Se renderiza INSTANTÁNEAMENTE al navegar a /sessions, mientras el RSC
 * server-side hace las queries pesadas (sesiones + transcripts + HubSpot lookup).
 *
 * Reduce drásticamente la sensación de "página congelada" porque el browser
 * pinta este shell apenas el usuario hace click — no espera al SSR completo.
 */

export default function SessionsLoading() {
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar skeleton (replica la estructura real con buscador + 4 secciones) */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
        {/* Buscador */}
        <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-gray-800">
          <div className="h-8 rounded-md skeleton-shimmer" />
        </div>
        {/* Items por sección */}
        <div className="flex flex-col flex-1 overflow-hidden py-3 px-2 space-y-4">
          {[
            { header: 32, items: [40, 40, 40, 40, 40] },
            { header: 32, items: [40, 40, 40] },
            { header: 32, items: [40, 40] },
            { header: 32, items: [40, 40, 40, 40] },
          ].map((section, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 w-28 ml-2 rounded skeleton-shimmer" style={{ animationDelay: `${i * 0.05}s` }} />
              {section.items.map((h, j) => (
                <div
                  key={j}
                  className="h-9 rounded-lg skeleton-shimmer"
                  style={{ animationDelay: `${(i * 0.05 + j * 0.03).toFixed(2)}s` }}
                />
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* Panel derecho — placeholder discreto */}
      <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-sm gap-3">
        <span className="w-5 h-5 border-2 border-gray-700 border-t-brand/60 rounded-full animate-spin" />
        <span>Cargando sesiones…</span>
      </div>
    </div>
  );
}
