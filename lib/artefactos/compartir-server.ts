/**
 * lib/artefactos/compartir-server.ts — EL ENLACE PROPIO DE CADA DOCUMENTO DE UN PROYECTO (etapa V4 de
 * docs/artefactos-plan.md, 2026-10-29). SERVIDOR.
 *
 * Elías, 29 oct: «Cada copia, con su propio enlace. Muchas veces ese enlace lo usa Customer Success para compartir la
 * pantalla desde ahí.» Vale para cualquier documento de un proyecto cuyo tipo lee el cliente: cada copia y también el
 * documento de siempre de su tipo (que conserva además su superficie de siempre, con la contraseña del proyecto y su
 * «Subir al cliente»: eso no cambia).
 *
 * Mismo mecanismo que los documentos de la empresa (`AccesoAlDocumento`, la URL es el secreto: 256 bits, sin contraseña,
 * `/external/documento/[token]`), con una diferencia a propósito: muestra el documento VIVO, sin publicar (ver
 * lib/external/artefacto-view.ts). Compartir crea el enlace; dejar de compartir lo revoca; volver a compartir crea uno
 * NUEVO (el viejo pudo circular a quien ya no debía verlo). Archivar una copia lo revoca también (quien archiva llama a
 * `dejarDeCompartirArtefacto`).
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { enlaceDelDocumento } from "@/lib/clients/documentos-de-la-empresa-compartir";
import { tipoDelDocumento } from "./copias";
import { tipoCompartible } from "./secciones-del-enlace";

export interface EstadoDelEnlace {
  /** La URL que se comparte, o null si no se comparte. */
  enlace: string | null;
  /** Desde cuándo abre ese enlace (ISO). */
  desde: string | null;
  /** La última vez que alguien lo abrió (ISO). */
  ultimaVista: string | null;
}

export class ErrorDelEnlace extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

const SIN_ENLACE: EstadoDelEnlace = { enlace: null, desde: null, ultimaVista: null };

export async function estadoDelEnlace(canvasId: string): Promise<EstadoDelEnlace> {
  const a = await prisma.accesoAlDocumento.findUnique({
    where: { canvasId },
    select: { accessToken: true, revokedAt: true, enabledAt: true, lastUsedAt: true },
  });
  if (!a || a.revokedAt) return SIN_ENLACE;
  return { enlace: enlaceDelDocumento(a.accessToken), desde: a.enabledAt.toISOString(), ultimaVista: a.lastUsedAt?.toISOString() ?? null };
}

/**
 * El documento de ESE proyecto de ESA empresa que se puede compartir, o el motivo. 404 si no es del proyecto (no se
 * distingue de uno que no existe); 400 si su tipo no lo lee el cliente (la exploración, la ejecución) o es una propuesta.
 */
async function documentoCompartible(o: { projectId: string; clientId: string; canvasId: string }) {
  const c = await prisma.projectCanvas.findFirst({
    where: { id: o.canvasId, projectId: o.projectId, businessCaseId: null, project: { clientId: o.clientId } },
    select: { id: true, slug: true, tipoArtefacto: true, name: true, disabledAt: true },
  });
  if (!c) throw new ErrorDelEnlace(404, "Documento no encontrado.");
  if (c.disabledAt) throw new ErrorDelEnlace(409, "Este documento está archivado: vuelve a activarlo para compartirlo.");
  if (!tipoCompartible(tipoDelDocumento(c))) throw new ErrorDelEnlace(400, "Este documento es interno: no se comparte con el cliente.");
  return c;
}

/** Comparte el documento con su enlace propio: lo crea, o lo reactiva con un token nuevo si estaba revocado. */
export async function compartirArtefacto(o: { projectId: string; clientId: string; canvasId: string; porEmail: string | null }): Promise<EstadoDelEnlace> {
  await documentoCompartible(o);
  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    const acceso = await tx.accesoAlDocumento.findUnique({ where: { canvasId: o.canvasId }, select: { id: true, revokedAt: true, clientId: true } });
    if (!acceso) {
      await tx.accesoAlDocumento.create({ data: { canvasId: o.canvasId, clientId: o.clientId, accessToken: randomBytes(32).toString("hex"), creadoPor: o.porEmail } });
    } else if (acceso.revokedAt || acceso.clientId !== o.clientId) {
      /* Volver a compartir después de revocar: enlace NUEVO. Un acceso guardado con otra empresa (no debería existir:
         lo vigila INV64) se rehace con la del proyecto, también con token nuevo. */
      await tx.accesoAlDocumento.update({
        where: { id: acceso.id },
        data: { accessToken: randomBytes(32).toString("hex"), clientId: o.clientId, revokedAt: null, enabledAt: ahora, lastUsedAt: null, creadoPor: o.porEmail },
      });
    }
  });
  return estadoDelEnlace(o.canvasId);
}

/**
 * Deja de compartir: el enlace deja de abrir. Idempotente. Con `projectId`, solo si el documento es de ese proyecto
 * (la ruta lo pasa siempre; quien archiva una copia ya la tiene verificada).
 */
export async function dejarDeCompartirArtefacto(canvasId: string, projectId?: string): Promise<EstadoDelEnlace> {
  await prisma.accesoAlDocumento.updateMany({
    where: { canvasId, revokedAt: null, ...(projectId ? { canvas: { projectId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return SIN_ENLACE;
}

/** ¿El documento es de ese proyecto? (La puerta de la ruta del enlace, antes de leer o revocar.) */
export async function esDocumentoDelProyecto(projectId: string, canvasId: string): Promise<boolean> {
  const c = await prisma.projectCanvas.findFirst({ where: { id: canvasId, projectId, businessCaseId: null }, select: { id: true } });
  return !!c;
}
