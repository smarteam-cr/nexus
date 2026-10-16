/**
 * lib/mi-dia/despues-server.ts — «Después de tus reuniones» en «Para ti» (etapa 4d de docs/mi-dia-plan.md): las
 * reuniones con clientes y prospectos en las que estuviste y que terminaron en las últimas 36 horas, con lo que dejaron
 * (la tarjeta «Lo que dejó esta reunión», lib/seguimiento) y el siguiente paso de tu equipo sobre la cuenta. Solo lee.
 *
 * El siguiente paso que se propone sale de lo que se comprometió Smarteam en la reunión: la primera de TUS tareas
 * propuestas de esa reunión. No hay IA nueva: es lo mismo que ya leyó la lectura de la reunión.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { cargarTarjeta } from "@/lib/seguimiento/tarjeta-server";
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
  minutaPorRevisar: boolean;
  tareasPropuestas: number;
  pedidos: number;
  huella: string;
  /** «Usar todo» no tiene nada que hacer. */
  usarTodoVacio: boolean;
  equipo: EquipoDelSiguientePaso | null;
  /** El siguiente paso vigente de tu equipo sobre la cuenta. */
  paso: SiguientePasoVisto | null;
  /** Lo que se propone como siguiente paso: la primera de tus tareas propuestas en la reunión. */
  sugerencia: string | null;
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
    const t = await cargarTarjeta(id, user, ahora).catch(() => null);
    if (!t || (t.reunion.empresa.kind !== "CLIENTE" && t.reunion.empresa.kind !== "PROSPECTO")) continue;
    const tareasPendientes = t.secciones.tareas.items.filter((x) => x.estado === "pendiente");
    const plan = t.planDeUsarTodo;
    out.push({
      sessionId: t.reunion.id,
      titulo: t.reunion.titulo,
      fecha: t.reunion.fecha,
      clientId: t.reunion.clientId,
      empresa: t.reunion.empresa.nombre,
      esProspecto: t.esProspecto,
      pideDecision: t.pideDecision,
      minutaPorRevisar: !!t.secciones.minuta && t.secciones.minuta.estado === "pendiente",
      tareasPropuestas: tareasPendientes.length,
      pedidos: t.secciones.fueraDeAlcance.items.filter((p) => p.estado === "pendiente").length,
      huella: t.huella,
      usarTodoVacio: !plan.minuta && plan.pedidos.length === 0 && plan.tareas.length === 0 && plan.novedades.length === 0,
      equipo,
      paso: null,
      sugerencia: tareasPendientes[0]?.titulo ?? null,
      notaParaHubspot: t.secciones.notaParaHubspot?.estado === "pendiente" ? t.secciones.notaParaHubspot.sugerida : null,
    });
  }
  if (equipo && out.length) {
    const pasos = await pasosVigentes([...new Set(out.map((r) => r.clientId))].map((objetoId) => ({ objeto: "empresa" as const, objetoId }))).catch(() => []);
    for (const r of out) r.paso = pasos.find((p) => p.objetoId === r.clientId && p.equipo === equipo) ?? null;
  }
  return out;
}
