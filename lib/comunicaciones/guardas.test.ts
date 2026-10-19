/**
 * lib/comunicaciones/guardas.test.ts — quién toca las COMUNICACIONES de HubSpot (iniciativa B).
 *
 *   · Escribe la tabla SOLO la copia (`copia-server.ts`) y, del estado de sus compromisos, `compromisos-server.ts`.
 *   · La leen solo las piezas de lib/comunicaciones (la memoria y el chat entran por `lectura-server.ts`).
 *   · Nada de lo que ve el cliente (lib/external, app/external, los documentos) importa lib/comunicaciones.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");

function archivos(dir: string): string[] {
  const abs = join(RAIZ, dir);
  let nombres: string[] = [];
  try {
    nombres = readdirSync(abs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of nombres) {
    const p = join(abs, n);
    const rel = relative(RAIZ, p).replace(/\\/g, "/");
    if (statSync(p).isDirectory()) out.push(...archivos(rel));
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n)) out.push(rel);
  }
  return out;
}

const TODO = [...archivos("lib"), ...archivos("app"), ...archivos("components"), ...archivos("scripts")];
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

describe("⛔ las comunicaciones de HubSpot", () => {
  it("solo lib/comunicaciones consulta o escribe la tabla", () => {
    const malos = TODO.filter((rel) => !rel.startsWith("lib/comunicaciones/") && /\b(?:prisma|tx|db)\.comunicacionDeHubspot\./.test(leer(rel)));
    expect(malos).toEqual([]);
  });

  it("la escriben solo la copia y la lectura de compromisos", () => {
    const escritura = /comunicacionDeHubspot\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
    const escriben = TODO.filter((rel) => escritura.test(leer(rel))).sort();
    expect(escriben).toEqual(["lib/comunicaciones/compromisos-server.ts", "lib/comunicaciones/copia-server.ts"]);
  });

  it("nada de lo que ve el cliente importa lib/comunicaciones", () => {
    const deCara = TODO.filter((rel) => /^(lib\/external|app\/external|app\/api\/external|lib\/print|app\/print)\//.test(rel));
    const malos = deCara.filter((rel) => /from "@\/lib\/comunicaciones/.test(leer(rel)));
    expect(malos).toEqual([]);
  });

  it("de afuera, solo se entra por la puerta de lectura (o el job y el script)", () => {
    const permitidos = new Set([
      "lib/memoria/cargar.ts",
      "lib/nexus-chat/lecturas-server.ts",
      "lib/jobs/defs.ts",
      "lib/jobs/requisitos.ts",
      "lib/para-ti/fuentes/compromisos.ts",
      "scripts/sync-comunicaciones-de-hubspot.ts",
      // Un seguimiento por reunión (2026-10-19): la fecha y el asunto de un correo, por unaComunicacion.
      "scripts/agrupar-seguimientos-propuestos.ts",
    ]);
    const malos = TODO.filter((rel) => !rel.startsWith("lib/comunicaciones/") && /["']@\/lib\/comunicaciones\//.test(leer(rel)) && !permitidos.has(rel));
    expect(malos).toEqual([]);
  });
});
