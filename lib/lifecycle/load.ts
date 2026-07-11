/**
 * lib/lifecycle/load.ts
 *
 * Loader Prisma del ciclo de vida: junta las señales (proyecto + gates + snapshot
 * Partner + umbral UUS) en BATCH (sin N+1 — lo consume lib/portfolio/load.ts para
 * toda la cartera) y computa la etapa con el motor puro (stage-engine.ts).
 *
 * `getProjectLifecycle(projectId)` es el export que consume todo Nexus (watchdog,
 * account-brief, Cobranza v1 lectura) — siempre vía lib/lifecycle/index.ts.
 */
import type { ProjectLifecycleStage, ProjectStageGateKey } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { KICKOFF_TITLE_FILTERS, pickKickoffSessionDate } from "@/lib/sessions/kickoff-pick";
import { RECURRENTE_TAG } from "@/lib/tags/catalog";
import {
  inferLifecycleStage,
  resolveLifecycleStage,
  resolveLifecycleCycle,
  suggestAdoptionMode,
  stagePosition,
  STAGE_LABEL_ES,
  type AdoptionMode,
  type LifecycleCycle,
} from "./stage-engine";

export interface ProjectLifecycle {
  projectId: string;
  cycle: LifecycleCycle;
  /** El handoff CORRIÓ y clasificó este proyecto (Project.handoffGeneratedAt != null).
   *  Compuerta: sin esto el portal CS muestra un aviso en vez de etapas. */
  defined: boolean;
  /** El servicio es recurrente/de continuidad (tag `recurrente`) — ciclo corto. */
  recurrent: boolean;
  /** Etapa EFECTIVA (override del CSE ?? inferida). */
  effective: ProjectLifecycleStage;
  source: "override" | "inferred";
  inferred: ProjectLifecycleStage;
  /** Por qué (cumplido + pendiente), en español legible. */
  reasons: string[];
  label: string;
  position: { index: number; total: number };
  override: {
    stage: ProjectLifecycleStage;
    reason: string | null;
    at: Date | null;
    by: string | null;
  } | null;
  gates: Array<{
    gate: ProjectStageGateKey;
    markedAt: Date;
    markedBy: string | null;
    source: string;
    note: string | null;
  }>;
  kickoffPublishedAt: Date | null;
  /** Fecha de la sesión de Kick Off real (pickKickoffSessionDate), si hay. */
  kickoffSessionAt: Date | null;
  /** Fecha del gate CRONOGRAMA_CONSENSUADO (insumo de las alarmas por etapa). */
  cronogramaConsensuadoAt: Date | null;
  /** hubspotCreatedAt ?? createdAt — "edad" del proyecto para alarmas tempranas. */
  projectCreatedAt: Date;
  isSuccessCase: boolean;
  adoptionMode: {
    confirmed: AdoptionMode | null;
    suggested: AdoptionMode | null;
    confirmedAt: Date | null;
    confirmedBy: string | null;
  };
  uus: { score: number | null; threshold: number };
}

/** Suma de seats.limit de todos los hubs del snapshot Partner ({ core|sales|…: {limit} }). */
function seatsTotalFrom(seats: unknown): number | null {
  if (!seats || typeof seats !== "object") return null;
  let total = 0;
  let found = false;
  for (const v of Object.values(seats as Record<string, unknown>)) {
    if (v && typeof v === "object" && typeof (v as { limit?: unknown }).limit === "number") {
      total += (v as { limit: number }).limit;
      found = true;
    }
  }
  return found ? total : null;
}

function asAdoptionMode(v: string | null): AdoptionMode | null {
  return v === "directa" || v === "por_pilotos" ? v : null;
}

/**
 * Batch: 1 query proyectos + 1 gates + 1 snapshots Partner + 1 settings →
 * Map<projectId, ProjectLifecycle>. Proyectos inexistentes no aparecen en el Map.
 */
export async function loadLifecycleBatch(
  projectIds: string[],
): Promise<Map<string, ProjectLifecycle>> {
  const out = new Map<string, ProjectLifecycle>();
  if (projectIds.length === 0) return out;

  const [projects, gates, settings, kickoffLinks] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        name: true,
        status: true,
        clientId: true,
        createdAt: true,
        hubspotCreatedAt: true,
        kickoffPublishedAt: true,
        handoffGeneratedAt: true,
        tags: true,
        lifecycleCycle: true,
        lifecycleStageOverride: true,
        lifecycleStageOverrideReason: true,
        lifecycleStageOverrideAt: true,
        lifecycleStageOverrideBy: true,
        adoptionMode: true,
        adoptionModeConfirmedAt: true,
        adoptionModeConfirmedBy: true,
        isSuccessCase: true,
      },
    }),
    prisma.projectStageGate.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, gate: true, markedAt: true, markedBy: true, source: true, note: true },
    }),
    prisma.csSettings.findUnique({ where: { id: "cs" }, select: { uusValidationThreshold: true } }),
    // Sesiones tituladas kickoff (señal alternativa de salida de HAND_OFF para
    // proyectos previos al botón "Publicar kickoff").
    prisma.sessionProject.findMany({
      where: { projectId: { in: projectIds }, included: true, session: { OR: KICKOFF_TITLE_FILTERS } },
      select: { projectId: true, session: { select: { date: true } } },
    }),
  ]);

  const clientIds = [...new Set(projects.map((p) => p.clientId))];
  const snapshots = clientIds.length
    ? await prisma.clientPartnerSnapshot.findMany({
        where: { clientId: { in: clientIds } },
        select: { clientId: true, uusScore: true, seats: true, marketingContactsLimit: true },
      })
    : [];
  const snapshotByClient = new Map(snapshots.map((s) => [s.clientId as string, s]));
  const uusThreshold = settings?.uusValidationThreshold ?? 60;

  const gatesByProject = new Map<string, typeof gates>();
  for (const g of gates) {
    const list = gatesByProject.get(g.projectId) ?? [];
    list.push(g);
    gatesByProject.set(g.projectId, list);
  }

  const kickoffDatesByProject = new Map<string, Date[]>();
  for (const l of kickoffLinks) {
    const list = kickoffDatesByProject.get(l.projectId) ?? [];
    list.push(l.session.date);
    kickoffDatesByProject.set(l.projectId, list);
  }

  for (const p of projects) {
    const projectGates = gatesByProject.get(p.id) ?? [];
    const gateDates: Partial<Record<ProjectStageGateKey, Date>> = {};
    for (const g of projectGates) gateDates[g.gate] = g.markedAt;

    const snapshot = p.clientId ? snapshotByClient.get(p.clientId) : undefined;
    const cycle = resolveLifecycleCycle({ lifecycleCycle: p.lifecycleCycle, tags: p.tags });
    const kickoffSessionAt = pickKickoffSessionDate(
      kickoffDatesByProject.get(p.id) ?? [],
      p.hubspotCreatedAt ?? p.createdAt,
    );

    const inferred = inferLifecycleStage({
      cycle,
      projectStatus: p.status,
      kickoffPublishedAt: p.kickoffPublishedAt,
      kickoffSessionAt,
      gates: gateDates,
      uusScore: snapshot?.uusScore ?? null,
      uusThreshold,
    });
    const { effective, source } = resolveLifecycleStage(inferred, p.lifecycleStageOverride);

    out.set(p.id, {
      projectId: p.id,
      cycle,
      defined: p.handoffGeneratedAt != null,
      recurrent: p.tags.includes(RECURRENTE_TAG),
      effective,
      source,
      inferred: inferred.stage,
      reasons: inferred.reasons,
      label: STAGE_LABEL_ES[effective],
      position: stagePosition(effective, cycle),
      override: p.lifecycleStageOverride
        ? {
            stage: p.lifecycleStageOverride,
            reason: p.lifecycleStageOverrideReason,
            at: p.lifecycleStageOverrideAt,
            by: p.lifecycleStageOverrideBy,
          }
        : null,
      gates: projectGates.map(({ gate, markedAt, markedBy, source: gateSource, note }) => ({
        gate,
        markedAt,
        markedBy,
        source: gateSource,
        note,
      })),
      kickoffPublishedAt: p.kickoffPublishedAt,
      kickoffSessionAt,
      cronogramaConsensuadoAt: gateDates.CRONOGRAMA_CONSENSUADO ?? null,
      projectCreatedAt: p.hubspotCreatedAt ?? p.createdAt,
      isSuccessCase: p.isSuccessCase,
      adoptionMode: {
        confirmed: asAdoptionMode(p.adoptionMode),
        suggested: suggestAdoptionMode({
          seatsTotal: seatsTotalFrom(snapshot?.seats),
          marketingContactsLimit: snapshot?.marketingContactsLimit ?? null,
        }),
        confirmedAt: p.adoptionModeConfirmedAt,
        confirmedBy: p.adoptionModeConfirmedBy,
      },
      uus: { score: snapshot?.uusScore ?? null, threshold: uusThreshold },
    });
  }
  return out;
}

/**
 * Ciclo de vida de UN proyecto (null si no existe). Materializa perezosamente el
 * gate USO_VALIDADO con source="system" cuando el UUS lo cumple y nadie lo marcó
 * (best-effort: el motor ya lo da por cumplido sin la fila — la fila deja el
 * EVENTO durable aunque el score baje después).
 */
export async function getProjectLifecycle(projectId: string): Promise<ProjectLifecycle | null> {
  const lifecycle = (await loadLifecycleBatch([projectId])).get(projectId) ?? null;
  if (!lifecycle) return null;

  const uusPasses = lifecycle.uus.score != null && lifecycle.uus.score >= lifecycle.uus.threshold;
  const hasGate = lifecycle.gates.some((g) => g.gate === "USO_VALIDADO");
  if (uusPasses && !hasGate && lifecycle.effective !== "HAND_OFF") {
    try {
      await prisma.projectStageGate.upsert({
        where: { projectId_gate: { projectId, gate: "USO_VALIDADO" } },
        create: {
          projectId,
          gate: "USO_VALIDADO",
          source: "system",
          evidence: { uusScore: lifecycle.uus.score, threshold: lifecycle.uus.threshold },
        },
        update: {},
      });
    } catch (e) {
      // Solo durabilidad del evento — la etapa ya salió bien sin la fila.
      console.error("[lifecycle] no se pudo materializar USO_VALIDADO:", e);
    }
  }
  return lifecycle;
}
