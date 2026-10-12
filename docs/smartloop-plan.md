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

## Abierto

- La lista preliminar de casos de uso (Elías la pasa).
- La etapa del ciclo de cada recurrente al migrar: preguntarla a Customer Success.
