/**
 * scripts/sync-negocios-abiertos.ts
 *
 * Trae los negocios abiertos de HubSpot a `NegocioAbierto` y el dueño de cada empresa a `Client` (2026-10-14, etapa 1
 * de docs/mi-dia-plan.md). Es la carga inicial: de ahí en adelante lo mantiene el job `negocios-abiertos` cada hora.
 * Solo LEE HubSpot (también el siguiente paso de cada equipo, que vuelve a `SiguientePaso`). Simulacro por defecto; escribe la base solo con `--apply` + ALLOW_PROD_WRITE=1.
 *
 * Requisito: scripts/sql/2026-10-14-negocios-abiertos.sql aplicado.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/sync-negocios-abiertos.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/sync-negocios-abiertos.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { syncNegociosAbiertos } from "@/lib/ventas/sync-negocios-abiertos";
import { prisma } from "@/lib/db/prisma";

async function main() {
  const apply = resolverApply({ tablas: ["NegocioAbierto", "Client", "SiguientePaso"] });
  console.log(`\nNegocios abiertos de HubSpot${apply ? "" : "  (simulacro)"}\n`);
  const r = await syncNegociosAbiertos({ dryRun: !apply });
  if (r.locked) {
    console.log("Otra corrida tiene el candado (el job o la otra PC). No se hizo nada.");
    return;
  }
  console.log(`  traídos de HubSpot: ${r.traidos}`);
  console.log(`  nuevos: ${r.altas} · con cambios: ${r.actualizados} · sin cambio: ${r.sinCambio} · cerrados: ${r.cerrados}`);
  console.log(`  dueños de empresa actualizados en Nexus: ${r.duenosActualizados}`);
  console.log(`  siguientes pasos que cambiaron en HubSpot: ${r.pasos.nuevos} nuevos, ${r.pasos.cerrados} borrados allá`);
  if (r.parcial) console.log("  ⚠ CORRIDA PARCIAL: no se cerró ningún negocio.");
  for (const e of r.errores) console.log(`  ⚠ ${e}`);
  if (!apply) console.log("\n(simulacro: no se escribió nada. Con --apply se guarda.)");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
