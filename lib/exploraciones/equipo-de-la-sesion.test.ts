/**
 * lib/exploraciones/equipo-de-la-sesion.test.ts — K11 (2026-10-28): el equipo de cada sesión, de punta a punta. La
 * sugerencia con los casos reales de producción, lo que reciben la lectura y la escala, qué se sugiere rehacer al cambiarlo,
 * la historia que lee la guía, «Qué explorar» y las sesiones por equipo que sugiere la guía.
 * Correr: `npx vitest run --project unit lib/exploraciones/equipo-de-la-sesion.test.ts`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { Letra } from "@/lib/escala/documento/tipos";
import { leerLaRespuesta, MODELO_DE_LA_EXPLORACION, pedidoDeLaExploracion, pedidoDeLosResumenes, REGLA_DEL_EQUIPO_DE_LA_REUNION, type ContextoDelPedido } from "./agente-pedido";
import { fraseAlCambiarElEquipo, queRehacerAlCambiarElEquipo, type EstadoParaRehacer } from "./al-cambiar-el-equipo";
import { contenidoVacio, NIVELES, type LecturaDeReunion } from "./contenido";
import { sugerirEquipoDeLaSesion } from "./equipos";
import { ESCALA_DE_PRUEBA, estadoDePrueba } from "./escala-de-prueba.test-helpers";
import type { DimensionDelLienzo, EscalaDelLienzo } from "./escala-del-lienzo";
import { leerContenido, leerPropuesta } from "./esquemas";
import { equiposDeLasReuniones, pestanasDeSesiones, type ReunionDeLaExploracion, type SesionPlaneada } from "./guia";
import { contextoDeLaGuia, pedidoDeLaGuia } from "./guia-pedido";
import { historiaDeLasSesiones, textoDeLasSesiones } from "./historia-de-las-sesiones";
import { chequeoDelMapa, posicionesDelMapa } from "./mapa";
import { areasDeLaProxima, queExplorar } from "./que-explorar";

// ── Una escala con Ventas (1) y Marketing (2) ────────────────────────────────

function dim(id: string): DimensionDelLienzo {
  return {
    id,
    nombre: `Dimensión ${id}`,
    nombreGeneral: null,
    capa: "base",
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
const ESCALA: EscalaDelLienzo = { ...ESCALA_DE_PRUEBA, areas: [area("1", "Ventas", [dim("1.1"), dim("1.2")]), area("2", "Marketing", [dim("2.1"), dim("2.2")])] };

describe("K11 · la sugerencia del equipo, con los casos reales", () => {
  it("«Cemaco | Sales Hub» es un producto, no un equipo: no sugiere Ventas", () => {
    expect(sugerirEquipoDeLaSesion({ sesion: { evento: { titulo: "Cemaco | Sales Hub" } } })).toBeNull();
    expect(sugerirEquipoDeLaSesion({ reunion: { titulo: "Onboarding Marketing Hub | Acme" } })).toBeNull();
    expect(sugerirEquipoDeLaSesion({ reunion: { titulo: "Diagnóstico Service Hub" } })).toBeNull();
  });

  it("«operación comercial» en el objetivo que redactó el agente no manda la sesión a Ventas (Leasein, Tecnosagot, CAMOSA)", () => {
    const objetivo = "Entender qué quiere lograr CAMOSA, qué les frena hoy, cuánto les cuesta no actuar y quién decide sobre una inversión para mejorar su operación comercial.";
    expect(sugerirEquipoDeLaSesion({ sesion: { objetivo, evento: { titulo: "Camosa l Exploración de retos operativos" } } })).toBeNull();
    // Aunque lo hubiera escrito una persona, «la operación comercial» es la de la empresa entera.
    expect(sugerirEquipoDeLaSesion({ sesion: { objetivo, objetivoPropio: true } })).toBeNull();
  });

  it("«la junta directiva» en el objetivo del agente no es una sesión con Dirección (Universidad de Monterrey)", () => {
    const objetivo = "Llevar los dolores de Milena a números concretos y confirmar cómo funciona el proceso de aprobación con Gisela y la junta directiva.";
    expect(sugerirEquipoDeLaSesion({ sesion: { objetivo }, reunion: { titulo: "Milena Gónzalez Morales and Andrés Pinzón" } })).toBeNull();
    // En el título del calendario, sí: dice con quién es la reunión.
    expect(sugerirEquipoDeLaSesion({ reunion: { titulo: "Presentación a la junta directiva" } })).toMatchObject({ equipo: "direccion", de: "calendario" });
  });

  it("primero los títulos: el que le puso una persona a la sesión y el del calendario", () => {
    expect(sugerirEquipoDeLaSesion({ reunion: { titulo: "Diagnóstico Tecnosagot | Ventas" } })).toEqual({ equipo: "ventas", de: "calendario", texto: "Diagnóstico Tecnosagot | Ventas" });
    expect(sugerirEquipoDeLaSesion({ sesion: { titulo: "Sesión con mercadeo", objetivo: "Ventas", objetivoPropio: true }, reunion: { titulo: "Cemaco | Sales Hub" } })).toMatchObject({
      equipo: "marketing",
      de: "titulo",
    });
  });

  it("el objetivo cuenta solo si lo escribió una persona (CEMACO, 20 oct: lo escribió Liliana)", () => {
    const objetivo = "Entender cómo va a operar el equipo de Marketing de Cemaco dentro de la operación";
    const pistas = { sesion: { objetivo, evento: { titulo: "Cemaco | Sales Hub" } } };
    expect(sugerirEquipoDeLaSesion(pistas)).toBeNull();
    expect(sugerirEquipoDeLaSesion({ sesion: { ...pistas.sesion, objetivoPropio: true } })).toMatchObject({ equipo: "marketing", de: "objetivo" });
  });

  it("«retos operativos» no es Operaciones; «logística», sí", () => {
    expect(sugerirEquipoDeLaSesion({ reunion: { titulo: "Camosa l Exploración de retos operativos" } })).toBeNull();
    expect(sugerirEquipoDeLaSesion({ reunion: { titulo: "Sesión con logística y bodega" } })?.equipo).toBe("operaciones");
  });

  it("el objetivo propio se guarda y se lee de vuelta", () => {
    const c = leerContenido({ sesiones: [{ id: "s-a", objetivo: "Con mercadeo", objetivoPropio: true }, { id: "s-b", objetivo: "Del agente" }] });
    expect(c.sesiones.map((s) => s.objetivoPropio)).toEqual([true, undefined]);
  });
});

// ── La lectura y la escala ─────────────────────────────────────────────────────

const DE_MARKETING = "Lucía: las campañas las mide cada agencia con su propio reporte y nadie junta los números de la pauta.";
function ctxDeLectura(over: Partial<ContextoDelPedido> = {}): ContextoDelPedido {
  return {
    modo: "leer",
    empresa: "Acme",
    industria: null,
    escala: ESCALA,
    areas: ["1", "2"],
    perfil: null,
    contenido: contenidoVacio(),
    fuentes: [
      { id: "S1", etiqueta: "Reunión del 20 oct: Cemaco | Sales Hub", texto: DE_MARKETING },
      { id: "N0", etiqueta: "Notas del vendedor", texto: "Lucía cuenta que nadie junta los números de la pauta." },
    ],
    reuniones: [{ fuente: "S1", etiqueta: "Reunión del 20 oct: Cemaco | Sales Hub", equipo: "marketing" }],
    ...over,
  };
}
function respuesta(input: Record<string, unknown>): Anthropic.Messages.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: MODELO_DE_LA_EXPLORACION,
    content: [{ type: "tool_use", id: "t", name: "proponer", input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Messages.Message;
}

describe("K11 · la lectura y la escala reciben el equipo", () => {
  // Las reuniones como las ve la pantalla, y las pestañas como las arma ella (guia.ts › `pestanasDeSesiones`).
  const reunion = (origen: "meet" | "hubspot", id: string, fecha: string, extra: Partial<ReunionDeLaExploracion> = {}): ReunionDeLaExploracion => ({
    id,
    titulo: `Reunión ${id}`,
    fecha,
    origen,
    leida: true,
    ...extra,
  });
  const leida = (fuente: string, r: ReunionDeLaExploracion) => ({ fuente, clave: `${r.origen}:${r.id}`, origen: r.origen, fecha: r.fecha });
  const equipos = (sesiones: SesionPlaneada[], reuniones: ReunionDeLaExploracion[], leidas: ReturnType<typeof leida>[]) =>
    equiposDeLasReuniones(leidas, pestanasDeSesiones(sesiones, reuniones, "2026-10-28"));

  it("la reunión elegida de HubSpot que quedó grabada en Meet: las dos llevan el equipo (la pantalla muestra la de Meet)", () => {
    const hs = reunion("hubspot", "h1", "2026-10-20T15:00:00.000Z");
    const meet = reunion("meet", "m1", "2026-10-20T15:05:00.000Z");
    const sesiones: SesionPlaneada[] = [{ id: "s-a", fecha: "2026-10-20", reunion: { id: "h1", origen: "hubspot", inicio: hs.fecha }, equipo: "marketing" }];
    expect(equipos(sesiones, [hs, meet], [leida("S1", meet), leida("H1", hs)])).toEqual({ S1: "marketing", H1: "marketing" });
  });

  it("la grabación de Meet ligada por el id del evento del calendario lleva el equipo de su sesión", () => {
    const meet = reunion("meet", "m9", "2026-10-21T16:00:00.000Z", { eventoId: "ev-1" });
    const sesiones: SesionPlaneada[] = [{ id: "s-a", evento: { id: "ev-1", calendario: "x@smarteam.com", inicio: "2026-10-21T15:00:00.000Z" }, equipo: "servicio" }];
    expect(equipos(sesiones, [meet], [leida("S1", meet)])).toEqual({ S1: "servicio" });
  });

  it("dos sesiones el mismo día: la de las 10:30 con la empresa entera no hereda el Marketing de la de las 9:00", () => {
    const nueve = reunion("meet", "m1", "2026-10-22T15:00:00.000Z");
    const diezYMedia = reunion("meet", "m2", "2026-10-22T16:30:00.000Z");
    const sesiones: SesionPlaneada[] = [
      { id: "s-a", reunion: { id: "m1", origen: "meet" }, equipo: "marketing" },
      { id: "s-b", reunion: { id: "m2", origen: "meet" } },
    ];
    expect(equipos(sesiones, [nueve, diezYMedia], [leida("S1", nueve), leida("S2", diezYMedia)])).toEqual({ S1: "marketing" });
  });

  it("la copia de HubSpot de una reunión de Meet hereda su equipo; dos sesiones cerca con equipos distintos, ninguno", () => {
    const meet = reunion("meet", "m1", "2026-10-23T15:00:00.000Z");
    const hs = reunion("hubspot", "h1", "2026-10-23T15:10:00.000Z");
    const uno: SesionPlaneada[] = [{ id: "s-a", reunion: { id: "m1", origen: "meet" }, equipo: "ventas" }];
    expect(equipos(uno, [meet], [leida("S1", meet), leida("H1", hs)])).toEqual({ S1: "ventas", H1: "ventas" });
    const otra = reunion("meet", "m2", "2026-10-23T16:00:00.000Z");
    const dos: SesionPlaneada[] = [...uno, { id: "s-b", reunion: { id: "m2", origen: "meet" }, equipo: "marketing" }];
    expect(equipos(dos, [meet, otra], [leida("H1", hs)])).toEqual({});
  });

  it("la lectura guarda el equipo que trae cada reunión (escaneo: agente.ts y fuentes.ts)", () => {
    const leer = (f: string) => readFileSync(join(process.cwd(), f), "utf8").replace(/\r\n/g, "\n");
    const agente = leer("lib/exploraciones/agente.ts");
    const deLaCorrida = agente.slice(agente.indexOf("function lecturasDeLaCorrida("), agente.indexOf("async function resumirLoYaLeido("));
    expect(deLaCorrida).toContain("o.ctx.reuniones?.find((x) => x.fuente === r.fuente)?.equipo");
    expect(deLaCorrida).toContain("...(equipo ? { equipo } : {})");
    expect(agente).toContain("...(r.equipo ? { equipo: r.equipo } : {})");
    const fuentes = leer("lib/exploraciones/fuentes.ts");
    expect(fuentes).toMatch(/equiposDeLasReuniones\(reunionesLeidas, pestanas\)/);
    expect(fuentes).toMatch(/const pestanas = pestanasDeSesiones\(opts\.sesiones \?\? \[\], armadas\.todas/);
  });

  it("el pedido dice con qué equipo fue cada reunión y la regla de su área; sin equipo, nada de eso", () => {
    const texto = (c: ContextoDelPedido) => String(pedidoDeLaExploracion(c).messages[0].content);
    const con = texto(ctxDeLectura());
    expect(con).toContain("S1: Reunión del 20 oct: Cemaco | Sales Hub · fue con el equipo de Marketing del cliente (su área de la escala: Marketing)");
    expect(con).toContain(REGLA_DEL_EQUIPO_DE_LA_REUNION);
    const sin = texto(ctxDeLectura({ reuniones: [{ fuente: "S1", etiqueta: "Reunión del 20 oct" }] }));
    expect(sin).not.toContain("fue con el equipo");
    expect(sin).not.toContain(REGLA_DEL_EQUIPO_DE_LA_REUNION);
    // El resumen solo dice con quién fue, sin la regla de las dimensiones.
    const resumen = String(pedidoDeLosResumenes({ empresa: "Acme", fuentes: [], reuniones: ctxDeLectura().reuniones }).messages[0].content);
    expect(resumen).toContain("fue con el equipo de Marketing del cliente");
    expect(resumen).not.toContain(REGLA_DEL_EQUIPO_DE_LA_REUNION);
  });

  it("lo que dijo Marketing no queda como nivel de una dimensión de Ventas; en las de Marketing, sí", () => {
    const cita = "nadie junta los números de la pauta";
    const r = leerLaRespuesta(
      respuesta({
        niveles: [
          { dimensionId: "1.1", nivel: "D", fuentes: [{ id: "S1", cita }] },
          { dimensionId: "2.1", nivel: "D", fuentes: [{ id: "S1", cita }] },
        ],
      }),
      ctxDeLectura(),
      "run",
    );
    expect(r.items.filter((it) => it.destino.tipo === "nivel").map((it) => (it.destino as { dimensionId: string }).dimensionId)).toEqual(["2.1"]);
    expect(r.descartadas).toBe(1);
  });

  it("con otra fuente que no es del equipo (las notas del vendedor), el nivel de otra área sí entra", () => {
    const r = leerLaRespuesta(
      respuesta({ niveles: [{ dimensionId: "1.1", nivel: "D", fuentes: [{ id: "S1", cita: "nadie junta los números de la pauta" }, { id: "N0", cita: "nadie junta los números de la pauta" }] }] }),
      ctxDeLectura(),
      "run",
    );
    expect(r.items.some((it) => it.destino.tipo === "nivel")).toBe(true);
  });

  it("un reto que contó Marketing queda, sin la dimensión de Ventas que le puso el agente", () => {
    const r = leerLaRespuesta(
      respuesta({ retos: [{ texto: "Nadie junta los números de la pauta", dimensionId: "1.2", fuentes: [{ id: "S1", cita: "nadie junta los números de la pauta" }] }] }),
      ctxDeLectura(),
      "run",
    );
    const reto = r.items.find((it) => it.destino.tipo === "casilla");
    expect(reto?.valor).toEqual({ texto: "Nadie junta los números de la pauta" });
  });

  it("una reunión sin equipo deja ubicar en cualquier área, como antes", () => {
    const r = leerLaRespuesta(
      respuesta({ niveles: [{ dimensionId: "1.1", nivel: "D", fuentes: [{ id: "S1", cita: "nadie junta los números de la pauta" }] }] }),
      ctxDeLectura({ reuniones: [{ fuente: "S1", etiqueta: "Reunión" }] }),
      "run",
    );
    expect(r.items.some((it) => it.destino.tipo === "nivel")).toBe(true);
  });

  it("la lectura guarda con qué equipo se leyó, y se lee de vuelta", () => {
    const lectura: LecturaDeReunion = { etiqueta: "R", resumen: "x", cobertura: [], equipo: "marketing", en: "2026-10-20T00:00:00.000Z", corridaId: "r" };
    const p = leerPropuesta({ items: [], lecturas: { "meet:m1": lectura } });
    expect(p.lecturas["meet:m1"]?.equipo).toBe("marketing");
    const mala = leerPropuesta({ items: [], lecturas: { "meet:m1": { ...lectura, equipo: "inventado" } } });
    expect(mala.lecturas["meet:m1"]).toBeUndefined();
  });
});

// ── Qué se sugiere rehacer al cambiar el equipo ───────────────────────────────

describe("K11 · al cambiar el equipo, Nexus sugiere rehacer lo que aplique", () => {
  const base: EstadoParaRehacer = { equipo: "marketing", recienCambiado: true, porPreparar: false, guia: null, lectura: null, analisis: false };

  it("una sesión que todavía no ocurre: actualizar la guía armada para otro equipo (la de base se rehace sola)", () => {
    expect(queRehacerAlCambiarElEquipo({ ...base, porPreparar: true, guia: {} })).toEqual(["guia"]);
    expect(queRehacerAlCambiarElEquipo({ ...base, porPreparar: true, guia: { equipo: "marketing" } })).toEqual([]);
    expect(queRehacerAlCambiarElEquipo({ ...base, porPreparar: true, guia: null })).toEqual([]);
  });

  it("una sesión ya leída: volver a leerla con este equipo; en la preventa, también el análisis", () => {
    expect(queRehacerAlCambiarElEquipo({ ...base, lectura: {}, analisis: true })).toEqual(["lectura", "analisis"]);
    expect(queRehacerAlCambiarElEquipo({ ...base, lectura: { equipo: "marketing" } })).toEqual([]);
  });

  it("la lectura de otro equipo se sigue ofreciendo después; la guía y el análisis, solo al cambiar", () => {
    const despues = { ...base, recienCambiado: false, porPreparar: true, guia: {}, lectura: { equipo: "ventas" as const }, analisis: true };
    expect(queRehacerAlCambiarElEquipo(despues)).toEqual(["lectura"]);
    expect(fraseAlCambiarElEquipo(despues, ["lectura"])).toBe(
      "La reunión se leyó como sesión con Ventas, y la sesión ahora es con Marketing. Volver a leerla ubica lo que dijo en las dimensiones de su área.",
    );
  });

  it("volver a la empresa entera también se ofrece si se leyó con un equipo", () => {
    expect(queRehacerAlCambiarElEquipo({ ...base, equipo: null, lectura: { equipo: "marketing" } })).toEqual(["lectura"]);
    expect(queRehacerAlCambiarElEquipo({ ...base, equipo: null, recienCambiado: false, lectura: {} })).toEqual([]);
  });
});

// ── La historia, «Qué explorar» y las sesiones por equipo ─────────────────────

describe("K11 · la historia de las sesiones dice qué equipo dijo qué", () => {
  it("cada sesión con su equipo, o con la empresa entera", () => {
    const lectura = (titulo: string, fecha: string): LecturaDeReunion => ({ etiqueta: titulo, titulo, resumen: `Lo de ${titulo}.`, cobertura: [], fecha, en: fecha, corridaId: "r" });
    const h = historiaDeLasSesiones({
      lecturas: { "meet:m1": lectura("Cemaco | Sales Hub", "2026-10-20T15:00:00.000Z"), "meet:m2": lectura("Cemaco | Operación", "2026-10-21T15:00:00.000Z") },
      sesiones: [
        { id: "s-a", reunion: { id: "m1", origen: "meet" }, equipo: "marketing" },
        { id: "s-b", reunion: { id: "m2", origen: "meet" } },
      ],
      automaticas: false,
      fuera: [],
      notas: {},
      proximaId: null,
    });
    expect(h.sesiones.map((s) => s.equipo)).toEqual(["marketing", null]);
    const texto = textoDeLasSesiones(h);
    expect(texto).toContain("«Cemaco | Sales Hub» · con Marketing");
    expect(texto).toContain("«Cemaco | Operación» · con la empresa entera (sin equipo elegido)");
  });
});

describe("K11 · «Qué explorar en la próxima sesión» por el equipo de esa sesión", () => {
  const e = estadoDePrueba({}, { areas: ["1", "2"] });
  const sugerir = (equipo: Parameters<typeof queExplorar>[0]["equipo"]) => {
    const posiciones = posicionesDelMapa(e, []);
    return queExplorar({
      escala: ESCALA,
      areas: e.areas,
      posiciones,
      chequeo: chequeoDelMapa(ESCALA, e.areas, posiciones),
      ahora: null,
      anterior: null,
      aExplorar: {},
      nombreDeNivel: (l) => l,
      equipo,
      max: 10,
    });
  };

  it("con Marketing, solo lo de Marketing; con la empresa entera o un equipo sin área, todas las áreas", () => {
    expect(new Set(sugerir("marketing").map((x) => x.areaId))).toEqual(new Set(["2"]));
    expect(new Set(sugerir(null).map((x) => x.areaId))).toEqual(new Set(["1", "2"]));
    expect(new Set(sugerir("financiero").map((x) => x.areaId))).toEqual(new Set(["1", "2"]));
  });

  it("si el área del equipo no está en juego, no deja la lista vacía", () => {
    expect(areasDeLaProxima(ESCALA, ["1"], "marketing").map((a) => a.id)).toEqual(["1"]);
    expect(areasDeLaProxima(ESCALA, ["1", "2"], "servicio").map((a) => a.id)).toEqual(["1", "2"]);
  });
});

describe("K11 · la guía sigue sugiriendo sesiones por equipo aunque ya haya una", () => {
  const conSesiones = (sesiones: NonNullable<ReturnType<typeof estadoDePrueba>["contenido"]["sesiones"]>) => {
    const estado = estadoDePrueba({}, {});
    return contextoDeLaGuia({
      empresa: "Larce",
      industria: null,
      estado: { ...estado, contenido: { ...estado.contenido, sesiones } },
      escala: ESCALA_DE_PRUEBA,
      posiciones: {},
      pendientes: [],
      agenda: [],
      conTest: false,
      hoy: "2026-10-26",
    });
  };

  it("con una sesión de Ventas ya planeada, la próxima con la empresa entera sugiere las que faltan, sin Ventas", () => {
    const ctx = conSesiones([
      { id: "s-ventas", fecha: "2026-10-20", hecha: true, equipo: "ventas" },
      { id: "s-prox", fecha: "2026-10-30" },
    ]);
    expect(ctx.sugerirSesionesPorEquipo).toBe(true);
    expect(ctx.equiposYaConSesion).toEqual(["ventas"]);
    const pedido = pedidoDeLaGuia(ctx);
    const texto = String(pedido.messages[0].content);
    expect(texto).toContain("Ya tienen su sesión (planeada o hecha): Ventas. No las sugieras de nuevo.");
    const herramienta = pedido.tools?.[0] as { input_schema: { properties: Record<string, { items?: { properties: { equipo: { enum: string[] } } } }> } };
    expect(herramienta.input_schema.properties.sesionesPorEquipo?.items?.properties.equipo.enum).not.toContain("ventas");
  });

  it("una sesión que no se hizo no cuenta como sesión de su equipo", () => {
    const ctx = conSesiones([
      { id: "s-ventas", fecha: "2026-10-20", equipo: "ventas", resultado: "noSeHizo" },
      { id: "s-prox", fecha: "2026-10-30" },
    ]);
    expect(ctx.sugerirSesionesPorEquipo).toBe(true);
    expect(ctx.equiposYaConSesion).toBeUndefined();
  });
});
