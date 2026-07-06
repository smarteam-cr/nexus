/**
 * scripts/run-cs-watchdog.ts
 *
 * Prueba manual del watchdog de Éxito del cliente (EC-A4). Uso:
 *
 *   npx tsx scripts/run-cs-watchdog.ts --project <id>   → tria UN proyecto
 *   npx tsx scripts/run-cs-watchdog.ts --sweep          → sweep completo (pre-filtrado)
 *   npx tsx scripts/run-cs-watchdog.ts --context <id>   → solo imprime el contexto (sin Claude)
 *   npx tsx scripts/run-cs-watchdog.ts --alerts         → lista las CsAlert vigentes
 */
import "dotenv/config";
import { prisma } from "../lib/db/prisma";

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };

  if (args.includes("--alerts")) {
    const alerts = await prisma.csAlert.findMany({
      orderBy: [{ severity: "desc" }, { lastDetectedAt: "desc" }],
      include: { client: { select: { name: true } }, project: { select: { name: true } } },
    });
    for (const a of alerts) {
      console.log(
        `[${a.status}] ${a.severity} ${a.category} · ${a.client.name}${a.project ? ` / ${a.project.name}` : ""}`,
      );
      console.log(`  "${a.title}" ×${a.occurrences} (última ${a.lastDetectedAt.toISOString().slice(0, 16)})`);
      console.log(`  razón: ${a.reason}`);
      if (a.suggestedAction) console.log(`  acción: ${a.suggestedAction}`);
    }
    console.log(`\ntotal: ${alerts.length}`);
    return;
  }

  const contextId = get("--context");
  if (contextId) {
    const { buildWatchdogContext } = await import("../lib/cs/watchdog-context");
    const events = await prisma.timelineEvent.findMany({
      where: { projectId: contextId, processedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const ctx = await buildWatchdogContext(contextId, events);
    console.log(ctx?.serialized ?? "(proyecto no encontrado)");
    return;
  }

  const projectId = get("--project");
  const { runWatchdogForProject, runWatchdogSweep } = await import("../lib/cs/watchdog");
  if (projectId) {
    const r = await runWatchdogForProject(projectId, "manual");
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (args.includes("--sweep")) {
    const r = await runWatchdogSweep(new Date());
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  console.log("Uso: --project <id> | --sweep | --context <id> | --alerts");
}

main().finally(() => prisma.$disconnect());
