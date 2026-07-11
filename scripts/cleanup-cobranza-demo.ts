/**
 * scripts/cleanup-cobranza-demo.ts — borra TODA la data sembrada por
 * seed-cobranza-demo.ts y seed-cobranza-demo-historia.ts (marca "[demo
 * cobranza]" + Clients demo-* + snapshots del seed de historia).
 *
 * Qué borra:
 *  1. CuentaFinanciera cuyas notas contienen la marca O cuyo fuenteIdExterno
 *     empieza con "demo-" → el CASCADE se lleva servicios, planes, cuotas,
 *     cobros (incluida la historia de pagos y promesas del seed de fase 3),
 *     alertas y bitácora de esa cuenta.
 *  2. Clients creados por el seed (source="manual" + sourceExternalId "demo-*")
 *     SOLO si tienen 0 proyectos (guard duro — jamás borra un cliente real).
 *  3. SnapshotCartera con triggeredBy="seed-demo-historia" (la serie retroactiva).
 *  4. Con --snapshots-todos: TODOS los SnapshotCartera — reset total de la
 *     historia de cortes. ⚠ Los cortes que corriste DURANTE el demo (manual/
 *     cron) llevan métricas contaminadas con montos demo: para "empezar con
 *     datos reales" de verdad, usá este flag y la historia arranca limpia en
 *     el primer corte real.
 *
 * Qué NO toca: los Clients reales de los escenarios A-D (solo pierden su cuenta
 * demo y vuelven a "sin configurar") y los AgentRun (trazabilidad).
 *
 * DRY-RUN por default; escribe SOLO con --apply (local == PROD).
 *
 *   npx tsx scripts/cleanup-cobranza-demo.ts                       # dry-run
 *   npx tsx scripts/cleanup-cobranza-demo.ts --apply               # borra
 *   npx tsx scripts/cleanup-cobranza-demo.ts --snapshots-todos --apply  # + reset de cortes
 */
import "dotenv/config";
import { prisma } from "@/lib/db/prisma";

const APPLY = process.argv.includes("--apply");
const SNAPSHOTS_TODOS = process.argv.includes("--snapshots-todos");
const MARK = "[demo cobranza]";
const TRIGGER_HISTORIA = "seed-demo-historia";

async function main() {
  console.log(`Modo: ${APPLY ? "APPLY (borra)" : "DRY-RUN (no borra)"}\n`);

  // 1) Cuentas demo: por marca en notas o por procedencia demo-*.
  const cuentas = await prisma.cuentaFinanciera.findMany({
    where: {
      OR: [{ notas: { contains: MARK } }, { fuenteIdExterno: { startsWith: "demo-" } }],
    },
    select: {
      id: true,
      clientId: true,
      fuenteIdExterno: true,
      client: { select: { name: true } },
      _count: { select: { servicios: true, cobros: true, alertas: true, bitacora: true } },
    },
  });
  console.log(`Cuentas demo encontradas: ${cuentas.length}`);
  for (const c of cuentas) {
    console.log(
      `  ✖ "${c.client.name}" — ${c._count.servicios} servicio(s), ${c._count.cobros} cobro(s), ${c._count.alertas} alerta(s), ${c._count.bitacora} bitácora(s) (cascade)`,
    );
  }
  if (APPLY && cuentas.length > 0) {
    await prisma.cuentaFinanciera.deleteMany({ where: { id: { in: cuentas.map((c) => c.id) } } });
  }

  // 2) Clients creados por el seed (empresa sin proyecto). Guard: 0 proyectos.
  const clientsDemo = await prisma.client.findMany({
    where: { source: "manual", sourceExternalId: { startsWith: "demo-" } },
    select: { id: true, name: true, _count: { select: { projects: true } } },
  });
  for (const cl of clientsDemo) {
    if (cl._count.projects > 0) {
      console.log(`  ⚠ Client "${cl.name}" tiene ${cl._count.projects} proyecto(s) — NO se borra (revisar a mano).`);
      continue;
    }
    console.log(`  ✖ Client demo "${cl.name}" (0 proyectos)`);
    if (APPLY) await prisma.client.delete({ where: { id: cl.id } });
  }

  // 3) Snapshots de la serie retroactiva del seed de historia (fase 3).
  const snapsSeed = await prisma.snapshotCartera.count({ where: { triggeredBy: TRIGGER_HISTORIA } });
  console.log(`\nSnapshots del seed de historia (${TRIGGER_HISTORIA}): ${snapsSeed}`);
  if (APPLY && snapsSeed > 0) {
    await prisma.snapshotCartera.deleteMany({ where: { triggeredBy: TRIGGER_HISTORIA } });
  }

  // 4) Reset TOTAL de cortes (opt-in): los cortes reales corridos durante el
  //    demo llevan métricas contaminadas con montos demo — para arrancar la
  //    historia limpia se borran todos y el primer corte real la inaugura.
  const snapsResto = await prisma.snapshotCartera.count(
    { where: { triggeredBy: { not: TRIGGER_HISTORIA } } },
  );
  if (SNAPSHOTS_TODOS) {
    console.log(`Snapshots restantes (cortes reales/manual/cron): ${snapsResto} — SE BORRAN (--snapshots-todos).`);
    if (APPLY && snapsResto > 0) await prisma.snapshotCartera.deleteMany({});
  } else if (snapsResto > 0) {
    console.log(
      `ℹ Quedan ${snapsResto} snapshot(s) de cortes corridos durante el demo — sus métricas incluyen montos demo. Para resetear la historia: --snapshots-todos.`,
    );
  }

  // 5) Importaciones de prueba del wizard (si Elías subió CSVs de demo, opcional):
  //    solo se listan — se borran a mano desde la UI (DESCARTAR) o acá con otra corrida.
  const imports = await prisma.importacionCobranza.count();
  if (imports > 0) console.log(`\nℹ Hay ${imports} batch(es) de importación en staging — revisalos en /cobranza/importar (no se tocan acá).`);

  console.log(
    `\n${APPLY ? "✓ Limpieza aplicada." : `Dry-run: se borrarían ${cuentas.length} cuenta(s) + ${clientsDemo.filter((c) => c._count.projects === 0).length} client(s) demo + ${snapsSeed}${SNAPSHOTS_TODOS ? ` + ${snapsResto}` : ""} snapshot(s). Corré con --apply.`}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
