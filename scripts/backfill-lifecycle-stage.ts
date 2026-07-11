/**
 * scripts/backfill-lifecycle-stage.ts
 *
 * Backfill del CICLO DE VIDA (~150 proyectos activos): propone los gates de salida
 * (ProjectStageGate, source="backfill") que la HISTORIA del proyecto demuestra
 * cumplidos, para que la etapa INFERIDA arranque con sentido. La etapa queda
 * DERIVADA — no se escribe ningún override.
 *
 * Señales retrospectivas (conservadoras — en duda, NO marcar; el CSE corrige en UI):
 *   ENTENDIMIENTO_CERRADO   sesión pasada no-kickoff con minuta REVIEWED/EDITED
 *   DIAGNOSTICO_COMPARTIDO  canvas "Diagnóstico" del proyecto con bloques
 *   CRONOGRAMA_CONSENSUADO  timelinePublishedAt o baseline activa
 *   DEMO_APROBADA           fase CONFIGURACION con avance real (DONE / actualStart)
 *   CLIENTE_OPERANDO        hubspotAdoptionState Medio/Alto
 * CIERRE POR IMPLICACIÓN: un gate evidenciado implica los anteriores de la cadena
 * (no se consensúa un cronograma sin haber pasado exploración/diagnóstico) — las
 * filas implicadas llevan note "implicada por …". Sin esto, un proyecto viejo en
 * ejecución quedaría en EXPLORACION y sus alarmas de cronograma se callarían MAL.
 *
 * SANEO (mismo run): CsAlert OPEN/SEEN de TIMELINE_OVERDUE cuyo proyecto queda en
 * etapa ANTERIOR a CONFIGURACION_TECNICA → RESOLVED con nota (las alarmas de
 * cronograma no aplican aún en etapas tempranas).
 *
 * ⚠️ ESCRIBE EN LA DB COMPARTIDA (prod) con --apply. Flujo: dry-run → revisar → --apply.
 *   npx tsx scripts/backfill-lifecycle-stage.ts             # dry-run (tabla)
 *   npx tsx scripts/backfill-lifecycle-stage.ts --apply
 *   Flags: --client <id|nombre> (acota a un cliente) · --sin-saneo (solo gates)
 */
import "dotenv/config";
import type { ProjectStageGateKey, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  inferLifecycleStage,
  resolveLifecycleCycle,
  stageAtOrAfter,
  STAGE_LABEL_ES,
} from "@/lib/lifecycle";
import { KICKOFF_TITLE_FILTERS } from "@/lib/sessions/kickoff-pick";
import { getKickoffSessionDate } from "@/lib/sessions/project-sessions";
import { SENTINEL_SERVICE_TYPE } from "@/lib/canvas/strategy-project";

const APPLY = process.argv.includes("--apply");
const SKIP_SANEO = process.argv.includes("--sin-saneo");
function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}
const CLIENT_ARG = argValue("--client");

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Cadena de gates del ciclo full, en orden (para el cierre por implicación). */
const GATE_CHAIN: ProjectStageGateKey[] = [
  "ENTENDIMIENTO_CERRADO",
  "DIAGNOSTICO_COMPARTIDO",
  "CRONOGRAMA_CONSENSUADO",
  "DEMO_APROBADA",
  "CLIENTE_OPERANDO",
];

interface GateProposal {
  gate: ProjectStageGateKey;
  markedAt: Date;
  note: string;
  evidence: Prisma.InputJsonValue;
  implied: boolean;
}

async function main() {
  console.log(APPLY ? "── MODO APPLY (escribe en PROD) ──\n" : "── DRY-RUN (no escribe; usá --apply) ──\n");

  // Mismo criterio de "proyecto real y navegable" que loadPortfolio (lib/portfolio/load.ts).
  const projects = await prisma.project.findMany({
    where: {
      status: "active",
      OR: [{ serviceType: null }, { serviceType: { not: SENTINEL_SERVICE_TYPE } }],
      AND: [
        {
          OR: [
            { client: { hubspotCompanyId: null, hubspotAccount: { is: null } } },
            { hubspotServiceId: { not: null } },
          ],
        },
        ...(CLIENT_ARG
          ? [{ client: { OR: [{ id: CLIENT_ARG }, { name: { contains: CLIENT_ARG, mode: "insensitive" as const } }] } }]
          : []),
      ],
    },
    orderBy: [{ client: { name: "asc" } }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      clientId: true,
      status: true,
      kickoffPublishedAt: true,
      timelinePublishedAt: true,
      hubspotAdoptionState: true,
      hubspotPipelineStageLabel: true,
      lifecycleCycle: true,
      tags: true,
      client: { select: { name: true } },
      stageGates: { select: { gate: true } },
      timeline: {
        select: {
          phases: {
            select: { activityType: true, status: true, actualStart: true, actualEnd: true },
          },
          baselines: { where: { isActive: true }, take: 1, select: { capturedAt: true } },
        },
      },
      canvases: {
        where: { name: "Diagnóstico" },
        select: {
          updatedAt: true,
          canvasSections: { select: { _count: { select: { blocks: true } } } },
        },
      },
    },
  });

  const settings = await prisma.csSettings.findUnique({
    where: { id: "cs" },
    select: { uusValidationThreshold: true },
  });
  const uusThreshold = settings?.uusValidationThreshold ?? 60;
  const snapshots = await prisma.clientPartnerSnapshot.findMany({
    where: { clientId: { in: [...new Set(projects.map((p) => p.clientId))] } },
    select: { clientId: true, uusScore: true },
  });
  const uusByClient = new Map(snapshots.map((s) => [s.clientId as string, s.uusScore]));

  console.log(`Proyectos activos en scope: ${projects.length}\n`);

  let totalGates = 0;
  let projectsWithGates = 0;
  const stageCount = new Map<string, number>();
  const resultingStageByProject = new Map<string, ReturnType<typeof inferLifecycleStage>["stage"]>();

  for (const p of projects) {
    const cycle = resolveLifecycleCycle({ lifecycleCycle: p.lifecycleCycle, tags: p.tags });
    const existing = new Set(p.stageGates.map((g) => g.gate));
    const direct = new Map<ProjectStageGateKey, GateProposal>();
    // Señal alternativa de salida de HAND_OFF (proyectos previos al botón Publicar).
    const kickoffSessionAt = await getKickoffSessionDate(p.id);

    if (cycle === "full") {
      // ENTENDIMIENTO_CERRADO — sesión pasada no-kickoff con minuta aceptada
      const minuteLink = await prisma.sessionProject.findFirst({
        where: {
          projectId: p.id,
          included: true,
          session: {
            date: { lte: new Date() },
            NOT: { OR: KICKOFF_TITLE_FILTERS },
            minute: { is: { status: { in: ["REVIEWED", "EDITED"] } } },
          },
        },
        orderBy: { session: { date: "asc" } },
        select: { session: { select: { id: true, date: true, minute: { select: { reviewedAt: true } } } } },
      });
      if (minuteLink) {
        direct.set("ENTENDIMIENTO_CERRADO", {
          gate: "ENTENDIMIENTO_CERRADO",
          markedAt: minuteLink.session.minute?.reviewedAt ?? minuteLink.session.date,
          note: "Backfill: sesión con minuta aceptada por el CSE",
          evidence: { sessionId: minuteLink.session.id },
          implied: false,
        });
      }

      // DIAGNOSTICO_COMPARTIDO — canvas Diagnóstico con bloques
      const diagCanvas = p.canvases.find((c) =>
        c.canvasSections.some((s) => s._count.blocks > 0),
      );
      if (diagCanvas) {
        direct.set("DIAGNOSTICO_COMPARTIDO", {
          gate: "DIAGNOSTICO_COMPARTIDO",
          markedAt: diagCanvas.updatedAt,
          note: "Backfill: canvas Diagnóstico con contenido",
          evidence: { canvas: "Diagnóstico" },
          implied: false,
        });
      }

      // CRONOGRAMA_CONSENSUADO — publicado al cliente o baseline activa
      const baselineAt = p.timeline?.baselines[0]?.capturedAt ?? null;
      if (baselineAt || p.timelinePublishedAt) {
        direct.set("CRONOGRAMA_CONSENSUADO", {
          gate: "CRONOGRAMA_CONSENSUADO",
          markedAt: baselineAt ?? p.timelinePublishedAt!,
          note: "Backfill: cronograma publicado al cliente (baseline)",
          evidence: { timelinePublishedAt: p.timelinePublishedAt?.toISOString() ?? null },
          implied: false,
        });
      }

      // DEMO_APROBADA — fase CONFIGURACION con avance real
      const configPhase = (p.timeline?.phases ?? []).find(
        (ph) =>
          ph.activityType === "CONFIGURACION" &&
          (ph.status === "DONE" || ph.actualEnd != null),
      );
      if (configPhase) {
        direct.set("DEMO_APROBADA", {
          gate: "DEMO_APROBADA",
          markedAt: configPhase.actualEnd ?? configPhase.actualStart ?? new Date(),
          note: "Backfill: fase de configuración completada en el cronograma",
          evidence: { phaseStatus: configPhase.status },
          implied: false,
        });
      }

      // CLIENTE_OPERANDO — adopción Medio/Alto según HubSpot
      if (p.hubspotAdoptionState === "Medio" || p.hubspotAdoptionState === "Alto") {
        direct.set("CLIENTE_OPERANDO", {
          gate: "CLIENTE_OPERANDO",
          markedAt: new Date(),
          note: `Backfill: estado de adopción "${p.hubspotAdoptionState}" en HubSpot`,
          evidence: { hubspotAdoptionState: p.hubspotAdoptionState },
          implied: false,
        });
      }
    }
    // Ciclo short: solo importa kickoffPublishedAt (ya persiste) — nada que crear.
    // ENTREGA_REALIZADA jamás se backfillea (proyectos activos no están entregados).

    // Cierre por implicación: todo gate ANTERIOR al más alto evidenciado queda implicado.
    const proposals: GateProposal[] = [];
    const highest = GATE_CHAIN.reduce((acc, g, i) => (direct.has(g) ? i : acc), -1);
    for (let i = 0; i < GATE_CHAIN.length; i++) {
      const gate = GATE_CHAIN[i];
      if (existing.has(gate)) continue;
      const d = direct.get(gate);
      if (d) {
        proposals.push(d);
      } else if (i < highest) {
        const implier = GATE_CHAIN[highest];
        proposals.push({
          gate,
          markedAt: direct.get(implier)!.markedAt,
          note: `Backfill: implicada por ${implier.toLowerCase().replace(/_/g, " ")} (flujo lineal)`,
          evidence: { impliedBy: implier },
          implied: true,
        });
      }
    }

    // Etapa RESULTANTE con los gates existentes + propuestos
    const gateDates: Partial<Record<ProjectStageGateKey, Date>> = {};
    for (const g of p.stageGates) gateDates[g.gate] = new Date(); // existentes (fecha irrelevante acá)
    for (const g of proposals) gateDates[g.gate] = g.markedAt;
    const inferred = inferLifecycleStage({
      cycle,
      projectStatus: p.status,
      kickoffPublishedAt: p.kickoffPublishedAt,
      kickoffSessionAt,
      gates: gateDates,
      uusScore: uusByClient.get(p.clientId) ?? null,
      uusThreshold,
    });
    resultingStageByProject.set(p.id, inferred.stage);
    stageCount.set(inferred.stage, (stageCount.get(inferred.stage) ?? 0) + 1);

    const label = `${p.client.name} / ${p.name}`;
    const gatesTxt = proposals.length
      ? proposals.map((g) => `${g.gate}${g.implied ? "*" : ""} (${day(g.markedAt)})`).join(", ")
      : "—";
    const kickoffTxt = p.kickoffPublishedAt
      ? "publicado"
      : kickoffSessionAt && kickoffSessionAt.getTime() <= Date.now()
        ? `realizado ${day(kickoffSessionAt)} (sesión, sin publicar)`
        : "SIN publicar ni sesión";
    console.log(
      `  ${APPLY && proposals.length ? "✓" : proposals.length ? "→" : "·"}  ${label}\n` +
        `      ciclo=${cycle} · kickoff ${kickoffTxt} · gates: ${gatesTxt}\n` +
        `      etapa → ${STAGE_LABEL_ES[inferred.stage]}  (HubSpot: ${p.hubspotPipelineStageLabel ?? "—"})`,
    );

    if (APPLY && proposals.length) {
      for (const g of proposals) {
        await prisma.projectStageGate.upsert({
          where: { projectId_gate: { projectId: p.id, gate: g.gate } },
          create: {
            projectId: p.id,
            gate: g.gate,
            markedAt: g.markedAt,
            source: "backfill",
            note: g.note,
            evidence: g.evidence,
          },
          update: {}, // jamás pisar un gate existente (curación durable)
        });
      }
    }
    if (proposals.length) {
      totalGates += proposals.length;
      projectsWithGates++;
    }
  }

  console.log(`\nResumen gates: ${totalGates} en ${projectsWithGates} proyectos${APPLY ? " (APLICADOS)" : " (a aplicar)"}. (* = implicada)`);
  console.log("Distribución de etapas resultantes:");
  for (const [stage, n] of [...stageCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${STAGE_LABEL_ES[stage as keyof typeof STAGE_LABEL_ES]}: ${n}`);
  }

  // ── Saneo de alertas de cronograma en etapas tempranas ──────────────────────
  if (!SKIP_SANEO) {
    const alerts = await prisma.csAlert.findMany({
      where: {
        category: "TIMELINE_OVERDUE",
        status: { in: ["OPEN", "SEEN"] },
        projectId: { in: [...resultingStageByProject.keys()] },
      },
      select: { id: true, projectId: true, title: true, project: { select: { name: true, client: { select: { name: true } } } } },
    });
    const toResolve = alerts.filter((a) => {
      const stage = resultingStageByProject.get(a.projectId!);
      return stage && !stageAtOrAfter(stage, "CONFIGURACION_TECNICA");
    });
    console.log(`\nSaneo: ${toResolve.length} alertas TIMELINE_OVERDUE de proyectos en etapa temprana (de ${alerts.length} abiertas)`);
    for (const a of toResolve) {
      const stage = resultingStageByProject.get(a.projectId!)!;
      console.log(`  ${APPLY ? "✓" : "→"}  [${a.project?.client.name} / ${a.project?.name}] ${a.title} — etapa ${STAGE_LABEL_ES[stage]}`);
      if (APPLY) {
        await prisma.csAlert.update({
          where: { id: a.id },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedByEmail: "system:lifecycle-backfill",
          },
        });
        // Anexar la nota al reason sin pisarlo (append en SQL, el campo es Text).
        await prisma.$executeRaw`UPDATE "CsAlert" SET "reason" = "reason" || ${`\n\n[Resuelta automáticamente: el proyecto está en etapa ${STAGE_LABEL_ES[stage]}; las alarmas de cronograma vencido no aplican aún.]`} WHERE "id" = ${a.id}`;
      }
    }
  }

  if (!APPLY) console.log("\nRe-corré con --apply para escribir (revisá la tabla primero).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
