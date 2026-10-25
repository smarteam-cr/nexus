/**
 * lib/google/equipo-en-la-reunion.ts — T7 (2026-10-25): QUIÉNES DE SMARTEAM ESTUVIERON en cada reunión, con su papel
 * (organizó o asistió). Hasta U3 Nexus solo guardaba al organizador como «de quién es» y a los invitados: la de Camosa
 * la organizó Liz Navarro, y Marco y Andrés fueron. La asistencia sale de la API de Meet (lib/google/conferencias.ts,
 * en `ParticipanteDeReunion`).
 *
 * ⚠ Google pide no usar la asistencia para medir desempeño. Por eso esto dice SOLO quién estuvo, sin minutos ni horas:
 * sirve para atribuir la reunión (el analizador de venta, la carga de cada persona, «Para ti»), nunca para evaluar.
 *
 * Recibe ids de reuniones que ya salieron del chokepoint (`lib/sessions/project-sources.ts`): no elige reuniones.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { PREFIJO_SIN_CORREO } from "./conferencias-reglas";

export interface DelEquipoEnLaReunion {
  correo: string;
  organizo: boolean;
  /**
   * true = entró a la conferencia; false = Meet dice que la reunión ocurrió y no entró; null = no se sabe (todavía no se
   * miró la conferencia, o no hubo acceso). Con null, `respuesta` dice al menos si aceptó la invitación.
   */
  estuvo: boolean | null;
  respuesta: "ACEPTO" | "TENTATIVA" | "RECHAZO" | "SIN_RESPONDER" | null;
}

type DelEquipoEstado = "OCURRIO" | "NO_OCURRIO" | "SIN_ACCESO" | null;

export interface FilaDeParticipante {
  correo: string;
  esDelEquipo: boolean;
  respuesta: DelEquipoEnLaReunion["respuesta"];
  entro: Date | null;
}

/** PURA. Los del equipo de UNA reunión, con su papel. El organizador va aunque no tenga fila (lo era por el evento). */
export function delEquipoEnLaReunion(
  reunion: { organizerEmail: string | null; estadoDeConferencia: DelEquipoEstado },
  filas: readonly FilaDeParticipante[],
  esDelEquipo: (correo: string) => boolean,
): DelEquipoEnLaReunion[] {
  const sabemos = reunion.estadoDeConferencia === "OCURRIO" || reunion.estadoDeConferencia === "NO_OCURRIO";
  const organizador = reunion.organizerEmail?.trim().toLowerCase() ?? null;
  const porCorreo = new Map<string, DelEquipoEnLaReunion>();
  for (const f of filas) {
    if (!f.esDelEquipo || f.correo.startsWith(PREFIJO_SIN_CORREO)) continue;
    porCorreo.set(f.correo, {
      correo: f.correo,
      organizo: f.correo === organizador,
      estuvo: f.entro ? true : sabemos ? false : null,
      respuesta: f.respuesta,
    });
  }
  if (organizador && !porCorreo.has(organizador) && esDelEquipo(organizador)) {
    porCorreo.set(organizador, { correo: organizador, organizo: true, estuvo: sabemos ? false : null, respuesta: null });
  }
  return [...porCorreo.values()].sort((a, b) => Number(b.organizo) - Number(a.organizo) || a.correo.localeCompare(b.correo));
}

/**
 * Los del equipo de cada reunión, leídos de la base. Sin la tabla o las columnas (el SQL sin aplicar) devuelve un mapa
 * vacío: quien lo use sigue con el organizador.
 */
export async function equipoEnLasReuniones(sessionIds: readonly string[], esDelEquipo: (correo: string) => boolean): Promise<Map<string, DelEquipoEnLaReunion[]>> {
  const out = new Map<string, DelEquipoEnLaReunion[]>();
  if (sessionIds.length === 0 || !modeloDisponible(prisma.participanteDeReunion)) return out;
  let reuniones: { id: string; organizerEmail: string | null; estadoDeConferencia: DelEquipoEstado }[];
  let filas: (FilaDeParticipante & { sessionId: string })[];
  try {
    [reuniones, filas] = await Promise.all([
      prisma.firefliesSession.findMany({ where: { id: { in: [...sessionIds] } }, select: { id: true, organizerEmail: true, estadoDeConferencia: true } }),
      prisma.participanteDeReunion.findMany({
        where: { sessionId: { in: [...sessionIds] }, esDelEquipo: true },
        select: { sessionId: true, correo: true, esDelEquipo: true, respuesta: true, entro: true },
      }),
    ]);
  } catch (e) {
    if (esquemaDesactualizado(e)) return out;
    throw e;
  }
  const filasDe = new Map<string, FilaDeParticipante[]>();
  for (const f of filas) filasDe.set(f.sessionId, [...(filasDe.get(f.sessionId) ?? []), f]);
  for (const r of reuniones) out.set(r.id, delEquipoEnLaReunion(r, filasDe.get(r.id) ?? [], esDelEquipo));
  return out;
}
