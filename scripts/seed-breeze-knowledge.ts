/**
 * scripts/seed-breeze-knowledge.ts
 *
 * Siembra el BORRADOR del alcance de Breeze (qué puede y qué no puede construir el
 * agente de HubSpot) en la base de conocimiento.
 *
 * ⚠️ NACE EN ESTADO **DRAFT**, A PROPÓSITO. El gate de Implementación cuenta solo
 * documentos PUBLICADOS: sembrarlo publicado haría pasar el gate con un texto que el
 * equipo no revisó, y los prompts saldrían "verificados" contra un borrador. Publicarlo
 * es decisión del equipo (en /knowledge), no del seed. Hasta entonces, los prompts se
 * generan marcados "sin verificar" — que es la verdad.
 *
 * Idempotente (upsert por título). Correr con: npx tsx scripts/seed-breeze-knowledge.ts
 */
import { PrismaClient, TagCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TITLE = "Alcance de Breeze para construcción de portales (BORRADOR)";

const CONTENT = `# Alcance de Breeze para construcción de portales

> **BORRADOR generado por IA — revisar y completar antes de publicar.** Mientras este
> documento no esté PUBLICADO, el canvas de Implementación genera sus prompts marcados
> "sin verificar".

## Qué puede crear Breeze hoy (por verificar con el portal y la licencia)

- Propiedades personalizadas (con tipo y opciones de enumeración).
- Listas y segmentos.
- Workflows básicos (criterio de enrolamiento + acciones estándar).
- Formularios.
- Borradores de emails y páginas.
- Reportes simples.
- Configuración inicial de Breeze Agents (prospecting, customer, content) y Breeze
  Assistants (copilot en registros).

## Qué NO puede crear

- Pipelines y sus etapas (se configuran en Settings).
- Objetos personalizados.
- Permisos, equipos y particiones.
- Integraciones nativas y sincronizaciones de datos.
- Ajustes de suscripción y consentimiento.

## La forma de prompt que mejor funciona

- UNA acción por prompt; no encadenar más de 3 creaciones.
- Nombrar objeto + internal name propuesto + tipo + opciones.
- Cerrar con el criterio de éxito ("Verificá que la propiedad aparezca en el objeto Negocio").

## Precondiciones típicas

- La propiedad referida debe existir antes del workflow que la usa.
- Las listas antes de los enrolamientos que las consumen.

## Pendiente de completar por el equipo

- Límites por tier de licencia.
- Comportamiento en portales con sandbox.
- Capacidades nuevas del release actual de Breeze.

Cuando esté revisado: cambiar el estado a **Publicado** para que los prompts de
Implementación salgan verificados contra esta spec.`;

const TAGS: { category: TagCategory; value: string; label: string }[] = [
  { category: TagCategory.HUBSPOT_AREA, value: "breeze_agents", label: "Breeze Agents" },
  { category: TagCategory.HUBSPOT_AREA, value: "breeze_assistants", label: "Breeze Assistants" },
];

async function main() {
  const tagIds: string[] = [];
  for (const t of TAGS) {
    const tag = await prisma.knowledgeTag.upsert({
      where: { category_value: { category: t.category, value: t.value } },
      update: {},
      create: { category: t.category, value: t.value, label: t.label },
    });
    tagIds.push(tag.id);
  }

  const existing = await prisma.knowledgeDocument.findFirst({ where: { title: TITLE } });
  if (existing) {
    // Solo se re-conectan los tags: el CONTENIDO no se pisa (el equipo pudo haberlo
    // editado) y el STATUS tampoco (publicarlo o no es decisión del equipo).
    await prisma.knowledgeDocument.update({
      where: { id: existing.id },
      data: { tags: { set: tagIds.map((id) => ({ id })) } },
    });
    console.log(`[seed-breeze] Ya existe (${existing.status}) — contenido y estado intactos: ${existing.id}`);
  } else {
    const created = await prisma.knowledgeDocument.create({
      data: {
        title: TITLE,
        summary: "Qué puede y qué no puede construir Breeze, y cómo escribirle prompts. BORRADOR a revisar.",
        content: CONTENT,
        type: "HUBSPOT_SPEC",
        status: "DRAFT", // ⚠️ nunca PUBLISHED desde el seed — ver el encabezado
        tags: { connect: tagIds.map((id) => ({ id })) },
      },
    });
    console.log(`[seed-breeze] Creado en DRAFT: ${created.id} — "${created.title}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
