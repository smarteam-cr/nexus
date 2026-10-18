/**
 * lib/mi-dia/resumen-server.ts — el resumen de una cuenta antes de una reunión (etapa 4c de docs/mi-dia-plan.md).
 * Solo lectura, sin IA: cada dato sale de su lugar y dice de dónde salió.
 *
 *   · quién viene: los invitados del evento, con nombre y cargo de los contactos de ESTE cliente (lib/contactos);
 *   · la última vez: la última reunión con el cliente (por la regla única de pertenencia, sin las de puertas adentro),
 *     con su minuta o sus notas;
 *   · lo pendiente de los dos lados: los compromisos abiertos de sus proyectos, por la puerta de los agentes
 *     (lib/tareas/para-agentes.ts: sin la cita, el contexto, las notas ni lo privado);
 *   · el siguiente paso de cada equipo (lib/siguiente-paso);
 *   · las alertas abiertas (solo para quien lidera Customer Success, como en «Lo que dejó esta reunión»);
 *   · los tickets abiertos y los negocios abiertos de HubSpot (el monto, solo para quien ve Ventas).
 *
 * Quien lo pide ya pasó por `requireAccessToClient`: la página lo exige antes de llamar acá.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { releerEventos } from "@/lib/google/agenda-de-la-empresa";
import { whereBelongsToClient, belongsToClient } from "@/lib/sessions/project-sources";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { compromisosAbiertosParaAgentes, type TareaParaAgente } from "@/lib/tareas/para-agentes";
import { pasosDeLaCuenta } from "@/lib/siguiente-paso/lectura-server";
import type { PasosDeLaCuenta } from "@/lib/siguiente-paso/reglas";
import { invitadosDe, personasYTicketsDe, type TicketDeLaCuenta } from "@/lib/contactos/lectura-server";
import type { Invitado } from "@/lib/contactos/reglas";
import { loQueSeDijoDe, type ResultadoDeBusqueda } from "@/lib/busqueda/buscar-server";
import { palabrasDelTitulo } from "@/lib/busqueda/turnos";
import { CLIENTE_NO_EXCLIENTE_WHERE } from "@/lib/cs/exclientes";

/** Cuántas reuniones se miran hacia atrás para encontrar la última con algo que leer. */
const REUNIONES_A_MIRAR = 12;
const PROYECTOS_A_MIRAR = 6;

export interface InvitadoDelResumen extends Invitado {
  /** ISO: la última reunión con el cliente en la que estuvo (solo los del cliente). */
  ultimaReunion: string | null;
}

export interface UltimaReunion {
  sessionId: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  /** El resumen de la minuta o, sin minuta, las notas de Gemini. */
  resumen: string | null;
  acuerdos: string[];
  /** De dónde salió: la minuta revisada, la minuta en borrador o las notas. */
  fuente: "minuta revisada" | "minuta en borrador" | "notas de la reunión";
}

export interface PendienteDelResumen extends TareaParaAgente {
  proyecto: string;
}

export interface ResumenDeLaReunion {
  cliente: { id: string; nombre: string };
  /** El evento del calendario, si se pudo leer. */
  reunion: { id: string; titulo: string | null; inicio: string; fin: string | null } | null;
  /** Por qué no se leyó el evento («sin-google» en local, «sin-permiso», «noExiste», «cancelado»). */
  reunionNoLeida: string | null;
  invitados: InvitadoDelResumen[];
  ultimaVez: UltimaReunion | null;
  pendientes: PendienteDelResumen[];
  pasos: PasosDeLaCuenta | null;
  /** null = quien mira no lidera Customer Success: no las ve. */
  alertas: { titulo: string; razon: string; severidad: string }[] | null;
  tickets: TicketDeLaCuenta[];
  negocios: { nombre: string; etapa: string | null; cierre: string | null; monto: string | null }[];
  /** Lo que se dijo antes de lo que dice el título de la reunión (la búsqueda en las transcripciones), con las palabras. */
  loQueSeDijo: { palabras: string[]; frases: ResultadoDeBusqueda[] };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function montoLegible(monto: { toString(): string } | null, moneda: string): string | null {
  if (monto == null) return null;
  const n = Number(monto.toString());
  if (!Number.isFinite(n)) return null;
  return `${moneda === "USD" ? "US$" : `${moneda} `}${n.toLocaleString("es-CR", { maximumFractionDigits: 0 })}`;
}

const fechaCorta = (d: Date) => {
  const cr = new Date(d.getTime() - 6 * 3_600_000);
  return `${cr.getUTCDate()} ${MESES[cr.getUTCMonth()]}`;
};

export async function resumenParaLaReunion(o: {
  clientId: string;
  eventoId: string | null;
  /** El correo de quien lo pide: de su calendario se lee el evento. */
  email: string;
  veAlertas: boolean;
  veMontos: boolean;
  ahora?: Date;
}): Promise<ResumenDeLaReunion | null> {
  const ahora = o.ahora ?? new Date();
  const cliente = await prisma.client.findUnique({ where: { id: o.clientId }, select: { id: true, name: true } });
  if (!cliente) return null;

  const [evento, reuniones, dominios, proyectos, pasos, personas, alertas, negocios] = await Promise.all([
    o.eventoId ? releerEventos(o.email, [o.eventoId]) : Promise.resolve(null),
    // Solo las que ya ocurrieron: una agendada no es «la última vez».
    prisma.firefliesSession.findMany({
      where: { ...whereBelongsToClient(o.clientId), date: { lte: ahora } },
      orderBy: { date: "desc" },
      take: REUNIONES_A_MIRAR * 2,
      select: {
        id: true,
        title: true,
        date: true,
        participants: true,
        organizerEmail: true,
        resolvedClientId: true,
        manualClientId: true,
        summary: true,
        minute: { select: { summary: true, agreements: true, status: true } },
      },
    }),
    dominiosDeLaCasa(),
    prisma.project.findMany({ where: proyectoClasificableWhere({ clientId: o.clientId }), select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: PROYECTOS_A_MIRAR }),
    pasosDeLaCuenta(o.clientId).catch(() => null),
    personasYTicketsDe(o.clientId, ahora).catch(() => null),
    o.veAlertas
      ? prisma.csAlert.findMany({ where: { clientId: o.clientId, status: "OPEN", client: CLIENTE_NO_EXCLIENTE_WHERE }, orderBy
: { createdAt: "desc" }, take: 8, select: { title: true, reason: true, severity: true } })
      : Promise.resolve(null),
    modeloDisponible(prisma.negocioAbierto)
      ? prisma.negocioAbierto
          .findMany({ where: { clientId: o.clientId, abierto: true }, orderBy: [{ fechaCierre: { sort: "asc", nulls: "last" } }], take: 6, select: { nombre: true, etapaLabel: true, fechaCierre: true, monto: true, moneda: true } })
          .catch((e) => {
            if (esquemaDesactualizado(e)) return [];
            throw e;
          })
      : Promise.resolve([]),
  ]);

  // El evento.
  let reunion: ResumenDeLaReunion["reunion"] = null;
  let reunionNoLeida: string | null = o.eventoId ? null : "sin-evento";
  let correosDelEvento: string[] = [];
  if (evento) {
    if (!evento.ok) reunionNoLeida = evento.motivo;
    else {
      const e = evento.datos[0];
      if (!e || e.estado !== "ok") reunionNoLeida = e?.estado ?? "noExiste";
      else {
        reunion = { id: e.id, titulo: e.titulo, inicio: e.inicio, fin: e.fin };
        correosDelEvento = e.invitados;
      }
    }
  }

  // Quién viene, con su última reunión.
  const ultimaPorCorreo = new Map((personas?.personas ?? []).flatMap((p) => (p.email ? [[p.email, p.ultimaReunion] as const] : [])));
  const invitados: InvitadoDelResumen[] = (await invitadosDe(correosDelEvento, o.clientId).catch(() => [])).map((i) => ({
    ...i,
    ultimaReunion: i.lado === "cliente" ? (ultimaPorCorreo.get(i.email) ?? null) : null,
  }));

  // La última vez: la más reciente con el cliente (no de puertas adentro) que dejó algo que leer.
  let ultimaVez: UltimaReunion | null = null;
  for (const r of reuniones) {
    if (!belongsToClient(r, o.clientId)) continue;
    if (esReunionDePuertasAdentro({ participants: r.participants, organizerEmail: r.organizerEmail }, dominios)) continue;
    const notas = (r.summary as { overview?: unknown } | null)?.overview;
    const textoNotas = typeof notas === "string" && notas.trim() ? notas.trim() : null;
    if (!r.minute && !textoNotas) continue;
    const acuerdos = Array.isArray(r.minute?.agreements)
      ? (r.minute.agreements as unknown[]).flatMap((a) => (a && typeof a === "object" && typeof (a as { text?: unknown }).text === "string" ? [(a as { text: string }).text] : []))
      : [];
    ultimaVez = {
      sessionId: r.id,
      titulo: r.title,
      fecha: r.date.toISOString(),
      resumen: r.minute?.summary?.trim() || textoNotas,
      acuerdos: acuerdos.slice(0, 6),
      fuente: r.minute ? (r.minute.status === "DRAFT" ? "minuta en borrador" : "minuta revisada") : "notas de la reunión",
    };
    break;
  }

  // Lo que se dijo antes de lo que dice el título (la frase tal cual, de la transcripción).
  const palabras = reunion?.titulo ? palabrasDelTitulo(reunion.titulo, cliente.name) : [];
  const frases = await loQueSeDijoDe(o.clientId, palabras, 3).catch(() => []);

  // Lo pendiente de los dos lados, por proyecto.
  const pendientes: PendienteDelResumen[] = (
    await Promise.all(
      proyectos.map(async (p) => (await compromisosAbiertosParaAgentes(p.id, 8).catch(() => [])).map((t) => ({ ...t, proyecto: p.name }))),
    )
  ).flat();

  return {
    cliente: { id: cliente.id, nombre: cliente.name },
    reunion,
    reunionNoLeida,
    invitados,
    ultimaVez,
    pendientes,
    pasos,
    alertas: alertas ? alertas.map((a) => ({ titulo: a.title, razon: a.reason, severidad: a.severity })) : null,
    tickets: (personas?.tickets ?? []).filter((t) => t.abierto),
    negocios: negocios.map((n) => ({
      nombre: n.nombre,
      etapa: n.etapaLabel,
      cierre: n.fechaCierre ? fechaCorta(n.fechaCierre) : null,
      monto: o.veMontos ? montoLegible(n.monto, n.moneda) : null,
    })),
    loQueSeDijo: { palabras, frases },
  };
}
