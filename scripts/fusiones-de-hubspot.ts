/**
 * scripts/fusiones-de-hubspot.ts — las FUSIONES de HubSpot y lo que en Nexus todavía apunta a un id absorbido (U9).
 *
 * Es lo mismo que hace el job `hubspot-fusiones` cada día (lib/hubspot/fusiones-server.ts). Simulacro por defecto: busca
 * en HubSpot (solo lee) y dice qué fichas, proyectos, negocios, contactos y tickets de Nexus apuntan a un id que ya se
 * fusionó. Con `--apply` (+ ALLOW_PROD_WRITE=1 contra producción) guarda los pares en `FusionDeHubspot` y el informe.
 *
 * NO reapunta nada. Para eso, con su propio simulacro:
 *   · la ficha de la empresa y sus business cases → scripts/reapuntar-empresa-fusionada.ts
 *   · los proyectos (0-970)                       → scripts/proyectos-fusionados-en-hubspot.ts
 *   · los contactos y los tickets                  → nada: la copia de cada hora sigue las asociaciones.
 *
 * Requisito para `--apply`: scripts/sql/2026-10-25-hubspot-contexto.sql aplicado.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/fusiones-de-hubspot.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/fusiones-de-hubspot.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { revisarFusiones } from "@/lib/hubspot/fusiones-server";

async function main() {
  const apply = resolverApply({ tablas: ["FusionDeHubspot", "CronJobState"] });
  console.log(`\nFusiones de HubSpot${apply ? "" : "  (simulacro: solo lee)"}\n`);
  const r = await revisarFusiones({ escribir: apply });
  if (r.sinTabla) console.log("⚠ Falta la tabla FusionDeHubspot (scripts/sql/2026-10-25-hubspot-contexto.sql): se mira solo lo de hoy.\n");
  const n = (v: number | null) => (v === null ? "no se pudo leer" : String(v));
  console.log(`  En HubSpot: ${n(r.pares.empresa)} empresas · ${n(r.pares.contacto)} contactos · ${n(r.pares.negocio)} negocios · ${n(r.pares.proyecto)} proyectos · ${n(r.pares.ticket)} tickets absorbidos`);
  console.log(`\n  Fichas de Nexus con la empresa vieja: ${r.fichas.length}${r.businessCases ? ` (+ ${r.businessCases} business cases)` : ""}`);
  for (const f of r.fichas) {
    console.log(`    · ${f.nombre}: ${f.idViejo} → ${f.idNuevo}${f.sobrevivienteEnOtraFicha ? `  ⚠ «${f.sobrevivienteEnOtraFicha}» ya tiene la nueva: son la misma empresa (merge-duplicate-clients)` : ""}`);
  }
  console.log(`  Proyectos con el id viejo: ${r.proyectos.length}`);
  for (const p of r.proyectos) console.log(`    · ${p.nombre}: ${p.idViejo} → ${p.idNuevo}`);
  console.log(`  Proyectos con el negocio viejo: ${r.negociosDeProyectos.length}`);
  for (const p of r.negociosDeProyectos) console.log(`    · ${p.nombre}: ${p.idViejo} → ${p.idNuevo}`);
  console.log(`  Contactos copiados con el id viejo (se arreglan solos en la copia): ${r.contactosVigentes}`);
  console.log(`  Tickets copiados con el id viejo (se arreglan solos en la copia): ${r.ticketsVigentes}`);
  if (r.fichas.length) console.log("\n  → La ficha: npx tsx scripts/reapuntar-empresa-fusionada.ts (simulacro) y después --apply.");
  if (r.proyectos.length) console.log("  → Los proyectos: npx tsx scripts/proyectos-fusionados-en-hubspot.ts (simulacro) y después --apply.");
  if (!apply) console.log("\n(simulacro: no se escribió nada.)");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
