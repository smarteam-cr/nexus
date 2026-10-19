/**
 * lib/comunicaciones/sin-agendar-server.ts — los datos del aviso de las 48 horas (la regla es pura:
 * lib/comunicaciones/sin-agendar.ts). SERVER-ONLY, solo lectura.
 *
 * Para cada compromiso con el cliente sin tomar (de un correo o de una reunión), lo que hace falta para decidir si es una
 * reunión que nadie agendó:
 *   · si hay una reunión planeada de la cuenta en Tareas (clase «reunion», abierta, por venir);
 *   · las reuniones con la cuenta que ya ocurrieron desde que se prometió (por el chokepoint de pertenencia,
 *     `whereBelongsToClient`: invariante 1);
 *   · los eventos de la cuenta en el calendario de quien la lleva (el resolvedor único `cuentaDelEvento`, de UNA empresa).
 * Sin las cuentas de exclientes confirmados (`CLIENTE_NO_EXCLIENTE_WHERE`).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { calendarioDeLosProximosDias } from "@/lib/mi-dia/calendario-server";
import { cuentaDelEvento } from "@/lib/mi-dia/agenda";
import { CLIENTE_NO_EXCLIENTE_WHERE } from "@/lib/cs/exclientes";
import { cseDeLaCuenta } from "@/lib/lecturas/personas";
import { compromisoSinAgendar, DIAS_QUE_AVISA, esReunionPrometida, HORAS_PARA_AVISAR, type AvisoDeCompromiso, type CompromisoParaAvisar, type LoQueSabemosDeLaCuenta } from "./sin-agendar";

export interface CompromisoSinAgendar {
  tarea: CompromisoParaAvisar;
  empresa: string;
  aviso: AvisoDeCompromiso;
}

/**
 * Los compromisos que piden el aviso hoy, en las cuentas `clientIds` (o en todas las de clientes, si no se dice).
 * `calendarioDe`: de quién se lee el calendario de cada cuenta (por defecto, el CSE de la cuenta).
 */
export async function compromisosSinAgendar(
  o: { clientIds?: readonly string[]; calendarioDe?: (clientId: string) => Promise<string | null>; ahora?: Date } = {},
): Promise<CompromisoSinAgendar[]> {
  const ahora = o.ahora ?? new Date();
  if (o.clientIds && !o.clientIds.length) return [];
  const filas = await prisma.tarea.findMany({
    where: {
      archivadaAt: null,
      privada: false,
      clientId: o.clientIds ? { in: [...o.clientIds] } : { not: null },
      client: CLIENTE_NO_EXCLIENTE_WHERE,
      estado: { in: ["propuesta", "pendiente"] },
      createdAt: { gte: new Date(+ahora - DIAS_QUE_AVISA * 86_400_000), lte: new Date(+ahora - HORAS_PARA_AVISAR * 3_600_000) },
      OR: [{ origen: "correo" }, { origenId: { startsWith: "l:", contains: ":seg-" } }],
    },
    select: {
      id: true,
      numero: true,
      titulo: true,
      estado: true,
      responsableEmail: true,
      origen: true,
      origenId: true,
      createdAt: true,
      venceEl: true,
      clientId: true,
      sessionId: true,
      client: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const compromisos = filas.map((f) => ({
    tarea: {
      tareaId: f.id,
      numero: f.numero,
      titulo: f.titulo,
      estado: f.estado,
      responsableEmail: f.responsableEmail,
      origen: f.origen,
      origenId: f.origenId,
      creadaAt: f.createdAt,
      venceEl: f.venceEl ? f.venceEl.toISOString().slice(0, 10) : null,
      clientId: f.clientId!,
      sessionId: f.sessionId,
    } satisfies CompromisoParaAvisar,
    empresa: f.client?.name ?? "La cuenta",
  }));
  // Solo se mira el calendario y las reuniones de las cuentas con una reunión prometida.
  const conReunion = [...new Set(compromisos.filter((c) => esReunionPrometida(c.tarea.titulo)).map((c) => c.tarea.clientId))];
  const cuentas = new Map<string, LoQueSabemosDeLaCuenta>();
  await Promise.all(
    conReunion.map(async (clientId) => {
      const desde = new Date(Math.min(...compromisos.filter((c) => c.tarea.clientId === clientId).map((c) => +c.tarea.creadaAt)));
      const [planeada, hechas, quien] = await Promise.all([
        prisma.tarea.count({ where: { clientId, clase: "reunion", archivadaAt: null, estado: { in: ["propuesta", "pendiente", "en_curso"] }, reunionInicio: { gte: ahora } } }),
        prisma.firefliesSession.findMany({ where: { ...whereBelongsToClient(clientId), date: { gte: desde, lte: ahora } }, select: { date: true }, take: 5 }),
        o.calendarioDe ? o.calendarioDe(clientId) : cseDeLaCuenta(clientId),
      ]);
      const cal = quien ? await calendarioDeLosProximosDias(quien, ahora) : null;
      cuentas.set(clientId, {
        reunionPlaneada: planeada > 0,
        reunionesHechas: hechas.map((h) => h.date),
        eventosProximos: cal ? cal.reuniones.filter((r) => cuentaDelEvento(r) === clientId).map((r) => new Date(r.inicio)) : null,
      });
    }),
  );
  const sinInfo: LoQueSabemosDeLaCuenta = { reunionPlaneada: false, reunionesHechas: [], eventosProximos: null };
  return compromisos.flatMap((c) => {
    const aviso = compromisoSinAgendar(c.tarea, cuentas.get(c.tarea.clientId) ?? sinInfo, ahora);
    return aviso ? [{ ...c, aviso }] : [];
  });
}
