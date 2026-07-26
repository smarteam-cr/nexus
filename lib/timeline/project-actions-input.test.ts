/**
 * lib/timeline/project-actions-input.test.ts
 *
 * El armado del input dejó de vivir en un `useMemo` del canvas y pasó a ser una función pura,
 * porque la bandeja del CSE tiene que resolver 13-17 proyectos sin montar 17 canvases.
 *
 * Lo que se fija acá es que la MUDANZA no cambió ninguna regla: los casos son los dos extremos
 * reales de la cartera —Wherex, el único proyecto con carga de verdad, y los 17 de 32 sin fecha
 * de arranque— más la rama de pre-hidratación.
 */
import { describe, test, expect } from "vitest";
import { buildActionsInput, actionsFromSignals, type TimelineActionSignals } from "./project-actions-input";

const AHORA = new Date("2026-07-26T12:00:00.000Z");
const ARRANQUE = "2026-05-01T00:00:00.000Z"; // ~12 semanas antes de AHORA

const vacio: TimelineActionSignals = {
  anchorStartDate: null,
  detailConfirmedAt: null,
  hasTasks: false,
  pendingProgress: false,
  pendingParticularidades: 0,
  pendingProposal: false,
  particularidades: [],
  sugerenciasDelEquipo: 0,
  phases: [],
};

/**
 * El caso Wherex: 10 fases, tareas vencidas del cliente, compromisos sin dueño, un atraso sin
 * cuantificar y un compromiso convertido en tarea que ya venció.
 */
const wherex: TimelineActionSignals = {
  anchorStartDate: ARRANQUE,
  detailConfirmedAt: "2026-05-10T00:00:00.000Z",
  hasTasks: true,
  pendingProgress: false,
  pendingParticularidades: 3,
  pendingProposal: false,
  sugerenciasDelEquipo: 0,
  particularidades: [
    { id: "p1", kind: "ATRASO", title: "El cliente no entregó los accesos de SAP", weeksImpact: 2 },
    { id: "p2", kind: "ATRASO", title: "Se corrió la validación de datos maestros", weeksImpact: null },
    { id: "p3", kind: "COMPROMISO", title: "Mandar el listado de usuarios finales" },
    { id: "p4", kind: "COMPROMISO", title: "Confirmar el pipeline de posventa" },
    { id: "p5", kind: "COMPROMISO", title: "Revisar propiedades de negocio", convertedTaskId: "t-vieja" },
  ],
  phases: [
    {
      order: 0,
      name: "Semana 0",
      durationWeeks: 2,
      tasks: [
        // party CLIENTE + semana 0 de una fase que arrancó en mayo → vencida hace ~11 semanas
        { id: "t-cli", title: "Entregar accesos", weekIndex: 0, status: "PENDING", party: "CLIENTE" },
        { id: "t-vieja", title: "Revisar propiedades", weekIndex: 1, status: "PENDING", party: "SMARTEAM" },
      ],
    },
    {
      order: 1,
      name: "Desarrollo / Integración",
      durationWeeks: 5,
      tasks: [{ id: "t-futura", title: "Construir el conector", weekIndex: 4, status: "PENDING", party: "SMARTEAM" }],
    },
  ],
};

describe("el caso cargado (Wherex)", () => {
  const input = buildActionsInput(wherex, null, AHORA);

  test("cuenta los atrasos sin cuantificar, no todos los atrasos", () => {
    expect(input.sinCuantificar).toBe(1); // p2; p1 tiene weeksImpact
  });

  test("los compromisos YA convertidos en tarea no cuentan como sin dueño", () => {
    expect(input.compromisosSinTarea).toBe(2); // p3 y p4; p5 ya tiene tarea
  });

  test("un compromiso con tarea vencida cuenta como vencido", () => {
    expect(input.compromisosVencidos).toBe(1); // t-vieja
  });

  test("las entregas del cliente vencidas se cuentan aparte", () => {
    expect(input.pendientesDelClienteVencidos).toBe(1); // t-cli
  });

  test("la tarea futura no cuenta como vencida por ninguna vía", () => {
    // Fase 1 arranca en la semana 2 y la tarea está en su semana 4 → semana absoluta 6, todavía
    // dentro del plan a 12 semanas del arranque… pero lo que importa es que no la contamos DOS
    // veces: ni como compromiso ni como entrega del cliente (es SMARTEAM y no está convertida).
    expect(input.compromisosVencidos).toBe(1);
    expect(input.pendientesDelClienteVencidos).toBe(1);
  });
});

/**
 * LA COMPUERTA QUE FALTABA. El canvas la tenía implícita (solo pinta el panel con fases); el
 * cargador batch no, y la primera corrida contra la cartera real emitió "El cronograma no tiene
 * fecha de arranque · Fijar el arranque" para **24 proyectos que no tienen cronograma**. Habría
 * sido el bloque más poblado de la bandeja del CSE, y todo falso.
 */
describe("sin fases no hay cronograma, y sobre lo que no existe no se opina", () => {
  test("un proyecto sin cronograma no emite NINGUNA acción", () => {
    expect(actionsFromSignals(vacio, null, AHORA)).toEqual([]);
  });

  test("ni siquiera la bloqueante del arranque, que es la que más ruido hacía", () => {
    const conTodoMal = { ...wherex, phases: [], anchorStartDate: null };
    expect(actionsFromSignals(conTodoMal, { stalled: true, daysSinceActivity: 90 }, AHORA)).toEqual([]);
  });

  test("con una sola fase el motor ya opina", () => {
    const unaFase = { ...vacio, phases: [{ name: "Semana 0", durationWeeks: 1 }] };
    expect(actionsFromSignals(unaFase, null, AHORA).map((a) => a.id)).toEqual(["sin-anchor"]);
  });
});

describe("el caso mayoritario: con cronograma y sin fecha de arranque", () => {
  test("solo emite la bloqueante, y nada que dependa de una fecha", () => {
    const acciones = actionsFromSignals({ ...vacio, phases: wherex.phases }, null, AHORA);
    expect(acciones.map((a) => a.id)).toEqual(["sin-anchor"]);
    expect(acciones[0].blocking).toBe(true);
  });

  test("un cronograma sin nada no emite ninguna acción salvo la del arranque", () => {
    const input = buildActionsInput(vacio, null, AHORA);
    expect(input.compromisosVencidos).toBe(0);
    expect(input.pendientesDelClienteVencidos).toBe(0);
    expect(input.duplicados.hechos).toBe(0);
  });
});

describe("antes de hidratar (now: null) no se inventa un 'hoy'", () => {
  test("todo lo que depende de la fecha queda en cero", () => {
    const input = buildActionsInput(wherex, null, null);
    expect(input.compromisosVencidos).toBe(0);
    expect(input.pendientesDelClienteVencidos).toBe(0);
  });

  test("lo que NO depende de la fecha se cuenta igual", () => {
    const input = buildActionsInput(wherex, null, null);
    expect(input.sinCuantificar).toBe(1);
    expect(input.compromisosSinTarea).toBe(2);
    expect(input.pendingParticularidades).toBe(3);
  });
});

describe("el summary manda sobre las alarmas de cronograma", () => {
  const conSummary = (over: Partial<Parameters<typeof buildActionsInput>[1] & object>) =>
    buildActionsInput(wherex, { scheduleAlarmsActive: true, overdueTasks: 7, ...over }, AHORA);

  test("con la etapa consensuada, las tareas vencidas del summary entran", () => {
    expect(conSummary({}).tareasVencidas).toBe(7);
  });

  /* Antes de CONFIGURACION_TECNICA el cronograma es tentativo: gritar "7 tareas vencidas" sobre
     un plan que el cliente todavía no consensuó es alarma falsa. */
  test("con la etapa temprana, no se cuentan", () => {
    expect(conSummary({ scheduleAlarmsActive: false }).tareasVencidas).toBe(0);
  });

  /* Un baseline flojo hace que casi todo el detalle parezca "alcance extra". El motor no puede
     distinguirlo, así que la señal se apaga en la fuente. */
  test("un baseline atenuado no reporta alcance excedido", () => {
    const scope = { measurable: true, exceeded: true, attenuated: true, addedTasks: 9, weeksDelta: 3 };
    expect(buildActionsInput(wherex, { scope }, AHORA).alcanceExcedido).toBeNull();
    expect(buildActionsInput(wherex, { scope: { ...scope, attenuated: false } }, AHORA).alcanceExcedido)
      .toEqual({ addedTasks: 9, weeksDelta: 3 });
  });
});

/* La razón de ser del módulo: el servidor tiene que poder resolver esto sin un navegador. */
test("no toca el DOM ni depende de un reloj implícito", () => {
  const a = actionsFromSignals(wherex, null, AHORA);
  const b = actionsFromSignals(wherex, null, AHORA);
  expect(a).toEqual(b);
});
