# «Para ti» por equipo — plan

> Pedido de Elías del 2026-10-14, a partir de lo que Andrés Pinzón armó por fuera («Jarvis», con
> Todoist). Las decisiones de abajo son las respuestas de Elías de ese día. No hay nada construido:
> este documento ordena las conexiones que faltan. La página se sigue llamando «Para ti»; «Mi día» es
> el nombre de trabajo de lo que muestra.

## Para qué

Que cada persona abra Nexus y vea su día: su cartera, qué cierra o qué toca, sus reuniones, sus
tareas (las de Nexus y las de HubSpot) y el siguiente paso de cada cuenta. Y que lo que pasa fuera de
una reunión (un WhatsApp, una llamada) se pueda contar por chat y quede en la cuenta y en HubSpot.

Elías quiere bajar el ritmo de desarrollo y enfocarse en el uso. Por eso el plan **conecta piezas que
ya existen** y construye lo mínimo nuevo. Cada etapa se despliega sola y tiene su métrica.

## Lo que ya existe

- **«Para ti»** (`lib/para-ti`): qué es tuyo, frentes, fuentes, avisos. Sirve de base para «Mi día».
- **Tareas** (`lib/tareas`): las tareas guardan su fuente (`origen`); planificador de huecos
  (`proponerHorarios`) y bloques en Google Calendar (`lib/google/agenda.ts`). Sigue en piloto.
- **Chat de tareas** (`lib/tareas/chat`): un hilo por persona, una lista que se revisa y se aplica de
  una vez. Es la base del chat general.
- **Memoria de la cuenta** (`lib/memoria`), **propuestas a la ficha** (`proponerCambiosALaFicha`, acepta
  cualquier texto) y **hechos** (`HechoDeReunion`, con `sessionId` opcional).
- **Encuesta de la etapa**: el molde para que Nexus pregunte y, con la respuesta, escriba en HubSpot.
- **Notas a HubSpot**: Nexus ya escribe notas en la empresa (`lib/clients/ficha-hubspot.ts`).
- **Metas comerciales** (`lib/ventas/metas.ts`): calculadas por persona, sin pantalla.
- **Preventa**: ya pregunta el presupuesto y para cuándo lo necesita el cliente, y lee las reuniones
  de HubSpot.

## Lo que falta (medido el 2026-10-14)

- Nexus **no guarda los negocios abiertos** ni el **dueño de cada empresa** en HubSpot: solo los
  ganados. Por eso no existe «la cartera de un vendedor».
- De los 42 negocios abiertos de Andrés: 23 cierran el 31 de octubre y 11 el 30 de noviembre (la
  fecha se pone a fin de mes), 5 tienen el cierre vencido (febrero a junio), 13 de 40 no tienen monto
  y 29 de 40 traen siguiente paso en HubSpot (`hs_next_step`), que Nexus no lee.
- Nexus **no lee tareas de HubSpot**.
- **No hay «siguiente paso» por cliente** que escriba una persona. El «Qué sigue» del proyecto es
  calculado y solo existe en el navegador.
- El chat **no lee la memoria de la cuenta** ni escribe en ella.
- **Dev** no ve nada propio en «Para ti»: el alcance solo mira proyectos del pipeline de Customer
  Success. Los proyectos de Desarrollo e integración y Sitios web tienen dueño en HubSpot (8 de
  bsalas, 6 de asalas, 4 de arodriguez, 2 de lflores; 5 sin dueño).

## Decisiones (Elías, 2026-10-14)

1. **Nexus pregunta la fecha de cierre y el monto** de un negocio que no los tiene (o los tiene
   vencidos), solo cuando Ventas está trabajando ese negocio. Propone el valor desde las reuniones y la
   actividad del CRM, y la respuesta se escribe en HubSpot.
2. **El siguiente paso es estándar en HubSpot**: la misma propiedad, con el mismo nombre, en cada
   empresa, cada negocio y cada proyecto. Hay uno por equipo, con persona y fecha: se ve que el de
   Ventas lo lleva Andrés y el de CS lo lleva otra persona. El de la empresa sirve cuando tiene varios
   proyectos y para retomar a un excliente. `hs_next_step` queda como sugerencia.
3. **Tareas de HubSpot**: Nexus las lee, las escribe y las actualiza; todas las de cada persona,
   también las de secuencias, cada una diciendo que viene de HubSpot. Elías habilita el permiso.
4. **Chat en el menú.** Después, que sugiera acciones para cada persona según su cartera, sus
   proyectos y sus tareas.
5. **Las notas de la cuenta llegan a HubSpot**, y Nexus también las sugiere y las guarda en su
   contexto.
6. **«Mi día» es distinto por equipo:**
   - Ventas y CSE ven su cartera.
   - La CSL ve Éxito del cliente (la cartera entera).
   - Dev ve su cartera: los clientes con un proyecto de desarrollo activo.
   - Marketing ve sus tareas internas, asociadas a las empresas Smarteam y SmartAgro.

## Las piezas

### 1. Negocios abiertos y preguntas de cierre y monto

- **Copia de los negocios abiertos** (tabla nueva `NegocioAbierto`): los tres pipelines de venta
  propia, con dueño, empresa, etapa, fecha de cierre, monto (con su moneda y en USD con la tasa de
  Nexus), probabilidad, `hs_next_step`, próxima actividad y última actividad. La trae un job diario y
  se refresca al abrir «Mi día» si tiene más de una hora. Cubre prospectos y clientes.
- **Dueño de cada empresa** en `Client` (copiado de HubSpot): sin él no hay «cartera» de un
  vendedor.
- **La pregunta** (molde de la encuesta de la etapa): un negocio abierto del vendedor, sin fecha de
  cierre, con la fecha vencida o sin monto, que tuvo interacción en los últimos 14 días (una reunión
  con la empresa o actividad en HubSpot). Aparece en «Mi día» y en la ficha:
  - «¿Cuándo cierra «Casagri – Nuevo tipo de objeto»? Nexus propone 30 nov: «la gerencia decide antes
    de fin de mes» (reunión del 12 oct)».
  - Responder escribe la fecha o el monto en el negocio de HubSpot (`crm.objects.deals.write`, que ya
    tenemos). «Ahora no» la calla por 7 días.
- **De dónde sale lo que propone**: las minutas y los resúmenes de las reuniones con la empresa, las
  notas de HubSpot y, si hay preventa, sus casillas de presupuesto y de cuándo lo necesita. Lo propone
  un modelo pequeño solo cuando se muestra la pregunta, con la frase copiada tal cual. No se agrega una
  lectura más por reunión.
- **Señales del negocio** (sin IA): cierre vencido, sin monto, sin siguiente paso, sin actividad hace
  21 días.

### 2. Siguiente paso, por equipo

- **En HubSpot**: un grupo de propiedades «Nexus · Siguiente paso», con los MISMOS nombres internos en
  empresas (0-2), negocios (0-3) y proyectos (0-970). Por cada equipo: qué, fecha y responsable (un
  campo de tipo usuario, como `cse_encargado`):
  - `siguiente_paso_ventas`, `siguiente_paso_ventas_fecha`, `siguiente_paso_ventas_responsable`
  - `siguiente_paso_cs`, `siguiente_paso_cs_fecha`, `siguiente_paso_cs_responsable`
  - `siguiente_paso_dev`, `siguiente_paso_dev_fecha`, `siguiente_paso_dev_responsable`

  Las de empresas y negocios las puede crear un script (la app tiene permiso de escribir esos
  esquemas). Las de proyectos las crea un administrador en HubSpot, porque la app no tiene permiso de
  escribir el esquema de proyectos.
- **El de la empresa** no repite al del negocio o el proyecto: es el de la cuenta entera. Sirve cuando
  hay varios proyectos y para una cuenta sin nada abierto, como un excliente que se quiere retomar.
- **En Nexus** (tabla nueva `SiguientePaso`): cada cambio es una fila con objeto, equipo, responsable,
  qué, fecha, quién lo escribió y de dónde salió (a mano, chat, reunión, HubSpot). El vigente de cada
  equipo se escribe en HubSpot. Así queda la historia en Nexus y lo de hoy en HubSpot.
- **Quién lo escribe**: cada persona, el suyo. Nexus lo sugiere desde la minuta de la última reunión,
  desde el chat y desde `hs_next_step` (en negocios). La persona lo usa o lo cambia. Nexus nunca
  escribe `hs_next_step`: lo llena HubSpot.
- **Dónde se ve**: en la ficha del cliente (los de todos los equipos, juntos), en el negocio, en el
  proyecto y en «Mi día» como «Tu siguiente movimiento». Una cuenta sin siguiente paso vigente, o con
  la fecha pasada, es una señal.
- **Con fecha**, se puede agendar: «Agendar» lo pasa a una tarea y a tu calendario.

### 3. Tareas de HubSpot

- **Primero, una prueba de solo lectura**: buscar las tareas abiertas de una persona en HubSpot con la
  conexión del sistema y medir cuántas son. Con eso se ve qué permiso pide HubSpot. Si hace falta uno
  nuevo, se declara «Opcional» en la app pública y se reconecta desde Integraciones (el código lo pide
  después, nunca antes).
- **Entran como `Tarea`** con `origen = "hubspot"` y el id de HubSpot, para que vivan en la misma
  lista, la misma semana y la misma agenda. Las tareas de HubSpot ya tienen dueño, así que no son
  propuestas. Entran todas las abiertas de cada persona del equipo (también las que crean las
  secuencias), más las completadas de los últimos 7 días.
- **Se leen y se escriben**: completar, cambiar la fecha o el título desde Nexus lo escribe en
  HubSpot. La copia trae lo cambiado allá cada 15 minutos (por fecha de modificación). Si los dos
  cambiaron la misma tarea, gana lo último y queda en la bitácora de la tarea.
- **La fuente se ve**: un chip «HubSpot» (o «HubSpot · secuencia») con enlace a la tarea y a su
  negocio o empresa.
- **Tareas sale del piloto** para Ventas y CSE.
- No se crean en HubSpot las tareas que nacen en Nexus (salvo que se decida lo contrario).

### 4. Chat en el menú

- **«Chat»** en el menú, para todos los internos con `asistente.read`. Es el chat de tareas ampliado,
  con un hilo por persona.
- **Lee**: tu cartera (según tu equipo), y de la cuenta que nombras, su memoria (alcance interno, se
  declara en `lib/memoria/consumidores.ts`), sus negocios, sus siguientes pasos y sus tareas.
- **Acciones nuevas**, que se revisan y se aplican de una vez:
  - anotar en la cuenta (pieza 5);
  - fijar un siguiente paso;
  - poner fecha de cierre o monto a un negocio (se escribe en HubSpot);
  - proponer un cambio a la ficha (origen «Chat»);
  - agendar.
- **Después** (etapa 8): al abrir el chat sugiere acciones para ti, con los datos de «Mi día».
- Tiene su propio medidor y un tope de mensajes por persona al día, como el chat de tareas.

### 5. Notas de la cuenta

- **Anotar** algo de un WhatsApp, una llamada o un correo (tabla nueva `NotaDeLaCuenta`): texto,
  canal, fecha, autor, empresa y, si aplica, el negocio o el proyecto.
- **Va a HubSpot** como nota de la empresa (y del negocio o el proyecto), a nombre de quien la
  escribió. Nexus guarda el id de la nota, y al leer HubSpot no la vuelve a traer como si fuera nueva.
- **Entra al contexto**: la memoria interna de la cuenta suma «Notas del equipo». Con la lectura de
  hechos prendida, la nota también deja hechos (`HechoDeReunion` sin reunión), y de ahí salen
  propuestas a la ficha y novedades. La ve todo el que ve la cuenta; nunca le llega al cliente.
- **Nexus sugiere notas** para HubSpot:
  - después de una reunión de Meet (lo acordado, para el registro de HubSpot, porque esas reuniones
    no quedan allá);
  - desde el chat, cuando cuentas algo.

  Se usa o se descarta, como todo lo propuesto.

### 6. «Mi día» por equipo

La misma página para todos; lo que ve cada persona depende de su equipo. El equipo sale del rol
(`TeamRole`). Un Super Admin elige el suyo (Marco vende, así que ve el de Ventas).

| Equipo | Su cartera | Lo que ve |
|---|---|---|
| Ventas | Empresas donde es dueño en HubSpot, más las empresas donde tiene un negocio abierto aunque no sea dueño de la empresa | Cierres más cerca, preguntas de cierre y monto, siguiente paso por negocio, agenda, tareas (Nexus y HubSpot), meta del año y lo ponderado |
| CSE | Proyectos donde es CSE encargado | Siguiente paso de CS, agenda, tareas, lo de hoy de «Para ti» (reuniones, cronograma, etapa), relación con HubSpot por vencer |
| CSL | Toda la cartera de CS | Éxito del cliente, su frente, agenda y tareas |
| Dev | Clientes con un proyecto activo de Desarrollo e integración o Sitios web donde es dueño | Siguiente paso de Dev, agenda, tareas |
| Marketing | Smarteam y SmartAgro | Tareas internas de esas empresas, agenda, publicaciones por revisar |
| Finanzas | — | Lo de su frente (después) |

- **Cartera ordenada**: con negocio y fecha de cierre, después con monto, después solo con negocio, y
  al final sin negocio. Cada cuenta muestra su siguiente paso y sus señales.
- **Agenda del día**: tus eventos de Google Calendar, con la empresa de cada reunión (reconocida por
  los dominios de los invitados, con la misma regla de la exploración) y «Preparar».
- **Planificar la semana**: el lunes, Nexus propone bloques para tus tareas y tus siguientes pasos con
  fecha, en tus huecos (el planificador que ya existe). Escribir en el calendario necesita que Google
  Admin autorice `calendar.events.owned` (pendiente desde el módulo de Tareas).

## Etapas

| Etapa | Qué | SQL | Métrica |
|---|---|---|---|
| 0 | En HubSpot: crear las propiedades de siguiente paso, declarar el permiso de tareas. En Google Admin: autorizar escribir en el calendario. Prueba de lectura de tareas | — | — |
| 1 | Copia de negocios abiertos, dueño de la empresa, «Mi día» de Ventas (cartera, cierres, meta), preguntas de cierre y monto | `NegocioAbierto`, columnas en `Client` | % de negocios activos con cierre vigente y monto |
| 2 | Siguiente paso por equipo, en Nexus y en HubSpot | `SiguientePaso` | % de cuentas con siguiente paso vigente |
| 3 | Tareas de HubSpot en Nexus; Tareas para Ventas y CSE | columnas en `Tarea` | tareas de HubSpot cerradas desde Nexus |
| 4 | «Mi día» de CSE, agenda del día, planificar la semana | — | personas que abren «Mi día» cada día |
| 5 | Notas de la cuenta, a HubSpot y al contexto, y las sugeridas | `NotaDeLaCuenta` | notas por semana; sugeridas usadas |
| 6 | Chat en el menú, con la memoria y las acciones nuevas | — | conversaciones que terminan aplicando algo |
| 7 | «Mi día» de Dev y de Marketing; Finanzas | — | — |
| 8 | Acciones sugeridas por persona en el chat | — | sugerencias usadas |

Las etapas 1 y 2 son las de Ventas: con ellas Andrés puede dejar Jarvis y medir. Después de la 4 se
para y se mide antes de seguir.

## Respuestas de Elías (2026-10-14)

1. `hs_next_step`: como sugerencia.
2. El siguiente paso va también en la empresa: por si tiene varios proyectos y para retomar
   exclientes.
3. Marketing y su propio siguiente paso: pendiente (ver abajo).
4. Cartera de Ventas: las dos, incluida la empresa donde tiene un negocio abierto sin ser dueño.
5. Tareas de HubSpot: todas, diciendo de dónde vienen.
6. El nombre se queda «Para ti».

Marketing no lleva siguiente paso propio (Elías, 2026-10-14).

## Etapa 0, cómo va (2026-10-14)

- **Google Calendar**: autorizado. Nexus ya obtiene el permiso `calendar.events.owned` (se pidió un
  token, sin escribir nada).
- **Tareas de HubSpot**: leer, crear, completar y borrar ya funcionan con la conexión de hoy (probado
  con una tarea a nombre de Elías, borrada enseguida). `crm.objects.tasks.write` se pide como opcional
  pero HubSpot no lo concedió; hoy no hace falta.
- **Propiedades de siguiente paso**: creadas el 2026-10-14 en empresas, negocios y proyectos (grupo
  «Nexus · Siguiente paso», 9 por objeto), con `scripts/hubspot-crear-propiedades-siguiente-paso.ts`
  sobre la lista de `lib/siguiente-paso/propiedades.ts`. HubSpot se reconectó ese día con
  `crm.schemas.projects.write`.

La etapa 0 está cerrada.

**Las tareas de HubSpot hoy** (medido el 2026-10-14, solo lectura): 1.062 abiertas en el portal y
casi todas vencidas. 485 no tienen dueño, unas 300 son de personas que ya no están, Lidia Flores
tiene 117, Alexander Arrieta 56, Alejandra Ortega 46 y Andrés Pinzón 9 (3 vencidas). Ese mismo día
Elías las borró en HubSpot y dejó solo las 9 de Andrés (verificado: 9 abiertas en todo el portal). La
etapa 3 arranca con la lista limpia; si vuelven a juntarse vencidas, se resuelve entonces.

## Etapa 1, cómo va (2026-10-14)

Construida, sin commit ni deploy (las reglas, en DECISIONS ««Para ti» de Ventas: los negocios abiertos…»):
- La copia: `NegocioAbierto` + `Client.hubspotOwnerId/Email`, `lib/ventas/sync-negocios-abiertos.ts`, job
  `negocios-abiertos` (cada hora, 6:00 a 20:00) y `scripts/sync-negocios-abiertos.ts` para la carga inicial.
- Las reglas: `lib/ventas/negocios.ts` (señales, temperatura, pregunta, cierres más cerca, ponderado, cartera).
- «Para ti»: `components/para-ti/VentasDeParaTi.tsx` (Tu día · Tu cartera, la meta, lo ponderado, el pipeline y la
  pregunta) y la fuente `lib/para-ti/fuentes/negocios.ts`.
- La pregunta escribe en HubSpot (`/api/sales/negocios/[id]/respuesta`) y Nexus propone el valor
  (`/api/sales/negocios/[id]/propuesta`, `lib/ventas/propuesta-de-cierre*.ts`).

Medido el 2026-10-14 contra HubSpot (solo lectura): 201 negocios abiertos (123 de Marco, 42 de Andrés, 10 de Alex
Vanegas), todos con fecha de cierre, 61 sin monto.

El 2026-10-15, después de verla en uso: «Para ti» saluda con el nombre y la fecha, y «Tu cartera» pasa a cuatro vistas
(para mover hoy, pipeline, por limpiar, sin negocio) con buscador, filtros y una acción por fila. Los pausados salen
del pipeline y de lo ponderado. Con los datos de Andrés: 24 para mover hoy, 37 en el pipeline, 6 por limpiar y 49
sin negocio.

Para ponerla en marcha: el SQL `scripts/sql/2026-10-14-negocios-abiertos.sql`, `npx prisma generate`, reiniciar el
dev server, la carga inicial con `scripts/sync-negocios-abiertos.ts --apply` y, con el deploy, el job sigue solo.

## Etapa 2, cómo va (2026-10-15)

Construida, sin commit ni deploy (las reglas, en DECISIONS «El siguiente paso de cada equipo, en Nexus y en HubSpot»):
- La tabla `SiguientePaso` (SQL `scripts/sql/2026-10-15-siguiente-paso.sql`, ya aplicado en producción).
- `lib/siguiente-paso`: las reglas (`reglas.ts`), la escritura en HubSpot (`escritura-server.ts`), la lectura
  (`lectura-server.ts`) y lo que vuelve de HubSpot en la copia de los negocios (`copia-server.ts`).
- La API: `POST /api/siguiente-paso`, `POST /api/siguiente-paso/[id]/hecho`, `GET /api/siguiente-paso/personas` y
  `GET /api/clients/[id]/siguientes-pasos`.
- La pantalla: el diálogo (`components/siguiente-paso`), la cartera de «Para ti», el panel de «Información del
  cliente» y el pendiente «Tu siguiente movimiento» (`lib/para-ti/fuentes/siguientes-pasos.ts`).

Probado el 2026-10-15 contra HubSpot: un paso de prueba en la empresa Smarteam se escribió (texto, fecha y
responsable) y se borró. La copia lee las propiedades de los 201 negocios sin error.

## Etapa 3, cómo va (2026-10-15)

Construida, sin commit ni deploy (las reglas, en DECISIONS «Las tareas de HubSpot viven en Tareas internas, en los dos
sentidos»):
- Las columnas en `Tarea` (SQL `scripts/sql/2026-10-15-tareas-de-hubspot.sql`, ya aplicado en producción) y el origen
  «hubspot».
- `lib/tareas-hubspot`: las reglas (`reglas.ts`, la comparación de los tres) y la copia (`sync-server.ts`); lo que llega
  de HubSpot lo escribe el escritor único de Tareas.
- El job `tareas-hubspot` (cada 15 minutos) y la escritura enseguida al guardar una tarea de HubSpot en Nexus.
- El chip «HubSpot» y los enlaces en el cajón. Tareas, en el menú de Ventas y Customer Success.

Carga inicial el 2026-10-15: 13 tareas de Andrés (9 abiertas y 4 completadas esta semana). Falta probar con Andrés
que completar o cambiar la fecha en Nexus llega a HubSpot.
