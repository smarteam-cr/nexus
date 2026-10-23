# La preventa por área — plan

Feedback de Ventas (Marco Salas y Andrés Pinzón) que Elías lleva a la reunión del 23 oct. Cinco pedidos: las preguntas se
usan a medias (redundancias, no siguen la conversación, no caben en una hora), el panel de la derecha «todo en verde» no
dice la verdad, falta diagnosticar por área (cada sesión con un equipo del cliente), faltan preguntas técnicas y de
proceso, y la profundidad del ejemplo de CEMACO.

## Lo que se vio (producción, solo lectura, 2026-10-23)

### Cicadex (preventa, `cmuwqse98000s07qd72nmh5ys`, cliente que compra una fase nueva)

- La reunión del 8 oct («Revisión de Diagnóstico de Rendimiento») acordó **sesiones de 30 minutos por área, con gerentes
  de marca, y un seguimiento con Lucía**. El 9 oct Andrés pegó en «Contexto adicional» la nota «Como debemos llevar las
  sesiones con los departamentos»: una estructura de 60 minutos (contexto 0–5, objetivos del área 5–15, proceso 15–35,
  dolor e impacto 35–50, futuro 50–55, validación 55–60), cinco lentes (**proceso → personas → tecnología → datos →
  métricas**) y un banco de preguntas por área: Marketing, Servicio al cliente (SAC), gerentes de marca (ventas), Lucía
  (dirección) y Jeremy (tecnología: dónde vive cada dato, qué se integra, qué identificador usan).
- Nexus no tenía dónde poner eso: la única sesión planeada (sin fecha) tiene la guía del 21 oct con 5 preguntas de la
  empresa entera (1.6 y 1.3 en impacto, la meta, quién firma y el presupuesto). Ninguna es de un área.
- La tarjeta **Tiempos** está en verde con «No determinado por el momento, primero haremos un diagnóstico completo» y
  «Sin fecha límite explícita…»: el panel y «Para proponer» la cuentan como lista. **Quién decide** está en verde con dos
  personas que «influyen» y una con «Rol en la decisión no confirmado».
- 16 niveles, 19 «no explorado» y 6 casos de uso esperan revisión: el panel no los muestra en las tarjetas que ya están en
  verde (el ícono de sugerencia solo aparece en una vacía).

### CEMACO (exploración del proyecto «Cemaco Internacional - CRM», `cmuyrw34e0000k4ijpbd5ixv5`, CS)

- Cinco sesiones, cada una con un equipo distinto: 6 oct comercial (Sales Hub), 8 oct tecnología y datos (Data Hub: ERP
  NAF, cédula como identificador, duplicados), 13 oct operaciones (entregas a domicilio, anticipos, devoluciones), 19 y 20
  oct marketing (Noel, cinco agencias, pauta de US$2.000 por marca, Mailchimp, 400.000 registros).
- La exploración tiene en juego **solo el área 1 (Ventas)**. Todo lo de marketing quedó atado a dimensiones de Ventas:
  «No existe una métrica exacta que ligue las acciones de marketing a resultados de venta» → 1.2; la base de 400.000
  correos → 1.3. Marketing (área 2) no tiene ninguna dimensión con evidencia.
- La guía armada para la sesión de marketing del 20 oct (objetivo de Liliana: «cómo va a operar el equipo de Marketing»)
  pregunta por las comisiones de los asesores (1.4) y por un lead de alto valor que el asesor no reconoce (1.6). Liliana
  quitó 9 preguntas y sumó 4 con el asistente.
- Retos (16), resultados (11) y obstáculos (10) están en verde desde el 6 oct: el panel dice «3 de 3» y no dice que de
  marketing no se sabe cómo la miden (Marco le preguntó a la líder de marketing y no supo responder).
- La lectura del 20 oct marcó respondidas 1.2, 1.3 y 1.6 (impacto), pero ninguna sesión las marcó «hecha»: la próxima
  guía las volvería a preguntar en impacto (`pasosYaPreguntados` solo mira lo marcado a mano).

### Lo que ya está vivo (no se toca)

Plan por pasos y «Lo que ya sabemos» (18 oct), preguntas cortas con ⓘ, «Regenerar», preguntas propias, el asistente y
«Lo que cubre la guía» (18 oct), la guía del proyecto con el plan (19 oct), la historia de las sesiones (20 oct), las
preguntas para el objetivo y el orden arrastrado (20 oct). La regla «sin una pista del cliente no hay nivel» sigue.

## Lo que falta, por pedido

1. **Preguntas a medias.** (a) El orden de la guía mezcla «qué entra» con «en qué orden se pregunta»: abre con el costo de
   un dolor («¿Cuántas horas…?») antes de la meta, y la meta va tercera. (b) Lo respondido en una sesión anterior, según
   la lectura, se vuelve a preguntar. (c) La sesión dice 45 minutos y no tiene un momento para hablarle al cliente. (d)
   Los retos de su industria suman tres preguntas más, siempre abiertas, también en una sesión de un área.
2. **El panel.** Verde = «tiene texto». No distingue lo que dice «no se sabe», ni una meta sin cifra, ni quién decide sin
   quien aprueba; y esconde lo nuevo que trajo una sesión en una tarjeta ya verde.
3. **Por área.** Una sesión no sabe con qué equipo del cliente es; la guía y la escala son de la empresa entera.
4. **Técnico y de proceso.** El plan pregunta metas, dolores, tiempos, quién firma y presupuesto: nada de sistemas, datos,
   campos o integraciones.
5. **La profundidad de CEMACO.** Cómo está armado el departamento, roles, canales, qué duele en cada canal, metas y cómo
   las miden: no está en ninguna pregunta de base.

## Decisiones

- **El equipo del cliente vive en la sesión** (`SesionPlaneada.equipo`, en el Json `contenido`): **sin SQL**. La preventa y
  la exploración de un proyecto (la entrega de servicio de Customer Success) son el mismo lienzo y las mismas sesiones.
  El equipo se elige antes de la reunión, cuando todavía no hay fila de Meet: por eso no va en `FirefliesSession`. Una
  reunión de implementación que no es sesión de una exploración no se diagnostica y no necesita equipo; si un día lo
  necesita, es una columna aparte (queda anotado en DECISIONS).
- **Seis equipos fijos** (`lib/exploraciones/equipos.ts`): Dirección, Ventas, Marketing, Servicio al cliente, Operaciones y
  Tecnología. Ventas, Marketing y Servicio son las áreas 1, 2 y 3 de la escala; los otros tres no tienen área. Elegir uno
  con área que no está en juego la suma a las áreas en juego en el mismo cambio (así la escala de ese equipo recibe
  evidencia).
- **Nexus sugiere el equipo** por el título y el objetivo de la sesión (palabras: «marketing», «pauta», «SAC», «Data Hub»,
  «ERP», «gerencia»…). Se confirma con un clic; nunca se guarda solo.
- **La guía de una sesión con equipo es la del equipo**: unas 5 preguntas en el orden de la nota de Andrés y de la
  estructura de Marco — cómo está armado el equipo, qué persigue y cómo lo miden, cómo funciona (canal por canal en
  Marketing, de punta a punta en los demás), con qué sistemas y datos (fuentes, campos, integraciones), cuánto cuesta lo
  que duele (las dimensiones del área del equipo con lo que ya dijo el cliente) y cómo sería si funcionara. Sin quién
  firma ni presupuesto, salvo con Dirección. Lo que ya respondió ese equipo en una sesión anterior no se vuelve a preguntar.
- **Los temas del equipo** son `<equipo>.<lente>` (`marketing.medicion`): caben en el mismo campo `para` que las tarjetas y
  las dimensiones, así «En vivo», la lectura de la reunión (cobertura), los ajustes, el asistente y «Lo que cubre la guía»
  los llevan sin otra estructura.
- **Una sesión sin equipo** sigue con el plan de la empresa, con tres cambios: se ordena como una conversación (la meta
  primero; después cómo pasa, cuánto cuesta, cómo lo resolvería, para cuándo y con qué); lo que una lectura marcó
  respondido cuenta como preguntado; y si la conversación se puso técnica o hay integraciones, entra una pregunta de
  sistemas y datos.
- **Una hora con tiempo para hablarle**: Abrir 0–5 · Preguntar 5–40 · Contarle 40–50 (lo que ves de su operación, sin
  demo) · Cerrar 50–60. Los retos de su industria quedan plegados y no salen en una sesión con equipo.
- **El panel dice la verdad**: cada tarjeta en verde (completa), ámbar (a medias: dice que no se sabe, una meta sin cifra,
  quién decide sin quien aprueba), azul (sugerida) o punteada (falta), con un punto cuando una sesión trajo algo nuevo para
  una tarjeta ya verde. «Para proponer» deja de contar «no se sabe» como listo. Y un bloque «Por equipo»: cada equipo con
  sus sesiones y qué de sus temas ya se respondió.

## Etapas

1. **El equipo en la sesión.** `equipos.ts` (catálogo, sugerencia, temas), `SesionPlaneada.equipo` + zod, el selector en
   la Preparación (con la sugerencia), el chip en la pestaña de la sesión, y el área en juego. Pruebas: `equipos.test.ts`.
2. **La guía del equipo.** El plan (`planDeLaGuia` con `equipo`), el pedido al agente (los temas del equipo, el área, la
   regla técnica y de proceso), la lectura de lo que devuelve, cómo se muestra (tipo `equipo`, su columna en «Por
   sección» y su filtro en «En vivo»), la guía vieja si cambió el equipo, y la cobertura de la lectura. Pruebas en
   `plan-de-la-guia.test.ts` y `guia-del-equipo.test.ts`.
3. **Una hora de conversación.** Orden de la conversación, lo respondido según la lectura, la pregunta de sistemas en la
   empresa, los tramos de 60 minutos con «Contarle», los retos de la industria plegados. Pruebas en los mismos archivos.
4. **El panel que dice la verdad.** `estadoDeLaTarjeta`, «Para proponer» sin «no se sabe», el punto de lo nuevo, el bloque
   «Por equipo». Pruebas: `estado-de-las-tarjetas.test.ts`, `guion-y-calidad.test.ts`.
5. **Medir y cerrar.** `scripts/ver-guia-por-equipo.ts` (en seco, sin IA, sin escribir) con Cicadex y CEMACO; DECISIONS;
   tsc, eslint, tests, build.

## Lo que no entra

- Un equipo en reuniones que no son sesiones de una exploración (columna en `FirefliesSession`): no hace falta para
  diagnosticar; anotado como siguiente paso.
- Que el diagnóstico (el documento) se arme por área: es de la otra sesión. Lo que deja esta: cada sesión sabe su equipo
  y sus temas respondidos, y el área del equipo queda en juego con su evidencia.
- Que el agente que lee la reunión ate cada reto a su equipo: con el área en juego, sus dimensiones ya quedan bien.
