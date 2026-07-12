# Decisiones (ADR-lite) — no re-litigar

Decisiones ya tomadas, con el porqué. Si vas a cambiar una, primero entendé por qué se tomó.

## Sesión → cliente → proyecto
- **Fuente única de ownership = `FirefliesSession.resolvedClientId`** (materialización de
  `categorizeSession`, el MISMO cascade que /sessions). Todos los consumidores la leen vía el
  chokepoint `lib/sessions/project-sources.ts`. *Por qué:* la resolución estaba dispersa en
  3-4 implementaciones (una con title-match débil) → leak cross-empresa (handoff de DISTELSA
  con sesiones de Tiendas Monge / CAV / AMVAC). Se unificó y se borraron las re-implementaciones
  (`sessionMatchesClient` de `analysis-context.ts`, `searchFirefliesFromDB` de `analyze`).
- **Cascade (`categorize.ts`), orden:** manual → 100% interna + título → dominio
  (`emailDomains` + `company`) → categoría → **HubSpot→Client** (dominio→company ligada vía
  `Client.hubspotCompanyId`) → título (fallback débil) → orphan. El **dominio manda antes que
  el título**.
- **HubSpot→Client es ADITIVO, no "corte":** si la company de HubSpot NO está ligada a un Client,
  en la materialización cae al título (no a null). *Por qué:* el "corte" perdía sesiones
  legítimas de clientes cuyo dominio real está en HubSpot pero NO registrado en el Client
  (Mr Wings→tecnofood.com.mx, Honda→facocr.com). Fix de raíz: registrar esos dominios en
  `emailDomains` → resuelven por dominio (fuerte) y se puede endurecer a "corte". El flag
  `groupUnlinkedHubspotCompany` activa el bucket "hubspotCompany" SOLO en el display de /sessions.
- **Regla de oro stopwords (title-match):** solo conectores/proceso genéricos (`para`,
  `pruebas`, `sesion`, `demo`, `cierre`…). **NUNCA** un token que sea el nombre distintivo de un
  cliente real — medido: stopwordear `smarteam` tira 2342 sesiones a 0; `distribuidora`/`materiales`
  rompen DISTELSA.
- **NO registrar dominios COMPARTIDOS** (genéricos gmail/hotmail, o de agencias que trabajan con
  varios clientes) en `emailDomains` de un solo cliente: sería un leak con otra cara — le colaría
  las sesiones de todos los que usen ese dominio. Solo se registran dominios ÚNICOS por empresa,
  confirmados a mano.
- **Entidades del MISMO GRUPO no son leak.** Ej.: "Distribuidora Larce" ⊂ Grupo DISTELSA →
  que una sesión de Larce resuelva a DISTELSA es CORRECTO, no cross-empresa. (Se había tratado
  como residual del catch-all de título; en realidad la resolución estaba bien.) Antes de
  "arreglar" una resolución sospechosa, verificá si las entidades pertenecen al mismo grupo/holding.
- **`categorize.ts` (ownership) vs `lib/matching/cascade.ts` (sync):** son DOS matchers distintos
  a propósito (cascade.ts es más estricto, con contactos HubSpot, para sync/GPS/process-session).
  Reconciliarlos es deuda trackeada (ARCHITECTURE.md #20); no se tocó en el fix del leak.

## Handoff / generación
- **Relevancia de sesión para handoff:** título de handoff/kickoff O Ventas en la sala
  (`lib/handoff/session-relevance.ts`). Override por sesión (`SessionProject.handoffOverride`):
  lo manual manda; la "X" del panel solo SACA del handoff (no desvincula del proyecto).
- **`hasHandoff` = bloques generados > 0**, no existencia del entity Handoff (un entity vacío no
  cuenta — evita el "ya tiene handoff" fantasma tras un reset).
- **Owner = Lorena solo al CREAR de cero** (vía `HUBSPOT_HANDOFF_OWNER_ID`), no al adjuntar.

## Cronograma — vista del cliente
- **El cronograma compartible (`/external/cronograma`) muestra, por tarea, el ESTADO
  (hecho / en curso / pendiente + "atrasada" derivada de la fecha) y el RESPONSABLE
  (Cliente / Smarteam / Ambos).** *Por qué:* el cliente necesita ver el progreso y de quién
  depende cada cosa. Revierte el criterio previo "el avance es interno, el cliente no ve
  estados" + el `party` marcado como interno en el schema. *Alcance:* SOLO esa página; el
  cronograma EMBEBIDO en el Kickoff NO los muestra (prop `TimelineSection.showProgress`).
  *Frescura:* **gated** — se refrescan al "Subir al cliente" (ahí se re-congela el
  `publishedSnapshot` vía `readClientTimeline`); el flujo de avance interno (`progress/apply`)
  NO toca el snapshot. *SUSPENDED sigue oculto* (tarea descartada del plan). *No sensible:*
  estado y responsable no lo son; `notes`/`source`/`needsValidation` de tarea siguen internos.

## Cobranza
- **Frontera: Nexus = capa de CONTROL de cobros** ("¿a quién le toca cobrar y cómo va?"):
  estados, cronograma proyectado, alertas, bitácora. La facturación fiscal, conciliación
  bancaria y contabilidad viven en Odoo/Mercury — Nexus NO emite facturas ni registra pagos
  contables. Regla mental: "¿a quién le toca y cómo va?" → Nexus; "¿cuánto entró y contra
  qué factura?" → Odoo/Mercury.
- **Autonomía en la derivación, confirmación en el dinero.** El engine (lib/cobranza/engine.ts)
  materializa cobros, genera catch-up y detecta divergencias SIN frenos; pero TODO estado con
  consecuencia monetaria (marcar COBRADO, oficializar un catch-up) lo confirma la persona.
  INV3 (check-invariants): ningún Cobro COBRADO sin `confirmadoPor`. Chokepoint único:
  `cambiarEstadoCobro` en lib/cobranza/mutations.ts.
- **Gate de acceso = whitelist client-safe** `lib/auth/cobranza-roles.ts` (`COBRANZA_ROLES` =
  ADMIN + SUPER_ADMIN). El rol ADMIN (asistente administrativo de Finanzas) nació con el módulo,
  con CERO capacidades de la matriz de roles — su único acceso es Cobranza. Se asigna SOLO
  después de deployar el código (lección DEV). Cambios de acceso van SOLO en la whitelist.
- **Ancla de facturación = `anchorStartDate` LEÍDA, no duplicada.** `fechaInicioFacturacion`
  nace como copia editable del anchor del cronograma al configurar el servicio; NO se sincroniza
  después. Si el CSE mueve el arranque, la divergencia la detecta la alerta ARRANQUE_CAMBIADO
  en el cómputo de cartera (sin plumbing de eventos) y los cobros emitidos/cobrados JAMÁS se
  regeneran — Alex decide.
- **Naming en ESPAÑOL en el schema de Cobranza** (CuentaFinanciera, Cobro, CuotaPlan…):
  desviación deliberada de la convención inglesa — el dominio se opera en español y los términos
  no traducen 1:1. No "corregir" a inglés.
- **Dinero = Decimal(12,2)** (primer uso en el repo — Float acumula error en montos).
  `Prisma.Decimal` NUNCA cruza la frontera de lib/cobranza/queries.ts: los serializadores lo
  convierten a number ahí, único punto.
- **Digest diff-based**: el corte (lunes 7:00 CR vía scheduler, opt-in `COBRANZA_CRON_ENABLED`,
  o manual) solo avisa CAMBIOS vs el SnapshotCartera anterior. Si nada cambió, no molesta.
- **Arquitectura de TRES PUERTOS** (`lib/cobranza/ports.ts` — fase 2): el módulo se conecta a
  HubSpot/Odoo/Gmail/WhatsApp sin reescribir el motor. (1) `AccountSource` provee/crea empresas
  y cuentas (impl: manual + CSV); (2) `CommunicationPort` da el contexto de la última
  comunicación y entrega el mensaje (impl: bitácora + copiar/mailto — SIN envío automático;
  slots gmail/meetings definidos NO cableados); (3) `ReconciliationPort` dice si un cobro se
  pagó (impl: confirmación humana). Los puertos cortan en la CAPA DE SERVICIOS, no en el motor
  — engine.ts es matemática pura y jamás importa un adaptador; las routes son el composition
  root y resuelven implementaciones vía la factory `lib/cobranza/adapters/`. TODA
  reconciliación (incluidas las futuras automáticas) embuda en `cambiarEstadoCobro` (INV3).
- **Regla transversal `(fuente + id_externo)`**: toda entidad que venga de una fuente externa
  lleva su procedencia — `Client.source/sourceExternalId` (inglés: modelo compartido) y
  `CuentaFinanciera.fuente/fuenteIdExterno` (español: modelo de Cobranza), ambos con
  `@@unique` compuesto (NULLs no colisionan → lo legacy convive). Habilita UPSERT idempotente
  (re-correr el mismo import/sync NO duplica) y el mapeo futuro de HubSpot/Odoo sobre la
  MISMA fila. El import JAMÁS pisa curaduría manual (solo completa campos null).
- **Importador: el modelo canónico manda, no el Excel.** El mapeo columna→campo es configurable
  (Json del batch); las filas inválidas van a COLA DE REVISIÓN, nunca se ingieren en silencio.
  Guardas del resolver (post-mortem 2026-07-10): skip-list de nombres internos/basura, jamás
  dominios compartidos en emailDomains, empresas sin dominio se crean SIN dominios (solo el
  title-match exacto las alcanza — trade-off aceptado), y UN solo `resolveAllSessions` al
  final del batch (nunca por fila). SIN backfill de historia: la fecha de inicio de una
  suscripción importada se CLAMPEA al ciclo corriente (catch-up máx 1 cuota; la fecha original
  queda en descripción/bitácora).
- **Universo del panel = proyecto-real ∪ tiene-cuenta** (`universoCobranza` en queries.ts):
  las empresas creadas/importadas en Cobranza sin proyecto en Nexus SÍ aparecen (chip "sin
  proyecto"); sus alertas CUENTA_SIN_DATOS bajan a urgencia BAJA (backlog de captura, no
  operación en riesgo — no inundan el digest). `loadCartera` y `buildCarteraEngineInput`
  cambian SIEMPRE juntas o el panel y el digest divergen.
- **Semáforo: vacío ≠ al día.** Cuenta sin cobros → GRIS (una cuenta recién configurada o
  pendiente de datos no puede verse "cobrada"). Verde exige cobros y todos cobrados.
- **MONTOS_DESCUADRADOS: guardar SÍ, materializar NO** (actualiza la decisión 2026-07-10 en
  fase 3): un plan descuadrado puede GUARDARSE (sigue editable, la alerta avisa y el form lo
  muestra en vivo — PERSONALIZADO parcial sigue siendo legal como borrador), pero
  `generateCobros` FRENA la materialización con 409 si |sumaPlanExpandido − montoTotal| > 0.01.
  SUSCRIPCION y planes inválidos → null → pasan (el rolling del digest es inmune). La
  validación dura de montos del importador (Zod) no cambia.
- **Proyección de ingresos por moneda SEPARADA**: quincena (cercano) + mes (resto), horizonte
  6 meses, CRC y USD jamás se suman ni convierten (tipo de cambio = otra iteración); los
  vencidos "en riesgo" van APARTE de los buckets futuros. Motor puro `proyectarIngresos`.
- **Borrador de cobro con IA = borrador, JAMÁS envío**: patrón account-brief (sync, prompt en
  DB para que Alex calibre el tono, AgentRun trazable), regla de NO-FABRICACIÓN (contexto
  delgado ⇒ recordatorio genérico; nada de datos internos), la persona edita y envía a mano
  (copiar / mailto a `correoCobro`). La generación queda registrada en la bitácora.
- **Referencia de conciliación opcional** al confirmar COBRADO (`Cobro.referenciaExterna`, id
  de transacción Mercury / factura Odoo): trazabilidad del puente control↔contabilidad sin
  volver a Nexus contabilidad.
- **Métricas de cartera en `SnapshotCartera.metricas` (Json, fase 3)**: cada corte captura las
  métricas agregadas POR MONEDA (vencido/por-cobrar/programado mapeados 1:1 al semáforo, aging,
  DSO, días promedio de cobro, cobrado-en-ventana, proyectado al próximo corte) + cobertura.
  Json EXTENSIBLE a propósito: el día que llegue tesorería (montos recibidos, FX) se agregan
  llaves sin tocar schema. SIN backfill — los snapshots pre-fase-3 tienen `metricas` null y las
  vistas de tendencia los excluyen: la historia comparable arranca del primer corte que las
  capturó (fabricar historia rompería la honestidad de datos).
- **Honestidad de datos (constraint transversal de fase 3)**: toda métrica declara su
  COBERTURA (cuentas totales/configuradas/pendiente-datos/sin-cobros); una cuenta vacía o
  PENDIENTE_DATOS no cuenta como sana ni entra a denominadores; DSO/aging excluyen cuentas sin
  cobros; DSO sin elegibles = null (no 0); el reporter declara cuántos cortes de historia hay
  antes de hablar de tendencia. CRC y USD JAMÁS se suman (regla previa, aplica a todo lo nuevo).
- **DSO = proxy de CONTROL, no el DSO contable**: sin ventas facturadas no existe el DSO
  clásico; el nuestro es el promedio ponderado por monto de la antigüedad (hoy − fechaProgramada)
  de los cobros no-COBRADO EXIGIBLES (fecha ≤ hoy), por moneda. Los PROGRAMADO futuros no diluyen.
- **Cobrado-vs-proyectado por pares de cortes**: cada corte guarda `proyectadoProximoCorte`
  (lo que la cartera dice que entra hasta el corte siguiente, con la gracia de los no-vencidos
  pasados contados como "hoy"); el corte SIGUIENTE lo compara contra su
  `totalCobradoDesdeUltimoCorte` (ventana exclusiva-inclusiva `(anterior, hoy]`).
- **Promesa de pago calla alertas, NO números**: `Cobro.promesaPago` vigente suprime
  COBRO_VENCIDO/COBRO_PROXIMO de ESE cobro en los cortes (el humano ya gestionó) y AUTO-SNOOZEA
  sus alertas vivas al registrarse (posponerHasta = fecha prometida; quitarla las despierta).
  Semáforos, métricas y proyección NO cambian — el dinero sigue vencido hasta que entre. Fecha
  pasada sin COBRADO → PROMESA_INCUMPLIDA (ALTA) que REEMPLAZA al vencido/próximo (1 alerta por
  cobro, dedupeKey propio). No se limpia al cobrar (trazabilidad de si cumplió). Gmail inbound
  para detectarla automática = slot futuro del CommunicationPort, NO cableado.
- **Snooze manual de alertas (`posponerHasta`) no cambia el estado**: la alerta sale del feed
  (filtro en loadAlertas) y vuelve SOLA cuando la fecha llega; el merge de upsertAlertas no toca
  posponerHasta, así el snooze sobrevive a los cortes.
- **Riesgo de pago V1 = regla conductual simple, sin ML**: por cuenta, comportamiento = promedio
  de (fechaCobro − fechaProgramada) de sus COBRADOs (monedas juntas — es conducta del cliente);
  se bandera todo cobro pendiente con `diasAtraso > (promedio ?? 0) + RIESGO_UMBRAL_DIAS (15)`.
  El promedio NO se clampea: el buen pagador (promedio negativo) se bandera antes — esa ES la
  señal. Sin historia → umbral a secas. Patrón aprendido por cliente = iteración futura.
- **Reporter de finanzas con DOS voces y gate server-side**: `operativa` (accionable, para quien
  cobra — cualquier rol con acceso a Cobranza) y `ejecutiva` (agregados/tendencia/caja, para
  dirección — SOLO SUPER_ADMIN, verificado en la API además de la UI). Prompt en DB (fila Agent,
  calibrable sin redeploy), regla de no-fabricación + declarar cobertura e historia. Es un
  REPORTE, no un envío: la persona copia y comparte.
- **`AgentRun.clientId` nullable**: los reportes de cartera agregada no pertenecen a un cliente;
  todos los writers existentes lo siguen seteando.
- **La línea de control se MANTIENE en fase 3**: cero campos de tesorería (montoRecibido, tipo
  de cambio, cuentas bancarias, egresos). La costura hacia Odoo/Mercury sigue siendo
  ReconciliationPort + referenciaExterna + el Json extensible de métricas — lista para conectar
  tesorería sin construirla.
- **La COLA DE COBROS es el landing del módulo** (rediseño UX 2026-07-11): la acción #1 de quien
  cobra es REGISTRAR PAGOS y ver qué está vencido — no navegar una tabla de clientes. El tab
  "Cobros" agrupa los pendientes (Vencidos → Esta quincena → Más adelante, con la regla del
  semáforo y `finQuincenaISO` del engine) con acciones inline; la tabla de clientes ("Clientes",
  ex Panel de cartera) queda como superficie de administración/configuración. Los cards de
  resumen se computan de la cola COMPLETA (los filtros solo estrechan la lista) y CRC/USD van
  SIEMPRE separados. `loadColaCobros` es espejo del universo de `loadProyeccion` — si cambia
  uno, cambia el otro.
- **Registro de pago DUAL con fecha retroactiva**: botón global "Registrar pago" (buscador
  client-side sobre la cola cargada) + 1-click por fila de la cola + el select del cronograma
  del drawer — los TRES caminos embudan en el mismo `RegistrarPagoDialog` (fecha del pago
  default hoy, capada a hoy — la plata suele entrar días antes de registrarse) y en el PATCH →
  `cambiarEstadoCobro` (INV3 intacto). El diálogo es presentacional; el optimista vive donde
  viven los datos (contenedor para cola/buscador, CronogramaCobros para el drawer). El
  semáforo de la cartera JAMÁS se parchea a mano en el cliente (depende de todos los cobros
  de la cuenta): optimista solo en la cola, el resto re-fetch best-effort.
- **Alertas: operativas ≠ backlog de configuración**: CUENTA_SIN_DATOS es trabajo de setup, no
  urgencia del día → segmento propio en el feed ("Configuración", con CTA que abre la cuenta),
  fuera del badge del tab, y colapsadas a una línea expandible en las Nuevas/Resueltas del
  corte semanal. El engine no cambia — es presentación.
- **CuentaDrawer único en el contenedor**: lo abren la cola, la tabla de clientes y las alertas
  de configuración vía `onOpenCuenta(cuentaId)` — tres instancias eran tres bugs de refresh.
- **Pago manual = cobro `origen=MANUAL` sobre servicio EXISTENTE** (2026-07-11): un pago que no
  salió de un plan se registra creando un `Cobro` `origen=MANUAL`, `numCuota=null` (intocable por
  `reconcileCobros` → sobrevive a re-generate) y marcándolo COBRADO por `cambiarEstadoCobro`
  (INV3 + chokepoint único intactos — nunca se escribe estado=COBRADO directo en el create). NO
  hay pago flotante: el schema exige `servicioId` + `cuentaId`, así que el flujo obliga a elegir
  cliente → servicio; si el cliente no tiene servicios, se lo manda a configurarlo (sin alta al

## Permisos — matriz sección×acción (migración PERM, 2026-07-11)
- **Sin CASL/casbin — registry homegrown tipado**: esas librerías brillan en abilities
  condicionales row-level, y Nexus YA resuelve el row-level con `lib/auth/access.ts`
  (GRANT/REVOKE/owner/viewAll). Lo que faltaba era una matriz coarse sección×acción → registry
  propio (patrón TAG_CATALOG), cero deps nuevas, zod v4 solo en la frontera de escritura.
- **Administrar permisos = SOLO SUPER_ADMIN, gate DURO no delegable**: ni `equipo.manage` por
  plantilla habilita tocar permisos (los endpoints exigen `guardRole("SUPER_ADMIN")`). Anti-lockout
  triple: SA = all-true hardcodeado en el engine ANTES de mirar DB/overrides; el PUT de plantillas
  rechaza SUPER_ADMIN; el PATCH rechaza degradar al último SA activo y limpia overrides al
  promover a SA.
- **DEFAULT_MATRIX (código) = comportamiento histórico EXACTO, congelado por test** (compat.test).
  El delta operativo (DEV a solo-lectura en handoff/kickoff/cronograma/procesos) vive SOLO en la
  SEMILLA de DB (`seed-role-permissions.ts`) — así el fallback con tabla vacía es siempre
  compat pura y el deploy es seguro en cualquier orden código/datos.
- **Customer Success cabalga sobre `clientes.viewAll`** (vía compat de `seeAllClients`): cero churn
  de sus ~12 endpoints; si algún día se necesita granularidad propia, es 1 entrada nueva en el
  registry, no una migración.
- **Visibilidad de clientes tiene DOS canales a propósito**: la celda `clientes.viewAll`
  (rol/plantilla) y el flag por-persona `canViewAllClients(+ExpiresAt)` (override temporal, ej. un
  CSE cubriendo vacaciones). El modal de /team muestra ambos; access.ts evalúa ambos.
- **`enforced:false` = el modal OCULTA la acción**: una celda solo aparece cuando un guard real la
  consulta — nunca un switch que no hace nada. Al cablear un gate nuevo, flipear `enforced`.
- **Whitelists viejas (`sales/marketing/cobranza-roles.ts`) = espejos congelados @deprecated**: ya
  nadie las consulta en runtime; quedan (con sus tests) como documentación del default histórico.
  vuelo). Nace COBRADO → no aparece en la cola; sí en el cronograma del drawer, la bitácora y las
  métricas. La UI capa la fecha del pago a hoy (retroactiva, para conciliar contra el banco).
- **Costos recurrentes = REGISTRO DE REFERENCIA ESTIMADO, jamás contabilidad/planilla**
  (fase 4, 2026-07-11): `CostoRecurrente` guarda el costo mensual/anual all-in que la
  dirección YA conoce (salarios, herramientas, fijos). PROHIBIDO en el código: cualquier
  lógica fiscal de Costa Rica (tasas de CCSS, cargas sociales, aguinaldo, renta), estructuras
  de sociedades, timbrado, FX. El "factor de cargas" es un MULTIPLICADOR editable que escribe
  el usuario (sin defaults ni tasas sugeridas); el canónico SIEMPRE es `monto` all-in —
  base+factor son solo memoria de reedición (van juntos o ninguno). Del lado costos NO hay
  tracking de pagos: sin "pagado", sin semáforo, sin alertas — un costo no vence.
- **Caja neta REUSA el motor de proyección, no lo duplica**: `esqueletoBuckets` (privado del
  engine) arma los buckets (quincenas→meses, clamp adentro) y lo consumen `proyectarIngresos`
  Y `proyectarCostos` → keys idénticas POR CONSTRUCCIÓN y `computeCajaNeta` solo resta.
  `loadCajaNeta` es el ÚNICO compositor (mismos defaults ambos lados). El refactor quedó
  protegido por el golden test G1 (`__fixtures__/proyeccion-golden.json`, 37 cobros × 8
  casos, generado con el engine PRE-refactor): si G1 se rompe, un número de ingresos EN
  PRODUCCIÓN se movió — no tocar el JSON para "arreglar" el test.
- **Split de quincena de un costo mensual = mitad y mitad** (decisión del usuario): burn
  parejo, Q1 = round2(m/2), Q2 = m − Q1 (el residuo lo absorbe Q2; Q1+Q2 === m exacto).
  ANUAL se mensualiza round2(monto/12) UNA sola vez. La decisión vive aislada en
  `montoQuincena` (engine §11). El neto puede ser negativo y se muestra tal cual; los
  vencidos "en riesgo" van APARTE del neto (regla previa de proyección, intacta).
- **Privacidad de salarios = entidad aparte + 3 capas de guards + TESTS PERMANENTES; RLS NO
  es capa** (fase 4): el salario NUNCA es columna de `TeamMember` — vive en `CostoRecurrente`
  (FK nullable `teamMemberId`, SetNull). Solo SUPER_ADMIN: fuente única `COSTOS_ROLES`
  (`isCostosRole` client-safe) → capa 1 `guardCostosAccess` PRIMERA línea de los 5 handlers
  (403, nunca 404 — corta antes de la DB); capa 2 la page ni ejecuta las queries para
  no-SUPER_ADMIN (props null, cero bytes en el RSC payload); capa 3 tabs filtrados + doble
  candado en el body + refreshes con early-return por rol. Prisma conecta con rol BYPASSRLS →
  la policy RESTRICTIVE deny-all de `CostoRecurrente` solo tapa el anon externo
  (`scripts/verify-rls-anon.ts` lo verifica read-only). Lo que FRENA un merge es
  `lib/cobranza/costos-privacy.test.ts` (guard por rol derivado del enum, handlers 403 sin
  tocar Prisma, escaneo estructural de routes, allowlist `TEAM_MEMBER_SAFE_SELECT` en las
  routes de team) — no un comentario.
- **Prohibiciones de fuga de costos (transversales)**: los costos y el neto JAMÁS entran a
  `SnapshotCartera.metricas`/`alertSet`/`resumen` ni a `DigestResult` (el corte es
  ADMIN-visible), ni al contexto del reporter mientras exista una voz visible para
  no-SUPER_ADMIN, ni a `BitacoraCobro`, ni a `AgentRun.output`. Sin alertas de costos por
  `AlertaCobro`. Los mensajes de `CobranzaError` de costos no llevan montos, y los
  `console.error` de sus routes no loguean el body.
- **Costo fijo vs gasto puntual = entidades SEPARADAS** (fase 4.5, 2026-07-11): regla mental
  "¿se repite? → costo fijo (`CostoRecurrente`, alimenta el burn); ¿pasa una vez? → gasto
  (`GastoPuntual`, con fecha)". No una entidad unificada con `tipo`: los campos casi no se
  solapan (frecuencia/activo/persona/base+factor no aplican a un gasto; fecha/tags no aplican
  a un recurrente) y la matemática es opuesta (el recurrente se EXPANDE a todos los buckets;
  el gasto cae ENTERO en el bucket de su fecha, sin mensualizar ni split). Ambos comparten la
  línea dura (referencia estimada, sin tracking de pago, sin fiscal) y la superficie
  SUPER_ADMIN-only. Viven bajo el mismo tab "Costos y gastos" (sub-nav Costos fijos | Gastos
  | Movimientos).
- **Gastos: futuro → caja neta, pasado → solo registro** (fase 4.5): un gasto con `fecha >=
  hoy` entra al lado sale de su bucket en la caja neta (`proyectarGastos` reusa el mismo
  `esqueletoBuckets`); un gasto pasado NO se bucketiza (`pasados`) — es solo reporting en el
  tab (totales por tag y por mes). Los buckets NUNCA arrancan al pasado (invariante del
  esqueleto compartido con ingresos). `loadCajaNeta` filtra `fecha >= hoy` antes de proyectar.
- **Tags de gastos = vocabulario ABIERTO normalizado a slug** (fase 4.5): NO el catálogo
  cerrado de proyectos (`lib/tags/catalog.ts`) — los eventos/campañas nacen todo el tiempo y
  un catálogo obligaría a deploy por cada uno. `normalizeGastoTag` (client-safe, en
  `lib/cobranza/schema.ts`: sin diacríticos, lower, espacios→guion, solo `[a-z0-9-]`, máx 40)
  corre en el form (preview) Y en el server (Zod) — lo que ves es lo que se guarda. Máx 8 por
  gasto, dedupe. El autocomplete es client-side sobre los gastos ya cargados (sin endpoint).
- **`finalizadoEl` (baja definitiva) ≠ `activo` (pausa)** (fase 4.5): son ortogonales.
  `activo=false` es pausa temporal (chip "Pausado", fuera del burn, reversible sin fecha);
  `finalizadoEl` es baja definitiva (chip "Finalizado", con fecha, va al Histórico). El motor
  proyecta un costo finalizado hasta el bucket que CONTIENE la fecha (entero, sin prorrateo —
  es referencia) y lo excluye después; el `totalMensual` lo incluye solo si `finalizadoEl >=
  hoy`. El burn del tile del panel aplica LA MISMA regla que el engine (si divergen, mienten).
- **Movimientos de costos = tabla APPEND-ONLY escrita SOLO por las mutations** (fase 4.5,
  patrón `BitacoraCobro`): `CostoMovimiento` registra ALTA/BAJA/REACTIVACION/PAUSA/
  CAMBIO_MONTO/ELIMINACION dentro de la MISMA `$transaction` que el cambio del costo, con un
  SNAPSHOT autosuficiente (nombre/categoria/moneda/frecuencia/monto) para leerse aunque el
  costo se borre (FK SetNull → costoId null tras el hard delete; el ELIMINACION se inserta
  ANTES del delete). Responde "en julio se fueron X, Y, Z y entró W". Un PATCH puede emitir
  varios movimientos (cambió monto Y pausó). Lleva montos de salarios → mismas 3 capas + RLS
  deny que `CostoRecurrente`; jamás se expone fuera de la superficie SUPER_ADMIN.

## Infra
- **Una sola Supabase** (local == PROD). Migraciones a mano. Scripts destructivos/masivos
  dry-run-first; el usuario aprueba el `--apply`.
