/**
 * scripts/hubspot-crear-propiedades-siguiente-paso.ts
 *
 * Crea en el HubSpot de Smarteam (cuenta del sistema) el grupo «Nexus · Siguiente paso» y las 9
 * propiedades de siguiente paso (Ventas, CS y Dev: qué, fecha y responsable) en empresas, negocios y
 * proyectos, con los mismos nombres en los tres (lib/siguiente-paso/propiedades.ts). Aprobado por Elías
 * el 2026-10-14 (docs/mi-dia-plan.md).
 *
 * DRY-RUN por defecto: lista qué existe y qué falta. Con `--apply` crea SOLO lo que falta (correrlo dos
 * veces no duplica ni pisa nada; una propiedad que ya existe no se toca aunque sea distinta: se avisa).
 *
 * Las de proyectos piden `crm.schemas.projects.write` (concedido al reconectar el 2026-10-14).
 *
 * El guard: el script no escribe en la base, pero pedir el cliente de HubSpot puede renovar el token
 * del sistema, y eso es una escritura en prod.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/hubspot-crear-propiedades-siguiente-paso.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/hubspot-crear-propiedades-siguiente-paso.ts --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { assertProdWriteAllowed } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import {
  GRUPO_DEL_SIGUIENTE_PASO,
  OBJETOS_CON_SIGUIENTE_PASO,
  propiedadesDelSiguientePaso,
} from "@/lib/siguiente-paso/propiedades";

const APPLY = process.argv.includes("--apply");
const NOMBRE_DEL_OBJETO: Record<string, string> = { companies: "Empresas", deals: "Negocios", "0-970": "Proyectos" };

async function main() {
  if (APPLY) assertProdWriteAllowed("scripts/hubspot-crear-propiedades-siguiente-paso.ts (HubSpot)");
  const hs = await getSystemHubspotClient();
  let faltan = 0;

  for (const objeto of OBJETOS_CON_SIGUIENTE_PASO) {
    console.log(`\n${NOMBRE_DEL_OBJETO[objeto]} (${objeto})`);

    const grupo = await hs
      .apiRequest({ method: "GET", path: `/crm/v3/properties/${objeto}/groups/${GRUPO_DEL_SIGUIENTE_PASO.name}` })
      .catch((e) => e);
    const grupoExiste = grupo?.ok === true;
    console.log(`  Grupo «${GRUPO_DEL_SIGUIENTE_PASO.label}»: ${grupoExiste ? "ya existe" : "FALTA"}`);
    if (!grupoExiste) {
      faltan++;
      if (APPLY) {
        const r = await hs.apiRequest({
          method: "POST",
          path: `/crm/v3/properties/${objeto}/groups`,
          body: GRUPO_DEL_SIGUIENTE_PASO,
        });
        if (!r.ok) throw new Error(`No se pudo crear el grupo en ${objeto} (${r.status}): ${(await r.text()).slice(0, 300)}`);
        console.log("    → grupo creado");
      }
    }

    for (const [i, def] of propiedadesDelSiguientePaso().entries()) {
      const r = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/${objeto}/${def.name}` }).catch((e) => e);
      if (r?.ok === true) {
        const actual = (await r.json()) as { label?: string; fieldType?: string };
        const aviso =
          actual.label !== def.label || actual.fieldType !== def.fieldType
            ? ` ⚠ en HubSpot es «${actual.label}» (${actual.fieldType}); no se toca`
            : "";
        console.log(`  ✓ ${def.name} ya existe${aviso}`);
        continue;
      }
      faltan++;
      console.log(`  · ${def.name} — «${def.label}» (${def.fieldType}) FALTA`);
      if (!APPLY) continue;
      const c = await hs.apiRequest({
        method: "POST",
        path: `/crm/v3/properties/${objeto}`,
        body: { ...def, groupName: GRUPO_DEL_SIGUIENTE_PASO.name, displayOrder: i + 1 },
      });
      if (!c.ok) throw new Error(`No se pudo crear ${def.name} en ${objeto} (${c.status}): ${(await c.text()).slice(0, 300)}`);
      console.log("    → creada");
    }
  }

  if (!APPLY) console.log(`\nDRY-RUN: faltan ${faltan} (grupos y propiedades). Con --apply se crean.`);
  else console.log("\nListo.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
