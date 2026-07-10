import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

/**
 * scripts/check-invariants.ts — BLINDAJE DURO de los invariantes medulares de Nexus.
 * Exit ≠0 si alguno se viola. Lo invoca la skill /ship antes de commitear, y se puede
 * correr a mano: `npx tsx scripts/check-invariants.ts` (o `npm run check:invariants`).
 *
 * Invariantes:
 *   1. Ningún `SessionProject` cruza cliente: la sesión (resolvedClientId/manualClientId)
 *      pertenece al cliente del proyecto. Es EL invariante del leak cross-empresa de
 *      handoffs — la red dura aunque el chokepoint ya filtre en runtime.
 *   2. Materialización fresca: `resolveAllSessions({dryRun}).changed === 0`. Si != 0,
 *      alguien editó clientes/categorías (o el resolver) y no re-resolvió → resolvedClientId
 *      quedó desactualizado y los reads por resolvedClientId mienten.
 */
async function main(): Promise<number> {
  let violations = 0;

  // ── Inv 1: ningún SessionProject cruza cliente ──
  const links = await prisma.sessionProject.findMany({
    select: {
      project: { select: { clientId: true } },
      session: { select: { id: true, title: true, resolvedClientId: true, manualClientId: true } },
    },
  });
  const cross = links.filter((l) => {
    const pc = l.project.clientId;
    const { resolvedClientId: r, manualClientId: m } = l.session;
    return r !== null && pc !== r && pc !== m;
  });
  if (cross.length > 0) {
    violations++;
    console.error(`✗ INV1 VIOLADO: ${cross.length} SessionProject cruzan cliente (contexto de un cliente alimentaría a otro).`);
    console.error("  Corré: npx tsx scripts/cleanup-cross-client-session-projects.ts --apply");
    for (const l of cross.slice(0, 10)) console.error(`    - "${l.session.title}" (${l.session.id})`);
  } else {
    console.log("✓ INV1: ningún SessionProject cruza cliente.");
  }

  // ── Inv 2: materialización fresca (resolvedClientId == categorize en vivo) ──
  try {
    const { changed } = await resolveAllSessions({ dryRun: true });
    if (changed !== 0) {
      violations++;
      console.error(`✗ INV2 VIOLADO: re-resolve cambiaría ${changed} sesiones (resolvedClientId desactualizado).`);
      console.error("  Corré: npx tsx scripts/backfill-resolved-client.ts --apply");
    } else {
      console.log("✓ INV2: resolvedClientId está fresco (dry-run changed=0).");
    }
  } catch (e) {
    // No es violación dura (puede ser HubSpot/DB caído): se reporta y se sigue.
    console.error("⚠ INV2 no verificable (¿HubSpot/DB caído?):", e instanceof Error ? e.message : e);
  }

  // ── Inv 3: ningún Cobro COBRADO sin confirmadoPor (Cobranza — el humano confirma
  //    lo que mueve dinero; chokepoint: lib/cobranza/mutations.ts#cambiarEstadoCobro) ──
  const cobradosSinConfirmar = await prisma.cobro.count({
    where: { estado: "COBRADO", confirmadoPor: null },
  });
  if (cobradosSinConfirmar > 0) {
    violations++;
    console.error(
      `✗ INV3 VIOLADO: ${cobradosSinConfirmar} Cobro(s) en estado COBRADO sin confirmadoPor (¿alguien escribió estado sin pasar por el chokepoint?).`,
    );
  } else {
    console.log("✓ INV3: todo Cobro COBRADO tiene confirmadoPor.");
  }

  return violations;
}

main()
  .then(async (v) => {
    console.log(v === 0 ? "\n✅ Invariantes OK." : `\n❌ ${v} invariante(s) violado(s).`);
    await prisma.$disconnect();
    process.exit(v === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
