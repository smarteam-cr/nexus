/**
 * lib/clients/meeting-dates.ts
 *
 * Calcula, por cliente, la fecha de la última reunión donde participó alguien
 * del equipo de Ventas y la última donde participó alguien de CSE.
 *
 * PERF: igual que lib/clients/last-interaction.ts — usa el match materializado
 * `FirefliesSession.resolvedClientId` (índice [resolvedClientId, date desc]) en
 * vez de cargar TODAS las sesiones (~16k) y re-matchear con categorizeSession
 * en JS. Solo se transfieren las sesiones ya vinculadas a los clientes pedidos.
 *
 * ── C-11 (2026-09-04): DOS FECHAS POR CLIENTE, NO EL HISTORIAL ENTERO ─────────
 * Hasta hoy traía TODAS las sesiones pasadas de los clientes pedidos —con sus participantes—
 * para quedarse con dos fechas por cliente: /clients pagaba el historial completo en cada
 * carga y lo plegaba en JS. Ahora lo decide Postgres con `DISTINCT ON` sobre el mismo índice,
 * y a JS llega UNA fila por (cliente, rol). El plegado en JS sigue acá, PURO y sin uso en
 * producción, como REFERENCIA: `meeting-dates.int.test.ts` compara los dos sobre filas de
 * verdad, y `meeting-dates.test.ts` sobre un fixture.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { classifyTeamEmailsByArea, type TeamMemberLite } from "@/lib/sessions/areas";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface MeetingDates {
  /** Última sesión donde participó un TeamMember de Ventas. */
  sales?: Date;
  /** Última sesión donde participó un TeamMember de CSE. */
  cse?: Date;
}

export type Rol = "sales" | "cse";

/** Una sesión como la leía la versión anterior (para el plegado de referencia). */
export type FilaDeSesion = { resolvedClientId: string | null; date: Date; participants: string[] };

/** Lo que devuelve Postgres: una fila por (cliente, rol), la más reciente. */
export type FilaDeFecha = { clientId: string; rol: Rol; date: Date };

// ── Puro ──────────────────────────────────────────────────────────────────────

/**
 * La versión de referencia: el plegado en JS sobre las sesiones ORDENADAS POR FECHA DESC —
 * el primer hit por (cliente, rol) ya es la fecha más reciente. Es exactamente lo que hacía
 * `computeLastMeetingDates` antes de C-11; la consulta de abajo tiene que dar lo mismo.
 */
export function plegarUltimasFechas(
  filas: FilaDeSesion[],
  salesEmails: Set<string>,
  cseEmails: Set<string>,
): Map<string, MeetingDates> {
  const result = new Map<string, MeetingDates>();
  for (const s of filas) {
    const clientId = s.resolvedClientId;
    if (!clientId) continue;
    const entry = result.get(clientId) ?? {};
    // Saltar si ya tenemos ambas fechas para este cliente
    if (entry.sales !== undefined && entry.cse !== undefined) continue;
    const emails = s.participants.map((e) => e.toLowerCase());
    let changed = false;
    if (entry.sales === undefined && emails.some((e) => salesEmails.has(e))) {
      entry.sales = s.date;
      changed = true;
    }
    if (entry.cse === undefined && emails.some((e) => cseEmails.has(e))) {
      entry.cse = s.date;
      changed = true;
    }
    if (changed) result.set(clientId, entry);
  }
  return result;
}

/** De las filas de Postgres al mapa. Con `DISTINCT ON` llega una por (cliente, rol); si llegaran más, gana la primera. */
export function armarMapa(filas: FilaDeFecha[]): Map<string, MeetingDates> {
  const result = new Map<string, MeetingDates>();
  for (const f of filas) {
    const entry = result.get(f.clientId) ?? {};
    if (f.rol === "sales" && entry.sales === undefined) entry.sales = f.date;
    if (f.rol === "cse" && entry.cse === undefined) entry.cse = f.date;
    result.set(f.clientId, entry);
  }
  return result;
}

// ── La consulta ───────────────────────────────────────────────────────────────

/**
 * Una rama por rol: las sesiones pasadas de los clientes pedidos donde algún participante
 * (en minúscula, como comparaba el plegado) es de ese equipo. Todo parametrizado con
 * `Prisma.join`: ids y correos nunca se interpolan como texto.
 */
function ramaDe(rol: Rol, emails: string[], clientIds: string[], ahora: Date): Prisma.Sql {
  return Prisma.sql`
    SELECT s."resolvedClientId" AS "clientId", ${rol}::text AS rol, s.date
    FROM "FirefliesSession" s
    WHERE s."resolvedClientId" IN (${Prisma.join(clientIds)})
      AND s.date <= ${ahora}
      AND EXISTS (SELECT 1 FROM unnest(s.participants) AS p WHERE lower(p) IN (${Prisma.join(emails)}))`;
}

// ── Función principal ──────────────────────────────────────────────────────────

/**
 * Devuelve un Map clientId → { sales?, cse? }: la reunión más reciente ya ocurrida con
 * alguien de cada equipo. Postgres decide con `DISTINCT ON (cliente, rol) … ORDER BY date DESC`
 * sobre el índice [resolvedClientId, date desc]; acá solo se arma el mapa.
 */
export async function computeLastMeetingDates(params: {
  clientIds: string[];
  teamMembers: TeamMemberLite[];
}): Promise<Map<string, MeetingDates>> {
  const { clientIds, teamMembers } = params;
  if (clientIds.length === 0) return new Map();

  // Clasificación por ÁREA (eje de análisis), no por permiso — ver lib/sessions/areas.ts.
  const { salesEmails, cseEmails } = classifyTeamEmailsByArea(teamMembers);
  if (salesEmails.size === 0 && cseEmails.size === 0) return new Map();

  const ahora = new Date();
  const ramas: Prisma.Sql[] = [];
  if (salesEmails.size > 0) ramas.push(ramaDe("sales", [...salesEmails].map((e) => e.toLowerCase()), clientIds, ahora));
  if (cseEmails.size > 0) ramas.push(ramaDe("cse", [...cseEmails].map((e) => e.toLowerCase()), clientIds, ahora));

  const filas = await prisma.$queryRaw<FilaDeFecha[]>(Prisma.sql`
    SELECT DISTINCT ON ("clientId", rol) "clientId", rol, date
    FROM (${Prisma.join(ramas, " UNION ALL ")}) AS x
    ORDER BY "clientId", rol, date DESC`);

  return armarMapa(filas);
}
