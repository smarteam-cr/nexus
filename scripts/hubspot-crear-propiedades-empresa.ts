/**
 * scripts/hubspot-crear-propiedades-empresa.ts — el grupo «Nexus · Empresa» y las propiedades nuevas de la empresa en el
 * HubSpot de Smarteam (R2, etapa 1; listo el 2026-10-25).
 *
 * Las definiciones salen de lib/hubspot/empresa.ts (`definicionesDeLasPropiedadesNuevas`): listas y fechas, nunca texto
 * libre (docs/empresa-datos-hubspot-plan.md, decisión 5). Son 14 (el plan las contaba 13: «el perfil de negocio» son dos,
 * cómo cierra y qué pasa después):
 *   - las que algo llena ahora: la fuente y la fecha del TAM, la fecha de la investigación, a quién le vende, cómo cierra,
 *     qué pasa después, el tráfico y la base con consentimiento;
 *   - las que quedan vacías hasta que exista su fuente: Insider (N6), el nivel en cada área y su fecha (B2 o N2) y el
 *     siguiente caso sugerido (R12, que ya lo calcula; se escribe con la bandera prendida).
 * Los rangos de tráfico y de base son los del catálogo (lib/clients/datos-de-la-empresa.ts), propuestos por Claude el 24
 * oct (Elías los dejó a su criterio): tráfico al mes < 10 mil, 10–50 mil, 50–200 mil, 200 mil–1 millón, > 1 millón;
 * base con consentimiento < mil, 1–10 mil, 10–50 mil, 50–200 mil, > 200 mil.
 *
 * SIMULACRO por defecto: dice qué existe y qué falta, con sus opciones. Con `--apply` crea SOLO lo que falta (correrlo dos
 * veces no duplica ni pisa nada; una propiedad que ya existe no se toca aunque su etiqueta sea otra: se avisa). Crear
 * propiedades es escribir en el portal de producción: Elías lo aprobó el 24 oct, y lo corre la sesión que despliega,
 * DESPUÉS del deploy. Todo va por el transporte único (getSystemHubspotClient → lib/hubspot/transporte.ts).
 *
 * Después: prender `EMPRESA_HUBSPOT_ESCRITURA=1` y probar la escritura masiva con 5 empresas
 * (scripts/hubspot-escribir-datos-de-la-empresa.ts --limite 5).
 *
 * Uso (PowerShell):
 *   npx tsx scripts/hubspot-crear-propiedades-empresa.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/hubspot-crear-propiedades-empresa.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import { assertProdWriteAllowed } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { definicionesDeLasPropiedadesNuevas, GRUPO_NEXUS_EMPRESA } from "@/lib/hubspot/empresa";

const APPLY = process.argv.includes("--apply");

async function main() {
  // El guard: el token del sistema puede refrescarse al pedir el cliente, y eso SÍ escribe en producción.
  if (APPLY) assertProdWriteAllowed("scripts/hubspot-crear-propiedades-empresa.ts (HubSpot)");
  const hs = await getSystemHubspotClient();

  const grupo = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/companies/groups/${GRUPO_NEXUS_EMPRESA.name}` }).catch(() => null);
  const grupoExiste = grupo?.ok === true;
  console.log(`Grupo «${GRUPO_NEXUS_EMPRESA.label}»: ${grupoExiste ? "ya existe" : "FALTA"}`);
  if (!grupoExiste && APPLY) {
    const r = await hs.apiRequest({ method: "POST", path: "/crm/v3/properties/companies/groups", body: { name: GRUPO_NEXUS_EMPRESA.name, label: GRUPO_NEXUS_EMPRESA.label } });
    if (!r.ok) throw new Error(`No se pudo crear el grupo (${r.status}): ${(await r.text()).slice(0, 300)}`);
    console.log("  → grupo creado");
  }

  let faltan = 0;
  let creadas = 0;
  for (const def of definicionesDeLasPropiedadesNuevas()) {
    const { quienLaLlena, ...cuerpo } = def;
    const r = await hs.apiRequest({ method: "GET", path: `/crm/v3/properties/companies/${def.name}` }).catch(() => null);
    if (r?.ok) {
      const actual = (await r.json()) as { label?: string; type?: string };
      const aviso = actual.label !== def.label || actual.type !== def.type ? ` ⚠ en HubSpot es «${actual.label}» (${actual.type}); no se toca` : "";
      console.log(`  ✓ ${def.name} — «${def.label}» ya existe${aviso}`);
      continue;
    }
    faltan++;
    const opciones = def.options ? `: ${def.options.map((o) => `${o.value} «${o.label}»`).join(" · ")}` : "";
    console.log(`  · FALTA ${def.name} — «${def.label}» (${def.type}; la llena: ${quienLaLlena})${opciones}`);
    if (!APPLY) continue;
    const c = await hs.apiRequest({ method: "POST", path: "/crm/v3/properties/companies", body: cuerpo });
    if (!c.ok) throw new Error(`No se pudo crear ${def.name} (${c.status}): ${(await c.text()).slice(0, 300)}`);
    creadas++;
    console.log("    → creada");
  }

  if (!APPLY) console.log(`\nSIMULACRO: faltan ${faltan} propiedades${grupoExiste ? "" : " y el grupo"}. Con --apply (y ALLOW_PROD_WRITE=1) se crean.`);
  else console.log(`\nListo: ${creadas} creadas. Sigue: EMPRESA_HUBSPOT_ESCRITURA=1 y la escritura con 5 empresas.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
