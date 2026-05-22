/**
 * scripts/explore-session-state.ts
 *
 * Exploración one-off: ¿hay sesiones con summary pero sin transcript?
 * También busca una sesión específica (McCann) para entender su estado.
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/explore-session-state.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🔍 Investigación: estado de sesiones (transcript vs summary)\n");

  // ── 1. Conteos generales ───────────────────────────────────────────────────
  const total = await prisma.firefliesSession.count();
  const withTranscript = await prisma.firefliesSession.count({
    where: { transcript: { not: null } },
  });
  const withSummary = await prisma.firefliesSession.count({
    where: { summary: { not: { equals: null as any } } },
  });
  const withSummaryNoTranscript = await prisma.firefliesSession.count({
    where: {
      transcript: null,
      summary: { not: { equals: null as any } },
    },
  });
  const withNothing = await prisma.firefliesSession.count({
    where: { transcript: null, summary: { equals: null as any } },
  });

  console.log("── Conteos generales ──────────────────────────────────────────");
  console.log(`  Total sesiones:                          ${total}`);
  console.log(`  Con transcript (cualquier estado sum):   ${withTranscript}`);
  console.log(`  Con summary (cualquier estado tx):       ${withSummary}`);
  console.log(`  ★ Con summary PERO SIN transcript:       ${withSummaryNoTranscript}`);
  console.log(`  Sin nada (ni tx ni summary):             ${withNothing}`);

  // ── 2. Buscar la sesión específica McCann ──────────────────────────────────
  console.log("\n── Búsqueda específica: 'McCann' ─────────────────────────────");
  const mccannSessions = await prisma.firefliesSession.findMany({
    where: {
      OR: [
        { title: { contains: "McCann", mode: "insensitive" } },
        { title: { contains: "Mccann", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      title: true,
      date: true,
      source: true,
      transcript: true,
      summary: true,
      enrichedAt: true,
      participants: true,
    },
    orderBy: { date: "desc" },
  });

  if (mccannSessions.length === 0) {
    console.log("  No se encontró ninguna sesión con 'McCann' en el título.");
  } else {
    console.log(`  ${mccannSessions.length} sesión(es) encontrada(s):\n`);
    for (const s of mccannSessions) {
      console.log(`  ─── ${s.title}`);
      console.log(`      id:         ${s.id}`);
      console.log(`      date:       ${s.date.toISOString()}`);
      console.log(`      source:     ${s.source}`);
      console.log(`      transcript: ${s.transcript === null ? "NULL" : `${s.transcript.length} chars`}`);
      console.log(`      summary:    ${s.summary === null ? "NULL" : `JSON con keys: ${Object.keys(s.summary as object).join(", ")}`}`);
      console.log(`      enrichedAt: ${s.enrichedAt?.toISOString() ?? "NULL"}`);
      console.log(`      participants: ${s.participants.slice(0, 3).join(", ")}${s.participants.length > 3 ? "..." : ""}`);
      console.log("");
    }
  }

  // ── 3. Sample de 10 sesiones con summary pero sin transcript ───────────────
  if (withSummaryNoTranscript > 0) {
    console.log("── Sample: sesiones con summary pero sin transcript (top 10) ──");
    const samples = await prisma.firefliesSession.findMany({
      where: {
        transcript: null,
        summary: { not: { equals: null as any } },
      },
      select: {
        id: true,
        title: true,
        date: true,
        source: true,
        summary: true,
      },
      orderBy: { date: "desc" },
      take: 10,
    });
    for (const s of samples) {
      const summaryKeys = s.summary ? Object.keys(s.summary as object).join(",") : "—";
      console.log(`  · ${s.date.toISOString().slice(0, 10)} [${s.source}] ${s.title.slice(0, 60)}`);
      console.log(`      summary keys: ${summaryKeys}`);
    }
  }

  // ── 4. Distribución por source ─────────────────────────────────────────────
  console.log("\n── Distribución por source ────────────────────────────────────");
  const bySource = await prisma.firefliesSession.groupBy({
    by: ["source"],
    _count: true,
  });
  for (const row of bySource) {
    console.log(`  ${row.source}: ${row._count}`);
  }
}

main()
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
