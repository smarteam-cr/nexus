/**
 * scripts/backfill-timeline-anchor.ts
 *
 * Una sola vez: rellena ProjectTimeline.anchorStartDate (la "fecha de arranque" del
 * cronograma) en los cronogramas que la tienen VACÍA, derivándola de la sesión de
 * KICKOFF del proyecto (la más antigua cuyo título matchee kickoff). Espeja la
 * heurística de `getKickoffSessionDate` (lib/sessions/project-sessions.ts).
 *
 * NUNCA pisa una fecha ya puesta (filtra `anchorStartDate: null`). Si un proyecto no
 * tiene sesión de kickoff, se deja vacío (manual).
 *
 * Dry-run (default):  npx tsx scripts/backfill-timeline-anchor.ts
 * Aplicar:            npx tsx scripts/backfill-timeline-anchor.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const APPLY = process.argv.includes("--apply");

async function kickoffDate(projectId: string): Promise<Date | null> {
  const link = await prisma.sessionProject.findFirst({
    where: {
      projectId,
      session: {
        OR: [
          { title: { contains: "kickoff", mode: "insensitive" } },
          { title: { contains: "kick-off", mode: "insensitive" } },
          { title: { contains: "kick off", mode: "insensitive" } },
        ],
      },
    },
    orderBy: { session: { date: "asc" } },
    select: { session: { select: { date: true } } },
  });
  return link?.session.date ?? null;
}

async function main() {
  console.log(APPLY ? "── MODO APPLY (escribe) ──\n" : "── DRY-RUN (no escribe; usá --apply) ──\n");

  const timelines = await prisma.projectTimeline.findMany({
    where: { anchorStartDate: null },
    select: { projectId: true, project: { select: { name: true, client: { select: { name: true } } } } },
  });

  console.log(`Cronogramas con anchor vacío: ${timelines.length}\n`);

  let filled = 0;
  let skipped = 0;
  for (const tl of timelines) {
    const label = `${tl.project.client?.name ?? "?"} / ${tl.project.name}`;
    const date = await kickoffDate(tl.projectId);
    if (!date) {
      console.log(`  ·  ${label} — sin sesión de kickoff → se deja vacío`);
      skipped++;
      continue;
    }
    const ymd = date.toISOString().slice(0, 10);
    if (APPLY) {
      await prisma.projectTimeline.update({
        where: { projectId: tl.projectId },
        data: { anchorStartDate: date },
      });
      console.log(`  ✓  ${label} — anchor = ${ymd} (aplicado)`);
    } else {
      console.log(`  →  ${label} — anchor = ${ymd} (se aplicaría)`);
    }
    filled++;
  }

  console.log(
    `\nResumen: ${filled} con fecha de kickoff${APPLY ? " (aplicados)" : " (a aplicar)"}, ${skipped} sin kickoff (quedan vacíos).`,
  );
  if (!APPLY && filled > 0) console.log("Re-corré con --apply para escribir.");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
