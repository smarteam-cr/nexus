/**
 * lib/roles/api-guards.test.ts — escaneo ESTRUCTURAL de `app/api/roles/**` y de las dos
 * páginas RSC de `app/(shell)/roles/`.
 *
 * ── POR QUÉ UN ESCÁNER Y NO CONFIANZA ────────────────────────────────────────
 * Desde que /roles se comparte, sus GET pasaron de `guardRolesAdmin` a
 * `guardInternalUser` + filtro. Ese cambio es exactamente el tipo de cosa que se relaja
 * de más en el archivo de al lado: el POST vive en el MISMO archivo que el GET, y aflojar
 * uno por copiar el otro no rompe nada visible. Este test lo frena.
 *
 * Reglas, todas verificables leyendo el fuente (patrón `costos-privacy.test.ts`):
 *   1. Todo handler de ESCRITURA (POST/PUT/PATCH/DELETE) invoca `guardRolesAdmin`.
 *   2. Ningún GET toca `prisma.` directo: la lectura pasa por `lib/roles/queries`, que es
 *      donde vive `visibleRoleWhere`. (Las excepciones se declaran acá abajo, con motivo.)
 *   3. Las páginas RSC leen con el subject REAL de quien pregunta, nunca con el centinela.
 *   4. El centinela `SYSTEM_SUBJECT` (leer sin filtrar) tiene allowlist, y cada caller
 *      declara con qué gate se ganó el derecho.
 *
 * ── DOS HUECOS QUE ESTE ARCHIVO YA TUVO ──────────────────────────────────────
 * · El regex de handlers solo miraba `export async function`. Decenas de route.ts del repo
 *   exportan `export const POST = withAuth(...)` / `withPermission(...)`: para esos
 *   `handlers()` devolvía `[]` y los `it` iteraban en VACÍO — verde sin verificar nada.
 *   Hoy matchea los dos estilos (igual que `lib/auth/project-api-guards.test.ts`) y, sobre
 *   todo, exige un PISO por archivo: es el piso —no el regex— lo que convierte un
 *   fail-open silencioso en un test rojo.
 * · La única superficie de LECTURA viva es un RSC (`/roles/[id]`) y ningún escáner la
 *   miraba: el filtro podía desaparecer de la página sin romper un solo test.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const DIR = path.join(RAIZ, "app", "api", "roles");
const DIR_PAGES = path.join(RAIZ, "app", "(shell)", "roles");
const QUERIES = path.join(RAIZ, "lib", "roles", "queries.ts");

/**
 * GET que sí pueden usar Prisma directo, con su razón. No leen CONTENIDO del documento:
 * `publico` devuelve el estado del link (y ya exige guardRolesAdmin), `shares` la lista de
 * con quién está compartido (ídem).
 */
const GET_CON_PRISMA_PERMITIDO = new Set(["publico/route.ts", "shares/route.ts"]);

/**
 * `export async function GET` y `export const GET = withAuth(...)`: el repo usa los DOS
 * estilos, y un regex que solo mire `async function` saltea el mayoritario EN SILENCIO.
 * Mismo patrón que `lib/auth/project-api-guards.test.ts`.
 */
const HANDLER = /export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/g;

function routes(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Corta el fuente en bloques por handler exportado. */
function handlers(src: string): { metodo: string; cuerpo: string }[] {
  const marcas = [...src.matchAll(HANDLER)];
  return marcas.map((m, i) => ({
    metodo: m[1],
    cuerpo: src.slice(m.index!, i + 1 < marcas.length ? marcas[i + 1].index! : src.length),
  }));
}

/**
 * Blanquea comentarios y literales de string CONSERVANDO los offsets, para que el escaneo
 * mire el CÓDIGO. Sin esto, una página que MENCIONA `getRole` en su docstring —y la de
 * `/roles/[id]` lo hace— alcanzaría para dar el test por verde. Es el mismo blanqueo (y por
 * la misma lección) que `lib/cobranza/costos-privacy.test.ts` §P4.
 */
function soloCodigo(src: string): string {
  const out = src.split("");
  const blanquear = (desde: number, hasta: number) => {
    for (let k = desde; k < hasta && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const fin = src.indexOf("\n", i);
      blanquear(i, fin === -1 ? src.length : fin);
      i = fin === -1 ? src.length : fin;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      const hasta = fin === -1 ? src.length : fin + 2;
      blanquear(i, hasta);
      i = hasta;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      blanquear(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

/**
 * Los argumentos de la llamada que arranca en `desde` (índice del identificador), por
 * paréntesis balanceados — no por un slice de N caracteres, que corta a mitad de argumento
 * en cuanto alguien reformatea. Corre sobre fuente ya blanqueada, así que un paréntesis
 * dentro de un string no descuadra el conteo.
 */
function argsDeLlamada(src: string, desde: number): string {
  const abre = src.indexOf("(", desde);
  if (abre === -1) return "";
  let nivel = 0;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === "(") nivel++;
    else if (src[i] === ")" && --nivel === 0) return src.slice(abre + 1, i);
  }
  return src.slice(abre + 1);
}

describe("guards de app/api/roles", () => {
  const rutas = routes(DIR);

  it("las rutas existen (si alguien renombra la carpeta, esto avisa)", () => {
    expect(rutas.length).toBeGreaterThanOrEqual(5);
  });

  it("CADA route.ts expone al menos un handler (el escáner no pasa en vacío)", () => {
    // El piso por archivo es lo que hace RUIDOSO el fail-open: si un estilo de export nuevo
    // deja de matchear, este `it` se pone rojo en vez de que los otros pasen sin verificar.
    for (const ruta of rutas) {
      const src = fs.readFileSync(ruta, "utf8");
      expect(
        handlers(src).length,
        `${path.relative(RAIZ, ruta)} — 0 handlers detectados. O el archivo no exporta ` +
          "ninguno, o usa un estilo de export que el regex HANDLER no conoce: agregalo ahí, " +
          "porque mientras tanto los guards de ese archivo NO se están verificando.",
      ).toBeGreaterThan(0);
    }
  });

  it("TODA escritura exige guardRolesAdmin", () => {
    for (const ruta of rutas) {
      // ⚠ `soloCodigo` NO es opcional acá: sin él, un handler que solo MENCIONE
      // `guardRolesAdmin(` en un comentario o en un string pasa el test sin llamarlo nunca.
      // Es exactamente el agujero §P4 que ya se pagó una vez en costos-privacy.test.ts.
      const src = soloCodigo(fs.readFileSync(ruta, "utf8"));
      for (const h of handlers(src)) {
        if (h.metodo === "GET") continue;
        expect(
          h.cuerpo.includes("guardRolesAdmin("),
          `${path.relative(RAIZ, ruta)} — ${h.metodo} SIN guardRolesAdmin (compartir da LECTURA)`,
        ).toBe(true);
      }
    }
  });

  it("ningún GET de contenido consulta Prisma sin pasar por lib/roles/queries", () => {
    for (const ruta of rutas) {
      const rel = path.relative(DIR, ruta).replace(/\\/g, "/");
      const permitido = [...GET_CON_PRISMA_PERMITIDO].some((p) => rel.endsWith(p));
      if (permitido) continue;
      const src = fs.readFileSync(ruta, "utf8");
      for (const h of handlers(src)) {
        if (h.metodo !== "GET") continue;
        expect(
          h.cuerpo.includes("prisma."),
          `${rel} — el GET usa prisma directo; la lectura va por getRole/loadRoles (visibleRoleWhere)`,
        ).toBe(false);
      }
    }
  });

  it("los GET de lectura pasan por el filtro de visibilidad", () => {
    // El `subject` es lo que activa `visibleRoleWhere` dentro de queries.ts: con el
    // centinela (o con el de otra persona) la consulta no filtra y un CSE vería todas las
    // propuestas.
    for (const archivo of ["route.ts", path.join("[id]", "route.ts")]) {
      const src = fs.readFileSync(path.join(DIR, archivo), "utf8");
      const get = handlers(src).find((h) => h.metodo === "GET");
      expect(get, `${archivo} sin GET`).toBeTruthy();
      expect(
        get!.cuerpo.includes("teamMemberId: guard.teamMember.id"),
        `${archivo} — el GET no pasa el subject a la query`,
      ).toBe(true);
    }
  });
});

// ── Las páginas RSC, que ningún escáner miraba ───────────────────────────────

describe("las páginas de /roles leen con el subject REAL", () => {
  const PAGINAS = ["page.tsx", path.join("[id]", "page.tsx")];

  it("existen las dos páginas (si se renombra la carpeta, esto avisa)", () => {
    for (const rel of PAGINAS) {
      expect(fs.existsSync(path.join(DIR_PAGES, rel)), `falta app/(shell)/roles/${rel}`).toBe(true);
    }
  });

  it("cada lectura pasa el subject de quien pregunta, nunca el centinela ni Prisma", () => {
    let lecturasConSubject = 0;

    for (const rel of PAGINAS) {
      const nombre = `app/(shell)/roles/${rel.replace(/\\/g, "/")}`;
      // Comentarios y strings blanqueados: mencionar `getRole` no es llamarlo.
      const src = soloCodigo(fs.readFileSync(path.join(DIR_PAGES, rel), "utf8"));

      expect(
        src.includes("prisma."),
        `${nombre} — la página usa prisma directo; la lectura va por lib/roles/queries, ` +
          "que es donde vive visibleRoleWhere",
      ).toBe(false);

      expect(
        src.includes("SYSTEM_SUBJECT"),
        `${nombre} — una superficie CON SESIÓN nunca usa el centinela: con él la consulta ` +
          "deja de filtrar y cualquier interno abre una propuesta con su oferta salarial",
      ).toBe(false);

      for (const m of src.matchAll(/\b(getRole|loadRoles)\s*\(/g)) {
        const args = argsDeLlamada(src, m.index!);
        expect(
          args.includes("teamMember"),
          `${nombre} — ${m[1]}(...) sin el subject real de quien pregunta:\n  ${args.trim()}`,
        ).toBe(true);
        lecturasConSubject++;
      }
    }

    expect(
      lecturasConSubject,
      "ninguna página de /roles lee por lib/roles/queries. Si la lectura se movió, mové " +
        "también este chequeo — no lo borres: es el único que mira las páginas.",
    ).toBeGreaterThan(0);
  });
});

// ── El centinela de sistema: allowlist, no costumbre ─────────────────────────

/**
 * Los únicos archivos que pueden leer SIN filtrar, y el gate con el que se lo ganaron.
 * Sumar uno es una decisión visible en el diff; el valor es el texto que prueba el gate.
 *
 * El escaneo cubre `app/`, `lib/` y `components/` — las superficies con sesión, que es
 * donde un olvido se convierte en fuga. `scripts/` queda fuera a propósito: corre fuera de
 * toda sesión, con la mano del usuario, y no expone nada por HTTP.
 */
const CALLERS_DEL_CENTINELA: Record<string, string> = {
  "lib/roles/access.ts": "", // acá se DEFINE
  "app/api/roles/[id]/assist/route.ts": "guardRolesAdmin(",
  "lib/print/load-doc.ts": "authorizePrintDoc",
};

function fuentes(dir: string, acc: string[] = []): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) fuentes(rel, acc);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(rel);
  }
  return acc;
}

describe("SYSTEM_SUBJECT — leer sin filtrar es explícito y tiene allowlist", () => {
  const conCentinela = fuentes("app")
    .concat(fuentes("lib"), fuentes("components"))
    // Primero el `includes` crudo (barato, corre sobre ~mil archivos) y recién sobre los
    // que pegan se paga el blanqueo: NOMBRAR el centinela en un comentario —queries.ts
    // explica ahí cuándo usarlo— no es usarlo.
    .filter((rel) => {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      return src.includes("SYSTEM_SUBJECT") && soloCodigo(src).includes("SYSTEM_SUBJECT");
    });

  it("el escaneo encuentra las fuentes (no pasa en vacío)", () => {
    expect(fuentes("app").length + fuentes("lib").length).toBeGreaterThan(200);
    expect(conCentinela.length).toBeGreaterThanOrEqual(3);
  });

  it("nadie fuera de la allowlist lee sin filtrar", () => {
    const intrusos = conCentinela.filter((rel) => !(rel in CALLERS_DEL_CENTINELA));
    expect(
      intrusos,
      "Estos archivos usan SYSTEM_SUBJECT, o sea que leen /roles SIN filtro de " +
        "visibilidad. Si el caller ya gateó antes (y puede probarlo), declaralo en " +
        `CALLERS_DEL_CENTINELA con su gate; si no, pasá el subject real:\n${intrusos.join("\n")}`,
    ).toEqual([]);
  });

  for (const [rel, gate] of Object.entries(CALLERS_DEL_CENTINELA)) {
    if (!gate) continue;
    it(`${rel} sigue gateando con ${gate.replace("(", "")} antes de leer sin filtrar`, () => {
      const abs = path.join(RAIZ, rel);
      expect(fs.existsSync(abs), `${rel} no existe — ¿se movió? Actualizá la allowlist.`).toBe(true);
      const src = soloCodigo(fs.readFileSync(abs, "utf8"));
      expect(
        src.includes(gate),
        `${rel} usa SYSTEM_SUBJECT pero ya no invoca ${gate} — sin ese gate, saltarse el ` +
          "filtro deja de estar justificado.",
      ).toBe(true);
    });
  }

  it("queries.ts EXIGE el subject y filtra siempre (no volvió a ser opcional)", () => {
    const src = soloCodigo(fs.readFileSync(QUERIES, "utf8"));
    for (const fn of ["loadRoles", "getRole"]) {
      const m = new RegExp(`export async function ${fn}\\(([^)]*)\\)`).exec(src);
      expect(m, `queries.ts ya no exporta ${fn}`).toBeTruthy();
      expect(
        /subject\s*\?/.test(m![1]),
        `${fn}: el subject volvió a ser OPCIONAL. Ese era el hueco: olvidarlo compilaba, ` +
          "pasaba lint y pasaba los tests, y dejaba la consulta sin filtrar.",
      ).toBe(false);
      expect(/\bsubject\s*:/.test(m![1]), `${fn} perdió el parámetro subject`).toBe(true);
    }
    expect(
      /subject\s*\?[^?:]*visibleRoleWhere/.test(src),
      "volvió el `where` condicional (`subject ? visibleRoleWhere(subject) : …`): sin subject " +
        "la consulta no filtra.",
    ).toBe(false);
  });
});
