# Roadmap de Nexus

**Corte:** 2026-10-19

## Para qué

Hoy Nexus se usa poco y está desconectado: lo que más se usa es el kickoff y el cronograma, y la preventa también,
pero le faltan ajustes. El objetivo es que Nexus amarre los puntos: entrar a un cliente y ver todo lo que Smarteam
está haciendo con él.

- **Construimos todo y probamos al final.** El camino está en orden; tú decides qué se ejecuta y cuándo.
- **Sin tiempos ni semanas.** Cada paso se hace cuando lo pones a correr.
- **Los kickoffs y los diagnósticos no se tocan como datos.** Se pueden cambiar las pantallas, pero lo que ya existe se sigue consultando en el mismo lugar.

## Cómo se mantiene este roadmap

Es el punto de alineación entre tú y las sesiones que construyen Nexus. Para que varias sesiones trabajen a la vez sin
chocar:

1. **Lo edita una sola sesión: la que junta las ramas en `main`.** Las demás no tocan este archivo: terminan con un
   bloque «Para el roadmap» (qué cambió, pruebas nuevas o corregidas con número, pasos y resultado esperado) y la que
   junta lo copia en el mismo commit en que junta su rama.
2. **Una prueba entra cuando su código está en `main`**, revisada contra ese código: el camino exacto con el texto de la
   pantalla entre «», qué cliente o persona usar, y un resultado que se pueda comprobar mirando la pantalla.
3. **Antes de pedirte una prueba, la compruebo yo** con los datos de producción (solo lectura) y las pruebas
   automáticas. Lo que se puede comprobar sin la pantalla queda «✓ Validado por Claude», con la evidencia. A ti te
   llegan solo las pruebas de pantalla, las de criterio y lo nuevo.
4. **Cuando algo validado cambia, vuelve a «↻ Validar otra vez»** en el mismo commit que trae el cambio.
5. **Los números de prueba no se reusan.** Una prueba que sale se borra con su número; una que cambia conserva el suyo.
6. **«Lo que le pides al equipo»** tiene solo lo que el equipo puede revisar en producción (o dice «después del deploy»).
7. **Cada vez que se junta algo:** tsc en 0, la suite en verde, «Estado hoy» al día y la vista publicada en la misma
   dirección (`node scripts/roadmap-vista.mjs` y el artefacto).

## Estado hoy

| Qué | Cómo está |
|---|---|
| Producción | Corre `0107b2b4` desde el 19 oct en la tarde, hora de Costa Rica: lo de la madrugada más los arreglos de lo que encontraste con Alex. Sana, con el esquema al día. |
| Por desplegar | Nada: todo `main` está en producción. 12.257 pruebas en verde y tsc en 0. |
| En curso | Nada construyéndose: los arreglos de las pruebas del 19 oct ya están en `main` (12.179 pruebas en verde, tsc en 0). |
| La base | Tiene todo lo que necesita lo que está en `main`: los SQL del 18 oct ya se aplicaron (biblioteca de módulos, escala ligada a la venta, servicio recurrente, gasto de IA, rentabilidad conectada y comunicaciones de HubSpot). La copia de comunicaciones ya corrió: 256 notas y 6 llamadas. |
| En rojo en producción | Un proyecto en un pipeline sin declarar, un cliente apuntando a una empresa fusionada en HubSpot y el corte de cobranza, que nunca corrió. |
| Revisión de código | Hecha el 17 oct sobre los 31 cambios de entonces: 57 problemas encontrados, unos 50 corregidos y en `main`. Ninguno mezclaba clientes. |

**Lo siguiente en todo Nexus:** que sigas validando en producción lo nuevo (pestaña «Pruebas», empezando por las de prioridad alta). Tres cosas que son tuyas: el permiso de correos de HubSpot (abajo, en «Lo que configuras tú»), dar de alta a María José y revisar la escala 8.9.1 para publicarla. Lo de después del deploy ya corrió el 19 oct: 127 alertas sueltas cerradas, 189 reuniones con el texto de otra limpiadas (respaldo en `backups/2026-10-19-limpiar-analisis-de-otra-reunion/`) y 300 de 1.249 transcripciones encoladas para rescatar (el resto, en tandas, cuando el job drene). Falta volver a generar los handoffs que leyeron el texto de otra reunión (RC Inmobiliaria, AMC, DISTELSA, Grupo Printer, REMPRO, Teamnet) con «Rehacer desde cero». Después armo las propuestas recurrentes internas de Cayalá, Grupo Inve, FACO (Honda Costa Rica) y kölbi.

En cada paso: **[hecho]** está hecho (en producción si la tarjeta lo dice); **[en curso]** lo está construyendo una sesión ahora.

## Lo próximo: lo que dejó la reunión con Marco (17 oct)

**El diagnóstico.** Nexus se construyó por piezas que no se hablan entre sí, y el lugar donde más se nota es la preventa.
Marco preparó la sesión con Distribuidora Larce y la guía le pareció bien, pero en vivo le hizo repetir lo que el cliente
ya había respondido en el diagnóstico. Lo que encontré en esa preventa:

- La guía traía **8 preguntas con 3 repreguntas cada una (32)** para una sesión de 45 minutos.
- Las preguntas salen de lo que **le falta al marco de la venta** (tiempos, consecuencias, presupuesto…) y de las dimensiones de la escala, **no de lo que el cliente ya respondió**. Nexus leyó el test y su nota en HubSpot, pero los usó como pistas para ubicar la escala, no como respuestas.
- Ejemplo: el test decía «cuando un deal se enfría, el vendedor lo deja morir y nadie lo detecta». La primera pregunta de la guía fue «¿Qué pasa cuando un deal se queda quieto?». La pregunta que valía («¿cuánto les ha costado?») quedó escondida como tercera repregunta.
- La nota que le sirvió a Marco es la que deja el test en HubSpot: corta, con las palabras del cliente y directa a lo que le duele.

El otro hueco es el mismo de fondo: **lo que se habla por correo no está en el contexto**. La minuta que prometió una
reunión iba en un correo al cliente; nadie la agendó y el cliente le escribió a Marco. Nexus lee las reuniones, pero no
los correos ni el timeline de HubSpot, así que no podía avisar.

Estas cuatro van antes que el resto de la serie. La preventa es la primera.

### A · La preventa lleva a la siguiente pregunta lógica <span class="estado">En producción</span>

Si el cliente ya hizo el diagnóstico, Nexus le dice al vendedor qué le falta preguntar, y nada más.

1. [hecho] Arriba de la guía, «Lo que ya sabemos»: en 3 a 5 líneas, lo que el cliente respondió en el diagnóstico y en las reuniones, con sus palabras, para no volver a preguntarlo.
2. [hecho] Lo que ya respondió no se vuelve a preguntar: la guía salta a la siguiente pregunta lógica, que es cuánto le afecta, cuánto le cuesta, cómo lo quiere resolver, cuándo y con qué. Si dijo que le duele la duplicidad de datos, se profundiza en sistemas; si dijo que no hace seguimiento, se pregunta cuánto le baja la tasa de cierre.
3. [hecho] Solo lo que falta, unas 5 preguntas: si un dato ya está (los tiempos, por ejemplo), no hay más preguntas de ese tema. Las repreguntas no se muestran; se abren si hacen falta.
4. [hecho] Siempre cierra con la pregunta de cierre y el siguiente paso, según lo que falta para proponer.
5. [hecho] Escrita como la nota de HubSpot que le sirvió a Marco: corta, en el lenguaje del cliente y directa a lo que le duele.
6. [hecho] Probada con casos reales antes de soltarla: la sesión 2 de Larce y los prospectos que lleguen por el diagnóstico.
7. [hecho] Preguntas cortas: cada una es solo la pregunta, sin «Dijiste que…»; de dónde sale y lo que dijo el cliente, en un ⓘ. Las palabras del cliente quedan en «Lo que ya sabemos».
8. [hecho] «Regenerar pregunta» en cada pregunta, sin rearmar la guía, y agregar preguntas a mano, que sobreviven a «Actualizar la guía».
9. [hecho] «Mejorar con el asistente»: pedirle con el contexto del cliente «más preguntas de la escala», «profundiza en sistemas», o mejorar las repreguntas, y aplicar lo que propone con un clic.
10. [hecho] Lo que cubre la guía, pegado a la guía (arriba de «Retos de su industria») en vez del panel derecho, y que se actualice con cada cambio.
11. [hecho] El asistente, fluido como una conversación: propone los cambios directo en la lista (sin preguntar antes «¿Las agrego?»), un solo resumen y una línea al aplicar; cambia todas las repreguntas de una pregunta en un paso; y responde más rápido, con el contexto y el modelo justos.
12. [hecho] «Regenerar pregunta», «Editar» y «Borrar» en un menú de tres puntos en cada pregunta.

### B · Los correos y el timeline de HubSpot, en el contexto de la cuenta <span class="estado">En producción</span>

Todo conectado: las reuniones, los correos, el timeline de HubSpot y lo que se ingresa a mano, para que no se pase un seguimiento.

1. [hecho] Los correos con el cliente y el timeline de la empresa y sus contactos en HubSpot entran a la memoria de la cuenta y a la lectura de cada reunión. Hoy entran las notas y las llamadas; los correos esperan el permiso de HubSpot `sales-email-read`.
2. [hecho] Lo que se le prometió al cliente por correo (una reunión, una entrega, una fecha) queda como compromiso, igual que lo que sale de una reunión.
3. [hecho] Si un compromiso con fecha no está en el calendario ni en Tareas a las 48 horas, avisa al CSE y a quien lidera Customer Success.
4. [hecho] Las notas y los acuerdos que se ingresan a mano entran al mismo contexto que leen los agentes, la preventa y el chat.

### C · La rentabilidad, conectada con las agendas y las tareas <span class="estado">En producción</span>

Nexus ya sabe, sin que nadie marque tiempo, qué reuniones tiene cada persona y con qué cliente. Esa es la base del margen.

1. [hecho] Las horas por cuenta salen solas del calendario y de las tareas (lo hecho y cuánto tomó), y con eso el margen por cuenta y por persona.
2. [hecho] La meta del año como barra (US$2,3 millones en 2027), contra lo facturado en los años anteriores, con lo que haya.
3. [hecho] La línea de «por facturar» del punto de equilibrio, la que sube al final: qué recurrencia y qué expansiones faltan para que suba, y cuánto.
4. [hecho] Una lectura de los números: Nexus detecta lo que no progresa y propone qué hacer y cuánto invertir; una persona valida.

### D · Comisiones que cuiden el valor de la cuenta <span class="estado">En producción</span>

El caso de Marco: bajar una recurrencia de US$3.000 a US$2.800 al mes regala US$2.400 al año, y hoy igual se paga el
100 % de la comisión. Mi propuesta, para validar con Marco:

1. [hecho] La comisión de un contrato recurrente se calcula sobre su valor de 12 meses, y **el descuento sale de la base**: base = lo cerrado − lo descontado. En el caso de Marco: 12 × US$2.800 = US$33.600, menos los US$2.400 descontados = US$31.200. Al 5 % son US$1.560 en vez de US$1.680. El vendedor también pone parte del descuento.
2. [hecho] Un descuento de más del 10 % lo aprueba Marco en la propuesta, y queda escrito quién lo aprobó.
3. [hecho] La recurrencia pesa más en la meta que un proyecto único (por ejemplo, 1,2 veces), porque es lo que hace crecer la cuenta.
4. [hecho] Una expansión grande cuenta por su tamaño total, para no empujar a vender recurrencia chica en vez de una expansión grande.
5. Cerrarlo con Marco y construir el módulo de comisiones en Nexus (el paso 1 a 4 queda en la página del modelo, para revisarlo con él).

## La siguiente serie

Lo que pediste el 17 oct, analizado contra el código y contra las propuestas reales. Primero se construye todo y después
lo validas: cada iniciativa suma sus pruebas a «Pruebas» cuando queda en producción. El orden es el que
propongo: primero la escala, porque las propuestas y el servicio recurrente se apoyan en ella. Tú decides.

**Cómo se construye** (vale para todas):

- **Lo que cambia seguido es configuración, no código.** Los servicios recurrentes (SmartLoop, administración de sitio web, soporte de HubSpot, contenido mensual y los que vengan: SEO, AEO, redes, IA en marketing) son un catálogo: nombre, qué incluye, su cadencia y sus rutinas. Sumar uno es una entrada nueva, no una pantalla nueva.
- **Una sola puerta por cosa.** El contexto de la escala sale del mismo cargador que ya usan los agentes; lo vendido (servicio y licencias) sale de la propuesta y Finanzas lo lee de ahí, sin copiarlo a mano.
- **Nada corre solo ni para todos.** Lo que usa IA lo dispara una persona por cliente; lo masivo es un script en simulacro que te muestro antes de aplicar.
- **SQL solo aditivo, antes del deploy**, cada tabla nueva con su seguridad y el chequeo del esquema en verde.
- **Cada regla, una función pura con su prueba**, y una guarda que frena el merge si alguien la saltea.
- **Cada agente nuevo, medido**: su costo por cliente y por proceso en «Uso de Nexus» desde el primer día.
- **Sin sobreingeniería**: si algo se resuelve con lo que ya existe (las tareas, la agenda por enlace, el motor de las propuestas), se usa eso.

### 1 · La escala que entiende el negocio del cliente <span class="estado">En producción</span>

Hoy hay cuatro ediciones (ecommerce y retail, banca, educación, inmobiliaria) y la edición y el perfil se eligen solos, pero no queda claro por qué ni qué cambian. Para que la escala le sirva a quien explora y a quien posiciona, tiene que representar el modelo de negocio de cada cliente.

1. [hecho] Dos ediciones nuevas: Turismo y Automotriz. Las escribo como borrador con las reglas de la escala, pasan sus pruebas y tú las revisas antes de publicarlas.
2. [hecho] Que se entienda cómo se elige: en la escala de cada empresa, «Se mide con la edición X y el perfil Y, porque…» (su industria, cómo vende, si recompra, si la relación es continua), con lo que cambia de la general y un clic para corregirlo.
3. [hecho] Que el modelo de negocio guíe a quien explora (las preguntas de la sesión salen de su edición y su perfil) y a quien posiciona (cada nivel se lee con las palabras de su industria).
4. [hecho] Publicada la 8.9.0 el 18 oct, con Turismo y Automotriz: se ven en la sección de la escala. El resumen está en `docs/escala/ediciones-turismo-automotriz.md`.
5. [hecho] Que cada edición esté personalizada de verdad: cada nivel de cada dimensión dice al menos un criterio con las palabras de su industria. 322 criterios reescritos en las seis ediciones, sin criterios nuevos. En `main` como 8.9.1, sin publicar: la publico cuando la revises (prueba 108).

### 2 · La escala de cada empresa: «Actualizar escala» con todo el contexto <span class="estado">En producción</span>

Hoy el agente lee menos de lo que dice: en un proyecto no lee lo vendido, las minutas, las tareas, el cronograma ni HubSpot; no vuelve a leer las reuniones ya leídas; y un cliente sin proyecto activo ni preventa no tiene botón. La historia guarda el proyecto y el ciclo, pero no la venta, y siempre con la fecha de hoy.

1. [hecho] Un botón «Actualizar escala» en La cuenta › La escala para todo cliente: con proyecto, con preventa o solo con negocios ganados. Lo toca una persona por cliente; nunca corre solo ni para todos.
2. [hecho] Que lea todo lo que Nexus sabe de la cuenta: lo vendido (negocios ganados, propuesta comercial y handoff), la memoria (minutas, hechos, notas del equipo y la ficha), las tareas, el cronograma, los cuestionarios, el test y HubSpot, con las reuniones ya leídas en resumen. Sin marcar nada como leído ni cambiar la guía de la exploración.
3. [hecho] Confirmar en la misma pantalla: cada nivel propuesto con su porqué y su fuente, «Usar» uno por uno o «Usar todos». Lo propuesto nunca entra a la historia; lo confirmado, sí.
4. [hecho] La historia amarrada a la venta: cada versión dice de qué venta, preventa, proyecto o servicio sale, y se puede fechar en su momento («al vender», «al arrancar», «hoy»), para ver cuánto se movió la empresa desde que nos compró.
5. [hecho] Con varios proyectos o ventas, elegir sobre cuál se ubica.

### 3 · Propuestas: proyecto o recurrente, licencias aparte y módulos que se reusan <span class="estado">En producción</span>

Revisé las propuestas: hay 66 secciones personalizadas en 23 empresas, armadas a mano por Andrés y Marco. Se repiten: casos de uso a implementar (7), arquitectura y diagramas (16), qué contiene el acuerdo y SLA (8), antes y después, comparación de licencias (Starter contra Pro) y forma de pago. Cayalá y Grupo Inve ya se vendieron como servicio recurrente con SmartLoop, todo en HTML hecho a mano.

1. [hecho] Al crear una propuesta se elige: proyecto (se hace una vez) o servicio recurrente, y cuál servicio del catálogo.
2. [hecho] La plantilla de servicio recurrente, con lo que ya vendieron a mano: qué contiene el acuerdo, cómo opera (cadencia y rutinas), el ciclo (para SmartLoop, con tu diseño), el nivel de servicio, antes y después, y la inversión mensual. La de proyecto queda como hoy.
3. [hecho] Licencias y servicios siempre separados: cada licencia con su precio de lista, que es público, y lo que se le cobra al cliente. Si cobramos más, la diferencia queda a la vista para Ventas y Finanzas; el cliente nunca la ve.
4. [hecho] Al ganarse, lo vendido llega solo a Finanzas: cuánto es servicio, cuánto es licencia y qué margen deja cada licencia. Finanzas puede volver a leer las propuestas ya ganadas y recalcular los ingresos de meses pasados (hoy eso se carga a mano, como con kölbi).
5. [hecho] Los módulos que más se repiten pasan a ser secciones de Nexus que se agregan, se quitan y se mueven con un clic, que la IA llena y que salen bien en el PDF: casos de uso, arquitectura, comparación de licencias, fases u opciones, forma de pago, antes y después, nivel de servicio, qué contiene el acuerdo y el ciclo SmartLoop.
6. [hecho] Una biblioteca para lo demás: cualquier sección personalizada se guarda como módulo y se usa en otra propuesta, con «Adaptar a esta empresa» (la IA cambia los textos sin tocar el diseño). Sin código a la medida.
7. FACO, Colby, Cayalá y Grupo Inve: lo que ya se les vendió se arma como una propuesta recurrente nueva, interna, sin tocar la que firmaron. De ahí sale su servicio en Nexus. El script ya está y corrió en simulacro; lo aplico después del deploy (FACO es Honda Costa Rica; falta confirmar que «Colby» es kölbi).

### 4 · El servicio recurrente, dentro de la ficha del cliente <span class="estado">En producción</span>

No un sistema para manejar ciclos: una guía para que el CSE entienda un servicio recurrente y lo lleve con cadencia. La ficha del cliente sigue igual (escala, exploración, encuestas); solo cambia un poco si el servicio es recurrente y cuál es.

1. [hecho] Cada proyecto dice si es recurrente y de qué servicio del catálogo. Con eso cambian el Resumen y la guía; lo demás de la ficha queda igual.
2. [hecho] La guía del servicio en el Resumen: qué se entrega, con qué cadencia y qué toca ahora. En SmartLoop, las cinco etapas como un ciclo, con dónde va la cuenta y qué falta para pasar a la siguiente.
3. [hecho] Las rutinas: al arrancar, Nexus propone las reuniones fijas del servicio, para guardarlas en Google Calendar por enlace, y las tareas que se repiten para el CSE.
4. [hecho] Al ganarse una propuesta recurrente, el proyecto nace con su servicio, su cadencia y sus casos de uso. Reemplaza los scripts de hoy.
5. [hecho] Pasar un cliente actual a recurrente desde la ficha: eliges el servicio, Nexus propone dónde va y arma las rutinas; lo de antes queda como historia, sin mezclarse.
6. Pasar los recurrentes de hoy uno por uno con su CSE: Continuidad, administración de sitio web y contenido.
7. Definir contigo la cadencia y las rutinas de cada servicio del catálogo.

### 5 · Finanzas: terminar de simplificar <span class="estado">En producción</span>

**Decidiste el 18 oct:** cobrar solo, cada día, lo que Odoo y Mercury dan por pagado y conciliado; el menú de los Super Admin sin lo de quien registra; María José concilia cada mañana (con una cuenta nueva que das de alta tú); y primero el libro, después el menú. Caja neta lo decide Alex. La construcción espera que arranques su tarjeta.

No encontré en ningún plan la frase «simplificar demasiado». Lo más cercano es el rediseño de Finanzas del 3 oct: un solo menú que cambia según quién entra (registra, supervisa o dirección).

**Lo que ya se hizo:** Cobranza quedó en cuatro pestañas (Quién nos debe, Cobros, Clientes, Alertas) y sus reportes pasaron a Reportes; una sola lista de lo que no cuadra en Conciliación; la Planilla en una sola entrada; las hojas viejas de Costos salieron del menú.

**Lo que se deshizo a propósito:** el 8 oct pediste que los Super Admin vean todo. Desde entonces la vista solo cambia la pantalla de entrada, y tu menú de Finanzas tiene 20 entradas.

1. [hecho] El documento para decidir y validar: `docs/finanzas-simplificacion.md`, con lo planeado, lo hecho, lo que dijeron Marco y Alex, 8 decisiones y 18 pasos para el 3004.
2. [hecho] Retirar las páginas viejas de Costos (Costos, Fijos, Herramientas y la segunda página de Tarjetas): llevan a su página nueva.
3. [hecho] Cobranza › Odoo, Mercury e Importar dentro de Conciliación, o fuera si ya no se usan.
4. [hecho] Reportes de seis entradas a tres: Rentabilidad vive en Éxito del cliente, y Tipo de cambio e Integraciones van dentro de otra página.
5. [hecho] Comisiones de vendedor y Aguinaldo dentro de Planilla.
6. [hecho] Decidido: el menú de los Super Admin queda sin lo de quien registra (Pendientes, Comisiones de vendedor y Aguinaldo sueltos).
7. [hecho] Cobrar solo lo que Odoo y Mercury dan por pagado y conciliado con el banco, cada día, firmado por el sistema.
8. [hecho] Que el punto de equilibrio cuente solo lo del año, y explicar la diferencia de ventas sin cobranza (US$218.000 en Nexus contra los ~US$90.000 que esperaba Marco).
9. Dar de alta a María José (tú): Equipo › agregar persona con su correo de Smarteam y área «Admin», rol «Asistente administrativo». Sin Planilla, Aguinaldo ni Comisiones de vendedor.

### 6 · El gasto de la IA: verlo, proyectarlo y bajarlo <span class="estado">En producción</span>

Hoy el gasto se anota completo, llamada por llamada, y se ve por agente, cliente y proceso en 30 o 90 días. Falta verlo por mes, contra el tope y hacia adelante. El tope diario ($15 para lo automático y $60 para lo que pide una persona) solo avisa: no frena.

1. [hecho] El panel por mes: la tendencia, el tope a la vista, cuánto ahorra la caché y lo que cuesta cada reunión, cada cliente y cada proceso.
2. [hecho] La proyección de los próximos meses: el costo de cada cosa (una reunión leída, una corrida del vigía, un turno de chat) por el volumen que viene, con escenarios según el enfoque (más clientes, más reuniones, servicios recurrentes).
3. [hecho] Bajarlo sin perder calidad: que la lectura de cada reunión y sus hechos compartan la caché; lo que no apura (avance, ficha, marketing, el barrido del vigía) por lotes, a mitad de precio; modelos más baratos donde alcanza (etapa, ficha, clasificador); el vigía sin repetir lo que no cambió; y no pagar dos veces una respuesta cortada.
4. [hecho] Que el tope frene de verdad, ya calibrado con lo que se gasta.
5. [hecho] Cada mes, el gasto de Nexus contra la factura de Anthropic.
6. Pasar el clasificador a Haiku después de comparar los dos modelos (`scripts/comparar-modelo-del-clasificador.ts`), y conectar el avance y la ficha a los lotes.

## Lo que conecta a los equipos

### Tareas <span class="estado">En producción</span>

Todo lo que Smarteam tiene que hacer con un cliente, de cualquier equipo, es una tarea con su cuenta. Por ahora, las tareas de seguimiento de la cuenta; las de configuración (propiedades, pipelines) quedan para después.

1. [hecho] En la ficha de cada cliente, todas las tareas de Smarteam con esa cuenta, por equipo: qué es, para cuándo y de dónde viene.
2. [hecho] Que cada equipo configure su sprint: Customer Success, Marketing y Desarrollo eligen su reunión de sprint y quiénes están.
3. [hecho] De cada reunión, Nexus propone hasta 5 tareas por persona, y cada tarea dice de dónde viene: una reunión con el cliente o el sprint interno.
4. [hecho] «Planifica tu semana», la pantalla de los viernes: la acción y la reunión de la semana por cuenta.

### Inicio («Para ti») <span class="estado">En producción</span>

Lo primero que ve cada persona al entrar: lo que importa hoy, sus cuentas y sus reuniones. Un mismo módulo, una página por equipo.

1. [hecho] El inicio de Ventas y del CSE, con el diseño de [«Para ti · Ventas y CSE»](https://claude.ai/artifact/FMYuGJ3vN9UyBhyABhnnLm): una guía fácil de consultar, la agenda del día como Google Calendar y cada reunión en un panel al costado.
2. [hecho] El inicio de los demás: la CSL ve toda la cartera, Desarrollo los clientes con proyecto de desarrollo activo y Marketing sus tareas internas (Smarteam y SmartAgro).
3. [hecho] Crear eventos desde la agenda: tocar una hora arma un evento de una hora con su contacto y abre Google Calendar ya lleno; «Agendar» lo pone en la agenda primero; los huecos, solo de lunes a viernes de 8 a 5.
4. [hecho] La cartera de Customer Success como la de Ventas, por proyectos (implementación, SmartLoop y desarrollo): el cliente grande, quién lo lleva, el estado de la cuenta, la última comunicación y el monto solo si hay un negocio abierto.
5. [hecho] Que Nexus sugiera con qué avanzar en los huecos de la agenda, con las tareas pendientes, para ponerlo en la agenda.
6. [hecho] Medir la adopción: qué usa cada equipo y qué se desestima, en «Uso de Nexus».
7. El correo de la mañana con lo mismo, bien probado antes de mandarlo (espera decidir Gmail o un proveedor).
8. [hecho] La agenda, con lo que encontraste al validar: más rápida; un sábado o un domingo muestra la semana siguiente; un hueco elegido se suelta tocando afuera o la X; «Agendar» arma la reunión en Nexus antes de abrir Calendar; «Tus notas» también en las reuniones que ya pasaron.
9. [hecho] La cartera del CSE: «Planificar acción» en las cuentas sin acción, que la pone en la agenda; el uso de HubSpot de cada cuenta (si sube o baja, por los hubs que compró); y un botón con nombre claro en vez de «Abrir cuenta».
10. [hecho] Que nada quede fuera de «Lo que importa hoy»: si a un CSE le piden atención más cuentas de las que entran, «Estabilizar N cuentas», y a la CSL le llega para repartir o acompañar.
11. [hecho] Planificar la semana también el viernes, el sábado y el domingo, y la agenda abierta en la vista de semana.

### Reuniones y memoria <span class="estado">En producción</span>

Cada reunión se lee una vez y queda como memoria de la cuenta: la usan la ficha, las tareas, los documentos y los agentes.

1. [hecho] Prender la lectura de hechos de cada reunión (prendida desde el deploy del 17 oct).
2. [hecho] Que no falte ninguna transcripción: que Google Workspace las cree solas en todas las reuniones, también las de Desarrollo.
3. [hecho] Arreglar las reuniones que quedaron con texto de otra reunión, y regenerar los handoffs de RC Inmobiliaria, AMC, DISTELSA y Grupo Printer.
4. [hecho] La agenda de cada cuenta: qué clientes tienen reunión y planear una desde Nexus.
5. [hecho] Cada reunión con su página: su agenda, sus avisos y sus tareas con responsable.
6. [hecho] Después de cada reunión con un cliente: el correo de seguimiento y la próxima reunión sugerida.

### La escala y los casos de uso <span class="estado">En producción</span>

Dónde está cada cliente y qué lo mueve. Es lo que une a Ventas con Customer Success: Ventas la usa para vender y Customer Success para planear cada ciclo.

1. [hecho] Comprobar con casos reales que la escala se calcula bien y que su agente usa toda la información de Nexus para llenarla.
2. [hecho] Pintar la escala del cliente con su evidencia: de dónde sale cada nivel.
3. [hecho] Que sugiera qué explorar en las próximas reuniones, según lo que cambió en la escala.
4. [hecho] La misma escala en la ficha del cliente, con su histórico: verla, regenerarla y activar el agente desde ahí. El diagnóstico de cada ciclo también la actualiza.
5. [hecho] El camino de crecimiento de cada cliente: qué sigue en la escala y por qué.
6. [hecho] Casos de uso sugeridos, inspirados en la biblioteca de casos de uso (con tu lista de títulos).
7. [hecho] La escala de cada empresa en La cuenta › La escala, aunque no haya preventa: el agente la arma con el handoff, los cuestionarios y HubSpot. La primera versión de las 7 empresas con niveles confirmados quedó guardada el 17 oct.
8. Licencias y precio de cada caso de uso.

### El chat de Nexus <span class="estado">En producción</span>

Un solo chat que hace lo mismo que las pantallas, sobre la cuenta en la que estás.

1. [hecho] El chat sobre la memoria y las tareas de la cuenta, dentro de Nexus y con su costo controlado.
2. [hecho] Contarle lo que pasó por WhatsApp o una llamada y que sugiera lo que hay que cambiar, para aplicarlo de una vez.
3. [hecho] Acciones sugeridas a cada persona según sus cuentas y sus tareas, con el mensaje de WhatsApp listo.
4. [hecho] Que genere los documentos con su plantilla.

## Por equipo

### Ventas <span class="estado">En producción</span>

La preventa, las propuestas y los negocios. Usa el inicio, la escala y la memoria de las reuniones.

1. [hecho] Armar la propuesta desde la preventa, con una sección de casos de uso.
2. [hecho] Esa sección también en una propuesta sin preventa: casos de uso inspirados en la biblioteca, con el contexto del prospecto o cliente.
3. [hecho] Que la preventa sugiera el siguiente paso: agendar la próxima sesión de exploración y, si ya está agendada, planificarla.
4. [hecho] En la propuesta, «+IVA» o «IVA incluido» para clientes de Costa Rica, con los cálculos de ahí.

### Customer Success <span class="estado">En producción</span>

Los proyectos, los documentos, la cartera y el servicio recurrente. Usa las tareas, el inicio, la escala y la memoria.

1. [hecho] Cada cuenta con su acción de la semana y su reunión agendada; si falta, aparece en el inicio.
2. SmartLoop: cargar el plan de FACO en el proyecto de prueba (va con la siguiente serie, iniciativa 3, paso 7).
3. [hecho] SmartLoop: el cronograma del ciclo.
4. [hecho] SmartLoop: aprendizaje y cierre del ciclo (comprometido para el 6 nov).
5. [hecho] SmartLoop: recomendar la recurrencia al llegar a la entrega y la ruta del servicio para el cliente.
6. SmartLoop: pasar los recurrentes de hoy (va con la siguiente serie, iniciativa 4, pasos 5 y 6).
7. [hecho] Los documentos del proyecto con plantillas (la primera: «Diagnóstico estratégico»), sin tocar los kickoffs y diagnósticos que ya existen.
8. [hecho] La foto del margen de cada mes, en carga y rentabilidad.
9. [hecho] Un excliente (Wherex) fuera de toda alerta y cartera: la CSL lo confirma como «Excliente» y solo se ve en «Fuera de la cartera», marcado. Mientras siga un proyecto activo en HubSpot, la lista de limpieza le pide cerrarlo.

### Finanzas <span class="estado">En producción</span>

Cobranza, planilla, punto de equilibrio y comisiones, cruzados con Odoo y Mercury. Plan: [«Un solo libro financiero»](https://claude.ai/artifact/Gbo7THjPG4GZTa5J8ChQzd).

1. Desplegar que Odoo y Mercury marquen solos lo facturado y lo pagado.
2. [hecho] Cada mañana, lo pagado listo para cobrar con un clic.
3. [hecho] El porcentaje de servicio y licencia de cada contrato, y a qué clientes les pagamos licencias y por cuánto.
4. [hecho] Las comisiones de Stripe y las transferencias internacionales como gasto financiero.
5. [hecho] El detalle de cada factura de Odoo y de Mercury.
6. [hecho] Mercury en la facturación por cliente.
7. Pagar comisiones con el modelo nuevo (espera las respuestas de Marco).

### Marketing y Desarrollo <span class="estado">En producción</span>

Equipos más internos: trabajan con sus sprints. Usan las tareas y su página de inicio.

1. [hecho] Configurar su sprint y recibir las tareas de lo que conversaron (Tareas, pasos 2 y 3).
2. [hecho] Su página de inicio (Inicio, paso 2).
3. Marketing: rehacer el test de marketing con la escala nueva, uno corto para atraer leads y uno completo para usarlo con el cliente.
4. Desarrollo: un lugar para sus proyectos, con las estimaciones que se escriben en HubSpot.

## Lo que le pides al equipo

Lo que ya está en producción y les toca revisar a ellos, no a ti.

| # | A quién | Qué revisar |
|---|---|---|
| 1 | CSE y Ventas | Las tareas que Nexus les propone de sus reuniones: usar las buenas y descartar las que no sirven |
| 2 | Andrés | Que una tarea de HubSpot que completa en Nexus aparece cerrada en HubSpot |
| 3 | Un CSE | «Preparar» antes de una reunión con cliente: que traiga lo que necesita para entrar |
| 4 | Alex Vanegas | La cartera de Éxito del cliente: el color de cada cuenta y su porqué |
| 5 | Alex Arrieta | El punto de equilibrio: lo facturado y cobrado de cada mes |
| 6 | Customer Success | Usar la escala con 5 a 8 clientes y decir dónde no calza |
| 7 | Alex Vanegas | Cerrar en HubSpot el proyecto «Wherex - Migración CRM + integraciones operativas» (sigue activo, a nombre de hgomez) y marcar a Wherex como «Excliente» en Éxito del cliente › Cartera |
| 8 | María José o Alex Arrieta, después del deploy | Conciliación › «Lo pagado»: que lo pagado y conciliado en Odoo y Mercury se cobre solo cada mañana, y que lo dudoso quede ahí con su porqué. Las cuotas «Ya cobrada» reciben su número al confirmarlas (prueba 36) |
| 9 | María José o Alex Arrieta | Punto de equilibrio › «Licencias revendidas»: editar la de kölbi y guardar (prueba 33). Conciliación › Gastos y Mercury › «Gastos financieros»: confirmar las comisiones reales (prueba 34). Cobranza › Odoo › «Facturación por cliente»: abrir el detalle de una factura de Mercury (prueba 35) |
| 10 | Alejandra Ortega | Su sprint ya está configurado: «Sprint planning de marketing» (lunes 9:30) como planning. Después de la reunión, ella y Lidia ven en Mis tareas como mucho 5 propuestas cada una, marcadas «Sprint interno» (prueba 21). Si quiere, suma «Retrospectiva de marketing» como cierre |
| 11 | Alex Vanegas | Customer Success: en Tareas › Semana del equipo › «La reunión del sprint», elegir «Weekly Execution Review» (lunes 8:15) como planning y «Revisión de Resultados y Cierre Semanal» (jueves) como cierre, con Gemini tomando notas. El de Desarrollo ya quedó configurado |
| 12 | Alejandro Salas | Prender las notas y la transcripción de Gemini en «SPRINT DEPT. SOFTWARE» (lunes 8:00): ya es el planning de Desarrollo, a su nombre, pero sin notas no hay qué leer |
| 13 | Juan Carlos Armijos | En «Para ti», «Metzger Supplies: un compromiso…» › «Tomarlo o decidir» › «Usar» en la tarea: la línea desaparece de su «Para ti» y del de Alex (prueba 80) |
| 14 | Heiver Gomez | Tareas › «Planifica tu semana»: en una cuenta, «Agendar» la reunión sugerida y «Ya lo guardé»; en otra, «Usar» o «Crear la acción» (prueba 20) |

## Lo que configuras tú en HubSpot

1. Darle a la app de Nexus el permiso de correos (`sales-email-read`) y reconectar HubSpot desde Integraciones. Sin él, Nexus lee las notas y las llamadas del timeline, pero no los correos, y no puede ver lo que se le prometió al cliente por correo (iniciativa B). Los pasos están en el RUNBOOK.

## Lo que configuras tú en Google Workspace

El 53 % de las reuniones con clientes del último mes no tiene transcripción. Una parte la arregla Nexus; esto es de la
consola de Google:

1. Gemini «Tomar notas» y «Transcribir la reunión» activados para toda la organización, Desarrollo incluido, y que arranquen solos al empezar la reunión.
2. Que las notas se compartan con todos los invitados de la organización, no solo con quien las tomó.
3. En las reuniones que organiza un cliente, que alguien del equipo active las notas al entrar.

## Pruebas

Cada prueba dice qué tiene que funcionar, cómo comprobarlo y qué tiene que pasar, en producción (o en el 3004, que usa la misma base). Dime el número y cómo te fue, y lo marco. Los estados, en el orden en que van:

- **↻ Validar otra vez**: lo corregí, o cambió después de que lo validaste. Ya está en `main`: pruébalo de nuevo.
- **Por validar**: te toca a ti.
- **⏳ No te toca ahora**: lo estoy arreglando, lo reviso yo después del deploy, o espera a alguien del equipo. El motivo va en el estado.
- **✓ Validado**, con la fecha. **✓ Validado por Claude**: lo comprobé yo con los datos de producción y las pruebas automáticas; no hace falta que lo mires.

Las áreas van por prioridad: **Alta** antes del deploy (toca plata, la usa todo el equipo cada día, la ve el cliente, o es SmartLoop y comisiones), **Media** lo que se usa todos los días sin ese riesgo, y **Baja** lo que es solo de dirección. Para entrar como otra persona: Equipo › la persona › «Ver como»; «Volver a mi usuario» te devuelve.

Todo `main` está en producción desde el 19 oct (`0107b2b4`). Si usas el 3004, haz `git pull` y reinícialo antes.

**Lo que se arregló el 19 oct, con tu revisión y la mía:**

- Revisé una por una las pruebas pendientes contra el código y los datos de hoy: pasos con el camino exacto y el cliente a usar, y las que se comprueban sin pantalla quedaron «✓ Validado por Claude».
- Arreglado: Conciliación en una sola fila; «Espacio libre» con sugerencias para el evento; el panel de una reunión y su página dicen lo mismo («Revisar sesión»); las tareas propuestas agrupadas por reunión y un solo seguimiento por lo que prometió el cliente (las 27 que había quedaron en 8); «Regenerada» y los pedidos del asistente; licencias editables; «Ver el detalle» de una factura; las cuotas cobradas reciben su número de factura; SmartLoop (la recomendación visible y la etapa de HubSpot); la meta con puntos; Wherex como excliente.
- Queda para después: la copia de Odoo de 2023 y 2024 parece incompleta (la barra de la meta lo muestra), Cemaco Internacional está dos veces, y la foto del margen de septiembre hay que volver a tomarla (pruebas 38 y 84).

**Lo que encontraste con Alex Vanegas (19 oct):** en producción desde el 19 oct; sus pruebas son las del área «Lo que encontraste con Alex» (115 a 143). El CSE encargado se cambia (también desde la cartera de la CSL) y Librería Internacional pierde la fila fusionada; la agenda trae todo Google Calendar, no abre nada sola y sugiere bloques del tamaño de la tarea; las cuentas sin acción o reunión se ven todas y Nexus sugiere el siguiente paso con la reunión; «Por asignar» ya no llena las tareas de cada CSE y el panel dice si guardó; el aviso del vigía dice de qué a qué y se decide en «Propuestas del vigía». Jerson Escudero dado de baja: no tenía nada a su nombre.

### 0 · Lo que encontraste con Alex (19 oct) <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 115 | Por validar | Que Librería Internacional quede con un solo encargado | Clientes › «Librería Internacional»: abre la ficha y espera unos segundos. | La celda «CSE encargado» dice solo Caroline Bersot, ya no Heiver Gómez, y queda un solo «Librería Internacional \| HubSpot Refresh» activo (la fila vieja, fusionada en HubSpot, se da de baja sola en la primera sincronización). |
| 116 | Por validar | Que el CSE encargado se cambie y quede | Éxito del cliente › Cartera › fila de Librería Internacional › «CSE encargado»: elige otra persona y después vuelve a Caroline. | Las dos veces la celda queda con la persona elegida, sin volver al nombre anterior. |
| 117 | Por validar | Que Alex cambie el encargado desde su cartera | Alex Vanegas con su usuario: «Para ti» › «La cartera» › una cuenta con proyecto de implementación › en la línea «CSE:», elige a otra persona (y después devuélvela). | Hay un desplegable. A la persona nueva le llega en «Para ti» «Quedaste como encargado de…», y a la anterior, «… pasó a …». |
| 118 | Por validar | Que un CSE no pueda cambiar el encargado | «Ver como» Caroline Bersot › «Para ti» › «Tu cartera». | La línea «CSE:» se ve como texto, sin desplegable. |
| 120 | Por validar | Que no se abra ninguna reunión sola | «Ver como» Andrés Pinzón › «Para ti». | No se abre ningún panel a la derecha hasta que tocas un evento o un espacio. |
| 121 | Por validar | Que la agenda traiga los eventos sin invitados | «Ver como» Andrés Pinzón › «Para ti» › Agenda, semana del 19 al 23 oct: lunes, jueves y viernes. | Lunes «Convocatoria ICB» 13:00–14:00 y «Tenis» 6:00–7:30; jueves «Cita Médica» 13:00–14:30; viernes «Sale Juan del colegio» 10:30 y «Entrega de notas» 11:30. Ningún espacio libre ni bloque azul encima. |
| 122 | Por validar | Que lo de todo el día vaya arriba | La misma semana, arriba del miércoles. | «Aniversario de Marco Salas» como evento de todo el día, sin ocupar horas. |
| 123 | Por validar | Que dos eventos a la misma hora se vean los dos | La misma semana, lunes 8:00. | «SPRINT COMERCIAL» al lado de «Sprint Comercial \| Planeamos la semana», cada uno con su título. |
| 124 | Por validar | Que las sugerencias sean del tamaño de la tarea y respeten el almuerzo | La misma semana: un bloque azul «Avanza T-…»; después mira de 12:00 a 13:00 cualquier día. | El bloque dice «Sugerido 13:00–14:00» (el tamaño de la tarea), nunca un espacio de varias horas. De 12:00 a 13:00 no hay sugerencias (Andrés no tiene almuerzo marcado). |
| 129 | Por validar | Que lo opcional o «quizás» se vea más claro | Con alguien que tenga un evento con «quizás» u opcional, en su agenda. | Ese evento se ve más claro y al pasar el mouse dice que igual ocupa su tiempo. |
| 130 | Por validar | Que se vean todas las cuentas sin acción o reunión | «Ver como» Juan Carlos Armijos › «Para ti» › tarjeta «Tus cuentas», abajo › «Ver las 19 sin acción o reunión». | Abre la cartera en la pestaña «Sin acción o reunión · 19», con todas las cuentas, sin tope. |
| 131 | Por validar | Que no se pierda ninguna cuenta de Heiver | «Ver como» Heiver Gomez › «Para ti» › «Estabilizar N cuentas», sus «+N en esta cuenta» y «También para hoy». | Entre todos esos enlaces aparecen sus 13 cuentas. |
| 132 | Por validar | Que con reunión y sin paso, Nexus sugiera el siguiente paso | «Ver como» Heiver Gomez › «Para ti» › «También para hoy». | «Teamnet: tiene reunión hoy, falta el siguiente paso» y debajo la caja azul «Siguiente paso: «Capacitación 2 CS - Hubspot», hoy» con «Descartar» y «Usar». Las cuentas sin nada siguen diciendo «sin acción ni reunión». |
| 133 | Por validar | Que «Usar» deje el siguiente paso | La persona con su usuario (por ejemplo Caroline con Club de Amantes del Vino): «Para ti» › la línea con la caja azul › «Usar». | Aviso «Quedó T-… como el siguiente paso…». Al recargar, la cuenta ya no está en la lista, la tarea aparece en Tareas con esa fecha y en HubSpot queda el siguiente paso de CS de la empresa. |
| 134 | Por validar | Que la CSL vea todas en su cartera | «Ver como» Alexander Vanegas › «Para ti» › «La cartera» › pestaña «Sin acción o reunión». | La pestaña dice 47. Las cuentas con reunión dicen «○ Tiene reunión …, falta el siguiente paso» y llevan la caja azul. |
| 135 | Por validar | Que «Por asignar» no llene las tareas de cada CSE | «Ver como» Caroline Bersot › Tareas › «Mis tareas», sección «Por asignar · Customer Success». | Llega plegada con «21». Al abrirla, los recordatorios van en «Rápidas y seguimientos», agrupados por cuenta. |
| 136 | Por validar | Que quien lidera vea «Por asignar» abierto | «Ver como» Alex Vanegas › Tareas › «Mis tareas». | «Por asignar · Customer Success» llega abierta. |
| 137 | Por validar | Que Nexus sugiera cerrar lo viejo, sin cerrar solo | Andrés Pinzón con su usuario: arriba de «Mis tareas», «Nexus sugiere cerrar 3 tareas que ya pasaron y nadie tocó» › «Revisar»; desmarca T-38 y «Cerrar las 2». | Aparecen T-2, T-38 y T-106, cada una con «Era para el…». Las dos marcadas dejan de verse y T-38 sigue. |
| 138 | Por validar | Que el panel de una tarea diga si guardó | Una tarea tuya › cambia «Qué hay que hacer» y espera un segundo; cierra y vuelve a abrir. | Al pie: «Sin guardar…», «Guardando…» y «Guardado». El texto quedó. |
| 139 | Por validar | Que una nota no se pierda al cerrar rápido | «Para ti» › una tarea tuya › escribe en «Notas» y cierra el cajón enseguida; vuelve a abrirla. | La nota quedó guardada. |
| 140 | Por validar | Que el aviso del vigía diga qué propone | «Ver como» Alex Vanegas › «Para ti» › «Lo que importa hoy». | «El vigía propone pasar 9 proyectos a «En riesgo»», debajo «La que más espera: Areyá · Areya - MKT + CRM: de «En fricción» a «En riesgo» (…)» y el botón «Decidir una por una». |
| 141 | Por validar | Que las propuestas se decidan en un solo lugar | Toca «Decidir una por una». También: Éxito del cliente › arriba a la derecha › «Propuestas del vigía». | «Propuestas del vigía» con 9 filas, la de Areyá resaltada y un solo botón azul «Confirmar «En riesgo»». |
| 142 | Por validar | Que lo decidido salga al instante | Alex con su usuario: en esa lista, «Descartar» en una fila; vuelve a «Para ti». | La fila desaparece con «Descartada: … sigue «En fricción»». En «Para ti» dice 8 proyectos. |
| 143 | Por validar | Que la ficha no mezcle salud y estado de HubSpot | Éxito del cliente › Areyá › pestaña «Proyectos». | «Salud: de «En fricción» a «En riesgo» · lo propone el vigía · Decidir», «Estado en HubSpot: A tiempo» y aparte el aviso de «Atraso por cliente» con «Pasar el estado a «Retrasado» en HubSpot». |

### 1 · Finanzas: conciliación, cobro y punto de equilibrio <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 96 | ✓ Validado 18 oct | Que el menú quede en lo que usas | Menú › Finanzas. | No están Pendientes, Comisiones de vendedor, Aguinaldo, Rentabilidad, Tipo de cambio ni Integraciones. Sí: Planilla, Conciliación, Punto de equilibrio, Caja neta, Reportes de cobranza y Comisiones. |
| 97 | ✓ Validado 19 oct | Que Odoo y Mercury estén dentro de Conciliación | Finanzas › Conciliación. Debajo del botón «Actualizar desde Odoo y Mercury» toca «Odoo», vuelve, y después «Mercury» e «Integraciones». | Una sola fila de pestañas: «Lo que no cuadra · Lo pagado · Emparejar · Libro de Alex · Gastos y Mercury». Debajo del botón: «Odoo: copia del … · Mercury: copia del … · Integraciones». Cada página abre con «‹ Conciliación» arriba del título, que te devuelve. El menú sigue marcando Conciliación. |
| 99 | ✓ Validado 18 oct | Que el tipo de cambio esté dentro del punto de equilibrio | Punto de equilibrio › arriba a la derecha › «Tipo de cambio». | La página del tipo de cambio con «← Punto de equilibrio» para volver. |
| 100 | ✓ Validado por Claude 18 oct | Que las ventas sin cobranza cuadren mejor | Punto de equilibrio › «De la venta a la caja» › «Dónde se queda la plata» › «ventas ganadas sin respaldo en cobranza» › «Ver las ventas». | US$171.059,93 en 44 ventas: 15 sin nada cargado, 25 que facturan menos de lo vendido y 4 de empresas que no están en Nexus. Aparte, US$68.321,61 ya cargados en cuotas sin facturar. (Antes se llamaba «Lo que no cuadra»; lo comprobé con los datos.) |
| 101 | ✓ Validado 18 oct | Que las hojas viejas de Costos lleven a la nueva | Escribe `/finanzas/costos` en la barra de direcciones; después `/finanzas/costos/tarjetas`. | Te lleva a Recurrentes, y la segunda a Tarjetas. |
| 102 | ✓ Validado 18 oct | Que «Volver» no lleve a una hoja vieja | Planilla › Comisiones de vendedor › «Volver». | Vuelve a la Planilla. |
| 32 | ⏳ La valida Admin | Que solo se cobre lo pagado que confirmas | Finanzas › Conciliación › «Lo pagado». Desmarca una cuota y confirma con tu firma. | Las cuotas que Odoo y Mercury dan por pagadas, con el día del pago. Las de Mercury sin entrada de plata van a «Pagadas sin el día del pago» y no se cobran. Solo se cobran las marcadas. |
| 33 | ⏳ La valida Admin | Que los montos de las licencias se lean bien | Finanzas › Punto de equilibrio › «Licencias revendidas» › en la fila de kölbi, «Editar». Escribe solo «Lo que se le paga» y «Guardar». | Guarda: la moneda es la del contrato y la frecuencia «Cada mes», a la vista y solo si hay monto. Cada contrato tiene «Editar» en su fila. (Arreglado el 19 oct: antes «Guardar» quedaba apagado.) |
| 34 | ✓ Validado por Claude 19 oct | Que las comisiones de Stripe y transferencias sumen como gasto | Conciliación › Gastos y Mercury › «Gastos financieros». Confirma una. | 81 comisiones para confirmar (US$350,67), sin duplicados; la suscripción de Mercury ya no sale (es la herramienta «Mercury») y la comisión por compras en el exterior dice «Comisión del banco». Lo confirmado suma como gasto financiero. Confirmarlas es de Admin. |
| 35 | ⏳ La valida Admin | Que Mercury esté en la facturación por cliente | Finanzas › Conciliación › enlace «Odoo» (al lado de su copia) › «Facturación por cliente». Busca un cliente, filtra «Facturado por: Mercury» y toca la columna «Facturas» › «Ver». | Los clientes de Mercury junto a los de Odoo; la columna «Facturas» abre sus facturas y «Ver» el detalle de cada una. (Arreglado el 19 oct: estaba escondido detrás de un triángulo.) |
| 36 | ↻ Validar otra vez | Que las facturas de Odoo se peguen solas | Finanzas › Conciliación › «Lo pagado». | Las cuotas que ya estaban cobradas sin número (Corrugando FAC/2026/0221, Grupo Servica 0268) dicen «Ya cobrada» y, al confirmarlas, reciben el número de su factura pagada sin volver a cobrarse. Transportes Juanva 0197 y 0230 siguen como choque: Odoo las da sin pagar. (Medido: 13 cuotas, 4 de Odoo y 9 de Mercury.) |

### 2 · «Para ti»: la agenda, la cartera y los avisos <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 1 | ✓ Validado 17 oct | Que cada persona vea su propio inicio | Con «Ver como» Andrés, abre «Para ti»; después repite con un CSE. | Arriba, los números del día; al centro, la agenda como Google Calendar; a la derecha, «Tu cartera» (Andrés) o «Tus cuentas» (el CSE). |
| 2 | ✓ Validado 19 oct | Que las notas de una reunión no se pierdan y sean privadas | Con tu usuario, en «Para ti» › «Tu día», toca en la agenda una reunión tuya con un cliente de hoy y otra que ya pasó. Escribe algo en «Tus notas» y espera «Guardado». Cierra el panel y vuelve a abrirlo. Después, con «Ver como» Liliana Moreno, abre en su agenda una reunión de ella con un cliente. | En las dos aparece «Tus notas» y la nota sigue ahí al volver. Con «Ver como» Liliana, el panel trae su guía y lo pendiente; en lugar de las notas dice «Las notas son de cada persona: mientras ves Nexus como otra persona no se ven ni se escriben.» |
| 3 | ✓ Validado 17 oct | Que una cuenta sin acción ni reunión aparezca | Con «Ver como» un CSE que tenga una cuenta sin tarea esta semana, mira la primera tarjeta de «Para ti». | La línea «Sin acción ni reunión» con esa cuenta y el botón «Agendar». |
| 4 | ✓ Validado 17 oct | Que Marketing vea sus tareas internas | Con «Ver como» alguien de Marketing, abre «Para ti». | Sus tareas internas, ordenadas por ámbito (Smarteam, SmartAgro). |
| 5 | ✓ Validado 17 oct | Que «Lo que importa hoy» tenga como mucho 5 cosas | Abre «Para ti» con tu usuario y mira la primera tarjeta. Si una cuenta tiene varias cosas, abre su «+N». | Como mucho 5 cosas, una por cuenta. Lo demás de esa cuenta queda plegado en «+N en esta cuenta», y lo que no entra va a «También para hoy». |
| 6 | ✓ Validado 17 oct | Que se pueda crear un evento desde la agenda | Toca una hora vacía de hoy (por ejemplo, las 10). Escribe un título, busca un contacto por su nombre o su empresa, elígelo y toca «Abrir en Google Calendar». | Aparece un bloque azul «borrador» de una hora. Al elegir el contacto, la cuenta se llena sola. Google Calendar se abre con el título, la hora, el invitado y el enlace a la cuenta en la descripción. El bloque queda «abierto en Calendar, sin guardar», con «Ya lo guardé». |
| 7 | ↻ Validar otra vez | Que una cuenta sin acción ni reunión se encuentre y «Agendar» arme la reunión en Nexus | Con «Ver como» Caroline Bersot, abre «Para ti» y busca en «Lo que importa hoy» la línea «Fundauna: sin acción ni reunión». Toca «Agendar», revisa el borrador y toca «Abrir en Google Calendar». | Arriba, en gris, «Fundauna · Cuenta sin acción»; en el título, «Fundauna: sin acción ni reunión». El borrador aparece en la primera hora libre de trabajo, con título, hora, cuenta y contacto editables. Google Calendar se abre solo al tocar «Abrir en Google Calendar». |
| 8 | ↻ Validar otra vez | Que los espacios libres sugieran con qué usarlos | En la agenda (semana), toca un «Espacio libre» punteado de hoy o de un día que viene. Toca «Usar» en una sugerencia. Después toca una hora vacía y mira «Evento nuevo». Toca afuera o la X. | La agenda es de lunes a viernes (un sábado o domingo muestra la semana que viene) y de 8 a 5. El panel dice «Espacio libre» y «Con qué usar este espacio»: tus tareas que caben, «Reunión con…» de una cuenta sin reunión y el siguiente paso. «Usar» deja el borrador lleno en esa hora. Una hora vacía trae las mismas sugerencias, y la usada dice «✓ Usando». Tocar afuera o la X lo suelta. |
| 9 | ✓ Validado por Claude 18 oct | Que de viernes a domingo invite a planificar la semana | Un viernes, sábado o domingo, abre «Para ti» como CSE, CSL o alguien de Desarrollo. | Debajo de «Lo que importa hoy»: el viernes «Es viernes: planifica la semana que viene», el sábado «Es sábado: planifica la semana que viene» y el domingo «Mañana empieza la semana: planifícala». Lleva a «Planifica tu semana» (prueba 20). La agenda abre en la semana. |
| 10 | ✓ Validado 17 oct | Que el CSE tenga su cartera, armada con sus proyectos | Con «Ver como» un CSE, toca «Tu cartera». Prueba «Todos los proyectos», el buscador y una cuenta que le compartieron. | Sus empresas en «Para atender», cada una con el nombre grande, sus proyectos y su etapa, el último contacto, la próxima reunión y la acción de la semana (✓ u ○). Una compartida dice «Compartida», sin color ni monto. |
| 11 | ✓ Validado 17 oct | Que Alex vea toda la cartera de Customer Success, y no la de Ventas | Con «Ver como» Alex, abre «Para ti» › «La cartera». Abre «Por CSE»; después filtra «Pipeline» › Desarrollo. | No aparece la cartera de Ventas ni «Negocios traídos de HubSpot». «Por CSE» trae un bloque por CSE, en orden alfabético, con sus cuentas en riesgo, sin acción y sin contacto, y «Sin CSE» al final. Con el filtro, solo las empresas con un proyecto de desarrollo. |
| 12 | ✓ Validado 18 oct | Que el monto solo lo vea quien vende | Con «Ver como» Andrés, abre «Para ti» › «Tu cartera» y busca una empresa con un negocio abierto. Después, con «Ver como» un CSE que lleve esa empresa, mírala en su cartera. | Andrés ve «N negocios abiertos · US$ …» en la fila. El CSE ve la misma empresa sin el monto. (Con tu usuario no hay cartera: la tienen quienes venden y quienes llevan cuentas.) |
| 48 | ↻ Validar otra vez | Que nada quede fuera de «Lo que importa hoy» | Con «Ver como» Juan Carlos Armijos abre «Para ti» › «Tu día». Después, con «Ver como» Alexander Vanegas. | Juan Carlos: la quinta cosa es «Estabilizar N cuentas» (hoy unas 12), con «Abrir la primera» y un enlace por cuenta que empieza con la empresa («Fundauna: sin acción ni reunión»). Alex: en «También para hoy», «Juan Carlos Armijos tiene N cuentas que piden atención» y lo mismo de Heiver, con sus enlaces. |
| 49 | ✓ Validado 19 oct | Que el CSE planifique la acción desde su cartera y vea el uso de HubSpot | Con «Ver como» Juan Carlos Armijos, «Para ti» › «Tu cartera» › vista «Para atender». En «ALFA+ (LISJ)» toca «Planificar acción». No lo guardes en Calendar. | Cada cuenta dice «Uso de HubSpot N de 100» con «↑ sube», «↓ baja» o «→ igual» (ALFA+: 55, baja); una cuenta sin relación gestionada lo dice con la fecha. Al tocar «Planificar acción» pasas a «Tu día», con un borrador en la agenda y su cuadro abierto («Reunión con ALFA+ (LISJ)», la hora, la cuenta y el contacto) y «Abrir en Google Calendar» y «Descartar». |
| 50 | ✓ Validado por Claude 19 oct | Que un excliente salga de todo | Éxito del cliente › pestaña «Cartera» › «Fuera de la cartera». Para marcar uno: Éxito del cliente › «Cartera» › columna «Tipo de relación» › «Excliente» (la CSL y dirección). | Wherex aparece ahí, marcado «Excliente», con el aviso de su proyecto activo. No está en ninguna alerta, cartera ni en «Lo que importa hoy»; solo en la lista de limpieza de Heiver, que pide cerrar su proyecto en HubSpot. (Lo marqué hoy a tu nombre: cerró sus 4 alertas.) |
| 78 | ↻ Validar otra vez | Que avise de lo prometido sin tomar, y no de lo ya agendado ni de lo interno | Con «Ver como» Andrés Pinzón, abre «Para ti». Después, con «Ver como» Caroline Bersot. | A Andrés: «Universidad Monterrey: un compromiso en una reunión lleva N días sin que nadie lo tome» y lo mismo de Tecnosagot. Accesos Automáticos no avisa: la demo del 21 oct ya está en su calendario. A Caroline: los compromisos de Honda Costa Rica sin tomar. No avisan una reunión interna ni una mención de «la sesión» (T-103 de Seléctrica). |
| 79 | ✓ Validado por Claude 18 oct | Que el líder vea lo que no se tomó | Con «Ver como» Alex Vanegas, abre «Para ti». | Una línea por cuenta: «Larce: N compromisos sin tomar hace más de 48 horas», con el enlace a cada tarea. |
| 80 | ⏳ La valida el equipo | Que el aviso se vaya al resolverlo | Juan Carlos Armijos, con su usuario (con «Ver como» no se puede usar una tarea): en «Para ti», «Metzger Supplies: un compromiso … sin que nadie lo tome» › «Tomarlo o decidir», y en la tarea toca «Usar». | La línea de Metzger ya no aparece en su «Para ti», ni en el de Alex. (La regla «si alguien la tomó, no avisa» está probada.) |
| 109 | Por validar | Que el panel de una reunión lleve a la sesión y diga lo mismo que la página | Con «Ver como» Andrés Pinzón, en la agenda toca «Accesos automáticos + Smarteam» (12 oct) y «Revisar sesión». Vuelve a «Para ti» y toca «Revisar sesión» en «Revisa lo que dejó…». | El panel dice «4 cosas piden tu decisión: 3 tareas para ti, la minuta», el siguiente paso y «Revisar sesión», sin «Usar todo». La página abre en «Lo que dejó esta reunión» con lo mismo, y ahí se usan o desestiman las tareas. «Tareas de esta reunión» dice «Todavía no hay tareas decididas de esta reunión». |

### 3 · Preventa: la guía y su asistente <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 68 | ✓ Validado 18 oct | Que la guía arranque con lo que el cliente ya dijo | Ventas › Preventa › Distribuidora Larce › Exploración › la próxima sesión (si no hay: «+ Agregar sesión» › una sin reunión todavía) › Preparación. | Arriba de «La guía», «Lo que ya sabemos» con 5 líneas en palabras del cliente. La primera: «Cuando un deal se enfría no hay red de contención…», con «Nota del 15 oct» al lado. |
| 69 | ✓ Validado 18 oct | Que las preguntas sean cortas, con su fuente en un ⓘ | Larce › Exploración › la próxima sesión › Preparación › «La guía» › «Preguntar». Pasa el mouse por el ⓘ de una pregunta. | Cada pregunta es solo la pregunta, corta, sin «Dijiste que…» ni «En el diagnóstico dijeron…». El ⓘ muestra lo que dijo el cliente, con sus palabras, y de dónde sale. «Lo que ya sabemos» sigue con las palabras del cliente. |
| 70 | ✓ Validado 18 oct | Que la guía nueva lleve a la siguiente pregunta lógica | El aviso de arriba › «Actualizar la guía». Espera unos segundos. | 5 preguntas que nombran lo que dijo el cliente y preguntan cuánto le costó, cómo lo quiere resolver o con qué. Ninguna de «Para cuándo», porque ya se sabe. |
| 71 | ✓ Validado 19 oct | Que las repreguntas se mejoren con el asistente | En la guía › «Mejorar con el asistente» › escribe: «Mejora las repreguntas de la pregunta 2 para que bajen a números» › Aplicar. | El chat de la cuenta abre con la guía en foco y propone las repreguntas nuevas en una lista; al aplicar, la pregunta 2 trae esas repreguntas. |
| 72 | ✓ Validado 18 oct | Que siempre cierre | Baja a «Cerrar», al final de la guía. | La pregunta de cierre, el siguiente paso con fecha y lo que falta para proponer, sin espacios por completar. |
| 73 | ✓ Validado 18 oct | Que lo que cubre la guía vaya pegado a ella | Larce › Preparación, arriba de «Retos de su industria». Después quita una pregunta. | «Lo que cubre la guía»: los siete puntos para proponer (verde listo, azul lo cubre la guía, punteado no) y las dimensiones que pregunta. Al quitar la pregunta, cambia al instante. En el panel derecho queda solo «N de 7 listos». |
| 74 | ✓ Validado 18 oct | Que funcione igual en otras preventas | Ventas › Preventa › CreditForce (o Cicadex) › Exploración › Preparación › «Actualizar la guía». | «Lo que ya sabemos» con frases del test y 4 o 5 preguntas que parten de ahí. (Lo validé yo, en seco: CreditForce pasó de 7 a 4 preguntas y Cicadex de 7 a 5, y Cicadex ya no pregunta «para cuándo» porque ya se sabía.) |
| 104 | ↻ Validar otra vez | Que se pueda regenerar una sola pregunta | Distribuidora Larce › Exploración › sesión 2 › Preparación › «La guía»: en una pregunta, ⋯ › «Regenerar». Después, en una pregunta «Del asistente», ⋯ › «Regenerar». | La pregunta cambia por otra del mismo tema, marcada «Regenerada»; la «Del asistente» regenerada pasa a «Regenerada» (antes seguía diciendo «Del asistente»). «Volver a la de la guía» aparece solo en una pregunta de la guía. Una tuya editada por ti sigue diciendo «Tuya». |
| 105 | ✓ Validado 19 oct | Que se puedan agregar preguntas a mano | En la guía › «+ Agregar pregunta»: escribe una, guárdala, edítala. Después toca «Actualizar la guía». | La pregunta aparece al final marcada «Tuya» y sigue ahí después de actualizar la guía. Se puede quitar. |
| 106 | ✓ Validado 19 oct | Que el asistente arme la guía con lo que pides | En la guía › «Mejorar con el asistente» › «Agrega dos preguntas de la escala sobre cómo miden el pipeline» › Aplicar. | La caja dice «2 cambios para aplicar», sin repetir la lista en el texto, y responde en unos segundos. Al aplicar: «Listo: …», dos preguntas nuevas, cortas, marcadas «Del asistente», y «Lo que cubre la guía» suma esas dimensiones. Ninguna repite lo que ya dijo el cliente. |
| 107 | ✓ Validado 19 oct | Que el asistente no invente lo interno | En el mismo chat: «Agrega una pregunta sobre el presupuesto que nos dijeron». | No pone montos ni lo interno como si lo hubiera dicho el cliente: pregunta el rango o contra qué lo comparan. (Validada el 18 oct; el chat cambió después.) |
| 113 | Por validar | Que el asistente ofrezca pedidos al abrirse | Larce › Preparación › «La guía» › «Mejorar con el asistente». | Arriba del campo, de 3 a 4 pedidos en botones armados con la guía real (la pregunta con menos repreguntas, las dimensiones sin preguntar, lo primero que falta para proponer). Un clic llena el campo; lo mandas tú. |
| 114 | Por validar | Que el chat numere como la pantalla y respete el tope | Larce › «La guía», vista «En orden» › «Mejorar con el asistente». Pide «Quita la última pregunta». Después «Agrega tres preguntas sobre cómo miden el pipeline». | «Quitar la N» apunta a la misma pregunta que ves última (la del presupuesto). Con las tres: la lista trae solo las que entran y dice que la guía llega a 8 preguntas sumadas (tuyas o del asistente); al aplicar entran sin avisos. |

### 4 · SmartLoop y el servicio recurrente <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 28 | Por validar | Que el cronograma del ciclo pida confirmar el arranque | Honda Costa Rica › «FACO · SmartLoop (prueba)». 1) Resumen › tarjeta de la etapa › «Editar el ciclo»: «Desde», «Hasta» y «Meta del ciclo» › «Guardar». 2) La cuenta › Casos de uso › «Sumar un caso de uso»: título, «Criterio de aceptación» y «Dónde va: Al ciclo 1 de «FACO · SmartLoop (prueba)»» › «Sumar». 3) En el proyecto › Cronograma › «Armar la fase» › «Sí, arranca ese día». 4) En el caso, «+ Dependencia del cliente» › «Sumar». 5) «Aprobar esta versión». | El diálogo «Fecha de arranque del cronograma» dice «El cronograma arranca el [Desde]. ¿Lo confirmas?». Arriba del Gantt, «Cronograma del ciclo 1» con el caso, sus semanas y «Depende del cliente: …». Al aprobar: «Quedó como la versión aprobada.» y «Versión aprobada v1 · [fecha] · [tu correo]». |
| 29 | Por validar | Que cerrar el ciclo saque lo que no se cumplió | Después de la 28, abre el mismo proyecto en dos pestañas, las dos en Aprendizaje. En la A: en el caso, «Qué se decide: No se cumplió» y «Lo medido»; en la meta, «¿Se cumplió?» y «Cómo se evaluó»; después «La propuesta del siguiente ciclo». «Cerrar el ciclo 1» › «Cerrar el ciclo». En la B, sin recargar, cambia «Cómo se evaluó» y haz clic afuera. | En A: «El ciclo 1 quedó cerrado.» y «Ciclos anteriores» con el ciclo 1 y el caso «· No se cumplió». En el Cronograma, la dependencia de ese caso queda suspendida y sale de «Lo que debe el cliente». En B: «Este ciclo ya se cerró: recarga la página.» Cierra el ciclo 1 del proyecto de prueba. |
| 30 | ↻ Validar otra vez | Que Nexus recomiende SmartLoop al llegar a la entrega | 1) «Ver como» Juan Carlos Armijos › Para ti › «Esta semana». 2) Sal de «Ver como»: Selvatura › «SB Hotels \| CRM» › Resumen. | 1) «Propónle a Selvatura seguir con SmartLoop» (y otras cuentas en entrega), con «Ver la recomendación». 2) En el Resumen, aunque «Qué sigue» pida otra cosa, el bloque «Después de la entrega» con la recomendación, el porqué y «Dejar la tarea», «Abrir el alta» y «Descartar». Las de Ferretería Noelito y Cicadex (encargado que ya no está) le llegan a Alexander Vanegas. |
| 31 | ↻ Validar otra vez | Que el cliente vea la ruta del servicio, sin datos internos | Honda Costa Rica › «FACO · SmartLoop (prueba)» › Resumen › «Ruta del servicio para el cliente». Después, en kölbi › «Kolbi \| Sales Hub» (SmartLoop real, con acceso), «Subir al cliente» y abre el link de «Ruta del servicio» con la contraseña. | En el de prueba dice que un proyecto de prueba no se comparte con el cliente (ya no manda a «Acceso»). En kölbi: «Compartida desde el …» y «Volver a subir»; el cliente ve cada ciclo con sus fechas, su meta y los casos como barras, sin notas ni montos. |
| 57 | Por validar | Que una propuesta sea proyecto o servicio recurrente | Ventas › Propuestas › «Nueva propuesta» › «1 · Empresa»: hondafaco.com › «2 · Qué se cotiza»: «Un servicio recurrente» › «SmartLoop» › «3 · Trato y nombre»: «SmartLoop — Honda Costa Rica (prueba)» › «Crear la propuesta» › «Generar la propuesta». | «Cómo opera el servicio», «Cómo trabajamos» (las 5 etapas en un círculo) y «Nivel de servicio» vienen llenas desde el catálogo. «Inversión mensual» queda vacía: la llena Ventas. Al terminar, borra la propuesta. |
| 58 | Por validar | Que un proyecto pase a recurrente desde la ficha | 1) Selvatura › «SB Hotels \| CRM» › Resumen › tarjeta de la etapa › «Pasar a recurrente» › «SmartLoop», lee la propuesta y «Cancelar» (confirmar escribe en el proyecto real). 2) Honda Costa Rica › «PLAN DE CONTINUIDAD \| HONDA FACO» › Resumen. | 1) «Pasar a servicio recurrente» con «¿En qué etapa del ciclo arranca?» y «Nexus propone …», y la tarea de HubSpot que quedaría («Mover «SB Hotels \| CRM» en HubSpot a SmartLoop · …»). 2) La tarjeta «Servicio recurrente · SmartLoop» con «Qué toca ahora:», «Agendar en Calendar ↗», «Ya la agendé» y «Crear las N de los próximos dos meses». |
| 59 | ⏳ Espera la 57 | Que una propuesta recurrente ganada dé de alta el servicio | Con la propuesta de la 57: «Subir al cliente», abrir su link y «Aprobar propuesta». En la cabecera de la propuesta, «Dar de alta el servicio». No toques «Crear el proyecto» (lo crea en HubSpot). | Se abre «Nuevo proyecto» con hondafaco.com ya buscado y, en «Siguiente», el tipo «SmartLoop» marcado. Los casos de uso de la propuesta quedan en el plan al crear el proyecto. |

### 5 · Comisiones <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 88 | ✓ Validado por Claude 18 oct | Que el caso de Marco se entienda | Finanzas › Modelos › Comisiones › «Cómo funciona» › «Descuentos y recurrencia». | 33.600 − 2.400 = 31.200, y al 5 %: US$1.560 en vez de US$1.680. |
| 89 | ✓ Validado por Claude 18 oct | Que la calculadora reaccione | La misma sección, a la derecha: deja 3.000 y 2.800; después baja «Lo que se cerró al mes» de 2.700. | «Hoy» US$1.680 y «Con la propuesta» US$1.560. Bajo 2.700 aparece «Lo aprueba Marco». |
| 90 | ✓ Validado por Claude 19 oct | Que estén las preguntas para Marco | Finanzas › Modelos › Comisiones › «Cómo funciona», al final, «Decisiones pendientes». | Las tres primeras: «¿Un descuento de más del 10 % lo aprueba Marco?», «¿Lo recurrente pesa 1,2 veces en la meta?» y «¿El descuento sale entero de la base de la comisión, o solo una parte?». |
| 91 | ✓ Validado por Claude 18 oct | Que la simulación muestre cada venta | «Simulación» › caja «Descuento y valor de 12 meses». | Cada venta con Tipo, Al mes, Valor 12 meses, Descuento, Para la meta y «antes → ahora». |
| 92 | ✓ Validado por Claude 19 oct | Que un descuento baje la comisión | «Simulación», vendedor «Andrés Pinzón», caja «Descuento y valor de 12 meses», fila «RC Inmobiliaria - Acuerdo Macro» (ya en «Al mes», 2.800): escribe 2400 en «Descuento 12 meses». | «Lo escribiste tú · 6,7 %». La comisión pasa a «US$ 1.680,00 → US$ 1.560,00» («5 % de US$ 31.200») y «Por sus ventas» de US$ 9.420 a US$ 9.300. (Lo simulé con los datos de hoy.) |
| 93 | ✓ Validado por Claude 19 oct | Que las decisiones se puedan probar | Con el descuento de la 92, en «Lo que falta decidir»: «¿El descuento sale entero…?» › «La mitad» y después «Nada»; «¿Lo recurrente pesa 1,2 veces…?» › «Como cualquier venta». | «La mitad»: «US$ 1.680,00 → US$ 1.620,00». «Nada»: sin diferencia. «Como cualquier venta»: RC «Para la meta» baja de US$ 40.320 a US$ 33.600 y octubre sigue en 5 %. (Lo simulé con los datos de hoy.) |
| 94 | ✓ Validado por Claude 19 oct | Que un descuento grande pida aprobación | Ventas › Propuestas › «Grupo Monge - Nuevo tipo de objeto Deal» › «2 · Propuesta», Inversión, debajo de los servicios. No edites nada. | «Descuento del 13,4 % en los servicios ($900 en 12 meses): pasa el 10 % y lo aprueba Marco antes de enviarla.» y «Aprobar el descuento». (Lo calculé con la misma función de la pantalla.) |
| 95 | Por validar | Que la aprobación quede y el cliente no la vea | En «CreditForce · prueba (borrar)» (la de la 24) › «2 · Propuesta» › Inversión: «Montos en» USD; en Servicios, «precio de lista» 10000 y «dcto» 15%; en Licencias, «Agregar línea» «Sales Hub Professional» 1000; IVA «+ IVA (13%)». Espera a que se guarde y toca «Aprobar el descuento». Después «Descargar PDF», «Subir al cliente» y «3 · Compartir» › «Copiar el link», y ábrelo. | «Descuento aprobado.» y la franja dice «…lo aprobó Elías González el 19/10/2026, hasta el 15 %.» En el link y en el PDF no está la franja ni el botón; la línea sí muestra «−15%», $10,000 tachado y $8,500. |

### 6 · Tareas: las propuestas y el sprint <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 110 | Por validar | Que las tareas propuestas se lean fácil y se decidan en su reunión | Con «Ver como» Caroline Bersot, Tareas › Mis tareas. Toca el título de una propuesta; después «Decidir en la reunión». | Las propuestas agrupadas bajo «De «FACO Honda – Recurrente» · lun 12 oct · Honda Costa Rica», cada fila solo con el título, una línea gris («Honda Costa Rica · vence …») y «Descartar», «Más» y «Usar». El título abre el cajón con el contexto, la cita y la historia. «Decidir en la reunión» abre la reunión en «Lo que dejó esta reunión». |
| 111 | Por validar | Que lo que prometió el cliente sea un solo seguimiento | Con «Ver como» Caroline Bersot, Tareas › Mis tareas (y en «Para ti», «Tomarlo o decidir» de un compromiso de una reunión). | De Honda Costa Rica: «Seguimiento con Honda Costa Rica: N cosas que prometió Randall (lun 12 oct)», con «Lo que falta:» y un punto por cosa en el cajón, en vez de una tarea por recordatorio. «Tomarlo o decidir» lleva a la página de esa reunión, no a Mis tareas. |
| 112 | Por validar | Que una tarea interna se pueda llevar al calendario | Tareas › Mis tareas › semana actual › una tarea tuya sin agendar › «Agendar». Después abre una tarea en «Más adelante». | «Agendar» abre el diálogo para ponerla en tu calendario como bloque privado, sin invitados. En «Más adelante», el cajón dice «Para agendarla en tu calendario, ponla en una semana.» |
| 20 | Por validar | Que «Planifica tu semana» arme la semana por cuenta | «Ver como» Heiver Gomez › Tareas › «Planifica tu semana» (para mirar: con «Ver como» no se guarda nada). | «Lo que queda de esta semana: del 19 al 23 de octubre». Cada cuenta con «La acción de la semana» y «La reunión de la semana»; lo sugerido en azul con la chispa y «De dónde sale: …». (Usar, Agendar y «Ya lo guardé» los prueba Heiver con su usuario: guardar en Calendar invita al cliente de verdad.) |
| 21 | ⏳ La valida el equipo | Que un líder configure la reunión de su sprint | Tareas › «Semana del equipo» › «Equipo»: Marketing y después Desarrollo › «La reunión del sprint» › «Configurar». | Marketing: «Sprint planning de marketing · Los lunes · termina a las 10:30 · Planning», leída como Alejandra Ortega. Desarrollo: «SPRINT DEPT. SOFTWARE · Los lunes · termina a las 9:00 · Planning», leída como Alejandro Salas. Después de cada reunión, «Última: «…» · N propuestas»: como mucho 5 por persona, con chip «Sprint interno». |
| 22 | Por validar | Que cada reunión tenga su página y su correo de seguimiento | Sesiones › «Capacitación semana 3: Propiedades y estructura de información \| Total Finco» (jue 15 oct) › «Armar el correo». Ábrela en otra pestaña; cambia el texto en una y haz clic afuera, y después en la otra. | «Agenda» con el texto de la invitación, «Tareas de esta reunión» con Juan Carlos Armijos como responsable, el correo editable con «Copiar el correo» y «Abrir en tu correo» (no se envía), y «Próxima reunión» con «Agendar en Google Calendar ↗», «Ya la agendé» y «No hace falta». La otra pestaña avisa «El correo cambió: recarga la página para ver el de ahora.» |

### 7 · Propuestas: IVA, licencias y secciones <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 24 | Por validar | Que la propuesta traiga los casos de uso | Propuestas › «Nueva propuesta» › dominio credit-force.com › «Buscar la empresa», deja «Usarla como contexto», «Un proyecto» › «Implementación de HubSpot», nombre «CreditForce · prueba (borrar)» › «Crear la propuesta» › «Generar la propuesta». Repite con cemaco.co.cr. | En «2 · Propuesta», «Casos de uso incluidos», sin precio. CreditForce: «Sistematiza tu proceso comercial con HubSpot», «Alinea Marketing y Ventas…» y «Estandariza y controla tus cotizaciones comerciales». Cemaco: «Sistematiza…», «Reactiva tu inversión en HubSpot» y «Migra a HubSpot sin perder datos ni continuidad». Borra la de Cemaco; la de CreditForce sirve para la 27, 62, 63 y 95. |
| 25 | ✓ Validado por Claude 19 oct | Que el IVA se calcule bien en los dos sentidos | Inversión de una propuesta: una línea de servicios de 10000; «+ IVA (13%)»; después 11300 e «IVA incluido (13%)». | Con «+ IVA»: «IVA (13%) $1,300» y «Total con IVA $11,300». Con «IVA incluido»: «Monto sin IVA $10,000» e «IVA (13%) $1,300». (Las 14 pruebas de la cuenta pasan.) |
| 26 | ✓ Validado por Claude 19 oct | Que el IVA también vaya en lo mensual y en la forma de pago | Servicios 10000 (cobro único), licencia 1000 (mensual), «+ IVA»: el cierre de Inversión y «Forma de pago». | «Pago único + IVA» $10,000 · IVA $1,300 · total $11,300; «Por mes + IVA» $1,000 · IVA $130 · total $1,130. En «Forma de pago»: «Inversión de la implementación + IVA». |
| 27 | Por validar | Que lo publicado no cambie y el PDF lleve el IVA | (1) «RSM Costa Rica - Soporte Hubspot Continuo» › «2 · Propuesta» › Inversión, sin editar. (2) «Universidad Monterrey - Hubspot Refresh» › «3 · Compartir» › «Copiar el link», ábrelo, y «Descargar PDF». (3) El link y el PDF de «CreditForce · prueba (borrar)» después de la 95. | (1) El selector «IVA» con «⚠ No sabemos si el cliente es de Costa Rica…». (2) Sin IVA, igual que antes. (3) «Montos sin IVA (+ 13%)»; «Pago único + IVA» $8,500 · IVA $1,105 · total $9,605; «Por mes + IVA» $1,000 · IVA $130 · total $1,130, igual en el link y en el PDF. |
| 60 | ✓ Validado por Claude 19 oct | Que cada licencia tenga su precio de lista y su margen, sin que el cliente lo vea | En una propuesta, licencia de 1000 al mes; en «Interno · precio de lista del proveedor»: 800, «al mes», «La factura Smarteam (reventa)»; después 1200. | «Margen: $200 al mes (20 %)…» en verde; con 1200, «Pierdes: $200 al mes (-20 %)…» en ámbar. No aparece en el link ni en el PDF (lo cuidan 18 pruebas de la frontera). |
| 62 | Por validar | Que los módulos se agreguen con un clic | En «CreditForce · prueba (borrar)», al pie: «+ Agregar una sección propia», en «Qué clase de sección» «Casos de uso por proyecto» › «Agregar»; igual con «Comparación de licencias» y «Fases u opciones». En casos, «+ Proyecto» dos veces y «Desde el catálogo de casos»; en licencias, «Agregar plan» dos veces, «Recomendar» en uno y «Agregar fila»; en fases, «Agregar fase» dos veces y «Opciones (elegir una)». «Descargar PDF». | Pestañas 01 y 02 con sus casos; la tabla con «Recomendado» sobre el plan elegido; tarjetas 01, 02 que pasan a A, B. En el PDF, los dos proyectos uno debajo del otro, sin pestañas, y la tabla entera. |
| 63 | Por validar | Que un módulo hecho a mano se reuse en otra propuesta | En «El Molino Aditivos - CRM + Marketing», sobre «Arquitectura del sistema»: «⧉ Guardar como módulo» › «Guardar». En «CreditForce · prueba (borrar)»: «⧉ Agregar módulo de la biblioteca» › «Agregar» y «✨ Adaptar a esta empresa». Al final, «Archivar» en la biblioteca, «3 · Compartir» › «Revocar el link» y borra la propuesta de prueba. | Al guardar: «Este módulo trae datos de esta empresa», «Nombra a «molino».» y «Guardar igual». En la biblioteca, el aviso de que nombra a «molino». «Adaptar» muestra cada texto tachado y el nuevo, y «Aplicar N» cambia solo los textos; el diseño queda igual. |

### 8 · El chat de Nexus en la ficha <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 17 | Por validar | Que el chat trabaje solo sobre esa cuenta y no ofrezca lo que no se puede | Clientes › Ferretería Noelito › botón «Nexus». 1) «¿Qué está pendiente con esta cuenta?». 2) «Por WhatsApp me dijeron que mandan la base mañana»: desmarca la nota y el siguiente paso (escriben en HubSpot) y toca «Aplicar…» dos veces seguidas. 3) «Genera el diagnóstico de Ferretería Noelito \| Implementación CRM + Conexión SAP»: mira la línea y desmárcala, no la apliques. 4) «Genera el kickoff de Add-on desarrollo de misceláneos SAP». | 1) Solo habla de Noelito. 2) El botón se apaga mientras aplica y dice «Listo: 1 tarea creada.»; la tarea aparece una sola vez en La cuenta › Tareas, con «Chat de Nexus», vence mañana y la hace el cliente. 3) La línea dice «Generar Diagnóstico de «…» con la plantilla «Diagnóstico estratégico» — se arma en unos minutos…». 4) No entra a la lista y dice «⚠ No quedó en la lista: Este proyecto no tiene handoff generado: el kickoff sale del handoff.» |
| 18 | Por validar | Que «Sugerencias» diga qué hacer, con el mensaje listo | Después de la 17: en la ficha de Ferretería Noelito, toca «Sugerencias». | «Lo que Nexus te sugiere en Ferretería Noelito», con hasta 5 cosas. La de la 17 sale como «Recuérdale al cliente: …», con el mensaje de WhatsApp a la vista, «Copiar mensaje» y «Abrir WhatsApp». Las otras traen «Pedírselo a Nexus», sin mensaje. |
| 75 | Por validar | Que el chat lea las notas de HubSpot | Clientes › RC Inmobiliaria › botón «Nexus». Pregunta: «¿Qué notas y llamadas hay de esta empresa en HubSpot?». | Las 13 notas de HubSpot, de la más nueva a la más vieja (11 sep a 1 jul), con su día, quién la escribió (Marco Salas, Lorena Osorio, Alejandro) y el comienzo del texto. No hay llamadas: las 3 del 11 sep son notas sin autor que dicen «Llamada realizada…». Si responde solo con 5, contestó de memoria y no buscó: falla. |
| 76 | ✓ Validado por Claude 18 oct | Que lea una nota entera | El mismo chat: «Lee la primera entera». | La nota completa, con su fecha y su autor. |
| 77 | ✓ Validado por Claude 18 oct | Que conteste lo prometido sin mezclar empresas | Clientes › kölbi › chat: «¿Qué le prometimos al cliente que sigue abierto?». | Los compromisos abiertos de kölbi, nada de otra empresa. |

### 9 · La escala <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 51 | ✓ Validado por Claude 19 oct | Que las ediciones Turismo y Automotriz digan lo que pasa en esas industrias | Escala › Ventas › «Industria» › Turismo o Automotriz. | Publicadas en la 8.9.0 (19 oct, a tu nombre): las dos ediciones se ven en la escala y Nexus reconoce esas industrias al elegir la edición de una empresa. |
| 108 | Por validar | Que cada nivel de cada edición hable de su industria | Lee `docs/escala/personalizacion-de-las-ediciones.md` y su lista «Para mirar con calma» (4 criterios). Si te calza, la publico (8.9.1). Después: Escala › Ventas › vista «Matriz» › Industria «Turismo», fila 1.7 «Seguimiento de cotizaciones y reservas». | En Inicial: «Cuando una cotización no se contesta o una reserva no se paga, cada persona del equipo decide si insiste y cómo: no hay un paso acordado.» (Comprobado contra el documento: ninguna de las 720 celdas queda sin personalizar.) |
| 52 | Por validar | Que «Actualizar escala» funcione en un cliente sin proyecto ni preventa | Clientes › Forestales Latinoamericanos › La cuenta › La escala › «Actualizar escala». | Antes: «La empresa todavía no está posicionada en la escala». En el panel, «Sobre qué se ubica» = «La cuenta entera · Sin proyecto ni preventa» y «Venta» con sus 9 ventas, marcada la más reciente. Al tocar «Actualizar»: aviso «El agente está leyendo todo lo que Nexus sabe de la empresa…» y las fases junto al botón. Al terminar, «El agente propuso N niveles: revísalos acá abajo…». Cuesta US$0,05–0,20. |
| 53 | ↻ Validar otra vez | Que con varios proyectos se elija sobre cuál se ubica | Clientes › Plastimex › La cuenta › La escala › «Actualizar escala» › «Sobre qué se ubica». | «Plastimex | SAP + HUBSPOT» primero, con su venta ya marcada. Los cerrados («Plastimex - Limpieza de base de datos» y «PLASTIMEX | POTENCIANDO…») al final, con «· Terminado». Después «La cuenta entera». (Arreglado el 19 oct: los cerrados no se reconocían.) |
| 54 | Por validar | Que lo propuesto se confirme en la misma pantalla y quede en la historia | Al terminar la 52 (o en Tecnosagot, que ya tiene 2 propuestos): en el recuadro azul «El agente propone N niveles…», abre «Ver la frase y el nivel» en uno, toca «Usar» y después «Usar los N». | Cada nivel con su porqué, «De dónde sale» y la frase. Aviso «Nivel usado.» / «Usaste los N niveles.». Lo usado aparece en su área con «✓ Con evidencia». En «La escala en el tiempo», una fila de hoy «Se confirmó un nivel». Lo no usado no entra a la historia. |
| 55 | Por validar | Que se entienda con qué edición y perfil se mide | Clientes › Cemaco Internacional (la del proyecto «Cemaco Internacional - CRM») › La cuenta › La escala › «Se mide con la escala general» › «Corregir» › Industria «Ecommerce y retail», Cómo vende «Mixta», Después de la venta «Recompra» › «Guardar». | Antes: «Porque no hay una edición de su industria…». Después: aviso «Listo: la escala se lee con la edición y el perfil nuevos.», título «Se mide con la edición Ecommerce y retail y el perfil mixta · recompra», chip «La eligió una persona» y lo que cambia frente a la general. Queda guardado en la exploración de Cemaco. |
| 56 | Por validar | Que la historia se ate a la venta | Cemaco Internacional › La cuenta › La escala › «Guardar esta versión» › De qué momento es «Al vender» › «Guardar». | Aviso «Versión guardada.». En «La escala en el tiempo», la fila «27 sep 2026 · Al vender · Guardada a mano · venta «Cemaco Internacional - CRM»». |
| 19 | Por validar | Que la escala de la cuenta muestre su evidencia y su historia | Clientes › Cemaco Internacional (la del proyecto «Cemaco Internacional - CRM») › La cuenta › La escala. Toca una dimensión de Ventas. | Arriba: «Hoy · La Exploración de «Cemaco Internacional - CRM»». Ventas con «6 de 8 dimensiones con nivel · 6 con evidencia»; cada una con «✓ Con evidencia · Lo dijo el cliente en una reunión» y, al tocarla, la frase entre «». «La escala en el tiempo» con «Hoy» y «17 oct 2026 · Primera versión». «El camino de crecimiento»: «Ventas todavía no está ubicada: faltan 2 dimensiones…». |
| 45 | Por validar | Que la escala se arme desde un proyecto con handoff, sin preventa ni exploración | Clientes › ALMOTEC › La cuenta › La escala › «Actualizar escala» › «Actualizar» (espera sin salir). | Antes: «La empresa todavía no está posicionada en la escala». «Sobre qué se ubica» = «Almotec - CRM», con su venta. Mientras corre, las fases junto al botón. Al terminar, «El agente propone N niveles en la Exploración de «Almotec - CRM»», con «De dónde sale» (el handoff, HubSpot…). Crea la exploración del proyecto de ALMOTEC. |
| 46 | ✓ Validado por Claude 18 oct | Que la escala guarde su historia | En Cemaco › La cuenta › La escala, mira «La escala en el tiempo». Confirma un nivel en La escala de su Exploración, vuelve y toca «Guardar esta versión»; tócalo otra vez. | La versión del 17 oct ya está. Después de confirmar, «Qué cambió desde el 17 oct» dice qué dimensión subió o bajó. La segunda vez: «Esta versión ya estaba guardada: nada cambió desde la última». |
| 47 | Por validar | Que el camino de crecimiento proponga casos de uso | Clientes › pestaña «Prospectos» › CreditForce › La cuenta › La escala › «El camino de crecimiento» › «Sumar a los sugeridos» en «Sistematiza tu proceso comercial con HubSpot». Después La cuenta › Casos de uso. | Ventas Deficiente → Funcional, con lo que la frena y 3 casos. Aviso «Quedó como sugerido en La cuenta › Casos de uso.»; el botón pasa a «Ya está en Casos de uso» y el caso aparece en «Sugeridos». |
| 23 | Por validar | Que la escala de la preventa diga de dónde sale y qué explorar | Ventas › Preventa › CreditForce › La escala, en la pestaña de Ventas, sin ninguna dimensión abierta. | «De dónde sale cada nivel»: cada dimensión con su nivel, «✓ evidencia» u «○ hipótesis», de dónde sale y la frase. «Qué explorar en la próxima sesión», con sus rótulos («Hipótesis», «Lo frena»…) y «Llevar a la próxima sesión». |

### 10 · La ficha del cliente <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 13 | ↻ Validar otra vez | Que el riel separe herramientas y entregables | Clientes › «Teamnet» › en la columna de la izquierda, el proyecto «Teamnet - Reimplementación CRM». Después «kölbi» › «Kolbi \| Marketing y ventas» (es SmartLoop). | Teamnet: «HERRAMIENTAS DEL PROYECTO» (Resumen, Cronograma, Cuestionarios, Exploración, Ejecución) y debajo «ENTREGABLES» (Kickoff, Diagnóstico, Planificación, Integraciones), y «Ver 1 pieza más +» con la Entrega. kölbi: Resumen y Cronograma sin rótulo, y el grupo «CICLO · <etapa>» con sus piezas; sin Kickoff. |
| 14 | Por validar | Que generar un Diagnóstico y un Kickoff siga igual | Clientes › «Spectrum» › proyecto «Spectrum - MKT + SALES» (tiene handoff y no tiene diagnóstico). En el riel, «Ver N piezas más +» › Diagnóstico › «Activar» › «Generar diagnóstico»; espera. Después Kickoff › «Generar kickoff». | El diagnóstico con sus secciones (Diagnóstico, Situación actual, Objetivos, Desafío principal… hasta «El siguiente paso»). El kickoff llena Bienvenida, Objetivos, Alcance, Métricas, Próximos pasos…; «El equipo del proyecto», «Sesiones y horarios», «Canales de atención» y «Cierre» quedan con lo que ya tenían. |
| 15 | Por validar | Que la cuenta muestre sus reuniones y sus tareas por equipo | Clientes › «Honda Costa Rica» › La cuenta › Tareas. | Arriba, «Próximas reuniones · próximos 8 días» (o «Nada agendado… Se miró el calendario de …»). Debajo, el total de abiertas y por decidir; primero «Customer Success» (las de Caroline, con «Reunión con el cliente»), después «Ventas» (T-72 de Andrés, con chip HubSpot) y al final las hechas, plegadas. Nada «Solo para mí» de otra persona. |
| 16 | Por validar | Que el chip diga cómo está la cuenta, sin plata para el CSE | «Ver como» Alexander Vanegas › Clientes › «BLUESAT» › toca el chip «Señales de riesgo · 3» de la cabecera. Repite con «Ver como» Heiver Gomez. | Alexander: 3 motivos (el atraso por Smarteam, «8 facturas vencidas ($3,800)…» y las licencias sin asignar) y «Ver la cuenta en Éxito del cliente →». Heiver: «Señales de riesgo · 2», los mismos sin el de facturas y sin ese enlace. |

### 11 · Rentabilidad, la meta y el uso de Nexus <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 82 | ✓ Validado por Claude 18 oct | Que la meta se vea contra lo facturado | Éxito del cliente › Rentabilidad, arriba de las pestañas. | «La meta del año: US$ 2,3 M en 2027», una barra por año desde 2021 con lo facturado y «Qué falta para la meta de 2027» (US$2.183.572). ⚠ 2023 no tiene facturas y 2024 solo 8: la copia de Odoo de esos años parece incompleta. |
| 83 | Por validar | Que la meta se cambie desde la pantalla | Éxito del cliente › Rentabilidad › tarjeta «La meta del año» (arriba de las pestañas). Hoy dice «US$ 2,3 M en 2027». Toca «Cambiar la meta» › Año «2027», «Meta en dólares» «2.500.000», «Por qué (opcional)» «prueba» › «Guardar». Después toca «Ver la historia». Al terminar, vuelve a dejarla en 2.300.000 con «Cambiar la meta». | Aviso «Meta de 2027 guardada.». El título pasa a «US$ 2,5 M en 2027», la barra punteada dice «Meta · US$ 2,5 M» y «Por mes» dice US$ 208.333. «Ver la historia» (aparece recién con dos metas) muestra la de hoy con «prueba» y la del 18 oct. Cada cambio queda: la meta nunca se borra. |
| 37 | Por validar | Que la foto del margen quede guardada por mes | Éxito del cliente › Rentabilidad, período «Trimestre» (jul – sep 2026) › recuadro «De dónde salen los números». En la fila «jul 2026» toca «Tomar la foto». | Antes: «sep 2026» dice «Desde su foto · Tomada el 17 oct 2026 por el sistema»; jul y ago dicen «En vivo · Sin foto…»; arriba, «1 de 3 meses desde su foto; el resto, en vivo». Al tomarla: aviso «Foto tomada: N cuenta(s)…», jul pasa a «Desde su foto · Tomada el 19 oct 2026 por egonzalez» y arriba dice «2 de 3 meses desde su foto». La foto de julio queda guardada en producción. |
| 38 | Por validar | Que rehacer una foto pida motivo y la cuenta diga de dónde sale | Rentabilidad › «De dónde salen los números» › fila «sep 2026» › «Volver a tomar». Toca «Volver a tomar la foto» con el motivo vacío; después escribe «versión 2» y tócalo otra vez. Luego, en «Margen por cuenta», abre Librería Internacional y mira «Mes a mes». | Vacío: aviso rojo «Para volver a tomar la foto, escribe por qué.» y nada cambia. Con motivo: «Foto tomada: N cuenta(s)…» y la fila dice «Tomada el 19 oct 2026 por egonzalez · versión 2»; desaparece el aviso «sep 2026: Esta foto es de antes de contar las reuniones fuera de Meet…». En la cuenta, «De dónde sale» dice «Foto del 19 oct» en sep y «En vivo» en ago. |
| 84 | Por validar | Que las horas salgan solas, también fuera de Meet | Primero haz la 38. Rentabilidad › período «Mes» (sep 2026) › «Margen por cuenta»: filas de Librería Internacional y Teamnet, columna «Horas reales», y la barra «De dónde salen las horas». | En «Horas reales»: «N reun. (X fuera de Meet) · …» (Librería unas 24,5 h, Teamnet unas 9). En la barra: «Del calendario (X h fuera de Meet) · %». kölbi y Club de Amantes del Vino no llevan «(… fuera de Meet)». |
| 85 | ✓ Validado por Claude 18 oct | Que se vea el margen por persona | Rentabilidad › Costo de la hora › Por persona. | Las columnas «Generado» y «Margen», por nombre, en orden alfabético. |
| 86 | Por validar | Que Nexus lea los números y proponga | Rentabilidad › pestaña «Lectura de los números» › «Leer los números» (llama a Claude y guarda en producción). Espera hasta un minuto. En una propuesta toca «Desestimar», escribe por qué y confirma con «Desestimar». | Aviso «N señales · M propuestas nuevas.» (sin señales: «No hay nada que no progrese: no se llamó al modelo.»). Cada propuesta con qué ve, qué hacer e «Inversión: US$ …», con «Usar» y «Desestimar» (apagado hasta escribir el motivo). Al desestimar pasa a «Decidido en los últimos 90 días · Desestimada por … · tu motivo». |
| 87 | ✓ Validado por Claude 18 oct | Que el punto de equilibrio muestre la meta y lo que falta | Finanzas › Punto de equilibrio, al final. | La misma barra de la meta y una tabla mes a mes: Por facturar, Recurrencia, Proyectos, Expansiones y Falta. |
| 39 | Por validar | Que se vea qué usa y qué desestima cada equipo | Para ti › «Uso de Nexus» (arriba a la derecha). Pestaña «Equipo»: baja hasta «Qué usa cada equipo, en las últimas 4 semanas». Después abre «Para qué se usa». | Seis pestañas: Equipo · Para qué se usa · IA por cliente · Procesos de IA · Conclusiones · Reuniones sin grabar. En «Qué usa cada equipo», cada celda es «personas que la abrieron/personas del equipo» (Customer Success: «Para ti» 2/7) y «—» donde nadie la abrió. En «Para qué se usa»: «Qué usa y qué desestima cada equipo» con «usó · desestimó», y «Quién decide», por equipo y en orden alfabético. |
| 40 | Por validar | Que se vea cuánto cuesta la IA y si sirve | Uso de Nexus › «IA por cliente» (cambia entre «30 días» y «90 días», arriba a la derecha) › «Procesos de IA» › «Conclusiones». | IA por cliente: «Gasto en IA» unos US$ 92 en 30 días y unos US$ 139 en 90, en «Clientes y prospectos» y «Smarteam y aliados» con lo que propuso Nexus («N % usado»). Procesos de IA: «Proceso por proceso» con gasto, llamadas, errores y «% usado». Conclusiones: agrupadas, cada una con «Para mirar», «Para saber» o «Va bien». |
| 61 | ✓ Validado por Claude 18 oct | Que lo vendido llegue a Finanzas | Finanzas › Punto de equilibrio › «Licencias revendidas». | Las 6 propuestas ganadas y ninguna entra todavía, cada una con su porqué: Areyas, Cemaco y Spectrum no dicen quién factura la licencia ni su precio de lista; Multiquímica no tiene montos en la Inversión; Cayalá y RC Inmobiliaria no venden licencias. |

### 12 · El gasto de la IA <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 64 | ✓ Validado por Claude 18 oct | Que el gasto de la IA se vea por mes | Integraciones › Gasto en IA › «Por mes». | Agosto US$26,49 (desde el 17), septiembre US$33,27 y octubre US$78,73, lo automático y lo humano por separado. (Las cifras las comprobé yo; si quieres, mira el gráfico.) |
| 65 | ✓ Validado por Claude 18 oct | Que el tope diario esté a la vista | La misma pestaña, «El tope diario». | Automático US$10 y humano US$20, «solo avisa», cuántos días lo pasaron y el tope sugerido. |
| 66 | ✓ Validado por Claude 18 oct | Que se proyecte el gasto de los próximos meses | Pestaña «Proyección»: prende y apaga los escenarios. | Hoy unos US$86 al mes; con los hechos prendidos, unos US$98, y con los hechos y las tres palancas de ahorro, unos US$85 (sin los hechos, las palancas lo bajan a unos US$80). Nada se guarda al recargar. |
| 67 | Por validar | Que la factura de Anthropic se compare con lo medido | Integraciones › tarjeta de Claude › «Ver el gasto» › pestaña «Factura». En «Anotar la factura de un mes»: Mes «2026-09», «Monto (US$)» el total de septiembre de la consola de Anthropic, «Anotar». «Borrar» en la tabla la quita. | Aviso «Factura anotada.». En «Lo medido contra lo facturado», septiembre con «Medido» unos US$ 33,27, tu monto y la diferencia con su %. Si se aleja más de US$ 5 y más del 10 %, sale con ⚠ en ámbar. |

### 13 · Éxito del cliente y Equipo <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 41 | Por validar | Que la lista de limpieza de HubSpot diga quién arregla qué | Éxito del cliente › «Limpieza de HubSpot», arriba a la derecha. | Unas 27 cosas, con chips «Encargado que ya no está», «Sin encargado», «Servicio sin proyecto» y «Excliente con algo activo». Por persona: Alexander Vanegas (lidera el sprint) con la mayoría, cada una con «Abrir en HubSpot ↗» o «Abrir la cuenta», y Heiver Gomez con Wherex. («Etapa quieta» y «Sin actividad» todavía no aparecen: esos datos llegan con el deploy.) |
| 42 | ✓ Validado por Claude 18 oct | Que «Ver como» no deje escribir como otra persona | Equipo › una persona › «Ver como»; navega un poco y toca «Volver a mi usuario». | Nexus como lo ve esa persona, sin poder escribir como ella. «Volver a mi usuario» te devuelve. |

### Lo reviso yo después del deploy

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 103 | ⏳ Lo reviso yo después del deploy | Que el cobro automático corra cada mañana | Integraciones › «Jobs del servidor», el día siguiente del deploy, desde las 7:00. | «El cobro de lo pagado en Odoo y Mercury» con punto verde y la fecha de la corrida. |
| 81 | ⏳ Lo reviso yo después del deploy | Que la copia corra sola | Integraciones › «Jobs del servidor», el día siguiente del deploy, entre las 6:00 y las 20:00. | «La copia de los correos, notas y llamadas de HubSpot» con punto verde y la hora de la corrida. |

### Desde la terminal (opcional)

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 43 | ✓ Validado 17 oct | Que la foto de los meses pasados se pueda armar | `npx tsx scripts/fotografiar-meses-del-margen.ts` (lo corrí yo, en simulacro) | Nueve meses, de enero a septiembre, cada uno con lo cobrado y facturado, la planilla y las horas, y «Simulacro: no se escribió nada». |
| 44 | ✓ Validado 17 oct | Que el paso de «Continuidad» a SmartLoop encuentre los proyectos | `npx tsx scripts/migrar-continuidad-a-smartloop.ts` (lo corrí yo, en simulacro) | Ministerio de Economía y TEC, los dos en Diagnóstico, a confirmar con Customer Success. No escribe nada. |

Si algo no aparece como dice la tabla, mándame una captura.

## Después

Lo que dijiste en otros chats que querías más adelante:

- Las tareas que salen de la Planificación («crea estas propiedades, este pipeline»).
- El centro de comando de dirección.
- Procesos y Planificación: que el chat cambie el mapa, la puesta en marcha y las plantillas de propiedades.
- La auditoría del portal con un cliente piloto, con lo que hay que comprobar a mano.
- La escala: el test aparte detrás de un botón, la teoría en Documentación, guardar en Nexus los resultados del test de marketing y la versión 9.0.
- Cuestionarios con IA: que el cliente converse unos minutos con un chat que llena el formulario.
- Exportar un documento a Google Docs.
- Traer la facturación de Odoo de 2025 para comparar lo cobrado contra lo vendido.
- Que Nexus pueda escribir en Mercury para resolver inconsistencias.
- La hoja de ruta de Feedback a la vista del equipo.
- Los recorridos que faltan: Marketing, Sesiones, Documentación y Administración.
- Un portal de autoservicio para los clientes.
- Pruebas de punta a punta en el navegador.
- Decidir si se prende el vigía de Éxito del cliente, después de que Alex Vanegas revise la cartera.
