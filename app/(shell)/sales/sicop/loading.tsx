/**
 * Loading skeleton de /sales/sicop.
 *
 * FORMA REAL (page.tsx → SicopClient): `SHELL_DEFAULT` · migas «Ventas › SICOP» arriba del
 * título (por eso la línea fina extra: PageHeaderSkeleton no las dibuja) · encabezado con el
 * contador a la derecha · una fila de «Ordenar por» + buscador + botón · el panel de filtros
 * (`rounded-xl bg-surface-muted`) con sus tres renglones de chips · la línea de estado · y
 * `space-y-3` de secciones por etapa, con las primeras desplegadas.
 *
 * La espera real la manda HubSpot (dos llamadas: pipeline + búsqueda) más una query a la
 * base, así que este skeleton se ve de verdad — no es decorativo.
 */
import { PageHeaderSkeleton, Skeleton } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

/** Un renglón de chips del panel de filtros: etiqueta a la izquierda + píldoras. */
function RenglonDeChips({ anchos, delay }: { anchos: string[]; delay: number }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Skeleton className="h-2.5 w-14 mr-1" delay={delay} />
      {anchos.map((w, i) => (
        <Skeleton key={i} className={`h-6 ${w}`} rounded="full" delay={delay + i * 25} />
      ))}
    </div>
  );
}

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

/** Fila: chips de veredicto + asunto + objeto leído por la IA + los dos puntajes. */
function FilaLicitacion({ i }: { i: number }) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-14" rounded="full" delay={i * 60} />
          <Skeleton className="h-2.5 w-24" delay={i * 60 + 20} />
        </div>
        <Skeleton className="h-3.5 w-2/3" delay={i * 60 + 40} />
        <Skeleton className="h-2.5 w-5/6" delay={i * 60 + 60} />
        <Skeleton className="h-2.5 w-44" delay={i * 60 + 80} />
      </div>
      <div className="flex items-start gap-4 flex-shrink-0">
        <Skeleton className="h-8 w-10" delay={i * 60} />
        <Skeleton className="h-8 w-12" delay={i * 60 + 30} />
      </div>
    </div>
  );
}

export default function SicopLoading() {
  // Las 10 etapas del pipeline «Gobiernos»; las 2 primeras, desplegadas con filas.
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
      <PageHeaderSkeleton titleWidth="w-24" descWidth="w-96" action />

      <div className="space-y-4">
        {/* Ordenar por + buscador + acción */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-2.5 w-20 mr-1" />
            {["w-14", "w-16", "w-24", "w-16", "w-14"].map((w, i) => (
              <Skeleton key={i} className={`h-6 ${w}`} rounded="full" delay={i * 30} />
            ))}
          </div>
          <Skeleton className="h-10 flex-1 lg:min-w-[14rem]" rounded="xl" />
          <Skeleton className="h-8 w-28" rounded="lg" delay={120} />
        </div>

        {/* Panel de filtros */}
        <div className="rounded-xl border border-line bg-surface-muted px-4 py-3 space-y-2.5">
          <RenglonDeChips anchos={["w-16", "w-16", "w-14"]} delay={0} />
          <RenglonDeChips
            anchos={["w-20", "w-32", "w-12", "w-24", "w-28", "w-32", "w-32", "w-20", "w-14"]}
            delay={60}
          />
          <div className="flex items-center gap-3 pt-0.5">
            <Skeleton className="h-3 w-40" delay={140} />
            <Skeleton className="h-3 w-40" delay={165} />
            <Skeleton className="h-6 w-32" rounded="lg" delay={190} />
          </div>
        </div>

        {/* Línea de "mostrando X de Y" */}
        <Skeleton className="h-2.5 w-72" delay={200} />

        {/* Las etapas */}
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
    </div>
  );
}
