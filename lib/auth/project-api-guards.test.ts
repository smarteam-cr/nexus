/**
 * lib/auth/project-api-guards.test.ts — CANDADO de las guardas de proyecto.
 *
 * Dos cosas que no se pueden re-abrir sin que este test falle:
 *
 *   N1 — La puerta con sesión es SOLO interna. `requireAccessToClient` tenía una rama
 *        `kind === "EXTERNAL"` que concedía acceso a TODOS los proyectos de "su" cliente
 *        sin mirar rol ni permisos. Hoy nadie la alcanza (el callback de login rechaza lo
 *        que no sea INTERNAL, nadie crea usuarios EXTERNAL, y el portal del cliente no usa
 *        Supabase Auth) — o sea que la seguridad de decenas de endpoints destructivos
 *        dependía de un filtro en la PANTALLA DE LOGIN, no de la guarda que esos endpoints
 *        invocan. El día que se construya el login de clientes, se abrían todos de golpe.
 *
 *   N2 — Ningún endpoint nuevo bajo app/api/projects/** nace sin guarda. Es un ratchet
 *        estructural (mismo molde que lib/cobranza/costos-privacy.test.ts): escanea el
 *        árbol real, parte cada archivo por handler y exige que el cuerpo invoque alguna
 *        guarda de proyecto. El piso de conteo evita que renombrar una carpeta lo deje
 *        pasando en vacío.
 *
 * Lo que este test NO puede hacer, y conviene decirlo en vez de fingirlo: no verifica que
 * la guarda corra ANTES del trabajo, solo que esté en el cuerpo del handler. El truco de
 * "prisma que lanza" de costos-privacy no sirve acá porque `guardAccessToProject` consulta
 * `prisma.project` legítimamente para resolver el cliente.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const BASE = "app/api/projects";

// ── N1 · La puerta interna ───────────────────────────────────────────────────

describe("el acceso a cliente es SOLO para gente interna", () => {
  const src = fs.readFileSync(path.join(RAIZ, "lib/auth/access.ts"), "utf8");
  // Se mira el CÓDIGO, no la prosa: el encabezado del archivo explica la historia y
  // menciona EXTERNAL varias veces a propósito.
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("requireAccessToClient entra por requireInternalUser", () => {
    const cuerpo = codigo.slice(
      codigo.indexOf("export async function requireAccessToClient"),
      codigo.indexOf("export interface AccessibleClientOpts"),
    );
    expect(
      cuerpo.includes("requireInternalUser("),
      "requireAccessToClient dejó de exigir usuario interno. Si hace falta acceso externo " +
        "con sesión, va por su PROPIA cadena (requireExternalUser + su filtro de visibilidad), " +
        "nunca reintroduciendo una rama por `kind` dentro de la cadena interna.",
    ).toBe(true);
    expect(cuerpo.includes("requireUser("), "volvió `requireUser()`, que acepta EXTERNAL").toBe(
      false,
    );
  });

  it("no existe una razón de acceso «porque es el cliente dueño»", () => {
    expect(
      codigo.includes("external-owner"),
      "reapareció el motivo de acceso external-owner: es la marca de la rama que concedía " +
        "todos los proyectos del cliente sin mirar rol ni permisos.",
    ).toBe(false);
  });

  it("ninguna rama por `kind` CONCEDE acceso dentro de la cadena interna", () => {
    // Se permite `if (user.kind === "EXTERNAL") return { id: "__none__" }` (denegar);
    // lo que no se permite es una rama que devuelva un AccessResult.
    const ramas = [...codigo.matchAll(/kind === "EXTERNAL"\)[\s\S]{0,220}/g)].map((m) => m[0]);
    for (const rama of ramas) {
      expect(
        /return\s*\{\s*user/.test(rama),
        `una rama por kind vuelve a CONCEDER acceso:\n${rama.slice(0, 200)}`,
      ).toBe(false);
    }
  });
});

// ── N2 · Ratchet: toda ruta de proyecto tiene guarda ─────────────────────────

/** Lista recursiva de los route.ts bajo `dir` (rutas relativas con "/"). */
function routes(dir: string, acc: string[] = []): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return acc;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) routes(rel, acc);
    else if (e.name === "route.ts") acc.push(rel);
  }
  return acc;
}

/**
 * Guardas que ACOTAN a un proyecto/cliente. `guardPermission(` a secas NO entra: una
 * celda de permiso sin ámbito no dice a QUÉ proyecto aplica. `guardCapability(` tampoco,
 * salvo `seeAllClients`, que es más estricta (equivale a clientes.viewAll: quien la tiene
 * pasa el acceso a todo cliente, y el CSE justamente NO la tiene).
 */
const GUARDAS = [
  "guardAccessToProject(",
  "guardProjectHandoffAccess(",
  "guardProjectEditHandoff(",
  "guardProjectGenerateHandoff(",
  "guardProjectCanvasDelete(",
  "guardTimelineEdit(",
  "guardTimelineDelete(",
  "withProjectAccess",
  'guardCapability("seeAllClients")',
];

/**
 * Handlers eximidos, con su motivo. No es un permiso incondicional: el test verifica
 * abajo que el handler siga siendo inerte. Si alguien lo revive con lógica real, la
 * excepción deja de aplicar y esto falla.
 */
const EXENTOS: Record<string, { metodos: string[]; motivo: string; inerte: boolean }> = {
  "app/api/projects/[projectId]/canvas/route.ts": {
    metodos: ["PUT"],
    motivo: "DESACTIVADO desde la migración a ClientContextCard: responde 410 sin tocar la DB.",
    inerte: true,
  },
};

// `export async function GET` y `export const GET` — hay rutas con los dos estilos, y un
// regex que solo mire `async function` las saltea EN SILENCIO.
const HANDLER = /export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/g;

describe("ninguna ruta de proyecto queda sin guarda", () => {
  const archivos = routes(BASE);

  it("el escaneo encuentra el árbol (no pasa en vacío)", () => {
    expect(archivos.length, `solo ${archivos.length} route.ts bajo ${BASE}`).toBeGreaterThanOrEqual(
      55,
    );
  });

  it("cada handler invoca una guarda que acota a un proyecto", () => {
    const ofensores: string[] = [];
    let total = 0;

    for (const rel of archivos) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      const hs = [...src.matchAll(HANDLER)];
      total += hs.length;
      const exento = EXENTOS[rel];

      for (let i = 0; i < hs.length; i++) {
        const metodo = hs[i][1];
        const cuerpo = src.slice(hs[i].index!, i + 1 < hs.length ? hs[i + 1].index! : src.length);
        if (exento?.metodos.includes(metodo)) {
          // La exención vale solo mientras el handler siga sin hacer nada.
          expect(
            exento.inerte && cuerpo.includes("status: 410") && !cuerpo.includes("prisma."),
            `${rel} ${metodo} está eximido por "${exento.motivo}" pero dejó de ser inerte — ` +
              "quitá la excepción y ponele guarda.",
          ).toBe(true);
          continue;
        }
        if (!GUARDAS.some((g) => cuerpo.includes(g))) ofensores.push(`${rel} → ${metodo}`);
      }
    }

    expect(total, `solo ${total} handlers — ¿el regex dejó de matchear?`).toBeGreaterThanOrEqual(90);
    expect(
      ofensores,
      "Estos handlers no invocan ninguna guarda de proyecto. Usá guardAccessToProject (o la " +
        `variante que corresponda) de lib/auth/api-guards.ts:\n${ofensores.join("\n")}`,
    ).toEqual([]);
  });
});

// ── N2b · Lo que se endureció no se ablanda ──────────────────────────────────

const ENDURECIDOS: Array<{ archivo: string; metodo: string; guarda: string; porque: string }> = [
  {
    archivo: "app/api/projects/[projectId]/canvases/[canvasId]/route.ts",
    metodo: "DELETE",
    guarda: "guardProjectCanvasDelete(",
    porque:
      "borra el canvas entero con cascada a secciones y bloques, sin vuelta atrás. Borrar UNA " +
      "tarea del cronograma ya exigía capacidad; el contenedor no puede estar más suelto.",
  },
];

describe("las guardas endurecidas siguen puestas", () => {
  for (const e of ENDURECIDOS) {
    it(`${e.archivo} ${e.metodo} exige ${e.guarda.replace("(", "")}`, () => {
      const abs = path.join(RAIZ, e.archivo);
      expect(fs.existsSync(abs), `${e.archivo} no existe — ¿se renombró?`).toBe(true);
      const src = fs.readFileSync(abs, "utf8");
      const hs = [...src.matchAll(HANDLER)];
      const i = hs.findIndex((h) => h[1] === e.metodo);
      expect(i, `${e.archivo} ya no exporta ${e.metodo}`).toBeGreaterThanOrEqual(0);
      const cuerpo = src.slice(hs[i].index!, i + 1 < hs.length ? hs[i + 1].index! : src.length);
      expect(cuerpo.includes(e.guarda), `${e.archivo} ${e.metodo}: ${e.porque}`).toBe(true);
    });
  }
});
