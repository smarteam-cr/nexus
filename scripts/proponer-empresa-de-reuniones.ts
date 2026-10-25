/**
 * scripts/proponer-empresa-de-reuniones.ts — la primera corrida de T3: calcula a qué empresa propone Nexus cada reunión
 * con texto y sin dueña de los últimos 90 días (las 67 del plan) y lo deja en `PropuestaDeEmpresa`. Después lo mantiene
 * el job `reuniones-propuestas` (una vez por hora).
 *
 * La propuesta es la del resolver único (`categorizeSession`, lib/sessions/propuesta-de-empresa.ts): NO elige el dueño
 * de ninguna reunión. Eso lo hace una persona en Sesiones › «Ver la salud de las reuniones» › «Sin empresa», o en la
 * reunión. Consulta HubSpot en solo lectura (las empresas de los dominios de fuera).
 *
 * Uso:
 *   npx tsx scripts/proponer-empresa-de-reuniones.ts                    # en seco: lista cada reunión con su propuesta
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/proponer-empresa-de-reuniones.ts --apply
 *
 * ⚠ Después del SQL (2026-10-25-reuniones-parte-2.sql). Respaldo: la tabla PropuestaDeEmpresa (B-06).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino, resolverApply } from "./lib/guard";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const escribir = resolverApply({ tablas: ["PropuestaDeEmpresa"] });
  const dias = Math.max(1, Number(arg("--dias") ?? 90));
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (${escribir ? "ESCRIBE" : "en seco, solo lectura"})\n`);
  const { calcularPropuestas, reunionesConTextoSinDuena } = await import("@/lib/sessions/propuesta-de-empresa-server");
  const { buildCategorizeCtx, buildHubspotDomainMap } = await import("@/lib/sessions/resolve-client");
  const { proponerEmpresa } = await import("@/lib/sessions/propuesta-de-empresa");
  const { prisma } = await import("@/lib/db/prisma");
  try {
    const ahora = new Date();
    const reuniones = await reunionesConTextoSinDuena(ahora, dias);
    console.log(`Reuniones con texto, con gente de fuera y sin empresa, de los últimos ${dias} días: ${reuniones.length}\n`);
    // La lista, para mirar antes de escribir (la misma cuenta que hace calcularPropuestas).
    const ctx = await buildCategorizeCtx();
    ctx.hubspotCompaniesByDomain = await buildHubspotDomainMap(
      reuniones.map((s) => ({ participants: s.participants ?? [] })),
      ctx.internalDomains,
    );
    if (ctx.hubspotCompaniesByDomain.size === 0) console.log("⚠ HubSpot no devolvió ninguna empresa: solo salen las propuestas de empresas que ya están en Nexus.\n");
    let conPropuesta = 0;
    for (const s of reuniones) {
      const p = proponerEmpresa({ title: s.title, participants: s.participants ?? [], manualClientId: null }, ctx);
      if (p) conPropuesta++;
      const que = p ? (p.tipo === "HUBSPOT" ? `crear «${p.nombre}» de HubSpot (@${p.dominio})` : `«${p.nombre}» (ya en Nexus)`) : "— sin propuesta: se elige a mano";
      console.log(`  ${s.date.toISOString().slice(0, 10)}  ${s.title.slice(0, 60).padEnd(60)}  ${que}`);
    }
    console.log(`\nCon propuesta: ${conPropuesta} de ${reuniones.length}.`);
    const { esquemaDesactualizado } = await import("@/lib/db/esquema");
    try {
      const r = await calcularPropuestas({ ahora, dias, simulacro: !escribir });
      console.log(`${escribir ? "Escrito" : "Se escribiría"}: ${r.nuevas} nuevas, ${r.cambiadas} cambiadas, ${r.borradas} borradas.`);
    } catch (e) {
      if (!esquemaDesactualizado(e)) throw e;
      console.log("⚠ A la base le falta scripts/sql/2026-10-25-reuniones-parte-2.sql: la lista de arriba es lo que se propondría.");
      if (escribir) process.exitCode = 1;
    }
    if (!escribir) console.log("\nEn seco: no se escribió nada. Para escribir: ALLOW_PROD_WRITE=1 … --apply");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
