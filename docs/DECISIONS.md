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
- **Particularidades = desviaciones CURADAS con atribución (modelo `Particularidad`, NO
  `TimelineChange`).** *Por qué:* los gerentes del cliente veían el cronograma moverse pero no
  POR QUÉ ni QUIÉN; el log de auditoría (`TimelineChange`, `reason` autogenerado) es ruido de
  máquina. La particularidad es texto en lenguaje cliente + `party` (atribución) + `weeksImpact`.
  *Cruce al cliente:* gate por-registro `visibleExternal=true` en el chokepoint `readClientTimeline`,
  fail-closed, IGUAL que el filtro de SUSPENDED (el motor de permisos es sección×acción, no
  resuelve granularidad de registro). NUNCA cruzan `source`/`needsValidation`/`createdByEmail`.
  Van dentro de `publishedSnapshot` (congeladas al "Subir"). *Origen:* el CSE las crea a mano o
  acepta una propuesta del agente de avance (borrador `pendingParticularidades`, hermano de
  `pendingProgress` pero con apply SEPARADO — aceptar avance ≠ aceptar desviaciones; nada se crea
  sin que el CSE apruebe). *Schema:* ~~`db push` (aditivo), NO migración… Se sigue
  `npm run db:sync`~~ — **SUPERSEDED 2026-08-01**: `db push` quedó prohibido (dropeó
  `RoleProfile` una vez) y `db:sync` se eliminó de package.json. Lo que sigue vigente de esta
  decisión es el fondo: el repo NO usa `prisma migrate` clásico y la base compartida jamás se
  resetea. El flujo actual es SQL ADITIVO a mano + `prisma generate`, gateado por el guard
  anti-prod (ARCHITECTURE Parte 0 · cap. D).
- **Eje de tipificación de un HECHO detectado = su DESTINO (dónde aterriza + quién actúa), NO el
  tema.** *Por qué:* el agente de avance sacaba una bolsa mezclada de hechos con un solo balde
  (`Particularidad`), así que el tipo se degradaba (`SOLICITUD` = un pendiente/insumo del cliente
  disfrazado de desviación, sin `weeksImpact` → el resumen con atribución nunca sumaba y el cliente
  leía el mismo reclamo dos veces con "Pendiente de tu parte"). El eje correcto no es el tema (un DNS
  pendiente en un CRM y un asset pendiente en un sitio son el MISMO objeto: insumo que debe el
  cliente) sino el DESTINO. Destinos: *desviación fechada* → `Particularidad`; *insumo del cliente* →
  tarea `party=CLIENTE` (`client-blockers`); *riesgo interno/fricción* → `CsAlert` (watchdog, nunca
  cruza); *pedido de alcance nuevo* → entidad `ScopeRequest` (decide el CSL; diseñada, ver plan);
  *hallazgo de entrega* → `KnowledgeDocument`. *Prueba de admisión de un tipo:* quién actúa · dónde
  aterriza · qué pasa si nadie lo hace (dos tipos con la misma acción/persona/lugar son uno). *Regla:*
  el tipo vive en el HECHO (arriba), NO dentro de `Particularidad`; el apply RUTEA (código
  determinista). *Detección:* UN clasificador que viaja sobre una pasada de transcript ya existente
  (hoy el agente de avance), NUNCA N agentes por destino que relean el transcript (la pasada full-
  transcript es de las más caras del sistema). *Estado:* `Particularidad` reconcebida = desviación
  FECHADA, 2 kinds (`ATRASO` con `weeksImpact` OBLIGATORIO + `COMPROMISO`), `SOLICITUD` deprecado
  (filas legacy conservan el enum + fallback de render; se auditan con
  `scripts/migrate-particularidades-audit.ts`, que exporta sin borrar), `occurredAt` = fecha de la
  sesión del hecho, `sourceQuote` = cita interna que NUNCA cruza al cliente (fail-closed). El router
  de hechos + `ScopeRequest` quedan diseñados para construir tras un sondeo de distribución.
- **`TaskParty` se usa en DOS EJES; el criterio vive en cada prompt, no en el enum.** *Por qué:* en una
  TAREA `party` = *quién la ejecuta* (dueño) y el agente de detalle manda 4 de 5 tipos de fase a AMBOS
  (las sesiones son conjuntas); en una PARTICULARIDAD `party` = *quién CAUSÓ el corrimiento*. Es el
  mismo enum, el mismo `PARTY_META` y la misma pantalla, y el comentario del schema define `AMBOS =
  "trabajo conjunto (sesiones, talleres)"` — semántica de EJECUCIÓN. El agente de avance heredaba ese
  sentido y atribuía casi todo a AMBOS (en Wherex, 5 de 7 semanas), que es lo mismo que no atribuir y
  vacía de sentido al resumen. *Fix:* el prompt de avance define `party` como CAUSA, explícitamente
  distinta del dueño, con "AMBOS solo si podés nombrar la contribución de cada lado" y la aclaración
  de que la atribución NO se suaviza (el "lenguaje cliente" aplica al título). *Invariante del resumen:*
  los buckets de `summarizeParticularidades` SIEMPRE suman `totalWeeks` — un `party` desconocido cae en
  `SIN_ATRIBUIR` y se dice, en vez de sumar al total y a ningún bucket (el desglose no cerraba). La
  frase se RECALCULA en cada lectura (en `publishedSnapshot` se congela la data cruda), así que cambiar
  la redacción corrige retroactivamente lo publicado. *Si vuelve a morder:* separar el campo
  (`Particularidad.causedBy` propio) en vez de seguir compartiendo `TaskParty`.
- **Un solo predicado de atraso, por FECHA (`isOverdueByDate` + `overduePlannedEnd` en
  `weeks.ts`).** *Por qué:* antes había dos algoritmos (semana-vs-anchor en el Gantt/externo,
  fecha-vs-baseline en el panel de cartera); en cuanto le mostramos un número al cliente se
  contradecían. Ahora Gantt interno, vista externa, `client-blockers` y `summary.ts` comparten el
  MISMO predicado (fin planeado de la semana < hoy, excluyendo DONE/SUSPENDED). Efecto observable
  FLAGGED: el tag "Atrasada" del Gantt pasa de granularidad semanal a granularidad de día (más
  preciso, no rompe nada). El sombreado de "semana pasada" (cosmético) queda igual.
- **"Confirmar detalle" es un botón de primera clase, desacoplado de "Subir al cliente".**
  *Por qué:* `detailConfirmedAt` (gate que deja cruzar las tareas por semana) se seteaba SOLO como
  efecto secundario oculto de publicar; proyectos activos generaban el detalle y no lo confirmaban
  porque nunca publicaban. Ahora el CSE valida el detalle sin verse obligado a publicar (dos
  decisiones distintas); "Subir" lo sigue confirmando como red de seguridad idempotente.

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
- **Dos relojes independientes — facturar vs cobrar** (Tanda B, 2026-07 — el corazón del
  módulo): antes había UN reloj (`fechaProgramada + 3 días → rojo`) que mezclaba "¿facturaste?"
  (trabajo de Alex) con "¿te pagaron?" (mora del cliente). Cita de Alex: *"Nexus debería decir
  próximos pagos... y usted ahí va: por facturar, por facturar, por facturar. Facturado,
  facturado."* Un cobro sin facturar NUNCA es rojo — no es deuda del cliente, es backlog de
  Alex. Reloj 1 (¿facturaste?): `fechaEmision == null` → amarillo si está en ventana (`±15`
  días de `fechaProgramada`) o atrasado, gris si está lejos en el futuro. Reloj 2 (¿te
  pagaron?): `fechaEmision` real → azul mientras el crédito no corrió, rojo si se venció
  (`fechaEmision + creditoDias`). Semáforo (`semaforoCobro`/`semaforoCuenta`, `engine.ts`) y
  alertas (`computeAlertSet`) comparten EXACTAMENTE el mismo criterio de ventana y de crédito —
  nunca pueden divergir en cuál es la verdad de un cobro. `fechaEmision` (ya existía en el
  schema, nunca era escrita desde la UI) pasa a ser el PIVOTE del semáforo — se decidió no
  agregar un estado `FACTURADO` nuevo al enum `estado` porque ya existe el campo correcto y un
  estado nuevo hubiera sido una segunda fuente de verdad.
- **Crédito por cuenta, default global 15 días** (`CuentaFinanciera.creditoDias`, nullable →
  cae a `DEFAULT_CREDITO_DIAS=15` en `engine.ts`): es el término real que opera Alex con la
  mayoría de la cartera. Colby es la excepción conocida (90 días) y se carga a mano por cuenta.
  Rango del input 1-365 (sin techo artificial para que Colby entre cómodo). Reemplaza
  `terminosPago` como el dato que realmente alimenta el motor.
- **`terminosPago` deprecado, NO eliminado** (`CuentaFinanciera.terminosPago`, comentario
  `@deprecated` en el schema): confirmado por grep exhaustivo — 0 lectores en `engine.ts`,
  nunca alimentó ningún cálculo, solo era texto decorativo en el prompt del borrador de cobro y
  un dropdown en los 2 formularios de cuenta. Se saca de ambos formularios (`CuentaDrawer.tsx`,
  `NuevaEmpresaModal.tsx`) y del prompt del agente (`borrador-cobro.ts`, ahora usa
  `creditoDias`), pero la columna se queda escribible (importador, alta manual) para no romper
  esos caminos sin necesidad real de tocarlos.
- **`fechaProgramada` NO se hizo nullable** (evaluado y descartado): ≥5 usos de
  `isoDay(c.fechaProgramada)!` en `queries.ts` (non-null assertion) que compilarían pero
  reventarían en runtime el día que la columna aceptara null. Colby-style "sin fecha
  programada" no hace falta resolverlo así — `fechaCobro` (cuándo entró la plata) ya es
  nullable y cubre ese caso. `fechaEmision`, en cambio, sí era nullable desde antes — es el
  campo correcto para modelar "todavía no pasó".
- **Auditoría de "Marcar facturado" — mismo patrón que `confirmadoPor`/`confirmadoEn`**:
  `Cobro.facturadoPor`/`facturadoEn` se setean/limpian dentro de `cambiarEstadoCobro` (mismo
  chokepoint único que INV3) al transicionar `fechaEmision` de/hacia `null`; si solo se edita
  la fecha (no-null → otro no-null) la autoría original NO se re-escribe. Invariante espejo de
  INV3 en `check-invariants.ts` (INV5): ningún `Cobro` con `fechaEmision` sin `facturadoPor`.
- **`POR_COBRAR` hoy es 100% manual y sin auditar** (hallazgo de la verificación V1 de Tanda B):
  solo se alcanza por selección manual en el `<select>` del cronograma — nadie más lo dispara
  (ni el digest, ni un cron, ni un cálculo derivado) y no tiene un `confirmadoPor` equivalente.
  Confirma que antes de esta tanda NO existía ningún vínculo real entre "facturé" y el estado
  del cobro — exactamente el hueco que cierra `fechaEmision` real, no el enum `estado`.
- **2 bugs corregidos en revisión antes de implementar** (plan rechazado una vez, ver historial
  de la tanda): (1) el primer borrador de `semaforoCobro` nunca devolvía gris — todo cobro sin
  `fechaEmision` caía en amarillo sin mirar la ventana, `fechaProgramadaISO` era un parámetro
  muerto; con la data real (~35 cuentas × 3-4 cuotas) el panel se hubiera llenado de amarillo
  falso. Fix: la rama "sin `fechaEmision`" ahora chequea la ventana (`≥ -15` días) igual que
  las alertas. (2) una promesa de pago sobre un cobro SIN facturar devolvía azul ("nada que
  hacer"), escondiendo que Alex todavía tenía que facturar. Fix: el Reloj 1 es SIEMPRE
  prioritario — la promesa solo se evalúa una vez que `fechaEmision` existe.
- **Hallazgo para la Tanda C — el eje temporal de `proyectarIngresos` está corrido**: tras
  Tanda B, el tab Cobros calcula "vencido" desde `fechaEmision + creditoDias`, pero
  `Proyección`/`Reportes` siguen con `fechaProgramada + UMBRAL_VENCIDO_DIAS` (deliberadamente
  intocado esta tanda — ver V4). Con crédito de 15 días, ese "vencido" aparece INFLADO
  (incluye cobros que siguen dentro del crédito) — mitigado con un caveat textual en
  `ProyeccionPanel.tsx`/`ReportesPanel.tsx` apuntando a la pestaña Cobros como fuente correcta,
  NO con un fix de motor. El arreglo real no es un swap de predicado: `proyectarIngresos` HOY
  agrupa por `fechaProgramada`, que asume implícitamente que la plata llega el día que se
  factura — con crédito de 15 días, la proyección ENTERA (no solo el bucket de vencidos) está
  corrida ~15 días temprano. El fix real es mover el eje temporal completo a la fecha ESPERADA
  de cobro (`fechaEmision + creditoDias`) y decidir cómo tratar los cobros no facturados y
  vencidos por fecha (backlog de Alex, no riesgo del cliente) — es rediseño de la
  clasificación, se piensa en la Tanda C junto con aging/DSO. Es literalmente lo que Alex
  necesita para planear el flujo de caja entre Mercury y Costa Rica.
- **`GRACIA_FACTURACION_DIAS = 5`, no 0** (recalibración 2026-07, corrige a la Tanda B):
  `GRACIA_FACTURACION_DIAS` es el colchón tras `fechaProgramada` sin `fechaEmision` antes de que
  la alerta "falta facturar" escale de `COBRO_PROXIMO` (MEDIA) a `FACTURACION_ATRASADA` (ALTA).
  La Tanda B lo dejó en 0 con el supuesto de que Alex factura desde el día 1 ("por facturar…
  facturado, facturado"). **El supuesto era incorrecto:** Alex aclaró que facturar es un
  **período de facturación + envío de ~5 días** (la fecha de cobro no siempre cae entre semana).
  Con gracia 0, `FACTURACION_ATRASADA` saltaba en ALTA el día 1 del proceso normal, cada
  quincena, en cada cobro — ruido puro que erosiona la confianza en el panel. Con 5, los días
  1–5 son `COBRO_PROXIMO` (Alex en su ventana normal) y recién al día 6 escala a ALTA. Solo
  cambia la urgencia de la ALERTA; NO cambia el color del semáforo (sigue amarillo sin facturar).
  Blast radius: una línea (`engine.ts`) + un test (`J6`); los golden JSON no se mueven.

## Cobranza — carga del histórico de Alex (diseño; ejecución en pase con gate)
> **EJECUTADA el 2026-07-23** — ver "Cobranza — lo que la carga real cambió del diseño" más abajo:
> el archivo trajo cosas que el diseño no anticipó (fórmulas como montos, totales rotos, moneda).
> Estas decisiones se tomaron para la carga del archivo histórico de Alex (~70 registros, estado
> en el color de celda). El archivo AÚN NO EXISTE cuando se escriben — son el diseño acordado.
> La construcción del loader, la limpieza de seeds y la carga corren en un segundo pase con gate
> (Fase 0 inspección → dry-run → aprobación → apply). Regla dura: cero fabricación.
- **El primer corte es honesto por diseño — no reporta un "cobrado" falso (V1).**
  `computeMetricasCartera` guarda la ventana `(desdeUltimoCorteISO, hoy]` con
  `if (opts.desdeUltimoCorteISO && …)`; en el primer corte no hay snapshot anterior →
  `runCobranzaDigest` pasa `desdeUltimoCorteISO = null` → `totalCobradoDesdeUltimoCorte` queda en
  **0** (no barre toda la historia). En cambio `diasPromedioCobro`/DSO SÍ acumulan sobre todos
  los `COBRADO` de inmediato — eso es deseable ("ver quiénes fueron y qué dieron"), no un bug.
  Aun así, el corte semanal NO se corre hasta que la carga esté aplicada y aprobada.
- **El wizard CSV NO sirve para esta carga (V2).** (a) El estado vive en el color de celda y el
  export a CSV lo pierde entero (el wizard es `accept=".csv"` + papaparse). (b) Aún con el color,
  el pipeline de import nunca hace backfill de cobros: `clampInicioCicloCorriente` fuerza el
  inicio al ciclo corriente (máx 1 catch-up) y solo crea `Cobro` vía `generateCobros`
  (PROGRAMADO/catch-up — jamás `COBRADO`/`fechaEmision` histórico). Se necesita un camino de
  lectura nuevo (que preserve color) + un apply por fila nuevo (estado/fechaEmision/fechaCobro
  reales), **reusando** el staging (`ImportacionCobranza`/`ImportacionFila` + cola de revisión) y
  los validadores de `import-core.ts`. Cómo leer el color se decide en la Fase 0 (con el archivo
  en mano): recomendado = export `.xlsx` + `exceljs` (dev-dep, lee fills; `officeparser` es
  text-only, SheetJS community no lee fills confiablemente); alternativa = Google Sheets API con
  `includeGridData` (reusa la integración Google pero exige el scope `spreadsheets.readonly` +
  re-consent — overkill para una carga única).
- **Mapeo color → estado del cobro (V3):** sin color/futuro → `PROGRAMADO`, `fechaEmision=null`
  (gris). Amarillo (facturado, esperando) → `PROGRAMADO` + `fechaEmision = fechaProgramada`:
  aproximación consciente con error ≤ ~5 días, SIEMPRE en el lado seguro (la factura real sale
  DESPUÉS de la programada → el crédito arranca antes de lo real → se persigue temprano, nunca se
  deja pasar deuda), y se disuelve sola cuando el cobro se paga. Se registra la aproximación en
  `Cobro.notas`, no como dato duro. `POR_COBRAR` NO se usa: quedó vestigial post-Tanda-B (solo lo
  escribe el `<select>` manual del cronograma, solo lo lee `semaforoLegacyPorFecha` para el
  aging/DSO legacy) — el estado ya no pinta el color, lo hace `fechaEmision`.
- **Verde (pagado) → `COBRADO` con `fechaCobro` histórica EXPLÍCITA, nunca "hoy".**
  `cambiarEstadoCobro` defaultea `fechaCobro = new Date()` si no se pasa — un backfill con ese
  default diría que todos los pagos entraron hoy y envenenaría `diasPromedioCobro`/DSO. La fecha
  de pago real y explícita es obligatoria. `confirmadoPor = "import:sheet-historico"` (INV3
  exige no-null; un identificador de import auditable, no un humano falso). **Si el archivo no
  trae fecha de pago por fila → PARAR y avisar; no se aproxima** (la decisión la toma el usuario).
- **`CONECTOR` = valor nuevo del enum de tipo de servicio (V4).** Los tabs de Alex mapean a
  `WEB` (sitio web CR/intl, continuidad web), `CRM` (continuidad CRM), `SOPORTE`, `IMPLEMENTACION`
  (impl CR/intl). "Conectores" no tenía casa y NO se fuerza a `OTRO` en silencio → se agrega
  `CONECTOR` al enum `CobranzaTipoServicio` + espejos + label (migración aditiva, en el pase de
  carga). CR vs internacional NO va en el tipo — va en `CuentaFinanciera.tipo`
  (`NACIONAL`/`INTERNACIONAL`). `modalidad`: continuidad/soporte/suscripción → `RECURRENTE`;
  web/implementación/conectores → `PROYECTO`.
- **Limpieza antes de cargar (V5):** hoy hay seeds demo (`[demo cobranza]`, `sourceExternalId`
  `demo-`, snapshots `seed-demo-historia`); `scripts/cleanup-cobranza-demo.ts` es dry-run por
  default y los borra (clientes solo si no tienen proyectos). El script NO contempla la cuenta
  accidental **ALFA+ (LISJ)** (sin marca demo) — en el pase de carga se verifica en el dry-run si
  esa fila existe y, si existe, se extiende el cleanup por id explícito. La limpieza se hace justo
  antes de cargar, no antes, para no dejar el módulo vacío mientras se espera el archivo.
## Cobranza — antigüedad, tandas quincenales y reportes vivos (2026-07-24)
> Con los $301k reales cargados, el módulo dejó de servir para operar. Cinco pedidos del usuario:
> ordenar por antigüedad, subdividir lo vencido en 30/60/90, sacar lo vencido de "Esta quincena",
> pasar de ciclo semanal a quincenal, y devolver los reportes.
- **El bug de "Esta quincena" era de AGRUPACIÓN, no de fechas.** La cola agrupaba por el color del
  semáforo, y `semaforoCobro` —por el diseño de los dos relojes— nunca marca vencido un cobro sin
  `fechaEmision` ("no facturar es trabajo de Smarteam, no mora del cliente"). Consecuencia: todo lo
  atrasado sin facturar caía en "Esta quincena" (15 cobros el 2026-07-24, el más viejo de mayo).
  Ahora la agrupación la decide `clasificarCobro` (`lib/cobranza/antiguedad.ts`) por **fecha +
  facturación**; el semáforo NO se tocó y sigue gobernando el color del chip. Son dos preguntas
  distintas y confundirlas era el defecto.
- **"Falta facturar" es un grupo propio y va PRIMERO** (decisión del usuario). Mezclarlo con lo
  vencido invita a mandarle un correo de cobro a un cliente que no tiene factura emitida.
- **Los cortes 30/60/90 tienen una sola definición.** `bucketAntiguedad` vive en `engine.ts` (donde
  ya estaba el ternario inline del snapshot) y `antiguedad.ts` lo reexporta para la UI — el orden es
  ese y no al revés para no crear un ciclo de imports. La cola y los reportes no pueden discrepar.
- **Las tandas 1-5 y 15-20 son VENTANAS DE TRABAJO, no fechas de cobro** (decisión del usuario): no
  se movió ninguna fecha ni monto de los 202 cobros cargados. Definen cuándo abre la lista de
  trabajo y cuándo corre el corte. El cron `cobranza-weekly` (lunes) pasó a `cobranza-quincenal`
  (día 1 y 15, arranque de cada tanda) — el semanal partía el ciclo por la mitad y comparaba
  períodos que no se corresponden.
- **Reportes no estaba roto: estaba vacío.** Los charts exigen ≥2 cortes y quedaba 1 (los otros 10
  eran del seed de demo). El arreglo de fondo NO es bajar el mínimo: es que **el estado de HOY no
  dependa de la historia** — se calcula en vivo desde la cola con el mismo helper que la lista, y el
  aviso de "hacen falta 2 cortes" queda acotado a las líneas de tendencia. Se borró además el
  snapshot del 10-jul (medía la cartera CON las cuentas de demo adentro) y se corrió el primer
  corte real.
- ✅ **RESUELTO (ver la sección siguiente): la deuda de las dos definiciones de "vencido".**
  Finanzas eligió el criterio de los dos relojes y el módulo entero se alineó.

## Ciclo de vida — el KICKOFF es un paso OPCIONAL (2026-07-24, decisión de negocio)
> Disparador: al abrir GRUPO INVE | DOCUSIGN + HUBSPOT lo primero que se leía era «Kickoff sin
> publicar hace 172d **hace 172 días**» en rojo, sobre un proyecto sano para su etapa (handoff
> corrido, 6 fases, sugerencias frescas). La regla es: **el handoff es la base; un proyecto puede
> legítimamente no llevar kickoff**.
- **El kickoff ya NO alarma.** Se retiró `kickoff_sin_publicar` (y `KICKOFF_PUBLISH_GRACE_DAYS`)
  de `lib/portfolio/summary.ts`. Afectaba a **27 de los 32** proyectos con handoff (84 %) y ninguno
  tenía override manual: nadie lo estaba compensando a mano, simplemente se leía mal.
  La higiene de publicarlo sigue visible como **chip informativo del setup** (`deriveSetup`), que
  es el tratamiento que corresponde a algo opcional.
- ⚠ **Lo que NO se tocó, a propósito**: `kickoffPublishedAt` sigue siendo el **gate duro de la
  vista del cliente** (`lib/external/kickoff-view.ts:55`) — sin publicar, el cliente no ve la
  página. Son dos cosas distintas: que no sea obligatorio para el equipo no significa exponerlo.
- **La edad de las alarmas tempranas se cuenta desde la FECHA DE ARRANQUE del cronograma**
  (`anchorStartDate ?? lastGateAt ?? projectCreatedAt`). Antes salía de `hubspotCreatedAt`, que le
  cargaba a CS días en los que el proyecto ni existía en Nexus (Grupo Inve: 172 d de HubSpot contra
  52 reales). Un arranque **futuro** da edad negativa → sin alarma, que es lo correcto: un proyecto
  que todavía no arrancó no tiene nada que reclamar. `anchorStartDate` ya viajaba en `SummaryInput`
  (`load.ts:237`) — no hizo falta threadearlo por el DTO del ciclo de vida.
- **Bug de copy arreglado**: `summary.ts` metía «hace 172d» en el label y `project-actions.ts:216`
  le concatenaba «hace 172 días». Ahora el label es solo el hecho y la frase la arma un único
  lugar (donde vive el `plural()`). El test no lo agarraba porque su fixture usaba el label limpio:
  **productor y consumidor habían divergido y nadie lo veía.**
- **Las sugerencias del Gantt muestran TODOS los cambios** (`describeChanges`, ordenados por
  impacto). El badge mostraba `changes[0]` + `+N` y lo escondido solía ser lo que MUEVE el
  calendario (duración, semana de inicio) mientras el renombre cosmético ocupaba el lugar visible.
- ⏸ **PENDIENTE — el modelo de etapas.** `inferLifecycleStage` sigue cortando en `HAND_OFF` hasta
  que el kickoff se publique, así que esos proyectos siguen mostrando «Etapa 1/9 · Hand Off». El
  usuario pausó ese rediseño para pasar primero las descripciones de cada estado. **No tocar
  `stage-engine.ts` hasta entonces.**
  - **La regla sigue en pie, y en `bb28efa` se tocó igual — dicho acá para que no siente
    precedente.** Fue un *hoist* puro: el array local con la cadena de salida subió a constante
    exportada (`STAGE_EXIT_STEPS`) para que `lib/flow/stage-pieces.ts` pudiera compararse contra
    el motor real en un test. **Cero cambios de comportamiento** (los 14 tests del ciclo de vida
    siguen pasando sin tocarse). Lo que la regla prohíbe es cambiar CÓMO se decide la etapa —
    orden, gates, criterios—, no exportar lo que ya estaba escrito. Ante la duda: si el diff
    cambia lo que devuelve `inferLifecycleStage` para algún input, está prohibido.

## Sync de HubSpot a demanda: el botón "Actualizar" de la ficha del cliente (2026-08-02)
> Disparador: Elías pidió "un CTA gris arriba, que traiga la info de HubSpot sobre sus proyectos".
> La primera hipótesis —que era redundante porque el sync ya corre al abrir la ficha— resultó
> FALSA al verificarla, y en el camino apareció un botón roto que llevaba meses en pantalla.
- **No era redundante: recargar la página NO trae datos nuevos.** El sync del montaje
  (`WorkspaceClient.tsx`, `setTimeout` de 1,5 s) llama `runHubspotSync()` SIN `force`, así que
  respeta el cooldown de 10 min y devuelve ceros. Los dos disparadores manuales que existían son
  inalcanzables en el caso normal: el "Reintentar" del toast solo aparece si el `fetch` TIRA, y el
  del banner ámbar solo se pinta si el cliente quedó con CERO proyectos. El caso que importa
  —"acabo de crear el proyecto en HubSpot, traelo"— no tenía puerta.
- **El "Reintentar" del banner estaba roto y nadie lo notó**: llamaba `runHubspotSync()` sin
  `force`, o sea que dentro del cooldown —que la auto-sync del montaje YA había reclamado, o sea
  siempre— no hacía absolutamente nada. Los comentarios de TRES archivos (el módulo, la route y el
  propio handler) daban por hecho que forzaba. Es el modo de falla que este trabajo tiene que
  evitar repetir: un botón que no contesta es peor que no tener botón.
- **Primero los frenos, después el botón.** `force` saltea el cooldown entero y no tenía ningún
  otro tope; exponerlo en un click sin salvaguardas era una palanca. Se agregaron tres, y viven en
  el SERVER —no en la UI— porque ahí no dependen de que el cliente se porte bien: (1) **mutex de
  corrida viva por cliente** (el segundo llamador se engancha a la promesa en curso y recibe su
  resultado, marcado `omitido:"en_vuelo"`); (2) **piso duro de 60 s** que ni `force` saltea —el
  mutex cubre lo simultáneo, el piso cubre "una atrás de otra"—; (3) **try/catch de P2002** en la
  creación, que es check-then-act sobre `Project.hubspotServiceId @unique`: sin eso una carrera
  tiraba un 500 que cortaba la corrida ANTES de la reconciliación y de `resolverHermanos`, dejando
  al cliente a medio sincronizar y con el cooldown ya consumido (o sea sin auto-reparación por 10
  minutos). Esto NO es un refresco inocuo: el sync desactiva proyectos por tres caminos y reescribe
  `hermanoCsProjectId`, que decide si un proyecto se factura aparte.
- **`SyncResult.omitido` existe porque una corrida frenada devolvía ceros indistinguibles de "miré
  y no había nada nuevo".** `debug` no servía: es prosa para diagnosticar, no una señal que la UI
  pueda ramificar. Con el campo, el botón puede decir "se sincronizó hace un momento" en vez de
  quedarse mudo — que era exactamente el defecto del banner.
- **El éxito dejó de ser mudo.** Hasta ahora el sync solo hacía `router.refresh()` si algo había
  cambiado: sin cambios no pasaba NADA en pantalla. El modo `avisar` (solo cuando lo dispara una
  persona; la corrida de fondo sigue callada) sigue el patrón de la casa para acciones que hablan
  con un tercero: `toast.info` al arrancar + `toast.success` CON CONTEO + `toast.error` con el
  mensaje del server tal cual (los errores del sync ya vienen redactados para humano).
- **Va en la fila de pestañas, NO en la cabecera** (contradice la ubicación pedida, con razón
  técnica): la cabecera es `layout.tsx`, un Server Component; un botón ahí obliga a una isla
  cliente NUEVA que no conoce el estado `syncing` del workspace → dos indicadores girando por
  separado y una corrida manual encima del auto-sync del montaje. Además esa cabecera ya tiene 4
  controles con el MISMO gris terciario: un quinto le daría a la acción más cara y más mutante del
  sistema el mismo peso visual que el engranaje de Configuración. La tab bar está 40 px más abajo,
  ya es cliente y ya tiene el estado. El scroll horizontal se movió al contenedor INTERNO para que
  el botón no se vaya con las pestañas cuando el cliente tiene muchos proyectos.
- **"Gris que no se note" = `variant="secondary"`, no `ghost`.** En este repo `ghost` es brand
  translúcido; la variante discreta es `secondary` (`bg-surface-hover` + `border-line` +
  `text-fg-secondary`). Cero grises crudos: el archivo no suma ofensores al ratchet.
- **El ORDEN de los tres frenos importa, y el primer borrador lo tenía al revés** (corregido por
  la revisión adversarial del mismo día): el mutex iba ANTES del cooldown, así que la corrida
  automática del montaje —que nadie está esperando— se enganchaba a la corrida viva y sostenía su
  request HTTP los minutos que durara, para recibir el MISMO snapshot que el cooldown devuelve
  gratis. Con varias personas abriendo la misma ficha eso acumula requests colgados justo bajo la
  presión que estos frenos vinieron a bajar. Orden correcto: **cooldown (para quien no espera) →
  mutex (para quien sí) → piso**. El mutex queda incondicional igual, para el borde de una corrida
  más larga que el cooldown.
- **Un mutex sin techo de vida es un candado permanente.** El cliente de HubSpot no tiene timeout
  configurado; una llamada que nunca resuelve dejaba la entrada del Map viva para siempre y toda
  llamada posterior de ese cliente se enganchaba a una promesa muerta. `MUTEX_MAX_MS` (5 min)
  permite arrancar de nuevo pasado ese punto — se aceptan dos corridas simultáneas en ese borde a
  propósito: es justo lo que cubre la guarda de P2002, y una corrida de más cuesta infinitamente
  menos que una ficha trabada para siempre. El `.finally` compara la PROMESA (no la clave) antes
  de borrar, o una corrida colgada que despierta tarde le sacaría el mutex a la corrida nueva.
- **El piso se mide desde que TERMINÓ la corrida anterior, no desde que arrancó.** El cooldown se
  reclama al arrancar (y así queda: reclamarlo temprano es lo que hace que un fallo también
  espacie), pero medir el piso desde ahí lo dejaba vencido en el instante en que terminaba una
  corrida larga — justo el caso caro que el piso quería espaciar.
- **El mensaje del piso NO puede afirmar que se sincronizó.** El piso también aplica cuando el
  intento anterior FALLÓ, así que "se sincronizó hace un momento" sería mentira en el peor momento
  posible. Habla de INTENTO, que es cierto siempre.
- **La guarda de re-entrada del botón mira SOLO las corridas manuales.** Atarla al contador global
  de syncs de fondo tenía dos consecuencias falsas: el botón se pintaba "Actualizando…" al abrir la
  ficha por una corrida de Google que nadie pidió, y en esa ventana el "Reintentar" del toast de
  error se tragaba el click sin decir nada (y el toast se cerraba igual). Un botón que miente sobre
  lo que hace y que a veces no hace nada sin avisar es el defecto que esta tanda vino a cerrar.
- **El catch de P2002 NO escribe `tags`.** El primer borrador ponía `mergeHubTag([], hubTag)`, que
  declara "esta fila no tiene nada curado" — y es falso en un caso real: un proyecto dado de alta
  desde Nexus nace con los tags heredados del business case. Ese update habría borrado curaduría
  humana en silencio. No tocar el campo es correcto en todos los casos: los tags los acaba de
  escribir la corrida que ganó la carrera.
- **Sin capability nueva.** El endpoint ya existía y ya está gateado por `guardAccessToClient`; el
  botón no amplía a quién le llega el sync —le llega a todo el que abre la ficha, porque la
  auto-sync ya corre sola— solo lo hace pedible. Agregar una celda al registry para una acción que
  ya ocurre sin permiso extra sería teatro.

## Cobranza — criterio ÚNICO de "vencido" (2026-07-24, decisión de Finanzas)
> **Vencido = factura EMITIDA + crédito del cliente consumido.** Lo que no se facturó NO está
> vencido: *"siempre van a haber facturas sin hacer y eso no significa que estén vencidas, solo
> que no les ha llegado su tiempo de hacerse"*. Antes convivían dos criterios y el módulo mostraba
> **$80.959** (cortes y proyección) contra **$60.997** (lista de cobros) para la misma cartera.
- **Las alertas YA estaban en este criterio** — `computeAlertSet` calcula
  `vencimiento = fechaEmision + creditoDias` desde Tanda B, y lo no facturado sale como
  `FACTURACION_ATRASADA`. No se tocó nada del motor de alertas: el trabajo fue traer las MÉTRICAS
  a donde las alertas y la cola ya estaban.
- **Se borraron `semaforoLegacyPorFecha` y `semaforoCuentaLegacyPorFecha`.** Dejarlas sin lectores
  era una invitación a que el criterio viejo se colara de nuevo. `computeMetricasCartera` y
  `proyectarIngresos` usan `semaforoCobro`/`semaforoCuenta`, los mismos de la cola.
- **`semaforoCobro` tiene un estado que el viejo no tenía: AZUL** (facturado y todavía dentro del
  crédito). Olvidarlo hacía DESAPARECER esa plata de los totales — bug real cazado por el test N2.
  Azul y amarillo son ambos "por cobrar" (uno espera al cliente, el otro espera la factura); los
  tres totales son exhaustivos y `totalSinFacturar` cuenta aparte, transversal.
- **`totalSinFacturar` es la contrapartida honesta de sacar la plata del vencido**: no desaparece,
  tiene su propia línea en las 4 pantallas. En la proyección y la caja neta va como bloque
  `porFacturar`, FUERA del neto: no es vencido, pero sin factura no hay fecha creíble de ingreso.
- **El DSO pasa a medirse solo sobre lo FACTURADO** (decisión de Finanzas): mide cuánto tarda el
  CLIENTE en pagar, no cuánto tardamos en emitir. Sube de 96,1 a **108,8 días** — el número era
  más bajo porque lo sin facturar, que es más reciente, lo estaba disimulando.
- **`MetricasCartera.version` → 2.** El corte cambia de significado y tiene que distinguirse.
- **Los golden se regeneraron** (proyección y caja neta) con `fechaEmisionISO` en los fixtures y un
  set nuevo `sinFactura` que ejercita la rama `porFacturar`. Se verificó cobro por cobro que en los
  8 casos la suma `vencidos + porFacturar + buckets + fueraDeHorizonte` sigue dando 39 de 39: el
  cambio reclasifica, no pierde plata. ⚠ El script de regeneración debe emitir EXACTAMENTE la forma
  que assertea el test — la primera pasada se comió `gastosPasados`/`gastosFueraDeHorizonte` y el
  golden habría dejado de vigilarlos en silencio.
- **Verificado contra la cartera real**: las 4 pantallas (Cobros, Reportes, Proyección, Caja neta)
  reportan vencido **$60.997**, pendiente de facturar **$12.170,66** y DSO **108,8 d**, al centavo.

## Cobranza — lo que la carga real cambió del diseño (2026-07-23, ejecutada)
> Carga aplicada: **53 servicios · 202 cobros · $301.347,98** de "Facturaciones 2026" a 46 cuentas.
> Decodificador puro en `lib/cobranza/facturaciones-sheet.ts` (+28 tests); loader en
> `scripts/import-facturaciones-xlsx.ts` (dry-run por default); resolución de clientes revisada y
> versionada en `scripts/data/facturaciones-clientes.json`.
- **Una celda con FÓRMULA puede ser un cobro real — no se descartan en bloque.** El primer parser
  aceptaba solo números planos (para saltar las columnas de IVA, que son `=B3*0.13`) y eso borraba
  clientes enteros: Kaizen Kapital (`=7167*3`, **$21.501**), MSC Payroll (`=8400/5`), Bluesat
  Welcome kit (`=1500/6`), AE I TEC (`=1620*2`). En total **$41.922** que no se estaban cargando.
  La regla que separa los dos casos es la REFERENCIA A OTRA CELDA: aritmética sobre literales =
  monto escrito con calculadora; cualquier letra en la fórmula (`SUM`, `B3`) = derivado → se
  descarta. Vive en `montoDeCelda`.
- **Las filas de totales del propio documento están rotas y SUB-suman.** `SUM(H3:H4)` sobre 6
  clientes, `SUM(O2:O8)` arrancando en el encabezado, columnas sin fórmula: las hojas no reportaban
  ~$10.4k. El cruce contra esa fila quedó como control INFORMATIVO en el reporte del loader, nunca
  como validación — lo leído celda por celda es la verdad. (Argumento fuerte para dejar el Excel.)
- **`POR_COBRAR` sí se usa (corrige V3).** El diseño lo daba por vestigial y mandaba el amarillo a
  `PROGRAMADO + fechaEmision`. Pero el enum lo define como "factura en curso (amarillo)", que es
  exactamente el caso: amarillo → `POR_COBRAR` + `fechaEmision`, blanco → `PROGRAMADO` sin emisión.
- **NO se crea `PlanDePago` para lo importado.** La grilla mezcla quincenas dentro de un mismo
  servicio (Ecoquintas ene30/feb15/feb30) y `cobroDateFor` deriva el día de UN solo ancla
  (`diaCobroAncla ?? día del arranque`) → cualquier plan reproduciría fechas distintas a las
  cargadas y el engine propondría cambios fantasma. Los cobros van directos con
  `origen = IMPORTACION` y `numCuota` = orden cronológico: el `@@unique([servicioId, numCuota])`
  da la idempotencia y, sin plan activo, `materializeCobros` ni corre. El plan se configura después
  desde el panel, servicio por servicio.
- **Moneda: TODO en USD** (confirmado con el usuario contra una indicación previa de "CR en
  colones"): las 7 hojas, incluidas las de Costa Rica, están formateadas `"$"#,##0.00`. El IVA 13%
  es costarricense pero se factura en dólares. Cero conversión FX.
- **El riesgo a cubrir en la resolución de clientes es el DUPLICADO, no el faltante.** Crear un
  cliente que ya existe parte su cartera en dos fichas. Por eso "dudoso" es deliberadamente laxo
  (comparte un token, o el documento lo anota como "… I `<cliente>`", o es su ACRÓNIMO) y nunca se
  aplica solo. El acrónimo se agregó tras cazar **CAV = "Club de Amantes del Vino"**, que ya existía
  con cuenta y se iba a duplicar. Los 11 dudosos se resolvieron a mano y quedaron en el JSON.
- **La fila del documento es un SERVICIO, no un cliente.** Acccsa, Ecoquintas, Honda, Ferretería
  Noelito, AMC, Iberorutas, Construtecho y Bluesat aparecen en varias filas/pestañas: 49 nombres
  distintos → 45 clientes de Nexus. Dedup extra por HUELLA (nombre + montos + fechas + colores)
  para "Honda Soporte I 6 Meses", que estaba idéntico en dos pestañas.
- **Las fechas de emisión y de pago son la QUINCENA del documento, no dato bancario.** El archivo
  no trae fecha real de pago (V3 mandaba PARAR y avisar): se avisó, el usuario eligió usar la
  quincena, y cada `Cobro.notas` lo dice explícitamente. `confirmadoPor = "import:facturaciones-2026"`.
- **Las 11 cuentas preexistentes estaban en el default de fábrica** (CRC, `PENDIENTE_DATOS`, sin
  procedencia, 0 cobros) — nunca configuradas. El loader las completa a USD; a cualquier cuenta ya
  tocada a mano no le escribe nada (`update: {}`), para no pisar créditoDías/correo/estado curado.

- **Costos/Caja neta salen a su propia unidad "Finanzas"** (Pieza 1, tanda 2026-07): Alex pidió
  poder analizar costos/caja neta separado de la operación diaria de cobros — "debería ser otra
  unidad completamente distinta". Sidebar: "Finanzas" agrupa Cobranza · Costos y gastos · Caja
  neta (`FinanzasFlyout.tsx`, mismo patrón que `MarketingFlyout.tsx`). Rutas nuevas top-level
  `/finanzas/costos` y `/finanzas/caja-neta`; `/cobranza` NO se mueve — moverlo rompería los
  imports RELATIVOS internos de `CostosPanel.tsx`/`CajaNetaPanel.tsx` (que se quedan en
  `components/cobranza/` y se importan desde wrappers nuevos en `components/finanzas/`,
  excepción deliberada al aislamiento por módulo) y hubiera obligado a tocar las 10 rutas de
  API + su test estructural de privacidad — cero necesidad. El gate de las 2 páginas nuevas pasó
  a ser AUTÓNOMO (`isCostosRole(role)` solo, ya no depende de `cobranza.read`): `COSTOS_ROLES`
  (SUPER_ADMIN) siempre fue subconjunto estricto de `COBRANZA_ROLES` y SUPER_ADMIN es all-true
  en el engine de permisos, así que desacoplar no mueve a nadie de acceso real — y es más
  honesto conceptualmente para una unidad que ahora es "otra cosa". Trade-off aceptado: Caja
  neta pierde el auto-refresh en vivo cuando se registra un pago desde OTRA pestaña del
  navegador (antes vivían en el mismo tab-set de `CobranzaClient`); el dato sigue correcto, se
  refresca con el botón "Actualizar" del panel — no es una regresión de datos.
- **`razonSocial`/`cedulaJuridica` van en `CuentaFinanciera`, no en `Client`** (Pieza 4, tanda
  2026-07): Alex las necesita para conciliar con Odoo/Mercury — un concern de Finanzas puro.
  `CuentaFinanciera` ya se declara en su propio comentario de schema como "todo lo que Finanzas
  necesita saber" y ya tiene el patrón `fuente`/`fuenteIdExterno` para matching con sistemas
  externos — mismo lugar natural. `Client` lo tocan ~67 archivos de módulos no relacionados
  (HubSpot sync, sesiones, handoff…); agregarle campos legal-only ahí aumentaba la superficie
  que esos módulos podrían leer/exponer sin necesidad. Contra: no todo `Client` tiene una
  `CuentaFinanciera` configurada todavía (1:1 opcional) — si otro módulo (legal, HubSpot) los
  necesitara a futuro sin cuenta configurada, se resuelve entonces (mover o duplicar-sincronizar);
  hoy el pedido es 100% de Finanzas. Sin `@unique` en `cedulaJuridica` a propósito: un holding
  puede facturar bajo varios nombres comerciales con la misma cédula (caso real mencionado por
  Alex — "Grupo Petróleo" / "Clínica Oceánica") y forzar unicidad rompería esa carga histórica.
  Aplicado con `prisma db execute` (DDL aditivo a mano), no `db push`: el dry-run de
  `migrate diff` reveló drift preexistente de Timeline (`statusChangedAt`/`statusChangedByEmail`/
  `statusSource` + enum `TimelineStatusSource`) no relacionado con esta tanda — un `db push`
  normal los hubiera DROPEADO de PROD. Resuelto minutos después por un `git pull` (la otra PC
  había aplicado esos campos a mano a la misma DB y recién ahí pusheó el schema — commits
  `9508a5a`/`11cf8a2`, "blindar el cronograma vivo"); `migrate diff` post-pull da "No difference
  detected" — cero drift pendiente.

## Qué ES una empresa: `ClientKind` + TAM (2026-07-24)
> Elías abrió el listado de clientes y encontró ahí a **4am Saatchi** (un aliado comercial) y a
> **Smarteam** (nosotros mismos). Pidió poder marcarlo por interfaz y que aparezcan en otro lado,
> más un **TAM en dólares seteado por Ventas** para calcular el potencial estimado.
- **UN enum, no un booleano más.** `Client.isProspect` (creado para los business cases de Ventas)
  ya respondía a medias la pregunta "¿esto es un cliente?", y agregarle `isPartner`/`isInternal`
  al lado habría dado 8 combinaciones de las que 5 son estados imposibles. `ClientKind`
  (`CLIENTE | PROSPECTO | ALIADO | INTERNO`) es **mutuamente excluyente por construcción** —
  regla §2.6 del ARCHITECTURE (enums para estados, nunca booleanos paralelos). `isProspect`
  queda como columna DEPRECATED (eliminar después del 2026-09-30) para poder auditar el
  backfill; sin lectores desde esta tanda.
- **El filtro vive en UN lugar: `CS_CLIENT_WHERE` (`lib/clients/kind.ts`).** Antes la pregunta
  se contestaba con `isProspect: false` escrito a mano en ~15 queries — cada listado nuevo tenía
  que acordarse, y agregar una categoría más obligaba a tocar los 15. Ahora se importa. **Regla:
  ninguna query nueva escribe `kind` a mano.**
- **La categoría es ORTOGONAL al acceso.** `accessibleClientWhere` responde "¿a quién le toca
  este cliente?" y `CS_CLIENT_WHERE` responde "¿esto es un cliente?". Se componen, pero el
  segundo no puede colarse en el primero como si fuera seguridad: la opción `{ kinds: "all" }`
  existe para **una sola pantalla** —el listado de /clients, donde se re-clasifica— porque si esa
  pantalla no viera a los no-clientes, un aliado marcado por error quedaría invisible y sin forma
  de corregirse. Ningún listado de CS/cobranza/portafolio la usa.
- **Pestañas en la MISMA pantalla, no una sección aparte** (decisión de Elías): re-clasificar es
  mover una fila de pestaña, no navegar a otro módulo. El eje categoría se compone con el eje
  pertenencia que ya existía (Mis clientes / Compartido / Todos): los conteos de pertenencia se
  calculan DENTRO de la categoría abierta. Abre siempre en "Clientes".
- **El TAM es un dato de VENTAS, estimado a mano, y `null` ≠ 0.** Nexus no lo deriva de nada
  (ni de cobros ni de proyectos): es cuánto **puede** llegar a facturar la cuenta en un año. Por
  eso "sin estimar" es su propio estado — si se sumara como cero, el potencial de la cartera
  diría que vale menos de lo que vale y nadie sabría cuánto falta por estimar. El total de la UI
  cuenta los "sin estimar" APARTE, nunca dentro. `Decimal(12,2)` como el resto del dinero del
  repo, cruzado a `number` en la frontera (Decimal no es serializable). Techo de cordura de
  100M USD: un dedazo de ceros arruina el total de toda la cartera.
- **Dos campos, dos permisos, un formulario**: `kind` va por la celda NUEVA `clientes.classify`
  (concedida a los mismos roles que `clientes.viewAll` — quien ve la cartera entera es quien nota
  que una fila no es un cliente; un CSE scoped no tiene con qué comparar) y `tamUsd` por
  `ventas.write`, que pasó de `enforced:false` a `true` — **su primer guard real**. El endpoint
  valida campo por campo y **no escribe nada** si falta un permiso; el cliente manda solo los
  campos que puede tocar, así alguien con un solo permiso no se come un 403 en el guardado entero.
- **No se adivinan aliados ni internos desde el nombre.** El backfill solo mapea
  `isProspect:true → PROSPECTO`; el resto arranca en CLIENTE y lo corrige una persona por la
  interfaz — que es exactamente lo que se pidió. Inferir "Smarteam somos nosotros" con un match
  de texto sería la fabricación que el repo evita.

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

## Roles (perfiles de puesto del equipo)
- **Qué es**: sección de docs internos que mantiene y visibiliza los roles y responsabilidades
  del equipo (`RoleProfile`). Cada rol es un **puesto libre** que se define a mano (título +
  área) y se renderiza como una **página web resumida** (`/roles/[id]`). NO está atado al enum
  `TeamRole` (permisos) ni a un `TeamMember` (persona) — es documentación de PUESTOS, que sobrevive
  a que entre/salga gente. *Por qué libre y no el enum:* el equipo tiene puestos que no son un rol
  de permisos (ej. "Asistente de Finanzas", "Diseñador"); atarlo al enum los dejaría afuera.
- ~~**Solo SUPER_ADMIN, gate hardcodeado FUERA de la matriz de permisos** (mismo criterio que
  Costos): `role === "SUPER_ADMIN"` en la página (`redirect` antes de cualquier query), en el
  sidebar (`{isSuperAdmin && <RolesFlyout/>}`)~~ — **SUPERSEDED por §"Roles: dos tipos de
  documento, compartir y link público (2026-07-30)"** en todo lo que hace a la LECTURA. Lo único
  de este bullet que sigue vivo tal cual es el gate de ESCRITURA en la API (`guardRolesAdmin` en
  `api-guards.ts`, 403 — lo exige un escaneo estructural, `lib/roles/api-guards.test.ts`). Hoy:
  la página de un documento NO redirige por rol, responde **`notFound()`** cuando `getRole` no
  devuelve fila (404 y no 403 a propósito: confirmar que una propuesta existe ya es información),
  y el índice lista lo que deje pasar **`visibleRoleWhere`** (`lib/roles/access.ts`) — la misma
  regla para "qué lista veo" y "puedo abrir este". `RolesFlyout` **ya no existe**: se borró en la
  ola A4 (sidebar declarativo) y hoy es `RolesNavFlyout` sobre el `NavFlyout` único, con el gate
  `superAdminOrSharedDocs` de `nav-config.tsx`, que se alimenta de un HECHO de datos
  (`hasSharedDocs`) y no de un rol. **Sigue en pie el porqué:** NO se agregó una sección al
  registry de permisos — una sección de docs de dirección no debe ser delegable por plantilla, y
  SUPER_ADMIN ya es all-true en el engine, así que una celda de matriz no compraría nada. Se evita
  el churn del modal de /team.
- **Plantilla FIJA de 11 secciones** (fuente única `ROLE_SECTIONS` en `lib/roles/schema.ts`):
  Perfil · Responsabilidades · **[bloque 4DX: WIG · Predicción · Arrastre · Marcador · Cadencia]** ·
  Caminos de éxito · Caminos de fracaso · Ruta de madurez · Período de transición.
  (Arrancó en 6; se sumó "Período de transición"; después el bloque 4DX reemplazó a "KPIs"; y
  finalmente se podó la sección de metodología —ver el bullet de VOZ— quedando en 11.)
  *Por qué fija y no flexible:* "MUY resumido y fácil de entender" pide consistencia — todos los
  roles se leen igual. El template config del motor (`configs/roles.defs.ts`) DERIVA sus defs de
  `ROLE_SECTIONS` (agregar una = 1 entrada en `ROLE_SECTIONS` + su presentación en `SECTION_META`,
  que es un `Record<RoleSectionKey,…>` y por lo tanto NO compila si te la olvidás).
- **4DX como el sistema de ejecución de TODOS los puestos** (pedido de Elías, investigado sobre
  *The 4 Disciplines of Execution*): la sección única "KPIs" mezclaba lead y lag detrás de un tag, y
  eso escondía justo la distinción que importa. Se reemplazó por un bloque de 5 secciones:
  **WIG** (D1, "de X a Y para [fecha]", en banda `dark` para que sea imposible de pasar por alto) →
  **medidas de predicción** (D2, lead: la acción SEMANAL controlable) → **medidas de arrastre**
  (D2, lag: el resultado, se lee tarde) → **marcador** (D3) → **cadencia** (D4, la WIG Session).
  *Se conservó el eje `prediccion`/`arrastre`* (`RoleKpiKind`) que ya existía: era exactamente
  lead/lag, con su color azul/teal. **Las lead se re-escribieron como acciones semanales con número**
  ("3 health-checks por semana"), no como KPIs genéricos — una lead que no es influenciable no es
  lead. Orden deliberado: lag ANTES que lead (primero a dónde hay que llegar, después qué se mueve);
  hay un test que lo congela.
- **VOZ: la página de un puesto es una GUÍA DE TRABAJO, no un curso de 4DX** (corrección de Elías al
  ver la primera versión renderizada: *"me arrepentí, quita esa sección… debe ser muy directa, menos
  teórico y más direccionado a entender qué hago en mi puesto"*). Tres reglas que se derivan y que
  hay que respetar al escribir contenido nuevo:
  1. **Se borró la sección "Cómo ejecutamos: 4DX"** (las 4 disciplinas). Explicar el método no es
     tarea de la página de un puesto; ahí se explica EL PUESTO.
  2. **Reparto de vocabulario**: el **título** va en lenguaje llano y en primera persona ("La meta
     que persigo", "Lo que hago cada semana", "Cómo sé si está funcionando", "Dónde lo veo en
     HubSpot", "Con quién me reúno y de qué"); el **eyebrow** —chico— lleva el término técnico
     (`D2 · Medidas de predicción (lead)`) para que el equipo igual aprenda el vocabulario; y la
     **teoría vive SOLO en el tooltip ⓘ**, que es el único lugar donde no estorba.
  3. **Orden por accionabilidad**: predicción ANTES que arrastre. Lo primero que alguien necesita al
     abrir su rol es qué hacer, no a dónde tiene que llegar. (Invierte el orden de la primera versión;
     hay un test que lo congela.)
  *Regla de escritura del contenido:* si una card no dice QUÉ HACER o CÓMO MIRARLO, sobra. Todo a
  1-2 líneas, sin intros por sección, y las medidas de predicción **en imperativo y con número**
  ("Preguntá por el siguiente dolor en cada entrega · 2 por semana"), no como KPIs.
  4. **Sin tag repetido en las cards de medidas**: dentro de "Lo que hago cada semana" TODAS son de
     predicción (y en la de arrastre, todas de arrastre) — repetir el tag en cada card es ruido, y
     además peleaba el renglón con los títulos cortos. El eyebrow y el ⓘ ya lo dicen. En el
     **marcador sí va**, porque ahí se mezclan predicción y arrastre.
- **Una medida de predicción es un acto HUMANO** (regla propia de Smarteam, coherente con el modelo
  AI-First del preámbulo): *"si un agente de Nexus lo puede hacer, no es una medida de predicción"*
  (Elías). Validar, conversar, diagnosticar, decidir, acompañar, transferir criterio → sí. Correr un
  checklist, publicar el calendario, mantener limpia la atribución, barrer la higiene del pipeline →
  NO: eso se automatiza, y ponerlo como lead measure hace que alguien vaya "verde en predicción"
  toda la semana sin haber aportado nada que la IA no hiciera. (De paso resolvió el hallazgo de la
  revisión adversarial: higiene de datos ≠ medida predictiva.) *Ojo con sobre-corregir:* la primera
  pasada sacó también el diseño de piezas y video por "automatizable" y se pasó — **crear** la pieza
  es criterio humano; lo que automatiza un agente es programarla, no concebirla. Elías lo devolvió
  como su primer ejemplo del MO.
- **Una medida de predicción se escribe en TRES capas: de qué me hago cargo · la acción concreta ·
  el número semanal** (corrección de Elías con ejemplos textuales para el MO: *"busco algo como eso,
  más simple de entender, pero dentro del marco de 4DX"*). El **título** es ancho y se agarra de una
  ("Asegura que Smarteam tenga las redes orgánicas activas"), no una micro-acción; el **detail** es qué
  hacer en concreto, incluyendo DÓNDE aterriza el resultado cuando aplica (*"…déjalo como nota en
  HubSpot para que Nexus se nutra"* — el acto humano alimentando al sistema); `meta` es el número.
  Imperativo y tuteo. Son **5 por puesto** (4DX pide pocas; 5 sigue siendo pocas y cubre el puesto sin
  fragmentarlo). **No toda medida necesita un gráfico** en el marcador: "prueba cada insumo como
  usuario" es criterio, no algo que se cuente en un reporte — forzarle un chart sería inventar métrica.
- **`responsibilities` = SOLO el alcance, UNA línea por ítem, sin descripción.** Cuando las medidas de
  predicción pasaron a estar redactadas como "de qué me hago cargo", quedaron casi 1:1 con las cards de
  Responsabilidades (en el MO: "Video y piezas gráficas" + "Publicación de contenido" ≡ "Asegura que
  Smarteam tenga las redes activas") → la página se leía dos veces. Se resolvió recortando
  Responsabilidades a un mapa en trazo grueso del puesto (helper `scope()` en el seed: `detail: ""`,
  que el motor omite en lectura) y dejando el QUÉ HACER en las medidas semanales. No se eliminó la
  sección: sigue siendo la vista de conjunto para quien recién llega al puesto.
- **El marcador (D3) APUNTA al gráfico; no explica cómo armarlo ni consume datos.** Por cada medida:
  tipo de gráfico + **dónde vive** (dashboard o reporte, en una línea) + cómo se ve "ganar" (el test de
  los 5 segundos). *Segunda corrección de Elías:* la primera versión traía la receta completa de
  armado (filtros, propiedades a crear, caveats de licencia) y sobraba — *"me imagino algo menos
  específico acá; para eso están los gráficos en HubSpot"*. El cómo-armarlo es trabajo de HubSpot y se
  descubre al construir el reporte; la página del puesto solo dice **qué mirar y dónde**. Efecto: el
  puntero pasó de ~150 a ~50 caracteres. El CSL conserva sus anclas reales (UUS del Partner Clients
  Object) porque son el NOMBRE del dato, no su receta.
  *Por qué no datos en vivo:* la página de un rol es un DOCUMENTO, no un dashboard; una integración
  con la API de HubSpot es un feature aparte y mucho mayor. Las previews de gráfico son **SVG a mano,
  estáticas y sin timers** — el motor `.stl` también renderiza en externo/PDF, donde una librería de
  charts (ECharts es `ssr:false` + canvas) rompería, y un loop perpetuo cuelga la captura de pantalla.
  Los números de WIG y metas son EJEMPLOS: el liderazgo fija los reales por período y se editan in-situ.
- **Reusa el MOTOR DE RENDER/EDICIÓN, no el de DATOS** (decisión clave — evolución de la anterior;
  Elías pidió estandarizar la UX de bs/kickoffs/perfiles y sumar cards/tablas/tooltips + edición +
  drag&drop). La exploración encontró que el motor de **render/edición** (`LandingView` + un template
  config `SectionDef` + componentes de sección con el contrato `SectionProps` + primitivas inline
  `Editable`/`SortableItems` + dnd-kit) es **separable** del motor de DATOS pesado
  (`ProjectCanvas`/`CanvasBlock`/`useCanvasSections`/publish). Roles adopta el PRIMERO: un template
  config propio (`configs/roles.defs.ts` + `roles.ts` + `sections-roles.tsx`) sobre `LandingView` →
  idéntica UX al BC (secciones ricas + edición WYSIWYG in-situ + drag&drop de ítems + tooltips ⓘ),
  con `RoleWorkspace` (toggle Editar) persistiendo por el `/api/roles/[id]` que ya existe. **NO** se
  adopta el motor de DATOS: sin FK en la tabla COMPARTIDA `ProjectCanvas` (evita churn + el riesgo
  2-PC de la deriva de Particularidad), sin endpoints canvas paralelos, sin DRAFT/CONFIRMED/publish
  (Roles no los usa). Mismo resultado visible, menos código y menos riesgo. La línea correcta:
  reusar la PRESENTACIÓN/EDICIÓN ampliamente, aislar el STORAGE por módulo (ARCHITECTURE §1/§5).
  *Supera* la decisión previa ("reusar solo el look `.stl`/`.stl-md`, no `LandingView`"): ahora sí
  se reusa `LandingView`, porque separamos render de datos.
- **Storage: `RoleProfile.content Json`** — un mapa `{ [sectionKey]: data }` con el shape que consume
  cada componente (prose `{md}`, cards `{items}`, kpis, niveles). Reemplaza las 7 columnas markdown
  `@db.Text` (migración `db execute` scoped a RoleProfile: ADD `content` aditivo → re-seed →
  verificar → DROP de las 7; NUNCA `db push`/`migrate`, que dropearían la deriva `Particularidad.
  sourceQuote` de la otra PC — el `migrate diff` lo confirmó). El hero (title/area/summary) sale de
  los metadatos, no de `content`. ~~Sin IA (se llena a mano)~~ — SUPERSEDED por el assist de
  documento (ver el bullet siguiente); el llenado sigue siendo curaduría humana, pero la IA puede
  PROPONER. Tooltips por sección via `[data-tip]` + ⓘ (CSS-only en `landing-engine.css`, additivo,
  útil también a BC/kickoff).
- **Assist de documento con web_search (2026-07-20)** — la IA de los documentos del motor
  (Roles, kickoff, BC, desarrollo) gana un modo "mejorar por instrucción": la IA **PROPONE, el
  humano revisa y aplica** (`<AgentProposal>`, su primer consumidor real) — NUNCA escribe directo
  sobre contenido curado. Un solo núcleo compartido (`lib/ai/assist.ts`, `runDocumentAssist`):
  recibe el CONTRATO del documento (secciones con schema + data actual, derivado de las defs
  existentes), la instrucción, y llama a Claude con la server-tool **`web_search_20260209`
  SIEMPRE disponible — el MODELO decide** cuándo investigar en línea (sin toggle; la regla del
  prompt le prohíbe buscar para ediciones de redacción → el costo no explota). Reglas duras:
  secciones curadas (`agentGenerated:false`) y `ctxDriven` NUNCA entran al contrato (la IA no
  puede ni proponerlas); `stop_reason=max_tokens` → error (jamás aplicar propuesta truncada);
  keys desconocidas se descartan con warning (nunca revientan el render); las citations de web
  search se muestran como "Fuentes consultadas" (la política de la API exige citación visible).
  El apply reusa la persistencia existente de cada documento (autosave de Roles /
  `upsertCardData` del canvas) — cero endpoints de escritura nuevos. Request SÍNCRONO (precedente
  timeline/assist; deploy self-hosted sin timeout serverless); escape futuro documentado: mover a
  AgentRun async + `useAgentRun` sin tocar el núcleo.
- **RLS lockdown** (tabla interna): `RoleProfile` con RLS habilitado sin policy SELECT — anon no
  la lee con la publishable key (regla operativa de ARCHITECTURE para tablas nuevas). Aplicada por
  `prisma db execute` (CREATE TABLE + ENABLE ROW LEVEL SECURITY), no `db push` (hazard 2-PC).
- **Kickoff ya está en el motor** (ambos mount points defaultean a `LandingView`/`.stl`) → "un solo
  sistema visual BC+kickoff+perfiles" queda cumplido al poner Roles en él.
- **`kickoff-landing.css` quedó RECORTADO a residuo del cronograma (Ola 6, 2026-07-19)**: el
  vocabulario `kl-*` + clases base + vars que el kickoff/desarrollo consumían se portaron a
  `landing-engine.css` bajo `.stl` con MÉTRICAS EXACTAS (regla de oro: no mapear a clases .stl
  "parecidas" — `kl-grid-2`→`.stl-pair`, no `.stl-grid-2`), y el wrapper `.kickoff-landing` dejó de
  envolver al motor en los 4 montajes. Sobreviven DOS consumidores: `TimelineSection.tsx` (archivo
  caliente de la otra PC — `KickoffTimelineSection` lo envuelve con un `<div className=
  "kickoff-landing">` de scope mínimo) y `TimelineLanding.tsx` (cronograma externo, wrapper propio).
  El **borrado FINAL** del archivo = pasada COORDINADA con la otra PC que re-tokenice
  TimelineSection. Los alias de vars (`--brand-blue` ≡ `--blue`…) en el root de `.stl` son compat
  deliberada — consolidar nombres es una pasada mecánica futura, acá se priorizó cero churn visual.
- **Publish/snapshot del motor NO está unificado — plan futuro propio (anotado en la Ola 7,
  2026-07-19)**: conviven 4 mecanismos (snapshot del BC, `publishedSnapshot` del kickoff,
  `publishedSnapshot` del cronograma, y desarrollo que expone el canvas VIVO). Elías decidió
  explícitamente dejarlo FUERA del plan de puestos ("Roles + consolidar motor"); unificarlos (y de
  paso el acceso externo token+password) merece su propio plan con su propio análisis de riesgo.
  Mientras tanto, un tipo nuevo que publique copia el patrón `publishedSnapshot` congelado +
  chokepoint server-side fail-closed (ARCHITECTURE §1-WEB punto 7).

## Roles: dos tipos de documento, compartir y link público (2026-07-30)
> Disparador: la propuesta de contratación del CSL se construyó como un parche —contenido
> hardcodeado en `lib/propuestas/csl.ts`, dos páginas propias y una URL pública sin token—
> y ya se presentó. Elías pidió ordenar: crear los dos tipos desde /roles, poder compartir
> cada documento con una persona, y que cada uno tenga su URL pública oculta.
- **UN enum en la misma tabla, no una tabla nueva.** `RoleProfile.docType` (`PERFIL |
  PROPUESTA`) discrimina qué PLANTILLA del motor renderiza la fila. El storage ya era
  genérico (un mapa Json `{sección: data}`), así que lo único que cambiaba entre los dos
  documentos era el template config — y ese ya existía (`propuesta.defs.ts`, en producción
  desde el día anterior). El par `contentKeysForDocType`/`landingConfigForDocType` vive
  PARTIDO en dos archivos (`lib/roles/doc-type.ts` server-safe y `configs/doc-type.ts`
  client) porque `lib/print/load-doc.ts` es `server-only` y no puede arrastrar renderers.
- **`docType` se elige al crear y NO es patchable** (`rolePatchSchema.omit`). Cambiarlo
  dejaría el `content` con las keys de la otra plantilla: un documento a medias, en
  silencio.
- **Compartir da SOLO LECTURA, y se sirve con OTRO COMPONENTE.** `RoleWorkspace` lleva
  adentro el autosave con debounce, el flush `keepalive` en `pagehide` y el CTA de IA, y
  `Editable` comitea al desmontarse: un `canEdit=false` habría dejado vivo el camino de
  escritura y le dispararía PATCHes 403 en la cara al lector. El compartido monta
  `RoleDocView`. Misma doctrina que Exploración: *no existe el camino, no es un flag apagado*.
- **El filtro de lectura es UNO** (`visibleRoleWhere`, lib/roles/access.ts) y las dos
  preguntas —"¿qué lista veo?" y "¿puedo abrir este?"— se COMPONEN de él. Y responde
  **404, no 403**: en una lista de propuestas de contratación, confirmar que un documento
  existe ya es información. RLS no protege de esto (Prisma bypassa); la policy deny-all de
  `RoleProfile`/`RoleProfileShare` tapa al `anon` de Supabase, nada más.
- **`RoleProfileShare` no tiene GRANT/REVOKE** (a diferencia de `ClientAssignment`): acá el
  default es "solo dirección", así que no hay acceso heredado que revocar — la fila ES el
  acceso y borrarla lo quita. Índice propio por `teamMemberId`: el `@@unique` lidera por
  `roleId` y no sirve para el filtro por persona, que es el camino caliente (sidebar).
- **El ítem "Roles" del sidebar deja de ser gate duro.** Un documento compartido tiene que
  ser ALCANZABLE o compartir no sirve de nada. El gate nuevo (`superAdminOrSharedDocs`) se
  alimenta de un HECHO de datos, no de un permiso: `hasSharedDocs`, que AppShell calcula
  con un `findFirst` y **solo si el usuario no es SUPER_ADMIN** (para él la respuesta es sí
  por definición; ese archivo corre en cada navegación y ya se le sacó una query por
  caliente). Administrar sigue siendo de dirección.
- **El link público: el TOKEN es la capability.** 64 hex (256 bits), sin contraseña y sin
  cookie — la URL ES el secreto. `publicPublishedAt`/`ByEmail` son auditoría y NUNCA se
  consultan como gate: dos fuentes para el mismo bit divergen (§2.1). Revocar pone el token
  en `null`, así que el link viejo muere y no vuelve; republicar genera otro. Por eso NO hay
  tabla de acceso aparte (a diferencia de `ProjectExternalAccess`, que sí necesita password,
  cookie y rate limit). La página pública es `force-dynamic`: con el full route cache de
  Next, revocar no surtiría efecto.
- **El assist de IA responde 409 en propuestas, por ahora.** `rolesAssistContract` deriva de
  las 11 secciones del perfil, y las 3 secciones propias de la propuesta (Smarteam,
  partnerships, oferta) tienen `schema: {properties:{}}` → `coerceToSchema` las VACIARÍA al
  aplicar. Habilitarlo = escribir esos schemas primero. Mismo criterio para el PDF: el
  adaptador de impresión arma el documento con la plantilla de roles, así que una propuesta
  saldría sin la oferta — el loader corta fail-closed y el botón ni se pinta.
- **La propuesta del CSL se migró a una fila con id explícito** (`propuesta-csl-v1`) y su
  contenido quedó como semilla en `scripts/data/`. La URL vieja sobrevive 5 días como
  REDIRECT que resuelve el token vivo (nunca `permanentRedirect`: un 308 cacheado
  sobreviviría a la revocación) — si sirviera contenido propio, revocar no cerraría nada.
  **Se borra el 2026-08-04** junto con `lib/roles/csl-legacy.ts`.

## Exploración (descubrimiento del negocio del cliente)
- **Qué es y por qué**: cuando el kickoff ya pasó y el proyecto arranca, el CSE tiene que
  entender el negocio del cliente — y hoy la calidad de eso depende de qué tan bueno sea
  preguntando cada CSE. **Exploración** es una página INTERNA por proyecto (canvas
  `Exploración`, motor `LandingView`) que dice qué hay que entender de ESE proyecto, cómo
  preguntarlo, en qué orden y a quién del cliente involucrar en cada sesión.
- **El eje que sostiene el documento: lo AFIRMADO vs lo SUPUESTO.** Dos secciones separadas
  — «Lo que ya sabemos» (hechos que la fuente afirma explícitamente, cada uno con de dónde
  salió → no se repreguntan) y «Lo que damos por supuesto» (todo lo demás: lo que suena
  razonable, lo que el alcance da por hecho, lo prometido sin detallar). **Ante la duda va a
  supuestos**: poner un supuesto en «ya sabemos» hace que el CSE dé por cerrado algo que
  nadie confirmó — es el error más caro del documento. De los supuestos salen las preguntas
  del plan de sesiones; una pregunta que no cierra ningún supuesto sobra.
- **UN SOLO agente, sin prompts por tipo de servicio** (CRM/CDP/web/consultoría). El método
  es el mismo para todos: leer el handoff, detectar lo que se dio por supuesto y no está
  verificado, y de ahí derivar la pregunta. Cuatro prompts serían cuatro documentos que
  envejecen por separado. Las preguntas NO salen de un checklist genérico de descubrimiento:
  salen de los huecos de ESE handoff.
- **Calibración por tamaño de cliente** (regla de negocio de Elías, vive en el `agentIntro`):
  a un cliente GRANDE no le sirve que le mapeen lo que ya sabe — con él se apunta a **lo que
  no está viendo** (contradicciones entre áreas, lo que nadie es dueño, el proceso que existe
  en el papel y no en la práctica); a un cliente CHICO sí vale mapear lo obvio, porque ahí el
  valor es escribir por primera vez cómo funciona. El agente INFIERE el tamaño del handoff +
  tags + historial y **declara en el hero qué calibración usó**, para que el CSE la corrija
  en un segundo si se equivocó. No hay campo de "tamaño" en el schema: inventarlo obligaría a
  mantener a mano un dato que el handoff ya insinúa.
- **Fuentes por peso** (F1): (1) el **handoff del proyecto es el ancla** — de ahí sale qué se
  vendió, qué se prometió y qué quedó dicho a medias; (2) handoffs y proyectos ANTERIORES del
  cliente; (3) etiquetas del cliente/proyecto; (4) los demás canvas del proyecto (kickoff,
  cronograma) + los business cases. Los transcripts de sesiones y CS360 quedan para la F2
  (van por el chokepoint `lib/sessions/project-sources.ts` y tienen otro presupuesto de
  tokens); los `KnowledgeDocument` como profundidad técnica, para la F3.
- **Storage `CanvasBlock` — y el matiz que corrige a §1-WEB punto 1**: la regla decía
  "`ProjectCanvas`/`CanvasBlock` SOLO si el documento necesita DRAFT/CONFIRMED + agente +
  **publish al cliente**". Exploración cumple las dos primeras y NO la tercera (Desarrollo ya
  rompía esa pata: tampoco tiene `publishedSnapshot`). El eje real es **"curación por sección
  con generación por agente"; el publish es opcional**. A cambio se hereda gratis
  `useCanvasSections` (edición inline, reorden, undo), la píldora ✨IA por sección, el
  dropdown de canvases y el adaptador `build-landing`. Un Json propio (patrón `RoleProfile`)
  obligaría a reimplementar todo eso para un documento que ES 1:1 con un proyecto. **Cero
  DDL**: no se tocó `prisma/schema.prisma`.
- **INTERNO = no existe el camino, no es un flag apagado.** No hay `/external/exploracion`,
  ni `publish-exploracion`, ni botón de compartir. Un flag se prende sin querer; un camino que
  no existe hay que construirlo a propósito. El riesgo era concreto: Exploración se construyó
  copiando el canvas **Desarrollo**, que SÍ tiene los tres. Lo congela
  `lib/canvas/exploracion-internal.test.ts` (escanea `app/external/**`, `app/api/**` y el
  workspace). Si algún día se decide exponerla, hay que ir a borrar ese guard — que es
  exactamente la conversación que se quiere forzar.
- **Paleta INTERNA `.stl-internal`**: grises y blancos con **un solo ámbar** (`--flag`)
  reservado a marcar lo NO verificado. No es un tema alternativo del motor: es el MISMO motor
  con las variables re-declaradas en un modificador scopeado → cero cambios en componentes y
  los documentos de marca intactos por construcción. Va DESPUÉS del bloque `.stl` (cascada +
  el guard lee cada token por el PRIMER match). `landing-brand-contrast.test.ts` valida
  también estos pares y exige que todo token del bloque sea NEUTRO (**saturación < 25%**,
  medida en HSL — el spread RGB crudo rechazaba los grises fríos legítimos y dejaba pasar lo
  que importaba). Un segundo acento rompe el efecto "esto es interno" y el test lo frena.
- **Canvas DEFAULT de primera clase (modelo Kickoff)** — *supera a la decisión original
  "on-demand, no pre-creada" (2026-07-23, pedido de Elías: "debe ser un canvas, como kickoff,
  cronograma… correr el agente de kickoff en el canvas de kickoff, así pero para la
  exploración")*. Exploración está en `DEFAULT_PROJECT_CANVASES`: se pre-crea con el proyecto,
  vive en el **dropdown de canvases** y su agente se dispara desde el **header del canvas**
  (`CANVAS_PRIMARY_AGENT`), exactamente como el kickoff. Se retiró la CTA dedicada
  (`ProjectExploracionSection`) y su endpoint `/api/projects/[id]/exploracion`.
  *Por qué se revirtió:* el argumento original eran los 111 cascarones vacíos de Handoff — pero
  ese caso NO es análogo: Handoff pasó a ser una **entidad cliente-level** y su canvas de
  proyecto quedó redundante. Un canvas de Exploración vacío es exactamente como un Kickoff sin
  generar: aparece en el dropdown con su botón "Generar" adentro, que es el patrón normal del
  producto. *Alcance:* backfill retroactivo a los proyectos existentes con
  `scripts/migrate-add-exploracion-canvas.ts` (dry-run-first, excluye `__strategy__`).
  `order: 4` (al final) para no renumerar los canvases que los ~113 proyectos ya tienen en DB.
  **INTERNO ≠ on-demand**: sigue sin superficie externa y con la paleta gris (ver el bullet de
  abajo). "Después del kickoff" sigue siendo el ORDEN del flujo, no un disparador automático:
  NO hay auto-chain, el CSE decide cuándo generar.
- **El workspace NO asume "sin contenido ⇒ generando"**: como canvas default, abrirlo sin generar
  es lo normal, así que muestra un estado **idle** ("Todavía sin generar…") en vez del poll de
  "Generando…" que tenía cuando la CTA lo abría justo después de disparar. El refresco tras
  generar lo da el remonte por `agentNonce` del panel, igual que en los otros canvases.
- **TAG-DRIVEN: el tag deja de ser etiqueta y pasa a ser DISPARADOR** (2026-07-23, pedido de
  Elías). Antes los tags del handoff se aplanaban a una línea de contexto y el agente producía
  lo mismo tuviera los tags que tuviera. Ahora cada tag inyecta su **lente de exploración**
  (`components/landing/configs/exploracion-lenses.ts`): qué supuestos suele esconder ese tipo de
  proyecto y qué clase de pregunta los cierra. Un proyecto con `sitio_web` pregunta por
  referencias/anti-referencias, funcionalidad y assets; uno con `sales_hub` va al proceso de
  venta real. **Solo se inyectan las lentes de los tags ACTIVOS** — el prompt no carga las 12
  siempre, y si se colaran todas el tag dejaría de dirigir.
  *Generaliza un precedente que ya existía:* `hasTechnicalScope` (`custom_dev`/`insider_one`) ya
  era un tag-driver real — hace que el handoff agregue fase técnica y que `analyze` auto-encadene
  el canvas Desarrollo. Esto lleva el mismo mecanismo al agente de exploración.
  **Reglas duras:** (1) un tag nuevo **obliga** a definir su lente —
  `lib/canvas/exploracion-lenses.test.ts` falla si falta, porque un tag sin lente vuelve al
  estado inerte del que venimos; (2) las lentes influyen **solo el CONTENIDO** dentro de las 7
  secciones fijas — NO agregan secciones: el set está congelado por `registry.test` y ya existe
  en los canvases creados, y una sección condicional por tag es otra decisión; (3) sin tags, el
  bloque dice EXPLÍCITAMENTE "no asumas tipo de proyecto" — el silencio se lee como permiso para
  asumir.
- **Tag `sitio_web` (grupo `scope`)**: faltaba forma de marcar que se vendió un sitio. Es
  `scope` y no `product` porque describe **qué se vendió**, como `custom_dev` y `crm_migration`;
  `content_hub` (ex CMS Hub) sigue siendo el producto y un proyecto web normalmente lleva los
  dos. ⚠ **"Normalmente lleva los dos" describe el caso frecuente, NO habilita a sembrarlos
  juntos** — esa lectura duró un día y se corrigió: ver §"Un tipo de propuesta siembra lo que
  AFIRMA" (2026-08-04). ⚠ **NO entra a `hasTechnicalScope()`**: esa función rutea al canvas Desarrollo y a la fase
  técnica del cronograma, y un sitio en el CMS sin integraciones no lleva fase técnica. Si además
  hay desarrollo, el handoff pone `custom_dev` y ahí sí entra. Sin backfill: aplica de ahora en
  adelante y el CSE lo agrega con un clic en la tira de tags (adivinar "esto es web" desde texto
  viejo sería justo la fabricación que el repo evita).
- **Máximo reuso de renderers**: de las 6 secciones de contenido, 5 usan renderers que ya
  existían (`pain` ×3, `web_diagnosis`, el hero de Desarrollo, el CTA del kickoff). El único
  componente nuevo es el **plan de sesiones**, porque su unidad es una sesión con una lista de
  preguntas adentro y eso ningún renderer del motor lo expresa. Dentro de él, las sesiones se
  arrastran pero las preguntas NO: un dnd-kit anidado pelea con el de afuera y el valor de
  reordenar preguntas no paga ese riesgo.
- **El rótulo de un renderer compartido entra por la DEFINICIÓN, nunca por un campo de `data`**
  (2026-07-27). `web_diagnosis` nació para la propuesta de sitio web con sus rótulos escritos a
  mano adentro: izquierda "Retos actuales", derecha `"Por qué " + data.plataforma`. Cuando lo
  reusaron Exploración, Diagnóstico y Desarrollo, los briefs taparon el problema pidiéndole al
  agente que escribiera un RÓTULO dentro de `plataforma` — y en pantalla salió
  **«POR QUÉ QUÉ SE ROMPE SI EL SUPUESTO ES FALSO»**. Ahora el rótulo es `SectionDef.chips`,
  un dato de la def, y `plataforma` volvió a ser solo un dato. Exploración pone
  *Supuestos / Riesgos* ("qué se rompe" se lee como si se rompiera el supuesto, cuando lo que
  se rompe es la entrega). **La propuesta de sitio web NO declara `chips`**: es la única de la
  familia que se publica al cliente y tiene 5 propuestas publicadas cuyo snapshot congela los
  rótulos históricos. Congelado por `lib/landing/registry.test.ts`.
- **La casilla «ya la pregunté» NO lleva autoría ni fecha** (2026-07-27), a diferencia de las
  ~24 columnas `*ByEmail` del schema. Es deliberado, no un olvido: vive dentro del `data` del
  bloque CARD (`hecha: "si"` — string y no boolean porque `coerceToSchema` aplana toda hoja a
  string), **una regeneración la borra**, y es memoria de trabajo del propio CSE durante la
  reunión. Poner `hechaByEmail` + timestamp sobre un dato que una regeneración destruye es
  teatro de auditoría. El contraste correcto es `DRAFT/CONFIRMED`, que sí lleva
  `confirmedByEmail` porque ahí alguien se hace responsable de algo que se publica — y este
  documento no se publica a nadie. Además `hecha` está FUERA del schema del agente a propósito:
  `coerceToSchema` descarta lo no declarado, así que el modelo no puede marcar una pregunta como
  hecha ni por error; la invariante la sostiene el tipo, no un pedido en el brief.
- **El plan de sesiones SÍ alimenta a Diagnóstico y Planificación** (2026-07-27). `flattenCardData`
  descartaba los arrays anidados dentro de un ítem de array (`typeof v === "string"`), así que las
  preguntas —donde vive lo que se fue a averiguar— nunca llegaban al contexto de esos dos agentes.
  Salió a la luz porque el rediseño movió contenido justo ahí (se capó «Lo que damos por supuesto»
  y creció el plan): los dos documentos pasaron a leer MENOS Exploración que antes. Medido sobre
  Wherex, el contexto pasó de 13.750 a 16.492 caracteres. Al bajar a las preguntas hubo que sacar
  dos claves del texto: `hecha` (estado del CSE, no contenido) y `orden` (el número que escribió la
  IA queda viejo en cuanto se reordenan las sesiones — la UI ya lo ignora y numera por posición, así
  que imprimirlo solo puede contradecir el orden real).

## Estados de carga (skeletons)
- **El shell interno vive en el route group `app/(shell)/`** (2026-07-18): las 17 secciones
  internas comparten UN layout que monta `AppShell` (sidebar + notificador CS). *Por qué:*
  `AppShell` se montaba DENTRO de cada page.tsx → los `loading.tsx` se pintaban sin sidebar y al
  resolver el RSC la columna `w-56` empujaba todo ~224px (la queja original de Elías: "los
  skeletons son de toda la pantalla, pero no de cómo va a quedar la interfaz"). El route group no
  cambia URLs (manifest verificado idéntico). Quedan FUERA: api, auth, external, `portal`
  (conserva su AppShell in-page), print, login y los redirects puros (dashboard, contenido,
  exito-cliente, icp — meterlos al grupo haría resolver el shell antes de un `redirect()`).
  Los guards por página SE QUEDAN (defensa en profundidad). Página interna nueva → nace bajo
  `app/(shell)/` con su `loading.tsx`.
- **Trade-off aceptado del shell persistente**: el sidebar ya no se re-renderiza por navegación —
  su frescura depende de `revalidateTag("clients-sidebar")` (que las mutaciones de Client ya
  llaman) + `router.refresh()`. Si un flujo nuevo crea/renombra clientes y el sidebar no se
  entera, el fix va en ESE flujo (revalidate/refresh), no des-haciendo el shell.
- **Regla del skeleton estructural**: un estado de carga replica la CÁSCARA del estado cargado
  (mismos contenedores/borders/paddings) y RESERVA su altura (`min-h` / `rowClassName`) — patrón
  `ProjectGPS.tsx`. **Prohibido el `<p>Cargando…</p>` suelto** (una línea que swapea a contenido
  alto = layout shift). Primitivas en `components/ui/Skeleton.tsx`: `Skeleton`/`SkeletonText`/
  `PageHeaderSkeleton`/`CardsSkeleton`/`ListSkeleton` (+ `TableSkeleton` en Table.tsx), todas con
  `skeleton-shimmer` (nunca `animate-pulse`) y tokens semánticos. Excepción: componentes del
  landing engine `.stl` (ej. `EquipoSection`) usan estilos inline del motor + `skeleton-shimmer`
  porque renderizan en externo/PDF.
- **El ancho del sidebar (abierto/colapsado) vive en la cookie `nexus-sidebar`**, leída en SSR
  por `AppShell` (patrón `nexus-theme`) — el primer paint nace con el ancho correcto. *Por qué:*
  con localStorage el SSR no lo sabía → `visibility:hidden` hasta montar + salto w-56↔w-14
  post-hidratación. Migración one-time desde `localStorage.sidebar_open` en `SidebarShell`.
- **PROHIBIDO EL SLAB OPACO. El átomo `Skeleton` es una LÍNEA; un panel se reserva con
  `SkeletonPanel`.** *Definición verificable:* un elemento con `skeleton-shimmer`, altura
  declarada > 48px (`h-12`), sin hijos y sin borde. Los tres criterios juntos (un `h-72` con
  hijos delineados es un panel legítimo). *Por qué existe la regla:* una auditoría de toda la app
  encontró **81 sitios de carga, 39 de ellos slabs**, y la causa raíz no fue no saber la técnica
  —`ProjectGPS` y `TableSkeleton` ya la tenían escrita— sino que **el único átomo disponible era
  macizo** y la única primitiva estructural estaba escondida dentro de `Table.tsx`, donde nadie la
  copió. Por eso `TableSkeleton` se mudó a `Skeleton.tsx` y nació `SkeletonPanel`: que la próxima
  persona caiga en el patrón correcto por default. Si estás por escribir una altura mayor a `h-12`
  en un `Skeleton`, estás escribiendo un slab.
- **`SkeletonPanel.minH` es OBLIGATORIA a propósito** (no opcional): no se reserva una región sin
  declarar cuánto ocupa el contenido real. Convierte "olvidé pensar la altura" en error de
  compilación — es el proxy barato de "que la altura calce", que NO se puede verificar
  automáticamente (jsdom no hace layout; medir CLS exige un browser logueado que este entorno no
  tiene). El otro proxy es de colocación: **el skeleton de un componente vive en el archivo de ese
  componente** (o en `components/clients/skeletons.tsx` cuando lo comparten un `loading.tsx` y un
  gate client-side), para que las dos superficies que se ven una tras otra no inventen vocabularios
  distintos.
- **Cobertura verificada por registro, no por convención** (`lib/ui/skeleton-coverage.ts`): cada
  ruta declara `own` | `inherits` | `exempt` y el test falla si una ruta NO está declarada — mismo
  mecanismo que el registry de permisos, la omisión no puede pasar en silencio. Más
  `app/(shell)/loading.tsx` como red de seguridad: ninguna navegación interna queda congelada.
  `lib/ui/skeleton-vocab.test.ts` corre 5 chequeos (anti-slab, primitivas delineadas, animación
  única, sin "Cargando…" suelto, Spinner fuera de los loading); tres son **ratchet**: fallan si
  aparece un ofensor nuevo Y si uno de la lista de deuda ya se arregló, así solo puede encoger.
- **`Spinner` es para ACCIONES en curso, no para regiones**: un botón guardando, una fila
  procesándose. No reserva altura, así que usarlo para tapar un panel garantiza el salto que el
  skeleton evita. Corolario en `CronogramaCanvas`: un refetch tras una acción NO puede poner
  `loading=true` (colapsaba el Gantt entero al esqueleto y perdía el scroll) — va un `refreshing`
  separado que mantiene el contenido en pantalla.
- **El criterio de exactitud es CLS ≤ 0.1 above-the-fold, NO pixel-perfect** (doctrina, con la
  guía de web.dev): lo que está arriba del viewport no se mueve al resolver; abajo se tolera
  aproximación. Cuando la altura real es variable, se reserva el TAMAÑO MÍNIMO del caso común y
  se acepta que el caso raro crezca (ej. el bloque de contexto del Handoff sin generar).
- **Un `loading.tsx` NO conoce el rol** (fallback estático de Suspense: no lee cookies — doc
  oficial de Next.js). Un skeleton que depende del rol va en un **`<Suspense>` de sección cuyo
  fallback lo elige el server** que ya resolvió el rol ("push dynamic access down"): /clients es
  el patrón canónico — la page resuelve auth+rol+count rápido, pinta el header real, y suspende
  solo la zona pesada (`ClientsTable`) con `ClientsTableZoneSkeleton showPills={!isSuperAdmin}`.
  El loading.tsx queda para la ventana pre-auth (~100ms) con la variante mayoritaria.
- **El doble skeleton (route loading + gate client) se mata con SIEMBRA o CACHE, no con mejores
  skeletons**: (a) siembra server-side de la data del primer paint (`initialCanvases` en el
  workspace, patrón cobranza) para que el cliente no re-fetchee al montar; (b) cache de módulo
  para revisitas — `gps-cache.ts` es el patrón canónico, replicado en `canvas-cache.ts`,
  `handoff-status-cache.ts` y el cache de `useMe` (con dedupe de promesa in-flight). Persistir
  ALTURAS medidas (localStorage) se evaluó y descartó: sobre-ingeniería sin patrón estándar.
- **Un gate por permiso que INSERTA layout espera a `me`**: `ProjectHandoffSection` no se pinta
  hasta `loading || me === null` — si se pintara con el status pero sin saber si el usuario es
  editor, el bloque de contexto se insertaría después empujando el canvas. Con `useMe` cacheado,
  la espera extra solo existe en el primer montaje de la sesión.
- **El shimmer aparece diferido ~150ms** (`skeleton-appear` en globals.css, CSS puro): en cargas
  rápidas (caches, seeds) el usuario ve contenido directo sin el flash de un skeleton que dura un
  parpadeo (práctica NN/g). El prop `delay` de `Skeleton` escalona AMBAS animaciones en orden.

## Sistema de diseño — tokens y ratchets (2026-07-19)
- **El modelo de enforcement es warn + ratchet, no error**: la regla ESLint (warn) es la guía en
  el editor mientras se escribe; lo que FRENA el merge es el test ratchet
  (`lib/ui/token-vocab.test.ts`) — un conteo de grises crudos POR ARCHIVO que solo puede bajar.
  Más matches que la entrada → "tokenizá lo nuevo"; menos → "actualizá la entrada" (imprime la
  línea lista para pegar). Censo inicial: 125 archivos, 2.460 grises. Es el mismo modelo que el
  vocabulario de skeletons, elegido sobre "warn→error al final" porque un error global bloquearía
  el trabajo diario sin ofrecer migración incremental.
- **Por qué existe: la regla de tokens estuvo MUERTA semanas** por una colisión de flat config —
  dos config objects definían `no-restricted-syntax` (tokens y anti-slab) y en flat config la
  misma clave NO se fusiona: el último reemplaza al primero en los archivos solapados. El guard
  de tokens quedó inerte en todo `.tsx` y entraron ~2.4k grises sin una sola marca. La corrección
  es estructural, no puntual: (a) ambas familias viven en UN `no-restricted-syntax`
  (`uiVocabGuard` + `slabOnlyGuard` para los exentos de tokens); (b) el patrón vive en
  `lib/ui/raw-neutral.mjs`, importado por el config Y por el ratchet (no pueden divergir);
  (c) el meta-test `lib/ui/eslint-guards.test.ts` resuelve la config REAL de archivos concretos
  y falla si una familia desaparece — el bug fue silencioso una vez; no puede volver a serlo.
- **El ratchet cuenta el ARCHIVO entero, no solo `className`**: cubre los puntos ciegos del
  selector de ESLint — variantes `cva()` fuera de JSX (Button/Badge/Card) y template literals.
  Un gris en un comentario también cuenta: sacarlo cuesta menos que darle un parser al ratchet.
- **`bg-black/NN` es el scrim sancionado y NO cuenta como gris crudo** (debe ser oscuro en ambos
  modos). El patrón lo exime sin nombrar la barra — esquery corta el regex literal en la primera
  `/` — usando la clase `[^-a-z.-0]` (el rango `.-0` cubre 0x2E–0x30: `.`, `/`, `0`). Detalle
  documentado en `raw-neutral.mjs`; no "simplificar" ese regex sin leer el comentario.
- **Regla transversal: un ratchet nace en la MISMA ola que la primitiva que ofrece la
  alternativa** (nunca antes — frenaría el trabajo diario sin darle salida). La única excepción
  fue el de tokens: su alternativa (los tokens semánticos) existe hace meses.
- **Clave de mapeo gris→token** (es el remap `html.light` de `globals.css`, que ya define la
  equivalencia que la app renderiza hoy — retokenizar NO cambia el aspecto): `bg-gray-900/950`→
  `bg-surface` · `bg-gray-800`→`bg-surface-hover` · `border-gray-600/700/800`→`border-line` ·
  `text-white`→`text-fg` · `text-gray-200/300`→`text-fg-secondary` · `text-gray-400/500/600`→
  `text-fg-muted` · sólidos con texto blanco→pares `bg-primary`/`bg-destructive` con su `*-fg`.

## Infra
- **Una sola Supabase** (local == PROD). Migraciones a mano. Scripts destructivos/masivos
  dry-run-first; el usuario aprueba el `--apply`.

## El logo del cliente: tamaño y variante para fondo oscuro (2026-07-27)

- **El tamaño es un PORCENTAJE, no píxeles.** El logo se pinta en 7 superficies con TRES
  altos base distintos y ya afinados por separado: 30px sobre el navy del hero, 40px en el
  cronograma que ve el cliente, 36px en el cronograma interno. Un valor en px obligaría a
  elegir entre unificar los tres —lo que cambia el aspecto de TODO lo ya publicado— o que
  el número mienta en dos de las tres. El porcentaje es un multiplicador: cada superficie
  conserva su alto y el número significa lo mismo en todas.
- **El techo es 400%, no 200 — porque el tamaño está atado solo al ALTO** (2026-07-27).
  Medido sobre los 12 logos cargados: un cuadrado a 30px de alto mide 30px de ancho; una
  banda 3,4:1 al mismo alto mide 102px. El cuadrado ocupa el **20%** de la presencia
  visual, y **3 de los 12 son cuadrados**. Atar el tamaño al alto es lo correcto para
  logos horizontales —alinean por la base— pero el ojo lee ÁREA: para que un cuadrado
  iguale el ancho de una banda típica necesita 340%, que el techo viejo ni dejaba pedir.
  **No se cambió qué significa el 100%**: sería re-escalar en silencio los documentos ya
  publicados de esos 3 clientes. Se abrió el rango para que se pueda pedir.
- **El tope de ANCHO de los cronogramas escala con el logo.** Estaba fijo en 180px, y una
  banda 6,2:1 ya lo toca al 100%: a partir de ahí subir el porcentaje no hacía nada
  visible y el control parecía roto.
- **Dos niveles, y el de arriba es ABSOLUTO.** `Client.logoScale` es la base (aplica a
  todos los documentos del cliente); `hero.logoScale` la PISA para un documento. Base 120 +
  documento 150 se ve a **150**, no a 180: si multiplicara, el número que muestra la barra
  no sería el tamaño que se ve y el control dejaría de ser legible. "Volver al del cliente"
  **borra** la key, no la iguala — igualar congela el documento y deja de seguir la base.
- **`logoScale` es NULLABLE sin default.** `null` = "nadie lo tocó", que no es lo mismo que
  "alguien eligió 100": si mañana se re-afina un alto base, los `null` lo siguen y los 100
  explícitos quedan pinchados. Mismo criterio que `tamUsd` y `BusinessCase.language`.
- **El número llega por una variable CSS SIN UNIDAD** (`--logo-scale`), puesta inline solo
  en el `<img>` del cliente; el alto base sigue en CSS. Los tres logos de la brand-row
  comparten `.stl-brand-logo`: Smarteam y HubSpot no traen la variable, caen al fallback
  `1` del `calc` y quedan idénticos. ⚠ Si la variable saliera con unidad (`"120%"`), el
  `calc` se invalida, `height` cae a `auto` y **el logo se pinta a su resolución natural**
  en una propuesta que el cliente está mirando. Por eso el string lo construye UNA sola
  función (`lib/ui/logo-scale.ts`) y hay guard sobre el CSS.
- **NO se plumbea `theme` hasta las secciones.** La brand-row elige la variante oscura sin
  preguntarle el fondo a nadie porque los 7 defs con `backdrop:true` son `theme:"dark"`,
  sin excepción. Pasar `theme` por `SectionProps` sería un dato que ninguna otra sección
  necesita y encima MENOS seguro: un theme mal seteado produce el mismo bug con más código
  en el medio. Se sostiene con `lib/ui/landing-hero-theme.test.ts`.
- **El filtro `brightness(0) invert(1)` se queda como DEFAULT de la clase.** Hoy es lo
  único que hace visibles los logos de los clientes que solo subieron un archivo —que son
  todos— aunque les borre el color de marca. Se apaga con el modificador `--asis` solo
  cuando hay variante oscura real. Dirección elegida a propósito: si el modificador se
  pierde en un refactor, el peor caso es lo que ya se ve, no un logo invisible.
- **La variante oscura es la ALTERNATIVA del primario, no un asset suelto**: borrar
  `logoUrl` borra las dos, y no se puede subir la oscura sin primario. Un logo para fondo
  oscuro es tinta clara: sobre el blanco del cronograma desaparecería, y `normalizeBrands`
  decide con `!!clientLogoUrl` si pinta imagen o badge de texto.
- **El snapshot del business case publicado congela los tres campos, con fallback `??` a lo
  vivo.** Qué archivo, cuál variante y a qué tamaño son UNA unidad visual: congelar uno y
  leer los otros vivos garantiza el desajuste. Y como los snapshots ya publicados no traen
  las keys nuevas, caen a los valores del cliente → una propuesta de hace meses respeta el
  cambio sin migrar un solo Json.
- **La barra (`components/ui/ScaleSlider`) es el primer `input type="range"` del repo.**
  Arrastrar solo pinta (estado local + variable CSS, cero red); commitea al soltar
  (`pointerUp` + `keyUp` + `blur`, deduplicado) → un arrastre = una escritura. Sin debounce
  con timer: un timer se pierde al desmontar. El `blur` es la misma doctrina de `Editable`
  y `PopInput`, y es lo que hace que cerrar el popover con clic afuera no pierda el valor.

## Línea gráfica Smarteam en el motor de landings (retema 2026-07)
- **Fuente de verdad de la marca**: el doc autocontenido `prompt-linea-grafica.md` (repo del
  sitio). Paleta: navy `#051849` (tinta Y fondo oscuro) · royal `#0B58D3` (interactivo sobre
  claro) · `#1E8FF6` (acento sobre navy) · naranja `#E8481C` SOLO fondo de botón / display
  sobre claro (`#C2400F` texto chico) · coral `#F87B5B` SOLO display sobre oscuro · crema
  `#FBF1E4` para bloques "futuro/positivo". Tipografía única: Plus Jakarta Sans
  (`--font-jakarta`). *Por qué así:* los nombres históricos de tokens (`--blue`, `--teal`,
  `--brand-*`) se CONSERVARON como alias con valores nuevos — cientos de usos migran solos;
  la legalidad de cada par la vigila `lib/ui/landing-brand-contrast.test.ts` (frena el merge).
- **La menta `#42E4B3` quedó en CERO usos en el motor** — reservada para identidad Insider.
  El naranja de HubSpot `#FF7A59` se conserva (trademark de un tercero, solo sobre claro).
- **Voz de agentes**: reglas compartidas en `BRAND_VOICE_RULES` (canvas-agent.ts) — CTA abre
  con pregunta de dolor, una imagen eléctrica por pieza, honestidad ("sin venderte de más"),
  prohibido inventar métricas. `brandVoice: false` en el template = generador técnico sin esas
  reglas (desarrollo). El prompt del kickoff vive en `kickoff.defs.ts` (el `systemPrompt` del
  agente en DB es solo nota-puntero).
- **Patrón para un TEMPLATE NUEVO** (p.ej. futuro canvas de sitio web — `website_v1` es el
  ejemplo canónico ya implementado): (1) defs server-safe en
  `components/landing/configs/<x>.defs.ts` (key/label/eyebrow/theme/schema/brief/empty por
  sección; schemas con hojas string); (2) entry en `BC_TEMPLATES` (templates.defs.ts) con
  `agentIntro`/`maxTokens`; (3) constante de id + entry en `BC_TYPE_CATALOG`
  (lib/business-cases/case-types.ts); (4) renderers client en `sections-<x>.tsx` registrados
  en `SECTION_COMPONENTS` (configs/templates.ts) — reusar `hero`/`roi`/`pain`/
  `tech_architecture` cuando alcance; (5) SOLO canvas de PROYECTO (no BC): además
  `canvas-defs.ts` (AGENT_GROUP_TO_CANVAS) + `artifact-gate.ts`. El `agentIntro` nuevo arranca
  del doc de marca.

## Motor de diagramas en las landings (sección "diagram", 2026-07)
- **El FlowchartViewer (React Flow + dagre, el lienzo de Procesos) es EL motor de diagramas de
  Nexus** — se expone al motor de landings como `sectionType: "diagram"` (`DiagramSection`).
  Estreno: canvas Desarrollo (`arquitectura`, `relacion_objetos`). *Por qué:* las cadenas CSS de
  `tech_architecture` no expresan ramas/cardinalidad/metadatos; el lienzo interactivo ya existía y
  estaba probado.
- **Patrón de datos en 2 capas** (la decisión medular): el agente genera una **spec string-only**
  DENTRO del schema (`sistemas`/`conexiones` u `objetos`/`asociaciones` — hojas string porque
  `coerceToSchema` coacciona todo lo demás a "") y un **conversor puro**
  (`lib/flowchart/spec-to-diagram.ts`) la vuelve grafo en `data.diagram` (FlowchartData), que vive
  **FUERA del schema** → `preserveNonSchemaKeys` conserva las posiciones del usuario en
  regeneraciones por sección. La regeneración COMPLETA sí las descarta (ya era destructiva).
- **Metadatos por conexión**: `direction` (to/bidir) · `syncType` (realtime/batch/manual) ·
  `dataFields` (qué viaja) · `dedupeKey` (cómo no se duplica) · `trigger` (cuándo) · `pending`
  (⚠ por confirmar) — el panel de detalle del viewer los muestra (read) y edita (edit).
- **Legacy sin migración de DB**: conversión LAZY — `DiagramSection` resuelve en orden
  `data.diagram` → spec → `cadena` de tech_architecture (`cadenaToDiagram`); persiste recién en el
  primer Guardar del CSE.
- **Cliente final**: explora (pan/zoom/fullscreen/clic→detalle) con `readOnly` — nunca edita.
  Print/PDF: placeholder de texto (el SVG estático es tarea futura).
- **Para enchufar OTRA superficie** (BC `arquitectura_tecnologica`, website `arquitectura_conexion`,
  `site_architecture`): cambiar el `sectionType` de la def a `"diagram"` + registrar `DiagramSection`
  en el registry de componentes de ese template + darle al brief el formato spec (sistemas/conexiones).
  La conversión lazy cubre su data vieja.

## Cronograma — fase técnica: contenido por objeto + regen por fase (2026-07)

- **`party: DEV` sobrevive de punta a punta (Fase A)**: el `techRule` (userMessage de `analyze`) ya
  pedía DEV, pero el validador de persistencia lo descartaba (union estrecho) y el prompt base lo
  contradecía. Fix: el prompt lista DEV y el validador lo acepta **solo en la fase técnica**
  (`isDevIntegrationPhaseName(phase.name)`, `lib/timeline/phase-names.ts`). Todo el resto de la cadena
  (renders, `validate.ts`, PUT, externo, snapshot) ya propagaba DEV.
- **Señal por NOMBRE vs por TAG**: `hasTechnical` (techRule) va por TAG del proyecto
  (`custom_dev`/`insider_one`); `isDevIntegrationPhaseName` va por NOMBRE de fase. Son señales distintas
  y NO se fusionan.
- **Contenido por objeto (Fase B)**: bloque en el prompt de `agent-timeline-detail` que aplica **solo**
  a la fase "Desarrollo / Integración" — trata cada objeto de HubSpot como una mini-integración
  (entendimiento → cuarteto por objeto [desarrollo/mapeo=DEV, homologación=CLIENTE, pruebas=AMBOS] →
  dirección inversa si se vendió). Orden de objetos INDICATIVO. Techo de tokens del detalle a 24k + rama
  de `repairTruncatedJson` para el agente de detalle (antes tiraba 500 al truncar).
- **Regen POR FASE (retroactivo y seguro)**: `POST /analyze` con `regeneratePhaseId` rehace SOLO una
  fase reusando el agente de detalle (prompt scopeado a esa fase → menos tokens/truncación). Salvaguarda
  **por ESTADO, no por source**: borra solo `AGENT` + `PENDING` + `actualStart:null`; preserva HUMAN,
  MODIFIED (curación) y todo lo iniciado. Borrado dentro de la `$transaction` de persistencia → atómico.
  **Guardas G1/G2 (409 sin borrar)**: G1 = sin baseline activo / `timelinePublishedAt` null (regenerar
  cambia ids de tarea y rompería la comparación por-id del portafolio D.3 contra el baseline congelado);
  G2 = la fase no tiene tareas iniciadas/hechas (borrar perdería avance sellado). Invalida
  `pendingProgress` (ids nuevos). Gate: `cronograma.regenerate` (ya lo aplica `resolveArtifactGate` en
  `/analyze`) — no se creó capacidad nueva.
- **Follow-up — regen POR FASE en cronogramas PUBLICADOS + modo + contexto Desarrollo**:
  - Se levantaron G1/G2. La seguridad ahora es: (a) el borrado nunca toca DONE/iniciadas; (b) tras
    regenerar, `patchBaselinePhaseTasks(tx, timelineId, phaseId)` (`lib/timeline/baseline.ts`) parchea
    **in-place** SOLO las tareas de esa fase en el baseline activo (ids nuevos + `plannedStart/End`
    recomputadas con `buildTaskSnapshotEntries`), sin nueva versión → el portafolio D.3 no reporta falso
    scope-creep ni pierde atrasos; las demás fases quedan intactas. No-op si no hay baseline (sin publicar).
  - **Modo** (`regenerateMode`): `"replace"` (default) borra las pendientes IA sin iniciar
    (`AGENT`+`MODIFIED`, `PENDING`, `actualStart:null`) y regenera; `"keep"` no borra nada y agrega solo
    las tareas por objeto cuyo título no exista ya (dedup normalizado). HUMAN y lo iniciado se preservan
    siempre. El diálogo (Modal, `CronogramaCanvas`) ofrece los dos botones.
  - **Contexto**: el agente de detalle ya usa el canvas "Handoff" (1:1 = el último); se suma el canvas
    **"Desarrollo"** vía `loadDesarrolloContext` (`lib/canvas/desarrollo-context.ts`) — lee los `CARD.data`
    de `arquitectura`/`relacion_objetos`/`comunicacion` (NO `loadCanvasContext`, que da "" porque esos CARD
    tienen `content:null`) y los inyecta al `userMessage` → las tareas por objeto salen del alcance real.
- **FIX streaming (destraba TODA generación)**: `max_tokens` 24000 (>21.333) rompía el `messages.create`
  no-streaming — el SDK calcula `timeout = 3600·maxTokens/128000 > 600s` y lanza "Streaming is required"
  (`claude-sonnet-4-6` NO está en `MODEL_NONSTREAMING_TOKENS` → aplica la fórmula). El detalle ahora va por
  `.stream().finalMessage()`. **Regla: cualquier `messages.create` no-streaming con maxTokens >21.333 falla.**
- **Modal de CURACIÓN viejo↔nuevo** (reemplaza el diálogo replace/keep): regenerar una fase ahora es
  **preview → curar → aplicar**, no reemplazo directo.
  - **Preview** (`/analyze` con `preview:true`): `computeTimelineDetailPreview` computa la propuesta de la
    fase con `computeDetailTasksForPhase` (extraído de la persistencia; mismo criterio party/DEV/type) SIN
    escribir. Devuelve `{ previewTasks }`.
  - **Modal** `components/canvas/PhaseRegenModal.tsx`: dos columnas con dnd propio (izq actuales, der "cómo
    quedará"), editar/borrar/marcar-hecha; estado por `useState` lazy (no re-siembra en re-render del padre).
  - **Apply** `POST /timeline/phases/[phaseId]/apply`: reconcilia el set curado (create/update/delete por id)
    **con status por tarea** (el PUT NO acepta status → fuerza PENDING; acá `actualDatesPatch` sella fechas al
    marcar DONE), `AGENT→MODIFIED` al editar, preserva `actualStart/End`, **`patchBaselinePhaseTasks`** (cierra
    el hueco de scope-creep que el PUT/assist NO cubren), invalida `pendingProgress`, `lastEditedByHuman`,
    auto-cierre de fase, audit `TimelineChange`. Gate `editTimeline`. El agente de re-chequeo respeta lo
    marcado DONE (`isTerminalHuman`, lee `TimelineTask.status`).

## Documentación de la app (`/documentacion`, 2026-08-02)
> Nexus no tenía documentación de PRODUCTO. Lo que existía está escrito para desarrolladores
> (`ARCHITECTURE.md`, este archivo) o para el modelo (los `brief` de los agentes), y nada de eso
> sirve para que alguien de CS, Ventas o Marketing entienda qué hace la app, cuándo abrir cada
> documento o qué le genera cada agente. Dos decisiones de encuadre, tomadas por Elías: la
> **audiencia es el equipo de Smarteam** (lenguaje de negocio, cero jerga técnica) y el
> **contenido vive en el REPO, no en la base** (viaja con el deploy, se revisa como código y no
> puede desincronizarse entre ambientes; cambiar una frase es un commit).
- **Lo que una estructura ya sabe se DERIVA; solo se escribe a mano lo que ninguna estructura
  sabe.** La mitad de lo que había que documentar ya era un dato consultable: qué documentos
  existen y si nacen con el proyecto (`PIECES`), sus secciones en orden (`CANVAS_DEF_BY_SLUG`),
  qué agente los genera (`CANVAS_PRIMARY_AGENT`), en qué etapa se trabajan (`STAGE_FLOW`), los
  pipelines de HubSpot con sus etapas (`PROJECT_PIPELINES`) y qué propiedades se leen
  (`PROJECT_PROPERTIES`). A mano queda lo que ningún registro contesta: **para qué sirve** y
  **cuándo lo abro**. Una doc escrita 100 % a mano miente a los tres meses; ésta se actualiza
  sola cuando alguien agrega un canvas. `lib/manual/armar.ts` es puro (sin Prisma) justamente
  para poder testear esa derivación.
- **El guard es un test, no el tipo — porque `PieceDefinition.slug` es `string`.** El plan pedía
  `Record<PieceSlug, …>` para que agregar una pieza sin explicarla no compilara, pero el registro
  no expone un union de slugs y estrechar `registry.ts` para esto era mover una pieza medular por
  una comodidad de la doc. Se usa el patrón de la casa (`skeleton-coverage.ts`,
  `page-shell-coverage.ts`): `Record<string, …>` + un test que falla con el mensaje accionable y
  la línea lista para pegar. Cubre además el caso inverso —explicaciones huérfanas de documentos
  que ya no existen— que el tipo no cubriría.
- **Los PROMPTS de los agentes NO cruzan.** Esta sección no tiene gate (la ve todo el equipo),
  mientras que el catálogo de `/agents` está detrás de un permiso justamente porque muestra y
  edita los prompts. Traerlos acá sería mover esa frontera sin decidirlo. Lo sostiene
  `lib/manual/manual.test.ts`: `FilaDeAgente` (el tipo que consume el armado) no declara
  `systemPrompt`/`additionalInstructions`, y un escaneo estructural verifica que ni la página ni
  el armado los nombren. El escaneo **strippea los comentarios** antes de buscar: los dos
  archivos EXPLICAN por qué el prompt no está, y un test que prohibiera esa explicación empujaría
  a borrarla — el resultado opuesto al que se busca.
- **`PROJECT_PROPERTIES` se extrajo a `lib/hubspot/project-properties.ts`.** Vivía dentro de
  `sync-projects.ts`, que arrastra Prisma y el cliente de HubSpot; importarlo desde un módulo de
  documentación puro habría contaminado la cadena y roto el test. El archivo nuevo es una lista
  de strings más los 4 grupos de presentación — cero lógica.
- **Se descartó el motor `LandingView`** aunque sea el renderer reusable del repo: es tema claro
  con hex literal y no acompaña el modo oscuro, así que quedaría como una isla blanca dentro de
  la app. El motor es para documentos que se leen solos (roles, kickoff, business case), no para
  una pantalla de módulo. La pantalla usa `Tabs`/`Card` y **solo tokens semánticos**.
- **Una ruta, no cuatro** (sigue en pie): 4 rutas serían 8 entradas de registro —skeleton +
  page-shell— para contenido que cabe en una pantalla. ~~Con 4 pestañas en la URL
  (`?s=agentes`)~~ → **CORREGIDO el 2026-08-02, mismo día**: las pestañas se fueron y la página
  entera se sirve seguida. Ver la sección siguiente.
- **El HANDOFF es el caso especial del armado.** `CANVAS_DEF_BY_SLUG` lo excluye a propósito (no
  se activa desde el desplegable, lo monta el flujo de handoffs), así que la derivación ingenua
  lo mostraba con **cero secciones** — el documento con el que arranca todo, vacío. `seccionesDe`
  lo resuelve contra `HANDOFF_CANVAS` y hay un test que lo congela. Las que devuelven vacío y
  está BIEN que lo hagan: Cronograma (su contenido son fases y tareas) e Información del cliente
  y Business Case (su composición vive en otro registro).

## Documentación: el rediseño de lectura (2026-08-02, mismo día que el módulo)

> Elías pidió mejorar la estructura UX/UI e investigar cómo lo resuelven otras documentaciones de
> producto y de API. La investigación (Diátaxis, GOV.UK Design System, Baymard, NN/g, Stripe,
> Twilio, help centers de producto, docs generadas de código) devolvió un diagnóstico que no era
> de maquetación: **tres cuartas partes del manual no estaban en el DOM**.

- **La pregunta correcta no era "¿pestañas o rutas?" sino "¿el manual está en el DOM?".** El
  render condicional `{activa === "documentos" && …}` montaba un panel de cuatro, así que el
  **Ctrl+F del navegador —el único buscador que una documentación de ~40 unidades necesita, y el
  que la investigación descartó reemplazar por unanimidad (el umbral para un motor propio está en
  100-200 páginas)— veía el 25 % y devolvía "no encontrado" sin avisar**. Las 4 rutas empeoran eso
  (parten el Ctrl+F en cuatro) y `hidden="until-found"` es frágil (React serializa `hidden` como
  booleano y hay que escuchar `beforematch`). Todo servido seguido resuelve tres cosas de una:
  Ctrl+F completo, anclas nativas, y **la pantalla vuelve a ser Server Component** — lo que NO es
  cosmético: con el panel resolviéndose en el cliente, un link `#doc-kickoff` llegaba antes de que
  el destino existiera y el navegador no saltaba. Sin esto, el puntero desde el canvas tampoco
  rinde. Evidencia externa: GOV.UK dice literalmente *no usar pestañas como navegación de página*,
  y Baymard midió que el contenido tras pestañas horizontales *"se pasa por alto repetidamente,
  incluso buscándolo activamente"*. **No hizo falta redirect de `?s=`: el módulo nació el mismo
  día y nunca se deployó, así que no existe un solo link viejo.**
- **El índice de salto es forma NUEVA, no un `<Tabs>` reusado.** Parece una tab bar y no lo es: el
  modo navegación de `Tabs` marca el activo con `usePathname`, y cinco `href` al MISMO path
  dejarían los cinco con `aria-current="page"`; además `role="tab"` sobre un ancla es semántica
  falsa (un tab controla un tabpanel, no desplaza). Vive en `components/manual/` con la razón
  escrita y se promueve a `components/ui` con su ratchet si aparece un segundo consumidor —
  §1-UI punto 5 pide agregar la forma al vocabulario, y un ratchet para un consumidor único es
  teatro. **Sin scroll-spy a propósito**: un `IntersectionObserver` obligaría a volver cliente la
  única pantalla del módulo que puede ser 100 % servidor, por una mejora cosmética.
- **`Agent.description` DEJA de leerse: era una fuga con la misma forma que el prompt, por otra
  puerta.** No era ni derivado ni contenido del repo — es texto libre de la base, editable desde
  `/agents` sin deploy, sin test y sin regla de audiencia. En la única pantalla que declara "cero
  jerga técnica" se leía «Extrae información de las cards generadas por otros agentes»
  (`seed-canvas-agents.ts`). Y el guard de privacidad solo prohibía `systemPrompt`, así que nada
  impedía pegar un prompt ahí y publicarlo, sin gate, a toda la empresa. Ahora la explicación vive
  en `DOC_AGENTES` (contenido.ts) con el mismo trato que `DOC_PIEZAS`. **La clave es el GRUPO del
  agente, no su id**: el del handoff es un cuid y el catálogo evita hardcodearlo a propósito;
  `AGENT_GROUP_TO_CANVAS` es el registro estable, y el test falla si aparece un grupo sin frase.
- **El recorrido se DERIVA del motor de etapas.** Era el único bloque que incumplía la regla
  fundacional del módulo, y ya mentía: `contenido.ts` listaba **7** etapas mientras
  `FULL_CYCLE_ORDER` tiene **9**, y la píldora "Etapa:" de la misma pantalla usaba el otro
  vocabulario (`STAGE_LABEL_ES`). Ahora el orden, los nombres, qué documento se trabaja, cuál
  cierra la etapa (`STAGE_FLOW[].primary`), el hecho que la cierra (`doneLabel`), las 4
  etapas-hito sin documento y el ciclo corto salen del motor; a mano queda una frase por etapa,
  con su guard. Es LECTURA de `stage-engine.ts` — la regla que lo congela no se toca.
- **`generadoPor` y `tieneAgente` son preguntas distintas, y confundirlas mentía.**
  `CANVAS_PRIMARY_AGENT` solo conoce los botones anclados al nombre del canvas; el handoff y el
  cronograma tienen el suyo en otra parte de la pantalla. Derivar "lo escribe un agente" de ese
  mapa habría dicho que los dos documentos más importantes del arranque no los genera nadie. La
  respuesta correcta es `PieceDefinition.agentGroup`.
- **Las secciones de cada documento dejan de estar colapsadas; el apéndice de HubSpot no.**
  "¿Qué trae el kickoff?" es probablemente el dato que más se viene a buscar y detrás de un
  `<details>` no lo alcanza ni el ojo ni Ctrl+F. La excepción legítima son los 19 nombres internos
  de propiedades: no es contenido comparable, es una lista que se consulta para ir a buscarla a
  HubSpot (NN/g admite el colapsable justo cuando la mayoría no necesita el contenido) — y va con
  `CollapsibleSection` de `components/ui`, no con otro `<details>` crudo.
- **Descartado tras evaluarlo, para no re-litigarlo**: motor de búsqueda (Algolia/Pagefind/
  MiniSearch), command palette propio, tabla comparativa de los 10 documentos (con todo en el DOM
  es el mismo contenido dos veces en la misma página; la comparabilidad la da la plantilla fija de
  4 zonas), "#" copiable al hover (nadie copia anclas a mano; serían ~40 controles invisibles por
  teclado), librería de markdown, motor `LandingView`, versionado, i18n, analytics por artículo,
  widget "¿te sirvió?", breadcrumbs, prev/next, y una banda de frescura con test de caducidad —
  un ratchet que se satisface bumpeando una fecha es peor que no tenerlo.
- **Iteración prevista, no ahora**: las recetas "cómo hago X" (el ítem más caro de mantener: sus
  nombres de pantalla y de botón tienen que COMPONERSE desde `nav-config.tsx` y
  `CANVAS_PRIMARY_AGENT`, nunca como strings sueltos, más un test de que toda ruta citada existe);
  **qué revisar en el borrador** de cada documento; "cuando algo sale raro" —probablemente el
  contenido de más valor que falta, y por eso **no se inventa**: merece una pasada con síntomas
  reales del equipo—; "quién puede hacer qué" (19 secciones × 45 celdas × 7 roles, todo con label
  en español ya escrito, costo de mantenimiento cero); "qué ve exactamente el cliente" (6
  superficies externas, 3 accesos, 4 mecanismos de publicación, hoy resumidos en una píldora); y
  llenar el `tip` por sección en los 6 canvases vacíos — la única propuesta que mejora la
  documentación **sin que nadie entre a `/documentacion`**.

## Una empresa fusionada no puede partir un cliente en dos (2026-08-03)

**El hecho:** al fusionar dos empresas en HubSpot, la perdedora sigue respondiendo `200` con los
datos de la ganadora. Solo se mudan las asociaciones. Medido en el portal real: **10 de las 158**
empresas que Nexus guarda absorbieron a otra — 21 fichas sepultadas. No es un caso exótico.

**El problema:** los formularios que dan de alta algo desde cero reciben el id de la empresa de una
búsqueda por dominio, que solo devuelve fichas **vivas**. Nexus guarda el id que tenía el día que
se vinculó el cliente. Si hubo fusión, los dos ids no coinciden, el cliente "no existe" y se crea
**un segundo cliente para la misma cuenta**.

**Lo decidido:**

1. **Encontrar y reapuntar son la misma operación.** Reusar el cliente sin arreglarle el id sería
   igual de malo por el otro lado: el motor del alta cuelga el registro nuevo de HubSpot de
   `client.hubspotCompanyId`, o sea de la lápida, y el sync siguiente vuelve a encontrar cero.
2. **La pregunta por la fusión va en las ALTAS; el desempate va en las DOS puntas.** Es un corte
   fino que se ganó dos veces. Si el buscador *resolviera* el cliente, el formulario mandaría
   `clientId` en vez de `companyId` —son excluyentes— y la rama que arregla y reapunta no correría
   nunca: cablearlo **apaga** el arreglo. Pero al revés también falla: cuando la empresa viva ya
   tiene clientes, el buscador siempre devuelve uno y el alta entra por `clientId`, así que la
   regla del punto 3 quedaba inalcanzable **justo en el camino que factura**. Por eso el buscador
   desempata con la misma función pura —sin red y sin escribir— y devuelve `null` cuando no puede.
3. **El desempate entre dos clientes de una misma empresa prefiere `CLIENTE` sobre `PROSPECTO`,**
   y con dos `CLIENTE` de verdad **no elige**. Es de plata: un proyecto que nace en un prospecto
   queda fuera de cobranza, de la cartera y del vigilante, sin ningún error. Hay un caso vivo
   (empresa `53154855252`: «Areyas» prospecto y «Areyá» cliente).
4. **El reapunte automático queda acotado a ese caso.** Barrer la cartera entera sigue siendo el
   script manual con `--apply` + `ALLOW_PROD_WRITE=1`: ahí nadie pidió nada y conviene mirar antes.

**Descartado — resolver por dominio (`emailDomains`)** en vez de por el historial de fusión: sería
un arreglo de tres líneas y cero llamadas, pero solo **124 de 158** clientes tienen el dominio
cargado y el match por dominio es difuso. `hs_merged_object_ids` es un hecho que afirma HubSpot.

## El renombre: "Business Case" → "Propuesta comercial" (2026-08-03)

- **Se renombró lo VISIBLE y NADA más.** El nombre en pantalla cambió en ~45 textos; la
  IDENTIDAD sigue en inglés y se queda así: el modelo `BusinessCase`, el campo `businessCaseId`
  (~50 archivos), la ruta `/business-cases` (36 carpetas) y el slug de pieza `business-case`.
  Renombrar eso costaría una migración de datos y rompería los links ya pegados en chats, a
  cambio de que nadie del equipo vea una sola diferencia. **Regla que queda: el nombre visible es
  copy; la ruta y el modelo son identidad.**
- **Salió gratis porque `lib/pieces/registry.ts` estaba diseñado para esto.** Ese registro separa
  `slug` (identidad estable) de `label` (nombre visible) justamente para que un renombre sea una
  línea, y traía el cambio anotado desde F1 (`// F4: → "Propuesta comercial"`). Todo lo que deriva
  de `pieceLabel()` —el desplegable de canvases, el catálogo de agentes, la Documentación— se
  actualizó solo. Es la primera vez que se ejerce la promesa del registro y se cumplió.
- **Los prompts de los agentes NO se tocaron** (`canvas-agent.ts`, `agent.ts`, el `brief` del hero
  en `business-case.defs.ts`). Cambiarlos obliga a re-sembrar el agente en producción y puede
  mover la salida; el término no llega a pantalla y el modelo entiende el concepto igual. Queda
  para cuando haya otra razón para re-sembrar.
- **El cliente nunca vio el término**: se verificó `app/external/**`, `lib/external/**` y el
  registro de impresión — "Business Case" solo aparecía en comentarios de código. Cero riesgo con
  las propuestas ya publicadas y sus snapshots congelados.
- **Lo que quedó a propósito sin cambiar**: `BUSINESS_CASE_CANVAS.name` en `canvas-defs.ts`, que
  está declarado LEGACY en su propio comentario, nunca se persiste (el `name` de la fila es la
  VERSIÓN — "Plantilla", "Caso de uso 2") y nunca se renderiza.

## Un tipo de propuesta siembra lo que AFIRMA, no lo que sugiere (2026-08-04)

> Disparador: Elías, sobre el cambio del día anterior — *"Uno de sitio web, puede sembrar o no lo
> de Content Hub. Realmente puede ser WordPress o similar."* El tipo "Sitio web" sembraba
> `sitio_web` **y** `content_hub`, o sea que afirmaba la plataforma sin que nadie la hubiera dicho.

- **La regla: se siembra SOLO lo que elegir el tipo vuelve CIERTO.** "Sitio web" afirma que se
  vendió un sitio (`sitio_web`, grupo `scope`); no afirma sobre qué se construye. La plataforma la
  agrega el CSE en la tira de tags cuando ya la sabe. Aplica igual al subtipo: E-commerce dejó de
  sembrar `commerce_hub` — un e-commerce puede ser Shopify o WooCommerce.
- **Un tag de más NO es neutro, y por eso el default correcto es ninguno.** Los tags son
  DISPARADORES: `EXPLORACION_TAG_LENSES` decide qué va a preguntar el agente de Exploración y
  `hasTechnicalScope` rutea al canvas Desarrollo y a la fase técnica del cronograma. Un
  `content_hub` falso manda a explorar la plataforma equivocada y queda registrado como si alguien
  lo hubiera confirmado. Mismo criterio que `tamUsd` (null ≠ 0) y que "no se adivinan aliados ni
  internos desde el nombre": **antes "sin definir" que adivinado**.
- **No se tocó el SUBTIPO para meter ahí la plataforma.** Informativo/E-commerce es la CLASE de
  sitio, se muestra en el encabezado y viaja al prompt de todos los agentes de la propuesta
  (`generate`, `assist`, `publish`, `regenerate`, casos de uso). Reutilizarlo como selector de
  plataforma costaría esa distinción. Si algún día se quiere elegir la plataforma al crear, va
  como eje PROPIO — no encima de uno que ya significa otra cosa.
- **La regla queda con guard, porque el catálogo va a crecer** (CRM, CDP, integraciones,
  desarrollo a la medida, y lo que sigan agregando). `lib/business-cases/case-types.test.ts`:
  todo tag sembrado tiene que existir en `TAG_CATALOG` (un slug con typo se guardaba igual y
  quedaba invisible en la tira) y ningún tipo puede sembrar un tag del grupo `product` salvo los
  de la allowlist `PUEDEN_SEMBRAR_PRODUCTO` — hoy solo "Implementación de Insider", que sí lleva
  el producto en su identidad. Sumar uno obliga a tocar la allowlist y a leer por qué.
- **`extraTags` del subtipo se queda en el tipo aunque hoy no lo use nadie**: es el mecanismo para
  el subtipo que SÍ afirme un producto, y el test lo cubre igual.

## "Qué se implementa" pasa a ser una columna por Hub (2026-08-12)

> Elías, sobre la propuesta de implementación de HubSpot: *"quiero mejorar la sección de qué
> se implementa. Que sea una sección interactiva… si uno da un clic en los botones de arriba
> se agregan secciones explicativas"*. Eran cuatro campos de texto libre que el agente llenaba
> con prosa: la sección que le dice al prospecto qué compra se leía como un párrafo.

- **El renderer cambia SIN declarar un `sectionType` nuevo**, y la rama legacy es un
  REQUISITO, no una cortesía. Una primera versión del plan afirmaba que lo ya publicado
  seguiría con el componente viejo porque el snapshot congela el `sectionType`. **Es falso:**
  `configForSnapshot` hace `const known = byKey.get(s.key); if (known) return known` — la
  config VIVA gana por KEY, y el `sectionType` congelado es solo el fallback de una key
  BORRADA del template. Como `solucion` sigue viva, toda propuesta publicada estrena el
  componente nuevo. De ahí las dos consecuencias: la entrada del registry se reapunta (cero
  churn en el snapshot de keys de `registry.test.ts`) y `HubsClienteSection` lleva adentro los
  4 campos de la v1 como rama legacy — es lo único que sostiene lo que ya está en la calle.
- **Hay una columna por CADA Hub, no solo por los vendidos** *(2026-08-12, mismo día:
  corrige la primera versión)*. Con la sección mostrando solo lo vendido, una propuesta con
  dos Hubs pintaba dos píldoras y no había nada que explorar — que era justamente el pedido
  original ("si uno da un clic en los botones de arriba se agregan secciones explicativas").
  Ahora el agente escribe las seis, los vendidos primero y en modo "esto se implementa", el
  resto en condicional. El cliente los ve y puede abrirlos; la columna que no se vendió lo
  DECLARA con un chip **"No incluido"** — sin eso, explorar se leería como que ya está
  incluido, que es la única forma en que esta sección podría mentirle a un prospecto. En el
  **PDF salen solo los vendidos**: el documento formal no lista lo que nadie compró.
- **`activos` se SIEMBRA desde los tags en cada generación completa** (`generate/route.ts`,
  junto a `__lang`). Los tags son la declaración del vendedor de qué se vendió, así que
  agregar uno y regenerar tiene que encenderlo; el ajuste fino con las píldoras del editor
  sobrevive a la regeneración POR SECCIÓN, donde manda `preserveNonSchemaKeys`. Sin tags no
  se siembra —ausente = todas encendidas—: no sabemos qué se vendió, así que no se apaga
  nada. Y el conocimiento que se le carga al agente pasó a ser el de los SEIS Hubs (los 6
  documentos suman ~11,2k contra el cap de 12k: entran completos).
- **La curaduría del CSE (`activos`) va FUERA del schema y en el PRIMER nivel.** Fuera del
  schema porque `coerceToSchema` descarta lo no declarado: así **el agente no puede decidir qué
  le vendieron al cliente**, ni por error — la invariante la sostiene el tipo, no un pedido en
  el brief (mismo criterio que la casilla `hecha` de Exploración). En el primer nivel porque
  `preserveNonSchemaKeys` es SHALLOW y ahí es donde sobrevive a regenerar (patrón
  `hero.coverImageUrl`). `activos` ausente = todas encendidas; un array vacío SÍ es una
  decisión.
- **El array nuevo se llama `columnas`, NO `hubs`.** Reusar la key vieja cambiaría el TIPO del
  mismo campo: `coerceToSchema` con `{type:"array"}` sobre un string devuelve `[]`, y en el
  canvas vivo de un caso viejo el componente leería un string donde espera un array. Las 4 keys
  de la v1 quedan declaradas como legacy solo-lectura (patrón `WebScopeData.bloques`) y entran
  a `LEGACY_CARRY_EXCLUDE`: sin eso, regenerar un caso viejo las arrastra como keys no-schema y
  la rama legacy se prende sobre una generación NUEVA.
- **En el PDF no se pintan píldoras y todo sale expandido.** Una píldora que esconde contenido
  en un PDF es contenido PERDIDO y nadie se entera. Mismo criterio que `DiagramSection` con su
  variante estática. Por lo mismo, **sin scrollers**: grid con wrap y `break-inside: avoid` —
  un carrusel horizontal imprimiría solo el primer viewport y saldría cortado en silencio.
- ~~**En edición se pintan TODAS las columnas, las apagadas atenuadas.**~~ **SUPERSEDED el
  mismo día:** una columna que NO está seleccionada **no se pinta, ni en el editor**. Con las
  apagadas en pantalla —aunque fuera al 45 % de opacidad— la píldora no se leía como una
  selección: la reacción de Elías al verlo fue *"no están apareciendo preseleccionadas
  ningunas"*, con dos de seis efectivamente encendidas. Las seis columnas **existen** (el
  agente las escribe todas) y se ven solo las encendidas; el cliente las abre con la píldora.
  ⚠ Eso devuelve el peligro que la versión anterior evitaba: `visibles` es un SUBCONJUNTO, así
  que **reordenar no puede escribirse como la lista completa** (borraría las apagadas). El
  `onReorder` mapea las visibles de vuelta a las MISMAS posiciones que ocupaban en `columnas`.
- **Cuántas columnas por fila lo decide el componente, no un `auto-fit`.** Hasta 3 van en una
  fila; de 4 en adelante se parte en dos filas parejas (4 → 2 y 2 · 5 → 3 y 2 · 6 → 3 y 3).
  Con `repeat(auto-fit, minmax(260px,1fr))` los seis Hubs entraban en una sola fila de tarjetas
  ilegibles y cuatro quedaban 4+0 en vez de 2+2. Son tres clases (`--1`/`--2`/`--3`) y no una
  variable CSS para que las media queries de pantalla angosta puedan pisar cada caso por
  separado.
- **`columnasActivas` recibe las columnas ya saneadas en vez de volver a sanearlas.**
  `hubColumnas` construye objetos nuevos: dos llamadas dan columnas idénticas en forma pero
  distintas en identidad, y con eso el `indexOf` del componente daba -1 — editar una columna
  habría editado otra.
- **Los nombres de Hub se resuelven por `normalizeTag`, no por un mapeo propio.** El agente
  escribe el slug, el rótulo o el nombre viejo del producto, y hay casos guardados con
  `operations_hub` / `commerce_hub`. Todo pasa por la doctrina de alias que el catálogo ya
  declara — y por eso apagar un Hub sigue apagado aunque el agente lo re-escriba con otro de
  sus nombres. Una columna cuyo `hub` no es del catálogo (Breeze, un agente a la medida) se
  pinta con el color NEUTRO y conserva el título del agente: no se le impone un rótulo.
- **Los seis colores viven en el CSS y el mapa slug→variable en TypeScript.** Al revés
  (los hex en TS) `lib/ui/landing-brand-contrast.test.ts` —que lee del archivo— no podría
  vigilarlos, y los seis se pintan como FONDO con texto blanco encima. Todos dan ≥5:1. **No se
  usan los hex de marca de HubSpot**: `#FF7A59` con blanco da 2.3:1. Un Hub nuevo sin color
  rompe `lib/landing/hubs-solucion.test.ts`, y sin par de contraste rompe el guard de marca.
- **El ícono de producto de cada Hub va como MÁSCARA CSS, no como `<img>`** (2026-08-12).
  Los SVG oficiales de HubSpot viven sin tocar en `public/hubs/`, con el **slug como nombre
  de archivo** (`sales_hub.svg`) para que la URL se derive y no haga falta un mapa; un
  `lib/landing/hubs-solucion.test.ts` verifica contra el disco que ninguno falte. Vienen en
  el naranja de HubSpot (`#ff4800`) y sobre una píldora encendida —navy, royal, verde— ese
  naranja es justo el par que el doc de marca prohíbe; sobre la de Marketing sería naranja
  sobre naranja. Enmascarados toman el color del Hub y blanco al encenderse, con el archivo
  intacto. El ícono **reemplaza al punto de color**: dice lo mismo y además cuál. Una
  columna que no es un Hub del catálogo no tiene ícono y conserva el punto.
- **Los canales van como píldoras de TEXTO, no como logos.** Dibujar de memoria los SVG de
  LinkedIn/Meta/Google en un documento que ve el cliente es un riesgo sin contrapartida: el
  dato que importa es cuál es el canal. Y van como CSV en un campo string porque
  `coerceToSchema` aplana toda hoja del schema: un `string[]` adentro de un ítem de array no
  sobrevive.
- **`empty` no declara `activos`**: un default de presentación volvería la sección
  permanentemente no-vacía y haría mentir al botón "Limpiar" — la trampa que ya mordió con
  `anchoRecurrente`, `logoScale` y `__lang`.
