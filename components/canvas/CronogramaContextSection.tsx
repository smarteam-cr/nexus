"use client";

/**
 * components/canvas/CronogramaContextSection.tsx — «CONTEXTO DEL CRONOGRAMA» (2026-09-23).
 *
 * El gemelo de la sección «Contexto» del handoff (`components/clients/ProjectContextSection.tsx`),
 * para el CRONOGRAMA y sin la columna de HubSpot (pedido de Elías). Dos columnas:
 *   · Google Meet — SOLO las reuniones que el CSE eligió (segunda versión, 2026-09-23: la primera
 *     metía todas las del proyecto y eran 61 de golpe). «Buscar sesiones» ofrece las del proyecto y
 *     las del calendario de quien busca; la X deja de elegirla.
 *   · Fuentes manuales — notas pegadas a mano (una decisión que no quedó en ninguna reunión).
 * Abajo, a todo el ancho, las «Instrucciones adicionales» que ya existían: llegan como `children`
 * porque su JSX tiene que seguir escrito en CronogramaCanvas.tsx (lo exige proposal-deltas.test.ts).
 *
 * Las reuniones elegidas las leen el detalle (tareas por semana y cuáles son reuniones) y «Pedir
 * cambio con IA» (el único que toca fases); las notas, también el avance. El avance NO depende de lo
 * elegido: lee solo las reuniones recientes del proyecto. Todo sigue terminando en propuesta.
 *
 * ⚠ Archivo aparte a propósito: CronogramaCanvas.tsx está al tope del trinquete de grises, y lo
 * nuevo nace con tokens del tema.
 */
import { useCallback, useState, type ReactNode } from "react";
import SessionSelectionReview from "@/components/clients/SessionSelectionReview";
import FuentesManualesColumn from "@/components/clients/FuentesManualesColumn";
import { ContextColumn, CTX_ICONS } from "@/components/clients/context-column";
import { TOPE_NOTAS_CRONOGRAMA, notasPasanElTope } from "@/lib/contexto/material-cronograma";

export default function CronogramaContextSection({
  projectId,
  canEdit,
  generado,
  instruccionesActivas,
  children,
}: {
  projectId: string;
  canEdit: boolean;
  /**
   * ¿El cronograma ya tiene detalle de IA? Sin detalle arranca ABIERTA (es el momento de curar el
   * material antes de generar); con detalle, cerrada — el toggle manual manda.
   */
  generado: boolean;
  /** Para el resumen de la línea cerrada: si hay instrucciones guardadas. */
  instruccionesActivas: boolean;
  /** La caja de «Instrucciones adicionales», tal cual vive en CronogramaCanvas. */
  children?: ReactNode;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  const abierto = override ?? !generado;

  const [reuniones, setReunionesState] = useState(0);
  const [notas, setNotasState] = useState(0);
  const setReuniones = useCallback((n: number) => setReunionesState((c) => (c === n ? c : n)), []);
  const setNotas = useCallback((n: number) => setNotasState((c) => (c === n ? c : n)), []);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        onClick={() => setOverride(!abierto)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-hover transition-colors text-left rounded-xl"
      >
        <svg
          className={`w-3.5 h-3.5 text-fg-secondary flex-shrink-0 transition-transform ${abierto ? "" : "-rotate-90"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-xs font-semibold text-fg">Contexto del cronograma</span>
        {/* Cerrada se sigue leyendo con qué se va a generar: sin abrirla, sabés si la IA va a leer
            reuniones, notas o instrucciones. */}
        <span className="text-[11px] text-fg-muted truncate">
          {reuniones} {reuniones === 1 ? "reunión elegida" : "reuniones elegidas"} · {notas} nota
          {notas === 1 ? "" : "s"}
          {instruccionesActivas ? " · instrucciones activas" : ""}
        </span>
        <span className="ml-auto text-[11px] text-fg-muted flex-shrink-0">{abierto ? "Colapsar" : "Expandir"}</span>
      </button>

      {/* Siempre montado: los contadores de la línea cerrada salen de las columnas. Se oculta con
          `hidden` para no desmontar ni volver a pedir todo al abrir y cerrar. */}
      <div className={abierto ? "px-4 pb-3 space-y-3" : "hidden"}>
        <p className="text-[11px] text-fg-muted leading-relaxed">
          Con esto la IA arma las tareas de cada fase, decide cuáles son reuniones con el cliente y
          propone cambios de fases desde «Pedir cambio con IA». Entran{" "}
          <span className="font-medium text-fg-secondary">solo las reuniones que elijas</span>:
          buscalas entre las del proyecto o en tu calendario. Sacarla de acá no la saca del handoff
          ni del proyecto.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Google Meet" count={reuniones}>
            <SessionSelectionReview
              projectId={projectId}
              destino="cronograma"
              columnMode
              onCount={setReuniones}
              readOnly={!canEdit}
            />
          </ContextColumn>
          <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Fuentes manuales" count={notas}>
            <FuentesManualesColumn
              endpoint={`/api/projects/${projectId}/timeline/sources`}
              canEdit={canEdit}
              onCount={setNotas}
              tope={TOPE_NOTAS_CRONOGRAMA}
              excedeElTope={notasPasanElTope}
              vacio="Sin notas. Pegá acá lo que no quedó en ninguna reunión."
              placeholderTitulo="Título (ej. Cambio de prioridades)"
              placeholder="Pegá la nota, el resumen o la decisión…"
              etiquetaAgregar="Agregar nota"
            />
          </ContextColumn>
        </div>
        {children}
      </div>
    </div>
  );
}
