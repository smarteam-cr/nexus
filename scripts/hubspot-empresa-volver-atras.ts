/**
 * scripts/hubspot-empresa-volver-atras.ts — deshace en HubSpot lo que Nexus escribió de los datos de la empresa (R2,
 * 2026-10-25).
 *
 * Cada escritura dejó en la fila de su decisión la propiedad y lo que tenía HubSpot justo antes
 * (`PropuestaDeDato.hubspotPropiedad`, `hubspotAnterior`). Desde una fecha, por empresa y propiedad, toma lo que había
 * ANTES de la primera escritura y lo vuelve a poner, solo si HubSpot sigue teniendo lo que Nexus escribió la última vez:
 * si alguien lo cambió después a mano, no se toca (lo dice).
 *
 * No deshace lo que acompaña sin fila propia (la fuente y la fecha del TAM, la fecha de la investigación, el siguiente
 * caso): son propiedades de Nexus, nacidas vacías.
 *
 * SIMULACRO por defecto.
 *
 * Uso (PowerShell):
 *   npx tsx scripts/hubspot-empresa-volver-atras.ts --desde 2026-10-26
 *   npx tsx scripts/hubspot-empresa-volver-atras.ts --desde 2026-10-26 --solo <clientId>
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/hubspot-empresa-volver-atras.ts --desde 2026-10-26 --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { assertProdWriteAllowed } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { valorParaHubspot } from "@/lib/hubspot/empresa";
import { CLAVES_DE_DATO, type ClaveDeDato } from "@/lib/clients/datos-de-la-empresa";
import { valorDeLaFila } from "@/lib/clients/datos-de-la-empresa-server";
import { leerEmpresasDeHubspot } from "@/lib/clients/escritura-en-hubspot-server";

// Escribe en HubSpot, no en la base: el guard de siempre (y el token del sistema puede refrescarse, que sí escribe).
const APPLY = process.argv.includes("--apply");
if (APPLY) assertProdWriteAllowed("scripts/hubspot-empresa-volver-atras.ts (HubSpot)");
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const desdeTexto = arg("--desde");
  if (!desdeTexto || !/^\d{4}-\d{2}-\d{2}$/.test(desdeTexto)) throw new Error("Falta --desde AAAA-MM-DD (desde qué día deshacer).");
  const desde = new Date(`${desdeTexto}T00:00:00-06:00`);
  const solo = arg("--solo");

  const filas = await prisma.propuestaDeDato.findMany({
    where: { hubspotEscritaAt: { gte: desde }, hubspotPropiedad: { not: null }, ...(solo ? { clientId: solo } : {}) },
    orderBy: { hubspotEscritaAt: "asc" },
    select: { campo: true, valor: true, valorDecidido: true, hubspotPropiedad: true, hubspotAnterior: true, client: { select: { name: true, hubspotCompanyId: true } } },
  });
  // Por empresa y propiedad: lo de antes de la PRIMERA escritura y lo que escribió la ÚLTIMA.
  const grupos = new Map<string, { empresa: string; companyId: string; propiedad: string; antes: string; escrito: string }>();
  for (const f of filas) {
    const companyId = f.client.hubspotCompanyId;
    if (!companyId || !f.hubspotPropiedad || !(CLAVES_DE_DATO as readonly string[]).includes(f.campo)) continue;
    const valor = valorDeLaFila(f.valorDecidido ?? f.valor);
    const escrito = valor === null ? "" : valorParaHubspot(f.campo as ClaveDeDato, valor);
    const k = `${companyId}:${f.hubspotPropiedad}`;
    const g = grupos.get(k);
    if (g) g.escrito = escrito;
    else grupos.set(k, { empresa: f.client.name, companyId, propiedad: f.hubspotPropiedad, antes: f.hubspotAnterior ?? "", escrito });
  }
  const lista = [...grupos.values()];
  console.log(`${lista.length} propiedades escritas por Nexus desde el ${desdeTexto}.`);
  if (!lista.length) return;
  const hoy = await leerEmpresasDeHubspot([...new Set(lista.map((g) => g.companyId))], [...new Set(lista.map((g) => g.propiedad))]);

  const porEmpresa = new Map<string, Record<string, string>>();
  for (const g of lista) {
    const actual = (hoy.get(g.companyId)?.[g.propiedad] ?? "").trim();
    if (actual !== g.escrito) {
      console.log(`  · ${g.empresa} · ${g.propiedad}: hoy dice «${actual || "vacía"}», no lo que escribió Nexus («${g.escrito}»). No se toca.`);
      continue;
    }
    console.log(`  ↺ ${g.empresa} · ${g.propiedad}: «${g.escrito}» → «${g.antes || "vacía"}»`);
    porEmpresa.set(g.companyId, { ...(porEmpresa.get(g.companyId) ?? {}), [g.propiedad]: g.antes });
  }
  if (!APPLY) {
    console.log(`\nSIMULACRO: ${porEmpresa.size} empresas volverían atrás. Con --apply (y ALLOW_PROD_WRITE=1) se escribe.`);
    return;
  }
  const hs = await getSystemHubspotClient();
  for (const [companyId, properties] of porEmpresa) {
    const r = await hs.apiRequest({ method: "PATCH", path: `/crm/v3/objects/companies/${companyId}`, body: { properties } });
    console.log(`  ${companyId}: ${r.ok ? "listo" : `falló (${r.status}) ${(await r.text()).slice(0, 200)}`}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
