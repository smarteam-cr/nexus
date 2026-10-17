# SmartLoop en Nexus — plan acordado

> Fuente de verdad del servicio: el documento de proceso de SmartLoop (v0.3.0, 2026-10-10). Este plan
> dice cómo lo lleva Nexus. Consensuado con Elías el 2026-10-11; se construye por etapas.

## Para qué

Que Nexus sirva para llevar servicios recurrentes **en ejecución** y que el CSE les vea valor en su
trabajo de hoy. Dos escenarios, un solo modelo:

- **Con contrato estructurado** (FACO): se vendió una propuesta con tramos, áreas, iniciativas y
  calendario. Nexus la traduce a casos de uso, ubica el avance real y desde ahí arma el cronograma y
  rearma la historia con el cliente.
- **Sin plan estructurado**: un servicio temporal pasó a recurrente. El CSE presenta el plan cada 3
  meses y cada 6 meses hay un diagnóstico profundo. Ahí la **escala es el eje**: de ella salen la
  consultoría y el camino de crecimiento.

En los dos, Nexus empuja la **expansión** (Land and Expand): al terminar un servicio temporal, propone
pasar a recurrente con casos de uso concretos.

## Decisiones

- **El ciclo es la pieza central.** Un tramo con fechas que abre con un diagnóstico (simple; profundo
  cada 6 meses) y cierra con la sesión de aprendizaje. Su duración la pone el servicio: 60 días, 3
  meses, mes a mes. La etapa del proyecto es la etapa del ciclo en curso.
- **El compromiso anual NO es requerido.** Puede ser mes a mes, a 6 meses o al año.
- **La ruta del año = la escala en el tiempo.** Por área: dónde estaba (diagnósticos guardados), dónde
  está y a qué nivel apunta cada ciclo. Si hay contrato, sus tramos van encima. Es la previsibilidad
  que busca el cliente.
- **Un caso de uso no es una dimensión.** Un caso de uso puede mover varias dimensiones (y varias
  capas). Se guarda con las dimensiones que mueve y a qué nivel.
- **Camino de crecimiento estandarizado:** qué se sugiere, en qué orden y por qué (la brecha de la
  escala que cierra, el pedido del cliente que atiende, el resultado que persigue). Se arranca con IA
  sobre las brechas de la escala; la lista preliminar de casos de uso de Elías (solo títulos) entra
  como inspiración cuando llegue.
- **Los diagnósticos de preventa cuentan.** Muchos clientes ya traen información de la preventa: el
  primer diagnóstico del ciclo parte de ahí.
- **Caso de uso = fase del cronograma**, con su criterio de aceptación.
- **Las tareas del CSE van en una fase siguiente**, con sus pruebas. Las dependencias del cliente van
  como ítems del cronograma, sin crear tareas.
- **Dependencia del cliente atrasada:** Nexus propone mover lo que destraba (un clic); no lo mueve solo.
- **Sesiones fijas:** desde Google Calendar se sabe si la sesión es una serie (`recurringEventId`) o se
  va agendando, y si una instancia se canceló.
- **Pipeline:** los recurrentes hoy están en el pipeline de implementación, etapa Continuidad. Se
  migran al pipeline SmartLoop de HubSpot. La etapa del ciclo de cada uno se deduce comparando el
  handoff con el estado actual, y se confirma con Customer Success.
- **Escalabilidad:** ciclos, escala en el tiempo, sesiones fijas y dependencias del cliente son piezas
  que cualquier tipo de proyecto activa. Un servicio recurrente nuevo es configuración (una fila de
  pipeline + su guía desde su documento de proceso), no código nuevo.

- **La escala es una sección de la empresa, para todas** (Elías, 2026-10-12): «La cuenta › La escala»
  guarda la posición fechada de cada área y dimensión, venga o no la empresa de una preventa. Sin
  posición, la sección ofrece tres caminos: el diagnóstico del ciclo, el cuestionario de la escala o una
  estimación de Nexus (solo donde hay una pista del cliente). Hoy no existe dónde guardarla: hace falta
  una tabla nueva (SQL aditivo), con la forma de `EstimadoGuardado` y los niveles derivados con
  `calcularChequeo`.
- **El diagnóstico del ciclo posiciona al cliente**: las 8 dimensiones de cada área y unidad, nivel
  calculado y nivel del CSE (con su razón si difieren), «no aplica» con razón. La IA propone con la
  evidencia de las reuniones; el CSE confirma. Al guardar queda en la escala de la empresa.
- **La etapa del ciclo se deduce de lo que existe** (diagnóstico guardado, plan aprobado, casos en
  curso, aprendizaje hecho) y el CSE la corrige hacia adelante o hacia atrás.
- **El Resumen de un recurrente es del servicio**, no de una implementación: ciclo con tramo y día,
  meta, etapa, la escala de partida y objetivo, casos de uso, ruta del año, dependencias de FACO, hitos
  y sesiones fijas. Sin el handoff de implementación.

Diseño: https://claude.ai/artifact/8j9tXPbVSaKWGzXZkVg7FJ (2026-10-12).

## Prueba con FACO

FACO en Nexus es **Honda Costa Rica** (proyecto real: «PLAN DE CONTINUIDAD | HONDA FACO», etapa
Continuidad, CSE Carolina Bersot). Se prueba con un **proyecto de prueba** en producción:

- Colgado del cliente real: lee la ficha, los procesos, las reuniones, la memoria y los diagnósticos.
- No existe en HubSpot y nunca escribe allá. La etapa la lleva Nexus.
- Fuera de la cartera, Cobranza, el vigía, «Para ti», las métricas, la vista del cliente y el
  clasificador de reuniones.
- Con una banda visible: es de prueba, no lo ve el cliente ni cuenta en la cartera.
- Cuando se valide, se crean los proyectos reales en el pipeline SmartLoop.

## Etapas

0. Proyecto de prueba.
1. Modo recurrente y ciclo, con la guía del CSE (desde la sección 5 del proceso).
2. La escala en el tiempo: diagnóstico guardado en la empresa (también desde la preventa), camino de
   crecimiento estandarizado y cronograma general.
3. Cronograma del ciclo: casos de uso como fases con criterio, versión aprobada, avance, dependencias
   del cliente y sesiones fijas.
4. Sesión de aprendizaje y cierre.
5. Traductor de propuestas: casos de uso, avance real, cronograma e historia; carga de FACO en el
   proyecto de prueba.
6. Recomendar recurrencia al cerrar un servicio temporal.
7. Gantt de la cuenta con enlace para el cliente.
8. (Fase siguiente) Tareas del CSE.

## Avance

- **Etapa 0 · proyecto de prueba:** hecha y en producción (18fb4806). FACO: «FACO · SmartLoop (prueba)», de
  «PLAN DE CONTINUIDAD | HONDA FACO».
- **Etapa 1 · modo recurrente y ciclo:** en el código. SmartLoop en la tabla de pipelines, tablas `CicloDeProyecto` y
  `CasoDeUso` (SQL `2026-10-11-ciclos-y-casos-de-uso.sql`), el traspaso con «Servicio: SmartLoop» y el «Qué sigue». Para
  la prueba de FACO: `crear-proyecto-de-prueba.ts --de <real> --pipeline smartloop --apply` la pasa a SmartLoop.
- **El riel y la etapa, rehechos sobre lo que ya existe (2026-10-12, pedido de Elías):** sin código desplegado. SQL
  `2026-10-12-piezas-ocultas.sql` antes del deploy.
  - Riel: Resumen y Cronograma arriba; el grupo «Ciclo · <etapa>» con los documentos de siempre (Cuestionarios,
    Exploración, Diagnóstico, Planificación, Integraciones, Entrega) más Adopción y Aprendizaje. Se fueron «Diagnóstico
    del ciclo» y «Plan del ciclo».
  - La tarjeta de la etapa del Resumen es la del ciclo: «Cambiar etapa» hacia adelante o hacia atrás, «Editar el ciclo»
    (tramo, fechas, meta, compromiso), la sugerencia de la etapa que muestran los documentos y lo que tiene que quedar.
    Sin ciclo abierto el proyecto está en Diagnóstico; el primero se abre solo al cambiar algo.
  - Panel del Resumen: lo que debe el cliente (tareas del cronograma con responsable CLIENTE), los hitos (el fin de
    cada fase) y las sesiones fijas (las series del calendario con la empresa).
  - Ocultar piezas del riel (en una implementación y en un recurrente): quedan en «Ver N piezas más».
  - La cuenta suma «La escala» (dónde está la empresa en cada área, con la fecha y de dónde sale; sirve sin preventa)
    y «Casos de uso» (en un ciclo, en el plan de crecimiento, sugeridos y cerrados).

- **Etapas 3, 4 y 5 (ficha E, 2026-10-17):** en el código, sin desplegar. SQL `2026-10-17-ficha-e-ciclo-cronograma-y-cierre.sql`
  antes del deploy.
  - Cronograma del ciclo: arriba del Gantt, cada caso de uso es una fase del cronograma del proyecto (`CasoDeUso.faseId`),
    con su criterio, sus semanas, su avance y sus dependencias del cliente (tareas CLIENTE de la fase). «Armar las fases»,
    «Aprobar esta versión» (la foto en `CicloDeProyecto.cronogramaAprobado`, y lo que cambió desde ahí) y la propuesta
    de un clic cuando una dependencia del cliente se atrasa. Las sesiones fijas, del calendario.
  - Aprendizaje y cierre: en Aprendizaje, lo medido y la decisión de cada caso, la meta evaluada y la propuesta del
    siguiente ciclo; «Cerrar el ciclo» congela los documentos del ciclo (fotos protegidas) y lo deja en «Ciclos
    anteriores». Lo que «pasa» entra solo al ciclo siguiente.
  - Traductor: `scripts/cargar-propuesta-en-ciclo.ts` con la propuesta en JSON (forma en
    `scripts/data/propuesta-smartloop.ejemplo.json`). Falta pasar el plan de 60 días de FACO a esa forma.

## Orden desde el 2026-10-12

1. ~~Arreglos del ciclo~~ y ~~la escala y los casos de uso como secciones de la cuenta~~ (en el código).
2. Guardar la posición en la escala con su fecha cuando el Diagnóstico la cierra (hoy La escala junta lo confirmado en
   las exploraciones), y que el Diagnóstico de un recurrente posicione.
3. El traductor (etapa 5) con el plan de 60 días de FACO cargado en el proyecto de prueba.
4. Cronograma del ciclo (etapa 3) y aprendizaje y cierre (etapa 4), antes del 6 nov: al cerrar un ciclo, se congelan
   sus documentos y quedan en «Ciclos anteriores».
5. Etapas 6, 7 y 8, y la migración.

## Para cuando lleguen los proyectos reales (la migración)

- Revisar los lugares que tratan distinto a `customer-success` por su clave (handoff por tipo, cartera, recordatorios
  de adopción, clasificación «recurrente»). El dueño de la cuenta ya cuenta SmartLoop como de Customer Success.
- Dar de alta SmartLoop desde Nexus (hoy bloqueado en el formulario y en `POST /api/projects`).
- Con proyectos en HubSpot, la etapa se mueve con la encuesta; el ciclo de Nexus sigue al espejo.

## Abierto

- La lista preliminar de casos de uso (Elías la pasa).
- La etapa del ciclo de cada recurrente al migrar: preguntarla a Customer Success.
