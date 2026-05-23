/**
 * Loading skeleton para /audits — tabla de auditorías.
 */

import { Skeleton, TableSkeleton } from "@/components/ui";

export default function AuditsLoading() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* PageHeader */}
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>

      <TableSkeleton columns={5} rows={8} toolbar />
    </div>
  );
}
