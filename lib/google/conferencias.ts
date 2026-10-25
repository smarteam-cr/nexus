/**
 * lib/google/conferencias.ts — la revisión de las conferencias de Meet (U3, 2026-10-25; job `google-meet-conferencias`).
 * El ÚNICO escritor de `FraseDeReunion`, de la asistencia de `ParticipanteDeReunion` (`entro`, `salio`, `minutos`,
 * `nombre`, `idEnMeet`) y de las columnas `estadoDeConferencia`, `conferencia*` y `docDe*Id` de `FirefliesSession`.
 *
 * Para cada reunión con código de Meet que ya terminó (de los últimos 28 días: Google borra las frases a los 30), le
 * pregunta a la API de Meet, como la persona que la organizó o, si no se puede, como un invitado del equipo:
 *   · si ocurrió, y a qué hora de verdad (no pisa `date`, que es la del evento y la copia de Calendar reescribe);
 *   · quiénes entraron y cuánto tiempo (⚠ Google pide no usar la asistencia para medir desempeño: los minutos no van a
 *     ninguna evaluación; T7 solo dice quién estuvo, lib/google/equipo-en-la-reunion.ts);
 *   · la transcripción por frases, que se copia;
 *   · los Docs de la transcripción y de las notas, por su id: la lectura los usa en vez de buscar en el Drive.
 * Las reglas (qué conferencia es de qué reunión, a quién preguntarle, si ocurrió) viven puras en
 * lib/google/conferencias-reglas.ts. El texto (frases, Docs y gente de fuera) solo se copia cuando la conferencia es sin
 * duda la de esta reunión (`textoConfiable`); con cualquier duda (una sala fija que se reusa, una lejana, una ambigua) se
 * toma solo que ocurrió, la hora y quién del equipo entró. Las frases se copian una sola vez, enteras, cuando la reunión
 * se cierra (`DecisionDeConferencia.cerrar`), en la misma transacción que la vuelve a la cola de lectura.
 *
 * Una reunión se vuelve a mirar cada 30 minutos hasta que ya no queda nada que esperar (`conferenciaCerradaEn`): la
 * transcripción y las notas generadas, o 48 horas desde el fin. Un aviso de Meet por Pub/Sub (U4,
 * lib/google/eventos-de-meet.ts) hace que se mire enseguida.
 *
 * El texto: esto no escribe transcripciones. Si llegaron frases nuevas y la reunión no tenía transcripción (o tenía la de
 * otra reunión), la devuelve a la cola de lectura (`enrichedAt` en null, igual que cuando aparece un Doc nuevo en el
 * evento, lib/google/meet-sync-cambios.ts), y la lectura de siempre (lib/google/meet-enrichment.ts) la lee con las frases
 * como primera fuente. Así la lectura, el resumen, el presupuesto y el aviso de «el texto cambió» siguen teniendo un solo
 * escritor, y una reunión vuelve a la cola una sola vez por cada copia nueva de sus frases.
 *
 * La base local no recibe nada de esto: `scripts/dev-local.ts` borra las credenciales de Google (ARCHITECTURE › Correr
 * en local).
 */
import "server-only";
import { Prisma, type EstadoDeConferencia } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { procedenciaDelTexto } from "@/lib/sessions/texto-de-otra-reunion";
import { listDomainUsers } from "./auth";
import {
  conferenciasDelCodigo,
  ErrorDeMeet,
  frasesDe,
  notasDe,
  participantesDe,
  sesionesDe,
  transcripcionesDe,
  type FraseDeMeet,
} from "./meet-api";
import {
  asistenciaDeLaReunion,
  buscarConferencias,
  cerrarSinCuenta,
  conferenciasDeLaReunion,
  decidirConferencia,
  frasesParaGuardar,
  queSeCopia,
  textoDeLasFrases,
  transcripcionGuardada,
  vuelveALeerse,
  type DecisionDeConferencia,
  type ParticipanteVisto,
  type TranscripcionGuardada,
} from "./conferencias-reglas";
import { MIN_TRANSCRIPT_CHARS } from "./doc-parse";

/** Google borra las frases a los 30 días: se miran las de 28 para atrás. */
export const DIAS_A_REVISAR = 28;
/** Cuánto después del fin del evento se mira por primera vez. */
const DESPUES_DEL_FIN_MS = 10 * 60_000;
/** Cada cuánto se vuelve a mirar una reunión que no se cerró. */
export const VOLVER_A_MIRAR_MS = 30 * 60_000;
/** Reuniones por corrida. */
const POR_CORRIDA = 40;
/** Cuántas cuentas del equipo se prueban por reunión. */
const CUENTAS_POR_REUNION = 3;

export interface ResultadoDeLaRevision {
  sinTabla?: boolean;
  miradas: number;
  ocurrieron: number;
  noOcurrieron: number;
  sinAcceso: number;
  cerradas: number;
  frases: number;
  asistentes: number;
  /** Reuniones que volvieron a la cola de lectura porque llegaron sus frases (o su Doc). */
  aLeer: number;
  /** Reuniones en las que ninguna cuenta del equipo pudo leer la API de Meet. */
  sinCuenta: number;
  /** Google respondió 429/5xx: la corrida se cortó y lo que faltó queda para la siguiente. */
  cortada?: string;
  /** Solo en el simulacro: una línea por reunión. */
  detalle?: string[];
}

interface Candidata {
  id: string;
  title: string;
  date: Date;
  duration: number;
  conferenceId: string;
  organizerEmail: string | null;
  participants: string[];
  canceladaEn: Date | null;
}

/** El directorio: id de Google → correo, y las cuentas que se pueden impersonar. Una hora de vida. */
let directorio: { correoDeUsuario: Map<string, string>; cuentas: Set<string>; vence: number } | null = null;

async function elDirectorio(ahora: Date) {
  if (directorio && directorio.vence > ahora.getTime()) return directorio;
  const usuarios = await listDomainUsers();
  if (usuarios.length === 0) throw new Error("Google no devolvió ningún usuario del dominio");
  directorio = {
    correoDeUsuario: new Map(usuarios.filter((u) => u.id).map((u) => [`users/${u.id}`, u.email.trim().toLowerCase()])),
    cuentas: new Set(usuarios.map((u) => u.email.trim().toLowerCase())),
    vence: ahora.getTime() + 3_600_000,
  };
  return directorio;
}

/** ¿Están las columnas y la tabla del SQL 2026-10-25-google-meet-api.sql en este cliente? */
export function conferenciasDisponibles(): boolean {
  return modeloDisponible(prisma.fraseDeReunion);
}

/**
 * Las reuniones por mirar. `urgente` = acaba de llegar un aviso de Meet (U4): solo las de las últimas 12 horas, sin la
 * espera de 30 minutos (con 2 de piso, para que una ráfaga de avisos no pregunte lo mismo cada minuto).
 */
async function candidatas(ahora: Date, limite: number, urgente: boolean): Promise<Candidata[]> {
  const desde = new Date(ahora.getTime() - (urgente ? 12 * 3_600_000 : DIAS_A_REVISAR * 86_400_000));
  const volver = new Date(ahora.getTime() - (urgente ? 2 * 60_000 : VOLVER_A_MIRAR_MS));
  return prisma.$queryRaw<Candidata[]>(Prisma.sql`
    SELECT s.id, s.title, s.date, s.duration, s."conferenceId", s."organizerEmail", s.participants, s."canceladaEn"
    FROM "FirefliesSession" s
    WHERE s.source = 'google_meet'
      AND s."conferenceId" IS NOT NULL
      AND s."conferenciaCerradaEn" IS NULL
      AND s.date >= ${desde}
      AND s.date + make_interval(mins => s.duration::int) <= ${new Date(ahora.getTime() - DESPUES_DEL_FIN_MS)}
      AND (s."conferenciaRevisadaEn" IS NULL OR s."conferenciaRevisadaEn" < ${volver})
    ORDER BY s."conferenciaRevisadaEn" ASC NULLS FIRST, s.date DESC
    LIMIT ${limite}`);
}

/** Las otras reuniones con el mismo código cerca (una serie, una sala fija), canceladas incluidas con su marca. */
async function hermanasDe(c: Candidata) {
  const margen = 36 * 3_600_000;
  const filas = await prisma.firefliesSession.findMany({
    where: {
      conferenceId: c.conferenceId,
      id: { not: c.id },
      date: { gte: new Date(c.date.getTime() - margen), lte: new Date(c.date.getTime() + margen) },
    },
    select: { id: true, date: true, duration: true, canceladaEn: true },
  });
  return filas.map((f) => ({ id: f.id, inicio: f.date, duracion: f.duration, cancelada: !!f.canceladaEn }));
}

/** Una prueba del permiso de Meet con la cuenta de administración (lista un código que no existe: solo lee). */
async function permisoDeMeetBien(): Promise<boolean> {
  const admin = process.env.GOOGLE_ADMIN_EMAIL?.trim().toLowerCase();
  if (!admin) return false;
  try {
    await conferenciasDelCodigo(admin, "aaa-aaaa-aaa");
    return true;
  } catch (e) {
    if (esDeCuenta(e)) return false;
    throw e;
  }
}

/** Lo que pasa con el permiso en esta corrida: alguna reunión se leyó, o la prueba de la cuenta de administración. */
interface EstadoDelPermiso {
  algunaCuentaLeyo: boolean;
  prueba: boolean | null;
}

const esCuota = (e: unknown) => e instanceof ErrorDeMeet && (e.status === 429 || (e.status !== null && e.status >= 500));
const esDeCuenta = (e: unknown) =>
  e instanceof ErrorDeMeet && (e.status === 401 || e.status === 403 || e.status === 404 || /invalid_grant|unauthorized_client/i.test(e.message));

/**
 * Lo que tiene guardado la reunión como texto, para decidir si vuelve a la cola de lectura. Con las frases a la vista,
 * una transcripción «propia» por el encabezado que no es la misma conversación (otro día de la serie) es de otra reunión.
 */
async function loGuardado(c: Candidata, textoFrases: string | null): Promise<{ guardada: TranscripcionGuardada; tieneNotas: boolean; docs: { tr: string | null; notas: string | null } }> {
  const filas = await prisma.$queryRaw<Array<{ largo: number | null; l1: string | null; notas: boolean; tr: string | null; nt: string | null }>>`
    SELECT length(transcript) AS largo, left(transcript, 400) AS l1, (summary IS NOT NULL AND summary <> 'null'::jsonb) AS notas,
           "docDeTranscripcionId" AS tr, "docDeNotasId" AS nt
    FROM "FirefliesSession" WHERE id = ${c.id}`;
  const f = filas[0];
  const largo = Number(f?.largo ?? 0);
  const propiaPorEncabezado = largo >= MIN_TRANSCRIPT_CHARS && procedenciaDelTexto(c.title, f?.l1 ?? "").tipo === "propia";
  // El texto entero solo hace falta para comparar una propia con las frases.
  const texto =
    propiaPorEncabezado && textoFrases ? ((await prisma.firefliesSession.findUnique({ where: { id: c.id }, select: { transcript: true } }))?.transcript ?? null) : null;
  const guardada = transcripcionGuardada({ largo, propiaPorEncabezado, texto, textoFrases });
  return { guardada, tieneNotas: !!f?.notas, docs: { tr: f?.tr ?? null, notas: f?.nt ?? null } };
}

async function revisarUna(
  c: Candidata,
  dir: { correoDeUsuario: Map<string, string>; cuentas: Set<string> },
  ahora: Date,
  r: ResultadoDeLaRevision,
  o: { escribir: boolean; permiso: EstadoDelPermiso },
): Promise<{ leyo: boolean }> {
  const organizadora = c.organizerEmail?.trim().toLowerCase() ?? null;
  const organizadoraDelEquipo = !!organizadora && dir.cuentas.has(organizadora);
  const invitados = [...new Set(c.participants.map((p) => p.trim().toLowerCase()))].filter((p) => dir.cuentas.has(p) && p !== organizadora);
  const orden = [...(organizadoraDelEquipo ? [organizadora!] : []), ...invitados].slice(0, CUENTAS_POR_REUNION);
  const reunion = { id: c.id, inicio: c.date, duracion: c.duration };
  const finDelEvento = new Date(c.date.getTime() + c.duration * 60_000);
  const busqueda = await buscarConferencias(reunion, orden, organizadoraDelEquipo ? organizadora : null, (cuenta) => conferenciasDelCodigo(cuenta, c.conferenceId), esDeCuenta);

  if (busqueda.sinCuentaQueLea) {
    // Ninguna cuenta del equipo pudo leer (una cuenta sin licencia de Meet, o el permiso quitado en Admin). Si nada de la
    // corrida se leyó todavía, se prueba el permiso con la cuenta de administración: con el permiso bien es una cuenta
    // rota y a las 48 horas se cierra «sin acceso»; con el permiso quitado no se cierra nada y la corrida falla (ver
    // `revisarConferencias`).
    r.sinCuenta++;
    if (!o.permiso.algunaCuentaLeyo && o.permiso.prueba === null) o.permiso.prueba = await permisoDeMeetBien();
    const cerrar = cerrarSinCuenta({ permisoBien: o.permiso.algunaCuentaLeyo || o.permiso.prueba === true, finDelEvento, ahora });
    if (o.escribir) {
      await prisma.firefliesSession.update({
        where: { id: c.id },
        data: { conferenciaRevisadaEn: ahora, ...(cerrar ? { estadoDeConferencia: "SIN_ACCESO", conferenciaCerradaEn: ahora } : {}) },
        select: { id: true },
      });
    }
    if (cerrar) {
      r.sinAcceso++;
      r.cerradas++;
    }
    r.miradas++;
    r.detalle?.push(`${c.date.toISOString().slice(0, 16)} «${c.title}»: ninguna cuenta del equipo pudo leer la API${cerrar ? " (se cierra sin acceso)" : ""}`);
    return { leyo: false };
  }

  const cuenta = busqueda.cuenta;
  const { conferencias: suyas, textoConfiable } =
    busqueda.conferencias.length > 0
      ? conferenciasDeLaReunion({ ...reunion, cancelada: !!c.canceladaEn }, await hermanasDe(c), busqueda.conferencias)
      : { conferencias: [], textoConfiable: false };

  const vistos: ParticipanteVisto[] = [];
  const frases: FraseDeMeet[] = [];
  const archivos: string[] = [];
  let docDeTranscripcionId: string | null = null;
  let docDeNotasId: string | null = null;
  if (cuenta) {
    for (const reg of suyas) {
      for (const p of await participantesDe(cuenta, reg.nombre)) {
        const sesiones = reg.fin ? await sesionesDe(cuenta, p.nombre) : [];
        vistos.push({ ...p, sesiones });
      }
      // Con el texto en duda no se pide (puede ser otra llamada por el mismo enlace).
      if (!textoConfiable) continue;
      // Un invitado puede ver la conferencia y no su transcripción (la de una reunión que organizó el cliente): sin
      // permiso para leerla, la reunión sigue con su asistencia y su hora, sin texto.
      let transcripciones: Awaited<ReturnType<typeof transcripcionesDe>> = [];
      try {
        transcripciones = await transcripcionesDe(cuenta, reg.nombre);
      } catch (e) {
        if (!esDeCuenta(e)) throw e;
      }
      for (const t of transcripciones) {
        archivos.push(t.estado);
        docDeTranscripcionId ??= t.docId;
        // Las frases están cuando la transcripción terminó (ENDED o FILE_GENERATED).
        if (t.estado === "STARTED") continue;
        try {
          frases.push(...(await frasesDe(cuenta, t.nombre)));
        } catch (e) {
          if (!esDeCuenta(e)) throw e;
        }
      }
      for (const n of await notasDe(cuenta, reg.nombre)) {
        archivos.push(n.estado);
        docDeNotasId ??= n.docId;
      }
    }
  }

  const todos = asistenciaDeLaReunion(vistos, dir.correoDeUsuario);
  const hablanteDe = new Map(vistos.map((v) => [v.nombre, { mostrado: v.mostrado, correo: v.usuario ? dir.correoDeUsuario.get(v.usuario) ?? null : null }]));
  const paraGuardar = frasesParaGuardar(frases, hablanteDe);
  const decision: DecisionDeConferencia = decidirConferencia({
    organizadorDelEquipo: busqueda.leyoLaOrganizadora,
    conferencias: suyas,
    participantesDistintos: todos.length,
    hayFrases: paraGuardar.length > 0,
    archivos,
    finDelEvento,
    ahora,
  });

  const copia = queSeCopia({ textoConfiable, cerrar: decision.cerrar });
  // Con el texto en duda, solo los del equipo: la gente de fuera puede ser de otra empresa.
  const asistencia = copia.deFuera ? todos : todos.filter((a) => a.esDelEquipo);
  if (!copia.docs) {
    docDeTranscripcionId = null;
    docDeNotasId = null;
  }

  const inicio = suyas.length > 0 ? suyas[0].inicio : null;
  const fines = suyas.map((s) => s.fin).filter((f): f is Date => !!f);
  const fin = fines.length === suyas.length && fines.length > 0 ? new Date(Math.max(...fines.map((f) => f.getTime()))) : null;

  r.miradas++;
  if (decision.estado === "OCURRIO") r.ocurrieron++;
  if (decision.estado === "NO_OCURRIO") r.noOcurrieron++;
  if (decision.estado === "SIN_ACCESO") r.sinAcceso++;
  if (decision.cerrar) r.cerradas++;
  r.asistentes += asistencia.length;
  if (!o.escribir) {
    if (copia.frases) r.frases += paraGuardar.length;
    r.detalle?.push(
      `${c.date.toISOString().slice(0, 16)} «${c.title}»: ${decision.estado ?? "todavía no se sabe"}${decision.cerrar ? ", cerrada" : ""} · ` +
        `${suyas.length} conferencia(s)${suyas.length > 0 && !textoConfiable ? " (texto en duda: no se copia)" : ""}, ${asistencia.length} persona(s) ` +
        `(${asistencia.filter((a) => a.esDelEquipo).length} del equipo), ${paraGuardar.length} frases`,
    );
    return { leyo: cuenta !== null };
  }

  const copiar = copia.frases && paraGuardar.length > 0;
  const antes = await loGuardado(c, copiar ? textoDeLasFrases(c.title, paraGuardar) : null);

  // Las frases: se copian al cerrar, enteras, y se reemplazan solo si cambió cuántas son (Google no las cambia).
  const frasesNuevas = copiar && (await prisma.fraseDeReunion.count({ where: { sessionId: c.id } })) !== paraGuardar.length;
  const docNuevo = (!!docDeTranscripcionId && !antes.docs.tr) || (!!docDeNotasId && !antes.docs.notas);
  const aLeer = vuelveALeerse({ guardada: antes.guardada, frasesNuevas, docNuevo, tieneNotas: antes.tieneNotas });

  // Las frases y la fila de la reunión en UNA transacción: si se cortara entre las dos, las frases quedarían copiadas sin
  // que la reunión volviera a la cola, y la corrida siguiente ya no las vería nuevas.
  const actualizarReunion = prisma.firefliesSession.update({
    where: { id: c.id },
    data: {
      conferenciaRevisadaEn: ahora,
      ...(decision.estado ? { estadoDeConferencia: decision.estado as EstadoDeConferencia } : {}),
      ...(decision.cerrar ? { conferenciaCerradaEn: ahora } : {}),
      ...(inicio ? { conferenciaInicio: inicio } : {}),
      ...(fin ? { conferenciaFin: fin } : {}),
      ...(docDeTranscripcionId ? { docDeTranscripcionId } : {}),
      ...(docDeNotasId ? { docDeNotasId } : {}),
      // A la cola de lectura, como cuando aparece un Doc nuevo en el evento (ver el encabezado).
      ...(aLeer ? { enrichedAt: null, enrichAttempts: 0, enrichError: null } : {}),
    },
    select: { id: true },
  });
  if (frasesNuevas) {
    await prisma.$transaction([
      prisma.fraseDeReunion.deleteMany({ where: { sessionId: c.id } }),
      prisma.fraseDeReunion.createMany({ data: paraGuardar.map((f) => ({ sessionId: c.id, ...f })) }),
      actualizarReunion,
    ]);
    r.frases += paraGuardar.length;
  } else {
    await actualizarReunion;
  }
  if (aLeer) r.aLeer++;

  // La asistencia: actualiza la fila del invitado (la creó la copia de Calendar) o crea la de quien entró sin estar
  // invitado. La copia de Calendar no borra una fila con `entro` (lib/google/meet-sync.ts).
  for (const a of asistencia) {
    const datos = { entro: a.entro, salio: a.salio, minutos: a.minutos, nombre: a.nombre, idEnMeet: a.idEnMeet };
    await prisma.participanteDeReunion.upsert({
      where: { sessionId_correo: { sessionId: c.id, correo: a.correo } },
      create: { sessionId: c.id, correo: a.correo, esDelEquipo: a.esDelEquipo, ...datos },
      update: datos,
      select: { id: true },
    });
  }
  return { leyo: cuenta !== null };
}

/** La corrida entera no pudo leer la API con ninguna cuenta: casi seguro el permiso de Meet quitado en Admin. */
export class SinPermisoDeMeet extends Error {
  constructor(n: number) {
    super(`Ninguna cuenta del equipo pudo leer la API de Meet en las ${n} reuniones de esta corrida: ¿se quitó el permiso meetings.space.readonly en Admin?`);
    this.name = "SinPermisoDeMeet";
  }
}

/**
 * `escribir: false` = el simulacro (scripts/revisar-conferencias-de-meet.ts): le pregunta a Google y cuenta, sin
 * escribir nada. Lanza `SinPermisoDeMeet` si ninguna reunión de la corrida se pudo leer con ninguna cuenta y la prueba
 * con la cuenta de administración también falla: el job lo anota como fallo y va a Sentry (sin esto, quitar el permiso dejaba el semáforo en verde hasta que INV53 se pusiera rojo).
 */
export async function revisarConferencias(o: { ahora?: Date; limite?: number; urgente?: boolean; escribir?: boolean } = {}): Promise<ResultadoDeLaRevision> {
  const ahora = o.ahora ?? new Date();
  const escribir = o.escribir ?? true;
  const r: ResultadoDeLaRevision = {
    miradas: 0,
    ocurrieron: 0,
    noOcurrieron: 0,
    sinAcceso: 0,
    cerradas: 0,
    frases: 0,
    asistentes: 0,
    aLeer: 0,
    sinCuenta: 0,
    ...(escribir ? {} : { detalle: [] }),
  };
  if (!conferenciasDisponibles()) return { ...r, sinTabla: true };
  try {
    const lista = await candidatas(ahora, o.limite ?? POR_CORRIDA, !!o.urgente);
    if (lista.length === 0) return r;
    const dir = await elDirectorio(ahora);
    const permiso: EstadoDelPermiso = { algunaCuentaLeyo: false, prueba: null };
    for (const c of lista) {
      try {
        const { leyo } = await revisarUna(c, dir, ahora, r, { escribir, permiso });
        permiso.algunaCuentaLeyo ||= leyo;
      } catch (e) {
        if (esCuota(e)) {
          r.cortada = e instanceof Error ? e.message : String(e);
          console.log(`[google/conferencias] Google pidió esperar (${r.cortada}): sigue la próxima corrida`);
          break;
        }
        // Una reunión que falla no frena a las demás: se anota que se miró y vuelve en 30 minutos.
        console.log(`[google/conferencias] «${c.title}» (${c.id}): ${e instanceof Error ? e.message : String(e)}`);
        if (!escribir) continue;
        await prisma.firefliesSession.update({ where: { id: c.id }, data: { conferenciaRevisadaEn: ahora }, select: { id: true } }).catch(() => {});
      }
    }
    // Solo si la prueba con la cuenta de administración también falló: una reunión con una cuenta rota no es una alarma.
    if (!permiso.algunaCuentaLeyo && permiso.prueba === false) throw new SinPermisoDeMeet(r.sinCuenta);
  } catch (e) {
    if (esquemaDesactualizado(e)) {
      console.log("[google/conferencias] falta el SQL 2026-10-25-google-meet-api.sql: no se revisan las conferencias");
      return { ...r, sinTabla: true };
    }
    throw e;
  }
  return r;
}
