/**
 * lib/jobs/time.ts
 *
 * Partes de fecha/hora en zona Costa Rica para las ventanas de los jobs del
 * scheduler. Extraído de lib/marketing/cron.ts (que lo re-exporta) al
 * generalizar el cron a un registry de jobs.
 */
const CR_TIMEZONE = "America/Costa_Rica";

export interface CrDateParts {
  weekday: string; // "Mon" | "Tue" | ... (en-CA short)
  hour: number; // 0-23 hora CR
  dateKey: string; // "YYYY-MM-DD" (día CR) — clave de los claims diarios
}

/** Partes de fecha/hora en zona CR, sin dependencias nuevas. */
export function crDateParts(now: Date): CrDateParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CR_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    weekday: parts.weekday ?? "",
    hour: Number(parts.hour ?? "0") % 24, // hourCycle puede devolver "24" para medianoche
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export const WEEKDAYS_MON_FRI = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
