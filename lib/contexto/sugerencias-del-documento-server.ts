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
import { clasesDeTextoDeLasReuniones } from "@/lib/sessions/clase-de-texto-server";
import { equiposDeLasReuniones } from "@/lib/sessions/equipo-de-la-reunion-server";
import { EQUIPOS, EQUIPOS_DEL_CLIENTE, type ClaveDeEquipo } from "@/lib/exploraciones/equipos";
import type { EquipoParaElDiagnostico } from "@/lib/canvas/diagnostico-por-equipo";

/** Los equipos del cliente, en su orden, como los lee el documento de diagnóstico (nombre y área de la escala). */
export const EQUIPOS_PARA_EL_DIAGNOSTICO: readonly EquipoParaElDiagnostico[] = EQUIPOS_DEL_CLIENTE.map((clave) => ({
  clave,
  nombre: EQUIPOS[clave].nombre,
  area: EQUIPOS[clave].area,
}));
const PARA_EL_DIAGNOSTICO = new Map(EQUIPOS_PARA_EL_DIAGNOSTICO.map((e) => [e.clave, e]));
import { getSessionCategories } from "@/lib/cache/session-categories";
import { sesionesDeLaExploracionDelProyecto } from "@/lib/exploraciones/del-proyecto";
import { novedadesDelProyecto } from "@/lib/seguimiento/novedades-server";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { COLUMNA_DEL_DESTINO, esSoloElegidas, type DestinoDeContexto } from "@/lib/sessions/destinos-de-contexto";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { documentoDelDestino } from "./documento";
import {
  FUENTES_QUE_ENTRAN_SOLAS,
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
  /**
   * Solo en el diagnóstico (L5, 2026-10-25): el equipo del cliente de la reunión. De una sesión de la exploración, el de
   * su sesión (se cambia allá); de una reunión del proyecto, el que se eligió en el Contexto. null = sin equipo.
   */
  equipo?: ClaveDeEquipo | null;
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
  // En el diagnóstico, la clase de texto de las que nadie tocó todavía (las que pueden entrar solas).
  const clases = conExploracion
    ? await seguro("la clase de texto", () => clasesDeTextoDeLasReuniones(reuniones.filter((r) => r.afinado === null).map((r) => r.id)), undefined)
    : undefined;
  const sugeridas = sugerenciasDelDocumento(destino, {
    reuniones,
    sesionesDeLaExploracion: sesiones,
    dominiosPropios: categorias ? buildInternalDomainsSet(categorias) : undefined,
    reglaVieja: categorias !== null,
    hechos,
    clasesDeTexto: clases,
    ahora: ahora.getTime(),
  });
  /* El equipo del cliente de las que entran solas (L5, 2026-10-25): de la sesión de la exploración, o el elegido en el
     Contexto para las demás reuniones del proyecto. Sin la columna todavía, sin equipo. */
  const equipos = conExploracion
    ? await seguro("los equipos", () => equiposDelDiagnostico(projectId, sugeridas.map((s) => s.sessionId), sesiones, reuniones, ahora, categorias), new Map<string, ClaveDeEquipo>())
    : new Map<string, ClaveDeEquipo>();
  return sugeridas.flatMap((s) => {
    const r = porId.get(s.sessionId);
    if (!r) return [];
    const fila: SugerenciaParaElPanel = { ...s, titulo: r.titulo, fecha: r.fecha, participantes: [...r.participantes] };
    if (conExploracion && FUENTES_QUE_ENTRAN_SOLAS.includes(s.fuente)) fila.equipo = equipos.get(s.sessionId) ?? null;
    return [fila];
  });
}

/**
 * El equipo del cliente de estas reuniones del proyecto (L5, 2026-10-25): el de su sesión de la exploración si es una
 * (manda: se eligió para esa sesión), o el que se eligió en el Contexto del diagnóstico para las demás.
 */
async function equiposDelDiagnostico(
  projectId: string,
  ids: readonly string[],
  sesiones: Awaited<ReturnType<typeof sesionesDeLaExploracionDelProyecto>>,
  reuniones: ReadonlyArray<{ id: string; titulo: string; fecha: number; participantes: readonly string[] }>,
  ahora: Date,
  categorias: Awaited<ReturnType<typeof getSessionCategories>> | null,
): Promise<Map<string, ClaveDeEquipo>> {
  const out = new Map<string, ClaveDeEquipo>();
  for (const r of reunionesDeLasSesiones(sesiones, reuniones, ahora.getTime(), categorias ? buildInternalDomainsSet(categorias) : undefined)) {
    if (r.equipo) out.set(r.sessionId, r.equipo);
  }
  const sinSesion = ids.filter((id) => !out.has(id));
  for (const [id, equipo] of await equiposDeLasReuniones(projectId, sinSesion)) out.set(id, equipo);
  return out;
}

/**
 * EL EQUIPO DE LAS REUNIONES ELEGIDAS A MANO en el Contexto del diagnóstico (noche 2, pieza 1, 2026-10-27). Hasta acá el
 * selector solo aparecía en las que entran solas; una elegida a mano entraba sin equipo aunque el diagnóstico la leyera
 * por equipo. `deLaSesion`: el equipo sale de su sesión de la exploración y se cambia allá (no acá). Vacío si falla.
 */
export async function equiposDeLasElegidasDelDiagnostico(
  projectId: string,
  ids: readonly string[],
  ahora: Date = new Date(),
): Promise<Map<string, { equipo: ClaveDeEquipo | null; deLaSesion: boolean }>> {
  if (!ids.length) return new Map();
  const [miembros, sesiones, categorias] = await Promise.all([
    getProjectMemberSessions(projectId),
    seguro("la exploración", () => sesionesDeLaExploracionDelProyecto(projectId), []),
    seguro("las categorías", () => getSessionCategories(), null),
  ]);
  const reuniones = miembros.sessions.map((s) => ({ id: s.id, titulo: s.title, fecha: s.date, participantes: s.participants }));
  const deLaSesion = new Map<string, ClaveDeEquipo>();
  for (const r of reunionesDeLasSesiones(sesiones, reuniones, ahora.getTime(), categorias ? buildInternalDomainsSet(categorias) : undefined)) {
    if (r.equipo) deLaSesion.set(r.sessionId, r.equipo);
  }
  const resto = ids.filter((id) => !deLaSesion.has(id));
  const delVinculo = await seguro("los equipos", () => equiposDeLasReuniones(projectId, resto), new Map<string, ClaveDeEquipo>());
  return new Map(ids.map((id) => [id, deLaSesion.has(id) ? { equipo: deLaSesion.get(id)!, deLaSesion: true } : { equipo: delVinculo.get(id) ?? null, deLaSesion: false }]));
}

/**
 * EL EQUIPO DE CADA REUNIÓN DEL PROYECTO, para que el documento de diagnóstico lea por equipo (L5 etapa 1). Las reuniones
 * salen de la membresía (el chokepoint); el equipo, de la sesión de la exploración o del Contexto. Vacío si falla.
 */
export async function equiposDeLasReunionesDelDiagnostico(
  projectId: string,
  ahora: Date = new Date(),
): Promise<Map<string, EquipoParaElDiagnostico>> {
  const [miembros, sesiones, categorias] = await Promise.all([
    getProjectMemberSessions(projectId),
    seguro("la exploración", () => sesionesDeLaExploracionDelProyecto(projectId), []),
    seguro("las categorías", () => getSessionCategories(), null),
  ]);
  const reuniones = miembros.sessions.map((s) => ({ id: s.id, titulo: s.title, fecha: s.date, participantes: s.participants }));
  const claves = await seguro(
    "los equipos",
    () => equiposDelDiagnostico(projectId, reuniones.map((r) => r.id), sesiones, reuniones, ahora, categorias),
    new Map<string, ClaveDeEquipo>(),
  );
  return new Map([...claves].flatMap(([id, clave]) => (PARA_EL_DIAGNOSTICO.has(clave) ? [[id, PARA_EL_DIAGNOSTICO.get(clave)!] as const] : [])));
}

/**
 * LAS REUNIONES QUE ENTRAN SOLAS AL DIAGNÓSTICO, sin que nadie las elija en su Contexto:
 *  · las de las sesiones de la exploración (2026-10-23, DECISIONS «El Diagnóstico: todo el contexto…»): una reunión unida
 *    a una sesión —a mano o por su evento del calendario— ya la eligió una persona (`reunionesDeLasSesiones`);
 *  · desde el 2026-10-24 (L1 etapa 2), todas las demás reuniones del proyecto que dejaron texto, transcripción o notas de
 *    Gemini (el predicado único, lib/sessions/tiene-texto.ts).
 * Las dos salen de la MISMA regla que pinta el panel (`sugerenciasParaElDocumento`, fuentes `exploracion` y `proyecto`) y
 * de la membresía del proyecto por el chokepoint. Las desestimadas en el Contexto (`false`, «Sacar») no entran; las
 * elegidas (`true`) ya entran por su lado. Devuelve ids; el material las lee con las elegidas, las 6 más recientes enteras
 * y las demás en resumen (lib/contexto/material-del-documento.ts).
 */
export async function reunionesQueEntranSolasAlDiagnostico(projectId: string, ahora: Date = new Date()): Promise<string[]> {
  return (await reunionesQueEntranSolasPorFuente(projectId, ahora)).todas;
}

/** Las mismas, separadas: las de las sesiones de la exploración van primero para leerse enteras (el material). */
export async function reunionesQueEntranSolasPorFuente(
  projectId: string,
  ahora: Date = new Date(),
): Promise<{ todas: string[]; deLaExploracion: string[] }> {
  const solas = (await sugerenciasParaElDocumento(projectId, "diagnostico", ahora)).filter((s) => FUENTES_QUE_ENTRAN_SOLAS.includes(s.fuente));
  return {
    todas: solas.map((s) => s.sessionId),
    deLaExploracion: solas.filter((s) => s.fuente === "exploracion").map((s) => s.sessionId),
  };
}
