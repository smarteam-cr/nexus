import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

/**
 * scripts/cleanup-cross-client-session-projects.ts
 *
 * Borra los `SessionProject` CROSS-CLIENT: links donde la sesión (según su ownership
 * materializado `resolvedClientId`) pertenece a un cliente DISTINTO del cliente del
 * proyecto. Limpia la pollución de la migración legacy (migrate-sessions-to-projects).
 *
 * Predicado (BORRAR):
 *   resolvedClientId != null && projectClientId != resolvedClientId
 *                            && projectClientId != manualClientId
 * Las `resolvedClientId == null` se REPORTAN pero NO se borran (puede ser una sesión
 * interna linkeada a propósito; además el chokepoint ya las oculta de la generación).
 *
 * IMPORTANTE: correr DESPUÉS del re-resolve (scripts/backfill-resolved-client.ts --apply).
 * Si no, lee `resolvedClientId` sucio y borraría lo que no debe.
 *
 * Dry-run por default. Aplicar con --apply:
 *   npx tsx scripts/cleanup-cross-client-session-projects.ts            # dry-run
 *   npx tsx scripts/cleanup-cross-client-session-projects.ts --apply    # borra (PROD)
 */
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(
    APPLY
      ? "⚠ APLICANDO cleanup de SessionProject cross-client…\n"
      : "DRY-RUN — cleanup de SessionProject cross-client (usá --apply para borrar)\n",
  );

  const [clients, links] = await Promise.all([
    prisma.client.findMany({ select: { id: true, name: true } }),
    prisma.sessionProject.findMany({
      select: {
        id: true,
        source: true,
        project: { select: { clientId: true } },
        session: { select: { id: true, title: true, resolvedClientId: true, manualClientId: true } },
      },
    }),
  ]);
  const nameById = new Map(clients.map((c) => [c.id, c.name]));

  const cross: typeof links = [];
  const bySource: Record<string, number> = {};
  let nullReported = 0;
  for (const l of links) {
    const pc = l.project.clientId;
    const { resolvedClientId: r, manualClientId: m } = l.session;
    if (r !== null && pc !== r && pc !== m) {
      cross.push(l);
      bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    } else if (r === null && pc !== m) {
      nullReported++;
    }
  }

  console.log(`SessionProject totales: ${links.length}`);
  console.log(`A BORRAR (cross-client genuino): ${cross.length}  por source: ${JSON.stringify(bySource)}`);
  console.log(`NULL (sesión sin resolver, linkeada): ${nullReported} — se REPORTAN, NO se borran\n`);

  for (const l of cross.slice(0, 30)) {
    const pcName = nameById.get(l.project.clientId) ?? l.project.clientId;
    const rName = l.session.resolvedClientId
      ? nameById.get(l.session.resolvedClientId) ?? l.session.resolvedClientId
      : "(null)";
    console.log(`  • [${l.source}] "${l.session.title}"  proyecto→${pcName}  ≠  sesión→${rName}`);
  }
  if (cross.length > 30) console.log(`  … y ${cross.length - 30} más`);

  if (!APPLY) {
    console.log("\n(DRY-RUN) Nada borrado. Re-corré con --apply (DESPUÉS del re-resolve).");
    return;
  }
  if (cross.length === 0) {
    console.log("\nNada que borrar.");
    return;
  }
  const del = await prisma.sessionProject.deleteMany({ where: { id: { in: cross.map((l) => l.id) } } });
  console.log(`\n✓ Borrados ${del.count} SessionProject cross-client.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
