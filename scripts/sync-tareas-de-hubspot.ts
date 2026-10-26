/**
 * scripts/sync-tareas-de-hubspot.ts
 *
 * Trae las tareas de HubSpot del equipo a Tareas internas, y escribe en HubSpot lo que cambió en Nexus (2026-10-15,
 * etapa 3 de docs/mi-dia-plan.md). Es la carga inicial: de ahí en adelante lo hace el job `tareas-hubspot` cada 15
 * minutos. Simulacro por defecto (solo lee HubSpot y la base); con `--apply` escribe en la base y en HubSpot.
 *
 * Requisito: scripts/sql/2026-10-15-tareas-de-hubspot.sql aplicado.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/sync-tareas-de-hubspot.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/sync-tareas-de-hubspot.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { copiarTareasDeHubspot } from "@/lib/tareas-hubspot/sync-server";
import { prisma } from "@/lib/db/prisma";

async function main() {
  const apply = resolverApply({ tablas: ["Tarea", "TareaEvento", "ResultadoDeSemana"] });
  console.log(`\nTareas de HubSpot${apply ? "" : "  (simulacro)"}\n`);
  const r = await copiarTareasDeHubspot({ dryRun: !apply });
  if (r.locked) {
    console.log("Otra corrida tiene el candado (el job o la otra PC). No se hizo nada.");
    return;
  }
  console.log(`  traídas de HubSpot: ${r.traidas}`);
  console.log(`  nuevas en Nexus: ${r.nuevas} · cambios de HubSpot aplicados: ${r.aplicadasEnNexus} · escritas en HubSpot: ${r.escritasEnHubspot}`);
  console.log(`  pasaron a «Ya no se hará» (borradas o de alguien de afuera): ${r.cerradas} · sin cambios: ${r.sinCambios}`);
  console.log(`  seguimientos de Nexus creados en HubSpot: ${r.creadasEnHubspot} (con TAREAS_SEGUIMIENTO_EN_HUBSPOT=1)`);
  for (const e of r.errores) console.log(`  ⚠ ${e}`);
  if (!apply) console.log("\n(simulacro: no se escribió nada. Con --apply se guarda.)");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
