/**
 * lib/handoff/congelado-server.ts — lo que LEE y ESCRIBE el congelado del handoff (etapa 3b). Las reglas viven
 * puras en lib/handoff/congelado.ts.
 *
 * Todo resuelve primero de QUIÉN es el handoff (`resolverDuenioDelHandoff`): un desarrollo que cuelga del
 * handoff de otro proyecto se congela y se lee en el canvas del dueño (hoy la redirección está apagada por
 * celda, ver lib/handoff/duenio.ts, y el dueño es siempre el propio proyecto).
 *
 * ⚠ Ni `leerCongelado` ni `ultimoCambioDelHandoff` tiran: una tabla que falta o una lectura que falla vuelven al
 * comportamiento de antes del congelado (sin congelar, la fecha de la última generación). Congelar tampoco tira:
 * devuelve por qué no congeló.
 */
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { fotoDelDocumento, guardarVersionDelDocumento, leerSecciones } from "@/lib/canvas/versiones";
import { soloOcurridas } from "@/lib/sessions/ocurridas";
import type { ProjectSourceSession } from "@/lib/sessions/project-sources";
import { resolverDuenioDelHandoff } from "./duenio";
import { computeHandoffFeeding } from "./feeding";
import {
  ORIGEN_DE_LA_FOTO,
  SIN_CONGELAR,
  TIPOS_DEL_CONGELADO,
  TIPO_CONGELADO,
  TIPO_REHECHO,
  contenidoComparable,
  estadoDelHandoff,
  llevaMarcaDeSugerencia,
  motivoDelHito,
  ultimoCambioReal,
  type EstadoDelHandoff,
  type ViaDelCongelado,
} from "./congelado";

/** El canvas del handoff que le corresponde al proyecto (el del dueño). */
async function canvasDelHandoff(projectId: string) {
  const { ownerProjectId } = await resolverDuenioDelHandoff(projectId);
  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: ownerProjectId, ...canvasOf("handoff") },
    select: { id: true, versionDocumento: true, contentUpdatedAt: true },
  });
  return canvas ? { ...canvas, ownerProjectId } : null;
}

async function estadoDelCanvas(canvasId: string): Promise<EstadoDelHandoff> {
  if (!modeloDisponible(prisma.hitoDeDocumento)) return SIN_CONGELAR;
  const hitos = await prisma.hitoDeDocumento.findMany({
    where: { canvasId, tipo: { in: [...TIPOS_DEL_CONGELADO] } },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { tipo: true, createdAt: true, porEmail: true, motivo: true, fotoId: true },
  });
  return estadoDelHandoff(hitos);
}

/** ¿Está congelado el handoff de este proyecto? Nunca tira: ante cualquier duda, sin congelar. */
export async function leerCongelado(projectId: string): Promise<EstadoDelHandoff> {
  try {
    const canvas = await canvasDelHandoff(projectId);
    if (!canvas) return SIN_CONGELAR;
    return await estadoDelCanvas(canvas.id);
  } catch (e) {
    console.error(`[handoff/congelado] no se pudo leer el congelado de ${projectId}:`, e instanceof Error ? e.message : e);
    return SIN_CONGELAR;
  }
}

export type ResultadoDelCongelado =
  | { ok: true; nuevo: boolean; estado: EstadoDelHandoff }
  | { ok: false; motivo: "sin-documento" | "sin-contenido" | "sin-foto" | "falta-la-tabla" | "error" };

/**
 * CONGELA el handoff: foto protegida + hito «congelado» (con la vía en el texto). Idempotente: si ya está
 * congelado y la vía no es «rehacer», no hace nada (`nuevo: false`). Sin contenido no congela.
 *
 * Con la vía «rehacer» (al terminar «Rehacer desde cero»), antes de la foto se van las sugerencias que
 * nadie revisó —eran sobre el handoff anterior y la generación nueva ya leyó esas reuniones— y se escribe el
 * hito «rehecho» con el motivo, un milisegundo antes que el «congelado» nuevo.
 *
 * La toma del documento es con la fila del canvas bloqueada (`FOR UPDATE`) y releyendo los hitos: dos
 * «Aplicar» a la vez dejan un solo congelado.
 */
export async function congelarHandoff(
  projectId: string,
  opts: { via: ViaDelCongelado; porEmail: string | null; motivo?: string | null },
): Promise<ResultadoDelCongelado> {
  try {
    if (!modeloDisponible(prisma.hitoDeDocumento) || !modeloDisponible(prisma.versionDeDocumento)) {
      return { ok: false, motivo: "falta-la-tabla" };
    }
    const canvas = await canvasDelHandoff(projectId);
    if (!canvas) return { ok: false, motivo: "sin-documento" };
    const rehacer = opts.via === "rehacer";

    const antes = await estadoDelCanvas(canvas.id);
    if (antes.congelado && !rehacer) return { ok: true, nuevo: false, estado: antes };

    if (rehacer) await quitarSugerenciasPendientes(canvas.id);

    const foto = await guardarVersionDelDocumento(canvas.id, {
      origen: ORIGEN_DE_LA_FOTO[opts.via],
      creadaPor: opts.porEmail,
      protegida: true,
    });
    if (!foto.id) return { ok: false, motivo: foto.motivo === "vacío" ? "sin-contenido" : "sin-foto" };
    const fotoId = foto.id;

    const escrito = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ProjectCanvas" WHERE "id" = ${canvas.id} FOR UPDATE`;
      const hitos = await tx.hitoDeDocumento.findMany({
        where: { canvasId: canvas.id, tipo: { in: [...TIPOS_DEL_CONGELADO] } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { tipo: true, createdAt: true, porEmail: true, motivo: true, fotoId: true },
      });
      if (estadoDelHandoff(hitos).congelado && !rehacer) return false;
      const doc = await tx.projectCanvas.findUnique({ where: { id: canvas.id }, select: { versionDocumento: true } });
      const version = doc?.versionDocumento ?? canvas.versionDocumento;
      const ahora = new Date();
      if (rehacer) {
        await tx.hitoDeDocumento.create({
          data: {
            canvasId: canvas.id,
            version,
            tipo: TIPO_REHECHO,
            porEmail: opts.porEmail,
            motivo: (opts.motivo ?? "").trim().slice(0, 1000) || null,
            createdAt: ahora,
          },
        });
      }
      await tx.hitoDeDocumento.create({
        data: {
          canvasId: canvas.id,
          version,
          tipo: TIPO_CONGELADO,
          porEmail: opts.porEmail,
          fotoId,
          motivo: motivoDelHito(opts.via),
          // Con «rehacer», un milisegundo después del «rehecho»: el último manda y no puede haber empate.
          createdAt: rehacer ? new Date(ahora.getTime() + 1) : ahora,
        },
      });
      return true;
    });

    if (!escrito) {
      // Otro se adelantó. La foto recién tomada no es evidencia de nada: si nadie la usa, vuelve a ser común.
      if (!foto.motivo) {
        const usada = await prisma.hitoDeDocumento.findFirst({ where: { fotoId }, select: { id: true } }).catch(() => ({ id: "?" }));
        if (!usada) {
          await prisma.versionDeDocumento
            .update({ where: { id: fotoId }, data: { protegida: false, origen: "Iba a congelarse, pero ya estaba congelado" } })
            .catch(() => {});
        }
      }
      return { ok: true, nuevo: false, estado: await estadoDelCanvas(canvas.id) };
    }
    return { ok: true, nuevo: true, estado: await estadoDelCanvas(canvas.id) };
  } catch (e) {
    console.error(`[handoff/congelado] no se pudo congelar el handoff de ${projectId} (${opts.via}):`, e instanceof Error ? e.message : e);
    return { ok: false, motivo: "error" };
  }
}

/** Las sugerencias que nadie revisó (borrador + marca). Se leen y se borran por id: la marca vive en un Json. */
export async function idsDeSugerenciasPendientes(canvasId: string): Promise<string[]> {
  const borradores = await prisma.canvasBlock.findMany({
    where: { status: "DRAFT", source: "AGENT", section: { canvasId } },
    select: { id: true, data: true },
  });
  return borradores.filter((b) => llevaMarcaDeSugerencia(b.data)).map((b) => b.id);
}

async function quitarSugerenciasPendientes(canvasId: string): Promise<void> {
  const ids = await idsDeSugerenciasPendientes(canvasId);
  if (ids.length) await prisma.canvasBlock.deleteMany({ where: { id: { in: ids } } });
}

/**
 * Lo que espera revisión en el handoff: los bloques en borrador (lo mismo que cuenta la franja «El agente
 * propone N bloques nuevos» del documento; una sugerencia que alguien retocó sin usarla sigue en borrador).
 */
export async function contarSugerenciasPendientes(canvasId: string): Promise<number> {
  try {
    return await prisma.canvasBlock.count({ where: { status: "DRAFT", section: { canvasId } } });
  } catch {
    return 0;
  }
}

/**
 * Cuándo cambió por última vez lo que dice el handoff (el aviso de «desactualizado» del requerimiento técnico,
 * en app/api/projects/[projectId]/canvases y en la ficha del cliente). Con el handoff congelado,
 * `handoffGeneratedAt` deja de moverse: cuenta también la última edición posterior al congelado, si de verdad
 * cambió lo que dice (se compara con la foto, sin los borradores). Nunca tira: ante un error, la generación.
 */
export async function ultimoCambioDelHandoff(projectId: string): Promise<Date | null> {
  let generadoAt: Date | null = null;
  try {
    const { ownerProjectId } = await resolverDuenioDelHandoff(projectId);
    const [p, canvas] = await Promise.all([
      prisma.project.findUnique({ where: { id: ownerProjectId }, select: { handoffGeneratedAt: true } }),
      prisma.projectCanvas.findFirst({
        where: { projectId: ownerProjectId, ...canvasOf("handoff") },
        select: { id: true, contentUpdatedAt: true },
      }),
    ]);
    generadoAt = p?.handoffGeneratedAt ?? null;
    if (!canvas) return generadoAt;
    const estado = await estadoDelCanvas(canvas.id);
    if (!estado.congelado || !estado.at) return generadoAt;
    const contenidoAt = canvas.contentUpdatedAt;
    // Lo barato primero: sin una edición posterior al congelado no hace falta mirar la foto.
    if (!contenidoAt || contenidoAt.getTime() <= new Date(estado.at).getTime()) return generadoAt;
    const cambio = await cambioDesdeLaFoto(canvas.id, estado.fotoId);
    return ultimoCambioReal({ generadoAt, congeladoAt: estado.at, contenidoAt, cambioDesdeElCongelado: cambio });
  } catch (e) {
    console.error(`[handoff/congelado] no se pudo leer el último cambio del handoff de ${projectId}:`, e instanceof Error ? e.message : e);
    return generadoAt;
  }
}

/** ¿Lo que dice hoy el handoff (sin borradores) es distinto de la foto del congelado? Sin foto, se asume que sí. */
async function cambioDesdeLaFoto(canvasId: string, fotoId: string | null): Promise<boolean> {
  if (!fotoId) return true;
  const foto = await prisma.versionDeDocumento.findUnique({ where: { id: fotoId }, select: { secciones: true } });
  if (!foto) return true;
  const hoy = await fotoDelDocumento(canvasId);
  return contenidoComparable(leerSecciones(foto.secciones)) !== contenidoComparable(hoy);
}

export interface FuenteManualNueva {
  id: string;
  title: string | null;
  content: string;
  createdAt: Date;
}

/**
 * Lo que llegó DESPUÉS del congelado: las reuniones que alimentan el handoff (la misma política que la
 * generación, `computeHandoffFeeding`, por el chokepoint de sesiones) con fecha posterior al congelado y que
 * ya ocurrieron, y las fuentes manuales cargadas después. «Buscar lo nuevo» solo lee esto; sin nada, no se
 * llama a la IA.
 */
export async function materialDesdeElCongelado(
  projectId: string,
  desde: Date,
): Promise<{ reuniones: ProjectSourceSession[]; fuentesManuales: FuenteManualNueva[] }> {
  const ahora = new Date();
  const [feeding, fuentesManuales] = await Promise.all([
    computeHandoffFeeding(projectId),
    prisma.handoffSource.findMany({
      where: { projectId, deletedAt: null, createdAt: { gt: desde } },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true, content: true, createdAt: true },
    }),
  ]);
  const reuniones = soloOcurridas(
    feeding.filter((s) => s.date > desde.getTime()),
    ahora,
  ).sort((a, b) => a.date - b.date);
  return { reuniones, fuentesManuales };
}
