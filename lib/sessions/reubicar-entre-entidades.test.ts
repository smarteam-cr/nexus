/**
 * lib/sessions/reubicar-entre-entidades.test.ts — lo que cuelga de una reunión va con ella a la entidad nueva.
 *
 * Correr: `npx vitest run lib/sessions/reubicar-entre-entidades.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { contraparteEn, pierdeSuDuena, planDeFilas, planDeVinculos, vinculosQueFaltan, type ProyectoDelGrupo } from "./reubicar-entre-entidades";

/* El TEC después de separar: cada ficha con su «Información del cliente» y su proyecto de trabajo. */
const GRUPO = new Set(["tae", "ae"]);
const v = (id: string, sessionId: string, projectId: string, source = "agent", isPrimary = false) => ({ id, sessionId, projectId, source, isPrimary });
const PROYECTOS: ProyectoDelGrupo[] = [
  { id: "info-tae", clientId: "tae", esDeLaCuenta: true, esDeTrabajoActivo: false },
  { id: "p-tae", clientId: "tae", esDeLaCuenta: false, esDeTrabajoActivo: true },
  { id: "info-ae", clientId: "ae", esDeLaCuenta: true, esDeTrabajoActivo: false },
  { id: "p-ae", clientId: "ae", esDeLaCuenta: false, esDeTrabajoActivo: true },
];

describe("pierdeSuDuena", () => {
  const conDuena = { resolvedClientId: "bluesat", manualClientId: null };

  it("una reunión de afuera que quedaría sin dueña se conserva", () => {
    expect(pierdeSuDuena(conDuena, null, GRUPO)).toBe(true);
  });

  it("no: la que el resolver da a otra ficha (es otra deriva), la que ya es del grupo, la manual ni la sin dueña", () => {
    expect(pierdeSuDuena(conDuena, "otra", GRUPO)).toBe(false);
    expect(pierdeSuDuena(conDuena, "ae", GRUPO)).toBe(false);
    expect(pierdeSuDuena({ resolvedClientId: "ae", manualClientId: null }, null, GRUPO)).toBe(false);
    expect(pierdeSuDuena({ resolvedClientId: "bluesat", manualClientId: "bluesat" }, null, GRUPO)).toBe(false);
    expect(pierdeSuDuena({ resolvedClientId: null, manualClientId: null }, null, GRUPO)).toBe(false);
  });
});

describe("contraparteEn", () => {
  it("proyecto de trabajo ↔ proyecto de trabajo, la cuenta ↔ la cuenta, y el mismo si ya es de ahí", () => {
    expect(contraparteEn("p-tae", "ae", PROYECTOS)).toBe("p-ae");
    expect(contraparteEn("info-ae", "tae", PROYECTOS)).toBe("info-tae");
    expect(contraparteEn("p-ae", "ae", PROYECTOS)).toBe("p-ae");
  });

  it("con dos proyectos de trabajo en el destino no adivina", () => {
    const dos = [...PROYECTOS, { id: "p-ae-2", clientId: "ae", esDeLaCuenta: false, esDeTrabajoActivo: true }];
    expect(contraparteEn("p-tae", "ae", dos)).toBeNull();
    expect(contraparteEn("no-existe", "ae", PROYECTOS)).toBeNull();
  });
});

describe("planDeVinculos", () => {
  it("mueve el vínculo al proyecto equivalente, suelta el duplicado y suelta todo lo de una reunión por decidir", () => {
    const dueno = new Map<string, string | null>([
      ["s-ae", "ae"],
      ["s-dos", "ae"],
      ["s-duda", null],
      ["s-tae", "tae"],
    ]);
    const plan = planDeVinculos(
      [
        v("1", "s-ae", "p-tae"),
        v("2", "s-dos", "p-tae"),
        v("3", "s-dos", "p-ae", "manual"),
        v("4", "s-duda", "p-tae"),
        v("5", "s-tae", "p-tae"),
        v("6", "otra", "p-tae"),
      ],
      dueno,
      PROYECTOS,
    );
    expect(plan).toEqual([
      { id: "1", accion: "mover", de: "p-tae", a: "p-ae" },
      { id: "2", accion: "soltar", motivo: "ya-tiene-el-equivalente" },
      { id: "4", accion: "soltar", motivo: "por-decidir" },
    ]);
  });

  it("dos vínculos de la misma reunión al otro lado: el primero se mueve, el segundo no lo duplica", () => {
    const plan = planDeVinculos(
      [
        v("a", "s", "p-tae"),
        v("b", "s", "info-tae"),
        v("c", "s", "info-tae", "legacy"),
      ],
      new Map([["s", "ae"]]),
      PROYECTOS,
    );
    expect(plan).toEqual([
      { id: "a", accion: "mover", de: "p-tae", a: "p-ae" },
      { id: "b", accion: "mover", de: "info-tae", a: "info-ae" },
      { id: "c", accion: "soltar", motivo: "ya-tiene-el-equivalente" },
    ]);
  });
});

describe("el principal y los vínculos que faltan", () => {
  it("si se suelta el principal porque ya estaba el equivalente, el equivalente pasa a principal", () => {
    const plan = planDeVinculos([v("1", "s", "p-tae", "agent", true), v("2", "s", "p-ae")], new Map([["s", "ae"]]), PROYECTOS);
    expect(plan).toEqual([
      { id: "1", accion: "soltar", motivo: "ya-tiene-el-equivalente" },
      { id: "2", accion: "hacer-principal" },
    ]);
  });

  it("si ya queda otro principal, no promueve", () => {
    const plan = planDeVinculos(
      [v("1", "s", "p-tae", "agent", true), v("2", "s", "p-ae"), v("3", "s", "info-ae", "agent", true)],
      new Map([["s", "ae"]]),
      PROYECTOS,
    );
    expect(plan).toEqual([{ id: "1", accion: "soltar", motivo: "ya-tiene-el-equivalente" }]);
  });

  it("una reunión que entra desde otra ficha suelta el vínculo con el proyecto de esa ficha; una por decidir no lo toca", () => {
    const dueno = new Map<string, string | null>([["entra", "tae"], ["duda", null]]);
    expect(planDeVinculos([v("1", "entra", "p-smarteam"), v("2", "duda", "p-smarteam")], dueno, PROYECTOS)).toEqual([
      { id: "1", accion: "soltar", motivo: "de-otra-ficha" },
    ]);
  });

  it("vincula al único proyecto de trabajo a la reunión que no quedó en él; no a la por decidir ni a la que ya está", () => {
    const dueno = new Map<string, string | null>([["sin", "ae"], ["ya", "ae"], ["movida", "ae"], ["duda", null]]);
    const vinculos = [v("1", "ya", "p-ae"), v("2", "movida", "p-tae")];
    const plan = planDeVinculos(vinculos, dueno, PROYECTOS);
    expect(vinculosQueFaltan(vinculos, plan, dueno, PROYECTOS)).toEqual([{ sessionId: "sin", projectId: "p-ae" }]);
  });

  it("con dos proyectos de trabajo no adivina", () => {
    const dos = [...PROYECTOS, { id: "p-ae-2", clientId: "ae", esDeLaCuenta: false, esDeTrabajoActivo: true }];
    expect(vinculosQueFaltan([], [], new Map([["s", "ae"]]), dos)).toEqual([]);
  });
});

describe("planDeFilas", () => {
  const dueno = new Map<string, string | null>([
    ["s-ae", "ae"],
    ["s-duda", null],
    ["s-tae", "tae"],
  ]);

  it("la reunión manda: un hecho de AE que estaba en TAE va a AE y a su proyecto", () => {
    const plan = planDeFilas(
      [
        { id: "h1", clientId: "tae", projectId: "p-tae", sessionId: "s-ae" },
        { id: "h2", clientId: "tae", projectId: null, sessionId: "s-ae" },
        // Lo movió `separar` por su proyecto, pero la reunión es de TAE: vuelve.
        { id: "h3", clientId: "ae", projectId: "p-ae", sessionId: "s-tae" },
        { id: "h4", clientId: "tae", projectId: "p-tae", sessionId: "s-tae" },
        { id: "h5", clientId: "tae", projectId: "p-tae", sessionId: "s-duda" },
        { id: "h6", clientId: "tae", projectId: "p-tae", sessionId: null },
      ],
      dueno,
      PROYECTOS,
      false,
      GRUPO,
    );
    expect(plan).toEqual([
      { id: "h1", accion: "mover", clientId: "ae", projectId: "p-ae" },
      { id: "h2", accion: "mover", clientId: "ae", projectId: null },
      { id: "h3", accion: "mover", clientId: "tae", projectId: "p-tae" },
      { id: "h5", accion: "queda", motivo: "por-decidir" },
    ]);
  });

  it("sin proyecto equivalente: si la columna es obligatoria o el proyecto es de afuera, la fila se queda", () => {
    const dos = [...PROYECTOS, { id: "p-ae-2", clientId: "ae", esDeLaCuenta: false, esDeTrabajoActivo: true }];
    const filas = [
      { id: "t1", clientId: "tae", projectId: "p-tae", sessionId: "s-ae" },
      { id: "t2", clientId: "tae", projectId: "p-afuera", sessionId: "s-ae" },
    ];
    expect(planDeFilas(filas, dueno, dos, true, GRUPO)).toEqual([
      { id: "t1", accion: "queda", motivo: "sin-equivalente" },
      { id: "t2", accion: "queda", motivo: "sin-equivalente" },
    ]);
    expect(planDeFilas(filas, dueno, dos, false, GRUPO)).toEqual([
      { id: "t1", accion: "mover", clientId: "ae", projectId: null },
      { id: "t2", accion: "queda", motivo: "sin-equivalente" },
    ]);
  });

  it("una fila de otra empresa colgada de una reunión del grupo no se toca", () => {
    const filas = [{ id: "ajena", clientId: "smarteam", projectId: null, sessionId: "s-ae" }];
    expect(planDeFilas(filas, dueno, PROYECTOS, false, GRUPO)).toEqual([]);
  });
});
