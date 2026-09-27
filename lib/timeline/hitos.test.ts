/**
 * lib/timeline/hitos.test.ts — el clasificador de hitos y sus guardianes (M2 P2a, 2026-09-27). Puro: sin base.
 *
 * Correr: `npx vitest run lib/timeline/hitos.test.ts --project unit`.
 *
 * Lo que cuida (lib/timeline/hitos.ts): que el kickoff, el cierre y la entrega se reconozcan por el título con los
 * títulos REALES de la cartera (`__fixtures__/hitos.json`, que se LEE: nunca se importa un JSON de __fixtures__), que
 * los negativos no pasen, que la marca `hito:kickoff` mande y que una huella de particularidad no se lea como hito, y
 * cómo se eligen el guardián, los sobrantes y lo hecho de más. La regla que usa todo esto (R15) la cuida
 * `tareas-del-detalle.test.ts`. Cada `it` nombra la edición que lo pone en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  claveDelHito,
  esFaseDeCierre,
  esFaseDeHito,
  esKickoffPorMarca,
  hitosDeLaTarea,
  hitosDelProyecto,
  MARCA_DE_KICKOFF,
  motivoDelSobrante,
  observacionDeHechosDeMas,
  observacionDeHitoQueNoEntra,
  observacionDeLasQueNoEntran,
  TAREA_DE_KICKOFF,
  type FaseConTareas,
  type Hito,
  type TareaParaHitos,
} from "./hitos";

interface TituloDelFixture {
  title: string;
  type: string;
  porque?: string;
}
interface CasoDeCierre {
  title: string;
  type: string;
  fase: string;
  esUltima: boolean;
  hitos: Hito[];
}
const FIXTURE = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/timeline/__fixtures__/hitos.json"), "utf8")) as {
  kickoff: { reconoce: TituloDelFixture[]; descarta: TituloDelFixture[] };
  cierreYEntrega: CasoDeCierre[];
};
const SEMANA_0 = { name: "Semana 0", esUltima: false };

describe("⭐ el kickoff por el título (los títulos reales)", () => {
  it("reconoce los 12 títulos distintos de kickoff de producción", () => {
    /* La edición que la pone en rojo: acotar el regex del kickoff (sin «re ?arranque», sin «sesion de arranque»). */
    const titulos = FIXTURE.kickoff.reconoce.map((t) => t.title);
    expect(new Set(titulos).size).toBe(12);
    const noReconocidos = FIXTURE.kickoff.reconoce.filter((t) => !hitosDeLaTarea(t, SEMANA_0).includes("kickoff"));
    expect(noReconocidos.map((t) => t.title)).toEqual([]);
  });

  it("⛔ descarta lo que habla del kickoff pero no ES el kickoff (una parte, interno, previa, minuta, una TASK)", () => {
    /* La edición que la pone en rojo: quitar `PARTE` («Kick-off técnico de la integración SAP» pasa), quitar
       `NO_ES_EL_HITO` («Kickoff interno del equipo», «Reunión previa al kickoff», «Seguimiento post kick-off», «Minuta
       del kickoff» pasan) o aceptar TASK («Sesión de kick-off del proyecto» como TASK pasa). */
    const colados = FIXTURE.kickoff.descarta.filter((t) => hitosDeLaTarea(t, SEMANA_0).length > 0);
    expect(colados.map((t) => `${t.title} (${t.type}): ${t.porque}`)).toEqual([]);
    expect(FIXTURE.kickoff.descarta.map((t) => t.title)).toEqual(
      expect.arrayContaining([
        "Kick-off técnico de la integración SAP",
        "Preparar agenda del kickoff",
        "Kickoff interno del equipo",
        "Reunión previa al kickoff",
        "Seguimiento post kick-off",
        "Minuta del kickoff",
      ]),
    );
  });
});

describe("⭐ el cierre y la entrega: solo en una fase de hito, SESSION y título estricto", () => {
  it("cada caso real da exactamente sus hitos (el go-live no es la entrega; un reporte de cierre no es el cierre)", () => {
    /* La edición que la pone en rojo: aceptar «Capacitación y cierre Service» como fase de hito (buscar «cierre» en
       cualquier lugar del nombre), contar el go-live como entrega, o quitar la exclusión de `reporte`. */
    const distintos = FIXTURE.cierreYEntrega
      .map((c) => ({ c, dio: hitosDeLaTarea(c, { name: c.fase, esUltima: c.esUltima }) }))
      .filter(({ c, dio }) => JSON.stringify(dio) !== JSON.stringify(c.hitos))
      .map(({ c, dio }) => `«${c.title}» en «${c.fase}»: esperaba [${c.hitos.join(", ")}], dio [${dio.join(", ")}]`);
    expect(distintos).toEqual([]);
  });

  it("la fase de hito: la de cierre por nombre, o la última si no nombra un hub", () => {
    expect(esFaseDeCierre("Cierre con junta directiva")).toBe(true);
    expect(esFaseDeCierre("Go-live y cierre")).toBe(true);
    expect(esFaseDeCierre("Entrega y activación")).toBe(true);
    expect(esFaseDeCierre("Capacitación y cierre Service")).toBe(false);
    expect(esFaseDeHito("Capacitación y cierre Service", false)).toBe(false);
    expect(esFaseDeHito("Capacitación & Go Live", true)).toBe(true);
    expect(esFaseDeHito("Configuración Marketing Hub", true)).toBe(false);
  });
});

describe("⛔ la marca `hito:kickoff` manda; una huella de particularidad nunca es un hito", () => {
  it("una tarea renombrada con la marca sigue siendo el kickoff; sin marca, no", () => {
    /* La edición que la pone en rojo: leer cualquier marca como hito (`!!marca`, o buscar «kickoff» adentro). */
    const renombrada = { title: "Reunión inicial con el equipo", type: "SESSION" };
    expect(hitosDeLaTarea({ ...renombrada, marca: MARCA_DE_KICKOFF }, SEMANA_0)).toEqual(["kickoff"]);
    expect(hitosDeLaTarea(renombrada, SEMANA_0)).toEqual([]);
    expect(esKickoffPorMarca("cmr1abc:ATRASO:x")).toBe(false);
    expect(esKickoffPorMarca("cmr1abc:ATRASO:kickoff-del-proyecto")).toBe(false);
    expect(hitosDeLaTarea({ ...renombrada, marca: "cmr1abc:COMPROMISO:kickoff" }, SEMANA_0)).toEqual([]);
    expect(esKickoffPorMarca(null)).toBe(false);
    expect(esKickoffPorMarca(undefined)).toBe(false);
  });

  it("el kickoff del sistema: «Sesión de kickoff del proyecto», semana 0, AMBOS, SESSION, sin nota ni «por validar»", () => {
    expect(TAREA_DE_KICKOFF).toEqual({
      title: "Sesión de kickoff del proyecto",
      weekIndex: 0,
      notes: null,
      party: "AMBOS",
      type: "SESSION",
      needsValidation: false,
      motivoPorValidar: null,
      fuga: null,
      hito: ["kickoff"],
    });
    expect(hitosDeLaTarea(TAREA_DE_KICKOFF, SEMANA_0)).toEqual(["kickoff"]);
  });
});

const tarea = (id: string, title: string, extra: Partial<TareaParaHitos> = {}): TareaParaHitos => ({
  id,
  title,
  type: "SESSION",
  status: "PENDING",
  source: "AGENT",
  weekIndex: 0,
  ...extra,
});
const fase = (id: string, name: string, tareas: TareaParaHitos[]): FaseConTareas => ({ id, name, tareas });

/** Wherex (títulos reales, cliente anonimizado): 3 kickoffs en la Semana 0, la entrega y el cierre en sus fases. */
const WHEREX: FaseConTareas[] = [
  fase("f00", "Semana 0", [
    tarea("k1", "Sesión de kickoff: equipo, roles y accesos", { status: "DONE" }),
    tarea("k2", "Sesión de kick-off formal del proyecto", { status: "DONE" }),
    tarea("k3", "Sesión de kick-off del proyecto"),
  ]),
  fase("f01", "Capacitación y cierre Service", [tarea("s1", "Sesión de cierre")]),
  fase("f02", "Cierre y entrega", [tarea("e1", "Entrega formal del proyecto a Cliente")]),
  fase("f03", "Cierre con junta directiva", [tarea("c1", "Sesión de cierre con junta directiva")]),
  fase("f04", "Integración Circle", [tarea("x1", "Configurar el conector", { type: "TASK" })]),
];

describe("⭐ los guardianes, los sobrantes y lo hecho de más", () => {
  it("Wherex: guarda el primer kickoff hecho, sobra el pendiente y se nombran los dos hechos", () => {
    /* La edición que la pone en rojo: elegir el guardián sin mirar el estado (ganaría el pendiente), o dejar de
       juntar los hechos de más. */
    const h = hitosDelProyecto({ fases: WHEREX, recurrente: false });
    expect(h.guardianes.get("kickoff")).toEqual({
      hito: "kickoff",
      ciclo: null,
      tareaId: "k1",
      faseId: "f00",
      titulo: "Sesión de kickoff: equipo, roles y accesos",
      estado: "hecho",
    });
    expect(h.guardianes.get("entrega")?.tareaId).toBe("e1");
    expect(h.guardianes.get("cierre")?.tareaId).toBe("c1"); // no la «Sesión de cierre» de Service
    expect(h.sobrantes).toEqual([{ tareaId: "k3", faseId: "f00", guardian: h.guardianes.get("kickoff") }]);
    expect(h.hechosDeMas).toEqual([
      {
        hito: "kickoff",
        fases: [{ id: "f00", nombre: "Semana 0" }],
        titulos: ["Sesión de kickoff: equipo, roles y accesos", "Sesión de kick-off formal del proyecto"],
      },
    ]);
    expect(observacionDeHechosDeMas(h.hechosDeMas[0])).toBe(
      "Hay 2 kickoffs hechos en «Semana 0»: «Sesión de kickoff: equipo, roles y accesos» y «Sesión de kick-off formal del proyecto». Si son la misma sesión, borra la segunda desde su fila del cronograma.",
    );
    expect(motivoDelSobrante(h.guardianes.get("kickoff")!)).toBe("Ya hay un kickoff hecho: «Sesión de kickoff: equipo, roles y accesos».");
    expect(h.aManoDeMas).toEqual([]);
  });

  it("el orden del guardián: hecho, en curso, a mano y pendiente de la IA; una suspendida no cuenta", () => {
    /* La edición que la pone en rojo: poner lo escrito a mano después de lo de la IA, o contar la suspendida. */
    const conEstados = (...ts: TareaParaHitos[]) => hitosDelProyecto({ fases: [fase("s0", "Semana 0", ts)], recurrente: false });
    const a = conEstados(
      tarea("ia", "Sesión de kick-off del proyecto"),
      tarea("mano", "Reunión de inicio", { source: "HUMAN" }),
      tarea("curso", "Sesión de arranque del proyecto", { status: "IN_PROGRESS" }),
    );
    expect(a.guardianes.get("kickoff")).toMatchObject({ tareaId: "curso", estado: "en curso" });
    expect(a.sobrantes.map((s) => s.tareaId)).toEqual(["ia"]);
    expect(a.aManoDeMas).toEqual([{ titulo: "Reunión de inicio", faseId: "s0" }]);
    const b = conEstados(tarea("ia", "Sesión de kick-off del proyecto"), tarea("mano", "Reunión de inicio", { source: "HUMAN" }));
    expect(b.guardianes.get("kickoff")).toMatchObject({ tareaId: "mano", estado: "pendiente" });
    expect(b.sobrantes.map((s) => s.tareaId)).toEqual(["ia"]);
    const c = conEstados(tarea("susp", "Sesión de kick-off del proyecto", { status: "SUSPENDED" }), tarea("ia", "Sesión de kickoff oficial"));
    expect(c.guardianes.get("kickoff")?.tareaId).toBe("ia");
    expect(c.sobrantes).toEqual([]);
  });

  it("⛔ el sobrante solo si los dos son kickoff: «Kickoff interno» hecho no guarda nada", () => {
    /* La edición que la pone en rojo: quitar `NO_ES_EL_HITO` (el interno pasa a guardián y el pendiente sobra). */
    const h = hitosDelProyecto({
      fases: [fase("s0", "Semana 0", [tarea("int", "Kickoff interno del equipo", { status: "DONE" }), tarea("ia", "Sesión de kick-off del proyecto")])],
      recurrente: false,
    });
    expect(h.guardianes.get("kickoff")?.tareaId).toBe("ia");
    expect(h.sobrantes).toEqual([]);
  });

  it("⛔ cierre y entrega nunca sobran: un segundo existente no se quita", () => {
    const h = hitosDelProyecto({
      fases: [
        fase("a", "Cierre y entrega", [tarea("e1", "Entrega formal del proyecto a Cliente")]),
        fase("b", "Entrega final", [tarea("e2", "Sesión de entrega formal del proyecto")]),
      ],
      recurrente: false,
    });
    expect(h.guardianes.get("entrega")?.tareaId).toBe("e1");
    expect(h.sobrantes).toEqual([]);
  });

  it("⭐ D8 · la entrega de un recurrente va por ciclo; sin el tag, una por proyecto", () => {
    /* La edición que la pone en rojo: calcular el ciclo sin el tag, o no cerrar el ciclo en la fase de la entrega. */
    const fases = [
      fase("f1", "Operación ciclo 1", []),
      fase("c1", "Cierre ciclo 1", [tarea("e1", "Sesión de entrega del ciclo 1", { status: "DONE" })]),
      fase("f2", "Operación ciclo 2", []),
      fase("c2", "Cierre ciclo 2", [tarea("e2", "Sesión de entrega del ciclo 2", { status: "DONE" })]),
    ];
    const rec = hitosDelProyecto({ fases, recurrente: true });
    expect([...rec.ciclos]).toEqual([
      ["f1", 1],
      ["c1", 1],
      ["f2", 2],
      ["c2", 2],
    ]);
    expect(rec.guardianes.get(claveDelHito("entrega", 1))?.tareaId).toBe("e1");
    expect(rec.guardianes.get(claveDelHito("entrega", 2))?.tareaId).toBe("e2");
    expect(rec.hechosDeMas).toEqual([]); // una por ciclo no es de más
    const sinTag = hitosDelProyecto({ fases, recurrente: false });
    expect(sinTag.ciclos.size).toBe(0);
    expect(sinTag.guardianes.get("entrega")?.tareaId).toBe("e1");
    expect(sinTag.hechosDeMas.map((x) => [x.hito, x.titulos.length])).toEqual([["entrega", 2]]);
    expect(observacionDeHechosDeMas(sinTag.hechosDeMas[0])).toBe(
      "Hay 2 entregas hechas en «Cierre ciclo 1» y «Cierre ciclo 2»: «Sesión de entrega del ciclo 1» y «Sesión de entrega del ciclo 2». Si son la misma sesión, borra la segunda desde su fila del cronograma.",
    );
  });
});

describe("los textos (tuteo, cortos)", () => {
  it("la IA que vuelve a proponer un hito, y la que lo propone dos veces", () => {
    const hecho = { hito: "kickoff" as const, ciclo: null, tareaId: "k1", faseId: "s0", titulo: "Sesión de kickoff: equipo, roles y accesos", estado: "hecho" as const };
    expect(observacionDeHitoQueNoEntra("kickoff", hecho)).toBe(
      "La IA volvió a proponer el kickoff: no se suma, ya está «Sesión de kickoff: equipo, roles y accesos» (hecho).",
    );
    expect(observacionDeHitoQueNoEntra("entrega", { ...hecho, hito: "entrega", titulo: "Entrega formal", estado: "pendiente" })).toBe(
      "La IA volvió a proponer la entrega: no se suma, ya está «Entrega formal» (pendiente).",
    );
    expect(observacionDeHitoQueNoEntra("kickoff", { ...hecho, tareaId: null, titulo: "Sesión de arranque", estado: "pendiente" })).toBe(
      "La IA propuso el kickoff más de una vez: entra solo «Sesión de arranque».",
    );
  });

  it("«No entran N tareas de la IA»: solo las partes que no son cero", () => {
    expect(observacionDeLasQueNoEntran({ repiten: 0 })).toBeNull();
    expect(observacionDeLasQueNoEntran({ repiten: 1 })).toBe("No entra 1 tarea de la IA: repite una que ya está.");
    expect(observacionDeLasQueNoEntran({ repiten: 3 })).toBe("No entran 3 tareas de la IA: repiten una que ya está.");
    expect(observacionDeLasQueNoEntran({ repiten: 0, enElPasado: 2 })).toBe("No entran 2 tareas de la IA: caen en semanas que ya pasaron.");
    expect(observacionDeLasQueNoEntran({ repiten: 3, enElPasado: 2 })).toBe(
      "No entran 5 tareas de la IA: 2 caen en semanas que ya pasaron y 3 repiten una que ya está.",
    );
  });
});
