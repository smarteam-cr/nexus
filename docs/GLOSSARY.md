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
- **puerto / adaptador** (Cobranza): interfaz por la que TODO entra o sale del módulo
  (`lib/cobranza/ports.ts`): `AccountSource` (empresas/cuentas), `CommunicationPort` (contexto
  + entrega de mensajes), `ReconciliationPort` (¿se pagó?). Los adaptadores (implementaciones)
  viven en `lib/cobranza/adapters/`; el motor puro nunca los conoce.
- **fuente + id_externo**: procedencia de una entidad que vino de afuera (`Client.source/
  sourceExternalId`, `CuentaFinanciera.fuente/fuenteIdExterno`) — clave del upsert idempotente:
  re-sincronizar la misma fuente actualiza la MISMA fila, no duplica.
- **importador / cola de revisión** (`ImportacionCobranza`/`ImportacionFila`): staging del CSV —
  parseo → mapeo columna→campo canónico (configurable) → validación; las filas inválidas quedan
  REVISAR (se corrigen u omiten a mano), NUNCA se ingieren en silencio.
- **proyección de ingresos** (`proyectarIngresos`): "la plata que viene" — cobros futuros
  agrupados por QUINCENA (cercano) y MES (resto), totales CRC y USD SEPARADOS, vencidos
  "en riesgo" aparte. Cuarto tab del módulo.
- **quincena** (Cobranza): mitad de mes calendario (1–15 / 16–fin, fin clampeado) — la unidad
  operativa del ciclo de cobro de Alex.
- **referencia externa** (`Cobro.referenciaExterna`): id de transacción Mercury / factura Odoo
  pegado OPCIONALMENTE al confirmar COBRADO — trazabilidad hacia contabilidad sin acoplarse.
- **correoCobro** (`CuentaFinanciera`): el correo al que se le cobra a ese cliente — destino del
  mailto del borrador de cobro.
- **borrador de cobro** (`agent-cobranza-borrador`): correo de cobro redactado por IA desde el
  contexto real de la cuenta (bitácora); la persona lo edita y lo envía a mano — sin envío
  automático (regla de no-fabricación en el prompt, calibrable en DB).
- **métricas de cartera** (`SnapshotCartera.metricas`, Json): la foto numérica del corte, POR
  MONEDA — vencido/por-cobrar/programado (mapeo 1:1 al semáforo), aging, DSO, días promedio de
  cobro, cobrado en la ventana y proyectado al próximo corte — más cobertura y cuentas
  rojas/amarillas. Json extensible; null = snapshot pre-fase-3 (sin backfill).
- **cobertura** (Cobranza): cuánto de la cartera está realmente medido — cuentas totales /
  configuradas / pendiente de datos / sin cobros. Toda métrica y todo reporte la declaran:
  una cuenta vacía no cuenta como sana.
- **DSO** (proxy de control): promedio ponderado por monto de la antigüedad en días
  (hoy − fechaProgramada) de los cobros exigibles no cobrados, por moneda. null = sin
  exigibles. NO es el DSO contable (no hay ventas facturadas en Nexus).
- **aging**: los montos VENCIDOS repartidos por edad en buckets 0-30/31-60/61-90/90+ días,
  por moneda. Invariante: la suma de los buckets es exactamente el total vencido.
- **diasPromedioCobro**: promedio de (fechaCobro − fechaProgramada) de los COBRADOs, por
  moneda. Negativo = pagan antes de la fecha. Insumo del riesgo de pago.
- **cobrado-vs-proyectado**: comparación entre lo que un corte proyectó que entraría hasta el
  corte siguiente (`proyectadoProximoCorte`) y lo que ese corte siguiente midió como cobrado
  en su ventana (`totalCobradoDesdeUltimoCorte`).
- **promesa de pago** (`Cobro.promesaPago`): fecha en que el cliente prometió pagar. Vigente
  calla las alertas de ese cobro (auto-snooze incluido); NO cambia semáforos ni métricas.
  Vencida sin cobro → alerta PROMESA_INCUMPLIDA (reemplaza al vencido del cobro).
- **PROMESA_INCUMPLIDA**: alerta ALTA emitida en el corte cuando la fecha prometida pasó y el
  cobro sigue sin entrar — dedupeKey `PROMESA_INCUMPLIDA:{cuentaId}:{cobroId}`.
- **posponerHasta / snooze** (`AlertaCobro.posponerHasta`): pausa temporal de una alerta — sale
  del feed sin cambiar de estado y vuelve sola cuando la fecha llega. Lo setea la persona
  ("Posponer") o el auto-snooze al registrar una promesa.
- **riesgo de pago** (regla V1): cobro pendiente cuyo atraso supera el comportamiento histórico
  de su cuenta más el umbral (`RIESGO_UMBRAL_DIAS` = 15): "este cliente suele pagar a N días;
  ya va en N+15+". Sin historia, el umbral aplica a secas. Tabla en el tab Reportes.
- **reporter de finanzas** (`agent-finanzas-reporter`): reporte narrado por IA desde las
  métricas/serie/riesgo/alertas REALES, en dos voces — operativa (accionable) y ejecutiva
  (agregados; solo SUPER_ADMIN). Declara cobertura e historia; no fabrica números.
