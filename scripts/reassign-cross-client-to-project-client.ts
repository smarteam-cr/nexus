/**
 * scripts/reassign-cross-client-to-project-client.ts
 *
 * Remediación SANCIONADA para sesiones tipo "Cliente & Smarteam" mal resueltas:
 * cuando un SessionProject cruza cliente Y la sesión quedó resuelta al cliente
 * "Smarteam" (nuestra propia empresa — no es contexto de cliente real), la sesión
 * pertenece al cliente del PROYECTO → se setea `manualClientId` = clientId del
 * proyecto (lo manual gana en el cascade) y se re-materializa `resolvedClientId`.
 *
 * NO toca los cruces genuinos entre dos clientes reales (esos se resuelven con
 * cleanup-cross-client-session-projects.ts, que BORRA el link).
 *
 * Dry-run por default:  npx tsx scripts/reassign-cross-client-to-project-client.ts
 * Aplicar:              npx tsx scripts/reassign-cross-client-to-project-client.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? "APLICANDO reasignaciones…\n" : "DRY-RUN (usá --apply para escribir)\n");

  const smarteam = await prisma.client.findFirst({
    where: { name: { equals: "Smarteam", mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (!smarteam) {
    console.log("No existe un Client llamado 'Smarteam' — nada que reasignar.");
    return;
  }

  const links = await prisma.sessionProject.findMany({
    include: {
      session: { select: { id: true, title: true, resolvedClientId: true, manualClientId: true } },
      project: { select: { clientId: true, name: true, client: { select: { name: true } } } },
    },
  });

  // Cruce donde la sesión quedó en el cliente Smarteam pero el proyecto es de un
  // cliente real → la sesión es de ese cliente (regla "Cliente & Smarteam").
  const toReassign = new Map<string, { title: string; targetClientId: string; targetName: string }>();
  for (const l of links) {
    const owner = l.session.manualClientId ?? l.session.resolvedClientId;
    if (!owner || owner === l.project.clientId) continue; // no cruza
    if (owner !== smarteam.id) continue; // cruce genuino entre clientes reales → cleanup, no acá
    if (l.project.clientId === smarteam.id) continue; // proyecto de Smarteam — no aplica
    toReassign.set(l.session.id, {
      title: l.session.title ?? "(sin título)",
      targetClientId: l.project.clientId,
      targetName: l.project.client.name,
    });
  }

  if (toReassign.size === 0) {
    console.log("No hay sesiones resueltas a Smarteam con proyecto de otro cliente. Nada que hacer.");
    return;
  }

  for (const [sessionId, info] of toReassign) {
    console.log(`  • "${info.title}" (${sessionId})  Smarteam → ${info.targetName}`);
    if (APPLY) {
      await prisma.firefliesSession.update({
        where: { id: sessionId },
        data: { manualClientId: info.targetClientId, resolvedClientId: info.targetClientId },
      });
    }
  }

  console.log(
    `\n${toReassign.size} sesión(es) ${APPLY ? "reasignadas (manualClientId + resolvedClientId)" : "a reasignar"}.`,
  );
  if (!APPLY) console.log("Re-corré con --apply para escribir.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
