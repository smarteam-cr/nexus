import { describe, expect, it } from "vitest";
import { decidirRefrescoTrasHandoff, debeReemplazarPropuesta } from "./refresco-tras-handoff";
import { reconcileAgentProposal } from "./reconcile-proposal";

/**
 * lib/timeline/refresco-tras-handoff.test.ts — EL AVISO NO PUEDE QUEDAR HUÉRFANO.
 *
 * El síntoma que originó esto: al regenerar un handoff aparecía «El cronograma tiene una propuesta
 * sin revisar» y el cronograma no mostraba nada hasta recargar a mano. La señal llegaba; el canvas
 * la descartaba porque solo actuaba con el cronograma vacío.
 *
 * El modo de falla de este arreglo NO es que alguien lo rompa a propósito: es que alguien vuelva a
 * meter una condición «para no molestar al que está editando» sin notar que el camino nuevo no
 * escribe nada editable. Por eso la invariante se escribe como tabla, no como un caso suelto.
 */

describe("⭐ el caso que hoy muere mudo: hay fases, y el handoff dejó propuesta", () => {
  it("con fases en pantalla trae la propuesta — no se queda quieto", () => {
    /* Este assert FALLA contra el código anterior (`if (phases.length === 0) load()`), que para
       esta entrada no hacía nada. Un test que no distingue el antes del después no sirve. */
    expect(decidirRefrescoTrasHandoff({ hayFases: true, cargando: false })).toBe("solo-propuesta");
  });

  it("⛔ INVARIANTE: con fases, NINGUNA entrada puede terminar sin actuar", () => {
    /* La tabla es el punto: si mañana alguien suma otra condición (un `!dirty`, un `!saving`) para
       «no molestar», este assert se cae. Y esa condición no haría falta: el camino de solo-propuesta
       no toca `phases`, ni `dirty`, ni `particularidadesDirty`, ni las selecciones del banner. */
    for (const cargando of [true, false]) {
      expect(
        decidirRefrescoTrasHandoff({ hayFases: true, cargando }),
        `con fases y cargando=${cargando} el aviso quedó huérfano`,
      ).toBe("solo-propuesta");
    }
  });
});

describe("el cronograma vacío conserva la conducta que ya funcionaba", () => {
  it("vacío y quieto: recarga entero, que es como nacen las fases del handoff", () => {
    expect(decidirRefrescoTrasHandoff({ hayFases: false, cargando: false })).toBe("recargar-todo");
  });

  it("vacío y con una carga en vuelo: espera, y el llamador NO consume la señal", () => {
    /* Antes el ref avanzaba ANTES de evaluar la condición, así que una señal descartada se perdía
       para siempre. «esperar» existe para que el canvas pueda reintentar al terminar la carga. */
    expect(decidirRefrescoTrasHandoff({ hayFases: false, cargando: true })).toBe("esperar");
  });
});

/**
 * ⭐ EL CRUCE CON EL SERVIDOR — lo que hace honesta a la guarda.
 *
 * El cliente decide «traer la propuesta» mirando si hay fases; el servidor decide «guardar
 * propuesta» por su propio criterio (`reconcileAgentProposal`). Si esas dos mitades se separan, el
 * aviso vuelve a quedar huérfano y nadie se entera. Este bloque las ata.
 */
describe("⭐ cuando el servidor guarda propuesta, el cliente la va a buscar", () => {
  it("una regeneración real sobre un cronograma con fases: el servidor propone y el cliente trae", () => {
    const existe = (id: string, name: string, durationWeeks: number) => ({
      id,
      name,
      durationWeeks,
      startWeek: null,
      sessionCount: null,
      notes: null,
      activityType: null,
    });
    const existentes = [existe("f1", "Kickoff", 2), existe("f2", "Configuración", 3)];
    const prop = (name: string, durationWeeks: number) => ({
      name,
      durationWeeks,
      startWeek: null,
      sessionCount: null,
      notes: null,
    });
    const propuestas = [
      prop("Kickoff", 2),
      prop("Configuración", 5), // el agente re-estimó
      prop("Capacitación", 2), // y sumó una fase
    ];

    const r = reconcileAgentProposal(propuestas, existentes, null, null);
    expect(r.isNoOp, "el servidor no guardaría propuesta: el fixture no representa el caso").toBe(
      false,
    );

    // Y con ESAS mismas fases en pantalla, el cliente tiene que ir a buscarla.
    expect(
      decidirRefrescoTrasHandoff({ hayFases: existentes.length > 0, cargando: false }),
      "el servidor guardó una propuesta que el cliente nunca va a pedir",
    ).not.toBe("esperar");
    expect(decidirRefrescoTrasHandoff({ hayFases: true, cargando: false })).toBe("solo-propuesta");
  });
});

describe("qué propuesta gana la pantalla", () => {
  const base = { hayPropuesta: true, esDeAssist: false, runIdEnPantalla: "r1", runIdNuevo: "r2" };

  it("sin nada en pantalla, siempre entra la nueva", () => {
    expect(debeReemplazarPropuesta({ ...base, hayPropuesta: false })).toBe(true);
  });

  it("⛔ NUNCA pisa una vista previa del assist: no está en el servidor, se perdería", () => {
    expect(debeReemplazarPropuesta({ ...base, esDeAssist: true })).toBe(false);
  });

  it("del servidor contra el servidor: gana la corrida nueva", () => {
    /* Sin esto, una segunda regeneración dejaba en pantalla la propuesta VIEJA — el cartel diciendo
       que hay algo nuevo y el canvas mostrando lo anterior, sin nada que lo delate. */
    expect(debeReemplazarPropuesta(base)).toBe(true);
  });

  it("la misma corrida no se re-pisa (evita parpadeos por señales repetidas)", () => {
    expect(debeReemplazarPropuesta({ ...base, runIdNuevo: "r1" })).toBe(false);
  });

  it("si el servidor no trae propuesta, no se borra la que hay", () => {
    expect(debeReemplazarPropuesta({ ...base, runIdNuevo: null })).toBe(false);
  });
});
