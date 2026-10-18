/**
 * lib/mi-dia/servicio-server.ts — las reglas de servicio con datos (ficha D, 2026-10-17). SERVER-ONLY, solo lectura.
 *
 * Para cada cuenta: su acción de la semana (Tareas, cualquier equipo, sin lo «Solo para mí»), su reunión de los
 * próximos 8 días (el calendario de quien la lleva y las reuniones planeadas en Tareas), su última reunión con el
 * cliente y quiénes del cliente estuvieron (para «Agendar» con los invitados). La regla es pura: lib/mi-dia/servicio.ts.
 *
 * ⚠ El calendario se lee con el permiso de siempre (`calendar.readonly`). Una reunión cuenta para una cuenta solo si el
 * evento es de UNA empresa: con alguien de varias empresas (HubSpot, una agencia) no se sabe de cuál es, y contarla
 * para todas diría que tienen reunión cuando no (la misma regla de la agenda, invariante 1). Se guarda dos minutos por
 * persona: lo pide el inicio en cada visita y el número del menú cada minuto y medio.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { eventosProximos } from "@/lib/google/agenda-de-la-empresa";
import { tareasDisponible } from "@/lib/tareas/servidor";
import { agendaDelDia, type EventoConEnlaces } from "./agenda";
import { mapasDeEmpresas } from "./empresas-server";
import { DIAS_PARA_LA_REUNION } from "./constantes";
import { estadoDeServicio, ventanaDeLaSemana, type EstadoDeServicio, type ReunionDeLaCuenta, type TareaDeLaCuenta } from "./servicio";

export interface CuentaConServicio {
  clientId: string;
  empresa: string;
  /** Quién la lleva (su calendario dice si hay reunión). null = nadie. */
  llevaEmail: string | null;
}

export interface ServicioDeLaCuenta extends EstadoDeServicio {
  empresa: string;
  /** ISO: la última reunión con el cliente que ya ocurrió. */
  ultimaReunion: string | null;
  /** Los correos del cliente de esa reunión (para agendar la próxima con ellos). */
  invitados: string[];
  /** false = el calendario de quien la lleva no se pudo leer: «sin reunión» puede no ser cierto. */
  calendarioLeido: boolean;
  /** Todas las reuniones con la cuenta de los próximos 8 días, en orden (la primera es `reunion`). */
  proximas: ReunionDeLaCuenta[];
}

/** Quien mira: las tareas de un espacio privado donde no está no cuentan ni se nombran (lib/tareas/visibilidad.ts). */
export interface QuienMiraElServicio {
  email: string;
  esSuperAdmin: boolean;
}

const VIDA_MS = 2 * 60_000;
const DIA_MS = 86_400_000;
const calendarios = new Map<string, { at: number; reuniones: ReunionDeLaCuenta[] | null }>();
/**
 * La lectura en curso de cada calendario. «Para ti» mide (`medirParaTi`) y arma las cuentas del inicio
 * (`cuentasDelInicio`) en paralelo sobre la misma persona: sin esto, eran dos llamadas a Google Calendar por visita.
 * Mismo patrón que `mapasDeEmpresas` (./empresas-server.ts).
 */
const enVuelo = new Map<string, Promise<ReunionDeLaCuenta[] | null>>();

const diaCR = (d: Date) => new Date(d.getTime() - 6 * 3_600_000).toISOString().slice(0, 10);
const comoDia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

async function leerCalendario(k: string, ahora: Date): Promise<ReunionDeLaCuenta[] | null> {
  const eventos = await eventosProximos(k, { semanas: DIAS_PARA_LA_REUNION / 7, ahora });
  let reuniones: ReunionDeLaCuenta[] | null = null;
  if (eventos.ok) {
    const mapas = await mapasDeEmpresas(ahora);
    reuniones = agendaDelDia(eventos.datos as EventoConEnlaces[], mapas)
      .filter((r) => r.empresas.length === 1)
      .map((r) => ({ clientId: r.empresas[0], titulo: r.titulo, inicio: r.inicio, fuente: "calendario" as const }));
  }
  calendarios.set(k, { at: ahora.getTime(), reuniones });
  return reuniones;
}

/** Las reuniones con una sola empresa en los próximos 8 días del calendario de `email`. null = no se pudo leer. */
function reunionesDelCalendario(email: string, ahora: Date): Promise<ReunionDeLaCuenta[] | null> {
  const k = email.toLowerCase();
  const g = calendarios.get(k);
  if (g && ahora.getTime() - g.at < VIDA_MS) return Promise.resolve(g.reuniones);
  const enCurso = enVuelo.get(k);
  if (enCurso) return enCurso;
  const p = leerCalendario(k, ahora).finally(() => {
    enVuelo.delete(k);
  });
  enVuelo.set(k, p);
  return p;
}

/**
 * Una tarea de un proyecto de un espacio LIBRE de «solo miembros» donde quien mira no está. Es el mismo criterio que
 * `deEspacioPrivadoAjeno` de lib/tareas/visibilidad.ts (no está exportado): si cambia allá, cambia acá.
 */
function deEspacioPrivadoAjeno(yo: string): Prisma.TareaWhereInput {
  return {
    proyecto: {
      espacio: { tipo: "libre", visibilidad: "miembros", miembros: { none: { email: yo } } },
    },
  };
}

/**
 * Las tareas que pueden ser la acción de la semana o una reunión planeada que viene: con su reunión, su vencimiento o
 * su semana dentro de la ventana. Es un SUPERCONJUNTO (con un día de margen a cada lado por la hora de Costa Rica): la
 * regla pura (`accionDeLaSemana`) decide igual que antes; acá solo se deja de traer lo que no puede entrar.
 */
function enLaVentana(hoyISO: string, ahora: Date, hasta: Date): Prisma.TareaWhereInput {
  const v = ventanaDeLaSemana(hoyISO);
  const desde = new Date(Date.parse(`${v.desde}T00:00:00Z`) - DIA_MS);
  const finSemana = new Date(Date.parse(`${v.hasta}T00:00:00Z`) + 2 * DIA_MS);
  const finReuniones = new Date(Math.max(finSemana.getTime(), hasta.getTime() + DIA_MS));
  const inicioReuniones = new Date(Math.min(desde.getTime(), ahora.getTime()));
  return {
    OR: [
      { reunionInicio: { gte: inicioReuniones, lt: finReuniones } },
      { venceEl: { gte: desde, lt: finSemana } },
      { semana: { gte: desde, lt: finSemana } },
    ],
  };
}

/** La última reunión que ya ocurrió de cada cuenta, con quiénes estuvieron. */
async function ultimasReuniones(ids: readonly string[], ahora: Date): Promise<{ resolvedClientId: string | null; date: Date; participants: string[] }[]> {
  const maximos = await prisma.firefliesSession.groupBy({
    by: ["resolvedClientId"],
    where: { resolvedClientId: { in: [...ids] }, date: { lte: ahora } },
    _max: { date: true },
  });
  const pares = maximos.flatMap((m) => (m.resolvedClientId && m._max.date ? [{ resolvedClientId: m.resolvedClientId, date: m._max.date }] : []));
  if (pares.length === 0) return [];
  const filas = await prisma.firefliesSession.findMany({ where: { OR: pares }, select: { resolvedClientId: true, date: true, participants: true } });
  // Dos reuniones a la misma hora: una sola por cuenta.
  const por = new Map(filas.map((f) => [f.resolvedClientId, f]));
  return [...por.values()];
}

/** El estado de servicio de esas cuentas, por id. */
export async function servicioDeLasCuentas(
  cuentas: readonly CuentaConServicio[],
  o: { ahora: Date; hoyISO: string; quienMira: QuienMiraElServicio },
): Promise<Map<string, ServicioDeLaCuenta>> {
  const out = new Map<string, ServicioDeLaCuenta>();
  const ahora = o.ahora;
  const ids = [...new Set(cuentas.map((c) => c.clientId))];
  if (ids.length === 0) return out;
  const hasta = new Date(o.ahora.getTime() + DIAS_PARA_LA_REUNION * DIA_MS);
  const personas = [...new Set(cuentas.flatMap((c) => (c.llevaEmail ? [c.llevaEmail.toLowerCase()] : [])))];
  const yo = o.quienMira.email.toLowerCase();

  const [filas, calendariosLeidos, ultimas, internos] = await Promise.all([
    (await tareasDisponible())
      ? prisma.tarea.findMany({
          where: {
            archivadaAt: null,
            estado: { in: ["pendiente", "en_curso"] },
            privada: false,
            clientId: { in: ids },
            AND: [enLaVentana(o.hoyISO, ahora, hasta), ...(o.quienMira.esSuperAdmin ? [] : [{ NOT: deEspacioPrivadoAjeno(yo) }])],
          },
          select: {
            id: true,
            numero: true,
            titulo: true,
            clientId: true,
            estado: true,
            privada: true,
            venceEl: true,
            semana: true,
            clase: true,
            reunionInicio: true,
            equipo: true,
            responsableEmail: true,
          },
          // Con la ventana, son pocas por cuenta; el orden hace que un recorte (si alguna vez llega) sea estable.
          orderBy: [{ numero: "asc" }],
          take: 10_000,
        })
      : Promise.resolve([]),
    Promise.all(personas.map(async (p) => [p, await reunionesDelCalendario(p, o.ahora).catch(() => null)] as const)),
    // La última reunión de cada cuenta (por la fuente única de dueño, `resolvedClientId`). En dos pasos: `distinct` de
    // Prisma deduplica en memoria y traería todas las reuniones de cada cuenta.
    ultimasReuniones(ids, ahora),
    mapasDeEmpresas(o.ahora).then((m) => m.internos),
  ]);

  const tareas: TareaDeLaCuenta[] = filas.flatMap((t) =>
    t.clientId
      ? [
          {
            id: t.id,
            numero: t.numero,
            titulo: t.titulo,
            clientId: t.clientId,
            estado: t.estado,
            privada: t.privada,
            venceEl: comoDia(t.venceEl),
            semana: comoDia(t.semana),
            reunionDia: t.clase === "reunion" && t.reunionInicio ? diaCR(t.reunionInicio) : null,
            equipo: t.equipo,
            responsableEmail: t.responsableEmail,
          },
        ]
      : [],
  );
  // Las reuniones planeadas en Tareas que vienen.
  const planeadas: ReunionDeLaCuenta[] = filas.flatMap((t) =>
    t.clase === "reunion" && t.reunionInicio && t.clientId && t.reunionInicio >= o.ahora && t.reunionInicio <= hasta
      ? [{ clientId: t.clientId, titulo: t.titulo, inicio: t.reunionInicio.toISOString(), fuente: "tarea" as const }]
      : [],
  );
  const delCalendario = new Map(calendariosLeidos);
  const ultimaDe = new Map(ultimas.map((u) => [u.resolvedClientId as string, u]));

  for (const c of cuentas) {
    if (out.has(c.clientId)) continue;
    const lleva = c.llevaEmail?.toLowerCase() ?? null;
    const cal = lleva ? delCalendario.get(lleva) : null;
    const reuniones = [...planeadas, ...(cal ?? [])];
    const estado = estadoDeServicio(c.clientId, tareas, reuniones, o);
    const calendarioLeido = !lleva || cal !== null;
    // Sin el calendario no se sabe si hay reunión: no se dice que falta (se dice que no se pudo leer).
    const falta = calendarioLeido ? estado.falta : estado.falta.filter((f) => f !== "reunion");
    const u = ultimaDe.get(c.clientId);
    out.set(c.clientId, {
      ...estado,
      falta,
      empresa: c.empresa,
      ultimaReunion: u ? u.date.toISOString() : null,
      invitados: (u?.participants ?? []).map((p) => p.trim().toLowerCase()).filter((p) => p.includes("@") && !internos.has(p.split("@")[1] ?? "")),
      calendarioLeido,
      proximas: reuniones
        .filter((r) => {
          const t = Date.parse(r.inicio);
          return r.clientId === c.clientId && Number.isFinite(t) && t >= ahora.getTime() && t <= hasta.getTime();
        })
        .sort((a, b) => a.inicio.localeCompare(b.inicio)),
    });
  }
  return out;
}
