/**
 * scripts/publicar-escalas-compartidas.ts — la primera foto de las escalas que ya se compartieron (16 nov).
 *
 * Desde el 16 nov el enlace de la escala (/external/escala/[token]) sirve la foto PUBLICADA, no lo medido en cada visita
 * (lib/exploraciones/escala-publicada.ts). Los enlaces creados antes no tienen foto: sin este script, al desplegar,
 * mostrarían «Tu escala todavía no está lista». Publica lo de HOY de cada enlace activo sin foto: lo mismo que el cliente
 * veía hasta ese momento. Uno con foto no se toca.
 *
 * Simulacro por defecto (solo lee). Con --apply escribe la foto en `AccesoALaEscala` (publicada, publicadaEn,
 * publicadaPor = "publicación inicial"). Va DESPUÉS de aplicar scripts/sql/2026-11-16-escala-publicada.sql y antes del
 * deploy (o justo después: hasta correrlo, esos enlaces dicen que la escala no está lista).
 *
 *   npx tsx scripts/publicar-escalas-compartidas.ts
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/publicar-escalas-compartidas.ts --apply; Remove-Item Env:ALLOW_PROD_WRITE
 *
 * Deshacer: `UPDATE "AccesoALaEscala" SET publicada = NULL, "publicadaEn" = NULL, "publicadaPor" = NULL WHERE "publicadaPor" = 'publicación inicial';`
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { publicarLaEscala } from "@/lib/exploraciones/acceso-a-la-escala";
import { escalaParaElCliente } from "@/lib/exploraciones/escala-para-el-cliente-server";
import { faltaParaPublicar } from "@/lib/external/pagina-del-resumen";

const APPLY = resolverApply({ tablas: ["AccesoALaEscala"] });
const QUIEN = "publicación inicial";

async function main() {
  const accesos = await prisma.accesoALaEscala.findMany({
    where: { revokedAt: null, publicadaEn: null },
    select: { exploracionId: true, lastUsedAt: true, exploracion: { select: { client: { select: { name: true } } } } },
  });
  console.log(`${accesos.length} enlace(s) activo(s) sin foto${APPLY ? "" : " (simulacro: no se escribe nada)"}.`);
  let publicadas = 0;
  for (const a of accesos) {
    const pagina = await escalaParaElCliente(a.exploracionId);
    const nombre = a.exploracion.client.name;
    if (!pagina || !pagina.resultados.length) {
      console.log(`  · ${nombre}: no se muestra hoy (archivada, sin equipos o de otra empresa): queda sin foto.`);
      continue;
    }
    const visto = a.lastUsedAt ? `abierto por última vez ${a.lastUsedAt.toISOString().slice(0, 10)}` : "nunca abierto";
    // Una página sin titular no se publica (21 nov): se dice cuál y por qué, en el simulacro también.
    const falta = faltaParaPublicar(pagina.resumen);
    if (falta) {
      console.log(`  · ${nombre}: NO se publica: ${falta}`);
      continue;
    }
    console.log(`  · ${nombre}: ${pagina.resultados.length} equipo(s), ${visto}.`);
    if (!APPLY) continue;
    // Solo si sigue sin foto: si alguien publicó mientras corría, manda lo suyo.
    if (await publicarLaEscala(a.exploracionId, QUIEN, { siSigue: null })) publicadas++;
  }
  if (APPLY) console.log(`Publicadas: ${publicadas}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
