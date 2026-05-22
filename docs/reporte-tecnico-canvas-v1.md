# Reporte Técnico: Canvas System v1 — Estado actual de Nexus

**Fecha:** 26 marzo 2026
**Alcance:** Cambios desde la implementación del sistema de Canvas basado en cards
**Punto de partida:** Prompt "Necesito agregar campos nuevos al modelo ClientContextCard..."

---

## 1. Modelo de datos — Cambios en Prisma Schema

### ClientContextCard (modelo central, muy modificado)
```
Campos nuevos:
- cardType: CardType enum (TEXT | FLOWCHART | CHART) — default TEXT
- canvasSection: String? — sección del canvas donde vive (null = no está en canvas)
- canvasOrder: Int? — orden dentro de la sección (para drag & drop)
- parentCardId: String? — self-relation para clones (card original → copia en canvas)
- diagramData: Json? — nodos + edges de React Flow para tipo FLOWCHART
- chartConfig: Json? — config de ECharts para tipo CHART (no implementado aún)
- publishedToClient: Boolean (default false) — visible en vista pública
- publishedContent: String? — versión alternativa del contenido para el cliente
```

### Project (modificado)
```
Campo nuevo:
- shareToken: String? @unique — token para vista pública /share/[token]
```

### CanvasSuggestion (modificado)
```
Campos nuevos:
- field: String? — campo específico dentro de la sección
- suggestedValue: String? — alternativa de texto para sugerencias simples
- source: String? — origen: "refresh", "run:ID", "manual"
- sourceLabel: String? — label legible: "Análisis inicial · 24 mar"
```

### ClientDocument (modificado)
```
Campos nuevos:
- fileName: String? — nombre original del archivo
- fileSize: Int? — tamaño en bytes
- mimeType: String? — tipo MIME
Enum DocumentType: agregado FILE
```

### Enums nuevos
```
- CardType: TEXT | FLOWCHART | CHART
- AgentType: agregado SESSION_PROCESSOR
```

### ClientCanvas (TypeScript type, no Prisma)
```
Secciones nuevas:
- retos_estrategicos: Array<{ descripcion, estado, fuente }>
- escala_rendimiento: { general: 0-4, por_hub: { marketing, sales, service }, objetivo }
- oportunidades_futuras: Array<{ descripcion, hub, escala_nivel, estado }>
```

---

## 2. Flujo del Canvas de Proyecto

### Arquitectura actual
```
Agente de sección ejecuta → genera ClientContextCards (canvasSection = null)
  ↓
CSE ve las cards en la substage → click "Canvas" → elige sección destino
  ↓
Se CLONA el card: nuevo ClientContextCard con canvasSection + parentCardId
  ↓
Canvas de proyecto lee cards donde canvasSection IS NOT NULL, agrupadas por sección
  ↓
CSE puede: reordenar (drag & drop), mover entre secciones, quitar del canvas
```

### Secciones del canvas de proyecto (4)
1. `objetivo_alcance` — Objetivo y alcance
2. `hipotesis_recomendaciones` — Hipótesis y recomendaciones
3. `procesos` — Procesos
4. `plan_implementacion` — Plan de implementación

### Lo que YA NO se usa
- `Project.canvas` JSON — el campo sigue en la BD pero NO se lee para renderizar. El canvas se construye desde ClientContextCards.
- La sección "documentos" del canvas — movida a la tab Docs del drawer lateral.

---

## 3. Flujo del Canvas de Empresa

### Arquitectura actual
- Sigue usando `Client.canvas` JSON (NO migrado a cards)
- Renderizado en la tab "Empresa" del drawer lateral derecho
- "Actualizar con IA" genera CanvasSuggestions individuales con sourceLabel
- CSE aprueba/rechaza cada sugerencia
- Sección "Proyectos activos" es dinámica (query de BD, no JSON)

### Secciones del canvas de empresa (8)
1. perfil (industria, modelo_negocio, tamano)
2. stakeholders (array de objetos)
3. madurez (marketing, ventas, servicio)
4. herramientas (array de strings)
5. contexto_comercial
6. retos_estrategicos (NUEVO — array con estado validado/por_validar)
7. escala_rendimiento (NUEVO — barras de progreso por Hub)
8. oportunidades_futuras (NUEVO — array con hub, nivel, estado)

---

## 4. Agentes

### Agentes de sección (SECTION) — step 0: Análisis inicial
- **Análisis inicial** — CARDS, 9 cards de contexto comercial
- **Preparación para el Kick-off** — CARDS, 5 cards estratégicas (sin flowcharts)
- **Mapeo inicial de procesos** — CARDS_AND_FLOWCHARTS, 1 card + flowcharts por proceso

### Agentes de sección — step 1: Entrevistas
- **Preparación de entrevistas** — CARDS_AND_FLOWCHARTS, guías + flowcharts por proceso

### Agentes de sección — step 2: Entregable
- **Informe de diagnóstico de marketing** — CARDS_AND_FLOWCHARTS, 8 cards + flowcharts
- Mapeo de procesos, Análisis de datos, Análisis del funnel — DRAFT (desactivados, redundantes con el informe)

### Agentes transversales
- **Canvas de empresa** (CANVAS_CLIENT) — Haiku, sugiere updates al canvas de empresa
- **Canvas de proyecto** (CANVAS_PROJECT) — Haiku, merge directo al Project.canvas JSON (NOTA: este agente actualiza el JSON viejo que ya no se usa para renderizar — puede necesitar migración)
- **Procesador de sesiones** (SESSION_PROCESSOR) — Sonnet, lee Fireflies y genera cards de decisiones, info nueva, preguntas, compromisos

### Agente borrador
- **Agente de Kickoff** — DRAFT, wildcard (step null), nunca activado. Posible candidato a eliminar.

---

## 5. Contexto que reciben los agentes

### Orden de prioridad
1. **Canvas de proyecto** (PRIORIDAD MÁXIMA) — cards con canvasSection, formateadas como texto estructurado por sección
2. **Canvas de empresa** — JSON de Client.canvas
3. **Cards de steps anteriores** (excluyendo las que ya están en el canvas)
4. **Transcripciones de Fireflies**
5. **Documentos** (incluyendo FILE con texto extraído o mención de existencia)
6. **Datos de HubSpot** (deal, empresa, adquisición)
7. **Data Lake, Knowledge Base**

### Instrucciones inyectadas al prompt
- Prioridad del canvas: "Si hay contradicciones, PRIORIZA lo que dice el canvas"
- Enriquecimiento humano: cards marcadas [MODIFICADO POR CSE] tienen prioridad sobre transcripciones
- Para CARDS_AND_FLOWCHARTS: instrucción de exhaustividad en flowcharts

---

## 6. Flowcharts — Sistema de pipeline columnar

### Nodos disponibles
Clásicos: start, end, process, decision, pain, annotation, text
Pipeline: pipeline_stage, trigger, action, follow_up, outcome_positive, outcome_negative, lifecycle_change, lead_status, pipeline_title, column_background

### Layout
- Pipelines: layout columnar con carriles main/side para bifurcaciones
- Clásicos: Dagre
- Ambos soportan TB (vertical) y LR (horizontal)
- Pain/annotation van al carril lateral alineados con su nodo fuente
- Chain negativo (outcome → lifecycle → lead_status) se apila secuencialmente

### Edición (solo en fullscreen)
- Toolbar izquierda estilo Miro: Puntero, Texto, Comentario, Nodo + popup selector
- Edges: seleccionables, eliminables, double-click para label, panel de color/estilo
- Snap-to-align con guías grises
- Selección múltiple: Ctrl+click o Ctrl+drag (lasso)
- Título escalable con NodeResizer
- Scroll de app funciona normal fuera de fullscreen

### Persistencia de estilos
- strokeColor y dashed se guardan en FlowchartData.edges
- getCurrentData serializa estilos reales
- buildGraph restaura con fallback a edgeType

---

## 7. Upload de archivos

### Infraestructura
- Supabase Storage, bucket "client-documents"
- Max 10MB por archivo
- Tipos: PDF, Excel, Word, CSV, TXT, imágenes
- Extracción de texto para .txt y .csv (PDFs pendiente)

### Endpoints
- POST /api/projects/[id]/documents/upload
- GET /api/projects/[id]/documents (con signed URLs)
- DELETE /api/projects/[id]/documents

### UI
- DocumentUpload component en tab Docs del drawer lateral
- Drag & drop + file picker
- Lista con iconos, tamaño, indicador de texto extraído

---

## 8. Vista pública del cliente

### URL: /share/[shareToken]
- Sin autenticación
- Solo muestra cards con publishedToClient = true
- Muestra publishedContent si existe, sino content
- Flowcharts en modo solo lectura
- Header: nombre proyecto, nombre cliente, Hub badges
- Footer: "Powered by Nexus · Smarteam"

### Gestión del token
- POST /api/projects/[id]/share — genera token
- DELETE /api/projects/[id]/share — revoca
- Botón "Compartir" en canvas con dropdown de URL + copiar + revocar + regenerar

### Marcado de cards
- Toggle de ojo (publishedToClient) en cada card del canvas
- Editor de publishedContent en panel verde colapsable
- Badge "👁 Cliente" en cards publicados

---

## 9. Cosas que quedaron en el aire / Deuda técnica

### Alta prioridad
1. **Canvas de proyecto agent (CANVAS_PROJECT) actualiza JSON viejo** — El agente transversal que corre después de cada sección todavía hace merge al `Project.canvas` JSON, pero el canvas ahora se renderiza desde cards. Este agente necesita migración: en vez de escribir al JSON, debería crear/actualizar cards con canvasSection.

2. **Extracción de texto de PDFs** — Solo se extrae texto de .txt y .csv. PDFs (que son el formato más común de documentos del cliente) necesitan un parser como pdf-parse o similar.

3. **El "Agente de Kickoff" (borrador) sigue en la BD** — Es un agente wildcard (step null) que nunca se activó. Puede causar conflictos si se activa accidentalmente.

### Media prioridad
4. **SendToCanvasMenu en flowcharts** — Solo funciona si el flowchart tiene un ClientContextCard asociado (cardType FLOWCHART). Flowcharts de runs anteriores al cambio no tienen card y no muestran el botón.

5. **Canvas de empresa NO está basado en cards** — Sigue usando Client.canvas JSON. No se puede hacer drag & drop ni enviar cards al canvas de empresa de la misma forma que al de proyecto. La unificación requeriría migrar Client.canvas a ClientContextCards con un clientId y canvasSection.

6. **Procesador de sesiones** — El matching con Fireflies ahora funciona (fix de EnrichedClientMatcher), pero no se ha probado la ejecución completa del agente con sesiones reales.

7. **chartConfig / tipo CHART** — El campo existe en el schema pero no hay ni agente ni UI que genere cards de tipo CHART. Es infraestructura para el futuro.

### Baja prioridad
8. **Vista pública sin estilos propios** — Usa los mismos estilos de Tailwind de la app interna. Podría beneficiarse de un tema dedicado para clientes.

9. **Token de share sin expiración** — Los tokens no expiran. Se puede revocar manualmente pero no hay auto-expiración.

10. **Documentos subidos no se incluyen en el canvas de proyecto** — Los archivos viven en la tab Docs pero no se pueden "enviar al canvas" como los cards de texto o flowcharts.

---

## 10. Mapa de archivos clave

### API Endpoints
```
app/api/cards/[cardId]/send-to-canvas/route.ts  — clonar card al canvas
app/api/cards/[cardId]/publish/route.ts         — toggle publicación
app/api/projects/[id]/canvas-cards/route.ts     — GET/PUT/DELETE canvas cards
app/api/projects/[id]/documents/route.ts        — listar/eliminar docs
app/api/projects/[id]/documents/upload/route.ts — upload a Supabase
app/api/projects/[id]/process-session/route.ts  — procesar sesiones Fireflies
app/api/projects/[id]/share/route.ts            — gestión de share token
app/api/clients/[id]/canvas/refresh/route.ts    — actualizar canvas empresa con IA
app/api/clients/[id]/canvas/suggestions/route.ts — aprobar/rechazar sugerencias
```

### Componentes
```
components/clients/ProjectCanvasPanel.tsx    — canvas de proyecto (cards + drag & drop)
components/clients/ClientCanvasPanel.tsx     — canvas de empresa (JSON + sugerencias)
components/clients/SendToCanvasMenu.tsx      — botón "Enviar al canvas" en cards
components/clients/DocumentUpload.tsx        — upload de archivos
components/clients/StageOverlay.tsx          — overlay de substage sobre canvas
components/flowchart/FlowchartViewer.tsx     — editor/viewer de diagramas
components/flowchart/pipeline-nodes.tsx      — nodos de pipeline columnar
components/flowchart/nodes.tsx               — nodos clásicos + text
```

### Lógica de negocio
```
lib/canvas/template.ts      — tipos TypeScript de ambos canvas + labels
lib/canvas/update-agent.ts  — agente transversal post-ejecución (Haiku)
lib/canvas/merge.ts         — deep merge para canvas JSON
lib/storage/client.ts       — Supabase Storage client
lib/matching/cascade.ts     — matching de sesiones Fireflies a clientes
lib/matching/enrichment.ts  — enrichment de datos de cliente para matching
lib/flowchart/layout.ts     — layout columnar de pipelines + Dagre clásico
lib/steps.ts                — definición de subetapas por tipo de servicio
```

### Vista pública
```
app/share/[token]/page.tsx    — vista del cliente (server component)
app/share/[token]/layout.tsx  — layout sin auth ni sidebar
```
