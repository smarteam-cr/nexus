"use client";

/**
 * ReunionDeTrabajo — en la preventa de un CLIENTE (24 nov, el TEC; docs/diagnostico-con-lo-que-sabemos-plan.md, etapa 2): si
 * una sesión que ya tiene su reunión es una SESIÓN DE DIAGNÓSTICO o una REUNIÓN DE TRABAJO (una capacitación, una revisión de
 * avance: lo que ya sabemos). Va en la cabecera de la sesión, junto al equipo. Las dos cuentan para ubicar la escala y para
 * el Resumen; la de trabajo pesa menos y la página del cliente la nombra aparte («N reuniones de trabajo juntos y N sesiones
 * de diagnóstico», D4). Lo decide una persona: Nexus solo sugiere cuáles sumar (el selector de «+ Agregar sesión»).
 * En un prospecto o en la exploración de un proyecto no se muestra.
 */
import { Menu } from "@/components/ui/Menu";
import { cn } from "@/lib/cn";
import type { PestanaDeSesion, SesionPlaneada } from "@/lib/exploraciones/guia";
import { partirDeLoQueYaSabemos } from "@/lib/exploraciones/posicionar";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";
import { useEditarLaSesion } from "./piezas-de-la-sesion";

const QUE_CAMBIA =
  "Una reunión de trabajo (una capacitación, una revisión de avance) cuenta para ubicar la escala y para el Resumen, pero pesa menos que una sesión de diagnóstico, y el cliente no la ve como una: la página dice «N reuniones de trabajo juntos y N sesiones de diagnóstico».";

function sinLaMarca(s: SesionPlaneada): SesionPlaneada {
  const { deLoQueYaSabemos: _antes, ...resto } = s;
  void _antes;
  return resto;
}

export function ReunionDeTrabajo({ pestana, momento }: { pestana: PestanaDeSesion; momento: MomentoDeLaSesion }) {
  const { exp, puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, momento);
  if (exp.projectId || !partirDeLoQueYaSabemos(exp.empresa.kind) || !pestana.sesion || !pestana.reunion) return null;
  const deTrabajo = !!pestana.sesion.deLoQueYaSabemos;
  const nombre = deTrabajo ? "Reunión de trabajo" : "Sesión de diagnóstico";

  const elegir = (trabajo: boolean) => {
    if (trabajo === deTrabajo) return;
    void editar((s) => (trabajo ? { ...s, deLoQueYaSabemos: true } : sinLaMarca(s)), undefined, {
      exito: trabajo ? "Es una reunión de trabajo: cuenta como lo que ya sabemos, no como sesión de diagnóstico." : "Es una sesión de diagnóstico.",
    });
  };

  const info = (
    <button
      type="button"
      title={QUE_CAMBIA}
      aria-label={QUE_CAMBIA}
      className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line text-[11px] font-semibold text-fg-muted hover:border-brand hover:text-brand"
    >
      i
    </button>
  );

  if (!puedeEditar) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-fg-muted">
        Es: <span className="text-fg-secondary">{nombre}</span>
        {info}
      </p>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
      <span className="inline-flex items-center gap-1.5">
        Es:
        {info}
      </span>
      <Menu
        aria-label="Elegir si esta sesión es de diagnóstico o una reunión de trabajo"
        panelWidth="w-[320px]"
        triggerClassName={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-semibold transition-colors hover:bg-surface-hover disabled:opacity-50",
          deTrabajo ? "border-line bg-surface-muted text-fg-secondary" : "border-info-line bg-info-surface text-brand",
        )}
        trigger={(abierto) => (
          <>
            {nombre}
            <svg className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
        items={[
          {
            key: "diagnostico",
            disabled: guardando,
            label: (
              <span className="flex flex-col gap-0.5">
                <span className={cn("text-[13px] font-semibold", !deTrabajo ? "text-brand" : "text-fg")}>{!deTrabajo ? "✓ " : ""}Sesión de diagnóstico</span>
                <span className="text-[11.5px] leading-[15px] text-fg-muted">Una conversación para entender cómo trabaja la empresa. Pesa más al ubicar la escala.</span>
              </span>
            ),
            onSelect: () => elegir(false),
          },
          {
            key: "trabajo",
            disabled: guardando,
            label: (
              <span className="flex flex-col gap-0.5">
                <span className={cn("text-[13px] font-semibold", deTrabajo ? "text-brand" : "text-fg")}>{deTrabajo ? "✓ " : ""}Reunión de trabajo</span>
                <span className="text-[11.5px] leading-[15px] text-fg-muted">Una capacitación o una revisión de avance: lo que ya sabemos del cliente.</span>
              </span>
            ),
            onSelect: () => elegir(true),
          },
        ]}
      />
    </div>
  );
}
