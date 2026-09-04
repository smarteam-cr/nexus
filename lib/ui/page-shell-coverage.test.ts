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

describe("C-15: el shell no exporta `revalidate`, y las fuentes de landing no se precargan en la app", () => {
  /**
   * Toda página de app/(shell) es DINÁMICA: el layout lee la cookie del tema y cada page llama a
   * un `require…User`. Un `export const revalidate = N` ahí no cachea nada — solo promete algo
   * que Next ignora, y el próximo que lo lea cree que la página se sirve cacheada. Cinco páginas
   * lo tenían (medido el 2026-09-04). Y el layout raíz declara tres familias de landing que
   * ninguna página interna usa: con el default, Next precargaba sus archivos en TODAS.
   */
  it("ninguna page.tsx de app/(shell) exporta revalidate", () => {
    /* La edición que lo pone en rojo: volver a poner `export const revalidate = 60` en una page
       del shell «para que cachee» — no cachea, y miente. */
    const conRevalidate = RUTAS.map((r) => path.join(BASE, r, "page.tsx"))
      .filter((f) => /^export const revalidate\b/m.test(fs.readFileSync(path.join(RAIZ, f), "utf8")))
      .map(norm);
    expect(RUTAS.length, "la guarda no está mirando ninguna página").toBeGreaterThan(20);
    expect(conRevalidate, "revalidate en una ruta dinámica: no aplica y engaña al que lo lee").toEqual([]);
  });

  it("las tres familias de landing llevan preload: false; Geist (la de la app) no", () => {
    /* La edición que lo pone en rojo: sacar `preload: false` de una familia «porque la landing
       la usa» — la landing la sigue pidiendo igual; lo que vuelve es la precarga en toda la app. */
    const src = fs.readFileSync(path.join(RAIZ, "app/layout.tsx"), "utf8");
    for (const familia of ["Montserrat(", "Open_Sans(", "Plus_Jakarta_Sans("]) {
      const i = src.indexOf(familia);
      expect(i, `${familia} salió del layout`).toBeGreaterThan(-1);
      const bloque = src.slice(i, src.indexOf("});", i));
      expect(bloque, `${familia} se precarga en toda la app`).toContain("preload: false");
    }
    const geist = src.slice(src.indexOf("Geist({"), src.indexOf("});", src.indexOf("Geist({")));
    expect(geist, "Geist es la fuente de la app: sí se precarga").not.toContain("preload: false");
  });
});
