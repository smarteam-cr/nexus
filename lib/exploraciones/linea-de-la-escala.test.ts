/**
 * lib/exploraciones/linea-de-la-escala.test.ts — la línea de arriba de La escala (24 nov; Elías: «lo único que hay que
 * entender es si alguna parte tiene que actualizarse»): una frase y el botón de siempre, «Ubicar con las reuniones».
 */
import { describe, expect, it } from "vitest";
import { diaConAnio, diaCorto } from "./fechas";
import { lineaDeLaEscala, type ReunionDeLaLinea } from "./linea-de-la-escala";

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
    expect(l.texto).toBe("La escala está al día, pero el Resumen se armó antes de la última reunión: rehazlo con IA en el Resumen.");
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
