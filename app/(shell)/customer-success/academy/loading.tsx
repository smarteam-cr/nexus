/**
 * Esqueleto de /customer-success/academy — el catálogo de HubSpot Academy.
 *
 * FORMA REAL (page.tsx → CatalogoDeAcademy): cabecera con migas · una tabla por rol.
 */
import { PageHeaderSkeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function AcademyLoading() {
  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[32rem]" />
      {[0, 1].map((i) => (
        <SkeletonPanel key={i} minH="min-h-[180px]" header>
          <TableSkeleton columns={5} rows={3} />
        </SkeletonPanel>
      ))}
    </div>
  );
}
