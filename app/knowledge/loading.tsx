/**
 * Loading skeleton para /knowledge — tabla de documentos.
 */

import { Skeleton, TableSkeleton } from "@/components/ui";

export default function KnowledgeLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* PageHeader */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>

      {/* Stats rápidas */}
      <div className="flex gap-3 flex-wrap mb-5">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-11 w-40" rounded="xl" delay={i * 40} />
        ))}
      </div>

      <TableSkeleton columns={6} rows={9} toolbar />
    </div>
  );
}
