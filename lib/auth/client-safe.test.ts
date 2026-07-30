/**
 * lib/auth/client-safe.test.ts — ningún componente de cliente arrastra Prisma al navegador.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Un `"use client"` que importa un VALOR de un módulo que importa Prisma mete el driver de
 * Postgres en el bundle del navegador. Se cae el build con `Can't resolve 'dns'`, y el
 * mensaje señala a `node_modules/pg`, no a la línea que lo causó — hay que reconstruir la
 * cadena a mano.
 *
 * Lo peor es lo que NO lo detecta: `tsc` está feliz (los tipos existen), los 1.381 tests
 * están felices (Vitest corre en Node), y `npm run dev` también, porque Turbopack en
 * desarrollo es más permisivo. Solo aparece en el build de producción.
 *
 * Pasó escribiendo O5: `ActiveProjectsSection` (cliente) pasó de `import type { PortfolioRow }`
 * a importar también una función del mismo archivo. Un `import type` se borra en compilación;
 * una función, no.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

function archivos(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
    }
  };
  rec(path.join(RAIZ, dir));
  return out;
}

/** `@/lib/foo/bar` → ruta absoluta del archivo, probando .ts / .tsx / index. */
function resolverAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = path.join(RAIZ, spec.slice(2));
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

/** Los módulos de `lib/` que tocan Prisma DIRECTAMENTE: los que no pueden ir al navegador. */
const modulosDeServidor = new Set(
  archivos("lib")
    .filter((f) => /from\s+["']@\/lib\/db\/prisma["']/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.resolve(f)),
);

/**
 * Imports de VALOR (los `import type` se borran en compilación y son seguros).
 * Se saltea `import type { … }` y también los specifiers marcados `type` uno por uno.
 */
function importsDeValor(src: string): string[] {
  const out: string[] = [];
  const re = /^import\s+(?!type\s)([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
  for (const m of [...src.matchAll(re)]) {
    const clausula = m[1].trim();
    // `import { type A, type B } from "x"` — todo marcado type → no queda valor.
    const soloTipos =
      clausula.startsWith("{") &&
      clausula
        .replace(/[{}]/g, "")
        .split(",")
        .filter((s) => s.trim())
        .every((s) => s.trim().startsWith("type "));
    if (!soloTipos) out.push(m[2]);
  }
  return out;
}

describe("los componentes de cliente no importan módulos de servidor", () => {
  it("hay módulos de servidor que detectar (el escaneo no corre en vacío)", () => {
    expect(modulosDeServidor.size).toBeGreaterThan(20);
  });

  it("ningún «use client» importa un VALOR de un módulo que toca Prisma", () => {
    const culpables: string[] = [];
    for (const f of [...archivos("components"), ...archivos("app")]) {
      const src = fs.readFileSync(f, "utf8");
      // El "use client" tiene que estar arriba de todo para contar.
      if (!/^\s*(["'])use client\1/.test(src)) continue;
      for (const spec of importsDeValor(src)) {
        const destino = resolverAlias(spec);
        if (destino && modulosDeServidor.has(path.resolve(destino))) {
          culpables.push(`${path.relative(RAIZ, f)} → ${spec}`);
        }
      }
    }
    expect(
      culpables,
      "Un componente de cliente está importando un VALOR de un módulo que importa Prisma: eso " +
        "mete el driver de Postgres en el bundle del navegador y rompe `npm run build` con un " +
        "error que apunta a node_modules/pg, no a la línea culpable. Si solo necesitás el TIPO, " +
        "usá `import type` (se borra en compilación). Si necesitás la función, movela a un " +
        "módulo PURO — el molde es lib/lifecycle/etapa-ui.ts.",
    ).toEqual([]);
  });
});
