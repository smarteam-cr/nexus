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

## Acceso externo — la dirección nombra el proyecto
- **Toda página externa de un proyecto vive en `/external/<superficie>/<id del acceso>`, y
  nunca muestra un proyecto distinto del que nombra** (`resolveActiveAccess(credencial, accesoId)`
  exige que la credencial sea de ESE acceso). *Por qué:* el 2026-09-10 a Elías le pasaron
  `/external/cronograma` con el código de Judesur y vio el de Wherex. No era caché: esa dirección
  era el destino después de la contraseña, no decía de qué proyecto era, y el navegador guardaba
  UNA credencial (la del último enlace abierto). Quedaba en la barra con cara de compartible.
- **El navegador recuerda VARIOS proyectos** (cookie `nexus_ext_accesos`, lista con tope de 8 y
  30 días por entrada — `lib/external/lista-de-accesos.ts`). El verify se mudó a
  `/external/verify-access` porque para sumar hay que LEER la lista, y su path es `/external`.
- **«Ver otros proyectos» lista solo lo que ese navegador ya abrió con su contraseña, y solo del
  MISMO cliente** (decisión de Elías: la opción 1). *Por qué:* no mostrarle a nadie un proyecto que
  no le compartieron, no abrir otra forma de entrar, y no poner el nombre de otro cliente en la
  pantalla de una reunión (el CSE proyecta estas páginas).
- **Las direcciones sin proyecto (`/external/cronograma`, etc.) nunca muestran contenido:** listan
  lo abierto en ese navegador y dejan elegir. Si lo abierto es de MÁS DE UN cliente, la lista queda
  plegada detrás de un clic: esa página también puede estar proyectada en una reunión. *Se
  descartó* una contraseña por empresa con portal: hoy solo 1 cliente tiene dos cronogramas
  publicados, obligaba a migrar los 25 accesos, y el acceso pasaba a ser todo o nada por empresa.
- **La propuesta tiene UNA sola puerta: el modo con contraseña se RETIRÓ (2026-09-10), no se
  rehízo.** Tenía el mismo defecto (una sola cookie `nexus_bc_access` y un destino fijo
  `/external/business-case` que no nombraba la propuesta: una dirección reenviada mostraba la
  última propuesta abierta en ese navegador o dejaba en la barra el enlace abierto de OTRA, con
  precios). *Por qué retirarlo y no rehacerlo:* medido ese día en producción, 0 de las 14
  propuestas vivas pedían contraseña y ninguna de las 6 creadas desde la apertura masiva del
  2026-08-20 la había encendido (decisión de Elías). *Qué quedó:* la propuesta se abre solo por
  `/external/propuesta/<token>`; los enlaces con contraseña que siguen en correos
  (`/external/business-case/verify/<token>`) llevan a la propuesta de SU token; la dirección sin
  propuesta dice que no indica ninguna y no redirige; el panel de Ventas perdió el check y el PATCH
  que lo pide contesta 410. La columna `requiresPassword` queda en la base sin lectores (sin SQL).
  *Si vuelve a hacer falta* una propuesta protegida, se construye como el acceso de proyectos; no
  se revive la vieja (candado 11 de `lib/external/propuesta-abierta.test.ts`).

## Cronograma — vista del cliente
- **El cronograma compartible (`/external/cronograma/[acceso]`) muestra, por tarea, el ESTADO
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
  volver a Nexus contabilidad. ⚠ Desde 2026-09-12 (etapa 7) el número de la factura va en
  `Cobro.numeroFactura`, al marcar facturado; esta queda para el depósito o la transferencia.
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
- **Promesa de pago = MARCA, no descuento (reescrita 2026-09-12, decisión 5 de Alex)**: la factura
  sigue vencida y queda marcada con la fecha prometida; la alerta no desaparece; si la fecha pasa
  sin depósito, la alerta sube. En código: `semaforoCobro` mira solo el crédito, `marcaPromesa`
  (vigente / incumplida / null sin factura) es la única regla de la marca, COBRO_VENCIDO sigue en
  ALTA y dice «prometió pagar el {fecha}», y la fecha pasada sin COBRADO emite PROMESA_INCUMPLIDA
  (ALTA). Registrar la promesa ya no pospone alertas. ⛔ Lo que había antes decía «calla alertas,
  NO números» y hacía las dos cosas: la promesa vigente pintaba de azul la factura vencida, y la cola,
  Reportes y el corte (que cuentan como vencido solo lo rojo) la sacaban del vencido mientras
  Proyección la seguía contando — US$4.298 de diferencia entre pantallas el 2026-09-12. Además 18 de
  las 20 alertas pospuestas lo estaban por el auto-posponer de la promesa. No se limpia al cobrar
  (trazabilidad de si cumplió). Gmail inbound para detectarla automática = slot futuro del
  CommunicationPort, NO cableado.
- **Snooze manual de alertas (`posponerHasta`) no cambia el estado**: la alerta sale del feed
  (filtro en loadAlertas) y vuelve SOLA cuando la fecha llega; el merge de upsertAlertas no toca
  posponerHasta, así el snooze sobrevive a los cortes. **Única excepción (2026-09-12)**: las cuatro
  alertas del ciclo de un cobro (COBRO_PROXIMO, FACTURACION_ATRASADA, COBRO_VENCIDO,
  PROMESA_INCUMPLIDA) comparten UNA fila (`lib/cobranza/alertas-merge.ts`), y cuando esa fila sube
  a PROMESA_INCUMPLIDA, o pasa de «falta facturar» a COBRO_VENCIDO, vuelve a ABIERTA, pierde quién
  la vio y pierde el posponer: si la fecha prometida pasó sin depósito la alerta sube (decisión 5 de
  Alex), y lo pospuesto como trabajo de Smarteam no esconde la deuda del cliente. Sin el segundo
  caso, el vencido de Ecoquintas del 19-sep heredaba el auto-posponer viejo de su promesa y no se
  veía hasta el 30-sep. Cualquier otro cambio respeta lo que la persona hizo con la fila.
- **Las alertas se refrescan cada noche y se cierran solas (2026-09-12)**: `maintenance-daily` corre
  `computeAlertSet` sobre la cartera entera, abre solo la deuda del cliente (COBRO_VENCIDO y
  PROMESA_INCUMPLIDA), pone al día las filas que ya están en el feed y cierra las que el motor ya no
  produce. Lo mismo, por cuenta, al generar cobros, al soltar facturas y al guardar un plan; y
  confirmar un cobro cierra sus alertas en la misma transacción. Reglas en
  `lib/cobranza/alertas-cierre.ts`: solo se miden los tipos que produce el motor (las de Odoo no) y
  solo en cuentas evaluadas; de dos filas vivas sobre lo mismo se queda la que elige el merge. ⚠ Un
  cierre del sistema se firma `sistema` y NO suprime la reaparición de 7 días: esa supresión es para
  no re-abrir lo que resolvió una persona, no para callar una situación que vuelve. ⛔ No guarda
  corte: la foto de la quincena la sigue guardando el corte. Hasta ese día el feed era una foto del
  24-jul (corte apagado): 9 alertas vivas sobre cobros ya cobrados y 7 de Kaizen pidiendo confirmar
  catch-ups que el plan había corrido al futuro. Un catch-up con fecha de hoy en adelante ya no es
  catch-up: no alerta, y al regenerar vuelve a origen PLAN (`esCatchUpPendiente`).
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
  ⚠ **ACOTADO el 2026-08-14** (ver §"El libro de planilla"): todo este párrafo sigue vigente
  **para `CostoRecurrente`** y solo para él. Lo que se pagó de verdad vive en `PagoPlanilla`,
  que es otra entidad y sí lleva estado de pago. La prohibición fiscal y la de FX **no se
  levantaron**.
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
- **El CSL administra Roles como dirección (2026-09-23).** `esAdminDeRoles` (`lib/roles/access.ts`)
  = `SUPER_ADMIN | CSL`, y de ella derivan las cuatro puertas: `visibleRoleWhere` (ve todo),
  `canEditRoleDocs` (las dos pantallas), `guardRolesAdmin` (toda la API) y el gate del PDF. Decisión
  de Elías: el CSL lleva la contratación de su equipo y necesita el documento completo —editarlo,
  compartirlo y mandarle el link al candidato— sin pasar por dirección. **Sigue sin ser delegable
  por plantilla**: es una lista hardcodeada de roles, no una celda de la matriz.
  ⚠ **Por qué VER y ADMINISTRAR se movieron juntos**: `guardRolesAdmin` no recibe el id del
  documento, y eso solo es correcto mientras quien lo pasa vea TODOS. Un permiso PARCIAL (el primer
  intento: compartir sí, ver solo lo compartido) no cerraba por dos lados — el CSL habría podido
  crear un documento que no podía abrir, y habría hecho falta `canReadRoleDoc` por documento en cada
  handler para que no administrara ajenos probando ids. Congelado en `lib/roles/access.test.ts`
  («ADMINISTRAR y VER son la misma respuesta») y en `lib/roles/api-guards.test.ts`.
  ⚠ Es por ROL: **cualquier CSL** presente y futuro ve las propuestas con su oferta económica.
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
  Iba a borrarse el 2026-08-04 junto con `lib/roles/csl-legacy.ts`; **se retiró el
  2026-09-10**, un mes tarde, con Elías confirmando que ya no se usaba. Hasta ese día PROD
  seguía respondiendo 307: la dirección fija, sin token ni contraseña, le entregaba el token
  vivo del link (con la oferta salarial) a cualquiera que la conociera. Retirar el puente no
  rota el token que ya entregó — eso se hace republicando desde /roles.

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
- **SUPERSEDED 2026-09 (E2b–E4):** «Regenerar» de una fase deja una propuesta (`soloFase`) que se
  revisa en la barra; no borra ni regenera en el lugar.
  **Regen POR FASE (retroactivo y seguro)**: `POST /analyze` con `regeneratePhaseId` rehace SOLO una
  fase reusando el agente de detalle (prompt scopeado a esa fase → menos tokens/truncación). Salvaguarda
  **por ESTADO, no por source**: borra solo `AGENT` + `PENDING` + `actualStart:null`; preserva HUMAN,
  MODIFIED (curación) y todo lo iniciado. Borrado dentro de la `$transaction` de persistencia → atómico.
  **Guardas G1/G2 (409 sin borrar)**: G1 = sin baseline activo / `timelinePublishedAt` null (regenerar
  cambia ids de tarea y rompería la comparación por-id del portafolio D.3 contra el baseline congelado);
  G2 = la fase no tiene tareas iniciadas/hechas (borrar perdería avance sellado). Invalida
  `pendingProgress` (ids nuevos). Gate: `cronograma.regenerate` (ya lo aplica `resolveArtifactGate` en
  `/analyze`) — no se creó capacidad nueva.
- **SUPERSEDED 2026-09 (E2b–E4):** «Regenerar» de una fase deja una propuesta (`soloFase`) que se
  revisa en la barra; no borra ni regenera en el lugar.
  **Follow-up — regen POR FASE en cronogramas PUBLICADOS + modo + contexto Desarrollo**:
  - **SUPERSEDED 2026-09 (E2b–E4):** la propuesta nunca parchea la foto publicada.
    Se levantaron G1/G2. La seguridad ahora es: (a) el borrado nunca toca DONE/iniciadas; (b) tras
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
- **SUPERSEDED 2026-09 (E2b–E4):** sin modal de dos columnas; la ruta se borró en E4.
  **Modal de CURACIÓN viejo↔nuevo** (reemplaza el diálogo replace/keep): regenerar una fase ahora es
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
  **⚠ SUPERADO EL 2026-09-11** para cuatro de esa lista —buscador, command palette, versionado y
  breadcrumbs—: entraron con la base de conocimiento. El descarte era correcto PARA LO QUE ERA
  —un manual de ~40 unidades escrito por desarrolladores, donde el Ctrl+F alcanza—; dejó de serlo
  cuando el módulo pasó a ser una base que escribe el equipo y que crece sin techo. Ver la sección
  «Documentación pasa a ser una base de conocimiento».
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
- ~~**Los seis colores viven en el CSS y el mapa slug→variable en TypeScript.**~~
  **SUPERSEDED el mismo día: la sección es BLANCO Y GRIS, con el naranja de HubSpot
  (`#FF4800`) como único acento, y solo en los íconos.** Un color por Hub daba seis acentos
  fuertes en una sola sección: competía con el resto de la propuesta y la píldora encendida
  se leía como una etiqueta de categoría, no como una selección. Ahora el estado se lee por
  RELLENO (blanco → gris) y peso de tinta. Quedan tres tokens neutros (`--hub-soft`,
  `--hub-line`, `--hub-line-on`) más `--hub-accent`.
  ⚠ **`--hub-soft` no se puede oscurecer**: el naranja encima da 3.14:1 y el mínimo de WCAG
  1.4.11 para un ícono es 3. Ese par está en el guard de contraste justamente porque el
  margen es chico y nadie lo notaría a ojo.
- **La diferencia entre encendida y apagada la hace la APAGADA: no tiene caja.** Fondo y
  borde transparentes, texto `--hub-off` e ícono al 38 %; la encendida es la única con
  relleno gris, borde `#8B93A1` de 1px y tinta plena en negrita. Se llegó acá en dos pasadas
  —primero *"que se note un poco más los hubs seleccionados"* (borde `#C9CDD4` = 1.59:1
  contra el paper, invisible en una tira de seis), después *"que los que no estén
  seleccionados se noten menos"*— y la segunda hizo innecesario el refuerzo de la primera:
  con la apagada sin caja, **1px alcanza** y el ring `inset` se retiró. Notas:
  el relleno nunca pudo hacer este trabajo (techo del ícono); el borde de la encendida da
  3.09:1, que es el 3:1 que WCAG 1.4.11 pide para el borde de un control, y está en el guard;
  el borde de la apagada se declara `transparent` y no ausente para que encenderla no corra
  el layout un pixel; y el texto NO se atenúa con `opacity` —tiene su propio token
  `--hub-off` con **4.80:1**, que es lo más claro posible sobre el piso AA de 4.5 para la
  etiqueta de un control, no algo deshabilitado—. **El grueso de la atenuación lo hace el
  ícono**, que sí puede bajar del 3:1 de 1.4.11: al lado tiene el nombre del Hub escrito,
  así que no es él quien lleva el significado.
- **En la cabecera de la columna, el ícono y el nombre del Hub van en UNA línea.** Apilados,
  el ícono quedaba como un adorno suelto arriba de todo; juntos son la firma del producto.
  El nombre sube a 14px (de 11) para emparejar con el ícono de 28 y le baja el tracking —el
  de un eyebrow, a ese tamaño, lo estiraba—, pero se queda por debajo del título descriptivo
  (16px, tinta plena), que es el que tiene que ganar la lectura.
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

## Secciones personalizadas y la inversión unificada (2026-08-12)

- **La identidad de una sección personalizada es un PREFIJO en `CanvasSection.key`
  (`custom:<uuid>`), no una columna.** *Por qué:* `key` es String libre con
  `@@unique([canvasId,key])`, así que la base ya acepta una key fuera de la plantilla y ya
  garantiza unicidad. Una columna `sectionType` costaría una migración COORDINADA entre las 2
  PCs que comparten esta base, y mientras la otra no tenga el schema cualquier `select` de esa
  columna le revienta en runtime — todo para guardar un dato que la key codifica sola. El `:`
  es imposible en una key de plantilla (todas son snake_case) → colisión estructuralmente
  imposible, congelada por `lib/landing/custom-sections.test.ts`.
- **Un solo resolver (`configForCanvas` / `defsForCanvas`), no un parche por consumidor.**
  *Por qué:* los recortes de secciones estaban escritos dos veces (editor e impresión, con el
  segundo documentando que era copia del primero) y los dos fallan igual: la sección que no
  matchea se cae del `filter` sin error, sin log y sin poner roja la suite. Con parches sueltos,
  el que se olvide produce "se ve en el editor y falta en el PDF que ya se mandó".
- **`sandbox="allow-scripts"` SIN `allow-same-origin`, y las dos juntas jamás.** *Por qué:*
  juntas se anulan — el frame sería same-origin y ejecutaría scripts, o sea que podría quitarse
  el sandbox solo. Verificado con Chrome real: el script corre y anima su propio DOM, pero
  cookie/localStorage/parent.document/top.location dan SecurityError, `window.origin` es "null"
  y `frameElement` es null. Sin `allow-forms`/`allow-popups`/`allow-top-navigation`/`allow-modals`.
  Como en el repo NO hay CSP en ninguna capa que sirva de red debajo, se inyecta una en el
  propio `srcDoc` (`connect-src 'none'`, `form-action 'none'`) dejando los CDN vivos.
- **El HTML se pega en un `<textarea>`, nunca en el `Editable` del motor.** *Por qué:* ese lee
  y escribe con `textContent`: el markup se ve hasta el blur y se guarda APLANADO sin un solo
  aviso. No es ergonomía, es la frontera — pegar en un contentEditable además inserta DOM real
  dentro del origen de Nexus.
- **Toda sección `agentGenerated:false` se ARRASTRA al regenerar.** *Por qué:*
  `createBusinessCaseCanvas` siembra el `empty` en cada sección y `generate` solo re-escribe las
  keys que el agente devolvió; sin el carry-forward, marcar una sección como curada hace que
  cada "Generar" borre lo que se escribió a mano. Mismo mecanismo para las personalizadas.
- **La inversión es UNA sección para los dos templates y se lee como LINE ITEMS DE FACTURA.**
  *Por qué:* convivían dos secciones distintas bajo la misma key `inversion` (la de HubSpot sin
  total). `licencias` es la ÚNICA key nueva → lo publicado de sitio web no necesita rama legacy.
  **Corregido el 2026-08-12 (decisión de Elías):** la rama de dos tarjetas de HubSpot también se
  retiró. El shape viejo se PROYECTA al nuevo en el render (`adoptarShapeNuevo`, patrón
  `DiagramSection`) y se persiste con la primera edición humana. Lo que la versión anterior de
  esta decisión protegía —que a un cliente no le aparezca un número que nunca vio— lo sostiene
  ahora el parser: esos montos son texto libre ("A definir en propuesta formal") ⇒ `parseMonto`
  los da "sucio" ⇒ no suman. ⚠ Es una garantía **dependiente de los datos**, así que se
  re-verifica antes de cada deploy con `scripts/verificar-inversion-publicada.ts` (corrido el
  2026-08-12: 5 publicadas, 3 proyectadas, **cero** con total nuevo).
- **La proyección tiene que partir de `d` y no de `data` en TODOS los escritores.** *Por qué:*
  si `set` partiera de la data cruda, el guardado dejaría un HÍBRIDO (keys legacy + `lineas`) y
  borrar una fila sería imposible — `esInversionLegacy` volvería a dar `true` y la resucitaría
  en el render siguiente. El PUT de bloques REEMPLAZA `data` y `JSON.stringify` descarta los
  `undefined`, así que partiendo de `d` las keys viejas mueren en el primer guardado.
- **Con UN grupo con montos se pinta UN total (la píldora de siempre); el gran total aparece
  recién con DOS.** *Por qué:* `configForSnapshot` resuelve por key contra la config viva, así
  que toda propuesta publicada estrena el renderer nuevo. Esta regla es lo único que hace que
  las de sitio web se sigan viendo idénticas.
- **La fila y los totales comparten UNA rejilla de dos columnas declarada, no `flex` con
  `space-between`.** *Por qué:* con `space-between` la posición del número se DERIVA de cuántos
  hijos tenga la fila — cuando el bloque de total ganó un tercer hijo ("+1 a definir"), la
  píldora naranja quedó flotando en el medio. Con la columna declarada por grid y el marcador
  de pendientes DENTRO de la celda del rótulo, no puede volver a pasar aunque se agregue un dato.
- **El monto se NORMALIZA al formato de la moneda, solo en LECTURA y solo si parsea.**
  *Por qué:* si el renglón dice "12000" y el pie dice "$34,250", el lector no puede verificar de
  un vistazo la suma que le cobran, que es lo único que una factura tiene que permitir. El valor
  mostrado ES el que se sumó ⇒ formatearlo no cambia el número, lo hace auditable. Lo que NO
  parsea sale palabra por palabra y en registro de nota — no se inventa un número donde Ventas
  escribió una condición. ⚠ En modo EDICIÓN el campo muestra siempre el texto CRUDO: `Editable`
  comitea su propio `textContent` al blur y al desmontarse, así que un valor derivado adentro se
  auto-persistiría y le reescribiría el monto a Ventas.
- **Sin moneda de sección, la deducen las líneas; si se contradicen, no hay total.** *Por qué:*
  la guarda anti-mezcla de `parseMonto` vive DENTRO de `if (codigoSeccion)` — sin moneda está
  apagada, y ninguna sección vieja de HubSpot declara moneda. Sin esto `₡1.500.000` + `USD $7.500`
  daban 1.507.500: el único error de esta sección que produce un número inventado. La moneda
  deducida gobierna la aritmética y el formato, **nunca el rótulo**: "Montos en X" sigue
  mostrando solo lo que la sección DECLARA — afirmarle al cliente una moneda inferida sería
  fabricación.
- **Los montos los escribe VENTAS: la sección es `agentGenerated:false` en los dos templates**,
  y el preámbulo del generate le PROHÍBE al agente escribir precios en cualquier texto. *Por qué:*
  al sacarle su sección natural, el modelo teje los montos del contexto en la prosa del hero o
  de la solución, donde nadie los revisa antes de que la propuesta salga.
- **Una línea que no parsea se EXCLUYE del total y se cuenta como pendiente ("+2 a definir").**
  *Por qué:* antes se salteaba en silencio, y un total de $12,000 conviviendo con una línea
  "A definir" es una mentira barata: quien lo lee cree estar viendo el precio completo. El ⚠ por
  línea es SOLO del editor — el cliente ve el monto tal cual lo escribió Ventas.
- **`SectionDef.invest` lleva CLAVES DE i18n, no literales** (a diferencia de `chips`).
  *Por qué:* el documento se publica al cliente y se traduce por `__lang`; un literal en español
  saldría tal cual en una propuesta en inglés. Tipar contra `LandingStringKey` hace que el
  compilador lo impida, no la disciplina. `website_v1` declara sus rótulos HISTÓRICOS ("Fase 1")
  justamente para no moverle el texto a lo ya publicado.
- **`publish` importa `isBlank` en vez de su copia.** *Por qué:* la copia no tenía
  `NO_CONTENIDO`, así que una sección con solo una clave de presentación escrita (la moneda, el
  ancho de una card) pasaba el filtro de publicación mientras el render la omitía: el cliente
  abría la propuesta y ahí no había nada.

## Las licencias de la Inversión salen de los Hubs vendidos (2026-08-12)

> Elías, con la sección de inversión ya leyéndose como factura: *"En el módulo de inversión,
> deben estar las licencias seleccionadas arriba, una por línea. Cada una con su ícono y valor."*
> "Arriba" es la sección «Qué se implementa», que en `hubspot_v1` va justo antes de Inversión.

- **La identidad del Hub es EXPLÍCITA (`LineaInversion.hub = "sales_hub"`), no un match de
  texto sobre el concepto.** *Por qué:* (a) ninguna línea existente trae la key ⇒ `hubVisual("")`
  devuelve `{icon:null}` y **toda propuesta publicada renderiza el MISMO DOM** —el riesgo de esta
  familia de cambios es que `configForSnapshot` resuelve por key contra la config viva, así que
  lo publicado estrena el renderer igual—; (b) Ventas puede renombrar la línea ("Sales Hub
  Professional · 5 usuarios") sin perder el ícono; (c) una licencia de un tercero que se llame
  parecido no se lleva el ícono de HubSpot; y (d) evita una CUARTA implementación de
  texto→slug al lado de `normalizeTag`.
- **La siembra sale de `activos`, no de los tags.** `activos` es la curaduría del vendedor sobre
  qué Hubs se implementan; los tags son la declaración de qué se vendió, y no coinciden: medido
  sobre las 9 propuestas de la base, **las 9 tienen `tags = []`** y solo 1 tiene `activos`. La
  siembra usa `hubsVendidosDe(solucion)` con los tags como fallback del generate — pero la
  sección de arriba manda, porque es lo que el cliente está leyendo.
- **`hubsVendidosDe` con `activos` AUSENTE devuelve VACÍO — al revés que `columnasActivas`.**
  Adentro de la sección, ausente significa "todas encendidas" (la degradación correcta para
  PINTAR). Acá significa "nadie declaró qué se vendió", y proponer seis líneas de licencia a
  partir de eso sería adivinar montos que el cliente va a leer. Es la asimetría más fácil de
  romper de esta tanda y por eso tiene su propio test.
- **Sembrar NO puede mover un centavo.** La línea nace con `monto: ""`, que `parseMonto` da
  `null` ⇒ no suma, no cuenta como pendiente y no enciende el gran total. Los tres frenos de
  `sembrarLicenciasIniciales` (no toca el shape legacy, no toca un grupo con algo escrito, no
  corre sin vendidos) son lo que hace que "Generar" sobre una propuesta viva sea inocuo.
- **Lo que ya no está vendido se AVISA, no se borra.** `conciliarLicenciasHub` devuelve
  `faltan`/`sobran`/`sinMonto` y el editor pinta un ⚠ por línea y un asistente con "Agregar las
  que faltan". Borrar sola una línea de dinero que un humano escribió es la única acción de esta
  sección que no tiene deshacer.
- **El publish FRENA con 400 si una línea de Hub quedó sin monto.** La siembra pone el RENGLÓN y
  deja el monto a Ventas, pero una línea con `hub` ya vuelve la sección no-blank ⇒ sin el freno
  la propuesta sale con "Marketing Hub —" y sin total, que es exactamente lo único de esta
  feature que el cliente ve si nadie mira. NO se filtra en el render: la celda que desaparece
  rompe la columna declarada, y el vendedor tiene que ver lo mismo que el cliente.
- **El ícono es la MISMA máscara CSS de la sección de Hubs** (`--hub-accent` sobre
  `public/hubs/<slug>.svg`), 18px, hermano del concepto dentro de una rejilla que estrena SOLO
  la línea con `hub`. El par naranja-sobre-`--bg-soft` (3.05:1, el tinte de Inversión) entró al
  guard de contraste: es el más ajustado de la familia contra el 3:1 de WCAG 1.4.11.
- ⚠ **Consecuencia a ojos abiertos:** 8 de las 9 propuestas de la base tienen `solucion` en shape
  legacy (sin `activos`), así que la feature no se enciende ahí hasta regenerar esa sección.

## Un elemento tiene UN solo `::before`: el placeholder y la rayita se pisaban (2026-08-13)

> Elías, con una captura de una sección personalizada en edición: *"Mira como se ve esa
> sección"*. En el encabezado se leía «EY / EB / RO / W» apilado ENCIMA del título.

- **El bug es de CASCADA, no de la sección personalizada.** El placeholder de un campo vacío se
  pinta con `.stl .stl-editable:empty::before { content: attr(data-placeholder) }` (0,3,1), y la
  rayita de marca del eyebrow con `.stl .stl-eyebrow::before` (0,2,1) — el MISMO pseudo-elemento.
  La regla del placeholder solo gana `content`: `width:26px`, `height:2px`, `background` y
  `flex-shrink:0` seguían siendo los de la rayita, así que el texto quedaba adentro de una caja
  de 26 px, se partía de a dos letras y desbordaba sobre el `<h2>`. Verificado con estilos
  computados en Chrome, no por lectura: `content:"Eyebrow…"` con `width:26px; height:2px`.
- **El alcance era mayor al reportado.** Además de toda sección personalizada —`customDef` no
  declara `eyebrow`, así que el campo está SIEMPRE vacío—, rompía el hero de **/roles** con el
  área sin llenar y cualquier sección estándar a la que el CSE le BORRE el eyebrow
  (`eyebrowOverride: ""` no cae al default de la config). Latente desde el retema de marca del
  2026-07-20, que fue cuando nació la rayita.
- **El arreglo es NEUTRALIZAR la caja, no tapar el caso.** El reset (`display · position ·
  width · height · background · border · padding · margin · transform · flex-shrink`) cierra la
  clase entera: cualquier `Editable` vacío sobre una clase con pseudo-elemento decorado. La
  alternativa —`:not(:empty)` en la rayita— arreglaba el eyebrow y dejaba viva la próxima
  colisión.
- **Cero movimiento en lo que ve el cliente.** En modo lectura `Editable` no emite ni la clase
  `stl-editable` ni `data-placeholder`, así que ni `:empty` ni el placeholder existen en
  `/external` ni en el PDF. Verificado: con el eyebrow ESCRITO la rayita sigue midiendo 26×2 px
  en `#C2400F`, idéntica.
- **El guard mira VALORES, no nombres de propiedad** (`lib/ui/landing-placeholder.test.ts`).
  Un reset que declare `width: 26px` es el bug escrito de nuevo y pasaría un test que solo
  verifique que la propiedad está nombrada — se probó y pasaba. Y la lista de lo que NO hace
  falta resetear es una DENY-list: con allowlist, un `display:none` en una decoración futura
  —que deja el placeholder INVISIBLE— se salteaba en silencio. El guard barre
  `components/landing` **y** `components/canvas/*-sections` (el mismo universo que
  `pdf-mode-coverage`), acepta las clases BASE del motor (`eyebrow`, `cta-title`: son las que
  más chance tienen de estrenar la misma rayita), excluye las reglas de impresión —en PDF la
  colisión es imposible y bloquear una mejora de paginado sería mandar a investigar algo que no
  existe— y verifica que captura TODOS los `<Editable>` del repo: un regex que se quede corto
  vacía el barrido y deja todo en verde.
- **`customDef` sigue SIN declarar `eyebrow`.** Un default sería INDELEBLE: los PATCH normalizan
  `""` → `null` y con override null el render cae a `def.eyebrow`, así que el vendedor que lo
  borra lo ve volver. Y el eyebrow SE PUBLICA: los de las otras secciones son categorías del
  argumento comercial ("Diagnóstico", "Inversión") y ninguna palabra genérica sabe la categoría
  de un HTML que armó Ventas — misma regla que §"Un tipo de propuesta siembra lo que AFIRMA".
- **El placeholder pasa a decir «Categoría de la sección…»**: "Eyebrow…" era el único
  anglicismo de jerga de maquetación entre los ~60 placeholders del motor, y quien lo lee es el
  vendedor que acaba de crear su sección. De paso, el copy nuevo de la sección personalizada
  pasa a TUTEO (nació en voseo el día anterior) y la ayuda del campo HTML deja de mentir por
  omisión: la CSP inyectada bloquea `fetch` y los iframes anidados, así que un video de YouTube
  embebido no funciona y eso hay que decirlo ANTES de que alguien lo pegue.

## "Copiar instrucciones para tu IA": Nexus le habla al Claude Code de Ventas (2026-08-13)

> Elías: *"Agrega un CTA que diga copiar consejos. Que contenga consejos que Nexus le pase a
> Claude Code del usuario que está haciendo el módulo personalizado aparte y que va a
> incrustar. Esto es para disminuir los errores o la fricción que tengan esos HTMLs con Nexus."*

- **El problema es que TODO falla en silencio.** Medido contra la CSP y el sandbox reales: un
  `fetch` no tira error visible, un `localStorage` mata el script en esa línea, un embed de
  YouTube deja un rectángulo vacío, un `<a href>` sin target reemplaza la sección entera por el
  sitio externo, y `confirm()` devuelve siempre `false` sin lanzar. El agente que escribe el
  HTML no tiene forma de saberlo, y el vendedor vuelve diciendo "no funciona" sin nada que
  mostrar. El brief existe para que esas reglas lleguen ANTES de escribir el código.
- **Lo que no puede desincronizarse NO se escribe a mano.** La CSP entera y los topes (alto
  520/200/2000, 200.000 caracteres) se INTERPOLAN de las constantes reales dentro del template.
  El día que alguien toque `EMBED_CSP`, el brief cambia solo. Lo que sí está escrito —el
  sandbox, la geometría del marco, el ancho útil— lo ata `consejos-embed.test.ts` contra el JSX
  del componente y contra el CSS del motor: si se ensancha la página, el número del brief se
  pone rojo.
- **Las prohibiciones grandes están atadas a la directiva que las produce.** `connect-src
  'none'` ↔ "sin red", `form-action 'none'` ↔ "sin formularios", `frame-src 'none'` ↔ "YouTube
  no carga". Aflojar la política sin reescribir el brief rompe el test — y al revés: si se
  recortara `script-src https:`, el esqueleto de arranque que el brief entrega quedaría muerto,
  así que también se verifica que lo permitido siga permitido.
- **El texto se carga con `import()` dinámico.** `HtmlEmbedSection` la importa estáticamente el
  registry del motor: una constante de 12 KB de módulo viajaría en el bundle que descarga el
  PROSPECTO al abrir la propuesta publicada, donde este botón ni existe.
- **El estado "no se pudo copiar" NO se auto-limpia.** Es el único camino para copiar a mano
  (revela el texto en un textarea), así que el timeout que esconde el "Copiado" a los 1,8 s
  habría borrado la salida justo cuando hace falta.
- **El brief lleva un ESQUELETO de arranque de ~20 líneas**, y es lo que más segundas
  iteraciones evita: doctype, viewport, el `<link>` de Plus Jakarta Sans, el reset con
  `height: 100%` (sin eso, el centrado que el propio brief pide no funciona),
  `prefers-reduced-motion` y un objeto `CONFIG` al principio del script — ahí van los números
  que el vendedor va a querer cambiar por prospecto, en vez de repartidos por el JS.
- **El alto es UNO SOLO para todos los anchos** y el brief lo dice con esa letra: el iframe no
  cambia de alto en celular, así que el número se calcula con el layout de 360 px, que casi
  siempre es el más alto. Era el defecto que más iba a doler y no estaba en la primera versión.
- **Tres verificaciones adversariales refutaron el primer borrador** y de ahí salieron las
  correcciones que importan: `window.parent` NO lanza (lanzan sus propiedades cross-origin); el
  embebido SÍ tiene scroll interno propio (lo que no llega es el scroll de la página); el ancho
  mínimo real es 270 px y el máximo 1232; el tope de 200.000 no lo aplica nadie (solo pinta el
  contador en rojo); un alto vacío o inválido cae al default 520 y no al mínimo; `<header>` es
  seguro pese a contener "<head"; y Nexus ya le hace un fade-in de 800 ms a la sección completa
  en la propuesta publicada, así que una animación de entrada propia tiene que esperarlo.

## La inversión pasa a ser una cotización dinámica (2026-08-13)

> Pedido de Elías, con el criterio de Marco: por línea, cantidad · precio de lista · descuento
> PROPIO · subtotal; un check para prender y apagar cada licencia EN VIVO durante la reunión;
> separar servicios de licencias y el cobro único del recurrente; el precio unitario a la vista;
> y un switch de contrato mensual ↔ anual.

- **El descuento es POR LÍNEA porque los de HubSpot no se comportan igual entre Hubs** (bajan
  mucho en unos y casi nada en otros). Un porcentaje global sobre el total no describe ninguna
  negociación real: sería un número inventado que además se contradice con el desglose.
- **Todo lo nuevo es OPCIONAL y ausente en lo publicado.** Sin `precioUnitario` el importe sigue
  saliendo del `monto` de texto libre, que es el camino de las 5 propuestas de sitio web y las 3
  de HubSpot que están en la calle. El renderer vive por KEY (`configForSnapshot`), así que esa
  compatibilidad no es cortesía: es la única razón por la que nadie ve cambiar su documento.
- **El plazo SOLO mueve lo recurrente.** El primer borrador multiplicaba ×12 toda línea con el
  contrato anual, y una implementación de $12.000 salía a **$144.000** con solo mover el switch.
  Lo cazó el test antes de que existiera la UI. `precioAnual` se escribe cuando HubSpot da su
  descuento anual; sin él se deriva ×12 —el peor caso, no una promesa— en vez de vaciarse.
- **Con una línea recurrente, el gran total se APAGA.** Sumar un CapEx con una mensualidad da un
  número que no existe en ningún contrato. En su lugar van dos: "Pago único" y "Por mes/Por año",
  que sí se pueden firmar. Como lo publicado no declara recurrencia, su cierre no se mueve.
- **El check es EFÍMERO en lectura y PERSISTE en el editor.** Son dos preguntas distintas: en el
  editor, `activa` es la curaduría de Ventas (qué entra en la oferta); en la propuesta publicada
  el documento está congelado y no hay a dónde escribir, así que el check sirve para explorar en
  la reunión ("si sacamos Sales Hub, ¿cuánto queda?") y al recargar vuelve a ser la oferta. Una
  línea apagada se ve TACHADA, no desaparece: si desapareciera, el cliente perdería de vista lo
  que acaba de sacar y no podría volver a prenderlo.
- **Apagar todo un grupo lo deja SIN total, no en cero.** Un cero afirma "esto vale 0"; sin total
  dice la verdad: no hay nada activo.
- **El subtotal calculado NO es editable.** `Editable` comitea su `textContent` al blur, así que
  un valor derivado adentro se auto-persistiría y le reescribiría el monto a Ventas — es
  literalmente el bug de la portada documentado en `inline.tsx`. Para escribir a mano se vacía el
  precio unitario y vuelve el campo de siempre.
- **Un descuento ilegible ensucia la línea entera**: no suma y cuenta como pendiente. Sumarla sin
  el descuento mostraría un precio que nadie acordó.
- **`activa`, `recurrencia` y `contrato` entran a `NO_CONTENIDO`**: son presentación, y sin eso
  una sección donde solo se tocó el switch quedaría no-blank y se publicaría vacía — la trampa de
  `anchoRecurrente`, con la que "Limpiar" mentía.
- **La aritmética de la línea va DEBAJO del concepto, no en columnas propias.** Una tabla de cinco
  columnas se rompe en celular y en el PDF, y el número que manda —el subtotal— ya tiene la suya.

### La cotización se lee sola: descuento a la vista, licencias mensuales, un solo cierre (2026-08-14)

> Elías sobre la sección ya en uso: las licencias deben ser **mensuales por defecto**, el total
> de licencias **naranja como el otro**, el **pago único y el mensual representados igual**, el
> card «Recurrente mensual» fuera —abajo solo extras— y, al poner un descuento, **un tag al lado
> del valor, el precio de lista tachado y el nuevo valor recalculado**.

- **El descuento se APLICABA en silencio.** `montoDeLinea` ya restaba, pero la celda mostraba
  solo el resultado: el cliente veía un número más chico sin poder rehacer la resta, que es lo
  único que una línea de cotización tiene que permitir. Ahora `MontoLinea` expone `bruto` (el
  importe ANTES del descuento) y el `descuento` YA LEÍDO, y la celda pinta el tag + el lista
  tachado arriba del neto. El tag sale del descuento parseado y NO del texto crudo: si el parser
  no lo entendió, no hay tag — hay ⚠ "no suma". Sin descuento no hay `bruto`: tachar un precio
  que no cambió es teatro.
- **La recurrencia tiene un default POR GRUPO** (`RECURRENCIA_POR_DEFECTO`): una licencia de
  HubSpot es una suscripción y un servicio de Smarteam se cobra una vez. Lo escrito gana
  siempre, así que un onboarding de HubSpot se marca "cobro único" con un clic. El default se
  resuelve en `gruposDeInversion` y los grupos SALEN con `recurrencia` puesta, así que la fila,
  el subtotal y el cierre no pueden contar historias distintas.
- ⚠ **Esto TOCA lo publicado y se midió antes de aplicarlo** (`configForSnapshot` resuelve por
  key contra la config viva). De las 7 propuestas publicadas, 3 pasan del gran total al cierre
  de dos números: REMPRO **$35,900 + $1,450/mes**, AVELEC **$13,100 + $3,130/mes** y Prodex
  **$17,750 + $450/mes**; las otras 4 no mueven un número porque sus montos son texto libre.
  Elías aprobó el cambio con esos números a la vista. **Queda un riesgo declarado**: si Ventas
  escribió el precio ANUAL de una licencia en una línea que ahora se lee como mensual, la
  propuesta lo dice ×12 — el editor tiene el selector por línea para corregirlo.
- **El card «Recurrente mensual» se retiró, pero su contenido NO se pierde.** Tenía contenido en
  9 secciones y 4 son propuestas publicadas, así que borrarlo les sacaba líneas de la vista del
  cliente. `adoptarRecurrentes` las baja a la tabla como líneas de LICENCIAS marcadas
  "mensual" — donde además SUMAN, que es lo que el card nunca hizo (se mostraba y no entraba a
  ningún total). Corre en el render y se fija con el primer guardado humano, misma mecánica que
  `adoptarShapeNuevo`. Abajo de la tabla quedan solo los **extras opcionales**.
- **TODO total lleva la píldora naranja; la jerarquía la hace el TAMAÑO** (subtotal 16px, cierre
  20px). ⚠ Corrige la regla anterior —"la píldora queda reservada para el total"—: con el
  subtotal en texto pelado y el recurrente en píldora, dos números del mismo rango de lectura
  parecían de naturalezas distintas. Los dos del cierre van **uno al lado del otro y con el
  mismo tratamiento**: son los dos números que se firman y ninguno manda sobre el otro
  (apilados, el de arriba se leía como el total y el de abajo como una nota al pie).
- **«Pago único» / «Por mes» / «al mes» pasaron a i18n.** Eran literales en español dentro del
  componente y esta sección se publica al cliente: una propuesta en inglés los sacaba en
  español. Mismo motivo por el que `SectionDef.invest` está tipado contra `LandingStringKey`.
- **La `--par` usa un selector COMPUESTO** (`.stl-inv-sum--total.stl-inv-sum--par`) y no es
  capricho: `--total` se declara más abajo en el archivo y, con la misma especificidad, su
  `border-top: 2px solid var(--text)` ganaba por orden — las dos tarjetas salían con una ceja
  negra arriba. Cazado midiendo el borde computado en Chrome, no leyendo el CSS.

#### Tres correcciones del mismo día (Elías, mirando la sección en uso)

- ⚠ **El switch Mensual/Anual no movía NINGÚN número en las líneas escritas a mano.** El ×12
  vivía solo en la rama CALCULADA de `montoDeLinea` (la que exige `precioUnitario`), y casi
  todo lo que Ventas escribe tiene `monto` de texto libre: el control se veía roto porque
  literalmente no hacía nada. Ahora el plazo también multiplica el monto libre de una línea
  recurrente, con la misma regla de la otra rama —si Ventas escribió el precio anual, ÉSE
  manda; si no, ×12, que es el peor caso y no una promesa de descuento—. Solo mueve lo
  RECURRENTE: una implementación cuesta lo mismo en un contrato anual (el error que el test
  cazó cuando nació el switch).
- **«1 × precio de lista» y el monto son DOS VISTAS DEL MISMO NÚMERO, no dos datos.** El
  precio se DERIVA del monto cuando la línea no tiene uno propio (antes se quedaba en gris
  para siempre) y el monto de una línea calculada volvió a ser editable: al soltarlo,
  `precioDesdeMonto` deshace la cuenta —descuento primero, cantidad después— y el precio de
  lista queda coherente. Un descuento del 100% no se invierte (cualquier precio da el mismo
  neto) y ahí no se adivina.
  ⚠ Lo que hacía peligroso editar un valor DERIVADO sigue siendo cierto —`Editable` comitea su
  `textContent` al blur y al desmontarse, así que un foco bastaba para auto-persistirlo— y por
  eso ambos campos llevan la misma guarda: **si el texto comiteado es idéntico al mostrado, no
  se toca nada**. Es lo que permite abrir la puerta que el comentario de `inline.tsx` había
  cerrado, sin reabrir el bug.
- **El eyebrow es la CATEGORÍA, nunca el mismo título otra vez.** La sección abría con
  «INVERSIÓN / Inversión» en las dos plantillas; el eyebrow pasó a «Propuesta económica».
  `registry.test.ts` barre TODAS las defs de los 9 documentos y falla si alguna repite —
  excluyendo las `selfTitled`, donde el motor no pinta encabezado y el `eyebrow` es solo el
  respaldo que viaja por props (las cuatro secciones de cierre están así, y no repiten nada en
  pantalla).

## El dolor se cuantifica en plata cuando la fuente lo permite (2026-08-13)

> Elías: *"quiero que tenga la capacidad de cuantificar el dolor económicamente cuando haya
> data disponible … este dato no reemplaza el punto de dolor en sí, sino que se suma como
> contexto. Si el rep no menciona esos números, Nexus no los debería poder inventar."*

- **No funcionaba, y no era falta de contexto: era una CONTRADICCIÓN en el prompt.** El agente
  ya recibe el transcript, las notas internas y el timeline de HubSpot (notas + llamadas), así
  que los números estaban ahí. Lo que fallaba es que el preámbulo del generate decía *"NO
  pongas montos, precios, rangos … en NINGÚN texto que generes — ni en el titular, ni en la
  solución, ni en el ROI, ni en el cierre"* mientras el brief del ROI pedía *"'$[X]k' valor
  estimado de [oportunidad/año]"*. Con dos instrucciones opuestas el modelo desempataba solo y
  distinto en cada corrida. **Medido sobre las 9 propuestas de la base: 5 de 53 dolores traían
  alguna cifra y UNO SOLO traía plata** — y en ése la cifra se había comido el TÍTULO
  («USD 35.000–40.000 perdidos cada mes»), o sea reemplazó el dolor en vez de sumarle, que es
  exactamente lo que el pedido excluía. En REMPRO el dato existía y el agente lo mandó al ROI.
- **La regla nueva nombra las dos clases de plata y dice de quién es cada una**
  (`lib/business-cases/money-brief.ts`): **PRECIO** es lo que cobra Smarteam —no lo escribe el
  agente, vive en Casos de uso e Inversión— e **IMPACTO** es lo que la operación le cuesta HOY
  al cliente, que es el argumento. Vive en un módulo propio y no inline en el preámbulo por dos
  razones: un `route.ts` de App Router no puede exportar nada que no sea un handler, y el arnés
  de validación necesita el MISMO string y no una copia que envejezca aparte.
- **Lo que hace segura la cuantificación no es prohibir números: es exigir que la CUENTA esté
  ESCRITA.** El agente puede multiplicar factores que estén en las fuentes («15–20% de 2.000
  leads mensuales a un ticket de $2.000 son $360.000–480.000 al año»), pero con los factores a
  la vista para que el vendedor lo verifique de un vistazo antes de mandarlo, y nombrando la
  fuente. Si falta un factor, no se estima. Un total sin sus factores no se puede auditar antes
  de que lo lea un prospecto.
- **Tres defectos los cazó el arnés, no la lectura del prompt** (`generateCanvasSections` contra
  un transcript sembrado con los cuatro casos: cifra dicha · dos factores sueltos · un dolor sin
  números · NUESTRO precio dicho en la reunión). En orden de aparición: (1) el agente abría una
  tarjeta NUEVA para alojar el número y quedaban dos dolores para el mismo problema, uno con el
  síntoma y otro con su costo; (2) al comprimir, se quedaba con el extremo ALTO del rango
  —$480.000 en vez de $360.000–480.000, un tercio de más—; y (3) convertía «el año pasado» en
  **2024** estando en 2026. Los tres son fabricación con cara de precisión y ninguno se ve
  leyendo el brief: hay que correrlo. De ahí salieron las tres reglas duras de `dolores`
  (un problema = una tarjeta · el `title` NUNCA es un número · tope de 35 palabras) y las dos
  de la regla compartida (un rango se reporta como rango · una fecha relativa se copia tal cual).
- **El precio nuestro NO se filtra aunque esté dicho en la sesión**: el transcript del arnés
  incluye «la implementación andaría por los 18.000 dólares» y no aparece en ninguna sección
  generada, en ninguna de las corridas.
- **El ROI se queda y se refuerza** (decisión de Elías): pide métricas OPERATIVAS y ECONÓMICAS,
  al menos una económica cuando el contexto da para calcularla. Con el `label` capado en 20
  palabras y sin una segunda frase que argumente — son tarjetas de un número grande, cuatro en
  fila, y la primera versión sacó etiquetas de 40 palabras que comparaban el impacto contra lo
  que cuesta el proyecto (que además roza el precio, que no es del agente).
- **Sin campo nuevo y sin tocar el schema**: la cifra entra en el `detail` que ya existe. Se
  evaluó un tercer renglón propio (`impacto`) y Elías lo descartó — *"lo que hay que hacer es
  modificar el agente"*. Contrapartida aceptada: el número comparte espacio con la explicación,
  así que el tope de palabras es lo único que evita que se coma la tarjeta.
- ⚠ **Esto es calibración de prompt, no una garantía determinista.** Sobre 6 corridas del mismo
  transcript, la duplicación de tarjetas apareció en 2 antes de las reglas duras y en 0 después,
  pero la variación entre corridas es real y el CSE sigue siendo el que revisa antes de publicar.
  Lo que SÍ está congelado es la doctrina: `lib/business-cases/money-brief.test.ts` falla si la
  distinción precio/impacto se vuelve a fundir en una prohibición en bloque, si el preámbulo
  deja de importar la constante, o si alguna de las dos secciones deja de pedir lo suyo.

## El cronograma de la propuesta se puede ver como Gantt, y la primera etapa avisa (2026-08-13)

> Elías: un toggle «Ver en Gantt» / «Ver en lista» a la derecha del todo, alineado con el
> título, y *"un label o badge visual sobre la etapa de diagnóstico indicando que esa etapa
> puede modificar los tiempos de las etapas siguientes … para no comprometer fechas exactas
> antes de diagnosticar, porque el diagnóstico puede cambiar prioridades"*.

- **El toggle entra en la fila del título SIN tocar el motor.** `PlanSection` devuelve un
  fragmento, así que sus hijos son hijos directos de `.stl-wrap` — hermanos del `<header>` que
  arma `LandingView`. La barra se pinta como primer hijo del cuerpo y una rejilla con
  `:has(> .stl-vista-bar)` la sube a la fila del título; solo entra la sección que trae la
  barra. Las dos alternativas se descartaron con razón: una prop `headerSlot` en `LandingView`
  obliga a sacar el estado de la vista fuera de la sección y cablearlo en los TRES montajes
  (editor, externo, PDF), y `selfTitled` —el camino de `EstimacionSection`— haría que la
  sección pinte su propio encabezado y **perdería el título editable** (`titleOverride`), que
  hoy funciona. Se revierte borrando un bloque de CSS.
- **La vista es EFÍMERA y abre en lista.** En la propuesta publicada el documento está
  congelado y no hay a dónde escribirla; su valor es explorar el plan en la reunión. Al
  recargar vuelve a lista, que es como se ve hoy ⇒ **ninguna propuesta ya publicada cambia de
  aspecto**. Mismo criterio que el check por línea de la Inversión.
- **Las semanas se LEEN del texto que ya existe** (`lib/landing/plan-weeks.ts`), y el diseño
  salió de mirar los datos antes de escribir el parser: 28 secciones `cronograma`, 4 en
  propuestas publicadas. Lo que hay escrito es `"Semanas 6-10"`, pero también **en dash**
  (U+2013, 9 valores), **singular con rango** (`"Semana 1-2"` — el singular NO implica una
  semana), y **`"Mes 4"` en una propuesta PUBLICADA**. Dos hechos mandan sobre el resto: los
  números son **semanas ABSOLUTAS de inicio y fin**, no duraciones (otra unidad que
  `TimelinePhase.durationWeeks` — leerlas como duración corre el plan entero), y **hay solapes
  reales** (`"Semanas 5-7"` y `"Semanas 5-9"` en la misma propuesta).
- **`"Mes 4"` NO se convierte a semanas.** Nadie escribió que un mes son cuatro, y convertirlo
  sería inventar una fecha en un documento que el cliente firma. Esa fase sale marcada «sin
  semanas» y el editor le ofrece el campo para corregirla. Es la regla del parser de montos
  (`lib/landing/money.ts`): sin sustento, afuera. **Medido: 95 de 96 fases se ubican; la única
  que falla es exactamente ésa.**
- **La corrección (`semanas`) va DENTRO del schema del agente**, no como key suelta:
  `preserveNonSchemaKeys` es shallow y esto vive dentro de un ítem de array, así que fuera del
  schema no sobreviviría a regenerar la sección. De paso el brief puede pedirle al agente que
  lo llene en formato de máquina, que es más confiable que parsear prosa.
- **El aviso va a la PRIMERA fase, derivado de la posición** (`i === 0`), no de una casilla que
  alguien tenga que acordarse de marcar: la propuesta que se olvida de marcarla es justo la que
  sale comprometiendo fechas exactas antes de diagnosticar. Son dos piezas —chip ámbar junto al
  nombre y una línea que explica— porque un chip corto no dice la idea completa y **en el PDF
  no hay hover**. `avisoFase1: "no"` lo apaga; va en el PRIMER nivel y fuera del schema, así que
  el agente no lo decide y sobrevive tanto a regenerar la sección como a una generación
  completa (el carry-forward de keys no-schema de `generate/route.ts`). Es presentación ⇒ entra
  a `NO_CONTENIDO`, o una sección donde SOLO se apagó el aviso quedaría no-blank y «Limpiar»
  volvería a mentir.
- **En el PDF se imprime la LISTA y no se pinta el toggle.** La lista tiene TODO el contenido
  (nombre + semanas + detalle) y el Gantt es una forma de mirar esos mismos datos, así que no
  se pierde nada — a diferencia de las píldoras de Hubs, donde esconder una columna en papel sí
  perdía contenido. El chip y la línea de aviso sí se imprimen.
- **El Gantt es propio y no reusa `TimelineSection`**: ese componente pide
  `ExternalTimelinePhase` (id, order, `durationWeeks`, `startWeek`, tasks) y, sobre todo,
  `lib/ui/pdf-mode-coverage.test.ts` **congela la lista de quién lo monta** — montarlo desde la
  propuesta rompería ese guard. Lo que se copia es su técnica, que es barata y ya está probada:
  CSS grid con una celda por semana, cero SVG y cero canvas. Y **sin scroller**: con muchas
  semanas las celdas se comprimen, para no entrar al patrón que el mismo guard marca.
- **Sin fechas en el eje, a propósito.** La propuesta no tiene fecha de arranque, y ponerle una
  sería comprometer exactamente lo que el aviso de la primera fase viene a evitar.
- Deuda anotada: `.stl-vista-btn` copia la especificación de `.stl-inv-plazo` (el plazo del
  contrato de la Inversión). No se migró porque esa sección se tocó el día anterior y no vale
  re-abrirla por una clase; cuando aparezca un tercer segmentado, converger los tres en una
  primitiva del motor.

## El Gantt de la propuesta se arrastra, y eso reescribe lo que lee el cliente (2026-08-13)

> Elías, sobre el Gantt recién hecho: *"haz que en la vista de Gantt los tiempos se puedan
> arrastrar y eso modifique también las semanas en la vista de lista … muy similar a como
> funciona eso mismo en el canvas de cronograma"*, más un ⓘ por fase con su descripción, y que
> el chip y el aviso de la primera etapa también se vean en Gantt.

- **Arrastrar escribe las DOS caras del dato.** `semanas` es de dónde sale la barra y `duration`
  es lo que el cliente LEE en la lista; si al soltar se escribiera solo una, las dos vistas
  contarían planes distintos y el prospecto lo detecta leyendo dos veces la misma propuesta.
  `reescribirDuracion` reemplaza el fragmento EN SU LUGAR —así "Semanas 1-2 (kickoff)" conserva
  el paréntesis— y solo reemplaza el texto entero cuando no había ninguno que reemplazar
  ("Mes 4"). Singular/plural y el idioma salen de i18n, no de lo que decía el texto viejo.
- **La barra pasó a ser UNA sola, no una celda por semana.** Un conjunto de píldoras no se puede
  agarrar ni tiene bordes que estirar. Con una barra posicionada en porcentaje sobre una pista,
  el ancho de semana es una división exacta (sin gaps que descuadren la cuenta) y hay un
  elemento con dos tiradores. El eje sigue siendo grid + `<div>`s: cero SVG, cero canvas.
- **Se arrastra SOLO en edición.** En la propuesta publicada el prospecto mira el plan; sin
  `editable` no hay handlers, ni tiradores, ni cursor de agarre.
- **El commit va UNA vez al soltar, con preview local mientras tanto.** El `onChange` de una
  sección persiste de inmediato (PUT optimista, sin debounce): escribir en cada `pointermove`
  dispararía un PUT por semana cruzada.
- **La geometría se lee VIVA en cada movimiento, no se congela al empezar.** Estirar una fase
  alarga el eje y reescala todo; con el ancho de semana congelado la barra se queda atrás del
  cursor. Leyendo el rect y las columnas en cada `pointermove`, la barra sigue pegada al cursor
  aunque el plan crezca debajo.
- ⚠ **El bug que casi se va: un rango sin geometría NO tiene default.** La primera versión de
  `semanaEnX` devolvía `desde` cuando la pista medía 0 — que parece un default razonable y no lo
  es: al repintar, el nodo capturado en el `pointerdown` queda DESCONECTADO del DOM y mide 0×0,
  así que **cada movimiento leía la semana 1 y la fase se iba sola al principio del plan**.
  Cazado arrastrando de verdad en Chrome (mover +2 semanas devolvía `1-2` en vez de `8-9`), no
  leyendo el código. Se cerró por los dos lados: `semanaEnX` devuelve `null` y el llamador
  ignora ese movimiento —quieto es mejor que en la semana equivocada—, y la pista se vuelve a
  buscar VIVA por posición en cada movimiento en vez de cerrar sobre el nodo.
- **El ⓘ por fase reusa el tooltip CSS-only del motor** (`[data-tip]`, el mismo de las secciones
  y de los KPI de Roles), y existe porque el Gantt NO repite el detalle de la fase: sin él, pasar
  a Gantt escondía información que la lista sí muestra.
- **El chip y la línea de aviso se ven en las DOS vistas.** Son la única pieza de la sección que
  dice que las fechas pueden moverse; que dependieran de qué vista está abierta convertiría un
  resguardo comercial en un detalle de presentación.

## «Por qué Smarteam» pasa de tarjetas a banda de credenciales (2026-08-14)

> Elías: *"cambiar de cards a una sección tipo landing de sitio web, con fondo degradado azul
> marca (oscuro a más claro), buscando sensación de profundidad y seriedad"*, con las insignias
> oficiales de HubSpot copiadas del repo del sitio.

- **El DATO no cambió y ésa es la restricción que ordenó el diseño.** Siguen siendo los mismos
  cuatro campos (`credencial`, `experiencia`, `referenciaSectorial`, `equipo`), y como
  `configForSnapshot` resuelve el renderer por KEY contra la config viva, **toda propuesta ya
  publicada estrena esta banda**. Por eso nada nuevo depende de un campo nuevo: la credencial
  es el eyebrow, la experiencia se LEE como fichas, y los dos textos largos se omiten cuando
  están vacíos — que es como están hoy en varias de las publicadas.
- **Las fichas de número se DERIVAN del string, y la derivación es conservadora**
  (`lib/landing/partner-stats.ts`): cada fragmento se muestra completo y lo único que se decide
  es si su PRIMER token es un número que va en grande. "Más de 200 proyectos" NO se convierte en
  «200 · proyectos»: reordenar lo que alguien escribió es inventarle una frase que no dijo. Sin
  número, la ficha va sin número.
- **El degradado usa SOLO stops ya validados, y el guard lo verifica leyendo el CSS.** El primer
  intento terminaba en `--dark-card` y la credencial quedaba por debajo de AA: el merge frenó en
  `landing-brand-contrast.test.ts`. En vez de anotar el ratio, el guard ahora parsea los stops
  REALES de la regla y exige que cada uno sostenga AA para el blanco, el acento y el secundario
  — aclarar el degradado de a poco vuelve a frenar el merge.
- **Las insignias van HARDCODEADAS, no como dato editable.** Son hechos de la empresa, iguales
  en toda propuesta, y el brief ya declaraba la credencial como fija. Un campo editable ahí solo
  habilitaría publicarle a un prospecto una acreditación que no tenemos.
- **La composición de la tarjeta la dictaron las PROPORCIONES REALES de los PNG, no el gusto.**
  Medidas: el Elite es 1.36:1, los dos escudos 0.93:1 y el logotipo de Top Partner **3.61:1**.
  Los tres en una fila dejaban al apaisado a un tercio de la altura de los escudos, leyéndose
  como un error de maquetación; los escudos van juntos y normalizados por ALTURA —que es lo que
  el ojo compara— y el logotipo va abajo como firma.
- ⚠ **El PNG de Top Partner trae el texto en BLANCO sobre transparente**: sobre la tarjeta clara
  el rótulo desaparecía y quedaban dos íconos naranjas sueltos. Va sobre un chip navy, que
  además es como se ve en la web de marca. Cazado mirando el render, no el archivo.
- **`TextCard` se borró de `sections.tsx`**: era su último consumidor y su gemela sigue viva en
  `sections-hubs.tsx`. Dos copias de la misma card invitan a que la próxima sección elija
  cualquiera.

### Segunda pasada, el mismo día: la banda pasa a tener un CIERRE escrito para el cliente

> Elías, con una referencia visual: un titular grande, un párrafo que nombre al cliente, las
> tres cifras (faltaba «+3.000 usuarios capacitados»), el logotipo de Top Partner alineado con
> las acreditaciones y fuera el «Equipo asignado».

- **Los campos cambian de dueño, y esa es toda la decisión.** Lo que el agente escribe pasa a
  ser lo que MIRA AL CLIENTE (`titular` = el cierre del argumento, `resumen` = con qué acompaña
  Smarteam a ESTE cliente y cuál es su prioridad) y lo que es un HECHO de la empresa deja de
  ser un campo. Medido antes de decidirlo: de las **28** secciones `partner` guardadas, las 28
  traen la misma credencial y las 28 dicen lo mismo en `experiencia` con tres redacciones
  distintas. Ese campo hacía que un dato fijo diera la vuelta por un LLM en cada generación —
  cero información, riesgo real de deriva. Ahora las tres cifras son constantes
  (`lib/landing/partner-band.ts`), que además es lo ÚNICO que hace aparecer la tercera ficha en
  las **4 propuestas ya publicadas** que tienen esta sección, sin regenerar ninguna.
- **`equipo` se retira de la sección** (pedido explícito). Estaba escrito en 15 de las 28 y en
  las 4 publicadas, así que la banda deja de mostrar nombres propios del equipo: es contenido
  que envejece mal —la persona asignada cambia y la propuesta publicada queda congelada— y no
  es lo que respalda a Smarteam ante el prospecto. `experiencia` y `equipo` entran a
  `LEGACY_CARRY_EXCLUDE`: sin eso, regenerar los arrastra como keys no-schema y mantienen viva
  —y no-blank— una sección con datos que ya nadie pinta.
- **La sección pasa a `selfTitled`.** Con el encabezado del motor arriba se leían DOS titulares
  ("Por qué Smarteam" y el cierre). Ahora la banda pinta su propio encabezado: la credencial es
  el rótulo y el `titular` es el titular. Es seguro porque se verificó el dato: **ninguna** de
  las 28 tiene el título o el eyebrow renombrado, y el componente igual cae a `sectionTitle`
  —el rótulo del documento, que ya incluye el override— cuando no hay `titular`, que es el caso
  de todo lo publicado. En lectura los respaldos aplican; en EDICIÓN no, o el CSE vería el campo
  "lleno" con un texto que no es suyo y nunca lo escribiría.
- ⚠ **El agente nombraba a la empresa equivocada, y no era culpa del brief: el prompt nunca
  decía para quién es la propuesta.** En REMPRO escribió *«Smarteam acompaña a O4Bi»* — el ERP
  que se menciona en la sesión. En Color Solution esquivó el problema con «acompaña a este
  proyecto». El arreglo va en el CONTEXTO (`generate/route.ts`), no en la sección: el nombre de
  la ficha entra como primer bloque del preámbulo, declarando además que los otros nombres de
  las fuentes (proveedores, ERPs, integradores) NO son el cliente. Verificado corriendo el
  agente contra propuestas reales antes y después: 0/3 vs **3/3** con el cliente correcto.
  Beneficia a TODAS las secciones, no solo a ésta.
- **El tope de palabras del titular tuvo que decir «completa».** Con «máx. 15 palabras» el
  modelo cortaba la frase para entrar (*«…en una operación que produce»*). La regla ahora
  prohíbe dejarla colgando y cita ese mismo ejemplo — misma técnica que las reglas duras de
  `dolores`: el contraejemplo textual es lo que funciona. Sigue siendo calibración, no garantía:
  el CSE revisa antes de publicar.
- **Las tres insignias van en UNA fila alineadas por la CAJA, no por la imagen.** El logotipo de
  Top Partner es 3.61:1 y los escudos 0.93:1; igualar alturas de imagen dejaba al primero a un
  tercio del alto de los otros (por eso en la primera pasada estaba abajo). Con celdas iguales y
  `contain` adentro, la fila se lee pareja y el apaisado conserva su proporción. Su celda sigue
  siendo el chip navy — el PNG trae el texto en blanco sobre transparente.
- **El pie de la tarjeta nombra las credenciales.** Tres sellos sueltos obligan a leer dibujos.
  El rótulo va por i18n; los nombres de los programas de HubSpot NO se traducen (traducirlos
  inventaría credenciales que HubSpot no emite con ese nombre).
- ⚠ **Las cifras las afirma dirección, no Nexus.** «+200 proyectos» venía del def anterior y
  «+3.000 usuarios capacitados» lo agregó Elías desde su referencia. El sitio de marca publica
  otros números («120+ implementaciones», «45+ clientes activos»): no es contradicción
  necesariamente —cuentan cosas distintas— pero conviene que sean el mismo relato, y hoy
  cambiarlas es un cambio de código (el mismo trato que las insignias).

## El libro de planilla, las tarjetas y las comisiones (2026-08-14)

> Elías: *"Quiero optimizar la sección de finanzas para que mapee mucho mejor los gastos"* — un
> submenú de tarjetas de crédito con su capacidad disponible; otro de comisiones (lo que Smarteam
> gana con cada partner y lo que le paga a sus vendedores); la planilla con histórico por quincenas
> «similar a las cuentas por cobrar»; y el aguinaldo por colaborador.

- **La enmienda va primero, y ACOTA en vez de levantar.** El párrafo de §Cobranza que define
  `CostoRecurrente` prohíbe literalmente tres cosas que este pedido necesita: la palabra
  **aguinaldo** está en la lista de lógica fiscal prohibida, **FX** también, y *"un costo no vence:
  sin pagado, sin semáforo, sin alertas"* choca con una planilla que se marca pagada.
  `ARCHITECTURE §11` obliga a corregir el documento ANTES del código, así que: la regla sigue
  **entera para `CostoRecurrente`** (referencia estimada, alimenta el burn y la caja neta, nadie le
  agrega un «pagado») y `PagoPlanilla` es una **entidad nueva** con su propio ciclo de vida — mismo
  precedente que «costo fijo vs. gasto puntual = entidades separadas», que ya resolvió esta misma
  tensión una vez. El aguinaldo permitido es **suma de lo REGISTRADO en el libro, dic–nov, ÷ 12**:
  un dato observado, no una tasa; siguen prohibidas CCSS, cargas, renta y timbrado, cero constantes
  fiscales. **FX sigue prohibido**: todo se carga en su **moneda nativa**, y el motor nunca hace esa
  cuenta. ⚠ **Corrección tras cargar el archivo (2026-08-15):** el bloque VIVO de *Costos Fijos* NO
  es colones convertidos — Elías confirmó que **toda la hoja opera en dólares**. El `/$U$2` de cada
  fórmula es solo cómo Alex arma el número; lo que se carga es el RESULTADO cacheado (dólares), nunca
  el numerador en colones ni el ₡500 de `U2` (ver `lib/cobranza/egresos-sheet.ts`). No hay entonces
  ninguna conversión que pueda divergir: Nexus y la hoja de Alex muestran el mismo monto en dólares
  pase lo que pase con el tipo de cambio real. La advertencia "diverge apenas se mueva el TC" sigue
  siendo cierta, pero para costos que SÍ están en colones de verdad (salarios, herramientas locales):
  ahí Nexus guarda ₡ nativos sin convertir, y compararlo contra un total en dólares de otra fuente va
  a mostrar una diferencia en cuanto el tipo de cambio real se mueva. El cálculo del aguinaldo **no
  vive en `engine.ts`**: el motor es puro y está congelado por golden.
- **La comisión del vendedor es una VISTA DERIVADA, no una fila que se escribe al cobrar.** El
  primer diseño colgaba la generación de `cambiarEstadoCobro` y se refutó con tres hechos: (a) esa
  función **no tiene transacción** — es un `prisma.cobro.update` pelado y sus efectos colaterales
  corren sueltos después; (b) **no es el único escritor de `COBRADO`** —
  `import-facturaciones-xlsx.ts` escribe `estado` + `confirmadoPor` directo por `tx.cobro.upsert`, y
  así entraron 202 cobros históricos que nunca pasaron por ahí; (c) el revert COBRADO→PROGRAMADO es
  un **click optimista sin confirmación** en un `<select>` y **no deja bitácora** (el comentario del
  código que afirma lo contrario es falso: el único `bitacoraCobro.create` está dentro del `if` de
  `promesaPago`). Con eso, materializar al cobrar dejaba tres formas de tener un cobro sin su
  comisión y ningún invariante que lo viera. Ahora: `ReglaComisionVendedor` (persona · `clientId?`
  null = todos · porcentaje · vigencia; la más específica gana) + una query solo-lectura sobre los
  COBRADO. **La fila solo se persiste al LIQUIDAR**, con snapshot autosuficiente, patrón
  `CostoMovimiento`. Única concesión al chokepoint: **409** al revertir un cobro cuya comisión ya se
  liquidó — un `count` server-side, sin montos en el body.
- **Partner y vendedor no comparten ruta, ni endpoint, ni loader.** Una comisión de partner es un
  INGRESO de Smarteam (superficie ADMIN, gate `cobranza.read`); una de vendedor es la **remuneración
  de una persona**, tan sensible como un salario (SUPER_ADMIN). Un `loadComisiones()` que devolviera
  las dos metería montos de remuneración en el payload RSC del ADMIN aunque la UI no los pintara.
  ⚠ Y **todo lo SUPER_ADMIN cuelga de `app/api/cobranza/costos/`**: ahí entra gratis al escaneo
  estructural que exige `guardCostosAccess` en cada handler. Verificado: **ningún escaneo cubre
  `app/api/cobranza/` fuera de `costos`, `gastos` y `caja-neta`**, así que copiar el molde de
  `IngresoVariable` y poner las rutas en `app/api/cobranza/tarjetas/` las dejaría sin ningún guard
  obligatorio. El precio de esa comodidad es una fuga sin señal roja.
  ⚠ **Y por eso `IngresosVariablesPanel` dejó de decir «comisiones sueltas»** (2026-08-16): su copy
  y el placeholder de su form mandaban la misma plata a dos lugares. O partner es EL lugar, o
  quedaban dos maneras de registrar lo mismo y ningún total cerraría.
- **Lo que la implementación agregó al diseño** (2026-08-16, todo en `lib/cobranza/comisiones.ts`,
  25 tests): (1) **el reloj es `fechaCobro`**, el día que entró la plata — ese día decide qué regla
  estaba vigente y a qué período pertenece; un cobro COBRADO sin fecha de pago simplemente no
  devenga, no se aproxima con la programada. (2) **El redondeo es POR COBRO, no al final**: es lo
  que muestra el detalle, así que la suma que la persona ve es exactamente la que se le paga
  (3 × 33,33 al 13% da 12,99, no 13,00 — el test D8 lo congela). (3) Cuando la regla cambia dentro
  del período, el porcentaje del grupo es el EFECTIVO (ponderado) y `porcentajesDistintos > 1` lo
  declara: un solo número no permite rehacer esa cuenta y callarlo sería precisión falsa. (4) El
  desempate entre reglas de la misma especificidad es ESTABLE (`vigenteDesde` más reciente, y el id
  si empatan) — dos corridas sobre la misma data tienen que dar la misma comisión. (5) **Borrar una
  regla no toca lo liquidado** (esas filas llevan su propio snapshot justamente para eso) y
  **deshacer una liquidación** devuelve los cobros al derivado — que es el camino que el 409 del
  revert le pide a quien quiere revertir un cobro. (6) Liquidar exige que la quincena a la que se
  engancha sea de la MISMA persona y la MISMA moneda: pagarle la comisión de alguien junto al
  salario de otro, o convertir de moneda, son los dos errores mudos de este flujo.
- **El libro NO entra a la caja neta.** `loadCajaNeta` trae `costoRecurrente.findMany({activo:true})`
  **sin filtrar categoría**, y hay 17 salarios activos que `proyectarCostos` ya reparte por quincena:
  sumar `PagoPlanilla` sería doble conteo garantizado. El burn lo sigue produciendo
  `CostoRecurrente`; el libro es EJECUCIÓN (pasado), como los `pasados` de `proyectarGastos`.
  ⚠ Las comisiones tampoco entran en esta tanda —precedente vivo: `IngresoVariable` también está
  afuera— y eso hay que decirlo con el número en la mano: las de partner son **$91.262,55** contra
  $301k de cobranza. Meterlas obliga a tocar `esqueletoBuckets` (privado y compartido por los tres
  proyectores), a mover G1/G2 y a reescribir el copy del panel («entra (cobros proyectados)» y el
  banner de cobertura por cuentas, que no aplica a una comisión de HubSpot). Es una tanda propia, no
  un renglón.
  ⚠ **La cifra vieja de este párrafo decía $198.961/año y era el DOBLE de lo real** (corregido el
  2026-08-16, releyendo el Excel celda por celda antes de cargarlo): la hoja trae una fila de
  ACUMULADO (`=B11+C11`) que repite cada total en dos columnas, y sumarla contaba todo dos veces.
  Lo que entró son **5 pagos**: HubSpot 38.756,61 (feb-15) + 45.921,72 (may-15) · Atom Chat
  2.796,75 + 2.849,25 (mismas fechas) · Cooby 938,22 (jul-30). **Nua talk está en cero y no se
  carga**: una fila de $0 no es una comisión, es una columna que quedó vacía. Es la CUARTA vez que
  un total del propio documento miente (facturaciones, herramientas, salarios, y ahora ésta) — la
  regla ya escrita arriba se confirma: lo leído celda por celda es la verdad. Por eso los 5 montos
  van escritos a mano en `scripts/import-comisiones-partner.ts` y no salen de un parser que
  volvería a caer en la misma fila. Las 3 hojas OCULTAS son de un año anterior (otro roster, otras
  tarjetas, HubSpot a $300) y tampoco se cargan.
- **El monto de una quincena es PROPIO, no derivado del costo.** `CostoRecurrente.monto` es el
  all-in estimado (base × factor) y el schema declara que el motor jamás lee `montoBase`: no existe
  un bruto quincenal que partir. `PagoPlanilla` lleva su monto canónico congelado como snapshot;
  `montoQuincena` se exporta del engine (hoist puro — precedente exacto: `bucketAntiguedad`) y se usa
  **solo como sugerencia de UI** al crear la fila. La materialización es **CREATE-ONLY**: nunca
  update, nunca delete. Si alguien sube el salario a mitad de mes, un `toUpdate` reescribiría la Q2
  pendiente al monto nuevo con la Q1 ya pagada al viejo, y Q1+Q2 no daría ningún salario.
- **Cero DDL de ancla temporal.** `CostoRecurrente` tiene `finalizadoEl` pero no un `iniciadoEl`: no
  hay con qué decidir qué quincenas existen hacia atrás. La generación arranca en la fecha de
  activación, el histórico se carga a mano, y la antigüedad de una persona es `min(quincena)` de sus
  pagos; el primer año declara **cobertura** («N de 24 quincenas registradas») en vez de fabricar lo
  que falta. Por lo mismo, la fecha de ingreso del aguinaldo **sale del libro** y no de un campo
  nuevo: `TeamMember.fechaIngreso` rompería `TEAM_MEMBER_SAFE_SELECT`, la allowlist congelada de 12
  claves de un modelo que leen decenas de módulos. Y la fórmula CR ya maneja sola el año parcial —
  quien entró en julio tiene ceros de diciembre a junio y su aguinaldo sale proporcional. Argumento
  decisivo a favor del libro: el período dic–nov abarca a **4 personas que se fueron en julio**;
  derivado de los costos ACTIVOS desaparecen, derivado del libro salen bien.
- **La tarjeta: el saldo lo escribe una persona, lo asignado es referencia.** Disponible = límite −
  saldo, con su fecha de corte y su autoría (patrón `confirmadoPor`/`confirmadoEn`). Lo que Nexus
  suma —los costos asignados a esa tarjeta— se muestra al lado y **nunca calcula el saldo**: un
  saldo es acumulado y un cargo es mensual, no son la misma unidad, y «avisar si difieren» sería
  inventar una conciliación. Lo que sí se compara y es sólido: si `disponible < cargado mensual`, el
  próximo mes de cargos no cabe. El vínculo es una **tabla puente**, no una columna en
  `CostoRecurrente`: una tarjeta SÍ vence (corte, pago) y una columna arrastraría ese vencimiento al
  costo, que por regla no vence. ⚠ Ese vencimiento no puede derramar semáforo ni entrar por
  `AlertaCobro` — la prohibición transversal «sin alertas de costos» sigue en pie.
- **Lo que el Excel de Alex enseñó al leerlo celda por celda** (además de los montos): la hoja
  *Costos Fijos* tiene dos bloques y el izquierdo está **OCULTO**, con sus dos filas TOTAL en
  `#REF!` y **moneda mezclada** (alquiler en ₡, Juan Tijerino en $) — el vivo es el derecho, y no
  son dos años sino **un ciclo partido en abril**, que *Pretensión de Aguinaldos* confirma (Elías y
  Breiner arrancan en abril). ⚠ **El año no consta en ninguna hoja ni en la metadata.** La fuente de
  herramientas es la **grilla mensual**, no la lista de arriba: sus dos totales cortan el rango antes
  de la fila 26 y **pierden Supabase**. Y en *Salarios Actuales* el total arranca en `D14` y **se
  come a Jerson Escudero ($1.200)**. Es la tercera vez que un total del propio documento sub-suma
  (ya había pasado con las facturaciones) ⇒ **regla que queda: lo leído celda por celda es la
  verdad; el total del documento es un control informativo, jamás una validación.** *Claude* no
  tiene importe en ninguna de las dos fuentes: no se aproxima, se reporta y se deja afuera.
- **Tres correcciones tras la respuesta de Elías (2026-08-15), ya en el loader.** (1) *Patente*
  dejó de ser incargable: son **dos conceptos fiscales**, confirmado — "cada 3 meses se cobran los
  bienes inmuebles con cargo extra". Se carga como Patente MENSUAL (el monto base, moda de la
  fila) + un concepto nuevo *Impuesto de Bienes Inmuebles CR Smarteam S.A* ANUAL (el recargo
  trimestral × 4; el trimestre de marzo cae en el bloque oculto y no tiene dato, así que se
  extrapola de la cadencia confirmada). (2) *Comisiones Randall Fernandez* se EXCLUYE de costos
  fijos aunque la fórmula sigue viva y estable en la hoja: Elías confirmó que se dejó de pagar en
  febrero — es una comisión de vendedor muerta, no un costo recurrente, y por diseño va a F3 (o ni
  eso, si terminó antes de que arranque la ventana observable). (3) El bloque OCULTO (ene-sep) SÍ
  se lee —"todo lo oculto debe usarse, si el campo está vacío quiere decir que es el mismo"— pero
  solo 4 filas tienen dato ahí (Alquiler, CCSS CR Smarteam, Juan Tijerino, Contabilidad SV) y están
  en **moneda mezclada sin ninguna marca legible** (colones los dos primeros, dólares los otros
  dos — confirmado a mano, celda por celda), mientras el bloque vivo confirmado es dólares. Eso es
  un cambio de MONEDA, no de precio: `CostoMovimiento` no está diseñado para representar eso con
  honestidad, así que el loader lo IMPRIME como sección informativa y nunca lo aplica ni lo
  backfillea.
- **«El Excel manda» con un matiz.** Lo que está en Nexus y no en el Excel (Claude, Odoo, Mercury,
  Apollo, Factun, Quickbooks, Marketing Hub Starter, 5 personas) **no se borra: se da de baja**
  (`finalizadoEl` + movimiento `BAJA`). Es reversible y deja huella; el hard delete perdería
  justamente la historia que `CostoMovimiento` existe para guardar.

## La comisión se paga el siguiente 30 después de que el cliente pague (2026-08-16)

> Corrección de **Alexander Arrieta** por WhatsApp, sobre la tanda del mismo día:
> *"No, los pagos de comisiones se hacen los 30 de acuerdo al pago de los
> clientes… por las fechas de pagos de los clientes, que no son exactas"*. Elías
> lo cerró: *"O sea, se hacen el siguiente 30 después de que el cliente pague"*, y
> pidió validar que esa configuración fuera apta y que quedara de default.

- **Es apta y pasa a ser el default, pero NO era la opción que ya existía.** El
  enum traía `Q2_MISMO_MES` («fin del mismo mes») y parecía que la corrección se
  resolvía cambiando una constante. **No:** de los 101 cobros COBRADO con fecha
  que hay hoy, **17 caen el último día de su mes** (los días más frecuentes son el
  15 con 59 y el 30 con 23). Con «mismo mes», esos 17 tendrían la comisión
  programada **el mismo día en que entró la plata** — pagada antes de estar
  confirmada, y lo contrario de «el SIGUIENTE 30». Por eso la política nueva se
  llama `SIGUIENTE_FIN_DE_MES` y compara **estrictamente**.
- **El disparador es la fecha de CADA cobro, no el mes al que pertenece**, y eso
  es lo que obligó a un cambio estructural y no a un swap de constante:
  `devengarComisiones` agrupaba por mes de devengo, así que un cobro del 15 de
  julio y uno del 31 de julio caían en la MISMA línea — y se pagan en planillas
  distintas. Ahora el grupo ES el pago: persona × quincena de pago × moneda. Es
  literalmente lo que dijo Alexander (*"de acuerdo al pago de los clientes… las
  fechas no son exactas"*): la comisión sigue al dinero, no al calendario.
- **Se pudo cambiar el significado de `periodo` sin migrar nada** porque se
  verificó antes: `ComisionVendedor` y `ReglaComisionVendedor` tienen **0 filas**.
  Nada liquidado, nada que reinterpretar. Con filas, el mismo cambio habría
  exigido una columna nueva y un backfill.
- **Disuelve la objeción del default anterior en vez de ignorarla.** `Q1_MES_SIGUIENTE`
  se había justificado así: *"la comisión de marzo se calcula sobre TODO marzo,
  incluido el 31; pagarla el 30 sería pagar un número que todavía no se puede
  saber"*. Con el grupo redefinido, cada línea es «todo lo que entró estrictamente
  antes del 30» — que SÍ es un número que se puede saber el 30. El argumento era
  correcto para el agrupamiento viejo y deja de aplicar con el nuevo.
- **Un cobro del 30 en un mes de 31 días se paga al día siguiente, y está bien.**
  No es una excepción: el 31 todavía es «el siguiente 30» respecto del 30. Lo
  congela el test Q3 para que nadie lo «arregle» sin decidirlo.
- **`quincena` entra a la identidad del grupo y al payload de liquidar.** Con la
  política vigente siempre da 2, pero `SIGUIENTE_QUINCENA` produce dos grupos en
  el mismo mes y sin ese campo se liquidaría el equivocado — el tipo de error que
  no avisa. **No** se agregó columna a `ComisionVendedor`: sería DDL coordinado
  entre las 2 PCs por una política que hoy nadie usa, y la fila liquidada ya queda
  identificada por sus `cobroIds` y su `pagoPlanillaId`.
- **La fecha de pago se muestra SIEMPRE, aunque la quincena no exista.** Antes,
  sin fila de planilla a la que engancharse, la columna «Se paga» quedaba muda: la
  fecha se sabe igual (la calcula la política) y lo que falta es dónde colgarla,
  que se dice aparte con «(suelta)».
- **`finDeMesISO` hace la aritmética a mano, sin `Date`.** Un `new Date("2026-07-31")`
  en UTC-6 se lee como el 30 y correría **todas** las comisiones un día. El módulo
  entero ya evitaba `Date` por esto; la regla nueva no lo iba a estrenar.
- ⚠ **La política sigue siendo una constante, no una fila de configuración.** Que
  se haya corregido a los pocos días refuerza el diseño (cambiarla fue tocar un
  archivo puro con su test), no lo contradice: mientras haya UNA forma de pagar,
  una pantalla de settings sería una pantalla que mantener sin nadie que la use.

## Planillas, historial y la cadencia de cada aliado (2026-08-16)

> Elías, mirando el módulo ya en uso: *"El historial de planillas, creo que mejor
> meterlo dentro de la página de planillas (debería llamarse así, no planillas
> (estimado). O realmente no entiendo por qué dice estimado). Y dentro de esa
> página que haya un botón que diga Historial"*, *"Las comisiones también deben
> tener un histórico (como los salarios)"* y, hacia adelante, *"quiero poder hacer
> un gráfico histórico de este año… cada cosa debe estar sostenida en el tiempo
> hasta hoy y proyectada con la configuración a futuro"*.

- **«Estimado» era una muleta, no una distinción.** El eje real no es
  estimado/real: es **CONFIGURACIÓN vs REGISTRO**. `CostoRecurrente` (SALARIO) es
  configuración que proyecta el futuro —`loadCajaNeta` lo lee `activo:true` **sin
  filtrar categoría**, así que esos salarios *son* el burn y la caja neta a 6
  meses— y `PagoPlanilla` es el registro de lo que salió. El paréntesis del menú
  existía solo para poder distinguir dos ítems con nombres parecidos («Planillas
  (estimado)» y «Libro de planilla»); con el libro adentro, deja de tener razón de
  ser. Lo que la palabra quería decir de verdad —*no es contabilidad fiscal*— ya
  estaba escrito cinco veces en la misma pantalla.
- **La fusión es de PANTALLA, no de datos**, y el estimado sigue haciendo falta
  por tres hechos verificados: (1) el libro **no existe hacia adelante** —
  `generarQuincena` es CREATE-ONLY y solo materializa la quincena de hoy; la
  proyección la produce `proyectarCostos` sobre `CostoRecurrente`; (2) el libro se
  **alimenta** del estimado (deriva las filas de `categoria:"SALARIO", activo:true`
  con `teamMemberId`): sin él no puede materializar nada; (3) si ambos entraran al
  neto sería doble conteo en el tramo solapado. `loadCajaNeta`, `proyectarCostos` y
  los golden **no se tocaron**.
- **El historial va a RUTA HIJA (`planillas/historial`), no a una pestaña.** Con
  pestaña, el link sería siempre el mismo (no se puede compartir ni marcar), habría
  dos `<h1>` en la pantalla —`LibroPlanillaPanel` monta su propio `PageHeader`— y
  el `loading.tsx` de Planillas pasaría a prometer una forma que ya no es. Con ruta
  hija cada pantalla mantiene su skeleton real y el gate se replica tal cual (una
  hija **no hereda** el gate de su madre: lo pone la page, y el escaneo P4 lo exige
  archivo por archivo justamente para que nadie asuma esa herencia).
  ⚠ **La hija NO se declara en el sidebar**: si estuviera, el prefijo de «Planillas»
  la marcaría activa y `nav-children.test` lo frena. Sin entrada propia, estar en el
  historial ilumina a su madre, que es lo correcto.
- **Las rutas de API NO se movieron.** `/api/cobranza/costos/pagos-planilla` sigue
  igual: moverla rompería los imports estáticos de `lib/cobranza/costos-privacy.test.ts`
  y con eso P1-P4 enteros. **El nombre de la pantalla es copy; el de la API es
  identidad** — la misma regla que ya se aplicó al renombre de «Business Case».
- **El histórico de comisiones es el de VENDEDOR, y el de partner va a otra
  granularidad** (respuesta textual de Elías): las de vendedor *"son más variables y
  dependen del número de ventas de la persona"* ⇒ mes a mes, como el historial de
  planilla. Las de partner *"nos las pagan cada ciertos meses"* ⇒ a la **frecuencia
  configurada del aliado**. Son dos lecturas distintas porque son dos ritmos
  distintos, no por gusto de diseño.
- **Se cerró un bug que dejó la tanda F3**: `liquidarComision` aceptaba y VALIDABA
  `pagoPlanillaId` (misma persona, misma moneda) pero el panel **nunca lo mandaba**
  ⇒ toda liquidación quedaba suelta, el desglose expandible del historial de
  planilla salía siempre vacío y `loadAguinaldo` sumaba **cero** comisiones. La
  plomería existía entera y no la usaba nadie.
- **El CUÁNDO se paga la comisión es una POLÍTICA aislada**, porque Elías pidió
  explícitamente poder cambiarla (*"por ejemplo ponerlo en la primera semana de cada
  mes"*). `quincenaDePagoDeComision(fechaCobro, politica)` es pura, con un test por
  política, y la vigente es una constante. La quincena la **resuelve el server** y
  el panel la muestra y la reenvía; si la calculara el navegador, la comisión
  quedaría enganchada a lo que dijo el navegador.
  ⚠ **El default `Q1_MES_SIGUIENTE` era INCORRECTO y se corrigió el mismo día** —
  ver la sección siguiente.
- **La frecuencia es del ALIADO, no del pago** (decisión de Elías entre tres
  opciones). Tabla `PartnerComercial` con `frecuenciaMeses` Int (no enum: agregar
  "cada 2 meses" no puede exigir un `ALTER TYPE` coordinado entre las 2 PCs) y FK
  **nullable** en `ComisionPartner` — el string `partner` se queda como snapshot,
  igual que `sujetoNombre` en `PagoPlanilla`, así que borrar el aliado pierde la
  cadencia y **no la plata**.
- **Los buckets van anclados al AÑO CALENDARIO.** Con 3 meses son los trimestres,
  que es lo que todo el mundo ya entiende. Anclarlos al primer pago de cada aliado
  dejaría a dos aliados con la misma cadencia en períodos corridos entre sí y
  ninguna tabla los podría poner lado a lado. Una cadencia que no divide a 12 deja
  el último bucket corto y la etiqueta lo dice.
- **La tarjeta dice DÓNDE cae el próximo, nunca cuánto.** El monto no lo sabe
  nadie. Y sin cadencia configurada no se dice nada: deducir el ritmo de uno o dos
  pagos sería la fabricación que este módulo evita — por eso el seed marca a
  **Cooby** como SUPUESTO en sus propias notas (un solo pago no permite deducir
  nada) y **Nua talk** no se carga (columna en cero).
- ⚠ **El gráfico histórico NO se construyó** (pedido explícito de Elías: todavía
  no). Lo que sí quedó es el diagnóstico de qué se puede sostener en el tiempo hoy
  y qué no: **tienen fecha por fila y se reconstruyen mes a mes** los cobros
  (`fechaCobro`), los gastos (`fecha`), el libro de planilla (`periodo`+`quincena`)
  y las comisiones de partner (`fecha`); la comisión de vendedor devengada **se
  recalcula** en vez de guardarse; y **NO se pueden reconstruir hacia atrás**
  `CostoRecurrente` (guarda el monto de HOY — `updateCosto` estampa
  `fechaEfectiva = hoy` en cada cambio, así que un burn dibujado hacia marzo
  mostraría el costo de hoy: una línea plana, creíble y falsa) ni `TarjetaCredito`
  (un solo saldo, sin serie). La salida correcta cuando llegue el gráfico es
  **declarar el arranque de la serie**, como ya hace `coberturaDe`, y no fabricarla:
  los salarios pasados salen del libro —que sí trae la variación real del año— y
  los futuros de `CostoRecurrente`, con corte duro en hoy.

## El reporte anual de equilibrio, y el tipo de cambio que sí existe (2026-08-17)

> Elías, mostrando un reporte que había armado por fuera (`dev.smarteamcr.com/finanzas/`,
> HTML estático con los números incrustados a mano): *"Quiero que el módulo de finanzas
> sea capaz de poblar automáticamente un reporte como ese."* Y sobre el pasado:
> *"Justo eso es lo que hay que hacer, reconstruir el pasado en modo histórico."*

Es la sección anterior cobrada: el gráfico histórico que se había pospuesto, ahora pedido,
con la salida que esa misma sección anticipó — declarar el arranque de la serie en vez de
fabricarla.

- **La prohibición de FX se ACOTA, no se levanta.** Las cuatro escrituras de la regla
  (§Cobranza acá arriba, §El libro de planilla…, `lib/cobranza/tarjetas.ts` y
  `lib/cobranza/comisiones.ts`) siguen enteras **para la base y para los motores**:
  `engine.ts`, `tarjetas.ts`, `comisiones.ts`, `partners.ts`, `planilla.ts`,
  `aguinaldo.ts` y todo lo que cuelga de `computeCajaNeta` **nunca** convierten, y la
  plata se sigue guardando en su moneda nativa. Lo único nuevo es que **la capa de
  presentación de UN reporte** puede convertir, con la tasa del mes, y **todo número
  convertido lo declara**. La conversión vive en una sola función —`convertir()` de
  `lib/finanzas/equilibrio.ts`— y un test estructural verifica que ningún motor la
  importe: la doctrina la sostiene el test, no el comentario.
- **Por eso `TipoCambioMes` es una tabla y no una constante.** Una tasa tecleada por una
  persona, con su `fuente` en texto obligatoria, un mes por fila. `Decimal(12,4)` y no
  `(12,2)`: una tasa no es dinero, y truncarla a centavos mete error sistemático en cada
  conversión del año. **Sin tasa para un mes no se aproxima con la de otro**: el monto no
  entra al total y aparece listado. Y sin ninguna tasa el reporte no se muestra — mostrar
  los números "igual" es exactamente el caso que la regla existe para prevenir.
  La frase de `tarjetas.ts` —*"un tipo de cambio que este sistema no tiene ni va a
  tener"*— quedó falsa y se corrigió ahí mismo, no se dejó mintiendo.
- **El equilibrio es el PROMEDIO de los gastos mensuales totales, no la fórmula de
  contabilidad.** Decisión de Elías, con su razón: *"la fórmula clásica (costos fijos ÷
  margen de contribución) funciona cuando vendés unidades con un costo variable claro por
  unidad — no es tan directa para un negocio de servicios"*. Así que en vez de separar
  fijo de variable se promedian los meses **confiables**, y lo interesante es qué cuenta
  como confiable: el módulo devuelve **dos cifras** —solo meses medidos, y meses medidos
  más planificados— con `mesesUsados[]` y `mesesExcluidos[{periodo, motivo}]`. Cero
  exclusiones mudas. La segunda existe porque es la que dio el reporte original ($26.968,71
  promediando abr–dic con dic todavía sin ocurrir) y hay que poder reencontrarla, rotulada.
- **`EgresoMensual` es el libro de egresos, hermano de `PagoPlanilla`.** Una fila por
  período × categoría × concepto, con la clave normalizada aparte del nombre legible
  (mismo patrón que `PartnerComercial.clave`). Nace porque **el Excel de egresos ya trae
  la variación mes a mes de herramientas y costos fijos, y el importador la leía y la
  tiraba**: `leerCostosFijos` devolvía `meses[]` y se colapsaba a la moda; un concepto que
  variaba entre meses ni se cargaba. Lo que se persiste ahora es ese detalle, no una
  fuente nueva. Bonus: un pago ANUAL cae **en su mes real** en vez de mensualizarse /12.
- **Extender `CostoMovimiento` estaba descartado antes de evaluarlo, y esa sección de acá
  arriba dice por qué**: `updateCosto` estampa `fechaEfectiva = hoy` en cada cambio de
  monto. Un fold "as-of" sobre esas filas da la línea plana, creíble y falsa. (Aparte y sin
  relación con el reporte: `costoBase` acepta `fechaEfectiva` en el schema Zod y
  `updateCosto` **nunca la lee** — hoy es imposible registrar un aumento con su fecha real.
  Es un agujero hacia adelante que conviene cerrar, pero no fabrica el pasado.)
- **PLANILLA y RESERVA_AGUINALDO tienen prohibido entrar a `EgresoMensual`, con un CHECK en
  la base.** La planilla ya vive en `PagoPlanilla` —que es la única serie mensual REAL que
  el sistema tenía— y la reserva se deriva de ahí. Escribirlas también acá las contaría dos
  veces: el mismo error que `CorteTarjeta` evita al no sumarse con la comisión.
- **La calidad del mes se DERIVA, no se guarda.** Ninguna columna `completo`/`parcial`: un
  mes es completo si tiene sus dos quincenas de planilla y todos los conceptos que ese año
  tuvo, y el módulo puro lo calcula nombrando **qué falta**. Guardar la etiqueta la
  congelaría: el mismo mes cambia de calidad cuando llega el dato que le faltaba.
- **Enero–marzo de costos fijos quedan PARCIALES para siempre**, y está bien. El bloque
  izquierdo del Excel está oculto, con `#REF!` y moneda mezclada, y §…la carga de egresos ya
  decidió no backfillearlo. Un mes vacío no es un mes barato: se declara, no se rellena.
- **Dos números que conviven en vez de elegirse en silencio.** La reserva de aguinaldo: el
  Excel divide entre 10 ($1.602,77/mes), Nexus entre 12 (`lib/finanzas/aguinaldo.ts`).
  Ninguno es "el bug" — se muestra el de Nexus y se expone el del Excel con su aviso. Y el
  solape entre TARJETA y HERRAMIENTA: el importador ya advertía que cargar tarjetas como
  costo fijo *"duplicaría lo que ya cobran las herramientas"*, pero **el solape no se puede
  medir** (`TarjetaCreditoCosto` está vacía y el Excel no dice qué herramienta se paga con
  qué tarjeta). Se suman y se declara con severidad alta, en vez de decidirlo callado.
- **El escenario editable NO persiste, y eso es la feature.** Mover el facturado de un mes
  para ver la brecha es una pregunta, no un dato: vive en un `useState`, sin fetch, sin
  `localStorage`, sin query param, y se muere al recargar. El componente **no recibe ningún
  callback hacia el servidor** justamente para que nadie le enchufe un "guardar" de paso.
  Que quede escrito acá: completarlo con persistencia no es terminar la feature, es otra.
- **El reporte es SUPER_ADMIN, no ADMIN.** Mezcla ingresos con la estructura de costos y la
  planilla, y la unión toma la sensibilidad máxima: `guardCostosAccess`, ruta bajo
  `/finanzas/`, `EgresoMensual` con deny-all. Consecuencia asumida por Elías: **Alex, que
  es quien registra facturaciones y comisiones, no lo ve**. `TipoCambioMes` en cambio NO
  lleva deny-all —una tasa publicada no es sensible, mismo criterio que `PartnerComercial`.
- **`CorteTarjeta` y `AguinaldoPago` siguen sin uso** (cero filas, cero referencias) y este
  reporte **no los toca**. Se deja anotado para que la próxima búsqueda no los confunda con
  una fuente disponible.

- **Un cliente que factura sin venta no es un hueco: son tres problemas distintos.** El
  panel decía "$131.064 facturados sin ninguna venta" y la mitad resultó ser gente que sí
  compró. Se separan porque se arreglan en lugares distintos: (a) la venta está en un
  pipeline que hoy no cuenta —Shared Selling— y eso lo decide **dirección**, no cobranza;
  (b) la venta quedó a nombre de la empresa madre y lo cierra **cobranza** ligando las dos;
  (c) no hay venta en ningún lado, y ese sí es el hueco. Juntar los tres en una cifra hacía
  que la única acción posible fuera "revisar todo".
- **El emparejado por nombre PROPONE, nunca concluye** (`lib/ventas/respaldo-de-factura.ts`).
  Nada de lo que sale de ahí entra en una cifra del reporte: va a una lista para que una
  persona confirme. La regla es que el nombre del cliente aparezca **entero** dentro del
  nombre del trato, y es asimétrica a propósito. La versión anterior pedía una palabra en
  común y llegó a proponer que «Amvac Latam» y «Forestales LATAM» eran el mismo grupo.
- **Shared Selling se espeja pero no cuenta, y la evidencia en contra se muestra.** La
  bandera vive en un solo lugar (`esVentaPropia` en `lib/ventas/pipelines.ts`). Mientras
  esté en `false`, el reporte declara cuánto factura y cuánto cobra la gente que llegó por
  ahí —hoy $55.820 facturados— para que la decisión se tome mirando plata y no opiniones.

- **El titular del margen corta en el mes de hoy.** Comparar doce meses de costo contra
  ocho de ingreso no es un margen: la comisión de aliado de noviembre ya está fechada y
  entra, pero la planilla de septiembre a diciembre vale cero porque el libro de pagos
  solo tiene lo pagado. El tile es **«Margen a la fecha»** (`margenAlDia`) y lo que viene
  se declara al lado (`comprometidoPorVenir`), nunca sumado. `margenAnual` sigue en el DTO
  rotulado como proyección. **Tampoco entra un mes ocurrido con el gasto incompleto**
  (2026-09-14, `margenDeMesesCompletos`): enero a marzo sin costos fijos, agosto sin la 2ª
  quincena y septiembre sin planilla inflaban el margen entre ≈US$17.500 y ≈US$36.000. Los
  meses que quedan fuera se nombran en el tile, y la caja usa esos mismos meses.
- **Lo facturado en años anteriores y sin cobrar sigue en la calle** (`porCobrarDeAniosAnteriores`,
  2026-09-14): por moneda, sin convertir y sin sumar al año. Sin eso, el 1 de enero una factura de
  diciembre sin pagar desaparecía de «Cuentas por cobrar».
- **La caja se mide contra egreso de caja, no contra el egreso entero** (`egresosDeCajaTotal`).
  Sin eso, el «margen en caja» descontaba la reserva de aguinaldo —un devengo, nadie apartó
  esa plata— y los egresos de meses que no ocurrieron: medía los ingresos con criterio de
  caja y los egresos con criterio de devengo.
- **El total de inconsistencias cuenta cada peso UNA vez** (`yaContadoEn`). Las líneas que
  miran la misma plata desde otro ángulo conservan su monto —sirve para dimensionarlas— y
  quedan fuera del total, marcadas «ya contado arriba» en pantalla. Sin esa marca, sumar la
  columna a mano da más que el titular y parece que el titular está mal.
- **Un mes que todavía no ocurrió NO es un dato faltante.** El aviso de gasto incompleto
  cuenta solo meses pasados y menciona los futuros aparte. Decía «8 de 12» cuando lo
  accionable eran 3, y un aviso que exagera se deja de leer entero.
- **«Igualar al equilibrio» SUBE, no empareja.** Ponerle el piso a todos los meses bajaba
  los que ya facturaban de más, y el escenario mostraba un año peor que el real debajo de
  un botón que se lee como aspiración. Nadie se pregunta «¿y si hubiera facturado menos?».
- **Lo vendido es una serie propia y punteada, y no suma a los ingresos.** Es el origen de
  la plata, no la plata: mezclarlo con lo facturado contaría dos veces el mismo negocio. La
  serie tiene picos a propósito —un trato grande cierra en un mes y se factura en doce— y
  ese desfase es justamente lo que se quiere ver.

- **HubSpot Shared Selling SÍ cuenta como venta propia** (Elías, 2026-08-19). Ahí van los
  tratos cerrados que HubSpot nos envía, y son venta de la casa. La evidencia que lo cerró:
  12 clientes cuya ÚNICA venta venía de ese pipeline ya habían facturado $55.820 en 2026,
  de los cuales $33.370 estaban cobrados — se estaba facturando y cobrando trabajo que el
  reporte no contaba como vendido. Consecuencias, todas asumidas: el vendido del año pasa
  de $194.365,67 a **$405.386**; agosto deja de ser un mes con cero ventas; y el hueco
  contra cobranza sube de $132.424 a **$315.175**, porque esas ventas ahora se le exigen a
  cobranza. La bandera vive en un solo lugar (`esVentaPropia` en `lib/ventas/pipelines.ts`)
  y hay un caso que se pone rojo si alguien la mueve sin declarar por qué.
- **La lista fina de las inconsistencias no se trunca NUNCA.** Antes el motor mandaba las 8
  peores y la pantalla cortaba en 6: "y 34 más" convierte una lista de trabajo en un
  titular, y nadie puede ir cerrando de a uno lo que no ve. Hoy salen los 111 ítems, y la
  suma de una lista cuadra al centavo con el total de su línea — que es la comprobación que
  se puede hacer a ojo, sin abrir nada. Lo que se administra es el ALTO: a partir de ocho
  líneas la lista scrollea dentro de su caja.
- **Cada ítem dice DÓNDE comprobarse** (`ItemInconsistencia.enlaces`). El trato en HubSpot,
  la empresa, el cliente en Nexus. Una línea que dice "RC Inmobiliaria · $26.200" y no deja
  abrir el trato obliga a buscarlo a mano, y a la tercera vez la sección se deja de revisar.
  ⚠ El portal va SIEMPRE explícito (`lib/hubspot/urls.ts`): un id solo tiene sentido dentro
  de su portal, y cruzarlos abre una empresa ajena o da un 404 que parece falta de permisos.
- **Los enlaces entran por parámetro a los módulos puros.** `auditarRespaldoDeFactura`
  recibe un `enlacesDe(clientId)`: ahí se decide QUÉ está mal, no dónde se mira. Sin eso, un
  módulo de dominio tendría que conocer rutas de la app y el portal de HubSpot.

- **Facturado es TENER FACTURA, no un estado del cobro** (Alex, 2026-09-12: el % de cobranza
  cuenta solo lo facturado). `tipoIngresoDeCobro` imputa cada cobro: lo cobrado va al mes en
  que entró la plata, lo que tiene factura y no se cobró va al mes de EMISIÓN, y lo que no tiene
  factura queda en su período como backlog. El estado de la base mezcla las dos cosas: ALMOTEC
  tenía tres cuotas en PROGRAMADO emitidas el 19-ago y sus US$6.900 figuraban como «pendiente de
  facturar» mientras Cobranza las mostraba vencidas. El auditor de ventas descubiertas usa la
  misma función y convierte cada cobro con la tasa de SU mes; sin tasa no suma, lo lista.
- **El % de cobranza viaja en par** (`lecturaDeCobranza`): sobre lo facturado y sobre lo
  exigible, que deja afuera lo que todavía está en plazo. No hay un campo con uno solo, porque
  suelto cualquiera de los dos se cita mal. El vencido sale de `semaforoCobro` (una promesa no
  saca a nadie del exigible), y la apertura por moneda nativa (`cobranzaPorMoneda`) no convierte:
  un % en dólares tapaba justo lo que el libro de Alex separaba en colones.
- **Una comisión estimada no es plata ganada.** Con `montoEsProyeccion` no suma a ingresos,
  brecha, margen ni «Igualar al equilibrio»: se declara aparte, en `partnershipProyectado`. No
  se le preguntó a nadie porque no era una decisión sino un error de fidelidad (H12): los
  «US$51.000 exactos, dos veces» pesaban igual que lo que entró al banco. Una comisión nueva
  POR_COBRAR nace estimada (`montoEsProyeccionPara`).
- **`PARTNERSHIP_CUBRE_EL_PISO = true`** hasta que Marco y Claudia contesten si el punto de
  equilibrio se cubre también con lo que pagan los aliados. `true` es lo que el reporte hizo
  siempre sin que nadie lo firmara. Vive en `lib/finanzas/equilibrio.ts`, los tests corren con
  los dos valores y un centinela compara esta línea con el código: cambiar la decisión exige
  cambiar las dos. La caja no depende de la bandera: una comisión cobrada entró igual.
  **Desde el 2026-10-05 la decide dirección en la página** (Finanzas › Punto de equilibrio › «Para
  decidir»): queda en `DecisionFinanzas` (`aliados-cubren-piso`, SI · NO), firmada con quién y cuándo,
  y manda sobre la bandera. La bandera sigue siendo el valor POR DEFECTO —el que rige mientras nadie
  decidió—, por eso esta línea y el centinela siguen valiendo.

## Documentación pasa a ser una base de conocimiento (2026-09-11)

> El módulo era un manual de solo lectura escrito en el código: para corregir una frase hacía
> falta un desarrollador y un deploy. Elías pidió convertirlo en una base tipo Notion, que
> escriba el equipo. La decisión de encuadre —la audiencia sigue siendo el equipo de Smarteam,
> en lenguaje de negocio— no cambia; lo que cambia es QUIÉN puede escribir y DÓNDE vive el texto.

- **El texto se muda a la base; lo DERIVADO se queda derivado.** Es la mitad de la decisión que
  más importa, porque es la que evita repetir el error que el módulo vino a resolver en agosto.
  La narrativa («qué es Nexus», «qué te ahorra») ahora es contenido editable. Las listas —el menú,
  las etapas, los documentos, los agentes, HubSpot y los roles— NO se copiaron a la base: son
  bloques `vivo`, que declaran una fuente y se arman en el servidor desde los mismos registros
  que gobiernan la app (`lib/documentacion/vivos.ts`). Una doc escrita 100 % a mano miente a los
  tres meses; ésta sigue actualizándose sola en la mitad que ningún humano debería mantener.
  - El costo de la otra opción (copiar todo a la base al sembrar) se vio en el acto: el manual
    viejo afirmaba que Nexus DEDUCE la etapa y que nunca escribe etapas ni propiedades en
    HubSpot — falso desde el 2026-07-30. Congelar eso en la base lo habría vuelto permanente.
- **Modelo propio (`PaginaDoc`) y NO `KnowledgeDocument`.** Son dos cosas con el mismo nombre
  vulgar y distinto dueño: `KnowledgeDocument` (`/knowledge`) es la biblioteca que entra a los
  PROMPTS de los agentes por tags; esta base es para personas. Si compartieran tabla, una página
  escrita al pasar terminaría dentro del informe que recibe un cliente. Lo sostiene un test:
  `lib/agents`, `lib/canvas`, `lib/knowledge` y `lib/ai` no pueden nombrar `PaginaDoc`.
  - Elías eligió mantenerlas separadas por ahora; unificarlas con un interruptor «la leen los
    agentes» es otra tanda, y con esta frontera puesta se puede hacer sin riesgo.
- **El contenido se escribe con control de versión; el título y el ícono, no.** El guardado manda
  la `version` que leyó y el UPDATE es `WHERE id AND version`: si otra persona guardó primero, el
  editor avisa en vez de pisarla. Pedirle lo mismo al título sería inventar un conflicto entre dos
  cambios que no chocan — renombrar en una pestaña haría fallar el autoguardado de la otra.
- **Las dos páginas sembradas nacen BLOQUEADAS.** El reglamento de la Escala y el manual de la app
  son documentos que se consultan para decidir; que cualquiera los edite sin querer es un riesgo
  distinto al de una página de notas. El candado no las vuelve intocables: se saca con un clic
  desde el menú del árbol, y solo `documentacion.manage` (CSL) puede sacarlo.
- **Arrastrar reordena ENTRE HERMANAS; anidar es «Mover a…».** Un árbol con drop por profundidad
  necesita zonas de destino, autoscroll y una defensa contra el anidado accidental — la parte cara
  y la que más se equivoca. El diálogo resuelve lo mismo, funciona por teclado y muestra
  deshabilitadas la propia página y su rama (el ciclo que el servidor rechaza ni se ofrece).
- **Editor: BlockNote (MPL-2.0), sin sus paquetes `@blocknote/xl-*` (GPL).** Trae de fábrica el
  menú «/», el arrastre, los desplegables, las tablas y el español; lo que se agregó encima son
  dos bloques propios (`aviso` y `vivo`). La licencia la vigila un test, no la memoria.
  - Los bloques de ARCHIVO (imagen, video, audio) se sacaron del ESQUEMA, no solo del menú: si
    solo se escondieran, pegar una imagen crearía un bloque roto apuntando a ningún lado. Vuelven
    cuando exista la subida.
- **Nada se borra.** Archivar manda la rama entera a la papelera con un mismo lote y la devuelve
  igual. Una base de conocimiento sin papelera es una base donde nadie archiva.
- **La siembra no pisa lo que escribió una persona.** Compara la `version` actual contra la que
  quedó al sembrar (`semillaVersion`); si difieren, salta la página y lo dice. Se compara por
  número y no por contenido porque el editor normaliza los bloques al cargarlos: comparar el JSON
  daría «editada» siempre. Para pisar igual hay que nombrarla: `--forzar <slug>`, y antes se
  guarda una versión en el historial.
- **Lo que esto SUPERA de la decisión de 2026-08-02**: el buscador, el command palette, el
  versionado y las migas de pan estaban descartados «para no re-litigarlo», y el descarte era
  correcto para lo que el módulo era entonces (~40 unidades, Ctrl+F alcanza). Con una base que
  crece y que escribe el equipo, los cuatro pasan a ser necesarios. Lo que NO cambió: los prompts
  de los agentes siguen sin cruzar a esta pantalla (el escaneo de privacidad ahora apunta a
  `lib/documentacion/vivos.ts`, que es donde vive la consulta), y la pantalla usa solo tokens.

### La segunda pasada, el mismo día: lo que faltaba para que fuera usable

> Elías la abrió, la usó cinco minutos y volvió con cuatro cosas: el selector de ícono era una
> columna de cuarenta renglones, escribir tenía que ser de pocas manos, faltaba conectar páginas
> entre sí, y faltaba el resto del oficio (buscar, volver atrás, recuperar lo archivado).

- **Escribir es de CSL y de dirección; el resto del equipo LEE.** El default nació con los seis
  roles operativos escribiendo —«como en Notion»— y se corrigió antes de que la base tuviera
  contenido. El motivo es de sentido único: abrirla después es cambiar una línea de la matriz; lo
  ya escrito por doce manos, en cambio, no se recoge. Leer sigue sin celda (es de todo interno), y
  cualquier persona se puede habilitar desde Equipo sin tocar código.
- **El enlace entre páginas guarda el ID, no el nombre.** Es la decisión que hace que la base
  aguante el tiempo: el título y el ícono que se ven se resuelven al pintar contra el índice que
  baja del servidor, así que renombrar una página no deja su nombre viejo escrito en las diez que
  la nombran. El título guardado queda como respaldo para cuando la página enlazada ya no está —
  ahí se muestra tachado, en vez de un enlace que no lleva a ningún lado.
  - La vuelta («Enlazan acá») se calcula buscando el id DENTRO del contenido, sin una tabla de
    enlaces. Una tabla hay que sincronizarla en cada guardado y se desincroniza en silencio; esto
    no puede quedar viejo. El costo es un escaneo de una tabla de decenas de filas.
  - Las dos páginas sembradas nacen enlazadas entre sí, y la siembra completa los ids en una
    SEGUNDA pasada: al armar el contenido, la página destino todavía no existe.
- **El selector de ícono es una grilla, y ahí está la lección.** La primera versión reusó `Menu`,
  que apila un ítem por fila: cuarenta emojis se volvieron una columna altísima que tapaba media
  pantalla para elegir un dibujo de 16 píxeles. Reusar la primitiva de la casa es la regla, pero
  `Menu` es para ACCIONES con etiqueta; un selector visual se escanea con la vista. Lo que sí se
  reusa es la mecánica (`usePanelFlotante`): posición fija desde el botón, el scroll externo
  cierra, Escape devuelve el foco.
- **Ctrl+K abre el buscador salvo dentro del editor con texto seleccionado**, donde es «crear
  enlace» de BlockNote. Robarle el atajo al editor para ganar uno que ya tiene su botón en el árbol
  habría roto una función que la gente usa escribiendo.

### Las tarjetas: dos bloques, no uno (2026-09-11, tercera pasada)

> Con los cuatro artículos llegó el pedido de escribir «con cards». Las tarjetas del manual viejo
> las pintaba el código; ninguna persona podía hacer una.

- **Son dos bloques que trabajan de a pares**, como una lista y sus ítems: `tarjetas` es la rejilla
  (una, dos o tres columnas) y `tarjeta` lleva el título en su renglón y el cuerpo como hijos. La
  alternativa —un solo bloque con un campo de título y un campo de texto— habría necesitado un
  formulario adentro del editor: dos cajas que no son ProseMirror, sin negrita, sin enlaces y sin
  el «/». Con dos bloques, el cuerpo de una tarjeta es contenido normal.
- ⚠ **El recuadro y la rejilla se pintan en el CSS, no en el render del bloque.** No es una
  preferencia de estilo: los hijos de un bloque los dibuja BlockNote FUERA del elemento que
  devuelve el render, en un grupo hermano. Un borde puesto en el render encerraría el título y
  dejaría el cuerpo afuera. Por la misma razón la rejilla se declara sobre ese grupo hermano.
- **Las columnas libres quedan descartadas**, que sería lo «de Notion»: su paquete es GPL y está
  prohibido por licencia (hay test). Las tarjetas cubren el caso real —un grupo de ideas cortas,
  una al lado de la otra— sin traer un modelo de layout entero.
- **Al insertar la rejilla, el cursor va a su primera tarjeta.** La rejilla no acepta texto: dejar
  el cursor ahí hace que lo primero que se escriba caiga en el bloque de arriba. El bloque vivo, en
  cambio, no recibe el cursor: no se escribe nunca.
- **El h4 existía y no se veía.** El esquema aceptaba los seis niveles y el menú «/» los ofrecía,
  pero el CSS solo vestía tres: un h4 heredaba el tamaño del primero. La lección que deja es del
  tipo aburrido y caro — una función a medio terminar se ve igual que una función rota.

### La sección de Customer Success (2026-09-12)

> Elías pidió la arquitectura de documentación del departamento, armada con lo que ya existía:
> los perfiles de Roles, la Guía de CSE, el material de SmartLoop, más competencias, confianza,
> reuniones, descubrimiento y Land and Expand.

- **Los roles se COPIAN curados, no se leen en vivo desde Roles.** Un bloque vivo habría sido lo
  «correcto» contra el desfase, pero mostraría en una base que lee todo el equipo lo que mañana se
  escriba en un perfil de puesto —y los perfiles conviven con propuestas que traen sueldo y
  comisiones—. El costo es que la copia puede quedar vieja: por eso cada página dice de qué perfil
  y de qué fecha sale. ⛔ Un test impide que aparezcan sueldo, comisiones u Ontop.
- **Los caminos se ordenan por competencia, no por rol.** Los perfiles traen «caminos de éxito» y
  «de fracaso» sueltos; repartirlos entre dominio, resolución y habilidad relacional muestra dónde
  un rol queda corto. Lo que faltaba se completó y se marca «agregado»: distinguir lo que dice el
  perfil de lo que no es la condición para que la guía no reescriba el puesto en silencio.
- **El banco de preguntas de descubrimiento sale del reglamento, no se tipea.** Son las mismas 24
  preguntas que ordenan la Escala; tipearlas las desalinearía en la próxima versión.
- **El proceso operativo de SmartLoop se escribió como propuesta, a la vista.** No existía en ningún
  lado. En vez de esperarlo, se armó con lo que Nexus ya hace con los proyectos recurrentes y se
  marcó «a validar» lo que no tiene respaldo, con las preguntas abiertas en un aviso. Una página
  que dice qué no sabe es más útil que una que no existe, y menos peligrosa que una que lo inventa.
- **La estructura del árbol es de la semilla; el contenido editado, de la persona.** La Guía de CSE
  ya estaba editada cuando tuvo que quedar adentro de Customer Success. La siembra la salteaba
  entera —lugar incluido—, y la única salida era `--forzar`, que pisaba lo escrito. Ahora una
  página editada que la semilla ubica en otro lugar se mueve sin cambiar versión ni contenido
  (`lib/documentacion/semillas/accion.ts`). La contracara, aceptada: si alguien mueve a mano una
  página sembrada, la próxima siembra la devuelve a su lugar.
- **Una guía no nombra lo que no se puede usar.** El agente «Preparación de entrevistas» está
  activo en la base pero nunca corrió y no tiene botón en ninguna pantalla; mandar al equipo a
  usarlo le quitaría crédito a la guía en la primera lectura.

## Cobranza — nada sale de verde sin una firma (2026-09-12)

> El libro de Alex contra Nexus destapó que 83 cobros estaban en verde firmados por
> `import:facturaciones-2026`: los pintó la carga del 23-jul según el color de la celda, y al
> menos tres nunca se depositaron (Global Supply feb-2026, IIA y Seléctrica jun-2026, $1.972).
> Decisión de Alex: lo cobrado se queda cobrado, salvo esos tres, que revierte él desde la pantalla.

- **Sacar un cobro de COBRADO pide motivo, y deja la firma vieja en la bitácora.** Era un cambio
  optimista en un `<select>`, sin confirmación y sin rastro, y el chokepoint borraba `confirmadoPor`:
  el único dato que decía quién había dado la plata por entrada. Ahora el diálogo pide motivo
  (obligatorio, también en el servidor: 400 sin él), la fecha real de la factura y, si se tiene, su
  número; la bitácora del cobro guarda quién lo había confirmado, cuándo y quién lo revierte. La
  regla es pura (`lib/cobranza/reversion-cobro.ts`) y corre dentro de `cambiarEstadoCobroTx`.
- **Una firma de cargador no sobrevive a la corrección.** Si `facturadoPor` empieza con `import:`,
  quien revierte pasa a firmar la marca de facturado: es quien acaba de mirar la factura real. La
  firma vieja queda citada en la bitácora. Una firma de persona no se toca.
- **El número de factura va al texto de la bitácora, no a `referenciaExterna` ni a `notas`.** Esas
  guardan de dónde vino cada cobro importado. Cuando el cobro tenga su columna de número, ese dato
  pasa ahí. (Pasó en la etapa 7: ver abajo.)
- **`cambiarEstadoCobro` abre su propia transacción.** Cambio y bitácora quedan juntos o no queda
  ninguno. Deja de ser cierto lo que decía la comisión de vendedor: «no tiene transacción» y «el
  revert no deja bitácora».
- **El importador del libro ya no escribe; no se le cambió el mapeo.** La alternativa era mapear
  verde a por cobrar, pero la carga hacía `upsert` con `update` sobre cada cobro: re-correrla con
  cualquier mapeo pisaba el estado de los 202 cobros, incluidos los que una persona confirmó o
  revirtió después. Queda como reporte de solo lectura, y `lib/cobranza/cargadores-sin-verdes.test.ts`
  impide que un script que escribe en `Cobro` vuelva a nombrar `confirmadoPor`.

## Cobranza — la factura tiene número desde que nace (2026-09-12)

> «Marcar facturado» pedía solo la fecha, y el número se podía pegar recién al registrar el pago,
> en `referenciaExterna`. Medido ese día: 144 cobros facturados y ninguno con número. Justo lo
> facturado y no cobrado llegaba sin él, y el cruce contra Odoo adivinaba por monto.

- **El número vive en su columna, firmado.** `Cobro.numeroFactura` + `numeroFacturaPor/En` +
  `sinNumeroFacturaMotivo` (scripts/sql/2026-09-12-7-numero-de-factura.sql, antes del deploy). La
  regla es pura (`lib/cobranza/numero-factura.ts`) y corre en `cambiarEstadoCobroTx`: marcar
  facturado exige el número o la marca «no tengo el número» con motivo; cambiar una fecha ya puesta
  no exige nada (los 144 de antes siguen editables); revertir la factura limpia número y autoría y
  deja el viejo en la bitácora; cada alta o cambio deja su línea con el correo de quien lo hizo.
- **No es un unique.** Una factura puede cubrir varias cuotas de la misma cuenta. En dos cuentas se
  frena con un 409 antes de escribir, y lo vigila INV33. INV34 vigila que número o marca tengan autor
  y factura; un CHECK impide que número y marca convivan.
- **En Odoo se elige, no se teclea.** El diálogo lista el espejo por los clientes de Odoo VINCULADOS
  a la cuenta (no por la cuenta atribuida, que puede ir atrás), misma moneda, documentos vivos, sin
  números ya tomados y el monto exacto primero; la fecha sale del documento. Si el documento no está
  en el espejo, se teclea con aviso. Mercury y QuickBooks se teclean. «No tengo el número» existe
  siempre: una factura sin número con motivo es una decisión, sin motivo es un olvido.
- **La forma no es verificación.** `plataformaDelNumero` reconoce FAC/2026/0206 como Odoo e INV-4-1
  como Mercury; se usa para avisar, nunca para frenar (la vía de cobro de una cuenta puede estar mal).
- **Soltar una factura guarda su número.** `FacturaLiberada.referenciaExterna` (nombre viejo, no se
  renombra con código viejo corriendo) toma `numeroFactura`. Una liberación de Odoo con un número sin
  forma de Odoo cuenta como «sin número»: el sync no la puede cerrar, así que la cierra una persona.
- **El número de «Sacar de Cobrado» pasa a la columna.** Deja de escribirse en el texto de la
  reversión: lo anota la regla del número, una sola vez.

## Finanzas — la plata que no es venta tiene casillero (2026-09-12)

> El fondo de marketing de Insider (INV-26 + INV-27, US$5.346,91, depositados el 30-jun y el 7-jul)
> entró al banco y no es venta a un cliente. El Compendio lo cuenta como venta; en Nexus, como cobro
> inflaba lo facturado y el % de cobranza, y como comisión de aliado sumaba al punto de equilibrio.

- **Lo registrado en Ingresos variables NO ES VENTA.** El reporte de equilibrio lo lee como `NO_VENTA`:
  suma a la caja («Margen a la fecha · en caja») y a nada más, ni a lo facturado, ni a los ingresos,
  ni a la brecha, ni al % de cobranza, ni a «Igualar al equilibrio». La tabla de meses lo muestra en su
  columna solo si el año tiene, y un aviso de confiabilidad dice cuánto y en qué meses. Antes de esta
  etapa `IngresoVariable` no entraba al reporte en absoluto (0 filas en la base al 2026-09-13), así que
  ninguna cifra existente cambia. Una venta, aunque sea suelta, va a Cobranza: el formulario dejó de
  ofrecer «venta puntual». Los pagos puntuales y rescates de la misma pantalla vienen de cobros y son venta.
- **La categoría acepta «sin clasificar», y es texto.** El nombre de la categoría del fondo de aliado
  lo deciden Elías y Claudia. Hasta entonces se carga sin categoría y «Lo que no cuadra» lo lista
  (`INGRESO_SIN_CATEGORIA`, a cargo de Dirección, con su monto). Cuando haya nombre se suma una línea a
  `CATEGORIAS_INGRESO_NO_VENTA` (lib/cobranza/ingresos-no-venta.ts), sin SQL: por eso la columna es
  texto y no un enum. Una categoría que el código no conoce se lee como sin clasificar, así vuelve a
  la lista. El catálogo arranca con tres que no piden decidir nada (reembolso, intereses, aporte de
  socios) y sin «Otro», que taparía justo la pregunta abierta.
- **La misma factura no se carga por los dos lados.** `referenciaExterna` guarda el número del documento
  o del depósito, normalizado igual que `Cobro.numeroFactura`. El alta da 409 si ese número ya es la
  factura de un cobro; el orden inverso no lo frena el chokepoint de los cobros (no se tocó en esta
  etapa) y lo vigila INV35.
- **Sin el SQL no se cae nada.** Con el código antes que scripts/sql/2026-09-12-10-ingreso-no-venta.sql,
  Ingresos variables y el reporte avisan que falta el archivo; registrar o editar da 503.
- **No se construyó la plata esperada.** El plan preveía `fechaEsperada`, una confirmación por persona y
  un aviso para ingresos que todavía no entraron, solo si INV-26 e INV-27 no se habían depositado. Se
  depositaron, así que `fecha` sigue siendo el día en que entró la plata.

## El chat del cronograma lee el «Contexto del cronograma» (2026-09-23)

> Decisión de Elías. En el cronograma, el chat ya no le pasa una instrucción a otro modelo: emite
> operaciones que el código escribe tal cual. «El chat entiende la intención; el editor tiene el
> contexto» dejó de cumplirse ahí. Si el chat no ve las reuniones que el CSE eligió ni sus notas,
> nadie las ve en ese camino.

- **Una sola puerta, con presupuesto propio.** El chat lee las reuniones elegidas (con sus minutas),
  las notas y las «Instrucciones adicionales» del cronograma por `materialDelCronograma`
  (lib/asistente/contexto.ts) → `cargarMaterialParaElChat` (lib/contexto/cargar.ts). Usa el mismo
  cargador que los agentes con `PRESUPUESTO_DEL_CHAT`: 24 lecturas y 16.000 caracteres de reuniones
  (los agentes usan 60 y 48.000 desde el 2026-09-24), el mismo tope de notas y un techo duro de 42.000 para el bloque
  entero. Las reuniones van sin su lugar en el plan, así el bloque no cambia cuando se mueve una fase.
  Los cargadores de los agentes siguen prohibidos en lib/asistente (contexto.test.ts), y el handoff,
  los kickoffs y las reuniones no elegidas siguen afuera. Si la lectura falla, el chat contesta
  solo con el cronograma y la pantalla lo dice en ámbar. El modelo también lo sabe: en el lugar del
  material va `AVISO_DEL_MATERIAL_ILEGIBLE`, así no le pide al CSE elegir lo que ya eligió
  (revisión del 2026-09-24).
- **Su propio bloque cacheado y tres breakpoints.** El material va entre el prompt y el contexto,
  en su propio bloque del `system`. Hay un breakpoint en cada frontera entre cosas que cambian a
  distinto ritmo: el prompt (~13.700 caracteres, igual para todos los hilos), el material (cambia
  cuando el CSE toca lo elegido) y el contexto (cambia con cada apply). Aplicar no vuelve a cobrar
  ni el material ni el prompt. Son 3 de los 4 que permite la API. La premisa vieja de un solo
  breakpoint (el prompt medía ~700 tokens y no llegaba al mínimo cacheable) ya no valía.
- **La frontera va dos veces: en el rótulo y en la línea.** El rótulo del bloque le dice que lo que
  escribe en `titulo` y `nombre` lo lee el cliente, reusa `FRONTERA_DEL_MATERIAL` de los agentes y
  aclara que el material es información, no pedidos. Además, la línea del acuerdo que repite una
  frase del material, o trae un monto, una fecha, un plazo o un correo, termina en «⚠ revisa…»
  (`lineasConFrontera`, con el mismo detector que los previews del detalle). Solo avisa: el CSE la
  desmarca o pide otro título antes de aplicar. El bloque de pendientes que lee el modelo sale del
  mismo traductor, con la marca incluida (`lineasParaLosDosLectores`).
- **Los rótulos de las reuniones y las notas del chat no nombran el handoff.** Son los de los
  agentes con `lector: "chat"`: el chat no tiene el handoff, y el orden de peso de la conversación
  (lo que pide el CSE > sus instrucciones > reuniones y notas, lo más reciente gana) va en la
  cabecera del bloque. «Información, no pedidos» vale para las reuniones y las notas, no para las
  instrucciones adicionales (revisión del 2026-09-24).
- **Las instrucciones adicionales las respeta, pero en el chat manda el CSE.** Si un pedido las
  contradice, lo dice en una línea y hace lo que le pidieron. No señala contradicciones por su
  cuenta. Para rehacer todo dice lo que dice la línea «PARA REHACER TODO» del contexto
  (`lineaParaRehacerTodo`), con las condiciones de la pantalla: «Generar cronograma» sin tareas de
  la IA y nunca publicado (una propuesta solo de fases no lo esconde); «Regenerar todo el
  cronograma» con tareas de la IA y sin propuesta pendiente; publicado sin tareas de la IA, ningún
  botón. El permiso y una vista previa en pantalla van como condición, porque el servidor no los
  ve (revisión del 2026-09-24).
- **Sin material, el bloque no existe; el pedido igual cambió.** Sin reuniones elegidas, sin notas y
  sin instrucciones no va el bloque del material. Pero en todo chat del cronograma, haya material o
  no, el prompt suma las reglas de las reuniones y las notas, y el contexto la línea «PARA REHACER
  TODO» y el encabezado nuevo de las reglas duras. (Hasta la revisión del 2026-09-24 esto decía
  «sin material no cambia qué ve el modelo», y no era cierto.)
- **Se descartó la lectura a pedido con una segunda herramienta.** Rompe la regla de una sola
  herramienta por pedido (turno.test.ts), suma una segunda llamada al modelo en el turno y deja
  contestar desde un índice de títulos, sin haber leído la reunión.

## El material del cronograma: 48.000 caracteres de reuniones y los compromisos primero (2026-09-24)

> Hallazgo de la validación A3: con las 8 reuniones elegidas de CAV, las 8 entraban recortadas y 7
> perdían parte de lo PRINCIPAL. Un acuerdo escrito al final del resumen no le llegaba al revisor.

- **El tope de reuniones de los agentes sube de 32.000 a 48.000** (`TOPE_REUNIONES_CRONOGRAMA`;
  `MAX_REUNIONES_A_LEER` de 40 a 60, para seguir llenando el tope con el piso). Medido solo lectura:
  lo principal de las 8 de CAV suma 37.992 caracteres; con 48.000 entra entero en las 8. En las 2.757
  reuniones con resumen del último año, lo principal mide 1.871 en la mediana y 4.976 en el p90;
  eligiendo 12 al azar, no entra entero el 37,7 % de las veces con 32.000 y el 0,2 % con 48.000.
  Costo: en CAV entran 14.641 caracteres más (~4.550 tokens a 3,2 caracteres por token, medido en
  la A3), ~US$0,014 por llamada con Sonnet 4.6, y solo cuando lo elegido llena el espacio. Es la
  misma cifra del comentario de `TOPE_REUNIONES_CRONOGRAMA`. Lo pagan el revisor de fases
  y el detalle. **El chat no cambia**: sigue con 16.000 (`PRESUPUESTO_DEL_CHAT`),
  porque lo paga en cada turno.
- **Los compromisos de Fireflies van antes de su overview**, como Gemini ya ponía Decisiones y
  Próximos pasos primero: lo que se recorta es el final, y lo acordado no puede ser lo primero en irse.
  El overview, que no trae encabezados, va entonces bajo «**Resumen:**» (y también detrás de la
  minuta revisada): pegado sin rótulo debajo de los compromisos, lo conversado se leía como un
  compromiso más, y solo lo acordado cambia el plan (revisión del 2026-09-24).
- **«Si eliges menos…» solo cuando las reuniones compiten por el espacio** (`porFaltaDeEspacio` del
  informe). Una agendada o una vacía no le quitan espacio a nadie, y la que corta el techo por reunión
  entra igual de cortada aunque quede sola.

## Contexto del cronograma — lo que dejó la revisión adversarial (2026-09-24)

> Cinco commits (8f305d53, 2acde895, a04346f9, e6fbf553 y el de los textos). Lo que cambia para el
> negocio, en el orden en que lo nota el CSE.

- **SUPERSEDED 2026-09 (E2b–E4):** toda propuesta guarda el `desde` de cada cambio (E1–E4).
  **La propuesta de fases de las reuniones guarda QUÉ cambia, no una foto.** Lo que el CSE edita
  mientras la propuesta espera (una nota, un nombre, otra duración, el orden) ya no vuelve como
  «sugerencia» de revertirlo; el paso 1 espera el autoguardado en vuelo antes de leer la base.
- **El handoff no pisa la propuesta de las reuniones**: lo elegido por el CSE pesa más. Quien
  regenera el handoff lo ve en el aviso de siempre y vuelve a generarlo cuando se decida. Aplicar o
  descartar exige que la propuesta guardada sea la que el CSE tiene enfrente (409 si es otra).
- **SUPERSEDED 2026-09 (E2b–E4):** el chat edita la propuesta (E3).
  **Con cambios de fases sin decidir, ningún otro cambio con IA se aplica** (el chat, «IA» de una
  fase, el acuerdo viejo del chat), y el chat lo sabe antes de armar la lista. Un 409 del paso 1 ya
  no corre el detalle pago: trae la propuesta pendiente y espera.
- **Las «Instrucciones adicionales» solas también disparan la revisión de fases** (son la fuente de
  más peso): una llamada corta más en «Regenerar todo» para esos proyectos.
- **Desarrollo y Web no tienen Semana 0**: su primera fase se revisa como cualquier otra. Todo lo
  ACORDADO que el armador no puede proponer (lo intocable, acortar trabajo empezado, un renombre que
  no entra) queda como observación, y se ve aunque el paso 2 falle.
- **Un plazo total se compara contra el cierre ACTUAL**: el fijado a mano si lo hay (el que ve el
  CSE), u hoy si el planificado ya pasó con fases sin terminar. Un plazo contado desde hoy («nos
  quedan 6 semanas») se pasa a semanas del proyecto sumándole la de hoy.
- **Una nota vale por la fecha de sus HECHOS** (la que diga su título o su texto; la de carga solo si
  no dice ninguna), y al pasar el tope ganan espacio las notas más nuevas: las viejas que no entran
  se nombran. Guardar la fecha de los hechos por nota sería un cambio de esquema: no se hizo.
- **Sin buscar, el calendario no ofrece reuniones sin dueño** (se ofrecen solo buscando, como decidió
  MIN_BUSQUEDA_SIN_DUENIO): «Agregar y asignar» es una escritura durable que la X no revierte.
- **Regenerar UNA fase que una reunión da por resuelta igual la detalla**: pedirla manda.
- **Todo el texto para el modelo del cronograma va en tuteo** (el encabezado de las instrucciones y el
  mensaje del detalle estaban en voseo), y la guarda de tuteo caza el voseo por su forma, no por una
  lista cerrada.

## Se retira «Pedir cambio con IA»: todo cambio con IA del cronograma pasa por el chat (2026-09, E4)

> Decisión de Elías (respuesta 3 del 2026-09-24). Convivían dos formas de pedirle un cambio a la IA:
> el chat, que acuerda operaciones que se leen antes de aplicar, y el modificador, que reescribía el
> cronograma entero (de 2 a 4 minutos) y se revisaba en una vista previa en memoria. Con una sola
> propuesta (E1–E3), esa vista previa era una segunda forma de revisar.

- **El chat cubre lo que hacía el modificador:** su vocabulario de operaciones más `fase.nota`, la
  nota de la fase que lee el cliente, que no tenía otro camino (`updatePhase` no la acepta). Sin
  propuesta abierta aplica con un clic; con una, lo pasa a la propuesta.
- **Solo reescribe una nota que leyó entera:** la de la fase señalada con «IA», que le llega completa
  en ese turno, o la de una fase que no tiene nota. Lo que no cumple no se registra y se dice. Es el
  mismo criterio que el tope de lectura de las secciones de los documentos.
- **Lo que queda fuera del chat, a propósito:** las sesiones estimadas (a mano en el Gantt, mientras
  la fase no arrancó), la nota de una tarea (a mano, no la ve el cliente) y armar tareas a partir de
  lo vendido («Regenerar» de la fase o «Generar cronograma», que leen el handoff; un enfoque va en
  «Instrucciones adicionales»). El chat no lee el handoff.
- **El «IA» de cada fase abre el chat con esa fase señalada** («Sobre la fase «X»»). La línea
  `[SOBRE LA FASE «X» [id]]` va en el texto; la nota completa se adjunta solo a ese turno, en los
  mensajes, nunca en el prefijo cacheado. Es una pista, no un límite. El cronograma monta su propio
  proveedor del chip: el del panel abre el cajón de los documentos, que en el cronograma no está, y
  dejaba colar el chip de otro documento.
- **Cambiar la nota por chat pide editar el cronograma**, lo mismo que renombrar una fase y que
  aplicar una nota que propone el handoff.
- **Quitar una fase por chat sin propuesta abierta sigue borrando sus tareas**, con doble
  confirmación y ⚠ en la línea. Con una propuesta abierta, lo hecho se queda (E3). El modificador la
  devolvía con lo hecho: esa diferencia se pierde.
- **`agent-timeline-assist` queda retirado por nombre** (`lib/agents/retirados.ts`): /analyze no lo
  despacha ni por id ni por su respaldo sin paso, aunque su fila siga activa. No se vuelve a sembrar.
- **Una propuesta guardada que esta versión no sabe leer no traba nada:** una línea arriba del Gantt
  ofrece «Descartarla» y el cronograma sigue editable (antes, la vista previa lo congelaba).
  Descartarla pide confirmación («lo que proponía se pierde de la pantalla»), y el servidor guarda
  una copia del JSON en `TimelineChange` en la misma transacción que la limpia. El chat manda a
  descartarla arriba del Gantt; no promete una barra ni «Aplicar».
- **Lo que se pierde:** la cuenta de cuántas propuestas del modificador se aplicaban (su historia
  sigue en `AgentRun`), y los acuerdos del chat de antes del 2026-08-20 que traían solo una
  instrucción: su botón pide que se vuelva a pedir.

## El cronograma tiene UNA sola propuesta, que se revisa en un solo lugar (2026-09, E1–E4)

> Decisión de Elías (respuestas del 2026-09-24). Convivían cuatro formas de revisar una propuesta
> (las sugerencias una por una, el modal de «Regenerar» de una fase, el acordeón de «Regenerar
> todo» y la vista previa de «Pedir cambio con IA»), cada una con su ruta de aplicar, y ninguna
> sabía qué había visto el CSE.

- **Una propuesta por proyecto, guardada en el servidor** (`pendingProposal`, formato
  `borrador-v1`, sin SQL; lib/timeline/borrador.ts). Guarda QUÉ cambia, y cada cambio trae su
  `desde`, fijado una vez al crearse contra lo que leyó quien la produjo. La dejan el handoff,
  «Generar cronograma», «Regenerar todo», «Regenerar» de una fase, el recálculo de tareas y el chat.
- **Lo que el CSE cambió a mano después queda fuera, con ⚠**, y «Aplicar todo» aplica solo lo
  limpio. Con una propuesta abierta se puede seguir editando a mano (respuesta 2). Lo desmarcado
  vive en la propuesta (`excluidos`) y se ve en cualquier computadora.
- **Decide el servidor.** Aplicar es una transacción: token, versión obligatoria, el plan calculado
  con la misma función que la pantalla, y la huella. Si no es la lista que viste, responde 409 y no
  escribe nada.
- **Una propuesta abierta no se pisa.** El handoff avisa a quien regeneró (respuesta 1), y tampoco
  pisa lo que no sabe leer. El guardado con motivo responde 409. «Subir al cliente» queda libre,
  con aviso (respuesta 4).
- **Tareas:** nunca se parchea la foto publicada; lo que tiene avance o se escribió a mano no se
  quita; una tarea idéntica no se recrea.
- **El formato viejo ya no existe en la base** (E4 P4): el lector lo trata como algo que no sabe
  leer, y la pantalla ofrece descartarlo. Las propuestas del handoff que seguían abiertas (6 al
  2026-09-25, contadas en seco) se convierten con `scripts/propuestas-abiertas.ts`, con respaldo en
  `backups/<fecha>-propuestas-abiertas/`. La conversión es contra el cronograma del día en que se
  crearon, reconstruido con `TimelineEvent`, así que lo editado a mano después queda como choque y
  las copias viejas desaparecen. `ProposalLike` queda solo como el formato intermedio del handoff y
  del paso 1: se convierte una vez y nunca se guarda.
- **Orden en producción** (decisión de Elías, revisión de E4): el deploy de siempre con todo main
  (E2b y E4 P1–P4 juntos) y, justo después, `--convertir-viejas` en seco, `--convertir-viejas
  --apply` y `--antes-de-e4`, que tiene que dar verde. Con E2b y P1 vivos se cumple lo que la
  conversión necesita: la valla de versión (D19) y el handoff que ya escribe `borrador-v1`. En el
  rato entre el deploy y la conversión las viejas se ven como «no se sabe leer»: descartarlas pide
  confirmación y deja copia, y una pestaña abierta desde antes cambia la línea por la convertida al
  volver a ella (el DELETE de lo ilegible sobre algo ya convertido responde 409 y no borra).
- **`--deshacer-conversion`** devuelve solo las filas que la conversión escribió (el respaldo lo
  anota fila por fila) y solo si siguen como las dejó: la convertida con su token, o vacía con el
  `updatedAt` que le dejó la limpieza. Con P4 ya desplegado, lo devuelto vuelve al formato viejo: se
  ve como «no se sabe leer» y solo se puede descartar. Sirve para no perder el dato, no para volver
  a revisarlas.
- **La foto se fue:** solo servía para convertir el formato viejo. Lo desmarcado que recordaba el
  navegador se sigue leyendo (misma clave), sin la foto.
- **Rutas que se fueron:** `proposal/apply-items`, `phases/[phaseId]/apply` y `detail/apply-all`
  (y sus guards, `guardTimelineDetailApply` y `guardTimelineFullRegen`). /analyze sigue rechazando
  el agente de detalle sin `borrador` antes de crear la corrida.

## La propuesta del cronograma se decide en el Gantt: qué calcula el código y qué dice la IA (2026-09-26, L1–L7)

> Pedido de Elías probando «Regenerar todo» en Wherex (producción en eb42ab0c): parecían dos propuestas
> y las tareas de la barra no coincidían con las del Gantt; quería ver todos los cambios de una en el
> Gantt, con colores; un mensaje arriba que dijera cómo estaba, cómo queda y por qué, también contra el
> handoff; y que el chat dijera al abrirse que cambia la propuesta. Siete entregas, cada una se despliega
> sola, sin SQL, sin re-siembras y sin tocar prompts guardados en la base: L1 c744ae1c · L2 19453cf3 ·
> L3 483f6102, b9d1eead, 671e299d y 1eaea657 · L4 d95d5534 · L5 40a9c14a · L6 2046dbaf · L7 15535589 ·
> revisión de L1–L7 2dfd4656. Las D1–D15 son las de la spec, citadas en esos commits.

- **Las cuatro decisiones de Elías (2026-09-26).** (1) Los cambios se deciden **en el Gantt**, cada fila
  con su casilla; arriba solo el mensaje, los totales y «Aplicar» (L3). (2) Las tareas HECHAS en la fase
  equivocada: la IA propone mudarlas **desmarcadas**, con su check y su fecha (L7). (3) Las semanas de más
  se dicen **contra lo prometido** (la última versión subida al cliente) **y contra el último handoff**
  (aproximado: sale de su última corrida) (L4). (4) Sin material nuevo para una fase, la IA **conserva las
  pendientes que sirven** y propone solo lo que cambia (L5).
- **Defaults tomados (vetables).** Una tarea nueva en una semana que ya pasó: el plan decía un chip ámbar
  «quedaría atrasada» en la fila; quedó «ya pasó» en rojo, una vez en el rótulo de la semana, y la cuenta
  «hoy N → con la propuesta M» en el mensaje (el ámbar quedó para «se quita» y «revisa», D13). «Regenerar
  todo» sigue sin quitar fases: eso es del chat, con doble confirmación. Las mediciones que regeneran
  Wherex en producción las corre Elías desde la pantalla, después del deploy (3 «Regenerar todo» para L5 y
  5 para L6, menos de US$0,6). Y tres de la spec: el campo «inicia S» pasa a base 0 (D4), el chat no edita
  una hecha con una mudanza sugerida abierta (L7) y la propuesta entra plegada si pasa de 40 filas (L3).
- **Los números los pone el código, nunca la IA.** Las cuentas de la pantalla y del chat salen de
  `resumir` (lib/timeline/borrador.ts), nunca de contar `borrador.cambios`: contando los cambios crudos, la
  primera versión de la spec decía 74 tareas nuevas y 186 filas en Wherex, y eran 73 y 185 (una nueva «ya
  está»). Las dos llamadas nuevas a Haiku (L6 y L7) devuelven ids y, la de L6, una frase sin cifras.
- **Vuelta atrás sin romper nada.** La versión anterior sabe leer lo que estas escriben: `explicacion` es
  un campo suelto de la propuesta; `sugerida` se ignora y queda como una mudanza desmarcada; un cambio de
  semana de la IA (L5) se aplicaría como edición de una persona (`source` MODIFIED), sin riesgo para el
  avance. La huella de la propuesta no cambió en ninguna entrega.
- **En producción:** el deploy de siempre (`bash scripts/deploy.sh`), sin SQL ni re-siembra. Antes,
  `scripts/probar-asistente.ts` con y sin propuesta: L3 cambió la numeración y la base de «S» que lee el
  modelo, y la revisión cambió el prompt del chat (su caché se rehace una vez).

### L1 · El chat dice qué edita (c744ae1c)

- **Un aviso fijo por estado, visible aunque haya historial** (`estadoParaElChat` y `avisoDelChat`,
  lib/timeline/apertura-del-chat.ts): editable, armando, recalculando, solo lectura, versión nueva,
  ilegible, vacía que falló y sin propuesta. Cada variante que no se puede editar dice cómo salir
  («recarga la página», «descártala arriba del Gantt»). *Por qué:* con una conversación vieja, nada decía
  que lo nuevo editaba la propuesta y no el cronograma vigente. «Cambia la propuesta» se dice una sola vez,
  en el aviso. *Lo revertiría:* que el chat vuelva a editar el vigente con una propuesta abierta.
- **La divisoria y la bienvenida solo se pintan: nunca se guardan como turno ni viajan al POST.**
  Guardadas, entrarían al contexto del modelo y romperían la caché del prefijo. Los ejemplos de la
  bienvenida salen de la propuesta de verdad (su primer número, la fase con más nuevas), nunca de un
  nombre fijo.
- **«El cliente no ve nada hasta que subas el cronograma» (D15, `LINEA_DEL_CLIENTE`).** Decía «hasta que
  apliques» y daba a entender que aplicar publica: el cliente ve la foto que se congela al «Subir».
  *Lo revertiría:* que aplicar pase a publicar.
- **Con la propuesta vacía que falló, el botón del chat no ofrece un clic que el servidor rechaza**
  (`MOTIVOS_DEL_CHAT.vacioFallido`, contra el 409 `CHAT_CON_EL_VACIO_FALLIDO`).
- **«Lo que se acordó» del cronograma va con viñetas**: el único «12.» en pantalla es el número del
  Gantt. Los documentos siguen numerados.

### L2 · La propuesta aparece entera cuando termina de armarse (19453cf3)

- **Mientras el paso 2 arma las tareas no hay propuesta en pantalla (D10)** (`modoDeLaPropuesta`): el
  Gantt es el de hoy, editable, con una línea «Armando la propuesta…» y «Descartar». *Por qué:* la barra a
  medias («Piloto Circle · Sin tareas») mostraba números que se corrían al llegar las tareas. El costo: lo
  que el CSE edita mientras tanto queda fuera de la propuesta, y el `title` de la línea lo dice. El
  servidor sigue aceptando casillas; solo la pantalla deja de ofrecerlas. *Lo revertiría:* querer decidir
  las fases antes de que lleguen las tareas.
- **El chat no recibe «LOS CAMBIOS» mientras se arma**: no hay números en pantalla que citar.
- **Si el CSE está escribiendo cuando llega, la barra aparece en «antes»**: el Gantt no cambia bajo el
  cursor, y el aviso dice cómo verla. Lo decide el hook en el mismo render (revisión: el efecto del canvas
  corría con el campo ya desmontado).
- **La espera no repite la fase del motor**: «Analizando sesiones…» mentía con 0 reuniones.

### L3 · Las casillas viven en el Gantt (483f6102 P3a, b9d1eead P3b, 671e299d P3c, 1eaea657 P3d)

- **La lista numerada de la barra se fue** (TareasDeLaPropuesta.tsx, borrado): era la «segunda propuesta»
  que veía Elías. Lo fijo de la barra es una línea: el título, «Siguiente número» (atajos n y p, nunca
  mientras se escribe), «Ver como estaba antes» y «Aplicar»; debajo, «Aplicas N de M cambios».
- **Ninguna fila cambia de lugar al tocar su casilla (D1).** La casilla de cada cambio de tarea vive en
  una sola fila, la de su lugar de hoy, con un verbo que no cambia al marcar («Crear», «Quitar», «Pasar a
  Semana 3», «¿Mover a «X»?»). El destino de una mudanza lleva «viene de…» sin casilla: un Tab por cambio.
  Lo que no va a existir se pinta fantasma en su lugar, y cada semana tiene un orden fijo (las vivas, los
  destinos, las nuevas). La única excepción: una fase que cambia de duración acota las semanas de sus
  tareas. *Por qué:* una fila que salta al marcarla hace perder el lugar y el foco.
- **Las marcas van en un mapa aparte; `proyeccion.fases[].tareas` no cambia (D2).** La leen la guarda «lo
  escrito es lo que se mostraba», el contexto del chat, sus operaciones y el cierre.
- **Una sola numeración, que no cambia al marcar (D3)** (`numeracionDeLaPropuesta`): el arranque y el
  orden; después fase por fase, en el orden completo de la propuesta, sus campos (lo que mueve fechas
  primero) y al final su grupo de tareas. La usan el Gantt, la barra, los choques del plan y el chat: «deja
  el 12 como estaba» apunta a lo que se ve. `ItemDelPlan.numero` y la huella no cambian, así una pestaña
  abierta durante el deploy sigue aplicando. En pantalla, «número» es lo que cita el chat y «cambio», cada
  casilla.
- **Una sola base para «S» (D4):** «S3» es la columna S3 de la cabecera del Gantt (S0 = la primera
  semana), en el chip del inicio, en la vista, en el chat y en el campo «inicia S» (`etiquetaDeSemana`,
  lib/timeline/weeks.ts). Lo guardado no cambia: `startWeek` ya era base 0. *Por qué:* el mismo cambio se
  leía «S3 → S5», «S4 → S6» e «inicia S 4». Los textos en palabras para la IA («semana N del proyecto»)
  siguen desde 1. Guarda: lib/timeline/semana-unica.test.ts.
- **Qué dice cada tono (D13), nunca el color solo:** verde, lo nuevo; azul, lo que cambia o llega; ámbar,
  lo que se quita y lo que hay que revisar; rojo, lo atrasado hoy y «ya pasó»; fantasma (cursiva y borde
  punteado), lo que no va a existir así; normal, lo que queda, **incluidas las hechas, con su check y sin
  tachar**. Tachado solo en lo que se quita. *Por qué:* la crítica encontró el ámbar con cuatro sentidos y
  el gris con tres, y el origen de una mudanza tachado se leía como «se borra».
- **«Atrasada» solo en lo que existe hoy y se queda en su semana.** Una nueva en una semana vencida no la
  lleva: su semana dice «ya pasó» y la cuenta va en el mensaje (L4).
- **La propuesta grande entra plegada** (más de 40 filas de tareas; Wherex tiene 185): las filas de fase
  ya muestran cada número con su casilla. Una chica entra con sus fases con cambios abiertas.
- **El fixture de la propuesta grande se LEE con fs, nunca se importa**
  (`lib/timeline/__fixtures__/propuesta-grande.json`, anonimizado y con lista blanca). Con
  `resolveJsonModule`, un import le haría inferir a `next build` un tipo literal de ~200 KB en la etapa
  que murió por memoria el 26-sep.

### L4 · El mensaje de arriba, con los números del código (d95d5534)

- **El título dice qué cambia; los totales, qué se aplica (D7).** El nivel se calcula sobre la propuesta
  ENTERA, así no salta al tocar casillas: «Primer cronograma», «Cronograma casi nuevo», «Rehace casi todas
  las pendientes» (se quita el 60 % o más de las pendientes), «Cambia parte del cronograma», «Ajuste
  chico». Ámbar solo en «casi todo». `evaluarMagnitud` y sus umbrales no se tocaron.
- **El orden: el cierre y su causa, contra lo prometido y el handoff, las tareas, las fuentes, las
  atrasadas.** Hasta 5 líneas de 140 caracteres, con los nombres de fase cortados a 28. Se descartó el
  tope de 120: cortaba la causa del cierre, que es lo que Elías pidió ver.
- **«Lo prometido» es lo último que se subió al cliente (D5):** `publishedSnapshot` validado, con la fecha
  de `timelinePublishedAt`. No la baseline. Sin publicar, no hay esa comparación.
- **«El último handoff» es aproximado y siempre lo dice (D6):** las fases de la salida de su última
  corrida DONE (`whereCorridasDeDocumento(projectId, "handoff")`), validadas con `fasesDelHandoff`, la
  misma función que usa analyze. En caché por token (50 propuestas, 5 minutos, sin recordar un null):
  `AgentRun` no tiene índice por proyecto y su `output` pesa hasta ~150 KB. *Lo revertiría:* que el GET
  pase de 50 ms aun con caché; entonces el cálculo se muda a la creación de la propuesta (un campo
  suelto), sin tabla nueva.
- **El atraso se dice como estaba y como queda:** «Atrasadas: hoy 59 → con la propuesta 67». Un solo
  número («59 quedan atrasadas») se leía como que la propuesta creaba un atraso que ya existía.
- **Los atrasos cargados van en una frase aparte, nunca como causa**, y cuentan solo los posteriores a lo
  prometido.
- **El motivo que escribe la IA en el paso 1 es un chip solo si calza con una fuente real**
  (`fuenteDelMotivo`); si no, «Según la IA: …». Nunca se copia al mensaje.
- **«La IA no tuvo reuniones ni notas: armó las tareas sin saber qué pasó en el proyecto»**, solo cuando
  sus corridas no tuvieron ninguna. No dice «solo leyó tus instrucciones»: el paso 2 lee también el
  handoff y el cronograma. (La revisión le sacó el «No elegiste…»: no culpa al CSE.)

### L5 · La IA deja quieto lo terminado y no reescribe por reescribir (40a9c14a)

- **R12: en «Regenerar todo», una fase TERMINADA no recibe ni pierde tareas** (`respetarTerminadas`,
  lib/timeline/tareas-del-detalle.ts). **Solo ahí (D11):** al regenerar una fase y en el recálculo manda
  «lo que ya se hizo va como tarea» (`EXCEPCION_DE_LA_FASE_A_REGENERAR`), y decir «lo hecho no se vuelve a
  proponer» chocaría con eso, el mismo conflicto que arregló la revisión del 24-sep. Una fase que el CSE
  da por terminada pero sigue PENDIENTE (Service Hub en Wherex) no está protegida: depende del modelo.
- **R4c: una tarea que vuelve con el mismo título completo es la misma tarea** (decisión 4). Primero en
  su semana; en otra, solo si hay una de cada lado con ese título. Si semana, dueño y tipo son iguales no
  sale nada; si no, un cambio con solo lo que difiere. Se compara el título entero (`huellaCompleta`), no
  la huella de 60 caracteres, que emparejaba «…para ventas» con «…para postventa». Wherex, simulado con el
  código real sobre la misma salida: 130 cambios de tareas → 110, y atrasadas 59 → 59.
- **Una nota distinta en un par igual se pierde a propósito, y se dice (D12):** se queda la de hoy y una
  observación cuenta cuántas (Wherex: 8). `tarea-cambia` no lleva nota.
- **Lo que decide la IA no se hace pasar por una persona (D14):** el escritor y la proyección marcan una
  tarea como tocada a mano (MODIFIED, sin «por validar») solo con `porChat`. El chat, ante un cambio de la
  IA, parte de la tarea de hoy y hereda lo de la IA solo si su casilla está marcada; si lo pedido la deja
  como hoy, la desmarca, no la borra.
- **El paso 2 lee lo que ya hay** (`loQueYaHay`, en código, no en la base): el estado de cada fase, lo
  hecho, las pendientes y lo que notó el paso 1. Sin él, el mensaje es byte a byte el de antes. En Wherex
  suma ~2.000 tokens.
- *Lo revertiría:* la medición (3 «Regenerar todo» en Wherex): si «Migración Salesforce» recibe tareas o
  las que cambian pasan de ~10.

### L6 · El porqué, solo con fuentes NUEVAS (2046dbaf)

- **Una fase dice por qué solo si una fuente nueva la nombra.** Nueva contra la última generación
  APLICADA (D8, `detailGeneratedByAgentRunId`); sin generación aplicada, todo cuenta como nuevo. *Por qué:*
  con todo el material a mano, el modelo justificaba cualquier cambio después de hecho.
- **Nombrar es por palabra completa (D9):** huellas sin tildes, con límites de palabra (`\b` de JS no
  sirve con tildes), así «CS» no calza en «CSV». Un falso negativo cuesta una frase; un falso positivo es
  una mentira con chip.
- **La IA devuelve ids y una frase; el código valida y pone títulos, fechas y chips.** Se descarta la
  frase con cifras, palabras de número, meses, comillas o voseo, o sin una fuente de la lista. Sin fuentes
  nuevas no se llama al modelo. Sin frase no hay línea en la fase, y «Más» lo dice una vez.
- **Se pide antes de escribir la fusión y va en la MISMA escritura**, con un tope de 15 s que nunca tira,
  una sola vez por fusión y bajo el tope diario (agotado, no hay frase y la propuesta se escribe igual).
  La huella de la explicación sale de la lista que se escribe: si el chat edita la propuesta después, la
  frase dice «(de cuando se generó)». *Por qué:* escrita aparte, la frase se perdía o no llegaba.
- **`fuentesDeLaGeneracion` va en el `output` de la corrida**: lo que esa corrida leyó, no lo que hay hoy.
- *Lo revertiría:* la medición (5 «Regenerar todo»). Si Haiku escribe mal en más de 2 de 5,
  `claude-sonnet-4-6` (~US$0,016 por llamada).

### L7 · Hechas en la fase equivocada (15535589)

- **La IA sugiere mudar hechas, y nacen DESMARCADAS** (decisión 2): un `tarea-cambia` con
  `sugerida: "otra-fase"`. Marcada y aplicada, la tarea se muda sin tocar su estado, `statusSource` ni sus
  fechas.
  *Por qué:* una tarea con avance nunca cambia de estado ni se mueve sin su casilla.
- **Se agrupa y se numera en su fase de ORIGEN**, con «¿Mover a «X»?»: el número no depende de la marca.
  Marcada, queda fantasma sin tachar en el origen y «viene de» en el destino. La casilla del grupo y
  «recupera el N» del chat no la marcan.
- **Los totales no la cuentan hasta que se marca** («· 5 mudanzas sugeridas sin marcar»): contada, se
  leía como 5 cambios desmarcados a mano.
- **Las fusiones la conservan y el chat no la edita.** El chat sí la marca o la desmarca («muévela a
  «Y»», «déjala donde está»), y quitar o repartir semanas por chat no se traba por ella (revisión).
- **Corre en paralelo con el porqué de L6, en el mismo paso 2, solo en «Regenerar todo»**: Haiku, 600
  tokens, 15 s, sin reintentos, medido como `hechas-fuera-de-lugar`. Sin hechas que mirar no llama.
- *Lo revertiría:* destinos malos seguidos. El peor caso es un destino malo, que llega desmarcado.

## Lo que ya pasó y lo atrasado en «Regenerar todo» (2026-09-27, M1–M5)

> Pedido de Elías probando «Regenerar todo» en Wherex: la propuesta reescribía el pasado (quitaba 50
> tareas y sumaba 59 en semanas vencidas), repetía el kickoff y no decía qué hacer con lo atrasado.
> Cuatro deploys: M1 b9609283 · M2 64b667ad, 9743b2ac y 2ba6a389 · **M3 + M4 juntas** (a0ee2e89,
> fa1ff3d4, 5a24a71d, 77f08a57 y P4g–P4h) · M5. Ninguno trae SQL **propio**, re-siembra ni cambios de
> infraestructura, y ninguno toca un prompt guardado en la base. Las D1–D13 son las de la spec del
> replanteo, citadas en esos commits.
>
> ⚠ **Pero el deploy SÍ lleva SQL** (revisión de M1–M5, 2026-09-27). La historia es lineal y
> `scripts/deploy.sh` despliega la punta de `origin/main`: **desde 2ba6a389 (la última parte de M2),
> cada deploy arrastra 21f50c23** (otra sesión: `Project.handoffResumen` y `handoffResumenAt`). Antes
> del deploy va `ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-27-handoff-resumen.sql`;
> si no, la sección de handoff de todos los proyectos falla con «column … does not exist», y el
> healthcheck no lo ve (dice «DEPLOY OK»). Y desde d996cb39 (Escala, otra sesión), también
> `scripts/sql/2026-09-27-escala-lector-y-comentarios.sql`, antes del deploy. M1 se despliega sin SQL
> solo empujando exactamente b9609283.

- **Lo que decidió Elías.** (a) Lo pendiente de semanas que ya pasaron se **avisa**, no se reescribe:
  «revisar solamente que no haya quedado algo importante sin hacer». (b) Una fase atrasada se
  **reprograma desde hoy**: «lo que falta arranca en la semana actual»; el 27-09 eligió que lo que no
  empezó arranque **en el orden del plan** (espera a lo que le falta a la fase que iba antes). (c) **Un
  interruptor** para volver: «la práctica nos lo dirá». (d) **Hitos únicos**: un kickoff por proyecto;
  cierre y entrega, una vez (la entrega, una por ciclo en un recurrente).
- **Cada fase cae en una sola regla (D1):**

  | La fase | Regla | Qué hace la propuesta |
  |---|---|---|
  | Semana 0 (solo si el pipeline la tiene) | (a) avisar | nada; nombra lo que quedó sin hacer |
  | En curso (su ventana incluye hoy) | (a) avisar | nada con lo vencido (M5: `traer-a-hoy`, apagada) |
  | Casi terminada (≤ 2 abiertas y ≥ 70 % hecha) con la ventana cerrada | (a) avisar | nada; nombra lo que falta |
  | Ventana cerrada y sigue abierta | (b) reprogramar desde hoy | una casilla por fase |
  | Hecha o suspendida | — | nada |

- **Lo empezado no cambia de inicio ni lleva lo hecho al futuro:** se estira y lo que le falta arranca
  hoy. Lo que no empezó se mueve entero. Una tarea hecha o suspendida nunca cambia de semana, con
  cualquier combinación de casillas (lo prueban las invariantes de `reprogramar-desde-hoy.test.ts`).
- **Revierte la decisión del 23-09 («un atraso no alarga la fase») solo para el sistema.** La
  reprogramación la hace el código (`lib/timeline/reprogramar-desde-hoy.ts`) antes del paso 2; el prompt
  del paso 1 no cambió ni un carácter (su sha vive en la guarda G9 de
  `lib/timeline/propuesta-de-estructura.test.ts`). Lo del sistema lleva su marca (`desdeHoy`,
  `delSistema`) y nunca se presenta como de la IA.
- **Alargar una fase no es alcance (D12).** `weeksDelta` de la cartera (`lib/portfolio/summary.ts`) son
  las semanas de las fases agregadas menos las de las quitadas; el alargue lo mide el cierre contra lo
  prometido. Sin esto, el primer «Aplicar» en Wherex subía su alcance de +8 a +50 semanas y el vigilante
  de riesgo lo leía como trabajo agregado. No está en el interruptor: volver a contarlo es una línea de
  `summary.ts`. *Lo revertiría:* que Elías quiera ver el alargue como alcance.
- **La medición** (Elías, después del deploy de M3 + M4, desde la pantalla y sin aplicar): 3 «Regenerar
  todo» en Wherex y, después de cada uno, `npx tsx scripts/medir-propuesta.ts Wherex` (solo lectura).
  Tienen que pasar las 8 condiciones: las 4 de M2 y, con el reloj de la propuesta, nada nuevo ni quitado
  en semanas vencidas, lo del sistema igual a lo que calcula el código, la línea 5 y nada hecho que se
  mueva.
- **Vuelta atrás sin romper nada.** `hoy`, `desdeHoy`, `fijaInicio`, `deLaIA`, `delSistema` e `hito`
  son campos sueltos que la versión anterior ignora; lo del sistema se vería con casilla y aplicaría bien.
  La huella de una propuesta sin campos nuevos no cambió.
- **Revisión de M1–M5 (2026-09-27), lo que cambió después de la revisión:**
  - **Lo que empezó después de la propuesta tampoco se mueve (D13 al aplicar).** Si entre la propuesta y
    «Aplicar» alguien marca hecha o en curso una tarea de una fase que el sistema movía entera, su casilla
    choca («Empezó después de la propuesta: no se mueve.»). Si la empezada es una contigua que lo marcado
    correría de rebote, se fija donde está hoy al aplicar, como el pin (`fijadasAlAplicar`). Decisión
    conservadora: se fija, no choca la casilla que la corre (el resto de lo marcado se aplica igual).
  - **Revisión 2: lo que venía detrás no vuelve atrás.** Las contiguas sin empezar que seguían a una fase
    que se queda (por su choque o fijada al aplicar) se fijan en el inicio que les daba la propuesta
    (`seguidorasAlAplicar`, sin casilla, en la huella solo si hay), con su línea: «Se fija su inicio en
    SN, como en la propuesta: lo que la precedía ya empezó y no se mueve.» Antes volvían a su lugar viejo:
    pendientes en semanas vencidas y un cierre antes del trabajo que el mismo «Aplicar» estira. Se eligió
    esto y no bloquear «Aplicar» hasta recalcular: recalcular es volver a generar la propuesta con la IA.
    La fijada dice «Ya empezó: se fija su inicio en SN y lo que se aplica no la corre.» (pudo empezar
    antes y correrla un pedido del chat), y el chat recibe ese aviso cuando lo que pidió no la corre.
  - **Revisión 3: la seguidora se fija solo cuando hace falta.** El «dónde la ponía la propuesta» da por
    hecho que la fase que se queda empezó DESPUÉS de la propuesta. Si ya estaba empezada y la corre algo
    que el CSE cambió luego (un pedido del chat, una casilla que desmarca), la pantalla la mostró siempre
    fija: la seguidora se corría más tarde, con un hueco, se escribía su inicio y su línea decía «como en
    la propuesta» sin serlo. Ahora: (1) la fijada al aplicar solo cuenta como «corrida en la propuesta» si
    la propuesta como se calculó (todo marcado, sin lo del chat) ya la movía; (2) la seguidora se fija
    solo si pegada a lo que la precede terminaría en una semana vencida y en la propuesta no, o si es el
    cierre y pegada arrancaría antes de que termine lo que lo precede. En cualquier otro caso sigue
    contigua, como antes de la revisión 2. Si un pedido del chat fija una seguidora, el aviso la nombra.
  - **La Semana 0 por su nombre en Desarrollo y Web.** Si la primera fase se llama «Semana 0» o «Semana
    cero», no se reprograma (5 de los 14 cronogramas activos de esos pipelines la tienen). «Relevamiento
    técnico» sigue reprogramándose. Solo el nombre exacto: un «Kick-off» no cuenta.
  - **Los hitos miran la última fase de lo vivo.** Si el paso 1 agrega una fase al final, el cierre y la
    entrega de la que era la última siguen siendo el hito y uno nuevo no entra. Y el modelo ya no recibe
    un hito que ya está como «pendiente: repite su título» (va en «se queda», con «hito»).
  - **Lo que el chat edita de una casilla del sistema pasa a ser del chat**, con su casilla y su número.
  - **Las reuniones se ubican en el plan vigente cuando ocurrieron** (sin lo reprogramado desde hoy).

### Para volver (el interruptor)

- **Cambia el valor en `lib/timeline/politica-de-atrasos.ts` (`POLITICA_DE_ATRASOS`) y despliega con
  `bash scripts/deploy.sh`.** El interruptor no trae SQL ni re-siembra (si ese deploy es el primero
  después de 2ba6a389, antes van los SQL del aviso de arriba).
- **Las propuestas abiertas no cambian:** cada una guarda la política con que se calculó
  (`Borrador.hoy.politica`) y la pantalla dice lo que calculó. Para verla con el valor nuevo, vuelve a
  generarla.
- **Qué ve el CSE con cada valor de `fasesVencidas`** (Wherex, S18, sin los cambios de la IA):

  | Valor | Casillas | Línea 1 | Línea 5 |
  |---|---|---|---|
  | `en-el-orden-del-plan` (**el de hoy**) | 8, más «Capacitación y cierre Service» fija sin casilla; 25 tareas se corren con su fase | «El cierre pasa del 13 oct al 5 ene (+12 semanas): 8 fases se reprograman desde hoy, en el orden del plan.» | «⚠ Quedaron sin hacer 4 tareas de semanas que ya pasaron, en «Semana 0»…» |
  | `todo-desde-hoy` | 7 y la fija; «Cierre y entrega» nace desmarcada (quedaría antes del trabajo) | «El cierre pasa del 13 oct al 27 oct (+2 semanas): 6 fases atrasadas arrancan desde hoy.» (7 si la marcas) | la misma; con el cierre desmarcado, sus tareas vuelven a la S11 |
  | `avisar` | ninguna | la de siempre: lo atrasado no mueve el cierre | «⚠ Quedaron sin hacer 58 tareas de semanas que ya pasaron, en «Semana 0», «Sales Hub» y 8 fases más…» |

- **`casiTerminada`** (`maxAbiertas: 2`, `minHecho: 0.7`) se cambia igual: una fase con esas abiertas o
  menos y esa parte hecha o más no se estira, se avisa.
- **`pendientesDelPasado`** (M5): `avisar` (**el de hoy**, la decisión (a) de Elías) o `traer-a-hoy`,
  hecha y apagada. Con `traer-a-hoy`, en una fase en curso cada pendiente de una semana que ya pasó pasa
  a esta semana, con su casilla («Pasar a Semana N», «viene de la Semana M») y el porqué «Lo decide el
  sistema». La Semana 0 sigue avisando siempre. La línea 5 lo suma: «⚠ Quedaron sin hacer 4 tareas de
  semanas que ya pasaron, en «Semana 0»: la propuesta no las mueve; 3 más pasan a esta semana.» En
  Wherex (S18) no cambia nada: lo único vencido fuera de las fases atrasadas es de la Semana 0.
- **Los nombres de las opciones se escriben solo en `politica-de-atrasos.ts`**; el resto pregunta con sus
  predicados (`esperaAlPlan`, `traeLoPendienteAHoy`…). Lo cuida `lib/timeline/politica-de-atrasos.test.ts`.
  Una versión de antes de M5 lee una propuesta calculada con `traer-a-hoy` como si no tuviera reloj.

## La Escala de Rendimiento se lee y se comenta en Nexus (2026-09-27)

Elías pidió una sección para que el equipo interiorice la escala (7.0.0, congelada hasta usarla con
cinco a diez clientes) y deje comentarios donde algo no se entiende o no calza con un cliente real:
la materia prima para cuando se descongele. Tres vistas del mismo dato (matriz, una dimensión como
escalera, mapa radial), filtro por perfil de negocio y comentarios anclados.

- **Nexus es la fuente, y la escala se PUBLICA, no se copia.** La imagen de producción no lleva
  ningún `.md` (`.dockerignore` + `output: standalone`), así que la app no puede leer
  `docs/escala/`. `scripts/publicar-escala.ts` lee los tres documentos del repo, los valida (las
  pruebas de `pruebas_escala.py` que tocan lo que Nexus lee, en TS, MÁS el propio Python que llega
  con cada versión) y los guarda tal cual en `EscalaDocumento`. Versión nueva = reemplazar los
  archivos y publicar: sin deploy, salvo que el formato cambie. Solo inserta: una versión publicada
  no se pisa (misma versión con otro texto → se frena). La descarga devuelve esos bytes, con el
  nombre de archivo fijo.
- **Un solo lector** (`lib/escala/documento/parsear.ts`), estricto con la matriz (una línea que no
  entiende es un error con su número: el lector de Python la saltaría en silencio) y tolerante con
  la prosa. Está pensado para reemplazar después la rúbrica del Diagnóstico escrita a mano y el
  documento de los agentes (hoy en 5.2). `lib/escala/guardas.test.ts` impide que un texto de la
  escala aparezca escrito en el código de la sección.
- **El filtro de perfil es el `aplica()` de `pruebas_escala.py`, portado.** `perfil.test.ts` corre
  la función DEL ARCHIVO de Python sobre la escala real y compara los nueve perfiles, uno por uno.
- **El comentario se ancla a un identificador estable** (`1.7`, `1.7.F`, `1.7.F1`) y congela la
  versión y el texto de ese momento: si una versión nueva lo cambia, se ve al lado (palabra por
  palabra), y si el identificador se retira, el comentario sigue visible en su nivel y en la bandeja.
- **El estado lo cambia SOLO el responsable de la escala, por correo** (`RESPONSABLES_DE_LA_ESCALA`
  en `lib/escala/comentarios/reglas.ts`), no por rol ni por la matriz de /team: SUPER_ADMIN también
  lo son otras personas y la matriz es delegable. Leer y comentar: todo el equipo interno, sin
  sección en el registro de permisos (como Documentación).
- **Tipos y estados como texto, no enum** (INV4): sumar uno no exige un ALTER TYPE.
- **Interno, probado por efecto**: RLS + política RESTRICTIVE en las tres tablas, y
  `scripts/verificar-escala-anon.ts` consulta con la clave pública por la API de Supabase y, con
  `--centinela`, inserta un comentario dentro de una transacción, mira como `anon` y
  `authenticated`, y hace ROLLBACK. Se probó que falla si la tabla queda abierta.
- **Fuera de alcance, a pedido**: votos, notificaciones y análisis con IA. Los agentes no leen los
  comentarios (guardia en `guardas.test.ts`). ⚠ **Las notificaciones se sumaron con «Para ti»** y,
  desde el 2026-10-05, las escribe el módulo de Feedback (ver «Los comentarios de la escala se deciden
  en Feedback»): un comentario nuevo avisa a los frentes Feedback y Escala, y una respuesta, a su
  autor. Votos y análisis con IA siguen fuera.

## La escala tiene ediciones por industria, no una escala por industria (2026-09-29)

Elías sentía que la escala era un asset demasiado general para su ICP (inmobiliarias, educación,
ecommerce y retail): «Tracción del Deal» no le dice nada a una tienda. Planteó una escala por
industria. Se decidió UNA escala con EDICIONES (8.0.0): lo que queda fijo es el esqueleto —3 áreas,
las 8 preguntas de fondo por área, 5 niveles, reglas, cálculo e identificadores— y cada edición
cambia lo que ve el cliente. Primera edición: «Ecommerce y retail», con Ventas escrita entera.

- **Por qué no tres escalas.** Tres copias de la base operativa se mantienen tres veces y se
  separan sin querer; cada una necesitaría sus propios clientes para validarse; los casos de uso y
  el diagnóstico cuelgan de las mismas dimensiones; y los clientes de otras industrias igual
  necesitan la general. De los cambios que pedían las tres industrias, casi todos dependían del
  PERFIL de negocio y no de la industria: por eso primero salió la 7.7.0 (marcas «venta sin
  vendedor» y «recompra», lenguaje para empresas y personas) y después las ediciones.
- **Las ediciones viven DENTRO del documento de la escala, al final** («Parte 5»). Una sola
  versión, una sola publicación, ningún documento nuevo en `EscalaDocumento`: la general y sus
  ediciones no pueden quedar en versiones distintas. La escala general es todo lo de antes (un
  prefijo del archivo): el lector viejo y `pruebas_escala.py` la siguen leyendo igual.
- **Una edición dice solo lo que cambia**, con la misma gramática de la matriz: nombre (solo en
  producción), pregunta, descripción y costo de una dimensión; descripción y resultado de un nivel;
  un criterio REESCRITO (etiqueta con solo el id, `[1.7.F1]`: mismo criterio, mismas marcas);
  criterios PROPIOS (etiqueta completa, en el bloque de la edición: 101–199 la primera, 201–299 la
  segunda, así un id dice de quién es y no choca con la matriz); y «No aplican».
- **`aplicarEdicion(escala, clave)` devuelve otra `Escala` del mismo tipo** (`lib/escala/documento/
  edicion.ts`). La pantalla, los comentarios y las pruebas leen esa escala sin saber que hay
  ediciones. La edición decide QUÉ criterios existen y cómo se dicen; el perfil sigue decidiendo
  cuáles aplican. ⛔ Nunca muta la escala general: se cachea por huella y la comparten todos.
- **Lo que impide que una edición se vuelva otra escala** (prueba «8 · Ediciones coherentes», en TS
  y en el Python): COBERTURA —si una edición toca los criterios de una dimensión, dice algo de
  todos los de la matriz (reescrito, «No aplican» o «Se leen igual»), así un criterio nuevo de la
  matriz no entra a una edición sin que alguien lo decida—; un criterio reescrito conserva las
  palabras con valor fijo («la mayoría», «a tiempo»…); la base operativa no cambia de nombre; una
  edición no saca una dimensión. Y al publicar, lo que una edición dice con sus palabras y cuyo
  texto general cambió FRENA la publicación hasta mirarlo (`--ediciones-revisadas`).
- **La clave de la edición es estable** (`*Clave:* ecommerce-retail`), no sale del nombre: va en la
  URL (`?industria=`) y se guarda con cada comentario.
- **Un comentario recuerda desde qué edición se hizo** (`EscalaComentario.edicion`, SQL
  `2026-09-29-escala-comentario-edicion.sql`). El texto que congela es el de esa edición, y «el
  texto cambió» se compara contra ella: lo calcula el servidor. La columna puede faltar en la
  ventana entre el deploy y el SQL: toda escritura pide de vuelta solo el id, y las lecturas caen a
  los campos de antes.
- **Cambiar de industria en la pantalla vuelve a pedir la página** y monta la vista de nuevo desde
  la URL (`key` por área e industria). ⚠ No tocar el estado antes de navegar: el efecto que escribe
  la dirección con `replaceState` le gana a la navegación y deja la industria vieja.
- **Las versiones anteriores a la 7.7.0 se leen como cuando se publicaron**: la frase «vende sin
  vendedor», que era una regla de texto, se lee como la marca.
- **En espera**: la tercera pregunta del perfil (¿le vende a empresas o a personas?), hasta que un
  criterio la necesite; el chequeo de prospectos por edición; guardar con qué edición se midió
  (llega con la integración de la escala a los diagnósticos).

## Cada cosa de la escala se pide una vez; quien depende de ella la requiere (2026-09-30)

**Contexto.** Revisando Ventas criterio por criterio, Elías notó que `1.6.F3` nombraba entre
paréntesis dónde se definía lo que necesitaba («el ICP (definido en Propuesta y Coherencia)») y pidió
dos cosas: un análisis de los criterios que se repetían entre dimensiones, para dejar cada uno en su
mejor lugar, y ver si valía la pena que un criterio marcara los que requiere. El análisis encontró 13
cosas pedidas más de una vez en Ventas (27 de 135 criterios): un mismo faltante frenaba dos
dimensiones y el cliente leía dos pendientes donde había uno.

**Decisiones.**

- **Una cosa, una dimensión (escala 8.2.0).** Lo que se repetía queda en la dimensión que responde
  su pregunta y sale de la otra: la integración en Tecnología (Datos pide el resultado), la pipeline
  review en Procesos (Equipo pide que se rinda cuentas), la definición de lead calificado en
  Priorización, mejorar el proceso en Aprendizaje, el líder sobre los negocios en riesgo en Tracción.
  Se retiraron `1.1.F3`, `1.1.E4`, `1.4.E1` y `1.5.E1`. ⚠ Sacar un criterio puede dejar un nivel
  vacío para un perfil (prueba 1): pasó con `1.1.E4`, y se resolvió quitándole la marca de «venta con
  equipo» a `1.1.E3`. Las señales repetidas de Deficiente e Inicial NO se tocaron: ahí se asigna por
  mejor ajuste, no castigan doble.
- **Los requeridos van en la etiqueta** (`· requiere 1.5.F1, 1.6.F2`, al final; escala 8.3.0). Se
  leen con el mismo lector estricto (TS y Python, en espejo) y un criterio sin requeridos no lleva el
  campo. ⛔ Es formato nuevo: en producción, deploy ANTES de publicar la 8.3.0 o posterior.
- **⛔ No cambian el cálculo.** El nivel y el puntaje de una dimensión salen solo de sus criterios. Si
  un requerido bajara el nivel de quien lo necesita, volvería el castigo doble que se acababa de
  quitar. Sirven para leer (de dónde se sostiene cada criterio), ordenar el trabajo (lo requerido va
  antes) y revisar un diagnóstico (avisar si algo se marcó cumplido sin lo que requiere).
- **Las reglas de un enlace** (prueba «9 · Requeridos coherentes», `fallasDeRequeridos`): solo de
  Funcional para arriba, a un criterio que existe, de un nivel igual o anterior (y anterior, si es de
  su misma dimensión), con algún perfil de negocio en que los dos apliquen, y sin ciclos.
- **En una edición**, un criterio reescrito conserva sus requeridos; el enlace hacia un criterio que
  la edición sacó se cae solo (`aplicarEdicion`), sin tocar la escala general; un criterio propio
  puede requerir, y si requiere algo que la edición no tiene, la publicación se frena.
- **En la pantalla**: cada criterio muestra qué requiere y cuántos lo requieren; en la matriz, el que
  está bajo el cursor (o con los comentarios abiertos) marca a los relacionados; el panel los lista y
  lleva a ellos; en la rueda, la celda en foco marca con un borde las celdas relacionadas, y la capa
  «Requeridos» muestra dónde están los cimientos. Con un perfil elegido, un enlace hacia un criterio
  que ese perfil esconde no se muestra.
- **En espera**: que el diagnóstico avise cuando un criterio se marca cumplido sin lo que requiere
  (llega con la integración de la escala a los diagnósticos); los requeridos de Marketing y Servicio
  (después de sus ediciones de Ventas).

## Una edición sale primero con Ventas; Marketing y Servicio, después (2026-09-30)

**Contexto.** Con la edición Ecommerce y retail hecha, Elías cambió el orden: en vez de terminar una
industria entera antes de empezar otra, primero Ventas de todas —Banca, Educación, Inmobiliaria—,
porque con Ventas se abre la conversación con un prospecto y eso le sirve para priorizarlos. Después,
Marketing y Servicio de cada industria.

**Decisiones.**

- **Una edición se escribe por áreas.** Las tres nuevas (escala 8.4.0 y 8.4.1) traen solo el área 1.
  En las áreas que una edición no toca, todo se lee con la escala general, y la pantalla lo dice
  (`DatosDeLaVista.edicion.adaptaElArea`): no promete «sus preguntas y sus costos» donde no los hay.
- **El área puede cambiar de nombre, y solo donde el nombre general estorba.** Educación llama
  «Admisiones» al área 1 (nadie en una universidad dice «Ventas»); Banca e Inmobiliaria la dejan como
  «Ventas». ⚠ Al renombrar un área hay que reescribir los criterios que la nombran (`1.3.O4`,
  `1.7.E2`): la tabla de palabras no sirve para eso, porque «ventas» también es un sustantivo común.
- **Los resultados de cada nivel no tienen tooltip de palabras**: si el resultado general dice
  «vendedor» o «negocio», la edición lo tiene que decir entero con las suyas.
- **Una dimensión que en la general no aplica a un perfil puede aplicar en una edición** solo si la
  edición le da criterios sin marca en Funcional, Eficiente y Óptimo (prueba 1). Banca lo hace con la
  personalización de Ventas (a quién se le ofrece cada producto también vale para lo que el cliente
  contrata solo); Educación e Inmobiliaria no: ahí sus criterios propios llevan «venta con equipo».
- **Lo que se cae después de ganarse** se mide en las ediciones que lo traen, en Aprendizaje (como
  dice la regla de asignación desde la 8.1.0): los pedidos cancelados en Ecommerce y las reservas
  desistidas en Inmobiliaria.
- **En la rueda, un nombre largo de dimensión va en dos líneas** a los costados: los nombres de una
  edición suelen ser más largos que los generales y se salían del dibujo.
- **Pendiente**: Marketing y Servicio generales (revisión de Elías, repetidos y requeridos) y,
  después, su versión en cada edición.

## Lo que se tolera en silencio se pierde en silencio: la revisión de la escala antes del push (2026-09-30)

**Contexto.** Antes de subir los 17 commits de la escala (7.0.1 a 8.4.1) se corrió la revisión de
siempre: cuatro revisores sobre el rango, cada uno con su lente, y cada hallazgo corrido antes de
contarlo. Ninguno frenaba el push. Lo que encontraron tiene un patrón: el lector es estricto con la
matriz y tolerante con la prosa, y todo lo que cae del lado tolerante puede desaparecer sin que una
prueba lo note.

**Decisiones.**

- **Lo que PARECE una edición tiene que serlo.** Lo que va antes de la primera edición es prosa. Un
  título con guion en vez de raya («## Edición - Banca», «# Parte 5 - Ediciones») se leía como prosa:
  la edición entera desaparecía —sus criterios propios, sus reescritos— y las pruebas de Nexus y las
  de Python daban verde. La única red era la prueba 5, y solo si lo ya publicado traía esos criterios:
  en la primera publicación con ediciones no existía. Ahora un título que habla de ediciones y no
  tiene la forma exacta es un error con su línea, y también lo es el contenido de una edición antes
  de su título (`parsear.ts`; en Python, `titulos_mal_escritos`).
- **La prosa se lee con tolerancia, pero no se publica sin mirar** (`Escala.avisosDeLectura`). Una
  palabra entre «» en «Cómo se leen los criterios» a la que el lector no le encuentra su valor dejaba
  de ser una palabra con valor fijo, y con eso dejaba de cuidar que una edición no le cambiara el
  umbral. El lector la sigue leyendo (una versión vieja se tiene que poder abrir) y deja un aviso; la
  validación lo convierte en falla de «Estructura». Es el molde para lo próximo que el lector tolere.
- **La misma palabra con valor fijo en plural es la misma** («no se dejan envejecer»). La regla es de
  forma —a cada palabra que termina en vocal se le admite una «n»—, no una lista: la guarda de fuente
  única sigue prohibiendo textos de la escala en el código.
- **`pruebas_escala.py` corre la prueba 8 ENTERA.** La especificación la describía completa y el
  script revisaba una parte: diez casos que Nexus frenaba pasaban en Python (cobertura, un criterio en
  dos lugares, el mismo texto, una palabra con valor fijo, una dimensión de base renombrada, sin perfil
  habitual, bloque repetido o ajeno, una dimensión que deja de aplicar). Al publicar corren los dos,
  así que nada inválido entraba; pero el script viaja con la escala a otros proyectos, y ahí es la
  única protección. La prueba 8 es ahora una función (`incoherencias_de_ediciones`) y un test corre la
  del propio archivo sobre los mismos casos que Nexus (`validar.test.ts`): lo que frena uno, lo frena
  el otro.
- **La prueba 4 mira todo lo que el cliente lee**: también los nombres (área, dimensión, edición), el
  vistazo de cada área y las dos columnas de la tabla de palabras.
- **Lo viejo se mira parte por parte.** Un nivel son dos textos (descripción y resultado) y una
  dimensión, cuatro. Se comparaba el texto entero del identificador: si la edición decía con sus
  palabras solo el resultado y en la misma versión cambiaban la descripción y el resultado generales,
  el nivel «cambiaba» en la edición y su resultado viejo pasaba sin aviso. Ahora cada parte se compara
  con su par (`partesViejas`), incluidas la descripción y el vistazo del área.
- **El número de una celda y lo que lista su panel dicen lo mismo.** Con las ediciones, el contador
  dejó de sumar los comentarios de criterios retirados (una regresión: nada en la matriz avisaba que
  estaban). La regla queda escrita una vez: se cuenta y se lista lo que se ve y lo RETIRADO —lo que
  ya no existe en ninguna lectura—; lo que existe en otra lectura (propio de otra edición, o uno que
  esta edición sacó) se ve donde existe (`anclasDeOtraLectura`, `esDelPanelDelNivel`).
- **Un requerido es estricto o no es.** La revisión de contenido sacó dos que no lo eran (Banca,
  Inmobiliaria). Se dejó a propósito `1.2.E5` → los tres documentos que no se dejan envejecer: al pie
  de la letra la IA puede usarse con documentos viejos, pero la propia escala dice que los criterios
  de riesgo «se vuelven indispensables al empezar a usar IA».
- **Las ediciones se revisan con la misma vara que Ventas** (escala 8.4.2): lo que se pedía en dos
  dimensiones dentro de una edición queda en una (la precalificación en Banca, la disponibilidad en
  Inmobiliaria, corregir la ficha en Ecommerce), y una reescritura que cambiaba lo que se mide pasa a
  ser un criterio propio (la invitación a volver después de cada compra).
- **En espera** (lo dijo la revisión y no se hizo): unas veinte ramas de error del lector de ediciones
  no tienen test propio (frenan bien, corridas a mano); y `1.8.E1` de la escala general revisa solo lo
  perdido aunque su nivel dice «ganadas y perdidas» — es de la 7.0.0 y lo decide el responsable.

## `/api/health` mira si la base está atrás del código (2026-09-30)

**Contexto.** Los cambios de esquema son SQL a mano que se corren antes del deploy. Si alguien se
olvidaba, la salud solo probaba `SELECT 1` y el canario `roleProfile.count()`: `deploy.sh` decía
«DEPLOY OK» y las pantallas que leían la columna nueva reventaban con P2022. El caso del día: el
commit `e4fd8594` trae dos columnas en `SessionProject` que `lib/sessions/project-sources.ts`
selecciona en cada lectura; sin su SQL se caían la ficha del cliente, el cronograma y el
clasificador. Medido ese mismo día, en solo lectura: a producción le faltaban 3 columnas (2 SQL).

**Decisiones.**

- **La red va en la salud, no en una lista de pasos.** INV4 e INV7 (`check:invariants`) ya miraban
  lo mismo desde una PC y el hueco existió igual: depende de acordarse. Con la salud en 503,
  `deploy.sh` revierte solo, como con cualquier otro fallo, sin tocar `deploy.sh`, el Dockerfile ni
  el compose. `npm run check:esquema` queda como el aviso ANTES: la misma comparación en un par de
  segundos, con el archivo de `scripts/sql/` que crea cada cosa que falta.
- **Lo que espera el código sale del cliente GENERADO** (`Prisma.dmmf.datamodel.models` y `$Enums`),
  no del texto del schema: es lo que corre en la imagen. El dmmf de Prisma 7.4.2 trae los modelos y
  `enums: []` (lo que INV4 anotaba como «viene vacío»), así que los valores salen de `$Enums`. Lo
  que el dmmf no dice lo congelan tests contra el schema: ningún enum con `@map`, ningún modelo
  fuera de `public` (`@@schema`), y las tablas pivote de las N:N implícitas —que no son un modelo—
  en `PIVOTES_IMPLICITAS` (hoy una).
- **`check:esquema` avisa si el checkout no es lo que se despliega**: el schema con cambios sin
  commitear (el árbol se comparte con otra sesión), u `origin/main` con cambios del schema que acá no
  están. Sin eso, podía pedir un SQL de código que no sale, o decir «✓» y que el deploy se revierta.
- **Solo lo que FALTA.** Lo que la base tiene de más (`KnowledgeEmbedding.embedding`, índices creados
  por SQL, las tablas de la tanda siguiente) no se reporta; tampoco el tipo ni la nulabilidad (el
  esquema es solo aditivo).
- **Barata.** UNA consulta a `pg_catalog` (columnas y enums en el mismo viaje) por el pool de
  siempre; en verde queda guardada toda la vida del proceso; atrasada se relee cada 30 s (correr el
  SQL la pone en verde sola); nunca dos a la vez; quien pregunta espera como mucho 3 s, contados
  desde que la consulta ARRANCÓ (una colgada no se vuelve a esperar en cada healthcheck ni se lanza
  otra al lado, que dejaría otra conexión tomada). Los plazos van con el reloj monótono: si NTP
  atrasa la hora, no se congelan. `pg_catalog` y no `information_schema`, que esconde lo que el
  rol no puede ver: un permiso de menos se leería como una tabla que falta.
- **Solo falla con prueba.** Una lectura que falló o tardó es «sin verificar» y no apaga la salud:
  un corte de red no revierte un deploy. Y un atraso probado no lo levanta un error posterior; si
  parpadeara a verde, un solo healthcheck bueno le alcanzaría a Docker para dar por sano el
  contenedor.
- **El endpoint es público**: `checks.esquema` nombra hasta 8 faltantes y nunca el error crudo de la
  base (trae el host). La lista entera y el error van al log con `[esquema]`, que es lo que
  `deploy.sh` imprime antes de revertir.
- **`ESQUEMA_NO_BLOQUEA=1`** en el `.env` del VPS deja el chequeo en aviso, para el día en que se
  equivoque: se puede desplegar sin esperar un arreglo de código. Mientras está puesta, cada salud
  lo dice.

**Lo que no se hizo, a propósito.**

- **Probar la imagen nueva ANTES del cambio de contenedor** (una instancia de prueba en otro puerto;
  recién con su salud en verde, cambiar). Evitaría el rato en que el contenedor nuevo atiende con la
  base atrasada —entre 75 y 90 s, hasta que Docker lo marca y `deploy.sh` revierte—, pero cambia
  `deploy.sh` (que se reescribe a sí mismo), duplica la memoria de Nexus en un VPS compartido
  mientras dura y corre dos instancias a la vez (RUNBOOK, invariante #1). Si ese rato molesta, es el
  paso siguiente; mientras tanto, el chequeo previo lo evita.
- Comparar tipos, nulabilidad, índices o policies.

## Lo que se decide para un área de la escala se decide para las tres: Marketing y Servicio con la vara de Ventas (2026-09-30)

**Contexto.** Ventas se limpió primero (8.2.0: cada cosa se pide una vez; 8.3.0: quien depende de
ella la requiere). El mismo análisis sobre Marketing y Servicio encontró 37 cosas que se pedían más
de una vez —20 y 17—, y dos revisores lo intentaron refutar aplicándolo a una copia. Además, al
revisar Ventas su responsable había tomado cuatro decisiones que dejaron a las otras dos áreas
distintas sin que nadie lo decidiera. Su respuesta fue una línea: «Aplica los arreglos. Iguálalas.
Súmalas». Es la escala 8.5.0. Antes del commit, otros dos revisores leyeron el resultado buscando lo
que las pruebas no ven; lo que encontraron está incluido.

**Decisiones.**

- **Una decisión sobre un área es una decisión de la escala.** Las cuatro que se tomaron para Ventas
  valen para las tres, en la misma dimensión y el mismo nivel: trabajar en el sistema central es una
  rutina (Procesos, Funcional: `1.1.F6`, `2.1.F6`, `3.1.F6`); la IA como asistente del equipo es de
  Eficiente y, en Funcional, solo se pide que si se usa tenga un contexto básico (`1.2.F7`/`1.2.E5`,
  `2.2.F9`/`2.2.E6`, `3.2.F8`/`3.2.E4`); Procesos mide en Eficiente y Óptimo que el proceso se cumpla
  (`1.1.E3`/`O1`/`O2`, `2.1.E4`/`O4`/`O5`, `3.1.E5`/`O3`/`O4`); y los paneles en tiempo real son de
  Tecnología, en Eficiente (`1.2.E4`, `2.2.E7`, `3.2.E5`). La «Regla de asignación» lo dice para las
  tres áreas, no solo para Ventas.
- **Cuando un criterio se muda, se mudan también sus señales de Deficiente e Inicial.** Pasar la
  adopción del sistema a Procesos dejaba en Tecnología de Servicio la descripción de Inicial «baja
  adopción» y su señal: una unidad podía estar en Funcional en Tecnología con una descripción que la
  retrataba en Inicial. La señal pasa a Procesos (`3.2.I1` → `3.1.I3`), como hizo Ventas en la 7.1.0.
- **Sacar un repetido no deja un hueco: lo llena el espejo de Ventas.** Quitar los repetidos dejaba a
  Procesos de Marketing con un criterio en Eficiente y uno en Óptimo, y a Procesos de Servicio con
  uno en Óptimo. No se inventó contenido para rellenar: entró lo que Ventas ya medía ahí.
- **En Servicio, vigilar el proceso no es vigilar los plazos.** Los SLA se cuentan en cuatro lugares
  —se definen en Procesos, se avisan y escalan en Tecnología (o en Proactividad si la solicitud es de
  otra área), se miden en Datos y se rinde cuentas por ellos en Equipo—; si «el proceso se cumple»
  se probara con ese mismo reporte de plazos, la misma evidencia contaría dos veces. Lo que Procesos
  vigila es que cada caso siga las etapas y los pasos del proceso. Por lo mismo, el panel en tiempo
  real de Servicio no repite el tiempo de primera respuesta, que ya mide Datos.
- **El identificador cambia cuando cambia la dimensión, el nivel o lo que se mide; se conserva al
  acotar o precisar** (especificación 1.3.4), también cuando el criterio suma lo que pedía otro que se
  retira en la misma versión o lo que ya decía la descripción de su nivel. Si con eso cambia a qué
  perfiles aplica, lo dice el historial: `3.7.O1` se quedó con las revisiones de resultado y lleva la
  marca `relación continua`, que su texto ya decía. `2.8.F1` pedía un tablero y `2.8.F5` pide los
  resultados de cada campaña: id nuevo. Quedan 29 retirados más.
- **El reporte a la dirección no es la rendición de cuentas del equipo.** Se mudó a Equipo y Gobierno
  como criterio propio (`2.4.F6`) en vez de fundirlo con la reunión de performance (`2.4.F3`): uno es
  el equipo ante su líder; el otro, el líder ante la dirección.
- **«Tiempo real» es una capacidad del sistema, no un nivel de autonomía.** Por eso baja de Óptimo a
  Eficiente, y el panel pide lo que ningún tablero de Funcional da: las conversaciones que esperan
  respuesta. La consecuencia se acepta a la vista: Óptimo de Medición y Aprendizaje (`2.8.O`) queda
  con un solo criterio, igual que Óptimo de Consistencia de Atención (`3.5.O`), que perdió el tono
  personalizado (es personalización, y ya está en `3.6.O2`).
- **En Óptimo, la IA hace y la persona valida, y el criterio lo dice.** «Con IA» se lee como IA que
  asiste, que es Eficiente: `2.1.O1` y `2.5.O2` dicen quién ejecuta.
- **Mantener vigente lo publicado es un riesgo, no un escalón.** `3.8.F1` pide tener la respuesta
  publicada; que no envejezca lo cuida el riesgo de contexto (`3.3.F6`), que la requiere y tiene su
  propio mensaje: el cliente puede estar leyendo respuestas viejas. Inicial de Escalabilidad deja de
  decir «sin actualizar».
- **Un criterio sin marca de perfil no pide algo que un perfil no tiene.** `3.8.E2` revisa las razones
  de salida «donde la relación es continua»: en relación única nadie las registra (`3.7.F3`).
- **`1.8.E1` revisa lo ganado y lo perdido, y conserva el id.** El nivel ya decía «ganadas y
  perdidas»; el criterio estaba incompleto. Las cuatro ediciones lo dicen con sus palabras; se publicó
  con `--ediciones-revisadas` porque el resultado de Educación ya hablaba de los que sí ingresaron y
  los vistazos de las ediciones son resúmenes propios, no una copia del general.
- **El glosario define lo que aparece.** «Costo de adquisición» dejó de aparecer y en la matriz está
  «CAC»; «Retención neta de ingresos» sale; y un MQL «todavía no es un lead calificado», porque el
  glosario decía que lead calificado es lo mismo que SQL.
- **En espera** (lo dijeron el análisis o la revisión, y no se tocó): la pregunta y el costo de
  Equipo y Gobierno de Servicio hablan de priorizar y de revisar los problemas, que son de 3.6 y 3.8;
  la descripción de 1.8 dice que se registra por qué se gana, y ningún criterio de la general lo pide
  (Educación sí, `1.8.E301`); «lo que ha pagado» en la ficha es Funcional en Servicio (`3.3.F2`) y
  Eficiente con integración en Ventas (`1.3.E3`); una señal de Inicial que choca con un criterio de
  Funcional (`3.8.I1` con `3.2.F6`; `2.2.I3` con `2.2.F5`); el presupuesto aparece en el costo de
  Medición aunque la regla lo deja en Canales; `2.4.E3` habla del handoff de leads sin marca de
  perfil; en Ecommerce, Tecnología y Autoservicio de Servicio hacen casi la misma pregunta; la cola de
  `3.2.O1`; partir en tres el contexto que no se deja envejecer, como en Ventas; el glosario
  (sobra «QBR»; faltan «ROI», «ERP» y «CSE»); y Marketing y Servicio de cada edición.

## Marketing y Servicio de las cuatro ediciones, antes de probarlas: se revisan completas en producción (2026-09-30)

**Contexto.** La decisión anterior era que una edición salía con Ventas y que Marketing y Servicio se
adaptaban después de usarla con dos o tres clientes. Con Marketing y Servicio generales ya limpios
(8.5.0), el responsable cambió el orden: «Avancemos y reviso todo al final. Creemos la de marketing y
servicio de cada industria. La subimos a producción y justo ahí lo reviso. Luego… toca probarla». Es
la escala 8.6.0: las cuatro ediciones traen las tres áreas enteras.

**Decisiones.**

- **Se escriben las cuatro a la vez, con un mismo encargo.** Cuatro redactores en paralelo, uno por
  edición, con las mismas reglas —las de la Parte 5 de la escala más lo aprendido al escribir Ventas:
  los resultados no tienen tooltip, un área renombrada obliga a reescribir lo que la nombra, la
  prueba 1 corre con los nueve perfiles— y validando cada uno su copia con las dos pruebas. Después, dos revisores cruzados —uno por área, leyendo las cuatro ediciones a la vez—
  buscaron lo que las pruebas no ven. La revisión por área encontró lo que la de una sola edición no
  puede: la misma situación decidida distinto sin razón de industria.
- **Los nombres de las áreas no cambian** («Marketing», «Servicio»); sí los de las dimensiones de
  producción cuando la industria los dice de otra forma (Autoservicio, Permanencia, Marca y confianza,
  Acompañamiento del comprador…). En Educación, lo que nombra al área de ventas dice «Admisiones».
- **Cada cosa se pide una vez también entre las áreas de una edición.** Tres choques que venían de
  la época en que las ediciones traían solo Ventas: el permiso de contacto (Banca y Educación lo
  pedían en Ventas y la general lo pide en Marketing), la rematrícula (Educación la ponía como
  recompra en Admisiones, y es renovación de Servicio) y las secuencias en una tienda (las de Ventas
  son las del carrito y las de después de la compra; las de Marketing, las de quien todavía no compra).
- **Un reescrito mide lo mismo que el general, y se nota en los detalles.** La revisión cruzada sacó
  reescritos que pedían más (dos canales donde el general pide uno, un contenido fijo en la respuesta
  automática, un plazo en Priorización que es de Procesos) o menos («los demás momentos» para no
  contar dos veces un propio). Cuando la industria pide más, es un criterio propio y el general queda
  como está.
- **El costo de quedarse se arregla en Funcional.** El chequeo lo muestra junto al resultado de
  Funcional: un costo que habla de reseñas, de costo por producto colocado o de pruebas de reputación
  prometía algo de Eficiente.
- **Lo que depende de algo que no todos tienen abre con la condición** («Si la entidad emite
  tarjetas…», «Si el proyecto queda en condominio…», «Si la institución capta en ferias…»): así el
  CSE sabe cuándo el criterio no cuenta.
- **El autoservicio transaccional es de Tecnología en Eficiente**, como el portal en la escala
  general: las gestiones en la app de Banca y los trámites en línea de Educación quedan ahí. Pedir
  el seguimiento del pedido en Autoservicio de Ecommerce se deja en Funcional: es la respuesta a la
  consulta que más se repite en una tienda, y la dimensión lo pregunta así desde la 8.0.0.
- **La retención con propuesta de expansión (`3.7.E2`) es de relación continua** en la escala general:
  donde el cliente vuelve sin contrato, reactivarlo es de Tracción del Deal. Ecommerce y Banca la
  sacan (ofrecer más es de Ventas) y suman su propia retención; Educación e Inmobiliaria la leen con
  sus palabras o igual.
- **En espera** (lo dijeron los redactores o los revisores, y lo decide el responsable): la vara de
  Funcional en Banca (plazos del regulador, cumplimiento normativo, identidad, bloqueo de tarjeta,
  aviso de cobro); dónde queda la atención preferente a los mejores clientes en una tienda (hoy en
  Ventas `1.6.E102`); «grupos clave» de estudiantes por necesidad y no por valor; el avance de obra
  en Ventas y en Servicio de Inmobiliaria; y, de la escala general, respetar el permiso al enviar
  (solo se pide registrarlo), las herramientas que se piden dos veces en la venta sin vendedor, el
  acuerdo con las áreas que resuelven parte de los casos en Equipo de Servicio, los criterios de
  resolución escritos, y la presencia en mapas para sucursales, sedes y salas de ventas.

## La rueda de la escala: el color siempre es el nivel, y lo que no está en foco se aclara (2026-09-30)

**Contexto.** Mirando la rueda, el responsable de la escala no entendía por qué, al elegir una celda,
otras se aclaraban, por qué no todas tenían el mismo color ni qué eran la línea azul a rayas y el
borde negro. Pidió que al elegir algo lo demás se note menos, una leyenda, y revisar colores y
usabilidad.

**Decisiones.**

- **El color es siempre el nivel.** Las capas de datos (hábitos, riesgos, requeridos, escondidos por
  el perfil) pintaban con su propio color, que era el de otro nivel: el naranja de los riesgos es el
  de Inicial, el verde de los requeridos el de Funcional. Una celda de Funcional con criterios de
  riesgo parecía de Inicial. Ahora todas pintan con el color del nivel y la intensidad cuenta lo que
  se eligió mostrar; los comentarios ya cerrados, en gris.
- **Lo que no está en foco se aclara, con su color.** Con algo en foco hay tres alturas: lo elegido y
  lo que se relaciona con ello por sus requeridos, enteros; su dimensión y su nivel, a media luz,
  para ubicarse; lo demás, más claro (un tinte blanco: 30 %). Igual bajo el cursor que elegido
  (antes, lo elegido apagaba a medias). Se probó apagar en gris —aclarar ya dice «pocos criterios»—
  y el responsable lo prefirió con color: la rueda se sentía apagada de más. Para que no se
  confunda, la intensidad de una celda con pocos criterios arranca más alto y la leyenda lo dice.
- **Los bordes y los acentos son neutros.** El azul de los bordes de los requeridos, del arco de la
  capa y del nombre en foco era el mismo de Eficiente. Ahora: borde grueso, la elegida; rayas, «la
  elegida necesita algo de esta»; puntos, «esta necesita algo de la elegida»; los tres en el color
  del texto. El «acá estás» del teclado solo aparece mientras se recorren celdas.
- **La leyenda, arriba de la rueda y completa** («Cómo leer la rueda», plegable): el color, la
  intensidad, las guías (vacía, rayada, la base, el orden en que se trabaja) y lo que pasa al tocar
  una celda. La anterior estaba debajo, en letra chica, y los bordes de los requeridos solo aparecían
  en ella cuando había alguno: justo cuando hacía falta entenderlos, no estaban.

## La exploración de venta: un lienzo que se usa, el agente propone y el vendedor confirma (2026-10-01)

**Contexto.** Elías pidió, en Ventas, un lienzo por empresa que guíe la exploración para cerrar la
primera venta (llevar cada área en juego a Funcional) con la escala y el marco de calificación de
HubSpot, que alimente la propuesta y que le llegue al CSE en el handoff. Sin versión nueva de la
escala y sin tocar el diagnóstico del CSE.

**Decisiones.**

- **Dos reuniones, por decisión de Elías.** La revisión del diagnóstico que promete el test (30 min,
  una sesión de trabajo, sin producto) y una exploración a fondo (45–60 min) con el portal abierto.
  El guion de cada una vive en `lib/exploraciones/sesion.ts`; si dura distinto, los minutos se
  ajustan en proporción.
- **La profundidad: las 8 dimensiones de cada área en juego, estimadas; se profundiza en hasta 4.**
  La escala no deja saltar dimensiones (la capa es su dimensión más débil). Se profundiza en las que
  quedan debajo de Funcional, tocan una meta o dejan ver un riesgo, hasta saber qué les falta para
  Funcional. «Lo que pide Funcional» guía la conversación y **no cambia el nivel**, que sigue
  estimado. El resto (comprobar en el sistema, hábitos, Eficiente y Óptimo) queda para el CSE.
- **El agente propone; nada se confirma solo.** Lo propuesto vive aparte (`propuesta`) de lo
  confirmado (`contenido`), con lápidas para lo descartado y la fila bloqueada para los dos
  escritores. Un nivel o un «lo tiene / no lo tiene» entra solo con una frase que aparezca LITERAL en
  su fuente: una cita inventada engañaría al vendedor. Solo «leer» marca lo leído: «preparar» recorta
  las reuniones y no debe dejar a la primera lectura sin nada.
- **El test de marketing es hipótesis.** Usa la escala anterior (v4): se decodifica el enlace del
  resultado (`url_ultimo_diag_*`, lz-string), sus dimensiones caen en las de hoy por posición, entra
  como propuesta «valídalo en la primera reunión», y nunca pisa un nivel pendiente que salió de una
  reunión. Al modelo no le llegan las etiquetas v4.
- **La propuesta solo ve lo que puede ver el cliente, y su posición en la escala sale del chequeo.**
  Hipótesis, presupuesto, quién decide, lo no explorado y la apertura a la asesoría no entran
  (`bloqueParaLaPropuesta`). «Dónde está tu operación hoy» alimenta el bloque de la Escala del
  kickoff: la escribe el código desde el chequeo (nombres de nivel, el nombre GENERAL de la dimensión
  que frena, texto neutro, en el idioma de la propuesta), también al regenerarla. «Sin Escala» se
  respeta. La propuesta exige el negocio de la empresa: el kickoff une propuesta y proyecto por él.
- **A qué handoff le llega.** Por el negocio de la propuesta; si no hay enlace, al PRIMER proyecto de
  Customer Success de la empresa dentro de seis meses (una archivada no cuenta); nunca a desarrollo
  ni a sitio web, ni a un ciclo posterior (`lib/exploraciones/handoff.ts`). Va rotulada «estimado:
  sirve para saber dónde mirar, no es evidencia». Lo vigila un censo propio
  (`lib/exploraciones/lectores.test.ts`): lo que ve el cliente solo entra por `paraLaPropuesta`.
- **Lo interno NO se le manda al agente del handoff** (cambio de la revisión adversarial, mismo día).
  El primer diseño lo mandaba rotulado «SOLO INTERNO» hacia «Riesgos y banderas rojas» o «¿Por qué
  vendimos?». Pero ese agente escribe en una sola llamada también las secciones que leen el kickoff,
  el diagnóstico, la entrega y el cuestionario previo (que el cliente ve sin revisión): una nota
  como «no confía en consultoras» podía terminar en «Stakeholders clave». La regla del repo es
  filtrar datos, no rogarle al modelo: lo interno (hipótesis, presupuesto, quién decide, lo no
  explorado, el producto mostrado, la apertura, el contexto, el siguiente paso) lo ve el CSE en la
  columna «Exploración de venta» del contexto del proyecto, que es pantalla interna.
- **La lectura automática solo mientras se vende.** Cada reunión nueva dispara al agente solo si la
  empresa sigue siendo prospecto, la exploración tiene menos de seis meses y la venta todavía no
  tiene proyecto. Sin ese freno, cada reunión de implementación de la cuenta disparaba una corrida
  (HubSpot y Claude, contra el presupuesto automático) para siempre — la multiplicación por sesión
  que se sospechó en la caída del 21-sep. El botón sigue disponible a mano.
- **La métrica se mide con la foto del momento de proponer**, no con lo que se completó después; y
  sirve para mejorar el proceso, nunca para evaluar a quien vende.
- **Los permisos nuevos de HubSpot entran por entorno** (`HUBSPOT_SCOPES_OPCIONALES_EXTRA`): un scope
  escrito en el código rompería la instalación desde el deploy hasta que alguien lo declarara
  «Opcional» en la app pública.

**Lo que no entra.** Una versión nueva de la escala (las precisiones, en
`docs/propuestas-escala-desde-la-exploracion.md`), el diagnóstico del CSE, el test de marketing (sigue
en la escala anterior) y ampliar la sincronización de Meet (fue la sospechosa de la caída del 21-sep).

## La exploración de venta, rediseñada: una guía fácil, la escala como mapa (2026-10-01, tarde)

**Contexto.** Elías revisó el módulo en producción y pidió que fuera «una guía muy fácil de rellenar»,
sin sobreingeniería: que la preparación lea HubSpot y elija SOLA la industria (CreditForce figuraba
como software y es de banca y servicios financieros) y con ella el perfil; que el desplegable de
motivos de «dimensiones a explorar» desapareciera; que las reuniones fueran solo una guía de qué
preguntar («la transcripción se encarga de anotar y de sugerir las respuestas y una mejor posición
en la escala»); que «Lo que quedó» fuera la escala, con las etapas en que parece estar cada equipo y
el porqué escrito por la IA, separando evidencia de hipótesis; y que «Propuesta» se llamara «Casos
de uso», con un agente experimental que los proponga sin la biblioteca (vacía).

**Decisiones.**

- **La preparación escribe sola lo de arranque: la ÚNICA excepción a «el agente propone».** La
  industria (la edición) y su perfil habitual, el área del test si no había ninguna, y el país y el
  tamaño de la empresa si estaban vacíos (`armarLoQueVaSolo` en `lib/exploraciones/agente.ts`). Son
  datos de arranque, no conclusiones sobre el cliente: se ven con quién los eligió y por qué
  (`contenido.edicionElegida`) y se cambian con un clic. Primero por la industria de HubSpot al crear
  la exploración; si no apunta a ninguna edición, el agente decide leyendo todo lo de la empresa
  contra «para quién es» cada edición (el texto sale de la escala publicada). En cuanto el vendedor
  toca la industria o el perfil, el agente ya no los cambia. La escritura va con la fila bloqueada y
  releída, y sube la versión: si el vendedor tenía la pantalla abierta, su próximo cambio recarga en
  vez de pisar.
- **Hipótesis y evidencia son dos clases de nivel, y el mapa las pinta distinto.** Hipótesis: lo que
  marcó en el test y lo que el agente deduce de HubSpot al preparar (con su porqué, sin frase
  literal; desde el 2026-10-07, solo con una pista de lo que el cliente dijo o hizo: ver «Preventa: sin
  una pista del cliente, no hay diagnóstico»). Evidencia: lo que dijo el cliente (con su frase), lo que se vio en el portal o lo que
  marcó el vendedor. Tienen ids distintos (descartar una hipótesis no tapa lo que el cliente diga
  después), una hipótesis nunca pisa lo que dijo el cliente, y lo que dijo el cliente confirma una
  hipótesis aunque sea el mismo nivel (`fusionarPropuestas`, `yaEstaConfirmado`).
- **Las hipótesis no se «usan»: son el mapa.** No cuentan como «para revisar» ni entran a «Usar
  todas»; el mapa dibuja lo confirmado y, donde no hay, lo propuesto (`lib/exploraciones/mapa.ts`),
  y con eso calcula «qué va primero» para la primera reunión, avisando cuando sale de hipótesis.
  ⛔ La propuesta, el handoff y «lista para proponer» siguen leyendo SOLO lo confirmado: una
  hipótesis del agente no llega al cliente. El vendedor confirma o corrige con un clic en el nivel
  que mejor describe a la dimensión.
- **El porqué del nivel del área lo arma el código, no la IA.** La escala ubica al equipo en su capa
  más baja y la capa en su dimensión más débil: el porqué nombra esas dimensiones y suma el porqué
  que escribió el agente para ellas. Así nunca contradice al nivel calculado.
- **Las reuniones son una guía, sin campos.** Cada paso dice qué buscar, cuánto dura y qué preguntar
  (las del marco y la pregunta de cada dimensión, de la más baja a la más alta, con lo que hoy se
  cree de ella). Lo que respondió el cliente lo propone el agente con la transcripción, en su propia
  pestaña. Las notas rápidas viejas se siguen leyendo como fuente; ya no se escriben.
- **Los casos de uso, experimentales y sin la biblioteca.** La primera vez que se abre el paso, el
  agente propone solo; después, otra tanda con un botón. Lee dónde está cada equipo y lo que el
  cliente puede ver (nunca lo interno: lo que propone termina en la propuesta). Cada caso lleva id
  `ia-…` sacado del título: lo descartado deja su lápida y su título, y la tanda siguiente no lo
  repite. No tiene precio ni fila del catálogo: entra a la propuesta como contexto, y la sección de
  casos de uso con precio sigue saliendo solo del catálogo.

**Lo que no cambia.** El modelo de propuesta y confirmación para todo lo demás, los dos escritores
con la fila bloqueada, lo que ve el cliente y lo que recibe el CSE.

## La exploración de venta, tercera vuelta: preparar al vendedor, no llenar un formulario (2026-10-01, noche)

**Contexto.** Elías tuvo tres sesiones (con Carlos Valderrama de HubSpot, con Andrés y con Marco y Alex
Vanegas) y salió algo claro: Ventas llega a la exploración sin prepararse y termina vendiendo licencias
en vez de diagnosticar (muestra demo temprano, pregunta por usuarios y volumen, no profundiza). El
vendedor tiene que llegar sabiendo con quién habla, qué preguntar, cómo profundizar y cómo manejar las
objeciones, y ver de un vistazo qué le falta para proponer.

**Decisiones.**

- **Lo confirmado sin evidencia no cuenta.** «Lista para proponer», la propuesta, el handoff y la
  métrica leen `chequeoConfirmado` (`lib/exploraciones/mapa.ts`): solo lo que dijo el cliente, se vio en
  el portal o marcó el vendedor. Un nivel del test o del agente sigue siendo hipótesis aunque alguien lo
  haya «usado» (en CreditForce, los 8 niveles del test usados con el lienzo anterior daban «las 8
  dimensiones confirmadas» con cero dichas por el cliente). Endurece la regla de que una hipótesis no
  llega al cliente; no cambia el modelo de datos.
- **El agente sabe qué día es.** El pedido lleva la fecha de hoy y la próxima reunión agendada en
  HubSpot (solo título y fecha), y cada reunión de HubSpot dice qué pasó con ella (se hizo, se canceló,
  se reagendó). Sin eso escribió «tiene agendada la revisión para el 28 de septiembre» el 1 de octubre,
  con la revisión ya hecha. Una reunión futura cancelada o reagendada ya no es agenda.
- **La lista muestra todas las empresas de HubSpot**, de 25 en 25 (son miles: nunca se cargan todas);
  sin búsqueda, las de actividad de ventas más reciente (`notes_last_updated`). Las tarjetas de la
  métrica salen de la pantalla: no le aportan al vendedor; la foto al proponer se sigue guardando.
- **El resumen va arriba de todo:** las ocho tarjetas del marco de calificación (metas, planes, retos,
  tiempos, presupuesto, quién decide, consecuencias, implicaciones), vacías a la vista, con «qué sigue» y
  lo propuesto para revisar en el mismo bloque. Cuatro pestañas: Exploración, La escala, Casos de uso y
  Traspaso (Preparación y Reuniones se juntaron).
- **Cada cosa vive en un lugar.** La casilla «Hipótesis» se retira (`retirada`: el agente ya no la
  propone y no se muestra; lo guardado se sigue leyendo) y «Qué explorar a fondo» vive en la escala. Las
  hipótesis de nivel siguen siendo el mapa.
- **Las sesiones son las que hagan falta** (supera «dos reuniones, por decisión de Elías» del
  2026-09-30): el vendedor las agrega en `contenido.sesiones`, y la guía es siempre la de la PRÓXIMA.
- **La guía de la próxima reunión: el código elige qué cubre, el agente escribe** (`lib/exploraciones/guia.ts`,
  `guia-pedido.ts`). Hasta 5 tarjetas vacías, en el orden `PRIORIDAD_DE_LAS_TARJETAS` (metas primero, el
  presupuesto al final: hablar de plata antes de la meta es vender antes de diagnosticar), y hasta 8
  preguntas en total con las dimensiones sin evidencia que más importan. Cada pregunta trae tres
  repreguntas plegadas con el método de la siguiente pregunta lógica (el último caso real, la causa,
  cuánto cuesta). Las cuatro objeciones típicas van con LAER, adaptadas a la empresa, más la señal de
  poca apertura (descartar o vender un caso concreto). Sin test y sin nada dicho, arranca con preguntas
  de conexión y la escala en simple. ⛔ El agente no inventa casos de otros clientes: la primera versión
  lo hacía («tuve un cliente en ferretería…») y el prompt lo prohíbe.
- **La guía es material de preparación, no un dato del cliente:** vive en la mitad del agente
  (`propuesta.guia`), se muestra sin «usar» y nunca llega a la propuesta ni al handoff. Se rearma sola al
  final de cada preparación y de cada lectura, dentro de la misma corrida. Sin ella se ve la de base.
- **El agente lee el sitio web de la empresa al preparar**, con candados (`sitio-web-reglas.ts`): solo un
  dominio público, DNS a IP pública, redirecciones manuales dentro del mismo sitio, 8 s y 1,5 MB. Lo que
  dice el sitio es dato, nunca instrucción, y nunca cuenta como evidencia de un nivel. Se pide como un
  navegador común: con un agente propio, HubSpot CMS y Cloudflare responden 403.
- **Lo que no quedó grabado se suma a mano** (pegar o subir) y el agente lo lee como una transcripción.
  Se guarda solo el texto (tabla `ExploracionDocumento`); el archivo sube directo a Supabase, como toda
  subida de la app, y se borra apenas se le saca el texto.
- **«Llegaron por el test» se lee de la NOTA que deja el test, no del contacto** (2026-10-01, noche).
  La propiedad `diag_estado` existe en 41 contactos; la nota («📊 Diagnóstico de Rendimiento» o «⏳
  Diagnóstico SIN TERMINAR»), en 64 fichas desde que arrancó el test (12 de junio de 2026). La lista
  pasó de 4 o 5 empresas a 46: todas las que lo hicieron desde ese día, la más reciente arriba, y las
  que lo dejaron a medias aparte y plegadas (leads más fríos). Las 142 notas completas traen el enlace
  del resultado, así que la preparación también lo saca de ahí: los tests de junio y julio no lo dejaron
  en el contacto, y sin eso arrancaban como si no hubiera test (`lib/exploraciones/llegadas.ts`).
- **Los clientes también entran, marcados** (decisión de Elías: «al final de cuentas son exploraciones
  que se deben hacer»). Quedan fuera las pruebas del equipo (correos de Smarteam, dominios y nombres
  de prueba), HubSpot (aliado), lo que Nexus marca `INTERNO` o `ALIADO` y lo que ya tiene exploración.
  Una prueba que la regla no reconozca se borra en HubSpot: no hay botón para esconderla en Nexus.
- **La exploración usa el MISMO caparazón que el cliente y el proyecto** (pedido de Elías, «incluso
  para reutilizar código»). La cabecera de la ficha y el selector de piezas salieron a componentes
  compartidos (`components/layout/CabeceraDeFicha.tsx`, `components/canvas/SelectorDePiezas.tsx`),
  sin cambiar lo que hacen en el proyecto. Las piezas: Resumen, Exploración, La escala, Casos de uso y
  Propuesta; la abierta queda en la dirección (`?pieza=`). Sin acciones de agente en las filas del
  desplegable: cada pieza tiene las suyas adentro, y un seguimiento de corrida por fila duplicaría
  las consultas.
- **Traspaso se retira; Propuesta pasa a ser una pieza.** Traspaso explicaba qué recibe el CSE y no
  había nada que hacer ahí (Elías: «teoría innecesaria»). De ahí sobrevive un dato, a qué proyecto le
  llega, como una línea en el Resumen. Armar la propuesta estaba al pie de Casos de uso.
- **Objeciones y particularidades son casillas del Resumen, no una entidad aparte.** Las propone el
  agente al leer cada sesión, con su fuente, y el vendedor usa o descarta, como todo lo demás del
  lienzo. Una tabla propia daría consultas entre exploraciones, pero duplicaría el mecanismo de
  proponer y confirmar (fuentes, lápidas, «Usar todas»); si Marketing quiere cruzar objeciones entre
  leads, se lee el JSON. La objeción entra solo con la frase literal del cliente, lleva su clase
  (las cuatro típicas de la guía, más desconfianza y otra) y cómo se respondió; sin respuesta,
  sigue abierta. Las dos son internas: no llegan a la propuesta, y al CSE le llegan en la columna
  interna del contexto. La guía de la próxima reunión retoma las objeciones que ya puso el cliente.
- **Preparación es una pieza propia, antes de Exploración** (pedido de Elías, 2026-10-02), en dos
  columnas: Identificación (el detonante, el contacto, la radiografía de la empresa, la industria y
  el perfil, las áreas en juego, su HubSpot hoy) y Conexión (cómo abrir la conversación, la hipótesis
  de valor y la estrategia de conexión). Exploración queda para las reuniones: arriba, la sesión
  nueva que llegó, de dónde viene (Google Meet, HubSpot o sumada a mano) y el botón para que el
  agente la lea; el historial del agente baja, plegado, al final.
- **Los hechos de HubSpot se leen; lo que interpreta el agente se propone.** El detonante muestra tal
  cual de dónde llegó, el último formulario, las visitas y si agendó (`lib/exploraciones/senales.ts`,
  leído al abrir la pieza y sin guardarse); el «por qué ahora», la radiografía, la hipótesis de valor
  y la estrategia de conexión son casillas que el agente propone y el vendedor usa o descarta.
- **La radiografía se investiga en internet** (decisión de Elías), con la búsqueda web de Anthropic,
  en la misma corrida de preparar y antes de la propuesta principal: lo que encuentra entra también
  como fuente (W1) para la hipótesis de valor y el pitch. Un hito entra solo con un enlace que salió
  en la búsqueda, la versión web de la cita literal. Tres búsquedas: medido con CreditForce, unos
  US$0,27 por preparación. Con cinco, la primera prueba le puso de «herramientas» a sus socios y de
  «hitos» sus páginas de producto: el pedido ahora distingue lo que usa de lo que vende, y una
  noticia de una página.
- **La estrategia de conexión no se arma si ya agendó** (decisión de Elías): con una reunión
  agendada, el agente no la propone y la pieza la muestra plegada con «Ya agendó: no hace falta
  contactarlo».
- **Preparación se llena sola** (Elías, 2026-10-03: «que el agente lo genere, todo de forma
  sugerida»). La primera vez que se abre la pieza en una exploración que no se preparó desde que
  existe la radiografía, el agente prepara solo (unos US$0,27). Y mientras la casilla «Por qué ahora»
  está vacía, se ofrece una sugerida armada solo con los hechos de HubSpot (`porQueAhoraSugerido`),
  para usar con un clic sin esperar al agente.
- **La escala y las áreas en juego vuelven a Exploración**, y «Industria y perfil» pasa a llamarse
  «Escala». Cuando el vendedor elige otra, la sugerida (por la industria de HubSpot o por el agente)
  queda guardada en `edicionElegida.sugerida` y «Restablecer la sugerida» vuelve a ella y se la
  devuelve al agente. Las exploraciones viejas sin sugerida guardada usan la de la industria de
  HubSpot; al preparar, el agente guarda la suya aunque el vendedor ya haya elegido.
- **Exploración: una pestaña por sesión, con «Antes» y «Después»** (Elías, 2026-10-03). «Antes» es
  la guía: las preguntas en dos columnas —«Arquitectura de la venta» (lo que falta del marco; la
  pieza sigue llamándose Resumen) y «Escala de rendimiento»—, con las repreguntas a la vista en vez
  del pliegue, y el manejo de objeciones aparte, abajo. «Después» es la reunión, lo que salió, «Lo
  que se dijo y nadie exploró» (cada punto se lleva a la próxima sesión con un clic, con lo sugerido
  por el agente a la vista) y «Armar la siguiente sesión». La escala, las áreas en juego y los datos
  de la medición pasan a la pieza «La escala».
- **La reunión se liga a su sesión por fecha, y se corrige a mano** (`SesionPlaneada.reunion`). Una
  reunión que no quedó en ninguna sesión aparece como pestaña propia, para no perderla. La guía se
  guarda por sesión (`propuesta.guias`), así el «antes» de una sesión que ya pasó muestra lo que se
  preparó para ella; lo que se lleva a una sesión (`SesionPlaneada.explorar`) entra primero en su
  guía. Sin SQL: todo vive en los Json de la exploración.
- **El lienzo es de escritorio, en tres columnas** (Elías, 2026-10-03: «veo mucha información… no se
  está aprovechando bien el espacio»; aprobó el diseño y pidió aplicarlo). A la izquierda, las piezas
  y, debajo de Exploración, cada sesión: reemplazan al desplegable de piezas y a las pestañas de
  sesión. Al centro, una sola tarea. A la derecha, lo que conviene ver en cualquier pieza: qué sigue,
  lo que propuso el agente por pieza, las ocho casillas del marco en una cuadrícula de colores, dónde
  está cada área y las objeciones ya dichas. Las repreguntas vuelven a plegarse, ahora detrás de un
  enlace en la misma línea, y las objeciones de la empresa quedan plegadas al pie del «antes». En el
  «después», lo que salió se usa o descarta ahí mismo, «nadie lo exploró» se marca con una casilla, y
  la barra para armar la siguiente sesión queda fija abajo. El cajón de las casillas vive en el
  lienzo, así se abren desde cualquier columna. La sesión abierta vive en el lienzo y no se guarda en
  la dirección. Debajo de 1280 px el panel de la derecha baja al final; debajo de 1024 px las piezas
  van en una fila y las sesiones se eligen con una lista en Exploración.
- **Lo que sugiere el agente: azul, en filas, y un solo lugar para revisarlo todo** (Elías,
  2026-10-03: «se ve un poco abultado… no se entiende bien»; aprobó el diseño). Un color, un
  significado en todo el lienzo: azul es lo que sugiere el agente y espera decisión; verde, lo
  confirmado; ámbar, hipótesis o algo que pide atención; punteado, lo que falta (la cuadrícula del
  marco pasó de ámbar a azul en lo sugerido). Una sugerencia es una fila (`FilaSugerida`): qué
  propone, de dónde sale en una línea —la cita entera y el porqué al tocar «ver de dónde sale»— y
  «Descartar» en texto y «Usar» como botón; se fue el rótulo «PROPUESTO». Cada pieza abre con una
  franja azul (cuántas, usar todas) en vez del marco grande de «Hay N propuestas», y «Qué sigue»
  lleva un solo botón al cajón «Lo que sugirió el agente» (`RevisarSugerencias`): todo agrupado por
  pieza y casilla, con filtro, «Usar las N» por grupo y teclas U, D y flechas. «Qué sigue» cuenta
  también los casos de uso, así el número es el mismo que el del cajón.
- **Los fondos azules van con los tokens `info`, nunca con `bg-brand/5` o `/10`** (2026-10-03). En
  modo claro, `globals.css` remapea esos fondos y bordes de marca translúcidos a lila (red de
  seguridad de antes de los tokens): lo sugerido y lo activo salían violetas y no como en el diseño.
  El azul de los textos (enlaces, lo activo, lo sugerido) es `text-brand`, el del diseño, y no
  `text-info-ink`, que es marino. Los diseños del lienzo se arman con los colores reales de la app
  y con su letra: la app no le aplica fuente al cuerpo, así que en Windows se ve en Segoe UI (no
  en Geist, aunque `layout.tsx` la cargue).
  Lo propio del lienzo copia el tablero medida por medida (el fondo gris de la pieza, el control
  Antes/Después, el botón blanco «Rearmar la guía», las etiquetas de las preguntas y los tres botones
  de las sugerencias, en `FranjaDeSugerencias.tsx`); la cabecera es la compartida con la ficha del
  cliente, así que ahí manda la app y el tablero la copia a ella.

## La exploración de venta pasa a llamarse Preventa (2026-10-03)

**Contexto.** Elías: «siento que la exploración es solo una etapa». El módulo cubre el camino entero de
una empresa hasta la propuesta (llega por el test o desde HubSpot, preparación, reuniones, la escala,
casos de uso, propuesta y el traspaso al CSE), y «Exploración» es solo la pieza de las reuniones.

- **Se renombró lo visible y nada más**: el menú, el título, las migas, el volver de la ficha, los
  textos y errores de la pantalla y la API, la columna del contexto del proyecto, el enlace de la
  propuesta y el nombre de las corridas del agente. La dirección (`/sales/exploraciones`), el modelo
  (`ExploracionDeVenta`), los archivos y los SQL siguen igual: es la regla del renombre de «Business
  Case» (el nombre visible es copy; la ruta y el modelo son identidad). Sin SQL.
- **La pieza «Exploración» se queda**: son las reuniones, que es lo que esa palabra describe. Las
  piezas son Preparación · Exploración · La escala · Casos de uso · Propuesta.
- **Los prompts no se tocaron** (el del agente, el de la guía, el bloque de la propuesta y el del
  handoff): el modelo entiende igual, y cambiarlos mueve la salida sin que nadie vea la diferencia.
- **El canvas «Exploración» de un proyecto (el del CSE) es otra cosa** y no cambia.
- Descartados: «Oportunidades» (se confunde con los negocios de HubSpot; una empresa tiene varios
  negocios y un solo lienzo), «Venta consultiva» (largo y suena a curso), «Calificación» (es una
  parte), «Diagnóstico» (choca con el documento del CSE y con el test) y «Prospectos» (también entran
  clientes).

## El listado de Preventa: dos columnas, como el tablero (2026-10-03)

**Contexto.** Primer rediseño hecho con el sistema de diseño «Nexus · interfaz interna» (Claude Design,
el mismo vocabulario del lienzo). Elías lo aprobó y pidió aplicarlo entero.

- **A la izquierda, lo que ya está en curso; a la derecha, lo que llega.** Las preventas en curso, con
  «Planificar con una empresa» (el buscador de HubSpot) debajo; en el panel gris, «Qué sigue» y
  «Llegaron por el test» como bandeja de entrada. El único botón azul, «Planificar una empresa», baja al
  buscador. Debajo de 1024 px el panel baja al final.
- **Cada fila dice qué hacer y cuánto falta**: qué sigue (si es revisar sugerencias, la cuenta va en la
  píldora con la chispa), una barra con un trazo por punto de «lista para proponer», la próxima reunión
  y quién la lleva. La próxima reunión sale de la misma regla que la guía (`proximaReunion`: la próxima
  sesión planeada o, si no hay, la agenda de HubSpot), así el listado y el lienzo no dicen fechas
  distintas. Sin una, «Sin agendar» en ámbar.
- **Filtros: Todas · Mías · Listas para proponer**, en la forma del segmentado (`Segmentos`, el mismo
  componente del «Antes / Después»). «Mías» compara con quien la lleva (`responsableEmail`).
- **`Segmentos` no es el `Segmentado` de components/ui**: ese es un grupo de radios con otra forma, lo
  usa la escala, y cambiarlo movería pantallas que no se están rediseñando.
- **Todo lo sugerido lleva la chispa de IA** (regla del sistema de diseño): en el listado, en las filas
  y píldoras del lienzo, en la barra de piezas, en la cuadrícula del marco y en la franja (18 px).

## Preventa: quién la lleva se elige a la vista, y el resumen se lee en filas (2026-10-05)

**Contexto.** Elías: en el listado «Qué sigue» se cortaba, la barra de «Para proponer» no se entendía,
no había forma de elegir quién lleva una preventa, y el resumen de cada preventa se veía apretado en
cuatro columnas incluso a 1080. Aprobó el tablero «Preventa · listado y resumen».

- **Quién la lleva se elige en la columna «La lleva» del listado y en la cabecera de la preventa**
  (`ElegirResponsable`, sobre `CeldaSelect`), con la misma operación del lienzo (`responsable`). Es lo
  que decide el «Para ti» de cada persona (`lib/para-ti/fuentes/preventa.ts` ya leía
  `responsableEmail`; faltaba poder cambiarlo).
- **Al cambiarla, a la persona nueva le llega un aviso** (`preventa.responsable`, salvo que se la asigne
  ella misma) y el «Para ti» de las dos se vuelve a medir (`olvidarMedicion`): la preventa sale de uno y
  entra al otro sin esperar los dos minutos de la medición guardada.
- **Elegir desde fuera del lienzo no choca con lo que hizo el agente**: si el PATCH vuelve 409 y quien la
  lleva sigue siendo el que se veía, se manda otra vez sobre la versión nueva.
- **«Para proponer» pinta CUÁLES puntos faltan, no solo cuántos** (`FilaDeLaLista.puntos`), con «N de 7
  listos», lo primero que falta en palabras y los siete puntos al pasar el cursor (la capa de tooltips de
  la app, que no recorta la tabla con scroll horizontal).
- **El resumen del marco son filas a lo ancho en tres bloques** (el objetivo; quién y con qué; lo que está
  en juego): la letra, el nombre y su estado a la izquierda, lo confirmado en viñetas a la derecha.

## Preventa: lista para proponer el LAND, notas «Durante» y la escala rediseñada (2026-10-05)

**Contexto.** Elías: la barra «Para proponer» tiene que medir qué tan adelantada está una venta pensando
en el land (el primer proyecto acotado), sin exigir la escala completa; el vendedor necesita dejar en
cada sesión lo que sabe y no quedó grabado; y aprobó el tablero «Preventa · La escala».

- **«Lista para proponer» es lista para proponer el land** (`lib/exploraciones/calidad.ts`): qué frena
  al equipo del land dicho por el cliente (una dimensión de un área en juego por debajo de Funcional,
  con evidencia), una meta en cifras, para cuándo lo necesita, el presupuesto o contra qué lo compara,
  quién firma, qué pasa si no actúa y el siguiente paso con fecha. Salen las 8 dimensiones completas,
  «a quién más le afecta», el portal y lo no explorado: siguen en el lienzo y le sirven al CSE, pero no
  frenan la propuesta del land. «Qué sigue» ya no pide confirmar las 8 dimensiones. Avisa, no bloquea.
  La métrica sigue igual (`meta` y `siguientePaso` conservan su id); las fotos viejas quedan con sus ids.
- **«Durante» es la pestaña de las notas del vendedor**, entre «Antes» y «Después». Se guardan solas en
  `contenido.notas` con la clave `sesion:<id>` (la operación `nota` de siempre, sin SQL), y el agente
  las lee como fuente del vendedor (N0) al preparar y al leer, nombradas con su sesión y rotuladas como
  su contexto, no palabras del cliente. La primera nota de una sesión que no existe (o de una reunión
  suelta) crea la sesión.
- **La escala, como el tablero**: lo que sugiere el agente va arriba y una vez; «Con qué se mide» es una
  fila de filtros con país y tamaño en una línea; las tres áreas son las pestañas del mapa y se suman o
  se sacan desde ahí (se deshace con el mismo botón); los porqués de cada área ya no se escriben (se
  conservan); la rueda pinta cada porción hasta su nivel con la marca ✓ (evidencia) o ? (hipótesis, más
  claro), lleva el nombre de las dimensiones y de las dos capas, y al pasar el cursor por una celda dice
  qué pide ese nivel y dónde está el equipo respecto de él. En esta pieza el panel de la derecha no
  repite dónde está cada área.
- **El desplegable de «La lleva» del listado ya no queda debajo de la fila siguiente**: la casilla no
  crea su propia capa (`z-10`), así el panel fijo sale por encima de todo.

## Preventa: la trabaja todo Customer Success, y la Preparación se lee en dos pestañas (2026-10-06)

**Contexto.** Elías pidió que todo Customer Success pudiera trabajar las preventas, y revisó la de
Polaris Internacional: se veía apretada, repetía información, la hipótesis de valor no decía de dónde
salía cada idea y no había un camino corto para el prospecto que no llega por el diagnóstico.

- **Preventa tiene su propia sección de permisos (`preventa`: ver y trabajar).** La tienen Ventas, Dev,
  la CSL y el CSE por defecto. *Por qué una sección y no darle `ventas` al CSE:* `ventas` abre también
  las propuestas, el TAM y SICOP. Las plantillas guardadas no la traen, así que vale el default sin tocar
  la base. Armar la propuesta comercial desde el lienzo sigue pidiendo `ventas.write`: quien no lo tiene
  ve «La propuesta comercial la arma Ventas».
- **El menú Ventas aparece con `ventas.read` o con `preventa.read`** (gate `anyPermission`), y cada hijo
  pide su celda: un CSE ve solo Preventa, y el clic en «Ventas» lo lleva ahí (`entradaEsHijo`), no a
  Propuestas. Quien lleva una preventa se elige entre quienes tienen `preventa.read`.
- **Un prospecto en preventa es visible para quien trabaja las preventas** (`requireAccessToClient`,
  razón `preventa`). Hace falta para la ficha y los procesos de la empresa. ⚠ Solo si la empresa es
  PROSPECTO y la preventa está viva: una empresa que ya es cliente sigue con el acceso de la cartera.
- **Información del cliente y Procesos van en «La cuenta», aparte de las piezas, como en la ficha del
  cliente, con los MISMOS componentes y sobre la MISMA empresa de HubSpot.** No es una copia: lo que se
  confirma ahí queda en la ficha y en HubSpot, y el CSE lo encuentra escrito cuando la venta pasa a
  proyecto. Queda afuera Licencias (un prospecto no compró nada). Los documentos y la marca viven en el
  proyecto de estrategia de la empresa, así que abrir la preventa se lo crea a un prospecto que no lo
  tiene (mapear sus procesos ya lo hacía).
- **Preparación son dos pestañas, Identificación y Conexión.** Identificación: lo que escribe la IA
  arriba (por qué ahora, su CRM actualmente, la radiografía y su industria), después las señales de
  HubSpot (antes «Detonante») y, en una fila, la ficha de contacto y la ficha de empresa. Conexión: lo
  que no se dijo en Identificación, la hipótesis de valor y la estrategia de conexión.
- **«Su industria» la escribe solo la investigación en internet** (la misma llamada de la radiografía,
  con una búsqueda más) y entra como fuente W2. El agente principal no la puede proponer: sin búsqueda,
  la completaría con lo que cree saber.
- **Cada hipótesis de valor dice de dónde sale, y ese origen lo pone el código** desde las fuentes que
  declaró el agente (tus notas, la investigación de la empresa o de su industria, el diagnóstico,
  HubSpot, una reunión), no el modelo. Una línea por idea y sin «Creemos que».
- **«Para conectar» ya no repite** qué hace la empresa, cómo llegó ni quién es el contacto: solo lo que
  no está en otro lado. Si no hay nada, el agente no lo propone.
- **El flujo liviano empieza por la transcripción.** En «Planificar con una empresa», «Con una
  transcripción» abre la preventa sin prepararla y con «Sumar una sesión o transcripción» abierto (una
  llamada de Gong, una minuta). Ese panel pasó de estar plegado dentro de «Después» a estar arriba de
  Exploración.
- **La alerta de conversación técnica sale de la lectura de cada reunión**, solo de la más reciente y
  solo con la frase literal que lo muestra. Se guarda en la mitad del agente (`alertaTecnica`), la
  reemplaza cada lectura que dice algo de la última reunión y «Entendido» la cierra. Solo avisa: no
  notifica ni cambia nada más.
- **Listado:** la columna «Para proponer» se llama «Progreso», sale «Próxima reunión» (la sigue usando
  «Para ti») y la fila dice cuándo se creó la preventa en vez de con qué escala se mide.

## «Contexto adicional»: el mismo bloque en todas las piezas (2026-10-06)

**Contexto.** En la preventa, lo que no quedó en Meet se sumaba en «¿Una sesión que no quedó en Meet?»,
arriba de Exploración. Elías pidió el bloque del cronograma en su lugar, y el mismo nombre y la misma
forma en todas las piezas de preventas y de clientes. Va por tandas: esta es la primera, sin SQL.

- **Se llama «Contexto adicional» en todas partes**: el cronograma, el diagnóstico, la planificación, la
  ejecución, el handoff (su fila de «Alrededor del handoff») y la preventa. La cáscara es una sola
  (`components/contexto/ContextoAdicional.tsx`): la línea plegable que, cerrada, dice con qué va a
  trabajar la IA, y abierta, las columnas y las «Instrucciones adicionales». Cada pieza pone sus
  columnas, que son las que saben dónde se guarda cada cosa. El chat del cronograma ahora nombra el
  bloque así (su prompt está en el código: se rehace la caché una vez).
- **En la preventa, el bloque va arriba de cada pieza, salvo La cuenta** (es la ficha de la empresa).
  Tres partes: las reuniones de Meet y HubSpot con la empresa, leídas o no; las fuentes manuales (lo
  que antes era «¿Una sesión que no quedó en Meet?»); y las instrucciones adicionales. Con `?sumar=1`
  (la preventa que se abre «Con una transcripción») arranca abierto y con el formulario a la vista.
- **En la preventa las reuniones no se eligen**, a diferencia del cronograma: no hay otro proyecto de
  la misma empresa con el que confundirlas, y el agente ya lee las más recientes sin leer. Elegirlas es
  la tanda 2.
- **Las instrucciones adicionales de la preventa se guardan como una nota más** (`contenido.notas`, la
  clave `instrucciones`): sin SQL. No son una nota sobre el cliente, así que no entran como fuente
  (no se citan ni prueban un nivel): van como un bloque aparte, «INSTRUCCIONES ADICIONALES DEL
  VENDEDOR», que leen la preparación, la lectura de cada reunión, la guía de la próxima sesión y los
  casos de uso (`bloqueDeInstrucciones`).
- **Pendiente, tanda 2 (con SQL):** el mismo bloque en el Kickoff, la Exploración del proyecto,
  Integraciones y la Entrega (una columna `…Override` en `SessionProject` por pieza y que su agente lo
  lea), instrucciones adicionales en los documentos que todavía no las tienen, y elegir reuniones en
  la preventa.

## La escala no nombra herramientas: un mapa al lado dice dónde ayuda cada una (2026-10-01, noche)

**Contexto.** Smarteam se alió con Insider One. Elías pidió que la escala refleje lo que habilita una
plataforma así sin dejar de ser neutral y, después, una vista interna para prender Insider, HubSpot o
Smarteam y ver en qué criterios aplica cada una («no ponerlo explícitamente, sino en qué criterios…
aplica una herramienta u otra»). Preguntó si era buena idea meter esa información en la escala, y
encontró largos y difíciles los textos propuestos.

**Decisiones.**

- **En la escala, capacidades; en un mapa aparte, herramientas.** La 8.7.0 dice qué se ve en Óptimo
  cuando la IA decide sola (qué recibe cada persona, la predicción por persona, los límites escritos,
  el grupo de control) sin nombrar marcas. Las herramientas van en el mapa de herramientas, que nombra
  criterios por su identificador. Si un criterio nombrara a Insider, el cliente leería «para ser Óptimo
  hay que comprar Insider», y cada lanzamiento de un proveedor obligaría a una versión de la escala.
- **Textos cortos.** Cada criterio nuevo o precisado mide lo mismo que el de hoy o poco más, sin
  incisos ni listas de ejemplos; donde el criterio ya era largo, se cambia una frase en vez de sumar
  otra. Un «requiere» va solo donde el criterio no se puede cumplir sin el otro, como define la escala.
- **Lo habilita, no lo cumple.** Que una herramienta aparezca en un criterio quiere decir que trae lo
  que hace falta para cumplirlo; el nivel lo sigue dando la evidencia. Solo se mapean Funcional,
  Eficiente y Óptimo.
- **El mapa se publica con la escala, con su propia versión.** Es un cuarto documento en la misma
  tabla, sin SQL. Una versión nueva del mapa no entra si nombra un criterio que la escala no tiene; una
  ya publicada no frena una escala nueva (lo que quedó sin criterio se avisa y la pantalla lo ignora).
- **La marca va encima; el color sigue siendo el nivel.** Con herramientas prendidas, cada celda de la
  rueda lleva un punto con la sigla de las que ayudan ahí, en vez de su número, y las demás se aclaran;
  en la matriz y en la escalera, cada criterio dice qué aporta cada una. Pintar la celda con el color de
  la herramienta la confundiría con un nivel: el celeste de Smarteam es casi el azul de Eficiente.
- **Smarteam, con su catálogo.** Su capa marca lo que se crea, se integra, se ordena o se adopta, con el
  nombre del servicio que lo entrega: implementación, rescate, CDP y activación, integraciones, RevOps,
  migraciones, sitio web o SmartLoop.
- **Interno.** Solo lo leen la sección de la escala y el script que la publica; una prueba impide que
  lo importe cualquier otra parte (propuestas, handoffs, reportes, landings).

**Pendiente.** Quién es el dueño del mapa: lo tiene que revisar cuando cambian HubSpot o Insider.

## El cronograma cabe en lo acordado: fecha límite, duración vendida y fases en paralelo (2026-10-02)

> Validación de Elías sobre los 50 cronogramas activos. La fecha en que el cliente necesita todo
> listo y las semanas vendidas no existían como dato en ningún lado: el cierre fijado a mano solo
> cambia la fecha que se muestra. En 7 de las 14 cuentas donde el handoff nombraba la duración, el
> plan que armó la IA se pasaba, y ningún handoff lo dijo. Caso real: Club Amantes del Vino, vendido
> en 12 semanas con Salesforce venciendo el 31 de diciembre; el handoff lo sabía, propuso 16 semanas
> hasta el 11 de enero, y el aviso de la propuesta lo presentó como mejora («el cierre se adelanta 23
> días»). Los inicios: el prompt decía «por defecto SECUENCIALES», y la capacitación iba después de toda
> la configuración en 15 de 19 cronogramas.

- **Dos datos nuevos en `ProjectTimeline`: `fechaLimite` y `duracionVendidaSemanas`.** No se reusó el
  cierre fijado a mano: ese dice qué fecha se MUESTRA; estos, hasta dónde PUEDE llegar el plan. En CAV
  alguien había fijado el cierre en la fecha límite y eso escondía que las fases terminaban después.
  SQL aditivo: `scripts/sql/2026-10-02-limites-del-cronograma.sql`.
- **La duración vendida NO incluye la Semana 0** (decisión de Elías). Se compara contra el ancho de
  calendario menos las semanas de la Semana 0 (`semanasDeArranque`, solo en pipelines que la tienen).
- **Pasarse AVISA, no bloquea** (decisión de Elías): ni «Subir al cliente» ni aplicar una propuesta
  se frenan. El aviso vive arriba del Gantt (`LimitesDelCronograma`), en la barra de la propuesta
  (`avisoDeLimites`, aparte de las 5 líneas), marca la semana en la cabecera del Gantt y entra al
  contexto del chat. La regla y los textos: `lib/timeline/limites.ts` (puro, probado con CAV).
- **La IA propone; confirma Ventas, y si Ventas no, el CSL o el CSE** (decisión de Elías). Queda
  escrito quién y con qué rol (`limitesConfirmacion`). El permiso es el de editar el cronograma: no
  se creó una celda nueva. Un valor de la IA sin cita no se propone; con cita que no aparece tal cual
  en lo que leyó, se muestra para revisar pero no dispara avisos (`citaVerificada`). Sin confirmar,
  el aviso funciona con lo propuesto y lo dice.
- **Mover un límite confirmado es un acuerdo con el cliente**: pide motivo y con quién se acordó
  (`validarCambioDeLimite`), y deja la razón en `TimelineChange` (la misma que la cartera muestra
  como el porqué).
- **El bloque del handoff va en el MENSAJE, no en el prompt** (`lib/timeline/limites-handoff.ts`):
  vale para los tres agentes de handoff sin re-sembrarlos. Pide la clave `limites`, que el plan quepa
  y que, si no cabe, lo diga en `noCabe` en vez de estirarlo.
- **Los inicios de las fases los pone el código, no la IA** (Customer Success; Desarrollo y Web
  tienen su propia secuencia). La IA declara el `tipo` de cada fase y `acomodarEnParalelo` aplica la
  regla de Elías: configuración, migración y desarrollo juntos; la capacitación en la SEGUNDA MITAD
  de la configuración (de la de su Hub si la nombra); pruebas al terminar la configuración; cierre al
  final. Reemplaza la regla de PARALELISMO del prompt. Es la misma doctrina que el plazo del paso 1:
  la aritmética de semanas la hace el sistema.
- **El código nunca alarga un plan.** Si con la regla queda más largo que como lo armó la IA, se
  queda el de la IA. Medido sobre los 38 handoffs de Customer Success activos: acomoda 6 (CAV pasa de
  16 a 12 semanas), deja 2 que alargaba (Metzger 10 → 12, Grupo Inve 9 → 10) y 30 sin tipo reconocible
  (son de antes; desde ahora la IA lo declara).
- **El paso 1 de «Regenerar todo» compara contra el fin real de las fases** cuando el cierre fijado
  a mano queda antes (`cierreActualDelPlan`: vale el más tarde de los dos), y con un plazo pasado ya no
  dice «no piden cambios de tiempos» (`AVISO_SE_PASA_DEL_PLAZO`).

**Pendiente:** el cronograma por resultados (fase 2, solo diseño), conectado a `Project.handoffResultados`.

## La Planificación es lo que va a quedar configurado en HubSpot (2026-10-02)

> Pedido de Elías: la Planificación es la parte práctica. Caroline Bersot la presenta al cliente como
> la arquitectura de HubSpot armada por fuera, para que la vea antes de configurar. El nombre se
> queda «Planificación», para que el equipo piense en estrategia y no solo en HubSpot.

- **Solo lo que se hará.** Cómo opera hoy el cliente, el problema y el enfoque viven en el
  Diagnóstico (la política rectora volvió allá el mismo día, en otra sesión). La sección de procesos
  pasa a «Cómo van a funcionar tus procesos»: pasos en orden, sin la columna «hoy». Misma key
  (`definicion_procesos`); lo viejo se lee con `adoptarProcesos` y muestra el párrafo «cómo será»
  hasta regenerar.
- **Las secciones nuevas** (`components/landing/sections-planificacion.tsx`, forma y lectura de lo
  viejo en `lib/planificacion/`): etapas del ciclo de vida en tabla, propiedades por objeto (una
  pestaña por objeto), pipelines de leads, ventas y servicio con las etapas de izquierda a derecha,
  «Automatizaciones» (no «Workflows») y «Conversaciones» (no «Chatbots»: mensajería instantánea,
  incluidos los agentes de IA para WhatsApp). Las etapas se encogen para entrar en una fila, como el
  Gantt: sin scroller, porque el documento se exporta a PDF.
- **Cada cosa dice de dónde sale** (`lib/planificacion/origen.ts`): acordado (en una reunión con el
  cliente, que se cita), propuesta de Smarteam o supuesto. Lo que solo dice una nota interna o el
  handoff no cuenta como acordado. Es el mismo criterio que se pidió para los mapas de procesos
  (caso FUNDAUNA: el «punto de venta» HiOkus no salió de ninguna reunión); la mejora del módulo de
  procesos en sí quedó para después, a pedido de Elías.
- **Propiedades, pipelines y procesos de marketing se mudaron de Ejecución.** Ejecución queda en
  CÓMO se construye (prompts para Breeze y lo que va a mano) y lee de la Planificación solo lo
  visible: una sección oculta no se construye. Las tres secciones viejas quedan solo-lectura y se
  ocultan al regenerar. Por primera vez una mudanza copia el contenido:
  `scripts/migrar-planificacion-practica.ts` (simulacro por defecto; nunca pisa una sección con
  contenido; se corre DESPUÉS del deploy, porque el código viejo no pinta las secciones nuevas).
- **Las propiedades están pensadas para las plantillas de Excel de Caroline**, que todavía no
  llegaron: campos propios para lo que trae cualquier plantilla, y fuera del esquema del agente un
  `id`, un `autor` y un mapa `extra` para las columnas sin campo propio. Al regenerar,
  `fusionarFilas` reemplaza solo las filas del agente: las de una persona o de una plantilla
  quedan. ⚠ «Mejorar con IA» y el chat todavía reescriben la tabla con el esquema del agente (pierden
  `id`/`autor`/`extra`): hay que pasarlos por la misma fusión cuando llegue la importación.
- **Se retiran la hoja de ruta** (el orden vive en el Cronograma y en las acciones del Diagnóstico)
  **y las métricas de éxito** (los OBJ del Diagnóstico). Solo-lectura y ocultas al regenerar, como
  la política rectora.
- **Todas las secciones se pueden ocultar, también la portada y la aprobación.** Hizo falta en tres
  lugares: la def (sin `noHide`), el PDF (la portada y el cierre los arma el motor aunque no tengan
  fila; ocultos salían con el texto por defecto, y el idioma se leía de la portada filtrada) y el chat
  (`ocultable`, separado de `movible`: siguen sin moverse).
- **Rutinas de adopción y despliegue por olas se quedan** hasta que exista el documento de Puesta
  en marcha, que es a donde van. Ese documento enmienda la decisión de que Adopción es un hito sin
  documento, como pasó con la Entrega el 2026-08-12.

## La escala toma el sistema «Nexus · interfaz interna» (2026-10-03)

**Contexto.** Elías pidió verificar que la sección de la escala cumpliera el diseño nuevo sin tocar
el código; el resultado fue un tablero en Claude Design con las tres vistas rediseñadas y la lista de
lo que no cumplía. Lo aprobó con «Aplícalo todo», incluidas las dos propuestas: los colores de nivel
como tokens del sistema y el segmentado nuevo también en Preventa.

- **Un solo botón azul por pantalla.** La cabecera pasa a `PageHeader` (el único h1) con la versión y
  el estado como chips blancos, y «Cómo leer la escala», «Comentarios» y «Descargar .md» como botones
  claros. En el mapa, el azul es «Recorrer de Deficiente a Óptimo», que sale del centro de la rueda y va
  arriba, junto a «Qué muestran las celdas» (Pausar · Seguir subiendo · Otra vez). «Leer la dimensión»
  pasa a botón claro.
- **Los filtros, sin tarjeta**, cada uno con su rótulo arriba. El segmentado sirve para dos a cuatro
  opciones: la industria (cinco) y «Qué muestran las celdas» (seis) pasan a lista. Las dos preguntas del
  perfil son dos filtros separados. El aviso de las herramientas («Lo habilita, no lo cumple») es un
  `Alert` informativo.
- **El color dice el estado, y el verde no es adorno.** Funcional se marca con un chip blanco «La base»
  (sin teñir su columna ni su tarjeta), el resultado de cada nivel va en un bloque neutro y el punteado
  queda solo para lo que falta: lo que requiere o lo que lo requiere se marca con borde lleno. Los
  comentarios abiertos y los riesgos van en ámbar (piden atención); lo activo, en azul.
- **Los colores de nivel son tokens propios** (`--color-nivel-deficiente` … `--color-nivel-optimo`, los
  mismos valores de antes): son la identidad del nivel, no un estado, así que ya no dependen del rojo de
  «peligro» ni del verde de «confirmado». Quedaron también en el sistema de diseño. Los puntos de nivel
  son redondos y van con su nombre.
- **«Por dimensión» es un lienzo de tres columnas**, como el de Preventa: las dimensiones a la izquierda
  (232 px, fijas), la dimensión al centro con sus niveles en tarjetas blancas sobre gris, y a la derecha
  el contexto (300 px): cómo se ve el área en un nivel (una lista), la dimensión en las tres áreas, qué se
  trabaja primero y dónde se cuenta la evidencia, que antes iba al pie. En pantallas angostas el panel
  baja.
- **Medidas del sistema**: títulos 22/700 y 15/600, pregunta 14,5/600, criterios de la matriz en 13 px,
  rótulos de 11 px en gris (las capas ya no van en azul), identificadores con números tabulares en vez de
  letra de máquina, radios de 12 px (no 16), página con `space-y-6`. La rueda va sin halo ni sombra.
- **El `Segmentado` de components/ui toma la forma del sistema** (la misma de `Segmentos`): carril gris
  de radio 10, opciones de 13 px y la elegida blanca con `shadow-segment`, la única sombra. Cambia
  también en las pantallas de Preventa que lo usan (papel en la decisión, canal, apertura a la asesoría,
  perfil y «Sumar una sesión»), que así quedan iguales a sus subpestañas. `PageHeader` suma `badges`
  (chips junto al título) y, en un celular, baja las acciones debajo del título.
- **No se repite un dato**: el pie ya no dice la versión (está en la cabecera) y el aviso de herramientas
  no repite la cuenta de cada una (está en su chip).

**Pendiente.** El isotipo de Smarteam sigue siendo una reconstrucción hasta tener el SVG oficial.

## Marketing toma el sistema «Nexus · interfaz interna» (2026-10-04)

**Contexto.** Elías pidió rediseñar Marketing con el sistema nuevo (tablero en Claude Design «Marketing ·
rediseño») y lo aplicó. Medido ese día en producción: 75 publicaciones sugeridas sin revisar (la más vieja del
3 jul), 15 de ellas el mismo ángulo («El 33 % / 67 % del tiempo de ventas…»), 56 ideas de SEM sin revisar nunca, y
la tanda configurada en 1 publicación de empresa y 0 de perfil personal: las últimas 10 tandas trajeron 1 cada una.

- **El menú pasa de 3 grupos con pestañas a 7 páginas en dos bloques**: «Revisar» (Publicaciones, Ideas de SEM)
  y «Lo que lee el agente» (Temas, Audiencia, Voz de marca, Fuentes), más Generación suelta. Cada página pone su
  PageHeader con su nombre (antes todas decían «Marketing»). Las RUTAS no cambian (`/marketing/contenido` es
  Publicaciones): son identidad, hay enlaces pegados. La única con pestañas es Audiencia (ICP y buyer personas).
- **Publicaciones es una bandeja**: lista a la izquierda, la publicación elegida a la derecha, en vez de tarjetas
  de 552 px una debajo de otra. Pestañas con su cuenta, tipo en segmentado, atajos A / D / ↓ ↑ para quien edita.
- **Las parecidas van juntas** (`lib/marketing/parecidas.ts`, sin IA): un título entra a un grupo si comparte con
  un tercio de sus miembros 2 o más palabras con contenido (raíz de 4 letras), que pesen el 60 % del más corto y el
  30 % del más largo. Se probó primero la cadena simple y encadenaba de más (en SEM juntaba 24 ideas por «Google
  Search»); en SEM además se ignoran el canal y el público. Es una ayuda para revisar: nada se descarta solo.
  «Descartar las otras N» (`POST /api/marketing/ideas/descartar`) es reversible.
- **«Ajustar con IA» deja una propuesta** que se usa o se descarta; antes reemplazaba el texto. El endpoint ya
  devolvía sin guardar: el cambio es solo de pantalla.
- **«Copiar texto» lo tiene todo el equipo**, también quien solo mira: antes estaba detrás del permiso de editar y
  un CSE no podía copiar una publicación para su perfil. Copiar no cambia nada.
- **Las ideas de SEM se leen por campos** (`lib/marketing/idea-sem.ts`): el agente escribe un párrafo con ~20
  rótulos distintos para 6 cosas; una lista cerrada los junta. Medido sobre las 56: 51 se separan completas y
  ninguna pierde texto. Si algún día el agente las devuelve por campos, el lector sobra.
- **La tanda se guarda sin correr el motor** (`PUT /api/marketing/tanda`); antes solo al apretar «Generar», así
  que nadie sabía qué pedía el cron. Con 2 o menos por tanda, un aviso ámbar lo dice.
- **Fuentes dice qué aporta cada perfil**: posts de los últimos 3 meses y cuántas publicaciones lo citan. Medido:
  Yamini aparece en las 112; Kyle, con cinco veces más posts recientes, en 6.
- **Se fue lo que no servía**: emojis de estado, el recuadro oscuro del concepto de imagen (ahora punteado: la
  imagen no existe, se diseña aparte), los botones falsos «Me gusta / Comentario / Compartir» y las tarjetas
  «Tier 2 / Tier 3 · Próximamente» del ICP. La fuerza de una señal del ICP se dice con marcas (●●●, ●●○, ●○○, ✕),
  no con colores.
- Las constantes que lee el navegador viven en `lib/marketing/marketing-ui.ts`, sin zod (regla C-24);
  `schema.ts` las re-exporta. `lib/marketing/tuteo.test.ts` vigila el tuteo de todo Marketing, menos los prompts
  de los agentes.
- **Pendiente**: los números del submenú (75, 56, 1 del diseño) no están: el sidebar no tiene de dónde sacarlos
  sin sumar consultas a cada navegación.

## Feedback desde cualquier pantalla (2026-10-04)

**Contexto.** Elías hace sesiones para que cada persona le diga qué mejorar de la interfaz, y la mitad no se acuerda de lo que le molestó. Pidió un módulo de feedback en todo Nexus: reportar en el momento, con la pantalla guardada, armar una hoja de ruta de mejoras y ver quién reporta más. Diseño aprobado en Claude Design («Feedback · diseño»).

- **«Feedback» vive fijo en el pie del menú** y abre un panel a la derecha que NO tapa la pantalla (como el chat del asistente). Pestañas: «Dar feedback» y «Mis reportes». «Lo que viene» (la hoja de ruta a la vista del equipo) quedó para después, por decisión de Elías.
- **Tres tipos con palabras de todos los días**: Algo falla · Una mejora · No se entiende. Una falla pregunta si frena el trabajo; si sí, llega como urgente.
- **La captura se arma en el navegador** (modern-screenshot), sin pedir permiso: un clic. Sale distinta en canvas y mapas; si falla, el reporte sale igual con la dirección. Va al almacén PRIVADO de documentos (puede mostrar datos de un cliente o de Finanzas) y se lee con enlace firmado. «Señalar algo» marca hasta 3 cosas: las marcas salen en la captura y guardan el nombre de lo que se tocó. Con cada reporte van la dirección exacta, el rol, el navegador, la versión de Nexus y los errores de la pantalla de los últimos 10 minutos.
- **Lo que ve la persona al mandar depende de qué mandó**: una mejora festeja en toda la pantalla (confeti con los colores de MARCA, no los de estado; sin nombres; no bloquea; sin confeti si la computadora pide reducir movimiento). Una falla que frena: «Reportado como urgente», con número (F-128) y lo que ya quedó guardado. Lo demás: el «Recibido» verde.
- **Revisa el feedback el rol SUPER_ADMIN** (`esRevisorDeFeedback`), en /feedback: Bandeja, Hoja de ruta, Personas y Encuestas.
- **Un reporte NO es un tema y nada entra solo a la hoja de ruta.** En la Bandeja cada reporte tiene tres salidas: «Llevar a la hoja de ruta» (sumarlo a un tema o crear uno nuevo eligiendo la columna), «Responder y cerrar» y «No se hará» (con motivo, que la persona ve). Un tema nuevo entra en «Por decidir» salvo que se elija otra columna; también se crea a mano con «Nuevo tema» (lo que alguien dijo en una sesión). Cada tarjeta dice de dónde salió.
- **El estado que ve quien reportó sigue al tema**: si el tema avanza, su reporte también, y le llega el aviso de cada paso (desde el 2026-10-07: «Listo» es hecho y «En Nexus» es subido, ver abajo).
- **«Se parece a» no es IA (v1).** La sugerencia de tema sale de contar palabras en común (`lib/feedback/parecidos.ts`), así que va SIN la chispa y dice qué palabras comparten. Pasarla a un agente es una tanda propia (AgentRun, costo, prompt).
- **Los avisos van por «Para ti», no por un contador propio**: `feedback.nuevo` al frente FEEDBACK (Super Admin lo lleva por defecto), `feedback.respuesta` y `feedback.estado` a quien reportó, con `/para-ti?feedback=<id>`: ese parámetro abre el panel en el reporte desde cualquier pantalla.
- **El pedido de opinión** es la respuesta a «no se acuerdan»: dirección le pregunta algo concreto a alguien sobre una pantalla, y le aparece al entrar ahí (abajo a la derecha: no se puede meter dentro de cada página) hasta que responda o diga «Ahora no». Responder abre el panel con la pregunta arriba.
- **El festejo y la capa de «Señalar» no son diálogos**: quedan declarados con su motivo en `lib/ui/token-vocab.test.ts` (`CAPAS_QUE_NO_SON_DIALOGOS`), no como deuda.
- **«Generar prompt» (2026-10-05, pedido de Elías)**: lo que queda por hacer —un reporte sin revisar o en la hoja de ruta, y cada tema que no está «Listo»— trae un prompt sencillo para aplicarlo en Claude Code. Lo arma una plantilla (`lib/feedback/prompt.ts`), no un agente: sale al instante, no cuesta y no lleva la chispa. Da por hecho que Claude Code ya tiene el proyecto abierto: dice qué hacer con las palabras de quien lo pidió, dónde se ve (la ruta con los ids cambiados por `[id]`, como la carpeta de `app/`), lo que marcó, los errores de la consola y los últimos mensajes. No lleva nombres ni correos (solo el rol y «Dirección»), ni el enlace de la captura (vence en una hora: dice que se pida). Lo de la escala manda a `docs/escala/` y a no publicar. El del reporte se arma en la pantalla con lo que la bandeja ya cargó; el del tema, en el servidor (`GET /api/feedback/temas/[id]`, solo quien revisa).
- **Rendimiento (2026-10-06, Elías lo sintió lerdo en Clientes).** La captura copiaba `document.body` entero aunque la imagen es solo la ventana, y la librería copia los estilos calculados de cada elemento en el hilo de la pantalla: medido con 12.000 elementos, 15,5 s con el navegador trabado. Ahora deja afuera lo oculto y lo que queda entero debajo o a la derecha de la ventana (`fueraDeLaCaptura`): 1,1 s y la misma imagen, píxel por píxel, también con la página desplazada. Lo de ARRIBA no se saca porque correría lo visible. Además, cada imagen espera como mucho 3 s; la captura se sube mientras se escribe (una captura reemplazada queda sin reporte en el almacén privado); y el aviso a dirección sale con `after()`, después de responderle a quien reporta. Producción estaba sana ese día (el hilo del servidor, sin atraso).
- **La hoja de ruta, rediseñada (2026-10-06, pedido de Elías; diseño aprobado «Hoja de ruta · rediseño» en Claude Design).** Los temas se arrastran entre columnas con dnd-kit, la librería que ya usan el Gantt y Documentación (sin dependencia nueva): al pasar el mouse aparecen los puntitos para agarrarlos, y con el dedo hay que mantener apretado un momento, así deslizar sigue desplazando la página. Arrastrar cambia la columna, no el orden (el de adentro sale de cuántas personas lo pidieron y a cuántas les frena). Se fueron «Mover a…», la explicación «Cómo llega un tema a la hoja de ruta» y la ayuda debajo de cada columna. Un clic abre el tema en un panel a la derecha que no oscurece el tablero: qué pide (se edita ahí), dónde se nota, de dónde salió, su columna (el camino por teclado: `Segmentado` con `lleno`), «Generar prompt» y cada reporte con «Abrir en la Bandeja» (`reportesDelTema`, por el GET del tema). ~~El panel tapa «Listo», así que arrastrar lo cierra~~ (superado el mismo día por el rediseño de las cuatro pestañas, abajo: el tema se abre en el panel de la página y ya no tapa nada). La tarjeta se ve en su columna nueva antes de que el servidor responda; si falla, vuelve. Pasar a «Listo» un tema que pidió alguien pide confirmación, porque le avisa que ya está en producción. «Generar prompt» es de lo que queda por hacer: un tema «Listo» y un reporte cerrado no lo llevan.
- **Cada reporte vive en UN lugar (2026-10-06, pedido de Elías).** La Bandeja es para lo que espera una decisión: «Sin revisar», «Te respondieron» (lo cerrado en lo que la persona volvió a escribir) y «Cerrados» (respondido o «No se hará», para buscarlo o deshacerlo). Lo que se lleva a la hoja de ruta SALE de la Bandeja y vive en su tema: en el panel del tema, clic en un reporte lo muestra entero, con las MISMAS piezas que la Bandeja (`DetalleDelReporte.tsx`: la escala, la captura, lo que se mandó y la conversación) y «Devolver a la Bandeja» para decidir de nuevo. *Por qué:* «Todos» mezclaba lo decidido con lo pendiente, y lo de la hoja de ruta se veía a medias en el tema y entero en otra pestaña. La conversación de un reporte que está en un tema se contesta desde el tema: si la persona vuelve a escribir, la tarjeta y la fila del reporte dicen «Te respondió», en ámbar, hasta que lo abres. Un enlace viejo a `/feedback?reporte=` de un reporte que está en un tema (un aviso de «Para ti», por ejemplo) abre ese tema (`enlaceAlTema`).
- **Las cuatro pestañas, con el esqueleto de Clientes y Preventa (2026-10-06, Elías: «Rediseña todo, es que no se ve bien»; diseño aprobado «Feedback · rediseño completo» en Claude Design).** El panel de la derecha va a toda la altura, al lado del título, y se pliega con su flechita (`PanelLateral`); antes cada pestaña lo ponía debajo de las pestañas, en una franja de borde a borde que se cortaba donde terminaba el contenido (con la Bandeja vacía, media pantalla en blanco). Cada pestaña pinta el esqueleto entero (`components/feedback/admin/Disposicion.tsx`) porque lo que va en el panel depende de lo que se eligió adentro. Debajo de las pestañas va una sola fila de herramientas, y las pestañas llevan su número: lo que espera una decisión en la Bandeja (sin revisar y lo cerrado en lo que te volvieron a escribir) y los temas abiertos (`cuentasDeLasPestanas`). En la Bandeja, los filtros salen de la columna angosta (se partían en dos líneas) a la fila de herramientas, los menús del navegador pasan a botones blancos con su flecha, y la lista y el reporte van en un solo marco, como un correo, con el reporte encabezado por su número, su tipo y si le frena; el tema al que se parece pasa al panel. Sin nada que mostrar, el marco lo dice con su acción en vez de una lista vacía y un «Elige un reporte» suelto. En la Hoja de ruta, el tema se abre en el panel de la página, que se ensancha a 440 px (560 con un reporte abierto) y se queda fijo al bajar: ya no tapa la columna «Listo», así que se puede arrastrar con un tema abierto; sin tema, el panel dice qué sigue. Personas lleva los cuatro números en una sola franja.
- **«Tiempos» pasa a llamarse «Encuestas» y junta todo lo que le preguntas al equipo (2026-10-06, decisión de Elías).** Él propuso el nombre, más abierto que «Tiempos»; la condición para que el nombre no mintiera era sumar los pedidos de opinión, que vivían en Personas: con el nombre nuevo y sin ellos, quedaban dos lugares para preguntar. Ahora Encuestas tiene «Preguntas a una persona» (cada pedido con lo que contestó: la respuesta es un reporte y se abre en la Bandeja o en su tema, `datosDeEncuestas`) y «¿Cuánto te tomó?», con el formulario «Pedir su opinión» en el panel (el único botón azul; pasó a un cajón el mismo día, ver abajo). Personas queda para quién reporta y quién no: se marca a quién preguntarle y su botón lleva a Encuestas con esas personas elegidas (`?vista=encuestas&para=`). `?vista=tiempos` sigue abriendo Encuestas. El módulo de tiempos (`lib/tiempos`) no cambia de nombre: el nombre de la pestaña es copy.
- **Encuestas, rediseñada para que se entienda cómo se usa (2026-10-06, Elías: «No es tan entendible la forma de utilizar las encuestas para obtener feedback del equipo»; diseño aprobado «Feedback · Encuestas (v2)» en Claude Design).** Las dos clases se eligen arriba: «Tus preguntas» (las escribe dirección) y «Automáticas» («¿cuánto te tomó?»); la clase va en `?clase=` sin volver a pedir la página. Una pregunta mandada a varias personas se lee como UNA tarjeta y no como una fila por persona (`agruparPedidos`, lib/feedback/encuestas.ts: mismo autor, texto, pantalla y plazo): quién contestó, a quién se le espera y si ya la vio, y lo que dijo cada uno. Está abierta mientras a alguien todavía le aparece (la misma regla de la burbuja, `pedidoAplica`); después, cerrada. El formulario dejó el panel: «Nueva pregunta», el único botón azul, abre un cajón con cuatro pasos y la burbuja tal como la ve la persona (`CuerpoDelPedido`, el mismo componente que la burbuja real, así la vista previa no puede mentir). Sin preguntas, la pestaña explica cómo funciona en tres pasos y ofrece preguntas para empezar. El panel dice qué sigue (primero, las respuestas que esperan una decisión en la Bandeja), quién no reporta hace 30 días con «Preguntarle» y qué es cada clase. En Automáticas, una tarjeta por momento con su interruptor y cómo le aparece a la persona, y debajo lo que dicen las respuestas; los documentos publicados quedaron solo en el CSV, porque la carga todavía no tiene un supuesto por documento.
- **Cada reporte va a su propio tema; se junta solo lo que pide LO MISMO (2026-10-07, Elías: «deberían ser los reportes individuales… cada reporte tiene su propia pantalla… y debería poder generar su propio prompt»).** En la hoja de ruta, el tema «Finanzas» había juntado dos pedidos distintos de Alex (desestimar cobros en Conciliación y corregir una quincena pagada en Planilla): «Llevar a la hoja de ruta» abría en «Sumarlo a un tema» apenas existía uno. Ahora abre en «Su propio tema», con el nombre propuesto desde la primera frase del reporte (`nombreDesdeElReporte`, lib/feedback/reglas.ts), y en «Con otro que pide lo mismo» solo si «Se parece a» encontró uno. Los temas siguen existiendo: cuando varias personas piden lo mismo, el tema las cuenta y eso ordena la columna. Dentro de un tema, cada reporte tiene su propio «Generar prompt» (su pantalla, sus marcas y su conversación) y «Separarlo en su propio tema» (`accion: "separar"` en `/api/feedback/[id]/decision`): el tema nuevo queda en la MISMA columna, así a quien lo pidió no le cambia el estado ni le llega un aviso. Si el que sale es el reporte del que nació el tema, el que queda pasa a ser su origen y su pantalla. Con un solo reporte no hay nada que separar.
- **«Listo» es hecho; «En Nexus» es subido (2026-10-07, Elías: «cuando se ponga en listo, que ya está el cambio hecho y que en la próxima subida se agregará; y cuando se suba, que ya se aplicó y puede volver a probar»).** La hoja de ruta tiene cinco columnas: Por decidir · Planeado · En curso · Listo · En Nexus (clave `subido`, sin SQL: la columna es texto). *Por qué:* «Listo» le decía a la persona «ya está en Nexus» el día en que el cambio quedaba en el código, y entre una subida y otra pasan días: probaba y no encontraba nada. Ahora, al avanzar, a quien lo pidió le llega cada paso en «Para ti»: «En curso» (se está haciendo), «Listo» (ya está hecho y llega con la próxima subida) y «En Nexus» (ya lo puede probar; si algo no quedó, que lo cuente desde Feedback). Volver a una columna anterior no avisa. Para quien reportó, «Listo» se lee «Hecho, en la próxima subida» y todavía no es verde; verde es «Ya está en Nexus». «Listo» se ve en la hoja de ruta hasta que se sube; «En Nexus», 28 días. Después de cada subida, «Ya se subió» (en la columna «Listo», `POST /api/feedback/temas/subir`) pasa todo lo de «Listo» a «En Nexus» de una vez, con la misma regla que moverlos a mano. Se llama «En Nexus» y no «Deploy» porque es lo que lee la persona: que ya está donde lo usa.

## Recorridos guiados: React Joyride, con el contenido en el repo (2026-10-04)

> Elías pidió una librería de las mejores para recorridos por rol: que se avance con «Siguiente» y
> «Anterior», y que cada pantalla tenga un botón «Recorrido» para volver a verlo. El diseño está en
> «Recorridos · diseño» (Claude Design, sistema «Nexus · interfaz interna»). Se aplicó con el
> ejemplo de la ficha del cliente.

- **La librería es React Joyride v3** (MIT, soporta React 16.8–19, versión 3.2.0). El globo es un
  componente nuestro (`tooltipComponent`) con los tokens del sistema, el foco queda encerrado en el
  globo, y la librería se carga recién cuando arranca un recorrido. Se descartaron Shepherd.js e
  Intro.js (AGPL-3.0: el uso comercial pide licencia paga) y Onborda (sin versiones desde diciembre
  de 2024). driver.js es la alternativa liviana si Joyride molesta, pero su globo no es React.
- **El contenido vive en el repo** (`lib/recorridos/registro.ts`), no en la base: se revisa como
  código y viaja con el deploy («por ahora los manejamos acá», Elías). Sumar un recorrido son tres
  cosas: una entrada en el registro, un `data-recorrido` en cada cosa que señala y la prop
  `recorrido` en la cabecera de su pantalla (`PageHeader` o `CabeceraDeFicha`).
- **Un paso señala lo que está a la vista, o no sale.** El proveedor busca el primer elemento visible
  con ese `data-recorrido`. Un botón que el permiso esconde, el panel oculto o una propuesta que no
  existe nunca dejan un globo señalando el vacío. El filtro por rol es aparte y tiene dos capas:
  quién ve el recorrido y quién ve cada paso.
- **Lo visto vive en una cookie** (`nexus-recorridos`), como el tema y el ancho del menú: el
  servidor la lee y el punto azul del botón aparece desde el primer pintado. Perderla cuesta un
  punto azul de más. Pasarlo a la base (para que valga en las dos computadoras, o para medir dónde
  se sale la gente) es cambiar solo `lib/recorridos/vistos.ts`.
- **Subir la `version`** de un recorrido le vuelve a mostrar el punto azul y «Cambió» a quien ya lo
  vio. Se sube cuando la pantalla cambia lo suficiente.
- **El recorrido no arranca solo.** La primera vez que alguien entra a una pantalla con un recorrido
  sin ver, el botón ofrece verlo con una invitación sin velo. Sale una vez por sesión del navegador
  y se cierra con «Ahora no», que cuenta como saltado. Se apaga con `INVITAR_LA_PRIMERA_VEZ`.
- **El recorrido va en la capa `TOUR` (90)** de `lib/ui/z.ts`: encima de cajones y modales, debajo
  de los avisos. La librería pinta el velo y el borde azul como atributos SVG, que no aceptan
  variables CSS, así que los colores se leen del tema al arrancar.
- **Esc sale y las flechas avanzan o retroceden.** Las maneja el globo, porque el foco está ahí. Un
  clic en el velo no hace nada, y mientras dura el recorrido no se puede hacer clic en lo señalado.
- **Lo que frena el merge** (`lib/recorridos/recorridos.test.ts`): un ancla que no existe en el
  código, una cabecera que pide un recorrido que no está en el registro, un rol que no existe, un
  texto en voseo o un texto largo de más.
- **Una pieza de un lienzo tiene su propio recorrido** (2026-10-04, segunda tanda). El cronograma,
  la exploración y la información del cliente viven en la misma dirección que la ficha
  (`/clients/[id]`). Esos recorridos son
  `porPantalla`: la pieza abierta los declara con `usePantallaDelRecorrido(id)` y el botón
  «Recorrido» de la cabecera ofrece ese en vez del de la ficha. Al cerrar la pieza vuelve el de la
  ficha. «Ver» desde la lista, con la ficha abierta en otra pieza, no navega: avisa a qué pieza entrar.
- **Dirección (SUPER_ADMIN) ve todos los recorridos y todos sus pasos**, aunque sean de otro rol: es
  quien los revisa.
- **Las marcas que se repiten en muchas pantallas son una sola**: `que-sigue` (el recuadro
  «Qué sigue»), `publicar` («Subir al cliente» de `PublishBar`) y `recorrido.boton`. Un paso que las
  usa sirve en cualquier recorrido.
- **`Tabs`, `Segmentado`, `Table`, `FranjaDeSugerencias` y los botones del sistema no dejan pasar
  atributos**: el `data-recorrido` se pone en un envoltorio o en el elemento de la página más
  cercano. La prueba no lo puede ver (solo lee el texto del código): un ancla puesta en uno de esos
  componentes se cae en silencio.
- **El contenido vive por área** en `lib/recorridos/contenido/` (clientes, éxito, preventa y
  finanzas); `registro.ts` los junta en el orden en que aparecen en «Tus recorridos».
- **Un paso puede hacer el clic por ti** (2026-10-04, la escala). Un paso declara `accion` (por
  ejemplo, elegir la primera dimensión, el nivel Funcional o una celda) y el recorrido la pide con un
  evento del navegador (`EVENTO_DEL_RECORRIDO`) antes de mostrarse; la pantalla que sabe hacerla lo
  escucha y elige algo EXPLÍCITO, nunca alterna, así volver con «Anterior» deja lo mismo elegido. Un
  recorrido puede pedir acciones al arrancar (`alArrancar`: la escala abre el mapa y suelta lo
  elegido). La prueba frena una acción que ninguna pantalla escucha.
- **La preventa tiene UN recorrido que pasa por todas sus piezas** (2026-10-06, pedido de Elías;
  reemplaza los cuatro `porPantalla` de Resumen, Preparación, Exploración y La escala). Cada paso pide
  su pieza (`preventa.pieza`) y, en Exploración, el momento de la sesión (`preventa.momento`): un paso
  puede pedir varias acciones en orden. Arranca siempre en el Resumen. El listado tiene el suyo.
  ⛔ **Un recorrido no gasta al agente**: abrir Preparación o Casos de uso durante el recorrido no
  dispara la corrida que esas piezas hacen solas la primera vez (se abrieron para mostrarlas).
- **El globo nunca se sale de la pantalla** (2026-10-06): si lo señalado es más alto que la pantalla,
  el globo va arriba (`top`, el único lado con el que la librería deja lugar al desplazarse) y, si
  igual no cabe, se corre hacia adentro aunque tape el borde de lo señalado. Antes salía cortado.
- **Feedback tiene UN recorrido que pasa por sus cuatro pestañas** (2026-10-07, pedido de Elías, como el de
  la preventa): Bandeja, Hoja de ruta, Personas y Encuestas, en orden (`lib/recorridos/contenido/feedback.ts`,
  grupo nuevo «Dirección», solo SUPER_ADMIN). Cada paso pide su pestaña (`feedback.pestana`) y, adentro, lo que
  muestra: abrir o cerrar un tema (`feedback.tema`) o la clase de encuesta (`feedback.encuestas`). Las pestañas
  viven en `?vista=` y cambiar de una vuelve a pedir la página, así que un paso puede declarar cuánto espera
  (`PasoDelRecorrido.espera`): el primero y el último de cada pestaña, que son los que se alcanzan cambiando de
  pestaña con «Siguiente» o «Anterior», esperan 8 s; los demás, lo de siempre (2,5 s), para que un paso cuyo
  elemento no está (la Bandeja vacía, el panel plegado) no deje la pantalla quieta de más.
- **Pendiente:** la bienvenida (espera a «Para ti») y los recorridos de Marketing, Sesiones,
  Documentación y Administración. Fuera del menú quedan sin recorrido Cobranza › Odoo, Mercury e
  Importar.

## La escala abre en el Mapa (2026-10-04)

> Pedido de Elías: que la vista por defecto de la escala sea el Mapa y que sea la primera opción.

- **El mapa es la vista de entrada** (`VISTA_DE_ENTRADA` en `lib/escala/vista.ts`) y va primero en el
  selector: Mapa · Matriz · Por dimensión. Sin `?vista`, o con una que ya no existe, se abre el mapa;
  la dirección solo dice `?vista=` cuando es otra. Un enlace viejo sin `?vista` que antes abría la
  matriz ahora abre el mapa.
- **La bandeja de comentarios sigue abriendo la matriz** (`vista=matriz` explícito en el enlace): al ir
  a un comentario, el criterio comentado tiene que quedar a la vista en su fila.
- El esqueleto de carga de `/escala/[área]` dibuja el mapa (la caja de la rueda y el panel del
  detalle), para que la pantalla no salte al cargar.

## Los comentarios de la escala se deciden en Feedback (2026-10-05)

**Contexto.** Elías armó el módulo de Feedback (el equipo reporta desde cualquier pantalla y dirección
decide en una bandeja) y pidió unirlo con los comentarios de la escala: «es mejor que todo se maneje
desde el módulo de feedback nuevo». En producción había 0 comentarios de la escala y el feedback
todavía no estaba desplegado: no hubo nada que mover.

- **Se sigue comentando en la escala, sobre el criterio.** El globito de cada criterio, nivel y
  dimensión, los contadores y la capa «Comentarios del equipo» del mapa siguen igual. Lo que cambia es
  dónde se guarda: cada comentario es un reporte de Feedback (`FeedbackReporte`) con su ancla
  (`escalaAncla`, `escalaArea`) y lo propio de la escala en `escala` (JSON): el texto que se leyó, la
  versión y la edición, el tipo propio, el cliente y el perfil del caso, «qué decisión cambiaría» y la
  fila del manual. Una captura no da ese contexto; el ancla sí.
- **Se decide en la bandeja de /feedback**, con las tres salidas de todo reporte. «Cambio pendiente»
  pasa a ser **llevarlo a la hoja de ruta**, y eso exige la fila de «Cambios pendientes» del manual
  (viene propuesta desde el comentario). «Copiar los cambios de la escala», en la hoja de ruta, la
  saca con las columnas del manual. «Respondido» y «Descartado» son «Responder y cerrar» y «No se
  hará».
- **Lo decide cualquier super admin** (Elías, 2026-10-05), como todo el feedback; antes era solo el
  responsable de la escala por correo, que sigue existiendo para publicar versiones y para el frente
  «Escala» de «Para ti».
- **Lo ve y lo responde todo el equipo, en la escala**, como antes (Elías): es una conversación sobre
  un documento de todos. Un reporte de pantalla, en cambio, sigue siendo privado entre quien lo
  escribió y quien revisa. Responder ya no cambia el estado.
- **La escala muestra el estado, no lo cambia.** Los estados se llaman como en Feedback (Sin revisar,
  Respondido, En la hoja de ruta, No se hará), cada comentario lleva su número («F-31») y, a quien
  revisa, «Decidir en Feedback →». El botón «Comentarios» de la cabecera es solo de quien revisa y
  lleva a la bandeja filtrada («De la escala»); `/escala/comentarios` redirige ahí. La bandeja propia
  de la escala, el control de estado y la edición de respuestas se retiran.
- **En la bandeja**, un reporte de la escala muestra lo que se comentó en vez de la captura: el
  criterio, lo que se leyó, lo que dice hoy si cambió, la edición, el cliente y el perfil. «De
  dónde» filtra pantallas o escala. En una conversación, «Tú» es quien escribió, no «quien no
  reportó»: en la escala responde cualquiera.
- **SQL aparte y re-ejecutable** (`2026-10-05-feedback-escala.sql`): tres columnas y dos índices en
  `FeedbackReporte`, después del SQL del feedback y antes del deploy. Las tablas viejas
  (`EscalaComentario`, `EscalaRespuesta`) quedan como estaban.

**Después, el mismo día.** Cuando «Para ti» guardó lo suyo se borró `lib/escala/comentarios/consultas.ts`
(las tablas viejas, ya sin uso) junto con lo que solo lo sostenía: `CambiarEstado` y los campos
opcionales de `ComentarioVisto` (`numero` y `tema` pasan a ser obligatorios).

**Reemplazado esa misma noche** por la decisión que sigue: la escala ya no tiene comentarios propios, y
lo que se manda desde ella es privado como todo el feedback.

## La escala no tiene comentarios propios: lo que se dice de ella es feedback (2026-10-05)

**Contexto.** Esa noche Elías abrió un criterio de la escala y vio el panel de comentarios de siempre:
«Lo que busco es quitar el sistema antiguo de comentarios y que todos los nuevos comentarios o mejoras
que me dejen de la escala o de cualquier parte de Nexus funcionen con el nuevo módulo de feedback». En
producción no había ningún comentario ni ningún reporte de la escala: no hubo nada que mover.

- **Un solo formulario.** El botón de cada criterio, nivel y dimensión (y Enter en el mapa) abre el
  panel de Feedback de siempre, con lo que se está mirando arriba: qué es, dónde está, lo que dice y la
  edición. Se manda con los tipos de todo reporte (desde la escala arranca en «Una mejora»), con
  captura y «Señalar algo». Con el panel abierto, tocar otro criterio arranca el formulario con ese:
  lo escrito sobre uno no se manda anclado a otro.
- **El reporte queda anclado.** Viajan el ancla, la edición y el perfil de la pantalla; el texto no:
  el servidor lo lee de la versión publicada y lo congela (`anclarALaEscala`). La pantalla del reporte
  es «Escala · Ventas» y su dirección abre el criterio en la matriz. Un ancla o una edición que no
  existen, o la escala sin publicar, no entran.
- **Es privado, como todo el feedback.** Cambia lo decidido horas antes («lo ve y lo responde todo el
  equipo, en la escala»): lo ven quien lo mandó, en «Mis reportes», y quien revisa (cualquier super
  admin). Los contadores de la escala, el número de cada área, el botón «Feedback» de la cabecera y la
  capa «Feedback recibido» del mapa son solo de quien revisa.
- **Se decide en /feedback como cualquier reporte.** Llevarlo a la hoja de ruta sigue pidiendo la fila
  de «Cambios pendientes» del manual, y «Copiar los cambios de la escala» sale de
  `/api/feedback/cambios-de-la-escala` (solo quien revisa).
- **Se fue el sistema viejo:** el panel de comentarios (compositor, tarjetas, selector de cliente),
  `/api/escala/comentarios/**`, `/api/escala/clientes` y `lib/escala/comentarios/**`. Con él se fueron
  los tipos propios («no calza con un cliente», con su cliente) y «qué decisión cambiaría» al comentar:
  eso se dice en el texto. El responsable de la escala pasó a `lib/escala/responsable.ts`; la
  exportación al manual, a `lib/feedback/manual-de-la-escala.ts`.
- **Sin SQL nuevo.** Usa las columnas de `2026-10-05-feedback-escala.sql`, ya aplicado en producción.
  `EscalaComentario` y `EscalaRespuesta` quedan quietas: la app no las lee ni las escribe.

## «Para ti»: lo que le toca a cada persona, y los avisos (2026-10-04)

> Elías, con el rediseño ya aplicado: «la información sobre qué sigue, qué necesita atención en cada parte de Nexus
> debería ser específica para cada usuario… No es que solo pueda ver eso, la transparencia está bien, sino que la
> interfaz le sea muy útil». Diseño aprobado: artefacto «Notificaciones · diseño».

- **Dos preguntas separadas.** El ROL (y la matriz de permisos) sigue diciendo qué puedes VER y HACER. Lo que te
  TOCA sale de datos: los proyectos de implementación donde eres el encargado en HubSpot, las cuentas que te
  compartieron a ti, las preventas que llevas, las propuestas que creaste, lo que te devolvieron. Un solo lugar lo
  calcula (`lib/para-ti/alcance-server.ts`). *Por qué:* el índice de clientes decidía el alcance por permiso
  (`veTodo ? todo : lo tuyo`), y como Ventas, la CSL, Marketing, Dev y dirección ven toda la cartera, veían los
  avisos de todas las cuentas como si les tocaran.
- **Los FRENTES («Lo que lleva»)** cubren lo que no tiene una persona escrita en el dato: las alertas del vigía, los
  comentarios de la Escala, los pendientes de Finanzas. Tres Super Admin (Elías, Marco Salas, Alex Arrieta) tienen el
  mismo acceso y no siguen lo mismo. Se eligen en Equipo, por persona (`TeamMember.frentes`); sin elegir, salen del rol
  (`FRENTES_POR_DEFECTO`). **No dan permisos**: Equipo avisa en ámbar si alguien lleva un frente cuyas pantallas no
  puede abrir. `frentesEditadosAt` null = nadie los eligió (null no es lo mismo que una lista vacía). Texto y no enum.
- **La vista de Finanzas se desprende de los frentes.** Al guardar los frentes de un Super Admin, `vistaFinanzas` queda
  en «Dirección» salvo que lleve «Finanzas: supervisar». Ya no se elige aparte en Equipo: dos datos diciendo lo mismo
  terminan diciendo cosas distintas. Sin elegir, un Super Admin hereda lo que ya decía su vista.
- **Dos clases de cosas, y no se mezclan.** PENDIENTE: lo que te toca hacer, calculado del estado con las reglas que
  ya usa cada módulo (`lib/para-ti/fuentes`), y que se va solo cuando se resuelve. AVISO: algo que pasó (el cliente
  aprobó, te devolvieron un pago, te asignaron una cuenta), guardado en la tabla `Aviso`, que se marca leído.
- **Los avisos tienen una sola puerta** (`avisar`, `lib/para-ti/avisos-server.ts`): se llama DESPUÉS de que la acción
  quedó hecha y nunca lanza (perder un aviso es menos grave que fallar un «Devolver»); nunca le llega a quien hizo la
  acción (también un CHECK en la base); el mismo hecho avisa una vez por persona (`dedupeKey`); el enlace es una ruta
  de Nexus. Los leídos se borran a los 90 días, los no leídos a los 180 (mantenimiento diario).
- **Sin librería.** Novu, Knock y similares resuelven el envío por varios canales, no la pregunta difícil (qué le toca
  a quién), mandarían nombres de clientes y montos a un tercero, y Novu en el VPS pide Mongo y Redis. Supabase Realtime
  choca con el bloqueo total de RLS. Para unas 20 personas alcanza un pedido cada minuto y medio con la pestaña a la
  vista (cada cinco escondida, para la notificación del navegador), con la medición guardada dos minutos en memoria
  (un solo proceso, RUNBOOK invariante #1). No va en el armado del menú: ese corre en cada navegación.
- **Se retiró la pestaña «Del equipo»** (2026-10-07, Elías: «no aporta a nadie realmente»). Contaba cuánto tenía cada
  persona o cada área, pero el número lo llenaban las tareas vencidas de las reuniones: medía quién no las cierra, no
  cuánto trabajo tiene. Se fue con lo que la calculaba (`lib/para-ti/equipo-server.ts`, `/api/para-ti/equipo`). La
  carga de cada persona la mide «Carga del equipo», en horas; los proyectos sin encargado le siguen llegando a la CSL
  en su «Para ti».
- **El número del menú es lo de HOY** (lo del agente, lo de hoy y los avisos sin leer), no la semana: un número que
  nunca baja se deja de mirar.
- **Un mensaje sin leer va en ámbar** (2026-10-06, pedido de Elías): una respuesta o un comentario que alguien te
  escribió (`mensaje: true` en `TIPOS_DE_AVISO`: `feedback.respuesta`, `documentacion.comentario` y
  `documentacion.respuesta`) se pinta con el ámbar del sistema («pendiente, atención») y el rótulo «Mensaje»,
  hasta que lo lees. Ámbar y no rojo: el rojo es de los errores.
- **Pendiente, a propósito:** el notificador de alertas de la CSL (`CsAlertNotifier`) sigue hasta que el vigía escriba
  avisos (su archivo lo estaba cambiando otra sesión), y el «Necesitan atención» del índice de clientes sigue con el
  alcance por permiso hasta sumarle «Tuyas · Todas».
- **Feedback y la Escala (2026-10-05):** los avisos del feedback y de los comentarios de la Escala los escribe el módulo
  de Feedback (`lib/feedback`), siempre con `avisar()`. El frente Escala cuenta los comentarios de la Escala que esperan
  una decisión (reportes de Feedback con ancla, sin revisar) y pide Super Admin, porque se deciden en la bandeja de
  Feedback.

## El tipo de cambio del BCCR, día por día (2026-10-05)

Pedido de Elías: dejar el ₡500 fijo y usar el tipo de cambio del Banco Central de cada día, guardado para todas las
transacciones, con su histórico a la vista (`/finanzas/tipo-de-cambio`). El 5 de octubre la venta era ₡462,08: con
₡500, todo lo que está en colones se leía un 8 % más barato en dólares.

- **Qué tasa:** la venta de referencia del BCCR (indicador 318), la que pide Hacienda. La compra (317) se guarda y solo
  se muestra.
- **De dónde:** el servicio del BCCR (SDDE) si hay `BCCR_TOKEN`; si no, el API del Ministerio de Hacienda, que publica la
  misma tasa y no pide token. Al 2026-10-05 el histórico de Hacienda respondía 503: sin el token del BCCR, se guarda
  desde hoy y los meses anteriores siguen con la tasa cargada a mano. Lo trae `tipo-cambio-daily` (≥ 6:00 CR) a
  `TipoCambioDia`; la primera carga, `scripts/traer-tipo-de-cambio.ts --apply`.
- **Cómo se usa:** lo que tiene fecha (un cobro, una factura, una quincena de planilla, una comisión, un ingreso que no
  es venta) se convierte con la tasa de SU día, o la del día anterior más cercano hasta una semana. Lo que es de un mes
  entero (una fila del Excel de egresos, un recurrente, la reserva de aguinaldo) va con el promedio de la venta de los
  días del mes; un mes por venir, con la última conocida. Convertir sigue siendo solo de lib/finanzas/equilibrio.ts.
- **`TipoCambioMes` no se borra ni se pisa:** queda de respaldo para los meses sin días del BCCR. El punto de equilibrio
  y el cierre leen las dos con `cargarTasasDelAnio` (lib/finanzas/tipo-cambio-server.ts).
- **Firme** = el del BCCR con todos los días del mes, o (en un mes sin días del BCCR) uno confirmado por una persona. El
  cierre ya no pide confirmarlo a mano cuando el mes tiene días del BCCR.
- **Lo que lo revertiría:** si dirección prefiere otra tasa (la de compra, o la del Excel de Alex), se cambia el
  indicador en tipo-cambio-server.ts y los textos de la página; lo demás queda igual.

## Éxito del cliente es de la CSL y dirección, y lee la cuenta entera (2026-10-04)

**Contexto.** Elías pidió rediseñar Éxito del cliente con el sistema «Nexus · interfaz interna» para la
líder de Customer Success: en el índice, atrasos, bloqueos y alertas; en cada cuenta, uso, adopción y
licencias con todo lo aprovechable de HubSpot Partner. Aprobó el diseño (Claude Design) y pidió
aplicarlo, que el agente vigía cruce todo lo que Nexus sabe de la cuenta y que las pantallas sean de
Alexander Vanegas (CSL) y dirección.

- **Por ROL, no por celda** (`lib/cs/acceso.ts`: CSL y SUPER_ADMIN). Revierte el 2026-08-16: el índice
  muestra la cartera entera en dinero (MRR gestionado, comisión, puntos de partner) y eso no se
  delega por plantilla. Las páginas, las tres APIs por cuenta (`guardLiderDeCs`) y el menú (gate
  `roles`) leen la misma lista; `customerSuccess.read` queda con `enforced:false` y no abre nada.
  ⚠ El CSE deja de ver el área. Lo congela `lib/auth/customer-success-propio.test.ts`.
- **Curar sigue siendo `clientes.viewAll`.** Refrescar señales, traer Partner y correr el vigía
  recorren la cartera entera; las pantallas los pintan solo con `puedeCurar`.
- **El índice responde preguntas, no muestra gráficos**: la cartera en una línea, la entrega de
  proyectos, y una pestaña por pregunta (a quién llamar, qué renueva, uso y licencias, crecimiento,
  equipo, nivel de partner). Cada número sale de una regla pura con prueba
  (`lib/cs/cartera-reglas.ts`, `ficha-reglas.ts`, `facturacion-de-la-cuenta.ts`); lo que no hay se
  dice («sin datos de Partner», «hace N días»), nunca se rellena.
- **Lo que no se usa de Partner, a propósito**: `hs_renewal_mrr` (no coincide con la suma de los hubs)
  y los puntos de tier como dato fresco (HubSpot los dejó de calcular el 26-11-2025: se muestran con
  su fecha).
- **El vigía lee la cuenta entera, en el mensaje** (`lib/cs/watchdog-cuenta.ts`): handoff (resumen,
  resultados, fecha límite y duración vendida), facturación, Partner, el registro de la empresa con
  sus personas, y las reuniones de 45 días, separando las internas. Más una guía de cruces (riesgo
  doble, uso tras la implementación, «dice que sí pero no lo usa», facturas vencidas). Sin re-sembrar
  el prompt y con las categorías de alerta que ya existen: una factura vencida es `CHURN_RISK`.
- **Las personas del cliente van en el JSON de señales** (`ClientCsSignals.engagement.contactos`,
  `lib/hubspot/company-contacts.ts`), sin SQL: se leen de HubSpot con la copia diaria de señales.
- **El barrido diario suma dos motivos para mirar una cuenta**: deuda vencida del cliente y relación
  gestionada con HubSpot que vence en 30 días o menos.
- **El buscador va en la fila de filtros de «A quién llamar» y mira TODAS las cuentas** (`cuentasParaBuscar`,
  2026-10-05). Filtra la lista por nombre y, debajo, muestra las que coinciden y no están en ella: una
  cuenta sana y sin renovación cerca no aparece en ninguna pestaña y también se tiene que poder abrir.
  Enter abre la primera.
- **Quien está de baja en Nexus no es CSE** (`cseVigente`, 2026-10-05): HubSpot puede seguir teniendo a
  esa persona como dueña de proyectos activos (Lorena Osorio, Felipe Sepúlveda y Brandon Centeno, al
  2026-10-05). Esos proyectos cuentan como sin CSE y Equipo dice de quién eran, para reasignarlos en
  HubSpot. El filtro por CSE lista a todos los que llevan algún cliente, no solo a los de la lista.

## Clientes con el sistema «Nexus · interfaz interna»: el índice y la ficha (2026-10-04)

> Elías pidió rediseñar la parte de clientes (el índice y la ficha) con el sistema nuevo, tomando
> como modelo la preventa, y validar que los datos alcancen para que sea útil a quien ejecuta un
> proyecto de implementación. Aprobó el diseño (artefacto «Clientes · rediseño») y contestó cuatro
> preguntas.

- **El índice son dos columnas, como la preventa.** A la izquierda la tabla de empresas; a la
  derecha «Qué sigue» y «Necesitan atención» (propuestas de cronograma sin decidir, altas a medio
  hacer, reuniones que asignó la IA sin revisar) y lo que está en HubSpot y todavía no en Nexus.
  La etapa de cada fila sale de `loadLifecycleBatch` + `etapaParaLaUI`, lo mismo que la ficha; con
  dos o más proyectos de CS se muestra el más atrasado. Las consultas del índice viven en
  `ClientsTable.tsx` (`consultarIndice`, con `cache()`) para que la tabla y el panel no las repitan.
- **«Próxima reunión» lee también las fechas cargadas a mano por frente** (Ventas y CSE), no solo la
  agenda: era la fuente que faltaba (`lib/clients/last-interaction.ts`).
- **La ficha son tres columnas: riel, centro y panel.** El riel reemplaza las pestañas de proyecto,
  las de la cuenta y el desplegable de piezas: las piezas cuelgan del proyecto abierto, con su
  estado a la vista. El panel de la derecha dice qué sigue y da contexto; se oculta con «Ocultar
  panel» (para proyectar) y se recuerda por navegador (`nexus-ficha-panel`).
- **El panel del proyecto queda montado y oculto mientras se mira algo de la cuenta**, así sus
  piezas siguen en el riel. Oculto no monta ningún documento ni el documento del handoff: sus
  entradas de deshacer quedarían vivas debajo de otro editor (la misma razón por la que el handoff
  se desmonta fuera del Resumen).
- **«Qué sigue» del proyecto, en este orden** (decisión de Elías): alta a medio hacer → propuesta
  de cronograma → reuniones sin revisar → el documento de la etapa sin generar o desactualizado →
  resumen vencido → agendar la próxima reunión. Los dos primeros los pinta la ficha con sus propios
  carteles. Lo que falta para cerrar la etapa no se repite: ya lo dice la tarjeta de la etapa.
  Regla pura en `lib/clients/que-sigue-del-proyecto.ts`.
- **El resumen del proyecto y «Qué se vendió» se generan solos al abrir el Resumen** (decisión de
  Elías), si faltan o quedaron viejos: una vez por versión y por sesión del navegador, sin avisos.
  El de «Qué se vendió» solo para quien puede generar el handoff (el servidor pide la misma celda);
  para lo que ya existía, `scripts/backfill-resumen-handoff.ts` (simulacro primero: 59 handoffs,
  hasta US$1,24 el 2026-10-04). Sigue siendo una persona la que lo dispara al mirar, nunca un cron.
- **Los dos prompts piden lo que necesita quien ejecuta**: «Qué se vendió» suma, si el documento lo
  dice, quién decide del lado del cliente y lo que quedó fuera del alcance (cuatro frases, mismo
  tope); el resumen del proyecto cierra con el próximo paso acordado, si el material lo dice. Los
  dos en tuteo. El del resumen va en el mensaje y no en el prompt guardado: no hace falta
  re-sembrar el agente.
- **Pendientes: lo de las últimas cuatro semanas**, vencido primero, con «y N más antiguos»
  (decisión de Elías). «Ver los N» sigue mostrando todo.
- **Un solo botón azul a la vez.** En la ficha es el del «Qué sigue»; las acciones de una tarjeta
  («Regenerar», «Ver los N hallazgos») van como texto azul arriba a la derecha. Lo que propone la IA
  se usa con un «Usar» azul, como en la preventa (pedido de Elías, segunda vuelta del mismo día): en
  la información del cliente, mientras haya propuestas el azul es «Usar», y «Confirmar y guardar en
  HubSpot» pasa a azul cuando ya no queda ninguna y hay algo que confirmar. El «Qué sigue» de la
  cuenta no lleva botón cuando ya se está en la pestaña que pide.

**Segunda vuelta, el mismo día** (Elías, mirando lo aplicado contra el diseño):

- **«Mis clientes · Compartidos · Todos» para todos los roles.** Antes el filtro de pertenencia se
  escondía a quien ve la cartera entera; esa persona también lleva cuentas propias y las quiere
  separar. Los que ven todo abren en «Todos».
- **Las fechas del listado se arman a mano, en la hora de Costa Rica (UTC-6, sin horario de
  verano).** El `title` de «Última actividad» usaba `toLocaleString` y Node y Chrome escriben
  distinto (espacios finos, «sept» contra «sep»): error de hidratación. Y «hoy/ayer» salía de la
  zona LOCAL, que en el contenedor de producción es UTC: entre las 18 y las 24 de Costa Rica el
  servidor y el navegador decían días distintos.
- **Los documentos del motor de landings van dentro de un marco, no a sangre**
  (`MarcoDelDocumento`): una franja gris dice «El documento · así lo ve el cliente» o «interno, el
  cliente no lo ve» (sale de `PieceDefinition.clientFacing`) y el documento va en una tarjeta SIN
  padding, así las bandas del motor siguen llegando a los bordes. Reemplaza al margen negativo; la
  guarda es la misma (`lib/ui/full-bleed-workspaces.test.ts`), ahora exige el marco y que no gane
  padding.
- **«✨ Mejorar con IA» ya no aparece donde el documento tiene chat**: el «Cambiar» de cada sección
  abre el chat, que arma la lista con casillas y aplica por el mismo editor; el botón era un resto.
  `DocumentAssist` lo pinta solo sin proveedor del chat (hoy, ningún documento de proyecto; Roles
  monta el suyo aparte). El «Cambiar» dejó la píldora con emoji: es el botón blanco de Nexus, con la
  letra de la interfaz y la burbuja del chat en azul.
- **El documento del handoff se abre pegado a su tarjeta** y la vista baja hasta él. Iba debajo de
  «Alrededor del handoff»: con el contexto abierto quedaba a dos pantallas y «Ver documento» parecía
  no hacer nada. Su interior (secciones y bloques) usa los tokens del sistema, y un bloque en
  borrador es una sugerencia de la IA: azul, con «Usar» y «Descartar».
- **«Alrededor del handoff» son cuatro filas iguales** (`FilaDeAlrededor`): Contexto del handoff,
  Resultados que persigue el cliente (salió de adentro del documento), Pedidos fuera de alcance y
  Exclusiones. A la derecha, lo que pide decisión en ámbar o solo la cuenta en gris.
- **En la información del cliente, lo que propone la IA ocupa el lugar del campo**, pintado como va
  a quedar (viñetas y negritas, `TextoConFormato`, el mismo formato que `textoAHtml` manda a
  HubSpot), con «Ver lo que dice hoy» para comparar. «Usar» lo deja como el valor del campo,
  editable.
- **«Acceso»**, con un punto verde (activo) o ámbar (revocado), en vez de «Acceso activo»: el botón
  blanco de la barra del documento, como «Asistente» y «Exportar PDF».

## La cuenta de Éxito del cliente, en pestañas (2026-10-05)

> Elías: «que se pueda entender más y no sea solo hacer scroll», pensado para la CSL que administra
> la cartera; «la parte de adopción es muy importante». Aprobó el diseño (lienzo «Éxito del cliente ·
> rediseño», fila «La cuenta en pestañas») y pidió aplicarlo.

- **Seis pestañas: Estado de la cuenta · Adopción · Renovación · Proyectos · Resultados ·
  Conversaciones.** La primera contesta «¿cómo está?» en un vistazo (resumen del agente, las cuatro
  lecturas, lo que pide atención y lo que viene en 90 días) y cada lectura o motivo lleva a la
  pestaña con el detalle (`PESTANA_DE_LA_LECTURA`, `PESTANA_DEL_MOTIVO`). El panel derecho queda
  igual en todas; las personas del cliente pasaron a Conversaciones y las apps a Adopción.
- **La pestaña viaja en la dirección (`?pestana=`) con `history.replaceState`, no con
  `router.replace`**: la página es dinámica y `router.replace` volvería a cargar la cuenta entera en
  cada clic. Las seis quedan montadas (ocultas con `hidden`) para no perder lo que se estaba haciendo.
- **Lo nuevo se calcula con datos que ya existían**, en funciones puras de `lib/cs` con pruebas:
  del contrato al uso y licencias (`adopcion.ts`), la lista para renovar (`lista-para-renovar.ts`,
  un punto sin dato no cuenta como listo ni como pendiente) y lo que viene en 90 días
  (`lo-que-viene.ts`). La lectura del agente sobre la adopción son las frases del resumen citadas
  con HubSpot Partner: no hay un agente nuevo.
- **El gráfico semanal de uso sale de `PartnerUsageSnapshot`** y con menos de dos semanas dice por
  qué no hay gráfico: hoy hay una sola (10 jul) porque la copia diaria de HubSpot Partner está
  apagada en producción. Commerce no tiene columna semanal: su «hace 4 semanas» dice «sin historia».
- **«Por qué se movió el plan» son las particularidades confirmadas que corrieron fechas**, cerradas
  incluidas (cerrar no devuelve calendario, ver §Cronograma). Nunca se lee `sourceQuote`.
- **El avance hacia la meta de cada resultado no se mide**: la pestaña lo dice en vez de inventarlo.
- El recorrido «Una cuenta de Éxito del cliente» pasó a la versión 2: sus pasos de adopción y
  proyectos apuntan a las pestañas, y suma uno sobre las pestañas.

## Planilla al día y «Usar el monto de la factura» (2026-10-06)

Antes del deploy del rediseño, a partir de las respuestas de Alex (2026-10-05).

- **La planilla se completa con el salario que regía, no con el de hoy.** «Completar las que faltan» (historial de
  planilla) genera de una vez las quincenas que no están en el libro —los HUECOS del último año hasta la de hoy
  (`quincenasPorGenerar`), no «de la última en adelante»: el 2026-10-06 el job ya había creado la 1.ª de octubre y
  agosto y septiembre quedaban en medio—, cada una con `salarioVigenteEn` sobre los movimientos del catálogo. Un aumento de
  septiembre no sube la quincena de agosto; quien no estaba en esa quincena no lleva fila. Todas quedan PENDIENTES: las
  marca pagadas una persona («Pagar la quincena», que pasa fila por fila por `pagarQuincena`, el chokepoint de INV18).
  El job `planilla-quincena-daily` solo asegura la quincena en curso; las atrasadas no las crea solo.
- **Alex ya podía editar la planilla:** es Super Admin. Lo que le faltaba era poder crear las quincenas atrasadas (el
  botón solo generaba la de hoy) y corregir el monto de una fila pendiente (la ruta existía; faltaba el control).
- **«Usar el monto de la factura» es la única salida al 409 de «el monto solo se edita en PROGRAMADO».** Vive al lado
  del chokepoint (`alinearMontoConFacturaTx`): toca solo el monto, el monto es el neto de la factura de Odoo, no corre si
  el cobro entró en una comisión liquidada, y deja su línea en la bitácora. Se ofrece SOLO en un par juntado por el
  número de factura que alguien anotó y de una sola cuota: medido el 2026-10-06, los 6 casos de «montos distintos» eran
  pares por cercanía y varios del doble (una factura de dos meses contra una cuota): ahí el botón habría hecho daño.
  Lo que lo revertiría: que dirección decida que la cuota manda sobre la factura.
- **El calendario de planilla se edita (pedido de Alex, 2026-10-06).** «Planilla» en el menú abre el calendario. Una
  casilla «falta» (la quincena ya pasó, la persona estaba y no está en el libro) se llena con lo que se pagó y queda
  PAGADA en la fecha de esa quincena, a nombre de quien la anota (`anotarQuincenaPagada`: crea la fila con la moneda del
  salario que regía y la paga por `pagarQuincena`, el chokepoint de INV18). Una «sin pagar» corrige su monto y, si ya
  pasó, se paga en su fecha. Una pagada se corrige (2026-10-07, abajo). El aguinaldo y el punto de equilibrio leen el libro: se recalculan
  solos. *Por qué pagada y no pendiente:* Alex llena lo que YA se pagó; dejarla pendiente obligaba a un segundo paso por
  casilla en el historial. Lo que lo revertiría: querer revisar cada quincena antes de darla por pagada (entonces nace
  PENDIENTE y se paga desde el libro).
- **«Cambió después del cierre» ya no lo dispara un cobro (Alex estuvo de acuerdo, 2026-10-06).** Antes se comparaban
  facturado y cobrado del día del cierre, y los dos se mueven con cada cobro: el facturado del reporte cuenta lo cobrado
  en el mes en que entró la plata, así que pagar en octubre una factura de septiembre bajaba septiembre y lo marcaba.
  Ahora el cierre guarda una huella (`HuellaDelMes`, lib/finanzas/cierre.ts) por moneda original: los GASTOS del mes
  (gastos, recurrentes y quincenas de planilla, sin la reserva de aguinaldo, que se recalcula con cualquier salario del
  año) y las FACTURAS por fecha de emisión, cobradas o no, más las comisiones de aliados con monto confirmado. Lo marca
  agregar, corregir o borrar cualquiera de esas; cobrar no. El tipo de cambio tampoco: no es un gasto ni una factura.
  Un cierre sin huella (anterior a esto) dice «no se puede saber»; al 2026-10-06 no había ninguno en prod. Lo que lo
  revertiría: querer que el cierre congele también la cobranza del mes.
- **Proyecto pausado al facturar (pedido de Elías, 2026-10-06).** Cuando una cuota pendiente es de un proyecto pausado,
  la cola de cobros, el diálogo de «Marcar facturado», el cronograma de la cuenta, las alertas y la tarea «Facturar» de
  Pendientes y Para ti dicen: «El proyecto está pausado. Consulta con Customer Success y el líder antes de facturar.»
  No frena nada. Pausado = `hubspotStatus` on_hold (la única que se usa hoy), salud fijada en PAUSADO o `status`
  paused; un servicio de cobranza en PAUSADO no cuenta (es de Finanzas, no del proyecto). La cuota toma el proyecto de
  su servicio; sin proyecto, cualquier pausado del cliente (puede avisar de más: preguntar es barato). Se calcula al
  leer, nunca en `AlertaCobro.mensaje`, que se conserva entre corridas (`lib/cobranza/proyecto-pausado.ts`).
- **Dinia ve y edita comisiones de vendedor y ve el aguinaldo (Elías, 2026-10-06: «que Dinia también vea salarios»).**
  Cambia la regla del rediseño («Dinia no ve salarios», docs/finanzas-rediseno-plan.md): el aguinaldo de cada persona es
  lo que ganó en el año. Dos permisos nuevos, `comisionesVendedor` (ver / editar) y `aguinaldo` (ver), que se dan SOLO a
  una persona desde /team (su override), nunca a un rol: la matriz de roles ni los muestra (`soloPorPersona`). El
  chequeo (`lib/auth/salarios-por-persona.ts`) lee el override que ya viene con el usuario, sin consultar la base, y
  entra como excepción explícita de `guardCostosAccess({ porPersona })`: las pruebas de privacidad siguen cubriendo cada
  ruta y quien no la tiene sigue con 403. Planilla, catálogo de salarios y caja neta siguen solo para Super Admin (el
  aguinaldo no le ofrece los enlaces a la planilla). «Ingresos variables de los colaboradores» = las mismas comisiones
  (Elías). El aguinaldo no tiene nada que editar: sale del libro de planilla. Lo que lo revertiría: abrirle también la
  planilla, con el mismo mecanismo.
- **El historial de comisiones de cada vendedor, venta por venta y mes por mes (pedido de Elías, 2026-10-06).** Tabla
  nueva `CuotaComisionVendedor` (⚠ SQL `2026-10-06-cuotas-comision-vendedor.sql` ANTES del deploy), cargada desde la
  «Tabla de Comisiones» de cada vendedor con `scripts/import-comisiones-vendedor.ts` (Excel o CSV; las columnas, en
  `lib/finanzas/comisiones-historial.ts`). Lo dudoso entra POR CONFIRMAR y Dinia o Alex responden «¿Se pagó?» en
  Comisiones de vendedor (queda a su nombre y se deshace). Del Excel: verde = pagada; en CSV, hasta «pagadas hasta» y una
  celda con «?» = por confirmar. Una cuota que una persona ya confirmó no la pisa una recarga. NO se cruza con
  `ComisionVendedor` (lo liquidado desde los cobros): dos registros hasta el módulo de comisiones nuevo. Las reglas que
  dio Elías para ese módulo: servicio = % × monto del contrato repartido en los meses del proyecto (5% del vendedor;
  2,5% = compartida con Marco, que no la cobra); licencia (Collab) = 10% en tres meses; cada cuota se paga cuando el
  cliente paga su factura, a mes vencido, y se corre si tiene crédito o se atrasa. Andrés 2026: 52 ventas, 164 cuotas;
  enero a septiembre cuadran con su «Total a Pagar»; octubre a diciembre no (la fórmula del Excel deja fuera Total Finco
  y Licencias Bluesat).
- **Gastos contra Mercury (pedido de Elías, 2026-10-06).** Pestaña «Gastos y Mercury» en Conciliación, para quien tiene
  `gastos.read`. Cruza los cargos de TARJETA (la de crédito, que es la de herramientas; la de débito) y la suscripción de
  Mercury con los recurrentes y los gastos de Nexus (`lib/finanzas/gastos-mercury.ts`): qué cobra la tarjeta todos los
  meses (dos de los últimos tres meses) y a qué precio, con su recurrente al lado («sin registrar» / «precio distinto» si
  el último mes completo se aleja más de US$2 y del 10%); las herramientas mensuales de Nexus sin cargo en 60 días; y,
  desde `EGRESOS_DESDE_NEXUS`, los cargos sueltos sin su gasto y los gastos en dólares sin su cargo (mismo monto ±1%,
  ±5 días). ⛔ Las transferencias (planilla, proveedores) ni se leen: lo ve quien registra. Sin SQL: la copia de Mercury
  ya traía las salidas (`docs/mercury-decisiones.md`: «las salidas servirán para cruzar gastos»); se recalcula al abrir y
  no guarda nada. La tarjeta de débito no hace recurrentes (viajes). Los nombres que no se parecen van en `ALIAS`
  (Anthropic = Claude, OpenAI = Chat GPT, AWS, Google Workspace = Gsuite, Magnific = Freepik). Lo que no se hizo: un
  «Está bien así» por fila y guardar qué comercio es qué recurrente (necesitaría una tabla).
- **Una quincena PAGADA se corrige (Alex, 2026-10-07: «pude editar solo una vez; cometí un error y no pude volver a
  editarlo»).** Antes una pagada era intocable y un dedazo al anotarla desde el calendario quedaba para siempre. Ahora
  «Corregir» (en la casilla del calendario y en el historial) cambia el monto —y la fecha de pago por la ruta— con
  `corregirQuincenaPagada`: sigue PAGADA y a nombre de quien la pagó (INV18), y la corrección (quién, cuándo, de cuánto a
  cuánto) queda escrita al final de sus notas, que el historial muestra. El PATCH genérico sigue rechazando una pagada.
  Sin SQL. Lo que lo revertiría: querer una bitácora aparte (tabla) en vez de las notas.
- **La planilla también por persona (Elías, 2026-10-07: «Dinia no tiene ingreso a Planillas … que ella le corresponde»).**
  Permiso `planilla` (ver / editar), solo por override en /team como `comisionesVendedor` y `aguinaldo`: abre el
  calendario, el historial, los salarios y sus rutas (`pagos-planilla/*`, `costos`, `costos/[costoId]`,
  `costos/movimientos`). La entrada «Planilla» del menú deja de ser solo de Super Admin: la ve quien tenga el permiso.
  Siguen solo para Super Admin el resumen de Costos, las tarjetas, la caja neta y el equilibrio. ⚠ Al 2026-10-07 los
  overrides de Dinia estaban vacíos: hay que encenderlos en /team.
- **Conciliación: «Desestimar» y «Abrir la cuenta» (Elías, 2026-10-07: «se necesita desestimar y editar»).** «Está bien
  así» pasa a llamarse «Desestimar» en todo lo que se lee (botones, pasos, ayudas, «Desestimadas»): hace lo mismo —saca
  la fila con un motivo, se deshace, vuelve si cambia un número—, y el nombre viejo se leía como «aprobar». Lo que NO es
  desestimar se corrige en la cuenta: cada fila que es de una sola cuenta (`cuenta:`, `venta:`, o sus cobros `c:`) trae
  «Abrir la cuenta», que abre Cobranza con esa cuenta (`?cuenta=`), donde se revierte un cobro, se marca facturado o se
  ajusta el servicio (`ponerCuentas`, al final de los detectores de Odoo y de Mercury). Casos que lo pidieron: Alliance
  RH INV-46 (se le devolvió la plata: revertir el cobro y borrar o finalizar el servicio) y Teamnet INV-71/72 (son de la
  implementación; la web de US$1.000 es aparte: desestimar con ese motivo y marcar facturadas sus cuotas). Sin SQL.

## Procesos: un mapa de hoy y uno de después, en carriles (2026-10-05)

> Elías pidió rediseñar Procesos (ficha del cliente › La cuenta › Procesos) con la línea interna, ver qué saca el
> agente y si el flowchart alcanza. La meta: por cliente, cómo trabaja hoy y cómo queda después de la implementación.

- **Un proceso es un mapa con dos versiones, hoy y después, en carriles** (una fila por quién hace el paso). Vive en
  el mismo bloque FLOWCHART de la sección «procesos» de Información del cliente, con `data.formato = "carriles-v1"`;
  lo que leyó el agente va en un bloque CARD (`procesos-indice-v1`). Sin SQL (`lib/procesos/mapa.ts`).
- **Cada paso dice de dónde sale**: lo dijo o lo acordó el cliente (con cita), lo propone Smarteam o lo supuso el
  agente. La cita la verifica el código contra la transcripción (`lib/procesos/citas.ts`); si no aparece tal cual, el
  paso baja a supuesto (hoy) o propuesto (después). *Por qué:* el agente anterior leía las notas de Gemini cortadas a
  9.000 caracteres, no marcó nada como inferido en 22 mapas y en FUNDAUNA dibujó la mesa de ayuda al revés (es de los
  proyectos hacia Fundauna, no de los estudiantes).
- **El agente lee las reuniones enteras**, solo por el chokepoint (`getClientSessions`) y con techo de fecha, en dos
  pasos: uno por reunión (hechos con su cita, guardado en `AgentRun` `procesos-lectura`: al volver a mapear solo lee
  las nuevas) y otro que junta los procesos y arma cada mapa (`lib/procesos/agente.ts`, `claude-opus-5-5`). JSON
  libre: con `json_schema` el mapa entero da «compiled grammar is too large». Medido en el prototipo, la primera vez:
  US$5,27 FUNDAUNA, US$6,69 Areyá. Corre en segundo plano (`AgentRun` `procesos-mapeo`); la pantalla lo consulta cada
  4 s y una corrida de más de 45 minutos se da por muerta.
- **Lo editado a mano no se pisa.** Un mapa nuevo editado se respeta por su id; el agente reemplaza sus propios mapas,
  su índice y los mapas de `agent-mapeo-inicial` que nadie tocó. Los editados a mano del formato anterior se siguen
  viendo, y editando, en «Mapas del formato anterior».
- **Estado: borrador del agente → revisado → validado con el cliente.** Validado equivale al bloque CONFIRMED. El
  kickoff (editor, vista del cliente y PDF) muestra SOLO la versión de hoy de los mapas validados, traducida al visor
  viejo (`lib/procesos/legado.ts`); su «Pasar a borrador» deja el mapa en revisado. Editar un paso de un mapa validado
  lo vuelve a revisado: lo validado era otra cosa. Revisado y validado no se pintan de verde.
- **Diagnóstico, Planificación, Ejecución, Entrega y la auditoría del portal leen los dos mapas**
  (`serializeProcesosForPrompt`), con lo supuesto y lo propuesto marcados y el estado del mapa. Un borrador también:
  el Diagnóstico lo necesita antes de que el cliente lo valide.
- **React Flow alcanza.** No trae carriles, así que el acomodo es propio y determinista (`lib/procesos/layout.ts`):
  columna = el camino más largo, fila = el carril, las vueltas atrás punteadas. Los carriles son nodos de fondo, el
  dolor es hijo del paso (`parentId`) y el detalle va en un `NodeToolbar`. Se descartaron dagre (no sabe de carriles)
  y ELK (otra dependencia para lo mismo).
- **El mapa arranca con un zoom que se lee** (0,8 como mínimo) y se recorre de costado, en vez de encogerse hasta
  caber entero; sin minimapa, que tapaba pasos. Las medidas de adentro de un paso van en píxeles: en la app 1 rem son
  18,4 px y un nodo de alto fijo no aguanta espaciados en rem.
- **Se retira `agent-mapeo-inicial`** (`lib/agents/retirados.ts`): `/analyze` ya no lo despacha. No hay re-siembra.
- **Lo que no se hizo:** agregar o quitar pasos y flechas desde la pantalla (hoy se edita un paso: qué pasa, quién,
  con qué, el dolor, de dónde sale y quitar citas); llevar lo que falta confirmar a la próxima sesión; y que el
  Diagnóstico lea solo hoy y la Planificación solo después (esos dos archivos los estaba cambiando otra sesión).

## Procesos: el mapa se edita en pantalla completa (2026-10-07)

> Elías: el botón de pantalla completa del mapa no ponía nada en pantalla completa (era el «encuadrar» de React Flow,
> que tiene ese ícono). Pidió pantalla completa real y, mirando el diseño «Procesos › Editor», que ESA fuera la forma
> de editar: «después vamos a querer que el chat de Nexus pueda modificar esos procesos».

- **Pantalla completa = modo edición.** En la ficha el mapa se mira; se cambia en `EditorDelMapa`, que cubre todo
  Nexus: «Editar el mapa», el botón de pantalla completa del mapa o «Editar el paso» en el detalle de un paso. Quien no
  puede editar lo abre igual, en solo lectura. Reemplaza al cajón de editar un paso (`EditarPaso`, borrado).
- **La pantalla completa del navegador es de la página entera, no del editor.** Así los avisos y los diálogos, que
  viven en document.body, se siguen viendo. Esc sale de la pantalla completa del navegador y el editor sigue abierto:
  se cierra con Guardar o Cancelar, y con cambios sin guardar pide confirmación. La forma es una primitiva nueva,
  `PantallaCompleta` (components/ui): portal, foco adentro, sin cierre con Esc ni tocando afuera. *Por qué una
  primitiva:* el ratchet de overlays no deja improvisar una capa a mano, y `Modal` es una tarjeta centrada.
- **Cada cambio es una operación** (`lib/procesos/operaciones.ts`): agregar, editar o quitar un paso; sumar o quitar
  una cita; unir, rotular o quitar una flecha; agregar, renombrar, mover o quitar un carril. El editor guarda la lista
  y la aplica para mostrar cómo queda; deshacer quita la última. Guardar manda la lista con la versión del mapa que
  estaba abierta (`PATCH accion: "operaciones"`) y el servidor la aplica con la MISMA función. *Por qué:* lo que se ve
  antes de guardar es lo que queda, y el chat de Nexus va a proponer estas mismas operaciones.
- **El mapa tiene versión** (`MapaDeProceso.version`, sube con cada cambio guardado). Guardar sobre otra versión da
  409 con el mapa de ahora: el editor prueba los cambios encima y, si calzan, los deja para revisar y volver a guardar;
  si no, ofrece empezar de nuevo con la versión nueva. El servidor relee el bloque con `FOR UPDATE` antes de escribir.
- **Las posiciones no se guardan.** El carril dice quién hace el paso y las flechas el orden; el acomodo sigue siendo
  automático. Arrastrar un paso a otro carril cambia quién lo hace y nada más. Por eso no está «Reacomodar», que traía
  el diseño.
- **Una cita no se escribe: se elige de lo que dijeron.** El editor ofrece los hechos que el agente ya leyó en las
  reuniones de ese proceso (`GET …/procesos/[blockId]/hechos`, sin llamar al modelo; el mapa guarda en `incluye` con
  qué nombres lo llamaron las lecturas). Al guardar, el servidor busca cada cita NUEVA en la transcripción de su
  reunión (por el chokepoint de sesiones); la que no aparece tal cual no queda, el paso baja de origen y la pantalla
  dice cuántas se descartaron. Sumar la primera cita a un paso supuesto lo pasa a «Lo dijo el cliente» (hoy) o
  «Acordado» (después), y se puede volver a cambiar.
- **Las mismas reglas valen venga el cambio del editor o del chat:** «Lo dijo el cliente» y «Acordado» piden una cita;
  quitar la última baja el paso; el dolor es de hoy; qué cambia, dónde vive en HubSpot y a qué reemplaza son de
  después; un carril con pasos no se quita; quitar un paso se lleva sus flechas y lo que lo nombraba. Un mapa validado
  que se edita vuelve a revisado.
- **Esto cierra** lo que quedó pendiente el 2026-10-05: agregar y quitar pasos y flechas desde la pantalla.

## La carga de Customer Success y la rentabilidad por cuenta (2026-10-06)

> Pedido de Elías: medir la carga de cada CSE para la 1:1 semanal de Alex Vanegas (CSL), y para Marco Salas y él, el
> margen real de cada cuenta y cuándo contratar. Diseño aprobado en el artefacto «Rentabilidad» (versiones 8 a 10).

- **Dos pantallas, y el dinero en una sola.** «Carga del equipo» es de HORAS y no muestra un monto. «Rentabilidad» usa
  la planilla del período SUMADA para el costo de la hora y nunca muestra el costo de una persona. Las dos viven en
  Éxito del cliente y son de la CSL y de dirección, por rol (`esLiderDeCs`; decisión de Elías del mismo día: la
  primera versión dejaba Rentabilidad solo a dirección, en Finanzas). Dirección la tiene también en Finanzas › Reportes.
  ⚠ Con eso la CSL ve el total de la planilla del período (sale de multiplicar el costo de una hora pagada por las
  horas pagadas), como ADMIN ya ve el total en Gastos del mes. Lo que cobra cada persona sigue siendo solo de dirección.
- **La carga es tiempo AGENDADO más lo que pide el cronograma, y lo dice.** Reuniones de Calendar (inicio y duración
  del evento; cuenta a todos los invitados hasta leer la asistencia de Meet), preparación por reunión con un cliente
  y la entrega estimada: tareas del cronograma × horas por tipo de fase × factor de complejidad de la cuenta. Una
  reunión de 8 h o más es de día completo y no cuenta; las demás se topan en 4 h. Quien se fue no suma después de su
  baja y quien entró no cuenta las semanas anteriores. Lo que ya pasó cuenta lo que el plan pedía; lo que viene, solo
  lo abierto. Las tareas abiertas con fecha pasada no suman: se cuentan aparte (pueden estar hechas sin marcar).
- **Los supuestos se ven y se editan** (`ConfigCarga`, append-only, CSL y dirección): capacidad (40 h × 80 %),
  preparación, horas por tipo de fase, pesos del factor, semáforo (70 / 85 %), semanas para la señal, traspaso,
  semanas para contratar y horas por tipo de trato. Sin fila guardada rigen los de fábrica (`lib/carga/config.ts`).
  ⚠ La tabla es nueva: `scripts/sql/2026-10-06-config-carga.sql` va ANTES del deploy que traiga el modelo, o
  `/api/health` responde 503 y el deploy se revierte.
- **El factor de complejidad es explicable**: base 1,0 más una suma por variable (Hubs pagados, Enterprise,
  usuarios, integración, migración, etapa, industria regulada, uso cayendo, relación fría, Escala), con tope 3,0.
  Una variable sin dato suma 0 y se dice «falta»: un «sin dato» no es «simple». No multiplica las reuniones medidas
  (ya traen la complejidad adentro): pesa la entrega estimada y sirve para comparar cuentas.
- **Quien no aparece en el calendario no es espacio libre.** Una persona con dos semanas o más sin reuniones se señala
  y no cuenta en «horas libres» ni en la capacidad de la contratación; quien entró hace poco sí cuenta.
- **Nexus sugiere; no mueve cuentas ni contrata.** Las señales de la 1:1 y el simulador de traspasos no escriben nada
  (el dueño se cambia en HubSpot). La contratación PROPONE cuántos CSE y desde cuándo buscar; la confirma dirección.
- **La proyección cuenta solo los tratos al 50 % o más.** Sumar los 191 tratos abiertos (muchos al 10 % y vencidos
  hace meses) daba 150 % y 6 CSE; con los 24 que cuentan da 104–109 % y 2. El tipo de trabajo de un trato se deduce
  de su nombre (y, sin palabras, de si la empresa ya es cliente): hasta que el catálogo de casos de uso tenga horas.
- **Dos costos de la hora.** Directo = planilla ÷ horas pagadas; cargado = planilla entera ÷ horas con clientes, el
  que dice si una cuenta deja plata. La planilla sale del libro (una quincena pagada y la persona sigue = la otra
  está por pagarse) y, sin libro, del salario registrado; más la reserva de aguinaldo (13/12). Todo en dólares con
  la tasa de cada mes (`convertir`); lo que no tiene tasa no se adivina, se avisa.
- **Lo que no se construyó todavía, a propósito**: la lectura de la IA arriba de cada pantalla (pide un agente con su
  corrida y su costo), la complejidad en la pestaña de la cuenta, «Tu semana», la asistencia de Meet, las horas por
  tarea y por caso de uso, y leer en la carga las respuestas de «¿cuánto te tomó?» (ver esa sección).

## «¿Cuánto te tomó?»: un módulo propio que Feedback configura (2026-10-05)

**Contexto.** Para el diseño «Rentabilidad y carga», Elías pidió preguntas de tiempo configurables desde /feedback: al
marcar una tarea hecha o al publicar un documento, «¿cuánto te tomó?», para calibrar las horas por tipo de tarea. Hay
1.441 tareas en 50 cronogramas activos y ninguna tiene horas. Diseño aprobado: «Encuestas de tiempo · diseño» (Claude
Design), con la pestaña rehecha para mostrar primero si ya alcanza para calibrar.

- **Módulo propio que Feedback configura, no parte de Feedback** (`lib/tiempos`, `components/tiempos`, tablas
  `EncuestaDeTiempo` y `PreguntaDeTiempo`; SQL `scripts/sql/2026-10-05-preguntas-de-tiempo.sql`, con RLS y RESTRICTIVE).
  Lo que guarda son datos de la carga (persona, cliente, proyecto, tarea o documento, minutos), no reportes; y lo
  disparan el cronograma y la publicación, que llaman a `lib/tiempos/disparar.ts` sin saber nada del feedback. Feedback
  solo pone las «Automáticas» de su pestaña Encuestas (se llamaba «Tiempos» hasta el 2026-10-06).
- **Una pregunta por momento, sin «Nueva encuesta»**: tarea hecha, documento publicado y «Tu semana». Con tres momentos
  fijos en el código, crear encuestas solo sumaba un nivel más. Un momento nuevo es una entrada en `MOMENTOS` y su
  disparador. «Tu semana» se ve pausada y no se puede activar hasta que exista su pantalla.
- **Nacen pausadas.** Sin fila, un momento está apagado con su configuración por defecto; la fila nace la primera vez
  que dirección la guarda o la activa. Así nadie del equipo recibe una pregunta antes de que se le cuente para qué es.
- **Pregunta quien marca o publica, y «No lo hice yo» existe por eso**: no siempre es quien hizo el trabajo. No cuenta
  como respuesta ni como omisión en contra de nadie.
- **Muestreo determinista** (huella de la clave: desmarcar y volver a marcar cae igual). Por defecto, todas hasta tener
  20 respuestas por tipo de fase y después 1 de cada 3, hasta 3 por día. Un avance de la IA aplicado de golpe pregunta
  por hasta tres, una por tipo, primero los tipos con menos respuestas: una persona llegó a marcar 94 en un día.
- **No se pregunta por una tarea marcada más de 14 días después de su semana**: nadie se acuerda de cuánto tomó.
- **Un documento pregunta solo la primera vez**: la ruta lee si ya estaba publicado antes de escribir, y además hay una
  sola pregunta por proyecto y documento. Republicar una corrección no es haberlo hecho de nuevo.
- **Desmarcar retira lo pendiente; lo respondido se queda** (el tiempo se gastó igual). «Vencida» no se guarda: es una
  pendiente con su plazo de tres días pasado, así que no hace falta un job.
- **Lo que supone la carga se ve después de responder** por defecto: al lado empuja a elegir ese número y la respuesta
  deja de servir para corregirlo. Se cambia por pregunta («Al lado» o «No mostrarla»).
- **Los supuestos son los del diseño** (Configuración 2 h, Planificación 1,5 h…, `SUPUESTO_MINUTOS`). Lo que va a leer la
  carga es `tiemposAnotados({ desde, hasta })` (solo lo respondido), y con 20 respuestas de un tipo la mediana
  reemplaza el supuesto (`minutosDeLaCarga`).
- **Nunca por persona en pantalla**: Feedback › Encuestas cuenta por tipo de fase y por documento, y el CSV lleva el rol y
  no el nombre. La lectura para la carga sí trae el correo, porque la carga es por persona.
- **En «Para ti» es un pendiente agrupado que se contesta ahí mismo**, nunca un aviso: no es algo que pasó, es algo que
  te toca. Se va solo cuando se responde o vence.
- **Al publicar, la pregunta va en una tarjeta fija abajo a la derecha** (`PreguntasFlotantes`), no debajo de la barra
  del documento como en el diseño: los documentos se publican desde el pop-up «Acceso», que se cierra enseguida.
- **Lo que no se hizo**: «Tu semana» (espera su pantalla) y el detalle de cada pregunta (motivos por semana, últimas
  respuestas: el CSV lo cubre mientras tanto).

## Las sesiones de la preventa se encadenan: antes, durante y después (2026-10-07)

**Contexto.** Elías revisó las sesiones de CreditForce: «en la sesión 2, que es próxima, me dice "te llevaste de
la sesión"… la sesión ni siquiera ha pasado». Pidió auditar el antes, el durante y el después, y rediseñarlos con
la línea nueva y datos reales. Aprobó el diseño (artefacto «Preventa · Sesiones de exploración», cinco tableros)
con cuatro pedidos: ver la guía en orden o por sección, conservar la arquitectura de la venta en el panel con sus
nombres, que las sesiones pasadas cambien la planificación de las que vienen, y filtrar las preguntas en «Durante».

- **Una sesión arranca con un objetivo.** Lo sugiere el agente con la guía (`GuiaDeLaSesion.objetivo`) y lo
  confirma el vendedor (`SesionPlaneada.objetivo`). Si lo descarta, se guarda el texto para no volver a ofrecerlo.
  Debajo, «Si sale bien…» dice cuántos de los puntos que faltan para proponer cubre la guía (`puntoQueSePregunta`).
- **La guía va en tres tramos con sus minutos**: abrir (0–5), preguntar (5–40) y cerrar (40–45), en una sesión de
  45. «En orden» sigue la conversación (`ordenDeLaConversacion`): primero lo que viene de antes, después la venta y
  la escala alternadas, y el presupuesto al final. «Por sección» la parte en «Arquitectura de la venta» y «Escala
  de rendimiento», como antes.
- **Lo que viene de una sesión anterior se ve, y dice de dónde.** «Quedó abierto en la sesión N» es lo que el
  vendedor marcó en «Quedó abierto»; cada punto guarda de qué sesión viene (`explorarDe`). «Pasó de la sesión N» es
  lo que tenía preparado una sesión que se cortó (`pasaron`). El agente de la guía recibe cada punto llevado con un
  id (A1, A2…) y dice qué pregunta lo retoma. Lo que ninguna pregunta retoma va igual, como su propia pregunta.
  «Lo que traes de las sesiones anteriores» dice qué cambió en la guía por cada cosa.
- **«Durante» es la reunión en curso**: las preguntas con su casilla de hecha (`hechas`) y un campo para lo que
  respondió cada una. Esa respuesta es una nota por pregunta (`sesion:<id>:<a qué apunta>`), y el agente la lee
  junto a su pregunta, como contexto del vendedor. La primera que falta va marcada «Ahora». Arriba, el filtro Todas
  / Arquitectura de la venta / Escala de rendimiento. A la derecha, las notas libres y «Antes de colgar», que
  escribe la casilla del siguiente paso.
- **«Después» arranca con lo que leyó el agente de ESA reunión.** Al leer, el agente resume cada reunión y dice
  qué se respondió de lo planeado (`propuesta.lecturas`, por reunión: `meet:<id>`, `hubspot:<id>` o
  `documento:<id>`; guarda las últimas 24). Lo que sugirió se filtra a esa reunión por la etiqueta de su fuente.
  «Cuánto avanzó» compara lo que estaba listo para proponer antes de leerla con lo de hoy. «Quedó abierto» junta lo
  que no se preguntó y lo que se dijo sin explorar, cada cosa con una casilla para llevarla a la próxima sesión.
- **Una reunión sin conversación no espera una lectura.** Si su transcripción casi no tiene conversación (menos
  de 400 caracteres dichos por personas, `transcripcionCorta`), la sesión pregunta qué pasó. El caso de CreditForce
  del 2 oct: duró 6 minutos y solo se dijo «Sí. Ok.». Hay tres respuestas:
  - se hizo por otro canal: lo que se anota en «Durante» es lo que lee el agente;
  - se cortó: lo preparado pasa a la próxima sesión;
  - no se hizo: sale de la cuenta de sesiones y se ve tachada; se deshace tocando el mismo botón.

  En la barra de la izquierda se marca con un ● ámbar.
- **Un siguiente paso con fecha pasada ya no cuenta para proponer** (`siguientePasoVigente`). En CreditForce, el
  del 28 sep todavía contaba como listo el 7 oct. «Qué sigue» pide agendar otro.
- **El panel de la derecha suma «Para proponer»**: los siete puntos, en verde lo que está listo y en azul lo que
  pregunta la guía de la próxima sesión.
- **La guía se pide en tuteo, y se revisa.** La de CreditForce salió en voseo («vivís», «podés») porque las
  fuentes estaban en voseo. Ahora el prompt pone ejemplos en tuteo. Si la guía igual trae voseo (`voseoEnLaGuia`,
  que no cuenta el futuro), se pide una vez más, avisándolo: es una llamada de más, solo en ese caso. La regla del
  voseo se separó del parser de TypeScript (`lib/ui/voseo-formas.ts`) para que el servidor la pueda usar.
- **No lleva SQL.** Todo vive en los Json de la preventa (`contenido.sesiones`, `contenido.notas` y `propuesta`).
  La clave de una nota sube de 40 a 72 caracteres.
- **Lo que queda así, a propósito**:
  - Marcar una sesión como cortada no rearma solo la guía de la próxima: la etiqueta «Pasó de la sesión N» aparece
    igual.
  - Las reuniones leídas antes de este cambio no tenían resumen: lo arma `scripts/leer-reuniones-de-preventas.ts`
    (ver la sección siguiente). «Volver a leer» también, y solo existe para las de Meet.

## La preventa lee lo que ya había, y no compara contra lo que no se planeó (2026-10-07)

**Contexto.** Elías: «la sesión del 2 de octubre de Credit Force se ve sin datos… que para todos los prospectos
con los que se inició la exploración se puedan rellenar de forma retroactiva». La del 2 oct no tiene conversación
(6 minutos, «Sí. Ok.»): no hay nada que leer. El análisis encontró lo demás, y Elías lo aprobó («Aplica tus mejoras»).

- **Nadie de Smarteam en «Quién decide».** En CreditForce quedó confirmado Andrés Pinzón, el vendedor, aunque el
  prompt lo prohíbe: el modelo lee los nombres de la transcripción sin saber de qué lado está cada uno. Ahora el
  pedido le dice los nombres del equipo (TeamMember, de alta o de baja) y el código descarta a la persona que es
  del equipo (`esDelEquipoDeSmarteam`): con dos palabras o más, todas en el nombre de alguien del equipo; con una
  sola no alcanza, para no perder a un «Andrés» del cliente; o el cargo que dice Smarteam. Lo ya confirmado no se
  toca: lo saca una persona.
- **Lo planeado es lo que había ANTES de la reunión** (`guiaDeAntesDeLaReunion`). Sin una guía, la lectura
  comparaba la reunión contra lo que faltaba el día de leerla, y una reunión leída tarde salía con «no se
  preguntó» en preguntas que nadie llevó. Sin una guía armada antes, la lectura trae solo el resumen, y la
  pantalla lo dice.
- **La primera preparación lee sola lo que ya estaba grabado** (`leerLoQueYaHabia`). Solo si el agente nunca
  leyó, mientras se vende (la misma puerta que la lectura automática: prospecto, seis meses, sin proyecto) y si
  quedó una reunión de Meet con conversación, algo sumado a mano o una reunión de HubSpot que ya ocurrió. Es una
  sola lectura (las dos reuniones de Meet más recientes); lo demás queda «sin leer», con su botón. Cuesta una
  lectura más, unos US$0,20–0,35 con la guía.
- **Una reunión de HubSpot que el agente leyó aparece en Exploración**, aunque no haya estado en la agenda
  (`reunionesLeidasDeHubspot`, desde su lectura, que ahora guarda la fecha y el título). La del 28 sep de
  CreditForce, la primera de verdad, solo existe en HubSpot (Meet no tiene su transcripción) y no se veía: la
  «Sesión 1» era la llamada de 6 minutos. Si la misma reunión también está en Meet con su transcripción, cuenta
  una vez, y lo respondido se junta de las dos (`juntarCobertura`).
- **Lo de antes se pone al día con un script** (`scripts/leer-reuniones-de-preventas.ts`, en seco por defecto,
  lo corre Elías con `--apply`). Lee lo que nunca se leyó: la lectura de siempre, de a dos reuniones, hasta 4
  vueltas. De lo leído antes del rediseño arma SOLO el resumen (`resumirLoYaLeido`): no propone nada, no marca
  nada como leído ni toca la guía, así lo que el vendedor ya usó o descartó no reaparece. Ese resumen no guarda
  «lo listo antes» (no se sabe qué faltaba ese día), y «Cuánto avanzó» muestra solo lo de hoy. Medido en seco el
  2026-10-07: 4 preventas por leer (Megasuper, Universidad Monterrey, COLFAR y Grupo Monge) y la reunión del 28
  sep de CreditForce por resumir.
- **Sin SQL**: todo vive en los Json de la preventa.

## La etapa se sincroniza con HubSpot en los dos sentidos, y Nexus solo la escribe con una encuesta (2026-10-07)

**Contexto.** Elías: «Haz que las etapas sincronizadas con HubSpot en ambos sentidos, con sugerencia de mover la etapa
cuando Nexus lo detecte en una reunión. Para escribir en HS debe salir un pop-up, como si fuese una encuesta. Y el CSE
debe aprobarlo.» HubSpot → Nexus ya existía (el espejo de `hubspotPipelineStageId`, desde el 2026-07-30 también para las
implementaciones). Lo de Nexus → HubSpot estaba a medias desde el 2026-08-16: la ruta que escribe (`estado-hubspot`) y
las columnas de la sugerencia (`Project.etapaPropuesta*`), sin quien sugiriera ni pantalla que las usara.

- **Nexus escribe la etapa SOLO por la encuesta** (`components/clients/EncuestaDeEtapa.tsx`): una pregunta —«¿En qué
  etapa está el proyecto?»— con una respuesta por etapa movible del tablero («Sigue en Handoff», «Pasó a Diagnóstico»),
  y el botón «Mover a … en HubSpot». Se abre desde «Cambiar etapa» en la tarjeta de la etapa, desde el «Qué sigue» del
  proyecto o desde «Para ti». Escribe por `estado-hubspot`, que relee HubSpot en vivo (409 si alguien la movió allá) y
  devuelve lo que volvió por el espejo. Lo aprueba quien tiene `proyectos.cambiarEstadoHubspot` (CSE, CSL y dirección):
  los demás ven la pregunta y no la responden. Nunca se ofrece una etapa de cierre.
- **Cada reunión puede dejar una SUGERENCIA, nunca un cambio** (`lib/projects/etapa-desde-reunion*.ts`, desde el
  post-proceso de la sesión, con Haiku): si la reunión muestra con hechos que el proyecto ya está en una etapa
  POSTERIOR, queda en `etapaPropuesta*` con la frase de la reunión y de qué reunión salió. Un plan («la semana que viene
  presentamos») no cuenta, y la frase tiene que aparecer TAL CUAL en la reunión o la sugerencia se cae (la regla de la
  preventa para un nivel de la escala). No mira reuniones de más de 21 días, ni proyectos cerrados, ni la etapa en
  Bloqueado o Continuidad: desde ahí salir no se lee de una reunión. ⛔ No lee el avance del cronograma (la
  circularidad de `etapa-hubspot.ts`).
- **La sugerencia se guarda en las columnas de 2026-08-16, sin SQL nuevo.** La cita y la reunión van como JSON con
  versión dentro de `etapaPropuestaMotivo` (TEXT): una columna nueva era DDL coordinado entre las dos PCs por dos datos
  que solo lee la encuesta. Un texto plano se sigue leyendo como motivo.
- **Una sugerencia se apaga sola si alguien ya movió la tarjeta** a esa etapa o más allá (`sugerenciaVigente`, al
  leer, sin escribir), y una nueva reemplaza a la que hay solo si va MÁS LEJOS. Responder la encuesta (mover a la
  sugerida, a otra, o «Sigue en …») la borra: `cerrarSugerenciaDeEtapa`, fuera de la ruta, porque `estado-hubspot` tiene
  prohibido escribir en `Project` (`lib/projects/estado-a-hubspot.test.ts`).
- **En el «Qué sigue» del proyecto va después de las reuniones sin revisar** y antes del documento de la etapa: el
  documento «de la etapa» depende de que la etapa sea la verdadera.
- **Cuesta una llamada a Haiku por reunión** de un proyecto con tablero conocido, registro en HubSpot y alguna etapa a
  la que avanzar (`agentSlug` `etapa-desde-reunion` en el medidor).

## Preventa: lo que se vio al usarla (2026-10-07)

**Contexto.** Elías revisó el módulo y dejó ocho puntos: una pregunta de la guía con un «¿», el botón de WhatsApp
que no parecía botón, «Rearmar la guía» sin decir qué hace, los nombres de las pestañas de la sesión, el correo de
ejemplo de Conexión con el cliente ya conectado, las pestañas internas chicas, un diagnóstico que el agente
«inventó» en Automóvil Club, y poder buscar cualquier reunión de Meet en todos los «Contexto adicional».

- **Las pestañas de una sesión se llaman Preparación, En vivo y Análisis** (antes Antes, Durante y Después). Por
  dentro las claves siguen siendo `antes`, `durante` y `despues`: es copy. «Preparación» también es el nombre de una
  pieza; adentro de una sesión no se confunden. El recorrido pasó a la versión 4.
- **Las pestañas que ordenan una pieza van grandes** (`tamano="grande"` en `Segmentos` y en `Segmentado`): los
  momentos de la sesión e Identificación / Conexión. Los filtros de una lista siguen en el tamaño normal.
- **La guía dice en qué estado está y qué hace su botón** (`EstadoDeLaGuia`, arriba de la Preparación): la de base
  («Armar la guía» la adapta a esta empresa), al día («Volver a armarla») o vieja, con QUÉ cambió desde entonces
  (`cambiosDesdeLaGuia`: lo que ya se respondió, lo que entró, las dimensiones, lo llevado que no ubica) y
  «Actualizar la guía». Se fue el botón suelto de la cabecera, que solo se explicaba al pasar el mouse.
- **Un punto que te llevas de una sesión lleva la letra o el número de lo que apunta, nunca un «¿».** Lo que no se
  preguntó lo sabe al llevarlo (`SesionPlaneada.explorarPara`); lo demás lo ubica el agente al armar la guía
  (`GuiaDeLaSesion.ubicaciones`, cada A# en una tarjeta o una dimensión aunque ninguna pregunta lo retome). Sin dato
  todavía, una flecha gris y la guía avisa que está vieja. La clave de su nota y de su casilla «hecha» no cambia.
- **«Cuándo» usa la fecha de HubSpot** cuando la sesión no tiene la suya: la cabecera ya la mostraba y abajo decía
  «Sin agendar».
- **Con conversación, la estrategia de conexión sobra** (`estadoDeLaConexion`, lib/exploraciones/senales.ts): una
  reunión agendada, una que ya pasó (Meet, HubSpot o sumada a mano) o que el contacto agendó por HubSpot. Antes solo
  se miraba la agenda, que guarda lo que VIENE: en cuanto la reunión pasaba, la estrategia y su correo volvían.
  Ahora el aviso va arriba de Conexión, en verde, la estrategia se ve solo si se pide y su sugerencia no cuenta para
  revisar; y el agente no la propone si ya hablaron (`yaHablaron`, `proponeLaConexion`).
- **WhatsApp es un botón** («Escribir por WhatsApp»).
- **En todo «Contexto adicional» se busca en tu calendario** (supera la decisión del 2026-09-23 de que solo el
  cronograma lo hacía). La consulta es una sola (`lib/sessions/calendario-de-quien-busca.ts`) y la ruta también
  (`session-candidates/calendario?para=`), con el guard de la puerta de cada documento: el cronograma sigue con
  `cronograma.write` y sin el del handoff. Se retiró `timeline/calendario`. Las reglas de qué se ofrece no
  cambiaron: sin buscar, solo las que ya tienen cliente; las de otro cliente se marcan, no se esconden.
- **La preventa suma cualquier reunión de Meet** («Buscar una reunión de Meet», de la empresa o de tu calendario).
  Una de la empresa entra; una sin cliente se adopta con la misma regla de los proyectos
  (`prepararReunionParaElCliente`); una de otro cliente se rechaza; sin transcripción no se suma (no hay qué leer).
  Queda en `contenido.reunionesElegidas` (sin SQL) y se lista y se lee aunque sea de antes del alta, por el
  chokepoint (`getClientSessions` con `ids`). Quitarla solo la saca de esa lista: no le cambia el dueño.
- **Sin SQL.** Lo de Automóvil Club (el agente proponía un nivel para cada dimensión al preparar, aun sin pistas)
  se resolvió el mismo día: ver «Preventa: sin una pista del cliente, no hay diagnóstico».

## Preventa: sin una pista del cliente, no hay diagnóstico (2026-10-07)

**Contexto.** Automóvil Club de Costa Rica, recién creada y sin una sola reunión, amaneció con la escala entera
(24 niveles, Ventas «parece estar en Deficiente») y tres retos en el Resumen. Los niveles salían de la ficha de
HubSpot (que dice 2 empleados y ningún CRM), de su sitio y de «sin pistas directas, lo más probable es…»; los
retos, copiados casi palabra por palabra de la investigación de su industria en internet. Era la regla del
2026-10-01: una hipótesis en cada dimensión. Elías eligió «en blanco hasta hablar».

- **Lo que dijo o hizo el cliente es la única base de un nivel y del marco** (`esFuenteDelCliente`,
  `sinFundamentoDelCliente` en lib/exploraciones/contenido.ts): el diagnóstico (T), su actividad en HubSpot (H),
  las reuniones (S, M) y las notas del vendedor (N0). La ficha de la empresa (E0), sus contactos y negocios (C0,
  D0), su sitio (W0) e internet (W1, W2) no alcanzan. Vale para los niveles y para metas, planes, retos,
  tiempos, presupuesto, consecuencias e implicaciones; «Quién decide» no, porque los contactos de HubSpot son un
  hecho y el papel ya exigía que la fuente lo diga.
- **Sin esa base, la dimensión queda sin nivel** y la guía la pregunta en la reunión. Sin nada del cliente, el
  agente tampoco propone qué explorar a fondo. Supera lo del 2026-10-01 («las hipótesis son el mapa»): siguen
  siendo el mapa, pero solo las que tienen una pista.
- **Se aplica al proponer y al mostrar.** El agente lo tiene en el pedido y lo que mande sin base se descarta;
  y `propuestaVigente` deja de mostrar lo que se propuso antes sin base, sin tocar los datos. Medido en
  solo lectura sobre las 9 preventas vivas: Automóvil Club pierde sus 24 niveles y 3 retos, Megasuper 2
  niveles, y las demás nada. Lo confirmado por una persona no se toca.
- **Los retos de su industria van a la preparación de la reunión, como hipótesis** (pedido de Elías): no al
  Resumen. Los arma la guía desde la casilla «Su industria» (`GuiaDeLaSesion.retosDeLaIndustria`, hasta 3),
  cada uno con la pregunta para saber si le pasa, en la tarjeta «Retos de su industria · Hipótesis» de la
  pestaña Preparación. Sin la investigación, no se piden ni se aceptan.
- **Los casos de uso esperan a que la escala tenga base** (Elías, el mismo día: «si no, ¿sobre qué base va
  a sugerir?»; `laEscalaTieneBase`): un nivel confirmado o uno propuesto con fundamento del cliente. Sin eso,
  el agente no los propone (ni al abrir la pieza ni con el botón: el servidor también lo frena) y los ya
  sugeridos no se ven. Medido: solo Automóvil Club (9 sugeridos). Cuando tenga su primer nivel, esos 9
  vuelven a verse: se descartan o se pide otra tanda.
- **«En vivo» ya no tiene «Antes de colgar».** El siguiente paso no se escribe durante la reunión: la idea
  de cuál puede ser está en el tramo «Cerrar» de la preparación, y el agente lo saca de la transcripción.
  Las notas libres suben arriba de las preguntas.
- **Sin SQL.** Para ver los retos de la industria en una preventa ya preparada, se actualiza su guía.

## El «Contexto adicional» es de cada artefacto (2026-10-07)

**Contexto.** Elías: «el contexto adicional debe ser para cada artefacto por separado: la misma sección, pero
guardarse para cada artefacto». Validado ese día: en los proyectos, el handoff, el cronograma, el diagnóstico,
la planificación y la ejecución ya guardaban sus reuniones y sus notas por separado (solo el cronograma tenía
instrucciones), y el kickoff, la exploración, integraciones y la entrega no tenían el bloque. En la preventa
había un solo bloque para todas sus piezas.

- **En la preventa, las instrucciones son de cada pieza** (Elías eligió «solo las instrucciones»): las de
  Preparación las lee la preparación; las de Exploración, la lectura de cada reunión y la guía; las de Casos de
  uso, los casos (`instrucciones:<pieza>` en `contenido.notas`, `bloqueDeInstrucciones(notas, pieza)`). Las
  reuniones y las fuentes manuales siguen siendo de la empresa y se ven en todas: son la misma conversación.
  Resumen, La escala y Propuesta no tienen agente propio y dicen dónde escribirlas. No había instrucciones
  guardadas en producción (medido): nada que migrar.
- **En los proyectos, cada documento con IA tiene su «Contexto adicional» completo** (Elías eligió «sí,
  todo»): el kickoff, la exploración, integraciones y la entrega suman el bloque de reuniones, notas e
  instrucciones que ya tenían el diagnóstico, la planificación y la ejecución (`DocumentoContextSection`,
  arriba del documento). Arrancan SUGERIDOS, como el diagnóstico: entra toda reunión del proyecto con el
  cliente y el CSE saca o agrega; cada uno guarda la X en su columna (`kickoffOverride`, `explorationOverride`,
  `techRequirementsOverride`, `deliveryOverride`) y sacar una reunión de uno no la saca de los otros. SQL
  aditivo antes del deploy: scripts/sql/2026-10-07-contexto-de-cada-documento.sql.
- **Las instrucciones adicionales son de cada documento**: el handoff y los siete documentos de
  lib/contexto/documento.ts guardan las suyas en su canvas (la entry `__doc`, por doc-brief, sin SQL) y las lee
  solo su agente, primero en el mensaje (`cargarMaterialDelDocumento` → `material.instrucciones`;
  `instruccionesDelDocumento` para el handoff y para la lectura de reuniones de la exploración). Guardarlas pide
  la celda de generar ese documento, la misma que cura sus reuniones; el cronograma conserva su caja y su
  permiso. La entry `__doc` no es una sección: el índice del panel y el despacho de bloques la saltan.
- **El kickoff deja de leer solo el handoff.** Supera el «el kickoff NO consume las fuentes crudas» del código:
  el handoff sigue siendo el ancla y las reuniones completan lo acordado después (quién participa, fechas
  dichas por el cliente), con tres reglas en el mensaje: nada de precios, descuentos ni negociación; lo dicho
  puertas adentro no se le atribuye al cliente; y nada agranda lo vendido. Sin reuniones ni notas, el mensaje
  es el de siempre. Integraciones, igual: el handoff es el ancla y las reuniones precisan.
- **La entrega lee las reuniones de su bloque**, con su sala, en vez de las últimas de todos los vínculos del
  proyecto (incluidas las puertas adentro y sin decir de qué sala eran, en un documento que abre el cliente).
  La cifra «Reuniones de trabajo» que ve el cliente no cambia: sigue saliendo de la membresía del proyecto.
- **La exploración**: al preparar las sesiones, la guía lee además las reuniones y las notas de su bloque; al
  leer, la reunión sale del mismo bloque (las del cliente que nadie sacó, más las agregadas). Antes leía
  cualquier reunión del proyecto, también las internas.
