"use client";

/**
 * components/tiempos/PreguntasDelAvance.tsx — al aplicar el avance que propuso la IA, UNA sola pregunta (2026-10-05).
 *
 * El avance marca muchas tareas a la vez (una persona llegó a 94 en un día): preguntar por cada una sería un
 * formulario que se cierra sin leer, y quien aplica casi nunca es quien hizo todo. El servidor elige hasta tres,
 * una por tipo de fase, las de los tipos con menos respuestas; acá se contestan juntas.
 */
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonTexto } from "@/components/ui/sistema";
import { formatoMinutos } from "@/lib/tiempos/reglas";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";
import { enviarRespuesta, type Resultado } from "./PreguntaDeTiempo";

type Eleccion = "" | "otro" | "no_lo_hice" | `${number}`;

export default function PreguntasDelAvance({
  preguntas,
  tareasMarcadas,
  onCerrar,
}: {
  preguntas: PreguntaParaResponder[];
  /** Cuántas dejó hechas el avance (para decir por cuántas no se pregunta). */
  tareasMarcadas: number;
  onCerrar: () => void;
}) {
  const toast = useToast();
  const [eleccion, setEleccion] = useState<Record<string, Eleccion>>({});
  const [otro, setOtro] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState<string | null>(null);

  const resultadoDe = (id: string): Resultado | null => {
    const e = eleccion[id] ?? "";
    if (e === "") return null;
    if (e === "no_lo_hice") return { tipo: "omitida", motivo: "no_lo_hice" };
    if (e === "otro") {
      const n = Math.round(Number((otro[id] ?? "").replace(",", ".")) * 60);
      return Number.isFinite(n) && n >= 1 && n <= 14400 ? { tipo: "respondida", minutos: n } : null;
    }
    return { tipo: "respondida", minutos: Number(e) };
  };

  const mandar = async (todas: (id: string) => Resultado | null, mensaje: (n: number) => string) => {
    const pares = preguntas.map((p) => [p.id, todas(p.id)] as const).filter((x): x is readonly [string, Resultado] => x[1] !== null);
    if (pares.length === 0) {
      toast.info("Elige un tiempo en al menos una tarea, o usa «Omitir».");
      return;
    }
    setGuardando(true);
    try {
      await Promise.all(pares.map(([id, r]) => enviarRespuesta(id, r)));
      setListo(mensaje(pares.length));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  if (listo) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[13px]" role="status">
        <span className="text-success-ink">✓ {listo}</span>
        <BotonTexto onClick={onCerrar} className="ml-auto">
          Cerrar
        </BotonTexto>
      </div>
    );
  }

  const sinPregunta = Math.max(0, tareasMarcadas - preguntas.length);
  return (
    <section aria-label="Cuánto te tomó lo que aplicaste" className="space-y-2.5 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-fg">
          {preguntas.length === 1 ? "¿Cuánto te tomó esta tarea?" : `¿Cuánto te tomaron estas ${preguntas.length} tareas?`}
        </h3>
        <span className="text-xs text-fg-muted">
          {sinPregunta > 0
            ? `El avance marcó ${tareasMarcadas} como hechas: se pregunta por ${preguntas.length}, una por tipo de fase.`
            : "Sin contar las reuniones."}
        </span>
      </div>
      <div className="divide-y divide-line">
        {preguntas.map((p) => {
          const e = eleccion[p.id] ?? "";
          return (
            <div key={p.id} className="grid gap-x-3 gap-y-1.5 py-2 sm:grid-cols-[minmax(0,1fr)_180px_170px] sm:items-center">
              <span className="text-[13px] font-medium text-fg">{p.titulo}</span>
              <span className="text-xs text-fg-muted">{p.contexto}</span>
              <span className="flex items-center gap-1.5">
                <select
                  value={e}
                  onChange={(ev) => setEleccion((s) => ({ ...s, [p.id]: ev.target.value as Eleccion }))}
                  aria-label={`Tiempo de ${p.titulo}`}
                  className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-fg"
                >
                  <option value="">Elegir…</option>
                  {p.opciones.map((o) => (
                    <option key={o.minutos} value={String(o.minutos)}>
                      {o.texto}
                    </option>
                  ))}
                  <option value="otro">Otro… (en horas)</option>
                  <option value="no_lo_hice">No lo hice yo</option>
                </select>
                {e === "otro" && (
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={otro[p.id] ?? ""}
                    onChange={(ev) => setOtro((s) => ({ ...s, [p.id]: ev.target.value }))}
                    aria-label="Horas"
                    placeholder="h"
                    className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg"
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="text-xs text-fg-muted">Sirve para calibrar la carga, no para evaluarte. Lo que no elijas queda en «Para ti».</span>
        <span className="flex items-center gap-1">
          <BotonTexto
            disabled={guardando}
            onClick={() =>
              void mandar(
                () => ({ tipo: "omitida", motivo: "omitir" }),
                (n) => `${n === 1 ? "Omitida" : `Omitidas las ${n}`}. No vuelven a preguntarse.`,
              )
            }
          >
            {preguntas.length === 1 ? "Omitir" : `Omitir las ${preguntas.length}`}
          </BotonTexto>
          <BotonAzul
            disabled={guardando}
            onClick={() =>
              void mandar(resultadoDe, (n) => {
                const total = preguntas.map((p) => resultadoDe(p.id)).reduce((s, r) => s + (r?.tipo === "respondida" ? r.minutos : 0), 0);
                return total > 0 ? `Anotado: ${formatoMinutos(total)} en ${n === 1 ? "una tarea" : `${n} tareas`}. Gracias.` : "Anotado. Gracias.";
              })
            }
          >
            Guardar
          </BotonAzul>
        </span>
      </div>
    </section>
  );
}
