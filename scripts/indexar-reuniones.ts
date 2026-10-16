/**
 * scripts/indexar-reuniones.ts
 *
 * Parte en turnos las transcripciones de las reuniones con clientes y prospectos de los últimos 180 días, para la
 * búsqueda (2026-10-16, etapa 4c de docs/mi-dia-plan.md). Es la carga inicial: de ahí en adelante lo mantiene el job
 * `indice-de-reuniones`. Simulacro por defecto; escribe la base solo con `--apply` + ALLOW_PROD_WRITE=1.
 *
 * Requisito: scripts/sql/2026-10-16-busqueda-en-reuniones.sql aplicado.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/indexar-reuniones.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/indexar-reuniones.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { indexarReuniones } from "@/lib/busqueda/indexar-server";
import { prisma } from "@/lib/db/prisma";

async function main() {
  const apply = resolverApply({ tablas: ["TurnoDeReunion", "ReunionIndexada"] });
  console.log(`\nLa búsqueda en las reuniones${apply ? "" : "  (simulacro)"}\n`);
  if (!apply) {
    const r = await indexarReuniones({ escribir: false, limite: 100_000 });
    if (r.sinTabla) return console.log("Falta la tabla: corre primero scripts/sql/2026-10-16-busqueda-en-reuniones.sql.");
    console.log(`  reuniones por partir: ${r.miradas} · turnos que quedarían: ${r.turnos} · sin cambio: ${r.sinCambio}`);
    console.log("\n(simulacro: no se escribió nada. Con --apply se guarda.)");
    return;
  }
  let vueltas = 0;
  for (;;) {
    const r = await indexarReuniones({ escribir: true, limite: 100 });
    if (r.sinTabla) return console.log("Falta la tabla: corre primero scripts/sql/2026-10-16-busqueda-en-reuniones.sql.");
    vueltas++;
    console.log(`  vuelta ${vueltas}: ${r.partidas} partidas (${r.turnos} turnos), ${r.sinCambio} sin cambio · faltan ${r.faltan}`);
    if (r.miradas === 0 || r.faltan === 0) break;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
