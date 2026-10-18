# Los correos y el timeline de HubSpot, en el contexto de la cuenta

Iniciativa B de docs/roadmap.md (17 oct, la reunión con Marco). Plan escrito el 2026-10-18, antes del código.

## Por qué

El caso: una minuta con fechas se le mandó al cliente por correo, la reunión que prometía nunca se agendó, nadie le dio
seguimiento y el cliente le escribió a Marco. Nexus lee cada reunión una vez y la deja en la memoria de la cuenta, pero
no lee los correos ni el timeline de HubSpot. Por eso no podía avisar.

Elías: «que estén las comunicaciones en el contexto (en la ficha de empresa y contacto en HubSpot está el timeline,
además las sesiones y los acuerdos que se ingresen manuales), todo conectado, aprovechar el contexto al máximo».

## Lo que se midió (2026-10-18, solo lectura)

- 186 clientes y prospectos de Nexus con su empresa de HubSpot (185 empresas).
- Asociados a esas empresas, de cualquier fecha: **20.117 correos**, 1.032 notas y 738 llamadas.
- En todo el portal, en los últimos 120 días: 1.631 notas, 306 llamadas y 1.506 reuniones.
- ⚠ **La app de HubSpot no tiene el permiso de correos.** `/crm/v3/objects/emails` responde 403 y pide
  `crm.objects.emails.read` o `sales-email-read`. La API v1 de engagements devuelve el correo sin asunto, sin remitente
  y sin texto: solo el tipo (`EMAIL` enviado, `INCOMING_EMAIL` recibido), la fecha y las asociaciones. Hoy la preventa
  y el vigía los descartan sin decir nada (el texto viene vacío, no «redacted»).
- Las notas y las llamadas sí se leen (`/crm/v3/objects/notes` y `calls` responden 207).

## Las cuatro piezas

### 1. Una fuente nueva: las comunicaciones de HubSpot

Una copia de solo lectura, `ComunicacionDeHubspot`, con un job (`comunicaciones-hubspot`, cada hora de 6:00 a 20:00
Costa Rica). El único escritor es `lib/comunicaciones/copia-server.ts`.

**Qué se lee.** Los correos (enviados y recibidos), las notas y las llamadas del timeline de las empresas de Nexus
(clientes y prospectos) y de sus contactos. Las reuniones de HubSpot no: las reuniones ya entran por Meet y por la
preventa.

**Cómo se lee.** Con la búsqueda de HubSpot (`/crm/v3/objects/{emails|notes|calls}/search`) por lo modificado desde la
última corrida, dentro de una ventana de 120 días por la fecha de la comunicación. Después, las asociaciones v4 en lote
(a empresas y a contactos) de lo que trajo la búsqueda. Son pocas llamadas por corrida (unas 20 la primera vez, 3 a 6
después), en vez de leer el timeline de cada empresa y de cada contacto (más de 1.500 pedidos). El punto de partida de
cada tipo se guarda en `CronJobState` y avanza solo si la búsqueda terminó.

**De qué cliente es (invariante 1).** Una comunicación es de UN cliente o de ninguno:

1. Si está asociada a empresas de HubSpot que son de clientes de Nexus, esos clientes. Uno → ese. Dos o más → se
   descarta y se cuenta («con dos clientes»).
2. Si no está asociada a ninguna empresa de un cliente, los clientes de sus contactos (de la copia de contactos,
   `ContactoDeHubspot`). Uno → ese. Dos o más → se descarta y se cuenta.
3. Si no, no es de nadie de Nexus y no se guarda.

La regla es pura (`clienteDeLaComunicacion`, lib/comunicaciones/reglas.ts) y tiene su prueba. Los aliados y las
empresas de Smarteam no son clientes: no cuentan en el paso 1 ni en el 2.

**Qué se guarda.** Lo necesario para el contexto, nada más:

- tipo (correo, nota, llamada), dirección (enviado o recibido, solo en un correo), cuándo pasó;
- el asunto (300 caracteres) y el texto en limpio (4.000 caracteres, sin HTML ni la cita del correo anterior);
- quién la escribió: el dueño de HubSpot (su correo) y, en un correo recibido, el remitente;
- una huella del contenido, para saber si cambió.

No se guardan los destinatarios, los adjuntos, el HTML ni la cita del hilo. La nota de la ficha del cliente
(`esNotaDeLaFicha`) no se copia: es Nexus escribiéndose a sí mismo.

**Nunca se borra una fila.** Lo que HubSpot ya no devuelve o deja de estar asociado queda `vigente = false`.

**Sin el permiso de correos.** La búsqueda de correos responde 403 y la copia no guarda ninguno: lo dice en su
resultado (`correos: sin permiso`), en el semáforo del job y en el simulacro. No se guardan correos «tapados»: sin asunto
ni texto no dicen nada, y para saber siquiera su fecha habría que leer el timeline de cada empresa y cada contacto (más
de 1.500 pedidos por corrida). El día en que se conceda el permiso, la primera corrida trae los 120 días.

Una llamada o una nota sin texto no se guarda (las llamadas sin cuerpo suelen ser reuniones de Meet registradas como
llamada, que ya entran por Meet).

### 2. Lo que Smarteam prometió por correo: compromisos

Un correo **enviado** con una fecha o un compromiso queda leído una vez y sus compromisos pasan a propuestas de tarea,
con la cita verificada, por la MISMA salida que la lectura de cada reunión: `armarPropuestasDeSeguimiento`
(lib/tareas/seguimiento.ts), que decide a quién le llega cada uno, y el escritor único de Tareas
(lib/tareas/mutaciones.ts, función nueva `escribirPropuestasDeComunicacion`).

- **El filtro va antes, en código y sin IA** (`necesitaLectura`, lib/comunicaciones/reglas.ts): solo correos
  enviados, de los últimos 14 días, con texto, y con una fecha («el martes», «15 de octubre», «15/10»,
  «la próxima semana») o una señal de compromiso («agendamos», «te envío», «quedamos», «próximos pasos», «minuta»). El
  resto queda «no aplica» sin gastar. Los recibidos no: lo que promete el cliente en su correo es otra iniciativa.
- **La llamada** (`lib/comunicaciones/compromisos-server.ts`): Haiku 4.5, temperatura 0, con una herramienta forzada
  (`registrar_compromisos_del_correo`) que usa el MISMO esquema de compromisos que la lectura de una reunión
  (lib/sessions/lectura-salida.ts › `esquemaDeLosCompromisos`). La cita se verifica tal cual contra el texto del correo
  (`citaEstaEnLasFuentes`); la que no está, se descarta.
- **Cada correo se lee una vez**: su estado (`no_aplica`, `pendiente`, `leyendo`, `leido`, `error`) vive en la fila. Un
  error se reintenta hasta 3 veces. Releer no duplica: el `origenId` de la tarea es `cor:<comunicación>:<línea>`.
- **El presupuesto**: corre en el job, contra el presupuesto automático del día; sin presupuesto, espera.
- **Se apaga** con `COMPROMISOS_DE_CORREOS_ENABLED=0` en el `.env` (la copia sigue). La copia entera se apaga con
  `COMUNICACIONES_HUBSPOT_ENABLED=0`.
- **El costo** queda en `LlmCall` con `agentSlug = "tareas-correo"` (familia «Tareas» en Uso de Nexus) y su corrida en
  `AgentRun`.

La tarea nace con `origen = "correo"`, sin reunión (`sessionId` vacío), con el título del compromiso, la cita y un
contexto que escribe el código («Lo prometió Smarteam en el correo del jueves 16 oct «Minuta de la sesión»: …»). Se ve
con la regla de siempre: la ve quien ve la cuenta. Entra al tope de 10 sugerencias por persona.

### 3. El aviso de las 48 horas

Una regla pura, `compromisoSinAgendar` (lib/comunicaciones/sin-agendar.ts), con su prueba:

> Un compromiso con fecha (o una reunión prometida) que salió de un correo o de una reunión, que a las 48 horas sigue
> como propuesta (nadie lo tomó) y, si es una reunión, no está en el calendario, no está planeada en Tareas y no
> ocurrió.

- «Está en Tareas» = alguien la tomó (pendiente, en curso o hecha) o hay una reunión planeada de la cuenta. Rechazarla
  o «Ya no se hará» es una decisión: no avisa.
- «Está en el calendario» = un evento de la cuenta en los próximos 8 días en el calendario del CSE (el resolvedor único
  `cuentaDelEvento`). Si el calendario no se pudo leer, no se afirma que falte: se avisa solo por Tareas.
- «Ocurrió» = hay una reunión con la cuenta desde que se prometió (el chokepoint de sesiones).
- Deja de avisar a los 21 días: ahí ya no es un recordatorio, es limpieza.

Le llega como pendiente en «Para ti» («Lo que importa hoy», peso 85: entre el riesgo y la cuenta sin acción) a:

- el CSE de la cuenta (el encargado en HubSpot de un proyecto de Customer Success abierto), una línea por compromiso;
- a quien lidera Customer Success (frente «Liderar Customer Success»), una línea por cuenta.

En un prospecto no hay CSE: le llega a quien tiene la propuesta.

### 4. Lo que se ingresa a mano, en el mismo contexto

Lo que ya estaba conectado, verificado en el código:

- Las **notas de la cuenta** (`NotaDeLaCuenta`) ya entran a la memoria interna («Notas del equipo»), que leen el vigía,
  el chat de Nexus y la preventa de una empresa que ya es cliente (A0). En la preventa de un prospecto entran porque se
  escriben en HubSpot como nota y la preventa lee el timeline de HubSpot.
- Las **reuniones agregadas a mano** son reuniones (`FirefliesSession`, `source = "manual"`): las lee la lectura de cada
  reunión (minuta y compromisos) y el chat las lista con «reuniones.recientes».
- Los **acuerdos** de cada reunión viven en su minuta y llegan por la memoria del proyecto.

Lo nuevo:

- La memoria de la cuenta suma **«Comunicaciones con el cliente»** (solo el alcance interno): las 12 más recientes de 60
  días, con su fecha, quién la escribió y lo esencial del texto. Sin las notas que escribió Nexus (ya están en «Notas
  del equipo»).
- La memoria de la cuenta suma **«Compromisos abiertos de la cuenta»** (solo el alcance interno): lo que no tiene
  proyecto (una reunión agregada a mano sin proyecto, un correo), por la puerta de Tareas para agentes.
- El chat de Nexus suma la lectura **«comunicaciones.recientes»** (una comunicación entera, por su id, o la lista).

## Quién lo ve

- Las comunicaciones son internas: nunca llegan a lo que ve el cliente (documentos, correo de seguimiento, vista
  externa). En la memoria, solo el alcance interno (`queCargar`), y la prueba de la frontera lo vigila.
- Las tareas que salen de un correo se ven con la visibilidad de Tareas: quien ve la cuenta.
- El chat las lee solo de la cuenta del hilo (el servidor pone el cliente).

## Costos de IA

- La copia no usa IA.
- La lectura de compromisos: una llamada a Haiku por correo enviado que pasa el filtro. Unos 1.500 tokens de entrada y
  300 de salida: US$0,003 por correo. El simulacro estima cuántos pasan el filtro al mes; con el permiso de correos
  concedido y unos 200 correos enviados al mes que pasan el filtro, unos US$0,60 al mes.
- Lo que se suma a la memoria: unos 1.500 caracteres más por agente interno.

## Qué no se hace (por ahora)

- **No se pide el permiso de correos.** Se suma por entorno (`HUBSPOT_SCOPES_OPCIONALES_EXTRA="sales-email-read
  crm.objects.emails.read"`) después de declararlo «Opcional» en la app pública, y se reconecta HubSpot. Es una decisión
  de Elías: sin eso, la copia trae las notas y las llamadas, y la lectura de compromisos no tiene qué leer.
- No se leen los compromisos de los correos recibidos, de las notas ni de las llamadas.
- No se copian las reuniones de HubSpot.
- La lectura de cada reunión no lee las comunicaciones: su trabajo es esa reunión.
- Nexus no escribe en HubSpot ni manda nada.
- No hay pantalla nueva: las comunicaciones se ven por la memoria (en el chat) y por sus tareas.

## Construcción

1. SQL aditivo `scripts/sql/2026-10-18-comunicaciones-de-hubspot.sql` (tabla con RLS + RESTRICTIVE). Sin aplicar.
2. La copia (lib/hubspot/comunicaciones.ts para leer HubSpot, lib/comunicaciones/ para las reglas y la escritura), el
   job y `scripts/sync-comunicaciones-de-hubspot.ts` (simulacro por defecto).
3. La lectura de compromisos y el escritor en Tareas.
4. El aviso de 48 horas como dos fuentes de «Para ti».
5. La memoria y el chat.
6. DECISIONS (enmienda «fuera por ahora»), GLOSSARY y RUNBOOK.
