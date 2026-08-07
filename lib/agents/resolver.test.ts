import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  elegirAgente,
  pipelineKeyDeProyecto,
  AGENTES_DEL_GRUPO,
  GRUPOS_RESUELTOS_POR_TIPO,
} from "./resolver";
import { PROJECT_PIPELINES } from "@/lib/projects/kind";

/**
 * lib/agents/resolver.test.ts — QUÉ AGENTE LE TOCA A ESTE PROYECTO.
 *
 * ── EL ACCIDENTE QUE ESTE ARCHIVO CUIDA ─────────────────────────────────────
 * Antes del resolver, el agente de handoff salía de
 *
 *     prisma.agent.findFirst({ where: { agentGroup: "handoff" } })
 *
 * sin `orderBy` y sin filtrar `status`. Era determinista POR ACCIDENTE: hay exactamente una fila
 * con ese grupo. El día que se siembre la segunda —que es el objetivo declarado de esta tanda—
 * Postgres puede devolver cualquiera de las dos y **una Implementación de HubSpot se generaría
 * con el prompt de Sitios web**: sin error, sin log, sin nada que lo delate hasta que alguien lea
 * el documento entero y note que habla de mockups.
 *
 * El requisito duro de la tanda es «una Implementación tiene que verse EXACTAMENTE como hoy», y
 * lo que lo sostiene es una sola cosa: el fallback a `pipelineKey: null` devuelve LA MISMA FILA
 * de siempre, con el mismo id y el mismo prompt. Por eso la guarda de más abajo se escribe contra
 * el id REAL de producción y no contra un `"a"` inventado.
 */

const RAIZ = process.cwd();

/** El fuente sin comentarios: la prosa que explica el bug nombra los mismos símbolos vigilados. */
function fuente(rel: string): string {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
    .join("\n");
}

const RUTA_HANDOFF = "app/api/projects/[projectId]/handoff/route.ts";

/**
 * El id del ÚNICO agente de handoff que existe en producción (medido el 2026-08-07).
 * No es un fixture: es el dato contra el que se afirma «la Implementación no cambió».
 */
const HANDOFF_DE_HOY = "cmmla1g1x00005wijix3qnr7u";

/** Los pipelines reales, para que las keys de los tests no sean literales inventados. */
const ID_CS = PROJECT_PIPELINES.find((p) => p.key === "customer-success")!.hubspotPipelineId;
const ID_DEV = PROJECT_PIPELINES.find((p) => p.key === "development")!.hubspotPipelineId;
const ID_WEB = PROJECT_PIPELINES.find((p) => p.key === "web")!.hubspotPipelineId;

describe("elegirAgente", () => {
  /**
   * ── LA GUARDA DE LA TANDA ───────────────────────────────────────────────────
   * Es la que afirma el requisito duro: una Implementación de HubSpot resuelve HOY, y después de
   * sembrar las variantes, exactamente el mismo agente. Se escribe con el id real y con el mundo
   * real de hoy —una sola fila, sin `pipelineKey`— porque un fixture inventado probaría el
   * mecanismo y no la promesa.
   *
   * La edición que la pone en rojo: borrar la última línea de `elegirAgente` (el fallback a
   * `pipelineKey === null`) y devolver `null`. Nada más se cae: tipa, compila, y el botón de
   * generar handoff simplemente desaparece de todas las Implementaciones.
   */
  it("LA guarda: una Implementación resuelve el MISMO agente de hoy, con el mundo de hoy", () => {
    const comoEstaProduccionHoy = [{ id: HANDOFF_DE_HOY, pipelineKey: null }];

    const elegido = elegirAgente(comoEstaProduccionHoy, pipelineKeyDeProyecto(ID_CS));

    expect(elegido?.id).toBe(HANDOFF_DE_HOY);
  });

  /**
   * El mismo requisito, pero en el mundo de DESPUÉS de sembrar las variantes: con un agente de
   * Desarrollo y uno de Sitios web ya en la tabla, la Implementación sigue cayendo al genérico.
   * Es el caso que el `findFirst` viejo no podía garantizar.
   */
  it("con las variantes sembradas, la Implementación SIGUE cayendo al genérico", () => {
    const conVariantes = [
      { id: HANDOFF_DE_HOY, pipelineKey: null },
      { id: "agent-handoff-development", pipelineKey: "development" },
      { id: "agent-handoff-web", pipelineKey: "web" },
    ];

    expect(elegirAgente(conVariantes, pipelineKeyDeProyecto(ID_CS))?.id).toBe(HANDOFF_DE_HOY);
    expect(elegirAgente(conVariantes, pipelineKeyDeProyecto(ID_DEV))?.id).toBe(
      "agent-handoff-development",
    );
    expect(elegirAgente(conVariantes, pipelineKeyDeProyecto(ID_WEB))?.id).toBe("agent-handoff-web");
  });

  /**
   * ⚠ La razón de ser del módulo. Si el resultado dependiera del orden del array, el resolver no
   * arreglaría nada: `findMany` sin `orderBy` devuelve lo que Postgres quiera.
   */
  it("el orden de los candidatos NO cambia el resultado", () => {
    const candidatos = [
      { id: "generico", pipelineKey: null },
      { id: "dev", pipelineKey: "development" },
      { id: "web", pipelineKey: "web" },
    ];
    for (const key of ["customer-success", "development", "web"] as const) {
      const derecho = elegirAgente(candidatos, key)?.id;
      const alReves = elegirAgente([...candidatos].reverse(), key)?.id;
      expect(alReves, `el orden cambió el resultado para ${key}`).toBe(derecho);
    }
  });

  /**
   * ⚠ Nunca por descarte. Sin esta regla, sembrar el agente de Sitios web haría que un proyecto
   * de Desarrollo lo eligiera «porque era el único que quedaba» — y generaría un handoff de
   * mockups para un proyecto de integración.
   */
  it("un agente de OTRO tipo no se elige nunca, ni siendo el único", () => {
    const soloWeb = [{ id: "agent-handoff-web", pipelineKey: "web" }];

    expect(elegirAgente(soloWeb, "development")).toBeNull();
    expect(elegirAgente(soloWeb, "customer-success")).toBeNull();
    expect(elegirAgente(soloWeb, null)).toBeNull();
    expect(elegirAgente(soloWeb, "web")?.id).toBe("agent-handoff-web");
  });

  it("sin candidatos devuelve null (la pantalla no ofrece generar)", () => {
    expect(elegirAgente([], "customer-success")).toBeNull();
  });

  /**
   * Un `pipelineKey` que nadie declaró (typo, pipeline renombrado) NO puede ganarle al genérico.
   * INV15 lo reporta como trabajo muerto; acá se afirma que además es inofensivo.
   */
  it("un pipelineKey desconocido no le gana al genérico", () => {
    const candidatos = [
      { id: "generico", pipelineKey: null },
      { id: "fantasma", pipelineKey: "pipeline-que-no-existe" },
    ];
    for (const key of ["customer-success", "development", "web"] as const) {
      expect(elegirAgente(candidatos, key)?.id).toBe("generico");
    }
  });
});

describe("pipelineKeyDeProyecto", () => {
  it("traduce los tres pipelines declarados", () => {
    expect(pipelineKeyDeProyecto(ID_CS)).toBe("customer-success");
    expect(pipelineKeyDeProyecto(ID_DEV)).toBe("development");
    expect(pipelineKeyDeProyecto(ID_WEB)).toBe("web");
  });

  /**
   * Un pipeline que nadie declaró —los hay en producción: `default-onboarding-pipeline`— cae al
   * agente genérico, que es el comportamiento de hoy. Un pipeline desconocido NUNCA cambia de
   * comportamiento por accidente.
   */
  it("un pipeline sin declarar, o vacío, cae al genérico", () => {
    expect(pipelineKeyDeProyecto("default-onboarding-pipeline")).toBeNull();
    expect(pipelineKeyDeProyecto(null)).toBeNull();
    expect(pipelineKeyDeProyecto("")).toBeNull();
  });
});

describe("AGENTES_DEL_GRUPO", () => {
  /**
   * ⚠ `status: "ACTIVE"` no es cosmético. `/analyze` arma su propia lista de candidatos filtrando
   * por ACTIVE, así que un agente en DRAFT elegido acá produce el peor desenlace posible: el botón
   * dispara, el endpoint contesta **200** con `NO_AGENT_CONFIGURED`, y la pantalla no muestra
   * ningún error. Falla en silencio.
   *
   * La edición que la pone en rojo: sacar `status` del objeto que devuelve el helper.
   */
  it("el where filtra por ACTIVE, no solo por grupo", () => {
    expect(AGENTES_DEL_GRUPO("handoff")).toEqual({ agentGroup: "handoff", status: "ACTIVE" });
  });
});

describe("GRUPOS_RESUELTOS_POR_TIPO", () => {
  /**
   * La lista es la frontera de INV15. Si un grupo entra acá sin estar cableado al resolver, el
   * invariante empieza a exigir unicidad sobre grupos que legítimamente tienen 2 o 3 agentes
   * activos —`cronograma` (Avance + Detalle), `diagnostico` (tres)— y nace rojo sobre datos sanos.
   * Un invariante que nace rojo se apaga, y con él se apaga la protección real.
   */
  it("hoy solo el handoff se resuelve por grupo", () => {
    expect([...GRUPOS_RESUELTOS_POR_TIPO]).toEqual(["handoff"]);
  });
});

describe("el GET del handoff resuelve por el resolver", () => {
  /**
   * ── LA GUARDA DE FUENTE ─────────────────────────────────────────────────────
   * Un resolver perfecto que nadie llama no protege nada. Esta guarda afirma las dos mitades: que
   * la ruta usa `elegirAgente`, y que el `findFirst` viejo —el que era determinista por
   * accidente— no volvió por un merge o por un copy-paste desde otra ruta.
   *
   * La edición que la pone en rojo: reponer
   * `prisma.agent.findFirst({ where: { agentGroup: "handoff" } })` en el GET.
   */
  it("usa elegirAgente y no quedó ningún findFirst por agentGroup", () => {
    const src = fuente(RUTA_HANDOFF);

    expect(src, "la ruta dejó de importar el resolver").toContain(
      'from "@/lib/agents/resolver"',
    );
    expect(src, "la ruta dejó de llamar al resolver").toContain("elegirAgente(");

    const agentes = src.slice(src.lastIndexOf("prisma.agent."));
    expect(agentes.length, "la guarda no está mirando nada").toBeGreaterThan(80);
    expect(agentes, "volvió el findFirst que era determinista por accidente").not.toMatch(
      /prisma\.agent\.findFirst/,
    );
  });

  /**
   * El resolver necesita saber DE QUÉ TIPO es el proyecto. Sin `hubspotPipelineId` en el `select`,
   * `pipelineKeyDeProyecto` recibe `undefined`, todo cae al genérico, y las variantes por tipo
   * quedan sembradas sin que nadie las use jamás — el mismo trabajo muerto que INV15 persigue,
   * pero por el lado del código.
   */
  it("el agente se resuelve con el pipeline DEL PROYECTO, no con null", () => {
    /**
     * ⚠ La guarda mira el ARGUMENTO, no el `select`. Sacar `hubspotPipelineId` del select lo caza
     * `tsc` solo (la propiedad deja de existir en el tipo). Lo que NINGUNA herramienta caza es
     * pasar `null` acá: compila, tipa, no rompe ningún test — y manda TODOS los proyectos al
     * agente genérico, con lo cual las variantes por tipo quedan sembradas sin que nadie las use
     * jamás. Es el mismo trabajo muerto que persigue INV15, pero por el lado del código.
     *
     * La edición que la pone en rojo: `elegirAgente(candidatos, null)`.
     */
    /* ⚠ Y mira LA LLAMADA, no el archivo. La primera versión de esta guarda escaneaba el fuente
       entero y salió VERDE con el bug puesto: `pipelineKeyDeProyecto(project.hubspotPipelineId)`
       también aparece más abajo, en el payload que le manda el tipo a la pantalla. Se cazó
       rompiéndola a propósito. */
    const src = fuente(RUTA_HANDOFF);
    const i = src.indexOf("elegirAgente(");
    expect(i, "la ruta dejó de llamar al resolver").toBeGreaterThan(-1);
    const llamada = src.slice(i, i + 120);
    expect(llamada, "el resolver dejó de recibir el pipeline del proyecto").toContain(
      "pipelineKeyDeProyecto(project.hubspotPipelineId)",
    );
  });
});
