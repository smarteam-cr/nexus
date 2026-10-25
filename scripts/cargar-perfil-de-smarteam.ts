/**
 * scripts/cargar-perfil-de-smarteam.ts — cuelga de la ficha de Smarteam lo que hoy vive suelto (R13, 2026-10-25).
 *
 * El cliente ideal (`IcpItem`, 44 filas el 24 oct) y las buyer personas (`BuyerPersona`, 4) eran tablas de Marketing sin
 * relación con la ficha. Este script:
 *   1. busca la empresa que usa Nexus (la única empresa nuestra, `kind = INTERNO`; con dos o ninguna, se detiene y lo
 *      dice: no adivina);
 *   2. le crea su perfil vacío (`PerfilDeLaEmpresa`) si no lo tiene;
 *   3. le asigna las filas del cliente ideal y de las buyer personas que no tienen empresa. No cambia ni borra nada de lo
 *      que dicen: «lo de hoy se muda sin perder nada».
 * El tono de la marca NO se copia: sigue en Marketing › Voz (`MarketingSettings.brandVoice`) y el lector
 * (lib/smarteam/contexto.ts) lo usa mientras el perfil no tenga uno propio. Dos copias que se separan serían peores.
 *
 * SIMULACRO por defecto. Se puede correr dos veces.
 *
 * Antes: scripts/sql/2026-10-25-empresa-parte-2.sql aplicado y el deploy hecho.
 * Uso (PowerShell):
 *   npx tsx scripts/cargar-perfil-de-smarteam.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/cargar-perfil-de-smarteam.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 */
import "dotenv/config";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";

const APPLY = resolverApply({ tablas: ["IcpItem", "BuyerPersona", "PerfilDeLaEmpresa"] });

async function main() {
  const conPerfil = await prisma.perfilDeLaEmpresa.findMany({ select: { clientId: true, client: { select: { name: true } } } });
  const nuestras = await prisma.client.findMany({ where: { kind: "INTERNO" }, select: { id: true, name: true, hubspotCompanyId: true } });
  let empresa: { id: string; name: string } | null = null;
  if (conPerfil.length === 1) empresa = { id: conPerfil[0].clientId, name: conPerfil[0].client.name };
  else if (conPerfil.length > 1) throw new Error(`Hay ${conPerfil.length} perfiles: ${conPerfil.map((p) => p.client.name).join(", ")}. Este script es para una sola empresa que usa Nexus.`);
  else if (nuestras.length === 1) empresa = nuestras[0];
  else throw new Error(`Hay ${nuestras.length} empresas nuestras (kind INTERNO)${nuestras.length ? `: ${nuestras.map((n) => n.name).join(", ")}` : ""}. Crea el perfil a mano en la ficha correcta y vuelve a correrlo.`);

  const [icpSueltos, personasSueltas, icpOtras, personasOtras] = await Promise.all([
    prisma.icpItem.count({ where: { clientId: null } }),
    prisma.buyerPersona.count({ where: { clientId: null } }),
    prisma.icpItem.count({ where: { clientId: { not: null, notIn: [empresa.id] } } }),
    prisma.buyerPersona.count({ where: { clientId: { not: null, notIn: [empresa.id] } } }),
  ]);
  console.log(`La empresa que usa Nexus: ${empresa.name} (${empresa.id}).`);
  console.log(`  · perfil: ${conPerfil.length ? "ya existe" : "se crea vacío"}`);
  console.log(`  · cliente ideal sin empresa: ${icpSueltos} → pasan a ${empresa.name}`);
  console.log(`  · buyer personas sin empresa: ${personasSueltas} → pasan a ${empresa.name}`);
  if (icpOtras || personasOtras) console.log(`  ⚠ ${icpOtras} del cliente ideal y ${personasOtras} buyer personas ya son de OTRA empresa: no se tocan.`);

  if (!APPLY) {
    console.log("\nSIMULACRO. Con --apply (y ALLOW_PROD_WRITE=1) se escribe.");
    return;
  }
  await prisma.$transaction(async (tx) => {
    if (!conPerfil.length) await tx.perfilDeLaEmpresa.create({ data: { clientId: empresa!.id } });
    await tx.icpItem.updateMany({ where: { clientId: null }, data: { clientId: empresa!.id } });
    await tx.buyerPersona.updateMany({ where: { clientId: null }, data: { clientId: empresa!.id } });
  });
  console.log("\nListo.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
