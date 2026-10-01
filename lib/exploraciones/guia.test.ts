/**
 * lib/exploraciones/guia.test.ts — las sesiones, la guía de la próxima reunión y su pedido al agente.
 * Correr: `npx vitest run lib/exploraciones/guia.test.ts --project unit`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { contenidoVacio, idDelItem, NIVELES, propuestaVacia, type EstadoDeExploracion, type ItemPropuesto } from "./contenido";
import type { DimensionDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";
import { CambiosSchema, leerContenido, leerPropuesta } from "./esquemas";
import { CASILLAS_DEL_RESUMEN } from "./casillas";
import {
  enfoqueDeLaGuia,
  focoDeLaGuia,
  guiaVieja,
  huecosDelResumen,
  OBJECIONES_DE_BASE,
  preguntasParaMostrar,
  PRIORIDAD_DE_LAS_TARJETAS,
  proximaReunion,
  sesionHecha,
  TIPOS_DE_OBJECION,
} from "./guia";
import { contextoDeLaGuia, herramientaDeLaGuia, leerLaGuiaDelAgente, pedidoDeLaGuia, type ContextoDeLaGuia } from "./guia-pedido";
import type { PosicionEnElMapa } from "./mapa";

function dim(id: string, capa: ClaveDeCapa, aplica = true): DimensionDelLienzo {
  return {
    id,
    nombre: `Dimensión ${id}`,
    nombreGeneral: null,
    capa,
    pregunta: `¿Cómo va ${id}?`,
    descripcion: null,
    costoDeQuedarse: `Cuesta ${id}`,
    aplica,
    niveles: NIVELES.map((l: Letra) => ({ letra: l, descripcion: `Nivel ${l} de ${id}`, resultado: null })),
    funcional: [],
    riesgos: [],
  };
}

const DIMS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => dim(`1.${n}`, n <= 4 ? "base" : "produccion", n !== 6));
const ESCALA: EscalaDelLienzo = {
  version: "8.6.0",
  niveles: NIVELES.map((l) => ({ letra: l, nombre: `N${l}` })),
  capas: [
    { clave: "base", nombre: "Base operativa" },
    { clave: "produccion", nombre: "Producción" },
  ],
  ediciones: [],
  edicion: null,
  perfil: { cierre: null, despues: null },
  areas: [
    {
      id: "1",
      nombre: "Ventas",
      nombreGeneral: null,
      dimensiones: DIMS,
      paraChequeo: { id: "1", nombre: "Ventas", dimensiones: DIMS.map((d) => ({ id: d.id, nombre: d.nombre, capa: d.capa, aplica: d.aplica })), orden: { base: null, produccion: null } },
    },
  ],
};

function estado(parcial: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  return {
    contenido: contenidoVacio(),
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
    ...parcial,
  };
}

const pos = (nivel: Letra, clase: "evidencia" | "hipotesis"): PosicionEnElMapa => ({
  nivel,
  clase,
  origen: "confirmado",
  fuente: clase === "evidencia" ? "reunion" : "hipotesis",
  porQue: `Porque ${nivel}`,
  citas: [],
  riesgo: false,
  noSabe: false,
  pendiente: null,
  porRevisar: false,
});

describe("las sesiones", () => {
  const HOY = "2026-10-01";

  it("una sesión con fecha pasada cuenta como hecha, aunque nadie la marque", () => {
    expect(sesionHecha({ id: "s-a", fecha: "2026-09-28" }, HOY)).toBe(true);
    expect(sesionHecha({ id: "s-a", fecha: "2026-10-01" }, HOY)).toBe(false);
    expect(sesionHecha({ id: "s-a", hecha: true }, HOY)).toBe(true);
  });

  it("la próxima es la primera que no pasó, las con fecha primero; el número cuenta las hechas", () => {
    const p = proximaReunion(
      [
        { id: "s-a", fecha: "2026-09-28" },
        { id: "s-b" },
        { id: "s-c", fecha: "2026-10-09", titulo: "Portal" },
        { id: "s-d", fecha: "2026-10-02", titulo: "Comenzando el camino" },
      ],
      [],
      HOY,
    );
    expect(p).toMatchObject({ numero: 2, sesionId: "s-d", titulo: "Comenzando el camino", desde: "sesion" });
  });

  it("sin sesiones planeadas, la próxima es la agendada en HubSpot", () => {
    expect(proximaReunion([], [{ titulo: "Revisión", inicio: "2026-10-02T14:00:00.000Z" }], HOY)).toMatchObject({ numero: 1, desde: "hubspot", titulo: "Revisión" });
    expect(proximaReunion([], [], HOY)).toMatchObject({ numero: 1, desde: null });
    // Ya se leyeron dos reuniones aunque nadie las planeó en el lienzo: la próxima es la tercera.
    expect(proximaReunion([], [], HOY, 2)).toMatchObject({ numero: 3 });
  });

  it("se guardan por una operación validada, y se leen dejando afuera lo que no tiene la forma", () => {
    expect(CambiosSchema.safeParse({ version: 0, operaciones: [{ op: "sesiones", sesiones: [{ id: "s-abc", fecha: "2026-10-02" }] }] }).success).toBe(true);
    expect(CambiosSchema.safeParse({ version: 0, operaciones: [{ op: "sesiones", sesiones: [{ id: "otra-cosa" }] }] }).success).toBe(false);
    const c = leerContenido({ sesiones: [{ id: "s-ok", titulo: "Uno" }, { id: "mal" }, { id: "s-x", fecha: "2 de octubre" }] });
    expect(c.sesiones).toEqual([{ id: "s-ok", titulo: "Uno" }]);
  });
});

describe("qué cubre la guía", () => {
  it("las tarjetas vacías del resumen, en el orden del marco", () => {
    expect(huecosDelResumen({})).toEqual([...PRIORIDAD_DE_LAS_TARJETAS]);
    expect([...huecosDelResumen({})].sort()).toEqual([...CASILLAS_DEL_RESUMEN].sort());
    expect(huecosDelResumen({ metas: [{ que: "x" }], presupuesto: "", planes: [] })).toEqual(PRIORIDAD_DE_LAS_TARJETAS.filter((c) => c !== "metas"));
    // El presupuesto se pregunta al final: hablar de plata antes de la meta es vender antes de diagnosticar.
    expect(PRIORIDAD_DE_LAS_TARJETAS.at(-1)).toBe("presupuesto");
  });

  it("una reunión tiene hasta 8 preguntas: hasta 5 tarjetas y, con lo que queda, hasta 4 dimensiones", () => {
    const todo = focoDeLaGuia({}, ESCALA, ["1"], {}, {});
    expect(todo.huecos).toEqual(PRIORIDAD_DE_LAS_TARJETAS.slice(0, 5));
    expect(todo.enfoque).toHaveLength(3);
    const casiLleno = focoDeLaGuia({ metas: [{ que: "x" }], retos: [{ texto: "y" }], consecuencias: ["z"], autoridad: [{ nombre: "A", rol: "firma" }], tiempos: ["t"], implicaciones: ["i"] }, ESCALA, ["1"], {}, {});
    expect(casiLleno.huecos).toEqual(["planes", "presupuesto"]);
    expect(casiLleno.enfoque).toHaveLength(4);
  });

  it("hasta 4 dimensiones sin evidencia: primero las marcadas, después las más bajas y la base antes que la producción", () => {
    const posiciones = {
      "1.1": pos("F", "evidencia"),
      "1.2": pos("I", "hipotesis"),
      "1.3": pos("D", "hipotesis"),
      "1.5": pos("D", "hipotesis"),
      "1.7": pos("E", "hipotesis"),
    };
    // 1.1 tiene evidencia y 1.6 no aplica: no entran. Sin dato (1.4, 1.8) cuenta como lo más bajo.
    expect(enfoqueDeLaGuia(ESCALA, ["1"], posiciones, {})).toEqual(["1.4", "1.8", "1.3", "1.5"]);
    expect(enfoqueDeLaGuia(ESCALA, ["1"], posiciones, { "1.7": { motivo: "meta" } })).toEqual(["1.7", "1.4", "1.8", "1.3"]);
    expect(enfoqueDeLaGuia(ESCALA, [], posiciones, {})).toEqual([]);
  });

  it("la guía queda vieja si cambiaron las tarjetas vacías o las dimensiones en foco", () => {
    expect(guiaVieja({ huecos: ["metas", "planes"], enfoque: ["1.2"] }, ["planes", "metas"], ["1.2"])).toBe(false);
    expect(guiaVieja({ huecos: ["metas", "planes"], enfoque: ["1.2"] }, ["planes"], ["1.2"])).toBe(true);
  });

  it("muestra la pregunta del agente donde la hay y la de base donde no; lo que ya se llenó se cae solo", () => {
    const guia = { preguntas: [{ para: "metas", pregunta: "¿Cuántas solicitudes quieren aprobar?", repreguntas: ["a", "b", "c"] }, { para: "planes", pregunta: "vieja", repreguntas: [] }] };
    const p = preguntasParaMostrar(guia, ["metas", "tiempos"], ["1.3"], ESCALA);
    expect(p.map((x) => [x.para, x.pregunta, x.repreguntas.length])).toEqual([
      ["metas", "¿Cuántas solicitudes quieren aprobar?", 3],
      ["tiempos", expect.stringContaining("¿Para cuándo"), 0],
      ["1.3", "¿Cómo va 1.3?", 0],
    ]);
  });

  it("hay una objeción de base por cada tipo, con los cuatro pasos de LAER", () => {
    expect(OBJECIONES_DE_BASE.map((o) => o.tipo)).toEqual([...TIPOS_DE_OBJECION]);
    for (const o of OBJECIONES_DE_BASE) for (const k of ["escuchar", "reconocer", "explorar", "responder"] as const) expect(o[k].length).toBeGreaterThan(10);
  });
});

function ctx(over: Partial<ContextoDeLaGuia> = {}): ContextoDeLaGuia {
  const c = contextoDeLaGuia({
    empresa: "Acme Crédito",
    industria: "Financial services",
    estado: estado(),
    escala: ESCALA,
    posiciones: { "1.2": pos("I", "hipotesis") },
    pendientes: [],
    agenda: [{ titulo: "Comenzando el camino", inicio: "2026-10-02T14:00:00.000Z" }],
    conTest: false,
    hoy: "2026-10-01",
  });
  return { ...c, ...over };
}

function respuesta(input: Record<string, unknown>): Anthropic.Messages.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [{ type: "tool_use", id: "tu_1", name: "armar_guia", input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Messages.Message;
}

describe("el contexto de la guía", () => {
  it("sin test y sin nada dicho por el cliente arranca desde cero, y la próxima es la de HubSpot", () => {
    const c = ctx();
    expect(c.desdeCero).toBe(true);
    expect(c.proxima).toMatchObject({ numero: 1, titulo: "Comenzando el camino" });
    expect(c.huecos.map((h) => h.clave)).toEqual(PRIORIDAD_DE_LAS_TARJETAS.slice(0, 5));
    expect(c.enfoque).toHaveLength(3);
    expect(String(pedidoDeLaGuia(c).system)).toMatch(/Nunca inventes casos de otros clientes/);
  });

  it("con el test, o con algo dicho, ya no es desde cero; «para conectar» sale de lo propuesto si no hay nada confirmado", () => {
    const conTest = contextoDeLaGuia({ empresa: "Acme", industria: null, estado: estado(), escala: ESCALA, posiciones: {}, pendientes: [], agenda: [], conTest: true, hoy: "2026-10-01" });
    expect(conTest.desdeCero).toBe(false);
    const destino = { tipo: "casilla" as const, clave: "contexto" as const };
    const pendiente: ItemPropuesto = { id: idDelItem(destino, "Financiera de pymes"), destino, valor: "Financiera de pymes", fuentes: [], corridaId: null, en: "" };
    const c = contextoDeLaGuia({
      empresa: "Acme",
      industria: null,
      estado: estado({ contenido: { ...contenidoVacio(), casillas: { metas: [{ que: "Más aprobadas", objetivo: "100" }] } } }),
      escala: ESCALA,
      posiciones: {},
      pendientes: [pendiente],
      agenda: [],
      conTest: false,
      hoy: "2026-10-01",
    });
    expect(c.desdeCero).toBe(false);
    expect(c.paraConectar).toBe("Financiera de pymes");
    expect(c.confirmado).toEqual(["Metas: Más aprobadas"]);
    expect(c.huecos.map((h) => h.clave)).not.toContain("metas");
  });

  it("el pedido dice qué día es, pide tuteo y solo ofrece la escala en simple cuando arranca desde cero", () => {
    const p = pedidoDeLaGuia(ctx());
    expect(String(p.messages[0].content)).toContain("Hoy es 1 oct 2026");
    expect(String(p.system)).toMatch(/TÚ \(tuteo\)/);
    const props = (herramientaDeLaGuia(ctx()).input_schema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("escalaEnSimple");
    const propsConTest = (herramientaDeLaGuia(ctx({ desdeCero: false })).input_schema as { properties: Record<string, unknown> }).properties;
    expect(propsConTest).not.toHaveProperty("escalaEnSimple");
  });
});

describe("leer la guía del agente", () => {
  const base = ctx();
  const objecion = (tipo: string) => ({ tipo, escuchar: "Escucha.", reconocer: "Tiene sentido.", explorar: "¿Comparado con qué?", responder: "Vuelve a su meta." });

  it("se queda solo con lo que apunta a algo que falta, una pregunta por cosa y tres repreguntas como mucho", () => {
    const g = leerLaGuiaDelAgente(
      respuesta({
        apertura: ["Vi que colocan créditos a pymes en tres países."],
        escalaEnSimple: "Mide cómo trabaja tu equipo, en cinco niveles.",
        preguntas: [
          { para: "metas", pregunta: "¿Cuántas solicitudes quieren aprobar al mes?", repreguntas: ["¿La última?", "¿Por qué?", "¿Cuánto cuesta?", "una de más"] },
          { para: "metas", pregunta: "repetida", repreguntas: [] },
          { para: "9.9", pregunta: "de otra escala", repreguntas: [] },
          { para: "1.2", pregunta: "   ", repreguntas: [] },
        ],
        objeciones: [objecion("precio"), objecion("precio"), objecion("inventada"), { tipo: "momento", escuchar: "" }],
        pocaApertura: "Si solo pide precio, ofrécele un caso concreto.",
        cierre: "Agenda la próxima con quien decide.",
      }),
      base,
      "run-1",
      new Date("2026-10-01T16:00:00.000Z"),
    );
    expect(g).not.toBeNull();
    expect(g!.preguntas).toEqual([{ para: "metas", pregunta: "¿Cuántas solicitudes quieren aprobar al mes?", repreguntas: ["¿La última?", "¿Por qué?", "¿Cuánto cuesta?"] }]);
    expect(g!.objeciones.map((o) => o.tipo)).toEqual(["precio"]);
    expect(g!.escalaEnSimple).toBe("Mide cómo trabaja tu equipo, en cinco niveles.");
    expect(g!.huecos).toEqual(PRIORIDAD_DE_LAS_TARJETAS.slice(0, 5));
    expect(g!.corridaId).toBe("run-1");
    // Se guarda y se vuelve a leer igual.
    expect(leerPropuesta({ ...propuestaVacia(), guia: g }).guia).toEqual(g);
  });

  it("la escala en simple solo se guarda cuando la reunión arranca desde cero", () => {
    const g = leerLaGuiaDelAgente(respuesta({ apertura: ["Hola"], escalaEnSimple: "x", preguntas: [], objeciones: [], pocaApertura: "", cierre: "" }), ctx({ desdeCero: false }), null);
    expect(g?.escalaEnSimple).toBeNull();
  });

  it("si no vino nada que sirva, no hay guía (se ve la de base)", () => {
    expect(leerLaGuiaDelAgente(respuesta({ apertura: [], preguntas: [], objeciones: [] }), base, null)).toBeNull();
  });
});
