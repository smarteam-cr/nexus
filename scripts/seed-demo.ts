/**
 * seed-demo.ts
 *
 * Crea (o regenera) el cliente demo "Demo Agency" con:
 *   - Notas de etapa 1 (pasos 1, 2, 4, 6, 8)
 *   - Notas de etapa 2 (pasos 1, 2, 3, 4)
 *   - 4 documentos de ejemplo
 *   - 9 context cards estilo UCI (Análisis Preliminar)
 *
 * Uso:
 *   npx tsx --env-file=.env scripts/seed-demo.ts
 *
 * Si ya existe un cliente llamado "Demo Agency" lo borra primero (limpieza total).
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Iniciando seed de demo...");

  // ── 1. Limpiar cliente anterior ─────────────────────────────────────────────
  const existing = await prisma.client.findFirst({
    where: { name: "Demo Agency" },
  });
  if (existing) {
    await prisma.client.delete({ where: { id: existing.id } });
    console.log("🗑  Cliente anterior 'Demo Agency' eliminado.");
  }

  // ── 2. Crear cliente ─────────────────────────────────────────────────────────
  const client = await prisma.client.create({
    data: {
      name: "Demo Agency",
      company: "Demo Agency",
      industry: "Agencia de Marketing Digital",
      notes:
        "Cliente estratégico. Agencia con equipo de ventas de 6 personas. Proceso de ventas largo (60-90 días). Usan HubSpot desde 2021 pero sin adopción real. Objetivo: construir rutina comercial con datos.",
    },
  });
  console.log(`✅ Cliente creado: ${client.name} (${client.id})`);

  // ── 3. Notas de etapa 1 ──────────────────────────────────────────────────────
  const stageNotes1 = [
    {
      stage: 1,
      step: 1,
      content: `## Análisis Preliminar — Demo Agency

**Empresa:** Agencia de marketing digital con +8 años en el mercado.
**Tamaño:** 6 personas en comercial, 20 en total.
**CRM:** HubSpot Sales Hub Pro (contrato activo desde 2021).

### Diagnóstico inicial
- Adopción del CRM muy baja: ~30% del equipo registra actividades.
- Pipeline sin etapas claras; oportunidades estancadas meses sin avance.
- No hay visibilidad real del funnel para gerencia.
- Proceso de ventas documentado en papel pero no ejecutado digitalmente.

### Hipótesis de trabajo
El problema central no es técnico sino de hábitos y rutina. El CRM está configurado de forma genérica y no refleja su proceso real. Necesitan:
1. Rediseño del proceso adaptado a su ciclo de 60-90 días.
2. Rutina semanal definida con checkpoints en el CRM.
3. Capacitación + seguimiento durante 30 días post-lanzamiento.`,
    },
    {
      stage: 1,
      step: 2,
      content: `## Kickoff — Acuerdos y Siguientes Pasos

**Fecha:** [Pendiente]
**Asistentes:** Gerente Comercial, 2 vendedores senior, Consultor.

### Acuerdos
- [ ] Revisar pipeline actual y migrar datos históricos
- [ ] Entrevistar a los 6 vendedores individualmente (sem 2)
- [ ] Mapear proceso comercial actual vs. proceso deseado
- [ ] Definir etapas del pipeline y criterios de avance

### Compromisos del cliente
- Acceso admin al portal HubSpot antes del jueves
- Asignar "campeón interno": Andrea Gómez (Gerente Comercial)
- Participación de todo el equipo en las sesiones de entrevista

### Próximos pasos
1. Auditoría del CRM (esta semana)
2. Entrevistas individuales (sem 2)
3. Taller de rediseño de proceso (sem 3)`,
    },
    {
      stage: 1,
      step: 4,
      content: `## Entrevistas y Focus Group — Notas

### Entrevistas individuales (6/6 completadas)

**Patrón común:**
- Todos sienten que el CRM "es más trabajo administrativo que ayuda"
- No entienden por qué algunas etapas del pipeline existen
- Falta de claridad sobre qué hacer cuando una oportunidad se "estanca"

**Insights por vendedor:**
- Juan Pablo: "Registro todo en Excel y al final lo paso al CRM"
- María C.: "No sé qué información es obligatoria y qué es opcional"
- Carlos M.: "El pipeline no refleja cómo vendemos realmente"

### Focus Group (todos juntos)
- Consenso: quieren ver un tablero simple con "mi pipeline esta semana"
- Solicitan alertas automáticas de oportunidades sin actividad >7 días
- Proponen tener una reunión comercial semanal de 20 min con datos del CRM`,
    },
    {
      stage: 1,
      step: 6,
      content: `## Mapeo de Proceso, Rutina y Tecnología

### Proceso Comercial Actual
\`\`\`
Lead → Contacto inicial → Demo → Propuesta → Negociación → Cierre
\`\`\`
Tiempo promedio: 75 días
Tasa de cierre: ~22%

### Proceso Propuesto
\`\`\`
Lead calificado → Discovery call → Demo personalizada →
Propuesta formal → Follow-up estructurado → Cierre
\`\`\`

### Rutina Propuesta
- **Lunes:** Revisar pipeline en HubSpot (15 min)
- **Miércoles:** Registrar todas las actividades de la semana
- **Viernes:** Actualizar etapas y próximas acciones

### Tecnología
- HubSpot: pipeline, tareas, seguimiento de emails
- Zoom: reuniones (integrar con HS)
- Google Drive: propuestas (links en negocios)`,
    },
    {
      stage: 1,
      step: 8,
      content: `## Informe de Diagnóstico — Borrador

### Resumen Ejecutivo
Demo Agency tiene una brecha significativa entre su proceso comercial declarado y el que se ejecuta en la práctica. El CRM existe pero no está adoptado como herramienta de trabajo real.

### Hallazgos Principales
1. **Adopción baja (3/10):** Solo 2 de 6 vendedores registran actividades consistentemente.
2. **Pipeline sin criterios:** Las etapas no tienen definición clara de cuándo avanzar.
3. **Sin rutina:** No hay revisión periódica de oportunidades ni forecast.
4. **Datos incompletos:** 67% de los negocios no tienen empresa asociada ni fecha de cierre.

### Recomendaciones
1. Rediseñar pipeline con 6 etapas claras y criterios de entrada/salida.
2. Implementar rutina Loop semanal con apoyo del CRM.
3. Crear 3 dashboards: individual, equipo, gerencia.
4. Automatizar recordatorios de seguimiento (>5 días sin actividad).

### Proyección
Con la implementación correcta: tasa de cierre 22% → 30% en 90 días.`,
    },
  ];

  for (const note of stageNotes1) {
    await prisma.stageNote.create({
      data: { clientId: client.id, ...note },
    });
  }
  console.log(`✅ ${stageNotes1.length} notas de Etapa 1 creadas.`);

  // ── 4. Notas de etapa 2 ──────────────────────────────────────────────────────
  const stageNotes2 = [
    {
      stage: 2,
      step: 1,
      content: `## Rediseño del Proceso Comercial

### Nuevo Pipeline — 6 Etapas

| Etapa | Nombre | Criterio de entrada |
|---|---|---|
| 1 | Lead Calificado | BANT validado (presupuesto, autoridad, necesidad, tiempo) |
| 2 | Discovery | Call de descubrimiento agendada |
| 3 | Demo | Demo personalizada presentada |
| 4 | Propuesta | Propuesta formal enviada |
| 5 | Negociación | Cliente pidió ajustes o contraoferta |
| 6 | Cerrado | Contrato firmado o perdido |

### Probabilidades por Etapa
- Lead Calificado: 15%
- Discovery: 30%
- Demo: 50%
- Propuesta: 65%
- Negociación: 80%

### Propiedades Obligatorias en HubSpot
- Empresa asociada (siempre)
- Valor estimado del negocio
- Fecha de cierre esperada
- Siguiente acción + fecha`,
    },
    {
      stage: 2,
      step: 2,
      content: `## Rediseño de la Rutina Comercial (Framework Loop)

### Rutina Diaria (15 min)
- Revisar tareas del día en HubSpot
- Registrar actividades del día anterior
- Actualizar próximas acciones en negocios activos

### Rutina Semanal (30 min — lunes)
- Review del pipeline: ¿qué avanzó, qué se estancó?
- Identificar negocios sin actividad >5 días
- Definir 3 prioridades de la semana

### Reunión Comercial Semanal (20 min — viernes)
- Dashboard de equipo en pantalla
- Cada vendedor comenta su top 3 negocios
- Gerente identifica dónde puede ayudar

### Indicadores a Trackear
- Actividades por vendedor (meta: 10/semana)
- Negocios en cada etapa
- Velocidad promedio del pipeline
- Tasa de conversión por etapa`,
    },
    {
      stage: 2,
      step: 3,
      content: `## Políticas y Conceptos Básicos del Loop

### Definiciones acordadas

**Lead calificado:** Contacto que ha confirmado que tiene presupuesto, necesidad real y autoridad para decidir. No entrar al pipeline sin esto.

**Actividad válida:** Email enviado por HS, llamada registrada con notas, reunión con duración >15 min.

**Negocio estancado:** Sin actividad >7 días en etapas 1-3, >14 días en etapas 4-5.

### Políticas
1. Todo negocio debe tener empresa y valor antes de pasar a etapa 2.
2. No se permiten negocios sin "próxima acción" definida.
3. Los negocios perdidos se cierran en el CRM (no se dejan en pipeline).
4. Forecast mensual: solo contar negocios en etapa 4+ con fecha de cierre este mes.

### Compromisos del Equipo
- Registrar en HubSpot ANTES de la reunión del viernes (no después).
- Si una oportunidad no avanza en 2 semanas: marcar motivo de estancamiento.`,
    },
    {
      stage: 2,
      step: 4,
      content: `## Plan y Cronograma del Piloto

### Semana 1 — Configuración
- [ ] Rediseñar pipeline en HubSpot
- [ ] Crear propiedades personalizadas requeridas
- [ ] Migrar negocios activos al nuevo pipeline
- [ ] Configurar vistas y dashboards base

### Semana 2 — Capacitación
- [ ] Sesión de onboarding (2h con todo el equipo)
- [ ] Grabar videos de referencia rápida
- [ ] Definir "capitán" por grupo de 2 vendedores

### Semana 3 — Lanzamiento Piloto
- [ ] Piloto en vivo con 3 vendedores
- [ ] Check-in diario de 10 min (primera semana)
- [ ] Ajustes según feedback en tiempo real

### Semana 4 — Extensión y Ajuste
- [ ] Incorporar los 3 vendedores restantes
- [ ] Primera reunión comercial formal con el nuevo formato
- [ ] Revisión de KPIs baseline

### Mes 2-3 — Consolidación
- Reuniones quincenales de seguimiento
- Ajuste de automatizaciones según uso real
- Informe de resultados final`,
    },
  ];

  for (const note of stageNotes2) {
    await prisma.stageNote.create({
      data: { clientId: client.id, ...note },
    });
  }
  console.log(`✅ ${stageNotes2.length} notas de Etapa 2 creadas.`);

  // ── 5. Documentos ────────────────────────────────────────────────────────────
  const documents = [
    {
      stage: 1,
      step: null,
      title: "Brief inicial — Demo Agency",
      type: "BRIEF" as const,
      content: `Cliente: Demo Agency — Agencia de Marketing Digital
Contacto: Andrea Gómez (Gerente Comercial)
Email: andrea@demoagency.com

Problema declarado:
"Tenemos HubSpot hace 3 años pero nadie lo usa bien. Necesitamos que el equipo adopte el CRM y que podamos hacer forecast real."

Expectativas:
- Pipeline ordenado y con datos reales en 30 días
- Equipo de ventas usando HubSpot diariamente en 60 días
- Mejorar tasa de cierre de 22% a 30% en 90 días

Presupuesto: $4,500 USD
Duración estimada: 3 meses
Decisión: Andrea + CEO (Roberto Díaz)`,
    },
    {
      stage: 1,
      step: 4,
      title: "Transcripción entrevista — Juan Pablo (vendedor senior)",
      type: "CALL_TRANSCRIPT" as const,
      content: `Fecha: [demo]
Entrevistador: Consultor
Duración: 35 min

C: ¿Cómo describes tu flujo de trabajo actual?
JP: Mira, yo tengo un Excel donde llevo todos mis prospectos. Al final de la semana, los que avanzan los paso al CRM. Es más fácil así.

C: ¿Por qué no trabajas directamente en HubSpot?
JP: Es que el CRM pide demasiadas cosas que no sé. ¿Por qué tengo que llenar "industria" si eso no me ayuda a vender?

C: ¿Qué información sí te sería útil tener?
JP: Saber cuándo fue el último contacto, qué le prometí, y cuándo debo hacer el seguimiento. Eso es todo.

C: ¿Usarías HubSpot si fuera más simple?
JP: Si me quita trabajo en vez de dármelo, claro. Pero ahora mismo me da más trabajo del que quita.`,
    },
    {
      stage: 1,
      step: 4,
      title: "Focus Group — Grabación sesión",
      type: "URL" as const,
      url: "https://app.fireflies.ai/view/demo-demoagency-focus-group",
    },
    {
      stage: 2,
      step: 5,
      title: "Guía de onboarding HubSpot — Equipo Demo Agency",
      type: "FREE_TEXT" as const,
      content: `# Guía Rápida: HubSpot para el Equipo Demo Agency

## ¿Qué necesito hacer cada día? (5 min)

1. Abrir HubSpot → ir a "Mis tareas"
2. Completar las tareas del día
3. Registrar las llamadas/emails de ayer que falten

## ¿Cómo creo un negocio?

1. Click en "Negocios" → "Crear negocio"
2. Campos OBLIGATORIOS:
   - Nombre del negocio (empresa + servicio)
   - Empresa asociada
   - Valor estimado
   - Fecha de cierre esperada
   - Etapa del pipeline
3. Agregar "Próxima acción" como tarea

## ¿Cómo registro una llamada?

1. Ir al negocio o contacto
2. Click "Registrar actividad" → "Llamada"
3. Escribir resumen en las notas (no vacío)
4. Crear tarea de seguimiento

## Atajos útiles
- Ver mi pipeline: Negocios → filtrar "Propietario = yo"
- Tareas pendientes: Inicio → sección "Tareas"
- Contacto rápido: buscar por nombre en la barra superior`,
    },
  ];

  for (const doc of documents) {
    await prisma.clientDocument.create({
      data: {
        clientId: client.id,
        stage: doc.stage,
        step: doc.step ?? undefined,
        title: doc.title,
        type: doc.type,
        content: "content" in doc ? doc.content : undefined,
        url: "url" in doc ? doc.url : undefined,
      },
    });
  }
  console.log(`✅ ${documents.length} documentos creados.`);

  // ── 6. Context Cards (Análisis Preliminar — estilo UCI) ──────────────────────
  const contextCards = [
    {
      order: 0,
      title: "Contexto relación comercial",
      content: `* Cliente desde: Prospecto nuevo (referido por cliente existente)
* Sector: Agencia de marketing digital B2B
* Equipo comercial: 6 vendedores + 1 gerente
* Ticket promedio: $1,200 USD/mes (retainers)
* Ciclo de venta propio: 60-90 días
* HubSpot desde 2021 — nunca implementado correctamente`,
    },
    {
      order: 1,
      title: "Dolor principal",
      content: `El equipo comercial no usa el CRM y la gerencia no tiene visibilidad real del pipeline.

El 70% de la información comercial vive en Excel o en la cabeza de los vendedores. No pueden hacer forecast confiable ni detectar negocios estancados a tiempo.

Consecuencia directa: oportunidades que se pierden sin enterarse, tasa de cierre baja (22%) sin saber por qué.`,
    },
    {
      order: 2,
      title: "Expectativas del cliente",
      content: `* Corto plazo (30 días): pipeline limpio con datos reales
* Mediano plazo (60 días): equipo usando HS diariamente
* Largo plazo (90 días): tasa de cierre 22% → 30%
* Bonus esperado: dashboard de forecast para CEO

Expectativa no declarada: que el proceso sea "fácil" para el equipo. Tienen miedo al cambio.`,
    },
    {
      order: 3,
      title: "Proyectos / avances / criticidad",
      content: `* Tienen una licitación grande en curso (~$50K contrato anual) que quieren cerrar este trimestre
* El CEO está mirando los números más de cerca desde Q1
* Acaban de contratar a 2 vendedores nuevos que "no tienen malos hábitos aún" — ventana de oportunidad
* Si no mejoran en 90 días, el CEO evalúa cambiar de herramienta (riesgo de churn HubSpot)`,
    },
    {
      order: 4,
      title: "Stakeholders clave",
      content: `* Andrea Gómez — Gerente Comercial — decisora real, campeón interno
* Roberto Díaz — CEO — paga la factura, quiere resultados, no le gusta el detalle técnico
* Juan Pablo V. — Vendedor senior — influenciador negativo (resistente al cambio), hay que ganárselo
* María C. — Vendedora junior — muy receptiva, buena para piloto`,
    },
    {
      order: 5,
      title: "Dominio y datos de la empresa",
      content: `* Portal HubSpot: demoagency.hubspot.com
* Contactos en CRM: ~1,200 (muchos desactualizados)
* Negocios activos: 34 (solo 8 con actividad en últimos 30 días)
* Propiedades personalizadas existentes: 12 (mayoría sin uso)
* Integraciones activas: Gmail, Google Calendar
* Sin integraciones de marketing (no usan Marketing Hub)`,
    },
    {
      order: 6,
      title: "¿Qué vendimos?",
      content: `Implementación y adopción de HubSpot Sales Hub:
* Rediseño del pipeline comercial
* Framework de rutina Loop (proceso + herramienta)
* Capacitación del equipo (6 personas)
* 3 dashboards personalizados
* Acompañamiento de 90 días post-lanzamiento

Precio: $4,500 USD total (3 cuotas de $1,500)`,
    },
    {
      order: 7,
      title: "¿Por qué vendimos? (por qué nos eligieron)",
      content: `* Referido por Agencia XYZ (cliente nuestro desde 2022) — confianza pre-establecida
* Propuesta más concreta que competencia: entregamos plan detallado semana a semana
* Andrea vio el caso de estudio de Agencia XYZ con resultados similares
* Precio competitivo vs. consultoras grandes
* Prometimos resultados medibles en 90 días con garantía de revisión`,
    },
    {
      order: 8,
      title: "Acuerdos clave y promesas especiales",
      content: `* Prometimos tener el pipeline rediseñado y migrado en la primera semana
* Andrea quiere una presentación mensual de avance para el CEO (formato ejecutivo, sin tecnicismos)
* Acordamos que si al día 60 el equipo no está usando HS diariamente, revisamos la estrategia sin costo adicional
* Roberto pidió que el proceso de implementación "no interrumpa la operación comercial" — sesiones máx 2h y siempre con agenda previa
* Facturación: primera cuota al firmar, segunda al día 30, tercera al día 60`,
    },
  ];

  await prisma.clientContextCard.createMany({
    data: contextCards.map((c) => ({ ...c, clientId: client.id })),
  });
  console.log(`✅ ${contextCards.length} context cards creadas.`);

  // ── Resumen ──────────────────────────────────────────────────────────────────
  console.log(`
🎉 Seed completado exitosamente.
   Cliente: ${client.name}
   ID: ${client.id}

   Navegación:
   → /clients (ver lista)
   → /clients/${client.id}/stage/1 (Etapa 1)
   → /clients/${client.id}/stage/2 (Etapa 2)
`);
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
