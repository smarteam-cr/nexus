# «Hablar con Nexus» en la preventa: plan de la tanda del 21 nov (noche)

Lo que Elías reportó al probarlo en Cemaco · Ecuador, y cómo se cierra cada cosa. Lo que no entra en esta tanda está
al final, dicho.

## Lo que pasó (leído en producción, solo lectura)

| Hora | Lo que escribió | Lo que hizo Nexus |
|---|---|---|
| 22:31 | «Es importante esto de que crédito cobro contacta…» | Lo guardó como nota, con 1 hecho. Bien. |
| 22:35 | «¿Cuales son los principales dolores de este cliente?» | Respondió 12 puntos, con `**negritas**` sin formato. |
| 22:36 | «resumelos» | Lo guardó como nota («resumelos») y no respondió nada. |

## Las causas

1. **El formato.** La respuesta se pinta como texto plano, y el modelo escribe en Markdown. Además salió larga, aunque
   la regla dice «corto y directo»: no tiene un tope de puntos.
2. **Enter.** Solo enviaba con Ctrl+Enter.
3. **«resumelos» se guardó.**
   - La lista de palabras que reconoce una pregunta tenía «resume» y «resúmeme», pero no «resúmelos», ni sin tilde.
   - El código le dijo al modelo «esto NO es una pregunta», así que el modelo no podía corregirlo.
   - La nota se guardaba SOLA apenas Nexus decía «listo». Un error al clasificar terminaba en una nota basura en
     «Lo que sabes del cliente».

Una lista de palabras nunca va a cubrir todas las formas de pedir algo en español. Lo que hace funcional al chat no es
acertar siempre: es que un error cueste un clic y no ensucie la cuenta.

## El plan

### 1. Nada se guarda sin tu clic (lo central)
- Cuando Nexus entiende lo que contaste, ya no guarda. Muestra **«Esto cambia lo que se sabe del cliente»**:
  - la nota, con tus palabras;
  - lo que Nexus entendió (los hechos, frase por frase);
  - los cambios a las tarjetas de la arquitectura de la venta, como hoy.
- Botones: **«Guardar»** (la nota y sus hechos; después corre la revisión de La escala, como hoy), **«No guardar»**
  (no queda nada; empieza una conversación nueva) y, debajo de lo último que escribiste, **«¿Era una pregunta?
  Respóndela»**. Lo propuesto se olvida recién cuando llega la respuesta: si falla, sigue con su «Guardar».
- Los cambios a las tarjetas se ven antes y se aplican después de guardar, con su «Aplicar», «No» y «Aplicar todo».
- Al volver a la página, lo que estaba sin guardar vuelve igual, con su «Guardar» (sale de la vuelta guardada; sin SQL).

### 2. Si es pregunta: el código decide lo seguro y el modelo lo dudoso
- **Pregunta segura** (el código): lleva «¿» o «?», o le pide algo a Nexus. Esto incluye los pedidos con pronombre, con
  o sin tilde: «resúmelos», «resumelos», «explícame», «compáralos», «hazme». Va directo a la respuesta: no gasta la
  llamada que clasifica. Una palabra de pregunta sin signo («Cómo te decía…», «¡Qué desorden!») no es segura.
- **Contar seguro** (el código): contesta una pregunta que le hizo Nexus, o arranca como algo que se cuenta («Es
  importante…», «Ojo…», «Anota que…», «Ten en cuenta…»). Se toma como contar aunque el modelo diga otra cosa.
- **Lo demás lo decide el modelo**, con la conversación a la vista. Por ejemplo, después de una respuesta, «y el
  segundo» es una pregunta de seguimiento.
- Ninguno de los dos errores ensucia: si se toma una pregunta como algo contado, aparece «Era una pregunta»; si se toma
  algo contado como pregunta, aparece «Guardarlo como nota».

### 3. Formato y Enter
- La respuesta se pinta con formato: listas, negritas y párrafos.
- La regla del modelo pide como mucho 6 puntos; si hay más, dice cuántos quedaron afuera.
- Enter envía y Shift+Enter hace un salto de línea. Mientras se compone un acento, Enter no envía. En el celular, Enter
  baja de renglón y se envía con el botón.

### 4. Lo que quedó en producción
- En Cemaco · Ecuador hay una nota que dice «resumelos» (sin hechos). Se quita con la X en «Lo que sabes del cliente»;
  no la toco sin tu visto bueno.

## Cómo se prueba (antes del commit)
- **Unit.** La regla de las tres respuestas: «resumelos», «resúmelos», «explícame», «Explica que no tienen
  presupuesto» (dudoso, no pregunta), «Es importante…» (contar seguro), y la frase de Elías. Que el turno respete lo
  seguro. La conversación guardada trae los hechos del «listo».
- **Integración.**
  - «resumelos» después de una respuesta se responde sin llamar al clasificador.
  - «Era una pregunta» (`preguntar`) responde sin clasificar.
  - «Es importante…» queda como listo aunque el modelo diga consulta.
  - En lo dudoso, la consulta del modelo se responde con las palabras de la persona.
- **Prueba de rojo** de la regla nueva.
- tsc en 0, eslint, la suite, y `/revisar` ligero.
- La pantalla no se puede probar logueado desde acá: la prueba es la tabla «Qué probar».

## Lo que no entra en esta tanda
- Una sola puerta entre «Hablar con Nexus» y «Agregar algo que sabes» (el cambio 5, que dijiste que no).
- Que un «gracias» u «ok» no proponga guardar nada: hoy mostraría «Guardar» y se resuelve con «No guardar».
