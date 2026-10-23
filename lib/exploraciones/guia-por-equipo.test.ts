/**
 * lib/exploraciones/guia-por-equipo.test.ts — la preventa por área (2026-10-23, docs/preventa-por-area-plan.md): el
 * equipo del cliente de una sesión, la guía del equipo, el orden de la conversación, lo respondido según la lectura, las
 * tarjetas que dicen la verdad, «Por equipo» y «Contarle». Los casos salen de Cicadex y CEMACO (medidos en producción
 * el 23 oct). Correr: `npx vitest run lib/exploraciones/guia-por-equipo.test.ts --project unit`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { formasDeVoseo } from "@/lib/ui/voseo-formas";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion, type LecturaDeReunion } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import {
  areaQueSuma,
  EQUIPOS,
  EQUIPOS_DEL_CLIENTE,
  esTemaDeEquipo,
  leerTemaDeEquipo,
  letraDelTemaDeEquipo,
  nombreDelTemaDeEquipo,
  sugerirEquipo,
  TEMA_DE_SISTEMAS_DE_LA_EMPRESA,
  temaDeEquipo,
} from "./equipos";
import { cambiosDesdeLaGuia, DURACION_DE_LA_SESION, preguntasParaMostrar, TRAMOS_DE_LA_SESION, type GuiaDeLaSesion } from "./guia";
import { contextoDeLaGuia, herramientaDeLaGuia, leerLaGuiaDelAgente, pedidoDeLaGuia } from "./guia-pedido";
import { contextoDelPlan, enOrdenDeConversacion, pasoQuePregunta, pasosRespondidos, planDeLaGuia, type PreguntaPlaneada } from "./plan-de-la-guia";
import { conAlgoQueSirve, diceQueNoSeSabe, estadoDeLaTarjeta } from "./estado-de-las-tarjetas";
import { listaParaProponer } from "./calidad";
import { chequeoDelMapa } from "./mapa";
import { resumenPorEquipo } from "./por-equipo";
import { queContarle } from "./contarle";
import { queCubreLaGuia } from "./que-cubre-la-guia";

// Una escala con Ventas (1) y Marketing (2), como la de producción.
const ESCALA: EscalaDelLienzo = {
  ...ESCALA_DE_PRUEBA,
  areas: [
    ...ESCALA_DE_PRUEBA.areas,
    {
      ...ESCALA_DE_PRUEBA.areas[0],
      id: "2",
      nombre: "Marketing",
      dimensiones: ESCALA_DE_PRUEBA.areas[0].dimensiones.slice(0, 4).map((d, i) => ({ ...d, id: `2.${i + 1}`, nombre: `Marketing ${i + 1}` })),
    },
  ],
};

const resumen = (plan: readonly PreguntaPlaneada[]) => plan.map((p) => `${p.para}:${p.paso}`);

/** Una exploración con una sesión próxima del equipo dado. */
function conSesion(equipo: (typeof EQUIPOS_DEL_CLIENTE)[number] | undefined, parcial: Partial<EstadoDeExploracion> = {}, areas = ["1", "2"]): EstadoDeExploracion {
  const e = estadoDePrueba({}, parcial);
  return { ...e, areas, contenido: { ...e.contenido, sesiones: [{ id: "s-prox", ...(equipo ? { equipo } : {}) }], ...(parcial.contenido ?? {}) } };
}

function planDe(estado: EstadoDeExploracion, extra: Partial<Parameters<typeof planDeLaGuia>[0]> = {}) {
  const ctx = contextoDelPlan({ estado, tests: [], escala: ESCALA, posiciones: {}, sesionId: "s-prox" });
  return planDeLaGuia({ ...ctx, casillas: estado.contenido.casillas, escala: ESCALA, areas: estado.areas, posiciones: {}, aExplorar: {}, ...extra });
}

describe("los equipos del cliente", () => {
  it("cada equipo tiene sus temas en orden, su prioridad sale de sus temas y su cierre", () => {
    for (const e of EQUIPOS_DEL_CLIENTE) {
      const def = EQUIPOS[e];
      expect(def.temas.length).toBeGreaterThanOrEqual(3);
      const temas = new Set(def.temas.map((t) => t.tema));
      for (const t of def.prioridad) expect(temas.has(t)).toBe(true);
      expect(def.cierre).toMatch(/\?$/);
    }
    // Ventas, Marketing y Servicio son las áreas 1, 2 y 3 de la escala; los demás no tienen área.
    expect([EQUIPOS.ventas.area, EQUIPOS.marketing.area, EQUIPOS.servicio.area]).toEqual(["1", "2", "3"]);
    expect([EQUIPOS.direccion.area, EQUIPOS.operaciones.area, EQUIPOS.tecnologia.area]).toEqual([null, null, null]);
  });

  it("las preguntas de base están en tuteo, son cortas y son preguntas", () => {
    for (const e of EQUIPOS_DEL_CLIENTE) {
      for (const t of EQUIPOS[e].temas) {
        for (const texto of [t.pregunta, ...t.repreguntas]) {
          expect(formasDeVoseo(texto), `${e}.${t.tema}: ${texto}`).toEqual([]);
          expect(texto.split(/\s+/).length, texto).toBeLessThanOrEqual(30);
          expect(texto).toMatch(/[?.]$/);
        }
      }
    }
  });

  it("Marketing pregunta lo de Marco: cómo está armado, cómo lo miden, canal por canal, sistemas y qué duele en cada canal", () => {
    expect(EQUIPOS.marketing.temas.map((t) => t.tema)).toEqual(["estructura", "medicion", "proceso", "sistemas", "dolor"]);
    expect(EQUIPOS.marketing.temas.find((t) => t.tema === "medicion")?.pregunta).toMatch(/te miden/);
    // Tecnología arma el mapa técnico de la nota de Andrés: dónde vive cada dato, integraciones y el identificador.
    expect(EQUIPOS.tecnologia.temas.map((t) => t.tema)).toEqual(["estructura", "proceso", "sistemas", "datos", "dolor"]);
  });

  it("los temas se escriben <equipo>.<tema> y se leen de vuelta", () => {
    expect(temaDeEquipo("marketing", "medicion")).toBe("marketing.medicion");
    expect(leerTemaDeEquipo("marketing.medicion")?.equipo).toBe("marketing");
    expect(leerTemaDeEquipo(TEMA_DE_SISTEMAS_DE_LA_EMPRESA)?.equipo).toBeNull();
    expect(leerTemaDeEquipo("marketing.inventado")).toBeNull();
    expect(leerTemaDeEquipo("1.3")).toBeNull();
    expect(esTemaDeEquipo("metas")).toBe(false);
    expect(nombreDelTemaDeEquipo("marketing.medicion")).toBe("Marketing · Cómo lo miden");
    expect(nombreDelTemaDeEquipo("marketing.medicion", { conEquipo: false })).toBe("Cómo lo miden");
    expect(letraDelTemaDeEquipo("marketing.medicion")).toBe("M");
    expect(letraDelTemaDeEquipo("tecnologia.datos")).toBe("TI");
  });

  it("Nexus sugiere el equipo por el objetivo antes que por el título (las sesiones de CEMACO)", () => {
    // 20 oct: el título del calendario dice Sales Hub, el objetivo de Liliana dice Marketing.
    expect(sugerirEquipo(["Entender cómo va a operar el equipo de Marketing de Cemaco dentro de la operación", "Cemaco | Sales Hub"])).toBe("marketing");
    expect(sugerirEquipo([null, "Cemaco | Data Hub"])).toBe("tecnologia");
    expect(sugerirEquipo([undefined, "Cemaco | Sales Hub"])).toBe("ventas");
    // Dos equipos en el mismo texto no deciden; sin nada, no se sabe.
    expect(sugerirEquipo(["Integrar ventas y marketing"])).toBeNull();
    expect(sugerirEquipo(["Inicio de diagnóstico | CEMACO INTERNACIONAL + HUBSPOT + SMARTEAM"])).toBeNull();
    // «para ti» no es Tecnología.
    expect(sugerirEquipo(["Lo que es importante para ti este año"])).toBeNull();
  });

  it("elegir un equipo suma su área de la escala si no está en juego", () => {
    expect(areaQueSuma("marketing", ["1"], ESCALA.areas)).toBe("2");
    expect(areaQueSuma("marketing", ["1", "2"], ESCALA.areas)).toBeNull();
    expect(areaQueSuma("tecnologia", ["1"], ESCALA.areas)).toBeNull();
    // La escala de prueba no trae Servicio: no se suma un área que no existe.
    expect(areaQueSuma("servicio", ["1"], ESCALA.areas)).toBeNull();
  });
});

describe("la guía de una sesión con un equipo", () => {
  it("Marketing: sus cinco temas en el orden de la conversación, sin quién firma ni presupuesto", () => {
    const plan = planDe(conSesion("marketing"));
    expect(resumen(plan)).toEqual([
      "marketing.estructura:situacion",
      "marketing.medicion:impacto",
      "marketing.proceso:situacion",
      "marketing.sistemas:situacion",
      "marketing.dolor:impacto",
    ]);
    expect(plan.every((p) => p.tipo === "equipo")).toBe(true);
  });

  it("con lo llevado de antes, entra por la prioridad del equipo y se conversa en su orden", () => {
    const plan = planDe(conSesion("marketing"), { llevados: 2 });
    expect(resumen(plan)).toEqual(["marketing.medicion:impacto", "marketing.proceso:situacion", "marketing.dolor:impacto"]);
  });

  it("lo que el equipo ya respondió en otra sesión no se vuelve a preguntar; lo de otro equipo, sí", () => {
    const ya = new Map([["marketing.estructura", new Set(["situacion" as const])]]);
    expect(planDe(conSesion("marketing"), { yaPreguntado: ya }).map((p) => p.para)).not.toContain("marketing.estructura");
    expect(planDe(conSesion("servicio"), { yaPreguntado: ya }).map((p) => p.para)).toContain("servicio.estructura");
  });

  it("si el cliente ya contó un dolor de su área, «dónde duele» es esa dimensión, en impacto", () => {
    const e = conSesion("marketing", {
      contenido: { ...contenidoVacio(), sesiones: [{ id: "s-prox", equipo: "marketing" }], casillas: { retos: [{ texto: "No hay una métrica que ligue la campaña con la venta", dimensionId: "2.2" }] } },
    });
    const plan = planDe(e);
    expect(resumen(plan)).toContain("2.2:impacto");
    expect(plan.map((p) => p.para)).not.toContain("marketing.dolor");
    // Un dolor de Ventas no entra en la sesión de Marketing.
    const deVentas = conSesion("marketing", {
      contenido: { ...contenidoVacio(), sesiones: [{ id: "s-prox", equipo: "marketing" }], casillas: { retos: [{ texto: "Las comisiones se calculan a mano", dimensionId: "1.4" }] } },
    });
    expect(planDe(deVentas).map((p) => p.para)).not.toContain("1.4");
  });

  it("Dirección en la preventa: sus temas y después para cuándo, quién firma y el presupuesto, que va último", () => {
    const plan = planDe(conSesion("direccion"));
    expect(plan.map((p) => p.para)).toEqual(["direccion.prioridades", "direccion.medicion", "direccion.dolor", "tiempos", "autoridad"]);
    const conLugar = planDe(conSesion("direccion"), { max: 6 });
    expect(conLugar[conLugar.length - 1].para).toBe("presupuesto");
    // En un proyecto el cliente ya compró: sin lo de la venta.
    expect(planDe(conSesion("direccion"), { marco: "cs" }).some((p) => p.tipo === "tarjeta")).toBe(false);
  });

  it("el pedido al agente lleva el equipo, sus temas y no pide quién firma ni presupuesto al cerrar", () => {
    const estado = conSesion("marketing", { contenido: { ...contenidoVacio(), sesiones: [{ id: "s-prox", fecha: "2026-10-30", equipo: "marketing" }] } });
    const ctx = contextoDeLaGuia({ empresa: "Cemaco", industria: null, estado, escala: ESCALA, posiciones: {}, pendientes: [], agenda: [], conTest: false, hoy: "2026-10-23" });
    expect(ctx.equipo?.nombre).toBe("Marketing");
    expect(ctx.lentes?.map((l) => l.para)).toEqual(EQUIPOS.marketing.temas.map((t) => `marketing.${t.tema}`));
    expect(ctx.faltanAlCerrar).toEqual([]);
    const herramienta = herramientaDeLaGuia(ctx) as { input_schema: { properties: { preguntas: { items: { properties: { para: { enum: string[] } } } } } } };
    expect(herramienta.input_schema.properties.preguntas.items.properties.para.enum).toContain("marketing.medicion");
    const texto = String(pedidoDeLaGuia(ctx).messages[0].content);
    expect(texto).toContain("=== EL EQUIPO DE ESTA SESIÓN: MARKETING");
    expect(texto).toContain("marketing.proceso («Marketing · Cómo funciona cada canal»");
    expect(String(pedidoDeLaGuia(ctx).system)).toContain("LO TÉCNICO Y EL PROCESO");
  });

  it("lo que devuelve el agente guarda el equipo y sus temas, y la lectura los encuentra en una guía ya guardada", () => {
    const estado = conSesion("marketing", { contenido: { ...contenidoVacio(), sesiones: [{ id: "s-prox", fecha: "2026-10-30", equipo: "marketing" }] } });
    const ctx = contextoDeLaGuia({ empresa: "Cemaco", industria: null, estado, escala: ESCALA, posiciones: {}, pendientes: [], agenda: [], conTest: false, hoy: "2026-10-23" });
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
            objetivo: "Entender canal a canal cómo opera marketing y con qué número lo miden",
            apertura: ["Retomamos lo de las agencias."],
            preguntas: [
              { para: "marketing.medicion", pregunta: "¿Con qué número te mide la gerencia hoy?", repreguntas: ["¿Cuánto es hoy?"] },
              { para: "metas", pregunta: "¿Qué quieres lograr?", repreguntas: [] },
            ],
            objeciones: [],
            pocaApertura: "x",
            cierre: "Entonces lo que más les pesa es medir. ¿Es así? Agendemos la siguiente.",
          },
        },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    } as unknown as Anthropic.Messages.Message;
    const g = leerLaGuiaDelAgente(respuesta, ctx, "run-1", new Date("2026-10-23T12:00:00Z"));
    expect(g?.equipo).toBe("marketing");
    expect(g?.lentes).toHaveLength(5);
    // Lo que no apunta a algo del plan se cae (la meta no está en la sesión de Marketing).
    expect(g?.preguntas.map((p) => p.para)).toEqual(["marketing.medicion"]);
    // Sin el plan (como la lee la lectura de la reunión): los temas del equipo siguen ahí, con la del agente.
    const sinPlan = preguntasParaMostrar(g, g!.huecos, g!.enfoque, ESCALA);
    expect(sinPlan.filter((p) => p.tipo === "equipo").map((p) => p.para)).toEqual(EQUIPOS.marketing.temas.map((t) => `marketing.${t.tema}`));
    expect(sinPlan.find((p) => p.para === "marketing.medicion")?.pregunta).toBe("¿Con qué número te mide la gerencia hoy?");
  });

  it("la guía queda vieja si la sesión cambia de equipo", () => {
    const g = { huecos: [], enfoque: [], equipo: "ventas" as const };
    expect(cambiosDesdeLaGuia(g, [], [], [], { equipo: "marketing" })?.equipo).toEqual({ antes: "ventas", ahora: "marketing" });
    expect(cambiosDesdeLaGuia(g, [], [], [], { equipo: "ventas" })).toBeNull();
    // Una guía de antes (sin equipo) de una sesión sin equipo sigue al día.
    expect(cambiosDesdeLaGuia({ huecos: [], enfoque: [] }, [], [], [], { equipo: null })).toBeNull();
  });
});

describe("una sesión de una hora que sigue la conversación", () => {
  it("la sesión dura una hora y tiene tiempo para contarle", () => {
    expect(DURACION_DE_LA_SESION).toBe(60);
    expect(TRAMOS_DE_LA_SESION.contar).toEqual([40, 50]);
    expect(TRAMOS_DE_LA_SESION.cerrar[1]).toBe(60);
  });

  it("lo de antes primero, la meta, cómo pasa, cuánto cuesta, cómo, cuándo, con qué y el presupuesto último", () => {
    const p = (para: string, paso: PreguntaPlaneada["paso"], tipo: PreguntaPlaneada["tipo"] = "tarjeta"): PreguntaPlaneada => ({ para, paso, tipo, motivo: null });
    const plan = [p("1.7", "impacto", "dimension"), p("presupuesto", "conQue"), p("metas", "impacto"), p("tiempos", "cuando"), p("retos", "situacion"), p("1.2", "impacto", "dimension")];
    expect(enOrdenDeConversacion(plan, new Set(["1.2"])).map((x) => x.para)).toEqual(["1.2", "metas", "retos", "1.7", "tiempos", "presupuesto"]);
  });

  it("lo que una lectura dio por respondido cuenta como preguntado (CEMACO, 20 oct)", () => {
    const guias: Record<string, Pick<GuiaDeLaSesion, "preguntas" | "en">> = {
      "s-1": { en: "2026-10-19T10:00:00Z", preguntas: [{ para: "1.2", pregunta: "¿Cuántas campañas…?", repreguntas: [], paso: "impacto" }] },
    };
    const lecturas: Record<string, Pick<LecturaDeReunion, "cobertura" | "en">> = {
      "meet:x": {
        en: "2026-10-21T10:00:00Z",
        cobertura: [
          { para: "1.2", pregunta: "¿Cuántas campañas…?", respondida: true },
          { para: "1.7", pregunta: "¿Cuántos leads…?", respondida: false },
          { para: "marketing.estructura", pregunta: "¿Cómo está armado?", respondida: true },
        ],
      },
    };
    const ya = pasosRespondidos(lecturas, guias);
    expect([...(ya.get("1.2") ?? [])]).toEqual(["impacto"]);
    expect(ya.has("1.7")).toBe(false);
    expect([...(ya.get("marketing.estructura") ?? [])]).toEqual(["situacion"]);
    /* Una guía armada DESPUÉS de la lectura no planeó esa reunión (en CEMACO se rearmó en la misma corrida que la leyó):
       el paso sale del texto de la pregunta respondida. */
    const sinLaGuia = pasosRespondidos(lecturas, { "s-2": { ...guias["s-1"], en: "2026-10-22T00:00:00Z" } });
    expect([...(sinLaGuia.get("1.2") ?? [])]).toEqual(["impacto"]);
    const situacional = pasosRespondidos(
      { "meet:y": { en: "2026-10-21T10:00:00Z", cobertura: [{ para: "1.6", pregunta: "Cuando un asesor recibe varios clientes a la vez, ¿con qué criterio decide a cuál atender primero?", respondida: true }] } },
      {},
    );
    expect([...(situacional.get("1.6") ?? [])]).toEqual(["situacion"]);
    // Lo sumado a mano o lo vendido no tienen paso.
    expect(pasosRespondidos({ "meet:z": { en: "2026-10-21T10:00:00Z", cobertura: [{ para: "propia:p1", pregunta: "¿Cuántos?", respondida: true }] } }, {}).size).toBe(0);
  });

  it("el paso de una pregunta, por su texto", () => {
    expect(pasoQuePregunta("¿Cuántas horas a la semana se van en eso?")).toBe("impacto");
    expect(pasoQuePregunta("¿Cómo te gustaría que funcione?")).toBe("solucion");
    expect(pasoQuePregunta("¿Para cuándo lo necesitan?")).toBe("cuando");
    expect(pasoQuePregunta("¿Tienen un rango de inversión pensado?")).toBe("conQue");
    expect(pasoQuePregunta("¿Qué pasa cuando entra un lead por WhatsApp?")).toBe("situacion");
  });

  it("la conversación se puso técnica: entra una pregunta de sistemas y datos a la sesión de la empresa", () => {
    const sin = planDe(conSesion(undefined));
    expect(sin.map((p) => p.para)).not.toContain(TEMA_DE_SISTEMAS_DE_LA_EMPRESA);
    const propuesta = { ...propuestaVacia(), alertaTecnica: { reunion: "Reunión del 8 oct", temas: ["ERP"], en: "2026-10-08T00:00:00Z", corridaId: "r" } };
    const tecnica = planDe(conSesion(undefined, { propuesta }));
    expect(tecnica.map((p) => p.para)).toContain(TEMA_DE_SISTEMAS_DE_LA_EMPRESA);
  });
});

describe("el panel dice la verdad", () => {
  it("un texto que dice que no se sabe no es un dato (las tarjetas de Cicadex)", () => {
    expect(diceQueNoSeSabe("No determinado por el momento, primero haremos un diagnóstico completo")).toBe(true);
    expect(diceQueNoSeSabe("Sin fecha límite explícita declarada por el cliente en la reunión del 8 oct 2026.")).toBe(true);
    expect(diceQueNoSeSabe("Por definir con gerencia")).toBe(true);
    expect(diceQueNoSeSabe("Antes de la temporada de diciembre, cuando entra el 40 % de las ventas")).toBe(false);
    expect(diceQueNoSeSabe("Entre 15 y 20 mil dólares, contra lo que cuesta su agencia")).toBe(false);
    expect(conAlgoQueSirve(["No determinado por el momento", "Sin fecha límite explícita"])).toBe(false);
    expect(conAlgoQueSirve(["No determinado", "Antes de diciembre"])).toBe(true);
  });

  it("completa, a medias, sugerida o falta; y lo nuevo de una sesión en una tarjeta que ya tiene algo", () => {
    expect(estadoDeLaTarjeta("tiempos", ["No determinado por el momento, primero haremos un diagnóstico completo"], 0)).toMatchObject({ estado: "aMedias" });
    expect(estadoDeLaTarjeta("autoridad", [{ nombre: "Jeremy Rojas", rol: "influye" }], 0)).toMatchObject({ estado: "aMedias", motivo: "nadie aprueba todavía" });
    expect(estadoDeLaTarjeta("autoridad", [{ nombre: "Lucía León", rol: "firma" }], 0).estado).toBe("completa");
    expect(estadoDeLaTarjeta("metas", [{ que: "Tener una vista 360° del cliente" }], 0)).toMatchObject({ estado: "aMedias", motivo: "ninguna meta tiene cifra" });
    expect(estadoDeLaTarjeta("metas", [{ que: "Crecer en ventas", objetivo: "5 %" }], 0).estado).toBe("completa");
    expect(estadoDeLaTarjeta("retos", [{ texto: "Los datos del cliente están fragmentados" }], 2)).toEqual({ estado: "completa", nuevo: true });
    expect(estadoDeLaTarjeta("planes", [], 1).estado).toBe("sugerida");
    expect(estadoDeLaTarjeta("planes", undefined, 0).estado).toBe("falta");
  });

  it("«Para proponer» no cuenta como listo el «para cuándo» que dice que no se sabe", () => {
    const e = estadoDePrueba();
    e.contenido.casillas = { tiempos: ["No determinado por el momento"], presupuesto: "Sin presupuesto definido todavía" };
    const puntos = listaParaProponer(e, chequeoDelMapa(ESCALA_DE_PRUEBA, e.areas, {}));
    expect(puntos.find((p) => p.id === "tiempos")?.cumplido).toBe(false);
    expect(puntos.find((p) => p.id === "presupuesto")?.cumplido).toBe(false);
    // Y la guía lo vuelve a preguntar.
    expect(planDe({ ...conSesion(undefined), contenido: { ...conSesion(undefined).contenido, casillas: e.contenido.casillas } }).map((p) => p.para)).toContain("tiempos");
  });

  it("«Por equipo»: cada equipo con sus sesiones y sus temas respondidos; las sesiones sin equipo aparte", () => {
    const pestanas = [
      { sesion: { equipo: "marketing" as const }, hecha: true },
      { sesion: { equipo: "marketing" as const }, hecha: false },
      { sesion: { equipo: "tecnologia" as const }, hecha: true },
      { sesion: {}, hecha: true },
      { sesion: null, hecha: false },
      { sesion: { equipo: "ventas" as const }, hecha: true, noSeHizo: true },
    ];
    const ya = new Map<string, Set<string>>([
      ["marketing.estructura", new Set(["situacion"])],
      ["2.2", new Set(["impacto"])],
    ]);
    const r = resumenPorEquipo(pestanas, ya, (area) => ESCALA.areas.find((a) => a.id === area)?.dimensiones.map((d) => d.id) ?? []);
    expect(r.filas.map((f) => f.equipo)).toEqual(["marketing", "tecnologia"]);
    const mk = r.filas[0];
    expect(mk).toMatchObject({ sesiones: 2, hechas: 1, respondidos: 2 });
    // El dolor de Marketing se respondió con la dimensión de su área.
    expect(mk.temas.find((t) => t.id === "marketing.dolor")?.respondido).toBe(true);
    expect(r.sinEquipo).toBe(2);
  });

  it("«Lo que cubre la guía» de una sesión con equipo dice qué de ese equipo pregunta", () => {
    const preguntas = [
      { para: "marketing.medicion", tipo: "equipo" as const },
      { para: "2.2", tipo: "dimension" as const, paso: "impacto" as const },
    ];
    const r = queCubreLaGuia({ preguntas, puntos: [], escala: ESCALA, posiciones: {}, marco: "venta", equipo: "marketing", yaPreguntado: new Map([["marketing.estructura", new Set(["situacion"])]]) });
    const estado = Object.fromEntries(r.temasDelEquipo.map((t) => [t.id, t.estado]));
    expect(estado).toEqual({
      "marketing.estructura": "listo",
      "marketing.medicion": "cubre",
      "marketing.proceso": "falta",
      "marketing.sistemas": "falta",
      "marketing.dolor": "cubre",
    });
  });
});

describe("Contarle", () => {
  const nombreDeNivel = (l: string) => ({ D: "Deficiente", I: "Inicial", F: "Funcional" })[l] ?? l;
  it("con un equipo: el nivel de su área y los casos que encajan con ella", () => {
    const r = queContarle({
      marco: "venta",
      equipo: "marketing",
      areas: [
        { id: "1", nombre: "Ventas", nivel: "D" },
        { id: "2", nombre: "Marketing", nivel: "I" },
      ],
      nombreDeNivel,
      casos: [
        { titulo: "Atribución de marketing a la venta", areaId: "2" },
        { titulo: "Recuperar oportunidades frías", areaId: "1" },
      ],
    });
    expect(r.guia).toContain("Marketing");
    expect(r.puntos).toEqual(["Marketing está hoy en Inicial: cuéntale qué cambia en el siguiente escalón.", "Un caso que encaja: Atribución de marketing a la venta."]);
  });

  it("en un proyecto, sin casos de uso; sin nivel, sin puntos", () => {
    const r = queContarle({ marco: "cs", equipo: null, areas: [{ id: "1", nombre: "Ventas", nivel: null }], nombreDeNivel, casos: [{ titulo: "x", areaId: null }] });
    expect(r.guia).toContain("lo que se vendió");
    expect(r.puntos).toEqual([]);
  });
});
