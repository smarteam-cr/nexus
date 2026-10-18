/**
 * lib/rentabilidad/fuentes-de-horas-server.ts — las dos fuentes de horas que se suman al margen: las reuniones del
 * calendario que no están en Meet y las tareas internas hechas (iniciativa C de docs/roadmap.md). SERVER-ONLY.
 *
 * Solo lee. El calendario se lee con el permiso de siempre (`calendar.readonly`, lib/google/agenda-de-la-empresa.ts),
 * mes por mes y persona por persona, y lo leído se guarda 15 minutos en memoria (RUNBOOK, invariante #1: un proceso). Lo
 * pide solo el cálculo EN VIVO de un mes: un mes con foto no vuelve a leer el calendario.
 *
 * Qué cuenta y qué no lo deciden los módulos puros: lib/rentabilidad/horas-del-calendario.ts (las 7 reglas que evitan
 * contar dos veces) y lib/rentabilidad/horas-de-tareas.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { agendaDisponible, eventosDelMes } from "@/lib/google/agenda-de-la-empresa";
import { mapasDeEmpresas } from "@/lib/mi-dia/empresas-server";
import type { EventoConEnlaces } from "@/lib/mi-dia/agenda";
import type { TipoDeEmpresa } from "@/lib/carga/reuniones";
import { rangoDelMes, type RangoDelPeriodo } from "./margen";
import { reunionesDelCalendario, type CalendarioDeUnaPersona, type LecturaDelCalendario } from "./horas-del-calendario";
import { horasDeTareas, leerBloques, type HorasDeTareas } from "./horas-de-tareas";
import type { LecturaDeFuentes } from "./tipos";

const VIDA_MS = 15 * 60_000;
/** Cuántos calendarios se leen a la vez: Google limita por usuario y el pool del proceso es uno solo. */
const EN_PARALELO = 4;

const guardados = new Map<string, { at: number; eventos: EventoConEnlaces[] | null }>();

async function mesDelCalendario(email: string, mes: string): Promise<EventoConEnlaces[] | null> {
  const k = `${email}|${mes}`;
  const g = guardados.get(k);
  if (g && Date.now() - g.at < VIDA_MS) return g.eventos;
  const r = rangoDelMes(mes);
  const res = await eventosDelMes(email, r.desde, r.hasta);
  const eventos = res.ok ? (res.datos as EventoConEnlaces[]) : null;
  guardados.set(k, { at: Date.now(), eventos });
  return eventos;
}

async function enTandas<T, R>(items: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

export interface PersonaDelCalendario {
  email: string;
  nombre: string;
  createdAt: Date;
  deactivatedAt: Date | null;
}

/** Las reuniones con clientes del calendario que no están en Meet, en los meses del rango. */
export async function leerReunionesDelCalendario(
  personas: readonly PersonaDelCalendario[],
  rango: RangoDelPeriodo,
): Promise<{ lectura: LecturaDelCalendario; estado: LecturaDeFuentes["calendario"]["estado"]; personasLeidas: number; personasSinLeer: string[] }> {
  const vacia: LecturaDelCalendario = {
    reuniones: [],
    cuenta: { leidos: 0, contados: 0, conMeet: 0, yaEnUnaSesion: 0, agregadasAMano: 0, sinUnaEmpresa: 0, bloquesDeTareas: 0 },
  };
  if (!agendaDisponible()) return { lectura: vacia, estado: "sin-google", personasLeidas: 0, personasSinLeer: [] };

  // Quien estuvo en el equipo en el rango, con su correo de la casa (las cuentas de prueba no tienen agenda).
  const enElRango = personas.filter(
    (p) => p.email.includes("@") && p.createdAt < rango.hasta && (!p.deactivatedAt || p.deactivatedAt > rango.desde) && !/\btest\b/i.test(p.nombre),
  );
  const [mapas, clientes, sesiones] = await Promise.all([
    mapasDeEmpresas(),
    prisma.client.findMany({ where: { kind: "CLIENTE" }, select: { id: true, name: true, kind: true } }),
    prisma.firefliesSession.findMany({
      where: { date: { gte: new Date(+rango.desde - 86_400_000), lt: new Date(+rango.hasta + 86_400_000) } },
      select: { googleEventId: true, source: true, date: true, resolvedClientId: true, manualClientId: true },
    }),
  ]);

  const leidos = await enTandas(enElRango, EN_PARALELO, async (p) => {
    const email = p.email.trim().toLowerCase();
    const meses = await Promise.all(rango.meses.map((m) => mesDelCalendario(email, m)));
    if (meses.some((m) => m === null)) return { email, nombre: p.nombre, eventos: null };
    return { email, nombre: p.nombre, eventos: meses.flatMap((m) => m ?? []) };
  });
  const calendarios: CalendarioDeUnaPersona[] = leidos.filter((l) => l.eventos !== null).map((l) => ({ email: l.email, eventos: l.eventos! }));
  const sinLeer = leidos.filter((l) => l.eventos === null).map((l) => l.nombre);

  const lectura = reunionesDelCalendario(calendarios, {
    porCorreo: mapas.porCorreo,
    porDominio: mapas.porDominio,
    internos: mapas.internos,
    empresas: new Map(clientes.map((c) => [c.id, { nombre: c.name, tipo: c.kind as TipoDeEmpresa }])),
    eventosDeSesiones: new Set(sesiones.map((s) => s.googleEventId).filter((x): x is string => !!x)),
    manuales: sesiones
      .filter((s) => s.source === "manual" && (s.resolvedClientId ?? s.manualClientId))
      .map((s) => ({ clienteId: (s.resolvedClientId ?? s.manualClientId)!, inicio: s.date })),
  });
  return { lectura, estado: "leido", personasLeidas: calendarios.length, personasSinLeer: sinLeer };
}

/** Las horas de las tareas internas hechas de cuentas de la cartera (`kind = CLIENTE`), en el rango. */
export async function leerHorasDeTareas(rango: RangoDelPeriodo): Promise<HorasDeTareas> {
  const tareas = await prisma.tarea.findMany({
    where: {
      estado: "hecha",
      archivadaAt: null,
      client: { kind: "CLIENTE" },
      // Hecha en el rango, o con un bloque que pudo caer en el rango (se termina de filtrar por el inicio del bloque).
      completadaAt: { gte: new Date(+rango.desde - 120 * 86_400_000), lt: new Date(+rango.hasta + 120 * 86_400_000) },
    },
    select: { id: true, clientId: true, responsableEmail: true, clase: true, estado: true, completadaAt: true, minutosEstimados: true, agendaBloques: true },
  });
  return horasDeTareas(
    tareas.map((t) => ({
      id: t.id,
      clienteId: t.clientId!,
      responsableEmail: t.responsableEmail,
      clase: t.clase,
      estado: t.estado,
      completadaAt: t.completadaAt,
      minutosEstimados: t.minutosEstimados,
      bloques: leerBloques(t.agendaBloques),
    })),
    rango,
  );
}
