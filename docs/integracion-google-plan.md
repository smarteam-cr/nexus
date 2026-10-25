# La integración con Google Workspace — plan

> Pedido de Elías del 2026-10-23: la integración con Google es esencial. Hay que buscar siempre la transcripción y, si no
> hay, las notas, y aprovechar lo que las APIs permiten (en Finanzas pasó que no usábamos lo que Mercury daba). Investigado
> el 2026-10-24 contra el código, la base en solo lectura y la documentación oficial de Google. **Nada construido.** En el
> roadmap es el área U (U1 a U5) y es la base del área T (las reuniones).

## Lo que hace Nexus hoy

- **Autenticación:** una cuenta de servicio con delegación de dominio.
  - Scopes de lectura: `drive.readonly`, `documents.readonly`, `calendar.readonly` y el directorio de usuarios
    (`lib/google/auth.ts`).
  - La escritura del calendario (`calendar.events.owned`) va en un JWT aparte, porque un scope sin autorizar tumba todas
    las lecturas.
- **Calendar:** cada vez barre 30 días de cada usuario del dominio (`meet-sync.ts`). No usa `syncToken` ni
  notificaciones, y no ve los eventos cancelados: una reunión borrada se queda en la base.
- **Participantes:** guarda los correos de todos los invitados, pero pierde quién aceptó, quién se conectó y cuánto tiempo.
  No guarda el código de la reunión (`conferenceId`).
- **Transcripción y notas:** lee el Doc adjunto al evento con la API de Docs y, si no hay, busca en el Drive por título y
  fecha. El texto sale del Doc; los turnos de quién habló se sacan del texto plano, sin hora.
- **No usa** la API REST de Meet, la de Workspace Events ni Speech-to-Text.
- **Cuándo corre:** solo cuando alguien abre la app, con 20 minutos de espera. Los reintentos sí van por el scheduler.

## Lo que se midió (90 días, reuniones con clientes y prospectos)

De 1.150 reuniones, 643 no tienen transcripción:

| Motivo | Reuniones | De quién es |
|---|---|---|
| Solo notas de Gemini | 239 | Google: nadie activó «Transcribir» |
| Se leyó antes de que terminara | 177 | Nexus: el rescate ya existe y no se corrió |
| No se grabó (o no ocurrió) | 177 | Google, o la reunión nunca pasó |
| La organizó alguien de fuera | 19 | El Drive del cliente |
| El documento estaba vacío | 17 | Google |
| La lectura falló y se selló | 8 | Nexus |

**Unas 430 son de Google:** ninguna API da una transcripción que nunca se generó. Lo que sí se gana es no perder lo que
existe, saber si la reunión ocurrió y que transcribir sea lo normal.

## Lo que permiten las APIs (verificado en la documentación oficial)

- **La API REST de Meet** (`conferenceRecords`):
  - prueba que una reunión ocurrió;
  - da los participantes con sus horas de entrada y salida;
  - da la transcripción por frases, con quién la dijo y cuándo (`transcripts.entries`);
  - da la grabación, y las notas de Gemini (`smartNotes`, no confirmado si ya está disponible para todos).

  Límites:
  - **las frases se borran a los 30 días;**
  - listar solo trae las reuniones de las que uno es organizador;
  - un invitado puede pedir una reunión puntual;
  - con la cuenta de servicio, solo con delegación de dominio y el scope `meetings.space.readonly`.
- **La API de Workspace Events:** avisa cuando una conferencia termina o cuando la transcripción o las notas están
  listas, por un tema de Pub/Sub. La suscripción vence a los 7 días y hay que renovarla. **No confirmado** que acepte
  delegación de dominio.
- **Calendar:**
  - `syncToken` da la copia incremental y trae también los eliminados;
  - `events.watch` avisa de cambios, pero puede perder avisos, así que el sondeo sigue haciendo falta.
- **Drive:** las notas quedan en el Drive del dueño de la reunión. Por eso las reuniones que organiza un cliente no se leen.
- **Speech-to-Text:** transcribe audio y distingue a los hablantes. Sirve para las reuniones presenciales; los modelos y
  los límites para español están por confirmar.

## Decisiones

- **El orden de las fuentes de texto:**
  1. las frases de la API de Meet, copiadas antes de los 30 días;
  2. el Doc de la transcripción;
  3. el Doc de las notas de Gemini;
  4. la búsqueda en el Drive, como último recurso.
- **«No ocurrió» es distinto de «no se grabó».** Sin registro de conferencia, la reunión no pasó, y deja de contar como
  falta.
- **Los participantes se guardan con lo que de verdad pasó:** si aceptaron, si se conectaron, cuándo y cuánto tiempo.
  Google pide no usar esta API para medir desempeño: los minutos de cada persona no van a ninguna evaluación.
- **Enterarse al momento, con el sondeo como red:** los eventos de Workspace (si aceptan delegación de dominio) o, si no,
  un job cada 10 minutos.
- **Lo que se gana del lado de Google es lo que más rinde:**
  - activar la toma de notas automática en cada cuenta;
  - en las reuniones con clientes, activar «Transcribir».

  Va en «Lo que configuras tú».
- **Sigue la invariante:** el dueño de la reunión sale solo de `resolvedClientId`, y la base local no recibe eventos.

## Etapas

1. **U1 · Sin scopes nuevos (ya):**
   - la copia de Calendar y la lectura de los Docs pasan a un job cada 10 minutos (es T6):
     - usa el mismo turno de `CronJobState` que `autoSyncGoogleMeet` (con la espera contada desde el fin) y no espera
       dentro del tick;
     - tiene la bandera `GOOGLE_MEET_SYNC_ENABLED=0`, que lo apaga y vuelve al disparo al abrir la app. Ese disparo
       queda en el código como vuelta atrás y nunca corre a la vez que el job;
     - **antes de empezar,** medir cuánto dura una corrida y la frescura de hoy. Si una corrida pasa de unos 3 minutos,
       `syncToken` pasa de U4 a U1, o va un barrido corto cada 10 minutos y el completo una vez al día;
     - una invariante de frescura, con el molde de INV31 (la del espejo de Odoo): si la última copia buena tiene más de
       una hora, rojo;
   - correr el rescate de las 177 que se leyeron antes de terminar:
     `recuperar-transcripts-meet.ts --solo-antes-de-terminar --deploy-confirmado`, después del deploy. Recupera el
     texto pero no lo lee: la lectura va por el modo de recuperación (`docs/reuniones-pieza-angular-plan.md` › «Cómo se
     trae lo que ya existe»);
   - guardar el código de la reunión, la respuesta de cada invitado y los eventos cancelados, en un solo SQL aditivo:
     `FirefliesSession.conferenceId` (con índice) y `canceladaEn`, más la tabla `ParticipanteDeReunion` con su forma
     completa (correo, `esDelEquipo`, respuesta y, ya nullables, `entro`, `salio` y `minutos` para U3). U3 y T7 la
     llenan y no crean otra;
   - **un evento cancelado nunca se borra:** borrar la fila arrastra en cascada los hechos, los turnos y la lectura. Si
     la reunión tiene texto, minuta, hechos o tareas, se marca y queda para que una persona la revise. Solo una
     cancelada sin texto sale del chokepoint, del buscador y de la cola. Prueba de integración: una cancelada sin texto
     no sale en `getClientSessions`.
   - El código de la reunión solo no evita que un evento movido pise la fecha: eso pide el registro de conferencia de U3
     (INV16 a sigue pendiente de U3).
2. **U2 · La prueba de un día** (✓ 2026-10-25, `scripts/probar-api-de-meet.ts`, solo lectura, sobre las reuniones
   reales de los últimos 3 y 20 días; antes, el 24 oct, Elías habilitó las APIs, sumó el scope y creó el tema
   `nexus-meet-eventos` y la suscripción `nexus-meet-eventos-pull`). Lo que dio:
   - **El código de la reunión sirve:** `space.meeting_code = "abc-defg-hij"` encuentra la conferencia, con su hora real
     al segundo. Pero el código es el del ESPACIO: una serie semanal trae todas sus conferencias (4 registros en «Custom
     Agent en HubSpot», 3 en SMATAGRO), y una misma reunión puede tener dos (alguien salió y volvió: 21:53 a 21:55 y
     21:56 a 23:25). Cada conferencia va a la reunión de ese código más cercana en el tiempo, a menos de 12 horas.
   - **Una conferencia con 0 participantes no ocurrió:** SMATAGRO tiene conferencias de 15 minutos exactos cada dos
     semanas, sin nadie adentro.
   - **Un invitado del equipo sí la lee**, también si la organizó alguien de fuera, cuando alguien del equipo entró
     (InsiderOne, Atom, Cooby: la conferencia y sus participantes). Si nadie del equipo entró, no ve nada (0 registros y
     403 en el espacio), así que «no veo nada» no prueba que no ocurrió: queda «sin acceso». En ninguna de las de fuera
     hubo transcripción, así que no se pudo probar si un invitado lee sus frases.
   - **Quién entró viene como `users/{id}`, no por correo:** los del equipo se traducen con el directorio; los de fuera
     quedan con su nombre.
   - **Las frases llegan por páginas** (`transcriptEntries`, 100 por página: 421 frases en 5 páginas). Una conferencia
     puede tener dos transcripciones con las mismas frases: se juntan sin repetir.
   - **La transcripción y las notas dicen su Doc** (`docsDestination`): el de la transcripción es el mismo Doc adjunto al
     evento; las notas de Gemini (`smartNotes`) ya responden.
   - **Los eventos de Workspace aceptan la delegación de dominio:** crear la suscripción de una persona
     (`//cloudidentity.googleapis.com/users/{id}`) pasa la validación (`validateOnly`, no crea nada).
   - **Pub/Sub:** la cuenta de servicio tiene `pubsub.subscriptions.consume` sobre la suscripción (leer y confirmar),
     no `get`: alcanza.
3. **U3 · La API de Meet** (✓ construido el 2026-10-25, rama `claude/n1-google-f5bf33`; falta el SQL, el deploy y la
   primera carga). El job `google-meet-conferencias` (`lib/google/conferencias.ts`, un tramo de 10 minutos, lanza sin
   esperar) mira cada reunión con código que terminó, de los últimos 28 días, como la persona que la organizó o, si no
   se puede, como un invitado del equipo, y la vuelve a mirar cada 30 minutos hasta que no queda nada que esperar (la
   transcripción y las notas generadas, o 48 horas). Guarda:
   - **si ocurrió** (`estadoDeConferencia`): OCURRIO si entraron dos personas o más o hay frases; NO_OCURRIO si la
     organizó el equipo y no hubo conferencia, o la hubo vacía o con una sola persona (se cierra recién 6 horas después
     del fin: el cliente que entra tarde por el mismo enlace abre otra conferencia); SIN_ACCESO si la organizó alguien de
     fuera y ningún invitado del equipo ve una conferencia cerca (se le pregunta a cada invitado, no al primero que
     responde). Los grabadores («Smarteam's Notetaker») no cuentan como personas. Si ninguna cuenta puede leer la API, no
     decide nada; si eso pasa en toda la corrida (el permiso quitado en Admin), la corrida falla y va a Sentry, y una
     reunión con una sola cuenta rota (sin licencia de Meet) se cierra «sin acceso» a las 48 horas;
   - **de qué reunión es cada conferencia:** el código es el del espacio (una serie, una sala fija que se reusa). Cada
     reunión con el código «reclama» la conferencia: fuerte si empieza en su hora o hasta 10 minutos antes, débil en sus
     márgenes (30 minutos antes, 20 después del fin); gana la que la reclama más fuerte, y si dos la reclaman igual cuenta
     para las dos. Sin ninguna, la más cercana a menos de 12 horas (el evento que se movió, «Cemaco | Data Hub»). Una
     cancelada no se lleva lo que reclama la vigente que la reemplazó;
   - **el texto solo si no hay duda:** las frases, los Docs y la gente de fuera se copian solo si todas las conferencias son
     de la reunión con reclamo fuerte, de nadie más, y no hay otra conferencia del mismo código a menos de una hora (una
     llamada aparte por la sala fija, con otro cliente). Con cualquier duda se guarda solo que ocurrió, la hora y quién del
     equipo entró, y el texto sale del Doc del evento, como antes. Medido: 12 de 152 reuniones quedan así;
   - **las frases se copian una vez, enteras, al cerrar** (con la transcripción y las notas generadas): copiadas a medias,
     entre «salió» y «volvió», dejaban una transcripción cortada;
   - **la hora real** (`conferenciaInicio`, `conferenciaFin`), sin pisar `date`;
   - **quiénes entraron y cuánto** en `ParticipanteDeReunion` (`entro`, `salio`, `minutos`, `nombre`, `idEnMeet`). Los del
     equipo, con su correo (el directorio traduce `users/{id}`); los de fuera, con `meet:` y su id, porque Meet no da su
     correo: un invitado de fuera puede quedar dos veces, con su correo del calendario y con su id de Meet. La copia de
     Calendar no borra una fila con `entro`;
   - **las frases** en una tabla propia, `FraseDeReunion` (quién, cuándo, qué), y no en `TurnoDeReunion`: los turnos los
     parte de la transcripción su único escritor, la búsqueda (`lib/busqueda/indexar-server.ts`), y siguen saliendo de
     ahí;
   - **los Docs por su id** (`docDeTranscripcionId`, `docDeNotasId`), con los que la lectura va al Doc correcto sin buscar
     en el Drive por el título.

   **El orden de las fuentes** vive en la lectura de siempre (`lib/google/meet-enrichment.ts`): las frases, el Doc de la
   transcripción (el adjunto o el que dice Meet), el Doc de las notas, y el Drive solo si no hay ningún Doc. **Las frases no
   pisan una transcripción propia:** entran si la reunión no tenía transcripción o tenía la de otra reunión (su encabezado
   nombra otra, o es de otro día de la serie: con el mismo título, pero comparte menos de la mitad de las palabras con las
   frases); con una propia, se queda la guardada aunque el Doc traiga otra versión, porque cambiarla rehace la lectura. Si
   el Doc falla y la reunión ya tenía notas, sigue siendo un fallo y se reintenta (las notas de Gemini no se tapan con un
   resumen de Claude). Sin Doc adjunto, con frases se lee el Doc de las notas y sin frases el de la transcripción. Las
   frases y la vuelta a la cola se escriben en una sola transacción. Cuando llegan frases nuevas a una
   reunión sin transcripción o con la de otra reunión, el job la devuelve a la cola de lectura (`enrichedAt` en null, como
   cuando aparece un Doc nuevo en el evento): la lee la copia de cada 10 minutos, y el resumen, la cola y el aviso de texto
   cambiado siguen teniendo un solo escritor. Vuelve a la cola una sola vez por cada copia nueva de sus frases.

   Probado contra una base local con las 152 reuniones con código de los 6 días anteriores (de producción, solo lectura):
   123 ocurrieron, 26 no (almuerzos, bloqueos y conferencias vacías, todas sin texto), 3 sin acceso; 75 reuniones con
   frases (17.885) y 447 personas (sin grabadores, y sin la gente de fuera de las 12 con el texto en duda); una segunda
   corrida no encontró nada que hacer. «Capacitación 2
   Analisa» tenía solo las notas en su Doc y 180 frases en Meet: volvió a la cola, y su lectura le dejó una transcripción
   de 27.239 caracteres con las notas de Gemini intactas. En Camosa, Liz y Andrés entraron y Marco no.

   INV53 da rojo si una reunión con código de 3 a 25 días queda sin cerrar (las frases se borran a los 30). La primera
   carga, después del deploy: `scripts/revisar-conferencias-de-meet.ts` (simulacro) y con `--apply`.
4. **T7 · Quiénes de Smarteam estuvieron** (✓ 2026-10-25): `lib/google/equipo-en-la-reunion.ts` dice, por reunión, quién
   del equipo organizó y quién estuvo (true, false o «no se sabe» si la conferencia no se miró), con su respuesta a la
   invitación. **Sin minutos ni horas:** Google pide no usar la asistencia para medir desempeño. Recibe ids que ya
   salieron del chokepoint. Todavía no lo lee ninguna pantalla: lo usan S4, S5 y S7, la carga y «Para ti».
5. **U4 · Enterarse al momento** (✓ 2026-10-25, **apagado**: `GOOGLE_MEET_EVENTOS_ENABLED=1` lo prende):
   - `google-meet-suscripciones` (diario) crea una suscripción de Workspace Events por persona del equipo
     (`//cloudidentity.googleapis.com/users/{id}`: todas las reuniones que organiza) al tema `nexus-meet-eventos`, con la
     conferencia terminada y la transcripción y las notas listas; las renueva antes de que venzan (7 días) y reactiva las
     suspendidas;
   - `google-meet-eventos` (cada minuto) lee la suscripción pull y, si llegó algo, lanza la revisión de las conferencias de
     las últimas 12 horas. La revisión de cada 10 minutos sigue siendo la red. Corre dentro del tick, así que cada pedido a
     Google tiene un tope de 10 segundos y el pull vuelve enseguida si no hay avisos.
   - **Calendar con `syncToken`, no se hizo** (decisión conservadora): la copia completa dura 7 segundos (medido en U1), y
     `syncToken` no acepta `timeMin` ni `timeMax`: con `singleEvents` expande las series hasta el infinito (el origen de
     las reuniones de 2037), y sin él habría que expandir las series a mano. Además, la marca de canceladas y el borrado
     de invitados dependen de ver todos los calendarios enteros en cada corrida. Se retoma si una corrida pasa de 3 minutos.
6. **U5 · Las reuniones del cliente y las presenciales:**
   - **las del cliente** (✓ probado el 2026-10-25): un invitado del equipo ve la conferencia y sus participantes cuando
     alguien del equipo entró (InsiderOne, Atom, Cooby); si nadie entró, no ve nada. No se pudo ver si lee sus frases:
     ninguna de las 16 organizadas por fuera en 20 días tuvo transcripción. La transcripción y las notas quedan en el
     Drive del cliente. **Regla del equipo:** la reunión con un cliente que tiene que dejar texto la convoca Smarteam (o se
     le pide al cliente que active «Transcribir»). En Nexus esas quedan «sin acceso» o «ocurrió» sin texto;
   - **las presenciales:** subir el audio y transcribirlo con Speech-to-Text (T5), apagado (decisión 8 del 24 oct).

## Lo que tiene que configurar Elías

1. **En Google Cloud:** habilitar las APIs de Meet REST, Workspace Events y Pub/Sub (✓ hecho el 24 oct) y, para las
   presenciales, Speech-to-Text (pendiente: «Lo que decides tú» 21 del roadmap).
2. **En Admin, en la delegación de dominio:** agregar `https://www.googleapis.com/auth/meetings.space.readonly` (✓ hecho
   el 24 oct).
3. **En Pub/Sub:** crear un tema y una suscripción pull, y darle el rol de publicador a
   `meet-api-event-push@system.gserviceaccount.com` (✓ hecho el 24 oct).
4. **En Admin, en Meet:** que la transcripción y las notas de Gemini estén permitidas para el equipo, y la toma de notas
   automática.

Lo guía la skill `wizard`, paso por paso.

## Criterio de éxito

- **U1:** el job corre cada 10 minutos durante 7 días (`CronJobState.lastRunAt`); la frescura se mide antes de
  construir, y después la mediana queda bajo una hora; las «leídas antes de terminar» bajan de 177 a 0; y quedan 0
  canceladas en la base (sin texto) o marcadas para revisar (con texto).
- **U3:** «no ocurrió» queda separado de «no se grabó»; INV53 en verde 7 días seguidos; las reuniones sin texto que
  tenían frases en Meet bajan a 0.

## Riesgos

- El scheduler corre los jobs en serie: «cada 10 minutos» quiere decir «como mucho». Y ya hubo un incidente de 821 % de
  CPU: una corrida larga no puede quedarse dentro del tick.
- Un scope nuevo sin autorizar tumba todas las lecturas: va en un JWT aparte, como el de Tareas.
- Las frases se borran a los 30 días: el job tiene que copiarlas antes.
- Que los eventos acepten delegación de dominio era una incógnita: U2 lo confirmó (validación sin crear nada). La
  creación de verdad se ve al prender `GOOGLE_MEET_EVENTOS_ENABLED`.
- La cuota de la API de Meet es de 100 registros por página y por usuario.
