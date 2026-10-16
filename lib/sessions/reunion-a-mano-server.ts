import "server-only";

/**
 * lib/sessions/reunion-a-mano-server.ts — «Agregar una reunión» (etapa 4f del roadmap de «Para ti», 2026-10-15).
 *
 * Dos caminos, una sola regla (las reglas puras en lib/sessions/reunion-a-mano.ts):
 *   · una reunión NUEVA, que no pasó por Meet: se crea con `source = "manual"`, el cliente fijado por la persona
 *     (`manualClientId`, «humano») y los proyectos que eligió, vinculados a mano (`SessionProject.source = "manual"`:
 *     el clasificador no los toca);
 *   · una reunión de Meet SIN transcripción ni notas: se le agrega lo que pasó. Lo que dejó Meet nunca se pisa.
 * Después, la reunión entra a la cola de la lectura de cada reunión (lib/lecturas), sin el corte de 14 días: la pidió
 * una persona. La lee el job como a cualquier otra.
 *
 * Las reuniones del cliente se leen SOLO por el chokepoint (`getClientSessions`, invariante 1). Ninguna regla pregunta de
 * qué equipo es quien la agrega: alcanza con tener acceso al cliente (lo pide la ruta).
 */
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { proyectoNavegableWhere } from "@/lib/projects/scope";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import { getClientSessions } from "./project-sources";
import { asignarDuenioManual } from "./duenio-manual";
import {
  FUENTE_A_MANO,
  PREFIJO_A_MANO,
  diaEnCostaRica,
  inicioDeLaReunion,
  leerMarcaAMano,
  limitesDelDia,
  participantesDeLaReunion,
  porQueNoSeLePuedeAgregar,
  problemaDelContenido,
  summaryDeLaTranscripcion,
  summaryDelRecuerdo,
  type MarcaAMano,
  type ReunionDelDia,
} from "./reunion-a-mano";
import type { AgregarReunionInput } from "./reunion-a-mano-schema";

export interface QuienAgrega {
  email: string;
  nombre: string | null;
}

export interface ReunionDelDiaConMotivo extends ReunionDelDia {
  /** Por qué no se le puede agregar lo que pasó (ya tiene texto), o null. */
  porQueNo: string | null;
}

export interface OpcionesParaAgregar {
  cliente: { id: string; nombre: string };
  proyectos: { id: string; nombre: string }[];
  /** Las reuniones del cliente ese día (si vino la fecha), para preguntar si es una de ellas. */
  reunionesDelDia: ReunionDelDiaConMotivo[];
  equipo: { email: string; nombre: string }[];
}

/** Las reuniones del cliente en un día de Costa Rica, con lo que ya tienen. Por el chokepoint. */
async function reunionesDelDia(clientId: string, fecha: string): Promise<ReunionDelDiaConMotivo[]> {
  const dia = limitesDelDia(fecha);
  if (!dia) return [];
  const delCliente = (await getClientSessions(clientId, { before: dia.hasta, take: 40 })).filter((s) => s.date >= +dia.desde);
  if (!delCliente.length) return [];
  const filas = await prisma.firefliesSession.findMany({
    where: { id: { in: delCliente.map((s) => s.id) } },
    select: { id: true, title: true, date: true, transcript: true, summary: true },
    orderBy: { date: "asc" },
  });
  return filas.map((f) => {
    const notas = (f.summary as { overview?: unknown } | null)?.overview;
    const largoNotas = typeof notas === "string" ? notas.trim().length : 0;
    const largoTranscript = f.transcript?.trim().length ?? 0;
    const porQueNo = porQueNoSeLePuedeAgregar({ largoTranscript, largoNotas });
    return {
      id: f.id,
      titulo: f.title,
      inicio: f.date.toISOString(),
      tieneTexto: porQueNo !== null,
      aMano: leerMarcaAMano(f.summary) !== null,
      porQueNo,
    };
  });
}

/** Lo que el formulario necesita para un cliente: sus proyectos, el equipo y, con fecha, las reuniones de ese día. */
export async function opcionesParaAgregar(clientId: string, fecha: string | null): Promise<OpcionesParaAgregar | null> {
  const cliente = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!cliente) return null;
  const [proyectos, miembros, delDia] = await Promise.all([
    prisma.project.findMany({
      where: proyectoNavegableWhere({ clientId, esPrueba: false }),
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamMember.findMany({ where: { deactivatedAt: null }, select: { email: true, name: true }, orderBy: { name: "asc" } }),
    fecha ? reunionesDelDia(clientId, fecha) : Promise.resolve([]),
  ]);
  return {
    cliente: { id: cliente.id, nombre: cliente.name },
    proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.name })),
    reunionesDelDia: delDia,
    equipo: miembros.filter((m) => !esCuentaDePrueba(m.name) && m.email).map((m) => ({ email: m.email.toLowerCase(), nombre: m.name })),
  };
}

export type ResultadoDeAgregar =
  | { ok: true; sessionId: string; nueva: boolean; lectura: { encolada: boolean; mensaje: string } }
  | { ok: false; status: number; error: string; reunionesDelDia?: ReunionDelDiaConMotivo[] };

/** Qué le pasa a la reunión después de guardarla, dicho para la persona. */
function mensajeDeLaLectura(motivo: string | undefined, encolada: boolean): string {
  if (encolada) return "Nexus la va a leer en unos minutos: la minuta, las tareas y lo demás aparecen en la reunión.";
  switch (motivo) {
    case "puertas_adentro":
      return "Solo estuvo el equipo, así que no la lee el seguimiento. Para sacar tareas, usa «Leer una reunión» en Tareas.";
    case "no_es_cliente":
      return "Es de un aliado o de Smarteam: queda guardada, sin lectura.";
    case "sin_duenio":
      return "Queda guardada, pero sin cliente no se lee.";
    case "sin_texto":
      return "Queda guardada, pero con tan poco texto no hay nada que leer.";
    case "sin_sql":
    case "apagada":
      return "Queda guardada. La lectura automática está apagada en este momento.";
    default:
      if (motivo?.startsWith("ya_")) return "Queda guardada. Esa reunión ya estaba en la lectura.";
      return "Queda guardada.";
  }
}

/** La pone en la cola de la lectura, sin el corte de 14 días (la pidió una persona). Nunca lanza. */
async function ponerEnLaLectura(sessionId: string): Promise<{ encolada: boolean; mensaje: string }> {
  try {
    const { seguimientoPrendido } = await import("@/lib/lecturas/reglas");
    if (!seguimientoPrendido(process.env)) return { encolada: false, mensaje: mensajeDeLaLectura("apagada", false) };
    const { encolarSeguimiento } = await import("@/lib/lecturas/cola");
    const r = await encolarSeguimiento(sessionId, new Date(), 0, { sinCorteDeFrescura: true });
    return { encolada: r.encolada, mensaje: mensajeDeLaLectura(r.motivo, r.encolada) };
  } catch (e) {
    console.error(`[reunion-a-mano] no se pudo encolar ${sessionId}:`, e instanceof Error ? e.message : e);
    return { encolada: false, mensaje: mensajeDeLaLectura(undefined, false) };
  }
}

/** Vincula la reunión a los proyectos elegidos (a mano: el clasificador no los toca). El primero es el primario. */
async function vincularProyectos(
  tx: Pick<typeof prisma, "sessionProject">,
  sessionId: string,
  proyectoIds: readonly string[],
): Promise<void> {
  if (!proyectoIds.length) return;
  const yaHayPrimario = (await tx.sessionProject.count({ where: { sessionId, isPrimary: true } })) > 0;
  for (const [i, projectId] of proyectoIds.entries()) {
    const primario = !yaHayPrimario && i === 0;
    await tx.sessionProject.upsert({
      where: { sessionId_projectId: { sessionId, projectId } },
      create: { sessionId, projectId, isPrimary: primario, source: "manual" },
      update: { source: "manual", included: true, ...(primario ? { isPrimary: true } : {}) },
    });
  }
}

/** Agrega una reunión (nueva, o lo que pasó en una de Meet que no dejó nada). La ruta ya comprobó el acceso al cliente. */
export async function agregarReunion(input: AgregarReunionInput, quien: QuienAgrega): Promise<ResultadoDeAgregar> {
  const cliente = await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } });
  if (!cliente) return { ok: false, status: 404, error: "Ese cliente no existe." };

  const texto = input.contenido.texto.trim();
  const problema = problemaDelContenido(input.contenido.tipo, texto);
  if (problema) return { ok: false, status: 400, error: problema };

  // Los proyectos tienen que ser de este cliente (invariante 1: una reunión no cruza de cliente).
  const proyectoIds = [...new Set(input.proyectoIds)];
  if (proyectoIds.length) {
    const validos = await prisma.project.count({ where: proyectoNavegableWhere({ clientId: input.clientId, esPrueba: false, id: { in: proyectoIds } }) });
    if (validos !== proyectoIds.length) return { ok: false, status: 400, error: "Algún proyecto no es de este cliente." };
  }

  const ahora = new Date();
  const marca: MarcaAMano = { tipo: input.contenido.tipo, por: quien.email.toLowerCase(), nombre: quien.nombre, at: ahora.toISOString() };

  /* ── Una reunión que ya está: se le agrega lo que pasó ── */
  if (input.reunionExistenteId) {
    const [delCliente] = await getClientSessions(input.clientId, { ids: [input.reunionExistenteId] });
    if (!delCliente) return { ok: false, status: 404, error: "Esa reunión no es de este cliente o todavía no ocurrió." };
    const fila = await prisma.firefliesSession.findUnique({
      where: { id: delCliente.id },
      select: { id: true, transcript: true, summary: true },
    });
    if (!fila) return { ok: false, status: 404, error: "Esa reunión ya no existe." };
    const notas = (fila.summary as { overview?: unknown } | null)?.overview;
    const porQueNo = porQueNoSeLePuedeAgregar({
      largoTranscript: fila.transcript?.trim().length ?? 0,
      largoNotas: typeof notas === "string" ? notas.trim().length : 0,
    });
    if (porQueNo) return { ok: false, status: 409, error: `${porQueNo} Lo que dejó Meet no se reemplaza.` };

    const previo: Prisma.JsonObject = fila.summary && typeof fila.summary === "object" && !Array.isArray(fila.summary) ? fila.summary : {};
    await prisma.$transaction(async (tx) => {
      await tx.firefliesSession.update({
        where: { id: fila.id },
        data:
          input.contenido.tipo === "transcripcion"
            ? { transcript: texto, summary: { ...previo, ...summaryDeLaTranscripcion(marca) } }
            : { summary: { ...previo, ...summaryDelRecuerdo(texto, marca) } },
        select: { id: true },
      });
      // Que el reintento del enriquecimiento de Meet no la vuelva a tomar y pise lo agregado.
      await tx.firefliesSession.updateMany({
        where: { id: fila.id },
        data: { enrichedAt: ahora, enrichAttempts: 0, enrichError: null },
      });
      await vincularProyectos(tx, fila.id, proyectoIds);
    });
    return { ok: true, sessionId: fila.id, nueva: false, lectura: await ponerEnLaLectura(fila.id) };
  }

  /* ── Una reunión nueva ── */
  const inicio = inicioDeLaReunion(input.fecha, input.hora);
  if (!inicio) return { ok: false, status: 400, error: "La fecha no es válida." };
  if (+inicio > +ahora) return { ok: false, status: 400, error: "Esa reunión todavía no ocurrió: se agrega después." };
  const titulo = input.titulo.trim();
  if (!titulo) return { ok: false, status: 400, error: "Ponle un título a la reunión." };

  // ¿Ya está? Las del mismo día se muestran antes de crear otra (la persona confirma que es otra).
  if (!input.confirmarOtra) {
    const delDia = await reunionesDelDia(input.clientId, diaEnCostaRica(inicio));
    if (delDia.length) {
      return { ok: false, status: 409, error: "Ese día ya hay reuniones de este cliente. ¿Es una de ellas?", reunionesDelDia: delDia };
    }
  }

  const participantes = participantesDeLaReunion(input.equipo, input.delCliente);
  const id = `${PREFIJO_A_MANO}${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  await prisma.$transaction(async (tx) => {
    await tx.firefliesSession.create({
      data: {
        id,
        title: titulo,
        date: inicio,
        duration: input.duracionMin ?? 0,
        participants: participantes,
        source: FUENTE_A_MANO,
        transcript: input.contenido.tipo === "transcripcion" ? texto : null,
        summary: input.contenido.tipo === "transcripcion" ? summaryDeLaTranscripcion(marca) : summaryDelRecuerdo(texto, marca),
        enrichedAt: ahora,
        resolvedClientId: input.clientId,
      },
      select: { id: true },
    });
    // El cliente lo eligió una persona: la cascada lo respeta (el manual va primero) y queda quién fue. Por el único
    // escritor del dueño manual, en la misma transacción.
    await asignarDuenioManual(id, input.clientId, { origen: "humano", actorEmail: quien.email.toLowerCase(), db: tx });
    await vincularProyectos(tx, id, proyectoIds);
  });
  return { ok: true, sessionId: id, nueva: true, lectura: await ponerEnLaLectura(id) };
}
