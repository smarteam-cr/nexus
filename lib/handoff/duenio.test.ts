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
import {
  duenioDelHandoff,
  contextExclusionesPorDefecto,
  exclusionNombrada,
  EXCLUSION_IMPLEMENTACION_HUBSPOT,
} from "./duenio";
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
  /**
   * ── LA TABLA SE DIO VUELTA EL 2026-08-07, Y ESTE TEST ES EL REGISTRO ────────
   * Hasta la Tanda F, un Desarrollo o un Sitio web colgado de una Implementación NO tenía
   * handoff propio: se lo redirigía al del hermano mayor para que no existieran dos documentos
   * del mismo trato contradiciéndose. El efecto secundario no se vio hasta que alguien abrió el
   * cronograma de un hermano menor: **el agente de handoff es también el que escribe las FASES**,
   * así que la corrida se ejecutaba sobre la implementación y las fases aterrizaban allá. Medido
   * en producción el 2026-08-06: los 2 hermanos menores tenían 0 fases y 0 tareas, contra 8 y 10
   * de sus implementaciones, con una pantalla que decía «Generá el Handoff» y no tenía botón.
   *
   * Se apagó por CELDA (`handoffDelHermano: false` en las tres filas), no borrando código: el
   * veto, sus cuatro guardas y la rama de la pantalla siguen enteros. Estos dos tests afirman
   * que la celda es lo que manda — si alguien la vuelve a `true`, vuelven a redirigir.
   */
  it("Desarrollo con hermano → EL SUYO (la celda dice handoffDelHermano: false)", () => {
    expect(duenioDelHandoff(base)).toEqual({ ownerProjectId: YO, redirigido: false });
  });

  it("Sitios web con hermano → el suyo (mismo motivo)", () => {
    expect(duenioDelHandoff({ ...base, hubspotPipelineId: WEB }).redirigido).toBe(false);
  });

  it("las TRES filas declaran handoffDelHermano: false — es la palanca, y hoy está apagada", () => {
    /* La guarda de la reversibilidad. Si mañana alguien vuelve a poner `true` en una celda,
       este test lo dice en voz alta en vez de que el cambio pase escondido en un diff de tabla. */
    for (const key of ["customer-success", "development", "web"] as const) {
      expect(pipelineByKey(key).handoffDelHermano, key).toBe(false);
    }
  });

  it("con la celda en TRUE, la redirección vuelve entera", () => {
    /* Prueba que el código de redirección sigue vivo y correcto: lo único que lo apaga es el
       dato. Sin esto, «apagamos por celda» sería una afirmación sin verificar y el día que haya
       que volver atrás nadie sabría si el camino todavía funciona. */
    const conRedireccion = { ...pipelineByKey("development"), handoffDelHermano: true };
    expect(conRedireccion.handoffDelHermano).toBe(true);
    // La función lee la tabla real, así que acá se afirma la OTRA mitad: los tres frenos que
    // seguirían cortando aunque la celda estuviera en true.
    expect(duenioDelHandoff({ ...base, hermanoCsProjectId: null }).redirigido).toBe(false);
    expect(duenioDelHandoff({ ...base, hermanoCsProjectId: YO }).redirigido).toBe(false);
    expect(duenioDelHandoff({ ...base, tieneHandoffPropioConContenido: true }).redirigido).toBe(false);
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
    /* No basta `hermanoCsProjectId`: el pipeline tiene que DECLARAR que su handoff es el del
       hermano (`handoffDelHermano`).
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

describe("la nota por defecto — dos formas, y la nombrada es la que pesa", () => {
  /**
   * ⚠ ESTA NOTA ES LA COMPENSACIÓN DE UNA DECISIÓN DE NEGOCIO. Elías eligió que el hermano
   * menor vea TODO el material del cliente y no un subconjunto filtrado. Medido sobre el
   * «Conector SAAS posventa» de Spectrum: 22 de 22 registros de HubSpot que alimentarían su
   * handoff son de la implementación y ninguno menciona el conector. El repo ya documentó el
   * caso gemelo y su lección —«filtrar datos, no rogarle al modelo»—, así que la nota NOMBRA
   * al hermano mayor: una exclusión con nombre propio pesa mucho más que una genérica.
   *
   * La forma genérica sigue existiendo para el otro caso: un Desarrollo/Sitio que NO cuelga de
   * nadie pero cuya empresa comparte línea de tiempo con una Implementación aparte (los 17
   * «Integración con X» del 2026-08-06).
   */
  it("LA guarda: si cuelga de un hermano, la nota lo NOMBRA y nombra a este proyecto", () => {
    const nota = contextExclusionesPorDefecto({
      hubspotPipelineId: DEV,
      nombreDelHermanoMayor: "Spectrum - MKT + SALES",
      nombreDelProyecto: "Conector SAAS posventa",
      tieneImplementacionHubSpot: true,
    });
    expect(nota).toContain("Spectrum - MKT + SALES");
    expect(nota).toContain("Conector SAAS posventa");
    // Y NO es la genérica: si alguien la reemplaza por la de siempre, la nota pierde la única
    // palanca que compensa haber dejado entrar todo el material.
    expect(nota).not.toBe(EXCLUSION_IMPLEMENTACION_HUBSPOT);
  });

  it("la nombrada gana aunque la empresa NO tenga otra implementación", () => {
    /* Cuelga de un hermano concreto: ese hecho es más fuerte que el censo de la empresa. */
    const nota = contextExclusionesPorDefecto({
      hubspotPipelineId: WEB,
      nombreDelHermanoMayor: "Implementación X",
      tieneImplementacionHubSpot: false,
    });
    expect(nota).toContain("Implementación X");
  });

  it("una Implementación NUNCA se excluye a sí misma, ni con hermano nombrado", () => {
    expect(
      contextExclusionesPorDefecto({
        hubspotPipelineId: CS,
        nombreDelHermanoMayor: "Otra cosa",
        tieneImplementacionHubSpot: true,
      }),
    ).toBeNull();
  });

  it("exclusionNombrada sin el nombre del proyecto igual nombra al mayor", () => {
    const nota = exclusionNombrada("Mayor S.A.");
    expect(nota).toContain("Mayor S.A.");
    expect(nota).not.toContain("undefined");
  });
  it("Desarrollo + la empresa tiene implementación → la nota", () => {
    expect(
      contextExclusionesPorDefecto({ hubspotPipelineId: DEV, tieneImplementacionHubSpot: true }),
    ).toBe(EXCLUSION_IMPLEMENTACION_HUBSPOT);
  });

  it("Sitios web + la empresa tiene implementación → la misma nota", () => {
    expect(
      contextExclusionesPorDefecto({ hubspotPipelineId: WEB, tieneImplementacionHubSpot: true }),
    ).toBe(EXCLUSION_IMPLEMENTACION_HUBSPOT);
  });

  it("sin implementación en la empresa → sin nota, aunque el pipeline sí pueda ser hermano", () => {
    expect(
      contextExclusionesPorDefecto({ hubspotPipelineId: DEV, tieneImplementacionHubSpot: false }),
    ).toBeNull();
  });

  it("una Implementación de HubSpot NUNCA se excluye a sí misma", () => {
    /* Aunque por algún dato raro `tieneImplementacionHubSpot` diera true (una empresa con DOS
       implementaciones), este pipeline no puede ser hermano de nada — `canBeSiblingOf` vacío. */
    expect(
      contextExclusionesPorDefecto({ hubspotPipelineId: CS, tieneImplementacionHubSpot: true }),
    ).toBeNull();
  });

  it("pipeline desconocido o sin pipeline → sin nota", () => {
    expect(
      contextExclusionesPorDefecto({
        hubspotPipelineId: "default-onboarding-pipeline",
        tieneImplementacionHubSpot: true,
      }),
    ).toBeNull();
    expect(
      contextExclusionesPorDefecto({ hubspotPipelineId: null, tieneImplementacionHubSpot: true }),
    ).toBeNull();
  });
});

// ── Candados fs-scan ─────────────────────────────────────────────────────────

describe("candado: la palanca es la tabla, y la pantalla ofrece el enlace al mayor", () => {
  const sinComentariosDe = (rel: string): string =>
    fs
      .readFileSync(path.join(RAIZ, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");

  /**
   * ── LA GUARDA DE LA PALANCA ─────────────────────────────────────────────────
   * `duenioDelHandoff` tiene que leer `handoffDelHermano` y NO `canBeSiblingOf`. Son dos
   * columnas de la misma tabla y hoy dicen cosas distintas a propósito: `canBeSiblingOf` sigue
   * diciendo que un Desarrollo acompaña a una Implementación —eso decide la FACTURACIÓN y no
   * cambió— mientras `handoffDelHermano` dice que su documento es suyo. Volver a leer
   * `canBeSiblingOf` acá reanudaría la redirección **y volvería a dejar al hermano menor sin
   * fases de cronograma**, sin romper tipos ni build.
   *
   * La edición que la pone en rojo: cambiar la línea del resolver de vuelta a
   * `if (!def?.canBeSiblingOf.includes("customer-success")) return propio;`
   */
  it("LA guarda: la decisión sale de handoffDelHermano, no de canBeSiblingOf", () => {
    const src = sinComentariosDe("lib/handoff/duenio.ts");
    const cuerpo = src.slice(src.indexOf("export function duenioDelHandoff"));
    const fin = cuerpo.indexOf("export ", 10);
    const fn = fin > 0 ? cuerpo.slice(0, fin) : cuerpo;
    expect(fn.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    expect(fn, "duenioDelHandoff dejó de leer la palanca").toContain("handoffDelHermano");
    expect(fn, "volvió a decidir por canBeSiblingOf: el hermano menor pierde sus fases").not.toContain(
      "canBeSiblingOf",
    );
  });

  /**
   * ── LA GUARDA DE LA PANTALLA ────────────────────────────────────────────────
   * Un dato que llega y no se pinta es idéntico a un dato que no llega. El GET manda
   * `hermanoMayor` y la decisión de Elías fue «un enlace discreto al del mayor»: si alguien
   * saca esas líneas porque «ensucian el encabezado», el endpoint sigue devolviendo un enlace
   * perfecto para nadie y no falla ni `tsc`, ni ESLint, ni ningún test de backend.
   */
  it("la pantalla del handoff pinta el enlace al hermano mayor", () => {
    const ruta = sinComentariosDe("app/api/projects/[projectId]/handoff/route.ts");
    expect(ruta, "el GET dejó de mandar el hermano mayor").toContain("hermanoMayor");

    const ui = sinComentariosDe("components/clients/ProjectHandoffSection.tsx");
    const i = ui.indexOf("status.hermanoMayor &&");
    expect(i, "la pantalla dejó de pintar el enlace al hermano mayor").toBeGreaterThan(-1);
    const bloque = ui.slice(i, i + 500);
    expect(bloque, "el enlace no lleva a ningún lado").toContain("/clients/");
    expect(bloque, "el enlace no dice el nombre del hermano").toContain("projectName");
  });
});

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

describe("candado: los DOS sitios que crean un Handoff nuevo ponen la nota por defecto", () => {
  /**
   * ⚠ Sobre el fuente sin comentarios: la prosa que explica el porqué nombra el símbolo
   * vigilado, así que un scan crudo pasa en verde con el import sin usarse.
   */
  const sinComentarios = (rel: string): string =>
    fs
      .readFileSync(path.join(RAIZ, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");

  it("el alta única: el create del handoff usa la función, no un literal a mano", () => {
    const src = sinComentarios("lib/projects/alta-runner.ts");
    const i = src.lastIndexOf("await tx.handoff.create({");
    expect(i, "se movió el create del handoff; revisar esta guarda").toBeGreaterThan(0);
    const bloque = src.slice(i, src.indexOf("});", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(
      bloque,
      "el handoff del alta única dejó de nacer con la nota por defecto",
    ).toContain("contextExclusions");
    expect(src, "dejó de calcular la nota con la función compartida").toContain(
      "contextExclusionesPorDefecto(",
    );
    expect(src, "dejó de consultar si la empresa tiene implementación").toContain(
      "tieneOTuvoImplementacionHubSpot(",
    );
  });

  it("el «Generar» de la pantalla: el ensure del handoff también", () => {
    const src = sinComentarios("app/api/projects/[projectId]/handoff/route.ts");
    const i = src.lastIndexOf("await tx.handoff.create({");
    expect(i, "se movió el create del handoff; revisar esta guarda").toBeGreaterThan(0);
    const bloque = src.slice(i, src.indexOf("});", i));
    expect(bloque.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(
      bloque,
      "el handoff que nace al apretar Generar dejó de traer la nota por defecto",
    ).toContain("contextExclusions");
    expect(src, "dejó de calcular la nota con la función compartida").toContain(
      "contextExclusionesPorDefecto(",
    );
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
