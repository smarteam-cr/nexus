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
- **Particularidad** (`Particularidad`): desviación FECHADA y curada del cronograma con atribución —
  el "por qué y quién" movió el plan, en lenguaje cliente (a diferencia de `TimelineChange`, cuyo log
  es ruido de máquina). Es un hecho que ALTERÓ el plan (movió/comprometió una fecha), no un pendiente.
  Dos tipos vigentes (`kind`): **ATRASO** (`weeksImpact` OBLIGATORIO ≥1) / **COMPROMISO**; `SOLICITUD`
  está deprecado (un insumo del cliente es una tarea `party=CLIENTE`, no una particularidad — ver el
  eje DESTINO en DECISIONS.md; filas legacy conservan el enum como fallback de render). `party` reusa
  el enum de tarea (CLIENTE/SMARTEAM/AMBOS/DEV) para la atribución; `weeksImpact` = semanas de
  corrimiento; `occurredAt` = fecha de la sesión del hecho; `sourceQuote` = cita interna que lo
  respalda ([fecha] «fragmento») y que **NUNCA** cruza al cliente (fail-closed en el chokepoint).
  Cruza al cliente SOLO si `visibleExternal=true` (gate por-registro, como SUSPENDED). El CSE la crea
  a mano o acepta una propuesta del agente de avance (borrador `pendingParticularidades`, apply
  separado del avance). El resumen suma `weeksImpact` por party ("N semanas de corrimiento acumulado;
  X al cliente, Y a Smarteam").
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
- **Finanzas** (sección del sidebar): agrupador de navegación con 3 hijos — Cobranza (`/cobranza`,
  control de cobros), Costos y gastos (`/finanzas/costos`), Caja neta (`/finanzas/caja-neta`,
  ambos SOLO SUPER_ADMIN) — separados a pedido de Alex para poder analizar costos/caja aparte de
  la operación de cobranza diaria. Es puramente de navegación: no hay una entidad "Finanzas" en
  el schema ni una sección propia en la matriz de permisos — el gate de Costos/Caja neta sigue
  siendo la whitelist `COSTOS_ROLES` (ver `CostoRecurrente`), independiente de `cobranza.read`.
- **`CuentaFinanciera`**: perfil de cobro de un cliente (1:1 con `Client`) — tipo nacional/
  internacional, vía de cobro, moneda, términos, día ancla del ciclo.
- **razón social** (`CuentaFinanciera.razonSocial`): nombre legal de la empresa — distinto del
  nombre comercial (`Client.name`, bajo el que opera de cara al cliente). Se usa para conciliar
  con Odoo/Mercury. Nullable — se completa a mano o vía el importador.
- **cédula jurídica** (`CuentaFinanciera.cedulaJuridica`): identificador legal/fiscal de la
  empresa (Costa Rica). Sin restricción de unicidad a propósito: un mismo holding puede facturar
  bajo varios nombres comerciales con la misma cédula.
- **nombre comercial**: el nombre bajo el que una empresa opera de cara al cliente — es
  `Client.name`, NO necesariamente igual a su razón social.
- **`ServicioContratado`**: un servicio facturable de la cuenta (suscripción, implementación…);
  un contrato puede traer varios, cada uno con su plan y cronograma.
- **`PlanDePago` / `CuotaPlan`**: el "arreglo de pago" con que se vendió el monto (plantillas:
  parejo, entrada+resto, suscripción, personalizado). NO es siempre monto÷N.
- **`Cobro`**: una obligación de cobro concreta (cuota N, período, fecha, monto, semáforo),
  materializada por el engine desde el plan. COBRADO exige `confirmadoPor` (INV3).
- **catch-up** (Cobranza): cobros de períodos YA pasados generados cuando la facturación arranca
  retroactiva (caso Teamnet: arrancó junio, contrato aprobado julio). Nacen PROGRAMADO + alerta;
  la persona confirma.
- **semáforo** (Cobranza — dos relojes, Tanda B 2026-07): cada color dice de quién es la
  acción. **verde** = cobrado. **amarillo** = "por facturar" — sin `fechaEmision`, en ventana
  (`±15` días de `fechaProgramada`) o ya atrasado; es trabajo de Alex, nunca del cliente.
  **azul** = "facturado" — ya tiene `fechaEmision`, dentro del crédito; nadie tiene que actuar
  todavía. **gris** = programado a futuro fuera de ventana, o cuenta sin cobros. **rojo** =
  crédito corrido sin pago (`fechaEmision + creditoDias` ya pasó), o promesa de pago
  incumplida — el único rojo legítimo, mora real del cliente. `semaforoCobro`/`semaforoCuenta`
  (`lib/cobranza/engine.ts`) y `computeAlertSet` comparten el mismo criterio de ventana/crédito
  a propósito — nunca pueden contar historias distintas del mismo cobro.
- **crédito / días de crédito** (`CuentaFinanciera.creditoDias`): días que tiene el cliente
  para pagar DESDE que se emite la factura (`fechaEmision`), no desde `fechaProgramada`.
  Nullable → cae al default global `DEFAULT_CREDITO_DIAS=15`; Colby es la excepción con 90.
- **facturado / "Marcar facturado"**: acción de un click sobre un cobro (cola de cobros o
  cronograma del drawer) que setea `Cobro.fechaEmision` a una fecha real — pasa el cobro del
  Reloj 1 (facturar) al Reloj 2 (cobrar). Auditado igual que `COBRADO`: `facturadoPor`/
  `facturadoEn` (chokepoint `cambiarEstadoCobro`). Reversible ("Revertir factura" → vuelve a
  `null`, se limpia la autoría).
- **por facturar / por facturar atrasado**: estado de un cobro sin `fechaEmision` — mismo
  color amarillo en el semáforo (la urgencia se expresa en la alerta, no en el color: "en
  ventana" es `COBRO_PROXIMO`, atrasado sin gracia es `FACTURACION_ATRASADA`, urgencia ALTA).
- **vencido** — OJO, dos definiciones distintas conviven a propósito (deuda registrada para la
  Tanda C, ver DECISIONS.md): en el tab **Cobros** (semáforo/alertas, motor two-clock) es
  `fechaEmision + creditoDias` ya pasado — el dato correcto. En **Proyección**/**Reportes**
  sigue siendo `fechaProgramada + UMBRAL_VENCIDO_DIAS` (heredado, pre-Tanda-B) — aparece
  INFLADO porque incluye cobros que todavía están dentro del crédito; ambos paneles llevan un
  caveat textual apuntando a Cobros como la fuente correcta.
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
- **cola de cobros** (`loadColaCobros` → tab "Cobros", el landing): todos los cobros pendientes
  planos y accionables, agrupados Vencidos / Esta quincena / Más adelante, con registrar pago,
  promesa y borrador inline. Mismo universo que la proyección. "Registrar pago" (global, por
  fila o desde el drawer) = marcar COBRADO con fecha del pago retroactiva y referencia opcional.
- **corte semanal** (tab, ex "Digest semanal"): el corte de cartera diff-based de los lunes
  (o manual con "Hacer el corte ahora") — solo avisa cambios; el backlog de configuración va
  colapsado en una línea.
- **pago manual** (`createCobroManual` → `POST /api/cobranza/cobros`): registrar un pago que no
  salió de un plan. Crea un cobro `origen=MANUAL` sobre un servicio existente del cliente y lo
  marca COBRADO por el chokepoint (INV3). Entrada desde el buscador de "Registrar pago" →
  "Registrar un pago que no está en la lista". Nace cobrado (no entra a la cola).
- **`CostoRecurrente`**: un costo fijo del negocio registrado como REFERENCIA estimada —
  salario all-in (opcionalmente ligado a un `TeamMember`), herramienta o fijo de operación,
  mensual o anual, CRC o USD. SOLO SUPER_ADMIN (tab Costos). No es planilla ni contabilidad:
  sin estados de pago, sin semáforo, sin lógica fiscal.
- **caja neta** (`computeCajaNeta` → tab "Caja neta", SOLO SUPER_ADMIN): entra − sale por
  bucket (quincena/mes) — los ingresos proyectados de la cartera menos los costos recurrentes
  estimados, CRC y USD SIEMPRE separados. El neto puede ser negativo; los vencidos "en
  riesgo" se muestran aparte y NUNCA dentro del neto.
- **factor de cargas** (`CostoRecurrente.factorCargas`): multiplicador editable con el que la
  dirección estima el all-in de un salario desde el bruto (`monto = base × factor`). Lo
  escribe el usuario — Nexus no trae tasas ni calcula cargas. Solo memoria de reedición: el
  canónico es `monto`.
- **burn mensual estimado**: suma mensualizada de los costos recurrentes ACTIVOS y NO
  finalizados (ANUAL/12), por moneda. El "sale" fijo del negocio; tile en Costos y Caja neta.
- **gasto puntual** (`GastoPuntual` → sub-vista "Gastos" del tab, SOLO SUPER_ADMIN): un gasto
  único/circunstancial con fecha (compra de equipo, evento, mantenimiento) y tags libres.
  Fecha futura = compra planificada → entra a la caja neta en el bucket de su fecha (entero,
  sin mensualizar); fecha pasada = solo registro (totales por tag y por mes). NO es
  contabilidad: sin estado de pago.
- **tag de gasto** (`GastoPuntual.tags`, `normalizeGastoTag`): etiqueta libre normalizada a
  slug ("Evento San José" → `evento-san-jose`) para agrupar gastos por contexto (evento,
  campaña). Vocabulario ABIERTO con autocomplete de los ya usados; máx 8 por gasto. NO usa el
  catálogo cerrado de proyectos.
- **movimiento de costo** (`CostoMovimiento` → sub-vista "Movimientos"): entrada append-only
  de la historia de un costo recurrente — ALTA, BAJA, REACTIVACION, PAUSA, CAMBIO_MONTO,
  ELIMINACION — con snapshot autosuficiente + fechaEfectiva + usuario + motivo. La escriben
  solo las mutations, en la misma transacción. Responde "quién entró y quién se fue, cuándo".
- **finalizado / baja** (`CostoRecurrente.finalizadoEl`): baja DEFINITIVA de un costo
  (renuncia, desvinculación, cancelación) — distinta de la pausa (`activo=false`, temporal).
  Sale del burn pasada la fecha, va al Histórico, y genera un movimiento BAJA.
- **Roles** (sección del sidebar, `RoleProfile`): docs de los roles y responsabilidades del
  equipo, SOLO SUPER_ADMIN. Cada rol es un PUESTO libre (título + área, no atado al enum
  `TeamRole` ni a una persona) que se renderiza y edita con el MISMO motor de landing
  (`LandingView`) que el business case y el kickoff (`/roles/[id]`, con `RoleWorkspace` y su toggle
  Editar): plantilla fija de **7** secciones ricas — perfil de puesto, responsabilidades (cards),
  KPIs (tag predicción/arrastre + objetivo/medición), caminos de éxito y de fracaso (cards),
  ruta de madurez (escalera L1→L5) y período de transición — con edición WYSIWYG in-situ,
  drag&drop de ítems y tooltips ⓘ por sección. El contenido vive como JSON estructurado en
  `RoleProfile.content` (NO en `CanvasBlock`: se reusa la PRESENTACIÓN/EDICIÓN del motor, no el
  motor de datos — ver DECISIONS). Sin IA (se llena a mano); gate hardcodeado fuera de la matriz
  de permisos (mismo criterio que Costos); RLS deny (tabla interna).
