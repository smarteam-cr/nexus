/**
 * lib/exploraciones/preventa-k7-k8.test.ts — la siguiente pregunta de calidad (K7), lo que sirve del método de Andrés
 * (K8), la investigación que viene de la empresa (R5, segunda parte) y lo que Smarteam dice de sí mismo en la preventa
 * (2026-10-26, docs/exploracion-mejoras-plan.md).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { Letra } from "@/lib/escala/documento/tipos";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import { contextoDeLaGuia, herramientaDeLaGuia, leerLaGuiaDelAgente, notasParaLaGuia, pedidoDeLaGuia, voseoEnLaGuia } from "./guia-pedido";
import { investigacionDesdeLaRadiografia, radiografiaDesdeLaInvestigacion } from "./radiografia-pedido";
import { textoParaLaPreventa, PERFIL_VACIO } from "@/lib/smarteam/perfil";
import { GUIA_VIEJA_DE_LARCE, LARCE_AL_ARMAR_LA_GUIA, POSICIONES_DE_LARCE, TESTS_DE_LARCE } from "./__fixtures__/preventa-larce";
import { focoDeLaGuia, preguntasParaMostrar, preguntaQueValida, type GuiaDeLaSesion } from "./guia";
import { contextoDelPlan } from "./plan-de-la-guia";
import { revisarPregunta } from "./guia-pregunta-pedido";
import { queCubreLaGuia } from "./que-cubre-la-guia";

const area = ESCALA_DE_PRUEBA.areas[0];
const dim = area.dimensiones[0];
const TEST = {
  contacto: "Ana Pérez",
  resultado: {
    areaId: area.id,
    fecha: "2026-10-20",
    url: "https://diagnostico.example/#x",
    respuestas: [{ dimensionId: dim.id, nivel: "I" as Letra, respuesta: "Priorizamos por intuición o listas estáticas", matiz: null }],
  },
};

function ctxConTest(extra: Partial<Parameters<typeof contextoDeLaGuia>[0]> = {}) {
  const estado = estadoDePrueba({}, {});
  return contextoDeLaGuia({
    empresa: "Larce",
    industria: null,
    estado: { ...estado, areas: [area.id] },
    escala: ESCALA_DE_PRUEBA,
    posiciones: {},
    pendientes: [],
    agenda: [],
    conTest: true,
    hoy: "2026-10-26",
    tests: [TEST],
    ...extra,
  });
}

const respuestaCon = (input: Record<string, unknown>) =>
  ({
    id: "m",
    type: "message",
    role: "assistant",
    model: "x",
    content: [{ type: "tool_use", id: "t", name: "armar_guia", input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  }) as unknown as Anthropic.Messages.Message;

describe("K7 · lo del test se valida", () => {
  it("la pregunta que parte solo de lo que marcó en el test va «a validar» y el pedido lo dice", () => {
    const ctx = ctxConTest();
    const delTest = ctx.plan?.find((pl) => pl.para === dim.id);
    expect(delTest?.aValidar).toBe(true);
    const pedido = pedidoDeLaGuia(ctx);
    expect(String(pedido.messages[0].content)).toContain("A VALIDAR: parte de lo que MARCÓ EN EL TEST");
    expect(String(pedido.system)).toContain("LO QUE MARCÓ EN EL TEST");
    expect(String(pedido.system)).toContain("En el diagnóstico marcaste que …; ¿cómo se ve eso en el día a día?");
  });

  it("la pregunta que valida se guarda tal cual: no se le quita lo que marcó ni se cae por repetirlo", () => {
    const ctx = ctxConTest();
    const pregunta = "En el diagnóstico marcaste que priorizan por intuición o listas estáticas; ¿cómo se ve eso en el día a día?";
    const g = leerLaGuiaDelAgente(
      respuestaCon({ objetivo: "Validar el test", apertura: ["Hola."], preguntas: [{ para: dim.id, pregunta, repreguntas: [] }], objeciones: [], pocaApertura: "x", cierre: "Listo." }),
      ctx,
      "run",
    );
    expect(g?.preguntas.find((p) => p.para === dim.id)?.pregunta).toBe(pregunta);
  });

  it("en Larce, la del CRM (marcada en el test) se muestra validando; sin la del agente, la de respaldo también valida", () => {
    const ctx = contextoDelPlan({ estado: LARCE_AL_ARMAR_LA_GUIA, tests: TESTS_DE_LARCE, escala: ESCALA_DE_PRUEBA, posiciones: POSICIONES_DE_LARCE, sesionId: null });
    const foco = focoDeLaGuia(LARCE_AL_ARMAR_LA_GUIA.contenido.casillas, ESCALA_DE_PRUEBA, ["1"], POSICIONES_DE_LARCE, {}, undefined, ctx);
    const mostrar = (g: GuiaDeLaSesion) => preguntasParaMostrar(g, foco.huecos, foco.enfoque, ESCALA_DE_PRUEBA, undefined, undefined, { plan: foco.plan!, saber: ctx.saber });
    const delTest = foco.plan!.find((pl) => pl.motivo?.origen === "test")!;
    expect(delTest.para).toBe("1.2");

    const respaldo = mostrar({ ...GUIA_VIEJA_DE_LARCE, preguntas: [] }).find((p) => p.aValidar);
    expect(respaldo?.pregunta).toBe(preguntaQueValida(delTest.motivo!.texto));
    expect(respaldo?.pregunta).toBe("En el diagnóstico marcaste que el CRM se usa en lo básico con carga manual; ¿cómo se ve eso en el día a día?");
    // Las demás no cambian: la del dolor que contó en una nota sigue sin decir de dónde sale.
    expect(mostrar({ ...GUIA_VIEJA_DE_LARCE, preguntas: [] }).filter((p) => p.pregunta.startsWith("En el diagnóstico"))).toHaveLength(1);

    const delAgente = "En el diagnóstico marcaste que el CRM se usa en lo básico. ¿Quién sigue con sus hojas y por qué?";
    const conAgente = mostrar({ ...GUIA_VIEJA_DE_LARCE, preguntas: [{ para: "1.2", paso: "impacto", pregunta: delAgente, repreguntas: [] }] }).find((p) => p.aValidar);
    expect(conAgente?.pregunta).toBe(delAgente);
  });

  it("«Regenerar» una pregunta a validar: la nueva puede abrir con lo que marcó y no se cae por repetirlo", () => {
    const nueva = "En el diagnóstico marcaste que priorizan por intuición. ¿Qué pasó con la última oportunidad que se enfrió?";
    expect(revisarPregunta(nueva, [], { yaEstan: [], aValidar: true })).toMatchObject({ ok: true, pregunta: nueva });
    // Sin «a validar», la cita de adelante se quita como siempre.
    const sin = revisarPregunta(nueva, [], { yaEstan: [] });
    expect(sin.ok && sin.pregunta.startsWith("En el diagnóstico")).toBe(false);
  });

  it("las notas de HubSpot llegan con su texto: la del test primero, cortas y sin espacios de más", () => {
    const notas = notasParaLaGuia(
      [
        { ocurrioAt: "2026-10-22T10:00:00Z", autor: "Marco", asunto: null, texto: "Llamada:   quieren   ordenar el seguimiento" },
        { ocurrioAt: "2026-10-01T10:00:00Z", autor: null, asunto: "📊 Diagnóstico de Rendimiento", texto: "Ventas: Inicial" },
        { ocurrioAt: "2026-09-01T10:00:00Z", autor: null, asunto: null, texto: "   " },
      ],
      5,
    );
    expect(notas.map((n) => n.texto)).toEqual(["📊 Diagnóstico de Rendimiento: Ventas: Inicial", "Llamada: quieren ordenar el seguimiento"]);
    expect(notas[1]).toMatchObject({ fecha: "2026-10-22", autor: "Marco" });
    // El día es el de Costa Rica: una nota de las 9 de la noche del 21 no queda del 22.
    expect(notasParaLaGuia([{ ocurrioAt: "2026-10-22T03:00:00Z", autor: null, asunto: null, texto: "x" }])[0].fecha).toBe("2026-10-21");
    const ctx = ctxConTest({ notasDeHubspot: notas });
    expect(String(pedidoDeLaGuia(ctx).messages[0].content)).toContain("=== LAS NOTAS RECIENTES DE SU HUBSPOT");
  });
});

describe("K8 · el método de Andrés en las instrucciones", () => {
  it("la secuencia, el caso de punta a punta, las cifras con período y fuente, no asumir adopción y la evidencia al cerrar", () => {
    const sistema = String(pedidoDeLaGuia(ctxConTest()).system);
    expect(sistema).toContain("el último ejemplo real → cada cuánto pasa → qué efecto tiene");
    expect(sistema).toContain("de punta a punta");
    expect(sistema).toContain("cerrado, facturado o cobrado");
    expect(sistema).toContain("No asumas que el problema es que «no usan la herramienta»");
  });

  it("cada pregunta dice qué investiga y qué pedir que muestre; se guardan con la guía", () => {
    const ctx = ctxConTest();
    const herramienta = herramientaDeLaGuia(ctx) as { input_schema: { properties: { preguntas: { items: { properties: Record<string, unknown> } }; cierre: { description: string } } } };
    expect(Object.keys(herramienta.input_schema.properties.preguntas.items.properties)).toEqual(expect.arrayContaining(["investiga", "pideVer"]));
    expect(herramienta.input_schema.properties.cierre.description).toContain("la evidencia que falta");
    const g = leerLaGuiaDelAgente(
      respuestaCon({
        objetivo: "x",
        apertura: ["Hola."],
        preguntas: [{ para: dim.id, pregunta: "En el diagnóstico marcaste algo; ¿cómo se ve?", repreguntas: [], investiga: "Creemos que no hay criterio para priorizar", pideVer: "El reporte de oportunidades" }],
        objeciones: [],
        pocaApertura: "x",
        cierre: "Listo.",
      }),
      ctx,
      "run",
    );
    expect(g?.preguntas[0]).toMatchObject({ investiga: "Creemos que no hay criterio para priorizar", pideVer: "El reporte de oportunidades" });
    // Lo nuevo también se revisa en tuteo.
    expect(voseoEnLaGuia({ ...g!, preguntas: [{ ...g!.preguntas[0], pideVer: "El reporte, si lo tenés a mano" }] })).not.toEqual([]);
  });

  it("una sesión con la empresa entera sugiere las sesiones por equipo que siguen; una de un equipo, no", () => {
    const ctx = ctxConTest();
    expect(ctx.sugerirSesionesPorEquipo).toBe(true);
    const g = leerLaGuiaDelAgente(
      respuestaCon({
        objetivo: "x",
        apertura: ["Hola."],
        preguntas: [],
        objeciones: [],
        pocaApertura: "x",
        cierre: "Listo.",
        sesionesPorEquipo: [
          { equipo: "marketing", porque: "La pauta no se liga a las ventas." },
          { equipo: "marketing", porque: "repetida" },
          { equipo: "inventado", porque: "no existe" },
          { equipo: "financiero", porque: "Lo cerrado no calza con lo cobrado." },
        ],
      }),
      ctx,
      "run",
    );
    expect(g?.sesionesSugeridas).toEqual([
      { equipo: "marketing", porque: "La pauta no se liga a las ventas." },
      { equipo: "financiero", porque: "Lo cerrado no calza con lo cobrado." },
    ]);
    const estado = estadoDePrueba({}, {});
    const conEquipo = contextoDeLaGuia({
      empresa: "Larce",
      industria: null,
      estado: { ...estado, areas: [area.id], contenido: { ...estado.contenido, sesiones: [{ id: "s-prox", fecha: "2026-10-30", equipo: "ventas" }] } },
      escala: ESCALA_DE_PRUEBA,
      posiciones: {},
      pendientes: [],
      agenda: [],
      conTest: false,
      hoy: "2026-10-26",
    });
    expect(conEquipo.sugerirSesionesPorEquipo).toBeUndefined();
  });

  it("el contraste entre equipos cuenta solo las sesiones que se hicieron y dejaron qué leer", () => {
    const estado = estadoDePrueba({}, {});
    const con = (sesiones: NonNullable<typeof estado.contenido.sesiones>) =>
      contextoDeLaGuia({ empresa: "Larce", industria: null, estado: { ...estado, areas: [area.id], contenido: { ...estado.contenido, sesiones } }, escala: ESCALA_DE_PRUEBA, posiciones: {}, pendientes: [], agenda: [], conTest: false, hoy: "2026-10-26" });
    const hechas = [
      { id: "a", fecha: "2026-10-10", equipo: "ventas" as const },
      { id: "b", fecha: "2026-10-12", equipo: "marketing" as const, hecha: true },
    ];
    expect(con(hechas).equiposConSesion).toEqual(["Ventas", "Marketing"]);
    expect(con([hechas[0], { ...hechas[1], resultado: "noSeHizo" as const }]).equiposConSesion).toEqual(["Ventas"]);
  });

  it("«Lo que cubre la guía» no marca la inversión como pendiente cuando la guía no la pregunta", () => {
    const r = queCubreLaGuia({ preguntas: [{ para: "ventas.medicion", tipo: "equipo" as const }], puntos: [], escala: ESCALA_DE_PRUEBA, posiciones: {}, marco: "venta", equipo: "ventas" });
    expect(r.temasDelEquipo.some((t) => t.id === "ventas.inversion")).toBe(false);
  });
});

describe("R5 · la preventa lee la investigación de la empresa", () => {
  const INVESTIGACION = {
    hechaAt: new Date("2026-10-24T12:00:00Z"),
    resumen: "Distribuye repuestos para talleres en Centroamérica.",
    contenido: { sector: "Repuestos automotrices", stack: ["HubSpot", "SAP"], hitos: [{ texto: "Abrió sede en Panamá", fecha: "2026-05", url: "https://noticia.example/panama" }] },
    contrataciones: [{ puesto: "Gerente de ventas regional", url: "https://empleo.example/1" }],
  };

  it("una investigación vigente es la radiografía de la preventa, con las contrataciones como una línea más", () => {
    const r = radiografiaDesdeLaInvestigacion(INVESTIGACION, "run", new Date("2026-10-26T12:00:00Z"));
    expect(r?.item.destino).toEqual({ tipo: "casilla", clave: "radiografia" });
    expect(r?.fuente.id).toBe("W1");
    expect(r?.fuente.etiqueta).toContain("2026-10-24");
    expect(r?.fuente.texto).toContain("Está contratando: Gerente de ventas regional");
    expect(r?.fuente.texto).toContain("Sector: Repuestos automotrices");
  });

  it("sin nada que sirva no hay radiografía; y la radiografía de la preventa vuelve a la empresa con sus enlaces", () => {
    expect(radiografiaDesdeLaInvestigacion({ ...INVESTIGACION, resumen: null, contenido: {}, contrataciones: [] }, "run")).toBeNull();
    expect(investigacionDesdeLaRadiografia({ resumen: "x", sector: "y", hitos: [{ texto: "Hito", url: "https://a.example" }] })).toEqual({
      resumen: "x",
      contenido: { sector: "y", hitos: [{ texto: "Hito", url: "https://a.example" }] },
      fuentes: [{ url: "https://a.example" }],
    });
    expect(investigacionDesdeLaRadiografia({})).toBeNull();
  });
});

describe("Smarteam en la preventa", () => {
  it("solo la propuesta de valor y el position statement, cortos; sin ellos, nada", () => {
    const base = { empresa: { id: "s", nombre: "Smarteam" }, tono: "Cercano.", clienteIdeal: [], buyerPersonas: [] };
    expect(textoParaLaPreventa({ ...base, perfil: PERFIL_VACIO })).toBeNull();
    expect(textoParaLaPreventa(null)).toBeNull();
    const t = textoParaLaPreventa({ ...base, perfil: { ...PERFIL_VACIO, propuestaDeValor: "Que HubSpot rinda.", servicios: [{ nombre: "SmartLoop", descripcion: null, tarifa: "US$ 1.800" }] } });
    expect(t).toBe("Propuesta de valor: Que HubSpot rinda.");
    expect(textoParaLaPreventa({ ...base, perfil: { ...PERFIL_VACIO, positionStatement: "a".repeat(2000) } })!.length).toBeLessThanOrEqual(900);
    const ctx = ctxConTest({ smarteam: t });
    expect(String(pedidoDeLaGuia(ctx).messages[0].content)).toContain("=== SMARTEAM (para la apertura y para «Contarle»");
  });
});
