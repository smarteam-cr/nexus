"use client";

/**
 * components/canvas/DocumentoContextSection.tsx — «CONTEXTO DEL DIAGNÓSTICO» (2026-09-28).
 *
 * Pedido de Elías: «así como el cronograma, cada canvas tenga su espacio para agregar contexto — así
 * queda más claro cuáles sesiones lo están alimentando». El gemelo de CronogramaContextSection, para
 * los documentos de lib/contexto/documento.ts (hoy, el diagnóstico). Dos columnas:
 *   · Google Meet — arranca SUGERIDO: toda reunión del proyecto con el cliente ya alimenta, y el CSE
 *     saca las que no sirven (quedan «Excluida», con «Incluir» para volver) o busca otras.
 *   · Fuentes manuales — notas pegadas a mano (lo que no quedó en ninguna reunión).
 * Lo que esta sección muestra es exactamente lo que lee el runner: la misma regla
 * (lib/sessions/destinos-de-contexto.ts) y el mismo chokepoint.
 *
 * ⚠ Vive FUERA del envoltorio `.stl` del documento: el documento se pinta con la paleta de marca del
 * cliente, y esta sección es del equipo — con los tokens del tema de Nexus.
 */
import { useCallback, useState } from "react";
import SessionSelectionReview from "@/components/clients/SessionSelectionReview";
import FuentesManualesColumn from "@/components/clients/FuentesManualesColumn";
import { ContextColumn, CTX_ICONS } from "@/components/clients/context-column";
import { TOPE_NOTAS_DEL_DOCUMENTO, type DocumentoConContexto } from "@/lib/contexto/documento";

export default function DocumentoContextSection({
  projectId,
  doc,
  generado,
  canEdit = true,
}: {
  projectId: string;
  doc: DocumentoConContexto;
  /** Sin generar arranca ABIERTA (es el momento de curar antes de generar); generado, cerrada. */
  generado: boolean;
  canEdit?: boolean;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  const abierto = override ?? !generado;
  const [reuniones, setReunionesState] = useState(0);
  const [notas, setNotasState] = useState(0);
  const [reunionesIlegibles, setReunionesIlegibles] = useState(false);
  const setReuniones = useCallback((n: number) => setReunionesState((c) => (c === n ? c : n)), []);
  const setNotas = useCallback((n: number) => setNotasState((c) => (c === n ? c : n)), []);

  return (
    <div className="rounded-xl border border-line bg-surface mx-4 mt-3">
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
        <span className="text-xs font-semibold text-fg">Contexto del {doc.nombre}</span>
        {/* Cerrada se sigue leyendo con qué se va a generar. */}
        <span className="text-[11px] text-fg-muted truncate">
          {reunionesIlegibles
            ? "no se pudieron cargar las reuniones"
            : `${reuniones} ${reuniones === 1 ? "reunión lo alimenta" : "reuniones lo alimentan"}`}{" "}
          · {notas} nota{notas === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-[11px] text-fg-muted flex-shrink-0">{abierto ? "Colapsar" : "Expandir"}</span>
      </button>

      {/* Siempre montado: los contadores de la línea cerrada salen de las columnas. */}
      <div className={abierto ? "px-4 pb-3 space-y-3" : "hidden"}>
        <p className="text-[11px] text-fg-muted leading-relaxed">
          Con esto —más las respuestas a la encuesta, la ficha del cliente, lo que se conversó al vender y la
          exploración— la IA escribe el {doc.nombre}. Arranca con{" "}
          <span className="font-medium text-fg-secondary">todas las reuniones del proyecto con el cliente</span>: saca
          las que no sirven y busca las que falten. Si son muchas, se reparten el espacio. Sacarla de acá no la saca
          del handoff, del cronograma ni del proyecto.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Google Meet" count={reuniones}>
            <SessionSelectionReview
              projectId={projectId}
              destino={doc.destino}
              columnMode
              onCount={setReuniones}
              onErrorDeCarga={setReunionesIlegibles}
              readOnly={!canEdit}
            />
          </ContextColumn>
          <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Fuentes manuales" count={notas}>
            <FuentesManualesColumn
              endpoint={`/api/projects/${projectId}/contexto/${doc.pieza}/notas`}
              canEdit={canEdit}
              onCount={setNotas}
              tope={TOPE_NOTAS_DEL_DOCUMENTO}
              vacio="Sin notas. Pega aquí lo que no quedó en ninguna reunión."
              placeholderTitulo="Título, con la fecha si son notas de una reunión (ej. Reunión del 1 sept)"
              placeholder="Pega la nota, el correo o la decisión…"
              etiquetaAgregar="Agregar nota"
            />
          </ContextColumn>
        </div>
      </div>
    </div>
  );
}
