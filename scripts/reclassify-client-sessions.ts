/**
 * scripts/reclassify-client-sessions.ts
 *
 * Backfill de la re-clasificación sesión→proyecto (plan "contexto por proyecto",
 * SP-F5): re-corre el clasificador sobre las sesiones re-clasificables de un
 * cliente (o de todos los multi-proyecto) e imprime el DIFF links actuales →
 * propuestos por sesión.
 *
 * ⚠️ ESCRIBE EN LA DB COMPARTIDA (prod) con --apply. El default es DRY-RUN:
 * llama al LLM para clasificar (gasta tokens ~US$0.03/sesión multi-proyecto)
 * pero NO persiste nada. Flujo obligado: dry-run → revisar el diff → --apply.
 *
 * Respeta TODOS los locks humanos (manual / reviewedAt / tombstone / override):
 * una sesión con algún link lockeado NO entra al backfill (su curación es durable).
 *
 * Uso:
 *   npx tsx scripts/reclassify-client-sessions.ts --client "RC Inmobiliaria"   # dry-run
 *   npx tsx scripts/reclassify-client-sessions.ts --client <clientId> --apply
 *   npx tsx scripts/reclassify-client-sessions.ts --all-multi                  # dry-run de los 12
 *   Flags: --since <días> (default 90) · --max <n> sesiones por cliente (default 30)
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { classifySessionToProjects } from "@/lib/sessions/classify-session-project";
import { isLockedLink } from "@/lib/sessions/session-project-locks";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const APPLY = process.argv.includes("--apply");
const ALL_MULTI = process.argv.includes("--all-multi");
const CLIENT_ARG = argValue("--client");
const SINCE_DAYS = Number(argValue("--since") ?? 90);
const MAX_PER_CLIENT = Number(argValue("--max") ?? 30);

const day = (d: Date) => d.toISOString().slice(0, 10);

async function resolveClients(): Promise<{ id: string; name: string }[]> {
  if (CLIENT_ARG) {
    const byId = await prisma.client.findUnique({
      where: { id: CLIENT_ARG },
      select: { id: true, name: true },
    });
    if (byId) return [byId];
    const byName = await prisma.client.findMany({
      where: { name: { contains: CLIENT_ARG, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    if (byName.length === 1) return byName;
    if (byName.length === 0) throw new Error(`Ningún cliente matchea "${CLIENT_ARG}"`);
    throw new Error(
      `"${CLIENT_ARG}" es ambiguo (${byName.length}): ${byName.map((c) => c.name).join(" · ")}`,
    );
  }
  if (ALL_MULTI) {
    // Clientes con ≥2 proyectos activos, peor-primero (más proyectos activos primero).
    const grouped = await prisma.project.groupBy({
      by: ["clientId"],
      where: { status: "active", serviceType: { not: "__strategy__" } },
      _count: { clientId: true },
    });
    const multiIds = grouped
      .filter((g) => g._count.clientId >= 2)
      .sort((a, b) => b._count.clientId - a._count.clientId)
      .map((g) => g.clientId);
    const clients = await prisma.client.findMany({
      where: { id: { in: multiIds } },
      select: { id: true, name: true },
    });
    const byId = new Map(clients.map((c) => [c.id, c]));
    return multiIds.map((id) => byId.get(id)!).filter(Boolean);
  }
  throw new Error("Indicá --client <id|nombre> o --all-multi");
}

async function processClient(client: { id: string; name: string }): Promise<void> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`CLIENTE: ${client.name} (${client.id})`);

  const projects = await prisma.project.findMany({
    where: { clientId: client.id, status: "active", serviceType: { not: "__strategy__" } },
    select: { id: true, name: true, serviceType: true, hubspotCreatedAt: true, createdAt: true, hubspotDealId: true },
    orderBy: { createdAt: "asc" },
  });
  const projName = new Map(projects.map((p) => [p.id, p.name]));
  console.log(`Proyectos activos (${projects.length}):`);
  for (const p of projects) {
    console.log(
      `  - "${p.name}" [${p.serviceType ?? "sin tipo"}] creado=${day(p.hubspotCreatedAt ?? p.createdAt)}${p.hubspotDealId ? "" : " (sin deal)"}`,
    );
  }

  const now = new Date();
  const since = new Date(now.getTime() - SINCE_DAYS * 24 * 60 * 60 * 1000);
  const sessions = await prisma.firefliesSession.findMany({
    where: {
      OR: [{ resolvedClientId: client.id }, { manualClientId: client.id }],
      date: { gte: since, lte: now },
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      title: true,
      date: true,
      projects: {
        select: {
          projectId: true, isPrimary: true, source: true, confidence: true,
          included: true, reviewedAt: true, handoffOverride: true,
        },
      },
    },
  });

  const lockedSessions = sessions.filter((s) => s.projects.some(isLockedLink));
  const candidates = sessions.filter((s) => s.projects.every((l) => !isLockedLink(l))).slice(0, MAX_PER_CLIENT);
  console.log(
    `Sesiones en ventana (${SINCE_DAYS}d): ${sessions.length} — candidatas: ${candidates.length}` +
      ` — con curación humana (intocables): ${lockedSessions.length}`,
  );

  let changed = 0;
  for (const s of candidates) {
    const fmtCurrent = s.projects.length
      ? s.projects
          .map((l) => {
            const flags = [
              l.isPrimary ? "PRIMARIO" : null,
              l.source,
              l.confidence != null ? l.confidence.toFixed(2) : null,
              !l.included ? "EXCLUIDA" : null,
              l.reviewedAt ? "revisada" : null,
            ].filter(Boolean).join(" · ");
            return `[${projName.get(l.projectId) ?? l.projectId}] (${flags})`;
          })
          .join("  +  ")
      : "(sin links — huérfana)";

    if (APPLY) {
      const r = await classifySessionToProjects(s.id, client.id);
      const dest =
        r.status === "ok"
          ? `→ primario: ${r.primaryProjectId ? `[${projName.get(r.primaryProjectId) ?? r.primaryProjectId}]` : "(ninguno)"} (${r.assignmentsCreated ?? 0} links)`
          : `→ ${r.status}: ${r.reason ?? ""}`;
      console.log(`\n  ${day(s.date)} "${s.title}"`);
      console.log(`    antes:  ${fmtCurrent}`);
      console.log(`    APLICADO ${dest}`);
      if (r.status === "ok") changed++;
    } else {
      const r = await classifySessionToProjects(s.id, client.id, { dryRun: true });
      console.log(`\n  ${day(s.date)} "${s.title}"`);
      console.log(`    actual:    ${fmtCurrent}`);
      if (r.status !== "ok") {
        console.log(`    propuesta: (${r.status}) ${r.reason ?? ""}`);
        continue;
      }
      const props = r.proposals ?? [];
      if (props.length === 0) {
        console.log(`    propuesta: (sin asignación — ningún proyecto matchea con confianza ≥0.4)`);
        continue;
      }
      for (const p of props) {
        console.log(
          `    propuesta: [${projName.get(p.projectId) ?? p.projectId}]${p.isPrimary ? " PRIMARIO" : ""}` +
            ` ${p.confidence != null ? p.confidence.toFixed(2) : "?"} — ${p.rationale ?? ""}`,
        );
      }
      // ¿Difiere del estado actual? (para el resumen)
      const currentIds = new Set(s.projects.filter((l) => l.included).map((l) => l.projectId));
      const proposedIds = new Set(props.map((p) => p.projectId));
      const differs =
        currentIds.size !== proposedIds.size || [...proposedIds].some((id) => !currentIds.has(id));
      if (differs) changed++;
    }
  }

  console.log(
    `\n  ── ${client.name}: ${APPLY ? `${changed} sesiones re-clasificadas` : `${changed} sesiones cambiarían de membresía`} (de ${candidates.length} candidatas) ──`,
  );
}

async function main() {
  console.log(`Modo: ${APPLY ? "⚠️ APPLY (escribe la DB compartida)" : "DRY-RUN (clasifica sin escribir; usá --apply para persistir)"}`);
  const clients = await resolveClients();
  console.log(`Clientes a procesar: ${clients.length}`);
  for (const c of clients) {
    await processClient(c);
  }
  if (!APPLY) console.log("\n⚠ Dry-run: nada se escribió. Revisá el diff y corré con --apply.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
