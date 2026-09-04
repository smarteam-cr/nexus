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
  // Es `guardAccessToProject` + la exigencia de que el proyecto ADMITA publicación externa
  // (lib/projects/kind.ts → `publicable`). Acota igual de fuerte; encima, más.
  "guardPublicacionDeProyecto(",
  "guardProjectHandoffAccess(",
  "guardProjectEditHandoff(",
  "guardProjectGenerateHandoff(",
  "guardProjectCanvasDelete(",
  "guardTimelineEdit(",
  "guardTimelineDelete(",
  "guardTimelineFullRegen(",
  // Hace guardAccessToProject + una vara de capacidad que depende de si el cronograma tiene
  // tareas (vacío → la del apply por fase; con tareas → la del regen completo). Acota igual.
  "guardTimelineDetailApply(",
  "withProjectAccess",
  'guardCapability("seeAllClients")',
];

/**
 * Handlers eximidos, con su motivo. NUNCA es un permiso incondicional: cada excepción trae la
 * condición que la sostiene, y el test la verifica. Si el handler deja de cumplirla, la
 * excepción caduca sola y esto falla.
 *
 *   `inerte` — el handler no hace nada (responde 410 sin tocar la DB).
 *   `exige`  — el handler SÍ hace algo, pero acota por otra unidad. Se listan las guardas
 *              concretas que lo acotan; tienen que estar TODAS.
 */
const EXENTOS: Record<
  string,
  { metodos: string[]; motivo: string; inerte?: boolean; exige?: string[] }
> = {
  "app/api/projects/[projectId]/canvas/route.ts": {
    metodos: ["PUT"],
    motivo: "DESACTIVADO desde la migración a ClientContextCard: responde 410 sin tocar la DB.",
    inerte: true,
  },
  "app/api/projects/route.ts": {
    metodos: ["POST"],
    motivo:
      "EL ALTA (Tanda C): es el único handler del árbol que CREA el proyecto. No puede acotar a " +
      "un proyecto porque todavía no existe — la unidad correcta es el CLIENTE. La excepción " +
      "vale mientras siga gateado por la celda `proyectos.create` Y acotado al cliente: " +
      "`guardAccessToClient` para uno existente, `seeAllClients` para fabricar uno nuevo desde " +
      "una empresa de HubSpot.",
    exige: [
      'guardPermission("proyectos", "create")',
      "guardAccessToClient(",
      'guardCapability("seeAllClients")',
    ],
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
          if (exento.inerte) {
            // La exención vale solo mientras el handler siga sin hacer nada.
            expect(
              cuerpo.includes("status: 410") && !cuerpo.includes("prisma."),
              `${rel} ${metodo} está eximido por "${exento.motivo}" pero dejó de ser inerte — ` +
                "quitá la excepción y ponele guarda.",
            ).toBe(true);
          } else {
            // La exención vale solo mientras el handler siga acotando por la otra unidad.
            const faltan = (exento.exige ?? []).filter((g) => !cuerpo.includes(g));
            expect(
              faltan,
              `${rel} ${metodo} está eximido por "${exento.motivo}" pero perdió las guardas que ` +
                `sostienen la excepción: ${faltan.join(", ")}`,
            ).toEqual([]);
            expect(
              (exento.exige ?? []).length,
              `la excepción de ${rel} ${metodo} no declara ninguna condición: sería un pase libre`,
            ).toBeGreaterThan(0);
          }
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

describe("⛔ la sesión de un desactivado no sirve: requireConsultantSession exige usuario interno", () => {
  /**
   * Auditoría 2026-09-03: `requireConsultantSession` —la guarda de 35 handlers y 13 páginas— miraba
   * solo que existiera un usuario de Supabase. Un empleado desactivado con la pestaña abierta seguía
   * entrando (y el middleware le renovaba la sesión en cada request, así que no expiraba nunca); entre
   * lo que veía: el `systemPrompt` de los 30 agentes y las transcripciones de cualquier reunión.
   *
   * La edición que la pone en rojo: volver a `getSupabaseUser()` «porque es más liviano». Es
   * exactamente la versión vieja.
   */
  const src = fs.readFileSync(path.join(RAIZ, "lib/auth.ts"), "utf8");
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const desde = codigo.indexOf("export async function requireConsultantSession");
  const cuerpo = codigo.slice(desde, codigo.indexOf("export ", desde + 10));

  it("la función existe y la guarda la encuentra", () => {
    expect(desde, "se movió requireConsultantSession: la guarda no mira nada").toBeGreaterThan(0);
    expect(cuerpo.length).toBeGreaterThan(40);
  });

  it("⭐ delega en requireInternalUser (INTERNAL + TeamMember + no desactivado)", () => {
    expect(cuerpo, "volvió a conformarse con la sesión: un desactivado entra de nuevo").toContain(
      "requireInternalUser(",
    );
  });

  it("⛔ y ya no se conforma con getSupabaseUser", () => {
    expect(cuerpo, "volvió getSupabaseUser(): acepta a cualquiera con sesión, desactivado incluido").not.toContain(
      "getSupabaseUser(",
    );
  });
});

// ── N2c · Las tarjetas también: una card es de un cliente, y la guarda es ESA ─────────────

describe("⛔ ninguna ruta de tarjetas queda sin guarda de cliente", () => {
  /**
   * Auditoría 2026-09-03: `app/api/cards/[cardId]/*` no tenía NINGUNA guarda propia. Lo único que
   * las frenaba era el middleware, que deja pasar cualquier sesión: quien conociera un id de card
   * podía aceptar/fusionar/borrar borradores de cualquier cliente, y `send-to-canvas` clonaba
   * contenido a un proyecto de CUALQUIER cliente vía `targetProjectId` del body. Era una puerta
   * lateral al mismo dato que el ratchet de arriba cerró para `app/api/projects`.
   *
   * Acá no hay `clientId` en la URL: el ámbito sale de la tarjeta, así que la guarda válida es
   * `guardAccessToClient(` sobre `card.clientId`, y tiene que estar en TODOS los handlers.
   */
  const BASE_CARDS = "app/api/cards";
  const archivos = routes(BASE_CARDS);

  it("el escaneo encuentra el árbol (no pasa en vacío)", () => {
    expect(archivos.length, `solo ${archivos.length} route.ts bajo ${BASE_CARDS}`).toBeGreaterThanOrEqual(2);
  });

  it("⭐ cada handler carga la tarjeta y pasa por guardAccessToClient", () => {
    const ofensores: string[] = [];
    let total = 0;
    for (const rel of archivos) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      const hs = [...src.matchAll(HANDLER)];
      total += hs.length;
      for (let i = 0; i < hs.length; i++) {
        const cuerpo = src.slice(hs[i].index!, i + 1 < hs.length ? hs[i + 1].index! : src.length);
        if (!cuerpo.includes("guardAccessToClient(")) ofensores.push(`${rel} → ${hs[i][1]}`);
      }
    }
    expect(total, `solo ${total} handlers bajo ${BASE_CARDS} — ¿el regex dejó de matchear?`).toBeGreaterThanOrEqual(3);
    expect(
      ofensores,
      `Estos handlers de tarjetas no acotan por cliente (guardAccessToClient sobre card.clientId):\n${ofensores.join("\n")}`,
    ).toEqual([]);
  });

  it("⛔ y el proyecto destino de send-to-canvas se cruza con el cliente de la tarjeta", () => {
    /* Un `targetProjectId` del body sin cruzar es exactamente el clon a un cliente ajeno. */
    const src = fs.readFileSync(path.join(RAIZ, `${BASE_CARDS}/[cardId]/send-to-canvas/route.ts`), "utf8");
    expect(src, "volvió a aceptarse el proyecto destino sin cruzarlo con el cliente").toMatch(
      /project\.findFirst\(\{\s*where:\s*\{\s*id:\s*destProjectId,\s*clientId:\s*original\.clientId/,
    );
  });
});

// ── N2d · Las rutas de cliente: el ámbito es el cliente de la URL ─────────────────────────

describe("⛔ ninguna ruta bajo app/api/clients/[id] queda sin guarda de cliente", () => {
  /**
   * Auditoría 2026-09-03: seis rutas bajo `clients/[id]` recibían el id de la URL con `withAuth`
   * (cualquier sesión) y no lo cruzaban con el acceso del usuario. Un CSE —el único rol scoped—
   * leía las tarjetas de contexto, los deals con sus montos y la ficha comercial de TODOS los
   * clientes, y podía re-apuntar el vínculo HubSpot de un cliente ajeno (lo que después contamina
   * handoffs, CS360 y cobranza con datos de otra empresa).
   *
   * Acá la guarda válida es la que acota al cliente de la URL: `withClientAccess(` o
   * `guardAccessToClient(`. Las de proyecto también valen (acotan más). Y hay excepciones, todas
   * con la condición que las sostiene: una CAPACIDAD que solo tienen los roles que ven todos los
   * clientes (`clientes.delete` y `clientes.share` son de CSL/SA; `ventas.read` de Ventas/CSL/SA —
   * ver lib/auth/permissions/defaults.ts). Si esa capacidad se le diera al CSE, estas excepciones
   * dejarían de valer y habría que volver a acotar por cliente.
   */
  const BASE_CLIENTES = "app/api/clients/[id]";
  const GUARDAS_CLIENTE = [...GUARDAS, "withClientAccess(", "guardAccessToClient("];
  const EXENTOS_CLIENTE: Record<string, { metodos: string[]; motivo: string; exige: string[] }> = {
    "app/api/clients/[id]/route.ts": {
      metodos: ["DELETE"],
      motivo: "borrar un cliente es de quien ve todos los clientes (clientes.delete: CSL/SA)",
      exige: ['guardCapability("deleteClients")'],
    },
    "app/api/clients/[id]/projects/[projectId]/route.ts": {
      metodos: ["DELETE"],
      motivo: "ídem, y además cruza el proyecto con el cliente de la URL",
      exige: ['guardCapability("deleteClients")', "project.clientId !== clientId"],
    },
    "app/api/clients/[id]/assignments/route.ts": {
      metodos: ["GET", "POST"],
      motivo: "compartir clientes es de quien ve todos (clientes.share: CSL/SA)",
      exige: ['guardCapability("shareClients")'],
    },
    "app/api/clients/[id]/assignments/[assignmentId]/route.ts": {
      metodos: ["DELETE"],
      motivo: "ídem, y cruza la asignación con el cliente de la URL",
      exige: ['guardCapability("shareClients")', "existing.clientId !== id"],
    },
    "app/api/clients/[id]/business-cases/route.ts": {
      metodos: ["GET", "POST"],
      motivo: "las propuestas comerciales son de Ventas/CSL/SA, que ven todos los clientes (ventas.read)",
      exige: ["guardSalesAccess()"],
    },
  };
  const archivos = routes(BASE_CLIENTES);

  it("el escaneo encuentra el árbol (no pasa en vacío)", () => {
    expect(archivos.length, `solo ${archivos.length} route.ts bajo ${BASE_CLIENTES}`).toBeGreaterThanOrEqual(20);
  });

  it("⭐ cada handler acota al cliente de la URL, o es una excepción que sigue sosteniéndose", () => {
    const ofensores: string[] = [];
    let total = 0;
    for (const rel of archivos) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      const hs = [...src.matchAll(HANDLER)];
      total += hs.length;
      const exento = EXENTOS_CLIENTE[rel];
      for (let i = 0; i < hs.length; i++) {
        const metodo = hs[i][1];
        const cuerpo = src.slice(hs[i].index!, i + 1 < hs.length ? hs[i + 1].index! : src.length);
        if (exento?.metodos.includes(metodo)) {
          const faltan = exento.exige.filter((g) => !cuerpo.includes(g));
          expect(
            faltan,
            `${rel} ${metodo} está eximido por «${exento.motivo}» pero perdió lo que sostiene la excepción: ${faltan.join(", ")}`,
          ).toEqual([]);
          continue;
        }
        if (!GUARDAS_CLIENTE.some((g) => cuerpo.includes(g))) ofensores.push(`${rel} → ${metodo}`);
      }
    }
    expect(total, `solo ${total} handlers bajo ${BASE_CLIENTES} — ¿el regex dejó de matchear?`).toBeGreaterThanOrEqual(30);
    expect(
      ofensores,
      `Estos handlers reciben el id del cliente y no lo cruzan con el acceso del usuario (withClientAccess / guardAccessToClient):\n${ofensores.join("\n")}`,
    ).toEqual([]);
  });

  it("⛔ deal-line-items cruza el projectId del query con el cliente de la URL", () => {
    /* Sin esto, un proyecto de OTRO cliente hacía que la ruta leyera y GUARDARA el deal ajeno. */
    const src = fs.readFileSync(path.join(RAIZ, `${BASE_CLIENTES}/deal-line-items/route.ts`), "utf8");
    expect(src).toContain("where: { id: projectId, clientId }");
  });

  it("⛔ hubspot-info no hace include de la cuenta: los tokens no entran a memoria por un GET de ficha", () => {
    const src = fs.readFileSync(path.join(RAIZ, `${BASE_CLIENTES}/hubspot-info/route.ts`), "utf8");
    expect(src, "volvió el include amplio: accessToken y refreshToken viajan en memoria por un GET").not.toContain(
      "include: { hubspotAccount: true }",
    );
  });

  it("⛔ crear un cliente con un token de HubSpot pide lo mismo que crearlo a mano", () => {
    const src = fs.readFileSync(path.join(RAIZ, "app/api/clients/connect/route.ts"), "utf8");
    expect(src).toContain('withCapability("seeAllClients"');
  });
});

