/**
 * scripts/hubspot-crear-propiedades-ficha.ts
 *
 * Crea en la EMPRESA del HubSpot de Smarteam (cuenta del sistema) el grupo «Nexus · Información
 * del cliente» y las propiedades de la ficha (lib/clients/ficha.ts). Las definiciones salen de
 * `CAMPOS_DE_LA_FICHA`: los nombres que crea este script son EXACTAMENTE los que después escribe
 * `lib/clients/ficha-hubspot.ts`, porque los dos leen la misma lista.
 *
 * DRY-RUN por defecto: lista qué existe y qué falta. Con `--apply` crea SOLO lo que falta
 * (idempotente: correrlo dos veces no duplica ni pisa nada; una propiedad que ya existe no se
 * toca aunque su etiqueta sea otra — se reporta).
 *
 * Aprobado por Elías el 2026-09-27: 7 propiedades de texto con formato + «Apertura a la asesoría»
 * como lista. Lo interno que no es propiedad (por qué de la apertura, motivación de compra) va en
 * la nota, que no necesita crear nada.
 *
 * El guard: el script no escribe en la base, pero el token del sistema puede refrescarse al pedir
 * el cliente de HubSpot, y eso SÍ es una escritura en prod.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/hubspot-crear-propiedades-ficha.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/hubspot-crear-propiedades-ficha.ts --apply
 */
import "dotenv/config";
import { assertProdWriteAllowed } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { CAMPOS_DE_LA_FICHA, GRUPO_DE_PROPIEDADES, OPCIONES_DE_APERTURA } from "@/lib/clients/ficha";

const APPLY = process.argv.includes("--apply");

type Definicion = Record<string, unknown> & { name: string; label: string };

function definiciones(): Definicion[] {
  const out: Definicion[] = [];
  CAMPOS_DE_LA_FICHA.forEach((c, i) => {
    const base = {
      label: c.etiqueta,
      description: `${c.ayuda}${c.alCliente ? "" : " INTERNO: nunca va a un documento del cliente."} Lo escribe Nexus cuando el CSE confirma la ficha.`,
      groupName: GRUPO_DE_PROPIEDADES.name,
      displayOrder: i + 1,
    };
    if (c.destino.tipo === "texto") out.push({ ...base, name: c.destino.propiedad, type: "string", fieldType: "html" });
    if (c.destino.tipo === "lista") {
      out.push({
        ...base,
        name: c.destino.propiedad,
        type: "enumeration",
        fieldType: "select",
        options: OPCIONES_DE_APERTURA.map((o, j) => ({ label: o.etiqueta, value: o.valor, displayOrder: j + 1 })),
      });
    }
  });
  return out;
}

async function main() {
  if (APPLY) assertProdWriteAllowed("scripts/hubspot-crear-propiedades-ficha.ts (HubSpot)");
  const hs = await getSystemHubspotClient();

  const grupo = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/companies/groups/${GRUPO_DE_PROPIEDADES.name}` }).catch((e) => e);
  const grupoExiste = grupo?.ok === true;
  console.log(`Grupo «${GRUPO_DE_PROPIEDADES.label}»: ${grupoExiste ? "ya existe" : "FALTA"}`);
  if (!grupoExiste && APPLY) {
    const r = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/properties/companies/groups",
      body: { name: GRUPO_DE_PROPIEDADES.name, label: GRUPO_DE_PROPIEDADES.label },
    });
    if (!r.ok) throw new Error(`No se pudo crear el grupo (${r.status}): ${(await r.text()).slice(0, 300)}`);
    console.log("  → grupo creado");
  }

  let faltan = 0;
  for (const def of definiciones()) {
    const r = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/companies/${def.name}` }).catch((e) => e);
    if (r?.ok === true) {
      const actual = (await r.json()) as { label?: string; fieldType?: string };
      const aviso = actual.label !== def.label || actual.fieldType !== def.fieldType
        ? ` ⚠ en HubSpot es «${actual.label}» (${actual.fieldType}); no se toca`
        : "";
      console.log(`  ✓ ${def.name} — «${def.label}» ya existe${aviso}`);
      continue;
    }
    faltan++;
    console.log(`  · ${def.name} — «${def.label}» (${def.fieldType}) FALTA`);
    if (!APPLY) continue;
    const c = await hs.apiRequest({ method: "POST", path: "/crm/v3/properties/companies", body: def });
    if (!c.ok) throw new Error(`No se pudo crear ${def.name} (${c.status}): ${(await c.text()).slice(0, 300)}`);
    console.log("    → creada");
  }

  if (!APPLY) console.log(`\nDRY-RUN: faltan ${faltan} propiedades${grupoExiste ? "" : " y el grupo"}. Con --apply se crean.`);
  else console.log("\nListo.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
