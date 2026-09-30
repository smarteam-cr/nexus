---
documento: Escala de Rendimiento Smarteam — Manual de operación
version: 1.2.1
escala: 8.1.0
fecha: 2026-09-30
---

# Manual de operación de la Escala de Rendimiento

Este manual dice cómo trabaja el equipo de Smarteam con la Escala de Rendimiento: quién la aplica y cuándo, cómo se reparte el trabajo entre la IA y el CSE, cómo se sabe que la escala funciona y qué reglas esperan hasta que hagan falta. No define niveles ni criterios —eso lo hace la escala, `escala_rendimiento_smarteam.md`— ni el cálculo —eso lo hace la especificación, `especificacion_calculo_escala.md`—. Si algo de aquí contradice a la escala, manda la escala.

## Cómo cambia la escala

La escala cambia con el uso, y lo mismo vale para la especificación y para las reglas de este manual. Cambia por dos vías: el feedback de su responsable, hoy Elías González, que la revisa en la sección «Escala» de Nexus, y los comentarios del equipo en esa misma sección, donde cada comentario queda anclado al criterio, al nivel o a la dimensión que comenta.

- **El equipo comenta; el responsable decide.** Lo que no se entiende, lo que no calza con un cliente y las propuestas se comentan en Nexus. El responsable responde, descarta o pasa cada comentario a cambio pendiente.
- **Cada cambio es una versión nueva:** se publica en Nexus y se anota en el historial del documento que cambia. Una versión publicada no se reescribe, y un comentario hecho sobre un texto que después cambió se sigue viendo junto al texto nuevo.

## Las ediciones por industria

La escala tiene una matriz general y, en su Parte 5, ediciones por industria: la misma escala dicha para una tienda, una inmobiliaria o una universidad. No son escalas aparte: comparten dimensiones, niveles, reglas, cálculo e identificadores.

- **Con cuál se mide.** Cada unidad se mide con la edición de su industria, si existe, y con la escala general si no. Se decide al arrancar y se escribe en el diagnóstico. Si más adelante la unidad pasa a una edición, esa medición es una línea base nueva: no se compara contra la anterior.
- **Cuándo se hace una edición.** Cuando hay clientes o prospectos de esa industria a quienes medir, y alguien que la va a usar con ellos. Una edición se prueba con dos o tres clientes antes de hacer la siguiente.
- **Qué puede cambiar una edición.** Lo que de verdad es de su industria: los nombres de las dimensiones de producción, las preguntas, los costos, las palabras de un criterio y los criterios que solo tienen sentido ahí. La base operativa se toca lo menos posible: si una edición empieza a reescribirla, se está volviendo otra escala.
- **Cómo se mantiene.** Un cambio en la matriz obliga a cada edición a decidir: si la matriz suma un criterio en una dimensión que la edición ya adaptó, la edición lo reescribe, lo saca o lo deja como está, y la versión no se publica hasta que lo diga. Y si el texto general de un criterio cambia, lo que la edición decía con sus palabras se vuelve a mirar antes de publicar.
- **Los comentarios.** Un comentario hecho leyendo una edición queda anclado a esa edición: guarda el texto que la persona leyó. El responsable decide, como con cualquier otro, si el cambio es de la edición o de la matriz.

## Quién aplica la escala y cuándo

| Momento | Quién | Qué se aplica | Para qué |
|:--|:--|:--|:--|
| Venta | El prospecto en el test web, o el consultor con él | Chequeo | Abrir la conversación y proponer un primer paso |
| Arranque del servicio | El CSE, con los agentes de Nexus | Diagnóstico de los departamentos que se atienden | Fijar la línea base y acordar el nivel objetivo |
| Antes de un caso de uso | El CSE | Diagnóstico de las ocho dimensiones del departamento | Saber desde dónde parte el caso |
| Entrega | El CSE | Diagnóstico | Ver lo que se instaló y dejar por confirmar lo que depende de hábitos |
| Remedición, a los 60 a 90 días de entregar y después cada trimestre | El CSE | Diagnóstico | Confirmar los hábitos y abrir la conversación de qué sigue |

Lo que se averigua en la venta llega al CSE en el handoff: el chequeo, lo que contó el prospecto y el resultado que persigue, si ya lo dijo. Al CSE le sirve para saber dónde mirar, pero no cuenta como evidencia: el diagnóstico verifica todo, y con eso confirma o corrige lo que estimó el chequeo, incluso hacia abajo.

La guía de exploración —a quién entrevistar, qué pedir y qué observar en cada dimensión— es un documento derivado de la escala, y es lo que usa el CSE para explorar.

## La IA propone y el CSE confirma

El diagnóstico puede asistirse con IA: dado el material de la exploración, la IA ubica cada dimensión en su nivel, cita la evidencia que lo sustenta y señala qué tan cerca está del siguiente. Pero la IA propone y un humano confirma. El nivel vale lo que valga la exploración que lo alimenta, y algunas señales son de juicio —"usan el CRM por convicción"— que no se verifican solas desde una entrevista. Cada nivel asignado se acompaña de su evidencia, nunca como caja negra: "Datos en Inicial porque falta X y falta Y".

La regla estricta calcula un nivel, y el CSE lo puede ajustar, o marcar un criterio como que no aplica por la industria o el momento del cliente, siempre con una justificación escrita. Se guardan los dos niveles, el calculado y el ajustado: así el cálculo sigue siendo repetible y el juicio del CSE queda a la vista. Si distintos CSE ajustan una y otra vez el mismo criterio, es la señal de que está mal escrito y hay que corregirlo en la escala. Eso se anota en Cambios pendientes.

## El diagnóstico nunca evalúa al CSE

La escala es la herramienta para llevar al cliente a su resultado, no una medida del desempeño de quien la aplica. Si el nivel del cliente sirviera para evaluar al CSE, quien mide ganaría inflando. Lo que se reconoce es el resultado del cliente.

## Cómo se sabe que la escala funciona

La escala mide madurez, no resultados, y eso es a propósito. Pero hace falta comprobar que subir en ella de verdad mejora el rendimiento: si un criterio no lo hace, está midiendo lo que no es.

Esa comprobación se hace con clientes, no con prospectos, y con datos que ya existen: el resultado que persigue cada cliente, que se registra en el handoff; el criterio de aceptación de cada caso de uso; y el nivel de cada remedición. Cada cierto tiempo se cruzan esas tres cosas para ver si los clientes que suben de nivel logran sus resultados, y el criterio que no acompaña ese avance se revisa. El momento más claro es cuando un departamento llega a su nivel objetivo: el cliente debería estar viendo el resultado que perseguía, y si no lo ve, se revisa el objetivo o el criterio. Junto con los ajustes del CSE, que señalan criterios mal escritos, es lo que mantiene la escala honesta.

Lo que salga de ese cruce se anota en Cambios pendientes, y es la mejor evidencia para decidir qué cambia en la escala.

## Reglas en espera

Estas reglas estaban en la escala y salieron porque todavía no hay con qué aplicarlas: no hay casos de referencia, ni cuentas con un año de historia, ni suficientes diagnósticos. No se borraron: cada una dice qué la activa y qué se hace mientras tanto.

Una regla se activa cuando pasa su condición y, además, las tres condiciones que se usan en Nexus para cualquier rutina nueva: una persona con nombre que la va a usar, una rutina que ya existe donde vive, y algo nombrado que tiene que mover. Al activarla, vuelve a la escala o a la especificación en la siguiente versión; si no cambia el cálculo, se aplica desde este manual.

### Calibración de los CSE

**La regla.** Solo hace diagnósticos un CSE calibrado: puntuó un set de casos de referencia, cada uno con su diagnóstico correcto, y coincidió con él. El set se vuelve a puntuar cada semestre, para detectar a quien se está desviando. Los casos de referencia son documentos derivados de la escala.

**Se activa** cuando haya un set de casos de referencia con su diagnóstico correcto validado por un senior; la recalibración, seis meses después. Con los casos se activa también la prueba 6 de la especificación.

**Mientras tanto**, diagnostica cualquier CSE, y los diagnósticos de los primeros clientes son los candidatos a casos de referencia.

### Revisión anual por alguien que no lleva la cuenta

**La regla.** Para cuidar que el nivel sea honesto, los criterios evaluados de cada cuenta los revisa al menos una vez al año alguien que no la lleva.

**Se activa** cuando haya cuentas con un año de remediciones.

**Mientras tanto**, lo que cuida que el nivel sea honesto es la evidencia escrita que lo acompaña y la razón escrita de cada ajuste del CSE.

### Muestra en equipos grandes

**La regla.** Si el equipo que se diagnostica es grande, los criterios sobre lo que hace cualquier persona del equipo —«cualquier vendedor explica igual», «cualquier agente ve el histórico»— se evalúan sobre una muestra de al menos cinco personas de distintos subgrupos, tiendas o turnos.

**Se activa** con el primer diagnóstico de un equipo de más de 20 personas. Ese caso dice si la muestra de cinco alcanza.

**Mientras tanto**, el CSE decide a quién observar y lo escribe en la evidencia.

### Comparaciones entre empresas

**La regla.** Las comparaciones son siempre anónimas y solo entre mediciones del mismo tipo —chequeos con chequeos, diagnósticos con diagnósticos— y del mismo perfil de negocio, porque lo declarado suele quedar un nivel por encima de lo verificado y porque cada perfil se mide con criterios distintos. Se muestran cuando hay al menos 20 mediciones comparables en el segmento. Nunca se usan para ordenar clientes ni para evaluar a quien diagnostica.

**Se activa** cuando haya al menos 20 mediciones comparables en un segmento, como dice la regla.

**Mientras tanto**, los datos se guardan desde la primera medición, como dice la especificación, para no empezar de cero cuando se active.

### Arrastre de lo evaluado

**La regla.** Si alguna medición se hace sin explorar todo —por ejemplo, una remedición en la que un agente solo revisa lo comprobable—, los criterios evaluados se toman del último diagnóstico completo hasta que se vuelven a evaluar. Si nunca hubo uno, lo evaluado se toma de lo que el cliente declara, y el nivel queda por confirmar hasta que se haga. Así una medición parcial no da por revisado lo que no revisó, y el avance no salta solo por medir de otra forma.

**Se activa** si las remediciones se empiezan a hacer sin explorar todo.

**Mientras tanto**, cada diagnóstico revisa todos sus criterios, como dice la especificación.

## Cambios pendientes

Aquí se anota lo que el responsable pasó a cambio pendiente y todavía no entró en una versión: la bandeja de comentarios de Nexus lo exporta con estas mismas columnas. Va con el caso concreto cuando lo hay —qué cliente, qué dimensión y qué pasó— y con la decisión que cambiaría.

| Fecha | Qué cambiaría | Quién lo propone | Caso que lo originó | Qué decisión cambiaría |
|:--|:--|:--|:--|:--|

Todavía no hay cambios pendientes.

## Historial de versiones

**1.2.1 (2026-09-30).** Acompaña a la escala 8.1.0. Sin otros cambios.

**1.2.0 (2026-09-29).** Acompaña a la escala 8.0.0. Se suma «Las ediciones por industria»: con cuál se mide cada unidad, cuándo se hace una edición, qué puede cambiar, cómo se mantiene cuando cambia la matriz y cómo quedan los comentarios hechos desde una edición.

**1.1.10 (2026-09-29).** Acompaña a la escala 7.7.0. Sin otros cambios.

**1.1.9 (2026-09-29).** Acompaña a la escala 7.6.1. Sin otros cambios.

**1.1.8 (2026-09-29).** Acompaña a la escala 7.6.0. Sin otros cambios.

**1.1.7 (2026-09-29).** Acompaña a la escala 7.5.0. Sin otros cambios.

**1.1.6 (2026-09-29).** Acompaña a la escala 7.4.1. Sin otros cambios.

**1.1.5 (2026-09-29).** Acompaña a la escala 7.4.0. Sin otros cambios.

**1.1.4 (2026-09-29).** Acompaña a la escala 7.3.1. Sin otros cambios.

**1.1.3 (2026-09-29).** Acompaña a la escala 7.3.0. Sin otros cambios.

**1.1.2 (2026-09-29).** Acompaña a la escala 7.2.0. Sin otros cambios.

**1.1.1 (2026-09-29).** Acompaña a la escala 7.1.0. Sin otros cambios.

**1.1.0 (2026-09-29).** La escala deja de estar congelada: cambia con el feedback de su responsable y con los comentarios del equipo en Nexus («Cómo cambia la escala»). Cambios pendientes pasa a ser la lista de lo aprobado que todavía no entró en una versión. Acompaña a la escala 7.0.1.

**1.0.0 (2026-09-26).** Primera versión, con la escala 7.0.0. Reúne lo que antes estaba en la Parte 2 de la escala sobre el rol de la IA y del CSE y la validación, y agrega el congelamiento, quién aplica la escala y cuándo, las reglas en espera y los cambios pendientes.
