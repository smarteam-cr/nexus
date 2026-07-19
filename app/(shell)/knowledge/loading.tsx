/**
 * Loading skeleton de /knowledge.
 *
 * FORMA REAL (page.tsx → KnowledgeClient): `flex-1 overflow-y-auto` > `px-6 py-8`
 * (= SHELL_DEFAULT, escrito a mano en el page.tsx con ese valor) · PageHeader SIN acción
 * (el "Nuevo documento" vive dentro del EmptyState) · y dentro de un `space-y-5`: la fila de
 * 4 chips de stats y la tabla de documentos.
 *
 * Desajustes corregidos contra la pantalla real:
 *  - faltaba el wrapper `flex-1 overflow-y-auto` del page: el loading no era la columna
 *    scrollable, así que el alto disponible cambiaba al resolver.
 *  - header a mano con dos <Skeleton> → PageHeaderSkeleton.
 *  - la tabla tiene 7 columnas (Documento · Tipo · Estado · Tags · Versión · Actualizado ·
 *    acciones), no 6.
 *  - los stats NO son una grilla de tiles, así que NO va `CardsSkeleton variant="tile"`
 *    (ese arma un `grid` de 4 columnas iguales): la pantalla real es un `flex gap-3
 *    flex-wrap` de chips DELINEADOS de ancho variable (número grande + etiqueta al lado).
 *    Se replica con SkeletonPanel —la cáscara delineada— en vez del rectángulo relleno de
 *    antes, y con los anchos aproximados de cada etiqueta.
 */
import { PageHeaderSkeleton, SkeletonPanel, Skeleton, TableSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

/** Anchos ~ de "Documentos totales" · "Publicados" · "Borradores" · "Tags disponibles". */
const STAT_WIDTHS = ["w-48", "w-36", "w-36", "w-44"];

export default function KnowledgeLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className={SHELL_DEFAULT}>
        <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[36rem] max-w-full" />

        <div className="space-y-5">
          {/* Stats rápidas: chips delineados (número + etiqueta), no una grilla */}
          <div className="flex gap-3 flex-wrap">
            {STAT_WIDTHS.map((w, i) => (
              <SkeletonPanel
                key={w}
                minH="min-h-[28px]"
                className={w}
                bodyClassName="px-4 py-2.5 flex items-center gap-2"
              >
                <Skeleton className="h-5 w-7" delay={i * 40} />
                <Skeleton className="h-2.5 flex-1" delay={i * 40 + 30} />
              </SkeletonPanel>
            ))}
          </div>

          {/* Documento · Tipo · Estado · Tags · Versión · Actualizado · acciones */}
          <TableSkeleton columns={7} rows={9} toolbar />
        </div>
      </div>
    </div>
  );
}
