# Nexus, el sistema de trabajo de cada cuenta — plan

> Acordado con Elías el 2026-10-16, después de la reunión con Alexander Vanegas (líder de Customer Success) y de una
> revisión del código en cuatro frentes (tareas y agenda, chat y agentes, notificaciones y alertas, modelo de datos y
> entregables). Reemplaza el orden del roadmap de `docs/mi-dia-plan.md` desde la etapa 6b en adelante; lo construido
> hasta la etapa 5 sigue valiendo. Las reglas que cambian van primero en `docs/DECISIONS.md` («Nexus, el sistema de
> trabajo de cada cuenta»).

## Qué es Nexus

Hasta hoy Nexus fue un **analizador de reuniones que produce documentos**. Desde este plan es **el sistema de trabajo de
cada cuenta: sabe lo que pasó, planifica lo que sigue y ayuda a hacerlo**. Cuatro capas sobre una sola base:

| Capa | Qué responde | Qué hay hoy | Qué cambia |
|---|---|---|---|
| **Memoria** | ¿Qué pasó con esta cuenta? | Reuniones leídas una vez, minutas, ficha, notas, contactos y tickets de HubSpot, búsqueda en las transcripciones | Se prende la lectura de hechos. Cada cosa en un solo lugar |
| **Plan** | ¿Qué se va a hacer, quién y cuándo? | Tareas por persona y equipo; siguiente paso aparte; la agenda se lee en vivo | Una sola **acción** (la tarea) por cuenta, contacto, proyecto, equipo y persona, con su semana y su reunión |
| **Entregables** | ¿Qué le presentamos al cliente? | Un documento por pieza, una plantilla cada uno | Varias plantillas por entregable, generadas con un botón o desde el chat |
| **Atención** | ¿Qué importa hoy? | 26 fuentes de pendientes, 28 tipos de aviso y 150 alertas abiertas, sin orden ni tope | Un solo motor: una cosa por cuenta y como mucho 5 |

Encima de las cuatro capas, **una sola capa de operaciones**. Cada operación declara qué datos pide, quién puede hacerla,
cómo se ve antes de aplicarla y cómo se aplica. La pantalla y el chat usan la misma: cuando falta un dato, el chat lo
pregunta porque la operación dice qué pide, y una operación nueva aparece sola en el chat. Un MCP, si algún día hace
falta, es un adaptador fino encima.

## Decisiones (Elías, 2026-10-16)

1. **El siguiente paso es una tarea.** El siguiente paso de un equipo en una cuenta es su próxima tarea abierta con
   fecha; puede haber una de CS y otra de Dev. HubSpot se sigue escribiendo igual (`siguiente_paso_cs`, `_dev`,
   `_ventas`), a partir de esa tarea. La tabla `SiguientePaso` se retira (0 filas al 2026-10-16).
2. **Reglas de servicio.** Cada cuenta con servicio activo tiene una acción con fecha cada semana y una reunión agendada
   en los próximos **8 días**, salvo una excepción explícita.
3. **Alertas.** Las 150 abiertas se cierran en bloque (firmadas por el sistema, con respaldo). En su lugar, una lectura
   por cuenta, que también ve el CSE.
4. **Tareas que salen de las reuniones**: entran directo a la semana de quien se comprometió, como sugeridas, con tope por
   persona. Tareas sirve también para los sprints internos: el semanal de CS (donde se habla de las cuentas) y los de
   Marketing y Desarrollo (tareas de clientes y tareas internas).
5. **Calendario.** Por ahora, «Agendar» abre Google Calendar en una pestaña nueva con todo lleno (título, objetivo, hora
   propuesta e invitados del cliente); la persona lo guarda y Google manda la invitación. Nexus lee el calendario para
   proponer el hueco. No hace falta permiso de escritura.
6. **WhatsApp**: Nexus solo arma el mensaje (copiar o abrir WhatsApp con el texto), nunca lo envía. Segunda iteración.
7. **El chat**: uno solo en el menú, que toma el alcance de la pantalla donde estás (mi semana, una cuenta, un proyecto),
   con un hilo por cuenta. Toda escritura pasa por la lista para confirmar, con un clic.
8. **Desarrollo**: Alejandro Salas y Brainer entran a Tareas; los lidera **Alex Vanegas**. Customer Success tiene que
   estar al tanto de todo lo que se le hace a un cliente.
9. **Visibilidad por cuenta**: quien tiene acceso a una cuenta ve todas sus tareas que no son «Solo para mí», de
   cualquier equipo. La frase citada de una reunión sigue con su regla.
10. **Contactos**: los de HubSpot. Si falta uno, se crea allá y Nexus lo trae.
11. **Entregables y herramientas.** Entregables (los ve el cliente, con plantillas): Diagnóstico, Planificación,
    Integraciones, Entrega y Kickoff (lo presenta el CSE, una sola vez por proyecto). Herramientas del proyecto (internas,
    sin plantillas): Resumen, Cronograma, Cuestionarios, Exploración, Handoff y Ejecución. El diagnóstico de hoy pasa a
    ser la plantilla «Diagnóstico estratégico»; las demás plantillas vienen después.
12. **La memoria no se monta como RAG con vectores** por ahora: lo estructurado, la búsqueda por palabras en los turnos
    y la lectura de una reunión entera alcanzan, y todas filtran por cliente. Vectores solo si al medir el chat la
    búsqueda por palabras no alcanza.
13. **Se prende la lectura de hechos** con Sonnet y caché (unos US$22 al mes, sondeo del 2026-10-15).
14. **Se despliega la etapa 5** (notas de la cuenta).

## Dónde estamos (medido el 2026-10-16, solo lectura)

| Indicador | Hoy |
|---|---|
| Alertas de cuenta abiertas | 150 (126 del vigía); 147 de las 162 de las últimas dos semanas siguen abiertas |
| Tareas propuestas por las reuniones | 80, ninguna decidida en 30 días; 32 avisos «tienes sugerencias» sin leer |
| Fuentes de pendientes / tipos de aviso en «Para ti» | 26 / 28, sin tope ni orden de importancia; un hecho sale en hasta 6 lugares |
| Cuentas con servicio activo | 53: 0 con siguiente paso, 4 con reunión guardada en los próximos 14 días, 9 con una tarea abierta |
| Formas de guardar «algo que hay que hacer» | Unas 10, sin relación entre ellas |
| Lugares donde se configura cada entregable | 15 a 18, con 4 o 5 nombres |
| Formas de guardar «el agente propone, una persona confirma» | Unas 15 |
| Motores de chat / listas de operaciones | 2 / 7, sin un formato común |

## Las fases

Cada fase se despliega sola. Las fases 0 y 1 avanzan juntas.

### Fase 0 · Cimientos

- **0.1 Equipos en un solo registro.** Miembros y líder explícitos (un líder puede liderar más de un equipo: Alex lidera
  CS y Dev). De ahí salen el sprint de cada tarea, el menú, «Para ti» y el siguiente paso. Hoy los equipos se definen de
  tres maneras (por área, por rol y por una lista del menú). Tareas aparece en el menú de todos los equipos, Dev incluido.
- **0.2 La acción única.**
  - La tarea suma su **contacto** (de la copia de HubSpot) y su **negocio**, como columnas, y el **lado** (cliente o
    Smarteam), que hoy vive dentro de un evento.
  - El **siguiente paso** de un equipo en una cuenta pasa a ser su próxima tarea abierta con fecha. Las propiedades
    `siguiente_paso_*` de HubSpot se escriben desde ella. `SiguientePaso` queda DEPRECATED sin filas.
  - La **reunión planeada** es una tarea de tipo reunión, con sus invitados; cuando ocurre, queda unida a la reunión que
    se hizo.
- **0.3 Visibilidad y consultas por cuenta.** La regla nueva de la decisión 9, con consultas filtradas en el servidor
  (cuenta, contacto, equipo, persona, semana) y sus índices. Hoy la vista por cliente agrupa en memoria hasta 600 tareas.
- **0.4 La capa de operaciones** (`lib/operaciones`). Cada operación: nombre, para qué sirve, qué pide (zod, del que sale
  el esquema de la herramienta del chat), si lee o propone, quién puede (con la persona explícita, no la sesión),
  preparar y aplicar dentro de una transacción. Primero se envuelven las de tareas, notas y siguiente paso.
- **0.5 Lista de limpieza de HubSpot** por responsable: proyectos a nombre de alguien que ya no está, etapa sin cambios
  hace semanas, proyectos sin actividad, servicios que no están registrados.
- **0.6 Prender la lectura de hechos** (`SEGUIMIENTO_HECHOS=1`, Sonnet con caché).
- **0.7 Desplegar la etapa 5** (notas de la cuenta).

### Fase 1 · Atención

- **1.1 «Lo que importa hoy».** Cada pendiente lleva un peso y su cuenta: una sola cosa por cuenta (la de más peso; el
  resto, «+N en esta cuenta») y como mucho 5 en «Hoy». El número del menú cuenta esas 5 y el correo de la mañana usa las
  mismas. Orden: cliente en riesgo o queja verificada > cuenta sin acción o sin reunión > decisión que frena (cronograma,
  etapa) > revisar una reunión > lo interno > encuestas y limpieza.
- **1.2 La lectura de la cuenta en lugar de alertas sueltas.** Por cuenta, el color y hasta 3 motivos. El vigía actualiza
  los motivos de la cuenta en vez de crear alertas sueltas; las renovaciones (regla y vigía) se juntan. El CSE la ve en
  sus cuentas. Las 150 abiertas se cierran en bloque, con respaldo.
- **1.3 Avisos solo para lo que no es un pendiente**: mensajes, buenas noticias y asignaciones directas. Salen los que
  repiten un pendiente (`tareas.sugerencias`, `tareas.pedido`, `finanzas.devuelto`, `documentacion.comentario`,
  `alcance.confirmado`) y los tipos que nadie escribe.
- **1.4 Tareas de las reuniones**: entran como sugeridas en la semana de quien se comprometió, con tope por persona, y se
  borran si sobran. «Para ti» las cuenta en una línea por reunión.

### Fase 2 · La semana

- **2.1 Reglas de servicio** por cuenta activa: una acción con fecha cada semana, una reunión en los próximos 8 días, los
  compromisos del cliente con seguimiento y un siguiente paso por equipo. Se ven en la cuenta, en «Para ti» del CSE y en
  la cartera de la CSL.
- **2.2 La agenda por cuenta.** Un solo resolvedor de evento → cliente (hoy hay tres), que lee el calendario de cada
  persona de los próximos 8 días. Así se sabe qué cuentas tienen reunión.
- **2.3 «Planifica tu semana»** (viernes). Nexus arma la semana por cuenta (la acción, el hueco y la reunión sugerida con
  su objetivo); la ajustas en la pantalla o hablándole al chat, y «Agendar» abre Google Calendar con todo lleno. Lo que
  no cabe se ve. Dev planifica igual.
- **2.4 Los sprints de cada equipo.** Cada equipo marca una vez la serie de su reunión de sprint (CS, Dev, Marketing) y
  Nexus la lee sola cada semana (`FuenteDeTareas`, que hoy tiene tabla y no código): las tareas salen con su cuenta, o
  internas.

### Fase 3 · Después de cada reunión

- El correo de seguimiento para toda reunión con un cliente (hoy solo en las exploraciones).
- La próxima reunión sugerida, con su objetivo y el enlace para agendarla.
- El mensaje de WhatsApp sugerido (segunda iteración).

### Fase 4 · El chat de Nexus

- Un motor nuevo (`lib/nexus-chat`), aparte de los dos que hay: el del documento y el de tareas siguen.
- Alcance según la pantalla; un hilo por cuenta (`HiloDeChat` suma la cuenta).
- **Herramientas de lectura**: la memoria de la cuenta y del proyecto, la búsqueda en las reuniones, leer una reunión, las
  tareas de la cuenta, la agenda, los negocios, contactos y tickets.
- **Herramientas de propuesta**: las de la capa de operaciones. El chat pregunta lo que falta, muestra la lista y aplica
  con un clic.
- **Generar un entregable** con su plantilla y tus instrucciones (fase 5).
- Tope por persona y por vueltas, y el costo de cada hilo.

### Fase 5 · Entregables y herramientas

- El riel en dos grupos: Entregables y Herramientas del proyecto.
- Cada entregable se define en un solo lugar (hoy son 15 a 18). La plantilla queda guardada en el documento.
- Una sola función genera cualquier entregable con su plantilla y tus instrucciones; la usan el botón y el chat. Sale de
  la ruta de 3.500 líneas.
- El diagnóstico de hoy pasa a ser «Diagnóstico estratégico».
- La Ejecución genera tareas desde la Planificación («crea estas propiedades, este pipeline…»), en la semana de quien las
  ejecuta, Dev incluido.

### Después

Congelar y medir dos semanas. Después: WhatsApp, más plantillas (la lista de entregables por etapa que pidió Elías a
Alex), vectores si la búsqueda no alcanza, y un MCP si hace falta.

## Lo que no se toca

- La regla de pertenencia de las reuniones (`lib/sessions/project-sources.ts`, `categorize.ts`, `resolvedClientId`).
- La memoria de la cuenta y la frontera de lo que ve el cliente.
- El motor que dibuja los documentos (`LandingView`).
- Cobranza y Finanzas.
- El motor de etapas (se extiende lo que lee, no cómo decide).
- Sin renombres grandes: SQL solo aditivo.

## Cómo medimos

| Indicador | Hoy | Meta |
|---|---|---|
| Cuentas activas con una acción con fecha esta semana | 9 de 53 con una tarea abierta | Todas |
| Cuentas activas con reunión en los próximos 8 días | No se mide | 8 de cada 10 |
| Lo de hoy en «Para ti» por persona | Sin tope | 5 como mucho |
| Alertas abiertas | 150 | Una lectura por cuenta |
| Tareas sugeridas por las reuniones que se usaron | 0 de 80 | La mitad |
| Personas que abren «Para ti» 4 de 5 días | Se empezó a medir el 2026-10-16 | Todo CS |

## Estado

| Fase | Estado |
|---|---|
| 0 · Cimientos | 0.1, 0.2 y 0.3 en el código, sin desplegar (SQL aplicados); 0.6 y 0.7 esperan el deploy; faltan 0.4 y 0.5 |
| 1 · Atención | 1.1, 1.3 y 1.4 en el código, sin desplegar; falta 1.2 (la lectura de la cuenta) |
| 2 · La semana | Pendiente |
| 3 · Después de cada reunión | Pendiente |
| 4 · El chat de Nexus | Pendiente |
| 5 · Entregables y herramientas | Pendiente |
