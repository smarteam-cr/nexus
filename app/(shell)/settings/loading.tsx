/** Loading skeleton de /settings — cards de configuración. */
import { PageHeaderSkeleton, CardsSkeleton } from "@/components/ui";

export default function SettingsLoading() {
  return (
    <div className="px-6 py-8 max-w-2xl">
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-56" />
      <CardsSkeleton count={3} columns={1} minH="min-h-[128px]" />
    </div>
  );
}
