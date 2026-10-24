# Actividades: el trabajo debajo de cada caso de uso

> Plan de los ítems A0 y A1 del roadmap (`docs/roadmap.md` › «Propuesta por aprobar: vender y entregar por casos de uso»).
> Nace de tres rondas de preguntas con Elías el 2026-10-22. **Nada construido.** Lo que sigue son las decisiones de
> esas conversaciones, los datos que las sostienen y lo que queda abierto. Cuando el roadmap pase la propuesta a
> aprobada, este archivo es la fuente de A2, C2, D1, D2, G, H y J1.

## Qué es una actividad (decidido)

- **Es el trabajo para llegar al resultado.** Lo que el cliente ve es «lo que se entrega», en su cronograma. La
  actividad es lo que hace Smarteam por dentro, y existe para tres cosas: que el CSE sepa cómo hacer el proceso,
  calcular el tiempo (estimado y real) y sacar de ahí el precio mínimo y la rentabilidad.
- **El árbol:** caso de uso → lo que se entrega (lo ve el cliente) → actividades (las hace Smarteam).
- **Se comparten entre casos.** «Configurar motivos de pérdida» está en el caso de Ventas del cotizador y en
  «Entiende por qué ganas y pierdes»: si el cliente compra los dos, se hace y se cobra una vez.
- **Ejemplos de Elías:** sesión de exploración CSE · mapeo del proceso de ventas · auditoría de HubSpot · creación de
  reportes · diagnóstico de madurez de datos · reporte ejecutivo de estado · diseño de implementación (arquitectura,
  pilotos) · sesión de explicación de la arquitectura · reporte de integridad de datos · plan de piloto (reporte +
  sesión) · capacitación a líderes · capacitaciones de adopción diferenciadas · análisis de uso del portal · gestión
  del cambio · seguimiento de 15 minutos · personalizar un diagnóstico · planear una sesión.
- **Van pegadas a los artefactos de Nexus.** Muchas las acelera o las hace Nexus (diagnóstico, planificación, reporte
  de estado). Esa es la ganancia de ser IA first.
- **Algunas se repiten.** En SmartLoop: la sesión de entrega de servicio es semanal, la de stakeholders cada 3 meses y
  el reporte de avance se evalúa cada mes. La actividad lleva su frecuencia y Nexus crea la de cada ciclo; varias
  (el reporte de avance) las prepara Nexus solo.

## Cómo se arma la biblioteca (decidido)

- **La mantiene Elías**, por ahora.
- **Primero las actividades, después los casos.** Se desarma el cotizador junto con Elías: se juntan todas sus tareas
  en un catálogo de actividades agrupadas, y después se ve qué actividades jala cada caso de uso. No al revés.

## Los tiempos (decidido)

- **Cada actividad lleva dos tiempos:** el de hacerla a mano (el espacio que se reserva y se cotiza; un diagnóstico
  personalizado ≈ 4 horas) y el objetivo con Nexus (lo que buscamos que tarde revisarlo y ajustarlo: 1 hora, media
  hora o menos).
- **Se vende por valor (2026-10-24).** Lo que debería durar (el tiempo a mano), con la tarifa por segmento del
  cotizador (80, 100, 120), da el **precio mínimo**: ninguna propuesta baja de ahí. El precio lo pone el valor. **Para la rentabilidad y los costos cuenta lo que realmente duró**, al costo de la
  planilla: ya existe en `lib/rentabilidad/margen.ts` (por persona y cargado). La diferencia entre los dos tiempos es
  lo que Nexus le gana al trabajo.
- **Las sesiones duran una hora**, con una agenda clara y específica: explorar, presentar una propuesta o una entrega.

## El tamaño y el tipo de empresa: cambian cuáles y cuántas, nunca cuánto dura cada una (recomendado)

Elías pidió validar el ICP y decidir si el tiempo debe variar por tipo de empresa. La respuesta es **no**: el tiempo
de cada actividad es uno solo. Lo que cambia es la lista.

**Qué hace hoy el cotizador** (`D:\Proyectos\casos-de-uso-escala`, `motor.js` + `carrito-data-v2.js`): tres
mecanismos, ninguno es un multiplicador.
1. Una lista distinta de tareas por tamaño de equipo (pequeño 1-4, mediano 5-15, grande +15): más tareas o más horas
   en las grandes (p. ej. «relevamiento de integraciones» 0,5 / 1 / 1,5 h + una tarea más en grande).
2. Tareas que suma el segmento: corporativo (comité, sesión de seguridad de datos) y gobierno (actas, SICOP,
   clasificación de datos personales).
3. La tarifa por segmento: 80 estándar, 100 corporativo, 120 gobierno.

**El ICP con los datos reales** (lectura del 2026-10-22: 163 clientes, 61 facturaron en los últimos 12 meses,
≈ US$726k):
- **El grueso es empresa privada chica y mediana de Centroamérica y México.** De las que tienen el dato de empleados:
  22 empresas de 1-49 (US$183k), 12 de 50-199 (US$109k), 7 de 200-999 (US$58k), 1 de 1000+ (US$4k).
- **El sector público son dos cuentas, pero pesan:** kölbi (ICE) solo factura US$271k, el 37 % de todo; MINEC,
  US$24k. Fuera de kölbi, la cuenta típica factura ≈ US$7,5k al año.
- **El dato de tamaño de HubSpot no sirve para decidir:** 60 de 163 sin empleados, y los que tienen dicen cosas como
  Honda Costa Rica = 5 y MINEC = 3. Refuerza B1: el tamaño se le pregunta al vendedor (equipos y personas que entran),
  no se confía en HubSpot.

**Entonces:**
- **Una sesión dura una hora, siempre.** Lo que el cotizador hacía con «hora y media en empresa grande» pasa a ser
  **dos sesiones**. Es más fácil de vender, de agendar y de medir.
- **Lo que crece con la empresa es el número de veces:** una exploración por equipo involucrado, una capacitación por
  grupo, un relevamiento por sistema a integrar. La preventa sugiere cuántas y dice por qué.
- **Gobierno y corporativo son actividades de más**, no un tiempo mayor (actas, SICOP, comité), más su tarifa.
- **El usuario solo ve «3 exploraciones»**; la complejidad queda en el análisis que hace Nexus para sugerirlas.

## Quién elige y qué pasa si cambia (decidido)

- **La propuesta las sugiere Nexus** con todo lo que sabe de la empresa, y dice **por qué** cada una importa. El
  vendedor quita, cambia y acomoda, entendiendo ese porqué.
- **Si en la entrega se suma una actividad, no cambia el precio: baja la rentabilidad.** Sirve para afinar el precio
  la próxima vez, o para que Ventas le diga al cliente a tiempo que falta alcance.
- **En SmartLoop, sumar actividades alarga el plan**, con una cadencia de entrega (por definir).
- **Cada actividad tiene su responsable** (CSE, CSL, Dev, Ventas).

## Cronograma y tareas (decidido)

- **El cronograma sigue aparte del sistema de tareas.** Se arma desde la propuesta y el handoff, para que el cliente
  entienda de un vistazo cómo vamos. Más adelante se podrá cambiar por Gantts por caso de uso.
- **Por ahora el puente lo hace el chat del cronograma:** conoce las actividades del proyecto y las líneas actuales, y
  el CSE le pide sumar líneas. Mandar una actividad al cronograma como línea queda para una iteración posterior.

## La actividad del caso es una plantilla; la del proyecto, una tarea (recomendado)

- `Tarea` ya tiene responsable, cliente, proyecto, `minutosEstimados`, `pasos` (cómo hacerla), la clase `reunion`, el
  bloque agendado en el calendario (`agendaBloques`) y la reunión hecha (`reunionHechaId`).
- Entonces hay **dos piezas**: la **actividad de la biblioteca** (plantilla: nombre, cómo se hace, tiempo a mano,
  tiempo con Nexus, rol, si es con el cliente, frecuencia, el artefacto de Nexus que la acelera) y, en cada proyecto,
  **la tarea que nace de ella** en el handoff (decidido), con su responsable, su semana y su tiempo real. La tarea
  recuerda de qué actividad salió.
- **Tiempo real:** una sesión lo mide sola con Google Workspace; el resto, con «¿cuánto te tomó?» (PreguntaDeTiempo,
  hoy en pausa) o con el bloque que la persona agenda desde Tareas. Un solo tipo de actividad, con el dato «es con el
  cliente: sí o no».

## Las tareas de Customer Success hoy, y por qué no se puede sumar 20 de golpe

Lectura del 2026-10-22 en producción (`scripts/medir-tareas-por-persona.ts` + conteo de los últimos 45 días):

- **Los cinco CSE no trabajan con tareas todavía.** En 45 días les nacieron 105: **0 aceptadas, 0 hechas**, 37
  vencieron sin que nadie las decidiera, 18 se juntaron con otra y 49 siguen por decidir. Cada CSE tiene hoy 0 o 1
  abierta y unas 10 por decidir.
- **Todas salen de reuniones con el cliente:** compromisos dichos en una sesión y seguimientos que prometió el
  cliente. Hay además 26 seguimientos «Por asignar · cs» que nadie tomó.
- Ventas sí las usa (16 hechas, casi todas de HubSpot).

**Lo que eso dice:** el problema no es cuántas tareas hay, es que todas piden una decisión. Si el handoff suma 20 más
a «Por decidir», se ignoran igual.

**Propuesta: tres puertas, una sola lista por persona.**
1. **El plan del proyecto (nace en el handoff).** Ya está vendido, así que **no pasa por «Por decidir»**: vive en la
   lista del cliente (la vista tipo ClickUp: clic en un cliente y ves todo lo que hay que hacer ahí) y solo sube a
   «Para ti» lo de esta semana.
2. **Lo que se dijo con el cliente** (como hoy): compromisos y seguimientos de las reuniones. Pasan por «Por decidir»,
   con tope.
3. **Lo que se dijo puertas adentro** (área H): Elías le dice a Alex o a Valentina «recuerda hacer tal cosa» en una
   reunión, y Nexus crea la tarea para ella y una de revisión para él.
- **«Para ti» muestra el día y la semana**, con pocas cosas; el resto vive en la lista del cliente y en Tareas.

## Cuarta ronda (2026-10-23)

- **El tamaño lo estima el agente de la preventa.** El agente que investiga la empresa lo estima; si en HubSpot está
  vacío lo escribe allá, y si no coincide propone el cambio para que el vendedor lo acepte antes de escribirlo (roadmap
  B1 etapa 2).
- **Se limpian las tareas de hoy antes de sumar las del handoff:** cerrar lo vencido, juntar los seguimientos y bajar
  el tope de «Por decidir» (roadmap D2 etapa 1).
- **El orden:** primero desarmar el cotizador contigo y limpiar las tareas; está escrito en el roadmap, en «Orden
  sugerido».
- **kölbi se cotiza como gobierno** (tarifa 120 y actas). Ya se le está ofreciendo SmartLoop.

## El ejercicio de validación (A0, pedido del 2026-10-24)

Antes de crear las actividades y los casos de uso, Elías y Claude los validan juntos. **Va amarrado a la preventa**
(Elías, 2026-10-24): cada sesión que se analiza en una preventa lo complementa, porque ahí se ve qué hace falta. La pregunta que guía todo:
**¿cuál es la menor cantidad de actividades que podemos hacer para un cliente y que igual llegue al resultado?** Una
implementación tiene que ser fácil y sencilla de hacer con todo lo que la IA permite. **Nada de A1 etapa 2, A2, C2, D2
etapa 2 ni P4 se programa sin este ejercicio aprobado.**

1. **Elías da el contexto.** Cómo ve una implementación hoy con la IA: qué hace Nexus solo, qué hace el CSE y qué hace
   el cliente. Con dos o tres implementaciones reales recientes: una que salió bien y una que no.
2. **Claude explora**, en solo lectura:
   - el cotizador (`D:\Proyectos\casos-de-uso-escala`) y sus tareas por tamaño y segmento;
   - las propuestas firmadas de esos proyectos, sus handoffs, sus cronogramas y sus tareas reales;
   - sus sesiones: cuántas hubo, de qué, y cuáles se repitieron;
   - lo que Nexus ya escribe solo (kickoff, diagnóstico, planificación, procesos, reportes).

   Sale una tabla: qué actividades aparecen en todos los proyectos, cuáles casi nunca, y cuáles ya hace Nexus.
3. **Claude propone** la menor cantidad de actividades por caso. Cada una con:
   - su porqué (qué parte del resultado deja lista);
   - el artefacto de Nexus que la hace o la acelera;
   - si es con el cliente;
   - qué tarea del cotizador reemplaza, junta o elimina.
4. **Se valida junto, caso por caso,** con una sola pregunta por actividad: «¿se llega al resultado sin esta
   actividad?». Si la respuesta es sí, sale. Lo aprobado se escribe acá y en DECISIONS; recién ahí se programa.

**Las preguntas para llevar a la sesión:**
- ¿Qué implementación reciente salió mejor, y cuál peor? ¿Por qué?
- ¿Qué parte de una implementación sigue siendo a mano y la IA ya podría hacer (o preparar para que el CSE solo revise)?
- ¿Cuántas sesiones con el cliente necesita como mínimo un caso de aterrizaje?
- ¿Qué no se puede quitar nunca? (el kickoff, el acceso al portal, la revisión de adopción…)
- ¿Qué aprende el cliente solo, con la ruta de Academy (Q1), y qué necesita una sesión?
- ¿Qué actividades son iguales en todos los casos (la base: portal y arquitectura) y se cuentan una sola vez por cliente?

**Criterio de éxito:** el catálogo tiene menos actividades que tareas el cotizador, ningún caso pasa de 8 actividades,
cada una tiene su porqué, y Elías lo aprueba.

## Lo que falta decidir

1. **Las tareas de gestión del cliente** (seguimiento de 15 minutos, planear una sesión, gestión del cambio que no es
   de un caso): ¿se cobran o solo se miden? Elías pidió más contexto el 2026-10-23.
   - **El contexto:** hay trabajo que no está en ningún caso y que se hace igual: seguimientos, preparar sesiones,
     contestar al cliente.
   - **Si solo se mide**, el precio no lo cubre y la rentabilidad de cada caso se ve mejor de lo que es.
   - **Si se detalla en la propuesta**, el cliente ve horas, cosa que ya se descartó.
   - **Recomendación:** medirlo siempre (es el costo de servir la cuenta) y que en el precio entre como un bloque fijo
     de horas al mes según la escala, sin detallarlo.
   - Está en el roadmap, «Lo que decides tú» 11.
