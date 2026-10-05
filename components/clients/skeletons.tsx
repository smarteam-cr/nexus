import { Skeleton, SkeletonPanel } from "@/components/ui";

/**
 * Skeletons del WORKSPACE DEL CLIENTE — una sola fuente para las dos superficies que
 * lo pintan mientras carga: `app/(shell)/clients/[id]/loading.tsx` (RSC) y el gate de
 * `ProjectCanvasPanel` (client fetch). Antes eran dos vocabularios distintos que se
 * veían uno tras otro: primero un slab gigante, después cinco slabs iguales.
 *
 * REGLA: cada pieza replica la CÁSCARA de su sección real (mismo contenedor, borde y
 * padding) y reserva su altura. Si cambia el layout de una sección, se cambia acá.
 *
 * Desde el rediseño de la ficha (2026-10-04) el workspace son tres columnas —riel, centro y
 * panel— y entrar a un proyecto abre su RESUMEN: la etapa a todo el ancho y, debajo, el resumen
 * del proyecto y la información de la venta, lado a lado.
 */

// ── El Resumen: la etapa y el resumen del proyecto ─────────────────────────────

/**
 * Lo que pinta el widget del proyecto mientras carga: la tarjeta de la ETAPA (a todo el ancho,
 * con su línea de etapas) y la del RESUMEN. Va adentro de la grilla de dos columnas del Resumen,
 * así que es un fragmento: cada tarjeta ocupa su lugar en la grilla real.
 */
export function ProjectGpsSkeleton() {
  return (
    <>
      <section className="flex min-h-[132px] flex-col gap-3 rounded-xl border border-line bg-surface px-5 py-4 lg:col-span-2">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-3 w-12" rounded="sm" />
          <Skeleton className="h-6 w-36" rounded="full" delay={40} />
        </div>
        <div className="grid grid-cols-6 gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-1.5 w-full" rounded="full" delay={i * 30} />
              <Skeleton className="h-2.5 w-3/4" rounded="sm" delay={i * 30 + 20} />
            </div>
          ))}
        </div>
        <Skeleton className="h-3 w-2/3" rounded="sm" delay={200} />
      </section>
      <SkeletonPanel minH="min-h-[260px]" bodyClassName="p-5 space-y-3">
        <Skeleton className="h-3 w-32" rounded="sm" />
        <Skeleton className="h-4 w-5/6" delay={40} />
        <Skeleton className="h-3 w-24" rounded="sm" delay={70} />
        <div className="space-y-2 pt-2">
          <Skeleton className="h-3 w-full" delay={100} />
          <Skeleton className="h-3 w-11/12" delay={130} />
          <Skeleton className="h-3 w-4/5" delay={160} />
        </div>
      </SkeletonPanel>
    </>
  );
}

// ── Sección de Handoff ─────────────────────────────────────────────────────────

/**
 * Cáscara de «Información de la venta»: rótulo, título con su estado, la frase de qué se vendió,
 * las etiquetas y la fila de acciones. Es la tarjeta hermana del resumen del proyecto en la grilla.
 *
 * `expanded`: para EDITORES (handoffAnywhere) la sección real suma, a todo el ancho y debajo, la
 * tarjeta del contexto y las exclusiones — se reserva su variante colapsada.
 */
export function HandoffSectionSkeleton({ expanded = false }: { expanded?: boolean }) {
  return (
    <>
      <SkeletonPanel minH="min-h-[260px]" bodyClassName="px-5 py-4 space-y-3">
        <Skeleton className="h-3 w-36" rounded="sm" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-40" delay={40} />
          <Skeleton className="h-5 w-20" rounded="full" delay={60} />
        </div>
        <Skeleton className="h-3 w-60 max-w-full" delay={90} />
        <div className="space-y-2 rounded-lg border border-line px-3.5 py-3">
          <Skeleton className="h-3 w-full" delay={120} />
          <Skeleton className="h-3 w-4/5" delay={150} />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-5 w-16" rounded="full" delay={180} />
          <Skeleton className="h-5 w-20" rounded="full" delay={200} />
        </div>
      </SkeletonPanel>
      {expanded && (
        <section className="rounded-xl border border-line bg-surface lg:col-span-2">
          {/* Las filas de «Alrededor del handoff» (FilaDeAlrededor): título y una línea de qué es. */}
          <div className="space-y-1.5 px-4 py-3.5">
            <Skeleton className="h-3.5 w-44" delay={220} />
            <Skeleton className="h-3 w-72 max-w-full" delay={240} />
          </div>
          <div className="space-y-1.5 border-t border-line px-4 py-3.5">
            <Skeleton className="h-3.5 w-52" delay={260} />
            <Skeleton className="h-3 w-60 max-w-full" delay={290} />
          </div>
        </section>
      )}
    </>
  );
}

// ── Workspace completo ─────────────────────────────────────────────────────────

/**
 * El CENTRO de la ficha mientras carga: la fila del título y el Resumen del proyecto (lo que se
 * abre al entrar). Lo pintan el loading.tsx de la ruta —entre el riel y el panel— y el gate del
 * panel del proyecto.
 */
export function WorkspaceSkeleton() {
  return (
    <div className="space-y-5 px-8 pb-10 pt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3 w-48" rounded="sm" delay={40} />
        </div>
        <Skeleton className="h-8 w-36" rounded="lg" delay={80} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ProjectGpsSkeleton />
        <HandoffSectionSkeleton />
      </div>
    </div>
  );
}

/** El riel de la ficha mientras carga: los proyectos, uno abierto con sus piezas, y la cuenta. */
export function RielDelClienteSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-20" rounded="sm" />
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1 px-2.5 py-1.5">
            <Skeleton className="h-3.5 w-36" delay={i * 60} />
            <Skeleton className="h-2.5 w-24" rounded="sm" delay={i * 60 + 30} />
          </div>
        ))}
        <div className="ml-[18px] space-y-2 border-l border-line pl-4 pt-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-3 w-28" rounded="sm" delay={120 + i * 30} />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-16" rounded="sm" delay={260} />
        <Skeleton className="h-3.5 w-40" delay={280} />
        <Skeleton className="h-3.5 w-24" delay={300} />
      </div>
    </div>
  );
}

/** El panel de la derecha mientras carga: el «Qué sigue» y dos tarjetas de contexto. */
export function PanelDeLaFichaSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="space-y-2 rounded-xl border border-info-line bg-info-surface p-3.5">
        <Skeleton className="h-2.5 w-16" rounded="sm" />
        <Skeleton className="h-3 w-full" delay={40} />
        <Skeleton className="h-3 w-4/5" delay={70} />
        <Skeleton className="h-7 w-36" rounded="lg" delay={100} />
      </section>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2.5">
          <Skeleton className="h-2.5 w-24" rounded="sm" delay={140 + i * 60} />
          <SkeletonPanel minH="min-h-[120px]" bodyClassName="px-3 py-2.5 space-y-2">
            <Skeleton className="h-3 w-32" delay={160 + i * 60} />
            <Skeleton className="h-3 w-40" delay={190 + i * 60} />
            <Skeleton className="h-3 w-28" delay={220 + i * 60} />
          </SkeletonPanel>
        </div>
      ))}
    </div>
  );
}

// ── Cáscara de sección de canvas ───────────────────────────────────────────────

/**
 * Sección de canvas (Handoff, Información del cliente, Procesos): tarjeta delineada
 * con cabecera (título + contador) y bloques de prosa dentro.
 */
export function CanvasSectionsSkeleton({
  count = 4,
  columns = 2,
}: {
  count?: number;
  columns?: 1 | 2;
}) {
  return (
    <div className={columns === 2 ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "space-y-4"}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonPanel
          key={i}
          minH="min-h-[200px]"
          header={
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40" delay={i * 70} />
              <Skeleton className="h-5 w-5" rounded="full" delay={i * 70} />
            </div>
          }
          bodyClassName="px-5 py-4 space-y-3"
        >
          <Skeleton className="h-3 w-full" delay={i * 70} />
          <Skeleton className="h-3 w-11/12" delay={i * 70 + 40} />
          <Skeleton className="h-3 w-3/4" delay={i * 70 + 80} />
        </SkeletonPanel>
      ))}
    </div>
  );
}

// ── Cronograma (Gantt) ─────────────────────────────────────────────────────────

/**
 * Cáscara del Cronograma: barra de publicación + grilla de fases×semanas. El cargado
 * es full-width (el skeleton viejo tenía `max-w-3xl`, así que además saltaba en ancho).
 */
export function CronogramaSkeleton() {
  return (
    <div className="space-y-4">
      {/* PublishBar */}
      <div className="h-11 rounded-xl border border-line bg-surface" />

      {/* Grilla del Gantt */}
      <SkeletonPanel
        minH="min-h-[320px]"
        header={
          <div className="flex items-center gap-3">
            <Skeleton className="h-3 w-28" />
            <div className="flex items-center gap-2 ml-auto">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-10" rounded="sm" delay={i * 30} />
              ))}
            </div>
          </div>
        }
        bodyClassName="px-4 py-4 space-y-4"
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-4 w-40 flex-shrink-0" delay={i * 70} />
            <div className="flex-1 flex items-center gap-2">
              <Skeleton
                className={`h-5 ${["w-1/3", "w-1/2", "w-2/5", "w-3/5"][i % 4]}`}
                rounded="sm"
                delay={i * 70 + 40}
              />
            </div>
          </div>
        ))}
      </SkeletonPanel>
    </div>
  );
}
