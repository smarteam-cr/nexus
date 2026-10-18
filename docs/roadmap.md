# Roadmap de Nexus

**Corte:** 2026-10-17

## Para qué

Hoy Nexus se usa poco y está desconectado: lo que más se usa es el kickoff y el cronograma, y la preventa también,
pero le faltan ajustes. El objetivo es que Nexus amarre los puntos: entrar a un cliente y ver todo lo que Smarteam
está haciendo con él.

- **Construimos todo y probamos al final.** El camino está en orden; tú decides qué se ejecuta y cuándo.
- **Sin tiempos ni semanas.** Cada paso se hace cuando lo pones a correr.
- **Los kickoffs y los diagnósticos no se tocan como datos.** Se pueden cambiar las pantallas, pero lo que ya existe se sigue consultando en el mismo lugar.

## Estado hoy

| Qué | Cómo está |
|---|---|
| Producción | Corre `7d7e92df` desde el 17 oct a las 22:02, hora de Costa Rica. Sana, con el esquema al día. |
| Por desplegar | En `main` y sin desplegar: la escala (ediciones Turismo y Automotriz sin publicar, «Actualizar escala»), las propuestas (proyecto o recurrente, licencias con su margen, módulos y biblioteca), el servicio recurrente en la ficha, el gasto de la IA por mes con su proyección y los arreglos de «Para ti» (agenda, cartera del CSE, exclientes). 714 pruebas en verde y tsc en 0. |
| En curso | Cinco sesiones en paralelo: A (la guía de la preventa), B (los correos y el timeline de HubSpot), C (la rentabilidad con agendas y tareas), D (las comisiones) y Finanzas (cobro automático, cuadre del año y menú). |
| La base | Tiene todo lo que necesita lo que está en `main`: los SQL del 18 oct ya se aplicaron (biblioteca de módulos, escala ligada a la venta, servicio recurrente y gasto de IA). |
| En rojo en producción | Un proyecto en un pipeline sin declarar, un cliente apuntando a una empresa fusionada en HubSpot y el corte de cobranza, que nunca corrió. |
| Revisión de código | Hecha el 17 oct sobre los 31 cambios de entonces: 57 problemas encontrados, unos 50 corregidos y en `main`. Ninguno mezclaba clientes. |

**Lo siguiente en todo Nexus:** lo que dejó la reunión con Marco (abajo, A a D), empezando por la guía de la preventa. Después, desplegar `main` (tú) y validar con el equipo (pestaña «Lo que validas», sección 10 para lo nuevo). Después del deploy armo las propuestas recurrentes internas de Cayalá, Grupo Inve, FACO (Honda Costa Rica) y kölbi. Yo corro lo que va después del deploy: cerrar las alertas sueltas, limpiar las reuniones con texto de otra, rescatar las transcripciones (la primera versión de la escala ya quedó guardada).

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

### A · La preventa lleva a la siguiente pregunta lógica <span class="estado">En curso</span>

Si el cliente ya hizo el diagnóstico, Nexus le dice al vendedor qué le falta preguntar, y nada más.

1. [en curso] Arriba de la guía, «Lo que ya sabemos»: en 3 a 5 líneas, lo que el cliente respondió en el diagnóstico y en las reuniones, con sus palabras, para no volver a preguntarlo.
2. [en curso] Lo que ya respondió no se vuelve a preguntar: la guía salta a la siguiente pregunta lógica, que es cuánto le afecta, cuánto le cuesta, cómo lo quiere resolver, cuándo y con qué. Si dijo que le duele la duplicidad de datos, se profundiza en sistemas; si dijo que no hace seguimiento, se pregunta cuánto le baja la tasa de cierre.
3. [en curso] Solo lo que falta, unas 5 preguntas: si un dato ya está (los tiempos, por ejemplo), no hay más preguntas de ese tema. Las repreguntas no se muestran; se abren si hacen falta.
4. [en curso] Siempre cierra con la pregunta de cierre y el siguiente paso, según lo que falta para proponer.
5. [en curso] Escrita como la nota de HubSpot que le sirvió a Marco: corta, en el lenguaje del cliente y directa a lo que le duele.
6. [en curso] Probada con casos reales antes de soltarla: la sesión 2 de Larce y los prospectos que lleguen por el diagnóstico.

### B · Los correos y el timeline de HubSpot, en el contexto de la cuenta <span class="estado">En curso</span>

Todo conectado: las reuniones, los correos, el timeline de HubSpot y lo que se ingresa a mano, para que no se pase un seguimiento.

1. [en curso] Los correos con el cliente y el timeline de la empresa y sus contactos en HubSpot entran a la memoria de la cuenta y a la lectura de cada reunión. Hoy solo el vigía mira algunos correos.
2. [en curso] Lo que se le prometió al cliente por correo (una reunión, una entrega, una fecha) queda como compromiso, igual que lo que sale de una reunión.
3. [en curso] Si un compromiso con fecha no está en el calendario ni en Tareas a las 48 horas, avisa al CSE y a quien lidera Customer Success.
4. [en curso] Las notas y los acuerdos que se ingresan a mano entran al mismo contexto que leen los agentes, la preventa y el chat.

### C · La rentabilidad, conectada con las agendas y las tareas <span class="estado">En curso</span>

Nexus ya sabe, sin que nadie marque tiempo, qué reuniones tiene cada persona y con qué cliente. Esa es la base del margen.

1. [en curso] Las horas por cuenta salen solas del calendario y de las tareas (lo hecho y cuánto tomó), y con eso el margen por cuenta y por persona.
2. [en curso] La meta del año como barra (US$2,3 millones en 2027), contra lo facturado en los años anteriores, con lo que haya.
3. [en curso] La línea de «por facturar» del punto de equilibrio, la que sube al final: qué recurrencia y qué expansiones faltan para que suba, y cuánto.
4. [en curso] Una lectura de los números: Nexus detecta lo que no progresa y propone qué hacer y cuánto invertir; una persona valida.

### D · Comisiones que cuiden el valor de la cuenta <span class="estado">En curso</span>

El caso de Marco: bajar una recurrencia de US$3.000 a US$2.800 al mes regala US$2.400 al año, y hoy igual se paga el
100 % de la comisión. Mi propuesta, para validar con Marco:

1. [en curso] La comisión de un contrato recurrente se calcula sobre su valor de 12 meses, y **el descuento sale de la base**: base = lo cerrado − lo descontado. En el caso de Marco: 12 × US$2.800 = US$33.600, menos los US$2.400 descontados = US$31.200. Al 5 % son US$1.560 en vez de US$1.680. El vendedor también pone parte del descuento.
2. [en curso] Un descuento de más del 10 % lo aprueba Marco en la propuesta, y queda escrito quién lo aprobó.
3. [en curso] La recurrencia pesa más en la meta que un proyecto único (por ejemplo, 1,2 veces), porque es lo que hace crecer la cuenta.
4. [en curso] Una expansión grande cuenta por su tamaño total, para no empujar a vender recurrencia chica en vez de una expansión grande.
5. Cerrarlo con Marco y construir el módulo de comisiones en Nexus (el paso 1 a 4 queda en la página del modelo, para revisarlo con él).

## La siguiente serie

Lo que pediste el 17 oct, analizado contra el código y contra las propuestas reales. Primero se construye todo y después
lo validas: cada iniciativa suma sus validaciones a «Lo que validas» cuando queda en producción. El orden es el que
propongo: primero la escala, porque las propuestas y el servicio recurrente se apoyan en ella. Tú decides.

**Cómo se construye** (vale para todas):

- **Lo que cambia seguido es configuración, no código.** Los servicios recurrentes (SmartLoop, administración de sitio web, soporte de HubSpot, contenido mensual y los que vengan: SEO, AEO, redes, IA en marketing) son un catálogo: nombre, qué incluye, su cadencia y sus rutinas. Sumar uno es una entrada nueva, no una pantalla nueva.
- **Una sola puerta por cosa.** El contexto de la escala sale del mismo cargador que ya usan los agentes; lo vendido (servicio y licencias) sale de la propuesta y Finanzas lo lee de ahí, sin copiarlo a mano.
- **Nada corre solo ni para todos.** Lo que usa IA lo dispara una persona por cliente; lo masivo es un script en simulacro que te muestro antes de aplicar.
- **SQL solo aditivo, antes del deploy**, cada tabla nueva con su seguridad y el chequeo del esquema en verde.
- **Cada regla, una función pura con su prueba**, y una guarda que frena el merge si alguien la saltea.
- **Cada agente nuevo, medido**: su costo por cliente y por proceso en «Uso de Nexus» desde el primer día.
- **Sin sobreingeniería**: si algo se resuelve con lo que ya existe (las tareas, la agenda por enlace, el motor de las propuestas), se usa eso.

### 1 · La escala que entiende el negocio del cliente <span class="estado">Por desplegar</span>

Hoy hay cuatro ediciones (ecommerce y retail, banca, educación, inmobiliaria) y la edición y el perfil se eligen solos, pero no queda claro por qué ni qué cambian. Para que la escala le sirva a quien explora y a quien posiciona, tiene que representar el modelo de negocio de cada cliente.

1. [hecho] Dos ediciones nuevas: Turismo y Automotriz. Las escribo como borrador con las reglas de la escala, pasan sus pruebas y tú las revisas antes de publicarlas.
2. [hecho] Que se entienda cómo se elige: en la escala de cada empresa, «Se mide con la edición X y el perfil Y, porque…» (su industria, cómo vende, si recompra, si la relación es continua), con lo que cambia de la general y un clic para corregirlo.
3. [hecho] Que el modelo de negocio guíe a quien explora (las preguntas de la sesión salen de su edición y su perfil) y a quien posiciona (cada nivel se lee con las palabras de su industria).
4. Revisar y publicar la 8.9.0 (tú): el resumen está en `docs/escala/ediciones-turismo-automotriz.md`, con el perfil habitual de cada edición y tres criterios que piden más en Funcional.

### 2 · La escala de cada empresa: «Actualizar escala» con todo el contexto <span class="estado">Por desplegar</span>

Hoy el agente lee menos de lo que dice: en un proyecto no lee lo vendido, las minutas, las tareas, el cronograma ni HubSpot; no vuelve a leer las reuniones ya leídas; y un cliente sin proyecto activo ni preventa no tiene botón. La historia guarda el proyecto y el ciclo, pero no la venta, y siempre con la fecha de hoy.

1. [hecho] Un botón «Actualizar escala» en La cuenta › La escala para todo cliente: con proyecto, con preventa o solo con negocios ganados. Lo toca una persona por cliente; nunca corre solo ni para todos.
2. [hecho] Que lea todo lo que Nexus sabe de la cuenta: lo vendido (negocios ganados, propuesta comercial y handoff), la memoria (minutas, hechos, notas del equipo y la ficha), las tareas, el cronograma, los cuestionarios, el test y HubSpot, con las reuniones ya leídas en resumen. Sin marcar nada como leído ni cambiar la guía de la exploración.
3. [hecho] Confirmar en la misma pantalla: cada nivel propuesto con su porqué y su fuente, «Usar» uno por uno o «Usar todos». Lo propuesto nunca entra a la historia; lo confirmado, sí.
4. [hecho] La historia amarrada a la venta: cada versión dice de qué venta, preventa, proyecto o servicio sale, y se puede fechar en su momento («al vender», «al arrancar», «hoy»), para ver cuánto se movió la empresa desde que nos compró.
5. [hecho] Con varios proyectos o ventas, elegir sobre cuál se ubica.

### 3 · Propuestas: proyecto o recurrente, licencias aparte y módulos que se reusan <span class="estado">Por desplegar</span>

Revisé las propuestas: hay 66 secciones personalizadas en 23 empresas, armadas a mano por Andrés y Marco. Se repiten: casos de uso a implementar (7), arquitectura y diagramas (16), qué contiene el acuerdo y SLA (8), antes y después, comparación de licencias (Starter contra Pro) y forma de pago. Cayalá y Grupo Inve ya se vendieron como servicio recurrente con SmartLoop, todo en HTML hecho a mano.

1. [hecho] Al crear una propuesta se elige: proyecto (se hace una vez) o servicio recurrente, y cuál servicio del catálogo.
2. [hecho] La plantilla de servicio recurrente, con lo que ya vendieron a mano: qué contiene el acuerdo, cómo opera (cadencia y rutinas), el ciclo (para SmartLoop, con tu diseño), el nivel de servicio, antes y después, y la inversión mensual. La de proyecto queda como hoy.
3. [hecho] Licencias y servicios siempre separados: cada licencia con su precio de lista, que es público, y lo que se le cobra al cliente. Si cobramos más, la diferencia queda a la vista para Ventas y Finanzas; el cliente nunca la ve.
4. [hecho] Al ganarse, lo vendido llega solo a Finanzas: cuánto es servicio, cuánto es licencia y qué margen deja cada licencia. Finanzas puede volver a leer las propuestas ya ganadas y recalcular los ingresos de meses pasados (hoy eso se carga a mano, como con kölbi).
5. [hecho] Los módulos que más se repiten pasan a ser secciones de Nexus que se agregan, se quitan y se mueven con un clic, que la IA llena y que salen bien en el PDF: casos de uso, arquitectura, comparación de licencias, fases u opciones, forma de pago, antes y después, nivel de servicio, qué contiene el acuerdo y el ciclo SmartLoop.
6. [hecho] Una biblioteca para lo demás: cualquier sección personalizada se guarda como módulo y se usa en otra propuesta, con «Adaptar a esta empresa» (la IA cambia los textos sin tocar el diseño). Sin código a la medida.
7. FACO, Colby, Cayalá y Grupo Inve: lo que ya se les vendió se arma como una propuesta recurrente nueva, interna, sin tocar la que firmaron. De ahí sale su servicio en Nexus. El script ya está y corrió en simulacro; lo aplico después del deploy (FACO es Honda Costa Rica; falta confirmar que «Colby» es kölbi).

### 4 · El servicio recurrente, dentro de la ficha del cliente <span class="estado">Por desplegar</span>

No un sistema para manejar ciclos: una guía para que el CSE entienda un servicio recurrente y lo lleve con cadencia. La ficha del cliente sigue igual (escala, exploración, encuestas); solo cambia un poco si el servicio es recurrente y cuál es.

1. [hecho] Cada proyecto dice si es recurrente y de qué servicio del catálogo. Con eso cambian el Resumen y la guía; lo demás de la ficha queda igual.
2. [hecho] La guía del servicio en el Resumen: qué se entrega, con qué cadencia y qué toca ahora. En SmartLoop, las cinco etapas como un ciclo, con dónde va la cuenta y qué falta para pasar a la siguiente.
3. [hecho] Las rutinas: al arrancar, Nexus propone las reuniones fijas del servicio, para guardarlas en Google Calendar por enlace, y las tareas que se repiten para el CSE.
4. [hecho] Al ganarse una propuesta recurrente, el proyecto nace con su servicio, su cadencia y sus casos de uso. Reemplaza los scripts de hoy.
5. [hecho] Pasar un cliente actual a recurrente desde la ficha: eliges el servicio, Nexus propone dónde va y arma las rutinas; lo de antes queda como historia, sin mezclarse.
6. Pasar los recurrentes de hoy uno por uno con su CSE: Continuidad, administración de sitio web y contenido.
7. Definir contigo la cadencia y las rutinas de cada servicio del catálogo.

### 5 · Finanzas: terminar de simplificar <span class="estado">En curso</span>

**Decidiste el 18 oct:** cobrar solo, cada día, lo que Odoo y Mercury dan por pagado y conciliado; el menú de los Super Admin sin lo de quien registra; María José concilia cada mañana (con una cuenta nueva que das de alta tú); y primero el libro, después el menú. Caja neta lo decide Alex. La construcción espera que arranques su tarjeta.

No encontré en ningún plan la frase «simplificar demasiado». Lo más cercano es el rediseño de Finanzas del 3 oct: un solo menú que cambia según quién entra (registra, supervisa o dirección).

**Lo que ya se hizo:** Cobranza quedó en cuatro pestañas (Quién nos debe, Cobros, Clientes, Alertas) y sus reportes pasaron a Reportes; una sola lista de lo que no cuadra en Conciliación; la Planilla en una sola entrada; las hojas viejas de Costos salieron del menú.

**Lo que se deshizo a propósito:** el 8 oct pediste que los Super Admin vean todo. Desde entonces la vista solo cambia la pantalla de entrada, y tu menú de Finanzas tiene 20 entradas.

1. [hecho] El documento para decidir y validar: `docs/finanzas-simplificacion.md`, con lo planeado, lo hecho, lo que dijeron Marco y Alex, 8 decisiones y 18 pasos para el 3004.
2. [en curso] Retirar las páginas viejas de Costos (Costos, Fijos, Herramientas y la segunda página de Tarjetas): llevan a su página nueva.
3. [en curso] Cobranza › Odoo, Mercury e Importar dentro de Conciliación, o fuera si ya no se usan.
4. [en curso] Reportes de seis entradas a tres: Rentabilidad vive en Éxito del cliente, y Tipo de cambio e Integraciones van dentro de otra página.
5. [en curso] Comisiones de vendedor y Aguinaldo dentro de Planilla.
6. [hecho] Decidido: el menú de los Super Admin queda sin lo de quien registra (Pendientes, Comisiones de vendedor y Aguinaldo sueltos).
7. [en curso] Cobrar solo lo que Odoo y Mercury dan por pagado y conciliado con el banco, cada día, firmado por el sistema.
8. [en curso] Que el punto de equilibrio cuente solo lo del año, y explicar la diferencia de ventas sin cobranza (US$218.000 en Nexus contra los ~US$90.000 que esperaba Marco).
9. Dar de alta a María José (tú, en Equipo) con lo que necesita para conciliar.

### 6 · El gasto de la IA: verlo, proyectarlo y bajarlo <span class="estado">Por desplegar</span>

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

## Lo que configuras tú en Google Workspace

El 53 % de las reuniones con clientes del último mes no tiene transcripción. Una parte la arregla Nexus; esto es de la
consola de Google:

1. Gemini «Tomar notas» y «Transcribir la reunión» activados para toda la organización, Desarrollo incluido, y que arranquen solos al empezar la reunión.
2. Que las notas se compartan con todos los invitados de la organización, no solo con quien las tomó.
3. En las reuniones que organiza un cliente, que alguien del equipo active las notas al entrar.

## Lo que validas tú

Cada validación dice qué tiene que funcionar, cómo comprobarlo y qué tiene que pasar, todo en el 3004. Dime el número y
cómo te fue, y lo marco: **↻ Otra vez** (cambió después de que lo validaste: va primero), **⏳ En arreglo** (lo estoy corrigiendo: espera), **Por validar**, o **✓ Validado**
con la fecha (va al final). Para entrar como otra persona: Equipo › la persona › «Ver como»; «Volver a mi usuario» te
devuelve.

### 1 · «Para ti»: Ventas y Customer Success

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 1 | ✓ Validado 17 oct | Que cada persona vea su propio inicio | Con «Ver como» Andrés, abre «Para ti»; después repite con un CSE. | Arriba, los números del día; al centro, la agenda como Google Calendar; a la derecha, «Tu cartera» (Andrés) o «Tus cuentas» (el CSE). |
| 2 | ⏳ En arreglo | Que las notas de una reunión no se pierdan y sean privadas | Con tu usuario, toca en la agenda una reunión tuya con un cliente: una de hoy y una que ya pasó. Escribe algo en «Tus notas», cierra el panel y vuelve a abrirlo. Después, con «Ver como» Liliana, abre una reunión de ella. | En las dos (la de hoy y la pasada) aparece «Tus notas», y la nota sigue ahí al volver a abrir. Con «Ver como» Liliana, el panel trae su guía y lo pendiente, pero no tus notas ni las de ella, y no deja escribir: «Ver como» es solo lectura. |
| 3 | ✓ Validado 17 oct | Que una cuenta sin acción ni reunión aparezca | Con «Ver como» un CSE que tenga una cuenta sin tarea esta semana, mira la primera tarjeta de «Para ti». | La línea «Sin acción ni reunión» con esa cuenta y el botón «Agendar». |
| 4 | ✓ Validado 17 oct | Que Marketing vea sus tareas internas | Con «Ver como» alguien de Marketing, abre «Para ti». | Sus tareas internas, ordenadas por ámbito (Smarteam, SmartAgro). |
| 5 | ✓ Validado 17 oct | Que «Lo que importa hoy» tenga como mucho 5 cosas | Abre «Para ti» con tu usuario y mira la primera tarjeta. Si una cuenta tiene varias cosas, abre su «+N». | Como mucho 5 cosas, una por cuenta. Lo demás de esa cuenta queda plegado en «+N en esta cuenta», y lo que no entra va a «También para hoy». |
| 6 | ✓ Validado 17 oct | Que se pueda crear un evento desde la agenda | Toca una hora vacía de hoy (por ejemplo, las 10). Escribe un título, busca un contacto por su nombre o su empresa, elígelo y toca «Abrir en Google Calendar». | Aparece un bloque azul «borrador» de una hora. Al elegir el contacto, la cuenta se llena sola. Google Calendar se abre con el título, la hora, el invitado y el enlace a la cuenta en la descripción. El bloque queda «abierto en Calendar, sin guardar», con «Ya lo guardé». |
| 7 | ⏳ En arreglo | Que «Agendar» arme la reunión en Nexus antes de abrir Calendar | Con «Ver como» el CSE de la validación 3, toca «Agendar» en «Sin acción ni reunión». Revisa el borrador y toca «Abrir en Google Calendar». Repite desde la lista entera de «Para ti». | El borrador aparece en la agenda en la primera hora libre de trabajo, con el mismo formulario de «Crear evento»: título, hora, cuenta y contacto, todo editable. Google Calendar se abre solo al tocar «Abrir en Google Calendar». Desde la lista entera, cada cuenta trae una hora distinta. |
| 8 | ⏳ En arreglo | Que los huecos respeten el horario, sugieran con qué avanzar y se puedan soltar | Mira la agenda después de las 16:00 o en fin de semana. En un día con espacio, toca el «Hueco libre» punteado; toca afuera; vuelve a tocarlo y toca la X; tócalo otra vez y toca «Ponerla en la agenda». | Un sábado o un domingo la agenda muestra la semana siguiente. Fuera de lunes a viernes de 8 a 5 no aparece ningún hueco. Al tocar un hueco: «Con qué avanzar: T-…». Tocar afuera o la X lo suelta y el hueco vuelve a como estaba. «Ponerla en la agenda» deja el borrador en esa hora. |
| 9 | Por validar | Que los viernes invite a planificar la semana | Un viernes, abre «Para ti» como CSE, CSL o alguien de Desarrollo. | Debajo de «Lo que importa hoy», «Es viernes: planifica la semana que viene», que lleva a «Planifica tu semana» (validación 20). |
| 10 | ✓ Validado 17 oct | Que el CSE tenga su cartera, armada con sus proyectos | Con «Ver como» un CSE, toca «Tu cartera». Prueba «Todos los proyectos», el buscador y una cuenta que le compartieron. | Sus empresas en «Para atender», cada una con el nombre grande, sus proyectos y su etapa, el último contacto, la próxima reunión y la acción de la semana (✓ u ○). Una compartida dice «Compartida», sin color ni monto. |
| 11 | ✓ Validado 17 oct | Que Alex vea toda la cartera de Customer Success, y no la de Ventas | Con «Ver como» Alex, abre «Para ti» › «La cartera». Abre «Por CSE»; después filtra «Pipeline» › Desarrollo. | No aparece la cartera de Ventas ni «Negocios traídos de HubSpot». «Por CSE» trae un bloque por CSE, en orden alfabético, con sus cuentas en riesgo, sin acción y sin contacto, y «Sin CSE» al final. Con el filtro, solo las empresas con un proyecto de desarrollo. |
| 12 | Por validar | Que el monto solo lo vea quien vende | Con «Ver como» Andrés, abre «Para ti» › «Tu cartera» y busca una empresa con un negocio abierto. Después, con «Ver como» un CSE que lleve esa empresa, mírala en su cartera. | Andrés ve «N negocios abiertos · US$ …» en la fila. El CSE ve la misma empresa sin el monto. (Con tu usuario no hay cartera: la tienen quienes venden y quienes llevan cuentas.) |
| 48 | Por validar | Que nada quede fuera de «Lo que importa hoy» | Con «Ver como» un CSE con muchas cuentas en riesgo o sin acción, abre «Para ti». Después, con «Ver como» Alex. | Si no caben, una línea «Estabilizar N cuentas» que abre la lista entera. A Alex le llega para repartir o acompañar. |
| 49 | Por validar | Que el CSE planifique la acción desde su cartera y vea el uso de HubSpot | Con «Ver como» un CSE, «Tu cartera» › una cuenta sin acción › «Planificar acción». | La acción queda en la agenda. Cada cuenta dice si el uso de HubSpot sube o baja, por los hubs que compró, y el botón dice qué hace en vez de «Abrir cuenta». |
| 50 | Por validar | Que un excliente salga de todo | Cuando Alex marque Wherex como «Excliente»: Éxito del cliente › Cartera › «Fuera de la cartera». | Wherex aparece ahí, marcado «Excliente», y no está en ninguna alerta, cartera ni en «Lo que importa hoy». |

### 2 · La ficha del cliente

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 13 | Por validar | Que el riel separe herramientas y entregables | Abre un cliente › un proyecto de implementación y mira la columna de la izquierda. Después abre un proyecto SmartLoop. | Arriba, «Herramientas del proyecto» (Resumen, Cronograma, Cuestionarios, Exploración, Ejecución); debajo, «Entregables» (Kickoff, Diagnóstico, Planificación, Integraciones, Entrega). En el SmartLoop, igual que antes: el grupo «Ciclo · etapa». |
| 14 | Por validar | Que generar un Diagnóstico y un Kickoff siga igual | En un proyecto con handoff, toca «Generar» en el Diagnóstico y después en el Kickoff. | Se generan y se ven igual que siempre; el kickoff con sus secciones de equipo y horarios intactas. |
| 15 | Por validar | Que la cuenta muestre sus reuniones y sus tareas por equipo | Abre un cliente activo › La cuenta › Tareas. | Arriba, «Próximas reuniones» con el día, la hora y quién de Smarteam va. Debajo, las tareas por equipo (Customer Success primero): abiertas, por decidir y hechas en 30 días, con quién la tiene, para cuándo y de dónde viene. Lo «Solo para mí» de otros no aparece. |
| 16 | Por validar | Que el chip diga cómo está la cuenta, sin plata para el CSE | Con «Ver como» Alex, abre una cuenta en rojo o amarillo y pasa el mouse por el chip. Repite con «Ver como» el CSE de esa cuenta. | El color y hasta tres motivos. El CSE ve lo mismo, pero sin montos. |
| 17 | Por validar | Que el chat trabaje solo sobre esa cuenta y genere un entregable | En la ficha, toca «Nexus». Pregunta «¿Qué está pendiente con esta cuenta?». Escribe «Por WhatsApp me dijeron que mandan la base el viernes» y toca «Aplicar» dos veces seguidas. Después pide «Genera el diagnóstico del proyecto X» y aplícalo. | Contesta solo con lo de esa cuenta. La tarea aparece en La cuenta › Tareas como «Chat de Nexus», una sola vez. El diagnóstico queda en la lista con la plantilla «Diagnóstico estratégico» y aparece en el proyecto en unos minutos. En un proyecto sin handoff, el kickoff no se ofrece y dice por qué. |
| 18 | Por validar | Que «Sugerencias» diga qué hacer, con el mensaje listo | En la ficha, toca «Sugerencias». | Hasta 5 cosas que te tocan en esa cuenta, cada una con el mensaje de WhatsApp listo para copiar. |

### 3 · Tareas y reuniones

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 20 | Por validar | Que «Planifica tu semana» arme la semana por cuenta | Tareas › «Planifica tu semana» como un CSE. En una cuenta, cambia el día de la reunión sugerida, toca «Agendar», guárdala en Calendar y toca «Ya lo guardé». En otra, toca «Usar» o «Crear la acción». | Una fila por cuenta con la acción y la reunión de la semana; lo que sugiere Nexus en azul, con «De dónde sale». Google Calendar se abre con título, hora, invitados y objetivo. Después de guardarla: «Quedó en tus tareas como reunión con la cuenta». La acción queda con su T- y el día. |
| 21 | Por validar | Que un líder configure la reunión de su sprint | Tareas › Semana del equipo › «La reunión del sprint» › Configurar. Elige la reunión semanal, deja «Quiénes están» vacío y guarda. | Solo ofrece reuniones recurrentes de puertas adentro en las que estuviste. La próxima reunión de esa serie deja como mucho 5 tareas por persona, marcadas «Sprint interno». |
| 22 | Por validar | Que cada reunión tenga su página y su correo de seguimiento | Sesiones › una reunión con un cliente de esta semana. Toca «Armar el correo». Abre la misma reunión en otra pestaña, cambia el correo en las dos y guarda. | La agenda, los avisos y las tareas con su responsable. «Armar el correo» deja un borrador que no se envía. La próxima reunión sugerida, con su enlace a Google Calendar. La segunda pestaña avisa «El correo cambió: recarga la página». |

### 4 · Ventas

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 25 | Por validar | Que el IVA se calcule bien en los dos sentidos | En una propuesta de un cliente de Costa Rica, en la Inversión pon una línea de $10.000 y elige «+ IVA (13%)»; después cambia la línea a $11.300 y elige «IVA incluido (13%)». | Con «+ IVA»: «IVA (13%) $1,300» y «Total con IVA $11,300». Con «IVA incluido»: «Monto sin IVA $10,000» e «IVA (13%) $1,300», y el total no cambia. |
| 26 | Por validar | Que el IVA también vaya en lo mensual y en la forma de pago | En una propuesta con una implementación y una licencia mensual, elige «+ IVA» y mira «Forma de pago». | «Pago único + IVA» y «Por mes + IVA», cada uno con su IVA y su total. En «Forma de pago», «Inversión total + IVA». |
| 27 | Por validar | Que lo publicado no cambie y el PDF lleve el IVA | Abre la Inversión de un cliente sin país conocido. Después abre por su link una propuesta ya publicada y baja el PDF; publica la de la validación 25 y haz lo mismo. | Sin país: el selector está, con «⚠ No sabemos si el cliente es de Costa Rica…». La publicada de antes se ve igual, sin IVA. La de la validación 25 trae «Montos sin IVA (+ 13%)» y el mismo desglose, en el link y en el PDF. |

### 5 · La escala de cada empresa

La escala ya no es solo de la preventa: cada empresa tiene la suya en La cuenta › La escala, se arma con lo que Nexus
ya sabe (también sin preventa) y guarda su historia. El 17 oct guardé la primera versión de las 7 empresas con niveles
confirmados: CreditForce, Grupo Servica, Quálitas, Tecnosagot, Grupo Monge, Cemaco Internacional y Distribuidora Larce.

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 19 | Por validar | Que la escala de la cuenta muestre su evidencia y su historia | Abre Cemaco Internacional › La cuenta › La escala. Toca «Regenerar con el agente». | Cada nivel con de dónde sale (la fuente y la frase). «La escala en el tiempo» con sus versiones fechadas. El agente solo propone: no cambia los niveles confirmados. Abajo, el camino de crecimiento con casos sugeridos. |
| 45 | Por validar | Que la escala se arme desde el contexto de un cliente, sin preventa | Abre un cliente con un proyecto con handoff y sin exploración (no Wherex) › La cuenta › La escala. Toca «Activar el agente en «…»» y espera unos minutos sin salir. | Sin posición, «La empresa todavía no está posicionada en la escala» con el botón. Al tocarlo, «El agente está leyendo todo lo que Nexus sabe de la empresa…» y la fase en curso. Al terminar, niveles propuestos (en azul) con su porqué, sacados del handoff, los cuestionarios y HubSpot; se confirman en La escala de la Exploración del proyecto. |
| 46 | Por validar | Que la escala guarde su historia | En Cemaco › La cuenta › La escala, mira «La escala en el tiempo». Confirma un nivel en La escala de su Exploración, vuelve y toca «Guardar esta versión»; tócalo otra vez. | La versión del 17 oct ya está. Después de confirmar, «Qué cambió desde el 17 oct» dice qué dimensión subió o bajó. La segunda vez: «Esta versión ya estaba guardada: nada cambió desde la última». |
| 47 | Por validar | Que el camino de crecimiento proponga casos de uso | En Cemaco › La cuenta › La escala, baja a «El camino de crecimiento» y toca «Sumar a los sugeridos» en un caso. Abre La cuenta › Casos de uso. | Qué sigue en cada área y por qué, con los casos de la biblioteca que lo mueven. «Quedó como sugerido en La cuenta › Casos de uso», y ahí aparece como sugerido. |
| 23 | Por validar | Que la escala de la preventa diga de dónde sale y qué explorar | Ventas › Preventa › una con reuniones leídas › La escala. | «De dónde sale cada nivel» y «Qué explorar en la próxima sesión». |
| 24 | Por validar | Que la propuesta traiga los casos de uso | Propuestas › Nueva, con una empresa que tenga preventa › Generar. Repite con una sin preventa. | La sección «Casos de uso incluidos». Sin preventa, los sugeridos de la biblioteca, sin precio. |

### 6 · SmartLoop

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 28 | Por validar | Que el cronograma del ciclo pida confirmar el arranque | FACO › el proyecto de prueba › Cronograma › «Armar las fases». Confirma la fecha de arranque y toca «Aprobar esta versión». | Sin fecha de arranque, primero pregunta «El cronograma arranca el … ¿Lo confirmas?». El cronograma del ciclo queda arriba del Gantt con su versión aprobada. |
| 29 | Por validar | Que cerrar el ciclo saque lo que no se cumplió | En Aprendizaje, marca un caso «no cumplido» y toca «Cerrar el ciclo». Después, en una pestaña que tenía el ciclo abierto, cambia la meta. | El ciclo queda en «Ciclos anteriores» y la fase de ese caso queda suspendida (ya no sale atrasada). La pestaña vieja avisa «Este ciclo ya se cerró: recarga la página». |
| 30 | Por validar | Que Nexus recomiende SmartLoop al llegar a la entrega | Abre un proyecto de implementación en «Entrega» › Resumen y toca «Dejar la tarea». En otro en «Entrega», toca «Abrir el alta». Mira «Para ti» del CSE encargado. | En «Qué sigue»: «propónle a … seguir con SmartLoop», con el porqué y los botones. «Dejar la tarea» crea la tarea y la recomendación desaparece. «Abrir el alta» abre Nuevo proyecto con «SmartLoop» elegido. En «Para ti» del CSE, la misma recomendación. |
| 31 | Por validar | Que el cliente vea la ruta del servicio, sin datos internos | En un SmartLoop con ciclo › Resumen, toca «Subir al cliente» en «Ruta del servicio para el cliente». Abre el enlace del cliente con `?next=ciclos` y entra con la contraseña. En un proyecto que no es SmartLoop, abre «Acceso». | «Compartida desde el …» y «Volver a subir». El cliente ve cada ciclo con sus fechas y su meta, los casos como barras y «De tu parte: …», sin notas ni montos. En el que no es SmartLoop, la fila «Ruta del servicio» no aparece. |

### 7 · Finanzas

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 32 | Por validar | Que solo se cobre lo pagado que confirmas | Finanzas › Conciliación › «Lo pagado». Desmarca una cuota y confirma con tu firma. | Las cuotas que Odoo y Mercury dan por pagadas, con el día del pago. Las de Mercury sin entrada de plata van a «Pagadas sin el día del pago» y no se cobran. Solo se cobran las marcadas. |
| 33 | Por validar | Que los montos de las licencias se lean bien | Punto de equilibrio › «Licencias revendidas» › kölbi › Editar. Escribe «70.000» en «Lo que se le paga» y mira «Para decidir». | kölbi con su parte de servicio y el mismo margen. Debajo del campo, «Se guarda: 70.000». En «Para decidir», cómo cuentan las licencias. |
| 34 | Por validar | Que las comisiones de Stripe y transferencias sumen como gasto | Conciliación › Gastos y Mercury › «Gastos financieros». Confirma una. | Las comisiones para confirmar una por una. Lo confirmado suma al punto de equilibrio como gasto financiero. |
| 35 | Por validar | Que Mercury esté en la facturación por cliente | Cobranza › Odoo › Facturación por cliente. Busca un cliente de Mercury y toca «Ver el detalle» en una factura. | Los clientes de Mercury junto a los de Odoo, y el detalle de cada factura. |
| 36 | Por validar | Que las facturas de Odoo se peguen solas | Abre Cobranza › Odoo. | Las facturas que Odoo da por emitidas ya están pegadas a su cuota, sin hacer nada. |

### 8 · Dirección: Rentabilidad y Uso de Nexus

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 37 | Por validar | Que la foto del margen quede guardada por mes | Éxito del cliente › Rentabilidad › «De dónde salen los números». En un mes, toca «Tomar la foto». Después elige «Trimestre». | Antes de tomarla, cada mes dice «En vivo». Al tomarla: «Foto tomada: N cuentas» y el mes pasa a «Desde su foto», con la fecha y tu nombre. En el trimestre: «1 de 3 meses desde su foto; el resto, en vivo». |
| 38 | Por validar | Que rehacer una foto pida motivo y la cuenta diga de dónde sale | En un mes con foto, toca «Volver a tomar» sin motivo y después con motivo. Abre una cuenta y mira «Mes a mes». | Sin motivo no deja; con motivo, «Tomada el… · tu motivo». En la cuenta, «De dónde sale» dice «Foto del …» o «En vivo». |
| 39 | Por validar | Que se vea qué usa y qué desestima cada equipo | Para ti › «Uso de Nexus». Baja hasta el final de «Equipo» y abre «Para qué se usa». | Seis pestañas. «Qué usa cada equipo» con «3/7» en cada cruce. «Qué usa y qué desestima cada equipo» y «Quién decide» por nombre, agrupado por equipo. |
| 40 | Por validar | Que se vea cuánto cuesta la IA y si sirve | Abre «IA por cliente» (cambia entre 30 y 90 días), «Procesos de IA» y «Conclusiones». | El gasto de IA por empresa con lo que se usó; por proceso, con errores y «% usado»; y conclusiones cortas «Para mirar», «Para saber» o «Va bien», cada una con su enlace. |

### 9 · Éxito del cliente y Equipo

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 41 | Por validar | Que la lista de limpieza de HubSpot diga quién arregla qué | Éxito del cliente › «Limpieza de HubSpot», como Alex o con tu usuario. | Lo que hay que poner al día en HubSpot, por responsable, cada cosa con su enlace. |
| 42 | Por validar | Que «Ver como» no deje escribir como otra persona | Equipo › una persona › «Ver como»; navega un poco y toca «Volver a mi usuario». | Nexus como lo ve esa persona, sin poder escribir como ella. «Volver a mi usuario» te devuelve. |

### 10 · Lo nuevo (después del deploy)

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 51 | Por validar | Que las ediciones Turismo y Automotriz digan lo que pasa en esas industrias | Lee `docs/escala/ediciones-turismo-automotriz.md` y decide el perfil habitual y los tres criterios que piden más en Funcional. | Si te calza, la publico (8.9.0); si no, me dices qué cambiar. |
| 52 | Por validar | Que «Actualizar escala» funcione en un cliente sin proyecto ni preventa | Un cliente sin proyectos (no Wherex) › La cuenta › La escala › «Actualizar escala». | «Sobre qué se ubica: La cuenta entera» y la lista de sus ventas. Al tocar «Actualizar», «Leyendo todo lo que Nexus sabe de la cuenta…» y después cuántos niveles propuso. |
| 53 | Por validar | Que con varios proyectos se elija sobre cuál se ubica | Un cliente con varios proyectos › La escala › «Actualizar escala». | Todos sus proyectos en la lista, los terminados al final; al elegir uno, la venta de ese trato ya viene marcada. |
| 54 | Por validar | Que lo propuesto se confirme en la misma pantalla y quede en la historia | En el recuadro azul «El agente propone N niveles», toca «Usar» en uno y «Usar los N». | Cada nivel con su porqué y «De dónde sale». Lo usado baja al área y en «La escala en el tiempo» queda una versión de hoy. Lo propuesto no entra a la historia. |
| 55 | Por validar | Que se entienda con qué edición y perfil se mide | En La escala, el recuadro «Se mide con…» › «Corregir». | La edición y el perfil, el porqué, lo que cambia frente a la general, y al corregir se guarda. |
| 56 | Por validar | Que la historia se ate a la venta | «Guardar esta versión» › «De qué momento es: Al vender». | En «La escala en el tiempo», una fila con la fecha en que se ganó la venta: «Al vender · venta «…»». |
| 57 | Por validar | Que una propuesta sea proyecto o servicio recurrente | Ventas › Propuestas › «Nueva propuesta» › «Un servicio recurrente» › SmartLoop › «Generar». | Las secciones «Cómo opera el servicio», «Cómo trabajamos» (el ciclo de 5 etapas en círculo) y «Nivel de servicio» ya llenas, y la inversión mensual aparte de las licencias. |
| 58 | Por validar | Que un proyecto pase a recurrente desde la ficha | Ficha de un proyecto de implementación › Resumen › tarjeta «Etapa» › «Pasar a recurrente». | Eliges el servicio, Nexus propone la etapa y la tarea de HubSpot. Después, la tarjeta «Servicio recurrente» con «Qué toca ahora», «Agendar en Calendar ↗» y «Crear las N de los próximos dos meses». |
| 59 | Por validar | Que una propuesta recurrente ganada dé de alta el servicio | Una propuesta recurrente aprobada › «Dar de alta el servicio». | Abre «Nuevo proyecto» con la empresa y el servicio ya puestos, y el proyecto nace con sus casos de uso. |
| 60 | Por validar | Que cada licencia tenga su precio de lista y su margen, sin que el cliente lo vea | Una propuesta con licencias (Cemaco o Spectrum) › Inversión, editando: anota el precio de lista y quién la factura. Después ábrela como cliente y baja el PDF. | En el editor, «Margen: $… al mes (… %)» en verde, o «Pierdes: …» en ámbar. En el enlace del cliente y en el PDF no aparece nada de eso. |
| 61 | Por validar | Que lo vendido llegue a Finanzas | Finanzas › Punto de equilibrio › «Licencias revendidas». | «Lo vendido según las propuestas ganadas», con cada propuesta, su servicio, sus licencias y por qué entra o no entra. |
| 62 | Por validar | Que los módulos se agreguen con un clic | Una propuesta › «+ Agregar una sección propia». Agrega «Casos de uso por proyecto», «Comparación de licencias» y «Fases u opciones», y exporta el PDF. | Pestañas por proyecto con «Desde el catálogo de casos»; la tabla de planes con el recomendado; tarjetas 01, 02 o A, B. En el PDF salen todos los casos y la tabla entera. |
| 63 | Por validar | Que un módulo hecho a mano se reuse en otra propuesta | Sobre una sección de HTML pegado › «Guardar como módulo». En otra propuesta › «Agregar módulo de la biblioteca» › «Adaptar a esta empresa». | Aviso en ámbar si el HTML nombra a la otra empresa. «Adaptar» muestra cada texto antes y después, y al aplicar cambia solo los textos; el diseño queda igual. |
| 64 | Por validar | Que el gasto de la IA se vea por mes | Integraciones › Gasto en IA › «Por mes». | Este mes con lo que daría al ritmo de hoy, el mes pasado, lo que ahorró la caché y cuánto cuesta cada reunión leída. Agosto, septiembre y octubre en el gráfico, con lo automático y lo que pidió una persona en colores distintos. |
| 65 | Por validar | Que el tope diario esté a la vista | La misma pestaña, «El tope diario». | Automático US$10 y humano US$20, «solo avisa», cuántos días lo pasaron y el tope sugerido. |
| 66 | Por validar | Que se proyecte el gasto de los próximos meses | Pestaña «Proyección»: prende y apaga los escenarios. | Unos US$86 al mes; con los hechos prendidos sube a unos US$98, y con las tres palancas de ahorro baja a unos US$85. Nada se guarda al recargar. |
| 67 | Por validar | Que la factura de Anthropic se compare con lo medido | Pestaña «Factura»: anota un mes con su monto. | Aparece en la tabla al lado de lo medido; una diferencia grande sale con ⚠. |

### Desde la terminal (opcional)

| # | Estado | Qué validas | Pasos | Resultado esperado |
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
