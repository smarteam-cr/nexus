/**
 * lib/seguimiento/reunion/pagina-server.ts — lo que la página de una reunión suma a «Lo que dejó esta reunión»: su
 * agenda, sus avisos, sus tareas con responsable y, después de una reunión con un cliente, el correo de seguimiento y la
 * próxima reunión sugerida. SERVIDOR. Ficha G (2026-10-17).
 *
 * Quien llama (la página) ya verificó el acceso al dueño de la reunión. Respeta quién ve qué:
 *   · las otras reuniones del cliente y la lectura salen del chokepoint (lib/sessions/reunion-para-su-pagina.ts);
 *   · las tareas son las que ve quien mira, por Tareas (`compromisosDeLaReunion` → `cargarTareasDeLaReunion`): nunca lo
 *     privado de otros; las propuestas suyas se deciden en «Lo que dejó esta reunión»;
 *   · los avisos de «Para ti» son solo los de quien mira.
 * Las reglas (qué dice cada cosa) son puras: agenda.ts, avisos.ts y proxima.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { alrededorDeLaReunion } from "@/lib/sessions/reunion-para-su-pagina";
import { esDePuertasAdentro } from "@/lib/sessions/reuniones-para-seguimiento";
import { compromisosDeLaReunion } from "../compromisos-server";
import type { CompromisoEnTarjeta } from "../tarjeta";
import { armarAgenda, type AgendaDeLaReunion } from "./agenda";
import { avisoLlevaALaReunion, avisosDeLaReunion, type AvisoDeLaReunion } from "./avisos";
import { leerSeguimiento, type SeguimientoGuardado } from "./guardado-server";
import { sugerirProxima, type ProximaSugerida } from "./proxima";
import type { CorreoDeLaReunion } from "./correo";

export interface DespuesDeLaReunion {
  empresa: string;
  correo: CorreoDeLaReunion | null;
  /** La versión de lo guardado de la reunión: la manda la pantalla al editar el correo (409 si cambió). */
  version: number;
  proxima: ProximaSugerida;
  /** La reunión con el cliente que ya existe después de esta, si hay. */
  siguiente: { id: string; titulo: string; fecha: string } | null;
}

export interface PaginaDeLaReunion {
  agenda: AgendaDeLaReunion;
  avisos: AvisoDeLaReunion[];
  tareas: CompromisoEnTarjeta[];
  /** null = esta reunión no lleva correo ni próxima (sin cliente, aliado, Smarteam, de puertas adentro o futura). */
  despues: DespuesDeLaReunion | null;
}

/** Los tipos de empresa cuyas reuniones llevan correo de seguimiento (lo mismo que la tarjeta). */
const CON_CORREO = new Set(["CLIENTE", "PROSPECTO"]);
const DIAS_DE_AVISOS = 60;

const VACIO: SeguimientoGuardado = { version: 0, agenda: null, correo: null, proxima: null };

/** Una lectura que depende de un SQL que quizá falta: sin la tabla o la columna, esa parte sale vacía. */
async function seguro<T>(p: Promise<T>, siFalta: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (esquemaDesactualizado(e)) return siFalta;
    throw e;
  }
}

async function avisosPersonales(email: string, sessionId: string) {
  const desde = new Date(Date.now() - DIAS_DE_AVISOS * 24 * 3_600_000);
  const filas = await prisma.aviso.findMany({
    where: {
      paraEmail: email.toLowerCase(),
      creadoAt: { gte: desde },
      OR: [{ href: { startsWith: `/sessions/${encodeURIComponent(sessionId)}` } }, { href: { startsWith: `/sessions/${sessionId}` } }],
    },
    orderBy: { creadoAt: "desc" },
    take: 10,
    select: { id: true, titulo: true, detalle: true, href: true, creadoAt: true, leidoAt: true },
  });
  return filas
    .filter((a) => avisoLlevaALaReunion(a.href, sessionId))
    .map((a) => ({ id: a.id, titulo: a.titulo, detalle: a.detalle, creadoAt: a.creadoAt.toISOString(), leidoAt: a.leidoAt?.toISOString() ?? null }));
}

export async function cargarPaginaDeLaReunion(o: {
  sessionId: string;
  user: AppUserWithTeamMember;
  reunion: { titulo: string; fecha: Date; duracionMin: number; participantes: string[]; organizador: string | null; descripcion: string | null; tieneTexto: boolean; enriquecida: boolean };
  dueno: { id: string; nombre: string; kind: string } | null;
  proyectosDelCliente: number;
  proyectosVinculados: number;
  ahora?: Date;
}): Promise<PaginaDeLaReunion> {
  const ahora = o.ahora ?? new Date();
  const [alrededor, guardado, tareas, personales, puertasAdentro] = await Promise.all([
    seguro(alrededorDeLaReunion({ sessionId: o.sessionId, dueno: o.dueno?.id ?? null, fecha: o.reunion.fecha, duracionMin: o.reunion.duracionMin }), {
      siguiente: null,
      planeada: null,
      lectura: null,
    }),
    seguro(leerSeguimiento(o.sessionId), VACIO),
    seguro(compromisosDeLaReunion(o.sessionId, o.user), [] as CompromisoEnTarjeta[]),
    seguro(avisosPersonales(o.user.email, o.sessionId), []),
    esDePuertasAdentro({ participants: o.reunion.participantes, organizerEmail: o.reunion.organizador }),
  ]);

  const agenda = armarAgenda({
    escrita: guardado.agenda ? { texto: guardado.agenda.texto, porNombre: guardado.agenda.porNombre, en: guardado.agenda.en } : null,
    invitacion: o.reunion.descripcion,
    planeada: alrededor.planeada,
  });

  const avisos = avisosDeLaReunion({
    ahora,
    fecha: o.reunion.fecha.toISOString(),
    duracionMin: o.reunion.duracionMin,
    dueno: o.dueno,
    puertasAdentro,
    tieneTexto: o.reunion.tieneTexto,
    enriquecida: o.reunion.enriquecida,
    lectura: alrededor.lectura,
    proyectosDelCliente: o.proyectosDelCliente,
    proyectosVinculados: o.proyectosVinculados,
    personales,
  });

  const llevaCorreo = !!o.dueno && CON_CORREO.has(o.dueno.kind) && !puertasAdentro && o.reunion.fecha.getTime() <= ahora.getTime();
  const despues: DespuesDeLaReunion | null =
    llevaCorreo && o.dueno
      ? {
          empresa: o.dueno.nombre,
          correo: guardado.correo,
          version: guardado.version,
          proxima: sugerirProxima({
            reunion: { titulo: o.reunion.titulo, fecha: o.reunion.fecha.toISOString(), duracionMin: o.reunion.duracionMin, participantes: o.reunion.participantes },
            empresa: o.dueno.nombre,
            guardado: guardado.proxima,
            ahora,
          }),
          siguiente: alrededor.siguiente,
        }
      : null;

  return { agenda, avisos, tareas, despues };
}
