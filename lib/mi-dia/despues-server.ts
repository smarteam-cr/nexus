/**
 * lib/mi-dia/despues-server.ts — «Después de tus reuniones» en «Para ti» (etapa 4d de docs/mi-dia-plan.md): las
 * reuniones con clientes y prospectos en las que estuviste y que terminaron en las últimas 36 horas, con lo que dejaron
 * (la tarjeta «Lo que dejó esta reunión», lib/seguimiento) y el siguiente paso de tu equipo sobre la cuenta. Solo lee.
 *
 * El siguiente paso que se propone sale de lo que se comprometió Smarteam en la reunión: la primera de TUS tareas
 * propuestas de esa reunión. No hay IA nueva: es lo mismo que ya leyó la lectura de la reunión. Desde el 2026-10-16
 * (fase 0.2) el siguiente paso es una tarea: «Usar como siguiente paso» USA esa propuesta (no crea otra).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { cargarTarjeta } from "@/lib/seguimiento/tarjeta-server";
import { loQuePideDecisionEnPalabras } from "@/lib/seguimiento/tarjeta";
import { pasosVigentes } from "@/lib/siguiente-paso/lectura-server";
import { equipoDelRol, type SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";
import type { EquipoDelSiguientePaso } from "@/lib/siguiente-paso/propiedades";

/** Cuántas horas atrás se mira. */
export const HORAS_DESPUES = 36;
/** Cuántas reuniones, como mucho. */
const MAX_REUNIONES = 5;

export interface DespuesDeLaReunion {
  sessionId: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  clientId: string;
  empresa: string;
  esProspecto: boolean;
  /** Lo que se decide en la tarjeta (la minuta, los pedidos, los campos de la ficha y tus tareas). */
  pideDecision: number;
  /** Lo mismo en palabras («3 tareas para ti, la minuta»): la misma redacción que «Lo que importa hoy». */
  queDejo: string[];
  minutaPorRevisar: boolean;
  tareasPropuestas: number;
  pedidos: number;
  huella: string;
  /** «Usar todo» no tiene nada que hacer. */
  usarTodoVacio: boolean;
  equipo: EquipoDelSiguientePaso | null;
  /** El siguiente paso vigente de tu equipo sobre la cuenta. */
  paso: SiguientePasoVisto | null;
  /** Lo que se propone como siguiente paso: la primera de tus tareas propuestas en la reunión (se usa esa tarea). */
  sugerencia: { id: string; version: number; numero: number; titulo: string } | null;
  /** La nota para HubSpot sin decidir (etapa 5): el borrador que armó Nexus con lo acordado. */
  notaParaHubspot: string | null;
}

export async function despuesDeTusReuniones(user: AppUserWithTeamMember, rol: string, ahora = new Date()): Promise<DespuesDeLaReunion[]> {
  const email = user.teamMember?.email ?? user.email;
  if (!email) return [];
  const desde = new Date(ahora.getTime() - HORAS_DESPUES * 3_600_000);
  // Solo las que ya terminaron: una reunión de hace 10 minutos todavía no dejó nada.
  const techo = new Date(ahora.getTime() - 15 * 60_000);
  const reuniones = await prisma.firefliesSession.findMany({
    where: {
      participants: { hasSome: [...new Set([email, email.toLowerCase()])] },
      date: { gte: desde, lte: techo },
      OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }],
    },
    orderBy: { date: "desc" },
    take: MAX_REUNIONES * 2,
    select: { id: true },
  });
  const equipo = equipoDelRol(rol);
  const out: DespuesDeLaReunion[] = [];
  for (const { id } of reuniones) {
    if (out.length >= MAX_REUNIONES) break;
    const r = await despuesDe(id, user, equipo, ahora);
    if (r) out.push(r);
  }
  if (equipo && out.length) {
    const pasos = await pasosVigentes([...new Set(out.map((r) => r.clientId))].map((objetoId) => ({ objeto: "empresa" as const, objetoId }))).catch(() => []);
    for (const r of out) r.paso = pasos.find((p) => p.objetoId === r.clientId && p.equipo === equipo) ?? null;
  }
  return out;
}

/** Lo que dejó UNA reunión (su tarjeta), o null si no es de un cliente o un prospecto, o no se puede ver. */
async function despuesDe(
  sessionId: string,
  user: AppUserWithTeamMember,
  equipo: EquipoDelSiguientePaso | null,
  ahora: Date,
): Promise<DespuesDeLaReunion | null> {
  const t = await cargarTarjeta(sessionId, user, ahora).catch(() => null);
  if (!t || (t.reunion.empresa.kind !== "CLIENTE" && t.reunion.empresa.kind !== "PROSPECTO")) return null;
  const tareasPendientes = t.secciones.tareas.items.filter((x) => x.estado === "pendiente");
  const plan = t.planDeUsarTodo;
  return {
    sessionId: t.reunion.id,
    titulo: t.reunion.titulo,
    fecha: t.reunion.fecha,
    clientId: t.reunion.clientId,
    empresa: t.reunion.empresa.nombre,
    esProspecto: t.esProspecto,
    pideDecision: t.pideDecision,
    queDejo: loQuePideDecisionEnPalabras(t.desglose),
    minutaPorRevisar: !!t.secciones.minuta && t.secciones.minuta.estado === "pendiente",
    tareasPropuestas: tareasPendientes.length,
    pedidos: t.secciones.fueraDeAlcance.items.filter((p) => p.estado === "pendiente").length,
    huella: t.huella,
    usarTodoVacio: !plan.minuta && plan.pedidos.length === 0 && plan.tareas.length === 0 && plan.novedades.length === 0,
    equipo,
    paso: null,
    sugerencia: tareasPendientes[0]
      ? { id: tareasPendientes[0].id, version: tareasPendientes[0].version, numero: tareasPendientes[0].numero, titulo: tareasPendientes[0].titulo }
      : null,
    notaParaHubspot: t.secciones.notaParaHubspot?.estado === "pendiente" ? t.secciones.notaParaHubspot.sugerida : null,
  };
}

/**
 * La sesión de Nexus de un evento del calendario que ya pasó (`gmeet_<evento>` o su `googleEventId`), o null si todavía
 * no llegó. El panel de la agenda la enlaza («Revisar sesión») aunque no deje nada por decidir: ahí se leen la minuta y
 * las tareas. La página tiene su propia regla de acceso.
 */
export async function sesionDelEvento(eventoId: string): Promise<string | null> {
  const fila = await prisma.firefliesSession.findFirst({
    where: { OR: [{ id: `gmeet_${eventoId}` }, { googleEventId: eventoId }] },
    orderBy: { date: "desc" },
    select: { id: true },
  });
  return fila?.id ?? null;
}

/**
 * Lo que dejó la reunión de un evento del calendario (el panel de la agenda del inicio, ficha D): la fila de Meet de
 * ese evento (`gmeet_<evento>` o su `googleEventId`), si ya llegó y es del cliente que se pidió. null = todavía no hay.
 */
export async function loQueDejoElEvento(
  eventoId: string,
  clientId: string,
  user: AppUserWithTeamMember,
  rol: string,
  ahora = new Date(),
): Promise<DespuesDeLaReunion | null> {
  const fila = await prisma.firefliesSession.findFirst({
    where: { OR: [{ id: `gmeet_${eventoId}` }, { googleEventId: eventoId }] },
    orderBy: { date: "desc" },
    select: { id: true, resolvedClientId: true, manualClientId: true },
  });
  if (!fila || (fila.resolvedClientId ?? fila.manualClientId) !== clientId) return null;
  const equipo = equipoDelRol(rol);
  const r = await despuesDe(fila.id, user, equipo, ahora);
  if (r && equipo) {
    const pasos = await pasosVigentes([{ objeto: "empresa" as const, objetoId: r.clientId }]).catch(() => []);
    r.paso = pasos.find((p) => p.equipo === equipo) ?? null;
  }
  return r;
}
