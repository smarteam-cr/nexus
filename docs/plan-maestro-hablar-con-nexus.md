# Plan maestro: «Hablar con Nexus» como un asistente de verdad

> Pedido de Elías del 22 nov: que «Hablar con Nexus» sea tan potente como hablar con Claude Code. Que pregunte, valide y
> sugiera qué guardar; que lo guardado quede en la empresa y mejore cualquier documento; que sirva para pulir lo que ve
> el cliente («cambia el título», «agrega esta parte, que es crítica»); que «Mejorar con IA» sea Nexus abierto donde
> hiciste clic; y que lo que cambias en algo que ve el cliente vuelva a lo que se sabe de la empresa.
>
> **Estado (23 nov):** la etapa 0 está en producción (a4e69a80). **Las etapas 2 y 5 esperan** al piloto de dos semanas
> del conector de Claude (`docs/plan-conector-claude.md`, §0.2): con el conector, la conversación la pondría Claude, que
> lee y escribe en Nexus, y el cajón de conversar en cada pantalla podría sobrar. Se avanza con las etapas 1, 3 y 4, que
> sirven con o sin conector. La etapa 3 dependía del cajón de la etapa 2: Elías aprobó su versión sin cajón el 23 nov
> (en la etapa 3). Tus 5 respuestas del 22 nov siguen en la sección 6 (y en DECISIONS, «Hablar
> con Nexus, el plan maestro»).

## En una frase

Hoy hay **seis formas distintas de hablarle a la IA** en Nexus, cada una con su motor, su memoria y sus reglas, y lo que
le cuentas a «Hablar con Nexus» **no llega** a los documentos del cliente. El plan las junta en **una sola puerta,
«Nexus»**, que sabe dónde estás y hace tres cosas, cada una con su deshacer: **guardar en lo que sabe de la empresa**
(con tu clic), **mejorar el documento donde estás** (con tu clic) y **llevar a lo que sabe de la empresa los datos que
cambias en lo que ve el cliente** (solo, con aviso y «Deshacer»). Se construye en 7 etapas; las 3 primeras ya sirven solas y caben en la prioridad de ahora (exploraciones,
La escala y casos de uso).

---

## 1. Lo que pediste

1. Nexus pregunta, valida y sugiere qué guardar. Lo guardado queda en la empresa y sirve para mejorar cualquier documento,
   la página de La escala y la página de resultados.
2. Que sirva para **mejorar documentos**: en la página de resultados, «cambia el título a algo así», «agrega esta parte».
3. «Mejorar con IA» se vuelve «Hablar con Nexus» abierto **sobre lo que tocaste**: Nexus entiende qué documento es.
4. Todo cambio a algo que verá el cliente **sugiere** cambios en lo que se sabe de la empresa, «casi fijo», porque es
   más cierto.
5. Como en Claude Code: «guarda esto en la memoria» y lo usa después; «mejora este documento que ya hicimos».
6. Lo que se sabe de la empresa llega a **casos de uso** (con sus actividades) y a **propuestas** (estas, después de
   optimizarlas; casos de uso ya se puede).
7. Revisar lo que quedó a medias y sumarlo.

---

## 2. Lo que existe hoy

### 2.1 Las seis puertas a la IA

| # | Cómo se llama en la pantalla | Dónde se ve | Qué hace | Dónde deja lo que hace | Qué le falta |
|---|---|---|---|---|---|
| 1 | **«Hablar con Nexus»** (21 nov) | Arriba del riel de la preventa, en todas sus piezas | Escuchas o dictas; Nexus pregunta (2 rondas como mucho), propone la nota con tus palabras, los hechos y cambios a las tarjetas; responde preguntas de la cuenta leyendo sus reuniones, con citas verificadas | La nota en «Lo que sabes del cliente» de **esa preventa**; los hechos bajo la nota; los cambios en las tarjetas del Resumen; la conversación en sus corridas (lib/chat-de-nexus, lib/exploraciones/nexus-en-la-preventa*) | No existe fuera de la preventa; lo guardado no llega a los documentos (ver 2.2); no mejora documentos |
| 2 | **«Nexus»** (botón arriba a la derecha, 17 oct) | La ficha del cliente y la preventa | Chat de la cuenta con herramientas: lee la memoria, reuniones, negocios, personas y correos; propone tareas, notas de la cuenta, el siguiente paso, generar un documento y cambios a la guía; una lista que se aplica con un clic | Tareas, notas de la cuenta (que van también a HubSpot), siguiente paso (lib/nexus-chat, lib/operaciones) | No sabe en qué pantalla estás; no conversa como «Hablar con Nexus»; sus notas no son las de «Lo que sabes del cliente» |
| 3 | **«Agregar algo que sabes»** (27 oct) | Preparación de la preventa | Escribes una nota a mano | Igual que la 1, sin preguntas ni hechos (lib/exploraciones/lo-que-sabes.ts) | Es la misma memoria que la 1 por otra puerta |
| 4 | **«✨ Mejorar con IA»** | Kickoff, Diagnóstico, Planificación, Desarrollo, Entrega, Implementación, artefactos, documentos de la empresa, propuesta comercial, perfiles de puesto; y un «Mejorar con IA» propio en las actividades de un caso de uso | Una instrucción, una llamada, una propuesta por sección que revisas y aplicas; busca en la web si hace falta | En el documento, por el editor de siempre (lib/ai/assist.ts; casos de uso: lib/exploraciones/mejorar-actividades.ts) | No conversa ni recuerda; no lee «Lo que sabes del cliente»; lo que cambias no vuelve a la memoria; **La escala no lo tiene** (solo «Rehacer con IA») |
| 5 | **El chat del documento** (cajón al costado, ago–oct) | Documentos del proyecto, propuesta comercial, perfiles de puesto, cronograma | Conversas sobre el documento con la sección marcada («chip»); cuando hay acuerdo, manda la instrucción al «Mejorar con IA» del documento, que aplica | En el documento, por el editor (lib/asistente) | Es lo más parecido a lo que pides, pero vive solo en el proyecto y no guarda nada en la empresa |
| 6 | **Chats de tareas y de la guía** | Tareas; la guía de la sesión | Proponen cambios a tareas o a preguntas de la guía | Tareas, guía (lib/tareas, lib/operaciones/guia-server.ts) | Fuera de este plan, salvo que usan el mismo registro de operaciones que la 2 |

**En la misma pantalla de la preventa conviven tres puertas**: «Nexus» arriba a la derecha (la 2), «Hablar con Nexus»
en el riel (la 1) y «Agregar algo que sabes» en Preparación (la 3). Dos de ellas guardan notas en lugares distintos.
Esa es la confusión que viste.

### 2.2 Dónde vive hoy «lo que se sabe de la empresa»

Está repartido en siete lugares, y los que escribe «Hablar con Nexus» no son los que leen los documentos.

| Lugar | De quién es | Quién lo escribe | Quién lo lee |
|---|---|---|---|
| **«Lo que sabes del cliente»** (notas con autor y fecha, 30 como mucho) | De **una preventa**, no de la empresa | «Hablar con Nexus» y «Agregar algo que sabes» | La guía, el agente de la preventa, el Resumen de La escala (pesa más que una reunión), el agente de impacto y «Hablar con Nexus». **No** lo leen: la memoria de la cuenta, el handoff, el kickoff, el diagnóstico, la propuesta comercial, el chat «Nexus» de la cuenta. Los casos de uso lo leen solo para saber qué HubSpot tienen |
| **Los hechos de cada nota** | De la preventa | «Hablar con Nexus», al guardar | Solo la pantalla, debajo de la nota. **Ningún agente** |
| **Las tarjetas de la preventa** (Metas, Planes, Retos, Tiempos, Negocio, Embudo, Quién decide, objeciones…) | De la preventa | El agente (sugiere), la persona, «Aplicar» de Nexus | Las que puede ver el cliente llegan a casos de uso y a la propuesta; el resto al handoff y a la memoria interna |
| **La ficha de la empresa** («Información del cliente», con quién manda en cada dato) | De la empresa | HubSpot, la investigación, la preventa como propuesta que confirma Customer Success | La memoria de la cuenta → todos los documentos |
| **Las notas de la cuenta** | De la empresa (y van a HubSpot) | El chat «Nexus» de la cuenta, notas a mano | La memoria de la cuenta |
| **Los hechos de las reuniones** | De la empresa (o del proyecto) | La lectura única de cada reunión | La memoria de la cuenta (los usados y los pendientes rotulados) |
| **Lo presentado y lo aceptado** de La escala | De la preventa | «¿Cuándo se la presentaste?» y la respuesta del cliente | El agente de impacto y el handoff |

El cimiento ya existe y es bueno: **un solo cargador de memoria** con tres alcances (para el cliente, sin lo interno,
interno) y un registro de quién lo lee (lib/memoria); **una escalera de peso** (aceptado por el cliente > presentado y no
corregido > confirmado por el equipo > dicho en una reunión > deducido por Nexus; lib/impacto/escalera.ts); **una tabla de
hechos** con su autor, su cita, su huella para no repetirse y «este reemplaza a aquel» (`HechoDeReunion`); y **un ciclo de
vida de lo propuesto** que mide qué se usa (lib/lo-propuesto). Lo que falta es que lo contado a Nexus entre a ese cimiento.

### 2.3 El agente de impacto y su cuenta regresiva

Al guardar una nota, una llamada corta (Haiku) decide si cambia la página de La escala y por qué. Si la cambia: «La
regenero como borrador en 10 s · Cancelar». Nunca publica. Si contradice lo que aceptó el cliente, lo dice primero
(lib/impacto, lib/exploraciones/impacto-en-la-escala*).

- Está escrito para enchufarse a cualquier documento, pero **solo está enchufado a La escala**.
- Rehace el Resumen entero (unos 3 minutos). Para un documento largo, rehacer entero es caro y pisa más de lo que
  la nota cambia.
- No se midió con notas reales si acierta.

### 2.4 «Mejorar con IA»

Un diálogo de una sola vuelta: instrucción → propuesta por sección → revisar en el marco de propuestas de la IA →
aplicar por sección (lib/ai/assist.ts, components/ai/DocumentAssist.tsx). Bien hecho en lo que importa: **no escribe**,
aplica por el editor de siempre, respeta las secciones que la IA no puede tocar y pide el permiso de regenerar.

- No conversa: si la propuesta no era lo que querías, empiezas de nuevo.
- No lee «Lo que sabes del cliente».
- Lo que aplicas queda como «Editado» en el historial solo cuando algo lo reemplaza después; no hay una versión
  «Cambiado con Nexus» con el antes y el después.
- La escala (el Resumen y la página de cada área) no lo tiene; los casos de uso tienen uno propio.
- El chat del documento (puerta 5) ya sabe abrirse sobre una sección y mandarle la instrucción: **es el puente que se
  reusa**, no hay que inventarlo.

### 2.5 El historial de versiones (21 nov)

Un mismo popup para el Resumen de La escala, los documentos del proyecto y la propuesta comercial: cómo nació cada
versión (rehecho con IA, editado, publicado, vuelta a una anterior), cuál es la actual, cuál ve el cliente, y «Usar esta
versión», que nunca publica (lib/versiones, `VersionDeDocumento`).

- El cronograma se puede mirar pero no volver a una versión.
- Las tarjetas de la preventa, los casos de uso y los textos de la página de cada área de La escala no están en el
  historial (por confirmar los textos del área al construir la etapa 3).
- No existe el tipo «Cambiado con Nexus».

### 2.6 Casos de uso y actividades

Sugerir → aceptar → personalizar (un agente adapta las actividades a la empresa) → «Mejorar con IA» de las actividades.
El agente que sugiere lee lo que puede ver el cliente de la preventa y, para el argumento de valor, lo que dijo cada
reunión, los hallazgos y las respuestas del vendedor (lib/exploraciones/casos-de-uso.ts, personalizar-caso.ts).

- **No lee las notas del equipo** («Lo que sabes del cliente») ni lo que aceptó el cliente en La escala.
- Lo que el equipo corrige en un caso no vuelve a lo que se sabe de la empresa.

### 2.7 Propuestas

La propuesta comercial lee la preventa sin lo interno y la memoria de la cuenta con el alcance del cliente; tiene
«Mejorar con IA», el chat del documento y su historial por «Propuesta N». Dijiste que todavía hay que optimizarlas: en
este plan solo se conectan al final, cuando estén.

### 2.8 La escala y la página de resultados

La página de La escala que ve el cliente (el Resumen y la página de cada área) **se edita entera en su lugar**, se
**publica** como una foto, tiene «Acceso», y registra cuándo se presentó y qué aceptó el cliente. Tiene «Rehacer con IA»
pero no «Mejorar con IA». La página del resultado del test público la escribe Haiku sola al terminar el test y no se
edita: queda fuera de este plan (ver 3.12).

### 2.9 Lo que quedó a medias (tu punto 7)

| # | Qué quedó a medias | Dónde entra |
|---|---|---|
| 1 | ✓ **Hecho (22 nov):** los dos SQL del 21 nov (hechos de una nota, historial de versiones) se aplicaron, y «Hablar con Nexus» y el historial están en producción (3deb62b0) | — |
| 2 | Los hechos de una nota que editas o quitas no se rehacen ni se retiran: bajo una nota editada se ven hechos que dicen otra cosa | Etapa 0 |
| 3 | Un «gracias» u «ok» propone guardar; después de guardar, la conversación termina | Etapa 0 |
| 4 | ✓ **Hecho (22 nov):** las dos notas «resumelos» de Cemaco · Ecuador se borraron | — |
| 5 | Los hechos de las notas no los lee ningún agente | Etapa 1 |
| 6 | Lo que cuentas a Nexus no llega a la memoria de la cuenta ni a casos de uso | Etapa 1 |
| 7 | El agente de impacto solo mira La escala | Etapa 5 |
| 8 | «Hablar con Nexus» solo existe en la preventa | Etapas 2 y 5 |
| 9 | «Agregar contexto» (un solo lugar para lo que sabe el equipo; los 8 lugares de notas se migran de a uno), en el roadmap como «por hacer» | Etapas 2 y 5 |
| 10 | El cronograma no puede volver a una versión | Fuera de este plan (sigue en el historial) |
| 11 | «Que Nexus aprenda de cada corrección», esperando tu aprobación en otro chat | Etapa 7 |
| 12 | No se midió si Sonnet pregunta bien ni si Haiku acierta el impacto | Medición de cada etapa |

---

## 3. Los vacíos de la idea

Cada vacío con lo que pasa hoy y lo que propone el plan. Los que solo tú puedes decidir van como pregunta al final.

### 3.1 Cómo sabe Nexus en qué documento está

**Hoy:** «Hablar con Nexus» sabe que está en una preventa; el chat del documento sabe la sección por un chip; «Mejorar
con IA» sabe el documento por la ruta.

**Propuesta:** «el lugar» es un dato que manda la pantalla y **verifica el servidor**: la empresa, la preventa o el
proyecto, el documento y, si aplica, la sección. Se ve como un chip sobre el cuadro de escribir («Página de La escala ›
Titular»), que puedes quitar. El servidor comprueba que ese documento es de esa empresa antes de leerlo; el modelo nunca
elige la empresa (la regla del chat de la cuenta, que ya funciona). Si escribes desde un lugar y hablas de otro
documento, Nexus pregunta a cuál te refieres; no adivina.

### 3.2 Quién confirma un cambio

**Hoy:** nada se guarda sin un clic (21 nov) y nada se publica solo (16 nov). Bien.

**Decidido (22 nov):** guardar en la memoria desde la conversación, tu clic en «Guardar» (como hoy). Mejorar el
documento, tu clic en «Aplicar» por sección. **Lo que vuelve a la memoria desde lo que ve el cliente se guarda solo**,
con un aviso y «Deshacer»: es la única excepción a «nada se guarda sin tu clic» del 21 nov, y vale solo al aplicar un
cambio de Nexus o al publicar o presentar ese documento (el cambio ya lo hizo una persona sobre algo que va al cliente,
y eso es lo más cierto que hay). **Publicar sigue siendo siempre una persona.** Lo que confirma una persona queda con su nombre, día y hora (tu
respuesta del 20 nov: lo que dice el usuario de Nexus manda).

### 3.3 Cómo se deshace

| Qué se hizo | Cómo se deshace |
|---|---|
| Un cambio a un documento hecho por Nexus | «Deshacer» al lado del aviso, y en el historial queda una versión «Cambiado con Nexus» con el antes |
| Un dato que se guardó solo desde lo que ve el cliente | «Deshacer» en el aviso; después, «Quitar» en la lista como cualquier otro |
| Algo guardado en la memoria | «Quitar» en la lista de lo que sabe Nexus: se van la nota y sus hechos (hoy los hechos se quedan: se arregla en la etapa 0) |
| Un dato que dejó de ser cierto | «Ya no es así»: queda reemplazado por el nuevo, no borrado, con quién y cuándo (la tabla de hechos ya tiene «este reemplaza a aquel») |
| Un cambio a una tarjeta de la preventa | Hoy no tiene deshacer. Se suma «Deshacer» al aplicar desde Nexus (etapa 2) |

### 3.4 Qué pasa si lo nuevo contradice lo que ya se sabe

**Hoy:** el agente de impacto avisa si contradice lo que aceptó el cliente; nada más mira contradicciones.

**Propuesta:** la escalera de peso decide qué manda, y Nexus **nunca reemplaza en silencio** algo de más peso. Si lo que
cuentas choca con algo que ya se sabe, el cajón lo muestra lado a lado: «Esto contradice lo que el cliente aceptó el 12
nov: “…”». Tres salidas: «Reemplazar» (lo viejo queda como reemplazado, con quién y cuándo), «Guardar las dos» (queda la
duda a la vista, para preguntarla en la próxima sesión) o «No guardar». Lo que dice una persona del equipo pisa a lo
deducido por Nexus y a lo dicho en una reunión, pero **no** a lo que aceptó el cliente sin que alguien lo decida.

### 3.5 Una empresa con varias preventas o proyectos

**Hoy:** «Lo que sabes del cliente» es de UNA preventa. Una empresa con una preventa archivada y otra nueva, o con
un proyecto en curso, no comparte lo contado. La memoria de la cuenta toma solo la preventa más reciente.

**Propuesta:** lo que sabe Nexus es **de la empresa**, y cada cosa recuerda dónde se contó (en qué preventa o proyecto).
Lo leen todas sus preventas y proyectos. Las unidades separadas (Cemaco · Costa Rica y Cemaco · Ecuador son dos empresas
en Nexus) no comparten: cada una tiene lo suyo. **Decidido (22 nov): es de la empresa y no va a HubSpot.**

### 3.6 Nunca mezclar clientes (invariante 1)

- El lugar lo fija el servidor; el modelo no elige empresa ni nombra ids.
- Las reuniones se leen solo por el chokepoint de sesiones de esa empresa (ya es así en «Hablar con Nexus» y en el chat
  de la cuenta).
- Si en la conversación nombras a otra empresa («igual que en Wherex»), lo que se guarda queda en la empresa donde
  estás, y Nexus no lee nada de la otra.
- Un grupo o holding (Larce dentro de DISTELSA) no comparte memoria automáticamente.
- Cada etapa suma una invariante que falla si un hecho guardado desde Nexus queda en una empresa distinta a la de su
  lugar (hoy existe para los hechos de una nota: INV45; se extiende).

### 3.7 Permisos y roles

| Qué | Quién puede |
|---|---|
| Conversar y preguntar | Quien puede ver esa empresa (hoy: la guardia de la preventa, y las reuniones solo con acceso a la empresa) |
| Guardar en lo que sabe Nexus | Quien puede escribir en esa empresa: Ventas en su preventa, Customer Success en sus cuentas |
| Mejorar un documento | La celda «regenerar» de la sección de ese documento (la que ya pide «Mejorar con IA») |
| Publicar | Igual que hoy; Nexus nunca publica |

### 3.8 El gasto de IA (tope de US$ 300 al mes; US$ 100 para Nexus conversando)

Estimado con los precios de hoy (Sonnet 4.6 para conversar y mejorar; Haiku para decisiones cortas):

| Qué | Costo aproximado por vez |
|---|---|
| Una vuelta de conversación (contar, preguntar de vuelta) | US$ 0,03 – 0,05 |
| Responder una pregunta leyendo las reuniones de la cuenta | US$ 0,25 la primera; US$ 0,04 si repites en 5 minutos |
| Mejorar un documento (propuesta por sección) | US$ 0,10 – 0,20 (más si busca en la web) |
| ¿Cambia algo de lo que se sabe? / ¿cambia este documento? (Haiku) | menos de US$ 0,01 |

**Decidido (22 nov):** un tope de **US$ 100 al mes** para todo lo que hace Nexus conversando (contar, preguntar,
mejorar documentos, el impacto y lo que vuelve a la memoria), con aviso al llegar al 80 % (US$ 80), además de los topes
por persona que ya existen (60 vueltas y 20 preguntas al día). Al llegar al tope, Nexus dice que no puede seguir este mes
y lo ya guardado sigue igual; nada se rehace a medias. Cada etapa queda medida con su propio rótulo de gasto, así el panel de
gasto dice cuánto cuesta cada verbo. Ahorros que ya están: caché de lo que se repite, Haiku para decidir, y no rehacer un
documento entero cuando basta proponer cambios en una sección.

### 3.9 Lo que ve el cliente contra lo interno; lo publicado contra el borrador

- Nexus **solo cambia el borrador**. Siempre queda «Hay cambios que el cliente no ve» hasta que una persona publica.
- Lo que sabe Nexus tiene dos capas: **interno** (presupuesto, quién decide, objeciones, la postura de cada persona) y
  **se puede usar con el cliente**. El corte lo hace el código por el tipo de cada cosa, no el modelo (la regla de la
  memoria del 10 oct). Lo que cuenta el equipo puede llegar a lo que ve el cliente (tu respuesta del 20 nov), pero lo
  interno nunca.
- Al mejorar un documento que ve el cliente, Nexus lee la memoria con el alcance del cliente: no puede meter lo interno
  aunque se lo pidas («agrega que el gerente no quiere») — te lo dice.

### 3.10 Medir si sirve

Por verbo, con lo que ya mide «Uso de Nexus»:

| Qué se mide | Señal de que sirve |
|---|---|
| Lo que Nexus propone guardar y se guarda | Más de la mitad se guarda |
| «¿Era una pregunta?» y «Guardarlo como nota» | Menos de 1 de cada 10 vueltas (Nexus entendió bien) |
| Cambios a documentos propuestos y aplicados | Más de la mitad se aplica sin editar |
| Lo que se guarda solo desde un documento | Menos de 1 de cada 10 se deshace o se quita en la semana |
| Documentos que salen con algo que contó el equipo | Sube semana a semana |
| Costo por cambio aceptado | Baja |

### 3.11 Las dos puertas que confunden

Hoy en la preventa: «Nexus» (arriba), «Hablar con Nexus» (riel) y «Agregar algo que sabes» (Preparación). El 21 nov
dijiste que no a juntar «Hablar con Nexus» con «Agregar algo que sabes»; hoy te confunden. Propuesta: **una sola puerta
«Nexus»**, en el mismo lugar en toda la app, y «Lo que sabes del cliente» queda como la lista de lo guardado, con su
botón «+» que abre Nexus para contar. **Decidido (22 nov): una sola puerta.**

### 3.12 Otros vacíos que salieron al leer el código

- **La página del resultado del test** (la que ve el lead al terminar) se escribe sola y no se edita. Si quieres
  mejorarla con Nexus, es otro tipo de documento: lo dejo fuera hasta que lo pidas.
- **Lo que cuentas a Nexus y HubSpot.** Las notas del chat de la cuenta van a HubSpot; las de «Lo que sabes» no. Hay que
  decidir una. **Decidido (22 nov): lo que se le cuenta a Nexus no va a HubSpot.**
- **Dos personas a la vez.** Si una mejora el documento y otra lo edita a mano, «Aplicar» tiene que chocar (como hoy el
  cronograma y las tarjetas, con 409) y no pisar.
- **Una conversación larga.** Hoy son 6 vueltas por conversación. Para mejorar un documento con varias idas y vueltas
  puede quedar corto: se mide en la etapa 3 antes de subirlo.
- **Lecciones de Smarteam contra hechos de la empresa.** «Usa siempre títulos cortos» no es algo de Cemaco: es una regla
  de cómo escribe Smarteam. Va a otro lugar (etapa 7), no a la memoria de la empresa.

---

## 4. El diseño del objetivo

### 4.1 Una sola puerta, con el lugar

- **Un botón «Nexus»**, en el mismo lugar en toda pantalla de una empresa (la preventa, la ficha, cada documento). Abre
  un cajón al costado que **no tapa con fondo oscuro**: puedes mirar el documento mientras hablas (como el chat del
  documento de hoy).
- **«✨ Pedirle a Nexus»** reemplaza a «✨ Mejorar con IA» en cada documento y aparece al pasar por cada sección. Abre el
  mismo cajón con el chip del lugar ya puesto.
- Una conversación por persona y por empresa; vuelve al volver (como hoy en la preventa).

### 4.2 Las tres cosas que hace (más responder)

| Verbo | Ejemplo | Lo que hace Nexus | Tu confirmación | Cómo se deshace |
|---|---|---|---|---|
| **Guardar en lo que sabe de la empresa** | «Ojo: crédito y cobro contacta a 4.800 clientes al mes» | Pregunta lo que falta (como mucho dos rondas), muestra la nota con tus palabras, lo que entendió (los hechos), si choca con algo, y qué documentos cambiaría | «Guardar» | «Quitar» o «Ya no es así» |
| **Mejorar el documento donde estás** | «Cambia el título a algo sobre la cobranza»; «agrega una parte sobre el WhatsApp, que es crítica» | Propone el cambio por sección, con el antes y el después, usando lo que sabe de la empresa | «Aplicar» por sección o «Aplicar todo» | «Deshacer» y la versión «Cambiado con Nexus» del historial |
| **Llevar a lo que se sabe lo que cambias en lo que ve el cliente** | Corregiste «4 de cada 10 cotizaciones» a «2 de cada 10» en la página de La escala | Al aplicar un cambio de Nexus, o al publicar o presentar, detecta qué de lo que cambiaste es un dato de la empresa y **lo guarda solo** | Ninguna: avisa «Guardé en lo que sabe Nexus: …» | «Deshacer» en el aviso, o «Quitar» después |
| **Responder** | «¿Qué dijo Andrés de la API?» | Responde leyendo lo de esa empresa, con citas verificadas | No guarda nada | — |

### 4.3 El ciclo completo

1. Cuentas algo o cambias algo que verá el cliente.
2. Nexus lo guarda en lo que sabe de la empresa, con su peso y quién lo dijo: con tu clic si lo contaste; solo, con
   aviso y «Deshacer», si lo cambiaste en algo que ve el cliente.
3. El agente de impacto mira qué documentos de esa empresa cambia (La escala, los casos de uso, después el kickoff, el
   handoff y la propuesta) y, por cada uno, **propone los cambios por sección** con su cuenta regresiva o rehace el
   borrador si es corto. Nunca publica.
4. Cuando el documento se presenta o el cliente lo acepta, lo que dice sube de peso en la memoria («presentado»,
   «aceptado por el cliente»): es lo más cierto que hay.

### 4.4 Cómo se suma un documento nuevo (lo que lo hace escalable)

Cada documento que quiera trabajar con Nexus llena **el mismo contrato**, y una prueba vigila que esté completo (como hoy
el registro de los tipos de documento):

1. **Quién es:** a qué empresa y a qué preventa o proyecto pertenece; el servidor lo verifica.
2. **Qué se lee:** el documento como lo ve el cliente y lo interno aparte, en piezas con nombre (titular, puntos clave,
   cada sección).
3. **Qué se puede cambiar:** sus secciones o destinos, cada uno con la forma que acepta y su validación.
4. **Cómo se aplica:** por el editor de siempre (nunca un segundo camino de escritura).
5. **Cómo se guarda la versión y cómo se deshace:** por el historial de versiones.
6. **Qué ve el cliente:** publicado o borrador, y quién puede publicar.
7. **Su permiso:** la celda que pide.
8. **Para el agente de impacto:** sus piezas principales y si está publicado, presentado o aceptado.

Sumar un documento = llenar este contrato. Sumar algo que Nexus sabe hacer = una operación en el registro de
operaciones (el mismo que ya usa el chat de la cuenta). Ninguno pide tocar el cajón.

### 4.5 El motor

- **El cajón y las reglas de conversar** salen de «Hablar con Nexus» (nada se guarda sin clic, la nota con tus palabras,
  citas verificadas, «¿Era una pregunta?»): es lo más probado con uso real.
- **Lo que puede hacer** sale del registro de operaciones del chat de la cuenta (tareas, siguiente paso, generar un
  documento, la guía), que ya acota todo a la empresa.
- **Mejorar un documento** reusa el «Mejorar con IA» de cada documento a través del puente que ya construyó el chat del
  documento (la instrucción va al editor del documento, que propone y aplica).
- El resultado: un motor, no seis. Las puertas viejas se retiran de a una, cuando la nueva cubre lo que hacían
  (no antes: nada que existe se esconde sin preguntarte).

---

## 5. El plan por etapas

De lo más chico que ya sirve a lo más grande. Cada etapa se despliega sola, termina con «Qué probar, en simple» para ti
y pasa por `/revisar`. Las sesiones de Claude son estimadas.

```
Etapa 0  Cerrar lo de la semana ─┐
Etapa 1  Lo que sabe Nexus llega a todos ─┬─> Etapa 2  Una puerta en la preventa ─> Etapa 3  Mejorar La escala y casos ─> Etapa 4  De vuelta a la memoria
                                          └─────────────────────────────────────────────────────────────────────────────> Etapa 5  Ficha, proyecto e impacto ─> Etapa 6  Propuestas
                                                                                                                              Etapa 7  Lecciones de Smarteam (aparte)
```

### Etapa 0 · Cerrar lo que quedó a medias (≈ ½ sesión)

- **Ya hecho (22 nov):** los dos SQL del 21 nov se aplicaron y «Hablar con Nexus» y el historial de versiones están en
  producción (3deb62b0); las dos notas «resumelos» de Cemaco · Ecuador se borraron.
- **Qué falta construir:**
  - Quitar o editar una nota retira sus hechos o los rehace.
  - Un «gracias», «ok» o «listo» no propone guardar; después de guardar puedes seguir conversando.
  - El tope de US$ 100 al mes para Nexus conversando, con su aviso al 80 % (hoy solo existen los topes por persona).
  - Un conteo en «Uso de Nexus» de «Hablar con Nexus»: vueltas, guardadas, «¿Era una pregunta?», cambios aplicados y
    gasto.
- **Qué toca:** el chat de la preventa y su guardado de hechos (lib/chat-de-nexus, lib/seguimiento/hechos-server.ts), «Uso
  de Nexus».
- **Cómo se prueba:** pruebas unitarias de lo que no se guarda; una prueba de integración de quitar una nota y que se
  vayan sus hechos; la invariante de hechos en verde.
- **Qué decides:** el deploy.
- **Depende de:** nada.

### Etapa 1 · Lo que sabe Nexus llega a todos los documentos y a casos de uso (≈ 1,5 sesiones)

> **Construida el 23 nov, sin SQL y sin desplegar** (DECISIONS, «Hablar con Nexus, el plan maestro», etapa 1). Falta
> la prueba con Cemaco · Ecuador: regenerar sus casos de uso con sus notas reales y comparar contigo.

Es el cimiento y lo que más vale: hoy lo que cuentas no sale de la preventa.

- **Qué se construye:**
  - La memoria de la cuenta suma **«Lo que confirmó el equipo»**: las notas de todas las preventas de la empresa (no
    solo la última) y sus hechos, con quién y cuándo, ordenados por peso. Lo guardado con tu clic cuenta como confirmado.
  - El corte para el cliente por tipo: lo interno (presupuesto, quién decide, objeciones, posturas) no llega a los
    documentos que ve el cliente.
  - **Casos de uso**: el agente que sugiere, el que personaliza las actividades y su «Mejorar con IA» leen lo que
    confirmó el equipo y lo que aceptó el cliente en La escala. Lo que el cliente aceptó pesa más que una hipótesis.
  - El chat «Nexus» de la cuenta lo ve también (lee la misma memoria).
- **Qué toca:** el cargador de memoria y su registro de lectores (lib/memoria), la puerta de la preventa a la memoria
  (lib/exploraciones/para-la-memoria.ts), lo que leen los casos de uso (lib/exploraciones/casos-de-uso.ts y
  personalizar-caso.ts). Sin pantalla nueva y sin SQL.
- **Cómo se prueba:** una prueba que falla si una nota interna llega al alcance del cliente; una de que una nota de la
  empresa A no aparece en la memoria de la empresa B; regenerar los casos de uso de Cemaco · Ecuador en la base local
  con sus notas reales y comparar el antes y el después contigo.
- **Qué decides:** si lo que dice el equipo pesa más que lo dicho en una reunión al sugerir casos (la escalera dice que
  sí; lo confirmo contigo al ver Cemaco).
- **Depende de:** etapa 0 (los hechos limpios).

### Etapa 2 · Una sola puerta en la preventa (≈ 1,5 sesiones; decidida el 22 nov)

> **Construida el 23 nov, sin SQL y sin desplegar** (DECISIONS, «Hablar con Nexus, el plan maestro», etapa 2): dejó de
> esperar al conector cuando Elías pidió que «✨ Mejorar con IA» abra el chat «Nexus». El botón de arriba abre el cajón;
> el del riel se quitó; tareas, siguiente paso y la guía se piden desde el cajón (la conversación de la cuenta, sin las
> notas que van a HubSpot). Falta: un solo motor para las dos conversaciones, «Lo que sabe Nexus de <empresa>» y las
> contradicciones lado a lado.

> **En espera desde el 23 nov** hasta que termine el piloto de dos semanas del conector de Claude: si la conversación la
> pone Claude, este cajón puede sobrar. Se retoma, se cambia o se descarta con lo que diga el piloto.

- **Qué se construye:**
  - En la preventa, el botón «Nexus» de arriba abre el cajón de «Hablar con Nexus» (que suma lo que hacía el de la
    cuenta: tareas, siguiente paso, la guía). Se quita el botón del riel.
  - «Lo que sabes del cliente» pasa a llamarse **«Lo que sabe Nexus de <empresa>»**: la lista de lo guardado, con sus
    hechos, su peso, «Quitar», «Ya no es así» y un «+» que abre Nexus para contar. Escribir a mano sigue existiendo
    dentro del cajón (si no quieres conversar, escribes y guardas).
  - El chip del lugar: al abrir desde una tarjeta del Resumen («Metas»), Nexus ya sabe de qué hablas.
  - Contradicciones: lado a lado, con «Reemplazar», «Guardar las dos» y «No guardar».
  - «Deshacer» al aplicar un cambio a una tarjeta desde Nexus.
- **Qué toca:** el cajón (components/exploraciones/HablarConNexus.tsx, components/chat-de-nexus), la cabecera de la
  preventa, «Lo que sabes» (components/exploraciones/LoQueSabes.tsx), las operaciones del chat de la cuenta.
- **Cómo se prueba:** las pruebas de conversación de hoy siguen en verde; una prueba de cada salida de una
  contradicción; tu prueba en el 3004 con Cemaco · Ecuador.
- **Qué decides:** el diseño del cajón y de la lista en Claude Design con el sistema «Nexus · interfaz interna» (que
  sea una sola puerta ya lo decidiste el 22 nov).
- **Depende de:** etapa 1.

### Etapa 3 · Mejorar La escala y los casos de uso desde Nexus (≈ 2 sesiones)

> **Construida el 23 nov, sin SQL y sin desplegar** (DECISIONS, «Hablar con Nexus, el plan maestro», etapa 3). Con la
> etapa 2, «✨ Mejorar con IA» abre el cajón «Nexus» con la parte puesta (sin panel aparte). Falta tu prueba con Cemaco ·
> Ecuador: cambiar el titular y agregar una pieza. El historial de un caso de uso guarda sus versiones pero todavía no
> tiene popup.

Tu ejemplo: «cambia el título», «agrega esta parte, que es crítica».

- **Qué se construye:**
  - La página de La escala (el Resumen y la página de cada área) llena el contrato del punto 4.4: Nexus lee la página
    como la ve el cliente, propone cambios por pieza (titular, puntos clave, el reto de un equipo, lo que lo causa,
    textos de la página), y «Aplicar» escribe por el mismo camino que la edición a mano.
  - «✨ Pedirle a Nexus» en el Resumen, en cada área y al pasar por cada pieza.
  - El historial suma el tipo **«Cambiado con Nexus»** (antes y después) y los textos de la página de cada área.
  - Casos de uso: «Mejorar con IA» de las actividades se vuelve «Pedirle a Nexus» con el caso como lugar.
  - Nada se publica: queda «Hay cambios que el cliente no ve».
- **Qué toca:** la página de La escala (components/exploraciones/PaginaDeLaEscala.tsx y sus textos editables), el
  historial (lib/versiones), el paso de casos de uso.
- **Cómo se prueba:** que un cambio de Nexus deje su versión y se pueda deshacer; que no publique; que no meta lo
  interno aunque se lo pidas; que choque si otra persona editó lo mismo; tu prueba con Cemaco · Ecuador: cambiar el
  titular y agregar una pieza.
- **Qué decides:** nada antes de construir: el 22 nov decidiste primero La escala (el Resumen y cada área) y después
  casos de uso, en esta misma etapa. Al final, tu prueba.
- **Depende de:** etapa 2 (el cajón con el lugar). **Con la etapa 2 en espera (23 nov), la versión sin cajón, aprobada por
  Elías el 23 nov:**
  - «✨ Pedirle a Nexus» en el Resumen, en cada área y al pasar por cada pieza abre un **panel en la misma página**, junto
    a lo que se mejora: una caja para pedir («cambia el título», «agrega esta parte») y, debajo, la propuesta por pieza
    con el antes y el después, «Aplicar», «Aplicar todo» y «Descartar» (el marco `<AgentProposal>` de siempre). Sin
    conversación: un pedido, una propuesta. El lugar lo pone el botón y lo verifica el servidor.
  - El contrato del documento (punto 4.4) se construye igual, como funciones de `lib/` que reciben a la persona y la
    cuenta: leer la página como la ve el cliente, proponer por pieza, aplicar por el camino de la edición a mano. Es lo
    mismo que necesita la herramienta `proponer_cambio` del conector, así que sirve a las dos puertas.
  - Casos de uso: su «Mejorar con IA» de las actividades sigue con su nombre y su lugar; lo que cambia es que lee lo que
    confirmó el equipo y lo que aceptó el cliente (etapa 1) y deja la versión «Cambiado con Nexus». Renombrarlo a
    «Pedirle a Nexus» espera al cajón.
  - Lo demás de la etapa no cambia: el historial, que no publique, que no meta lo interno, el choque si otra persona
    editó lo mismo, y el origen de su gasto dentro del tope de US$ 100.

### Etapa 4 · Lo que cambias en lo que ve el cliente vuelve a lo que se sabe (≈ 1,5 sesiones)

Tu punto 4, «casi fijo». Decidido el 22 nov: **se guarda solo**, con aviso y «Deshacer».

- **Qué se construye:**
  - Al aplicar un cambio de Nexus, y al **publicar** o **presentar**, una llamada corta (Haiku) compara el antes y el
    después (salen del historial de versiones) con lo que sabe Nexus y **guarda** lo que es un dato de la empresa. Avisa:
    «Guardé en lo que sabe Nexus de Cemaco: “2 de cada 10 cotizaciones”, antes “4 de cada 10” · Deshacer».
  - Si lo nuevo choca con algo que **aceptó el cliente**, no lo reemplaza solo: lo guarda al lado, con la duda a la vista
    («Esto contradice lo que el cliente aceptó el 12 nov»), y la persona decide. Lo de menos peso (dicho en una reunión,
    deducido por Nexus) sí queda reemplazado, con quién y cuándo.
  - Lo que se guarda así es «se puede usar con el cliente» (salió de algo que ve el cliente).
  - Lo que se guarda así entra como «confirmado por el equipo». Cuando el documento se presenta, sube a «presentado»; si
    el cliente lo acepta, a «aceptado por el cliente».
  - Solo documentos que ve el cliente y solo datos de la empresa (cifras, retos, metas, nombres de sistemas, fechas). Un
    cambio de redacción no propone nada.
  - Empieza por La escala y casos de uso.
- **Qué toca:** el agente de impacto (lib/impacto), el historial (lib/versiones), «Publicar» y «¿Cuándo se la
  presentaste?» de La escala.
- **Cómo se prueba:** pruebas de qué cambios son datos y cuáles redacción (con 20 cambios reales de Cemaco y Centauro
  armados a mano), porque al guardarse solo un error ensucia la memoria; que «Deshacer» deje la memoria como estaba; que
  nunca pise lo aceptado por el cliente; que lo presentado suba de peso; el costo por publicación medido.
- **Qué decides:** nada antes de construir (lo decidiste el 22 nov). Al final, tu prueba.
- **Depende de:** etapa 3.

### Etapa 5 · Nexus en la ficha y en los documentos del proyecto; el impacto en todos (≈ 3 sesiones, en partes)

> **En espera desde el 23 nov**, como la etapa 2, hasta que termine el piloto del conector. El lugar de la empresa para
> lo que sabe el equipo (la parte con SQL) también lo necesita el conector para guardar: es la pregunta 6 de su plan.

- **Qué se construye:**
  - Lo que sabe Nexus vive en la empresa también cuando no hay preventa (un cliente con proyecto). Esto sí pide SQL
    aditivo: un lugar propio para las notas del equipo a nivel empresa, al que se pasan las de las preventas (sin
    perder quién y cuándo).
  - El botón «Nexus» en la ficha y en cada documento del proyecto (kickoff, diagnóstico, planificación, entrega,
    handoff), con «✨ Pedirle a Nexus» en lugar de «Mejorar con IA». El chat del documento y el «Mejorar con IA» viejo se
    retiran recién cuando el nuevo cubra lo mismo (y te lo pregunto con la lista de qué se va).
  - El agente de impacto, enchufado a casos de uso, kickoff y handoff: para documentos largos **propone cambios por
    sección** en vez de rehacerlos enteros.
  - «Agregar contexto»: los 8 lugares de notas se migran de a uno a esta puerta (lo que ya decidiste el 20 nov).
- **Qué toca:** el esquema (SQL aditivo), la cabecera de la ficha y de los documentos, el puente del chat del documento
  (components/asistente), lib/impacto.
- **Cómo se prueba:** la invariante de que nada guardado cruza de empresa; la migración de notas, en simulacro antes
  de aplicar; tu prueba en un cliente con proyecto.
- **Qué decides:** el orden de los documentos y de los 8 lugares.
- **Depende de:** etapas 1 a 4.

### Etapa 6 · Propuestas (cuando estén optimizadas)

- **Qué se construye:** la propuesta comercial lee lo que sabe Nexus con su peso y llena el contrato del punto 4.4 (ya
  tiene historial y «Mejorar con IA»); lo que se cambia en ella vuelve a la memoria como en la etapa 4.
- **Qué decides:** cuándo, después de optimizar las propuestas.
- **Depende de:** etapas 4 y 5, y de tu trabajo de propuestas.

### Etapa 7 · «Guarda esto en la memoria» para Smarteam, no para una empresa (aparte)

- Como en Claude Code hay una memoria del proyecto y otra de la persona, Nexus necesita dos: **lo que sabe de cada
  empresa** (este plan) y **cómo trabaja Smarteam** («los títulos cortos», «nunca prometer fechas en el kickoff»).
- La segunda es el pendiente «Que Nexus aprenda de cada corrección» (ya decidiste: las lecciones las aprueban tú o Alex
  Vanegas, y se empieza por el handoff y el cronograma). Cuando Nexus detecte que lo que pides es una regla general y no
  un dato de la empresa, propone guardarla como lección, para que la apruebes.
- **Depende de:** que apruebes ese mensaje en su chat. Se diseña aparte.

### Resumen de las etapas

| Etapa | Qué ves al terminar | Sesiones | SQL | Prioridad de ahora |
|---|---|---|---|---|
| 0 | Sin cabos sueltos del 21 nov, con el tope de US$ 100 | ½ | No (los del 21 nov ya corrieron) | Exploraciones |
| 1 | Lo que cuentas llega a casos de uso y a los documentos | 1,5 | No | Casos de uso |
| 2 | Una puerta «Nexus» en la preventa y la lista de lo que sabe (**en espera del piloto del conector**) | 1,5 | No | Exploraciones |
| 3 | «Cambia el título» en La escala y casos de uso | 2 | No | La escala, casos de uso |
| 4 | Lo que corriges en lo que ve el cliente se guarda solo en lo que se sabe | 1,5 | No (por confirmar) | La escala |
| 5 | Nexus en la ficha y en el proyecto; impacto en todos (**en espera del piloto del conector**) | 3 | Sí | Artefactos |
| 6 | Propuestas | 1 | No | Propuestas |
| 7 | Lecciones de Smarteam | aparte | Por ver | — |

---

## 6. Tus decisiones (22 nov)

Respondiste las 5 preguntas. Están en DECISIONS («Hablar con Nexus, el plan maestro»).

| # | Pregunta | Lo que decidiste | Dónde cambia el plan |
|---|---|---|---|
| 1 | ¿Una sola puerta «Nexus»? | **Sí.** El botón de arriba a la derecha es el único; «Lo que sabes del cliente» queda como la lista de lo guardado | Etapa 2 |
| 2 | ¿De la empresa o de cada preventa? ¿Va a HubSpot? | **De la empresa**, y cada cosa recuerda dónde se contó. **No va a HubSpot** | Etapas 1 y 5 |
| 3 | «Casi fijo» | **Se guarda solo**, con aviso y «Deshacer», cuando cambias un dato de la empresa en algo que ve el cliente (al aplicar un cambio de Nexus, al publicar o al presentar). En la conversación sigue «Guardar» | Etapa 4; vacíos 3.2 y 3.3 |
| 4 | ¿Qué se mejora primero? | **La escala** (Resumen y cada área) y **después casos de uso**, en la misma etapa | Etapa 3 |
| 5 | ¿Cuánto del gasto? | **US$ 100 al mes** para Nexus conversando, con aviso al 80 % y los topes por persona de hoy | Etapa 0 y todas |

Lo que cambia por la decisión 3, para que no sorprenda: un error al decidir si algo es un dato de la empresa ya no lo
frena tu clic, así que la prueba de la etapa 4 es más dura (20 cambios reales clasificados a mano antes de encenderlo) y
la medición mira cuánto se deshace en la semana. Si se deshace más de 1 de cada 10, se vuelve a conversar.

---

## Para el roadmap

- **Qué cambió:** nada en el código. Este plan junta «Hablar con Nexus», el chat «Nexus» de la cuenta, «Mejorar con IA»,
  el chat del documento y «Agregar contexto» en una sola iniciativa de 7 etapas (docs/plan-maestro-hablar-con-nexus.md).
- **Encaja con:** «El botón «Agregar contexto»» (por hacer; entra en las etapas 2 y 5) y «Que Nexus aprenda de cada
  corrección» (etapa 7).
- **Pruebas:** ninguna todavía; cada etapa trae las suyas.
- **Decidido el 22 nov:** una sola puerta; lo que se sabe es de la empresa y no va a HubSpot; lo que cambias en lo que
  ve el cliente se guarda solo con «Deshacer»; primero La escala y después casos de uso; US$ 100 al mes para Nexus
  conversando.
- **Ya hecho:** los SQL del 21 nov en producción (3deb62b0) y las notas «resumelos» de Cemaco · Ecuador borradas.
- **Espera:** que Elías diga cuándo arranca la etapa 0.
