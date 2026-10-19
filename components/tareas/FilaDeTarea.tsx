"use client";

/**
 * components/tareas/FilaDeTarea.tsx — una tarea en una lista: el círculo para terminarla, el título, sus chips y las
 * horas. Un clic en la fila abre su cajón (`?t=<id>`). Con `onAgendar`, una tarea tuya de una semana viva sin agendar
 * lleva «Agendar» a la vista: su bloque privado en tu calendario, sin invitados (lib/google/agenda.ts).
 */
import { cn } from "@/lib/cn";
import type { TareaVista } from "@/lib/tareas/tipos";
import { ChipDeAgenda, ChipsDeTarea, horas } from "./chips";

const PRIORIDAD: Record<string, string> = { alta: "Alta", media: "", baja: "Baja" };

export function FilaDeTarea({
  t,
  onAbrir,
  onTerminar,
  onAgendar,
  conAgenda = false,
  conResponsable = false,
  sinPedida = false,
  ocupada = false,
}: {
  t: TareaVista;
  onAbrir: (t: TareaVista) => void;
  onTerminar?: (t: TareaVista) => void;
  onAgendar?: (t: TareaVista) => void;
  conAgenda?: boolean;
  conResponsable?: boolean;
  /** En la lista de lo que pediste: sin el chip «Te la pidió». */
  sinPedida?: boolean;
  ocupada?: boolean;
}) {
  const hecha = t.estado === "hecha";
  const puedeTerminar = !!onTerminar && (t.acciones.terminar || (hecha && t.acciones.reabrir));
  const puedeAgendar = !!onAgendar && !hecha && t.acciones.agendar && t.agenda.estado !== "agendada";
  return (
    <li className={cn("group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover", ocupada && "opacity-60")}>
      <button
        type="button"
        disabled={!puedeTerminar || ocupada}
        onClick={() => onTerminar?.(t)}
        title={hecha ? "Volver a abrirla" : t.acciones.terminar ? "La terminé" : undefined}
        aria-label={hecha ? `Volver a abrir T-${t.numero}` : `Terminar T-${t.numero}`}
        className={cn(
          "mt-[3px] flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border transition-colors",
          hecha ? "border-success-line bg-success-surface text-success-ink" : t.estado === "en_curso" ? "border-brand" : "border-line",
          puedeTerminar && !hecha && "hover:border-brand hover:bg-info-surface",
          !puedeTerminar && "cursor-default",
        )}
      >
        {hecha && (
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
        {t.estado === "en_curso" && <span className="h-2 w-2 rounded-full bg-brand" />}
      </button>
      <button type="button" onClick={() => onAbrir(t)} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={cn("text-sm text-fg", hecha && "text-fg-muted line-through decoration-line")}>{t.titulo}</span>
          <span className="text-[11px] tabular-nums text-fg-muted">T-{t.numero}</span>
          {PRIORIDAD[t.prioridad] && <span className={cn("text-[11px] font-medium", t.prioridad === "alta" ? "text-warn-ink" : "text-fg-muted")}>{PRIORIDAD[t.prioridad]}</span>}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {conResponsable && t.responsable && <span className="text-xs text-fg-secondary">{t.responsable.nombre}</span>}
          <ChipsDeTarea t={t} sinPedida={sinPedida} />
          {conAgenda && <ChipDeAgenda t={t} />}
        </span>
        {t.contexto && !hecha && <span className="mt-1 block truncate text-[12.5px] text-fg-muted">{t.contexto}</span>}
      </button>
      {puedeAgendar && (
        <button
          type="button"
          disabled={ocupada}
          onClick={() => onAgendar?.(t)}
          title="Un bloque privado en tu calendario, sin invitados"
          className="mt-[1px] flex-shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-info-surface hover:underline disabled:opacity-50"
        >
          Agendar
        </button>
      )}
      <span className="mt-[2px] flex-shrink-0 text-xs tabular-nums text-fg-muted">{t.minutosEstimados ? horas(t.minutosEstimados) : ""}</span>
    </li>
  );
}
