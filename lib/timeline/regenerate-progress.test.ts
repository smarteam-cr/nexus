import { describe, it, expect } from "vitest";
import { buildProgressUserMessage } from "./regenerate-progress";
import { bloqueDeInstruccionesDeDoc } from "@/lib/business-cases/section-briefs";

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
