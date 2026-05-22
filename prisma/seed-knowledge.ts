import { PrismaClient, KnowledgeType, KnowledgeStatus, TagCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// =============================================================================
// TAGS
// =============================================================================
const tags = [
  { category: TagCategory.SERVICE,  value: "loop_marketing",    label: "Loop Marketing" },
  { category: TagCategory.SERVICE,  value: "loop_sales",        label: "Loop Sales" },
  { category: TagCategory.SERVICE,  value: "loop_service",      label: "Loop Service" },
  { category: TagCategory.SERVICE,  value: "proyecto_temporal", label: "Proyecto temporal" },
  { category: TagCategory.STAGE,    value: "diagnostico",       label: "Diagnóstico" },
  { category: TagCategory.STAGE,    value: "mvp",               label: "MVP" },
  { category: TagCategory.STAGE,    value: "adopcion",          label: "Adopción" },
  { category: TagCategory.DOMAIN,   value: "marketing",         label: "Marketing" },
  { category: TagCategory.DOMAIN,   value: "sales",             label: "Ventas" },
  { category: TagCategory.DOMAIN,   value: "service",           label: "Servicio al cliente" },
  { category: TagCategory.DOMAIN,   value: "general",           label: "General" },
];

// =============================================================================
// DOCUMENTOS
// =============================================================================
interface DocSeed {
  type: KnowledgeType;
  title: string;
  summary: string;
  content: string;
  tagValues: string[];
}

const documents: DocSeed[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // LOOP MARKETING — DIAGNÓSTICO
  // ──────────────────────────────────────────────────────────────────────────
  {
    type: KnowledgeType.PROCESS,
    title: "Proceso de Diagnóstico — Loop Marketing Transformation",
    summary: "Guía operativa completa para el CSE en la etapa de diagnóstico de un proyecto Loop Marketing. Cubre kick off, auditoría del CRM, entrevistas y focus groups, análisis del funnel, mapeo integral y síntesis del diagnóstico final.",
    tagValues: ["loop_marketing", "diagnostico", "marketing"],
    content: `# Proceso de Diagnóstico — Loop Marketing Transformation
*Guía operativa para el Customer Success Engineer*

## 1. Objetivo del diagnóstico

Entender por qué el cliente obtiene sus resultados actuales de marketing, identificando las causas relacionadas con su proceso, rutina, estructura organizacional, uso de tecnología y accesibilidad de la data.

El diagnóstico no busca listar errores ni evaluar el uso correcto de HubSpot. El objetivo es **explicar los resultados del negocio** y generar un diagnóstico claro que permita tomar decisiones informadas sobre prioridades futuras.

Para llegar a conclusiones se contrasta lo que el cliente dice que hace (entrevistas y focus groups) contra la evidencia de lo que realmente ocurre en el CRM (auditoría), contra los resultados del funnel y contra el nivel de disponibilidad y accesibilidad de la data.

> **Importante:** Esta etapa no incluye definición de roadmap, configuración técnica ni implementación.

---

## 2. Pasos del proceso

| # | Paso | Descripción breve |
|---|------|------------------|
| 1 | Sesión de kick off | Alinear con el cliente, validar mapa inicial y definir siguientes pasos. |
| 2 | Auditoría del CRM | Revisar la huella digital del equipo de marketing en HubSpot (si aplica). |
| 3 | Entrevistas y focus groups | Sesiones con gerencia y ejecutivos para contrastar proceso teórico vs. rutina real. |
| 4 | Análisis del funnel | Evaluar métricas de conversión en cada etapa del ciclo de vida de marketing. |
| 5 | Mapeo y análisis integral | Mapear proceso, rutina, tecnología y estructura. Identificar brechas. |
| 6 | Análisis de disponibilidad de data | Determinar qué datos críticos existen y cuáles son accesibles para el equipo. |
| 7 | Síntesis y diagnóstico final | Elaborar informe que explique los resultados actuales y ubicar al cliente en la escala. |

---

## 3. Sesión de kick off

**Objetivos:**
- Presentar al cliente el mapa inicial en Miro.
- Solicitar el organigrama de las personas y equipos que participarán.
- Pedir al cliente validar y enriquecer el mapeo inicial con comentarios sobre: desafíos, fortalezas, debilidades, procesos actuales, herramientas, equipos involucrados, expectativas y criterios de éxito.
- Acordar fecha para finalizar comentarios y programar la primera sesión de entrevistas o focus groups.

*Plantillas: Presentación de Kick-off, Gameplan.*

---

## 4. Auditoría del proceso en el CRM

Aplica solo si el cliente ya usa HubSpot. Si no, se consultará al cliente durante las entrevistas.

El objetivo no es evaluar si el cliente usa bien HubSpot, sino identificar qué comportamientos, decisiones y rutinas reales quedan reflejadas (o no) en el sistema. Se busca la **huella digital reciente (30–90 días)**. Si una herramienta existe pero no se usa, es evidencia de un proceso diseñado pero una rutina fallida.

**Foco:** entender cómo fluye el contacto y si la segmentación es real o imaginaria.

### 4.1 Ordenamiento (Proceso y Estructura)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Ciclo de vida | ¿Cómo cambian las etapas (Subscriber → Lead → MQL)? ¿Es manual o automático? ¿Hay coherencia lógica? |
| Segmentación (Listas) | Revisar las últimas 5 listas. ¿Son importaciones manuales (estáticas) o listas inteligentes basadas en comportamiento (activas)? |
| Buyer Persona | ¿Existen y se usan? ¿Cuántos contactos tienen valor asignado? ¿Hay segmentación activa basada en ellos? |
| Marketing Contacts | Revisar contactos por estado y fuentes. ¿Se crean por formularios/automatización o importación masiva? ¿Se paga por contactos basura? |
| Dominios y Branding | ¿Están conectados dominios de correo y web? ¿Está configurado el Kit de Marca y Voz de Marca? |

### 4.2 Velocidad (Automatización e IA)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Automatización | Ir a propiedades clave (ej. Lifecycle Stage) y ver "Used in" para detectar Workflows. ¿Existe un flujo lógico o desconectado? |
| Lead Hand-off | Buscar el workflow que envía el lead a Ventas. Si no existe, el traspaso es manual y propenso a error. |
| Campañas | ¿Se usan para medir la atribución global? ¿Para acelerar el lanzamiento de nuevas iniciativas? |
| Uso de IA | Validar desde Client Partner en portal de Smarteam y en registros de reutilización/personalización con IA. |

### 4.3 Efectividad (Data e Impacto)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Canales y Fuentes | Revisar Original Source. Si predomina "Offline Sources", la data no es efectiva para atribución. |
| Conversión (Funnel) | Revisar tasas de conversión: Visita a Lead, Lead a MQL, MQL a SQL. Detectar fugas. |
| Formularios | Revisar tasas de envío (submissions). ¿Se capturan los datos correctos para calificar? |
| Email Marketing | Muestreo de emails. ¿Altas tasas de apertura (segmentado) o bajas (masivo/spam)? |
| Content Hub | Rendimiento real de Landing Pages y Blog (si aplica). |
| Redes sociales y anuncios | ¿Conectadas? ¿Activa la escucha social? ¿Píxeles configurados? |

### 4.4 Cierre de la auditoría

Al finalizar se debe tener:
- **Evidencia de adopción real:** distinguir herramientas "Zombie" (configuradas pero no usadas) vs. herramientas "Vivas" (que soportan la operación diaria).
- **Contraste de realidad:** identificar discrepancias entre lo que la gerencia cree que sucede y lo que la data demuestra.

> **Principio clave:** Si una rutina no deja huella en el CRM, se asume que no es sistemática ni escalable.

---

## 5. Entrevistas y focus groups

El propósito no es solo recopilar dolores, sino realizar una **ingeniería inversa de la operación de marketing actual:**
- Contrastar proceso vs. rutina.
- Validar la madurez del Loop (Express, Tailor, Amplify, Evolve).
- Confirmar la accesibilidad de la data.
- Explicar el porqué de los resultados actuales.

### 5.1 Preparación de las sesiones

- Alinear expectativas con el cliente: explicar propósito y objetivos.
- Validar perfil de participantes.
- Revisar información disponible (KPIs, sitio web, industria) y resultados de la auditoría.
- No mezclar niveles jerárquicos. Ideal: 4–7 personas por sesión, 60 minutos.
- Diseñar guías de facilitación diferenciadas: entrevista a gerencia, focus group con ejecutivos, encuestas.

> **Adaptación:** Las preguntas son un marco de referencia. El CSE debe adaptar, priorizar o suprimir preguntas según el contexto previo. Evitar redundancias con información ya confirmada en la auditoría.

### 5.2 Entrevista a gerencia

**Bloque: Metas y funnel**
- ¿Cuál es el objetivo de ingresos para este año y qué tan lejos estamos hoy?
- Atracción: ¿Cuántos leads nuevos generan al mes? ¿Por qué canal llegan la mayoría?
- Conversión: ¿Qué porcentaje califica para venta? ¿Cuántas propuestas presentan al mes?
- Cierre: ¿Cuál es la tasa de cierre promedio? ¿Cuánto tarda el ciclo de ventas?
- Si no hay CRM, pedir números estimados para llenar el análisis de funnel.

**Bloque: Validación de proceso**
- "Entendemos que su proceso macro es [A → B → C]. ¿Es correcto o estamos omitiendo pasos críticos?"
- ¿Este proceso aplica para todos sus productos/servicios o hay líneas de negocio que operan diferente?
- ¿En qué paso siente que se pierde más tiempo o dinero?

**Bloque: Loop Marketing**

*Express (Estrategia):*
- ¿Por qué les compran sus clientes y no a la competencia? (Posicionamiento)
- ¿Tienen definido un Manual de Marca y Buyer Personas documentados, o es conocimiento tribal?
- ¿Cómo es el proceso de creación de una campaña? ¿Nace de planificación trimestral o de urgencia?

*Tailor (Segmentación):*
- ¿Existen criterios claros de calificación (Lead Scoring) acordados con Ventas?

*Amplify (Canales):*
- ¿Cuál es el canal que genera más ingresos (no solo leads)?
- ¿En qué canales sienten que deberían estar y no están? ¿Por qué?
- ¿Existen estacionalidades que afecten drásticamente sus ventas?

*Evolve (Medición y feedback):*
- ¿Cumplieron la meta de marketing del último trimestre?
- ¿Cuál es el feedback de Ventas sobre la calidad de los leads? (SLA)
- ¿Qué KPIs no están viendo y sienten vitales para tomar decisiones?

**Bloque: Auditoría de data**
- ¿Qué dato necesita para decisiones estratégicas y siente que NO tiene disponible?
- ¿Tienen visibilidad real de lo que hace su equipo de marketing día a día?
- ¿Tienen una base de datos centralizada de clientes históricos con sus compras?

### 5.3 Focus group con ejecutivos de marketing

**Técnica de apertura: "El día de ayer"**
> "No me digan cómo debería ser su proceso. Cuéntenme: ¿qué hicieron ayer paso a paso desde que abrieron la computadora hasta el almuerzo? ¿Qué herramientas abrieron? ¿Qué fue lo primero que revisaron?"

**Validar la realidad sucia**
- "Sus gerentes nos comentan que el proceso oficial es [Paso X]. En la vida real, ¿funciona a la primera o tienen que hacer pasos extra (WhatsApp, Excel) para que funcione?"
- "Cuando el proceso normal falla, ¿qué hacen para resolverlo?"
- "Cuando les pasan un lead, ¿la información viene completa o tienen que investigar datos que faltan?"

**Bloque: Loop Marketing**

*Express:*
- ¿Cómo deciden qué publicar o enviar esta semana? ¿Hay un plan o es lo que urge?
- Si hoy llega un lead, ¿quién le contesta y cuánto tarda?
- ¿Cuando crean contenido, saben a quién le están hablando (Buyer Persona) o disparan contenido genérico?

*Tailor:*
- Antes de mandar un correo, ¿filtran la lista (por cargo/industria) o envían a toda la base?
- ¿Qué tareas manuales les quitan más tiempo?
- ¿Dónde tienen guardada la base de datos hoy (Excel, libreta)?

*Amplify:*
- ¿Tienen que copiar y pegar datos manualmente entre Facebook/Instagram y su base de datos?

*Evolve:*
- ¿Saben cuántas ventas generó su última campaña? ¿Cómo saben si funcionó?
- ¿Miden Likes y Aperturas o saben cuántas ventas generaron sus estrategias?

**Bloque: Auditoría de data**
- Del 1 al 10, ¿qué tan difícil es obtener el dato que necesitan cuando lo necesitan?
- ¿Tienen que pedir reportes a otra persona para saber cómo van?
- ¿Cuánto tiempo al día dedican a llenar reportes manuales que podrían ser automáticos?

---

## 6. Análisis del funnel de marketing

Se utiliza la data cuantitativa para detectar dónde se rompe el flujo de valor. Para marketing se mide la conversión entre las etapas de Suscriptor, Lead, MQL y SQL.

**Pre-requisitos:** Tener el mapa de disponibilidad de data. Si un dato no existe, marcarlo como "Punto Ciego". Clasificar el modelo de negocio del cliente (Consultivo B2B o Transaccional E-commerce).

### 6.1 Etapa de atracción

**Pregunta clave:** ¿Cómo se está llenando la parte alta del embudo?

Métricas a extraer:
- Sesiones totales vs. sesiones nuevas.
- Fuentes de tráfico principales (Orgánico, Directo, Paid, Social, Referencias).
- Tasa de rebote general y por fuente principal.
- Si >50% del tráfico no tiene fuente digital clara, marcar como "Confiabilidad Baja".

Preguntas de diagnóstico:
- ¿Estamos atrayendo tráfico cualificado o basura?
- ¿Hay dependencia excesiva de una sola fuente?
- ¿Las tendencias de tráfico coinciden con los picos de leads?
- ¿Estamos ganando audiencia propia (Newsletter, Blog) o solo visitas pasajeras?

### 6.2 Etapa de conversión

El momento en que un desconocido se vuelve conocido. Lifecycle Stages: Suscriptor y Lead.

Qué analizar:
- Puntos de conversión: formularios (Landing Pages) vs. conversaciones (Inbox/WhatsApp/Chatbots).
- Tasa de conversión general: Total Sesiones / Total Nuevos Leads.
- Tasa de conversión por canal: ¿LinkedIn convierte mejor que Facebook?
- ¿Los formularios son una barrera (muy largos o piden datos innecesarios)?
- ¿Existen Lead Magnets claros más allá del "Contáctanos"?

### 6.3 Etapa intermedia: MQL y Handoff (Modelo Consultivo B2B)

**Análisis de MQL (Marketing):**
- ¿Existen criterios de Lead Scoring o reglas claras para marcar un contacto como MQL?
- Tasa de conversión Lead a MQL. Si es 100% no hay filtro; si es 1% el filtro es muy duro o los leads son malos.
- Volumen de MQLs mensuales.
- Leads sin calificar (Unqualified) o basura.

**Análisis de SQL (Handoff/Traspaso):**
- Tasa de aceptación: % de MQLs que Ventas acepta como SQL.
- Tiempo que tarda un MQL en ser aceptado como SQL.
- Lead response time: ¿cuánto tiempo pasa un MQL sin ser contactado?
- Lead work rate: ¿todos los MQLs asignados son atendidos? ¿Cuántos toques realiza un asesor?
- ¿Qué pasa con los MQLs que Ventas rechaza? ¿Vuelven a marketing (Recycle) o mueren?
- ¿Hay evidencia de nurturing (correos automáticos) para leads que no están listos?

### 6.4 Etapa intermedia: Modelo Transaccional (E-commerce)

- Vistas de producto vs. Add to Cart.
- Tasa de abandono de carrito (el equivalente al MQL perdido en B2B).
- ¿Existen workflows activados por "Checkout Abandonado"?

### 6.5 Síntesis del funnel

Al terminar el análisis cuantitativo, responder estas 3 preguntas:

1. **¿Dónde está la mayor fuga de dinero?** Identifica la etapa con la caída más drástica comparada con el benchmark o la etapa anterior.
2. **¿Es un problema de volumen o de eficiencia?**
   - *Problema de volumen:* No llega suficiente gente. Tasas de conversión buenas pero tráfico escaso. Falla probable en Express/Amplify.
   - *Problema de eficiencia:* Llega mucha gente pero la mayoría es basura o no convierte. Falla probable en Tailor.
3. **¿La data es confiable para tomar decisiones?** Evaluar si los Puntos Ciegos impiden un diagnóstico certero.

---

## 7. Mapeo y análisis integral

Integrar hallazgos de entrevistas, auditoría y data para construir una visión coherente del funcionamiento actual. Se trabaja directamente en Miro.

### 7.1 Análisis de estructura y roles

- ¿Existe un responsable claro por etapa del Loop (Express, Tailor, Amplify, Evolve)?
- ¿Hay funciones críticas que nadie posee formalmente?
- ¿Las responsabilidades están claras o se diluyen entre equipos?
- Identificar sobrecarga o vacíos claros de responsabilidad.

### 7.2 Mapeo del proceso (la intención)

Plasmar el flujo de trabajo tal como lo entiende la gerencia o como está documentado.

- Representar el flujo End-to-End desde el detonante inicial hasta el resultado final.
- Asignar responsables teóricos según el organigrama.
- Marcar puntos de traspaso (Handoffs): dónde Marketing entrega a Ventas.
- Clasificar si cada paso aporta valor al cliente (Inbound) o es solo control interno.

### 7.3 Mapeo de la rutina de marketing (la realidad)

La rutina responde a "¿qué hace el equipo hoy?". Se contrasta el proceso diseñado con lo que realmente sucede.

**Express (Expresar): ¿Cómo definen qué decir y a quién?**
- ¿Tienen Buyer Personas y Voz de Marca accesibles antes de crear contenido, o escriben lo que se les ocurre?
- ¿Crean contenido pensado en el dolor del cliente o solo hablan de características del producto?
- ¿Existe calendario editorial estratégico o publican por urgencia?

**Tailor (Adaptar): ¿A quién se lo dicen?**
- ¿Segmentan su base antes de un envío o suben listas manuales para enviar masivos?
- ¿Usan campos de personalización y contenido dinámico o todos reciben el mismo mensaje?
- ¿El mensaje se adapta a la etapa del ciclo de vida (Lead vs. Cliente)?

**Amplify (Amplificar): ¿Por dónde lo dicen?**
- ¿Sus canales (Redes, Ads, Email) están conectados y coordinados o son silos aislados?
- ¿Usan data de CRM para segmentar audiencias de anuncios (Públicos similares)?
- ¿Tienen estrategias de escucha social?

**Evolve (Evolucionar): ¿Qué aprendieron?**
- ¿Miden éxito por métricas de vanidad (Likes) o por impacto en negocio (Leads calificados, Ingresos)?
- ¿Reciben feedback de Ventas sobre calidad de leads (Círculo cerrado)?
- ¿Realizan pruebas A/B sistemáticas o repiten la misma campaña?

### 7.4 Identificación de la brecha operativa

Una vez diferenciado el proceso teórico de la rutina real, identificar dónde se rompe la cadena de valor:

- ¿El equipo se salta pasos del proceso oficial?
- ¿Se quedan en Express (hacer ruido) sin llegar a Tailor (segmentar)?
- ¿Hay evidencia de Evolve (aprender de resultados) o es un ciclo que se repite sin mejora?

**Conexión causal:** *"El cliente tiene [resultado] porque su rutina de marketing [hallazgo en la rutina], lo que causa [impacto medible]".*

### 7.5 Mapeo de tecnología

- Herramientas usadas activamente vs. herramientas duplicadas vs. herramientas parche (Excel, WhatsApp).
- ¿La tecnología acompaña la rutina o la obliga a atajos?
- ¿Qué herramientas generan fricción o silos de información?
- ¿Qué herramientas deberían desaparecer con HubSpot?

---

## 8. Análisis de disponibilidad y accesibilidad de la data

Identificar qué datos son críticos para la estrategia de marketing, verificar si existen (Disponibilidad) y si el equipo puede usarlos sin fricción (Accesibilidad).

### 8.1 Niveles de accesibilidad

| Nivel | Descripción |
|-------|-------------|
| Alta | El dato está en el CRM, actualizado y listo para segmentar. |
| Media | El dato existe en un Excel compartido o requiere exportación manual. |
| Baja/Nula | El dato está secuestrado en el ERP o se requiere pedir reporte a TI. |

### 8.2 Datos críticos para marketing

| Dato crítico | Por qué es vital | Ejemplo de falta de accesibilidad |
|-------------|-----------------|----------------------------------|
| Productos/Servicios contratados | Permite cross-selling y evitar promocionar lo que ya tienen. | Marketing no sabe qué clientes tienen qué producto porque la data vive en el ERP. |
| Fecha de última compra | Permite campañas de reactivación o exclusión. | Marketing envía promos de Nuevo Cliente a alguien que compró ayer. |
| Valor de vida del cliente (LTV) | Define cuánto invertir en adquirir clientes similares. | Marketing invierte igual en todos sin saber cuáles son más rentables. |
| Fuente original detallada | Saber qué canales traen clientes, no solo leads. | Todo aparece como Direct Traffic u Offline por falta de UTMs. |
| Razón de pérdida (Closed Lost) | Permite ajustar mensaje o calificación MQL. | Marketing sigue enviando leads que Ventas descarta por la misma razón. |
| Rol en proceso de compra | Diferencia al influyente del decisor económico. | Todos marcados genéricamente como Lead sin distinguir jerarquía. |
| Ubicación/Territorio | Fundamental si la asignación de leads es geográfica. | El lead pone Ciudad de México pero el sistema requiere Región Centro. |
| Intereses de contenido | Define la nutrición (Topic Cluster). | Marketing envía newsletter general a todos, irrelevante para el 80%. |

### 8.3 Auditoría en HubSpot (si aplica)

- Revisión de propiedades vs. checklist ideal: ¿existen las propiedades para datos críticos?
- Verificación de población: % de registros con valor.
- Evaluación de la fuente: ¿cómo llega el dato? (Automático ideal, importación aceptable, texto libre es inaccesible para segmentación).
- Asociación de objetos: ¿la información de venta (Deal) está asociada al contacto?

---

## 9. Síntesis y diagnóstico final

Principio fundamental: No entregar conclusiones como "vende poco". El objetivo es conectar los puntos para explicar **POR QUÉ** tiene esos resultados. Usar ingeniería inversa: tomar el síntoma numérico del funnel y rastrear su origen hasta un fallo en Proceso, Rutina o Tecnología.

### 9.1 Identificación de hallazgos clave

Revisar el análisis cuantitativo del funnel e identificar las 2–3 métricas más alarmantes. Un hallazgo debe cumplir al menos uno de estos criterios:
- Explica un quiebre relevante del funnel.
- Genera fricción operativa significativa.
- Impide el uso efectivo de la data.

### 9.2 Análisis de causa raíz

| Síntoma | Revisa proceso | Revisa rutina | Revisa tecnología/data |
|---------|--------------|--------------|----------------------|
| Poco tráfico / rebote alto | ¿Buyer Persona definido? ¿Hay estrategia de atracción? | — | ¿Sitio lento? ¿Faltan UTMs? ¿Segmentación de Ads errónea? |
| Baja conversión a Lead | ¿Oferta de valor clara? | — | ¿Formularios muy largos? ¿Fallas en Mobile? ¿Chatbot roto? |
| Cuello de botella MQL→SQL | ¿Existe definición de MQL? ¿Hay SLA? | ¿Ventas ignora alertas? ¿Tardan días? | ¿Lead Scoring configurado? ¿Asignación automática? |

**Técnica: Los 5 Porqués.** Si no se encuentra la causa a la primera, profundizar.

### 9.3 Estructura de redacción obligatoria

Cada conclusión debe seguir esta estructura: **El resultado** (dato numérico) + **El hallazgo** (evidencia en auditoría/rutina) + **El diagnóstico** (cómo la evidencia causó el resultado).

**Ejemplo CORRECTO:**
> "Su tasa de conversión de visita a lead es del 0.2% *(Resultado)*. Al revisar, detectamos que no existen Lead Magnets ni ofertas de contenido diferenciadas por etapa del ciclo de vida *(Hallazgo)*. Esto causa que el único punto de conversión sea el formulario de contacto, que solo captura a quienes ya están listos para comprar, perdiendo el 99.8% del tráfico *(Diagnóstico)*."

**Ejemplo INCORRECTO:**
> "Analizamos su funnel y vemos que tienen una tasa de conversión muy baja. Esto es un problema grave y deben mejorar sus landing pages."

### 9.4 Ubicación en la escala de rendimiento

| Pilar | Qué evalúa |
|-------|------------|
| Ordenamiento | Madurez y claridad de los procesos de marketing. |
| Velocidad | Nivel de adopción de automatizaciones e IA. |
| Efectividad | Capacidad de aprovechar la data para decisiones estratégicas. |

**Niveles de madurez:** 0 - Deficiente · 1 - Básico · 2 - Funcional · 3 - Eficiente · 4 - Alto.

El informe debe explicar por qué el cliente se encuentra en ese nivel y qué pilares son más urgentes de intervenir.

### 9.5 Informe y presentación

- Completar y limpiar el frame de Miro con versión final validada.
- Dejar las conclusiones en el informe gerencial *(Plantilla: Informe de Diagnóstico Ejecutivo)*.
- Presentar hallazgos y estatus en la escala al cliente en sesión.
- Complementar con comentarios del cliente.
- Asegurar firma de aceptación del diagnóstico por el tomador de decisión.

### 9.6 Entregables finales

- Frame de Miro completo y validado con el cliente.
- Informe de Diagnóstico Ejecutivo: diagnóstico narrativo que explica los resultados actuales y el nivel en la escala.

---

## 10. Directrices y buenas prácticas

- Siempre grabar y transcribir todas las sesiones.
- No ser autocrático: consultar con CSL y equipo en caso de dudas.
- No ser transaccional: validar supuestos del cliente.
- Equilibrar teoría y aspectos técnicos.
- Mantener HubSpot y Miro actualizados como fuentes de verdad.
- Implementar quick wins inmediatos: mejoras simples de alto impacto.`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LOOP SALES — DIAGNÓSTICO
  // ──────────────────────────────────────────────────────────────────────────
  {
    type: KnowledgeType.PROCESS,
    title: "Proceso de Diagnóstico — Loop Sales Transformation",
    summary: "Guía operativa completa para el CSE en la etapa de diagnóstico de un proyecto Loop Sales. Cubre kick off, auditoría del CRM comercial, entrevistas y focus groups, análisis del funnel de ventas, mapeo integral y síntesis del diagnóstico final.",
    tagValues: ["loop_sales", "diagnostico", "sales"],
    content: `# Proceso de Diagnóstico — Loop Sales Transformation
*Guía operativa para el Customer Success Engineer*

## 1. Objetivo del diagnóstico

Entender por qué el cliente obtiene sus resultados actuales de ventas, identificando las causas relacionadas con su proceso comercial, rutina del equipo de ventas, estructura organizacional, uso de tecnología y accesibilidad de la data.

El diagnóstico no busca listar errores ni evaluar el uso correcto de HubSpot. El objetivo es **explicar los resultados del negocio** y generar un diagnóstico claro que permita tomar decisiones informadas.

> **Importante:** Esta etapa no incluye definición de roadmap, configuración técnica ni implementación.

---

## 2. Pasos del proceso

| # | Paso | Descripción breve |
|---|------|------------------|
| 1 | Sesión de kick off | Alinear con el cliente, validar mapa inicial y definir siguientes pasos. |
| 2 | Auditoría del CRM | Revisar la huella digital del equipo de ventas en HubSpot (si aplica). |
| 3 | Entrevistas y focus groups | Sesiones con gerencia y vendedores para contrastar proceso vs. rutina real. |
| 4 | Análisis del funnel | Evaluar métricas de conversión desde SQL hasta cierre. |
| 5 | Mapeo y análisis integral | Mapear proceso, rutina, tecnología y estructura comercial. |
| 6 | Análisis de disponibilidad de data | Determinar qué datos críticos de ventas existen y son accesibles. |
| 7 | Síntesis y diagnóstico final | Informe que explique los resultados y ubicar al cliente en la escala. |

---

## 3. Sesión de kick off

- Presentar mapa inicial en Miro.
- Solicitar organigrama del equipo comercial.
- Pedir al cliente validar y enriquecer el mapeo con comentarios sobre desafíos, fortalezas, proceso de ventas actual, herramientas, roles y expectativas.
- Acordar fecha para sesiones de entrevistas y focus groups.

*Plantillas: Presentación de Kick-off, Gameplan.*

---

## 4. Auditoría del proceso en el CRM

Aplica solo si el cliente ya usa HubSpot. Se busca entender la evidencia de disciplina y rutina comercial reflejada en el sistema **(30–90 días)**.

### 4.1 Ordenamiento (Proceso y Rutina)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Pipelines (leads y negocios) | ¿Reflejan un proceso real o son un repositorio desordenado? ¿Las etapas de negocios, leads y ciclo de vida son coherentes o se traslapan? |
| Higiene (Deal Rotting) | Filtrar negocios con Last Activity Date > 30 días. Si hay muchos, el pipeline es un cementerio. |
| Tareas | ¿Se generan tareas asociadas a negocios? ¿Hay lista gigante de tareas vencidas (overdue)? |
| Playbooks y Guías | ¿Están configurados y se usan para estandarizar el proceso? |

### 4.2 Velocidad (Automatización e IA)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Secuencias | ¿Se usan para prospección o seguimiento? ¿Tasas de respuesta aceptables? |
| Conexión de canales | ¿Están conectados correos y calendarios para registro automático de actividad? |
| Automatización de pipeline | ¿Existen workflows que muevan negocios, creen tareas o envíen notificaciones al cambiar de etapa? |
| Uso de IA | ¿Usan IA para redactar correos o resumir llamadas? |

### 4.3 Efectividad (Data y Cierre)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Tasas de conversión | Comparar tasa de cierre (Win Rate) y conversión por etapa vs. industria. |
| Integridad de data | % de deals con fecha de cierre o valor desconocidos (Forecast no confiable). |
| Tiempos en etapa | Reporte Time in Stage. ¿Negocios estancados 30 días en etapas de 2 días? |
| Registro de actividad | ¿Hay notas y correos logueados? Si los negocios se mueven sin registro, se actualiza a ciegas. |
| Reportes y metas | ¿Tienen metas de ventas configuradas? ¿Los líderes usan Rendimiento de Ventas o reportes personalizados? |

> **Principio clave:** Si una rutina no deja huella en el CRM, se asume que no es sistemática ni escalable.

---

## 5. Entrevistas y focus groups

Propósito: realizar ingeniería inversa de la operación comercial. Contrastar proceso vs. rutina, validar madurez del Loop Sales (Alinear, Apuntar, Acelerar, Optimizar), confirmar accesibilidad de data y explicar los resultados.

### 5.1 Preparación

- Alinear expectativas. No mezclar niveles jerárquicos. 4–7 personas, 60 minutos.
- Revisar información previa y resultados de la auditoría. Adaptar preguntas al contexto.

> **Adaptación:** Las preguntas son un marco de referencia. El CSE debe adaptar según contexto previo y evitar redundancias con información ya confirmada.

### 5.2 Entrevista a gerencia

**Bloque: Metas y funnel**
- ¿Cuál es el objetivo de ingresos y qué tan lejos estamos?
- ¿Qué porcentaje de leads califica para venta? ¿Cuántas propuestas presentan al mes?
- ¿Cuál es la tasa de cierre promedio (Win Rate)? ¿Cuánto tarda el ciclo de ventas?

**Bloque: Validación de proceso**
- "Entendemos que su proceso comercial es [A → B → C]. ¿Es correcto?"
- ¿En qué paso siente que se pierde más tiempo o dinero?

**Bloque: Loop Sales**

*Alinear (Align):*
- ¿Cómo ayudan a su equipo a cumplir la meta?
- ¿Tienen coaching o revisión de forecast semanal?

*Apuntar (Aim):*
- ¿Sus vendedores dedican tiempo a los prospectos correctos o pierden tiempo en leads basura?

*Acelerar (Accelerate):*
- ¿Qué tareas son poco efectivas o manuales en la rutina de sus vendedores?

*Optimizar (Optimize):*
- ¿Saben exactamente por qué pierden los negocios (Precio, Competencia, Producto) o es una caja negra?

**Bloque: Auditoría de data**
- ¿Qué dato necesitan para decisiones y sienten que NO tienen disponible?
- ¿Tienen visibilidad real de lo que hacen sus vendedores día a día?

### 5.3 Focus group con vendedores

**Técnica de apertura: "El día de ayer"**
> "Cuéntenme qué hicieron ayer paso a paso desde que abrieron la computadora. ¿Qué herramientas abrieron? ¿Qué fue lo primero que revisaron?"

**Validar la realidad**
- "El proceso oficial es [Paso X]. En la vida real, ¿funciona o hacen pasos extra?"
- "Cuando les pasan un lead, ¿la información viene completa o tienen que investigar?"

**Bloque: Loop Sales**

*Alinear:*
- ¿Saben hoy exactamente cuánto les falta para su cuota?
- ¿Dónde registran sus negocios (Excel, libreta, CRM)?
- Si se enferman mañana, ¿alguien más sabe en qué quedaron sus negociaciones?

*Apuntar:*
- ¿A quién llaman primero? ¿Al último que llegó o tienen forma de priorizar?

*Acelerar:*
- ¿Cuánto tiempo pierden al día redactando correos repetitivos o buscando documentos?
- ¿Si un cliente deja de contestar, tienen secuencia de rescate o redactan correo nuevo cada vez?
- ¿Recurren a liderazgo para cerrar deals complicados?

*Optimizar:*
- ¿Reciben retroalimentación sobre cómo mejorar llamadas/cierres?
- ¿Si pierden un negocio, registran la razón real o solo lo borran de la lista?

**Bloque: Auditoría de data**
- Del 1 al 10, ¿qué tan difícil es obtener el dato que necesitan?
- ¿Cuánto tiempo al día dedican a llenar reportes manuales?

---

## 6. Análisis del funnel de ventas

Para ventas se mide la conversión entre las etapas de MQL, SQL, Oportunidad y Cliente.

### 6.1 Gestión de oportunidades y cierre

Lifecycle Stage: Opportunity → Customer. Foco en efectividad comercial.

Métricas a extraer:
- Tasa de conversión SQL a Oportunidad (Deal).
- Tasa de cierre de Oportunidades (Win Rate).
- Ciclo de ventas promedio (días desde creación de Deal hasta cierre).
- Razones de pérdida: análisis de Closed Lost Reason.
- Tasa de conversión global (Sesiones / Cierres).
- Ticket promedio: ¿atraemos clientes de bajo o alto valor?
- Customer Acquisition Cost (CAC).

Preguntas de diagnóstico:
- ¿Hay estancamiento en alguna etapa del pipeline (Deal Rotting)?
- ¿La atribución de ingresos a Marketing es clara?
- ¿Hay tasas excesivamente altas o bajas en alguna etapa?
- ¿Hay negocios que se saltan etapas o retroceden?
- ¿Cuándo se considera ganado un negocio?
- ¿Cuál es la primera etapa del Pipeline? ¿Se crean negocios demasiado tarde para no afectar la efectividad?

### 6.2 Síntesis del funnel

1. **¿Dónde está la mayor fuga de dinero?** Ejemplo: "Perdemos el 80% de los MQLs porque Ventas no los acepta" (Fuga en la interfaz Mkt-Sales).
2. **¿Es un problema de volumen o de eficiencia?**
   - *Volumen:* el equipo tiene tiempo libre porque no llegan suficientes oportunidades calificadas.
   - *Eficiencia:* el equipo está saturado de leads pero cierra muy pocos. Muchas reuniones, baja tasa de cierre. Falla probable en Aim/Accelerate.
3. **¿La data es confiable para tomar decisiones?**

---

## 7. Mapeo y análisis integral

### 7.1 Estructura y roles

- ¿Existe un responsable claro por etapa del Loop (Alinear, Apuntar, Acelerar, Optimizar)?
- ¿Hay funciones críticas sin dueño formal?
- ¿Sobrecarga o vacíos de responsabilidad?

### 7.2 Mapeo del proceso comercial (la intención)

- Representar flujo End-to-End del proceso de ventas.
- Asignar responsables teóricos.
- Marcar handoffs: dónde Marketing entrega a Ventas, dónde Ventas entrega a Servicio.

### 7.3 Mapeo de la rutina de ventas (la realidad)

**Alinear (Align): ¿Cómo saben qué tienen que hacer?**
- ¿Existe revisión de metas al inicio de semana/mes?
- ¿El equipo tiene claro el proceso oficial o cada uno vende a su manera?
- ¿Revisan su forecast personal o esperan a que el gerente les diga?

**Apuntar (Aim): ¿Cómo deciden a quién llamar hoy?**
- ¿Atienden leads en orden de llegada (reactivo) o priorizan por probabilidad de cierre?
- ¿Usan vistas filtradas, listas o lead scoring para enfocar energía?
- ¿Tienen rutina de preparación antes de contactar o llaman en frío?

**Acelerar (Accelerate): ¿Qué hacen para cerrar más rápido?**
- ¿Involucran a otros roles para destrabar negocios complejos?
- ¿Usan secuencias, documentos o automatización para mantener interés entre reuniones?
- ¿Tienen identificados aceleradores (descuentos, demos, pruebas)?

**Optimizar (Optimize): ¿Cómo aprenden de lo que pasó?**
- ¿Reflexionan sobre por qué perdieron o ganaron un negocio esta semana?
- ¿Existe Deal Review donde se analicen fallos y aciertos?
- ¿Registran razones de pérdida con honestidad?

### 7.4 Brecha operativa

- ¿Son buenos en Acelerar (cerrar) pero pésimos en Alinear (actualizar CRM/Metas)?
- ¿El proceso dice calificar leads pero la rutina muestra que atienden a todos por orden de llegada (falla en Apuntar)?

**Conexión causal:** *"El cliente tiene [resultado] porque su rutina de ventas [hallazgo], lo que causa [impacto]."*

### 7.5 Mapeo de tecnología

- Herramientas activas vs. duplicadas vs. parche (Excel, WhatsApp personal).
- ¿La tecnología acompaña la rutina o la obliga a atajos?
- ¿Qué herramientas deberían desaparecer con HubSpot?

---

## 8. Análisis de disponibilidad y accesibilidad de la data

### 8.1 Niveles de accesibilidad

| Nivel | Descripción |
|-------|-------------|
| Alta | El dato está en el CRM, actualizado y listo para usar. |
| Media | El dato existe en un Excel compartido o requiere exportación manual. |
| Baja/Nula | El dato está secuestrado en el ERP o se requiere pedir reporte a TI. |

### 8.2 Datos críticos para ventas

| Dato crítico | Por qué es vital | Ejemplo de falta de accesibilidad |
|-------------|-----------------|----------------------------------|
| Interacciones recientes (Pageviews/Emails) | Permite el timing perfecto: llamar cuando el prospecto está activo. | El vendedor llama en frío sin saber que el lead visitó la página de precios hace 5 min. |
| Presupuesto / Rango de facturación | Fundamental para calificación y priorización del pipeline. | El vendedor pierde tiempo con leads que no pueden pagar. |
| Tomador de decisión (Rol/Cargo) | Permite personalizar discurso (ROI al CEO, features al técnico). | El vendedor trata a todos igual porque no tiene el dato de cargo. |
| Competencia actual | Preparar argumentos de batalla (Battlecards). | El dato queda en nota de texto perdida y no se puede reportar. |
| Dolor principal (Pain Point) | Enfoca la propuesta en la solución específica. | El vendedor vuelve a preguntar cuando Marketing ya lo había capturado. |
| Score de calidad (Lead Scoring) | Un número que diga "Este lead está listo". | El score existe pero los vendedores no lo ven en su vista principal. |
| Fecha estimada de cierre | Vital para el Forecast. | Los vendedores no actualizan y todos los negocios aparecen para fin de mes. |

### 8.3 Auditoría en HubSpot (si aplica)

- Revisión de propiedades vs. checklist ideal.
- Verificación de población: % de registros con valor.
- Evaluación de fuente del dato (automático, importación, texto libre).
- Asociación de objetos: ¿los Deals están asociados a Contactos?

---

## 9. Síntesis y diagnóstico final

**Principio:** No entregar "vendes poco". Conectar los puntos para explicar **POR QUÉ**. Usar ingeniería inversa: síntoma numérico → fallo en Proceso, Rutina o Tecnología.

### 9.1 Análisis de causa raíz

| Síntoma | Revisa proceso | Revisa rutina | Revisa tecnología/data |
|---------|--------------|--------------|----------------------|
| Bajo cierre (Win Rate) | ¿Pipeline tiene etapas correctas? ¿Usan Tareas? | ¿Loguean correos? ¿Usan Playbooks? | ¿Falta data para cerrar? ¿Hay automatización de seguimiento? |
| Cuello de botella MQL→SQL | ¿Existe definición de MQL? ¿Hay SLA? | ¿Ventas ignora alertas? ¿Tardan días? | ¿Lead Scoring configurado? ¿Asignación automática? |
| Baja retención / Churn | ¿Existe hand-off a Servicio? | ¿Hacen revisiones trimestrales (QBR)? | ¿Sabemos cuándo vence el contrato? |

**Técnica: Los 5 Porqués.** Profundizar hasta encontrar un problema operativo tangible.

### 9.2 Estructura de redacción obligatoria

**El resultado** (dato) + **El hallazgo** (auditoría) + **El diagnóstico** (cómo la evidencia causó el resultado).

**Ejemplo:**
> "Su tasa de cierre es del 5%. El 60% de los negocios se pierden sin actividad después de la primera llamada. No existen secuencias automáticas para reactivar. El problema no es la habilidad de cierre, sino la falta de un sistema de seguimiento estructurado."

### 9.3 Escala de rendimiento

| Pilar | Qué evalúa |
|-------|------------|
| Ordenamiento | Madurez y claridad de los procesos comerciales. |
| Velocidad | Nivel de adopción de automatizaciones e IA en ventas. |
| Efectividad | Capacidad de aprovechar la data para decisiones de cierre. |

**Niveles:** 0 - Deficiente · 1 - Básico · 2 - Funcional · 3 - Eficiente · 4 - Alto.

### 9.4 Entregables finales

- Frame de Miro completo y validado.
- Informe de Diagnóstico Ejecutivo con narrativa causal y ubicación en la escala.
- Firma de aceptación del tomador de decisión.

---

## 10. Directrices y buenas prácticas

- Siempre grabar y transcribir todas las sesiones.
- No ser autocrático: consultar con CSL y equipo.
- Equilibrar teoría y aspectos técnicos.
- Mantener HubSpot y Miro actualizados como fuentes de verdad.
- Quick wins inmediatos: mejoras simples de alto impacto.`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // LOOP SERVICE — DIAGNÓSTICO
  // ──────────────────────────────────────────────────────────────────────────
  {
    type: KnowledgeType.PROCESS,
    title: "Proceso de Diagnóstico — Loop Service Transformation",
    summary: "Guía operativa completa para el CSE en la etapa de diagnóstico de un proyecto Loop Service. Cubre kick off, auditoría del CRM de servicio, entrevistas y focus groups, análisis del funnel de post-venta, mapeo integral y síntesis del diagnóstico final.",
    tagValues: ["loop_service", "diagnostico", "service"],
    content: `# Proceso de Diagnóstico — Loop Service Transformation
*Guía operativa para el Customer Success Engineer*

## 1. Objetivo del diagnóstico

Entender por qué el cliente obtiene sus resultados actuales de servicio y post-venta, identificando las causas relacionadas con su proceso de atención, rutina del equipo de soporte/CSM, estructura organizacional, uso de tecnología y accesibilidad de la data.

El diagnóstico no busca listar errores ni evaluar el uso correcto de HubSpot. El objetivo es **explicar los resultados de retención y satisfacción**, y generar un diagnóstico claro que permita tomar decisiones informadas.

> **Importante:** Esta etapa no incluye definición de roadmap, configuración técnica ni implementación.

---

## 2. Pasos del proceso

| # | Paso | Descripción breve |
|---|------|------------------|
| 1 | Sesión de kick off | Alinear con el cliente, validar mapa inicial y definir siguientes pasos. |
| 2 | Auditoría del CRM | Revisar la huella digital del equipo de servicio en HubSpot (si aplica). |
| 3 | Entrevistas y focus groups | Sesiones con gerencia y agentes de servicio para contrastar proceso vs. rutina. |
| 4 | Análisis del funnel | Evaluar métricas de retención, satisfacción y post-venta. |
| 5 | Mapeo y análisis integral | Mapear proceso, rutina, tecnología y estructura de servicio. |
| 6 | Análisis de disponibilidad de data | Determinar qué datos críticos de servicio existen y son accesibles. |
| 7 | Síntesis y diagnóstico final | Informe que explique los resultados y ubicar al cliente en la escala. |

---

## 3. Sesión de kick off

- Presentar mapa inicial en Miro.
- Solicitar organigrama del equipo de servicio/soporte.
- Pedir al cliente validar y enriquecer el mapeo: desafíos, proceso de atención, canales, SLAs, herramientas y expectativas.
- Acordar fecha para sesiones de entrevistas y focus groups.

*Plantillas: Presentación de Kick-off, Gameplan.*

---

## 4. Auditoría del proceso en el CRM

Aplica solo si el cliente ya usa HubSpot. Se busca entender cómo llevan su proceso de servicio y evidencia de disciplina reflejada en el sistema **(30–90 días)**.

### 4.1 Ordenamiento (Estandarización)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Pipeline de Tickets | ¿Refleja el proceso real de resolución? ¿Existen tickets estancados (tiempo promedio por etapa)? |
| Categorización | ¿Usan propiedades para tipificar problemas (ej. Falla técnica)? Sin esto no hay orden. |
| SLA | ¿Están configurados los Acuerdos de Nivel de Servicio en la bandeja? |

### 4.2 Velocidad (Respuesta y Automatización)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Fuentes de Tickets | ¿Llegan automáticos (correo/chat) o se crean manual (lento)? |
| Automatización de Tickets | ¿Se generan tareas o correos automáticos al crear/cerrar tickets? |
| Base de Conocimientos | ¿Existe y se usa para autoservicio (desvío de tickets) o soporte interno? |

### 4.3 Efectividad (Satisfacción y Retención)

| Área de revisión | Qué buscar |
|-----------------|------------|
| Cumplimiento de SLA | ¿Se cumplen los tiempos prometidos o se incumplen sistemáticamente? |
| Encuestas (NPS/CSAT) | ¿Se dispara encuesta al cerrar? ¿Se mide calidad o solo cantidad? |
| Espacio de Éxito | ¿Tienen configurada la calificación de salud del cliente (Health Score)? |
| Registro de actividad | ¿Hay notas y correos logueados en los tickets para dar contexto? |

> **Principio clave:** Si una rutina no deja huella en el CRM, se asume que no es sistemática ni escalable.

---

## 5. Entrevistas y focus groups

Propósito: realizar ingeniería inversa de la operación de servicio. Contrastar proceso vs. rutina, validar madurez del Loop Service (Estandarizar, Contextualizar, Anticipar, Escalar), confirmar accesibilidad de data y explicar resultados.

### 5.1 Preparación

- Alinear expectativas. No mezclar niveles jerárquicos. 4–7 personas, 60 minutos.
- Revisar información previa y resultados de la auditoría. Adaptar preguntas al contexto.

> **Adaptación:** Las preguntas son un marco de referencia. El CSE debe adaptar según contexto previo y evitar redundancias con información ya confirmada.

### 5.2 Entrevista a gerencia

**Bloque: Metas y resultados**
- ¿Cuál es el porcentaje de renovación o recompra?
- ¿Cuál es la queja número 1 por la que pierden clientes?
- ¿En qué paso del proceso de atención siente que se pierde más tiempo?

**Bloque: Loop Service**

*Estandarizar (Standardize):*
- ¿Tienen un estándar de tiempo de respuesta (SLA) prometido al cliente?
- ¿Existe un proceso único de atención o depende del criterio de cada agente?

*Contextualizar (Contextualize):*
- ¿El equipo de servicio tiene acceso inmediato al historial comercial al atender un ticket, o trabajan a ciegas?
- ¿Sus clientes deben repetir su historia cada vez que los contactan por otro canal o cambian de agente?
- ¿Existe hand-off formal entre Ventas y Servicio o el cliente llega como desconocido?

*Anticipar (Anticipate):*
- ¿Cómo miden la satisfacción (NPS)? ¿Se enteran de los problemas antes o después de que el cliente se queje?
- ¿Tienen mecanismos para detectar clientes en riesgo de cancelación (Churn)?
- ¿Realizan acciones proactivas de salud del cliente (Customer Success) o son 100% reactivos (Soporte)?

*Escalar (Scale):*
- Si mañana duplicaran su base de clientes, ¿tendrían que duplicar linealmente su equipo?
- ¿Cuentan con estrategias de autoservicio (Base de conocimientos, Chatbots) que realmente resuelvan sin intervención humana?
- ¿Utilizan la data de tickets para retroalimentar al negocio y eliminar problemas de raíz?

**Bloque: Auditoría de data**
- ¿Qué dato necesitan para decisiones y sienten que NO tienen disponible?
- ¿Tienen visibilidad real de lo que hacen sus agentes día a día?

### 5.3 Focus group con agentes de servicio

**Técnica de apertura: "El día de ayer"**
> "Cuéntenme qué hicieron ayer paso a paso desde que abrieron la computadora. ¿Qué herramientas abrieron? ¿Qué fue lo primero que revisaron?"

**Validar la realidad**
- "El proceso oficial es [Paso X]. En la vida real, ¿funciona o hacen pasos extra?"
- "Cuando les pasan un cliente, ¿la información viene completa o tienen que investigar?"

**Bloque: Loop Service**

*Estandarizar:*
- Si un cliente escribe por WhatsApp y otro por correo con el mismo problema, ¿reciben la misma respuesta y tiempo de solución?
- ¿Tienen plantillas de respuesta o cada uno escribe lo que cree mejor?

*Contextualizar:*
- Antes de contestar una queja, ¿buscan qué compró el cliente o si ha tenido problemas antes? ¿Esa búsqueda es rápida o lenta?

*Anticipar:*
- ¿Llaman al cliente para ver si está feliz antes de que se queje, o solo hablan con él cuando hay un problema?

*Escalar:*
- ¿Tienen un lugar donde el cliente pueda resolver dudas simples solo (Base de conocimientos)?

**Bloque: Auditoría de data**
- Del 1 al 10, ¿qué tan difícil es obtener el dato que necesitan cuando lo necesitan?
- ¿Cuánto tiempo al día dedican a llenar reportes manuales?

---

## 6. Análisis del funnel de servicio (post-venta)

Para servicio se mide la conversión a la etapa de Cliente y la retención/expansión. Lifecycle Stage: Cliente y Evangelista.

### 6.1 Etapa de deleite y post-venta

Métricas a analizar:
- Recurrencia: % de clientes que compran por segunda vez (E-com) o renuevan (B2B).
- Feedback: ¿existen datos de NPS o CSAT en el CRM?
- Upsell/Cross-sell: % de la base de clientes que ha comprado productos adicionales.
- Tiempo de resolución promedio de tickets.
- Volumen de tickets por categoría.
- % de cumplimiento de SLA.

### 6.2 Síntesis del funnel

1. **¿Dónde está la mayor fuga de dinero?** En servicio, la fuga suele ser churn (clientes que no renuevan) o costos operativos por ineficiencia.
2. **¿Es un problema de volumen o de eficiencia?**
   - *Volumen:* el equipo está desbordado por tickets repetitivos que podrían resolverse con autoservicio.
   - *Eficiencia:* tardan demasiado en resolver cada caso o el cliente queda insatisfecho aunque se resuelva.
3. **¿La data es confiable para tomar decisiones?**

---

## 7. Mapeo y análisis integral

### 7.1 Estructura y roles

- ¿Existe un responsable claro por etapa del Loop (Estandarizar, Contextualizar, Anticipar, Escalar)?
- ¿Hay funciones críticas sin dueño formal?
- ¿Sobrecarga o vacíos de responsabilidad?

### 7.2 Mapeo del proceso de servicio (la intención)

- Representar flujo End-to-End del proceso de atención.
- Asignar responsables teóricos.
- Marcar handoffs: dónde Ventas entrega a Servicio.

### 7.3 Mapeo de la rutina de servicio (la realidad)

**Estandarizar (Standardize): ¿Tienen una base sólida?**
- ¿Existen SLAs definidos y conocidos por el equipo?
- ¿Siguen un protocolo unificado o cada agente responde como quiere?
- ¿Tienen plantillas para problemas comunes?

**Contextualizar (Contextualize): ¿Saben con quién hablan?**
- ¿El agente revisa historial antes de responder?
- ¿Personalizan la respuesta según tono/canal o envían respuestas robóticas?
- ¿Tienen la información a la mano o preguntan lo que ya deberían saber?

**Anticipar (Anticipate): ¿Son proactivos o reactivos?**
- ¿Detectan problemas recurrentes y avisan antes de que el cliente se queje?
- ¿Identifican oportunidades de renovación o riesgo de churn proactivamente?
- ¿Tienen rutinas de salud del cliente o solo actúan cuando llega un ticket?

**Escalar (Scale): ¿Aprenden para ser más eficientes?**
- ¿Documentan soluciones nuevas en Base de Conocimientos?
- ¿Usan tickets cerrados para mejorar bots o respuestas automáticas?
- ¿Analizan causas raíz para reducir volumen de tickets?

### 7.4 Brecha operativa

- ¿Son 100% reactivos (Contextualizar) y nulos en Anticipar problemas?
- ¿Tienen estandarización básica pero cero capacidad de escalamiento?

**Conexión causal:** *"El cliente tiene baja retención porque su rutina de servicio se limita a responder tickets sin revisiones proactivas de salud del cliente (falla en Anticipar)."*

### 7.5 Mapeo de tecnología

- Herramientas activas vs. duplicadas vs. parche.
- ¿La tecnología acompaña la rutina o la obliga a atajos?
- ¿Qué herramientas deberían desaparecer con HubSpot Service Hub?

---

## 8. Análisis de disponibilidad y accesibilidad de la data

### 8.1 Niveles de accesibilidad

| Nivel | Descripción |
|-------|-------------|
| Alta | El dato está en el CRM, actualizado y listo para usar. |
| Media | El dato existe en un Excel compartido o requiere exportación manual. |
| Baja/Nula | El dato está secuestrado en el ERP o se requiere pedir reporte a TI. |

### 8.2 Datos críticos para servicio

| Dato crítico | Por qué es vital | Ejemplo de falta de accesibilidad |
|-------------|-----------------|----------------------------------|
| Fecha de renovación de contrato | Crítico para iniciar renovación con tiempo. | El Account Manager se entera que el contrato venció cuando el cliente ya no paga. |
| NPS / Satisfacción (última encuesta) | Evita venderle a un cliente enojado. | Ventas llama para upsell a un cliente que puso un 1 en la encuesta de ayer. |
| Tickets abiertos (volumen/estado) | Da contexto de salud del cliente. | Se intenta renovar mientras el cliente tiene ticket crítico sin resolver. |
| Uso de la herramienta (Product Usage) | Indica riesgo de abandono si el uso baja (SaaS). | Customer Success no sabe que el cliente dejó de loguearse hace 20 días. |
| Estado de onboarding | No puedes vender más si aún no sabe usar lo básico. | Marketing envía promociones de funciones avanzadas a clientes en configuración. |
| Pagador vs. Usuario | Contactar al incorrecto por cobranza es fatal. | Facturas se envían al correo del usuario técnico en lugar del administrativo. |
| Historial de quejas (categoría) | Si se quejó 3 veces de precio, no ofrecer aumento. | Historial no es visible para Customer Success o Ventas. |

### 8.3 Auditoría en HubSpot (si aplica)

- Revisión de propiedades vs. checklist ideal.
- Verificación de población: % de registros con valor.
- Evaluación de fuente del dato.
- Asociación de objetos: ¿los Tickets están asociados a Contactos y Companies?

---

## 9. Síntesis y diagnóstico final

**Principio:** No entregar "su servicio es malo". Conectar los puntos para explicar **POR QUÉ**. Ingeniería inversa: síntoma → fallo en Proceso, Rutina o Tecnología.

### 9.1 Análisis de causa raíz

| Síntoma | Revisa proceso | Revisa rutina | Revisa tecnología/data |
|---------|--------------|--------------|----------------------|
| Baja retención / Churn | ¿Existe hand-off de Ventas a Servicio? | ¿Hacen revisiones proactivas de salud? | ¿Sabemos cuándo vence el contrato? |
| Tiempo de resolución alto | ¿Hay protocolo unificado? | ¿Cada agente resuelve a su manera? | ¿Faltan plantillas, KB o automatización? |
| Tickets repetitivos | ¿Se analizan causas raíz? | ¿Documentan soluciones? | ¿Existe Base de Conocimientos? |

**Técnica: Los 5 Porqués.** Profundizar hasta encontrar un problema operativo tangible.

### 9.2 Estructura de redacción obligatoria

**El resultado** (dato) + **El hallazgo** (auditoría) + **El diagnóstico** (cómo la evidencia causó el resultado).

**Ejemplo:**
> "Su tasa de churn es del 25% anual. Al revisar, no existe un proceso de hand-off entre Ventas y Servicio: el cliente llega como desconocido. Además, no hay rutinas de revisión proactiva de salud. El problema no es que el producto falle, sino que nadie detecta la insatisfacción antes de la cancelación."

### 9.3 Escala de rendimiento

| Pilar | Qué evalúa |
|-------|------------|
| Ordenamiento | Madurez y estandarización de los procesos de servicio. |
| Velocidad | Nivel de adopción de automatizaciones, autoservicio e IA. |
| Efectividad | Capacidad de aprovechar la data para retención y satisfacción. |

**Niveles:** 0 - Deficiente · 1 - Básico · 2 - Funcional · 3 - Eficiente · 4 - Alto.

### 9.4 Entregables finales

- Frame de Miro completo y validado.
- Informe de Diagnóstico Ejecutivo con narrativa causal y ubicación en la escala.
- Firma de aceptación del tomador de decisión.

---

## 10. Directrices y buenas prácticas

- Siempre grabar y transcribir todas las sesiones.
- No ser autocrático: consultar con CSL y equipo.
- Equilibrar teoría y aspectos técnicos.
- Mantener HubSpot y Miro actualizados como fuentes de verdad.
- Quick wins inmediatos: mejoras simples de alto impacto.`,
  },
];

// =============================================================================
// SEED
// =============================================================================
async function seed() {
  console.log("🌱 Iniciando seed de base de conocimiento...\n");

  // 1. Tags
  console.log("📌 Creando tags...");
  const tagIdMap: Record<string, string> = {};
  for (const tag of tags) {
    const created = await prisma.knowledgeTag.upsert({
      where: { category_value: { category: tag.category, value: tag.value } },
      update: { label: tag.label },
      create: tag,
    });
    tagIdMap[tag.value] = created.id;
  }
  console.log(`  ✓ ${Object.keys(tagIdMap).length} tags\n`);

  // 2. Documentos (upsert por title)
  console.log("📄 Creando documentos...");
  let created = 0, updated = 0;

  for (const doc of documents) {
    const tagIds = doc.tagValues.map((v) => tagIdMap[v]).filter(Boolean);
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { title: doc.title },
      select: { id: true },
    });

    if (existing) {
      await prisma.knowledgeDocument.update({
        where: { id: existing.id },
        data: {
          type: doc.type, summary: doc.summary, content: doc.content,
          status: KnowledgeStatus.PUBLISHED,
          tags: { set: tagIds.map((id) => ({ id })) },
        },
      });
      console.log(`  ↺ [${doc.type}] ${doc.title}`);
      updated++;
    } else {
      await prisma.knowledgeDocument.create({
        data: {
          type: doc.type, title: doc.title, summary: doc.summary,
          content: doc.content, status: KnowledgeStatus.PUBLISHED,
          tags: { connect: tagIds.map((id) => ({ id })) },
        },
      });
      console.log(`  ✓ [${doc.type}] ${doc.title}`);
      created++;
    }
  }

  console.log(`\n  ${created} creados, ${updated} actualizados`);
  console.log("\n✅ Seed completado.");
}

seed()
  .catch((e) => { console.error("❌ Error:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
