/**
 * scripts/mover-bc-de-cliente.ts — Reasigna un Business Case a otro cliente.
 *
 * Existe por el caso de las empresas FUSIONADAS en HubSpot: al fusionar, dos fichas de Nexus
 * quedan siendo la misma empresa, y `merge-duplicate-clients.ts` se NIEGA a unificarlas si del
 * duplicado cuelga un business case — porque borrarlo se lo llevaría en cascada. Este script es
 * el «resolvelo a mano» que ese mensaje pide.
 *
 * Mueve `clientId` y, si se pasa, `hubspotCompanyId` (el sobreviviente de la fusión). NO toca
 * secciones ni bloques: el BC es el mismo, solo cambia de dueño.
 *
 *   npx tsx scripts/mover-bc-de-cliente.ts --bc <id> --cliente <id> [--empresa <hubspotCompanyId>]
 *   ALLOW_PROD_WRITE=1 npx tsx ... --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";

function bandera(n: string): string | null {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const apply = resolverApply();
  const bcId = bandera("bc");
  const clienteId = bandera("cliente");
  const empresa = bandera("empresa");
  if (!bcId || !clienteId) {
    console.error("Uso: --bc <id> --cliente <id> [--empresa <hubspotCompanyId>] [--apply]");
    process.exitCode = 1;
    return;
  }

  const bc = await prisma.businessCase.findUnique({
    where: { id: bcId },
    select: { id: true, name: true, clientId: true, hubspotCompanyId: true, status: true },
  });
  if (!bc) {
    console.error(`No existe el business case ${bcId}`);
    process.exitCode = 1;
    return;
  }
  const [origen, destino] = await Promise.all([
    prisma.client.findUnique({ where: { id: bc.clientId }, select: { name: true } }),
    prisma.client.findUnique({ where: { id: clienteId }, select: { name: true, hubspotCompanyId: true } }),
  ]);
  if (!destino) {
    console.error(`No existe el cliente destino ${clienteId}`);
    process.exitCode = 1;
    return;
  }

  console.log(apply ? "=== APPLY (escribe) ===" : "=== DRY-RUN (no escribe) ===");
  console.log(`  BC:      "${bc.name}"  [${bc.status}]`);
  console.log(`  cliente: "${origen?.name ?? bc.clientId}"  →  "${destino.name}"`);
  console.log(`  empresa: ${bc.hubspotCompanyId ?? "-"}  →  ${empresa ?? bc.hubspotCompanyId ?? "-"}`);

  if (!apply) {
    console.log("\n(dry-run) Nada escrito. Repetí con --apply.");
    return;
  }
  await prisma.businessCase.update({
    where: { id: bcId },
    data: { clientId: clienteId, ...(empresa ? { hubspotCompanyId: empresa } : {}) },
  });
  console.log("\n✓ Movido.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
