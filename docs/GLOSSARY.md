# Glosario de dominio — Nexus

- **Sesión** (`FirefliesSession`): una reunión de Google Meet (el modelo conserva el nombre
  "Fireflies" por historia — esa integración se eliminó el 2026-06-04). Tiene
  `participants` (emails), `transcript`, `summary`, `organizerEmail`. ~16k filas.
- **Uso de Nexus** (`/para-ti/uso`, `lib/uso`, desde el 2026-10-16): cómo se usa Nexus, por equipo y por persona; solo
  dirección. Cuenta **aperturas**: entrar a una sección del menú, o volver a ella después de 30 minutos (`UsoDeNexus`,
  una fila por persona, sección y día). No guarda qué cliente ni qué documento se miró, ni minutos.
- **Reunión agregada a mano** (`lib/sessions/reunion-a-mano.ts`, desde el 2026-10-15): una reunión que no pasó por Meet
  (Zoom, Teams, presencial, una llamada), creada con «+ Agregar reunión» (`source = "manual"`, id `manual_…`), o una de
  Meet que no dejó nada y a la que se le agregó lo que pasó. Lo que pasó es la **transcripción** (va a `transcript`) o lo
  que la persona **recuerda** (va a `summary.overview` con la marca `summary.aMano`): Nexus lee las dos, pero un recuerdo
  nunca cuenta como palabras del cliente. Ver DECISIONS §Agregar una reunión a mano.
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
- **Post-proceso** (la lectura de la reunión, `lib/sessions/post-process.ts`): lee cada reunión con un cliente o un
  prospecto una vez, al llegar. El dueño sale de `resolvedClientId` (el manual, solo si no hay); sin dueño, no la lee.
  Deja la minuta, los compromisos y los pedidos fuera de alcance. Desde la etapa 2 de la memoria de la cuenta es la
  **lectura de seguimiento** y comparte la fila `LecturaDeReunion` con Tareas. Ver DECISIONS §La memoria de la cuenta.
- **Lectura de seguimiento** (etapa 2; en el código, sin desplegar): la pasada única sobre cada reunión con un cliente o
  un prospecto que no es de puertas adentro (el post-proceso, `lib/sessions/post-process.ts`), con su minuta, sus compromisos (propuestas de Tarea),
  sus pedidos y, desde la etapa 6, sus hechos. La corre el job `seguimiento-reuniones` por la cola `lib/lecturas`, con
  reintentos y presupuesto, y su estado vive en `LecturaDeReunion.seguimientoEstado`, en la misma fila que la lectura de
  Tareas. `SEGUIMIENTO_REUNIONES_ENABLED=0` vuelve al post-proceso viejo. Una persona la pide YA con «Leer esta
  reunión» (la página de una reunión sin minuta) o «Generar minuta».
- **Lo que dejó esta reunión** (`lib/seguimiento`, etapa 1): la tarjeta de una reunión con un cliente o un prospecto que junta lo
  que propuso Nexus al leerla: la minuta, los pedidos fuera de alcance, los campos de la ficha, la etapa, la fecha del
  diagnóstico, tus tareas propuestas, las alertas que la citan (solo para quien lidera Customer Success) y, plegado y
  solo para leer, lo demás que dejó la reunión en Tareas (desde la etapa 2; antes, los compromisos viejos). Desde la
  etapa 6 (con `SEGUIMIENTO_HECHOS=1`) muestra también sus hechos, cada uno con a dónde fue; una novedad que puedes
  decidir pide decisión y entra a «Usar todo». Está en la página de la reunión y, agrupada, en «Para ti». Pide
  revisión 30 días.
- **Lo propuesto** (ciclo de vida, `lib/lo-propuesto`, etapa 1): todo lo que Nexus deja para que una persona lo use o lo
  descarte. Cuatro estados: pendiente, usado, desestimado y **vencido**. «Sin firma» marca lo que cambió de estado sin
  una persona. Todo se puede desestimar, salvo la minuta, que se corrige. Es lo que mide «Uso de Nexus», tipo por tipo:
  la minuta, los pedidos, los campos de la ficha, la etapa, la fecha del diagnóstico, las tareas propuestas, las alertas
  y, desde el 2026-10-10, las novedades, los hechos para Procesos y las sugerencias sobre el handoff.
- **vencido** (lo propuesto, desde la etapa 1; en Tareas ya existe): nadie lo decidió en su plazo (30 días; en Tareas, 14) o lo cerró el sistema. Se calcula al
  leer y no se guarda, salvo en Tareas. No borra nada, y decidir después sigue valiendo. No es el «vencido» de Cobranza.
- **Usar todo** (tarjeta «Lo que dejó esta reunión», etapa 1): revisa la minuta, confirma los pedidos fuera de alcance y usa tus
  tareas propuestas de esa reunión (y, desde la etapa 6, da por usadas las novedades que puedes decidir, como un
  «Listo»). Nunca toca la ficha, la etapa, la fecha del diagnóstico ni las alertas: tienen su propia puerta.
- **Hecho de reunión** (`HechoDeReunion`, etapa 6): una frase con su cita literal verificada que dejó una reunión, con a
  quién pertenece (la cuenta o un proyecto vinculado), su tipo (cuenta, persona, acuerdo, resultado, proceso de hoy,
  queja, riesgo, señal de cronograma o señal de etapa) y su estado. Lo escribe la lectura de cada reunión; el código
  decide a dónde va. Un compromiso no es un hecho: va a Tareas. El estado tiene dos niveles: uno por destino
  (pendiente, usado, desestimado o delegado: su ciclo vive en el destino) y uno general (pendiente, usado, desestimado;
  «vencido» a los 30 días, se calcula). Quién lo dijo se guarda solo si lo comprueba el turno de la transcripción. Una
  reunión que cambia de dueño retira sus hechos vivos del cliente anterior (INV45 vigila que todo hecho vivo sea del
  cliente de su reunión). Se escriben solo con `SEGUIMIENTO_HECHOS=1` (apagada por defecto) y su SQL.
- **Enrutador** (`lib/seguimiento/enrutador.ts`, etapa 6): el código que, con el registro de destinos, decide a dónde va
  cada hecho de una reunión (la ficha, una alerta de queja, el vigía, Procesos, el avance, la etapa o una novedad) y qué
  hay que correr. El modelo clasifica; el enrutador rutea. Nunca manda nada al handoff.
- **Novedad** (`lib/seguimiento/novedades.ts`, etapa 6): lo que un hecho pendiente le propone a un documento que ya tiene
  contenido (Planificación › pipelines, Kickoff › alcance…), de una reunión que sigue vinculada al proyecto. No se
  guarda: se calcula. Como mucho 5 por documento; vence a los 30 días. Se ve en el riel (la chispa con el número), en la franja «N novedades de reuniones» arriba del
  documento, en «Qué sigue» y en la tarjeta de la reunión. Se usa con «Cambiar con el chat» (queda usada al aplicar el
  acuerdo) o con «Listo», se suma la reunión al contexto, o se marca «No aplica». Solo con `SEGUIMIENTO_HECHOS=1`.
- **Registro de destinos** (`lib/seguimiento/destinos.ts`, etapa 6): qué tipos de hecho le sirven a cada módulo y dónde los
  muestra. Un test lo congela contra las secciones reales de cada documento. Sumar un módulo es sumar una entrada.
- **Handoff**: documento de traspaso Ventas→CS, generado por agente desde las sesiones de venta del
  proyecto. Vive en `CanvasBlock`s del canvas "Handoff".
- **Handoff congelado** (etapa 3b, `lib/handoff/congelado.ts`): la foto fija de lo vendido en un proyecto. Se congela con
  «Congelar» (celda `handoff.congelar`: el CSE, la CSL, Ventas y dirección) o, solo, la primera vez que se aplica el
  cronograma que propone; se guarda como un hito «congelado» del canvas con su foto protegida. Sigue editable a mano;
  la IA ya no lo regenera: «Regenerar» pasa a «Buscar lo nuevo» (misma celda que «Congelar»). «Rehacer desde cero»
  pide un motivo y la celda de regenerar, corre la generación de siempre y lo vuelve a congelar al terminar (hito
  «rehecho»).
- **Sugerencia sobre el handoff** (etapa 3b, `lib/handoff/sugerencias.ts`): un bloque en borrador que la IA deja sobre un
  handoff congelado, con lo nuevo de las reuniones posteriores al congelado y una frase de la reunión copiada tal cual
  (verificada). Se pide con «Buscar lo nuevo», solo suma y se usa o se descarta en el documento. Mientras nadie la usa
  no llega a ningún agente, y lo descartado no se vuelve a proponer.
- **Memoria de la cuenta** (`memoriaDeLaCuenta`, `lib/memoria`, etapa 3: la leen todos sus lectores, también el diagnóstico y la planificación, sin la ficha ni los procesos, que leen aparte, y desde el 2026-10-10 el vigía): lo que Nexus ya sabe de una empresa: la ficha (lo
  confirmado y lo propuesto, con su fuente), los procesos, la historia de los proyectos y, solo en la versión interna,
  lo fuera de alcance, lo aprendido en la preventa y la auditoría del portal confirmada. La arma un solo cargador en
  tres alcances: para el cliente, sin lo interno (el handoff) e interno. Cada lector está declarado en
  `lib/memoria/consumidores.ts`, con las partes que no recibe porque ya las tiene. En la preventa entra como la fuente
  **A0** y en la exploración de un proyecto como **F0**: ninguna de las dos cuenta como lo que dijo el cliente. Nunca
  lleva facturación, montos de Partner, rentabilidad ni salarios.
- **Memoria del proyecto** (`memoriaDelProyecto`, etapa 3): lo que dejó cada reunión del proyecto (en la versión para el cliente, solo
  los acuerdos y las decisiones de las reuniones con el cliente; en la interna, también los compromisos abiertos de
  Tareas), las desviaciones y los resultados. Ningún agente vuelve a leer todas las reuniones.
- **Lo que la IA ya sabe** (`queSabeLaIA`, `lib/memoria`): los conteos de la memoria que muestra la página de inicio de la exploración,
  en tarjetas: datos de la ficha confirmados y propuestos (y por quién), y en un proyecto el handoff (si está congelado y
  cómo), cuántas reuniones tienen minuta y si hubo preventa; en una preventa, el test. Nunca el contenido.
- **Ficha del cliente** (`Client.ficha`): una por empresa. Lo confirmado lo escribe el CSE y viaja a HubSpot; lo
  propuesto lo deja la IA (handoff, reuniones, exploración, HubSpot) o la preventa sin IA, desde el primer día (al
  preparar y al confirmar una casilla, `lib/exploraciones/a-la-ficha.ts`), con la fuente y el origen de cada campo
  (`origenPorCampo`). Desde la etapa 3 (formato 2), lo confirmado guarda por campo quién, cuándo y de qué fuente
  (`historia`), y los descartes quedan en `decisiones`. Su versión para el cliente no lleva la postura de las personas ni
  los campos internos. Cada persona va en una viñeta con cuatro partes (nombre — cargo — papel — postura, «sin dato» en
  la que falta): con menos, al cliente solo le llega el nombre. Un campo propuesto que trae algo interno de la preventa
  (`internoPorCampo`) no sale del alcance interno de la memoria hasta que el CSE lo confirma.
- **Kickoff**: arranque del proyecto con el cliente (canvas "Kickoff"; tiene vista externa).
- **Cronograma** (`ProjectTimeline`): plan del proyecto con fases/tareas/baselines/fechas reales/avances.
- **Fecha límite** (`ProjectTimeline.fechaLimite`): el día en que el cliente necesita todo listo (vence una
  licencia, un lanzamiento). No es el cierre fijado a mano (eso es qué fecha se MUESTRA). Si el plan cierra
  después, aparece un aviso arriba del Gantt. La propone la IA del handoff con su cita; la confirma Ventas
  (o el CSL o el CSE), y moverla pide motivo y con quién se acordó. Ver DECISIONS §El cronograma cabe en lo acordado.
- **Duración vendida** (`ProjectTimeline.duracionVendidaSemanas`): las semanas que se vendieron, SIN contar la
  Semana 0. Se compara contra el ancho de calendario del plan sin la Semana 0. Mismo ciclo que la fecha límite.
- **Tipo de fase** (`tipo` en la salida del handoff, `lib/timeline/acomodar-en-paralelo.ts`): arranque,
  diagnóstico, planificación, configuración, migración, desarrollo, capacitación, pruebas o cierre. Con él,
  el código pone los inicios (lo que va en paralelo); nunca alarga el plan que armó la IA.
- **Presentación de un documento** (`PresentacionDeDocumento`, `lib/presentaciones`): cuándo se le presenta al cliente
  el kickoff, el diagnóstico, la planificación o la entrega. Lo responde solo Customer Success (el encargado del
  proyecto, quien generó el documento o la CSL): una fecha, «Todavía no sé» o **«Ya lo presenté»**. Cada respuesta
  es una fila, con quién y cuándo. Del diagnóstico, Nexus propone la fecha si una reunión la dice, y dos días antes
  pide confirmar que está **listo**: ahí avisa al vendedor dueño de la empresa en HubSpot. Hasta el 2026-10-14 era
  solo del diagnóstico (`Project.diagnosticoPresentacion`, DEPRECATED). Ver DECISIONS §Cuándo se presenta cada
  documento.
- **Solicitud fuera de alcance** (`PedidoFueraDeAlcance`): algo que el cliente pidió en una reunión y no estaba en
  lo vendido. La propone el agente, la confirma o la descarta el CSE, y se sigue en la cuenta («Fuera de alcance»):
  confirmada, cotizada, aprobada, no la tomó. Al confirmarla, avisa al vendedor y a Customer Success. Hasta el deploy de
  la etapa 2 de la memoria de la cuenta, en producción la lectura de una reunión la crea aunque no haya proyecto
  (`projectId` vacío). En el código ya nace solo en una reunión de un cliente con proyecto principal, comparada contra
  lo que se vendió en él: un prospecto no tiene.
- **Lo vendido** (guía de exploración de un proyecto): el tercer bloque de preguntas, al lado de la estrategia y la
  escala: una por pieza del alcance, sobre cómo la va a usar el cliente.
- **Recordatorio de adopción**: el aviso de «Para ti» que pide revisar la adopción del cliente a los 30 días, la
  semana antes de la entrega y cada mes en las cuentas recurrentes. Lleva a la pestaña Adopción de Éxito del cliente.
- **Encuesta de la etapa** (`components/clients/EncuestaDeEtapa.tsx`): la única forma en que Nexus escribe la etapa
  de un proyecto en HubSpot. Una pregunta, «¿En qué etapa está el proyecto?», con una respuesta por etapa del tablero;
  la aprueba el CSE (o el CSL o dirección). Si una reunión muestra que el proyecto avanzó, queda una **etapa
  sugerida** (`Project.etapaPropuesta*`) con la frase de la reunión, y esa respuesta viene marcada. HubSpot → Nexus
  sigue siendo el espejo. Ver DECISIONS §La etapa se sincroniza con HubSpot en los dos sentidos.
- **Catálogo de casos de uso** (Ventas › Casos de uso, `/sales/use-cases`, `lib/casos-de-uso/catalogo.ts`): lo que un
  cliente consigue con Smarteam, caso por caso: el resultado (nunca el trabajo), lo que dice el cliente cuando lo
  necesita, lo que obtiene y qué mueve en la Escala de Rendimiento (dimensión, de qué nivel a cuál y qué criterios). Cuatro
  tipos: **aterrizar** (lleva un área a Funcional), **reactivar** (un HubSpot que no se usa), **expandir** (desde
  Funcional) y **complementario** (no mueve la escala). Vive en el repo, no en la base: se mira en Nexus, se sugiere un
  cambio o un caso nuevo por Feedback y se edita en el código. Lo usan la preventa (ids `cat-…`) y la propuesta. Las
  licencias y el precio son la fase 2. No es el `CasoDeUso` de SmartLoop (lo que se hace en un ciclo).
- **Propuesta comercial** (modelo `BusinessCase`): lo que Ventas le arma a un prospecto —qué le
  duele, qué le proponemos, qué gana y cuánto cuesta—. Vive FUERA del proyecto, porque todavía no
  hay proyecto. **Se llamaba "Business Case" hasta el 2026-08-03**; el renombre fue solo del
  nombre visible. La IDENTIDAD sigue en inglés a propósito y no se toca: el modelo `BusinessCase`,
  el campo `businessCaseId`, la ruta `/business-cases` y el slug de pieza `business-case`.
  Cambiar eso rompería links ya pegados y obligaría a migrar datos sin que nadie del equipo viera
  la diferencia. Ver DECISIONS §El renombre.
- **Tareas internas** (`/tareas`, `lib/tareas`): el trabajo de cada equipo de Smarteam semana a semana. Nexus lee la
  reunión del equipo (el planning del lunes, la retro del viernes) y propone las tareas; cada persona decide, las agenda
  y el viernes revisa su semana. Ver DECISIONS §Tareas internas y `docs/tareas-plan.md`.
- **Tarea** (`Tarea`, «T-12»): algo que hacer, con un responsable, una semana (el lunes, en hora de Costa Rica) o
  ninguna (más adelante), y para quién es (su **ámbito**). Una **propuesta** es una tarea que todavía no se decidió
  (la sugirió Nexus o la pidió otra persona); una **lápida** es una propuesta descartada, que no se vuelve a proponer
  por 28 días; una **vencida** es una propuesta que nadie decidió en 14 días.
- **Sprint** (`Tarea.equipo`): el equipo de casa del responsable, por su área (marketing, cs, ventas…). **Por
  asignar**: las tareas de un sprint sin responsable. El **líder** del sprint es quien tiene `tareas.manage` en /team.
- **Ámbito** (`lib/tareas/ambito.ts`): para quién es una tarea: cliente, prospecto, aliado, interno o **sin
  clasificar**. Interno = una empresa de Smarteam o un proyecto marcado interno (SmartAgro).
- **Proyecto de tareas** (`ProyectoDeTareas`): un grupo de tareas con responsable y fechas («Campaña de SAP»). NO es
  un `Project` (eso es un servicio que se factura); puede servir a uno. Nexus lo **sugiere** cuando tres o más líneas
  de una reunión hablan de lo mismo.
- **Espacio** (`EspacioDeTareas`): donde viven los proyectos: el de cada equipo, o uno libre con sus miembros (1A.2).
- **Revisa tu semana** (`components/tareas/RevisaTuSemana.tsx`): cada persona marca qué terminó («La terminé») y qué
  sigue; lo que sigue pasa a la semana siguiente sin duplicarse, y después se agenda. **Semanas sin revisar**: las
  semanas pasadas con tareas abiertas que la persona todavía no revisó; se revisan cuando sea, en orden.
- **Tarea privada** («Solo para mí»): la ve solo su responsable; en la semana del equipo es una fila opaca que dice
  cuánto pesa.
- **Bloque de agenda**: el evento privado de Google Calendar que Nexus crea para UNA tarea, con el clic de su dueña.
- **Asistente de tareas** (`lib/tareas/chat`, `components/tareas/AsistenteDeTareas.tsx`): el chat de Nexus sobre las
  tareas de UNA persona, con un solo hilo que la sigue por todas las pantallas. Propone cambios (crear, sugerir,
  mover, esperar, armar un plan) en una lista que se lee antes de aplicar; aplicar es todo o nada y nada se crea solo.
- **Borrador de un plan**: el proyecto que arma el asistente con sus tareas («un onboarding de 30 días»). Queda en
  `propuesta`, con las tareas adentro sin responsable ni semana; **Activar** las reparte (lo tuyo pendiente, lo de
  otros como sugerencia) y nadie recibe nada antes.
- **Contexto de una tarea** (`Tarea.contexto`): lo que escribe Nexus al generar una tarea (de una reunión, de la
  conversación o del chat): para qué es, para quién y qué se espera. No se edita; lo de la persona va en «notas». El de
  una reunión con cliente lo ve quien estuvo, y quien la hace o la pidió si ve al cliente.
- **Lo que delegaste** (`/tareas/delegadas`): lo que le pediste o asignaste a otras personas o equipos, y cómo va
  (atrasadas, sin decidir, en curso, pendientes y cerradas de 30 días, con el último movimiento).
- **«¿Faltó algo?»** (nivel 2 de la lectura): leer la CONVERSACIÓN de una reunión ya leída, para los compromisos que
  no quedaron en las notas. Sin «Próximos pasos», Nexus la lee solo. La cita de cada propuesta es lo que dijo la persona.
- **Tarea de HubSpot** (`Tarea` con `origen = "hubspot"`, `lib/tareas-hubspot`): una tarea de HubSpot de alguien del
  equipo, en Tareas internas. Lo que cambia de un lado (título, estado, vencimiento, prioridad, responsable) se escribe
  del otro; si cambiaron los dos, gana el último. Lleva el chip «HubSpot» (o «HubSpot · secuencia»). «Ya no se hará» no
  se escribe en HubSpot.
- **Vínculo de una tarea** (`TareaVinculo`): un registro que acompaña a una tarea sin cambiar para quién es: de
  HubSpot (contacto, empresa, negocio, ticket, proyecto u objeto propio, por el enlace de su ficha), una propuesta
  comercial o una preventa. Es una foto: no sincroniza ni escribe en HubSpot. Ver DECISIONS §Tareas internas.
- **Tarea de seguimiento**: la propuesta de Tarea para el CSE que nace de lo que prometió el cliente en una reunión
  («Recordarle a Ana que envíe la base»), con la cita verificada y, si aplica, la marca «frena el plan». En un prospecto
  va a quien lleva la preventa; sin preventa viva, no se propone. Vence a los 14 días, como toda propuesta de Tareas
  (`lib/tareas/seguimiento.ts`).
- **pendiente histórico** (`ActionItem`): los pendientes que dejaba el post-proceso. DEPRECATED desde la etapa 2 de la
  memoria de la cuenta: no se crea más y lo existente queda sin borrar. Los próximos pasos viven en Tareas.
- **Recorrido** (`lib/recorridos/`): un tour guiado de una pantalla. Oscurece la pantalla, deja a la vista una
  cosa a la vez con un borde azul y la explica en un globo con «Saltar», «Anterior» y «Siguiente». Cada pantalla
  que tiene uno muestra el botón «Recorrido» en su cabecera, con un punto azul si no lo viste o si cambió. Todos
  los de tu rol están en el menú del avatar, en «Recorridos». El contenido vive en el repo; lo visto, en la cookie
  `nexus-recorridos`. Ver DECISIONS §Recorridos guiados.
- **Contexto adicional** (`components/contexto/ContextoAdicional.tsx`): el bloque plegable arriba de
  una pieza con lo que lee su IA además de lo de siempre (desde la etapa 3 de la memoria de la cuenta, la memoria): las
  reuniones (en el cronograma, las que elijas; en los demás documentos del proyecto, las que elijas, y Nexus sugiere
  algunas, desde la etapa 7; hasta entonces entraban todas las del proyecto con el cliente), las fuentes manuales y las
  «Instrucciones adicionales», que pesan más que lo demás y no son evidencia. En todos se puede buscar y sumar
  cualquier reunión de Meet de tu calendario o del cliente (2026-10-07). Todos con el mismo enlace y el mismo
  formulario: «+ Sumar una sesión o un documento» pega el texto o sube un archivo, y el archivo queda además en
  Información del cliente › Documentos. En el Resumen del proyecto se llama **Contexto del handoff** y vive dentro de
  la tarjeta del handoff: solo lo lee su agente. Va solo donde un agente lo lee. En la preventa: Preparación, con sus
  fuentes y sus instrucciones; Casos de uso, solo sus instrucciones; La escala, con la explicación de que no tiene
  agente; Resumen y Propuesta, sin el bloque. La exploración (de la preventa y del proyecto) no lo tiene: su **página de
  inicio** lleva las sesiones, las fuentes manuales y las instrucciones, sin reuniones, y Preparación dice qué sesiones
  lee. Cada artefacto guarda lo suyo: en los proyectos, el handoff, el cronograma, el kickoff, el
  diagnóstico, la planificación, integraciones, la ejecución y la entrega; en la preventa, las reuniones y las fuentes
  son de la empresa y las instrucciones, de cada pieza. Se llamaba «Contexto del cronograma», «del diagnóstico», etc.
  hasta el 2026-10-06.
- **Frontera de los documentos** (`FRONTERA_DE_LOS_DOCUMENTOS`, etapa 4 de la memoria de la cuenta): la regla que viaja
  con las reuniones y las notas de todo documento que lee el cliente (kickoff, diagnóstico, planificación,
  integraciones y entrega): sin precios de Smarteam, sin lo dicho puertas adentro como dicho por el cliente, sin decir
  de dónde salió cada cosa. Las cifras del negocio del cliente van solo donde la sección las pide, y tampoco dicen de
  dónde salieron. Los documentos internos (implementación y exploración) llevan solo lo de puertas adentro.
  En el chat de esos cinco documentos, la línea termina en «⚠ revisa» si cita una reunión, una nota, la minuta o el
  kickoff («según la reunión…», «confirmado en el kickoff»), en los cinco; o si trae un monto, solo en kickoff,
  planificación e integraciones (en el diagnóstico y la entrega una cifra del cliente es contenido). Nunca marca
  fechas, plazos ni correos, ni a una persona nombrada como fuente («según Ronald»: eso lo cuida solo la regla). Con
  `SEGUIMIENTO_HECHOS=1`, «Cambiar con el chat» lleva la frase y la cita de la novedad, y la línea que copia esa cita
  también termina en «⚠ revisa».
- **Reunión elegida** (documentos del proyecto): la que una persona sumó al «Contexto adicional» de un documento
  (`…Override = true`). Desde la etapa 7 es la única que entra a ese documento, y la IA la lee entera: lo que se dijo
  y su minuta (en un documento del cliente, solo los acuerdos y las decisiones de la revisada), con tope (160.000
  caracteres en total, 60.000 por reunión, 6 enteras; las siguientes, en resumen, y pasadas las 24 no entran;
  `lib/contexto/material-del-documento.ts`). Las que no dejaron nada que leer no ocupan lugar, y si no se leyeron todas
  el mensaje dice cuántas. Se lee aunque sea de antes del piso del proyecto. Sin elegidas, el documento trabaja con la
  memoria del proyecto (en uno del cliente, de las demás reuniones solo llegan los acuerdos de las minutas revisadas) y
  el mensaje dice que nadie eligió reuniones. La X sobre una elegida la deja sin tocar (`null`). La exploración todavía
  lee con la regla de antes.
- **Reunión sugerida** (documentos del proyecto, etapa 7): la que Nexus propone para un documento, calculada al leer
  (en el diagnóstico, la reunión que alguien unió a una sesión de la exploración o la de su evento; en todos, las
  reuniones con hechos abiertos para ese documento; y, desde el 2026-10-10, «Reunión con el cliente en este proyecto»:
  las que el documento leía antes de la etapa 7 y nadie eligió ni descartó, las 8 más recientes;
  `lib/contexto/sugerencias-del-documento.ts`). Se ve arriba de la
  lista del panel, con su motivo. No entra hasta que alguien toca «Usar»; «Descartar» la deja desestimada (`false`,
  sin candado) y no se sugiere más mientras exista el vínculo (el clasificador puede borrarlo y recrearlo vacío). La X
  sobre una elegida la devuelve a sugerida, no la descarta.
- **Preventa** (Ventas → Preventa, `/sales/exploraciones`, modelo `ExploracionDeVenta`): el lienzo de
  una empresa en venta, desde que llega (por el test o desde HubSpot) hasta la primera propuesta y el
  traspaso al CSE. Sus piezas: Preparación (Identificación y Conexión) · Exploración (las reuniones) ·
  Información del cliente · Procesos · La escala · Casos de uso · Propuesta. La trabaja todo Customer
  Success (permiso `preventa`, desde el 2026-10-06); armar la propuesta sigue siendo de Ventas. Se
  llamaba «Exploración de venta» hasta el 2026-10-03; la dirección y el modelo conservan ese nombre. No
  confundir con el canvas «Exploración» de un proyecto (el del CSE).
- **Sesión de la exploración** (pieza Exploración, `SesionPlaneada`; se llamaba «sesión de la preventa»): una reunión
  de la exploración, en la preventa o en un proyecto. Desde la etapa A de la memoria de la cuenta, en un prospecto
  entra sola cada reunión con la empresa (desde un mes antes del alta, y las de antes con alguien de Ventas), menos las
  de puertas adentro y las de una serie; en un cliente o un proyecto se agrega con «+ Agregar sesión» (una agendada,
  una que ya pasó o una sin reunión). Puede unirse a un evento del calendario antes de que ocurra; cuando ocurre, espera
  su transcripción y la lee. Una reunión que no está en una sesión no es de la exploración. Su **título** es el
  del evento del calendario hasta que alguien le pone otro (desde el 2026-10-08). Va en tres pestañas
  (se llamaban Antes, Durante y Después hasta el 2026-10-07). **Preparación**: en qué estado está la guía, el
  objetivo (lo sugiere el agente), cuándo y con quién, lo que traes de las sesiones anteriores y la guía (abrir,
  preguntar, cerrar). **En vivo**: las notas libres y cada pregunta con su casilla de hecha y lo que respondió. **Análisis**: lo que leyó el agente de esa reunión (resumen y qué se respondió), lo que sugiere y
  **Quedó abierto**. Una pregunta que viene de antes lleva su etiqueta: **«Quedó abierto en la sesión N»**
  (el vendedor la marcó para llevar) o **«Pasó de la sesión N»** (esa sesión se cortó). Una sesión sin
  conversación pregunta qué pasó: otro canal, se cortó o no se hizo. Ver DECISIONS §Las sesiones de la preventa y
  §La exploración son sus sesiones.
- **Fuera de la exploración**: lo que se sacó de las sesiones (en un prospecto) o lo que se leyó o se eligió antes y no
  es sesión (en un cliente o un proyecto). Va plegado en la página de inicio. No se borra, y se vuelve sesión con un
  clic.
- **Página de inicio de la exploración**: lo primero al abrir Exploración. La próxima sesión con «Preparar la sesión»,
  las sesiones con su reunión y su estado, «+ Agregar sesión», «Fuera de la exploración», las fuentes manuales, las
  instrucciones y «Lo que la IA ya sabe». No tiene lista general de reuniones.
- **Estados de la reunión de una sesión**: sin reunión, agendada (unida a un evento del calendario), esperando la
  transcripción (hasta 6 horas después de terminar), leída, sin leer, solo notas, terminó sin transcripción ni notas,
  cancelada en el calendario, corta (casi sin conversación) y no se hizo. Cada estado dice qué hacer. La que se unió
  sola por la fecha lo dice: «ligada por fecha».
- **Correo de seguimiento** (sesión de la preventa o de la exploración de un proyecto › «Análisis»): el correo que se
  le manda al cliente después de una reunión: lo que entendimos, lo que acordamos y los próximos pasos (la minuta),
  las preguntas de «Quedó abierto» y la próxima reunión o una sesión extra para profundizar. Lo arma el agente a
  pedido; lo revisa y lo manda una persona desde su correo. Nexus no envía nada. Ver DECISIONS §El correo de seguimiento.
- **Exploración del proyecto** (desde el 2026-10-07, `lib/exploraciones` con `marco = "cs"`): la pieza
  Exploración de un proyecto es el MISMO lienzo de la preventa —sesiones en el riel, cada una con
  Preparación, En vivo y Análisis— con las preguntas de Customer Success: la **estrategia** del cliente
  (retos, resultados que persigue y obstáculos) y la escala. Lo que se confirma de la estrategia va como
  sugerencia a **Información del cliente**. Debajo de las sesiones, «Informe anterior» (los **Cuestionarios**
  colgaban también de ahí hasta el 2026-10-11, cuando pasaron a ser un artefacto propio). Desde la etapa A de la memoria de la cuenta abre en su **página de
  inicio**, y solo cuentan las reuniones que son de una sesión: lo demás del proyecto le llega por la memoria. Ver
  DECISIONS «La exploración del proyecto es la de la preventa» y «La exploración son sus sesiones».
- **Cuestionarios** (artefacto del proyecto, entre el Kickoff y la Exploración desde el 2026-10-11, `lib/cuestionario`;
  antes «cuestionario previo», dentro de Exploración): lo que contesta cada persona del cliente por su enlace, sin
  contraseña. Recomendado, nunca requerido: no frena ninguna etapa. Tres tipos: el **táctico** (por hubs y etapas del
  proceso), el de la **escala** (una pregunta por dimensión) y el de **estrategia** (el desafío central, los
  resultados que necesitan, los obstáculos, qué pasa si no lo resuelven, cómo miden el éxito y las prioridades del
  año). Nexus prellena lo que ya sabe; lo prellenado que la persona no **confirma** sigue siendo una suposición, no un
  dato del cliente. Lo que confirma en el de estrategia alimenta la exploración del proyecto, el diagnóstico y, como
  propuesta con origen «Cuestionario», los retos estratégicos de Información del cliente (el desafío, los obstáculos y
  las prioridades; los resultados que necesitan no van a la ficha). En el riel de la ficha es la pieza
  `questionnaires`, que no vive en un canvas: aparece con la Exploración o con algún cuestionario, en cualquier ciclo, y
  dice cómo van («sin enviar», «enviado» o «respondido N de M»); el «Qué sigue» del proyecto la recomienda solo en el
  Handoff y en la Exploración, hasta que se publica uno o alguien dice «Ahora no». Ver DECISIONS «Cuestionarios es un artefacto propio, entre Kickoff y Exploración».
- **Exploración — Sesiones y Cuestionarios** (del 2026-10-05 al 2026-10-07, `lib/guia-exploracion`): la
  versión anterior, con una pestaña por sesión. Sus datos se migran con `scripts/migrar-guia-de-exploracion.ts`.
- **Exploración** (canvas "Exploración", `agent-exploracion-canvas`, hasta el 2026-10-02): guía **INTERNA** por
  proyecto para descubrir el negocio del cliente cuando el kickoff ya pasó — qué hay que
  entender, cómo preguntarlo, en qué orden y a quién del cliente involucrar en cada sesión.
  Su eje es separar **lo que ya sabemos** (afirmado por el handoff, con su fuente → no se
  repregunta) de **lo que damos por supuesto** (sin verificar → de ahí salen las preguntas).
  7 secciones sobre el motor `LandingView`. Es un **canvas de proyecto como Kickoff o
  Cronograma**: aparece en el dropdown de canvases y se genera con su agente desde el
  **header del propio canvas** (no hay CTA aparte). Sus fuentes, por peso, son: handoff del
  proyecto (ancla) → handoffs y proyectos previos del cliente → etiquetas → los demás canvas.
  **El cliente NUNCA la ve**: no existe ruta
  `/external` ni publicación (congelado por `lib/canvas/exploracion-internal.test.ts`) y se
  renderiza con la **paleta interna** (`.stl-internal`: grises y blancos, ámbar solo para lo
  no verificado) para distinguirla a simple vista de los documentos de cara al cliente.
  Es **tag-driven**: los tags del handoff inyectan sus lentes y dirigen qué va a buscar.
  Ver DECISIONS §Exploración.
- **lente de exploración** (`EXPLORACION_TAG_LENSES`, en
  `components/landing/configs/exploracion-lenses.ts`): el bloque de prompt que un TAG le inyecta
  al agente de Exploración — qué supuestos suele esconder ese tipo de proyecto y qué clase de
  pregunta los cierra. Solo entran las lentes de los tags ACTIVOS del proyecto. Es lo que
  convierte al tag de etiqueta decorativa en **disparador**: `sitio_web` manda a preguntar por
  referencias/anti-referencias, funcionalidad y assets; `sales_hub`, al proceso de venta real.
  Influyen el CONTENIDO, no la estructura (las 7 secciones son fijas). Un tag nuevo SIN lente
  rompe `lib/canvas/exploracion-lenses.test.ts`.
- **tag Sitio web** (`sitio_web`, grupo `scope`): marca que el alcance incluye construir o
  rediseñar un sitio, landings o web pública — sea en HubSpot o fuera. Lo emite el agente de
  handoff y el CSE lo corrige en la tira de tags. NO implica `custom_dev`: un sitio en el CMS sin
  integraciones no lleva fase técnica ni canvas Desarrollo.
- **Particularidad** (`Particularidad`): desviación FECHADA y curada del cronograma con atribución —
  el "por qué y quién" movió el plan, en lenguaje cliente (a diferencia de `TimelineChange`, cuyo log
  es ruido de máquina). Es un hecho que ALTERÓ el plan (movió/comprometió una fecha), no un pendiente.
  Dos tipos vigentes (`kind`): **ATRASO** (`weeksImpact` OBLIGATORIO ≥1) / **COMPROMISO**; `SOLICITUD`
  está deprecado (un insumo del cliente es una tarea `party=CLIENTE`, no una particularidad — ver el
  eje DESTINO en DECISIONS.md; filas legacy conservan el enum como fallback de render). **`party` acá
  = quién CAUSÓ el corrimiento**, NO quién ejecuta (el mismo enum `TaskParty` significa *dueño* en una
  tarea — ver DECISIONS, "dos ejes sobre un enum"); `AMBOS` es la excepción, no el punto medio.
  `weeksImpact` = semanas de corrimiento; `occurredAt` = fecha de la sesión del hecho; `sourceQuote` = cita interna que lo
  respalda ([fecha] «fragmento») y que **NUNCA** cruza al cliente (fail-closed en el chokepoint).
  Cruza al cliente SOLO si `visibleExternal=true` (gate por-registro, como SUSPENDED). El CSE la crea
  a mano o acepta una propuesta del agente de avance (borrador `pendingParticularidades`, apply
  separado del avance). El resumen suma `weeksImpact` por party ("N semanas de corrimiento acumulado;
  X al cliente, Y a Smarteam").
- **Vocabulario interno → cliente** (lo que cruza a `/external/*` se traduce; adentro se sigue hablando
  como equipo). El cliente NO lee jerga de gestión ni reparto de responsables:

  | Interno (equipo) | Lo que lee el cliente |
  |---|---|
  | "N semanas de corrimiento acumulado" + desglose por party | "El plan se movió N semanas. Nueva fecha de cierre: …" |
  | "Particularidades del cronograma" | "Qué cambió en el plan" |
  | kind `ATRASO` / `COMPROMISO` / `SOLICITUD` | "Se atrasó" / "Acordado" / "En espera" |
  | `party` (quién causó) | *no cruza* — es cobertura interna, del lado del cliente es un marcador de faltas |
  | "CSE" | "tu equipo de Smarteam" |

  Regla de voz: al cliente se le habla de **TÚ** (nunca voseo ni "ustedes"), en las 4 superficies
  externas (verify → kickoff → cronograma → propuesta comercial). La guía de registro más completa vive en
  el `agentIntro` de `components/landing/configs/kickoff.defs.ts`.
- **Procesos** (ficha del cliente › La cuenta › Procesos, `lib/procesos`): los procesos de la cuenta, cada uno como un
  **mapa en carriles** con dos versiones —**hoy** y **después de la implementación**—. Son bloques de la sección
  `procesos` del canvas "Información del cliente" (`data.formato = "carriles-v1"`). Un **carril** es quién hace el paso
  (el cliente final, un equipo o un sistema). Cada paso dice de dónde sale: **dicho** o **acordado** por el cliente
  (con la cita de la reunión, verificada contra la transcripción), **propuesto** por Smarteam o **supuesto** por el
  agente. El mapa pasa por **borrador del agente → revisado → validado con el cliente**; el kickoff muestra solo la
  versión de hoy de los validados. Los mapas del formato anterior (`nodes` + `edges`) se siguen viendo hasta volver a
  mapear. El mapa se cambia en el **editor de pantalla completa**: cada cambio es una **operación**
  (`lib/procesos/operaciones.ts`), la misma que va a proponer el chat. Ver DECISIONS §Procesos.
- **Proyecto de prueba** (`Project.esPrueba`): un proyecto colgado de un cliente real para probar un módulo nuevo con sus
  datos. No existe en HubSpot, no cuenta en la cartera ni en Cobranza, el clasificador no le cuelga reuniones y el
  cliente no lo ve. En la ficha lleva la marca «Proyecto de prueba». Se crea con `scripts/crear-proyecto-de-prueba.ts`.
- **Servicio recurrente** (`PipelineDef.servicioRecurrente`, `lib/servicios`): un servicio que avanza por ciclos, hoy
  SmartLoop. En el riel, el Cronograma va junto al Resumen y el ciclo es un grupo «Ciclo · <etapa>» con los documentos de
  siempre más Adopción y Aprendizaje; su etapa es la del ciclo abierto. Ver `docs/smartloop-plan.md`.
- **Pieza oculta** (`Project.piezasOcultas`): una pieza del riel que el equipo ocultó en ese proyecto; queda en «Ver N
  piezas más», no se borra ni se apaga.
- **La escala de la empresa** (La cuenta › La escala): dónde está la empresa en cada área de la escala, con la fecha y de
  dónde sale (las exploraciones con niveles confirmados). Sirve venga o no de una preventa.
- **Ciclo** (`CicloDeProyecto`): un tramo con fechas de un servicio recurrente que pasa por las cinco etapas del método
  (Diagnóstico, Planificación, Implementación, Adopción, Aprendizaje). Abre con un diagnóstico y cierra con la sesión de
  aprendizaje; uno abierto por proyecto, y los cerrados se conservan.
- **Caso de uso** (`CasoDeUso`): lo que se hace en un ciclo, con el resultado que persigue, lo que mueve en la escala
  (puede ser más de una dimensión), por qué ahora y su **criterio de aceptación** (cómo se sabe que funcionó). Es de la
  empresa: puede estar sugerido, en el plan de crecimiento o dentro de un ciclo.
- **Compromiso** (`Project.compromiso`): cuánto se comprometió el servicio recurrente (mes a mes, seis meses, un año).
  Opcional.
- **Guía del CSE** (`lib/servicios/<servicio>.ts`): por etapa del ciclo, qué hace el CSE, qué tiene que quedar producido
  y la señal de que la etapa se saltó; sale del documento de proceso del servicio.
- **Proyecto sentinel `__strategy__`**: proyecto especial por cliente que aloja el canvas de
  contexto/estrategia (no es un proyecto real de servicio).
- **`hubspotCompanyId`** (en `Client`): id de la company de HubSpot ligada al cliente. Habilita
  HubSpot→Client en el cascade.
- **`ClientKind`** (`Client.kind`): qué ES una empresa para el negocio, en un solo enum
  excluyente. **CLIENTE** = nos compró o nos está comprando (la cartera: entra a los listados,
  al portafolio y a cobranza) · **PROSPECTO** = Ventas la creó para una propuesta comercial, todavía no
  compró · **ALIADO** = aliado comercial o partner con el que trabajamos (ej. 4am Saatchi), es
  una empresa pero no es cartera · **INTERNO** = Smarteam y sus entidades (no somos nuestro
  propio cliente). Se marca por interfaz en la ficha del cliente → Configuración y se navega por
  las pestañas de /clients. Reemplaza a `Client.isProspect` (DEPRECATED, eliminar después del
  2026-09-30).
- **cartera (de CS)** / **`CS_CLIENT_WHERE`** (`lib/clients/kind.ts`): los clientes de verdad,
  o sea `kind = CLIENTE`. Es el filtro ÚNICO que usan los listados y métricas de CS, cobranza y
  portafolio — **ninguna query escribe `kind` a mano**. Es ortogonal al acceso
  (`accessibleClientWhere`, quién ve qué cliente): uno dice "esto es un cliente", el otro "a este
  usuario le toca".
- **TAM** (`Client.tamUsd`): *Total Addressable Market* de una cuenta — cuánto puede llegar a
  facturar en un año, en USD. Lo estima **Ventas a mano** (celda `ventas.write`); Nexus no lo
  deriva de cobros ni de proyectos. `null` = **sin estimar**, que NO es cero: el "potencial
  estimado" del listado suma los cargados y cuenta los sin estimar aparte.
- **meta comercial** (`MetaComercial`, `lib/ventas/metas.ts`): cuánto tiene que vender una persona en el año, copiado
  de las metas de HubSpot, con el **avance** que calcula HubSpot. Una meta trimestral son cuatro tramos; el total se
  suma al leer. **Vendedor** de un negocio ganado (`VentaGanada.vendedorId`): el dueño del trato en HubSpot.
- **potencial estimado**: la suma de los TAM de las empresas que se están viendo en /clients,
  con el conteo de las que todavía no tienen TAM al lado. No es pipeline ni forecast — es el
  techo teórico de la cartera según Ventas.
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
  crédito corrido sin pago (`fechaEmision + creditoDias` ya pasó) — el único rojo legítimo, mora
  real del cliente. Una promesa de pago no cambia el color (va como marca, ver **promesa de
  pago**). `semaforoCobro`/`semaforoCuenta`
  (`lib/cobranza/engine.ts`) y `computeAlertSet` comparten el mismo criterio de ventana/crédito
  a propósito — nunca pueden contar historias distintas del mismo cobro.
- **crédito / días de crédito** (`CuentaFinanciera.creditoDias`): días que tiene el cliente
  para pagar DESDE que se emite la factura (`fechaEmision`), no desde `fechaProgramada`.
  Nullable → cae al default global `DEFAULT_CREDITO_DIAS=15`; Colby es la excepción con 90.
- **facturado / "Marcar facturado"**: acción de un click sobre un cobro (cola de cobros o
  cronograma del drawer) que setea `Cobro.fechaEmision` a una fecha real — pasa el cobro del
  Reloj 1 (facturar) al Reloj 2 (cobrar). Auditado igual que `COBRADO`: `facturadoPor`/
  `facturadoEn` (chokepoint `cambiarEstadoCobro`). Reversible ("Revertir factura" → vuelve a
  `null`, se limpia la autoría). Desde la etapa 7 (2026-09-12) exige el **número de factura** o
  la marca «no tengo el número» con motivo.
- **número de factura** (`Cobro.numeroFactura`): el número del documento emitido (FAC/2026/0206
  en Odoo, INV-16 en Mercury), normalizado y firmado (`numeroFacturaPor`/`numeroFacturaEn`). Nace
  al marcar facturado: en cuentas Odoo se elige del espejo; en Mercury y QuickBooks se teclea.
  No es único: puede repetirse en cuotas de la misma cuenta, nunca en dos cuentas (409 + INV33).
  Revertir la factura lo limpia y deja el viejo en la bitácora. La marca «no tengo el número» es
  `sinNumeroFacturaMotivo`. Regla: `lib/cobranza/numero-factura.ts`.
- **factura compartida** (Cobranza › Odoo): una factura de Odoo que cubre varias cuotas, porque
  esas cuotas tienen anotado el mismo número (ALMOTEC: 3 × 2.300 en FAC/2026/0329). El cruce
  (`cruzar()` en `lib/cobranza/odoo/diferencias.ts`) aparea primero por número y compara la SUMA de
  las cuotas contra el neto. No es un pago parcial y no propone semáforo por cuota: el estado de pago
  es el de la factura entera. Por monto nunca se adivina una factura compartida.
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
- **referencia externa** (`Cobro.referenciaExterna`): número de depósito o transferencia pegado
  OPCIONALMENTE al confirmar COBRADO — trazabilidad hacia contabilidad sin acoplarse. Hasta la
  etapa 7 también recibía números de factura; el de la factura ahora es `numeroFactura`.
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
- **promesa de pago** (`Cobro.promesaPago`): fecha en que el cliente prometió pagar. Es una
  MARCA sobre una factura emitida, no un descuento (decisión de Alex, 2026-09-12): la factura
  sigue en el vencido, su COBRO_VENCIDO sigue en ALTA diciendo la fecha y registrarla no pospone
  nada. `marcaPromesa` la lee como **vigente** (hasta el día prometido inclusive), **incumplida**
  (desde el día siguiente sin cobro) o nada (sin promesa, cobrado o sin factura). Incumplida →
  alerta PROMESA_INCUMPLIDA (ocupa el lugar del vencido del cobro).
- **PROMESA_INCUMPLIDA**: alerta ALTA emitida en el corte cuando la fecha prometida pasó y el
  cobro sigue sin entrar — dedupeKey `PROMESA_INCUMPLIDA:{cuentaId}:{cobroId}`. No abre una fila
  nueva: sube la fila viva del cobro (la de falta facturar o vencido), que vuelve a ABIERTA y pierde
  el posponer (`lib/cobranza/alertas-merge.ts`).
- **posponerHasta / snooze** (`AlertaCobro.posponerHasta`): pausa temporal de una alerta — sale
  del feed sin cambiar de estado y vuelve sola cuando la fecha llega. Lo setea la persona
  ("Posponer"). Registrar una promesa de pago ya no lo escribe (2026-09-12).
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
- **historial de planilla** (`PagoPlanilla` → `/finanzas/costos/planillas/historial`, SOLO
  SUPER_ADMIN): lo que efectivamente se PAGÓ, una fila por persona y por quincena (1–15 /
  16–fin), con estado pendiente|pagado, fecha real y `confirmadoPor`. Se llega por el botón
  **«Historial»** del encabezado de Planillas — desde el 2026-08-16 hay **un solo ítem de
  planilla en el menú**, porque dos con nombres parecidos obligaban al paréntesis «(estimado)»
  para poder distinguirlos. Es **otra cosa** que su madre `/finanzas/costos/planillas`, que
  muestra el costo mensual por persona de `CostoRecurrente` y alimenta el burn: una dice cuánto
  cuesta el mes con la configuración de hoy, la otra cuánto salió de verdad. La API sigue en
  `/api/cobranza/costos/pagos-planilla`: el nombre de la ruta de UI es copy, el de la API es
  identidad (moverla rompería el escaneo de privacidad).
  Su monto es **propio y congelado como snapshot** al crear la fila —no se deriva del costo— y
  la materialización es CREATE-ONLY: una quincena PAGADA es intocable. **No entra a la caja
  neta** (ahí el burn lo sigue produciendo `CostoRecurrente`; sumarlo sería doble conteo).
  Ver DECISIONS §El libro de planilla.
- **aguinaldo** (`lib/finanzas/aguinaldo.ts`): la provisión estimada por colaborador — **suma
  de lo REGISTRADO en el libro de planilla de diciembre a noviembre, ÷ 12**, por moneda
  separada. Es un **dato observado**, no una tasa: Nexus no tiene ni tendrá tablas de CCSS,
  cargas ni renta. La fecha de ingreso sale del propio libro (`min` de sus pagos), no de un
  campo en `TeamMember`; la fórmula ya maneja sola el año parcial. Declara **cobertura** ("N de
  12 meses registrados") en vez de rellenar lo que falta.
- **tarjeta de crédito** (`TarjetaCredito` → `/finanzas/costos/tarjetas`, SOLO SUPER_ADMIN):
  una tarjeta de la empresa con su **límite** y su **saldo usado**, que escribe una persona con
  la fecha de corte y queda auditado (`saldoAlDia`/`saldoPorEmail`). **Disponible = límite −
  saldo.** Aparte, y solo como REFERENCIA, Nexus suma los costos que se le asignaron por la
  tabla puente `TarjetaCreditoCosto`: un saldo es acumulado y un cargo es mensual, así que
  nunca se restan entre sí. Lo único que sí se compara: si el disponible no alcanza para el
  próximo mes de cargos. No tiene semáforo ni alertas.
- **comisión de partner** (`ComisionPartner` → `/finanzas/comisiones-partner`, gate
  `cobranza.read`): lo que Smarteam **gana** de un aliado comercial (HubSpot, Atom Chat, Cooby,
  Nua talk). Es un INGRESO y por eso vive en la superficie de ADMIN, junto a los ingresos
  variables. Se registra acá y **no** como `IngresoVariable` — mismo límite anti-doble-conteo
  que ese modelo declara contra Cobranza, y por eso el copy de Ingresos variables dejó de
  ofrecer «comisiones sueltas». Cargadas del Excel *Comisiones 2026*: **5 pagos, USD
  91.262,55** (HubSpot ×2, Atom Chat ×2, Cooby; Nua talk en cero no se carga). El partner vive
  como string porque ninguno de los cuatro existe como `Client` — `clientId` es opcional a
  propósito y se liga solo si el aliado ya está en la cartera.
- **comisión de vendedor** (`ComisionVendedor` + `ReglaComisionVendedor` →
  `/finanzas/costos/comisiones-vendedor`, SOLO SUPER_ADMIN): lo que Smarteam le **paga** a
  quien vendió, como **% de lo COBRADO**. La comisión DEVENGADA es una **vista derivada** de
  los cobros en estado COBRADO cruzados con la regla vigente (persona · cliente o todos ·
  porcentaje · vigencia; la más específica gana) — no existe como fila hasta que se
  **liquida**, y ahí se congela con snapshot autosuficiente y se engancha al pago de planilla
  de esa quincena. Revertir un cobro cambia el derivado; si su comisión ya se liquidó, el
  revert **frena con 409** (y se suelta deshaciendo la liquidación). Es remuneración de una
  persona: nunca comparte ruta, endpoint ni loader con las de partner.
  El reloj es **`fechaCobro`** —el día que entró la plata— y de ahí salen las dos cosas que
  decide: qué regla estaba vigente y **en qué planilla se paga**; un cobro COBRADO sin fecha de
  pago no devenga. Se agrupa por **persona × quincena de pago × moneda** (CRC y USD son dos
  comisiones, nunca una convertida) y el redondeo va **por cobro**, para que la suma del detalle
  sea exactamente lo que se paga. ⚠ El grupo es el PAGO, no el mes de devengo (cambió el
  2026-08-16 — ver **política de pago de comisión**): dos cobros del mismo mes pueden caer en
  planillas distintas y salen como dos líneas. Al liquidar, el monto lo **recalcula el server**
  con el mismo cálculo puro que pintó la pantalla — el navegador no puede mandarlo.
- **aliado comercial** (`PartnerComercial` → bloque «Aliados» de
  `/finanzas/comisiones-partner`, gate `cobranza.read`): quién le PAGA a Smarteam y **cada
  cuánto**. La frecuencia es del ALIADO y no del pago (HubSpot paga cada 3 meses y eso no cambia
  pago a pago), y con ella el historial se agrupa a su ritmo en vez de mes a mes — estos pagos no
  son mensuales y una grilla mensual sale llena de huecos. `frecuenciaMeses` es un Int (1 mensual ·
  3 trimestral · 6 semestral · 12 anual, CHECK 1..24) y no un enum: agregar «cada 2 meses» no
  puede exigir un `ALTER TYPE` coordinado entre las 2 PCs. Borrarlo NO borra sus pagos — el
  nombre queda como snapshot en la fila, igual que `sujetoNombre` en `PagoPlanilla` — y el
  historial vuelve a leerse mes a mes, que es la degradación correcta.
- **período de un aliado** (`bucketDeCadencia`, `lib/cobranza/partners.ts`): el tramo de N meses
  en el que cae un pago, **anclado al año calendario** — con 3 meses son los trimestres, que es lo
  que todo el mundo ya entiende. Anclarlo al primer pago dejaría a dos aliados de la misma
  cadencia en períodos corridos entre sí y ninguna tabla los podría poner lado a lado. La pantalla
  dice **dónde** caería el próximo, nunca cuánto: el monto no lo sabe nadie.
- **política de pago de comisión** (`POLITICA_PAGO_COMISION`, `lib/cobranza/comisiones.ts`):
  cuándo se le paga a un vendedor la comisión de un cobro. Hoy es **el siguiente fin de mes
  después de que el cliente pague** (`SIGUIENTE_FIN_DE_MES`) — la regla que corrigió Alexander
  Arrieta el 2026-08-16: *«los pagos de comisiones se hacen los 30 de acuerdo al pago de los
  clientes»*, o en palabras de Elías, *«el siguiente 30 después de que el cliente pague»*.
  ⚠ El disparador es **la fecha de CADA cobro**, no el mes al que pertenece: un cobro del 15 de
  julio y uno del 31 de julio se pagan en planillas distintas. Y es **estrictamente posterior**
  —por eso no es la vieja opción «fin del mismo mes»—: 17 de los 101 cobros reales caen el último
  día de su mes y ahí la comisión quedaría programada el día en que entró la plata. Está aislada
  en una función pura con la política como constante, para poder cambiarla sin tocar la pantalla
  ni la mutación.
- **tipo de documento** (`RoleProfile.docType`): qué CLASE de documento es una fila de
  /roles y, por lo tanto, con qué PLANTILLA del motor se renderiza. **PERFIL** = perfil de
  puesto (11 secciones, el bloque 4DX, se le muestra a quien YA está en el equipo);
  **PROPUESTA** = propuesta de contratación (10 secciones: cómo es Smarteam, partnerships y
  la propuesta económica en vez del marcador y la ruta de madurez; se le muestra a quien
  está decidiendo si entra). Se elige al crear y NO se cambia: el `content` quedaría con
  keys de la otra plantilla.
- **documento compartido** (`RoleProfileShare`): un documento de /roles que dirección le dio
  a una persona del equipo para LEER. Aparece en su sección Roles y en su submenú; no lo
  puede editar, ni re-compartir, ni publicar, ni descargar en PDF. Sin compartir, el
  documento responde 404 —no 403— para esa persona.
- **link público** (`RoleProfile.publicToken`): la URL oculta de un documento de /roles
  (`/external/doc/<token>`). Token de 64 hex, sin login y sin contraseña: **la URL ES el
  secreto**. Publicar lo genera; revocar lo pone en null y el link muere sin vuelta atrás
  (republicar da uno nuevo). Desactivar el documento también lo apaga.
- **Roles** (sección del sidebar, `RoleProfile`): docs de los roles y responsabilidades del
  equipo — y, desde el 2026-07-30, también propuestas de contratación (ver **tipo de documento**).
  ~~SOLO SUPER_ADMIN~~ → **crear, editar, compartir y publicar siguen siendo de dirección**
  (`canEditRoleDocs` en la página, `guardRolesAdmin` en toda escritura de la API), pero LEER tiene
  hoy **tres clases de lector**: dirección (ve todo), quien tenga un **documento compartido** (lo
  ve read-only, con `RoleDocView`) y cualquiera con el **link público** (sin login). Sin
  compartir, el documento responde 404. Cada rol es un PUESTO libre (título + área, no atado al
  enum `TeamRole` ni a una persona) que se renderiza y edita con el MISMO motor de landing
  (`LandingView`) que la propuesta comercial y el kickoff (`/roles/[id]`, con `RoleWorkspace` y su toggle
  Editar). ~~Plantilla fija de **11** secciones~~ → la plantilla la elige el `docType`
  (**PERFIL** 11 secciones · **PROPUESTA** 10 — ver **tipo de documento**); las del PERFIL son
  perfil, responsabilidades (cards), el
  **bloque 4DX** (WIG · lo que hago cada semana · cómo sé si funciona · el marcador en HubSpot ·
  la cadencia), caminos de éxito y de fracaso (cards), ruta de madurez (escalera L1→L5) y período
  de transición — con edición WYSIWYG in-situ, drag&drop de ítems y tooltips ⓘ por sección. Los
  títulos van en lenguaje llano ("Lo que hago cada semana") y el término técnico en el eyebrow: la
  página es una guía de trabajo, no un curso — la teoría de 4DX vive solo en el ⓘ. El
  contenido vive como JSON estructurado en
  `RoleProfile.content` (NO en `CanvasBlock`: se reusa la PRESENTACIÓN/EDICIÓN del motor, no el
  motor de datos — ver DECISIONS). El contenido es curaduría humana con **assist de documento**
  opcional ("✨ Mejorar con IA": la IA propone, el humano revisa y aplica — ver abajo; en una
  PROPUESTA todavía responde 409); gate de escritura hardcodeado fuera de la matriz de permisos
  (mismo criterio que Costos); RLS deny (tabla interna).
- **assist de documento** (`lib/ai/assist.ts` → `runDocumentAssist`): el modo "mejorar por
  instrucción" de un documento del motor de landing (Roles, kickoff, propuesta comercial, desarrollo).
  One-shot: instrucción → la IA lee el documento ENTERO (y puede **investigar en línea** vía la
  server-tool web_search, a su criterio) → propuesta de cambios POR SECCIÓN → el humano revisa en
  `<AgentProposal>` (con checkboxes y "Fuentes consultadas") → aplica o descarta. Nunca escribe
  directo; las secciones curadas y ctxDriven no entran al contrato. Ver DECISIONS §Roles.
- **4DX** (*The 4 Disciplines of Execution*): el sistema de ejecución con el que se documenta cada
  puesto. D1 enfocarse en lo crucialmente importante (la WIG) · D2 actuar sobre las medidas de
  predicción · D3 llevar un marcador convincente · D4 crear una cadencia de responsabilidad. El
  enemigo declarado es el **torbellino**: la operación urgente del día a día, que se come la meta.
- **WIG** (*Wildly Important Goal*, D1): la ÚNICA meta que hay que ganar, siempre con línea de
  llegada — **"de X a Y para [fecha]"**. Nunca más de dos a la vez (mientras más metas, menos se
  logra). En la página del rol va en banda oscura, como sección `wig`.
- **medida de arrastre** (lag, D2): el RESULTADO que se persigue (la WIG). Se lee cuando el
  desempeño que la produjo ya pasó → no se puede empujar directo. En Nexus es el `kind: "arrastre"`
  (teal) que ya usaba la vieja sección de KPIs.
- **medida de predicción** (lead, D2): la acción SEMANAL que sí se controla y que anticipa el
  resultado. Dos requisitos: **predictiva** (mueve la de arrastre) e **influenciable** (depende de
  la persona, no de un tercero). Se escribe con número ("3 health-checks por semana"). `kind:
  "prediccion"` (azul).
- **marcador / scoreboard** (D3): el tablero de los JUGADORES (no del entrenador): simple, visible,
  con predicción y arrastre juntos, y que en **5 segundos** diga si se va ganando. En los roles la
  sección `scoreboard` no trae datos en vivo: ESPECIFICA qué gráfico crear en HubSpot por cada
  medida (tipo, objeto/fuente/filtro y cómo se ve ganar).
- **WIG Session** (D4): la reunión semanal (≤20 min, mismo día y hora, sagrada) donde ocurre la
  ejecución. Formato fijo de 3 pasos: rendir cuentas de los compromisos → mirar el marcador →
  comprometer 1-2 movidas que muevan las medidas de predicción. El torbellino NO entra a la sesión.
- **Documentación** (sección del sidebar, `/documentacion`): el manual de Nexus **para el equipo
  de Smarteam** —no para desarrolladores—: cómo funciona · el recorrido · los documentos · los
  agentes · HubSpot. Sin gate: la ve todo el mundo. **Es UNA página larga servida entera desde el
  servidor, con las secciones ancladas y un índice de salto** — no tiene pestañas a propósito: con
  render condicional el Ctrl+F del navegador (el único buscador que necesita) veía la cuarta parte
  del manual, y un link con ancla llegaba antes de que el destino existiera. Su contenido vive en
  el REPO (`lib/manual/`), no en la base, y está partido en dos: lo **derivado** (`armar.ts`, puro
  — los documentos, sus secciones, el recorrido completo del motor de etapas y los pipelines de
  HubSpot; se actualiza solo cuando alguien agrega un canvas o una etapa) y lo **escrito a mano**
  (`contenido.ts` — para qué sirve cada documento, cuándo se abre y qué hace cada agente, que es
  lo único que ningún registro sabe). **Nada sale de texto libre de la base**: ni los prompts (que
  viven detrás del permiso de `/agents`) ni `Agent.description`, que llegó a publicar jerga de
  desarrollador. Se llega desde el sidebar o desde el "¿Qué es esto?" del encabezado de cualquier
  canvas. Ver DECISIONS §Documentación de la app y §Documentación: el rediseño de lectura.
- **ancla del manual** (`lib/manual/anclas.ts`): el fragmento de URL con el que se comparte un
  pedazo concreto de la Documentación — `#doc-kickoff` para un documento, el id del agente para un
  agente, `#documentos`/`#agentes`/… para una sección. Se declaran en un registro único (patrón
  `project-action-targets.ts`) y un test falla si un documento del registro se queda sin la suya:
  un documento sin ancla es un documento que no se puede mandar por chat.
- **Hubs del cliente** (sección `solucion` de la propuesta de HubSpot, rótulo visible "Qué se
  implementa"): una **columna por CADA Hub de HubSpot** —los seis, no solo los vendidos—,
  cada una con 3-5 tarjetas de lo que se pone a funcionar ahí y el ícono del Hub. Arriba, una
  **píldora por Hub**. Reemplazó a los cuatro campos de texto libre (`hubs` /
  `integraciones` / `casosDeUso` / `usuarios`), que sobreviven como rama LEGACY para lo ya
  generado. Los VENDIDOS (los `activos`) arrancan encendidos y se escriben como lo que se va
  a implementar; los demás quedan para que el cliente los explore y llevan un chip **"No
  incluido"**. Las píldoras sirven a los dos lados: en el editor el CSE elige qué Hubs van
  (escribe `activos`) y en la propuesta publicada el cliente abre y cierra columnas; en el
  **PDF no se pintan y salen solo los vendidos**, expandidos. Ver DECISIONS §"Qué se
  implementa".
- **`activos`** (curaduría de la sección de Hubs): la lista de columnas encendidas. Vive FUERA
  del schema del agente —`coerceToSchema` la descartaría, así que **el agente no puede decidir
  qué le vendieron al cliente**— y en el primer nivel del `data`, que es hasta donde llega
  `preserveNonSchemaKeys`: por eso sobrevive a regenerar. Ausente = todas encendidas; vacío =
  el CSE las apagó todas.
- **ícono de Hub** (`public/hubs/<slug>.svg`): el ícono de producto oficial de HubSpot, uno
  por Hub, con el **slug como nombre de archivo** para que la URL se derive
  (`hubIconUrl`). Se pinta como MÁSCARA CSS con `--hub-accent` (`#FF4800`), así que los
  archivos quedan sin tocar. Es el ÚNICO color de la sección: lo demás es blanco y gris
  (`--hub-soft` / `--hub-line` / `--hub-line-on`) y la píldora encendida se distingue por el
  relleno, no por el matiz. Va chico en la píldora (16px) y grande en la cabecera de la
  columna (28px), ahí en la MISMA línea que el nombre del Hub. Una columna que no es un Hub
  del catálogo no tiene ícono.
- **sección personalizada** (`CanvasSection.key` con prefijo `custom:`): una sección que crea el
  VENDEDOR en el canvas de una propuesta comercial, no la plantilla. Le pone un nombre y pega
  adentro un HTML que armó aparte (una animación, unos tabs, una explicación interactiva), que se
  muestra dentro de un iframe aislado. Se mueve, se oculta, se renombra y se borra como cualquier
  otra —borrar existe SOLO para éstas: las 12 de la plantilla se ocultan— y **sobrevive al
  regenerar** con su HTML y su posición. Tope de 10 por propuesta y 200k caracteres por sección.
  En el PDF no se imprime el contenido interactivo: sale el **texto de reemplazo** que escribe
  Ventas. Ver DECISIONS §Secciones personalizadas.
- **instrucciones para tu IA** (`lib/landing/consejos-embed.ts`, botón del editor de una
  **sección personalizada**): el brief técnico que Nexus le pasa al agente de código con el que
  Ventas está armando el HTML APARTE. Dice en qué caja va a correr —iframe sin red, con alto
  fijo y origen opaco—, qué falla en silencio (fetch, localStorage, YouTube, formularios,
  enlaces de salida), la geometría con números, la paleta de marca y un esqueleto de arranque
  listo para copiar. La CSP y los topes se interpolan de las constantes reales, así que el texto
  no puede quedar viejo; el resto lo ata un guard contra el componente y el CSS. Ver DECISIONS
  §"Copiar instrucciones para tu IA".
- **texto de reemplazo** (`notaPdf` de una sección personalizada): lo que se imprime en el PDF en
  lugar del embebido. Un iframe muere en el PDF por cuatro vías distintas (la señal de "listo" no
  ve adentro, la medición de alto lo recorta, la animación se congela, Chrome imprime frames
  sandboxeados mal), así que el PDF nunca lo monta. Si Ventas no lo escribió, sale una línea
  genérica — nunca un hueco mudo.
- **Inversión** (sección `inversion`, una sola para las dos plantillas desde 2026-08-12): lo que
  cuesta la propuesta, leído como **line items de factura** — dos grupos, **servicios** de
  Smarteam (`lineas`) y **licencias** de terceros (`licencias`, HubSpot/Insider/herramientas),
  cada uno con encabezado, columna de monto alineada a la derecha y su subtotal, más el **gran
  total** (que aparece SOLO con los dos grupos sumables; con uno, ese subtotal ES el total y
  lleva la píldora). Los montos los escribe **Ventas a mano**: el agente no la genera
  (`agentGenerated:false`) y tiene prohibido poner precios en cualquier otro texto. Cada línea
  puede llevar **descuento propio**: cuando lo tiene, el monto muestra el tag («−15%»), el
  precio de lista **tachado** y abajo el neto ya recalculado — el descuento nunca se aplica en
  silencio. Una línea de **licencias es MENSUAL por defecto** (una suscripción de HubSpot lo es;
  un servicio de Smarteam es cobro único) y con eso el cierre pasa a **«Pago único» + «Por
  mes»**, los dos con la misma píldora naranja. `extras` (opcionales) se muestran pero NO suman;
  el card «Recurrente mensual» **se retiró el 2026-08-14** y sus líneas bajaron a la tabla como
  licencias mensuales (`adoptarRecurrentes`). Un monto con texto adentro ("A definir", "13%")
  queda fuera del total y se cuenta como **pendiente**. El shape viejo de
  HubSpot (dos tarjetas) ya no existe como vista: se **proyecta** a la tabla al renderizar y se
  persiste con la primera edición. Ver DECISIONS §Secciones personalizadas.
- **línea de licencia por Hub** (`LineaInversion.hub`): una línea del grupo **licencias** de la
  Inversión que está DECLARADA como un Hub de HubSpot — lleva su slug (`sales_hub`), su ícono
  oficial y el monto que escribe Ventas. Se SIEMBRA al generar, una por cada Hub que la sección
  «Qué se implementa» marca como vendido (`activos`), con el rótulo del catálogo y **sin monto**.
  Una licencia de un tercero (Zapier, un conector) no lleva `hub` y se ve exactamente como
  siempre. El editor avisa si falta la línea de un Hub vendido o si sobra la de uno que ya no lo
  está —nunca la borra solo— y **"Subir al cliente" frena con 400** mientras alguna quede sin
  monto: una línea con Hub ya cuenta como contenido, así que sin ese freno la propuesta saldría
  con "Marketing Hub —" y sin total. Ver DECISIONS §Las licencias de la Inversión.
- **proyección del shape viejo** (`adoptarShapeNuevo`): la conversión al vuelo de las dos
  tarjetas históricas de HubSpot en dos líneas de factura ("Implementación Smarteam" y
  "Licencias HubSpot / año"). Corre en el RENDER, no persiste sola, y se fija con el primer
  guardado humano. Es segura para lo publicado porque esos montos son texto libre y no suman —
  garantía que depende de los datos y se re-verifica con
  `scripts/verificar-inversion-publicada.ts` antes de cada deploy.
- **pendiente** (inversión): una línea con algo escrito en el monto que no se pudo sumar. Se
  excluye del total y se anuncia al lado ("· +2 a definir"), porque un total incompleto que se lee
  como completo es peor que no mostrarlo. El ⚠ por línea existe solo en el editor.
- **impacto** (propuesta comercial, `lib/business-cases/money-brief.ts`): lo que la operación
  actual le CUESTA al cliente, en su propia plata — distinto del **precio**, que es lo que cobra
  Smarteam. El agente puede escribir el impacto y tiene prohibido escribir el precio (que vive
  solo en Casos de uso e Inversión, y lo pone Ventas a mano). Sale de las fuentes —transcript,
  notas internas, timeline de HubSpot— y puede DERIVARSE multiplicando factores que estén ahí,
  siempre con la cuenta escrita y sus factores a la vista («15–20% de 2.000 leads mensuales a un
  ticket de $2.000 son $360.000–480.000 al año, según Mariana»): un total sin factores no se
  puede verificar antes de mandárselo a un prospecto. Si falta un factor no se estima, un rango
  se reporta como rango (nunca su extremo alto) y una fecha relativa se copia tal cual («el año
  pasado», nunca un año concreto). Aparece en dos lugares: dentro del `detail` de la tarjeta del
  **dolor** que cuantifica —nunca en su título ni en una tarjeta propia— y como métrica del
  **ROI**. Ver DECISIONS §El dolor se cuantifica.
- **vista del plan** (sección `cronograma` de la propuesta comercial): las DOS formas de leer
  el mismo plan — **lista** (fase, semanas y detalle, la de siempre) y **Gantt** (una barra por
  fase sobre un eje de semanas). Se cambia con un toggle a la derecha del título; abre en lista
  y la elección **no se guarda**: sirve para explorar el plan en la reunión y al recargar
  vuelve al default. En el PDF se imprime la lista, que es la que trae todo el contenido.
- **semanas de una fase** (`Phase.duration` + `Phase.semanas`, `lib/landing/plan-weeks.ts`): el
  rango escrito DOS veces — `duration` es lo que lee el cliente («Semanas 6-10») y `semanas` es
  ese mismo rango en formato de máquina («6-10»), que es de donde sale la barra del Gantt.
  Cuando falta `semanas` se PARSEA `duration`, que tolera guion y en dash, singular y plural.
  Son semanas **absolutas de inicio y fin**, no duraciones, y dos fases pueden solaparse. Lo
  que no se puede leer —«Mes 4», que existe en una propuesta publicada— **no se aproxima**: esa
  fase sale marcada «sin semanas» y el editor ofrece el campo para corregirla.
- **aviso de la primera etapa** (`PlanData.avisoFase1`): el chip ámbar «Puede ajustar el plan»
  y la línea «Las semanas siguientes se confirman al cerrar esta etapa», sobre la primera fase
  del cronograma. Existe para **no comprometer fechas exactas antes de diagnosticar**: el
  diagnóstico puede cambiar prioridades. Sale por posición (la fase 1), no por una casilla que
  haya que marcar; `avisoFase1: "no"` lo apaga para la propuesta que no arranque con un
  diagnóstico. Se ve en las dos vistas y se imprime en el PDF.
- **banda de credenciales** (sección `partner` de la propuesta comercial, «Por qué Smarteam»):
  la franja de cierre que respalda a Smarteam ante el prospecto — degradado navy, la credencial
  como rótulo, el **cierre** del argumento como titular, un párrafo que nombra al cliente y dice
  cuál es la prioridad de ESE proyecto, las cifras de Smarteam en fichas y las **insignias
  oficiales de HubSpot** en una tarjeta clara (Elite Solutions Partner arriba, y abajo una fila
  con el logotipo de Top Partner sobre chip navy + las dos acreditaciones). Lo que escribe el
  agente es lo que mira al cliente (`titular`, `resumen`, `referenciaSectorial`); los HECHOS de
  la empresa —las tres cifras (`EXPERIENCIA_SMARTEAM`) y las insignias (`public/partner/`)— van
  **fijos en el componente** (`lib/landing/partner-band.ts`): son iguales en toda propuesta y un
  campo ahí solo habilitaría publicar una credencial que no tenemos o una cifra que nadie
  aprobó. La sección es `selfTitled` (pinta su propio encabezado) y **el «Equipo asignado» se
  retiró** el 2026-08-14. Reemplazó a las cuatro tarjetas de texto ese mismo día **sin agregar
  ningún campo obligatorio**, así que las propuestas ya publicadas la estrenan solas: sin
  `titular` cae al rótulo del documento. Ver DECISIONS §«Por qué Smarteam».
- **Color de la cuenta** (Éxito del cliente, `saludDeLaCuenta`): rojo **Riesgo alto**, amarillo **Señales de
  riesgo**, verde **Va bien** y gris **Sin datos**. Sale de la entrega, el uso, la relación y la renovación (las cuatro
  lecturas de la ficha); al pasar el mouse dice por qué en una línea. Las alertas del agente y la deuda no pintan. La
  relación cuenta solo donde Smarteam **acompaña** la cuenta (proyecto activo o relación gestionada en HubSpot).
  Ver DECISIONS §El color de cada cuenta.
- **Alerta cerrada** (`CsAlert` RESOLVED o DISMISSED): resuelta o descartada, con una nota corta opcional
  (`resolutionNote`). Sale de «A quién llamar», se consulta 30 días y se puede volver a abrir. El agente la vuelve a
  levantar solo con una señal nueva (más grave, o evidencia que no estaba).
- **Clasificación de la cuenta** (Éxito del cliente › Cartera, `lib/cs/clasificacion.ts`): el **tipo de relación**
  (proyecto en curso, servicio recurrente, solo licencias, sin servicio activo, excliente), el **momento** (arranque,
  implementación, adopción, recurrente, renovación cercana, expansión, salida, sin actividad) y el **potencial** (alto,
  medio, bajo, sin estimar). Nexus los **propone** con reglas y la CSL los **confirma**; si la cuenta cambia, vuelve a
  proponer. Lo confirmado vive en `ClasificacionDeCuenta`. Ver DECISIONS §La clasificación de cada cuenta.
- **Relación gestionada con HubSpot** (`lib/cs/relacion-gestionada.ts`): la relación de Smarteam con una cuenta en
  HubSpot. Solo mientras Smarteam la GESTIONA, HubSpot comparte su uso, activación y licencias y suma su MRR a los
  puntos de partner. Se sostiene con trabajo en el portal del cliente (cada cosa que se crea o edita cuenta 60 días);
  sin trabajo, termina sola. «Solo vendida» = Smarteam le vendió la suscripción pero no la gestiona.
- **Corrección del color** (`CorreccionDeSalud`): la CSL o dirección cambian el color que calcula Nexus, con una razón.
  Vale 30 días o hasta una razón roja nueva; el color de Nexus se sigue viendo («Nexus diría»).
- **En espera del cliente**: color propio (⏸) de una cuenta frenada por el cliente; no cuenta como riesgo. Lo propone
  Nexus con el motivo de bloqueo de HubSpot y lo marca la CSL. Si además hay algo rojo, gana el rojo.
- **Queja del cliente** (`CsAlertCategory.QUEJA`): alerta con la frase literal del cliente, verificada contra la reunión
  o el correo. La levanta el vigía y, desde la etapa 6 de la memoria de la cuenta, también la lectura de cada reunión.
  Verificada, pinta el color de la cuenta.
- **Detector** (de alertas): quien levanta una `CsAlert`. Son tres: las reglas en código, la lectura de cada reunión (la
  queja con su cita) y el vigía con IA, que recibe el riesgo como evidencia y decide. Todas tienen el mismo ciclo.
  Cobranza tiene sus alertas aparte.
- **Vista de la cartera** (`VistaDeCartera`): un nombre y los filtros de la pestaña «Cartera». Compartida; las de
  arranque están en el código.
- **Pase de cuenta**: cambiar el CSE de una cuenta. Escribe «CSE Encargado» (`cse_encargado`) y «CSL Encargado»
  (`csl_encargado`, la CSL) en HubSpot y le manda al CSE nuevo el resumen de la cuenta en «Para ti».
- **Carga del equipo** (`/customer-success/carga`, `lib/carga`): las horas comprometidas de cada persona de CS por
  semana —reuniones agendadas, preparación y entrega del cronograma (lo respondido o, si no, lo estimado)— contra sus
  horas disponibles (contrato × parte productiva). **Utilización** = horas ÷ disponibles; semáforo: con espacio
  (< 70 %), llena (70–85 %), sobrecarga (> 85 %). Las semanas que vienen se **proyectan** con el ritmo de reuniones de
  las últimas cuatro. En orden alfabético, sin ranking. Sin montos. La ven la CSL y dirección.
- **Tu carga** (`/tu-carga`): la misma cuenta, pero solo la de quien la abre (CSE y CSL; dirección la ve como pestaña de
  Rentabilidad; desde el 2026-10-15 no está en el menú): 8 semanas, sus cuentas y lo que tiene sin anotar de «¿cuánto te tomó?». Sin montos.
- **Con dato real**: la parte de las horas que no es supuesto: las del calendario más las que respondió la persona. La
  preparación y la entrega sin respuesta son **estimadas**.
- **Factor de complejidad** (`lib/carga/complejidad.ts`): cuánto más trabajo pide una cuenta que la base, de 1,0 a 3,0,
  sumando por variable (Hubs, Enterprise, usuarios, integración, etapa, industria, uso, relación, Escala). Cada variable
  dice si el dato está, es parcial o falta.
- **Supuestos de la carga** (`ConfigCarga`): los valores editables del cálculo, con quién los cambió y cuándo.
- **Costo de la hora** (Éxito del cliente › Rentabilidad, solo dirección): **por persona** = su planilla ÷ sus horas
  pagadas (la de entrada en el margen); **por equipo** = el promedio de su equipo; **cargado** = planilla entera ÷ horas
  con clientes. El margen de una cuenta es lo cobrado − lo que costaron sus horas con el costo elegido. Todo en dólares,
  con el tipo de cambio del día de cada monto.
- **Para ti** (`/para-ti`, primer ítem del menú, `lib/para-ti`): lo que le toca a cada persona en Nexus, juntado de
  todos los módulos y recortado a lo suyo y a sus frentes. Arriba lo que dejó un agente; después «Para hoy», «Esta
  semana» y «Cuando puedas»; a la derecha los avisos. El número del menú cuenta lo de hoy y los avisos sin leer.
  Muestra solo lo tuyo: la pestaña «Del equipo» se retiró el 2026-10-07.
- **frente / «Lo que lleva»** (`TeamMember.frentes`, `lib/para-ti/frentes.ts`): lo que una persona SIGUE en Smarteam,
  aparte de su rol de acceso: Liderar Customer Success, Ventas, Finanzas (registrar / supervisar), Dirección,
  Marketing, Escala, Documentación, Sistema (Feedback, reservado). No da permisos: decide qué le llega en «Para ti».
  Se elige en Equipo; sin elegir, sale del rol. De los frentes de un Super Admin sale su vista de Finanzas.
- **pendiente** (de «Para ti»): algo que te toca hacer, calculado del estado con las reglas del módulo; se va solo
  cuando se resuelve. Distinto de un **aviso**.
- **aviso** (modelo `Aviso`): algo que pasó y que una persona debería saber (el cliente aprobó, te devolvieron un pago,
  te compartieron un documento, quedaste como encargado). Se escribe solo con `avisar()`, nunca a quien hizo la
  acción, una vez por persona; se marca leído y se borra a los 90 días de leído.
- **Feedback** (botón del pie del menú; revisión en `/feedback`): lo que cualquier persona del equipo reporta
  sobre Nexus desde la pantalla en la que está, con la captura de esa pantalla. Tres tipos: **Algo falla**,
  **Una mejora** y **No se entiende**. Lo revisa Super Admin. Ver DECISIONS §Feedback desde cualquier pantalla.
- **reporte** (`FeedbackReporte`): lo que alguien mandó, con su número (**F-128**), la dirección, el rol, el
  navegador, la versión, los errores de la pantalla y, si la hubo, la captura y sus **marcas** («Señalar algo»).
  Es **urgente** si es una falla que le frena el trabajo.
- **tema de la hoja de ruta** (`FeedbackTema`): una tarjeta de la hoja de ruta. Lo normal es un reporte por tema; junta varios solo si piden lo mismo, y un reporte que no pide lo mismo se separa en su propio tema. Columnas: **Por decidir**
  (la de entrada) · **Planeado** · **En curso** · **Listo** (hecho, espera la próxima subida) · **En Nexus** (ya se subió:
  quien lo pidió lo puede probar). Un reporte llega a un tema solo cuando dirección lo
  lleva desde la Bandeja; el estado que ve quien reportó sigue al tema.
- **Encuestas** (pestaña de `/feedback`, se llamaba «Tiempos» hasta el 2026-10-06): todo lo que dirección le pregunta
  al equipo, en dos clases. **Tus preguntas**: las que escribe dirección (los **pedidos de opinión**), una tarjeta por
  pregunta con lo que contestó cada persona. **Automáticas**: las **preguntas de tiempo**, que se hacen solas.
- **pedido de opinión** (`FeedbackPedido`): dirección le pregunta algo concreto a una persona sobre una pantalla;
  le aparece al entrar ahí hasta que responde o dice «Ahora no».
- **pregunta de tiempo** («¿cuánto te tomó?», `lib/tiempos`): se le hace a quien marca una tarea del cronograma como
  hecha o publica un documento por primera vez. La respuesta va en minutos y calibra las horas de la carga por tipo de
  fase; nunca se muestra por persona. «Omitir» y «No lo hice yo» quedan registrados. Lo que no se responde queda tres
  días en «Para ti» y después **vence**. Se configura y se mira en Feedback › Encuestas. Ver DECISIONS §«¿Cuánto te tomó?».
- **calibrar** (Tiempos, «Ajustar el cálculo» › Calibración): Nexus **propone** un número nuevo para un supuesto con lo
  que anotó el equipo y la CSL o dirección lo **usa** o lo **descarta**; nada entra solo. Un tipo de fase alcanza con 20
  respuestas; una tarea clave, con 3 de la encuesta de arranque o 10 al terminarla; una variable del factor, con 5
  cuentas que la tienen y 5 que no. Con menos de 5 respuestas la mediana ni se muestra.
- **tarea clave** (`lib/tiempos/familias.ts`): una de las 12 clases de trabajo que pesan en la carga (integración,
  pipeline, migración, automatizaciones…). Se reconoce por el título de la tarea, se pregunta siempre al terminarla y
  puede tener sus propias horas en los supuestos. Las demás tareas son **comunes**.
- **encuesta de arranque** (momento `ARRANQUE`): una sola vez, cuánto le toma normalmente a cada CSE y CSL cada tarea
  clave. Se manda desde Feedback › Encuestas › Automáticas, llega a «Para ti» y vence en 14 días.

- **Pregunta sobre la cuenta** (`lib/encuestas-de-cuenta`, `RespuestaDeCuenta`): lo que Customer Success sabe de un
  cliente y nadie anota, preguntado a cada CSE y CSL al entrar a su ficha. La primera: «¿Este cliente tiene apertura a
  la asesoría?» (Sí · No · No sé, con un porqué opcional). Con «No sé» vuelve a la semana. Se guarda cada evento sin
  pisar el anterior; se mira y se descarga en Feedback › Encuestas › Sobre los clientes.
- **Apertura a la asesoría**: el cliente no solo nos pide cosas para implementar, también quiere nuestra guía sobre qué
  hacer, en qué orden y por qué.
- **Negocio abierto** (`NegocioAbierto`, `lib/ventas`): la copia de un negocio de HubSpot que todavía no se ganó ni se
  perdió, de los tres pipelines de venta propia. La trae el job `negocios-abiertos` cada hora. Lo ganado vive en
  `VentaGanada`.
- **Cartera de un vendedor** («Para ti» › «Tu cartera»): las empresas de Nexus donde es dueño en HubSpot más las
  empresas donde tiene un negocio abierto. Va en cuatro grupos: con fecha de cierre y monto, les falta uno, solo
  negocio y sin negocio.
- **Pregunta de cierre y monto**: Nexus le pregunta al vendedor la fecha de cierre o el monto de un negocio que no los
  tiene (o tiene la fecha vencida) y que se está trabajando. Propone el valor con la frase de donde salió y la
  respuesta se guarda en HubSpot.
- **Temperatura de un negocio**: caliente, en movimiento o frío, según la actividad, la probabilidad y el cierre
  (`temperaturaDelNegocio`).
- **Ponderado**: monto × probabilidad de los negocios en dólares que cierran en el año.
- **Siguiente paso por equipo** (`SiguientePaso`; en HubSpot, `siguiente_paso_ventas`, `_cs`, `_dev`, con `_fecha` y
  `_responsable`): qué sigue con una empresa, un negocio o un proyecto del lado de Ventas, CS o Dev, para cuándo y quién
  lo lleva. Uno vigente por objeto y equipo; cada cambio queda en la historia de Nexus y el vigente se escribe en
  HubSpot, con el mismo nombre en los tres objetos (`lib/siguiente-paso`). Se da por hecho («Ya se hizo») o se
  reemplaza. `hs_next_step` es de HubSpot: Nexus lo lee y lo ofrece como sugerencia, nunca lo escribe.
