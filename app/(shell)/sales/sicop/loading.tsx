/**
 * Loading skeleton de /sales/sicop.
 *
 * FORMA REAL (page.tsx → SicopClient): `SHELL_DEFAULT` · migas «Ventas › SICOP» arriba del
 * título (por eso la línea fina extra: PageHeaderSkeleton no las dibuja) · encabezado con
 * el contador a la derecha · y `space-y-3` de secciones por etapa — cabecera delineada
 * `rounded-xl px-4 py-3` con chevron + nombre + conteo, y las primeras abiertas mostrando
 * sus filas. Las etapas que cierran arrancan plegadas: por eso la mayoría son cabeceras solas.
 */
import { PageHeaderSkeleton, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

/** Cabecera de etapa: chevron + rótulo + conteo a la derecha. */
function CabeceraEtapa({ i, ancho }: { i: number; ancho: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3">
      <Skeleton className="h-3.5 w-3.5" delay={i * 60} />
      <Skeleton className={`h-3.5 ${ancho}`} delay={i * 60 + 30} />
      <Skeleton className="h-2.5 w-6 ml-auto" delay={i * 60 + 60} />
    </div>
  );
}

/** Fila de licitación: asunto + nro de procedimiento + línea de metadatos. */
function FilaLicitacion({ i }: { i: number }) {
  return (
    <div className="px-4 py-3 space-y-1.5">
      <Skeleton className="h-3.5 w-2/3" delay={i * 60} />
      <Skeleton className="h-2.5 w-44" delay={i * 60 + 40} />
      <Skeleton className="h-2.5 w-1/2" delay={i * 60 + 80} />
    </div>
  );
}

export default function SicopLoading() {
  // Las 10 etapas del pipeline «Gobiernos»; las 2 primeras, abiertas con filas.
  const ETAPAS = [
    { ancho: "w-44", filas: 2 },
    { ancho: "w-40", filas: 1 },
    { ancho: "w-56", filas: 0 },
    { ancho: "w-36", filas: 0 },
    { ancho: "w-40", filas: 0 },
    { ancho: "w-52", filas: 0 },
    { ancho: "w-48", filas: 0 },
    { ancho: "w-24", filas: 0 },
    { ancho: "w-36", filas: 0 },
    { ancho: "w-20", filas: 0 },
  ];

  return (
    <div className={SHELL_DEFAULT}>
      {/* Las migas del PageHeader real («Ventas › SICOP»), que el skeleton de header no dibuja. */}
      <Skeleton className="h-2.5 w-28 mb-2" />
      <PageHeaderSkeleton titleWidth="w-24" descWidth="w-80" action />

      <div className="space-y-3">
        {ETAPAS.map((e, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface overflow-hidden">
            <CabeceraEtapa i={i} ancho={e.ancho} />
            {e.filas > 0 && (
              <div className="border-t border-line divide-y divide-line">
                {Array.from({ length: e.filas }).map((_, k) => (
                  <FilaLicitacion key={k} i={i + k} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
