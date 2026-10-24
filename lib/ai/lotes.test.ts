import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { estadoDelResultado, ESPERA_PARA_JUNTAR_MS, hayQueEnviar, idParaAnthropic, MAX_PEDIDOS_POR_LOTE, seVencio, TIPOS_DE_LOTE, tipoPrendido, tiposQueSeMandan } from "./lotes";

/**
 * lib/ai/lotes.test.ts — LA PUERTA DE LOS LOTES ES UNA SOLA, Y SUS REGLAS SE CUMPLEN.
 *
 * Lo que se cuida: que nadie llame a la API Batch por fuera de lib/ai/lotes-server.ts (sus llamadas no pasan por el
 * medidor del proxy: quedarían sin anotar), que todo tipo tenga su manejador, y que un pedido no espere de más ni se
 * mande antes de juntar.
 */

const AHORA = new Date("2026-10-18T15:00:00Z");
const hace = (ms: number) => ({ createdAt: new Date(AHORA.getTime() - ms) });

describe("cuándo se manda un lote", () => {
  it("sin pendientes no se manda nada", () => expect(hayQueEnviar([], AHORA)).toBe(false));
  it("uno recién llegado espera a que se junten más", () => expect(hayQueEnviar([hace(60_000)], AHORA)).toBe(false));
  it("el más viejo esperó lo suficiente: se manda", () => expect(hayQueEnviar([hace(10_000), hace(ESPERA_PARA_JUNTAR_MS)], AHORA)).toBe(true));
  it("con el máximo se manda sin esperar", () => expect(hayQueEnviar(Array.from({ length: MAX_PEDIDOS_POR_LOTE }, () => hace(0)), AHORA)).toBe(true));
});

describe("lo que vuelve", () => {
  it("cada resultado de Anthropic tiene su estado", () => {
    expect(estadoDelResultado("succeeded")).toBe("listo");
    expect(estadoDelResultado("expired")).toBe("vencido");
    expect(estadoDelResultado("errored")).toBe("error");
    expect(estadoDelResultado("canceled")).toBe("error");
  });

  it("a las 26 horas de enviado, un pedido se da por vencido", () => {
    expect(seVencio(new Date(AHORA.getTime() - 25 * 3_600_000), AHORA)).toBe(false);
    expect(seVencio(new Date(AHORA.getTime() - 27 * 3_600_000), AHORA)).toBe(true);
    expect(seVencio(null, AHORA)).toBe(false);
  });

  it("el id de la fila sirve como custom_id; uno raro no se manda", () => {
    expect(idParaAnthropic("cmabc123def456")).toBe("cmabc123def456");
    expect(() => idParaAnthropic("con espacio")).toThrow();
  });
});

describe("qué tipos se mandan (T2: la recuperación de las lecturas)", () => {
  it("con presupuesto automático, todos los prendidos", () => {
    expect(tiposQueSeMandan({}, true)).toEqual(["vigia-barrido", "lectura-recuperacion"]);
  });
  it("sin presupuesto automático, solo la recuperación (la encola una persona con su tope)", () => {
    expect(tiposQueSeMandan({}, false)).toEqual(["lectura-recuperacion"]);
  });
  it("LECTURA_DE_RECUPERACION=0 la apaga: lo que espera no se manda", () => {
    expect(tipoPrendido("lectura-recuperacion", { LECTURA_DE_RECUPERACION: "0" })).toBe(false);
    expect(tiposQueSeMandan({ LECTURA_DE_RECUPERACION: "0" }, true)).toEqual(["vigia-barrido"]);
    expect(tiposQueSeMandan({ LECTURA_DE_RECUPERACION: "0" }, false)).toEqual([]);
  });
  it("la puerta elige los tipos antes de buscar, y anota la llamada a nombre de quien la pidió", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "lotes-server.ts"), "utf8");
    expect(src).toContain("const tipos = tiposQueSeMandan(process.env, quedaAutomatico);");
    expect(src).toContain('where: { estado: "en_espera", tipo: { in: tipos } }');
    expect(src).toContain("quien = manejador.quienPidio?.(p.contexto) ?? null;");
    expect(src).toContain("triggeredByEmail: quien,");
  });
});

describe("⛔ una sola puerta", () => {
  const raiz = path.resolve(__dirname, "../..");
  const archivos = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) return d.name === "node_modules" || d.name.startsWith(".") ? [] : archivos(p);
      return /\.(ts|tsx)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
    });

  it("nadie fuera de lib/ai/lotes-server.ts llama a messages.batches", () => {
    const fuera = ["lib", "app", "scripts"]
      .flatMap((d) => archivos(path.join(raiz, d)))
      .filter((f) => /\bbatches\s*\.\s*(create|retrieve|results|cancel|list)\b/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.relative(raiz, f).replace(/\\/g, "/"))
      .filter((f) => f !== "lib/ai/lotes-server.ts");
    expect(fuera).toEqual([]);
  });

  it("todo tipo de lote tiene su manejador", () => {
    const texto = fs.readFileSync(path.join(raiz, "lib/ai/lotes-manejadores.ts"), "utf8");
    for (const t of TIPOS_DE_LOTE) expect(texto, `falta el manejador de «${t}»`).toContain(`"${t}":`);
  });
});
