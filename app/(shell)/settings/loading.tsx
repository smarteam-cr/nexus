/**
 * Loading skeleton de /settings (Configuración).
 *
 * FORMA REAL (page.tsx, contenedor `flex-1 px-8 py-8 space-y-6 overflow-y-auto`,
 * SIN max-w): header + TRES paneles p-5 de alturas distintas — Sesión del
 * consultor (avatar + estado + separador + botón de logout), Apariencia (una
 * fila con el toggle) y Acerca del workspace (título + párrafo + versión).
 * El skeleton anterior usaba `px-6 py-8 max-w-2xl` y tres cards iguales de
 * 128px: la página saltaba de ancho y de alto al resolver.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel, SkeletonText } from "@/components/ui";

export default function SettingsLoading() {
  // Contenedor escrito a mano en el page.tsx (px-8, scroll propio): no es
  // ninguno de los SHELL_* de lib/ui/page-shell.ts; se iguala el valor.
  return (
    <div className="flex-1 px-8 py-8 space-y-6 overflow-y-auto">
      <PageHeaderSkeleton titleWidth="w-40" descWidth="w-64" className="mb-0" />

      {/* Sesión del consultor */}
      <SkeletonPanel minH="min-h-[150px]" bodyClassName="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 flex-shrink-0" rounded="xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-44" delay={40} />
            <Skeleton className="h-2.5 w-24" delay={80} />
          </div>
          <Skeleton className="h-3 w-16 ml-auto" rounded="full" delay={120} />
        </div>
        <div className="border-t border-line pt-4">
          <Skeleton className="h-9 w-32" rounded="lg" delay={160} />
        </div>
      </SkeletonPanel>

      {/* Apariencia */}
      <SkeletonPanel minH="min-h-[90px]" bodyClassName="p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 flex-shrink-0" rounded="xl" delay={200} />
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-28" delay={240} />
              <Skeleton className="h-2.5 w-56" delay={280} />
            </div>
          </div>
          <Skeleton className="h-7 w-14 flex-shrink-0" rounded="full" delay={320} />
        </div>
      </SkeletonPanel>

      {/* Acerca del workspace */}
      <SkeletonPanel minH="min-h-[152px]" bodyClassName="p-5 space-y-3">
        <Skeleton className="h-3.5 w-72 max-w-full" delay={360} />
        <SkeletonText lines={3} />
        <Skeleton className="h-2.5 w-52" delay={480} />
      </SkeletonPanel>
    </div>
  );
}
