/**
 * lib/exploraciones/guion-y-calidad.test.ts — el guion de las dos reuniones, la industria sugerida y
 * «lista para proponer».
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/hubspot/client", () => ({ getSystemHubspotClient: async () => ({}), forceRefreshSystemToken: async () => {} }));

import { calcularChequeo, type AreaParaChequeo } from "@/lib/escala/chequeo";
import type { Letra } from "@/lib/escala/documento/tipos";
import { listaParaProponer, queSigue, queSigueConPaso, siguientePasoVigente } from "./calidad";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion } from "./contenido";
import { aFecha, diaConAnio, diaCorto } from "./fechas";
import { esDeLaEmpresa } from "./hubspot";
import { agendadasQueYaPasaron, agendaRenovada, debeLeerSola, PASADAS_QUE_CONSERVA_LA_FOTO, reunionesDeHubspotQueYaPasaron } from "./lectura";
import { calcularMetricas } from "./metricas";
import { industriaLegible, sugerirEdicion } from "./industria";
import { claveDeNotaDePregunta, claveDeNotaDeSesion, MAX_CLAVE_DE_NOTA, rotuloDeLaNota } from "./notas-de-sesion";
import { minutosPara, REUNIONES } from "./sesion";

describe("el guion", () => {
  it("cada reunión suma su duración de referencia", () => {
    for (const r of REUNIONES) expect(r.pasos.reduce((s, p) => s + p.minutos, 0), r.id).toBe(r.duracion);
  });

  it("la primera dura 30 y no tiene producto: el test prometió que no es una llamada de ventas", () => {
    const r1 = REUNIONES.find((r) => r.id === "revision")!;
    expect(r1.duracion).toBe(30);
    expect(r1.pasos.some((p) => p.llena.includes("producto"))).toBe(false);
  });

  it("el producto, en la segunda, es opcional y de cinco minutos como máximo", () => {
    const p = REUNIONES.find((r) => r.id === "fondo")!.pasos.find((x) => x.llena.includes("producto"))!;
    expect(p.opcional).toBe(true);
    expect(p.minutos).toBeLessThanOrEqual(5);
  });

  it("los ids de los pasos no se repiten (son la clave de la nota rápida)", () => {
    const ids = REUNIONES.flatMap((r) => r.pasos.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("con otra duración los minutos se ajustan en la misma proporción, nunca a cero", () => {
    const r1 = REUNIONES[0];
    expect(minutosPara(r1, 60)).toEqual(r1.pasos.map((p) => p.minutos * 2));
    expect(minutosPara(r1, 5).every((m) => m >= 1)).toBe(true);
  });
});

describe("la industria sugerida", () => {
  const todas = ["ecommerce-retail", "banca", "educacion", "inmobiliaria"];

  it("los códigos de HubSpot, viejos y nuevos, y la etiqueta en español del test", () => {
    expect(sugerirEdicion("RETAIL", todas)).toBe("ecommerce-retail");
    expect(sugerirEdicion("BANKING_MORTGAGE", todas)).toBe("banca");
    expect(sugerirEdicion("FINANCIAL_SERVICES", todas)).toBe("banca");
    expect(sugerirEdicion("HIGHER_EDUCATION_ACADEMIA", todas)).toBe("educacion");
    expect(sugerirEdicion("COMMERCIAL_REAL_ESTATE", todas)).toBe("inmobiliaria");
    expect(sugerirEdicion("Bienes raíces", todas)).toBe("inmobiliaria");
    expect(sugerirEdicion("Educación", todas)).toBe("educacion");
  });

  it("el software es software: escala general", () => {
    expect(sugerirEdicion("COMPUTER_SOFTWARE", todas)).toBeNull();
    expect(sugerirEdicion("COMPUTER_SOFTWARE_ENGINEERING", todas)).toBeNull();
  });

  it("solo sugiere ediciones que la escala publicada trae", () => {
    expect(sugerirEdicion("RETAIL", ["banca"])).toBeNull();
  });

  it("el código se lee como texto", () => {
    expect(industriaLegible("COMPUTER_SOFTWARE")).toBe("Computer software");
    expect(industriaLegible("Banca")).toBe("Banca");
  });
});

function area(): AreaParaChequeo {
  return {
    id: "1",
    nombre: "Ventas",
    dimensiones: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      id: `1.${n}`,
      nombre: `D${n}`,
      capa: n <= 4 ? ("base" as const) : ("produccion" as const),
      aplica: true,
    })),
    orden: { base: null, produccion: null },
  };
}

const chequeoCon = (letras: string) =>
  calcularChequeo(
    [area()],
    Object.fromEntries([...letras].map((l, i) => [`1.${i + 1}`, { nivel: l as Letra }])),
  );

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

describe("lista para proponer el land", () => {
  it("vacía: ninguno de los siete", () => {
    const puntos = listaParaProponer(estado(), chequeoCon("FFFIIII"));
    expect(puntos).toHaveLength(7);
    expect(puntos.filter((p) => p.cumplido).map((p) => p.id)).toEqual(["frena"]);
    expect(listaParaProponer(estado(), chequeoCon("FFFFFFF")).some((p) => p.cumplido)).toBe(false);
  });

  it("completa: los siete, sin la escala entera (Elías, 2026-10-05: el land no pide las 8 dimensiones)", () => {
    const e = estado({
      contenido: {
        ...contenidoVacio(),
        chequeo: { "1.4": { nivel: "I", fuente: "reunion" } },
        casillas: {
          metas: [{ que: "Cerrar más", objetivo: "7 de cada 10" }],
          tiempos: ["Lo necesitan antes de marzo"],
          presupuesto: "Entre 15 y 20 mil dólares",
          autoridad: [{ nombre: "Ana", rol: "firma" }],
          consecuencias: ["Siguen perdiendo 3 de cada 10"],
          siguientePaso: { que: "Presentar la propuesta", fecha: "2026-10-08" },
        },
      },
    });
    // Una sola dimensión dicha por el cliente, debajo de Funcional: alcanza para saber qué frena.
    const una = calcularChequeo([area()], { "1.4": { nivel: "I" as Letra } });
    expect(una.completo).toBe(false);
    expect(listaParaProponer(e, una, "2026-10-05").every((p) => p.cumplido)).toBe(true);
    expect(queSigue(e, una, [], "2026-10-05")).toMatch(/Lista para proponer el land/);
  });

  it("un siguiente paso que ya pasó no cuenta: hay que agendar otro (CreditForce, 2026-10-07)", () => {
    const e = estado({ contenido: { ...contenidoVacio(), casillas: { siguientePaso: { que: "Revisión", fecha: "2026-09-28" } } } });
    expect(listaParaProponer(e, chequeoCon("FFFIIII"), "2026-10-07").find((p) => p.id === "siguientePaso")!.cumplido).toBe(false);
    expect(listaParaProponer(e, chequeoCon("FFFIIII"), "2026-09-28").find((p) => p.id === "siguientePaso")!.cumplido).toBe(true);
    expect(siguientePasoVigente({ fecha: "2026-10-08" }, "2026-10-07")).toBe(true);
    expect(siguientePasoVigente(undefined, "2026-10-07")).toBe(false);
  });

  it("saber qué frena pide una dimensión DEBAJO de Funcional: todo en Funcional no dice qué vender", () => {
    expect(listaParaProponer(estado(), chequeoCon("FFFFFFFF")).find((p) => p.id === "frena")!.cumplido).toBe(false);
    expect(listaParaProponer(estado({ areas: [] }), chequeoCon("IIIIIIII")).find((p) => p.id === "frena")!.cumplido).toBe(false);
  });

  it("una meta sin número no cuenta como «en cifras»", () => {
    const e = estado({ contenido: { ...contenidoVacio(), casillas: { metas: [{ que: "Vender más" }] } } });
    expect(listaParaProponer(e, chequeoCon("FFFFFFFF")).find((p) => p.id === "meta")!.cumplido).toBe(false);
  });

  it("qué sigue va en el orden del proceso: perfil, áreas, la primera reunión, qué frena, la meta", () => {
    expect(queSigue(estado({ perfilCierre: null }), chequeoCon("FFFFFFFF"))).toMatch(/perfil/);
    expect(queSigue(estado({ areas: [] }), chequeoCon("FFFFFFFF"))).toMatch(/áreas/);
    // Sin nada que haya dicho el cliente, lo que toca es la primera reunión, con la guía.
    expect(queSigueConPaso(estado(), chequeoCon("FFFFFFF"))).toMatchObject({ paso: "exploracion", texto: expect.stringMatching(/^Haz la primera reunión/) });
    const conEvidencia = estado({ contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "reunion" } } } });
    expect(queSigueConPaso(conEvidencia, chequeoCon("FFFFFFF"))).toMatchObject({ paso: "escala", texto: expect.stringMatching(/^Falta saber qué frena al equipo del land/) });
    expect(queSigue(conEvidencia, chequeoCon("FFFIIIII"))).toMatch(/meta en cifras/);
    // Una reunión sin leer va antes que todo lo que se llena con ella.
    const sinLeer = [{ id: "s1", titulo: "Revisión del diagnóstico", fecha: "2026-10-01T15:00:00.000Z", origen: "meet" as const }];
    expect(queSigue(estado(), chequeoCon("FFFFFFF"), sinLeer)).toBe("Hay una reunión sin leer («Revisión del diagnóstico», 1 oct): pídele al agente que la lea.");
    expect(queSigue(estado(), chequeoCon("FFFFFFF"), [...sinLeer, { ...sinLeer[0], id: "s2" }])).toMatch(/^Hay 2 reuniones sin leer/);
  });

  it("las hipótesis de nivel no son «para revisar»: son el mapa, y se confirman en la reunión", () => {
    const hipotesis = {
      id: "nivel:1.3:x",
      destino: { tipo: "nivel" as const, dimensionId: "1.3" },
      valor: { nivel: "I", fuente: "hipotesis", porQue: "Las notas dicen que cada vendedor lleva su Excel" },
      fuentes: [{ id: "H1", etiqueta: "Nota" }],
      corridaId: "r",
      en: "2026-10-01T00:00:00.000Z",
    };
    const e = estado({ propuesta: { ...propuestaVacia(), items: [hipotesis] } });
    expect(queSigue(e, chequeoCon("FFFFFFF"))).not.toMatch(/Revisa lo que sugirió/);
  });
});

describe("fechas en la hora de Costa Rica", () => {
  it("una fecha sin hora es ese día, no el anterior (la medianoche UTC ya es el día de antes en Costa Rica)", () => {
    expect(diaCorto("2026-09-26")).toMatch(/^26 sept/);
    expect(aFecha("2026-09-26").toISOString()).toBe("2026-09-26T18:00:00.000Z");
  });

  it("una llamada de las 8 de la noche es de ese día aunque en UTC ya sea el siguiente", () => {
    // 2026-09-21T02:00Z = 20 de septiembre, 8 p. m. en Costa Rica.
    expect(diaConAnio(Date.parse("2026-09-21T02:00:00.000Z"))).toMatch(/^20 sept/);
  });
});

describe("cuándo el agente lee solo una reunión", () => {
  const AHORA = new Date("2026-10-10T18:00:00.000Z");
  const ALTA = new Date("2026-10-01T15:00:00.000Z");
  const base = { creadaEn: ALTA, sesionId: "s1", leidas: [] as string[], ahora: AHORA };

  it("una reunión de después del alta, reciente y sin leer: sí", () => {
    expect(debeLeerSola({ ...base, fechaDeLaReunion: new Date("2026-10-08T15:00:00.000Z") })).toBe(true);
  });

  it("no: si ya se leyó, si es de antes del alta (la vio al preparar), si tiene más de dos semanas o si todavía no pasó", () => {
    expect(debeLeerSola({ ...base, leidas: ["s1"], fechaDeLaReunion: new Date("2026-10-08T15:00:00.000Z") })).toBe(false);
    expect(debeLeerSola({ ...base, fechaDeLaReunion: new Date("2026-09-30T15:00:00.000Z") })).toBe(false);
    expect(debeLeerSola({ ...base, creadaEn: new Date("2026-09-01T00:00:00.000Z"), fechaDeLaReunion: new Date("2026-09-20T15:00:00.000Z") })).toBe(false);
    expect(debeLeerSola({ ...base, fechaDeLaReunion: new Date("2026-10-11T15:00:00.000Z") })).toBe(false);
  });
});

describe("las reuniones de HubSpot que ya pasaron sin leer", () => {
  const AHORA = new Date("2026-10-10T18:00:00.000Z");
  const agenda = [
    { id: "h1", titulo: "Revisión del diagnóstico", inicio: "2026-10-02T15:00:00.000Z" },
    { id: "h2", titulo: "Exploración a fondo", inicio: "2026-10-08T15:00:00.000Z" },
    { id: "h3", titulo: "Presentación de la propuesta", inicio: "2026-10-15T15:00:00.000Z" },
  ];

  it("las que ya pasaron y no se leyeron; la futura no", () => {
    expect(agendadasQueYaPasaron(agenda, ["h1"], [], AHORA).map((r) => r.id)).toEqual(["h2"]);
  });

  it("la que también está en Meet cuenta una vez: la de Meet, que trae la transcripción", () => {
    expect(agendadasQueYaPasaron(agenda, [], [{ fecha: "2026-10-08T15:05:00.000Z" }], AHORA).map((r) => r.id)).toEqual(["h1"]);
  });

  it("las que ya pasaron se listan LEÍDAS o no: la leída se ve leída, no desaparece (Elías, 2026-10-05)", () => {
    expect(reunionesDeHubspotQueYaPasaron(agenda, ["h1"], [], AHORA).map((r) => [r.id, r.leida])).toEqual([
      ["h1", true],
      ["h2", false],
    ]);
  });
});

describe("⛔ la foto nueva conserva las reuniones de HubSpot que ya pasaron (Elías, 2026-10-05)", () => {
  // El 10 de octubre se vuelve a preparar: HubSpot solo da como agenda la del 15.
  const AHORA = new Date("2026-10-10T18:00:00.000Z");
  const anterior = [
    { id: "h1", titulo: "Revisión del diagnóstico", inicio: "2026-10-02T15:00:00.000Z" },
    { id: "h2", titulo: "Exploración a fondo", inicio: "2026-10-08T15:00:00.000Z" },
    { id: "h4", titulo: "Una que se movió", inicio: "2026-10-12T15:00:00.000Z" },
  ];
  const nueva = [{ id: "h3", titulo: "Presentación de la propuesta", inicio: "2026-10-15T15:00:00.000Z" }];

  it("la que pasó sin resumen sigue «sin leer» después de volver a preparar; la leída queda leída", () => {
    const agenda = agendaRenovada({ anterior, nueva, ahora: AHORA });
    expect(agenda.map((a) => a.id), "h4 todavía no pasó y HubSpot ya no la trae: se canceló o se movió").toEqual(["h1", "h2", "h3"]);
    expect(agendadasQueYaPasaron(agenda, ["h1"], [], AHORA).map((r) => r.id)).toEqual(["h2"]);
    expect(reunionesDeHubspotQueYaPasaron(agenda, ["h1"], [], AHORA).find((r) => r.id === "h1")?.leida).toBe(true);
  });

  it("la que HubSpot dice que no ocurrió deja de avisarse; la que sigue agendada no se repite", () => {
    const agenda = agendaRenovada({
      anterior,
      nueva: [{ id: "h2", titulo: "Exploración a fondo (movida)", inicio: "2026-10-20T15:00:00.000Z" }],
      noOcurrieron: ["h1"],
      ahora: AHORA,
    });
    expect(agenda).toEqual([{ id: "h2", titulo: "Exploración a fondo (movida)", inicio: "2026-10-20T15:00:00.000Z" }]);
  });

  it("conserva las más recientes, con tope", () => {
    const muchas = Array.from({ length: PASADAS_QUE_CONSERVA_LA_FOTO + 5 }, (_, i) => ({
      id: `p${i}`,
      titulo: "Reunión",
      inicio: new Date(Date.parse("2026-06-01T15:00:00.000Z") + i * 86_400_000).toISOString(),
    }));
    const agenda = agendaRenovada({ anterior: muchas, nueva: [], ahora: AHORA });
    expect(agenda).toHaveLength(PASADAS_QUE_CONSERVA_LA_FOTO);
    expect(agenda.at(-1)?.id).toBe(`p${PASADAS_QUE_CONSERVA_LA_FOTO + 4}`);
  });
});

describe("la métrica", () => {
  const AHORA = new Date("2026-12-01T12:00:00.000Z");
  const todos = { dimensiones: true, meta: true, autoridad: true, consecuencia: true, portal: true, siguientePaso: true, noExplorado: true };
  const foto = (businessCaseId: string, en: string, puntos: Record<string, boolean>) => ({ businessCaseId, en, puntos });

  it("cuenta la última foto de cada propuesta de la ventana, sin las borradas", () => {
    const m = calcularMetricas(
      [
        foto("bc1", "2026-11-01T12:00:00.000Z", { ...todos, meta: false }),
        foto("bc1", "2026-11-05T12:00:00.000Z", todos), // la misma propuesta, armada otra vez: cuenta esta
        foto("bc2", "2026-11-10T12:00:00.000Z", { ...todos, siguientePaso: false }),
        foto("bc3", "2026-06-01T12:00:00.000Z", todos), // fuera de los 90 días
        foto("bc4", "2026-11-20T12:00:00.000Z", todos), // se borró la propuesta
      ],
      { ahora: AHORA, existen: new Set(["bc1", "bc2", "bc3"]), sinExploracion: 3 },
    );
    expect(m).toEqual({ propuestas: 2, conMeta: 2, listas: 1, conSiguientePaso: 1, sinExploracion: 3 });
  });
});

describe("la actividad que se lee por un contacto", () => {
  it("es de esta empresa si cuelga de ella, o de ninguna; la de otra empresa no entra", () => {
    expect(esDeLaEmpresa({ associations: { companyIds: [111, 999] } }, "999")).toBe(true);
    expect(esDeLaEmpresa({ associations: { companyIds: [] } }, "999")).toBe(true);
    expect(esDeLaEmpresa({}, "999")).toBe(true);
    expect(esDeLaEmpresa({ associations: { companyIds: [111] } }, "999")).toBe(false);
  });
});

describe("las notas del vendedor de cada sesión (pestaña «Durante», Elías 2026-10-05)", () => {
  const sesiones = [{ id: "s-uno", fecha: "2026-10-08", titulo: "Revisión del diagnóstico" }, { id: "s-dos" }];
  const dePaso = (id: string) => (id === "r1-conexion" ? "Revisión · Conexión" : null);

  it("la clave cabe en el registro de notas y la nota se nombra con su sesión", () => {
    expect(claveDeNotaDeSesion("s-" + "a".repeat(24)).length).toBeLessThanOrEqual(MAX_CLAVE_DE_NOTA);
    // La de una pregunta también, con lo más largo a lo que apunta (una tarjeta o un punto llevado).
    expect(claveDeNotaDePregunta("s-" + "a".repeat(24), "consecuencias").length).toBeLessThanOrEqual(MAX_CLAVE_DE_NOTA);
    expect(claveDeNotaDePregunta("s-" + "a".repeat(24), "abierto:" + "z".repeat(7)).length).toBeLessThanOrEqual(MAX_CLAVE_DE_NOTA);
    expect(rotuloDeLaNota(claveDeNotaDeSesion("s-uno"), sesiones, dePaso)).toBe("Notas del vendedor de la sesión 1 (8 oct, Revisión del diagnóstico)");
    expect(rotuloDeLaNota(claveDeNotaDeSesion("s-dos"), sesiones, dePaso)).toBe("Notas del vendedor de la sesión 2");
  });

  it("la nota de una pregunta se nombra con la pregunta: el agente sabe a qué respondió (2026-10-07)", () => {
    const preguntaDe = (_: string, para: string) => (para === "metas" ? "¿Qué quieren lograr este año?" : null);
    expect(rotuloDeLaNota(claveDeNotaDePregunta("s-uno", "metas"), sesiones, dePaso, preguntaDe)).toBe(
      "Notas del vendedor de la sesión 1 (8 oct, Revisión del diagnóstico), sobre lo que respondió el cliente a «¿Qué quieren lograr este año?»",
    );
    expect(rotuloDeLaNota(claveDeNotaDePregunta("s-dos", "1.3"), sesiones, dePaso, preguntaDe)).toBe("Notas del vendedor de la sesión 2, sobre lo que respondió el cliente a lo que apunta a 1.3");
  });

  it("una sesión borrada no se pierde, y las notas del guion viejo se siguen nombrando con su paso", () => {
    expect(rotuloDeLaNota(claveDeNotaDeSesion("s-tres"), sesiones, dePaso)).toMatch(/ya no está/);
    expect(rotuloDeLaNota("r1-conexion", sesiones, dePaso)).toBe("Revisión · Conexión");
  });
});
