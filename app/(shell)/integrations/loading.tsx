/** Loading skeleton de /integrations — cards grandes de integración. */
import { PageHeaderSkeleton, CardsSkeleton } from "@/components/ui";

export default function IntegrationsLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-64" />
      <CardsSkeleton count={2} columns={1} minH="min-h-[160px]" className="max-w-2xl" />
    </div>
  );
}
