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
 * 5. Lo del vigía lleva a la ficha de SU cuenta, no al índice. Esta sí carga la fuente (lib/para-ti/fuentes/cs.ts)
 *    contra una base simulada.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FRENTES_ACTIVOS } from "./frentes";
import { TIPOS_DE_AVISO } from "./avisos";
import { VIGIA } from "./fuentes/cs";
import { pestanaDeLaUrl } from "@/lib/cs/pestanas-de-la-cuenta";

const base = vi.hoisted(() => ({ alertas: [] as unknown[], propuestas: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    csAlert: { findMany: async () => base.alertas },
    project: { findMany: async () => base.propuestas },
  },
}));

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
    // Piso: si la forma `export const X: Fuente =` cambia, la lista sale vacía y el `for` no mira nada. Una exportada por
    // cada clave de fuente: el escaneo tiene que ver TODAS.
    const claves = fuentes.flatMap((t) => [...t.matchAll(/^\s{2}clave: "([^"]+)",$/gm)]).length;
    expect(exportadas.length, "el escaneo no encontró las fuentes exportadas").toBeGreaterThan(10);
    expect(exportadas.length, "hay fuentes con clave que el escaneo no ve como exportadas").toBe(claves);
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

describe("⛔ lo del vigía lleva a la ficha de su cuenta, no al índice (2026-10-05)", () => {
  const alerta = (clientId: string, name: string, dia: string) => ({
    id: `al-${clientId}-${dia}`,
    clientId,
    firstDetectedAt: new Date(`2026-10-${dia}T12:00:00Z`),
    client: { name },
  });
  const propuesta = (id: string, clientId: string, name: string) => ({
    id,
    name: `Proyecto ${id}`,
    clientId,
    healthProposedAt: new Date("2026-10-03T12:00:00Z"),
    client: { name },
  });
  const ctx = { ahora: new Date("2026-10-05T15:00:00Z"), hoyISO: "2026-10-05" };
  const medir = async () => {
    const items = await VIGIA.medir({} as never, ctx);
    return { alertas: items.find((i) => i.clave === "cs-vigia:alertas"), estados: items.find((i) => i.clave === "cs-vigia:estados") };
  };

  it("una cuenta: el botón abre su ficha", async () => {
    base.alertas = [alerta("c-wherex", "Wherex", "01"), alerta("c-wherex", "Wherex", "02")];
    base.propuestas = [propuesta("p-1", "c-wherex", "Wherex")];
    const { alertas, estados } = await medir();
    expect(alertas?.href).toBe("/customer-success/c-wherex");
    expect(alertas?.enlaces).toBeUndefined();
    expect(estados?.href).toBe("/customer-success/c-wherex?pestana=proyectos");
  });

  it("varias cuentas: dice cuántas y trae cada cuenta con su enlace", async () => {
    base.alertas = [alerta("c-wherex", "Wherex", "01"), alerta("c-kolbi", "Kölbi", "02"), alerta("c-wherex", "Wherex", "03")];
    base.propuestas = [propuesta("p-1", "c-kolbi", "Kölbi"), propuesta("p-2", "c-wherex", "Wherex")];
    const { alertas, estados } = await medir();
    expect(alertas?.titulo).toContain("3 alertas altas sin revisar en 2 cuentas");
    expect(alertas?.href, "el botón: la que más espera").toBe("/customer-success/c-wherex");
    expect(alertas?.enlaces).toEqual([
      { texto: "Wherex (2)", href: "/customer-success/c-wherex" },
      { texto: "Kölbi", href: "/customer-success/c-kolbi" },
    ]);
    expect(estados?.enlaces).toEqual([
      { texto: "Kölbi", href: "/customer-success/c-kolbi?pestana=proyectos" },
      { texto: "Wherex", href: "/customer-success/c-wherex?pestana=proyectos" },
    ]);
  });

  it("nunca el índice, y la pestaña es una que la ficha entiende", async () => {
    const { alertas, estados } = await medir();
    for (const href of [alertas?.href, estados?.href, ...(alertas?.enlaces ?? []).map((e) => e.href)]) {
      expect(href).toMatch(/^\/customer-success\/[^/?]+/);
    }
    const pestana = new URL(estados!.href, "https://nexus.local").searchParams.get("pestana");
    expect(pestanaDeLaUrl(pestana), "la ficha no reconoce el parámetro: abriría en «Estado de la cuenta»").toBe("proyectos");
  });
});
