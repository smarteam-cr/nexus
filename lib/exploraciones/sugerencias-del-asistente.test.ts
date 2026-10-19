/**
 * lib/exploraciones/sugerencias-del-asistente.test.ts — los pedidos que se le ofrecen al asistente al abrirlo desde la
 * guía (Elías, 2026-10-19), con la preventa de Larce como caso.
 * Correr: `npx vitest run lib/exploraciones/sugerencias-del-asistente.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { GUIA_VIEJA_DE_LARCE, LARCE_AL_ARMAR_LA_GUIA, POSICIONES_DE_LARCE, TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { ESCALA_DE_PRUEBA } from "./escala-de-prueba.test-helpers";
import { focoDeLaGuia, preguntasParaMostrar, type PreguntaParaMostrar } from "./guia";
import { contextoDelPlan } from "./plan-de-la-guia";
import { queCubreLaGuia } from "./que-cubre-la-guia";
import { MAX_SUGERENCIAS_DEL_ASISTENTE, sugerenciasDelAsistente } from "./sugerencias-del-asistente";

const SIN_PROCEDENCIAS = { abiertos: new Map<string, number>(), pasaron: new Map<string, number>() };

function preguntasDeLarce(): PreguntaParaMostrar[] {
  const ctx = contextoDelPlan({ estado: LARCE_AL_ARMAR_LA_GUIA, tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, sesionId: null });
  const foco = focoDeLaGuia(LARCE_AL_ARMAR_LA_GUIA.contenido.casillas, ESCALA_DE_PRUEBA, ["1"], POSICIONES_DE_LARCE, {}, undefined, ctx);
  return preguntasParaMostrar(GUIA_VIEJA_DE_LARCE, foco.huecos, foco.enfoque, ESCALA_DE_PRUEBA, SIN_PROCEDENCIAS, undefined, { plan: foco.plan!, saber: ctx.saber });
}

const DIMENSIONES = ESCALA_DE_PRUEBA.areas.filter((a) => a.id === "1").flatMap((a) => a.dimensiones.filter((d) => d.aplica).map((d) => ({ id: d.id, nombre: d.nombre })));
const nombreDe = (tema: string) => ESCALA_DE_PRUEBA.areas.flatMap((a) => a.dimensiones).find((d) => d.id === tema)?.nombre ?? tema;

const PUNTOS = [
  { id: "frena", corto: "Qué frena al equipo", titulo: "", cumplido: false },
  { id: "meta", corto: "Meta en cifras", titulo: "", cumplido: true },
  { id: "tiempos", corto: "Para cuándo", titulo: "", cumplido: true },
  { id: "presupuesto", corto: "Presupuesto", titulo: "", cumplido: false },
  { id: "siguientePaso", corto: "Siguiente paso con fecha", titulo: "", cumplido: false },
];

function sugerencias(preguntas: PreguntaParaMostrar[]) {
  const cubre = queCubreLaGuia({ preguntas, puntos: PUNTOS, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, marco: "venta" });
  return sugerenciasDelAsistente({ preguntas, cubre, dimensiones: DIMENSIONES, posiciones: POSICIONES_DE_LARCE, nombreDe });
}

describe("las sugerencias del asistente desde la guía", () => {
  it("con Larce: de 3 a 4, sin números de pregunta, nombrando lo que de verdad falta", () => {
    const s = sugerencias(preguntasDeLarce());
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThanOrEqual(MAX_SUGERENCIAS_DEL_ASISTENTE);
    for (const t of s) expect(t, t).not.toMatch(/\bla \d\b/);
    expect(new Set(s).size).toBe(s.length);
  });

  it("la pregunta con menos repreguntas pide que bajen a números, por su tema", () => {
    const preguntas = preguntasDeLarce().map((p, i) => ({ ...p, repreguntas: i === 1 ? [] : ["¿Una?", "¿Dos?", "¿Tres?"] }));
    const tema = preguntas[1].apunta?.para ?? preguntas[1].para;
    expect(sugerencias(preguntas)[0]).toBe(`Agrega repreguntas a la pregunta de ${nombreDe(tema)} que bajen a números`);
  });

  it("todas con tres repreguntas: no la propone", () => {
    const preguntas = preguntasDeLarce().map((p) => ({ ...p, repreguntas: ["¿Una?", "¿Dos?", "¿Tres?"] }));
    expect(sugerencias(preguntas).some((t) => t.includes("repreguntas"))).toBe(false);
  });

  it("las dimensiones en juego sin preguntar y sin evidencia; y el presupuesto que falta", () => {
    const s = sugerencias(preguntasDeLarce());
    const preguntadas = new Set(preguntasDeLarce().map((p) => p.apunta?.para ?? p.para));
    const libres = DIMENSIONES.filter((d) => !preguntadas.has(d.id) && POSICIONES_DE_LARCE[d.id]?.clase !== "evidencia");
    if (libres.length) expect(s.some((t) => t.startsWith("Agrega") && t.includes("de la escala sobre"))).toBe(true);
    // Larce ya pregunta el presupuesto: no se sugiere. Sin esa pregunta, sí.
    expect(s.some((t) => t.includes("presupuesto"))).toBe(false);
    expect(sugerencias(preguntasDeLarce().filter((p) => p.para !== "presupuesto"))).toContain("Agrega una pregunta sobre el presupuesto o contra qué lo comparan");
  });

  it("sin nada que falte, completa con lo de siempre", () => {
    const preguntas = preguntasDeLarce().map((p) => ({ ...p, repreguntas: ["¿Una?", "¿Dos?", "¿Tres?"] }));
    const cubre = { puntos: PUNTOS.map((p) => ({ ...p, estado: "listo" as const })) };
    const s = sugerenciasDelAsistente({ preguntas, cubre, dimensiones: [], posiciones: {}, nombreDe });
    expect(s).toEqual(["¿Qué otras preguntas agregarías?", "Haz más cortas las preguntas"].concat(s.slice(2)));
    expect(s.length).toBeGreaterThanOrEqual(2);
  });
});
