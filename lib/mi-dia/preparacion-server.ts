/**
 * lib/mi-dia/preparacion-server.ts — el objetivo y las notas que una persona escribe para una reunión de su calendario
 * (ficha D, 2026-10-17). SERVER-ONLY. El ÚNICO que escribe `PreparacionDeReunion`.
 *
 * Una fila por persona y evento. La lee y la escribe solo esa persona (el correo sale de la sesión, nunca del pedido).
 * Sin la tabla (el SQL todavía no se aplicó) leer devuelve vacío y guardar lo dice, sin romper el inicio.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";

export interface PreparacionGuardada {
  objetivo: string | null;
  notas: string | null;
  /** ISO. */
  actualizadaAt: string | null;
}

export const TOPE_DEL_OBJETIVO = 500;
export const TOPE_DE_LAS_NOTAS = 5000;

const VACIA: PreparacionGuardada = { objetivo: null, notas: null, actualizadaAt: null };

export function preparacionDisponible(): boolean {
  return modeloDisponible(prisma.preparacionDeReunion);
}

export async function leerPreparacion(email: string, eventoId: string): Promise<PreparacionGuardada> {
  if (!preparacionDisponible()) return VACIA;
  try {
    const f = await prisma.preparacionDeReunion.findUnique({
      where: { personaEmail_eventoId: { personaEmail: email.toLowerCase(), eventoId } },
      select: { objetivo: true, notas: true, updatedAt: true },
    });
    return f ? { objetivo: f.objetivo, notas: f.notas, actualizadaAt: f.updatedAt.toISOString() } : VACIA;
  } catch (e) {
    if (esquemaDesactualizado(e)) return VACIA;
    throw e;
  }
}

/** Guarda lo que cambió (`undefined` = no se toca; `null` o vacío = se borra). */
export async function guardarPreparacion(
  email: string,
  eventoId: string,
  cambios: { objetivo?: string | null; notas?: string | null },
): Promise<PreparacionGuardada | "sin-tabla"> {
  if (!preparacionDisponible()) return "sin-tabla";
  const limpio = (v: string | null | undefined, tope: number) => (v === undefined ? undefined : v?.trim() ? v.trim().slice(0, tope) : null);
  const objetivo = limpio(cambios.objetivo, TOPE_DEL_OBJETIVO);
  const notas = limpio(cambios.notas, TOPE_DE_LAS_NOTAS);
  try {
    const f = await prisma.preparacionDeReunion.upsert({
      where: { personaEmail_eventoId: { personaEmail: email.toLowerCase(), eventoId } },
      create: { personaEmail: email.toLowerCase(), eventoId, objetivo: objetivo ?? null, notas: notas ?? null },
      update: { ...(objetivo !== undefined ? { objetivo } : {}), ...(notas !== undefined ? { notas } : {}) },
      select: { objetivo: true, notas: true, updatedAt: true },
    });
    return { objetivo: f.objetivo, notas: f.notas, actualizadaAt: f.updatedAt.toISOString() };
  } catch (e) {
    if (esquemaDesactualizado(e)) return "sin-tabla";
    throw e;
  }
}
