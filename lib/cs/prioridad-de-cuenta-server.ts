/**
 * lib/cs/prioridad-de-cuenta-server.ts — leer y registrar la marca de prioridad de una cuenta (`PrioridadDeCuenta`,
 * 2026-10-29) y los motivos que crea el equipo (`MotivoDePrioridad`, 2026-10-30). La regla vive en
 * lib/cs/prioridad-de-cuenta.ts.
 *
 * ── SIN LA TABLA NO SE CAE NADA ─────────────────────────────────────────────────────────────
 * Si el SQL (scripts/sql/2026-10-29-prioridad-de-cuenta.sql) todavía no corrió, leer devuelve nada y lo dice
 * (`faltaLaTabla`): la cartera se ve sin marcas. Registrar responde 503. Sin el de los motivos
 * (scripts/sql/2026-10-30-motivos-de-prioridad.sql), igual.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { faltaLaTabla } from "./clasificacion-server";
import {
  TIPOS_DE_PRIORIDAD,
  claveDelMotivo,
  limpiarNombreDelMotivo,
  motivoFijoLlamado,
  prioridadDesdeEventos,
  type EventoDePrioridad,
  type MotivoDelEquipo,
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
      select: { id: true, clientId: true, tipo: true, motivo: true, motivoDelEquipo: { select: { id: true, nombre: true } }, nota: true, porEmail: true, porNombre: true, createdAt: true },
    });
    const eventos = new Map<string, EventoDePrioridad[]>();
    for (const f of filas) {
      if (!esTipo(f.tipo)) continue;
      const lista = eventos.get(f.clientId) ?? [];
      lista.push({ id: f.id, tipo: f.tipo, motivo: f.motivo, motivoDelEquipo: f.motivoDelEquipo, nota: f.nota, porEmail: f.porEmail, porNombre: f.porNombre, en: f.createdAt.toISOString() });
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

/** Los motivos que creó el equipo: aparecen para todos junto a los fijos. */
export async function leerMotivosDelEquipo(): Promise<MotivoDelEquipo[]> {
  try {
    return await prisma.motivoDePrioridad.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
  } catch (e) {
    if (faltaLaTabla(e)) return [];
    throw e;
  }
}

export type NuevaPrioridad =
  | { tipo: "marcar"; motivo: MotivoDePrioridad; motivoDelEquipoId?: string | null; motivoNuevo?: string | null; nota?: string | null }
  | { tipo: "quitar" };

type QuienMarca = { email: string; nombre: string | null };

/** Eligieron un motivo del equipo que ya no está. */
export class MotivoQueNoExiste extends Error {}

/** Qué motivo lleva la marca. Lo escrito en «Otro motivo» crea el motivo, o toma el que ya se llama igual. */
async function resolverMotivo(
  cambio: Extract<NuevaPrioridad, { tipo: "marcar" }>,
  quien: QuienMarca,
): Promise<{ motivo: MotivoDePrioridad; motivoDelEquipoId: string | null }> {
  if (cambio.motivo !== "otro") return { motivo: cambio.motivo, motivoDelEquipoId: null };
  if (cambio.motivoDelEquipoId) {
    const elegido = await prisma.motivoDePrioridad.findUnique({ where: { id: cambio.motivoDelEquipoId }, select: { id: true } });
    if (!elegido) throw new MotivoQueNoExiste();
    return { motivo: "otro", motivoDelEquipoId: elegido.id };
  }
  const nombre = limpiarNombreDelMotivo(cambio.motivoNuevo ?? "");
  const fijo = motivoFijoLlamado(nombre);
  if (fijo && fijo !== "otro") return { motivo: fijo, motivoDelEquipoId: null };
  const { id } = await prisma.motivoDePrioridad.upsert({
    where: { clave: claveDelMotivo(nombre) },
    create: { nombre, clave: claveDelMotivo(nombre), porEmail: quien.email, porNombre: quien.nombre },
    update: {},
    select: { id: true },
  });
  return { motivo: "otro", motivoDelEquipoId: id };
}

/** Registra un cambio y devuelve cómo quedó la cuenta (null = ya no es prioritaria). */
export async function registrarPrioridad(
  clientId: string,
  cambio: NuevaPrioridad,
  quien: QuienMarca,
): Promise<PrioridadGuardada | null> {
  const motivo = cambio.tipo === "marcar" ? await resolverMotivo(cambio, quien) : { motivo: null, motivoDelEquipoId: null };
  await prisma.prioridadDeCuenta.create({
    data: {
      clientId,
      tipo: cambio.tipo,
      ...motivo,
      nota: cambio.tipo === "marcar" ? cambio.nota?.trim() || null : null,
      porEmail: quien.email,
      porNombre: quien.nombre,
    },
  });
  return (await leerPrioridades([clientId])).porCliente.get(clientId) ?? null;
}
