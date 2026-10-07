/**
 * lib/exploraciones/guia.test.ts — las sesiones, la guía de la próxima reunión y su pedido al agente.
 * Correr: `npx vitest run lib/exploraciones/guia.test.ts --project unit`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { OBJECIONES_COMUNES, PASOS_LAER, QUE_ES_CADA_PASO } from "./objeciones-comunes";
import { conEspaciosComunes, diaConAnio, diaCorto, diaYHora } from "./fechas";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { CLAVE_DE_INSTRUCCIONES } from "./notas-de-sesion";
import { contenidoVacio, idDelItem, NIVELES, propuestaVacia, type EstadoDeExploracion, type ItemPropuesto } from "./contenido";
import type { DimensionDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";
import { CambiosSchema, leerContenido, leerPropuesta } from "./esquemas";
import { CASILLAS_DEL_RESUMEN, CLASES_DE_OBJECION } from "./casillas";
import {
  enfoqueDeLaGuia,
  focoDeLaGuia,
  guiaDeAntesDeLaReunion,
  guiaVieja,
  huecosDelResumen,
  loQueTraes,
  nombreDeLaPestana,
  OBJECIONES_DE_BASE,
  ordenDeLaConversacion,
  paraDeUnAbierto,
  pestanasDeSesiones,
  preguntasParaMostrar,
  procedenciasDeLaSesion,
  separarPregunta,
  transcripcionCorta,
  PRIORIDAD_DE_LAS_TARJETAS,
  proximaReunion,
  reunionDeLaSesion,
  sesionHecha,
  estadoDeLaSesion,
  TIPOS_DE_OBJECION,
  type ReunionDeLaExploracion,
} from "./guia";
import { contextoDeLaGuia, herramientaDeLaGuia, leerLaGuiaDelAgente, pedidoDeLaGuia, voseoEnLaGuia, type ContextoDeLaGuia } from "./guia-pedido";
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

describe("una pestaña por sesión (Elías, 2026-10-03)", () => {
  const reuniones: ReunionDeLaExploracion[] = [
    { id: "m1", titulo: "Revisión del diagnóstico", fecha: "2026-09-28T15:00:00Z", origen: "meet", leida: true },
    { id: "m2", titulo: "Comenzando el camino", fecha: "2026-10-02T14:00:00Z", origen: "meet", leida: false },
    { id: "d1", titulo: "Resumen del Smartflow", fecha: "2026-09-20", origen: "documento", leida: true },
  ];

  it("la reunión de una sesión es la elegida a mano o la del mismo día", () => {
    expect(reunionDeLaSesion({ id: "s-a", fecha: "2026-10-02" }, reuniones)?.id).toBe("m2");
    expect(reunionDeLaSesion({ id: "s-a", fecha: "2026-10-02", reunion: { id: "m1", origen: "meet" } }, reuniones)?.id).toBe("m1");
    expect(reunionDeLaSesion({ id: "s-a", fecha: "2026-10-05" }, reuniones)).toBeNull();
    expect(reunionDeLaSesion({ id: "s-a" }, reuniones)).toBeNull();
  });

  it("las pestañas van por fecha; una reunión que no está en ninguna sesión es su propia pestaña", () => {
    const p = pestanasDeSesiones([{ id: "s-b", fecha: "2026-10-02" }, { id: "s-c", titulo: "Sin fecha" }], reuniones, "2026-10-03");
    // El documento de solo día es de ese día, no del anterior.
    expect(p[0].fecha).toBe("2026-09-20");
    expect(p.map((x) => [x.numero, x.clave, x.reunion?.id ?? null, x.hecha])).toEqual([
      [1, "r-documento-d1", "d1", true],
      [2, "r-meet-m1", "m1", true],
      [3, "s-b", "m2", true],
      [4, "s-c", null, false],
    ]);
  });

  it("lo que se llevó de la sesión anterior llega a la guía de la próxima, primero", () => {
    const c = contextoDeLaGuia({
      empresa: "Acme",
      industria: null,
      estado: estado({ contenido: { ...contenidoVacio(), sesiones: [{ id: "s-x", fecha: "2026-10-10", explorar: ["Dijo que el gerente no confía en el CRM"] }] } }),
      escala: ESCALA,
      posiciones: {},
      pendientes: [],
      agenda: [],
      conTest: false,
      hoy: "2026-10-03",
    });
    expect(c.paraExplorar).toEqual(["Dijo que el gerente no confía en el CRM"]);
    expect(String(pedidoDeLaGuia(c).messages[0].content)).toContain("LO QUE EL VENDEDOR SE LLEVÓ DE UNA SESIÓN ANTERIOR");
    expect(String(pedidoDeLaGuia(c).messages[0].content)).toContain("- A1: Dijo que el gerente no confía en el CRM");
  });

  it("la sesión guarda su reunión y lo que se lleva; la guía de cada sesión se lee de lo guardado", () => {
    const c = leerContenido({ sesiones: [{ id: "s-x", reunion: { id: "m1", origen: "meet" }, explorar: ["Algo"] }, { id: "s-y", reunion: { id: "m1", origen: "fax" } }] });
    expect(c.sesiones[0]).toEqual({ id: "s-x", reunion: { id: "m1", origen: "meet" }, explorar: ["Algo"] });
    expect(c.sesiones).toHaveLength(1);
    expect(leerPropuesta({ guias: { "s-x": { nada: true } } }).guias).toEqual({});
  });
});

describe("las fechas se escriben igual en el servidor y en el navegador", () => {
  it("sin los espacios especiales de cada motor (Node pone U+00A0 en «a. m.»): si no, la hidratación falla", () => {
    for (const t of [diaYHora("2026-10-02T06:26:00Z"), diaCorto("2026-10-02"), diaConAnio("2026-10-02"), conEspaciosComunes((12345).toLocaleString("es-CR"))]) {
      expect(t).not.toMatch(/[\u00a0\u202f\u2007\u2009]/);
    }
    expect(diaYHora("2026-10-02T06:26:00Z")).toContain("12:26");
  });
});

describe("el manual de objeciones (el botón «Cómo manejar objeciones»)", () => {
  it("trae las cuatro de la guía y otras, una por clase válida, cada una con sus cuatro pasos", () => {
    const clases = OBJECIONES_COMUNES.map((o) => o.clase);
    expect(new Set(clases).size).toBe(clases.length);
    for (const t of TIPOS_DE_OBJECION) expect(clases).toContain(t);
    for (const o of OBJECIONES_COMUNES) {
      expect(CLASES_DE_OBJECION).toContain(o.clase);
      expect(o.dice).toMatch(/^«.+»$/);
      for (const p of PASOS_LAER) expect(o[p.clave].length).toBeGreaterThan(10);
    }
    for (const p of PASOS_LAER) expect(QUE_ES_CADA_PASO[p.clave].que.length).toBeGreaterThan(20);
  });
});

describe("el contexto de la guía", () => {
  it("las objeciones que ya puso el cliente llegan a la guía, sin repetir, con su clase y si se respondió", () => {
    const destino = { tipo: "casilla" as const, clave: "objeciones" as const };
    const propuesta = { texto: "No es el momento", clase: "momento" as const };
    const pendiente: ItemPropuesto = { id: idDelItem(destino, propuesta), destino, valor: propuesta, fuentes: [], corridaId: null, en: "" };
    const c = contextoDeLaGuia({
      empresa: "Acme",
      industria: null,
      estado: estado({
        contenido: {
          ...contenidoVacio(),
          casillas: { objeciones: [{ texto: "Le parece caro", clase: "precio", respuesta: "Costo de no actuar" }, { texto: "No es el momento", clase: "momento" }] },
        },
      }),
      escala: ESCALA,
      posiciones: {},
      pendientes: [pendiente],
      agenda: [],
      conTest: false,
      hoy: "2026-10-01",
    });
    expect(c.objecionesDichas).toEqual(["Le parece caro (precio) — se respondió: Costo de no actuar", "No es el momento (momento) — sin responder"]);
    expect(String(pedidoDeLaGuia(c).messages[0].content)).toContain("LAS OBJECIONES QUE YA PUSO");
  });

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

describe("⭐ la guía lee las instrucciones adicionales (2026-10-06)", () => {
  it("van en el pedido de la guía solo si el vendedor las escribió", () => {
    const e = estado();
    e.contenido.notas[CLAVE_DE_INSTRUCCIONES] = "No hables de migraciones todavía.";
    const base = { empresa: "Acme", industria: null, escala: ESCALA, posiciones: {}, pendientes: [], agenda: [], conTest: false, hoy: "2026-10-01" };
    const con = contextoDeLaGuia({ ...base, estado: e });
    expect(String(pedidoDeLaGuia(con).messages[0].content)).toContain("No hables de migraciones todavía.");
    expect(String(pedidoDeLaGuia(contextoDeLaGuia({ ...base, estado: estado() })).messages[0].content)).not.toContain("INSTRUCCIONES ADICIONALES");
  });
});

describe("⭐ cada sesión dice si ya ocurrió (2026-10-06)", () => {
  it("ocurrió, próxima o todavía no ocurre", () => {
    expect(estadoDeLaSesion({ clave: "s-a", hecha: true }, "s-b")).toBe("ocurrio");
    expect(estadoDeLaSesion({ clave: "s-b", hecha: false }, "s-b")).toBe("proxima");
    expect(estadoDeLaSesion({ clave: "s-c", hecha: false }, "s-b")).toBe("despues");
    // Una que ya pasó nunca es «la próxima», aunque la clave coincida.
    expect(estadoDeLaSesion({ clave: "s-b", hecha: true }, "s-b")).toBe("ocurrio");
  });
});

describe("⭐ las sesiones se encadenan (rediseño del 2026-10-07)", () => {
  // CreditForce: la revisión del 28 sep, la del 2 oct que se cortó a los 6 minutos y la próxima.
  const reuniones: ReunionDeLaExploracion[] = [
    { id: "m1", titulo: "Revisión de Diagnóstico de Rendimiento", fecha: "2026-09-28T15:00:00Z", origen: "meet", leida: true },
    { id: "m2", titulo: "Comenzando el camino", fecha: "2026-10-02T14:00:00Z", origen: "meet", leida: true, corta: { minutos: 6 } },
  ];
  const ABIERTO = "Adriana dijo que el liderazgo revisa números en hojas manuales. Qué preguntar: ¿Quién consolida los números antes de cada revisión?";

  it("lo llevado dice de qué sesión viene; sin el dato, de la última que dejó qué leer (no de la que se cortó)", () => {
    const sesiones = [{ id: "s-prox", explorar: [ABIERTO] }];
    const p = pestanasDeSesiones(sesiones, reuniones, "2026-10-07");
    const prox = p.find((x) => x.clave === "s-prox")!;
    expect(procedenciasDeLaSesion(prox, p).abiertos.get(ABIERTO)).toBe(1);
    const conOrigen = pestanasDeSesiones([{ id: "s-prox", explorar: [ABIERTO], explorarDe: { [ABIERTO]: "s-dos" } }, { id: "s-dos", reunion: { id: "m2", origen: "meet" } }], reuniones, "2026-10-07");
    expect(procedenciasDeLaSesion(conOrigen.find((x) => x.clave === "s-prox")!, conOrigen).abiertos.get(ABIERTO)).toBe(2);
  });

  it("lo que tenía preparado una sesión cortada pasa a la próxima, con su número", () => {
    const sesiones = [
      { id: "s-dos", reunion: { id: "m2", origen: "meet" as const }, resultado: "cortada" as const, pasaron: ["metas", "tiempos"] },
      { id: "s-prox" },
    ];
    const p = pestanasDeSesiones(sesiones, reuniones, "2026-10-07");
    const prox = p.find((x) => x.clave === "s-prox")!;
    const proc = procedenciasDeLaSesion(prox, p);
    expect(proc.pasaron.get("metas")).toBe(2);
    const preguntas = preguntasParaMostrar(null, ["metas", "autoridad", "tiempos", "presupuesto"], ["1.3"], ESCALA, proc);
    expect(preguntas.find((x) => x.para === "metas")!.procedencia).toEqual({ tipo: "paso", numero: 2 });
    expect(preguntas.find((x) => x.para === "autoridad")!.procedencia).toBeUndefined();
  });

  it("una pregunta del agente que retoma lo llevado lo lleva adentro; lo que ninguna retoma va como su propia pregunta", () => {
    const abiertos = new Map([[ABIERTO, 1], ["Otro punto suelto", 1]]);
    const guia = { preguntas: [{ para: "1.3", pregunta: "¿Quién consolida los números?", repreguntas: [], abierto: ABIERTO }] };
    const p = preguntasParaMostrar(guia, ["metas"], ["1.3"], ESCALA, { abiertos, pasaron: new Map() });
    expect(p.find((x) => x.para === "1.3")!.procedencia).toEqual({ tipo: "abierto", numero: 1 });
    const suelta = p.find((x) => x.tipo === "abierto")!;
    expect(suelta).toMatchObject({ pregunta: "Otro punto suelto", para: paraDeUnAbierto("Otro punto suelto"), procedencia: { tipo: "abierto", numero: 1 } });
    expect(p.filter((x) => x.tipo === "abierto")).toHaveLength(1);
    expect(paraDeUnAbierto("Otro punto suelto")).toBe(paraDeUnAbierto("Otro punto suelto"));
  });

  it("en orden: primero lo que viene de antes, después la venta y la escala alternadas, el presupuesto al final", () => {
    const q = (para: string, tipo: "tarjeta" | "dimension", procedencia?: { tipo: "abierto" | "paso"; numero: number }) => ({ para, tipo, pregunta: para, repreguntas: [], ...(procedencia ? { procedencia } : {}) });
    const orden = ordenDeLaConversacion([
      q("metas", "tarjeta", { tipo: "paso", numero: 2 }),
      q("autoridad", "tarjeta", { tipo: "abierto", numero: 1 }),
      q("tiempos", "tarjeta"),
      q("presupuesto", "tarjeta", { tipo: "paso", numero: 2 }),
      q("1.3", "dimension", { tipo: "abierto", numero: 1 }),
      q("1.4", "dimension"),
      q("2.1", "dimension"),
    ]).map((x) => x.para);
    expect(orden).toEqual(["metas", "1.3", "autoridad", "tiempos", "1.4", "2.1", "presupuesto"]);
  });

  it("lo que traes: lo llevado, la sesión cortada y la alerta técnica, cada uno con qué cambia hoy", () => {
    const sesiones = [
      { id: "s-dos", reunion: { id: "m2", origen: "meet" as const }, resultado: "cortada" as const, pasaron: ["metas", "tiempos"] },
      { id: "s-prox", explorar: [ABIERTO] },
    ];
    const p = pestanasDeSesiones(sesiones, reuniones, "2026-10-07");
    const filas = loQueTraes(p.find((x) => x.clave === "s-prox")!, p, {
      nombreDe: (para) => ({ metas: "Metas", tiempos: "Tiempos" })[para] ?? para,
      tecnica: { reunion: "Reunión del 28 sep 2026: Revisión de Diagnóstico de Rendimiento", temas: ["Integración"] },
    });
    expect(filas.map((f) => [f.numero, f.estado])).toEqual([
      [1, "ya ocurrió"],
      [2, "se cortó"],
    ]);
    expect(filas[0].lineas.map((l) => l.consecuencia)).toEqual(["va primero en la guía.", "«Con quién» pide sumar a alguien técnico."]);
    expect(filas[0].lineas[0].texto).toBe("Te llevaste 1 pregunta: quién consolida los números antes de cada revisión.");
    expect(filas[1].lineas[0].texto).toBe("Se cortó y no dejó qué leer. Lo que tenía preparado, metas y tiempos, quedó sin preguntar.");
  });

  it("la que no se hizo no lleva número: las demás se cuentan sin ella", () => {
    const p = pestanasDeSesiones([{ id: "s-dos", reunion: { id: "m2", origen: "meet" }, resultado: "noSeHizo" }, { id: "s-prox" }], reuniones, "2026-10-07");
    expect(p.map((x) => [x.clave, x.numero, nombreDeLaPestana(x)])).toEqual([
      ["r-meet-m1", 1, "Sesión 1"],
      ["s-dos", 0, "No se hizo"],
      ["s-prox", 2, "Sesión 2"],
    ]);
  });

  it("una transcripción sin conversación es corta, con dónde termina; una con conversación no", () => {
    const corta = `Credit force: Comenzando el camino - Transcripción
00:00:04

Smarteam's Notetaker: Esta reunión está siendo grabada.
Andrés Pinzón: Sí. Ok.


La transcripción finalizó después de 00:06:26`;
    expect(transcripcionCorta(corta)).toEqual({ minutos: 6 });
    expect(transcripcionCorta("Ana: " + "hablamos del pipeline y de los datos. ".repeat(20))).toBeNull();
    expect(transcripcionCorta("x".repeat(5000))).toBeNull();
  });

  it("la sesión guarda su objetivo, qué pasó, lo que pasó a la próxima, lo hecho y de dónde viene lo llevado", () => {
    const s = { id: "s-x", objetivo: "Saber quién decide", resultado: "cortada", pasaron: ["metas"], hechas: ["1.3"], explorar: ["Algo"], explorarDe: { Algo: "s-y" } };
    expect(leerContenido({ sesiones: [s] }).sesiones).toEqual([s]);
    expect(leerContenido({ sesiones: [{ ...s, resultado: "otra cosa" }] }).sesiones).toEqual([]);
    expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "nota", paso: "sesion:s-mgw2b8x0abcd:consecuencias", texto: "Pierden 3 de cada 10" }] }).success).toBe(true);
  });

  it("separa lo que se dijo de la pregunta para cerrarlo", () => {
    expect(separarPregunta(ABIERTO)).toEqual({ dicho: "Adriana dijo que el liderazgo revisa números en hojas manuales.", pregunta: "¿Quién consolida los números antes de cada revisión?" });
    expect(separarPregunta("Solo lo dicho")).toEqual({ dicho: "Solo lo dicho", pregunta: null });
  });
});

describe("⭐ la guía sugiere el objetivo y retoma lo llevado (2026-10-07)", () => {
  it("el objetivo se lee y lo llevado se nombra A1, A2…: la pregunta que lo retoma lo guarda", () => {
    const c = ctx({ paraExplorar: ["Dijo que el gerente no confía en el CRM"] });
    const tool = herramientaDeLaGuia(c);
    expect(JSON.stringify(tool.input_schema)).toContain('"abierto":{"type":"string","enum":["A1"]');
    const g = leerLaGuiaDelAgente(
      respuesta({
        objetivo: "Llevar el diagnóstico a números y saber quién decide.",
        apertura: ["Hola"],
        preguntas: [{ para: "metas", pregunta: "¿Qué quieren lograr?", repreguntas: [], abierto: "A1" }],
        objeciones: [],
      }),
      c,
      null,
    );
    expect(g!.objetivo).toBe("Llevar el diagnóstico a números y saber quién decide.");
    expect(g!.preguntas[0].abierto).toBe("Dijo que el gerente no confía en el CRM");
    expect(leerPropuesta({ ...propuestaVacia(), guia: g }).guia).toEqual(g);
  });

  it("encuentra el voseo de una guía real (CreditForce, 1 oct) y deja pasar el tuteo y el futuro", () => {
    const g = leerLaGuiaDelAgente(
      respuesta({
        apertura: ["Quiero entender qué tan cerca estuvo el diagnóstico de lo que vos vivís en el día a día."],
        preguntas: [{ para: "metas", pregunta: "¿Confías en los números que llegás a presentar?", repreguntas: ["¿Qué podrás mostrar?"] }],
        objeciones: [],
      }),
      ctx(),
      null,
    );
    expect(voseoEnLaGuia(g!).sort()).toEqual(["llegás", "vivís", "vos"]);
    const enTuteo = leerLaGuiaDelAgente(respuesta({ apertura: ["Cuéntame qué vives en el día a día."], preguntas: [], objeciones: [] }), ctx(), null);
    expect(voseoEnLaGuia(enTuteo!)).toEqual([]);
  });
});

describe("⭐ la reunión se compara solo con la guía que había ANTES (2026-10-07)", () => {
  const guia = (en: string) => ({ en, corridaId: null, huecos: [], enfoque: [], apertura: [], escalaEnSimple: null, preguntas: [], objeciones: [], pocaApertura: null, cierre: null });
  const REUNION = "2026-10-02T20:00:00.000Z";

  it("la guardada para su sesión, o la viva, si se armaron antes de la reunión", () => {
    expect(guiaDeAntesDeLaReunion({ guia: guia("2026-10-05T00:00:00.000Z"), guias: { s1: guia("2026-10-01T13:00:00.000Z") } }, "s1", REUNION)?.en).toBe("2026-10-01T13:00:00.000Z");
    expect(guiaDeAntesDeLaReunion({ guia: guia("2026-10-01T13:00:00.000Z"), guias: {} }, null, REUNION)?.en).toBe("2026-10-01T13:00:00.000Z");
    expect(guiaDeAntesDeLaReunion({ guia: guia("2026-10-01T13:00:00.000Z"), guias: {} }, "s-sin-guia", REUNION)?.en).toBe("2026-10-01T13:00:00.000Z");
  });

  it("una armada después no planeó nada: sin guía (CreditForce, 28 sep, leída contra una guía del 1 oct)", () => {
    expect(guiaDeAntesDeLaReunion({ guia: guia("2026-10-01T13:00:00.000Z"), guias: {} }, null, "2026-09-28T20:45:00.000Z")).toBeNull();
    expect(guiaDeAntesDeLaReunion({ guia: guia("2026-10-05T00:00:00.000Z"), guias: { s1: guia("2026-10-03T00:00:00.000Z") } }, "s1", REUNION)).toBeNull();
    expect(guiaDeAntesDeLaReunion({ guia: null, guias: {} }, null, REUNION)).toBeNull();
  });
});
