# La guía de la preventa, segunda vuelta — plan

Validaciones 69, 71 y 73 del roadmap. Elías validó el 18 oct la guía nueva (docs/preventa-guia-plan.md) con Distribuidora
Larce y pidió cinco cosas. Marco la usa el lunes 20.

## Lo que se vio (Larce, `cmvbcuvcs016706t1xcny5pss`)

- Cada pregunta abre con la cita del cliente: «En el diagnóstico dijeron: «…». ¿Cuánto les ha costado…?». Pasa también
  después de «Volver a armarla»: lo piden el prompt de la venta («nombra ESO con sus palabras», y el ejemplo «Dijiste que
  los deals que se enfrían mueren… ¿Cuántos…?») y la pregunta de respaldo (`preguntaDeRespaldo`).
- No hay cómo cambiar UNA pregunta: «Volver a armarla» rehace la guía entera (unos US$0,06–0,10 y un minuto).
- No hay cómo sumar una pregunta propia ni pedir «más de presupuesto» o «profundiza en sistemas».
- Qué cubre la guía está lejos de ella: en el panel derecho («Para proponer», en azul).

## Qué cambia

1. **Preguntas cortas, con su fuente en un ⓘ.**
   - El prompt de la venta pide la pregunta sola (25 palabras como mucho), sin repetir lo que dijo el cliente ni decir de
     dónde sale; los ejemplos «bien» pasan a ser preguntas sin cita.
   - `preguntaDeRespaldo` deja de anteponer la cita: devuelve solo la pregunta del paso.
   - `sinCitaAdelante` (puro) saca del principio de una pregunta guardada la cita y su «En el diagnóstico dijeron…»,
     «Dijiste que…» (las guías ya armadas). Corre al mostrar.
   - Cada pregunta con `motivo` lleva un ⓘ (el `title` que pinta la capa de Tooltip) con lo que dijo el cliente, con sus
     palabras, y de dónde sale. «Lo que ya sabemos» no cambia: ahí siguen las palabras del cliente.
2. **«Regenerar» por pregunta.** Cambia SOLO esa por otra del mismo tema y el mismo paso.
   - `POST /api/sales/exploraciones/[id]/guia/pregunta` `{ clave }` (la próxima sesión; guarda de escritura de la
     exploración).
   - El contexto es el mismo de la guía (se extrae de `armarLaGuiaSinGuardar` a una función compartida). El pedido es
     corto (`pedidoDeUnaPregunta`, Haiku 4.5, una herramienta `escribir_pregunta`), con lo que ya sabemos, el paso, la
     pregunta de hoy (para no repetirla) y las otras de la guía (para no pisarlas).
   - Las mismas reglas: tuteo (si sale en voseo, otra vez con aviso), `repiteLoSabido` (si repite, otra vez), sin cita.
   - Medido: `LlmCall` con el agente de la exploración y `origen = exploraciones/guia:regenerar-pregunta`.
   - Lo nuevo queda como un ajuste de la sesión (punto 3), con la marca «regenerada».
3. **Lo que decide el vendedor sobre la guía de una sesión queda en la sesión** (`SesionPlaneada.ajustesDeLaGuia`, en
   `contenido`, la mitad de las personas; sin SQL):
   - `propias`: preguntas agregadas a mano o con el asistente (texto, repreguntas, tema opcional, origen «tuya» o
     «asistente»). Hasta 8.
   - `cambios`: una pregunta de la guía reescrita (a mano, regenerada o por el asistente), por su clave (`para:paso`).
   - `quitadas`: preguntas de la guía que se sacaron.
   - Al estar en `contenido`, sobreviven a «Actualizar la guía» (el agente escribe solo `propuesta`). Una pregunta
     cambiada se puede devolver a la de la guía.
   - Una operación nueva, `ajustarGuia` (`contenido.ts`, con su zod en `esquemas.ts`), con la versión y el bloqueo de
     siempre. Si la próxima todavía no es sesión («nueva»), el cambio la crea, como el objetivo.
   - `aplicarAjustes` (puro): las preguntas de la guía → las que se ven (cambios aplicados, quitadas fuera, propias al
     final con la etiqueta «Tuya» o «Del asistente»). `useGuiaDeLaSesion` la usa: la pantalla, el panel, «En vivo» y el
     agente leen las mismas preguntas.
4. **«Mejorar con el asistente»** junto a «La guía»: el chat de Nexus de la cuenta (lib/nexus-chat), no un chat nuevo.
   - Cuatro operaciones en la capa (lib/operaciones/guia-server.ts): `guia.pregunta.agregar`, `guia.pregunta.cambiar`,
     `guia.pregunta.quitar`, `guia.repregunta.cambiar`, más la lectura `guia.leer` (las preguntas con su clave, lo que ya
     sabemos, la escala de las áreas en juego, lo que falta para proponer). Todas escriben con `ajustarGuia`.
   - Se acotan por la exploración (`COMO_SE_ACOTA` = «exploracion»): la exploración tiene que ser de la cuenta del hilo.
     Escribir pide `preventa.write` (preventa) o `exploracion.generate` (un proyecto), como la pantalla.
   - Validan tuteo y largo al preparar: lo que no cumple vuelve al modelo con su motivo.
   - El botón abre el cajón del chat de la cuenta (en la preventa se monta; en la ficha ya está) con la guía «en foco»:
     cada mensaje lleva `foco` (exploración y sesión) y el turno suma al mensaje el bloque de la guía (no al `system`:
     no rompe la caché).
   - El prompt de Nexus suma cómo ajustar una guía (las reglas de la preventa: no repreguntar lo sabido, tuteo, sin
     licencias ni precios, nada interno como dicho por el cliente).
   - Lo que propone queda en la lista y se aplica con un clic (aplicar de siempre). Al aplicar, la guía se recarga.
   - Medido: el `AgentRun` del turno (`nexus-chat`) con su costo.
5. **«Lo que cubre la guía»**, arriba de «Retos de su industria»: los siete puntos para proponer (verde listo, azul lo
   cubre la guía, punteado no) y las dimensiones que pregunta (con dónde parece estar).
   - `queCubreLaGuia(preguntas, puntos, escala, posiciones)` (puro, con prueba). Se recalcula con las preguntas ajustadas:
     cambia al instante con el asistente, «Regenerar» o una pregunta propia.
   - En el panel derecho, «Para proponer» queda en lo mínimo: los siete trazos verdes y «N de 7 listos».

## Archivos

- Nuevos: `lib/exploraciones/ajustes-de-la-guia.ts` (+ prueba), `lib/exploraciones/que-cubre-la-guia.ts` (+ prueba),
  `lib/exploraciones/guia-pregunta-pedido.ts` (+ prueba), `lib/exploraciones/guia-ajustes-server.ts`,
  `lib/operaciones/guia-server.ts`, `app/api/sales/exploraciones/[id]/guia/pregunta/route.ts`,
  `components/exploraciones/PreguntaDeLaGuia.tsx` (la pregunta con su ⓘ y su menú), `LoQueCubreLaGuia.tsx`,
  `AgregarPregunta.tsx`, `scripts/medir-regenerar-pregunta.ts`.
- Tocados: `guia.ts` (tipos), `plan-de-la-guia.ts` (respaldo sin cita), `guia-pedido.ts` (prompt), `esquemas.ts`,
  `contenido.ts`, `agente.ts` (contexto compartido), `piezas-de-la-sesion.tsx`, `AntesDeLaSesion.tsx`,
  `PanelDeContexto.tsx`, `DuranteLaSesion.tsx` (propias), lib/nexus-chat (alcance, prompt, turno, ruta),
  `ChatDeNexus.tsx` (abrir con foco, sin «Sugerencias» en la preventa), `lib/operaciones/registro-server.ts`, el recorrido
  de la preventa, `docs/DECISIONS.md`.

## Pruebas

- `ajustes-de-la-guia.test.ts`: una pregunta cambiada reemplaza la de la guía; una quitada no se ve; las propias van al
  final con su etiqueta; sobreviven a otra guía (otro `propuesta`); los topes; `sinCitaAdelante` saca las formas viejas.
- `que-cubre-la-guia.test.ts`: con Larce, la guía cubre «qué frena» (hay dimensiones) y «qué pasa si no actúa» (hay
  impacto); una propia de presupuesto cubre el presupuesto; quitar la de la meta la deja de cubrir.
- `guia-pregunta-pedido.test.ts`: el pedido lleva el paso, lo sabido y la pregunta de hoy; la lectura descarta lo vacío
  y lo que repite.
- Las de `plan-de-la-guia`, `guia`, `operaciones` y `nexus-chat` se ajustan. tsc en 0, eslint limpio.

## Qué no se toca

- El marco de Customer Success (sus preguntas siguen como están, salvo que también aceptan ajustes y la ⓘ).
- El plan (qué temas y en qué paso) ni «Lo que ya sabemos».
- La escala, sus niveles y la regla «sin una pista del cliente no hay nivel»: el asistente no confirma niveles.
- Ningún SQL ni dato guardado: todo vive en los Json de la exploración.
