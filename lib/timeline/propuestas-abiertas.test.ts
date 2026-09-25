/**
 * lib/timeline/propuestas-abiertas.test.ts — el control antes del deploy y la vuelta atrás de las
 * propuestas del cronograma (scripts/propuestas-abiertas.ts, E2b P8).
 *
 * Lo puro vive en scripts/lib/propuestas-abiertas.ts. El test vive acá porque el project `unit` solo
 * incluye lib/** (el mismo patrón que lib/db/guard.test.ts).
 *
 * Qué se congela:
 *   · desde E2b el v1 ya no frena el deploy (lo escriben también el handoff y «Regenerar» de una
 *     fase), y el viejo del handoff tampoco (su lector vive hasta E4);
 *   · la vuelta atrás deja los v1 «solo de fases» (los del handoff: E1 los lee bien) y limpia los
 *     que esperan o traen tareas, con la escritura condicionada de siempre (token + formato);
 *   · el listado y la inspección imprimen `origen` y `soloFase`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { borradorDelHandoff, borradorVacio, FORMATO_BORRADOR, type Borrador, type Vivo } from "./borrador";
import type { ProposalLike } from "./proposal-deltas";
import { FORMATOS, FRENAN_EL_DEPLOY, esV1SoloDeFases, formatoDe } from "../../scripts/lib/propuestas-abiertas";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const fase = (id: string, name: string, durationWeeks: number) => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
});
const VIVO: Vivo = { ancla: "2026-10-05", fases: [fase("a", "Kick-off", 1), fase("b", "Diseño", 2)] };
const PROPUESTA: ProposalLike = {
  anchorStartDate: "2026-10-05T00:00:00.000Z",
  phases: [
    fase("a", "Kick-off", 1),
    fase("b", "Diseño", 3),
    { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null },
  ],
};
/** El v1 que deja el handoff desde E2b, tal como queda guardado (ida y vuelta por JSON). */
const DEL_HANDOFF = JSON.parse(
  JSON.stringify(borradorDelHandoff({ propuesta: PROPUESTA, vivo: VIVO, nuevaClave: () => "aaaaaaaa-1111" })),
) as Borrador;
const VIEJA_DEL_HANDOFF = { anchorStartDate: null, phases: [{ id: "a", name: "Kick-off", order: 0, durationWeeks: 1 }] };

describe("scripts/propuestas-abiertas — qué frena el deploy de E2b", () => {
  it("⭐ el v1 y la vieja del handoff ya no frenan; sí la vieja de «contexto», la vieja con `tasks` y lo ilegible", () => {
    /* La edición que la pone en rojo: volver a sumar "v1" (la calibración de E2a: después de E2a un v1
       abierto es normal) o sumar "viejo-handoff" (eso es de E4, cuando se va su lector). */
    expect(FRENAN_EL_DEPLOY).toEqual(["viejo-contexto", "viejo-con-tasks", "ilegible"]);
    expect(FRENAN_EL_DEPLOY).not.toContain("v1");
    expect(FRENAN_EL_DEPLOY).not.toContain("viejo-handoff");
    for (const k of FRENAN_EL_DEPLOY) expect(FORMATOS).toContain(k);
  });

  it("cada propuesta cae en UN formato: los v1 de E2b (handoff y una fase) son «v1»", () => {
    expect(DEL_HANDOFF.formato).toBe(FORMATO_BORRADOR);
    expect(formatoDe(DEL_HANDOFF)).toBe("v1");
    expect(formatoDe(borradorVacio({ pedido: "regenerar", corrida: "run-1", soloFase: "b" }))).toBe("v1");
    expect(formatoDe(VIEJA_DEL_HANDOFF)).toBe("viejo-handoff");
    expect(formatoDe({ ...VIEJA_DEL_HANDOFF, origen: "contexto" })).toBe("viejo-contexto");
    expect(formatoDe({ anchorStartDate: null, phases: [{ name: "Kick-off", durationWeeks: 1, tasks: [] }] })).toBe("viejo-con-tasks");
    for (const raro of [null, {}, "x", { phases: "no" }]) expect(formatoDe(raro)).toBe("ilegible");
  });

  it("el control usa esa lista, sin una copia propia en el script", () => {
    const src = leer("scripts/propuestas-abiertas.ts");
    expect(src).toContain('from "./lib/propuestas-abiertas"');
    expect(src).not.toMatch(/const FRENAN_EL_DEPLOY\b/);
    expect(src).not.toMatch(/function formatoDe\b/);
    expect(src).toContain("const frenan = FRENAN_EL_DEPLOY.filter(");
  });
});

describe("scripts/propuestas-abiertas — la vuelta atrás deja los v1 solo de fases", () => {
  it("⭐ el v1 del handoff (sin tareas y sin `tarea-*`) se queda: E1 lo lee bien", () => {
    /* La edición que la pone en rojo: limpiar todo v1 otra vez (se tirarían sugerencias del handoff
       que nadie revisó) o exigir algo que el handoff no escribe. */
    expect(DEL_HANDOFF.tareas).toBeNull();
    expect(DEL_HANDOFF.cambios.length).toBeGreaterThan(0);
    expect(esV1SoloDeFases(DEL_HANDOFF)).toBe(true);
    const { tareas: _t, ...sinLaClave } = DEL_HANDOFF;
    void _t;
    expect(esV1SoloDeFases(sinLaClave), "sin la clave `tareas` tampoco espera tareas").toBe(true);
  });

  it("⛔ se limpian los que esperan o traen tareas: el vacío, el de una fase, el ya armado y cualquier `tarea-*`", () => {
    /* La edición que la pone en rojo: mirar solo `tareas`, o mirar los cambios ya LEÍDOS (el lector
       descarta como desconocido un `tarea-*` que esta versión no conoce, y E1 lo bloquearía). */
    expect(esV1SoloDeFases(borradorVacio({ pedido: "regenerar", corrida: "run-1" }))).toBe(false);
    expect(esV1SoloDeFases(borradorVacio({ pedido: "regenerar", corrida: "run-1", soloFase: "b" }))).toBe(false);
    expect(esV1SoloDeFases({ ...DEL_HANDOFF, tareas: { corrida: "run-1", listas: true } })).toBe(false);
    const tareaNueva = {
      tipo: "tarea-nueva",
      clave: "t:uno",
      fase: "b",
      tarea: { title: "Probar", weekIndex: 0, notes: null, party: "SMARTEAM", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
    };
    expect(esV1SoloDeFases({ ...DEL_HANDOFF, cambios: [...DEL_HANDOFF.cambios, tareaNueva] })).toBe(false);
    const deE3 = { tipo: "tarea-cambia", clave: "tarea:x:cambia", tareaId: "x" };
    expect(esV1SoloDeFases({ ...DEL_HANDOFF, cambios: [...DEL_HANDOFF.cambios, deE3] }), "un `tarea-*` desconocido").toBe(false);
  });

  it("lo que no es un v1 no entra (la vuelta atrás solo mira los v1)", () => {
    expect(esV1SoloDeFases(VIEJA_DEL_HANDOFF)).toBe(false);
    expect(esV1SoloDeFases(null)).toBe(false);
  });

  it("⭐ el script limpia SOLO los que no son solo de fases, con la escritura condicionada de siempre", () => {
    /* La edición que la pone en rojo: recorrer `v1s` en vez de `aLimpiar`, o soltar el token o el
       formato del `where` (se pisaría una propuesta que entró después de leer). */
    const src = leer("scripts/propuestas-abiertas.ts");
    const tramo = src.slice(src.indexOf("if (ROLLBACK) {"));
    const filtro = tramo.indexOf("const aLimpiar = v1s.filter((f) => !esV1SoloDeFases(f.pendingProposal));");
    const bucle = tramo.indexOf("for (const f of aLimpiar) {");
    const escribe = tramo.indexOf("prisma.projectTimeline.updateMany(");
    expect(filtro).toBeGreaterThan(-1);
    expect(bucle).toBeGreaterThan(filtro);
    expect(escribe).toBeGreaterThan(bucle);
    expect(tramo).not.toContain("for (const f of v1s)");
    expect(tramo).toContain("pendingProposalRunId: f.pendingProposalRunId,");
    expect(tramo).toContain('pendingProposal: { path: ["formato"], equals: FORMATO_BORRADOR },');
  });
});

describe("scripts de inspección — imprimen `origen` y `soloFase`", () => {
  it("el listado y la inspección de un proyecto dicen de dónde viene y si es de una fase", () => {
    /* La edición que la pone en rojo: sacar `soloFase` de la línea del v1 (una propuesta de una fase
       se leería como de todo el cronograma). */
    const listado = leer("scripts/propuestas-abiertas.ts");
    expect(listado).toContain("origen: ${origen}");
    expect(listado).toContain("soloFase: ${soloFase}");
    expect(listado).toContain("b.tareasArmadasPara[b.soloFase]");
    const inspeccion = leer("scripts/inspect-timeline-proposal.ts");
    expect(inspeccion).toContain("origen: ${b.origen}");
    expect(inspeccion).toContain("soloFase: ${soloFase}");
    expect(inspeccion).toContain("origen: ${origenDePropuesta(");
  });
});
