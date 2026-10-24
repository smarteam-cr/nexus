# Preventa y propuestas por casos de uso — plan

> Área C del roadmap (`docs/roadmap.md`). Escrito el 2026-10-24 contra el código y la base en solo lectura. **Nada
> construido.** Sale de lo que decidió Elías el 22 oct («resultados, no proyectos») y del feedback de Ventas del 23 oct.
> Las actividades salen de `docs/actividades-plan.md`, y antes de usarlas va el ejercicio de validación (A0).

## Lo que hay hoy

- **La biblioteca** (`lib/casos-de-uso/catalogo.ts`) tiene 26 casos: 5 de aterrizar, 1 de reactivar, 19 de expandir
  y 1 complementario. Cada uno trae su promesa, los síntomas, lo que obtienes, a qué dimensión mueve (de qué nivel a
  cuál), los criterios de la escala, las herramientas y los servicios. **No trae actividades, ni métrica, ni
  duración**; las licencias quedaron para una fase 2.
- **La recomendación** (`lib/casos-de-uso/camino.ts`):
  - toma los casos que mueven el área desde su nivel de hoy;
  - les da más peso a los que destraban criterios;
  - bajo Funcional prefiere aterrizar, y de Funcional para arriba, expandir;
  - devuelve los 3 primeros.

  Una propuesta sin casos elegidos se llena con los que destraban cada área.
- **La propuesta** es un documento del motor de landing (`components/landing/configs/business-case.defs.ts` y
  `website.defs.ts`):
  - «Dónde está tu operación hoy» (`posicion_escala`) ya existe, y en una propuesta que viene de una preventa se escribe
    desde el chequeo de la exploración, no por la IA.
  - Los casos elegidos van en la sección `casos_de_uso`, con título, detalle y precio, y se guardan en
    `BusinessCaseUseCase` contra la tabla vieja `UseCase`, donde el precio es texto libre. Los sugeridos de la
    biblioteca salen sin precio.
- **El caso de uso de un cliente** (`CasoDeUso`, con cliente, proyecto, ciclo y fase del cronograma) existe en el
  esquema, con su origen (escala, pedido, propuesta, entrega o manual) y su estado. Hoy hay **0 filas**.
- **El cotizador** vive fuera de Nexus (`D:\Proyectos\casos-de-uso-escala`).

## Decisiones que ya están (no se re-litigan)

- El vendedor ve casos, actividades y su porqué; **el cliente nunca ve horas ni créditos**, ni códigos de criterios.
- **El precio sale del tiempo a mano de cada actividad por la tarifa del segmento** (80, 100, 120). Sumar una
  actividad en la entrega no cambia el precio: baja la rentabilidad.
- El tiempo de cada actividad es uno solo; lo que crece con la empresa es cuántas veces se hace.
- La implementación base (portal y arquitectura) va dentro del caso de aterrizaje y se cuenta una vez por cliente.
- Lo nuevo entra al lado de lo viejo: las propuestas de hoy no cambian.

## Etapas

1. **C1 · Recomendar el caso, enfocado en el resultado** (no depende de nada).
   - Revisar la recomendación con 5 preventas reales, junto con Marco: ¿el caso que sale primero es el que él
     vendería? Lo que no calce se corrige en `camino.ts`, con una prueba por caso real.
   - Cada recomendación dice su porqué en una frase, con el resultado que busca el cliente (sale de los síntomas y la
     promesa del caso, sin IA).
   - Varios carriles: un caso por área cuando el cliente quiere varias. SmartLoop pasa a decir «una prioridad a la
     vez por carril».
2. **C3 · «Lo que normalmente viene después»** (no depende de nada).
   - Una sección nueva en `shared-sections.defs.ts`, sin precio, con los siguientes casos del camino de crecimiento.
     Entra al registro congelado (`lib/landing/registry.test.ts`).
   - El vendedor la muestra u oculta con el ojo de la sección.
3. **C2 · La cotización sale de las actividades** (depende de A0, A2 y B1).
   - Un motor de precio puro, en `lib/casos-de-uso/precio.ts`, con sus pruebas: actividades × veces × tiempo a mano ×
     tarifa, y la base contada una sola vez por cliente.
   - Nexus sugiere las actividades según la empresa (tamaño, equipos, segmento), cada una con su porqué. El vendedor
     quita, suma o cambia cuántas veces.
   - **Lo vendido se congela al firmar**: una tabla nueva de líneas vendidas (propuesta, caso, actividad, veces,
     minutos a mano, tarifa, porqué), con SQL aditivo. De ahí salen el cronograma, las tareas (D2) y la rentabilidad
     (G2). Se escribe en DECISIONS antes del código.
   - La tabla vieja `UseCase` y su precio en texto se retiran cuando la biblioteca la reemplace; no antes.
4. **C4 · Las implementaciones de hoy, leídas como casos** (depende de A2).
   - Para cada proyecto en curso, Nexus propone a qué casos corresponde lo vendido, desde la propuesta y el handoff, y
     el CSE confirma. Se crean filas de `CasoDeUso` con origen «entrega»; el cronograma no se toca.
5. **C5 · El documento de resultados de la preventa** (depende del formato de Ventas, de K1 y de R3).
   - Un tipo de documento nuevo del motor (vista externa y PDF), por departamento: dónde está en la escala, su dolor y
     la evidencia, en palabras del cliente. La propuesta parte de él.

## Criterio de éxito

5 propuestas reales armadas desde las actividades que sugiere Nexus, cada una con su porqué; el precio difiere menos
de un 10 % del que daba el cotizador; lo vendido queda guardado por caso y actividad, y el cliente no ve una sola hora.

## Preguntas para Elías

1. ¿El vendedor puede bajar el precio que propone Nexus? ¿Hasta cuánto sin pedirle aprobación a nadie?
2. «Lo que normalmente viene después», ¿sale visible por defecto o lo prende el vendedor?
3. Para C4, ¿qué proyectos en curso leemos primero como casos de uso?
4. ¿Las licencias de HubSpot entran en la misma propuesta como una línea aparte, o siguen fuera (fase 2 de la
   biblioteca)?

## Riesgos

- Programar C2 antes de A0 obliga a rehacer el motor cuando cambie el catálogo: por eso espera.
- Dos fuentes de casos (la tabla vieja `UseCase` y la biblioteca) conviviendo mucho tiempo: hay que fijar cuándo se
  retira la vieja.
- El precio calculado puede chocar con lo que el vendedor ya prometió: la propuesta muestra la diferencia, no la
  esconde.
