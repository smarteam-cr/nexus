import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { debeAnteponerSemanaCero, PRIMERA_FASE_ES_ARRANQUE } from "./semana-cero";
import { AGENTES_HANDOFF_POR_TIPO } from "@/lib/agents/handoff-por-tipo";
import { pipelineByKey } from "@/lib/projects/kind";

/**
 * lib/timeline/semana-cero.test.ts — LA TABLA DE LA SEMANA 0.
 *
 * El bug que este archivo congela: `persistTimelineFromAgentOutput` anteponía "Semana 0"
 * INCONDICIONALMENTE, deshaciendo en la persistencia lo que los prompts por tipo prohibieron en
 * la generación («NO existe Semana 0 acá»). Sin error, sin log: el cronograma del hermano menor
 * amanecía con la fase del hub que el usuario pidió no ver.
 */

const CS = pipelineByKey("customer-success").hubspotPipelineId;
const DEV = pipelineByKey("development").hubspotPipelineId;
const WEB = pipelineByKey("web").hubspotPipelineId;

describe("debeAnteponerSemanaCero — la tabla", () => {
  it("Customer Success conserva la conducta de HOY, caso por caso", () => {
    // Sin arranque → se antepone (el invariante histórico del hub).
    expect(debeAnteponerSemanaCero(CS, "Diagnóstico inicial")).toBe(true);
    expect(debeAnteponerSemanaCero(CS, "")).toBe(true);
    expect(debeAnteponerSemanaCero(CS, null)).toBe(true);
    // Ya arranca → no se duplica. Los cuatro sabores del regex, transcritos.
    expect(debeAnteponerSemanaCero(CS, "Semana 0")).toBe(false);
    expect(debeAnteponerSemanaCero(CS, "semana cero")).toBe(false);
    expect(debeAnteponerSemanaCero(CS, "Kick-off técnico")).toBe(false);
    expect(debeAnteponerSemanaCero(CS, "Arranque del proyecto")).toBe(false);
  });

  it("pipeline desconocido o sin pipeline degrada a la conducta legacy (= CS)", () => {
    expect(debeAnteponerSemanaCero("default-onboarding-pipeline", "Fase 1")).toBe(true);
    expect(debeAnteponerSemanaCero(null, "Fase 1")).toBe(true);
    expect(debeAnteponerSemanaCero(null, "Kickoff")).toBe(false);
  });

  /**
   * ── LA GUARDA DEL ARREGLO ───────────────────────────────────────────────────
   * La edición que la pone en rojo: borrar la rama `if (key && AGENTES_HANDOFF_POR_TIPO…)` de
   * `debeAnteponerSemanaCero`. Nada más se cae — tipa, compila, y el cronograma de cada
   * desarrollo vuelve a amanecer con la Semana 0 del hub.
   */
  it("LA guarda: Desarrollo y Sitios web NUNCA reciben la Semana 0, diga lo que diga la fase", () => {
    for (const pid of [DEV, WEB]) {
      expect(debeAnteponerSemanaCero(pid, "Relevamiento técnico")).toBe(false);
      expect(debeAnteponerSemanaCero(pid, "")).toBe(false);
      expect(debeAnteponerSemanaCero(pid, null)).toBe(false);
      // Y si el agente igual propuso un arranque, tampoco: no hay nada que anteponer.
      expect(debeAnteponerSemanaCero(pid, "Kickoff")).toBe(false);
    }
  });

  it("acople: TODO pipeline con agente de handoff propio queda cubierto solo", () => {
    /* El día que se siembre un tercer agente por tipo, esta vuelta lo cubre sin editar la regla.
       Si alguien hardcodeara `key === "development" || key === "web"` en su lugar, el tercero
       volvería a recibir la Semana 0 y este test lo diría. */
    for (const a of AGENTES_HANDOFF_POR_TIPO) {
      const pid = pipelineByKey(a.pipelineKey).hubspotPipelineId;
      expect(debeAnteponerSemanaCero(pid, "lo que sea"), a.pipelineKey).toBe(false);
    }
  });
});

describe("candado: la ruta decide por el módulo, no por un regex inline", () => {
  const RUTA = "app/api/clients/[id]/analyze/route.ts";

  /** El fuente sin comentarios: la prosa que explica el bug puede nombrar el patrón vigilado. */
  const fuente = (): string =>
    fs
      .readFileSync(path.join(process.cwd(), RUTA), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .join("\n");

  it("analyze llama a debeAnteponerSemanaCero y el regex no volvió inline", () => {
    const src = fuente();
    expect(src, "la ruta dejó de decidir por el módulo").toContain("debeAnteponerSemanaCero(");
    /* El regex duplicado es la forma exacta en que la decisión vuelve a bifurcarse: alguien
       "simplifica" la llamada reponiendo el test inline, y CS sigue igual mientras development
       recupera la Semana 0 en silencio. */
    expect(src, "volvió el regex inline: la decisión vive en dos lugares").not.toMatch(
      /semana\\s\*0/,
    );
  });

  it("condicionar no era borrar: la fase antepuesta sigue viva para CS", () => {
    const src = fuente();
    expect(
      src,
      "desapareció la rama que antepone la Semana 0 — una Implementación dejaría de arrancar con Kickoff",
    ).toContain("Kickoff y levantamiento inicial con el cliente");
  });

  it("PRIMERA_FASE_ES_ARRANQUE es el regex histórico, byte a byte", () => {
    // Congela la fuente única. Si cambia, que sea a propósito y con este test en la mano.
    expect(PRIMERA_FASE_ES_ARRANQUE.source).toBe("semana\\s*0|semana\\s*cero|kick.?off|arranque");
    expect(PRIMERA_FASE_ES_ARRANQUE.flags).toBe("i");
  });
});
