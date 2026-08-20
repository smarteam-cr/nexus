/**
 * lib/external/propuesta-abierta.test.ts — los candados de la propuesta SIN contraseña.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Desde el 2026-08-20 una propuesta se comparte por defecto sin contraseña: la URL ES el
 * secreto, y esa URL lleva precios. Todo lo que la protege se reduce a cuatro cosas
 * frágiles, cada una a un descuido de distancia:
 *
 *   1. Que el token se resuelva SIEMPRE por el chokepoint. Un quinto archivo que consulte
 *      `businessCaseExternalAccess` por `accessToken` es un quinto lugar donde acordarse de
 *      revocado + publicado + caducado. Es exactamente la falla que ya se pagó del lado de
 *      proyectos (ver lib/projects/publicable.test.ts, candado 2).
 *   2. Que las páginas con token en la URL sean `force-dynamic`. Sin eso Next cachea el
 *      segmento y **revocar el link no surte efecto**.
 *   3. Que la puerta abierta declare `noindex`. La URL circula por correo y no tiene otra
 *      puerta detrás.
 *   4. Que la puerta abierta declare `referrer: "no-referrer"`. Esta página —a diferencia
 *      del verify— pinta el landing entero, y el logo del cliente sale de Supabase Storage
 *      (otro origen): sin la meta, el `Referer` de esa imagen se lleva el token puesto.
 *
 * Ninguna de las cuatro se rompe con un error visible: se rompen en silencio y la propuesta
 * de un cliente queda indexable, cacheada o filtrada. Por eso son test y no comentario.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/** Igual que en publicable.test.ts: mencionar un símbolo en un comentario no es usarlo. */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

function archivosDe(dir: string, ext = [".ts", ".tsx"]): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (ext.some((x) => e.name.endsWith(x)) && !e.name.includes(".test.")) out.push(p);
    }
  };
  rec(path.join(RAIZ, dir));
  return out;
}

const rel = (f: string) => path.relative(RAIZ, f).replace(/\\/g, "/");

const PAGINA_ABIERTA = path.join(RAIZ, "app/external/propuesta/[token]/page.tsx");

describe("candado 1 — solo el chokepoint resuelve un token de PROPUESTA", () => {
  /* Los cuatro que pueden tocar la tabla por token, y por qué:
     - el chokepoint (el resolver de las dos puertas),
     - verify-access (canjea contraseña por cookie; NO pasa por el resolver),
     - external-access (panel interno, gateado con guardSalesAccess; no sirve contenido),
     - mutations (crea/rota el acceso; tampoco sirve contenido). */
  const SANCIONADOS = [
    "lib/external/business-case-view.ts",
    "app/api/external/business-case/verify-access/route.ts",
    "app/api/business-cases/[id]/external-access/route.ts",
    "lib/business-cases/mutations.ts",
  ];

  it("nadie más consulta businessCaseExternalAccess por accessToken", () => {
    const culpables: string[] = [];
    for (const dir of ["lib", "app", "components"]) {
      for (const f of archivosDe(dir)) {
        if (SANCIONADOS.includes(rel(f))) continue;
        const src = sinComentarios(fs.readFileSync(f, "utf8"));
        if (src.includes("businessCaseExternalAccess") && /where:\s*\{\s*accessToken/.test(src)) {
          culpables.push(rel(f));
        }
      }
    }
    expect(
      culpables,
      "Un quinto lugar que canjea un token de PROPUESTA es un quinto lugar donde hay que " +
        "acordarse de revocado + publicado + caducado. Si tiene que existir, primero movelo " +
        "a lib/external/business-case-view.ts.",
    ).toEqual([]);
  });
});

describe("candado 2 — toda página externa con token en la URL es force-dynamic", () => {
  /** Descubre `app/external/**\/[token]/page.tsx` — sin lista que mantener. */
  const paginasConToken = (): string[] =>
    archivosDe("app/external").filter(
      (f) => f.endsWith("page.tsx") && path.basename(path.dirname(f)) === "[token]",
    );

  it("las descubre (la abierta y la de verify, como mínimo)", () => {
    expect(paginasConToken().length).toBeGreaterThanOrEqual(2);
  });

  it("cada una declara force-dynamic", () => {
    const sinDynamic = paginasConToken()
      .filter((f) => !/export const dynamic\s*=\s*"force-dynamic"/.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(
      sinDynamic,
      "Sin force-dynamic, Next cachea el segmento y revocar el link deja de surtir efecto.",
    ).toEqual([]);
  });
});

describe("candado 3 — la puerta ABIERTA no se indexa ni filtra el token", () => {
  const src = () => fs.readFileSync(PAGINA_ABIERTA, "utf8");

  it("la página existe donde el constructor de URLs dice", () => {
    expect(fs.existsSync(PAGINA_ABIERTA)).toBe(true);
  });

  it("declara noindex", () => {
    expect(
      /robots:\s*\{[^}]*index:\s*false/.test(sinComentarios(src())),
      "La URL circula por correo y no tiene otra puerta detrás: tiene que ir noindex.",
    ).toBe(true);
  });

  it('declara referrer: "no-referrer"', () => {
    expect(
      /referrer:\s*"no-referrer"/.test(sinComentarios(src())),
      "El landing pinta el logo del cliente desde otro origen; sin esta meta, el header " +
        "Referer de esa imagen se lleva el token puesto a un tercero.",
    ).toBe(true);
  });
});
