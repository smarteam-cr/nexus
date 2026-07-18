/** Loading skeleton del detalle de cliente en Customer Success. */
import { PageHeaderSkeleton, CardsSkeleton, Skeleton } from "@/components/ui";

export default function CsClientLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-64" />
      <CardsSkeleton count={2} columns={2} cardClassName="h-32" className="mb-6" />
      <Skeleton className="h-64 w-full" rounded="xl" />
    </div>
  );
}
