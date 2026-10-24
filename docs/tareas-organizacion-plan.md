# El módulo de Tareas, organizado y profesional — plan

> Pedido de Elías del 2026-10-23, con dos referencias: la tarjeta de Trello (título, descripción, miembros, etiquetas,
> fecha, checklist y actividad, con «Agregar a la tarjeta» a la derecha) y la barra lateral de clientes de ClickUp.
> Validado contra el código y la base de producción en solo lectura el mismo día. **Nada construido.** En el roadmap es el
> área P. El plan de fondo del módulo es `docs/tareas-plan.md`; este cubre la organización y la vista.

## Lo que hay hoy

- **Las vistas:** Mis tareas (Lista, Tablero y Calendario), Lo que delegaste, Semana del equipo, Por cliente y los
  espacios de cada persona.
- **El filtro «Para quién»** es por tipo de empresa (Cliente, Interno, Prospecto, Aliado, Sin clasificar), no por una
  empresa. «Tus proyectos» y «Tus espacios» van a la derecha. «Capacitación» no existe.
- **La tarea se abre en un cajón** de 560 px, con este orden:
  - el contexto y «Qué hay que hacer»;
  - el estado;
  - «Para» (la persona), semana, vence y prioridad;
  - **«Cuánto toma»**;
  - **«Para quién»** (la empresa);
  - el proyecto;
  - **«Notas»**;
  - la agenda, «Salió de», etiquetas, dependencias, comentarios e historia.

  «Para» y «Para quién» se confunden.
- **La tarea como sesión existe en la base pero no en la pantalla:** los campos `clase`, `invitados`, `reunionInicio` y
  `reunionHechaId` están en la tabla. En producción hay 0 tareas de clase reunión, y nada escribe `reunionHechaId`.
- **El calendario:**
  - «Agendar» crea un bloque nuevo en el calendario de la dueña (0 tareas agendadas en producción).
  - En la agenda de «Para ti», tocar el bloque de una tarea la abre.
  - «Ya la agendé» elige un evento existente, pero crea una tarea nueva: no hay forma de unir una tarea que ya existe con
    un evento que ya existe.
- **Las fotos:** no se muestran. El equipo tiene `TeamMember.photoUrl` (subida desde /team, hasta 1 MB, sin redimensionar).
  Los contactos del cliente no tienen foto.
- **Las subtareas:** el campo `pasos` (un checklist) existe en el modelo, pero nada lo escribe ni lo muestra.
- **Las tareas desde una plantilla:** `PlantillaDeTareas` y `ProyectoDeTareas` existen en el modelo, sin pantalla, y hay 0
  en producción. Lo único con origen «plantilla» son las rutinas de los servicios recurrentes (14 tareas).
- **La lectura de reuniones:**
  - lee las reuniones con clientes y prospectos de los últimos 14 días (95 lecturas) y las series de sprint configuradas
    (2 series);
  - las internas sueltas no se leen;
  - la tarea guarda bien su fuente (`sessionId`, `lecturaId`, la cita, el contexto, el encargado y quién la pidió);
  - las personas que estuvieron en la sesión no se muestran.

## Decisiones

- **La tarea se abre en un modal grande** (el tamaño «pantalla» de `components/ui/Modal`), no en un cajón, con la forma de
  la tarjeta de Trello:
  - **a la izquierda:** el nombre, la **descripción** debajo, las subtareas, y la actividad y los comentarios;
  - **a la derecha:** «Agregar a la tarea» (responsable, cliente asociado, fechas, estimación de tiempo, etiquetas, sesión,
    proyecto).
  - Las propuestas siguen con su versión corta.
- **Los nombres nuevos:**
  - «Cuánto toma» pasa a **«Estimación de tiempo»**;
  - «Notas» pasa a **«Descripción»**, debajo del nombre;
  - «Para quién» pasa a **«Cliente asociado»** («Asociar cliente» cuando está vacío);
  - y, para que no se confunda, «Para» pasa a **«Responsable»**.
- **Una casilla «Es una sesión»** (la clase `reunion`), y «Asociada a una sesión» cuando la tarea prepara o sigue una
  reunión. Con eso aparecen los invitados y la hora.
- **Subtareas = tareas hijas,** cada una con su responsable y su fecha. El checklist simple sigue en `pasos` para lo
  que no necesita responsable. Las tareas hijas llevan un campo `tareaPadreId` (SQL aditivo).
- **Fotos livianas:** al subir la foto de alguien del equipo se guarda también una versión chica (64 px, webp, unos
  pocos KB), con caché larga. Quien no tiene foto, y los contactos del cliente, van con iniciales.
- **La barra lateral izquierda** es de cada persona y lista:
  - «Todas» y sus clientes, con el color del tipo de cuenta, como en la referencia;
  - «Sin cliente», «Capacitación» y «Equipo interno», cada uno con su número de tareas abiertas.
- **Es una pantalla interna:** antes del código va su diseño en Claude Design con el sistema «Nexus · interfaz interna»
  (regla de CLAUDE.md), y se aplica medida por medida.

## Etapas

1. **P2a · El diseño:** el modal de la tarea, la barra lateral y el calendario, en Claude Design, revisados por Elías.
2. **P1 · La barra lateral por cliente:**
   - los clientes donde la persona tiene tareas, más las categorías;
   - «Por cliente» se vuelve la misma vista;
   - la categoría «Capacitación» (ver «Lo que decides tú» 19).
3. **P2b · El modal de la tarea:** el orden y los nombres nuevos, «Es una sesión» y las subtareas (tareas hijas y
   checklist).
4. **P3 · El calendario y las sesiones:**
   - en la agenda, tocar un evento que ya existe ofrece «Asociar a una tarea», y tocar un espacio vacío ofrece crearla,
     como hoy;
   - una tarea que es una sesión queda unida a su reunión de Meet cuando llega (`reunionHechaId`), y esa reunión se lee
     con IA como cualquier otra;
   - las fotos de las personas en la tarea y en la agenda, en su versión chica.
5. **P5 · Leer todas las sesiones de cada persona** (es el área H del roadmap):
   - la copia de Meet cada hora;
   - leer las reuniones internas de cada persona, no solo las de clientes y las de sprint;
   - cada propuesta de tarea guarda su sesión, el contexto, las personas que estuvieron, el encargado y quién la pidió, y
     la tarea los muestra.
   - Con tope y la limpieza previa (roadmap D2 etapa 1), para no repetir lo de las 105 tareas sin decidir.
6. **P4 · Listo para generar tareas desde lo vendido:**
   - las plantillas de tareas (el modelo ya existe), con subtareas;
   - una por actividad de cada caso vendido, con el cliente asociado y la fuente «propuesta X · caso Y».
   - El disparo desde el handoff es el roadmap D2 y depende de la biblioteca de actividades (A2).

## Depende de y se cruza con

- **D2 (las tres puertas):** P4 es la mecánica y D2 el disparo. La lista por cliente de D2 etapa 3 es P1.
- **H1 (tu piloto):** P5 lo incluye.
- **A2 (las actividades):** para P4.
- **El permiso de Calendar** (la sección «Autorizar el permiso de Calendar» de `docs/tareas-plan.md`): P3 lo necesita
  para leer y unir eventos. Verificarlo antes de construir.
