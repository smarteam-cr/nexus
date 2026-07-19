import { Skeleton, SkeletonPanel } from "@/components/ui";

/**
 * Skeletons del WORKSPACE DEL CLIENTE — una sola fuente para las dos superficies que
 * lo pintan mientras carga: `app/(shell)/clients/[id]/loading.tsx` (RSC) y el gate de
 * `ProjectCanvasPanel` (client fetch). Antes eran dos vocabularios distintos que se
 * veían uno tras otro: primero un slab gigante, después cinco slabs iguales.
 *
 * REGLA: cada pieza replica la CÁSCARA de su sección real (mismo contenedor, borde y
 * padding) y reserva su altura. Si cambia el layout de una sección, se cambia acá.
 */

// ── GPS del proyecto ───────────────────────────────────────────────────────────

/**
 * Cabecera + grilla de 4 columnas del widget de proyecto. Es la referencia de oro del
 * patrón (venía inline en ProjectGPS): `min-h-[170px]` es EXACTAMENTE el del grid real,
 * por eso el widget no salta al llegar la data.
 */
export function ProjectGpsSkeleton() {
  const celda = (i: number) => (
    <div key={i} className="p-4 space-y-3">
      <Skeleton className="h-2.5 w-16" rounded="sm" delay={i * 50} />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-12" rounded="sm" delay={i * 50} />
        <Skeleton className="h-3.5 w-24" rounded="sm" delay={i * 50 + 30} />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-12" rounded="sm" delay={i * 50 + 60} />
        <Skeleton className="h-3.5 w-24" rounded="sm" delay={i * 50 + 90} />
      </div>
    </div>
  );

  return (
    <div className="mb-6 bg-surface border border-line rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-surface-muted border-b border-line">
        <Skeleton className="h-4 w-64 max-w-full" rounded="sm" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-line min-h-[170px]">
        {[0, 1, 2, 3].map(celda)}
      </div>
    </div>
  );
}

// ── Sección de Handoff ─────────────────────────────────────────────────────────

/**
 * Cáscara de la sección Handoff Sales→CS. Su estado cargado es una tarjeta delineada
 * con ícono + título + badge + subtítulo + tags a la izquierda y botones a la derecha
 * (~122px mínimo). Antes el skeleton era una barra de 56px: el salto al cargar era de
 * los mayores del workspace.
 */
export function HandoffSectionSkeleton() {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="px-5 py-3.5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-2.5 min-w-0">
          <Skeleton className="w-4 h-4 mt-0.5 flex-shrink-0" rounded="sm" />
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-24" rounded="full" delay={60} />
            </div>
            <Skeleton className="h-3 w-72 max-w-full" delay={100} />
            <div className="flex items-center gap-1.5 pt-0.5">
              <Skeleton className="h-5 w-16" rounded="full" delay={140} />
              <Skeleton className="h-5 w-20" rounded="full" delay={170} />
            </div>
          </div>
        </div>
        <Skeleton className="h-7 w-28 flex-shrink-0" rounded="lg" delay={80} />
      </div>
    </section>
  );
}

// ── Workspace completo ─────────────────────────────────────────────────────────

/**
 * La pila del workspace en el orden REAL: GPS → Handoff → ciclo de vida → header del
 * canvas → canvas activo. Reemplaza a los cinco slabs idénticos que no representaban
 * ninguna de esas secciones.
 */
export function WorkspaceSkeleton() {
  return (
    <div className="px-6 py-8 space-y-6">
      <ProjectGpsSkeleton />
      <HandoffSectionSkeleton />

      {/* Barra del ciclo de vida (colapsada) */}
      <div className="h-[46px] rounded-xl border border-line bg-surface" />

      {/* Header del canvas: selector + acciones */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-48" rounded="lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-24" rounded="lg" delay={60} />
          <Skeleton className="h-7 w-28" rounded="lg" delay={100} />
        </div>
      </div>

      {/* Canvas activo: dos secciones delineadas con su contenido */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <SkeletonPanel
            key={i}
            minH="min-h-[180px]"
            header={<Skeleton className="h-3.5 w-40" delay={i * 80} />}
            bodyClassName="px-5 py-4 space-y-2.5"
          >
            <Skeleton className="h-3 w-full" delay={i * 80} />
            <Skeleton className="h-3 w-11/12" delay={i * 80 + 40} />
            <Skeleton className="h-3 w-4/5" delay={i * 80 + 80} />
          </SkeletonPanel>
        ))}
      </div>
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
