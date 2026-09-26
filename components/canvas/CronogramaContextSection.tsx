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
 * cambio con IA» (puede tocar fases, solo lo que se le pide); las notas, también el avance. El
 * avance NO depende de lo elegido: lee solo las reuniones recientes del proyecto. El 💬 Asistente
 * del cronograma también lo lee (con su propio espacio, decisión de Elías del 2026-09-23). ⚠ El
 * handoff (que arma las fases) no lo lee.
 *
 * ⚠ Archivo aparte a propósito: CronogramaCanvas.tsx está al tope del trinquete de grises, y lo
 * nuevo nace con tokens del tema.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import SessionSelectionReview from "@/components/clients/SessionSelectionReview";
import FuentesManualesColumn from "@/components/clients/FuentesManualesColumn";
import { ContextColumn, CTX_ICONS } from "@/components/clients/context-column";
import {
  TOPE_NOTAS_CRONOGRAMA,
  largoDeLasNotas,
  parentesisDelMaterial,
  resumenDelInforme,
  type InformeDelMaterial,
} from "@/lib/contexto/material-cronograma";
import { hayMaterialParaElPaso1 } from "@/lib/timeline/propuesta-de-estructura";

export default function CronogramaContextSection({
  projectId,
  canEdit,
  generado,
  instruccionesActivas,
  children,
  onMaterial,
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
  /**
   * Avisa si hay material que la revisión de fases va a leer (`hayMaterialParaElPaso1`): con eso la
   * pantalla decide si dice «Paso 1 de 2 · Revisando fases y tiempos con tus reuniones, notas e
   * instrucciones».
   */
  onMaterial?: (hay: boolean) => void;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  const abierto = override ?? !generado;

  const [reuniones, setReunionesState] = useState(0);
  const [notas, setNotasState] = useState(0);
  /* La lista de reuniones elegidas no se pudo cargar: no se afirma que hay 0 (revisión adversarial,
     2026-09-24). La línea cerrada lo dice y el paso 1 no se rotula como «sin material»: la ruta sí
     las lee. */
  const [reunionesIlegibles, setReunionesIlegibles] = useState(false);
  const setReuniones = useCallback((n: number) => setReunionesState((c) => (c === n ? c : n)), []);
  const setNotas = useCallback((n: number) => setNotasState((c) => (c === n ? c : n)), []);

  /* QUÉ LE LLEGA A LA IA (2026-09-23): el informe del MISMO cargador que usan los agentes. Se
     vuelve a pedir cada vez que se elige o se saca una reunión (`version`). Sin reuniones no hay
     nada que informar; si falla, queda en null y las insignias vuelven a las de siempre. */
  const [informe, setInforme] = useState<InformeDelMaterial | null>(null);
  const [version, setVersion] = useState(0);
  const hayReuniones = reuniones > 0;
  useEffect(() => {
    if (!hayReuniones) return;
    const ctrl = new AbortController();
    fetch(`/api/projects/${projectId}/timeline/material`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<InformeDelMaterial>) : null))
      .then((d) => {
        if (!ctrl.signal.aborted) setInforme(d && Array.isArray(d.reuniones) ? d : null);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setInforme(null);
      });
    return () => ctrl.abort();
  }, [projectId, version, hayReuniones]);
  // Sin reuniones elegidas, un informe viejo no se muestra (se deriva: nada de limpiarlo a mano).
  const informeVivo = hayReuniones ? informe : null;
  const loQueNoEntra = informeVivo ? parentesisDelMaterial(resumenDelInforme(informeVivo)) : "";
  /* Lo mismo que mira la ruta del paso 1, con lo que esta sección ya tiene: la pantalla no promete
     «revisando tus reuniones, notas e instrucciones» si no hay nada que revisar. Las instrucciones
     adicionales cuentan (son la fuente de más peso). */
  const hayMaterial = hayMaterialParaElPaso1({
    reuniones: reunionesIlegibles ? Math.max(reuniones, 1) : reuniones,
    notas,
    informe: informeVivo,
    instrucciones: instruccionesActivas,
  });
  useEffect(() => {
    onMaterial?.(hayMaterial);
  }, [hayMaterial, onMaterial]);

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
        {/* Cerrada se sigue leyendo con qué se va a generar: sin abrirla, sabes si la IA va a leer
            reuniones, notas o instrucciones, y si alguna reunión no le llega entera. */}
        <span className="text-[11px] text-fg-muted truncate">
          {reunionesIlegibles
            ? "no se pudieron cargar las reuniones elegidas"
            : `${reuniones} ${reuniones === 1 ? "reunión elegida" : "reuniones elegidas"}`}
          {loQueNoEntra ? ` (${loQueNoEntra})` : ""} · {notas} nota
          {notas === 1 ? "" : "s"}
          {instruccionesActivas ? " · instrucciones activas" : ""}
        </span>
        <span className="ml-auto text-[11px] text-fg-muted flex-shrink-0">{abierto ? "Colapsar" : "Expandir"}</span>
      </button>

      {/* Siempre montado: los contadores de la línea cerrada salen de las columnas. Se oculta con
          `hidden` para no desmontar ni volver a pedir todo al abrir y cerrar. */}
      <div className={abierto ? "px-4 pb-3 space-y-3" : "hidden"}>
        <p className="text-[11px] text-fg-muted leading-relaxed">
          Con esto —y con las instrucciones adicionales de abajo— la IA revisa las fases y sus tiempos
          al «Regenerar todo el cronograma» (tú revisas la propuesta y decides qué se aplica), arma las tareas de
          cada fase, decide cuáles son reuniones con el cliente, y el asistente lo lee cuando le pides un
          cambio. Entran{" "}
          <span className="font-medium text-fg-secondary">solo las reuniones que elijas</span>:
          búscalas entre las del proyecto o en tu calendario. Cada una entra con su resumen completo
          mientras quepa; si eliges muchas, se reparten el espacio. Sacarla de acá no la saca del
          handoff ni del proyecto.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Google Meet" count={reuniones}>
            <SessionSelectionReview
              projectId={projectId}
              destino="cronograma"
              columnMode
              onCount={setReuniones}
              onErrorDeCarga={setReunionesIlegibles}
              onChange={() => setVersion((v) => v + 1)}
              materialDelCronograma={informeVivo}
              readOnly={!canEdit}
            />
          </ContextColumn>
          <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Fuentes manuales" count={notas}>
            <FuentesManualesColumn
              endpoint={`/api/projects/${projectId}/timeline/sources`}
              canEdit={canEdit}
              onCount={setNotas}
              tope={TOPE_NOTAS_CRONOGRAMA}
              largoQueLee={largoDeLasNotas}
              vacio="Sin notas. Pega aquí lo que no quedó en ninguna reunión."
              placeholderTitulo="Título, con la fecha si son notas de una reunión (ej. Reunión del 1 ago)"
              placeholder="Pega la nota, el resumen o la decisión…"
              etiquetaAgregar="Agregar nota"
            />
          </ContextColumn>
        </div>
        {children}
      </div>
    </div>
  );
}
