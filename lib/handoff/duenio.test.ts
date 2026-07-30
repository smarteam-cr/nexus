/**
 * lib/handoff/duenio.test.ts — de quién es el handoff, y los candados que lo sostienen.
 *
 * ── LO QUE ATACA ─────────────────────────────────────────────────────────────
 * 1. **Dos documentos del mismo trato vendido.** Un desarrollo que cuelga de una
 *    implementación comparte con ella el alcance; generarle un handoff aparte produce dos
 *    versiones que se contradicen a la primera edición. El botón de la pantalla se puede
 *    saltear: lo que de verdad lo impide son los vetos del servidor.
 * 2. **El requerimiento técnico generado A CIEGAS.** `runDesarrolloGeneration` etiqueta el
 *    handoff como "TU ÚNICA FUENTE"; con el loader genérico eso devolvía vacío para un
 *    hermano y el prompt caía a su rama degradada ("proponé desde buenas prácticas…"). No
 *    fallaba, no logueaba: entregaba un documento genérico con cara de específico.
 * 3. **Que alguien vuelva a leer el handoff sin pasar por el embudo.** Un solo
 *    `loadCanvasContext(x, "handoff", …)` nuevo reabre el agujero, en silencio.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { duenioDelHandoff } from "./duenio";
import { pipelineByKey } from "@/lib/projects/kind";

const RAIZ = process.cwd();
const CS = pipelineByKey("customer-success").hubspotPipelineId;
const DEV = pipelineByKey("development").hubspotPipelineId;
const WEB = pipelineByKey("web").hubspotPipelineId;

const YO = "proj-dev";
const HERMANO = "proj-cs";

const base = {
  projectId: YO,
  hubspotPipelineId: DEV as string | null,
  hermanoCsProjectId: HERMANO as string | null,
  tieneHandoffPropioConContenido: false,
};

describe("de quién es el handoff — la tabla, transcrita", () => {
  it("Desarrollo con hermano → el del hermano", () => {
    expect(duenioDelHandoff(base)).toEqual({ ownerProjectId: HERMANO, redirigido: true });
  });

  it("Sitios web con hermano → el del hermano (mismo motivo)", () => {
    expect(duenioDelHandoff({ ...base, hubspotPipelineId: WEB }).redirigido).toBe(true);
  });

  it("Desarrollo SIN hermano (el caso Judesur) → el suyo", () => {
    expect(duenioDelHandoff({ ...base, hermanoCsProjectId: null })).toEqual({
      ownerProjectId: YO,
      redirigido: false,
    });
  });

  it("Customer Success → SIEMPRE el suyo: un CS no es hermano de nadie", () => {
    /* Aunque la columna viniera con basura. `canBeSiblingOf` de CS está vacío, y es la
       tabla la que manda — no la columna. */
    expect(duenioDelHandoff({ ...base, hubspotPipelineId: CS }).redirigido).toBe(false);
  });

  it("pipeline DESCONOCIDO o sin pipeline → el suyo, aunque tenga la columna puesta", () => {
    /* No basta `hermanoCsProjectId`: el pipeline tiene que DECLARAR que puede ser hermano.
       Es lo que hace que un pipeline nuevo nunca redirija por accidente — el mismo
       principio que hace invisible el deploy en toda esta tanda. */
    expect(duenioDelHandoff({ ...base, hubspotPipelineId: "default-onboarding-pipeline" }).redirigido).toBe(false);
    expect(duenioDelHandoff({ ...base, hubspotPipelineId: null }).redirigido).toBe(false);
  });

  it("si YA tiene handoff propio CON contenido → NO se redirige", () => {
    /* Redirigir sin mirar escondería trabajo real detrás de una regla nueva: alguien lo
       escribió y de golpe dejaría de verlo. (Al escribir esto: cero casos.) */
    expect(duenioDelHandoff({ ...base, tieneHandoffPropioConContenido: true }).redirigido).toBe(false);
  });

  it("un proyecto nunca es su propio hermano", () => {
    // Un dato malo en HubSpot no puede producir un ciclo.
    expect(duenioDelHandoff({ ...base, hermanoCsProjectId: YO })).toEqual({
      ownerProjectId: YO,
      redirigido: false,
    });
  });

  it("cuando NO redirige, el dueño es siempre uno mismo", () => {
    for (const pid of [CS, DEV, WEB, null]) {
      for (const hermano of [null, HERMANO, YO]) {
        for (const propio of [true, false]) {
          const r = duenioDelHandoff({
            projectId: YO,
            hubspotPipelineId: pid,
            hermanoCsProjectId: hermano,
            tieneHandoffPropioConContenido: propio,
          });
          if (!r.redirigido) expect(r.ownerProjectId, `${pid}/${hermano}/${propio}`).toBe(YO);
        }
      }
    }
  });
});

// ── Candados fs-scan ─────────────────────────────────────────────────────────

/** El código sin las líneas de `import` — un assert que matchea el import no prueba nada. */
function sinImports(src: string): string {
  return src.replace(/^import[\s\S]*?from\s+["'][^"']+["'];?[ \t]*$/gm, "");
}

describe("candado: las escrituras del handoff pasan por el veto", () => {
  /** Las rutas POR PROYECTO del handoff, descubiertas por directorio. */
  const rutas = (): string[] => {
    const dir = path.join(RAIZ, "app/api/projects/[projectId]");
    const out: string[] = [];
    const rec = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) rec(p);
        else if (e.name === "route.ts" && /handoff/i.test(path.relative(RAIZ, p))) out.push(p);
      }
    };
    rec(dir);
    return out;
  };

  it("las descubre (si esto baja, alguien movió una carpeta)", () => {
    expect(rutas().length).toBeGreaterThanOrEqual(4);
  });

  it("todo POST/PATCH/PUT de handoff pide el veto", () => {
    for (const ruta of rutas()) {
      const src = sinImports(fs.readFileSync(ruta, "utf8"));
      const rel = path.relative(RAIZ, ruta);
      for (const metodo of ["POST", "PATCH", "PUT"]) {
        if (!src.includes(`export async function ${metodo}`)) continue;
        expect(
          src.includes("vetoSiElHandoffEsDeOtro(projectId)"),
          `${rel} ${metodo}: escribe algo del handoff sin preguntar de quién es. Un ` +
            `desarrollo hermano terminaría con un segundo documento del mismo trato vendido.`,
        ).toBe(true);
      }
    }
  });

  it("la REGENERACIÓN vía /analyze también — es la que se puede saltear el botón", () => {
    const src = sinImports(
      fs.readFileSync(path.join(RAIZ, "app/api/clients/[id]/analyze/route.ts"), "utf8"),
    );
    const i = src.indexOf('agent.agentGroup === "handoff" && bodyProjectId');
    expect(i, "no encontré la rama del handoff en analyze").toBeGreaterThan(-1);
    const posVeto = src.indexOf("vetoSiElHandoffEsDeOtro(bodyProjectId)", i);
    const posRun = src.indexOf("computeHandoffReadiness(bodyProjectId)", i);
    expect(posVeto, "analyze regenera el handoff sin preguntar de quién es").toBeGreaterThan(-1);
    expect(
      posVeto < posRun,
      "el veto tiene que correr ANTES de cualquier trabajo de la generación.",
    ).toBe(true);
  });
});

describe("candado: nadie lee el handoff fuera del embudo", () => {
  it("solo `loadHandoffContext` llama al loader genérico con «handoff»", () => {
    /* Cada `loadCanvasContext(x, "handoff", …)` nuevo devuelve VACÍO para un desarrollo
       hermano y manda su prompt a la rama degradada, sin error y sin log. */
    const culpables: string[] = [];
    const rec = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) rec(p);
        else if ((e.name.endsWith(".ts") || e.name.endsWith(".tsx")) && !e.name.includes(".test.")) {
          const rel = path.relative(RAIZ, p);
          // El único sancionado: adentro de `loadHandoffContext` vive la llamada real.
          if (rel.endsWith(path.join("lib", "canvas", "load-canvas-context.ts"))) continue;
          if (/loadCanvasContext\(\s*[\w.]+\s*,\s*"handoff"/.test(fs.readFileSync(p, "utf8"))) {
            culpables.push(rel);
          }
        }
      }
    };
    for (const d of ["lib", "app", "components", "scripts"]) rec(path.join(RAIZ, d));
    expect(
      culpables,
      "Usá `loadHandoffContext(projectId, opts)`: resuelve de quién es el handoff y mete la " +
        "procedencia adentro del texto, así el agente no lee el alcance de otro proyecto " +
        "creyendo que es de éste.",
    ).toEqual([]);
  });

  it("la procedencia viaja DENTRO del texto, no al lado", () => {
    /* Con un `{ texto, origen }`, los 11 call sites pueden interpolar `texto` y dejar caer
       `origen` sin que nada falle. Metida adentro, no se puede perder por descuido. */
    const src = fs.readFileSync(path.join(RAIZ, "lib/canvas/load-canvas-context.ts"), "utf8");
    const i = src.indexOf("export async function loadHandoffContext");
    expect(i, "no encontré loadHandoffContext").toBeGreaterThan(-1);
    const firma = src.slice(i, src.indexOf("{", src.indexOf("Promise<", i)));
    expect(firma, "loadHandoffContext tiene que devolver Promise<string>").toContain("Promise<string>");
    expect(src.slice(i, i + 1400), "no arma la línea de procedencia").toContain("NO es de este proyecto");
  });
});
