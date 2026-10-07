"use client";

/**
 * components/tiempos/PreguntaDeTiempo.tsx — «¿Cuánto te tomó?» (2026-10-05).
 *
 * La misma pregunta en los tres lugares donde aparece: debajo de la tarea que se acaba de marcar en el cronograma
 * (`fila`), en la tarjeta que sale al publicar un documento (`tarjeta`) y en «Para ti» (`lista`). Un clic en una
 * opción la responde; «Otro…» pide el número. «Omitir» y «No lo hice yo» quedan registrados y no cuentan en contra
 * de nadie. Cerrar sin responder la deja en «Para ti» hasta que vence.
 *
 * Lo que supone la carga se ve DESPUÉS de responder por defecto: al lado empuja a elegir ese número y la respuesta
 * deja de servir para corregirlo (lo decide la encuesta en Feedback › Encuestas).
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { fetchJson } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { formatoMinutos, type MotivoDeOmision } from "@/lib/tiempos/reglas";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";

export type Resultado = { tipo: "respondida"; minutos: number } | { tipo: "omitida"; motivo: MotivoDeOmision };

export async function enviarRespuesta(id: string, r: Resultado): Promise<void> {
  await fetchJson(`/api/tiempos/preguntas/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(r.tipo === "respondida" ? { accion: "responder", minutos: r.minutos } : { accion: "omitir", motivo: r.motivo }),
  });
}

const CHIP = "h-7 rounded-full border px-3 text-xs transition-colors disabled:opacity-50";
const CHIP_NORMAL = "border-line bg-surface text-fg-secondary hover:border-info-line hover:text-fg";
const CHIP_ELEGIDO = "border-brand bg-info-surface font-semibold text-brand";

/** Pasa lo escrito en «Otro…» a minutos. */
function aMinutos(cantidad: string, unidad: "min" | "h"): number | null {
  const n = Number(cantidad.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const m = Math.round(unidad === "h" ? n * 60 : n);
  return m >= 1 && m <= 14400 ? m : null;
}

export default function PreguntaDeTiempo({
  pregunta,
  variante,
  onListo,
  onCerrar,
}: {
  pregunta: PreguntaParaResponder;
  variante: "fila" | "tarjeta" | "lista";
  /** Ya se respondió u omitió (y se guardó). */
  onListo?: (r: Resultado) => void;
  /** Cerrar sin responder: queda en «Para ti». Sin esto no se ofrece cerrar. */
  onCerrar?: () => void;
}) {
  const toast = useToast();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [otro, setOtro] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState<"min" | "h">("min");

  const guardar = async (r: Resultado) => {
    setGuardando(true);
    try {
      await enviarRespuesta(pregunta.id, r);
      setResultado(r);
      setCambiando(false);
      setOtro(false);
      onListo?.(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const guardarOtro = () => {
    const m = aMinutos(cantidad, unidad);
    if (m === null) {
      toast.error("Escribe un tiempo entre 1 minuto y 240 horas.");
      return;
    }
    void guardar({ tipo: "respondida", minutos: m });
  };

  const estimacion = pregunta.estimacion.texto;
  const verEstimacionAntes = pregunta.estimacion.modo === "lado" && estimacion;
  const verEstimacionDespues = pregunta.estimacion.modo !== "no" && estimacion;
  const respondida = resultado !== null && !cambiando;
  const elegido = resultado?.tipo === "respondida" ? resultado.minutos : null;

  const marco =
    variante === "fila"
      ? "relative ml-9 mb-2 mt-1 max-w-[440px] rounded-xl border border-line bg-surface p-3.5 shadow-[0_8px_24px_rgba(17,24,39,0.12)]"
      : variante === "tarjeta"
        ? "rounded-xl border border-info-line bg-surface p-4"
        : "py-2";

  if (respondida) {
    return (
      <div className={cn(variante === "fila" ? "ml-9 mb-2 mt-1" : variante === "lista" ? "py-2" : "rounded-xl border border-line bg-surface p-4", "flex flex-wrap items-center gap-x-2 gap-y-1 text-xs")} role="status">
        {variante === "lista" && <span className="min-w-0 flex-1 text-[13px] font-medium text-fg">{pregunta.titulo}</span>}
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-success-ink text-[10px] text-surface" aria-hidden>
          ✓
        </span>
        <span className="text-success-ink">
          {resultado!.tipo === "respondida"
            ? `Anotado: ${formatoMinutos(resultado!.minutos)}. Gracias.`
            : resultado!.motivo === "no_lo_hice"
              ? "Anotado: no la hiciste tú. No vuelve a preguntarse."
              : "Omitida. No vuelve a preguntarse."}
        </span>
        <button type="button" onClick={() => setCambiando(true)} className="font-semibold text-brand hover:text-brand-light">
          Cambiar
        </button>
        {resultado!.tipo === "respondida" && verEstimacionDespues && <span className="basis-full text-fg-muted">{estimacion}</span>}
      </div>
    );
  }

  return (
    <div className={marco} role={variante === "lista" ? undefined : "group"} aria-label={variante === "lista" ? undefined : pregunta.pregunta}>
      {variante === "fila" && (
        <span aria-hidden className="absolute -top-[6px] left-5 h-2.5 w-2.5 rotate-45 border-l border-t border-line bg-surface" />
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        {variante === "lista" ? (
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium text-fg">{pregunta.titulo}</span>
            <span className="text-xs text-fg-muted">{pregunta.contexto}</span>
          </span>
        ) : (
          <span className="text-[13px] font-semibold text-fg">{pregunta.pregunta}</span>
        )}
        {variante !== "lista" && <span className="text-xs text-fg-muted">Sin contar las reuniones</span>}
        {onCerrar && variante !== "lista" && (
          <button type="button" onClick={onCerrar} title="Responder después: queda en «Para ti»" className="-mr-1 ml-auto rounded px-1 text-sm leading-none text-fg-muted hover:text-fg" aria-label="Responder después">
            ×
          </button>
        )}
      </div>
      {variante === "tarjeta" && (
        <p className="mt-0.5 text-xs text-fg-muted">
          <span className="font-medium text-fg-secondary">{pregunta.titulo}</span> · {pregunta.contexto}
        </p>
      )}

      <div className={cn("flex flex-wrap gap-1.5", variante === "lista" ? "mt-1.5" : "mt-2.5")} role="group" aria-label="Tiempo">
        {pregunta.opciones.map((o) => (
          <button
            key={o.minutos}
            type="button"
            disabled={guardando}
            onClick={() => void guardar({ tipo: "respondida", minutos: o.minutos })}
            className={cn(CHIP, elegido === o.minutos ? CHIP_ELEGIDO : CHIP_NORMAL)}
          >
            {o.texto}
          </button>
        ))}
        <button type="button" disabled={guardando} onClick={() => setOtro((v) => !v)} className={cn(CHIP, otro ? CHIP_ELEGIDO : CHIP_NORMAL)}>
          Otro…
        </button>
      </div>

      {otro && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="number"
            min={1}
            inputMode="decimal"
            autoFocus
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guardarOtro()}
            aria-label="Cantidad"
            className="h-7 w-20 rounded-lg border border-line bg-surface px-2 text-xs text-fg"
          />
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as "min" | "h")} aria-label="Unidad" className="h-7 rounded-lg border border-line bg-surface px-1.5 text-xs text-fg">
            <option value="min">minutos</option>
            <option value="h">horas</option>
          </select>
          <button type="button" disabled={guardando} onClick={guardarOtro} className="h-7 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg">
            Guardar
          </button>
        </div>
      )}

      {verEstimacionAntes && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
          {estimacion}
        </p>
      )}

      <div className={cn("flex flex-wrap items-center justify-between gap-2", variante === "lista" ? "mt-1" : "mt-2.5 border-t border-line pt-2")}>
        {variante !== "lista" && <span className="text-xs text-fg-muted">Sirve para calibrar la carga, no para evaluarte.</span>}
        <span className="ml-auto flex gap-0.5">
          <button type="button" disabled={guardando} onClick={() => void guardar({ tipo: "omitida", motivo: "no_lo_hice" })} className="rounded px-1.5 py-1 text-xs text-fg-muted hover:text-fg">
            No lo hice yo
          </button>
          <button type="button" disabled={guardando} onClick={() => void guardar({ tipo: "omitida", motivo: "omitir" })} className="rounded px-1.5 py-1 text-xs text-fg-muted hover:text-fg">
            Omitir
          </button>
        </span>
      </div>
    </div>
  );
}
