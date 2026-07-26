/**
 * lib/timeline/project-action-targets.test.ts
 *
 * ESTE TEST ES EL FIX del fallback silencioso.
 *
 * El destino de cada acción vivía en un if-chain con un `return` final que mandaba lo no contemplado
 * al tope del Gantt. Nadie se enteraba: la acción nueva salía, el botón "funcionaba", y te dejaba
 * mirando una fila cualquiera. Llegaron a ser 8 de 16.
 *
 * Acá se arma un proyecto con TODO mal —dos variantes, porque `sin-anchor` y `detalle-sin-confirmar`
 * son mutuamente excluyentes— y se exige que cada acción emitida tenga destino declarado. Si agregás
 * una al motor y te olvidás de la tabla, este test falla nombrándola.
 */
import { test, expect } from "vitest";
import { buildProjectActions, type ProjectActionsInput } from "./project-actions";
import { targetFor, ACTION_TARGETS, ANCHORS, STAGE_ACTION_PREFIX } from "./project-action-targets";

/** Proyecto en llamas: dispara todo lo que se puede disparar a la vez. */
const TODO_MAL: ProjectActionsInput = {
  pendingProgress: true,
  pendingParticularidades: 3,
  pendingProposal: true,
  sugerenciasDelEquipo: 2,
  anchorStartDate: null, // → sin-anchor (TAPA a detalle-sin-confirmar)
  detailConfirmedAt: null,
  hasTasks: true,
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
 * La otra rama del else-if. Antes hacían falta DOS variantes más porque las condiciones de
 * publicación formaban un triángulo; al salir `publicar` del motor —esa conversación la tiene
 * la barra amarilla— quedó un par simple: sin arranque, o con arranque y sin detalle confirmado.
 */
const CON_ANCHOR: ProjectActionsInput = {
  ...TODO_MAL,
  anchorStartDate: "2026-06-01T00:00:00.000Z", // → detalle-sin-confirmar
};

const TODOS_LOS_IDS = [
  ...buildProjectActions(TODO_MAL).map((a) => a.id),
  ...buildProjectActions(CON_ANCHOR).map((a) => a.id),
];

test("las dos variantes juntas cubren TODAS las acciones del motor", () => {
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

/**
 * LA REGLA DE NEGOCIO, escrita donde alguien la va a leer: **publicar es de la barra amarilla.**
 * Tener el recordatorio en dos lugares —el panel y el `PublishBar`— era exactamente el ruido que
 * el rediseño vino a sacar. El grupo `publicar` se borró del TIPO, así que reintroducir un ítem
 * también rompe `tsc`; esto cubre el otro extremo, la tabla de destinos.
 */
test("ninguna acción publica: esa conversación es de la barra amarilla", () => {
  for (const [id, target] of Object.entries(ACTION_TARGETS)) {
    expect(id, "un id de publicación volvió al catálogo").not.toMatch(/publicar/);
    expect(
      target.kind === "run" && (target as { intent: string }).intent === "publish",
      `"${id}" volvió a tener un destino de publicar`,
    ).toBe(false);
  }
});

// El bug concreto que este archivo arregló: apuntaba a un ancla que solo existe si hay OTROS
// banners. Hoy los borradores viven en un cajón y la propuesta se resuelve dentro del Gantt.
test("los borradores abren su cajón; la propuesta va al Gantt donde se resuelve", () => {
  expect(targetFor("draft-progress")).toEqual({ kind: "drawer", drawer: "borradores" });
  expect(targetFor("draft-particularidades")).toEqual({ kind: "drawer", drawer: "borradores" });
  expect(targetFor("draft-proposal")).toEqual({ kind: "anchor", anchor: ANCHORS.gantt });
  expect(targetFor("draft-proposal")).not.toEqual(targetFor("draft-progress"));
});

test("confirmar detalle EJECUTA, no navega", () => {
  expect(targetFor("detalle-sin-confirmar")).toEqual({ kind: "run", intent: "confirm-detail" });
});

/**
 * El grupo viaja en la TABLA, no en un if-chain del canvas. Antes era
 * `id === "compromisos-sin-tarea" ? "compromisos" : "arreglar"`, o sea que cualquier acción nueva
 * caía en "arreglar" sin que nada avisara — el mismo fallback silencioso, de vuelta.
 */
test("las acciones sobre filas enfocan SU grupo de la lista", () => {
  expect(targetFor("compromisos-sin-tarea")).toEqual({ kind: "particularidades", group: "compromisos" });
  expect(targetFor("sugerencias-equipo")).toEqual({ kind: "particularidades", group: "sugerencias" });
  for (const id of ["duplicados", "sin-cuantificar", "compromisos-vencidos"]) {
    expect(targetFor(id), id).toEqual({ kind: "particularidades", group: "arreglar" });
  }
});

// "Sin destino" tiene que ser una declaración explícita, no el resultado de olvidarse.
test("alcance declara que no tiene a dónde llevar", () => {
  expect(targetFor("alcance")).toEqual({ kind: "none" });
});

test("un id desconocido devuelve null (es un bug, no un caso válido)", () => {
  expect(targetFor("no-existe-esta-accion")).toBeNull();
});
