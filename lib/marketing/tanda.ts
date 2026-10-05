/**
 * lib/marketing/tanda.ts — cuándo corre la próxima tanda automática, para decirlo en pantalla.
 *
 * La regla es la del cron (lib/marketing/cron.ts): los viernes desde las 6:00, hora de Costa Rica, una vez por día
 * (`MarketingSettings.lastCronDateKey`). Acá solo se calcula la fecha que se muestra («Próxima tanda: vie 9 oct,
 * 6:00»); quien decide si dispara sigue siendo el cron. Puro y client-safe (la fecha CR la da `crDateParts`).
 */
import { crDateParts } from "@/lib/jobs/time";

const DIAS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Suma días a un "YYYY-MM-DD" sin pasar por la zona horaria del servidor. */
function sumarDias(dateKey: string, dias: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

/** «25 sep» para un "YYYY-MM-DD". */
export function diaYMes(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${d} ${MES_CORTO[m - 1]}`;
}

/** «25 sep» para un instante, en el día de Costa Rica (una publicación de las 23:00 del 24 no sale «25»). */
export function diaYMesCr(fecha: Date | string): string {
  return diaYMes(crDateParts(new Date(fecha)).dateKey);
}

/** «vie 9 oct» para un "YYYY-MM-DD". */
export function fechaCorta(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DIA_CORTO[dia]} ${d} ${MES_CORTO[m - 1]}`;
}

export interface ProximaTanda {
  /** Día CR de la próxima tanda, "YYYY-MM-DD". */
  dateKey: string;
  /** «vie 9 oct, 6:00». */
  etiqueta: string;
  /** La tanda de hoy ya pasó la hora y todavía no corrió (el cron la toma en el próximo minuto). */
  pendienteHoy: boolean;
}

/**
 * El viernes que viene. Si hoy es viernes y la tanda de hoy no corrió, es hoy (antes de las 6:00, o después si el
 * servidor estaba caído: el cron la recupera mientras siga siendo viernes).
 */
export function proximaTanda(ahora: Date, ultimoDisparo: string | null): ProximaTanda {
  const { weekday, hour, dateKey } = crDateParts(ahora);
  const hoy = DIAS.indexOf(weekday);
  const esViernes = weekday === "Fri";
  const yaCorrioHoy = ultimoDisparo === dateKey;
  const dias = esViernes && !yaCorrioHoy ? 0 : (5 - hoy + 7) % 7 || 7;
  const destino = sumarDias(dateKey, dias);
  return {
    dateKey: destino,
    etiqueta: `${fechaCorta(destino)}, 6:00`,
    pendienteHoy: esViernes && !yaCorrioHoy && hour >= 6,
  };
}
