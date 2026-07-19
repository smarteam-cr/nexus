/**
 * lib/ui/page-shell-coverage.test.ts — el registro de contenedores es EXHAUSTIVO
 * y VERAZ: toda ruta de app/(shell) está declarada, y las declaradas con `shell`
 * de verdad importan esa constante (una declaración que miente falla).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ } from "./scan-source";
import { PAGE_SHELL_COVERAGE } from "./page-shell-coverage";

const BASE = path.join("app", "(shell)");

function rutasConPage(dir: string, acc: string[] = []): string[] {
  const abs = path.join(RAIZ, dir);
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) rutasConPage(path.join(dir, e.name), acc);
    else if (e.name === "page.tsx") acc.push(dir);
  }
  return acc;
}

const norm = (s: string) => s.split(path.sep).join("/");
const RUTAS = rutasConPage(BASE).map((d) => norm(d).replace("app/(shell)/", "").replace("app/(shell)", ""));

describe("cobertura de contenedores (page-shell)", () => {
  it("toda ruta está declarada (una página nueva obliga a decidir su contenedor)", () => {
    const sinDeclarar = RUTAS.filter((r) => !(r in PAGE_SHELL_COVERAGE));
    expect(
      sinDeclarar,
      `Rutas sin declarar en PAGE_SHELL_COVERAGE (elegí un SHELL_* de lib/ui/page-shell ` +
        `o declarála custom con la razón):\n${sinDeclarar.join("\n")}`,
    ).toEqual([]);
  });

  it("no hay declaraciones huérfanas (rutas borradas salen del registro)", () => {
    const huerfanas = Object.keys(PAGE_SHELL_COVERAGE).filter((r) => !RUTAS.includes(r));
    expect(huerfanas, `Declaraciones sin ruta:\n${huerfanas.join("\n")}`).toEqual([]);
  });

  it("las rutas declaradas con `shell` importan ESA constante en su page.tsx", () => {
    const mentirosas: string[] = [];
    for (const [ruta, decl] of Object.entries(PAGE_SHELL_COVERAGE)) {
      if (!("shell" in decl)) continue;
      const src = fs.readFileSync(path.join(RAIZ, BASE, ...ruta.split("/"), "page.tsx"), "utf8");
      if (!src.includes(decl.shell)) mentirosas.push(`${ruta} (declara ${decl.shell})`);
    }
    expect(
      mentirosas,
      `Declaración y código no coinciden — el page.tsx no usa la constante declarada:\n${mentirosas.join("\n")}`,
    ).toEqual([]);
  });
});
