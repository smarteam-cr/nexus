---
documento: Escala de Rendimiento Smarteam — Manual de operación
version: 1.4.0
escala: 9.0.0
fecha: 2026-10-27
---

# Manual de operación de la Escala de Rendimiento

Este manual dice cómo trabaja el equipo de Smarteam con la Escala de Rendimiento: quién la aplica y cuándo, cómo se reparte el trabajo entre la IA y el CSE, cómo se sabe que la escala funciona y qué reglas esperan hasta que hagan falta. No define niveles ni criterios —eso lo hace la escala, `escala_rendimiento_smarteam.md`— ni el cálculo —eso lo hace la especificación, `especificacion_calculo_escala.md`—. Si algo de aquí contradice a la escala, manda la escala.

## Cómo cambia la escala

La escala cambia con el uso, y lo mismo vale para la especificación y para las reglas de este manual. Cambia por dos vías: el criterio de su responsable, hoy Elías González, y el feedback del equipo, que se manda desde la sección «Escala» de Nexus y queda anclado al criterio, al nivel o a la dimensión que se estaba leyendo.

- **El equipo manda feedback; un super admin decide.** Lo que no se entiende, lo que no calza con un cliente y las propuestas se mandan como feedback desde la escala misma. El feedback es privado: lo ve quien lo mandó y quien lo revisa. Un super admin lo responde, lo descarta o lo lleva a la hoja de ruta.
- **Cada cambio se hace en el borrador de la versión siguiente.** El borrador vive en Nexus: un super admin lo abre desde la versión publicada, lo cambia sobre la escala misma o subiendo el documento editado, y cada cambio queda anotado con quién, cuándo, por qué y el feedback que lo originó. Nadie más lo ve hasta que se publica.
- **Cada versión pasa las mismas pruebas antes de publicarse** y se anota en el historial del documento que cambia. Una versión publicada no se reescribe, y un feedback mandado sobre un texto que después cambió se sigue viendo junto al texto nuevo.
- **La especificación y este manual dicen desde qué versión de la escala valen.** Sacan una versión nueva solo cuando cambian ellos.

## Las ediciones por industria

La escala tiene una matriz general y, en su Parte 5, ediciones por industria: la misma escala dicha para una tienda, un banco, una universidad o una inmobiliaria. No son escalas aparte: comparten dimensiones, niveles, reglas, cálculo e identificadores.

- **Con cuál se mide.** Cada unidad se mide con la edición de su industria si esa edición la cubre —lo dice su encabezado—, y con la escala general si no: una tienda solo física o una aseguradora se miden con la general. Se decide al arrancar y se escribe en el diagnóstico. Si más adelante la unidad pasa a una edición, esa medición es una línea base nueva: no se compara contra la anterior.
- **Cuándo se hace una edición.** Cuando hay clientes o prospectos de esa industria a quienes medir, y alguien que la va a usar con ellos. Una edición puede salir primero con Ventas, que es con lo que se abre la conversación con un prospecto, y sumar Marketing y Servicio después; mientras tanto, esas áreas se miden con la escala general. Las cuatro primeras salieron con las tres áreas antes de usarse con clientes: su responsable prefirió revisarlas completas y después probarlas con dos o tres.
- **Qué puede cambiar una edición.** Lo que de verdad es de su industria: los nombres de las dimensiones de producción, las preguntas, los costos, las palabras de un criterio y los criterios que solo tienen sentido ahí. La base operativa se toca lo menos posible: si una edición empieza a reescribirla, se está volviendo otra escala.
- **Cómo se mantiene.** Un cambio en la matriz obliga a cada edición a decidir: si la matriz suma un criterio en una dimensión que la edición ya adaptó, la edición lo reescribe, lo saca o lo deja como está, y la versión no se publica hasta que lo diga. Y si el texto general de un criterio cambia, lo que la edición decía con sus palabras se vuelve a mirar antes de publicar.
- **El feedback.** Un feedback mandado leyendo una edición queda anclado a esa edición: guarda el texto que la persona leyó. Quien lo revisa decide, como con cualquier otro, si el cambio es de la edición o de la matriz, y busca dónde más pasa lo mismo: en las otras áreas y en las otras ediciones.

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

## Los criterios requeridos

Algunos criterios dicen cuáles otros requieren: lo que tiene que estar para que se puedan cumplir. En la sección «Escala» de Nexus, al elegir un criterio se marcan los que requiere y los que lo requieren a él. No cambian el nivel ni el puntaje; le sirven al CSE para dos cosas.

- **Al diagnosticar.** Si un criterio quedó como cumplido y lo que requiere no, se vuelve a mirar antes de cerrar: casi siempre uno de los dos está mal marcado. Si de verdad se cumple de otra forma, se deja así y se escribe por qué en la evidencia.
- **Al proponer qué sigue.** Lo requerido se trabaja antes. Un criterio del que dependen varios —el documento del cliente ideal, la definición de lead calificado— suele ser el mejor primer paso dentro de la dimensión que toca, porque destraba a los demás.

Cuando a un cliente le falta siempre lo mismo antes de poder avanzar en otra cosa y la escala no lo dice, es un requerido que falta: se manda como feedback desde la escala, como cualquier otro cambio.

## El diagnóstico nunca evalúa al CSE

La escala es la herramienta para llevar al cliente a su resultado, no una medida del desempeño de quien la aplica. Si el nivel del cliente sirviera para evaluar al CSE, quien mide ganaría inflando. Lo que se reconoce es el resultado del cliente.

## Cómo se sabe que la escala funciona

La escala mide madurez, no resultados, y eso es a propósito. Pero hace falta comprobar que subir en ella de verdad mejora el rendimiento: si un criterio no lo hace, está midiendo lo que no es.

Esa comprobación se hace con clientes, no con prospectos, y con datos que ya existen: el resultado que persigue cada cliente, que se registra en el handoff; el criterio de aceptación de cada caso de uso; y el nivel de cada remedición. Cada cierto tiempo se cruzan esas tres cosas para ver si los clientes que suben de nivel logran sus resultados, y el criterio que no acompaña ese avance se revisa. El momento más claro es cuando un departamento llega a su nivel objetivo: el cliente debería estar viendo el resultado que perseguía, y si no lo ve, se revisa el objetivo o el criterio. Junto con los ajustes del CSE, que señalan criterios mal escritos, es lo que mantiene la escala honesta.

Lo que salga de ese cruce se anota en Cambios pendientes, y es la mejor evidencia para decidir qué cambia en la escala.

**Antes del test, una prueba con clientes reales.** Antes de construir el test de diagnóstico se miden entre 5 y 8 clientes que el equipo conoce bien —nunca Wherex, que es el cliente de prueba de Nexus—, con el diagnóstico y con el chequeo, y se compara dónde quedan con dónde el equipo cree que están. Si casi todos quedan en Inicial, la vara de Funcional se mantiene y el informe pasa a mostrar cuántos criterios de Funcional ya cumple el departamento («cumple 27 de 30»), algo que hoy la especificación no emite y que entra en la versión que siga a la prueba, junto con el balance de las celdas desbalanceadas. Los que el equipo valide son los primeros casos de referencia. La 9.0.0 se publicó antes de esa prueba, a pedido de su responsable: lo que esperaba la prueba sigue esperándola.

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

Aquí se anota lo que se aprobó y todavía no entró en una versión: lo que un super admin llevó a la hoja de ruta desde el feedback, con estas mismas columnas. Va con el caso concreto cuando lo hay —qué cliente, qué dimensión y qué pasó— y con la decisión que cambiaría.

| Fecha | Qué cambiaría | Quién lo propone | Caso que lo originó | Qué decisión cambiaría |
|:--|:--|:--|:--|:--|

Lo que quedó para la 9.0 —lo que sí cambia qué se mide, de la revisión de la 8.7 y del feedback F-5, F-6 y F-7, cada punto con su propuesta— está en `pendiente-9-0.md`, y lo que hizo el borrador con cada punto, en `borrador-9-0.md`. Aquí se anota lo que se apruebe desde ahora.

### Decisiones provisionales de la 9.0

La 9.0.0 se publicó el 27 de octubre de 2026 con todo lo que su borrador dejaba abierto ya decidido, para no frenarla. Cada decisión es provisional: la propuso Claude, con la opción que el borrador recomendaba o, si no recomendaba ninguna, con la más conservadora —dejar la escala como estaba, sin mover criterios—, y la revisa su responsable. Las que cambian el texto están en la bitácora del borrador, cada una con su nota. Cambiar una es un cambio de la versión siguiente, con su borrador, como cualquier otro.

**Las preguntas.**

- **§1 · 2.4.F4 · 2.4.F5.** Decidir con datos y operar el sistema sin ayuda externa siguen pidiéndose solo en Marketing, en Funcional. No se mueve nada.
- **§1 · 1.3.O3 · 3.3.E3.** La ficha completa queda como en el borrador: en Óptimo de Ventas y, el dato de lo prometido, en Eficiente de Datos de Servicio. Que el equipo la use no se mide aparte.
- **§1 · 2.6.F3 · 1.6.E3.** Hablarle distinto a cada segmento sigue en Funcional de Marketing y en Eficiente de Ventas. Ninguno cambia de nivel.
- **§2 · 3.1.F2.** El contacto de seguimiento de Funcional y el acompañamiento de uno a muchos de Eficiente siguen los dos, como están.
- **§3 · 1.6.E1 · 2.6.E3 (puntaje de leads).** Va así: el puntaje de leads es de Segmentación de Marketing, en Eficiente, y Ventas lo usa para priorizar, también en Eficiente. Se escribe en la regla de asignación.
- **§3 · 1.6.F4 · 2.3.F2.** Los rasgos del cliente ideal en el CRM quedan en Ventas y en Marketing, como están. Ninguno se retira ni cambia de lo que mide.
- **§4 · 3.7.E2 · 1.6.O2 · 1.7.E · 3.4.O3 (la expansión).** Así: ofrecerle el siguiente producto a un cliente actual es de Ventas, en Eficiente, con la señal que le pasa Servicio. Se escribe en «La próxima compra» y en la regla de asignación. En Educación no entra todavía un criterio propio de Admisiones: se lee como la general.
- **§4 · 3.4.E4 · Banca 3.4.E4.** Lo prometido en la venta queda en los dos lugares, como está: el dato en la ficha (Datos de Servicio) y su traspaso en lo que trae cada cliente nuevo (Equipo y Gobierno). No se acota ninguno.
- **§5 · 1.4.O2.** 1.4.O2 se queda como está: ni se retira ni se reescribe.
- **§5 · 3.6.O1 · 3.6.O2.** 3.6.O1 y 3.6.O2 siguen separados, como están. No se juntan hasta decidir qué hace la IA ahí.
- **§6 · 1.2.O2 · Ecommerce 1.2.O2.** Ecommerce sigue reescribiendo 1.2.O2 para la tienda; el criterio nuevo de la venta sin vendedor se lee en Ecommerce como en la general.
- **§6 · 1.8.O1 · 1.8.O2 · Banca 1.8.O201.** 1.8.O1 queda como está (el análisis de las llamadas). No se amplía a reuniones y chats ni se le escribe qué ejecuta la IA en esta versión.
- **§6 · 3.3.O3.** 3.3.O3 queda en Óptimo, como está. No baja a Eficiente ni se reescribe.
- **§6 · 2.7.O1 · 2.4.O4 · 1.4.O1 · 3.4.O4.** Los Óptimos de la lista quedan como están. Qué ejecuta la IA en cada uno se escribe en la versión siguiente.
- **§6 · 2.1.O1 · 3.1.O1.** En Servicio, la IA de las rutinas sigue aparte del agente que resuelve casos, como entró.
- **§7 · 2.7.F (plan de canales).** No: Funcional no pide un mínimo de canales. La decisión 1 sigue: la empresa elige sus canales.
- **§7 · 2.5.F (mensaje central).** El mensaje central no entra en esta versión: la escala queda como está, sin pedirlo en un lugar nuevo.
- **§7 · 3.7.F2 · Inmobiliaria 3.7.F2.** Inmobiliaria lee el criterio nuevo de Funcional como la general, junto a sus dos de Eficiente.
- **§8 · Ecommerce 2.4.E3.** Ecommerce queda como está: preparar el calendario de promociones con quien opera la venta y con la posventa sigue contando, también sin vendedores.
- **§9 · 3.4.I.** No se retira ninguna señal de Inicial de Servicio: quedan las dos de números y la nueva de los roles de palabra.
- **§9 · 3.3.D1 · Educación 3.3.D1.** La señal de que no hay medición fiable de tiempos ni de satisfacción no vuelve. Datos de Servicio queda como está.
- **§12 · 2.5 (suplantación).** No entra en la escala general en esta versión: sigue solo en las ediciones que la piden, y la regla de asignación lo dice así.
- **§12 · Banca 1.2.F · 3.2.** Sí sirve: el mensaje de riesgo del contacto desde canales verificados queda como lo redactó Claude.
- **§13 · Educación 2.3.F301 · 3.7.F.** Queda como está: en Banca no decide un criterio de permiso nuevo; en Educación, el permiso de Admisiones se queda con su redacción de hoy.
- **§15 · Ecommerce 3.8 · Banca 3.8.** En Ecommerce y Banca, la dimensión 8 de Servicio conserva el nombre que tiene hoy en cada edición.
- **§16 · Regla nueva: cambiar solo para un perfil.** No por ahora: las ediciones no dicen «No aplica en tal perfil». El lector y la especificación no cambian.
- **§16 · 2.3.E1 en las cuatro.** Completar los datos con terceros queda como está, en Datos. No suma los sistemas propios ni cambia en las ediciones.
- **§16 · Ecommerce 1.5.E102 · 1.8.F2 · 1.8.F101.** En Ecommerce, la razón de una devolución queda donde está hoy, en sus varias dimensiones.
- **§16 · Banca 1.7.F201.** En Banca, la solicitud a medias en un canal digital se queda como criterio propio. No se retira.
- **§16 · Educación 1.3.E1.** En Educación, el ±10% del pronóstico se lee como en la general. El ejemplo de los cierres de matrícula no entra todavía.
- **§16 · Inmobiliaria 1.8 · 3.4.E4 (promesa y desistimiento).** Inmobiliaria queda como está: no entran todavía la razón de cada promesa desistida ni las señales de que un comprador puede desistir.
- **§16 · Inmobiliaria: encabezado y alquileres.** Las administradoras de alquileres no entran todavía en la edición de Inmobiliaria.
- **Insider 6 · 2.8.O3 (tráfico suficiente).** Medir cada recorrido y cada campaña contra un grupo de control no entra en esta versión: el Óptimo de Aprendizaje de Marketing queda como está.
- **Insider · los «Ajuste» que suben la vara.** Conservan el número nuevo con que entraron: piden más que antes, y esa es la regla de la escala.
- **Insider · N6 · la base dentro de un rango.** El umbral de la base queda en 5.000 y el rango de HubSpot no se parte: una empresa de mil a 10 mil contactos queda «por confirmar» en la lectura.
- **Insider · N6 · qué es una relación digital recurrente.** Una empresa que vende con equipo puede estar «Lista»: la lectura no pide venta sin vendedor.

**Lo que faltaba escribir.**

- **§3 · 1.4.E3 · 2.4.E3 · 3.4.E4 (acuerdos entre dos áreas).** Se escribe en la regla de asignación: cada acuerdo entre dos áreas se cuenta una sola vez, en Equipo y Gobierno del área que recibe.
- **§4 · 3.7.O4 · regla de asignación (lealtad).** Se escribe en la regla de asignación: lo que se gana comprando va en Tracción del Negocio; lo que se da sin pedir una compra, en Proactividad; premiar al que trae otro cliente, en Canales. Sale «promociones de fidelización» de los detalles para deleitar.
- **§5 · 1.5.F4 · 1.7.F4.** Se escribe en la regla de asignación: la plantilla de la propuesta es de Propuesta y Coherencia; el material de apoyo para mover un negocio, de Tracción del Negocio.
- **§5 · 2.6.O3.** Se escribe en la regla de asignación: lo que cambia en la tienda o en el sitio de venta para cada comprador es de Priorización de Ventas.
- **§8 · 2.7.F3 · las cuatro ediciones.** Las ediciones leen el criterio nuevo de la pauta como la general («en el último trimestre»). Reescribirlo en Educación («en el último período de admisión») queda para la versión siguiente.
- **§11 · 3.3.F (duplicados).** Las ediciones leen el control de duplicados de Servicio como la general. Reescribirlo en cada una queda para la versión siguiente.
- **§12 · 3.1.F (verificar la identidad).** Ecommerce, Educación e Inmobiliaria leen la verificación de identidad como la general; Banca, con su criterio propio. Reescribirla queda para la versión siguiente.
- **§15 · x.6.** La dimensión 6 se llama «Priorización» como nombre general, en «Las ocho dimensiones» y en la tabla de la Parte 4. Las semillas de documentación que la nombran se cambian con la próxima tanda de Nexus.
- **§16 · Registro de equivalencias · Banca 3.7.E5.** El registro de qué práctica va en qué dimensión en cada edición queda para la versión siguiente. Nada sube a la general todavía.
- **§16 · Regla nueva: el aprendizaje vive en x.8.** Revisar las seis ediciones con esa regla queda para la versión siguiente. Las ediciones quedan como están.
- **§16 · Educación 1.7.F301 · 1.7.F302.** En Educación, la solicitud a medias en línea sigue como criterio propio, porque otro criterio lo requiere.
- **Insider · N4 · la tercera pregunta del perfil (tráfico suficiente).** El umbral de tráfico queda en 50.000 visitas al mes, provisional, hasta que Insider mande su calificación de clientes.
- **Insider · N6 · la lectura de preparación, con sus umbrales y sus cimientos.** Los umbrales quedan escritos donde Nexus los lee: el del tráfico, en la tercera pregunta del perfil; el de la base, en «Lista».
- **Insider · N7 · el mapa de herramientas para la 9.0.** El mapa de herramientas 2.0.0 se publica con la 9.0 y reemplaza al 1.0.1.
- **§3 · 1.4.E3 · 2.4.E3 · 3.4.E4 (acuerdos entre dos áreas), corregida.** Corrección del cierre: cada acuerdo entre dos áreas se cuenta en Equipo y Gobierno de una sola de las dos, la que lo mide, y la regla los nombra. Decía «del área que recibe», y la señal del siguiente producto la mide Servicio, que es quien la manda.

**Lo que esperaba la prueba con clientes.**

- **§14 · 1.1.E · 1.2.F · 1.5.E · 1.7.E · 1.3.F · 1.5.O · 2.8.F · 2.1.E · 2.2.E · 2.6.F · 2.3.F · 3.5.O · 3.6.E · 3.7.F · 3.7.E · 3.8.F.** Sigue esperando la prueba con clientes: las celdas se balancean después, y los dos criterios propuestos no entran todavía.
- **§17 · especificación (pasos 3 y 6, el chequeo, el salto final, «Qué se emite», el ejemplo de 1.6).** La especificación 1.4.0 rehace el ejemplo de Priorización de Leads (Eficiente, 66, cumple 1 de 3 para Óptimo) para que la prueba 3 cuadre. Lo demás del cálculo sigue esperando la prueba con clientes.

**Las ediciones.** Cuando un criterio general cambió de texto o salió, lo que cada edición decía de él con sus palabras se soltó: la edición lo lee como el general hasta reescribirlo. Son 287 textos en las seis ediciones; la lista, edición por edición, está en `borrador-9-0.md`. Reescribirlos es de la versión siguiente.

## Historial de versiones

**1.4.0 (2026-10-27).** Acompaña a la escala 9.0.0, que se publicó antes de la prueba con clientes. En «Cambios pendientes», las decisiones provisionales con que se publicó: cada pregunta, cada texto por escribir y cada cosa que esperaba la prueba, con lo que se decidió y que su responsable revisa, y lo que las ediciones todavía leen como la general. En «Cómo se sabe que la escala funciona», lo que esperaba la prueba entra en la versión que la siga. Vale desde la escala 9.0.0.

**1.3.7 (2026-10-09).** Lo que el equipo dice de la escala se manda como feedback desde la escala misma y lo decide un super admin: el manual deja de hablar de los comentarios, que se retiraron. La escala se cambia en el borrador de la versión siguiente, en Nexus, donde cada cambio queda anotado con su porqué. La especificación y el manual dicen desde qué versión de la escala valen. En «Las ediciones por industria», una unidad se mide con la edición de su industria solo si esa edición la cubre. En «Cómo se sabe que la escala funciona», la prueba con 5 a 8 clientes reales antes del test. En «Cambios pendientes», lo que quedó para la 9.0. Vale desde la escala 8.8.0.

**1.3.6 (2026-10-01).** Acompaña a la escala 8.7.0. Sin otros cambios.

**1.3.5 (2026-09-30).** Acompaña a la escala 8.6.0. En «Las ediciones por industria», cuándo se escriben Marketing y Servicio de una edición: las cuatro primeras salieron con las tres áreas antes de probarse con clientes.

**1.3.4 (2026-09-30).** Acompaña a la escala 8.5.0. Sin otros cambios.

**1.3.3 (2026-09-30).** Acompaña a la escala 8.4.2. En «Los criterios requeridos», el ejemplo de un criterio del que dependen varios pasa a ser la definición de lead calificado: a la pipeline review la requiere uno solo.

**1.3.2 (2026-09-30).** Acompaña a la escala 8.4.1. Sin otros cambios.

**1.3.1 (2026-09-30).** Acompaña a la escala 8.4.0, que suma las ediciones de Banca y servicios financieros, Educación e Inmobiliaria. En «Las ediciones por industria» se dice que una edición sale primero con Ventas, y que Marketing y Servicio se adaptan después de usarla.

**1.3.0 (2026-09-30).** Acompaña a la escala 8.3.0. Se suma «Los criterios requeridos»: cómo los usa el CSE al diagnosticar y al proponer qué sigue.

**1.2.2 (2026-09-30).** Acompaña a la escala 8.2.0. Sin otros cambios.

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
