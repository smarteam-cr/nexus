# La entrega por casos de uso: cronograma y tareas — plan

> Área D del roadmap (`docs/roadmap.md`). Escrito el 2026-10-24 contra el código y la base en solo lectura. **Nada
> construido.** Las decisiones de fondo están en `docs/actividades-plan.md` y en `docs/tareas-plan.md` § 17 (las tres
> puertas); este plan las baja a etapas programables.

## Lo que hay hoy

- **Un cronograma por proyecto**, lo arma el handoff; cada regeneración queda como propuesta que el CSE aprueba.
- **Las tareas del cronograma (`TimelineTask`) no están unidas a las tareas del equipo (`Tarea`)**, a propósito. Lo
  único atado a una tarea del cronograma es la pregunta «¿cuánto te tomó?».
- **El cliente ve las tareas del cronograma una vez que el CSE confirma el detalle**
  (`lib/external/timeline-view.ts`, `readClientTimeline`). Solo se esconden las suspendidas. **Una tarea marcada «por
  validar» también llega al cliente**, aunque el comentario del esquema dice que nunca cruza: es un error (también está
  en «Deuda que encontró la validación», ítem 7). Arreglado el 24 oct (D0); falta el deploy.
- **`Tarea`** ya tiene lo que hace falta:
  - responsable, cliente, proyecto y los pasos (cómo hacerla);
  - `minutosEstimados`, nulo si no se estimó;
  - el origen (`mano`, `pedido`, `reunion`, `notas`, `chat`, `plantilla`, `hubspot`);
  - la reunión y la cita;
  - la decisión.

  No sabe de qué actividad salió.
- **`PlantillaDeTareas`** existe (hasta 40 tareas y una duración), pero nada la escribe.
- **«Por decidir»** es el estado `propuesta`, con estos topes (`lib/tareas/reglas.ts`):
  - vence a los 14 días;
  - como mucho 10 sugerencias de reuniones por persona;
  - 5 por reunión, o 3 si la reunión fue con un cliente.
- **Lo que pasó en 45 días:** a los cinco CSE les llegaron 105 tareas, ninguna aceptada; 37 vencieron sin decidir, y
  hay 26 seguimientos que nadie tomó.
- **Con HubSpot:** lo que nace allá se sincroniza en los dos sentidos cada 15 minutos; lo que nace en Nexus no se crea
  allá.

## Decisiones que ya están

- **Tres puertas, una lista por persona:**
  1. El plan del proyecto nace en el handoff, ya decidido.
  2. Lo que se dijo con el cliente pasa por «Por decidir».
  3. Lo que se dijo puertas adentro deja una tarea para quien la hace y una de revisión para quien la pidió.
- **El cronograma sigue aparte de las tareas:** se arma desde la propuesta y el handoff. El puente, por ahora, es el
  chat del cronograma.
- **Corte limpio:** los proyectos nuevos nacen con el modelo nuevo; los de hoy siguen como están. No se cambia la regla
  de un cronograma por proyecto.
- **El cliente ve un resumen**, como se vendió; las tareas internas van aparte.

## Etapas

1. **D0 · Que «por validar» no cruce al cliente** (ya, sin depender de nada). Filtrar `needsValidation` en
   `readClientTimeline`, con una prueba que lo congele. Es chico y es un error de hoy.
2. **D2 etapa 1 · Limpiar antes de sumar** (ya).
   - Un script con simulacro: cierra lo vencido, junta los seguimientos repetidos y deja a cada CSE con menos de 10
     por decidir.
   - El `--apply` lo corre Claude después de mostrar la salida.
3. **D1 · El diseño del cronograma con casos** (depende de A1).
   - Contar los cronogramas activos y su estado (publicados, con propuesta pendiente).
   - Un diseño en Claude Design: el cliente ve los casos con sus etapas (diagnóstico, planificación, implementación,
     adopción) y las sesiones; las tareas del equipo, aparte.
4. **D2 etapa 2 · El plan del proyecto nace en tareas** (depende de A0, A2 y C2).
   - Al aprobar el handoff, una tarea por actividad vendida, con su responsable, su semana y sus minutos estimados.
     Origen `plantilla`, ya decidida: no pasa por «Por decidir».
   - `Tarea` gana una columna con el id de la actividad del catálogo (SQL aditivo, nulo para lo de hoy). Con eso G
     mide por actividad y por caso.
   - `PlantillaDeTareas` se usa o se borra: se decide en DECISIONS antes del código, para no dejar un modelo muerto.
   - «Para ti» muestra solo el día y la semana; el resto, en la lista del cliente (P1).
5. **D3 · Lo hablado en una sesión** (depende de D2).
   - La lectura de cada reunión compara lo pedido contra lo vendido: dentro del alcance, propuesta de tarea; fuera, un
     pedido (E1).
   - No duplica una tarea que ya está en el plan.
6. **D4 · El seguimiento comercial también en HubSpot** (no depende de nada).
   - Una tarea de seguimiento con un contacto o un negocio se crea también en HubSpot y guarda su id. Desde ahí, el
     estado viaja solo.
   - Las tareas internas siguen solo en Nexus. La excepción va a DECISIONS antes del código.
7. **D2 etapas 5 y 6 · Las actividades que se repiten y el piloto.**
   - En SmartLoop, cada ciclo deja la tarea de cada actividad que se repite (M4).
   - Primero con las tareas de Elías y después con un CSE.

## Criterio de éxito

- El 100 % de los proyectos nuevos nace con su plan en tareas, y 7 de cada 10 de esas tareas quedan hechas o
  `no_se_hara`.
- 4 de los 5 CSE abren Tareas 3 días o más por semana (fuente: el latido de Uso de Nexus), y terminan o deciden la mitad
  de sus tareas antes de que venzan (hoy, de 105, 0 aceptadas y 37 vencidas; `scripts/medir-tareas-por-persona.ts` suma
  esa tasa).
- Tener menos de 10 por decidir cuenta solo si se llega decidiendo.
- El cliente ve un resumen sin las tareas «por validar» (hoy, en Wherex, 4) ni las internas (hoy ve todas las del
  cronograma publicado, hasta D1).

## Preguntas para Elías

1. En su cronograma, ¿el cliente ve los casos con sus etapas y sesiones, o también cada entregable?
2. Las 105 tareas que nadie decidió, ¿las cerramos en bloque o cada CSE revisa las suyas?
3. Una tarea del plan que el CSE no hará (porque el cliente ya lo tenía), ¿se borra o queda `no_se_hara` (el estado que ya existe) para medirla?
4. ¿Quién es el responsable por defecto de cada actividad: el CSE del proyecto, o el rol que dice la actividad (CSE,
   CSL, Dev)?

## Riesgos

- Sumar 20 tareas por proyecto sin la limpieza repite lo de los 45 días: D2 etapa 1 va primero.
- Unir `Tarea` con el cronograma tienta a mezclarlos: la regla es que siguen aparte, y el puente es la actividad.
