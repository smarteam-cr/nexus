"use client";

/**
 * PreguntasDelObjetivo — las preguntas que propone Nexus para el objetivo de la sesión (CEMACO, 2026-10-20: Liliana cambió
 * el objetivo para enfocarse en marketing y lo que pidió Marco, y las preguntas no cambiaron: tuvo que pedírselo al
 * asistente). Se piden al guardar el objetivo (no con cada tecla) y se pueden volver a pedir. Van en azul con la chispa,
 * como todo lo sugerido: «Usar» la suma a la guía como pregunta propia («Por el objetivo»); «Descartar» la saca y no vuelve
 * para ese objetivo. Las escribe la ruta `…/guia/objetivo` (lib/exploraciones/guia-ajustes-server.ts).
 */
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { SkeletonText } from "@/components/ui/Skeleton";
import { BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { sugeridasVigentes } from "@/lib/exploraciones/ajustes-de-la-guia";
import type { PestanaDeSesion } from "@/lib/exploraciones/guia";
import { useLienzo } from "./contexto";
import { nombreDelPara } from "./piezas-de-la-sesion";
import { useAjustarLaGuia } from "./PreguntaDeLaGuia";

/** Pedir las preguntas del objetivo de la próxima sesión: espera a que se guarde lo que está en fila (el objetivo). */
export function usePedirPreguntasDelObjetivo() {
  const { exp, recargar, alDia } = useLienzo();
  const toast = useToast();
  const [pidiendo, setPidiendo] = useState(false);
  const pedir = async () => {
    setPidiendo(true);
    try {
      await alDia();
      const r = await fetch(`/api/sales/exploraciones/${exp.id}/guia/objetivo`, { method: "POST" }).catch(() => null);
      const j = r ? ((await r.json().catch(() => ({}))) as { error?: string }) : {};
      if (!r?.ok) toast.error(j.error ?? "No se pudieron proponer preguntas para el objetivo.");
      await recargar();
    } finally {
      setPidiendo(false);
    }
  };
  return { pidiendo, pedir };
}

export function PreguntasDelObjetivo({ pestana, pidiendo, alPedirOtras }: { pestana: PestanaDeSesion; pidiendo: boolean; alPedirOtras: () => void }) {
  const { puedeEditar, guardando, escala, marco } = useLienzo();
  const ajustar = useAjustarLaGuia(pestana);
  const toast = useToast();
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const s = pestana.sesion;
  const sugeridas = sugeridasVigentes(s?.ajustesDeLaGuia, s?.objetivo);

  if (pidiendo) {
    return (
      <section role="status" aria-busy="true" className="space-y-2.5 rounded-xl border border-info-line bg-info-surface px-[18px] py-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          Nexus está pensando preguntas para este objetivo
        </p>
        <SkeletonText lines={3} />
      </section>
    );
  }
  if (!sugeridas.length) return null;

  const usar = async (id: string) => {
    if (await ajustar({ tipo: "usarSugerida", id })) toast.success("Pregunta sumada a la guía.");
  };

  return (
    <section aria-label="Preguntas para el objetivo" className="overflow-hidden rounded-xl border border-info-line bg-info-surface">
      <header className="px-[18px] pt-3.5 pb-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
          <IconoDeSugerencia className="h-[13px] w-[13px]" />
          Nexus propone {sugeridas.length === 1 ? "una pregunta" : `${sugeridas.length} preguntas`} para este objetivo
        </p>
        <p className="mt-0.5 text-[12.5px] text-fg-secondary">Úsalas para sumarlas a la guía, o descártalas: no vuelven para este objetivo.</p>
      </header>
      <ul>
        {sugeridas.map((p) => {
          const abierta = abiertas.has(p.id);
          return (
            <li key={p.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 border-t border-info-line px-[18px] py-3 first:border-t-0">
              <div className="min-w-0 flex-[1_1_320px]">
                <p className="text-[14.5px] font-semibold leading-[21px] text-fg">{p.pregunta}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {p.para && <span className="text-xs text-fg-muted">{nombreDelPara(p.para, escala, marco)}</span>}
                  {p.repreguntas.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={abierta}
                      onClick={() =>
                        setAbiertas((xs) => {
                          const n = new Set(xs);
                          if (n.has(p.id)) n.delete(p.id);
                          else n.add(p.id);
                          return n;
                        })
                      }
                      className="text-[12.5px] text-brand hover:underline"
                    >
                      {abierta ? "Ocultar repreguntas" : `${p.repreguntas.length} ${p.repreguntas.length === 1 ? "repregunta" : "repreguntas"}`}
                    </button>
                  )}
                </div>
                {abierta && (
                  <div className="mt-2 flex flex-col gap-1 border-l-2 border-info-line pl-3">
                    {p.repreguntas.map((r, i) => (
                      <span key={i} className="text-[13px] text-fg-secondary">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {puedeEditar && (
                <div className="flex flex-none items-center gap-2">
                  <BotonTexto disabled={guardando} onClick={() => void ajustar({ tipo: "descartarSugerida", id: p.id })}>
                    Descartar
                  </BotonTexto>
                  <BotonBlanco disabled={guardando} onClick={() => void usar(p.id)}>
                    Usar
                  </BotonBlanco>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {puedeEditar && (
        <div className="flex justify-end border-t border-info-line px-[18px] py-2">
          <BotonTexto onClick={alPedirOtras}>Pedir otras</BotonTexto>
        </div>
      )}
    </section>
  );
}
