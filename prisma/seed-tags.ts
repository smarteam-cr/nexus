import { PrismaClient, TagCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const initialTags = [
  // SERVICE
  { category: "SERVICE", value: "loop_marketing",    label: "Loop Marketing" },
  { category: "SERVICE", value: "loop_sales",        label: "Loop Sales" },
  { category: "SERVICE", value: "loop_service",      label: "Loop Service" },
  { category: "SERVICE", value: "proyecto_temporal", label: "Proyecto temporal" },
  { category: "SERVICE", value: "todos",             label: "Todos los servicios" },
  // STAGE
  { category: "STAGE", value: "diagnostico", label: "Diagnóstico" },
  { category: "STAGE", value: "mvp",         label: "MVP" },
  { category: "STAGE", value: "adopcion",    label: "Adopción" },
  // SUBSTAGE
  { category: "SUBSTAGE", value: "analisis_inicial",    label: "Análisis inicial" },
  { category: "SUBSTAGE", value: "entrevistas",         label: "Entrevistas" },
  { category: "SUBSTAGE", value: "mapeo",               label: "Mapeo de procesos" },
  { category: "SUBSTAGE", value: "datos",               label: "Análisis de datos" },
  { category: "SUBSTAGE", value: "funnel",              label: "Análisis de funnel" },
  { category: "SUBSTAGE", value: "diagnostico_informe", label: "Informe de diagnóstico" },
  { category: "SUBSTAGE", value: "diseno_proceso",      label: "Diseño de proceso" },
  { category: "SUBSTAGE", value: "diseno_rutina",       label: "Diseño de rutina" },
  { category: "SUBSTAGE", value: "politicas",           label: "Políticas y ciclo de vida" },
  { category: "SUBSTAGE", value: "plan_piloto",         label: "Plan de piloto" },
  { category: "SUBSTAGE", value: "habilitacion_crm",    label: "Habilitación de CRM" },
  { category: "SUBSTAGE", value: "entrenamiento",       label: "Entrenamiento / onboarding" },
  { category: "SUBSTAGE", value: "kickoff",             label: "Kick off" },
  { category: "SUBSTAGE", value: "piloto",              label: "Piloto" },
  { category: "SUBSTAGE", value: "escalamiento",        label: "Escalamiento" },
  { category: "SUBSTAGE", value: "liderazgo",           label: "Liderazgo" },
  { category: "SUBSTAGE", value: "alineacion",          label: "Alineación interdepartamental" },
  { category: "SUBSTAGE", value: "evolucion",           label: "Evolución continua" },
  // DOMAIN
  { category: "DOMAIN", value: "marketing",        label: "Marketing" },
  { category: "DOMAIN", value: "sales",            label: "Ventas" },
  { category: "DOMAIN", value: "service",          label: "Servicio al cliente" },
  { category: "DOMAIN", value: "cross_department", label: "Cross-departamental" },
  { category: "DOMAIN", value: "general",          label: "General" },
  // HUBSPOT_AREA
  { category: "HUBSPOT_AREA", value: "crm_objects",         label: "Objetos del CRM" },
  { category: "HUBSPOT_AREA", value: "automation",          label: "Automatización" },
  { category: "HUBSPOT_AREA", value: "workflows",           label: "Workflows" },
  { category: "HUBSPOT_AREA", value: "reporting",           label: "Reportería" },
  { category: "HUBSPOT_AREA", value: "pipelines",           label: "Pipelines" },
  { category: "HUBSPOT_AREA", value: "breeze",              label: "Breeze AI" },
  { category: "HUBSPOT_AREA", value: "breeze_agents",       label: "Breeze Agents" },
  { category: "HUBSPOT_AREA", value: "breeze_assistants",   label: "Breeze Assistants" },
  { category: "HUBSPOT_AREA", value: "sequences",           label: "Sequences" },
  { category: "HUBSPOT_AREA", value: "integrations",        label: "Integraciones" },
  { category: "HUBSPOT_AREA", value: "hubcode",             label: "HubCode" },
  { category: "HUBSPOT_AREA", value: "content_hub",         label: "Content Hub" },
  { category: "HUBSPOT_AREA", value: "service_hub",         label: "Service Hub" },
  { category: "HUBSPOT_AREA", value: "sales_hub",           label: "Sales Hub" },
  { category: "HUBSPOT_AREA", value: "marketing_hub",       label: "Marketing Hub" },
  // TOPIC
  { category: "TOPIC", value: "gestion_cambio",      label: "Gestión del cambio" },
  { category: "TOPIC", value: "liderazgo_rutinas",   label: "Rutinas de liderazgo" },
  { category: "TOPIC", value: "onboarding",          label: "Onboarding" },
  { category: "TOPIC", value: "data_quality",        label: "Calidad de datos" },
  { category: "TOPIC", value: "adopcion_crm",        label: "Adopción de CRM" },
  { category: "TOPIC", value: "indicadores",         label: "Indicadores y métricas" },
  { category: "TOPIC", value: "escala_rendimiento",  label: "Escala de rendimiento" },
  { category: "TOPIC", value: "inbound",             label: "Metodología Inbound" },
  { category: "TOPIC", value: "customer_journey",    label: "Customer Journey" },
  { category: "TOPIC", value: "smarketing",          label: "Smarketing" },
  { category: "TOPIC", value: "hand_off",            label: "Hand off entre áreas" },
  { category: "TOPIC", value: "creditos",            label: "Sistema de créditos" },
] as const;

async function main() {
  console.log("Seeding knowledge tags...");

  let created = 0;
  let skipped = 0;

  for (const tag of initialTags) {
    const result = await prisma.knowledgeTag.upsert({
      where: { category_value: { category: tag.category as TagCategory, value: tag.value } },
      update: { label: tag.label },
      create: { category: tag.category as TagCategory, value: tag.value, label: tag.label },
    });
    if (result) created++;
    else skipped++;
  }

  console.log(`Done. ${initialTags.length} tags upserted (${created} created/updated, ${skipped} skipped).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
