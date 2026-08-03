/**
 * Estado de carga de /documentacion. Replica la CÁSCARA de la pantalla cargada —encabezado,
 * fila de pestañas y las tarjetas— con la MISMA constante de contenedor que el page.tsx, para
 * que la página no salte de ancho al resolver.
 */
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeaderSkeleton, SkeletonTabs, SkeletonText, CardsSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-48" descWidth="w-96" />
      <SkeletonTabs count={4} className="mb-6" />
      {/* El primer bloque de la pestaña por defecto es prosa; después vienen tarjetas. */}
      <SkeletonText lines={3} className="max-w-3xl mb-6" />
      <CardsSkeleton count={4} />
    </div>
  );
}
