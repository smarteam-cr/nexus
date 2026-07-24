/**
 * lib/agents/triggered-by.ts
 *
 * ¿Quién apretó el botón? Devuelve el email del usuario logueado para estampar
 * `AgentRun.triggeredByEmail`, o `null` si no hay humano detrás.
 *
 * Existe para que el centro de corridas te avise SOLO de lo tuyo cuando un agente
 * termina mientras navegás por otra parte de Nexus. Sin esto, o no te avisaba
 * nadie, o te avisaba de todas las corridas del equipo.
 *
 * NUNCA LANZA — a propósito. Estampar la autoría es metadata de notificación, no
 * autorización: la autorización ya la hizo el guard de la ruta ANTES de llegar acá.
 * Si por lo que sea no se puede resolver el usuario, la corrida se crea igual con
 * `null` y lo único que se pierde es el aviso. Nunca al revés (romper una
 * generación por no saber a quién avisarle sería absurdo).
 *
 * Las llamadas de SISTEMA (watchdog CS, post-proceso de sesiones, clasificador) no
 * llaman a este helper: dejan la columna en null y por construcción no notifican.
 */
import { requireUser } from "@/lib/auth/supabase";

export async function triggeredByEmail(): Promise<string | null> {
  try {
    const user = await requireUser();
    return user.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
