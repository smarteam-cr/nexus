/**
 * Loading skeleton para /knowledge.
 * Lista de documentos con filtros laterales.
 */

export default function KnowledgeLoading() {
  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar de filtros (si aplica) */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-800 p-4 space-y-3">
        <div className="h-3 w-20 rounded skeleton-shimmer" />
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-7 rounded-md skeleton-shimmer"
            style={{ animationDelay: `${i * 0.04}s` }}
          />
        ))}
      </aside>

      {/* Lista de documentos */}
      <div className="flex-1 px-8 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-7 w-44 rounded skeleton-shimmer" />
          <div className="h-9 w-36 rounded-lg skeleton-shimmer" />
        </div>

        <div className="space-y-3 max-w-4xl">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 bg-white p-4 space-y-2"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded skeleton-shimmer flex-shrink-0" />
                <div className="h-3.5 rounded skeleton-shimmer" style={{ width: "55%" }} />
              </div>
              <div className="h-2.5 rounded skeleton-shimmer" style={{ width: "80%" }} />
              <div className="h-2.5 rounded skeleton-shimmer" style={{ width: "60%" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
