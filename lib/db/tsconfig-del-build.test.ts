import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";

/**
 * lib/db/tsconfig-del-build.test.ts — lo que mantiene el chequeo de tipos de `next build` dentro de
 * la memoria del VPS.
 *
 * ── EL PROBLEMA: EL BUILD DEL 2026-10-19 LLEGÓ A 5,7 GB DE 6 ─────────────────────────────────────
 * `next build` chequea los tipos en el VPS con un tope de 6 GB (NODE_OPTIONS del Dockerfile), y el
 * deploy de af896cfd pasó con 5,7 GB y ~1,3 GB libres en la máquina. Medido en una PC con
 * `tsc --noEmit --incremental false --extendedDiagnostics` y el pico de memoria del proceso:
 *
 *   antes ................................. 5,47 GB de pico · 2,30 M tipos · 9,2 M instanciaciones
 *   + el cliente Prisma con tipo explícito  4,50 GB · 1,55 M tipos · 4,7 M instanciaciones
 *   + el build sin los tests .............. 3,46 GB · 1,28 M tipos · 4,5 M instanciaciones
 *
 * ── 1. EL BUILD USA tsconfig.build.json, QUE ES tsconfig.json SIN LOS TESTS ─────────────────────
 * Next ya ignora en el build los errores de los tests (runTypeCheck descarta los diagnósticos de
 * *.test.*, *.spec.*, __tests__ y __mocks__), pero los chequeaba igual: ~1 GB por nada. Sacarlos no
 * cambia ninguna garantía. Lo que esta prueba impide es que tsconfig.build.json saque algo MÁS (un
 * script, un componente): eso sí dejaría pasar un error de tipos a producción. `npx tsc --noEmit` y
 * el CI siguen chequeando todo con tsconfig.json.
 *
 * ── 2. EL CLIENTE PRISMA SE CREA CON EL TIPO DE SIEMPRE ─────────────────────────────────────────
 * `new PrismaClient({ adapter })` infiere OTRA instancia del cliente (`PrismaClient<{ adapter:
 * PrismaPg }>`), y como cada delegado del cliente lleva las opciones en su tipo, TypeScript arma
 * de nuevo los tipos de cada modelo que toca ese archivo: los ~90 scripts que crean su cliente
 * duplicaban el mundo de Prisma (0,7 M tipos y 4 M instanciaciones). Con
 * `new PrismaClient<Prisma.PrismaClientOptions>(…)` todos comparten el tipo `PrismaClient`. Solo
 * cambia el tipo: el cliente que se crea es el mismo.
 */

const RAIZ = process.cwd();
const rel = (p: string) => path.relative(RAIZ, p).replace(/\\/g, "/");

/** La regla de Next para no reportar errores de tests en el build (next/dist/lib/typescript/runTypeCheck.js). */
const IGNORA_NEXT = /[\\/]__(?:tests|mocks)__[\\/]|(?<=[\\/.])(?:spec|test)\.[^\\/]+$/;

function archivosDe(tsconfig: string): Set<string> {
  const ruta = path.join(RAIZ, tsconfig);
  const leido = ts.readConfigFile(ruta, ts.sys.readFile);
  if (leido.error) throw new Error(ts.flattenDiagnosticMessageText(leido.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(leido.config, ts.sys, RAIZ, undefined, ruta);
  return new Set(parsed.fileNames.map(rel));
}

describe("tsconfig.build.json (lo que chequea next build)", () => {
  it("next.config.ts lo usa", () => {
    const cfg = fs.readFileSync(path.join(RAIZ, "next.config.ts"), "utf8");
    expect(cfg).toMatch(/typescript:\s*\{\s*tsconfigPath:\s*"tsconfig\.build\.json"\s*\}/);
  });

  it("hereda de tsconfig.json y tiene su mismo include", () => {
    const base = ts.readConfigFile(path.join(RAIZ, "tsconfig.json"), ts.sys.readFile).config;
    const build = ts.readConfigFile(path.join(RAIZ, "tsconfig.build.json"), ts.sys.readFile).config;
    expect(build.extends).toBe("./tsconfig.json");
    expect(build.include).toEqual(base.include);
    expect(build.compilerOptions ?? {}).toEqual({});
  });

  it("deja fuera SOLO lo que Next ya no chequea en el build (los tests)", () => {
    const todo = archivosDe("tsconfig.json");
    const build = archivosDe("tsconfig.build.json");
    const fuera = [...todo].filter((f) => !build.has(f));
    const deMas = fuera.filter((f) => !IGNORA_NEXT.test("/" + f));
    expect(deMas, "tsconfig.build.json deja fuera archivos que el build sí tiene que chequear").toEqual([]);
    expect([...build].filter((f) => !todo.has(f))).toEqual([]);
    expect(fuera.length).toBeGreaterThan(0);
    // scripts/ se chequea en el build a propósito (CLAUDE.md › Flujo de trabajo).
    expect([...build].some((f) => f.startsWith("scripts/"))).toBe(true);
  }, 60_000);
});

describe("new PrismaClient con el tipo de siempre", () => {
  it("ningún archivo crea el cliente con el tipo inferido", () => {
    // `git grep` y no leer archivo por archivo: son ~3.900 y leerlos uno a uno pasa el tiempo de la prueba.
    let salida = "";
    try {
      salida = execFileSync("git", ["grep", "-lE", "new PrismaClient\\s*\\(", "--", "*.ts", "*.tsx"], {
        cwd: RAIZ,
        encoding: "utf8",
      });
    } catch (e) {
      // git grep sale con 1 cuando no encuentra nada: eso es lo que se espera.
      if ((e as { status?: number }).status !== 1) throw e;
    }
    const conInferido = salida
      .split("\n")
      .map((l) => l.trim())
      .filter((f) => f && f !== "lib/db/tsconfig-del-build.test.ts");
    expect(conInferido, "usa new PrismaClient<Prisma.PrismaClientOptions>(…)").toEqual([]);
  });
});
