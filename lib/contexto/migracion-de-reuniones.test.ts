/**
 * lib/contexto/migracion-de-reuniones.test.ts — la regla vieja de los documentos y qué se migra (2026-10-10).
 * Correr: `npx vitest run lib/contexto/migracion-de-reuniones.test.ts --project unit`.
 *
 * Lo que no puede pasar sin que esto se ponga rojo: que se elija una reunión que alguien sacó (`false`), que se toque
 * un documento donde una persona ya eligió, que se elija una que todavía no ocurrió o de puertas adentro, que se elijan
 * más de las que el lector lee enteras, que una vacía ocupe uno de esos lugares, que se le migren reuniones a un
 * kickoff que nunca las leyó, o que la segunda corrida cambie algo (también después de que una persona deshizo).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MAX_ELEGIDAS_ENTERAS, tieneQueLeer } from "./documento";
import {
  DESDE_QUE_LEE_REUNIONES,
  MIGRADAS_POR_DOCUMENTO,
  claveDelDocumento,
  leerMarca,
  leiaConLaReglaVieja,
  leiaReunionesAlGenerarse,
  planDelDocumento,
  queLeiaConLaReglaVieja,
  reunionesQueSeCongelan,
  sumarALaMarca,
  type ReunionDeLaReglaVieja,
} from "./migracion-de-reuniones";

const AHORA = Date.parse("2026-10-10T15:00:00.000Z");
const DIA = 86_400_000;
const r = (id: string, diasAtras: number, afinado: boolean | null = null, conElCliente = true): ReunionDeLaReglaVieja => ({
  id,
  fecha: AHORA - diasAtras * DIA,
  conElCliente,
  afinado,
});

describe("la regla vieja (la del modo sugerido)", () => {
  it("entra la con el cliente sin tocar y la agregada; no la sacada, la de puertas adentro ni la futura", () => {
    expect(leiaConLaReglaVieja(r("a", 3), AHORA)).toBe(true);
    expect(leiaConLaReglaVieja(r("b", 3, true, false), AHORA)).toBe(true);
    expect(leiaConLaReglaVieja(r("c", 3, false), AHORA)).toBe(false);
    expect(leiaConLaReglaVieja(r("d", 3, null, false), AHORA)).toBe(false);
    expect(leiaConLaReglaVieja(r("e", -1), AHORA)).toBe(false);
  });

  it("la más reciente primero, y a igual fecha por id (siempre el mismo orden)", () => {
    const lista = [r("x", 9), r("b", 2), r("a", 2), r("y", 5)];
    expect(queLeiaConLaReglaVieja(lista, AHORA).map((x) => x.id)).toEqual(["a", "b", "y", "x"]);
  });
});

describe("el plan de un documento", () => {
  it("elige las MIGRADAS_POR_DOCUMENTO más recientes; el resto queda para sugerir", () => {
    expect(MIGRADAS_POR_DOCUMENTO).toBe(MAX_ELEGIDAS_ENTERAS);
    const lista = Array.from({ length: 9 }, (_, i) => r(`m${i}`, i + 1));
    const p = planDelDocumento(lista, AHORA);
    expect(p.leia).toHaveLength(9);
    expect(p.aElegir.map((x) => x.id)).toEqual(["m0", "m1", "m2", "m3", "m4", "m5"]);
    expect(p.paraSugerir.map((x) => x.id)).toEqual(["m6", "m7", "m8"]);
    expect(p.yaTeniaElegidas).toBe(false);
  });

  it("nunca elige una que alguien sacó, una de puertas adentro ni una que no ocurrió", () => {
    const p = planDelDocumento([r("sacada", 1, false), r("interna", 2, null, false), r("futura", -3), r("buena", 4)], AHORA);
    expect(p.aElegir.map((x) => x.id)).toEqual(["buena"]);
  });

  it("si una persona ya eligió en el documento, no toca nada (tampoco la que está fuera por el piso)", () => {
    const conElegida = planDelDocumento([r("elegida", 10, true), r("libre", 1)], AHORA);
    expect(conElegida).toMatchObject({ aElegir: [], paraSugerir: [], yaTeniaElegidas: true });
    const fueraDelPiso = planDelDocumento([r("libre", 1)], AHORA, { hayElegidasFueraDeLaLista: true });
    expect(fueraDelPiso.aElegir).toEqual([]);
  });

  it("correrlo dos veces no cambia nada la segunda", () => {
    const lista = Array.from({ length: 8 }, (_, i) => r(`m${i}`, i + 1));
    const primera = planDelDocumento(lista, AHORA);
    const elegidas = new Set(primera.aElegir.map((x) => x.id));
    const despues = lista.map((x) => (elegidas.has(x.id) ? { ...x, afinado: true } : x));
    expect(planDelDocumento(despues, AHORA).aElegir).toEqual([]);
  });

  it("sin reuniones con el cliente, nada", () => {
    expect(planDelDocumento([r("i", 2, null, false)], AHORA).aElegir).toEqual([]);
  });

  it("una vacía no ocupa uno de los 6 lugares: se elige la siguiente con algo que leer, como el lector nuevo", () => {
    const lista = Array.from({ length: 8 }, (_, i) => ({ ...r(`m${i}`, i + 1), tieneQueLeer: i !== 2 }));
    const p = planDelDocumento(lista, AHORA);
    expect(p.aElegir.map((x) => x.id)).toEqual(["m0", "m1", "m3", "m4", "m5", "m6"]);
    expect(p.vacias.map((x) => x.id)).toEqual(["m2"]);
    expect(p.paraSugerir.map((x) => x.id)).toEqual(["m7"]);
  });
});

describe("qué tiene algo que leer (la regla del lector nuevo)", () => {
  it("transcripción, notas o minuta (también en borrador, desde la IA como borrador del 2026-10-15)", () => {
    expect(tieneQueLeer({ texto: true, minuta: false, minutaRevisada: false })).toBe(true);
    expect(tieneQueLeer({ texto: false, minuta: true, minutaRevisada: false })).toBe(true);
    expect(tieneQueLeer({ texto: false, minuta: true, minutaRevisada: false })).toBe(true);
    expect(tieneQueLeer({ texto: false, minuta: true, minutaRevisada: true })).toBe(true);
    expect(tieneQueLeer({ texto: false, minuta: false, minutaRevisada: false })).toBe(false);
  });
});

describe("el kickoff y las integraciones leen reuniones desde el 2026-10-07", () => {
  it("uno generado antes no las leía; uno generado después sí; los demás documentos, siempre", () => {
    const desde = Date.parse(DESDE_QUE_LEE_REUNIONES.kickoff!);
    expect(leiaReunionesAlGenerarse("kickoff", desde - DIA)).toBe(false);
    expect(leiaReunionesAlGenerarse("integraciones", desde + DIA)).toBe(true);
    expect(leiaReunionesAlGenerarse("kickoff", null)).toBe(false);
    expect(leiaReunionesAlGenerarse("diagnostico", null)).toBe(true);
    expect(leiaReunionesAlGenerarse("entrega", 0)).toBe(true);
  });
});

describe("las reuniones que dejan de reclasificarse", () => {
  it("se congela la reunión cuyos vínculos estaban todos libres y recibe un `true`; no la que ya tenía uno con candado", () => {
    const vinculos = [
      { id: "l1", sessionId: "a", bloqueado: false },
      { id: "l2", sessionId: "a", bloqueado: false },
      { id: "l3", sessionId: "b", bloqueado: true },
      { id: "l4", sessionId: "b", bloqueado: false },
      { id: "l5", sessionId: "c", bloqueado: false },
    ];
    expect([...reunionesQueSeCongelan(vinculos, new Set(["l1", "l4"]))]).toEqual(["a"]);
  });
});

describe("la marca: lo migrado no se vuelve a migrar", () => {
  it("lee tolerante y suma sin pisar la fecha de lo que ya estaba", () => {
    expect(leerMarca(null)).toEqual({ documentos: {}, exploraciones: {} });
    expect(leerMarca({ documentos: { a: 1, b: "x" } })).toEqual({ documentos: { b: "x" }, exploraciones: {} });
    const marca = sumarALaMarca({ documentos: { [claveDelDocumento("p1", "kickoff")]: "antes" }, exploraciones: {} }, {
      documentos: [claveDelDocumento("p1", "kickoff"), claveDelDocumento("p1", "diagnostico")],
      exploraciones: ["x1"],
    }, "ahora");
    expect(marca).toEqual({ documentos: { "p1:kickoff": "antes", "p1:diagnostico": "ahora" }, exploraciones: { x1: "ahora" } });
  });
});

describe("⛔ el script de la migración", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const SCRIPT = "scripts/migrar-reuniones-de-los-documentos.ts";
  const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

  it("usa la regla pura, escribe con el guard y respaldo, y solo donde la columna está en null", () => {
    const src = soloCodigo(leer(SCRIPT));
    expect(src).toContain("planDelDocumento(");
    expect(src).toContain('resolverApply({ tablas: ["SessionProject", "ExploracionDeVenta", "CronJobState"] })');
    expect(src).toContain("tieneQueLeer(");
    expect(src).toContain("leiaReunionesAlGenerarse(");
    expect(src).toContain("MARCA_DE_LA_MIGRACION");
    expect(src).toMatch(/\[columna\]:\s*null/);
    expect(src).toContain("createScriptDb()");
    expect(src).toContain("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  });

  it("no toca source, reviewedAt, included ni otra columna del vínculo", () => {
    const src = soloCodigo(leer(SCRIPT));
    const escrituras = src.match(/sessionProject\.updateMany\(\{[\s\S]*?\}\);/g) ?? [];
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) {
      const data = e.slice(e.indexOf("data:"));
      expect(data).not.toMatch(/source|reviewedAt|reviewedBy|included|isPrimary|handoffOverride|timelineOverride/);
    }
  });

  it("las sesiones de las exploraciones entran por la misma mutación de la ruta, con su versión", () => {
    const src = soloCodigo(leer(SCRIPT));
    expect(src).toContain("aplicarCambios(");
    expect(src).toContain("sesionesQueFaltan(");
    expect(src).not.toMatch(/exploracionDeVenta\.update\(/);
    // Ante un conflicto se recalcula sobre la fila nueva (no se reintentan las operaciones viejas).
    expect(src).toMatch(/leerContenido\(r\.fila\.contenido\)/);
  });
});
