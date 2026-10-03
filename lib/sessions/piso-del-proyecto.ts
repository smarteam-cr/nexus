/**
 * lib/sessions/piso-del-proyecto.ts — DESDE CUÁNDO una reunión puede ser de este proyecto. PURO.
 *
 * ── EL CASO QUE LO MOTIVÓ (medido el 2026-10-02) ─────────────────────────────────────────────
 * «CAV - SHP» nació el 25-ago-2026. Su cliente ya había tenido otro proyecto, finalizado en
 * febrero. El alta le colgó las 57 reuniones del cliente —32 de 2025— y desde entonces TODO lo que
 * lee la membresía las tomaba como propias: el handoff escribió una integración SAP que no se
 * vendió, el kickoff salió con una fecha de 2025 y el diagnóstico con cinco bloques de SAP. Pasa en
 * 11 de los 79 proyectos creados desde junio.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────────────────────
 * Si el cliente YA TUVO otro proyecto antes que éste, una reunión anterior a «inicio − 90 días» es
 * de ese otro proyecto y no alimenta a éste… salvo que una PERSONA la haya agregado a mano
 * (`SessionProject.source = "manual"`): ahí alguien decidió que sí.
 *
 * El primer proyecto de un cliente NO tiene piso: su historia entera es suya (caso «kamalio»,
 * reuniones de 2025 y alta de agosto 2026 — ver `lib/projects/alta-runner.ts`).
 *
 * «Inicio» es `hubspotCreatedAt ?? createdAt`, la misma referencia que usa el kickoff
 * (`lib/sessions/project-sessions.ts`): un proyecto importado a Nexus tarde conserva su fecha real.
 */

/** Cuánto antes del inicio una reunión todavía puede ser de la venta de ESTE proyecto. */
export const DIAS_DE_HISTORIA_PREVIA = 90;
const DIA_MS = 24 * 60 * 60 * 1000;

/** El piso (epoch ms), o null si el proyecto no tiene piso (primer proyecto del cliente). */
export function pisoDelProyecto(
  proyecto: { createdAt: Date; hubspotCreatedAt: Date | null },
  tuvoProyectoAnterior: boolean,
): number | null {
  if (!tuvoProyectoAnterior) return null;
  const inicio = (proyecto.hubspotCreatedAt ?? proyecto.createdAt).getTime();
  return inicio - DIAS_DE_HISTORIA_PREVIA * DIA_MS;
}

/** ¿Esta reunión queda fuera por ser de antes del piso? Las agregadas a mano nunca quedan fuera. */
export function quedaAntesDelPiso(fechaMs: number, piso: number | null, source: string | null | undefined): boolean {
  if (piso === null) return false;
  if (source === "manual") return false;
  return fechaMs < piso;
}
