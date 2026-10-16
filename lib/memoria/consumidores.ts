/**
 * lib/memoria/consumidores.ts — QUIÉN LEE LA MEMORIA Y CON QUÉ ALCANCE. PURO.
 *
 * Una sola fuente de qué ve cada lector. Un agente nuevo se declara acá antes de llamar al cargador, y
 * lib/memoria/consumidores.test.ts lo hace cumplir: todo archivo que importa `@/lib/memoria` tiene que estar en este
 * registro, y el alcance de cada pieza sale de `pieceBySlug().clientFacing`, no de una lista aparte. La excepción es el
 * handoff, `sin-lo-interno` a propósito (DECISIONS «La memoria de la cuenta y del proyecto: un solo cargador»).
 */
import { pieceBySlug } from "@/lib/pieces/registry";
import type { DestinoDeDocumento } from "@/lib/sessions/destinos-de-contexto";
import type { AlcanceDeMemoria, ClaveDeParte, QueCargar } from "./tipos";

export type LectorDeMemoria =
  | "handoff"
  | "kickoff"
  | "diagnosis"
  | "planning"
  | "tech-requirements"
  | "implementation"
  | "delivery"
  | "business-case"
  | "avance"
  | "resumen-del-proyecto"
  | "exploracion-del-proyecto"
  | "preventa"
  | "correo"
  | "cuestionario"
  | "pase-de-cuenta"
  | "lo-que-sabe-la-ia"
  | "vigia";

export interface ConsumidorDeLaMemoria {
  /** El slug de la pieza (lib/pieces/registry.ts) que escribe, o null si no escribe una pieza. */
  pieza: string | null;
  alcance: AlcanceDeMemoria;
  /**
   * Los orígenes de la ficha que este lector NO lee como propuesta: los suyos. Un agente no lee lo que él mismo
   * propuso, ni lo derivado de eso (lib/clients/ficha.ts › `propuestaExcluida`).
   */
  excluirOrigenes: readonly string[];
  /** Partes que este lector no recibe porque ya las tiene por otro lado. */
  sinPartes?: readonly ClaveDeParte[];
  /**
   * El «Contexto adicional» del documento (lib/sessions/destinos-de-contexto.ts): la memoria del proyecto respeta su
   * descarte. Una reunión que el CSE desestimó o sacó de ESE documento (`override` false en su columna) no vuelve por
   * la memoria; las que nadie eligió (null, desde la etapa 7 la X sobre una elegida vuelve ahí) y las que no entraron a
   * su material por espacio, sí: en resumen, nunca como transcripción. Sin destino, la memoria lee todas las del proyecto.
   */
  destino?: DestinoDeDocumento;
  /** Los archivos que llaman al cargador con este lector. */
  archivos: readonly string[];
  motivo: string;
}

/**
 * El alcance de una pieza: la que ve el cliente lee lo recortado, la interna lo interno. Una pieza que no está en el
 * registro lee lo recortado: equivocarse por el lado estricto no le muestra nada a nadie.
 */
export function alcanceDeLaPieza(slug: string): AlcanceDeMemoria {
  return pieceBySlug(slug)?.clientFacing === false ? "interno" : "cliente";
}

export const CONSUMIDORES_DE_LA_MEMORIA: Readonly<Record<LectorDeMemoria, ConsumidorDeLaMemoria>> = {
  handoff: {
    pieza: "handoff",
    // ⛔ La excepción: es interno, pero escribe en una sola llamada lo que leen el kickoff y el cuestionario del cliente.
    alcance: "sin-lo-interno",
    excluirOrigenes: ["Handoff"],
    // La historia de la cuenta ya le llega por `loadPriorRelationshipContext` (y los ciclos anteriores de un recurrente).
    sinPartes: ["historia"],
    archivos: ["app/api/clients/[id]/analyze/route.ts"],
    motivo: "Lee la cuenta sin lo interno y sin lo que él mismo propuso a la ficha.",
  },
  kickoff: {
    pieza: "kickoff",
    alcance: alcanceDeLaPieza("kickoff"),
    excluirOrigenes: [],
    destino: "kickoff",
    archivos: ["app/api/clients/[id]/analyze/route.ts"],
    motivo: "Las personas de la ficha y los acuerdos posteriores a la venta, recortados para el cliente.",
  },
  diagnosis: {
    pieza: "diagnosis",
    alcance: alcanceDeLaPieza("diagnosis"),
    excluirOrigenes: [],
    destino: "diagnostico",
    // Ya lee la ficha confirmada (`fichaParaPrompt`, sin lo interno), los mapas de procesos enteros y los resultados medibles.
    sinPartes: ["ficha", "procesos", "resultados"],
    archivos: ["lib/canvas/diagnostico-fuentes.ts"],
    motivo:
      "Lo que se sabe de la cuenta y del proyecto, recortado para el cliente. Desde la etapa 7 lleva el peso cuando nadie eligió reuniones.",
  },
  planning: {
    pieza: "planning",
    alcance: alcanceDeLaPieza("planning"),
    excluirOrigenes: [],
    destino: "planificacion",
    // Ya lee la ficha confirmada (`fichaParaPrompt`, sin lo interno) y los mapas de procesos enteros.
    sinPartes: ["ficha", "procesos"],
    archivos: ["lib/canvas/planificacion-generate.ts"],
    motivo:
      "Lo que se sabe de la cuenta y del proyecto, recortado para el cliente. Desde la etapa 7 lleva el peso cuando nadie eligió reuniones.",
  },
  "tech-requirements": {
    pieza: "tech-requirements",
    alcance: alcanceDeLaPieza("tech-requirements"),
    excluirOrigenes: [],
    destino: "integraciones",
    // Un requerimiento técnico no escribe desviaciones del plan ni resultados del negocio.
    sinPartes: ["desviaciones", "resultados"],
    archivos: ["lib/canvas/desarrollo-generate.ts"],
    motivo: "Integraciones se ve en vivo desde afuera: recortado para el cliente.",
  },
  implementation: {
    pieza: "implementation",
    alcance: alcanceDeLaPieza("implementation"),
    excluirOrigenes: [],
    destino: "ejecucion",
    // Ya lee los mapas de procesos enteros (`serializeProcesosForPrompt`).
    sinPartes: ["procesos"],
    archivos: ["lib/canvas/implementacion-generate.ts"],
    motivo: "La guía de trabajo del CSE: lee lo interno.",
  },
  delivery: {
    pieza: "delivery",
    alcance: alcanceDeLaPieza("delivery"),
    excluirOrigenes: [],
    destino: "entrega",
    /* Ya lee los procesos y los resultados medibles, y las cifras del proyecto (semanas, fechas) las escribe Nexus, no
       el agente: la historia (fechas de otros proyectos) y las desviaciones (semanas) lo invitarían a escribirlas. */
    sinPartes: ["procesos", "historia", "resultados", "desviaciones"],
    archivos: ["lib/canvas/entrega-generate.ts"],
    motivo: "La entrega se comparte al cliente: recortado. Lo que suma es la ficha confirmada y los acuerdos de las reuniones que su material no lee.",
  },
  "business-case": {
    pieza: "business-case",
    alcance: alcanceDeLaPieza("business-case"),
    excluirOrigenes: [],
    // Su historia y su ficha confirmada; los procesos validados quedan para cuando Elías lo decida (pregunta abierta).
    sinPartes: ["procesos"],
    archivos: ["app/api/business-cases/[id]/generate/route.ts"],
    motivo: "Una propuesta para un cliente que ya existe (una expansión) conoce su historia y su ficha confirmada.",
  },
  avance: {
    pieza: null,
    alcance: "interno",
    excluirOrigenes: [],
    archivos: ["lib/timeline/regenerate-progress.ts"],
    motivo: "El agente de avance: las minutas de las reuniones anteriores en vez de releerlas.",
  },
  "resumen-del-proyecto": {
    pieza: null,
    alcance: "interno",
    excluirOrigenes: [],
    // Ya lee la historia del cliente (`loadPriorRelationshipContext`) y los pedidos fuera de alcance de ESTE proyecto.
    sinPartes: ["historia", "fueraDeAlcance"],
    archivos: ["lib/projects/project-brief.ts"],
    motivo: "El resumen que ve el CSE en la ficha del proyecto: la ficha (con lo propuesto), los procesos, la auditoría y la preventa, como una fuente citable.",
  },
  "exploracion-del-proyecto": {
    pieza: "exploration",
    alcance: alcanceDeLaPieza("exploration"),
    excluirOrigenes: ["Exploración"],
    archivos: ["lib/exploraciones/fuentes-del-proyecto.ts"],
    motivo: "La exploración del proyecto (interna), sin lo que ella misma propuso a la ficha.",
  },
  preventa: {
    pieza: null,
    alcance: "interno",
    excluirOrigenes: ["Exploración", "Preventa"],
    // La preventa ya tiene su lienzo: no se lee a sí misma por la memoria.
    sinPartes: ["preventa"],
    archivos: ["lib/exploraciones/fuentes.ts"],
    motivo: "La preventa de una empresa que ya es cliente, como la fuente A0 (no cuenta como lo que dijo el cliente).",
  },
  correo: {
    pieza: null,
    // Lo lee el cliente: lo revisa y lo manda una persona.
    alcance: "cliente",
    excluirOrigenes: [],
    // Solo la ficha recortada (DECISIONS «El correo de seguimiento…»): ni los procesos ni la historia de otros proyectos.
    sinPartes: ["procesos", "historia"],
    archivos: ["lib/exploraciones/correo-de-seguimiento-server.ts"],
    motivo: "El correo de seguimiento de una reunión, para no repreguntar lo que ya se sabe.",
  },
  cuestionario: {
    pieza: null,
    // Lo lee la persona del cliente en su enlace, sin que nadie lo revise: recortado.
    alcance: "cliente",
    excluirOrigenes: ["Cuestionario"],
    // Solo la ficha confirmada: la estrategia del negocio. Ni los procesos ni la historia de otros proyectos.
    sinPartes: ["procesos", "historia", "fueraDeAlcance", "auditoria", "preventa", "hechos"],
    archivos: ["lib/cuestionario/prellenar.ts"],
    motivo:
      "El prellenado del cuestionario de estrategia (2026-10-11): lo que ya se sabe de la estrategia de la cuenta, para no preguntárselo otra vez al cliente.",
  },
  "pase-de-cuenta": {
    pieza: null,
    alcance: "interno",
    excluirOrigenes: [],
    // La ruta que hace el pase arma el aviso (lib/cs/pase-de-cuenta.ts es puro): llama a `loEsencialDeLaCuenta`.
    archivos: ["app/api/clients/[id]/cse-encargado/route.ts"],
    motivo: "El resumen que recibe el CSE nuevo: la ficha confirmada, las personas, los compromisos abiertos y lo fuera de alcance abierto.",
  },
  "lo-que-sabe-la-ia": {
    pieza: null,
    alcance: "interno",
    excluirOrigenes: [],
    archivos: ["lib/exploraciones/pantalla.ts"],
    motivo: "«Lo que la IA ya sabe» en la página de inicio de la exploración: solo conteos (queSabeLaIA), nunca el texto.",
  },
  vigia: {
    pieza: null,
    alcance: "interno",
    excluirOrigenes: [],
    /* Ya los lee por su lado (lib/cs/watchdog-context.ts y watchdog-cuenta.ts): las reuniones recientes con su minuta,
       los compromisos VENCIDOS de Tareas (por lib/tareas/para-agentes.ts) y los resultados del handoff. La facturación
       y Partner también los lee aparte: nunca entran a la memoria. */
    sinPartes: ["minutas", "compromisos", "resultados"],
    archivos: ["lib/cs/watchdog-cuenta.ts"],
    motivo:
      "El vigía de Éxito del cliente: lo que Nexus ya sabe de la cuenta y del proyecto (la ficha, los procesos, la historia, lo fuera de alcance, la preventa, la auditoría, las desviaciones y los hechos), interno.",
  },
};

export function consumidorDeLaMemoria(lector: LectorDeMemoria): ConsumidorDeLaMemoria {
  return CONSUMIDORES_DE_LA_MEMORIA[lector];
}

/** Qué se carga según el alcance. Lo de `false` ni se pide a la base. */
export function queCargar(alcance: AlcanceDeMemoria): QueCargar {
  const interno = alcance === "interno";
  const sinLoInterno = alcance === "sin-lo-interno";
  return {
    fichaPropuesta: interno || sinLoInterno,
    camposInternos: interno,
    posturaDeLasPersonas: interno,
    procesosSinValidar: interno || sinLoInterno,
    idsDeTrato: interno,
    fueraDeAlcance: interno,
    preventa: interno,
    auditoria: interno,
    compromisos: interno,
    minutaCompleta: interno,
    // La IA como borrador (2026-10-15, decisión de Elías): las minutas que nadie revisó llegan a todos, marcadas como
    // borrador; fuera del alcance interno, solo sus acuerdos y decisiones sin montos ni negociación. Lo confirmado manda.
    minutasSinRevisar: true,
    reunionesPuertasAdentro: interno,
    desviacionesNoVisibles: interno,
    atribucionDeDesviaciones: interno,
    resultadosSinConfirmar: interno || sinLoInterno,
    hechos: interno,
    personasYTickets: interno,
  };
}
