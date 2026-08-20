/**
 * lib/timeline/operaciones.test.ts — UNA OPERACIÓN TOCA LO QUE NOMBRA, Y NADA MÁS.
 *
 * Correr: `npx vitest run lib/timeline/operaciones.test.ts --project unit`.
 *
 * ── EL CASO REAL QUE ORIGINÓ ESTE MÓDULO (2026-08-20) ────────────────────────────────────────
 * Elías pidió BORRAR UNA FASE. Con el contrato de reescritura completa, la propuesta volvió con
 * «6 fases modificadas · se corrió la fecha de cierre 70 días»: al re-emitir todo, el modelo soltó
 * el `startWeek` de seis fases que corrían en PARALELO, y el proyecto pasó de 17 a 27 semanas.
 *
 * Ese daño colateral es lo que estos tests hacen imposible. La primera prueba de abajo es
 * literalmente ese caso.
 */
import { describe, it, expect } from "vitest";
import { aplicarOperaciones, type Operacion } from "./operaciones";
import { validateTimelinePayload } from "./validate";
import type { FaseActual } from "./assist-items";

const tarea = (id: string, weekIndex: number, extra: Partial<FaseActual["tasks"][number]> = {}) => ({
  id,
  title: `tarea ${id}`,
  weekIndex,
  order: 0,
  notes: null,
  ...extra,
});

/** Un cronograma con fases en PARALELO — que es donde el contrato viejo hacía daño. */
const cronograma = (): FaseActual[] => [
  { id: "f1", name: "Semana 0", durationWeeks: 1, startWeek: null, tasks: [tarea("t1", 0)] },
  { id: "f2", name: "Sales Hub", durationWeeks: 4, startWeek: null, tasks: [tarea("t2", 0), tarea("t3", 3)] },
  { id: "f3", name: "Integraciones", durationWeeks: 6, startWeek: 2, tasks: [tarea("t4", 0), tarea("t5", 1)] },
  { id: "f4", name: "Reportería", durationWeeks: 4, startWeek: 9, tasks: [tarea("t6", 0)] },
];

describe("⭐ lo que no se nombra, no se toca", () => {
  it("⛔ acortar una fase NO le mueve el arranque relativo a las otras", () => {
    /* ES EL CASO DE LOS 70 DÍAS. Con el contrato viejo, tocar una fase soltaba el `startWeek` de
       las demás y el proyecto se estiraba 10 semanas. La edición que la pone en rojo: hacer que
       el payload emita `startWeek: null` para las fases intocadas. */
    const { payload } = aplicarOperaciones(cronograma(), "2026-05-19", [
      { op: "fase.duracion", phaseId: "f3", semanas: 2 },
    ]);
    const porId = new Map(payload.phases.map((p) => [p.id, p]));
    expect(porId.get("f3")!.durationWeeks).toBe(2);
    expect(porId.get("f3")!.startWeek, "la fase tocada conserva SU propio arranque").toBe(2);
    expect(porId.get("f4")!.startWeek, "una fase que nadie nombró perdió su arranque").toBe(9);
    expect(porId.get("f2")!.durationWeeks).toBe(4);
  });

  it("⛔ y una fase intocada sale SIN tareas — «no tocar» en el contrato del PUT", () => {
    /* Emitir el array siempre convertiría cada operación en un diff completo de esa fase, y el PUT
       borra por omisión. Es la misma regla que sostiene assist-items.ts. */
    const { payload } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "f3", semanas: 2 },
    ]);
    const porId = new Map(payload.phases.map((p) => [p.id, p]));
    expect(porId.get("f3")!.tasks, "la fase tocada SÍ manda sus tareas").toBeDefined();
    expect(porId.get("f2")!.tasks, "una fase intocada mandó tareas: el PUT va a diffear").toBeUndefined();
    expect(porId.get("f4")!.tasks).toBeUndefined();
  });

  it("renombrar no toca las tareas de nadie", () => {
    const { payload } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.renombrar", phaseId: "f2", nombre: "Sales" },
    ]);
    const f2 = payload.phases.find((p) => p.id === "f2")!;
    expect(f2.name).toBe("Sales");
    expect(f2.tasks, "renombrar no es motivo para reescribir sus tareas").toBeUndefined();
  });
});

describe("acortar acomoda lo que queda afuera, y lo dice", () => {
  it("⚠ la tarea de la semana 4 baja a la última que existe", () => {
    const { payload, avisos } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "f2", semanas: 2 },
    ]);
    const f2 = payload.phases.find((p) => p.id === "f2")!;
    expect(f2.tasks!.find((t) => t.id === "t3")!.weekIndex).toBe(1);
    expect(avisos.join(" ")).toContain("Sales Hub");
  });

  it("y lo que ya entraba no se reporta: un aviso que siempre aparece se deja de leer", () => {
    const { avisos } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "f2", semanas: 4 },
    ]);
    expect(avisos).toEqual([]);
  });
});

describe("borrar es una INTENCIÓN, no una omisión", () => {
  it("⭐ `fase.borrar` borra de verdad, con sus tareas", () => {
    /* La diferencia que solo las operaciones pueden expresar: el rescate del PUT repone lo que el
       modelo OMITIÓ (accidente), pero una fase nombrada por una persona que la leyó se borra.
       Es lo que deja que el chat pueda borrar lo que escribió un humano, previa confirmación. */
    const { payload, avisos } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.borrar", phaseId: "f4" },
    ]);
    expect(payload.phases.map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
    expect(avisos.join(" ")).toContain("Reportería");
  });

  it("`tarea.borrar` saca una sola y deja la fase marcada", () => {
    const { payload } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.borrar", taskId: "t3" },
    ]);
    const f2 = payload.phases.find((p) => p.id === "f2")!;
    expect(f2.tasks!.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("⛔ lo que no existe se RECHAZA con motivo, nunca en silencio", () => {
  it("una fase inventada no se aproxima a la más parecida", () => {
    /* El modo de falla que este módulo existe para impedir: rápido, silencioso y equivocado. */
    const { payload, rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "no-existe", semanas: 2 },
    ]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("no existe");
    expect(payload.phases, "el cronograma no se tocó").toHaveLength(4);
  });

  it("una tarea inventada también", () => {
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.mover-semana", taskId: "fantasma", semana: 1 },
    ]);
    expect(rechazadas).toHaveLength(1);
  });

  it("y una operación que no está en el vocabulario", () => {
    const inventada = { op: "fase.pintar-de-azul", phaseId: "f1" } as unknown as Operacion;
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [inventada]);
    expect(rechazadas).toHaveLength(1);
    expect(rechazadas[0].motivo).toContain("no es una operación válida");
  });

  it("una duración de cero se rechaza en vez de producir una fase imposible", () => {
    const { rechazadas } = aplicarOperaciones(cronograma(), null, [
      { op: "fase.duracion", phaseId: "f2", semanas: 0 },
    ]);
    expect(rechazadas[0].motivo).toContain("al menos 1 semana");
  });
});

describe("mudar una tarea de fase la RECREA, y se avisa", () => {
  it("⚠ pierde su id, que es como pierde su estado", () => {
    /* Es la regla dura de siempre: el cronograma no sabe mudar una tarea, la borra de un lado y la
       crea del otro. Callarlo sería prometer algo que el sistema no hace. */
    const { payload, avisos } = aplicarOperaciones(cronograma(), null, [
      { op: "tarea.mover-fase", taskId: "t3", phaseId: "f4" },
    ]);
    const f4 = payload.phases.find((p) => p.id === "f4")!;
    const mudada = f4.tasks!.find((t) => t.title === "tarea t3")!;
    expect(mudada.id, "llegó con id: el PUT la trataría como la misma y no lo es").toBeUndefined();
    expect(avisos.join(" ")).toContain("pierde su estado");
    expect(payload.phases.find((p) => p.id === "f2")!.tasks!.map((t) => t.id)).toEqual(["t2"]);
  });
});

describe("redistribuir reparte parejo sin reordenar", () => {
  it("6 tareas en 2 semanas quedan 3 y 3, en el mismo orden", () => {
    const seis: FaseActual[] = [
      {
        id: "f1",
        name: "Apretada",
        durationWeeks: 2,
        startWeek: null,
        tasks: [0, 0, 0, 0, 0, 0].map((_, i) => tarea(`t${i}`, 0)),
      },
    ];
    const { payload } = aplicarOperaciones(seis, null, [{ op: "fase.redistribuir", phaseId: "f1" }]);
    const semanas = payload.phases[0].tasks!.map((t) => t.weekIndex);
    expect(semanas.filter((w) => w === 0)).toHaveLength(3);
    expect(semanas.filter((w) => w === 1)).toHaveLength(3);
  });
});

describe("el resultado es aplicable tal cual por el PUT", () => {
  it("⭐ pasa el MISMO validador que usa el endpoint de escritura", () => {
    /* Es la prueba que cierra el círculo: si el payload no valida, las operaciones no sirven por
       más rápidas que sean. La edición que la pone en rojo: dejar de reasignar `order`. */
    const ops: Operacion[] = [
      { op: "fase.duracion", phaseId: "f2", semanas: 2 },
      { op: "fase.redistribuir", phaseId: "f2" },
      { op: "fase.borrar", phaseId: "f4" },
      { op: "arranque", fecha: "2026-06-01" },
    ];
    const { payload, rechazadas } = aplicarOperaciones(cronograma(), "2026-05-19", ops);
    expect(rechazadas).toEqual([]);
    const v = validateTimelinePayload(payload);
    expect(v.errors ?? [], "el payload de las operaciones no es aplicable").toEqual([]);
    expect(v.valid).toBe(true);
    expect(payload.anchorStartDate).toBe("2026-06-01");
  });

  it("sin operaciones, el cronograma sale idéntico y sin tocar ninguna tarea", () => {
    const { payload, avisos, rechazadas } = aplicarOperaciones(cronograma(), "2026-05-19", []);
    expect(avisos).toEqual([]);
    expect(rechazadas).toEqual([]);
    expect(payload.phases.every((p) => p.tasks === undefined)).toBe(true);
    expect(payload.phases.map((p) => p.startWeek)).toEqual([null, null, 2, 9]);
  });
});
