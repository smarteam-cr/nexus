/**
 * lib/sessions/audio-de-reunion-server.ts — el audio de una reunión presencial, de la subida a la transcripción (T5,
 * 2026-10-25). SERVIDOR. El único escritor de `AudioDeReunion`. Las reglas: lib/sessions/audio-de-reunion.ts; Google:
 * lib/google/speech-to-text.ts.
 *
 *   1. `empezarSubida`: la reunión tiene dueña y no tiene texto; se anota la fila (SUBIENDO) y se abre la subida
 *      reanudable. El navegador sube el archivo directo al bucket.
 *   2. `audioSubido`: el archivo está en el bucket; se pide la transcripción en lote (TRANSCRIBIENDO).
 *   3. `mirarAudios` (job `reuniones-audio`): cuando la operación termina, el texto entra a la reunión por
 *      `agregarReunion` (la transcripción agregada a mano, origen «audio»: nunca pisa lo que dejó Meet) y se pone en la
 *      lectura; el archivo se borra del bucket (LISTO). Un fallo queda en ERROR con su motivo y se puede volver a subir.
 * La ruta comprueba el acceso a la reunión; acá solo se mira que tenga dueña.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { abrirSubidaDelAudio, borrarObjetoDelAudio, leerTranscripcion, pedirTranscripcion, tamanoDelObjeto, uriDelObjeto } from "@/lib/google/speech-to-text";
import { HORAS_MAXIMAS_TRANSCRIBIENDO, audioPrendido, objetoDelAudio, problemaDelAudio, textoDeLaTranscripcion, type EstadoDelAudio } from "./audio-de-reunion";
import { MIN_TRANSCRIPCION, diaEnCostaRica, porQueNoSeLePuedeAgregar } from "./reunion-a-mano";
import { agregarReunion } from "./reunion-a-mano-server";
import { duenoDeLaSesion } from "./project-sources";

export interface EstadoDelAudioDeLaReunion {
  estado: EstadoDelAudio;
  archivo: string;
  error: string | null;
  minutos: number | null;
  subidoPor: string;
  actualizado: string;
}

/** El audio de la reunión, si tiene. Sin la tabla, null. */
export async function audioDeLaReunion(sessionId: string): Promise<EstadoDelAudioDeLaReunion | null> {
  const a = await prisma.audioDeReunion
    .findUnique({ where: { sessionId }, select: { estado: true, archivo: true, error: true, minutos: true, subidoPor: true, updatedAt: true } })
    .catch(() => null);
  return a ? { estado: a.estado, archivo: a.archivo, error: a.error, minutos: a.minutos, subidoPor: a.subidoPor, actualizado: a.updatedAt.toISOString() } : null;
}

/** ¿La reunión puede recibir un audio? Tiene dueña y no tiene texto. El motivo si no, o null. */
async function porQueNoAudio(sessionId: string): Promise<{ status: number; error: string } | null> {
  const s = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { resolvedClientId: true, manualClientId: true, transcript: true, summary: true, date: true },
  });
  if (!s) return { status: 404, error: "Esa reunión no existe." };
  if (!duenoDeLaSesion(s)) return { status: 409, error: "Primero elige de qué empresa es la reunión." };
  if (+s.date > Date.now()) return { status: 409, error: "Esa reunión todavía no ocurrió." };
  const notas = (s.summary as { overview?: unknown } | null)?.overview;
  const porQueNo = porQueNoSeLePuedeAgregar({ largoTranscript: s.transcript?.trim().length ?? 0, largoNotas: typeof notas === "string" ? notas.trim().length : 0 });
  return porQueNo ? { status: 409, error: `${porQueNo} El audio no la reemplaza.` } : null;
}

export async function empezarSubida(
  sessionId: string,
  a: { archivo: string; tipo: string; bytes: number },
  quien: { email: string },
  origen: string,
  ahora = new Date(),
): Promise<{ ok: true; subida: string } | { ok: false; status: number; error: string }> {
  if (!audioPrendido(process.env)) return { ok: false, status: 503, error: "La transcripción de audio no está prendida en este servidor." };
  const problema = problemaDelAudio(a);
  if (problema) return { ok: false, status: 400, error: problema };
  const no = await porQueNoAudio(sessionId);
  if (no) return { ok: false, ...no };
  const previo = await prisma.audioDeReunion.findUnique({ where: { sessionId }, select: { estado: true, objeto: true } });
  if (previo?.estado === "TRANSCRIBIENDO") return { ok: false, status: 409, error: "Ya hay un audio de esta reunión transcribiéndose." };

  const objeto = objetoDelAudio(sessionId, a.archivo, ahora);
  const subida = await abrirSubidaDelAudio({ objeto, tipo: a.tipo, bytes: a.bytes, origen });
  const datos = {
    objeto,
    archivo: a.archivo.slice(0, 200),
    tipo: a.tipo.slice(0, 100),
    bytes: a.bytes,
    estado: "SUBIENDO" as const,
    operacion: null,
    error: null,
    minutos: null,
    subidoPor: quien.email.toLowerCase(),
    terminadoAt: null,
  };
  await prisma.audioDeReunion.upsert({ where: { sessionId }, create: { sessionId, ...datos }, update: datos });
  // El de antes (uno que falló), si quedó en el bucket, sobra.
  if (previo && previo.objeto !== objeto) await borrarObjetoDelAudio(previo.objeto).catch(() => {});
  return { ok: true, subida };
}

export async function audioSubido(sessionId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const fila = await prisma.audioDeReunion.findUnique({ where: { sessionId }, select: { id: true, estado: true, objeto: true } });
  if (!fila || fila.estado !== "SUBIENDO") return { ok: false, status: 409, error: "No hay una subida en curso para esta reunión." };
  const tamano = await tamanoDelObjeto(fila.objeto);
  if (!tamano) return { ok: false, status: 409, error: "El audio todavía no llegó a Google. Vuelve a intentarlo en un momento." };
  try {
    const operacion = await pedirTranscripcion(fila.objeto);
    await prisma.audioDeReunion.update({ where: { id: fila.id }, data: { estado: "TRANSCRIBIENDO", operacion } });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message.replace(/^\[google\/speech\]\s*/, "") : String(e);
    await prisma.audioDeReunion.update({ where: { id: fila.id }, data: { estado: "ERROR", error: error.slice(0, 500), terminadoAt: new Date() } });
    return { ok: false, status: 502, error: `Google no aceptó el audio: ${error.slice(0, 200)}` };
  }
}

export interface ResultadoDeLosAudios {
  mirados: number;
  listos: number;
  conError: number;
  errores: string[];
}

/** Mira los audios que se están transcribiendo (y vence los que se quedaron). Lo corre el job `reuniones-audio`. */
export async function mirarAudios(ahora = new Date()): Promise<ResultadoDeLosAudios> {
  const r: ResultadoDeLosAudios = { mirados: 0, listos: 0, conError: 0, errores: [] };
  const vencido = new Date(+ahora - HORAS_MAXIMAS_TRANSCRIBIENDO * 3_600_000);
  // Una subida que no terminó en 12 horas no va a terminar: se cierra para que se pueda volver a subir.
  const colgadas = await prisma.audioDeReunion.updateMany({
    where: { estado: "SUBIENDO", updatedAt: { lt: vencido } },
    data: { estado: "ERROR", error: "La subida no terminó.", terminadoAt: ahora },
  });
  r.conError += colgadas.count;

  const filas = await prisma.audioDeReunion.findMany({
    where: { estado: "TRANSCRIBIENDO" },
    select: { id: true, sessionId: true, objeto: true, operacion: true, subidoPor: true, updatedAt: true, session: { select: { date: true, resolvedClientId: true, manualClientId: true } } },
    take: 10,
  });
  for (const f of filas) {
    r.mirados++;
    const fallar = async (error: string) => {
      r.conError++;
      r.errores.push(`${f.sessionId}: ${error}`);
      await prisma.audioDeReunion.update({ where: { id: f.id }, data: { estado: "ERROR", error: error.slice(0, 500), terminadoAt: ahora } });
    };
    try {
      if (!f.operacion) {
        await fallar("Falta la operación de Speech-to-Text.");
        continue;
      }
      const t = await leerTranscripcion(f.operacion);
      if (!t.listo) {
        if (+f.updatedAt < +vencido) await fallar(`Google no terminó de transcribir en ${HORAS_MAXIMAS_TRANSCRIBIENDO} horas.`);
        continue;
      }
      if (!t.ok) {
        await fallar(t.error);
        continue;
      }
      const texto = textoDeLaTranscripcion(t.pedazos);
      if (texto.length < MIN_TRANSCRIPCION) {
        await fallar("Casi no se entendió nada en el audio (¿la grabación tiene voz?).");
        continue;
      }
      const dueno = duenoDeLaSesion(f.session);
      if (!dueno) {
        await fallar("La reunión se quedó sin empresa: elígela y vuelve a subir el audio.");
        continue;
      }
      const persona = await prisma.teamMember.findFirst({ where: { email: { equals: f.subidoPor, mode: "insensitive" } }, select: { name: true } });
      const hecho = await agregarReunion(
        {
          clientId: dueno,
          fecha: diaEnCostaRica(f.session.date),
          titulo: "",
          proyectoIds: [],
          equipo: [],
          delCliente: [],
          contenido: { tipo: "transcripcion", texto },
          reunionExistenteId: f.sessionId,
          confirmarOtra: false,
        },
        { email: f.subidoPor, nombre: persona?.name ?? null },
        { origen: "audio" },
      );
      if (!hecho.ok) {
        await fallar(hecho.error);
        continue;
      }
      await prisma.audioDeReunion.update({ where: { id: f.id }, data: { estado: "LISTO", error: null, minutos: t.minutos, terminadoAt: ahora } });
      r.listos++;
      await borrarObjetoDelAudio(f.objeto).catch((e) => console.warn(`[audio] no se borró ${uriDelObjeto(f.objeto)}:`, e instanceof Error ? e.message : e));
    } catch (e) {
      // Un fallo de red o de Google al mirar: se reintenta en el tick siguiente (la fila sigue TRANSCRIBIENDO), hasta
      // que se vence.
      const mensaje = e instanceof Error ? e.message : String(e);
      if (+f.updatedAt < +vencido) await fallar(mensaje).catch(() => {});
      else r.errores.push(`${f.sessionId}: ${mensaje}`);
    }
  }
  return r;
}
