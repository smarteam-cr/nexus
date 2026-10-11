import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * lib/db/scripts-server-only.test.ts — UN SCRIPT QUE LLEGA A `server-only` LLEVA EL SHIM.
 *
 * `server-only` no es un paquete instalado: lo resuelve Next. Un script de consola (`npx tsx scripts/…`) que llega a un
 * módulo con `import "server-only"` muere al cargar con «Cannot find module 'server-only'», salvo que importe antes
 * scripts/lib/permitir-server-only.ts. tsc no lo ve, y el script se rompe en silencio el día que alguien suma ese
 * import a un módulo que el script usa de rebote. Pasó (2026-10-10): lib/lecturas/cola.ts lo sumó y 24 scripts dejaron
 * de arrancar, check-invariants entre ellos; y la memoria (lib/memoria) dejó sin arrancar a los dos que llaman al
 * agente de avance.
 *
 * Recorre los imports estáticos (y los `import()` con texto fijo) de cada script, por `@/` y por rutas relativas. Los
 * `import type` no cuentan: se borran al compilar. scripts/archive (one-offs históricos) y scripts/lib quedan fuera.
 */

const RAIZ = process.cwd();
const IMPORTS =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'"\n;]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function resolver(desde: string, especificador: string): string | null {
  let base: string;
  if (especificador.startsWith("@/")) base = path.join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) base = path.resolve(path.dirname(desde), especificador);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** El grafo de imports: de cada archivo, a qué archivos del repo llega y si importa `server-only` él mismo. */
const grafo = new Map<string, { destinos: string[]; directo: boolean }>();

function cargarGrafo(archivo: string): void {
  const pendientes = [archivo];
  while (pendientes.length) {
    const f = pendientes.pop()!;
    if (grafo.has(f)) continue;
    const destinos: string[] = [];
    let directo = false;
    for (const m of sinComentarios(fs.readFileSync(f, "utf8")).matchAll(IMPORTS)) {
      const especificador = m[1] ?? m[2];
      if (especificador === "server-only") directo = true;
      const d = resolver(f, especificador);
      if (d) destinos.push(d);
    }
    grafo.set(f, { destinos, directo });
    pendientes.push(...destinos);
  }
}

/** Los archivos del grafo que llegan a `server-only`, directo o de rebote (sin importar los ciclos). */
function queLleganAServerOnly(): Set<string> {
  const inverso = new Map<string, string[]>();
  for (const [f, { destinos }] of grafo) for (const d of destinos) inverso.set(d, [...(inverso.get(d) ?? []), f]);
  const llegan = new Set([...grafo].filter(([, n]) => n.directo).map(([f]) => f));
  const cola = [...llegan];
  while (cola.length) {
    for (const quien of inverso.get(cola.pop()!) ?? []) {
      if (!llegan.has(quien)) {
        llegan.add(quien);
        cola.push(quien);
      }
    }
  }
  return llegan;
}

function llegaAServerOnly(archivo: string): boolean {
  cargarGrafo(archivo);
  return queLleganAServerOnly().has(archivo);
}

function scripts(): string[] {
  const out: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "archive" && e.name !== "lib") recorrer(p);
      } else if (e.name.endsWith(".ts")) out.push(p);
    }
  };
  recorrer(path.join(RAIZ, "scripts"));
  return out;
}

describe("scripts de consola y `server-only`", () => {
  it("todo script que llega a `server-only` importa scripts/lib/permitir-server-only", () => {
    const todos = scripts();
    expect(todos.length, "el escaneo no encontró scripts").toBeGreaterThan(50);
    for (const s of todos) cargarGrafo(s);
    const llegan = queLleganAServerOnly();
    const sinShim = todos
      .filter((s) => !/permitir-server-only/.test(sinComentarios(fs.readFileSync(s, "utf8"))))
      .filter((s) => llegan.has(s))
      .map((s) => path.relative(RAIZ, s).split(path.sep).join("/"));
    expect(
      sinShim,
      'Estos scripts llegan a un módulo con `import "server-only"` y no arrancan con tsx. Suma `import "./lib/permitir-server-only";` después de `import "dotenv/config";`.',
    ).toEqual([]);
  });

  it("el escaneo ve la cadena de verdad (centinela: el script del agente de avance llega por la memoria)", () => {
    expect(llegaAServerOnly(path.join(RAIZ, "lib/timeline/regenerate-progress.ts"))).toBe(true);
    expect(llegaAServerOnly(path.join(RAIZ, "lib/clients/ficha.ts")), "un módulo puro no llega").toBe(false);
  });
});
