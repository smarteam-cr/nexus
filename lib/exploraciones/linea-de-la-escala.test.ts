/**
 * lib/exploraciones/linea-de-la-escala.test.ts — la línea de arriba de La escala (24 nov; Elías: «lo único que hay que
 * entender es si alguna parte tiene que actualizarse»): una frase y el botón de siempre, «Ubicar con las reuniones».
 */
import { describe, expect, it } from "vitest";
import { lineaDeLaReunion } from "@/components/exploraciones/ReunionesMalLeidas";
import { diaConAnio, diaCorto } from "./fechas";
import { cortadasQueSeLeenEnteras, lineaDeLaEscala, malLeidasParaMostrar, type ReunionDeLaLinea } from "./linea-de-la-escala";

const meet = (fecha: string, o: Partial<ReunionDeLaLinea> = {}): ReunionDeLaLinea => ({ fecha, origen: "meet", texto: "transcripcion", ...o });
const UBICADA = "2026-11-17T18:00:00.000Z";
const ANTES = [meet("2026-11-05T16:00:00.000Z"), meet("2026-11-10T16:00:00.000Z"), meet("2026-11-12T16:00:00.000Z")];

const linea = (o: Partial<Parameters<typeof lineaDeLaEscala>[0]> = {}) => lineaDeLaEscala({ reuniones: ANTES, ubicadaEn: UBICADA, resumenEn: null, ubicando: false, ...o });

describe("la línea de arriba de La escala", () => {
  it("al día: cuándo se ubicó y con cuántas reuniones, con el botón quieto", () => {
    const l = linea();
    expect(l.estado).toBe("alDia");
    expect(l.texto).toBe(`Ubicada el ${diaCorto(UBICADA)} con 3 reuniones · al día.`);
    expect(l.boton).toEqual({ etiqueta: "Volver a ubicar con las reuniones", fuerte: false });
  });

  it("⛔ una respuesta que «Ubicar» no leyó: ya no está al día, puede cambiar un nivel (25 nov)", () => {
    const l = linea({ notasSinUbicar: { total: 1, respuestas: 1 } });
    expect(l.estado).toBe("nuevas");
    // No dice «nueva»: después del deploy, una nota de octubre nunca se leyó, pero no es nueva.
    expect(l.texto).toBe("Hay 1 respuesta que todavía no se usó para ubicar la escala: puede cambiar un nivel.");
    // El mismo nombre que el botón del aviso de arriba, que hace lo mismo.
    expect(l.boton).toEqual({ etiqueta: "Volver a ubicar con las reuniones", fuerte: true });
    expect(linea({ notasSinUbicar: { total: 2, respuestas: 1 } }).texto).toBe("Hay 2 notas que todavía no se usaron para ubicar la escala: pueden cambiar un nivel.");
    // Con reuniones nuevas, las dos cosas.
    expect(linea({ reuniones: [...ANTES, meet("2026-11-21T15:00:00.000Z")], notasSinUbicar: { total: 1, respuestas: 1 } }).texto).toBe(
      `Hay 1 reunión nueva desde que se ubicó la escala, el ${diaCorto(UBICADA)}, y 1 respuesta que todavía no se usó para ubicarla.`,
    );
    // Sin notas, como siempre; y sin haber ubicado nunca, la frase de siempre (al ubicar las lee).
    expect(linea({ notasSinUbicar: { total: 0, respuestas: 0 } }).estado).toBe("alDia");
    expect(linea({ ubicadaEn: null, notasSinUbicar: { total: 1, respuestas: 1 } }).estado).toBe("sinUbicar");
  });

  it("una reunión de después de ubicarla: lo dice y el botón es «Actualizar»", () => {
    const l = linea({ reuniones: [...ANTES, meet("2026-11-21T15:00:00.000Z")] });
    expect(l.estado).toBe("nuevas");
    expect(l.texto).toBe(`Hay 1 reunión nueva desde que se ubicó la escala, el ${diaCorto(UBICADA)}.`);
    expect(l.boton).toEqual({ etiqueta: "Actualizar", fuerte: true });
    expect(linea({ reuniones: [...ANTES, meet("2026-11-21T15:00:00.000Z"), meet("2026-11-22T15:00:00.000Z")] }).texto).toMatch(/^Hay 2 reuniones nuevas/);
  });

  it("solo cuentan las que «Ubicar» lee: sin texto, cortadas, de puertas adentro o de HubSpot no son nuevas", () => {
    const despues = "2026-11-21T15:00:00.000Z";
    const noCuentan = [meet(despues, { texto: "nada" }), meet(despues, { corta: { minutos: 2 } }), meet(despues, { puertasAdentro: true }), meet(despues, { origen: "hubspot" })];
    expect(linea({ reuniones: [...ANTES, ...noCuentan] }).estado).toBe("alDia");
    // Solo las notas de Gemini sí se leen.
    expect(linea({ reuniones: [...ANTES, meet(despues, { texto: "notas" })] }).estado).toBe("nuevas");
  });

  it("dice con cuántas se ubicó como mucho las que lee (las 4 más nuevas)", () => {
    const seis = Array.from({ length: 6 }, (_, i) => meet(`2026-11-0${i + 1}T16:00:00.000Z`));
    expect(linea({ reuniones: seis }).texto).toContain("con 4 reuniones");
    expect(linea({ reuniones: [ANTES[0]] }).texto).toContain("con 1 reunión ·");
  });

  it("nunca ubicada: con reuniones, el botón fuerte; sin ninguna, que no hay qué leer", () => {
    const conReuniones = linea({ ubicadaEn: null });
    expect(conReuniones.estado).toBe("sinUbicar");
    expect(conReuniones.texto).toBe("La escala todavía no se ubicó con las reuniones: hay 3 reuniones para leer.");
    expect(conReuniones.boton).toEqual({ etiqueta: "Ubicar con las reuniones", fuerte: true });
    const sin = linea({ ubicadaEn: null, reuniones: [] });
    expect(sin.estado).toBe("sinReuniones");
    expect(sin.boton.fuerte).toBe(false);
  });

  it("la escala al día pero el Resumen de antes de una reunión: lo dice sin un segundo botón", () => {
    const resumenEn = "2026-11-11T12:00:00.000Z";
    const l = linea({ resumenEn });
    expect(l.estado).toBe("resumenAtrasado");
    expect(l.texto).toBe("La escala está al día, pero el Resumen se armó antes de la última reunión.");
    expect(l.boton.fuerte).toBe(false);
    // Lo de la escala va primero: con reuniones nuevas para ubicar, eso es lo que dice.
    expect(linea({ resumenEn, reuniones: [...ANTES, meet("2026-11-21T15:00:00.000Z")] }).estado).toBe("nuevas");
    // Un Resumen armado después de la última reunión no está atrasado.
    expect(linea({ resumenEn: "2026-11-21T12:00:00.000Z" }).estado).toBe("alDia");
  });

  it("mientras Nexus ubica la escala, lo dice y el botón espera (otro trabajo del agente no cambia la frase: PasoEscala)", () => {
    const l = linea({ ubicando: true, reuniones: [...ANTES, meet("2026-11-21T15:00:00.000Z")] });
    expect(l.estado).toBe("ubicando");
    expect(l.boton).toEqual({ etiqueta: "Ubicando…", fuerte: false });
  });

  it("lo que leyó la corrida manda: cuántas leyó, y una transcripción que llegó después de ubicar es nueva aunque la reunión sea de antes", () => {
    const leida = meet("2026-11-10T16:00:00.000Z", { titulo: "Diagnóstico de Ventas" });
    const tarde = meet("2026-11-12T16:00:00.000Z", { titulo: "Diagnóstico de Servicio" });
    const leyo = [`Reunión del ${diaConAnio(leida.fecha)}: Diagnóstico de Ventas`, "La empresa en HubSpot", "Contactos en HubSpot"];
    const l = linea({ reuniones: [leida, tarde], leyo });
    expect(l.estado).toBe("nuevas");
    expect(l.texto).toMatch(/^Hay 1 reunión nueva/);
    // Leídas las dos, al día, y dice cuántas leyó (no las fuentes que no son reuniones).
    const ambas = [...leyo, `Reunión del ${diaConAnio(tarde.fecha)}: Diagnóstico de Servicio`];
    expect(linea({ reuniones: [leida, tarde], leyo: ambas }).texto).toBe(`Ubicada el ${diaCorto(UBICADA)} con 2 reuniones · al día.`);
    // Leída solo con las notas de Gemini: al día mientras no llegue su transcripción; cuando llega, es nueva.
    const conNotas = [...leyo, `Reunión del ${diaConAnio(tarde.fecha)} (solo las notas de Gemini): Diagnóstico de Servicio`];
    expect(linea({ reuniones: [leida, { ...tarde, texto: "notas" }], leyo: conNotas }).estado).toBe("alDia");
    expect(linea({ reuniones: [leida, tarde], leyo: conNotas }).estado).toBe("nuevas");
    // El título se compara entero: «Diagnóstico» no es «Diagnóstico de Ventas» del mismo día.
    const corta = meet("2026-11-10T16:00:00.000Z", { titulo: "Diagnóstico" });
    expect(linea({ reuniones: [leida, corta], leyo }).estado).toBe("nuevas");
    // Una reunión más vieja que las que lee no cuenta como nueva: volver a ubicar tampoco la leería.
    const viejas = Array.from({ length: 5 }, (_, i) => meet(`2026-11-0${i + 1}T16:00:00.000Z`, { titulo: `R${i + 1}` }));
    const leyoLasNuevas = viejas.slice(1).map((r) => `Reunión del ${diaConAnio(r.fecha)}: ${r.titulo}`);
    expect(linea({ reuniones: viejas, leyo: leyoLasNuevas }).estado).toBe("alDia");
  });
});

describe("las reuniones que el Resumen leyó cortadas o casi sin la empresa (24 nov)", () => {
  const CORTADA = { reunion: "gmeet_1", fecha: "2026-11-06T20:00:00.000Z", titulo: "DIAGNÓSTICO DE VENTAS", motivos: ["recortada" as const], leido: 86, delCliente: 55 };
  const DEMO = { reunion: "gmeet_2", fecha: "2026-11-19T15:15:00.000Z", titulo: "DEMO", motivos: ["poco-del-cliente" as const], leido: 100, delCliente: 26 };
  const DE_ANTES = { malLeidas: [CORTADA, DEMO] };

  it("un Resumen de antes de leerlas enteras: la línea dice cuántas leyó cortadas y que rehacerlo las lee enteras", () => {
    expect(cortadasQueSeLeenEnteras(DE_ANTES)).toBe(1);
    const l = linea({ resumenEn: "2026-11-24T14:49:00.000Z", cortadas: 1 });
    expect(l.estado).toBe("resumenAtrasado");
    expect(l.texto).toBe("La escala está al día, pero el Resumen leyó cortada 1 reunión larga.");
    expect(linea({ resumenEn: "2026-11-11T14:49:00.000Z", cortadas: 3 }).texto).toBe(
      "La escala está al día, pero el Resumen se armó antes de la última reunión y leyó cortadas 3 reuniones largas.",
    );
    // Sin Resumen no hay nada que rehacer.
    expect(linea({ resumenEn: null, cortadas: 2 }).estado).toBe("alDia");
  });

  it("⛔ uno armado ya leyéndolas enteras no pide rehacer: una cortada era más larga que el tope", () => {
    expect(cortadasQueSeLeenEnteras({ ...DE_ANTES, leidasEnteras: true })).toBe(0);
    expect(cortadasQueSeLeenEnteras(null)).toBe(0);
  });

  it("la nota de La escala no repite lo que dice la línea, y lo que no tiene arreglo queda como nota", () => {
    // Antes de leerlas enteras: la cortada la arregla rehacer (la dice la línea); la demo queda en la nota.
    expect(malLeidasParaMostrar([CORTADA, DEMO], false).map((m) => m.reunion)).toEqual(["gmeet_2"]);
    // Con el Resumen ya leído entero, una cortada era más larga que el tope: queda en la nota.
    expect(malLeidasParaMostrar([CORTADA, DEMO], true).map((m) => m.reunion)).toEqual(["gmeet_1", "gmeet_2"]);
    // Cada una es una línea gris, sin botón (Elías eligió «Una línea gris, sin botón»).
    expect(lineaDeLaReunion(DEMO)).toBe(
      `La reunión del ${diaCorto(DEMO.fecha)} («DEMO») la presentamos nosotros (la empresa dijo el 26 % de lo dicho): lo que dijimos entra solo como cifra por confirmar.`,
    );
    expect(lineaDeLaReunion(CORTADA, true)).toMatch(/^Esta reunión es más larga de lo que el Resumen alcanza a leer y se leyó el 86 %/);
    // Una con los dos motivos pierde solo el que arregla rehacer.
    expect(malLeidasParaMostrar([{ ...DEMO, motivos: ["recortada", "poco-del-cliente"] }], false)[0].motivos).toEqual(["poco-del-cliente"]);
  });
});
