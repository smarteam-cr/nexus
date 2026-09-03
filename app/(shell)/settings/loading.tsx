/**
 * Loading skeleton de /settings (Preferencias).
 *
 * FORMA REAL (page.tsx): `SHELL_DEFAULT` + PageHeader + UN panel dentro de `max-w-2xl`, con una
 * sola fila (icono + dos líneas de texto a la izquierda, el toggle a la derecha).
 *
 * ⚠ Antes dibujaba TRES paneles con alturas fijadas a mano —sesión, apariencia y «acerca del»—
 * porque ésa era la forma de la pantalla. Al quedarse solo con apariencia, ese esqueleto pasaba a
 * describir algo que ya no existe: la página se cargaba alta y saltaba a un tercio de su alto.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export default function SettingsLoading() {
  return (
    <div className={`flex-1 overflow-y-auto ${SHELL_DEFAULT}`}>
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-72" />

      <div className="max-w-2xl">
        <SkeletonPanel minH="min-h-[90px]" bodyClassName="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 flex-shrink-0" rounded="xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-24" delay={40} />
                <Skeleton className="h-3 w-52" delay={80} />
              </div>
            </div>
            <Skeleton className="h-8 w-16" rounded="lg" delay={120} />
          </div>
        </SkeletonPanel>
      </div>
    </div>
  );
}
