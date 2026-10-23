/**
 * lib/contexto/sugerencias-del-documento-server.ts — arma la entrada de las SUGERENCIAS de un documento y la resuelve
 * (etapa 7; DECISIONS «Los documentos leen la memoria y solo las reuniones elegidas»). SERVIDOR.
 *
 * La regla vive en lib/contexto/sugerencias-del-documento.ts (pura, con test). Acá solo se juntan las tres fuentes,
 * una consulta por fuente, y cada una falla sola (sin sugerencias el panel funciona igual: nunca lo rompe):
 *  · la membresía del proyecto, por el chokepoint (`getProjectMemberSessions`): de ahí sale TODO lo que se puede
 *    sugerir, así una reunión de otro cliente no aparece nunca;
 *  · en el diagnóstico, las sesiones de la exploración viva del proyecto, por su puerta
 *    (`sesionesDeLaExploracionDelProyecto`, lib/exploraciones/del-proyecto.ts: solo las sesiones, nada de su contenido);
 *  · los hechos abiertos que el registro de destinos rutea a la pieza, por `novedadesDelProyecto`
 *    (lib/seguimiento/novedades-server.ts): sin la bandera `SEGUIMIENTO_HECHOS` o sin el SQL, no hay ninguno;
 *  · las categorías de sesión (los dominios de Smarteam): con ellas se sabe qué reunión fue con el cliente, para la
 *    sugerencia de la regla vieja («Reunión con el cliente en este proyecto», en todos los documentos) y para numerar
 *    las sesiones de la exploración. Sin ellas, la regla vieja no sugiere nada (no se adivina la sala).
 *
 * ⛔ NUNCA ESCRIBE. «Usar» y «Descartar» son clics de una persona y van por la puerta del documento
 * (POST .../contexto/[pieza]/sessions). Una sugerencia que escribiera `true` le pondría el candado humano a un vínculo
 * que nadie eligió (lib/sessions/session-project-locks.ts).
 */
import "server-only";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { sesionesDeLaExploracionDelProyecto } from "@/lib/exploraciones/del-proyecto";
import { novedadesDelProyecto } from "@/lib/seguimiento/novedades-server";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { COLUMNA_DEL_DESTINO, esSoloElegidas, type DestinoDeContexto } from "@/lib/sessions/destinos-de-contexto";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { documentoDelDestino } from "./documento";
import {
  reunionesDeLasSesiones,
  sugerenciasDelDocumento,
  type HechoQueSugiere,
  type SugerenciaDeReunion,
} from "./sugerencias-del-documento";

/** Una sugerencia con lo que el panel necesita para pintar la fila. */
export interface SugerenciaParaElPanel extends SugerenciaDeReunion {
  titulo: string;
  /** ms. */
  fecha: number;
  participantes: string[];
}

/** Una fuente que falla no tumba a las otras: sin ella, menos sugerencias. */
async function seguro<T>(fuente: string, fn: () => Promise<T>, respaldo: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!esquemaDesactualizado(e)) {
      console.warn(`[sugerencias-del-documento] ${fuente} falló (no bloqueante):`, e instanceof Error ? e.message : e);
    }
    return respaldo;
  }
}

/** Los hechos abiertos ruteados a la pieza, el más reciente primero (vacío sin la bandera o sin el SQL). */
async function hechosDeLaPieza(projectId: string, pieza: string, ahora: Date): Promise<HechoQueSugiere[]> {
  // `piezasConContenido` con la pieza sola: la sugerencia vale también para un documento que todavía no se generó.
  const n = await novedadesDelProyecto(projectId, { piezasConContenido: [pieza], ahora });
  if (!n.activas) return [];
  return (n.porPieza[pieza]?.items ?? []).map((i) => ({ sessionId: i.reunion.id, frase: i.frase }));
}

/**
 * Las reuniones que Nexus sugiere para el documento del destino, con su título, fecha y quiénes estuvieron. [] fuera
 * de los seis documentos que leen solo las elegidas.
 */
export async function sugerenciasParaElDocumento(
  projectId: string,
  destino: DestinoDeContexto,
  ahora: Date = new Date(),
): Promise<SugerenciaParaElPanel[]> {
  if (!esSoloElegidas(destino)) return [];
  const doc = documentoDelDestino(destino);
  if (!doc) return [];
  const columna = COLUMNA_DEL_DESTINO[destino];
  const conExploracion = destino === "diagnostico";

  const [miembros, sesiones, hechos, categorias] = await Promise.all([
    getProjectMemberSessions(projectId),
    conExploracion ? seguro("la exploración", () => sesionesDeLaExploracionDelProyecto(projectId), []) : Promise.resolve([]),
    seguro("los hechos", () => hechosDeLaPieza(projectId, doc.pieza, ahora), []),
    seguro("las categorías", () => getSessionCategories(), null),
  ]);

  const reuniones = miembros.sessions.map((s) => ({
    id: s.id,
    titulo: s.title,
    fecha: s.date,
    participantes: s.participants,
    afinado: s[columna],
  }));
  const porId = new Map(reuniones.map((r) => [r.id, r]));
  const sugeridas = sugerenciasDelDocumento(destino, {
    reuniones,
    sesionesDeLaExploracion: sesiones,
    dominiosPropios: categorias ? buildInternalDomainsSet(categorias) : undefined,
    reglaVieja: categorias !== null,
    hechos,
    ahora: ahora.getTime(),
  });
  return sugeridas.flatMap((s) => {
    const r = porId.get(s.sessionId);
    return r ? [{ ...s, titulo: r.titulo, fecha: r.fecha, participantes: [...r.participantes] }] : [];
  });
}

/**
 * LAS REUNIONES DE LAS SESIONES DE LA EXPLORACIÓN, que entran SOLAS al diagnóstico (2026-10-23, DECISIONS «El Diagnóstico:
 * todo el contexto…»). Una reunión unida a una sesión —a mano o por su evento del calendario— ya la eligió una persona:
 * es la misma regla que la sugerencia «Sesión N de la exploración» (`reunionesDeLasSesiones`), y salen de la membresía
 * del proyecto por el chokepoint. Las desestimadas en el Contexto del diagnóstico (`false`, «Descartar») no entran.
 * Devuelve ids; el material las lee enteras con las elegidas (lib/contexto/material-del-documento.ts). [] sin exploración.
 */
export async function reunionesDeLaExploracionDelDiagnostico(projectId: string, ahora: Date = new Date()): Promise<string[]> {
  const columna = COLUMNA_DEL_DESTINO.diagnostico;
  const sesiones = await seguro("la exploración", () => sesionesDeLaExploracionDelProyecto(projectId), []);
  if (!sesiones.length) return [];
  const [miembros, categorias] = await Promise.all([
    getProjectMemberSessions(projectId),
    seguro("las categorías", () => getSessionCategories(), null),
  ]);
  const reuniones = miembros.sessions
    .filter((s) => s[columna] !== false)
    .map((s) => ({ id: s.id, titulo: s.title, fecha: s.date, participantes: s.participants }));
  return reunionesDeLasSesiones(sesiones, reuniones, ahora.getTime(), categorias ? buildInternalDomainsSet(categorias) : undefined).map(
    (r) => r.sessionId,
  );
}
