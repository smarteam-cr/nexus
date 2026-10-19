/**
 * scripts/medir-personalizacion-escala.ts — cuánto dice cada edición de la escala con sus palabras.
 *
 * Solo lee `docs/escala/escala_rendimiento_smarteam.md` (no la base). Por edición, área, dimensión y
 * nivel cuenta los criterios reescritos, propios y los que se leen igual, y lista las celdas sin
 * ningún criterio personalizado. Correrlo en cada versión:
 *
 *   npx tsx scripts/medir-personalizacion-escala.ts            # resumen y celdas sin personalizar
 *   npx tsx scripts/medir-personalizacion-escala.ts --todas    # además, cada celda
 */
import { leerArchivoDeLaEscala } from "../lib/escala/documento/archivos";
import { parsearEscala } from "../lib/escala/documento/parsear";
import { celdasDeLaEdicion, estaPersonalizada } from "../lib/escala/documento/personalizacion";

const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
const todas = process.argv.includes("--todas");
console.log(`Escala ${escala.version} — personalización por edición\n`);
console.log("| Edición | Celdas | Sin personalizar | Reescritos | Propios | Se leen igual |");
console.log("|:--|--:|--:|--:|--:|--:|");
const detalle: string[] = [];
for (const e of escala.ediciones) {
  const celdas = celdasDeLaEdicion(escala, e.slug);
  const sin = celdas.filter((c) => !estaPersonalizada(c));
  const sum = (k: "reescritos" | "propios" | "generales") => celdas.reduce((s, c) => s + c[k], 0);
  console.log(`| ${e.slug} | ${celdas.length} | ${sin.length} | ${sum("reescritos")} | ${sum("propios")} | ${sum("generales")} |`);
  for (const c of todas ? celdas : sin) {
    detalle.push(`${e.slug}\t${c.id}\t${c.nombre}\tR${c.reescritos} P${c.propios} G${c.generales}\t${c.idsGenerales.join(",")}`);
  }
}
console.log(`\n${todas ? "Cada celda" : "Celdas sin ningún criterio personalizado"}:`);
for (const l of detalle) console.log(l);
