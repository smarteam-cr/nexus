import { describe, it, expect } from "vitest";
import { buildProgressUserMessage } from "./regenerate-progress";
import { bloqueDeInstruccionesDeDoc } from "@/lib/business-cases/section-briefs";
import { bloqueDeOperativa } from "@/lib/cs/hubspot-ops-block";

/**
 * lib/timeline/regenerate-progress.test.ts
 *
 * Cubre SOLO `buildProgressUserMessage` — la parte pura del agente de avance
 * (Tanda N). El resto de `regenerateTimelineProgress` es DB+Claude-coupled y
 * queda sin test directo, mismo criterio que `patchBaselinePhaseTasks`.
 *
 * El caso "con brief" es el que importa: confirma que insertar el bloque de
 * instrucciones del CSE no deja una línea en blanco de más frente al patrón
 * ya usado por `renderDetalleDeCronograma` (concatenación directa, no un ítem
 * más del array que luego se .join("\n")).
 */

const base = {
  companyName: "Acme",
  industry: null as string | null,
  serviceType: null as string | null,
  stageLabel: null as string | null,
  /* Vacío en el fixture base A PROPÓSITO: el golden de abajo es byte-a-byte, y que siga pasando
     sin tocarlo es la prueba de que un proyecto SIN estado cargado en HubSpot recibe exactamente
     el mismo prompt que antes de que existiera este bloque. Lo nuevo suma; no reescribe. */
  operativaBlock: "",
  sessionsBlock: "",
  handoffCtx: "",
  timelineCtx: "CRONOGRAMA",
};

describe("buildProgressUserMessage", () => {
  it("sin brief: arranca directo en Empresa (comportamiento viejo intacto)", () => {
    const msg = buildProgressUserMessage({ ...base, instrucciones: "" });
    expect(msg.startsWith("Empresa: Acme")).toBe(true);
  });

  it("con brief: una sola línea en blanco entre el bloque y Empresa (no dos)", () => {
    const bloque = bloqueDeInstruccionesDeDoc("Las fases de QA van al final");
    const msg = buildProgressUserMessage({ ...base, instrucciones: bloque });
    expect(msg).toBe(
      `=== INSTRUCCIONES DEL CSE PARA ESTA PIEZA (reglas duras — cumplilas SIEMPRE) ===\n` +
        `Las fases de QA van al final\n\n` +
        `Empresa: Acme\n\n` +
        `=== ETAPA ACTUAL EN HUBSPOT (ANCLA #1 — manda la posición) ===\n` +
        `(sin etapa de HubSpot disponible — inferí el avance solo desde las sesiones y el handoff)\n\n` +
        `=== SESIONES PASADAS DEL PROYECTO (detallan qué se hizo) ===\n` +
        `(sin sesiones pasadas registradas)\n\n` +
        `=== HANDOFF CURADO (alcance del proyecto) ===\n` +
        `(sin handoff confirmado)\n\n` +
        `CRONOGRAMA\n\n` +
        `Detectá el avance real siguiendo tus instrucciones: ubicá el currentPhaseId, marcá las fases completadas y las tareas hechas. Usá ids EXACTOS. No re-propongas lo que ya está DONE. Sé conservador.\n` +
        `La etapa de HubSpot (ANCLA #1) manda la POSICIÓN cuando no hay una instrucción explícita del CSE sobre una fase puntual — pero si arriba, en las instrucciones del CSE, dice explícitamente que una fase concreta está resuelta o casi resuelta, proponela como completada (fase y/o sus tareas) AUNQUE esa fase venga después del currentPhaseId en el orden del plan. El orden del cronograma es una expectativa inicial: no siempre coincide con el orden real en que se hizo el trabajo, y una instrucción explícita sobre una fase puntual pesa más que la posición.\n` +
        `Además, si el transcript RESPALDA una DESVIACIÓN FECHADA del plan (una fecha se corrió = ATRASO con weeksImpact obligatorio; o se comprometió una fecha nueva = COMPROMISO), proponela en \`particularidades\` con su party, occurredAt (fecha ISO de la sesión) y sourceQuote (fragmento de respaldo). NO son particularidades los pendientes/insumos del cliente ('se necesita X', 'pendiente entrega de Y') — esos son tareas party=CLIENTE, no los emitas acá. Si no hay una desviación fechada clara, dejá el array vacío.`,
    );
  });

  it("una instrucción explícita sobre una fase puntual pesa más que el orden del plan", () => {
    const msg = buildProgressUserMessage({ ...base, instrucciones: "" });
    expect(msg).toContain(
      "una instrucción explícita sobre una fase puntual pesa más que la posición",
    );
  });

  it("con industria y servicio: se suman como líneas propias", () => {
    const msg = buildProgressUserMessage({
      ...base,
      instrucciones: "",
      industry: "Retail",
      serviceType: "Implementación",
    });
    expect(msg).toContain("Empresa: Acme\nIndustria: Retail\nServicio: Implementación\n");
  });
});

describe("el agente de avance ve el estado que el equipo carga en HubSpot", () => {
  /* Hasta el 2026-08-16 NO lo veía: proponía avance sobre un proyecto bloqueado sin saber que
     estaba bloqueado, y "no se hizo nada" quedaba indistinguible de "está trabado esperando al
     cliente". Las cinco señales estaban espejadas hace meses y solo las leían los vigilantes. */

  it("el bloque entra DESPUÉS de la etapa y ANTES de las sesiones", () => {
    /* El orden es la mitad del sentido: la etapa dice DÓNDE está el proyecto, el estado dice
       CÓMO está. Si el bloque cayera después de las sesiones, el modelo ya habría sacado su
       conclusión sobre el avance antes de enterarse de que hay un bloqueo. */
    const msg = buildProgressUserMessage({
      ...base,
      instrucciones: "",
      operativaBlock: bloqueDeOperativa({
        hubspotStatus: "blocked",
        hubspotPriority: "high",
        hubspotBlockReason: "Cliente no responde",
        hubspotBlockDetail: "Esperando los accesos al portal desde el 3 de julio",
        hubspotAdoptionState: "Bajo",
      }),
    });
    const posEtapa = msg.indexOf("=== ETAPA ACTUAL EN HUBSPOT");
    const posEstado = msg.indexOf("=== ESTADO DEL PROYECTO EN HUBSPOT");
    const posSesiones = msg.indexOf("=== SESIONES PASADAS DEL PROYECTO");
    expect(posEstado, "el bloque de estado no llegó al prompt").toBeGreaterThan(-1);
    expect(posEtapa).toBeLessThan(posEstado);
    expect(posEstado).toBeLessThan(posSesiones);
  });

  it("traduce el crudo de HubSpot a castellano", () => {
    /* `blocked` / `at_risk` / `on_hold` son los valores que guarda HubSpot. Mandárselos crudos al
       modelo tiene dos costos: puede escribirle "at_risk" al CSE en el documento, y pierde el
       matiz entre "en riesgo" (todavía no se corrió) y "retrasado" (ya se corrió), que en esta
       tabla son dos cosas distintas y el equipo las usa distinto. */
    const bloque = bloqueDeOperativa({
      hubspotStatus: "at_risk",
      hubspotPriority: "high",
      hubspotBlockReason: null,
      hubspotBlockDetail: null,
      hubspotAdoptionState: null,
    });
    expect(bloque).toContain("En riesgo");
    expect(bloque).toContain("Alta");
    expect(bloque, "se coló el valor crudo de HubSpot").not.toContain("at_risk");
  });

  it("sin nada cargado no ensucia el prompt con «sin valor» repetido", () => {
    /* Solo 43 de los 67 proyectos espejados tienen estado. Un bloque de puros huecos le enseña al
       modelo que esta sección no dice nada, y esa lección se la lleva también a los que sí. */
    const vacio = bloqueDeOperativa({
      hubspotStatus: null,
      hubspotPriority: null,
      hubspotBlockReason: null,
      hubspotBlockDetail: null,
      hubspotAdoptionState: null,
    });
    expect(vacio).toBe("");
    const msg = buildProgressUserMessage({ ...base, instrucciones: "", operativaBlock: vacio });
    expect(msg).not.toContain("=== ESTADO DEL PROYECTO EN HUBSPOT");
  });

  it("el detalle escrito a mano se corta: es texto libre sin límite", () => {
    const largo = "x".repeat(900);
    const bloque = bloqueDeOperativa({
      hubspotStatus: "blocked",
      hubspotPriority: null,
      hubspotBlockReason: "Atraso por cliente",
      hubspotBlockDetail: largo,
      hubspotAdoptionState: null,
    });
    expect(bloque.length).toBeLessThan(600);
  });
});
