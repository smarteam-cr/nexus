# Plan de Optimización y Refactorización de la Base de Datos

**Fecha del análisis:** 2026-09-04 · **Alcance:** `prisma/schema.prisma` (4.649 líneas, 110 modelos, 90 enums, 143 `@@index`, 0 `@map`) y sus consumidores en `app/`, `lib/`, `components/`, `scripts/`.
**Método:** lectura completa del schema + 4 auditorías de código en paralelo (identidad por email, arrays de ids y FKs suaves, deuda/deprecated, jsonb y consultas pesadas) + verificación manual de los hallazgos de mayor peso.
**Regla del documento:** nada de lo que sigue se ejecutó. Es diagnóstico y propuesta.

---

## 0. Veredicto ejecutivo — ¿vale la pena?

Contexto que manda sobre cualquier recomendación:

| Hecho | Consecuencia para el plan |
|---|---|
| **Una sola base (Supabase) = PROD**, compartida por 2 PCs. No hay DB de dev. | Cada paso de migración corre contra datos reales. Todo tiene que ser aditivo primero y reversible. |
| Política vigente: **schema SOLO aditivo, `db push` prohibido, DDL a mano en `scripts/sql/`** (RUNBOOK inv. #2, ARCHITECTURE Parte 0 cap. D). | Un "drop" hoy viola la política escrita. El plan propone una **ventana de DROP** formal en vez de saltarse la regla. |
| Volumen pequeño: ~138 proyectos activos, ~16k sesiones, 202 cobros, 347 facturas Odoo. | **Casi nada de esto es un problema de rendimiento hoy.** Es de integridad, de carga cognitiva y de fallos silenciosos. Las excepciones reales de performance están en §8. |
| `Project` se consulta en **263 sitios**; 123 de los 131 `find*` ya usan `select`. | Partir la tabla no ahorra bytes en el 94 % de las lecturas. Lo que ahorra es contención de escritura y confusión. |
| Hay ~30 tests que **pinean nombres de columnas** (`scope-coverage.test.ts`, `etapa-retirada.test.ts`, `catalog.test.ts`, `privacidad.test.ts`…) y 26 invariantes en `check-invariants.ts`. | Cualquier rename/mover columna rompe guardas a propósito. Es una red, no un obstáculo — pero fija el costo real de cada movimiento. |
| El schema tiene **cero `@map`/`@@map`**, y eso está documentado como activo: `migrate diff` es fiel nombre a nombre y evita un bug de enums mapeados de Prisma 7. | Renombrar "por debajo" con `@map` destruye esa propiedad. |

Con eso, el veredicto por antipatrón:

| # | Antipatrón | Real? | Vale la pena? | Por qué |
|---|---|---|---|---|
| 1 | God Table `Project` (97 columnas escalares) | Sí | **Parcial** | Extraer solo los 2 bloques con escritor único (alta, propuestas del agente). El bloque HubSpot (17 col.) es el corazón del derivador de tipo y tiene guarda de escritor único: moverlo hoy es riesgo sin retorno. |
| 2 | Auditoría por email (≈80 columnas) | Sí | **Una sí, el resto no** | `Project.hubspotOwnerEmail` decide **autorización** sin índice y con fuente externa: eso sí se arregla. La migración masiva a FK tropieza con sentinelas (`"sistema"`, `"cron"`, `"import:…"`), con 3 columnas de personas externas y con 83 sitios que estampan `AppUser.email` mientras las lecturas cruzan por `TeamMember.email`. Se fija la **regla hacia adelante** y se deja el histórico como texto. |
| 3 | Arrays de ids como FK falsas (9 campos) | Sí, 3 | **Sí** | 6 son ids de HubSpot (correcto que sean arrays). Los 3 internos tienen fallo silencioso hoy: `Agent.pinnedKnowledgeIds` (borrar un documento deja punteros muertos), `AgentRun.sourceSessionIds` (ídem con sesiones), `ComisionVendedor.cobroIds` (el freno 409 del revert se debilita sin aviso). Tres pivotes, bajo riesgo. |
| 4 | jsonb para estructuras relacionales (67 campos) | Sí, ~8 | **Escalares sí, tablas casi no** | 55+ son documentos legítimos. Lo que duele es leer jsonb para **filtrar**: `FirefliesSession.summary` (seq scan + parse de 16k filas en cada render de `/sessions`) y 5 casos más. Se resuelve materializando escalares —patrón que `ClientCsSignals` ya aplica— sin tablas nuevas, salvo `SnapshotCartera.metricas`. |
| 5 | Spanglish | Sí | **No** | Es una **decisión documentada** (DECISIONS § Cobranza: "naming en español a propósito, no corregir"). Renombrar 40 modelos rompe 553 archivos, `policies.sql` (nombres de tabla en texto) y la fidelidad de `migrate diff`. Lo que sí vale: una regla escrita de "un idioma por modelo" y corregir los 6 híbridos en trabajo nuevo. |
| 6 | Relaciones suaves (~30 columnas `*Id` sin `@relation`) | Sí | **4 sí, el resto no** | Todas las 122 relaciones declaradas ya tienen `onDelete` explícito (bien). De las suaves, 4 merecen FK dura porque hoy se limpian **a mano** en rutas de borrado y una ya causó "deja de facturar en silencio" (`hermanoCsProjectId`). ~12 son procedencia a `AgentRun` y ~8 son sueltas **a propósito y bien argumentadas** (`LlmCall`, `FacturaLiberada`, `TimelineEvent`). Lo que sí falta en casi todas: **índice**. |
| 7 | Deuda / deprecated | Sí | **Sí, con política** | Hay 2 fechas de drop (`2026-09-30`) que la política actual haría imposibles de cumplir. 9 columnas y 1 enum listos para caer; **5 tablas con cero referencias** en todo el repo; 3 comentarios del schema que afirman cosas falsas. |

**Recomendación en una línea:** no hacer "la gran refactorización". Hacer cinco tandas cortas y aditivas (§7) que cierran fallos silenciosos reales, y **formalizar una ventana de DROP** para que la deuda deje de ser perpetua. El costo total estimado es de 5 tandas del tamaño de las que ya se hacen; el retorno principal es integridad, no velocidad.

---

## 1. Diagnóstico del estado actual

### 1.1 `Project`: 97 columnas escalares en 12 preocupaciones distintas

Conteo por prefijo (solo escalares, sin relaciones):

| Bloque | Columnas | Escritor real | Lectores |
|---|---|---|---|
| Espejo HubSpot (`hubspot*`, `proyectoInterno`, `hubspotRelatedProjectIds`, `hermanoCsProjectId`) | 17 | **Uno solo**: `lib/hubspot/sync-projects.ts` (guardado por `scope-coverage.test.ts`) | `lib/projects/kind.ts`, `scope.ts`, cartera, cobranza, lifecycle, watchdog |
| Alta única (`alta*`) | 11 | `lib/projects/alta.ts` + `alta-runner.ts` | cartel de alta, INV14 |
| Salud (`healthStatusOverride*`, `healthProposed*`) | 8 | panel de cartera + watchdog | portfolio, CS360 |
| Sugerencias a HubSpot (`estadoPropuesto*`, `etapaPropuesta*`) | 8 | watchdog (`lib/cs/watchdog.ts`) | `estado-hubspot/route.ts` |
| Ciclo de vida (`lifecycle*`, `adoptionMode*`, `isSuccessCase`) | 8 | CSE via lifecycle | `lib/lifecycle` |
| Publicación al cliente (`kickoff/timeline/desarrollo/entregaPublishedAt`, `hiddenKickoffKeys`, `kickoffHorarioAssignments`, `procesosHiddenFromKickoff`) | 7 | CSE | chokepoints externos (`lib/external/*`) |
| GPS legacy + por frente (`nextSession*`, `salesNextSession*`, `csNextSession*`, `lastSessionSummary`, `pendingItems`) | 8 | `gps/route.ts` | `ProjectGPS.tsx`, `last-interaction.ts` |
| Retiradas / deprecated (`currentStage`, `currentStep`, `canvas`, `implementationType`) | 4 | nadie | `update-agent.ts` todavía lee `canvas` (ver §1.7) |
| Núcleo (id, clientId, name, status, projectType, serviceType, tags, shareToken, timestamps, `handoffGeneratedAt`) | ~12 | varios | todos |

Consecuencias observadas, no teóricas:

- **Contención de escritura**: `sync-projects` hace `update` de la fila entera mientras un CSE edita publicación o salud. Con 138 filas no es un problema de locks, pero sí de **`updatedAt` mentiroso**: cualquier sync toca `updatedAt` y ya no distingue "alguien editó el proyecto" de "HubSpot respiró".
- **`Project` no tiene ni un solo `@@index`**. Ni `clientId` (columna más filtrada del repo, ~50 sitios), ni `status`, ni `hubspotPipelineId`, ni `hermanoCsProjectId`. El baseline `0_init` solo tiene los dos `@unique` (`hubspotServiceId`, `shareToken`). Prisma **no** indexa FKs automáticamente en PostgreSQL.
- El schema documenta que `hermanoCsProjectId` sin FK produjo un bug real ("un desarrollo cuyo hermano se borró **deja de facturar en silencio**", líneas 344-349): se parchó nuleando a mano en la transacción de borrado + INV8. Eso es exactamente lo que `ON DELETE SET NULL` hace gratis.

### 1.2 Identidad por texto: ≈80 columnas, 2 con índice, 0 con FK

Inventario completo en el Anexo A. Lo relevante:

- **Cómo se escribe**: 83 sitios estampan `guard.user.email` → eso es **`AppUser.email`** (`lib/auth/api-guards.ts` → `requireUser()` en `lib/auth/supabase.ts:48`).
- **Cómo se lee**: los joins de vuelta van contra **`TeamMember.email`** (`lib/portfolio/load.ts:203`, `agent-runs/route.ts:69`, `lib/marketing/queries.ts:103`). Que ambos coincidan lo garantiza solo `lib/team/alta-de-miembro.ts:184-217` en aplicación; la base no lo exige.
- **El caso crítico**: `lib/auth/access.ts:92,173,215` decide si un CSE **puede ver un cliente** comparando `Project.hubspotOwnerEmail` (texto que viene de HubSpot, sin normalizar) contra `TeamMember.email` (lowercase). Sin índice y sensible a mayúsculas. `lib/portfolio/load.ts:207` sí hace `.toLowerCase()`; `access.ts` no.
- **Valores que no son personas** y que una FK rechazaría: `"sistema"` (`lib/cobranza/mutations.ts:204`, default de parámetro), `"cron"` (`SnapshotCartera.triggeredBy`), `"script:cargar-tipo-cambio"`, `"import:comisiones-2026"`, `"import:egresos-2026"`.
- **Personas externas** que jamás serán `TeamMember`: `BusinessCase.approvedByEmail/Name` (el prospecto aprueba dejando su correo), `FirefliesSession.organizerEmail` (Google), `ClientPartnerSnapshot.hsCsmEmail/hsGrowthEmail` (HubSpot).
- **Dos columnas muertas**: `KnowledgeDocument.createdByEmail/updatedByEmail` se escriben como `null` literal (`app/api/knowledge-docs/route.ts:66`, `[id]/route.ts:63`).
- El argumento del schema para no usar FK ("el historial sobrevive a la baja de una persona", `DevEstimate` l.493) **ya no aplica**: `TeamMember` tiene baja blanda (`deactivatedAt`) y `ProjectExternalAccess.createdById` ya demuestra el patrón correcto (`onDelete: SetNull`).

### 1.3 Arrays de ids

| Campo | Apunta a | Cómo se filtra | Limpieza al borrar el destino |
|---|---|---|---|
| `Agent.pinnedKnowledgeIds` | `KnowledgeDocument.id` | `in:` en `analyze/route.ts:1347` | **Ninguna.** `knowledge-docs/[id]/route.ts:78` hace `delete` duro. El filtro `status: PUBLISHED` esconde el hueco. |
| `AgentRun.sourceSessionIds` | `FirefliesSession.id` | `has:` en `sessions/[id]/page.tsx:83`, `in:` en `handoff/route.ts:113` | **Ninguna** (solo `purge-future-sessions.ts` los *protege*). |
| `ComisionVendedor.cobroIds` | `Cobro.id` | `has:` en `mutations.ts:615` (**freno 409 del revert**), `hasSome:` en `:2031` | **Ninguna**, y `generateCobros`/`deleteServicio` borran cobros. Existe INV26 para el caso gemelo `AlertaCobro.cobroId`; para éste no hay invariante. |
| `Client.ignoredHubspotServiceIds`, `Project.hubspotRelatedProjectIds`, `Handoff/BusinessCase.excludedEngagementIds`, `ContentIdea.hubspotDraftGuids`, `ClientPartnerSnapshot.associatedCompanyIds` | ids de **HubSpot** | filtros en memoria | N/A — son ids externos; array es correcto. |

Además, **no hay ni un índice GIN** sobre ninguna columna array, y sí hay filtros `has`/`hasSome` sobre dos de ellas.

### 1.4 jsonb: 67 campos, 8 que se leen para filtrar o agregar

Hecho estructural: el repo tiene **cero filtros Prisma `path:`** sobre Json. Todo filtrado de jsonb es o `$queryRaw` o JavaScript tras cargar filas completas.

| Campo | Dónde se filtra / agrega | Costo hoy |
|---|---|---|
| `FirefliesSession.summary` | `app/(shell)/sessions/page.tsx:71-79`: `$queryRaw` con `summary->>'overview'`, `jsonb_array_length(...)` **sobre toda la tabla en cada render**; también `session-candidates/route.ts:235` | Seq scan + parseo de ~16k jsonb por carga de `/sessions`. **Único caso de performance real del documento.** |
| `TimelineBaseline.firmness` | `lib/portfolio/load.ts:280,372`, `lib/cs/watchdog-context.ts:159`, `lib/portfolio/summary.ts:258` leen `.label` para cada proyecto de la cartera | JS sobre N proyectos |
| `ClientPartnerSnapshot.seats` | `lib/lifecycle/load.ts:342` (`seatsTotalFrom`), `watchdog.ts:538`, `planificacion-generate.ts:67` | JS; el modelo **ya materializa** `uusScore`, `mrrTotal`, `marketingContactsLimit` — falta terminar el patrón |
| `CanvasBlock.data` | `portfolio/load.ts:245`, `project-setup.ts:135`, `artifact-gate.ts:173` hacen `.nodes?.length` para "¿tiene procesos?" | Carga bloques completos para contar |
| `Audit.data` | `audits/page.tsx:17-35` selecciona `data` de **todas** las auditorías para sacar 4 números | Blob pesado por fila en un listado |
| `SnapshotCartera.metricas` | `ReportesPanel.tsx:378-425`, `CajaNetaPanel.tsx:161`, `reporte-finanzas.ts:117`, `queries.ts:650` caminan **toda la serie** buscando rutas fijas | Series de tiempo dentro de jsonb — el argumento que el propio schema da en `DevEstimate` (l.484) para no hacerlo |
| `SessionMinute.agreements/decisions/risks/topics` | `account-brief.ts:179`, `load-account.ts:148,244`, `meetings/route.ts:107` | JS; bajo volumen |
| `Project.kickoffHorarioAssignments` | No se filtra, pero `lib/kickoff/assign-horario.ts:67-79` necesita `SELECT … FOR UPDATE` porque dos escritores compiten por el mismo mapa | Lock de fila que una tabla `(projectId, sessionId)` haría innecesario |

**Legítimos y que deben quedarse en jsonb**: `RolePermission.permissions` / `TeamMember.permissionOverrides` (se leen enteros y cacheados en cada check de permiso; relacional = una query extra por autorización), todos los `publishedSnapshot`/`pendingProposal`/`snapshot` (documentos congelados), `CanvasBlock.data` como contenido, `ClientCsSignals.*` (ya sigue el patrón correcto), `HubspotAccount.portalSnapshot`, `RoleProfile.content`, `ImportacionFila.raw/canonico` (staging).

### 1.5 Spanglish

Tres zonas con idioma coherente y una franja híbrida:

- **Inglés**: núcleo (Client, Project, Timeline*, Canvas*, Agent*, Knowledge*, Session*, CS*, Marketing*, BusinessCase*).
- **Español a propósito**: Cobranza/Finanzas (`CuentaFinanciera`, `Cobro`, `CuotaPlan`, `PagoPlanilla`, `ComisionVendedor`, `EgresoMensual`…), Ventas (`VentaGanada`, `SicopLectura`), Chat (`HiloDeChat`, `MensajeDeChat`), Odoo (`FacturaOdoo`). DECISIONS § Cobranza: *"desviación deliberada de la convención inglesa — el dominio se opera en español … No 'corregir' a inglés"*.
- **Híbridos dentro de un modelo inglés**: `Project.hermanoCsProjectId`, `Project.proyectoInterno`, `Project.alta*`, `Project.estadoPropuesto*`, `Project.etapaPropuesta*`, `Particularidad` (modelo español colgado de `ProjectTimeline`), `AgentRun` sin híbridos, `TeamMember.area` (ok).

### 1.6 Relaciones suaves y `onDelete`

- 122 lados propietarios de relación; **todos** declaran `onDelete` (83 `Cascade`, 38 `SetNull`, 1 `Restrict`). Regla 7 de ARCHITECTURE §2 se cumple.
- ~30 columnas `*Id` internas sin `@relation`. Clasificación en Anexo B. Resumen:
  - **Deben ser FK** (hoy se limpian a mano en código o no se limpian): `Project.hermanoCsProjectId` → `Project` (SetNull), `Particularidad.convertedTaskId` → `TimelineTask` (SetNull), `FirefliesSession.manualClientId` y `resolvedClientId` → `Client` (SetNull; hoy `app/api/clients/[id]/route.ts:111-116` los nulea a mano).
  - **Sueltas a propósito y bien argumentadas** (dejar): `LlmCall.*` (libro de gasto no puede cascadear), `FacturaLiberada.cobroId/servicioId` (snapshot que sobrevive al regenerar), `TimelineEvent.timelineId/entityId` (cola con label denormalizado), `BusinessCaseSession.sessionId` ("la sesión puede no existir aún").
  - **Procedencia a `AgentRun`** (12 columnas `*RunId`): sueltas por costumbre, no por argumento. `AgentRun` no se borra (tiene estado `ARCHIVED`), así que una FK `SetNull` es segura pero de valor bajo. Prioridad mínima.
  - **Sin índice y en camino caliente**: `TimelineEvent.processedByRunId` (claim atómico del watchdog, 5 sitios), `AlertaCobro.cobroId` (`in:` + INV26), `Project.hermanoCsProjectId`.

### 1.7 Deuda declarada y deuda no declarada

**Con fecha de vencimiento que la política actual impide cumplir:**

| Campo | Fecha | Refs reales | Estado |
|---|---|---|---|
| `Client.isProspect` | 2026-09-30 | 0 (solo comentarios) | Listo para DROP |
| `PrintJobToken.businessCaseId` | 2026-09-30 | dual-write + fallback en `lib/print/job-token.ts:54,81,85` | El TTL del token es 60 s: el fallback lleva semanas muerto. Quitar el dual-write y dropear. |

**Retiradas sin fecha:**

| Campo | Refs reales | Estado |
|---|---|---|
| `Project.currentStage`, `currentStep` | 0 (guarda `etapa-retirada.test.ts` lo afirma) | Listo para DROP; la guarda hay que retirarla con la columna |
| `Project.implementationType`, `BusinessCase.implementationType`, `enum ImplementationType` | 0 en columna (el JSON del agente sigue emitiendo la clave, pero se convierte en tag en `analyze/route.ts:2841`) | Listo para DROP; la guarda `catalog.test.ts` hay que ajustarla |
| `Project.canvas` | **2** — `lib/canvas/update-agent.ts:41,54` **todavía lo lee y se lo pasa al modelo** | El comentario del schema ("ya no se lee") es **falso**. Primero cortar el lector. |
| `Project.pendingItems` | por confirmar 0 lectores | Deuda #19 de ARCHITECTURE |
| `Project.procesosHiddenFromKickoff` | 0 | Listo para DROP |
| `Project.nextSessionDate/Note`, `lastSessionSummary` | **13 / 6 / 6 — ACTIVAS** en `gps/route.ts` y `last-interaction.ts` | Marcadas LEGACY pero vivas. Deuda #14 de ARCHITECTURE contradice el código. Decidir: o se retira el widget GPS legacy o se quita el LEGACY del comentario. |
| `CuentaFinanciera.terminosPago` | 26, todas de escritura/import/UI del wizard; **0 lectores en `engine.ts`** | Sacar del importador y del wizard antes de dropear |
| `CobranzaPlanOrigen.AUTO_HANDOFF` | 0 | Valor de enum muerto (quitar un valor de enum en PG es cirugía; dejar documentado) |
| `KnowledgeDocument.createdByEmail/updatedByEmail` | escritas como `null` | O se empiezan a poblar o se dropean |

**Tablas con CERO referencias en `app/`, `lib/`, `components/` y `scripts/`** (verificado por accessor de Prisma):

| Tabla | Creada | Lectura |
|---|---|---|
| `CorteTarjeta` | 2026-08 | Diseñada y nunca cableada |
| `AtribucionVenta` | 2026-08-17 | Diseñada (decide comisiones) y nunca cableada — **decidir si terminar o borrar**, no borrar a ciegas |
| `CobroFacturaOdoo` | 2026-09-02 | La mitad sin terminar del espejo Odoo (el sync escribe `FacturaOdoo` y `FacturaOdooCambio`, nunca el vínculo). Memoria del proyecto dice "falta emparejar 49 clientes a mano": probablemente **es trabajo pendiente, no muerto** |
| `ContentIdeaSource` | 2026-07 | Pivote idea↔post que el agente "nunca inventa" pero nadie escribe |
| `KnowledgeEmbedding` | 2026-03 | Tabla pgvector sin productor ni consumidor; su columna `embedding` vive fuera del schema |
| `AguinaldoPago` | 2026-08 | Solo un `.count()` en un script de inspección |

**Solo escritura, nunca lectura**: `VentaGanadaCambio`, `FacturaOdooCambio`, `FirefliesSession.manualClientSource`. Son bitácoras: escribir sin leer es aceptable *si* alguien las va a leer en un incidente; hoy no hay pantalla.

**Comentarios del schema que afirman cosas falsas** (arreglar aunque no se dropee nada):

1. l.245 `Project.canvas` "ya no se lee" → sí se lee (`update-agent.ts`).
2. l.1630 `TeamMember`: describe un campo `legacyRole` que **no existe** en el modelo.
3. `lib/agents/catalog.ts:14` dice que `AgentType.CANVAS_PROJECT` está "muerto" mientras `lib/canvas/update-agent.ts:43` lo consulta.
4. `BusinessCase.blocks` "(v1 — se elimina en la limpieza F7)": `BusinessCaseBlock` tiene CRUD completo y activo. O F7 se hace o el comentario se quita.
5. `HubspotAccount.audits/knowledge` "se eliminan en Fase 5": Fase 5 nunca llegó; `Audit` y `Knowledge` siguen con FK dual `accountId + clientId` (deuda #7 de ARCHITECTURE, declarada "hace meses").

### 1.8 Índices: lo que falta donde sí duele

Inventario completo en Anexo C. Modelos **sin ningún `@@index`**: `Project`, `Client`, `Audit`, `Knowledge`, `TeamMember`, `HubspotAccount`, `ClientDocument`, `ProjectParticipantSnapshot`, `CronJobState`, `ImportacionCobranza`, `TipoCambioMes`, `PartnerComercial`, `DiferenciaOdooAceptada`. Varios de ellos son singleton o de 1:1 con `@unique` y no importan; `Project`, `Client`, `Audit`, `Knowledge` sí.

Consultas que hoy pagan seq scan y son de camino caliente (detalle en §8): la cartera (`lib/portfolio/load.ts:108`), el listado de clientes, el watchdog (3 `groupBy` sobre `TimelineEvent` liderando por `processedAt`), el listado de corridas, la proyección de cobranza (`estado: {not: "COBRADO"}` no puede usar índice) y los tres crons de sesiones (`meet-sync`, `meet-enrichment`).

---

## 2. Propuesta de esquema refactorizado (antes / después)

Todo lo que sigue es **aditivo**: la columna o tabla nueva convive con la vieja hasta la Fase 4.

### 2.1 `Project` → dos satélites con escritor único

Criterio para extraer: bloque con **un solo escritor**, ciclo de vida propio y cero lectores en `lib/projects/kind.ts`/`scope.ts`. Cumplen: **alta** y **sugerencias del agente**. No cumple: el espejo HubSpot (17 columnas, guarda de escritor único, alimenta las 6 decisiones de `kind.ts`; moverlo obliga a reescribir `sync-projects`, `scope.ts`, `scope-coverage.test.ts` y INV8/INV9/INV10/INV14 al mismo tiempo).

**Antes** (fragmento de `Project`):

```prisma
model Project {
  // …
  altaEstado           String?
  altaPipelineElegido  String?
  altaInternoDeclarado Boolean?
  altaHermanoHsId      String?
  altaSinTratoMotivo   String?
  altaError            String?
  altaIntentos         Int       @default(0)
  altaUltimoIntentoAt  DateTime?
  altaIniciadaAt       DateTime?
  altaActorEmail       String?
  altaReclasificadoAt  DateTime?

  healthProposed         ProjectHealth?
  healthProposedReason   String?  @db.Text
  healthProposedAt       DateTime?
  healthProposedByRunId  String?
  estadoPropuesto        String?
  estadoPropuestoMotivo  String?  @db.Text
  estadoPropuestoAt      DateTime?
  estadoPropuestoByRunId String?
  etapaPropuestaStageId  String?
  etapaPropuestaMotivo   String?  @db.Text
  etapaPropuestaAt       DateTime?
  etapaPropuestaByRunId  String?
  // …
}
```

**Después:**

```prisma
model Project {
  // … (núcleo + espejo HubSpot + publicación + salud curada + ciclo de vida)
  alta        ProjectAlta?
  sugerencias ProjectSugerencia[]

  @@index([clientId])
  @@index([clientId, status])
  @@index([status, hubspotPipelineId])
  @@index([createdAt])
  @@index([hermanoCsProjectId])
}

/// El alta única (Tanda C): dos escrituras en dos sistemas y red entre ambas.
/// 1:1 y opcional: NULL = no nació por el alta (el 99 % viene del espejo).
/// Escritor único: lib/projects/alta.ts. Nadie más la toca.
model ProjectAlta {
  projectId        String    @id
  project          Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  estado           String // 'pendiente_crm' | 'pendiente_espejo' | 'listo'
  pipelineElegido  String?
  internoDeclarado Boolean?
  hermanoHsId      String?
  sinTratoMotivo   String?
  error            String?
  intentos         Int       @default(0)
  ultimoIntentoAt  DateTime?
  iniciadaAt       DateTime  @default(now())
  reclasificadoAt  DateTime?
  actorId          String?
  actor            TeamMember? @relation(fields: [actorId], references: [id], onDelete: SetNull)
  actorEmail       String? // snapshot legible; ver §2.2
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([estado])
}

/// Lo que el agente PROPONE y el humano confirma. Una fila por (proyecto, eje);
/// aceptar o descartar la BORRA. Reemplaza healthProposed*, estadoPropuesto*, etapaPropuesta*.
model ProjectSugerencia {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  eje       ProjectSugerenciaEje
  valor     String // ProjectHealth | hs_status | hs_pipeline_stage id, según el eje
  motivo    String?  @db.Text
  runId     String?
  run       AgentRun? @relation(fields: [runId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())

  @@unique([projectId, eje])
  @@index([eje, createdAt])
}

enum ProjectSugerenciaEje {
  SALUD
  ESTADO_HUBSPOT
  ETAPA_HUBSPOT
}
```

Qué gana: `Project` baja de 97 a ~74 columnas; el watchdog deja de hacer `project.update` para proponer (contención con `sync-projects` cero); "¿hay sugerencias pendientes?" es un `count` indexado en vez de tres `OR … IS NOT NULL`.

Qué **no** se toca en esta vuelta y por qué: espejo HubSpot (arriba), salud curada y lifecycle override (los lee `lib/portfolio` en cada fila y son 2 columnas cada uno: no compensa), publicación (4 `*PublishedAt` son gates de seguridad leídos por chokepoints externos en cada request; moverlos a un satélite mete un join en cada lectura externa).

### 2.2 Identidad: FK hacia adelante, texto hacia atrás

**El caso que sí se migra**: autorización.

```prisma
// Antes
model Project {
  hubspotOwnerId    String?
  hubspotOwnerName  String?
  hubspotOwnerEmail String? // lo compara lib/auth/access.ts contra TeamMember.email
}

// Después (aditivo; las tres columnas viejas siguen para el display)
model Project {
  hubspotOwnerId           String?
  hubspotOwnerName         String?
  hubspotOwnerEmail        String?
  hubspotOwnerTeamMemberId String?
  hubspotOwnerTeamMember   TeamMember? @relation("OwnedProjects", fields: [hubspotOwnerTeamMemberId], references: [id], onDelete: SetNull)

  @@index([hubspotOwnerTeamMemberId])
}
```

`sync-projects` resuelve el id al escribir (`TeamMember.findUnique({ where: { email: ownerEmail.toLowerCase() } })`, que ya es `@unique`); `access.ts` compara `hubspotOwnerTeamMemberId = tm.id`. Se elimina de un golpe el bug latente de mayúsculas y el seq scan en el camino de autorización.

**La regla hacia adelante** (para toda tabla nueva y para los satélites de §2.1):

```prisma
// Patrón "actor": FK nullable + snapshot textual + discriminador de sistema.
actorId    String?
actor      TeamMember? @relation(fields: [actorId], references: [id], onDelete: SetNull)
actorEmail String?  // snapshot legible: sobrevive a un rename y sirve al PDF
actorTipo  ActorTipo @default(HUMANO)

enum ActorTipo { HUMANO SISTEMA IMPORTACION SCRIPT }
```

Y un helper único `lib/auth/actor.ts` que devuelve `{ teamMemberId, email, tipo }` desde el guard, reemplazando los 83 `guard.user.email` sueltos **a medida que se toque cada archivo**, no en una tanda.

**Lo que se deja como texto, con justificación**:
- Las ~75 columnas históricas de Cobranza/Timeline/CS. Las lee la UI como texto, las citan 26 invariantes por nombre, y su valor forense es el email tal cual se escribió.
- `BusinessCase.approvedByEmail/Name`, `FirefliesSession.organizerEmail`, `ClientPartnerSnapshot.hsCsm*/hsGrowth*`: personas externas.
- Se agrega **un invariante nuevo** (INV27): todo valor de columna de identidad o matchea `TeamMember.email` (case-insensitive) o matchea `^(sistema|cron|script:|import:)`. Convierte la deriva silenciosa en un aviso.

### 2.3 Arrays internos → pivotes

```prisma
// Antes
model Agent    { pinnedKnowledgeIds String[] @default([]) }
model AgentRun { sourceSessionIds   String[] @default([]) }
model ComisionVendedor { cobroIds  String[] @default([]) }

// Después
model AgentPinnedKnowledge {
  agentId    String
  agent      Agent             @relation(fields: [agentId], references: [id], onDelete: Cascade)
  documentId String
  document   KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)
  order      Int               @default(0)
  @@id([agentId, documentId])
  @@index([documentId])
}

model AgentRunSession {
  runId     String
  run       AgentRun         @relation(fields: [runId], references: [id], onDelete: Cascade)
  sessionId String
  session   FirefliesSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@id([runId, sessionId])
  @@index([sessionId]) // reemplaza el `has:` de sessions/[id]/page.tsx:83
}

/// ⚠ Restrict a propósito: una comisión LIQUIDADA es plata que salió. Borrar el cobro que
/// la produjo debe FALLAR, no debilitar el freno 409 en silencio. Hoy `generateCobros`
/// borra cobros sin mirar esto — con Restrict, el motor tiene que saltarlos explícitamente.
model ComisionVendedorCobro {
  comisionId String
  comision   ComisionVendedor @relation(fields: [comisionId], references: [id], onDelete: Cascade)
  cobroId    String
  cobro      Cobro            @relation(fields: [cobroId], references: [id], onDelete: Restrict)
  @@id([comisionId, cobroId])
  @@index([cobroId])
}
```

`ComisionVendedorCobro` con `Restrict` es una **decisión de negocio** (¿puede regenerarse un plan cuyos cobros ya comisionaron?). Si la respuesta es "sí, y la comisión queda como histórico", va `SetNull` sobre una columna nullable + `cobroSnapshot Json`. El schema ya tomó la postura "PAGADO es intocable" para `PagoPlanilla`; `Restrict` es coherente con eso.

### 2.4 jsonb → escalares materializados (sin tablas nuevas salvo una)

```prisma
model FirefliesSession {
  summary           Json?
  hasSummaryContent Boolean  @default(false) // lo escribe el enriquecimiento; reemplaza el $queryRaw de /sessions
  hasTranscript     Boolean  @default(false) // reemplaza `transcript: {not: null}` sobre 16k blobs
  @@index([hasSummaryContent])
}

model TimelineBaseline {
  firmness        Json
  firmnessLabel   String? // WEAK | MEDIUM | FIRM
  firmnessPct     Int?
  taskCount       Int?
  needsValidation Int?
}

model ClientPartnerSnapshot {
  seats          Json?
  seatsTotal     Int?
  seatsAvailable Int?
}

model CanvasBlock {
  data      Json?
  nodeCount Int? // solo FLOWCHART; null en el resto
}

model Audit {
  data           Json?
  totalContacts  Int?
  totalCompanies Int?
  totalDeals     Int?
  insightCount   Int?
}

/// La única tabla nueva de este eje: la serie de tiempo de la cartera dejó de ser navegable
/// dentro de un Json. Una fila por (corte, moneda); `metricas` queda como respaldo crudo.
model MetricaCartera {
  id           String          @id @default(cuid())
  snapshotId   String
  snapshot     SnapshotCartera @relation(fields: [snapshotId], references: [id], onDelete: Cascade)
  moneda       CobranzaMoneda
  totalCartera Decimal @db.Decimal(14, 2)
  totalVencido Decimal @db.Decimal(14, 2)
  totalPorCobrar Decimal @db.Decimal(14, 2)
  cobradoMes   Decimal @db.Decimal(14, 2)
  // … el resto del shape MetricasCartera (lib/cobranza/engine.ts:1044) como columnas
  @@unique([snapshotId, moneda])
  @@index([moneda, snapshotId])
}
```

`Project.kickoffHorarioAssignments` → `KickoffHorarioAssignment(projectId, sessionId, optionId)` con `@@unique([projectId, sessionId])`: elimina el `FOR UPDATE` de `assign-horario.ts`. Prioridad baja; se lista para que quede decidido.

### 2.5 Relaciones suaves que pasan a duras

```prisma
model Project {
  hermanoCsProjectId String?
  hermanoCs          Project?  @relation("HermanoCs", fields: [hermanoCsProjectId], references: [id], onDelete: SetNull)
  desarrollosHijos   Project[] @relation("HermanoCs")
}

model Particularidad {
  convertedTaskId String?
  convertedTask   TimelineTask? @relation(fields: [convertedTaskId], references: [id], onDelete: SetNull)
}

model FirefliesSession {
  manualClientId   String?
  manualClient     Client? @relation("SesionesManuales",  fields: [manualClientId],   references: [id], onDelete: SetNull)
  resolvedClientId String?
  resolvedClient   Client? @relation("SesionesResueltas", fields: [resolvedClientId], references: [id], onDelete: SetNull)
}
```

Con eso, `app/api/clients/[id]/route.ts:111-116` y `app/api/clients/[id]/projects/[projectId]/route.ts:85-86` dejan de nulear a mano (se conservan INV2 e INV8 como vigilancia, no como reparación).

Índices sobre suaves que **se quedan suaves**: `TimelineEvent(processedAt, processedByRunId)`, `AlertaCobro(cobroId)`, `LlmCall(projectId, at)`, `LlmCall(clientId, at)`.

### 2.6 Nomenclatura: regla, no rename

Se propone agregar a ARCHITECTURE §2 (regla 4):

> **Un idioma por módulo, y un idioma por modelo.** El núcleo (Client/Project/Timeline/Canvas/Agent/Session/CS/Marketing/BusinessCase) es inglés. Cobranza, Finanzas, Ventas, Chat y Odoo son español (DECISIONS). Un campo nuevo adopta el idioma de su modelo; si el concepto es del otro dominio, va en una tabla del otro dominio (p. ej. `ProjectAlta` es español porque el alta es un proceso del negocio, y cuelga de `Project` en inglés — eso es aceptable; `Project.altaEstado` no lo es).

Los 6 híbridos actuales (`Project.hermanoCsProjectId`, `proyectoInterno`, `alta*`, `estadoPropuesto*`, `etapaPropuesta*`) se resuelven **solos** con §2.1 (dos bloques se van a satélites en español). `hermanoCsProjectId` y `proyectoInterno` se quedan: son las columnas de clase con guarda de escritor único y renombrarlas rompe 4 invariantes por cero ganancia.

**No usar `@map`**: la fidelidad nombre a nombre de `migrate diff` es la única herramienta de detección de drift entre las 2 PCs.

---

## 3. Evaluación de impacto en TypeScript y consultas activas

| Cambio | Rompe compilación? | Sitios | Cómo se detecta |
|---|---|---|---|
| Satélite `ProjectAlta` | **Sí** (todo `select: { altaEstado: true }` y `data: { alta* }`) | ~18 refs en 8 archivos (`lib/projects/alta*.ts`, `alta-runner.ts`, cartel, INV14) | `tsc` + `check:invariants` |
| Satélite `ProjectSugerencia` | **Sí** | `lib/cs/watchdog.ts:235,241`, `health/route.ts:75`, `estado-hubspot/route.ts`, componentes de cartera que muestran la propuesta | `tsc` |
| `hubspotOwnerTeamMemberId` | No (aditivo) hasta que `access.ts` cambie; entonces sí en `verify-cse-scoping.ts:32` | 4 sitios | `tsc` + tests de `lib/auth/access.test.ts` |
| Pivotes de arrays | **Sí** en cada `has:`/`in:`/`push` | `pinnedKnowledgeIds` 4 sitios · `sourceSessionIds` ~10 · `cobroIds` 5 | `tsc` |
| Escalares jsonb | **No** (aditivo); el código viejo sigue leyendo el Json hasta que se migre | — | ninguno; smoke manual |
| FKs duras sobre suaves | **No** en tipos; **sí** puede fallar el DDL si hay huérfanos | INV2/INV8 ya los miden | correr `check:invariants` ANTES del `ALTER TABLE … ADD CONSTRAINT` |
| DROP de deprecated | **Sí** en las guardas que afirman su ausencia (`etapa-retirada.test.ts`, `catalog.test.ts`) | 2 tests | `vitest` |
| Índices | No | — | `EXPLAIN` antes/después |

Tests que leen el texto del schema y hay que revisar con cualquier cambio: `lib/asistente/contexto.test.ts`, `lib/asistente/hilo.test.ts`, `lib/delivery/privacidad.test.ts`, `lib/timeline/desviacion-cerrada.test.ts`, `lib/projects/scope-coverage.test.ts`, `lib/projects/etapa-retirada.test.ts`, `lib/tags/catalog.test.ts`.

Riesgo transversal: el `AgentRun.output` y los prompts de agentes sembrados en DB citan nombres de columna (`implementationType` en el JSON del agente). Un DROP de columna no rompe un prompt, pero un rename de clave JSON esperado por el agente sí. Ninguno de los cambios propuestos toca claves de salida del agente.

---

## 4. Estrategia de migración zero-downtime

Adaptada al flujo **real** del repo (ARCHITECTURE Parte 0 cap. D): SQL aditivo a mano → `migrate diff` como detector de drift → `ALLOW_PROD_WRITE=1 npx prisma db execute` contra `:5432` → `prisma generate` → deploy → `check:invariants`. Lo único que el plan **agrega** al flujo es la Fase 4 (ventana de DROP), hoy inexistente.

Orden de cada cambio, siempre: **SQL antes que código; código que escribe ambos lados antes que código que lee el nuevo; lector nuevo un deploy completo antes de dropear el viejo.**

### Fase 1 — Adición sin romper (un `.sql` por tanda)

Todo nullable o con default; PROD con el código viejo no nota nada.

```sql
-- scripts/sql/2026-09-XX-fase1-indices-project.sql
-- ⚠ CONCURRENTLY no corre dentro de una transacción: un statement por archivo,
--    o ejecutarlo con psql -c. `prisma db execute --file` envuelve el archivo en una sola
--    transacción cuando tiene varios statements.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_clientId_idx"            ON "Project"("clientId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_clientId_status_idx"     ON "Project"("clientId", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_status_pipeline_idx"     ON "Project"("status", "hubspotPipelineId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_createdAt_idx"           ON "Project"("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Project_hermanoCsProjectId_idx"  ON "Project"("hermanoCsProjectId");
```

```sql
-- scripts/sql/2026-09-XX-fase1-satelites.sql
CREATE TABLE "ProjectAlta" (
  "projectId"        TEXT PRIMARY KEY REFERENCES "Project"("id") ON DELETE CASCADE,
  "estado"           TEXT NOT NULL,
  "pipelineElegido"  TEXT, "internoDeclarado" BOOLEAN, "hermanoHsId" TEXT, "sinTratoMotivo" TEXT,
  "error"            TEXT, "intentos" INTEGER NOT NULL DEFAULT 0, "ultimoIntentoAt" TIMESTAMP(3),
  "iniciadaAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reclasificadoAt" TIMESTAMP(3),
  "actorId"          TEXT REFERENCES "TeamMember"("id") ON DELETE SET NULL,
  "actorEmail"       TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ProjectAlta_estado_idx" ON "ProjectAlta"("estado");
ALTER TABLE "ProjectAlta" ENABLE ROW LEVEL SECURITY;   -- regla: 100 % de public con RLS
-- (ProjectSugerencia + enum ProjectSugerenciaEje, mismo patrón)

ALTER TABLE "Project" ADD COLUMN "hubspotOwnerTeamMemberId" TEXT
  REFERENCES "TeamMember"("id") ON DELETE SET NULL;
CREATE INDEX "Project_hubspotOwnerTeamMemberId_idx" ON "Project"("hubspotOwnerTeamMemberId");
```

```sql
-- scripts/sql/2026-09-XX-fase1-pivotes.sql
CREATE TABLE "AgentPinnedKnowledge" (
  "agentId" TEXT NOT NULL REFERENCES "Agent"("id") ON DELETE CASCADE,
  "documentId" TEXT NOT NULL REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE,
  "order" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("agentId", "documentId")
);
CREATE INDEX "AgentPinnedKnowledge_documentId_idx" ON "AgentPinnedKnowledge"("documentId");
-- AgentRunSession, ComisionVendedorCobro (RESTRICT): ídem
```

```sql
-- scripts/sql/2026-09-XX-fase1-escalares-json.sql
ALTER TABLE "FirefliesSession"
  ADD COLUMN "hasSummaryContent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hasTranscript"     BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "FirefliesSession_hasSummaryContent_idx" ON "FirefliesSession"("hasSummaryContent");
-- TimelineBaseline.firmness*, ClientPartnerSnapshot.seats*, CanvasBlock.nodeCount, Audit.total* : ídem
```

```sql
-- scripts/sql/2026-09-XX-fase1-fks-suaves.sql
-- ⚠ Correr `npm run check:invariants` ANTES: INV2/INV8 tienen que dar 0 huérfanos.
ALTER TABLE "Project" ADD CONSTRAINT "Project_hermanoCsProjectId_fkey"
  FOREIGN KEY ("hermanoCsProjectId") REFERENCES "Project"("id") ON DELETE SET NULL NOT VALID;
ALTER TABLE "Project" VALIDATE CONSTRAINT "Project_hermanoCsProjectId_fkey";  -- sin lock largo
-- Particularidad.convertedTaskId → TimelineTask, FirefliesSession.manualClientId/resolvedClientId → Client: ídem
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimelineEvent_processed_idx" ON "TimelineEvent"("processedAt", "processedByRunId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AlertaCobro_cobroId_idx"     ON "AlertaCobro"("cobroId");
```

Después de cada `.sql`: actualizar `schema.prisma` con lo **mismo** (el `migrate diff` debe dar solo el ruido conocido: `embedding` + CHECKs + policies), `npx prisma generate`, reiniciar dev.

### Fase 2 — Backfill de datos existentes

Scripts en `scripts/`, con el guard estándar (`ALLOW_PROD_WRITE=1` + `--apply`, dry-run por defecto), idempotentes, por lotes.

| Script | Qué hace | Idempotencia |
|---|---|---|
| `backfill-project-alta.ts` | `INSERT INTO ProjectAlta SELECT … FROM Project WHERE altaEstado IS NOT NULL` | `ON CONFLICT (projectId) DO NOTHING` |
| `backfill-project-sugerencias.ts` | Una fila por eje no nulo (`healthProposed`, `estadoPropuesto`, `etapaPropuestaStageId`) | `ON CONFLICT (projectId, eje) DO UPDATE` |
| `backfill-owner-team-member.ts` | `UPDATE Project SET hubspotOwnerTeamMemberId = tm.id FROM TeamMember tm WHERE lower(Project.hubspotOwnerEmail) = tm.email` | `WHERE hubspotOwnerTeamMemberId IS NULL` |
| `backfill-pivotes.ts` | `INSERT … SELECT id, unnest(pinnedKnowledgeIds)` ×3, **filtrando** los ids que ya no existen y **reportándolos** (esa lista es el primer diagnóstico real de cuánto daño hizo el array) | `ON CONFLICT DO NOTHING` |
| `backfill-session-flags.ts` | El mismo predicado del `$queryRaw` de `/sessions`, en un `UPDATE` por lotes de 1.000 | `WHERE hasSummaryContent = false AND <predicado>` |
| `backfill-firmness-seats-audit.ts` | Extrae los escalares de los Json existentes | `WHERE col IS NULL` |
| `backfill-metricas-cartera.ts` | Explota `SnapshotCartera.metricas` (~52 filas/año) a `MetricaCartera` | `ON CONFLICT (snapshotId, moneda)` |

Cada script imprime `total / migrados / omitidos / huérfanos` y termina con `check:invariants`. Los nuevos INV que acompañan: **INV27** (identidad ↔ TeamMember o sentinela), **INV28** (`Project.alta*` ≡ `ProjectAlta` mientras convivan), **INV29** (`array ≡ pivote` mientras convivan).

### Fase 3 — Refactorización del código TypeScript

Orden por dependencia, una tanda por bloque, con **dual-write** en el medio:

1. **Índices** (Fase 1 sola ya alcanza; no hay código).
2. **`hasSummaryContent`/`hasTranscript`**: el enriquecimiento (`lib/google/meet-enrichment.ts`, `lib/sessions/post-process.ts`) escribe los flags; `/sessions` deja de hacer `$queryRaw`; `session-candidates` filtra por flag.
3. **Owner por id**: `sync-projects` resuelve y escribe ambas; `access.ts` y `verify-cse-scoping.ts` comparan por id. Deploy. Un ciclo de sync completo. Recién ahí `hubspotOwnerEmail` queda solo para display.
4. **Pivotes**: escritores escriben array **y** pivote (dual-write); lectores pasan al pivote; `knowledge-docs/[id]/route.ts` deja de necesitar limpieza (Cascade). Deploy. INV29 en 0 durante una semana. Después se corta el write al array.
5. **FKs sobre suaves**: quitar la limpieza manual en las dos rutas de borrado; INV2/INV8 pasan de "reparar" a "vigilar".
6. **Satélites**: `lib/projects/alta.ts` escribe `ProjectAlta` **y** las columnas viejas (dual-write); `kind.ts`/`altaEnCurso` leen del satélite via `include: { alta: true }`; INV14 apunta al satélite. Watchdog escribe `ProjectSugerencia`; el cartel de cartera lee de ahí. Deploy. INV28 en 0. Después se corta el dual-write.
7. **Actor pattern**: helper `lib/auth/actor.ts`; se adopta archivo por archivo en trabajo normal, sin tanda dedicada.
8. **Escalares restantes** (`firmness*`, `seats*`, `nodeCount`, `Audit.total*`): los escritores los pueblan; `lib/portfolio/load.ts`, `lifecycle/load.ts`, `audits/page.tsx` los seleccionan y dejan de traer el Json.
9. **`MetricaCartera`**: el corte escribe ambos; los paneles leen la tabla.

Regla de cada paso: el deploy N tiene lector nuevo + escritor dual; el deploy N+1 corta el escritor viejo; el DROP recién en Fase 4.

### Fase 4 — Ventana de DROP (política nueva)

Hoy la política dice "nunca drop". Propuesta de **Deprecation Policy** para ARCHITECTURE §2 regla 9:

1. Un campo deprecated lleva `// DEPRECATED — eliminar después de <fecha>` **y** una entrada en `docs/DEPRECATIONS.md` con: fecha de deprecación, último lector eliminado (commit), fecha mínima de DROP (≥ 1 deploy completo + 14 días después de eliminar el último lector).
2. El DROP corre en **ventana coordinada**: ambas PCs con `git pull` al día, `migrate diff` limpio, `pg_dump` de la tabla afectada a `backups/` (ya existe la carpeta), fuera de horario de uso.
3. Un `.sql` de DROP **nunca** se mezcla con uno aditivo, y lleva su `-- ROLLBACK:` con el `ADD COLUMN` inverso y el path del dump.
4. Los valores de enum **no se dropean** (PG exige recrear el tipo); se documentan como muertos y se guardan con test.
5. Tras el DROP: `prisma generate`, retirar las guardas que afirmaban la ausencia del campo, actualizar `0_init` en la próxima re-baseline.

Cola de DROP inmediata (todo verificado con 0 lectores reales):

| Orden | Objeto | Prerrequisito |
|---|---|---|
| 1 | `Client.isProspect` | ninguno |
| 2 | `Project.currentStage`, `currentStep`, `procesosHiddenFromKickoff` | retirar `etapa-retirada.test.ts` (o convertirlo en "la columna no existe") |
| 3 | `Project.implementationType`, `BusinessCase.implementationType` | ajustar `catalog.test.ts`; el enum queda (regla 4) |
| 4 | `PrintJobToken.businessCaseId` | quitar dual-write + fallback en `lib/print/job-token.ts:54,81,85` |
| 5 | `Project.canvas` | cortar `lib/canvas/update-agent.ts:41,54` (o decidir que ese agente muere junto con `CANVAS_PROJECT`) |
| 6 | `Project.pendingItems` | confirmar 0 lectores (deuda #19) |
| 7 | `CuentaFinanciera.terminosPago` | sacar del importador (`import-core.ts`, `schema.ts`) y del `ImportWizard.tsx` |
| 8 | `KnowledgeDocument.createdByEmail/updatedByEmail` | o poblarlas, o dropearlas |
| 9 | Tablas sin referencias: `KnowledgeEmbedding`, `ContentIdeaSource`, `CorteTarjeta` | `pg_dump` + confirmación de Elías |
| — | `AtribucionVenta`, `CobroFacturaOdoo`, `AguinaldoPago` | **NO dropear**: son diseños de agosto/septiembre con trabajo pendiente. Decidir "terminar o borrar" en DECISIONS. |
| — | `Project.nextSession*`, `lastSessionSummary` | **NO**: están activas. Corregir el comentario LEGACY o retirar el widget primero. |
| — | `Audit.accountId`, `Knowledge.accountId` (deuda #7) | backfill `clientId` desde `HubspotAccount.clientId` → hacer `clientId NOT NULL` → drop `accountId`. Tres pasos, tres deploys. |

---

## 5. Estrategia de índices

Priorizado por (frecuencia × filas escaneadas × camino caliente). Todos `CONCURRENTLY`, uno por statement.

| Prio | Índice | Consulta que salva | Evidencia |
|---|---|---|---|
| 1 | `Project(clientId)` · `Project(clientId, status)` | ~50 sitios; cartera, clientes, sync, sesiones | `lib/portfolio/load.ts:108`, `ClientsTable.tsx:46`, `sync-projects.ts:372,1418`, `sessions/page.tsx:90` |
| 1 | `Project(status, hubspotPipelineId)` | `PROYECTO_DE_CARTERA_WHERE` y hermanos en `lib/projects/scope.ts` | todos los fragmentos de scope |
| 1 | `FirefliesSession(hasSummaryContent)` + flag | `/sessions` cada render | `sessions/page.tsx:71` |
| 2 | `TimelineEvent(processedAt, processedByRunId)` | 3 `groupBy` del watchdog | `watchdog.ts:361,436,486` |
| 2 | `AgentRun(projectId, createdAt)` · `AgentRun(agentSlug, status, createdAt)` · `AgentRun(status, updatedAt)` | historial de corridas, watchdog, centro de corridas | `agent-runs/route.ts:41,83,90`, `watchdog.ts:409,502` |
| 2 | `Cobro(estado, fechaCobro)` · `Cobro(periodo, estado)` **+ reescribir** `estado: {not: "COBRADO"}` como `estado: {in: [...]}` | proyección, cola, reportes | `lib/cobranza/queries.ts:803,875,994,2106,2221,2487` |
| 2 | `CsAlert(status, lastDetectedAt DESC)` · `CsAlert(projectId, status)` | feed CS | `load-panel.ts:107`, `cs/alerts/route.ts:53`, `watchdog.ts:493` |
| 3 | `Project(createdAt)` · `Client(createdAt)` | orden de listados | `ClientsTable.tsx`, `portfolio/load.ts` |
| 3 | `FirefliesSession(source)` · parcial `(enrichedAt, enrichAttempts, date) WHERE enrichedAt IS NULL` | crons cada ~20 min que hoy cargan toda la tabla | `meet-sync.ts:217`, `meet-enrichment.ts:481,498,542` |
| 3 | `Audit(createdAt)` · `Knowledge(clientId)` · `Knowledge(accountId)` · `KnowledgeDocument(updatedAt)` | listados | `audits/page.tsx:17`, `knowledge/route.ts:7`, `knowledge/page.tsx:20` |
| 3 | `FacturaOdoo(estadoEspejo, odooMoveId)` | sync Odoo | `odoo/servicio.ts:370`, `odoo/sync.ts:135,152,303` |
| 4 | GIN `pg_trgm` sobre `FirefliesSession(title)` | `KICKOFF_TITLE_FILTERS` = N× `ILIKE '%kw%'` | `lifecycle/load.ts:170`, `project-sessions.ts:104` — alternativa mejor: materializar `sessionType` enum |
| 4 | GIN sobre `AgentRun.sourceSessionIds`, `ComisionVendedor.cobroIds` | **solo si NO se hacen los pivotes de §2.3** | `sessions/[id]/page.tsx:83`, `mutations.ts:615,2031` |

Índices que **no** conviene agregar: sobre las ~75 columnas de identidad textual (nadie filtra por ellas salvo `ActionItem.ownerEmail`, que ya lo tiene, y `LlmCall.triggeredByEmail`, ídem); sobre singletons (`CsSettings`, `MarketingSettings`, `CronJobState`).

Consultas a **reescribir** además de indexar (un índice no ayuda a una negación):
- `Cobro.estado: {not: "COBRADO"}` → lista positiva (`PROGRAMADO`, `POR_COBRAR`, `SIN_DATO`). `lib/projects/scope.ts:9-20` ya documenta esta misma trampa para `Project`.
- `FirefliesSession.transcript: {not: null}` → `hasTranscript: true`.
- `sessions/page.tsx:47` `findMany` sin `where` ni `take` sobre 16k filas: paginar.
- `meet-enrichment.ts:542` sin `take` ("pueden ser miles" según su propio comentario): acotar.

---

## 6. Lo que este plan decide NO hacer, y por qué

| Propuesta del brief | Decisión | Razón |
|---|---|---|
| `ProjectHubspotMetadata` como satélite | **No ahora** | 17 columnas con escritor único ya garantizado por test, alimentan `kind.ts` (6 decisiones) y 5 invariantes. El riesgo de romper facturación/cartera supera la ganancia de una tabla más angosta. Revisar cuando el espejo agregue otras 10 columnas. |
| `ProjectHealthAudit` | **No** | La salud curada son 4 columnas leídas en cada fila de la cartera; la propuesta va a `ProjectSugerencia`. |
| FK en las ~75 columnas históricas de identidad | **No** | Sentinelas, externos, invariantes por nombre, y el valor forense es el texto. Regla hacia adelante + INV27. |
| `@map`/`@@map` para unificar a inglés | **No** | Decisión documentada en DECISIONS; rompe la fidelidad de `migrate diff`; `policies.sql` referencia tablas por nombre. |
| Tabla relacional para permisos | **No** | Se leen enteros y cacheados; relacional = una query extra por autorización. El propio código lo argumenta. |
| `MinuteItem` para `SessionMinute.*` | **Después** | Bajo volumen, un solo agregador (`account-brief`). Cuando haya una segunda pantalla que filtre por tipo de acuerdo, se hace. |
| Migrar a `prisma migrate` clásico | **No** | La base tiene objetos que Prisma no modela (pgvector, CHECKs, RLS). La re-baseline de 2026-08-01 ya tomó esa decisión. |

---

## 7. Roadmap propuesto (tandas)

| Tanda | Contenido | Fases | Riesgo | Retorno |
|---|---|---|---|---|
| **DB-1 · Índices** | Los 12 índices de prioridad 1-2 + reescritura de las 3 negaciones | F1 + F3.1 | Nulo | Cartera, `/sessions`, watchdog y cobranza dejan de hacer seq scan |
| **DB-2 · Integridad barata** | 4 FKs sobre suaves + 3 pivotes de arrays + `hasSummaryContent` | F1 + F2 + F3.2-5 | Bajo (`NOT VALID` + `VALIDATE`; dual-write) | Desaparecen 3 fallos silenciosos documentados; 2 rutas de borrado pierden lógica manual |
| **DB-3 · Autorización por id** | `hubspotOwnerTeamMemberId` + `access.ts` + INV27 + `lib/auth/actor.ts` | F1 + F2 + F3.3/7 | Medio (toca autorización; tests existentes lo cubren) | Bug latente de mayúsculas cerrado; camino de autorización indexado; regla hacia adelante |
| **DB-4 · Satélites** | `ProjectAlta` + `ProjectSugerencia` + escalares jsonb + `MetricaCartera` | F1 + F2 + F3.6/8/9 | Medio (dual-write, 2 invariantes nuevos) | `Project` −23 columnas; watchdog deja de escribir en `Project`; series de cartera consultables |
| **DB-5 · Ventana de DROP** | Deprecation Policy en ARCHITECTURE + `docs/DEPRECATIONS.md` + cola de 9 drops + 3 tablas muertas + corregir 5 comentarios falsos | F4 | Medio (primer DROP del repo; requiere coordinar las 2 PCs) | La deuda deja de ser perpetua; el schema vuelve a decir la verdad |

DB-1 y DB-2 se pueden hacer sin pedir permiso a nadie más que al RUNBOOK (son aditivas). DB-3 en adelante conviene acordarlas porque tocan autorización, facturación y la política de drops.

---

## Anexo A — Columnas de identidad como texto (≈80)

Con sufijo `Email`: `Project.hubspotOwnerEmail`, `Project.altaActorEmail`, `DevEstimate.createdByEmail`, `HandoffSource.createdByEmail`, `TimelinePhase.statusChangedByEmail`, `TimelineTask.statusChangedByEmail`, `Particularidad.createdByEmail`, `Particularidad.convertedByEmail`, `TimelineChange.changedByEmail`, `TimelineBaseline.publishedByEmail`, `AgentRun.triggeredByEmail`, `LlmCall.triggeredByEmail` (indexada), `BusinessCase.approvedByEmail` (externo), `BusinessCase.createdByEmail`, `UseCase.createdByEmail`, `BusinessCaseBlock.confirmedByEmail`, `BusinessCaseExternalAccess.createdByEmail`, `PrintJobToken.createdByEmail`, `RolePermission.updatedByEmail`, `KnowledgeDocument.createdByEmail/updatedByEmail` (muertas), `FirefliesSession.organizerEmail` (externo), `SessionMinute.reviewedByEmail`, `ActionItem.ownerEmail` (indexada), `MarketingRun.startedByEmail`, `ContentIdea.acceptedByEmail`, `TimelineEvent.actorEmail`, `CsAlert.seenByEmail/resolvedByEmail`, `ClientPartnerSnapshot.hsCsmEmail/hsGrowthEmail` (externo), `BitacoraCobro.usuarioEmail`, `CostoMovimiento.usuarioEmail`, `TarjetaCredito.saldoPorEmail`, `RoleProfile.createdByEmail/publicPublishedByEmail`, `RoleProfileShare.grantedByEmail`, `HiloDeChat.usuarioEmail`.

Con sufijo `Por`/`By`: `Project.healthStatusOverrideBy`, `Project.lifecycleStageOverrideBy`, `Project.adoptionModeConfirmedBy`, `ProjectStageGate.markedBy`, `Particularidad.resueltaPor`, `ProjectCanvas.disabledBy`, `FirefliesSession.manualClientBy`, `SessionProject.reviewedBy`, `CuentaFinanciera.estadoActualizadoPor`, `Cobro.facturadoPor/confirmadoPor`, `FacturaLiberada.facturadoPor/liberadaPor/resueltaPor`, `AlertaCobro.vistaPor/resueltaPor`, `SnapshotCartera.triggeredBy`, `ImportacionCobranza.creadoPor/aplicadoPor`, `IngresoVariable.registradoPor`, `CorteTarjeta.registradoPor`, `AguinaldoPago.confirmadoPor`, `PagoPlanilla.confirmadoPor`, `ComisionPartner.confirmadoPor/registradoPor`, `AtribucionVenta.asignadoPor`, `ComisionVendedor.liquidadoPor`, `EgresoMensual.registradoPor`, `TipoCambioMes.registradoPor`, `FacturaOdooCambio.registradoPor`, `CobroFacturaOdoo.vinculadoPor`, `OdooPartnerVinculo.confirmadoPor`, `SyncOdooCorrida.disparadaPor`, `DiferenciaOdooAceptada.aceptadaPor`.

Contraejemplos correctos ya en el schema: `ProjectExternalAccess.createdById` (FK, SetNull), `ClientAssignment.grantedById` (FK, Restrict), `RoleProfileShare.teamMemberId` (FK).

## Anexo B — Relaciones suaves internas

| Columna | Destino | Índice | Propuesta |
|---|---|---|---|
| `Project.hermanoCsProjectId` | Project | ❌ | **FK SetNull** + índice |
| `Particularidad.convertedTaskId` | TimelineTask | ❌ | **FK SetNull** |
| `FirefliesSession.manualClientId` | Client | ✅ | **FK SetNull** |
| `FirefliesSession.resolvedClientId` | Client | ✅ | **FK SetNull** |
| `TimelineEvent.processedByRunId` | AgentRun | ❌ | índice `(processedAt, processedByRunId)`; sigue suave |
| `AlertaCobro.cobroId` | Cobro | ❌ | índice; sigue suave (se cierra, no se nulea) |
| `Project.healthProposedByRunId`, `estadoPropuestoByRunId`, `etapaPropuestaByRunId` | AgentRun | ❌ | absorbidas por `ProjectSugerencia.runId` (FK) |
| `Handoff.generatedByAgentRunId`, `ProjectTimeline.pending*RunId` ×3, `SessionMinute/ActionItem/SessionProject/ProjectParticipantSnapshot.generatedByAgentRunId`, `CanvasSuggestion.agentRunId`, `BusinessCaseBlock.agentRunId`, `CsAccountBrief/ProjectBrief.agentRunId`, `HiloDeChat.ultimoRunId` | AgentRun | ❌ | procedencia; FK SetNull es segura (AgentRun no se borra) pero de valor bajo — solo si se toca el archivo |
| `LlmCall.agentRunId/clientId/projectId` | varios | ❌ | **suelta a propósito** (libro de gasto); agregar índices `(projectId, at)`, `(clientId, at)` |
| `FacturaLiberada.servicioId/cobroId` | — | parcial | **suelta a propósito** (snapshot) |
| `TimelineEvent.timelineId/entityId/clientId` | — | ❌ | **suelta a propósito** (cola con label denormalizado) |
| `BusinessCaseSession.sessionId` | FirefliesSession | parcial | suelta ("puede no existir aún"); verificar con datos si eso sigue siendo cierto |
| `MensajeDeChat.llmCallId` | LlmCall | ❌ | procedencia; dejar |
| `PrintJobToken.docId/businessCaseId/canvasId` | polimórfico | ❌ | dejar (TTL 60 s) |
| `AppUser.authUserId` | auth.users (otro schema) | ✅ | dejar (cross-schema) |

## Anexo C — Modelos sin ningún `@@index`

`Project` ⚠, `Client` ⚠, `Audit` ⚠, `Knowledge` ⚠, `TeamMember` (tiene `@unique email`; suficiente), `HubspotAccount` (1:1 con `@unique`), `ClientDocument` (filtra por `clientId`/`projectId`: agregar `(clientId)`, `(projectId)`), `ProjectParticipantSnapshot` (1:1), `ExternalVerifyAttempt` (PK = token), `RolePermission` (PK = role), `SessionCategory`, `MarketingSettings`, `ContentPillar`, `CsSettings`, `CronJobState`, `ImportacionCobranza`, `TipoCambioMes`, `PartnerComercial`, `DiferenciaOdooAceptada` (singletons o `@unique` suficiente).

El inventario completo de índices existentes por modelo se generó durante la auditoría y coincide con `prisma/migrations/0_init/migration.sql` más el índice manual `TimelineTask_originFingerprint_idx`.
