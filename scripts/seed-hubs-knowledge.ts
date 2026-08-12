/**
 * scripts/seed-hubs-knowledge.ts
 *
 * Siembra UN documento por Hub de HubSpot en la base de conocimiento: para qué sirve,
 * qué se implementa típicamente en él y con qué vocabulario se habla.
 *
 * PARA QUÉ EXISTE: la propuesta comercial de tipo HubSpot arma una sección de "Hubs del
 * cliente" con una columna por Hub vendido. Sin esta base, el agente escribe lo que le
 * suena de cada Hub; con ella, parte de material curado por Smarteam y lo ATERRIZA a la
 * industria del cliente. El `KnowledgeTag` de cada documento usa el MISMO slug que
 * `lib/tags/catalog.ts`, así `loadKnowledgeByTags(hubSlugs)` los encuentra sin traducir.
 *
 * ⚠️ NACEN EN **DRAFT**, A PROPÓSITO — igual que `seed-breeze-knowledge.ts`. `DRAFT` está
 * definido como "no visible para agentes" y `loadKnowledgeByTags` solo lee `PUBLISHED`:
 * sembrarlos publicados haría que los agentes trataran como verdad un texto que nadie
 * revisó. **Hasta que el equipo los publique en /knowledge, la sección se genera igual
 * pero sin este material.** Publicar es decisión del equipo, no del seed.
 *
 * Idempotente (upsert por título): re-correrlo NO pisa contenido ni estado — el equipo
 * pudo haber editado el texto y publicado el documento. Solo reconecta los tags.
 *
 * Correr con: ALLOW_PROD_WRITE=1 npx tsx scripts/seed-hubs-knowledge.ts
 */
import { createScriptDb } from "./lib/db";
import { assertProdWriteAllowed } from "./lib/guard";
import { TagCategory } from "@prisma/client";
import { HUBSPOT_HUB_SLUGS, labelForTag, type HubspotHubSlug } from "../lib/tags/catalog";

// Escribe SIEMPRE (no tiene --apply) contra la base que usan los clientes: el guard corre
// incondicional, igual que los seeds de prisma/. Ver CLAUDE.md invariante 3 + INV12.
assertProdWriteAllowed("seed-hubs-knowledge.ts");

// Presupuesto de conexiones ACOTADO (scripts/lib/db.ts): el pooler comparte ~15 slots
// con producción y las dos PCs de dev.
const { prisma, close } = createScriptDb();

interface HubDoc {
  slug: HubspotHubSlug;
  /** Títulos anteriores del documento, para que un renombre no cree un duplicado. */
  titulosHistoricos?: string[];
  summary: string;
  content: string;
}

/** El encabezado que lleva cada documento: qué es y cómo debe usarlo un agente. */
function marco(hub: string): string {
  return `> **Borrador sembrado por Nexus — revisar antes de publicar.** Mientras esté en
> BORRADOR ningún agente lo lee.
>
> Este material es **genérico**. Un agente que lo use NO debe copiarlo: tiene que
> traducirlo a la industria y al contexto del cliente que tiene enfrente. Si algo de acá
> no se puede respaldar con lo que el cliente dijo, no se escribe.

# ${hub}
`;
}

const DOCS: HubDoc[] = [
  {
    slug: "marketing_hub",
    summary: "Para qué sirve Marketing Hub, qué se implementa en él y cómo nombrarlo en una propuesta.",
    content: `${marco("Marketing Hub")}
## Qué problema resuelve

Que los interesados lleguen, se identifiquen y no se enfríen. Ataca el hueco entre "hacemos
campañas" y "sabemos qué campaña trajo qué negocio": sin él, la inversión publicitaria y el
contenido no se pueden atribuir a ingresos.

## Qué se implementa típicamente

- Captación de leads en los canales donde el cliente ya invierte (LinkedIn, Meta, Instagram,
  Google Ads), con la atribución conectada al CRM.
- Formularios nativos que crean o actualizan el registro, en vez de mandar un correo suelto.
- Nurturing por correo segmentado por interés o etapa.
- Scoring que decide cuándo un lead pasa a Ventas, con criterio acordado entre las dos áreas.
- Reportes por canal, campaña y origen.

## Vocabulario correcto

Lead, MQL, campaña, atribución, nurturing, scoring, lista activa, formulario, landing page.
NO se dice "mailing" ni "base de datos de correos".

## Qué NO es

No es una herramienta de diseño ni un gestor de redes sociales completo. La publicación
orgánica existe pero es acotada. No reemplaza a la agencia creativa.

## Cómo se ve una tarjeta buena, por arquetipo

- **B2B con ciclo largo**: "Captación de leads B2B en LinkedIn y Google Ads"
- **Retail / consumo**: "Segmentación por comportamiento de compra para campañas de recompra"
- **Servicios profesionales**: "Nurturing por correo a prospectos que descargaron material"
- **Industrial / distribución**: "Formularios de cotización que crean el negocio en el CRM"
`,
  },
  {
    slug: "sales_hub",
    summary: "Para qué sirve Sales Hub, qué se implementa en él y cómo nombrarlo en una propuesta.",
    content: `${marco("Sales Hub")}
## Qué problema resuelve

Que la venta deje de vivir en la cabeza del vendedor y en su Excel. Da un pipeline único,
visible, con la misma definición de etapa para todos, y saca del medio el trabajo manual de
cotizar y hacer seguimiento.

## Qué se implementa típicamente

- Pipeline por línea de negocio, con etapas y criterio de salida acordados (no heredados del
  default de HubSpot).
- Vista 360 del cliente: negocios, tickets, correos y llamadas en un solo lugar.
- Cotizaciones y plantillas de correo reutilizables.
- Secuencias de seguimiento para que un prospecto no se caiga por olvido.
- Reportes de ventas por ejecutivo, línea, territorio o ruta.
- Pronóstico basado en etapa y probabilidad.

## Vocabulario correcto

Negocio (deal), pipeline, etapa, cotización, secuencia, actividad, pronóstico, cierre.
NO se dice "oportunidad" salvo que el cliente ya lo use.

## Qué NO es

No factura ni cobra (eso es Revenue Hub). No es un ERP: no maneja inventario, despacho ni
contabilidad.

## Cómo se ve una tarjeta buena, por arquetipo

- **Importación / logística**: "Pipeline por línea de negocio (import/export)"
- **Servicios recurrentes**: "Renovaciones con alerta anticipada por vencimiento"
- **Manufactura**: "Cotizaciones con lista de precios por volumen"
- **Multi-sucursal**: "Reportes de ventas por ejecutivo y ruta"
`,
  },
  {
    slug: "service_hub",
    summary: "Para qué sirve Service Hub, qué se implementa en él y cómo nombrarlo en una propuesta.",
    content: `${marco("Service Hub")}
## Qué problema resuelve

Que un caso entre por donde entre quede registrado, tenga dueño y se pueda medir. El síntoma
típico es que soporte vive en WhatsApp y correos personales: nadie sabe cuántos casos hay
abiertos ni cuánto tardan.

## Qué se implementa típicamente

- Pipeline de tickets con etapas y responsables por tipo de caso.
- Captura desde todos los canales reales, incluidos los informales.
- Notificaciones de estatus al cliente (correo, WhatsApp) para bajar el "¿cómo va lo mío?".
- Base de conocimiento para lo que se pregunta una y otra vez.
- Encuestas de satisfacción después de resolver.
- Dashboards de SLA, tiempo de respuesta y casos reabiertos.

## Vocabulario correcto

Ticket, caso, SLA, primera respuesta, resolución, escalamiento, base de conocimiento, CSAT.
NO se dice "reclamo" salvo que sea el término del cliente.

## Qué NO es

No es un centro de llamadas ni un chat en vivo con agentes 24/7 (eso requiere licencias y
operación aparte). No reemplaza el sistema operativo de la empresa.

## Cómo se ve una tarjeta buena, por arquetipo

- **Logística / carga**: "Tickets de operación por furgón o contenedor"
- **Salud**: "Seguimiento de solicitudes de pacientes con SLA por urgencia"
- **Software**: "Base de conocimiento para las consultas repetidas de soporte"
- **Retail**: "Encuestas de satisfacción post-entrega"
`,
  },
  {
    slug: "content_hub",
    summary: "Para qué sirve Content Hub (ex CMS Hub), qué se implementa en él y cómo nombrarlo.",
    content: `${marco("Content Hub")}
> Antes se llamaba **CMS Hub**. En una propuesta se usa el nombre actual.

## Qué problema resuelve

Que el sitio deje de ser un activo aparte que hay que pedirle a un tercero para cambiar una
línea. Al vivir sobre el mismo CRM, el contenido puede personalizarse con lo que ya se sabe
del visitante y el equipo puede publicar sin depender de desarrollo.

## Qué se implementa típicamente

- Sitio o rediseño sobre plantillas editables por el propio equipo.
- Landing pages por campaña, con formulario conectado al CRM.
- Blog y SEO con recomendaciones dentro del editor.
- Personalización del contenido según etapa del ciclo de vida o industria del visitante.
- Área privada para clientes cuando aplica.

## Vocabulario correcto

Sitio, landing page, plantilla, módulo, blog, SEO, personalización, dominio.
NO se dice "página web" a secas cuando se habla de una landing de campaña.

## Qué NO es

No es una tienda en línea completa (eso toca Revenue Hub o una plataforma de comercio). No
es un reemplazo de una plataforma headless para catálogos muy grandes.

## Cómo se ve una tarjeta buena, por arquetipo

- **Servicios profesionales**: "Sitio editable por el equipo, sin depender de desarrollo"
- **Educación**: "Landing por programa con formulario de admisión conectado al CRM"
- **Industrial**: "Catálogo de productos con solicitud de cotización"
- **Franquicias**: "Páginas por sucursal con contenido personalizado por ubicación"
`,
  },
  {
    slug: "data_hub",
    summary: "Para qué sirve Data Hub (ex Operations Hub), qué se implementa en él y cómo nombrarlo.",
    content: `${marco("Data Hub")}
> Antes se llamaba **Operations Hub**. En una propuesta se usa el nombre actual.

## Qué problema resuelve

Que el dato en el que se toman decisiones sea uno solo y esté limpio. Aparece cuando algo ya
se rompió en silencio: dos áreas calculan la misma métrica distinto, alguien concilia a mano
todos los meses, o un registro mal cargado nadie lo detecta hasta que explota.

## Qué se implementa típicamente

- Sincronización bidireccional con los sistemas que ya existen (ERP, facturación, planilla).
- Deduplicación y reglas de calidad sobre los objetos del CRM.
- Automatización de la limpieza: formatos, mayúsculas, teléfonos, países.
- Propiedades calculadas y campos derivados que hoy alguien llena a mano.
- Reportería unificada que cruza fuentes.

## Vocabulario correcto

Fuente de verdad, sincronización, deduplicación, calidad de dato, propiedad calculada,
mapeo de campos, conciliación.
NO se dice "migración" cuando en realidad es una sincronización continua.

## Qué NO es

No es un data warehouse ni una herramienta de BI. No sustituye al ERP: lo complementa.

## Cómo se ve una tarjeta buena, por arquetipo

- **Distribución**: "Sincronización con el ERP para no cargar dos veces el mismo cliente"
- **Servicios financieros**: "Reglas de calidad sobre identificación y datos de contacto"
- **Multi-sucursal**: "Reportería unificada que cruza sucursales con una sola definición"
- **Cualquiera con Excel**: "Automatizar la limpieza que hoy alguien hace a mano cada mes"
`,
  },
  {
    slug: "revenue_hub",
    summary: "Para qué sirve Revenue Hub (ex Commerce Hub), qué se implementa en él y cómo nombrarlo.",
    content: `${marco("Revenue Hub")}
> Antes se llamaba **Commerce Hub** (HubSpot lo renombró en junio de 2026). En una propuesta
> se usa el nombre actual.

## Qué problema resuelve

Que cobrar no sea un proceso paralelo al de vender. Cierra el tramo entre "el negocio se ganó"
y "la plata entró": cotización, factura, cobro y renovación sobre el mismo registro.

## Qué se implementa típicamente

- Cotizaciones que se convierten en factura sin volver a cargar datos.
- Facturación y links de pago.
- Suscripciones y cobros recurrentes, con la renovación visible en el CRM.
- Seguimiento de pagos vencidos y recordatorios.
- Conciliación contra el sistema contable.

## Vocabulario correcto

Cotización, factura, link de pago, suscripción, renovación, cobro recurrente, conciliación.
NO se dice "facturación electrónica" salvo que se haya validado el requisito fiscal del país.

## Qué NO es

No es un sistema contable ni sustituye la facturación electrónica local donde la ley exige un
proveedor autorizado — ese punto SIEMPRE se valida con el equipo fiscal del cliente antes de
prometerlo.

## Cómo se ve una tarjeta buena, por arquetipo

- **SaaS / suscripción**: "Cobros recurrentes con la renovación visible en el negocio"
- **Servicios profesionales**: "Cotización que se convierte en factura sin recargar datos"
- **Retail B2B**: "Links de pago enviados desde el mismo registro del cliente"
- **Cualquiera con mora**: "Seguimiento de pagos vencidos con recordatorio automático"
`,
  },
];

function tituloDe(slug: HubspotHubSlug): string {
  return `${labelForTag(slug)}: para qué sirve y qué se implementa`;
}

async function main() {
  // Guarda de cobertura: si mañana entra un Hub al catálogo y nadie escribe su documento,
  // la propuesta lo pintaría sin material. Mejor que el seed lo diga.
  const sinDoc = HUBSPOT_HUB_SLUGS.filter((s) => !DOCS.some((d) => d.slug === s));
  if (sinDoc.length) {
    console.error(`[seed-hubs] FALTA documento para: ${sinDoc.join(", ")}`);
    process.exit(1);
  }

  let creados = 0;
  let intactos = 0;

  for (const doc of DOCS) {
    const label = labelForTag(doc.slug);
    const tag = await prisma.knowledgeTag.upsert({
      where: { category_value: { category: TagCategory.HUBSPOT_AREA, value: doc.slug } },
      update: {},
      create: { category: TagCategory.HUBSPOT_AREA, value: doc.slug, label },
    });

    const titulo = tituloDe(doc.slug);
    const titulos = [titulo, ...(doc.titulosHistoricos ?? [])];
    const existing = await prisma.knowledgeDocument.findFirst({ where: { title: { in: titulos } } });

    if (existing) {
      // Solo se reconectan los tags: contenido y estado son del equipo, no del seed.
      await prisma.knowledgeDocument.update({
        where: { id: existing.id },
        data: { tags: { set: [{ id: tag.id }] } },
      });
      intactos++;
      console.log(`[seed-hubs] ${label}: ya existe (${existing.status}) — contenido y estado intactos`);
    } else {
      await prisma.knowledgeDocument.create({
        data: {
          title: titulo,
          summary: doc.summary,
          content: doc.content,
          type: "HUBSPOT_SPEC",
          status: "DRAFT", // ⚠️ nunca PUBLISHED desde el seed — ver el encabezado
          tags: { connect: [{ id: tag.id }] },
        },
      });
      creados++;
      console.log(`[seed-hubs] ${label}: creado en DRAFT`);
    }
  }

  console.log(
    `\n[seed-hubs] ${creados} creado(s), ${intactos} intacto(s).` +
      (creados > 0
        ? `\n⚠️  Nacen en BORRADOR: ningún agente los lee hasta que el equipo los PUBLIQUE en /knowledge.`
        : ""),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => close());
