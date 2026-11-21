/**
 * Lo que sabe el equipo pesa en el Resumen de La escala (21 nov, ./notas-del-equipo.ts): la nota se guarda con quién y
 * cuándo, entra al agente como una fuente N1 de más peso que las reuniones, su cita se verifica con la regla de siempre y
 * adentro dice «lo dijo <persona> del equipo». Y los hitos de la escala solo se escriben en un lugar, sin update ni delete.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type Validez } from "./contenido";
import { leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import { notasComoFuentes, quienLaEscribio, reunionesDeVerdad } from "./notas-del-equipo";
import { citaVerificada, pedidoDelResumen, type ContextoDelResumen, type ReunionParaElResumen } from "./resumen-de-la-escala";
import { piezasDeLaPagina, textoDeLasPiezas } from "./impacto-en-la-escala";

const VALIDEZ: Validez = { dimensiones: new Set(["1.1"]), criterios: new Set(), areas: new Set(["1"]), ediciones: new Set(), escalaVersion: "9.3.0" };
const estado = (): EstadoDeExploracion => ({
  contenido: contenidoVacio(),
  propuesta: propuestaVacia(),
  areas: ["1"],
  edicion: null,
  perfilCierre: "con equipo",
  perfilDespues: "continua",
  responsableEmail: null,
  archivada: false,
});

describe("la nota se guarda con quién y cuándo", () => {
  it("una de «Lo que sabes» deja su autor; editarla lo actualiza; quitarla lo borra", () => {
    const a = aplicarOperaciones(estado(), [{ op: "nota", paso: "sabido:mi0abcde123", texto: "Pierden 40 mil al mes" }], VALIDEZ, VALIDADOR_ESTRICTO, { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" });
    if (!a.ok) throw new Error(a.error);
    expect(a.estado.contenido.autoresDeLasNotas).toEqual({ "sabido:mi0abcde123": { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" } });
    // Guardar el mismo texto no cambia el autor.
    const b = aplicarOperaciones(a.estado, [{ op: "nota", paso: "sabido:mi0abcde123", texto: "Pierden 40 mil al mes" }], VALIDEZ, VALIDADOR_ESTRICTO, { por: "marco@smarteamcr.com", en: "2026-11-22T10:00:00Z" });
    if (!b.ok) throw new Error(b.error);
    expect(b.estado.contenido.autoresDeLasNotas?.["sabido:mi0abcde123"].por).toBe("liz@smarteamcr.com");
    const c = aplicarOperaciones(b.estado, [{ op: "nota", paso: "sabido:mi0abcde123", texto: "" }], VALIDEZ, VALIDADOR_ESTRICTO, { por: "liz@smarteamcr.com", en: "2026-11-23T10:00:00Z" });
    if (!c.ok) throw new Error(c.error);
    expect(c.estado.contenido.autoresDeLasNotas).toEqual({});
  });

  it("una nota que no es del equipo (las de sesión) no deja autor", () => {
    const a = aplicarOperaciones(estado(), [{ op: "nota", paso: "sesion:s-1", texto: "x" }], VALIDEZ, VALIDADOR_ESTRICTO, { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" });
    if (!a.ok) throw new Error(a.error);
    expect(a.estado.contenido.autoresDeLasNotas).toBeUndefined();
  });

  it("se lee del Json, solo de las notas que siguen", () => {
    const c = leerContenido({
      notas: { "sabido:mi0abcde123": "Pierden 40 mil" },
      autoresDeLasNotas: { "sabido:mi0abcde123": { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" }, "sabido:otra": { por: "x", en: "y" }, mal: 3 },
    });
    expect(Object.keys(c.autoresDeLasNotas ?? {})).toEqual(["sabido:mi0abcde123"]);
  });
});

const nombreDe = (c: string) => (c === "liz@smarteamcr.com" ? "Liz Flores" : null);

describe("la nota como fuente del Resumen", () => {
  const notas = notasComoFuentes(
    { "sabido:mi0abcde123": "El gerente nos confirmó que pierden 40 mil dólares al mes en cartera vencida.\nNo usan Excel para cobrar.", "r1-test": "no es del equipo" },
    { "sabido:mi0abcde123": { por: "liz@smarteamcr.com", en: "2026-11-21T10:00:00Z" } },
    nombreDe,
  );

  it("una fuente N1 por nota del equipo, un turno por renglón, con quién la escribió", () => {
    expect(notas).toHaveLength(1);
    expect(notas[0]).toMatchObject({ clave: "N1", id: "nota:sabido:mi0abcde123", areaId: null, delCliente: ["Liz Flores"], delEquipo: { nombre: "Liz Flores", en: "2026-11-21T10:00:00Z" } });
    expect(notas[0].turnos.map((t) => t.n)).toEqual([1, 2]);
    expect(quienLaEscribio(undefined, nombreDe)).toBe("Alguien del equipo");
  });

  it("su cita se verifica palabra por palabra y lleva el rótulo del equipo", () => {
    const c = citaVerificada({ reunion: "N1", turno: 1, texto: "pierden 40 mil dólares al mes en cartera vencida" }, notas);
    expect(c).toMatchObject({ reunion: "nota:sabido:mi0abcde123", delEquipo: { nombre: "Liz Flores" } });
    // Lo que la nota no dice no pasa.
    expect(citaVerificada({ reunion: "N1", turno: 1, texto: "pierden 90 mil dólares al mes en cartera" }, notas)).toBeNull();
  });

  it("el pedido pone las notas aparte, antes de las reuniones, y dice que pesan más", () => {
    const reunion: ReunionParaElResumen = { id: "s1", clave: "R1", fecha: "2026-11-10T15:00:00Z", equipo: "Ventas", areaId: "1", turnos: [{ n: 1, hablante: "Ana", texto: "Vendemos a crédito a 800 clientes" }], delCliente: ["Ana"] };
    const ctx: ContextoDelResumen = { empresa: "Cemaco", areas: [], reuniones: [reunion, ...notas], instrucciones: "" };
    const p = pedidoDelResumen(ctx);
    const texto = String((p.messages[0] as { content: string }).content);
    const enNotas = texto.indexOf("Lo que CONFIRMÓ el equipo");
    const enReuniones = texto.indexOf("Las reuniones de diagnóstico");
    expect(enNotas).toBeGreaterThan(-1);
    expect(enNotas).toBeLessThan(enReuniones);
    expect(texto).toContain("### N1 · 2026-11-21 · nota del equipo (la escribió Liz Flores)");
    // La nota no aparece entre las reuniones.
    expect(texto.slice(enReuniones)).not.toContain("### N1");
    expect(String(p.system)).toContain("PESAN MÁS que las reuniones");
  });
});

describe("una nota no es una sesión", () => {
  it("no va a las reuniones de la corrida, y sola no alcanza para armar el Resumen", () => {
    const notas = notasComoFuentes({ "sabido:mi0abcde123": "Pierden 40 mil al mes en cartera" }, undefined, () => null);
    const reunion = { id: "s1", delEquipo: undefined };
    expect(reunionesDeVerdad([reunion, ...notas]).map((r) => r.id)).toEqual(["s1"]);
    expect(reunionesDeVerdad(notas)).toEqual([]);
  });
  it("el servidor del Resumen usa esa regla para las dos cosas", () => {
    const s = readFileSync("lib/exploraciones/resumen-de-la-escala-server.ts", "utf8");
    expect(s).toMatch(/if \(!reunionesDeVerdad\(le\.ctx\.reuniones\)\.length\) return/);
    expect(s).toMatch(/sourceSessionIds: reunionesDeVerdad\(le\.ctx\.reuniones\)\.map/);
  });
});

describe("las piezas de la página que lee el agente de impacto", () => {
  it("sin Resumen armado, ninguna", () => {
    expect(piezasDeLaPagina(null)).toEqual([]);
  });
  it("el texto de lo que se vio respeta su tope", () => {
    const piezas = Array.from({ length: 200 }, (_, i) => ({ parte: "Ventas", texto: `Reto ${i} con un texto de largo medio para llenar` }));
    expect(textoDeLasPiezas(piezas).length).toBeLessThanOrEqual(4000);
  });
});

describe("los hitos de la escala se escriben en un solo lugar y nunca se reescriben", () => {
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (n === "node_modules" || n.startsWith(".")) return [];
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
    });
  it("solo hitos-de-la-escala-server.ts escribe, y sin update ni delete", () => {
    const quienEscribe = [...archivos("lib"), ...archivos("app"), ...archivos("scripts")].filter((f) => /hitoDeLaEscala\.(create|update|upsert|delete)/.test(readFileSync(f, "utf8")));
    expect(quienEscribe.map((f) => f.replace(/\\/g, "/"))).toEqual(["lib/exploraciones/hitos-de-la-escala-server.ts"]);
    const s = readFileSync("lib/exploraciones/hitos-de-la-escala-server.ts", "utf8");
    expect(s).not.toMatch(/hitoDeLaEscala\.(update|upsert|delete)/);
  });
});
