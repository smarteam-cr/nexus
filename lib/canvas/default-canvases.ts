import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  type CanvasDefinition,
  HANDOFF_CANVAS,
  BUSINESS_CASE_CANVAS,
  KICKOFF_CANVAS,
  DESARROLLO_CANVAS,
  EXPLORACION_CANVAS,
  DEFAULT_PROJECT_CANVASES,
  AGENT_GROUP_TO_CANVAS,
  kickoffSectionSequence,
  desarrolloSectionSequence,
  exploracionSectionSequence,
} from "./canvas-defs";
import { templateById, templateDefsByKey } from "@/components/landing/configs/templates.defs";
import { HUBSPOT_TEMPLATE_ID } from "@/lib/business-cases/case-types";
import { buildTemplateMetaEntry } from "@/lib/business-cases/template-meta";

// Re-export de las definiciones PURAS (viven en canvas-defs.ts, SIN Prisma) para
// que los importadores de servidor existentes (analyze/route.ts, etc.) sigan
// funcionando sin cambios. La separación evita que un componente cliente que
// importe estos datos arrastre `pg`/`fs` al bundle del navegador.
export { HANDOFF_CANVAS, BUSINESS_CASE_CANVAS, KICKOFF_CANVAS, DESARROLLO_CANVAS, EXPLORACION_CANVAS, DEFAULT_PROJECT_CANVASES, AGENT_GROUP_TO_CANVAS };
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
      // Keep JSON for backward compat. Cast: `defaultData?` hace que CanvasSectionDef
      // no sea structuralmente InputJsonValue, pero es JSON-serializable de verdad.
      sections: c.sections as unknown as Prisma.InputJsonValue,
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

    // Secciones CURADAS (con `defaultData`, ej. equipo/horarios/canales del Kickoff):
    // sembrar 1 bloque CONFIRMED con su data default para que arranquen con la
    // estructura lista (el agente de IA no las genera). Las demás secciones quedan
    // sin bloque (el agente del kickoff las crea al generar su prosa).
    const curated = def.sections.filter((s) => s.defaultData);
    if (!curated.length) continue;
    const curatedKeys = curated.map((s) => s.key);
    const sections = await db.canvasSection.findMany({
      where: { canvasId: canvas.id, key: { in: curatedKeys } },
      select: { id: true, key: true },
    });
    const dataByKey = new Map(curated.map((s) => [s.key, s.defaultData]));
    await db.canvasBlock.createMany({
      data: sections.map((s) => ({
        sectionId: s.id,
        blockType: "CARD" as const, // neutro: el render se elige por section.key en KickoffLanding
        content: null,
        data: (dataByKey.get(s.key) ?? {}) as Prisma.InputJsonValue,
        order: 0,
        source: "HUMAN" as const,
        status: "CONFIRMED" as const,
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
      sections: HANDOFF_CANVAS.sections as unknown as Prisma.InputJsonValue,
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
 *  secciones del TEMPLATE indicado (default: hubspot_v1 = comportamiento legacy).
 *  Marca los canvases activos previos del caso como inactivos (cada "Generar" =
 *  una versión nueva). Devuelve el id del canvas. */
export async function createBusinessCaseCanvas(
  businessCaseId: string,
  version: number,
  db: Db = prisma,
  templateId: string = HUBSPOT_TEMPLATE_ID,
  meta?: {
    caseType?: string | null;
    caseSubtype?: string | null;
    /** Decisiones hidden EXPLÍCITAS del canvas previo (carry-forward al regenerar):
     *  ganan al `defaultHidden` del template — si el CSE mostró una sección oculta,
     *  el caso nuevo no debe volver a esconderla. */
    hiddenByKey?: Record<string, boolean>;
    /** ORDEN de secciones del canvas previo (drag & drop del CSE): el caso nuevo lo
     *  respeta; keys nuevas del template van al final en su orden de template. */
    orderedKeys?: string[];
  },
): Promise<string> {
  const tpl = templateById(templateId);
  const defsByKey = templateDefsByKey(templateId);

  // Orden efectivo: el del canvas previo si existe; secciones sin posición previa
  // (nuevas en el template) al final, manteniendo su orden relativo del template.
  const prevIdx = new Map((meta?.orderedKeys ?? []).map((k, i) => [k, i]));
  const orderedSections = prevIdx.size
    ? [...tpl.sections].sort((a, b) => {
        const av = prevIdx.get(a.key) ?? 1000 + tpl.sections.findIndex((s) => s.key === a.key);
        const bv = prevIdx.get(b.key) ?? 1000 + tpl.sections.findIndex((s) => s.key === b.key);
        return av - bv;
      })
    : tpl.sections;

  // Desactivar versiones anteriores (la nueva queda como la activa/editable).
  await db.projectCanvas.updateMany({
    where: { businessCaseId, isActive: true },
    data: { isActive: false },
  });

  // Json de secciones: entry reservada `__meta` (respaldo dual-PC de tipo/template,
  // ver lib/business-cases/template-meta.ts) + una entry por sección, con `hidden`
  // sembrado desde `defaultHidden` (publish filtra hidden por ESTE Json, no por la
  // config) u override explícito del canvas previo.
  const sectionsJson = [
    buildTemplateMetaEntry({ templateId: tpl.id, caseType: meta?.caseType, caseSubtype: meta?.caseSubtype }),
    ...orderedSections.map((s) => {
      const hidden = meta?.hiddenByKey?.[s.key] ?? s.defaultHidden ?? false;
      return {
        key: s.key,
        label: s.canvasLabel ?? s.label,
        ...(hidden ? { hidden: true } : {}),
      };
    }),
  ];

  const canvas = await db.projectCanvas.create({
    data: {
      businessCaseId,
      // Rótulo de cara al CSE: v0 = "Plantilla" (base con las guías del agente, NO se
      // llena con contenido); v1+ = "Caso de uso N" (cada "Generar" crea una versión).
      name: version === 0 ? "Plantilla" : `${tpl.caseLabel} ${version}`,
      isDefault: true,
      order: 0,
      version,
      isActive: true,
      sections: sectionsJson as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  await db.canvasSection.createMany({
    data: orderedSections.map((s, i) => ({
      canvasId: canvas.id,
      key: s.key,
      label: s.canvasLabel ?? s.label,
      order: i,
    })),
  });

  // Siembra 1 bloque ESTRUCTURADO VACÍO por sección (data = `empty` de la config) →
  // el workspace muestra el template editorial completo desde el primer momento, y
  // editar/generar/publicar siempre opera sobre un bloque existente (1 por sección).
  const createdSections = await db.canvasSection.findMany({
    where: { canvasId: canvas.id },
    select: { id: true, key: true },
  });
  await db.canvasBlock.createMany({
    data: createdSections.map((s) => ({
      sectionId: s.id,
      blockType: "CARD" as const, // neutro: el render se elige por section.key vía la config
      content: null,
      data: (defsByKey[s.key]?.empty ?? {}) as Prisma.InputJsonValue,
      order: 0,
      source: "HUMAN" as const,
      status: "CONFIRMED" as const,
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

/**
 * Reconcilia un canvas "Kickoff" YA EXISTENTE a la estructura canónica actual: crea las
 * secciones que falten y siembra su bloque `defaultData` cuando lo tengan. NUNCA borra
 * secciones ni bloques, ni pisa data existente. Idempotente.
 *
 * Lo llama la rama kickoff de POST /analyze ANTES de generar: un kickoff creado con un
 * canon viejo (sin `hoy_vs_sistema`, sin `cierre`) se auto-sana al regenerar, en vez de
 * perder en silencio esas secciones (`buildKickoffConfig` filtra por las keys que existen).
 *
 * DIFERENCIA con el handoff: acá el CSE puede REORDENAR las secciones (drag & drop del
 * motor), y ese orden es el del render. Por eso NO se renormaliza al orden canónico: se
 * parte del orden vivo y cada key faltante se inserta detrás de su predecesora canónica.
 */
export async function reconcileKickoffCanvasSections(canvasId: string, db: Db = prisma): Promise<void> {
  const canon = KICKOFF_CANVAS.sections;
  const existing = await db.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    select: { id: true, key: true, order: true, _count: { select: { blocks: true } } },
  });
  const existingKeys = new Set(existing.map((s) => s.key));
  const seq = kickoffSectionSequence(existing.map((s) => s.key));
  const missing = canon.filter((s) => !existingKeys.has(s.key));

  if (missing.length) {
    const labelByKey = new Map(canon.map((s) => [s.key, s.label]));
    await db.canvasSection.createMany({
      // `skipDuplicates`: dos regeneraciones simultáneas del mismo kickoff llegan acá con el
      // mismo set de faltantes. Sin esto la segunda choca contra @@unique([canvasId,key]) y la
      // request entera muere con P2002 en vez de ser un no-op.
      skipDuplicates: true,
      data: missing.map((s) => ({ canvasId, key: s.key, label: labelByKey.get(s.key)!, order: seq.indexOf(s.key) })),
    });
    // Densificar `order` a 0..n-1 respetando la secuencia (preserva el orden del CSE).
    const byKey = new Map(existing.map((s) => [s.key, s]));
    for (let i = 0; i < seq.length; i++) {
      const cur = byKey.get(seq[i]);
      if (cur && cur.order !== i) await db.canvasSection.update({ where: { id: cur.id }, data: { order: i } });
    }
  }

  // Sembrar el bloque de las secciones CURADAS (equipo/horarios/canales/cierre) que no
  // tengan ninguno: sin bloque, el editor no persiste (`KickoffWorkspace` exige el CARD)
  // y el agente no las genera (`agentGenerated:false`) → quedarían muertas.
  const curated = canon.filter((s) => s.defaultData);
  const needSeed = curated.filter((s) => !existingKeys.has(s.key) || byBlockCount(existing, s.key) === 0);
  if (!needSeed.length) return;
  const rows = await db.canvasSection.findMany({
    where: { canvasId, key: { in: needSeed.map((s) => s.key) } },
    select: { id: true, key: true },
  });
  const dataByKey = new Map(curated.map((s) => [s.key, s.defaultData]));
  // `id` determinístico + `skipDuplicates`: CanvasBlock no tiene unique por sección, y dos
  // reconciles simultáneos leen `existing` (0 bloques) antes de escribir, así que ambos
  // sembrarían un CARD. El duplicado NO es inocuo: los lectores toman `blocks.find(CARD)` sobre
  // un `orderBy: order` con empate en 0 — Postgres no garantiza cuál sale primero — de modo que
  // el CSE podría editar un CARD y que después se lea el otro (su CTA "no se guarda"). Derivando
  // el id de la sección, el segundo insert choca contra la PK y es un no-op.
  await db.canvasBlock.createMany({
    skipDuplicates: true,
    data: rows.map((s) => ({
      id: `${s.id}-seed`,
      sectionId: s.id,
      blockType: "CARD" as const,
      content: null,
      data: (dataByKey.get(s.key) ?? {}) as Prisma.InputJsonValue,
      order: 0,
      source: "HUMAN" as const,
      status: "CONFIRMED" as const,
    })),
  });
}

function byBlockCount(rows: Array<{ key: string; _count: { blocks: number } }>, key: string): number {
  return rows.find((r) => r.key === key)?._count.blocks ?? 0;
}

/**
 * Crea un canvas ON-DEMAND desde su definición (+ sus secciones) para un proyecto, y
 * siembra el bloque de las secciones CURADAS (las que traen `defaultData`) como CARD
 * CONFIRMED — sin bloque, el editor no persiste y el agente no las genera, así que
 * quedarían muertas (misma razón que en el kickoff). El resto lo genera el agente.
 * Asume que el proyecto aún no tiene ese canvas (los callers lo chequean).
 *
 * GENÉRICO a propósito: Desarrollo y Exploración son on-demand con la MISMA mecánica —
 * antes esto era el mismo cuerpo copiado por canvas.
 */
async function createOnDemandCanvas(projectId: string, def: CanvasDefinition, db: Db = prisma): Promise<string> {
  const canvas = await db.projectCanvas.create({
    data: {
      projectId,
      name: def.name,
      isDefault: def.isDefault,
      order: def.order,
      sections: def.sections as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  await db.canvasSection.createMany({
    data: def.sections.map((s, i) => ({
      canvasId: canvas.id,
      key: s.key,
      label: s.label,
      order: i,
    })),
  });

  const curated = def.sections.filter((s) => s.defaultData);
  if (curated.length) {
    const rows = await db.canvasSection.findMany({
      where: { canvasId: canvas.id, key: { in: curated.map((s) => s.key) } },
      select: { id: true, key: true },
    });
    const dataByKey = new Map(curated.map((s) => [s.key, s.defaultData]));
    await db.canvasBlock.createMany({
      data: rows.map((s) => ({
        sectionId: s.id,
        blockType: "CARD" as const,
        content: null,
        data: (dataByKey.get(s.key) ?? {}) as Prisma.InputJsonValue,
        order: 0,
        source: "HUMAN" as const,
        status: "CONFIRMED" as const,
      })),
    });
  }

  return canvas.id;
}

/**
 * Reconcilia un canvas on-demand YA EXISTENTE a su estructura canónica: crea las
 * secciones faltantes (respetando el orden vivo del CSE vía su `sequenceFn`) y siembra
 * el bloque de las curadas que no lo tengan. NUNCA borra ni pisa data. Idempotente.
 * La llaman las ramas de analyze ANTES de generar (igual que kickoff).
 */
async function reconcileOnDemandCanvasSections(
  canvasId: string,
  def: CanvasDefinition,
  sequenceFn: (existingKeys: string[]) => string[],
  db: Db = prisma,
): Promise<void> {
  const canon = def.sections;
  const existing = await db.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    select: { id: true, key: true, order: true, _count: { select: { blocks: true } } },
  });
  const existingKeys = new Set(existing.map((s) => s.key));
  const seq = sequenceFn(existing.map((s) => s.key));
  const missing = canon.filter((s) => !existingKeys.has(s.key));

  if (missing.length) {
    const labelByKey = new Map(canon.map((s) => [s.key, s.label]));
    await db.canvasSection.createMany({
      skipDuplicates: true,
      data: missing.map((s) => ({ canvasId, key: s.key, label: labelByKey.get(s.key)!, order: seq.indexOf(s.key) })),
    });
    const byKey = new Map(existing.map((s) => [s.key, s]));
    for (let i = 0; i < seq.length; i++) {
      const cur = byKey.get(seq[i]);
      if (cur && cur.order !== i) await db.canvasSection.update({ where: { id: cur.id }, data: { order: i } });
    }
  }

  const curated = canon.filter((s) => s.defaultData);
  const needSeed = curated.filter((s) => !existingKeys.has(s.key) || byBlockCount(existing, s.key) === 0);
  if (!needSeed.length) return;
  const rows = await db.canvasSection.findMany({
    where: { canvasId, key: { in: needSeed.map((s) => s.key) } },
    select: { id: true, key: true },
  });
  const dataByKey = new Map(curated.map((s) => [s.key, s.defaultData]));
  await db.canvasBlock.createMany({
    skipDuplicates: true,
    data: rows.map((s) => ({
      id: `${s.id}-seed`,
      sectionId: s.id,
      blockType: "CARD" as const,
      content: null,
      data: (dataByKey.get(s.key) ?? {}) as Prisma.InputJsonValue,
      order: 0,
      source: "HUMAN" as const,
      status: "CONFIRMED" as const,
    })),
  });
}

/** Canvas "Desarrollo" (requerimiento técnico) — lo llama el auto-chain del handoff y la
 *  rama desarrollo de analyze cuando aún no existe. */
export async function createDesarrolloCanvas(projectId: string, db: Db = prisma): Promise<string> {
  return createOnDemandCanvas(projectId, DESARROLLO_CANVAS, db);
}

/** Reconcilia el canvas "Desarrollo" a su estructura canónica. Idempotente. */
export async function reconcileDesarrolloCanvasSections(canvasId: string, db: Db = prisma): Promise<void> {
  return reconcileOnDemandCanvasSections(canvasId, DESARROLLO_CANVAS, desarrolloSectionSequence, db);
}

/** Canvas "Exploración" (descubrimiento del negocio, INTERNO) — lo llama el botón
 *  "Generar exploración" del proyecto vía `ensureExploracionCanvas`. */
export async function createExploracionCanvas(projectId: string, db: Db = prisma): Promise<string> {
  return createOnDemandCanvas(projectId, EXPLORACION_CANVAS, db);
}

/** Reconcilia el canvas "Exploración" a su estructura canónica. Idempotente. */
export async function reconcileExploracionCanvasSections(canvasId: string, db: Db = prisma): Promise<void> {
  return reconcileOnDemandCanvasSections(canvasId, EXPLORACION_CANVAS, exploracionSectionSequence, db);
}
