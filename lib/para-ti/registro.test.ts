/**
 * Escaneo estructural de «Para ti» (2026-10-04). Lee el CÓDIGO como texto: las fuentes y los avisos importan Prisma y
 * `server-only`, que no se pueden cargar en una prueba unit.
 *
 * Lo que congela:
 * 1. Cada fuente tiene una clave única y está en el registro.
 * 2. Cada frente que se ofrece en Equipo trae algo (una fuente o un aviso): un frente vacío es un interruptor que no
 *    hace nada.
 * 3. Cada tipo de aviso que se escribe está en el catálogo (TIPOS_DE_AVISO).
 * 4. La tabla `Aviso` solo se escribe desde lib/para-ti/avisos-server.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { FRENTES_ACTIVOS } from "./frentes";
import { TIPOS_DE_AVISO } from "./avisos";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(RAIZ, dir))) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const rel = join(dir, n);
    const st = statSync(join(RAIZ, rel));
    if (st.isDirectory()) out.push(...archivos(rel));
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(rel);
  }
  return out;
}

const FUENTES_DIR = "lib/para-ti/fuentes";
const fuentes = readdirSync(join(RAIZ, FUENTES_DIR)).map((n) => leer(join(FUENTES_DIR, n)));
const codigo = [...archivos("lib"), ...archivos("app"), ...archivos("components")].map((rel) => ({ rel, texto: leer(rel) }));

describe("las fuentes de «Para ti»", () => {
  it("cada fuente tiene una clave única", () => {
    const claves = fuentes.flatMap((t) => [...t.matchAll(/^\s{2}clave: "([^"]+)",$/gm)].map((m) => m[1]));
    expect(claves.length).toBeGreaterThan(10);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("cada fuente exportada está en el registro", () => {
    const registro = leer("lib/para-ti/registro.ts");
    const exportadas = fuentes.flatMap((t) => [...t.matchAll(/export const ([A-Z_]+): Fuente = /g)].map((m) => m[1]));
    for (const nombre of exportadas) expect(registro, `${nombre} no está en FUENTES`).toMatch(new RegExp(`\\b${nombre},`));
  });
});

describe("cada frente que se ofrece trae algo", () => {
  it.each(FRENTES_ACTIVOS.map((f) => f.clave))("%s", (clave) => {
    const usado = codigo.some(({ texto }) => texto.includes(`frente: "${clave}"`));
    expect(usado, `Nada usa el frente ${clave}: o se le suma una fuente/aviso, o se marca activo:false`).toBe(true);
  });
});

describe("los avisos", () => {
  const conAvisar = codigo.filter(({ texto }) => /\bavisar\(/.test(texto) && !texto.includes("export async function avisar("));

  it("cada tipo que se escribe está en el catálogo", () => {
    const tipos = conAvisar.flatMap(({ rel, texto }) =>
      [...texto.matchAll(/tipo: "([a-z]+\.[a-z-]+)"/g)].map((m) => ({ rel, tipo: m[1] })),
    );
    expect(tipos.length).toBeGreaterThan(5);
    for (const { rel, tipo } of tipos) expect(Object.keys(TIPOS_DE_AVISO), `${rel}: ${tipo}`).toContain(tipo);
  });

  it("⭐ la tabla Aviso solo se escribe desde avisos-server.ts", () => {
    const escriben = codigo
      .filter(({ texto }) => /\b(prisma|tx)\.aviso\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(texto))
      .map(({ rel }) => relative(RAIZ, join(RAIZ, rel)).replace(/\\/g, "/"));
    expect(escriben).toEqual(["lib/para-ti/avisos-server.ts"]);
  });
});
