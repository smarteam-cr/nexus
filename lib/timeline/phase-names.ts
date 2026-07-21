/**
 * lib/timeline/phase-names.ts
 *
 * Detección de la fase técnica dedicada del cronograma ("Desarrollo / Integración",
 * regla #7 del handoff — ver scripts/seed-handoff-agent.ts). Es señal por NOMBRE de
 * fase, DISTINTA de `hasTechnical` del techRule (que va por TAG del proyecto:
 * custom_dev / insider_one). No se fusionan: una es "el proyecto lleva desarrollo"
 * (tag), la otra es "esta fase concreta es la técnica" (nombre).
 *
 * Match tolerante (trim + lowercase + acento-insensible en "integraci"): cubre
 * "Desarrollo / Integración", "Desarrollo/Integracion", "Integración", "Desarrollo".
 * Si el CSE renombra la fase fuera de este patrón, deja de contar como técnica y el
 * detalle degrada a tareas funcionales genéricas (sin romper) — supuesto documentado.
 */
export function isDevIntegrationPhaseName(name: string | null | undefined): boolean {
  if (!name) return false;
  return /desarrollo|integraci/i.test(name);
}
