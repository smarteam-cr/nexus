import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/ai/chokepoint.test.ts — TODA LLAMADA A CLAUDE PASA POR UN SOLO LUGAR.
 *
 * ── EL MODO DE FALLA QUE ESTO CAZA ───────────────────────────────────────────
 * No es que alguien rompa el medidor: es que alguien AGREGUE un agente nuevo importando el SDK
 * directo. Ese agente funcionaría perfecto —responde, guarda, se ve bien— y su gasto sería
 * invisible. Nada falla: ni tipos, ni build, ni ningún test de negocio. Simplemente el total del
 * mes dejaría de cerrar y nadie sabría por dónde se está yendo.
 *
 * Hasta el 2026-08-17 la regla existía solo en prosa (`ARCHITECTURE.md`), y **ya tenía una
 * excepción real que nadie había notado**: `lib/ai/summarize-session.ts` llamaba a `getAnthropic()`
 * directo y esquivaba el proxy. Una regla escrita que nadie verifica se incumple sola.
 */

const RAIZ = process.cwd();
const DUENIO = "lib/anthropic.ts";

/** Archivos de producción (sin tests, sin node_modules, sin build). */
function fuentes(): string[] {
  const out: string[] = [];
  const saltar = new Set(["node_modules", ".next", ".next-alt", ".git", "dist", "backups"]);
  const caminar = (dir: string) => {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name).replace(/\\/g, "/");
      if (e.isDirectory()) {
        if (!saltar.has(e.name)) caminar(rel);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push(rel);
      }
    }
  };
  for (const base of ["lib", "app", "components", "scripts"]) caminar(base);
  return out;
}

/** El fuente sin comentarios: MENCIONAR el SDK en una explicación no es IMPORTARLO. */
function soloCodigo(rel: string): string {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

describe("⭐ un solo dueño del SDK de Anthropic", () => {
  const archivos = fuentes();

  it("la guarda está mirando el árbol de verdad", () => {
    /* Sin este piso, un `fuentes()` roto dejaría la guarda verde sobre una lista vacía. */
    expect(archivos.length, "el escaneo no encontró fuentes").toBeGreaterThan(500);
    expect(archivos).toContain(DUENIO);
  });

  it("⛔ nadie más importa `@anthropic-ai/sdk` como VALOR", () => {
    /* ⚠ `import type` no cuenta, y la distinción no es cosmética: un tipo no construye un cliente
       ni esquiva nada. `lib/ai/assist.ts` hace exactamente eso —importa el tipo y llama por el
       cliente compartido—, y tratarlo como violación habría obligado a debilitar la guarda entera
       con una allowlist. Lo que se prohíbe es traer el SDK para USARLO. */
    const IMPORTA_VALOR = /(^|\n)\s*import\s+(?!type\b)[^;]*?from\s+["']@anthropic-ai\/sdk["']/;
    const culpables = archivos.filter((f) => f !== DUENIO && IMPORTA_VALOR.test(soloCodigo(f)));
    expect(
      culpables,
      `Estos archivos hablan con Claude por fuera del medidor, así que su gasto es invisible.\n` +
        `Importá \`anthropic\` (o \`getAnthropic\`) de "@/lib/anthropic" en su lugar:\n` +
        culpables.map((c) => `  · ${c}`).join("\n"),
    ).toEqual([]);
  });

  it("⛔ nadie construye un cliente con `new Anthropic(`", () => {
    const culpables = archivos.filter((f) => f !== DUENIO && /new\s+Anthropic\s*\(/.test(soloCodigo(f)));
    expect(culpables, "un cliente construido a mano no pasa por el medidor").toEqual([]);
  });
});

describe("⭐ el dueño mide de verdad — no solo centraliza", () => {
  const src = soloCodigo(DUENIO);

  it("envuelve los dos verbos que gastan", () => {
    /* `create` es el 90% de las llamadas; `stream` es el que usan las dos más caras (el mapeo del
       handoff con 64k de salida, y marketing). Medir solo `create` dejaría afuera justo esas. */
    expect(src, "no se envuelve messages.create").toContain('prop === "create"');
    expect(src, "no se envuelve messages.stream").toContain('prop === "stream"');
  });

  it("anota tanto el éxito como el fallo", () => {
    /* Una racha de errores es la señal más temprana de un loop disparado. Medir solo el camino
       feliz esconde exactamente el caso que hay que ver. */
    expect(src).toContain("ok: true");
    expect(src).toContain("ok: false");
  });

  it("⚠ el error se re-lanza — el medidor observa, no interviene", () => {
    /* Si el proxy se tragara la excepción, una corrida fallida se vería como exitosa y devolvería
       `undefined` río abajo. El medidor no puede cambiar el resultado de nada. */
    expect(src, "el proxy no re-lanza el error").toMatch(/throw\s+e/);
  });

  it("⚠ el stream suscribe `error`, no solo `message`", () => {
    /* Suscribir solo el camino feliz de un EventEmitter puede dejar un error sin manejar. */
    expect(src).toContain('"message"');
    expect(src).toContain('"error"');
  });

  it("⛔ el presupuesto se consulta ANTES de los dos verbos", () => {
    /* Sin esto, T4 entera es código muerto: el tope existiría, tendría sus tests puros en verde y
       jamás lo consultaría nadie. El caso que importa es el streaming —las dos llamadas más caras
       del sistema— así que se afirma verbo por verbo y no una sola vez en el archivo. */
    for (const verbo of ["create", "stream"] as const) {
      const i = src.indexOf(`prop === "${verbo}"`);
      expect(i, `no se encontró la rama de ${verbo}`).toBeGreaterThan(-1);
      // Hasta el arranque de la rama siguiente (o el final): la llamada tiene que estar ADENTRO.
      const finales = [src.indexOf('prop === "stream"', i + 1), src.indexOf("return (valor as", i)]
        .filter((n) => n > i);
      const rama = src.slice(i, Math.min(...finales, src.length));
      expect(rama.length, "la guarda no está mirando nada").toBeGreaterThan(120);
      expect(
        rama,
        `messages.${verbo} sale sin consultar el presupuesto: el tope no lo cubre`,
      ).toContain("revisarPresupuestoAntesDeLlamar(");
    }
  });

  it("`getAnthropic` devuelve el cliente INSTRUMENTADO, no el crudo", () => {
    /* Es la puerta que `summarize-session.ts` usaba para esquivar el proxy. Si volviera a devolver
       el cliente sin envolver, ese camino y cualquier otro que la use dejarían de medirse. */
    const i = src.indexOf("export function getAnthropic");
    expect(i, "no se encontró getAnthropic").toBeGreaterThan(-1);
    const cuerpo = src.slice(i, src.indexOf("\n}", i));
    expect(cuerpo.length, "la guarda no está mirando nada").toBeGreaterThan(40);
    expect(cuerpo, "getAnthropic devuelve el cliente sin instrumentar").toContain("instrumentar(");
  });
});
