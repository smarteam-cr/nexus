"use client";

/**
 * EquipoDeLaSesion — con qué equipo del cliente es una sesión (2026-10-23, docs/preventa-por-area-plan.md): Marketing,
 * Servicio al cliente, Tecnología… Va en la cabecera de la sesión, debajo de su fecha. Con un equipo, la guía pregunta
 * como se le pregunta a ese equipo (lib/exploraciones/equipos.ts) y por las dimensiones de su área.
 *
 * Nexus sugiere el equipo por el objetivo y el título («¿Es con Marketing?»); nunca lo guarda solo. Elegir un equipo cuya
 * área de la escala no está en juego la suma en el mismo cambio: así lo que diga ese equipo llega a su área y no a la de
 * Ventas (pasó con CEMACO: todo lo de marketing quedó atado a dimensiones de Ventas).
 */
import { Menu } from "@/components/ui/Menu";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { areaQueSuma, EQUIPOS, EQUIPOS_DEL_CLIENTE, sugerirEquipo, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";
import { tituloDeLaSesion, type PestanaDeSesion, type SesionPlaneada } from "@/lib/exploraciones/guia";
import type { Operacion } from "@/lib/exploraciones/contenido";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";
import { useEditarLaSesion } from "./piezas-de-la-sesion";

function sinEquipo(s: SesionPlaneada): SesionPlaneada {
  const { equipo: _antes, ...resto } = s;
  void _antes;
  return resto;
}

export function EquipoDeLaSesion({ pestana, momento }: { pestana: PestanaDeSesion; momento: MomentoDeLaSesion }) {
  const { exp, escala, puedeEditar, guardando } = useLienzo();
  const editar = useEditarLaSesion(pestana, momento);
  const actual = pestana.sesion?.equipo ?? null;
  const sugerido = actual ? null : sugerirEquipo([pestana.sesion?.objetivo, tituloDeLaSesion(pestana), pestana.reunion?.titulo]);

  const elegir = (equipo: ClaveDeEquipo | null) => {
    if (equipo === actual) return;
    const area = equipo ? areaQueSuma(equipo, exp.estado.areas, escala.areas) : null;
    const nombreDelArea = area ? escala.areas.find((a) => a.id === area)?.nombre : null;
    const extra = (): Operacion[] => (area ? [{ op: "areas", areas: [...exp.estado.areas, area] }] : []);
    void editar((s) => (equipo ? { ...s, equipo } : sinEquipo(s)), extra, {
      exito: equipo
        ? `La guía de esta sesión es la de ${EQUIPOS[equipo].nombre}${nombreDelArea ? `, y ${nombreDelArea} quedó en las áreas en juego` : ""}.`
        : "La guía de esta sesión vuelve a ser la de la empresa entera.",
    });
  };

  if (!puedeEditar) {
    return (
      <p data-recorrido="preventa.sesion.equipo" className="text-[13px] text-fg-muted">
        Equipo del cliente: <span className="text-fg-secondary">{actual ? EQUIPOS[actual].nombre : "la empresa entera"}</span>
      </p>
    );
  }

  return (
    <div data-recorrido="preventa.sesion.equipo" className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
      <span>Equipo del cliente:</span>
      <Menu
        aria-label="Elegir el equipo del cliente de esta sesión"
        panelWidth="w-[320px]"
        triggerClassName={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50",
          actual ? "border-info-line bg-info-surface text-brand hover:bg-surface-hover" : "border-dashed border-line text-fg-secondary hover:bg-surface-hover hover:text-fg",
        )}
        trigger={(abierto) => (
          <>
            {actual ? EQUIPOS[actual].nombre : "La empresa entera"}
            <svg className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
        items={[
          ...EQUIPOS_DEL_CLIENTE.map((e) => ({
            key: e,
            disabled: guardando,
            label: (
              <span className="flex flex-col gap-0.5">
                <span className={cn("text-[13px] font-semibold", e === actual ? "text-brand" : "text-fg")}>
                  {e === actual ? "✓ " : ""}
                  {EQUIPOS[e].nombre}
                </span>
                <span className="text-[11.5px] leading-[15px] text-fg-muted">{EQUIPOS[e].quienes}</span>
              </span>
            ),
            onSelect: () => elegir(e),
          })),
          {
            key: "empresa",
            separatorBefore: true,
            disabled: guardando || !actual,
            label: (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-fg">La empresa entera</span>
                <span className="text-[11.5px] leading-[15px] text-fg-muted">La guía de siempre: la meta, los dolores, para cuándo y con qué.</span>
              </span>
            ),
            onSelect: () => elegir(null),
          },
        ]}
      />
      {sugerido && (
        <button
          type="button"
          disabled={guardando}
          onClick={() => elegir(sugerido)}
          title="Lo sugiere Nexus por el objetivo o el título de la sesión"
          className="inline-flex items-center gap-1 rounded-full border border-info-line px-2.5 py-0.5 text-[12px] text-brand hover:bg-info-surface disabled:opacity-50"
        >
          <IconoDeSugerencia className="h-3 w-3" />
          ¿Es con {EQUIPOS[sugerido].nombre}? Usar
        </button>
      )}
    </div>
  );
}
