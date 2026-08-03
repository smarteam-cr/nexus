/**
 * Estado de carga de /documentacion. Replica la CÁSCARA de la pantalla cargada —encabezado,
 * índice lateral y los bloques de contenido— con la MISMA constante de contenedor que el
 * page.tsx, para que la página no salte de ancho al resolver.
 */
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeaderSkeleton, SkeletonText, ListSkeleton, CardsSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-48" descWidth="w-96" />
      <div className="lg:flex lg:items-start lg:gap-10">
        <div className="mb-6 lg:mb-0 lg:w-52 lg:shrink-0">
          <ListSkeleton rows={5} lines={1} compact />
        </div>
        <div className="min-w-0 flex-1 max-w-3xl">
          {/* La primera sección es prosa; después vienen las fichas de cada documento. */}
          <SkeletonText lines={4} className="mb-8" />
          <CardsSkeleton count={3} />
        </div>
      </div>
    </div>
  );
}
