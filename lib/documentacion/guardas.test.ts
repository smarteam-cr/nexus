/**
 * lib/documentacion/guardas.test.ts — las cinco reglas del módulo que no se ven leyendo un archivo.
 *
 * No prueban lógica: congelan decisiones que, si se rompen, no dan ningún error visible.
 *   1. Toda escritura de la API pide la celda del módulo (una ruta sin guard no falla, ABRE).
 *   2. Ningún id se valida con `.cuid()` — hay filas del equipo que son UUID.
 *   3. Ningún agente lee las páginas: ésta es la base de las PERSONAS, y meterla en un prompt
 *      cambiaría lo que el cliente recibe sin que nadie lo decida.
 *   4. No entra ningún `@blocknote/xl-*`: son GPL, y el resto del editor es MPL-2.0.
 *   5. Los permisos por defecto son los acordados: todos escriben, solo el liderazgo ordena.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MATRIX } from "../auth/permissions/defaults";

const RAIZ = process.cwd();
const API = path.join(RAIZ, "app", "api", "documentacion");
const LIB = path.join(RAIZ, "lib", "documentacion");

function archivosTs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) return archivosTs(completo);
    return e.isFile() && /\.tsx?$/.test(e.name) ? [completo] : [];
  });
}

const rel = (f: string) => path.relative(RAIZ, f).replace(/\\/g, "/");
const RUTAS = archivosTs(API);
const leer = (f: string) => fs.readFileSync(f, "utf8");

/**
 * Saca comentarios antes de escanear — el mismo trato que `lib/manual/manual.test.ts` le da a su
 * escaneo de privacidad. Los archivos EXPLICAN por qué no usan `.cuid()`, y un test que
 * prohibiera nombrarlo empujaría a borrar la explicación: el resultado opuesto al que se busca.
 */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("1 · la API de Documentación no se abre sin querer", () => {
  it("hay rutas que escanear", () => {
    expect(RUTAS.length).toBeGreaterThan(0);
  });

  it("toda escritura llama a guardPermission(\"documentacion\", …)", () => {
    const sinGuard = RUTAS.filter((f) => {
      const src = leer(f);
      const escribe = /export async function (POST|PATCH|PUT|DELETE)\b/.test(src);
      return escribe && !/guardPermission\(\s*"documentacion"/.test(src);
    }).map(rel);
    expect(
      sinGuard,
      `Una escritura sin la celda del módulo no falla: ABRE. Agregá ` +
        `guardPermission("documentacion", "write"|"manage") en:\n${sinGuard.join("\n")}`,
    ).toEqual([]);
  });

  it("toda lectura exige al menos usuario interno", () => {
    const sinGuard = RUTAS.filter((f) => {
      const src = leer(f);
      return /export async function GET\b/.test(src) && !/guard(InternalUser|Permission)\(/.test(src);
    }).map(rel);
    expect(sinGuard).toEqual([]);
  });
});

describe("2 · los ids no se validan con .cuid()", () => {
  it("ni en la API ni en la lógica del módulo", () => {
    const fuentes = [...RUTAS, ...archivosTs(LIB)].filter((f) => !/\.test\.tsx?$/.test(f));
    const culpables = fuentes.filter((f) => sinComentarios(leer(f)).includes(".cuid()")).map(rel);
    expect(
      culpables,
      `14 TeamMember de producción son UUID: un .cuid() los rechaza con un 400 que parece ` +
        `un problema de permisos. Usá z.string().min(1) en:\n${culpables.join("\n")}`,
    ).toEqual([]);
  });
});

describe("3 · las páginas del equipo no llegan a ningún agente", () => {
  it("ni lib/agents, ni lib/canvas, ni lib/knowledge, ni lib/ai las leen", () => {
    const culpables: string[] = [];
    for (const carpeta of ["agents", "canvas", "knowledge", "ai"]) {
      for (const f of archivosTs(path.join(RAIZ, "lib", carpeta))) {
        if (/\bpaginaDoc\b|\bPaginaDoc\b/.test(leer(f))) culpables.push(rel(f));
      }
    }
    expect(
      culpables,
      `Documentación es la base de las PERSONAS. La de los agentes es KnowledgeDocument ` +
        `(/knowledge). Meter una página en un prompt cambia lo que recibe el cliente:\n${culpables.join("\n")}`,
    ).toEqual([]);
  });
});

describe("4 · el editor se queda en su licencia", () => {
  it("no hay ningún paquete @blocknote/xl-* (GPL)", () => {
    const pkg = JSON.parse(leer(path.join(RAIZ, "package.json"))) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const todas = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(todas.filter((d) => d.startsWith("@blocknote/xl-"))).toEqual([]);
  });
});

describe("5 · los permisos por defecto del módulo", () => {
  const OPERATIVOS = ["CSE", "VENTAS", "DEV", "CSL", "MARKETING", "ADMIN"] as const;

  it("todo el equipo escribe la base", () => {
    for (const rol of OPERATIVOS) {
      expect(DEFAULT_MATRIX[rol].sections.documentacion.write, rol).toBe(true);
    }
  });

  it("solo el liderazgo la ordena (archivar, restaurar, bloquear)", () => {
    expect(DEFAULT_MATRIX.CSL.sections.documentacion.manage).toBe(true);
    for (const rol of OPERATIVOS.filter((r) => r !== "CSL")) {
      expect(DEFAULT_MATRIX[rol].sections.documentacion.manage, rol).toBe(false);
    }
  });
});
