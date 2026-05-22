/**
 * Loading skeleton para /clients.
 * Grid de cards de clientes con skeleton-shimmer.
 */

export default function ClientsLoading() {
  return (
    <div className="flex-1 px-8 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="h-7 w-40 rounded skeleton-shimmer" />
        <div className="h-9 w-36 rounded-lg skeleton-shimmer" />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(9)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-100 bg-white p-5 space-y-3"
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full skeleton-shimmer" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 rounded skeleton-shimmer" style={{ width: "60%" }} />
                <div className="h-2.5 rounded skeleton-shimmer" style={{ width: "40%" }} />
              </div>
            </div>
            <div className="space-y-1.5 pt-2">
              <div className="h-2 rounded skeleton-shimmer" style={{ width: "85%" }} />
              <div className="h-2 rounded skeleton-shimmer" style={{ width: "70%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
