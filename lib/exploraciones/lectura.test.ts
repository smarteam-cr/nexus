/**
 * lib/exploraciones/lectura.test.ts — la exploración son sus sesiones (etapa A, 2026-10-09): qué reunión
 * entra sola en un prospecto, en qué exploraciones lee el agente solo una reunión nueva, y las reuniones
 * con solo notas de Gemini.
 * Correr: `npx vitest run lib/exploraciones/lectura.test.ts --project unit`.
 */
import { describe, expect, it, vi } from "vitest";

// motivoPorElTexto vive con la puerta de agregar (que lee la base): acá solo se prueba la regla pura.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { motivoPorElTexto } from "@/lib/sessions/agregar-sesion";
import {
  candidataAutomatica,
  coincideConElEvento,
  esInstanciaDeUnaSerie,
  exploracionesQueLeenLaReunion,
  hayQueLeerAlPreparar,
  hechasParaLeerSolas,
  reunionesDeHubspotParaElegir,
  sesionUnidaALaReunion,
  textoDeLasNotasDeGemini,
  type CorteDeLaPreventa,
  type ExploracionParaLeerSola,
} from "./lectura";

const AHORA = new Date("2026-10-09T18:00:00Z");
const HACE = (horas: number) => new Date(AHORA.getTime() - horas * 60 * 60 * 1000);
const INTERNOS = new Set(["smarteamcr.com"]);
const PROSPECTO: CorteDeLaPreventa = { desde: new Date("2026-09-01T00:00:00Z").getTime(), esProspecto: true, ventas: new Set() };

describe("las series", () => {
  it("una instancia de una serie se reconoce por el final de su id, con o sin hora", () => {
    expect(esInstanciaDeUnaSerie("abc_20261019T150000Z")).toBe(true);
    expect(esInstanciaDeUnaSerie("abc_20261019")).toBe(true);
    expect(esInstanciaDeUnaSerie("gmeet_abc_20261019T150000Z")).toBe(true);
    expect(esInstanciaDeUnaSerie("abc")).toBe(false);
    expect(esInstanciaDeUnaSerie("gmeet_abc")).toBe(false);
    expect(esInstanciaDeUnaSerie(null)).toBe(false);
  });
});

describe("qué reunión entra sola como sesión (solo en un prospecto)", () => {
  const conElCliente = { id: "gmeet_e1", date: HACE(48).getTime(), participants: ["ana@acme.com", "eli@smarteamcr.com"] };

  it("una reunión con la empresa entra sola", () => {
    expect(candidataAutomatica(conElCliente, { corte: PROSPECTO, internos: INTERNOS, fuera: new Set() })).toBe(true);
  });

  it("no entran las de puertas adentro, las de una serie ni las que alguien sacó", () => {
    const o = { corte: PROSPECTO, internos: INTERNOS, fuera: new Set<string>() };
    expect(candidataAutomatica({ ...conElCliente, participants: ["eli@smarteamcr.com", "ana@smarteamcr.com"] }, o)).toBe(false);
    expect(candidataAutomatica({ ...conElCliente, id: "gmeet_e1_20261005T150000Z" }, o)).toBe(false);
    expect(candidataAutomatica({ ...conElCliente, eventoId: "e1_20261005" }, o)).toBe(false);
    expect(candidataAutomatica(conElCliente, { ...o, fuera: new Set(["meet:gmeet_e1"]) })).toBe(false);
  });

  it("en un cliente nada entra solo", () => {
    expect(candidataAutomatica(conElCliente, { corte: { ...PROSPECTO, esProspecto: false }, internos: INTERNOS, fuera: new Set() })).toBe(false);
  });
});

describe("una sesión unida de forma explícita a su reunión", () => {
  it("por la reunión elegida, o por su evento (el googleEventId o la fila gmeet_<evento>)", () => {
    expect(coincideConElEvento("e1", { id: "gmeet_e1" })).toBe(true);
    expect(coincideConElEvento("e1", { id: "otro", eventoId: "e1" })).toBe(true);
    expect(coincideConElEvento("e1", { id: "gmeet_e2", eventoId: "e2" })).toBe(false);
    expect(sesionUnidaALaReunion({ reunion: { id: "gmeet_e1", origen: "meet" } }, { id: "gmeet_e1" })).toBe(true);
    expect(sesionUnidaALaReunion({ evento: { id: "e1" } }, { id: "gmeet_e1" })).toBe(true);
    expect(sesionUnidaALaReunion({ reunion: { id: "123", origen: "hubspot" } }, { id: "123" })).toBe(false);
    // La del mismo día no cuenta: una sesión con solo fecha no está unida.
    expect(sesionUnidaALaReunion({}, { id: "gmeet_e1" })).toBe(false);
  });

  it("la gemela de Meet de una reunión de HubSpot elegida: por la hora que guardó el servidor (sin ella, no se adivina)", () => {
    const deHubspot = { reunion: { id: "h1", origen: "hubspot", inicio: "2026-10-09T15:00:00.000Z" } };
    expect(sesionUnidaALaReunion(deHubspot, { id: "gmeet_x", fecha: new Date("2026-10-09T15:20:00Z") })).toBe(true);
    expect(sesionUnidaALaReunion(deHubspot, { id: "gmeet_x", fecha: "2026-10-09T19:00:00Z" })).toBe(false);
    expect(sesionUnidaALaReunion({ reunion: { id: "h1", origen: "hubspot" } }, { id: "gmeet_x", fecha: new Date("2026-10-09T15:20:00Z") })).toBe(false);
  });
});

describe("«Una que ya pasó» ofrece las reuniones de HubSpot de la preventa", () => {
  it("las de la agenda que ya pasaron y las leídas sin agenda; no las que todavía no ocurren; la más nueva primero", () => {
    const agenda = [
      { id: "h1", titulo: "Revisión", inicio: "2026-09-28T15:00:00.000Z" },
      { id: "h2", titulo: "Demo", inicio: "2026-10-20T15:00:00.000Z" },
    ];
    const lecturas = {
      "hubspot:h3": { etiqueta: "Reunión del 1 oct", fecha: "2026-10-01T15:00:00.000Z", titulo: "Seguimiento" },
      "meet:m1": { etiqueta: "Otra", fecha: "2026-10-02T15:00:00.000Z" },
    };
    expect(reunionesDeHubspotParaElegir(agenda, lecturas, [], AHORA)).toEqual([
      { id: "h3", titulo: "Seguimiento", inicio: "2026-10-01T15:00:00.000Z", leida: true },
      { id: "h1", titulo: "Revisión", inicio: "2026-09-28T15:00:00.000Z", leida: false },
    ]);
  });
});

describe("en qué exploraciones lee el agente solo una reunión que acaba de llegar", () => {
  const base: ExploracionParaLeerSola = {
    id: "x",
    delProyecto: false,
    esProspecto: false,
    creadaEn: HACE(24 * 5),
    sesiones: [],
    fuera: [],
    leidas: [],
    seVende: true,
  };
  const reunion = { id: "gmeet_e1", eventoId: "e1", fecha: HACE(2), participants: ["ana@acme.com", "eli@smarteamcr.com"] };
  const o = { ahora: AHORA, internos: INTERNOS };

  it("la de un proyecto, solo con la reunión unida (por evento o elegida); por fecha no", () => {
    const proyecto = { ...base, id: "p", delProyecto: true, seVende: false };
    expect(exploracionesQueLeenLaReunion([{ ...proyecto, sesiones: [{ evento: { id: "e1" } }] }], reunion, o)).toEqual(["p"]);
    expect(exploracionesQueLeenLaReunion([{ ...proyecto, sesiones: [{ reunion: { id: "gmeet_e1", origen: "meet" } }] }], reunion, o)).toEqual(["p"]);
    expect(exploracionesQueLeenLaReunion([proyecto], reunion, o)).toEqual([]);
    // La fecha del alta no limita a una sesión unida; una ya leída no se vuelve a leer.
    expect(exploracionesQueLeenLaReunion([{ ...proyecto, creadaEn: AHORA, sesiones: [{ evento: { id: "e1" } }] }], reunion, o)).toEqual(["p"]);
    expect(exploracionesQueLeenLaReunion([{ ...proyecto, sesiones: [{ evento: { id: "e1" } }], leidas: ["gmeet_e1"] }], reunion, o)).toEqual([]);
  });

  it("la preventa de un cliente, solo la unida (reemplaza al filtro de Ventas) y mientras se vende", () => {
    expect(exploracionesQueLeenLaReunion([base], reunion, o)).toEqual([]);
    expect(exploracionesQueLeenLaReunion([{ ...base, sesiones: [{ evento: { id: "e1" } }] }], reunion, o)).toEqual(["x"]);
    expect(exploracionesQueLeenLaReunion([{ ...base, sesiones: [{ evento: { id: "e1" } }], seVende: false }], reunion, o)).toEqual([]);
  });

  it("la preventa de un prospecto: la regla de siempre, sin las sacadas, las de puertas adentro ni las de una serie", () => {
    const prospecto = { ...base, esProspecto: true };
    expect(exploracionesQueLeenLaReunion([prospecto], reunion, o)).toEqual(["x"]);
    expect(exploracionesQueLeenLaReunion([{ ...prospecto, fuera: ["meet:gmeet_e1"] }], reunion, o)).toEqual([]);
    expect(exploracionesQueLeenLaReunion([prospecto], { ...reunion, participants: ["eli@smarteamcr.com"] }, o)).toEqual([]);
    expect(exploracionesQueLeenLaReunion([prospecto], { ...reunion, id: "gmeet_e1_20261009T160000Z", eventoId: "e1_20261009T160000Z" }, o)).toEqual([]);
    // De antes del alta, no (salvo que esté unida a una sesión).
    expect(exploracionesQueLeenLaReunion([{ ...prospecto, creadaEn: AHORA }], reunion, o)).toEqual([]);
    expect(exploracionesQueLeenLaReunion([{ ...prospecto, creadaEn: AHORA, sesiones: [{ evento: { id: "e1" } }] }], reunion, o)).toEqual(["x"]);
  });

  it("la gemela de Meet de una reunión de HubSpot unida se lee sola; una de puertas adentro a esa hora, no", () => {
    const unidaAHubspot = { ...base, delProyecto: true, sesiones: [{ reunion: { id: "h1", origen: "hubspot", inicio: HACE(2).toISOString() } }] };
    expect(exploracionesQueLeenLaReunion([unidaAHubspot], { ...reunion, eventoId: null, id: "gmeet_z" }, o)).toEqual(["x"]);
    expect(exploracionesQueLeenLaReunion([unidaAHubspot], { ...reunion, eventoId: null, id: "gmeet_z", participants: ["eli@smarteamcr.com"] }, o)).toEqual([]);
  });

  it("una reunión de hace más de dos semanas ya no se lee sola", () => {
    expect(exploracionesQueLeenLaReunion([{ ...base, delProyecto: true, sesiones: [{ evento: { id: "e1" } }] }], { ...reunion, fecha: HACE(24 * 20) }, o)).toEqual([]);
  });
});

describe("las de HubSpot que el agente lee solo (etapa A)", () => {
  const hechas = [
    { id: "unida", inicio: HACE(30).toISOString() },
    { id: "suelta", inicio: HACE(30).toISOString() },
  ];
  it("en la preventa de un cliente, solo las unidas a una sesión (aunque sean de antes del alta)", () => {
    expect(hechasParaLeerSolas(hechas, { creadaEn: AHORA, leidas: [], ahora: AHORA, ligadas: new Set(["unida"]) })).toEqual(["unida"]);
  });
  it("en un prospecto, sin las que alguien sacó", () => {
    expect(hechasParaLeerSolas(hechas, { creadaEn: HACE(24 * 5), leidas: [], ahora: AHORA, fuera: new Set(["hubspot:suelta"]) })).toEqual(["unida"]);
  });
});

describe("las reuniones con solo notas de Gemini", () => {
  it("se leen con su resumen, sus secciones y sus próximos pasos", () => {
    const texto = textoDeLasNotasDeGemini({
      overview: ["Revisaron el embudo.", "Quedó pendiente el ERP."],
      sections: [{ title: "Dolores", content: "Pierden leads." }, { title: "", content: "" }],
      action_items: ["Ana manda la base"],
    });
    expect(texto).toBe("Revisaron el embudo.\nQuedó pendiente el ERP.\n\nDolores:\nPierden leads.\n\nPróximos pasos:\nAna manda la base");
    expect(textoDeLasNotasDeGemini({ overview: "Solo el resumen." })).toBe("Solo el resumen.");
    expect(textoDeLasNotasDeGemini(null)).toBe("");
    expect(textoDeLasNotasDeGemini("texto suelto")).toBe("");
  });

  it("agregar una sesión que ya pasó: por defecto pide transcripción; «nada» acepta una sin texto; «algo», también las notas", () => {
    const sinNada = { transcript: null, summary: null };
    const conNotas = { transcript: "", summary: { overview: "x" } };
    expect(motivoPorElTexto("transcripcion", sinNada)).toMatch(/no tiene transcripción/);
    expect(motivoPorElTexto("transcripcion", conNotas)).toMatch(/no tiene transcripción/);
    expect(motivoPorElTexto("algo", conNotas)).toBeNull();
    expect(motivoPorElTexto("algo", sinNada)).toMatch(/ni notas de Gemini/);
    expect(motivoPorElTexto("nada", sinNada)).toBeNull();
    expect(motivoPorElTexto("transcripcion", { transcript: "Ana: hola", summary: null })).toBeNull();
  });

  it("al preparar, lo de antes que no es sesión y una reunión sin texto no piden leer", () => {
    expect(hayQueLeerAlPreparar([{ origen: "meet", leida: false, legado: true }])).toBe(false);
    expect(hayQueLeerAlPreparar([{ origen: "meet", leida: false, texto: "nada" }])).toBe(false);
    expect(hayQueLeerAlPreparar([{ origen: "meet", leida: false, texto: "notas" }])).toBe(true);
  });
});
