/**
 * scripts/novedades-a-documentos-vacios.ts — QUITA LAS NOVEDADES VIEJAS QUE APUNTAN A DOCUMENTOS SIN CONTENIDO
 * (2026-11-20, «Arreglar primero» de las novedades). Dry-run por defecto.
 *
 * Desde el 20 nov el enrutador no le propone una novedad a un documento vacío (lib/seguimiento/enrutador.ts): cuando se
 * genere, lee la memoria del proyecto. Los hechos de antes quedaron con esos destinos PENDIENTES. La pantalla no los
 * muestra, pero el día que alguien genere el documento aparecerían todos juntos, y cuentan en «Uso de Nexus» como
 * vencidos. La escritura vive en el único escritor de la tabla (lib/seguimiento/hechos-server.ts ›
 * `quitarNovedadesADocumentosVacios`): solo los destinos pendientes, con la marca de la fila; el hecho sigue vivo en la
 * tarjeta de la reunión y en la memoria interna.
 *
 *   npx tsx scripts/novedades-a-documentos-vacios.ts                                   # dry-run: qué quitaría
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/novedades-a-documentos-vacios.ts --apply        # respalda HechoDeReunion y escribe
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { describirDestino, resolverApply } from "./lib/guard";

process.env.DB_POOL_MAX ??= "2";

async function main(): Promise<void> {
  const APPLY = resolverApply({ tablas: ["HechoDeReunion"] });
  console.error(`[db] destino: ${describirDestino(process.env.DATABASE_URL)} · ${APPLY ? "ESCRIBE" : "dry-run"}`);
  const { prisma } = await import("@/lib/db/prisma");
  const { quitarNovedadesADocumentosVacios } = await import("@/lib/seguimiento/hechos-server");
  const r = await quitarNovedadesADocumentosVacios({ apply: APPLY });
  console.log(`Hechos pendientes de proyectos: ${r.hechos} (en ${r.proyectos} proyectos).`);
  console.log(`Con novedades a documentos sin contenido: ${r.conNovedadesAVacios}.`);
  for (const [pieza, n] of Object.entries(r.porPieza).sort((a, b) => b[1] - a[1])) console.log(`  · ${pieza}: ${n} novedades`);
  if (APPLY) console.log(`Escritas: ${r.escritas} · saltadas (otro escritor las cambió): ${r.saltadas}.`);
  else console.log("Dry-run: no se escribió nada. Para aplicar: ALLOW_PROD_WRITE=1 npx tsx scripts/novedades-a-documentos-vacios.ts --apply");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
