---
documento: Escala de Rendimiento Smarteam — Especificación del cálculo
version: 1.2.2
escala: 8.2.0
fecha: 2026-09-30
---

# Especificación del cálculo de la Escala de Rendimiento

Esta especificación convierte las reglas de la escala en pasos exactos, para que el chequeo, el cotizador y los agentes de Nexus calculen igual. La leen quienes implementan esos sistemas; para usar la escala no hace falta.

Precisa las reglas de la escala, `escala_rendimiento_smarteam.md`, donde ella no llega: redondeos, desempates y casos borde; en eso manda este documento. Si algo de aquí contradice lo que la escala sí dice, es un error de este documento: se aplica la escala y se corrige aquí. El encabezado dice con qué versión de la escala va.

## Identificadores y etiquetas

Cada criterio de la matriz tiene un identificador con la forma dimensión, letra del nivel y número. La letra es D para Deficiente, I para Inicial, F para Funcional, E para Eficiente y O para Óptimo. Así, `1.7.F1` es el primer criterio de Funcional en Tracción del Deal. Sin número, `1.7.F` se refiere al nivel completo.

Junto al identificador va la forma de verificación: comprobable, declarado o evaluado. Si el criterio es de riesgo, lleva además la marca riesgo: no decide el nivel en que está, pero es requisito para pasar a Eficiente. Si describe un hábito, lleva la marca hábito: no se confirma el día que se entrega, solo después de que el equipo operó un tiempo. Y si solo aplica a ciertos perfiles de negocio, lleva la marca de ese perfil: venta con equipo, venta sin vendedor, cliente recurrente, recompra o relación continua. Un criterio lleva una sola marca de perfil. Los identificadores son para los sistemas y el equipo: ningún texto que ve el cliente —criterios, resultados, costos o mensajes— los cita.

Los identificadores son estables. Se asignaron desde cero en la versión 6.0.0, y desde entonces no se reasignan ni se renumeran. Si un criterio se retira, su número queda vacío y no se reutiliza; si se agrega uno, toma el siguiente número libre de su nivel. Eso permite que el chequeo, el cotizador y los agentes apunten siempre al mismo criterio, aunque cambie su redacción.

Identificadores retirados, que no se vuelven a usar: `1.1.E4`, `1.1.F3`, `1.2.F1`, `1.2.F5`, `1.4.E1`, `1.5.E1`, `1.8.F4`, `2.2.F6`, `2.2.F7` y `3.2.F7`.

Un criterio que cambia de dimensión se retira y entra con el siguiente número libre de su nueva dimensión: `1.2.F1` es hoy `1.1.F6`.

La etiqueta de cada criterio sigue siempre el mismo orden: identificador, forma de verificación y, solo si corresponden, las marcas riesgo, hábito y de perfil, separadas por « · ». Por ejemplo: `[1.1.F6 · evaluado · hábito · venta con equipo]`.

Las ediciones por industria, en la Parte 5 de la escala, usan los mismos identificadores. Un criterio de la matriz que una edición dice con sus palabras sigue siendo el mismo criterio: en la edición lleva en la etiqueta solo su identificador, `[1.7.F1]`, y conserva la forma de verificación y las marcas que tiene en la matriz. Un criterio propio de una edición lleva la etiqueta completa y un número del bloque de su edición —del 101 al 199 en la primera, del 201 al 299 en la segunda—: `1.7.E101` solo existe en la primera edición. La matriz numera siempre por debajo de 100, así que un identificador dice por sí solo si el criterio es de la matriz o de una edición, y de cuál. Los criterios propios también son estables: no se reasignan ni se renumeran.

Cada nivel tiene un código del 1 al 5: Deficiente 1, Inicial 2, Funcional 3, Eficiente 4, Óptimo 5. Sirve para que los sistemas comparen niveles, no para graficar. Lo que se grafica es el puntaje de 0 a 100, que tampoco es una nota inventada aparte: su tramo lo pone el nivel, y dentro del tramo solo dice cuánto se avanzó hacia el siguiente.

## Dos cálculos

La escala se aplica de dos formas, como dice su Parte 2, y cada una tiene su cálculo. El chequeo estima el nivel de cada dimensión; el diagnóstico lo calcula criterio por criterio. No se mezclan: un chequeo no se completa con criterios, y un diagnóstico no se estima.

### El cálculo del chequeo

1. **Unidad y perfil.** Antes de las preguntas de dimensión, se registran el equipo que contesta, la industria, el país, cuántas personas tienen la empresa y el equipo, y el perfil de negocio: cómo se cierra la venta —con equipo, transaccional o mixta— y qué pasa después —relación única, recompra o continua—. Una dimensión que se queda sin criterios que apliquen en Funcional no aplica a ese perfil y no se pregunta; hoy es el caso de Priorización de Leads en la venta transaccional, en la escala general. Si la industria de la unidad tiene una edición, el chequeo se hace con ella: con sus nombres, sus preguntas y sus criterios.
2. **Nivel estimado de cada dimensión.** Con las respuestas de la dimensión se elige el nivel cuya descripción en la matriz —la frase que abre el nivel y sus criterios, leídos en conjunto— calza mejor con lo que contó el prospecto. Es mejor ajuste en los cinco niveles, también de Funcional para arriba: no se marca cada criterio. Lo puede hacer la IA, leyendo las respuestas contra la matriz, o una tabla que asigna un nivel a cada respuesta. Si las respuestas apuntan a niveles distintos, o hay duda entre dos, se toma el más bajo. Las preguntas de dimensión son obligatorias, y «no sé» cuenta como la respuesta del nivel más bajo.
3. **Nivel de la capa y del departamento.** Como en el diagnóstico: la capa está en el nivel de su dimensión más débil, y el departamento, en el de su capa más baja.
4. **Puntaje estimado.** Cada dimensión va a mitad del tramo de su nivel: Deficiente 10, Inicial 30, Funcional 50 y Eficiente 70; Óptimo vale 100. Es decir, se supone que cada dimensión cumple la mitad de los criterios del nivel siguiente. La capa y el departamento se calculan con ese supuesto, como en el paso 7 del diagnóstico: las dimensiones que ya llegaron al nivel siguiente cuentan completas, y las demás, a mitad de camino. Como en el diagnóstico, debajo de Funcional el nivel siguiente es Funcional. Por ejemplo, una base operativa con dos dimensiones en Funcional y dos en Inicial está en Inicial, y su avance hacia Funcional es el promedio de 1, 1, 0,5 y 0,5, un 75%: saca 35.
5. **Riesgos.** Si una respuesta deja ver que un criterio de riesgo no se cumple —por ejemplo, que hay contactos repetidos sin control—, se muestra su mensaje de la tabla de Riesgos de la escala. El chequeo no pregunta por cada riesgo: si ninguna respuesta lo deja ver, no se muestra. Una dimensión con un riesgo a la vista no se estima por encima de Funcional, porque el riesgo impide pasar a Eficiente.
6. **Recomendación.** Una sola, con su razón. Sale de la regla del paso 9 del diagnóstico —la capa más baja y, dentro de ella, la dimensión más baja—, con el nivel objetivo de los prospectos, que es Funcional. Si el departamento ya llegó a Funcional, se usa como objetivo el nivel siguiente al suyo, como dice la escala en El nivel objetivo; en Óptimo, la recomendación es sostenerlo.

### El cálculo del diagnóstico

Este paso a paso es la versión exacta de las reglas de la Parte 2 de la escala.

1. **Qué criterios cuentan.** Un criterio no cuenta cuando está condicionado y no aplica —los que abren con una condición, como «si hay» o «si lo que se vende es limitado»—, cuando lleva una marca de perfil que no corresponde al perfil de la unidad, o cuando el CSE lo marcó como que no aplica, con su justificación. Las marcas valen así: venta con equipo, cuando la venta es con equipo o mixta; venta sin vendedor, cuando es transaccional o mixta; cliente recurrente, cuando después hay recompra o relación continua; recompra, solo cuando hay recompra; y relación continua, solo cuando la relación es continua. Si la unidad se mide con una edición, los criterios son los de esa edición: los de la matriz que la edición no sacó —leídos con su texto, si los reescribió— más sus criterios propios; los propios de otra edición no existen para ella. Las marcas de perfil valen igual dentro de la edición. Los que no cuentan salen de toda la cuenta: del nivel y del puntaje. El CSE no marca así el único criterio que decide un nivel: si no corresponde, ajusta el nivel, con su justificación.
2. **Cuándo se cumple un criterio.** Según su redacción, leída con los valores de Cómo se leen los criterios, en la escala. Se da por cumplido si la dimensión lo resuelve de una forma más avanzada. Cada diagnóstico revisa todos los criterios que cuentan: no se toma nada de un diagnóstico anterior ni del chequeo, que solo orienta la exploración. Si de un criterio no hay información, el CSE la busca antes de cerrar el diagnóstico; si no la consigue, cuenta como no cumplido y el informe dice cuántos quedaron así.
3. **Nivel de una dimensión.** Es el nivel más alto, de Funcional para arriba, en el que la dimensión cumple todos los criterios de decisión de ese nivel, y además todos los criterios —de decisión y de riesgo— de los niveles anteriores desde Funcional. Si no llega a Funcional, se asigna Deficiente o Inicial según cuál describe mejor su situación; si los dos calzan igual, Deficiente. Un nivel que no tiene criterios de decisión que apliquen al perfil no se alcanza.
4. **Por confirmar.** Un hábito puede estar cumplido, iniciado o no cumplido, como dice Niveles por confirmar, en la escala. Si para alcanzar un nivel solo le faltan hábitos iniciados, ese nivel queda por confirmar: cuenta como alcanzado en todo el cálculo, y en la siguiente remedición se confirma o baja. Un hábito que no se hace cuenta como no cumplido.
5. **Nivel de una capa y del departamento.** La capa está en el nivel de su dimensión más débil; el departamento, en el de su capa más baja. Una dimensión que se queda sin criterios que apliquen en Funcional no aplica a ese perfil: no entra en la cuenta de su capa, ni en el nivel ni en el puntaje, y se emite como que no aplica. Con una edición, eso se mira sobre los criterios de la edición: una dimensión que en la escala general no aplica a un perfil sí aplica en la edición que le da criterios propios, y una edición nunca saca una dimensión que en la escala general aplica. En la venta transaccional, los criterios de Ventas se leen sobre la venta automática, como dice El perfil de negocio.
6. **Puntaje de una dimensión.** El tramo lo pone su nivel: Deficiente de 0 a 20, Inicial de 20 a 40, Funcional de 40 a 60 y Eficiente de 60 a 80; Óptimo vale 100. La posición dentro del tramo es el porcentaje que ya cumple de los criterios del nivel siguiente, contando los de decisión de ese nivel y los de riesgo del nivel actual. Debajo de Funcional, el nivel siguiente es Funcional.
7. **Puntaje de una capa y del departamento.** El tramo lo pone su nivel. La posición es el promedio del avance de sus dimensiones hacia el nivel siguiente al de la capa o del departamento: las que ya llegaron cuentan completas, y las demás, con su porcentaje. En los tres casos —dimensión, capa y departamento—, la posición dentro del tramo se redondea hacia abajo, al entero, y no pasa de 19 mientras no se alcance el nivel siguiente: el puntaje solo cambia de tramo cuando cambia el nivel.
8. **Ajuste del CSE.** Si el CSE ajusta el nivel de una dimensión, con justificación, se guardan el nivel y el puntaje calculados y también los ajustados. El puntaje ajustado usa el tramo del nivel ajustado, y la capa y el departamento se calculan con el ajustado.
9. **Qué se trabaja primero.** Entran solo las dimensiones que están debajo de su nivel objetivo: el de su departamento o, si la dimensión tiene uno propio, el suyo. Si se midió más de un departamento, la única recomendación sale del de nivel más bajo; a igual nivel, en el chequeo, del que el prospecto eligió primero, y en el diagnóstico, del que acuerde el CSE con el cliente, con la razón escrita. Dentro del departamento, dos pasos. Primero, la capa más baja entre las que tienen alguna dimensión que entra; si las dos están en el mismo nivel, va la base cuando están debajo de Funcional, y la producción cuando están de Funcional para arriba. Segundo, dentro de esa capa, la dimensión de nivel más bajo, y entre las del mismo nivel, la que va antes en el orden de dependencias de su área y tipo de venta, que está en la escala, en Qué se trabaja primero. Si el CSE elige otra dimensión de esa misma capa, también debajo de su objetivo, porque el resultado que persigue el cliente lo pide, se guardan la calculada y la elegida, con la razón. El puntaje no decide. La razón se escribe en el informe. Si ninguna dimensión entra, el departamento llegó a su objetivo: la recomendación es sostenerlo y volver a medir, y el objetivo se revisa si cambió el resultado que persigue el cliente.

### El puntaje, con un ejemplo

La regla es la misma en las tres alturas. En una dimensión, el avance es el porcentaje de criterios del nivel siguiente que ya cumple. En una capa, es el promedio del avance de sus cuatro dimensiones —o de las que apliquen a su perfil— hacia el nivel siguiente al de la capa: las que ya llegaron cuentan completas, y las demás, con su porcentaje. En el departamento es lo mismo con sus ocho dimensiones, o las que apliquen. Debajo de Funcional, como Deficiente e Inicial no tienen criterios de logro, el avance se mide hacia Funcional. Y los criterios de riesgo de un nivel cuentan como parte del nivel siguiente, porque son requisito para llegar a él.

Por ejemplo, una base operativa con tres dimensiones en Funcional y una en Inicial que cumple 3 de sus 5 criterios de Funcional. La capa está en Inicial, porque manda la más débil, y su avance hacia Funcional es el promedio de 1, 1, 1 y 0,6, un 90%. Saca 38.

## Qué se emite

### Salida del diagnóstico

Cada dimensión diagnosticada se emite como: área, ID y nombre de dimensión, nivel, puntaje y la evidencia que lo sustenta. Si se midió con una edición, el área y la dimensión llevan el nombre que tienen en esa edición, y el informe dice con cuál se midió; el ID es el mismo en todas. El puntaje va con lo que lo explica: en una dimensión, cuántos criterios del nivel siguiente cumple —«cumple 2 de 4 para Eficiente»— y cuáles le faltan; en una capa o un departamento, cuántas de sus dimensiones ya están en el nivel siguiente. Si el CSE ajustó el nivel, se emiten los dos —el calculado y el ajustado— con la justificación. Y si quedan criterios de riesgo pendientes, se emiten como riesgos activos, con su mensaje. Un nivel por confirmar se emite con esa marca y con los hábitos que faltan confirmar. Si la dimensión está debajo de Funcional, se emite su costo de quedarse. Cada departamento se emite junto a su nivel objetivo, cuando lo hay: «Ventas: Inicial, 38; objetivo Eficiente». Y el informe cierra con una sola recomendación: el siguiente paso que sale de la regla de prioridad, planteado como un paso chico —un caso de uso—, no como un menú de opciones, y con la razón de por qué va primero. Si quedaron criterios sin información, dice cuántos.

> Ventas — 1.6 Priorización de Leads — Eficiente, 65, cumple 1 de 4 para Óptimo — "lead scoring por reglas activo, cuentas objetivo identificadas"

Una dimensión que toque dos áreas se emite una vez por área. La evidencia puede citar por su identificador los criterios que la sustentan.

### Salida del chequeo

Cada departamento que contestó se emite con su nivel y su puntaje estimados, y con el nivel de sus dos capas; cada dimensión, con su nivel y su puntaje estimados. Todo va marcado como estimado, y no se emiten criterios cumplidos ni conteos, porque el chequeo no los recorre. Si la dimensión está debajo de Funcional, se emite su costo de quedarse. Además se emiten lo que ganaría al subir —las líneas de resultado del nivel siguiente; debajo de Funcional, las de Funcional, y en Óptimo, ninguna—, los riesgos que dejó ver alguna respuesta, con su mensaje, y una sola recomendación, con la razón de por qué va primero. Lo que pide Funcional —los criterios de Funcional de cada dimensión, sin su etiqueta— se muestra plegado.

> Ventas — 1.6 Priorización de Leads — Inicial, 30, estimado

## Datos que guarda cada medición

Cada medición guarda lo mismo, sea un chequeo o un diagnóstico, para que con el tiempo se pueda comparar:

- cuándo se hizo, qué tipo fue —chequeo o diagnóstico— y quién lo contestó o lo hizo: el prospecto, el consultor con él, el cliente o un CSE;
- la industria, el país y el tamaño: cuántas personas tiene la empresa y cuántas el equipo diagnosticado;
- qué equipo o unidad se diagnosticó y su perfil de negocio: cómo se cierra la venta y qué pasa después;
- con qué se midió: la escala general o una edición por industria, con su clave;
- el resultado que persigue el cliente y el nivel objetivo de cada departamento —y el de cada dimensión que tenga uno propio, con su razón—, cuando se conocen;
- en el chequeo, las respuestas, el nivel y el puntaje estimados de cada dimensión, capa y departamento, y los riesgos que se mostraron;
- en el diagnóstico, el nivel y el puntaje de cada dimensión, capa y departamento, la evidencia de cada nivel, los criterios cumplidos, los hábitos iniciados, los que quedaron sin información, los riesgos activos y los ajustes del CSE con su justificación, incluido el cambio de orden en qué se trabaja primero;
- en una remedición, con qué línea base y con qué medición anterior se compara;
- en el primer diagnóstico de un cliente que hizo el chequeo, con qué chequeo se enlaza, para ver la diferencia entre lo estimado y lo verificado.

Los datos se guardan desde la primera medición, aunque todavía no se comparen empresas entre sí: esa comparación es una regla en espera, en el manual de operación. Nunca se usan para ordenar clientes ni para evaluar a quien diagnostica.

El avance se mide entre mediciones hechas con lo mismo: la escala general, o la misma edición. Con otra edición cambian los criterios —y puede cambiar qué dimensiones aplican—, así que el nivel y el puntaje no se comparan: si una unidad pasa de la escala general a una edición, o de una edición a otra, esa medición fija una línea base nueva.

## Pruebas de cada versión

Cada versión de la escala y de esta especificación, y cada sistema que las implementa, tiene que pasar estas pruebas antes de usarse. Las reglas pueden estar bien una por una y fallar al combinarse, y solo se nota al aplicarlas sobre todos los casos: estas pruebas lo detectan.

1. **Ningún nivel vacío.** Todo nivel de Funcional para arriba tiene al menos un criterio que decide el nivel para cada perfil de negocio en que su dimensión aplica. Si en alguna versión queda uno vacío, ese nivel no se alcanza hasta que se corrija.
2. **Nada se regala.** En todos los perfiles, una dimensión que no cumple ningún criterio queda debajo de Funcional, y ningún nivel queda por confirmar si le falta un hábito que no se hace.
3. **Los ejemplos cuadran.** Los ejemplos de este documento dan el resultado que dicen: la base operativa del ejemplo del puntaje da 38; la del ejemplo del chequeo, 35; y la dimensión del ejemplo de la salida del diagnóstico, 65.
4. **Sin identificadores a la vista.** Ningún texto que ve el cliente —criterios, resultados, costos o mensajes— cita un identificador.
5. **Identificadores estables.** Ninguno se repite, ninguno retirado se reusa, y ninguno existente cambia de dimensión ni de nivel.
6. **Casos de referencia.** En espera, igual que la calibración: cuando existan los casos de referencia validados, el cálculo reproduce el diagnóstico correcto de cada uno.
7. **Documentos alineados.** Esta especificación y el manual de operación dicen en su encabezado con qué versión de la escala van, y es la vigente.
8. **Ediciones coherentes.** Cada edición tiene su clave, su perfil habitual y su bloque de números. Lo que reescribe o saca existe en la matriz, y un criterio propio no usa un identificador de la matriz ni de otra edición. Si toca los criterios de una dimensión, dice algo de todos los de la matriz: lo reescribe, lo saca o lo deja como está, y una sola de las tres. Un criterio reescrito conserva las palabras con valor fijo que tiene en la matriz. Una edición no le cambia el nombre a una dimensión de base operativa ni saca una dimensión que en la escala general aplica.

Las pruebas 1, 2, 4 y 5 se corren sobre la escala general y, además, sobre la escala vista por cada edición: un nivel que queda vacío solo dentro de una edición también es una falla. La prueba 3, que comprueba los ejemplos de este documento, es de la escala general.

Las pruebas 1 a 5, la 7 y la 8 las corre `pruebas_escala.py`:

```
python3 pruebas_escala.py escala_rendimiento_smarteam.md especificacion_calculo_escala.md [escala_anterior.md]
```

La prueba 5 compara contra la versión anterior de la escala, si se le pasa. La 7 revisa también el manual, si está en la misma carpeta que la especificación.

## Historial de versiones

**1.2.2 (2026-09-30).** Acompaña a la escala 8.2.0, que deja cada cosa de Ventas en una sola dimensión: quedan retirados `1.1.F3`, `1.1.E4`, `1.4.E1` y `1.5.E1`. No cambia el cálculo.

**1.2.1 (2026-09-30).** Acompaña a la escala 8.1.0: `1.8.F4` queda retirado. No cambia el cálculo.

**1.2.0 (2026-09-29).** Acompaña a la escala 8.0.0, que suma las ediciones por industria. Se dice cómo se identifican y etiquetan los criterios de una edición —los reescritos, con solo su identificador; los propios, en el bloque de números de su edición—, qué criterios cuentan cuando una unidad se mide con una edición, que cada medición guarda con qué se midió y que cambiar de edición fija una línea base nueva. Se suma la prueba 8 y las pruebas 1, 2, 4 y 5 corren también sobre cada edición. No cambia el cálculo del nivel ni del puntaje.

**1.1.0 (2026-09-29).** Acompaña a la escala 7.7.0. Hay dos marcas de perfil nuevas, venta sin vendedor y recompra, y se dice para qué perfiles vale cada marca. La regla que leía la frase «vende sin vendedor» en el texto del criterio deja de existir: la reemplaza la marca. No cambia el cálculo del nivel ni del puntaje.

**1.0.10 (2026-09-29).** Acompaña a la escala 7.6.1. No cambia el cálculo.

**1.0.9 (2026-09-29).** Acompaña a la escala 7.6.0. No cambia el cálculo.

**1.0.8 (2026-09-29).** Acompaña a la escala 7.5.0. No cambia el cálculo.

**1.0.7 (2026-09-29).** Acompaña a la escala 7.4.1. No cambia el cálculo.

**1.0.6 (2026-09-29).** Acompaña a la escala 7.4.0. No cambia el cálculo.

**1.0.5 (2026-09-29).** Acompaña a la escala 7.3.1. No cambia el cálculo.

**1.0.4 (2026-09-29).** Acompaña a la escala 7.3.0. No cambia el cálculo.

**1.0.3 (2026-09-29).** Acompaña a la escala 7.2.0. No cambia el cálculo.

**1.0.2 (2026-09-29).** Acompaña a la escala 7.1.0: `1.2.F1` queda retirado al pasar a Procesos y Rutinas como `1.1.F6`, y se dice cómo se mueve un criterio de dimensión. No cambia el cálculo.

**1.0.1 (2026-09-29).** Acompaña a la escala 7.0.1. No cambia el cálculo.

**1.0.0 (2026-09-26).** Primera versión, con la escala 7.0.0. Reúne lo que antes estaba en la Parte 4 de la escala —identificadores, cálculo, salida, datos y pruebas— y agrega el cálculo del chequeo. El diagnóstico ya no toma resultados de un diagnóstico anterior, qué se trabaja primero queda en dos pasos, y la posición dentro del tramo se redondea hacia abajo.
