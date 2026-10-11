/**
 * lib/seguimiento/usar-todo-server.ts — «Usar todo» en la tarjeta de una reunión. SERVIDOR.
 *
 * Usa lo que se decide en la tarjeta, cada cosa por SU puerta de escritura (así quedan su historial, sus avisos y la
 * regla de un solo escritor de Tareas):
 *   · la minuta → revisada (`reviewedByEmail`), solo si sigue en borrador;
 *   · cada pedido fuera de alcance → confirmado por `cambiarSolicitud` (avisa a Ventas y a quien lidera Customer
 *     Success, como al confirmarlo a mano);
 *   · cada una de TUS tareas propuestas → «Usar» por `decidirTarea`;
 *   · cada novedad de un documento que dejó un hecho de la reunión (etapa 6) → usada por `usarNovedadesDeLaReunion`,
 *     que decide por `decidirDestinoDeHecho` (el único escritor de los hechos).
 * ⛔ Nunca la ficha, la etapa, la fecha del diagnóstico, las alertas, el avance ni los compromisos: no están en
 * `PlanDeUsarTodo`.
 *
 * Antes de escribir vuelve a cargar la tarjeta: si cambió desde que se vio (otra huella), responde 409 con la nueva y
 * no escribe nada. Después, cada cosa va por su lado: si una tarea ya la decidió otra persona, lo demás se usa igual y
 * la respuesta dice qué no se pudo y por qué.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { cambiarSolicitud } from "@/lib/sessions/solicitudes-server";
import { decidirTarea } from "@/lib/tareas/mutaciones";
import { ErrorDeTareas, contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { usarNovedadesDeLaReunion } from "./novedades-server";
import { cargarTarjeta } from "./tarjeta-server";
import type { Tarjeta } from "./tarjeta";

export interface CosaDeUsarTodo {
  tipo: "minuta" | "pedido-fuera-de-alcance" | "tarea-propuesta" | "novedad";
  /** En una novedad, `<hechoId>:<clave del destino>`. */
  id: string;
}

export type ResultadoDeUsarTodo =
  | { ok: false; status: 404 }
  | { ok: false; status: 409; error: string; tarjeta: Tarjeta }
  | { ok: true; tarjeta: Tarjeta | null; aplicado: CosaDeUsarTodo[]; rechazado: (CosaDeUsarTodo & { motivo: string })[] };

const motivo = (e: unknown): string => (e instanceof Error && e.message ? e.message : "No se pudo.");

export async function usarTodo(sessionId: string, user: AppUserWithTeamMember, huellaVista: string): Promise<ResultadoDeUsarTodo> {
  const tarjeta = await cargarTarjeta(sessionId, user);
  if (!tarjeta) return { ok: false, status: 404 };
  if (tarjeta.huella !== huellaVista) {
    return { ok: false, status: 409, error: "La reunión cambió desde que la abriste. Revisa lo nuevo antes de usarlo.", tarjeta };
  }

  const email = user.email.toLowerCase();
  const plan = tarjeta.planDeUsarTodo;
  const aplicado: CosaDeUsarTodo[] = [];
  const rechazado: (CosaDeUsarTodo & { motivo: string })[] = [];

  if (plan.minuta) {
    const cosa: CosaDeUsarTodo = { tipo: "minuta", id: plan.minuta };
    try {
      const r = await prisma.sessionMinute.updateMany({
        where: { id: plan.minuta, sessionId, status: "DRAFT" },
        data: { status: "REVIEWED", reviewedAt: new Date(), reviewedByEmail: email },
      });
      if (r.count > 0) aplicado.push(cosa);
      else rechazado.push({ ...cosa, motivo: "Otra persona ya la revisó." });
    } catch (e) {
      rechazado.push({ ...cosa, motivo: motivo(e) });
    }
  }

  for (const id of plan.pedidos) {
    const cosa: CosaDeUsarTodo = { tipo: "pedido-fuera-de-alcance", id };
    try {
      await cambiarSolicitud({ clientId: tarjeta.reunion.clientId, id, cambio: { estado: "CONFIRMADO" }, actorEmail: email });
      aplicado.push(cosa);
    } catch (e) {
      rechazado.push({ ...cosa, motivo: motivo(e) });
    }
  }

  if (plan.tareas.length && user.teamMember && (await tareasDisponible())) {
    const [ctx, clientes] = await Promise.all([contextoDeTareas(user), clientesQueVesParaTareas(user.teamMember)]);
    for (const t of plan.tareas) {
      const cosa: CosaDeUsarTodo = { tipo: "tarea-propuesta", id: t.id };
      try {
        await decidirTarea(ctx, clientes, t.id, t.version, { tipo: "usar" });
        aplicado.push(cosa);
      } catch (e) {
        if (!(e instanceof ErrorDeTareas)) throw e;
        rechazado.push({ ...cosa, motivo: motivo(e) });
      }
    }
  }

  if (plan.novedades.length) {
    const r = await usarNovedadesDeLaReunion(plan.novedades, email);
    for (const n of r.usadas) aplicado.push({ tipo: "novedad", id: `${n.hechoId}:${n.clave}` });
    for (const n of r.rechazadas) rechazado.push({ tipo: "novedad", id: `${n.hechoId}:${n.clave}`, motivo: n.motivo });
  }

  olvidarMedicion(email);
  return { ok: true, tarjeta: await cargarTarjeta(sessionId, user), aplicado, rechazado };
}
