/**
 * lib/sessions/preguntas-de-contexto.test.ts — las preguntas que Nexus le hace a quien estuvo en una reunión sin texto
 * (T9): salen del título y de las otras reuniones de la empresa, y lo que se responde queda como el texto.
 */
import { describe, expect, it } from "vitest";
import { MAX_PREGUNTAS, armarPreguntas, estuvoEnLaReunion, problemaDeLasRespuestas, temaDelTitulo, textoDeLasRespuestas, textosDeLaMinuta } from "./preguntas-de-contexto";

const ANTERIOR = {
  titulo: "Cemaco | Seguimiento NAV",
  fecha: new Date("2026-10-15T16:00:00Z"),
  temas: ["Carga de datos comerciales"],
  acuerdos: ["Delphos manda el web service de NAV el lunes"],
  riesgos: ["La integración con NAV puede atrasar el arranque"],
};

describe("el tema del título", () => {
  it("sin la empresa, Smarteam ni palabras de proceso", () => {
    expect(temaDelTitulo("Cemaco | Data Hub", "Cemaco")).toBe("Data Hub");
    expect(temaDelTitulo("Kickoff - Wherex + Smarteam", "Wherex")).toBeNull();
    expect(temaDelTitulo("Seguimiento Honda: integración de Facturación", "Honda Costa Rica")).toBe("integración de Facturación");
    expect(temaDelTitulo("Reunión", "Cemaco")).toBeNull();
  });
});

describe("las preguntas", () => {
  it("el caso de Cemaco: el tema, lo que quedó de la anterior y qué quedó pendiente", () => {
    const p = armarPreguntas({ titulo: "Cemaco | Data Hub", empresa: "Cemaco", otras: [ANTERIOR] });
    expect(p).toHaveLength(MAX_PREGUNTAS);
    expect(p[0].texto).toBe("¿Qué se habló o se decidió sobre «Data Hub»?");
    expect(p[1].texto).toMatch(/«Cemaco \| Seguimiento NAV» \(15 oct\) quedó: «Delphos manda el web service de NAV el lunes»/);
    expect(p[2].id).toBe("pendiente");
  });
  it("sin tema en el título, entra el riesgo abierto", () => {
    const p = armarPreguntas({ titulo: "Seguimiento semanal", empresa: "Cemaco", otras: [ANTERIOR] });
    expect(p.map((x) => x.id)).toEqual(["anterior", "riesgo", "pendiente"]);
  });
  it("sin nada que citar, dos preguntas de siempre (nunca una caja en blanco)", () => {
    const p = armarPreguntas({ titulo: "Reunión", empresa: "Cemaco", otras: [] });
    expect(p.map((x) => x.id)).toEqual(["para-que", "pendiente"]);
  });
  it("la minuta se lee tolerante", () => {
    expect(textosDeLaMinuta([{ text: " uno " }, "dos", { otra: 1 }, null])).toEqual(["uno", "dos"]);
    expect(textosDeLaMinuta(null)).toEqual([]);
  });
});

describe("lo que responde", () => {
  const rs = [
    { pregunta: "¿Qué se habló sobre «Data Hub»?", respuesta: "Se definió el alcance del Data Hub con las tres fuentes." },
    { pregunta: "¿Qué quedó pendiente?", respuesta: "" },
  ];
  it("tiene que alcanzar para leerse (sin contar las preguntas)", () => {
    expect(problemaDeLasRespuestas([{ pregunta: "¿Una pregunta muy larga que no cuenta como respuesta?", respuesta: "sí" }], "")).toMatch(/unas líneas más/);
    expect(problemaDeLasRespuestas(rs, "")).toBeNull();
  });
  it("queda cada pregunta con su respuesta; las sin responder no van", () => {
    const t = textoDeLasRespuestas(rs, "El cliente pidió ver un tablero.");
    expect(t).toMatch(/^Lo que contó una persona que estuvo/);
    expect(t).toContain("¿Qué se habló sobre «Data Hub»?\nSe definió el alcance");
    expect(t).not.toContain("¿Qué quedó pendiente?");
    expect(t).toContain("Algo más:\nEl cliente pidió ver un tablero.");
  });
  it("responde quien estuvo", () => {
    expect(estuvoEnLaReunion({ organizador: "Liliana@smarteamcr.com", participantes: [] }, "liliana@smarteamcr.com")).toBe(true);
    expect(estuvoEnLaReunion({ organizador: null, participantes: ["x@cemaco.com"] }, "liliana@smarteamcr.com")).toBe(false);
  });
});
