/**
 * Loading de /para-ti.
 *
 * FORMA REAL (ficha D, 2026-10-17, diseño «Para ti · Ventas y CSE»): PageHeader con el selector · la franja de cuatro
 * números · la línea azul de «Tu día, según Nexus» · columna ancha con la agenda (cuadrícula de horas) y «Lo que importa
 * hoy» (filas numeradas con botón) · columna angosta con las cuentas, las tareas de hoy y los avisos.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

function Filas({ n, delay = 0 }: { n: number; delay?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-1 py-3">
          <Skeleton className="h-[22px] w-[22px] rounded-md" delay={delay + i * 40} />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-40 max-w-full" delay={delay + i * 40} />
            <Skeleton className="h-3.5 w-96 max-w-full" delay={delay + i * 40 + 20} />
          </div>
          <Skeleton className="h-7 w-24 rounded-md" delay={delay + i * 40} />
        </div>
      ))}
    </div>
  );
}

function Lineas({ n, delay = 0 }: { n: number; delay?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="space-y-1.5 border-t border-line pt-2.5">
          <Skeleton className="h-3.5 w-full" delay={delay + i * 40} />
          <Skeleton className="h-3 w-32" delay={delay + i * 40 + 20} />
        </div>
      ))}
    </>
  );
}

export default function ParaTiLoading() {
  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <PageHeaderSkeleton titleWidth="w-56" descWidth="w-64 max-w-full" />
        <SkeletonPanel minH="min-h-[104px]" bodyClassName="grid grid-cols-2 gap-4 p-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-28" delay={i * 40} />
              <Skeleton className="h-7 w-20" delay={i * 40 + 20} />
              <Skeleton className="h-3 w-36" delay={i * 40 + 40} />
            </div>
          ))}
        </SkeletonPanel>
        <Skeleton className="h-3 w-[32rem] max-w-full" delay={60} />
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
            <SkeletonPanel minH="min-h-[680px]" bodyClassName="p-5 space-y-3">
              <Skeleton className="h-4 w-48" />
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 border-t border-line pt-3">
                  <Skeleton className="h-3 w-10" delay={i * 20} />
                </div>
              ))}
            </SkeletonPanel>
            <SkeletonPanel minH="min-h-[320px]" bodyClassName="p-5 space-y-3">
              <Skeleton className="h-4 w-36" />
              <Filas n={4} delay={80} />
            </SkeletonPanel>
          </div>
          <div className="flex min-w-0 max-w-[440px] flex-[1_1_360px] flex-col gap-6">
            <SkeletonPanel minH="min-h-[300px]" bodyClassName="p-5 space-y-3">
              <Skeleton className="h-4 w-32" />
              <Lineas n={4} />
            </SkeletonPanel>
            <SkeletonPanel minH="min-h-[180px]" bodyClassName="p-5 space-y-3">
              <Skeleton className="h-4 w-36" />
              <Lineas n={2} delay={80} />
            </SkeletonPanel>
            <SkeletonPanel minH="min-h-[160px]" bodyClassName="p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Lineas n={2} delay={120} />
            </SkeletonPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
