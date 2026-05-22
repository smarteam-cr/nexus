/**
 * Loading skeleton para /agents.
 * Lista de agentes con avatar + título + descripción.
 */

export default function AgentsLoading() {
  return (
    <div className="flex-1 px-8 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-7 w-32 rounded skeleton-shimmer" />
          <div className="h-2.5 w-56 rounded skeleton-shimmer" />
        </div>
        <div className="h-9 w-32 rounded-lg skeleton-shimmer" />
      </div>

      {/* Lista */}
      <div className="space-y-2 max-w-3xl">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="w-10 h-10 rounded-lg skeleton-shimmer flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 rounded skeleton-shimmer" style={{ width: "40%" }} />
              <div className="h-2.5 rounded skeleton-shimmer" style={{ width: "65%" }} />
            </div>
            <div className="h-6 w-16 rounded-full skeleton-shimmer flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
