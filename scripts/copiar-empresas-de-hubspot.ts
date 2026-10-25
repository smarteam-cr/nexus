/**
 * scripts/copiar-empresas-de-hubspot.ts — la copia de los datos de la empresa desde HubSpot, a mano (R2, 2026-10-25).
 *
 * Lo mismo que el job `empresa-copia-de-hubspot` (lib/clients/copia-de-hubspot-server.ts): lee las empresas de HubSpot
 * (solo lectura) y pasa cada valor por la regla de quién manda, con fuente `hubspot`. SIMULACRO por defecto: cada
 * empresa corre en su transacción y se deshace, así que el informe dice exactamente qué se aplicaría y qué quedaría como
 * propuesta. Sin `--todas`, solo las que cambiaron desde la última corrida del job.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/copiar-empresas-de-hubspot.ts --todas
 *   npx tsx scripts/copiar-empresas-de-hubspot.ts --solo <clientId>
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/copiar-empresas-de-hubspot.ts --todas --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { copiarEmpresasDeHubspot } from "@/lib/clients/copia-de-hubspot-server";

const APPLY = resolverApply({ tablas: ["Client", "PropuestaDeDato"] });
const i = process.argv.indexOf("--solo");
const SOLO = i >= 0 ? process.argv[i + 1] : undefined;

async function main() {
  const r = await copiarEmpresasDeHubspot({ apply: APPLY, soloClientId: SOLO, todas: process.argv.includes("--todas") });
  if (r.locked) {
    console.log("Otra copia está corriendo (el candado está tomado). Prueba en unos minutos.");
    return;
  }
  for (const d of r.detalle) {
    console.log(`${d.nombre}: ${d.aplicados.length ? `se aplica ${d.aplicados.join(", ")}` : ""}${d.aplicados.length && d.propuestas.length ? " · " : ""}${d.propuestas.length ? `queda como propuesta ${d.propuestas.join(", ")}` : ""}`);
  }
  for (const e of r.errores) console.log(`  ⚠ ${e}`);
  console.log(`\n${APPLY ? "APLICADO" : "SIMULACRO"}: ${r.cambiaron} de ${r.empresas} empresas con cambios · ${r.aplicados} datos aplicados · ${r.propuestas} propuestas.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
