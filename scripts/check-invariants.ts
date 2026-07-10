import "dotenv/config";
import { $Enums } from "@prisma/client";
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
 *   3. Ningún Cobro COBRADO sin confirmadoPor (Cobranza: el humano confirma lo que
 *      mueve dinero; chokepoint único lib/cobranza/mutations.ts#cambiarEstadoCobro).
 *   4. Enums del CLIENTE GENERADO ⊆ enums de Postgres. Atrapa el bug de las "migraciones
 *      silenciosas" (BlockSource.MODIFIED, post-mortem en ARCHITECTURE.md): si el código
 *      conoce un valor que la DB no tiene, el próximo write con ese valor revienta. Se
 *      compara `$Enums` de @prisma/client (lo que el código EJECUTA — el dmmf del client
 *      de este setup viene vacío) contra pg_enum (lo que la DB acepta). Los valores que
 *      la DB tiene DE MÁS no violan (drift de la otra PC aún sin mergear: solo warning).
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

  // ── Inv 4: enums del cliente generado ⊆ enums de Postgres ──
  const dbEnums = await prisma.$queryRaw<Array<{ typname: string; enumlabel: string }>>`
    SELECT t.typname, e.enumlabel
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'`;
  const dbByEnum = new Map<string, Set<string>>();
  for (const r of dbEnums) {
    if (!dbByEnum.has(r.typname)) dbByEnum.set(r.typname, new Set());
    dbByEnum.get(r.typname)!.add(r.enumlabel);
  }
  const missing: string[] = []; // el código conoce un valor que la DB no tiene → write reventaría
  const extra: string[] = []; // la DB tiene de más (drift de la otra PC sin mergear) → warning
  for (const [enumName, values] of Object.entries($Enums)) {
    const dbValues = dbByEnum.get(enumName);
    if (!dbValues) {
      missing.push(`${enumName} (enum entero ausente en la DB)`);
      continue;
    }
    for (const v of Object.values(values as Record<string, string>)) {
      if (!dbValues.has(v)) missing.push(`${enumName}.${v}`);
    }
    for (const v of dbValues) {
      if (!Object.values(values as Record<string, string>).includes(v)) extra.push(`${enumName}.${v}`);
    }
  }
  if (missing.length > 0) {
    violations++;
    console.error(`✗ INV4 VIOLADO: el cliente Prisma conoce ${missing.length} valor(es) de enum que la DB NO tiene — un write con ellos falla:`);
    for (const m of missing.slice(0, 15)) console.error(`    - ${m}`);
    console.error('  Corré `npm run db:sync` (¡nunca `db push` solo!) y reiniciá el server. Ver ARCHITECTURE.md ("migraciones silenciosas").');
  } else {
    console.log(`✓ INV4: los ${Object.keys($Enums).length} enums del cliente generado existen completos en la DB.`);
  }
  if (extra.length > 0) {
    console.warn(`⚠ INV4 (no bloquea): la DB tiene ${extra.length} valor(es) de enum que este cliente no conoce (¿drift de la otra PC sin mergear?): ${extra.slice(0, 8).join(", ")}`);
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
