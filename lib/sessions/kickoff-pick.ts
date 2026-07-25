/**
 * lib/sessions/kickoff-pick.ts
 *
 * Selección PURA de la fecha de kickoff de un proyecto (sin Prisma — testeable en
 * el proyecto vitest "unit"). La consume `getKickoffSessionDate`
 * (lib/sessions/project-sessions.ts), fuente de verdad de la heurística "kickoff".
 */
import { kickoffTitleFilters } from "@/lib/sessions/session-type";

/**
 * Variantes de título que identifican la sesión de Kick Off.
 *
 * Salen del vocabulario único de tipos de reunión (lib/sessions/session-type.ts), donde
 * cada palabra declara si además genera filtro de base. ⚠ Esta lista la consume también
 * el motor de etapas, que está congelado por decisión: ampliarla movería la etapa
 * inferida de toda la cartera. Hay un candado en session-type.test.ts que falla si
 * cambia.
 */
export const KICKOFF_TITLE_FILTERS = kickoffTitleFilters();

/** Tolerancia hacia atrás al preferir kickoffs posteriores a la creación del proyecto:
 *  un kickoff agendado un par de días ANTES de que el Service exista en HubSpot sigue
 *  siendo "de este proyecto". */
const KICKOFF_REF_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Entre candidatas tituladas kickoff gana la más CERCANA a la creación del proyecto
 * (`ref`), prefiriendo las posteriores a (ref − 3d). Antes se tomaba la más ANTIGUA a
 * secas — en clientes recurrentes eso elegía el kickoff de un proyecto viejo (caso RC:
 * 3-jun en vez del Kick Off real del 10-jul) y el cronograma nacía con semanas de
 * "atraso" falso.
 */
export function pickKickoffSessionDate(dates: Date[], ref: Date): Date | null {
  if (dates.length === 0) return null;
  const after = dates.filter((d) => d.getTime() >= ref.getTime() - KICKOFF_REF_GRACE_MS);
  const pool = after.length > 0 ? after : dates;
  return pool.reduce((best, d) =>
    Math.abs(d.getTime() - ref.getTime()) < Math.abs(best.getTime() - ref.getTime()) ? d : best,
  );
}
