import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AGENTES_HANDOFF_POR_TIPO, KEYS, PROMPT_DEV, PROMPT_WEB } from "./handoff-por-tipo";
import { HANDOFF_CANVAS } from "@/lib/canvas/canvas-defs";
import { lineaDeAvance, pipelineByKey } from "@/lib/projects/kind";
import { GRUPOS_RESUELTOS_POR_TIPO } from "./resolver";

/**
 * lib/agents/handoff-por-tipo.test.ts — EL CONTRATO DE LOS PROMPTS POR TIPO.
 *
 * ── QUÉ SE ROMPE EN SILENCIO ────────────────────────────────────────────────
 * Un prompt es una string: no tipa, no compila, no falla. Las tres formas de arruinarlo dan
 * todas el mismo síntoma —"salió raro"— y ninguna produce un error:
 *
 *  1. **Se cae `timeline.phases`** → el handoff sale perfecto y el cronograma NO NACE. Es
 *     literalmente el bug que la Tanda F vino a arreglar, reintroducido por el otro lado.
 *  2. **Cambia una key de sección** → `reconcileHandoffCanvasSections` renormaliza el canvas
 *     contra la plantilla única antes de cada generación, así que esa sección se escribe en la
 *     nada y aparece vacía en el documento.
 *  3. **Se cuela vocabulario de la implementación de HubSpot** ("Semana 0", "adopción de hubs")
 *     → el proyecto de desarrollo recibe un plan de adopción con el desarrollo aplastado, que
 *     es exactamente el escenario que motivó escribir estos dos agentes.
 */

const RAIZ = process.cwd();
const SEED = "scripts/seed-handoff-agents-por-tipo.ts";

const PROMPTS: ReadonlyArray<readonly [string, string]> = [
  ["desarrollo", PROMPT_DEV],
  ["sitio web", PROMPT_WEB],
];

describe("el contrato de salida — los dos prompts piden lo mismo que el de siempre", () => {
  /**
   * ── LA GUARDA ───────────────────────────────────────────────────────────────
   * La edición que la pone en rojo: sacar el bloque `"timeline"` del JSON schema de cualquiera
   * de los dos prompts. Nada más se cae: el seed corre, el agente genera, el documento sale
   * completo — y el proyecto se queda con cero fases y una pantalla de cronograma sin salida.
   */
  it("LA guarda: los dos piden timeline.phases con durationWeeks", () => {
    for (const [tipo, p] of PROMPTS) {
      expect(p, `${tipo}: dejó de pedir el cronograma — las fases no nacen`).toContain('"timeline"');
      expect(p, `${tipo}: dejó de pedir las fases`).toContain('"phases"');
      expect(p, `${tipo}: una fase sin duración no se puede dibujar`).toContain("durationWeeks");
    }
  });

  it("los dos piden las 10 secciones con las keys EXACTAS del canvas", () => {
    expect(KEYS).toEqual(HANDOFF_CANVAS.sections.map((s) => s.key));
    for (const [tipo, p] of PROMPTS) {
      for (const k of KEYS) {
        expect(p, `${tipo}: falta la sección "${k}" — saldría vacía en el documento`).toContain(
          `"key": "${k}"`,
        );
      }
    }
  });

  it("los dos devuelven los tres campos de clasificación", () => {
    for (const [tipo, p] of PROMPTS) {
      for (const campo of ["implementationType", "isRecurrent", "tags"]) {
        expect(p, `${tipo}: dejó de devolver ${campo}`).toContain(`"${campo}"`);
      }
    }
  });
});

describe("las fases son del tipo, no de una implementación de HubSpot", () => {
  /**
   * El motivo de existir de estos dos agentes. Si el prompt de desarrollo dijera "Semana 0" o
   * hablara de adoptar hubs, sería el agente de siempre con otro nombre — y el usuario vería
   * exactamente el documento que pidió no ver.
   */
  it("ninguno de los dos arrastra el vocabulario del hub", () => {
    for (const [tipo, p] of PROMPTS) {
      // Los dos NOMBRAN "Semana 0" para prohibirla; lo que no puede aparecer es la orden.
      expect(p, `${tipo}: volvió la Semana 0 obligatoria del hub`).not.toContain("SEMANA 0 SIEMPRE");
      expect(p, `${tipo}: volvió el enfoque estándar del hub`).not.toContain("ENFOQUE ESTÁNDAR DEL HUB");
      expect(p, `${tipo}: se presenta como consultor de Customer Success`).not.toContain(
        "Consultor de Customer Success",
      );
    }
  });

  /**
   * Las fases salen de la línea que HubSpot declara y Nexus transcribe. Escribirlas a mano en el
   * prompt crearía una segunda fuente: el día que el portal gane una etapa, el cronograma
   * propuesto y el tablero real dirían cosas distintas sin que nada avise.
   */
  it("cada prompt interpola la línea de entrega de SU pipeline", () => {
    const etapas = (key: "development" | "web") =>
      lineaDeAvance(pipelineByKey(key))
        .filter((s) => !s.terminal && s.label !== "Handoff")
        .map((s) => s.label);

    for (const e of etapas("development")) expect(PROMPT_DEV).toContain(e);
    for (const e of etapas("web")) expect(PROMPT_WEB).toContain(e);

    // Y no al revés: "Mockup" y "Consenso" son del sitio, no del desarrollo.
    expect(PROMPT_DEV, "el prompt de desarrollo propone fases de sitio web").not.toContain("Mockup");
    expect(PROMPT_WEB, "el prompt de sitio web propone fases de desarrollo").not.toContain(
      "Requerimientos",
    );
  });

  it("los dos declaran que NO son la implementación del cliente", () => {
    /* Es la palanca que compensa haber dejado entrar todo el material (decisión de negocio del
       2026-08-06). Sin esta línea, la nota de exclusión del CSE pelea sola contra 22 registros
       de HubSpot que hablan de la implementación. */
    for (const [tipo, p] of PROMPTS) {
      expect(p, `${tipo}: dejó de advertir que no es la implementación de HubSpot`).toContain(
        "NO ES LA IMPLEMENTACIÓN DE HUBSPOT",
      );
      expect(p, `${tipo}: dejó de respetar la nota de exclusión del CSE`).toContain(
        "nota de exclusión",
      );
    }
  });
});

describe("las dos filas nacen usables", () => {
  it("sus pipelineKey son los de la tabla, y son distintos", () => {
    const keys = AGENTES_HANDOFF_POR_TIPO.map((a) => a.pipelineKey);
    expect(new Set(keys).size, "dos agentes con el mismo tipo: INV15 los rechaza").toBe(keys.length);
    for (const k of keys) expect(() => pipelineByKey(k)).not.toThrow();
  });

  it("ningún id choca con el agente de siempre", () => {
    const ids = AGENTES_HANDOFF_POR_TIPO.map((a) => a.id);
    expect(ids).not.toContain("cmmla1g1x00005wijix3qnr7u");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("el grupo que usan está declarado como resuelto por tipo", () => {
    /* Sin esto, `pipelineKey` sería trabajo muerto: el resolver no mira el grupo, el navegador
       dispara por id, y los dos prompts quedarían escritos sin que nadie los use. INV15 lo
       reporta contra la base; esto lo afirma en el código. */
    expect(GRUPOS_RESUELTOS_POR_TIPO).toContain("handoff");
  });
});

describe("candado: el seed avisa en vez de pisar", () => {
  /**
   * `scripts/seed-handoff-agent.ts` hace `upsert` escribiendo `systemPrompt` INCONDICIONALMENTE.
   * Copiar ese molde acá multiplica por tres el peor modo de falla del repo: una corrida por
   * reflejo borra la calibración que un humano hizo en la pantalla de agentes, sin aviso y sin
   * vuelta atrás. El molde correcto —`create-cs-watchdog-agent.ts`— lee el prompt vivo, lo
   * compara y avisa.
   *
   * La edición que la pone en rojo: borrar la comparación `existing.systemPrompt !== ...`.
   */
  it("LA guarda: compara contra el prompt vivo antes de escribir, y respeta --force", () => {
    const src = fs.readFileSync(path.join(RAIZ, SEED), "utf8");
    expect(src, "el seed dejó de comparar: una corrida pisa la calibración humana").toContain(
      "existing.systemPrompt !== def.systemPrompt",
    );
    expect(src, "sin --force, la comparación es una pared en vez de un aviso").toContain("--force");
    expect(src, "el seed dejó de correr el guard de escritura a producción").toContain(
      "assertProdWriteAllowed(",
    );
  });

  it("los agentes nacen ACTIVE, no en el DRAFT por default del API", () => {
    /* Un agente en DRAFT elegido por el resolver es el peor desenlace posible: `/analyze` lo
       descarta al armar sus candidatos, el endpoint contesta **200** con NO_AGENT_CONFIGURED, y
       la pantalla no muestra ningún error. El botón simplemente no hace nada. */
    const src = fs.readFileSync(path.join(RAIZ, SEED), "utf8");
    expect(src).toContain("status: AgentStatus.ACTIVE");
  });

  it("el seed NO toca al agente de Customer Success", () => {
    /* Es lo que garantiza «una Implementación se ve exactamente como hoy».
       ⚠ Sobre el fuente SIN COMENTARIOS: la cabecera nombra a `scripts/seed-handoff-agent.ts`
       justamente para explicar por qué NO se copió su molde, y un scan crudo lo confundiría
       con una dependencia. (El nombre de este archivo también lo contiene como prefijo.) */
    const src = fs
      .readFileSync(path.join(RAIZ, SEED), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n");
    expect(src, "el seed nombra al agente de CS: puede pisarlo").not.toContain(
      "cmmla1g1x00005wijix3qnr7u",
    );
    expect(src, "el seed importa del seed viejo").not.toContain('from "./seed-handoff-agent');
  });
});
