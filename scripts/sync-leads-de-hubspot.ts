/**
 * scripts/sync-leads-de-hubspot.ts — la carga inicial de los LEADS de HubSpot de las empresas de Nexus (B3 etapa 1). De
 * ahí en adelante lo mantiene el job `hubspot-leads` cada hora (lib/leads/copia-server.ts). Solo LEE HubSpot.
 *
 * Simulacro por defecto: lee todos los leads, decide de qué cliente es cada uno y cuenta el plan, sin escribir nada. Con
 * `--apply` (+ ALLOW_PROD_WRITE=1 contra producción) escribe `LeadDeHubspot`.
 *
 * Requisito para `--apply`: scripts/sql/2026-10-25-hubspot-contexto.sql aplicado.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/sync-leads-de-hubspot.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/sync-leads-de-hubspot.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { copiarLeads } from "@/lib/leads/copia-server";

async function main() {
  const apply = resolverApply({ tablas: ["LeadDeHubspot", "CronJobState"] });
  console.log(`\nLeads de HubSpot${apply ? "" : "  (simulacro: solo lee)"}\n`);
  const r = await copiarLeads({ escribir: apply });
  if (r.locked) {
    console.log("Otra corrida tiene el candado (el job o la otra PC). No se hizo nada.");
    return;
  }
  if (r.sinPermiso) {
    console.log("SIN PERMISO en HubSpot para leer los leads (crm.objects.leads.read). No se tocó nada.");
    return;
  }
  console.log(
    `  ${r.leidos} leads leídos${r.completa ? "" : " (la lista quedó incompleta: no se dio de baja nada por ausencia)"} · ${r.creados} nuevos · ${r.actualizados} con cambios · ${r.bajas} de baja · ${r.sinCambio} sin cambio`,
  );
  console.log(`  ${r.deNadie} de nadie de Nexus${r.ambiguos ? ` · ⚠ ${r.ambiguos} de dos clientes (no se guardan)` : ""}${r.ilegibles ? ` · ⚠ ${r.ilegibles} con asociaciones ilegibles` : ""}`);
  const nombres = new Map((await prisma.client.findMany({ where: { id: { in: [...r.porCliente.keys()] } }, select: { id: true, name: true, kind: true } })).map((c) => [c.id, c]));
  const filas = [...r.porCliente.entries()].map(([id, n]) => ({ n, nombre: nombres.get(id)?.name ?? id, kind: nombres.get(id)?.kind ?? "?" })).sort((a, b) => b.n - a.n);
  console.log(`\n  Por cliente, ${filas.length}:`);
  for (const f of filas) console.log(`  ${f.nombre.slice(0, 40).padEnd(40)} ${f.kind.padEnd(10)} ${String(f.n).padStart(4)}`);
  if (!apply) console.log("\n(simulacro: no se escribió nada.)");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
