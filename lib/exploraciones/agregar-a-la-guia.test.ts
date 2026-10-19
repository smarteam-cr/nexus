/**
 * lib/exploraciones/agregar-a-la-guia.test.ts — lo que revisa el asistente antes de sumar una pregunta, y el orden en
 * que el chat numera la guía (auditoría del 2026-10-19), con la preventa de Larce como caso.
 * Correr: `npx vitest run lib/exploraciones/agregar-a-la-guia.test.ts --project unit`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUIA_VIEJA_DE_LARCE, LARCE_AL_ARMAR_LA_GUIA, POSICIONES_DE_LARCE, TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { ESCALA_DE_PRUEBA } from "./escala-de-prueba.test-helpers";
import { focoDeLaGuia, ordenDeLaConversacion, preguntasParaMostrar, type PreguntaParaMostrar } from "./guia";
import { contextoDelPlan } from "./plan-de-la-guia";
import { aplicarAjustes, aplicarCambioDeLaGuia, AVISO_DEL_TOPE_DE_SUMADAS, MAX_PREGUNTAS_PROPIAS, type AjustesDeLaGuia } from "./ajustes-de-la-guia";
import { normalizarPregunta, problemaAlAgregar } from "./agregar-a-la-guia";

const SIN_PROCEDENCIAS = { abiertos: new Map<string, number>(), pasaron: new Map<string, number>() };
const ctx = contextoDelPlan({ estado: LARCE_AL_ARMAR_LA_GUIA, tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, sesionId: null });

function preguntasDeLarce(ajustes?: AjustesDeLaGuia): PreguntaParaMostrar[] {
  const foco = focoDeLaGuia(LARCE_AL_ARMAR_LA_GUIA.contenido.casillas, ESCALA_DE_PRUEBA, ["1"], POSICIONES_DE_LARCE, {}, undefined, ctx);
  const base = preguntasParaMostrar(GUIA_VIEJA_DE_LARCE, foco.huecos, foco.enfoque, ESCALA_DE_PRUEBA, SIN_PROCEDENCIAS, undefined, { plan: foco.plan!, saber: ctx.saber });
  return aplicarAjustes(base, ajustes, (para) => (para.startsWith("1.") ? { tipo: "dimension", para } : undefined));
}

/** Larce con `n` preguntas sumadas por el asistente (como la sesión 2 de producción, que tiene 6). */
function conSumadas(n: number): AjustesDeLaGuia {
  let a: AjustesDeLaGuia | undefined;
  for (let i = 0; i < n; i++) {
    const r = aplicarCambioDeLaGuia(a, { tipo: "agregar", pregunta: { id: `pa${i}`, pregunta: `¿Pregunta sumada ${i}?`, repreguntas: [], origen: "asistente" } });
    if (!r.ok) throw new Error(r.error);
    a = r.ajustes;
  }
  return a ?? {};
}

const agregar = (pregunta: string, o: { tema?: string; ajustes?: AjustesDeLaGuia; enLaLista?: string[] } = {}) =>
  problemaAlAgregar({ pregunta, tema: o.tema, preguntas: preguntasDeLarce(o.ajustes), enLaLista: new Set((o.enLaLista ?? []).map(normalizarPregunta)), saber: ctx.saber });

describe("sumar una pregunta desde el asistente", () => {
  it("el tope cuenta la lista: con 6 sumadas entran dos, la tercera se rechaza al preparar", () => {
    const ajustes = conSumadas(6);
    expect(agregar("¿Una nueva?", { ajustes })).toBeNull();
    expect(agregar("¿Otra nueva?", { ajustes, enLaLista: ["¿Una nueva?"] })).toBeNull();
    const motivo = agregar("¿La tercera?", { ajustes, enLaLista: ["¿Una nueva?", "¿Otra nueva?"] });
    expect(motivo).toMatch(/llega a 8 preguntas sumadas \(tuyas o del asistente\)/);
    expect(agregar("¿Otra más?", { ajustes: conSumadas(MAX_PREGUNTAS_PROPIAS) })).toBe(AVISO_DEL_TOPE_DE_SUMADAS);
  });

  it("no repite lo que ya está en la guía ni en la misma lista", () => {
    const una = preguntasDeLarce()[0].pregunta;
    expect(agregar(`  ${una.toUpperCase()} `)).toBe("Esa pregunta ya está en la guía.");
    expect(agregar("¿Cuántos clientes nuevos al mes?", { enLaLista: ["¿cuántos  clientes nuevos al mes?"] })).toBe("Esa pregunta ya está en esta lista.");
  });

  it("filtra lo que el cliente ya dijo, también al sumar (antes solo al cambiar)", () => {
    expect(agregar("¿Qué pasa en el equipo cuando un negocio deja de avanzar, cuando un deal se queda quieto?", { tema: "1.7" })).toMatch(/ya dijo/);
    expect(agregar("¿Cuánto crees que les ha costado ese silencio?", { tema: "1.7" })).toBeNull();
    // Sin tema no hay con qué comparar.
    expect(agregar("¿Qué pasa en el equipo cuando un negocio deja de avanzar, cuando un deal se queda quieto?")).toBeNull();
  });

  it("el aviso del tope no dice «tuyas» a secas: cuenta las del asistente", () => {
    const r = aplicarCambioDeLaGuia(conSumadas(MAX_PREGUNTAS_PROPIAS), { tipo: "agregar", pregunta: { id: "px", pregunta: "¿Una más?", repreguntas: [], origen: "tuya" } });
    expect(r).toEqual({ ok: false, error: AVISO_DEL_TOPE_DE_SUMADAS });
    expect(AVISO_DEL_TOPE_DE_SUMADAS).toContain("tuyas o del asistente");
  });
});

describe("el chat numera la guía como la pantalla", () => {
  it("con preguntas sumadas, el Presupuesto va último (en la lista sin ordenar quedaba antes de las sumadas)", () => {
    const preguntas = preguntasDeLarce(conSumadas(2));
    expect(preguntas.findIndex((p) => p.para === "presupuesto")).toBeLessThan(preguntas.length - 1);
    expect(ordenDeLaConversacion(preguntas).at(-1)?.para).toBe("presupuesto");
  });

  it("guia-server numera con el orden de la pantalla: la guía del chat y el número de cada cambio", () => {
    const fuente = readFileSync("lib/operaciones/guia-server.ts", "utf8");
    expect(fuente).toMatch(/function preguntasEnOrden[\s\S]*?ordenDeLaConversacion\(preguntasDeLaProxima\(base\)\.preguntas\)/);
    // La guía que lee el modelo y la búsqueda de la pregunta (de ahí sale «la N» de cada línea) usan ese orden.
    expect(fuente.match(/const preguntas = preguntasEnOrden\(base\);/g)?.length).toBe(2);
    expect(fuente).not.toMatch(/const \{ preguntas \} = preguntasDeLaProxima/);
  });
});
