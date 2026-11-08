# La North Star de Nexus

El objetivo de Nexus, los resultados que necesita Elías y los hilos abiertos. Lo decide Elías. Lo cuida el socio de
producto (skill `socio`): lo lee antes de cada conversación sobre qué sigue, lo contrasta con los datos y lo actualiza
cuando Elías decide algo. El roadmap (`docs/roadmap.md`) dice **qué** se construye; este archivo dice **para qué**.

**Última revisión del objetivo:** 2026-11-07 (validado con Elías) · **Próxima:** 2026-12-05, o antes si un dato
contradice un supuesto de abajo.

## El objetivo

Nexus es el sistema de trabajo de Smarteam y va a seguir creciendo: ya lleva Finanzas y Marketing. Su enfoque es que
Smarteam **venda por resultados** (casos de uso), **los entregue con Customer Success** y **sepa cuánto le cuesta cada
uno**; cada persona entra y ve qué le toca hoy.

**La prioridad de ahora** (Elías, 7 nov): que funcionen bien las **actividades, los casos de uso, las exploraciones, las
propuestas, la escala y los artefactos básicos**, para probarlos con el equipo, recibir feedback y mejorarlos. Lo que no
sirve a eso espera.

Para qué lo quieres, en tus palabras de las reuniones:

- **Que Customer Success atienda más cuentas sin contratar más gente** (Dos Pinos con Marco, 6 nov).
- **Que la propuesta se arme con casos de uso, cada uno con sus actividades**, y que esas actividades sean el plan que
  ejecuta Customer Success, con su tiempo interno (seguimiento CS + RevOps y concurso interno, 4 y 6 nov).
- **Que ninguna propuesta salga sin la exploración registrada en Nexus** y que la escala le diga al cliente dónde
  está (rol y esquema de comisiones, 5 nov).

## Los resultados que necesitas

Cada resultado con el número que lo mide. La meta la pone Elías; sin meta, el socio no puede decir si vamos bien.

| # | Resultado | Cómo se mide | Hoy (7 nov) | Meta |
|---|---|---|---|---|
| R1 | El equipo usa Nexus | Por persona, en el panel «Para ti › Uso de Nexus» (`validar-uso` en consola) | 6 de 14 del equipo operativo entran 3+ días por semana; 11 entraron esta semana | Sin número: **entender cómo lo usa cada persona** («somos pocos») |
| R2 | Lo que propone Nexus sirve | Lo propuesto que alguien usó (`uso-de-nexus`) | 2,5 % (87 de 3.444 en 30 días), decidido por 9 personas | **Proponer menos**, sin prioridad todavía (ver H6) |
| R3 | Se vende con exploración | Propuestas con exploración registrada | Sin medir | Pendiente: es parte de la prioridad de ahora |
| R4 | Customer Success rinde más | Cuentas por CSE, con las horas de las actividades | Sin medir (espera Actividades) | Pendiente |
| R5 | La IA no se dispara | Gasto de IA al mes (panel de gasto) | ≈ US$ 175 (US$ 83 en 14 días) | **Tope de US$ 300 al mes** |

## Los hilos abiertos

Un hilo es una apuesta o una pregunta en curso. Cada uno sirve a un resultado. Cuando se cierra, pasa a la bitácora.

| Hilo | Sirve a | Lo último | Lo que sigue |
|---|---|---|---|
| H2 · **La prioridad de ahora:** actividades, casos de uso, exploraciones, propuestas, escala y artefactos básicos | R3, R4 | 7 nov: producción va 74 cambios atrás de `main` (corre lo del 6 nov). Lo nuevo de exploración, artefactos y actividades espera 8 SQL y el deploy. Frentes según Elías: **(a)** revisar la preventa (exploración guiada) · **(b)** la escala · **(c)** la página de la escala y la de resultados que ve el cliente · **(d)** construir la creación de propuestas con casos de uso | 1) ✓ SQL aplicados y desplegado el 7 nov (d7ba0561) · 2) **(a) construida entera y en producción (7 nov, 04eae2d8):** los 5 puntos de Elías (Nexus propone y el vendedor valida; objetivo sugerido de la exploración y de cada sesión; el desafío se valida y va a la ficha como propuesta que confirma CS; la sesión pasada en 3 bloques; sin duplicar el Resumen). Elías la probó con Centauro (7 nov) y aprobó la vista de la sesión pasada. **Tercera vuelta en producción (8 nov, 3cbb0b66)**: objetivo de Smarteam con ajuste por empresa, Resumen con estado y hallazgos, la guía que se arma sola, y en (b) y (c) la escala como el radar del diagnóstico, «Ubicar con las reuniones» y los equipos que ve el cliente. Quinta vuelta en producción (8 nov, e6d833eb): preparación con preguntas en tarjetas y quitar la sesión con confirmación; el análisis de la sesión con lo de fuera del objetivo, la tabla de números, qué falta para decidir, pasos verificados y preguntas para el demo; La escala con áreas superpuestas, Marketing como hipótesis y tarjeta por dimensión que se lleva a la sesión; Casos de uso con la biblioteca de actividades, quitar y poner actividades, precio mínimo, argumento de valor y «Regenera para actualizar» con Deshacer. Séptima vuelta en producción (8 nov, e35abf56): el objetivo de la sesión en tres tarjetas editables más uno propio, la guía se arma al elegir y no existe antes; la guía sin «Lo que hay que averiguar» (queda en «En vivo»), con texto más grande y «Para profundizar» plegable; «Lo que aprendimos» en una línea por sugerencia y «Ya usaste» en una frase. Sexta vuelta en producción (8 nov, b0ef770a): la tarjeta del radar de La escala usa el mismo código que la página del resultado (pegada a su dimensión, con su resalte y que se deja alcanzar), las áreas elegidas se ven presionadas, las preguntas de Nexus son de su sesión y siempre traen tarjetas, «Para el demo» en la Preparación y el siguiente paso acordado con los pasos verificados de la reunión. Pendiente de Elías: si el agente de casos lee también lo hablado en las sesiones. Cuarta vuelta (530cf75f): el objetivo de la sesión es obligatorio antes de armar la guía y el feedback de la sesión vuelve a la vista. Falta que Elías la pruebe con Centauro. Lo de la segunda vuelta (ca999dab): carga visible y «Usar todas» al releer; aviso con enlace a la ficha; la preparación sin formulario (solo asociar la reunión); el error «Cuerpo inválido» al confirmar el contexto; la guía en bloques con minutos; y el contexto en tres niveles (empresa en la ficha, equipo explorado y la compra en la exploración), sin duplicarse con el Resumen · 3) Elías revisa (b) y (c) en producción · 4) Definir (d) en una línea antes de construir |
| H1 · Entender el uso por persona, sin gastar IA | R1 | Elías miró el panel «Para ti › Uso de Nexus» (7 nov): sobreingeniería, difícil de entender. Pide solo la lista de personas por equipo con barras por mes, trimestre, semestre y año: los días que entró y cuánto usó la IA (agentes) | En producción desde el 7 nov (d7ba0561). Se cierra si a Elías le sirve así |
| H8 · Que probar el trabajo de una sesión sea un paso, no un problema | Todos (es la velocidad para probar, recibir feedback y mejorar) | 7 nov: Elías vio la versión vieja del panel dos veces. El servidor corría el código de `main` y no el de la rama de la sesión, y después la copia no compilaba porque compartía dependencias con `main`. Le pasó «varias veces ya» | Una forma única de levantar la rama de una sesión en el 3004 (su carpeta, con dependencias propias), comprobada antes de decir «listo» |
| H7 · Un resumen en cada panel y gráficos estándar en Nexus | R1 | Elías (7 nov): cada panel con una pestaña de resumen con gráficos de las demás, y una forma estándar y más moderna de hacer gráficos; el diseño actual no lo convence | Esperar al rediseño de Nexus: no gastar tokens en diseño ahora |
| H6 · Que las notificaciones salgan de lo asignado | R2 | Elías (7 nov): los clientes y los proyectos (actividades) asignados a cada persona deberían generar las notificaciones, cruzando las transcripciones y la agenda | No es prioridad; se diseña después de H2 |
| H3 · Separar las cuentas de un mismo grupo (Cemaco CR, GT y EC) | R1 | Marco no logra que Nexus las separe y prepara sus reuniones fuera (5 nov) | Decidir si se separan por ficha o por el nombre de la sesión |
| H4 · El feedback sin revisar | R1 | 7 reportes sin revisar; el más viejo es del 11 oct (7 nov) | Revisarlos o cerrarlos con motivo |
| H5 · El agente dentro de Nexus (el chat general) | R1 | Costeado el 7 nov: ≈ US$ 160/mes con 3 personas | Decidir después de H1: solo si el uso lo justifica |

## Supuestos que hay que cuestionar

Lo que el plan da por cierto y los datos todavía no confirman. El socio los trae cuando aparece evidencia a favor o en
contra.

- **Que más funciones traen más uso.** Lo propuesto se usa un 2 % y el chat lo usan entre 3 y 7 personas.
- **Que el equipo prefiere Nexus a su propio Claude.** Marco prepara reuniones con su propio asistente porque «no
  tiene tiempo para configurar Nexus» (5 nov) y llevó una propuesta de Nexus a Claude para hacer un video (29 oct).
- **Que mostrarle Nexus al cliente ayuda.** Marco: mientras más se muestra Nexus en la reunión, más puede confundir
  (6 nov).

## Bitácora del objetivo

Una línea por cambio del objetivo, de un resultado o por un hilo cerrado. Nunca se borra.

- **2026-11-07** · Primer borrador, armado con el roadmap, las prioridades del 31 oct y 8 reuniones tuyas.
- **2026-11-07** · Elías validó el enfoque: «Nexus es más que eso. Lleva la parte financiera, de marketing, y va a
  evolucionar. Por ahora sí creo una prioridad que las actividades, casos de uso, exploraciones, propuestas, escala, y
  artefactos básicos funcionen bien. Para probar, obtener feedback y mejorar.» Metas: uso «entender cómo se está usando
  por persona; somos pocos»; propuestas «proponer menos, pero no es prioridad»; IA, tope de US$ 300 al mes.
- **2026-11-07** · Regla nueva para el socio, de Elías al ver el panel de uso: «tiene sobre ingeniería… es importante
  entender el objetivo antes de programar». Antes de construir, la pregunta en una línea y solo lo que la responde.
- **2026-11-07** · Elías, sobre ver la versión vieja al probar: «ha pasado varias veces ya… creo que es organización
  tuya» y «es importante para el North Star». Abre H8: probar el trabajo de una sesión no puede costar idas y vueltas.
- **2026-11-07** · Elías probó la exploración guiada en producción con Centauro (frente H2a): «hay que ponerse desde la
  perspectiva del vendedor… lo siento complicado y con sobreingeniería… la idea es que el usuario no rellene forms,
  valide o modifique sugerencias». Pide el objetivo sugerido para la exploración y para cada sesión, que el desafío
  principal viva en la empresa (Información del cliente) y que no se duplique con el Resumen. El clic en la sesión se
  arregla ya; el rediseño se define con él antes de construir.
- **2026-11-07** · Elías preguntó por ese feedback: había entendido que se implementaba entero y solo había salido el
  clic. «Si algo como eso se pasó y no me lo dijo más claro, creo que hay algo que mejorar en North Star.» Regla nueva
  para el socio: lo pedido que queda a medias se dice explícito al cerrar (qué salió, qué no y por qué) y queda escrito
  en el hilo, en «Lo que sigue», hasta que se haga o Elías lo descarte.
- **2026-11-07** · Elías aprobó el rediseño de la exploración («Sí, constrúyela») y pidió juntarlo y desplegarlo. Quedó
  entero en producción el mismo día; falta su prueba con Centauro.
- **2026-11-07** · Segunda vuelta de la exploración: Elías decidió el contexto en tres niveles (empresa, equipo explorado y
  la compra), la guía sin reunión con 60 minutos, «Usar todas» con Deshacer y la guía en bloques con minutos. En producción
  el mismo día (ca999dab).
- **2026-11-08** · Tercera vuelta de la preventa con Centauro: el objetivo es el de Smarteam, fijo («siempre tenemos que tener
  nuestra estrategia clara… ir hacia el diagnóstico, ubicación en la escala, entender el dolor»), y los hallazgos lo ajustan
  por cliente según cómo llegó; la guía se arma sola al leer la sesión anterior; la página del cliente muestra los equipos
  que se hablaron y el vendedor elige. En producción el mismo día (3cbb0b66).
- **2026-11-08** · Elías no encontraba el feedback de la sesión: el rediseño lo había plegado sin decirlo. «Esto no debería
  pasar en ninguna mejora que hagamos.» Regla nueva en CLAUDE.md: un rediseño lista cada pieza visible y su destino, y lo
  que baja de visibilidad se pregunta. El objetivo de la sesión pasa a ser obligatorio (es la instrucción del vendedor
  para la guía). En producción el mismo día (530cf75f).
- **2026-11-08** · Elías: «Termina todo, junta y haz deploy para testear.» Quinta vuelta de la preventa (preparación, análisis
  de la sesión, escala y casos de uso con precio) en producción el mismo día (e6d833eb). Falta su prueba con Centauro.
- **2026-11-08** · Elías probó la quinta vuelta: el pop-up de la escala «muy lejano», sin la animación del resultado y que no
  se deja alcanzar; las preguntas de la guía sin tarjetas. «Revisa si hay más cosas de las que mencioné que no están y
  aplícalas.» Sexta vuelta en producción el mismo día (b0ef770a); la auditoría encontró 3 a medias (siguiente paso, demo, contexto de casos).
- **2026-11-08** · Elías: «el objetivo sugerido realmente pueden ser tres objetivos sugeridos… y que la guía se arme luego de
  seleccionar eso». No estaba anotado así (se había construido uno solo). Séptima vuelta en producción el mismo día (e35abf56).
