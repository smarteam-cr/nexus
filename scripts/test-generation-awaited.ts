/**
 * scripts/test-generation-awaited.ts — corre runGenerateIdeasAgent DIRECTO y
 * lo AWAITEA sin ningún timeout artificial ni process.exit prematuro (a
 * diferencia de test-real-generation.ts, que mataba el proceso a los 3 min
 * mientras la llamada seguía en curso). Crea un MarketingRun real primero
 * para que runGenerateIdeasAgent tenga un runId válido donde persistir.
 *
 *   npx tsx scripts/test-generation-awaited.ts
 */
import "dotenv/config";

async function main() {
  const { prisma } = await import("../lib/db/prisma");
  const { runGenerateIdeasAgent, GenerationParseError } = await import("../lib/marketing/agents/generate-ideas");

  const run = await prisma.marketingRun.create({
    data: { kind: "GENERATE", trigger: "MANUAL", startedByEmail: "debug-script-awaited" },
  });
  console.log(`Run: ${run.id} — llamando a Claude (SIN timeout artificial, esperando lo que tarde)…`);
  const startedAt = Date.now();

  try {
    const result = await runGenerateIdeasAgent(run.id);
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\n✓ Terminó en ${secs}s`);
    console.log(`contentIdeasCount: ${result.contentIdeasCount}`);
    console.log(`campaignIdeasCount: ${result.campaignIdeasCount}`);
    console.log(`pillarSuggestionsCount: ${result.pillarSuggestionsCount}`);
    console.log(`rawOutput length: ${result.rawOutput.length}`);

    await prisma.marketingRun.update({
      where: { id: run.id },
      data: {
        status: "DONE",
        contentIdeasCount: result.contentIdeasCount,
        campaignIdeasCount: result.campaignIdeasCount,
        pillarSuggestionsCount: result.pillarSuggestionsCount,
        rawOutput: result.rawOutput,
        finishedAt: new Date(),
      },
    });

    const ideas = await prisma.contentIdea.findMany({ where: { runId: run.id }, take: 3 });
    console.log(`\nMuestra de ${ideas.length} idea(s) reales en DB:`);
    for (const idea of ideas) {
      console.log(`  · "${idea.title}"`);
      console.log(`    copy: "${idea.copy.slice(0, 120)}…"`);
    }
    process.exit(0);
  } catch (e) {
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`\n✗ Falló en ${secs}s: ${e instanceof Error ? e.message : e}`);
    await prisma.marketingRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        error: e instanceof Error ? e.message.slice(0, 4000) : "error desconocido",
        rawOutput: e instanceof GenerationParseError ? e.rawOutput.slice(0, 100_000) : undefined,
        finishedAt: new Date(),
      },
    });
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
