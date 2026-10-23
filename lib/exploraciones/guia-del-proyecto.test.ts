/**
 * lib/exploraciones/guia-del-proyecto.test.ts — las mejoras de la guía de la preventa, en la exploración de un PROYECTO
 * (Customer Success, `marco: "cs"`, 2026-10-19): «Lo que ya sabemos» desde lo que dijo el cliente en el proyecto (nunca el
 * test), el plan por pasos con la estrategia, la ⓘ, el cierre, lo que cubre la guía y lo que se le puede pedir al
 * asistente; y que una guía armada antes del plan se siga viendo como se armó.
 * Correr: `npx vitest run lib/exploraciones/guia-del-proyecto.test.ts --project unit`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { avanceDeLaEstrategia, faltanDeLaEstrategia } from "./avance-del-proyecto";
import { contenidoVacio, idDelItem, propuestaVacia, type EstadoDeExploracion, type ItemPropuesto } from "./contenido";
import { ESCALA_DE_PRUEBA } from "./escala-de-prueba.test-helpers";
import { cambiosDesdeLaGuia, focoDeLaGuia, ordenDeLaConversacion, preguntasParaMostrar, type GuiaDeLaSesion } from "./guia";
import { contextoDeLaGuia, herramientaDeLaGuia, leerLaGuiaDelAgente, pedidoDeLaGuia } from "./guia-pedido";
import { pedidoDeUnaPregunta } from "./guia-pregunta-pedido";
import { estadoCortoDeLaGuia } from "./inicio";
import { loQueYaSabemos } from "./lo-que-ya-sabemos";
import { MARCO_DE_CS } from "./marco";
import {
  contextoDelPlan,
  guiaDeAntesDelPlan,
  MAX_PREGUNTAS_DE_LA_GUIA,
  planDeLaGuia,
  preguntaDeCierre,
  PREGUNTA_DE_CIERRE,
  PREGUNTA_DE_CIERRE_DEL_PROYECTO,
  type PreguntaPlaneada,
} from "./plan-de-la-guia";
import { queCubreLaGuia } from "./que-cubre-la-guia";
import { SUGERENCIA_DE_LO_VENDIDO, sugerenciasDelAsistente } from "./sugerencias-del-asistente";

const HANDOFF = "El handoff: lo que se vendió y los resultados que persigue el cliente";

/** Lo que el agente propuso del nivel de una dimensión, con la cita de una fuente del proyecto. */
function nivelCitado(dimensionId: string, nivel: "D" | "I" | "F", fuente: { id: string; etiqueta: string; cita: string }): ItemPropuesto {
  const destino = { tipo: "nivel" as const, dimensionId };
  const valor = { nivel, fuente: "reunion" as const, evidencia: fuente.cita };
  return { id: idDelItem(destino, valor), destino, valor, fuentes: [fuente], corridaId: "r", en: "2026-10-15T00:00:00.000Z" };
}

/** Un proyecto como Ferretería Noelito: lo vendido dice dos dolores y el cuestionario confirma los retos. */
function proyecto(parcial: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  const propuesta = propuestaVacia();
  propuesta.items = [
    nivelCitado("1.7", "D", { id: "V0", etiqueta: HANDOFF, cita: "Cada vendedor lleva sus clientes en su Excel: nadie ve cuándo uno deja de comprar" }),
    nivelCitado("1.2", "I", { id: "Q0", etiqueta: "Lo que contestó el cliente en los cuestionarios", cita: "Los datos de clientes están repartidos en tres sistemas" }),
    // Lo que escribió el vendedor (N) nunca cuenta como algo que dijo el cliente.
    nivelCitado("1.3", "I", { id: "N0", etiqueta: "Notas del CSE", cita: "Creo que no usan bien las listas" }),
  ];
  return {
    contenido: contenidoVacio(),
    propuesta,
    areas: ["1"],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
    ...parcial,
  };
}

const POSICIONES = { "1.7": { nivel: "D" as const, clase: "hipotesis" as const }, "1.2": { nivel: "I" as const, clase: "hipotesis" as const } };
const resumen = (plan: readonly PreguntaPlaneada[]) => plan.map((p) => `${p.para}:${p.paso}`);

function planDelProyecto(estado: EstadoDeExploracion, extra: Partial<Parameters<typeof planDeLaGuia>[0]> = {}) {
  const ctx = contextoDelPlan({ estado, tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES, sesionId: null, marco: "cs" });
  const plan = planDeLaGuia({ ...ctx, casillas: estado.contenido.casillas, escala: ESCALA_DE_PRUEBA, areas: estado.areas, posiciones: POSICIONES, aExplorar: {}, ...extra });
  return { plan, saber: ctx.saber };
}

describe("lo que ya sabemos, en un proyecto", () => {
  it("sale de lo que dijo el cliente en el proyecto (el handoff, los cuestionarios), nunca del test ni de las notas del CSE", () => {
    const saber = loQueYaSabemos({ estado: proyecto(), tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES, marco: "cs" });
    expect(saber.lineas.map((l) => l.para)).toEqual(["1.7", "1.2"]);
    expect(saber.lineas[0]).toMatchObject({ de: "El handoff", origen: "proyecto" });
    expect(saber.lineas[1].de).toBe("Lo que contestó el cliente en los cuestionarios");
    expect([...saber.porTema.values()].flat().some((d) => d.origen === "test")).toBe(false);
    expect(saber.porTema.has("1.3")).toBe(false);
    // En la preventa, el mismo test sí cuenta.
    const venta = loQueYaSabemos({ estado: proyecto(), tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES });
    expect([...venta.porTema.values()].flat().some((d) => d.origen === "test")).toBe(true);
  });

  it("lo confirmado de la estrategia entra, con su nombre, y caben las tres tarjetas (hasta 2 líneas de dimensiones)", () => {
    const e = proyecto();
    e.contenido.casillas = {
      retos: [{ texto: "Pierden clientes en el segundo año" }],
      metas: [{ que: "Recompra", actual: "30 %", objetivo: "45 %", para: "junio" }],
      obstaculos: [{ texto: "Nadie ve el historial de compras" }],
      // Una casilla de la venta no es de la estrategia: no entra.
      tiempos: ["Antes de diciembre"],
    };
    const saber = loQueYaSabemos({ estado: e, tests: [], escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES, marco: "cs" });
    expect(saber.lineas.map((l) => l.para)).toEqual(["1.7", "1.2", "retos", "metas", "obstaculos"]);
    expect(saber.lineas.find((l) => l.para === "retos")?.de).toBe("Confirmado en la estrategia");
    expect(saber.porTema.has("tiempos")).toBe(false);
  });
});

describe("el plan de la guía de un proyecto", () => {
  it("parte de los dolores que ya dijo, en impacto; pregunta la estrategia que falta; nunca cuándo ni con qué", () => {
    const { plan } = planDelProyecto(proyecto());
    // Entran los mismos; en el orden de la conversación (2026-10-23): la meta, cómo pasa y después cuánto cuesta.
    expect(resumen(plan)).toEqual(["metas:impacto", "retos:situacion", "obstaculos:situacion", "1.7:impacto", "1.2:impacto"]);
    expect(plan.length).toBeLessThanOrEqual(MAX_PREGUNTAS_DE_LA_GUIA);
    expect(plan.find((p) => p.para === "1.7")?.motivo?.de).toBe("El handoff");
    expect(plan.some((p) => ["tiempos", "autoridad", "presupuesto", "consecuencias"].includes(p.para))).toBe(false);
  });

  it("con la estrategia confirmada, el lugar va a los dolores y a la escala sin dato", () => {
    const e = proyecto();
    e.contenido.casillas = { retos: [{ texto: "x" }], metas: [{ que: "y", actual: "1", objetivo: "2" }], obstaculos: [{ texto: "z" }] };
    const { plan } = planDelProyecto(e);
    expect(plan.filter((p) => p.tipo === "tarjeta")).toEqual([]);
    // Los dolores entran primero; se conversan después de cómo pasa hoy (2026-10-23).
    expect(resumen(plan)).toEqual(expect.arrayContaining(["1.7:impacto", "1.2:impacto"]));
    expect(resumen(plan).slice(0, 2)).toEqual(["1.1:situacion", "1.3:situacion"]);
    expect(plan).toHaveLength(MAX_PREGUNTAS_DE_LA_GUIA);
  });

  it("sin nada dicho: la estrategia y la escala en situación (la base operativa, sin dato primero)", () => {
    const e = proyecto({ propuesta: propuestaVacia() });
    const { plan } = planDelProyecto(e);
    expect(resumen(plan)).toEqual(["metas:impacto", "retos:situacion", "obstaculos:situacion", "1.1:situacion", "1.3:situacion"]);
  });

  it("focoDeLaGuia con el contexto del proyecto da el plan; sin contexto, como antes (3 tarjetas y 5 dimensiones)", () => {
    const e = proyecto();
    const ctx = contextoDelPlan({ estado: e, tests: [], escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES, sesionId: null, marco: "cs" });
    const conPlan = focoDeLaGuia(e.contenido.casillas, ESCALA_DE_PRUEBA, e.areas, POSICIONES, {}, MARCO_DE_CS, ctx);
    expect(conPlan.plan).not.toBeNull();
    expect(conPlan.huecos).toEqual(["metas", "retos", "obstaculos"]);
    const sinPlan = focoDeLaGuia(e.contenido.casillas, ESCALA_DE_PRUEBA, e.areas, POSICIONES, {}, MARCO_DE_CS);
    expect(sinPlan.plan).toBeNull();
    expect(sinPlan.enfoque).toHaveLength(5);
  });

  it("la guía que se ve: con la ⓘ de lo que dijo el cliente, en el orden del plan, y lo vendido después", () => {
    const e = proyecto();
    const ctx = contextoDelPlan({ estado: e, tests: [], escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES, sesionId: null, marco: "cs" });
    const foco = focoDeLaGuia(e.contenido.casillas, ESCALA_DE_PRUEBA, e.areas, POSICIONES, {}, MARCO_DE_CS, ctx);
    const guia = { preguntas: [], loVendido: [{ id: "vendido:1", tema: "Service Hub", pregunta: "¿Quién va a atender los tickets?", repreguntas: [] }] };
    const vistas = ordenDeLaConversacion(
      preguntasParaMostrar(guia, foco.huecos, foco.enfoque, ESCALA_DE_PRUEBA, undefined, MARCO_DE_CS, { plan: foco.plan!, saber: ctx.saber }),
    );
    const dolor = vistas.find((p) => p.para === "1.7")!;
    expect(dolor.paso).toBe("impacto");
    expect(dolor.motivo).toMatchObject({ de: "El handoff" });
    // La pregunta no repite lo que dijo: eso va en la ⓘ.
    expect(dolor.pregunta).not.toContain("Excel");
    expect(dolor.repreguntas.length).toBeGreaterThan(0);
    expect(vistas.map((p) => p.tipo)).toContain("vendido");
  });
});

describe("una guía de un proyecto armada antes del plan", () => {
  const vieja: Pick<GuiaDeLaSesion, "preguntas"> = { preguntas: [{ para: "retos", pregunta: "¿Qué les quita el sueño?", repreguntas: [] }] };
  const nueva: Pick<GuiaDeLaSesion, "preguntas"> = { preguntas: [{ para: "retos", pregunta: "¿Qué les quita el sueño?", repreguntas: [], paso: "situacion" }] };

  it("se reconoce porque sus preguntas no tienen paso; en la preventa nunca", () => {
    expect(guiaDeAntesDelPlan(vieja, "cs")).toBe(true);
    expect(guiaDeAntesDelPlan(nueva, "cs")).toBe(false);
    expect(guiaDeAntesDelPlan(vieja, "venta")).toBe(false);
    expect(guiaDeAntesDelPlan(null, "cs")).toBe(false);
    expect(guiaDeAntesDelPlan({ preguntas: [] }, "cs")).toBe(false);
  });

  it("el estado de la guía lo dice aunque lo demás esté al día: «Actualizar la guía» la arma desde lo que ya se sabe", () => {
    const g = { huecos: ["retos"], enfoque: ["1.1"], ...vieja };
    expect(cambiosDesdeLaGuia(g, ["retos"], ["1.1"])).toBeNull();
    expect(cambiosDesdeLaGuia(g, ["retos"], ["1.1"], [], { antesDelPlan: true })).toMatchObject({ antesDelPlan: true, respondidas: [], nuevas: [] });
    expect(estadoCortoDeLaGuia(true, cambiosDesdeLaGuia(g, ["retos"], ["1.1"], [], { antesDelPlan: true }))).toBe("la guía está vieja: es de antes de «Lo que ya sabemos»");
  });
});

describe("el pedido al agente, en un proyecto", () => {
  const e = proyecto();
  const ctx = contextoDeLaGuia({
    empresa: "Ferretería Noelito",
    industria: null,
    estado: e,
    escala: ESCALA_DE_PRUEBA,
    posiciones: {},
    pendientes: [],
    agenda: [],
    conTest: false,
    hoy: "2026-10-19",
    marco: MARCO_DE_CS,
    proyecto: "--- El handoff ---\nSe vendió Sales Hub.",
    tests: TESTS_DE_LARCE,
  });

  it("lleva lo que ya sabemos y el plan, sin el test, y el cierre pide lo que falta de la estrategia", () => {
    expect(ctx.saber).toBeDefined();
    expect(ctx.loQueYaSabemos?.some((l) => l.includes("Excel") && l.includes("El handoff"))).toBe(true);
    expect(ctx.loQueYaSabemos?.some((l) => l.includes("Test de"))).toBe(false);
    expect(ctx.plan?.map((p) => p.para)).toContain("retos");
    // El plan pregunta las tres tarjetas: no queda nada de la estrategia para pedir al cerrar.
    expect(ctx.faltanAlCerrar).toEqual([]);
    const cuerpo = String((pedidoDeLaGuia(ctx).messages[0] as { content: string }).content);
    expect(cuerpo).toContain("LO QUE YA SABEMOS");
    expect(cuerpo).toContain("LAS PREGUNTAS DE ESTA SESIÓN");
    const sistema = String(pedidoDeLaGuia(ctx).system);
    expect(sistema).toContain("Customer Success");
    expect(sistema).toContain("PASO");
    expect(sistema).not.toContain("LAER");
    const esquema = JSON.stringify(herramientaDeLaGuia(ctx).input_schema);
    expect(esquema).not.toContain("el vendedor");
    expect(esquema).not.toContain("Si en la conversación no salió");
    expect(JSON.stringify(herramientaDeLaGuia({ ...ctx, faltanAlCerrar: ["lo que le impide llegar"] }).input_schema)).toContain(
      "Si en la conversación no salió, pide también: lo que le impide llegar",
    );
  });

  it("lo que devuelve el agente queda con su paso, y lo vendido también", () => {
    const respuesta = {
      id: "m",
      type: "message",
      role: "assistant",
      model: "x",
      content: [
        {
          type: "tool_use",
          id: "t",
          name: "armar_guia",
          input: {
            objetivo: "Poner en números los resultados que persigue Ventas",
            apertura: ["Gracias por el tiempo"],
            preguntas: [
              { para: "1.7", pregunta: "¿Cuántos clientes dejaron de comprar este año sin que nadie lo notara?", repreguntas: ["¿Cuánto representa?"] },
              // Repite lo que el cliente ya contó: se cae (la pantalla pone la de respaldo).
              { para: "1.2", pregunta: "¿Cómo están repartidos hoy los datos de clientes?", repreguntas: [] },
            ],
            loVendido: [{ tema: "Sales Hub", pregunta: "¿Quién va a usar el pipeline?", repreguntas: [] }],
            cierre: "Confirma lo que entendiste y acuerda el siguiente paso.",
          },
        },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Anthropic.Messages.Message;
    const guia = leerLaGuiaDelAgente(respuesta, ctx, "run")!;
    expect(guia.preguntas.map((p) => `${p.para}:${p.paso}`)).toEqual(["1.7:impacto"]);
    expect(guia.loVendido?.map((v) => v.tema)).toEqual(["Sales Hub"]);
    // Armada con el plan: ya no es «de antes del plan».
    expect(guiaDeAntesDelPlan(guia, "cs")).toBe(false);
  });

  it("«Regenerar» le habla al CSE, no al vendedor", () => {
    const p = pedidoDeUnaPregunta({ ctx, objetivo: { para: "1.7", nombre: "Dimensión 1.7", paso: "impacto", actual: "¿Cuánto?", repreguntas: [] }, otras: [] });
    expect(String(p.system)).toContain("Customer Success");
    expect(String(p.system)).toContain("CSE");
    expect(String(p.system)).not.toContain("presupuesto)");
  });
});

describe("el cierre, lo que cubre la guía y el asistente, en un proyecto", () => {
  it("la pregunta de cierre es la del proyecto; la preventa conserva la suya", () => {
    expect(preguntaDeCierre("cs")).toBe(PREGUNTA_DE_CIERRE_DEL_PROYECTO);
    expect(preguntaDeCierre("venta")).toBe(PREGUNTA_DE_CIERRE);
  });

  it("al cerrar se pide lo que falta de la estrategia y ninguna pregunta cubre", () => {
    const puntos = avanceDeLaEstrategia(proyecto());
    expect(faltanDeLaEstrategia(puntos, new Set(["retos"]))).toEqual(["Los resultados que persigue, en cifras", "Lo que le impide llegar"]);
  });

  it("lo que cubre la guía suma las piezas de lo vendido que pregunta", () => {
    const r = queCubreLaGuia({
      preguntas: [
        { para: "retos", tipo: "tarjeta" },
        { para: "vendido:1", tipo: "vendido", tema: "Service Hub" },
      ],
      puntos: avanceDeLaEstrategia(proyecto()),
      escala: ESCALA_DE_PRUEBA,
      posiciones: {},
      marco: "cs",
    });
    expect(r.vendido).toEqual(["Service Hub"]);
    expect(r.puntos.find((p) => p.id === "retos")?.estado).toBe("cubre");
    expect(queCubreLaGuia({ preguntas: [], puntos: [], escala: ESCALA_DE_PRUEBA, posiciones: {}, marco: "venta" }).vendido).toEqual([]);
  });

  it("el asistente ofrece preguntar lo que falta de la estrategia, y lo vendido si la guía no lo pregunta", () => {
    const cubre = queCubreLaGuia({ preguntas: [], puntos: avanceDeLaEstrategia(proyecto()), escala: ESCALA_DE_PRUEBA, posiciones: {}, marco: "cs" });
    const s = sugerenciasDelAsistente({ preguntas: [], cubre, dimensiones: [], posiciones: {}, nombreDe: (t) => t, sinLoVendido: true });
    expect(s).toContain("Agrega una pregunta sobre los retos del negocio");
    expect(s).toContain(SUGERENCIA_DE_LO_VENDIDO);
  });
});
