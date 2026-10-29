# Artefactos: tipos, plantillas y varias copias — plan

> Estado: **plan, sin código ni datos tocados**. Medido en el código el 2026-10-28 (rama `main` en `ff7daf0e`).
> Lo pidió Elías el 28 oct: pasar de pasos a **artefactos**. «Yo como CSE dentro de FACO pueda tener 3 artefactos de
> planificación.» Lo que se le pregunta al CSE no es cómo llenarlo, sino qué necesita: «tengo de frente una
> presentación de diagnóstico», «ocupo un consenso del proceso comercial», «necesito explorar mejor marketing», «ocupo
> un plan de adopción». «La idea es que esto supla una app como Miro: el usuario pone un prompt y Nexus crea el
> artefacto con las secciones que apliquen.»
>
> Planes hermanos: `docs/escala-unica-plan.md` (sesión `escala-unica`, la etapa 1 de esta área; **todavía no está
> commiteado** en su rama), `docs/artefactos-sugeridos.md` (sesión `analisis-artefactos`, la lista de tipos y
> plantillas; **todavía no está commiteado**) y `docs/empresas-con-dominio-compartido-plan.md` (la pared entre
> proyectos de una misma ficha; rama `claude/dominio-compartido-plan-c58271`).

## En una frase

Un **artefacto** es una copia de un **tipo** de documento (planificación, diagnóstico, kickoff, adopción…), armada con
una **plantilla** o con las secciones que pide un pedido, que pertenece a **un proyecto** (o a la empresa) y tiene **su
propio enlace para compartir**. Los documentos de hoy pasan a ser la **copia principal** de su tipo, sin moverse de
lugar; las copias nuevas viven en la misma tabla, sin `slug`, así que nada de lo que hoy busca «el diagnóstico del
proyecto» cambia de respuesta.

---

## 1. Lo que hay hoy

### 1.1 Cómo vive un documento de proyecto

| Paso | Dónde | Qué hace |
|---|---|---|
| **Nace** | `lib/canvas/canvas-defs.ts` › `DEFAULT_PROJECT_CANVASES` (:204) | 5 nacen con el proyecto: kickoff, diagnóstico, planificación, cronograma y exploración. 3 se crean a pedido: Integraciones (:445), Ejecución (:535) y Entrega (:573). El handoff lo crea su flujo. |
| | `lib/pieces/registry.ts` › `PIECES` (:118) | 14 piezas. La identidad es el `slug`; el nombre visible se cambia en una línea. `clase`: `entregable` (5: kickoff, diagnóstico, planificación, integraciones, entrega) o `herramienta`. `hasCanvas: false` en Cuestionarios, Adopción y Aprendizaje: viven en sus propias tablas. |
| **Se guarda** | `ProjectCanvas` (schema :1345) | Dueño: `projectId` **o** `clientId` **o** `businessCaseId`, uno solo (CHECK `ProjectCanvas_un_solo_dueno`). El tipo es `slug String?`, texto libre. El contenido, `sections Json` + `CanvasSection` (`@@unique([canvasId, key])`) + `CanvasBlock`. La plantilla usada va en `__plantilla`, las instrucciones en `__doc.brief`. |
| **Se genera** | `lib/entregables/generar-server.ts` › `generarEntregable` | Una función para los 5 entregables (registro `ENTREGABLES`, 5 tipos, cada uno con su `agentId` y sus `plantillas`). Elige el runner con un `switch` (:132-151). El núcleo es `generateSectionsForTemplate` (`lib/business-cases/canvas-agent.ts:116`): **una sola llamada a Sonnet 4.6 con todas las secciones**, el esquema de cada una sale de las defs, y si la respuesta se corta por el tope, aborta. No reparte en lotes. |
| | Contexto | `cargarMaterialDelDocumento` (`lib/contexto/material-del-documento.ts:156`) → chokepoint (`getProjectDocumentSessions` / `getProjectMemberSessions`). Topes: 160.000 caracteres, 60.000 por reunión, 6 reuniones enteras. |
| **Contexto adicional** | `lib/contexto/documento.ts` › `DOCUMENTOS_CON_CONTEXTO` (7 piezas) | Instrucciones en `__doc.brief` (tope 5.000). Notas en `NotaDeContexto` con `pieza` = **el slug**. Reuniones elegidas: **una columna por tipo de documento en `SessionProject`** (la regla en `lib/sessions/destinos-de-contexto.ts`). Las tres llaves son por TIPO, no por documento. |
| **Se edita** | Motor (`components/landing/` + `lib/landing/`) | Edición en el sitio, ocultar, mover. Secciones propias `custom:<tipo>:<uuid>` (hasta 10 por documento, 11 tipos creables en `lib/landing/catalogo-de-secciones.ts`), que sobreviven al regenerar. «Mejorar con IA» (`lib/ai/assist.ts`): propone por sección, tope 8.000. |
| **Se publica** | Ver 1.3 | Siete mecanismos, cada uno de un tipo. |

**Topes de salida de hoy** (`maxTokens` de cada plantilla en las defs): kickoff 10.000 · diagnóstico completo 20.000,
esencial 12.000 · planificación completa 21.000 (al lado del techo sin streaming, ~21.300), esencial 14.000 ·
integraciones 12.000 · entrega 16.000 · exploración 18.000 · ejecución 18.000. Las seis secciones del Brief de la
planificación son curadas porque la corrida ya estaba en el tope (DECISIONS «La Planificación con lo que pide el Brief»).

### 1.2 Dónde el código da por hecho «un documento por tipo por proyecto»

| Dónde | Cuánto | Qué pasaría con una segunda copia que tuviera el mismo `slug` |
|---|---|---|
| **Índice único parcial en la base** `(projectId, slug)` y `(clientId, slug)` con `slug IS NOT NULL` (comentario del schema :1412-1420; Prisma no lo conoce) | 2 índices | La base no la deja entrar. Es la guarda real. |
| **Búsquedas por tipo** (helpers `canvasOf*` de `lib/pieces/canvas-query.ts` + 3 a mano) | **105 en 75 archivos** (27 en `app/`, 78 en `lib/`); 54 son `findFirst` | Cada una se queda con la primera. Además 18 en scripts. |
| **Rutas de API por tipo** en `app/api/projects/[projectId]/` | **56 de 119** (cronograma 26, handoff 7, ciclo 5, planificación 4, kickoff 3, diagnóstico 3, exploración 3, entrega 2, cuestionario 2, integraciones 1) | Actúan sobre «el» documento del tipo. Las genéricas por id ya existen: `canvases/[canvasId]`, `canvas-sections/*`, `versiones`. |
| **El riel del proyecto** (`lib/flow/dropdown-rows.ts:102`, `buildPieceRows`) | Un `Map` por slug (:106-118) | La segunda pisaría a la primera. Los canvas **sin slug** ya se listan al final. |
| **La dirección** `?canvas=<id o slug>` (`lib/flow/vista-de-la-url.ts:26`) | 1 | Por slug abre la primera; por id, la correcta. |
| **Publicación** | 7 superficies (`PUBLISH_SURFACES`), una columna `*PublishedAt` por tipo en `Project` (:500-540), **un** `ProjectExternalAccess` por proyecto, `ProjectTimeline.projectId @unique` | Cada vista externa (`/external/<tipo>/[acceso]`, 14 páginas) muestra el documento de ese tipo. |
| **Comparaciones `slug === "…"`** | 61 en 19 archivos (26 solo en `ProjectCanvasPanel.tsx`) | Deciden qué renderer, qué botones y qué franjas pinta el panel. |
| **Mapas indexados por slug** | 8: impresión (`PrintDocView:121`), assist (`assist-de-documento.ts:63`), capacidades, **frontera de los documentos** (`frontera-de-los-documentos.ts:82`), preparación, consumidores de la memoria, manual, `generar-server` | Una copia sin slug no tendría PDF, assist, ni frontera: **la frontera es la que impide que lo interno llegue al cliente**. |
| **`case "<slug>"`** | 10 en 5 archivos | — |

**Quién lee el documento de otro tipo** (siempre «el» del proyecto): la entrega lee `desafio` y `objetivos` del
diagnóstico (`entrega-generate.ts:93`); el diagnóstico lee el `equipo` del kickoff (`diagnostico-fuentes.ts:57`);
publicar el kickoff re-ancla el cronograma; el cronograma cuenta lo confirmado del handoff (`baseline.ts:258`); el
agente de procesos lee `definicion_procesos` de la planificación (`procesos/agente.ts:112`); la escala, el seguimiento
y la carga leen el diagnóstico (`escala/contexto.ts:110`, `seguimiento/tarjeta-server.ts:280`, `carga/queries.ts:444`);
los servicios recurrentes leen la lista fija `["diagnosis","planning"]` (`servicio-server.ts:49,141`); la memoria lee
entrega, handoff e Información del cliente. **Tareas y «Para ti» no leen ningún documento por tipo.**

### 1.3 Lo que ya sirve de semilla

- **Varios documentos sin slug ya se permiten** en un proyecto: son los «canvas que crea el CSE». El índice único solo
  mira las filas con slug.
- **Un enlace por documento ya existe**: `AccesoAlDocumento` (`canvasId @unique`, token de 64 hex, `revokedAt`), con
  la página `/external/documento/[token]`, la foto publicada y el revocar. Hoy solo sirve a los documentos de la
  empresa, y **INV64** vigila que ningún enlace abra un documento de un proyecto o de una propuesta.
- **Documentos de la empresa** (`/clients/[id]/documentos`): un diagnóstico con dueño `clientId`, sin proyecto. Uno por
  pieza y empresa.
- **Plantillas dentro de un tipo**: el diagnóstico (esencial 7 secciones, completo) y la planificación (esencial 9,
  completa 17) usan el mismo mecanismo: `__plantilla`, el selector `ElegirPlantilla`, «Escribirlo yo» y
  `ajustarALaPlantilla` (lo de afuera vacío se borra, lo que tiene algo se oculta con `ocultaPorLaPlantilla`).
- **Cuestionarios ya son varios por proyecto** (uno por persona, en sus tablas).
- **El chat ya genera un entregable** (`documento.generar`) con un pedido que vale solo para esa corrida
  (`bloqueDeInstruccionesDelPedido`, tope 2.000).
- **Lo que NO existe**: nada elige secciones o documentos a partir de un pedido en texto. Lo más cercano son las
  advertencias por palabras clave (`capacidades-de-documento.ts:165`) y `casosSugeridosParaLaPropuesta` (que parte de la
  escala, no de un texto).

### 1.4 Lo que está decidido y este plan no re-litiga

- **Agregar, quitar o reordenar las secciones de una plantilla es decisión de producto** (`lib/landing/registry.test.ts`
  lo congela; `catalogo-de-secciones.ts` lo repite: «el motor sabe pintar ~50 componentes, no son un menú»). Por eso
  Nexus elige secciones **del catálogo del tipo**, nunca las inventa.
- **El kickoff se presenta una sola vez por proyecto** (decisión 11 de `docs/nexus-sistema-de-trabajo-plan.md`).
- **El cronograma es uno por proyecto** (`ProjectTimeline.projectId @unique`).
- **Una exploración viva por proyecto**, y las sesiones se planean **por equipo** del cliente (DECISIONS «Las
  exploraciones por equipo»). «Necesito explorar mejor marketing» ya tiene dónde caer: una sesión con Marketing en la
  exploración viva.
- **La pared es el proyecto** y lo que más pesa para saber de qué proyecto es una reunión es su nombre
  (`docs/empresas-con-dominio-compartido-plan.md`). Este plan la hereda: un artefacto lee solo de su proyecto.
- **El render se comparte, el storage se aísla** (ARCHITECTURE §1-WEB punto 1): no hay tabla nueva para el contenido.
- **Una plantilla vieja sin anotar se lee con la completa** (los documentos de antes no cambian).

---

## 2. El diseño

### 2.1 El modelo

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Tipo** | Qué clase de documento es: planificación, diagnóstico, kickoff, adopción, escala… Tiene nombre, para qué sirve, su **catálogo de secciones**, cuáles son estructurales (portada y cierre), su agente (la `agentIntro` de su plantilla base), su tope de salida, si se comparte con el cliente, **cuántas copias admite** y de quién puede ser. | Código: `lib/artefactos/tipos.ts` (puro, congelado por test). Ningún tipo en la base. |
| **Plantilla** | Un subconjunto ordenado del catálogo del tipo, con su tope. Las de hoy (esencial, completa, recurrente) son plantillas de su tipo. Una más: **«a medida»**, la que arma un pedido. | Las de hoy, en `lib/entregables/registro.ts` como siempre. La que usó cada copia, en `__plantilla` (la «a medida» lleva además su lista de secciones). |
| **Copia (el artefacto)** | Una fila de `ProjectCanvas`. | Igual que hoy, más cuatro columnas aditivas (2.4). |
| **Título** | «Planificación — Marketing», «Plan de adopción para líderes». | Columna nueva `titulo`. Sin título, el nombre del tipo. |
| **Pertenencia** | Un proyecto (`projectId`), o la empresa (`clientId`) para los tipos que lo admiten. Nunca dos. | El CHECK de un solo dueño ya lo garantiza. |
| **Área para compartir** | Su enlace propio, su foto publicada, revocar. | `AccesoAlDocumento` (2.6). |

**Cuántas copias admite cada tipo** (la regla vive en el tipo, no en la base):

| Tipo | Copias por proyecto | Por qué |
|---|---|---|
| Planificación, Diagnóstico, Integraciones, Entrega, y los tipos nuevos (adopción, consenso de procesos…) | **Varias** | Lo pidió Elías. |
| Kickoff | **Una** | Decisión 11: se presenta una vez. |
| Cronograma | **Una** | `ProjectTimeline` es único por proyecto, y Tareas y Cobranza lo leen como tal. |
| Exploración | **Una viva** | Decidido; las áreas van como sesiones por equipo. |
| Handoff | **Una** | Es el paso Ventas → CS. |
| Cuestionarios | **Varias** (ya hoy) | Sus propias tablas, sin cambio. |
| Escala | **Una por empresa** | Lo define `escala-unica`. |

### 2.2 La copia principal: cómo conviven lo de hoy y lo nuevo sin migrar nada

La regla de convivencia cabe en una línea: **la copia principal es la que tiene `slug`; las demás no lo tienen.**

- Los documentos que existen hoy **son** la copia principal de su tipo. No se toca una fila.
- Una copia nueva nace con `slug = NULL` y `tipoArtefacto = "planning"` (el slug del tipo). El índice único no la ve.
- Las **105 búsquedas por tipo siguen devolviendo la principal**, que es lo que hacen hoy. Ninguna hay que migrarla
  para que lo de hoy siga funcionando: la entrega sigue leyendo «el» diagnóstico, el cronograma sigue anclado a «el»
  kickoff.
- Lo nuevo (abrir, generar, editar, compartir una copia) va **por id**, por las rutas genéricas que ya existen
  (`canvases/[canvasId]`, `canvas-sections/*`, `versiones`) más las que se sumen por id.
- Un helper único, `tipoDelDocumento(canvas) = canvas.slug ?? canvas.tipoArtefacto`, reemplaza a las 61 comparaciones
  `slug === "…"` **solo donde una copia tiene que comportarse como su tipo** (el renderer del panel, el PDF, el assist,
  la frontera). Las demás quedan como están.
- **Cambiar cuál es la principal** (etapa posterior, si Elías lo quiere): en una transacción, a la vieja se le saca el
  `slug` y se le pone `tipoArtefacto`; a la nueva, al revés. El índice único se respeta porque primero se suelta.

*Se descartó* una tabla `Artefacto` aparte que apunte al canvas: duplicaría el dueño, el título y el estado en dos
filas (ARCHITECTURE §2 regla 1) y obligaría a crear 1 fila por cada documento que ya existe. *Se descartó* también
sacar el índice único y numerar copias con el mismo slug: las 105 búsquedas pasarían a devolver una copia cualquiera.

### 2.3 El catálogo de secciones por tipo

El catálogo de un tipo es **la unión de las secciones de sus plantillas** (lo que hoy está en las defs), más las
secciones compartidas que otros tipos le prestan. Sale del código, no se escribe dos veces: `lib/artefactos/catalogo.ts`
lo arma de las defs, y cada entrada lleva su `key`, su nombre, su `tip` (para qué sirve, que ya existe en
`SectionDef.tip`), si la escribe el agente (`agentGenerated`), si lee el proyecto (`ctxDriven`: no puede ir dos veces) y
si es estructural.

Lo que hay hoy (sin las secciones de solo lectura que esperan a regenerarse):

| Tipo | Secciones (las ✱ las escribe el agente; las ○ las llenan el CSE, el cliente o el proyecto) |
|---|---|
| **Kickoff** (19) | ✱ portada «¡Arranquemos juntos!» · ✱ objetivos · ✱ cómo trabajamos cada ciclo · ✱ el primer ciclo · ✱ la cadencia del servicio · ✱ del hoy al nuevo sistema · ✱ alcance · ○ el equipo · ✱ lo que necesitamos de tu equipo · ✱ cómo nos pides cosas · ✱ cómo mediremos el éxito · ✱ desde dónde arrancamos · ○ sesiones y horarios · ○ canales · ○ tu ruta en HubSpot Academy · ✱ próximos pasos · ○ cronograma · ○ nuestros procesos · ○ cierre |
| **Diagnóstico** (15) | ✱ portada · ✱ situación actual · ✱ objetivos · ✱ explicación del problema · ✱ desafío principal · ✱ enfoque de la solución · ✱ cómo opera hoy y cómo va a operar · ✱ fortalezas · ✱ acciones coherentes · ✱ herramientas de HubSpot y para qué · ✱ equipos y licencias · ✱ preguntas que vas a poder responder · ✱ la brecha y lo que cuesta hoy · ✱ alcance acordado · ○ el siguiente paso |
| **Planificación** (17) | ✱ portada «Plan de implementación» · ○ ficha del proyecto · ○ usuarios y permisos · ○ por dónde entran tus leads · ○ formularios · ○ cotizaciones · ○ informes y paneles · ✱ cómo van a funcionar tus procesos · ✱ etapas del ciclo de vida · ✱ arquitectura de la solución · ✱ propiedades por objeto · ✱ pipelines · ✱ automatizaciones · ✱ conversaciones · ✱ rutinas de adopción · ✱ despliegue por olas · ○ aprobación |
| **Integraciones** (9) | ✱ requerimiento técnico · ○ estimación del equipo técnico · ✱ qué duele hoy · ✱ cómo sabremos que funcionó · ✱ arquitectura HubSpot ↔ sistema · ✱ relación entre objetos · ✱ propiedades y campos · ✱ momentos de sincronización · ○ notas de cierre |
| **Entrega** (12) | ✱ portada · ✱ el desafío que resolvimos · ✱ el antes y el después · ✱ qué quedó implementado · ✱ objetivos alcanzados · ○ el plan, cumplido · ✱ el impacto en el negocio · ○ tu posición en la escala · ○ qué queda abierto · ✱ el siguiente proyecto · ✱ cómo sacarle más provecho · ○ cierre |
| **Exploración** (7) | ✱ qué hay que entender · ✱ lo que ya sabemos · ✱ lo que damos por supuesto · ✱ plan de sesiones · ✱ a quién involucrar · ✱ qué hay que entender a fondo · ○ cómo se cierra |
| **Ejecución** (9, interna) | ✱ guía de construcción · ○ acciones · ○ herramientas · ○ arquitectura de propiedades · ○ pipelines y objetos · ○ procesos de marketing · ✱ prompts para Breeze · ✱ lo que va a mano · ○ a construir |
| **Secciones libres** (11, cualquier tipo, hasta 10 por documento) | tarjetas con ícono · texto con tarjetas · tabla · métricas · antes y después · mapeo de procesos · arquitectura (diagrama) · casos de uso por proyecto · comparación de licencias · fases u opciones · HTML pegado |

**Un tipo nuevo se arma prestando secciones** que ya existen, con su renderer y su esquema, sin copiarlas. Ejemplo,
«Plan de adopción»: rutinas de adopción y despliegue por olas (de la planificación), tu ruta en HubSpot Academy y lo que
necesitamos de tu equipo (del kickoff), equipos y licencias (del diagnóstico), cómo sacarle más provecho (de la entrega)
y métricas. Para que una sección se pueda prestar, su def se mueve a `shared-sections.defs.ts` (la regla «un renderer, un
contrato de datos» que ya existe). Las secciones `ctxDriven` (cronograma, procesos del kickoff, estimación) se prestan
con una condición: leen el proyecto, así que pintan lo mismo en cada copia.

**La lista de tipos nuevos y sus plantillas queda pendiente de `docs/artefactos-sugeridos.md`** (sesión
`analisis-artefactos`, que analiza reuniones reales). Cuando llegue, entra a la etapa 6 tal cual. Los tres que Elías
nombró sirven de ejemplo mientras tanto: **presentación de diagnóstico** (una plantilla del diagnóstico, pensada para
proyectar), **consenso del proceso comercial** (cómo van a funcionar tus procesos, mapeo de procesos, cómo opera hoy y
cómo va a operar, aprobación) y **plan de adopción** (arriba).

### 2.4 Lo que cambia en la base (todo aditivo)

Un solo `.sql`, que se puede correr dos veces:

```sql
-- scripts/sql/AAAA-MM-DD-artefactos-copias.sql (borrador; se escribe en la etapa 3)
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "tipoArtefacto" TEXT;     -- el slug del tipo, solo en las copias
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "titulo" TEXT;
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "pedido" TEXT;            -- lo que pidió la persona, tal cual
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "archivadoEn" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ProjectCanvas_projectId_tipoArtefacto_idx" ON "ProjectCanvas" ("projectId", "tipoArtefacto");
-- una copia nunca tiene slug: el slug es la marca de la principal
ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_copia_sin_slug"
  CHECK ("tipoArtefacto" IS NULL OR "slug" IS NULL) NOT VALID;  -- (envuelto en DO $$ … $$ para correr dos veces)

-- las reuniones elegidas, por documento y no por tipo
CREATE TABLE IF NOT EXISTS "ReunionDelDocumento" (
  "id" TEXT PRIMARY KEY, "canvasId" TEXT NOT NULL REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL REFERENCES "FirefliesSession"("id") ON DELETE CASCADE,
  "elegida" BOOLEAN NOT NULL, "porEmail" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("canvasId", "sessionId"));
ALTER TABLE "ReunionDelDocumento" ENABLE ROW LEVEL SECURITY;
-- las notas de contexto, también por documento
ALTER TABLE "NotaDeContexto" ADD COLUMN IF NOT EXISTS "canvasId" TEXT REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE;
```

*Por qué una tabla para las reuniones elegidas:* hoy cada tipo tiene su columna de afinado en `SessionProject`. Con
tres planificaciones, las tres compartirían la misma columna: elegir una reunión para la de Marketing la elegiría para
las otras dos. La principal sigue usando su columna; las copias, la tabla. La tabla solo acepta reuniones que el
chokepoint da como del proyecto del documento (se valida al escribir y lo vigila un INV nuevo).

### 2.5 Crear un artefacto desde un pedido

La entrada es una caja: **«¿Qué necesitas?»**, en el riel del proyecto (y la misma operación en el chat,
`documento.crear`). Ejemplo: «ocupo un plan de adopción para los líderes».

**Paso 1 · El armador** (`lib/artefactos/armar.ts`, una llamada chica):

- Recibe: el pedido; el catálogo de tipos con sus secciones (key, nombre, para qué); lo que el proyecto ya tiene (sus
  artefactos con título y estado, la etapa del proyecto, los hubs vendidos, los casos de uso si hay); y la agenda de la
  semana del proyecto (si hay una reunión «Presentación de diagnóstico» el jueves, eso cuenta).
- Devuelve, con salida por herramienta forzada (como el prellenado de los cuestionarios), una de tres cosas:
  1. **Crear**: tipo, título, secciones elegidas **del catálogo de ese tipo** en orden, una frase de por qué va cada
     una, y las instrucciones para el agente (el pedido, aclarado).
  2. **Usar uno que ya existe**: «necesito explorar mejor marketing» → «Suma una sesión con Marketing a la exploración
     del proyecto», con el botón que abre «+ Agregar sesión» con el equipo elegido. O «ya tienes un diagnóstico
     publicado; ¿armo una presentación a partir de él?».
  3. **No hay un tipo para eso**: lo dice, y ofrece armarlo con secciones libres (hasta 10).
- Se valida en código, no se confía: el tipo existe, cada key está en su catálogo, la portada y el cierre van siempre
  (una portada es la identidad del documento), ninguna `ctxDriven` dos veces, un tope de secciones por tipo, y el tipo
  admite otra copia (un segundo kickoff responde «ya tiene kickoff» y ofrece abrirlo).
- Costo estimado: Sonnet 4.6, unos 6.000 a 10.000 tokens de entrada y 1.000 de salida: menos de US$0,05. Sin búsqueda
  web. Sin medir.

**Paso 2 · La persona confirma** en el marco de siempre (`<AgentProposal>`): «Voy a crear *Plan de adopción para
líderes*, con estas 6 secciones», cada una con su por qué y su casilla. Puede quitar, sumar del catálogo o cambiar el
título. *Por qué un clic más:* las secciones que elige la IA son una propuesta, igual que todo lo demás en Nexus («IA
arriba, una vez»); y llenar 6 secciones cuesta una corrida de verdad.

**Paso 3 · Se crea y se llena**:

- Se crea la copia (`slug NULL`, `tipoArtefacto`, `titulo`, `pedido`), con `__plantilla = { id: "a-medida",
  secciones: [...] }` y el pedido aclarado en `__doc.brief`. Así **regenerar** vuelve a usar las mismas secciones y las
  mismas instrucciones (hoy el pedido del chat no se guarda; acá sí, porque es la razón de ser del documento).
- La genera `generarEntregable` **por id**, con la plantilla base del tipo filtrada a las secciones elegidas: el mismo
  mecanismo que ya filtra la esencial (`ajustarALaPlantilla` con su canon). Mismo medidor, mismo permiso
  (`artifact-gate` con la sección del tipo), mismo contexto por el chokepoint del proyecto.
- **El tope**: cada sección del catálogo declara cuánto suele escribir (`salidaEstimada`, en tokens, medido de corridas
  reales). Si la suma de lo elegido cabe en el tope del tipo, va en una llamada, como hoy. Si no, el armador ya lo avisa
  al proponer («son muchas para una corrida: genero las 8 primeras y las demás quedan para "Mejorar con IA"»). *Se
  descartó* para esta etapa partir la generación en dos llamadas: dos llamadas escriben dos documentos que no se
  conocen (la segunda no sabe lo que dijo la primera), y la planificación completa ya vive con 21.000. Queda como
  mejora si al medir hace falta.
- Lo que el agente no escribe (las ○) quedan vacías para el CSE, el cliente o la plantilla, como hoy.

### 2.6 El área para compartir de cada artefacto

- **Cada copia se comparte con su propio enlace**: `AccesoAlDocumento` (ya existe, uno por documento) y
  `/external/documento/[token]` (ya existe: foto publicada, lo oculto filtrado, publicar otra vez conserva el enlace,
  dejar de compartir lo revoca).
- Hay que **enmendar INV64**: hoy prohíbe que un enlace abra un documento de un proyecto. Pasa a decir: un enlace
  vigente abre **solo su documento**, y ese documento es **de la misma empresa** del enlace (y, si es de un proyecto,
  de un proyecto de esa empresa). La puerta (`documento-de-la-empresa-guard.ts`) gana el caso «de un proyecto», con el
  acceso al proyecto.
- **La frontera viaja con el tipo**: la vista externa de una copia aplica la frontera de su tipo
  (`frontera-de-los-documentos.ts`, por `tipoDelDocumento`). Una copia de un tipo que no es para el cliente
  (`clientFacing: false`, como la ejecución) no tiene botón de compartir.
- **Las copias principales no cambian**: siguen con sus 7 superficies, su contraseña del proyecto y sus columnas
  `*PublishedAt`. Unificar las siete en este mecanismo es un plan aparte (ARCHITECTURE §1-WEB punto 7 lo deja así), y
  con esta área queda el camino hecho: el mecanismo nuevo ya es uno solo.

### 2.7 La recomendación: cuándo propone Nexus un artefacto

Nexus **propone, nunca crea solo**. Una propuesta a la vez por proyecto, con «Ahora no» que se recuerda. Aparece donde
ya aparecen las recomendaciones: el «Qué sigue» del proyecto (`lib/clients/que-sigue-del-proyecto.ts`) y, si hay fecha
encima, «Para ti».

**Sin casos de uso** (la mayoría de los clientes hoy), cuatro señales que ya existen:

| Señal | Ejemplo | De dónde sale |
|---|---|---|
| **Una reunión agendada** con un nombre que pide un documento | «Presentación de diagnóstico» el jueves y el diagnóstico sin publicar → «Tienes la presentación el jueves: ¿armo la presentación de diagnóstico?» | La agenda por cuenta (Calendar), por el nombre de la reunión |
| **Lo que se dijo** en una reunión | «Nos piden un plan para que los líderes adopten» → «¿Armo un plan de adopción para los líderes?» | La lectura de cada reunión (los hechos con destino): un destino nuevo, «documento pedido» |
| **La etapa del proyecto** y lo que falta | En Planificación, con el diagnóstico confirmado y ninguna planificación → la planificación, con la plantilla recomendada | El ciclo (`STAGE_FLOW`) y el estado de cada pieza, como hoy |
| **La escala** | Una dimensión que frena el área vendida → «Explora mejor Marketing» (una sesión con ese equipo) | La foto de la escala (`camino.ts`) |

**Con casos de uso**: cada actividad de la biblioteca dice qué artefacto de Nexus la acelera (`docs/actividades-plan.md`
lo decidió). Cuando una tarea que nació de una actividad entra en la semana, Nexus propone el artefacto con la plantilla
del caso. Esto espera a que la biblioteca de actividades exista (área A del roadmap).

### 2.8 Etapa futura: las plantillas del equipo (solo descrita)

Elías la va a iterar con Alex Vanegas; no se construye ahora. Lo que tendría: guardar un artefacto «a medida» que
funcionó como plantilla con nombre («Kickoff de SmartLoop para retail»), que el equipo la vea en el selector, que
quien lidera Customer Success la marque recomendada, y que una plantilla solo pueda elegir secciones del catálogo de su
tipo (la misma validación del armador). Su storage sería una tabla `PlantillaDelEquipo` con la lista de secciones y las
instrucciones; el contenido de los documentos no cambiaría de lugar.

---

## 3. Las etapas, en orden

Cada etapa se puede desplegar sola y se puede volver atrás sin tocar datos de clientes. Las pruebas de unidad van bajo
`lib/` (si no, no corren).

### Etapa 1 · La escala única (la construye `escala-unica`)

- **Qué**: la escala de rendimiento pasa a ser el primer artefacto compartido entre la preventa y los clientes, uno por
  empresa.
- **Terminado, pruebas, SQL y vuelta atrás**: los de `docs/escala-unica-plan.md`. **Ese plan no estaba commiteado el
  28 oct**; cuando esté, este punto se completa copiando su criterio. Lo que esta área le pide: que la escala quede
  registrada como un tipo (`escala`, una por empresa, dueño `clientId`) cuando exista el registro de la etapa 2, sin
  mover su storage.

### Etapa 2 · El registro de tipos y el catálogo de secciones

- **Qué**: `lib/artefactos/tipos.ts` (cada tipo con su catálogo, sus estructurales, cuántas copias admite y de quién
  puede ser) y `lib/artefactos/catalogo.ts` (lo arma de las defs; no repite nada). Puro, sin SQL, **sin cambio
  visible**.
- **Terminado cuando**: cada pieza de hoy con documento es un tipo; cada plantilla de `ENTREGABLES` es una plantilla de
  su tipo; el catálogo de cada tipo coincide con las defs.
- **Pruebas** (`lib/artefactos/tipos.test.ts`): (1) cada key del catálogo resuelve una def con componente; (2) cada
  plantilla solo usa keys de su catálogo; (3) portada y cierre están en toda plantilla; (4) kickoff, cronograma,
  exploración y handoff admiten una copia; (5) snapshot del catálogo (cambiarlo es decisión de producto, como
  `registry.test.ts`). La suite y `tsc` en 0.
- **Vuelta atrás**: revertir el commit. Nadie lo lee todavía.

### Etapa 3 · Varias copias de un tipo (planificación y diagnóstico primero)

- **Qué**: el `.sql` de 2.4; «+ Otra planificación» y «+ Otro diagnóstico» en el riel, con el selector de plantilla de
  siempre y un título; el riel agrupa las copias debajo de su tipo; el panel abre una copia por id con el renderer de
  su tipo (`tipoDelDocumento`); generar, regenerar, «Mejorar con IA», el contexto adicional (reuniones elegidas en
  `ReunionDelDocumento`, notas con `canvasId`), las versiones y el PDF funcionan por id; archivar una copia
  (`archivadoEn`) la saca del riel sin borrarla.
- **Terminado cuando**: en un proyecto de prueba hay 3 planificaciones, cada una con su título, su plantilla, sus
  reuniones elegidas y su contenido, y **la principal no cambió en nada** (mismo id, mismo contenido, misma vista
  externa).
- **Pruebas**:
  1. Unidad: `tipoDelDocumento`; el riel con 3 copias del mismo tipo muestra 3 filas y la principal primero; una copia
     no puede tener slug (la regla en código y el CHECK).
  2. Integración (`nexus_test`): las 105 búsquedas por tipo, representadas por `canvasOf("planning")`, devuelven la
     principal con dos copias al lado; una reunión elegida para la copia A no aparece en la B ni en la principal;
     `ReunionDelDocumento` rechaza una reunión de otro proyecto.
  3. Escaneo: ninguna ruta nueva de copias busca por slug.
  4. INV nuevo en `check:invariants`: ninguna copia lee una reunión que el chokepoint no da como de su proyecto, y
     ninguna copia tiene slug.
  5. Prueba con datos reales en la base local (`db:local:pull` de FACO): 3 planificaciones, una generada con cada
     plantilla; medir caracteres de entrada y segundos.
- **SQL**: `scripts/sql/AAAA-MM-DD-artefactos-copias.sql` (2.4), antes del deploy; `npm run check:esquema` lo confirma.
- **Vuelta atrás**: apagar «+ Otra…» (una constante). Las copias que existan quedan archivadas con un script
  (`scripts/archivar-copias.ts`, simulacro primero). Las columnas y la tabla se quedan: son aditivas y sin lectores
  viejos.

### Etapa 4 · El área para compartir de cada copia

- **Qué**: «Compartir» en cada copia: crear el enlace, publicar la foto, ver cuándo se abrió, dejar de compartir. INV64
  enmendado (2.6) y la puerta de los documentos de la empresa con el caso «de un proyecto».
- **Terminado cuando**: una copia de planificación se abre por su enlace con lo oculto filtrado y la frontera de su
  tipo; revocar la cierra; la principal sigue con su enlace de siempre.
- **Pruebas**: (1) INV64 nuevo: ningún enlace abre un documento de otra empresa, ni de un proyecto de otra empresa;
  (2) un enlace de una copia no abre la principal ni otra copia; (3) la vista externa no muestra nada de lo que la
  frontera de su tipo saca (prueba con una sección interna); (4) una copia de un tipo interno no ofrece compartir.
- **SQL**: ninguno (`AccesoAlDocumento` ya existe con `canvasId @unique`).
- **Vuelta atrás**: un script revoca todos los enlaces de copias (`revokedAt`), y la puerta vuelve a rechazar los
  documentos de proyecto.

### Etapa 5 · Crear desde un pedido

- **Qué**: la caja «¿Qué necesitas?» y `documento.crear` en el chat; el armador (2.5) con sus tres respuestas; la
  confirmación en `<AgentProposal>`; la plantilla «a medida»; la estimación de salida por sección
  (`salidaEstimada` en el catálogo).
- **Terminado cuando**: con los pedidos de Elías («tengo de frente una presentación de diagnóstico», «ocupo un consenso
  del proceso comercial», «necesito explorar mejor marketing», «ocupo un plan de adopción para los líderes») Nexus
  propone algo sensato en cada uno, con FACO en la base local; uno de ellos manda a la exploración en vez de crear.
- **Pruebas**: (1) unidad del validador: un tipo inexistente, una key ajena, sin portada, un segundo kickoff y una
  `ctxDriven` repetida se rechazan; (2) regenerar una copia «a medida» usa las mismas secciones; (3) el armador recibe
  solo artefactos y reuniones del proyecto (escaneo de que pasa por el chokepoint); (4) una tanda de 12 pedidos reales
  (los de la sesión `analisis-artefactos`) corrida en local, con el resultado revisado por Elías: **esta es la prueba de
  criterio**.
- **SQL**: ninguno (usa el de la etapa 3).
- **Vuelta atrás**: apagar la caja y la operación del chat. Lo creado son copias como las de la etapa 3.

### Etapa 6 · Los tipos nuevos

- **Qué**: los tipos y plantillas de `docs/artefactos-sugeridos.md` (**pendiente de ese análisis**). Cada tipo nuevo es:
  su entrada en el registro, su `agentIntro` y su tope, las secciones prestadas movidas a `shared-sections.defs.ts`, y
  su plantilla recomendada. Mientras llega la lista: plan de adopción, consenso del proceso comercial y presentación de
  diagnóstico, en ese orden.
- **Terminado cuando**: cada tipo nuevo se crea a mano y desde un pedido, se genera, se comparte y sale en PDF.
- **Pruebas**: las de la etapa 2 sobre el tipo nuevo; mover una sección a `shared-sections` no cambia el golden
  (`build-landing.test.ts`) de los tipos de donde sale; una corrida real por tipo con su costo.
- **SQL**: ninguno (el tipo es código).
- **Vuelta atrás**: sacar el tipo del registro; sus copias quedan archivadas (mismo script).

### Etapa 7 · La recomendación

- **Qué**: las cuatro señales sin casos de uso (2.7) en el «Qué sigue» del proyecto, con el pedido ya escrito
  («Presentación de diagnóstico para el jueves») para que un clic abra el paso 2 del armador; el destino «documento
  pedido» en la lectura de cada reunión. Con casos de uso, cuando exista la biblioteca de actividades.
- **Terminado cuando**: en la base local con 10 clientes reales, las propuestas que salen las mira Elías y dice si
  alguna sobra.
- **Pruebas**: unidad de cada señal (una reunión «Presentación de diagnóstico» con el diagnóstico publicado no
  propone); «Ahora no» no vuelve a proponer lo mismo; un excliente no recibe propuestas; ninguna propuesta crea nada.
- **SQL**: probablemente ninguno («Ahora no» puede vivir donde hoy viven los del «Qué sigue»; se confirma al
  construir).
- **Vuelta atrás**: apagar la señal en el «Qué sigue».

### Etapa 8 (futura) · Las plantillas del equipo

Descrita en 2.8. Espera a que Elías la itere con Alex Vanegas.

### Relación con el roadmap de hoy

- **I · Varias plantillas de diagnóstico y planificación**: I1 (selector en cada entregable) se cumple con las etapas 2
  y 3; I3 (plantillas por caso de uso) pasa a ser plantillas de esta área y sigue esperando a A0 y J1.
- **J · Definir contigo los entregables**: la tabla de J1 (qué necesita cada entregable, de dónde sale, qué escribe
  Nexus) es la que alimenta `salidaEstimada` y las plantillas recomendadas.
- **A · La biblioteca de casos de uso y sus actividades**: la recomendación con casos de uso (etapa 7) depende de ella.

## 4. Riesgos

- **Una copia que pierde la frontera** muestra lo interno al cliente. Por eso la frontera, la impresión y el assist se
  resuelven por `tipoDelDocumento` y lo prueba la etapa 4 con una sección interna.
- **`ProjectCanvasPanel.tsx` tiene 26 comparaciones por slug** y 1.364 líneas (deuda §12 ítem 10). Tocarlo para las
  copias es el trabajo más delicado de la etapa 3; conviene sacar el renderer por tipo a un mapa antes.
- **Muchas copias confunden**: el riel agrupa por tipo, muestra la principal primero y archiva lo viejo.
- **El armador elige mal**: siempre hay confirmación con por qué, y la tanda de 12 pedidos reales es la vara.
- **Varios lectores siguen leyendo solo la principal** (entrega, escala, servicio recurrente, procesos). Está bien a
  propósito, pero hay que decirlo en pantalla: «Esta es la planificación principal: la que lee la entrega».

## 5. Preguntas para Elías

1. **Cuando un proyecto tenga tres planificaciones, ¿cuál es la «oficial»?** La que lee la entrega, la escala y el
   servicio recurrente. Te propongo: la primera que existió, con un botón para cambiarla.
2. **¿Cómo se comparte una copia con el cliente?** Te propongo: con su propio enlace, sin contraseña, como la propuesta
   y los documentos de la empresa (el enlace es el secreto y se puede revocar). La otra opción es que quede detrás de la
   contraseña del proyecto, junto al kickoff y el cronograma.
3. **¿El kickoff sigue siendo uno por proyecto?** Hoy está decidido así (se presenta una vez). Igual la exploración: una
   viva por proyecto, y «explorar mejor marketing» se resuelve sumando sesiones con Marketing. ¿Lo dejamos así?
4. **¿Qué artefactos pueden ser de la empresa entera, sin proyecto?** Hoy solo el diagnóstico (para un prospecto) y la
   escala. ¿Sumamos otros, por ejemplo un consenso del proceso comercial antes de vender?
5. **¿Por cuál tipo nuevo empezamos?** Te propongo el plan de adopción, después el consenso del proceso comercial y
   después la presentación de diagnóstico (salvo que el análisis de reuniones diga otra cosa).
6. **Al crear desde un pedido, ¿te muestro las secciones antes de llenarlas?** Te propongo que sí: un clic más, pero
   ves qué va a armar y por qué antes de gastar la corrida.
7. **Si el pedido pide algo que ningún tipo tiene, ¿Nexus lo arma con secciones libres o te dice que no hay?** Te
   propongo que lo diga y ofrezca armarlo libre; así sabemos qué tipos faltan.
8. **En pantalla, ¿se llaman «artefactos» o «documentos»?** El equipo hoy dice «documentos» en el riel.

## 6. Para el roadmap

**V · Artefactos: tipos, plantillas y varias copias** <span class="estado">Propuesta</span>

Plan: `docs/artefactos-plan.md`.

1. **V1 · La escala única.** La escala como el primer artefacto compartido entre la preventa y los clientes, una por
   empresa (sesión `escala-unica`, `docs/escala-unica-plan.md`).
2. **V2 · Los tipos y el catálogo de secciones.** Cada documento de hoy es un tipo con su lista de secciones, sacada de
   las que ya existen; sin cambio en pantalla. *Prueba:* la suite en verde con el registro congelado.
3. **V3 · Varias copias de un tipo.** «+ Otra planificación» y «+ Otro diagnóstico», cada una con su título, su
   plantilla y sus reuniones; la de hoy queda como la principal sin cambiar. SQL aditivo antes del deploy. *Prueba:* en
   un proyecto de FACO en local, 3 planificaciones; la principal igual que antes y su enlace de siempre abre lo mismo.
4. **V4 · Compartir cada copia.** Su enlace, su foto publicada y revocar. *Prueba:* el enlace de una copia abre solo esa
   copia, sin lo interno.
5. **V5 · Crear desde un pedido.** «¿Qué necesitas?»: Nexus propone el tipo y las secciones, tú confirmas y lo llena con
   el contexto del proyecto. *Prueba de criterio (Elías):* 12 pedidos reales corridos en local; dices cuáles armó bien.
6. **V6 · Los tipos nuevos.** Plan de adopción, consenso del proceso comercial, presentación de diagnóstico y lo que diga
   el análisis de reuniones (`docs/artefactos-sugeridos.md`).
7. **V7 · Nexus te propone un artefacto.** Por una reunión agendada, por lo que se dijo, por la etapa y por la escala; con
   casos de uso, cuando exista la biblioteca de actividades (A).
8. **V8 · Las plantillas del equipo** (futura, con Alex Vanegas).

**Criterio de éxito:** un CSE escribe lo que necesita y en un par de clics tiene el artefacto armado con las secciones
que aplican y lleno con el contexto de su proyecto; un proyecto puede tener varias copias de un tipo sin que cambie
nada de lo que ya existe; cada copia se comparte sola.
