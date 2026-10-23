# Tareas internas de Nexus: plan de arquitectura (v5)

> Reemplaza la v4 del 8 oct. Es la v4 con la revisión del 9 oct aplicada: cuatro revisores (esquema, seguridad, IA y requisitos) encontraron 6 problemas altos y unos 35 medios. Están todos arreglados acá, y los bajos que eran baratos también. Donde un arreglo chocaba con lo que pediste, ganó tu pedido, y queda dicho en «Decisiones que tomé».
>
> En una línea: **lo que se acuerda en una reunión termina en la semana y en la agenda de cada persona**, dentro de espacios y proyectos, con el cliente a la vista, y con un chat que propone pero nunca escribe solo.

## Estado de la construcción (9 oct, sin commit, probado en la base local)

- **1A.1, completa**: lectura de reuniones (niveles 0 y 1), propuestas, Mis tareas, Semana del equipo, Revisa tu semana, Agendar, «Para ti», inicio, menú con «Nueva tarea», invariantes INV38–43, guardas.
- **1A.2, casi completa**: Tablero y Calendario de la semana, tablero del equipo y métricas, «Revisar con el equipo», arrastre en la agenda, comentarios, dependencias, etiquetas, vínculos (HubSpot por enlace, propuestas y preventas, solo en una tarea), «Por cliente», página del proyecto con tablero por estado o sección, espacios libres con su página y su lugar en el menú, job del lunes con el cierre automático apagado, recorridos.
- **Nivel 2, hecho**: sin próximos pasos se lee la conversación sola; con notas, «¿Faltó algo?» (§7.3).
- **Revisión del 9 oct**: 14 fallas confirmadas por dos revisores cada una, todas arregladas con su prueba (DECISIONS §Tareas internas).
- **Vínculos de un proyecto y «Actualizar» la foto, hechos.**
- **Falta de 1A.2, a coordinar**: `Riel` (el espacio va en tarjetas) y llevar `StatusCircle`, `Iniciales` y `SelectorDePeriodo` a `components/ui`. Tocan archivos del cronograma (área de la otra PC: `TimelineGantt`, `TaskDetailDrawer`) y de clientes y gastos que hoy cambian otras sesiones; Tareas todavía no los usa. Se hacen en una pasada coordinada.
- **1B, el chat de tareas, hecho** (sin commit): el chat de Nexus con su propio turno (`lib/tareas/chat`), un hilo por persona en todas las pantallas, el contexto con etiquetas y sin citas, los chips (tarea, proyecto, cliente, reunión), la prueba en seco con un reintento, lo pendiente que se arrastra y se descarta con cascada, aplicar todo o nada en el servidor con el desenlace en la misma transacción (`POST /api/tareas/operaciones`), los planes como borrador que se reparten al activarlos, y el botón «Asistente» en las pantallas de Tareas, «Preguntarle al asistente» en los cajones y en «Leer una reunión», y «o pídeselo al asistente» en «+ Tarea». Cambia §6.8: no es un tercer carril dentro de `lib/asistente/turno.ts` (DECISIONS §Tareas internas). Falta medir el costo con `scripts/probar-asistente.ts` (lo corre Elías: llama al modelo de verdad).
- **Contexto y «Lo que delegaste», hechos** (2026-10-09, sin commit): cada tarea que genera Nexus nace con su contexto (`Tarea.contexto`, SQL `2026-10-09-tareas2-contexto.sql`), y `/tareas/delegadas` muestra lo que pediste o asignaste y cómo va. Detalle en DECISIONS §Tareas internas.
- **Después**: 1C (lectura automática y plantillas).
- **Antes del deploy**: el SQL en producción, `calendar.events.owned` en Google Admin, `/ship-nexus` y commit por partes.

## Lo que decidió Elías

### 8 oct, antes del diseño v3 (sigue vigente)

1. **Un bloque de agenda por tarea.** Nunca varias tareas en un bloque; una tarea larga puede tener más de un bloque.
2. **Nexus crea el bloque en Google Calendar** desde la primera entrega. Elías autoriza `calendar.events.owned` en Google Admin antes del deploy (ver el final). Abrir Calendar prellenado queda solo como respaldo.
3. **Líderes**: Marketing → Alejandra Ortega · Customer Success → Alexander Vanegas · Ventas → Andrés Pinzón · Desarrollo → Alejandro Salas. Admin no tiene líder. Elías (RevOps) tiene su equipo personal.
4. **Sin vista de Dirección.** Se ve por equipo.
5. **Cada persona ve lo suyo y lo de su equipo**, más lo que pidió y lo que le pidieron. Super Admin ve todo.
6. **Cada equipo configura solo qué reuniones lee Nexus** y si son planning, cierre o las dos.
7. **La primera prueba es el «Sprint planning de marketing» del lunes 5 oct, 9:30** (lo organizó Elías, con Alejandra y Lidia). La retro del viernes 9 oct cierra esa semana.

### 8 oct, después de ver el diseño v3

| # | Lo que pidió | Cómo queda |
|---|---|---|
| R1 | Inicio en cuatro pasos | Ten tus reuniones con tu equipo → Nexus propone y tú aceptas → agrégalas a tu calendario → realiza las tareas en la semana y repite el ciclo (§9.1) |
| R2 | El calendario de Agendar es muy angosto | Un diálogo grande (`Modal` con un tamaño nuevo, `pantalla`: hasta 1.280 px y 88 % del alto), con la semana entera en dos tercios (§5.9) |
| R3 | Un chat de tareas, el mismo que ya existe: anotar algo para mí o sugerírselo a otra persona | El chat de Nexus con una pieza «tareas». Lo que es para otra persona, sea de tu equipo o de otro, le llega como propuesta y lo decide ella: así «la tiene mapeada». Solo el líder de su sprint, o un compañero del mismo espacio libre, se la asigna directo (§5.2, §6) |
| R4 | «Cerrar la semana» no se entiende | «Revisa tu semana»: cada persona contesta «¿La terminaste?» y termina agendando lo que sigue. Una semana pasada se puede revisar cuando sea (§5.8) |
| R5 | Filtrar y agrupar por cliente; lo demás es Smarteam interno o proyectos internos como SmartAgro | La tarea guarda su cliente y su proyecto de HubSpot; el ámbito (cliente · prospecto · aliado · interno · sin clasificar) se calcula. Nexus sugiere el cliente de cada línea de la reunión. SmartAgro cuenta como interno aunque la tarea no tenga proyecto. Filtro «Para quién» y página «Tareas internas por cliente» (§4) |
| R6 | Proyectos, fechas, límites, responsables y dependencias | `ProyectoDeTareas` y `TareaRelacion` en el SQL único; proyectos en 1A.1, dependencias en pantalla en 1A.2 (§2, §5.7) |
| R7 | Vincular cualquier registro del CRM | `TareaVinculo`: contactos, empresas, negocios, tickets, proyectos y objetos propios de HubSpot (pegando su enlace; con búsqueda en la fase 2), propuestas comerciales y preventas. Lo que la app de HubSpot no puede leer se dice en pantalla (§4.4) |
| R8 | «Crea un plan para hacer un onboarding a un cliente en 30 días» | El chat propone un proyecto con sus tareas, días hábiles relativos y dependencias; las fechas las calcula el código. Al aplicarlo queda como **borrador** del proyecto, que editas y activas. Un plan se guarda como plantilla y la segunda vez cuesta 0 tokens (§6.6) |
| R9 | Espacios de trabajo y proyectos, tipo ClickUp o Trello | Espacios (el de cada equipo, y los libres que crea cualquiera) → proyectos → tareas, con lista, tablero y calendario. El tablero de un proyecto se puede ordenar en **secciones propias** («Piezas · Logística · Invitados»), como las listas de Trello. En un espacio libre, los miembros se asignan tareas entre sí sin pedidos (§2, §5.3, §9) |
| R10 | Sugerir proyectos de lo conversado | La lectura de la reunión propone un proyecto cuando 3 o más líneas forman algo nuevo, desde la primera reunión del equipo; nunca dos veces el mismo. El chat también, a pedido (§7.4) |
| R11 | Que sugiera, pero que el sistema sea completo | La IA nunca escribe sola: todo lo suyo es propuesta. Sin IA, el sistema ya es completo: anotar, pedir, proyectos, secciones, dependencias, cliente, comentarios, búsqueda, agenda, tablero y revisión (§1) |
| R12 | Directo al plan y al código; retoques de diseño después | Sin otra ronda de diseño. El ensayo pasa a ser la primera prueba del código. 1A.1 se recorta a lo que usa el piloto, con fecha límite, y el chat sale enseguida, en paralelo con lo flexible (§13) |

**Siguen los pedidos de antes**: toda tarea de la semana a la agenda; los pedidos a personas de otros equipos llegan a su panel y a «Para ti», con lo decidido guardado (aceptó, más adelante, no, no es mía, venció); el arranque retroactivo con el planning del 5 oct y la retro del 9; una arquitectura que aguante años y tome lo bueno de TaskView y flowseed; cualquier reunión de Google Workspace como fuente; un inicio tipo lámina para la adopción; no duplicar («¿Es T-4?», y la tarea pasa a la semana siguiente); la IA como asistente que gasta poco; para todo Nexus (sprints de CS, Marketing y Ventas, sugerencias unos 30 min después de la reunión); asociar tareas entre sí y con clientes; partir el trabajo de un proyecto grande; configuración mínima.

## Decisiones que tomé y por qué

Las marcadas **(vetable)** son las que más cambian lo que pediste o lo ya acordado. Si alguna no te sirve, se cambia antes del código.

1. **Tres preguntas, tres lugares que no se mezclan.**
   - *¿Quién la hace y cuándo?* El responsable, su sprint (`Tarea.equipo`, el de su equipo de casa) y su semana. Es lo que se revisa el viernes y lo que pesa en la carga.
   - *¿De qué es?* Espacio → proyecto → tarea. Es dónde se ve y cómo se agrupa.
   - *¿Para quién?* Un cliente, trabajo interno, o «sin clasificar» mientras nadie lo dijo.
   Una tarea de Lidia en el proyecto «Evento SmartAgro» de un espacio libre sigue en el sprint de Marketing: Alejandra ve la carga real de Lidia, y el proyecto ve su avance.
2. **Una tarea vive siempre en el sprint de casa de su responsable (cambia v3 y v4).** Antes se quedaba en el sprint de la reunión donde se comprometió. Eso hacía que una persona tuviera tareas en dos sprints, que la líder de un equipo cerrara tareas de gente de otro y que una reunión de dos equipos (la retro de SMARKETING) dejara todo en uno solo. Ahora lo que sale de la reunión de otro equipo le llega a su sprint como pedido de ese equipo, y la líder que leyó la reunión lo sigue en «Lo pedido a otros equipos». «Por asignar» queda en el equipo de la reunión.
3. **La clave del equipo es la del área y no cambia con cuántas personas tenga** (`lib/tareas/equipos.ts`). Si Marketing pierde a una persona, sus tareas no quedan huérfanas en otra clave. Un equipo de una sola persona se **muestra** como «Tus tareas» (es el «equipo personal» de Elías en RevOps), pero guarda `revops`. La clave `persona:<correo>` queda solo para quien no tiene área o tiene una sin mapear.
4. **Un proyecto de tareas nunca es un `Project`.** El `Project` viene de HubSpot (0-970): le nacen canvases, recibe reuniones, entra a cartera y cobranza, el cliente ve su cronograma y el sync lo desactiva. `ProyectoDeTareas` lo puede **referenciar** (`projectId`, no único). En pantalla, «Proyecto» es el de tareas; el otro siempre dice «Proyecto de HubSpot», con su chip.
5. **La «tarea grande» se reemplaza por el proyecto (vetable).** T-18 «Campaña de SAP» tenía tareas de 3 personas de 2 equipos y ningún trabajo propio: es un proyecto. Se van `parentId`, «¿La sacas de la semana?», colgar con confirmación y los 2 niveles. Los pasos de una misma persona siguen dentro de la tarea.
6. **Sugerir es proponer (vetable).** Lo que le pones a otra persona nace como propuesta y lo decide ella, aunque sea de tu equipo: es lo que pediste en R3 («sugerir una tarea para una persona») y lo que dice la cola del chat. Dos excepciones, que asignan directo con aviso: el líder del sprint de esa persona, y dos miembros del mismo espacio libre (entrar a un espacio es aceptar que te asignen ahí, como en Trello). En el chat lo decide el verbo: «sugiérele» propone, «asígnale» asigna si puedes.
7. **Las dependencias van en el SQL único; su pantalla, en 1A.2** (R6). `TareaRelacion` ya no espera a la fase 3, pero el piloto no la necesita para arrancar.
8. **Cada persona revisa su semana (vetable).** Hace obvio el cierre (R4), sirve en los espacios libres y en los equipos sin líder, y termina en la agenda. La retro sigue igual: ahí la líder ve quién falta y marca con cada persona las tareas de su sprint. Una semana pasada se revisa cuando sea («Semanas sin revisar», siempre a la vista), y **lo que sigue nunca cae en una semana que ya pasó**: va a la de hoy.
9. **Revisar y agendar en el mismo diálogo grande.** `Modal` con un tamaño nuevo y aditivo, `pantalla`, en dos pasos: 1 Revisa · 2 Agenda. El calendario ocupa dos tercios. Agenda solo la dueña de las tareas, y solo en la semana de hoy o una futura. No cambia ningún otro modal. Si molesta, `Drawer xl` (media pantalla) ya existe.
10. **Tablero con columnas fijas por estado, más secciones libres (vetable).** El tablero de Mis tareas y del equipo tiene Por decidir · Pendiente · En curso · Hecha; arrastrar es una transición permitida, nunca un estado nuevo. El de un proyecto se puede agrupar además por **sección**, una lista que nombra cada proyecto y que solo agrupa. Las secciones no son estados: la revisión y las métricas siguen por estado. Eso es lo flexible de Trello (R9) sin romper el ciclo semanal.
11. **Un responsable por tarea (vetable, pregunta 1).** La agenda, el pedido, «pasó N veces» y las horas son por persona. El trabajo de varias personas son varias tareas del mismo proyecto, con dependencias si hace falta.
12. **Un solo `.sql` con todo el modelo (13 tablas).** `Tarea` no existe en producción: sumar columnas ahora no cuesta un ALTER, y se evitan dos o tres coordinaciones de DDL entre las dos PCs. Cada modelo entra al schema en el mismo commit que su SQL. Antes van los SQL pendientes de otras sesiones (§13): el schema de hoy tiene modelos sin commitear cuyas tablas pueden no estar en producción.
13. **El chat de tareas sale justo después de 1A.1, en paralelo con 1A.2 (1B).** Es el motor de los documentos con un carril propio. Propone operaciones, y las aplica una persona, todas o ninguna, por `lib/tareas/mutaciones.ts`. Un hilo por persona, con ventana. Las personas van como `M1…` en su contexto, porque `P1, P2…` ya son las etiquetas del libro de pendientes; pero en el acuerdo guardado van siempre por su id real.
14. **El ámbito se calcula, y «sin cliente» no es «interno».** Interno solo con evidencia: el proyecto de HubSpot tiene la marca `proyecto_interno`; la empresa es INTERNO (Smarteam); o todos los proyectos activos de la empresa son internos (SmartAgro, aunque la tarea no tenga proyecto). Sin empresa, la tarea es **Sin clasificar**, con «Clasificar las N» a un clic. No hay columna ni clasificador nuevo. Se usa la marca y no el estado del proyecto, para que un proyecto que HubSpot cierra no cambie el ámbito de sus tareas viejas.
15. **Las empresas que puedes elegir salen de una sola función**, `clientesQueVesParaTareas(quien)`: el mismo acceso de `requireAccessToClient` (con la preventa), de cualquier tipo, más las de Smarteam. La usan las opciones, la lectura de reuniones, el chat, los vínculos y «Por cliente». Ventas y Marketing trabajan con prospectos y aliados. Va a DECISIONS como excepción a «`kinds: all` es para una sola pantalla».
16. **En tu sprint ves lo de tu equipo, con su cliente (vetable, pregunta 9).** Lo dijiste así: cada persona ve lo suyo y lo de su equipo. Un CSE ve entonces los títulos de las tareas de las cuentas de sus compañeros, y enmascarar el chip del cliente al lado de un título que lo nombra no protegería nada. Por eso no se enmascara la fila que ves. Lo que sí se protege es lo que no es la fila: la cita y el título de una reunión de cliente, los vínculos a registros de clientes que no ves, las tareas que no ves (dependencias, sugerencias, avisos) y los espacios privados. Y existe **«Solo para mí»**: una tarea privada cuenta como horas en el sprint, pero nadie más que tú (y el Super Admin) ve su título. Es lo que necesitan Marco y Alexander Arrieta para lo de dirección.
17. **Vincular no llama a HubSpot al leer, y falla cerrado.** Se guarda una foto del registro, el portal explícito y la empresa resuelta con el mismo desempate que ya usa Nexus para las fusiones. Un registro de una empresa que no ves no se vincula (403, sin foto). Uno cuya empresa no se pudo resolver se ve enmascarado salvo para quien ve toda la cartera. La búsqueda en HubSpot va en la fase 2.
18. **Plantillas a 0 tokens (vetable).** `PlantillaDeTareas` entra en el SQL único y su pantalla sale en 1C. Una plantilla vive en el espacio del proyecto del que salió; subirla a «toda la casa» lo hace un líder o un admin.
19. **Un solo panel derecho a la vez.** Abrir el chat cierra el panel de Feedback y el cajón de la tarea, y al revés. El diálogo grande tapa el chat; al cerrarlo, el chat queda como estaba.
20. **Directo al código (R12).** El ensayo de la fase 0 pasa a ser `scripts/tareas-ensayo.ts`, que corre las funciones puras de la lectura apenas existen, sin escribir nada. Después de 1A.1 hay una vuelta de retoques sobre las pantallas que no tuvieron tablero de diseño.
21. **Un plan del chat entra como borrador (R8, R11).** Aplicar «un plan de onboarding de 30 días» crea el proyecto en estado `propuesta`, con sus tareas adentro, editable en su página y sin avisar a nadie. «Activar el plan» lo deja activo y recién ahí reparte las tareas (las de otros, como propuestas). Así un plan de 15 tareas se revisa entero antes de que le llegue a nadie.
22. **Comentarios y búsqueda entran (R11).** Un sistema completo necesita dónde conversar sobre un pedido y cómo encontrar una tarea. Va la tabla `TareaComentario` en el SQL único y un buscador por texto y por T-#. Los adjuntos esperan a la fase 2.
23. **Donde la revisión chocó con tu pedido, ganó tu pedido.**
    - Pediste crear subtareas en un proyecto grande y saber que se le sumaron tareas: es un proyecto, con su avance y «se sumaron N esta semana».
    - Pediste que la IA gaste poco, y ahora hay un chat con Sonnet: lo automático sigue en Haiku (centavos por semana) y el chat tiene tope por turnos, ventana de historia, pensamiento bajo, plantillas a 0 tokens y «+ Tarea» sin IA. Los costos se miden antes de prometerlos.
    - El piloto ya no se lee a 0 tokens: para sugerir «Campaña de SAP» (R10) se llama a Haiku una vez (unos US$0,003).
    - Pediste toda tarea a la agenda: lo de la semana va a la agenda; lo que todavía no tiene semana (más adelante, por asignar, el pendiente de un proyecto) no pide bloque hasta que entra a una semana.
    - Pediste que cada persona vea lo de su equipo: se mantiene, aunque el enmascarado del cliente deje de existir dentro del sprint (decisión 16).

**Lo que no cambia de v3**: una tarea es una fila de la propuesta a la lápida · estados como texto con catálogo · `donde.ts` · decidir con `WHERE estado='propuesta' AND version=?` · `TareaEvento` de solo agregar · `ResultadoDeSemana` solo por `anotarResultado()` · la semana es el lunes de la tarea y la elige `semanaDestino()` · nada se borra · los pedidos con lo decidido guardado · la lectura por niveles (código, Haiku, conversación) y sus topes · «¿Te refieres a esta?» y las lápidas de 28 días · un bloque por tarea con `getAgendaWriteAuth` y `esBloqueDeTarea` · los lectores nuevos del chokepoint · el piloto retroactivo · la configuración del equipo es solo qué reuniones lee Nexus. **Cambia** de v3: una tarea ya no vive en el sprint de la reunión, sino en el de casa de su responsable.

### Lo que cambió con la revisión (9 oct), en corto

- El único de propuestas lleva el cliente y quién pidió: dos pedidos iguales de dos personas, o para dos clientes, ya no se funden.
- La cita de una reunión se ve con la regla del chokepoint al leerla, vive en columnas propias y nunca va en la bitácora suelta ni al chat.
- Lo vencido tiene su propio estado y no es lápida.
- El chat guarda los acuerdos con ids reales, manda una ventana de la historia, escribe el desenlace en la misma transacción y tiene un carril propio por pieza.
- Los proyectos sugeridos no se repiten de una semana a otra.
- El dueño de una línea sale solo del corchete; un nombre en el detalle es una mención.
- Los bloques de agenda guardan en qué calendario están, son privados y solo los mueve su dueña.
- 1A.1 se recorta y tiene fecha límite.

### Qué se toma de flowseed, de TaskView y de Trello

| De | Se toma | No se toma, y por qué |
|---|---|---|
| flowseed | `proposedSubtasks` → el proyecto que propone la lectura, con sus tareas · `Source` NOTE/FILE → «Pegar notas o subir un documento» (fase 2) · `editedByUser` → la decisión `con_cambios` · `sourceExcerpt` → `cita` · `Task.position` (índice fraccional) → `Tarea.orden` · `Theme.isProject` → `ProyectoDeTareas` · `Label` → etiquetas, como texto · su bug de `rejectProposal` sin filtro de estado → decidir con `WHERE estado='propuesta' AND version=?` | El chat que crea tareas directo: acá propone y aplica una persona (R11) |
| TaskView | La ficha completa de una tarea · comentarios en la tarea · el tablero de columnas fijas · espacios con miembros (sus «organizaciones», sin permisos propios) · separar qué acciones habilita cada permiso | Estados configurables y permisos por proyecto: piden configuración que no quieres y rompen el ciclo semanal |
| Trello | Las listas propias de cada tablero → las secciones de un proyecto · asignar entre miembros del tablero sin pedir permiso | Automatizaciones y campos personalizados |

---

## 1. Idea central

**El ciclo, en cuatro pasos** (es también el texto del inicio):

1. **Ten tus reuniones con tu equipo.** El planning del lunes y la retro del viernes, como siempre, con las notas de Gemini encendidas.
2. **Nexus propone las tareas y tú las aceptas.** Después de la reunión te llega lo tuyo: Usar · Cambiar · Más adelante · Descartar · ¿Es esta? Si varias líneas forman algo nuevo, propone un proyecto. Nada entra solo.
3. **Agrégalas a tu calendario.** Cada tarea en su propio bloque de Google Calendar. Nexus te propone el horario.
4. **Realiza las tareas en la semana y repite el ciclo.** El viernes revisas tu semana: lo que no terminaste pasa a la siguiente, sin duplicarse, y la agendas ahí mismo.

Fuera del ciclo, cuando quieras: anotas una tarea en una línea, le sugieres algo a otra persona, creas un proyecto o le pides un plan al chat. Todo cae en la semana de alguien, o en el pendiente de un proyecto hasta que alguien lo ponga en una semana.

**Los principios**:

- Una tarea es una sola fila, de la propuesta a la lápida. Aceptar una sugerencia le cambia el estado y no crea otra fila, así que no se puede aprobar dos veces.
- Todo lo que no anotas tú para ti llega como propuesta, y decide una persona.
- Los números (fechas, semanas, horarios, quién decide, si se parece a otra tarea) los calcula el código. La IA elige de listas cerradas.
- La IA gasta por capas: el código (0 tokens) · Haiku al leer una reunión (centavos por semana) · Sonnet solo cuando alguien le escribe al chat, con tope.
- Sin IA el sistema ya es completo: anotar, pedir, proyectos, secciones, dependencias, cliente, comentarios, búsqueda, agenda, tablero y revisión.

---

## 2. Modelo de datos

Reglas de la casa:

- Estados y tipos como **texto**, cada uno con su catálogo puro (`lib/tareas/estados.ts`). Un valor que el código no conoce se lee como el más visible.
- Personas por **correo y sin FK**, como en `Aviso`. No se toca `TEAM_MEMBER_SAFE_SELECT`.
- Toda FK con `@relation` y `onDelete` explícito (§2.3, `punteros-al-borrar.test.ts`). Abajo se muestran solo los campos. Las relaciones inversas en `Client`, `Project`, `BusinessCase`, `ExploracionDeVenta`, `FirefliesSession` y `AgentRun` no llevan SQL.
- Las fotos que no deben cambiar si se borra el registro van como texto sin FK, con un nombre que no termina en `Id` y su razón comentada (§2.3).
- Sección «Tareas internas» de `prisma/schema.prisma`, con un comentario de una línea por modelo.
- **Todos los modelos entran al schema en el mismo commit que `scripts/sql/2026-10-XX-tareas.sql`**, el único SQL del módulo, con `git add -p` (solo la sección «Tareas internas»). `/api/health` compara el cliente Prisma contra la base: un modelo sin su tabla da 503 y el deploy se revierte.

```prisma
// ─── Tareas internas ─────────────────────────────────────────────────────────

/// Dónde vive el trabajo: el espacio de un equipo (miembros por área) o uno libre que crea cualquiera.
model EspacioDeTareas {
  id             String    @id @default(cuid())
  tipo           String    // equipo | libre
  equipo         String?   @unique // solo «equipo»: clave de lib/tareas/equipos.ts. En Postgres los NULL no chocan
  nombre         String    // «Marketing» · «Tus tareas» · «Evento SmartAgro 2026»
  icono          String?   // clave del set de SelectorDeIcono; null = el del tipo
  visibilidad    String    @default("miembros") // miembros | todos (solo cuenta en uno libre)
  creadoPorEmail String    // "sistema" en los de equipo: los crea asegurarEspacio() (upsert por equipo)
  version        Int       @default(0)
  archivadoAt    DateTime? // nada se borra
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
// SQL: CHECK (("tipo" = 'equipo') = ("equipo" IS NOT NULL))

/// Quién está en un espacio LIBRE. Los de equipo no tienen filas: sus miembros salen del área.
model MiembroDeEspacio {
  espacioId        String   // FK Cascade
  email            String
  rol              String   @default("miembro") // admin | miembro
  agregadoPorEmail String
  createdAt        DateTime @default(now())
  @@id([espacioId, email])
  @@index([email])
}

/// Un proyecto de tareas internas («Campaña de SAP»). NO es un Project de HubSpot: a lo sumo lo referencia.
model ProyectoDeTareas {
  id               String    @id @default(cuid())
  espacioId        String    // FK Restrict: un espacio se archiva, no se borra
  nombre           String
  huella           String    // el nombre normalizado: un proyecto propuesto no se vuelve a proponer
  descripcion      String?   @db.Text
  estado           String    @default("activo") // propuesta | activo | en_pausa | terminado | descartado
  responsableEmail String?   // nullable porque un proyecto propuesto todavía no tiene dueño
  iniciaEl         DateTime? @db.Date // el ancla de los «día hábil N» de un plan
  venceEl          DateTime? @db.Date
  clientId         String?   // nullable: para quién; sus tareas lo heredan (SetNull)
  projectId        String?   // nullable, NO único: el proyecto de HubSpot al que sirve; invariante project.clientId == clientId (SetNull)
  secciones        String[]  @default([]) // el orden de las secciones de su tablero (texto libre normalizado); agrupan, no son estados
  etiquetas        String[]  @default([])

  origen           String    // mano | reunion | chat | plantilla
  creadoPorEmail   String?   // nullable porque null = lo propuso Nexus desde una reunión
  lecturaId        String?   // nullable: la lectura que lo sugirió (SetNull)
  sessionId        String?   // nullable: la reunión de origen; se lee SOLO por el chokepoint (SetNull)
  cita             String?   @db.Text // las líneas literales que lo respaldan; se ve con la regla de §3
  plantillaId      String?   // nullable: de qué plantilla salió (SetNull)
  origenId         String?   @unique  // «g:<lecturaId>:<grupo>» o «c:<turnoId>:<i>»: volver a leer o a aplicar no duplica

  decision         String?   // solo si nació propuesta: tal_cual | con_cambios | rechazada | misma | vencida
  decididaPorEmail String?
  decididaAt       DateTime?
  motivo           String?

  version          Int       @default(0)
  archivadoAt      DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@index([espacioId, estado])
  @@index([responsableEmail, estado])
  @@index([clientId])
  @@index([projectId])
}
// SQL: CHECK (cardinality("etiquetas") <= 5) · CHECK (cardinality("secciones") <= 12)
//      UNIQUE parcial ("espacioId", "huella") WHERE "estado" = 'propuesta'

/// Un plan que se repite («Onboarding en 30 días»): tareas con días hábiles relativos y dependencias. Usarlo no gasta IA.
model PlantillaDeTareas {
  id              String    @id @default(cuid())
  nombre          String
  descripcion     String?   @db.Text
  espacioId       String?   // el del proyecto de origen; null = de toda la casa, solo lo pone un líder o un admin (SetNull)
  duracionDias    Int       // días hábiles
  tareas          Json      // v1, validado con Zod: [{ref, titulo, dia, minutos?, prioridad?, seccion?, para: "responsable"|null, despuesDe?: [ref], etiquetas?}], tope 40
  desdeProyectoId String?   // nullable (SetNull)
  creadaPorEmail  String
  version         Int       @default(0)
  archivadaAt     DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  @@index([espacioId, archivadaAt])
}

/// Tarea interna: desde que alguien (o Nexus) la propone hasta que se cierra. Nunca llega al cliente ni al cronograma.
model Tarea {
  id               String    @id @default(cuid())
  numero           Int       @unique @default(autoincrement()) // «T-128», como F-128 en Feedback
  titulo           String
  huella           String    // hash del texto normalizado ENTERO: solo iguala textos idénticos
  notas            String?   @db.Text
  pasos            Json?     // [{texto, hecho}]: pasos de la misma persona (no son tareas)
  etiquetas        String[]  @default([]) // normalizadas con el molde de normalizeGastoTag
  estado           String    @default("pendiente") // propuesta | pendiente | en_curso | hecha | no_se_hara | rechazada | fusionada | vencida
  prioridad        String    @default("media")     // alta | media | baja
  tipo             String    @default("puesto")    // puesto | apoyo
  privada          Boolean   @default(false)       // «Solo para mí»: en el sprint cuenta como horas, sin título
  seccion          String?   // la sección de su proyecto en el tablero; agrupa, no es estado
  orden            Float?    // orden a mano en una columna del tablero; null = por prioridad

  equipo           String?   // el sprint: el equipo de CASA del responsable; sin responsable, el de la lectura («Por asignar»). Null solo en un proyecto de un espacio libre, sin responsable
  responsableEmail String?   // nullable porque null = «Por asignar» del equipo, o «Sin responsable» del proyecto
  semana           DateTime? @db.Date // lunes en hora CR, siempre por semanaDestino(); null = sin semana (más adelante, por asignar, pendiente del proyecto)
  venceEl          DateTime? @db.Date
  minutosEstimados Int?      // null = sin estimar: nunca se cuenta como 60
  completadaAt     DateTime? // se escribe SOLO al pasar a hecha

  proyectoId       String?   // nullable: sin proyecto vive en el espacio de su equipo (Restrict: los proyectos se archivan)
  clientId         String?   // nullable: para quién; denormalizado para filtrar y mudar (SetNull)
  projectId        String?   // nullable: proyecto de HubSpot; invariante project.clientId == clientId (SetNull)

  origen           String    // mano | pedido | reunion | notas | chat | plantilla (no cambia: es la métrica «cómo entran»)
  creadaPorEmail   String?   // nullable porque null = la propuso Nexus
  pedidaPorEmail   String?   // quien la pidió o sugirió; en lo de otro equipo que sale de una reunión, quien leyó la reunión
  pedidaPorEquipo  String?   // el equipo que la pidió, si no es el suyo
  pedidaPorTexto   String?   // fuente externa («HubSpot», un cliente) o la reunión («Sprint planning de marketing»)
  lecturaId        String?   // nullable: solo si salió de una lectura (SetNull)
  sessionId        String?   // nullable: la reunión de origen; se lee SOLO por el chokepoint (SetNull)
  origenTitulo     String?   // copia del título de la reunión, SIN enmascarar: lo enmascara serializar.ts al leer
  cita             String?   @db.Text // la línea literal de la reunión; se ve con la regla de §3
  origenId         String?   @unique  // «l:<lectura>:<huella de la línea>» · «c:<turno de origen>:<i>» · «p:<proyecto>:<ref>»: repetir no duplica
  mismaQueId       String?   // nullable: en una propuesta, la que Nexus cree que es; en una fusionada, en la que quedó (SetNull)

  decision         String?   // solo propuestas: tal_cual | con_cambios | mas_adelante | rechazada | misma | retirada | vencida
  decididaPorEmail String?   // correo | "sistema"
  decididaAt       DateTime?
  motivo           String?

  agendaEstado       String    @default("sin_agendar") // sin_agendar | agendada | ya_no_esta (este último desde 1C)
  agendaInicio       DateTime? // el inicio del primer bloque
  agendaBloques      Json?     // [{calendario, eventoId, inicio, fin}]: calendario = correo de la dueña del bloque
  agendadaAt         DateTime?
  agendaVerificadaAt DateTime? // la usa la verificación de 1C

  version          Int       @default(0) // PATCH con otra versión → 409
  archivadaAt      DateTime? // nada se borra
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@index([responsableEmail, estado])
  @@index([equipo, semana, estado])
  @@index([proyectoId, estado])
  @@index([clientId, completadaAt]) // «qué le hicimos a X en septiembre»
  @@index([projectId])
  @@index([pedidaPorEmail, estado]) // «Lo que pediste»
  @@index([creadaPorEmail])
  @@index([sessionId])
  @@index([mismaQueId])
  @@index([lecturaId])
  @@index([huella])
}
// SQL: CHECK (("estado" = 'hecha') = ("completadaAt" IS NOT NULL))
//      CHECK ("equipo" IS NOT NULL OR ("proyectoId" IS NOT NULL AND "responsableEmail" IS NULL))
//      CHECK ("responsableEmail" IS NOT NULL OR "semana" IS NULL)
//      CHECK (cardinality("etiquetas") <= 5)
//      UNIQUE parcial (coalesce("responsableEmail", "equipo", "proyectoId"), coalesce("clientId", ''), coalesce("pedidaPorEmail", ''), "huella") WHERE "estado" = 'propuesta'
//      índice parcial ("responsableEmail", "semana") WHERE "estado" IN ('pendiente','en_curso') AND "archivadaAt" IS NULL

/// Relación entre dos tareas. Pivote N:N (§2.5).
model TareaRelacion {
  desdeId        String   // FK Cascade
  haciaId        String   // FK Cascade
  tipo           String   // bloquea (desde bloquea a hacia; sin ciclos) | relacionada (par ordenado desdeId < haciaId)
  creadaPorEmail String
  createdAt      DateTime @default(now())
  @@id([desdeId, haciaId, tipo])
  @@index([haciaId])
}
// SQL: CHECK ("desdeId" <> "haciaId") · CHECK ("tipo" <> 'relacionada' OR "desdeId" < "haciaId")

/// Un comentario en una tarea. Lo ve quien ve la tarea. No se borra: se archiva.
model TareaComentario {
  id          String    @id @default(cuid())
  tareaId     String    // FK Restrict
  autorEmail  String
  cuerpo      String    @db.Text // tope 4.000 caracteres
  editadoAt   DateTime?
  archivadoAt DateTime?
  createdAt   DateTime  @default(now())
  @@index([tareaId, createdAt])
}

/// Un registro vinculado a una tarea o a un proyecto: algo de HubSpot, una propuesta comercial o una preventa. Es una referencia: no sincroniza.
model TareaVinculo {
  id                      String    @id @default(cuid())
  tareaId                 String?   // dueño, exactamente uno (Cascade)
  proyectoId              String?   // dueño, exactamente uno (Cascade)
  hubspotPortalId         String?   // el portal SIEMPRE explícito (lib/hubspot/urls.ts)
  hubspotObjeto           String?   // 0-1 contacto · 0-2 empresa · 0-3 negocio · 0-5 ticket · 0-970 proyecto · 2-… propio
  externalHubspotRecordId String?   // id externo con prefijo (§2.3)
  businessCaseId          String?   // propuesta comercial (Cascade)
  exploracionId           String?   // preventa, solo DE_LA_PREVENTA (Cascade)
  etiqueta                String    // FOTO del nombre al vincular; sin correo ni teléfono
  detalle                 String?   // FOTO: tipo y etapa («Negocio · Propuesta enviada»), sin montos
  empresaResuelta         String    @default("pendiente") // cliente | ninguno | ambiguo | pendiente: solo «cliente» se muestra fuera de quien ve toda la cartera
  clientId                String?   // la empresa del registro, resuelta al vincular con elegirCandidato (SetNull)
  projectId               String?   // si es un 0-970 espejado en Nexus: su nombre vivo (SetNull)
  fotoAt                  DateTime  @default(now())
  ausenteAt               DateTime? // HubSpot respondió 404 al refrescar
  creadoPorEmail          String
  createdAt               DateTime  @default(now())
  @@index([tareaId])
  @@index([proyectoId])
  @@index([hubspotObjeto, externalHubspotRecordId])
  @@index([clientId])
  @@index([projectId])
  @@index([businessCaseId])
  @@index([exploracionId])
}
// SQL: CHECK (num_nonnulls("tareaId", "proyectoId") = 1)
//      CHECK (num_nonnulls("externalHubspotRecordId", "businessCaseId", "exploracionId") = 1)
//      CHECK (("externalHubspotRecordId" IS NULL) = ("hubspotObjeto" IS NULL) AND ("externalHubspotRecordId" IS NULL) = ("hubspotPortalId" IS NULL))
//      UNIQUE parcial (coalesce("tareaId","proyectoId"), coalesce("hubspotObjeto",''), coalesce("externalHubspotRecordId","businessCaseId","exploracionId"))

/// Bitácora de solo agregar de una tarea o de un proyecto. La escribe SOLO lib/tareas/mutaciones.ts, en la misma transacción.
model TareaEvento {
  id         String   @id @default(cuid())
  tareaId    String?  // exactamente uno de los dos (Restrict)
  proyectoId String?  // (Restrict)
  tipo       String   // propuesta | creada | editada | asignada | no_es_mia | estado | semana | decidida | mencionada | proyecto | dependencia | vinculo | agenda | sugerido_cierre | revisada | cierre_corregido
  porEmail   String   // correo | "sistema" | "agente". Lo aplicado desde el chat va con el correo de la persona
  sessionId  String?  // la reunión de una mención o de una sugerencia de cierre (SetNull)
  cita       String?  @db.Text // la línea de esa reunión; columna propia, NUNCA dentro de datos
  datos      Json     // { campo, desde, hacia, nombreDicho?, hiloId?, turnoId?, linea? }: sin citas ni texto de reuniones
  createdAt  DateTime @default(now())
  @@index([tareaId, createdAt])
  @@index([proyectoId, createdAt])
  @@index([porEmail])
  @@index([sessionId])
}
// SQL: CHECK (num_nonnulls("tareaId", "proyectoId") = 1)

/// Qué pasó con una tarea en una semana: la retro, el contador de pases y las métricas. La escribe SOLO anotarResultado().
model ResultadoDeSemana {
  tareaId           String   // FK Restrict
  semana            DateTime @db.Date
  equipo            String?  // foto: el sprint de esa semana
  responsableEmail  String?  // foto
  fotoCliente       String?  // foto: el id del cliente como texto, SIN FK a propósito: si el cliente se borra, el pasado no cambia
  fotoClienteNombre String?
  fotoAmbito        String   // foto: cliente | prospecto | aliado | interno | sin_clasificar
  fotoAmbitoNombre  String?  // «Interno · SmartAgro»
  proyectoId        String?  // foto del proyecto de tareas (Restrict)
  venceEl           DateTime? @db.Date // foto: un «sigue» con venceEl posterior al viernes de esa semana no cuenta como pase
  resultado         String   // hecha | pasa | mas_adelante | no_se_hara
  decididoPor       String   // correo | "sistema"
  decididoAt        DateTime @default(now())
  minutosEstimados  Int?     // foto
  @@id([tareaId, semana])
  @@index([equipo, semana])
  @@index([responsableEmail, semana])
  @@index([fotoCliente, semana])
  @@index([proyectoId, semana])
}

/// La revisión de la semana de UNA persona. La escribe ella, su líder (solo si no le queda nada abierto en esa semana en otro sprint) o el sistema.
model CierreDeSemana {
  id           String   @id @default(cuid())
  personaEmail String
  semana       DateTime @db.Date
  cerradaPor   String   // la misma persona | su líder | "sistema"
  cerradaAt    DateTime @default(now())
  @@unique([personaEmail, semana])
  @@index([semana])
}

/// Cada reunión (o texto pegado) se lee UNA vez para tareas.
model LecturaDeReunion {
  id              String    @id @default(cuid())
  sessionId       String?   @unique  // nullable porque en la fase 2 se pueden pegar notas (Cascade)
  texto           String?   @db.Text // solo sin sessionId: notas pegadas o un documento subido (fase 2)
  huellaTexto     String?            // md5 del transcript normalizado, o del resumen; null con menos de 200 caracteres
  copiaDeId       String?            // la lectura gemela que sí se leyó (SetNull)
  fuenteId        String?            // la fuente que la disparó, desde 1C (SetNull)
  equipo          String             // el de la lectura: recibe «Por asignar» y figura como «pedida por» en lo de otros equipos
  rol             String             // planning | cierre | ambos
  semana          DateTime  @db.Date // a dónde van las propuestas
  semanaQueCierra DateTime? @db.Date // solo en cierre o ambos
  estado          String    @default("leyendo") // en_espera | leyendo | lista | sin_texto | copia | error | sin_ia
  procesarDesde   DateTime?          // 1C
  intentos        Int       @default(0)
  leyendoDesde    DateTime?          // más de 10 min leyendo = colgada
  modo            String?            // codigo | haiku | transcript | sin_ia
  avisar          Boolean   @default(true) // false en lo retroactivo de más de 7 días, salvo «Avisar igual»
  pedidaPorEmail  String?            // null = automática
  agentRunId      String?            // SetNull
  resumen         Json?              // { lineas, propuestas, proyectos, preguntas, omitidas:{lapida,copia} }: sale SOLO por serializar.ts
  error           String?   @db.Text
  leidaAt         DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  @@index([estado, procesarDesde])
  @@index([huellaTexto])
  @@index([pedidaPorEmail, createdAt])
}
// SQL: CHECK (num_nonnulls("sessionId", "texto") >= 1)

/// Una reunión recurrente que Nexus lee cada semana (desde 1C). Sin filas, nada se lee solo.
model FuenteDeTareas {
  id            String   @id @default(cuid())
  equipo        String?  // null = fuente personal («súmala para mí»)
  duenoEmail    String   // el job lee COMO esta persona
  serie         String   // base del googleEventId (antes del «_»)
  titulo        String   // título normalizado: respaldo si la serie cambia o se duplica
  rol           String   // planning | cierre | ambos
  diaSemana     Int?     // 1 = lunes: el job solo consulta en su ventana
  finHora       String?  // «10:30», hora CR
  activa        Boolean  @default(true) // false = pausada
  pausadaMotivo String?  // «El organizador ya no está en Smarteam»
  createdAt     DateTime @default(now())
  @@index([serie])
}
// SQL: UNIQUE parcial (coalesce("equipo", "duenoEmail"), "serie") WHERE "activa"
```

**El SQL**:

- crea las 13 tablas con sus FK idempotentes, los CHECK, los únicos parciales y los índices;
- `ENABLE ROW LEVEL SECURITY` + `deny_all_non_superuser AS RESTRICTIVE` en cada tabla (molde: `scripts/sql/2026-10-05-preguntas-de-tiempo.sql`);
- no inserta datos: los espacios de equipo los crea `asegurarEspacio()` al primer uso (`upsert` por `equipo`, que es `@unique`);
- no tiene `DROP`;
- termina con su consulta de verificación.

**`HiloDeChat` no lleva SQL.** Su índice `[projectId, pieza, usuarioEmail]` sirve con `projectId IS NULL`. Cambia su comentario: «como mucho uno de los tres; ninguno = hilo personal de tareas».

Antes del deploy: los SQL pendientes de otras sesiones, este SQL, `npx prisma generate` y `npm run check:esquema` en verde, sin nada que falte (§13).

### Estados (`lib/tareas/estados.ts`)

| estado | qué es | columna del tablero |
|---|---|---|
| `propuesta` | por decidir: la dejó Nexus, te la sugirió alguien o te la pidió otro equipo | Por decidir (solo la arrastra quien decide) |
| `pendiente` | aceptada, sin empezar | Pendiente |
| `en_curso` | empezada | En curso |
| `hecha` | terminada, con `completadaAt` | Hecha |
| `no_se_hara` | descartada después de aceptarla, con motivo | fuera, con «Ver las N» |
| `vencida` | nadie la decidió en 14 días. **No es lápida**: se puede volver a proponer | nunca |
| `rechazada` · `fusionada` | lápidas, solo si las decidió una persona (`decision` rechazada o misma, `decididaPorEmail` ≠ sistema): un texto idéntico no se vuelve a proponer por 28 días. «Retirada» por quien la pidió no es lápida | nunca |

- Las transiciones salen de `accionesDe(tarea, quien)`, que es pura. La UI pinta los botones y permite arrastrar desde ahí.
- `nacePropuesta(creador, responsable, contexto)` da `false` solo si la tarea es para quien la crea, si quien la crea es líder del sprint del responsable (`puedeLiderar`), o si los dos son miembros del espacio libre del proyecto. En cualquier otro caso (Nexus, un compañero, otro equipo) nace propuesta y avisa. «Por asignar» de tu equipo nace aceptada.
- Un `ProyectoDeTareas` tiene sus propios estados: `propuesta` (lo sugirió una reunión, el chat armó un plan, o el chat lo propuso en un espacio donde no decides) → `activo` o `descartado`; `activo` ↔ `en_pausa`; `activo` → `terminado`. Las tareas de un proyecto en `propuesta` no salen en el «Por decidir» de nadie ni avisan hasta que se activa.

### Qué se guarda y qué se calcula al leer

| Se guarda | Se calcula al leer |
|---|---|
| estado, semana, responsable, sprint, proyecto, sección, cliente, quién pidió, si es privada | **espacio** de la tarea: el de su proyecto o, sin proyecto, el de su equipo (`enEspacioWhere`) · **ámbito** (§4.1) · **atrasada**: `venceEl` anterior a `hoyEnCostaRica()` y abierta |
| decisión de cada propuesta, con quién y cuándo (`tal_cual` o `con_cambios` sale de comparar lo propuesto con lo aceptado) | **veces que pasó**: las filas `pasa` que decidió una persona, sin contar las de una tarea que todavía no vencía (`venceEl` posterior al viernes de esa semana); aviso desde 3. Los pases del sistema se ven como «sin revisar hace N semanas» |
| resultado de cada semana, con la foto del cliente, del ámbito y del proyecto | **avance** de un proyecto: hechas sobre el total (sin propuestas ni lápidas) y «se sumaron N esta semana» |
| la revisión de cada persona (`CierreDeSemana`) | **semana del equipo revisada**: todas las tareas del sprint en esa semana tienen su resultado · **semanas sin revisar** de una persona |
| dependencias | **esperando a**: una `bloquea` hacia ella que no está hecha · **atrasada por otra**: la que la bloquea está en una semana posterior |
| foto de cada vínculo, con su empresa resuelta | **«Cerrado en HubSpot»**: el `Project` ligado ya no es clasificable (`esProyectoClasificable`) |
| bitácora, comentarios y agenda | **horas** por persona contra `horasDisponibles()` de `lib/carga/config.ts`, con las sin estimar aparte («+3 sin estimar») · **métricas** (`lib/tareas/metricas.ts`, puro) |

### Equipos, espacios y líder

- **Equipos** (`lib/tareas/equipos.ts`): salen de `lib/sessions/areas.ts`, que pasa a tener también el catálogo de áreas (`AREA_OPTIONS` se muda de `components/team/roles-ui.ts` a `lib`, y components lo importa de ahí). Claves: `marketing`, `cs`, `ventas`, `desarrollo`, `admin`, `revops` y `pm`. Se excluyen `esCuentaDePrueba` y las bajas. La clave es la del área **aunque el equipo tenga una sola persona**; un equipo de una persona se muestra como «Tus tareas». Solo sin área, o con un área sin mapear, se usa `persona:<correo>`. Solo **lee** el área.
- **Espacio de equipo**: `asegurarEspacio(clave)` hace el `upsert` por `equipo` la primera vez que hace falta. Se llama como el equipo.
- **Espacio libre**: lo crea cualquier persona de adentro («Evento SmartAgro 2026», «Rediseño del sitio»), con nombre, ícono, miembros y quién lo ve (sus miembros o todo Smarteam). Crearlo crea su primer proyecto con el mismo nombre: en un espacio libre toda tarea vive en un proyecto (como en ClickUp y Trello). No hay nada más que configurar.
- **Líder**: quien tiene `tareas.manage` por override explícito en /team y es miembro de ese equipo. Es la única fuente del líder de un sprint; el frente `LIDERAR_CS` de «Para ti» es otra cosa (alertas de cartera) y queda escrito en DECISIONS. Un equipo puede no tener líder. El SUPER_ADMIN puede actuar en cualquiera, pero no recibe los pendientes ni los avisos de líder.
- **Si una persona cambia de área**, el job del lunes muda sus tareas abiertas al sprint de su equipo nuevo, con su evento. Si un equipo se queda sin miembros activos, sus tareas abiertas pasan a «Por asignar» del equipo y el invariante lo dice.

### Las reglas que hace cumplir `lib/tareas/mutaciones.ts` (el único escritor)

- **`semanaDestino(persona, deseada)`**: la primera semana que esa persona no revisó, desde la deseada en adelante. Sin responsable no hay semana: «Por asignar» y lo «Sin responsable» de un proyecto quedan con `semana = null`, y la semana se calcula al asignar.
  - **Lo que sigue nunca cae en el pasado**: «Sigue», «Es esa», `moverDeSemana` y «Más adelante, a partir del…» usan como deseada `max(deseada, lunes de hoy)`.
  - **Aceptar** conserva la semana de la propuesta mientras esa semana no haya terminado. Si ya terminó, va a la de hoy, salvo que la propuesta salga de una reunión cuya semana la persona todavía no revisó: es el caso del piloto retroactivo, donde la retro todavía puede decir cómo fue.
- **`anotarResultado(tarea, W, resultado, quien)`**: es la única que escribe `ResultadoDeSemana`, en la misma transacción que el cambio de la tarea, con la foto del cliente, del ámbito, del proyecto y de `venceEl`.
  - Mientras la persona no revisó W, la fila se reemplaza.
  - Si la revisó ella, la puede corregir durante 7 días o hasta que revise la semana siguiente (evento `cierre_corregido`). Cualquier otra persona recibe 409.
  - Lo que marcó su líder no es candado para ella: lo cambia con la misma corrección.
  - Si la revisó el sistema, la corrigen ella o su líder encima.
- **`moverDeSemana(tarea, destino)`**: si la semana de origen es anterior y no está revisada, escribe `pasa` para esa semana.
- **El «para quién» se rellena hacia abajo.** Quien crea elige lo más específico (un proyecto, un proyecto de HubSpot o solo el cliente) y el resto se completa:
  - una tarea en un proyecto con cliente o proyecto de HubSpot hereda los dos y no puede tener otros;
  - con `projectId`, `clientId = project.clientId`;
  - mover una tarea a otro proyecto pregunta si cambia el cliente;
  - **cambiar el cliente de un proyecto lo cambia en todas sus tareas**, en la misma transacción y con su evento.
- **Dependencias**: rechaza ciclos (recorrido en profundidad sobre `bloquea`, con tope de 200 nodos). Pueden cruzar personas, equipos y clientes: no son una fusión. No mueven nada solas.
- **Proyectos**: uno propuesto se decide con `WHERE estado='propuesta' AND version=?`, igual que una tarea. Antes de crear uno propuesto se busca otro con la misma huella o parecido en el mismo espacio (§7.4).
- **Agenda**: cada bloque guarda su calendario. Solo la dueña del calendario mueve o borra un bloque, con su clic. Si otra persona cambia la semana o el responsable, la tarea queda `sin_agendar`, el bloque sigue donde está y la dueña recibe un aviso con «Quitar el bloque». No pregunta nada si el bloque ya cae dentro de la semana nueva y el dueño es el mismo.
- **Fusionar nunca cruza clientes**: rechaza juntar dos tareas con `clientId` distinto y no nulo. «Es esa» sobre una tarea sin cliente le pone el cliente de la reunión, y la tarjeta lo dice («y queda para kölbi»).
- **P2002 en el único parcial de propuestas** (al crear o al reasignar): no da 500. Como la clave lleva el cliente y quién pidió, solo choca con una propuesta para la misma persona, del mismo cliente y del mismo pedido: le suma la cita como evento `mencionada`. Todo lo demás va aparte.
- **Fechas**: `lunesDeFecha` para las columnas `@db.Date`, `lunesDe` para la hora de una reunión (`lib/carga/semana.ts`) y `hoyEnCostaRica()` (`lib/exploraciones/fechas.ts`) para «atrasada» y «vence». Nunca `new Date()`, porque el contenedor corre en UTC. La regla queda escrita en `lib/tareas/semana.ts`.
- **Las transacciones grandes** (aplicar un plan, revisar una semana) declaran `{ timeout, maxWait }`, como las aplicaciones grandes del cronograma y de cobranza. Lo que llama a HubSpot va antes de abrirlas.
- **Nunca** escribe `Project`, `Client`, `TimelineTask` ni nada en HubSpot.

---

## 3. Quién ve qué y quién administra

**Qué tareas ves** (`lib/tareas/visibilidad.ts`, `tareasVisiblesWhere(quien)`, una sola regla por fila):

- lo tuyo: eres responsable, la creaste, la pediste o te la pidieron;
- lo de tu sprint (`equipo` ∈ tus equipos), incluido «Por asignar», **menos** las privadas de otros y las de proyectos de espacios libres de «solo miembros» donde no estás. Esas son **filas opacas**: en la Semana del equipo se ven como «Tarea privada · 1 h» o «Tarea de un espacio privado · 2 h», cuentan como horas y no muestran título, cliente ni proyecto;
- lo de los proyectos de los espacios donde estás: el de tu equipo, los libres donde eres miembro y los libres que ve «todo Smarteam»;
- el SUPER_ADMIN, todo. Pero el contexto del chat y «Para ti» se recortan igual a lo suyo y a sus espacios: si no, a Elías le llegaría toda la casa.

**Qué proyectos ves**: los de los espacios que ves, y aquellos de los que eres responsable. Si solo tienes una tarea en un proyecto, ves su nombre en tu tarea, y en su cajón ves solo las tareas que puedes ver («Campaña de SAP (Marketing) · ves 1 de 4»). El cajón, la página, el chip del chat, el chip del cliente y, en la fase 2, la ficha del cliente filtran las tareas con `tareasVisiblesWhere`. Un test por cada uno de esos caminos.

**El cliente de las filas que ves (decisión 16)**: en tu sprint ves lo de tu equipo con su cliente, porque así lo decidiste. No se enmascara el chip de una fila que ves: al lado de un título que nombra al cliente, no protegería nada. Un test lo deja escrito: un CSE sin la cuenta ve el título en su sprint, y **no** ve la cita, el título de la reunión del cliente ni el detalle de un vínculo.

**Lo que sí se protege** (`lib/tareas/serializar.ts`, un solo serializador, con `clientesQueVesParaTareas(quien)` calculado UNA vez por pedido):

- **La cita y el título de una reunión**: en una reunión de puertas adentro (sin cliente dueño, o con dueño INTERNO) los ven quien estuvo, el responsable, quien creó la tarea y el líder de su sprint. En una reunión de cliente, solo quien pasa `getReunionesParaTareas({quien, ids:[sessionId]})` en el momento de leer, así una corrección del dueño de la reunión vale también para lo viejo. Si no pasa: «Salió de una reunión con un cliente», sin cita.
- **Los vínculos**: un registro de una empresa que no está en tu conjunto se ve como «Un registro de HubSpot» o «Una propuesta», sin etiqueta ni enlace. Uno cuya empresa no se resolvió (`empresaResuelta` ≠ cliente) se ve así para todos menos el SUPER_ADMIN y quien ve toda la cartera.
- **Las tareas que no ves**: una dependencia, una fusión («viene de») o una mención hacia una tarea fuera de tu visibilidad se ve como «Esperando a una tarea de Customer Success (T-28)», sin título ni cliente y sin enlace.
- **`TareaEvento.datos` y `LecturaDeReunion.resumen`** salen recortados: sin citas ni títulos de tareas ajenas. La cita de un evento es su columna propia, con la regla de arriba.
- **Los avisos**: cada aviso se escribe para cada destinatario con el texto que le da su serializador; si algo no se puede mostrar, el texto es neutro («Una tarea que esperabas está hecha»).
- **Los comentarios** los ve quien ve la tarea.

**Quién administra**:

| Qué | Quién |
|---|---|
| El espacio de un equipo: repartir, «Por asignar», marcar con alguien las tareas del sprint en la retro, corregir una revisión del sistema, «Reuniones que lee Nexus» | el líder (`tareas.manage` + miembro) |
| Un espacio libre: nombre, miembros, visibilidad, archivar | quien lo creó y quienes él nombre `admin` |
| Crear proyectos y tareas en un espacio, y asignarse tareas entre sí en un espacio libre | sus miembros |
| Un proyecto: editarlo, sus secciones, cerrarlo, activar un borrador, «Guardar como plantilla» | su responsable, quien lo creó, el líder del equipo dueño del espacio o un admin del espacio libre |
| Subir una plantilla a «toda la casa» | un líder o un admin de espacio |

---

## 4. Para quién: cliente, interno y el CRM (R5, R7)

### 4.1 El ámbito (`lib/tareas/ambito.ts`, puro, con prueba)

Se calcula, sin columna:

1. el proyecto de HubSpot de la tarea tiene `proyectoInterno` → **interno**, con su nombre («Interno · SICOP»). Aunque HubSpot lo cierre: la tarea ya era interna;
2. si no, la empresa es `INTERNO` → **interno** («Interno · Smarteam»);
3. si no, la empresa tiene al menos un proyecto clasificable y todos son internos (`esTrabajoInterno`, el mismo criterio de `lib/clients/proyectos-internos.ts`) → **interno** con el nombre de la empresa («Interno · SmartAgro»), aunque la tarea no tenga proyecto;
4. con empresa → su tipo: **cliente** · **prospecto** · **aliado**;
5. sin empresa → **Sin clasificar**. No es interno: nadie lo dijo todavía.

- No es un clasificador nuevo (invariante #2): usa `Client.kind`, la marca que escribe el espejo de HubSpot y la función que ya existe.
- **Interno a propósito, sin cliente**: se elige la empresa Smarteam («Interno · Smarteam»), que está siempre en la lista. En «Nuevo proyecto», «Para quién» ofrece primero **Interno (Smarteam)** · Un cliente · Sin definir.
- **SmartAgro**: el código dice que sus proyectos son internos («SICOP y los dos de SmartAgro»), pero no se verificó en la base que el proyecto de la empresa SmartAgro esté activo y marcado. Antes del código, una consulta de solo lectura lo confirma y la respuesta va a la pregunta 3. Si la regla 3 no alcanza, se marca el proyecto en HubSpot; nunca el nombre en el código.
- **Lo que la tarea tiene «Sin clasificar»** aparece en el filtro, en «Por cliente» y en las métricas como su propio grupo, con «Clasificar las N»: Nexus sugiere el cliente de cada una (§7.1) y una persona lo confirma.
- **Si el cliente se borra** (`DELETE /api/clients/[id]`), sus tareas abiertas quedan sin empresa y pasan a «Sin clasificar». Su historia no cambia: `ResultadoDeSemana` guarda la foto del cliente y del ámbito como texto.

### 4.2 Qué se puede elegir

- **Empresas**: `clientesQueVesParaTareas(quien)`, en `lib/tareas/clientes.ts`, devuelve el conjunto de ids: el acceso de `requireAccessToClient` (con la regla de la preventa: un prospecto con una preventa viva, para quien tiene `preventa.read`), de cualquier tipo, más las de tipo INTERNO. La regla de la preventa no se copia: sale de un helper que comparten `lib/auth/access.ts` y esta función. Un test la compara con `requireAccessToClient` cliente por cliente. Escribir exige lo mismo. (Ojo: `accessibleClientWhere` es async; no se puede usar `?? {}` sobre su promesa.)
- **Proyectos de HubSpot**: `proyectoClasificableWhere({ clientId })`, con los internos como grupo propio en el `hint`. Nunca el contenedor «Información del cliente». Los inactivos no se ofrecen: no tienen trabajo. El trabajo interno sin proyecto activo va a Smarteam o a la empresa (regla 3).
- **Proyectos de tareas**: los que ves.
- `GET /api/tareas/opciones` devuelve en una consulta las empresas que puedes elegir (`{id, nombre, kind}`). Con `?clientId=` devuelve sus proyectos de HubSpot y sus proyectos de tareas, y responde 404 si esa empresa no está en tu conjunto.
- Lo ya ligado a un proyecto que HubSpot cerró se queda y muestra «Cerrado en HubSpot». Si el proyecto se borra, `projectId` queda nulo y el cliente se conserva (por eso va denormalizado).

### 4.3 Filtrar y agrupar

- **Filtro «Para quién»** en Mis tareas, la semana del equipo, un espacio y un proyecto: Todos · Clientes (con su lista y conteos) · Interno · Prospectos · Aliados · Sin clasificar. Más: proyecto, etiqueta, persona, semana y un **buscador** por texto y por T-#.
- **Agrupar por cliente** en la lista, con cuántas, cuántas horas (y cuántas sin estimar) y cuántas hechas por grupo.
- **«Tareas internas por cliente»** (`/tareas/por-cliente`):
  - el nombre dice lo que es: las tareas internas del equipo, no el cronograma que ve el cliente. Una línea arriba lo aclara: «El cronograma de cada proyecto va aparte»;
  - período: Esta semana · Este mes · Trimestre;
  - una fila por empresa con abiertas, hechas en el período, horas y proyectos, agrupadas por ámbito. SmartAgro sale en un solo grupo, «Interno · SmartAgro», tenga o no proyecto la tarea;
  - lo interno se abre por proyecto: el de HubSpot interno o el proyecto de tareas («Rediseño del sitio»);
  - lo abierto sale de `Tarea.clientId`; lo hecho, de la foto de `ResultadoDeSemana` (`fotoCliente`, `fotoAmbito`): el pasado no cambia si la tarea cambia de cliente o si HubSpot marca un proyecto después;
  - solo sobre lo que ves.
  - En la fase 2, una columna de solo lectura con el avance del cronograma de cada proyecto de HubSpot y el enlace a él (`lib/tareas` puede leer `lib/timeline`, nunca al revés).
- **«Tareas internas» en la ficha del cliente** (fase 2): título, responsable y estado, sin cita, filtradas con `tareasVisiblesWhere` de quien mira (pregunta 4).

### 4.4 Vincular registros del CRM (`TareaVinculo`)

- Cliente y proyecto de HubSpot son los vínculos **primarios** (columnas de la tarea). `TareaVinculo` guarda referencias **secundarias** y no cambia el «para quién».
- **Qué se puede vincular**, dicho en pantalla: contactos, empresas, negocios, tickets, proyectos y objetos propios de HubSpot (lo que la app puede leer con sus permisos de hoy); propuestas comerciales y preventas de Nexus. Leads, cotizaciones, facturas y actividades de HubSpot no: la app no tiene permiso para leerlos, y pegar uno da «Nexus no tiene permiso para leer ese tipo de registro de HubSpot». Vincular una reunión cualquiera (por el chokepoint) queda para la fase 2.
- **En 1A.2**, desde el cajón de una tarea o de un proyecto:
  - **Pegar un enlace de HubSpot**:
    - `leerEnlaceDeHubspot(url)` (puro, en `lib/hubspot/urls.ts`) saca el portal, el objeto y el id, y rechaza un portal que no sea el del sistema;
    - una lectura del registro y de sus empresas asociadas (`lib/hubspot/registro-para-vincular.ts`) da la foto; la empresa se resuelve con `elegirCandidato` de `lib/hubspot/cliente-de-la-empresa.ts`, que ya resuelve fusiones y dos fichas con el mismo id;
    - si la empresa es un cliente que **no** está en tu conjunto: 403, sin devolver la foto;
    - si queda «ninguno» o «ambiguo», o HubSpot no respondió: se guarda con `empresaResuelta` en ese valor y se ve enmascarado salvo para el SUPER_ADMIN y quien ve toda la cartera, hasta que el refresco lo resuelva;
    - un 403 de HubSpot (falta de permiso) no se guarda: se rechaza con el mensaje de arriba.
  - **Elegir una propuesta comercial o una preventa** de Nexus, solo de las que puedes abrir. Las preventas se filtran con `DE_LA_PREVENTA` y la guarda de `lib/exploraciones/guardia.ts`: `ExploracionDeVenta` también guarda exploraciones de proyecto.
- **Fase 2**: `SelectorDeRegistro`, una búsqueda en HubSpot agrupada por tipo, desde 2 letras, con pausa al escribir y caché de 60 s. Vive en `lib/hubspot` (§7), y sus resultados pasan por el mismo filtro de empresas.
- **Al leer, 0 llamadas a HubSpot.**
  - La etiqueta es la foto, o el nombre vivo si el registro está espejado (`Client`, `Project`).
  - La URL sale de `hubspotRecordUrl(portal, objeto, id)` (nueva, pura), con el id **vivo** de lo espejado: así un reapunte por fusión en HubSpot no obliga a tocar vínculos.
  - Si la foto tiene más de 7 días, al abrir el cajón se refresca con `after()`, que vuelve a resolver la empresa. Un 404 deja «Ya no está en HubSpot».
- Cada destino tiene su regla de lectura en `serializar.ts`, y una guarda falla si una FK de `TareaVinculo` no la tiene. Un test de falla cerrada: con `clientId` nulo, nadie sin cartera completa ve la etiqueta.
- La foto no guarda correo, teléfono ni montos.
- Una reunión no se vincula por acá: la de origen es `sessionId` y se lee por el chokepoint.
- **Vincular no es sincronizar**: nada se escribe en HubSpot.

### 4.5 Fusiones de fichas (antes de la primera entrega)

- **Primero, en un commit propio y después del commit que trae `ClasificacionDeCuenta`**: hoy la fusión de fichas (`scripts/merge-duplicate-clients.ts`) **borra** `PedidoFueraDeAlcance`, `LicenciaCliente` y `ClasificacionDeCuenta` de la ficha absorbida y deja sin cliente sus `PreguntaDeTiempo`. Se arregla, y se suma un test que lee el schema y falla si un modelo con relación a `Client` no está en `SE_MUDAN`, en `UNO_A_UNO`, en lo que se mueve a mano o en una lista explícita de «se pierde a propósito».
- **Después**:
  - `tarea.clientId`, `proyectoDeTareas.clientId` y `tareaVinculo.clientId` entran a `SE_MUDAN`, y sus tablas a `TABLAS` (así quedan con su respaldo `pg_dump`), en la misma transacción que mueve `project.clientId`;
  - `ResultadoDeSemana.fotoCliente` (texto, sin FK) se actualiza a mano en la misma transacción;
  - los vínculos `0-2` cuyo id está en `hub.reemplaza` se actualizan igual que `businessCase` y `ventaGanada`, borrando antes el vínculo de la absorbida si la tarea ya tenía los dos (si no, el único aborta la fusión entera).

---

## 5. Flujos

### 5.1 Anotar a mano

- Es una línea arriba de Mis tareas y el «+ Tarea» del pie del menú, junto a Feedback, en cualquier pantalla. Chips: **Para** (tú, por defecto) · **Cuándo** (esta semana) · **Prioridad** · **Cliente** · **Proyecto** · **Solo para mí**. En la ficha de un cliente, el cliente viene puesto; dentro de un proyecto, el proyecto, y el «Cuándo» por defecto es «Sin semana» (el pendiente del proyecto).
- Enter la crea `pendiente`, tuya, en tu sprint y en `semanaDestino(tú, esta semana)`, con `crearTarea()`.
- Mientras escribes, el navegador la compara con tus tareas abiertas, que ya están cargadas (`lib/feedback/parecidos.ts`, sin red ni IA). Si encuentra una parecida: **«¿Es T-12 «Copies de videos Radisson»?»**
  - **Sí**: no crea nada. Si estaba en otra semana, `moverDeSemana` la trae a esta.
  - **No**: la crea.
- **Con «Para…» otra persona**, el servidor compara con las abiertas de esa persona (0 tokens), pero **solo con las que tú puedes ver**:
  - si la parecida es visible para ti: «Alexander ya tiene T-31 «…» · ¿Es esa?». **Sí** no crea nada ni la mueve: deja un evento `mencionada` con tu nota y le avisa a Alexander («Lidia dice que también le hace falta T-31»). Decide él;
  - si no la puedes ver: «Alexander ya tiene una tarea parecida; él decide», sin título ni número, y la propuesta sale igual.
- «Para…» busca personas: si escribes «Alexander», muestra a Vanegas (Customer Success) y a Arrieta (Admin), y nunca adivina.
- El detalle es opcional y va en el cajón. Al pie, el enlace «o pídeselo al asistente» (desde 1B).

### 5.2 Sugerirle o pedirle una tarea a otra persona (R3, sin IA)

1. «Para…» en la línea, en el cajón o en el chat:
   - **cualquier otra persona** (de tu equipo o de otro): nace `propuesta` en el sprint de casa de esa persona, con `pedidaPorEmail` (y `pedidaPorEquipo` si es de otro equipo). Le llega a su «Por decidir» y a «Para ti»: es lo que hace que «la tenga mapeada»;
   - **si eres líder de su sprint**, o los dos son miembros del espacio libre del proyecto: se asigna directo y le llega `tareas.asignada`. La línea lo dice («Se la asignas a Lidia»);
   - **un equipo**: va a su «Por asignar» (sin semana) y avisa a su líder. Solo se ofrecen los equipos con líder;
   - **dentro de un proyecto**: el pedido nace en el proyecto. Quien lo recibe ve «de «Campaña de SAP» (Marketing)». Al aceptarlo, queda en el proyecto y en SU sprint;
   - **a un proyecto de un espacio libre, sin responsable**: queda en «Sin responsable» del proyecto (`equipo` nulo, sin semana) y avisa al responsable del proyecto.
2. `avisar({tipo:"tareas.pedido"})` sale **después** de escribir, con el texto del serializador de quien lo recibe. En «Para ti» queda un pendiente que se contesta ahí mismo, con el molde de `PendienteDeTiempos`.
3. La persona decide (`POST /api/tareas/[id]/decision`):
   - **Aceptar**: queda `pendiente` en `semanaDestino(ella, …)` según la regla de §2, con `tipo: apoyo` si es de otro equipo, y `tal_cual` o `con_cambios`;
   - **Más adelante**: queda `pendiente` con `semana = null`. Con «a partir del…», la semana futura pasa por `semanaDestino`;
   - **No**: queda `rechazada`, con un motivo opcional;
   - **No es mía → pásala a X**: sigue como propuesta, con otro responsable y la agenda en `sin_agendar`, y deja el evento `no_es_mia` (de quién a quién). Si X ya tiene esa misma propuesta (mismo cliente y mismo pedido), se fusionan. X recibe el aviso.
4. La decisión es un `UPDATE … WHERE id AND estado='propuesta' AND version=?`. Si no actualiza nada, responde 409 «ya la decidió X».
5. Quien la pidió recibe `tareas.respuesta`. En «Lo que pediste» ve el estado, si está agendada, cuántas veces pasó, si alguien dijo que no era suya («Alexander dijo que no era suya; se la pasó a Caroline») y puede **retirarla** (queda `rechazada` con `decision: retirada`, que no es lápida).
6. **Si nadie decide en 14 días** desde su `createdAt`, el job del lunes la deja en estado `vencida` (`decididaPor: sistema`) y avisa a quien la pidió: «No se decidió en 14 días». No es lápida: si se vuelve a hablar del tema, se vuelve a proponer.
7. Después de decidir, se llama a `olvidarMedicion()` para quien decidió y para quien pidió.
8. Sobre un pedido se conversa con **comentarios** (1A.2): «La landing ya tiene su diseño base…». Cada comentario avisa a los otros involucrados (responsable, quien pidió, quien la creó), nunca a quien lo escribió.

### 5.3 Espacios y proyectos (R9)

- **Crear un espacio libre** (1A.2): «+ Nuevo espacio» en el menú. Nombre, ícono, miembros y «¿Quién lo ve?» (sus miembros · todo Smarteam). Crea su primer proyecto con el mismo nombre. Quien lo crea queda `admin`.
- **Crear un proyecto**: en cualquier espacio que ves, «+ Proyecto»: nombre, responsable (tú por defecto), «¿Para quién?» (Interno (Smarteam) · un cliente o un proyecto de HubSpot · sin definir), inicia, vence y descripción. Nace `activo`. En un espacio de otro equipo donde no estás, no se ofrece: se le pide al chat o al líder, y nace propuesto.
- **Sumar tareas**: «+ Agregar» al pie de su lista (o de una sección), o «Proyecto» en el cajón de una tarea que ya existe.
  - Lo que se agrega en un proyecto nace **sin semana**: es el pendiente del proyecto. Entra a la semana de alguien (y a su revisión y a su agenda) cuando se pone en «Esta semana», cuando vence dentro de la semana o cuando su responsable la arrastra a una semana.
  - Asignar a otro miembro de un espacio libre es directo, con aviso. Asignar a alguien que no es miembro sale como pedido (§5.2).
- **Secciones** (1A.2): el tablero de un proyecto se puede agrupar por sección o por estado. «+ Sección» crea una lista con nombre («Piezas», «Logística», «Invitados»); se reordenan arrastrando. Mover una tarjeta entre secciones solo le cambia la sección. Una sección vacía se puede quitar; con tarjetas, pregunta a cuál pasan.
- **Avance**: hechas sobre el total y «se sumaron N esta semana». Cuando otra persona suma tareas, al responsable le llega `tareas.agregada` (como mucho uno por día).
- **Terminar un proyecto** con tareas abiertas pregunta qué hacer con ellas: siguen en el sprint de cada persona, sin proyecto, o «Ya no se harán» (con motivo).
- **Archivar un espacio libre** pide que no le queden proyectos activos.
- **Un proyecto propuesto** (sugerido por una reunión o armado por el chat) se ve en su página como borrador: se edita entero (nombre, tareas, responsables, días, secciones) y se decide con **Activar** o **Descartar**. Activar reparte las tareas con las reglas de §5.2. Sugeridos: §7.4; planes del chat: §6.6.

### 5.4 Leer una reunión

- **A mano (1A.1)**: «Leer una reunión», en el menú, en la Semana del equipo y en Mis tareas. Es un diálogo de 3 pasos:
  1. **Elegir la reunión**: `reunionesDeTuCalendarioParaTareas(quien, q)`, las internas en las que estuviste, las más recientes arriba. Si está dos veces (9:30 con notas y 10:00 sin), se lee la que tiene notas, y lo dice.
  2. **Qué es**: «¿Planning, cierre o las dos?» (el día marca la opción por defecto) y «¿De qué equipo es la reunión?» (el de la mayoría de los participantes; con empate, pregunta). Solo decide quién recibe «Por asignar». Si tiene más de 7 días, dice que no avisa a nadie y ofrece la casilla «Avisar igual» (la usa el piloto).
  3. **Lo que salió**: cuántas, de quién, si hizo falta la IA y cuánto costó, y los proyectos que sugiere. La pantalla consulta la lectura por `GET /api/tareas/lecturas/[id]`.
- **Reparto, por persona**:
  - cada línea va al sprint de casa de su dueño, como propuesta;
  - si el dueño es de otro equipo, la propuesta lleva `pedidaPorEquipo` = el equipo de la reunión y `pedidaPorEmail` = quien pidió la lectura, y le llega con `tareas.pedido`: «Salió de: Sprint planning de marketing (5 oct)». Su líder la ve en «Lo pedido a otros equipos»;
  - un nombre de afuera **seguro** (nombre completo exacto) se le propone igual; uno **dudoso**: el equipo que se reunió confirma primero («¿Es Marco Salas?»), y con el sí sale el pedido;
  - lo que no tiene dueño claro va a «Por asignar» del equipo de la reunión, sin semana.
- **El cliente de cada propuesta**:
  - si la reunión es de un cliente (`belongsToClient(X)`), todas sus propuestas nacen con `clientId = X`, y con su `projectId` si `SessionProject` lo deja claro;
  - en una reunión interna, Nexus **sugiere** el cliente de cada línea (§7.1): en azul con la chispa, hasta que la persona lo confirma al decidir.
- Cada persona recibe **un** aviso por lectura (`tareas.sugerencias`, dedupe `lectura:<id>`), nunca uno por tarea.
- **Automático (1C)**:
  - el job `tareas-lecturas` lee **como el dueño de la fuente** (un `AppUserWithTeamMember` armado desde `duenoEmail`). Si el dueño está de baja, la fuente se pausa sola, con motivo y aviso al líder;
  - consulta cada fuente solo en su ventana (de fin + 15 min a fin + 24 h del día de la serie), como mucho una vez cada 10 minutos, con `events.instances` sobre la serie. Si la serie no trae la instancia, busca por el título normalizado, el mismo día, **con el dueño de la fuente entre los participantes**;
  - cada instancia exige que el dueño haya estado en la reunión, o que sea el líder del equipo de la fuente y la reunión sea de puertas adentro (`esReunionDePuertasAdentro`). La sala se decide así, nunca por `resolvedClientId`; `belongsToClient` solo restringe las candidatas y el cliente;
  - para cada instancia terminada sin fila llama a `sincronizarEvento(organizador, eventId)` (nueva, en `lib/google`, con el mismo escritor y el mismo `cambiosDeSesion` de meet-sync más `resolve-client`). **Nunca** corre la sync completa (lección del 21-sep);
  - crea su `LecturaDeReunion` en `en_espera` con `procesarDesde = max(fin + 15 min, inicio + 60 min)`;
  - si la reunión no tiene notas: `events.get`, elige el adjunto «Notas de Gemini» / «Notes by Gemini» (no el primero), escribe `googleDocId` y llama a `enrichSingleSession(id)`. Si quedó sellada sin notas, `reabrirEnriquecimiento(sessionId)` la reabre. Consulta a +10 min hasta fin + 90, después a +3 h y a +24 h, y entonces la marca `sin_texto`;
  - reclama como mucho 2 lecturas por tick (`updateMany en_espera→leyendo` con `leyendoDesde`); una con más de 10 min leyendo vuelve a `en_espera` (`lib/agents/run-colgada.ts`);
  - no lee solas las reuniones con dueño cliente (que no sea INTERNO): esas, con un clic. Desde la fase 3 (adelantada como etapa 2 de la memoria de la cuenta), a esas las lee solas la lectura de seguimiento, que deja sus propuestas en la misma fila;
  - no toma las filas en `en_espera` que creó el seguimiento (su `seguimientoEstado` no es null): esas las toma el job `seguimiento-reuniones`, y su salida de Tareas la escribe esa misma lectura. Si una persona la pide con «Leer una reunión» mientras espera, se le pide YA a la lectura de seguimiento (`leerAhora`, 2026-10-10); con la bandera apagada, la lee Tareas. Las de puertas adentro no entran a esa cola: las lee Tareas;
  - va en `lib/jobs/requisitos.ts` (pide `GOOGLE_SERVICE_ACCOUNT_KEY` y `GOOGLE_ADMIN_EMAIL`), y `TAREAS_LECTURAS_ENABLED ≠ 0` lo apaga sin deploy.

### 5.5 Cualquier reunión como fuente

- **Una vez**: «Leer una reunión» (§5.4). Lista por defecto las de puertas adentro en las que estuviste. Las de clientes se filtran con `clientesQueVesParaTareas(quien)` y nunca se adoptan ni cambian de dueño. Tope: 10 lecturas pedidas por persona por día.
- **Cada semana (1C)**: «Que Nexus la lea cada semana» crea una `FuenteDeTareas` con su día y su hora. Es de tu equipo si lo lideras; si no, es personal (`equipo = null`) y lo que no tiene dueño te llega a ti. Cada reunión se pausa y se reanuda en el mismo bloque. Si otro equipo ya la lee, lo dice: «Ventas ya lee esta reunión; lo de tu equipo te llega igual a tu sprint» (el reparto es por persona, así que no se pierde nada).
- **Sin Meet ni notas (fase 2)**: «Pegar notas o subir un documento» reusa `SumarFuente`. El texto se guarda en la lectura y pasa por el nivel 2.

### 5.6 «¿Te refieres a esta tarea?» (duplicados y arrastre)

1. **Candidatas**: las abiertas, las de «Más adelante» y las propuestas del **sprint** de quien la va a hacer, más el «Por asignar» de ese equipo, más las lápidas de los últimos 28 días.
   - Si la reunión tiene dueño cliente, solo entran las de ese cliente o sin cliente. Al modelo nunca le llegan títulos de tareas de otro cliente.
   - Se ordenan por raíces en común (`parecidos.ts`).
2. **Haiku elige** `misma: T# | null`. Recibe siempre las candidatas del dueño cuando las hay (tope de 15), porque Gemini reescribe los títulos cada semana y una paráfrasis no comparte raíces. Lo léxico solo ordena. Sin modelo, se pregunta solo con una candidata clara: 2 raíces o más, al menos 2/3 del título más corto, y la diferencia no es un cliente ni un nombre propio.
3. **La tarjeta**: «¿Es T-12 «Copies de videos Radisson» (de Lidia · pasó 1 vez)?». Como mucho 3 por línea.
   - **Es esa** (o **Es esa y pásala a Alejandra**): la propuesta queda `fusionada` (`decision: misma`), T-12 suma el evento `mencionada` con su sesión y su cita (en sus columnas), y `moverDeSemana` la lleva a `semanaDestino(responsable, max(semana de la reunión, lunes de hoy))`. Si estaba en «Más adelante», entra a esa semana. Si T-12 no tenía cliente y la reunión es de un cliente, toma ese cliente y la tarjeta lo dice.
   - **Es otra**: se crea como propuesta normal.
4. **Un texto idéntico** al de una propuesta pendiente para la misma persona, del mismo cliente y del mismo pedido, le suma la cita y no crea otra (único parcial). Si cambia el cliente o quién pidió, va aparte.
5. **Un texto idéntico a una lápida** (rechazada o fusionada por una persona) de 28 días o menos no se propone y queda en `resumen.omitidas`. Si solo se le parece: «Parecida a una que rechazaste el 2 oct». Lo vencido no es lápida.
6. **Las tareas hechas no son candidatas**, así lo recurrente (los copies de cada semana) no pregunta. Solo una pista: «Parecida a T-12, hecha el 2 oct».
7. **Con proyectos**: si una línea comparte raíces con un proyecto activo del espacio, la sugerencia trae el selector «Dentro de: Campaña de SAP» puesto, en azul con la chispa. Antes de proponer un proyecto nuevo, se mira §7.4.

### 5.7 Fechas, límites y dependencias (R6)

- **Fechas de una tarea**: `semana` (el lunes en que se hace) · `venceEl` (el límite) · el bloque de la agenda (día y hora). No hay «fecha de inicio» propia: repetiría la semana y quedaría vieja con cada pase.
- **Fechas de un proyecto**: `iniciaEl` (el ancla de un plan) y `venceEl`. Si una tarea vence después que su proyecto, la fila lo dice en ámbar. No se bloquea.
- **Dependencias** (`TareaRelacion`, tipo `bloquea`, pantalla desde 1A.2):
  - en el cajón: «Esperando a» lista las que la bloquean, cada una con «Quitar», y «+ Esperar a…» con un buscador de T-# (solo entre las que ves). Debajo, «La esperan»;
  - en la lista, el chip «Esperando a T-28». Mientras T-28 esté abierta, la tarea cuenta como bloqueada. Una tarea que no ves se nombra sin título (§3);
  - cuando T-28 queda hecha, el responsable de la otra recibe `tareas.dependencia`: «T-28 está hecha: ya puedes empezar T-30» (o «Una tarea que esperabas está hecha», si no la ve). Uno por tarea desbloqueada, nunca a quien hizo la acción;
  - si T-28 pasa a una semana posterior a la de T-30, las dos lo dicen sin mover nada: «T-30 depende de T-28, que pasó a la semana del 19 oct»;
  - Agendar propone el bloque de T-30 después del de T-28 cuando son de la misma persona y la misma semana;
  - sin ciclos; pueden cruzar personas, equipos y clientes.
- **«Relacionada»**: un enlace sin orden entre dos tareas.
- **Responsables**: uno por tarea (pregunta 1). El proyecto tiene el suyo.

### 5.8 Revisa tu semana (R4)

**Por qué no se entendía «Cerrar la semana»**: el título hablaba de un trámite y lo único que explicaba qué hacer era una línea gris; eran 9 filas con 4 opciones cada una (36 botones); «Pasa» es ambiguo, se parece a «Más adelante» y venía marcado de antemano, mezclado con lo que sugería la retro; la líder decidía por las tareas de otras personas con la semana tapada; y no terminaba en la agenda.

**Lo nuevo: cada persona revisa su semana y termina agendando lo que sigue.**

1. **Cuándo**:
   - **El aviso** aparece del viernes a las 15:00 (o apenas se lee la retro de su equipo) al lunes a las 6:00. En Mis tareas, el «Qué sigue» dice «Es viernes: revisa tu semana. Tienes 5 tareas sin marcar.», con el único botón azul: **Revisar mi semana**. En «Para ti»: «Revisa tu semana · 5 sin marcar».
   - **Las semanas pasadas** no se pierden: mientras quede una semana sin revisar con tareas abiertas, Mis tareas muestra arriba, siempre, «**Semanas sin revisar**: semana del 5 oct · 3 tareas», con su botón, y «Para ti» la lista. Se revisan en orden, cuando sea.
2. **El diálogo** («Tu semana del 5 al 9 oct», `Modal size="pantalla"`, en dos pasos: **1 Revisa · 2 Agenda**). Arriba, una frase: «Marca qué terminaste. Lo que no, sigue en la semana del 12 oct.» En una semana pasada: «… sigue esta semana».
3. **Si se leyó la retro**, una franja azul con la chispa: «La retro de hoy dice cómo te fue en 4. Revísalas: nada se cierra solo.», con «Usar las 4». Esas filas vienen en azul con la cita («Terminé los workflows de las bases instaladas.») y un «Usar». Cambiar la respuesta le quita el azul.
4. **Una fila por tarea abierta de esa semana, sin nada marcado**: título, horas, cliente y proyecto, la pregunta «¿La terminaste?» y dos botones escritos como frases:
   - **La terminé** → `hecha`. En una semana pasada, `completadaAt` es el viernes de esa semana, no hoy: así «Por cliente» la cuenta en su período;
   - **Sigue la próxima semana** → `moverDeSemana` a `semanaDestino(tú, max(W + 7, lunes de hoy))`. En una semana pasada el botón dice **Sigue esta semana**, y es un solo pase aunque se salte varias semanas. Si la tarea vence después del viernes de W, la fila lo dice («Sigue · vence el 23 oct») y ese pase no cuenta.
   «Otra respuesta ▾» abre **Para más adelante** (con «¿Desde cuándo?») y **Ya no se hará** (pide motivo).
5. **Cada respuesta se guarda al hacer clic** (`anotarResultado`, y el cambio real de la tarea). Si cierras a la mitad, no se pierde nada.
6. **Pistas**:
   - si una tarea que sigue bloquea a otra tuya de esa semana: «T-30 depende de esta: ¿la pasas también?»;
   - desde el tercer pase que cuenta, chip ámbar «Pasó 3 veces» y la pregunta «¿Sigue siendo verdad?», con **Partirla** (en 1A abre el cajón de una tarea nueva en el mismo proyecto; desde 1B, «Partirla con el asistente», que abre el chat con la tarea y el pedido escrito, sin mandarlo) · Para más adelante · Ya no se hará.
7. **Plegado al pie**: «8 ya estaban hechas».
8. **A la derecha, «Qué pasa al terminar»**, en vivo: «3 terminadas · 2 siguen a la semana del 12 oct · te falta marcar 1». Mientras falte alguna, el enlace **«Las que faltan, que sigan»** las marca de una vez. Nunca hay un «Pasa» implícito.
9. **El botón azul** se activa cuando no queda ninguna sin responder: **Listo: agendar las 2 que siguen**. Escribe `CierreDeSemana(tú, W)` y pasa al paso 2. Si no quedó nada abierto: **Terminar la revisión**. «Ahora no» cierra el diálogo; agendar queda en el «Qué sigue».
10. **El paso 2 es Agendar** (§5.9), siempre en la semana de hoy o una futura: las que siguen y no tienen bloque, más las que tenían bloque en W, con «¿Muevo el bloque o lo quito?».
11. **Corregir tu revisión**: durante 7 días, o hasta que revises la semana siguiente, «Corregir mi revisión» reabre el mismo diálogo. Las respuestas reemplazan las de antes y queda el evento `cierre_corregido`.

**La líder**, en la Semana del equipo:

- una tira «Revisaron su semana: Lidia ✓ · Alejandra ● le faltan 2»;
- **Revisar con el equipo** (1A.2) abre el mismo diálogo con una pestaña por persona, **solo con las tareas del sprint que lidera**, y lo que dijo la retro en azul. Sirve para hacerlo juntas en la retro, en pantalla:
  - lo que marca la líder queda con `decididoPor` = la líder;
  - el `CierreDeSemana` de la persona lo escribe la líder solo si a esa persona no le queda nada abierto en W en otro sprint; si no, lo escribe ella;
  - **no hay paso 2**: la líder no lee ni escribe el calendario de nadie. La persona recibe UN aviso por revisión (`tareas.cerrada`, «Alejandra revisó contigo 2 tareas · Agenda las 2 que siguen»), y puede cambiar lo marcado con «Corregir mi revisión»;
- **ya no hay un botón «Cerrar la semana» del equipo**: la semana del equipo está revisada cuando todas las tareas del sprint en esa semana tienen su resultado;
- su pendiente en «Para ti», del viernes 15:00 al lunes 6:00: «2 personas de Marketing no revisaron su semana» (solo si su equipo tiene líder).

**El lunes**, el job `tareas-semana-lunes` (1A.2, desde las 6:00 CR, `claimDateKey`):

1. **Revisa como `sistema`** la semana de quien no la revisó, solo desde `CIERRE_AUTOMATICO_DESDE` y solo con `TAREAS_CIERRE_AUTOMATICO=1`. Lo pendiente va directo al lunes de hoy, con un solo `pasa` del sistema que no cuenta ni avisa.
2. **Vence** las propuestas (tareas y proyectos) con 14 días o más desde su `createdAt`: estado `vencida`.
3. **Pasa a «Por asignar»** las abiertas de alguien dado de baja: `responsableEmail` y `semana` nulos, con su evento `asignada`.
4. **Muda al sprint de casa** las abiertas de quien cambió de área.

Después de un cierre del sistema, en Mis tareas: «El sistema pasó 2 tareas de la semana del 5 oct. ¿Terminaste alguna? **Revisar**». Abre el mismo diálogo en modo **Corregir mi semana**: las decisiones reemplazan las filas `sistema`, lo que marcas hecho vuelve a W como hecho con la fecha de esa semana, queda el evento `cierre_corregido` y el cierre pasa a tu nombre. Sin esto, una tarea saldría pasada en W y hecha en la semana de hoy, y las métricas la contarían dos veces.

- Los proyectos no tienen un cierre propio: sus tareas con semana entran a la revisión de su responsable. Un proyecto no vive en una semana.
- Desde 3 pases que cuentan: chip ámbar y el aviso `tareas.arrastre` al responsable y al líder, solo si la tarea ya venció o no tiene fecha.

### 5.9 Agenda (R2)

**Una tarea, su bloque** (decisión de Elías): nunca varias tareas en un bloque; una tarea más larga que un hueco libre puede llevar varios. Toda tarea de la semana va a la agenda; lo que no tiene semana no pide bloque.

1. Toda tarea abierta de **esta semana**, tuya y sin bloque, muestra **«Esta tarea aún no está en tu agenda · Agendar»**. Con varias, el «Qué sigue» ofrece **«Agendar las N»**.
2. **El diálogo** (`components/tareas/Agendar.tsx`, `Modal size="pantalla"`; en el celular, todo el ancho). Se abre desde «Agendar las N», desde una fila, al terminar «Revisa tu semana» y después de aplicar un acuerdo del chat. Abrirlo desde el cajón de una tarea usa `zClass("MODAL")`, por encima del cajón; abrirlo tapa el chat. Abre con `closeOnBackdrop=false`; Escape cierra, y si hay horarios cambiados sin agendar, pide confirmación.
   - **Izquierda, dos tercios: `AgendaDeLaSemana`** (forma nueva en `components/ui`): lunes a viernes, de 8:00 a 18:00, en una grilla CSS, sin librería de calendario. A 1.440 px son unos 140 px por día. Solo la semana de hoy o una futura.
     - **Lo ocupado** en gris, con su título: `events.list` sobre tu `primary`, con el `calendar.readonly` que ya existe (`fields`: título, inicio, fin, transparencia, `eventType` y `attendees(self,responseStatus)`). Un evento privado dice «Ocupado». Un evento de todo el día opaco o de «Fuera de la oficina» bloquea el día entero; una invitación que rechazaste no ocupa. Es tu propio calendario; no se lee el de nadie más.
     - **Lo propuesto** en azul suave con borde punteado: un bloque por tarea.
     - **En 1A.1** el horario se cambia con los selectores de la derecha y la grilla es de solo lectura. **En 1A.2** los bloques se arrastran de día y de hora, y el borde de abajo cambia la duración, en saltos de 15 min. La geometría vive en `lib/tareas/agenda-geometria.ts`, pura y probada, con la lección de `semanaEnX`: se lee viva en cada movimiento, se guarda una sola vez al soltar, y si un nodo mide 0×0 no se mueve nada.
     - La línea de ahora; las horas que ya pasaron, deshabilitadas; todo en hora de Costa Rica. Selector «‹ Semana del 12 al 16 oct ›».
   - **Derecha, un tercio: la tanda.** Una fila por tarea: título y vence; **la duración**, en chips 0,5 · 1 · 2 · 4 h, sin ninguno elegido si la tarea no tenía (una tarea sin duración no se agenda; lo que elijas queda como `minutosEstimados`); el horario editable (día y hora en selectores: es también el camino por teclado); «después de T-28» si depende de otra; y «Quitar de esta tanda». Una nota: «Cada tarea va en su propio bloque. Si la mueves en Calendar, manda Calendar.»
   - **Pie**: el único azul, **Agendar las 3 en tu calendario**, y «Cancelar».
3. **El horario que propone Nexus** (`proponerHorarios`, puro): el primer hueco libre entre 8:00 y 17:00 antes de `venceEl`, con la duración elegida, primero lo de prioridad alta, siempre después de sus dependencias y nunca en una hora que ya pasó.
4. **Con tu clic, Nexus crea los bloques** en tu `primary` (`lib/google/agenda.ts`, con prueba):
   - JWT **aparte**, `getAgendaWriteAuth` en `lib/google/auth.ts`, con `calendar.events.owned`, impersonando **solo** a quien hace clic, que es la dueña de la tarea. Sumarlo a `SCOPES_IMPERSONATE` rompería todas las lecturas si el permiso falta;
   - título `Tarea · <título>`; en la descripción, el enlace a la tarea; `extendedProperties.private.nexusTareaId`; `visibility: "private"` (el resto de la empresa ve «Ocupado»); `sendUpdates:"none"`; sin conferencia ni invitados;
   - cada bloque se guarda con su calendario (`agendaBloques: [{calendario, eventoId, inicio, fin}]`) y `agendaEstado = agendada`.
5. **Sin el permiso** (o con Google sin configurar, como en local): «Abrir en Google Calendar» por tarea abre el **enlace de plantilla** (`lib/tareas/agenda.ts`, puro y probado: `dates` en UTC con `Z`, `ctz=America/Costa_Rica`, `authuser=<tu correo>`, `nexustarea <id>` en la descripción, sin `vcon` ni `add`). Al volver pregunta «¿La guardaste?»; **Ya la agendé** la deja `agendada`.
6. **Cambiar de semana o de responsable**:
   - si lo haces tú, pregunta «¿Muevo el bloque o lo quito?» (`patch` con `If-Match: etag`, o `delete`, siempre en el calendario guardado en el bloque). Sin respuesta, la tarea vuelve a `sin_agendar` y vuelve el aviso;
   - si lo hace otra persona, Nexus no toca ningún calendario: la tarea queda `sin_agendar` y la dueña del bloque recibe un aviso con «Quitar el bloque» (lo quita su clic);
   - no pregunta si el bloque ya cae en la semana nueva y el dueño es el mismo. Si la tarea se fusiona o se descarta, le pregunta a la dueña si quita el bloque.
7. **Verificación (1C)**: al abrir Mis tareas, hasta 20 bloques con más de 6 h sin verificar se revisan con `events.get` (2 s de límite; el servidor espera 30 s por correo, en `GET /api/tareas/agenda/estado`). Si se canceló o se borró, queda `ya_no_esta` y vuelve el aviso.
8. **En el mismo deploy que Agendar**, `esBloqueDeTarea` en `lib/google/meet-sync-cambios.ts`: meet-sync suma `extendedProperties` y `description` a sus `fields` y salta el evento si trae `nexusTareaId`, si la descripción trae `nexustarea`, o si el título empieza con «Tarea» y no hay asistentes además del organizador. Con prueba en `meet-sync-cambios.test.ts`. Así un bloque nunca se vuelve sesión ni se le adjudica a un cliente.

**El `Modal` de hoy no sirve tal cual**: su clase base fija `max-h-[85vh]`, que le gana al alto del tamaño nuevo, y su cuerpo tiene padding y scroll propios que cortan el arrastre. El tamaño `pantalla` pisa también `max-h`, y una prop nueva deja el cuerpo sin padding ni scroll. Los otros tamaños no cambian.

### 5.10 Arranque retroactivo (piloto de Marketing)

Leer una reunión pasada es el mismo flujo que leer una nueva. La semana y las fechas salen de **la reunión** y pasan por las reglas de §2: lo aceptado queda en la semana de la reunión mientras esa semana no esté revisada, aparece en «Semanas sin revisar», y lo que sigue salta a la semana de hoy. Las propuestas vencen a los 14 días de **leerlas**, no de la reunión. Las fechas reales están en §13.

---

## 6. Chat de tareas (R3, R8 y R10 a pedido)

Es el chat de Nexus que ya existe (`lib/asistente`): el mismo handler, el hilo en la base, una sola herramienta `registrar_cambio_acordado`, la caché por bloques, la validación en seco con un reintento, el libro de pendientes, las líneas calculadas en el servidor y el cajón con casillas (`ChatDelAsistente.tsx`). Lo que no se reusa tal cual se dice en §6.8.

### 6.1 Dónde se abre

- El botón **«Asistente»** (blanco, con la burbuja) en la cabecera de Mis tareas, de la Semana del equipo, de un espacio, de un proyecto y de «Por cliente».
- «Preguntarle al asistente» en el cajón de una tarea o de un proyecto (con su chip): abre el chat y cierra el cajón, porque el velo del cajón tapa el chat. También en el resultado de «Leer una reunión» (con el chip de la reunión) y, en la fase 2, en la ficha del cliente (con el chip del cliente).
- «o pídeselo al asistente» al pie de «+ Tarea».
- **Bienvenida con ejemplos reales**: «Anótame revisar los copies del Radisson para el jueves» · «Sugiérele a Alexander Vanegas que deje administrable la landing de SAP» · «Arma un plan de onboarding de 30 días para kölbi» · «¿Qué tengo sin agendar?».
- **Un solo panel derecho a la vez**: abrir el chat cierra Feedback y el cajón, y al revés (un estado chico en `components/layout`, y el chat pasa a la escala de `lib/ui/z.ts`).

### 6.2 El hilo y la ruta

- **Un hilo por persona**, que la sigue por todas las pantallas: las tareas cruzan clientes. Clave `(pieza = "tareas", usuarioEmail)`, con los tres dueños en null.
- **Con ventana**: al modelo le llegan solo los turnos desde el último acuerdo aplicado, como mucho los últimos 12, más el bloque de pendientes. La historia entera sigue en el hilo (el libro de pendientes la lee), pero no se reenvía. El cuarto breakpoint de caché va sobre el último mensaje de esa ventana. Sin esto, cada turno costaría más que el anterior hasta llenar el contexto.
- `Dueno` suma una cuarta forma, `{ personal: true }`. Se cierra la rama de `correrTurno` que hoy reconstruiría `{ roleId: "" }`.
- `PIEZA_TAREAS = "tareas"` queda FUERA de `PIEZAS_CON_CHAT`: no es un canvas y aparecería en el desplegable.
- **Ruta** `app/api/tareas/asistente/route.ts`: el mismo `manejarGet/PostDelAsistente`, con `guardInternalUser` + `guardPermission("asistente","read")` + `tareasDisponible()`. Fija `pieza = "tareas"` y rechaza cualquier otra.
  - **Las tres rutas que ya existen** (proyecto, propuesta, roles) rechazan `pieza: "tareas"`, y el despachador acepta «tareas» solo con el dueño personal. Si no, un POST a `/api/projects/[id]/asistente` correría el chat de tareas sin su tope (lo cubre `panel.test.ts`).
  - **El tope** se cuenta en el handler, no en la ruta: 30 turnos por persona por día, contados como mensajes de la persona en su hilo de tareas desde el inicio del día CR (no como llamadas al modelo: un turno con reintento son dos). Al pasarse, 429 con un texto que lo dice.
- **Modelo**: `MODELO_DEL_ASISTENTE` (`claude-sonnet-5`), fijo por hilo, con el pensamiento en presupuesto bajo para la pieza de tareas (la mayoría son pedidos de una línea); se ajusta con la medición. `agentSlug` propio, `asistente-tareas`, para verlo aparte en `/integrations/gasto-ia`.
- **Prompt**: `promptDelAsistente(clase: "cronograma" | "documento" | "tareas")`, con CABEZA y COLA propias de tareas. Las otras dos quedan byte a byte iguales: sus cachés y sus pruebas no se tocan. La cola dice:
  - lo tuyo lo decides tú; lo que es para otra persona es una sugerencia que decide ella, salvo que seas su líder y digas «asígnale»;
  - nunca inventes una fecha: usa `cuando` o `dia`; una fecha exacta solo si la persona la escribió;
  - un plan es un proyecto con tareas, en días hábiles;
  - no marques hecha, no revises la semana, no decidas propuestas ajenas, no agendes ni archives: di dónde se hace («Agéndalas con “Agendar las 6”»);
  - títulos de 60 caracteres como máximo, en imperativo y con tuteo;
  - si se parece a una tarea abierta, dilo.
- **Herramienta**: `TOOL_ACUERDO_DE_TAREAS`, con el MISMO nombre y su enum cerrado. Nunca una segunda herramienta (búsqueda en el CRM o en la agenda): rompe la guarda y suma una vuelta al modelo.

### 6.3 Lo que lee

**El `system` va en dos bloques cacheados**:

1. la cabeza, la cola y la herramienta de tareas: iguales para todo el equipo;
2. **tu contexto** (`contextoDeTareas(quien)`, en `lib/tareas/chat/contexto.ts`), que se reescribe después de cada aplicar, dentro del techo de 13.000 caracteres:
   - hoy y tu semana;
   - **personas** `M1…` (activas, sin la cuenta de prueba), con equipo y líder;
   - tus **espacios** `E1…`;
   - los **proyectos** activos y propuestos que ves `R1…` (tope 30), con cliente, responsable, avance y vence;
   - las **plantillas** que ves `PL1…` (desde 1C, tope 15);
   - los **clientes** `C1…` de tu conjunto con tareas tuyas abiertas o que usaste en 60 días (tope 40);
   - **tus tareas** abiertas y propuestas, como `T-128 «…»` (tope 40);
   - si lideras, la semana de tu sprint (tope 60, sin las privadas de otros) y «Por asignar»;
   - las semanas que ya revisaste y las que te faltan.

- **Nunca** entra una cita, ni la de `Tarea`, ni la de `TareaEvento`, ni la de un proyecto. No se usa `tareasVisiblesWhere` tal cual: al SUPER_ADMIN le traería toda la casa.
- Un cliente nombrado que no está en la lista lo resuelve el código por nombre exacto **dentro de tu conjunto**; si es ambiguo, el rechazo vuelve al modelo con los candidatos de tu conjunto. Uno que no está en tu conjunto no se nombra.
- Las etiquetas `M#`, `C#`, `R#`, `E#`, `H#`, `PL#` son para que el modelo lea en ESE turno. Cambian de un turno a otro (un cliente nuevo corre la lista). Por eso el acuerdo nunca se guarda con ellas (§6.5).

**Los chips** van en `messages`, solo en ese turno y sin persistir. El servidor resuelve cada uno con la visibilidad de quien pregunta (`tareasVisiblesWhere`, la de proyectos o `clientesQueVesParaTareas`); si no pasa, el chip se descarta. El `bodySchema` del handler suma el chip (`tarea | proyecto | cliente | reunion` con su id).

- **tarea**: notas, pasos, dependencias (con las que no ves sin título), comentarios recientes y la historia corta, sin citas;
- **proyecto**: sus tareas que ves, tope 60;
- **cliente**: sus proyectos de HubSpot clasificables `H1…` y sus proyectos de tareas que ves. Si alguno tiene cronograma (fase 2), sus fases con semanas, en solo lectura y hasta 1.500 caracteres;
- **reunión**: SOLO los Próximos pasos y el resumen, por el chokepoint (`getReunionesParaTareas` con `quien`), hasta 6.000 caracteres. Nunca el transcript.

### 6.4 Operaciones (lista cerrada, `lib/tareas/chat/operaciones.ts`, puro)

| Operación | Campos | Al aplicar |
|---|---|---|
| `tarea.crear` | `ref?`, `titulo` (≤ 60), `para` (`yo` · M# · `equipo:<clave>` · `nadie` dentro de un proyecto), `modo` (`proponer` · `asignar`), `cuando` (hoy · mañana · lunes…viernes · esta_semana · proxima_semana · fin_de_mes · AAAA-MM-DD · sin_semana · mas_adelante) **o** `dia` (días hábiles desde el inicio del proyecto), `minutos?`, `prioridad?`, `cliente?` (C#), `proyectoHubspot?` (H#), `proyecto?` (R# o ref), `seccion?`, `despuesDe?` [T-# o ref], `etiquetas?`, `notas?`, `privada?` | Para ti: pendiente. Para otra persona: propuesta en su «Por decidir», con `tareas.pedido`; `asignar` solo vale si `nacePropuesta` da false (eres su líder, o los dos son miembros del espacio libre) |
| `tarea.editar` | `tarea`, `campo` (titulo · prioridad · vence · minutos · notas · etiquetas · cliente · proyecto · proyectoHubspot · seccion), `valor` | Edición con `version`. Nunca el estado |
| `tarea.asignar` | `tarea`, `para`, `modo` | Las mismas reglas que crear |
| `tarea.mover-semana` | `tarea`, `cuando` | `semanaDestino` (nunca al pasado) + «¿Muevo el bloque?» |
| `tarea.depender` | `tarea`, `despuesDe` [T-# o ref] | `TareaRelacion` sin ciclos |
| `tarea.vincular` | `tarea` o `proyecto`, `registro` (C# · H# · un enlace de HubSpot que **escribió la persona** en el chat) | `TareaVinculo`, con las reglas de §4.4. El modelo nunca arma un enlace |
| `proyecto.crear` | `ref`, `nombre`, `espacio?` (E#; por defecto el de tu equipo), `cliente?`, `proyectoHubspot?`, `inicia` (cuando), `vence?`, `responsable?` (M#), `secciones?` | Nace `propuesta` (borrador) si trae tareas (un plan) o si es un espacio donde no decides; si no, `activo` |
| `proyecto.editar` | `proyecto`, `campo` (nombre · vence · responsable · secciones · estado: activo · en_pausa · terminado), `valor` | — |
| `proyecto.desde_plantilla` (1C) | `ref`, `plantilla` (PL#), `cliente?`, `proyectoHubspot?`, `inicia`, `responsable?` | El código expande la plantilla en un borrador |

- **«Anótame…»** = `tarea.crear` con `para = "yo"`.
- **«Sugiérele a Marco…»** = `tarea.crear` con `para = M#`, `modo = proponer`. La línea lo dice: «Se la propone a Marco Salas (Ventas); decide él.» **«Asígnale a Lidia…»** dicho por su líder = `modo = asignar`, y la línea dice «Se la asignas a Lidia». Dicho por quien no puede asignar, la validación lo pasa a `proponer` y la línea lo dice.
- **Una fecha exacta** (`AAAA-MM-DD`) solo pasa la validación en seco si esa fecha aparece en el mensaje de la persona en ese turno; si no, se rechaza y vuelve al modelo.
- **Una pregunta sin cambios** («¿qué tengo sin agendar?») se contesta con el contexto, sin operaciones.
- Topes: 40 operaciones por acuerdo y 30 tareas por proyecto.

### 6.5 De la conversación a la base: la IA no escribe sola

1. **El modelo solo emite operaciones.** `prepararOperacionesDeTareas(foto, ops, quien)` (puro) las prueba en seco:
   - las refs resuelven; cada T-# se ve y su acción está permitida (`accionesDe`);
   - cada M# está activo y no es la cuenta de prueba;
   - el cliente está en `clientesQueVesParaTareas` y coincide con el del proyecto (`project.clientId == clientId`);
   - `modo = asignar` solo donde corresponde;
   - `despuesDe` sin ciclos; como mucho 40 operaciones;
   - `cuando` y `dia` válidos, y la fecha exacta, literal; los títulos sin voseo (`voseoEnProsa`).
   Lo rechazado vuelve al modelo como `tool_result` con `is_error`, una sola vez (`decidirReintento`). Lo que sigue rechazado se dice: «No registré 2 de los cambios…».
2. **Antes de guardar el acuerdo, el servidor cambia cada etiqueta por su id real**: M# por el correo, C# por el `clientId`, H# por el `projectId`, R# por el id del proyecto, E# por el del espacio, PL# por el de la plantilla. T-# ya es estable (`numero`). Las refs del modelo (`onb1`) se conservan; el servidor solo les agrega un sufijo cuando chocan con una ref pendiente de un turno anterior, y el bloque de pendientes le muestra al modelo la ref final («[onb1]»), así un turno siguiente puede apuntarle («súmale una tarea al plan»). Un test: si entre dos turnos cambia la lista C#, un pendiente no cambia de cliente.
3. **La persona lee lo que se va a ejecutar.** `describirOperacionesDeTareas` arma en el servidor, desde los ids, una línea por operación, con la fecha ya calculada (`hoyEnCostaRica`, `lunesDeFecha`), la semana real que da `semanaDestino`, quién decide, y «parecida a T-12» si `parecidos.ts` encuentra una abierta que quien pide puede ver (0 tokens; nada se fusiona solo). Ejemplos:
   - «Crear «Revisar los copies del Radisson» · para ti · jue 8 oct · 1 h · parecida a T-5»
   - «Proponerle a Alexander Vanegas (Customer Success) «Dejar administrable la landing de SAP» · vie 9 oct · decide él»
   - «Crear el borrador del proyecto «Onboarding de kölbi» en Customer Success · kölbi · del lun 12 oct al vie 20 nov», seguido de «Día hábil 1 · lun 12 oct · Kickoff interno · Jerson Escudero · 1 h»…
   - Al pie, si el proyecto de HubSpot tiene cronograma: «El cronograma que ve el cliente no cambia.»
   Desmarcar el proyecto se lleva sus tareas, y desmarcar una tarea se lleva las que la esperan (`dependenciasDeOperacionesDeTareas`, calculado en el servidor; el mismo cálculo se usa cuando el modelo descarta un pendiente por su P#).
4. **Lo pendiente se arrastra entre turnos** con el libro de pendientes, por el carril de tareas (§6.8). La deduplicación compara las operaciones ya normalizadas, sin el sufijo.
5. **Aplicar** (`POST /api/tareas/operaciones {turnoId, desmarcadas}`):
   - el servidor LEE el acuerdo del hilo de esa persona; no acepta operaciones que mande el navegador;
   - exige que sea el acuerdo vivo (`estadosDeAcuerdo`); si no, 409;
   - trae las fotos de HubSpot que haga falta **antes** de abrir la transacción;
   - revalida contra la foto fresca y aplica **todo o nada** en una `$transaction` con `{ timeout, maxWait }`, por `lib/tareas/mutaciones.ts`. Si algo ya no entra, 422 sin escribir; el libro lo conserva;
   - **escribe el desenlace en el hilo en la misma transacción** (el turno de desenlace ok). Así, si el navegador se cierra, el acuerdo ya no está vivo y no se vuelve a arrastrar;
   - es idempotente: cada creación lleva `origenId = c:<turno donde se acordó por primera vez>:<i>` (ese turno viaja en el acuerdo). Si ya existe, responde «Ya estaba aplicado», con el desenlace ok y sin error;
   - `avisar()` sale **después** del commit, uno por persona por acuerdo, con el texto de su serializador, y se llama a `olvidarMedicion()`. Las tareas de un borrador no avisan hasta que se active;
   - `origen = chat` y `TareaEvento` con el correo de la persona y `datos.hiloId` (para la métrica «cómo entran»);
   - el botón dice lo que hace: «Crear 6 tareas», «Mandarle la sugerencia a Marco Salas», «Crear el borrador del proyecto y sus 12 tareas». Después ofrece **Agendar las 6** o **Abrir el borrador** (el chat no agenda ni activa).

### 6.6 Planes y plantillas (R8)

- **Un plan desde cero** («crea un plan para hacer el onboarding de kölbi en 30 días»): `proyecto.crear` con `inicia` y entre 5 y 15 `tarea.crear` con `dia` y `despuesDe` solo donde hay una dependencia real. «30 días» se lee como unos 22 días hábiles, y la línea lo dice.
- **Las fechas las calcula el código** (`lib/tareas/plan.ts`, puro, con prueba): `dia` es un **día hábil** (lunes a viernes); inicio = `iniciaEl` + `dia` días hábiles; `venceEl` = ese día; `semana = semanaDestino(persona, lunesDeFecha(inicio))`. Nunca la IA. La línea lo dice: «Día hábil 6 · lun 19 oct».
- **Entra como borrador** (decisión 21): el proyecto queda en `propuesta`, con sus tareas adentro, en su página. Ahí se edita todo (títulos, responsables, días, secciones, dependencias) sin otro turno. **Activar el plan** lo deja activo y reparte: lo tuyo, pendiente; lo de otros, como propuestas o asignado según `nacePropuesta`. Nadie recibe un aviso antes.
- **El cronograma del cliente no se toca.** Si el proyecto de HubSpot tiene cronograma, en la fase 2 el chip del cliente suma sus fases (solo lectura) y el chat propone las tareas INTERNAS para cumplirlas. La línea dice que el cliente ve el cronograma, no esto (pregunta 2).
- **Guardar como plantilla** (1C, botón en la cabecera del proyecto, 0 tokens): `guardarComoPlantilla(proyecto)` toma títulos, el `dia` hábil de cada tarea (desde `iniciaEl` hasta su semana o su `venceEl`), horas, secciones, dependencias y `para: "responsable"` o `null`. No guarda personas, clientes, citas ni vínculos. Si un título nombra a un cliente, avisa: «Revisa los títulos: “Kickoff con kölbi” nombra a un cliente». La plantilla queda en el espacio del proyecto; un líder o un admin la sube a toda la casa.
- **Usar una plantilla** (1C): «+ Proyecto › Desde una plantilla» (eliges para quién, inicio y responsable) cuesta **0 tokens** y crea el mismo borrador; por el chat, `proyecto.desde_plantilla`, un turno corto. `expandirPlantilla(plantilla, inicio, responsable)` es pura y tiene prueba. Validación con Zod en `lib/tareas/plantillas.ts`: como mucho 40 tareas, sin ciclos.
- **Sin tareas recurrentes**: una plantilla cubre lo que se repite.

### 6.7 Costo y tope

- Sonnet 5, sin medir todavía, con los precios de `lib/ai/precios.ts`: un turno en frío, **US$0,05–0,08** (unos 9.000 tokens de entrada y 1.500–3.000 de salida, contando el pensamiento); el siguiente dentro de 5 min, **US$0,02–0,03**. Un plan de 30 días desde cero, **US$0,10–0,20**; desde una plantilla, unos **US$0,03**. Aplicar no cuesta.
- Con 15 personas y 2 turnos por día, casi siempre en frío (la caché dura 5 min): unos **US$25–45 por mes**. Con uso intenso, más; el tope lo frena.
- **Tope: 30 turnos por persona por día**, contados como turnos de la persona (§6.2). No se cuenta con el tope global: `PRESUPUESTO_IA_BLOQUEA` está apagado.
- Antes de prometer números se mide con `scripts/probar-asistente.ts` (extendido con el contexto de tareas): turnos en frío, turnos con 12 de historia y un plan de 30 días, con `countTokens`. Con esa medición se decide el presupuesto del pensamiento. Haiku se prueba solo después de medir.
- Lo simple sigue sin IA: «+ Tarea» y «Para…» cuestan 0 tokens.

### 6.8 Lo que hay que tocar en `lib/asistente`

El chat de hoy tiene dos carriles a medias: `turno.ts` decide unas 15 veces con `esCronograma ? … : …`, y en la validación en seco manda todo lo que no es cronograma a `prepararOperacionesDeDocumento`. Un ternario olvidado trataría las operaciones de tareas como de un documento y las rechazaría todas, sin error de compilación. Y `acuerdo-vivo.ts` importa del cronograma su cálculo de dependencias (`arrastreAlDesmarcar`, que solo conoce `fase.crear`), así que para tareas daría cero dependencias: descartar un proyecto dejaría vivas sus tareas, y aplicar respondería 422 sin aplicar nada.

Lo que se hace:

- **`carrilDeLaPieza(pieza)`**, con un `switch` exhaustivo sobre la pieza (`never` en el default, para que un caso olvidado no compile): validar en seco, describir, dependencias, podar, arrastrar, reintento, componer, herramienta (`toolDeLaPieza`), prompt, `agentSlug` y los textos del desenlace. Los carriles de cronograma y documento quedan como están, movidos detrás del switch, con sus pruebas sin cambios.
- `acuerdo-vivo.ts`: `fusionarPendientes` recibe la función de dependencias del carril, en lugar de importar la del cronograma.
- `arrastre.ts`, `desenlace.ts`, `textos-del-acuerdo.ts`, `piezas.ts`, `contexto.ts`: el carril de tareas.
- `hilo.ts`: la cuarta forma de `Dueno` y `whereDelDueno`. `turno.ts`: cerrar la rama de `correrTurno`, la ventana de historia y el cuarto breakpoint.
- `handler.ts`: el chip en el `bodySchema`, el rechazo de `pieza: "tareas"` fuera del dueño personal, el tope por turnos, y que el desenlace de tareas no lo escriba el navegador.
- `hilo.test.ts`: sumar `tarea`, `tareaEvento`, `tareaRelacion`, `tareaVinculo`, `tareaComentario`, `proyectoDeTareas`, `espacioDeTareas`, `plantillaDeTareas` y `cierreDeSemana` a `TABLAS_DEL_DOCUMENTO` (lib/asistente no los escribe).
- `turno.test.ts`: la herramienta sigue siendo una sola. `panel.test.ts`: pasa a exigir `toolDeLaPieza` y que las rutas viejas rechacen tareas. `contexto.test.ts`: los cargadores pesados siguen prohibidos. Una prueba nueva: el switch del carril es exhaustivo.
- La prueba de tuteo del prompt de tareas.
- `ChatDelAsistente`: un tercer juego de rótulos («Crear 6 tareas», «Mandarle la sugerencia a Marco», «tus tareas»), una prop de ancho opcional para leer planes largos, y el desenlace que hoy dice «el documento».

**Tamaño honesto**: 1B es del tamaño de 1A.2. Por eso sale en paralelo y no al final.

---

## 7. IA de las reuniones (`lib/tareas/lectura.ts` + `lib/tareas/ia/`)

### 7.1 Nivel 0: código, 0 tokens

1. **El lector del chokepoint** (`getReunionesParaTareas`) trae título, fecha, fin, participantes, notas y `summary.action_items`.
   - `huellaTexto` sale del transcript si existe y, si no, del resumen. Con menos de 200 caracteres queda nula y la lectura espera las notas (o queda `sin_texto`). Solo se marca `copia` con texto real.
   - Entre dos filas gemelas se lee la de notas más largas.
   - Un `googleDocId` repetido en 2 o más instancias de la misma serie, o en más de 3 filas con otro título, es sospechoso: no se lee solo y se avisa.
2. **Las notas**:
   - `ENCABEZADOS_DE_GEMINI` y `ordenarNotasDeGemini` se mudan de `lib/contexto/material-cronograma.ts` a `lib/sessions/notas-de-gemini.ts`, que ya existe (`partirNotas`, `notasPriorizadas`): un solo lugar sabe leer las notas de Gemini. Reconocen «Próximos pasos», «Pasos siguientes recomendados», «Next steps» y los títulos con «:».
   - `itemsDeProximosPasos()` (nuevo, puro) usa `^\[(?<persona>[^\]]+)\]\s*(?<titulo>[^:]{2,120})(?::\s*(?<detalle>.+))?$`, sin viñetas. Cada línea tiene un id estable: la **huella de su texto normalizado** (en pantalla y para el modelo se muestra como `L1…Ln`). Su texto es la cita literal.
   - Los párrafos de **Detalles** también se numeran (`D1…Dn`, con su huella): de ahí sale lo que se terminó, que la retro no dice en los Próximos pasos.
   - Si la sesión trae `summary.action_items`, esas son las líneas.
   - Si el overview mide 9.900 caracteres o más, se relee el Doc sin el tope **en `lib/sessions`, detrás del chokepoint** (`releerNotasCompletas(quien, sessionId)`), y solo si el título y la fecha del Doc coinciden con la reunión. `lib/tareas` no importa `lib/google/drive-files` ni el parser de Docs.
   - «[Ana, Luis]» se parte: se propone a la primera persona y se cita a las demás. «[Equipo]» va a «Por asignar».
3. **`resolverPersona()`** (`lib/tareas/personas.ts`), **solo en el corchete**:
   - nombre completo exacto de un miembro activo, o nombre y apellido: **seguro**;
   - nombre de pila único entre los participantes: **seguro**;
   - nombre de pila único en toda la casa, pero la persona no estuvo: se propone con confirmación del equipo que se reunió;
   - nombre ambiguo («Alex»): va a «Por asignar» con un selector limitado a esos candidatos, y `nombreDicho` en el evento;
   - nunca alguien dado de baja ni la cuenta de prueba, y nunca por coincidencia parcial.
   **Un nombre en el detalle es una mención, no un dueño.** «Explicar a Alexander el procedimiento…» (T-9), «Coordinar con Alexander la implementación…» (T-13) y «Consultar con Marco el estado de la licencia…» (T-14) siguen siendo de quien dice el corchete. El nombre queda en el evento (`nombreDicho`) y, a lo sumo, como un chip opcional en la propuesta: «¿Pedírselo a Alexander…?», que elige una persona. Solo una lista cerrada de verbos que piden («pedirle a X que…», «que X haga…», «X se encarga de…») propone además un pedido, y siempre con confirmación de quien lee. «Consultar con», «coordinar con», «explicar a» y «avisarle a» nunca. Las tres líneas reales van a las pruebas de `lectura.ts`.
4. **El cliente de cada línea** (en una reunión interna): `clientePorTitulo` (`lib/sessions/match-por-titulo.ts`, la misma función y las mismas stopwords del cascade) corre sobre el título y el detalle de **cada línea**, con los clientes de `clientesQueVesParaTareas` de quien lee. Con un candidato único, la propuesta lo trae **sugerido** (en azul, hasta que la persona lo confirma). No decide de quién es la reunión: eso sigue siendo `resolvedClientId` (invariante #2). En una reunión de cliente no corre: el cliente es el de la reunión.
5. **`fechaDesdeLaReunion(texto, fechaReunion)`** (`lib/tareas/fechas.ts`, pura): hoy, mañana, lunes…viernes, esta semana, la próxima semana, fin de mes y AAAA-MM-DD, en hora de CR. Se prueba con una reunión de domingo a las 19:00 CR y con una tarea creada el lunes a las 00:30 UTC.
6. **Semanas de la reunión**: `semanaDeLaReunion()` (de lunes a jueves, esa semana; de viernes a domingo, la siguiente) y `semanaQueCierra()` (al revés). El rol por defecto es cierre de viernes a domingo y planning de lunes a jueves; con «retro», «cierre», «revisión», «review» o «weekly» en el título, «las dos». Una persona lo confirma.
7. **Candidatas** como en §5.6, más los proyectos activos, propuestos y descartados en 28 días del espacio (tope 10).
8. **¿Hace falta el modelo?** Se llama a Haiku si pasa cualquiera de estas:
   - una línea no tiene persona segura, o sus personas tienen tareas abiertas o propuestas con las que podría duplicar;
   - la reunión es de cierre;
   - **3 o más líneas comparten raíces** (lo calcula `parecidos.ts`, 0 tokens): pueden ser un proyecto (R10);
   - una línea tiene más de un cliente candidato.
   Si no pasa ninguna, se lee sin modelo.

### 7.2 Nivel 1: una sola llamada a Haiku por reunión

- **Parámetros**: `claude-haiku-4-5`, `temperature 0`, `max_tokens = 200 + 70 × líneas + 25 × tareas de la semana que cierra`, con techo de **3.000** (sin streaming), `maxRetries: 0` y 20 s de límite.
- **Trazabilidad**: pasa por `lib/anthropic.ts` dentro de `conContextoDeIA({agentSlug:"tareas-lectura", agentRunId, triggeredByEmail})` y deja un `AgentRun` con `sourceSessionIds`. El prompt (~500 tokens) vive en `lib/tareas/ia/pedido.ts`.
- **Le llega solo lo necesario**:
  - las líneas: todas si hay candidatas o si se buscan grupos; si no, solo las ambiguas;
  - si se buscan grupos, el Resumen de la reunión (hasta 2.000 caracteres);
  - las personas `M1 Alejandra Ortega (Marketing)…`;
  - las candidatas por dueño `T7 «título» · M2 · pasó 1` (tope 15 por dueño);
  - los proyectos candidatos `R3 «Campaña de SAP»` (también los propuestos y los descartados recientes);
  - los clientes candidatos de cada línea `C2 Colby`, solo de tu conjunto;
  - si es de cierre, las tareas abiertas de la semana que cierra (como mucho 40) y los párrafos de Detalles numerados `D#` que comparten raíces con esas tareas (hasta 3.000 caracteres).
- **Herramienta forzada `leer_reunion`**, con enums armados para ese pedido:
  ```
  lineas:     [{ L, dueno: M#|null, misma: T#|null, proyecto: R#|null, grupo: G#|null, cliente: C#|null, vence: hoy|manana|lunes…viernes|esta_semana|proxima_semana|null }]
  grupos:     [{ G, nombre ≤ 40, mismoQue: R#|null }]
  resultados: [{ T, resultado: hecha|no_hecha, fuente: L#|D# }]
  ```
  No hay texto libre salvo el nombre de un grupo. **La cita es el id de una línea o de un párrafo**: el texto literal lo pone el código.
- **Después** (`lib/tareas/ia/salida.ts`):
  - valida cada id contra la lista que mostró y descarta lo desconocido;
  - un dueño de afuera de la sala nunca dispara un pedido directo: pasa por la confirmación del equipo;
  - un proyecto que eligió Haiku sale como pregunta aparte («¿Va dentro de «Campaña de SAP»?»), que confirma la persona;
  - un cliente que eligió Haiku sale sugerido, en azul;
  - el nombre de un grupo se acepta si tiene 40 caracteres o menos, comparte raíces con sus líneas y no trae voseo; si no, se usa el título de su primera línea;
  - calcula las fechas y aplica lápidas, candados y la regla de clientes; escribe `resumen`;
  - los `resultados` quedan como `TareaEvento` `sugerido_cierre` (con su sesión y su cita en columnas) y prellenan «Revisa tu semana» en azul, solo sobre las tareas de quienes estuvieron;
  - si `stop_reason === "max_tokens"`, no aplica nada del modelo y pasa a `sin_ia`.
- **Pruebas obligatorias**: una retro con 20 líneas y 40 tareas abiertas no se corta; las tres líneas con menciones (T-9, T-13, T-14) quedan con su dueña.

### 7.3 Nivel 2: la conversación completa (1A.2)

- **Cuándo**: con un clic, «¿Faltó algo? Leer la conversación (≈ US$0,03)». En automático, solo cuando la reunión no trae «Próximos pasos» ni `action_items`.
- **Qué se manda**: el transcript **comprimido** (sin marcas de tiempo, turnos seguidos del mismo hablante juntos) y **numerado** por línea, hasta `MAX_TRANSCRIPT_CHARS` (150.000). No se corta en silencio: si no entra, se avisa.
- **Herramienta `extraer_tareas`**: hasta 15 `{titulo ≤60, dueno M#, linea C#, misma T#, proyecto R#, grupo G#, cliente C#, vence}`, más `grupos`, con la lista de líneas que ya están para no repetirlas. `max_tokens` 2.500, 60 s. Un título con voseo se marca para editar, sin reintento.

### 7.4 Proyectos sugeridos (R10, desde 1A.1)

- Cuando 3 o más líneas (o de 2 personas o más) forman algo nuevo, la lectura propone un proyecto en el espacio del equipo de la reunión, con `origenId = g:<lecturaId>:<grupo>`, la cita y sus líneas como tareas propuestas adentro, cada una para su dueño.
- **Nunca dos veces el mismo**:
  - `ProyectoDeTareas.huella` (el nombre normalizado) y un único parcial `(espacioId, huella) WHERE estado = 'propuesta'`;
  - a Haiku le llegan los proyectos activos, los propuestos y los descartados de los últimos 28 días (`mismoQue: R#`);
  - si ya hay uno **propuesto** que se le parece, las líneas nuevas se suman a ese y no nace otro;
  - si hay uno **activo**, las líneas salen con «¿Va dentro de «Campaña de SAP»?»;
  - si hay uno **descartado** hace 28 días o menos, no se vuelve a proponer: las líneas salen sueltas y el resumen lo dice.
- **La tarjeta**, arriba y una vez, con la chispa: «Nexus sugiere un proyecto: «Campaña de SAP» · 4 tareas de 3 personas · del Sprint planning de marketing». **Usar** · Cambiar (nombre, responsable, cliente, vence) · Descartar.
  - **Usar** lo deja `activo`. Sus tareas siguen como propuestas y cada persona decide la suya.
  - **Descartar** lo deja `descartado`, y sus tareas siguen como propuestas sueltas: salieron de líneas reales.
- Lo decide quien leyó la reunión o el líder del espacio. Vence a los 14 días, como una propuesta.
- Va en el mismo aviso de la lectura: uno por lectura, no uno por proyecto.
- **A pedido**: con el chip de una reunión, el chat propone tareas o un proyecto (§6). No reemplaza a la lectura.

### 7.5 Si algo falla

- **Error pasajero** (429, 529 o tiempo límite): a mano, la lectura queda en `error` con «Reintentar»; en 1C, vuelve a `en_espera` a +5 y a +15 min (molde de `esReintentable` de `enrich-retry`).
- Pasa a `sin_ia` tras 3 intentos o por `max_tokens`. En `sin_ia`, las líneas del nivel 0 se proponen igual, marcadas «sin revisar por la IA»; lo que no tiene dueño seguro va a «Por asignar»; «¿Te refieres?» se pregunta solo con una candidata clara; no se sugieren proyectos; no sale ningún pedido a otro equipo sin confirmación.

### 7.6 Tope y costo

- **Lo automático**: como mucho 40 llamadas al modelo por día con `agentSlug` `tareas-*`, contadas en `LlmCall` (las lecturas de 0 tokens no cuentan).
- **Lo pedido**: 10 lecturas por persona por día.
- Con Haiku no hay caché: el prefijo queda bajo los 4.096 tokens.
- **Haiku 5.5**: el ensayo lo prueba con `countTokens` sobre las mismas reuniones. Si se usa: sumarlo a `lib/ai/precios.ts`, sin `temperature` (da 400), effort low, `tool_choice` forzado.

| Caso | Modelo | Entrada / salida | Costo |
|---|---|---|---|
| Anotar, «¿Es esta?» al escribir, ámbito, horarios, plantillas desde la pantalla | código | 0 | **US$0** |
| Reunión sin ambigüedad, sin candidatas y sin grupos posibles | código | 0 | **US$0** |
| Primera reunión del equipo con 3 o más líneas parecidas (el piloto) | Haiku 4.5 | ~1.800 / ~300 | ≈ US$0,003 |
| Planning con tareas abiertas | Haiku 4.5 | ~2.500 / ~400 | ≈ US$0,0045 |
| Retro (más las tareas de la semana y Detalles) | Haiku 4.5 | ~3.500 / ~1.000 | ≈ US$0,0085 |
| Conversación completa | Haiku 4.5 | ~18.000 / ~2.500 | ≈ US$0,03 |
| Turno del chat (frío / siguiente en 5 min) | Sonnet 5 | ~9.000 / 1.500–3.000 | ≈ US$0,05–0,08 / 0,02–0,03 |
| Plan de 30 días desde cero | Sonnet 5 | — | US$0,10–0,20 |
| Plan desde una plantilla, por el chat | Sonnet 5 | — | ≈ US$0,03 |
| Aplicar un acuerdo | — | 0 | US$0 |

Por mes: las lecturas, entre US$0,40 y 1,60 (seis equipos con planning y retro, más unas reuniones sueltas). El chat, unos US$25–45 con uso moderado. Los números reales se miden con `countTokens` y `LlmCall` antes de prometerlos.

### 7.7 Capas contra duplicar y reproponer

1. **Una lectura por reunión**: `LecturaDeReunion.sessionId @unique`, más el reclamo `en_espera→leyendo` con `leyendoDesde`.
2. **La misma reunión en dos filas o dos series** se lee una vez: `huellaTexto`.
3. **Volver a leer no duplica ni pisa lo decidido**: `origenId = l:<lecturaId>:<huella de la línea>` (y `g:` para un proyecto). Como el id sale del texto y no de la posición, releer el Doc completo o reabrir el enriquecimiento no corre las líneas.
4. **Una mención idéntica suma la cita**: único parcial sobre la `huella` del texto entero, la persona, el cliente y quién pidió, mientras está en `propuesta`.
5. **Candidatas** del sprint de quien la hace, más las lápidas de 28 días (solo las de una persona). Al escribir a mano, `parecidos.ts`, solo sobre lo que ves.
6. **Decidir** con `WHERE estado='propuesta' AND version=?` (evita el bug de flowseed).
7. **Aplicar un acuerdo del chat** dos veces no duplica: `origenId = c:<turno de origen>:<i>` y el desenlace en la misma transacción.
8. **Una fusión nunca junta clientes distintos.**
9. **Un proyecto sugerido no se repite**: huella, único parcial y lápidas de proyectos descartados (§7.4).

---

## 8. Integraciones

**Meet (chokepoint)**

- **Lectores nuevos**: `getReunionesParaTareas({ quien, ids?, serie?, desde?, hasta?, conTranscript? })`, `reunionesDeTuCalendarioParaTareas(quien, q)` y `releerNotasCompletas(quien, sessionId)`, en `lib/sessions`. `quien` es un `AppUserWithTeamMember` (en el job, el dueño de la fuente).
- **Quién puede leer**:
  - una reunión de puertas adentro (`esReunionDePuertasAdentro`), o con dueño cliente **INTERNO** (como «SPRINT COMERCIAL | SMARTEAM»): quien estuvo, quien la organizó o quien lidera el equipo que sigue la serie;
  - con dueño cliente: además, que ese cliente esté en `clientesQueVesParaTareas(quien)`, en una sola consulta que devuelve un conjunto de ids. El job no las lee solo;
  - la sala nunca se decide por `resolvedClientId`.
- **Devuelve** `huellaTexto` y la serie: `serieDe(googleEventId)`, pura, en `meet-sync-cambios.ts`. Sin columna nueva.
- **Desde tareas nunca** se escribe `manualClientId`, `SessionProject`, `adoptarSesionSinDuenio` ni `Client.siglas`.
- **Nuevo en `lib/google`**, con tests: `sincronizarEvento()` (1C), `reabrirEnriquecimiento()` y elegir el adjunto de Gemini al tomar el Doc (también mejora toda la sync).
- **Antes de la primera entrega**: el arreglo de la búsqueda en Drive (`lib/google/drive-candidatos.ts`, sin commit desde el 2026-10-05 en el worktree `elegant-rhodes-995841`) tiene que estar en main.

**Calendar**

- **1A.1**: lo de §5.9. Bloques privados con el JWT aparte (`calendar.events.owned`, que Elías autoriza antes del deploy), lo ocupado con `events.list` sobre tu calendario (con el `calendar.readonly` de siempre) y `esBloqueDeTarea` en el mismo deploy. Si el JWT de escritura falla, cae solo al enlace de plantilla y el resto de Google sigue igual.
- **1C**: verificar los bloques con `events.get` y avisar si se borró uno.
- **Fase 2**: `freebusy` para proponerle un horario a otra persona (rangos, sin títulos).

**HubSpot y el CRM**: §4.4. Solo lectura: nada se escribe en HubSpot ni se sincroniza con sus tareas.

**«Para ti» y avisos**

Una fuente personal `TAREAS` (`frente: null`) en `lib/para-ti/fuentes/tareas.ts`, más su línea en `registro.ts`:

| Pendiente | Cuándo | Para quién |
|---|---|---|
| «Decide 6 tareas del planning» · «Lidia te sugirió 1» (uno por lectura o pedido; se contesta ahí) | hoy · `delAgente` si es de una reunión | quien decide |
| «Nexus sugiere un proyecto: Campaña de SAP» | hoy | quien leyó o el líder del espacio |
| «¿Es Marco Salas?» (dueño dudoso de afuera) | hoy | el líder del equipo que se reunió |
| «3 tareas vencidas» | hoy | responsable |
| «Semana del 5 oct sin revisar · 3 tareas» (mientras dure) | hoy | cada persona |
| «4 de esta semana sin agendar» (no suma al número del menú) | semana | responsable |
| «Revisa tu semana · 5 sin marcar» (viernes 15:00 a lunes 6:00) | hoy | cada persona con tareas en la semana |
| «2 personas no revisaron su semana» (viernes 15:00 a lunes 6:00) | hoy | solo el líder del dato |
| «5 por asignar en Marketing» · «T-31 sin responsable: Lorena ya no está» | semana | el líder, o el admin del espacio libre |
| «Tu plan «Onboarding de kölbi» está en borrador» | semana | quien lo creó |

- **Tipos en `TIPOS_DE_AVISO`**: `tareas.sugerencias`, `tareas.pedido`, `tareas.respuesta` (también la vencida y la que no era suya), `tareas.asignada`, `tareas.cerrada` (alguien revisó contigo), `tareas.arrastre`, `tareas.agregada` (como mucho uno por día), `tareas.dependencia`, `tareas.comentario`, `tareas.mencionada` (alguien dice que también le hace falta tu tarea), `tareas.bloque` (cambiaron tu tarea y tu bloque quedó), `tareas.proyecto` (te nombraron responsable de un proyecto, o decidieron uno que sugeriste) y `tareas.espacio` (te sumaron a un espacio).
- Siempre con `avisar()`, después de escribir, **una vez por destinatario con el texto que le da su serializador**, y nunca a quien hizo la acción. El SUPER_ADMIN no recibe avisos de líder por tener todos los permisos. Lo retroactivo de más de 7 días no avisa, salvo «Avisar igual».
- `PENDIENTES_DE_REUNIONES` (ActionItem) no se toca hasta la fase 3, y no se importan sus ~3.900 filas. La fase 3 se adelanta como etapa 2 de la memoria de la cuenta (9 oct): esa fuente se borra y «Para ti» lee los pendientes de Tareas; `ActionItem` queda DEPRECATED, sin DROP.

**Clientes y proyectos**

- El selector es `CeldaSelect` con `sugerencia`: va en azul con la chispa hasta que alguien la confirma.
- Opciones, ámbito, protección y fusiones: §3 y §4.
- El cliente de una línea se sugiere con `clientePorTitulo` sobre la línea (§7.1, punto 4). El de una reunión de cliente sale de `belongsToClient`. No hay ningún otro emparejado de reunión con cliente: el que estaba previsto para 1C (por el título de la reunión) se retira.
- **Nunca** escribe en `lib/timeline` ni crea un `TimelineTask` o un `Project`.

---

## 9. Pantallas

### 9.1 El inicio en cuatro pasos (R1)

`components/tareas/InicioDeTareas.tsx`, con el texto en `lib/tareas/inicio.ts` (prueba de tuteo) y los pasos en `PasosNumerados`, en una fila de cuatro:

- Titular: «Lo que acuerdan en la reunión, en tu semana y en tu agenda.»
1. **Ten tus reuniones con tu equipo.** Hasta 1C: «El planning del lunes y la retro del viernes, como siempre, con las notas de Gemini encendidas. Después, pide que Nexus la lea con «Leer una reunión».» Desde 1C: «… Tu equipo elige cuáles lee Nexus.»
2. **Nexus propone las tareas y tú las aceptas.** «Nexus lee la reunión y te propone lo tuyo: Usar · Más adelante · Descartar · ¿Es esta? Nada entra solo.»
3. **Agrégalas a tu calendario.** «Cada tarea en su propio bloque de Google Calendar. Nexus te propone el horario.»
4. **Realiza las tareas en la semana y repite el ciclo.** «El viernes revisas tu semana: lo que no terminaste pasa a la siguiente, sin duplicarse.»
- Debajo, una línea: «¿Algo que no salió en la reunión? Anótalo con + Tarea o pídeselo al asistente.» Al pie: «La IA propone; tú decides. Nada entra solo.» Botones: **Empezar** y «Ver el recorrido» (1A.2, `lib/recorridos/contenido/tareas.ts`, grupo «empieza», `roles: "todos"`).
- **Cuándo se ve**: mientras la persona nunca actuó en el módulo (ningún `TareaEvento` con su correo; es un conteo, sin cookie), y desde «Cómo funciona» en la cabecera. Si llegas con `?t=` o tienes algo por decidir, va como una franja plegable arriba: nunca tapa el cajón ni la bandeja.
- **Honestidad**: hasta 1C la lectura la pide alguien. El texto no promete «sola» en el paso 2 ni «tu equipo elige» en el paso 1; mientras el equipo no tiene una fuente, el «Qué sigue» del líder dice «Lee el planning de hoy».

### 9.2 Rutas

| Ruta | Qué tiene | Desde |
|---|---|---|
| `/tareas` · **Mis tareas** | Línea para agregar con «¿Es T-12?» · **Semanas sin revisar** arriba, si hay · **Por decidir** arriba, una vez (tareas y proyectos sugeridos, en azul con la chispa; usar no los pinta de verde ni los mueve) · buscador por texto y T-# · filtro «Para quién» · `Segmentado` **Lista · Tablero · Calendario** · Esta semana (por prioridad; chips de agenda, «pasó 2 veces», «esperando a T-28») · Más adelante · Proyectos en los que estás (con avance) · Lo que pediste · Hechas (2 semanas) · panel: **Qué sigue** (un solo azul: revisar una semana, agendar o decidir), tu semana en horas (con las sin estimar aparte), de dónde salen · cajón con `?t=<id>` · `?revisar=AAAA-MM-DD` abre el diálogo de esa semana | 1A.1 (Tablero y Calendario, 1A.2) |
| `/tareas/equipo?equipo=&semana=` · **Semana del equipo** | Tira «Revisaron su semana» · una columna por persona del sprint («12 h de 32 h», con filas opacas para lo privado) · panel: Por asignar, **Lo pedido a otros equipos** y qué decidieron, proyectos del equipo · «Leer una reunión» · selector de semana · desde 1A.2: **Revisar con el equipo**, `Segmentado` **Personas · Tablero · Métricas** · en 1C, «Configurar» (las reuniones que lee Nexus) | 1A.1 (básica) |
| `/tareas/proyectos/[id]` · **Un proyecto** | Cabecera (responsable, inicia, vence, para quién o «Proyecto de HubSpot» con su chip, avance, «se sumaron N esta semana», vínculos) · si es borrador, una franja con **Activar** y **Descartar** · **Lista · Tablero (por estado o por sección) · Calendario** · el pendiente del proyecto (sin semana) · en 1C, «Guardar como plantilla» | 1A.2 (en 1A.1 un proyecto se abre en su cajón, `?p=`) |
| `/tareas/espacios/[id]` · **Un espacio** | Riel de sus proyectos a la izquierda y el proyecto elegido al centro (`?p=`) · «+ Proyecto» · en un libre, «Miembros» (cajón) | 1A.2 |
| `/tareas/por-cliente` · **Tareas internas por cliente** | §4.3 | 1A.2 |

- Cada ruta tiene su `loading.tsx` con la misma `SHELL_*`, declarada en `PAGE_SHELL_COVERAGE` y `SKELETON_COVERAGE`, con un esqueleto que pinta el mismo `PanelLateral` que la página.
- Las vistas de una lista son `Segmentado` dentro de una ruta, no rutas aparte.
- Sin el SQL, la página muestra un `Alert` que nombra el archivo y las rutas responden 503 (`tareasDisponible()` en `lib/tareas/servidor.ts`).
- Solo primitivas de `components/ui`, tokens semánticos y tuteo.
- **Lista** (`ListaAgrupada`): encabezado por grupo con cuántas y cuántas horas, plegable, con «+ Agregar» al pie. Agrupar por prioridad (por defecto en Mis tareas) · proyecto (por defecto en un espacio) · sección · cliente · persona · semana. Las celdas editables son `CeldaSelect`.
- **Tablero**: columnas fijas Por decidir · Pendiente · En curso · Hecha. Arrastrar aplica las transiciones de `accionesDe()`; pasar a «Hecha» escribe `completadaAt` y `anotarResultado` en su semana; desde «Por decidir» solo arrastra quien decide; a «Por decidir» no se arrastra. En un proyecto, «Agrupar por: Estado · Sección»: por sección, las columnas son las secciones del proyecto más «Sin sección», y arrastrar solo cambia la sección. `orden` guarda el orden a mano. Por teclado, el estado y la sección se cambian en el cajón.
- **Calendario** (de solo lectura): la semana con horas (`AgendaDeLaSemana`), los bloques agendados, una franja «sin hora» por día con lo que vence y «Sin agendar» al costado. Arrastrar una sin agendar a una hora abre Agendar con ese horario.
- **Buscador**: en el navegador sobre lo cargado (sin red) y, con «Buscar en todo», `GET /api/tareas/buscar?q=` sobre lo que ves (`ILIKE` sobre título y notas, o el número de un «T-128»).

### 9.3 Cajones y diálogos

- **Cajón de una tarea** (`Drawer lg`, 560 px, `?t=`): título editable, estado (`Segmentado` Pendiente · En curso · Hecha), Para, semana, vence, horas, prioridad, proyecto y sección («Mover a…»), cliente y proyecto de HubSpot (con `sugerencia`), «Solo para mí», etiquetas, pasos, **Esperando a / La esperan** (con quitar, 1A.2), **Vinculado** (1A.2), agenda, pedido relacionado, «Salió de» (la cita, para quien puede verla), **Comentarios** (1A.2), historia y «Preguntarle al asistente» (1B). No se usa `TaskDetailDrawer`: es deuda del cronograma.
- **Cajón de un proyecto** (`Drawer lg`, `?p=`, 1A.1): sus tareas que ves, avance, responsable, fechas, para quién y «+ Agregar». En 1A.2 lleva a su página.
- **Revisa tu semana** y **Agendar**: el mismo `Modal size="pantalla"`, en dos pasos (§5.8, §5.9).
- **Leer una reunión**: `Modal size="xl"`, en 3 pasos (§5.4).
- **Nuevo espacio** y **Nuevo proyecto** (o desde una plantilla, 1C): `Modal`.
- **Chat**: el panel del asistente a la derecha (§6).

### 9.4 Menú y «+ Tarea»

- «Tareas» justo después de «Para ti», en `components/layout/nav-config.tsx`, con un flyout `dynamicChildren: "tareas"` (`TareasNavFlyout`, calcado del de Roles): Mis tareas · Semana del equipo · Tareas internas por cliente · **ESPACIOS** (los tuyos, por fetch) · «+ Nuevo espacio» · Leer una reunión · Cómo funciona. En 1A.1, sin «Por cliente» ni espacios.
- «+ Tarea» en el pie del menú, junto a Feedback: abre el cajón en modo «nueva», con «Para…».
- **Gate del piloto**, por dato (molde de `superAdminOrSharedDocs`): miembros de Marketing, SUPER_ADMIN, y quien tenga alguna tarea, propuesta o espacio (un `findFirst` en AppShell, solo para quien no pasó lo anterior). Desde la fase 2, `always`. **La página no tiene gate**: cualquiera entra desde un aviso o desde «Para ti».
- Hay que actualizar las listas literales de `lib/ui/nav-gates.test.ts`, `MEDIDOS` de `ancho-del-menu.test.ts` y `DOC_MENU`.

### 9.5 Formas de la interfaz

**Nuevas**, cada una con su prueba y su ratchet, en su propio commit:

| Forma | Qué es | Entrega |
|---|---|---|
| `Modal size="pantalla"` y la prop de cuerpo sin padding | tamaño aditivo, que pisa también `max-h`; la forma del sistema (radio 12, sin sombra, scrim 0,4) va como variante en los retoques, sin mover los otros modales | 1A.1 |
| `AgendaDeLaSemana` | la semana con horas; solo lectura en 1A.1, bloques arrastrables en 1A.2; su geometría pura en `lib` | 1A.1 / 1A.2 |
| `ListaAgrupada` | lista con encabezado por grupo, plegable, con «+ Agregar» (o una prop `grupos` de `Table`) | 1A.1 |
| `SelectorDeRegistro` | búsqueda remota agrupada por tipo, sobre `usePanelFlotante` | fase 2 |

**Se llevan a `components/ui`** porque Tareas es su segundo o tercer uso (copiar está prohibido por §1-UI punto 5):

| Forma | De dónde | Entrega |
|---|---|---|
| `FilaSugerida` (Usar · Cambiar · Más adelante · Descartar · «¿Es T-4?») | la preventa, a `sistema.tsx`, sin contexto | 1A.1 |
| `PasosNumerados` | Feedback › Encuestas | 1A.1 |
| `StatusCircle` (con tokens) e `Iniciales` | el Gantt del cronograma y Feedback | 1A.2 |
| `SelectorDePeriodo` («‹ Semana del 5 al 9 oct ›») | Gastos del mes | 1A.2 (en 1A.1, el selector de semana es un `Select`) |
| `Tablero` / `ColumnaDeTablero` / `TarjetaArrastrable` | la Hoja de ruta de Feedback (dnd-kit, sin KeyboardSensor: el teclado va por el cajón) | 1A.2 |
| `Riel` | las dos copias de preventa y cliente | 1A.2 |

**Se reusan tal cual**: `Segmentado`, `CeldaSelect` con `sugerencia`, `Drawer lg`, `PanelLateral`, `Interruptor`, `DatePickerField` (revisarlo en modo claro antes), `SelectorDeIcono`, el pendiente que se contesta en «Para ti» (molde `PendienteDeTiempos`) y el panel del chat. ⛔ El calendario nunca va en `PanelLateral`: su cookie es global y lo escondería para quien cerró el panel en otra pantalla.

### 9.6 Qué se lleva del diseño v3

- **Tal cual**: Sugerencias, MismaTarea, ParaTi, Configuracion, ElegirReunion, LeerReunion y Rail.
- **Cambian**:
  - Inicio: 4 pasos, con el texto honesto del paso 1 hasta 1C.
  - Agendar: diálogo grande con la semana entera y la duración en chips.
  - Cerrar: pasa a «Revisa tu semana», con «Semanas sin revisar».
  - MenuTareas: espacios en vez del selector de equipo.
  - Semana: filtro «Para quién», la tira de la revisión, «Lo pedido a otros equipos» y sin «Cerrar la semana».
  - Main y Pedido: la «tarea grande» pasa a ser un proyecto («Es parte del proyecto «Campaña de SAP»»), y el pedido dice «Lidia te sugiere…».
  - Tarea: la «tarea grande» pasa a ser un proyecto; suma «Solo para mí», sección y comentarios.
  - Metricas: sin «Alejandra confirmó las 7»; la retro sugiere y cada persona revisa su semana.
- `PorAsignar.dc.html` es de la v2 y no cuenta.

---

## 10. Configuración mínima

Lo único que configura un equipo es **«Reuniones que lee Nexus»** (1C): agregar una desde tu calendario (Nexus toma la serie, el día, la hora y el título de respaldo, y pregunta si es planning, cierre o las dos), pausarla con `Interruptor` y quitarla. Agregar la primera enciende la lectura.

Un espacio libre se configura con nombre, ícono, miembros y quién lo ve. Un proyecto, con sus secciones si las quiere. Nada más.

Lo demás son constantes en `lib/tareas/reglas.ts`: aviso de revisión de viernes 15:00 a lunes 6:00 · corrección de la propia revisión por 7 días · lectura desde `max(fin + 15 min, inicio + 60 min)` · ventana del job de fin + 15 min a fin + 24 h, cada 10 min · propuestas vencen a los 14 días · lápidas de 28 días · aviso desde 3 pases · 40 llamadas automáticas por día y 10 lecturas pedidas por persona · 30 turnos de chat por persona por día y ventana de 12 turnos · 5 etiquetas y 12 secciones · franja de 8:00 a 17:00.

Las banderas del servidor (`TAREAS_CIERRE_AUTOMATICO`, `TAREAS_LECTURAS_ENABLED`) van en `.env.example` y en `lib/jobs/requisitos.ts`, y se cambian sin pantalla. Los equipos salen del área y las horas, de la carga.

---

## 11. Permisos y rutas

- **Lo propio no lleva celda**, como Documentación y «Para ti». Es de todo interno: ver y trabajar lo tuyo, crear, sugerir, decidir lo tuyo, revisar tu semana, comentar lo que ves, crear un espacio libre y sus proyectos, usar plantillas y leer una reunión en la que estuviste.
- **`tareas.manage`** (`enforced: true`, override por persona en /team): asignar directo en su sprint, repartir «Por asignar», marcar con otra persona las tareas de su sprint en la retro, corregir una revisión del sistema, elegir las reuniones, administrar el espacio de su equipo y subir plantillas a toda la casa. Vale solo en sus equipos (`puedeLiderar`). El SUPER_ADMIN puede actuar en cualquiera, pero no recibe los pendientes de líder.
- **Espacio libre**: sus `admin` cambian nombre, miembros y visibilidad, y archivan; sus miembros crean, editan y se asignan tareas entre sí.
- **Chat**: `asistente.read`, que tienen CSE, Ventas, Dev, CSL, Marketing y SUPER_ADMIN. Admin (Dinia) no la tiene (pregunta 5). Aplicar no pide celda: lo frenan `accionesDe`, la visibilidad, `nacePropuesta` y `puedeLiderar`. El chat nunca da más de lo que la persona ya podía hacer.
- **La lectura con IA** no lleva celda: la frena el tope de 10 lecturas pedidas por persona por día.
- **Rutas**, todas con Zod (`lib/tareas/schema.ts`), `guardInternalUser` + `visibilidad.ts` y 503 sin el SQL:
  - `POST /api/tareas` · `PATCH /api/tareas/[id]` (con `version`; 409 si no coincide) · `POST /api/tareas/[id]/decision` · `POST /api/tareas/[id]/agenda` · `GET /api/tareas/buscar`;
  - `POST /api/tareas/semana/revisar` (la tuya, o las tareas del sprint que lideras; responder, cerrar y corregir);
  - `GET /api/tareas/agenda/semana` (tu calendario de la semana, solo el tuyo);
  - `POST /api/tareas/leer-reunion` (corre en segundo plano con `after()`) · `GET /api/tareas/lecturas/[id]` (solo quien la pidió, o quien pase `getReunionesParaTareas({quien, ids:[sessionId]})`; el `resumen` sale por el serializador);
  - `GET /api/tareas/opciones` (y `?clientId=`, 404 fuera de tu conjunto);
  - `POST /api/tareas/proyectos` · `PATCH /api/tareas/proyectos/[id]` · `POST /api/tareas/proyectos/[id]/decision` (usar, activar, descartar);
  - 1A.2: `POST|DELETE /api/tareas/[id]/relaciones` · `POST|DELETE /api/tareas/[id]/vinculos` · `GET|POST /api/tareas/[id]/comentarios` · `PATCH /api/tareas/comentarios/[id]` · `POST /api/tareas/espacios` · `PATCH /api/tareas/espacios/[id]` · `POST|DELETE /api/tareas/espacios/[id]/miembros`;
  - 1B: `GET|POST /api/tareas/asistente` · `POST /api/tareas/operaciones`;
  - 1C: `POST /api/tareas/fuentes` · `GET /api/tareas/agenda/estado` · `POST /api/tareas/proyectos/[id]/plantilla` · `POST /api/tareas/plantillas/[id]/usar`.

---

## 12. Guardas e invariantes

**`lib/tareas/guardas.test.ts`** (y vecinas):

- solo `mutaciones.ts` escribe las tablas de tareas, comentarios incluidos (`LecturaDeReunion` también `lectura.ts`, y desde la fase 3 la cola de la lectura de seguimiento, `lib/lecturas/cola.ts`, que solo toca las columnas `seguimiento*` y crea la fila cuando no existe); solo `anotarResultado()` escribe `ResultadoDeSemana`;
- `lib/tareas` no escribe `Project`, `Client` ni `TimelineTask`, ni llama a escritores de HubSpot;
- `lib/hubspot`, `lib/projects`, `lib/timeline`, `app/external/**` y `lib/external/**` no importan `lib/tareas`;
- **censo de lectores** (`lib/tareas/lectores.test.ts`, molde de `lib/exploraciones/lectores.test.ts`), con el regex `/@\/lib\/tareas\/|\.tarea\b|\.proyectoDeTareas\b|\.tareaEvento\b|"Tarea"/`: ningún lector en kickoff, entrega, diagnóstico, cronograma, external, print, landing, `lib/contexto`, `app/api/clients/[id]/analyze` ni en los agentes que escriben documentos;
- **el censo nuevo (fase 3, 9 oct)**: los agentes INTERNOS (el vigía, la memoria interna del proyecto y el avance) leen tareas por UNA sola puerta, `lib/tareas/para-agentes.ts`, que devuelve título, para cuándo, estado y lado (cliente o Smarteam), nunca la cita, el contexto, las notas ni lo privado. Entran al censo, cada uno con su destino: `lib/lecturas/cola.ts`, `lib/sessions/post-process.ts`, `lib/cs/watchdog-context.ts` (por esa puerta), la memoria interna del proyecto (`lib/memoria`, solo su alcance interno) y la página de la reunión. Nada que ve el cliente lee tareas: ni los documentos de cara al cliente, ni el correo de seguimiento, ni la vista externa (DECISIONS «La lectura de cada reunión es durable…»);
- `lib/agents`, `lib/canvas`, `lib/ai`, `lib/asistente` y, desde la fase 3, `lib/cs` no leen `Tarea.cita`, `ProyectoDeTareas.cita` ni `TareaEvento.cita`, y la historia que va al chat no los nombra;
- desde la fase 3, ninguna escritura `actionItem.(create|createMany|upsert)` en `lib/`, `app/` ni `components/` (`lib/sessions/action-item-retirado.test.ts`);
- ninguna escritura de `TareaEvento.datos` lleva una clave `cita`;
- `lib/tareas` no lee reuniones fuera del chokepoint (`firefliesSession`, `session:`, `lectura: { session`) ni importa `lib/google/drive-files` o el parser de Docs;
- ninguna consulta filtra por espacio fuera de `enEspacioWhere`;
- cada FK de `TareaVinculo` tiene su regla de lectura en `serializar.ts`, y también cada relación de `Tarea` hacia `Tarea` (`TareaRelacion`, `mismaQueId`);
- `lib/tareas/serializar.ts` queda declarado en el censo de `lib/exploraciones/lectores.test.ts`, y el selector de preventas usa `DE_LA_PREVENTA`;
- las consultas de trabajo usan `donde.ts` (sin propuestas, vencidas ni lápidas);
- el SQL tiene RLS + RESTRICTIVE en las 13 tablas y no tiene `/DROP\s+(TABLE|COLUMN)/`;
- `clientesQueVesParaTareas` coincide con `requireAccessToClient` (test con filas reales en `nexus_test`);
- tuteo en el copy, el inicio y los prompts; las anclas del recorrido existen;
- en `lib/asistente`: §6.8.

**`lib/invariantes/tareas.ts`** (en `invariants-daily`; todos `cumple` / `viola`):

- `tarea.projectId` ⇒ `project.clientId == tarea.clientId`; lo mismo en `ProyectoDeTareas`;
- una tarea en un proyecto con cliente o con proyecto de HubSpot tiene los mismos;
- nunca el contenedor «Información del cliente» como `projectId`;
- hecha ⇔ `completadaAt`;
- ninguna tarea abierta en una semana que su responsable ya revisó;
- ninguna tarea sin responsable con semana;
- ninguna fusión entre clientes distintos;
- **ninguna tarea ni evento lleva la cita de una reunión cuyo dueño es otro cliente** (si el dueño de la reunión se corrigió después, lo dice para que una persona lo arregle);
- sin ciclos en `bloquea`;
- espacio de tipo `equipo` ⇔ tiene clave de equipo;
- `TareaVinculo` con un dueño y un destino;
- **ninguna tarea abierta en un sprint sin miembros activos** (el job del lunes la reparte).
- Lo de alguien dado de baja **no** es invariante: lo resuelve el job del lunes.

---

## 13. Entregas por fases

En cada entrega: `tsc` en 0, la suite, `/ship-nexus` antes de commitear. En la que trae el SQL, antes del deploy: correr los SQL que falten, `npx prisma generate` y `npm run check:esquema` en verde, sin ningún faltante.

**Orden**: antes del código → 1A.1 (el piloto) → **1B (chat) y 1A.2 (lo flexible) en paralelo**, ninguno lleva SQL → 1C → 2 → 3. 1A.1 ya es un sistema de tareas usable; 1A.2 y 1B lo completan en días, no semanas. ⚠ La fase 3 se adelanta (9 oct): es la etapa 2 de la memoria de la cuenta y va con Tareas en producción, sin esperar a 1C ni a la fase 2.

| Fase | Qué sale | SQL | Cómo se prueba |
|---|---|---|---|
| **Antes del código** (cada punto en su commit, ninguno trae tareas) | **Los SQL pendientes de otras sesiones**: hoy `prisma/schema.prisma` tiene unas 107 líneas sin commitear y 6 SQL sin trackear (2026-10-07 clasificacion-de-cuenta, exploracion-del-proyecto, nota-de-la-alerta, presentacion-del-diagnostico, solicitudes-fuera-de-alcance; 2026-10-08 metas-y-vendedor). Se commitean y se corren en producción con sus dueños, o el schema de tareas se agrega con `git add -p` sin arrastrarlos; en cualquier caso, `check:esquema` lista todo lo que falta antes del deploy · DECISIONS (lista de abajo) · el arreglo de Drive en main · el arreglo de la fusión de fichas con su test de cobertura de `SE_MUDAN`, después del commit de `ClasificacionDeCuenta` · `AREA_OPTIONS` a `lib/sessions/areas.ts` · una consulta de solo lectura: qué proyecto de SmartAgro está activo y marcado interno (respuesta a la pregunta 3) · Elías autoriza `calendar.events.owned` · `scripts/tareas-ensayo.ts` corre las funciones puras de la lectura apenas existen, sin escribir | — | El test de cobertura en verde. `check:esquema` sin faltantes de otras sesiones. Con el permiso, crear y borrar un bloque privado de prueba en el calendario de Elías (sin Meet ni invitados). El enlace de plantilla abre bien. El ensayo imprime, sobre el planning del 29 sep, la retro del 2 oct y el planning del 5 oct: líneas, dueños (T-9, T-13 y T-14 con su dueña), menciones, gemelas, «¿es esta?», clientes sugeridos (Colby, Ecoquintas), si propone «Campaña de SAP» y los tokens |
| **1A.1 · Piloto de Marketing** (meta: deploy antes del lun 19 oct) | `lib/tareas` (estados, reglas, semana, equipos y espacios, personas, fechas, ámbito, clientes, visibilidad, serializar, mutaciones, donde, lectura e ia, agenda, métricas mínimas, schema, servidor, inicio) · lectores del chokepoint · «Leer una reunión» (niveles 0 y 1, con grupos, cliente por línea y «Avisar igual») · propuestas, «¿Es esta?», sugerencias y pedidos, «Para ti» y avisos · Mis tareas en Lista con «Semanas sin revisar», filtro «Para quién» y buscador · cajón con cliente, proyecto de HubSpot, proyecto y «Solo para mí» · proyectos a mano y sugeridos en el espacio del equipo (cajón del proyecto) · Agendar (`Modal pantalla`, `AgendaDeLaSemana` de solo lectura, selectores, duración en chips) + `esBloqueDeTarea` · «Revisa tu semana» por persona, también de semanas pasadas · Semana del equipo básica · inicio de 4 pasos · menú con gate y «+ Tarea» · `FilaSugerida` y `PasosNumerados` · invariantes, guardas, censo, `SE_MUDAN` y `TABLAS` | **`scripts/sql/2026-10-XX-tareas.sql`, el único**: las 13 tablas con FK idempotentes, CHECK, únicos parciales, RLS + RESTRICTIVE y la consulta de verificación. `TAREAS_CIERRE_AUTOMATICO` en `.env.example` | Pruebas puras (estados, `nacePropuesta`, `semanaDestino` con piso en hoy, revisión de una semana pasada, ámbito con SmartAgro y «sin clasificar», fechas, horarios, enlace de plantilla, lectura con las tres menciones, grupos y salida de la IA) + `guardas.test.ts` + `ciclo.int.test.ts`: aceptar en una semana revisada cae en la siguiente; revisar el viernes y crear el sábado; «Sigue» desde una semana pasada cae en la de hoy con un solo pase; dos pedidos iguales de dos personas no se funden; una fusión entre clientes se rechaza; una tarea con otro cliente que su proyecto se rechaza; un CSE sin la cuenta ve el título en su sprint y no la cita. En local, una reunión interna `fx-` con notas de Gemini en `scripts/seed-fixture.ts`. En producción, el piloto de abajo |
| **1B · Chat de tareas** (después de 1A.1, en paralelo con 1A.2) | §6 entero, en Mis tareas, la Semana del equipo, un proyecto y un espacio, con los chips de tarea, proyecto y reunión · el carril por pieza y lo de §6.8 · DECISIONS: el chat adelantado y la cuarta forma de `Dueno` | — | `probar-asistente.ts` con «anótame…», «sugiérele a Marco…», «asígnale a Lidia…» (como líder y como par) y «un plan de onboarding de 30 días para un cliente `fx-`»: días hábiles, dependencias, entra como borrador, ninguna duplicada con doble clic ni con el desenlace perdido, un pendiente no cambia de cliente entre turnos, costo medido con `countTokens` en frío y con historia |
| **1A.2 · Lo flexible y lo que el piloto no usa** (en paralelo con 1B) | Tablero (por estado y por sección) y Calendario · arrastre en `AgendaDeLaSemana` · espacios libres con miembros y su página con el riel · página del proyecto con su borrador · secciones · etiquetas · comentarios · dependencias · vínculos (enlace de HubSpot, propuestas y preventas) · «Tareas internas por cliente» · métricas con «cómo entran» y por cliente · nivel 2 · «Revisar con el equipo» · «Corregir mi semana» tras el sistema · job `tareas-semana-lunes` (cierre automático apagado) · recorrido · `StatusCircle`, `Iniciales`, `SelectorDePeriodo`, `Tablero`, `Riel` | — | Elías crea el espacio «Evento SmartAgro» con Lidia y le asigna una tarea directo; Marketing ve «Campaña de SAP» en tablero por secciones; «Por cliente» muestra Colby, Ecoquintas y Discover Puerto Rico con sus tareas, y SmartAgro en «Interno»; una tarea privada de Marco no se ve en el sprint de Andrés |
| **1C · Automático y plantillas** | `FuenteDeTareas` y «Reuniones que lee Nexus» · `sincronizarEvento()` · job `tareas-lecturas` (en `requisitos.ts` y la tabla de jobs del RUNBOOK) · `reabrirEnriquecimiento` · verificación de los bloques · «Guardar como plantilla» y «Nuevo desde una plantilla» · `proyecto.desde_plantilla` en el chat · el texto del paso 1 del inicio | — (las tablas ya están) · `TAREAS_LECTURAS_ENABLED` en `.env.example` | El planning de un lunes deja sugerencias a 45 min o menos del fin, sin que nadie abra una página. Una fuente de alguien dado de baja se pausa sola. Un bloque borrado en Calendar aparece como «Ya no está en tu agenda» |
| **2 · Todo Nexus** | Menú `always` · CS, Ventas, Desarrollo, Admin y PM con sus reuniones (y las notas de Gemini activadas) · «Pegar notas o subir un documento» (CS y Software no tienen transcripts) · adjuntos en la tarea (reusando `SumarFuente` y `ClientDocument`) · `SelectorDeRegistro` con búsqueda en HubSpot · vincular una reunión cualquiera · «Tareas internas» en la ficha del cliente y su chip en el chat · el chat lee el cronograma del proyecto de HubSpot · columna de avance del cronograma en «Por cliente» · `freebusy` para proponerle horario a otra persona · horas de CS con la carga · vista de mes | — · **Antes**: un script (simulacro primero, `resolverApply({ tablas: ["FirefliesSession"] })`) que reabre las reuniones de esas series que quedaron selladas antes de ocurrir | Un sprint de CS y uno de Ventas en vivo. «Para ti» sin listas duplicadas |
| **3 · Reuniones de cliente** (adelantada el 9 oct: es la etapa 2 de la memoria de la cuenta, `docs/memoria-de-la-cuenta-plan.md`) | La lectura de cada reunión con un cliente o un prospecto (el post-proceso) usa la **misma** fila `LecturaDeReunion`, con su estado en `seguimiento*`, por la cola `lib/lecturas/cola.ts` y el job `seguimiento-reuniones` · en la **misma** pasada, los compromisos de Smarteam pasan a propuestas de `Tarea` para quien se comprometió, y los del cliente a tareas de seguimiento para el CSE, con la cita verificada y la marca «frena el plan», por `escribirPropuestasDeLectura` y con candidatas solo del mismo cliente; en un prospecto, el seguimiento va a quien lleva la preventa viva (sin preventa, solo lo de Smarteam) · `PENDIENTES_DE_REUNIONES`, el GPS, la página de la reunión y el vigía leen `Tarea`, con la visibilidad de Tareas · `ActionItem` se retira: DEPRECATED sin DROP, sin escritores, y lo histórico no se importa · los agentes internos leen Tareas solo por `lib/tareas/para-agentes.ts` | **`scripts/sql/2026-10-10-lectura-de-seguimiento.sql`**: 5 columnas aditivas `seguimiento*` en `LecturaDeReunion`, con su CHECK y su índice, después del SQL de Tareas · `SEGUIMIENTO_REUNIONES_ENABLED` en `.env.example` | Una reunión de cliente deja sugerencias sin subir el costo de post-process (`LlmCall.origen = "reunion:<sessionId>"` y `scripts/comparar-lectura-de-reuniones.ts`). INV44 en verde a las 24 h |

**Orden dentro de 1A.1**, para no frenar el piloto (cada paso en su commit):

1. `FilaSugerida` y `PasosNumerados`, y el tamaño `pantalla` del `Modal`;
2. el modelo, el SQL, `lib/tareas` puro, `mutaciones.ts` y sus pruebas, invariantes, guardas y censo;
3. la lectura, «Leer una reunión» y el ensayo sobre el código real;
4. Mis tareas, propuestas, «¿Es esta?», sugerencias y pedidos, «Para ti», el cajón y los proyectos;
5. Agendar + `esBloqueDeTarea`;
6. «Revisa tu semana», «Semanas sin revisar» y la Semana del equipo básica;
7. el inicio y el menú.

**Fecha límite**: hoy es viernes 9 oct. La meta es el deploy de 1A.1 antes del planning del lunes 19 oct. Si no llega, el piloto arranca igual con la lectura retroactiva del 5 oct (lo decidiste así) y se pone al día en orden; cada semana de atraso suma un par planning y retro a leer.

**El piloto, con fechas reales**:

1. La retro de hoy (vie 9 oct) ocurre antes del código. Se lee después, igual que el planning.
2. Deploy de 1A.1. `TAREAS_CIERRE_AUTOMATICO` apagada y `CIERRE_AUTOMATICO_DESDE` en el lunes siguiente a la salida de 1A.2.
3. **Primera lectura en Nexus: el planning del lun 5 oct, 9:30** (rol planning → semana del 5 oct), con **«Avisar igual»**: tiene más de 7 días y sin la casilla no avisaría.
   - Está en dos filas: `07iqe725…` (9:30) tiene notas de Gemini de 8.276 caracteres con los Próximos pasos; `6agp4b…` (10:00) tiene 379. Las dos tienen el mismo transcript de 29.666 caracteres. Se lee la de las notas y la otra queda `copia`.
   - Trae 16 líneas con dueño en el corchete (9 de Alejandra, 7 de Lidia). T-9, T-13 y T-14 nombran a Alexander o a Marco en el detalle: quedan como menciones, con su dueña. Como 3 líneas comparten raíces (SAP), Haiku corre una vez (unos US$0,003) y sugiere el proyecto **«Campaña de SAP»** con T-3, T-6 y T-13. Nexus sugiere Colby en T-8 y T-9 y Ecoquintas en T-15.
4. Alejandra y Lidia deciden sus 16 propuestas, los clientes sugeridos y el proyecto. Lidia, desde T-13, le sugiere **T-17** a Alexander Vanegas dentro del proyecto: le llega a su sprint de Customer Success.
5. Se lee la **retro del vie 9 oct** (rol cierre). Cada una abre «Semanas sin revisar · semana del 5 oct», prellenada por la retro. Lo que sigue pasa a la semana de hoy y se agenda en el paso 2.
6. Si el deploy fue la semana del 19: se leen el **planning del 12 oct** (la prueba de fuego de «¿Es T-4?») y la **retro del 16**, y cada una revisa la semana del 12. Desde ahí, en vivo.
7. Cuando sale 1A.2 y las dos revisaron sus semanas pasadas, se prende `TAREAS_CIERRE_AUTOMATICO`.
8. Se mide: aceptadas tal cual, con cambios, rechazadas, vencidas, duplicados detectados, clientes sugeridos aceptados, % agendadas y costo.

**Retoques de diseño (R12)**: después de 1A.1, una vuelta sobre lo que no tuvo tablero de diseño: «Revisa tu semana» y «Semanas sin revisar», Agendar grande, Tablero con secciones, Espacio y Proyecto (con su borrador), comentarios y el panel del chat de tareas. La variante de forma de `Modal` y de `Drawer` (título 18/26, sin sombra, scrim 0,4, radio 12) entra ahí, sin mover los cajones del resto de la app.

**DECISIONS, antes del código** (en 1A): un proyecto de tareas nunca es un `Project` · una tarea vive en el sprint de casa de su responsable · la clave del equipo es la del área · sugerir es proponer (directo solo el líder o entre miembros de un espacio libre) · `clientesQueVesParaTareas` y la excepción de `kinds:"all"` más INTERNO · en tu sprint ves lo de tu equipo con su cliente, y lo que se protege es lo que no es la fila · tareas privadas · el ámbito «sin clasificar» y la regla de SmartAgro · cada persona revisa su semana (supera «cierra el líder»), y lo que sigue nunca cae en el pasado · la tarea grande se reemplaza por el proyecto · tablero de columnas fijas, secciones y etiquetas dentro (supera «fuera: kanban y etiquetas») · `TareaVinculo` sin llamadas a HubSpot al leer y con falla cerrada · un solo SQL con el modelo entero (supera «cada tabla en su fase») · Agendar en un diálogo grande, solo la dueña escribe su calendario, y un solo panel derecho a la vez · `tareas.manage` es la fuente del líder de un sprint, y `LIDERAR_CS` es otra cosa. En 1B: el chat adelantado, la cuarta forma de `Dueno` («como mucho uno; ninguno = hilo personal»), el carril por pieza y los planes como borrador.

**En cada fase** se actualizan DECISIONS, GLOSSARY (tarea, propuesta, lápida, vencida, espacio, proyecto de tareas, sección, borrador de un plan, «Revisa tu semana», «Semanas sin revisar», ámbito, sin clasificar, tarea privada, vínculo, plantilla, asistente de tareas), la tabla de jobs del RUNBOOK y `sync:test-files` de ARCHITECTURE.

---

## 14. Riesgos

| Riesgo | Qué se hace |
|---|---|
| 1A crece y atrasa el piloto | 1A.1 solo con lo que recorre el piloto, con fecha límite. Lo flexible (1A.2) y el chat (1B) salen después, en paralelo y sin SQL |
| Un deploy arrastra modelos de otras sesiones sin su tabla | Sus SQL primero, `git add -p` para el schema de tareas y `check:esquema` sin faltantes antes de desplegar |
| «Proyecto» nombra dos cosas | En el código, `ProyectoDeTareas`, nunca `Project`. En pantalla, «Proyecto» y «Proyecto de HubSpot» con su chip (pregunta 7) |
| Alguien crea un `Project` desde tareas | Guarda: `lib/tareas` no escribe `Project` ni HubSpot. El alta sigue en `lib/projects/alta.ts` |
| Dos planes del mismo proyecto de cliente (el cronograma y un proyecto de tareas) se separan | El chat nunca toca el cronograma, lo lee en la fase 2 y dice que el cliente ve el cronograma (pregunta 2) |
| El contexto del chat del Super Admin trae toda la casa | `contextoDeTareas` se recorta a lo suyo y a sus espacios; nunca `tareasVisiblesWhere` tal cual |
| El hilo del chat crece para siempre | Ventana de 12 turnos desde el último acuerdo aplicado; la historia queda en el hilo pero no se reenvía |
| Un pendiente del chat cambia de persona o de cliente entre turnos | El acuerdo se guarda con ids reales, nunca con M#/C#/R# |
| Aplicar a medias o dos veces duplica (pasó en documentos) | Todo o nada en una transacción, el desenlace en la misma transacción, `origenId` con el turno de origen, 409 si el acuerdo no es el vivo |
| Un carril olvidado trata las tareas como un documento | `carrilDeLaPieza` con switch exhaustivo |
| Fechas inventadas o corridas (el contenedor corre en UTC) | El modelo usa `cuando` y `dia` (hábil); una fecha exacta solo si la escribió la persona; el código calcula con `hoyEnCostaRica` y `semanaDestino`, y la línea muestra la fecha antes de aplicar |
| El chat confunde una persona con un pendiente | Personas como `M#`; `P#` queda para el libro de pendientes |
| Un CSE ve en su sprint tareas de cuentas que no tiene | Es la regla que pediste (decisión 16, pregunta 9). Lo que no es la fila (cita, reunión, vínculos) sigue protegido, y lo de dirección va como «Solo para mí» |
| Fuga de un cliente por la cita, un vínculo, un aviso o una tarea que no ves | Un solo serializador; la cita con la regla del chokepoint al leer; vínculos con su empresa resuelta y falla cerrada; avisos con el texto de cada destinatario; relaciones hacia tareas que no ves, sin título |
| Una reunión cuyo dueño se corrige deja citas pegadas a otro cliente | La cita se ve con la regla del chokepoint al momento de leer; el invariante lo señala |
| Dos pedidos iguales de dos personas se funden y uno se pierde | El único de propuestas lleva el cliente y quién pidió |
| Lo vencido se trata como rechazado | Estado `vencida`, que no es lápida |
| Un proyecto sugerido sale cada semana | Huella, único parcial y lápidas de proyectos |
| Los nombres en el detalle de una línea generan pedidos falsos | El dueño sale solo del corchete; los nombres del detalle son menciones |
| SmartAgro sin proyecto cae en «cliente» | Regla 3 del ámbito, verificada en solo lectura antes del código (pregunta 3) |
| Todo lo que nadie clasificó infla «Interno» | Ámbito propio «Sin clasificar», con el cliente sugerido por línea |
| La fusión de fichas ya pierde datos hoy | El arreglo y su test de cobertura, antes de sumar tareas |
| Cerrar por persona cambia el ritual de la líder | La retro sigue: la líder marca con el equipo las tareas de su sprint. Si prefieres que cierre la líder, el diálogo es el mismo (pregunta 6) |
| El piloto retroactivo deja tareas en semanas pasadas | «Semanas sin revisar» siempre a la vista; lo que sigue salta a la semana de hoy con un solo pase |
| El tablero se usa como estados nuevos | Columnas fijas; las secciones agrupan y no son estado |
| Costo del chat (Sonnet) contra «pocos tokens» | Tope de 30 turnos, ventana de historia, pensamiento bajo, plantillas a 0 tokens, «+ Tarea» sin IA, medir antes de prometer |
| La geometría del calendario falla en silencio | Función pura con prueba; sin medida no se mueve; horas en CR, las pasadas deshabilitadas; el arrastre llega en 1A.2 |
| Un bloque queda en el calendario equivocado | Cada bloque guarda su calendario; solo la dueña lo mueve o lo quita |
| Paneles que se tapan (chat, Feedback, cajón, diálogo) | Un solo panel derecho a la vez; Agendar desde el cajón con `zClass("MODAL")` |
| Extraer formas rompe pantallas vivas (Feedback, preventa, Gantt) | Cada extracción en su commit, con sus pruebas, sin cambiar lo que ya muestran; solo dos en 1A.1 |
| La búsqueda en HubSpot comparte el límite con los sync | En 1A solo se pega un enlace. En la fase 2: desde 2 letras, con pausa y caché de 60 s |
| El job de lecturas consulta Google de más | Solo en la ventana de cada fuente y cada 10 minutos |
| El inicio promete lo que todavía no hay | El texto de los pasos 1 y 2 cambia en 1C |
| CS y Software sin texto de sus rituales (0 transcripts) | Notas de Gemini en sus reuniones y «Pegar notas» en la fase 2, antes de abrirles el menú |
| ActionItem y Tarea, dos listas de pendientes por cliente | Se ordena en la fase 3, adelantada como etapa 2 de la memoria de la cuenta: `ActionItem` se retira (DEPRECATED, sin DROP) y no se importa. La página dice «Tareas internas» para no confundirlas |
| El enlace de plantilla de Calendar no es un contrato de Google | Función pura con prueba, verificada antes del deploy; es solo el respaldo |

## 15. Fuera, a propósito

- estados configurables (las secciones agrupan, no son estado);
- varios responsables por tarea (pregunta 1) y subtareas con dueño dentro de una tarea;
- carpetas dentro de un espacio, campos personalizados y automatizaciones («cuando pase X, haz Y»);
- reprogramar en cadena por dependencias;
- sprints de duración variable, story points, burndown y velocity;
- tareas recurrentes (las plantillas cubren lo que se repite);
- adjuntos hasta la fase 2;
- permisos por proyecto e invitados externos;
- que la IA cree, decida, cierre, agende, active o archive sola;
- Sonnet en lo automático; una segunda herramienta en el chat;
- el chat escribiendo el cronograma del cliente o creando un `Project`;
- escribir en HubSpot o sincronizar con sus tareas;
- tareas que vea el cliente;
- agendar sin tu clic, en el calendario de otra persona, y la opción «no lleva bloque» para una tarea de la semana;
- migrar ActionItem;
- correo o Slack; Batch API; un interruptor general del agente;
- una vista de Dirección («Por cliente» es sobre lo que cada uno ve).

## 16. Preguntas para Elías (y lo que se codea mientras tanto)

1. **«Responsables»: ¿una persona por tarea o varias en la misma tarea?** Mientras tanto: una; lo de varias personas son tareas separadas del mismo proyecto.
2. **El plan de onboarding de 30 días: ¿son tareas internas del equipo o el cronograma que ve el cliente?** Mientras tanto: un proyecto de tareas interno, en borrador, sin tocar el cronograma.
3. **SmartAgro: ¿es interno siempre?** Mientras tanto: interno si todos sus proyectos activos están marcados internos en HubSpot (lo verifica una consulta de solo lectura antes del código), tenga o no proyecto la tarea.
4. **En la ficha del cliente, ¿quien puede abrir ese cliente ve todas sus tareas internas?** Mientras tanto (fase 2): ve las que ya puede ver por su sprint o sus espacios, con título, responsable y estado, sin cita.
5. **¿Admin (Dinia) tiene el chat?** Mientras tanto: no, salvo un override de `asistente.read`.
6. **¿Revisa cada persona su semana, o prefieres que siga cerrándola el líder?** Mientras tanto: cada persona, y la líder marca con el equipo las tareas de su sprint en la retro.
7. **El nombre: ¿«Proyecto» para el de tareas?** Mientras tanto: «Proyecto», y el de HubSpot con su chip «Proyecto de HubSpot».
8. **«Por cliente»: el Super Admin ve ahí todos los equipos. ¿Está bien, aunque no haya vista de Dirección?** Mientras tanto: sí, porque ya lo ve todo; nadie más ve más de lo suyo.
9. **En tu sprint, ¿ves también las tareas de las cuentas que no tienes?** Un CSE vería los títulos de las tareas de las cuentas de sus compañeros. Mientras tanto: sí, porque dijiste «cada persona ve lo suyo y lo de su equipo»; la cita, la reunión y los vínculos de esas cuentas siguen ocultos, y lo sensible va como «Solo para mí». Si no, las filas de clientes que no ves se ocultan («2 tareas de clientes que no ves») y cuentan solo como horas.
10. **Dentro de tu equipo, ¿un compañero te puede asignar una tarea directo?** Mientras tanto: no, te la sugiere y decides tú; directo solo tu líder, o un compañero de un espacio libre donde están los dos.

---

## 17. Las tareas que nacen del plan del proyecto (propuesta del 2026-10-22, nada construido)

Sale de `docs/actividades-plan.md` (las actividades de cada caso de uso). La lectura de producción de ese día: en 45 días
a los cinco CSE les nacieron 105 tareas de reuniones, **0 aceptadas y 0 hechas**, 37 vencidas sin decidir. Sumarles las
del handoff a «Por decidir» repetiría eso. La propuesta son tres puertas a una sola lista por persona:

1. **El plan del proyecto**: nace en el handoff, una tarea por actividad vendida. Ya está vendido, así que no pasa por
   «Por decidir»: vive en la lista del cliente y sube a «Para ti» solo lo de la semana.
2. **Lo que se dijo con el cliente** (lo de hoy): compromisos y seguimientos de las reuniones, por «Por decidir» con tope.
3. **Lo que se dijo puertas adentro**: en una reunión interna alguien pide algo; Nexus crea la tarea para quien la
   hace y una de revisión para quien la pidió (roadmap, área H).

## Autorizar el permiso de Calendar (lo hace Elías, antes del deploy de 1A.1)

Nexus ya tiene una cuenta de servicio con delegación de todo el dominio. Hay que sumarle UN permiso a la lista que ya tiene, sin borrar los otros.

1. Entra a **admin.google.com** con una cuenta de superadministrador de smarteamcr.com.
2. **Seguridad → Acceso y control de datos → Controles de API → Gestionar la delegación de todo el dominio**.
3. Busca la fila de la cuenta de servicio de Nexus (la que ya tiene los permisos de Drive, Docs y Calendar de lectura) y haz clic en **Editar**.
4. En «Permisos de OAuth», deja los que ya están y agrega, separado por coma:
   `https://www.googleapis.com/auth/calendar.events.owned`
   La lista completa queda así (en una sola línea):
   `https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/documents.readonly,https://www.googleapis.com/auth/calendar.readonly,https://www.googleapis.com/auth/admin.directory.user.readonly,https://www.googleapis.com/auth/calendar.events.owned`
5. **Autorizar**. Puede tardar hasta 24 horas en aplicarse (casi siempre unos minutos).

⚠ Si al editar se pierde alguno de los permisos de antes, la sincronización de Meet deja de funcionar: revisa que la lista final tenga los cinco. Si la fila muestra otros permisos además de esos cuatro, consérvalos también.

`calendar.events.owned` deja ver, crear, cambiar y borrar eventos **solo en los calendarios de los que la persona es dueña** (su calendario principal). No da acceso a los calendarios que otros le compartieron. Nexus lo usa solo con el clic de la dueña de la tarea, y crea los bloques como privados. Leer lo ocupado de tu propia semana usa el `calendar.readonly` que ya está.
