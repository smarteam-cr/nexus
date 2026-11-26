/**
 * lib/timeline/historial-del-cronograma-server.ts — el historial de versiones del CRONOGRAMA, con el popup común
 * (21 nov; DECISIONS «Historial de versiones»). SERVIDOR. Solo lee: no guarda nada nuevo.
 *
 *   · Las versiones son las fotos que ya existían: cada `TimelineChange` con fases (aplicar lo de la IA o del chat es
 *     «Rehecho con IA»; el «Subir», «Publicado»; lo demás, «Editado», con su motivo) y cada `TimelineBaseline` («Congelado»:
 *     el plan aprobado, que se congela al aprobar o al publicar y NO es lo que ve el cliente).
 *   · La actual es el cronograma vivo; «Lo que ve el cliente», la versión más nueva igual a la foto publicada
 *     (`ProjectTimeline.publishedSnapshot`, la misma que lee la vista del cliente) mientras siga compartido.
 *   · Por ahora SOLO PARA LEER: «Usar esta versión» en el cronograma tiene que llegar como propuesta a la barra del Gantt,
 *     sin tocar el avance marcado, y queda como paso aparte. Lo dice la pantalla.
 */
import { prisma } from "@/lib/db/prisma";
import { armarHistorial, huellaDeContenido, type FilaDeVersion } from "@/lib/versiones/historial";
import { conNombres, type VersionConNombre } from "@/lib/versiones/nombres-server";
import { cronogramaDeLaFoto, type CronogramaDeLaVersion } from "./historial-del-cronograma";

const PREFIJO_CAMBIO = "cambio:";
const PREFIJO_BASE = "base:";

export interface HistorialDelCronograma {
  versiones: VersionConNombre[];
  /** El cronograma como está hoy (la vista previa marca lo distinto contra esto). null: no tiene fases. */
  actual: CronogramaDeLaVersion | null;
}

async function vivo(timelineId: string, anchorStartDate: Date | null): Promise<CronogramaDeLaVersion | null> {
  const phases = await prisma.timelinePhase.findMany({
    where: { timelineId },
    orderBy: { order: "asc" },
    select: { name: true, order: true, durationWeeks: true, startWeek: true, sessionCount: true, tasks: { select: { title: true, weekIndex: true, order: true } } },
  });
  if (!phases.length) return null;
  return cronogramaDeLaFoto({ anchorStartDate, phases });
}

export async function historialDelCronograma(projectId: string): Promise<HistorialDelCronograma | null> {
  const t = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, anchorStartDate: true, publishedSnapshot: true, project: { select: { timelinePublishedAt: true } } },
  });
  if (!t) return null;
  const [cambios, bases, actual] = await Promise.all([
    prisma.timelineChange.findMany({
      where: { timelineId: t.id, kind: { in: ["MANUAL", "AI_ASSIST", "REANCHOR"] } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, kind: true, reason: true, changedByEmail: true, createdAt: true, snapshot: true },
    }),
    prisma.timelineBaseline.findMany({
      where: { timelineId: t.id },
      orderBy: { capturedAt: "desc" },
      take: 30,
      select: { id: true, version: true, publishedByEmail: true, capturedAt: true, snapshot: true, isActive: true },
    }),
    vivo(t.id, t.anchorStartDate),
  ]);

  const publicada = cronogramaDeLaFoto(t.publishedSnapshot);
  const huellaDelCliente = publicada ? huellaDeContenido(publicada) : null;
  const filas: FilaDeVersion[] = [];
  for (const c of cambios) {
    const forma = cronogramaDeLaFoto(c.snapshot);
    if (!forma) continue; // el autoguardado de la fecha de arranque solo guarda la fecha
    filas.push({
      id: `${PREFIJO_CAMBIO}${c.id}`,
      // El «Subir» deja su cambio con «Publicación al cliente» (o el motivo que escribió quien publicó, que no se distingue).
      tipo: c.kind === "AI_ASSIST" ? "ia" : /^Publicaci[oó]n/i.test(c.reason) ? "publicado" : "edicion",
      origen: c.reason,
      creadaPor: c.changedByEmail,
      createdAt: c.createdAt.toISOString(),
      huella: huellaDeContenido(forma),
      publicada: false,
    });
  }
  for (const b of bases) {
    const forma = cronogramaDeLaFoto(b.snapshot);
    if (!forma) continue;
    filas.push({
      id: `${PREFIJO_BASE}${b.id}`,
      tipo: "congelado",
      origen: `Plan aprobado (versión ${b.version}): la promesa contra la que se mide el avance.`,
      creadaPor: b.publishedByEmail,
      createdAt: b.capturedAt.toISOString(),
      huella: huellaDeContenido(forma),
      publicada: false,
    });
  }
  // Las 30 más nuevas, como en los demás documentos.
  filas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ultimas = filas.slice(0, 30);
  const versiones = armarHistorial(ultimas, {
    huellaActual: actual ? huellaDeContenido(actual) : null,
    publicado: !!t.project?.timelinePublishedAt,
    delCliente: huellaDelCliente ? (ultimas.find((f) => f.huella === huellaDelCliente)?.id ?? null) : null,
  });
  return { versiones: await conNombres(versiones), actual };
}

/** Una versión del cronograma (la vista previa). null: no es de este proyecto. */
export async function cronogramaDeLaVersion(projectId: string, versionId: string): Promise<CronogramaDeLaVersion | null> {
  if (versionId.startsWith(PREFIJO_CAMBIO)) {
    const c = await prisma.timelineChange.findFirst({
      where: { id: versionId.slice(PREFIJO_CAMBIO.length), timeline: { projectId } },
      select: { snapshot: true },
    });
    return c ? cronogramaDeLaFoto(c.snapshot) : null;
  }
  if (versionId.startsWith(PREFIJO_BASE)) {
    const b = await prisma.timelineBaseline.findFirst({
      where: { id: versionId.slice(PREFIJO_BASE.length), timeline: { projectId } },
      select: { snapshot: true },
    });
    return b ? cronogramaDeLaFoto(b.snapshot) : null;
  }
  return null;
}
