/**
 * Esqueleto de /trivia/new. FORMA REAL (page.tsx → EditorDeTrivia): SHELL_NARROW · «← Trivias» arriba del PageHeader ·
 * la tarjeta del título · el h2 «Preguntas» con su resumen · una tarjeta de pregunta (tipo, texto, cuatro opciones y el
 * tiempo) · «Agregar pregunta» · la barra de acciones.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_NARROW } from "@/lib/ui/page-shell";

function TarjetaDePreguntaEnCarga() {
  return (
    <SkeletonPanel minH="min-h-[420px]" bodyClassName="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-7 w-32" rounded="lg" />
      </div>
      <Skeleton className="h-9 w-80 max-w-full" rounded="lg" delay={40} />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16" delay={40} />
        <Skeleton className="h-12 w-full" rounded="xl" delay={60} />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 flex-none" rounded="lg" delay={k * 40} />
            <Skeleton className="h-[38px] flex-1" rounded="lg" delay={k * 40} />
            <Skeleton className="h-[38px] w-24 flex-none" rounded="lg" delay={k * 40} />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-[38px] w-36" rounded="lg" />
      </div>
    </SkeletonPanel>
  );
}

export default function NuevaTriviaLoading() {
  return (
    <div className={SHELL_NARROW}>
      <div className="mb-2 flex h-4 items-center">
        <Skeleton className="h-3 w-16" />
      </div>
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-80 max-w-full" />

      <div className="space-y-6">
        <SkeletonPanel minH="min-h-[98px]" bodyClassName="p-4 sm:p-5 space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-[38px] w-full" rounded="lg" />
          <Skeleton className="h-2.5 w-64 max-w-full" />
        </SkeletonPanel>

        <div className="space-y-4">
          <div className="flex h-5 items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2.5 w-52" />
          </div>
          <TarjetaDePreguntaEnCarga />
          <Skeleton className="h-10 w-full" rounded="lg" />
        </div>

        <SkeletonPanel minH="min-h-[62px]" bodyClassName="flex items-center justify-between gap-4 px-4 py-3">
          <Skeleton className="h-2.5 w-48" />
          <Skeleton className="h-[38px] w-24" rounded="lg" />
        </SkeletonPanel>
      </div>
    </div>
  );
}
