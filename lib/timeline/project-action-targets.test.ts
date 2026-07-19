/**
 * lib/timeline/project-action-targets.test.ts
 *
 * ESTE TEST ES EL FIX del fallback silencioso.
 *
 * El destino de cada acción vivía en un if-chain con un `return` final que mandaba lo no contemplado
 * al tope del Gantt. Nadie se enteraba: la acción nueva salía, el botón "funcionaba", y te dejaba
 * mirando una fila cualquiera. Llegaron a ser 8 de 16.
 *
 * Acá se arma un proyecto con TODO mal —tres variantes, porque las condiciones de publicación son
 * mutuamente excluyentes entre sí— y se exige que cada acción emitida tenga destino declarado. Si
 * agregás una al motor y te olvidás de la tabla, este test falla nombrándola.
 */
import { test, expect } from "vitest";
import { buildProjectActions, type ProjectActionsInput } from "./project-actions";
import { targetFor, ACTION_TARGETS, ANCHORS, STAGE_ACTION_PREFIX } from "./project-action-targets";

/** Proyecto en llamas: dispara todo lo que se puede disparar a la vez. */
const TODO_MAL: ProjectActionsInput = {
  pendingProgress: true,
  pendingParticularidades: 3,
  pendingProposal: true,
  anchorStartDate: null, // → sin-anchor (TAPA a detalle-sin-confirmar)
  detailConfirmedAt: null,
  timelinePublishedAt: null, // → sin-publicar (TAPA a cambios-sin-publicar)
  hasTasks: true,
  cambiosSinPublicar: true,
  sinCuantificar: 2,
  duplicados: { hechos: 2, filas: 5 },
  compromisosSinTarea: 4,
  compromisosVencidos: 3,
  pendientesDelClienteVencidos: 2,
  tareasVencidas: 5,
  alarmasDeEtapa: [
    { key: "kickoff_sin_publicar", label: "Kickoff sin publicar", days: 12 },
    { key: "sin_baseline", label: "Cronograma sin línea base", days: 4 },
  ],
  alcanceExcedido: { addedTasks: 4, weeksDelta: 2 },
  estancadoDias: 21,
};

/**
 * Las otras ramas de las cadenas else-if. Hacen falta DOS variantes más, no una: las condiciones de
 * publicación forman un triángulo (sin anchor / con anchor sin publicar / publicado con cambios) y
 * ninguna combinación sola emite las tres. Este test ya cazó el hueco una vez.
 */
const CON_ANCHOR_SIN_PUBLICAR: ProjectActionsInput = {
  ...TODO_MAL,
  anchorStartDate: "2026-06-01T00:00:00.000Z", // → detalle-sin-confirmar
  timelinePublishedAt: null, // → sin-publicar
};
const PUBLICADO_CON_CAMBIOS: ProjectActionsInput = {
  ...CON_ANCHOR_SIN_PUBLICAR,
  timelinePublishedAt: "2026-06-03T00:00:00.000Z", // → cambios-sin-publicar
};

const TODOS_LOS_IDS = [
  ...buildProjectActions(TODO_MAL).map((a) => a.id),
  ...buildProjectActions(CON_ANCHOR_SIN_PUBLICAR).map((a) => a.id),
  ...buildProjectActions(PUBLICADO_CON_CAMBIOS).map((a) => a.id),
];

test("las tres variantes juntas cubren TODAS las acciones del motor", () => {
  // Si el motor gana una acción y no se agrega acá, el test de abajo no la revisa: este guard es
  // el que avisa que la cobertura quedó corta.
  const unicos = new Set(TODOS_LOS_IDS);
  const dinamicas = [...unicos].filter((id) => id.startsWith(STAGE_ACTION_PREFIX));
  const estaticas = [...unicos].filter((id) => !id.startsWith(STAGE_ACTION_PREFIX));
  expect(estaticas.sort()).toEqual(Object.keys(ACTION_TARGETS).sort());
  // Con 2 alarmas de etapa el motor emite UNA sola fila (la más vieja, con el contador adentro):
  // el panel crece con las CLASES de problema, no con los datos.
  expect(dinamicas.length).toBe(1);
});

// El corazón: ninguna acción sin destino.
test("toda acción emitida tiene destino declarado", () => {
  for (const id of new Set(TODOS_LOS_IDS)) {
    expect(targetFor(id), `la acción "${id}" no tiene destino en ACTION_TARGETS`).not.toBeNull();
  }
});

test("las alarmas de etapa (dinámicas) van al panel de ciclo de vida", () => {
  expect(targetFor("etapa-kickoff_sin_publicar")).toEqual({ kind: "anchor", anchor: ANCHORS.etapa });
  expect(targetFor("etapa-lo_que_sea_futuro")).toEqual({ kind: "anchor", anchor: ANCHORS.etapa });
});

// El bug concreto: apuntaba a un ancla que solo existe si hay OTROS banners.
test("draft-proposal tiene ancla propia, no la de los borradores", () => {
  expect(targetFor("draft-proposal")).toEqual({ kind: "anchor", anchor: ANCHORS.propuesta });
  expect(targetFor("draft-proposal")).not.toEqual(targetFor("draft-progress"));
});

test("publicar y confirmar detalle EJECUTAN, no navegan", () => {
  expect(targetFor("sin-publicar")).toEqual({ kind: "run", intent: "publish" });
  expect(targetFor("cambios-sin-publicar")).toEqual({ kind: "run", intent: "publish" });
  expect(targetFor("detalle-sin-confirmar")).toEqual({ kind: "run", intent: "confirm-detail" });
});

test("las acciones sobre filas enfocan la lista, no scrollean al Gantt", () => {
  for (const id of ["compromisos-sin-tarea", "duplicados", "sin-cuantificar", "compromisos-vencidos"]) {
    expect(targetFor(id), id).toEqual({ kind: "particularidades" });
  }
});

// "Sin destino" tiene que ser una declaración explícita, no el resultado de olvidarse.
test("alcance declara que no tiene a dónde llevar", () => {
  expect(targetFor("alcance")).toEqual({ kind: "none" });
});

test("un id desconocido devuelve null (es un bug, no un caso válido)", () => {
  expect(targetFor("no-existe-esta-accion")).toBeNull();
});
