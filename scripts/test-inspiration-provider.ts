/**
 * scripts/test-inspiration-provider.ts — prueba READ-ONLY del InspirationProvider
 * (no escribe en DB; consume unos centavos de Apify).
 *
 *   npx tsx scripts/test-inspiration-provider.ts "https://www.linkedin.com/in/dharmesh/" 3
 */
import "dotenv/config";

async function main() {
  const url = process.argv[2] ?? "https://www.linkedin.com/in/dharmesh/";
  const limit = Number(process.argv[3] ?? "3");
  const { getInspirationProvider } = await import("../lib/marketing/inspiration");

  console.log(`Scrapeando ${url} (limit ${limit})…`);
  const posts = await getInspirationProvider().fetchRecentPosts(url, limit);
  console.log(`→ ${posts.length} post(s) mapeados:\n`);
  for (const p of posts) {
    console.log(
      `  • [${p.externalId.slice(0, 40)}] ${p.postedAt.toISOString().slice(0, 10)} · ${p.likeCount}👍 ${p.commentCount}💬 ${p.repostCount}🔁 · imagen:${p.hasImage ? "sí" : "no"} · ${p.authorName ?? "?"}\n    "${p.text.slice(0, 100).replace(/\n/g, " ")}…"`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
