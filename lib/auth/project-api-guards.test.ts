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
import { enmascararCorreo } from "@/lib/auth/enmascarar-correo";
import { isDocumentMimeAllowed } from "@/lib/storage/client";
import { conTope } from "@/lib/documents/extract-text";
import { esUrlPermitidaParaElPdf, hostDeSupabase } from "@/lib/print/hosts-permitidos";

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
  // A-22 (auditoría 2026-09-03): las compuertas del ciclo mueven la etapa (marcar
  // ENTREGA_REALIZADA lleva el proyecto a FINALIZADO; desmarcar la retrocede). Con solo
  // acceso al proyecto, un rol de lectura podía cerrar o reabrir un proyecto.
  {
    archivo: "app/api/projects/[projectId]/stage-gates/route.ts",
    metodo: "POST",
    guarda: "guardTimelineEdit(",
    porque:
      "marcar una compuerta mueve la etapa del ciclo (ENTREGA_REALIZADA → FINALIZADO): exige " +
      "la misma celda que las otras escrituras del ciclo (cronograma.write), no solo acceso.",
  },
  {
    archivo: "app/api/projects/[projectId]/stage-gates/route.ts",
    metodo: "DELETE",
    guarda: "guardTimelineEdit(",
    porque:
      "desmarcar una compuerta RETROCEDE la etapa: misma celda que marcarla, no solo acceso.",
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

// ── N3 · «La primera cuenta que haya» no es una cuenta ────────────────────────────────────

describe("⛔ ninguna lectura de hubspotAccount.findFirst va sin `where`", () => {
  /**
   * Auditoría 2026-09-03: `app/api/hubspot/read` hacía `hubspotAccount.findFirst()` sin filtro y
   * servía el snapshot del portal de «la primera cuenta que haya» —con ~50 cuentas de clientes en
   * la tabla, una arbitraria— a cualquier sesión. Lectura cross-cliente sin error. El mismo
   * `findFirst()` pelado estaba en audits, insights y knowledge, con el comentario «la primera
   * disponible» como si eso significara algo.
   *
   * La regla: toda llamada lleva `where` (normalmente `isSystem: true`). Se escanea el ÁRBOL, no
   * una lista de archivos, para que la próxima copia también caiga.
   */
  const fuentes = (dir: string, acc: string[] = []): string[] => {
    const abs = path.join(RAIZ, dir);
    if (!fs.existsSync(abs)) return acc;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) fuentes(rel, acc);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(rel);
    }
    return acc;
  };

  it("⭐ en app/ y lib/, cada findFirst sobre hubspotAccount filtra", () => {
    const sinWhere: string[] = [];
    let total = 0;
    for (const rel of [...fuentes("app"), ...fuentes("lib")]) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      for (const m of src.matchAll(/hubspotAccount\.findFirst\(/g)) {
        total += 1;
        const tramo = src.slice(m.index!, m.index! + 200);
        if (!/^hubspotAccount\.findFirst\(\s*\{[\s\S]{0,120}?where\s*:/.test(tramo)) sinWhere.push(rel);
      }
    }
    expect(total, "no se encontró ningún findFirst: ¿cambió el nombre del modelo?").toBeGreaterThanOrEqual(4);
    expect(
      sinWhere,
      "Estos findFirst sobre hubspotAccount no filtran: devuelven una cuenta ARBITRARIA, que puede ser la de un cliente",
    ).toEqual([]);
  });
});

// ── N4 · Los prompts de los agentes son know-how: solo quien puede ver agentes ────────────

describe("⛔ ninguna ruta de agentes entra con solo sesión", () => {
  /**
   * Auditoría 2026-09-03: `GET /api/agents` y `/api/agents/[id]` devolvían el `systemPrompt`
   * COMPLETO de los 30 agentes —el know-how operativo de la agencia— con solo una sesión de
   * Supabase (y, hasta A-02, incluso a un desactivado), mientras editarlos ya exigía
   * `agentes.manage`. Leer y editar viven bajo la misma sección del registry (`agentes.read`,
   * `agentes.manage`), y `effective-prompt` ya lo hacía bien: es el molde.
   */
  const BASE_AGENTES = "app/api/agents";
  const archivos = routes(BASE_AGENTES);

  it("el escaneo encuentra el árbol (no pasa en vacío)", () => {
    expect(archivos.length, `solo ${archivos.length} route.ts bajo ${BASE_AGENTES}`).toBeGreaterThanOrEqual(3);
  });

  it("⭐ cada handler pasa por withPermission(\"agentes\", …)", () => {
    const ofensores: string[] = [];
    let total = 0;
    for (const rel of archivos) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      const hs = [...src.matchAll(HANDLER)];
      total += hs.length;
      for (let i = 0; i < hs.length; i++) {
        const cuerpo = src.slice(hs[i].index!, i + 1 < hs.length ? hs[i + 1].index! : src.length);
        if (!cuerpo.includes('withPermission("agentes"')) ofensores.push(`${rel} → ${hs[i][1]}`);
      }
    }
    expect(total, `solo ${total} handlers bajo ${BASE_AGENTES} — ¿el regex dejó de matchear?`).toBeGreaterThanOrEqual(6);
    expect(
      ofensores,
      "Estos handlers de agentes no exigen la sección `agentes`: el prompt sale con cualquier sesión",
    ).toEqual([]);
  });
});


describe("⛔ los logs no llevan el objeto de error entero ni el correo de un intento fallido", () => {
  /**
   * A-15 (auditoría 2026-09-03). `runHandlerSafely` mandaba a stdout el error ENTERO: un error de
   * Prisma o de fetch arrastra la consulta, los parámetros o el cuerpo del request —datos de
   * clientes— a `docker logs`. Y el callback de auth escribía el correo completo de cada intento
   * fallido de entrar. Al log van nombre + mensaje y un correo enmascarado; el objeto completo va
   * a Sentry, que ya tacha tokens (A-12).
   */
  const lee = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  it("lib/api.ts loguea nombre + mensaje, no el objeto", () => {
    /* La edicion que lo pone en rojo: volver a console.error(`…`, e). */
    const src = lee("lib/api.ts");
    expect(/console\.error\([^;]*,\s*e\s*\)/.test(src), "el objeto de error entero vuelve a stdout").toBe(false);
    expect(src).toContain("${err.name}: ${err.message}");
  });

  it("el callback de auth no escribe el correo de un intento fallido", () => {
    /* La edicion que lo pone en rojo: `${email}` de vuelta en cualquier console.warn. */
    const src = lee("app/auth/callback/route.ts");
    const warnsConCorreo = [...src.matchAll(/console\.warn\([^\n]*/g)]
      .map((m) => m[0])
      .filter((l) => l.includes("${email}"));
    expect(warnsConCorreo, "un intento fallido se loguea con el correo completo").toEqual([]);
    expect(
      src.match(/enmascararCorreo\(email\)/g)?.length ?? 0,
      "los tres avisos de intento fallido enmascaran el correo",
    ).toBeGreaterThanOrEqual(3);
  });

  it("enmascarar deja el dominio y una pista, nunca el correo", () => {
    /* La edicion que lo pone en rojo: devolver el correo tal cual. */
    expect(enmascararCorreo("dmarin@smarteamcr.com")).toBe("d***@smarteamcr.com");
    expect(enmascararCorreo("sin-arroba")).toBe("***");
    expect(enmascararCorreo("@raro.com")).toBe("***");
  });
});

describe("⛔ subir un documento exige un MIME de la allowlist, la extracción tiene tope y el PDF no sale a la red", () => {
  /**
   * A-17 (auditoría 2026-09-03). La subida aceptaba cualquier `file.type` (el bucket solo aplica su
   * allowlist al CREARSE), `extractText` podía quedarse colgada con un PDF o un Office malicioso, y
   * el Chromium que imprime los PDF salía a cualquier host que un documento nombrara — con el
   * pdfToken en el Referer.
   */
  const lee = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  it("el handler de subida rechaza el MIME ANTES de subir", () => {
    /* La edicion que lo pone en rojo: sacar el if, o moverlo después del .upload( */
    const src = lee("app/api/projects/[projectId]/documents/upload/route.ts");
    const gate = src.indexOf("isDocumentMimeAllowed(file.type)");
    const subida = src.indexOf(".upload(");
    expect(gate, "el handler no consulta la allowlist").toBeGreaterThan(-1);
    expect(subida).toBeGreaterThan(-1);
    expect(gate, "la allowlist se consulta DESPUÉS de subir").toBeLessThan(subida);
    expect(isDocumentMimeAllowed("application/pdf")).toBe(true);
    expect(isDocumentMimeAllowed("text/html")).toBe(false);
    expect(isDocumentMimeAllowed("image/svg+xml"), "un SVG puede llevar script").toBe(false);
    expect(isDocumentMimeAllowed("")).toBe(false);
  });

  it("la extracción de texto tiene tope: una promesa que nunca vuelve devuelve null", async () => {
    /* La edicion que lo pone en rojo: que extractText llame a extraerSinTope sin conTope. */
    const nunca = new Promise<string>(() => {});
    expect(await conTope(nunca, 20)).toBeNull();
    expect(await conTope(Promise.resolve("ok"), 20)).toBe("ok");
    const src = lee("lib/documents/extract-text.ts");
    expect(src, "extractText tiene que pasar por conTope").toContain(
      "conTope(extraerSinTope(buffer, mimeType), EXTRACT_TIMEOUT_MS)",
    );
  });

  it("el navegador que imprime solo sale a la app y al Storage de Supabase", () => {
    /* La edicion que lo pone en rojo: sacar setRequestInterception, dejar pasar cualquier host, o
       que esUrlPermitidaParaElPdf devuelva true para todo. */
    const src = lee("lib/print/pdf-runner.ts");
    expect(src).toContain("page.setRequestInterception(true)");
    expect(src).toContain("esUrlPermitidaParaElPdf(r.url(), hostsPermitidos)");
    const supa = hostDeSupabase({ SUPABASE_URL: "https://abc.supabase.co" });
    expect(supa).toBe("abc.supabase.co");
    expect(esUrlPermitidaParaElPdf("http://127.0.0.1:3000/print/doc/x?pdfToken=y", [supa])).toBe(true);
    expect(esUrlPermitidaParaElPdf("https://abc.supabase.co/storage/v1/object/public/logos/x.png", [supa])).toBe(true);
    expect(esUrlPermitidaParaElPdf("data:image/png;base64,AAAA", [supa])).toBe(true);
    expect(esUrlPermitidaParaElPdf("https://evil.example/pixel.png", [supa]), "un host ajeno sale").toBe(false);
    expect(esUrlPermitidaParaElPdf("https://evil.example/pixel.png", [null])).toBe(false);
  });
});

describe("⛔ los handlers que escriben Json directo del body pasan por zod antes de tocar la base", () => {
  /**
   * A-19 (auditoría 2026-09-03). Tres rutas escribían lo que llegaba en el body tal cual —el
   * prompt de un agente, las `sections` de un canvas que después leen los agentes, el `data` de
   * un bloque— sin validar forma, enum ni tamaño. Molde: app/api/team/[id]/permissions/route.ts
   * (`z.strictObject` + `.safeParse` + 400).
   */
  const ARCHIVOS = [
    "app/api/agents/[id]/route.ts",
    "app/api/projects/[projectId]/canvases/[canvasId]/route.ts",
    "app/api/projects/[projectId]/canvas-sections/[sectionId]/blocks/route.ts",
    // A-20: la ficha del cliente y el miembro del equipo, mismo molde.
    "app/api/clients/[id]/route.ts",
    "app/api/team/[id]/route.ts",
  ];
  const ESCRITURA = /prisma\.\w+\.(?:create|update|updateMany|upsert|delete|deleteMany)\(/;

  it("cada handler que lee el body lo valida con .safeParse( ANTES de la primera escritura", () => {
    /* La edicion que lo pone en rojo: un handler que vuelva a `await req.json()` pelado, que use
       `.parse(` (tira 500 en vez de contestar 400), o que valide después de escribir. */
    const ofensores: string[] = [];
    let handlersConBody = 0;
    for (const rel of ARCHIVOS) {
      const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      const hs = [...src.matchAll(HANDLER)];
      for (let i = 0; i < hs.length; i++) {
        const cuerpo = src.slice(hs[i].index!, i + 1 < hs.length ? hs[i + 1].index! : src.length);
        if (!cuerpo.includes(".json()")) continue;
        handlersConBody++;
        const parse = cuerpo.indexOf(".safeParse(");
        const escritura = cuerpo.search(ESCRITURA);
        if (parse === -1 || (escritura !== -1 && parse > escritura)) ofensores.push(`${rel} → ${hs[i][1]}`);
      }
      expect(src, `${rel}: los esquemas van con z.strictObject (un campo desconocido es error)`).toContain(
        "z.strictObject(",
      );
    }
    expect(handlersConBody, "la guarda no mira nada").toBeGreaterThanOrEqual(7);
    expect(ofensores, "estos handlers escriben lo que llega en el body sin validarlo").toEqual([]);
  });
});
