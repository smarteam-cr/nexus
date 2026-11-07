/**
 * Loading de /sales/use-cases/activities (la biblioteca de actividades).
 *
 * FORMA REAL (page.tsx): `SHELL_DEFAULT` con una columna de 980 px · volver + título + descripción · la caja de cómo
 * se cobra · y una tarjeta por etapa con sus líneas.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function BibliotecaDeActividadesLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="mx-auto flex max-w-[980px] flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-2.5 w-24" />
          <PageHeaderSkeleton titleWidth="w-72" descWidth="w-[32rem]" className="mb-0" />
        </div>
        <SkeletonPanel minH="min-h-[96px]" className="rounded-xl p-4" />
        <SkeletonPanel minH="min-h-[160px]" header className="rounded-xl p-5" />
        <SkeletonPanel minH="min-h-[220px]" header className="rounded-xl p-5" />
        <SkeletonPanel minH="min-h-[320px]" header className="rounded-xl p-5" />
      </div>
    </div>
  );
}
