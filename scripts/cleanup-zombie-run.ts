/** Marca como ERROR una corrida que quedó zombi en RUNNING (proceso de test
 * matado antes de tiempo — no un fallo real del agente). Uso puntual, no dry-run. */
import "dotenv/config";
async function main() {
  const { prisma } = await import("../lib/db/prisma");
  const id = process.argv[2];
  if (!id) throw new Error("uso: cleanup-zombie-run.ts <runId>");
  await prisma.marketingRun.update({
    where: { id },
    data: {
      status: "ERROR",
      phase: null,
      error: "Corrida de prueba interrumpida por el script de validación (timeout propio, no un fallo del agente). Descartada.",
      finishedAt: new Date(),
    },
  });
  console.log(`✓ ${id} marcado ERROR`);
}
main().catch((e) => { console.error(e); process.exit(1); });
