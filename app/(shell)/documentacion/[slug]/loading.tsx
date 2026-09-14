/**
 * Estado de carga de una página de Documentación: el encabezado (ícono + título) y el cuerpo
 * de texto, con la MISMA columna e inset que el page.tsx para que no salte de ancho ni de lugar.
 */
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeaderSkeleton, SkeletonText } from "@/components/ui";
import { COLUMNA_DE_PAGINA, INSET_CONTENIDO } from "@/components/documentacion/layout";

export default function Loading() {
  return (
    <div className={SHELL_DEFAULT}>
      <div className={`${COLUMNA_DE_PAGINA} ${INSET_CONTENIDO}`}>
        <PageHeaderSkeleton titleWidth="w-64" descWidth="w-40" />
        <SkeletonText lines={5} className="mb-8" />
        <SkeletonText lines={4} label />
      </div>
    </div>
  );
}
