/**
 * scripts/diag-marketing-ingest.ts — READ-ONLY.
 * Diagnóstico de la ingesta de inspiración: último run (counts), fuentes
 * (lastFetchedAt/lastFetchError) y si hay APIFY_TOKEN configurado.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(`APIFY_TOKEN: ${process.env.APIFY_TOKEN ? `set (${process.env.APIFY_TOKEN.length} chars)` : "❌ VACÍO"}`);
  console.log(`Actor: ${process.env.APIFY_LINKEDIN_POSTS_ACTOR || "(default) apimaestro~linkedin-profile-posts"}\n`);

  const runs = await prisma.marketingRun.findMany({ orderBy: { createdAt: "desc" }, take: 3 });
  for (const r of runs) {
    console.log(
      `run ${r.id.slice(0, 8)} ${r.kind}/${r.trigger} ${r.status} — fetched=${r.fetchedPostsCount} new=${r.newPostsCount} ok=${r.sourcesOkCount} err=${r.sourcesErrorCount}${r.error ? `\n  error: ${r.error.slice(0, 300)}` : ""}`,
    );
  }

  console.log("\nFuentes:");
  const sources = await prisma.inspirationSource.findMany();
  for (const s of sources) {
    console.log(
      `  • ${s.profileUrl}\n    active=${s.active} lastFetchedAt=${s.lastFetchedAt?.toISOString() ?? "—"}\n    lastFetchError=${s.lastFetchError ?? "—"}`,
    );
  }

  const postCount = await prisma.inspirationPost.count();
  console.log(`\nInspirationPost total: ${postCount}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
