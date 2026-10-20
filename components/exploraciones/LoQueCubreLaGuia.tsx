"use client";

/**
 * LoQueCubreLaGuia — qué cubre la guía de la sesión, pegado a ella, arriba de «Retos de su industria» (validación 73,
 * 2026-10-18; antes vivía en el panel de la derecha, en azul). Los puntos para proponer (verde listo, azul lo pregunta
 * la guía, punteado no) y las dimensiones que pregunta, con dónde parece estar cada una. En un proyecto, las tarjetas de
 * la estrategia. Sale de las preguntas YA ajustadas (lib/exploraciones/que-cubre-la-guia.ts): cambia al instante con el
 * asistente, «Regenerar» o una pregunta tuya.
 */
import { cn } from "@/lib/cn";
import { listaParaProponer } from "@/lib/exploraciones/calidad";
import { avanceDeLaEstrategia } from "@/lib/exploraciones/avance-del-proyecto";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import { queCubreLaGuia } from "@/lib/exploraciones/que-cubre-la-guia";
import { useLienzo } from "./contexto";
import { NivelChip } from "./QueVaPrimero";
import { useGuiaDeLaSesion } from "./piezas-de-la-sesion";

export function LoQueCubreLaGuia({ pestana, esLaProxima }: { pestana: PestanaDeSesion; esLaProxima: boolean }) {
  const { exp, chequeo, escala, mapa, marco } = useLienzo();
  const { preguntas } = useGuiaDeLaSesion(pestana, esLaProxima);
  // Solo la próxima: la de una sesión que ya pasó se mira tal como se armó, no contra lo que falta hoy.
  if (!esLaProxima) return null;
  const enProyecto = marco.clave === "cs";
  const r = queCubreLaGuia({
    preguntas,
    puntos: enProyecto ? avanceDeLaEstrategia(exp.estado) : listaParaProponer(exp.estado, chequeo),
    escala,
    posiciones: mapa.posiciones,
    marco: enProyecto ? "cs" : "venta",
  });
  const resumen =
    r.faltan === 0
      ? enProyecto
        ? "La estrategia ya está: esta sesión profundiza."
        : "Ya está lista para proponer: esta sesión confirma y profundiza."
      : r.cubre === r.faltan
        ? `La guía cubre todo lo que falta ${enProyecto ? "de la estrategia" : "para proponer"}.`
        : `La guía cubre ${r.cubre} de ${r.faltan} ${enProyecto ? "tarjetas que faltan" : "puntos que faltan para proponer"}.`;

  return (
    <section data-recorrido="preventa.sesion.cubre" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-[18px] py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">Lo que cubre la guía</h3>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">{resumen}</p>
      </header>
      <div className="space-y-3 px-[18px] py-3.5">
        <div className="flex flex-wrap gap-1.5">
          {r.puntos.map((p) => (
            <span
              key={p.id}
              title={`${p.titulo}: ${p.estado === "listo" ? "listo" : p.estado === "cubre" ? "lo pregunta la guía" : "la guía no lo pregunta"}`}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11.5px]",
                p.estado === "listo" && "border-success-line bg-success-surface text-success-ink",
                p.estado === "cubre" && "border-info-line bg-info-surface text-brand",
                p.estado === "falta" && "border-dashed border-line text-fg-muted",
              )}
            >
              {p.estado === "listo" && "✓ "}
              {p.corto}
            </span>
          ))}
        </div>
        {r.dimensiones.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-fg-muted">Dimensiones de la escala que pregunta:</p>
            <ul className="flex flex-wrap gap-1.5">
              {r.dimensiones.map((d) => (
                <li key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11.5px] text-fg-secondary" title={d.area}>
                  <span className="font-semibold text-warn-ink">{d.id}</span>
                  {d.nombre}
                  {d.nivel && <NivelChip nivel={d.nivel} className="text-fg-muted" />}
                  {d.clase === "hipotesis" && <span className="text-warn-ink">hipótesis</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {enProyecto && (
          <div className="space-y-1.5">
            <p className="text-xs text-fg-muted">{r.vendido.length ? "Piezas de lo vendido que pregunta:" : "La guía todavía no pregunta por lo vendido: actualízala para que lo arme desde el handoff."}</p>
            {r.vendido.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {r.vendido.map((t) => (
                  <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11.5px] text-fg-secondary">
                    <span className="font-semibold text-fg">V</span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-[11px] text-fg-muted">Verde: listo · azul: lo pregunta la guía · punteado: no lo pregunta</p>
      </div>
    </section>
  );
}
