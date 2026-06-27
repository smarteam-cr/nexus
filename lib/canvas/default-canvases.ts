import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  type CanvasDefinition,
  HANDOFF_CANVAS,
  BUSINESS_CASE_CANVAS,
  DEFAULT_PROJECT_CANVASES,
  AGENT_GROUP_TO_CANVAS,
} from "./canvas-defs";

// Re-export de las definiciones PURAS (viven en canvas-defs.ts, SIN Prisma) para
// que los importadores de servidor existentes (analyze/route.ts, etc.) sigan
// funcionando sin cambios. La separación evita que un componente cliente que
// importe estos datos arrastre `pg`/`fs` al bundle del navegador.
export { HANDOFF_CANVAS, BUSINESS_CASE_CANVAS, DEFAULT_PROJECT_CANVASES, AGENT_GROUP_TO_CANVAS };
export type { CanvasDefinition };

// Acepta el cliente global o un cliente de transacción ($transaction) para que la
// creación de canvases sea atómica con el resto del orquestador (Fase 4 handoff).
type Db = Prisma.TransactionClient;

/** Create all standard canvases for a project with CanvasSection records.
 *  NO incluye Handoff (es entidad cliente-level; usar createHandoffCanvas). */
export async function createDefaultCanvases(projectId: string, db: Db = prisma) {
  // Create all canvases
  await db.projectCanvas.createMany({
    data: DEFAULT_PROJECT_CANVASES.map((c) => ({
      projectId,
      name: c.name,
      isDefault: c.isDefault,
      order: c.order,
      sections: c.sections, // Keep JSON for backward compat
    })),
  });

  // Create CanvasSection records for every canvas that defines sections.
  // Canvases sin secciones (Cronograma) no llevan.
  const createdCanvases = await db.projectCanvas.findMany({
    where: { projectId },
    select: { id: true, name: true },
  });

  for (const canvas of createdCanvases) {
    const def = DEFAULT_PROJECT_CANVASES.find((d) => d.name === canvas.name);
    if (!def?.sections.length) continue;
    await db.canvasSection.createMany({
      data: def.sections.map((s, i) => ({
        canvasId: canvas.id,
        key: s.key,
        label: s.label,
        order: i,
      })),
    });
  }
}

/** Crea el canvas "Handoff" (+10 secciones de HANDOFF_CANVAS) para un proyecto. Lo usa el
 *  FLUJO de creación de handoffs — el handoff arranca el proyecto y monta su canvas.
 *  Asume que el proyecto aún no tiene canvas Handoff (proyecto recién creado). */
export async function createHandoffCanvas(projectId: string, db: Db = prisma): Promise<string> {
  const canvas = await db.projectCanvas.create({
    data: {
      projectId,
      name: HANDOFF_CANVAS.name,
      isDefault: HANDOFF_CANVAS.isDefault,
      order: HANDOFF_CANVAS.order,
      sections: HANDOFF_CANVAS.sections,
    },
    select: { id: true },
  });

  await db.canvasSection.createMany({
    data: HANDOFF_CANVAS.sections.map((s, i) => ({
      canvasId: canvas.id,
      key: s.key,
      label: s.label,
      order: i,
    })),
  });

  return canvas.id;
}

/** Crea un canvas "Business Case" (versionado) para un BusinessCase, con las
 *  secciones de BUSINESS_CASE_CANVAS. Marca los canvases activos previos del caso
 *  como inactivos (cada "Generar" = una versión nueva). Devuelve el id del canvas. */
export async function createBusinessCaseCanvas(
  businessCaseId: string,
  version: number,
  db: Db = prisma,
): Promise<string> {
  // Desactivar versiones anteriores (la nueva queda como la activa/editable).
  await db.projectCanvas.updateMany({
    where: { businessCaseId, isActive: true },
    data: { isActive: false },
  });

  const canvas = await db.projectCanvas.create({
    data: {
      businessCaseId,
      name: BUSINESS_CASE_CANVAS.name,
      isDefault: true,
      order: 0,
      version,
      isActive: true,
      sections: BUSINESS_CASE_CANVAS.sections,
    },
    select: { id: true },
  });

  await db.canvasSection.createMany({
    data: BUSINESS_CASE_CANVAS.sections.map((s, i) => ({
      canvasId: canvas.id,
      key: s.key,
      label: s.label,
      order: i,
    })),
  });

  return canvas.id;
}

/**
 * Reconcilia un canvas "Handoff" YA EXISTENTE a la estructura canónica actual (HANDOFF_CANVAS):
 * crea las secciones que falten y normaliza su `order` y `label`. NUNCA borra secciones ni bloques.
 * Lo usa el "ensure" de POST /handoff ANTES de generar, para que el agente no descarte en
 * silencio una sección que el canvas viejo no tenía (p.ej. "desarrollo" en handoffs legacy).
 * Idempotente: si el canvas ya está al día, no escribe nada.
 */
export async function reconcileHandoffCanvasSections(canvasId: string, db: Db = prisma): Promise<void> {
  const existing = await db.canvasSection.findMany({
    where: { canvasId },
    select: { id: true, key: true, order: true, label: true },
  });
  const byKey = new Map(existing.map((s) => [s.key, s]));
  for (let i = 0; i < HANDOFF_CANVAS.sections.length; i++) {
    const { key, label } = HANDOFF_CANVAS.sections[i];
    const cur = byKey.get(key);
    if (!cur) {
      await db.canvasSection.create({ data: { canvasId, key, label, order: i } });
    } else if (cur.order !== i || cur.label !== label) {
      await db.canvasSection.update({ where: { id: cur.id }, data: { order: i, label } });
    }
  }
}
