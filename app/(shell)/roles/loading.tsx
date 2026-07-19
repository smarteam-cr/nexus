/** Loading skeleton de /roles — header + lista de puestos. */
import { PageHeaderSkeleton, ListSkeleton } from "@/components/ui";

export default function RolesLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-28" descWidth="w-96" action />
      <ListSkeleton rows={3} lines={2} />
    </div>
  );
}
