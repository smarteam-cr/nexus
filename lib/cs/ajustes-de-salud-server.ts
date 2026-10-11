/**
 * lib/cs/ajustes-de-salud-server.ts — leer y registrar las correcciones del color y el «en espera del cliente»
 * (`CorreccionDeSalud`, 2026-10-09). La regla vive en lib/cs/ajustes-de-salud.ts.
 *
 * ── SIN LA TABLA NO SE CAE NADA ─────────────────────────────────────────────────────────────
 * Si el SQL (scripts/sql/2026-10-09-cartera-de-la-csl.sql) todavía no corrió, leer devuelve nada y lo dice
 * (`faltaLaTabla`): la cartera se ve con el color de Nexus. Registrar responde 503.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { faltaLaTabla } from "./clasificacion-server";
import {
  SIN_AJUSTES,
  TIPOS_DE_AJUSTE,
  ajustesDesdeEventos,
  type AjustesDeSalud,
  type EventoDeAjuste,
  type TipoDeAjuste,
} from "./ajustes-de-salud";

/** Hasta dónde se mira atrás: lo de antes no cambia el estado de hoy (una corrección vale 30 días). */
const DIAS_DE_HISTORIA = 400;

const SELECT = {
  id: true,
  clientId: true,
  tipo: true,
  salud: true,
  nota: true,
  saludDeNexus: true,
  razonesDeNexus: true,
  huella: true,
  porEmail: true,
  porNombre: true,
  createdAt: true,
} as const;

function esTipo(t: string): t is TipoDeAjuste {
  return (TIPOS_DE_AJUSTE as readonly string[]).includes(t);
}

export async function leerAjustes(
  clientIds: readonly string[],
): Promise<{ porCliente: Map<string, AjustesDeSalud>; faltaLaTabla: boolean }> {
  const porCliente = new Map<string, AjustesDeSalud>();
  if (clientIds.length === 0) return { porCliente, faltaLaTabla: false };
  try {
    const filas = await prisma.correccionDeSalud.findMany({
      where: { clientId: { in: [...clientIds] }, createdAt: { gte: new Date(Date.now() - DIAS_DE_HISTORIA * 86_400_000) } },
      orderBy: { createdAt: "asc" },
      select: SELECT,
    });
    const eventos = new Map<string, EventoDeAjuste[]>();
    for (const f of filas) {
      if (!esTipo(f.tipo)) continue;
      const lista = eventos.get(f.clientId) ?? [];
      lista.push({
        id: f.id,
        tipo: f.tipo,
        salud: f.salud,
        nota: f.nota,
        saludDeNexus: f.saludDeNexus,
        razonesDeNexus: f.razonesDeNexus,
        huella: f.huella,
        porEmail: f.porEmail,
        porNombre: f.porNombre,
        en: f.createdAt.toISOString(),
      });
      eventos.set(f.clientId, lista);
    }
    for (const [clientId, lista] of eventos) porCliente.set(clientId, ajustesDesdeEventos(lista));
    return { porCliente, faltaLaTabla: false };
  } catch (e) {
    if (faltaLaTabla(e)) return { porCliente, faltaLaTabla: true };
    throw e;
  }
}

export interface NuevoAjuste {
  tipo: TipoDeAjuste;
  salud?: string | null;
  nota?: string | null;
  saludDeNexus?: string | null;
  razonesDeNexus?: string[];
  huella?: string | null;
}

/** Registra un cambio y devuelve cómo quedó la cuenta. */
export async function registrarAjuste(
  clientId: string,
  ajuste: NuevoAjuste,
  quien: { email: string; nombre: string | null },
): Promise<AjustesDeSalud> {
  await prisma.correccionDeSalud.create({
    data: {
      clientId,
      tipo: ajuste.tipo,
      salud: ajuste.salud ?? null,
      nota: ajuste.nota?.trim() || null,
      saludDeNexus: ajuste.saludDeNexus ?? null,
      razonesDeNexus: ajuste.razonesDeNexus ?? [],
      huella: ajuste.huella ?? null,
      porEmail: quien.email,
      porNombre: quien.nombre,
    },
  });
  return (await leerAjustes([clientId])).porCliente.get(clientId) ?? SIN_AJUSTES;
}
