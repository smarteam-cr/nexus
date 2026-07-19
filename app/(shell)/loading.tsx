/**
 * Loading FALLBACK de todo el shell interno.
 *
 * Red de seguridad: cualquier ruta bajo `app/(shell)/` que no tenga su propio
 * loading.tsx (ni lo herede de un ancestro más específico) cae acá, así que ninguna
 * navegación interna queda "congelada" mostrando la página anterior.
 *
 * Es genérico a propósito (header + lista): si una pantalla tiene forma fuerte —tabla,
 * grilla de cards, documento, workspace— merece su propio loading.tsx que replique esa
 * forma. Declaralo en `lib/ui/skeleton-coverage.ts`, que es lo que el test verifica.
 */
import { PageHeaderSkeleton, ListSkeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function ShellLoading() {
  return (
    <div className={SHELL_DEFAULT}>
      <PageHeaderSkeleton />
      <ListSkeleton rows={5} />
    </div>
  );
}
