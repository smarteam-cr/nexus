/**
 * scripts/seed-process-knowledge.ts
 *
 * Crea/actualiza 5 documentos de conocimiento de tipo PROCESS (PUBLISHED) con los
 * procesos de implementación por servicio (Sales/Service/Marketing Hub, Integraciones,
 * Atom). Lee el contenido de los .md de Downloads (a partir del primer encabezado
 * `# `), upserta los tags y vincula. Idempotente por TÍTULO (re-correr actualiza).
 *
 * Uso: npx tsx scripts/seed-process-knowledge.ts
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { PrismaClient, type KnowledgeType, type KnowledgeStatus, type TagCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const AUTHOR = "egonzalez@smarteamcr.com";

type Tag = { category: TagCategory; value: string; label: string };
const t = (category: TagCategory, value: string, label: string): Tag => ({ category, value, label });

// Tags reutilizables
const STAGE_IMPL = t("STAGE", "implementacion", "Implementación");
const TOPIC_IMPL = t("TOPIC", "implementacion", "implementación");
const TOPIC_TAREAS = t("TOPIC", "tareas", "tareas");
const TOPIC_ONBOARDING = t("TOPIC", "onboarding", "onboarding");

const DOCS: Array<{ file: string; title: string; summary: string; tags: Tag[] }> = [
  {
    file: "C:/Users/ideli/Downloads/proceso-sales-hub.md",
    title: "Proceso de implementación — Sales Hub",
    summary:
      "Proceso completo de implementación de Sales Hub: protocolo de inicio, análisis y planificación, configuración (usuarios, propiedades, fichas, pipeline de ventas, automatizaciones), workflow de asignación de leads, importación de base de datos y capacitaciones. Úsalo al generar las tareas de un proyecto de implementación de Sales.",
    tags: [t("SERVICE", "sales", "Sales"), t("HUBSPOT_AREA", "sales_hub", "Sales Hub"), STAGE_IMPL, TOPIC_IMPL, TOPIC_TAREAS, TOPIC_ONBOARDING],
  },
  {
    file: "C:/Users/ideli/Downloads/proceso-integraciones-crm.md",
    title: "Proceso de implementación — Integraciones de CRM",
    summary:
      "Proceso para conectar HubSpot con sistemas externos (ERP, otro CRM, e-commerce, base de datos propia, app a medida), sincronizar datos o migrar desde un CRM legado. El método de integración es un fork (nativo / Data Sync / iPaaS / custom) que se decide en la fase de Arquitectura y determina las tareas de conexión. Módulos condicionales: introducción al sistema externo, preparación de datos y migración / carga histórica.",
    tags: [
      t("SERVICE", "integraciones", "Integraciones"), t("HUBSPOT_AREA", "operations_hub", "Operations Hub"), STAGE_IMPL,
      TOPIC_IMPL, TOPIC_TAREAS, t("TOPIC", "integracion", "integración"), t("TOPIC", "data_sync", "data sync"), t("TOPIC", "migracion", "migración"), t("TOPIC", "api", "api"),
    ],
  },
  {
    file: "C:/Users/ideli/Downloads/proceso-service-hub.md",
    title: "Proceso de implementación — Service Hub",
    summary:
      "Proceso de implementación de Service Hub con fases núcleo (configuración base, pipeline de tickets y Help Desk, canales de soporte, workflows de enrutamiento, reportería, capacitaciones) y módulos condicionales que el agente activa según el caso: SLAs, base de conocimiento, portal del cliente, encuestas de feedback, Customer Success Workspace + Health Score, Customer Agent (IA) e importación. Varios requieren Service Hub Pro o Enterprise.",
    tags: [
      t("SERVICE", "service", "Service"), t("HUBSPOT_AREA", "service_hub", "Service Hub"), STAGE_IMPL,
      TOPIC_IMPL, TOPIC_TAREAS, t("TOPIC", "tickets", "tickets"), t("TOPIC", "sla", "sla"), t("TOPIC", "customer_success", "customer success"), t("TOPIC", "health_score", "health score"),
    ],
  },
  {
    file: "C:/Users/ideli/Downloads/proceso-atom-chat.md",
    title: "Proceso de implementación — Atom Chat",
    summary:
      "Proceso completo de implementación de Atom (plataforma conversacional): introducción a la herramienta, set up inicial, capacitación segmentada por rol (agentes / administradores), conectividad con META/HubSpot/Instagram/Messenger, set up de conversaciones, flujos inbound, campañas outbound, reportes y refuerzo. Úsalo al generar las tareas de un proyecto de implementación de Atom.",
    tags: [
      t("SERVICE", "conversacional_atom", "Conversacional / Atom"), t("HUBSPOT_AREA", "conversaciones", "Conversaciones"), STAGE_IMPL,
      TOPIC_IMPL, TOPIC_TAREAS, t("TOPIC", "conversacional", "conversacional"), t("TOPIC", "atom", "atom"),
    ],
  },
  {
    file: "C:/Users/ideli/Downloads/proceso-marketing-hub.md",
    title: "Proceso de implementación — Marketing Hub",
    summary:
      "Proceso completo de implementación de Marketing Hub: diagramación de canales de ingreso, conexión del dominio de correo, conexión de formularios web (paramétrico por cantidad), workflows de gestión automatizada (paramétrico), conexión de chat de Messenger y capacitaciones. Úsalo al generar las tareas de un proyecto de implementación de Marketing.",
    tags: [t("SERVICE", "marketing", "Marketing"), t("HUBSPOT_AREA", "marketing_hub", "Marketing Hub"), STAGE_IMPL, TOPIC_IMPL, TOPIC_TAREAS, TOPIC_ONBOARDING],
  },
];

/** El contenido del .md empieza en el primer encabezado `# ` (la ficha NEXUS va arriba). */
function extractContent(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith("# "));
  return (idx >= 0 ? lines.slice(idx).join("\n") : raw).trim();
}

async function upsertTag(tag: Tag): Promise<string> {
  const row = await prisma.knowledgeTag.upsert({
    where: { category_value: { category: tag.category, value: tag.value } },
    create: { category: tag.category, value: tag.value, label: tag.label },
    update: { label: tag.label },
    select: { id: true },
  });
  return row.id;
}

async function main() {
  for (const d of DOCS) {
    const content = extractContent(readFileSync(d.file, "utf8"));
    const tagIds = [];
    for (const tag of d.tags) tagIds.push(await upsertTag(tag));

    const existing = await prisma.knowledgeDocument.findFirst({ where: { title: d.title }, select: { id: true } });
    if (existing) {
      await prisma.knowledgeDocument.update({
        where: { id: existing.id },
        data: {
          type: "PROCESS" as KnowledgeType, status: "PUBLISHED" as KnowledgeStatus,
          summary: d.summary, content, updatedByEmail: AUTHOR,
          version: { increment: 1 },
          tags: { set: tagIds.map((id) => ({ id })) },
        },
      });
      console.log(`✎ actualizado: ${d.title}  (${content.length} chars, ${tagIds.length} tags)`);
    } else {
      await prisma.knowledgeDocument.create({
        data: {
          type: "PROCESS" as KnowledgeType, status: "PUBLISHED" as KnowledgeStatus,
          title: d.title, summary: d.summary, content,
          createdByEmail: AUTHOR, updatedByEmail: AUTHOR,
          tags: { connect: tagIds.map((id) => ({ id })) },
        },
      });
      console.log(`✓ creado: ${d.title}  (${content.length} chars, ${tagIds.length} tags)`);
    }
  }
  console.log(`\nTotal KnowledgeDocuments: ${await prisma.knowledgeDocument.count()}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
