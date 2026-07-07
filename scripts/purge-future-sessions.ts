import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

/**
 * Saneo de FirefliesSession con fecha FUTURA (anomalía 2037-2038).
 *
 * Origen del daño: el sync de Google Meet corría SIN `timeMax` con
 * `singleEvents: true` → Calendar expandía eventos recurrentes años hacia el
 * futuro y ~65% de la tabla quedó con fechas 2037-2038 (ya corregido en
 * lib/google/meet-sync.ts — este script limpia lo acumulado).
 *
 * Política: BORRAR solo filas 100% sintéticas (sin NINGÚN dato humano);
 * PRESERVAR y listar las que tengan manualClientId, minuta, action items,
 * vínculos a proyectos, o referencias desde BusinessCaseSession /
 * AgentRun.sourceSessionIds. Por construcción, el set a borrar no cascadea
 * nada (las filas con relaciones quedan excluidas).
 *
 * transcript/summary NO preserva por sí solo: verificado contra la DB real
 * (2026-07-07), las futuras "enriquecidas" son instancias recurrentes con el
 * MISMO Google Doc de la serie copiado a cientos de filas (3 docs distintos en
 * 856 filas) — duplicados, no contenido propio. Se preservan únicamente las
 * filas cuyo googleDocId NO tenga gemela PASADA (contenido que solo vive en
 * futuras — hoy: 1 doc, la serie interna "Check out semanal | PM").
 *
 * Dry-run por defecto (imprime el análisis completo); escribe solo con --apply.
 *   npx tsx scripts/purge-future-sessions.ts            (análisis, no escribe)
 *   npx tsx scripts/purge-future-sessions.ts --apply    (borra las sintéticas)
 */
const APPLY = process.argv.includes("--apply");

// Margen de seguridad: el sync legítimo escribe hasta now+1d (timeMax) — acá
// solo se consideran "futuras" las de now+2d en adelante, para no rozar jamás
// reuniones reales de mañana.
const FUTURE_CUTOFF_DAYS = 2;
const DELETE_CHUNK = 1000;

async function main() {
  console.log(APPLY ? "=== APPLY (borra) ===" : "=== DRY-RUN (solo análisis) ===");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + FUTURE_CUTOFF_DAYS);
  console.log(`Cutoff: date > ${cutoff.toISOString()}`);

  const futureWhere = { date: { gt: cutoff } } as const;

  const [total, future] = await Promise.all([
    prisma.firefliesSession.count(),
    prisma.firefliesSession.findMany({
      where: futureWhere,
      select: { id: true, date: true, title: true, manualClientId: true },
      orderBy: { date: "asc" },
    }),
  ]);
  console.log(`\nTotal FirefliesSession: ${total}`);
  console.log(`Futuras (> cutoff):     ${future.length}`);
  if (future.length === 0) {
    console.log("Nada que sanear.");
    return;
  }

  // Distribución por año (para confirmar que es la anomalía 2037-38 y no otra cosa).
  const byYear = new Map<number, number>();
  for (const s of future) {
    const y = s.date.getFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  console.log("Por año:", [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}: ${n}`).join(" · "));

  const futureIds = future.map((s) => s.id);
  const futureIdSet = new Set(futureIds);

  // ── Criterios de "tiene datos humanos/derivados" (queries por set, no por fila) ──
  const [withEnrich, withMinute, withActions, withProjects, bcSessions, agentRuns] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { ...futureWhere, OR: [{ transcript: { not: null } }, { summary: { not: { equals: null } } }] },
      select: { id: true, googleDocId: true },
    }),
    prisma.sessionMinute.findMany({ where: { session: futureWhere }, select: { sessionId: true } }),
    prisma.actionItem.findMany({ where: { session: futureWhere }, select: { sessionId: true } }),
    prisma.sessionProject.findMany({ where: { session: futureWhere }, select: { sessionId: true } }),
    prisma.businessCaseSession.findMany({ select: { sessionId: true } }),
    prisma.agentRun.findMany({ where: { sourceSessionIds: { isEmpty: false } }, select: { sourceSessionIds: true } }),
  ]);

  // Docs de futuras enriquecidas que SÍ tienen gemela pasada (contenido a salvo).
  const enrichDocIds = [...new Set(withEnrich.map((s) => s.googleDocId).filter((d): d is string => !!d))];
  const pastTwins = enrichDocIds.length
    ? await prisma.firefliesSession.findMany({
        where: { googleDocId: { in: enrichDocIds }, date: { lte: new Date() } },
        select: { googleDocId: true },
      })
    : [];
  const docsWithPastTwin = new Set(pastTwins.map((p) => p.googleDocId));

  const keep = new Map<string, string[]>(); // id → razones
  const mark = (id: string, reason: string) => {
    if (!futureIdSet.has(id)) return;
    const r = keep.get(id) ?? [];
    r.push(reason);
    keep.set(id, r);
  };
  for (const s of future) if (s.manualClientId) mark(s.id, "manualClientId");
  // transcript/summary preserva SOLO si el contenido no existe en ninguna sesión
  // pasada (doc huérfano o transcript sin doc) — ver comentario de política arriba.
  for (const s of withEnrich) {
    if (!s.googleDocId || !docsWithPastTwin.has(s.googleDocId)) mark(s.id, "transcript sin gemela pasada");
  }
  for (const m of withMinute) mark(m.sessionId, "minuta");
  for (const a of withActions) if (a.sessionId) mark(a.sessionId, "action items");
  for (const p of withProjects) mark(p.sessionId, "vínculo a proyecto");
  for (const b of bcSessions) mark(b.sessionId, "BusinessCaseSession");
  for (const r of agentRuns) for (const sid of r.sourceSessionIds) mark(sid, "AgentRun.sourceSessionIds");

  const toDelete = futureIds.filter((id) => !keep.has(id));
  console.log(`\nCon datos humanos/derivados (SE PRESERVAN): ${keep.size}`);
  for (const [id, reasons] of keep) {
    const s = future.find((f) => f.id === id)!;
    console.log(`  · ${id} — ${s.date.toISOString().slice(0, 10)} — "${s.title}" [${[...new Set(reasons)].join(", ")}]`);
  }
  console.log(`\n100% sintéticas (${APPLY ? "SE BORRAN" : "se borrarían"}): ${toDelete.length}`);
  const sample = toDelete.slice(0, 5).map((id) => future.find((f) => f.id === id)!);
  for (const s of sample) console.log(`  ej: ${s.id} — ${s.date.toISOString().slice(0, 10)} — "${s.title}"`);

  if (!APPLY) {
    console.log("\n(dry-run — revisá el desglose y corré con --apply para ejecutar)");
    return;
  }

  // Respaldo ANTES de borrar (la purga pasa de irreversible a recuperable):
  // dump completo de las filas a borrar en un JSON local gitignoreado.
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const backupDir = "backups";
  mkdirSync(backupDir, { recursive: true });
  const backupPath = `${backupDir}/future-sessions-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const rowsToBackup = [] as unknown[];
  for (let i = 0; i < toDelete.length; i += DELETE_CHUNK) {
    const chunk = toDelete.slice(i, i + DELETE_CHUNK);
    rowsToBackup.push(...(await prisma.firefliesSession.findMany({ where: { id: { in: chunk } } })));
  }
  writeFileSync(backupPath, JSON.stringify(rowsToBackup, null, 1));
  console.log(`\nRespaldo escrito: ${backupPath} (${rowsToBackup.length} filas)`);

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += DELETE_CHUNK) {
    const chunk = toDelete.slice(i, i + DELETE_CHUNK);
    const r = await prisma.firefliesSession.deleteMany({ where: { id: { in: chunk } } });
    deleted += r.count;
    console.log(`  borradas ${deleted}/${toDelete.length}…`);
  }
  const after = await prisma.firefliesSession.count({ where: futureWhere });
  console.log(`\nListo. Borradas: ${deleted}. Futuras restantes (preservadas a propósito): ${after}.`);
}

main().finally(() => prisma.$disconnect());
