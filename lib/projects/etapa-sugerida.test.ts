/**
 * La etapa que una reunión sugiere mover en HubSpot (2026-10-07): si sigue en pie, qué lee de la
 * reunión y qué se le exige a la respuesta del modelo antes de dejar una sugerencia.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePipeline } from "./kind";
import {
  escribirMotivoDeEtapa,
  etapaEnHubspot,
  leerMotivoDeEtapa,
  reemplazaA,
  sugerenciaVigente,
} from "./etapa-sugerida";
import { citaEstaEnElTexto, etapasQueSePuedenDetectar, leerRespuestaDeEtapa, pedidoDeEtapa } from "./etapa-desde-reunion";

const CS = resolvePipeline("826270797")!;
const HANDOFF = "1225193551";
const EXPLORACION = "1410223916";
const DIAGNOSTICO = "1410223917";
const PLANIFICACION = "1410223918";
const CONFIGURACION = "1225193541";
const FINALIZADO = "1225193543";
const BLOQUEADO = "1225193545";

const motivo = escribirMotivoDeEtapa({
  motivo: "Ya se presentó el diagnóstico.",
  cita: "les presentamos el diagnóstico completo",
  reunion: { id: "s1", titulo: "Revisión", fecha: "2026-10-03T15:00:00.000Z" },
});
const guardada = (stageId: string | null) => ({ stageId, motivo, at: "2026-10-03T16:00:00.000Z" });

describe("el motivo guardado", () => {
  it("guarda la cita y la reunión, y las devuelve", () => {
    expect(leerMotivoDeEtapa(motivo)).toEqual({
      motivo: "Ya se presentó el diagnóstico.",
      cita: "les presentamos el diagnóstico completo",
      reunion: { id: "s1", titulo: "Revisión", fecha: "2026-10-03T15:00:00.000Z" },
    });
  });
  it("un texto plano se lee como motivo solo, y vacío es nada", () => {
    expect(leerMotivoDeEtapa("Lo dijo el cliente")).toEqual({ motivo: "Lo dijo el cliente", cita: null, reunion: null });
    expect(leerMotivoDeEtapa("  ")).toBeNull();
    expect(leerMotivoDeEtapa(null)).toBeNull();
  });
});

describe("¿la sugerencia sigue en pie?", () => {
  it("sí, si la etapa de hoy está antes de la sugerida", () => {
    const s = sugerenciaVigente(CS, EXPLORACION, guardada(DIAGNOSTICO));
    expect(s).toMatchObject({ stageId: DIAGNOSTICO, hasta: "Diagnóstico", desde: "Exploración", salto: 1 });
    expect(s?.cita).toBe("les presentamos el diagnóstico completo");
    expect(s?.reunion?.titulo).toBe("Revisión");
  });
  it("se apaga sola si alguien ya la movió en HubSpot (a esa etapa o más allá)", () => {
    expect(sugerenciaVigente(CS, DIAGNOSTICO, guardada(DIAGNOSTICO))).toBeNull();
    expect(sugerenciaVigente(CS, PLANIFICACION, guardada(DIAGNOSTICO))).toBeNull();
  });
  it("nunca a una etapa de cierre, ni desde una de cierre, ni con la de hoy fuera de la línea", () => {
    expect(sugerenciaVigente(CS, EXPLORACION, guardada(FINALIZADO))).toBeNull();
    expect(sugerenciaVigente(CS, FINALIZADO, guardada(DIAGNOSTICO))).toBeNull();
    expect(sugerenciaVigente(CS, BLOQUEADO, guardada(DIAGNOSTICO))).toBeNull();
  });
  it("un id de otro tablero no es una sugerencia", () => {
    expect(sugerenciaVigente(CS, EXPLORACION, guardada("1409932561"))).toBeNull();
    expect(sugerenciaVigente(null, EXPLORACION, guardada(DIAGNOSTICO))).toBeNull();
  });
});

describe("una sugerencia nueva reemplaza a la vieja solo si va más lejos", () => {
  it("más lejos sí; igual o más atrás no", () => {
    expect(reemplazaA(CS, null, DIAGNOSTICO)).toBe(true);
    expect(reemplazaA(CS, DIAGNOSTICO, CONFIGURACION)).toBe(true);
    expect(reemplazaA(CS, DIAGNOSTICO, DIAGNOSTICO)).toBe(false);
    expect(reemplazaA(CS, CONFIGURACION, DIAGNOSTICO)).toBe(false);
  });
});

describe("lo que ve la encuesta", () => {
  const base = { def: CS, hubspotServiceId: "123", actualStageId: EXPLORACION, actualLabel: "Exploración", guardada: guardada(DIAGNOSTICO) };
  it("las opciones son las etapas movibles en orden, sin Finalizado", () => {
    const e = etapaEnHubspot(base)!;
    expect(e.opciones[0]).toEqual({ id: HANDOFF, label: "Handoff" });
    expect(e.opciones.some((o) => o.id === FINALIZADO)).toBe(false);
    expect(e.sugerencia?.stageId).toBe(DIAGNOSTICO);
    expect(e.bloqueo).toBeNull();
  });
  it("sin registro en HubSpot, en una etapa de cierre o con un tablero desconocido, dice por qué no", () => {
    expect(etapaEnHubspot({ ...base, hubspotServiceId: null })?.bloqueo).toContain("todavía no existe en HubSpot");
    expect(etapaEnHubspot({ ...base, actualStageId: FINALIZADO })?.bloqueo).toContain("etapa de cierre");
    expect(etapaEnHubspot({ ...base, def: null })?.bloqueo).toContain("no reconoce el tablero");
    expect(etapaEnHubspot({ ...base, actualStageId: FINALIZADO })?.sugerencia).toBeNull();
  });
  it("sin tablero ni registro no hay encuesta", () => {
    expect(etapaEnHubspot({ ...base, def: null, hubspotServiceId: null })).toBeNull();
  });
});

describe("lo que se le pregunta a la IA sobre la reunión", () => {
  it("solo etapas hacia adelante, nunca de cierre; nada desde Bloqueado o Finalizado", () => {
    const ids = etapasQueSePuedenDetectar(CS, EXPLORACION).map((s) => s.id);
    expect(ids[0]).toBe(DIAGNOSTICO);
    expect(ids).not.toContain(HANDOFF);
    expect(ids).not.toContain(EXPLORACION);
    expect(ids).not.toContain(FINALIZADO);
    expect(etapasQueSePuedenDetectar(CS, BLOQUEADO)).toEqual([]);
    expect(etapasQueSePuedenDetectar(CS, FINALIZADO)).toEqual([]);
  });
  it("sin etapas a las que avanzar no hay pedido", () => {
    expect(
      pedidoDeEtapa({ proyecto: "CRM", cliente: "Wherex", def: CS, actualStageId: BLOQUEADO, reunion: { titulo: "x", fecha: "2026-10-03", texto: "hola" } }),
    ).toBeNull();
  });
  it("el pedido trae la etapa de hoy, las opciones con lo que significan y la reunión", () => {
    const p = pedidoDeEtapa({
      proyecto: "CRM",
      cliente: "Wherex",
      def: CS,
      actualStageId: EXPLORACION,
      reunion: { titulo: "Revisión", fecha: "2026-10-03T15:00:00.000Z", texto: "les presentamos el diagnóstico completo" },
    })!;
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("Etapa en HubSpot hoy: Exploración");
    expect(cuerpo).toContain(`${DIAGNOSTICO} · Diagnóstico`);
    expect(cuerpo).not.toContain(`${FINALIZADO} ·`);
    expect(cuerpo).toContain("les presentamos el diagnóstico completo");
    expect(p.tool_choice).toEqual({ type: "tool", name: "decidir_etapa" });
  });
});

describe("lo que se exige a la respuesta del modelo", () => {
  const texto = "Carlos: Hoy les presentamos el diagnóstico completo y quedaron de acuerdo con las prioridades.";
  const respuesta = (input: Record<string, unknown>) => ({
    content: [{ type: "tool_use" as const, id: "t", name: "decidir_etapa", input, caller: undefined }],
  });
  const ctx = { def: CS, actualStageId: EXPLORACION, texto };

  it("una cita copiada de la reunión pasa (sin importar mayúsculas, tildes ni comillas)", () => {
    expect(citaEstaEnElTexto("«les presentamos el diagnostico completo»", texto)).toBe(true);
    const r = leerRespuestaDeEtapa(
      respuesta({ mover: true, etapa: DIAGNOSTICO, cita: "les presentamos el diagnóstico completo", motivo: "Se presentó el diagnóstico." }) as never,
      ctx,
    );
    expect(r).toEqual({ stageId: DIAGNOSTICO, cita: "les presentamos el diagnóstico completo", motivo: "Se presentó el diagnóstico." });
  });
  it("una cita que no está en la reunión, o muy corta, tira la sugerencia", () => {
    expect(leerRespuestaDeEtapa(respuesta({ mover: true, etapa: DIAGNOSTICO, cita: "ya aprobaron el diagnóstico", motivo: "x" }) as never, ctx)).toBeNull();
    expect(leerRespuestaDeEtapa(respuesta({ mover: true, etapa: DIAGNOSTICO, cita: "Hoy", motivo: "x" }) as never, ctx)).toBeNull();
  });
  it("mover false, una etapa hacia atrás o de cierre, o sin motivo, no sugiere nada", () => {
    const cita = "les presentamos el diagnóstico completo";
    expect(leerRespuestaDeEtapa(respuesta({ mover: false }) as never, ctx)).toBeNull();
    expect(leerRespuestaDeEtapa(respuesta({ mover: true, etapa: HANDOFF, cita, motivo: "x" }) as never, ctx)).toBeNull();
    expect(leerRespuestaDeEtapa(respuesta({ mover: true, etapa: FINALIZADO, cita, motivo: "x" }) as never, ctx)).toBeNull();
    expect(leerRespuestaDeEtapa(respuesta({ mover: true, etapa: DIAGNOSTICO, cita, motivo: "  " }) as never, ctx)).toBeNull();
  });
});

describe("la escritura en HubSpot pasa solo por la encuesta", () => {
  const leer = (rel: string) => readFileSync(join(__dirname, "..", "..", rel), "utf8");
  it("el detector deja la sugerencia en la base y nunca escribe en HubSpot", () => {
    const src = leer("lib/projects/etapa-desde-reunion-server.ts");
    expect(src).toContain("etapaPropuestaStageId");
    expect(src).not.toMatch(/actualizarEtapaProyecto|hs_pipeline_stage|apiRequest/);
  });
  it("la encuesta escribe por estado-hubspot con lo que veía la pantalla (`visto`)", () => {
    const src = leer("components/clients/EncuestaDeEtapa.tsx");
    expect(src).toContain("/estado-hubspot");
    expect(src).toContain("visto: { etapaStageId: actualStageId }");
  });
  it("mover la etapa borra la pregunta, sin que la ruta escriba en Project", () => {
    const src = leer("app/api/projects/[projectId]/estado-hubspot/route.ts");
    expect(src).toContain("cerrarSugerenciaDeEtapa(projectId)");
  });
});
