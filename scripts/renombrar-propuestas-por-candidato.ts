/**
 * scripts/renombrar-propuestas-por-candidato.ts
 *
 * Pone el NOMBRE DE LA PERSONA al frente del título de cada propuesta de contratación.
 *
 * Por qué: el flyout de Roles del sidebar lista los documentos por `title` y NADA MÁS
 * (`components/layout/NavFlyout.tsx`: `label: d.title`, con `truncate`). Con tres
 * propuestas de CSE tituladas "Customer Success Executive", las tres se veían idénticas
 * y encima cortadas. El `area` —que sí llevaba el nombre— no se muestra ahí.
 * Y como el corte es por el FINAL, el nombre tiene que ir PRIMERO o no sirve de nada.
 *
 * Formato acordado con Elías (2026-09-22): `Nombre · Puesto` en el título, y el `area`
 * pasa a ser el rótulo genérico "Propuesta de contratación · Smarteam". Antes el nombre
 * vivía en el `area`; dejarlo en los dos lados lo repetía en el encabezado del documento.
 *
 * ⚠ TOCA SOLO `title` y `area`. NO escribe `content`: la propuesta de Caro tiene bloques
 * de firma agregados desde la pantalla y la del Asistente se editó el 2026-09-01 — volver
 * a correr sus seeds los borraría. Por eso esto es un script aparte y no un cambio en ellos.
 *
 * Uso:
 *   dry-run:  npx tsx scripts/renombrar-propuestas-por-candidato.ts
 *   aplicar:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/renombrar-propuestas-por-candidato.ts --apply
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const AREA_GENERICA = "Propuesta de contratación · Smarteam";

/**
 * `propuesta-csl-v1` NO entra: es la única propuesta de CSL, así que en la lista no se
 * confunde con nada, y no sabemos a nombre de quién se armó. Los PERFILES tampoco entran:
 * son por PUESTO, no por persona, y cada uno aparece una sola vez.
 */
const RENOMBRES: { id: string; title: string; nota: string }[] = [
  {
    id: "propuesta-cse-v1",
    title: "Caroline Bersot · Customer Success Executive",
    nota: "el nombre salía solo en el bloque de firma",
  },
  {
    id: "propuesta-cse-valentina-v1",
    title: "Valentina Sandoval · Customer Success Executive",
    nota: "el nombre estaba en el area",
  },
  {
    id: "propuesta-cse-liliana-v1",
    title: "Liliana Moreno · Customer Success Executive",
    nota: "el nombre estaba en el area",
  },
  {
    id: "cmsy8l1we000o07lljv1x8i2p",
    title: "Dinia Marín · Asistente Administrativo Contable",
    // El area decía "para DINia marin" (tal cual, mayúsculas y sin tilde). Se normaliza
    // al escribirlo en el título, que ahora es el encabezado que lee la candidata.
    nota: "se normaliza la grafía: el area decía «DINia marin»",
  },
];

async function main() {
  const APPLY = resolverApply();
  const { prisma, close } = createScriptDb();
  try {
    let cambios = 0;
    for (const r of RENOMBRES) {
      const doc = await prisma.roleProfile.findUnique({
        where: { id: r.id },
        select: { id: true, docType: true, title: true, area: true, publicToken: true },
      });
      if (!doc) {
        console.error(`⛔ no existe ${r.id} — ¿se borró desde la pantalla?`);
        process.exitCode = 1;
        continue;
      }
      if (doc.docType !== "PROPUESTA") {
        console.error(`⛔ ${r.id} es ${doc.docType}, no PROPUESTA. No se toca.`);
        process.exitCode = 1;
        continue;
      }
      const igual = doc.title === r.title && doc.area === AREA_GENERICA;
      console.log(`\n${igual ? "=" : "→"} ${r.id}${doc.publicToken ? "  [LINK PÚBLICO VIVO]" : ""}`);
      console.log(`   título: "${doc.title}"`);
      if (!igual) console.log(`        →  "${r.title}"`);
      console.log(`   rótulo: "${doc.area ?? ""}"`);
      if (!igual) console.log(`        →  "${AREA_GENERICA}"`);
      console.log(`   (${r.nota})`);
      if (igual) continue;
      cambios++;
      if (APPLY) {
        await prisma.roleProfile.update({
          where: { id: r.id },
          data: { title: r.title, area: AREA_GENERICA },
        });
      }
    }

    console.log(`\n${cambios} documento(s) ${APPLY ? "renombrados" : "por renombrar"}.`);
    if (!APPLY && cambios > 0) {
      console.log("\nDRY-RUN. Para aplicar:");
      console.log('  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/renombrar-propuestas-por-candidato.ts --apply');
    }
  } finally {
    await close();
  }
}

main();
