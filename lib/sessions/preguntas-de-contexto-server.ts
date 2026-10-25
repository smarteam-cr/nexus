/**
 * lib/sessions/preguntas-de-contexto-server.ts — las preguntas de T9 y lo que responde la persona (2026-10-25). SERVIDOR.
 *
 * Las otras reuniones de la empresa salen SOLO del chokepoint (`getClientSessions`, invariante 1): la pregunta nunca
 * cita una reunión de otra empresa. Lo que responde entra por `agregarReunion` (un recuerdo con la marca `aMano`, origen
 * «preguntas»), que nunca pisa lo que dejó Meet y lo pone en la lectura como a cualquier otra reunión.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions } from "./project-sources";
import { agregarReunion, type ResultadoDeAgregar } from "./reunion-a-mano-server";
import { diaEnCostaRica } from "./reunion-a-mano";
import {
  armarPreguntas,
  estuvoEnLaReunion,
  problemaDeLasRespuestas,
  textoDeLasRespuestas,
  textosDeLaMinuta,
  type PreguntaDeContexto,
  type RespuestaDeContexto,
} from "./preguntas-de-contexto";

/** Cuántas reuniones anteriores de la empresa se miran (las que tienen minuta, de las más recientes). */
const REUNIONES_ANTERIORES = 12;

/** Las preguntas para una reunión de `dueno`, armadas con sus reuniones anteriores. */
export async function preguntasParaLaReunion(o: { sessionId: string; dueno: string; empresa: string; titulo: string; fecha: Date }): Promise<PreguntaDeContexto[]> {
  const anteriores = (await getClientSessions(o.dueno, { before: o.fecha, take: REUNIONES_ANTERIORES + 1 })).filter((s) => s.id !== o.sessionId);
  const minutas = anteriores.length
    ? await prisma.sessionMinute.findMany({
        where: { sessionId: { in: anteriores.map((s) => s.id) } },
        select: { sessionId: true, topics: true, agreements: true, risks: true },
      })
    : [];
  const porReunion = new Map(minutas.map((m) => [m.sessionId, m]));
  const otras = anteriores
    .filter((s) => porReunion.has(s.id))
    .map((s) => {
      const m = porReunion.get(s.id)!;
      return { titulo: s.title, fecha: new Date(s.date), temas: textosDeLaMinuta(m.topics), acuerdos: textosDeLaMinuta(m.agreements), riesgos: textosDeLaMinuta(m.risks) };
    });
  return armarPreguntas({ titulo: o.titulo, empresa: o.empresa, otras });
}

/** Guarda lo que respondió quien estuvo. La ruta ya comprobó el acceso a la reunión y que tiene dueña. */
export async function guardarRespuestas(
  sessionId: string,
  dueno: string,
  r: { respuestas: RespuestaDeContexto[]; extra: string },
  quien: { email: string; nombre: string | null },
): Promise<ResultadoDeAgregar> {
  const s = await prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { date: true, organizerEmail: true, participants: true } });
  if (!s) return { ok: false, status: 404, error: "Esa reunión no existe." };
  if (!estuvoEnLaReunion({ organizador: s.organizerEmail, participantes: s.participants }, quien.email)) {
    return { ok: false, status: 403, error: "Las preguntas las responde quien estuvo en la reunión. Si sabes qué pasó, usa «Agregar lo que pasó»." };
  }
  const problema = problemaDeLasRespuestas(r.respuestas, r.extra);
  if (problema) return { ok: false, status: 400, error: problema };
  return agregarReunion(
    {
      clientId: dueno,
      fecha: diaEnCostaRica(s.date),
      titulo: "",
      proyectoIds: [],
      equipo: [],
      delCliente: [],
      contenido: { tipo: "recuerdo", texto: textoDeLasRespuestas(r.respuestas, r.extra) },
      reunionExistenteId: sessionId,
      confirmarOtra: false,
    },
    quien,
    { origen: "preguntas" },
  );
}
