/**
 * lib/exploraciones/agente-pedido.test.ts — lo que el agente propone y lo que se cae antes de llegar
 * al lienzo. Correr: `npx vitest run lib/exploraciones/agente-pedido.test.ts --project unit`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import {
  citaVerificable,
  herramienta,
  leerLaIndustria,
  leerLaRespuesta,
  leerLosCasos,
  lineaDeHoy,
  MAX_CASOS_POR_AREA,
  pedidoDeCasos,
  pedidoDeLaIndustria,
  MODELO_DE_LA_EXPLORACION,
  pedidoDeLaExploracion,
  propuestasDelTest,
  type ContextoDelPedido,
} from "./agente-pedido";
import { contenidoVacio, fusionarPropuestas, idDeCasoLibre, idDelItem, NIVELES, propuestaVacia, propuestaVigente, type EstadoDeExploracion } from "./contenido";
import type { DimensionDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";

// ── Una escala de juguete: dos áreas, cuatro dimensiones cada una ─────────────────

function dim(id: string, capa: ClaveDeCapa, criterios: string[] = [], aplica = true): DimensionDelLienzo {
  return {
    id,
    nombre: `Dimensión ${id}`,
    nombreGeneral: null,
    capa,
    pregunta: `¿Cómo va ${id}?`,
    descripcion: null,
    costoDeQuedarse: "Cuesta",
    aplica,
    niveles: NIVELES.map((l: Letra) => ({ letra: l, descripcion: `Nivel ${l} de ${id}`, resultado: null })),
    funcional: criterios.map((c) => ({ id: c, texto: `Criterio ${c}`, verificacion: "declarado" as const, habito: false })),
    riesgos: [],
  };
}

function area(id: string, nombre: string, dims: DimensionDelLienzo[]) {
  return {
    id,
    nombre,
    nombreGeneral: null,
    dimensiones: dims,
    paraChequeo: { id, nombre, dimensiones: dims.map((d) => ({ id: d.id, nombre: d.nombre, capa: d.capa, aplica: d.aplica })), orden: { base: null, produccion: null } },
  };
}

const ESCALA: EscalaDelLienzo = {
  version: "8.6.0",
  niveles: NIVELES.map((l) => ({ letra: l, nombre: `N${l}` })),
  capas: [
    { clave: "base", nombre: "Base" },
    { clave: "produccion", nombre: "Producción" },
  ],
  ediciones: [],
  edicion: null,
  perfil: { cierre: null, despues: null },
  areas: [
    area("1", "Ventas", [dim("1.1", "base", ["1.1.F1", "1.1.F2"]), dim("1.2", "base"), dim("1.5", "produccion"), dim("1.6", "produccion", [], false)]),
    area("3", "Servicio", [dim("3.1", "base"), dim("3.2", "base"), dim("3.5", "produccion"), dim("3.6", "produccion")]),
  ],
};

const REUNION = "Ana: hoy los vendedores anotan todo en Excel y nadie sabe en qué etapa va cada negocio. Queremos pasar de 20 a 35 cierres por mes antes de junio.";
const FUENTES = [
  { id: "E0", etiqueta: "La empresa en HubSpot", texto: "Acme Retail, 120 empleados, Costa Rica." },
  { id: "S1", etiqueta: "Reunión del 1 oct", texto: REUNION },
];

function ctx(over: Partial<ContextoDelPedido> = {}): ContextoDelPedido {
  return {
    modo: "leer",
    empresa: "Acme Retail",
    industria: "Retail",
    escala: ESCALA,
    areas: ["1"],
    perfil: null,
    contenido: contenidoVacio(),
    fuentes: FUENTES,
    ...over,
  };
}

/** Lo que devolvería Claude: un solo bloque con la herramienta. */
function respuesta(input: Record<string, unknown>): Anthropic.Messages.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: MODELO_DE_LA_EXPLORACION,
    content: [{ type: "tool_use", id: "tu_1", name: "proponer", input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Messages.Message;
}

const AHORA = new Date("2026-10-01T15:00:00.000Z");

describe("citaVerificable", () => {
  it("encuentra la frase aunque cambien mayúsculas, tildes, comillas y signos", () => {
    expect(citaVerificable("«Nadie sabe en que etapa va cada negocio»", REUNION)).toBe(true);
    expect(citaVerificable("pasar de 20 a 35 cierres por mes", REUNION)).toBe(true);
  });

  it("una frase que no está, o una tan corta que no prueba nada, no cuenta", () => {
    expect(citaVerificable("los vendedores usan Salesforce", REUNION)).toBe(false);
    expect(citaVerificable("Excel", REUNION)).toBe(false);
  });
});

describe("leerLaRespuesta", () => {
  it("un nivel entra solo con una frase que aparece literal en su fuente, y la frase queda como evidencia", () => {
    const r = leerLaRespuesta(
      respuesta({
        niveles: [
          { dimensionId: "1.1", nivel: "D", evidencia: "x", fuentes: [{ id: "S1", cita: "anotan todo en Excel y nadie sabe en qué etapa va cada negocio" }] },
          { dimensionId: "1.2", nivel: "F", evidencia: "x", fuentes: [{ id: "S1", cita: "tenemos un proceso documentado y medido" }] },
          { dimensionId: "1.5", nivel: "I", evidencia: "x", fuentes: [{ id: "S1" }] },
        ],
      }),
      ctx(),
      "run_1",
      AHORA,
    );
    expect(r.items.map((i) => i.destino)).toEqual([{ tipo: "nivel", dimensionId: "1.1" }]);
    expect(r.items[0].valor).toMatchObject({ nivel: "D", fuente: "reunion", evidencia: "anotan todo en Excel y nadie sabe en qué etapa va cada negocio" });
    expect(r.items[0].corridaId).toBe("run_1");
    expect(r.descartadas).toBe(2);
  });

  it("se cae lo que nombra una dimensión fuera de las áreas en juego, una que no aplica o una casilla que no existe", () => {
    const cita = [{ id: "S1", cita: "nadie sabe en qué etapa va cada negocio" }];
    const r = leerLaRespuesta(
      respuesta({
        niveles: [
          { dimensionId: "3.1", nivel: "D", fuentes: cita },
          { dimensionId: "1.6", nivel: "D", fuentes: cita },
          { dimensionId: "9.9", nivel: "D", fuentes: cita },
        ],
        textos: [{ casilla: "precio", texto: "Mucho", fuentes: cita }],
      }),
      ctx(),
      "run_1",
      AHORA,
    );
    expect(r.items).toEqual([]);
    expect(r.descartadas).toBe(4);
  });

  it("un texto sin fuente válida se cae; con fuente pero con una cita inventada entra sin la cita", () => {
    const r = leerLaRespuesta(
      respuesta({
        textos: [
          { casilla: "retos", texto: "No hay visibilidad del embudo", fuentes: [{ id: "Z9", cita: "algo" }] },
          { casilla: "consecuencias", texto: "Siguen perdiendo negocios sin saber por qué", fuentes: [{ id: "S1", cita: "perdemos la mitad de los negocios" }] },
        ],
      }),
      ctx(),
      "run_1",
      AHORA,
    );
    expect(r.descartadas).toBe(1);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].destino).toEqual({ tipo: "casilla", clave: "consecuencias" });
    expect(r.items[0].fuentes).toEqual([{ id: "S1", etiqueta: "Reunión del 1 oct" }]);
  });

  it("las metas, las personas y el siguiente paso pasan por la forma de su casilla", () => {
    const cita = [{ id: "S1", cita: "pasar de 20 a 35 cierres por mes antes de junio" }];
    const r = leerLaRespuesta(
      respuesta({
        metas: [
          { que: "Cierres por mes", actual: "20", objetivo: "35", para: "junio", fuentes: cita },
          { que: "   ", fuentes: cita },
        ],
        personas: [
          { nombre: "Ana", rol: "decide", fuentes: cita },
          { nombre: "Luis", rol: "jefe", fuentes: cita },
        ],
        siguientePaso: { que: "Segunda reunión con el portal abierto", fecha: "8 de octubre", fuentes: cita },
      }),
      ctx(),
      "run_1",
      AHORA,
    );
    const porClave = (k: string) => r.items.filter((i) => i.destino.tipo === "casilla" && i.destino.clave === k);
    expect(porClave("metas").map((i) => i.valor)).toEqual([{ que: "Cierres por mes", actual: "20", objetivo: "35", para: "junio" }]);
    expect(porClave("autoridad").map((i) => i.valor)).toEqual([{ nombre: "Ana", rol: "decide" }]);
    // La fecha que no es AAAA-MM-DD se quita: el paso queda, sin fecha (la lista para proponer lo nota).
    expect(porClave("siguientePaso").map((i) => i.valor)).toEqual([{ que: "Segunda reunión con el portal abierto" }]);
    expect(r.descartadas).toBe(2);
  });

  it("un área que ya está en juego o que no existe no se propone; una nueva sí, con su razón", () => {
    const cita = [{ id: "S1", cita: "nadie sabe en qué etapa va cada negocio" }];
    const r = leerLaRespuesta(
      respuesta({
        areas: [
          { areaId: "1", razon: "Ya está", fuentes: cita },
          { areaId: "7", razon: "No existe", fuentes: cita },
          { areaId: "3", razon: "Paga Service Hub y no lo usa", fuentes: cita },
        ],
      }),
      ctx(),
      "run_1",
      AHORA,
    );
    expect(r.items.map((i) => [i.destino, i.razon])).toEqual([[{ tipo: "area", areaId: "3" }, "Paga Service Hub y no lo usa"]]);
    expect(r.descartadas).toBe(2);
  });

  it("«lo que falta» solo para los criterios de las dimensiones elegidas, y con su frase", () => {
    const contenido = contenidoVacio();
    contenido.aExplorar = { "1.1": { motivo: "indicio" } };
    const cita = [{ id: "S1", cita: "anotan todo en Excel" }];
    const r = leerLaRespuesta(
      respuesta({
        falta: [
          { criterioId: "1.1.F1", estado: "no_tiene", fuentes: cita },
          { criterioId: "1.1.F2", estado: "no_tiene", fuentes: [{ id: "S1" }] },
          { criterioId: "3.1.F1", estado: "tiene", fuentes: cita },
        ],
      }),
      ctx({ contenido }),
      "run_1",
      AHORA,
    );
    expect(r.items.map((i) => [i.destino, i.valor])).toEqual([[{ tipo: "falta", criterioId: "1.1.F1" }, { estado: "no_tiene", cita: "anotan todo en Excel" }]]);
    expect(r.descartadas).toBe(2);
  });

  it("una casilla de un solo texto que llega partida se junta en una propuesta, con las fuentes de todas", () => {
    const r = leerLaRespuesta(
      respuesta({
        textos: [
          { casilla: "hubspotActual", texto: "Sales Hub Starter.", fuentes: [{ id: "E0" }] },
          { casilla: "hubspotActual", texto: "Los contactos están desactualizados.", fuentes: [{ id: "S1", cita: "nadie sabe en qué etapa va cada negocio" }] },
        ],
      }),
      ctx(),
      "run_1",
      AHORA,
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].valor).toBe("Sales Hub Starter. Los contactos están desactualizados.");
    expect(r.items[0].fuentes.map((f) => f.id)).toEqual(["E0", "S1"]);
  });

  it("«no se sabe» no se propone (es lo que ya muestra lo vacío), y no cuenta como caído", () => {
    const contenido = contenidoVacio();
    contenido.aExplorar = { "1.1": { motivo: "indicio" } };
    const cita = [{ id: "S1", cita: "anotan todo en Excel" }];
    const r = leerLaRespuesta(
      respuesta({ apertura: { valor: "no_se", fuentes: cita }, falta: [{ criterioId: "1.1.F1", estado: "no_se", fuentes: cita }] }),
      ctx({ contenido }),
      "run_1",
      AHORA,
    );
    expect(r).toEqual({ items: [], descartadas: 0 });
  });

  it("sin la herramienta en la respuesta no hay nada que proponer", () => {
    const r = leerLaRespuesta(
      { ...respuesta({}), content: [{ type: "text", text: "No encontré nada.", citations: null }] } as unknown as Anthropic.Messages.Message,
      ctx(),
      "run_1",
      AHORA,
    );
    expect(r).toEqual({ items: [], descartadas: 0 });
  });
});

describe("la herramienta y el pedido", () => {
  it("las listas cerradas solo nombran lo que existe: dimensiones de las áreas en juego que aplican, y las fuentes leídas", () => {
    const t = herramienta(ctx());
    const props = (t.input_schema as { properties: Record<string, { items: { properties: Record<string, { enum?: string[] }> } }> }).properties;
    expect(props.niveles.items.properties.dimensionId.enum).toEqual(["1.1", "1.2", "1.5"]);
    const fuentes = props.niveles.items.properties.fuentes as unknown as { items: { properties: { id: { enum: string[] } } } };
    expect(fuentes.items.properties.id.enum).toEqual(["E0", "S1"]);
    // «Lo que falta» solo aparece cuando hay dimensiones elegidas para explorar.
    expect(props.falta).toBeUndefined();
    // Al preparar no se propone un siguiente paso: todavía no se acordó nada.
    expect(props.siguientePaso).toBeDefined();
    const alPreparar = herramienta(ctx({ modo: "preparar" })).input_schema as { properties: Record<string, unknown> };
    expect(alPreparar.properties.siguientePaso).toBeUndefined();
  });

  it("el pedido usa el modelo de los lienzos, fuerza la herramienta y lleva cada fuente con su id", () => {
    const p = pedidoDeLaExploracion(ctx());
    expect(p.model).toBe(MODELO_DE_LA_EXPLORACION);
    expect(p.tool_choice).toEqual({ type: "tool", name: "proponer" });
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("=== FUENTE S1: Reunión del 1 oct ===");
    expect(cuerpo).toContain("### 1.1 Dimensión 1.1");
    // Solo las áreas en juego: Servicio no está.
    expect(cuerpo).not.toContain("### 3.1");
  });
});

describe("las hipótesis al preparar", () => {
  it("un nivel entra sin frase literal, como hipótesis con su porqué y sus fuentes; sin porqué o sin fuente, no", () => {
    const r = leerLaRespuesta(
      respuesta({
        niveles: [
          { dimensionId: "1.1", nivel: "I", porQue: "Las notas dicen que cada vendedor lleva su Excel.", fuentes: [{ id: "E0" }] },
          { dimensionId: "1.2", nivel: "F", fuentes: [{ id: "E0" }] },
          { dimensionId: "1.5", nivel: "D", porQue: "Sin fuente.", fuentes: [] },
        ],
      }),
      ctx({ modo: "preparar" }),
      "run_1",
      AHORA,
    );
    expect(r.items.map((i) => i.destino)).toEqual([{ tipo: "nivel", dimensionId: "1.1" }]);
    expect(r.items[0].valor).toEqual({ nivel: "I", fuente: "hipotesis", porQue: "Las notas dicen que cada vendedor lleva su Excel." });
    expect(r.descartadas).toBe(2);
  });

  it("la hipótesis y lo que dijo el cliente, en el mismo nivel, son cosas distintas: descartar una no tapa la otra", () => {
    const destino = { tipo: "nivel" as const, dimensionId: "1.1" };
    expect(idDelItem(destino, { nivel: "I", fuente: "hipotesis" })).not.toBe(idDelItem(destino, { nivel: "I", fuente: "reunion" }));
    // El test y la hipótesis del agente son la misma clase: se juntan.
    expect(idDelItem(destino, { nivel: "I", fuente: "test" })).toBe(idDelItem(destino, { nivel: "I", fuente: "hipotesis" }));
  });

  it("la herramienta pide el porqué de cada nivel, y al preparar no exige la frase", () => {
    const props = (herramienta(ctx({ modo: "preparar" })).input_schema as { properties: Record<string, { items: { required: string[] } }> }).properties;
    expect(props.niveles.items.required).toEqual(["dimensionId", "nivel", "porQue", "fuentes"]);
    const alLeer = (herramienta(ctx()).input_schema as { properties: Record<string, { items: { required: string[] } }> }).properties;
    expect(alLeer.niveles.items.required).toEqual(expect.arrayContaining(["evidencia", "porQue"]));
  });
});

describe("la industria que elige el agente", () => {
  const EDICIONES = [
    { slug: "banca", nombre: "Banca y servicios financieros", descripcion: "Para una financiera que coloca créditos.", perfilHabitual: { cierre: "mixta" as const, despues: "continua" as const } },
    { slug: "educacion", nombre: "Educación", descripcion: "Para admisiones.", perfilHabitual: null },
  ];
  const conIndustria = (input: Record<string, unknown>) =>
    ({ ...respuesta({}), content: [{ type: "tool_use", id: "tu", name: "elegir_industria", input }] }) as unknown as Anthropic.Messages.Message;

  it("una edición que existe, con su razón; la general con su perfil; lo demás no cuenta", () => {
    expect(leerLaIndustria(conIndustria({ edicion: "banca", razon: "Coloca créditos a pymes." }), { ediciones: EDICIONES })).toEqual({
      edicion: "banca",
      razon: "Coloca créditos a pymes.",
      perfil: null,
    });
    expect(leerLaIndustria(conIndustria({ edicion: "general", razon: "Vende software.", cierre: "con equipo", despues: "continua" }), { ediciones: EDICIONES })).toEqual({
      edicion: null,
      razon: "Vende software.",
      perfil: { cierre: "con equipo", despues: "continua" },
    });
    expect(leerLaIndustria(conIndustria({ edicion: "salud", razon: "x" }), { ediciones: EDICIONES })).toBeNull();
    expect(leerLaIndustria(conIndustria({ edicion: "banca" }), { ediciones: EDICIONES })).toBeNull();
  });

  it("el pedido lleva para quién es cada edición (de la escala) y fuerza su herramienta", () => {
    const p = pedidoDeLaIndustria({ empresa: "CreditForce", ediciones: EDICIONES, perfil: { cierre: null, despues: null }, fuentes: FUENTES });
    expect(p.tool_choice).toEqual({ type: "tool", name: "elegir_industria" });
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("- banca · Banca y servicios financieros: Para una financiera que coloca créditos.");
    expect(cuerpo).toContain("=== FUENTE E0: La empresa en HubSpot ===");
  });
});

describe("propuestasDelTest", () => {
  const TEST = {
    contacto: "Ana Pérez",
    resultado: {
      areaId: "3",
      fecha: "2026-09-28",
      url: "https://diagnostico.example/#x",
      respuestas: [
        { dimensionId: "3.1", nivel: "I" as Letra, respuesta: "Usamos un correo compartido", matiz: null },
        { dimensionId: "3.2", nivel: "F" as Letra, respuesta: null, matiz: null },
      ],
    },
  };
  const FUENTE_T1 = { id: "T1", etiqueta: "Test de Servicio de Ana Pérez", texto: "…" };

  it("propone el área del test si no está en juego, y un nivel por dimensión, marcado como del test", () => {
    const items = propuestasDelTest([TEST], { escala: ESCALA, areas: ["1"], fuentes: [FUENTE_T1], contenido: contenidoVacio() }, "run_1", AHORA);
    expect(items.map((i) => i.destino)).toEqual([
      { tipo: "area", areaId: "3" },
      { tipo: "nivel", dimensionId: "3.1" },
      { tipo: "nivel", dimensionId: "3.2" },
    ]);
    expect(items[1].valor).toMatchObject({ nivel: "I", fuente: "test", evidencia: "Usamos un correo compartido" });
    // Su porqué dice qué eligió y que es una pista: lo que el vendedor lee en el mapa.
    expect((items[1].valor as { porQue: string }).porQue).toMatch(/Usamos un correo compartido.*escala anterior/);
    expect(items[1].razon).toMatch(/escala anterior/);
  });

  it("no repite lo ya estimado ni propone sin su fuente", () => {
    const contenido = contenidoVacio();
    contenido.chequeo = { "3.1": { nivel: "D", fuente: "reunion" } } as typeof contenido.chequeo;
    const items = propuestasDelTest([TEST], { escala: ESCALA, areas: ["1", "3"], fuentes: [FUENTE_T1], contenido }, "run_1", AHORA);
    expect(items.map((i) => i.destino)).toEqual([{ tipo: "nivel", dimensionId: "3.2" }]);
    expect(propuestasDelTest([TEST], { escala: ESCALA, areas: ["1"], fuentes: [], contenido: contenidoVacio() }, "run_1", AHORA)).toEqual([]);
  });

  it("al volver a preparar, el nivel del test no pisa uno pendiente que salió de una reunión", () => {
    const deLaReunion = leerLaRespuesta(
      respuesta({ niveles: [{ dimensionId: "3.1", nivel: "D", fuentes: [{ id: "S1", cita: "anotan todo en Excel" }] }] }),
      ctx({ areas: ["1", "3"] }),
      "run_1",
      AHORA,
    ).items;
    const estado: EstadoDeExploracion = {
      contenido: contenidoVacio(),
      propuesta: propuestaVacia(),
      areas: ["1", "3"],
      edicion: null,
      perfilCierre: null,
      perfilDespues: null,
      responsableEmail: null,
      archivada: false,
    };
    estado.propuesta = fusionarPropuestas(estado, deLaReunion);
    const delTest = propuestasDelTest([TEST], { escala: ESCALA, areas: ["1", "3"], fuentes: [FUENTE_T1], contenido: estado.contenido }, "run_2", AHORA);
    estado.propuesta = fusionarPropuestas(estado, delTest);
    const niveles = propuestaVigente(estado).filter((i) => i.destino.tipo === "nivel");
    expect(niveles.map((i) => [i.destino, (i.valor as { nivel: string; fuente: string }).fuente])).toEqual([
      [{ tipo: "nivel", dimensionId: "3.1" }, "reunion"],
      [{ tipo: "nivel", dimensionId: "3.2" }, "test"],
    ]);
  });
});

describe("los casos de uso que propone (experimental, sin la biblioteca)", () => {
  const CTX = {
    empresa: "Acme",
    edicion: "escala general",
    areas: [{ id: "1", nombre: "Ventas", dimensiones: [{ id: "1.1", nombre: "Proceso" }, { id: "1.2", nombre: "Datos" }] }],
    exploracion: "(la exploración)",
    yaEstan: ["Pipeline con etapas"],
    descartados: ["Tablero de ventas"],
  };
  const conCasos = (casos: unknown[]) =>
    ({ ...respuesta({}), content: [{ type: "tool_use", id: "tu", name: "proponer_casos", input: { casos } }] }) as unknown as Anthropic.Messages.Message;
  const caso = (titulo: string, extra: Record<string, unknown> = {}) => ({ areaId: "1", titulo, descripcion: "Qué se implementa", razon: "Lo que resuelve", ...extra });

  it("en un área en juego, con título, descripción y razón; sin repetir lo que ya está ni lo descartado; con el tope por área", () => {
    const casos = [
      caso("Seguimiento de negocios", { dimensiones: ["1.1", "9.9"] }),
      caso("seguimiento de NEGOCIOS"),
      caso("Pipeline con etapas"),
      caso("Tablero de ventas"),
      caso("Otra área", { areaId: "3" }),
      { areaId: "1", titulo: "Sin descripción", razon: "x" },
      ...[1, 2, 3, 4].map((n) => caso(`Caso ${n}`)),
    ];
    const r = leerLosCasos(conCasos(casos), CTX, "run_1", AHORA);
    expect(r.items.map((i) => (i.valor as { titulo: string }).titulo)).toEqual(["Seguimiento de negocios", "Caso 1", "Caso 2", "Caso 3"]);
    expect(r.items).toHaveLength(MAX_CASOS_POR_AREA);
    // El id sale del título (no del catálogo): un caso descartado deja su lápida.
    expect(r.items[0].destino).toEqual({ tipo: "casoDeUso", useCaseId: idDeCasoLibre("Seguimiento de negocios") });
    expect(r.items[0].valor).toEqual({ titulo: "Seguimiento de negocios", areaId: "1", razon: "Lo que resuelve", descripcion: "Qué se implementa", dimensiones: ["1.1"] });
    expect(r.descartadas).toBe(6);
  });

  it("el pedido no usa catálogo, lleva lo que ya está y lo descartado, y fuerza su herramienta", () => {
    const p = pedidoDeCasos(CTX);
    expect(p.tool_choice).toEqual({ type: "tool", name: "proponer_casos" });
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("=== YA ESTÁN (no los repitas) ===\n- Pipeline con etapas");
    expect(cuerpo).toContain("- Tablero de ventas");
    expect(cuerpo).not.toMatch(/catálogo/i);
  });
});

describe("la fecha de hoy y la próxima reunión", () => {
  it("el pedido dice qué día es y cuál es la próxima reunión, para no tomar lo que ya pasó como agendado", () => {
    const cuerpo = String(
      pedidoDeLaExploracion(ctx({ modo: "preparar", hoy: AHORA.toISOString(), proxima: { titulo: "Comenzando el camino", inicio: "2026-10-02T14:00:00.000Z" } }))
        .messages[0].content,
    );
    expect(cuerpo.startsWith("Hoy es 1 oct 2026")).toBe(true);
    expect(cuerpo).toContain("Próxima reunión agendada (todavía no ocurre)");
    expect(cuerpo).toContain("«Comenzando el camino»");
  });

  it("sin próxima reunión lo dice; sin «hoy» no agrega nada", () => {
    expect(lineaDeHoy({ hoy: AHORA.toISOString(), proxima: null })).toContain("No hay otra reunión agendada");
    expect(lineaDeHoy({})).toBe("");
  });
});
