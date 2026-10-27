/**
 * Loading skeleton de /escala/probar.
 *
 * FORMA REAL (page.tsx): `px-6 py-8` (SHELL_DEFAULT) > el encabezado con su volver, el buscador de empresas (un campo y
 * un botón) y la lista de empresas.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ProbarLaEscalaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-48" descWidth="w-[36rem] max-w-full" />
      <div className="space-y-6">
        <div className="flex items-end gap-2">
          <Skeleton className="h-9 w-80 max-w-full" rounded="lg" />
          <Skeleton className="h-9 w-20" rounded="lg" delay={30} />
        </div>
        <SkeletonPanel minH="min-h-[12rem]" bodyClassName="flex flex-col gap-3 p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-4 w-72 max-w-full" delay={i * 30} />
          ))}
        </SkeletonPanel>
      </div>
    </div>
  );
}
