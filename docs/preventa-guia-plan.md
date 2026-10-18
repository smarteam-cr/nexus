# La preventa lleva a la siguiente pregunta lógica — plan

Iniciativa A de `docs/roadmap.md`. Marco la usa el lunes 20 de octubre con Distribuidora Larce.

## El problema, medido en Larce (`cmvbcuvcs016706t1xcny5pss`, solo lectura, 18 oct)

- La guía de la sesión 2 (`propuesta.guia`, del 16 oct) trae **8 preguntas con 3 repreguntas cada una**.
- Las preguntas salen de las **casillas vacías del marco** (`huecosDelResumen`) y de las **dimensiones sin evidencia**
  (`enfoqueDeLaGuia`). Ninguna de las dos mira lo que el cliente ya respondió.
- El pedido al agente (`contextoDeLaGuia`) **no lleva el test ni la nota de HubSpot**: solo las casillas confirmadas,
  el nivel de cada dimensión y su porqué. Lo que Sonia marcó en el test («el vendedor está solo… los deals que se
  enfrían mueren sin que nadie reaccione») y lo que dice la nota de Roberto («el vendedor lo deja morir y nadie en el
  equipo lo detecta») están guardados, pero solo como citas de las hipótesis de nivel (`propuesta.items`, T1 y H1).
- Resultado: la primera pregunta fue «¿Qué pasa en el equipo cuando un negocio deja de avanzar, cuando un deal se
  queda quieto?». La que valía («¿cuánto les ha costado?») quedó como tercera repregunta.

## Qué cambia

1. **«Lo que ya sabemos»** arriba de la guía, en la Preparación de cada sesión: de 3 a 5 líneas con lo que el cliente
   ya respondió, con sus palabras y de dónde sale cada una (el test, la nota del test en HubSpot, una reunión leída,
   lo sumado a mano, o lo confirmado en el Resumen). Lo arma `loQueYaSabemos` (puro, `lib/exploraciones/lo-que-ya-sabemos.ts`)
   con lo que ya está guardado: las respuestas del test (`test.tests`), las citas verificadas de lo que propuso el
   agente (`propuesta.items[].fuentes[].cita`, solo T, H, S y M: nunca N, las notas del vendedor), la evidencia de cada
   nivel confirmado (`chequeo[].evidencia`, solo de una reunión o del portal) y las casillas confirmadas que dice el
   cliente (metas, retos, planes, tiempos, consecuencias e implicaciones). **Nunca** lo interno: presupuesto, quién
   decide, objeciones, contexto, particularidades ni la hipótesis de valor.
2. **El código decide qué se pregunta y en qué paso.** `planDeLaGuia` (puro, `lib/exploraciones/plan-de-la-guia.ts`)
   reemplaza a «casillas vacías + dimensiones sin evidencia» en la preventa. Cada pregunta es un tema (una tarjeta o
   una dimensión) y un **paso** de la siguiente pregunta lógica: situación → impacto (cuánto le afecta y le cuesta) →
   solución (cómo lo quiere resolver, qué intentó) → cuándo → con qué (presupuesto, quién firma).
   - Un **dolor que el cliente ya dijo** (una dimensión de las áreas en juego, debajo de Funcional, con sus palabras)
     no se pregunta en «situación»: arranca en impacto. Si en una sesión anterior ya se preguntó el impacto y se marcó
     hecha, pasa a solución.
   - Una **tarjeta con dato** no se pregunta («si ya están los tiempos, no hay más preguntas de tiempos»).
   - Sin dolores dichos, dos preguntas de retos y la escala (situación).
   - Orden: lo que viene de antes (lo llevado y lo de una sesión cortada) → los dolores, del nivel más bajo y con más
     fuentes → lo que falta para proponer (`calidad.ts`: meta, consecuencia, tiempos, quién firma) → el presupuesto al
     final.
3. **Unas 5 preguntas** (`MAX_PREGUNTAS_DE_LA_GUIA = 5`, una constante). Las repreguntas siguen plegadas detrás de un clic.
4. **Siempre cierra** con la pregunta de cierre y el siguiente paso. `cierreDeLaGuia` (puro) dice qué de lo que falta
   para proponer no entró en las preguntas («si no salió, pregunta quién firma») y pide el siguiente paso con fecha.
5. **El agente escribe; el código filtra.** El pedido lleva «Lo que ya sabemos», y por cada pregunta su tema, su paso y
   las palabras del cliente de las que parte. El tono sale de la nota de HubSpot que le sirvió a Marco: corta, con las
   palabras del cliente, directa a lo que duele. Los ejemplos del prompt son frases del test (las opciones del
   diagnóstico, no datos de un cliente). Al leer la respuesta, `repiteLoSabido` descarta la pregunta que vuelve a
   preguntar la situación de algo ya dicho, y en su lugar va `preguntaDeRespaldo` (armada por el código con las
   palabras del cliente: «En el diagnóstico marcaste: «…». ¿Cuánto les ha costado eso este año?»). El mismo filtro
   corre al mostrar una guía vieja: la de Larce del 16 oct deja de mostrar «¿Qué pasa cuando un deal se queda quieto?».

## Archivos

- Nuevos: `lib/exploraciones/lo-que-ya-sabemos.ts`, `lib/exploraciones/plan-de-la-guia.ts`, sus pruebas y el fixture
  `lib/exploraciones/__fixtures__/preventa-larce.ts` (Larce sin nombres reales: «Distribuidora Ejemplo», «Ana», «Luis»).
- `lib/exploraciones/guia.ts`: `focoDeLaGuia` usa el plan en la preventa; `PreguntaDeLaGuia.paso`; `preguntasParaMostrar`
  usa el respaldo del plan y el filtro; la constante de 5.
- `lib/exploraciones/guia-pedido.ts`: el contexto con lo que ya sabemos y el paso de cada pregunta; el prompt de la venta.
- `lib/exploraciones/esquemas.ts`: `paso` opcional en la pregunta guardada (sin SQL: vive en el Json).
- `lib/exploraciones/agente.ts`: `armarGuia` le pasa los tests al contexto.
- `components/exploraciones/AntesDeLaSesion.tsx`, `piezas-de-la-sesion.tsx`, `DespuesDeLaSesion.tsx`: «Lo que ya
  sabemos», de qué parte cada pregunta y el cierre.
- `scripts/medir-guia-de-preventa.ts`: rearma en simulacro la guía de Larce y de otras preventas con test (sin Wherex),
  llama a Claude contra el presupuesto humano y deja el antes y el después en `backups/<fecha>-preventa-guia/`. No escribe.
- `docs/DECISIONS.md` (sección nueva) y el recorrido de la preventa.

## Pruebas

- `lo-que-ya-sabemos.test.ts`: Larce da 3 a 5 líneas con las palabras del test y de la nota, cada una con su fuente;
  nunca presupuesto, quién decide ni objeciones; nunca una nota del vendedor (N0); sin nada, ninguna línea.
- `plan-de-la-guia.test.ts`: en Larce, 1.7 va en impacto, no en situación; con tiempos confirmados no hay pregunta de
  tiempos; nunca más de 5; el presupuesto al final; sin test, dos de retos; lo llevado va primero y cuenta;
  `repiteLoSabido` descarta «¿Qué pasa en el equipo cuando un negocio deja de avanzar…?» y deja «¿cuánto les ha
  costado?»; el cierre nombra lo que falta para proponer.
- Las de `guia.test.ts` y `marco.test.ts` se ajustan a lo nuevo. tsc en 0 y eslint limpio en lo tocado.

## Qué no se toca

- El marco de Customer Success (la exploración de un proyecto) sigue con su foco de siempre: tarjetas de la estrategia,
  dimensiones y lo vendido.
- La escala, sus niveles y la regla «sin una pista del cliente no hay nivel».
- Las guías por sesión, «Lo que traes de las sesiones anteriores», las objeciones, los retos de la industria.
- Ningún SQL ni guía nueva guardada en la base: Elías la rearma desde la pantalla.
- Los correos y el timeline de HubSpot como fuente (iniciativa B, otra sesión). Cuando entren a la memoria, «Lo que ya
  sabemos» los suma como una fuente más.
