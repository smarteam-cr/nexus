/**
 * scripts/backfill-titulos-portada.ts
 *
 * Le pone TÍTULO CORTO a las portadas de los documentos del motor que ya tienen
 * contenido escrito — sin regenerar el documento.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * Las portadas ganaron un campo de título corto, y el respaldo hace que ninguna quede
 * sin título: mientras no tenga uno propio, se muestra su titular. El problema es que
 * ese titular suele ser largo ("Requerimiento técnico: Migración Salesforce → HubSpot +
 * Integraciones Slack, Jira y Aircall"), que es justo lo que se quería dejar de ver
 * arriba.
 *
 * La alternativa era regenerar cada documento entero. Eso cuesta caro, reescribe TODAS
 * las secciones y pisaría lo que alguien haya curado a mano. Este script hace lo mínimo:
 * lee lo que la portada YA dice y escribe una sola clave, `titulo`. Ninguna otra sección
 * se toca, ningún otro campo se toca.
 *
 * ── QUÉ NO HACE ──────────────────────────────────────────────────────────────
 * · No inventa contenido: si la portada está vacía (sin titular ni resumen) la SALTEA.
 *   Ahí no hay nada que resumir y lo que corresponde es correr el agente del documento.
 * · No pisa un título ya escrito.
 * · No cambia `source` del bloque: un bloque curado a mano sigue marcado como tal.
 * · No re-publica nada. Los documentos ya compartidos con el cliente guardan una foto
 *   congelada y siguen mostrando su portada anterior hasta que alguien los vuelva a subir.
 *
 * Ensayo primero, como todo saneo del repo:
 *   npx tsx scripts/backfill-titulos-portada.ts                  # muestra qué escribiría
 *   npx tsx scripts/backfill-titulos-portada.ts --apply
 *   npx tsx scripts/backfill-titulos-portada.ts --slug=kickoff   # acota a un tipo
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";
import { anthropic } from "@/lib/anthropic";
import { HERO_TITLE_MAX_CHARS } from "@/lib/landing/hero-title";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const MODEL = "claude-sonnet-4-6";
const APPLY = process.argv.includes("--apply");
const SLUG_FILTRO = process.argv.find((a) => a.startsWith("--slug="))?.split("=")[1] ?? null;

/** La portada de cada documento del motor: su clave de sección y su rótulo. */
const PORTADAS: Record<string, { key: string; rotulo: string }> = {
  kickoff: { key: "bienvenida", rotulo: "¡Arranquemos juntos!" },
  "tech-requirements": { key: "requerimiento", rotulo: "Requerimiento técnico" },
  exploration: { key: "exploracion", rotulo: "Qué hay que entender de este proyecto" },
  diagnosis: { key: "diagnostico", rotulo: "Diagnóstico de rendimiento" },
  planning: { key: "planificacion", rotulo: "Plan de implementación" },
  implementation: { key: "implementacion", rotulo: "Guía de construcción" },
};

interface Fila {
  blockId: string;
  slug: string;
  proyecto: string;
  titular: string;
  resumen: string;
  data: Record<string, unknown>;
}

/** Una sola llamada al modelo. `apretar` = segundo intento pidiendo que lo acorte. */
async function unIntento(f: Fila, apretar?: string): Promise<string> {
  const { rotulo } = PORTADAS[f.slug];
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 100,
    system:
      `Escribís el TÍTULO de una página de documento. Máximo ${HERO_TITLE_MAX_CHARS} caracteres. ` +
      `Es el título de la página, no un titular de venta: sin verbos de transformación, sin ` +
      `promesas y sin dos puntos seguidos de una enumeración. Debe leerse como el nombre del ` +
      `documento, del tipo "${rotulo}", pero pudiendo precisar de qué trata este caso concreto. ` +
      `Respondé SOLO con el título, sin comillas ni explicación.`,
    messages: [
      {
        role: "user",
        content:
          `Tipo de documento: ${rotulo}\n` +
          `Titular actual: ${f.titular || "(vacío)"}\n` +
          `Resumen actual: ${f.resumen || "(vacío)"}\n\n` +
          (apretar
            ? `Tu intento anterior fue "${apretar}" (${apretar.length} caracteres): pasa el tope. ` +
              `Escribilo de nuevo en ${HERO_TITLE_MAX_CHARS} caracteres o menos, sacando lo accesorio ` +
              `y conservando lo que identifica al documento.\n\nEl título corto:`
            : `El título corto:`),
      },
    ],
  });
  return msg.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim()
    .replace(/^["'«»]|["'«»]$/g, "")
    .trim();
}

/**
 * Pide UN título corto a partir de lo que la portada ya dice.
 *
 * Un título más largo que el tope NO se recorta con puntos suspensivos —cortar una frase
 * a la mitad se lee peor que una larga— y tampoco se acepta: reintroduciría justo el
 * problema que este backfill corrige. Se pide de nuevo una vez, diciendo por cuánto se
 * pasó; si el segundo intento tampoco entra, se salta y queda para hacerlo a mano.
 */
async function pedirTitulo(f: Fila): Promise<string | null> {
  let texto = await unIntento(f);
  if (texto.length > HERO_TITLE_MAX_CHARS) {
    const largo = texto;
    texto = await unIntento(f, largo);
    if (texto.length > HERO_TITLE_MAX_CHARS) {
      console.warn(`    ⚠ dos intentos pasados de largo (${largo.length} y ${texto.length}): "${texto}"`);
      return null;
    }
  }
  return texto || null;
}

async function main() {
  const slugs = SLUG_FILTRO ? [SLUG_FILTRO] : Object.keys(PORTADAS);
  const desconocido = slugs.find((s) => !PORTADAS[s]);
  if (desconocido) {
    console.error(`Slug desconocido: ${desconocido}. Opciones: ${Object.keys(PORTADAS).join(", ")}`);
    process.exit(1);
  }

  const filas: Fila[] = [];
  for (const slug of slugs) {
    const { key } = PORTADAS[slug];
    const bloques = await prisma.canvasBlock.findMany({
      where: {
        section: { key, canvas: { slug, projectId: { not: null } } },
      },
      select: {
        id: true,
        data: true,
        section: { select: { canvas: { select: { slug: true, project: { select: { name: true } } } } } },
      },
    });
    for (const b of bloques) {
      const data = (b.data ?? {}) as Record<string, unknown>;
      const txt = (k: string) => (typeof data[k] === "string" ? (data[k] as string).trim() : "");
      if (txt("titulo")) continue; // ya tiene título propio: no se pisa
      const titular = txt("headline");
      const resumen = txt("subhead");
      if (!titular && !resumen) continue; // portada vacía: no hay nada que resumir
      filas.push({
        blockId: b.id,
        slug: b.section.canvas.slug ?? slug,
        proyecto: b.section.canvas.project?.name ?? "?",
        titular,
        resumen,
        data,
      });
    }
  }

  if (filas.length === 0) {
    console.log("Ninguna portada con contenido y sin título. Nada que hacer.");
    return;
  }

  console.log(`${filas.length} portada(s) con contenido y sin título corto:\n`);
  let escritas = 0;
  for (const f of filas) {
    const titulo = await pedirTitulo(f);
    if (!titulo) {
      console.log(`  ·  ${f.proyecto} — ${f.slug}: sin título utilizable, se salta`);
      continue;
    }
    console.log(`  ${APPLY ? "ESCRIBE" : "escribiría"}  ${f.proyecto} — ${f.slug}`);
    console.log(`      título:  "${titulo}"`);
    console.log(`      pasa a bajada:  "${f.titular.slice(0, 70)}${f.titular.length > 70 ? "…" : ""}"`);
    if (APPLY) {
      // Solo la clave `titulo`. El resto de la data —y el `source` del bloque— quedan igual.
      await prisma.canvasBlock.update({
        where: { id: f.blockId },
        data: { data: { ...f.data, titulo } as Prisma.InputJsonValue },
      });
    }
    escritas++;
  }

  console.log(
    `\n${APPLY ? `Listo: ${escritas} título(s) escrito(s).` : `Ensayo: ${escritas} se escribirían. Corré con --apply.`}`,
  );
  if (!APPLY) console.log("(El ensayo YA consultó al modelo: los textos de arriba son los que se escribirían.)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
