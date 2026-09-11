/**
 * Estado de carga de una página de Documentación: el encabezado (ícono + título) y el cuerpo
 * de texto, con la MISMA constante de contenedor que el page.tsx para que no salte de ancho.
 */
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeaderSkeleton, SkeletonText } from "@/components/ui";

export default function Loading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-64" descWidth="w-40" />
      <div className="max-w-3xl">
        <SkeletonText lines={5} className="mb-8" />
        <SkeletonText lines={4} label />
      </div>
    </div>
  );
}
