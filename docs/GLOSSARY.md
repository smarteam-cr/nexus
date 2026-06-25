# Glosario de dominio — Nexus

- **Sesión** (`FirefliesSession`): una reunión (Google Meet, ingerida vía Fireflies). Tiene
  `participants` (emails), `transcript`, `summary`, `organizerEmail`. ~16k filas.
- **`resolvedClientId`**: materialización de a qué Client pertenece la sesión — **fuente única
  de ownership**. La calcula `categorizeSession` y la persiste `lib/sessions/resolve-client.ts`.
- **`manualClientId`**: override manual del consultor (gana sobre la resolución automática).
- **Chokepoint** (`lib/sessions/project-sources.ts`): único punto por donde la generación saca
  sesiones de un proyecto/cliente, filtrando por ownership. `belongsToClient`,
  `getProjectHandoffSessions`, `getClientSessions`.
- **`categorizeSession`** (`lib/sessions/categorize.ts`): el cascade que clasifica una sesión en
  client / hubspotCompany / category / orphan. Fuente canónica del matching sesión→cliente.
- **`SessionProject`**: link sesión↔proyecto (`source`: agent | manual | legacy). `handoffOverride`
  fuerza incluir/excluir del handoff.
- **Handoff**: documento de traspaso Ventas→CS, generado por agente desde las sesiones de venta del
  proyecto. Vive en `CanvasBlock`s del canvas "Handoff".
- **Kickoff**: arranque del proyecto con el cliente (canvas "Kickoff"; tiene vista externa).
- **Cronograma** (`ProjectTimeline`): plan del proyecto con fases/tareas/baselines/fechas reales/avances.
- **Procesos**: bloques de la sección `procesos` del canvas "Información del cliente".
- **Proyecto sentinel `__strategy__`**: proyecto especial por cliente que aloja el canvas de
  contexto/estrategia (no es un proyecto real de servicio).
- **`hubspotCompanyId`** (en `Client`): id de la company de HubSpot ligada al cliente. Habilita
  HubSpot→Client en el cascade.
- **"feeding"**: las sesiones que alimentan un handoff (panel de revisión `SessionSelectionReview`).
- **`publishedSnapshot`**: foto client-safe (staging) que ve el cliente externo; el contenido vivo
  es borrador hasta "Subir".
- **Capability** (RBAC): permiso por rol (`lib/auth/roles.ts`) — ej. `createHandoff`, `handoffAnywhere`.
