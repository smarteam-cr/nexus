"use client";

/**
 * components/canvas/ProposalGlobalStrip.tsx
 *
 * Lo GLOBAL de una propuesta de estructura: la fecha de arranque sugerida, el reordenamiento de
 * fases, y el aceptar/descartar todo.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ VIVE DENTRO DEL GANTT ──────────────────────────
 * La propuesta del handoff siempre se resolvió POR ÍTEM dentro del Gantt: badge azul en la fila
 * de la fase que cambia, fila fantasma por fase nueva. Pero dos de sus cambios no viven en
 * ninguna fila —la fecha de arranque y el orden de las fases— así que tenían un banner propio
 * arriba de todo. Ese banner terminó siendo un índice de algo que estaba 300 px más abajo,
 * ocupando el mismo lugar que el documento.
 *
 * Ahora esta franja va en el encabezado del Gantt, pegada al selector de fecha —que es
 * literalmente el control sobre el que se aplica la sugerencia de arranque— y arriba de las
 * filas que el reordenamiento afecta. El cambio y su botón, a la misma altura.
 */
import { useState } from "react";
import type { ProposalDelta } from "@/lib/timeline/proposal-deltas";
import { plural, describeEndShift } from "@/lib/timeline/weeks";
import { redactarResumenDeCambios, type MagnitudPropuesta } from "@/lib/timeline/magnitud-propuesta";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AcceptButton, RejectButton } from "@/components/ui/AcceptReject";
import { cn } from "@/lib/cn";

export default function ProposalGlobalStrip({
  deltas,
  magnitud,
  working,
  onResolve,
}: {
  /** TODOS los deltas de la propuesta: el contador y el aceptar-todo son sobre el total. */
  deltas: ProposalDelta[];
  /** Cuán distinta es la propuesta y adónde caería el cierre — lib/timeline/magnitud-propuesta.
   *  Requerida y no-nullable a propósito: si alguien la saca, `tsc` frena. */
  magnitud: MagnitudPropuesta;
  working: boolean;
  onResolve: (accept: string[], discard: string[]) => void;
}) {
  // Solo estos dos no tienen fila propia en el Gantt. El resto se resuelve donde vive.
  const globales = deltas.filter((d) => d.kind === "SET_ANCHOR" || d.kind === "REORDER_PHASES");
  const [confirmarReemplazo, setConfirmarReemplazo] = useState(false);
  const otroCronograma = magnitud.esCronogramaNuevo;
  const corrimiento = describeEndShift(magnitud.finAntes, magnitud.finDespues);
  const aceptarTodo = () => onResolve(deltas.map((d) => d.key), []);

  return (
    /* El ancla del CTA azul del encabezado. Ese botón NO acepta: baja hasta acá, donde cada
       cambio se ve con su detalle y su aceptar/descartar. Aceptar seis cambios de estructura sin
       verlos es difícil de deshacer, y la fila de CTAs no tiene espacio para explicarlos. */
    <div
      id="cronograma-propuesta"
      className={cn(
        "scroll-mt-24 rounded-xl border px-3 py-2 space-y-1.5",
        /* Ámbar = «esto merece tu atención», el mismo código de color que el resto del canvas.
           NUNCA rojo: el rojo dice «esto borra algo» y acá el modelo es aditivo — no se pierde
           ninguna fase ni ninguna tarea. */
        otroCronograma ? "border-amber-700/50 bg-amber-900/15" : "border-blue-700/50 bg-blue-900/15",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "text-[11px] font-bold uppercase tracking-wider",
            otroCronograma ? "text-amber-300" : "text-blue-300",
          )}
        >
          {otroCronograma
            ? `La IA propone otro cronograma — ${plural(deltas.length, "cambio", "cambios")}`
            : `La IA sugiere ${plural(deltas.length, "cambio de estructura", "cambios de estructura")}`}
        </span>
        <span className="text-[11px] text-fg-muted">
          del último handoff · las tareas y sus estados no se tocan
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => (otroCronograma ? setConfirmarReemplazo(true) : aceptarTodo())}
            disabled={working}
            className="text-xs font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50 px-3 py-1 rounded-lg transition-colors"
          >
            {working ? "Aplicando…" : otroCronograma ? "Reemplazar todo" : "Aceptar todo"}
          </button>
          <button
            onClick={() => onResolve([], deltas.map((d) => d.key))}
            disabled={working}
            className="text-xs font-medium text-fg-muted hover:text-fg border border-line hover:border-fg-muted rounded-lg px-2.5 py-1 disabled:opacity-50 transition-colors"
          >
            Descartar todo
          </button>
        </div>
      </div>

      {/* ── EL AVISO (Tanda J) ────────────────────────────────────────────────
          Cuando el handoff se regenera con más contexto, el agente puede proponer OTRA
          descomposición del proyecto. La reconciliación empareja fases por posición, así que
          eso llegaba disfrazado de «11 sugerencias sueltas» y nada decía que el plan entero
          había cambiado — ni cuánto se movía la fecha de fin. */}
      {otroCronograma && (
        <div className="space-y-1 pt-0.5">
          <p className="text-[11px] text-fg-secondary leading-relaxed">
            La diferencia es tanta que esto es prácticamente un cronograma nuevo: salió de un
            handoff con más contexto que el que armó el cronograma actual.
          </p>
          <ul className="text-[11px] text-fg-secondary space-y-0.5">
            {magnitud.motivos.map((m) => (
              <li key={m}>· {m}</li>
            ))}
          </ul>
          {corrimiento && (
            <p className="text-[11px] font-semibold text-amber-300">{corrimiento}</p>
          )}
          <p className="text-[11px] text-fg-muted leading-relaxed">
            Aceptar no borra nada: las fases que la IA no volvió a nombrar quedan como están, y
            las tareas y sus estados no se tocan.
          </p>
        </div>
      )}

      {globales.map((d) => (
        <div key={d.key} className="flex flex-wrap items-center gap-2 text-[11px] text-fg-secondary">
          <span className="min-w-0">
            {d.kind === "SET_ANCHOR" ? (
              <>
                Fecha de arranque sugerida: {d.from ?? "sin fecha"} →{" "}
                <span className="font-semibold">{d.to}</span>
              </>
            ) : (
              <>
                Reordenar las fases: <span className="font-semibold">{d.names.join(" → ")}</span>
              </>
            )}
          </span>
          {/* El área de click de un `✓` de texto era el ancho del carácter (~8px): abajo del
              mínimo táctil y sin nombre accesible. Los botones traen su propia caja. */}
          <span className="flex items-center gap-1 flex-shrink-0">
            <AcceptButton
              size="xs"
              aria-label={d.kind === "SET_ANCHOR" ? "Aceptar la fecha de arranque sugerida" : "Aceptar el reordenamiento de fases"}
              title="Aceptar esta sugerencia"
              disabled={working}
              onClick={() => onResolve([d.key], [])}
            />
            <RejectButton
              size="xs"
              aria-label={d.kind === "SET_ANCHOR" ? "Descartar la fecha de arranque sugerida" : "Descartar el reordenamiento de fases"}
              title="Descartar esta sugerencia"
              disabled={working}
              onClick={() => onResolve([], [d.key])}
            />
          </span>
        </div>
      ))}

      {/* Solo si hay cambios que NO están en esta franja: si todo es global, mandar a mirar abajo
          sería mandar a ningún lado. */}
      {globales.length < deltas.length && (
        <p className="text-[11px] text-fg-muted">
          El resto se revisa en las filas de abajo — badges azules en las fases que cambian y filas
          «Fase propuesta» — y se acepta o descarta una por una. El cronograma sigue editable.
        </p>
      )}

      {/* El confirm solo aparece cuando es OTRO cronograma: para un ajuste chico, pedir
          confirmación por 2 sugerencias sería la fricción que enseña a apretar sin leer.
          ⚠ variant="default", NO destructive: el rojo prometería un borrado que no ocurre. */}
      <ConfirmDialog
        open={confirmarReemplazo}
        variant="default"
        title="¿Reemplazar el cronograma con el que propone la IA?"
        confirmLabel="Reemplazar todo"
        loading={working}
        onCancel={() => setConfirmarReemplazo(false)}
        onConfirm={() => {
          setConfirmarReemplazo(false);
          aceptarTodo();
        }}
        description={
          <>
            <span className="block">
              Se aplican {plural(deltas.length, "el cambio", "los cambios")} de una sola vez:{" "}
              {redactarResumenDeCambios(magnitud)}.{corrimiento ? ` ${corrimiento}` : ""}
            </span>
            <span className="block mt-2">
              No se borra ninguna fase ni ninguna tarea: las tareas y sus estados quedan como
              están, y las fases nuevas nacen vacías. Después podés seguir editando el cronograma
              a mano.
            </span>
          </>
        }
      />
    </div>
  );
}
