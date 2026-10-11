/**
 * lib/sessions/reunion-para-hechos.ts — UNA reunión de un cliente, con su texto y sus proyectos, para la lectura de
 * HECHOS (memoria de la cuenta, etapas 5 y 6; lib/seguimiento/hechos). Lector del CHOKEPOINT. SERVIDOR.
 *
 * lib/seguimiento no lee `FirefliesSession` ni `SessionProject` por su cuenta (lib/seguimiento/guardas.test.ts): pasa
 * por acá, con la misma regla de dueño que el resto de Nexus (invariante #1).
 *
 *   · La pertenencia la decide `getClientSessions(clientId, { ids })`: si la reunión no es del cliente, null.
 *   · Solo una reunión que ya ocurrió (el chokepoint corta por fecha, y la consulta del texto vuelve a cortar).
 *   · Los proyectos: los vinculados con `included: true` que son del MISMO cliente, con primario y confianza (para la
 *     regla del avance, que la decide quien lee).
 *
 * Desde acá nunca se escribe nada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { getClientSessions } from "./project-sources";

export interface ProyectoDeLaReunion {
  id: string;
  nombre: string;
  isPrimary: boolean;
  confidence: number | null;
}

export interface ReunionParaHechos {
  id: string;
  titulo: string;
  fecha: Date;
  /** Con el organizador incluido (como los da el chokepoint). */
  participantes: string[];
  transcript: string | null;
  /** Las notas de Gemini, crudas: las lee lib/seguimiento/hechos/texto.ts. */
  summary: unknown;
  /** El primario primero, después por confianza. */
  proyectos: ProyectoDeLaReunion[];
}

/** La reunión con su texto, o null si no es del cliente, no existe o todavía no ocurrió. */
export async function reunionParaHechos(sessionId: string, clientId: string): Promise<ReunionParaHechos | null> {
  const [delCliente] = await getClientSessions(clientId, { ids: [sessionId], take: 1 });
  if (!delCliente) return null;
  const ahora = new Date();
  const [fila, vinculos] = await Promise.all([
    // El id ya lo filtró el chokepoint por dueño y por fecha; el techo se repite porque esta consulta lleva el texto.
    prisma.firefliesSession.findFirst({ where: { id: sessionId, date: { lte: ahora } }, select: { transcript: true, summary: true } }),
    prisma.sessionProject.findMany({
      where: { sessionId, included: true, project: proyectoClasificableWhere({ clientId }) },
      orderBy: [{ isPrimary: "desc" }, { confidence: "desc" }],
      select: { isPrimary: true, confidence: true, project: { select: { id: true, name: true } } },
    }),
  ]);
  if (!fila) return null;
  return {
    id: delCliente.id,
    titulo: delCliente.title,
    fecha: new Date(delCliente.date),
    participantes: delCliente.participants,
    transcript: fila.transcript,
    summary: fila.summary,
    proyectos: vinculos.map((v) => ({ id: v.project.id, nombre: v.project.name, isPrimary: v.isPrimary, confidence: v.confidence })),
  };
}
