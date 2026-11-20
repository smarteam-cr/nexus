/**
 * Esqueleto de /trivia/[id]. FORMA REAL (page.tsx): SHELL_NARROW · «← Trivias» arriba del PageHeader (título de la
 * trivia + cuántas preguntas y veces jugada) · EditorDeTrivia (tarjeta del título, h2 «Preguntas», las tarjetas de
 * pregunta, «Agregar pregunta» y la barra con Eliminar / Lanzar partida / Guardar) · la sección «Partidas de esta
 * trivia» con su tabla.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, TableSkeleton } from "@/components/ui";
import { SHELL_NARROW } from "@/lib/ui/page-shell";

function TarjetaDePreguntaEnCarga({ orden }: { orden: number }) {
  const d = orden * 80;
  return (
    <SkeletonPanel minH="min-h-[420px]" bodyClassName="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24" delay={d} />
        <Skeleton className="h-7 w-32" rounded="lg" delay={d} />
      </div>
      <Skeleton className="h-9 w-80 max-w-full" rounded="lg" delay={d + 40} />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16" delay={d + 40} />
        <Skeleton className="h-12 w-full" rounded="xl" delay={d + 60} />
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 flex-none" rounded="lg" delay={d + k * 40} />
            <Skeleton className="h-[38px] flex-1" rounded="lg" delay={d + k * 40} />
            <Skeleton className="h-[38px] w-24 flex-none" rounded="lg" delay={d + k * 40} />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-28" delay={d} />
        <Skeleton className="h-[38px] w-36" rounded="lg" delay={d} />
      </div>
    </SkeletonPanel>
  );
}

export default function TriviaLoading() {
  return (
    <div className={SHELL_NARROW}>
      <div className="mb-2 flex h-4 items-center">
        <Skeleton className="h-3 w-16" />
      </div>
      <PageHeaderSkeleton titleWidth="w-64 max-w-full" descWidth="w-48" />

      <div className="space-y-6">
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
            <TarjetaDePreguntaEnCarga orden={0} />
            <TarjetaDePreguntaEnCarga orden={1} />
            <Skeleton className="h-10 w-full" rounded="lg" />
          </div>

          <SkeletonPanel minH="min-h-[62px]" bodyClassName="flex items-center justify-between gap-4 px-4 py-3">
            <Skeleton className="h-2.5 w-48" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-[38px] w-24" rounded="lg" />
              <Skeleton className="h-[38px] w-32" rounded="lg" />
              <Skeleton className="h-[38px] w-24" rounded="lg" />
            </div>
          </SkeletonPanel>
        </div>

        <section className="space-y-4">
          <div className="flex h-5 items-center">
            <Skeleton className="h-3 w-40" />
          </div>
          <TableSkeleton columns={6} rows={3} />
        </section>
      </div>
    </div>
  );
}
