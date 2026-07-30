/**
 * lib/projects/publicable.test.ts — la capacidad `publicable` se hace CUMPLIR.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Hasta esta tanda, `publicable: false` era una promesa que nadie cumplía: el overlay de
 * interno lo apagaba, la tira del proyecto se lo decía al CSE en pantalla, y NADA lo
 * impedía. Un proyecto interno de Smarteam se podía publicar y compartir igual que uno de
 * cliente. Una capacidad que nadie lee es peor que no tenerla: se lee como un control que
 * existe.
 *
 * Tres candados:
 *  1. Descubrimiento por DIRECTORIO de los endpoints de publicación. Un cuarto endpoint
 *     agregado mañana rompe el test hasta que lo gateen — que es lo contrario de una lista
 *     que hay que acordarse de actualizar.
 *  2. Nadie fuera de los DOS archivos sancionados resuelve un token de acceso externo. El
 *     diseño original ponía el gate solo en `resolveActiveAccess`, y resultó que
 *     `verify-access` no pasa por ahí: hace su propia consulta y entrega la cookie de 30
 *     días. Un tercer lugar volvería a abrir esa puerta.
 *  3. TODA capacidad de `ProjectCapabilities` la lee alguien, con lista de deuda
 *     SOLO-DECRECIENTE y un motivo escrito por cada una.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

/**
 * El código SIN las líneas de `import`.
 *
 * ⚠ Sin esto, un `toContain("guardX")` pasa aunque el guard esté borrado del cuerpo: el
 * `import` de arriba contiene el identificador. Ya nos pasó dos veces —lo descubrimos
 * rompiendo la guarda a propósito—, así que la respuesta vive acá y no en cada assert.
 */
function sinImports(src: string): string {
  return src.replace(/^import[\s\S]*?from\s+["'][^"']+["'];?[ \t]*$/gm, "");
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

describe("candado 1 — todo endpoint de PUBLICACIÓN pide el gate", () => {
  /** Descubre `app/api/**\/publish-*\/route.ts` — sin lista que mantener. */
  const rutasDePublicacion = (): string[] => {
    const out: string[] = [];
    const rec = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (!e.isDirectory()) continue;
        if (e.name.startsWith("publish-")) {
          const route = path.join(p, "route.ts");
          if (fs.existsSync(route)) out.push(route);
        }
        rec(p);
      }
    };
    rec(path.join(RAIZ, "app/api"));
    return out;
  };

  it("los descubre a todos (si esto baja de 3, alguien movió una ruta)", () => {
    expect(rutasDePublicacion().length).toBeGreaterThanOrEqual(3);
  });

  it("el que EXPORTA POST tiene que usar `guardPublicacionDeProyecto`", () => {
    /* El criterio es "exporta POST", no una lista de exclusión: `publish-suggestion` solo
       expone un GET que sugiere el texto del modal —no publica nada— y por eso queda afuera
       solo. Una lista de excepciones envejece; este criterio no. */
    let conPost = 0;
    for (const ruta of rutasDePublicacion()) {
      const src = sinImports(fs.readFileSync(ruta, "utf8"));
      if (!src.includes("export async function POST")) continue;
      conPost++;
      expect(
        src.includes("guardPublicacionDeProyecto("),
        `${path.relative(RAIZ, ruta)} publica al cliente sin preguntar si el proyecto lo ` +
          `admite. Un proyecto interno de Smarteam no tiene cliente del otro lado.`,
      ).toBe(true);
    }
    expect(conPost, "no encontré ningún endpoint de publicación con POST").toBe(3);
  });

  it("DESPUBLICAR no se gatea — el contenido no puede quedar atrapado", () => {
    /* Si un proyecto se marca interno DESPUÉS de haber publicado algo, el CSE tiene que
       poder bajarlo. Gatear el DELETE dejaría contenido de cliente publicado y sin salida. */
    for (const ruta of rutasDePublicacion()) {
      const src = fs.readFileSync(ruta, "utf8");
      const posDelete = src.indexOf("export async function DELETE");
      if (posDelete === -1) continue;
      expect(
        src.indexOf("guardPublicacionDeProyecto", posDelete),
        `${path.relative(RAIZ, ruta)}: el DELETE no debería gatear la publicación.`,
      ).toBe(-1);
    }
  });
});

describe("candado 2 — solo dos archivos resuelven un token de acceso externo", () => {
  const SANCIONADOS = [
    // El resolver común de las tres vistas externas.
    "lib\\external\\access.ts",
    // El canje contraseña → cookie de 30 días. NO pasa por el resolver: hace su propia
    // consulta, y por eso el check de `publicable` tiene que estar en los DOS.
    "app\\api\\external\\verify-access\\route.ts",
  ];

  it("nadie más consulta ProjectExternalAccess por accessToken", () => {
    /* Se busca la tabla `projectExternalAccess` + un where por token, y NO cualquier
       `where: { accessToken`. El Business Case tiene su propio acceso externo
       (`businessCaseExternalAccess`, lib/external/business-case-view.ts) y queda afuera a
       propósito: cuelga de un CLIENTE, no de un proyecto, así que `publicable` —que es una
       capacidad de proyecto— no tiene qué decir sobre él. Está mirado, no olvidado. */
    const culpables: string[] = [];
    for (const dir of ["lib", "app"]) {
      for (const f of archivosDe(dir)) {
        const rel = path.relative(RAIZ, f);
        if (SANCIONADOS.some((s) => rel.endsWith(s) || rel.endsWith(s.replace(/\\/g, "/")))) continue;
        const src = fs.readFileSync(f, "utf8");
        if (src.includes("projectExternalAccess") && src.includes("where: { accessToken")) {
          culpables.push(rel);
        }
      }
    }
    expect(
      culpables,
      "Un tercer lugar que canjea un token de PROYECTO es un tercer lugar donde hay que " +
        "acordarse del check de `publicable`. Si esto tiene que existir, primero movelo a " +
        "lib/external/access.ts.",
    ).toEqual([]);
  });

  it("los dos sancionados SÍ preguntan si el proyecto es publicable", () => {
    for (const rel of SANCIONADOS) {
      const src = sinImports(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
      expect(
        src,
        `${rel} resuelve un token de proyecto sin chequear si ese proyecto admite que lo ` +
          `miren de afuera. Se busca la LLAMADA negada — \`if (!publicableAfuera(…))\` — ` +
          `porque la sola mención del nombre no prueba que se use.`,
      ).toContain("if (!publicableAfuera(");
    }
  });
});

describe("candado 3 — toda capacidad la lee alguien", () => {
  /**
   * Deuda: capacidades que HOY nadie consulta, con su motivo. La lista solo puede
   * ACHICARSE — agregarle una entrada es admitir que se sumó una promesa vacía.
   */
  const DEUDA: Record<string, string> = {
    vigilante:
      "El watchdog no la lee: filtra por PROYECTO_DE_CARTERA_WHERE, que hoy coincide con " +
      "`vigilante` en las tres filas. El día que se separen, esto se cobra.",
    pestana:
      "Es `true` en TODAS las filas por decisión explícita (nadie pierde acceso a su " +
      "proyecto por esta tanda). Leerla sería preguntar algo cuya respuesta ya se sabe.",
  };

  it("cada capacidad tiene al menos un lector, o está en la deuda con su motivo", () => {
    const kind = fs.readFileSync(path.join(RAIZ, "lib/projects/kind.ts"), "utf8");
    // Las claves salen de la interfaz misma: si alguien agrega una capacidad, entra sola.
    const bloque = kind.slice(
      kind.indexOf("export interface ProjectCapabilities"),
      kind.indexOf("export type ProjectPipelineKey"),
    );
    const caps = [...bloque.matchAll(/^\s{2}(\w+): boolean;/gm)].map((m) => m[1]);
    expect(caps.length, "no pude leer ProjectCapabilities").toBeGreaterThan(3);

    const fuentes = ["lib", "app", "components"].flatMap((d) => archivosDe(d)).map((f) => fs.readFileSync(f, "utf8"));
    const sinLector = caps.filter((c) => !fuentes.some((s) => s.includes(`.${c}`)));

    for (const c of sinLector) {
      expect(
        DEUDA[c],
        `La capacidad "${c}" no la lee NADIE. Una capacidad que nadie consulta se lee como ` +
          `un control que existe y no existe — es exactamente lo que le pasaba a "publicable". ` +
          `Hacela cumplir en algún lado, o agregala a DEUDA con el motivo escrito.`,
      ).toBeDefined();
    }
    // Ratchet: lo que salió de la deuda no vuelve a entrar.
    expect(
      Object.keys(DEUDA).filter((c) => !sinLector.includes(c)),
      "Estas capacidades YA tienen lector: sacalas de DEUDA (la lista solo se achica).",
    ).toEqual([]);
  });
});
