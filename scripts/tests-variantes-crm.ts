/**
 * scripts/tests-variantes-crm.ts — CARGA LAS VARIANTES DE CRM AL BORRADOR de cada banco del test (2026-10-31).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Las variantes viven en el repo (lib/tests-diagnostico/variantes-de-crm.datos.ts) y el público ve lo APROBADO. Este
 * script las cuelga del BORRADOR (`preguntas`) de cada banco: lo aprobado no se toca, el estado pasa a «Publicado · con
 * cambios sin aprobar» y se revisan con «Ver como» en Escala › Tests antes de aprobarlas.
 *
 * ── LO QUE CUIDA ────────────────────────────────────────────────────────────
 *   · Un banco que una persona editó mientras corría no se pisa (`reemplazarBorrador` compara con lo que leyó).
 *   · Se conserva quién lo editó por última vez: un banco de una persona sigue siendo suyo para scripts/tests-preguntas.ts.
 *   · Si un banco queda con problemas (una mención sin variante, una opción colgada), NO aplica nada: primero se corre la
 *     skill `revisar-banco-del-test`. Una entrada sin uso solo se avisa: no se cuelga de nada, y una base nueva sin su
 *     variante cae en el problema de arriba.
 *   · Se puede volver a correr: lo que ya está igual no se escribe.
 *
 * Uso:
 *   npx tsx scripts/tests-variantes-crm.ts                     # simulacro: cuántas preguntas se adaptan por área e industria
 *   npx tsx scripts/tests-variantes-crm.ts --todas             # además, lo que cambia en cada banco web
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/tests-variantes-crm.ts --apply
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { imprimirDestino, resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { listarBancos, reemplazarBorrador } from "@/lib/tests-diagnostico/repositorio-server";
import { EDICION_GENERAL, GRUPOS_DE_CRM, leerPreguntasDelBanco, NOMBRE_DEL_AREA, type PreguntaDelBanco } from "@/lib/tests-diagnostico/tipos";
import { cambiosDelBanco, conVariantes, entradasSinUso, ETIQUETA_DEL_GRUPO, problemasDeLasVariantes } from "@/lib/tests-diagnostico/variantes";
import { ESCALA_DE_LAS_VARIANTES, VARIANTES_DE_CRM } from "@/lib/tests-diagnostico/variantes-de-crm.datos";

const APPLY = resolverApply({ tablas: ["PreguntasDelTest"] });
/** El autor de un banco que nadie editó: el que arma los bancos desde la escala. */
const POR = "scripts/tests-preguntas.ts";
const TODAS = process.argv.includes("--todas");

const firma = (p: readonly PreguntaDelBanco[]) => JSON.stringify(p);
const adaptadas = (p: readonly PreguntaDelBanco[]) => p.filter((q) => q.variantes || q.opciones.some((o) => o.variantes)).length;

async function main() {
  imprimirDestino("tests-variantes-crm");
  const bancos = await listarBancos();
  const planes = bancos.map((b) => {
    const nuevas = leerPreguntasDelBanco(conVariantes(b.preguntas, VARIANTES_DE_CRM));
    return { b, nuevas, cambia: firma(nuevas) !== firma(b.preguntas), problemas: problemasDeLasVariantes(nuevas) };
  });

  console.log(`\nVariantes revisadas contra la escala ${ESCALA_DE_LAS_VARIANTES} · ${VARIANTES_DE_CRM.length} entradas · ${bancos.length} bancos\n`);
  console.log("Preguntas adaptadas por área e industria (test web · test corto):");
  for (const area of [...new Set(bancos.map((b) => b.area))]) {
    for (const edicion of [...new Set(bancos.map((b) => b.edicion))]) {
      const de = planes.filter((p) => p.b.area === area && p.b.edicion === edicion);
      const cuenta = (v: string) => adaptadas(de.find((p) => p.b.version === v)?.nuevas ?? []);
      if (de.length) console.log(`  ${NOMBRE_DEL_AREA[area].padEnd(9)} ${edicion.padEnd(18)} ${String(cuenta("web")).padStart(2)} · ${cuenta("marketing")}`);
    }
  }
  const total = planes.reduce((n, p) => n + adaptadas(p.nuevas), 0);
  const deTotal = planes.reduce((n, p) => n + p.nuevas.length, 0);
  console.log(`\n  ${total} de ${deTotal} preguntas · ${planes.filter((p) => p.cambia).length} bancos por escribir`);

  const sinUso = entradasSinUso(bancos.map((b) => b.preguntas), VARIANTES_DE_CRM);
  for (const e of sinUso) console.log(`⚠ Entrada sin uso en esta base (${e.pregunta} · ${e.campo}): ${e.base}`);
  for (const p of planes) for (const x of p.problemas) console.log(`⛔ ${NOMBRE_DEL_AREA[p.b.area]} · ${p.b.version} · ${p.b.edicion}: ${x}`);

  if (TODAS) {
    for (const p of planes.filter((x) => x.b.version === "web")) {
      console.log(`\n── ${NOMBRE_DEL_AREA[p.b.area]} · ${p.b.edicion === EDICION_GENERAL ? "general" : p.b.edicion} ──`);
      for (const grupo of GRUPOS_DE_CRM) {
        for (const c of cambiosDelBanco(p.nuevas, grupo)) {
          for (const f of c.campos) console.log(`  [${ETIQUETA_DEL_GRUPO[grupo]}] ${c.dimensionId} ${f.campo}: ${f.variante}`);
        }
      }
    }
  }

  const frenos = planes.reduce((n, p) => n + p.problemas.length, 0);
  if (!APPLY) {
    console.log("\nSimulacro: no se escribió nada. Para aplicarlo: ALLOW_PROD_WRITE=1 npx tsx scripts/tests-variantes-crm.ts --apply");
    return;
  }
  if (frenos) throw new Error(`Hay ${frenos} problemas: no se aplicó nada. Corre la skill revisar-banco-del-test.`);

  let escritos = 0;
  for (const p of planes.filter((x) => x.cambia)) {
    if (await reemplazarBorrador(p.b.id, p.b.preguntas, p.nuevas, p.b.editadoPor ?? POR)) escritos++;
    else console.log(`  ⚠ ${NOMBRE_DEL_AREA[p.b.area]} · ${p.b.version} · ${p.b.edicion}: cambió mientras corría, no se tocó`);
  }
  console.log(`\nAplicado: ${escritos} borradores con variantes. Revísalos en Escala › Tests y apruébalos.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
