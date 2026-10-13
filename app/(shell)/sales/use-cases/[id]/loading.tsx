/**
 * Loading de /sales/use-cases/[id] (la ficha de un caso del catálogo).
 *
 * FORMA REAL (page.tsx): `SHELL_DEFAULT` con una columna de 1180 px · volver + título + las dos acciones · los chips ·
 * la promesa · y dos columnas: las tres tarjetas del caso a la izquierda y las tarjetas angostas a la derecha.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function CasoDeUsoLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-2.5 w-24" />
          <PageHeaderSkeleton titleWidth="w-96" descWidth={null} action className="mb-0" />
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-5 w-[36rem] max-w-full" />
        </div>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
            <SkeletonPanel minH="min-h-[150px]" header className="rounded-xl p-5" />
            <SkeletonPanel minH="min-h-[170px]" header className="rounded-xl p-5" />
            <SkeletonPanel minH="min-h-[320px]" header className="rounded-xl p-5" />
          </div>
          <div className="flex max-w-[340px] flex-[1_1_300px] flex-col gap-3">
            <SkeletonPanel minH="min-h-[90px]" header className="rounded-xl p-4" />
            <SkeletonPanel minH="min-h-[90px]" header className="rounded-xl p-4" />
            <SkeletonPanel minH="min-h-[80px]" header className="rounded-xl p-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
