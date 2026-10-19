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
  cruza); *pedido de alcance nuevo* → entidad `ScopeRequest` (diseñada, ver plan; ⚠ se construyó el
  2026-10-07 sobre `PedidoFueraDeAlcance` y lo decide el CSE, no el CSL: ver «Seis mejoras en clientes»);
  *hallazgo de entrega* → `KnowledgeDocument`. *Prueba de admisión de un tipo:* quién actúa · dónde
  aterriza · qué pasa si nadie lo hace (dos tipos con la misma acción/persona/lugar son uno). *Regla:*
  el tipo vive en el HECHO (arriba), NO dentro de `Particularidad`; el apply RUTEA (código
  determinista). *Detección:* UN clasificador que viaja sobre una pasada de transcript ya existente
  (la lectura de cada reunión al llegar: el post-proceso, `lib/sessions/post-process.ts`; desde la etapa 2
  de la memoria de la cuenta comparte la fila `LecturaDeReunion` con Tareas, ver «La lectura de cada reunión
  es durable…» — corregido el 2026-10-09: hasta ese día decía «hoy el agente de avance»), NUNCA N agentes
  por destino que relean el transcript (la pasada full-
  transcript es de las más caras del sistema). *Estado:* `Particularidad` reconcebida = desviación
  FECHADA, 2 kinds (`ATRASO` con `weeksImpact` OBLIGATORIO + `COMPROMISO`), `SOLICITUD` deprecado
  (filas legacy conservan el enum + fallback de render; se auditan con
  `scripts/migrate-particularidades-audit.ts`, que exporta sin borrar), `occurredAt` = fecha de la
  sesión del hecho, `sourceQuote` = cita interna que NUNCA cruza al cliente (fail-closed). El router
  de hechos + `ScopeRequest` quedan diseñados para construir tras un sondeo de distribución.
  ⚠ **Enmendado el 2026-10-09** (memoria de la cuenta): `ScopeRequest` se construyó como
  `PedidoFueraDeAlcance` (ver «Seis mejoras en clientes»). El sondeo de distribución es la etapa 5: un script
  sin deploy, `scripts/sondeo-de-hechos.ts`, que deja cada hecho con su cita y su destino en
  `backups/<fecha>-sondeo-de-hechos/` y decide la variante y el modelo de la lectura de hechos. El router es la
  etapa 6, con los tipos y la prueba de admisión escritos en «Hechos, enrutador y novedades».
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

## Cada nivel de una edición habla de su industria (2026-10-18, escala 8.9.1)

**Contexto.** Elías vio, en Turismo, Inicial de «Seguimiento de cotizaciones y reservas» entero con el texto
general. Medido sobre las seis ediciones: 244 de 720 niveles (edición × dimensión × nivel) no tenían ningún
criterio dicho con las palabras de la industria; Automotriz y Turismo, más de la mitad.

- **La regla: cada nivel de cada dimensión dice al menos un criterio con las palabras de la industria**,
  reescrito o propio. La dice «Cómo se escribe una edición» y la vigila
  `lib/escala/documento/personalizacion.test.ts`; lo que quede general a propósito va en su lista con el porqué
  (`docs/escala/personalizacion-de-las-ediciones.md`). Una celda donde todos los criterios «No aplican» no
  cuenta. *Por qué:* una edición existe para que la empresa se reconozca, y un nivel entero en el texto general
  es justo donde deja de reconocerse.
- **Se cumplió solo con reescrituras** (322), sin criterios propios nuevos: por eso es un parche, como la 8.4.1.
  Un ejemplo de la industria va entre rayas y no se vuelve la única forma de cumplir el criterio; la revisión
  corrigió 50 reescritos que acotaban o ampliaban lo que pide la general.

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
- **La lectura automática solo mientras se vende.** ⚠ Desde el 2026-10-08 también en la de un cliente, con una
  reunión con alguien de Ventas (ver «Las reuniones grabadas con HubSpot entran solas a la preventa»). ⚠ Desde la
  etapa A de la memoria de la cuenta (2026-10-09), en la de un cliente solo se lee sola la reunión unida a una de sus
  sesiones, sin el filtro de Ventas (ver «La exploración son sus sesiones»). Cada reunión
  nueva dispara al agente solo si la empresa sigue siendo prospecto, la exploración tiene menos de seis meses y la
  venta todavía no tiene proyecto. Sin ese freno, cada reunión de implementación de la cuenta disparaba una corrida
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
- **SUPERSEDED 2026-10-18 en la preventa** (ver «La preventa lleva a la siguiente pregunta lógica»): la guía parte de lo
  que el cliente ya respondió, son unas 5 preguntas y cada una tiene su paso. Sigue valiendo para la exploración de un
  proyecto.
  **La guía de la próxima reunión: el código elige qué cubre, el agente escribe** (`lib/exploraciones/guia.ts`,
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
- **SUPERSEDED 2026-10-09 (memoria de la cuenta, etapa A):** la reunión de una sesión es la que se unió a ella
  (la elegida, la de su evento del calendario o, sin evento, la del mismo día, marcada «ligada por fecha»). Una
  reunión que no está en una sesión no es de la exploración: no se lee ni es pestaña. Ver «La exploración son sus
  sesiones».
  **La reunión se liga a su sesión por fecha, y se corrige a mano** (`SesionPlaneada.reunion`). Una
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
- **SUPERSEDED 2026-10-09 (memoria de la cuenta, etapas 0 y A):** el bloque va solo en las piezas cuyo agente
  lo lee. Como quedó: Preparación, con sus fuentes y sus instrucciones (dice qué lee: las sesiones más recientes de
  Exploración); Casos de uso, solo sus instrucciones (su agente no lee reuniones); La escala, con la explicación de que
  no tiene agente; la Exploración abre en su página de inicio, con las sesiones, las fuentes manuales y las
  instrucciones, sin el bloque ni lista de reuniones; Resumen y Propuesta no lo muestran. Ver «Etapa 0: arreglos y
  limpieza» y «La exploración son sus sesiones».
  **En la preventa, el bloque va arriba de cada pieza, salvo La cuenta** (es la ficha de la empresa).
  Tres partes: las reuniones de Meet y HubSpot con la empresa, leídas o no; las fuentes manuales (lo
  que antes era «¿Una sesión que no quedó en Meet?»); y las instrucciones adicionales. Con `?sumar=1`
  (la preventa que se abre «Con una transcripción») arranca abierto y con el formulario a la vista.
- **SUPERSEDED 2026-10-09 (memoria de la cuenta, etapa A):** en un prospecto cada reunión con la empresa entra sola
  como sesión (salvo las internas y las de una serie) y se saca, una o varias a la vez, a «Fuera de la
  exploración»; en un cliente o un proyecto nada entra solo: se agrega con «+ Agregar sesión».
  **En la preventa las reuniones no se eligen**, a diferencia del cronograma: no hay otro proyecto de
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
- **Leído o no leído en la Bandeja (2026-10-08, Elías: «debería poder marcarse de forma sencilla cada ítem como no leído»).** Como en un correo: abrir un reporte lo deja leído; el punto de cada fila lo cambia (azul, lo que no leíste; al pasar el mouse por una fila leída, un círculo vacío para dejarla no leída) y arriba del reporte va «Marcar como no leído». No leído es `revisorLeyoAt` vacío (`POST /api/feedback/[id]/lectura`, solo quien revisa): vuelve el punto y, si lo último de la conversación lo escribió la persona, vuelve a «Te respondieron» y al número de la pestaña. El punto ya no es solo de lo nuevo: también sale en lo cerrado y en una respuesta sin leer. ⚠ Es de dirección entera: hay un solo `revisorLeyoAt` por reporte, así que lo que marca uno lo ven los otros. Con el dedo no hay punto que tocar (el toque abre el reporte): se marca desde arriba del reporte. Sin SQL.

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
- **Lo que dejaron tus reuniones, en un renglón** (2026-10-09, memoria de la cuenta, etapa 1): un solo renglón
  agrupado con tus reuniones con clientes de los últimos 30 días, con un enlace a la tarjeta «Lo que dejó esta
  reunión» de cada una. Cuenta solo lo que se decide en la tarjeta (la minuta sin revisar, los pedidos fuera de
  alcance sin decidir y los campos de la ficha de esa reunión). Las tareas propuestas, la etapa, la fecha del
  diagnóstico y las alertas siguen en sus propios renglones: una cosa, un solo renglón. Las reuniones de prospectos
  no entran (se ven en la tarjeta de la reunión). *Por qué:* revisar lo de una reunión en cuatro pantallas era la
  razón de que nadie lo revisara (2 de 533 minutas revisadas al 9-oct).
- **Lo propuesto deja de pedir revisión a los 30 días** (misma etapa): los renglones de pedidos fuera de alcance, etapa
  sugerida y fecha del diagnóstico propuesta dejan de pedir revisión 30 días después de que nació lo propuesto, y un
  pedido que ya está en el renglón de su reunión no se repite. La pantalla de cada módulo los sigue mostrando (la marca
  «Venció sin revisar» está, por ahora, solo en la tarjeta de la reunión), y decidir después sigue valiendo. *Por qué:* un pendiente que nunca se va deja de mirarse.

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
- **Sin relación gestionada, HubSpot no comparte el uso, y la pantalla lo dice** (2026-10-07, Cicadex).
  Medido ese día: 48 de 48 cuentas gestionadas traen puntaje y 0 de 119 sin gestionar. 18 cuentas con
  puntaje en julio lo perdieron porque HubSpot terminó la relación entre el 12 jul y el 6 oct, con la
  copia diaria apagada: no saltó ningún «por vencer», y la ficha decía «sin puntaje» como si nunca lo
  hubiera tenido. Ahora el estado de la ficha y la pestaña Adopción dicen cuándo terminó y el último
  puntaje con su fecha (`porQueNoHayUso`), que sale de la copia semanal y nunca reemplaza al de hoy.
  «A quién llamar» suma el motivo `relacionTerminada` durante 90 días (alta los primeros 30): sin él, el
  aviso de la relación desaparecía justo al perderse. Más atrás no, porque hay relaciones terminadas en
  2021 con la cuenta todavía activa en HubSpot.

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
  Regla pura en `lib/clients/que-sigue-del-proyecto.ts`. ⚠ Desde la etapa 6 de la memoria de la cuenta, las
  novedades de reuniones del documento de la etapa van justo después del documento desactualizado (ver «Hechos,
  enrutador y novedades»).
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

## El color de cada cuenta y las alertas que se cierran (2026-10-07)

> Elías, para la rutina de Alex Vanegas (CSL), que revisa la cartera los primeros 10 minutos del día:
> cada cuenta con un color (verde va bien, amarillo señales de riesgo, rojo riesgo alto) que diga por
> qué al pasar el mouse, y alertas que se puedan resolver o descartar con una nota corta y que vuelvan
> solo con una señal nueva. Medido ese día: 88 de 93 cuentas pintadas por los motivos para llamar, 11
> en rojo solo por alertas del agente (kölbi entre ellas), y 105 alertas abiertas, ninguna cerrada.

- **El color sale de las cuatro lecturas de la ficha** (`saludDeLaCuenta`, lib/cs/cartera-reglas.ts):
  entrega, uso, relación y renovación, las MISMAS de `estadoDeLaCuenta`, así la lista, la ficha y el
  chip de la cabecera no se contradicen. Ya no sale de los motivos para llamar, que siguen ordenando
  la lista y diciendo «Por qué llamar».
  - **Rojo, solo con un hecho duro**: un proyecto bloqueado, una cancelación registrada en HubSpot, o
    una renovación a 90 días o menos que llega con el uso mal o un proyecto atrasado.
  - **Amarillo**: un proyecto atrasado; el uso bajo, cayendo o con hubs sin activar; más de
    `DIAS_SIN_CONTACTO` días sin contacto, o ninguno en 6 meses.
  - **Verde**: nada de lo anterior, y algo dice que va bien (entrega al día, uso o contacto reciente).
  - **Gris «Sin datos»**: nada dice cómo va.
- **Lo que NO pinta, a propósito.** Las alertas del agente vigía: son lo que la IA cree, se ven en la
  fila con su chispa y se resuelven ahí. La deuda vencida: el pedido nombra entrega, adopción,
  relación y renovación; sigue siendo un motivo para llamar. Una renovación cerca sola, y un uso sin
  puntaje (no saber no es un problema).
- **La relación pinta solo donde Smarteam acompaña la cuenta** (`laAcompanamos`: un proyecto activo
  o la relación gestionada en HubSpot). La primera versión dejaba 59 de 93 en amarillo, 32 de ellas
  solo por no tener contacto y sin proyecto ni relación gestionada: cuentas de las que nadie espera
  una llamada. Esas van en gris y su porqué lo dice. Con la regla: 13 rojas, 29 amarillas, 16 verdes,
  35 grises; kölbi en amarillo por el uso cayendo.
- **La lista va por color**: rojo, amarillo, gris, verde, y dentro de cada color el orden de antes
  (cancelación, lo urgente, sin datos, gravedad). El gris va después del amarillo: arriba tapaba lo
  que sí pide una llamada. Todas las cuentas con su color, en la pestaña «Cartera» (antes el filtro «Toda la
  cartera» de «A quién llamar»; ver §La clasificación de cada cuenta).
- **Una alerta se cierra con una nota opcional** (`CsAlert.resolutionNote`, una línea de hasta 280
  caracteres; SQL `scripts/sql/2026-10-07-nota-de-la-alerta.sql`, antes del deploy). Se resuelve o
  descarta en la vista «Alertas» de «A quién llamar», que junta las de TODAS las cuentas (también los
  avisos de renovación, que no son motivo para llamar: sin esa vista no había dónde cerrarlos), desde
  el botón «Revisar N alertas» de cada fila o desde el panel de la cuenta, con el mismo componente
  (`AlertaParaCerrar`). Con ese botón en la fila, las alertas del agente no repiten su chip. Las
  cerradas de los últimos 30 días se consultan y se vuelven a abrir.
- **Vuelve solo con una señal nueva** (`queHacerConLaRedeteccion`, lib/cs/alertas-reglas.ts): el
  agente la ve más grave, o trae evidencia que no estaba (otra reunión, evento, tarea o negocio).
  Antes una cerrada se callaba 7 días y volvía igual aunque nada hubiera cambiado. Vuelve como
  alerta nueva y dice cómo se cerró la anterior. El agente recibe las cerradas de 30 días con su
  nota, para no repetirlas.
- **Los avisos de renovación que ya no corresponden se cierran solos** (la renovación pasó, cambió de
  fecha o cruzó al umbral siguiente), firmados `sistema` y con su porqué. Antes se juntaban el de 90,
  el de 60 y el de 30 de la misma fecha (38 abiertos el 2026-10-07): se limpian en la primera corrida
  del job después del deploy.
- Los recorridos del índice (v2) y de la cuenta (v3) lo explican.

## La clasificación de cada cuenta: Nexus propone, la CSL confirma (2026-10-07)

> Primera entrega del plan para que Éxito del cliente le sirva a Alex Vanegas (CSL) para administrar la cartera
> (docs/exito-del-cliente-cartera-plan.md). Elías pidió cuatro datos por cuenta —tipo de relación, potencial, CSE
> responsable y momento—, que Nexus los proponga con lo que sabe y que Alex los confirme o los cambie; y que, cuando
> la cuenta cambie, Nexus proponga el valor nuevo.

- **Nexus propone con reglas, sin IA** (`lib/cs/clasificacion.ts`, puro, con pruebas), y la propuesta se calcula al
  leer: si la cuenta cambia, cambia sola. La tabla `ClasificacionDeCuenta` guarda solo lo confirmado (con quién y
  cuándo) y lo descartado (el valor y la «huella» de la razón que lo propuso). SQL aditivo
  `scripts/sql/2026-10-07-clasificacion-de-cuenta.sql`, antes del deploy; sin la tabla, la cartera se ve igual con
  las propuestas y confirmar responde 503. Los valores son texto, no enum: sumar uno no pide `ALTER TYPE`.
- **Los valores**, con los que sumé a los de Elías:
  - Tipo de relación: proyecto en curso · servicio recurrente · **solo licencias** (gestionamos sus licencias sin un
    servicio de Smarteam) · sin servicio activo · excliente (nada activo hace más de un año). Con proyecto y servicio
    recurrente a la vez manda «servicio recurrente»: el proyecto lo dice el momento.
  - Potencial: alto · medio · bajo · **sin estimar** (no es lo mismo que bajo). Sale del TAM de Ventas; sin TAM, de las
    oportunidades que ve Nexus y de lo que paga en licencias. ⚠ Los cortes (`CORTES_DE_POTENCIAL`) son un supuesto a
    calibrar con Alex. Sin TAM ni licencias activas, «sin estimar»: Nexus no inventa el potencial de un cliente dormido.
  - Momento: **arranque** (antes del kickoff) · implementación · adopción · recurrente · renovación cercana (90 días) ·
    **expansión** (preventa abierta) · **salida** (cancelación registrada) · **sin actividad**.
  - CSE: el de HubSpot. No se propone: se cambia con el pase de cuenta (entrega 5).
- **La etapa de HubSpot manda sobre la que infiere Nexus** para el momento y la relación (`etapaDeNexusPorNombre`, la
  misma equivalencia por nombre de la ficha): el equipo la mueve en HubSpot. kölbi tenía un proyecto en «Continuidad» y
  otro en «Adopción» y Nexus los leía como implementación.
- **La propuesta se ve una vez y en su celda**: sin nada confirmado, en azul con la chispa; elegirla la confirma, y
  confirmar le quita el azul (no la pinta de verde ni la mueve). Con algo confirmado y una propuesta distinta, lo
  confirmado queda y debajo va «Nexus propone: X · Usar · ✕». El porqué, al pasar el mouse. `CeldaSelect` ganó la
  forma `sugerencia` para esto.
- **Lo descartado no vuelve hasta que cambie la razón** (la huella: los proyectos, la fecha de renovación, el TAM…).
  Confirmar un valor borra el descarte de ese dato.
- **Pestaña «Cartera»** en el índice: reemplaza al filtro «Toda la cartera» de «A quién llamar». Por defecto las
  cuentas de la cartera; «Fuera de la cartera» muestra los demás clientes (los dormidos, y alguno con un servicio
  recurrente en Cobranza sin proyecto ni licencias); «Por confirmar» deja las que tienen una propuesta a la vista.
  La franja de arriba usa todas las propuestas de las cuentas que se ven en un solo pedido (`POST /api/cs/clasificacion`,
  una transacción por cuenta). La clasificación también está en el panel de cada cuenta. La confirma la CSL o un super
  admin (`guardLiderDeCs`), igual que el resto del área.
- **El universo de la cartera no cambió**: «A quién llamar», las renovaciones y las demás preguntas siguen mirando las
  93 cuentas con proyecto o suscripción activa. Solo la clasificación y el buscador ven los 168 clientes.
- Los recorridos del índice (v3) y de la cuenta (v4) lo explican.

## La cartera de la CSL: relación con HubSpot, color más fiel, vistas, Equipo, pase de cuenta y lo que persigue la empresa (2026-10-09)

> Entregas 2 a 6 de docs/exito-del-cliente-cartera-plan.md (pedido de Elías para Alex Vanegas, CSL), más la relación
> con HubSpot como dato de cada cuenta. Elías, sobre esa relación: «es tan importante que lo entienda Customer Success
> que hasta deberíamos replantear la interfaz»; y después, «aplícalo, junto con lo que falta del plan».

- **La relación gestionada con HubSpot es un dato de cada cuenta** (`lib/cs/relacion-gestionada.ts`, puro). HubSpot
  comparte el uso, la activación y las licencias solo de las cuentas que Smarteam GESTIONA, y la relación se sostiene
  con trabajo: cada cosa que alguien de Smarteam crea o edita en el portal del cliente cuenta 60 días; entrar sin hacer
  nada no cuenta (knowledge.hubspot.com/partner-tools/earn-managed-mrr-credit). Medido el 2026-10-09: en 34 de las 47
  gestionadas el vencimiento cae 59 a 61 días después de la última actividad, 20 clientes habían perdido la relación
  sin que nadie lo notara (la copia de Partner estuvo apagada de julio a octubre) y 7 vencían en un mes. Estados:
  gestionada · vence en 30 días · vence en 14 días (urgente) · terminada · solo vendida · sin relación · sin Partner.
  Se ve en la columna «HubSpot» de «Cartera», en el panel del índice (con la regla en palabras), en el panel de cada
  cuenta (cuándo vence, lo último que hizo Smarteam en su portal y quién, y qué hacer) y en la pestaña Equipo. La copia
  de Partner guarda además el NOMBRE de quien trabajó por última vez (`nexus_ultimo_activo`).
- **«Para ti»**: al CSE de la cuenta le llega cuando la relación vence en 14 días o menos, o terminó hace un mes o menos
  y la cuenta sigue activa (`pideTrabajoEnElPortal`); a quien lidera Customer Success, todas juntas. Ninguna escribe
  nada: es un pendiente que se va solo cuando alguien trabaja en el portal.
- **Bug de la copia de Partner arreglado**: un registro que no se emparejaba con ningún cliente (y que no se crea, como
  «Hub ID: …») hacía `continue` antes de guardarse, así que quedaba congelado para siempre. Ahora se guarda sin cliente.

**Entrega 2 · el color más fiel** (`saludDeLaCuenta` = `saludSegunNexus` + la corrección de una persona):
- **Quejas y retrasos de reuniones y correos pintan, con la frase literal verificada.** El vigía levanta «Queja del
  cliente» (`QUEJA`, valor nuevo de `CsAlertCategory`) o un retraso (`TIMELINE_OVERDUE`) con `evidence.cita` =
  la frase y de dónde (reunión o correo). El runner la busca TAL CUAL en la transcripción o la minuta de esa reunión
  (por el chokepoint de pertenencia: una reunión de otro cliente no verifica nada; una de puertas adentro tampoco) o en
  el correo, y solo verificada pinta: amarillo; rojo si es grave o la cuenta renueva en 90 días o menos. Las demás
  alertas del vigía siguen sin pintar (regla del 2026-10-07). La guía va en el MENSAJE (`GUIA_DE_CRUCES`): sin
  re-sembrar el prompt. Una frase verificada nueva cuenta como evidencia nueva para que la alerta vuelva.
  ⚠ **Enmendado el 2026-10-09** (memoria de la cuenta, etapa 6): la QUEJA verificada también la levanta la lectura
  de cada reunión, como un detector más, con la misma verificación (cliente hablando, cita tal cual en la reunión,
  nunca una reunión de puertas adentro) y la misma `evidence.cita`, así pinta igual. El riesgo no: va como evidencia
  al vigía, que juzga la cuenta entera y decide. Una sola alerta por cita: si el vigía y la lectura ven la misma, no
  se duplica. Ver «Un solo sistema de alertas, con tres detectores».
- **Correos**: el vigía lee los del cliente con la empresa en HubSpot (`correosDeLaEmpresa`, solo los que escribe alguien
  de afuera, 6 semanas, 8 como mucho). Sin el permiso de correos llegan tapados: el vigía mira solo reuniones y «De
  dónde salen los datos» lo dice («sin permiso de HubSpot: solo reuniones»).
- **El motivo de bloqueo cuenta aunque el estado no diga bloqueado** (amarillo, con su porqué).
- **Corregir el color** (CSL y super admin, `guardLiderDeCs`): color + razón corta. Vale 30 días o hasta que Nexus vea
  una razón ROJA que no veía al corregir (se guardan las razones rojas de ese momento); al dejar de valer, a quien la
  puso le llega en «Para ti». El color de Nexus se ve al lado («Nexus diría…»). Se ve en «Cartera», en el panel de la
  cuenta y en la cabecera de la ficha del cliente, donde lo ve también el CSE (que no la hace).
- **«En espera del cliente»**: un estado propio (⏸, gris pizarra), con la nota de qué se espera; no cuenta como riesgo.
  Nexus lo PROPONE cuando un proyecto activo dice «Atraso por cliente», «Cliente no responde» o «Cliente pidió pausa»;
  lo marca o lo quita la CSL. Marcado, el freno del cliente deja de pintar; si además hay algo rojo que no es ese freno
  («Atraso por Smarteam», una queja grave, una cancelación), gana el rojo y dice «y en espera del cliente».
- **`CorreccionDeSalud` es append-only**: cada cambio es una fila (corregir, quitar, en espera, quitar, descartar la
  propuesta) y el estado es el último evento de cada clase (`ajustesDesdeEventos`). Así queda quién hizo qué y cuándo.
  `tipo` es texto con CHECK, no enum.

**Entrega 3 · filtros y vistas**: color, relación con HubSpot, tipo de relación, momento, potencial, CSE (y «Sin CSE»),
renovación y sin contacto, con varios valores a la vez (`lib/cs/filtros-de-cartera.ts`). Viven en la dirección: una
vista es un enlace. Cinco vistas de arranque (en el código, no se guardan) y las guardadas en `VistaDeCartera`,
compartidas entre la CSL y dirección; solo quien la creó la borra.
- **El filtro por CSE mira al CSE de la cuenta** (quien lleva más proyectos en ella), el mismo que cuenta la pestaña
  Equipo: así cada número de Equipo deja la lista con ese mismo número.

**Entrega 4 · Equipo**: por CSE, sus cuentas, las recurrentes contra la meta (6 a 7, `ConfigCarga.metaRecurrentes`,
editable en los supuestos de la carga), en riesgo, en espera, sin contacto, la relación con HubSpot por vencer, el uso,
los atrasos y bloqueos y su 1:1 en la carga. Cada número abre esas cuentas en «Cartera». ⚠ «Alto potencial sin
servicio» no va por CSE: una cuenta sin proyecto activo no tiene CSE en Nexus; está como vista de la cartera.

**Entrega 5 · el pase de cuenta y «CSE Encargado»** (decisión de Elías: migrar):
- **El espejo lee primero «CSE Encargado» (`cse_encargado`) y, si está vacío, «CSL Encargado» (`csl_encargado`)**
  (`encargadoDelProyecto`, lib/hubspot/encargados.ts). Hasta hoy `csl_encargado` guardaba al CSE. Con esa lectura, la
  migración no le cambia a nadie las cuentas que ve, en ningún orden.
- **El pase** (la celda «CSE encargado», en «Cartera», en el panel de la cuenta y en el listado de clientes): escribe
  `cse_encargado` = el CSE y `csl_encargado` = la CSL (el rol en Nexus, no un correo en el código; las cuentas de
  prueba no cuentan) en los proyectos de implementación, en la EMPRESA y en sus CONTACTOS. Desarrollo y Sitios web no
  se tocan. Al CSE nuevo le llega en «Para ti» el resumen de la cuenta (`resumenDelPase`: color y porqué, relación,
  momento, renovación, alertas, último contacto, en espera, HubSpot y proyectos); al anterior, una línea.
- **`scripts/migrar-cse-encargado.ts`** (en seco por defecto; escribe solo en HubSpot): copia CSL → CSE en los proyectos
  de implementación, pone a la CSL en «CSL Encargado» y escribe los dos en las empresas y sus contactos. Antes de
  escribir verifica que el encargado que lee el espejo de cada proyecto no cambie; si alguno cambiaría, no escribe
  nada. En seco el 2026-10-09: 75 proyectos, 64 empresas, 775 contactos, ninguno cambia de encargado.
  ⚠ Antes de correrlo: el deploy que lee «CSE Encargado» en producción, y revisar en HubSpot si algún workflow,
  reporte o vista usa «CSL Encargado» de los proyectos (después dice la CSL).
  ⚠ Después, un proyecto nuevo con «CSE Encargado» vacío y «CSL Encargado» = la CSL queda a nombre de la CSL: el
  equipo tiene que llenar «CSE Encargado» al crear proyectos en HubSpot.

**Entrega 6 · lo que persigue la empresa**:
- **Lo que alguien cambia en HubSpot vuelve como propuesta** (retos estratégicos y dolor principal,
  `lib/clients/ficha-desde-hubspot.ts`): si el valor de la empresa no es el que escribió Nexus, se propone en
  Información del cliente (nunca se pisa lo confirmado), al abrirla y como mucho cada 10 minutos por cliente. Se
  propone UNA vez: descartado, no vuelve hasta que HubSpot cambie de nuevo (`FichaGuardada.hubspotVisto`).
  «Resultados que persigue» no vuelve: sale de los resultados medibles confirmados de cada proyecto.
- **La preventa también lleva a la ficha lo que sabe.** ⚠ Desde la etapa 3 de la memoria (2026-10-10) va por su propia
  puerta, sin IA (`proponerALaFichaSinIA` con lib/exploraciones/a-la-ficha.ts, origen «Preventa»): al preparar y al
  confirmar una casilla en el lienzo, con las metas dentro de los retos y lo interno marcado. La exploración del proyecto
  sigue por `proponerFichaDesdeLoAveriguado`. Ver «La memoria de la cuenta y del proyecto: un solo cargador». En los dos
  casos, recién al confirmar la ficha se escribe en la empresa de HubSpot.
- **En la cuenta de Éxito del cliente**, la pestaña Resultados abre con «Lo que persigue la empresa» (lo confirmado, con
  quién y cuándo, y si hay una propuesta sin revisar) y Estado de la cuenta lo dice en una línea.

**SQL, antes del deploy**: `scripts/sql/2026-10-09-cartera-de-la-csl.sql` (las dos tablas, con RLS) y
`scripts/sql/2026-10-09-queja-del-cliente.sql` (el valor `QUEJA`). Sin ellos, `/api/health` responde 503 y el deploy se
revierte. Sin las tablas, el código se ve con el color de Nexus y sin vistas guardadas, y guardar responde 503.

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
  su servicio; sin proyecto, el cliente: solo si tiene uno pausado y NINGUNO en marcha (2026-10-08: «cualquier pausado
  del cliente» avisó en Bluesat por su Service Hub en pausa mientras la implementación de SignNow seguía). Se calcula al
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
- **Un Super Admin ve todo Finanzas en el menú, en cualquier vista (Elías, 2026-10-08: «los super admins deberían
  poder ver todo»).** La vista solo elige adónde entra «Finanzas» (Dirección → punto de equilibrio, Supervisión →
  Supervisión); ya no le esconde áreas: en Dirección no aparecía la Planilla. Para quien registra el menú sigue
  filtrado, por permisos. Revierte la decisión del 2026-10-03 de «Dirección: solo reportes».

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

- ~~**Dos pantallas, y el dinero en una sola.** … Las dos viven en Éxito del cliente y son de la CSL y de dirección …
  nunca muestra el costo de una persona.~~ **Superado el 2026-10-07** (ver «Rentabilidad es de dirección y la carga lee
  lo respondido»): Rentabilidad volvió a ser solo de dirección y muestra el costo de la hora de cada persona. Sigue en
  pie que «Carga del equipo» es de HORAS, sin un monto, y es de la CSL y dirección.
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
  tarea y por caso de uso. (Leer en la carga las respuestas de «¿cuánto te tomó?» se hizo el 2026-10-07.)

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
  como respuesta ni como omisión en contra de nadie. Desde el 2026-10-07 pregunta «¿Quién la hizo?» y le pasa la
  pregunta a esa persona (ver la sección siguiente).
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
- ~~**Los supuestos son los del diseño** (`SUPUESTO_MINUTOS`) … con 20 respuestas de un tipo la mediana reemplaza el
  supuesto (`minutosDeLaCarga`).~~ **Superado el 2026-10-07**: la copia de los supuestos se borró (salen de
  `lib/carga/config.ts`) y nada reemplaza solo un número: la calibración lo PROPONE y la CSL o dirección lo confirma.
- **Nunca por persona en pantalla**: Feedback › Encuestas cuenta por tipo de fase y por documento, y el CSV lleva el rol y
  no el nombre. La lectura para la carga sí trae el correo, porque la carga es por persona.
- **En «Para ti» es un pendiente agrupado que se contesta ahí mismo**, nunca un aviso: no es algo que pasó, es algo que
  te toca. Se va solo cuando se responde o vence.
- **Al publicar, la pregunta va en una tarjeta fija abajo a la derecha** (`PreguntasFlotantes`), no debajo de la barra
  del documento como en el diseño: los documentos se publican desde el pop-up «Acceso», que se cierra enseguida.
- **Lo que no se hizo**: «Tu semana» (espera su pantalla) y el detalle de cada pregunta (motivos por semana, últimas
  respuestas: el CSV lo cubre mientras tanto).

## Rentabilidad es de dirección y la carga lee lo respondido (2026-10-07)

> Elías contestó el plan de la carga y la rentabilidad y se rediseñó en el lienzo «Rentabilidad · diseño» (página «Rediseño
> del 7 oct», 9 tableros). El plan de aplicación, con lo que quedó fuera, está en `docs/rentabilidad-y-carga-plan.md`.

- **Rentabilidad es solo de dirección (SUPER_ADMIN)** (`veRentabilidad`, lib/rentabilidad/acceso.ts). Revierte lo del
  2026-10-06: muestra el costo de la hora de cada persona, sacado de la planilla. La CSL se queda con Carga del equipo y
  «Ajustar el cálculo» (horas, sin montos). Un CSE o la CSL que entra a Rentabilidad va a «Tu carga». Lo vigila
  `lib/rentabilidad/acceso.test.ts`.
- **«Tu carga» es una ruta propia, `/tu-carga`**. Dirección la abre como la cuarta pestaña de Rentabilidad. ⚠ **Desde el
  2026-10-15 no está en el menú de nadie** (decisión de Elías): estaba para CSE y CSL, y la lista de cuentas no era la
  del CSE encargado: las reuniones y su preparación se le cuentan a cada invitado del calendario. La ruta sigue, y un
  CSE o la CSL que entra a Rentabilidad va ahí. La persona sale de la SESIÓN: la página no lee la dirección ni la
  búsqueda, y la pantalla recibe solo lo suyo (`cargarTuCarga` recorta en el servidor). No cuelga de `/customer-success`
  porque el menú iluminaría «Éxito del cliente», que el CSE no tiene.
- **Orden alfabético, sin ranking**, en todas las listas de personas; la CSL va aparte. Las horas libres no nombran a
  nadie.
- **El costo de la hora, de tres maneras** (`ModoDeCosto`, lib/rentabilidad/margen.ts): por persona (la de entrada:
  cada hora al costo de quien la hizo), por equipo (al promedio de su equipo) y cargado (la planilla entera ÷ las horas
  con clientes). Quien no tiene planilla ni salario en el período va al costo de una hora pagada promedio, y se avisa.
  Nunca se muestra el salario mensual de nadie: solo su costo por hora.
- **Cada cobro, factura y quincena en colones se convierte con el tipo de cambio de SU DÍA** (`tasaDelDia`, hasta una
  semana atrás); sin el del día, con el del mes. Lo que no tiene ninguna no se adivina.
- **Lo respondido manda en la entrega** (lib/carga/entrega.ts): si quien hizo la tarea anotó cuánto le tomó, eso
  reemplaza al estimado y va a esa persona (puede no ser el dueño del proyecto). Cada número dice de dónde sale: del
  calendario (lo agendado, hasta tener la asistencia de Meet), respondido o estimado. «Con dato real» = calendario +
  respondido.
- **12 tareas clave, reconocidas por el título** (lib/tiempos/familias.ts): integración, pipeline, migración,
  automatizaciones… Una tarea cae en UNA sola (la primera de la lista que calza: la actividad gana al objeto). Se
  preguntan siempre, sin muestreo, y van primero en el tope del día. Tienen sus propias horas en los supuestos
  (`horasPorFamilia`, vacío de fábrica: sin número propio cuenta como su tipo de fase).
- **La encuesta de arranque** (momento `ARRANQUE`, texto: sin SQL): se manda una vez desde Feedback › Encuestas, una
  pregunta por tarea clave a cada CSE y CSL («¿Cuánto te toma normalmente…?»), vence en 14 días. *Por qué:* una tarea
  clave se termina pocas veces al mes en toda la cartera; si solo se pregunta al terminarla, juntar respuestas lleva más
  de un año. Da un primer número en una semana.
- **La calibración PROPONE, una persona confirma** (lib/carga/calibracion.ts; «Ajustar el cálculo» › Calibración): por
  tipo de fase con 20 respuestas, comparando cada una con lo que suponía la carga para ESA tarea (con su parte y el
  factor de su cuenta); por tarea clave con 3 del arranque o 10 al terminarla; por variable del factor con 5 cuentas
  que la tienen y 5 que no. «Usar» guarda una fila nueva de `ConfigCarga` con el porqué; «Descartar» lo recuerda con su
  número y no vuelve hasta que el número cambie.
- **Lo que suponía la carga se guarda con la respuesta**, ya con la parte de Smarteam y el factor de la cuenta
  (`PreguntaDeTiempo.estimadoMinutos`), y la pregunta lo dice («La carga suponía 4 h 18: 2 h × factor 2,15»). Sin
  columna nueva.
- **«No lo hice yo» pregunta quién la hizo** y le pasa la pregunta a esa persona (clave `<clave>:<correo>`, tres días
  para contestar): el tiempo lo dice quien lo sabe.
- **La decisión de contratar queda escrita** (`DecisionFinanzas`, clave `contratacion-AAAA-MM`, una por mes): dirección
  confirma o descarta la propuesta de Nexus, con su motivo (obligatorio para descartar). Sin tabla nueva.
- ~~**La foto del mes NO se construyó todavía.**~~ **Se construyó el 2026-10-17**: ver «La foto del margen de cada
  mes». Los meses cerrados con foto salen de ella; los que no la tienen se calculan en vivo y lo dicen.
- **Sin «Lectura del agente»** arriba de cada pantalla: pide un agente con su corrida y su costo (fase 5).

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
  lectura más, unos US$0,20–0,35 con la guía. ⚠ Desde la etapa A de la memoria de la cuenta, mira solo las reuniones
  que son sesiones (las unidas o, en un prospecto, las que entran solas).
- **Una reunión de HubSpot que el agente leyó aparece en Exploración**, aunque no haya estado en la agenda
  (`reunionesLeidasDeHubspot`, desde su lectura, que ahora guarda la fecha y el título). La del 28 sep de
  CreditForce, la primera de verdad, solo existe en HubSpot (Meet no tiene su transcripción) y no se veía: la
  «Sesión 1» era la llamada de 6 minutos. Si la misma reunión también está en Meet con su transcripción, cuenta
  una vez, y lo respondido se junta de las dos (`juntarCobertura`). ⚠ Desde la etapa A de la memoria de la cuenta,
  en un cliente o un proyecto una reunión leída que no está en una sesión aparece en «Fuera de la exploración» y se
  vuelve sesión con un clic.
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
  circularidad de `etapa-hubspot.ts`). ⚠ Desde la etapa 6 de la memoria de la cuenta corre solo cuando la lectura de
  la reunión deja una señal de etapa, sobre esa señal y su cita, para cada proyecto vinculado: ya no vuelve a leer
  la reunión (ver «Hechos, enrutador y novedades»).
- **La sugerencia se guarda en las columnas de 2026-08-16, sin SQL nuevo.** La cita y la reunión van como JSON con
  versión dentro de `etapaPropuestaMotivo` (TEXT): una columna nueva era DDL coordinado entre las dos PCs por dos datos
  que solo lee la encuesta. Un texto plano se sigue leyendo como motivo.
- **Una sugerencia se apaga sola si alguien ya movió la tarjeta** a esa etapa o más allá (`sugerenciaVigente`, al
  leer, sin escribir), y una nueva reemplaza a la que hay solo si va MÁS LEJOS. Responder la encuesta (mover a la
  sugerida, a otra, o «Sigue en …») la borra: `cerrarSugerenciaDeEtapa`, fuera de la ruta, porque `estado-hubspot` tiene
  prohibido escribir en `Project` (`lib/projects/estado-a-hubspot.test.ts`). ⚠ Desde la etapa 1 de la memoria de
  la cuenta (2026-10-09), la pregunta también vence: a los 30 días deja de pedirse en «Para ti» y la tarjeta de la
  reunión la muestra con «Venció sin revisar»; responderla después sigue valiendo. Quién la respondió no se guarda
  todavía (`cerrarSugerenciaDeEtapa` la borra sin rastro), y «Uso de Nexus» lo dice así.
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
- **SUPERSEDED 2026-10-09 (memoria de la cuenta, etapa A):** una reunión con solo notas de Gemini también se puede
  agregar y se lee (queda marcada en `propuesta.leidas.soloNotas` y se vuelve a leer cuando llega la transcripción).
  Se agrega como sesión, con «+ Agregar sesión», no a una lista aparte: `contenido.reunionesElegidas` queda
  DEPRECATED (en un prospecto cuenta como unida a una sesión; en un cliente va a «Fuera de la exploración»). Ver «La
  exploración son sus sesiones».
  **La preventa suma cualquier reunión de Meet** («Buscar una reunión de Meet», de la empresa o de tu calendario).
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
  guardadas en producción (medido): nada que migrar. ⚠ **Corregido el 2026-10-09** (memoria de la cuenta, etapas
  0 y A): las reuniones y las fuentes ya no «se ven en todas». Se ven solo donde un agente las lee (Preparación y
  Exploración; en la Exploración, dentro de su página de inicio y sin lista de reuniones); Casos de uso muestra solo
  sus instrucciones; Resumen, La escala y Propuesta no tienen el bloque. Las instrucciones siguen siendo de cada pieza.
- **SUPERSEDED 2026-10-09 (memoria de la cuenta, etapas A y 7):** la exploración sale de los destinos sugeridos (etapa
  A): lee solo la reunión de cada sesión y no lee `explorationOverride`, que queda DEPRECATED sin DROP. Los otros seis
  documentos (kickoff, diagnóstico, planificación, ejecución, integraciones y entrega) pasan a leer la memoria del
  proyecto más SOLO las reuniones elegidas (etapa 7); lo que hacía el modo sugerido lo hacen sugerencias calculadas, que
  nunca escriben `true` solas. «Arrancan SUGERIDOS» deja de valer. Ver «La exploración son sus sesiones» y «Los
  documentos leen la memoria y solo las reuniones elegidas».
  **En los proyectos, cada documento con IA tiene su «Contexto adicional» completo** (Elías eligió «sí,
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
  cualquier reunión del proyecto, también las internas. ⚠ Desde la etapa A de la memoria de la cuenta, la exploración
  no tiene bloque de reuniones: lee solo la reunión de cada una de sus sesiones (ver «La exploración son sus
  sesiones»).
- **Una sola lista de reuniones para todo «Contexto adicional»** (2026-10-09, diseño «Contexto adicional ·
  Reuniones»): la propuesta, el handoff, el cronograma, los documentos del proyecto y la preventa usan la misma
  (`components/contexto/ListaDeReuniones`): casillas con «Elegir todas», «Quitar las N», X por fila y «Deshacer»
  (Ctrl+Z) paso a paso; el estado va como punto y texto (`lib/contexto/lista-de-reuniones.ts`). Antes cada
  pantalla tenía su versión y ya decían cosas distintas sobre lo mismo. Las puertas de los proyectos aceptan
  varias reuniones en UNA transacción: si una no pasa, no se escribe ninguna y el error dice cuál. *Las excluidas
  quedan plegadas* («Excluidas (N)», cerrado): lo que lee el agente es la lista de arriba, y a la vista
  competían con ella; se abren para devolver una con «Volver a incluir». ⚠ Desde la etapa 7 de la memoria de la
  cuenta, en los documentos del proyecto no hay excluidas ni «deshacer vuelve a sugerida»: se comportan como el
  cronograma, y las sugerencias van arriba, aparte (ver «Los documentos leen la memoria y solo las reuniones elegidas»).

## La exploración del proyecto es la de la preventa, y los adjuntos son de la empresa (2026-10-07)

**Contexto.** Elías: «copia todo el módulo de exploración de las preventas y aplícalo a los proyectos… la
única diferencia deberían ser las preguntas: Customer Success debería hacer más preguntas sobre la escala y
sobre estrategia: los retos que el cliente tiene, los resultados que persigue y los obstáculos que los
impiden». Además, un solo botón en todo «Contexto adicional», y que los archivos que se suben ahí (preventa
o proyecto) queden en Información del cliente › Documentos, a nivel de empresa.

- **La exploración de un proyecto es una fila de `ExploracionDeVenta`** con `projectId` y `marco = "cs"`:
  el mismo lienzo, las mismas sesiones (Preparación, En vivo, Análisis), la misma guía y el mismo agente.
  Copiar los componentes habría hecho divergir el formato a la primera mejora. Lo que cambia por marco vive
  en un solo lugar (`lib/exploraciones/marco.ts`): las tarjetas, sus nombres, sus preguntas de base, cuántas
  dimensiones pregunta una sesión y si hay objeciones. SQL aditivo: `2026-10-07-exploracion-del-proyecto.sql`.
- **Customer Success explora la estrategia y la escala.** Tres tarjetas —Retos, Resultados que persigue
  (la casilla `metas`, en cifras) y Obstáculos (casilla nueva `obstaculos`)— y hasta 5 dimensiones sin
  evidencia por sesión (la venta, 4). Sin objeciones, sin presupuesto ni quién firma: el cliente ya compró.
- **El agente del proyecto lee lo del proyecto, no HubSpot**: el handoff (V0) y los cuestionarios (Q0)
  cuentan como lo que dijo el cliente; el kickoff (K0), la ficha (F0) y lo que estimó la preventa (P0), no.
  Las reuniones salen por el chokepoint (las del proyecto que alimentan su exploración y las elegidas a
  mano). Solo lee sesiones y arma la guía: no se prepara ni propone casos de uso. No lee solo las reuniones
  nuevas (la lectura automática es de la preventa). ⚠ **SUPERSEDED en lo de las reuniones, 2026-10-09** (memoria
  de la cuenta, etapa A): lee solo la reunión de cada sesión, siempre por el chokepoint, y lee sola la que se unió
  a una sesión de forma explícita (elegida o por su evento del calendario) cuando llega su transcripción. Ver «La
  exploración son sus sesiones».
- **Una exploración de proyecto no es una preventa.** Toda lectura de Ventas filtra `DE_LA_PREVENTA`
  (`projectId: null`): el listado, «Para ti», el acceso a un prospecto, la propuesta, el handoff, las
  métricas y los scripts. El índice «una viva por empresa» pasó a valer solo para la preventa y se sumó
  «una viva por proyecto». Lo vigila `lib/exploraciones/marco.test.ts`. La página de la preventa redirige
  una exploración de proyecto a su ficha.
- **Una sola guarda para las rutas** (`lib/exploraciones/guardia.ts`): una preventa pide `preventa`; la de
  un proyecto, el acceso al proyecto para leer y la celda de generar la exploración para cambiar algo.
- **SUPERSEDED 2026-10-09 (memoria de la cuenta, etapa A):** la exploración abre en su página de inicio, con sus
  sesiones, las fuentes manuales y las instrucciones adentro, sin lista de reuniones y sin el «Contexto adicional» de
  la preventa arriba. Ver «La exploración son sus sesiones».
  **En la ficha**: las sesiones cuelgan de la fila «Exploración» del riel (con «Informe anterior»; los
  cuestionarios colgaban también de ahí hasta el 2026-10-11, cuando pasaron a ser un artefacto propio: ver
  «Cuestionarios es un artefacto propio, entre Kickoff y Exploración»), el panel de la derecha es el de la preventa con la estrategia, y arriba va el «Contexto
  adicional» de la preventa. Lo que se confirma de la estrategia va como sugerencia a Información del
  cliente. Diagnóstico y Planificación leen lo confirmado (sin la libreta del CSE).
- **La guía vieja** (`GuiaDeExploracion`) se migra con `scripts/migrar-guia-de-exploracion.ts` (en seco
  por defecto); su interfaz se borró. Sus datos quedan. ⚠ Su uso como respaldo de la exploración en el contexto
  de los documentos se retira recién después de que se corra esa migración (etapa 0 de la memoria de la cuenta).
- **Un solo enlace y un solo formulario en todo «Contexto adicional»** (`EnlaceDeContexto`, `SumarFuente`):
  «+ Buscar una reunión de Meet» y «+ Sumar una sesión o un documento» (pegar el texto o subir un archivo),
  en el cronograma, los documentos del proyecto, el handoff, la propuesta y la preventa. La columna se
  llama «Reuniones» en todos.
- **Los archivos del contexto son de la empresa.** Un archivo subido en cualquier «Contexto adicional»
  queda como `ClientDocument` con su `origen` (la preventa ya no lo borra) y su texto, como fuente de esa
  pieza. Documentos lista la empresa entera y dice de dónde vino cada archivo. Un documento con origen no
  entra al contexto general de los agentes (`/analyze`): ya entra por su pieza, y una minuta de la preventa
  puede traer precios.
- **En el Resumen se llama «Contexto del handoff» y vive dentro de la tarjeta del handoff** (excepción a
  «el mismo nombre en todas las piezas» del 2026-10-06). En las otras piezas «Contexto adicional» funciona
  porque el bloque está arriba del único documento que lo lee; el Resumen junta el resumen del proyecto, la
  etapa y el handoff, y solo el agente del handoff lee ese bloque. A todo el ancho, debajo de las dos
  columnas, se leía como contexto del Resumen (Elías: «es importante que se llame contexto del handoff y que
  realmente esté en la parte del handoff»). Sus columnas se acomodan al ancho de la tarjeta.

## Seis mejoras en clientes: fecha del diagnóstico, guía, desafío, fuera de alcance, entrega y adopción (2026-10-07)

**Contexto.** Elías pidió seis mejoras en la parte de clientes. Tres preguntas que se contestaron antes de
construir: el recordatorio de adopción le ABRE Éxito del cliente al CSE de la cuenta; el «resumen del servicio»
es el resumen del proyecto (ProjectBrief); y lo vendido va como un bloque propio en la guía.

- **SUPERSEDED 2026-10-14** (ver «Cuándo se presenta cada documento»): la pregunta es de los cuatro documentos, la
  responde solo Customer Success y no se abre como modal.
  **El diagnóstico pregunta cuándo se presenta** (`lib/canvas/presentacion-del-diagnostico.ts`, columna
  `Project.diagnosticoPresentacion`, SQL `2026-10-07-presentacion-del-diagnostico.sql`). Con el diagnóstico
  generado y en borrador, la encuesta se abre sola una vez por sesión del navegador; «Todavía no sé» también es
  una respuesta. Como las fechas del cronograma: si una reunión lo dice, Nexus lo propone con la frase tal cual
  (verificada contra la transcripción), y la persona la usa o la descarta. Dos días antes, la persona confirma
  que está terminado y reconfirma la fecha (o la cambia): ahí le llega un aviso de «Para ti» al vendedor dueño de
  la empresa en HubSpot, con el enlace al diagnóstico. Solo un aviso. Cambiarla pide lo mismo que presentarlo.
  El aviso no se repite para la misma fecha. «Listo» vale para SU fecha: si la fecha se mueve, se vuelve a pedir.
- **Lo vendido es un tercer bloque de la guía de exploración de un proyecto**, al lado de la estrategia y la
  escala (`GuiaDeLaSesion.loVendido`): entre 3 y 5 preguntas, una por pieza del alcance, sobre cómo el cliente
  la va a usar en su negocio. El agente lee el handoff, las etiquetas del proyecto con su lente y los resultados
  medibles del handoff. El id de cada pregunta sale del tema, así su casilla y su nota sobreviven a rearmar la
  guía. Solo en el marco de Customer Success: la preventa no tiene nada vendido todavía.
- **El desafío principal del diagnóstico describe lo que le pasa hoy al cliente y lo que le cuesta, sin la
  solución adentro** (el brief de `desafio`). «No puede automatizar porque no tiene segmentación» ya trae la
  respuesta; «le habla igual a todos sus contactos» describe el hecho.
- **Las solicitudes fuera de alcance se retomaron y se terminaron** (`lib/sessions/solicitudes-fuera-de-alcance.ts`,
  SQL `2026-10-07-solicitudes-fuera-de-alcance.sql`). El agente las PROPONE al leer cada reunión; el CSE las
  confirma o las descarta. Al confirmar, aviso al vendedor dueño de la empresa en HubSpot y a quien lleva el
  frente de Customer Success. Viven en la cuenta («Fuera de alcance», en el riel), con su seguimiento (cotizada,
  aprobada, no la tomó) y su historial: nadie las lleva en un Excel. El resumen del proyecto las nombra.
  Corrige lo diseñado («decide el CSL»): lo decide el CSE, que estuvo en la reunión.
  ⚠ **Enmendado el 2026-10-09** (memoria de la cuenta, etapa 2): un pedido fuera de alcance solo nace en una reunión
  de un CLIENTE que tiene proyecto principal, comparado contra lo que se vendió en ese proyecto y con su
  `projectId`. Sin proyecto no se le pide al modelo, y en un prospecto tampoco: no hay nada vendido contra qué
  comparar. Se sigue en La cuenta porque es una oportunidad de la empresa. Los 10 que había sin proyecto (3 de ellos
  en prospectos) los ubica o los descarta una persona, con `scripts/revisar-pedidos-fuera-de-alcance.ts` en seco primero.
- **La entrega muestra el desafío que se resolvió y los objetivos alcanzados**, tomados del diagnóstico
  (`desafio_resuelto` y `logros` con `lib/delivery/objetivos.ts`). La lista y los títulos de los objetivos los
  pone el diagnóstico; la IA propone el estado de cada uno (alcanzado, en camino, por medir) y la persona lo
  acepta. «Alcanzado» sin evidencia baja a «por medir»: la entrega no maquilla.
- **Recordatorio de revisar la adopción** (`lib/cs/recordatorios-de-adopcion.ts`, job
  `adopcion-recordatorios-daily`): a los 30 días del inicio, en la semana antes de la entrega y en la primera
  semana de cada mes en las cuentas recurrentes (tag `recurrente` o la etapa Continuidad). Un aviso de «Para ti»
  al CSE del proyecto y a quien lleva el frente de Customer Success, que lleva a la pestaña Adopción. Cada
  momento tiene una ventana de 7 días: no es retroactivo. Sin IA.
- **El CSE de la cuenta entra a Éxito del cliente, solo a Adopción** (`lib/cs/adopcion-del-cse.ts`). Excepción
  a «Éxito del cliente es de la CSL y dirección» (2026-10-04), decidida por Elías. Sin el panel, sin las otras
  pestañas y sin montos: la cuenta se vacía en el servidor antes de llegar a la pantalla. ⚠ Lo que sí ve es el
  uso de HubSpot Partner (uso, licencias, activación), que el código marcaba como confidencial por los términos
  de partner (solo CSL y dirección). Si eso no se puede abrir, la salida es quitar la excepción en
  `app/(shell)/customer-success/[clientId]/page.tsx`; los recordatorios siguen llegando.

## El correo de seguimiento después de una reunión de exploración (2026-10-07)

**Contexto.** Elías: el grabador conectado a HubSpot solo deja un resumen de la reunión. Pidió que Nexus arme
el correo que se le manda al cliente después: qué entendimos, qué preguntas quedaron abiertas, si quiere una
sesión extra para profundizar, y la minuta. Vale para la preventa y para la exploración de un proyecto.

- **Va en «Análisis» de cada sesión, después de «Quedó abierto»** (`components/exploraciones/CorreoDeSeguimiento.tsx`).
  Se arma a pedido, con un botón: nunca solo. Lo revisa, lo cambia y lo manda una persona desde su correo
  («Copiar el correo» o «Abrir en tu correo»). **Nexus no envía nada.** Lo cambiado se guarda solo.
- **El agente escribe las partes y el código arma el correo** (`componerElCorreo`): saludo, lo que entendimos,
  lo que acordamos, los próximos pasos (con quién y para cuándo), las preguntas abiertas, la próxima reunión y
  la firma de quien lo pidió. Así tiene siempre la misma forma.
- **Al agente solo le llega lo que el cliente puede leer** (`insumosDelCorreo`, lo vigila
  `lib/exploraciones/correo-de-seguimiento.test.ts`): lo que se leyó de la reunión, lo que respondió el cliente
  (de la lectura y de lo anotado en «En vivo») y lo de «Quedó abierto». Sin el presupuesto, quién decide, las
  objeciones, las hipótesis, los niveles de la escala, las notas libres ni las instrucciones adicionales. La
  reunión entera sí va (de ahí salen la minuta y lo que entendimos), y por eso el prompt prohíbe precios y lo
  que el equipo habló sin el cliente, y la pantalla avisa en ámbar si el texto menciona un monto, deja un
  espacio por completar o tiene voseo. La ruta está en el censo de lectores con su propia puerta
  (`correo-al-cliente`).
- **Sin la conversación no hay correo** (pedido de Elías al verlo en CreditForce, 2026-10-08): con una reunión que
  solo trae la invitación, el agente escribió «No contamos con notas de lo que CreditForce compartió…» como algo
  que entendimos, en un correo para el cliente. Ahora el agente lo marca (`sinConversacion`), el correo no se
  arma, el que hubiera se borra y la pantalla dice por qué y que se puede sumar la grabación o la minuta en
  «Contexto adicional».
- **Las preguntas abiertas salen solo de «Quedó abierto»**: lo planeado que no se preguntó, lo que el agente vio
  que se dijo sin explorar en esa reunión y lo que se marcó para llevar a la próxima sesión. Hasta cuatro, las
  que se pueden contestar por correo. Sin nada abierto, el correo no lleva preguntas aunque el agente escriba
  alguna.
- **La próxima reunión la pone el código, no el agente**: la próxima sesión planeada con fecha o, si no hay, la
  agenda de HubSpot. Si no hay ninguna y en la reunión se acordó una, se confirma esa; si tampoco, ofrece una
  sesión extra para profundizar y pide dos o tres horarios. Nunca inventa una fecha.
- **Se guarda en `propuesta.correos`, por reunión** (la misma clave de las lecturas, los últimos 24), sin SQL.
  Cambiarlo a mano es la operación `correo`: no sube la versión (es de lo que escribe el agente) y no se
  reintenta sobre un correo que se volvió a armar. «Regenerar» (arriba a la derecha, el botón azul de las
  tarjetas) lo vuelve a escribir con lo que hay hoy; si se cambió a mano, pide confirmación.
- **Una corrida propia en el medidor** (`exploracion-correo-de-seguimiento`), aparte de la del agente de la
  exploración, que la pantalla sigue. Medido con dos reuniones reales (Grupo Monge y Discover Puerto Rico):
  unos 16.000 tokens de entrada y 1.000 de salida, ~US$0,06 por correo. Si sale en voseo se pide una vez más.
- **El voseo en prosa se mide distinto que en el código** (`voseoEnProsa`, lib/ui/voseo-formas.ts): la regla por
  forma también caza «hoteles», «Alajuela» o «wireframe», y en el correo eso era un aviso falso y una segunda
  llamada en cada corrida. Cuenta «vos», el presente en -ás, -és o -ís en minúscula (sin el futuro) y una lista
  de imperativos de correo («contame», «avisame», «fijate»).
- **Lo que suma desde la etapa 3 de la memoria de la cuenta** (2026-10-09): la minuta de esa reunión (acuerdos y
  decisiones, sin riesgos, y solo si la reunión fue con el cliente), los compromisos de esa reunión sin su cita, y la
  ficha recortada (`memoriaDeLaCuenta` con el alcance «cliente»), rotulada «para no repreguntar; no lo cites como
  algo acordado en esta reunión». El correo NUNCA lee Tareas: lo ve el cliente. Los compromisos salen de la lectura
  de esa reunión, no de las tareas que nacieron de ella. El censo de `insumosDelCorreo` se amplía a propósito, con
  los centinelas de la ficha interna, la postura de las personas y la preventa. *Por qué:* el correo volvía a sacar
  «lo que acordamos» de la transcripción cuando la minuta ya lo tenía, y repreguntaba lo que la cuenta ya sabía.

## Las reuniones grabadas con HubSpot entran solas a la preventa (2026-10-07)

**Contexto.** En CreditForce, la primera reunión (28 sep) tiene dos copias: la de Meet, sin transcripción
(Gemini no tomó notas), y la de HubSpot, que el agente leía pero no aparecía en «Contexto adicional» ni como
sesión. Elías: «debería ser como reunión de forma automática», como el handoff y la propuesta, que ya muestran
lo de HubSpot. ⚠ Al leerla, el agente dijo que solo traía la invitación: era lo único que devolvía la API con
que Nexus lee HubSpot. La grabación de 49 minutos estaba en HubSpot (ver «La grabación de una reunión de HubSpot»,
abajo).

- **Una reunión de HubSpot que ya se hizo y dejó qué leer es una reunión de la preventa**, aunque nunca haya
  estado agendada (`reunionesHechasDeHubspot`, lib/exploraciones/lectura.ts): la foto de HubSpot las guarda con
  la agenda, desde un mes antes del alta y como mucho las 12 más recientes de cada mirada. Antes guardaba solo
  las agendadas, y una reunión que ya había pasado la primera vez que se miró HubSpot no aparecía nunca. Las que
  HubSpot dice que no ocurrieron no cuentan; la que también está en Meet CON transcripción cuenta una vez, la de
  Meet. ⚠ Desde la etapa A de la memoria de la cuenta (2026-10-09) eso vale para un prospecto (entra sola como
  sesión, salvo que esté en «Fuera de la exploración»); en la preventa de un cliente, una reunión de HubSpot es de
  la exploración solo si alguien la agrega como sesión.
- **El lienzo las mira al abrirse** (`mirarReunionesDeHubspot`, lib/exploraciones/reuniones-de-hubspot.ts): las
  de HubSpot no avisan cuando llegan, las de Meet sí. Como mucho una vez cada media hora por preventa (~15
  pedidos a HubSpot cada vez), y cada corrida del agente cuenta como mirada. Solo la preventa: la exploración de
  un proyecto no lee HubSpot. Solo lee HubSpot.
- **El agente lee solo las nuevas, con las reglas de una de Meet**: mientras se vende, de después del alta y de
  hace a lo sumo dos semanas, sin persona detrás (cobra contra el presupuesto automático).
- **«Volver a leer» también para una de HubSpot** que el agente leyó antes de resumir cada reunión: arma su
  resumen, lo mismo que hace el script de la puesta al día con todas.
- **En el buscador**, la copia de Meet sin transcripción de una reunión que está en HubSpot dice «Ya está, desde
  HubSpot» en vez de «No se puede leer».
- **La grabación de una reunión de HubSpot se lee aparte** (2026-10-08, `lib/hubspot/grabaciones-de-reuniones.ts`).
  Desde el 31 de agosto de 2026, HubSpot guarda la grabación en la propia reunión: el resumen de IA en
  `hs_meeting_summary` y el número de la transcripción en `hs_meeting_transcription_id`. La API v1 de engagements,
  la que usa Nexus, no trae ninguno de los dos: de la reunión del 28 sep de CreditForce llegaba la invitación. Medido
  ese día contra HubSpot, solo leyendo:
  - **El resumen sí** se lee con los permisos de siempre (la API v3 de reuniones): 1.784 letras de esa reunión.
    Entra a la preventa (preparar, leer, la mirada al abrir), al correo de seguimiento y al registro de HubSpot del
    handoff y de la propuesta. Las señales diarias de Éxito del cliente y el chequeo del handoff no lo piden: solo
    miran si hay actividad.
  - **La transcripción completa** pide el permiso `crm.extensions_calling_transcripts.read`, que la app no tiene
    (HubSpot respondió 403). El código ya la pide: al leer, las 3 reuniones grabadas más recientes; en el correo,
    la de esa reunión. Sin el permiso sigue con el resumen, y lo negado no se vuelve a pedir por una hora.
  - **«Volver a leer» lee entera la reunión** (propone y reemplaza lo que el agente dijo de ella), también cuando ya
    tiene lectura: la que decía «no hubo conversación» se corrige así. Antes solo la resumía y, como la lectura que
    ya estaba ganaba, no cambiaba nada.
- **Una reunión cuenta en la preventa desde un mes antes del alta; las de antes, solo en un prospecto y con alguien
  de Ventas** (2026-10-08, `CorteDeLaPreventa` y `cuentaEnLaPreventa` en lib/exploraciones/lectura.ts; vale para
  Meet y para HubSpot). «Leer» tomaba toda la actividad de HubSpot sin leer, de cualquier fecha, y cada reunión
  leída pasaba a ser una sesión: en Cicadex y Grupo Servica, que ya eran clientes, aparecieron 16 y 22 sesiones de
  agosto de 2023 a agosto de 2026, capacitaciones y kickoffs de proyectos anteriores. En un prospecto, en cambio,
  lo de antes es la historia de la venta (Polaris empezó con HubSpot en julio y se abrió en octubre), y Elías lo
  quiso así: «siempre y cuando sean sesiones donde haya participado alguien de ventas». Ventas es lo mismo que en
  el handoff (`salesPresenceEmails`: área Ventas más la preventa técnica). Quién estuvo se lee de HubSpot: el dueño
  de la reunión y sus asistentes que son usuarios (`hs_attendee_owner_ids`), pasados a correo con la lista de
  usuarios (activos y archivados, guardada una hora). Lo demás de antes del corte lo sigue mirando «Preparar»,
  como contexto y sin marcarlo. Lo que ya se leyó no se borra: deja de listarse como sesión.
- **SUPERSEDED 2026-10-09 (memoria de la cuenta, etapa A):** en la preventa de un cliente se lee sola SOLO la reunión
  unida a una de sus sesiones (elegida o por su evento del calendario; la ligada por fecha no cuenta), sin el filtro
  de Ventas: que la hayan unido a una sesión ya dice que es de la exploración. Ver «La exploración son sus sesiones».
  **El agente también lee solo en la preventa de una empresa que ya es cliente** (Elías, 2026-10-08: «Sí»; antes,
  solo en un prospecto). Mismos frenos (seis meses, sin proyecto nuevo de esa venta, reunión de después del alta y
  de hace a lo sumo dos semanas) y uno más: la reunión tiene que haber tenido a alguien de Ventas. Sin eso, cada
  reunión de un proyecto en curso de ese cliente dispararía una corrida. La reunión de un cliente sin nadie de
  Ventas (la lleva un CSE) se lee con el botón.
- **Si HubSpot no dice quién estuvo, no hay Ventas.** Las de antes del corte no cuentan y la de un cliente no se
  lee sola: queda como antes de este cambio. No se pudo comprobar en vivo el 2026-10-08 (el token del sistema
  estaba vencido y no se renueva desde una PC): `scripts/auditar-analisis-de-preventas.ts --hubspot` aplica la
  misma regla y lo muestra.

## La escala vive como datos; el `.md` se genera (2026-10-08)

**Contexto.** Elías: la escala deja de ser un `.md`; vive en la base y el `.md` «se forma cada vez que se
descarga». Es el primer paso antes de la mejora grande (las 13 decisiones de la revisión de la 8.7). Plan y
etapas: docs/escala/plan-escala-como-datos.md.

- **Una fila por versión, con la estructura entera en JSON** (`EscalaVersion`, lib/escala/datos/tipos.ts), no
  una tabla por criterio. *Por qué:* una versión publicada se congela entera, y comparar dos versiones es
  comparar dos documentos; el detalle por criterio lo da la bitácora (`EscalaCambio`). Si las mediciones
  necesitan consultar criterios con SQL, el catálogo de cada versión se deriva al publicar.
- **La matriz y las ediciones son estructura; la prosa, bloques de texto en orden.** La prosa (Partes 1, 2 y 4)
  es la que sale de la escala cuando la teoría y el manual pasen a Documentación: modelarla ahora sería trabajo
  que se tira.
- **Ida y vuelta exacta, y la comprueba el importador**: `importarEscala` genera el `.md` desde lo que leyó y
  frena con la línea si no da el mismo texto. Por eso el importador es ESTRICTO (un párrafo por línea, una línea
  en blanco entre bloques), al revés del lector, que tolera.
- **Las pantallas no cambian**: `escalaDeLosDatos` es `parsearEscala(generarMarkdown(datos))`, con el lector de
  siempre. `EscalaDocumento` sigue guardando el `.md` de cada publicada (ahora generado): es lo que leen y lo que
  se descarga.
- **Un solo borrador a la vez** (índice único parcial en la base). Cada cambio sube su `revision` —un cambio
  ajeno no se pisa: frena— y queda en la bitácora con las anclas del feedback (`1.7.F1`, `1.7.F`, `1.7`, y
  `edicion:<clave>/…` o `texto:<parte> / <sección>`).
- **Se publica con `scripts/publicar-escala.ts`, con las mismas pruebas de siempre** (las de Nexus y
  `pruebas_escala.py`): toma la escala del borrador y lo congela en la misma transacción que inserta los
  documentos. Sin borrador, la del repo se importa y queda también como datos; si no se puede guardar como
  dato sin cambiar el texto, no se publica.
- **Pendiente, antes de un botón «Publicar» en Nexus:** llevar a TypeScript las pruebas 2 y 3 del cálculo y
  aflojar la prueba 7 (hoy cada versión de la escala exige versión nueva de la especificación y del manual).

## Cada sesión de la preventa tiene su título (2026-10-08)

**Contexto.** Elías: «que las sesiones se puedan titular, que tomen el nombre de la sesión de calendar y se les pueda
cambiar el nombre». Se llamaban «Sesión 1», «Sesión 2»: con siete u ocho, la barra no decía cuál era cuál.

- **El título es el de la reunión, que es el del evento del calendario** (en Meet o en HubSpot), hasta que alguien
  le pone otro (`tituloDeLaSesion`, lib/exploraciones/guia.ts). Se guarda en `SesionPlaneada.titulo`, el campo que
  ya existía para «de qué va», sin SQL.
- **Vacío o igual al del calendario no se guarda** (`tituloAGuardar`): la sesión sigue el nombre de su reunión si
  cambia. «Sumarla a mis sesiones» ya no copia el nombre: lo toma del calendario.
- **Se cambia con el lápiz junto al nombre**, en la cabecera de la sesión; Enter guarda y Esc deja el de antes. En
  una reunión que no estaba en tus sesiones, o en la próxima sin planear, cambiarle el nombre la vuelve sesión.
- **El número no se pierde**: en la barra va delante del título («2. Revisión del diagnóstico») y en la cabecera,
  arriba, chico. «Quedó abierto en la sesión N» sigue igual. Con el nombre cambiado, el análisis dice el del
  calendario.

## El borrador de la escala se publica desde Nexus (2026-10-08)

**Contexto.** Etapa «El borrador en Nexus» del plan de la escala como datos. Elías decidió que la
especificación y el manual sacan una versión nueva solo cuando cambian ellos.

- **`/escala/borrador`, solo super admin** (`puedeEditarLaEscala`): abrir el borrador, bajar y subir el `.md`,
  la bitácora y «Revisar y publicar». Al resto la página lo lleva a la escala publicada.
- **Nada se guarda sin ver antes qué cambia**: subir un `.md` muestra los cambios, criterio por criterio, y
  recién al confirmar los guarda con su nota. El cuerpo viaja comprimido (gzip): la escala pesa más de medio
  mega y nginx corta en 1 MB.
- **El botón corre las mismas pruebas que el script, sin Python.** Las 2 y 3 (el cálculo) se copiaron del
  Python a `validar.ts` (`nivelDelDiagnostico` es su `nivel()`); el script sigue corriendo el Python además.
  Frena también lo que una edición dice con sus palabras y quedó viejo, hasta que alguien marca que lo miró.
- **El botón publica solo la escala.** La prueba 7 ahora pide que la especificación y el manual digan DESDE
  qué versión valen (no posterior a la que se publica). Especificación 1.3.7; el manual no cambia.
- **La fecha de la bitácora se escribe a mano en hora de Costa Rica** (`fechaYHora`): con `toLocaleString`, el
  servidor y el navegador la escribían distinto («p. m.» con otro espacio) y React no hidrataba la pantalla.

## Las metas comerciales y quién vendió, como dato general de Nexus (2026-10-08)

> Para el modelo nuevo de comisiones (Finanzas › Comisiones), la comisión se mueve con la meta del año de cada
> persona. Elías: las metas ya están en HubSpot («OFICIAL | META 2026 - SMARTEAM»: Andrés US$335.000, Marco
> US$400.000) y «es importante que a nivel de arquitectura esto se guarde bien para que se pueda consumir desde todo
> Nexus».

- **Las metas se COPIAN de HubSpot, no se cargan a mano.** `MetaComercial` es un espejo de solo lectura de los
  «goal targets» (`/crm/v3/objects/goal_targets`, permiso `crm.objects.goals.read`, opcional en la app pública). Una
  meta trimestral son cuatro filas por persona; el total del año se suma al leer. Lo corren el job
  `ventas-ganadas-daily`, después de los negocios ganados, y desde el 2026-10-19 también el job `negocios-abiertos`
  (cada hora de 6:00 a 20:00) y el botón «Actualizar» de la cartera de Ventas en «Para ti»; si falla, no tumba nada.
  *Por qué:* la meta de Liz Navarro se creó en HubSpot el 19-oct a las 10:40 y la copia de ese día había corrido a las
  6:00, así que «Para ti» no la mostraba hasta el día siguiente.
- **Solo cuenta la meta de ventas** (`hs_goal_type = sales_quota`). Medido el 2026-10-08: en el portal conviven
  «2026 ONFIRE | LLAMADAS PROSPECCIÓN» (llamadas, 51 tramos semanales de Andrés), «Diagnóstico | Leads» y las del
  Partner Mutual Action Plan. Sumadas, la meta de Andrés daba US$335.505 en vez de 335.000. Se copian todas (son
  dato), pero `metasPorPersona` suma solo las de ventas. Con eso da exacto lo que muestra HubSpot: Andrés
  US$184.370 de 335.000 (55 %), Marco US$301.535,67 de 400.000 (75 %).
- **El avance oficial es el de HubSpot** (`hs_kpi_value`): es el número que el equipo ya ve en HubSpot. Nexus no lo
  recalcula. Lo vendido según los negocios ganados de Nexus va al lado, como control, y no se mezclan.
- **Quién vendió vive en `VentaGanada.vendedorId`**, resuelto por el correo del dueño del trato en HubSpot (también
  de quien ya se fue). El dueño crudo (`hubspotOwnerId`) se guarda aunque no sea nadie de Nexus. Un cambio de dueño
  actualiza la fila pero no va a la bitácora de la venta: la bitácora es de cuánto vale, no de quién es.
- **Una sola puerta de lectura**: `lib/ventas/metas.ts` (`metasPorPersona`). Comisiones, «Para ti», la ficha de una
  persona o un reporte importan de ahí; nadie lee `MetaComercial` por su cuenta.
- **Nunca se borra**: una meta que HubSpot deja de devolver queda `vigente=false`, y solo si la lectura terminó
  entera. Sin el permiso, la copia no toca nada.
- **«Tu meta» se pinta solo si la persona tiene una meta de ventas asociada a su usuario en HubSpot** (Elías,
  2026-10-19): en el inicio de «Para ti» y en la cartera de Ventas. Sin meta no hay tarjeta, tampoco una que diga «No
  tienes una meta de ventas en HubSpot».
- ⚠ **El permiso entra por el código, no por entorno**, porque Elías ya lo declaró «Opcional» en la app pública. La
  primera vez hay que **reconectar HubSpot** desde Integraciones después del deploy; hasta entonces la copia dice
  «sin permiso».

## El editor de la escala: se edita sobre la escala misma (2026-10-08)

**Contexto.** Etapa «El editor» del plan de la escala como datos: cambiar el borrador sin bajar ni subir el `.md`.

- **Las mismas vistas, otro verbo.** `/escala/borrador/[área]` usa `VistaDeLaEscala` con `editor`: tocar un
  criterio, un nivel o una dimensión abre el panel de edición en vez del de Feedback (el contexto dice «Editar» donde
  decía «Dar feedback sobre»). No hay una segunda pantalla de la escala que mantener.
- **Se edita la escala general.** Lo que dice una edición y retirar un criterio siguen con el `.md`: retirar pide
  anotar el identificador en la especificación, y una edición tiene sus reglas de cobertura (prueba 8).
- **La misma garantía que el importador** (`aplicarCambioDelEditor`): los datos nuevos generan un `.md` que se vuelve a
  leer igual y que el lector entiende; un texto que cambiaría cómo se lee la escala no entra. Se compara por
  contenido y no por el texto del JSON: Postgres (JSONB) devuelve las claves en otro orden.
- **Un criterio nuevo toma el número que sigue** de su nivel, sin repetir uno en uso ni uno retirado (la lista de la
  especificación publicada).
- **El feedback de esa parte se ve al editarla** y el cambio se vincula al reporte (`EscalaCambio.feedbackId`). La
  bandeja de Feedback no se tocó: ese módulo lo estaba cambiando otra sesión.

## Tareas internas: lo que se acuerda en las reuniones, en tu semana y en tu agenda (2026-10-09, 1A.1)

**Contexto.** Smarteam llevaba las tareas de sus equipos en TaskView y en Excel, y lo que se acordaba en el planning
del lunes y la retro del viernes había que pasarlo a mano. Elías pidió un módulo en Nexus: que lea las reuniones de
cada equipo, proponga las tareas (nunca las cree solo), deje anotar a mano y pedirle algo a otra persona o equipo, y
lleve cada tarea a Google Calendar. Piloto con Marketing (líder: Alejandra Ortega; Lidia Flores), retroactivo desde el
«Sprint planning de marketing» del lunes 5 de octubre. El plan completo, con las preguntas y sus respuestas, está en
`docs/tareas-plan.md`.

- **La IA propone y la persona decide: nada entra solo.** Cada línea de «Próximos pasos» de las notas de Gemini es una
  PROPUESTA para su dueño (Usar · Más adelante · Descartar · «¿Es T-12?»). El dueño sale SOLO del corchete
  («[Lidia Flores] …»): un nombre en el detalle es una mención, y solo cuenta como pedido con una lista cerrada de
  verbos («pedirle a…», «que X haga…»); «consultar con» o «coordinar con» nunca. Lo que no tiene dueño claro va a
  «Por asignar» del equipo de la reunión, sin semana.
- **La IA es la excepción, no el camino.** La lectura arma todo con código; llama a Haiku (una sola vez, con
  herramienta forzada, temperatura 0 y un tope de tokens por línea) solo si hace falta: un dueño dudoso, una tarea
  parecida con la que podría duplicar, una retro, tres o más líneas que forman un proyecto, o una línea con más de un
  cliente posible. Medido en local: 6 líneas, 2.087 tokens de entrada y 373 de salida (~US$0,004).
- **Cada reunión se lee UNA vez**, y su gemela (la misma reunión dos veces en el calendario, una con notas) se lee
  por la que tiene notas. Una reunión con más de 7 días no avisa a nadie, salvo «Avisar igual» (lo usa el piloto
  retroactivo). Las reuniones salen SOLO del chokepoint (`lib/sessions/reuniones-para-tareas.ts`): `lib/tareas` no
  lee `FirefliesSession` (lo vigila `lib/tareas/guardas.test.ts`). ⚠ **Enmendado el 2026-10-09** (memoria de la
  cuenta, etapa 2): la fase 3 del plan de Tareas se adelanta y ahora incluye los compromisos del cliente. La lectura
  de cada reunión con un cliente o un prospecto (el post-proceso) usa la MISMA fila `LecturaDeReunion`, con un estado
  propio (`seguimiento*`), y deja propuestas de `Tarea`: lo que se comprometió Smarteam, para quien lo dijo; lo que
  prometió el cliente, como tarea de seguimiento para el CSE. Ver «La lectura de cada reunión es durable…».
- **Una tarea vive en el sprint de casa de su responsable**, y la clave del sprint es la del área (`equipo` en
  `lib/tareas/equipos.ts`); quien no tiene un área conocida tiene su sprint personal. Un pedido a otro equipo lleva
  `pedidaPorEquipo` y su líder lo ve en «Lo pedido a otros equipos».
- **El líder de un sprint es quien tiene `tareas.manage` por override en /team** y es de ese equipo (sección nueva del
  registro, `soloPorPersona`: no se da por rol). Es lo ÚNICO que decide el líder; el frente `LIDERAR_CS` de «Para ti»
  es otra cosa (las alertas de cartera). Un equipo puede no tener líder. Sugerir a otra persona es proponer; asignar
  directo solo puede el líder de su equipo.
  ⚠ **Enmendado el 2026-10-16** (fase 0.1 de docs/nexus-sistema-de-trabajo-plan.md): el líder sale de
  `TeamMember.lideraEquipos`, que se elige en Equipo («Lidera los sprints de»). Una persona puede liderar más de un
  sprint y uno que no es el de su área: Alex Vanegas (CSL) lidera Customer Success y Desarrollo. El override
  `tareas.manage` se retira (nadie lo tenía) y la celda queda oculta.
- **Un proyecto de tareas nunca es un `Project`.** Un `Project` es un servicio que se factura y vive en HubSpot; un
  proyecto de tareas («Campaña de SAP») agrupa trabajo interno, y PUEDE servir a un `Project` (su `projectId`). La
  «tarea grande» del primer diseño se reemplazó por el proyecto. Si tres o más líneas de una reunión comparten raíces,
  Nexus SUGIERE un proyecto (en azul); usarlo no reparte nada: cada persona decide su tarea.
- **Para quién es cada tarea (el «ámbito»):** cliente, prospecto, aliado, interno o «sin clasificar», con una sola
  regla (`ambitoDe`). Una empresa INTERNO o un proyecto marcado interno (SmartAgro) es «Interno». En una reunión
  interna, Nexus sugiere el cliente de cada línea (en azul) hasta que la persona lo confirma al decidir.
- **Las empresas que se pueden elegir salen de una sola función** (`clientesQueVesParaTareas`): el acceso de
  `requireAccessToClient` (con la preventa), de cualquier tipo, más las de Smarteam. Es una excepción declarada a
  «`kinds: all` es para una sola pantalla»: Marketing y Ventas trabajan con prospectos y aliados.
- **En tu sprint ves lo de tu equipo con su cliente; lo que se protege es lo que no es la fila.** La cita de la
  reunión se ve solo si estuviste en ella o la reunión es de un cliente que ves; si no, dice «Salió de una reunión
  con un cliente». Una tarea «Solo para mí» y lo de un espacio privado se ven en la semana del equipo como una fila
  opaca que solo dice cuánto pesa. INV42 vigila que ninguna tarea lleve la cita de una reunión de otro cliente.
  ⚠ **Enmendado el 2026-10-16** («Nexus, el sistema de trabajo de cada cuenta»): además de lo de tu equipo, ves todas
  las tareas de las cuentas a las que tienes acceso, de cualquier equipo, salvo las «Solo para mí». La cita sigue con
  esta misma regla.
- **Cada persona revisa su semana** («Revisa tu semana», supera el «Cerrar la semana» del líder): «La terminé» o
  «Sigue» por tarea, y lo que sigue nunca cae en una semana pasada ni en una que ya revisaste (`semanaDestino`). Una
  semana pasada se revisa cuando sea («Semanas sin revisar») y su «La terminé» fecha la tarea el viernes de ESA semana.
  Se puede corregir durante 7 días. Lo que dijo la retro viene en azul y no se marca solo.
- **Agendar: una tarea, su bloque**, en el Google Calendar de la dueña y con su clic. Nexus propone el horario (el
  primer hueco de 8:00 a 17:00, por prioridad, antes de que venza) y crea el bloque privado con un permiso APARTE
  (`calendar.events.owned`, `getAgendaWriteAuth`): sumarlo a los permisos de lectura rompería todas las lecturas si
  falta. Sin el permiso, el diálogo ofrece el enlace de plantilla y «Ya la agendé». La sincronización de Meet ignora
  esos bloques (`esBloqueDeTarea`). Solo la dueña escribe su calendario; un líder nunca.
- **Un solo SQL con el modelo entero** (`scripts/sql/2026-10-09-tareas.sql`, 13 tablas, supera «cada tabla en su
  fase»): las fases siguientes (tablero, chat, lectura automática, plantillas) no llevan DDL. CHECKs en la base para
  lo que no puede pasar (hecha ⇔ fecha de terminada, semana ⇒ responsable), RLS + RESTRICTIVE en las 13, e INV38–INV43
  para lo que cruza tablas.
- **Un solo escritor.** `lib/tareas/mutaciones.ts` escribe las tablas de tareas y `anotarResultado()` es el único que
  escribe `ResultadoDeSemana` (la foto de cada semana, con su cliente y su proyecto). Nada que llegue al cliente ni a
  los agentes que escriben documentos lee tareas (censo en `lib/tareas/guardas.test.ts`). Fusionar dos fichas mueve
  sus tareas (`SE_MUDAN`): con `onDelete: SetNull` perderían el cliente en silencio. ⚠ **Enmendado el 2026-10-09**
  (memoria de la cuenta, etapa 2; en el código desde el 2026-10-10): `LecturaDeReunion` tiene un segundo escritor
  declarado, la cola de la lectura de seguimiento (`lib/lecturas/cola.ts`), que escribe SOLO las columnas
  `seguimiento*` (una prueba de la guarda lo revisa campo por campo); la fila nueva la crea `lib/tareas/lectura.ts`
  (`crearFilaDelSeguimiento`), y las propuestas de `Tarea` las sigue escribiendo Tareas. Los agentes INTERNOS (el vigía,
  la memoria interna del proyecto, el avance y la lectura de seguimiento) leen una proyección de las tareas por UNA sola
  puerta, `lib/tareas/para-agentes.ts`: título, para cuándo, estado y lado (cliente o Smarteam), nunca la cita, el
  contexto, las notas ni lo privado. Nada que ve el cliente (documentos de cara al cliente, correo de seguimiento, vista
  externa) lee tareas. El censo de `lib/tareas/guardas.test.ts` ya nombra esa puerta. Ver «La lectura de cada reunión
  es durable…».
- **En el menú, durante el piloto:** dirección, Marketing y quien ya tenga algo en Tareas (`tareasPiloto`, un hecho de
  datos que calcula AppShell). Desde la fase 2, para todo el equipo.
- **«Nueva tarea», al pie del menú, junto a Feedback**, con el mismo gate del ítem: abre un diálogo con la MISMA
  línea de Mis tareas («¿Es T-12?», «Para…»), sin salir de la pantalla. Lo que necesita se pide al abrirlo.
- **El lunes (job `tareas-semana-lunes`, 6:00 CR, sin IA):** vence las propuestas que nadie decidió en 14 días (no
  son lápidas: si se vuelve a hablar del tema, se vuelve a proponer), pasa a «Por asignar» lo abierto de quien se dio
  de baja y muda al sprint de casa lo de quien cambió de área. Lo privado de una baja NO pasa a «Por asignar»: su
  título es solo suyo. Con `TAREAS_CIERRE_AUTOMATICO=1` (apagado por defecto) además revisa como `sistema` la semana
  PASADA de quien no la revisó: lo abierto pasa a esta semana con un pase que no cuenta ni avisa, y en Mis tareas
  aparece «El sistema pasó N tareas… Revisar»; la respuesta de la persona reemplaza la del sistema. Solo la semana
  pasada: las anteriores quedan en «Semanas sin revisar».
- **«Revisar con el equipo» (la líder, en la retro):** la misma revisión con una pestaña por persona y solo lo que ve
  de su sprint. Lo que marca queda a su nombre; a cada persona le llega UN aviso (cuántas marcó, cuántas siguen para
  agendar). No hay paso 2: el calendario lo toca solo su dueña. Si a la persona le queda algo privado sin marcar, la
  semana NO se cierra a su nombre: el aviso dice que le falta. Al construirlo apareció un hueco: la semana de otra
  persona se cargaba sin el filtro de visibilidad y la líder habría visto sus tareas privadas; ahora pasa por
  `tareasVisiblesWhere`, como todas las listas.
- **El arrastre de la agenda escribe una sola vez, al soltar.** La geometría es pura (`lib/ui/agenda-geometria.ts`):
  la medida se lee viva en cada movimiento, sin medida no se mueve nada y nunca se suelta en lo que ya pasó.
- **Comentarios y dependencias, con la visibilidad de la tarea.** Un comentario lo ve quien ve la tarea y avisa a los
  otros involucrados (nunca a quien escribió); no se borra, se archiva. «Esperar a…» solo con una tarea que ves, sin
  círculos; una que no ves aparece sin título. Cuando la que bloquea queda hecha, a quien esperaba le llega UN aviso
  (con el título solo si la ve). Las dependencias no mueven fechas: si la bloqueadora pasó a otra semana, se dice.
- **«Tareas internas por cliente»** (`/tareas/por-cliente`): lo abierto sale de la tarea (su cliente de hoy) y lo hecho
  en el período, de la foto de cada semana (`ResultadoDeSemana`): el pasado no cambia si la tarea cambia de cliente.
  Solo sobre lo que ves. No es el cronograma que ve el cliente, y la pantalla lo dice.
- **Un proyecto tiene su página** (`/tareas/proyectos/[id]`): lista o tablero, y el tablero por estado o por sección.
  El tablero es de columnas FIJAS (`components/ui/Tablero`, la mecánica de la hoja de ruta de Feedback): arrastrar solo
  cambia el estado o la sección, con las mismas reglas que el cajón (si no se puede, vuelve y lo dice). Las secciones
  agrupan, no son estado; una sección con tareas no se quita. Feedback sigue con su copia de la mecánica: llevarla a
  `Tablero` es un cambio aparte, sin mover lo que ya muestra.
- **Espacios libres** («Evento SmartAgro»): para un trabajo que junta a varios equipos. Quien lo crea queda como admin y
  nace con su primer proyecto, del mismo nombre; entre sus miembros las tareas se asignan directo. Lo ven sus miembros
  o todo Smarteam, según se elija. Nunca se queda sin admin, y se archiva solo sin proyectos activos (no se borra
  nada). Los espacios de equipo no se editan: salen del área de cada persona. En el panel de Mis tareas, «Tus
  espacios» lista solo aquellos donde estás (también para dirección: si no, sería toda la casa).
- **Vincular no es sincronizar.** Una tarea puede llevar registros que la acompañan sin cambiar para quién es: un
  registro de HubSpot (se pega el enlace de su ficha; solo del portal del sistema y de objetos que la app lee), una
  propuesta comercial o una preventa. Nada se escribe en HubSpot y al leer no se le llama: se muestra la foto de cuando
  se vinculó (sin correo, teléfono ni montos). La empresa del registro decide su cliente: si es uno que no ves, no se
  vincula; sin cliente claro, se ve sin título salvo para quien ve toda la cartera. Una propuesta pide poder abrir
  propuestas; una preventa, preventas. Un proyecto también tiene sus vínculos (los agrega quien lo administra), y
  «Actualizar» vuelve a leer en HubSpot el nombre, la etapa y la empresa de un registro (la foto dice de qué día es; si
  HubSpot ya no lo tiene, queda «Ya no está en HubSpot»). Nada se escribe en HubSpot.
- **Etiquetas**: hasta 5 por tarea, libres; agrupan y se buscan con «#», no son estado.
- **Las vistas son de la misma semana, no otras listas**: Mis tareas y la Semana del equipo tienen Lista (o Personas),
  Tablero (Pendiente · En curso · Hecha, arrastrar = cambiar el estado) y, en Mis tareas, Calendario (los bloques de
  Nexus; lo ocupado del resto del calendario lo lee solo «Agendar»). Las **métricas** del equipo se calculan solo sobre
  lo que ve quien mira —una privada ajena no entra a ninguna cifra— y, sin respuestas, no muestran un 0 %: dicen que
  nadie marcó su semana.
- **Nivel 2: la conversación, cuando las notas no alcanzan** (§7.3). Sin «Próximos pasos» ni tareas anotadas, Nexus
  lee la conversación solo (si quedan llamadas automáticas del día); con notas, «¿Faltó algo?» la lee con un clic y
  dice cuánto cuesta más o menos. Una vez por reunión (se reintenta si falló). La transcripción va comprimida y
  numerada por turno, por el chokepoint (`conversacionParaTareas`); el modelo devuelve el número del turno y la cita es
  el pedazo de ese turno, que pone el código. Lo que ya salió de las notas no se repite (título y detalle de la línea),
  el dueño solo puede ser alguien del equipo que estuvo, y un título con voseo o recortado llega marcado «Revisa el
  título». Todo queda como propuesta, con su aviso aparte del de las notas.
- **La revisión del 9 de octubre (14 fallas confirmadas, todas arregladas, con su prueba)**. Las que cambian reglas:
  - *Lo que sale de una reunión de cliente* no lleva su título ni su detalle a quien no estuvo: las notas de una
    propuesta arrancan vacías (el detalle vive en la cita, que tiene su regla), `pedidaPorTexto` no se escribe, y el
    aviso nombra la reunión solo a quien vería su cita (si no, «una reunión con un cliente»).
  - *Reabrir una tarea de una semana ya revisada* la pasa a la primera semana sin revisar, como «Sigue». La foto de
    esa semana pasa a «pasa» si todavía se puede corregir; si no, queda como se decidió. Antes quedaba abierta en una
    semana revisada (INV40) y volver a terminarla chocaba.
  - *Un bloque de agenda lo quita quien lo tiene en su calendario*, aunque la tarea ya no sea suya. Reagendar borra los
    bloques propios que todavía no terminaron, después de crear los nuevos; los de otra persona se conservan.
  - *Un pedido a un equipo sin líder no entra* (nadie lo decidiría), y se dice dónde llega: al «Por decidir» del líder.
  - *Meter una tarea en un proyecto* pide verlo, como el selector; si el proyecto no cambia, no se pide.
  - *La cita de una reunión ata la tarea a su cliente* (INV42): puede quedar sin cliente o con el de la reunión, nunca
    con otro. INV41 mira solo fusiones entre dos clientes distintos, e INV42 usa la precedencia del chokepoint
    (`resolvedClientId`, el manual solo si no hay).
  - *«Solo para mí» lo cambia solo su responsable* (`cambiarPrivada`): la líder y dirección pueden editar la tarea,
    pero no eso.
  - *Segunda revisión, el mismo día (15 más, arregladas con su prueba)*: un proyecto sugerido no se reusa si es de
    otro cliente (las líneas quedan sueltas); el cliente de una tarea se verifica solo si CAMBIA (quien recibe la
    propuesta de una reunión de una cuenta que no ve la puede usar); una lectura colgada se ve como error y se
    reintenta, con lo elegido ahora y a nombre de quien reintenta, una sola vez aunque se pida dos veces; una lectura
    sin notas se relee cuando llegan; la reunión gemela se lee por la fila que tiene las notas; «Más adelante» dentro
    de la semana que se revisa la saca de esa semana; corregir una revisión no deja la tarea contada en dos semanas;
    descartar o vencer un proyecto sugerido suelta también lo aceptado adentro; «Propuestas» y «Por asignar» ya no se
    pisan; y una conversación que no se pudo leer dice por qué (sin turnos no se ofrece de nuevo).
- **El chat de tareas (1B) es el mismo chat de Nexus con su propio turno** (`lib/tareas/chat`). Reusa de
  lib/asistente el hilo guardado, el acuerdo con su marcador, el libro de lo pendiente, la herramienta única
  `registrar_cambio_acordado`, la prueba en seco con un reintento, las líneas que arma el servidor y el cajón. No es
  un tercer carril dentro de `lib/asistente/turno.ts`, como decía el plan (§6.8): ese archivo lo leen unas 40
  pruebas por su texto, y los pedidos del cronograma y de los documentos tenían que quedar byte a byte iguales (sus
  cachés y sus pruebas). *Lo revertiría:* que el chat de un documento necesite lo mismo que el de tareas.
- **Su hilo cuelga de la PERSONA** (`Dueno` `{ personal: true }`, los tres ids en null): uno por persona, en todas las
  pantallas. El handler genérico, el contexto y el turno de los documentos reciben `DuenoDeDocumento`, así que un
  hilo personal no puede llegar a `contextoDeDocumento` (sin ids, su `findFirst` traería el canvas de una propuesta
  cualquiera). Leer un hilo personal por id exige el correo. El handler genérico rechaza la pieza «tareas».
- **Al modelo le llega una ventana**: desde el último acuerdo aplicado, como mucho 12 turnos, saltando de a 6 para que
  el prefijo cacheado dure varios turnos. Dos bloques cacheados en `system` (el prompt y TU CONTEXTO, ≤ 13.000
  caracteres) y uno en `messages` (el último de la ventana). El chip NO cambia TU CONTEXTO: lo que suma toma una
  etiqueta después de las del contexto y se define en su bloque, en `messages`; si no, cada chip invalidaría la caché.
- **El contexto nunca lleva una cita** (ni las notas de una tarea que la repiten), y el chip de una reunión trae solo
  sus próximos pasos y su resumen, por el chokepoint. Para LISTAR no se usa `tareasVisiblesWhere` (al Super Admin le
  traería toda la casa): lo suyo, lo de su sprint si lidera y lo que nombra.
- **Lo acordado se guarda con ids, no con etiquetas**: un pendiente no cambia de cliente si entre dos turnos cambia
  la lista C#. Un cliente que no está en la lista se resuelve por su nombre exacto entre los que ve la persona; si es
  de varias empresas, el rechazo nombra las candidatas. Descartar un pendiente arrastra lo que depende de él (el
  proyecto se lleva sus tareas), y lo nuevo idéntico a algo pendiente no se duplica.
- **`leerAcuerdo` conserva `dependencias` y `rotulos`.** Hasta el 2026-10-09 descartaba las dependencias que el turno
  escribía, y la cajita caía a la cascada del cronograma: sobre un documento (o una tarea) daba cero, y desmarcar lo
  que crea algo dejaba vivo lo que lo llena. Arreglarlo también corrige los documentos.
- **Aplicar es en el servidor, todo o nada** (`POST /api/tareas/operaciones {turnoId, desmarcadas}`): lee el acuerdo
  del hilo de esa persona (no acepta operaciones del navegador), recalcula el cierre de lo desmarcado, revalida contra
  la foto de hoy (si algo ya no entra, 422 sin escribir) y aplica por `mutaciones.ts` con las mismas reglas que la
  pantalla. **El desenlace se escribe en la misma transacción** (`agregarTurnoEnTx`, con el hilo bloqueado): un
  segundo clic dice «Ya estaba aplicado», y si el navegador se cierra el acuerdo no queda vivo. Cada creación lleva
  `origenId` = `c:<turno>:<i>`, así reaplicar no duplica. Los avisos salen después del commit.
- **Lo que el chat acordó como sugerencia sigue siendo sugerencia** aunque quien aplica pudiera asignarla; «asígnale»
  de quien no lidera ni comparte el espacio libre entra como propuesta y la línea lo dice.
- **Un plan entra como BORRADOR** (decisión 21 del plan): el proyecto en `propuesta` y sus tareas adentro SIN
  responsable ni sprint, con a quién iban en un evento `plan` (así no aparecen en la semana de nadie). Activarlo
  (`decidirProyecto` «usar») las reparte con las reglas de siempre, evaluadas para quien activa; descartarlo archiva
  las que esperaban. Un borrador no se activa editando su estado desde el chat.
- **El cajón no escribe el desenlace en el chat de tareas**: con el hilo que manda el servidor, lo pinta y termina.
  Sus rótulos («a tus tareas», «Crear 6 tareas») entran por props desde `components/tareas`: el cajón no importa
  lib/tareas (censo). Se monta UNA vez en el shell, y abrirlo cierra el Feedback (y al revés).
- **Tope: 30 mensajes por persona por día**, contados en todos sus hilos de tareas. El pensamiento queda en el valor
  por defecto hasta medirlo con `scripts/probar-asistente.ts` (pendiente).
- **La revisión del chat (34 fallas confirmadas, todas arregladas, con su prueba).** Las que cambian reglas:
  - *Un acuerdo solo lo trae un mensaje del asistente.* Los marcadores se sacan del mensaje de la persona y de la
    respuesta antes de guardarlos, lo pendiente se lee solo de los turnos del asistente, y aplicar responde 404 si el
    turno no es suyo. Además se vuelve a validar lo guardado (prioridad, estado, semana en lunes, forma del origen).
  - *Lo que el aplicar siempre rechazaría, el chat lo rechaza antes con su porqué*: sumar tareas a un borrador ya
    guardado, asignar o mover de semana una tarea de un plan sin activar, «Solo para mí» dentro de un plan, una tarea
    de un plan con otro cliente, y cambiarle el estado a un borrador. El PATCH de un proyecto tampoco activa un
    borrador: activarlo es decidirlo, que reparte sus tareas.
  - *Lo que depende de algo que cayó, cae con su motivo*, al preparar y al podar: el acuerdo ya no queda trabado en 422.
  - *Un borrador que vence se lleva sus tareas* (quedaban abiertas y sin dueño), y al activarlo, una tarea igual a una
    sugerencia que ya existe se archiva y suma una mención a la otra.
  - *Un choque con una sugerencia o un borrador igual sin decidir responde 409*, no 500; y un origen ya usado tiene
    que ser de quien aplica.
  - *Contestar una pregunta en texto no se reclama*: se reclama solo si el texto anuncia un cambio sin la herramienta.
  - *Un solo chat abierto a la vez* (el de tareas y el de un documento se tapaban), y no se aplica mientras el
    asistente piensa.
- **Cada tarea que genera Nexus nace con su CONTEXTO** (Elías, 2026-10-09: «Cada tarea que se genera debe tener una
  descripción con contexto»): de una a tres frases que dicen para qué es, para quién y qué se espera. Va en una
  columna propia, `Tarea.contexto` (SQL `2026-10-09-tareas2-contexto.sql`, después del de las tablas), y NO se edita:
  lo de la persona sigue en «notas», así lo que escribió alguien nunca se pisa y el cajón lo muestra arriba, una vez,
  con la marca de Nexus. *De dónde sale:*
  - de las notas de una reunión, con una llamada aparte a Haiku por lectura (`lib/tareas/ia/contexto.ts`, menos
    de un centavo de dólar), separada de la que decide de quién es cada línea para no tocar esa lógica. Una lectura que nadie pidió
    cuenta contra el cupo automático;
  - de la conversación, en la misma llamada que ya la lee (un campo más);
  - del chat, que tiene que escribirlo en cada `tarea.crear` (sin él, en voseo o repitiendo el título, se le reclama).
  Si el modelo no está, falla o no sirve, el contexto lo arma el código (`contextoDeRespaldo`): el detalle de la
  línea y el párrafo de «Detalles» que más se le parece. *Quién lo ve:* el de una reunión, con la regla de su cita,
  más quien la hace o la pidió si ve a ese cliente (lo necesita para hacerla aunque no haya estado); el resto lee
  «salió de una reunión con un cliente». El del chat va con la fila, como las notas. El buscador del servidor no lo
  busca (sería un oráculo de lo que no se ve). Lo que no hizo: las tareas a mano no llevan contexto de Nexus (lo que
  escribe la persona va en notas) y los proyectos sugeridos todavía no escriben su descripción.
- **«Lo que delegaste»** (`/tareas/delegadas`, Elías, 2026-10-09: «que se puedan ver qué tareas delegadas a otras
  personas de otros equipos o del equipo se están haciendo»): una ruta propia y no una pestaña de Mis tareas (ahí
  `?vista=` ya es lista, tablero o calendario de TU semana). Entra lo que pediste (`pedidaPorEmail`), lo que creaste
  para otra persona y lo que asignaste directo (evento `asignada`), con la regla de visibilidad de siempre; lo abierto
  siempre y lo cerrado de 30 días, con su motivo. No entra lo de un plan en borrador (todavía no le llegó a nadie).
  Agrupado: atrasadas (vencida o de una semana pasada, aunque esté en curso), todavía no deciden, en curso,
  pendientes y cerradas. Cada fila dice quién la tiene, para cuándo, su contexto y lo último que pasó; «Retirar el
  pedido» mientras no la decidan. ⚠ Quien la pidió sigue viendo una tarea que el responsable marcó «Solo para mí»:
  ya pasaba en el cajón; la lista no lo cambia.
- **Lo que dejó la revisión del contexto y de «Lo que delegaste» (18 fallas confirmadas, todas arregladas con su
  prueba).** Las que cambian reglas:
  - *Lo que el chat escribe desde una reunión queda atado a esa reunión.* Si en el turno el modelo leyó una reunión
    (el chip de la reunión, o el de una tarea que salió de una), el SERVIDOR le pone esa reunión a las tareas que se
    crean (`sessionId`, sin cita): su contexto se ve con la regla de la cita y no con la fila, aunque el modelo haya
    copiado algo de la reunión. La línea que se lee antes de aplicar muestra el contexto entero (lo que se guarda).
  - *La excepción de quien hace o pidió la tarea pide saber de quién es la reunión*: una de afuera sin dueño resuelto
    podría ser de un cliente que esa persona no ve; ahí, solo quien estuvo.
  - *Las corridas de IA de la lectura van con el cliente de la reunión, y la del contexto no guarda el texto* (solo
    cuántos escribió): en el montón sin cliente las veía más gente que la regla de la cita.
  - *El respaldo sin modelo no pega lo de otro tema*: no cuentan las palabras vacías, tiene que compartir algo con el
    título, el tema del párrafo tiene que ser el de la línea y no puede nombrar a otra empresa.
  - *Se escribe en tandas de 12 líneas*: una respuesta cortada deja con el respaldo solo a sus líneas.
  - *«Portugués», «francés», «estrés»… no son voseo* (la lista de agudas de `lib/ui/voseo-formas.ts`).
  - *Tomar una tarea no es delegarla*, y lo cerrado entra por cuándo se cerró (no por la última edición).
  - *Retirar el pedido de una tarea TUYA que le pasaste a otra persona te la devuelve como estaba*; antes la cerraba
    para siempre.

## La escala 8.8: una limpieza que no cambia qué se mide; lo demás, a la 9.0 (2026-10-09)

**Contexto.** Elías aprobó las 13 recomendaciones de la revisión de la 8.7 y pidió aplicar los arreglos, sobre todo
los graves, y los tres reportes de feedback del equipo (F-5, F-6, F-7). Para qué es la escala, en sus palabras: que
un consultor ubique a una empresa y que a la empresa le haga sentido estar ahí; con eso, previsibilidad para el
cliente, *land and expand* y servicio recurrente.

- **Las 13 decisiones de Elías (2026-10-09)**, que `pendiente-9-0.md` cita por número: (1) Marketing pide en Funcional
  los canales que la empresa eligió en su plan, no los cuatro. (2) WhatsApp o chat cuentan solo si el equipo atiende
  por ahí. (3) Un marketing con agencia, o de una sola persona, puede ser Funcional si el equipo es dueño del
  calendario, del brief, de la aprobación y de los accesos. (4) Misma vara en las tres áreas: metas en Funcional; lo
  que ha pagado el cliente y el reporte a la dirección en Eficiente; licencias sin uso en las tres (en la 8.8 solo se
  acota; sumar es 9.0). (5) La recompra sin contrato es de Ventas; retener con contrato, de Servicio; ofrecer el
  siguiente producto, de Ventas con la señal de Servicio. (6) Lo que comparten Ventas y Marketing se cuenta una vez
  (9.0). (7) Cliente clave: cada empresa lo define por escrito. (8) Pronóstico confiable = ±10 % en la mayoría de los
  meses del último semestre; estancado = el plazo que el proceso define para cada etapa; «todo negocio» = desde la
  puesta en marcha. (9) IA que sugiere = Eficiente; Óptimo = la IA ejecuta y una persona valida, y cada Óptimo dice
  qué hace la IA, quién valida y qué se ve en el sistema. (10) Permiso de contacto: riesgo en las tres áreas, impide
  Funcional solo donde la ley lo exige (9.0). (11) Palabras: vendedor, negocio, caso, cliente ideal, tablero,
  nutrición, fuga, «Tracción del Negocio»; en inglés solo lead, pipeline, CRM, MQL, SQL, playbook y SLA. (12) La
  tienda solo física y las aseguradoras se miden con la escala general; Inmobiliaria cubre corredoras y alquileres,
  con lo de proyecto propio bajo condición. (13) La vara de Funcional se mantiene; antes del test, probar con 5 a 8
  clientes reales.
- **En la 8.8 ningún identificador cambia.** Se precisa o se acota el texto (criterios, señales, preguntas, frases,
  resultados, costos, palabras, condiciones «Si…», marcas de perfil que precisan lo que el criterio ya era). Agregar,
  quitar, partir o mover un criterio, cambiar la marca «riesgo» o el cálculo va a la 9.0
  (`docs/escala/pendiente-9-0.md`). *Por qué:* identificadores estables (prueba 5), y una medición hecha con la 8.7
  se sigue comparando con una de la 8.8. Las señales de Deficiente e Inicial cambian de redacción y conservan su
  número: esos dos niveles se asignan por el que mejor describe a la empresa, leyendo el nivel entero, no contando
  señales (especificación, «Nivel de una dimensión»).
- **Antes de la 9.0, la 8.8 se prueba con 5 a 8 clientes reales** (decisión 13). ⛔ Nunca Wherex: hizo churn y es el
  cliente de prueba de Nexus.
- **Regla de asignación para los casos nuevos** (en la escala misma): dónde vive la información y si los sistemas se
  hablan → Tecnología; qué datos se registran, quién los corrige y los duplicados → Datos; la protección del cliente
  contra la suplantación → Marca y confianza, con lo que toca a Servicio y a Tecnología. *Por qué:* los tres reportes
  del equipo pusieron su caso en la dimensión equivocada; la regla evita que se repita.
- **Cada feedback se mira en todos lados:** quien lo revisa decide dónde va y busca dónde más pasa lo mismo, en las
  otras áreas y en las otras ediciones (manual 1.3.7). Lo que no cabe en una limpieza queda en el pendiente de la
  9.0 con su propuesta.
- **Las pruebas del repo no suponen una versión.** `publicar.test.ts` y `servidor.int.test.ts` arman la versión
  siguiente con `versionSiguiente` y buscan el criterio por su identificador; `mapa.test.ts` mira que el mapa de
  herramientas valga «desde» una versión no posterior. Publicar la 8.8 no rompe ninguna; la 9.0 tampoco va a romperlas.
- **La 8.8 se publica con el script**, no con el botón de Nexus: cambiaron también el manual (1.3.7), la
  especificación (1.3.8) y el mapa de herramientas (1.0.1), y el botón publica solo la escala. En la PC de Elías, en
  orden: `importar docs/escala/escala_rendimiento_smarteam.md --por egonzalez@smarteamcr.com --nota "…" --apply`;
  `escala-datos.ts estado` tiene que decir «revisión 1» y los cambios en la bitácora; `publicar-escala.ts
  --ediciones-revisadas --por egonzalez@smarteamcr.com` en seco; y el mismo con `--apply`. `--ediciones-revisadas`
  firma que se miraron los textos de las ediciones que el script marca como «viejos» (170 en la 8.8: siguen diciendo
  lo mismo). Desde la doble comprobación, `publicar-escala.ts` frena si el borrador no tiene ningún cambio (sería la
  8.7 con otro número, y una versión publicada no se corrige), si el archivo del repo dice esa versión con otro
  texto, o si falta un autor del equipo.
- **Doble comprobación antes de publicar (2026-10-09, pedida por Elías).** 12 revisores, cada hallazgo intentado
  refutar por un verificador: 199 hallazgos, 171 confirmados. Lo más importante: los criterios que la 8.8 había
  ampliado o a los que les había subido la vara volvieron a la 8.7 precisada (2.4.F1, al rol por escrito; 2.7.F3, a
  la campaña corriendo; 1.7.F5, sin el plazo por tipo de cliente; 1.3.O3, sin pedir que se use la ficha; 3.7.F2,
  sin las entregas), y lo que querían pedir quedó en la 9.0. Se aplicaron 354 reemplazos de línea; una segunda
  revisión miró cada uno y corrigió 10 detalles más (entre ellos, 1.5.O1 recupera «en tiempo real», como en la 8.7).

## La memoria de la cuenta: una sola lectura por reunión, en cinco piezas (2026-10-09)

**Contexto.** Elías pidió una memoria de cada cuenta que lean todos los agentes y que cada reunión se lea una sola vez.
La auditoría del 9-oct (`docs/memoria-de-la-cuenta-plan.md`) encontró que la lectura al llegar ya existe (el
post-proceso) y que lo que falla es revisar: de 533 minutas, 2 estaban revisadas; de 3.994 acciones vivas, una persona
había tocado 46; la ficha estaba confirmada en 2 de 168 clientes. Elías aceptó la lectura única con una condición: que
la arquitectura sirva para las partes nuevas de Nexus. Las etapas, con su orden y sus valores por defecto, están en ese
plan; las reglas de cada una, en las secciones que siguen.

- **Una sola lectura por reunión, y es el post-proceso.** Cada reunión con un cliente o un prospecto se lee una vez, al
  llegar (`lib/sessions/post-process.ts`). Desde la etapa 2 comparte la fila `LecturaDeReunion` con Tareas: una fila,
  una pasada, dos salidas. Un módulo nuevo no agrega su propio lector de reuniones: se suma como destino. *Por qué:*
  la regla de un clasificador sobre una pasada que ya existe («Eje de tipificación…», arriba) ya lo decía. Hoy una
  reunión dispara hasta siete llamadas, y el avance relee las 12 últimas del proyecto con cada reunión nueva. Leer una
  vez cuesta poco (≈US$0,15 por reunión); lo caro son las relecturas.
- **Cinco piezas, cada una en un solo lugar.** (1) Una entrada: cada fuente entra por su adaptador a la misma cola,
  `LecturaDeReunion` (hoy Meet; HubSpot, correos y notas pegadas, después). (2) Una salida estándar: minuta,
  compromisos, pedidos fuera de alcance, señales y hechos, cada uno con su cita verificada. (3) Un registro de
  destinos: cada módulo declara qué le sirve y dónde lo muestra; el modelo clasifica y el código reparte
  (`lib/seguimiento/destinos.ts`, etapa 6). (4) Un solo cargador de memoria: `memoriaDeLaCuenta` y
  `memoriaDelProyecto` (`lib/memoria`, etapa 3), con un alcance para el cliente y otro interno. (5) Un ciclo de vida
  de lo propuesto: pendiente, usado, desestimado o vencido, con quién y cuándo (`lib/lo-propuesto`, etapa 1). *Por
  qué:* sumar una fuente es escribir un adaptador; sumar un módulo, una entrada en el registro; sumar un agente,
  llamar al cargador. Nada de eso pide tocar lo demás.
- **Qué se lee según la empresa** (`client.kind`; rige desde la etapa 2, en `lib/sessions/post-process.ts`): de un
  cliente, todo; de un prospecto, la minuta y los compromisos,
  sin fuera de alcance (no hay nada vendido contra qué comparar), y la preventa sigue leyendo la reunión entera como
  memoria de su lienzo; de un aliado, nada. Una reunión de puertas adentro no la lee el seguimiento (la lee Tareas),
  y una interna vinculada a mano nunca alimenta lo que ve el cliente. El dueño sale siempre de `resolvedClientId` (el
  manual, solo si no hay).
- **El contexto general es la memoria, no una lista de reuniones.** Todo agente lee la memoria de la cuenta y la del
  proyecto; cada pieza suma solo lo poco que eligió: la exploración, sus sesiones (etapa A); los documentos del
  proyecto, las reuniones elegidas, leídas enteras (etapa 7); el cronograma, como hoy, sus elegidas. Casos de uso y La
  escala no leen reuniones. *Por qué:* cada pieza armaba su contexto con su propio corte de «las más recientes», y
  ninguna leía la minuta.
- **Todo lo que propone Nexus se puede desestimar**, y «Uso de Nexus» mide qué se usa, qué se desestima y qué vence,
  por módulo y por persona. *Por qué:* si la memoria suma propuestas sin cerrarlas, se repite lo de las minutas y la
  ficha.
- **El orden de construcción:** primero estas enmiendas; después las etapas 0, A y 4, en paralelo; luego 1, 2, 3, 3b,
  5, 6 y 7. La 2 va antes de la 3 porque la memoria del proyecto lee los compromisos abiertos desde Tareas. Cada etapa
  se despliega sola. Solo la 2 (5 columnas `seguimiento*`) y la 6 (`HechoDeReunion`) llevan SQL, aditivo y con RLS.
- **El costo se atribuye a la reunión que lo disparó**, con `LlmCall.origen = "reunion:<sessionId> › <sitio>"` (el
  formato, en «La lectura de cada reunión es durable…»), sin SQL. *Por
  qué:* `LlmCall` no tiene `sessionId`, y el costo del avance se midió por cercanía en el tiempo; sin esto no se puede
  comprobar que la etapa 2 y el sondeo no suben el costo.
- **Fuera por ahora:** las reuniones grabadas en HubSpot, los correos y las notas pegadas como fuentes de la lectura
  única. Entran cuando tengan un disparo definido y medido, y la deduplicación contra Meet. *Por qué:* la caída del
  21-sep se sospechó de un disparo sin freno.
  ⚠ **Enmendado el 2026-10-18** (iniciativa B): los correos, las notas y las llamadas de HubSpot entran, pero como una
  fuente APARTE (`ComunicacionDeHubspot`, un job cada hora), no como una fuente más de la lectura de cada reunión. Los
  compromisos de un correo enviado van por la misma salida estándar (lib/tareas/seguimiento.ts). Ver «Los correos y el
  timeline de HubSpot, en el contexto de la cuenta».

## Memoria de la cuenta · Etapa 0: arreglos y limpieza (2026-10-09)

**Contexto.** Lo que la memoria necesita arreglado antes de apoyarse en ello, y lo que sobra. Los números son de
producción, medidos el 9-oct con consultas de solo lectura.

- **El dueño de una reunión es `resolvedClientId`, y el manual solo si no hay** (`duenoDeLaSesion`, en
  `lib/sessions/project-sources.ts`: la precedencia que ya usan INV42 y Tareas, escrita una vez). El post-proceso deja
  de recategorizar la reunión por su cuenta y, sin dueño, no la lee. *Por qué:* recalculaba el dueño sin la guarda de
  nombres ambiguos ni el mapa de HubSpot (le pasaba un mapa vacío). Es el invariante 1 con otra cara.
- **El resumen del proyecto y el análisis de ventas pasan por el chokepoint.** El resumen lee las reuniones del
  proyecto que están incluidas y son del cliente (`getProjectMemberSessions`), así deja de citar las que una persona
  sacó. El análisis de ventas (`/api/sales/analyze`) pide `ventas.read` y nunca junta dos empresas en el mismo prompt:
  si el grupo de /sales (que se arma por dominio: gmail o un holding juntan varias) trae reuniones de más de una, analiza
  las de la empresa con más reuniones a la que quien pide tiene acceso y dice cuántas quedaron afuera; queda medido. El
  botón se muestra deshabilitado, con el motivo, a quien no tiene `ventas.read`. *Por qué:* los dos leían reuniones sin
  `belongsToClient`, y cualquier interno podía mandar reuniones de dos clientes al mismo prompt. El primer arreglo
  respondía 409 y dejaba el botón sin salida (en /sales no hay cómo elegir reuniones). El vigía del proyecto ya filtra
  por `belongsToClient` (`lib/cs/watchdog-context.ts`), con la entrega 2 de la cartera.
- **La regla propia de la propuesta comercial se queda** (`lib/business-cases/feeding.ts:84-104`): admite reuniones sin
  dueño de un prospecto todavía no resuelto, nunca las de otro cliente, así que cumple el invariante 1. Queda escrita la
  diferencia de forma: usa «el override manda», que puede dejar afuera una reunión (falso negativo), nunca meter una
  ajena. *Por qué:* pasarla por `getClientSessions` perdería esas reuniones.
- **El handoff lee la ficha confirmada, RECORTADA** (`fichaParaPrompt` con `paraDocumentoDelCliente: true`), y deja de
  recibir `Client.canvas`, `ClientContextCard` y `StageNote`. La orden «PRIORIDAD DEL CANVAS» desaparece para todos los
  agentes. *Por qué:* recibía una plantilla vacía presentada como «conocimiento validado» y no recibía lo único que
  vale. Recortada por la misma razón que «Lo interno NO se le manda al agente del handoff» (2026-10-01): lo que escribe
  llega en una sola llamada al kickoff, al diagnóstico, a la entrega y al cuestionario previo. Sacar lo muerto no pierde
  nada humano: 0 de 168 clientes tienen canvas con contenido, hay 0 `StageNote`, y las 71 `ClientContextCard` son todas
  del agente, ninguna en un canvas, la última del 1-jul. Desde la etapa 3 la ficha le llega por la memoria.
- **El kickoff, el detalle del cronograma y la planificación vieja no arman el contexto general** de `/analyze` (la
  actividad de HubSpot y las reuniones), y el registro del kickoff deja de anotar reuniones de venta que no leyó. *Por
  qué:* armaban un mensaje que después se reemplazaba entero; en 60 días fueron 18 corridas del kickoff y 23 del
  detalle, cada una con sus llamadas a HubSpot.
- **La llamada del avance queda registrada con su agente**, y el panel de los documentos dice cuántas reuniones lee
  (24) y que las lee en resumen. ⚠ **SUPERSEDED por la etapa 7** («Los documentos leen la memoria y solo las reuniones
  elegidas»): el panel dice que lee enteras las reuniones que elijas (hasta 6; las siguientes en resumen; pasadas las
  24 no entran) y, sin elegidas, qué le llega (`queLeeSinElegidas`, lib/contexto/documento.ts).
- **Se retira lo que no tiene pantalla:** las rutas `process-session`, los dos `canvas/refresh` (cliente y proyecto),
  `integrations/summarize` y el lector huérfano `canvas/suggestions`; `CanvasSuggestion`, con sus escritores (tenía 8
  pendientes que nadie podía ver; mandar una card al canvas de empresa responde 410, y la rama de proyecto queda); y
  las 3 secciones vacías de Información del cliente (`stakeholders`, `retos_estrategicos`, `oportunidades`), que dejan
  de crearse en los dos lugares donde nacían: esa información vive en la ficha. Las filas existentes no se borran. En
  el schema, `Client.canvas`, `StageNote` y `CanvasSuggestion` quedan DEPRECATED con fecha y sin DROP. ⚠ No están sin
  lectores: `Client.canvas` lo leen y escriben GET y PUT de `/api/clients/[id]/canvas` (sin pantalla) y `StageNote` lo
  lee `lib/clients/last-interaction.ts`; hay que retirarlos antes del DROP. `ClientContextCard` sale del mensaje del
  handoff y de todo agente no encadenado, pero los agentes encadenados por paso (`associatedStep`) todavía leen las del
  paso anterior y las HUMAN del cliente (`app/api/clients/[id]/analyze/route.ts`); eso y las pantallas que la usan son la
  deuda #24 de ARCHITECTURE.
- **`/api/sessions/analyze` y el modo «análisis» de /sessions se retiran** (decisión de Elías). Se usaron 4 veces en
  total, la última el 18-jun; no tenían guarda de cliente ni medidor, y su salida podía llegar al handoff. Los agentes
  `agent-sales-analysis` y `agent-service-analysis` pasan a Borrador desde /agents. El «Análisis de ventas» de /sales se
  queda, con la guarda nueva.
- **El respaldo de `GuiaDeExploracion` se retira recién después de correr `scripts/migrar-guia-de-exploracion.ts`**,
  fuera de esta ola. *Por qué:* hasta entonces es el único lugar donde están esas guías. Su ruta
  (`/api/projects/[projectId]/guia-exploracion`) no tiene pantalla: desde el 2026-10-10 el PATCH y el POST (que lanzaba
  el agente de la guía vieja y cobraba) responden 410, y queda solo el GET de solo lectura. El script lee
  `lib/guia-exploracion`, no la ruta; la ruta y el módulo se retiran juntos.
- **Los pedidos fuera de alcance se revisan con un script en simulacro** (`scripts/revisar-pedidos-fuera-de-alcance.ts`):
  lista los que no tienen proyecto y los de prospectos, y cada cambio pasa por `cambiarSolicitud`, con historial y
  firma. Nunca confirma nada, así que no sale ningún aviso. Hay 10 sin proyecto (6 de Grupo Servica, 1 de Plastimex y
  3 de prospectos) y 17 con un estado que escribió el modelo sin que nadie lo revisara.
- **En la preventa, el «Contexto adicional» va solo donde un agente lo lee.** Como quedó con la etapa A: Preparación,
  con sus fuentes y sus instrucciones; Casos de uso, solo sus instrucciones; La escala, con la explicación de que no
  tiene agente; Exploración, en su página de inicio (las sesiones, las fuentes manuales y las instrucciones, sin el
  bloque); Resumen y Propuesta, nada. *Por qué:* mostrar reuniones donde nadie las lee le hace creer al vendedor que esa
  pieza las usa.
- **Sin SQL.** Su deploy arrastra los SQL pendientes del árbol: los dice `npm run check:esquema`.

## La exploración son sus sesiones (2026-10-09)

**Contexto.** En Ferretería Noelito el proyecto tiene 45 reuniones vinculadas: la exploración arrancaba con hasta 30
sugeridas y el riel convertía cada reunión suelta en su propia pestaña, así que salían «sesiones» que no eran de la
exploración. Elías aprobó el diseño v13: la exploración abre en una página de inicio con sus sesiones, sin lista general
de reuniones, y lo demás llega por la memoria. Esto corrige siete reglas de la preventa y de la exploración del
proyecto, marcadas SUPERSEDED en su lugar.

- **Una reunión es de la exploración solo si es la de una de sus sesiones.** La de una sesión es la que se unió a ella:
  la elegida, la de su evento del calendario o, si no tiene evento, la del mismo día. Una reunión que no está en una
  sesión no se lee ni es pestaña. *Por qué:* el contexto general es la memoria; la exploración lee entero solo lo suyo.
- **Lo que se liga solo (por la fecha o a ±2 h del evento) nunca es una reunión de puertas adentro** (revisión del
  2026-10-10): en un cliente o un proyecto, una reunión del equipo ese día se leía como palabra del cliente y llegaba al
  Diagnóstico y al correo de seguimiento. Elegida a mano, sí entra, y el agente la lee rotulada [PUERTAS ADENTRO]. El
  correo de seguimiento no se arma para una reunión de puertas adentro.
- **Lo sumado a mano se liga por la fecha solo si ese día no queda ninguna reunión** (la minuta de una sesión que no
  quedó grabada, como antes de la etapa A); si hay reunión, gana la reunión y lo sumado queda en «Fuentes manuales».
  También se puede unir a una sesión a propósito, desde «Sumado a mano» del selector de «Agregar sesión». *Por qué:* sin esto, las
  sesiones que se apoyaban en una minuta de su día quedaban sin reunión al desplegar la etapa A, y con ellas su análisis
  y su correo.
- **Una sesión unida a una reunión de HubSpot guarda su hora** (`reunion.inicio`, la pone el servidor): mientras no
  ocurre, la sesión dice «agendada» (HubSpot da la agenda hacia adelante y la lista solo trae las que ya pasaron);
  cuando ocurre y queda grabada también en Meet, la sesión toma la de Meet (la de HubSpot deja de listarse) y se lee
  sola como cualquier unida. «Una que ya pasó» ofrece también las reuniones de HubSpot que ya pasaron.
- **La página de inicio:** la próxima sesión con «Preparar la sesión»; las sesiones con su reunión y su estado;
  «+ Agregar sesión» (una agendada, una que ya pasó o una sin reunión todavía); «Fuera de la exploración», plegado; las
  fuentes manuales; las instrucciones, y «Lo que la IA ya sabe», que se muestra desde la etapa 3 (los conteos de la memoria,
  en tarjetas; «Ver la memoria del proyecto» espera a que exista una página a la que llevar). No tiene lista general de
  reuniones.
- **En un prospecto, cada reunión con la empresa entra sola como sesión**, salvo las de puertas adentro y las instancias
  de una serie, y con el corte de siempre (`cuentaEnLaPreventa`). Las automáticas se CALCULAN al leer, sin escribirse:
  son las candidatas que no están en `contenido.fuera` ni en una sesión, y pasan a ser una `SesionPlaneada` cuando
  alguien les escribe algo (título, objetivo o nota). *Por qué:* sin un escritor de fondo no hay choque con la persona
  ni con el agente, y deshacer es trivial. Se sacan una o varias a la vez a «Fuera de la exploración»
  (`contenido.fuera`, claves `origen:id`, tope 200), que no borra nada y se vuelve sesión con un clic.
- **En un cliente o un proyecto nada entra solo**: se agrega con «+ Agregar sesión». «Una que ya pasó» lista las
  reuniones de toda la empresa, por el chokepoint del cliente (la segunda fase de un servicio puede estar en otro
  proyecto). Ahí, «Fuera de la exploración» son las reuniones leídas o elegidas antes que no quedaron en una sesión:
  solo lo que alguna vez fue de la exploración.
- **Una sesión se une a su evento antes de que ocurra** (`SesionPlaneada.evento`: el id de la instancia, el calendario
  de quien la unió y el inicio). Cuando ocurre, se liga con la reunión de ese evento (`gmeet_<eventId>` o
  `googleEventId`) y, si no está, con la de la empresa a ±2 h. Si la mueven en el calendario, la sesión toma la fecha
  nueva; si la cancelan, la sesión lo dice y sigue. Espera la transcripción 6 h antes de decir «terminó sin
  transcripción ni notas».
- **Las agendadas salen del calendario de quien busca y del de quien lleva la exploración**, de las próximas 6 semanas,
  con un lector a pedido que guarda lo leído 2 minutos y NUNCA ensancha el `timeMax` de la sincronización de Meet. A la
  empresa se la reconoce por sus dominios registrados y por la gente de sus reuniones que NO aparece en reuniones de
  otros clientes (`genteCompartidaConOtrosClientes`, en el chokepoint): con alguien de HubSpot o de una agencia en una
  reunión, «Agendadas» listaba reuniones de otros clientes (invariante 1). El evento de una sesión lo fija solo el
  servidor (la pantalla no lo puede cambiar por el PATCH) y tiene que tener a alguien de la empresa invitado, al unirlo
  y cada vez que se vuelve a mirar. El título de un evento del calendario no viaja al correo de seguimiento. Al
  abrir el lienzo, como mucho cada 10 minutos por exploración, Nexus relee hasta 5 eventos unidos (`events.get`, solo
  lectura; ver RUNBOOK). *Por qué:* la sincronización completa fue la sospechosa de la caída del 21-sep.
- **Ligar por fecha sigue, marcado «ligada por fecha · cambiar»**, solo para una sesión con fecha y sin evento, y nunca
  dispara la lectura sola. *Por qué:* no se gasta una lectura en una adivinanza.
- **«Una que ya pasó» primero mira lo que haría fallar el agregado** (el tope de sesiones, la sesión a unir) y recién
  después adopta una reunión sin dueño: adoptar le cambia el dueño en todo Nexus y no se deshace sola.
- **Qué se lee solo:** en un prospecto, la regla de hoy con dos frenos más (no está en «Fuera» y no es de una serie);
  en un proyecto o en la preventa de un cliente, solo la reunión unida de forma explícita (elegida o por su evento),
  cuando llega su transcripción, sin el filtro de Ventas. Va por `leerReunionNueva`, que llama el post-proceso, y desde
  la etapa 2 se muda a la cola de la lectura de cada reunión como un destino más. Cobra contra el presupuesto
  automático, una lectura por sesión (≈US$0,20–0,35, estimado con lo que cuesta leer en la preventa; no medido).
- **Una reunión con solo notas de Gemini se agrega y se lee**, y queda en `propuesta.leidas.soloNotas`: cuando llega su
  transcripción se vuelve a leer.
- **El id de una reunión admite hasta 200 caracteres** en todos los lugares donde se lee o se valida (antes 60, y 80 en
  las claves de las lecturas y los correos, donde la lectura de una reunión con id largo se perdía sin aviso). El tope
  de sesiones sube de 12 a 20, porque ahora se materializan más.
- **Queda DEPRECATED, sin DROP ni script:** `contenido.reunionesElegidas` (en un prospecto cuenta como unida a una
  sesión; en un cliente va a «Fuera») y `SessionProject.explorationOverride` (la exploración ya no lo lee; sigue
  declarado hasta la limpieza de la etapa 0, con su marca DEPRECATED en el schema). Desde el 2026-10-10
  `reunionesElegidas` se lee y nada la escribe: la operación `reunionElegida` ya no existe y el POST de
  `/api/sales/exploraciones/[id]/reuniones` (que además adoptaba reuniones sin dueño) responde 410.
- **Las otras piezas de la preventa dicen qué leen:** Preparación, las 3 sesiones más recientes de Exploración más sus
  fuentes manuales y sus instrucciones; Casos de uso, que no lee reuniones (solo sus instrucciones); La escala muestra el
  bloque solo para decir que no tiene agente; Resumen y Propuesta no tienen bloque.
- **Los estados de la reunión de una sesión:** sin reunión, agendada, esperando la transcripción, leída, sin leer, solo
  notas, terminó sin transcripción ni notas, cancelada en el calendario, corta y no se hizo. Cada uno dice qué hacer.
- **Sin SQL**: todo vive en los JSON de `ExploracionDeVenta`. Después del deploy, las exploraciones de Noelito y Cemaco
  y las preventas de Cicadex y Grupo Servica (clientes) abren solo con sus sesiones; lo leído antes queda en «Fuera de
  la exploración».

## La frontera llega a los documentos (2026-10-09)

**Contexto.** La regla de no usar precios ni lo dicho puertas adentro (`FRONTERA_DEL_MATERIAL`) vivía solo en el
material del cronograma. De los siete documentos, solo el kickoff decía algo de precios, y el diagnóstico llamaba a las
reuniones «la fuente principal». El chat de los documentos tampoco pasaba por el detector. Va antes de las etapas 6 y 7,
que mandan más texto de reuniones a documentos que ve el cliente.

- **La regla viaja DENTRO del material** (`FRONTERA_DE_LOS_DOCUMENTOS`, en `material.reuniones` y `material.notas`):
  nunca precios, montos, descuentos ni condiciones de lo que cobra Smarteam, aunque se hayan dicho; nunca lo dicho
  [PUERTAS ADENTRO] como dicho por el cliente; nunca de dónde salió cada cosa. Las cifras del negocio del cliente van
  solo donde la sección las pide, y tampoco dicen de dónde salieron (la regla decía «con su fuente» y se contradecía;
  se corrigió el 2026-10-10). *Por qué:* adentro del material ningún lector la puede olvidar ni repetir a su manera. Sin
  reuniones ni notas, el mensaje queda igual.
- **En qué piezas:** los documentos de cara al cliente (kickoff, diagnóstico, planificación, integraciones y entrega)
  reciben la regla entera; los internos (implementación y exploración), solo la de puertas adentro. Lo decide
  `pieceBySlug().clientFacing`. La propuesta comercial y los roles quedan fuera: ahí los precios los escribe Ventas a
  mano y su chat no lee reuniones.
- **El chat de los documentos marca la línea con «⚠ revisa»**, con un detector propio. En las cinco piezas, la cita de
  una reunión, una nota, la minuta o el kickoff («según la reunión del lunes», «confirmado en el kickoff»), también al
  lado de una cifra del cliente; los montos, solo en kickoff, planificación e integraciones (en el diagnóstico y la
  entrega una cifra del cliente es contenido); nunca fechas, plazos ni correos. Una persona nombrada como fuente
  («según Ronald») no se marca: la cuida solo la regla. *Por qué:* el detector del cronograma marca fechas, y en un
  documento una fecha o un plazo son contenido legítimo. Marca las dos salidas del chat de documentos (la lista que se
  aplica y las líneas del acuerdo). Solo avisa: la persona desmarca o pide otra cosa.
- **Lo interno del material va aparte** (`materialInterno`: el texto de cada reunión leída y el bloque de notas), para
  calcular las huellas de lo copiado, como en el cronograma. El chat de documentos no recibe ese material; desde la
  etapa 6 (con `SEGUIMIENTO_HECHOS=1`), «Cambiar con el chat» lleva la frase y la cita de la novedad, y con ellas se
  arman las huellas del turno (`huellasDeFrontera`, lib/asistente/turno.ts): la línea del acuerdo que copia la cita
  queda con «⚠ revisa…». Con la bandera apagada no hay huellas y la marca por copia no corre.
- **Sin «red tras generar» por ahora** (decisión de Elías): no se revisa con el detector el documento ya generado. Si
  hace falta, es una pieza aparte.
- **Sin SQL ni re-siembra.** Cambia el texto que reciben los siete documentos y la línea de reglas del chat de cinco;
  su caché se rehace una vez.

## Una sola revisión por reunión: lo que dejó cada reunión y el ciclo de vida de lo propuesto (2026-10-09)

> **Estado (2026-10-10): construida, sin commit ni deploy.** Está en el código: `lib/lo-propuesto` (ciclo, conteo y un lector por tipo), `lib/seguimiento` (la tarjeta, su carga y «Usar todo»), `lib/sessions/reuniones-para-seguimiento.ts`, la tarjeta en `/sessions/[id]` (`#lo-que-dejo`), su API `/api/sessions/[id]/lo-que-dejo`, el renglón de «Para ti» y `scripts/uso-de-nexus.ts`. Sin SQL.

**Contexto.** De 533 minutas, 2 estaban revisadas; el 98 % de las acciones seguía abierto; había 21 propuestas de ficha
sin confirmar contra 2 confirmadas. Cada cosa se revisaba en otra pantalla, y nada vencía. Va antes de los hechos: si no,
las propuestas nuevas caerían en colas que nadie revisa.

- **«Lo que dejó esta reunión» junta en una tarjeta lo que Nexus propuso al leerla**: la minuta, los pedidos fuera de
  alcance, los campos de la ficha, la etapa sugerida, la fecha del diagnóstico, tus tareas propuestas, las alertas que
  la citan (solo para quien lidera Customer Success) y los compromisos: lo demás que dejó la reunión en Tareas (desde la
  etapa 2; antes, `ActionItem`), plegados y solo para leer. Está en la página de la reunión, y agrupada en un renglón
  de «Para ti». *Por qué:* una sola revisión por reunión, en un solo lugar.
- **El dueño sale de `resolvedClientId`**: sin dueño no hay tarjeta, y una reunión de puertas adentro nunca la tiene (la
  lee Tareas). La página de una reunión y el PATCH de su minuta pasan a pedir acceso al cliente: sin acceso, 404. *Por
  qué:* hasta ahora cualquiera del equipo leía cualquier transcripción, y la página recalculaba el dueño por su cuenta.
- **«Usar todo» = la minuta revisada + los pedidos confirmados + TUS tareas propuestas de esa reunión** (y, desde la
  etapa 6, las novedades de los documentos que puedes decidir: quedan usadas, como un «Listo»). Nunca la ficha, la
  etapa, la fecha del diagnóstico, las alertas ni el avance: la ficha y la etapa escriben en HubSpot o tienen su propia
  puerta, y una alerta pide juicio. Cada cosa va por su chokepoint (`cambiarSolicitud`, `decidirTarea`,
  `decidirDestinoDeHecho`); si la tarjeta cambió desde que se cargó, responde 409 con la nueva.
- **Todo lo propuesto se puede desestimar, salvo la minuta** (decisión de Elías): la minuta es memoria de la reunión y la
  lee la etapa 3; si está mal, se corrige.
- **Cuatro estados para todo lo propuesto** (`lib/lo-propuesto`): pendiente, usado, desestimado y vencido. «Sin firma»
  marca lo que cambió de estado sin una persona, y un cierre del sistema cuenta como vencido. Los leen la tarjeta, «Para
  ti» y «Uso de Nexus». *Por qué:* un solo ciclo para todos los tipos, que cualquier propuesta nueva usa.
- **Vencer se calcula al leer, no se guarda.** La tarjeta deja de pedir revisión 30 días después de la fecha de la
  reunión; cada tipo, 30 días después de que nació. Las tareas propuestas conservan sus 14 días guardados (regla de
  Tareas). Decidir después del vencimiento sigue valiendo y reemplaza al «vencido». *Por qué:* no hace falta un job, y
  vencer no borra nada.
- **Quién decidió, sin tabla nueva.** La minuta, los pedidos, las tareas y las alertas ya lo guardan; la ficha y la
  fecha del diagnóstico lo guardan dentro de su propio JSON (`FichaGuardada.decisiones`, `descartadasPor`). La etapa no
  lo guarda (responder la encuesta borra la sugerencia) y queda como «no guarda quién decidió», igual que los demás
  tipos sin registro.
- **«Uso de Nexus» va en el panel de dirección de «Para ti»** (decisión de Elías): por módulo y por persona, cuánto se
  usó, se desestimó o venció. Sale de los estados que ya guarda cada tipo. Esta etapa deja los datos (una función de
  servidor y un script de solo lectura); la pantalla va en ese panel cuando se construya.
- **Las reuniones de prospectos no entran a «Para ti»**: se revisan en la tarjeta de la reunión. Desde la etapa 2 ya no
  dejan pedidos fuera de alcance.
- **Cómo quedó en el código (2026-10-10):**
  - «Usar todo» toca solo lo que se VE (los topes por sección: 8 pedidos, 10 tareas, 6 campos), y deja afuera los pedidos
    de un prospecto («Sin nada vendido: revísalo») y los que no tienen proyecto («Sin proyecto: revísalo en La cuenta»):
    esos se revisan uno por uno. Confirmar un pedido avisa a Ventas y a quien lidera Customer Success, como a mano.
  - Un pedido «Ya estaba incluida» (`INCLUIDO`) cuenta como usado: alguien lo revisó y decidió qué era.
  - La huella de «Usar todo» es un hash de lo pendiente (ids, estados y la versión de cada tarea): si cambió, 409 con la
    tarjeta nueva y sin escribir nada. Después, cada cosa por su lado: una tarea que ya decidió otra persona no frena lo demás.
  - La propuesta de ficha no guarda de qué reunión salió: se reconoce por la etiqueta de su fuente
    (`etiquetaDeSesion`, «Sesión «título» del 9 oct 2026», con la fecha armada a mano), y la lectura tolera las formas que
    escribía cada versión de Node («9 oct. 2026», «sept»). Dos reuniones con el mismo título el mismo día se confunden.
  - Una reunión sin dueño no tiene tarjeta, y su página la sigue viendo todo el equipo interno (no hay cliente al que
    pedirle acceso). Con dueño, la página y el PATCH de la minuta dan 404 sin acceso; el PATCH valida con Zod.
  - Lo decidido en la tarjeta queda en su lugar, sin la marca de sugerencia, hasta recargar; después, los pedidos y los
    campos de la ficha van plegados en «Ya revisado», y las tareas y las alertas decididas salen de la tarjeta (se ven
    en Tareas y en Éxito del cliente). La marca «Venció sin revisar» está, por ahora, solo en la tarjeta de la reunión.
  - Los compromisos se leen por UN adaptador (`lib/seguimiento/compromisos-server.ts`, desde la etapa 2): las tareas que
    dejó la reunión y que ve quien mira (`cargarTareasDeLaReunion`, con la visibilidad de Tareas), sin sus propias
    propuestas (esas se deciden arriba, en «Tus tareas») y sin el texto de la reunión. `lib/seguimiento` ya no lee
    `ActionItem`.
  - «Uso de Nexus»: `usoDeLoPropuesto` (lib/lo-propuesto/uso-server.ts) cuenta lo que NACIÓ en una ventana y cómo está
    hoy; las decisiones de la ventana sobre lo que nació antes van aparte («De antes»). Por persona solo con
    `conPersonas`. El script no imprime correos.
  - Desde el 2026-10-10 cuenta también lo propuesto de las etapas 3b y 6, cada tipo con su lector en
    `lib/lo-propuesto/registro-server.ts`: la **novedad** (un destino a la sección de un documento: «Listo» o el chat la
    usan, «No aplica» la desestima; vence con la regla de la franja), el **hecho** para Procesos (el aviso «Volver a
    mapear», solo de un hecho sacado de una transcripción; no tiene un «no») y la **sugerencia del handoff** congelado
    (en borrador = pendiente, confirmada = usada, ya no está = desestimada; sin firma, porque el bloque no guarda quién
    la usó y descartar lo borra). Lo delegado de un hecho (la ficha, la alerta, la etapa, el avance, el vigía) lo cuenta
    su propio tipo. Lo que el sistema retiró al cambiar el dueño de la reunión cuenta como vencido. Sin la tabla de los
    hechos, esos dos tipos salen en cero.
  - El renglón «Lo que dejaron tus reuniones» de «Para ti» cuenta también los hechos con una novedad que puedes decidir,
    con la misma regla que la tarjeta (`pideDecisionDeNovedad`). Con `SEGUIMIENTO_HECHOS` apagada no cambia nada.
- **Sin SQL.**

## La lectura de cada reunión es durable, comparte la fila con Tareas y ActionItem se retira (2026-10-09)

> **Estado (2026-10-10): las dos partes están en el código, SIN commit ni deploy y con el SQL sin aplicar.** La primera (el núcleo): la cola (`lib/lecturas`), el job `seguimiento-reuniones`, la bandera `SEGUIMIENTO_REUNIONES_ENABLED`, la salida por herramienta con citas verificadas (`lib/sessions/lectura-salida.ts`), los compromisos a propuestas de Tarea (`lib/tareas/seguimiento.ts`), el costo por reunión, el vínculo de las reuniones con solo notas, INV44 y `scripts/comparar-lectura-de-reuniones.ts`. La segunda (los lectores): los «Pendientes» del Resumen (`/api/tareas/del-proyecto/[projectId]`), «Para ti» (sin `PENDIENTES_DE_REUNIONES`), la página de la reunión y el vigía leen Tareas; `lib/tareas/para-agentes.ts`; `POST /api/action-items` en 410; la copia de `/analyze` apagada y el modelo DEPRECATED. Hasta el deploy, en producción la reunión la sigue leyendo el post-proceso de antes, que escribe `ActionItem`.

**Contexto.** El post-proceso se disparaba sin esperar resultado, en dos pasadas de hasta 120 reuniones, y si fallaba
nadie lo reintentaba. Leía el JSON con una regex, guardaba compromisos y pedidos con citas sin verificar y escribía
`ActionItem`, que no se usa: de 3.994 vivas, una persona tocó 46. Tareas ya tenía una tabla para leer cada reunión una
vez (`LecturaDeReunion`). Elías decidió que `ActionItem` se retira y que los próximos pasos pasan a Tareas, por CSE.

- **Una fila, una pasada, dos salidas.** La lectura de seguimiento usa la misma fila `LecturaDeReunion` que Tareas, con
  su propio estado en 5 columnas aditivas (`seguimientoEstado`, `seguimientoDesde`, `seguimientoIntentos`,
  `seguimientoLeidaAt` y `seguimientoError`). *Por qué:* `sessionId` es único, así que tiene que ser la misma fila, y
  `estado` es la salida de Tareas, que sus pantallas y sus reintentos ya usan. La cola (`lib/lecturas/cola.ts`) es el
  segundo escritor de esa tabla, declarado en la guarda de Tareas. Cuando la fila la crea el seguimiento, nace con los
  campos que Tareas exige y con valores que significan algo: el equipo de la mayoría o `cs`, el rol `planning` (una
  reunión de cliente propone, no cierra), la semana de la reunión y el estado de Tareas `en_espera` hasta que el
  seguimiento termina. La crea `lib/tareas/lectura.ts` (`crearFilaDelSeguimiento`) a pedido de la cola: la cola escribe
  solo las columnas `seguimiento*`, y una prueba de la guarda lo revisa campo por campo. Mientras espera, pedirla para
  tareas («Leer una reunión») se la pide YA a la lectura de seguimiento (`leerAhora`, contra el presupuesto de quien la
  pide), en vez de quedar diciendo «leyendo» hasta que el job la tome (sin presupuesto automático, nunca); con la
  bandera apagada o sin el SQL de la cola, la lee Tareas. Al terminar, su salida de Tareas dice «La leyó el seguimiento
  de la reunión» (`modo = "seguimiento"`), y «¿Faltó algo?» no se ofrece: la conversación ya se leyó entera. Si el
  seguimiento termina sin salida (sin texto, la reunión dejó de ser de un cliente o falló tres veces), la fila se suelta
  para Tareas (`sin_texto` o `error`), así se puede leer para tareas; una fila que Tareas ya leyó o pidió no se toca.
  Los estados del seguimiento son `en_espera`, `leyendo`, `lista`, `sin_texto`, `copia`, `error` y `omitida` (al leerla
  ya no era de un cliente ni de un prospecto, o era de puertas adentro). Una fila COPIA (la misma reunión en dos series
  del calendario) no se lee dos veces: pedirla lee la original.
- **Un job con toma atómica, reintentos y presupuesto** (`seguimiento-reuniones`). Toma 2 lecturas por tick, en
  paralelo; una que lleva más de 15 minutos leyendo vuelve a la cola; se reintenta hasta 3 veces (a los 5 y a los 30
  minutos), y el tick en que una llega a `error` (también por colgarse tres veces) el job falla: semáforo rojo y Sentry.
  Si no queda presupuesto automático, se salta la tanda, aunque la guardia de presupuesto esté solo en aviso. El
  enriquecimiento de Meet solo encola. Lo que sigue a la lectura (avance, ficha, etapa, preventa) corre después de
  marcarla, para no trabar el scheduler, que corre los jobs en serie. *Por qué:* «dispara y olvida» perdía las lecturas
  que fallaban.
- **El tope CORTA la lectura, y alcanza para lo que el código permite** (corrección del 2026-10-10). 420 s por
  lectura: el clasificador, el primer intento de 6.000 tokens y el reintento de 12.000 (solo esos 12.000 tardan de 130 a
  240 s). Un `AbortSignal` llega al clasificador y a cada llamada a Claude, y si llega antes de la primera escritura de
  la salida, la lectura termina en error sin escribir nada; una vez que empieza a escribir, termina. Si ni 60 s después
  del corte terminó (algo que no escucha el corte), la fila queda `leyendo` —no vuelve a la cola, donde otra pasada la
  leería en paralelo— y la rescata la regla de colgada a los 15 minutos; cuando esa lectura por fin termina, deja su
  resultado y corre lo que sigue. *Por qué:* con 120 s y sin corte, toda lectura que se cortaba vencía el tope y seguía
  viva por detrás: a los 5 minutos otra pasada leía la misma reunión (doble costo, otra minuta en borrador) o la
  encontraba con minuta y lo que sigue nunca corría. El precio: un tick con una lectura larga traba al scheduler hasta 8
  minutos.
- **`SEGUIMIENTO_REUNIONES_ENABLED=0` vuelve al post-proceso viejo** (una copia congelada que escribe `ActionItem`). Es un
  retroceso de emergencia: los lectores que pasaron a Tareas no vuelven atrás, así que en ese modo las `ActionItem`
  nuevas no se ven en ninguna pantalla. Lo dice el RUNBOOK.
- **La salida es una herramienta, no una regex** (`registrar_lectura`). Si se corta, se reintenta una vez con más tope,
  sin pasar los 21.333 tokens que admite una llamada sin streaming; si vuelve a cortarse, queda en error.
- **Una cita que no aparece en el texto descarta el compromiso o el pedido**: no se guarda «sin cita», y cuántos se
  descartaron queda en la corrida. *Por qué:* una cita inventada en una tarea de seguimiento le haría reclamar al
  cliente algo que no prometió.
- **El dueño sale de `resolvedClientId`** (el manual, solo si no hay), sin recategorizar; sin dueño, la lectura queda
  omitida. Una reunión que gana dueño se encola si todavía NO se leyó (o quedó sin texto, en error u omitida): la que
  le cambia una persona (`reResolveSession`) y, desde el 2026-10-10, las frescas que gana un cliente en la
  re-resolución masiva (`resolveAllSessions`, cuando se crea un cliente o se le suma un dominio; hasta 100 por corrida).
  Las que gana un cliente en la sincronización de Meet al crearse se encolan al enriquecerse, como todas.
  ⚠ **Una reunión que ya se leyó NO se vuelve a leer si le cambian el dueño**: lo que dejó (las propuestas de Tarea, los
  pedidos fuera de alcance) queda con el cliente anterior hasta que alguien lo corrija a mano. INV42 lo muestra para las
  tareas e INV46 para los pedidos. *Por qué:* releerla pisaría la minuta (que es memoria y quizás ya se revisó), y las
  propuestas viejas conservan su `origenId`, así que una relectura no crearía las del dueño nuevo. Retirar sola lo no
  decidido y releer sin tocar la minuta es una decisión pendiente de Elías.
- **«Generar minuta» (MinuteDialog) y «Leer esta reunión» (la página de una reunión sin minuta) leen YA**, por la misma
  cola: toman la fila (409 si el job o alguien más la está leyendo desde hace menos de 15 minutos) y cobran contra el
  presupuesto de quien la pidió, sin el corte de 14 días. «Leer esta reunión» es el remedio de INV44 para una reunión
  puntual; para varias, `scripts/encolar-lecturas-pendientes.ts` (en seco primero), que solo encola. Con `force`, una
  minuta ya revisada o editada no se rehace (409): es memoria y se corrige en la reunión.
- **Una sola regla para las puertas de una reunión** (`lib/sessions/acceso-a-la-reunion.ts`, 2026-10-10): con dueño,
  acceso a ese cliente, y sin acceso 404; sin dueño, cualquier usuario interno, como en /sessions. La siguen la página,
  la minuta, «Generar minuta», la transcripción (`GET /api/sessions/[id]`) y sus proyectos. *Por qué:* la página pedía
  acceso pero `GET /api/sessions/[id]` servía la transcripción de cualquier reunión a cualquier interno, y la minuta
  respondía 404 sin dueño mientras la página la mostraba (8 minutas de reuniones sin dueño no se podían aceptar).
  `enrich` y `summarize` quedan como deuda nombrada en la guarda. ⚠ Las reuniones cuyo dueño es Smarteam (un cliente
  INTERNO) piden acceso a ese cliente como cualquier otra: un CSE sin ese acceso las ve en /sessions y recibe 404 al
  abrirlas. Está pendiente de Elías si deben seguir abiertas para quien estuvo.
- **La ruta según la empresa:** cliente, la lectura completa; prospecto, la minuta y los compromisos, sin pedidos fuera
  de alcance ni propuesta de ficha (la ficha de un prospecto la lleva la preventa); aliado, interno o sin dueño, nada. **Un pedido fuera de alcance solo nace en una reunión de un CLIENTE con
  proyecto principal**: sin proyecto no se le pide al modelo, porque no hay nada vendido contra qué comparar. **Una
  reunión de puertas adentro (todos los que estuvieron son de la casa) no se lee, aunque la cascada le haya puesto un
  cliente por el título** (2026-10-10): lo dicho sin el cliente no se le atribuye. Es la misma regla de la tarjeta y de
  «Para ti» (`esDePuertasAdentro`), y la aplican la cola, la lectura e INV44. Antes se leía, dejaba pedidos fuera de
  alcance y tareas «lo prometió el cliente», y su fila de Tareas quedaba como leída: Tareas ya no procesaba sus
  «Próximos pasos». Esas reuniones las lee Tareas. ⚠ Que una reunión de Smarteam o de un aliado no deje minuta también
  le quita la minuta a los proyectos internos (medido el 2026-10-10: 5 proyectos de clientes INTERNO tuvieron 22 minutas
  en 60 días); la minuta del proyecto (MinuteDialog) dice por qué en vez de esperar un minuto. Está pendiente de Elías
  confirmar que es lo que quiere.
- **Los compromisos pasan a propuestas de `Tarea`**, por el escritor de Tareas. Lo que se comprometió Smarteam, para
  quien lo dijo (si no se sabe con seguridad, a «Por asignar» de su equipo). Lo que prometió el cliente, como **tarea de
  seguimiento** para el CSE del proyecto («Recordarle a Ana que envíe la base»), con la cita verificada y la marca
  «frena el plan» si aplica. Para lo de Smarteam, el NOMBRE que se dijo, si se resuelve con seguridad, manda sobre el
  correo que eligió el modelo; con un nombre dudoso vale el correo (al revés del orden del plan: el modelo elige el correo
  de una lista y se equivoca más que la transcripción; lo congela `lib/tareas/seguimiento.test.ts`). En un prospecto, el seguimiento va a quien lleva la preventa viva; sin preventa, solo se
  proponen los compromisos de Smarteam. Las propuestas vencen a los 14 días, como toda propuesta de Tareas. *Por qué:*
  un próximo paso, un solo destino. El cronograma no se toca en esta etapa: el canal al cronograma de lo que frena el
  plan es de la etapa 6.
- **Un seguimiento por reunión y cuenta** (Elías, 2026-10-19). Lo que prometió el cliente en una misma reunión (o un
  mismo correo) para la misma persona es UNA propuesta, «Seguimiento con Honda Costa Rica: 3 cosas que prometió Randall
  (lun 12 oct)», con la lista de lo que falta en su contexto (cada línea con su fecha y «frena el plan»). Lo junta
  `armarPropuestasDeSeguimiento` antes del único escritor; una sola cosa sigue con su título propio. El día va en el
  título para que dos reuniones de la misma cuenta no se junten por la huella. Lo que se comprometió Smarteam sigue una
  por una: es trabajo distinto, a veces de personas distintas. El tope de 5 por persona por reunión cuenta la agrupada
  como una. *Por qué:* medido ese día, 27 de las 80 propuestas vivas eran seguimientos sueltos en 15 reuniones, y en
  «Mis tareas» de una CSE se leían como tres tareas distintas. Lo ya propuesto se junta con
  `scripts/agrupar-seguimientos-propuestos.ts` (simulacro primero: 27 → 8 agrupadas + 7 solas); las sueltas quedan
  «Era otra tarea» en la nueva, firmadas por el sistema, y lo que decidió una persona no se toca.
- **Decidir lo de una reunión, en la reunión** (mismo día). En «Mis tareas» las propuestas van agrupadas por la reunión
  de la que salieron, con «Decidir en la reunión» (`/sessions/<id>#lo-que-dejo`); cada fila es el título, para quién y
  para cuándo, y lo demás (contexto, cita, historia) está en el cajón. «Tomarlo o decidir» de «Para ti» lleva a «Lo que
  dejó esta reunión» si el compromiso es tuyo y salió de una reunión; lo de un correo o «Por asignar» abre la tarea.
- **`ActionItem` queda DEPRECATED, sin DROP y sin borrar filas**, con todos sus escritores apagados: el post-proceso, la
  copia de pendientes de `/analyze` y la ruta que los creaba, que ahora responde 410. El script histórico
  `scripts/migrate-pending-items-to-action-items.ts`, que todavía los creaba con `--apply`, se retiró el 2026-10-10. Una
  prueba impide escribir uno nuevo, también desde `scripts/` (`lib/sessions/action-item-retirado.test.ts`). Los «Pendientes» del Resumen, «Para ti», la página de la reunión y el vigía leen Tareas. Lo histórico no se
  importa.
- **Los pendientes del proyecto toman la visibilidad de Tareas** (`tareasVisiblesWhere`): alguien de otro equipo con
  acceso al cliente puede ver menos que antes. Se acepta: es la regla ya decidida de Tareas.
- **La frontera Tareas ↔ agentes.** Los agentes INTERNOS (el vigía, la memoria interna del proyecto y el avance) leen
  una proyección de las tareas por UNA sola puerta, `lib/tareas/para-agentes.ts`: título, para cuándo, estado y lado
  (cliente o Smarteam). Nunca la cita, el contexto, las notas ni lo privado. Nada que ve el cliente lee tareas: ni los
  documentos de cara al cliente, ni el correo de seguimiento, ni la vista externa. El censo de `lib/tareas/guardas.test.ts`
  se enmienda con esa puerta, y la prueba de que ninguna lectura de los agentes nombra la cita suma `lib/cs`. La lectura
  de seguimiento también es un agente: los títulos que manda como «YA SON TAREAS» salen de la misma puerta
  (`titulosParaLaLectura`), sin lo de un espacio de «solo miembros» ni el borrador de un plan, y una prueba lo vigila.
  *Por qué:*
  los compromisos pasan a Tareas y el vigía y la memoria los necesitan; abrir las tablas a cada lector repetiría la fuga
  que el censo existe para evitar.
- **Cómo quedaron los lectores (segunda parte, 2026-10-10):**
  - Los «Pendientes recientes» del Resumen y su diálogo se ven igual, con datos de Tareas (`cargarTareasDelProyecto`):
    las tareas del proyecto de HubSpot que ve quien mira (sin las privadas de otras personas, tampoco para el Super
    Admin: es una pantalla del cliente, no la semana de alguien), lo abierto y lo que espera decisión de las últimas 4 semanas
    (hasta 5) y el resto en «Ver los N». Una propuesta dice «Por decidir» y se decide en Mis tareas; la casilla aparece
    solo si quien mira puede terminarla; «Agregar» crea una tarea tuya del proyecto sin semana; la X la pasa a «Ya no se
    hará» con el motivo fijo «Se sacó de los pendientes del proyecto.» (Tareas exige un motivo; nada se borra). El GPS
    ya no lee pendientes: `pendingItems` y `actionItems` viajan vacíos.
  - La página de la reunión dice «N tareas» (las que dejó y ve quien mira, `contarTareasDeLaReunion`), y la tarjeta
    «Lo que dejó esta reunión» muestra plegado lo demás que dejó en Tareas (`cargarTareasDeLaReunion`), con la misma regla.
  - En «Para ti» la fuente TAREAS dice «Salieron de tus reuniones»: no hay otra lista de lo vencido de las reuniones.
  - El vigía lee «Compromisos vencidos (Tareas)» por `pendientesVencidosParaElVigia`. La puerta también trae
    `compromisosAbiertosParaAgentes`, para la memoria interna del proyecto y el avance. Su `lado` sale del evento con
    que nació la tarea (la lectura de seguimiento lo guarda); sin ese evento, es trabajo de Smarteam.
  - La puerta, en el censo: los agentes internos (`lib/cs` y `lib/memoria`) importan de `lib/tareas` solo
    `para-agentes.ts` y no consultan sus tablas; `lib/cs` entra a la prueba de la cita.
- **Las reuniones que la lectura no toma se vinculan a su proyecto** desde el job (las que ya ocurrieron; solo el
  clasificador, nunca el override): las de solo notas, y desde el 2026-10-10 también las que tienen transcripción y no
  están en la cola (transcripción corta, de puertas adentro, o con dueño por la re-resolución masiva). Las que la lectura
  va a leer o ya leyó, no: las vincula ella. Leer las de solo notas es de la etapa 6.
- **INV44 es la lectura**: toda reunión con un cliente o un prospecto, de 14 días o menos, enriquecida hace más de 24 h,
  con transcripción y que no es de puertas adentro, tiene su lectura (lista, sin texto, copia o error) o su minuta. Una
  en `error` cuenta porque la señal es el job, que se pone en rojo ese tick. Su remedio: el job en Integraciones; una
  por una, «Leer esta reunión»; varias, el script de la cola. El día del deploy, las reuniones enriquecidas antes de que
  existiera la cola no tienen fila: se encolan con `scripts/encolar-lecturas-pendientes.ts` (medido el 2026-10-10: 6 de
  92 sin minuta). El invariante de los hechos de la etapa 6 pasa a ser INV45. **INV46** es su gemelo de INV42 para los
  pedidos: ningún pedido fuera de alcance vivo queda en un cliente que no es el dueño de su reunión.
- **El costo por reunión, sin SQL:** toda llamada a la IA que dispara la lectura de una reunión (la lectura, el
  clasificador, el avance, la ficha, la etapa, la preventa, y el clasificador de las reuniones con solo notas) queda en
  `LlmCall.origen` como `reunion:<sessionId> › <sitio>` (solo `reunion:<sessionId>` si el sitio no dijo nada). Lo pone
  `conLaReunion` UNA vez, arriba de la lectura; cada sitio sigue poniendo su `origen` y el medidor guarda los dos juntos
  (`origenDeLaFila`, lib/ai/contexto-de-corrida.ts). *Por qué así:* nadie agrupaba por `origen` (la pantalla de gasto
  agrupa por agente y por corrida; el presupuesto, por quién la disparó), así que el prefijo no rompe nada, y sumar por
  reunión es `split_part(origen, ' ', 1)` en SQL o `reunionDelOrigen` en código. Lo de adentro sigue diciendo de dónde
  vino («sessions/post-process › avance»), que un `origen` reemplazado habría perdido.
- **SQL:** `scripts/sql/2026-10-10-lectura-de-seguimiento.sql` (las 5 columnas, su CHECK y su índice), después del SQL de
  Tareas y antes del deploy. Requisito duro: el código de Tareas en producción. Antes de prender,
  `scripts/comparar-lectura-de-reuniones.ts` compara minutas viejas y nuevas en 20 reuniones (≈US$1,6). Los pedidos sin
  proyecto los ubica (o los descarta) una persona con `scripts/revisar-pedidos-fuera-de-alcance.ts` (etapa 0), que ya
  cubre lo que el plan llamaba `ubicar-pedidos-sin-proyecto.ts`.

## La memoria de la cuenta y del proyecto: un solo cargador (2026-10-09)

> **Estado (2026-10-10): núcleo y lectores en el código, sin commit ni deploy**: `lib/memoria` (tipos, registro de lectores, armador puro, cargador), la ficha con `origenPorCampo` y su `historia`, `lib/sessions/recortar-transcripcion.ts` y la puerta `lib/exploraciones/para-la-memoria.ts`. Ya leen la memoria todos sus lectores: el handoff, el kickoff, el diagnóstico y la planificación (desde la etapa 7, sin la ficha ni los procesos, que leen aparte), integraciones, la implementación, la entrega, el avance, el resumen del proyecto, la propuesta comercial, la preventa (A0), la exploración del proyecto (F0), el correo de seguimiento, el pase de cuenta y el vigía. La lista de lo que falta conectar (`AUN_SIN_CONECTAR`, lib/memoria/consumidores.test.ts) está vacía. `fichaParaPrompt` (lo que el diagnóstico y la planificación leen de la ficha) también corta en código la postura de las personas para un documento del cliente.

**Contexto.** Cada agente armaba su contexto de la cuenta por su cuenta, y los que más lo necesitan (handoff, kickoff,
cronograma, vigía) no leían la ficha. La ficha estaba confirmada en 2 de 168 clientes; el resumen del proyecto solo lo
mostraba la pantalla y se rehacía releyendo 12 reuniones.

- **Un solo cargador** (`lib/memoria`): `memoriaDeLaCuenta` (la ficha, los procesos, la historia de los proyectos, lo
  fuera de alcance y lo aprendido en la preventa) y `memoriaDelProyecto` (las minutas, los acuerdos, los compromisos
  abiertos, las desviaciones y los resultados). Los hechos de las reuniones (etapa 6) entran solo al alcance interno, en
  las dos: los usados, y los pendientes rotulados «propuesto por la lectura de «X» del <fecha>, sin revisar»; nunca los
  que quedaron solo delegados ni los desestimados (`hechosParaLaMemoria`, lib/seguimiento/hechos-server.ts). Un agente
  nuevo llama al cargador: no arma su propio contexto, y ninguno vuelve a leer todas las reuniones.
- **Tres alcances, no dos:** `cliente`, `sin-lo-interno` e `interno`. Cada consumidor está declarado en un registro que
  valida un test, y el alcance de cada pieza sale de `pieceBySlug().clientFacing`, no de una lista aparte. El handoff es
  `sin-lo-interno` a propósito: es interno, pero escribe en una sola llamada secciones que leen el kickoff y el
  cuestionario del cliente (el criterio de «Lo interno NO se le manda al agente del handoff»). *Por qué:* con dos
  alcances, el handoff recibía lo interno o lo perdía todo.
- **Quién lee qué:** el kickoff, el diagnóstico, la planificación, integraciones, la entrega, la propuesta comercial y el
  correo de seguimiento, el alcance `cliente`; el handoff, `sin-lo-interno`; la implementación, el avance, el resumen del
  proyecto, la exploración del proyecto, la preventa de un cliente que ya existe y el vigía, `interno`. El vigía lee la
  memoria desde el 2026-10-10 (la condición era la entrega 2 de la cartera, que ya está en el código): la cuenta y el
  proyecto, sin las reuniones, los compromisos ni los resultados, que ya lee por su lado (`lib/cs/watchdog-cuenta.ts`).
  La facturación y Partner los sigue leyendo aparte: nunca entran a la memoria.
- **Para el cliente se corta en código, no en el prompt**: la postura de las personas (de los stakeholders, solo nombre,
  cargo y papel), los campos internos de la ficha, lo fuera de alcance, lo interno de la preventa, los riesgos de la
  minuta y las reuniones que no fueron con el cliente. *Por qué:* la postura era una instrucción al modelo, y la regla
  del repo es filtrar datos, no rogarle al modelo.
  - **La postura no se corta por posición (revisión del 2026-10-10).** De una viñeta de primer nivel con las cuatro
    partes (nombre — cargo — papel — postura) quedan las tres primeras; con menos, solo el nombre, porque no se sabe
    qué parte falta («Ana — muy escéptica»); una sub-viñeta no va, y una viñeta que no empieza con un nombre tampoco
    (`stakeholdersSinPostura`). Por eso la ficha pide siempre las cuatro partes, con «sin dato» en la que falta
    (lib/clients/ficha-pedido.ts, la ayuda del campo y la preventa).
  - **La regla de la frontera viaja DENTRO del bloque de la memoria** fuera del alcance interno: para un documento del
    cliente, la de su pieza (`fronteraDeLaPieza`, la misma del bloque de reuniones); para el handoff, una propia (lo que
    escribe puede llegar al kickoff y al cuestionario). Y la red en código: de las minutas, fuera del alcance interno,
    quedan afuera los acuerdos con un monto o que hablan de negociación sin cifra («15% de descuento», «precio
    especial», «condiciones de pago», `traeNegociacion`), y las minutas que ninguna persona revisó
    (`minutasSinRevisar`): el borrador del kickoff alimenta el cuestionario que abre el cliente sin revisión.
  - **La memoria del proyecto respeta la X de cada documento.** Cada lector con «Contexto adicional» propio declara su
    destino (`ConsumidorDeLaMemoria.destino`); una reunión que el CSE sacó de ESE documento no vuelve por la memoria.
    Las que no entraron a su material por espacio, sí.
- **Los agentes internos leen también lo propuesto de la ficha, con su fuente** (decisión de Elías). Nunca lo que propuso
  el mismo agente que lee, ni lo derivado de él, y nunca en lo que ve el cliente. *Por qué:* el handoff propone a la
  ficha; si leyera lo propuesto, en la regeneración siguiente leería lo que él mismo inventó.
- **La ficha guarda fuente, fecha y autor por campo**, y en lo propuesto, el origen de cada campo (`origenPorCampo`,
  escrito en `fusionarPropuesta`, así cubre todas las puertas). Los descartes quedan registrados. Vive en el mismo JSON,
  con versión del formato: sin SQL. *Por qué:* un agente tiene que saber qué tan viejo es un dato y de dónde salió, y la
  regla anterior no se cumple sin el origen por campo.
- **La memoria nunca lleva facturación, montos de Partner ni rentabilidad**, en ningún alcance: eso sigue siendo del
  vigía. Un test congela que nada de rentabilidad, costos ni comisiones entra a la memoria. *Por qué:* lo interno
  también tiene capas; Partner y la plata de la cartera son de la CSL y dirección, y la rentabilidad, de dirección.
- **Los compromisos abiertos salen de Tareas, solo en el alcance `interno`**, por la puerta `lib/tareas/para-agentes.ts`.
  *Por qué:* la etapa 2 va antes y ahí viven los próximos pasos; el handoff y lo que ve el cliente no leen tareas.
- **Lo de la preventa va a la ficha desde el primer día**, como propuesta y con lo interno marcado (decisión de Elías). La
  marca no es solo texto: el campo propuesto que trae algo interno (la radiografía en «A qué se dedica», «quién decide»
  en las personas) queda marcado (`PropuestaDeFicha.internoPorCampo`) y no le llega al handoff hasta que el CSE lo
  confirma. Mismo criterio para las puertas con IA: la ficha no lee reuniones de puertas adentro (`fuentesDelCliente`
  y cada reunión en `proponerFichaDesdeSesion`), porque lo propuesto lo lee el handoff. El mapa: la
  radiografía a «A qué se dedica», su CRM actual a las herramientas, los retos a los retos, las consecuencias y las
  implicaciones al dolor, quién decide a las personas, la apertura a la asesoría y el «por qué ahora» a la motivación.
  Las metas de la preventa quedan dentro de los retos: la ficha no las acepta en «Resultados que persigue», que sale de
  los resultados confirmados de cada proyecto. El presupuesto, las objeciones, la hipótesis de valor y la escala no
  fuerzan campos nuevos. *Por qué:* hasta ahora solo llegaba desde una exploración de proyecto, y lo aprendido en la
  venta se perdía en el traspaso.
- **En la preventa, la memoria entra con el id `A0`**, que no cuenta como fuente del cliente: la regla «sin una pista del
  cliente no hay nivel» sigue en pie.
- **Los hallazgos confirmados de la auditoría del portal entran como contexto interno**, no como propuesta a la ficha.
- **El pase de cuenta suma lo esencial de la memoria**: la ficha confirmada, las personas, los compromisos abiertos y
  los pedidos fuera de alcance.
- **El resumen del proyecto lee minutas en vez de releer reuniones, y el avance lee la reunión nueva entera** (recortada
  a 40.000 caracteres) más las minutas de las anteriores, no 12 reuniones. Los dos, por el chokepoint.
- **Sin SQL ni re-siembra.** Suma unos 2.000 a 4.000 tokens por generación (≈US$0,01) y ahorra las relecturas.
- **Cómo quedó el núcleo en el código (2026-10-10):**
  - `lib/memoria/consumidores.ts` declara cada lector con su pieza, su alcance (de `pieceBySlug().clientFacing`, salvo
    el handoff), los orígenes de la ficha que no lee (los suyos) y las partes que ya tiene por otro lado (la preventa no
    se lee a sí misma). `queCargar(alcance)` dice qué se pide a la base: lo que el alcance no usa ni se consulta.
  - `lib/memoria/armar.ts` es la única función que decide qué entra, y se prueba sin base. Además de lo de arriba, para
    el cliente corta los acuerdos de la minuta que traen un monto, quién causó una desviación, su detalle y las que
    nadie confirmó, los ids de trato, los procesos sin validar y los resultados sin confirmar. **El handoff tampoco
    recibe la postura de las personas**: es la misma razón que lo deja sin los campos internos.
  - Topes: 6.900 caracteres la cuenta y 8.900 el proyecto, cada parte con el suyo (los 900 de más son de los hechos de
    la etapa 6, que solo existen en el alcance interno); las últimas 8 reuniones con contenido, 560 caracteres cada una.
    Sin nada que decir, el texto es "" y no se manda.
  - La ficha: `fusionarPropuesta` acumula `origenPorCampo`; en las propuestas de antes el origen se deduce de las
    etiquetas de sus fuentes, y lo que no se reconoce cuenta como «desconocido», que para excluir vale como sí. Lo
    propuesto también queda afuera si una de sus fuentes es del lector («Actualizar con IA» lee los handoffs). Al
    confirmar, cada campo que cambia guarda su `historia` (formato 2 de `Client.ficha`).
  - Las reuniones salen de `getProjectMemberSessions` + `soloOcurridas` y su contenido de UNA consulta (resumen y
    minuta, nunca la transcripción); en el alcance interno van con `resumenDeReunion`.
  - La preventa entra por `loAprendidoEnLaPreventa` (lib/exploraciones/para-la-memoria.ts, la preventa más reciente,
    abierta o archivada): lo que recibe el handoff más lo interno rotulado, primero lo interno.
  - Para el pase de cuenta, `loEsencialDeLaCuenta` da lo mismo en líneas cortas para un aviso (no un bloque de prompt):
    la ficha confirmada, las personas, los compromisos abiertos de los proyectos activos y lo fuera de alcance abierto.
    Lo llama la ruta del pase (`app/api/clients/[id]/cse-encargado`), no `lib/cs/pase-de-cuenta.ts`, que es puro.
  - `queSabeLaIA` da los conteos de «Lo que la IA ya sabe» (pantalla.ts los manda) y la página de inicio de la
    exploración los muestra en tarjetas (lib/exploraciones/lo-que-sabe-la-ia.ts). El congelado del handoff lo lee del
    último hito `congelado` | `rehecho` del canvas del handoff (del dueño, si cuelga de un hermano), con cómo se congeló;
    en un proyecto dice además si la empresa tuvo una preventa (`ultimaPreventa`, por la puerta de la preventa).
  - Las pruebas: `armar.test.ts`, `frontera.test.ts` (centinelas en todo lo interno, y que el código no lea plata),
    `consumidores.test.ts` (el censo y la lista de lo que falta conectar, que solo encoge) y `cargar.test.ts`.
- **Cómo quedaron los lectores en el código (2026-10-10, segunda parte):**
  - Cada lector pide la memoria con SU nombre (`lector: "…"`), y el registro dice además qué partes NO recibe porque
    ya las tiene o porque no le sirven (`sinPartes`): el handoff, sin la historia (la sigue leyendo por
    `loadPriorRelationshipContext`, con los handoffs previos); la implementación, sin los procesos (los lee enteros);
    integraciones, sin desviaciones ni resultados; la entrega, sin procesos, historia, resultados ni desviaciones (ya
    los lee, o traen semanas y fechas que en la entrega escribe Nexus); el resumen del proyecto, sin la historia ni lo
    fuera de alcance (los lee aparte); la propuesta comercial, sin los procesos; el correo, solo la ficha.
  - `memoriaDelDocumento` junta la memoria de la cuenta y la del proyecto para un documento de proyecto. El material de
    cada documento (`cargarMaterialDelDocumento`) devuelve `sesionesUsadas`, que van como `yaLeidas`: la misma reunión
    no se lee dos veces.
  - El handoff: `memoriaDeLaCuenta` con el alcance `sin-lo-interno` reemplaza la ficha recortada de la etapa 0, en el
    mismo lugar del mensaje base.
  - El kickoff, integraciones y la entrega (alcance del cliente) y la implementación (interno) suman su bloque después
    de su material, con el rótulo de que nada de ahí agranda lo vendido.
  - El avance (`getSessionsForProgress`, lib/sessions/project-sessions.ts): la reunión NUEVA entera —la del
    post-proceso o, con el botón, la más reciente con algo que leer—, las demás con lo que ya dejaron (minuta y notas),
    nunca 12 transcripciones; más la memoria del proyecto (compromisos abiertos, desviaciones ya registradas,
    resultados) sin esas reuniones.
  - El resumen del proyecto: el contenido de cada reunión es `resumenDeReunion` (UNA consulta, sin transcripción); «sin
    registro» pasa a ser «sin minuta ni resumen»; y lo que Nexus sabe de la cuenta es una fuente citable propia
    (`memoria:cuenta`).
  - La propuesta comercial: solo si la empresa no es prospecto o tiene la ficha confirmada, y DESPUÉS del chequeo de
    fuentes: no cuenta como la fuente que la generación exige.
  - La preventa: A0 solo en una empresa que no es prospecto, y no al releer una reunión. F0 de la exploración del
    proyecto pasa a ser la memoria (antes, la ficha confirmada sola). El prompt de los dos dice que A0 y F0 no alcanzan
    para un nivel ni una casilla del marco.
  - Lo de la preventa a la ficha (`lib/exploraciones/a-la-ficha.ts`, sin IA, origen «Preventa»): al PREPARAR, lo que la
    preparación propuso para las casillas con campo (sin lo descartado ni lo que no tiene una pista del cliente); al
    CONFIRMAR en el lienzo, lo nuevo. Cada campo suma lo nuevo a lo que la ficha ya tenía, sin repetir; cuando la
    casilla es interna, la fuente dice «interno de la preventa» y el campo queda marcado (`interno` → `internoPorCampo`):
    sin confirmar, no le llega al handoff. Una persona siempre lleva cuatro partes (nombre — cargo — papel — postura, con
    «sin dato» en la que falta), así el recorte para el cliente deja nombre, cargo y papel. La exploración de un PROYECTO
    sigue por la puerta con IA («lo que averiguó el CSE»).
  - El correo: la minuta y los compromisos de ESA reunión salen de su `SessionMinute` (acuerdos y decisiones) y de la
    salida de su lectura de seguimiento (`AgentRun.output` del agente post-sesión: los compromisos sin la cita ni el
    correo), solo si la reunión fue de Meet y con el cliente, y sin las líneas con monto.
  - El pase de cuenta: el detalle de un aviso se corta a 280 caracteres, así que lo esencial va en UNA línea de conteos
    y nombres («Lo que ya se sabe: 4 datos confirmados de la ficha · personas: Ana, Luis · 2 compromisos abiertos · 1
    pedido fuera de alcance abierto»), DESPUÉS del color, la relación, la renovación y las alertas, que tienen que
    entrar siempre (antes iba segunda y las empujaba fuera del corte). El detalle sigue en la ficha. ⚠ Eso no cumple
    del todo la decisión de Elías (que el CSE nuevo reciba lo esencial, no conteos): cómo entregarlo entero —un segundo
    aviso, una vista— lo decide él.
  - Medido sin IA con una cuenta llena hasta el tope (`lib/memoria/por-lector.test.ts`, con `MEDIR=<archivo>`): el
    handoff suma ~2.200 caracteres, el kickoff ~6.200, integraciones ~6.000, la implementación ~11.900, la entrega
    ~4.700, la propuesta comercial ~2.000, la preventa ~4.300, la exploración del proyecto ~6.000, el correo ~1.400 y el
    avance ~6.700 de memoria (más la reunión nueva entera, hasta 40.000, y los resúmenes de las demás, en vez de 12
    transcripciones). Con fichas sin confirmar —la mayoría—, mucho menos.

## El handoff se congela (2026-10-09)

> **Estado (2026-10-10): en el código, sin commitear.** Las reglas en `lib/handoff/congelado.ts`, lo que escribe la
> base en `lib/handoff/congelado-server.ts`, «Buscar lo nuevo» en `lib/handoff/sugerencias.ts` y `-server.ts`, la ruta
> `POST /api/projects/[projectId]/handoff/congelar`, la puerta del congelado en /analyze y los botones en
> `ProjectHandoffSection`. Sin SQL (usa `HitoDeDocumento` y `VersionDeDocumento.protegida`, del 2026-10-02). Los
> handoffs que ya existían siguen sin congelar hasta que Elías corra `scripts/congelar-handoffs-aplicados.ts`.

**Contexto.** El handoff es la foto fija de lo vendido en un proyecto, pero no era fijo: se regeneraba con el botón, sus
bloques nacían confirmados y un bloque «después del cierre» se alimentaba de reuniones posteriores. Elías decidió
congelarlo en un momento que siempre exista, no al publicar el kickoff (es opcional: 27 de 32 proyectos con handoff no
lo tenían publicado).

- **Se congela con «Congelar» o, solo, la primera vez que se aplica el cronograma que propone.** «Congelar» y «Buscar
  lo nuevo» piden su propia celda, `handoff.congelar`: por defecto el CSE, la CSL, Ventas y dirección (Dev y Marketing
  la reciben desde /team si hace falta; ADMIN no tiene ninguna celda del handoff). «Rehacer desde cero» reescribe el
  documento y sigue pidiendo `handoff.regenerate`, que el CSE no tiene. Al aplicar el cronograma congela quien lo aplica
  (también un CSE): ahí no decide la persona, lo decide la regla, y no se mira la celda. *Por qué:* aplicar ese
  cronograma es el momento en que lo vendido pasa a ser plan.
  - ⚠ **Corrige lo del 2026-10-09** («congela quien puede regenerar, sin celda propia»): con esa regla el CSE, que es
    quien congela, no podía. Congelar y buscar lo nuevo no reescriben el documento, así que no van con `regenerate`.
    Las sugerencias las pide el CSE, pero usarlas o descartarlas es editar el documento (`handoff.write`).
  - ⚠ **La primera generación de un proyecto sin cronograma NO congela.** Ahí el handoff crea las fases directo, sin
    propuesta que aplicar; congelarlo en ese momento dejaría congelado todo handoff recién nacido, antes de que el
    equipo sume las reuniones que faltaban. Queda para «Congelar» o para la primera propuesta del handoff que se aplique.
- **Se guarda como un hito del canvas del handoff, con su foto protegida** (`HitoDeDocumento` y
  `VersionDeDocumento.protegida`, del SQL del 2026-10-02), sin columnas nuevas. *Por qué:* la fila de `Handoff` no siempre
  existe, el hito ya guarda quién y cuándo, y la foto ES la foto fija de lo vendido. El estado lo dice el último hito
  «congelado» o «rehecho»; cómo se congeló (botón, cronograma, rehacer, migración) va en el texto del hito. Congelar es
  idempotente y toma la fila del canvas con `FOR UPDATE`: dos «Aplicar» a la vez dejan un solo congelado.
- **Sigue editable a mano. La IA ya no lo regenera**: con el handoff congelado, /analyze responde 409 a un pedido sin
  modo (una pestaña de antes) y «Regenerar» pasa a «Buscar lo nuevo». Lo nuevo de las reuniones posteriores llega como
  sugerencias, bloques en borrador con su cita que se usan o se descartan. Se piden a mano, solo leen lo posterior al
  congelado y solo suman: no vuelven a proponer fases ni tocan las etiquetas, el resumen, los resultados ni la ficha. Un
  pedido nuevo se dice como «Pedido nuevo, fuera de lo vendido» y va a fuera de alcance por la vía que ya existe (la
  lectura de cada reunión). *Por qué:* lo vendido no cambia por una reunión; lo acordado después se ve sin pisar lo que
  se vendió.
  - **Qué lee:** lo que ya dice el handoff, las reuniones que alimentan el handoff con fecha posterior al congelado (la
    misma política que la generación, por el chokepoint, solo las que ya ocurrieron) y las fuentes manuales cargadas
    después, más las exclusiones y las instrucciones del handoff. No lee HubSpot. Sin nada posterior, 409 antes de crear
    la corrida.
  - **La cita se verifica:** la frase tiene que aparecer tal cual en la reunión que nombra el modelo; si no, la
    sugerencia no entra. «Resultados que el cliente necesita alcanzar» no recibe sugerencias (un resultado va a los
    documentos, nunca al handoff).
  - **Cada búsqueda lee TODO lo posterior al congelado**, así que sus sugerencias reemplazan a las que nadie revisó; las
    usadas ya son contenido y las retocadas a mano se quedan. Si no encontró nada, no borra nada. Lo que alguien descartó
    no vuelve: cada corrida guarda en su salida lo que propuso, y la siguiente no repite esa cita ni ese texto.
  - **Mientras nadie la usa, una sugerencia no llega a ningún agente** (kickoff, diagnóstico, entrega…): el loader del
    canvas la deja afuera (`esSugerenciaPendiente`). Usada, es handoff como cualquier otro bloque.
  - **La corrida de «Buscar lo nuevo» no es una corrida del documento:** nace con el paso «Buscar lo nuevo en el
    handoff» y queda fuera del historial del handoff y del «último handoff» que lee el cronograma
    (`whereCorridasDeDocumento`); si no, la comparación de la propuesta del cronograma con el último handoff desaparecía.
    Tampoco cuenta en la lista de handoffs del cliente («las sesiones con las que se armó»), ni para marcar qué corrida
    está vigente en el historial (sus bloques nacen del agente y son los más nuevos): las dos usan
    `SIN_BUSCAR_LO_NUEVO`, y un censo de lib/agents/historial-corridas.test.ts frena a un lector nuevo que lo olvide. Si
    se recarga la página a mitad de una búsqueda, la sección la retoma sabiendo que es una búsqueda (`corridaEnCurso.sugerir`):
    al terminar no sincroniza con HubSpot ni avisa al cronograma.
- **Un handoff congelado que alguien vació a mano** se rehace desde cero (con motivo) desde la misma tarjeta: «Generar»
  daría 409 y «Buscar lo nuevo» no tiene sobre qué sugerir.
- **El enrutador de la etapa 6 nunca escribe en el handoff**: un acuerdo de alcance va a los documentos del proyecto.
  *Por qué:* resuelve el choque del plan entre «nunca el handoff» y «sugerencias sobre el handoff»: las sugerencias son a
  pedido y solo suman.
- **«Rehacer desde cero» pide un motivo** (10 caracteres o más), corre la generación de siempre y, al terminar, deja el
  hito «rehecho» con el motivo y enseguida el «congelado» nuevo, con una foto nueva. Antes de la foto se van las
  sugerencias que nadie revisó. Si la corrida falla, el handoff queda congelado como estaba: no hay un estado a medio
  rehacer.
- **El aviso de «desactualizado» sale de lo último que cambió el handoff**: la generación, o una edición o una
  sugerencia usada después del congelado. Lo calcula una sola función para las dos pantallas (`ultimoCambioDelHandoff`).
  Descartar una sugerencia toca el documento pero no cambia lo vendido: se compara con la foto del congelado, sin los
  borradores, y solo cuenta si cambió.
- **El bloque «después del cierre»** sigue sirviendo para la primera generación y para rehacer; una vez congelado, lo
  posterior llega como sugerencias.
- **Recurrentes:** el ciclo nuevo es otro proyecto con su handoff, que se congela solo. Un recurrente que lleva varios
  ciclos en un solo cronograma se congela una vez, y el ciclo nuevo se hace con «Rehacer desde cero» y el motivo «Ciclo
  N».
- **Los 53 handoffs que ya existen** se congelan solo si Elías lo decide, con `scripts/congelar-handoffs-aplicados.ts`
  (simulacro primero, sin Wherex). Dos grupos: A, los que tienen aplicada una propuesta del handoff (la misma regla de
  hoy), que congela `--apply`; y B, los que tienen el cronograma creado directo por el handoff, que solo entran con
  `--tambien-creados`.

## Un solo sistema de alertas, con tres detectores (2026-10-09)

> **Estado (2026-10-10):** las reglas en código y el vigía ya escriben en `CsAlert`. El detector de la lectura de cada
> reunión está en el código (etapa 6: `lib/cs/alertas-de-la-lectura.ts` y su `-server`), detrás de la bandera
> `SEGUIMIENTO_HECHOS` (apagada por defecto): mientras esté apagada, la queja la sigue levantando solo el vigía.

**Contexto.** El plan de la cartera decía que la queja la levanta el vigía, y la lectura de cada reunión iba a dejar
quejas y riesgos por su lado. Elías tomó la recomendación: un solo sistema, varios detectores. Un solo agente que lo haga
todo no conviene: las reglas cuestan US$0 y son exactas, y el vigía solo se paga donde hace falta juicio.

- **Todas las alertas de la cuenta viven en `CsAlert`, con el mismo ciclo**: abierta, resuelta o descartada con una nota,
  y vuelve solo con una señal nueva (`queHacerConLaRedeteccion`).
- **Tres detectores:** (1) las reglas en código (hoy, los avisos de renovación; mañana, las que se sumen); (2) la
  lectura de cada reunión, que levanta sola la QUEJA verificada (nunca en una reunión de puertas adentro); y (3) el
  vigía con IA, que juzga la cuenta entera, recibe el riesgo de la lectura como evidencia y decide si levanta una alerta.
- **«El cliente hablando» se comprueba, no se le cree al modelo** (revisión de la etapa 6, 2026-10-10): la lectura
  levanta la queja solo si la cita está en la TRANSCRIPCIÓN, en el turno de alguien que no es del equipo
  (`loDijoElCliente`, lib/seguimiento/hechos/tipos.ts). Una cita de las notas de Gemini es un resumen, no palabras del
  cliente, y con un solo nombre que coincide con alguien del equipo «cliente» lo dijo el modelo: esas quejas van como
  evidencia al vigía (destino `vigia.queja`). Por lo mismo, el hecho guarda quién lo dijo solo si lo comprobó el turno.
  Y el vigía no da por verificada una QUEJA cuya frase está en el turno de alguien de Smarteam (nombre y apellido de
  alguien del equipo): lo que dice el equipo no es una queja del cliente.
- **Una alerta por cita**: si el vigía y la lectura ven la misma queja, no se duplica. La de la lectura usa la misma
  `evidence.cita`, así pinta el color igual que la del vigía. «La misma» es la misma FRASE de la misma reunión (una
  contiene a la otra: cada detector corta la cita a su manera): dos quejas distintas de la misma reunión son dos
  alertas. Al actualizar una alerta, las reuniones y los hechos de su evidencia se acumulan (`juntarEvidencia`): si no,
  al cerrarla, volver a ver la reunión vieja contaba como evidencia nueva y la reabría.
- **Cobranza conserva sus alertas aparte** (`AlertaCobro`). Igualar su ciclo (nota al cerrar, volver con una señal nueva
  en vez de los 7 días) lo decide Finanzas.
- **La lectura levanta SOLO la queja.** Nunca un retraso (`TIMELINE_OVERDUE`): eso lo juzga el vigía con el cronograma.
  Su llave empieza con `lectura:` y la alerta es de la cuenta (sin proyecto), como la queja del vigía. Antes de crear,
  cada detector busca la gemela abierta con la misma cita (`mismaCitaVerificada`, lib/cs/alertas-reglas.ts) y la
  actualiza, SOLO para la queja: un retraso es de su proyecto, y el de otro proyecto que cita la misma reunión es otra
  alerta.
- **El riesgo, al vigía.** El contexto del vigía suma «Riesgos de reuniones recientes sin alerta» (de 30 días, con su
  cita, su reunión y quién lo dijo; también las quejas sin comprobar), y el barrido diario toma como candidato el
  proyecto con un riesgo nuevo desde su última corrida, aunque tenga una alerta abierta. Sin riesgos (o con la bandera
  apagada) la sección no va: el pedido del vigía queda como sin la etapa 6.
- **Una reunión que cambia de dueño cierra la alerta de queja que sostenía en el cliente anterior**, firmada por el
  sistema con «La reunión cambió de dueño» (o le saca esa reunión, si la sostienen otras). Ver «Hechos, enrutador y
  novedades».

## Hechos, enrutador y novedades (2026-10-09)

> **Estado (2026-10-10): la etapa 5 está en el código y sin correr** (`scripts/sondeo-de-hechos.ts` y los módulos puros
> de `lib/seguimiento/hechos`: los tipos, el pedido, la verificación de las citas y el texto de la reunión, que lee
> `lib/sessions/reunion-para-hechos.ts` por el chokepoint). **El núcleo de la etapa 6 está en el código y APAGADO**: la
> tabla `HechoDeReunion` (SQL `scripts/sql/2026-10-10-hechos-de-reunion.sql`, sin aplicar), el registro de destinos, el
> enrutador (el sondeo ya los usa en seco), la lectura de hechos (`lib/seguimiento/hechos-server.ts`), la ficha, el
> avance y la etapa desde los hechos, el detector de la queja, INV45, los hechos en la memoria interna y **las
> novedades en pantalla** (el cálculo, el riel, la franja arriba del documento, «Qué sigue», los hechos en la tarjeta de
> la reunión y «Volver a mapear» de Procesos). Corre solo con `SEGUIMIENTO_HECHOS=1` (solo «1»: cualquier otro valor la
> deja apagada) y el SQL aplicado; sin las dos, la lectura de cada reunión sigue como antes y nada de esto se ve ni le
> llega a ningún agente: apagarla también saca los hechos ya escritos de la memoria interna y del vigía.

**Contexto.** Etapas 5 y 6 de la memoria de la cuenta. Hoy la ficha y la etapa vuelven a leer cada reunión con Haiku, el
avance corre con cada reunión, y lo que una reunión cambia en un documento nadie lo ve hasta regenerarlo. La variante y
el modelo de la lectura de hechos los iba a decidir el sondeo (etapa 5) antes del código de la etapa 6. El código se
escribió entero sin el sondeo y quedó apagado: hasta que Elías lo corra y decida, rige un valor por defecto
(`VARIANTE_DE_HECHOS = "aparte-con-cache"`, con Sonnet 4.6; ver «La llamada de hechos», abajo).

- **Un hecho es una frase con su cita literal verificada**, de quién es (la cuenta o un proyecto vinculado), su tipo y su
  estado (`HechoDeReunion`). Lo escribe la lectura de cada reunión; el código decide a dónde va. *Por qué:* el modelo
  clasifica y el código rutea (el eje del DESTINO, arriba).
- **Los tipos, con la prueba de admisión** (quién actúa · dónde aterriza · qué pasa si nadie lo hace):
  - `cuenta` (una herramienta, la estructura, un reto): el CSE confirma · propuesta a la ficha · la ficha no se entera.
  - `persona`: el CSE · la ficha, si es de la cuenta, o el kickoff › equipo, si es del proyecto · los documentos quedan
    con personas viejas.
  - `acuerdo`, con su tema (pipeline, propiedades, integración, automatización, conversaciones, proceso después,
    alcance): el CSE · una novedad en la sección que corresponde de Planificación, Integraciones, Kickoff o Diagnóstico
    · el documento queda viejo.
  - `resultado`: el CSE · diagnóstico › objetivos y kickoff › métricas · el documento persigue lo que el cliente ya no
    persigue.
  - `proceso_hoy`: el CSE · Procesos, con «Volver a mapear» · el mapa envejece.
  - `queja`: la CSL o el CSE · una `CsAlert` QUEJA verificada (si no se comprobó que la dijo el cliente, evidencia
    para el vigía) · nadie llama al cliente que se quejó.
  - `riesgo`: el vigía · evidencia para su juicio · el vigía no lo ve.
  - `senal_cronograma`: el CSE aplica · el avance de cada proyecto vinculado · el cronograma no se entera.
  - `senal_etapa`: el CSE responde · la encuesta de la etapa · la etapa queda vieja.
- **Lo que NO es un hecho:** un compromiso (va a Tareas por la salida estándar de la etapa 2) y un pedido nuevo (va a
  `PedidoFueraDeAlcance`). El hallazgo de entrega a `KnowledgeDocument` queda fuera, como destino futuro del registro.
- **El registro de destinos** (`lib/seguimiento/destinos.ts`) dice qué tipos le sirven a cada módulo y dónde los muestra,
  y un test lo congela contra las secciones reales de cada documento. Las decisiones van a Planificación e Integraciones,
  nunca a Ejecución (sus pipelines y propiedades se retiraron el 2-oct). Un resultado va a los documentos (diagnóstico y
  kickoff), nunca al handoff ni a la ficha: «Resultados que persigue» sale de los resultados confirmados de cada
  proyecto.
- **El enrutador está en código** (`lib/seguimiento/enrutador.ts`): una reunión interna o de un aliado no deja nada; en
  un prospecto no hay avance, etapa ni novedades de proyecto, y si tiene una preventa viva, solo la preventa propone a la
  ficha (si no se puede saber si la preventa está viva, se toma como viva); un hecho de un proyecto no vinculado pasa a
  la cuenta; un hecho repetido no se vuelve a mandar, aunque el anterior ya esté delegado (la propuesta a la ficha): si
  no, la reunión siguiente volvía a proponer lo que el CSE quizás descartó.
- **La ficha deja de releer la reunión**: se propone desde los hechos (`proponerFichaDesdeHechos`), con la misma llamada
  a Haiku pero sobre las viñetas de los hechos. *Por qué:* el modelo de la ficha integra el valor completo del campo y
  evita viñetas repetidas; escribir directo perdería eso.
- **La etapa y el avance corren solo con señal.** El avance, para cada proyecto vinculado que cumple `linkFeedsAvance`
  (incluida y principal, o secundaria con confianza de 0,4 o más). *Por qué:* corrige el plan, que decía la política del
  handoff; esa filtra por relevancia de venta, y el avance perdería justo las reuniones de implementación. La etapa lee
  las señales y el resumen de la minuta, pero su cita se verifica SOLO contra las citas literales de las señales: la
  frase de cada señal y el resumen los escribió la IA, y una «cita» copiada de ellos no es la frase de la reunión.
- **Procesos conserva su lectura propia**: es por paso (quién, herramienta, momento, estado), con Opus y solo a pedido.
  Un hecho `proceso_hoy` solo avisa «Volver a mapear». *Por qué:* alimentarlo con hechos perdería el detalle por paso.
- **Una novedad no se guarda: se calcula** con los hechos pendientes, el registro y los documentos que ya tienen
  contenido. Se ve en la tarjeta de la reunión, en el riel junto a la pieza, arriba del documento y en «Qué sigue», justo
  después del documento desactualizado. Como mucho 5 por documento. Tiene tres acciones: «Cambiar con el chat», «Sumar
  la reunión al contexto» (un clic humano, nunca un `true` automático) y «No aplica». Queda usada al aplicar el acuerdo
  del chat que la llevaba o con «Listo». En Integraciones avisa que aplicar es publicar, porque se lee en vivo.
- **Las novedades en pantalla (cómo quedó en el código, 2026-10-10):**
  - El cálculo es puro (`lib/seguimiento/novedades.ts`): solo destinos «novedad» pendientes, de piezas con contenido,
    sin vencidos, una por huella (la reunión más reciente; las demás se deciden junto con ella) y como mucho 5.
  - El listado de piezas y la siembra de la ficha traen el número de cada pieza con la MISMA función
    (`conteoDeNovedadesDelProyecto`); el detalle (`GET /api/projects/[id]/novedades`, acceso al proyecto) se pide solo
    si alguna pieza tiene. En el riel va la chispa con el número, DESPUÉS del aviso de la fila («desactualizado», lo que
    le falta): el mismo orden que «Qué sigue», y sin ese renglón el CSE creía que la pieza estaba al día. La propuesta
    del cronograma gana sobre los dos.
  - Una novedad de proyecto sale solo de una reunión que sigue vinculada (incluida) a ese proyecto
    (`whereVinculadaAlProyecto`, el chokepoint): desvincular una reunión le saca sus novedades al proyecto. Lo mismo vale
    para la memoria interna del proyecto y para los riesgos del vigía.
  - Decidir es `PATCH /api/projects/[id]/novedades/[hechoId]` con la celda de generar ese documento
    (`guardContextoDelDocumento`): decide todas las secciones pendientes de ese documento en el hecho, por
    `decidirDestinoDeHecho` (el único escritor). Acepta `reemplazaAId` (acuerdos vigentes), sin pantalla todavía.
  - «Cambiar con el chat» fija la sección con la novedad adentro (`SeccionReferida.novedad`): viaja en el mensaje, dentro
    del bloque de alcance y con la regla de no copiar la cita ni poner precios; la red de la frontera de la etapa 4 marca
    igual la línea del acuerdo que la repita. Al aplicar bien un acuerdo, quedan usadas las novedades que llevaron los
    mensajes de la persona desde el último acuerdo aplicado (`novedadesPorAplicar`) y el chip se suelta.
  - «Qué sigue» mira solo la pieza de la etapa: el número viaja en la pieza (`PiezaParaQueSigue.novedades`), el mismo
    que el riel, en vez de una consulta aparte en la ruta del GPS.
  - En la tarjeta de la reunión, cada hecho dice a dónde fue; una novedad que puedes decidir pide decisión y entra a
    «Usar todo», que la da por usada como un «Listo». Solo con la misma regla que la franja: sin vencer y en un
    documento que ya tiene contenido. Nunca entran la ficha, la alerta, el avance ni la etapa.
  - Procesos: «Qué sigue» cuenta las reuniones con hechos `proceso_hoy` pendientes escritos después del último mapeo que
    terminó (`lib/procesos/novedades.ts`), contando solo los hechos sacados de una transcripción (lo único que lee el
    mapeo). Al terminar un mapeo, los hechos de las reuniones que leyó y que existían al arrancar quedan usados
    (`marcarProcesosUsados`); los de una reunión con solo notas siguen pendientes hasta vencer, sin avisar.
  - «Cambiar con el chat» trae al turno la frase y la cita de una reunión: con ellas se arman las huellas de la frontera
    del documento (la línea del acuerdo que copia la cita queda con «⚠ revisa…»), y si traen un monto, los montos se
    marcan también donde la pieza no lo pide (el diagnóstico, la entrega).
- **El estado de un hecho tiene dos niveles**: uno por destino (pendiente, usado, desestimado o delegado; «delegado»
  quiere decir que su ciclo vive en el destino, como la propuesta de ficha o la `CsAlert`) y uno general, con los cuatro
  estados del ciclo de vida. «Vencido» se calcula a los 30 días: no hace falta un job.
- **Acuerdos vigentes:** `HechoDeReunion` lleva desde el primer día la columna `reemplazaAId`, para saber si un acuerdo
  posterior reemplazó a otro. La pantalla de los acuerdos vigentes, y quién confirma un reemplazo, vienen después.
- **Una reunión que cambia de dueño** (`reResolveSession` y `resolveAllSessions`) retira sus hechos VIVOS del cliente
  anterior, firmados por el sistema con la nota «La reunión cambió de dueño»: lo pendiente queda desestimado, y lo
  delegado se retira de su módulo (la alerta de queja se cierra, o pierde esa reunión si la sostienen otras; los campos
  que la reunión propuso salen de la propuesta de la ficha; la etapa sugerida que salió de ella se borra) y queda
  desestimado. Lo que no se pudo retirar sigue delegado y el hecho vivo, así INV45 lo muestra. Lo usado no se toca: ya
  lo decidió una persona. El job de la lectura vuelve a pedir los hechos en el cliente nuevo: solo los hechos, sin
  releer la minuta. Y la lectura vuelve a mirar el dueño justo antes de escribir: si cambió mientras el modelo leía, no
  escribe nada.
- **INV45 mira lo vivo** (pendiente o delegado), no lo usado ni lo desestimado: (a) el hecho es del dueño de su reunión,
  (b) ese dueño no es de Smarteam ni un aliado, (c) su proyecto es del mismo cliente. Una reunión que alguien desvinculó
  del proyecto no lo viola: es del mismo cliente y los lectores ya no la ven. Su remedio existe: corregir el dueño en
  /sessions, o `scripts/hechos-fuera-de-su-cliente.ts --apply`, que retira esos hechos igual que un cambio de dueño.
- **La llamada de hechos** va aparte de la lectura, con Sonnet 4.6 y la reunión cacheada, hasta que el sondeo decida
  (`VARIANTE_DE_HECHOS`, lib/seguimiento/hechos-server.ts). ⚠ La lectura de hoy todavía no arma su pedido con el mismo
  prefijo (`prefijoDeLaReunion`): hasta que lo haga, la caché se escribe y no se comparte. Su estado vive en su corrida
  (`AgentRun` «seguimiento-hechos»), una por reunión y dueño; si falla (o se cuelga más de 15 minutos), el job de la
  lectura la reintenta hasta 3 veces, contra el presupuesto automático (los dueños se miran en una sola consulta por
  tick). El avance, la ficha y la etapa salen de los hechos solo si la lectura de hechos los aplicó (quedó lista, ya
  estaba leída o la está leyendo otra corrida); si falla o se omite, corren por el camino de siempre, y si el reintento
  la lee después, los vuelve a proponer. Una reunión leída solo con las notas que después recibe su transcripción se
  vuelve a leer con ella (lo vivo de las notas queda desestimado: «Se volvió a leer con la transcripción»).
- **Un acuerdo puede reemplazar a uno viejo** (`reemplazaAId`): solo lo escribe una persona al usar la novedad del
  acuerdo nuevo (`decidirDestinoDeHecho`, mismo cliente y mismo tema). El código nunca lo decide solo.
- **Recién acá se amplía la cobertura**: se leen las reuniones con solo notas (el 21 % de las reuniones con cliente) y,
  en las transcripciones largas, se suman las notas priorizadas de Gemini. Con la bandera prendida, el enriquecimiento
  de Meet y la cola encolan también las de solo notas (resumen de Gemini de 400 caracteres o más, de 14 días o menos);
  la lectura las vincula a su proyecto (solo el clasificador), no escribe minuta y deja sus hechos. Apagada, la
  cobertura de la etapa 2 no cambia.
- **El canal al cronograma** del compromiso del cliente que frena el plan (una tarea del cliente propuesta en el
  cronograma, nunca escrita sola) se diseña en esta etapa; hasta entonces es solo la marca en la tarea de seguimiento.
- **Nada que ve el cliente lee hechos** (un escaneo lo vigila), e INV45 vigila que todo hecho vivo sea del cliente de
  su reunión. En la memoria, los hechos van solo al alcance interno. La LECTURA de una reunión de la exploración de un
  proyecto no recibe la memoria interna (F0): su resumen es lo que el correo de seguimiento, que lee el cliente, usa
  como «lo que se leyó de la reunión».
- **El sondeo (etapa 5)** es `scripts/sondeo-de-hechos.ts`, sin deploy: unas 30 reuniones recientes (sin internas,
  aliadas ni Wherex; como mucho 3 por cliente), con los mismos módulos puros que va a usar la etapa 6 y las citas
  verificadas, comparado con lo que encuentran el Haiku de la ficha y la lectura de procesos, y con el costo con caché y
  sin ella. Cuesta unos US$3,5 y solo escribe la telemetría de `LlmCall`. Deja cada hecho con su cita y su destino en
  `backups/<fecha>-sondeo-de-hechos/`. Con eso Elías decide la variante (aparte con caché, aparte sin caché o en la misma
  llamada) y el modelo (Sonnet 4.6 o Haiku 4.5). Hasta entonces la lectura de hechos se despliega apagada: sin la
  variable no corre, y se prende con `SEGUIMIENTO_HECHOS=1` en el `.env` del servidor (cambiarla pide recrear el
  contenedor: `bash scripts/deploy.sh`).
- **SQL:** la tabla `HechoDeReunion`, con RLS y RESTRICTIVE, después del SQL de Tareas (tiene una FK a
  `LecturaDeReunion`).

## Los documentos leen la memoria y solo las reuniones elegidas (2026-10-09)

> **Estado (2026-10-10): la etapa 7 está entera en el código, SIN desplegar.** El lector (solo las elegidas, enteras,
> `lib/contexto/material-del-documento.ts`), la regla (`lib/sessions/destinos-de-contexto.ts`), la puerta (`null`,
> `false` y `true`), la memoria del diagnóstico y de la planificación, las sugerencias calculadas
> (`lib/contexto/sugerencias-del-documento.ts`) y el panel. ⚠ Medido ese día en producción, solo lectura
> (`scripts/medir-contexto-de-documentos.ts`): ninguna reunión está elegida ni desestimada en ningún documento (las
> seis columnas en `null`), así que **los 52 documentos ya generados de 32 proyectos se regenerarían sin reuniones**
> (hoy los alimentan 1.361, todas por la regla sugerida). Y todavía no habría sugerencias: la tabla de hechos no existe
> en producción y las 2 exploraciones de proyecto vivas no tienen reuniones unidas a sus sesiones. **Lo resuelve la
> migración del 2026-10-10** (abajo): las 6 más recientes de cada documento con contenido quedan elegidas, y las demás
> que la regla vieja leía se sugieren desde el día del deploy. La revisión del
> mismo día sumó: las elegidas vacías no ocupan lugar, la línea de cobertura, la minuta recortada en los documentos del
> cliente, la regla repetida al final, la elegida de antes del piso, las reuniones del proyecto en el buscador y el
> assist del diagnóstico en resumen. Quedan dos decisiones de Elías (abajo), que ya no frenan el deploy: qué trae la
> memoria de las minutas en borrador y el impacto de la entrega sin elegidas.

**Contexto.** Desde el 2026-09-28 (diagnóstico), el 2026-09-29 (planificación y ejecución) y el 2026-10-07 (kickoff,
integraciones y entrega), los documentos del proyecto arrancaban SUGERIDOS: toda reunión del proyecto con el cliente
entraba sin que nadie la eligiera. La razón está escrita en `lib/sessions/destinos-de-contexto.ts`: si el diagnóstico
arrancara vacío, saldría sin reuniones cada vez que alguien se olvida de elegir. Esta sección la contesta.

- **Con la memoria del proyecto (etapa 3), un documento sin reuniones elegidas no sale vacío, pero de las reuniones
  trae poco**: trabaja con lo que dejaron las demás reuniones (en los documentos del cliente, solo los acuerdos y las
  decisiones de las minutas revisadas), la historia, las desviaciones que ve el cliente y la ficha confirmada (el
  diagnóstico y la planificación la leen aparte); los compromisos, solo en la ejecución, que también lee las minutas en
  borrador. ⚠ Medido el 2026-10-10 en producción, solo lectura, sobre los vínculos incluidos de proyectos activos con
  reuniones de los últimos 180 días: **4 minutas revisadas, 689 en borrador y 593 reuniones sin minuta**. O sea que en
  los cinco documentos del cliente, sin elegidas, hoy no llega casi nada de las reuniones. El panel lo dice
  (`queLeeSinElegidas`, lib/contexto/documento.ts): «Sin elegidas, no lee ninguna reunión: de las demás le llegan solo
  los acuerdos y las decisiones de las minutas revisadas»; en la entrega suma que la sección de impacto sale vacía, y
  en la ejecución dice que lee sus minutas y los compromisos abiertos. ~~**Pendiente de Elías, antes del deploy**: (a)
  … o (b) que el deploy espere a que haya sugerencias…~~ **(b) lo resolvió la migración del 2026-10-10** (los
  documentos con contenido quedan con sus 6 reuniones más recientes elegidas, y el resto se sugiere desde el día del
  deploy). **Sigue abierta, sin frenar el deploy:** (a) que la memoria de alcance cliente lea también los acuerdos y las
  decisiones de las minutas en borrador, con la frontera y sin montos como ya hace `acuerdosYDecisiones` (cuenta para
  lo que nadie eligió).
- **El modo sugerido metía por defecto las llamadas de venta, con precios, en documentos que ve el cliente.** La frontera
  (etapa 4) lo frena en el texto; con «solo las elegidas», además, deja de entrar.
- **Lo que hacía el modo sugerido lo hacen las sugerencias calculadas**: el diagnóstico sugiere las sesiones de la
  exploración, y cada documento, las reuniones con hechos abiertos que el registro rutea a él y (desde la migración del
  2026-10-10) las reuniones con el cliente que la regla vieja leía. Se calculan al leer y
  nunca escriben `true` solas: `true` es el candado humano (`isLockedLink`, `lib/sessions/session-project-locks.ts`),
  que deja al clasificador sin tocar ese vínculo.
  - *De la exploración* cuenta la reunión que una persona unió a una sesión o la de su evento del calendario
    (`sesionUnidaALaReunion`), con el número de la sesión que muestra la exploración. La ligada solo por la fecha no:
    es una adivinanza. *De los hechos*, los pendientes que el registro rutea a la pieza, por `novedadesDelProyecto`
    (solo con `SEGUIMIENTO_HECHOS=1` y su SQL), aunque el documento todavía no esté generado. Una sugerencia sale
    siempre de la membresía del proyecto (el chokepoint): nunca una reunión de otro cliente, ni una elegida, ni una
    desestimada, ni una que todavía no ocurrió. Como mucho 10.
  - *En el panel* van arriba de la lista, una sola vez: «Nexus sugiere N reuniones para …» con «Usar todas», y una fila
    por reunión con su motivo, «Descartar» y «Usar». La línea cerrada dice «N elegidas · M sugeridas». En el buscador,
    una desestimada viene marcada «la descartaste» y se puede elegir igual.
  - *El buscador ofrece las demás reuniones del proyecto* (vínculo vivo, ni elegidas ni sugeridas), bajo «Del
    proyecto», como el cronograma, y debajo las 100 más recientes del cliente. *Por qué:* desde que solo entra lo
    elegido, una reunión del proyecto que quedaba fuera de esas 100 no se podía elegir de ninguna forma («Buscar en tu
    calendario» saca a propósito las que ya son del proyecto). Medido el 2026-10-10: 58 reuniones vinculadas en 9
    proyectos (Grupo Inve, kölbi, Smarteam), 48 con contenido.
- **Los tres valores de cada columna:** «Usar» es el clic de una persona y escribe `true`; «Descartar» escribe `false`,
  que no pone candado (los `false` de antes, la X sobre una sugerida, se leen igual); la X sobre una elegida vuelve a
  `null`, como en el cronograma. Sin tocar, una reunión no entra. Una desestimada no se sugiere más **mientras exista el
  vínculo**: el `false` no pone candado, así que el clasificador puede borrar un vínculo que nadie eligió y recrearlo
  vacío, y ahí puede volver a sugerirse. Se aceptó a propósito (guardar el descarte aparte es otra tabla o el JSON del
  canvas); el botón dice «Por ahora no la sugiere más».
- **Elegir no toca `source`**: sobre un vínculo que ya existe, la puerta escribe solo el afinado de ese documento, así
  la X después suelta el candado. Para que una elegida de antes del piso del proyecto (lib/sessions/piso-del-proyecto.ts,
  que solo deja pasar los vínculos manuales) se lea, el lector la exime del piso **en ese documento**
  (`getProjectMemberSessions(projectId, { elegidaEn })`); la membresía del resto (el handoff, la memoria, las
  sugerencias) sigue con el piso. Sin eso, el panel la mostraba elegida y el documento decía «Nadie eligió reuniones».
- **Las elegidas se leen enteras, con tope**: 160.000 caracteres en total, 60.000 por reunión y 6 enteras como máximo, las
  más recientes; las siguientes van en resumen (2.000 cada una, dentro del mismo total) y, pasadas las 24
  (`MAX_ELEGIDAS_A_LEER`, número propio), no entran. **Primero se apartan las que no tienen nada que leer**
  (transcripción, notas de Gemini o minuta; en un documento del cliente, la minuta cuenta solo si está revisada): una
  vacía no ocupa uno de los 6 lugares ni le quita espacio a otra. Si no se leyeron todas, la primera línea del bloque,
  después de la regla, dice cuántas de cuántas y por qué («Se leyeron 24 de las 30…: 2 no dejaron transcripción… y 4,
  las más viejas, no entraron por espacio»). Cada reunión entera va con lo que se dijo: si no entra, el principio y el
  final de la transcripción (ahí se acuerda qué sigue), cortados en la base. Las notas de Gemini solo si no hay
  transcripción. El resto llega por la memoria, nunca como transcripción; la memoria no lee las que se desestimaron
  para ese documento.
- **La minuta de una elegida, con la regla de la memoria** (`minutaParaElDocumento`): en los cinco documentos del
  cliente va solo la minuta revisada, y de ella solo los acuerdos y las decisiones, sin los que traen un monto. Nunca su
  resumen, sus riesgos (una valoración interna, con severidad) ni una minuta en borrador. La memoria saca además los que
  hablan de negociación; acá no, porque la transcripción que va al lado ya lleva la regla adelante. La ejecución
  (interna) la lee entera.
- **Sin reuniones que leer, el mensaje lo dice** (`avisoSinReuniones`): «Nadie eligió reuniones para …», donde iría el
  bloque de reuniones. Sin esa línea, el modelo no distingue «no hubo reuniones» de «nadie las eligió». En la entrega,
  sin reuniones la sección de impacto va vacía (sus cifras salen de lo que se dijo); el panel lo avisa. **Pendiente de
  Elías:** si eso alcanza o si el impacto puede salir de las cifras de las minutas revisadas que trae la memoria.
- **La frontera, también al final del mensaje** (`cierreDeFronteraDelDocumento`): el bloque de reuniones puede traer
  160.000 caracteres de transcripción y la regla va al principio; los cinco documentos del cliente (y la ejecución, con
  la suya) la repiten justo antes de la instrucción final, solo con reuniones o notas. Con transcripciones enteras suma
  una línea: el final de una transcripción suele ser lo que el equipo habló cuando el cliente ya había colgado, y llega
  rotulado «CON EL CLIENTE» (la sala se decide por quién estuvo, no por quién hablaba). ⚠ **Riesgo aceptado hasta
  nuevo aviso**: la generación no revisa lo que sale (la red «⚠ revisa» de `lineasConFronteraDeDocumento` es solo del
  chat), así que un precio dicho en una reunión que la IA igual copie llega al documento sin marca, y lo ve el CSE al
  revisarlo antes de publicar.
- **«Mejorar con IA» del diagnóstico lee las elegidas en resumen y sin búsqueda web** (canvas-assist,
  `fuentesDelDiagnostico(projectId, { paraElAssist: true })`, `maxWebSearches: 0`): manda el contexto entero en cada
  pedido, y 160.000 caracteres de transcripción por pedido no se justifican para mejorar una sección; y lo dicho por
  terceros en una reunión no puede terminar en una consulta al buscador. El botón no se muestra donde hay chat, pero la
  ruta sigue abierta para quien puede regenerar.
- **Aplica a seis documentos**: kickoff, diagnóstico, planificación, ejecución, integraciones y entrega. La exploración
  pasa a sus sesiones en la etapa A. El handoff y el cronograma no cambian.
- ~~**Sin backfill**: no se escribe `true` en ninguna reunión que hoy entra por sugerencia.~~ **Corregido el
  2026-10-10** (decisión de Elías: «que los clientes queden bien»): hay una migración acotada, ver «La migración
  (2026-10-10)» abajo. El porqué de la regla vieja —escribir `true` en masa le pone candado a vínculos que nadie
  eligió— sigue en pie, y por eso la migración se limita a 6 reuniones por documento con contenido.
- **Va después de las etapas 3, 4, 6 y A.** La memoria ya está conectada también al diagnóstico y a la planificación
  (sin la ficha ni los procesos, que ya leen; el diagnóstico tampoco los resultados). Antes del deploy,
  `scripts/medir-contexto-de-documentos.ts` (solo lectura) dice cuántas reuniones alimentan hoy cada documento, y se
  avisa al equipo: desde ese día un documento sin reuniones elegidas se genera con la memoria y sin transcripciones, y
  **regenerar uno de los que ya están pierde todo lo que sacaba de las reuniones** (en los documentos del cliente la
  memoria solo trae las minutas revisadas, y casi no hay): antes de regenerar, elegir las reuniones que importan.
  (Desde el 2026-10-10 eso lo hace la migración de abajo para los documentos que ya tienen contenido.)
- **Sin SQL.**

### La migración (2026-10-10)

> Elías, al ver que con la etapa 7 ningún documento iba a tener reuniones elegidas: «Realmente me interesa que los
> clientes queden bien, como entender lo que actualmente llevan y migrarlo a esta nueva arquitectura».

- **Por qué quedaban en cero.** El modo sugerido no guardaba nada: entraba sola toda reunión con el cliente y nadie tuvo
  que elegir nunca (0 vínculos en `true` en las seis columnas, medido el 2026-10-10). Con «solo las elegidas», regenerar
  cualquier documento lo dejaba sin reuniones, y el día del deploy tampoco había sugerencias (la tabla de hechos no
  existe en producción y las exploraciones de proyecto no tenían reuniones unidas a sus sesiones).
- **Qué leía cada documento, de verdad.** El diagnóstico, la planificación, la ejecución y la entrega leían en modo
  sugerido. **El kickoff y las integraciones leían solo el handoff hasta el 2026-10-07** (674d9159, «El kickoff deja de
  leer solo el handoff»): lo que tienen generado de antes no salió de ninguna reunión. Medido en producción el
  2026-10-10, de los documentos con contenido, 17 de 18 kickoffs y 37 de 38 integraciones se generaron antes de esa
  fecha. Migrarles 6 transcripciones enteras no es «lo que llevaban», es contenido nuevo (y en un documento que ve el
  cliente, con reuniones con Ventas y precios), así que **no se migran**: les quedan las sugerencias. La fecha vive en
  `DESDE_QUE_LEE_REUNIONES` y la última generación es el bloque más nuevo escrito por la IA. `--tambien-los-que-no-leian`
  los incluye si Elías decide lo contrario.
- **Qué hace `scripts/migrar-reuniones-de-los-documentos.ts` (parte A).** Por proyecto activo y por cada uno de los seis
  documentos que YA tiene contenido generado, calcula qué reuniones leía con la regla vieja (la que conserva la
  exploración: membresía del chokepoint con su piso, con el cliente, nadie la sacó, ya ocurrida). **Primero aparta las
  que no tienen nada que leer** (`tieneQueLeer`, la misma regla del lector nuevo: transcripción, notas de Gemini o minuta;
  en un documento del cliente, la minuta revisada): una vacía no ocupa un lugar ni le pone el candado a una reunión para
  nada. De las demás elige (`true`) las **6 más recientes** (`MIGRADAS_POR_DOCUMENTO` = `MAX_ELEGIDAS_ENTERAS`, las que
  el lector nuevo lee enteras). Solo donde la columna está en `null`, y solo si nadie eligió nada en ese documento (si ya
  hay un `true`, una persona ya decidió). Nunca toca un `false` ni un `true`, ni `source`, `reviewedAt`, `included` u
  otra columna. La regla vive pura en `lib/contexto/migracion-de-reuniones.ts`, con su prueba. Simulacro del 2026-10-10
  (solo lectura): **81 proyectos activos revisados, 69 documentos con contenido; 85 elecciones en 45 vínculos y 45
  reuniones distintas** (35 en diagnósticos, 24 en planificaciones, 12 en ejecuciones, 6 en una entrega y 4 en cada
  uno: el kickoff y las integraciones generados después del 2026-10-07); 313 reuniones vacías se saltaron; 11 de las
  migradas tuvieron a alguien de Ventas en la sala (la frontera de la etapa 4 sigue en el texto).
- **Una vez por documento y por exploración.** Lo migrado queda anotado en `CronJobState`
  («migrar-reuniones-de-los-documentos», `MarcaDeLaMigracion`), en la misma transacción que la escritura, y una corrida
  siguiente no lo vuelve a tocar. Sin eso, correrla otra vez después de que una persona deshizo algo lo volvía a hacer:
  la X sobre una elegida escribe `null` (no `false`), y «Sacar» de una sesión de la exploración no deja la reunión en
  `fuera`.
- **La consecuencia aceptada: esas reuniones dejan de reclasificarse.** Un `true` es el candado humano
  (`isLockedLink`), y el candado congela la **reunión entera**, no solo el vínculo: el clasificador
  (`reclassifyClientSessions`) saltea toda reunión con algún vínculo con candado, y `classifySessionToProjects` conserva
  como primario el vínculo con candado. Una reunión migrada ya no llega sola a un proyecto nuevo del cliente cuando nace
  (el caso RC Inmobiliaria que el reclasificador existe para cubrir). En el simulacro, **36 de las 45 reuniones** tenían
  todos sus vínculos libres y quedan congeladas, las 36 dentro de la ventana de 90 días del clasificador; el script las
  cuenta antes de escribir. *Por qué se acepta:* esas reuniones alimentaban el documento sin que nadie lo cuestionara, y
  sin la migración el documento se regeneraba sin ellas. *Por qué solo 6:* son las que se leen enteras; más no mejora el
  documento (irían en resumen) y cada una de más es una reunión congelada sin que nadie la haya elegido. La X sobre una
  elegida la vuelve a `null` y suelta el candado. **Pendiente de Elías** si acepta el congelamiento por reunión (la otra
  opción es correr el reclasificador de los clientes con proyectos nuevos antes de migrar).
- **Lo que no se migra queda como sugerencia** («Reunión con el cliente en este proyecto»,
  `lib/contexto/sugerencias-del-documento.ts`): las reuniones que la regla vieja leía y no están elegidas ni
  desestimadas, las 8 más recientes, después de las sesiones de la exploración y de los hechos, sin repetirlas. Se
  calculan al leer y nunca escriben. Con eso el panel tiene sugerencias desde el día del deploy, también en un proyecto
  nuevo y en un documento sin generar. Sin los dominios de Smarteam (no se sabe la sala), esta fuente no sugiere nada.
  ⚠ **La X sobre una elegida la devuelve a sugerida**: vuelve a `null`, y como suele ser de las más recientes, reaparece
  arriba en el acto. Para que no vuelva, «Descartar». **Pendiente de Elías:** aceptarlo así o que la X sobre una elegida
  escriba `false` en los seis documentos.
- **Las exploraciones (parte B).** En cada exploración viva de un proyecto y en cada preventa viva de una empresa que no
  es prospecto (en el prospecto las sesiones entran solas), las reuniones que el agente ya leyó —o que una persona
  eligió antes de la etapa A— y no son de ninguna sesión se proponen como sesiones unidas a su reunión, como
  «+ Agregar sesión», sin pasar el tope (`MAX_SESIONES`; si no entran todas, las más recientes) y en orden por fecha.
  Se escriben por la mutación de la ruta (`aplicarCambios` › `agregarSesion`, con su versión); ante un conflicto se
  recalcula sobre la fila nueva, así lo que una persona sacó o ligó mientras tanto no vuelve. No pasan: lo sumado a
  mano (ya se lee sin sesión), HubSpot en un proyecto, lo que no ocurrió, lo de antes del corte de la preventa (un mes
  antes del alta: así no vuelven las lecturas de 2023 de Grupo Servica; **salvo la que una persona eligió a mano en el
  buscador**, que existía justo para sumar reuniones viejas), lo de otra empresa, lo de puertas adentro, **toda reunión
  de HubSpot de la preventa** (la foto guardada no trae los asistentes: no se sabe si fue la preparación del equipo), lo
  que alguien sacó y la reunión de HubSpot cuya gemela de Meet ya está. La regla pura vive en
  `lib/exploraciones/migracion-de-sesiones.ts`. Simulacro del 2026-10-10: 3 sesiones nuevas (2 en Cicadex, 1 en Grupo
  Servica) en las 5 exploraciones vivas que aplican.
- **Cuándo se corre**: una sola ventana, justo después de los SQL y antes del deploy, antes de que alguien regenere un
  documento (RUNBOOK › «Migrar las reuniones de los documentos»).

## Cuestionarios es un artefacto propio, entre Kickoff y Exploración (2026-10-11)

> Decisión de Elías: los cuestionarios que contesta el cliente (antes «Cuestionarios», debajo de las sesiones de
> Exploración, también llamado «cuestionario previo») pasan a ser un artefacto propio, después del Kickoff y antes de
> Exploración. Es recomendado, no requerido: no frena ninguna etapa. Lleva tres tipos: el táctico, el de la escala y
> uno nuevo de estrategia. «Informe anterior» se queda en Exploración.

**El cuestionario de estrategia** (`lib/cuestionario/estrategia.ts`, tipo `estrategia`; `Cuestionario.tipo` es texto:
sin SQL):

- **Siete preguntas, una pestaña**: el desafío central, los resultados que necesitan (en cifras y para cuándo), lo que
  les impide llegar, lo que ya intentaron (opcional), qué pasa si no lo resuelven, cómo miden hoy el éxito y las tres
  prioridades del año. El tope es 8 (lo vigila `estrategia.test.ts`). Los ids son estables (`est-*`): la respuesta se
  guarda por id y la ficha lee por id. A qué tarjeta apunta cada pregunta va en `ref`, que el cliente no ve.
- **Va al cliente como los otros**: uno por persona, por su enlace, con publicar y cerrar. El CSE lo arma desde el
  mismo selector («+ Estrategia») y puede editar sus preguntas, como el táctico. No depende de los hubs.
- **Se prellena con la misma mecánica que el táctico** (`prellenar.ts`): el handoff con la allowlist del kickoff, el
  kickoff y, solo en estrategia, lo que Nexus ya sabe de la cuenta por la memoria (lector `cuestionario`, alcance
  CLIENTE: la ficha confirmada, sin lo interno ni la postura de las personas; declarado en
  `lib/memoria/consumidores.ts`). Mismas reglas de frontera: lo lee la persona sin que nadie lo revise, así que nada
  interno, nada de precios ni de lo que se habló sin el cliente.
- **⛔ Lo prellenado que nadie confirmó es una suposición, no un dato del cliente.** En el bloque que leen los agentes
  (`contexto.ts`, la fuente Q0 de la exploración del proyecto, que cuenta como «lo dijo el cliente») no va como
  respuesta: va a lo pendiente, dicho así. Lo que cargó el CSE va rotulado «no lo escribió la persona». *Por qué solo
  en estrategia:* el táctico ya lo rotula «SIN confirmar» y cambiarlo movería lo que leen hoy la planificación y el
  diagnóstico; en estrategia la respuesta es justo lo que la exploración toma como voz del cliente.
- **Lo que el cliente confirma alimenta tres lugares**:
  · la exploración del proyecto: el bloque de estrategia va PRIMERO en Q0, con cada respuesta rotulada con su tarjeta
    (Retos, Resultados que persigue, Obstáculos), para que el agente las proponga como lo que dijo el cliente;
  · el diagnóstico: el mismo bloque, que dice que es la voz del cliente para el desafío central y los objetivos;
  · la ficha, como PROPUESTA, al ENVIAR la pestaña (`externo.ts` › `estrategiaALaFicha`, sin IA, puerta 7 de
    `ficha-propuesta.ts`): solo «Retos estratégicos» (el desafío, «Obstáculo:», «Prioridad del año:»), con la fuente
    «Cuestionario · Estrategia · <persona>» y el origen «Cuestionario» (`ORIGENES_DE_LA_FICHA`; «Lo que sabe la IA» lo
    nombra «del cuestionario de estrategia»). Suma a lo que la ficha ya dice sin repetir. Los RESULTADOS que necesitan
    no van a la ficha de ninguna forma: ni como «Resultados que persigue» (la ficha no lo acepta desde afuera: sale de
    los resultados confirmados de cada proyecto) ni escondidos en los retos con otro rótulo (`A_LOS_RETOS` no tiene
    `est-resultados`, y una prueba lo vigila); quedan en la exploración y el diagnóstico. Lo prellenado sin confirmar
    no va. Si la ficha falla, el envío del cliente igual se guarda.
- **Su estructura**: se editan sus preguntas, pero no se le agregan pestañas. El bloque que leen los agentes toma todas
  sus pestañas como estrategia del cliente, y una pestaña de la plantilla táctica mezclaría lo táctico ahí (y perdería
  las etapas en silencio). `editarEstructura` responde 409 (`porQueNoEntraEnEstrategia`).
- **«Comparar» la pone lado a lado**, como el táctico (`comparar.ts`): dos personas que dicen desafíos o prioridades
  distintos es donde un desacuerdo más importa.

**El cargo de cada persona lo establece el equipo, no la persona del cliente** (decisión de Elías): al agregarla con
correo, Nexus busca el contacto en HubSpot (`lib/hubspot/contacto-por-correo.ts`, solo lee) y trae su cargo
(`jobtitle`) y, si no se escribió, su nombre; lo escrito manda (`lib/cuestionario/persona.ts`). Si HubSpot no lo tiene,
no lo encuentra o falla, la persona se agrega igual, sin cargo, y la pantalla lo dice en una línea; el CSE lo escribe o
lo cambia en su fila («Agregar cargo» / «Editar cargo», acción `editar_persona`). Nada se escribe en HubSpot y nada se
le pregunta a la persona del cliente.

**El artefacto: el riel, el panel y «Qué sigue»** (lo que cambia en la ficha del cliente):

- **Es una pieza del registro que no vive en un canvas** (`questionnaires`, «Cuestionarios»,
  `lib/pieces/registry.ts`). Su contenido está en sus propias tablas (`Cuestionario` y sus pestañas), no en un
  `ProjectCanvas`, así que el registro ganó el campo `hasCanvas`. Con `false`, la pieza no se activa ni se apaga desde
  el riel (`ensurePieceCanvas` la rechaza), `resolvePieceStates` no la ofrece, el checklist del widget no la cuenta, no
  se imprime (exenta en `lib/print/camino-generico.test.ts`) y no tiene chat ni versiones. *Por qué un campo y no un
  canvas vacío:* sería una fila por proyecto que nadie escribe, y el punto del riel mediría esa fila y no los
  cuestionarios. Sin SQL.
- **Va en la etapa EXPLORACION, antes de la exploración** (`STAGE_FLOW`: `["questionnaires", "exploration"]`, y lo
  mismo en `ORDEN_DE_PRESENTACION`). La primaria sigue siendo la exploración: el gate `ENTENDIMIENTO_CERRADO` no cambia
  y `lib/lifecycle/stage-engine.ts` no se tocó. Las preventas no la tienen.
- **Aparece en el riel cuando el proyecto tiene la Exploración**, o ya tiene algún cuestionario, en cualquier ciclo: las
  mismas condiciones en que se veía cuando colgaba de la fila «Exploración». ⚠ No mira el ciclo: el riel arma sus filas
  con el orden del ciclo completo y la Exploración nace con casi todos los proyectos (`createdWithProject`), así que un
  recurrente o un Web la ven igual que antes. No tiene «Activar»: si no corresponde, no se lista, y una dirección con
  `?canvas=questionnaires` en un proyecto donde no corresponde vuelve al Resumen (se decide con el estado ya leído).
- **Su fila dice cómo van, siempre escrito** (`lib/pieces/estado-de-cuestionarios.ts`): «sin enviar» (ninguno
  publicado), «enviado» (publicados, nadie respondió) o «respondido N de M» (M son los publicados; respondido = cerrado
  por el CSE o con todas sus pestañas enviadas). El punto se pone verde con el primero publicado. Lo trae el listado de
  canvases (`/api/projects/[id]/canvases`, campo `cuestionarios`): el primer pintado no lo tiene y llega con el refetch,
  que se repite al entrar y al salir de la pieza, y cuando `CuestionarioPanel` avisa con `onCambio` que publicó, ocultó,
  cerró, reabrió, borró o reasignó uno (así la fila y el «Qué sigue» se ponen al día sin salir de la pieza).
- **Al abrirla, el centro monta `CuestionarioPanel`** (el mismo de antes, sin cambios) y el panel de la derecha, el
  «Qué sigue» del proyecto. La dirección es `?canvas=questionnaires`: `vistaDeLaUrl` resuelve el slug de una pieza sin
  canvas a `{ tipo: "pieza" }` sin esperar a la lista. Sin «Exportar PDF» ni «Acceso del cliente»: cada persona tiene su
  enlace. «Informe anterior» sigue colgando de la Exploración.
- **«Qué sigue» la recomienda SOLO en el Handoff y en la Exploración** (se mandan después del kickoff y antes de la
  exploración), con el kickoff generado y al día (sin «desactualizado» ni novedades: el prellenado lo lee, y no se
  invita a mandarle al cliente respuestas sacadas de un kickoff viejo) y ningún cuestionario publicado: «Manda los
  cuestionarios al cliente…», con «Abrir «Cuestionarios»» y «Ahora no» (`lib/clients/que-sigue-del-proyecto.ts`). Ahí va
  después del aviso de «desactualizado» y de las novedades del documento de la etapa, y antes de «genera
  «Exploración»». En las demás etapas, y sin etapa reconocida, no sale: casi todos los proyectos que ya existen tienen
  kickoff y ningún cuestionario, y pedírselo a uno en Adopción le ganaba al resumen y a la próxima reunión. Se va sola
  al publicar uno o con «Ahora no». «Ahora no» solo se le muestra a quien puede escribir los cuestionarios (el listado
  de canvases trae `puedeEditar`): a los demás el PATCH les respondería 403.
- **El «Ahora no» se guarda en el canvas del Kickoff**, como entry reservada `__cuestionarios` del Json
  `ProjectCanvas.sections`, con quién y cuándo (el mismo contrato que el `__doc` de las instrucciones: el doble guion
  bajo dice «no soy una sección»). Lo escribe `PATCH /api/projects/[id]/cuestionarios-sugerencia`, con el gate de
  escribir cuestionarios (`guardProjectHandoffAccess`), tocando solo esa entry. Sin SQL. *Por qué el Kickoff:* toda
  pieza de proyecto con canvas ya acepta entries reservadas y la sugerencia nace de que el kickoff esté generado.
- **El recorrido** pasa a ser propio («Cuestionarios», `ficha-cuestionarios`); el de la exploración subió a la versión 6
  y ya no los nombra.

## Servicios recurrentes (SmartLoop): proyecto de prueba y el ciclo como pieza (2026-10-11)

> Pedido de Elías: llevar en Nexus los servicios recurrentes de SmartLoop, tanto los vendidos con un plan
> (FACO) como los que pasaron de temporal a recurrente sin plan. El plan acordado, por etapas, está en
> `docs/smartloop-plan.md`; la fuente de verdad del servicio es su documento de proceso (v0.3.0).

- **Se prueba con un proyecto de prueba, en producción** (`Project.esPrueba`, `pruebaDeProjectId`). Cuelga del cliente
  real y lee lo suyo; no existe en HubSpot. El átomo `NO_ES_PRUEBA` de `lib/projects/scope.ts` lo saca de cartera,
  Cobranza, el clasificador y el dueño de la cuenta, y se sigue navegando (rama de NAVEGABLE). A mano: la adopción por
  nombre del sync de HubSpot, la próxima reunión del índice, la memoria e historia del cliente, el piso de reuniones y
  los candados del clasificador (sus vínculos tienen `source = "prueba"`: el clasificador no los borra ni los cuenta).
  No se comparte con el cliente (409 al crear el acceso) y no tiene encuesta de etapa. *Por qué:* probar con datos
  reales sin tocar el proyecto real ni la cartera. Se crea con `scripts/crear-proyecto-de-prueba.ts`.
- **SmartLoop es una fila de la tabla de pipelines** (`942509592`, etapas transcritas del portal) con
  `servicioRecurrente: "smartloop"`. Un servicio recurrente nuevo es otra fila más su guía en `lib/servicios`: no código
  nuevo. El pipeline espeja las cinco etapas del método (Elías agregó «Aprendizaje» el mismo día) y
  «Cancelado» cierra. SmartLoop **no se da de alta desde Nexus** todavía (formulario y API): los proyectos reales llegan
  con la migración desde «Continuidad». Cuenta como pipeline de Customer Success para decidir el CSE de la cuenta.
- **El ciclo es una tabla propia** (`CicloDeProyecto`: número, tramo, fechas, meta, etapa, estado; uno abierto por
  proyecto) y **el caso de uso también** (`CasoDeUso`, de la empresa: puede estar sugerido, en el plan o en un ciclo, y
  mueve varias dimensiones de la escala). El compromiso (`Project.compromiso`) es opcional: mes a mes, seis meses o un
  año. SQL `2026-10-11-ciclos-y-casos-de-uso.sql`.
- **La etapa de un proyecto recurrente es la de su ciclo abierto** («Ciclo 1 · Implementación»), con la línea de las
  cinco etapas del método (`lib/lifecycle/load.ts`, rama de pipeline; no se tocó cómo decide el motor de 8 etapas). En
  un proyecto que existe en HubSpot la etapa sale de allá, por nombre; en uno que no (la prueba), del ciclo.
- **El ciclo es un GRUPO del riel, con un artefacto por cada etapa que produce algo** (Elías, el mismo día: «¿no es
  mejor que cada etapa del ciclo esté como un artefacto en el menú?»; una sola página «Ciclo» con un formulario adelante
  era más pesada que el resto de Nexus). El grupo «Ciclo 1 · tramo · fechas» lleva **Diagnóstico**, **Plan del ciclo**
  (meta y casos de uso), **Cronograma** y **Aprendizaje**; debajo, «Insumos del diagnóstico»: Cuestionarios y
  Exploración. Implementación y Adopción NO son artefactos: no producen un documento, son trabajo que se sigue en el
  Cronograma, y su etapa la marca él (`PIEZA_DE_LA_ETAPA`). Los artefactos del ciclo no viven en un canvas
  (`hasCanvas: false`). No hay formulario para abrir el ciclo: el primero nace solo al abrir un artefacto, y el tramo y
  las fechas se completan en la cabecera del ciclo, que va arriba de cada artefacto (también del Cronograma). Un servicio
  recurrente no lleva kickoff, diagnóstico, planificación ni entrega de una implementación. El traspaso muestra
  «Servicio: SmartLoop» y no pide el tipo de implementación.
- **La guía del CSE sale de la sección 5 del documento de proceso** (`lib/servicios/smartloop.ts`), arriba del artefacto
  de cada etapa: qué haces,
  qué tiene que quedar y la señal de que se saltó. Lo que Nexus puede comprobar lleva marca (hoy: casos con criterio,
  meta y fechas); lo demás va sin marca, nunca como hecho. La señal se prende solo si Nexus la ve (un caso sin criterio
  después de planificar). El «Qué sigue» del proyecto dice «Abre el ciclo N» o lo primero que falta.
- **Leer el ciclo pide acceso al proyecto; cambiarlo, editar el cronograma** (`guardTimelineEdit`). Quitar un caso de
  uso lo deja descartado, no lo borra.

## El catálogo de casos de uso: resultados atados a la escala, en el repo (2026-10-12)

> Pedido de Elías: un catálogo mínimo de casos de uso para la preventa y las propuestas, que diga el RESULTADO que
> obtiene el cliente y no el trabajo, con HubSpot, Insider y la creación de activos, apoyado en la escala 8.8. Lo revisa
> el equipo en Nexus y sugiere cambios o casos nuevos. Diseño aprobado: «Catálogo de casos de uso» (Claude Design,
> tableros Main, EnLaEscala, Caso, Sugerir y Proponer).

- **El catálogo vive en el repo** (`lib/casos-de-uso/catalogo.ts`, 26 casos), no en la tabla `UseCase`. *Por qué:* cada
  caso cita criterios de la escala y `catalogo.test.ts` verifica contra la escala del repo que existan, que caigan en una
  dimensión que el caso dice mover y entre su nivel de partida y el de llegada; en la base no hay prueba que lo sostenga.
  La tabla estaba vacía en producción (medido el 2026-10-11), así que su pantalla de administración se retiró; sus rutas
  y `BusinessCaseUseCase` quedan para la fase 2 (el precio).
- **Cuatro tipos, los de la escala** («Land and expand»): aterrizar, reactivar, expandir y complementario. Uno que
  aterriza o reactiva llega a Funcional; uno complementario no cita criterios.
- **Dos vistas**: «Por tipo» (tarjetas con el salto de nivel por área, filtros por área, herramienta, tipo, servicio y
  nivel de partida, y un buscador que mira también lo que dice el cliente) y «En la escala» (cuántos casos suben cada
  dimensión, y los huecos). La vista y la dimensión van en la dirección. Cada caso tiene su página
  (`/sales/use-cases/<id>`) con los criterios palabra por palabra de la escala PUBLICADA. La nota interna (`aviso`) no
  sale en ninguna pantalla ni le llega al agente.
- **Se sugiere por Feedback, no se edita en Nexus (v1).** «Sugerir un cambio» abre el panel con el caso y la parte;
  «Proponer un caso nuevo», un formulario propio sin captura. Los dos son reportes comunes: el caso va escrito al
  principio del texto (`lib/casos-de-uso/feedback.ts`), sin columna nueva. *Por qué:* el catálogo es código; una edición
  en pantalla no tendría dónde guardarse.
- **Lo ve quien tiene Preventa** (`preventa.read`, también en el menú), además de Ventas: lo usa la preventa.
- **La preventa parte del catálogo.** El agente de casos recibe los casos que tocan las áreas en juego y usa uno si calza
  (su id en `catalogo` y su título tal cual: el código pone el título, no el modelo); propone uno propio solo si ninguno
  calza. Un caso del catálogo se guarda como `cat-<id>` (`lib/casos-de-uso/en-la-preventa.ts`): no es un caso libre
  (`ia-…`) ni una fila de `UseCase`, así que no crea `BusinessCaseUseCase` y entra a la propuesta como contexto, con lo
  que el cliente obtiene. La lista «Del catálogo de Smarteam» muestra los de las áreas en juego, con enlace a su ficha.
- **Fase 2, pendiente:** las licencias (hubs, ediciones y asientos) y el precio de cada caso.

## Servicios recurrentes: el ciclo con los documentos de siempre (2026-10-12)

> Elías, sobre el diseño del 2026-10-11 desplegado: usar el diseño que ya está codeado, optimizado para el CSE de un
> servicio recurrente. Supera, de la sección anterior, el ciclo como grupo con «Diagnóstico del ciclo» y «Plan del ciclo».

- **Importa la etapa del ciclo, no su número.** La tarjeta de la etapa del Resumen dice «Implementación · 3 de 5» con el
  ciclo y sus fechas al lado, y es el control del ciclo: «Cambiar etapa» hacia adelante o hacia atrás (solo sin HubSpot;
  con HubSpot, la encuesta), «Editar el ciclo» y lo que tiene que quedar en la etapa. Sin ciclo abierto, el proyecto está
  en Diagnóstico y el primero se abre solo al cambiar algo (antes decía «Sin ciclo abierto» y contradecía al «Qué sigue»).
- **La etapa que muestran los documentos es una sugerencia**: con el Diagnóstico escrito, Planificación; con la
  Planificación, Implementación. Nunca mueve la etapa sola.
- **El ciclo usa los documentos de siempre**: Exploración, Diagnóstico, Planificación, Integraciones y Entrega, más
  Adopción y Aprendizaje, propios del ciclo. El Cronograma va junto al Resumen. El plan del ciclo responde al
  Diagnóstico y a la Planificación: no hay un artefacto aparte.
- **Los casos de uso y la escala son secciones de la cuenta**, para toda empresa. La escala junta, por ahora, los
  niveles CONFIRMADOS de las exploraciones de la empresa (la preventa y la de cada proyecto) con su fecha; guardar la
  posición del Diagnóstico de cada ciclo es lo que sigue.
- **El Resumen de un recurrente suma lo que debe el cliente, los hitos y las sesiones fijas**, calculados al abrir: las
  tareas del cronograma con responsable CLIENTE, el fin de cada fase y las series del calendario con la empresa.
- **Las piezas del riel se ocultan** (en todo proyecto): `Project.piezasOcultas`, del proyecto y no de una persona, y
  cosmético (lo cambia cualquiera con acceso). No borra ni apaga nada: quedan en «Ver N piezas más».

## Preguntas sobre la cuenta: lo que Customer Success sabe de cada cliente (2026-10-13)

> Pedido de Elías: al entrar a un cliente, que cada persona de Customer Success responda «¿Este cliente tiene apertura
> a la asesoría?» (no solo nos pide cosas para implementar, también quiere nuestra guía). Con «No sé», volver a
> preguntar la primera vez que entra después de una semana. Y que todo quede guardado para analizarlo.

- **Es un módulo propio que Feedback configura** (`lib/encuestas-de-cuenta`), como los tiempos: no es un pedido de
  opinión (esos son sobre una pantalla, en texto libre, y terminan en un reporte). Las preguntas viven en un registro en
  el código (`preguntas.ts`); sumar una es una entrada. La primera, `apertura-asesoria`, nace **activa**.
- **Se le pregunta a cada persona, no a la cuenta**: CSE y CSL, en clientes de la cartera (`kind = CLIENTE`). Dos
  personas pueden ver distinto al mismo cliente, y eso también es un dato («Con respuestas distintas»).
- **Cuándo vuelve**: Sí o No cierran la pregunta para esa persona y ese cliente; «No sé» vuelve pasados 7 días, la
  primera vez que entra; «Ahora no», al día siguiente. Cambiar lo que pregunta es subir la `version`: se vuelve a
  preguntar a todos. La regla es pura (`decidirSiPreguntar`) y la decide el servidor.
- **Se guarda todo, sin pisar nada** (`RespuestaDeCuenta`, append-only, vigilado por `guardas.test.ts`): cada vez que se
  mostró, se respondió o se dejó para después, con la versión y el texto de la pregunta, el nombre del cliente
  congelado, quién, su rol, por qué ve al cliente (encargado en HubSpot o no) y el porqué opcional. La lectura vigente
  es la última respuesta de cada persona; la historia completa sale en el CSV (Feedback › Encuestas › Sobre los
  clientes › «Descargar CSV»). La fusión de fichas las muda.
- **La burbuja va abajo a la derecha de la ficha**, como el pedido de opinión, y nunca a la vez que él ni con el panel
  de Feedback abierto. Un «mostrada» por sesión del navegador (y el servidor no repite uno en 12 h).
- **No se cruza todavía con la casilla «Apertura a la asesoría» de la preventa** (`lib/exploraciones/casillas.ts`):
  es la misma pregunta hecha en otro momento (en la venta, por el vendedor). Juntarlas en la ficha es un paso aparte.
- Dirección (SUPER_ADMIN) no recibe la pregunta: la configura y ve los resultados.

## «Para ti» de Ventas: los negocios abiertos y la pregunta de cierre y monto (2026-10-14)

**Contexto.** Andrés Pinzón armó por fuera («Jarvis», con Todoist) lo que le faltaba a Nexus para vender: sus cierres
más cerca, su cartera y lo que le falta a cada negocio. Elías pidió llevarlo a Nexus, «Para ti» por equipo, empezando
por Ventas. El plan completo, con las respuestas de Elías, está en `docs/mi-dia-plan.md`; esta es la etapa 1.

- **Nexus copia los negocios ABIERTOS** (`NegocioAbierto`, `lib/ventas/sync-negocios-abiertos.ts`): los tres
  pipelines de venta propia, con dueño, empresa primaria, fecha de cierre, monto, probabilidad, el siguiente paso de
  HubSpot y la última y próxima actividad. Job `negocios-abiertos`, cada hora de 6:00 a 20:00. Solo lee HubSpot; la
  fila nunca se borra (cerrado = `abierto: false`), y una búsqueda que trae menos de la mitad no cierra nada. *Por qué
  una copia y no leer en vivo:* «Para ti» se mide en cada visita y cada minuto y medio para el número del menú.
- **La cartera de un vendedor** (decisión de Elías): las empresas donde es dueño en HubSpot más las empresas donde
  tiene un negocio abierto aunque no sea su dueño. El dueño de la empresa se mira solo en las empresas que están en
  Nexus (`Client.hubspotOwnerEmail`): Andrés es dueño de 8.844 empresas en HubSpot y casi todas son prospección.
- **El orden de la cartera** (decisión de Elías): con fecha de cierre y monto, a las que les falta uno de los dos,
  solo con negocio y sin negocio.
- **Nexus pregunta la fecha de cierre y el monto** de un negocio que no los tiene o tiene la fecha vencida, SOLO si se
  está trabajando (actividad en HubSpot o una reunión de Nexus en los últimos 14 días, o algo agendado en los
  próximos 14). Propone el valor con la frase copiada de las reuniones de Nexus o del registro de HubSpot
  (`lib/ventas/propuesta-de-cierre.ts`, Haiku, solo al abrir la pregunta). El vendedor lo usa o escribe otro, y se
  guarda PRIMERO en HubSpot; si HubSpot no lo acepta, Nexus no cambia nada. «Ahora no» la calla 7 días. *Por qué la
  frase:* lo que se escribe en HubSpot lo ve todo Ventas y alimenta el forecast; una cita inventada lo ensucia.
- **`hs_next_step` es solo una sugerencia** (decisión de Elías): HubSpot lo llena; Nexus lo muestra y lo lee como
  fuente, y nunca lo escribe. El siguiente paso de Nexus son las propiedades `siguiente_paso_*` (etapa 2).
- **Lo ponderado** es monto × probabilidad de los negocios en dólares que cierran en el año. Lo que está en otra
  moneda o sin monto se cuenta aparte: no se convierte.
- **La temperatura** (caliente, en movimiento, frío) es una regla inicial a calibrar con Ventas
  (`temperaturaDelNegocio`): frío = sin actividad en 21 días o el cierre vencido hace más de 30; caliente =
  probabilidad de 50 % o más, actividad en la semana y el cierre en 30 días o algo agendado en 7.
- **«Cierres más cerca» mira 60 días**, no 30: las fechas de cierre se ponen a fin de mes (23 de los 42 negocios de
  Andrés cerraban el 31 de octubre), así que con 30 días a mitad de mes se perdía el mes siguiente.
- **Lo ve quien tiene `ventas.read`** y algo propio (negocios, empresas o una meta). Escribir pide ser el dueño del
  negocio o `ventas.write`.
- **«Tu cartera» se lee en cuatro vistas** (pedido de Elías al verla, 2026-10-15: no decía qué traía, no se podía
  filtrar y no se sabía para qué servía). La unidad es la EMPRESA, con sus negocios adentro, y arriba se dice qué
  trae. *Para mover hoy*: una fila por cuenta con la acción más urgente (`accionDelNegocio`: completar, preparar,
  retomar, definir el siguiente paso). *Pipeline*: los negocios activos, primero los que tienen fecha y monto (el orden
  que pidió Elías). *Por limpiar*: pausados, cierres vencidos que nadie trabaja y negocios sin empresa en HubSpot.
  *Sin negocio*: las empresas propias sin nada abierto, clientes primero (expansión y reactivación). Con buscador y
  filtros (temperatura, cliente o prospecto, pipeline, de quién).
- **Un negocio pausado no se está vendiendo**: no entra al pipeline ni a lo ponderado, no se pregunta y va a «Por
  limpiar». Medido el 2026-10-14: 112 de los 201 negocios abiertos del portal estaban en «Pausados».
- **Un negocio sin empresa en HubSpot** toma el nombre de la empresa de su propio nombre («CCN - …» → «CCN») y va
  a «Por limpiar» (9 en el portal).
- **«Para ti» saluda**: «Buenos días, Andrés» (tardes desde las 12, noches desde las 19, hora de Costa Rica), la
  fecha entera y una línea con lo del día (cierres del mes, negocios por completar, la próxima actividad agendada).
- **SQL antes del deploy:** `scripts/sql/2026-10-14-negocios-abiertos.sql`. Carga inicial:
  `scripts/sync-negocios-abiertos.ts`.

## El siguiente paso de cada equipo, en Nexus y en HubSpot (2026-10-15)

> ⚠ **Enmendado el 2026-10-16** («Nexus, el sistema de trabajo de cada cuenta»): el siguiente paso de un equipo en una
> cuenta pasa a ser su próxima tarea abierta con fecha. HubSpot se sigue escribiendo igual, desde esa tarea.
> `SiguientePaso` no se retiró: pasó a ser la COPIA de lo que está escrito en HubSpot, con la tarea de la que salió
> (`tareaId`), porque la escritura con reintentos y la copia que vuelve de HubSpot ya vivían ahí. Ver «Cómo quedó la
> fase 0» en esa sección. Lo de abajo sigue valiendo para HubSpot.

**Contexto.** Etapa 2 de `docs/mi-dia-plan.md`. Decisiones de Elías (2026-10-14): un siguiente paso por equipo, con
qué, fecha y responsable, con los mismos nombres en empresas, negocios y proyectos de HubSpot; también en la empresa
(varios proyectos, retomar un excliente); `hs_next_step` solo como sugerencia; Marketing no lleva el suyo.

- **La historia vive en Nexus; lo de hoy, en HubSpot.** `SiguientePaso` guarda cada cambio (quién, cuándo, de dónde:
  persona, chat, reunión o HubSpot). El vigente de cada objeto y equipo (uno solo: índice único parcial del SQL) se
  escribe en `siguiente_paso_<equipo>`, `_fecha` y `_responsable` (`lib/siguiente-paso`). *Por qué no solo HubSpot:*
  HubSpot guarda el valor de hoy, no quién lo cambió ni qué decía antes.
- **Nexus primero, HubSpot después.** Al revés que la fecha de cierre (que se escribe primero en HubSpot): acá lo que
  importa no se puede perder si HubSpot no responde. El paso queda «pendiente» y el job `negocios-abiertos` lo
  reintenta cada hora, hasta 5 veces. La pantalla dice «sin escribir en HubSpot» mientras tanto.
- **Lo que alguien cambia en HubSpot vuelve.** La copia de los negocios abiertos lee las propiedades de los negocios y
  de las empresas de Nexus: lo distinto entra como un paso nuevo con fuente «hubspot», y lo borrado allá se da por
  hecho. Gana Nexus mientras no haya escrito lo suyo, o si lo escribió después de leer HubSpot
  (`decidirImportacion`). ⚠ Los proyectos (0-970) se escriben pero no se leen todavía.
- **Quién lo escribe:** cada persona, el de su equipo (Ventas; CSE y CSL, el de CS; Dev). Dirección, cualquiera (Marco
  vende). El objeto pide acceso a su cliente; un negocio sin cliente en Nexus, ser su dueño o `ventas.write`. Darlo por
  hecho lo puede quien lo lleva o alguien de su equipo, y lo borra de HubSpot.
- **El siguiente paso de un negocio es el de Nexus.** «Definir siguiente paso» (la acción de la cartera) sale cuando no
  hay uno de Ventas o se venció; si el negocio tiene `hs_next_step`, el diálogo lo ofrece con «Usar». Hasta el
  2026-10-14 un `hs_next_step` cualquiera contaba como siguiente paso.
- **Dónde se ve:** en la cartera de «Para ti» (cada negocio y cada empresa sin negocio), en el panel de «Información del
  cliente» (los de todos los equipos juntos: la cuenta, sus negocios abiertos y sus proyectos) y en «Para ti» como
  pendiente de quien lo lleva: con la fecha de hoy o vencida, «Para hoy»; en 7 días, «Esta semana»
  (`lib/para-ti/fuentes/siguientes-pasos.ts`).
- **Fusionar dos fichas los muda.** El de la cuenta apunta a la ficha por `objetoId` (sin FK): el script también lo
  muda, y si las dos tienen el del mismo equipo, queda el de la que sigue.
- **Todavía no:** la sugerencia desde la minuta de la última reunión y desde el chat (llegan con el chat, etapa 6) y
  «Agendar» un paso con fecha (etapa 4).
- **SQL antes del deploy:** `scripts/sql/2026-10-15-siguiente-paso.sql` (aplicado en producción el 2026-10-15).

## Las tareas de HubSpot viven en Tareas internas, en los dos sentidos (2026-10-15)

**Contexto.** Etapa 3 de `docs/mi-dia-plan.md`. Decisiones de Elías (2026-10-14): las tareas de HubSpot se leen y se
escriben, todas (también las de las secuencias), y cada una dice que viene de HubSpot. Ventas y CSE entran a Tareas.

- **Una tarea de HubSpot es una `Tarea` con `origen = "hubspot"`** (y su `hubspotTaskId`): la misma lista, semana, agenda
  y revisión que las de Nexus. Entran las abiertas de cada persona del equipo en HubSpot y las completadas esta semana.
  *Por qué no una lista aparte:* Andrés tenía dos listas (Jarvis y HubSpot) y eso es lo que vino a resolver.
- **Lo que nace en Nexus no se crea en HubSpot.** Solo lo que vino de HubSpot vuelve allá.
- **Se sincronizan cinco campos: título, estado, vencimiento, prioridad y responsable.** Cada tarea guarda lo último en
  que los dos lados estuvieron de acuerdo (`hubspotAcordado`) y cada copia compara los tres campo por campo: lo que
  cambió de un lado va al otro, y si cambiaron los dos, gana el último y queda en la historia de la tarea
  (`lib/tareas-hubspot/reglas.ts › comparar`). *Por qué no la fecha de modificación:* HubSpot la mueve solo (el día del
  vencimiento, una limpieza vieja), así que no dice quién cambió qué. Las notas de HubSpot entran como el contexto de la
  tarea (no se editan en Nexus); lo de la persona va en sus notas.
- **«Ya no se hará» no existe en HubSpot:** no se escribe allá. Una tarea borrada en HubSpot, o que pasó a alguien que no
  está en el equipo de Nexus, queda «Ya no se hará» con el motivo.
- **La semana sigue al vencimiento**: la del día en que vence (lo vencido, esta semana), por `semanaDestino` (nunca una
  semana revisada). Cambiar el vencimiento en HubSpot la mueve; moverla de semana en Nexus no cambia el vencimiento.
- **Para quién es** sale de lo que tiene asociado en HubSpot: el proyecto, si no el negocio, si no la empresa. Solo al
  crearla: después lo decide la persona.
- **El escritor único se mantiene.** `lib/tareas/mutaciones.ts` escribe lo que llega de HubSpot
  (`crearTareaDeHubspot`, `aplicarDesdeHubspot`, `anotarSincronizacionConHubspot`) y nunca llama a HubSpot; lo que va
  allá lo escribe `lib/tareas-hubspot/sync-server.ts`. Un cambio que una persona hace mientras se lee HubSpot gana: la
  copia no pisa una versión nueva y lo vuelve a comparar en la siguiente.
- **Cuándo:** el job `tareas-hubspot`, cada 15 minutos de 6:00 a 21:00, y al guardar una tarea de HubSpot en Nexus (la
  ruta la escribe allá enseguida). Si HubSpot no responde, la tarea lo dice («sin escribir allá») y el job reintenta.
- **Se ve de dónde viene:** el chip «HubSpot» (o «HubSpot · secuencia (paso N)») y, en el cajón, los enlaces a la tarea
  y al negocio, la empresa o el proyecto en HubSpot.
- **Tareas sale del piloto para Ventas y Customer Success** (`lib/tareas/menu.ts`: VENTAS, CSE y CSL).
- **SQL antes del deploy:** `scripts/sql/2026-10-15-tareas-de-hubspot.sql` (aplicado en producción el 2026-10-15). Carga
  inicial: `scripts/sync-tareas-de-hubspot.ts` (corrida el 2026-10-15: 13 tareas de Andrés).

## Cuándo se presenta cada documento: lo responde Customer Success, y queda quién (2026-10-14)

**Contexto.** Elías abrió un diagnóstico como Super Admin y le saltó el modal «¿Cuándo planeas presentarlo al
cliente?». La pregunta del 2026-10-07 se abría sola a cualquiera que pudiera generar el diagnóstico (también a
dirección), no dejaba decir que ya se presentó (la fecha no aceptaba días pasados) y guardaba solo la última respuesta
en un Json, sin la historia. Pidió: solo Customer Success, todos los documentos que se presentan, «Ya lo presenté», y
que quede registrado quién respondió.

- **Una pregunta para los cuatro documentos que se presentan**: kickoff, diagnóstico, planificación y entrega
  (`lib/presentaciones/reglas.ts`). Tres respuestas: una fecha (hoy o después), «Todavía no sé» (vuelve a la semana)
  y «Ya lo presenté» con el día real (hoy o antes). Pasada la fecha, se pregunta «¿Ya lo presentaste?». Solo el
  diagnóstico pide, dos días antes, confirmar que está terminado: es lo que avisa al vendedor (sin cambios).
- **Responde solo Customer Success**: el encargado del proyecto en HubSpot y quien generó el documento (la última
  corrida con persona), si son CSE o CSL y siguen en el equipo; si ninguno lo es, la CSL. La CSL siempre puede
  responder. Dirección ve la línea con quién respondió, pero no responde por el CSE: el servidor responde 403. Una
  cuenta de prueba («Test CSE…») no cuenta como persona del equipo.
- **Append-only** (`PresentacionDeDocumento`, SQL `2026-10-14-presentaciones-de-documentos.sql`): cada respuesta es una
  fila con quién, su rol, por qué le tocaba (encargado · generó · líder), el día y el documento. El estado sale de
  leer las filas en orden (`plegar`): nada se guarda dos veces. La fecha que lee Nexus en una reunión también es una
  fila (sin persona, con la reunión), y «Uso de Nexus» sabe quién la usó o la descartó. Una prueba frena cualquier
  `update` o `delete` de la tabla, y que la escriba alguien fuera de `lib/presentaciones/servidor.ts`.
- **Sin modal.** La línea va arriba del documento (la ve todo el que lo abre) y la pregunta, en una tarjeta abajo a la
  derecha que sale sola solo a quien le toca. «Ahora no» la calla 20 horas; el pendiente sigue en «Para ti».
- **Una tarjeta a la vez en ese rincón** (`components/ui/turno-de-tarjetas.ts`): primero «¿cuánto te tomó?» (responde
  a lo que la persona acaba de hacer), después esta y después la pregunta sobre la cuenta. Ninguna con el panel de
  Feedback abierto ni con un pedido de opinión.
- **Sin respuesta, se pregunta solo por un documento generado en los últimos 30 días.** Medido ese día: sin el tope, a
  un CSE le llegaban más de 30 pendientes por kickoffs de hace meses. Con el tope, de 1 a 5 por persona. Lo que ya se
  respondió (una fecha que pasó, el diagnóstico por confirmar) se sigue preguntando aunque el documento sea viejo.
- **«¿Cuánto te tomó?» no es otra encuesta**: «Ya lo presenté» hace la misma pregunta que publicar el documento, con la
  misma clave (`doc:<proyecto>:<documento>`), así cada documento se pregunta una sola vez. El momento pasó a llamarse
  «Al publicar o presentar un documento» y sigue apagado hasta que dirección lo active.
- **En el diagnóstico, «Ya lo presenté» no lo marca «Presentado»**: eso guarda la versión que vio el cliente y pide el
  hilo cerrado y la política revisada. La línea dice que se use «Presentar al cliente», en el estado del documento.
- **`Project.diagnosticoPresentacion` queda DEPRECATED** (eliminar después del 2026-11-15) y sin lectores. En
  producción tenía 0 filas el 2026-10-14; lo que llegue antes del deploy lo pasa a la tabla
  `scripts/migrar-presentacion-del-diagnostico.ts`.
- **Se mira y se descarga en Feedback › Encuestas › Automáticas**: las últimas respuestas con quién las dio, y el CSV
  con todas las filas (también las fechas que leyó Nexus y los «Ahora no»).

## El modelo de comisiones nuevo: se explica y se simula, no se paga (2026-10-15)

**Contexto.** Elías y Marco quieren cambiar las comisiones de Ventas, Customer Success y quien lidera (hoy Andrés gana un
5 % fijo se llegue o no a la meta). Finanzas › Modelos › Comisiones (`/finanzas/modelo-de-comisiones`) muestra la
propuesta en dos pestañas: «Cómo funciona» y «Simulación». Las reglas salen de la reunión del 2026-10-15.

- **Es solo para Super Admin** (`isCostosRole`, el mismo gate de Costos): la simulación muestra lo que vendió y lo que
  ganaría cada persona. Quién más la ve es una decisión pendiente.
- **Nada se paga ni se guarda.** Lo que paga hoy sigue en Comisiones de vendedor. Lo que se toca en la simulación (si
  una venta es licencia, el valor mensual de una licencia, el tope del bono) se pierde al recargar.
- **Las reglas viven en un solo lugar** (`lib/finanzas/modelo-comisiones/reglas.ts`, puro): las dos pestañas las leen,
  así una regla que cambia cambia la explicación y el cálculo.
- **La meta es mensual y la de HubSpot** (`lib/ventas/metas.ts`, que ahora devuelve cada tramo). HubSpot la guarda por
  trimestre y la reparte por días; Nexus hace la misma cuenta, así la meta de cada mes es la del desglose mensual de
  HubSpot. Solo cuentan los servicios: las licencias no suman, aunque HubSpot cuente las que tienen monto.
- **El equipo de ventas es quien tiene el rol de Ventas en Nexus** (hoy Andrés y Liz); lo lidera quien lleva más
  tiempo. Marco vende pero no cuenta para el bono de nadie. El bono de quien lidera sale de las metas de las personas
  que lidera, nunca de las suyas: US$ 500 al mes por persona que llega a su meta, desde el 70 %.
- **Quien lidera Customer Success gana un bono por el área, no por persona** (`BONO_DE_CUSTOMER_SUCCESS`): el 2 % de la
  meta de expansión del trimestre, con el mismo mínimo (70 %) y tope del de Ventas. *Por qué:* US$ 500 por cada uno de
  los 4 CSE sumaba un 18 % de costo sobre la expansión; así son el 5 % de los CSE más el 2 %, parejo en toda la escalera.
  Lo que vende Alex solo le da el 5 %; con un CSE, 2,5 % cada uno.
- **La meta de Customer Success sube por escalones: US$ 25.000, 33.000, 37.000 y 40.000 por trimestre.** La base es lo
  que la cartera compró en expansión de octubre de 2025 a septiembre de 2026 (US$ 134.215, unos US$ 33.500 por
  trimestre), la vendiera quien la vendiera: hasta ahora la cargaban Marco y Andrés, y desde este esquema la vende
  Customer Success. Por eso arranca abajo (traspaso), llega al ritmo de hoy y después crece. **Las renovaciones de
  contrato no cuentan** (decisión de Elías: renovar no es crecer); se sacaron las dos explícitas, ACCCSA «Contrato 2026»
  (US$ 25.200) y la renovación del Ministerio de Economía (US$ 5.720). Los montos son una foto de ese día, no un cálculo
  vivo, y se miden por trimestre porque la expansión llega a saltos.
- **La pestaña «Cómo funciona» se escribe para que la entienda cualquiera** (pedido de Elías): «de cada US$ 100 te
  llevas 3, 4 o 5», títulos como preguntas, sin jerga.
- **Una venta es de Ventas en sus primeros 6 meses desde la primera venta del cliente**, de cualquier vendedor; después,
  de quien creó el negocio (la simulación toma al dueño del trato en HubSpot).
- **Lo que falta decidir con Marco** está en la página, cada pregunta con su contexto, y se cierra antes de construir
  el pago.

## Comisiones que cuidan el valor de la cuenta (2026-10-18)

**Contexto.** Marco mostró que el esquema premia vender con descuento: un vendedor bajó una recurrencia de US$ 3.000 a
US$ 2.800 al mes, regaló US$ 2.400 al año y cobró el 100 % de la comisión. Iniciativa D del roadmap, pasos 1 a 4, en la
misma página del modelo (se explica y se simula, no se paga). Plan: `docs/comisiones-descuento-plan.md`.

- **Una venta vale lo único más 12 meses de lo recurrente, y el descuento sale de la base**: base = lo cerrado − lo
  descontado. El caso de Marco: 12 × 2.800 = 33.600, menos 2.400 = 31.200; al 5 %, US$ 1.560 en vez de US$ 1.680. Es la
  prueba central (`lib/finanzas/modelo-comisiones/valor-de-la-cuenta.test.ts`). Cuánto del descuento sale (entero, la
  mitad o nada) es una decisión de la simulación; la propuesta dice entero.
- **El descuento no baja lo que cuenta para la meta**: la meta mide lo que se cerró; el descuento solo baja lo que
  comisiona. **Lo recurrente pesa `FACTOR_DE_RECURRENCIA` (1,2) veces en la meta**, y la comisión se calcula sobre la
  base, sin el factor: el factor solo ayuda a llegar al porcentaje más alto.
- **Una venta única cuenta completa en el mes en que se firma**, aunque se cobre en partes: una expansión de US$ 20.000
  cuenta 20.000 y una recurrencia de US$ 1.000 al mes cuenta 14.400. Así el factor no hace que convenga más una
  recurrencia chica que una expansión grande.
- **Sin propuesta ni cambio, una venta es única y vale su monto de HubSpot**: el cálculo de antes no se mueve. Con una
  propuesta en el mismo trato, sus servicios dicen qué es único, qué es al mes y cuánto se descontó contra el precio de
  lista (`descuentoDeServicios`, `lib/business-cases/descuento.ts`, con las cuentas del motor de la Inversión). Las
  licencias no cuentan: pagan su propia comisión y su descuento lo da HubSpot. Una propuesta en otra moneda no se usa.
- **«Antes» y «ahora» salen de la misma función** (`simularVendedor`, con `sinCuidarElValor` para el antes): «antes» es
  la propuesta del 15 de octubre, así la diferencia que se ve es solo la de esta iniciativa.
- **Un descuento de más del `UMBRAL_DE_APROBACION` (10 %) lo aprueba dirección en la propuesta**, sobre el precio de
  lista de 12 meses de los servicios. Lo aprueba un ROL (`ROLES_QUE_APRUEBAN_DESCUENTOS`, Super Admin), no un correo; el
  texto dice «Marco». La franja vive en el editor de la Inversión (no llega al cliente ni al PDF) y **solo avisa: no
  frena «Subir al cliente»**.
- **La aprobación vive en la entry `__descuento` del Json de secciones del canvas v0, sin SQL**: el v0 no se regenera,
  así una versión nueva no la pierde. La escribe solo `POST /api/business-cases/[id]/descuento`, que calcula el
  porcentaje en el servidor con lo guardado (lo que dice el navegador no se aprueba). Guarda quién, cuándo y hasta qué
  porcentaje; vale mientras el descuento no suba por encima de lo aprobado. Quedan las últimas 10.
- **La simulación marca** «Sin aprobar» una venta cuya propuesta pasa el umbral sin aprobación, y «No se sabe si se
  aprobó» cuando el descuento se escribió a mano.
- **Lo que falta decidir con Marco**: el umbral del 10 %, el factor 1,2 y cuánto del descuento sale de la base. Están en
  «Decisiones pendientes», y las dos últimas se prueban en la simulación.

## Agregar una reunión a mano: la transcripción o lo que se recuerda (2026-10-15)

**Contexto.** Etapa 4f del roadmap de «Para ti» (`docs/mi-dia-plan.md`). De 378 reuniones con clientes del último mes,
94 no dejaron nada: ni transcripción ni notas. Y las reuniones que no pasan por Meet (Zoom, Teams, presenciales, una
llamada) no existían en Nexus. Elías: agregar una reunión puede ser con la transcripción o con lo que la persona
recuerda, cualquier contexto de la reunión; y todo tiene que servir para cualquier equipo.

- **«+ Agregar reunión», en Sesiones y en la ficha del cliente** (`components/sessions/AgregarReunion.tsx`). Lo puede
  hacer cualquiera con acceso al cliente, de cualquier equipo: la reunión es de la cuenta. Las reglas, en
  `lib/sessions/reunion-a-mano.ts`; la escritura, en `lib/sessions/reunion-a-mano-server.ts`
  (`/api/clients/[id]/reuniones-a-mano`).
- **Antes de crear una, se muestran las del cliente ese día.** Si es una de Meet sin transcripción ni notas, se le agrega
  lo que pasó y no queda dos veces. Lo que dejó Meet nunca se pisa (409). Una nueva lleva `source = "manual"`, un id
  `manual_…`, el cliente puesto a mano (`asignarDuenioManual`, «humano») y los proyectos vinculados a mano (el
  clasificador no los toca). El servidor vuelve a pedir confirmación si ese día ya hay reuniones.
- **La transcripción y el recuerdo se guardan distinto, a propósito.** La transcripción (pegada o en un archivo .txt,
  .vtt o .srt, que se lee en el navegador; los subtítulos de Zoom y Teams se pasan a turnos «Nombre: …») va a
  `transcript`, como la de Meet. Word y PDF no se leen: se copia el texto y se pega. Lo que la persona recuerda va a `summary.overview` con la marca `summary.aMano` (quién y cuándo), sin SQL.
  *Por qué:* un recuerdo no son palabras de nadie. La lectura de cada reunión lo lee entero (minuta, tareas, pedidos
  fuera de alcance) con un encabezado que lo dice; la lectura de hechos lo toma como «texto sumado a mano», así que una
  queja que solo está en un recuerdo va al vigía como evidencia y nunca levanta sola una alerta.
- **Entra a la cola sin el corte de 14 días** (la pidió una persona) y la lee el job, como a cualquier otra. Un recuerdo
  entra con su propio piso (`MIN_RECUERDO`, 40 caracteres), aunque la lectura de hechos esté apagada.
- **Quién estuvo:** la gente del equipo se elige de la lista, con su correo; la del cliente se escribe con su correo o
  solo con el nombre. Una persona sin correo cuenta como alguien de afuera (`esReunionDePuertasAdentro`): Meet guarda
  siempre correos (medido el 2026-10-15: 0 de 8.281 reuniones con un participante sin «@»), así que esto solo pasa en una
  reunión agregada a mano. Sin nadie del cliente, la reunión es de puertas adentro y no la lee el seguimiento.
- **Una reunión de Meet a la que se le agregó algo no la vuelve a tomar el enriquecimiento**: queda con `enrichedAt`.
  ⚠ Si Meet descubre después el documento de esa reunión, el enriquecimiento lo trae y reemplaza lo agregado a mano
  (la transcripción real gana).
- **Pendiente:** ofrecer «agregarla como reunión» desde el «Contexto adicional» cuando lo que se suma es una reunión.

## La IA como borrador; lo confirmado manda (2026-10-15)

**Contexto.** Etapa 4b del roadmap de «Para ti» (`docs/mi-dia-plan.md`). Medido ese día: de 1.140 cosas que propuso
Nexus en 30 días se usaron 22, y había 4 minutas revisadas de 797. Como los documentos que ve el cliente leían solo
las minutas revisadas, casi nada de lo conversado les llegaba. Elías: lo que llena la IA es un borrador que se usa desde
el primer momento; lo que confirma una persona manda; si algo nuevo lo contradice, Nexus pregunta.

- **Las minutas en borrador llegan a todos los lectores, marcadas.** `queCargar` (lib/memoria/consumidores.ts) deja
  `minutasSinRevisar` en `true` en los tres alcances, y la memoria las rotula «(minuta en borrador, sin revisar)». En los
  documentos del cliente y el handoff siguen yendo solo los acuerdos y las decisiones, sin montos ni negociación
  (`acuerdosYDecisiones`), y nunca de una reunión de puertas adentro. Lo mismo en las reuniones elegidas de un documento
  del cliente (`minutaParaElDocumento`, que ahora también quita la negociación). *Supera* la regla de la etapa 3 («fuera
  del alcance interno, solo las minutas que revisó una persona») y la de la etapa 7 en `tieneQueLeer`.
- **Toda memoria lleva la regla `LO_CONFIRMADO_MANDA`** en su encabezado: si un borrador contradice algo confirmado (la
  ficha confirmada, una minuta revisada), vale lo confirmado.
- **La ficha pregunta cuando lo nuevo contradice lo confirmado** (`lib/clients/contradice.ts`, sin IA): si la propuesta
  de un campo deja de decir un renglón que una persona confirmó, la caja pasa a ámbar, dice qué deja de decir y ofrece
  «Vale lo confirmado» o «Vale lo nuevo». Si solo suma, es una propuesta como siempre.
- **Lo que NO cambió, a propósito:** lo propuesto de la ficha sigue sin llegar a los documentos del cliente (decisión de
  Elías de la etapa 3); se usa en los agentes internos y en el handoff. Cambiarlo es otra decisión.
- **Pendiente:** llevar la pregunta de la contradicción también a «Para ti» y al chat; prender la lectura de hechos
  (`SEGUIMIENTO_HECHOS`) con el resultado del sondeo.

## Medir el uso y completar la cartera (2026-10-16)

**Contexto.** Etapa 4a del roadmap de «Para ti» (`docs/mi-dia-plan.md`). Hasta hoy Nexus no podía decir si «Para ti»
sirve: solo sabe lo que cada persona escribe, y la sesión de Supabase se renueva sola. Y «Para ti» del CSE sale de su
cartera, así que una cuenta sin CSE no le aparece a nadie (medido el 2026-10-16: 13 cuentas, 16 proyectos activos).
Elías: «que se guarde lo mínimo que sirva para verificar el uso básico».

- **El latido guarda lo mínimo** (`UsoDeNexus`, SQL `2026-10-16-uso-de-nexus.sql`): una fila por persona, sección y día,
  con cuántas veces la abrió y la primera y la última hora. No guarda qué cliente ni qué documento miró, ni minutos. Lo
  escribe solo `lib/uso/registro-server.ts`; lo manda `components/layout/LatidoDeUso.tsx` desde el shell.
- **La sección es la clave del ítem del menú** (`APP_NAV`), por el prefijo más largo (`lib/uso/secciones.ts`): un
  módulo nuevo se cuenta solo. Lo que no está en el menú es «otra». La propia pantalla de la medición no se cuenta.
- **Una apertura es entrar a una sección o volver después de 30 minutos.** Pasar de una ficha a otra no es otra
  apertura: se mide si Nexus se usa, no cuántos clics hace cada persona.
- **«Uso de Nexus» es de dirección** (`/para-ti/uso`, solo SUPER_ADMIN, enlace en «Para ti»): Equipo (los días con uso
  por persona y equipo, en orden alfabético, sin ranking), Para qué se usa (`usoDeLoPropuesto`, 30 días) y Reuniones
  sin grabar (quién organiza reuniones con clientes que no dejan transcripción, para arreglarlo en Google Workspace).
  Las otras pestañas del diseño (IA por cliente, Procesos de IA, Conclusiones de la IA) quedan para después.
- **El CSE de una cuenta sin encargado lo propone Nexus y lo confirma la CSL** (`lib/cs/sin-cse.ts`, Éxito del cliente ›
  Equipo): primero quien ya lleva otros proyectos activos de la cuenta; si no, el CSE (rol CSE) que estuvo en más
  reuniones con el cliente en 90 días; si no, nadie. Elegirlo es el pase de cuenta de siempre, que escribe «CSE
  Encargado» en HubSpot. La CSL no se propone por reuniones: va a muchas y no es la encargada.

## Contactos y tickets de HubSpot en Nexus (2026-10-16)

**Contexto.** Etapa 6a del roadmap de «Para ti» (`docs/mi-dia-plan.md`), antes de la 4c: el resumen antes de cada reunión
necesita saber quién viene y con qué cargo, y Nexus no sabía quiénes son las personas del cliente ni qué problemas tiene
abiertos.

- **Una copia de solo lectura, cada hora** (`ContactoDeHubspot`, `TicketDeHubspot`, job `contactos-y-tickets`): como la
  de los negocios. Nexus no escribe contactos ni tickets en HubSpot.
- **Solo de las empresas de Nexus de tipo cliente o prospecto.** Los aliados no: la empresa de HubSpot como aliado
  tiene miles de contactos que no son de ningún cliente. Medido el 2026-10-16: 185 empresas, 1.405 contactos, 418
  tickets.
- **Una fila por registro y cliente**: un contacto asociado a dos empresas de Nexus está en las dos. Así un invitado
  nunca toma el nombre de un contacto de otro cliente: el cruce mira solo los contactos del DUEÑO de la reunión.
- **Se lee por asociaciones en lote** (v4, de a 100 empresas) y no de a una empresa: unas pocas llamadas por corrida.
  ⚠ HubSpot devuelve como «error» a una empresa sin asociaciones (`NO_ASSOCIATIONS_FOUND`): eso es «no tiene», no «no
  se pudo leer».
- **Nunca se borra una fila**: lo que la empresa deja de tener asociado queda `vigente = false`, y solo en un cliente
  que se leyó entero. Un 429 no vacía la lista de personas de nadie.
- **Dónde se ve**: La cuenta › Personas y tickets (cada persona con su última reunión y lo último en HubSpot; los
  tickets abiertos y los cerrados de 90 días) y la página de cada reunión (los invitados con nombre y cargo).
- **La memoria de la cuenta los lleva solo en el alcance interno**: la lista de contactos de HubSpot no está curada
  (gente que se fue, contactos de prospección), así que no llega a lo que lee el cliente ni al handoff.

## «Para ti» del CSE y el resumen antes de cada reunión (2026-10-16)

**Contexto.** Etapa 4c del roadmap de «Para ti» (`docs/mi-dia-plan.md`): que el CSE sepa qué atender hoy y llegue
preparado a cada reunión sin armarlo a mano. Ventas recibe lo mismo.

- **Un solo registro de equipos** (`lib/equipos/registro.ts`): cada equipo declara sus roles, su sprint de Tareas, el
  siguiente paso que lleva, su cartera y qué ve en «Para ti». El siguiente paso que escribe cada rol ya sale de ahí
  (`equiposQueEscribe`). Los sprints de Tareas siguen saliendo del ÁREA de cada persona (decisión de Tareas); el
  registro dice cuál es el de cada equipo. Dirección no es un equipo.
- **La agenda de hoy** en «Para ti» (Ventas, CS, Dev y dirección): las reuniones del calendario de la persona, con la
  empresa de cada una. La empresa sale de los invitados: el correo exacto de un contacto de HubSpot o el dominio
  registrado de la empresa (nunca uno de correo personal). Alguien que es de varias empresas (HubSpot, una agencia) no
  decide si hay otro invitado que es de una sola (invariante 1); si solo hay gente de varias, se elige al preparar.
- **«Preparar» abre el resumen de la cuenta para esa reunión, sin IA**: quién viene (nombre, cargo y su última reunión),
  la última vez (la minuta o las notas de la última reunión con el cliente, sin las de puertas adentro), lo que se dijo
  antes de lo que dice el título, lo pendiente de los dos lados (por la puerta de los agentes de Tareas: sin la cita,
  el contexto, las notas ni lo privado), el siguiente paso de cada equipo, los tickets y los negocios abiertos. Cada
  bloque dice de dónde salió. Las alertas, solo para quien lidera Customer Success; el monto de un negocio, solo para
  quien ve Ventas. *Por qué sin IA:* el riesgo del plan era que el resumen citara mal o mezclara clientes; armado así,
  cada dato es el de su lugar y la frase citada es la de la transcripción.
- **La búsqueda en las reuniones**: texto completo en español sin servicio nuevo, sobre las transcripciones partidas en
  TURNOS (`TurnoDeReunion`, con una columna generada `tsv` que no está en el schema de Prisma). Se busca sin tildes: la
  columna y la consulta se normalizan igual. Solo en las reuniones de UNA empresa, con la regla única de pertenencia.
  Se indexan las reuniones con clientes y prospectos de los últimos 180 días (job `indice-de-reuniones`).
- **La cartera del CSE en «Para ti»**: las cuentas de los proyectos donde es el CSE encargado, primero las que no tienen
  siguiente paso de CS o lo tienen vencido.
- **Se mide**: el latido cuenta «Preparar una reunión» como sección propia, para saber si los CSE abren el resumen.

## Después de cada reunión, un paso de dos minutos (2026-10-16)

**Contexto.** Etapa 4d del roadmap de «Para ti» (`docs/mi-dia-plan.md`): que lo que dejó una reunión se cierre ese día.

- **«Después de tus reuniones» en «Para ti»**: las reuniones con clientes y prospectos en las que estuviste y que
  terminaron en las últimas 36 horas (hasta 5). Cada una dice qué dejó y trae «Usar todo», el MISMO de la tarjeta «Lo
  que dejó esta reunión» (con su huella: si la reunión cambió, 409 y se revisa en la tarjeta). Se ve también lo que
  la tarjeta no decide sola: el enlace «Revisar».
- **El siguiente paso propuesto sale de lo que se comprometió Smarteam en la reunión**: la primera de tus tareas
  propuestas de esa reunión, cuando tu equipo no tiene un siguiente paso sobre la cuenta o se venció. «Usar como
  siguiente paso» lo guarda en Nexus y en HubSpot, como cualquier siguiente paso. *Por qué así:* no hace falta otra
  lectura con IA; es lo que la lectura de la reunión ya dejó.
- Si nadie lo mira, igual queda como borrador (DECISIONS «La IA como borrador»).

## El correo de la mañana, paso 1 (2026-10-16)

**Contexto.** Etapa 4e del roadmap de «Para ti» (`docs/mi-dia-plan.md`): llevar el día al correo. Se prueba en 4 pasos;
este es el primero: se arma y se ve en Nexus, sin enviar.

- **Se arma con una función pura** (`lib/mi-dia/correo.ts`) sobre lo mismo que lee «Para ti»: la agenda de hoy (si el
  equipo de la persona la ve) y su medición. Lo que no está en su «Para ti» no puede estar en el correo.
- **Como mucho 5 cosas**: primero lo que dejó un agente y espera tu decisión, después lo de hoy. Lo demás se dice en una
  línea («Y N cosas más en «Para ti»»).
- **Nunca Finanzas ni montos**: las fuentes de Finanzas y de Cobranza no entran, y una cosa con monto tampoco. *Por
  qué:* un correo se reenvía y se lee en el teléfono; lo que ve una persona en Nexus no tiene por qué salir de ahí.
- **Las reuniones llevan «Preparar», no su resumen.** El resumen de la cuenta queda en Nexus, detrás del enlace (con su
  regla de acceso): en el correo solo va la hora, el título y la empresa. Corrige al plan, que decía «con su resumen».
- **Cada línea lleva a Nexus** con la dirección de `APP_URL`.
- **No se envía.** El paso 2 (solo a Elías, una semana) espera el permiso de Gmail en Google Admin o un proveedor de
  correo.

## Notas de la cuenta (2026-10-16)

**Contexto.** Etapa 5 del roadmap de «Para ti» (`docs/mi-dia-plan.md`): lo que pasa por WhatsApp, una llamada o un
correo con un cliente no quedaba en ningún lado de Nexus, y las reuniones de Meet no quedan en el registro de HubSpot.

- **Una nota es de la cuenta** (`NotaDeLaCuenta`): canal, día, texto, quién la escribió y, si aplica, el proyecto o el
  negocio. La anota cualquiera con acceso al cliente, de cualquier equipo, en La cuenta › Notas. La ve todo el que ve
  la cuenta; el cliente, nunca.
- **Nexus primero, HubSpot después** (como el siguiente paso): se escribe enseguida como nota de la empresa, a nombre de
  quien la escribió (su owner de HubSpot, y su nombre en el texto por si no tiene), y se asocia al negocio y al proyecto
  con la asociación por defecto de HubSpot. Si HubSpot no responde, queda pendiente y el job `contactos-y-tickets` la
  reintenta cada hora, hasta 5 veces.
- **Sacarla de Nexus no la borra en HubSpot.** La saca quien la escribió, quien lidera Customer Success o dirección;
  deja de verse y de leerse como contexto. Borrar en HubSpot desde Nexus no existe: allá es el registro.
- **Entra a la memoria interna de la cuenta** («Notas del equipo», las 8 más nuevas, solo el alcance interno). Nunca a
  lo que lee el cliente ni al handoff: las escribe el equipo para el equipo, sin la frontera de lo que ve el cliente.
- **Las notas escritas directo en HubSpot se leen al abrir la pestaña** (el registro de la empresa) y se muestran aparte,
  solo para leer. Las que escribió Nexus no se repiten: se reconocen por el id de la nota.
- **Después de una reunión con el cliente, Nexus sugiere la nota para HubSpot** con lo acordado y lo decidido de la
  minuta (o su resumen), sin IA nueva. Se cambia, se usa o se descarta en la tarjeta «Lo que dejó esta reunión», y se
  puede escribir tal cual desde «Después de tus reuniones». Nunca entra a «Usar todo»: escribe en HubSpot. Una decisión
  por reunión (índice único parcial). Vale para las reuniones desde el 2026-10-16: con las de antes, aparecían de golpe
  decenas de sugerencias de hace semanas. «Uso de Nexus» la cuenta como un tipo más de lo propuesto.
- **Todavía no:** que la nota deje hechos (espera `SEGUIMIENTO_HECHOS`) y sugerir la nota desde el chat (llega con el
  agente, etapa 6b).

## Nexus, el sistema de trabajo de cada cuenta (2026-10-16)

**Contexto.** Después de la reunión con Alexander Vanegas (líder de Customer Success) del 2026-10-16 y de una revisión
del código en cuatro frentes, Elías decidió replantear Nexus: deja de ser un analizador de reuniones que produce
documentos y pasa a ser **el sistema de trabajo de cada cuenta: sabe lo que pasó, planifica lo que sigue y ayuda a
hacerlo**. El plan, por fases, está en `docs/nexus-sistema-de-trabajo-plan.md`. Medido ese día: 150 alertas abiertas
(126 del vigía), 80 tareas propuestas por las reuniones sin decidir, 0 de 53 cuentas activas con siguiente paso, y unas
10 formas distintas de guardar «algo que hay que hacer».

- **Cuatro capas sobre una base: memoria, plan, entregables y atención.** Encima, una sola capa de operaciones que usan
  la pantalla y el chat (y un MCP, si algún día hace falta). *Por qué:* un chat que opera Nexus necesita que cada
  operación diga qué pide, quién puede y cómo se aplica; con 7 listas de operaciones distintas, cada cosa nueva había que
  enseñársela al chat a mano.
- **Una sola acción: la tarea.** Se asocia a la cuenta, el contacto, el negocio, el proyecto, el equipo y la persona. El
  siguiente paso de un equipo en una cuenta es su próxima tarea abierta con fecha. Una reunión planeada es una tarea de
  tipo reunión, que después queda unida a la reunión que se hizo. *Por qué:* «¿cada cuenta tiene su acción de la
  semana?» no se podía responder desde un solo lugar.
- **Visibilidad por cuenta.** Quien tiene acceso a una cuenta ve todas sus tareas que no son «Solo para mí», de
  cualquier equipo. *Por qué:* Customer Success tiene que estar al tanto de todo lo que se le hace a un cliente (Dev
  incluido); hoy cada equipo veía solo lo suyo. La cita de una reunión no cambia de regla.
- **Reglas de servicio.** Cada cuenta con servicio activo: una acción con fecha cada semana y una reunión agendada en
  los próximos 8 días, salvo una excepción explícita.
- **Atención: una cosa por cuenta y como mucho 5 en «Hoy».** Las alertas sueltas se reemplazan por una lectura por
  cuenta (color y hasta 3 motivos) que también ve el CSE, y las abiertas se cierran en bloque con respaldo. Los avisos
  quedan para lo que no es un pendiente.
- **Calendario por enlace.** «Agendar» abre Google Calendar con todo lleno, invitados incluidos; la persona lo guarda y
  Google manda la invitación. Nexus lee el calendario para proponer el hueco. *Por qué:* sin permiso de escritura y sin
  que Nexus mande invitaciones a un cliente sin que una persona lo vea.
- **La memoria no es un RAG con vectores.** El chat la lee con herramientas: lo estructurado, la búsqueda por palabras en
  los turnos y la reunión entera, todas filtradas por cliente en la base. *Por qué:* la separación entre clientes y las
  citas palabra por palabra ya están resueltas así; una base de vectores sería otro lugar donde romper la primera.
  Vectores solo si al medir la búsqueda por palabras no alcanza.
- **Entregables y herramientas.** Entregables (los ve el cliente, con plantillas): Diagnóstico, Planificación,
  Integraciones, Entrega y Kickoff (lo presenta el CSE, una vez por proyecto). Herramientas del proyecto (internas):
  Resumen, Cronograma, Cuestionarios, Exploración, Handoff y Ejecución. El diagnóstico de hoy pasa a ser «Diagnóstico
  estratégico».
- **Desarrollo** (Alejandro Salas y Brainer) planifica en Tareas como los demás; lo lidera Alex Vanegas.
- **Se prende la lectura de hechos**, con Sonnet y caché (unos US$22 al mes).

**Cómo quedó la fase 0 en el código (2026-10-16, sin desplegar).** SQL aplicados en producción el mismo día:
`2026-10-16-lideres-de-equipo.sql` y `2026-10-16-la-accion-unica.sql`.

- **El líder de un sprint es un dato** (`TeamMember.lideraEquipos`, «Lidera los sprints de» en Equipo). Una persona
  lidera más de un sprint y uno que no es el de su área. Primeros líderes: Alex Vanegas (CS y Desarrollo) y Alejandra
  Ortega (Marketing). El override `tareas.manage` se retiró (nadie lo tenía). Quien lidera un sprint escribe también el
  siguiente paso de ese equipo. **Tareas está en el menú de todo el equipo.**
- **La regla de las cuentas** (`lib/tareas/visibilidad.ts`): las tareas de las cuentas que ves, de cualquier equipo,
  menos lo «Solo para mí» y lo de un espacio de «solo miembros» donde no estás. Las empresas de Smarteam no cuentan: el
  trabajo interno se sigue viendo por su sprint. Lo arma `contextoDeTareas` una vez por pedido; sin él (un aviso a otra
  persona, un script), se ve menos, nunca más.
- **La tarea suma su contacto y su negocio de HubSpot** (ids externos, sin FK: las copias se rehacen), **el lado** (antes
  en el evento con que nació; se copió a la columna), y **la reunión planeada** (`clase = "reunion"`, sus invitados, su
  inicio y la reunión que se hizo). La reunión planeada todavía no tiene pantalla: llega con la fase 2.
- **El siguiente paso es la próxima tarea abierta con fecha del sprint del equipo** (`lib/siguiente-paso/desde-tareas.ts`):
  la fecha es el día de la reunión, el vencimiento o su semana; «Por asignar» del sprint cuenta; una propuesta no.
  Fijarlo desde el diálogo cambia la tarea que hoy es el siguiente paso solo si nació como paso (`origen = "paso"`) y
  la lleva quien lo fija; si no, crea una tarea de paso nueva (`tareaQueSeCambiaAlFijar`, corregido el 2026-10-17:
  antes se reescribía la tarea de otra persona, y a quien no podía editarla le respondía 403). Lo lleva alguien del
  sprint del equipo. ⚠ Si el sprint tiene una tarea con fecha más temprana, la nueva no es el siguiente paso hasta que
  esa se cierre. «Ya se hizo» la termina. Para otra
  persona, sigue las reglas de Tareas: le llega como sugerencia y no es el siguiente paso hasta que la tome.
- **HubSpot sale de la tarea.** Al guardar, y cada hora para las cuentas cuyas tareas cambiaron (job
  `negocios-abiertos`), se compara la tarea con la copia y se escribe solo lo distinto. Si alguien lo borra en HubSpot y
  la tarea no cambia, no se vuelve a escribir (no se pelean). Lo nuevo que alguien escribe en HubSpot entra como tarea
  del sprint de ese equipo, para su dueño si es del sprint y, si no, en «Por asignar».
- **«Para ti» dejó de repetir el siguiente paso**: la fuente «Tus siguientes pasos» se retiró, porque esas tareas ya
  salen en «Tus tareas». «Usar como siguiente paso» (después de una reunión) usa la tarea propuesta, no crea otra.
- **La capa de operaciones** (0.4, `lib/operaciones`): lo que se puede hacer en Nexus desde la pantalla o el chat,
  escrito una vez. Cada operación tiene nombre, para qué sirve (en tuteo, lo lee el modelo), qué pide (un zod, del que
  sale el esquema de la herramienta), si lee o propone, `preparar` (valida sin escribir y arma la línea que se lee
  antes de aplicar) y `aplicar` (por el escritor único de su módulo). La persona va EXPLÍCITA: la capa no lee la sesión.
  - *Primera tanda*: leer las tareas, las notas y los siguientes pasos de una cuenta; crear una tarea, cambiarle el
    estado, pasarla de semana; anotar en la cuenta; fijar el siguiente paso de un equipo. Darlo por hecho es terminar su
    tarea.
  - *Lo que llega al modelo de Tareas* sale de una puerta propia (`lib/tareas/para-operaciones.ts`): número, título,
    estado, semana, vencimiento, responsable y lado; nunca la cita, el contexto ni las notas, y con la visibilidad de la
    persona.
  - *Aplicar una lista* va en orden y corta en la que falla (lo anterior queda; lo demás no se intenta). Cada operación
    es atómica por su escritor; una lista de módulos distintos no comparte una transacción. Antes de aplicar se vuelve a
    preparar: lo que llega del navegador nunca se aplica tal cual.
  - ⚠ Los escritores del siguiente paso todavía preguntan el acceso con la sesión del pedido: aplicarlos fuera de un
    pedido de la misma persona (un job) falla con 403.
- **La lista de limpieza de HubSpot** (0.5, `lib/limpieza`): lo que hay que poner al día en HubSpot, por quién lo tiene
  que hacer. Nexus usa esos datos (el CSE de la cuenta, la etapa, la cartera): si HubSpot miente, Nexus también.
  - *Cinco motivos*: el proyecto está a nombre de alguien que ya no está; no tiene encargado; lleva más de seis semanas
    en la misma etapa (menos Continuidad, que dura por diseño); no tiene actividad en HubSpot en un mes; la empresa tiene
    un servicio recurrente activo en Cobranza y ningún proyecto abierto en HubSpot.
  - *Quién lo arregla*: el encargado, si está en el equipo; si no (o no hay proyecto), quien lidera el sprint del
    proyecto (Customer Success o Desarrollo).
  - *Dónde se ve*: en «Para ti», una línea de «Esta semana» con lo de cada persona y su enlace a HubSpot (es limpieza:
    no compite con lo de hoy), y la lista entera por responsable en Éxito del cliente › «Limpieza de HubSpot», para la
    CSL y dirección.
  - *Dos datos nuevos del espejo de proyectos*: desde cuándo está en la etapa de hoy (`hs_v2_date_entered_current_stage`)
    y la última actividad (`hs_last_activity_date`), en `Project.hubspotEtapaDesde` y `hubspotUltimaActividad` (SQL
    `2026-10-16-limpieza-de-hubspot.sql`, aplicado el mismo día). Nacen vacíos y se llenan con la siguiente
    sincronización de cada cliente; hasta entonces no se avisa nada de lo quieto. Solo lee: lo arregla una persona en
    HubSpot.

**Cómo quedó la fase 1 en el código (2026-10-16, sin desplegar; 1.1, 1.2, 1.3 y 1.4).**

- **«Lo que importa hoy»** (`lib/para-ti/importa.ts`): de lo de hoy y lo que dejó un agente, como mucho cinco, UNA POR
  CUENTA (la cuenta sale del pendiente o de su enlace `/clients/<id>`); lo demás de esa cuenta va plegado («+N en esta
  cuenta») y lo que no entra en las cinco va a «También para hoy». El peso sale de la fuente, en el orden de Elías:
  riesgo (90) > cuenta sin acción (80, llega con la fase 2.1) > decisión que frena (70) > revisar una reunión (60) > lo
  interno (40) > encuestas y limpieza (20); lo que falló sube 15. Lo que dejó un agente ya no va aparte arriba: compite
  por peso y lleva la chispa. El número del menú cuenta esas cinco (más los avisos) y el correo de la mañana usa las
  mismas.
- **Avisos solo para lo que no es un pendiente**: salieron `tareas.sugerencias`, `tareas.pedido`, `finanzas.devuelto`,
  `documentacion.comentario` y `alcance.confirmado` (cada uno ya era un pendiente en «Para ti»), y los tipos que nadie
  escribía. Quedan los mensajes, las buenas noticias y las asignaciones directas. Los avisos viejos de esos tipos se
  siguen mostrando.
- **Las tareas de las reuniones**: cada persona tiene como mucho 10 sugerencias de las reuniones sin decidir
  (`MAX_SUGERENCIAS_POR_PERSONA`); con más, las más viejas vencen solas (no son lápidas: se vuelven a proponer si se vuelve
  a hablar del tema). Lo que pidió una persona no cuenta. En «Para ti», «Lo que dejaron tus reuniones» es UNA LÍNEA POR
  REUNIÓN (como mucho 8), con su cuenta, y cuenta también tus tareas propuestas de esa reunión (también de un
  prospecto); «Nexus te propone N tareas» queda para lo de las reuniones internas y el asistente.
- **La lectura de la cuenta en lugar de alertas sueltas** (1.2, `lib/cs/lectura-de-la-cuenta.ts`). Medido ese día: 155
  alertas abiertas en 27 cuentas, 131 del vigía; la huella que escribía el agente iba en la llave y cada corrida creaba
  otra sobre lo mismo.
  - *Una alerta del vigía por cuenta (o proyecto) y categoría* (`llaveDelVigia`): la que está abierta sobre lo mismo se
    actualiza con lo último que vio, tenga la llave que tenga. La queja sigue una por cita: cada una es una frase del
    cliente verificada, y pinta el color.
  - *La renovación se junta*: la regla deja UN aviso por fecha con todos los hubs que renuevan ese día (antes, uno por
    hub; hasta cinco del mismo cliente), el vigía suma lo suyo a ese aviso y la regla absorbe la renovación que el vigía
    ya tenía abierta. Lo que la CSL cerró con la llave vieja no vuelve en el mismo umbral.
  - *Un cierre del sistema no suprime*: si el agente vuelve a ver algo que Nexus cerró solo, vuelve. Solo lo que cerró
    una persona espera una señal nueva.
  - *La lectura*: el color de Éxito del cliente y hasta tres motivos (sus razones primero; después las alertas de riesgo
    que ninguna razón dice, la más grave primero). Las sugerencias del vigía (oportunidades, acciones) no son motivos:
    se cuentan aparte.
  - *Quién la ve*: quien lidera Customer Success y el CSE de la cuenta (el encargado en HubSpot de un proyecto de CS), en
    el chip «Cómo está la cuenta» de la cabecera de la ficha. Al CSE le llega sin lo que habla de plata. Los demás siguen
    viendo solo el chip de la corrección del color.
  - *En «Para ti»*: el vigía da una línea por cuenta (las primeras cinco; las demás, juntas en una) y el CSE recibe sus
    cuentas en rojo, con su primer motivo (`TUS_CUENTAS_EN_RIESGO`, peso de riesgo).
  - *El cierre en bloque* (`scripts/cerrar-alertas-sueltas.ts`, después del deploy, con respaldo de `CsAlert`): las
    alertas abiertas del vigía sin frase verificada, firmadas por el sistema. Quedan los avisos de la regla (los junta
    ella), lo que levantó la lectura de cada reunión y las quejas y los retrasos con la frase del cliente.

## Las tareas de cada cliente y el sprint de cada equipo (2026-10-17, ficha A)

**Contexto.** Elías: «entro a un cliente y tengo que ver todas las tareas de Smarteam hacia ese cliente, por equipo».
Y que Customer Success, Marketing y Desarrollo configuren su sprint para que Nexus proponga tareas de lo conversado,
pocas, diciendo si vienen de una reunión con el cliente o del sprint interno.

- **La ficha del cliente › La cuenta › Tareas** lista las tareas de esa cuenta de cualquier equipo, agrupadas por
  equipo (Customer Success primero): abiertas, por decidir y hechas en los últimos 30 días. Usa la visibilidad de
  siempre (`tareasVisiblesWhere`) y nunca muestra lo «Solo para mí» de otra persona, tampoco a Super Admin. Quien no ve
  la cuenta recibe 404.
- **De dónde viene una tarea** (`lib/tareas/origen.ts`): reunión con el cliente, sprint interno, HubSpot, el chat, un
  siguiente paso, una plantilla o a mano. Entre reunión con el cliente y sprint interno decide la SALA de la reunión
  (de puertas adentro = sprint interno), nunca el cliente de la tarea. Se ve como etiqueta en todas las listas, salvo
  «A mano» (lo normal) y HubSpot (ya tiene la suya).
- **Como mucho 5 tareas propuestas por persona en cada reunión** (`MAX_PROPUESTAS_POR_PERSONA_POR_REUNION`), en el
  único escritor de propuestas y contando todo lo que esa reunión ya le dejó (notas, «¿Faltó algo?» y seguimiento), en
  el orden de las líneas. «Por asignar» no cuenta. Lo que no entra no se crea y se cuenta en la lectura. Convive con el
  tope de 10 sugerencias abiertas por persona.
- **El sprint lo configura quien lo lidera o dirección**, en Semana del equipo › «La reunión del sprint»: hasta 4
  series por sprint, solo reuniones recurrentes y de puertas adentro en las que estuvo quien la elige (se leen a su
  nombre). Cada reunión nueva se lee sola entre 15 minutos y 24 horas después de terminar, solo desde el día antes de
  configurarla; lo lee el job `tareas-sprint` y también al abrir Tareas. Una lectura que falló no se reintenta sola;
  una sin texto, sí. Si quien la configuró se va del equipo, la serie se pausa.
- **«Quiénes están»** (`FuenteDeTareas.personas`): una sola lista por sprint; vacía son los del área más quienes lo
  lideran. Lo que la reunión le propone a alguien de la lista no le llega como pedido de otro equipo; la tarea sigue en
  el sprint de casa de su responsable.
- **Si quien lidera no está invitado, la serie queda a nombre de alguien del equipo que sí está** (2026-10-18,
  `scripts/configurar-serie-del-sprint.ts`, con las mismas validaciones de la pantalla). Nexus lee la serie a nombre de
  quien la configuró, y Alex Vanegas, que lidera Desarrollo, no está en el planning que organiza Alejandro Salas. Así
  quedaron las dos primeras: «Sprint planning de marketing» (lunes 9:30) a nombre de Alejandra Ortega y «SPRINT DEPT.
  SOFTWARE» (lunes 8:00) a nombre de Alejandro Salas, las dos como planning. Las reuniones del sprint no llevan empresa:
  son sesiones internas (categoría Interna), que es lo que lee Tareas.

## La escala en el tiempo, con su evidencia (2026-10-17, ficha B)

**Contexto.** Elías pidió validar que el agente de la escala use toda la información de Nexus, pintar la escala del
cliente con su evidencia, sugerir qué explorar según lo que cambió, y que la escala de la ficha del cliente sea la
misma con su histórico.

- **Una versión es una FOTO de lo confirmado** (`VersionDeLaEscala`, un solo escritor:
  `lib/exploraciones/versiones-de-la-escala.ts`), dimensión por dimensión, con de dónde sale cada nivel (fuente, frase
  y porqué). Lo que propone el agente no posiciona a la empresa. Se guarda al confirmar un nivel (una por día), al
  presentar el diagnóstico con el ciclo abierto y con «Guardar esta versión»; una foto igual a la anterior no se guarda.
  Es interna: el cliente no la ve.
- **SUPERSEDED 2026-10-18** (ver «Actualizar escala: la escala de cada empresa con todo lo que Nexus sabe»): el botón es
  «Actualizar escala», lee todo por su propio modo y lo propuesto se usa en la misma ficha.
  **«Regenerar con el agente» desde la ficha solo propone**: los niveles se confirman en la exploración. El modo
  `posicionar` lee el handoff, los cuestionarios, el test y HubSpot aunque no haya una reunión nueva (antes, en un
  proyecto el agente no ubicaba nada sin una sesión).
- **El camino de crecimiento y los casos sugeridos salen de reglas, sin IA**: un caso de la biblioteca calza si mueve
  una dimensión desde el nivel en que está hoy, y pesa más si destraba lo que frena al área.
- **Una propuesta nueva trae «Casos de uso»**: lo del checklist, lo elegido en la preventa o, sin nada, los sugeridos
  de la biblioteca, sin precio; el agente sabe que el prospecto no los eligió.
- **El siguiente paso de la preventa**: sin sesión agendada, arma el evento en Google Calendar por enlace (Nexus no
  escribe en el calendario); con una agendada, lleva a planificarla.

## El texto de una reunión tiene que ser el de ESA reunión, y llegar después de que termina (2026-10-05 y 2026-10-17, ficha C)

**Contexto.** Medido en producción el 2026-10-05: sin documento adjunto al evento, el enriquecimiento buscaba en Drive
las dos primeras palabras de 4 letras o más del título y leía el archivo más nuevo; de 169 reuniones llenadas así, 156
tenían el texto de otra reunión (RC Inmobiliaria leyó una de AJC). Y el 2026-10-17 se midió que el 53 % de las
reuniones con clientes del último mes no tenía transcripción: 78 porque Nexus las leía antes de que terminaran.

- **Un archivo de Drive se acepta solo si es de esa reunión** (`lib/google/drive-candidatos.ts`): nombre con la forma
  de Google, el mismo título (Gemini lo corta a 99 caracteres) y la fecha de ESTA reunión. Si ninguno sirve, queda sin
  texto.
- **Se lee 20 minutos después del FIN, no una hora después del inicio** (`listaParaLeer`, con la duración del evento).
- **«No había nada» no sella mientras la reunión terminó hace menos de 48 horas**: vuelve a mirar a las 2, 4, 8 y 16
  horas (job `google-enrich-retry`); al tope se sella con su diagnóstico.
- **Si una cuenta no puede leer el documento, se prueba con otro invitado del equipo** (hasta 3): las notas pueden
  estar compartidas solo con quien las tomó.
- **Cuando el texto de una reunión ya leída cambia** (`lib/sessions/reanalizar.ts`): si nadie tocó lo que dejó la
  lectura y la reunión es de los últimos 14 días, se borran la minuta en borrador y los pedidos de esa corrida, se
  retiran los hechos pendientes y se vuelve a leer; si alguien ya trabajó algo, no se pisa y se le avisa
  (`reunion.texto-cambio`). ⚠ Las propuestas de Tarea sin decidir no se borran (las escribe solo `lib/tareas`): vencen a
  los 14 días.
- **Por qué falta cada transcripción se mide** (`lib/google/por-que-falta.ts`, `scripts/medir-transcripciones-faltantes.ts`),
  separando lo que arregla Nexus de lo que es configuración de Google Workspace.

## El inicio de cada equipo y la cuenta sin acción (2026-10-17, ficha D)

**Contexto.** El inicio («Para ti») de Ventas y del CSE se rehízo con el diseño «Para ti · Ventas y CSE»: una guía,
la agenda del día como Google Calendar y cada reunión en un panel al costado. Y cada cuenta con servicio activo tiene
que tener su acción de la semana y su reunión agendada.

- **La acción de la semana** es una tarea abierta de la cuenta, de cualquier equipo, que no es «Solo para mí», con
  fecha dentro de la semana (la de su reunión, su vencimiento o su semana). La semana va de lunes a domingo; desde el
  sábado cuenta la que viene.
- **La reunión** es una reunión con la cuenta en los próximos 8 días en el calendario de quien la lleva, o una reunión
  planeada en Tareas. Un evento cuenta solo si es de UNA empresa (invariante 1). Si no se pudo leer el calendario, se
  dice eso, no que falta la reunión.
- **«Cuenta sin acción» le llega solo a quien la lleva** (el encargado en HubSpot de un proyecto de CS abierto), con
  peso 80 en «Lo que importa hoy». Pendiente de decidir: si «En espera del cliente» la exime.
- **«Tu día, según Nexus» y la guía de cada reunión no usan IA**: los arma el código con los datos, y cada punto dice
  de dónde sale. El objetivo y las notas de una reunión son de la persona (`PreparacionDeReunion`) y solo los ve ella;
  Nexus todavía no los lee.
- **Cada equipo tiene su inicio** (`varianteDelInicio`, del registro de equipos): el CSE sus cuentas, la CSL toda la
  cartera, Desarrollo los clientes con proyecto de desarrollo activo y Marketing sus tareas internas.

### Lo que cambió al probarlo (2026-10-17, feedback de Elías)

- **Un evento se arma en la agenda y se guarda en Google Calendar.** Tocar una hora libre (o «+ Crear evento») deja un
  BORRADOR de una hora con título, invitados (los contactos de HubSpot de las cuentas que ves, `/api/para-ti/contactos`)
  y la cuenta; «Abrir en Google Calendar» lo abre ya lleno, con el enlace a la cuenta en la descripción
  (`lib/mi-dia/agenda-borrador.ts`). Sigue valiendo «Calendario por enlace»: Nexus no escribe en el calendario. El
  borrador vive solo en la pantalla y se pierde al recargar. «Agendar» de una cuenta sin acción hace lo mismo en el
  primer hueco laboral, invitando a quien estuvo en la última reunión o, si no, al contacto con más actividad.
  ⚠ Desde la segunda vuelta (abajo), «Agendar» ya no abre Calendar: deja el borrador con su cuadro abierto.
- **Los huecos y lo que propone Nexus, solo en horario laboral**: lunes a viernes de 8:00 a 17:00, hora de Costa Rica
  (`lib/mi-dia/constantes.ts`, `primerHuecoLaboral`). El hueco ya no promete con qué avanzar: sugerir la tarea para el
  hueco queda para más adelante.
- **Customer Success tiene su cartera, aparte de la de Ventas** (`lib/mi-dia/cartera-cs.ts`, «Tu cartera» del CSE y «La
  cartera» de la CSL). La unidad son los proyectos de HubSpot de implementación, SmartLoop y desarrollo, juntos por
  empresa: el nombre grande, el CSE y el encargado de cada proyecto, el color y su porqué, la etapa, el último contacto,
  la próxima reunión, la renovación y la acción de la semana. El monto aparece solo con un negocio abierto y solo para
  quien tiene `ventas.read`. Vistas: Para atender, Todos los proyectos, Por CSE (solo la CSL, sin ranking), Sin
  contacto y Renuevan pronto. La CSL ya no ve la cartera de Ventas.

### La agenda, segunda vuelta (2026-10-17, noche, validaciones 2 y 8)

- **Moverse por la agenda no vuelve a pedir la página.** ‹ ›, «Hoy» y Día ↔ Semana eran enlaces que rearmaban «Para ti»
  entero (medido con Liliana: ~6 s, casi todo la medición y las cuentas). Ahora la agenda pide solo lo suyo a
  `/api/para-ti/agenda` (`components/para-ti/inicio/agenda-navegable.ts`) y la dirección se actualiza con
  `history.replaceState`. El servidor guarda lo leído del calendario un minuto por persona y rango; la página entera lee
  siempre fresco, así un evento recién guardado en Calendar aparece al recargar. El cliente de Google se reusa por
  persona (`getImpersonatedAuth`): la lectura de una semana bajó de ~0,5 s a ~0,2 s. El panel de una reunión hace todo
  en paralelo: de ~1,9 s a ~1 s.
- **La agenda es de lunes a viernes**: un sábado o un domingo abre en la semana que viene (en «Día», el lunes), y ‹ › en
  «Día» salta el fin de semana (`lib/mi-dia/agenda-dias.ts`).
- **Soltar un borrador lo borra**: tocar afuera, la X o Escape lo quitan y el hueco queda como estaba. El que ya se abrió
  en Calendar solo se cierra (espera «Ya lo guardé» o «Descartar»).
- **«Agendar» y «Planificar acción» siempre muestran el borrador antes**: dejan el borrador en la agenda con el cuadro de
  «+ Crear evento» abierto (título, hora propuesta, cuenta y contacto, todo editable); recién «Abrir en Google Calendar»
  abre el enlace. La cartera lo llama con `usePlanificarAccion()` (`AgendarEnLaAgenda.tsx`); si la agenda no está en
  pantalla, la hora sale del calendario entero (`/api/para-ti/agenda?hueco=1`) y lleva al día del borrador.
- **«Tus notas» también en una reunión que ya pasó.** Siguen siendo de cada persona: con «Ver como», el panel dice que no
  se ven ni se escriben.

### Ver todas, y el siguiente paso con la reunión (2026-10-19)

- **«Ver más» lleva a TODAS las cuentas que la regla marca, sin tope.** La tarjeta «Tus cuentas» (o «La cartera») muestra
  cinco; abajo, «Ver las M sin acción o reunión» abre la cartera de Customer Success en la vista nueva **«Sin acción o
  reunión»** (`cuentasSinServicio`, lib/mi-dia/cartera-cs.ts) y «Ver las N», en «Todos los proyectos». Antes «Ver las N»
  abría «Para atender», que deja fuera a propósito las que solo están sin reunión: en cuanto una cuenta tiene su acción y
  le falta la reunión, de las que «Para ti» marcaba ahí no estaban todas (medido el lunes 19 no faltaba ninguna, porque
  todas estaban además sin acción; el hueco se abre a mitad de semana). En la CSL la cartera suma las que solo tienen desarrollo, así que el enlace de las que faltan no
  lleva número cuando la lista de destino tiene otras cuentas (el número está en la pestaña). «Para atender» no cambió.
- **Con reunión esta semana y sin acción, la línea lo dice distinto**: «X: tiene reunión el jue 22, falta el siguiente
  paso», no «sin acción ni reunión». Con la reunión la semana que viene: «…falta la acción de esta semana» (la reunión
  no resuelve la de esta).
- **Nexus sugiere el siguiente paso con esa reunión** (`siguientePasoDeLaReunion`, lib/mi-dia/servicio.ts, sin IA): el
  título de la reunión, con la fecha de la reunión, para quien lleva la cuenta. Casi siempre es un problema de seteo: el
  paso existe y es esa reunión. Va debajo de la línea, en azul con la chispa, con «Usar» y «Descartar», en «Lo que importa
  hoy», «También para hoy» y la cartera. Solo con una reunión del CALENDARIO dentro de la semana de la regla: una
  planeada en Tareas ya es una tarea, y una de la semana que viene no resolvería la acción de esta. La reunión es de la
  cuenta solo si `cuentaDelEvento` la resuelve a UNA empresa (invariante 1).
- **«Usar» crea la tarea por el escritor único** (`crearTarea`, `origen = "paso"`, `origenId = paso-reunion:<cuenta>:<evento>`:
  dos clics no crean dos) y pone al día HubSpot (`sincronizarCuenta`). No reescribe otra tarea: un siguiente paso más
  lejano queda como está, y la nueva, que es más temprana, pasa a ser el siguiente paso. Lo decide quien lleva la cuenta
  (el encargado de un proyecto abierto de CS) o quien lidera Customer Success; para otra persona, la tarea es de quien
  lleva la cuenta. ⛔ Lo que dice el navegador no se usa: el servidor vuelve a calcular la sugerencia con el calendario de
  quien la lleva y tiene que ser el mismo evento (lib/mi-dia/paso-sugerido-server.ts). Con «Ver como», no se escribe.
- **«Descartar» se guarda por persona y evento** (`SugerenciaDescartada`, SQL `2026-10-19-sugerencias-descartadas.sql`,
  aplicado el 2026-10-19): no vuelve; una reunión nueva es otra sugerencia. Se lee y se escribe con SQL parametrizado, así
  el módulo no depende de regenerar el cliente; el modelo está en el schema y la salud del esquema lo vigila.
- **Medido el 2026-10-19 (lunes, solo lectura, `scripts/medir-cuentas-sin-accion.ts`)**: Juan Carlos Armijos, 16 cuentas
  en la regla (12 sin ninguna de las dos, 4 con la sugerencia; en su cartera, 19 en «Sin acción o reunión»); Heiver Gomez,
  13 (7, 5 y 1 solo sin reunión; 13 en la vista); Caroline Bersot, 4 (2 y 2; 4); Alexander Vanegas (CSL), ninguna propia, «Juan Carlos
  Armijos tiene 16 cuentas que piden atención» y «Heiver Gomez tiene 13…», cada una con todos sus enlaces, y 47 de 48
  empresas en la vista. En las cuatro, todas las de la regla están en la vista nueva.

## El cronograma y el cierre del ciclo de SmartLoop (2026-10-17, ficha E)

- **El cronograma del ciclo es el `ProjectTimeline` del proyecto**, no otro modelo: cada caso de uso es una fase
  (`CasoDeUso.faseId`) y sus dependencias del cliente son tareas `party=CLIENTE` de esa fase. Así el Gantt, «Lo que debe
  el cliente» y los hitos ya lo leen.
- **La versión aprobada vive en el ciclo** (`CicloDeProyecto.cronogramaAprobado`), no en `TimelineBaseline`: la baseline
  es del proyecto entero y la usa la cartera.
- **Si una dependencia del cliente se atrasa, Nexus propone correr la fase**; nunca lo hace solo.
- **Cerrar un ciclo congela sus documentos** con una foto protegida de cada uno y los deja en «Ciclos anteriores»; el
  ciclo siguiente sigue escribiendo en los mismos documentos. Lo que «pasa» vuelve al plan y entra al ciclo siguiente.
- **El traductor de propuestas** (`lib/servicios/traductor.ts`): un tramo es un ciclo; el avance es el que declara la
  propuesta, nunca deducido de la fecha; solo carga en un proyecto sin historia. Pone el ancla del cronograma solo con
  el clic de una persona o el `--apply`.

## El libro financiero: lo pagado, las licencias revendidas y los gastos financieros (2026-10-17, ficha F)

- **«Lo pagado»** (Conciliación): la lista de lo que Odoo y Mercury dan por pagado se confirma desde la pantalla con la
  firma de quien la aprueba. Se escribe solo lo que la persona marcó y el servidor vuelve a decidir; si el día del pago
  cambió desde que lo vio, esa cuota se pega a su factura pero no se cobra. ⚠ Desde el 2026-10-18 lo seguro se cobra
  solo cada mañana y esta lista queda para lo que necesita a una persona (ver «Lo pagado se cobra solo»).
- **Licencias revendidas** (`LicenciaRevendida`, una viva por cuenta y moneda): el porcentaje de servicio de cada
  contrato. Reemplaza el parche de kölbi con los mismos números. Por defecto el punto de equilibrio cuenta solo el
  servicio (`SOLO_SERVICIO`); si dirección decide en «Para decidir» que la licencia cuenta como ingreso completo, su
  costo entra como estimado y queda fuera de la huella del cierre.
- **Gastos financieros** (`GastoFinanciero`): las comisiones de Stripe y de las transferencias salen de la copia de
  Mercury como candidatos; nada entra solo, y solo lo confirmado suma al equilibrio, en el rubro FINANCIERO.
- **El detalle de una factura** de Odoo o de Mercury se lee del sistema al abrirlo; no se guarda.
- **Mercury en «Facturación por cliente»**: `Paid` = cobrado; `Unpaid` y `Processing` = por cobrar; `Cancelled` no cuenta.

## Cada reunión con su página (2026-10-17, ficha G)

- **La agenda de una reunión** es lo que escribió una persona (manda), la descripción de la invitación del calendario
  (`FirefliesSession.descripcionDelEvento`, la guarda la sync de Meet) y la próxima reunión que dejó agendada otra
  reunión del mismo cliente a ±3 horas.
- **Los avisos se calculan al leer** y suman los avisos de «Para ti» de quien mira que llevan a esa reunión. Las tareas
  de la reunión tienen su propia sección, con responsable.
- **El correo de seguimiento de cualquier reunión con un cliente es el mismo de las exploraciones**
  (`escribirElCorreoDeSeguimiento`). Nexus no envía nada.
- **La próxima reunión se agenda por enlace** de Google Calendar, con su objetivo en la invitación; «Ya la agendé» es la
  palabra de la persona. `SeguimientoDeReunion` cuelga de la reunión, no del cliente.

## El chat de Nexus sobre la cuenta (2026-10-17, ficha H)

- **El modelo nunca elige la empresa.** Las herramientas van sin `clientId`: el servidor pone la del hilo y verifica
  contra la cuenta todo lo que se nombra. Una operación que no declara cómo se acota (`COMO_SE_ACOTA`) no llega al chat.
- **Un hilo por cuenta y por persona** (`HiloDeChat.clientId`, la pieza `nexus`).
- **Propone con la capa de operaciones** en una lista que se aplica con un clic; aplicar la lee del hilo, la vuelve a
  preparar y corta en la primera que falla.
- **Costo y topes:** cada turno deja su `AgentRun` y cada llamada su `LlmCall` con `origen = "nexus-chat:<hiloId>"`. 40
  mensajes y US$3 por persona por día, 6 vueltas por turno y 15 cambios por lista.
- **«Sugerencias» sin IA**: como mucho 5 por cuenta, con el mensaje de WhatsApp listo para copiar. Nexus no envía nada.

## La semana: agenda por cuenta y «Planifica tu semana» (2026-10-17, fase 2)

- **Un solo resolvedor de evento → cuenta** (`cuentaDelEvento`, lib/mi-dia/agenda.ts): un evento cuenta para una cuenta
  solo si es de UNA empresa (invariante 1). El calendario de cada persona para los próximos 8 días se lee una vez y se
  guarda dos minutos (lib/mi-dia/calendario-server.ts). Lo usan la regla de servicio, «Próximas reuniones» de la ficha,
  «Planifica tu semana» y «Agendar». La exploración (lib/exploraciones/agendadas.ts) sigue con su propia regla: pregunta
  otra cosa (si un evento es con ESTA empresa, por la gente de sus reuniones pasadas).
- **«Planifica tu semana» va en Tareas** (`/tareas/planificar`), no en «Para ti»: lo que deja son tareas, y es el par de
  «Revisa tu semana». «Para ti» la ofrece de viernes a domingo a CSE, CSL y Desarrollo (`invitacionAPlanificar`,
  lib/mi-dia/planificar.ts; hasta el 2026-10-18, solo el viernes). Desde el viernes planifica la semana que
  viene; de lunes a jueves, lo que queda de la actual. Por cuenta: la acción con fecha (la que hay, darle fecha a una
  abierta o una nueva) y la reunión sugerida en el primer hueco laboral, con su objetivo. Sin IA. La CSL planifica las
  cuentas que lleva y las que no lleva nadie, como mucho 40. Ajustarla por chat queda para después.
- **La agenda de «Para ti» abre en la semana** (2026-10-18, validación 9; `vistaPedidaDeLaAgenda`): sin `?agenda`, la
  semana; `?agenda=dia`, el día. No se guarda por persona: la vista va en la dirección. En fin de semana abre la semana
  que viene. Con la semana de hoy en pantalla, lo de hoy (los números y el resumen) sale de esa misma semana
  (`reunionesDelDia`): el calendario no se lee dos veces por visita. (Hasta el 2026-10-19 también abría sola la próxima
  reunión: ver «La agenda de «Para ti» es la de Google Calendar».)
- **Cada hueco de hoy sugiere con qué avanzar**: la tarea más importante que cabe, con «Ponerla en la agenda». Se ve en el
  día y en la columna de hoy de la semana.
- **«Agendar» propone hora en todas las listas**, y si hay varias cuentas, cada una recibe una hora distinta.
- **Guardar la reunión en Calendar crea la tarea de clase «reunion»** (`planearReunion`, sin duplicar), así la cuenta
  cuenta como con reunión.
- **Una reunión cuyo texto cambió retira sus propuestas sin decidir** (`retirarPropuestasDeLaReunion`): quedan vencidas
  con su motivo, no cuentan para el tope de 5 por persona y liberan su clave (`:retirada:<hora>`) para que la lectura
  nueva pueda volver a proponerlas. Cierra el pendiente de la ficha C.

## Uso de Nexus: las seis pestañas (2026-10-17)

- **Se suman IA por cliente, Procesos de IA y Conclusiones** a Equipo, Para qué se usa y Reuniones sin grabar. Solo
  dirección. El gasto de IA se muestra por proceso y por empresa, nunca por persona. Una llamada sin empresa toma la de
  su corrida o la de la reunión que la disparó; si no, queda en «Sin empresa».
- **El avance del cronograma que corre después de cada reunión cuenta como «corre solo»**, aunque la lectura la haya
  pedido una persona.
- **Un agente sin familia va a «Otros» con su nombre técnico**; una llamada sin agente, a «No se sabe de qué proceso
  es». Ninguna de las dos se reparte entre los procesos.
- **Las conclusiones salen de reglas fijas** (`UMBRALES`, lib/uso/conclusiones.ts), sin IA, y con pocos casos no
  concluyen nada.
- **Equipo y Para qué se usa dicen qué usa y qué desestima cada equipo**, con «Quién decide» por nombre y por equipo.

## El IVA en la propuesta comercial (2026-10-17)

- **Tres formas, elegidas en la Inversión**: sin IVA (como siempre), «+ IVA (13%)» (los montos van sin impuesto: se
  suma el IVA y el total con IVA) o «IVA incluido (13%)» (se desglosa la base y el IVA; el total no cambia). La cuenta
  es pura (lib/landing/iva.ts): 2 decimales, base + IVA = total al centavo, una moneda a la vez; si las monedas se
  contradicen, no hay total ni IVA.
- **El IVA va solo en el cierre**, sobre los números que se firman (pago único, por mes, gran total o el subtotal cuando
  hay un solo grupo). Los renglones siguen diciendo lo que escribió Ventas, y un subtotal que no es el total no lleva
  desglose: sumar dos desgloses no daría el del total al centavo.
- **Se ofrece en Costa Rica**: el país sale primero de la cuenta de cobro si alguien la configuró (nace «nacional» por
  defecto), después de la copia de Partner, después de la preventa (lib/business-cases/pais-del-cliente.ts). Sin saberlo,
  Ventas lo puede elegir igual, con un aviso. Manda la cuenta de cobro porque es Finanzas quien factura con IVA.
- **Lo publicado no cambia**: `iva` es presentación (entra a `NO_CONTENIDO`, como `contrato`), y «Sin IVA» lo borra.

## SmartLoop: recomendar la recurrencia y la ruta del servicio (2026-10-17, etapas 6 y 7)

- **La recomendación de pasar a SmartLoop es un tipo más de lo propuesto** (`recomendacion-de-recurrencia`, 30 días):
  una implementación de CS en «Entrega», o en «Finalizado» hace 60 días o menos, en una cuenta sin un servicio
  recurrente vivo. Sale en el «Qué sigue» del proyecto y en «Para ti» del CSE encargado. El porqué se arma sin IA (la
  escala, lo fuera de alcance, los casos de uso y el uso de HubSpot, este último solo para la CSL, dirección y el CSE de
  la cuenta), y por eso va sin la chispa. La deciden el CSE, la CSL y dirección; lo decidido vive en
  `RecomendacionDeRecurrencia` (solo `projectId`). Ningún botón escribe en HubSpot.
- **La ruta del servicio para el cliente es por proyecto** (`/external/ciclos/[acceso]`): con el mismo acceso y
  contraseña que las otras páginas del cliente y una foto congelada al subirla, como la Entrega. Sin el porqué de los
  casos, notas, citas ni montos. Por proyecto y no por cuenta: así la dirección nunca muestra otro proyecto.
- **SmartLoop se da de alta desde Nexus**, y los recordatorios de adopción y la clasificación de la cartera lo cuentan
  como recurrente. `scripts/migrar-continuidad-a-smartloop.ts` (simulacro por defecto) lista los de «Continuidad» con la
  etapa que deduce Nexus; la etapa la confirma Customer Success y el cambio de pipeline en HubSpot lo hace una persona.

## La foto del margen de cada mes (2026-10-17, E6)

- **Dos tablas**: `FotoMargenMes` (por mes: la planilla, las horas, el costo de la hora, la versión de los supuestos y
  el tipo de cambio) y `FotoMargenCuenta` (por cuenta y mes: lo cobrado, las horas por origen, el costo con los tres
  modos y el margen), todo en dólares. Escritor único: lib/rentabilidad/foto-server.ts, con el mismo cálculo de la
  pantalla (`cargarRentabilidadDelRango`); escribir el mismo mes dos veces deja lo mismo.
- **El job `rentabilidad-foto-mensual`** (día 3 ≥ 7:00 CR) no pisa una foto que existe; «Volver a tomar» pide motivo.
- **Un período de varios meses es la suma de sus meses**: cada mes va al costo de la hora de ese mes. Si ningún mes del
  período tiene foto, se calcula en vivo en una sola pasada, así que cuando aparece la primera foto los números de un
  trimestre pueden moverse unos centavos. Rentabilidad sigue sin mostrar el mes en curso.
- **`FotoMargenCuenta.clientId` va sin FK, a propósito**: es una foto del pasado, como `ResultadoDeSemana`
  (`SE_QUEDAN_A_PROPOSITO` en la fusión de empresas). Solo dirección (`guardCostosAccess`).

## Entregables con plantilla (2026-10-17, fase 5)

- **El riel en dos grupos**, desde el registro de piezas (`PieceDefinition.clase`): «Herramientas del proyecto»
  (Resumen arriba, Cronograma, Cuestionarios, Exploración, Ejecución y los canvas que crea el CSE) y «Entregables»
  (Kickoff, Diagnóstico, Planificación, Integraciones, Entrega). Las herramientas van primero porque el Resumen lo
  encabeza. En un SmartLoop no cambia: sigue el grupo del ciclo.
- **El registro de entregables** (lib/entregables/registro.ts, congelado por test) dice qué agente escribe cada uno y
  qué plantillas tiene. El diagnóstico de hoy es la plantilla «Diagnóstico estratégico»; el documento se sigue llamando
  Diagnóstico. La plantilla usada queda en el Json del canvas (`__plantilla`), sin columna nueva; sin ella, se lee con
  la de siempre, así los kickoffs y diagnósticos que existen no se tocan. Sin selector todavía: hoy hay una por
  entregable.
- **Una sola función genera cualquier entregable** (`generarEntregable`), con la misma corrida, medidor y permiso que
  /analyze, que la usa. El kickoff salió de /analyze a lib/canvas/kickoff-generate.ts con el mismo mensaje y la misma
  forma de guardar.
- **El chat genera un entregable** con la operación «documento.generar»: queda en la lista y corre solo al aplicarla,
  con el proyecto verificado contra la cuenta del hilo y el mismo permiso que el botón. Las instrucciones del chat valen
  solo para esa generación: no pisan las «Instrucciones adicionales» del documento.

## Un excliente sale de todo, y «Lo que importa hoy» no deja nada fuera sin decirlo (2026-10-17)

> Elías, validando «Para ti» en producción: Wherex ya no es cliente y seguía en las alertas y en las carteras (le
> quedó un proyecto activo en HubSpot). Y en «Lo que importa hoy», lo que no entra en las cinco no puede quedar abajo
> como si fuera lo de menos.

- **La relación CONFIRMADA «excliente» manda sobre los proyectos activos y las suscripciones** (lib/cs/exclientes.ts).
  Lo propuesto por Nexus no alcanza: confirma la CSL. La cuenta sale de la cartera (`enCartera: false`), de «A quién
  llamar», de las lecturas de la cuenta, de las carteras del CSE y de la CSL, de «Para ti» (`alcanceDe` la saca de tus
  cuentas, así que tampoco hay «Cuenta sin acción» ni nada de lo que se mide con tus proyectos) y de los recordatorios
  de adopción. Sus alertas no se crean (vigía, avisos de renovación, lectura de reuniones) ni se muestran. Se ve solo
  en Éxito del cliente › Cartera › «Fuera de la cartera», marcada «Excliente», con lo que le sigue activo.
- **Un solo punto.** Las consultas usan `CLIENTE_NO_EXCLIENTE_WHERE` (o `CLIENTE_DE_CS_SIN_EXCLIENTES_WHERE`), los que
  arman en memoria `cuentasExcliente()` (lib/cs/exclientes-server.ts) y los que ya tienen la clasificación a mano,
  `esExcliente()`. Nadie escribe `relacion: "excliente"` en una consulta, y `lib/cs/exclientes.test.ts` vigila que
  cada lector siga aplicando la exclusión.
- **Nexus no contradice al excliente confirmado**: no le propone «Proyecto en curso» por el proyecto que quedó abierto.
  Si el cliente volvió, la CSL cambia su relación. Nexus propone «excliente» cuando no queda nada activo hace más de un
  año, o cuando la cancelación de HubSpot ya corrió y no queda nada activo.
- **Lo que sigue activo se pide cerrar en la lista de limpieza** (motivo `excliente-activo`, el primero de la lista):
  el proyecto abierto en HubSpot, a su encargado; el servicio recurrente en Cobranza, a quien lidera Customer Success.
  Es el único lugar que todavía nombra a la cuenta, a propósito.
- **Las alertas que ya estaban abiertas** quedan escondidas; las cierra `scripts/cerrar-alertas-de-exclientes.ts`
  (simulacro por defecto, `--apply` con respaldo), que con `--marcar <clientId> --por <correo>` también confirma la
  relación. El job de renovaciones no las toca: cerrarlas con «la renovación ya pasó» diría algo falso.
- **«Estabilizar N cuentas»** (lib/para-ti/importa.ts): si las cuentas QUE LLEVA una persona (el encargado en HubSpot)
  que quedan fuera de sus cinco llegan a `UMBRAL_PARA_ESTABILIZAR` (3), la quinta cosa pasa a ser «Estabilizar N
  cuentas», con el enlace a cada una; lo demás sigue en «También para hoy». *Por qué 3:* una o dos que no entran se
  leen justo debajo y es cuestión de orden; con tres o más es carga. Solo cuentan las suyas: a quien lidera le llegan
  alertas de cuentas que no lleva. El correo de la mañana no cambia.
- **A quien lidera Customer Success: «<CSE> tiene N cuentas que piden atención»** (fuente `cs-estabilizar`), una línea
  por CSE con al menos `MIN_CUENTAS_PARA_ESTABILIZAR` (7 = las 4 que le entran más el umbral). Cuenta las dos señales
  que llenan primero los cinco de un CSE: la cuenta en riesgo y la cuenta sin su acción o su reunión de la semana. Se
  calcula al leer, sin tabla nueva.
## Actualizar escala: la escala de cada empresa con todo lo que Nexus sabe (2026-10-18)

**Contexto.** Iniciativas 1 (pasos 2 y 3) y 2 de «La siguiente serie» (docs/roadmap.md). Elías: ubicar a cualquier cliente
en la escala de forma retroactiva, con todo el contexto (lo vendido, las reuniones, las tareas, el handoff), con un
botón por cliente que nunca corre solo ni para todos, y la historia amarrada a la venta. La auditoría del 17 oct
encontró que «Regenerar» leía en modo `leer` (marcaba lo leído y rearmaba la guía), no leía lo vendido, las minutas, las
tareas, el cronograma ni la memoria, y que un cliente sin proyecto ni preventa no tenía botón. Medido el 18 oct: 93 de
165 clientes no tienen ningún proyecto en Nexus (69 de ellos con ventas ganadas) y 52 tienen varios proyectos activos.

- **«Actualizar escala» es un modo propio del agente, `posicionar`** (lib/exploraciones/agente.ts ›
  `posicionarLaEscala`). Propone SOLO niveles, cada uno con la frase del cliente verificada (`leerLaRespuesta` en modo
  «leer»). No marca nada como leído, no toca la guía ni la foto de HubSpot, y deja su corrida en la historia del lienzo.
  Lo dispara una persona desde La cuenta › La escala (POST `/api/clients/[id]/escala` `actualizar`): nunca corre solo.
- **Lee todo por puertas que ya existen** (lib/exploraciones/posicionar-fuentes.ts): la memoria de la cuenta y del
  proyecto por el cargador (lector nuevo `escala`, interno), las tareas por lib/tareas/para-agentes.ts
  (`tareasDeLaCuentaParaAgentes`), las reuniones ya leídas en resumen por el chokepoint (`reunionesEnResumen`, sin las
  de puertas adentro), HubSpot sin marcar (`fuentesDeHubspotSinMarcar`), el handoff, los cuestionarios, el kickoff y la
  preventa (`fuentesDelProyecto`), las ventas ganadas, las propuestas con su inversión (servicios y licencias aparte) y
  el cronograma.
- **Sin una pista del cliente no hay nivel, igual que siempre**: las fuentes nuevas (G ventas, B propuestas, J0 tareas,
  R0 cronograma, A0 y A1 la memoria) no cuentan en `esFuenteDelCliente`. Comprar algo no es usarlo, e implementarlo no es
  que ya funcione. Sin ninguna fuente del cliente, el agente no llama al modelo y lo dice.
- **Sobre qué se ubica, y con qué venta** (`objetivosParaUbicar`, puro): cada proyecto (vivos primero, después los
  terminados), la preventa viva y siempre «La cuenta entera». La venta sugerida de un proyecto es la de su mismo trato de
  HubSpot; de la preventa y la cuenta, la más reciente. Se cambia en la pantalla.
- **La cuenta entera se ubica en la exploración del proyecto «Información del cliente»** (el contenedor de cada empresa,
  `ensureClientInfoProject`). *Por qué:* es la forma más simple que reusa todo (la exploración de proyecto, su guarda,
  «una viva por proyecto»), sin SQL. *Se descartó* una exploración sin proyecto con un marco nuevo: chocaba con «una
  preventa viva por empresa» (índice parcial sobre `projectId IS NULL`) y se colaba en las 23 lecturas de preventas
  (`DE_LA_PREVENTA`). *Y* abrir una preventa: aparecería en el listado y en «Para ti» sin que haya una venta en curso.
- **Lo propuesto se usa en la misma ficha** (`nivelesPropuestos`, con su porqué, su frase y su fuente), uno por uno o
  todos, por el PATCH de la exploración: el mismo escritor que La escala de la exploración, que sube la versión y deja la
  versión del día. Lo propuesto nunca entra a la historia; lo confirmado, sí.
- **La versión de la escala sabe de qué venta y de qué momento es** (SQL `2026-10-18-escala-ligada-a-la-venta.sql`):
  `ventaGanadaId`, `businessCaseId`, `hubspotDealId`, `momento` («al-vender», «al-arrancar», «hoy») y `diaDeLaPosicion`.
  Sin elegir la venta, sale sola del trato de HubSpot del proyecto, y la propuesta, de esa venta. «Al vender» fecha la
  posición el día en que se ganó; «al arrancar», con el arranque del cronograma (o el alta del proyecto); sin el dato,
  no se inventa (`fechaDelMomento`). Una versión de un momento del pasado se guarda aunque los niveles sean los mismos.
  La historia se ordena por el día de la posición (`ordenarVersiones`).
- **«Se mide con…»** (`modeloDeNegocio`, puro): la edición, el perfil (cómo vende y qué pasa después de la venta), por
  qué (la razón guardada, o la industria de HubSpot) y lo que cambia frente a la general, sacado de la edición misma
  (sus palabras, las dimensiones dichas con su lenguaje, los criterios propios y los que no aplican). Toma cualquier
  edición publicada sin nombrarlas. «Corregir» va por el mismo PATCH (`edicion`, `perfil`), y desde ahí el agente ya no
  la cambia. Las preguntas de la exploración, la lectura de cada nivel y el pedido de «posicionar» ya usaban la escala
  con la edición y el perfil de la exploración (`escalaDeLaExploracion`).
- **Costo**: una llamada a Sonnet 4.6 por corrida, sin búsqueda web. Estimado con los topes de las fuentes: entre 15.000
  y 45.000 tokens de entrada y 1.000 a 3.000 de salida: unos US$0,05 a US$0,20. No se midió con una corrida real.

## El servicio recurrente, dentro de la ficha del cliente (2026-10-18)

**Contexto.** Roadmap «La siguiente serie», iniciativa 4 y pasos 1, 2 y 7 de la 3. Elías pidió algo simple: que el CSE
entienda un servicio recurrente y lo lleve con cadencia, rutinas y tareas, sin un sistema de ciclos nuevo. Y que las
propuestas distingan proyecto de servicio recurrente, porque hay más recurrentes que SmartLoop (sitio web, soporte de
HubSpot, contenido; después SEO, AEO, redes, IA en marketing, rediseño web).

- **Un catálogo, no pantallas por servicio** (`lib/servicios/catalogo.ts`): cada servicio declara nombre, qué incluye,
  cadencia, reuniones fijas, tareas que se repiten, nivel de servicio, dónde vive en HubSpot y, si avanza por ciclos, su
  guía y sus etapas. Hoy: SmartLoop, Administración de sitio web, Soporte y continuidad de HubSpot, Contenido y marketing
  mensual. Sumar uno es una entrada; la propuesta, la guía del Resumen, las rutinas y «Pasar a recurrente» salen de ahí.
  ⚠ La cadencia y las rutinas de los cuatro están **a validar con Elías** (`validado: false`, paso 7 de la iniciativa
  4), y la guía lo dice.
- **Ser recurrente no es avanzar por ciclos.** Solo SmartLoop tiene ciclo; los demás se llevan con su cadencia y sus
  rutinas. Los ciclos (`CicloDeProyecto`, `CasoDeUso`, cronograma y cierre) no cambian.
- **El servicio de un proyecto** es `Project.servicioRecurrente` (texto, clave del catálogo) y, si no hay, el del
  pipeline (SmartLoop). `servicioDesde` marca desde cuándo corre: lo de antes queda como historia. SQL aditivo
  `scripts/sql/2026-10-18-servicio-recurrente.sql`, antes del deploy.
- **La guía en el Resumen** (`components/servicios/GuiaDelServicio.tsx`): qué se entrega, cadencia, qué toca ahora y las
  rutinas. En SmartLoop, la tarjeta de la etapa dibuja las cinco etapas como un **círculo** en vez de una barra
  (`CicloEnCirculo`, geometría pura en `lib/servicios/circulo.ts`), con lo que falta para pasar de etapa debajo, como
  siempre. Mientras el proyecto no está en el pipeline de SmartLoop, el círculo va en la guía.
- **Las rutinas** (`lib/servicios/rutinas.ts`): las reuniones fijas se proponen como un enlace de Google Calendar ya
  armado como serie (RRULE), y la persona dice «Ya la agendé». ⛔ Nexus nunca escribe en el calendario. Las tareas que se
  repiten se crean por el escritor único de Tareas (`origen = "plantilla"`), de a dos meses, con una clave por semana
  (`servicio:<proyecto>:<rutina>:<lunes>`), así la ventana siguiente nunca duplica. Tareas no tiene tareas que se repitan
  solas y no hizo falta: la guía avisa cuando la ventana se está terminando. Lo hecho vive en `Project.servicioRutinas`.
- **«Pasar a recurrente» desde la ficha** (botón en la tarjeta de la etapa, CSE, CSL y dirección): reemplaza el uso de
  `scripts/migrar-continuidad-a-smartloop.ts`. Nexus propone la etapa del ciclo (la misma `etapaAlMigrar`) y, si el
  proyecto no está en el pipeline y la etapa del servicio, deja una **tarea** para que una persona lo mueva en HubSpot.
  ⛔ Nexus no mueve el pipeline. Si el servicio tiene ciclo, abre el ciclo 1 en la etapa confirmada; `ciclos-server` ya
  reconoce el servicio elegido en Nexus mientras el pipeline no se mueve.
- **La propuesta: proyecto o servicio recurrente.** Al crearla se elige primero la modalidad; el tipo
  `servicio_recurrente` tiene un subtipo por servicio del catálogo (`caseSubtype` = la clave, sin SQL) y siembra el tag
  `recurrente`. Su plantilla `recurrente_v1` nace de lo que Ventas vendió a mano a Cayalá y a Grupo Inve: qué contiene
  el acuerdo, cómo opera, cómo trabajamos (el ciclo como ciclo), casos de uso, nivel de servicio, antes y después e
  inversión mensual. Las tres secciones que son **compromiso** (cómo opera, el ciclo, el nivel de servicio) las escribe
  Nexus desde el catálogo (`agentGenerated: false`, sembradas solo si están vacías), nunca el agente; Ventas las ajusta.
  Las propuestas ya publicadas no cambian: es una plantilla nueva.
- **Al ganarse, el proyecto nace con su servicio** (`servicioQueTraeLaPropuestaEnTx`, en el alta): por el enlace
  «Dar de alta el servicio» de la propuesta aprobada o por el trato, siempre en el mismo cliente. Queda con el servicio,
  desde hoy, y con los casos de uso de la propuesta en su plan (origen «propuesta»). Reemplaza a
  `scripts/cargar-propuesta-en-ciclo.ts` para lo nuevo; ⛔ la propuesta no se toca.
- **FACO, Colby, Cayalá y Grupo Inve** (`scripts/propuestas-recurrentes-internas.ts`, en simulacro): una propuesta
  recurrente NUEVA e interna por cliente («… · interna», nunca se publica) que copia los casos de uso y la inversión de la
  firmada, sin tocarla, y le asigna el servicio a su proyecto recurrente. Colby va con SmartLoop hasta confirmar. ⛔ Nunca
  Wherex.
## Licencias y servicios separados, y lo vendido llega a Finanzas (2026-10-18)

> «La siguiente serie», iniciativa 3, pasos 3 y 4. Decisiones de Elías (2026-10-17): el costo de las licencias lo anota
> Ventas en la propuesta; ese costo es público (el precio de lista del proveedor), y si al cliente se le cobra más la
> diferencia tiene que llegar a Finanzas; Finanzas tiene que poder volver a leer las propuestas ya ganadas.

- **El precio de lista vive en la línea de licencia, en el mismo `CanvasBlock.data`, sin SQL**
  (`lib/landing/inversion-costo.ts`): `costoLista` (lo que se le paga al proveedor por toda la línea), `costoMoneda`
  (vacío = la de la sección), `costoCada` (mensual · anual · una vez; vacío = sigue a la línea) y `quienFactura`
  (`smarteam` = reventa · `proveedor` = el cliente le paga directo · vacío = sin decir). El editor los muestra en un
  renglón punteado debajo de cada licencia, con el margen (lo cobrado − el costo, en el mismo período). *Por qué
  `quienFactura`:* una licencia de la propuesta no siempre pasa por Smarteam (en Cemaco el cliente le paga directo a
  HubSpot y Smarteam cobra la comisión de aliado); solo una reventa entra en los cobros y su costo es un gasto.
- **⛔ Lo interno nunca cruza al cliente, y se hace cumplir en código:** `sinLoInterno` saca las cuatro claves del
  snapshot que congela «Subir al cliente», de la lectura de la propuesta publicada (otra vez, por si acaso) y del PDF.
  Los agentes no las ven por construcción: la inversión es `agentGenerated:false` y su schema no declara propiedades.
  Lo vigila `lib/landing/inversion-costo.test.ts` (escaneo estructural de los tres caminos + el schema).
- **El margen no compara monedas distintas ni períodos distintos.** Un costo anual se lleva a mes dividiendo por 12
  (eso no es convertir moneda); un costo en colones de una propuesta en dólares, o un costo mensual de una línea de
  cobro único, dicen «no se compara». Los motores siguen sin convertir.
- **Un solo lector de lo vendido para Finanzas** (`lib/finanzas/lo-vendido.ts`, puro; carga en `lo-vendido-server.ts`).
  Ganada = el trato de HubSpot de la propuesta está en `VentaGanada` como GANADA, no excluido y de venta propia. Se lee
  la versión ACTIVA (no el snapshot, que ya va sin lo interno); con dos propuestas en el mismo trato, la publicada más
  reciente. Sin moneda en la propuesta se usa la del trato de HubSpot, y lo dice.
- **Una propuesta ganada reemplaza a la carga a mano de `LicenciaRevendida` solo si trae el dato completo:** Smarteam
  factura al menos una licencia, de ninguna falta decir quién la factura, cada una tiene su precio de lista comparable,
  todo se pudo leer, la moneda es USD o CRC y el cliente tiene cuenta de cobro. Si falta algo, `porQueNoEntra` lo dice y
  no se inventa: sigue rigiendo lo cargado a mano. *Cómo reemplaza:* sus contratos van PRIMERO en la lista
  (`combinarLicencias`) y `parteDeServicio` y `egresosDeLicencias` toman el primero que rige cada mes para esa cuenta y
  moneda; fuera de sus meses sigue la carga a mano. `egresosDeLicencias` aprendió esa regla para no contar el costo dos
  veces (con la carga a mano sola no pasaba: la base impide dos vivos por cuenta y moneda).
- **No cambia qué cuenta como ingreso.** El contrato que sale de una propuesta pasa por la misma regla ya decidida
  (`SOLO_SERVICIO` mientras dirección no decida otra cosa en «Para decidir»), igual que uno cargado a mano. El punto de
  equilibrio muestra, dentro de «Licencias revendidas», «Lo vendido según las propuestas ganadas»: servicio, licencias,
  margen y si entra o por qué no. El vendido del año (`VentaGanada.monto`) no se toca.
- **El recálculo retroactivo es en vivo**: el equilibrio vuelve a leer las propuestas ganadas cada vez que se abre.
  `scripts/recalcular-lo-vendido.ts` (simulacro por defecto, conexión de solo lectura) lo muestra antes, propuesta por
  propuesta y mes a mes (lo facturado, cada moneda aparte, sin convertir), con la cobertura. Con `--apply` solo archiva
  los contratos a mano que una propuesta reemplaza enteros. Medido el 2026-10-18: 6 propuestas ganadas, 3 venden
  licencias, ninguna trae el precio de lista ⇒ el equilibrio queda exactamente igual hasta que Ventas lo anote.
- **Pendiente de Elías (no frena nada):**
  1. *Cuánto dura el contrato que sale de una propuesta.* Se supone `MESES_DEL_CONTRATO = 12` desde el cierre (la
     propuesta no dice la duración; 12 es lo habitual en HubSpot). Cambiarlo es una constante.
  2. *Si una licencia con precio de lista pero sin decir quién la factura cuenta.* Hoy no (fail-closed).
  3. *Si «Lo vendido según las propuestas» debería sumar al vendido del año o compararse con él.* Hoy es solo
     información: el vendido sigue saliendo de HubSpot.
## Los módulos de las propuestas: nativos lo que se repite, biblioteca para lo demás (2026-10-18)

**Contexto.** Pasos 5 y 6 de la iniciativa 3 de «La siguiente serie» (docs/roadmap.md). Se revisaron las 66 secciones
personalizadas (HTML a mano) que Andrés Pinzón y Marco Salas armaron en 23 propuestas. Las del acuerdo recurrente (qué
contiene, SLA, cómo opera, SmartLoop) van en la plantilla recurrente, en otra tanda.

- **Un módulo nativo es un tipo más del catálogo de secciones creables** (`lib/landing/catalogo-de-secciones.ts`), no
  una sección de la plantilla. *Por qué:* el catálogo ya es lo que se agrega, se quita y se mueve con un clic (el
  editor y el chat ofrecen la misma lista), y la key `custom:<tipo>:<uuid>` lleva su tipo sin SQL. Agregarlas a la
  plantilla habría metido secciones en las propuestas ya publicadas, que se resuelven por key contra la config viva.
  Con el catálogo, una propuesta publicada no cambia: los tipos nuevos no existen en ella.
- **Tres tipos nuevos** (`lib/landing/modulos-nativos.ts`, renderers en `components/landing/sections-modulos.tsx`):
  «Casos de uso por proyecto» (pestañas por proyecto o área, cada caso con qué hace, qué obtiene el cliente y con qué
  herramientas; en el editor se puede traer un caso del catálogo de casos de Smarteam, `lib/casos-de-uso`),
  «Comparación de licencias» (planes enfrentados por necesidad, con el recomendado) y «Fases u opciones» (01, 02 para
  una ruta; A, B para elegir; la recomendada destacada). Ninguno lleva precios: la plata vive en la Inversión.
- **Lo demás que se repite ya era nativo** y no se duplicó: la arquitectura es el tipo «diagrama» (el motor de
  diagramas, ahora con el nombre «Arquitectura (diagrama)»), el antes y después es «comparación» (ahora «Antes y
  después»; el tipo en la key no cambia), la forma de pago es la sección de la plantilla debajo de la Inversión y el
  plan con Gantt es el cronograma. La calculadora de ROI apareció una vez: va por la biblioteca.
- **«Casos de uso por proyecto» no es la sección `use_cases`**: aquella sale del checklist con precios y sigue fuera del
  catálogo; ésta es el alcance funcional, sin un monto. Se enmendó el criterio 3 del catálogo para decirlo.
- **En el PDF no hay pestañas**: los grupos salen todos, uno debajo del otro, y la tabla de licencias no scrollea.
- **La biblioteca** (`ModuloDePropuesta`, SQL `scripts/sql/2026-10-18-biblioteca-de-modulos.sql`): «Guardar como
  módulo» en una sección personalizada guarda su tipo y una copia de su data; «Agregar módulo de la biblioteca» inserta
  otra copia en otra propuesta, con el id del módulo fuera del schema (`__moduloId`, en `NO_CONTENIDO`). Copia y no
  referencia: cambiar el módulo no cambia las propuestas donde ya se usó, y una propuesta firmada no se mueve sola. La
  ve y la usa todo Ventas (`guardSalesAccess`); archivar o renombrar, quien lo guardó o dirección. Archivar no borra.
- **⛔ Un módulo no lleva datos del cliente original sin avisar.** Al guardarlo se buscan en sus textos el nombre de la
  empresa (por palabras distintivas, sin tildes), sus dominios, correos, teléfonos y montos
  (`hallazgosDelCliente`). Si hay algo, el guardado responde 409 con la lista y quien guarda decide «Guardar igual»; lo
  encontrado queda en el módulo y se muestra cada vez que alguien lo va a insertar. No se limpia solo: borrar sin mirar
  rompe frases y no deja ver qué cambió.
- **«Adaptar a esta empresa» cambia textos, nunca el diseño** (`lib/landing/html-textos.ts`). El HTML se parte en
  segmentos de texto con su rango exacto (texto entre etiquetas, los atributos que se leen y las cadenas del script que
  son prosa: los tabs se arman casi siempre desde un `CONFIG` en JavaScript). La IA recibe solo la lista numerada y
  devuelve los que cambian; el HTML se rearma reemplazando esos rangos, así que una clase, un estilo o una línea de
  código no pueden cambiar. Una cadena con `<` o con `${` no se toca. Es una propuesta (`<AgentProposal>`): cada
  cambio con su antes y su después, se desmarca lo que no va y se aplica por el guardado de siempre. Si el HTML cambió
  desde que se pidió, no se aplica. La IA no cambia montos ni inventa datos: los anota para Ventas. Lo dispara una
  persona por sección (corrida `AgentRun` «Adaptar un módulo», agentSlug `business-case`, familia «venta» en Uso de
  Nexus). Mismo sandbox y misma CSP que cualquier sección personalizada: el HTML sigue corriendo en el iframe aislado.
- **En espera**: adaptar con IA las secciones estructuradas (hoy se adaptan con el chat de la sección), y los módulos
  del acuerdo recurrente (los hace la plantilla recurrente).
## El gasto de la IA, por mes (2026-10-18)

**Contexto.** Iniciativa 6 de «La siguiente serie». Medido ese día: US$26 en agosto (desde el 17), US$33 en septiembre y
US$77 en octubre hasta el 17 (~US$140 al mes al ritmo de hoy). Lo que más gasta: la preventa (US$21 en 30 días), la
lectura de cada reunión (US$14), el mapeo de procesos con Opus (US$14), llamadas sin agente (US$13) y el clasificador
de reuniones a proyectos (US$8,5, 365 llamadas). El panel leía 20.000 filas y no tenía meses, tope ni proyección.

- **El panel por mes vive en /integrations/gasto-ia y no en «Uso de Nexus»**: esto es plata, para decidir el gasto y
  cruzar la factura; Uso de Nexus mira para qué se usa la IA. Cuatro pestañas: Por mes, Proyección, Factura y Últimos 30
  días (la pantalla de antes). Solo dirección (`isCostosRole`, el mismo gate).
- **La base suma, sin tope de filas** (`lib/ai/gasto-mensual-server.ts`): por mes y modelo, por agente, por día, por
  reunión leída (`origen = "reunion:<id> › …"`) y por empresa (la de la llamada, la de su corrida o la dueña de su
  reunión, como en Uso de Nexus). La cuenta es pura y probada (`lib/ai/gasto-mensual.ts`). El mes y el día son de Costa
  Rica. **El ahorro de la caché** sale de la tarifa de cada modelo (`ahorroDeLaCache`) y puede ser negativo: escribir una
  caché que nadie lee es un recargo del 25 %, y se pinta así.
- **La proyección es una cuenta, no una predicción** (`lib/ai/proyeccion.ts`, `proyeccion-base.ts`): el costo unitario
  medido en 30 días (una reunión leída con todo lo que dispara su lectura, una corrida del vigía, un turno del chat, un
  mapeo de procesos) por el volumen esperado. Los escenarios (clientes, reuniones, servicios recurrentes, los hechos y
  las tres palancas de ahorro) se mueven en pantalla y no se guardan. Cada palanca usa la fracción MEDIDA sobre el
  componente que toca, y se componen sin sumarse dos veces.
- **La factura se anota a mano** (`FacturaDeAnthropic`, una fila por mes) y se compara con lo medido: más del 10 % y
  más de US$5 de diferencia piden revisar los precios de lib/ai/precios.ts o filas que el medidor perdió.
- **El tope, calibrado con lo gastado**: 10 USD por día lo automático y 20 lo humano (eran 15 y 60, provisorios).
  `topeSugerido` (el doble del día del percentil 95 o 1,25× el día más caro, redondeado a US$5) da esos mismos números
  con lo medido del 3-sep al 16-oct, y el panel lo recalcula con los últimos 60 días. **El bloqueo sigue apagado**
  (`PRESUPUESTO_IA_BLOQUEA`): lo que frena son los jobs.
- **Los jobs automáticos miran el presupuesto antes de arrancar** (`quedaPresupuestoAutomatico`): el barrido y el
  debounce del vigía, el vigía al entrar a un cliente (motivo «sin_presupuesto»), marketing, el reintento de Meet, las
  reuniones de sprint, la lectura de cada reunión (ya lo hacía) y el envío de los lotes. Sin presupuesto devuelven
  SIN_TURNO y lo del día espera, no se pierde. Lo que pide una persona no frena (solo avisa).
- **Las palancas del ahorro viven en `lib/ai/ahorro.ts`**, una constante cada una, con su ahorro medido y cómo volver
  atrás. Ahorro estimado por mes con el volumen de hoy (la proyección lo recalcula):
  · *Lectura y hechos comparten el prefijo* (~US$5,7 con los hechos prendidos; hoy US$0): la reunión va en el `system`
    con `cache_control` y las dos herramientas en `tools`; los hechos la leen a 0,1. Solo con los hechos activos. Los
    hechos verifican que el bloque de la reunión sea idéntico letra por letra antes de usarlo; sin el prefijo de la
    lectura (un reintento del job) van sin caché (`VARIANTE_DE_HECHOS = "aparte-sin-cache"`): antes escribían una caché
    que nadie leía. ⚠ La lectura pasa a leer la conversación comprimida; la compara
    `scripts/comparar-lectura-de-reuniones.ts --prefijo`.
  · *El clasificador con Haiku* (~US$5,6): **sigue en Sonnet** (`MODELO_DEL_CLASIFICADOR`) hasta que una persona mire
    `scripts/comparar-modelo-del-clasificador.ts` (simulacro, sin Wherex). Criterio: el mismo proyecto principal en el
    95 % o más y ninguna reunión que Haiku deje sin proyecto.
  · *El vigía cachea su prompt* (~2.000 tokens; centavos al mes: hoy corre al entrar a un cliente, de a uno o dos
    proyectos) y *no repite lo que no cambió*: un proyecto que entra al barrido solo por riesgo, con la misma huella de
    motivos que su último triaje de hace menos de 7 días, no se vuelve a triar (`lib/cs/vigia-barrido.ts`).
  · *La API Batch* (la mitad del precio): una sola puerta, `lib/ai/lotes-server.ts` (`PedidoEnLote`, job «ia-lotes»),
    con un manejador por tipo en `lib/ai/lotes-manejadores.ts`. Hoy la usa el barrido del vigía para lo que entra solo
    por riesgo (`VIGIA_BARRIDO_POR_LOTE`): la corrida se crea cuando llega la respuesta, así ningún reaper la mata
    mientras espera. ⚠ El barrido no corre en producción (las 70 corridas de 30 días fueron al entrar): el ahorro llega
    cuando se prenda `CS_WATCHDOG_ENABLED`. Los candidatos siguientes (~US$1,4: el avance y la ficha después de cada
    reunión; los reintentos de los hechos; marketing) se suman con una línea en `TIPOS_DE_LOTE` y su manejador.
  · *Una respuesta cortada no se paga dos veces*: la lectura va en un solo intento con 12.000 tokens de tope (el tope no
    se cobra; antes eran 6.000 y, si se cortaba, otra llamada entera con 12.000). Ninguna lectura de 30 días pasó de 4.502.
- **`LlmCall.lote`** marca lo que respondió la API Batch; el medidor la escribe solo en `true` y crea la fila pidiendo
  solo su id, así un deploy antes del SQL pierde las filas de los lotes y no las de todas las llamadas.
- **Pendiente:** 263 llamadas de 30 días (US$13,8, todas automáticas) no tienen agente ni origen: van a «No se sabe de qué
  proceso es». Están cerca en el tiempo de la lectura, el resumen del proyecto y la propuesta; atribuirlas es lo próximo.

## La preventa lleva a la siguiente pregunta lógica (2026-10-18)

**Contexto.** Iniciativa A del roadmap. El 17 oct Marco usó la preventa con Distribuidora Larce y la guía le hizo repetir
lo que el cliente ya había respondido en el diagnóstico: 8 preguntas con 3 repreguntas cada una, y la primera fue «¿Qué
pasa cuando un deal se queda quieto?», cuando el test decía que los deals que se enfrían mueren sin que nadie reaccione.
Las preguntas salían de las casillas vacías y de las dimensiones sin evidencia. El test y su nota de HubSpot estaban
guardados, pero el pedido de la guía no los leía. El plan está en `docs/preventa-guia-plan.md`.

- **«Lo que ya sabemos» arriba de la guía** (`lib/exploraciones/lo-que-ya-sabemos.ts`, puro): de 3 a 5 líneas con lo que el
  cliente ya respondió, con sus palabras y de dónde sale cada una. Entran las respuestas del test, las citas verificadas
  de cada dimensión (test, HubSpot, reunión, lo sumado a mano, el handoff, un cuestionario), la evidencia de un nivel
  confirmado en una reunión o en su portal, y las casillas confirmadas que dice el cliente (metas, retos, planes, tiempos,
  consecuencias, implicaciones). Una reunión pesa más que la nota, la nota más que el test y el test más que el Resumen.
  Nunca entran el presupuesto, quién decide, las objeciones, el contexto ni las notas del vendedor (N). De una tarjeta
  solo cuenta lo confirmado: una propuesta sin usar no la da por sabida. *Por qué:* si «Lo que ya sabemos» mostrara un
  tiempo propuesto y la guía igual preguntara los tiempos, la pantalla se contradiría.
- **El código decide qué se pregunta y en qué paso** (`lib/exploraciones/plan-de-la-guia.ts`, puro). Los pasos son
  situación → impacto (cuánto le afecta y le cuesta) → solución (cómo lo quiere resolver, qué intentó) → cuándo → con
  qué. Orden de las preguntas:
  1. Lo que viene de antes: lo llevado ocupa lugar, y lo de una sesión cortada va primero si todavía falta.
  2. Los dos dolores que el cliente ya dijo (debajo de Funcional), en impacto. Primero el nivel más bajo, después el
     reto confirmado en el Resumen y después el que más fuentes dicen.
  3. Lo que falta para proponer: la meta en cifras, para cuándo, quién firma y el presupuesto, que va al final.
  4. Si sobra lugar, más dolores, planes, implicaciones y dimensiones sin dato.
  Sin ningún dolor dicho, arranca por los retos y una dimensión en situación. Una tarjeta con dato no se pregunta. Un
  dolor cuyo impacto ya se preguntó y se marcó hecho en una sesión anterior pasa a solución (`pasosYaPreguntados`, de las
  guías guardadas). Con un dolor en impacto, «qué pasa si no actúa» no se pregunta aparte. *Por qué en código:* con el
  prompt solo, el agente seguía partiendo de lo que faltaba en el marco.
- **Unas 5 preguntas** (`MAX_PREGUNTAS_DE_LA_GUIA`), contando lo llevado, y al menos 2 propias. Las repreguntas siguen
  detrás de un clic.
- **El agente escribe la pregunta del paso que le toca; el código filtra.** El pedido lleva «Lo que ya sabemos» y cada
  pregunta con su tema, su paso y las palabras del cliente de las que parte. El prompt usa frases del test (opciones del
  diagnóstico, no datos de un cliente) para mostrar el tono de la nota de HubSpot: corta, con sus palabras, directa a lo
  que duele. `repiteLoSabido` descarta la pregunta que vuelve a pedir que cuente la situación de algo ya dicho. En su
  lugar va `preguntaDeRespaldo`. El mismo filtro corre al mostrar una guía de antes (sin `paso`): la de Larce del 16 oct
  deja de mostrar «¿Qué pasa cuando un deal se queda quieto?» y queda en 5. ⚠ **Enmendado el mismo día** (ver «La guía de
  la preventa, segunda vuelta»): la pregunta va sin la cita adelante; lo que dijo el cliente, en el ⓘ.
- **Siempre cierra** con «¿Hay algo que no hayamos hablado y que deba saber para proponerte el primer paso?», el cierre
  del agente (sin espacios por completar: si trae uno, va el de base) y «Si no salió en la conversación, pregunta: …» con
  lo que falta para proponer y ninguna pregunta cubre (`faltanAlCerrar`, calidad.ts).
- **Sin SQL.** El paso va en la pregunta guardada (`PreguntaDeLaGuia.paso`, en el Json de la propuesta); «Lo que ya
  sabemos» se calcula al leer. La exploración de un proyecto (Customer Success) no cambia.
- **Medido antes de entregar** (`scripts/medir-guia-de-preventa.ts`, en seco, contra el presupuesto humano): Larce,
  CreditForce, Universidad Monterrey y Cicadex pasaron de 7 u 8 preguntas a entre 4 y 5. Ninguna vuelve a preguntar lo
  que el cliente ya dijo.
- **Pendiente:** los correos y el timeline de HubSpot (iniciativa B) suman lo que el cliente dijo por correo como una
  fuente más de «Lo que ya sabemos» cuando entren a la memoria de la cuenta.
## La guía de la preventa, segunda vuelta: corta, ajustable y con su asistente (2026-10-18)

**Contexto.** Elías validó la guía nueva con Distribuidora Larce (validaciones 69, 71 y 73 del roadmap) y pidió preguntas
concisas con su fuente aparte, cambiar una sola pregunta, sumar las suyas, un asistente para ajustar la guía y sus
repreguntas, y lo que cubre la guía pegado a ella. El plan está en `docs/preventa-guia-2-plan.md`.

- **Cada pregunta es solo la pregunta.** El prompt de la venta la pide sin repetir lo que dijo el cliente ni decir de dónde
  sale (los ejemplos «bien» pasaron a ser preguntas sin cita), `preguntaDeRespaldo` devuelve solo la pregunta del paso
  (`PREGUNTA_DEL_PASO`), y `sinCitaAdelante` (ajustes-de-la-guia.ts) saca al leer y al mostrar la oración que repite lo
  dicho antes del «¿» en las guías ya armadas. Lo que dijo el cliente, con sus palabras y su fuente, va en un ⓘ (el `title`
  que pinta la capa de Tooltip). «Lo que ya sabemos» no cambia: ahí siguen sus palabras.
- **Lo que decide el vendedor sobre la guía de una sesión vive en la sesión, no en la guía**
  (`SesionPlaneada.ajustesDeLaGuia`, en `contenido`): sus preguntas (`propias`, «tuya» o «asistente»), las de la guía que
  reescribió o regeneró (`cambios`, por la clave `tema:paso`) y las que quitó (`quitadas`). *Por qué:* el agente escribe
  solo `propuesta`, así que lo del vendedor sobrevive a «Actualizar la guía» sin ninguna mezcla al rearmar; y una pregunta
  de la guía de base (sin agente) también se puede cambiar. `aplicarAjustes` es lo único que los junta con la guía: la
  pantalla, el panel, «En vivo», lo que planeó la sesión para el agente que la lee, «Lo que cubre la guía» y el asistente
  ven las mismas preguntas. Una pregunta cambiada se devuelve a la de la guía («Volver a la de la guía»); las quitadas, con
  «Devolverlas». Una sola operación, `ajustarGuia` (contenido.ts, con su zod), con la versión y el bloqueo de siempre; si
  la próxima todavía no es sesión, la crea. Sin SQL.
- **«Regenerar pregunta» cambia solo esa**, con otra del mismo tema y paso (`POST …/guia/pregunta`, guarda de escritura de
  la exploración). Usa el mismo contexto que la guía (`contextoParaLaGuia`, extraído de `armarLaGuiaSinGuardar`) y un
  pedido corto (`pedidoDeUnaPregunta`, el modelo de la guía). Si sale en voseo, repite lo sabido o es la misma, se pide una
  vez más con el aviso. Lo nuevo queda como un cambio de la sesión, marcado «Regenerada». Medido en `LlmCall` con el agente
  de la exploración y `origen = exploraciones/guia:regenerar-pregunta`.
- **«Mejorar con el asistente» es el chat de Nexus de la cuenta, no un chat nuevo.** *Por qué:* ese chat ya tiene el hilo
  por cuenta y persona, la memoria de la cuenta, la búsqueda en las reuniones, la lista de cambios y el aplicar con un clic
  por la capa de operaciones; otro chat duplicaría todo eso. Se suman cinco operaciones a la capa (lib/operaciones/
  guia-server.ts): `guia.leer`, `guia.pregunta.agregar`, `guia.pregunta.cambiar`, `guia.pregunta.quitar` y
  `guia.repregunta.cambiar`.
  · Llevan `clientId` (`COMO_SE_ACOTA` = «cuenta»: el chat pone el de su hilo) y se verifica que la exploración sea de esa
    empresa. Escribir pide lo mismo que la pantalla: `preventa.write`, o `exploracion.generate` en un proyecto.
  · Validan al preparar lo que el prompt pide (tuteo, corta, sin la cita adelante, sin repetir lo sabido); lo que no cumple
    vuelve al modelo con su motivo. Escriben con `ajustarLaGuia`, la misma operación de la pantalla.
  · Una repregunta se arma al APLICAR, sobre las de ese momento: dos cambios de repregunta de la misma pregunta en una
    lista se preparan antes de aplicar el primero.
  · El botón abre el cajón del chat de la cuenta con el chip «la guía de la sesión N» (un evento del navegador,
    `abrirElChatDeNexus`); con el chip, el turno suma la guía de la próxima sesión al mensaje (no al `system`: no rompe la
    caché), como información de la cuenta. En la preventa el chat se monta en la cabecera sin «Sugerencias»; en la ficha
    del cliente ya estaba. El botón aparece solo a quien puede editar y conversar (`asistente.read`).
  · El prompt de Nexus suma cómo se ajusta una guía. Medido como cualquier turno del chat (`AgentRun` «nexus-chat»).
- **«Lo que cubre la guía»** va pegado a ella, arriba de «Retos de su industria»: los puntos para proponer (verde listo,
  azul lo pregunta la guía, punteado no) y las dimensiones que pregunta, con dónde parece estar cada una
  (`queCubreLaGuia`, puro). Sale de las preguntas ya ajustadas: cambia al instante. En el panel de la derecha, «Para
  proponer» queda en lo mínimo: los siete trazos verdes y «N de 7 listos».
- **Lo que no cambió:** el plan (qué temas y en qué paso), «Lo que ya sabemos», la escala y la regla «sin una pista del
  cliente no hay nivel» (el asistente no confirma niveles), las guías por sesión y el marco de Customer Success (que
  también acepta ajustes y lleva la ⓘ).
- **Medido con Larce** (`scripts/medir-guia-2.ts`, sin escribir la exploración ni el hilo): «Regenerar pregunta» cuesta
  unos US$0,015 por llamada (unos 4.100 tokens de entrada y 150 de salida; el doble si reintenta). Un turno del asistente
  que agrega dos preguntas y acorta otra son dos llamadas: unos US$0,11 el primero (escribe la caché del prompt y de la
  cuenta) y menos los siguientes, que la leen.
- **Una pregunta propia guarda quién la sumó y quién la cambió** (`PreguntaPropia.cambio`, 2026-10-19, prueba 104).
  Regenerar una que había sumado el asistente seguía diciendo «Del asistente»: el cambio de una propia no guardaba su
  origen. Ahora «Regenerar» marca «Regenerada» a cualquier pregunta, y una tuya editada por ti sigue siendo «Tuya».
  «Volver a la de la guía» es solo de una pregunta de la guía: una propia no tiene a qué volver.
- **Al abrir el asistente desde la guía, de 3 a 4 pedidos en botones** (`sugerenciasDelAsistente`, puro y sin IA): la
  pregunta con menos repreguntas, las dimensiones en juego que la guía no pregunta y no tienen evidencia, y lo primero
  que falta para proponer. Nombran la pregunta por su tema, no por su número (la pantalla no numera). Un clic llena el
  campo; lo manda la persona. Se ven arriba del campo mientras está vacío, también con conversación anterior.
- **El chat numera la guía como la pantalla, y sumar se revisa al preparar** (auditoría del 2026-10-19). La guía que lee
  el modelo y el número de cada línea («quitar la 5») van en el orden de «En orden» (`ordenDeLaConversacion`): antes el
  Presupuesto era la 5 para el chat y la última en pantalla. Al proponer sumar una pregunta, el tope de 8 sumadas (tuyas
  o del asistente) cuenta lo que ya está en la misma lista, no se repite una de la lista y se descarta la que vuelve a
  preguntar lo que el cliente ya dijo (`problemaAlAgregar`): antes la caja prometía «2 cambios» y entraba uno.

## La rentabilidad, conectada con las agendas y las tareas (2026-10-18)

**Contexto.** Iniciativa C de docs/roadmap.md (lo que dejó la reunión con Marco del 17 oct): saber con datos cuánto deja
cada cuenta y cómo produce cada persona, y llegar a US$2,3 millones en 2027. Plan en `docs/rentabilidad-conectada-plan.md`.
Medido el 18 oct sobre octubre: 515 eventos con hora en 16 calendarios; 452 tenían Meet (ya contaban); 34 reuniones con
clientes fuera de Meet sumaron 38,5 h; 27 no eran de una sola empresa de la cartera.

- **Dos fuentes nuevas de horas, sin que nadie marque tiempo.** Las reuniones del calendario SIN Meet (presenciales,
  Zoom, Teams, llamadas), leídas mes por mes del calendario de cada persona y resueltas con el resolvedor único
  (`cuentaDelEvento`), y las tareas internas hechas de una cuenta (lo que duraron sus bloques en la agenda; sin bloque, su
  estimado). Las reglas viven puras en `lib/rentabilidad/horas-del-calendario.ts` y `horas-de-tareas.ts`.
- **Lo que evita contar dos veces:** un evento con Meet no entra por el calendario (ya está en `FirefliesSession`); uno
  cuyo id ya es una sesión, tampoco; una reunión agregada a mano del mismo cliente a ±30 minutos es la misma; un bloque de
  tarea nunca es una reunión; una tarea de clase «reunion» nunca suma (cuenta su reunión); el mismo evento en dos
  calendarios es una reunión con dos personas. ⚠ Lo que NO se separa: una tarea interna que repite una del cronograma; se
  muestran en columnas distintas.
- **El calendario se lee solo para meses sin foto**, con 15 minutos de memoria por persona y mes. La foto del margen
  pasa a la versión 2 y guarda las horas nuevas (columnas aditivas con 0 por defecto): una foto v1 se lee con ellas en
  cero, y «Volver a tomar» la completa. La carga del equipo (lib/carga) no cambia: sigue solo con Meet.
- **El margen por persona** es el ingreso de cada cuenta repartido por la parte de horas que puso cada persona, menos lo
  que costaron sus horas. Va en «Costo de la hora», por nombre, sin ranking: dice cuánto dejaron las cuentas en las que
  trabajó, no mide a nadie.
- **La meta vive en `MetaDeFacturacion`, append-only**: la vigente es la última de su año y la cambia dirección desde la
  pantalla («Cambiar la meta»), con su nota; el SQL deja la de 2027 en US$2.300.000. Se eligió una tabla y no
  `DecisionFinanzas` porque una meta tiene historia (quién la cambió y de cuánto a cuánto).
- **Lo facturado de cada año sale de los libros** (Odoo: publicadas menos notas de crédito; Mercury: no canceladas) más
  las comisiones de aliados confirmadas. Los cobros de Cobranza no se suman: son las mismas facturas. Por moneda en el
  motor (`lib/finanzas/meta.ts`); para la barra se convierte con la tasa de cada mes (`convertir`), y lo que no tiene tasa
  queda aparte, dicho. Un año sin documentos se dice, no se dibuja en cero.
- **La línea de «por facturar» se parte en recurrencia y proyectos** escalando la proporción de las cuotas crudas al
  número del reporte de cada mes (así la suma es la línea del gráfico); las expansiones y los negocios nuevos del pipeline
  van al lado, ponderados, porque todavía no son por facturar. «Falta» = la meta del año ÷ 12 (o el piso, si el año no
  tiene meta) menos lo facturado y lo programado. El camino a la meta de 2027 es una cuenta: la recurrencia de hoy × 12 más
  el pipeline ponderado; no supone que la recurrencia crezca.
- **La lectura de los números: el código detecta, el modelo propone, una persona valida.** Las señales salen de reglas
  fijas (`lib/rentabilidad/lectura/senales.ts`: solvencia, margen de una cuenta bajo el 15 %, cuentas con 10 h o más sin
  cobro, lo que falta para la meta); sin señales no se llama al modelo. Lo que propone queda en `PropuestaDeRentabilidad`
  (pendiente, usado, desestimado; vence a los 30 días) y solo lo usado vale. Corre a mano o una vez por mes (job
  `rentabilidad-lectura-mensual`, día 4), nunca cada día; medido con `AgentRun` y `LlmCall` (agentSlug
  `rentabilidad-lectura`, familia «Finanzas» en Uso de Nexus). El prompt vive en el código (ARCHITECTURE §6.2).
- **⛔ Lo que nunca entra al prompt:** el costo, la planilla, el nombre o el correo de una persona, el CSE de una cuenta y
  quién la atendió. Entra el costo cargado de la hora del equipo, como en pantalla. Una sola puerta
  (`entradaDesdeLosDatos`) y una prueba que la arma con marcas en todos esos campos (`lectura.test.ts`).
- **Todo es de dirección**: las rutas viven bajo `/api/cobranza/costos/` (meta y lectura) para que el escaneo de
  privacidad exija `guardCostosAccess` en cada handler. `lib/finanzas/equilibrio.ts` no se tocó: se usan `convertir` y
  el reporte que ya arma.
- **Pendiente:** «¿Cuánto te tomó?» no pregunta por las tareas internas (solo por las del cronograma); hoy una tarea
  interna sin bloque ni estimado no suma. Del 1 al 18 de octubre hubo 3 hechas con una cuenta, y ninguna tenía bloque ni
  estimado.
## Los correos y el timeline de HubSpot, en el contexto de la cuenta (2026-10-18)

**Contexto.** Iniciativa B de docs/roadmap.md (la reunión con Marco del 17 oct); el plan, en
docs/correos-en-el-contexto-plan.md. Una minuta con fechas se le mandó al cliente por correo, la reunión que prometía
nunca se agendó, nadie le dio seguimiento y el cliente le escribió a Marco. Nexus leía las reuniones, pero no los correos
ni el timeline de HubSpot. Enmienda el «Fuera por ahora» de «La memoria de la cuenta: una sola lectura por reunión, en
cinco piezas»: los correos entran, como una fuente aparte, no como una fuente más de la lectura de cada reunión.

- **Una copia de solo lectura, `ComunicacionDeHubspot`**, con su único escritor (lib/comunicaciones/copia-server.ts) y un
  job (`comunicaciones-hubspot`, cada hora de 6:00 a 20:00). Lee los correos (enviados y recibidos), las notas y las
  llamadas de 120 días por la BÚSQUEDA de HubSpot (lo modificado desde la corrida anterior) y las asociaciones v4 en
  lote. *Por qué no el timeline de cada empresa:* serían más de 1.500 pedidos por corrida; así son unos pocos. Medido el
  2026-10-18: 1.631 notas y 306 llamadas en el portal; quedan 256 notas y 6 llamadas de 73 clientes y prospectos.
- **Una comunicación es de UN cliente** (`clienteDeLaComunicacion`, puro): primero las empresas de HubSpot asociadas que
  son de clientes de Nexus; sin ninguna, los contactos asociados (la copia de contactos). Dos o más clientes → no se
  guarda y se cuenta (3 el 2026-10-18). Los aliados y Smarteam no cuentan. Nunca se borra una fila: la que pasa a ser de
  dos clientes queda `vigente = false`.
- **Se guarda lo necesario**: tipo, dirección (enviado o recibido), fecha, asunto (300), texto en limpio sin HTML ni la
  cita del hilo (4.000), el autor (el dueño de HubSpot) y el remitente de un correo recibido. Sin destinatarios ni
  adjuntos. Una llamada o una nota sin texto no se guarda (las llamadas sin cuerpo son reuniones de Meet registradas
  como llamada), ni la nota de la ficha.
- **Sin el permiso de correos no hay correos.** La app de HubSpot no tiene `sales-email-read` ni
  `crm.objects.emails.read`: la búsqueda responde 403 y la API v1 los devuelve sin asunto ni texto. La copia lo dice
  (`correos: sin permiso`) y sigue con las notas y las llamadas. No se guardan correos «tapados»: sin texto no dicen
  nada. Concederlo es decisión de Elías (por entorno, `HUBSPOT_SCOPES_OPCIONALES_EXTRA`, después de declararlo
  «Opcional» en la app pública); la primera corrida con el permiso trae los 120 días.
- **Lo que Smarteam prometió por correo va por la MISMA salida que una reunión.** De un correo enviado, de 14 días o
  menos, con una fecha o un compromiso (el filtro en código, `motivoDeLaLectura`, antes de gastar), Haiku 4.5 lee sus
  compromisos con el mismo esquema (`esquemaDeLosCompromisos`, lib/sessions/lectura-salida.ts), la cita se verifica tal
  cual contra el correo, y `armarPropuestasDeSeguimiento` (lib/tareas/seguimiento.ts) decide a quién le llega cada uno:
  lo de Smarteam a quien lo dijo o, sin saberlo, a quien mandó el correo; lo que el correo recapitula del cliente, al CSE
  de la cuenta como seguimiento. Lo escribe el único escritor de Tareas (`escribirPropuestasDeComunicacion`), con
  `origen = "correo"` y `origenId = cor:<comunicación>:<línea>`. *Por qué no otro lector:* un compromiso es un compromiso,
  venga de donde venga; dos lectores darían dos reglas de a quién le llega.
- **Cada correo se lee una vez** (su estado vive en la fila: `pendiente`, `leyendo`, `leido`, `no_aplica`, `error`, hasta
  3 reintentos). Contra el presupuesto automático. Se apaga con `COMPROMISOS_DE_CORREOS_ENABLED=0`; la copia, con
  `COMUNICACIONES_HUBSPOT_ENABLED=0`. Su costo queda en `LlmCall` con `agentSlug = "tareas-correo"` (familia «Tareas»).
  Estimado: US$0,003 por correo.
- **El aviso de las 48 horas** (`compromisoSinAgendar`, lib/comunicaciones/sin-agendar.ts, puro): un compromiso con el
  cliente (de un correo o de la lectura de seguimiento de una reunión) con fecha, o una reunión prometida, que a las 48
  horas nadie tomó (sigue propuesto, o «Por asignar»), y si es una reunión, que no está en el calendario del CSE, ni
  planeada en Tareas, ni ocurrió. Rechazarlo es una decisión: no avisa. Deja de avisar a los 21 días. Le llega al CSE de
  la cuenta (una línea por compromiso; en un prospecto, a quien tiene la propuesta) y a quien lidera Customer Success
  (una línea por cuenta), con peso 85 en «Lo que importa hoy». *Supuesto aceptado:* cualquier evento próximo con la cuenta
  cuenta como «está en el calendario», aunque sea otra reunión: si se van a ver pronto, la promesa se puede cubrir ahí.
- **La memoria interna de la cuenta suma dos partes**: «Comunicaciones con el cliente en HubSpot» (las 12 más recientes
  de 60 días, con su fecha y quién la escribió, sin las notas que escribió Nexus, que ya están en «Notas del equipo») y
  «Compromisos abiertos de la cuenta, sin proyecto» (los de un correo o una reunión sin proyecto, por la puerta de Tareas
  para agentes). Solo el alcance interno: son conversaciones con el cliente tal cual. Las leen el vigía, el chat de Nexus,
  la preventa de una empresa que ya es cliente (A0), la exploración del proyecto (F0) y «Actualizar escala». El chat
  suma la lectura «comunicaciones.recientes» (la lista, o una entera por su id).
- **Lo que se ingresa a mano ya estaba conectado**, y se verificó: las notas de la cuenta entran a la memoria interna
  («Notas del equipo») y se escriben en HubSpot como nota (así la preventa de un prospecto, que lee el timeline de
  HubSpot, también las ve); las reuniones agregadas a mano son reuniones (las lee la lectura de cada reunión y el chat las
  lista); los acuerdos viven en la minuta de cada reunión. El lector de fuentes de la preventa no se tocó.
- **Fuera por ahora:** pedir el permiso de correos (decisión de Elías); leer compromisos de los correos recibidos, de las
  notas o de las llamadas; copiar las reuniones de HubSpot; que la lectura de cada reunión lea las comunicaciones; una
  pantalla propia.
## Lo pagado se cobra solo, y el menú de Finanzas sin el doble libro (2026-10-18)

**Contexto.** Iniciativa 5 de «La siguiente serie». Elías decidió el 18 oct sobre `docs/finanzas-simplificacion.md`: cobrar
sin firma lo que Odoo y Mercury dan por pagado (Alex, 16 oct: «definitivo»), primero el libro y después el menú, y que
concilie cada mañana María José. El análisis, la evidencia y lo que quedó hecho están en ese documento.

- **Lo pagado y conciliado con el banco se cobra solo, cada mañana** (job `lo-pagado-daily`, ≥ 7:00 CR, después de las
  copias de las 6:00). Va por `cambiarEstadoCobroTx`, una transacción por cuota con la cuota bloqueada, y deja su
  bitácora. La firma es del sistema y dice de dónde salió: `sistema:odoo` o `sistema:mercury`
  (`lib/cobranza/firma-del-sistema.ts`). La regla es pura: `paraCobrarSolo` y `dudaDelCobro` en `lib/cobranza/libro/hechos.ts`.
- **Qué es seguro.** Odoo `paid` (el contador la concilió con el estado de cuenta) o Mercury `Paid` con su entrada de
  plata atada por el nombre de quien pagó, y un día del pago que cuadra (no posterior a hoy, no más de 3 días antes de la
  factura). Lo demás espera a una persona en Conciliación › «Lo pagado», con su porqué: Odoo «en proceso de pago» (pagada
  pero sin conciliar con el banco), una entrada de Mercury encontrada solo por el monto, un día del pago raro. *Por qué no
  «en proceso de pago»:* Elías pidió «pagado y conciliado con el banco»; el 16 oct «en proceso de pago» se dio por pagado
  para la lista que confirma una persona, y ahí sigue.
- **Nunca se cobra solo** lo de «Pagadas sin el día del pago» (la fecha decide el mes del gráfico), un choque, ni lo que
  solo se pega a su factura sin estar pagado: eso lo sigue confirmando quien concilia.
- **Una cuota ya cobrada sin número recibe el de su factura si la factura está pagada allá** (`decidir`, acción
  `yaCobrada`, prueba 36). Hasta el 18 oct `decidir` saltaba toda cuota cobrada, y una cuota cobrada nunca recibía su
  número (Corrugando 0221, Servica 0268). Se pega con las mismas reglas que las demás (número, o monto exacto sin
  dudas) y la confirma quien concilia, en «Se pegan a su factura»: el job no la toca. ⛔ Con la factura impaga no: es
  un choque, y anotarle el número fijaría un pareo por monto que puede ser de otra factura (Juanva 0197 y 0230).
  `scripts/medir-numero-en-cuotas-cobradas.ts` lo mide en solo lectura: el 18 oct, 13 cuotas (4 de Odoo, 9 de Mercury).
- **Se deshace con «Sacar de Cobrado»**, con el mismo motivo de siempre. La bitácora de la reversión dice que el sistema no
  la vuelve a cobrar sola, y el job salta toda cuota con una reversión en su bitácora (`TEXTO_DE_LA_REVERSION`), también
  adentro del candado. Si después entra de verdad, se confirma a mano en «Lo pagado». Sin SQL: la marca es la bitácora.
- **Espera a las copias.** Una copia encendida que no corrió bien hoy hace esperar al job hasta las 10:00
  (`decidirElTurno`, `lib/cobranza/libro/turno.ts`); pasada esa hora cobra con la que está al día y el job queda en rojo
  diciendo cuál faltó. Una copia apagada en el servidor no hace esperar. Si Odoo no dice el día de los pagos, o una cuota
  no se pudo escribir, también queda en rojo: lo que falta espera a mañana.
- **INV25 cambia.** Ya no es «una máquina nunca confirma plata»: una máquina confirma SOLO con `sistema:odoo` o
  `sistema:mercury` y con la factura de ese número pagada en la copia. Cualquier otra firma de máquina (`odoo`, `sync`,
  `cron`, otro `sistema:`) sigue violándolo. INV3 no cambia: todo COBRADO tiene firma.
- **Se apaga con `COBRO_SOLO_ENABLED=0`** en el `.env`; lo pagado vuelve a confirmarse a mano.
- **El punto de equilibrio cuenta solo las facturas del año** (`tipoIngresoDeCobro` con `anioDeLaFactura`): lo cobrado de
  una factura emitida en un año anterior se queda en el año de la factura, y en el año del pago se declara aparte
  (`cobradoDeAniosAnteriores`, aviso «COBRADO_DE_FACTURAS_ANTERIORES»). Es la otra mitad de `porCobrarDeAniosAnteriores`:
  sin esto, una factura de diciembre cobrada en enero pasaba a ser facturado del año nuevo y el año cerrado cambiaba
  después de cerrarlo. Rentabilidad no lo usa: mide lo que entró mes a mes. Al 2026-10-18 no mueve ningún número (todos
  los cobros de Nexus son de 2026).
- **Lo cargado sin facturar respalda una venta** (`clasificarVentas`, clase `EN_PLAN`): una venta con sus cuotas en
  Cobranza esperando su fecha ya no cuenta como «sin respaldo en cobranza». Medido el 18 oct: el hueco baja de
  US$239.386 a US$171.060 y US$68.326 quedan «en el plan». El resto es real: ventas sin plan cargado.
- **El menú de un Super Admin** ve todo Finanzas menos lo de quien registra (`soloQuienRegistra`): Pendientes, y Comisiones
  de vendedor y Aguinaldo como entradas sueltas (están dentro de Planilla). Corrige al 2026-10-08 («ve todo»).
- **Odoo, Mercury, el libro de Alex e Integraciones son parte de Conciliación**: las rutas no cambian (son identidad) y el
  menú las ilumina como Conciliación. Cobranza pasa a `exact`. ⚠ Corregido el mismo día (prueba 97): la fila de píldoras
  de arriba del título se fue, porque con las pestañas de adentro y los filtros eran tres niveles de navegación seguidos.
  Conciliación tiene una sola fila de pestañas; Odoo, Mercury e Integraciones son enlaces al lado de la fecha de su copia,
  y esas páginas vuelven con «← Conciliación».
- **Reportes son tres** —Punto de equilibrio (con Tipo de cambio adentro), Reportes de cobranza y el modelo de Comisiones—
  más Caja neta, que queda como está hasta que decida Alex. Rentabilidad sale del menú de Finanzas y queda en Éxito del
  cliente.
- **Las hojas viejas de Costos llevan a su página nueva**: Costos, Fijos y Herramientas a Recurrentes; Tarjetas a Tarjetas.
  Siguen con su gate de costos antes del redirect (P4 de costos-privacy).
- **Quien concilia cada mañana es María José**, con el rol de Dinia («Asistente administrativo», ADMIN): `cobranza` leer y
  escribir, `gastos` leer y escribir, y el frente «Finanzas: registrar». No hizo falta un permiso nuevo. Nexus no crea la
  cuenta: la da de alta Elías en Equipo.

## El chat de Nexus sobre la guía, fluido (2026-10-18)

**Contexto.** Validaciones 71, 104, 106 y 107 del roadmap: Elías probó «Mejorar con el asistente» con Distribuidora Larce
y lo sintió repetitivo y lento. Pedía permiso en texto («¿Las agrego las cuatro?»), después mostraba la lista con el mismo
resumen, y al aplicar repetía cada línea. Plan: `docs/chat-fluido-plan.md`.

- **La lista ES la confirmación.** Con el pedido claro, el chat propone directo con las herramientas y escribe UNA línea
  que no repite la lista. Pregunta solo si falta un dato sin el cual el cambio sale mal. Todo lo pedido va en la misma
  lista: nunca «aplica esto y seguimos». La lista la sigue aplicando la persona; nada cambia solo.
- **Si una vuelta solo propuso, el turno termina ahí** (`terminaAlProponer`, lib/nexus-chat/bucle.ts): ninguna lectura y
  ningún rechazo. No se hace otra llamada solo para escribir el resumen. Con una lectura o un rechazo, sigue.
- **El chat piensa poco** (`ESFUERZO_DEL_CHAT = "low"`, lib/nexus-chat/constantes.ts). Lo que tiene que cumplir una
  pregunta de la guía (tuteo, largo, no repetir lo sabido) lo revisa el código al preparar, no el modelo.
- **Un solo resumen.** La caja dice «N cambios para aplicar» (`RotulosDelChat.lista`) y, aplicada, «Aplicado»; el
  desenlace es una línea agrupada por clase («Listo: 4 preguntas en la guía.», `resumenDeLoAplicado`). Como el texto ya
  no repite la lista, la ventana del hilo le pasa al modelo las líneas de lo que propuso (`ventanaDelHilo`, libro.ts).
  Sin aviso fijo en el cajón: lo dice una vez el estado vacío.
- **Varias repreguntas en un paso.** `guia.pregunta.cambiar` con `repreguntas` las reemplaza todas, también en una
  pregunta sin repreguntas, y la línea las muestra con sus palabras (`lineaDelCambio`). `guia.repregunta.cambiar` ya no
  se rechaza por las repreguntas de hoy: se ubica al aplicar.
- **La pregunta de respaldo trae repreguntas** (`REPREGUNTAS_DEL_PASO`, plan-de-la-guia.ts). Era la causa de que la 2 de
  Larce (1.1) tuviera 0: el agente no había escrito una del paso que tocaba.
- **Todo lo de una pregunta va en su ⋯** (`Menu`): Regenerar, Editar, Volver a la de la guía y Borrar, con «Deshacer»
  (`deshacerElBorrado`: una propia vuelve con su id, una cambiada con su cambio, una de la guía a la de la guía).
- **La guía se arma una vez por turno y por «Aplicar»** (`baseDeLaGuia`, lib/operaciones/guia-server.ts), y el contexto
  de la cuenta y la guía se arman en paralelo. Lo que aplica arma la suya de nuevo: nunca se escribe sobre una vieja.
- **Medido** con `scripts/medir-turno-de-la-guia.ts` (Larce, sin escribir): «¿Qué otras preguntas agregarías?» de 34,4 s
  a 10,4 s; «Mejora las repreguntas de la 2 para que bajen a números» de 21,0 s a 4,8 s. Cada turno guarda sus tiempos en
  su `AgentRun` (`tiempos`).
- **Sin streaming, por ahora.** En el caso común el turno es una sola llamada; el streaming pide cambiar la ruta y el
  cajón que comparten los tres chats. Es lo siguiente si sigue sintiéndose lento.

## «Para ti» después de probarlo: el espacio libre y la sesión (2026-10-19)

**Contexto.** Elías probó «Para ti» (pruebas 7, 8 y 78 del roadmap): no encontró «Sin acción ni reunión», el «Hueco
libre» no aparecía un fin de semana y, al tocar una hora libre, solo se podía crear un evento vacío. Y el panel de una
reunión del calendario y la página de la sesión mostraban lo mismo con piezas que competían.

- **Lo que falta va en el título** («Fundauna: sin acción ni reunión»), con la empresa adelante como lo demás de «Lo que
  importa hoy»; debajo, por qué y qué hacer. Antes estaba solo en la línea gris de arriba.
- **«Espacio libre», no «hueco libre»**, y no solo hoy: también los días que vienen de lo que muestra la agenda, desde
  las 8:00 y como mucho dos por día (`espaciosLibres`, lib/mi-dia/inicio.ts). La agenda sigue siendo de lunes a viernes
  («La agenda, segunda vuelta»): un fin de semana muestra la semana que viene, con sus espacios.
- **«Con qué usar este espacio»** (lib/mi-dia/espacio-libre.ts, sin IA): al tocar un espacio libre o una hora libre,
  Nexus sugiere hasta cinco cosas, una por cuenta: tus tareas que caben (en el orden de «Con qué avanzar»), la reunión
  con una cuenta tuya sin reunión en 8 días (con los invitados de su última) y el siguiente paso (el de Ventas de un
  negocio que cierra pronto, o la acción de la semana de una cuenta que no la tiene). «Usar» llena el borrador (título,
  cuenta, invitados, duración); todo sigue editable y nada se guarda hasta Google Calendar.
- **El panel de la reunión resume; la página de la sesión decide.** El panel dice cuántas cosas piden tu decisión y
  cuáles, el siguiente paso de tu equipo y «Revisar sesión». Se fueron su «Usar todo», su «Usar como siguiente paso» y
  su «Escribir en HubSpot»: la página tiene todo eso. Usar ahí una de tus tareas de la reunión la vuelve tu siguiente
  paso (el siguiente paso es una tarea). Una reunión que ya pasó y no deja nada por decidir, o una interna, igual
  enlaza a su sesión.
- **Mismos números y mismas palabras** en «Lo que importa hoy», el panel y la tarjeta de la página: salen de la misma
  tarjeta (`Tarjeta.desglose`) y de una sola redacción (`loQuePideDecisionEnPalabras`, lib/seguimiento/tarjeta.ts).
  El botón de la línea de una reunión dice «Revisar sesión».
- **Lo que no cambió:** el aviso de una reunión prometida no sale si la reunión ya está en el calendario de quien lleva
  la cuenta (Accesos Automáticos: la demo del 21 oct está agendada), y una reunión interna no avisa (desde el 18 oct).

## Las propuestas de salud del vigía se deciden en un solo lugar (2026-10-19)

**Contexto.** Elías y Alex Vanegas vieron en «Para ti» «El vigía propone cambiar el estado de 9 proyectos en 9
cuentas». El botón llevaba a la pestaña «Proyectos» de UNA cuenta, donde el chip rojo «En riesgo (propuesto por el
agente)» estaba al lado de «HubSpot: A tiempo» y de otro chip que proponía «Pasar a Retrasado». No se entendía qué se
proponía ni de qué a qué. Medido ese día: las 9 eran de SALUD (`Project.healthProposed` = EN_RIESGO, de «En fricción»),
ninguna de etapa. Las de etapa («de Diagnóstico a Implementación») las deja la lectura de cada reunión, no el vigía, y le
llegan al CSE como «Confirma si … pasó a …» (5 vivas ese día).

- **Se dice «salud», no «estado»**: la salud es de Nexus; el estado es de HubSpot (`hs_status`). El aviso, la lista y el
  chip dicen «de «En fricción» a «En riesgo»», y el chip de HubSpot pasa a «Estado en HubSpot: …» con «Pasar el estado a
  «…» en HubSpot».
- **Se decide en un solo lugar**: Éxito del cliente › «Propuestas del vigía» (`/customer-success/propuestas`), una fila
  por propuesta con la cuenta, el proyecto, de qué a qué, por qué y desde cuándo, y «Confirmar» / «Descartar». El aviso
  lleva ahí abierto en la que más espera (`?proyecto=`, resaltada, con el único botón azul) y cada cuenta del aviso
  enlaza a su fila. El chip de la ficha ya no decide: dice lo mismo y «Decidir» lleva a la lista. Decidir sigue pidiendo
  `clientes.viewAll`; sin ella, la lista se ve sin los botones.
- **El porqué se arma con las señales de hoy** (`razonDelRiesgo`, lib/cs/propuestas-del-vigia.ts), la misma frase que
  guarda el vigía al proponer: lo guardado se quedaba viejo («sin avance hace 18 días» cuando ya iban 31).
- **Lo decidido o lo que ya no aplica no se cuenta** (`estadoDeLaPropuesta`): si alguien fijó la salud a mano, o la
  señal desapareció (fases al día, proyecto pausado o cerrado), la propuesta sale del aviso, de la lista y del chip. El
  vigía la borra la próxima vez que corre para ese proyecto, y hoy corre solo al entrar a la cuenta. Una sola lectura
  (`cargarPropuestasDelVigia`) alimenta el aviso y la lista, así no cuentan distinto.
- **Al decidir, sale del número al instante**: la fila se va de la lista y la ruta olvida la medición de «Para ti» de
  quien decidió. A otra persona de dirección le sale en hasta dos minutos (la medición guardada).
- **Lo que no cambió**: la propuesta la sigue haciendo el vigía por reglas del cronograma (`riskCandidate`), no la IA;
  la de etapa sigue siendo la encuesta de la etapa, con su propia línea para el CSE.

## La agenda de «Para ti» es la de Google Calendar (2026-10-19)

**Contexto.** Elías comparó la semana del 19 al 23 oct de Andrés Pinzón en Google Calendar con la de «Para ti»: faltaban
eventos y Nexus sugería espacio libre encima de ellos (lunes de 13:00 a 14:00, donde estaba «Convocatoria ICB»). Leído
su calendario en solo lectura, faltaban los 7 eventos SIN otros invitados de la semana: «Tenis» (lun y jue), «Convocatoria
ICB», «Preparar demo para Accesos Automáticos», «Cita Médica», «Sale Juan del colegio» y «Entrega de notas». La agenda
pintaba solo las reuniones (`agendaDelDia` pide dos personas) y los espacios libres se calculaban con eso. Lo demás
coincidía: «Crunchyroll» y «6 tareas pendientes» son tareas de Google (no vienen en el calendario), «Casa» es la ubicación
de trabajo y el otro calendario que tiene compartido no está a la vista en su Google Calendar.

- **Todo evento con hora se ve** (`eventosPropios`, lib/mi-dia/agenda.ts): lo de la persona sola y el bloque de una
  tarea de Nexus, que lleva a la tarea. ~~No tiene panel: abre en Google Calendar.~~ (Superado el mismo día: se abre en
  el panel, ver «Un evento propio se abre en el panel, con su cuenta si la nombra».) Las reuniones siguen siendo
  `agendaDelDia`, lo único que leen la regla de servicio, las cifras y el panel.
- **Qué ocupa el tiempo** (`ocupaSuTiempo`): todo evento con hora, salvo el rechazado y el que la persona marcó
  «disponible». Los de todo el día, la ubicación de trabajo y las tareas de Google no ocupan horas. «Quizás» y opcional
  sí ocupan (es común estar invitado a dos a la vez e ir a uno) y se ven más claros. Lo ocupado de la agenda
  (`ocupadoDeLaAgenda`, lib/mi-dia/inicio.ts) es lo que no pisan los espacios libres, el resumen y «Agendar».
- **Los de todo el día van arriba de cada columna**, sin la ubicación de trabajo.
- **Los que se pisan van lado a lado**, como ya hacía la grilla; en uno corto, lo que se achica primero es la hora y no el
  título (antes, «SPRINT COMERCIAL» se leía solo como «8:00–8:30»).
- **El almuerzo** (supuesto declarado, lib/mi-dia/constantes.ts): si la persona marcó un evento «Almuerzo», «Lunch» o
  «Comida» ese día, ese es; si no, Nexus no sugiere nada de 12:00 a 13:00. Vale para el espacio libre, el resumen,
  «Agendar» y «Planifica tu semana». Tocar esa hora para crear un evento a mano sigue funcionando. La ubicación de
  trabajo no dice nada del almuerzo y no se usa.
- **Lo que sugiere Nexus son bloques del tamaño de cada tarea** (`bloquesSugeridos`): en cada espacio libre, la tarea
  más importante que cabe en lo que queda, en un bloque de su tamaño (lo estimado o una hora), una detrás de otra y como
  mucho dos por espacio. Nunca el espacio entero: Elías vio «Avanza T-100 · Libre 12:00–16:00», cuatro horas para una
  tarea de una. Sin ninguna tarea que quepa, la primera hora del espacio dice «Espacio libre» y el panel dice el espacio
  entero.
- **Al entrar no se abre nada solo.** Antes se abría el panel de la próxima reunión con un cliente; ahora el panel lo
  abre la persona al tocar un evento o un espacio.

## Menos tareas a la vista, sin perder ninguna (2026-10-19)

**Contexto.** Elías y Alex Vanegas (CSL): cada CSE ve unas 20 tareas y es difícil de llevar. Medido ese día en solo
lectura (`scripts/medir-tareas-por-persona.ts`): cada CSE tenía entre 3 y 10 tareas suyas, todas por decidir, pero
«Mis tareas» le sumaba **21 de «Por asignar · Customer Success»** —recordatorios al cliente sin CSE— que veían todos los
CSE (de 24 a 31 en pantalla). Andrés Pinzón (Ventas): 29 (11 abiertas, 18 por decidir; 11 de HubSpot). De las 74 tareas
de CS y Ventas, 25 eran rápidas o de seguimiento y 17 de los 21 «Por asignar» eran seguimientos sueltos de la misma
reunión y cuenta.

- **Tres clases, solo por el título** (`claseDeTrabajo`, lib/tareas/aligerar.ts): trabajo, **rápida** (se hace en
  minutos: enviar, compartir, agendar, confirmar; o estimada en 15 minutos o menos) y **seguimiento** (empujar al
  cliente: recordarle, confirmar con, retomar, «Seguimiento con…»). Si el título dice que hay algo que armar
  (propuesta, informe, configurar, crear…), es trabajo aunque empiece con «Enviar». Ante la duda, trabajo: se ve entero.
- **Lo rápido va plegado al final de cada lista, agrupado por cuenta** («Rápidas y seguimientos · 6 en 3 cuentas»), en
  «Esta semana», «Más adelante» y «Por asignar» (`agruparRapidas`, components/tareas/ListaAligerada.tsx). Es solo la
  vista: cada tarea sigue con su fila y su casilla. Con una sola no se pliega nada.
- **«Por asignar» va plegado para quien no lidera un sprint.** Es de todo el equipo y lo reparte quien lo lidera; sigue a
  un clic, con su número.
- **Lo que ya pasó se PROPONE cerrar, nunca se cierra solo** (`sugerenciaDeCierre`). Una rápida cuya fecha pasó hace 3
  días o más, o un seguimiento hace 7, que ninguna persona tocó desde esa fecha; una de trabajo abierta vencida hace 14
  días y sin tocar en 14; una de una semana de hace 21 días sin tocar en 21; una sin semana ni fecha que nadie tomó en
  28. *Por qué el seguimiento espera más:* que el cliente se atrase es justo cuando hay que empujar. *Por qué el trabajo
  con fecha pasada no se propone antes:* está atrasado, no sobra (una propuesta de trabajo la vence el job del lunes a
  los 14 días). «Tocar» es un evento de una persona: lo que hacen Nexus, el sistema o HubSpot no cuenta
  (lib/tareas/toques.ts). Nunca una tarea de HubSpot: «Ya no se hará» no existe allá.
- **Se ve una vez, arriba, y solo a quien la puede cerrar** (su responsable, quien lidera el sprint, dirección): la
  franja «Nexus sugiere cerrar N tareas que ya pasaron» abre la lista con el motivo de cada una, todas marcadas; la
  persona desmarca lo que sigue y confirma. Una abierta pasa a «Ya no se hará» y una propuesta se descarta, con el motivo
  escrito, por el escritor de siempre. El cajón de la tarea lo repite en su recuadro de Nexus.
- **Los seguimientos sueltos de «Por asignar» se juntan como las propuestas**, uno por reunión y cuenta, solo si ninguna
  persona los tocó (sin eventos, comentarios, dependencias ni vínculos): `agruparSeguimientosPorAsignar`, por el
  escritor único. Lo corre una persona con `scripts/aligerar-tareas.ts`, en simulacro por defecto (el 2026-10-19 juntaría
  16 en 6; cerraría 5 si cada responsable lo confirma). Ese script cierra lo que ya pasó solo a nombre de quien firma
  (`--firma`) y solo lo que esa persona podría cerrar en la pantalla. Nada se borra: lo juntado queda «Era otra tarea».
- **El cajón de una tarea guarda solo y lo dice** (lib/tareas/guardado.ts). El pie muestra «Los cambios se guardan
  solos», «Sin guardar…» mientras escribes, «Guardando…», «Guardado» o «No se pudo guardar · Reintentar». El título y
  las notas se mandan a los 0,9 s de dejar de escribir, al salir del campo y al cerrar el cajón; lo demás, al elegirlo.
  Los pedidos van en fila para que cada uno lleve la versión que dejó el anterior, y los campos ya no se deshabilitan
  mientras guarda. *Por qué no un botón «Guardar»:* casi todo el cajón (estado, semana, responsable, prioridad) ya se
  guarda al tocarlo; un botón obligaba a acordarse de apretarlo y mezclaba dos formas de guardar en el mismo panel.

## Un evento propio se abre en el panel, con su cuenta si la nombra (2026-10-19)

**Contexto.** En la agenda de «Para ti», tocar un evento sin otros invitados (el almuerzo, «Tenis», «Preparar demo para
Accesos Automáticos») abría Google Calendar en otra pestaña. Elías pidió que se elija como una reunión: el panel de la
derecha, con lo que se sepa de él.

- **Se abre en el mismo panel que una reunión** (`LoElegido` «propio», components/para-ti/inicio/PanelDeLaReunion.tsx):
  título, día y hora, «Abrir en Google Calendar» como enlace (no es el clic principal) y «Tus notas», privadas como en
  una reunión. El bloque de una tarea de Nexus sigue abriendo la tarea.
- **La cuenta sale del nombre ENTERO de UNA empresa** en el título o, si el título no nombra ninguna, en la descripción
  (`empresasDelEventoPropio`, lib/mi-dia/agenda.ts; `clientesNombradosEnteros`, lib/sessions/clientes-por-texto.ts).
  Usa el MISMO match de títulos del cascade (`clientePorTitulo`, con sus stopwords, sus tokens ambiguos y las siglas
  declaradas) y decide con `cuentaDelEvento`: con dos empresas, ninguna (invariante 1). *Por qué el nombre entero y no
  la «mejor fracción» del cascade:* un evento personal no es de nadie; «Cita Médica» compartía «médica» con un cliente
  y la mejor fracción se lo daba. Medio nombre («Preparar reunión Honda» con «Honda Costa Rica») no alcanza: no se
  inventa. Solo clientes y prospectos (los mismos de `mapasDeEmpresas`).
- **Con la cuenta, lo de la cuenta**: la próxima reunión con ella en 8 días, el siguiente paso (el de tu equipo o, si no
  tiene, el más próximo: `siguientePasoParaElPanel`, lib/mi-dia/guia.ts), lo pendiente, la última vez y el negocio. Sin
  la guía de una reunión ni quién viene: no es una reunión. Lo trae la misma ruta con `propio=1`
  (`/api/para-ti/reunion/[evento]`), que no lee el evento ni lo que dejó, y que sin acceso a esa cuenta responde lo tuyo
  (tus notas) en vez de 404.

## Marcar hecha al instante (2026-10-19)

**Contexto.** Elías marcó T-162 como hecha, la deshizo y le salió «Otra persona cambió esta tarea. Recarga para ver lo
último.» sin que nadie más la tocara; y cada clic tardaba varios segundos en verse. Medido ese día contra la base real
(`scripts/medir-cambio-de-tarea.ts`, solo lectura): el PATCH respondía en unos 2 s (cargar la tarea, la transacción, los
avisos y devolver la tarea, ~0,85 s), más 1 a 3 s de HubSpot en una tarea de HubSpot; después la pantalla volvía a pedir
«Mis tareas» entero (~2,5 s) y recién ahí cambiaba la casilla.

- **El falso «otra persona cambió» era la versión vieja.** Entre que el PATCH respondía y llegaba esa recarga, la fila
  seguía habilitada con la versión de antes (en «Hechas» nunca se deshabilitaba): el segundo clic, deshacer o volver a
  marcar porque no se veía el cambio, la mandaba y chocaba. Ahora todos los cambios de una tarea, de cualquier pantalla
  (Mis tareas, el cajón, «Para ti», los pendientes del proyecto, la semana del equipo), pasan por una sola fila
  (`filaDeTareas` en components/tareas/api.ts, lib/tareas/fila-de-cambios.ts): cada respuesta anota la versión nueva y el
  próximo cambio sale con la más nueva que se conoce; dos cambios sobre la misma tarea van uno detrás del otro. *Por qué
  no esconde un cambio ajeno:* la versión anotada salió de la base después de un cambio nuestro; si otra persona la
  cambió después, la base igual va adelante y el 409 sale como debe.
- **La casilla cambia al instante** (`conEstadoAlInstante`), también en el cajón y en «Para ti», donde ahora se puede
  desmarcar mientras la fila está a la vista. Si el servidor dice que no, la tarea vuelve a como estaba y un aviso dice
  por qué. La lista entera se vuelve a pedir cuando no queda ningún cambio en fila (Mis tareas a los 0,6 s; «Para ti» a
  los 3 s, para que desmarcar enseguida no encuentre la fila ya quitada), y una carga que salió antes de otro clic no se
  pinta.
- **El escritor único no cambió; lo que no hace falta para responder va después** (`after()` en la ruta): escribir en
  HubSpot y los avisos de marcarla hecha (`cambiarEstado(…, { diferir })`; sin `diferir` corren enseguida, como antes).
  La escritura a HubSpot va en fila por tarea (`reflejarTareaEnHubspot`): con dos cambios seguidos, la última escritura
  es la del último cambio.
