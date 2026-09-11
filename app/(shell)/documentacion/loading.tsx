/**
 * Estado de carga del Inicio de Documentación: el encabezado y las tarjetas de las páginas.
 *
 * ⚠ NO dibuja el árbol de la izquierda: eso lo pone el layout, que tiene su propio `<Suspense>`.
 * Repetirlo acá lo pintaría dos veces mientras carga.
 */
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeaderSkeleton, CardsSkeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton titleWidth="w-48" descWidth="w-96" />
      <CardsSkeleton count={4} />
    </div>
  );
}
