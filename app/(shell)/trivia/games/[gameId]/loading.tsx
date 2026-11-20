/**
 * Loading de /trivia/games/[gameId].
 *
 * FORMA REAL (page.tsx): migas · PageHeader (título de la trivia + una línea) · el escenario de la consola del
 * anfitrión (`min-h-[60vh]`, el mismo alto que su esqueleto en ConsolaDelAnfitrion) con la barra de control debajo:
 * «Proyectar» a la izquierda y el botón del momento a la derecha. El resultado de una partida terminada arranca con
 * el resumen y el podio, que caben en el mismo panel.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function PartidaDeTriviaLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className="mb-2 flex h-4 items-center">
        <Skeleton className="h-3 w-56" />
      </div>
      <PageHeaderSkeleton titleWidth="w-64" descWidth="w-[30rem] max-w-full" />
      <div className="space-y-4">
        <SkeletonPanel
          minH="min-h-[60vh]"
          className="rounded-2xl"
          bodyClassName="flex flex-col items-center justify-center gap-5 p-8"
        >
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-12 w-96 max-w-full" delay={60} />
          <Skeleton className="h-5 w-40 max-w-full" delay={120} />
        </SkeletonPanel>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-9 w-28" rounded="lg" />
          <Skeleton className="h-10 w-40" rounded="lg" delay={60} />
        </div>
      </div>
    </div>
  );
}
