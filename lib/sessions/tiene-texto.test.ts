import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DONDE_NO_TIENE_TRANSCRIPCION,
  DONDE_TIENE_TRANSCRIPCION,
  MIN_NOTAS_PARA_LEER,
  MIN_TRANSCRIPT_CHARS,
  claseDeTexto,
  claseDesdeLosLargos,
  largoDeLasNotas,
  notasDeLaReunion,
  sqlClaseDeTexto,
  tieneTexto,
} from "./tiene-texto";
import { colaTomaSoloNotas, motivoParaNoEncolar, recuperacionPrendida, soloNotasPrendido } from "@/lib/lecturas/reglas";

/**
 * lib/sessions/tiene-texto.test.ts — EL PREDICADO ÚNICO «¿qué texto dejó la reunión?» (T2, 2026-10-24).
 *
 * Lo que se cuida: que las notas de Gemini cuenten como texto con su piso, que la transcripción vacía no cuente, que la
 * lectura use los MISMOS pisos, y que nadie vuelva a escribir un filtro suelto `transcript: { not: null }` en la app.
 */

const T = (n: number) => "a".repeat(n);

describe("qué texto dejó una reunión", () => {
  it("la transcripción manda: con 200 caracteres o más es «transcripcion», aunque haya notas", () => {
    expect(claseDeTexto({ transcript: T(MIN_TRANSCRIPT_CHARS), summary: { overview: T(900) } })).toBe("transcripcion");
    expect(claseDeTexto({ transcript: `  ${T(MIN_TRANSCRIPT_CHARS - 1)}  ` })).toBe("nada");
  });

  it("sin transcripción, unas notas de 400 o más son «solo_notas»; bajo el piso, «nada»", () => {
    expect(claseDeTexto({ transcript: null, summary: { overview: T(MIN_NOTAS_PARA_LEER) } })).toBe("solo_notas");
    expect(claseDeTexto({ transcript: "", summary: { overview: T(MIN_NOTAS_PARA_LEER - 1) } })).toBe("nada");
    // Una transcripción corta no tapa las notas.
    expect(claseDeTexto({ transcript: T(50), summary: { overview: T(800) } })).toBe("solo_notas");
  });

  it("las notas pueden venir como lista de textos; un resumen raro no cuenta", () => {
    expect(notasDeLaReunion({ overview: ["uno", 2, "tres"] })).toBe("uno\ntres");
    expect(largoDeLasNotas({ overview: [T(300), T(300)] })).toBe(601);
    expect(largoDeLasNotas(["overview"])).toBe(0);
    expect(largoDeLasNotas(null)).toBe(0);
    expect(largoDeLasNotas({ keywords: ["x"] })).toBe(0);
  });

  it("tieneTexto = transcripción o solo notas", () => {
    expect(tieneTexto({ transcript: T(300) })).toBe(true);
    expect(tieneTexto({ summary: { overview: T(500) } })).toBe(true);
    expect(tieneTexto({ transcript: "   ", summary: null })).toBe(false);
  });

  it("desde los largos (lo que da una consulta sin los textos), lo mismo", () => {
    expect(claseDesdeLosLargos({ transcripcion: 200, notas: 0 })).toBe("transcripcion");
    expect(claseDesdeLosLargos({ transcripcion: 199, notas: 400 })).toBe("solo_notas");
    expect(claseDesdeLosLargos({ transcripcion: 0, notas: 399 })).toBe("nada");
  });
});

describe("las formas para la base", () => {
  it("«tiene transcripción» = no nula Y no vacía, en un solo campo (se esparce sin pisar el NOT ni el AND de nadie)", () => {
    expect(DONDE_TIENE_TRANSCRIPCION).toEqual({ transcript: { not: null, notIn: [""] } });
    expect(Object.keys(DONDE_TIENE_TRANSCRIPCION)).toEqual(["transcript"]);
    expect(DONDE_NO_TIENE_TRANSCRIPCION).toEqual({ OR: [{ transcript: null }, { transcript: "" }] });
  });

  it("el SQL usa los mismos pisos y un alias limpio", () => {
    const sql = sqlClaseDeTexto("s");
    expect(sql.values).toEqual([MIN_TRANSCRIPT_CHARS, MIN_NOTAS_PARA_LEER]);
    expect(sql.sql).toContain(`"s"."transcript"`);
    expect(sql.sql).toContain(`"s"."summary"->>'overview'`);
    expect(sqlClaseDeTexto('x"; DROP').sql).toContain('"xDROP"."transcript"');
  });
});

describe("la lectura usa los mismos pisos (T2)", () => {
  const base = { kind: "CLIENTE", puertasAdentro: false, fecha: new Date("2026-10-20T15:00:00Z"), ahora: new Date("2026-10-24T15:00:00Z") };
  it("notas sobre y bajo el piso, con la cola tomando solo notas", () => {
    expect(motivoParaNoEncolar({ ...base, largoTranscript: 0, largoNotas: MIN_NOTAS_PARA_LEER }, { leerSoloNotas: true })).toBeNull();
    expect(motivoParaNoEncolar({ ...base, largoTranscript: 0, largoNotas: MIN_NOTAS_PARA_LEER - 1 }, { leerSoloNotas: true })).toBe("sin_texto");
    expect(motivoParaNoEncolar({ ...base, largoTranscript: MIN_TRANSCRIPT_CHARS, largoNotas: 0 })).toBeNull();
    expect(motivoParaNoEncolar({ ...base, largoTranscript: MIN_TRANSCRIPT_CHARS - 1, largoNotas: 0 })).toBe("sin_texto");
  });

  it("«lee solo notas» tiene su propia bandera, prendida por defecto; `=0` es la vuelta atrás", () => {
    expect(soloNotasPrendido({})).toBe(true);
    expect(soloNotasPrendido({ SEGUIMIENTO_SOLO_NOTAS: "0" })).toBe(false);
    expect(soloNotasPrendido({ SEGUIMIENTO_SOLO_NOTAS: " 0 " })).toBe(false);
    // La cola las toma si la lectura las lee, o si los hechos están prendidos (como antes de T2).
    expect(colaTomaSoloNotas({ SEGUIMIENTO_SOLO_NOTAS: "0" })).toBe(false);
    expect(colaTomaSoloNotas({ SEGUIMIENTO_SOLO_NOTAS: "0", SEGUIMIENTO_HECHOS: "1" })).toBe(true);
    expect(recuperacionPrendida({})).toBe(true);
    expect(recuperacionPrendida({ LECTURA_DE_RECUPERACION: "0" })).toBe(false);
  });
});

describe("⛔ un solo predicado", () => {
  const raiz = path.resolve(__dirname, "../..");
  const archivos = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) return d.name === "node_modules" || d.name.startsWith(".") ? [] : archivos(p);
      return /\.(ts|tsx)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
    });
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("nadie en app/, lib/ ni components/ filtra a mano `transcript: { not: null }` (usa lib/sessions/tiene-texto.ts)", () => {
    const sueltos = ["app", "lib", "components"]
      .flatMap((d) => archivos(path.join(raiz, d)))
      .filter((f) => /transcript\s*:\s*\{\s*not\s*:\s*null/.test(sinComentarios(fs.readFileSync(f, "utf8"))))
      .map((f) => path.relative(raiz, f).replace(/\\/g, "/"))
      // Su casa: el predicado mismo.
      .filter((f) => f !== "lib/sessions/tiene-texto.ts");
    expect(sueltos).toEqual([]);
  });

  it("la lectura de siempre y la recuperación deciden qué leer con la MISMA regla (`queSeLee`)", () => {
    const pp = fs.readFileSync(path.join(raiz, "lib/sessions/post-process.ts"), "utf8");
    const leer = pp.slice(pp.indexOf("async function leer("), pp.indexOf("/** ¿Las notas de Gemini alcanzan para leerlas?"));
    const recuperacion = pp.slice(pp.indexOf("export async function pedidoDeRecuperacion("), pp.indexOf("export async function aplicarRecuperacion("));
    for (const [nombre, bloque] of [["la lectura de siempre", leer], ["la recuperación", recuperacion]] as const) {
      expect(bloque.length, `no encontré ${nombre}`).toBeGreaterThan(500);
      expect(bloque, nombre).toContain("queSeLee(session, process.env)");
      expect(bloque, `${nombre}: el largo de la transcripción se decide en queSeLee`).not.toMatch(/MIN_TRANSCRIPT_CHARS|MIN_RECUERDO/);
    }
    const enriquecimiento = fs.readFileSync(path.join(raiz, "lib/google/meet-enrichment.ts"), "utf8");
    expect(enriquecimiento).toContain('colaTomaSoloNotas(process.env) && claseDeTexto({ summary: finalSummary }) === "solo_notas"');
  });
});
