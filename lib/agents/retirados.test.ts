/**
 * lib/agents/retirados.test.ts — UN AGENTE RETIRADO NO SE DESPACHA, AUNQUE SU FILA SIGA ACTIVA.
 *
 * Correr: `npx vitest run lib/agents/retirados.test.ts --project unit`.
 *
 * E4 (2026-09): se retiró «Pedir cambio con IA» (`agent-timeline-assist`). Su fila puede seguir ACTIVE
 * en la tabla `Agent` hasta que Elías la pase a Borrador, y no tiene paso asociado: /analyze la
 * alcanzaba por id y por el respaldo `associatedStep === null` de un pedido sin id. Estas guardas fijan
 * las dos puertas cerradas y el gate de artefactos que lo sigue gateando.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AGENTES_RETIRADOS, esAgenteRetirado } from "./retirados";

const RAIZ = path.join(__dirname, "..", "..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: una línea comentada no despacha ni filtra nada. */
const soloCodigo = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^\s*\/\/.*$/gm, "");

describe("E4 · el modificador del cronograma queda retirado por nombre", () => {
  it("la lista nombra `agent-timeline-assist`, y el predicado lo reconoce", () => {
    /* La edición que la pone en rojo: sacar el id de la lista (su fila activa vuelve a ser despachable). */
    expect(AGENTES_RETIRADOS).toContain("agent-timeline-assist");
    expect(esAgenteRetirado("agent-timeline-assist")).toBe(true);
    expect(esAgenteRetirado("agent-timeline-detail")).toBe(false);
  });

  it("⛔ /analyze lo saca de los candidatos ANTES de elegir: ni por id ni por el respaldo sin paso", () => {
    /* La edición que la pone en rojo: sacar el filtro (o ponerlo después de elegir el agente). Sin él, un
       POST con su id, o uno sin id que cae en `associatedStep === null`, lo vuelve a correr. */
    const analyze = soloCodigo(leer("app/api/clients/[id]/analyze/route.ts"));
    const iFiltro = analyze.indexOf(".filter((a) => !esAgenteRetirado(a.id))");
    const iElige = analyze.indexOf("let agent = null");
    expect(iFiltro, "analyze dejó de filtrar los agentes retirados").toBeGreaterThan(-1);
    expect(iElige).toBeGreaterThan(-1);
    expect(iFiltro, "el filtro llega después de elegir el agente").toBeLessThan(iElige);
    expect(analyze.slice(analyze.indexOf("const agentCandidates"), iElige)).toContain("esAgenteRetirado(");
  });

  it("y el gate de artefactos lo sigue gateando en el grupo `cronograma` (defensa en profundidad)", () => {
    /* La edición que la pone en rojo: volver a nombrarlo por un import del módulo borrado, o soltarlo del
       `case "cronograma"` (con la fila activa, correría sin celda de permiso si alguien lo despachara). */
    const gate = soloCodigo(leer("lib/auth/permissions/artifact-gate.ts"));
    const iCase = gate.indexOf('case "cronograma": {');
    const iFin = gate.indexOf("default: {", iCase);
    expect(iCase).toBeGreaterThan(-1);
    expect(gate.slice(iCase, iFin)).toContain("esAgenteRetirado(agent.id)");
  });
});
