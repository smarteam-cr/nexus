/**
 * lib/exploraciones/guion-y-calidad.test.ts — el guion de las dos reuniones, la industria sugerida y
 * «lista para proponer».
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/hubspot/client", () => ({ getSystemHubspotClient: async () => ({}), forceRefreshSystemToken: async () => {} }));

import { calcularChequeo, type AreaParaChequeo } from "@/lib/escala/chequeo";
import type { Letra } from "@/lib/escala/documento/tipos";
import { listaParaProponer, queSigue, queSigueConPaso } from "./calidad";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion } from "./contenido";
import { aFecha, diaConAnio, diaCorto } from "./fechas";
import { esDeLaEmpresa } from "./hubspot";
import { agendadasQueYaPasaron, debeLeerSola } from "./lectura";
import { calcularMetricas } from "./metricas";
import { industriaLegible, sugerirEdicion } from "./industria";
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

describe("lista para proponer", () => {
  it("vacía: ninguno de los siete, salvo lo no explorado (no hay nada pendiente)", () => {
    const puntos = listaParaProponer(estado(), chequeoCon("FFFIIIII".slice(0, 7)));
    expect(puntos).toHaveLength(7);
    expect(puntos.filter((p) => p.cumplido).map((p) => p.id)).toEqual(["noExplorado"]);
  });

  it("completa: los siete", () => {
    const e = estado({
      contenido: {
        ...contenidoVacio(),
        chequeo: { "1.1": { nivel: "F", fuente: "reunion" } },
        sinPortal: true,
        casillas: {
          metas: [{ que: "Cerrar más", objetivo: "7 de cada 10" }],
          autoridad: [
            { nombre: "Ana", rol: "firma" },
            { nombre: "Luis", rol: "afectado" },
          ],
          consecuencias: ["Siguen perdiendo 3 de cada 10"],
          siguientePaso: { que: "Presentar la propuesta", fecha: "2026-10-08" },
        },
      },
    });
    expect(listaParaProponer(e, chequeoCon("FFFIIIII")).every((p) => p.cumplido)).toBe(true);
    expect(queSigue(e, chequeoCon("FFFIIIII"))).toMatch(/Lista para proponer/);
  });

  it("una meta sin número no cuenta como «en cifras»", () => {
    const e = estado({ contenido: { ...contenidoVacio(), casillas: { metas: [{ que: "Vender más" }] } } });
    expect(listaParaProponer(e, chequeoCon("FFFFFFFF")).find((p) => p.id === "meta")!.cumplido).toBe(false);
  });

  it("qué sigue va en el orden del proceso: perfil, áreas, la primera reunión, las dimensiones, la meta", () => {
    expect(queSigue(estado({ perfilCierre: null }), chequeoCon("FFFFFFFF"))).toMatch(/perfil/);
    expect(queSigue(estado({ areas: [] }), chequeoCon("FFFFFFFF"))).toMatch(/áreas/);
    // Sin nada que haya dicho el cliente, lo que toca es la primera reunión, con la guía.
    expect(queSigueConPaso(estado(), chequeoCon("FFFFFFF"))).toMatchObject({ paso: "exploracion", texto: expect.stringMatching(/^Haz la primera reunión/) });
    const conEvidencia = estado({ contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "reunion" } } } });
    expect(queSigueConPaso(conEvidencia, chequeoCon("FFFFFFF"))).toMatchObject({ paso: "escala", texto: expect.stringMatching(/^Falta confirmar una dimensión/) });
    expect(queSigue(conEvidencia, chequeoCon("FFFFFFFF"))).toMatch(/meta en cifras/);
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
    expect(queSigue(e, chequeoCon("FFFFFFF"))).not.toMatch(/Revisa lo que propuso/);
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
