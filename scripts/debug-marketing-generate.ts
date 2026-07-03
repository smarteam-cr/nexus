/**
 * scripts/debug-marketing-generate.ts — READ-ONLY frente a la DB de Marketing
 * (no crea AgentRun ni persiste nada). Llama a Claude UNA vez con el mismo
 * input que usa runGenerateIdeasAgent y vuelca el output CRUDO + el stop_reason
 * + el resultado del parseo, para diagnosticar un fallo de "JSON no parseable".
 *
 *   npx tsx scripts/debug-marketing-generate.ts
 */
import "dotenv/config";

async function main() {
  const { buildGenerationInput } = await import("../lib/marketing/agents/generate-ideas");
  const { anthropic } = await import("../lib/anthropic");
  const { prisma } = await import("../lib/db/prisma");
  const { MARKETING_AGENT_ID } = await import("../lib/marketing/seed-data");

  const agent = await prisma.agent.findUnique({ where: { id: MARKETING_AGENT_ID } });
  if (!agent) {
    console.error("Agente no encontrado.");
    process.exit(1);
  }
  console.log(`Agente: ${agent.name} (status ${agent.status}, prompt ${agent.systemPrompt.length} chars)\n`);

  const { input } = await buildGenerationInput();
  console.log(`Input: ${input.length} chars\n`);

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    temperature: 0,
    system: agent.systemPrompt,
    messages: [{ role: "user", content: input }],
  });

  const rawOutput = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  console.log(`stop_reason: ${msg.stop_reason}`);
  console.log(`usage: input=${msg.usage.input_tokens} output=${msg.usage.output_tokens}`);
  console.log(`rawOutput length: ${rawOutput.length} chars\n`);
  console.log("── PRIMEROS 500 chars ──");
  console.log(rawOutput.slice(0, 500));
  console.log("\n── ÚLTIMOS 500 chars ──");
  console.log(rawOutput.slice(-500));

  // Mismo parser que el agente real.
  let s = rawOutput.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  console.log(`\nfence match: ${!!fence} | start: ${start} | end: ${end}`);
  if (start !== -1 && end !== -1 && end > start) {
    try {
      JSON.parse(s.slice(start, end + 1));
      console.log("✓ JSON.parse OK");
    } catch (e) {
      console.log(`✗ JSON.parse falló: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.log("✗ no se encontró { ... } balanceado");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
