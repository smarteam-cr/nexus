/**
 * lib/nexus-chat/lecturas-server.ts — lo que el chat de Nexus LEE de una cuenta, además de las lecturas del registro
 * (las tareas, las notas y los siguientes pasos). SERVER-ONLY.
 *
 * Cada lectura tiene la forma de una operación de la capa (`OperacionQueLee`, lib/operaciones/tipos.ts): nombre, para
 * qué sirve, qué pide (zod) y `leer`. Así el chat las trata igual que las del registro, y si algún día la pantalla las
 * necesita, se mudan al registro sin cambiarlas. Todas reciben `clientId` y el chat se lo pone (./alcance.ts): el modelo
 * nunca elige la empresa.
 *
 * ⛔ Invariante 1: las reuniones salen SOLO por la regla única de pertenencia (`whereBelongsToClient` de
 * lib/sessions/project-sources.ts, el chokepoint) y la búsqueda por lib/busqueda (que usa la misma). La memoria, por el
 * cargador único, declarado como lector «nexus-chat» en lib/memoria/consumidores.ts (alcance interno: lo lee una persona
 * del equipo, nunca el cliente). Nada de acá lee facturación, Partner, rentabilidad ni salarios.
 */
import "server-only";
import { z } from "zod";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { memoriaDeLaCuenta, memoriaDelProyecto } from "@/lib/memoria";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { recortarTranscripcion } from "@/lib/sessions/recortar-transcripcion";
import { resumenDeReunion } from "@/lib/contexto/material-cronograma";
import { buscarEnReunionesDe } from "@/lib/busqueda/buscar-server";
import { personasYTicketsDe } from "@/lib/contactos/lectura-server";
import { comunicacionesDeLaCuenta, unaComunicacion } from "@/lib/comunicaciones/lectura-server";
import { proyectoNavegableWhere } from "@/lib/projects/scope";
import { exigirCliente, type ContextoDeNexus, type ExtrasDeNexus } from "@/lib/operaciones/contexto-server";
import type { ContextoDeOperacion, OperacionQueLee } from "@/lib/operaciones/tipos";
import { fmtDia } from "@/lib/cs/formato";

/** El contexto de una lectura del chat: el de la capa, más si la persona ve los montos de los negocios (Ventas). */
export type ContextoDelChat = ContextoDeOperacion<TeamMember, ExtrasDeNexus & { veMontos: boolean }>;

const idDeCliente = z.string().min(1).max(60);
const MAX_REUNIONES = 15;
const TOPE_DE_UNA_REUNION = 20_000;

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export const LEER_MEMORIA_DE_LA_CUENTA: OperacionQueLee<{ clientId: string }, unknown, ContextoDeNexus> = {
  nombre: "cuenta.memoria",
  paraQue:
    "Lee lo que Nexus ya sabe de la empresa: la ficha (lo confirmado y lo propuesto), las personas, los procesos, la historia de sus proyectos, lo fuera de alcance y lo aprendido en la preventa. Úsala cuando necesites el detalle completo.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const m = await memoriaDeLaCuenta(e.clientId, { lector: "nexus-chat" });
    return m.texto || "Nexus todavía no sabe nada de esta empresa más allá de su nombre.";
  },
};

export const LEER_MEMORIA_DEL_PROYECTO: OperacionQueLee<{ clientId: string; projectId: string }, unknown, ContextoDeNexus> = {
  nombre: "proyecto.memoria",
  paraQue:
    "Lee lo que Nexus sabe de UN proyecto de la empresa (su id sale de la lista de proyectos del contexto): lo que dejó cada reunión, los compromisos abiertos, las desviaciones del cronograma y los resultados.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente, projectId: z.string().min(1).max(60) }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const p = await prisma.project.findFirst({ where: { id: e.projectId, clientId: e.clientId }, select: { id: true } });
    if (!p) return "Ese proyecto no es de esta empresa.";
    const m = await memoriaDelProyecto(p.id, { lector: "nexus-chat" });
    return m.texto || "Nexus todavía no sabe nada de este proyecto.";
  },
};

export const LEER_REUNIONES_RECIENTES: OperacionQueLee<{ clientId: string }, unknown, ContextoDeNexus> = {
  nombre: "reuniones.recientes",
  paraQue:
    "Lista las reuniones más recientes con la empresa que ya ocurrieron: id, título, día, si fue con el cliente o puertas adentro, y si tiene transcripción o minuta. Con el id se lee una entera.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const ahora = ctx.ahora;
    const [filas, dominios] = await Promise.all([
      prisma.firefliesSession.findMany({
        where: { ...whereBelongsToClient(e.clientId), date: { lte: ahora } },
        orderBy: { date: "desc" },
        take: MAX_REUNIONES,
        select: { id: true, title: true, date: true, participants: true, organizerEmail: true, transcript: true, minute: { select: { status: true } } },
      }),
      dominiosDeLaCasa(),
    ]);
    return filas.map((f) => ({
      id: f.id,
      titulo: f.title,
      dia: iso(f.date),
      sala: esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail }, dominios) ? "puertas adentro" : "con el cliente",
      transcripcion: !!f.transcript?.trim(),
      minuta: f.minute ? (f.minute.status === "DRAFT" ? "en borrador" : "revisada") : "sin minuta",
    }));
  },
};

export const BUSCAR_EN_LAS_REUNIONES: OperacionQueLee<{ clientId: string; buscar: string }, unknown, ContextoDeNexus> = {
  nombre: "reuniones.buscar",
  paraQue:
    "Busca palabras o «una frase entre comillas» en lo que se dijo en las reuniones con la empresa. Devuelve la frase tal cual, quién la dijo, en qué reunión y qué día.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente, buscar: z.string().trim().min(3, "Busca algo de al menos 3 letras.").max(200) }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const r = await buscarEnReunionesDe(e.clientId, e.buscar, 12);
    if (r === null) return "La búsqueda en las reuniones todavía no está disponible.";
    if (!r.length) return "No encontré nada con eso en las reuniones con esta empresa.";
    return r.map((x) => ({ reunion: x.sessionId, titulo: x.titulo, dia: x.fecha.slice(0, 10), quien: x.hablante, dijo: x.texto }));
  },
};

export const LEER_UNA_REUNION: OperacionQueLee<{ clientId: string; reunionId: string }, unknown, ContextoDeNexus> = {
  nombre: "reunion.leer",
  paraQue:
    "Lee UNA reunión de la empresa entera, por su id: sus notas o su minuta y la transcripción (si es muy larga, el principio y el final). Úsala cuando necesites lo que se dijo de verdad.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente, reunionId: z.string().min(1).max(200) }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const ahora = ctx.ahora;
    // ⛔ Por la regla única: una reunión de otra empresa no existe para este chat.
    const f = await prisma.firefliesSession.findFirst({
      where: { id: e.reunionId, ...whereBelongsToClient(e.clientId), date: { lte: ahora } },
      select: {
        title: true,
        date: true,
        participants: true,
        organizerEmail: true,
        summary: true,
        transcript: true,
        minute: { select: { summary: true, decisions: true, agreements: true, risks: true, status: true } },
      },
    });
    if (!f) return "Esa reunión no es de esta empresa, todavía no ocurrió o no existe.";
    const dominios = await dominiosDeLaCasa();
    const sala = esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail }, dominios) ? "PUERTAS ADENTRO" : "CON EL CLIENTE";
    const notas = resumenDeReunion({ title: f.title, summary: f.summary, minuta: f.minute }).texto;
    return `«${f.title}» · ${fmtDia(iso(f.date) ?? "")} · ${sala}\n\n${recortarTranscripcion(notas, f.transcript ?? "", TOPE_DE_UNA_REUNION) || "Sin notas ni transcripción."}`;
  },
};

export const LEER_NEGOCIOS: OperacionQueLee<{ clientId: string }, unknown, ContextoDelChat> = {
  nombre: "cuenta.negocios",
  paraQue: "Lee los negocios abiertos de la empresa en HubSpot: nombre, etapa, para cuándo cierra, el siguiente paso de HubSpot y la última y la próxima actividad.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    if (!modeloDisponible(prisma.negocioAbierto)) return [];
    const filas = await prisma.negocioAbierto
      .findMany({
        where: { clientId: e.clientId, abierto: true },
        orderBy: [{ fechaCierre: { sort: "asc", nulls: "last" } }],
        take: 12,
        select: { id: true, nombre: true, etapaLabel: true, pipelineLabel: true, fechaCierre: true, monto: true, moneda: true, siguientePasoHubspot: true, ultimaActividadAt: true, proximaActividadAt: true },
      })
      .catch((err) => {
        if (esquemaDesactualizado(err)) return [];
        throw err;
      });
    return filas.map((n) => ({
      id: n.id,
      nombre: n.nombre,
      pipeline: n.pipelineLabel,
      etapa: n.etapaLabel,
      cierra: iso(n.fechaCierre),
      // El monto, solo para quien ve Ventas (la misma regla que el resumen antes de una reunión).
      ...(ctx.extras.veMontos && n.monto != null ? { monto: `${n.moneda} ${Number(n.monto.toString()).toLocaleString("es-CR", { maximumFractionDigits: 0 })}` } : {}),
      siguientePasoEnHubspot: n.siguientePasoHubspot,
      ultimaActividad: iso(n.ultimaActividadAt),
      proximaActividad: iso(n.proximaActividadAt),
    }));
  },
};

export const LEER_PERSONAS: OperacionQueLee<{ clientId: string }, unknown, ContextoDeNexus> = {
  nombre: "cuenta.personas",
  paraQue: "Lee las personas de la empresa (los contactos de HubSpot, con su cargo y su última reunión) y sus tickets abiertos y cerrados hace poco.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const r = await personasYTicketsDe(e.clientId, ctx.ahora);
    if (!r.hayTabla) return "La copia de contactos y tickets de HubSpot todavía no está disponible.";
    return {
      personas: r.personas.slice(0, 25).map((p) => ({ nombre: p.nombre, correo: p.email, cargo: p.cargo, ultimaReunion: p.ultimaReunion?.slice(0, 10) ?? null, reunionesEn90Dias: p.reuniones90 })),
      tickets: r.tickets.slice(0, 15).map((t) => ({ asunto: t.asunto, etapa: t.etapa, abierto: t.abierto, prioridad: t.prioridad, creado: t.creado?.slice(0, 10) ?? null })),
    };
  },
};

export const LEER_COMUNICACIONES: OperacionQueLee<{ clientId: string; id?: string; tipo?: "correo" | "nota" | "llamada" | "reunion" }, unknown, ContextoDeNexus> = {
  nombre: "comunicaciones.recientes",
  paraQue:
    "Lista los correos (enviados y recibidos), las notas, las llamadas y las reuniones (el resumen de su grabación) con la empresa que quedaron en HubSpot, los más nuevos primero: id, qué es, día, quién lo escribió, asunto y el comienzo del texto. Con el id, lee uno entero. Úsala para saber qué se le prometió o se le dijo al cliente fuera de las reuniones.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente, id: z.string().min(1).max(60).optional(), tipo: z.enum(["correo", "nota", "llamada", "reunion"]).optional() }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    if (e.id) {
      const c = await unaComunicacion(e.clientId, e.id);
      if (!c) return "Esa comunicación no es de esta empresa o no existe.";
      const cabeza = `${c.rotulo} · ${fmtDia(c.ocurrioAt.slice(0, 10))}${c.autor ? ` · ${c.autor}` : ""}`;
      return [cabeza, c.asunto ? `«${c.asunto}»` : null, "", c.texto || "Sin texto."].filter((x) => x !== null).join("\n");
    }
    const lista = await comunicacionesDeLaCuenta(e.clientId, { tipo: e.tipo });
    if (!lista.length) return "No hay correos, notas ni llamadas de esta empresa en HubSpot (o la copia todavía no corrió).";
    return lista.map((c) => ({ id: c.id, que: c.rotulo, dia: c.ocurrioAt.slice(0, 10), quien: c.autor, asunto: c.asunto, comienzo: c.texto.slice(0, 300) }));
  },
};

/** Las lecturas propias del chat, en el orden en que se le ofrecen al modelo. */
export const LECTURAS_DEL_CHAT: readonly OperacionQueLee<never, unknown, ContextoDelChat>[] = [
  LEER_MEMORIA_DE_LA_CUENTA,
  LEER_MEMORIA_DEL_PROYECTO,
  LEER_REUNIONES_RECIENTES,
  BUSCAR_EN_LAS_REUNIONES,
  LEER_UNA_REUNION,
  LEER_NEGOCIOS,
  LEER_PERSONAS,
  LEER_COMUNICACIONES,
] as unknown as readonly OperacionQueLee<never, unknown, ContextoDelChat>[];

/** Lo que se carga una vez por turno y va en el contexto cacheado: la empresa, sus proyectos y su memoria. */
export interface LoQueSeSabeDeLaCuenta {
  cuenta: { id: string; nombre: string; tipo: string };
  proyectos: Array<{ id: string; nombre: string; estado: string | null }>;
  memoria: string;
}

export async function loQueSeSabeDeLaCuenta(clientId: string): Promise<LoQueSeSabeDeLaCuenta | null> {
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, kind: true } });
  if (!c) return null;
  const [proyectos, memoria] = await Promise.all([
    prisma.project.findMany({ where: proyectoNavegableWhere({ clientId }), select: { id: true, name: true, status: true }, orderBy: { createdAt: "desc" }, take: 12 }),
    memoriaDeLaCuenta(clientId, { lector: "nexus-chat" }).catch((err) => {
      console.error("[nexus-chat] no se pudo leer la memoria de la cuenta:", err instanceof Error ? err.message : err);
      return { texto: "", partes: [] };
    }),
  ]);
  return {
    cuenta: { id: c.id, nombre: c.name, tipo: String(c.kind) },
    proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.name, estado: p.status ? String(p.status) : null })),
    memoria: memoria.texto,
  };
}
