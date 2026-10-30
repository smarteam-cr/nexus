# Artefactos: tipos, plantillas y varias copias — plan

> Estado: **V1 en producción. V2, V3, V4 y los dos primeros tipos nuevos (adelantados de V6) construidos el 2026-10-29**
> (rama `claude/artefactos-copias-d6c1b8`, sin desplegar; SQL `scripts/sql/2026-10-29-artefactos-copias.sql` antes del
> deploy). Elías respondió las ocho preguntas el 29 oct (§5): donde el plan proponía otra cosa, se corrigió en su lugar.
> Medido en el código el 2026-10-28 (rama `main` en `ff7daf0e`).
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
una **plantilla** o con las secciones que pide un pedido, que pertenece a **un proyecto** (o a la empresa), tiene **su
nombre, su lugar en el orden, su estado** (en construcción o terminado) y **su propio enlace para compartir**. No hay una
copia oficial (Elías, 29 oct): Nexus es el depósito de las que va creando el equipo, y quien lee un tipo —la entrega, la
escala, los agentes— lee **todas**, cada una con su nombre y su estado. El documento de hoy de cada tipo es una más:
conserva su `slug` como ancla técnica (lo buscan 105 lugares) y las copias nuevas viven en la misma tabla sin `slug`, así
que nada de lo que hoy busca «el diagnóstico del proyecto» cambia de respuesta.

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
- ~~**El kickoff se presenta una sola vez por proyecto**~~ (decisión 11 de `docs/nexus-sistema-de-trabajo-plan.md`).
  **Corregido por Elías el 29 oct** (respuesta 6): «si tenemos una desalineación con un cliente, o cambia algún acuerdo,
  podemos hacer otro kickoff». El kickoff admite copias; el de siempre sigue siendo el que se publica por la contraseña
  del proyecto y el que re-ancla el cronograma.
- **El cronograma es uno por proyecto** (`ProjectTimeline.projectId @unique`).
- **Una exploración viva por proyecto** (el lienzo con sus sesiones por equipo, DECISIONS «Las exploraciones por
  equipo») se queda como está. **Pero la exploración también admite copias** (Elías, 29 oct: «SmartLoop lleva una parte
  de diagnóstico, y para el diagnóstico casi siempre hay que explorar»): una copia es un documento de exploración del
  motor (lo que hay que entender, lo que ya sabemos, los supuestos, el plan de sesiones, a quién involucrar), interno.
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
| **Nombre** | «Planificación — Marketing», «Plan de adopción para líderes». Editable en cada copia, también en la de siempre. | Columna nueva `titulo`. Sin él, una copia se ve con su `name` y la de siempre con el nombre de su pieza (como hoy). |
| **Orden** | El que elige la persona, arrastrando, dentro de su tipo. | La columna `order` de siempre. |
| **Estado** | En construcción o terminado: quien lee lo pesa distinto. | Columna nueva `terminadoEn` (+ `terminadoPor`). |
| **Pertenencia** | Un proyecto (`projectId`), o la empresa (`clientId`) para los tipos que lo admiten. Nunca dos. | El CHECK de un solo dueño ya lo garantiza. |
| **Área para compartir** | Su enlace propio, su foto publicada, revocar. | `AccesoAlDocumento` (2.6). |

**Cuántas copias admite cada tipo** (la regla vive en el tipo, no en la base):

| Tipo | Copias por proyecto | Por qué |
|---|---|---|
| Planificación, Diagnóstico, Kickoff, Exploración, Plan de adopción, Integración técnica | **Varias** | Elías, 29 oct (respuestas 1 y 6). |
| Integraciones (el requerimiento técnico que nace del handoff), Entrega, Ejecución | **Una** (por ahora) | Su flujo nace del handoff o del cierre; otra integración es una **integración técnica**. |
| Cronograma | **Una** | `ProjectTimeline` es único por proyecto, y Tareas y Cobranza lo leen como tal. |
| Handoff | **Una** | Es el paso Ventas → CS. |
| Cuestionarios | **Varias** (ya hoy) | Sus propias tablas, sin cambio. |
| Escala | **Una por empresa** | Lo define `escala-unica`. |

**De la empresa entera, sin proyecto** (respuesta 7): el diagnóstico (ya existe), la escala (V1), la exploración y la hoja
de ruta de la cuenta. El registro (`lib/artefactos/tipos.ts › duenos`) ya lo declara; la exploración y la hoja de ruta de
la empresa son la etapa V9.

### 2.2 El documento de siempre y las copias, sin una oficial

**Corregido el 29 oct** (respuesta 1). El plan proponía una «copia principal», la que leían la entrega, la escala y el
servicio recurrente. Elías: «cuando uno crea una entrega o la escala, pueden leer todos los artefactos, cada uno con su
nombre. Los artefactos deberían estar en construcción o terminados, para que quien los lea lo tome en cuenta». Queda así:

- La regla técnica de convivencia no cambia: **el documento de siempre de un tipo tiene `slug`; las copias no lo tienen y
  llevan `tipoArtefacto`**. Ninguna fila de hoy se toca, y el índice único parcial `(projectId, slug)` no ve a las copias.
- **En pantalla son todas iguales**: cada una con su nombre, su lugar (arrastrando) y su estado. La de siempre no se
  rotula «principal» ni «oficial».
- **Los lectores leen todas** (`lib/artefactos/lectores-server.ts`). `loadCanvasContext` —por donde leen los agentes un
  documento de otro tipo— trae el de siempre y las copias, rotulados «Planificación — Marketing (terminado)», con lo
  terminado primero y una línea que le dice al modelo que lo en construcción es un borrador. **Con un solo documento del
  tipo, el texto es byte a byte el de antes.** Los lectores que necesitan un solo valor (la posición en la escala del
  diagnóstico, el desafío que retoma la entrega) toman el terminado más reciente; sin terminados, el primero del orden.
- Las búsquedas por tipo que deciden **a qué documento se le escribe** (generar el de siempre, publicar el kickoff,
  re-anclar el cronograma) siguen yendo al de siempre: escribir no es leer.
- Lo nuevo (abrir, generar, editar, compartir una copia) va **por id**. `tipoDelDocumento(canvas) = slug ?? tipoArtefacto`
  (`lib/artefactos/copias.ts`) dice su tipo, y **`pieceForCanvas` devuelve null para una copia**: así ningún botón de la
  pieza (generar, publicar, el contexto del tipo) le escribe al documento de siempre desde una copia.
- **Una copia nunca se llama como una pieza** (`nombreGuardableDeUnaCopia`): la lectura doble por nombre de
  `canvasOf` la confundiría con la de siempre. A «Kickoff» se le suma « · copia». Lo vigila una invariante.
- **Una copia no lleva las secciones que leen el proyecto** (`ctxDriven`: el cronograma y los procesos del kickoff, la
  estimación de integraciones), salvo la portada y el cierre: pintarían lo mismo en cada copia.

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

**La lista de tipos nuevos llegó** (`docs/artefactos-sugeridos.md`, 120 reuniones de 29 cuentas) y Elías eligió los dos
primeros el 29 oct (respuesta 3): el **plan de adopción** y la **integración técnica**. Ya están en el registro
(`lib/artefactos/tipos.ts`) con su catálogo (`lib/artefactos/catalogo.ts`) y sus defs:

| Tipo | Plantillas | Secciones (✱ prestadas de otro tipo, ✚ nuevas) |
|---|---|---|
| **Plan de adopción** (`adoption-plan`) | Equipo comercial (recomendada) · Organización por niveles · Componente técnico | ✚ portada · ✚ lo que se espera de cada rol (tabla) · ✚ lo que no se negocia · ✚ quién entra y cuándo (tabla) · ✱ rutinas de adopción · ✱ despliegue por olas · ✚ cómo se lo contamos al equipo (tabla) · ✚ quién administra el portal · ✚ altas y bajas de usuarios · ✚ cómo medimos la adopción (tabla) · ✚ cierre |
| **Integración técnica** (`integration`) | Mapa de integración (recomendada) · Integración completa | ✱ portada del requerimiento · ✚ alcance firmado (tabla) · ✱ qué duele hoy · ✱ arquitectura · ✚ identificador único entre sistemas (tabla) · ✚ **mapa de integración** (tabla: origen sistema·objeto·campo, propiedad de HubSpot, sentido, transformación, frecuencia) · ✱ relación entre objetos · ✱ propiedades y campos · ✱ momentos de sincronización · ✚ lo que debe entregar el cliente o un tercero (tabla) · ✱ cómo sabremos que funcionó · ✱ cierre |

**El mapa de integración** (Elías pidió validar que existiera): el tipo `tech-requirements` («Integraciones») lo tenía a
medias —arquitectura, relación de objetos y propiedades— y le faltaban la tabla de equivalencias campo a campo, el
identificador único, el alcance firmado y lo que debe entregar el cliente o un tercero. La integración técnica presta las
secciones del requerimiento (mismo renderer, mismo esquema) y suma esas cuatro. Las tablas nuevas usan el renderer
genérico `tabla` con las columnas sembradas: no hubo que construir componentes. Integraciones (el de siempre, el que
nace del handoff) no cambia. Los demás tipos del catálogo siguen en V6.

### 2.4 Lo que cambia en la base (todo aditivo)

**Lo que se aplicó en V3** (`scripts/sql/2026-10-29-artefactos-copias.sql`, se puede correr dos veces):

```sql
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "tipoArtefacto" TEXT;   -- el tipo, solo en las copias
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "titulo" TEXT;          -- el nombre que le pone una persona
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "terminadoEn" TIMESTAMP(3);  -- null = en construcción
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "terminadoPor" TEXT;
CREATE INDEX IF NOT EXISTS "ProjectCanvas_projectId_tipoArtefacto_idx" ON "ProjectCanvas" ("projectId", "tipoArtefacto");
-- una copia nunca tiene slug (CHECK NOT VALID, envuelto en DO $$ … $$)
```

*Lo que cambió del borrador:* `titulo` es el nombre que pone una persona a CUALQUIER documento (null = el de fábrica: una
copia se ve con su `name`, el de siempre con el de su pieza). No se reusó `name` porque hay documentos de siempre con un
`name` viejo que hoy no se muestra, y porque el `name` de una copia nunca puede ser el de una pieza (la lectura doble de
`canvasOf`). No hay `archivadoEn` (archivar escribe `disabledAt`, la columna de apagar una pieza, que ya filtran los
listados) ni `pedido` (llega con V5).

**Lo que queda para V3b** (las reuniones y notas elegidas por copia): hoy cada tipo tiene su columna de afinado en
`SessionProject` y sus notas en `NotaDeContexto.pieza`, así que **las copias de un tipo comparten las reuniones y notas
elegidas de ese tipo**; las instrucciones (`__doc.brief`) sí son de cada documento. V3b suma:

```sql
CREATE TABLE IF NOT EXISTS "ReunionDelDocumento" (
  "id" TEXT PRIMARY KEY, "canvasId" TEXT NOT NULL REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL REFERENCES "FirefliesSession"("id") ON DELETE CASCADE,
  "elegida" BOOLEAN NOT NULL, "porEmail" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  UNIQUE ("canvasId", "sessionId"));
ALTER TABLE "ReunionDelDocumento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotaDeContexto" ADD COLUMN IF NOT EXISTS "canvasId" TEXT REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE;
```

*Por qué una tabla:* con tres planificaciones, elegir una reunión para la de Marketing la elegiría para las otras dos. La
de siempre sigue usando su columna; las copias, la tabla, que solo acepta reuniones que el chokepoint da como del proyecto
del documento (se valida al escribir y lo vigila un INV nuevo). *Por qué no entró en esta tanda:* el «Contexto adicional»
de la Planificación lo está cambiando otra sesión el 29 oct.

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
  3. **No hay un tipo para eso**: **corregido el 29 oct** (respuesta 8). Nexus lo arma con las secciones que más se
     parezcan, del tipo más cercano y, si hace falta, con secciones libres; y dice en la propuesta que no hay un tipo
     para ese pedido (así sabemos qué tipos faltan).
- Se valida en código, no se confía: el tipo existe, cada key está en su catálogo, la portada y el cierre van siempre
  (una portada es la identidad del documento), ninguna `ctxDriven` dos veces, un tope de secciones por tipo, y el tipo
  admite otra copia (un segundo kickoff responde «ya tiene kickoff» y ofrece abrirlo).
- Costo estimado: Sonnet 4.6, unos 6.000 a 10.000 tokens de entrada y 1.000 de salida: menos de US$0,05. Sin búsqueda
  web. Sin medir.

**Paso 2 · La persona confirma** (Elías, 29 oct, respuesta 4: «mostrar las secciones antes de llenarlas»), en el marco de
siempre (`<AgentProposal>`): «Voy a crear *Plan de adopción para
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

Elías, 29 oct (respuesta 2): «cada copia, con su propio enlace. Muchas veces ese enlace lo usa Customer Success para
compartir la pantalla desde ahí».

- **Cada documento de un proyecto se comparte con su propio enlace** —las copias y también el de siempre—:
  `AccesoAlDocumento` (ya existía, uno por documento, token de 64 hex, `revokedAt`) y la página que ya existía
  `/external/documento/[token]`. Sin contraseña: el enlace es el secreto y se revoca.
- **Muestra el documento VIVO, no una foto**: sirve para compartir pantalla mientras se trabaja, y la foto
  (`publishedSnapshot`) del de siempre ya la usan los mecanismos de publicar del kickoff y de la planificación. Vivo =
  solo los bloques confirmados, sin lo oculto, sin las secciones que leen el proyecto ni las internas (la estimación),
  sin autor, fuentes ni estado de los bloques. Un documento archivado no abre. Los documentos de la empresa siguen con su
  foto, como hasta hoy.
- **INV64 enmendada**: un enlace vigente abre un documento de su empresa: de la empresa misma o de un proyecto de esa
  empresa, nunca de una propuesta. La vista lo vuelve a comprobar en cada render.
- **La frontera viaja con el tipo**: la vista externa y el PDF de una copia usan el adaptador de su tipo
  (`tipoDelDocumento`). Un tipo interno (`clientFacing: false`: la exploración) no tiene enlace.
- **Las superficies de siempre no cambian**: el kickoff, el cronograma y los demás siguen con la contraseña del proyecto
  y sus columnas `*PublishedAt`. Unificar las siete en este mecanismo sigue siendo un plan aparte (ARCHITECTURE §1-WEB
  punto 7).

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

### Etapa 2 · El registro de tipos y el catálogo de secciones — construida el 2026-10-29

- **Qué**: `lib/artefactos/tipos.ts` (cada tipo con lo que admite: cuántas copias, de quién puede ser, si lo lee el
  cliente, su celda, de qué «Contexto adicional» lee y sus plantillas) y `lib/artefactos/catalogo.ts` (el catálogo de
  cada tipo sale de las defs; no repite nada). Puro, sin SQL, sin cambio visible.
- **Pruebas** (`lib/artefactos/tipos.test.ts`): cada key de cada plantilla está en el catálogo de su tipo; portada y
  cierre en toda plantilla; qué tipos admiten copias; snapshot del catálogo por tipo; la plantilla de siempre de cada
  entregable es exactamente su template de siempre.

### Etapa 3 · Varias copias de un tipo — construida el 2026-10-29 (sin V3b)

- **Qué**: el `.sql` de 2.4; «Nuevo artefacto» al pie de las piezas del riel y «Crear otro…» en la barra de cada documento
  (tipo, plantilla, nombre, y empezar en blanco o duplicando otro del mismo tipo); el riel lista las copias junto a su
  tipo, en el orden de la persona; la barra de cada documento (el de siempre incluido) cambia el nombre, el estado y el
  orden (arrastrando); el editor de una copia (`ArtefactoWorkspace`) con «Generar con IA», «Mejorar con IA», versiones y
  PDF por id; archivar una copia (`disabledAt`) la saca del riel y de lo que leen los agentes, sin borrarla.
- **Tipos con copias**: planificación, diagnóstico, kickoff, exploración, plan de adopción, integración técnica.
- **Los lectores leen todas** (2.2).
- **Pruebas**: unidad del riel con 3 copias (juntas, en el orden de la persona, la de siempre una más; una copia llamada
  como su pieza no se confunde), del mensaje de generación y de `tipoDelDocumento`; integración (`copias.int.test.ts`):
  crear, duplicar, renombrar, ordenar, terminar y archivar sin tocar el documento de siempre, y `canvasOf("planning")`
  sigue devolviéndolo; lectores (`lectores.int.test.ts`): con uno solo, el texto de siempre; con dos, los dos rotulados.
  Invariante nueva de las copias en `check:invariants`.
- **SQL**: `scripts/sql/2026-10-29-artefactos-copias.sql`, antes del deploy; `npm run check:esquema` lo confirma.
- **Vuelta atrás**: quitar «Nuevo artefacto» y la barra (dos líneas del panel). Las copias que existan se archivan con un
  `UPDATE` de `disabledAt` sobre las filas con `tipoArtefacto`. Las columnas se quedan: son aditivas.

### Etapa 3b · Las reuniones y notas elegidas de cada copia (siguiente tanda)

- **Qué**: `ReunionDelDocumento` y `NotaDeContexto.canvasId` (2.4); el «Contexto adicional» en el editor de una copia.
  Hasta entonces las copias de un tipo comparten las reuniones y notas elegidas de su tipo.
- **Espera** a que se integre el cambio del «Contexto adicional» de la Planificación (otra sesión, 29 oct).
- **Pruebas**: una reunión elegida para la copia A no aparece en la B ni en la de siempre; la tabla rechaza una reunión
  de otro proyecto (chokepoint); INV nuevo.

### Etapa 4 · El enlace de cada documento — construida el 2026-10-29

- **Qué**: «Compartir» en la barra de cada documento de un tipo que lee el cliente: crear el enlace, copiarlo, abrirlo,
  ver cuándo se abrió por última vez, dejar de compartir. La vista es la del documento vivo (2.6). INV64 enmendada.
- **Pruebas** (`compartir.int.test.ts`): el enlace de una copia abre solo esa copia; revocar lo cierra; lo oculto, lo no
  confirmado y la estimación no salen; un acceso cruzado a un proyecto de otra empresa no abre; la exploración no se
  comparte; el documento de la empresa sigue abriendo con su foto.
- **SQL**: ninguno.

### Etapa 5 · Crear desde un pedido (siguiente tanda; queda lista la base)

- **Qué**: la caja «¿Qué necesitas?» y `documento.crear` en el chat; el armador (2.5) con sus tres respuestas, mostrando
  las secciones antes de llenarlas (respuesta 4) y armando con las más parecidas lo que no calza (respuesta 8); la
  plantilla «a medida».
- **Lo que ya está**: el catálogo de cada tipo con `tip`, `agentGenerated`, `ctxDriven` y `estructural`
  (`catalogoDelTipo`), la creación de una copia con secciones elegidas (`crearCopia` + `canvasDefDeUnaCopia`) y su
  generación por id. Falta: el armador, `salidaEstimada` por sección, la plantilla «a medida» en `__plantilla` y la
  pantalla.
- **Pruebas**: las de 2.5; la prueba de criterio es la tanda de pedidos reales que revisa Elías.

### Etapa 6 · Los tipos nuevos — los dos primeros construidos el 2026-10-29

- **Hechos**: plan de adopción (equipo comercial, organización por niveles, técnico) e integración técnica (mapa de
  integración, completa), §2.3. Se crean, se generan, se mejoran con IA, se comparten y salen en PDF.
- **Siguen**, por cuántas cuentas los piden (`docs/artefactos-sugeridos.md`): plan de capacitación, consenso de proceso
  (como plantilla de la planificación), registro de decisiones, catálogo de paneles, propuesta de siguiente paso,
  diccionario de datos, ficha de campaña…
- **Pruebas**: las de la etapa 2 sobre el tipo nuevo (registro congelado en `registry.test.ts` y `tipos.test.ts`); una
  corrida real por tipo con su costo, en local (pendiente: la hace quien lo pruebe con datos reales).

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

### Etapa 9 · Los artefactos de la empresa entera (respuesta 7)

- **Qué**: además del diagnóstico de la empresa (R3) y la escala (V1), la **exploración** y la **hoja de ruta de la
  cuenta** sin proyecto, en `/clients/[id]/documentos`, con el mismo mecanismo de copias y enlace. La hoja de ruta es un
  tipo nuevo (catálogo n.º 16).
- **Espera** a V3b (el contexto por copia) y a que la hoja de ruta tenga sus secciones decididas.

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
- **Los lectores leen todas las copias** (corregido el 29 oct): el riesgo pasa a ser el contrario, que un borrador a
  medio hacer pese como algo acordado. Por eso cada copia lleva su estado y el agente lee lo terminado primero, con la
  línea que le dice que lo en construcción todavía cambia. Y el texto crece con cada copia: si al medir pasa el tope de
  algún lector, se recorta lo en construcción primero.

## 5. Las respuestas de Elías (29 oct)

Las ocho preguntas del 28 oct, con lo que respondió. Mandan sobre lo que el plan proponía; donde decía otra cosa, se
corrigió en su lugar (§1.4, §2.1, §2.2, §2.5, §2.6) y quedó en DECISIONS («Artefactos: varias copias sin una oficial,
cada una con su enlace»).

1. **Varias copias, ninguna oficial.** «La idea es que un proyecto pueda tener tres planificaciones, que el usuario le
   pueda cambiar el nombre a cada una y arrastrarlas de arriba abajo: usar Nexus como un depósito de las planificaciones
   que va creando. Cuando uno crea una entrega o la escala, pueden leer todos los artefactos, cada uno con su nombre. Los
   artefactos deberían estar en construcción o terminados, para que quien los lea lo tome en cuenta.» → §2.2.
2. **Compartir:** cada copia con su propio enlace; CS lo usa para compartir pantalla. → §2.6 (enlace vivo).
3. **Los primeros tipos nuevos:** el plan de adopción y uno de integración técnica (CEMACO quiere integrar su ERP). → §2.3,
   adelantados de V6 a esta tanda.
4. **Crear desde un pedido:** mostrar las secciones antes de llenarlas. → §2.5, paso 2.
5. **En pantalla se llaman «artefactos».**
6. **El kickoff y la exploración no quedan amarrados a uno por proyecto.** «Si tenemos una desalineación con un cliente,
   o cambia algún acuerdo, podemos hacer otro kickoff. Lo mismo para la exploración.» → §1.4 y §2.1.
7. **De la empresa entera, sin proyecto:** el diagnóstico, la escala, la exploración y la hoja de ruta de la cuenta. →
   §2.1 y etapa V9.
8. **Un pedido que no calza con ningún tipo:** Nexus lo arma con las secciones que más se parezcan. → §2.5.

Además pidió **validar el mapa de integración**: estaba a medias en Integraciones; la integración técnica lo completa
(§2.3).

## 6. Para el roadmap

**V · Artefactos: tipos, plantillas y varias copias**

Plan: `docs/artefactos-plan.md`.

1. **V1 · La escala única.** En producción.
2. **V2 · Los tipos y el catálogo de secciones.** Construida el 29 oct, sin cambio en pantalla.
3. **V3 · Varias copias de un tipo.** Construida el 29 oct: planificación, diagnóstico, kickoff y exploración, cada copia
   con su nombre, su orden y su estado; los lectores leen todas. SQL aditivo antes del deploy.
4. **V3b · Las reuniones y notas elegidas de cada copia.** Siguiente tanda.
5. **V4 · El enlace de cada documento.** Construida el 29 oct: vivo, sin contraseña, sin lo interno.
6. **V5 · Crear desde un pedido.** Siguiente tanda (la base ya está).
7. **V6 · Los tipos nuevos.** Plan de adopción e integración técnica (con el mapa de integración) construidos el 29 oct;
   siguen los demás del catálogo.
8. **V7 · Nexus te propone un artefacto.**
9. **V8 · Las plantillas del equipo** (futura, con Alex Vanegas).
10. **V9 · Los artefactos de la empresa entera** (exploración y hoja de ruta de la cuenta).

**Criterio de éxito:** un CSE escribe lo que necesita y en un par de clics tiene el artefacto armado con las secciones
que aplican y lleno con el contexto de su proyecto; un proyecto puede tener varias copias de un tipo sin que cambie
nada de lo que ya existe; cada copia se comparte sola y quien la lee sabe si está terminada.
