/**
 * lib/canvas/historial-del-documento-server.ts — el historial de versiones de un CANVAS (handoff, kickoff, diagnóstico,
 * planificación, requerimiento técnico, entrega, copias y documentos de la empresa), con el popup común (21 nov;
 * DECISIONS «Historial de versiones»). También la propuesta comercial (cada «Propuesta N» es un canvas). SERVIDOR.
 *
 * Qué ve el cliente depende de cómo se comparte cada documento:
 *   · con una FOTO al publicar (kickoff, planificación, entrega, documentos de la empresa, propuesta): la última versión
 *     guardada al publicar (`publicada`), mientras siga compartido;
 *   · el diagnóstico comparte su última versión PRESENTADA;
 *   · el Requerimiento técnico se ve VIVO: lo que ve el cliente es la actual.
 * En el handoff, las corridas de Nexus de antes de la primera versión guardada (el viejo «Historial» de corridas, que se
 * reemplaza) entran como «Solo para leer»: así lo decidió Elías el 2026-08-08 y no se restauran.
 */
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { whereCorridasDeDocumento } from "@/lib/agents/historial-corridas";
import { filasDelHistorial } from "@/lib/versiones/guardar-server";
import { armarHistorial, tipoDeLaFila, type FilaDeVersion } from "@/lib/versiones/historial";
import { conNombres, type VersionConNombre } from "@/lib/versiones/nombres-server";
import { fotoDelDocumento, huellaDe, tieneContenido, type SeccionDeVersion } from "./versiones";

/** El campo de `Project` que dice si la pieza está compartida, y cómo la ve el cliente. */
const COMPARTIDO: Record<string, { flag: "kickoffPublishedAt" | "diagnosticoPublishedAt" | "planificacionPublishedAt" | "entregaPublishedAt" | "desarrolloPublishedAt"; modo: "foto" | "presentada" | "viva" }> = {
  kickoff: { flag: "kickoffPublishedAt", modo: "foto" },
  diagnosis: { flag: "diagnosticoPublishedAt", modo: "presentada" },
  planning: { flag: "planificacionPublishedAt", modo: "foto" },
  delivery: { flag: "entregaPublishedAt", modo: "foto" },
  "tech-requirements": { flag: "desarrolloPublishedAt", modo: "viva" },
};

/** El prefijo de las corridas viejas del handoff en la lista: no son filas de VersionDeDocumento. */
export const PREFIJO_DE_CORRIDA = "corrida:";

export interface HistorialDelCanvas {
  versiones: VersionConNombre[];
  /** El documento como está hoy: la vista previa marca lo distinto contra esto. */
  actual: SeccionDeVersion[];
  /** Compartido EN VIVO (el Requerimiento técnico): el cliente ve el cambio en cuanto se usa una versión. */
  enVivo: boolean;
}

async function comoLoVeElCliente(canvas: {
  id: string;
  slug: string | null;
  projectId: string | null;
  businessCase: { publishedAt: Date | null; id: string } | null;
  publishedSnapshotAt: Date | null;
  accesoDeLaEmpresa: { revokedAt: Date | null } | null;
  project: Record<string, Date | null> | null;
}, filas: readonly FilaDeVersion[]): Promise<{ publicado: boolean; delCliente?: string | "actual" | null }> {
  // La propuesta comercial: el cliente ve la última que se publicó, de cualquiera de sus propuestas («Propuesta 1, 2…»).
  if (canvas.businessCase) {
    if (!canvas.businessCase.publishedAt) return { publicado: false };
    const ultima = await prisma.versionDeDocumento.findFirst({
      where: { publicada: true, canvas: { businessCaseId: canvas.businessCase.id } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, canvasId: true },
    });
    return { publicado: true, delCliente: ultima?.canvasId === canvas.id ? ultima.id : null };
  }
  const c = canvas.slug ? COMPARTIDO[canvas.slug] : undefined;
  if (c && canvas.project) {
    const publicado = !!canvas.project[c.flag];
    if (c.modo === "viva") return { publicado, delCliente: "actual" };
    if (c.modo === "presentada") return { publicado, delCliente: filas.find((f) => tipoDeLaFila(f.tipo, f.origen) === "presentado")?.id ?? null };
    return { publicado: publicado && !!canvas.publishedSnapshotAt };
  }
  // Un documento de la empresa (o una copia con su enlace): compartido mientras el enlace no se revoque.
  return { publicado: !!canvas.publishedSnapshotAt && !!canvas.accesoDeLaEmpresa && !canvas.accesoDeLaEmpresa.revokedAt };
}

export async function historialDelCanvas(canvasId: string): Promise<HistorialDelCanvas | null> {
  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: {
      id: true,
      slug: true,
      projectId: true,
      publishedSnapshotAt: true,
      accesoDeLaEmpresa: { select: { revokedAt: true } },
      businessCase: { select: { id: true, publishedAt: true } },
      project: {
        select: { kickoffPublishedAt: true, diagnosticoPublishedAt: true, planificacionPublishedAt: true, entregaPublishedAt: true, desarrolloPublishedAt: true },
      },
    },
  });
  if (!canvas) return null;
  const actual = await fotoDelDocumento(canvasId);
  const huellaActual = tieneContenido(actual) ? huellaDe(actual) : null;
  const filas: FilaDeVersion[] = modeloDisponible(prisma.versionDeDocumento) ? await filasDelHistorial({ canvasId }) : [];

  /* Las corridas del handoff, solo para leer: las terminadas de antes de la primera versión guardada (después, cada una
     ya quedó como versión), y las que FALLARON, siempre (el historial de corridas era el único lugar donde quedaba el
     motivo, y no dejan versión). */
  const soloLectura = new Set<string>();
  if (canvas.slug === "handoff" && canvas.projectId) {
    const primera = filas.length ? filas[filas.length - 1].createdAt : null;
    const corridas = await prisma.agentRun.findMany({
      where: {
        AND: [
          whereCorridasDeDocumento(canvas.projectId, "handoff"),
          { OR: [{ status: "DONE", ...(primera ? { createdAt: { lt: new Date(primera) } } : {}) }, { status: "ERROR" }] },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, createdAt: true, triggeredByEmail: true, status: true },
    });
    for (const r of corridas) {
      const id = `${PREFIJO_DE_CORRIDA}${r.id}`;
      soloLectura.add(id);
      filas.push({
        id,
        tipo: "ia",
        origen:
          r.status === "ERROR"
            ? "Esta corrida de Nexus falló: abre la vista previa para leer el motivo. No dejó versión."
            : "Lo que devolvió Nexus esa vez, antes de que se guardaran versiones. Solo para leer.",
        creadaPor: r.triggeredByEmail,
        createdAt: r.createdAt.toISOString(),
        huella: id,
        publicada: false,
      });
    }
  }

  const cliente = await comoLoVeElCliente({ ...canvas, project: canvas.project as Record<string, Date | null> | null }, filas);
  const versiones = armarHistorial(filas, { huellaActual, soloLectura, ...cliente });
  return { versiones: await conNombres(versiones), actual, enVivo: cliente.publicado && cliente.delCliente === "actual" };
}
