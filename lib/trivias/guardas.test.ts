/**
 * lib/trivias/guardas.test.ts — lo que no puede romperse en silencio en Trivias (escaneo estructural).
 *
 * · Toda ruta de /api/trivia pide su guarda en CADA handler: las de gestión y la consola del anfitrión, la celda
 *   `trivias.*`; las del jugador (play/**), solo ser del equipo (jugar no pide el permiso del módulo).
 * · Solo lib/trivias/mutations.ts escribe las tablas de Trivias.
 * · Las cinco tablas nacen con RLS y la policy RESTRICTIVE, y el SQL es aditivo.
 * · La consola del jugador nunca recibe las correctas con la pregunta abierta (lib/trivias/queries.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8").replace(/\r\n/g, "\n");

function archivos(dir: string, filtro: (nombre: string) => boolean): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const salida: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) salida.push(...archivos(rel, filtro));
    else if (filtro(e.name)) salida.push(rel);
  }
  return salida;
}

const RUTAS = archivos("app/api/trivia", (n) => n === "route.ts");
const HANDLER = /export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/g;

describe("las rutas de /api/trivia", () => {
  it("existen (piso: sin él, el escaneo pasa en vacío)", () => {
    expect(RUTAS.length).toBeGreaterThanOrEqual(8);
  });

  it("cada handler de gestión pide la celda trivias.*; cada handler del jugador, usuario del equipo", () => {
    for (const r of RUTAS) {
      const src = leer(r);
      const handlers = src.match(HANDLER) ?? [];
      expect(handlers.length, r).toBeGreaterThan(0);
      const esDelJugador = r.startsWith("app/api/trivia/play/");
      const guardas = src.match(esDelJugador ? /await guardInternalUser\(\)/g : /await guardPermission\("trivias", "(read|write)"\)/g) ?? [];
      expect(guardas.length, `${r}: cada handler necesita su guarda`).toBeGreaterThanOrEqual(handlers.length);
    }
  });

  it("lo que escribe pide trivias.write (leer el estado en vivo alcanza con trivias.read)", () => {
    for (const r of RUTAS.filter((x) => !x.startsWith("app/api/trivia/play/"))) {
      const src = leer(r);
      if (/export async function (POST|PUT|PATCH|DELETE)\b/.test(src)) {
        expect(src, r).not.toMatch(/guardPermission\("trivias", "read"\)/);
      }
    }
  });
});

describe("las tablas de Trivias", () => {
  const TABLAS = ["Trivia", "PreguntaDeTrivia", "PartidaDeTrivia", "JugadorDeTrivia", "RespuestaDeTrivia"];
  const DELEGADOS = ["trivia", "preguntaDeTrivia", "partidaDeTrivia", "jugadorDeTrivia", "respuestaDeTrivia"];

  it("solo lib/trivias/mutations.ts las escribe", () => {
    const escribe = new RegExp(`prisma\\.(${DELEGADOS.join("|")})\\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\\b`);
    const todos = [
      ...archivos("app", (n) => /\.(ts|tsx)$/.test(n)),
      ...archivos("lib", (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)),
      ...archivos("components", (n) => /\.(ts|tsx)$/.test(n)),
    ];
    const ofensores = todos.filter((f) => f !== "lib/trivias/mutations.ts" && escribe.test(leer(f)));
    expect(ofensores).toEqual([]);
  });

  it("el SQL es aditivo, re-ejecutable y enciende RLS con la policy RESTRICTIVE en las cinco", () => {
    const sql = leer("scripts/sql/2026-11-19-trivias.sql");
    expect(sql).not.toMatch(/^\s*DROP\s+(TABLE|COLUMN|TYPE)\b/im);
    expect(sql).not.toMatch(/^\s*CREATE TABLE "(?!.*IF NOT EXISTS)/m);
    for (const t of TABLAS) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${t}"`);
      expect(sql).toContain(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`CREATE POLICY deny_all_non_superuser ON "${t}" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);`);
      expect(leer("prisma/policies.sql"), `prisma/policies.sql › ${t}`).toContain(`'${t}'`);
    }
  });
});

describe("el jugador no ve la respuesta antes de tiempo", () => {
  it("las correctas y el resultado propio solo viajan con la pregunta cerrada", () => {
    const src = leer("lib/trivias/queries.ts");
    expect(src).toMatch(/correctas: visible && cab\.cerrada \?/);
    expect(src).toMatch(/resultado: cab\.cerrada \?/);
  });
});
