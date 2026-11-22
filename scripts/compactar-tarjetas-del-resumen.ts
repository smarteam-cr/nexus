/**
 * scripts/compactar-tarjetas-del-resumen.ts — la versión compacta de las tarjetas del Resumen de la preventa (22 nov;
 * lib/exploraciones/tarjetas-compactas.ts). Sirve para validar el agente con preventas reales y para darles la compacta a
 * las exploraciones que ya existían (la app solo la arma cuando una tarjeta cambia).
 *
 *   - Simulacro (por default): imprime, por tarjeta, lo de siempre, lo que escribiría Haiku y si pasó la comprobación de
 *     las cifras. No guarda nada. Llama a Claude (Haiku, unos centavos) y lo mide como cualquier llamada.
 *   - --apply: guarda las que pasan (`compactarTarjetasDelResumen`, la misma función de la app). Contra producción exige
 *     ALLOW_PROD_WRITE=1 (el guard imprime el host).
 *
 *   npx tsx scripts/compactar-tarjetas-del-resumen.ts --exploracion <id>[,<id>…]
 *   npx tsx scripts/compactar-tarjetas-del-resumen.ts --todas            # las vivas con alguna tarjeta por compactar
 *   npx tsx scripts/compactar-tarjetas-del-resumen.ts --todas --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { assertProdWriteAllowed, imprimirDestino } from "./lib/guard";

process.env.DB_POOL_MAX ??= "2";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const aplicar = process.argv.includes("--apply");
  imprimirDestino();
  if (aplicar) assertProdWriteAllowed("compactar las tarjetas del Resumen");
  const ids = arg("--exploracion")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids?.length && !process.argv.includes("--todas")) throw new Error("Falta --exploracion <id> o --todas");

  const { prisma } = await import("@/lib/db/prisma");
  const { leerContenido } = await import("@/lib/exploraciones/esquemas");
  const { tarjetasPorCompactar, cifrasQueNoCuadran, compactarConUnReintento } = await import("@/lib/exploraciones/tarjetas-compactas");
  const { parseObject } = await import("@/lib/ai/section-schema");
  const { compactarTarjetasDelResumen } = await import("@/lib/exploraciones/tarjetas-compactas-server");
  const { getAnthropic } = await import("@/lib/anthropic");
  const { conContextoDeIA } = await import("@/lib/ai/contexto-de-corrida");
  const { AGENTE_DE_LA_EXPLORACION } = await import("@/lib/exploraciones/agente");

  const filas = await prisma.exploracionDeVenta.findMany({
    where: { archivadaEn: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    select: { id: true, clientId: true, projectId: true, contenido: true, client: { select: { name: true } } },
  });
  let total = 0;
  let pasaron = 0;
  for (const f of filas) {
    const c = leerContenido(f.contenido);
    const { pedir } = tarjetasPorCompactar(c.casillas, c.tarjetasCompactas);
    if (!pedir.length) continue;
    console.log(`\n═══ ${f.client.name} · ${f.id} (${f.projectId ? "de un proyecto" : "preventa"}) · ${pedir.length} por compactar`);
    if (aplicar) {
      await compactarTarjetasDelResumen({ exploracionId: f.id, email: null });
      const despues = leerContenido((await prisma.exploracionDeVenta.findUnique({ where: { id: f.id }, select: { contenido: true } }))?.contenido);
      const guardadas = pedir.filter((t) => despues.tarjetasCompactas?.[t.clave]?.huella === t.huella).map((t) => t.clave);
      console.log(`  guardadas: ${guardadas.join(", ") || "ninguna"}`);
      total += pedir.length;
      pasaron += guardadas.length;
      continue;
    }
    const ia = { agentSlug: AGENTE_DE_LA_EXPLORACION, clientId: f.clientId, projectId: f.projectId, triggeredByEmail: null, origen: "exploraciones/agente:tarjetas-compactas (simulacro)" };
    const r = await compactarConUnReintento(f.client.name, pedir, (pedido) => conContextoDeIA(ia, () => getAnthropic().messages.create(pedido)), parseObject);
    for (const t of pedir) {
      total++;
      const v = r.validas[t.clave];
      if (v) pasaron++;
      const largo = (xs: readonly string[]) => xs.reduce((n, l) => n + l.length, 0);
      console.log(`\n— ${t.clave}: ${t.lineas.length} líneas, ${largo(t.lineas)} letras`);
      for (const l of t.lineas) console.log(`    · ${l}`);
      const compacta = v ?? r.crudas[t.clave];
      if (compacta) {
        console.log(`  compacta: ${compacta.length} líneas, ${largo(compacta)} letras ${v ? "✓ pasa" : "✗ descartada"}`);
        for (const l of compacta) console.log(`    → ${l}`);
        const { inventadas, perdidas, invertidas } = cifrasQueNoCuadran(t.lineas, compacta);
        console.log(`  cifras: ${inventadas.length || perdidas.length || invertidas.length ? `inventadas [${inventadas.join(", ")}] · perdidas [${perdidas.join(", ")}] · al revés [${invertidas.join(", ")}]` : "todas las del original, en su orden, y ninguna más"}`);
      }
      if (r.descartadas[t.clave]) console.log(`  motivos: ${r.descartadas[t.clave]!.join("; ")}`);
    }
  }
  console.log(`\n${aplicar ? "Guardadas" : "Pasan la comprobación"}: ${pasaron} de ${total} tarjetas.${aplicar ? "" : " Simulacro: no se guardó nada."}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
