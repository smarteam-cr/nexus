/**
 * lib/seguimiento/compromisos-server.ts — lo que dejó una reunión en TAREAS, para leer en su tarjeta. SERVIDOR.
 *
 * Desde la etapa 2 de la memoria de la cuenta (DECISIONS «La lectura de cada reunión es durable…») los compromisos de
 * una reunión ya no son `ActionItem`: son propuestas de Tarea (lo que se comprometió Smarteam, para quien lo dijo; lo que
 * prometió el cliente, como tarea de seguimiento para el CSE). En la tarjeta van PLEGADOS y SOLO PARA LEER: cada persona
 * decide las suyas («Tus tareas» de la misma tarjeta, o Mis tareas).
 *
 * Solo lo que ve quien mira (la regla de visibilidad de Tareas: nunca lo privado de otros) y sin sus propias
 * propuestas, que la tarjeta ya muestra para decidir. Sin el texto de la reunión: eso va con su regla en Tareas. Lo lee
 * Tareas (`cargarTareasDeLaReunion`); acá solo se pasa a la forma de la tarjeta.
 */
import "server-only";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { cargarTareasDeLaReunion } from "@/lib/tareas/consultas";
import { contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import type { CompromisoEnTarjeta } from "./tarjeta";

const TOPE = 40;

/** Lo que dejó la reunión en Tareas, en la forma de la tarjeta. Sin las tablas de Tareas, nada. */
export async function compromisosDeLaReunion(sessionId: string, user: AppUserWithTeamMember): Promise<CompromisoEnTarjeta[]> {
  if (!user.teamMember || !(await tareasDisponible())) return [];
  const ctx = await contextoDeTareas(user);
  const tareas = await cargarTareasDeLaReunion(ctx, sessionId, TOPE);
  return tareas.map((t) => ({
    id: t.id,
    texto: t.titulo,
    lado: t.lado === "cliente" ? "CLIENTE" : t.lado === "smarteam" ? "SMARTEAM" : null,
    responsable: t.responsable ?? "Por asignar",
    vence: t.venceEl,
    hecho: t.estado === "hecha",
  }));
}
