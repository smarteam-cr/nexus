/**
 * Quién dijo lo que un hecho le lleva a un documento del cliente, y la preventa como destino de un prospecto
 * (2026-11-20, «Arreglar primero» antes de que una nota deje hechos). Medido en 21 reuniones reales: de 48 hechos que
 * iban a documentos del cliente, 28 tenían solo una cita de Smarteam.
 */
import { describe, expect, it } from "vitest";
import { lineaDeAlcance } from "@/lib/asistente/alcance";
import { rutear, type ContextoDelRuteo } from "./enrutador";
import { huellaDeHecho } from "./hechos/salida";
import type { HechoVerificado, TipoDeHecho } from "./hechos/tipos";
import { novedadesPorPieza, type HechoParaNovedades } from "./novedades";
import { avisoParaElChat, quienLoDijo, rotuloDeQuienLoDijo } from "./quien-lo-dijo";

const AHORA = new Date("2026-10-10T15:00:00.000Z");

function guardado(o: Partial<HechoParaNovedades> = {}): HechoParaNovedades {
  return {
    id: "h1",
    tipo: "resultado",
    tema: null,
    frase: "El cliente quiere medir las conversiones por marca.",
    cita: "podamos ver segmentado y atribuido lo que son las sesiones de web por marca",
    huella: "resultado||conversiones-marca",
    estado: "pendiente",
    createdAt: new Date(+AHORA - 86_400_000),
    fechaDeLaReunion: new Date(+AHORA - 86_400_000),
    destinos: [{ clave: "kickoff.metricas_exito", estado: "pendiente" }],
    projectId: "p1",
    sessionId: "s1",
    reunionTitulo: "Presentación del diagnóstico",
    citaFuente: "transcripcion",
    quien: "cliente",
    ...o,
  };
}

describe("quién lo dijo", () => {
  it("del cliente solo con su turno comprobado en la transcripción; si no, Smarteam o sin comprobar", () => {
    expect(quienLoDijo({ quien: "cliente", citaFuente: "transcripcion" })).toBe("cliente");
    expect(quienLoDijo({ quien: "smarteam", citaFuente: "transcripcion" })).toBe("smarteam");
    // `quien` se guarda null cuando no lo comprobó el turno; una cita de las notas de Gemini no es palabra de nadie.
    expect(quienLoDijo({ quien: null, citaFuente: "transcripcion" })).toBe("sin_comprobar");
    expect(quienLoDijo({ quien: "cliente", citaFuente: "notas" })).toBe("sin_comprobar");
    expect(quienLoDijo({})).toBe("sin_comprobar");
  });

  it("el rótulo: «Lo dijo Smarteam», o nada si lo dijo el cliente", () => {
    expect(rotuloDeQuienLoDijo("cliente")).toBeNull();
    expect(rotuloDeQuienLoDijo("smarteam")).toBe("Lo dijo Smarteam");
    expect(rotuloDeQuienLoDijo("sin_comprobar")).toBe("No se comprobó quién lo dijo");
  });

  it("⛔ la novedad de un documento lleva quién lo dijo", () => {
    const delCliente = novedadesPorPieza([guardado()], ["kickoff"], AHORA).kickoff.items[0];
    expect(delCliente.quienLoDijo).toBe("cliente");
    const deSmarteam = novedadesPorPieza([guardado({ quien: "smarteam" })], ["kickoff"], AHORA).kickoff.items[0];
    expect(deSmarteam.quienLoDijo).toBe("smarteam");
  });

  it("⛔ el chat del documento recibe que no lo dijo el cliente, y no la escribe como algo que el cliente quiere", () => {
    const seccion = (q?: "cliente" | "smarteam" | "sin_comprobar") => ({
      key: "metricas_exito",
      label: "Cómo mediremos el éxito",
      novedad: { pieza: "kickoff", hechoIds: ["h1"], frase: "Medir conversiones por marca.", cita: "por marca", reunion: "Diagnóstico", fecha: "2026-10-09", ...(q ? { quienLoDijo: q } : {}) },
    });
    expect(lineaDeAlcance(seccion("smarteam"))).toContain("Esto lo dijo Smarteam, no el cliente");
    // Sin el dato (un hilo viejo), como si no se supiera.
    expect(lineaDeAlcance(seccion())).toContain("No se comprobó quién lo dijo");
    expect(lineaDeAlcance(seccion("cliente"))).not.toContain("no el cliente");
    // El aviso va dentro del bloque: nunca una línea en blanco (cerraría el bloque antes de tiempo).
    for (const q of ["smarteam", "sin_comprobar"] as const) expect(avisoParaElChat(q)).not.toContain("\n\n");
    const linea = lineaDeAlcance(seccion("smarteam"));
    expect(linea.indexOf("\n\n")).toBe(linea.length - 2);
  });
});

/* ── La preventa, destino de un prospecto ───────────────────────────────────────────── */

function hecho(tipo: TipoDeHecho): HechoVerificado {
  const frase = `Un hecho de tipo ${tipo} con palabras propias`;
  return {
    tipo,
    ...(tipo === "acuerdo" ? { tema: "alcance" as const } : {}),
    frase,
    cita: "una cita que aparece en la reunión",
    ambito: "cuenta",
    quien: "cliente",
    projectId: null,
    huella: huellaDeHecho(tipo, tipo === "acuerdo" ? "alcance" : undefined, frase),
    fuenteDeLaCita: "transcripcion",
    hablante: "Mariana Pérez",
    quienComprobado: true,
  };
}

const PROSPECTO: ContextoDelRuteo = {
  kind: "PROSPECTO",
  puertasAdentro: false,
  preventaViva: true,
  laPreventaLaLee: true,
  proyectosVinculados: new Set(),
  proyectosQueAlimentanElAvance: new Set(),
  hechosAbiertosPorHuella: new Map(),
};

describe("la preventa como destino", () => {
  it("lo de la cuenta, la gente, lo que busca, lo acordado y lo que frena de un prospecto va a la preventa que lee la reunión", () => {
    const tipos: TipoDeHecho[] = ["cuenta", "persona", "resultado", "acuerdo", "riesgo", "queja"];
    const r = rutear(tipos.map(hecho), PROSPECTO);
    for (let i = 0; i < tipos.length; i++) expect(r.porHecho[i].destinos.map((d) => d.clave), tipos[i]).toEqual(["preventa"]);
    // La ficha la propone la preventa: los hechos no la proponen (como antes).
    expect(r.acciones.ficha).toEqual([]);
  });

  it("lo de cómo trabajan hoy sigue yendo a Procesos (no a la preventa)", () => {
    expect(rutear([hecho("proceso_hoy")], PROSPECTO).porHecho[0].destinos.map((d) => d.clave)).toEqual(["procesos"]);
  });

  it("⛔ si la preventa no lee la reunión, no va a la preventa: queda en la tarjeta, como antes", () => {
    const r = rutear([hecho("resultado")], { ...PROSPECTO, laPreventaLaLee: false });
    expect(r.porHecho[0].destinos).toEqual([]);
  });

  it("⛔ un cliente nunca la tiene como destino, aunque se diga que la lee", () => {
    const r = rutear([hecho("cuenta")], { ...PROSPECTO, kind: "CLIENTE", preventaViva: false });
    expect(r.porHecho[0].destinos.map((d) => d.clave)).toEqual(["ficha"]);
  });
});

describe("el mismo hecho en dos reuniones", () => {
  it("⛔ si una vez lo dijo el cliente, la novedad es del cliente aunque la última vez lo repitiera Smarteam", () => {
    const viejo = guardado({ id: "h-viejo", quien: "cliente", fechaDeLaReunion: new Date(+AHORA - 5 * 86_400_000), createdAt: new Date(+AHORA - 5 * 86_400_000), cita: "queremos medir por marca" });
    const nuevo = guardado({ id: "h-nuevo", quien: "smarteam", cita: "como dijeron, medir por marca" });
    const n = novedadesPorPieza([nuevo, viejo], ["kickoff"], AHORA).kickoff.items[0];
    expect(n).toMatchObject({ hechoId: "h-viejo", quienLoDijo: "cliente", cita: "queremos medir por marca", mismos: ["h-nuevo"] });
  });

  it("si ninguna lo dijo el cliente, la más reciente (como antes)", () => {
    const viejo = guardado({ id: "h-viejo", quien: "smarteam", fechaDeLaReunion: new Date(+AHORA - 5 * 86_400_000), createdAt: new Date(+AHORA - 5 * 86_400_000) });
    const nuevo = guardado({ id: "h-nuevo", quien: null });
    expect(novedadesPorPieza([viejo, nuevo], ["kickoff"], AHORA).kickoff.items[0]).toMatchObject({ hechoId: "h-nuevo", quienLoDijo: "sin_comprobar" });
  });
});
