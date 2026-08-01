/**
 * lib/docs/doc-sync.test.ts — LA DOCUMENTACIÓN NO PUEDE VOLVER A MENTIR EN SILENCIO.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * El 2026-08-01 una auditoría encontró que ARCHITECTURE.md afirmaba "hoy hay 0 tests"
 * (había 1480 casos), "no hay CI" (corría hace semanas), recetaba `db push` contra una
 * "DB de dev" inexistente, y documentaba tres rutas (`lib/integrations/`, `lib/api/parse.ts`,
 * `lib/ai/parse-json-output.ts`) que nunca se construyeron. El README decía Next 15 y
 * puerto 3000. Nada de eso rompía nada — por eso duró meses.
 *
 * Este test convierte esa clase de deriva en ROJO de suite, con el mecanismo de marcadores
 * del repo (estilo ratchet): los números verificables de los docs llevan un comentario
 * inline `valor<!-- sync:clave -->` y acá se comparan contra la fuente de verdad REAL
 * (node_modules, package.json, el filesystem). Cambió la versión de Next → el test falla
 * y el mensaje dice qué línea del doc actualizar. No hay forma de "olvidarse".
 *
 * Qué congela:
 *   1. Versiones del stack citadas en ARCHITECTURE Parte 0 == las INSTALADAS.
 *   2. El conteo de archivos de test citado == el glob real de lib/**·*.test.ts.
 *   3. El puerto de dev citado == el del script `dev` de package.json.
 *   4. Toda ruta del repo citada en la Parte 0 y el README EXISTE en disco
 *      (mata la clase de defecto lib/integrations/).
 *   5. AGENTS.md sigue siendo un puntero a CLAUDE.md (no puede volver a forkear).
 *   6. El changelog vive en docs/CHANGELOG.md y ARCHITECTURE ya no acumula entradas.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const ARCHITECTURE = leer("ARCHITECTURE.md");
const README = leer("README.md");
// La Parte 0 es la zona con datos operativos verificables; la constitución (§0–§13) usa
// paths de EJEMPLO (`lib/<modulo>/…`) que no deben escanearse como rutas reales.
const PARTE_0 = ARCHITECTURE.slice(0, ARCHITECTURE.indexOf("## 0. Contexto"));

/** `valor<!-- sync:clave -->` → { clave: valor } */
function parsearMarcadores(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of md.matchAll(/([^\s<*]+)\*{0,2}<!-- sync:([a-z0-9-]+) -->/g)) {
    out[m[2]] = m[1].replace(/\*+$/, "");
  }
  return out;
}
const marcadores = parsearMarcadores(ARCHITECTURE);

function versionInstalada(pkg: string): string {
  return JSON.parse(leer(join("node_modules", pkg, "package.json"))).version as string;
}

describe("marcadores sync de ARCHITECTURE Parte 0", () => {
  // clave del marcador → paquete cuya versión RESUELTA es la verdad
  const PAQUETES: Record<string, string> = {
    next: "next",
    react: "react",
    typescript: "typescript",
    prisma: "@prisma/client",
    pg: "pg",
    tailwindcss: "tailwindcss",
    zod: "zod",
    "anthropic-sdk": "@anthropic-ai/sdk",
    vitest: "vitest",
  };

  for (const [clave, pkg] of Object.entries(PAQUETES)) {
    it(`sync:${clave} == versión instalada de ${pkg}`, () => {
      const real = versionInstalada(pkg);
      expect(
        marcadores[clave],
        `ARCHITECTURE cita ${pkg}@${marcadores[clave] ?? "(sin marcador)"} pero node_modules tiene ${real}. ` +
          `Fix: en ARCHITECTURE.md Parte 0 · cap. A, reemplazá "${marcadores[clave]}<!-- sync:${clave} -->" por "${real}<!-- sync:${clave} -->".`,
      ).toBe(real);
    });
  }

  it("sync:dev-port == el puerto del script dev de package.json", () => {
    const dev = (JSON.parse(leer("package.json")).scripts?.dev ?? "") as string;
    const puerto = /-p\s+(\d+)/.exec(dev)?.[1];
    expect(puerto, "el script dev de package.json ya no declara un puerto con -p").toBeTruthy();
    expect(
      marcadores["dev-port"],
      `El doc dice puerto ${marcadores["dev-port"]}, package.json dice ${puerto}.`,
    ).toBe(puerto);
  });

  it("sync:test-files == el conteo real de lib/**/*.test.ts", () => {
    let n = 0;
    const walk = (d: string) => {
      for (const nombre of readdirSync(d)) {
        const full = join(d, nombre);
        if (statSync(full).isDirectory()) walk(full);
        else if (nombre.endsWith(".test.ts")) n++;
      }
    };
    walk(join(RAIZ, "lib"));
    expect(
      Number(marcadores["test-files"]),
      `El doc dice ${marcadores["test-files"]} archivos de test y el filesystem tiene ${n}. ` +
        `Fix: actualizá "<!-- sync:test-files -->" en ARCHITECTURE.md Parte 0 · cap. F a ${n}.`,
    ).toBe(n);
  });
});

describe("las rutas citadas existen", () => {
  // Un token backtickeado cuenta como ruta del repo si arranca en una carpeta top-level
  // real. Se excluyen globs, placeholders y elipsis — citan FORMA, no un archivo.
  const RE_RUTA = /^(app|lib|components|scripts|prisma|docs|hooks|public)\/[\w\-./()[\]]+$/;
  const esVerificable = (t: string) =>
    RE_RUTA.test(t) && !/[*<>{]|AAAA|…|\.\.\./.test(t);

  const tokens = new Set<string>();
  for (const fuente of [PARTE_0, README]) {
    for (const m of fuente.matchAll(/`([^`\n]+)`/g)) {
      const limpio = m[1].replace(/\/+$/, "");
      if (esVerificable(limpio)) tokens.add(limpio);
    }
  }

  it("hay rutas que verificar (el escáner no quedó ciego)", () => {
    expect(tokens.size).toBeGreaterThan(10);
  });

  for (const ruta of [...tokens].sort()) {
    it(`existe: ${ruta}`, () => {
      expect(
        existsSync(join(RAIZ, ruta)),
        `ARCHITECTURE Parte 0 o README citan \`${ruta}\` y no existe en disco — ` +
          "la clase de defecto lib/integrations/. Corregí la cita o creá la ruta.",
      ).toBe(true);
    });
  }
});

describe("estructura de la documentación", () => {
  it("AGENTS.md sigue siendo un puntero a CLAUDE.md (≤ 8 líneas)", () => {
    const agents = leer("AGENTS.md");
    expect(agents).toContain("@CLAUDE.md");
    expect(
      agents.trimEnd().split("\n").length,
      "AGENTS.md volvió a crecer — fue un fork que derivó hasta mentir sobre el gate de build. Es un puntero.",
    ).toBeLessThanOrEqual(8);
  });

  it("el changelog vive en docs/CHANGELOG.md y ARCHITECTURE no acumula entradas fechadas", () => {
    expect(existsSync(join(RAIZ, "docs", "CHANGELOG.md"))).toBe(true);
    expect(
      /^- \*\*20\d\d-/m.test(ARCHITECTURE),
      "ARCHITECTURE.md tiene una entrada de changelog fechada — va en docs/CHANGELOG.md; " +
        "la regla que sí queda acá es corregir la sección que quedó vieja.",
    ).toBe(false);
  });

  it("ningún doc vivo receta db:sync como comando a correr", () => {
    // Solo se toleran las menciones que EXPLICAN que ya no existe.
    for (const doc of ["README.md", "CLAUDE.md", "AGENTS.md", "docs/RUNBOOK.md", "docs/KNOWN-ERRORS.md"]) {
      expect(
        /npm run db:sync/.test(leer(doc)),
        `${doc} vuelve a mencionar \`npm run db:sync\` — ese script se eliminó el 2026-08-01 (encadenaba db push).`,
      ).toBe(false);
    }
  });
});
