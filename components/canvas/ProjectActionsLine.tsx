"use client";

/**
 * components/canvas/ProjectActionsLine.tsx
 *
 * "Qué hacer acá", en UNA LÍNEA.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────
 * El panel completo vivía arriba del Gantt, y no estaba solo: lo acompañaban dos banners de
 * propuesta, la bandeja de sugerencias del equipo, el borrador de avance, el de particularidades
 * y dos avisos crónicos. En Wherex eso eran ~11 cosas pidiendo atención **antes** de ver una
 * sola barra del cronograma. El documento que la pantalla existe para mostrar quedaba tercero.
 *
 * Ahora arriba del Gantt hay exactamente dos cosas: la barra amarilla (publicar) y esta línea.
 *
 * ── POR QUÉ SE ABRE ACÁ Y NO LLEVA A OTRA PANTALLA ───────────────────────────
 * La lista completa se va a poder ver junta, para toda la cartera, en la bandeja del CSE. Pero
 * esta línea NO es un link a esa bandeja, por dos razones:
 *   · Varias acciones son gestos LOCALES —fijar el arranque, confirmar el detalle, enfocar un
 *     grupo de la lista de particularidades—: mandar al CSE a otra pantalla para que vuelva a
 *     esta es peor que no moverlo.
 *   · La bandeja todavía no existe. Un link a una pantalla que no está es un botón que no
 *     cumple, que es exactamente lo que este rediseño vino a sacar.
 * Cuando la bandeja exista, se le agrega abajo un "Esto también está en Mi día →".
 *
 * ── LO QUE LA LÍNEA DICE CERRADA ─────────────────────────────────────────────
 * No alcanza con "5 pendientes": obliga a abrir para saber si importa. La línea muestra el
 * título de la MÁS urgente, así se puede decidir sin desplegar nada.
 */
import { useState } from "react";
import { groupActions, splitBlocking, type ProjectAction, type ActionTone } from "@/lib/timeline/project-actions";

/** Color por tono. `risk` = algo se está deteriorando; `warn` = requiere criterio; `info` = trámite. */
const TONE: Record<ActionTone, { dot: string; cta: string }> = {
  risk: { dot: "bg-red-400", cta: "text-red-300 hover:text-red-200 hover:bg-red-900/20" },
  warn: { dot: "bg-amber-400", cta: "text-amber-300 hover:text-amber-200 hover:bg-amber-900/20" },
  info: { dot: "bg-brand", cta: "text-brand hover:text-brand-dark hover:bg-brand/10" },
};

/** La que se nombra en la línea cerrada: bloqueante primero, después por gravedad del tono. */
const URGENCIA: Record<ActionTone, number> = { risk: 0, warn: 1, info: 2 };
function laMasUrgente(actions: ProjectAction[]): ProjectAction | null {
  if (actions.length === 0) return null;
  // `find` sobre el orden que YA emite el motor: dentro del mismo tono gana el que él puso
  // primero, que es su criterio de prioridad. No se reordena por acá.
  return (
    actions.find((a) => a.blocking) ??
    [0, 1, 2].map((n) => actions.find((a) => URGENCIA[a.tone] === n)).find(Boolean) ??
    actions[0]
  );
}

export default function ProjectActionsLine({
  actions,
  onAction,
}: {
  actions: ProjectAction[];
  /** El padre mapea el id a su comportamiento (abrir el cajón, hacer scroll, ejecutar). */
  onAction: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const { blocking, rest } = splitBlocking(actions);
  const grupos = groupActions(rest);

  // Todo al día: una línea, no un bloque vacío ni la ausencia de nada. Que la ausencia de
  // alarmas también comunique — la pantalla anterior solo hablaba cuando algo estaba mal.
  if (actions.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface-muted px-5 py-2.5 flex items-center gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        <p className="text-sm text-fg-secondary">
          <span className="font-semibold text-fg">Todo al día.</span> Nada espera tu decisión.
        </p>
      </div>
    );
  }

  const principal = laMasUrgente(actions)!;
  const otras = actions.length - 1;

  return (
    <div className="rounded-2xl border border-line bg-surface-muted">
      <div className="flex items-center gap-2.5 px-5 py-2.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TONE[principal.tone].dot}`} />
        <p className="text-sm text-fg-secondary min-w-0 flex-1 truncate">
          <span className="font-semibold text-fg">{principal.title}</span>
          {otras > 0 && (
            <span className="text-fg-muted">
              {" "}· y {otras === 1 ? "1 cosa más" : `${otras} cosas más`}
            </span>
          )}
        </p>

        {/* La acción principal se puede resolver SIN desplegar: en más de la mitad de los
            cronogramas de la cartera lo único pendiente es fijar la fecha de arranque, y el
            selector está a 200 px de acá. */}
        {principal.cta && (
          <button
            type="button"
            onClick={() => onAction(principal.id)}
            className={`text-xs font-semibold rounded-lg px-2.5 py-1 flex-shrink-0 transition-colors ${TONE[principal.tone].cta}`}
          >
            {principal.cta} →
          </button>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="text-xs font-medium text-fg-muted hover:text-fg rounded-lg px-2 py-1 flex-shrink-0 transition-colors"
        >
          {abierto ? "Ocultar" : `Ver ${actions.length}`}
        </button>
      </div>

      {abierto && (
        <div className="px-5 pb-4 space-y-3 border-t border-line pt-3">
          {/* Lo bloqueante va ARRIBA de los grupos: sin fecha de arranque no se calcula ningún
              atraso, así que buena parte del resto es ruido hasta que se resuelva. */}
          {blocking.length > 0 && <Grupo label="Antes que nada" items={blocking} onAction={onAction} peligro />}
          {grupos.map((g) => (
            <Grupo key={g.group} label={g.label} items={g.items} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}

function Grupo({
  label,
  items,
  onAction,
  peligro = false,
}: {
  label: string;
  items: ProjectAction[];
  onAction: (id: string) => void;
  peligro?: boolean;
}) {
  return (
    <div>
      <p className={`text-2xs font-bold uppercase tracking-wider mb-1.5 ${peligro ? "text-red-300" : "text-fg-muted"}`}>
        {label}
        {!peligro && <span className="ml-1.5 font-semibold text-fg-muted/70">{items.length}</span>}
      </p>
      <ul className="space-y-1">
        {items.map((a) => (
          <li
            key={a.id}
            className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 border ${
              peligro ? "border-red-700/40 bg-red-900/15" : "border-line bg-surface"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${peligro ? "bg-red-400" : TONE[a.tone].dot}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-fg font-medium leading-snug">{a.title}</p>
              <p className="text-[12.5px] text-fg-secondary leading-relaxed mt-0.5">{a.why}</p>
            </div>
            {/* Sin `cta` la fila informa y no lleva a ningún lado — es una declaración del
                motor, no un olvido. Un botón que no cumple es peor que no tener botón. */}
            {a.cta && (
              <button
                type="button"
                onClick={() => onAction(a.id)}
                className={`text-xs font-semibold rounded-lg px-2.5 py-1 flex-shrink-0 transition-colors ${
                  peligro ? "text-red-300 hover:text-red-200 hover:bg-red-900/30" : TONE[a.tone].cta
                }`}
              >
                {a.cta} →
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
