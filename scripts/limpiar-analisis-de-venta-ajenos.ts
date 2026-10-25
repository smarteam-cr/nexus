/**
 * scripts/limpiar-analisis-de-venta-ajenos.ts — el remedio de INV57: borra los análisis de venta que quedaron de una
 * empresa que ya no es la dueña de su reunión (lib/analizador-venta/ajenos.ts). Normalmente no hace falta: la
 * re-atribución los suelta sola al cambiar la dueña. Si la reunión sigue siendo de venta, se vuelve a analizar desde su
 * página.
 *
 *   npx tsx scripts/limpiar-analisis-de-venta-ajenos.ts                    # en seco: los lista
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/limpiar-analisis-de-venta-ajenos.ts --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino, resolverApply } from "./lib/guard";

async function main() {
  const escribir = resolverApply({ tablas: ["AnalisisDeVenta"] });
  console.log(`Base: ${describirDestino(process.env.DATABASE_URL ?? "")} (${escribir ? "ESCRIBE" : "en seco"})\n`);
  const { analisisDeVentaAjenos, soltarAnalisisDeVentaAjenos } = await import("@/lib/analizador-venta/ajenos");
  const { prisma } = await import("@/lib/db/prisma");
  try {
    const ajenos = await analisisDeVentaAjenos();
    console.log(`Análisis de otra empresa: ${ajenos.length}`);
    for (const a of ajenos) console.log(`  · «${a.titulo}» (${a.sessionId})`);
    if (escribir && ajenos.length) console.log(`\nBorrados: ${await soltarAnalisisDeVentaAjenos(ajenos.map((a) => a.sessionId))}`);
    else if (ajenos.length) console.log("\nEn seco: no se borró nada. Para borrar: ALLOW_PROD_WRITE=1 … --apply");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
