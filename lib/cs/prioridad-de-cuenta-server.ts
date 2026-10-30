/**
 * lib/cs/prioridad-de-cuenta-server.ts — leer y registrar la marca de prioridad de una cuenta (`PrioridadDeCuenta`,
 * 2026-10-29). La regla vive en lib/cs/prioridad-de-cuenta.ts.
 *
 * ── SIN LA TABLA NO SE CAE NADA ─────────────────────────────────────────────────────────────
 * Si el SQL (scripts/sql/2026-10-29-prioridad-de-cuenta.sql) todavía no corrió, leer devuelve nada y lo dice
 * (`faltaLaTabla`): la cartera se ve sin marcas. Registrar responde 503.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { faltaLaTabla } from "./clasificacion-server";
import {
  TIPOS_DE_PRIORIDAD,
  prioridadDesdeEventos,
  type EventoDePrioridad,
  type MotivoDePrioridad,
  type PrioridadGuardada,
  type TipoDePrioridad,
} from "./prioridad-de-cuenta";

function esTipo(t: string): t is TipoDePrioridad {
  return (TIPOS_DE_PRIORIDAD as readonly string[]).includes(t);
}

export async function leerPrioridades(
  clientIds: readonly string[],
): Promise<{ porCliente: Map<string, PrioridadGuardada>; faltaLaTabla: boolean }> {
  const porCliente = new Map<string, PrioridadGuardada>();
  if (clientIds.length === 0) return { porCliente, faltaLaTabla: false };
  try {
    const filas = await prisma.prioridadDeCuenta.findMany({
      where: { clientId: { in: [...clientIds] } },
      orderBy: { createdAt: "asc" },
      select: { id: true, clientId: true, tipo: true, motivo: true, nota: true, porEmail: true, porNombre: true, createdAt: true },
    });
    const eventos = new Map<string, EventoDePrioridad[]>();
    for (const f of filas) {
      if (!esTipo(f.tipo)) continue;
      const lista = eventos.get(f.clientId) ?? [];
      lista.push({ id: f.id, tipo: f.tipo, motivo: f.motivo, nota: f.nota, porEmail: f.porEmail, porNombre: f.porNombre, en: f.createdAt.toISOString() });
      eventos.set(f.clientId, lista);
    }
    for (const [clientId, lista] of eventos) {
      const p = prioridadDesdeEventos(lista);
      if (p) porCliente.set(clientId, p);
    }
    return { porCliente, faltaLaTabla: false };
  } catch (e) {
    if (faltaLaTabla(e)) return { porCliente, faltaLaTabla: true };
    throw e;
  }
}

export type NuevaPrioridad = { tipo: "marcar"; motivo: MotivoDePrioridad; nota?: string | null } | { tipo: "quitar" };

/** Registra un cambio y devuelve cómo quedó la cuenta (null = ya no es prioritaria). */
export async function registrarPrioridad(
  clientId: string,
  cambio: NuevaPrioridad,
  quien: { email: string; nombre: string | null },
): Promise<PrioridadGuardada | null> {
  await prisma.prioridadDeCuenta.create({
    data: {
      clientId,
      tipo: cambio.tipo,
      motivo: cambio.tipo === "marcar" ? cambio.motivo : null,
      nota: cambio.tipo === "marcar" ? cambio.nota?.trim() || null : null,
      porEmail: quien.email,
      porNombre: quien.nombre,
    },
  });
  return (await leerPrioridades([clientId])).porCliente.get(clientId) ?? null;
}
