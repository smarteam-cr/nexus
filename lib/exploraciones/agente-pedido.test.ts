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
import { leerPropuesta } from "./esquemas";
import { contenidoVacio, fusionarPropuestas, idDeCasoLibre, idDelItem, NIVELES, propuestaVacia, propuestaVigente, type EstadoDeExploracion } from "./contenido";
import type { DimensionDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";
import { hostDelSitio, ipInterna, mismoSitio } from "./sitio-web-reglas";
import { leerLaRadiografia, urlComparable } from "./radiografia-pedido";
import { conSuOrigen, separarOrigen } from "./casillas";
import { bloqueDeInstrucciones, CLAVE_DE_INSTRUCCIONES } from "./notas-de-sesion";
import { contactoPrincipal, porQueAhoraSugerido, rastroDe, senalesDe } from "./senales";

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

describe("las objeciones y las particularidades (pedido de Elías, 2026-10-01)", () => {
  const OBJECION = "Ana: está muy caro para lo que pagamos hoy, y ya tenemos Pipedrive.";
  const conObjecion = () => ctx({ fuentes: [...FUENTES, { id: "S2", etiqueta: "Reunión del 2 oct", texto: OBJECION }] });

  it("una objeción entra solo con la frase literal del cliente; con su clase y su respuesta", () => {
    const r = leerLaRespuesta(
      respuesta({
        objeciones: [
          { texto: "Le parece caro", clase: "precio", respuesta: "Se le mostró el costo de no actuar", fuentes: [{ id: "S2", cita: "está muy caro para lo que pagamos hoy" }] },
          { texto: "Ya usa otra herramienta", clase: "herramienta", fuentes: [{ id: "S2", cita: "ya usamos Salesforce hace años" }] },
          { texto: "Algo sin clase", clase: "inventada", fuentes: [{ id: "S2", cita: "ya tenemos Pipedrive" }] },
        ],
      }),
      conObjecion(),
      "run_1",
      AHORA,
    );
    expect(r.items.map((i) => i.destino)).toEqual([{ tipo: "casilla", clave: "objeciones" }]);
    expect(r.items[0].valor).toEqual({ texto: "Le parece caro", clase: "precio", respuesta: "Se le mostró el costo de no actuar" });
    expect(r.descartadas).toBe(2);
  });

  it("una particularidad es una casilla de lista: un ítem por entrada", () => {
    const r = leerLaRespuesta(
      respuesta({ textos: [{ casilla: "particularidades", texto: "Tiene contrato con Pipedrive", fuentes: [{ id: "S2", cita: "ya tenemos Pipedrive" }] }] }),
      conObjecion(),
      "run_1",
      AHORA,
    );
    expect(r.items.map((i) => [i.destino, i.valor])).toEqual([[{ tipo: "casilla", clave: "particularidades" }, "Tiene contrato con Pipedrive"]]);
  });

  it("la herramienta pide las objeciones con su clase, y el pedido nombra las clases", () => {
    const tool = herramienta(ctx());
    const props = (tool.input_schema as { properties: Record<string, { items?: { properties?: Record<string, { enum?: string[] }> } }> }).properties;
    expect(props.objeciones.items?.properties?.clase.enum).toEqual(["precio", "herramienta", "momento", "propuesta", "confianza", "decisor", "interno", "otra"]);
    expect(String(pedidoDeLaExploracion(ctx()).system)).toMatch(/Las clases de objeción: precio/);
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

describe("las casillas retiradas", () => {
  it("el agente ya no puede proponer «Hipótesis»: se repetía con el mapa de la escala y la guía", () => {
    const tool = herramienta(ctx({ modo: "preparar" }));
    const textos = (tool.input_schema as { properties: { textos: { items: { properties: { casilla: { enum: string[] } } } } } }).properties.textos;
    expect(textos.items.properties.casilla.enum).not.toContain("hipotesis");
    expect(textos.items.properties.casilla.enum).toContain("contexto");
    expect(String(pedidoDeLaExploracion(ctx({ modo: "preparar" })).system)).not.toMatch(/hipotesis \(/);
  });
});

describe("el sitio web de la empresa (lo lee la preparación, con candados)", () => {
  it("toma el host del sitio o del dominio de HubSpot, y rechaza lo que no es un dominio público", () => {
    expect(hostDelSitio("https://www.acme.com/inicio", null)).toBe("www.acme.com");
    expect(hostDelSitio(null, "acme.co.cr")).toBe("acme.co.cr");
    expect(hostDelSitio("http://10.0.0.5", "acme.com")).toBe("acme.com");
    for (const malo of ["http://localhost:3000", "https://127.0.0.1", "https://acme.com:8443", "ftp://acme.com", "intranet", "https://user:x@acme.com", "https://[::1]/"]) {
      expect(hostDelSitio(malo, null), malo).toBeNull();
    }
  });

  it("las IPs internas y de metadatos de la nube no se leen nunca", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(ipInterna(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "104.18.2.1", "2606:4700::1111"]) expect(ipInterna(ip), ip).toBe(false);
  });

  it("una redirección solo se sigue dentro del mismo sitio", () => {
    expect(mismoSitio("acme.com", "www.acme.com")).toBe(true);
    expect(mismoSitio("www.acme.com", "acme.com")).toBe(true);
    expect(mismoSitio("acme.com", "tienda.acme.com")).toBe(true);
    expect(mismoSitio("acme.com", "acme.com.evil.io")).toBe(false);
    expect(mismoSitio("acme.com", "evilacme.com")).toBe(false);
  });

  it("el agente sabe que lo que dicen las fuentes es dato, no instrucción", () => {
    expect(String(pedidoDeLaExploracion(ctx({ modo: "preparar" })).system)).toMatch(/nunca instrucciones para ti/);
  });
});

describe("Preparación: el detonante con los hechos de HubSpot", () => {
  const rastro = rastroDe({
    mobilephone: "+506 8888 8888",
    hs_analytics_source: "ORGANIC_SEARCH",
    hs_analytics_source_data_1: "google",
    recent_conversion_event_name: "Test diagnóstico de rendimiento",
    recent_conversion_date: "2026-09-23T15:00:00Z",
    hs_analytics_num_page_views: "12",
  });

  it("lee el teléfono, de dónde llegó, el último formulario y las visitas", () => {
    expect(rastro).toMatchObject({ telefono: "+506 8888 8888", fuente: "ORGANIC_SEARCH", visitas: 12, agendo: null });
    const s = senalesDe({ id: "1", nombre: "Ana", cargo: null, email: null, hizoElTest: true, rastro }, { test: { area: "Ventas", fecha: "2026-09-23" } });
    expect(s.map((x) => x.que)).toEqual(["Hizo el diagnóstico de rendimiento", "Llegó por", "Último formulario", "Páginas vistas en el sitio"]);
    expect(s[1].valor).toBe("Búsqueda en Google · google");
  });

  it("el contacto principal es quien hizo el test; si nadie, el que convirtió más reciente", () => {
    const base = { cargo: null, email: null, rastro: rastroDe({}) };
    const viejo = { ...base, id: "a", nombre: "A", hizoElTest: false, rastro: rastroDe({ recent_conversion_date: "2026-01-01" }) };
    const nuevo = { ...base, id: "b", nombre: "B", hizoElTest: false, rastro: rastroDe({ recent_conversion_date: "2026-09-01" }) };
    expect(contactoPrincipal([viejo, nuevo])?.id).toBe("b");
    expect(contactoPrincipal([viejo, { ...nuevo, id: "c", hizoElTest: true }, nuevo])?.id).toBe("c");
    expect(contactoPrincipal([])).toBeNull();
  });
});

describe("Preparación: la radiografía que investiga en internet", () => {
  const busqueda = {
    type: "web_search_tool_result",
    tool_use_id: "s1",
    content: [{ type: "web_search_result", url: "https://www.credit-force.com/noticias/expansion/", title: "Expansión", encrypted_content: "", page_age: null }],
  };
  const herramientaDe = (input: Record<string, unknown>) => ({ type: "tool_use", id: "t1", name: "radiografia", input });

  it("un hito entra solo con un enlace que salió en la búsqueda; lo demás se descarta", () => {
    const r = leerLaRadiografia(
      [
        { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "CreditForce" } },
        busqueda,
        herramientaDe({
          resumen: "Software de crédito y cobranza para financieras.",
          sector: "Software financiero",
          modelos: ["b2b", "saas", "inventado"],
          stack: ["HubSpot", " "],
          hitos: [
            { texto: "Abrió oficina en Guatemala", fecha: "2026-03", url: "https://credit-force.com/noticias/expansion" },
            { texto: "Ganó un premio", url: "https://otro-sitio.com/premio" },
          ],
        }),
      ] as unknown as Anthropic.Messages.ContentBlock[],
      "run_1",
      AHORA,
    );
    expect(r.busquedas).toBe(1);
    expect(r.hitosSinEnlace).toBe(1);
    expect(r.item?.destino).toEqual({ tipo: "casilla", clave: "radiografia" });
    expect(r.item?.valor).toEqual({
      resumen: "Software de crédito y cobranza para financieras.",
      sector: "Software financiero",
      modelos: ["b2b", "saas"],
      stack: ["HubSpot"],
      hitos: [{ texto: "Abrió oficina en Guatemala", fecha: "2026-03", url: "https://credit-force.com/noticias/expansion" }],
    });
    expect(r.fuente?.id).toBe("W1");
    expect(r.fuente?.texto).toContain("Abrió oficina en Guatemala");
  });

  it("sin la herramienta, o sin nada útil, no propone nada", () => {
    expect(leerLaRadiografia([busqueda] as unknown as Anthropic.Messages.ContentBlock[], "run_1").item).toBeNull();
    expect(leerLaRadiografia([herramientaDe({ modelos: [] })] as unknown as Anthropic.Messages.ContentBlock[], "run_1").item).toBeNull();
  });

  it("compara direcciones sin www, sin la barra final", () => {
    expect(urlComparable("https://www.Acme.com/a/")).toBe(urlComparable("https://acme.com/a"));
  });
});

describe("Preparación: la estrategia de conexión", () => {
  const cita = [{ id: "S1", cita: "nadie sabe en qué etapa va cada negocio" }];
  const estrategia = { canal: "whatsapp", pitch: "Ordenar el seguimiento", mensaje: "Hola Ana, vi tu diagnóstico.", cta: "Agenda aquí", fuentes: cita };

  it("se pide y se lee solo al preparar y si todavía no agendó", () => {
    const props = (c: ContextoDelPedido) => (herramienta(c).input_schema as { properties: Record<string, unknown> }).properties;
    expect(props(ctx({ modo: "preparar" }))).toHaveProperty("estrategiaDeConexion");
    expect(props(ctx({ modo: "preparar", proxima: { titulo: "Revisión", inicio: "2026-10-05T15:00:00Z" } }))).not.toHaveProperty("estrategiaDeConexion");
    expect(props(ctx())).not.toHaveProperty("estrategiaDeConexion");
    const r = leerLaRespuesta(respuesta({ estrategiaDeConexion: estrategia }), ctx({ modo: "preparar" }), "run_1", AHORA);
    expect(r.items.map((i) => i.destino)).toEqual([{ tipo: "casilla", clave: "estrategiaDeConexion" }]);
    expect(r.items[0].valor).toEqual({ canal: "whatsapp", pitch: "Ordenar el seguimiento", mensaje: "Hola Ana, vi tu diagnóstico.", cta: "Agenda aquí" });
    expect(leerLaRespuesta(respuesta({ estrategiaDeConexion: estrategia }), ctx(), "run_1", AHORA).items).toEqual([]);
  });
});

describe("Preparación: el «por qué ahora» sugerido con los hechos", () => {
  const fecha = (iso: string) => iso.slice(0, 10);
  it("dice qué hizo y de dónde llegó, en una frase; sin hechos, nada", () => {
    expect(
      porQueAhoraSugerido(
        [
          { que: "Hizo el diagnóstico de rendimiento", valor: "Ventas", fecha: "2026-09-23" },
          { que: "Llegó por", valor: "Búsqueda en Google" },
          { que: "Último formulario", valor: "Test diagnóstico de rendimiento", fecha: "2026-09-23T15:00:00Z" },
          { que: "Páginas vistas en el sitio", valor: "12" },
        ],
        fecha,
      ),
    ).toBe("Llenó el formulario del diagnóstico de rendimiento de Ventas el 2026-09-23; llegó por búsqueda en Google, vio 12 páginas del sitio.");
    expect(porQueAhoraSugerido([{ que: "Último formulario", valor: "Contacto", fecha: "2026-09-01" }], fecha)).toBe("Llenó el formulario «Contacto» el 2026-09-01.");
    expect(porQueAhoraSugerido([], fecha)).toBeNull();
  });
});

describe("Preventa (2026-10-06): industria, hipótesis con su origen y la conversación técnica", () => {
  it("la radiografía trae también la industria, a su casilla y como fuente W2", () => {
    const r = leerLaRadiografia(
      [
        {
          type: "tool_use",
          id: "t1",
          name: "radiografia",
          input: { resumen: "Software de crédito.", industria: { resumen: "La banca regional se digitaliza.", retos: ["Seguimiento lento", " "] } },
        },
      ] as unknown as Anthropic.Messages.ContentBlock[],
      "run_1",
      AHORA,
    );
    expect(r.industria?.item.destino).toEqual({ tipo: "casilla", clave: "industria" });
    expect(r.industria?.item.valor).toBe("La banca regional se digitaliza.\n- Seguimiento lento");
    expect(r.industria?.fuente.id).toBe("W2");
  });

  it("sin la industria, la radiografía sigue igual", () => {
    const r = leerLaRadiografia(
      [{ type: "tool_use", id: "t1", name: "radiografia", input: { resumen: "Software de crédito." } }] as unknown as Anthropic.Messages.ContentBlock[],
      "run_1",
      AHORA,
    );
    expect(r.industria).toBeNull();
    expect(r.item).not.toBeNull();
  });

  it("cada hipótesis de valor dice de dónde sale, desde sus fuentes, y sin «Creemos que»", () => {
    expect(conSuOrigen("Creemos que pierden negocios por seguimiento tardío", ["W2", "N0", "N0"])).toBe(
      "Pierden negocios por seguimiento tardío · De: la investigación de su industria y tus notas",
    );
    expect(separarOrigen("Pierden negocios · De: HubSpot")).toEqual({ idea: "Pierden negocios", origen: "HubSpot" });
    expect(separarOrigen("Sin origen")).toEqual({ idea: "Sin origen", origen: null });
    const r = leerLaRespuesta(
      respuesta({ textos: [{ casilla: "hipotesisDeValor", texto: "Nadie sabe en qué etapa va cada negocio", fuentes: [{ id: "S1" }] }] }),
      ctx({ modo: "preparar" }),
      "run_1",
      AHORA,
    );
    expect(r.items[0].valor).toBe("Nadie sabe en qué etapa va cada negocio · De: una reunión");
  });

  it("el agente no escribe «Su industria» por su cuenta: solo la investigación en internet", () => {
    const r = leerLaRespuesta(
      respuesta({ textos: [{ casilla: "industria", texto: "El retail crece", fuentes: [{ id: "E0" }] }] }),
      ctx({ modo: "preparar" }),
      "run_1",
      AHORA,
    );
    expect(r.items).toEqual([]);
  });

  it("la conversación técnica entra solo con la frase de la reunión; sin frase no se toca; «no» la apaga", () => {
    const leer = (conversacionTecnica: unknown) => leerLaRespuesta(respuesta({ conversacionTecnica }), ctx(), "run_1", AHORA).tecnica;
    expect(
      leer({ tecnica: true, temas: ["Integración con el ERP"], momento: "Al final", fuentes: [{ id: "S1", cita: "nadie sabe en qué etapa va cada negocio" }] }),
    ).toEqual({ reunion: "Reunión del 1 oct", temas: ["Integración con el ERP"], momento: "Al final", cita: "nadie sabe en qué etapa va cada negocio" });
    expect(leer({ tecnica: true, fuentes: [{ id: "S1", cita: "hablamos de la API de SAP" }] })).toBeUndefined();
    expect(leer({ tecnica: true, fuentes: [{ id: "E0", cita: "Acme Retail, 120 empleados" }] })).toBeUndefined();
    expect(leer({ tecnica: false, fuentes: [] })).toBeNull();
    expect(leer(undefined)).toBeUndefined();
    // Al preparar no hay reunión que leer: no se pregunta.
    expect(leerLaRespuesta(respuesta({}), ctx({ modo: "preparar" }), "run_1", AHORA).tecnica).toBeUndefined();
  });
});

describe("⭐ las instrucciones adicionales del «Contexto adicional» (2026-10-06)", () => {
  const INSTRUCCION = "Enfócate en Servicio: Ventas ya lo resolvieron con otro proveedor.";
  const conInstrucciones = () => {
    const c = contenidoVacio();
    c.notas[CLAVE_DE_INSTRUCCIONES] = INSTRUCCION;
    return c;
  };

  it("sin instrucciones no hay bloque; con instrucciones, va rotulado y dice que no son evidencia", () => {
    expect(bloqueDeInstrucciones({})).toBe("");
    expect(bloqueDeInstrucciones({ [CLAVE_DE_INSTRUCCIONES]: "   " })).toBe("");
    const b = bloqueDeInstrucciones({ [CLAVE_DE_INSTRUCCIONES]: INSTRUCCION, "sesion:s-1": "una nota" });
    expect(b).toContain("INSTRUCCIONES ADICIONALES DEL VENDEDOR");
    expect(b).toContain(INSTRUCCION);
    expect(b).toMatch(/no son palabras del cliente ni evidencia/i);
    expect(b).not.toContain("una nota");
  });

  it("la preparación y la lectura las reciben antes de lo confirmado; sin ellas el pedido no cambia", () => {
    for (const modo of ["preparar", "leer"] as const) {
      const cuerpo = String(pedidoDeLaExploracion(ctx({ modo, contenido: conInstrucciones() })).messages[0].content);
      expect(cuerpo.indexOf(INSTRUCCION)).toBeGreaterThan(-1);
      expect(cuerpo.indexOf(INSTRUCCION)).toBeLessThan(cuerpo.indexOf("=== LO QUE YA ESTÁ CONFIRMADO ==="));
      expect(String(pedidoDeLaExploracion(ctx({ modo })).messages[0].content)).not.toContain("INSTRUCCIONES ADICIONALES");
    }
  });

  it("los casos de uso también las reciben", () => {
    const base = { empresa: "Acme", edicion: "escala general", areas: [{ id: "1", nombre: "Ventas", dimensiones: [{ id: "1.1", nombre: "Proceso" }] }], exploracion: "(x)", yaEstan: [], descartados: [] };
    expect(String(pedidoDeCasos({ ...base, instrucciones: bloqueDeInstrucciones({ [CLAVE_DE_INSTRUCCIONES]: INSTRUCCION }) }).messages[0].content)).toContain(INSTRUCCION);
    expect(String(pedidoDeCasos(base).messages[0].content)).not.toContain("INSTRUCCIONES ADICIONALES");
  });
});

describe("⭐ el agente resume cada reunión y dice qué se respondió (2026-10-07)", () => {
  const planeado = {
    objetivo: "Validar el diagnóstico",
    preguntas: [
      { para: "1.3", pregunta: "¿Qué tan cerca estuvo el diagnóstico?" },
      { para: "autoridad", pregunta: "¿Quién decide sobre tecnología?" },
    ],
  };
  const conReunion = ctx({ reuniones: [{ fuente: "S1", etiqueta: "Reunión del 1 oct" }], planeado });

  it("al leer pide un resumen por reunión y la cobertura de lo planeado; al preparar no", () => {
    const props = herramienta(conReunion).input_schema.properties as Record<string, unknown>;
    expect(JSON.stringify(props.reuniones)).toContain('"enum":["S1"]');
    expect(JSON.stringify(props.reuniones)).toContain('"enum":["1.3","autoridad"]');
    expect((herramienta(ctx({ modo: "preparar" })).input_schema.properties as Record<string, unknown>).reuniones).toBeUndefined();
    const cuerpo = String(pedidoDeLaExploracion(conReunion).messages[0].content);
    expect(cuerpo).toContain("S1: Reunión del 1 oct");
    expect(cuerpo).toContain("- autoridad: ¿Quién decide sobre tecnología?");
  });

  it("guarda el resumen de las reuniones leídas; la cobertura sigue lo planeado y lo no nombrado no se preguntó", () => {
    const r = leerLaRespuesta(
      respuesta({
        reuniones: [
          { fuente: "S1", resumen: "Confirmó que los datos están desordenados.", cobertura: [{ para: "1.3", respondida: true, detalle: "lo confirmó, con ejemplos" }, { para: "9.9", respondida: true }] },
          { fuente: "S9", resumen: "De una reunión que no se leyó" },
          { fuente: "S1", resumen: "repetida" },
        ],
      }),
      conReunion,
      "run_1",
      AHORA,
    );
    expect(r.reuniones).toEqual([
      {
        fuente: "S1",
        resumen: "Confirmó que los datos están desordenados.",
        cobertura: [
          { para: "1.3", pregunta: "¿Qué tan cerca estuvo el diagnóstico?", respondida: true, detalle: "lo confirmó, con ejemplos" },
          { para: "autoridad", pregunta: "¿Quién decide sobre tecnología?", respondida: false },
        ],
      },
    ]);
  });

  it("la lectura se guarda en la propuesta por reunión, y lo que no tiene la forma se cae", () => {
    const lectura = { etiqueta: "Reunión del 1 oct", resumen: "Algo", cobertura: [], listosAntes: ["frena"], en: "2026-10-01T00:00:00.000Z", corridaId: "run_1" };
    expect(leerPropuesta({ ...propuestaVacia(), lecturas: { "meet:gmeet_1": lectura, "fax:1": lectura, "meet:2": { resumen: 3 } } }).lecturas).toEqual({ "meet:gmeet_1": lectura });
  });
});
