/**
 * lib/exploraciones/plan-de-la-guia.test.ts — qué pregunta la guía de la preventa y en qué paso (iniciativa A), con la
 * preventa de Larce como caso. Correr: `npx vitest run lib/exploraciones/plan-de-la-guia.test.ts --project unit`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { GUIA_VIEJA_DE_LARCE, LARCE_AL_ARMAR_LA_GUIA, LARCE_HOY, POSICIONES_DE_LARCE, TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { faltanAlCerrar, listaParaProponer } from "./calidad";
import { chequeoDelMapa, type PosicionEnElMapa } from "./mapa";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import { focoDeLaGuia, ordenDeLaConversacion, preguntasParaMostrar, type GuiaDeLaSesion } from "./guia";
import { contextoDeLaGuia, leerLaGuiaDelAgente, pedidoDeLaGuia } from "./guia-pedido";
import type { EstadoDeExploracion } from "./contenido";
import {
  contextoDelPlan,
  MAX_PREGUNTAS_DE_LA_GUIA,
  pasosYaPreguntados,
  planDeLaGuia,
  preguntaDeRespaldo,
  repiteLoSabido,
  siNoSalio,
  type PreguntaPlaneada,
} from "./plan-de-la-guia";

const POS_DEL_MAPA: Record<string, PosicionEnElMapa> = Object.fromEntries(
  Object.entries(POSICIONES_DE_LARCE).map(([k, v]) => [
    k,
    { ...v, origen: "confirmado" as const, fuente: v.clase === "evidencia" ? ("reunion" as const) : ("hipotesis" as const), porQue: null, citas: [], riesgo: false, noSabe: false, pendiente: null, porRevisar: false },
  ]),
);
const chequeoDe = (_escala: unknown, estado: EstadoDeExploracion) => chequeoDelMapa(ESCALA_DE_PRUEBA, estado.areas, POS_DEL_MAPA);

const SIN_PROCEDENCIAS = { abiertos: new Map<string, number>(), pasaron: new Map<string, number>() };

function planDe(estado: EstadoDeExploracion, tests = TESTS_DE_LARCE, extra: Partial<Parameters<typeof planDeLaGuia>[0]> = {}) {
  const ctx = contextoDelPlan({ estado, tests, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, sesionId: null });
  const plan = planDeLaGuia({ ...ctx, casillas: estado.contenido.casillas, escala: ESCALA_DE_PRUEBA, areas: estado.areas, posiciones: POSICIONES_DE_LARCE, aExplorar: {}, ...extra });
  return { plan, saber: ctx.saber };
}

const resumen = (plan: readonly PreguntaPlaneada[]) => plan.map((p) => `${p.para}:${p.paso}`);

describe("el plan de la guía, en Larce", () => {
  it("al armar la sesión 2: los dos dolores que ya dijo en impacto, después para cuándo y quién firma, y el presupuesto al final", () => {
    const { plan } = planDe(LARCE_AL_ARMAR_LA_GUIA);
    expect(resumen(plan)).toEqual(["1.7:impacto", "1.2:impacto", "tiempos:cuando", "autoridad:conQue", "presupuesto:conQue"]);
    // 1.7 nunca en situación: el cliente ya dijo que los deals que se enfrían mueren sin que nadie reaccione.
    expect(plan.find((p) => p.para === "1.7")?.motivo?.texto).toContain("el vendedor lo deja morir");
  });

  it("hoy ya se saben los tiempos: no hay más preguntas de tiempos", () => {
    const { plan } = planDe(LARCE_HOY);
    expect(plan.some((p) => p.para === "tiempos")).toBe(false);
    expect(plan.length).toBeLessThanOrEqual(MAX_PREGUNTAS_DE_LA_GUIA);
    expect(plan[plan.length - 1].para).toBe("presupuesto");
    expect(resumen(plan).slice(0, 2)).toEqual(["1.7:impacto", "1.2:impacto"]);
  });

  it("nunca más de 5 preguntas, y lo que se llevó de una sesión anterior ocupa lugar", () => {
    expect(planDe(LARCE_AL_ARMAR_LA_GUIA).plan.length).toBe(5);
    expect(planDe(LARCE_AL_ARMAR_LA_GUIA, TESTS_DE_LARCE, { llevados: 2 }).plan.length).toBe(3);
    // Siempre quedan al menos dos propias.
    expect(planDe(LARCE_AL_ARMAR_LA_GUIA, TESTS_DE_LARCE, { llevados: 9 }).plan.length).toBe(2);
  });

  it("si en una sesión anterior ya se preguntó el impacto (y se marcó hecho), el dolor pasa a solución", () => {
    const guias: Record<string, Pick<GuiaDeLaSesion, "preguntas">> = { "s-uno": { preguntas: [{ para: "1.7", pregunta: "¿Cuánto les costó?", repreguntas: [], paso: "impacto" }] } };
    const ya = pasosYaPreguntados([{ id: "s-uno", hechas: ["1.7"] }], guias);
    const { plan } = planDe(LARCE_AL_ARMAR_LA_GUIA, TESTS_DE_LARCE, { yaPreguntado: ya });
    expect(plan.find((p) => p.para === "1.7")?.paso).toBe("solucion");
  });

  it("sin el test ni nada dicho: dos preguntas de retos (la tarjeta y la escala), la meta y qué pasa si no actúa", () => {
    const estado = estadoDePrueba();
    const ctx = contextoDelPlan({ estado, tests: [], escala: ESCALA_DE_PRUEBA, posiciones: {}, sesionId: null });
    const plan = planDeLaGuia({ ...ctx, casillas: {}, escala: ESCALA_DE_PRUEBA, areas: ["1"], posiciones: {}, aExplorar: {} });
    // En el orden de la conversación (2026-10-23): la meta, cómo pasa, cuánto cuesta, para cuándo.
    expect(resumen(plan)).toEqual(["metas:impacto", "retos:situacion", "1.1:situacion", "consecuencias:impacto", "tiempos:cuando"]);
  });
});

describe("lo que repite lo que el cliente ya dijo", () => {
  const { saber } = planDe(LARCE_AL_ARMAR_LA_GUIA);
  const dolor = { para: "1.7", paso: "impacto" as const };

  it("descarta la pregunta que Marco tuvo que saltarse; deja la que pregunta cuánto le costó", () => {
    expect(repiteLoSabido("¿Qué pasa en el equipo cuando un negocio deja de avanzar, cuando un deal se queda quieto?", dolor, saber)).toBe(true);
    expect(repiteLoSabido("¿Me cuentas la última vez que un deal se enfrió?", dolor, saber)).toBe(true);
    expect(repiteLoSabido("Dijiste que los deals que se enfrían mueren sin que nadie reaccione. ¿Cuántos se les fueron así este año?", dolor, saber)).toBe(false);
    expect(repiteLoSabido("¿Cuánto crees que les ha costado ese silencio?", dolor, saber)).toBe(false);
  });

  it("en un tema sin nada dicho, o en situación, nada repite", () => {
    expect(repiteLoSabido("¿Qué pasa cuando llega un lead?", { para: "tiempos", paso: "cuando" }, saber)).toBe(false);
    expect(repiteLoSabido("¿Qué pasa cuando un deal se queda quieto?", { para: "1.7", paso: "situacion" }, saber)).toBe(false);
  });

  it("la de respaldo pregunta el paso que toca, sin la cita adelante (validación 69): la cita va en el ⓘ", () => {
    const { plan } = planDe(LARCE_AL_ARMAR_LA_GUIA);
    const p = preguntaDeRespaldo(plan[0], "¿Cómo va 1.7?");
    expect(p).toBe("¿Cuánto les ha costado esto en los últimos meses: en negocios, en horas o en clientes?");
    expect(p).not.toContain("«");
    expect(plan[0].motivo?.texto).toContain("Cuando un deal se enfría");
    expect(preguntaDeRespaldo({ para: "tiempos", tipo: "tarjeta", paso: "cuando", motivo: null }, "¿Para cuándo?")).toBe("¿Para cuándo?");
  });
});

describe("la guía vieja de Larce, mostrada con el plan", () => {
  const ctx = contextoDelPlan({ estado: LARCE_AL_ARMAR_LA_GUIA, tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, sesionId: null });
  const foco = focoDeLaGuia(LARCE_AL_ARMAR_LA_GUIA.contenido.casillas, ESCALA_DE_PRUEBA, ["1"], POSICIONES_DE_LARCE, {}, undefined, ctx);
  const preguntas = preguntasParaMostrar(GUIA_VIEJA_DE_LARCE, foco.huecos, foco.enfoque, ESCALA_DE_PRUEBA, SIN_PROCEDENCIAS, undefined, { plan: foco.plan!, saber: ctx.saber });

  it("ya no muestra «¿Qué pasa cuando un deal se queda quieto?»: en su lugar, cuánto les ha costado; sus palabras, en el ⓘ", () => {
    expect(preguntas.map((p) => p.pregunta).join(" ")).not.toContain("deal se queda quieto");
    expect(preguntas[0]).toMatchObject({ para: "1.7", paso: "impacto" });
    expect(preguntas[0].pregunta).toMatch(/^¿Cuánto les ha costado esto/);
    expect(preguntas[0].motivo?.texto).toBeTruthy();
    expect(preguntas[0].motivo?.de).toContain("Nota del 14 oct");
  });

  it("de 8 preguntas pasa a 5, y lo que la guía vieja tenía de la tarjeta se queda (los tiempos)", () => {
    expect(preguntas).toHaveLength(5);
    expect(preguntas.find((p) => p.para === "tiempos")?.pregunta).toBe("¿Para cuándo necesitan tener esto resuelto, hay alguna fecha que mande?");
    expect(ordenDeLaConversacion(preguntas).map((p) => p.para)).toEqual(["1.7", "1.2", "tiempos", "autoridad", "presupuesto"]);
  });

  it("el cierre pide lo que falta para proponer y ninguna pregunta cubre", () => {
    const puntos = listaParaProponer(LARCE_AL_ARMAR_LA_GUIA, chequeoDe(ESCALA_DE_PRUEBA, LARCE_AL_ARMAR_LA_GUIA), "2026-10-18");
    const faltan = faltanAlCerrar(puntos, new Set(preguntas.map((p) => p.para)), { hayDimensiones: true, hayImpacto: true });
    // La meta en cifras, el presupuesto, los tiempos y quién firma se preguntan; lo que cubre un dolor en impacto también.
    expect(faltan.map((p) => p.id)).not.toContain("consecuencia");
    expect(faltan.map((p) => p.id)).not.toContain("siguientePaso");
    expect(siNoSalio(["Quién firma", "Presupuesto"])).toBe("Si no salió en la conversación, pregunta: quién firma y presupuesto.");
    expect(siNoSalio([])).toBeNull();
  });
});

describe("el pedido al agente y lo que devuelve", () => {
  const base = contextoDeLaGuia({
    empresa: "Distribuidora Ejemplo",
    industria: "Distribución",
    estado: LARCE_AL_ARMAR_LA_GUIA,
    escala: ESCALA_DE_PRUEBA,
    posiciones: POS_DEL_MAPA,
    pendientes: [],
    agenda: [],
    conTest: true,
    hoy: "2026-10-18",
    tests: TESTS_DE_LARCE,
    faltanParaProponer: listaParaProponer(LARCE_AL_ARMAR_LA_GUIA, chequeoDe(ESCALA_DE_PRUEBA, LARCE_AL_ARMAR_LA_GUIA), "2026-10-18"),
  });

  it("lleva lo que ya sabemos y cada pregunta con su paso, sin datos internos", () => {
    const texto = JSON.stringify(pedidoDeLaGuia(base).messages);
    expect(texto).toContain("LO QUE YA SABEMOS");
    expect(texto).toContain("el vendedor lo deja morir");
    expect(texto).toContain("1.7 («Dimensión 1.7») · paso: impacto");
    expect(base.plan).toHaveLength(5);
  });

  it("descarta la pregunta del agente que repite lo dicho; las demás quedan con su paso", () => {
    const respuesta = {
      content: [
        {
          type: "tool_use",
          id: "t",
          name: "armar_guia",
          input: {
            objetivo: "Poner en números lo que les cuesta que los deals se enfríen y saber quién firma.",
            apertura: ["Gracias por el diagnóstico."],
            preguntas: [
              { para: "1.7", pregunta: "¿Qué pasa en el equipo cuando un deal se queda quieto?", repreguntas: [] },
              { para: "1.2", pregunta: "Si unos usan el CRM y otros sus hojas, ¿cuántas horas a la semana se van en juntar los números?", repreguntas: ["¿Quién las junta?"] },
              { para: "tiempos", pregunta: "¿Para cuándo necesitan tenerlo resuelto?", repreguntas: [] },
            ],
            objeciones: [],
            pocaApertura: "x",
            cierre: "Resume y pide el siguiente paso con fecha.",
          },
        },
      ],
    } as unknown as Anthropic.Messages.Message;
    const guia = leerLaGuiaDelAgente(respuesta, base, "r")!;
    expect(guia.preguntas.map((p) => p.para)).toEqual(["1.2", "tiempos"]);
    expect(guia.preguntas.every((p) => p.paso)).toBe(true);
  });
});
