/**
 * scripts/hubspot-crear-propiedades-empresa.ts — el grupo «Nexus · Empresa» y las 8 propiedades del paso uno en la
 * empresa del HubSpot de Smarteam (R2, etapa 1; preparado el 2026-10-24).
 *
 * Las definiciones salen de lib/hubspot/empresa.ts (`definicionesDelPasoUno`): listas y fechas, nunca texto libre
 * (docs/empresa-datos-hubspot-plan.md, decisión 5). Hoy SOLO LEE: dice qué existe y qué falta. Crear propiedades es
 * escribir en el portal de producción: espera al transporte único de HubSpot (U6) y al sí de Elías, así que `--apply`
 * se niega. Cuando U6 esté en `main`, este script crea lo que falta por ese transporte (molde:
 * scripts/hubspot-crear-propiedades-ficha.ts) y nunca toca una propiedad que ya existe.
 *
 * Uso: npx tsx scripts/hubspot-crear-propiedades-empresa.ts
 */
import "dotenv/config";
import { assertProdWriteAllowed } from "./lib/guard";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { definicionesDelPasoUno, GRUPO_NEXUS_EMPRESA } from "@/lib/hubspot/empresa";
import { prisma } from "@/lib/db/prisma";

async function main() {
  if (process.argv.includes("--apply")) {
    // El candado anti-producción de siempre (INV12), y además, hoy, la negativa: todavía no escribe.
    assertProdWriteAllowed("scripts/hubspot-crear-propiedades-empresa.ts (HubSpot)");
    console.error("⛔ Crear las propiedades espera al transporte único de HubSpot (U6) y al sí de Elías. Hoy este script solo lee.");
    process.exit(1);
  }
  const hs = await getSystemHubspotClient();
  const grupo = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/companies/groups/${GRUPO_NEXUS_EMPRESA.name}` }).catch(() => null);
  console.log(`Grupo «${GRUPO_NEXUS_EMPRESA.label}»: ${grupo?.ok ? "ya existe" : "FALTA"}`);
  let faltan = 0;
  for (const def of definicionesDelPasoUno()) {
    const r = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/companies/${def.name}` }).catch(() => null);
    if (r?.ok) {
      console.log(`  ✓ ${def.name} ya existe`);
      continue;
    }
    faltan++;
    console.log(`  · FALTA ${def.name} «${def.label}» (${def.type}${def.options ? `: ${def.options.map((o) => o.value).join(", ")}` : ""})`);
  }
  console.log(`\n${faltan} por crear. Se crean cuando U6 esté en main, con el sí de Elías.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
