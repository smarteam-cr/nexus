/**
 * lib/seguimiento/hechos/texto-de-la-reunion.ts — la reunión que lee la lectura de hechos: su texto, si es de puertas
 * adentro y sus proyectos. SERVIDOR.
 *
 * Invariante medular #1: no lee `FirefliesSession` por su cuenta. La reunión sale de lib/sessions/reunion-para-hechos.ts,
 * que confirma la pertenencia con el chokepoint (`getClientSessions(clientId, { ids })`): una reunión de otro cliente
 * devuelve null. El texto lo arma texto.ts (puro): la conversación comprimida, las notas priorizadas si es larga, y
 * solo las notas si no hay transcripción.
 */
import "server-only";
import { reunionParaHechos } from "@/lib/sessions/reunion-para-hechos";
import { esDePuertasAdentro } from "@/lib/sessions/reuniones-para-seguimiento";
import { fechaLocalDeLaReunion } from "@/lib/sessions/compromisos-y-alcance";
import { linkFeedsAvance } from "@/lib/handoff/session-relevance";
import { armarTextoDeLaReunion, type TextoDeLaReunion } from "./texto";

export interface ProyectoParaHechos {
  id: string;
  nombre: string;
  isPrimary: boolean;
  confidence: number | null;
  /**
   * ¿Esta reunión mueve el avance de este proyecto? Vinculada y principal, o secundaria con confianza de 0,4 o más:
   * `linkFeedsAvance` (lib/handoff/session-relevance.ts, DECISIONS «Hechos, enrutador y novedades»). No es la política
   * del handoff: esa filtra por relevancia de venta y dejaría afuera justo las reuniones de implementación.
   */
  alimentaElAvance: boolean;
}

export interface ReunionParaLeerHechos {
  id: string;
  titulo: string;
  /** AAAA-MM-DD, en hora de Costa Rica. */
  fecha: string;
  /** null si no deja nada que leer (sin conversación, sin notas). */
  texto: TextoDeLaReunion | null;
  /** Solo estuvo el equipo: lo que se dijo ahí no lo dijo el cliente (el enrutador no la usa). */
  puertasAdentro: boolean;
  /** Los vinculados del mismo cliente, el principal primero. */
  proyectos: ProyectoParaHechos[];
}

/** La reunión lista para leer sus hechos, o null si no es del cliente (o no existe, o todavía no ocurrió). */
export async function textoParaHechos(sessionId: string, clientId: string): Promise<ReunionParaLeerHechos | null> {
  const r = await reunionParaHechos(sessionId, clientId);
  if (!r) return null;
  return {
    id: r.id,
    titulo: r.titulo,
    fecha: fechaLocalDeLaReunion(r.fecha),
    texto: armarTextoDeLaReunion({ transcript: r.transcript, summary: r.summary }),
    puertasAdentro: await esDePuertasAdentro({ participants: r.participantes, organizerEmail: null }),
    proyectos: r.proyectos.map((p) => ({ ...p, alimentaElAvance: linkFeedsAvance({ included: true, isPrimary: p.isPrimary, confidence: p.confidence }) })),
  };
}
