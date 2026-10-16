/**
 * scripts/sync-contactos-y-tickets.ts
 *
 * Trae los contactos y los tickets de HubSpot de las empresas que están en Nexus a `ContactoDeHubspot` y
 * `TicketDeHubspot` (2026-10-16, etapa 6a de docs/mi-dia-plan.md). Es la carga inicial: de ahí en adelante lo mantiene
 * el job `contactos-y-tickets` cada hora. Solo LEE HubSpot. Simulacro por defecto; escribe la base solo con `--apply` +
 * ALLOW_PROD_WRITE=1.
 *
 * Requisito: scripts/sql/2026-10-16-contactos-y-tickets.sql aplicado.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/sync-contactos-y-tickets.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/sync-contactos-y-tickets.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { copiarContactosYTickets, type ResultadoDeLaMitad } from "@/lib/contactos/copia-server";
import { prisma } from "@/lib/db/prisma";

function linea(nombre: string, m: ResultadoDeLaMitad) {
  if (m.sinPermiso) return `  ${nombre}: sin permiso en HubSpot (no se tocó nada)`;
  return (
    `  ${nombre}: ${m.leidos} leídos · ${m.creados} nuevos · ${m.actualizados} con cambios · ${m.sinCambio} sin cambio · ${m.bajas} de baja` +
    (m.ilegibles ? ` · ⚠ ${m.ilegibles} empresas sin leer` : "") +
    (m.truncadas ? ` · ⚠ ${m.truncadas} empresas con más de 500 (se copian las primeras)` : "")
  );
}

async function main() {
  const apply = resolverApply({ tablas: ["ContactoDeHubspot", "TicketDeHubspot"] });
  console.log(`\nContactos y tickets de HubSpot${apply ? "" : "  (simulacro)"}\n`);
  const r = await copiarContactosYTickets({ escribir: apply });
  if (r.locked) {
    console.log("Otra corrida tiene el candado (el job o la otra PC). No se hizo nada.");
    return;
  }
  console.log(`  empresas de Nexus con su empresa de HubSpot: ${r.empresas}`);
  console.log(linea("contactos", r.contactos));
  console.log(linea("tickets", r.tickets));
  for (const e of r.errores) console.log(`  ⚠ ${e}`);
  if (!apply) console.log("\n(simulacro: no se escribió nada. Con --apply se guarda.)");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
