/**
 * scripts/verify-timeline-progress.ts  (E2E, con RESTAURACIÓN)
 *
 * Verifica D.2 contra datos reales sin dejar rastro: captura el estado del
 * cronograma de un proyecto, simula el ciclo completo (marca-a-mano del CSE →
 * agente propone → aplicar → re-correr/realimentación) y RESTAURA todo en finally.
 *
 * Llama a Claude de verdad (agent-timeline-progress). Uso:
 *   npx tsx scripts/verify-timeline-progress.ts <projectId>
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { regenerateTimelineProgress } from "@/lib/timeline/regenerate-progress";

const PROJECT_ID = process.argv[2] || "cmovpv3cu000098ijobjlm6f4"; // Teamnet por defecto
const ok = (b: boolean) => (b ? "✓" : "✗ FALLA");

type Snap = {
  pendingProgress: unknown;
  pendingProgressRunId: string | null;
  phases: { id: string; name: string; status: string; statusSource: string; tasks: { id: string; title: string; status: string; statusSource: string }[] }[];
};

async function snapshot(): Promise<Snap> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId: PROJECT_ID },
    select: {
      pendingProgress: true,
      pendingProgressRunId: true,
      phases: {
        orderBy: { order: "asc" },
        select: { id: true, name: true, status: true, statusSource: true, tasks: { select: { id: true, title: true, status: true, statusSource: true } } },
      },
    },
  });
  if (!tl) throw new Error("no timeline");
  return tl as Snap;
}

async function restore(snap: Snap) {
  for (const p of snap.phases) {
    await prisma.timelinePhase.update({ where: { id: p.id }, data: { status: p.status as never, statusSource: p.statusSource as never } });
    for (const t of p.tasks) {
      await prisma.timelineTask.update({ where: { id: t.id }, data: { status: t.status as never, statusSource: t.statusSource as never } });
    }
  }
  await prisma.projectTimeline.update({
    where: { projectId: PROJECT_ID },
    data: {
      pendingProgress: (snap.pendingProgress ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
      pendingProgressRunId: snap.pendingProgressRunId,
    },
  });
}

async function getDraft() {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId: PROJECT_ID },
    select: { pendingProgress: true },
  });
  return (tl?.pendingProgress ?? null) as null | {
    currentPhaseId: string | null;
    reasoning: string;
    phases: { id: string; done: boolean }[];
    tasks: { id: string; done: boolean }[];
  };
}

async function main() {
  const before = await snapshot();
  console.log(`\n=== VERIFY D.2 — ${PROJECT_ID} ===`);
  console.log(`Fases=${before.phases.length}, tareas=${before.phases.reduce((n, p) => n + p.tasks.length, 0)}`);

  // Elegimos una tarea "marcada a mano" por el CSE (de la última fase, para que NO
  // sea de las que el agente probablemente proponga como hechas en fases tempranas).
  const lastPhase = before.phases[before.phases.length - 1];
  const handTask = lastPhase.tasks[0];
  // Segunda tarea (cualquier fase con ≥1 tarea activa) para probar el blindaje de SUSPENDED:
  // una tarea que el humano aparcó NUNCA debe entrar al borrador ni re-proponerse como hecha.
  const suspTask = before.phases.flatMap((p) => p.tasks).find((t) => t.id !== handTask?.id);

  try {
    // ── Paso A: el CSE marca una tarea DONE a mano ──
    if (handTask) {
      await prisma.timelineTask.update({ where: { id: handTask.id }, data: { status: "DONE", statusSource: "HUMAN" } });
      console.log(`\n[A] Marca-a-mano del CSE: "${handTask.title}" → DONE (fase "${lastPhase.name}")`);
    }

    // ── Paso A2: el CSE SUSPENDE otra tarea (decisión terminal humana) ──
    if (suspTask) {
      await prisma.timelineTask.update({ where: { id: suspTask.id }, data: { status: "SUSPENDED", statusSource: "HUMAN" } });
      console.log(`[A2] Suspensión del CSE: "${suspTask.title}" → SUSPENDED`);
    }

    // ── Paso B: el agente PROPONE (no escribe status) ──
    console.log(`\n[B] Corriendo agent-timeline-progress…`);
    const r1 = await regenerateTimelineProgress(PROJECT_ID);
    console.log(`    resultado: ${JSON.stringify(r1)}`);
    const draft1 = await getDraft();
    if (!draft1) {
      console.log(`    (sin borrador — el agente no detectó avance nuevo). Verificación parcial.`);
    } else {
      console.log(`    razón IA: ${draft1.reasoning}`);
      console.log(`    hoy=${draft1.currentPhaseId}  fases propuestas=${draft1.phases.length}  tareas propuestas=${draft1.tasks.length}`);

      // Invariante 1: el agente NO escribió status (todo sigue como antes salvo la marca-a-mano).
      const afterB = await snapshot();
      const statusUnchanged = afterB.phases.every(
        (p) => p.status === (before.phases.find((b) => b.id === p.id)?.status) &&
          p.tasks.every((t) => {
            const orig = before.phases.flatMap((b) => b.tasks).find((b) => b.id === t.id)?.status;
            if (t.id === handTask?.id) return t.status === "DONE";
            if (t.id === suspTask?.id) return t.status === "SUSPENDED";
            return t.status === orig;
          }),
      );
      console.log(`    ${ok(statusUnchanged)} el agente NO tocó ningún status (solo pendingProgress)`);

      // Invariante 2: el borrador NO re-propone la tarea ya marcada DONE a mano.
      const reproposesHand = handTask ? draft1.tasks.some((t) => t.id === handTask.id) : false;
      console.log(`    ${ok(!reproposesHand)} el borrador NO re-propone la tarea marcada a mano`);

      // Invariante 2b (blindaje SUSPENDED): la tarea aparcada por el humano NO entra al borrador
      // (ni como tarea ni implícita), aunque el agente la infiriera hecha.
      const draftHasSusp = suspTask
        ? draft1.tasks.some((t) => t.id === suspTask.id) || draft1.phases.some((p) => p.id === suspTask.id)
        : false;
      console.log(`    ${ok(!draftHasSusp)} el borrador NO incluye la tarea SUSPENDIDA por el humano`);

      // ── Paso C: el CSE APLICA el subconjunto propuesto (mirror del endpoint) ──
      // Mirror del endpoint real: guardias de estado terminal + statusSource AI_CONFIRMED.
      const phaseIds = draft1.phases.map((p) => p.id);
      const taskIds = draft1.tasks.map((t) => t.id);
      if (phaseIds.length) await prisma.timelinePhase.updateMany({ where: { id: { in: phaseIds } }, data: { status: "DONE", statusSource: "AI_CONFIRMED" } });
      if (taskIds.length) await prisma.timelineTask.updateMany({ where: { id: { in: taskIds }, status: { not: "SUSPENDED" } }, data: { status: "DONE", statusSource: "AI_CONFIRMED" } });
      if (draft1.currentPhaseId)
        await prisma.timelinePhase.updateMany({ where: { id: draft1.currentPhaseId, status: { not: "DONE" } }, data: { status: "IN_PROGRESS", statusSource: "AI_CONFIRMED" } });
      // El endpoint real limpia el borrador al aplicar — el mirror también.
      await prisma.projectTimeline.update({ where: { projectId: PROJECT_ID }, data: { pendingProgress: Prisma.DbNull, pendingProgressRunId: null } });
      console.log(`\n[C] Aplicado: ${phaseIds.length} fases→DONE, ${taskIds.length} tareas→DONE, hoy→IN_PROGRESS (borrador limpiado)`);

      const afterC = await snapshot();
      const appliedOk =
        phaseIds.every((id) => afterC.phases.find((p) => p.id === id)?.status === "DONE") &&
        taskIds.every((id) => afterC.phases.flatMap((p) => p.tasks).find((t) => t.id === id)?.status === "DONE");
      console.log(`    ${ok(appliedOk)} las fases/tareas aceptadas quedaron en DONE`);
      const handStillDone = !handTask || afterC.phases.flatMap((p) => p.tasks).find((t) => t.id === handTask.id)?.status === "DONE";
      console.log(`    ${ok(handStillDone)} la marca-a-mano del CSE quedó intacta (no se pisó)`);
      const suspStillSuspended = !suspTask || afterC.phases.flatMap((p) => p.tasks).find((t) => t.id === suspTask.id)?.status === "SUSPENDED";
      console.log(`    ${ok(suspStillSuspended)} la suspensión del CSE quedó intacta (el avance no la pisó con DONE)`);

      // ── Paso D: realimentación — el agente re-corre y NO re-propone lo ya DONE ──
      console.log(`\n[D] Re-corriendo (realimentación)…`);
      const r2 = await regenerateTimelineProgress(PROJECT_ID);
      console.log(`    resultado: ${JSON.stringify(r2)}`);
      const draft2 = await getDraft();
      const doneIds = new Set([...phaseIds, ...taskIds, ...(handTask ? [handTask.id] : [])]);
      const reproposesDone = draft2
        ? [...draft2.phases.map((p) => p.id), ...draft2.tasks.map((t) => t.id)].some((id) => doneIds.has(id))
        : false;
      console.log(`    ${ok(!reproposesDone)} la 2ª corrida NO re-propone nada de lo ya confirmado (construye encima)`);
    }
  } finally {
    await restore(before);
    const check = await snapshot();
    const restored = check.phases.every(
      (p) => p.status === before.phases.find((b) => b.id === p.id)?.status &&
        p.tasks.every((t) => t.status === before.phases.flatMap((b) => b.tasks).find((b) => b.id === t.id)?.status),
    );
    console.log(`\n[RESTORE] ${ok(restored)} estado original restaurado (statuses + pendingProgress).`);
  }
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
