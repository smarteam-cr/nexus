/**
 * lib/exploraciones/marco.test.ts — la exploración de un PROYECTO (Customer Success, 2026-10-07): el mismo
 * lienzo que la preventa con otras preguntas, y lo que impide que una se confunda con la otra.
 * Correr: `npx vitest run lib/exploraciones/marco.test.ts --project unit`.
 */
import fs from "node:fs";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { ClaveDeCapa, Letra } from "@/lib/escala/documento/tipos";
import { herramienta, leerLaRespuesta, MODELO_DE_LA_EXPLORACION, pedidoDeLaExploracion, type ContextoDelPedido } from "./agente-pedido";
import { avanceDeLaEstrategia, loNuevoDeLaEstrategia, queSigueDelProyecto } from "./avance-del-proyecto";
import { CASILLAS_DEL_RESUMEN } from "./casillas";
import { contenidoVacio, esFuenteDelCliente, NIVELES, propuestaVacia, sinFundamentoDelCliente, type EstadoDeExploracion } from "./contenido";
import type { DimensionDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";
import { focoDeLaGuia, preguntasParaMostrar } from "./guia";
import { contextoDeLaGuia, herramientaDeLaGuia, pedidoDeLaGuia } from "./guia-pedido";
import { definicionEnElMarco, esTarjeta, MARCO_DE_CS, MARCO_DE_VENTA, marcoDe } from "./marco";

function dim(id: string, capa: ClaveDeCapa): DimensionDelLienzo {
  return {
    id,
    nombre: `Dimensión ${id}`,
    nombreGeneral: null,
    capa,
    pregunta: `¿Cómo va ${id}?`,
    descripcion: null,
    costoDeQuedarse: "Cuesta",
    aplica: true,
    niveles: NIVELES.map((l: Letra) => ({ letra: l, descripcion: `Nivel ${l} de ${id}`, resultado: null })),
    funcional: [],
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
  areas: [area("3", "Servicio", ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8"].map((id, i) => dim(id, i < 4 ? "base" : "produccion")))],
};

function estado(over: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  return {
    contenido: contenidoVacio(),
    propuesta: propuestaVacia(),
    areas: ["3"],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivada: false,
    ...over,
  };
}

const RAIZ = process.cwd();

describe("el marco de Customer Success", () => {
  it("explora la estrategia: retos, resultados que persigue y obstáculos", () => {
    expect(MARCO_DE_CS.tarjetas).toEqual(["retos", "metas", "obstaculos"]);
    expect(MARCO_DE_CS.nombre).toBe("Estrategia");
    for (const k of MARCO_DE_CS.tarjetas) {
      expect(MARCO_DE_CS.preguntaDeBase[k], k).toBeTruthy();
      expect(MARCO_DE_CS.letras[k]?.letra, k).toBeTruthy();
    }
    expect(definicionEnElMarco("metas", MARCO_DE_CS).etiqueta).toBe("Resultados que persigue");
    expect(definicionEnElMarco("metas", MARCO_DE_VENTA).etiqueta).toBe("Metas");
    expect(MARCO_DE_CS.conObjeciones).toBe(false);
  });

  it("la venta sigue con sus ocho tarjetas, y cualquier valor raro es la venta", () => {
    expect(MARCO_DE_VENTA.tarjetas).toEqual(CASILLAS_DEL_RESUMEN);
    expect(marcoDe("cs")).toBe(MARCO_DE_CS);
    expect(marcoDe("venta")).toBe(MARCO_DE_VENTA);
    expect(marcoDe(null)).toBe(MARCO_DE_VENTA);
    expect(marcoDe("otra")).toBe(MARCO_DE_VENTA);
    expect(esTarjeta("obstaculos")).toBe(true);
    expect(esTarjeta("3.1")).toBe(false);
  });

  it("la guía pregunta más de la escala: hasta 3 tarjetas y 5 dimensiones", () => {
    const e = estado();
    const venta = focoDeLaGuia(e.contenido.casillas, ESCALA, e.areas, {}, {}, MARCO_DE_VENTA);
    const cs = focoDeLaGuia(e.contenido.casillas, ESCALA, e.areas, {}, {}, MARCO_DE_CS);
    expect(venta.huecos).toHaveLength(5);
    expect(venta.enfoque).toHaveLength(3); // 8 preguntas en total
    expect(cs.huecos).toEqual(["retos", "metas", "obstaculos"]);
    expect(cs.enfoque).toHaveLength(5);
  });

  it("las preguntas de base salen del marco", () => {
    const cs = preguntasParaMostrar(null, ["obstaculos"], [], ESCALA, undefined, MARCO_DE_CS);
    expect(cs[0]).toMatchObject({ para: "obstaculos", tipo: "tarjeta", pregunta: MARCO_DE_CS.preguntaDeBase.obstaculos });
  });
});

describe("la guía de Customer Success", () => {
  const ctx = contextoDeLaGuia({
    empresa: "Acme",
    industria: null,
    estado: estado(),
    escala: ESCALA,
    posiciones: {},
    pendientes: [],
    agenda: [],
    conTest: false,
    hoy: "2026-10-07",
    marco: MARCO_DE_CS,
    proyecto: "--- El handoff ---\nQuieren bajar la pérdida de clientes.",
  });

  it("no lleva objeciones ni arranca «desde cero»: el cliente ya compró", () => {
    expect(ctx.marco).toBe("cs");
    expect(ctx.desdeCero).toBe(false);
    expect(ctx.objecionesDichas).toEqual([]);
    const tool = herramientaDeLaGuia(ctx);
    const props = (tool.input_schema as { properties: Record<string, unknown>; required: string[] }).properties;
    expect(props.objeciones).toBeUndefined();
    expect(props.pocaApertura).toBeUndefined();
    expect((tool.input_schema as { required: string[] }).required).not.toContain("objeciones");
  });

  it("el pedido es de Customer Success y lee el proyecto", () => {
    const p = pedidoDeLaGuia(ctx);
    expect(String(p.system)).toContain("Customer Success");
    expect(String(p.system)).not.toContain("LAER");
    const cuerpo = String((p.messages[0] as { content: string }).content);
    expect(cuerpo).toContain("EL PROYECTO");
    expect(cuerpo).toContain("Quieren bajar la pérdida de clientes.");
    // Desde el 2026-10-19 la guía de un proyecto también sale del plan (guia-del-proyecto.test.ts).
    expect(cuerpo).toContain("LAS TARJETAS DE ESTA SESIÓN");
    expect(cuerpo).not.toContain("Las objeciones típicas");
  });
});

describe("el agente que lee las sesiones del proyecto", () => {
  const REUNION = "Laura: perdemos clientes en el segundo año. Queremos bajar del 30 % al 15 % antes de junio. Nadie ve cuándo un cliente deja de comprar.";
  const ctx = (over: Partial<ContextoDelPedido> = {}): ContextoDelPedido => ({
    modo: "leer",
    marco: "cs",
    empresa: "Acme",
    industria: null,
    escala: ESCALA,
    areas: ["3"],
    perfil: null,
    contenido: contenidoVacio(),
    fuentes: [
      { id: "V0", etiqueta: "El handoff", texto: "Se vendió Service Hub para ordenar la postventa." },
      { id: "S1", etiqueta: "Reunión del 6 oct", texto: REUNION },
    ],
    ...over,
  });
  const respuesta = (input: Record<string, unknown>) =>
    ({
      id: "m",
      type: "message",
      role: "assistant",
      model: MODELO_DE_LA_EXPLORACION,
      content: [{ type: "tool_use", id: "t", name: "proponer", input }],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }) as unknown as Anthropic.Messages.Message;

  it("pide obstáculos y no lo de la venta (quién firma, objeciones, apertura)", () => {
    const props = (herramienta(ctx()).input_schema as { properties: Record<string, unknown> }).properties;
    expect(props.obstaculos).toBeDefined();
    for (const k of ["personas", "objeciones", "apertura", "estrategiaDeConexion", "conversacionTecnica"]) expect(props[k], k).toBeUndefined();
    expect(String(pedidoDeLaExploracion(ctx()).system)).toContain("Customer Success");
    // La preventa no pide obstáculos.
    expect((herramienta(ctx({ marco: "venta" })).input_schema as { properties: Record<string, unknown> }).properties.obstaculos).toBeUndefined();
  });

  it("lee los obstáculos y deja afuera lo de la venta aunque el modelo lo mande", () => {
    const r = leerLaRespuesta(
      respuesta({
        obstaculos: [{ texto: "Nadie ve cuándo un cliente deja de comprar", dimensionId: "3.8", fuentes: [{ id: "S1", cita: "Nadie ve cuándo un cliente deja de comprar" }] }],
        personas: [{ nombre: "Laura", rol: "firma", fuentes: [{ id: "S1", cita: "perdemos clientes en el segundo año" }] }],
        objeciones: [{ texto: "Es caro", clase: "precio", fuentes: [{ id: "S1", cita: "perdemos clientes en el segundo año" }] }],
      }),
      ctx(),
      "run",
    );
    expect(r.items.map((i) => (i.destino.tipo === "casilla" ? i.destino.clave : i.destino.tipo))).toEqual(["obstaculos"]);
  });

  it("el handoff (V0) y los cuestionarios (Q0) cuentan como lo que dijo el cliente; el kickoff y la ficha no", () => {
    expect(esFuenteDelCliente("V0")).toBe(true);
    expect(esFuenteDelCliente("Q0")).toBe(true);
    expect(esFuenteDelCliente("K0")).toBe(false);
    expect(esFuenteDelCliente("F0")).toBe(false);
    expect(esFuenteDelCliente("P0")).toBe(false);
    expect(sinFundamentoDelCliente({ destino: { tipo: "casilla", clave: "obstaculos" }, fuentes: [{ id: "F0", etiqueta: "Ficha" }] })).toBe(true);
  });
});

describe("cuánto se entiende al cliente", () => {
  it("los resultados piden una cifra; los retos y los obstáculos, al menos uno", () => {
    const e = estado();
    e.contenido.casillas.retos = [{ texto: "Pierden clientes" }];
    e.contenido.casillas.metas = [{ que: "Bajar la pérdida" }];
    expect(avanceDeLaEstrategia(e).map((p) => [p.id, p.cumplido])).toEqual([
      ["retos", true],
      ["metas", false],
      ["obstaculos", false],
    ]);
    e.contenido.casillas.metas = [{ que: "Bajar la pérdida", objetivo: "15 %" }];
    expect(avanceDeLaEstrategia(e).find((p) => p.id === "metas")?.cumplido).toBe(true);
  });

  it("lo nuevo de la estrategia es lo que está ahora y no estaba antes", () => {
    const antes = estado();
    antes.contenido.casillas.retos = [{ texto: "Pierden clientes" }];
    const despues = estado();
    despues.contenido.casillas.retos = [{ texto: "Pierden clientes" }, { texto: "Crecen sin orden" }];
    despues.contenido.casillas.obstaculos = [{ texto: "Cada uno usa su Excel" }];
    expect(loNuevoDeLaEstrategia(antes, despues)).toEqual([
      { pregunta: "Retos", respuesta: "Crecen sin orden" },
      { pregunta: "Obstáculos", respuesta: "Cada uno usa su Excel" },
    ]);
  });

  it("qué sigue: primero lo sin leer, después lo sugerido, después la primera sesión", () => {
    const chequeo = { areas: [], completo: false, recomendacion: null, parcial: false };
    expect(queSigueDelProyecto(estado(), chequeo, [{ id: "s", titulo: "Kickoff", fecha: "2026-10-01T15:00:00Z", origen: "meet" }], 0)).toContain("sin leer");
    expect(queSigueDelProyecto(estado(), chequeo, [], 2)).toContain("Revisa lo que sugirió el agente");
    expect(queSigueDelProyecto(estado(), chequeo, [], 0)).toContain("primera sesión");
  });
});

describe("⛔ una exploración de proyecto no es una preventa", () => {
  /** Las lecturas de VENTAS de la tabla (o de su relación) tienen que filtrar `projectId: null`. */
  const PERMITIDOS = new Set([
    "lib/exploraciones/del-proyecto.ts",
    "lib/exploraciones/guardia.ts",
    "app/api/projects/[projectId]/exploracion/route.ts",
    "scripts/migrar-guia-de-exploracion.ts",
    /* Solo lectura, antes del deploy de la etapa 7: lee las exploraciones de PROYECTO (el filtro contrario) para medir
       cuántas reuniones sugeriría el diagnóstico. Nunca una preventa. */
    "scripts/medir-contexto-de-documentos.ts",
    /* La escala de la EMPRESA (La cuenta › La escala, 2026-10-12): lee a propósito las DOS, la preventa y las de cada
       proyecto, porque todas posicionan a la empresa. Pantalla interna; solo lo confirmado. */
    "lib/exploraciones/escala-de-la-empresa.ts",
    /* Las versiones de la escala (ficha B, 2026-10-17): busca la exploración VIVA de un proyecto por su `projectId` (la
       foto que deja su diagnóstico), nunca una preventa. */
    "lib/exploraciones/versiones-de-la-escala.ts",
    /* La primera versión de la escala de cada exploración viva (ficha B): las dos clases a propósito, como la escala de
       la empresa. */
    "scripts/guardar-primera-version-de-la-escala.ts",
    /* K5 (2026-10-27): las sesiones que se asocian solas, en la preventa Y en la exploración de cada proyecto (las dos
       esperan sus reuniones); y las de OTRAS exploraciones de la misma empresa, para dudar si una reunión ya es de otra. */
    "lib/exploraciones/asociar-server.ts",
    /* INV61 (2026-10-27): ninguna sesión de NINGUNA exploración (preventa o proyecto) unida a una reunión de otra empresa. */
    "lib/invariantes/exploraciones.ts",
  ]);
  function archivos(dir: string): string[] {
    const abs = path.join(RAIZ, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
      if (e.name === "node_modules" || e.name.startsWith(".next") || e.name === "archive") return [];
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return archivos(rel);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel.split(path.sep).join("/")] : [];
    });
  }

  it("toda búsqueda de exploraciones por empresa o en lista filtra la preventa", () => {
    const sinFiltro: string[] = [];
    for (const f of ["app", "lib", "scripts"].flatMap(archivos)) {
      if (PERMITIDOS.has(f)) continue;
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      const re = /(exploracionDeVenta\.(findMany|findFirst|count)\(|exploracionesDeVenta:\s*\{)/g;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        const tramo = src.slice(m.index, m.index + 400);
        // Por id no hace falta (la fila es una sola); por empresa, en lista o contando, sí.
        if (/where:\s*\{\s*id\b/.test(tramo.slice(0, 120))) continue;
        if (!/DE_LA_PREVENTA|projectId:\s*null/.test(tramo)) sinFiltro.push(`${f}: ${tramo.slice(0, 80).replace(/\s+/g, " ")}`);
      }
    }
    expect(sinFiltro, "Filtra con DE_LA_PREVENTA (lib/exploraciones/marco.ts): una exploración de proyecto no es una preventa").toEqual([]);
  });
});
