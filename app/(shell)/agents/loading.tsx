/**
 * Loading skeleton para /agents — tabla de agentes.
 */

import { Skeleton, TableSkeleton } from "@/components/ui";

export default function AgentsLoading() {
  return (
    <div className="px-6 py-8">
      {/* PageHeader */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-3 w-80 max-w-full" />
      </div>

      <TableSkeleton columns={6} rows={8} toolbar />
    </div>
  );
}
