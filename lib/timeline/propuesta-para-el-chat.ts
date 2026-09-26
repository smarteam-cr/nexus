/**
 * lib/timeline/propuesta-para-el-chat.ts — LA PROPUESTA ABIERTA DEL CRONOGRAMA, COMO LA LEE EL CHAT (E3 P4).
 * SERVER-ONLY: lee la base (`leerPropuestaParaElChat`). El resto es puro.
 *
 * Con una propuesta abierta, el chat conversa sobre ELLA y no sobre el cronograma de hoy: lo que se ve
 * arriba del Gantt, con los mismos números que la barra (`resumir`, con lo desmarcado que guardó el
 * servidor). Este archivo lee todo lo que hace falta de una vez —lo vivo con sus tareas, sus notas y el
 * estado de cada fase (la misma lectura que aplicar y que la ruta que edita la propuesta), el borrador,
 * lo desmarcado, el estado de las tareas y del recálculo— y decide si el chat puede editarla.
 *
 * ⛔ Es el ÚNICO lugar que lee notas para el chat. Las de las TAREAS no se las pasa al modelo: el
 * texto lo arma `lib/asistente/contexto-del-cronograma.ts`, que nunca las escribe. Las necesita el plan
 * (la foto de una tarea que se va incluye su nota: si alguien la editó, choca).
 * E4 P1: también las de las FASES (`notasDeLasFases`, o las de `vivo` con una propuesta). Esas sí
 * llegan al modelo, pero solo la de la fase que la persona señaló con «IA», y solo en ese turno
 * (`lib/asistente/fase-senalada.ts`): el chat reescribe una nota únicamente si la leyó entera.
 *
 * Solo lectura (`modo: "solo-lectura"`) en cinco casos, con su porqué:
 *   · «ilegible»: lo guardado no es un `borrador-v1` (E4: el formato viejo ya no se lee). Se descarta
 *     arriba del Gantt;
 *   · «version-nueva»: trae cambios que esta versión no sabe leer;
 *   · «vacio-armando» / «vacio-fallido»: el borrador vacío que espera sus tareas (no hay nada que editar);
 *   · «tareas-armando»: la IA está armando las tareas de la propuesta;
 *   · «recalculando»: la IA está recalculando las tareas de alguna fase.
 * Son los mismos frenos que la ruta que edita la propuesta (POST /timeline/borrador/operaciones).
 */
import { prisma } from "@/lib/db/prisma";
import {
  deDondeViene,
  desdeDeLaPropuesta,
  esBorradorV1,
  esVacioEsperandoTareas,
  estadoDelVacio,
  excluidosDelGuardado,
  leerBorrador,
  planDeAplicacion,
  resumir,
  versionDelBorrador,
  type Borrador,
  type EstadoDeLasTareas,
  type PlanDeAplicacion,
  type ResumenDelBorrador,
  type Vivo,
} from "./borrador";
import {
  leerEstadoDeLasTareas,
  SELECT_DE_FASES_CON_TAREAS,
  vivoDeLaBase,
  type EstadoDeLasTareasDelBorrador,
} from "./borrador-del-detalle";

/** Por qué el chat no puede editar la propuesta ahora. */
export type PorQueSoloLectura =
  | "ilegible"
  | "version-nueva"
  | "vacio-armando"
  | "vacio-fallido"
  | "tareas-armando"
  | "recalculando";

export interface PropuestaParaElChat {
  modo: "editable" | "solo-lectura";
  /** null ⇔ editable. */
  porQue: PorQueSoloLectura | null;
  /** `pendingProposalRunId`: identifica la propuesta. "" solo en una propuesta de antes de los tokens. */
  token: string;
  /** La versión del `borrador-v1` (sube con cada escritura), o null si lo guardado no es un v1. */
  version: number | null;
  /** El cronograma de hoy, con sus tareas (con notas) y el estado de cada fase. */
  vivo: Vivo;
  /** null = lo guardado no es un borrador que esta versión sepa leer. */
  borrador: Borrador | null;
  /** Lo desmarcado que guardó el servidor ([] si nadie desmarcó nada todavía). */
  excluidos: string[];
  /** El estado de las tareas del borrador (deducido de su corrida), o null si no espera tareas. */
  estado: EstadoDeLasTareas | null;
  /** El plan con lo desmarcado (el de la barra, con `forzar: []`). null sin borrador. */
  plan: PlanDeAplicacion | null;
  /** Lo que pinta la barra, con los MISMOS números. null sin borrador. */
  resumen: ResumenDelBorrador | null;
  /** «desde «Regenerar todo»»…: de dónde viene, en palabras del CSE. */
  desde: string;
}

/**
 * Por qué el chat no puede editar la propuesta, o null si puede. Puro. El orden importa: lo que no se
 * sabe leer va primero (ni siquiera se sabe qué trae), después el vacío y al final lo que la IA está
 * haciendo sobre una propuesta que sí se lee.
 */
export function porQueDeSoloLectura(i: {
  guardado: unknown;
  borrador: Borrador | null;
  tareas: EstadoDeLasTareasDelBorrador | null;
}): PorQueSoloLectura | null {
  if (!esBorradorV1(i.guardado) || !i.borrador) return "ilegible";
  if ((i.borrador.desconocidos ?? 0) > 0) return "version-nueva";
  if (esVacioEsperandoTareas(i.guardado)) {
    return estadoDelVacio(i.guardado, i.tareas?.estado ?? null) === "fallo" ? "vacio-fallido" : "vacio-armando";
  }
  if (i.tareas?.estado === "armando") return "tareas-armando";
  if (i.tareas?.recalculo?.estado === "armando") return "recalculando";
  return null;
}

/**
 * La propuesta para el chat, de lo ya leído. Puro. El resumen es el de la barra: lo desmarcado es el
 * que guardó el servidor (`excluidos`), el estado de las tareas el de su corrida y nada forzado.
 */
export function propuestaParaElChat(i: {
  guardado: unknown;
  token: string | null;
  vivo: Vivo;
  tareas: EstadoDeLasTareasDelBorrador | null;
}): PropuestaParaElChat {
  const borrador = leerBorrador(i.guardado);
  const porQue = porQueDeSoloLectura({ guardado: i.guardado, borrador, tareas: i.tareas });
  const excluidos = excluidosDelGuardado(i.guardado) ?? [];
  const estado = i.tareas?.estado ?? null;
  const opciones = { tareas: estado, forzar: [] };
  return {
    modo: porQue === null ? "editable" : "solo-lectura",
    porQue,
    token: i.token ?? "",
    version: versionDelBorrador(i.guardado),
    vivo: i.vivo,
    borrador,
    excluidos,
    estado,
    plan: borrador ? planDeAplicacion(i.vivo, borrador, excluidos, opciones) : null,
    resumen: borrador ? resumir(i.vivo, borrador, excluidos, opciones) : null,
    desde: desdeDeLaPropuesta(deDondeViene(i.guardado)),
  };
}

/**
 * E4 P1: la nota de cada fase de ESTE proyecto (sin propuesta abierta; con una, el chat usa las de su
 * `vivo`). ⛔ Filtra por proyecto: el id de la fase señalada llega del navegador.
 */
export async function notasDeLasFases(projectId: string): Promise<Map<string, string | null>> {
  const fases = await prisma.timelinePhase.findMany({
    where: { timeline: { projectId } },
    select: { id: true, notes: true },
  });
  return new Map(fases.map((f) => [f.id, f.notes ?? null]));
}

/**
 * La propuesta abierta del cronograma, o null si no hay. Lee el cronograma con sus tareas (la misma
 * lectura que aplicar) y el estado de las tareas y del recálculo (sus corridas).
 */
export async function leerPropuestaParaElChat(timelineId: string): Promise<PropuestaParaElChat | null> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { id: timelineId },
    select: {
      anchorStartDate: true,
      pendingProposal: true,
      pendingProposalRunId: true,
      phases: SELECT_DE_FASES_CON_TAREAS,
    },
  });
  if (!tl || tl.pendingProposal === null) return null;
  const tareas = await leerEstadoDeLasTareas(tl.pendingProposal);
  return propuestaParaElChat({
    guardado: tl.pendingProposal,
    token: tl.pendingProposalRunId,
    vivo: vivoDeLaBase(tl.anchorStartDate, tl.phases),
    tareas,
  });
}
