/**
 * lib/escala/prueba/guardas.test.ts — las guardas de la prueba de la escala (N2), congeladas:
 *   · el nivel de la escala lo recalcula el servidor: la ruta no lo acepta del navegador;
 *   · la ruta pide acceso a la empresa en GET y en POST, y Wherex responde 422;
 *   · un solo escritor de `PruebaDeLaEscala`;
 *   · la tabla nace cerrada para anon (RLS + RESTRICTIVE) y prisma/policies.sql la espeja.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const soloCodigo = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function archivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...archivos(rel));
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(rel);
  }
  return out;
}

const RUTA = path.join("app", "api", "clients", "[id]", "escala", "prueba", "route.ts");

describe("la ruta de la prueba", () => {
  const ruta = soloCodigo(leer(RUTA));

  it("pide acceso a la empresa en GET y en POST", () => {
    expect(ruta.match(/await guardAccessToClient\(id\)/g)?.length).toBe(2);
  });

  it("no acepta el nivel de la escala del navegador: lo recalcula el servidor", () => {
    const cuerpo = ruta.slice(ruta.indexOf("const Cuerpo"), ruta.indexOf("export async function POST"));
    expect(cuerpo).toMatch(/nivelQueCree/);
    expect(cuerpo).not.toMatch(/nivelDeLaEscala/);
  });

  it("el borrador solo para quien ya lo ve en Escala › Borrador, en GET y en POST", () => {
    expect(ruta).toMatch(/return puedeEditarLaEscala\(acceso\.user\.teamMember\?\.roleEnum\)/);
    expect(ruta.match(/puedeVerElBorrador: veElBorrador\(acceso\)/g)?.length).toBe(2);
  });

  it("Wherex responde 422", () => {
    expect(ruta).toMatch(/case "excluida":\s*return NextResponse\.json\(\{ error: POR_QUE_SE_EXCLUYE \}, \{ status: 422 \}\)/);
  });
});

describe("un solo escritor", () => {
  it("solo lib/escala/prueba/servidor.ts escribe PruebaDeLaEscala", () => {
    const escritores = ["app", "lib", "components", "scripts"]
      .flatMap(archivos)
      .filter((rel) => /pruebaDeLaEscala\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(soloCodigo(leer(rel))));
    expect(escritores).toEqual([path.join("lib", "escala", "prueba", "servidor.ts")]);
  });

  it("y antes de escribir recalcula con la exploración de ESTA empresa y frena a Wherex", () => {
    const servidor = soloCodigo(leer(path.join("lib", "escala", "prueba", "servidor.ts")));
    const guardar = servidor.slice(servidor.indexOf("export async function guardarPrueba"), servidor.indexOf("export type ResumenDeLaPrueba"));
    expect(guardar).toMatch(/await pruebaDeLaEmpresa\(args\.clientId/);
    expect(guardar).toMatch(/if \(p\.estado === "excluida"\) return \{ estado: "excluida" \}/);
    expect(guardar).toMatch(/decidirLaComparacion\(\{[\s\S]*fuente: p\.fuente,\s*exploracionPedida: args\.exploracionId,/);
    expect(guardar).toMatch(/if \(d\.estado !== "entra"\) return d;/);
    expect(guardar).toMatch(/nivelDeLaEscala: area\.nivel/);
    // La exploración se busca por empresa: una de otra no entra.
    expect(servidor).toMatch(/exploracionDeVenta\s*\.findMany\(\{ where: \{ clientId, archivadaEn: null \}/);
  });
});

describe("el SQL deja la tabla cerrada para anon", () => {
  const sql = leer(path.join("scripts", "sql", "2026-10-26-prueba-de-la-escala.sql"));

  it("RLS encendido y política RESTRICTIVE que niega todo", () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "PruebaDeLaEscala"');
    expect(sql).toContain('ALTER TABLE "PruebaDeLaEscala" ENABLE ROW LEVEL SECURITY;');
    expect(sql).toMatch(/CREATE POLICY "deny_all_non_superuser" ON "PruebaDeLaEscala" AS RESTRICTIVE FOR ALL TO PUBLIC USING \(false\)/);
  });

  it("y prisma/policies.sql la espeja", () => {
    expect(leer(path.join("prisma", "policies.sql"))).toContain("'PruebaDeLaEscala'");
  });
});
