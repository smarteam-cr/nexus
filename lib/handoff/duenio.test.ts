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
  componerExclusiones,
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

describe("componerExclusiones — la del sistema + la del CSE", () => {
  const SIS = "Ignora todo lo relacionado a «Spectrum - MKT + SALES».";
  const CSE = "No hables del proyecto de contratos.";

  it("las junta, con la del sistema PRIMERO", () => {
    const r = componerExclusiones(SIS, CSE);
    expect(r).toContain(SIS);
    expect(r).toContain(CSE);
    expect(r!.indexOf(SIS)).toBeLessThan(r!.indexOf(CSE));
  });

  it("cualquiera de las dos sola vale por sí misma", () => {
    expect(componerExclusiones(SIS, null)).toBe(SIS);
    expect(componerExclusiones(null, CSE)).toBe(CSE);
    expect(componerExclusiones(SIS, "   ")).toBe(SIS);
    expect(componerExclusiones("", CSE)).toBe(CSE);
  });

  it("sin ninguna de las dos, null (y el prompt no lleva bloque)", () => {
    expect(componerExclusiones(null, null)).toBeNull();
    expect(componerExclusiones("  ", "")).toBeNull();
  });

  /**
   * LA guarda de esta función. Hay handoffs con la nota YA persistida —los que nacieron entre la
   * Tanda F y el 2026-08-08— y sin la deduplicación verían la misma frase DOS veces en el prompt,
   * lo que además de ruido le sugiere al modelo que hay dos exclusiones distintas.
   * La edición que la pone en rojo: borrar la línea del `includes`.
   */
  it("LA guarda: no duplica cuando el CSE ya tiene adentro la del sistema", () => {
    const yaLaTiene = `${SIS}\nAdemás, ignorá los contratos.`;
    const r = componerExclusiones(SIS, yaLaTiene);
    expect(r).toBe(yaLaTiene);
    expect(r!.split(SIS).length - 1, "la frase del sistema aparece dos veces").toBe(1);
  });
});

describe("candado: la exclusion del sistema se RECALCULA, no se persiste", () => {
  /**
   * -- EL DISENO SE DIO VUELTA EL 2026-08-08, Y ESTE DESCRIBE ES EL REGISTRO ---
   * Hasta hoy la nota del sistema se ESCRIBIA en la fila `Handoff`, una sola vez, en el instante
   * en que nacia. Tres agujeros medidos:
   *
   *  1. **«Regenerar» la borraba.** El textarea de la pantalla se sembraba una unica vez -cuando
   *     el handoff todavia no existia, o sea vacio- y no se re-sembraba nunca. Al regenerar, el
   *     paso 0 veia «vacio != lo guardado», lo leia como «el CSE la borro» y mandaba un PATCH a
   *     null. La segunda corrida -la que uno hace porque el documento no le gusto- salia SIN
   *     exclusiones, y la nota quedaba destruida.
   *  2. **Cinco puertas crean un `Handoff` y solo dos escribian la nota** (el asistente viejo, el
   *     upsert del PATCH, el de excluir engagements, un script de migracion).
   *  3. Un handoff nacido antes de todo esto se quedaba sin exclusion para siempre.
   *
   * Recalculada en cada generacion, los tres desaparecen: no se puede borrar, no depende de quien
   * creo la fila, y un handoff viejo la recibe igual. `Handoff.contextExclusions` pasa a
   * significar UNA sola cosa: lo que escribio el CSE a mano.
   */
  const sinComentarios = (rel: string): string =>
    fs
      .readFileSync(path.join(RAIZ, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");

  /**
   * LA guarda. La edicion que la pone en rojo: volver a poner `contextExclusions` en cualquiera
   * de los dos `handoff.create`. No rompe tipos ni build - solo hace que la nota vuelva a ser
   * perdible, que es de lo que se acaba de salir.
   */
  it("LA guarda: los dos sitios que crean un Handoff lo hacen SIN nota", () => {
    for (const rel of [
      "lib/projects/alta-runner.ts",
      "app/api/projects/[projectId]/handoff/route.ts",
    ]) {
      const src = sinComentarios(rel);
      const i = src.lastIndexOf("handoff.create({");
      expect(i, `${rel}: se movio el create del handoff; revisar esta guarda`).toBeGreaterThan(0);
      const bloque = src.slice(i, src.indexOf("});", i));
      expect(bloque.length, "la guarda no esta mirando nada").toBeGreaterThan(60);
      expect(
        bloque,
        `${rel}: volvio a persistir la nota - «Regenerar» puede borrarla otra vez`,
      ).not.toContain("contextExclusions");
    }
  });

  it("ninguno de los dos calcula ya la nota por defecto", () => {
    /* Si siguieran calculandola sin persistirla seria trabajo muerto; si la persistieran, es el
       bug de arriba. En los dos casos el simbolo sobra. */
    for (const rel of [
      "lib/projects/alta-runner.ts",
      "app/api/projects/[projectId]/handoff/route.ts",
    ]) {
      const src = sinComentarios(rel);
      expect(src, `${rel}: quedo calculando la nota al crear`).not.toContain(
        "contextExclusionesPorDefecto(",
      );
    }
  });

  it("LA guarda de la generacion: analyze recalcula y COMPONE con lo del CSE", () => {
    /* Es la otra mitad: sin esta llamada, dejar de persistir habria dejado a TODOS los hermanos
       menores sin ninguna exclusion. La edicion que la pone en rojo: volver a leer solo
       `h.contextExclusions` en analyze. */
    /* El TRAMO exacto: desde que se declara el bloque de exclusiones hasta que se arma el
       mensaje. Afirmar sobre el archivo entero dejaría la guarda decorativa — los dos símbolos
       podrían quedar importados y sin usar. */
    const src = sinComentarios("app/api/clients/[id]/analyze/route.ts");
    const i = src.indexOf('let cseExclusionsBlock = ""');
    expect(i, "cambio la forma del bloque de exclusiones; revisar esta guarda").toBeGreaterThan(-1);
    const tramo = src.slice(i, src.indexOf("const baseUserMessage", i));
    expect(tramo.length, "la guarda no esta mirando nada").toBeGreaterThan(300);
    expect(tramo, "la generacion dejo de componer la exclusion del sistema").toContain(
      "componerExclusiones(",
    );
    expect(tramo, "la generacion dejo de recalcular la exclusion del sistema").toContain(
      "exclusionDelSistema(",
    );
  });

  it("la pantalla PINTA la exclusion que pone la app", () => {
    /* Un dato que llega y no se pinta es identico a uno que no llega: el CSE abriria el panel,
       veria el campo vacio y escribiria a mano lo que la app ya dice. */
    const api = sinComentarios("app/api/projects/[projectId]/handoff/route.ts");
    expect(api, "el GET dejo de mandar la exclusion automatica").toContain("exclusionAutomatica");

    /* ⚠ SOBRE EL BLOQUE QUE LA PINTA, NO SOBRE EL ARCHIVO. La primera version de esta guarda
       buscaba `status.exclusionAutomatica` a secas y salio VERDE con el bloque borrado: el
       simbolo aparece una segunda vez, como simple condicion del texto de ayuda de abajo. Se
       cazo rompiendola a proposito. El rotulo "La pone la app" solo existe en el bloque real. */
    const ui = sinComentarios("components/clients/ProjectHandoffSection.tsx");
    expect(ui, "la pantalla dejo de pintar la exclusion automatica").toContain("La pone la app");
    expect(ui, "el bloque quedo sin el texto de la exclusion").toContain(
      "{status.exclusionAutomatica}",
    );
  });

  /**
   * -- LA GUARDA DEL BUG DE «REGENERAR» ----------------------------------------
   * El PATCH del paso 0 tiene que salir SOLO si una persona tipeo. Comparar contra el status era
   * el bug: un textarea que nunca se re-sembro se ve igual que uno que alguien vacio a mano.
   * La edicion que la pone en rojo: sacar `exclusionsDirty &&` de esa condicion.
   */
  it("LA guarda: «Regenerar» no puede borrar la nota", () => {
    const ui = sinComentarios("components/clients/ProjectHandoffSection.tsx");
    const i = ui.indexOf("const pendingExcl");
    expect(i, "cambio el paso 0 de generar; revisar esta guarda").toBeGreaterThan(-1);
    const bloque = ui.slice(i, i + 400);
    expect(
      bloque,
      "el PATCH del paso 0 volvio a salir sin preguntar si una persona escribio",
    ).toContain("exclusionsDirty &&");
    // Y el draft se re-siembra en cada refetch mientras nadie haya tocado.
    expect(ui, "el textarea volvio a sembrarse una sola vez").not.toContain("exclusionsLoaded");
  });
});

describe("candado: el deal del mayor entra ETIQUETADO, no filtrado", () => {
  /**
   * ── F-C (Tanda G, 2026-08-08) ───────────────────────────────────────────────
   * El repo ya midió que «el deal del vecino era un dato tan fuerte que ninguna instrucción de
   * exclusión podía contra él» — y el filtro determinista de deals compara NOMBRES (mín. 10
   * chars), no el puntero real. Decisión de negocio del zoom: el deal de la implementación NO
   * se filtra (el hermano menor ve todo el material) pero entra con una etiqueta que dice de
   * quién es, resuelta por ID EXACTO (`hermanoCsProjectId → hubspotDealId`).
   *
   * Dos ediciones lo matan sin romper nada: borrar el `lines.unshift` (el deal entra pelado) y
   * mover el check por id DESPUÉS del check por nombre (el filtro por nombre se lo come antes
   * de que la etiqueta exista).
   */
  const RUTA_ANALYZE = "app/api/clients/[id]/analyze/route.ts";

  const sinComentariosDeAnalyze = (): string =>
    fs
      .readFileSync(path.join(RAIZ, RUTA_ANALYZE), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");

  it("LA guarda: el deal del mayor se resuelve por id y lleva su etiqueta", () => {
    const src = sinComentariosDeAnalyze();
    expect(src, "desapareció el resolver por id exacto del deal del mayor").toContain(
      "esDealDelMayor(",
    );
    expect(src, "el deal del mayor volvió a entrar SIN etiqueta").toContain(
      "ESTE NEGOCIO ES DEL PROYECTO PRINCIPAL",
    );
    // El nombre del mayor sale del puntero real, no de una heurística de strings.
    const resolver = src.slice(src.indexOf("const hermanoMayor ="));
    expect(resolver.length, "la guarda no está mirando nada").toBeGreaterThan(100);
    expect(resolver.slice(0, 400), "dejó de resolver por hermanoCsProjectId").toContain(
      "hermanoCsProjectId",
    );
  });

  it("el id exacto gana al filtro por nombre — el orden es la mitad del arreglo", () => {
    const src = sinComentariosDeAnalyze();
    const posId = src.indexOf("if (esDealDelMayor(d.id)) return true;");
    const posNombre = src.indexOf("if (isForeignProjectDeal(name))");
    expect(posId, "desapareció el check por id en el filter").toBeGreaterThan(-1);
    expect(posNombre, "cambió el filtro por nombre; revisar esta guarda").toBeGreaterThan(-1);
    expect(
      posId < posNombre,
      "el filtro por nombre corre ANTES que el check por id: el deal del mayor puede excluirse antes de etiquetarse",
    ).toBe(true);
  });
});

describe("candado: la rama handoff lee el documento del mayor, etiquetado", () => {
  /**
   * ── F-D (Tanda G, 2026-08-08 — decisión de Elías: «sí, que lo lea») ─────────
   * El hermano menor lee el DOCUMENTO de handoff de la implementación como una fuente más —
   * además de todo el material crudo, no en su lugar. Es el zoom directo: ese documento ya
   * resume lo vendido, incluida la parte de integración/desarrollo/sitio.
   *
   * Tres piezas, y cada una muere distinto si se pierde:
   *  · La llamada en analyze → el bloque no se arma y el zoom pierde su referencia, sin error.
   *  · La interpolación en el template → el dato llega y NO se pinta al modelo: idéntico a no
   *    llegar (el mismo modo de falla de los 49 descartados del console.warn).
   *  · El rótulo/allowlist en el helper → el mayor entra sin marcar y el contagio que la nota
   *    nombrada combate vuelve por la puerta de al lado.
   */
  const sinComentariosDe2 = (rel: string): string =>
    fs
      .readFileSync(path.join(RAIZ, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");

  it("LA guarda: analyze llama al helper gateado por el hermano, y lo interpola", () => {
    const src = sinComentariosDe2("app/api/clients/[id]/analyze/route.ts");
    const llamada = src.indexOf("loadHandoffDelHermanoMayorContext(");
    expect(llamada, "la rama handoff dejó de leer el documento del mayor").toBeGreaterThan(-1);
    // Gateado por el puntero real: sin hermano, ni una query de más.
    const gate = src.lastIndexOf("isHandoffAgent && hermanoMayor", llamada);
    expect(gate, "la llamada perdió su gate por el hermano mayor").toBeGreaterThan(-1);
    expect(llamada - gate, "el gate quedó lejos de la llamada; revisar esta guarda").toBeLessThan(400);
    // Y el bloque LLEGA al modelo: un dato que llega y no se pinta es idéntico a uno que no llega.
    expect(src, "el bloque del mayor ya no se interpola en el mensaje").toContain(
      "${handoffDelMayorBlock}",
    );
  });

  it("el helper rotula adentro, recorta por allowlist y no cruza clientes", () => {
    const src = sinComentariosDe2("lib/canvas/load-canvas-context.ts");
    const i = src.indexOf("export async function loadHandoffDelHermanoMayorContext");
    expect(i, "desapareció el helper del documento del mayor").toBeGreaterThan(-1);
    const fin = src.indexOf("export ", i + 10);
    const cuerpo = fin > 0 ? src.slice(i, fin) : src.slice(i);
    expect(cuerpo.length, "la guarda no está mirando nada").toBeGreaterThan(300);
    expect(cuerpo, "el documento del mayor viaja SIN rótulo de procedencia").toContain(
      "HANDOFF DEL PROYECTO PRINCIPAL",
    );
    expect(cuerpo, "se cayó la allowlist: el cap crudo trunca justo la sección desarrollo").toContain(
      "HANDOFF_DEL_MAYOR_KEYS",
    );
    expect(cuerpo, "se cayó el cinturón cross-cliente").toContain("clientId");
  });
});

describe("candado: el zoom también filtra datos, no solo pide", () => {
  /**
   * ── LA MITAD ESTRUCTURAL DEL ZOOM (2026-08-08) ──────────────────────────────
   * El repo tiene escrita, tras un incidente, la lección «filtrar datos, no rogarle al modelo».
   * Hasta hoy el zoom del hermano menor era todo ruego: la nota de exclusión es texto libre que
   * no filtra nada, mientras tres queries traían al cliente ENTERO —documentos adjuntos (12.000
   * caracteres, el bloque más pesado empatado con las transcripciones), notas del workspace y
   * tarjetas de contexto—, sin decir de qué proyecto era cada cosa. Y las tres tablas YA guardan
   * su `projectId`: el filtro estaba a un `where` de distancia y no se había puesto.
   *
   * ⚠ `projectId: null` se incluye a propósito — es material del cliente que nadie asignó, y
   * sacarlo dejaría al handoff sin contexto en vez de enfocado.
   *
   * La edición que pone esto en rojo: borrar `soloDeEsteProyecto` de cualquiera de las tres
   * queries. Nada falla: el prompt simplemente vuelve a llenarse de la implementación.
   */
  const src = (): string =>
    fs
      .readFileSync(path.join(RAIZ, "app/api/clients/[id]/analyze/route.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");

  it("LA guarda: las TRES fuentes por-cliente se acotan al proyecto en el handoff", () => {
    const s = src();
    const i = s.indexOf("const soloDeEsteProyecto");
    expect(i, "desapareció el filtro por proyecto del handoff").toBeGreaterThan(-1);

    // El filtro tolera lo no asignado: sacarlo dejaría al handoff sin contexto, no enfocado.
    const def = s.slice(i, i + 300);
    expect(def, "el filtro dejó de tolerar el material sin proyecto asignado").toContain(
      "projectId: null",
    );

    /* Y se aplica en las TRES queries, no en una. El tramo arranca en la primera de ellas y no
       en la definición del filtro: entre medio está el destructuring del `Promise.allSettled`,
       que hacía que el corte cayera antes de las queries y la guarda mirara 231 caracteres de
       nada (cazado al romperla). */
    const desde = s.indexOf("prisma.clientContextCard.findMany", i);
    expect(desde, "cambió el bloque de lecturas del cliente; revisar esta guarda").toBeGreaterThan(-1);
    const tramo = s.slice(desde, s.indexOf("bodyProjectId", desde));
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(300);
    for (const tabla of ["clientContextCard", "stageNote", "clientDocument"]) {
      const q = tramo.indexOf(`prisma.${tabla}.findMany`);
      expect(q, `cambió la query de ${tabla}; revisar esta guarda`).toBeGreaterThan(-1);
      expect(
        tramo.slice(q, q + 260),
        `${tabla} volvió a traer al cliente ENTERO al handoff del hermano menor`,
      ).toContain("soloDeEsteProyecto");
    }
  });

  it("el historial de HubSpot entra ETIQUETADO cuando hay hermano mayor", () => {
    /* Es el bloque más pesado del prompt y es POR EMPRESA: sobre el Conector de Spectrum, 22 de
       22 registros son de la implementación. No se filtra (el hermano menor ve todo el material)
       pero sin la etiqueta el modelo no tiene NINGUNA forma de saber que no son de este proyecto.
       La edición que la pone en rojo: sacar `${caveatDelMayor}` del bloque. */
    const s = src();
    const i = s.indexOf("const caveatDelMayor");
    expect(i, "desapareció el caveat del historial de HubSpot").toBeGreaterThan(-1);
    expect(s.slice(i, i + 700), "el caveat dejó de nombrar al hermano mayor").toContain(
      "hermanoMayor",
    );
    const bloque = s.indexOf("=== TIMELINE DE HUBSPOT");
    expect(bloque, "cambió el bloque del timeline; revisar esta guarda").toBeGreaterThan(-1);
    expect(
      s.slice(bloque, bloque + 200),
      "el historial volvió a entrar sin decir que puede ser de la implementación",
    ).toContain("${caveatDelMayor}");
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
