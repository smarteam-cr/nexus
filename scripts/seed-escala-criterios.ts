import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const CONTENT = `# Escala de Rendimiento — Criterios por Nivel y Hub

La Escala de Rendimiento mide la madurez operativa del cliente en tres dimensiones: **Ordenamiento** (procesos), **Velocidad** (automatización e IA) y **Efectividad** (uso de data para decidir). Se aplica de forma general y desglosada por Hub.

## Niveles (0–4)

### Nivel 0 — Deficiente
No hay proceso definido. Las acciones son reactivas, manuales y sin registro. No se usa el CRM de forma consistente. No hay métricas ni reportes.

### Nivel 1 — Básico
Existe un proceso informal (conocido por el equipo pero no documentado). El CRM se usa para registrar contactos y deals pero sin estructura. Las métricas son manuales o parciales. No hay automatizaciones.

### Nivel 2 — Estructurado
El proceso está documentado y el equipo lo sigue. El CRM tiene pipelines configurados, propiedades estándar y lifecycle stages definidos. Hay reportes básicos. Se usan algunas automatizaciones simples (workflows de notificación, secuencias de email). Los datos son confiables pero no completos.

### Nivel 3 — Optimizado
El proceso se mide y se optimiza periódicamente. Lead scoring activo. Automatizaciones avanzadas (nurturing, rotación de leads, SLAs). Reportes de atribución y ROI. El equipo toma decisiones basadas en datos. Hay alineación entre departamentos (SLA marketing↔ventas documentado).

### Nivel 4 — Inteligente
El proceso se auto-optimiza con IA. Breeze Agents o equivalentes operan tareas rutinarias. La data alimenta modelos predictivos. El equipo dedica su tiempo a estrategia, no a operación. Hay experimentación continua (A/B testing, optimización de conversión). Customer journey unificado cross-departamento.

---

## Criterios por Hub

### Marketing Hub

| Nivel | Ordenamiento | Velocidad | Efectividad |
|-------|-------------|-----------|-------------|
| 0 | Sin proceso de captación definido. Se publica contenido sin calendario ni buyer personas. | Todo es manual: emails masivos, publicaciones ad-hoc. | No se mide nada o solo métricas de vanidad (likes, impresiones). |
| 1 | Hay canales definidos (web, redes, email) pero sin estrategia integrada. Formularios básicos capturan leads. | Email marketing básico sin segmentación. Publicación en redes sin programación. | Se conoce el volumen de leads pero no su calidad ni su fuente real. |
| 2 | Calendario editorial activo. Formularios con campos de calificación. Landing pages por campaña. Lifecycle stages configurados. | Secuencias de email automatizadas. Workflows de nurturing básico. Segmentación por listas. | Reportes de leads por fuente, tasa de conversión de landing pages, engagement de emails. Dashboard de marketing operativo. |
| 3 | Buyer personas documentados y usados. Content strategy alineada al funnel. Lead scoring configurado y calibrado. UTM tracking sistemático. | Lead scoring automatizado. Nurturing multi-canal (email + ads). Smart content en web. Workflows de calificación MQL. | Attribution reporting activo. CAC y CPL por canal. Reportes de revenue attribution. A/B testing en emails y landing pages. |
| 4 | Customer journey mapeado end-to-end. Content generado con IA y optimizado por performance. Experiencia personalizada por segmento. | Breeze Agent para contenido. Campañas auto-optimizadas. Predictive lead scoring. Chatbots inteligentes. | Modelo de atribución multi-touch. Predicción de pipeline desde marketing. Experimentación continua con impacto medible en revenue. |

### Sales Hub

| Nivel | Ordenamiento | Velocidad | Efectividad |
|-------|-------------|-----------|-------------|
| 0 | Sin pipeline definido. Cada vendedor trabaja con su propio método. Deals se pierden sin registro. | Todo manual: seguimientos por memoria, cotizaciones en Word/Excel. | No hay visibilidad de pipeline ni forecast. Win rate desconocido. |
| 1 | Pipeline básico en CRM con etapas genéricas. Deals se registran pero sin consistencia. Contactos duplicados. | Algunas plantillas de email. Tareas creadas manualmente. | Se conoce el número de deals pero no las tasas de conversión entre etapas. Pipeline inflado con deals viejos. |
| 2 | Pipeline refleja el proceso real. Propiedades obligatorias por etapa. Reglas de higiene (deals estancados se archivan). Productos/cotizaciones en CRM. | Secuencias de prospección activas. Tareas automatizadas. Cotizaciones generadas desde CRM. Integración con calendario. | Dashboard de pipeline y velocity. Win rate por vendedor/producto. Forecast manual pero informado. Deal scoring básico. |
| 3 | Playbooks definidos por tipo de venta. SLA con marketing documentado. Hand-off estructurado (MQL→SQL→Opportunity). Proceso de discovery estandarizado. | Workflows de rotación y notificación. Sequences multi-canal. Propuestas automatizadas. Call recording integrado. | Forecast automatizado. Revenue by source. Sales velocity metrics. Análisis de motivos de pérdida. Performance por rep normalizado. |
| 4 | Venta consultiva sistematizada con IA. El proceso se adapta al buyer journey detectado. Multi-pipeline por segmento/producto. | Breeze Agent para prospección. Deal scoring predictivo. Coaching automatizado basado en calls. Guided selling. | Predictive revenue. Anomaly detection en pipeline. Churn prediction desde signals de engagement. ROI por actividad de venta. |

### Service Hub

| Nivel | Ordenamiento | Velocidad | Efectividad |
|-------|-------------|-----------|-------------|
| 0 | Sin proceso de soporte definido. Solicitudes llegan por múltiples canales sin centralizar. No hay tickets. | Respuestas manuales por email o WhatsApp sin registro. | No se mide tiempo de respuesta, resolución ni satisfacción. |
| 1 | Tickets básicos en CRM. Bandeja compartida. Prioridad asignada manualmente. | Plantillas de respuesta. Asignación manual de tickets. | Se conoce el volumen de tickets pero no los tiempos de resolución. |
| 2 | Pipeline de tickets con etapas claras. SLAs definidos. Base de conocimiento básica. Categorización de tickets. | Workflows de asignación por categoría. Auto-respuestas de confirmación. Encuestas post-resolución automatizadas. | Dashboard de SLA compliance. CSAT medido. Tiempo de primera respuesta. Tickets por categoría. |
| 3 | Procesos de escalamiento documentados. KB completa y actualizada. Feedback loop con producto/ventas. Customer health scoring. | Chatbot con KB integrada. Workflows de escalamiento automático. Proactive outreach basado en health score. | NPS tracking. Churn analysis. Revenue retention metrics. Customer effort score. Análisis de temas recurrentes con action items. |
| 4 | Customer success proactivo con IA. Self-service cubre >60% de consultas. Community driven support. | Breeze Agent para soporte L1. Predictive case routing. Auto-resolución de tickets comunes. | Predictive churn. Customer lifetime value tracking. ROI de retención vs adquisición. Net revenue retention. |

---

## Cálculo del Nivel General

El nivel general se calcula como el promedio ponderado de los Hubs activos del cliente:
- Si el cliente tiene Marketing Hub: peso 1
- Si tiene Sales Hub: peso 1
- Si tiene Service Hub: peso 1
- Nivel general = promedio de los Hubs activos (redondeado al entero más cercano)

Ejemplo: Marketing=2, Sales=1, Service=N/A → General = (2+1)/2 = 1.5 → **Nivel 2**

---

## Uso por los Agentes

Cuando un agente recibe la escala de rendimiento en su contexto:
- **Nivel 0-1**: Recomendar fundamentos. No proponer automatizaciones avanzadas. Enfocarse en ordenar procesos y datos básicos.
- **Nivel 2**: Proponer optimizaciones incrementales. Automatizaciones simples que refuercen el proceso existente.
- **Nivel 3**: Proponer integraciones avanzadas, analytics y alineación cross-departamento.
- **Nivel 4**: Proponer IA, experimentación y optimización predictiva.

**Regla de oro**: No saltar más de 1 nivel. Si el cliente está en nivel 1, la meta es llevarlo a nivel 2, no a nivel 4.
`;

async function main() {
  const doc = await prisma.knowledgeDocument.upsert({
    where: { id: "escala-rendimiento-criterios" },
    create: {
      id: "escala-rendimiento-criterios",
      type: "METHODOLOGY",
      status: "PUBLISHED",
      title: "Escala de Rendimiento — Criterios por Nivel y Hub",
      summary: "Define los niveles 0-4 de la escala de rendimiento con criterios específicos por Hub (Marketing, Sales, Service) en tres dimensiones: Ordenamiento, Velocidad y Efectividad.",
      content: CONTENT,
      version: 1,
    },
    update: {
      content: CONTENT,
      summary: "Define los niveles 0-4 de la escala de rendimiento con criterios específicos por Hub (Marketing, Sales, Service) en tres dimensiones: Ordenamiento, Velocidad y Efectividad.",
      version: { increment: 1 },
    },
  });

  console.log("✓ Documento creado/actualizado:", doc.id, "-", doc.title, "(v" + doc.version + ")");
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
