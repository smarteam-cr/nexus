/**
 * scripts/cerrar-corridas-colgadas.ts
 *
 * Marca como ERROR las corridas de agente que quedaron `PENDING`/`RUNNING` sin dar señales de
 * vida. Son filas cuyo proceso murió en el medio (deploy, reinicio, caída): nadie escribió el
 * estado final y quedan "Corriendo…" para siempre.
 *
 * DRY-RUN por defecto. Con `--apply` escribe (y, contra producción, exige `ALLOW_PROD_WRITE=1`).
 *
 * ── ESTO NO ES EL ARREGLO, ES LA LIMPIEZA ────────────────────────────────────
 * El feed ya NO le cree al estado crudo: aplica el corte por latido en la lectura
 * (`lib/agents/run-colgada.ts`), así que una colgada se reporta como fallada aunque la fila
 * siga diciendo `RUNNING`. Este script existe para SANEAR EL DATO —que la base deje de
 * afirmar algo falso— y para el caso puntual del 2026-08-02: una corrida del detalle de
 * cronograma con 546 horas en `RUNNING`.
 *
 * ── NO CORRE SOLO, Y ES A PROPÓSITO ──────────────────────────────────────────
 * No es un cron. Cerrar una corrida es escribir sobre datos reales, y el sistema ya se
 * comporta bien sin hacerlo: la lectura cubre el síntoma para todas las familias. Convertirlo
 * en automático sería agregar un tercer barredor —justo lo que este diseño evitó.
 *
 * Uso:
 *   npx tsx scripts/cerrar-corridas-colgadas.ts
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/cerrar-corridas-colgadas.ts --apply
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { MS_SIN_LATIDO_PARA_COLGADA, cortePorLatido } from "@/lib/agents/run-colgada";

const MOTIVO =
  "La corrida se interrumpió (el proceso murió antes de terminar) y no dejó resultado. " +
  "Cerrada por scripts/cerrar-corridas-colgadas.ts.";

async function main() {
  const apply = resolverApply();
  const corte = cortePorLatido();
  const minutos = MS_SIN_LATIDO_PARA_COLGADA / 60000;

  const colgadas = await prisma.agentRun.findMany({
    where: { status: { in: ["PENDING", "RUNNING"] }, updatedAt: { lt: corte } },
    select: {
      id: true, status: true, updatedAt: true, triggeredByEmail: true,
      agent: { select: { name: true } },
      client: { select: { name: true } },
    },
    orderBy: { updatedAt: "asc" },
  });

  console.log(`Sin latido hace más de ${minutos} min: ${colgadas.length}\n`);
  for (const r of colgadas) {
    const horas = (Date.now() - r.updatedAt.getTime()) / 3600000;
    console.log(
      `· ${r.agent?.name ?? "(sin agente)"} — ${r.client?.name ?? "sin cliente"} · ${r.status} hace ${horas.toFixed(1)}h`,
    );
    console.log(`    id=${r.id} · disparó: ${r.triggeredByEmail ?? "SISTEMA"}`);
  }
  if (colgadas.length === 0) return;

  if (!apply) {
    console.log(`\n(dry-run) se marcarían ${colgadas.length} como ERROR. Repetí con --apply.`);
    return;
  }

  /* Se re-filtra por el corte DENTRO del update en vez de usar los ids leídos arriba: entre la
     lectura y la escritura una corrida pudo revivir (escribir su fase y volver a estar viva).
     Con los ids sueltos la mataríamos igual; con la condición, se salva sola. */
  const r = await prisma.agentRun.updateMany({
    where: { status: { in: ["PENDING", "RUNNING"] }, updatedAt: { lt: cortePorLatido() } },
    data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: MOTIVO }) },
  });
  console.log(`\n✓ ${r.count} corrida(s) cerradas como ERROR.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
