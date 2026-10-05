/**
 * Loading skeleton de la ficha de una cuenta en Éxito del cliente.
 *
 * FORMA REAL (page.tsx → AccountView, en pestañas desde el 2026-10-05): cabecera de ficha a todo el
 * ancho (56 px) y, debajo, dos columnas: el contenido sobre gris (las seis pestañas y, abierta, la
 * primera: el resumen del agente, las 4 lecturas y lo que pide atención) y el panel de contexto de
 * 300 px a la derecha.
 */
import { Skeleton, SkeletonPanel, SkeletonTabs, SkeletonText } from "@/components/ui";
import { SHELL_FULL } from "@/lib/ui/page-shell";
import PanelLateral from "@/components/ui/PanelLateral";

export default function CsClientLoading() {
  return (
    <div className={SHELL_FULL}>
      <div className="flex min-h-screen flex-col">
        <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-line px-4">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-48" delay={60} />
          <Skeleton className="h-5 w-36" rounded="full" delay={120} />
        </div>
        <div className="flex flex-1 flex-col lg:flex-row">
          <main className="min-w-0 flex-1 bg-surface-muted px-6 pb-12 pt-4 xl:px-8">
            <div className="flex max-w-[1060px] flex-col gap-7">
              <SkeletonTabs count={6} />
              <SkeletonPanel minH="min-h-[96px]" bodyClassName="p-4">
                <SkeletonText lines={3} />
              </SkeletonPanel>
              <section className="flex flex-col gap-3">
                <Skeleton className="h-5 w-48" />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <SkeletonPanel key={i} minH="min-h-[132px]" bodyClassName="p-4 space-y-2">
                      <Skeleton className="h-3 w-16" delay={i * 50} />
                      <Skeleton className="h-4 w-24" delay={i * 50} />
                      <SkeletonText lines={2} />
                    </SkeletonPanel>
                  ))}
                </div>
              </section>
              <section className="flex flex-col gap-3">
                <Skeleton className="h-5 w-40" />
                <SkeletonPanel minH="min-h-[300px]" bodyClassName="divide-y divide-line">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                      <Skeleton className="h-3.5 w-32" delay={i * 40} />
                      <Skeleton className="h-3 w-24" delay={i * 40} />
                      <Skeleton className="h-3 flex-1" delay={i * 40} />
                    </div>
                  ))}
                </SkeletonPanel>
              </section>
            </div>
          </main>
          <PanelLateral etiqueta="La cuenta" ancho="lg:w-[300px]" className="py-6">
            <div className="space-y-2 rounded-xl border border-info-line bg-info-surface p-3.5">
              <Skeleton className="h-3 w-20" />
              <SkeletonText lines={2} />
            </div>
            <SkeletonPanel minH="min-h-[120px]" bodyClassName="p-3">
              <SkeletonText lines={4} />
            </SkeletonPanel>
          </PanelLateral>
        </div>
      </div>
    </div>
  );
}
