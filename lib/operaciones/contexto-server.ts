/**
 * lib/operaciones/contexto-server.ts — el contexto de una operación para una persona EXPLÍCITA (fase 0.4). SERVER-ONLY.
 *
 * Lo que varias operaciones del mismo pedido necesitan (la visibilidad de Tareas, los clientes que ve) se calcula una
 * vez, al primer uso. La persona es el `TeamMember` de quien pide: la pantalla lo saca de la sesión, el chat de su
 * turno, un job de su fila. La capa nunca lee la sesión por su cuenta.
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { contextoDeTareas, type ContextoDeTareas } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas, type ClientesQueVes } from "@/lib/tareas/clientes";
import type { ContextoDeOperacion } from "./tipos";

export interface ExtrasDeNexus {
  /** La visibilidad y el equipo de la persona en Tareas. */
  tareas: () => Promise<ContextoDeTareas>;
  /** Las empresas que ve (con prospectos, aliados y las de Smarteam). */
  clientes: () => Promise<ClientesQueVes>;
}

export type ContextoDeNexus = ContextoDeOperacion<TeamMember, ExtrasDeNexus>;

/** Un error de la capa con su estado HTTP, como los de los escritores. */
export class ErrorDeOperacion extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function unaVez<T>(f: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= f());
}

export function contextoDeOperacion(persona: TeamMember, ahora = new Date()): ContextoDeNexus {
  return {
    persona,
    ahora,
    extras: {
      tareas: unaVez(() => contextoDeTareas({ teamMember: persona })),
      clientes: unaVez(() => clientesQueVesParaTareas(persona)),
    },
  };
}

/** La empresa, si la persona la ve; si no, 403. */
export async function exigirCliente(ctx: ContextoDeNexus, clientId: string): Promise<{ id: string; nombre: string }> {
  const c = await ctx.extras.clientes();
  const e = c.porId.get(clientId);
  if (!c.ids.has(clientId) || !e) throw new ErrorDeOperacion(403, "No tienes acceso a esa empresa.");
  return { id: e.id, nombre: e.nombre };
}
