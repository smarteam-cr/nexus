/**
 * scripts/seed-escala-rendimiento.ts — la Escala de Rendimiento 5.2 en la base de conocimiento.
 *
 * Siembra los DOS documentos que leen los agentes, armados desde el mismo archivo que alimenta
 * Documentación (`lib/documentacion/semillas/escala-rendimiento-v5.md`, vía
 * `lib/knowledge/escala-v5-documentos.ts`):
 *   · «Escala de Rendimiento Smarteam» — el reglamento completo, etiqueta `escala_rendimiento`.
 *     La vara del Diagnóstico; también lo tiene fijado el análisis de ventas.
 *   · «Escala de Rendimiento — resumen para posicionar» — etiqueta `escala_resumen`. Lo leen la
 *     Propuesta, el Kickoff y la Entrega.
 *
 * ── LO QUE CUIDA ─────────────────────────────────────────────────────────────
 * 1. El reglamento se ACTUALIZA EN EL LUGAR: conserva su id, y con él los agentes que lo tienen
 *    fijado (`Agent.pinnedKnowledgeIds`). Uno nuevo quedaría sin fijar, y el viejo seguiría
 *    entrando por la etiqueta.
 * 2. Antes de pisar una versión distinta guarda una COPIA ARCHIVADA y sin etiquetas. Queda para
 *    comparar, y ningún agente la carga: los cargadores leen solo lo publicado.
 * 3. Es idempotente: con el contenido igual no escribe nada ni sube la versión.
 *
 * Uso:
 *   npx tsx scripts/seed-escala-rendimiento.ts                                    (muestra qué haría)
 *   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-escala-rendimiento.ts --apply
 */
import "dotenv/config";
import { KnowledgeStatus, KnowledgeType, TagCategory, type PrismaClient } from "@prisma/client";
import { resolverApply } from "./lib/guard";
import { createScriptDb } from "./lib/db";
import {
  construirDocumentosDeEscala,
  versionDeContenido,
  type DocumentoDeEscala,
} from "@/lib/knowledge/escala-v5-documentos";
import { ETIQUETA_ESCALA_COMPLETA, ETIQUETA_ESCALA_RESUMEN } from "@/lib/escala/fuente";

const APPLY = resolverApply({
  tablas: ["KnowledgeDocument", "KnowledgeTag", "_KnowledgeDocumentToKnowledgeTag"],
});

type Etiqueta = { category: TagCategory; value: string; label: string };

const DOMINIOS: Etiqueta[] = [
  { category: TagCategory.DOMAIN, value: "marketing", label: "Marketing" },
  { category: TagCategory.DOMAIN, value: "sales", label: "Ventas" },
  { category: TagCategory.DOMAIN, value: "service", label: "Servicio al cliente" },
  { category: TagCategory.DOMAIN, value: "general", label: "General" },
];

const ETIQUETAS_COMPLETA: Etiqueta[] = [
  { category: TagCategory.TOPIC, value: ETIQUETA_ESCALA_COMPLETA, label: "Escala de Rendimiento" },
  { category: TagCategory.TOPIC, value: "diagnostico_madurez", label: "Diagnóstico de madurez" },
  ...DOMINIOS,
];

const ETIQUETAS_RESUMEN: Etiqueta[] = [
  { category: TagCategory.TOPIC, value: ETIQUETA_ESCALA_RESUMEN, label: "Escala de Rendimiento — resumen" },
  ...DOMINIOS,
];

type Existente = {
  id: string;
  title: string;
  status: KnowledgeStatus;
  content: string;
  version: number;
  tags: { value: string }[];
};

/**
 * El documento a actualizar. El TÍTULO manda —es como lo encuentran los fijados hechos a mano
 * (`scripts/pin-escala-rendimiento.ts`)—; si nadie lo tiene, vale el único que lleve la etiqueta.
 * Con varios etiquetados y ninguno con el título, no se adivina: se aborta.
 */
async function buscar(
  prisma: PrismaClient,
  titulo: string,
  etiqueta: string,
): Promise<{ elegido: Existente | null; otros: Existente[] }> {
  const candidatos: Existente[] = await prisma.knowledgeDocument.findMany({
    where: {
      status: { not: KnowledgeStatus.ARCHIVED },
      OR: [{ title: titulo }, { tags: { some: { value: etiqueta } } }],
    },
    select: { id: true, title: true, status: true, content: true, version: true, tags: { select: { value: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const elegido = candidatos.find((c) => c.title === titulo) ?? (candidatos.length === 1 ? candidatos[0] : null);
  if (!elegido && candidatos.length > 1) {
    throw new Error(
      `Hay ${candidatos.length} documentos con la etiqueta ${etiqueta} y ninguno se llama «${titulo}»: ` +
        candidatos.map((c) => `«${c.title}» (${c.id})`).join(", "),
    );
  }
  return { elegido, otros: candidatos.filter((c) => c !== elegido) };
}

function mismasEtiquetas(existente: Existente, etiquetas: Etiqueta[]): boolean {
  const tiene = new Set(existente.tags.map((t) => t.value));
  return tiene.size === etiquetas.length && etiquetas.every((e) => tiene.has(e.value));
}

async function asegurarEtiquetas(prisma: PrismaClient, etiquetas: Etiqueta[]): Promise<string[]> {
  const ids: string[] = [];
  for (const e of etiquetas) {
    const tag = await prisma.knowledgeTag.upsert({
      where: { category_value: { category: e.category, value: e.value } },
      update: { label: e.label },
      create: e,
    });
    ids.push(tag.id);
  }
  return ids;
}

async function sembrar(
  prisma: PrismaClient,
  doc: DocumentoDeEscala,
  etiquetas: Etiqueta[],
  etiqueta: string,
  version: string,
  archivarLoAnterior: boolean,
): Promise<void> {
  const { elegido, otros } = await buscar(prisma, doc.titulo, etiqueta);
  for (const o of otros) {
    console.warn(
      `  ⚠ «${o.title}» (${o.id}) también lleva la etiqueta ${etiqueta}: el agente lo carga junto con este.`,
    );
  }

  if (
    elegido &&
    elegido.content === doc.contenido &&
    elegido.status === KnowledgeStatus.PUBLISHED &&
    mismasEtiquetas(elegido, etiquetas)
  ) {
    console.log(`= sin cambios: «${doc.titulo}» (${elegido.id}, v${elegido.version})`);
    return;
  }

  const versionAnterior = elegido ? versionDeContenido(elegido.content) : null;
  const archivar = archivarLoAnterior && !!elegido && versionAnterior !== version;
  const tituloArchivado = elegido
    ? `${elegido.title} — versión ${versionAnterior ?? "anterior a la 5"} (archivada)`
    : "";

  if (elegido) {
    console.log(
      `~ actualizar: «${doc.titulo}» (${elegido.id}) v${elegido.version} → v${elegido.version + 1} · ` +
        `${elegido.content.length.toLocaleString("es")} → ${doc.contenido.length.toLocaleString("es")} caracteres` +
        ` · contenido ${versionAnterior ?? "sin versión (v4)"} → ${version}`,
    );
  } else {
    console.log(`+ crear: «${doc.titulo}» · ${doc.contenido.length.toLocaleString("es")} caracteres`);
  }
  if (archivar) console.log(`+ archivar copia: «${tituloArchivado}» (sin etiquetas)`);
  if (!APPLY) return;

  const tagIds = await asegurarEtiquetas(prisma, etiquetas);

  if (archivar && elegido) {
    const yaArchivada = await prisma.knowledgeDocument.findFirst({
      where: { title: tituloArchivado, status: KnowledgeStatus.ARCHIVED },
      select: { id: true },
    });
    if (yaArchivada) {
      console.log(`  (la copia archivada ya existía: ${yaArchivada.id})`);
    } else {
      const copia = await prisma.knowledgeDocument.create({
        data: {
          type: KnowledgeType.METHODOLOGY,
          status: KnowledgeStatus.ARCHIVED,
          title: tituloArchivado,
          summary: `Copia de la versión reemplazada por la ${version} el ${new Date().toISOString().slice(0, 10)}. Ningún agente la lee.`,
          content: elegido.content,
        },
      });
      console.log(`  ✓ archivada: ${copia.id}`);
    }
  }

  if (elegido) {
    const hecho = await prisma.knowledgeDocument.update({
      where: { id: elegido.id },
      data: {
        type: KnowledgeType.METHODOLOGY,
        status: KnowledgeStatus.PUBLISHED,
        summary: doc.sumario,
        content: doc.contenido,
        version: { increment: 1 },
        tags: { set: tagIds.map((id) => ({ id })) },
      },
    });
    console.log(`  ✓ actualizado: ${hecho.id} (v${hecho.version})`);
  } else {
    const hecho = await prisma.knowledgeDocument.create({
      data: {
        type: KnowledgeType.METHODOLOGY,
        status: KnowledgeStatus.PUBLISHED,
        title: doc.titulo,
        summary: doc.sumario,
        content: doc.contenido,
        tags: { connect: tagIds.map((id) => ({ id })) },
      },
    });
    console.log(`  ✓ creado: ${hecho.id}`);
  }
}

async function main(): Promise<void> {
  const { version, fecha, completo, resumen } = construirDocumentosDeEscala();
  console.log(
    `Escala ${version} (${fecha}) · reglamento ${completo.contenido.length.toLocaleString("es")} caracteres · ` +
      `resumen ${resumen.contenido.length.toLocaleString("es")}`,
  );
  console.log(APPLY ? "Modo: --apply (escribe)\n" : "Modo: en seco — no escribe nada (agregá --apply)\n");

  const { prisma, close } = createScriptDb();
  try {
    await sembrar(prisma, completo, ETIQUETAS_COMPLETA, ETIQUETA_ESCALA_COMPLETA, version, true);
    await sembrar(prisma, resumen, ETIQUETAS_RESUMEN, ETIQUETA_ESCALA_RESUMEN, version, false);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
