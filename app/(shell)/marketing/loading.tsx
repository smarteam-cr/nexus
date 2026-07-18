/**
 * Loading skeleton de la sección Marketing — UNO a nivel de sección: el
 * PageHeader y las tabs reales viven en marketing/layout.tsx y persisten;
 * esto solo cubre el slot de contenido de la sub-vista mientras resuelve.
 */
import { ListSkeleton } from "@/components/ui";

export default function MarketingLoading() {
  return (
    <div className="mt-4">
      <ListSkeleton rows={4} rowClassName="h-20" />
    </div>
  );
}
