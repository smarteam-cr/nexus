/**
 * lib/sessions/empresa-de-la-reunion.test.ts — T3 y T8 NO ELIGEN EMPRESA POR SU CUENTA (escaneo estructural, 2026-10-25).
 *
 * El resolver vive en UN lugar (invariante 2 de CLAUDE.md: hubo tres copias y causaron un leak). Lo que proponen T3 y
 * lo que busca T8 tiene que salir de lib/sessions/categorize.ts, y lo que decide una persona se escribe SOLO por
 * `asignarDuenioManual` + `reResolveSession`. Esta guarda lee el fuente de cada archivo de T3 y T8 y falla si alguno
 * saca dominios de los correos a mano, matchea títulos, o escribe `resolvedClientId` / `manualClientId` directo.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "..", "..");

const ARCHIVOS_DE_T3_Y_T8 = [
  "lib/sessions/propuesta-de-empresa.ts",
  "lib/sessions/propuesta-de-empresa-server.ts",
  "lib/sessions/empresa-de-la-reunion-server.ts",
  "lib/sessions/buscar-en-la-empresa.ts",
  "lib/sessions/buscar-en-la-empresa-server.ts",
  "app/api/sessions/[id]/empresa/route.ts",
  "app/api/projects/[projectId]/session-candidates/en-otra-empresa/route.ts",
  "components/sessions/ElegirEmpresa.tsx",
  "components/sessions/EnOtraEmpresa.tsx",
];

/** El fuente sin comentarios (mencionar no es usar). */
function soloCodigo(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

const leer = (rel: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

describe("T3 y T8 no eligen empresa fuera de categorize.ts", () => {
  it("los archivos existen (si uno se mueve, la lista se actualiza aquí)", () => {
    for (const f of ARCHIVOS_DE_T3_Y_T8) expect(fs.existsSync(path.join(RAIZ, f)), f).toBe(true);
  });

  it("nadie saca el dominio de un correo a mano en JS (las piezas son extractParticipantDomains y effectiveDomainsForClient)", () => {
    for (const f of ARCHIVOS_DE_T3_Y_T8) {
      expect(leer(f), f).not.toMatch(/\.split\(\s*["']@["']\s*\)/);
      expect(leer(f), f).not.toMatch(/clientePorTitulo|findClientByTitleMatch|TITLE_MATCH_STOPWORDS/);
    }
  });

  it("la propuesta sale de categorizeSession", () => {
    expect(leer("lib/sessions/propuesta-de-empresa.ts")).toMatch(/categorizeSession\(/);
  });

  it("nadie escribe el dueño directo: solo asignarDuenioManual y reResolveSession", () => {
    for (const f of ARCHIVOS_DE_T3_Y_T8) {
      const c = leer(f);
      // Una escritura de Prisma o SQL con cualquiera de los dos campos (leerlos o pasarlos al resolver sí se puede).
      expect(c, f).not.toMatch(/data\s*:\s*\{[^}]*\b(resolvedClientId|manualClientId)\b/);
      expect(c, f).not.toMatch(/\bSET\s+"(resolvedClientId|manualClientId)"/i);
    }
    const decide = leer("lib/sessions/empresa-de-la-reunion-server.ts");
    expect(decide).toMatch(/asignarDuenioManual\(/);
    expect(decide).toMatch(/reResolveSession\(/);
  });
});
