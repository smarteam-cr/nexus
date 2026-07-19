/**
 * Loading skeleton de /integrations (Configuración general).
 *
 * FORMA REAL (page.tsx, contenedor `flex-1 overflow-y-auto px-8 py-8`): header
 * `mb-8` y una columna `max-w-2xl grid grid-cols-1 gap-4` con CUATRO tarjetas —
 * HubSpot (p-6, icono + estado + párrafo + caja de portal + acciones), Google
 * Meet (p-6, misma anatomía), Logo de Smarteam (p-5 + uploader) y Logos de
 * plataforma (p-5 + DOS cajas anidadas con uploader). El skeleton anterior
 * reservaba 2 cards de 160px con px-6: menos de la mitad del alto real.
 */
import { PageHeaderSkeleton, Skeleton, SkeletonPanel } from "@/components/ui";

/** Cabecera de tarjeta de integración: icono 12×12 + título + chip de estado. */
function IntegrationCard({ minH, delay }: { minH: string; delay: number }) {
  return (
    <SkeletonPanel minH={minH} bodyClassName="p-6">
      <div className="flex items-start gap-4">
        <Skeleton className="h-12 w-12 flex-shrink-0" rounded="xl" delay={delay} />
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-3.5 w-36" delay={delay + 40} />
            <Skeleton className="h-4 w-24" rounded="full" delay={delay + 60} />
          </div>
          <Skeleton className="h-2.5 w-full" delay={delay + 80} />
          <Skeleton className="h-2.5 w-4/5" delay={delay + 100} />
          {/* Caja de estado/portal */}
          <div className="pt-2">
            <Skeleton className="h-12 w-full" rounded="lg" delay={delay + 140} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-8 w-32" rounded="lg" delay={delay + 180} />
            <Skeleton className="h-8 w-28" rounded="lg" delay={delay + 200} />
          </div>
        </div>
      </div>
    </SkeletonPanel>
  );
}

/** Bloque de subida de logo: preview cuadrado + botones + hint. */
function UploaderRow({ delay }: { delay: number }) {
  return (
    <div className="flex items-center gap-4">
      <Skeleton className="h-12 w-20 flex-shrink-0" rounded="lg" delay={delay} />
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-24" rounded="lg" delay={delay + 40} />
          <Skeleton className="h-7 w-20" rounded="lg" delay={delay + 60} />
        </div>
        <Skeleton className="h-2.5 w-44" delay={delay + 80} />
      </div>
    </div>
  );
}

export default function IntegrationsLoading() {
  // El page.tsx escribe este contenedor a mano (pantalla con scroll propio, px-8):
  // no es ninguno de los SHELL_* de lib/ui/page-shell.ts; se iguala el valor.
  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-96" className="mb-8" />

      <div className="max-w-2xl grid grid-cols-1 gap-4">
        {/* HubSpot del sistema */}
        <IntegrationCard minH="min-h-[236px]" delay={0} />
        {/* Google Meet / Gemini */}
        <IntegrationCard minH="min-h-[236px]" delay={120} />

        {/* Logo de Smarteam */}
        <SkeletonPanel minH="min-h-[178px]" bodyClassName="p-5">
          <Skeleton className="h-3.5 w-40 mb-2" delay={240} />
          <Skeleton className="h-2.5 w-full mb-1.5" delay={260} />
          <Skeleton className="h-2.5 w-3/4 mb-4" delay={280} />
          <UploaderRow delay={300} />
        </SkeletonPanel>

        {/* Logos de plataforma — HubSpot + Insider One, cada uno en su caja. */}
        <SkeletonPanel minH="min-h-[338px]" bodyClassName="p-5">
          <Skeleton className="h-3.5 w-44 mb-2" delay={360} />
          <Skeleton className="h-2.5 w-full mb-1.5" delay={380} />
          <Skeleton className="h-2.5 w-2/3 mb-4" delay={400} />
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-lg border border-line p-4">
                <Skeleton className="h-2.5 w-32 mb-3" delay={420 + i * 80} />
                <UploaderRow delay={440 + i * 80} />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </div>
    </div>
  );
}
