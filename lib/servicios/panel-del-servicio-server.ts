import "server-only";

/**
 * lib/servicios/panel-del-servicio-server.ts — lee lo que pide el panel derecho del Resumen de un proyecto recurrente
 * (lib/servicios/panel-del-servicio.ts): el cronograma y las reuniones agendadas con la empresa.
 *
 * El calendario se lee del CSE del proyecto y de quien mira, como mucho cada 2 minutos por proyecto y persona (instancia
 * única, RUNBOOK invariante 1). Nunca pasa por la sincronización de Meet.
 */
import { prisma } from "@/lib/db/prisma";
import { agendadasConLaEmpresa } from "@/lib/exploraciones/calendario";
import { resolvePipeline } from "@/lib/projects/kind";
import {
  hitosDelCronograma,
  loQueDebeElCliente,
  sesionesFijas,
  type DeudaDelCliente,
  type HitoDelPanel,
  type SesionFija,
} from "./panel-del-servicio";

export interface PanelDelServicio {
  debe: { items: DeudaDelCliente[]; total: number };
  hitos: HitoDelPanel[];
  sesiones: { fijas: SesionFija[]; aviso: string | null };
}

const MINUTO = 60_000;
const memoria = new Map<string, { en: number; datos: PanelDelServicio["sesiones"] }>();

async function sesionesDelProyecto(clientId: string, calendarios: string[], clave: string, ahora: Date) {
  const guardada = memoria.get(clave);
  if (guardada && ahora.getTime() - guardada.en < 2 * MINUTO) return guardada.datos;
  const r = await agendadasConLaEmpresa(clientId, calendarios, ahora).catch((e) => {
    console.error("[panel-del-servicio] no se pudo leer el calendario", e instanceof Error ? e.message : e);
    return { agendadas: [], aviso: "No se pudo leer el calendario. Inténtalo de nuevo en un momento." };
  });
  const datos = { fijas: sesionesFijas(r.agendadas), aviso: r.aviso };
  memoria.set(clave, { en: ahora.getTime(), datos });
  if (memoria.size > 300) memoria.delete(memoria.keys().next().value as string);
  return datos;
}

export async function cargarPanelDelServicio(projectId: string, quienMira: string | null, ahora = new Date()): Promise<PanelDelServicio | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      clientId: true,
      hubspotOwnerEmail: true,
      hubspotPipelineId: true,
      timeline: {
        select: {
          anchorStartDate: true,
          phases: {
            orderBy: { order: "asc" },
            select: {
              name: true,
              order: true,
              durationWeeks: true,
              startWeek: true,
              status: true,
              tasks: { orderBy: [{ weekIndex: "asc" }, { order: "asc" }], select: { title: true, weekIndex: true, status: true, party: true } },
            },
          },
        },
      },
    },
  });
  // null también si el proyecto no es de un servicio recurrente.
  if (!p || !resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente) return null;
  const anchor = p.timeline?.anchorStartDate ? p.timeline.anchorStartDate.toISOString().slice(0, 10) : null;
  const fases = (p.timeline?.phases ?? []).map((f) => ({ ...f, status: String(f.status), tasks: f.tasks.map((t) => ({ ...t, status: String(t.status), party: t.party ?? null })) }));
  const calendarios = [p.hubspotOwnerEmail, quienMira].filter((c): c is string => !!c);
  const sesiones = calendarios.length
    ? await sesionesDelProyecto(p.clientId, calendarios, `${projectId}|${(quienMira ?? "").toLowerCase()}`, ahora)
    : { fijas: [], aviso: null };
  return {
    debe: loQueDebeElCliente(fases, anchor, ahora),
    hitos: hitosDelCronograma(fases, anchor, ahora),
    sesiones,
  };
}
