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
- **Cobranza**: módulo de CONTROL de cobros de Admin & Finanzas (solo roles ADMIN + SUPER_ADMIN).
  Estados/cronograma/alertas viven en Nexus; la contabilidad en Odoo/Mercury.
- **`CuentaFinanciera`**: perfil de cobro de un cliente (1:1 con `Client`) — tipo nacional/
  internacional, vía de cobro, moneda, términos, día ancla del ciclo.
- **`ServicioContratado`**: un servicio facturable de la cuenta (suscripción, implementación…);
  un contrato puede traer varios, cada uno con su plan y cronograma.
- **`PlanDePago` / `CuotaPlan`**: el "arreglo de pago" con que se vendió el monto (plantillas:
  parejo, entrada+resto, suscripción, personalizado). NO es siempre monto÷N.
- **`Cobro`**: una obligación de cobro concreta (cuota N, período, fecha, monto, semáforo),
  materializada por el engine desde el plan. COBRADO exige `confirmadoPor` (INV3).
- **catch-up** (Cobranza): cobros de períodos YA pasados generados cuando la facturación arranca
  retroactiva (caso Teamnet: arrancó junio, contrato aprobado julio). Nacen PROGRAMADO + alerta;
  la persona confirma.
- **semáforo** (Cobranza): verde=cobrado · amarillo=por cobrar · gris=programado futuro ·
  rojo=vencido (>3 días de la fecha programada sin cobrar). Mapeo directo del Sheet de Finanzas.
- **ancla de facturación**: `fechaInicioFacturacion` del servicio — nace como copia editable del
  `anchorStartDate` del cronograma; si divergen después, alerta ARRANQUE_CAMBIADO (no se re-sincroniza).
- **digest / `SnapshotCartera`** (Cobranza): el corte semanal (lunes) computa las alertas de
  cartera y solo avisa el DIFF vs la corrida anterior; cada corrida queda como snapshot.
- **bitácora** (`BitacoraCobro`): registro de gestión de la cuenta — llamadas/correos/notas de la
  persona + actualizaciones automáticas del sistema (ej. resumen de una materialización).
