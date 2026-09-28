---
documento: Escala de Rendimiento Smarteam — Manual de operación
version: 1.0.0
escala: 7.0.0
fecha: 2026-09-26
---

# Manual de operación de la Escala de Rendimiento

Este manual dice cómo trabaja el equipo de Smarteam con la Escala de Rendimiento: quién la aplica y cuándo, cómo se reparte el trabajo entre la IA y el CSE, cómo se sabe que la escala funciona y qué reglas esperan hasta que hagan falta. No define niveles ni criterios —eso lo hace la escala, `escala_rendimiento_smarteam.md`— ni el cálculo —eso lo hace la especificación, `especificacion_calculo_escala.md`—. Si algo de aquí contradice a la escala, manda la escala.

## La escala está congelada

La versión 7.0.0 de la escala no cambia hasta que se haya usado con cinco a diez clientes reales, y lo mismo vale para la especificación y para las reglas de este manual. Congelarla no es dejar de mejorarla: es juntar evidencia antes de cambiarla, para que cada cambio salga de un caso real y no de una revisión en papel.

Mientras esté congelada:

- **Solo se corrige lo que impide usarla:** un cálculo que da un resultado absurdo, dos criterios que se contradicen, un texto que el cliente no entiende. La corrección sube el último número de la versión del documento que cambia —por ejemplo, de 7.0.0 a 7.0.1— y se anota en su historial.
- **Todo lo demás se anota** en Cambios pendientes, al final de este manual, con el caso que lo originó y la decisión que cambiaría. No se aplica, y anotarlo no cambia ninguna versión.
- **Se descongela** cuando haya al menos cinco clientes con diagnóstico y alguno ya tenga su primera remedición, o al llegar a diez, lo que pase primero. Lo decide el responsable de la escala, hoy Elías González. Ahí se revisan juntos los cambios pendientes: entran los que se repiten en varios casos o cambian una decisión con el cliente.

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

La regla estricta calcula un nivel, y el CSE lo puede ajustar, o marcar un criterio como que no aplica por la industria o el momento del cliente, siempre con una justificación escrita. Se guardan los dos niveles, el calculado y el ajustado: así el cálculo sigue siendo repetible y el juicio del CSE queda a la vista. Si distintos CSE ajustan una y otra vez el mismo criterio, es la señal de que está mal escrito y hay que corregirlo en la escala. Mientras la escala esté congelada, eso se anota en Cambios pendientes.

## El diagnóstico nunca evalúa al CSE

La escala es la herramienta para llevar al cliente a su resultado, no una medida del desempeño de quien la aplica. Si el nivel del cliente sirviera para evaluar al CSE, quien mide ganaría inflando. Lo que se reconoce es el resultado del cliente.

## Cómo se sabe que la escala funciona

La escala mide madurez, no resultados, y eso es a propósito. Pero hace falta comprobar que subir en ella de verdad mejora el rendimiento: si un criterio no lo hace, está midiendo lo que no es.

Esa comprobación se hace con clientes, no con prospectos, y con datos que ya existen: el resultado que persigue cada cliente, que se registra en el handoff; el criterio de aceptación de cada caso de uso; y el nivel de cada remedición. Cada cierto tiempo se cruzan esas tres cosas para ver si los clientes que suben de nivel logran sus resultados, y el criterio que no acompaña ese avance se revisa. El momento más claro es cuando un departamento llega a su nivel objetivo: el cliente debería estar viendo el resultado que perseguía, y si no lo ve, se revisa el objetivo o el criterio. Junto con los ajustes del CSE, que señalan criterios mal escritos, es lo que mantiene la escala honesta.

Mientras la escala esté congelada, lo que salga de ese cruce se anota en Cambios pendientes, y es la mejor evidencia para decidir qué cambia al descongelarla.

## Reglas en espera

Estas reglas estaban en la escala y salieron porque todavía no hay con qué aplicarlas: no hay casos de referencia, ni cuentas con un año de historia, ni suficientes diagnósticos. No se borraron: cada una dice qué la activa y qué se hace mientras tanto.

Una regla se activa cuando pasa su condición y, además, las tres condiciones que se usan en Nexus para cualquier rutina nueva: una persona con nombre que la va a usar, una rutina que ya existe donde vive, y algo nombrado que tiene que mover. Al activarla, vuelve a la escala o a la especificación en la siguiente versión; si no cambia el cálculo, se aplica desde este manual. Si se activa mientras la escala está congelada, se anota como cambio pendiente y entra al descongelar, salvo que sin ella no se pueda seguir usando la escala: entonces entra como corrección.

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

Aquí se anota toda idea de cambio a la escala mientras está congelada. La anota quien la detecte —consultor, CSE o quien implementa un sistema—, con el caso concreto: qué cliente, qué dimensión y qué pasó. No se aplica: se decide al descongelar, con los casos a la vista.

| Fecha | Qué cambiaría | Quién lo propone | Caso que lo originó | Qué decisión cambiaría |
|:--|:--|:--|:--|:--|

Todavía no hay cambios pendientes.

## Historial de versiones

**1.0.0 (2026-09-26).** Primera versión, con la escala 7.0.0. Reúne lo que antes estaba en la Parte 2 de la escala sobre el rol de la IA y del CSE y la validación, y agrega el congelamiento, quién aplica la escala y cuándo, las reglas en espera y los cambios pendientes.
