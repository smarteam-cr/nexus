"use client";

/**
 * components/canvas/DocumentoContextSection.tsx — el «CONTEXTO ADICIONAL» de un documento: diagnóstico
 * (2026-09-28), planificación y ejecución (2026-09-29); kickoff, exploración, integraciones y entrega
 * (2026-10-07), con sus «Instrucciones adicionales» (cada documento las guarda por su lado).
 *
 * Pedido de Elías: «así como el cronograma, cada canvas tenga su espacio para agregar contexto — así
 * queda más claro cuáles sesiones lo están alimentando». El gemelo de CronogramaContextSection, para
 * los documentos de lib/contexto/documento.ts. Dos columnas:
 *   · Reuniones — SOLO LAS ELEGIDAS desde la etapa 7 (DECISIONS «Los documentos leen la memoria y
 *     solo las reuniones elegidas»): la IA lee enteras las que elige una persona, y arriba Nexus
 *     sugiere algunas (las sesiones de la exploración en el diagnóstico, las reuniones con hechos
 *     abiertos) con «Usar» y «Descartar». Sin elegidas, el documento trabaja con la memoria del
 *     proyecto, y la explicación dice qué trae de las demás reuniones (`queLeeSinElegidas`: en los
 *     documentos del cliente, solo los acuerdos de las minutas revisadas; en la entrega, el impacto
 *     sale vacío). La X deja de elegirla: no hay «Excluidas». (Hasta la etapa 7 arrancaba SUGERIDO: toda
 *     reunión del proyecto con el cliente alimentaba.)
 *   · Fuentes manuales — notas pegadas a mano (lo que no quedó en ninguna reunión).
 *   · Instrucciones adicionales — lo que el CSE le pide a la IA de ESTE documento (InstruccionesDelDocumento).
 * Lo que esta sección muestra es exactamente lo que lee el runner: la misma regla
 * (lib/sessions/destinos-de-contexto.ts) y el mismo chokepoint.
 *
 * ⚠ Vive FUERA del envoltorio `.stl` del documento: el documento se pinta con la paleta de marca del
 * cliente, y esta sección es del equipo — con los tokens del tema de Nexus. Desde el 2026-10-05 la
 * monta el panel del proyecto ARRIBA del marco «El documento» (ProjectCanvasPanel), no el documento:
 * adentro del marco quedaba cerrada debajo de «así lo ve el cliente» y nadie la encontraba.
 */
import { useCallback, useState } from "react";
import SessionSelectionReview from "@/components/clients/SessionSelectionReview";
import FuentesManualesColumn from "@/components/clients/FuentesManualesColumn";
import { ContextColumn, CTX_ICONS } from "@/components/clients/context-column";
import ContextoAdicional from "@/components/contexto/ContextoAdicional";
import InstruccionesDelDocumento from "@/components/contexto/InstruccionesDelDocumento";
import {
  MAX_ELEGIDAS_A_LEER,
  MAX_ELEGIDAS_ENTERAS,
  TOPE_NOTAS_DEL_DOCUMENTO,
  queLeeSinElegidas,
  type DocumentoConContexto,
} from "@/lib/contexto/documento";

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
  const [sugeridas, setSugeridasState] = useState(0);
  const [notas, setNotasState] = useState(0);
  const [reunionesIlegibles, setReunionesIlegibles] = useState(false);
  const [instruccionesActivas, setInstruccionesActivasState] = useState(false);
  const setInstruccionesActivas = useCallback((v: boolean) => setInstruccionesActivasState(v), []);
  const setReuniones = useCallback((n: number) => setReunionesState((c) => (c === n ? c : n)), []);
  const setSugeridas = useCallback((n: number) => setSugeridasState((c) => (c === n ? c : n)), []);
  const setNotas = useCallback((n: number) => setNotasState((c) => (c === n ? c : n)), []);

  return (
    <ContextoAdicional
      abierto={abierto}
      onAlternar={() => setOverride(!abierto)}
      /* Cerrada se sigue leyendo con qué se va a generar. */
      resumen={
        <>
          {reunionesIlegibles
            ? "no se pudieron cargar las reuniones"
            : reuniones > MAX_ELEGIDAS_A_LEER
              ? `lee ${MAX_ELEGIDAS_A_LEER} de ${reuniones} elegidas`
              : `${reuniones} ${reuniones === 1 ? "elegida" : "elegidas"}`}
          {!reunionesIlegibles && sugeridas > 0 ? ` · ${sugeridas} ${sugeridas === 1 ? "sugerida" : "sugeridas"}` : ""}{" "}
          · {notas} {notas === 1 ? "fuente manual" : "fuentes manuales"}
          {instruccionesActivas ? " · instrucciones activas" : ""}
        </>
      }
      explicacion={
        <>
          Con esto —más la memoria del proyecto— la IA {doc.laIa}. Lee{" "}
          <span className="font-medium text-fg-secondary">enteras las reuniones que elijas</span> (hasta{" "}
          {MAX_ELEGIDAS_ENTERAS}, las más recientes; las siguientes, en resumen, y pasadas las {MAX_ELEGIDAS_A_LEER} no
          entran), y Nexus te sugiere algunas arriba. {queLeeSinElegidas(doc)} Sacar una de acá no la saca de los otros
          documentos ni del proyecto.
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Reuniones" count={reuniones}>
          <SessionSelectionReview
            projectId={projectId}
            destino={doc.destino}
            columnMode
            onCount={setReuniones}
            onSugeridas={setSugeridas}
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
            adjunto={{ projectId, origen: doc.pieza }}
          />
        </ContextColumn>
      </div>
      <InstruccionesDelDocumento
        projectId={projectId}
        slug={doc.pieza}
        elDocumento={doc.elDocumento}
        ejemplo={doc.ejemplo}
        soloLectura={!canEdit}
        onActivas={setInstruccionesActivas}
      />
    </ContextoAdicional>
  );
}
