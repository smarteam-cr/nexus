/**
 * lib/timeline/heredar-omitidos.test.ts
 *
 * Correr: `npx vitest run lib/timeline/heredar-omitidos.test.ts --project unit`.
 *
 * El modo de falla que esto cierra no se ve en ningún error: el CSE pide «alarga Setup una semana»,
 * el modelo devuelve Setup sin su nota y con una tarea mudada sin dueño, y al aplicar la nota y el
 * dueño desaparecen. Todo valida; el PUT hace exactamente lo que le mandaron.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { heredarLoOmitido, type FaseParaHeredar } from "./heredar-omitidos";
import { diffAssist, type FaseActual, type PropuestaDelAssist } from "./assist-items";

const ACTUALES: FaseParaHeredar[] = [
  {
    id: "f1",
    startWeek: 3,
    activityType: "CONFIGURACION",
    sessionCount: 2,
    notes: "Nota interna de Setup",
    tasks: [
      { id: "t1", title: "Configurar pipeline", party: "SMARTEAM", type: "TASK", notes: "Con el equipo de ventas" },
      { id: "t2", title: "Capacitación de usuarios", party: "AMBOS", type: "SESSION", notes: "Dos grupos" },
    ],
  },
  {
    id: "f2",
    startWeek: null,
    activityType: "ADOPCION",
    sessionCount: 1,
    notes: null,
    tasks: [{ id: "t3", title: "Onboarding por rol", party: "CLIENTE", type: "TASK", notes: null }],
  },
];

type Json = Record<string, unknown> & { phases: Array<Record<string, unknown> & { tasks?: Array<Record<string, unknown>> }> };

/** El crudo del modelo: repite las dos fases, pero de Setup OMITE los cuatro campos. */
function crudo(): Json {
  return {
    phases: [
      {
        id: "f1",
        name: "Setup",
        order: 0,
        durationWeeks: 3,
        tasks: [{ id: "t1", title: "Configurar pipeline", weekIndex: 0, order: 0 }],
      },
      {
        id: "f2",
        name: "Adopción",
        order: 1,
        durationWeeks: 2,
        startWeek: null,
        activityType: "ADOPCION",
        sessionCount: 1,
        notes: null,
        tasks: [
          { id: "t3", title: "Onboarding por rol", weekIndex: 0, order: 0 },
          // t2 se MUDA de Setup a Adopción: sin id (la ruta se lo quitaría igual) y sin dueño.
          { title: "capacitacion  de usuarios", weekIndex: 1, order: 0 },
        ],
      },
    ],
  };
}

describe("heredarLoOmitido — la fase", () => {
  it("⭐ una fase sin startWeek hereda 3; con startWeek: null queda null (el null es un pedido)", () => {
    const c = crudo();
    heredarLoOmitido(c, ACTUALES);
    expect(c.phases[0].startWeek, "la fase perdió su arranque fijo por omisión").toBe(3);

    const conNull = crudo();
    conNull.phases[0].startWeek = null;
    heredarLoOmitido(conNull, ACTUALES);
    expect(conNull.phases[0].startWeek, "un null explícito se pisó con lo actual").toBeNull();
  });

  it("una nota de fase omitida hereda, y también el tipo y las sesiones", () => {
    const c = crudo();
    heredarLoOmitido(c, ACTUALES);
    expect(c.phases[0].notes).toBe("Nota interna de Setup");
    expect(c.phases[0].activityType).toBe("CONFIGURACION");
    expect(c.phases[0].sessionCount).toBe(2);
  });

  it("no toca nombre, duración, orden ni inventa un `tasks` que no vino", () => {
    const c = crudo();
    delete c.phases[1].tasks;
    heredarLoOmitido(c, ACTUALES);
    expect(c.phases[0].durationWeeks, "la duración pedida es la del modelo").toBe(3);
    expect(c.phases[0].name).toBe("Setup");
    expect(c.phases[0].order).toBe(0);
    expect("tasks" in c.phases[1], "«tasks ausente = []» es regla de la ruta, no de la herencia").toBe(false);
  });

  it("una fase NUEVA (sin id o con id desconocido) no hereda nada", () => {
    const c: Json = { phases: [{ name: "Nueva", order: 0, durationWeeks: 1 }, { id: "inventado", name: "X", order: 1, durationWeeks: 1 }] };
    expect(heredarLoOmitido(c, ACTUALES).heredados).toBe(0);
    expect("startWeek" in c.phases[0]).toBe(false);
  });
});

describe("heredarLoOmitido — las tareas", () => {
  it("⭐ una tarea mudada CON id y sin party/type hereda; un null explícito sigue null", () => {
    const c = crudo();
    // El modelo movió t1 a Adopción conservando su id: la ruta se lo quita después (delete+create).
    const t1 = c.phases[0].tasks!.shift()!;
    c.phases[1].tasks!.push({ ...t1, party: null });
    heredarLoOmitido(c, ACTUALES);
    const movida = c.phases[1].tasks!.find((t) => t.id === "t1")!;
    expect(movida.type, "la tarea mudada perdió su tipo").toBe("TASK");
    expect(movida.notes).toBe("Con el equipo de ventas");
    expect(movida.party, "«quítale el dueño» dejó de funcionar: el null explícito se pisó").toBeNull();
  });

  it("⭐ una tarea SIN id con título único de otra fase hereda dueño, tipo y nota", () => {
    const c = crudo();
    const r = heredarLoOmitido(c, ACTUALES);
    const mudada = c.phases[1].tasks![1];
    expect(r.mudanzas).toEqual(["t2"]);
    expect(mudada.party, "la tarea mudada nació sin dueño").toBe("AMBOS");
    expect(mudada.type).toBe("SESSION");
    expect(mudada.notes).toBe("Dos grupos");
    // Nada más cambia en la tarea.
    expect(mudada.title).toBe("capacitacion  de usuarios");
    expect(mudada.weekIndex).toBe(1);
  });

  it("con dos homónimas no se adivina: ninguna hereda", () => {
    const c = crudo();
    c.phases[1].tasks!.push({ title: "Capacitación de usuarios", weekIndex: 0, order: 1 });
    const r = heredarLoOmitido(c, ACTUALES);
    expect(r.mudanzas).toEqual([]);
    for (const t of c.phases[1].tasks!.slice(1)) expect("party" in t).toBe(false);
  });

  it("una homónima en la MISMA fase de origen no es una mudanza", () => {
    const c = crudo();
    c.phases[1].tasks!.pop();
    c.phases[0].tasks!.push({ title: "Capacitación de usuarios", weekIndex: 1, order: 0 });
    expect(heredarLoOmitido(c, ACTUALES).mudanzas).toEqual([]);
  });

  it("tolera basura sin reventar", () => {
    expect(heredarLoOmitido(null, ACTUALES)).toEqual({ heredados: 0, mudanzas: [] });
    expect(heredarLoOmitido({ phases: "x" }, ACTUALES)).toEqual({ heredados: 0, mudanzas: [] });
    expect(heredarLoOmitido({ phases: [null, 3, { id: "f1", tasks: [null, "x"] }] }, ACTUALES).heredados).toBe(4);
  });
});

describe("⭐ paridad con la vista previa: el servidor reconoce las MISMAS mudanzas que diffAssist", () => {
  /* Si la herencia reconociera una mudanza que la vista previa no muestra (o al revés), el CSE
     vería «Tarea nueva» sin dueño mientras el servidor la aplica con dueño — o una mudanza que
     llega sin heredar nada. Por eso la llave es la `huella` EXPORTADA de assist-items. */
  const comoActuales: FaseActual[] = ACTUALES.map((f, i) => ({
    ...f,
    name: `Fase ${i}`,
    order: i,
    durationWeeks: 2,
    tasks: f.tasks.map((t) => ({ ...t, weekIndex: 0, party: t.party as never, type: t.type as never })),
  }));

  it("los ids mudados coinciden con los ítems «tarea-se-muda»", () => {
    const casos: Json[] = [crudo()];
    const conHomonimas = crudo();
    conHomonimas.phases[1].tasks!.push({ title: "Capacitación de usuarios", weekIndex: 0, order: 1 });
    casos.push(conHomonimas);
    const sinSetup = crudo();
    sinSetup.phases.shift(); // la fase de origen se va: la mudanza sobrevive igual
    casos.push(sinSetup);

    for (const c of casos) {
      const deLaVista = diffAssist(comoActuales, structuredClone(c) as unknown as PropuestaDelAssist, null)
        .filter((i) => i.clase === "tarea-se-muda")
        .map((i) => i.key.replace("tarea-se-muda:", ""));
      expect(heredarLoOmitido(c, ACTUALES).mudanzas).toEqual(deLaVista);
    }
  });
});

describe("⛔ la ruta del modificador usa la herencia, y ANTES de juzgar la propuesta", () => {
  const RUTA = "app/api/projects/[projectId]/timeline/assist/route.ts";
  const src = readFileSync(join(process.cwd(), RUTA), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

  it("el modelo VE el dueño y el tipo de cada tarea (y la herencia los tiene de dónde sacar)", () => {
    /* Sin party/type en el select, el prompt le pide «devuélvelas con los valores que ya traían»
       a un modelo que nunca los vio. `FaseParaHeredar` los exige: sacarlos rompe tsc también. */
    const i = src.indexOf("tasks: {");
    const select = src.slice(i, src.indexOf("}", src.indexOf("select: {", i)) + 1);
    expect(select, "no encontré el select de las tareas").toContain("select: {");
    expect(select, "el modelo dejó de ver el dueño de cada tarea").toContain("party: true");
    expect(select, "el modelo dejó de ver el tipo de cada tarea").toContain("type: true");
  });

  it("⭐ heredarLoOmitido(parsedRaw corre ANTES de repararPropuesta(parsedRaw)", () => {
    /* Después del validador ya es tarde: `sessionCount` y `notes` omitidos ya son null, y no se
       distingue un null pedido de uno por omisión. */
    const herencia = src.indexOf("heredarLoOmitido(parsedRaw, tl.phases)");
    const reparar = src.indexOf("repararPropuesta(parsedRaw)");
    expect(herencia, "la ruta dejó de heredar lo omitido").toBeGreaterThan(-1);
    expect(reparar).toBeGreaterThan(-1);
    expect(herencia, "la herencia corre DESPUÉS de reparar/validar: ya no ve qué se omitió").toBeLessThan(reparar);
  });
});
