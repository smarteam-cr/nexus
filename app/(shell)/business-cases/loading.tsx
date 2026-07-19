/** Loading skeleton de /business-cases — header con acción + lista de casos. */
import { PageHeaderSkeleton, ListSkeleton } from "@/components/ui";

export default function BusinessCasesLoading() {
  return (
    <div className="px-6 py-8">
      <PageHeaderSkeleton titleWidth="w-44" descWidth="w-72" action />
      <ListSkeleton rows={5} lines={2} />
    </div>
  );
}
