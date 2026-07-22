/**
 * scripts/heal-handoff-anchors.ts
 *
 * SANEO RETROACTIVO de la regresión del handoff multi-proyecto. Cuando nacía un proyecto
 * HERMANO, el reclasificador movía el PRIMARIO de la sesión que ya había ALIMENTADO un
 * handoff generado y la degradaba a secundaria baja-confianza en el proyecto original →
 * el handoff se quedaba sin material ("Ninguna sesión alimenta este handoff"). Desde el
 * fix, generar un handoff ANCLA sus sesiones (handoffOverride:true, que además lockea el
 * link contra el reclasificador vía isLockedLink). Este script aplica ese anclaje a los
 * handoffs YA generados ANTES del fix, leyendo qué sesiones usó su último AgentRun.
 *
 * Fuente de verdad = AgentRun.sourceSessionIds: SOLO el agente de handoff lo setea, así
 * que un run con sourceSessionIds no-vacío ES un run de handoff. Se toma el ÚLTIMO run
 * DONE por proyecto (refleja qué sesiones alimentan el handoff vigente).
 *
 * Idempotente y seguro: ancla SOLO los links VÍRGENES (handoffOverride IS NULL). No pisa
 * una decisión manual del CSE — una exclusión ("X" = handoffOverride:false) o un forzado
 * (true) previos se respetan y quedan como están. Re-correrlo no cambia nada.
 *
 * Dry-run (default):  npx tsx scripts/heal-handoff-anchors.ts
 * Aplicar:            npx tsx scripts/heal-handoff-anchors.ts --apply
 */
import { createScriptDb } from "./lib/db";

const APPLY = process.argv.includes("--apply");
const day = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const { prisma, close } = createScriptDb();
  console.log(APPLY ? "── MODO APPLY (escribe en PROD) ──\n" : "── DRY-RUN (no escribe; usá --apply) ──\n");
  try {
    // Runs de handoff (sourceSessionIds no-vacío), más reciente primero. Nos quedamos con
    // el ÚLTIMO por proyecto: es el que refleja qué sesiones alimentan el handoff vigente.
    const runs = await prisma.agentRun.findMany({
      where: { status: "DONE", projectId: { not: null }, sourceSessionIds: { isEmpty: false } },
      select: {
        projectId: true,
        createdAt: true,
        sourceSessionIds: true,
        project: { select: { name: true, client: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    const latestByProject = new Map<string, (typeof runs)[number]>();
    for (const r of runs) {
      if (r.projectId && !latestByProject.has(r.projectId)) latestByProject.set(r.projectId, r);
    }

    console.log(`Proyectos con handoff generado: ${latestByProject.size}\n`);

    let anchoredLinks = 0;
    let touchedProjects = 0;
    for (const [projectId, run] of latestByProject) {
      const sessionIds = run.sourceSessionIds.filter(Boolean);
      if (sessionIds.length === 0) continue;

      // Links VÍRGENES (handoffOverride IS NULL) de esas sesiones en ESTE proyecto = lo que se anclaría.
      const virgin = await prisma.sessionProject.findMany({
        where: { projectId, sessionId: { in: sessionIds }, handoffOverride: null },
        select: {
          sessionId: true,
          isPrimary: true,
          confidence: true,
          session: { select: { title: true } },
        },
      });
      if (virgin.length === 0) continue;

      touchedProjects++;
      const label = `${run.project?.client?.name ?? "?"} / ${run.project?.name ?? projectId}`;
      console.log(`  ${APPLY ? "✓" : "→"}  ${label}  (handoff ${day(run.createdAt)})`);
      for (const v of virgin) {
        console.log(
          `        ${v.isPrimary ? "PRIM" : "sec "} conf=${v.confidence ?? "—"}  ${v.session?.title ?? v.sessionId}`,
        );
      }

      if (APPLY) {
        const res = await prisma.sessionProject.updateMany({
          where: { projectId, sessionId: { in: sessionIds }, handoffOverride: null },
          data: { handoffOverride: true },
        });
        anchoredLinks += res.count;
      } else {
        anchoredLinks += virgin.length;
      }
    }

    console.log(`\nResumen: ${anchoredLinks} links ${APPLY ? "anclados" : "a anclar"} en ${touchedProjects} proyecto(s).`);
    if (!APPLY && anchoredLinks > 0) console.log("Re-corré con --apply para escribir.");
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
