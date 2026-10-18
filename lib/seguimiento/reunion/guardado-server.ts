/**
 * lib/seguimiento/reunion/guardado-server.ts — lo que se guarda de una reunión después de que ocurre
 * (`SeguimientoDeReunion`): la agenda escrita a mano, el correo de seguimiento y la próxima reunión sugerida. SERVIDOR.
 * Ficha G (2026-10-17).
 *
 * ⛔ El ÚNICO escritor de `SeguimientoDeReunion` (lo vigila lib/seguimiento/reunion/reunion.test.ts). Quien llama ya
 * verificó el acceso a la reunión (`guardAccesoALaReunion`). Nada de acá escribe en el calendario ni manda un correo.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { MAX_AGENDA_ESCRITA } from "./agenda";
import type { GuardadoDeLaProxima } from "./proxima";
import { leerCorreoGuardado, type CorreoDeLaReunion } from "./correo";

export interface SeguimientoGuardado {
  /** La versión de la fila (0 = todavía no hay): editar el correo la manda y, si cambió, 409 (no se pisa nada). */
  version: number;
  agenda: { texto: string; porEmail: string | null; porNombre: string | null; en: string | null } | null;
  correo: CorreoDeLaReunion | null;
  proxima: GuardadoDeLaProxima | null;
}

async function nombres(emails: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(emails.filter((e): e is string => !!e).map((e) => e.toLowerCase()))];
  if (!unicos.length) return new Map();
  const filas = await prisma.teamMember.findMany({ where: { email: { in: unicos, mode: "insensitive" } }, select: { email: true, name: true } }).catch(() => []);
  return new Map(filas.map((f) => [f.email.toLowerCase(), f.name]));
}

export async function leerSeguimiento(sessionId: string): Promise<SeguimientoGuardado> {
  const f = await prisma.seguimientoDeReunion.findUnique({ where: { sessionId } });
  if (!f) return { version: 0, agenda: null, correo: null, proxima: null };
  const n = await nombres([f.agendaPorEmail, f.proximaPorEmail]);
  const nombreDe = (e: string | null) => (e ? (n.get(e.toLowerCase()) ?? e) : null);
  const tieneProxima = f.proximaTitulo || f.proximaObjetivo || f.proximaInicio || f.proximaEstado;
  return {
    version: f.version,
    agenda: f.agenda?.trim() ? { texto: f.agenda, porEmail: f.agendaPorEmail, porNombre: nombreDe(f.agendaPorEmail), en: f.agendaEn?.toISOString() ?? null } : null,
    correo: leerCorreoGuardado(f.correo),
    proxima: tieneProxima
      ? {
          titulo: f.proximaTitulo,
          objetivo: f.proximaObjetivo,
          inicio: f.proximaInicio?.toISOString() ?? null,
          duracionMin: f.proximaDuracionMin,
          estado: f.proximaEstado,
          porEmail: f.proximaPorEmail,
          porNombre: nombreDe(f.proximaPorEmail),
          en: f.proximaEn?.toISOString() ?? null,
        }
      : null,
  };
}

type Cambios = Omit<Prisma.SeguimientoDeReunionUncheckedCreateInput, "id" | "sessionId" | "version" | "createdAt" | "updatedAt">;

/** Escribe (o crea) la fila de la reunión. */
async function escribir(sessionId: string, cambios: Cambios) {
  await prisma.seguimientoDeReunion.upsert({
    where: { sessionId },
    create: { ...cambios, sessionId },
    update: { ...cambios, version: { increment: 1 } },
    select: { id: true },
  });
}

/** La agenda escrita a mano. Vacía = se borra (vuelve a mandar la invitación). */
export async function guardarAgenda(sessionId: string, texto: string, email: string): Promise<void> {
  const t = texto.trim().slice(0, MAX_AGENDA_ESCRITA);
  await escribir(sessionId, { agenda: t || null, agendaPorEmail: t ? email.toLowerCase() : null, agendaEn: t ? new Date() : null });
}

const mismoCorreo = (a: CorreoDeLaReunion | null, b: CorreoDeLaReunion | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * El correo que armó el agente (o null para borrarlo: la reunión no tiene la conversación). Armarlo tarda: si mientras
 * tanto una persona cambió el correo (ya no es `antes`, el que había al empezar), no se pisa y devuelve false. Escribe
 * con la versión que leyó: otro cambio de la fila (la agenda, la próxima) no se pierde: se relee y se reintenta.
 */
export async function guardarCorreo(sessionId: string, correo: CorreoDeLaReunion | null, antes: CorreoDeLaReunion | null): Promise<boolean> {
  const valor = correo ? (correo as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
  for (let intento = 0; intento < 3; intento++) {
    const f = await prisma.seguimientoDeReunion.findUnique({ where: { sessionId }, select: { version: true, correo: true } });
    if (!mismoCorreo(leerCorreoGuardado(f?.correo ?? null), antes)) return false;
    if (!f) {
      try {
        await prisma.seguimientoDeReunion.create({ data: { sessionId, correo: valor }, select: { id: true } });
        return true;
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
        continue; // otro pedido la creó a la vez: se relee
      }
    }
    const r = await prisma.seguimientoDeReunion.updateMany({
      where: { sessionId, version: f.version },
      data: { correo: valor, version: { increment: 1 } },
    });
    if (r.count > 0) return true;
  }
  return false;
}

export type ResultadoDeEditarElCorreo = { ok: true; version: number } | { ok: false; motivo: "sin-correo" | "cambio" };

/**
 * Lo que cambió una persona en el correo: el asunto o el texto. `version` es la de la fila que tiene la pantalla: si ya
 * no es la de la base (el correo se regeneró, u otra pestaña lo cambió), no escribe nada y devuelve «cambio».
 */
export async function editarCorreo(
  sessionId: string,
  cambio: { asunto?: string; cuerpo?: string },
  version: number,
): Promise<ResultadoDeEditarElCorreo> {
  const f = await prisma.seguimientoDeReunion.findUnique({ where: { sessionId }, select: { correo: true, version: true } });
  const actual = leerCorreoGuardado(f?.correo ?? null);
  if (!f || !actual) return { ok: false, motivo: "sin-correo" };
  if (f.version !== version) return { ok: false, motivo: "cambio" };
  const nuevo: CorreoDeLaReunion = {
    ...actual,
    ...(cambio.asunto !== undefined ? { asunto: cambio.asunto } : {}),
    ...(cambio.cuerpo !== undefined ? { cuerpo: cambio.cuerpo } : {}),
    editado: true,
  };
  // Condicional: si otro escribió entre la lectura y acá, no se pisa.
  const r = await prisma.seguimientoDeReunion.updateMany({
    where: { sessionId, version },
    data: { correo: nuevo as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
  });
  return r.count > 0 ? { ok: true, version: version + 1 } : { ok: false, motivo: "cambio" };
}

/**
 * Lo que sugirió el agente para la próxima reunión. Solo si ninguna persona la tocó todavía: lo que cambió una persona
 * no se pisa.
 */
export async function guardarProximaDelAgente(sessionId: string, p: { titulo: string; objetivo: string }): Promise<void> {
  const f = await prisma.seguimientoDeReunion.findUnique({ where: { sessionId }, select: { proximaPorEmail: true, proximaEstado: true } });
  if (f?.proximaPorEmail || f?.proximaEstado) return;
  await escribir(sessionId, { proximaTitulo: p.titulo || null, proximaObjetivo: p.objetivo });
}

export interface CambioDeLaProxima {
  titulo?: string;
  objetivo?: string;
  /** ISO. */
  inicio?: string;
  duracionMin?: number;
  /** «agendada» (la guardó en su calendario), «descartada» (no hace falta) o null (vuelve a pendiente). */
  estado?: "agendada" | "descartada" | null;
}

/** Lo que cambió o decidió una persona sobre la próxima reunión. Queda a su nombre. */
export async function guardarProxima(sessionId: string, c: CambioDeLaProxima, email: string): Promise<void> {
  await escribir(sessionId, {
    ...(c.titulo !== undefined ? { proximaTitulo: c.titulo.trim() || null } : {}),
    ...(c.objetivo !== undefined ? { proximaObjetivo: c.objetivo.trim() || null } : {}),
    ...(c.inicio !== undefined ? { proximaInicio: new Date(c.inicio) } : {}),
    ...(c.duracionMin !== undefined ? { proximaDuracionMin: c.duracionMin } : {}),
    ...(c.estado !== undefined ? { proximaEstado: c.estado } : {}),
    proximaPorEmail: email.toLowerCase(),
    proximaEn: new Date(),
  });
}
