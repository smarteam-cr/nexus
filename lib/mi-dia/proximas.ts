/**
 * lib/mi-dia/proximas.ts — las próximas reuniones de UNA cuenta, juntando los calendarios de la gente de Smarteam que
 * la trabaja y las reuniones planeadas en Tareas (fase 2.2 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17).
 * PURO y client-safe: lo arma lib/mi-dia/proximas-server.ts para la ficha del cliente.
 *
 * Un evento cuenta para la cuenta solo si es de UNA empresa (`cuentaDelEvento`, el resolvedor único de
 * lib/mi-dia/agenda.ts): el mismo evento visto en dos calendarios cuenta una vez y suma a quienes van. Una reunión
 * planeada en Tareas que ya está en un calendario (empieza a menos de una hora) no se repite: gana la del calendario.
 */
import { cuentaDelEvento, type ReunionDeHoy } from "./agenda";
import { DIAS_PARA_LA_REUNION } from "./constantes";

export interface ProximaReunionDeLaCuenta {
  id: string;
  titulo: string;
  /** ISO UTC. */
  inicio: string;
  fin: string | null;
  /** Del calendario de alguien de Smarteam, o planeada en Tareas (todavía sin el evento leído). */
  fuente: "calendario" | "tarea";
  /** Los correos de Smarteam que van, en orden. */
  deSmarteam: string[];
  /** Cuántos invitados de afuera. */
  externos: number;
  /** Si es una reunión planeada: su T-. */
  numero: number | null;
}

/** Una reunión planeada en Tareas (`clase = "reunion"`). */
export interface ReunionPlaneadaDeLaCuenta {
  id: string;
  numero: number;
  titulo: string;
  /** ISO UTC. */
  inicio: string;
  responsableEmail: string | null;
  invitados: readonly string[];
}

const DIA_MS = 86_400_000;
const HORA_MS = 3_600_000;
const dominioDe = (email: string) => email.split("@")[1]?.trim().toLowerCase() ?? "";

/**
 * Las próximas reuniones de `clientId` en los próximos 8 días (también la que está en curso), por hora. `calendarios`
 * es lo leído de cada persona (null = no se pudo leer; esa persona va a `sinLeer`).
 */
export function proximasDeLaCuenta(
  clientId: string,
  calendarios: readonly { email: string; reuniones: readonly ReunionDeHoy[] | null }[],
  planeadas: readonly ReunionPlaneadaDeLaCuenta[],
  o: { ahora: Date; internos: ReadonlySet<string> },
): { reuniones: ProximaReunionDeLaCuenta[]; sinLeer: string[] } {
  const desde = o.ahora.getTime();
  const hasta = desde + DIAS_PARA_LA_REUNION * DIA_MS;
  const porId = new Map<string, ProximaReunionDeLaCuenta>();
  const sinLeer: string[] = [];
  for (const c of calendarios) {
    if (!c.reuniones) {
      sinLeer.push(c.email);
      continue;
    }
    for (const r of c.reuniones) {
      if (cuentaDelEvento(r) !== clientId) continue;
      const ini = Date.parse(r.inicio);
      const fin = r.fin ? Date.parse(r.fin) : ini + 30 * 60_000;
      if (!(fin > desde && ini <= hasta)) continue;
      const ya = porId.get(r.id);
      const gente = [...new Set([...(ya?.deSmarteam ?? []), ...r.deSmarteam, c.email.toLowerCase()])];
      porId.set(r.id, { id: r.id, titulo: r.titulo, inicio: r.inicio, fin: r.fin, fuente: "calendario", deSmarteam: gente, externos: Math.max(ya?.externos ?? 0, r.externos), numero: null });
    }
  }
  const delCalendario = [...porId.values()];
  for (const p of planeadas) {
    const ini = Date.parse(p.inicio);
    if (!Number.isFinite(ini) || ini + HORA_MS <= desde || ini > hasta) continue;
    const gente = [...new Set([...(p.responsableEmail ? [p.responsableEmail.toLowerCase()] : []), ...p.invitados.map((x) => x.toLowerCase()).filter((x) => o.internos.has(dominioDe(x)))])];
    const misma = delCalendario.find((r) => Math.abs(Date.parse(r.inicio) - ini) < HORA_MS);
    if (misma) {
      misma.deSmarteam = [...new Set([...misma.deSmarteam, ...gente])];
      continue;
    }
    porId.set(`tarea:${p.id}`, {
      id: `tarea:${p.id}`,
      titulo: p.titulo,
      inicio: p.inicio,
      fin: null,
      fuente: "tarea",
      deSmarteam: gente,
      externos: p.invitados.filter((x) => !o.internos.has(dominioDe(x))).length,
      numero: p.numero,
    });
  }
  return { reuniones: [...porId.values()].sort((a, b) => a.inicio.localeCompare(b.inicio)), sinLeer };
}
