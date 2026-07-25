/**
 * scripts/fix-titulos-basura.ts
 *
 * Limpia títulos de portada que quedaron con la cadena "[object Object]".
 *
 * QUÉ PASÓ: el campo de título de la portada comitea su propio texto al perder el foco.
 * Durante una recarga en caliente, una pestaña abierta recibió un valor que no era texto,
 * el navegador lo pintó como "[object Object]" y al despintarse ESA cadena se guardó,
 * pisando el título. La causa ya está cerrada en el propio campo
 * (components/landing/inline.tsx: lo que no es texto se trata como vacío), así que esto
 * es solo saneo de lo que alcanzó a escribirse.
 *
 * POR QUÉ BORRA EN VEZ DE ESCRIBIR UN TÍTULO: con el campo vacío, la portada resuelve
 * sola su título (lo que ya tenía de titular y, si no, el rótulo del documento). Escribir
 * uno acá sería inventar contenido y además taparía el título bueno que el agente ponga
 * la próxima vez.
 *
 * Ensayo primero, como todo saneo del repo:
 *   npx tsx scripts/fix-titulos-basura.ts            # muestra qué haría
 *   npx tsx scripts/fix-titulos-basura.ts --apply
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASURA = "[object Object]";
const APPLY = process.argv.includes("--apply");

/** Devuelve la data sin las claves de texto que quedaron con la cadena basura. */
function limpiar(data: Record<string, unknown>): { limpia: Record<string, unknown>; claves: string[] } {
  const claves: string[] = [];
  const limpia: Record<string, unknown> = { ...data };
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === "string" && v.trim() === BASURA) {
      delete limpia[k];
      claves.push(k);
    }
  }
  return { limpia, claves };
}

async function main() {
  // Se busca por el TEXTO del json para no atarse a una clave: la basura pudo caer en
  // cualquier campo editable de cualquier sección, no solo en el título.
  const sospechosos = await prisma.$queryRaw<
    Array<{ id: string; slug: string | null; key: string; canvasName: string; projectName: string | null }>
  >`
    SELECT b.id, c.slug, s.key, c.name AS "canvasName", p.name AS "projectName"
    FROM "CanvasBlock" b
    JOIN "CanvasSection" s ON s.id = b."sectionId"
    JOIN "ProjectCanvas" c ON c.id = s."canvasId"
    LEFT JOIN "Project" p ON p.id = c."projectId"
    WHERE b.data::text LIKE ${"%" + BASURA + "%"}
  `;

  if (sospechosos.length === 0) {
    console.log("Sin bloques con la cadena basura. Nada que hacer.");
    return;
  }

  console.log(`${sospechosos.length} bloque(s) con "${BASURA}":\n`);
  let tocados = 0;

  for (const s of sospechosos) {
    const bloque = await prisma.canvasBlock.findUnique({ where: { id: s.id }, select: { data: true } });
    const data = (bloque?.data ?? {}) as Record<string, unknown>;
    const { limpia, claves } = limpiar(data);
    if (claves.length === 0) {
      console.log(`  · ${s.projectName ?? "?"} — ${s.canvasName}/${s.key}: la cadena está anidada, se salta`);
      continue;
    }
    console.log(
      `  ${APPLY ? "LIMPIA" : "limpiaría"}  ${s.projectName ?? "?"} — ${s.canvasName}/${s.key}` +
        `  ·  campos: ${claves.join(", ")}`,
    );
    if (APPLY) {
      await prisma.canvasBlock.update({
        where: { id: s.id },
        data: { data: limpia as Prisma.InputJsonValue },
      });
    }
    tocados++;
  }

  console.log(
    `\n${APPLY ? `Listo: ${tocados} bloque(s) saneado(s).` : `Ensayo: ${tocados} bloque(s) se sanearían. Corré con --apply.`}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
