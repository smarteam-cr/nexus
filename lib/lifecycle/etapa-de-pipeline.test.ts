/**
 * lib/lifecycle/etapa-de-pipeline.test.ts — los candados de B1.
 *
 * La sección "Ciclo de vida" ahora tiene DOS cuerpos, y las tres operaciones de la
 * metodología de Customer Success (compuertas, override de etapa, modalidad de adopción)
 * dejaron de aplicarle a los proyectos cuya etapa manda su pipeline de HubSpot.
 *
 * ── LO QUE ATACA ─────────────────────────────────────────────────────────────
 * 1. Que alguien agregue un endpoint de la metodología de CS y se olvide del veto. Ese
 *    endpoint escribiría filas de un vocabulario ajeno sobre un desarrollo — y esas filas
 *    lo vuelven NO BORRABLE por `scripts/limpiar-piezas-basura.ts`, que se niega ante
 *    "etapas marcadas". Es exactamente la fuga que ya nos pasó con `USO_VALIDADO`.
 * 2. Que el veto se ponga ANTES de la rama de limpiar. Ahí una curación vieja quedaría
 *    encerrada: el proyecto se reclasifica y ya nadie puede deshacer lo que marcó a mano.
 * 3. Que un componente de React empiece a decidir por pipeline. La tabla vive en
 *    `lib/projects/kind.ts`; el día que un id de HubSpot aparezca dentro de un `.tsx`, el
 *    cuarto pipeline se agrega en cinco lugares en vez de en uno.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";

const RAIZ = process.cwd();

/** Igual que en las otras guardas: escáner de izquierda a derecha, no dos `replace`. */
function soloCodigo(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const fin = src.indexOf("\n", i);
      i = fin === -1 ? src.length : fin;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      i = fin === -1 ? src.length : fin + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const codigoDe = (rel: string) => soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

/**
 * Los endpoints que escriben algo de la METODOLOGÍA de Customer Success. Lista explícita y
 * no descubrimiento por directorio: `app/api/projects/[projectId]` tiene decenas de rutas y
 * casi ninguna es de ciclo de vida. Sumar una acá es una decisión de una línea; el costo de
 * olvidarse está escrito arriba.
 */
const ENDPOINTS_DE_CS = [
  "app/api/projects/[projectId]/stage-gates/route.ts",
  "app/api/projects/[projectId]/lifecycle-stage/route.ts",
  "app/api/projects/[projectId]/adoption-mode/route.ts",
];

describe("las operaciones de Customer Success no le aplican a un proyecto de pipeline", () => {
  for (const rel of ENDPOINTS_DE_CS) {
    it(`${rel} pide el veto`, () => {
      /* Se busca LA LLAMADA, no el nombre a secas: el `import` de arriba también contiene
         el identificador, así que un `toContain("vetoSiNoCorreCicloDeCs")` seguía pasando
         con el veto borrado del cuerpo. Lo comprobamos rompiéndolo. */
      expect(
        codigoDe(rel),
        `${rel} escribe algo del ciclo de Customer Success sin preguntar si el proyecto lo ` +
          `corre. Un desarrollo terminaría con compuertas de una metodología que no es la suya.`,
      ).toContain("await vetoSiNoCorreCicloDeCs(projectId)");
    });
  }

  it("LIMPIAR se permite siempre: el veto va DESPUÉS de la rama que borra", () => {
    /* Si un proyecto se reclasifica después de que alguien curó la etapa o la modalidad a
       mano, la curación vieja tiene que poder deshacerse. Un veto puesto arriba la deja
       encerrada para siempre. */
    for (const rel of ["app/api/projects/[projectId]/lifecycle-stage/route.ts", "app/api/projects/[projectId]/adoption-mode/route.ts"]) {
      const codigo = codigoDe(rel);
      const posLimpia = codigo.indexOf("cleared: true");
      const posVeto = codigo.indexOf("vetoSiNoCorreCicloDeCs(projectId)");
      expect(posLimpia, `${rel}: no encontré la rama de limpiar`).toBeGreaterThan(-1);
      expect(posVeto, `${rel}: no encontré el veto`).toBeGreaterThan(-1);
      expect(
        posLimpia < posVeto,
        `${rel}: el veto está ANTES de la rama de limpiar. Una curación vieja quedaría ` +
          `encerrada sin forma de deshacerse.`,
      ).toBe(true);
    }
  });

  it("desmarcar una compuerta (DELETE) NO se veta", () => {
    // Mismo motivo: desmarcar es limpiar. Solo el POST crea la fila.
    const codigo = codigoDe("app/api/projects/[projectId]/stage-gates/route.ts");
    const posDelete = codigo.indexOf("export async function DELETE");
    expect(posDelete, "no encontré el DELETE").toBeGreaterThan(-1);
    expect(
      codigo.indexOf("vetoSiNoCorreCicloDeCs(projectId)", posDelete),
      "el DELETE de stage-gates no debería vetar: desmarcar es limpiar, y una compuerta " +
        "vieja tiene que poder deshacerse aunque el proyecto se haya reclasificado.",
    ).toBe(-1);
  });

  it("el veto responde 409 y no 403", () => {
    /* No es falta de permisos: el recurso no admite la operación, y ningún permiso la va a
       habilitar. Un 403 manda al usuario a pedir accesos que no le van a servir. */
    const gate = codigoDe("lib/lifecycle/gate.ts");
    expect(gate).toContain("status: 409");
    expect(gate).not.toContain("status: 403");
  });
});

describe("el DTO del ciclo de vida se bifurca, no se unifica", () => {
  it("la ruta discrimina por `fuente`", () => {
    const codigo = codigoDe("app/api/projects/[projectId]/lifecycle/route.ts");
    expect(
      codigo,
      "Mandar las dos formas con los mismos campos obligaría a rellenar compuertas vacías y " +
        "una etapa inventada, y la pantalla no tendría cómo saber que esos ceros no dicen nada.",
    ).toContain('lc.fuente === "pipeline"');
  });

  it("el panel monta los dos cuerpos, no oculta la sección", () => {
    /* El requisito era la MISMA sección: un desarrollo tiene que ver SU ciclo de vida ahí,
       no un hueco donde los demás tienen algo. */
    const panel = codigoDe("components/lifecycle/ProjectLifecyclePanel.tsx");
    expect(panel).toContain('data.fuente === "pipeline"');
    expect(panel).toContain("CuerpoDePipeline");
    const montaje = codigoDe("components/clients/ProjectCanvasPanel.tsx");
    expect(
      montaje,
      "el panel de ciclo de vida no puede montarse bajo condición: la sección es la misma " +
        "para todos, lo que cambia es su contenido.",
    ).toContain("<ProjectLifecyclePanel projectId={projectId} />");
  });
});

describe("el motor de 8 etapas queda PARQUEADO, no borrado", () => {
  /* Decisión de negocio del 2026-07-30: la etapa de una implementación la manda HubSpot, y
     las alarmas por etapa se apagan hasta que existan las nuevas —las que van a mirar lo que
     se habló en las sesiones—. Recién ahí se decide si el motor viejo se reusa en algún lado
     o se retira.
     Hasta entonces el código se queda ENTERO y sin consumidor, que es un estado incómodo y
     por eso fácil de "limpiar" sin querer. Estos asserts son el recordatorio. */

  it("el motor sigue existiendo y exportando lo suyo", () => {
    const engine = codigoDe("lib/lifecycle/stage-engine.ts");
    for (const exportado of [
      "export function inferLifecycleStage",
      "export function resolveLifecycleStage",
      "export const FULL_CYCLE_ORDER",
      "export const STAGE_LABEL_ES",
    ]) {
      expect(engine, `stage-engine.ts perdió ${exportado}`).toContain(exportado);
    }
  });

  it("la rama de Customer Success del loader sigue entera", () => {
    /* Compuertas, override, modalidad de adopción y UUS: si alguien las borra "porque nadie
       las lee", volver es reescribirlas en vez de cambiar una celda de la tabla. */
    const loader = codigoDe("lib/lifecycle/load.ts");
    for (const campo of ["gates:", "override:", "adoptionMode:", "uus:", "inferLifecycleStage("]) {
      expect(loader, `el loader perdió ${campo}`).toContain(campo);
    }
  });

  it("los tres endpoints de la metodología siguen en pie, con su veto", () => {
    // Responden 409 para un proyecto cuya etapa manda HubSpot — que hoy son todos, menos
    // los de pipeline desconocido. Borrarlos sería perder también el camino de vuelta.
    for (const rel of ENDPOINTS_DE_CS) {
      expect(fs.existsSync(path.join(RAIZ, rel)), `${rel} desapareció`).toBe(true);
    }
  });

  it("volver es UNA celda de la tabla", () => {
    /* Lo que apagó el ciclo fue `cicloOchoEtapas: false` en la fila de Customer Success.
       Si alguien empieza a esparcir esa decisión en `if`s por el código, dejar de aplicarla
       deja de ser reversible. */
    const kind = codigoDe("lib/projects/kind.ts");
    const ocurrencias = [...kind.matchAll(/cicloOchoEtapas/g)].length;
    expect(
      ocurrencias,
      "«cicloOchoEtapas» aparece más veces de las esperadas en kind.ts (la interfaz, las dos " +
        "filas base, el overlay que la respeta y `fuenteDelCiclo`). Si la decisión se repartió, " +
        "revertirla dejó de ser un cambio de una línea.",
    ).toBeLessThanOrEqual(6);
  });
});

describe("ningún componente decide por pipeline", () => {
  it("los ids de HubSpot no aparecen en components/", () => {
    /* La tabla de decisiones vive en lib/projects/kind.ts. Un id adentro de un .tsx
       significa que el cuarto pipeline se agrega en cinco lugares en vez de en uno. */
    const ids = PROJECT_PIPELINES.map((p) => p.hubspotPipelineId);
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) archivos.push(p);
      }
    };
    recorrer(path.join(RAIZ, "components"));
    expect(archivos.length, "no encontré componentes").toBeGreaterThan(50);
    for (const f of archivos) {
      const src = fs.readFileSync(f, "utf8");
      for (const id of ids) {
        expect(src.includes(id), `${path.relative(RAIZ, f)} lleva el id de pipeline ${id}`).toBe(
          false,
        );
      }
    }
  });
});
