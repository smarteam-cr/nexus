/**
 * lib/exploraciones/asociar.test.ts — K5: qué reunión es la de cada sesión planeada, y cuándo se une sola (2026-10-27).
 * Correr: `npx vitest run lib/exploraciones/asociar.test.ts --project unit`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { huellaDelLienzo, sesionesLibres, sugerirAsociaciones, tituloCalza, tituloDeExploracion, type EntradaDeAsociar, type ReunionCandidata } from "./asociar";
import { pestanasDeSesiones, type SesionPlaneada } from "./guia";
import { aplicarOperaciones, contenidoVacio, operacionesDeLaPantalla, propuestaVacia, VALIDADOR_LIBRE, type EstadoDeExploracion, type Validez } from "./contenido";
import { leerContenido } from "./esquemas";

const AHORA = Date.parse("2026-10-27T18:00:00Z");
const HOY = "2026-10-27";
const INTERNOS = new Set(["smarteamcr.com"]);

const reunion = (id: string, titulo: string, fecha: string, gente = ["ana@cemaco.com", "liz@smarteamcr.com"]): ReunionCandidata => ({ id, titulo, fecha, participantes: gente });

function entrada(sesiones: SesionPlaneada[], candidatas: ReunionCandidata[], o: Partial<EntradaDeAsociar> = {}): EntradaDeAsociar {
  return {
    pestanas: pestanasDeSesiones(sesiones, [], HOY),
    candidatas,
    fuera: new Set(),
    descartadas: new Set(),
    internos: INTERNOS,
    dominiosDeLaEmpresa: ["cemaco.com"],
    customerSuccess: new Set(["lili@smarteamcr.com"]),
    enOtraExploracion: new Set(),
    ahora: AHORA,
    ...o,
  };
}

const marketing: SesionPlaneada = { id: "s-mkt", equipo: "marketing" };
const tecnologia: SesionPlaneada = { id: "s-tec", equipo: "tecnologia" };

describe("K5 · la pregunta «¿Es la sesión 2 con Marketing?»", () => {
  it("una reunión de marketing con la empresa calza con la sesión de Marketing y, sin duda, se une sola", () => {
    const r = sugerirAsociaciones(entrada([{ id: "s-1", hecha: true }, marketing], [reunion("m1", "Sesión de Marketing · Cemaco", "2026-10-26T15:00:00Z")]));
    expect(r).toHaveLength(1);
    expect(r[0].sesion?.id).toBe("s-mkt");
    expect(r[0].pregunta).toBe("¿Es la sesión 2 con Marketing?");
    expect(r[0].senales).toContain("equipo");
    expect(r[0].sola).toBe(true);
    expect(r[0].dudas).toEqual([]);
  });

  it("con reuniones recientes de Customer Success, pregunta en vez de unirla", () => {
    const cs = reunion("cs1", "Seguimiento semanal", "2026-10-20T15:00:00Z", ["ana@cemaco.com", "lili@smarteamcr.com"]);
    const [s] = sugerirAsociaciones(entrada([marketing], [reunion("m1", "Marketing Cemaco", "2026-10-26T15:00:00Z"), cs]));
    expect(s.sesion?.id).toBe("s-mkt");
    expect(s.sola).toBe(false);
    expect(s.dudas.join(" ")).toMatch(/Customer Success/);
  });

  it("con un título que no dice exploración ni el nombre de la sesión (calza solo por la fecha), pregunta", () => {
    const [s] = sugerirAsociaciones(entrada([{ id: "s-2", fecha: "2026-10-25" }], [reunion("m1", "Cemaco y Smarteam", "2026-10-26T15:00:00Z")]));
    expect(s.senales).toEqual(["fecha"]);
    expect(s.sola).toBe(false);
    expect(s.dudas.join(" ")).toMatch(/no dice exploración/);
  });

  it("dos reuniones para la misma sesión: las dos dudan", () => {
    const r = sugerirAsociaciones(entrada([marketing], [reunion("m1", "Marketing parte 1", "2026-10-22T15:00:00Z"), reunion("m2", "Marketing parte 2", "2026-10-26T15:00:00Z")]));
    // Una sesión, a lo más una pregunta: la más reciente se queda con la sesión; la otra no tiene a cuál ir.
    expect(r).toHaveLength(1);
    expect(r[0].reunion.id).toBe("m2");
    expect(r[0].sola).toBe(false);
    expect(r[0].dudas.join(" ")).toMatch(/Otra reunión/);
  });

  it("una reunión que calza con una sesión ya tomada por otra reunión duda, aunque le quede otra libre (no se une sola a la genérica)", () => {
    const r = sugerirAsociaciones(
      entrada([marketing, { id: "s-gen" }], [reunion("m1", "Marketing", "2026-10-26T15:00:00Z"), reunion("m2", "Exploración Marketing", "2026-10-25T15:00:00Z")]),
    );
    const segunda = r.find((x) => x.reunion.id === "m2")!;
    expect(segunda.sesion?.id).toBe("s-gen");
    expect(segunda.sola).toBe(false);
    expect(segunda.dudas.join(" ")).toMatch(/más de una sesión/);
  });

  it("una reunión de marketing no calza con la sesión de Tecnología, aunque la fecha se acerque", () => {
    const r = sugerirAsociaciones(entrada([{ ...tecnologia, fecha: "2026-10-26" }], [reunion("m1", "Pauta y campañas de marketing", "2026-10-26T15:00:00Z")]));
    expect(r).toEqual([]);
  });

  it("sin sesión planeada pero con título de exploración: «¿Es una sesión de la exploración?», nunca sola", () => {
    const [s] = sugerirAsociaciones(entrada([], [reunion("m1", "Exploración de procesos · Cemaco", "2026-10-26T15:00:00Z")]));
    expect(s.sesion).toBeNull();
    expect(s.sola).toBe(false);
  });

  it("no sugiere lo de puertas adentro, lo sacado, lo descartado, lo viejo ni lo que ya es de una sesión", () => {
    const libre = { id: "s-x", titulo: "Diagnóstico comercial" };
    const ligada: SesionPlaneada = { id: "s-y", reunion: { origen: "meet", id: "ya" } };
    const pestanas = pestanasDeSesiones([libre, ligada], [{ id: "ya", titulo: "Diagnóstico comercial", fecha: "2026-10-25T15:00:00Z", origen: "meet", leida: false }], HOY);
    const r = sugerirAsociaciones({
      ...entrada([], []),
      pestanas,
      candidatas: [
        reunion("adentro", "Diagnóstico comercial", "2026-10-26T15:00:00Z", ["liz@smarteamcr.com", "marco@smarteamcr.com"]),
        reunion("fuera", "Diagnóstico comercial", "2026-10-26T15:00:00Z"),
        reunion("no", "Diagnóstico comercial", "2026-10-26T15:00:00Z"),
        reunion("vieja", "Diagnóstico comercial", "2026-09-01T15:00:00Z"),
        reunion("ya", "Diagnóstico comercial", "2026-10-25T15:00:00Z"),
      ],
      fuera: new Set(["meet:fuera"]),
      descartadas: new Set(["meet:no"]),
    });
    expect(r).toEqual([]);
  });

  it("sin nadie de un dominio registrado de la empresa, o si ya es sesión de otra exploración, pregunta", () => {
    const sinDominio = sugerirAsociaciones(entrada([marketing], [reunion("m1", "Marketing", "2026-10-26T15:00:00Z", ["ana@gmail.com", "liz@smarteamcr.com"])]));
    expect(sinDominio[0].sola).toBe(false);
    const enOtra = sugerirAsociaciones(entrada([marketing], [reunion("m1", "Marketing", "2026-10-26T15:00:00Z")], { enOtraExploracion: new Set(["m1"]) }));
    expect(enOtra[0].sola).toBe(false);
    expect(enOtra[0].dudas.join(" ")).toMatch(/otra exploración/);
  });

  it("una sesión unida a un evento del calendario que sigue en pie no espera otra reunión (le llega por el evento)", () => {
    const conEvento: SesionPlaneada = { id: "s-e", equipo: "marketing", evento: { id: "ev1", calendario: "liz@smarteamcr.com", inicio: "2026-10-29T15:00:00Z" } };
    expect(sesionesLibres(pestanasDeSesiones([conEvento], [], HOY))).toEqual([]);
    expect(sesionesLibres(pestanasDeSesiones([{ ...conEvento, evento: { ...conEvento.evento!, cancelada: true } }], [], HOY))).toHaveLength(1);
  });

  it("los títulos: exploración y el nombre de la sesión", () => {
    expect(tituloDeExploracion("Revisión de Diagnóstico de Rendimiento")).toBe(true);
    expect(tituloDeExploracion("Kickoff Cemaco")).toBe(false);
    expect(tituloCalza("Tecnología y datos", "Cemaco | Tecnología y datos (Data Hub)")).toBe(true);
    expect(tituloCalza("Tecnología y datos", "Cemaco | Tecnología")).toBe(false);
    expect(tituloCalza("Sesión 3", "Sesión 3 con Cemaco")).toBe(false);
  });

  it("la huella cambia cuando entra o se lee una reunión, y no por el orden", () => {
    const a = huellaDelLienzo({ version: 3, actualizadaEn: "x", reuniones: [{ origen: "meet", id: "1" }, { origen: "meet", id: "2" }] });
    expect(huellaDelLienzo({ version: 3, actualizadaEn: "x", reuniones: [{ origen: "meet", id: "2" }, { origen: "meet", id: "1" }] })).toBe(a);
    expect(huellaDelLienzo({ version: 3, actualizadaEn: "x", reuniones: [{ origen: "meet", id: "1" }, { origen: "meet", id: "2", leida: true }] })).not.toBe(a);
  });
});

describe("K5 · «No» y la marca de Nexus", () => {
  const validez: Validez = { dimensiones: new Set(), criterios: new Set(), areas: new Set(), ediciones: new Set(), perfilesHabituales: {}, escalaVersion: "1" };
  const estado = (): EstadoDeExploracion => ({ contenido: contenidoVacio(), propuesta: propuestaVacia(), areas: [], edicion: null, perfilCierre: null, perfilDespues: null, responsableEmail: null, archivada: false });

  it("«No» guarda la reunión como descartada, sin repetirla, y se vuelve a leer", () => {
    const r = aplicarOperaciones(estado(), [{ op: "descartarAsociacion", claves: ["meet:m1"] }, { op: "descartarAsociacion", claves: ["meet:m1", "meet:m2"] }], validez, VALIDADOR_LIBRE);
    expect(r.ok && r.estado.contenido.asociacionesDescartadas).toEqual(["meet:m1", "meet:m2"]);
    expect(leerContenido(r.ok ? r.estado.contenido : null).asociacionesDescartadas).toEqual(["meet:m1", "meet:m2"]);
  });

  it("una sesión con la marca `asociadaSola` se lee igual (el esquema la acepta)", () => {
    const c = leerContenido({ sesiones: [{ id: "s-1", reunion: { origen: "meet", id: "m1" }, fecha: "2026-10-26", asociadaSola: "2026-10-27T15:00:00.000Z" }] });
    expect(c.sesiones[0].asociadaSola).toBe("2026-10-27T15:00:00.000Z");
  });

  it("⛔ el servidor lee las reuniones SOLO por el chokepoint y no escribe matching reunión→cliente", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "lib/exploraciones/asociar-server.ts"), "utf8");
    expect(src).toContain("getClientSessions(");
    expect(src).not.toMatch(/firefliesSession\.|sessionProject\./);
    // De categorize.ts solo los dominios de Smarteam: nada del resolver de cliente.
    expect(src).not.toMatch(/categorizeSession|resolveClient|computeAmbiguousNameTokens|titleMatch/);
    const puro = fs.readFileSync(path.join(process.cwd(), "lib/exploraciones/asociar.ts"), "utf8");
    expect(puro).not.toMatch(/from "@\/lib\/db|from "@\/lib\/sessions\/project-sources"/);
  });
});

describe("K5 · lo que escribe el job: asociarSola, sobre la fila de ahora", () => {
  const validez: Validez = { dimensiones: new Set(), criterios: new Set(), areas: new Set(), ediciones: new Set(), perfilesHabituales: {}, escalaVersion: "1" };
  const con = (contenido: Partial<EstadoDeExploracion["contenido"]>): EstadoDeExploracion => ({
    contenido: { ...contenidoVacio(), ...contenido },
    propuesta: propuestaVacia(),
    areas: [],
    edicion: null,
    perfilCierre: null,
    perfilDespues: null,
    responsableEmail: null,
    archivada: false,
  });
  const op = { op: "asociarSola" as const, sesionId: "s-mkt", reunionId: "m1", fecha: "2026-10-26", en: "2026-10-27T18:00:00.000Z" };
  const sesionDe = (e: EstadoDeExploracion) => aplicarOperaciones(e, [op], validez, VALIDADOR_LIBRE);

  it("une la sesión libre con el día de la reunión y la marca, y conserva su evento cancelado", () => {
    const evento = { id: "ev", calendario: "liz@smarteamcr.com", inicio: "2026-10-20T15:00:00Z", cancelada: true as const };
    const r = sesionDe(con({ sesiones: [{ id: "s-mkt", equipo: "marketing", evento }] }));
    expect(r.ok && r.estado.contenido.sesiones[0]).toMatchObject({ reunion: { origen: "meet", id: "m1" }, fecha: "2026-10-26", asociadaSola: op.en, evento });
  });

  it("no hace nada si llegó un «No», si la sacaron, si la sesión ya tiene reunión o si la reunión ya es de otra sesión", () => {
    const casos = [
      con({ sesiones: [{ id: "s-mkt" }], asociacionesDescartadas: ["meet:m1"] }),
      con({ sesiones: [{ id: "s-mkt" }], fuera: ["meet:m1"] }),
      con({ sesiones: [{ id: "s-mkt", reunion: { origen: "meet", id: "otra" } }] }),
      con({ sesiones: [{ id: "s-mkt" }, { id: "s-2", reunion: { origen: "meet", id: "m1" } }] }),
      con({ sesiones: [{ id: "s-mkt", resultado: "noSeHizo" }] }),
      con({ sesiones: [] }),
    ];
    for (const e of casos) {
      const r = sesionDe(e);
      expect(r.ok && r.estado).toBe(e);
    }
  });

  it("la pantalla no puede mandarla: es solo del servidor", () => {
    expect(operacionesDeLaPantalla(con({ sesiones: [{ id: "s-mkt" }] }), [op]).ok).toBe(false);
  });
});
