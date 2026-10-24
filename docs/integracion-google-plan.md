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
   - la copia de Calendar y la lectura de los Docs pasan a un job cada 10 minutos (es T6);
   - correr el rescate de las 177 que se leyeron antes de terminar;
   - guardar el código de la reunión, la respuesta de cada invitado y los eventos cancelados.
2. **U2 · La prueba de un día** (✓ en parte, 2026-10-24: Elías habilitó las APIs, sumó el scope a la delegación de dominio y creó `nexus-meet-eventos` y `nexus-meet-eventos-pull` con sus permisos. Con la cuenta de servicio, impersonando a una persona del equipo, se leyeron 10 conferencias con sus participantes y la transcripción por frases en 8; una tuvo 0 participantes, o sea que no ocurrió. Falta probar una reunión organizada por un cliente y los eventos con delegación de dominio): un script de solo lectura con el scope nuevo, sobre 5 reuniones reales (una organizada por
   un cliente). Confirma:
   - el código de la reunión;
   - el acceso como invitado;
   - si los eventos aceptan delegación de dominio.
3. **U3 · La API de Meet:**
   - un job por organizador interno: las conferencias terminadas, «no ocurrió» cuando no hay registro, y las fuentes de
     texto en su orden;
   - una tabla de participantes con su asistencia;
   - los turnos con su hora y su persona;
   - quiénes de Smarteam estuvieron sale de aquí (T7).
4. **U4 · Enterarse al momento:** la suscripción a los eventos de Meet (conferencia terminada, transcripción y notas
   listas) por Pub/Sub, leída cada minuto, con su renovación semanal; Calendar con `syncToken`.
5. **U5 · Las reuniones del cliente y las presenciales:**
   - **las del cliente:** se prueba si un invitado nuestro puede leerlas; si no, la regla del equipo es que las convoque
     Smarteam;
   - **las presenciales:** subir el audio y transcribirlo con Speech-to-Text (T5).

## Lo que tiene que configurar Elías

1. **En Google Cloud:** habilitar las APIs de Meet REST, Workspace Events, Pub/Sub y, para las presenciales,
   Speech-to-Text.
2. **En Admin, en la delegación de dominio:** agregar `https://www.googleapis.com/auth/meetings.space.readonly`.
3. **En Pub/Sub:** crear un tema y una suscripción pull, y darle el rol de publicador a
   `meet-api-event-push@system.gserviceaccount.com`.
4. **En Admin, en Meet:** que la transcripción y las notas de Gemini estén permitidas para el equipo, y la toma de notas
   automática.

Lo guía la skill `wizard`, paso por paso.

## Riesgos

- Un scope nuevo sin autorizar tumba todas las lecturas: va en un JWT aparte, como el de Tareas.
- Las frases se borran a los 30 días: el job tiene que copiarlas antes.
- Que los eventos acepten delegación de dominio es una incógnita: U2 lo confirma antes de construir U4.
- La cuota de la API de Meet es de 100 registros por página y por usuario.
