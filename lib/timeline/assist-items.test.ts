/**
 * lib/timeline/assist-items.test.ts
 *
 * Correr: `npx vitest run lib/timeline/assist-items.test.ts --project unit`.
 *
 * ── LA GUARDA QUE JUSTIFICA EL MÓDULO ────────────────────────────────────────────────────────
 * Descomponer un reemplazo completo en ítems y volver a armarlo tiene UN modo de falla que
 * cuesta trabajo real y no se ve: que la fase que nadie tocó salga en el payload CON su array de
 * `tasks`. En el contrato del PUT `tasks: undefined` = «no tocar» y un array = diff completo, y
 * el diff BORRA por omisión. O sea: aceptar un cambio en la fase A podría vaciar la fase B, sin
 * error, sin warning, y con la pantalla mostrando que todo salió bien.
 *
 * Por eso el primer describe. Los demás cubren las dos trampas que le siguen: la tarea que se
 * MUDA de fase (llega como «se fue» + «nació», y aceptar media mitad la duplica o la pierde) y
 * la semana que queda fuera de la duración aceptada (payload que el validador rechaza).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  diffAssist,
  proyectarAceptados,
  todasLasClaves,
  type FaseActual,
  type PropuestaDelAssist,
} from "./assist-items";

const ANCLA = "2026-07-01T00:00:00.000Z";

function tarea(id: string, title: string, weekIndex = 0, extra: Record<string, unknown> = {}) {
  return { id, title, weekIndex, order: 0, notes: null, party: null, type: null, ...extra } as never;
}

/** Dos fases: "Setup" (2 sem, 2 tareas) y "Adopción" (1 sem, 1 tarea DONE). */
const ACTUALES: FaseActual[] = [
  {
    id: "f1",
    name: "Setup",
    order: 0,
    durationWeeks: 2,
    startWeek: null,
    sessionCount: 2,
    notes: null,
    activityType: "CONFIGURACION",
    tasks: [tarea("t1", "Configurar pipeline", 0), tarea("t2", "Crear propiedades", 1)],
  },
  {
    id: "f2",
    name: "Adopción",
    order: 1,
    durationWeeks: 1,
    startWeek: null,
    sessionCount: 1,
    notes: null,
    activityType: "ADOPCION",
    tasks: [tarea("t3", "Onboarding por rol", 0, { status: "DONE" })],
  },
];

/** Copia fiel de ACTUALES en shape de propuesta, para partir de "cero cambios". */
function propuestaIgual(): PropuestaDelAssist {
  return {
    anchorStartDate: ANCLA,
    phases: ACTUALES.map((p) => ({
      id: p.id,
      name: p.name,
      order: p.order ?? 0,
      durationWeeks: p.durationWeeks,
      startWeek: p.startWeek,
      sessionCount: p.sessionCount,
      notes: p.notes,
      activityType: p.activityType,
      tasks: p.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        weekIndex: t.weekIndex,
        order: t.order ?? 0,
        notes: t.notes ?? null,
        party: t.party ?? null,
        type: t.type ?? null,
      })),
    })),
  };
}

describe("⛔ una fase que nadie tocó no puede perder sus tareas", () => {
  it("LA GUARDA: sale SIN `tasks` — «no tocar», no «diff completo»", () => {
    /* El escenario exacto: la propuesta reescribe un título en Setup, y en Adopción no cambia
       nada. Se acepta SOLO el de Setup. Si Adopción saliera con su array de tareas, el PUT haría
       el diff de esa fase y cualquier desincronización entre esta proyección y la base borraría
       la tarea DONE. La edición que la pone en rojo: emitir `tasks` siempre en `construirFase`. */
    const p = propuestaIgual();
    p.phases[0].tasks![0].title = "Configurar el pipeline de ventas";
    const payload = proyectarAceptados(ACTUALES, p, new Set(["tarea-cambia:t1"]), ANCLA);

    const setup = payload.phases.find((f) => f.id === "f1")!;
    const adopcion = payload.phases.find((f) => f.id === "f2")!;
    expect(setup.tasks, "la fase con el cambio aceptado SÍ manda sus tareas").toBeDefined();
    expect(
      "tasks" in adopcion,
      "la fase sin ningún ítem aceptado mandó `tasks`: el PUT la va a diffear y puede borrar por omisión",
    ).toBe(false);
    expect(setup.tasks!.find((t) => t.id === "t1")!.title).toBe("Configurar el pipeline de ventas");
    // Y la tarea que NO se aceptó dentro de la misma fase queda como estaba.
    expect(setup.tasks!.find((t) => t.id === "t2")!.title).toBe("Crear propiedades");
  });

  it("sin nada aceptado, el payload es el cronograma actual y ninguna fase manda tareas", () => {
    const p = propuestaIgual();
    p.phases[0].name = "Configuración inicial";
    p.phases[0].tasks!.push({ title: "Tarea colada", weekIndex: 0, order: 9 });
    const payload = proyectarAceptados(ACTUALES, p, new Set(), ANCLA);
    expect(payload.phases.map((f) => f.name)).toEqual(["Setup", "Adopción"]);
    expect(payload.phases.every((f) => !("tasks" in f))).toBe(true);
    expect(payload.anchorStartDate).toBe(ANCLA);
  });

  it("el ancla no se borra por omisión: sin el ítem aceptado, se conserva la actual", () => {
    const p = propuestaIgual();
    p.anchorStartDate = "2026-08-01T00:00:00.000Z";
    expect(proyectarAceptados(ACTUALES, p, new Set(), ANCLA).anchorStartDate).toBe(ANCLA);
    expect(
      proyectarAceptados(ACTUALES, p, new Set(["ancla"]), ANCLA).anchorStartDate,
    ).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("el diff nombra cada cambio una sola vez", () => {
  it("una propuesta idéntica no produce ningún ítem", () => {
    expect(diffAssist(ACTUALES, propuestaIgual(), ANCLA)).toEqual([]);
  });

  it("cambios de fase, de tarea, altas y bajas", () => {
    const p = propuestaIgual();
    p.phases[0].durationWeeks = 3; // fase-cambia:f1
    p.phases[0].tasks![1].weekIndex = 2; // tarea-cambia:t2
    p.phases[0].tasks!.push({ title: "Migrar la base", weekIndex: 2, order: 2, party: "CLIENTE" }); // tarea-nueva
    p.phases[1].tasks = []; // tarea-se-va:t3
    p.phases.push({ name: "Seguimiento", order: 2, durationWeeks: 2, tasks: [] }); // fase-nueva

    const items = diffAssist(ACTUALES, p, ANCLA);
    const claves = items.map((i) => i.key).sort();
    expect(claves).toEqual(
      [
        "fase-cambia:f1",
        "fase-nueva:2",
        "tarea-cambia:t2",
        "tarea-nueva:f1:2",
        "tarea-se-va:t3",
      ].sort(),
    );
    // La baja de una tarea DONE se marca pesada: es la que cuesta trabajo real.
    expect(items.find((i) => i.key === "tarea-se-va:t3")!.pesado).toBe(true);
    expect(items.find((i) => i.key === "fase-cambia:f1")!.detalle).toContain("2 → 3 semanas");
  });

  it("borrar una fase NO duplica el ítem por cada tarea que se lleva", () => {
    /* Sin este corte, borrar una fase de 30 tareas produciría 31 ítems y la lista sería
       ilegible — y peor: aceptar el borrado de la fase sin sus 30 tareas es incoherente. */
    const p = propuestaIgual();
    p.phases = [p.phases[0]];
    const items = diffAssist(ACTUALES, p, ANCLA);
    expect(items.map((i) => i.key)).toEqual(["fase-se-va:f2"]);
    expect(items[0].pesado, "se lleva una tarea DONE").toBe(true);

    const payload = proyectarAceptados(ACTUALES, p, new Set(["fase-se-va:f2"]), ANCLA);
    expect(payload.phases.map((f) => f.id)).toEqual(["f1"]);
    // Y descartarla la deja intacta, sin tareas en el payload.
    const intacta = proyectarAceptados(ACTUALES, p, new Set(), ANCLA);
    expect(intacta.phases.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect("tasks" in intacta.phases[1]).toBe(false);
  });

  it("el orden de las fases es UN ítem, no uno por fase", () => {
    const p = propuestaIgual();
    p.phases = [p.phases[1], p.phases[0]];
    const items = diffAssist(ACTUALES, p, ANCLA);
    expect(items.map((i) => i.key)).toEqual(["orden-fases"]);

    expect(proyectarAceptados(ACTUALES, p, new Set(), ANCLA).phases.map((f) => f.id)).toEqual([
      "f1",
      "f2",
    ]);
    const reordenado = proyectarAceptados(ACTUALES, p, new Set(["orden-fases"]), ANCLA);
    expect(reordenado.phases.map((f) => f.id)).toEqual(["f2", "f1"]);
    expect(reordenado.phases.map((f) => f.order), "el order se reasigna secuencial").toEqual([0, 1]);
  });
});

describe("la tarea que se MUDA de fase", () => {
  /* El saneo de la ruta le quita el id a una tarea que cambia de fase, así que llega como
     «desapareció de acá» + «nació allá». Como dos ítems sueltos, aceptar uno solo la duplica
     (acepto el alta, no la baja) o la pierde (al revés) — sin que nada avise. */
  function conMudanza(): PropuestaDelAssist {
    const p = propuestaIgual();
    p.phases[0].tasks = [p.phases[0].tasks![0]]; // t2 sale de Setup
    p.phases[1].durationWeeks = 2;
    p.phases[1].tasks!.push({ title: "Crear propiedades", weekIndex: 1, order: 1 }); // y entra a Adopción
    return p;
  }

  it("es UN solo ítem, no dos", () => {
    const items = diffAssist(ACTUALES, conMudanza(), ANCLA);
    const claves = items.map((i) => i.key);
    expect(claves).toContain("tarea-se-muda:t2");
    expect(claves.filter((k) => k.startsWith("tarea-nueva:"))).toEqual([]);
    expect(claves.filter((k) => k.startsWith("tarea-se-va:"))).toEqual([]);
    expect(items.find((i) => i.key === "tarea-se-muda:t2")!.detalle).toContain("Adopción");
  });

  it("aceptarla la saca de una fase y la pone en la otra, en la misma pasada", () => {
    const p = conMudanza();
    const payload = proyectarAceptados(ACTUALES, p, new Set(["tarea-se-muda:t2"]), ANCLA);
    const setup = payload.phases.find((f) => f.id === "f1")!;
    const adopcion = payload.phases.find((f) => f.id === "f2")!;
    expect(setup.tasks!.map((t) => t.id)).toEqual(["t1"]);
    const entrante = adopcion.tasks!.find((t) => t.title === "Crear propiedades")!;
    expect(entrante.id, "cambiar de fase la recrea: nace sin id").toBeUndefined();
    expect(adopcion.tasks!.some((t) => t.id === "t3"), "la DONE de la fase destino sigue ahí").toBe(true);
  });

  it("descartarla no toca ninguna de las dos fases", () => {
    const payload = proyectarAceptados(ACTUALES, conMudanza(), new Set(), ANCLA);
    expect(payload.phases.every((f) => !("tasks" in f))).toBe(true);
  });

  it("dos tareas del mismo título no se adivinan: quedan como los dos ítems que son", () => {
    /* Emparejar por título es la única señal disponible, así que tiene que ser estricta. Con dos
       candidatas idénticas, elegir una sería inventar. */
    const actuales: FaseActual[] = [
      { ...ACTUALES[0], tasks: [tarea("t1", "Revisión", 0)] },
      { ...ACTUALES[1], durationWeeks: 2, tasks: [] },
    ];
    const p: PropuestaDelAssist = {
      anchorStartDate: ANCLA,
      phases: [
        { id: "f1", name: "Setup", order: 0, durationWeeks: 2, tasks: [] },
        {
          id: "f2",
          name: "Adopción",
          order: 1,
          durationWeeks: 2,
          tasks: [
            { title: "Revisión", weekIndex: 0, order: 0 },
            { title: "Revisión", weekIndex: 1, order: 0 },
          ],
        },
      ],
    };
    const claves = diffAssist(actuales, p, ANCLA).map((i) => i.key);
    expect(claves).toContain("tarea-se-va:t1");
    expect(claves.filter((k) => k.startsWith("tarea-nueva:")).length).toBe(2);
    expect(claves.some((k) => k.startsWith("tarea-se-muda:"))).toBe(false);
  });

  it("la mudanza sobrevive aunque su fase de origen desaparezca", () => {
    /* Si el corte de «su fase se va» corriera antes que la detección de mudanza, la tarea no
       tendría ítem en ninguna punta y se evaporaría al aceptar el borrado de la fase. */
    const p: PropuestaDelAssist = {
      anchorStartDate: ANCLA,
      phases: [
        {
          id: "f2",
          name: "Adopción",
          order: 0,
          durationWeeks: 2,
          tasks: [
            { id: "t3", title: "Onboarding por rol", weekIndex: 0, order: 0 },
            { title: "Crear propiedades", weekIndex: 1, order: 1 },
          ],
        },
      ],
    };
    const claves = diffAssist(ACTUALES, p, ANCLA).map((i) => i.key);
    expect(claves).toContain("tarea-se-muda:t2");
    expect(claves).toContain("fase-se-va:f1");
  });
});

describe("el payload proyectado siempre es aplicable", () => {
  it("la semana se acota contra la duración ACEPTADA, no contra la propuesta", () => {
    /* «Mové la tarea a la semana 3» + «la fase pasa a 4 semanas» son dos ítems. Aceptar solo el
       primero dejaría weekIndex 2 en una fase de 2 semanas → 422 del validador. La edición que
       la pone en rojo: sacar el Math.min contra `duracion`. */
    const p = propuestaIgual();
    p.phases[0].durationWeeks = 4;
    p.phases[0].tasks![1].weekIndex = 3;
    const soloLaTarea = proyectarAceptados(ACTUALES, p, new Set(["tarea-cambia:t2"]), ANCLA);
    const setup = soloLaTarea.phases.find((f) => f.id === "f1")!;
    expect(setup.durationWeeks, "la fase no se aceptó: sigue en 2").toBe(2);
    expect(setup.tasks!.find((t) => t.id === "t2")!.weekIndex).toBe(1);

    // Con las dos aceptadas, la semana 3 sí entra.
    const ambas = proyectarAceptados(
      ACTUALES,
      p,
      new Set(["tarea-cambia:t2", "fase-cambia:f1"]),
      ANCLA,
    );
    const setup2 = ambas.phases.find((f) => f.id === "f1")!;
    expect(setup2.durationWeeks).toBe(4);
    expect(setup2.tasks!.find((t) => t.id === "t2")!.weekIndex).toBe(3);
  });

  it("el `order` de las tareas se reasigna secuencial dentro de cada semana", () => {
    const p = propuestaIgual();
    p.phases[0].tasks!.push({ title: "A", weekIndex: 0, order: 7 });
    p.phases[0].tasks!.push({ title: "B", weekIndex: 0, order: 7 });
    const payload = proyectarAceptados(
      ACTUALES,
      p,
      new Set(["tarea-nueva:f1:2", "tarea-nueva:f1:3"]),
      ANCLA,
    );
    const semana0 = payload.phases[0].tasks!.filter((t) => t.weekIndex === 0);
    expect(semana0.map((t) => t.order)).toEqual([...semana0.keys()]);
  });

  it("aceptar TODO da el mismo cronograma que la propuesta completa", () => {
    /* El puente con lo de antes: «Aplicar todo» tiene que seguir siendo el reemplazo entero.
       Si divergiera, el botón de siempre pasaría a hacer otra cosa sin que nadie lo pidiera. */
    const p = propuestaIgual();
    p.phases[0].name = "Configuración inicial";
    p.phases[0].durationWeeks = 3;
    p.phases[0].tasks![0].title = "Configurar el pipeline de ventas";
    p.phases[0].tasks!.push({ title: "Migrar la base", weekIndex: 2, order: 2, party: "CLIENTE" });
    p.phases[1].tasks = [];
    p.phases.push({ name: "Seguimiento", order: 2, durationWeeks: 1, tasks: [] });

    const items = diffAssist(ACTUALES, p, ANCLA);
    const payload = proyectarAceptados(ACTUALES, p, todasLasClaves(items), ANCLA);

    expect(payload.phases.map((f) => f.name)).toEqual([
      "Configuración inicial",
      "Adopción",
      "Seguimiento",
    ]);
    expect(payload.phases[0].durationWeeks).toBe(3);
    expect(payload.phases[0].tasks!.map((t) => t.title).sort()).toEqual(
      ["Configurar el pipeline de ventas", "Crear propiedades", "Migrar la base"].sort(),
    );
    expect(payload.phases[1].tasks, "la fase que quedó vacía sí manda [] — es una baja aceptada").toEqual([]);
    expect(payload.phases[0].tasks!.find((t) => t.title === "Migrar la base")!.party).toBe("CLIENTE");
  });

  it("`party` y `type` no se pisan con null cuando la propuesta no los trae", () => {
    /* Contrato del PUT: `undefined` = no tocar. El dueño lo edita el CSE a mano en el Gantt;
       proyectarlo como null lo borraría al aceptar un cambio de título. */
    const actuales: FaseActual[] = [
      { ...ACTUALES[0], tasks: [tarea("t1", "Configurar pipeline", 0, { party: "SMARTEAM", type: "TASK" })] },
    ];
    const p: PropuestaDelAssist = {
      anchorStartDate: ANCLA,
      phases: [
        {
          id: "f1",
          name: "Setup",
          order: 0,
          durationWeeks: 2,
          startWeek: null,
          sessionCount: 2,
          notes: null,
          activityType: "CONFIGURACION",
          tasks: [{ id: "t1", title: "Configurar el pipeline", weekIndex: 0, order: 0 }],
        },
      ],
    };
    const items = diffAssist(actuales, p, ANCLA);
    expect(items.map((i) => i.key)).toEqual(["tarea-cambia:t1"]);
    const t = proyectarAceptados(actuales, p, new Set(["tarea-cambia:t1"]), ANCLA).phases[0].tasks![0];
    expect(t.party).toBe("SMARTEAM");
    expect(t.type).toBe("TASK");
  });
});

describe("el módulo llega a la pantalla", () => {
  /* La lección que este repo ya pagó dos veces: un dato que llega y NO se pinta es idéntico a un
     dato que no llega. `diffAssist` puede ser perfecto y estar completamente testeado mientras el
     banner sigue aplicando el reemplazo entero — y nada falla: ni tsc, ni eslint, ni los 16 tests
     de arriba. El endpoint devolvería una descomposición impecable para nadie. */
  const CANVAS = "components/canvas/CronogramaCanvas.tsx";
  const src = () => readFileSync(join(process.cwd(), CANVAS), "utf8");

  it("LA GUARDA: el canvas proyecta lo aceptado en vez de mandar la propuesta entera", () => {
    /* La edición que la pone en rojo: volver `applyProposal` a `JSON.stringify({ ...proposal })`. */
    const s = src();
    expect(s, "el canvas dejó de importar el módulo").toContain("proyectarAceptados");
    const i = s.indexOf("const applyProposal");
    expect(i, "desapareció applyProposal").toBeGreaterThan(-1);
    const cuerpo = s.slice(i, i + 2500);
    expect(cuerpo.length, "la guarda no está mirando nada").toBeGreaterThan(1000);
    expect(
      cuerpo,
      "aplicar volvió a ser todo-o-nada: los descartes del CSE no llegan al payload",
    ).toContain("proyectarAceptados(");
    expect(cuerpo, "el payload dejó de salir de la proyección").toContain("...cuerpo,");
    /* ⚠ Los dos `toContain` de arriba NO alcanzan y se comprobó rompiéndolos: cambiar la
       condición a `false` deja la llamada escrita, sin llamarse nunca, y pasan igual. Lo que de
       verdad decide es que la proyección esté gateada por el contador de descartes — o sea que
       descartar algo CAMBIE el payload. */
    const rama = cuerpo.slice(cuerpo.indexOf("const cuerpo ="), cuerpo.indexOf("const res ="));
    expect(rama.length, "cambió la forma de applyProposal; revisar esta guarda").toBeGreaterThan(100);
    expect(
      rama,
      "la proyección quedó desconectada del contador de descartes: descartar un ítem no cambia nada",
    ).toContain("assistDescartadosVivos > 0");
    expect(
      rama.includes("...proposal"),
      "el payload volvió a ser la propuesta cruda",
    ).toBe(false);
  });

  it("cada ítem se puede descartar de a uno", () => {
    // Sin el botón por fila, la descomposición existe y no hay forma de usarla.
    const s = src();
    expect(s).toContain("assistItems.map(");
    expect(s, "no hay botón de descarte por ítem").toContain("setAssistDescartados(");
  });

  it("una propuesta nueva no hereda los descartes de la anterior", () => {
    /* Es el modo de falla silencioso del estado: pedís un segundo cambio y la mitad no se
       aplica porque quedó descartada de la vuelta anterior, con claves que ni siquiera existen. */
    const s = src();
    const i = s.indexOf("deAssist: true");
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i, i + 400)).toContain("setAssistDescartados(new Set())");
  });
});
