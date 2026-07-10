/**
 * scripts/backfill-kickoff-sections.ts
 *
 * Alinea los canvases "Kickoff" EXISTENTES a la estructura canónica actual
 * (DEFAULT_PROJECT_CANVASES → Kickoff): crea TODAS las secciones canónicas que
 * falten (curadas o no: equipo/horarios/canales/cierre, hoy_vs_sistema…) y siembra
 * 1 bloque CARD/CONFIRMED con `defaultData` en las que lo tengan. Sin la sección,
 * `buildKickoffConfig` la filtra y NUNCA se renderiza; sin el bloque, el editor no
 * tiene dónde persistir.
 *
 * ORDEN: parte del orden VIVO de cada canvas (el CSE puede haber reordenado con
 * drag) e inserta cada key faltante detrás de su predecesora canónica —
 * `kickoffSectionSequence`, la MISMA función que usa `reconcileKickoffCanvasSections`
 * al regenerar con el agente. Nunca reordena a ciegas al canon.
 *
 * NO borra ni modifica secciones/bloques existentes. Idempotente.
 *
 * Los kickoffs ya PUBLICADOS mostrarán las secciones nuevas al cliente recién al
 * re-"Subir al cliente" (el cliente ve el publishedSnapshot congelado).
 *
 * Dry-run por default. Aplicar con: npx tsx scripts/backfill-kickoff-sections.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { KICKOFF_CANVAS, kickoffSectionSequence } from "../lib/canvas/canvas-defs";

const APPLY = process.argv.includes("--apply");

const CANON = KICKOFF_CANVAS.sections;
const LABEL_BY_KEY = new Map(CANON.map((s) => [s.key, s.label]));
const DATA_BY_KEY = new Map(CANON.filter((s) => s.defaultData).map((s) => [s.key, s.defaultData!]));

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  console.log(APPLY ? "APLICANDO backfill de secciones de Kickoff…\n" : "DRY-RUN (usá --apply para escribir)\n");
  console.log(`Secciones canónicas: ${CANON.map((s) => s.key).join(", ")}`);
  console.log(`Con bloque sembrado: ${[...DATA_BY_KEY.keys()].join(", ")}\n`);

  // `sections` es el Json escalar de ProjectCanvas; la relación a CanvasSection es
  // `canvasSections` → se consulta aparte (evita la colisión de nombres).
  const canvases = await prisma.projectCanvas.findMany({
    where: { name: "Kickoff" },
    select: { id: true, project: { select: { name: true } } },
  });

  console.log(`${canvases.length} canvas(es) "Kickoff" encontrados.\n`);

  let sectionsCreated = 0;
  let blocksSeeded = 0;
  let reordered = 0;

  for (const canvas of canvases) {
    const projName = canvas.project?.name ?? "(sin proyecto)";
    const existing = await prisma.canvasSection.findMany({
      where: { canvasId: canvas.id },
      select: { id: true, key: true, order: true, _count: { select: { blocks: true } } },
      orderBy: { order: "asc" },
    });
    const existingKeys = new Set(existing.map((s) => s.key));
    const missing = CANON.filter((s) => !existingKeys.has(s.key));
    const seq = kickoffSectionSequence(existing.map((s) => s.key));

    // 1. Crear las secciones canónicas que falten, ya en su posición de la secuencia.
    for (const s of missing) {
      console.log(`  + [${projName}] crear sección "${s.key}" (${s.label}) en order ${seq.indexOf(s.key)}`);
      sectionsCreated++;
      if (APPLY) {
        await prisma.canvasSection.create({
          data: { canvasId: canvas.id, key: s.key, label: LABEL_BY_KEY.get(s.key)!, order: seq.indexOf(s.key) },
        });
      }
    }

    // 2. Densificar el `order` de las preexistentes a su índice en la secuencia
    //    (preserva el orden relativo del CSE; solo abre hueco para las nuevas).
    if (missing.length) {
      for (const s of existing) {
        const target = seq.indexOf(s.key);
        if (s.order === target) continue;
        console.log(`  ~ [${projName}] "${s.key}" order ${s.order} → ${target}`);
        reordered++;
        if (APPLY) await prisma.canvasSection.update({ where: { id: s.id }, data: { order: target } });
      }
    }

    // 3. Sembrar el bloque default en las secciones que lo tengan y no tengan ninguno.
    for (const [key, defaultData] of DATA_BY_KEY) {
      const sec = existing.find((s) => s.key === key);
      const isNew = !sec;
      if (!isNew && sec._count.blocks > 0) continue;
      console.log(`  + [${projName}] sembrar bloque default en "${key}"`);
      blocksSeeded++;
      if (!APPLY) continue;
      // Las recién creadas no están en `existing` → resolver su id.
      const sectionId = sec?.id ?? (await prisma.canvasSection.findFirstOrThrow({
        where: { canvasId: canvas.id, key },
        select: { id: true },
      })).id;
      await prisma.canvasBlock.create({
        data: {
          sectionId,
          blockType: "CARD",
          content: null,
          data: defaultData as Prisma.InputJsonValue,
          order: 0,
          source: "HUMAN",
          status: "CONFIRMED",
        },
      });
    }
  }

  console.log(
    `\nResumen: ${sectionsCreated} sección(es) ${APPLY ? "creadas" : "por crear"}, ` +
      `${blocksSeeded} bloque(s) ${APPLY ? "sembrados" : "por sembrar"}, ` +
      `${reordered} reorden(es) ${APPLY ? "aplicados" : "pendientes"}.`,
  );
  if (!APPLY) console.log("\n(Dry-run: nada se escribió. Revisá y corré con --apply.)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
