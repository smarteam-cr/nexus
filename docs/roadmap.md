# Roadmap de Nexus

**Corte:** 2026-10-20

## Para qué

Que Nexus amarre los puntos: entrar a un cliente y ver todo lo que Smarteam está haciendo con él, y que cada persona sepa qué le toca hoy.

- **Esta pestaña tiene solo lo que falta.** Lo que ya está en producción está en «Hecho»; cómo funciona Nexus, en «Cómo funciona Nexus».
- **Sin tiempos ni semanas.** Cada cosa se hace cuando la pones a correr.
- **Los kickoffs y los diagnósticos no se tocan como datos.**

## Estado hoy

| Qué | Cómo está |
|---|---|
| Producción | Corre `da1fd3bf` desde la noche del 21 oct: el modelo de comisiones cerrado con Marco, las comisiones de partners en cero y estimado o real, lo pagado que se cobra cada hora y al tocar «Actualizar», y la cuota cargada con IVA que se pega a su factura. Sana, con el esquema al día. |
| Por desplegar | Nada: todo `main` está en producción (12.623 pruebas en verde, tsc en 0). |
| En rojo en producción | 4 invariantes: el pipeline de Secure Title, «TEC- AE» fusionada en HubSpot y el corte de cobranza apagado (con su decisión abajo), y desde el 21 oct INV16(a): 2 reuniones de Meet leídas antes de ocurrir (un evento movido de fecha después de leerse, el caso conocido de KNOWN-ERRORS). |
| Pruebas | 17 para ti (pestaña «Pruebas para personas»; desde el 20 oct solo las que piden tu criterio), 81 que valida el equipo al usarlas, 77 con IA sobre los datos y 48 ya validadas por ti. |

## Cómo va Nexus

Funciona bien con los datos (ninguna mezcla de clientes, la agenda igual a Google Calendar, las copias al día), pero todavía se usa poco. Los números salen de la pasada de validación (`docs/validacion-2026-10-19.md`) y los mido cada semana.

**Los indicadores de éxito** (número de hoy → meta):

| # | Indicador | Hoy | Meta |
|---|---|---|---|
| 1 | Personas operativas (CS, Ventas, Dev, Marketing) que entran 3 días o más por semana | 0 de 14 (hay 4 días de datos; nadie pasó de 2) | 10 de 14 en 4 semanas |
| 2 | Cuentas de la cartera con siguiente paso (tarea con fecha o reunión en 8 días) | 14 de 48 (29 %) | 80 % |
| 3 | Lo que propone Nexus que una persona decide antes de que venza | 7,4 % | 50 % |
| 4 | Reuniones con cliente que dejan texto para leer | 72 % | 90 % |
| 5 | Costo de IA por persona activa al mes | unos US$13 | que baje mientras sube el 1 |

## Lo que decides tú

Sin esto, algo sigue mal o no se puede validar:

1. **El pipeline `924878469` de HubSpot** («Integración con Secure Trust | Secure Title»): Nexus no lo conoce y por eso Alejandro Rodríguez sale como CSE de Secure Title.
2. **«Empresa para pruebas»** está como cliente en la cartera (aparece en lo de la CSL): ¿la marco como interna o se cierra su proyecto? Y «Test CSE (vista Heiver)» sigue activo con rol CSL.
3. **La cartera del CSE:** ¿cuenta las cuentas que le compartieron, o solo las que lleva? (Juan Carlos: 13 contra 16.)
4. **Las tareas de seguimiento en «Por asignar · Customer Success»** de una cuenta sin CSE (4 en Secure Title): ¿pasan solas al encargado nuevo?
5. **«Fomento Urbano» y «Fomento Urbano S.A.»** parecen la misma empresa: ¿las fusiono?
6. **«TEC- AE»** apunta a una empresa fusionada en HubSpot: ¿la reapunto (`scripts/reapuntar-empresa-fusionada.ts`)?
7. **La reunión del sprint:** sacar el tope de 5 tareas por persona y leer también su conversación (unos US$0,014 por reunión).
8. **La escala 8.9.1:** revisarla para publicarla (prueba 108).
9. **El modelo de comisiones:** cerrarlo con Marco (las tres preguntas de la página del modelo).
10. **El correo de la mañana:** mandarlo por Gmail o por un proveedor.
11. **La página de la sesión:** la minuta, los pedidos fuera de alcance, la ficha y las novedades todavía se deciden en «Lo que dejó esta reunión». ¿Pasan también a Tareas (o a la agenda), para salir del todo de esa página?

## Lo que falta, por tema

### Customer Success y el servicio recurrente

1. Que Caroline y Valentina abran el primer ciclo de Honda y de kölbi en Nexus: hoy SmartLoop no tiene uso real y no hay nada que validar.
2. Pasar los recurrentes de hoy uno por uno con su CSE: Continuidad, administración de sitio web y contenido.
3. Definir contigo la cadencia y las rutinas de cada servicio del catálogo.
4. Armar las propuestas recurrentes internas de FACO (Honda Costa Rica), kölbi, Cayalá y Grupo Inve con lo que ya se les vendió, sin tocar la que firmaron (el script ya corrió en simulacro).
5. Volver a generar con «Rehacer desde cero» los handoffs que leyeron el texto de otra reunión: RC Inmobiliaria, AMC, DISTELSA, Grupo Printer, REMPRO y Teamnet.

### Ventas y comisiones

1. Pagar las comisiones desde Nexus (el modelo con Marco se cerró el 21 oct; hoy es «Cómo funciona» y la simulación). Antes, que Cobranza sepa cuándo termina un servicio y si una renovación fue a tiempo.
2. Licencias y precio de cada caso de uso de la biblioteca.

### Finanzas

1. Prender el corte de cobranza (`COBRANZA_CRON_ENABLED`): sin él, Reportes y algunas alertas de cobranza son una foto del 24 jul.

### Marketing y Desarrollo

1. Que Desarrollo empiece a entrar a Nexus (0 de 3 en la última semana) y prenda las notas de Gemini en su sprint.
2. Marketing: rehacer el test de marketing con la escala nueva, uno corto para atraer leads y uno completo para usarlo con el cliente.
3. Desarrollo: un lugar para sus proyectos, con las estimaciones que se escriben en HubSpot.

### Lo que conecta a los equipos

1. El correo de la mañana con lo mismo que «Para ti», bien probado antes de mandarlo.
2. El gasto de la IA: pasar el clasificador a Haiku después de comparar los dos modelos, y conectar el avance y la ficha a los lotes.

### Deuda que encontró la validación

1. Unir los contenedores «Información del cliente» repetidos (Ministerio de Economía tiene 5, AMC 2 y Librería 2), con su script en simulacro.
2. Un tope de reintentos para el job de la lectura de los números de Rentabilidad.
3. La fecha de cancelación de Cicadex en HubSpot (29 ene 2029).
4. Las 176 reuniones que la IA asignó en 8 proyectos y Juan Carlos tiene por revisar.
5. «Ver como»: dos lecturas que escriben sin autor (`deal-line-items` y `hubspot/read`) y la cookie sin el prefijo `__Host-`.
6. Los desplegables de las tablas y las fichas (`CeldaSelect`, el selector de ícono y la lectura de la cuenta) todavía se dibujan dentro de su contenedor: pueden quedar tapados como le pasaba al menú del avatar.
7. El chat todavía no puede ocultar secciones del kickoff.

## Lo que configuras tú

**En HubSpot:** darle a la app de Nexus el permiso de correos (`sales-email-read`) y reconectar HubSpot desde Integraciones. Sin él, Nexus lee las notas y las llamadas, pero no los correos, y no ve lo que se le prometió al cliente por correo. Los pasos están en el RUNBOOK.

**En Google Workspace** (el 28 % de las reuniones con clientes no deja texto):

1. Gemini «Tomar notas» y «Transcribir la reunión» activados para toda la organización, Desarrollo incluido, y que arranquen solos.
2. Que las notas se compartan con todos los invitados de la organización.
3. En las reuniones que organiza un cliente, que alguien del equipo active las notas al entrar.

## Más adelante

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


## Pruebas para personas

Las que hace una persona en la pantalla: tú, o alguien del equipo con su usuario (la prueba dice quién). Solo lo que necesita una sesión abierta o criterio humano, por tema. Lo que la IA comprueba con los datos está en «Pruebas con IA»; lo que hace alguien del equipo con su usuario dice quién. Dime el número y cómo te fue, y lo marco. Para entrar como otra persona: Equipo › la persona › «Ver como» (solo para mirar).

- **↻ Validar otra vez**: lo corregí, o cambió después de que lo validaste.
- **Por validar**: te toca a ti. Solo lo que pide tu criterio de producto (desde el 20 oct).
- **⏳ La valida el equipo: <persona>**: la valida quien lo usa cada día, al usarlo; si algo falla, llega por Feedback.
- **⏳**: espera a alguien del equipo o a que pase algo (una reunión, un deploy). El motivo va en el estado.

Las áreas van por prioridad: **Alta** (lo usa el equipo cada día, toca plata o lo ve el cliente), **Media** y **Baja** (solo dirección).

### Para ti y la agenda <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 265 | ⏳ La valida el equipo: Caroline Bersot | Que los pendientes se cierren desde el panel | Con tu usuario › «Para ti» › en la agenda, una reunión con un cliente › «Pendiente»: «✓ Hecha» en uno, «Agendar» en otro y «Desestimar» en un tercero (escribe un motivo). | El primero desaparece y en Tareas queda hecho. «Agendar» cierra el panel y deja un bloque azul en tu agenda: «Cliente – nombre corto \| Espacio interno». El tercero pide «¿Por qué ya no va?» y queda «Ya no se hará». Si hay propuestas, al final dice «N tareas por decidir en Tareas». |
| 266 | ⏳ La valida el equipo: Caroline Bersot | Que «Ya la agendé» pida la reunión del calendario | Con tu usuario › «Para ti» › «Cuentas sin siguiente paso» › «Ya la agendé» en una cuenta con una reunión agendada (aunque sea en tres semanas). Busca la reunión por el título y elígela. Recarga. | Un buscador con tus reuniones de los próximos 30 días, las de esa cuenta primero. Al elegir: «Listo: la reunión el … es el siguiente paso de …» y la línea se va. Al recargar no vuelve. Con una reunión que no está en tu calendario no aparece en la lista. |
| 270 | ⏳ La valida el equipo: Caroline Bersot | Que el espacio libre nombre las tareas para una persona | «Para ti» › agenda › un «Espacio libre» › «Con qué usar este espacio»; después «Bloquear en Calendar». | Cada tarea dice «Cliente – nombre corto» (sin «T-…»). Calendar se abre con «Cliente – nombre corto \| Espacio interno». Una tarea interna lleva su espacio en vez del cliente. |
| 275 | Por validar | Que la agenda muestre solo el horario de trabajo | «Ver como» Caroline Bersot › «Para ti» › la agenda en «Semana»; abajo, «Ver el calendario completo». | La grilla va de 8:00 a 17:00, sin «Fuera de la oficina» de la tarde ni de la noche. El botón dice cuántos eventos quedaron fuera; al tocarlo se ve todo y cambia a «Ver solo de 8:00 a 17:00». |

### Tareas <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 20 | ⏳ La valida el equipo: Caroline Bersot | Que «Planifica tu semana» arme la semana por cuenta | «Ver como» Heiver Gomez › Tareas › «Planifica tu semana» (para mirar: con «Ver como» no se guarda nada). | «Lo que queda de esta semana: del 19 al 23 de octubre». Cada cuenta con «La acción de la semana» y «La reunión de la semana»; lo sugerido en azul con la chispa y «De dónde sale: …». (Usar, Agendar y «Ya lo guardé» los prueba Heiver con su usuario: guardar en Calendar invita al cliente de verdad.) |
| 21 | ⏳ La valida el equipo | Que un líder configure la reunión de su sprint | Tareas › «Semana del equipo» › «Equipo»: Marketing y después Desarrollo › «La reunión del sprint» › «Configurar». | Marketing: «Sprint planning de marketing · Los lunes · termina a las 10:30 · Planning», leída como Alejandra Ortega. Desarrollo: «SPRINT DEPT. SOFTWARE · Los lunes · termina a las 9:00 · Planning», leída como Alejandro Salas. Después de cada reunión, «Última: «…» · N propuestas»: como mucho 5 por persona, con chip «Sprint interno». |
| 22 | ⏳ La valida el equipo: Caroline Bersot | Que cada reunión tenga su página y su correo de seguimiento | Sesiones › «Capacitación semana 3: Propiedades y estructura de información \| Total Finco» (jue 15 oct) › «Armar el correo». Ábrela en otra pestaña; cambia el texto en una y haz clic afuera, y después en la otra. | «Agenda» con el texto de la invitación, «Tareas de esta reunión» con Juan Carlos Armijos como responsable, el correo editable con «Copiar el correo» y «Abrir en tu correo» (no se envía), y «Próxima reunión» con «Agendar en Google Calendar ↗», «Ya la agendé» y «No hace falta». La otra pestaña avisa «El correo cambió: recarga la página para ver el de ahora.» |
| 111 | ⏳ La valida el equipo: Caroline Bersot | Que lo que prometió el cliente sea un solo seguimiento | Con «Ver como» Caroline Bersot, Tareas › Mis tareas (y en «Para ti», «Tomarlo o decidir» de un compromiso de una reunión). | De Honda Costa Rica: «Seguimiento con Honda Costa Rica: N cosas que prometió Randall (lun 12 oct)», con «Lo que falta:» y un punto por cosa en el cajón, en vez de una tarea por recordatorio. «Tomarlo o decidir» lleva a la página de esa reunión, no a Mis tareas. |
| 112 | ⏳ La valida el equipo: Caroline Bersot | Que una tarea interna se pueda llevar al calendario | Tareas › Mis tareas › semana actual › una tarea tuya sin agendar › «Agendar». Después abre una tarea en «Más adelante». | «Agendar» abre el diálogo para ponerla en tu calendario como bloque privado, sin invitados. En «Más adelante», el cajón dice «Para agendarla en tu calendario, ponla en una semana.» |
| 135 | ⏳ La valida el equipo: Alexander Vanegas | Que «Por asignar» no llene las tareas de cada CSE | «Ver como» Caroline Bersot › Tareas › «Mis tareas», sección «Por asignar · Customer Success». | Llega plegada con «21». Al abrirla, los recordatorios van en «Rápidas y seguimientos», agrupados por cuenta. |
| 136 | ⏳ La valida el equipo: Alexander Vanegas | Que quien lidera vea «Por asignar» abierto | «Ver como» Alex Vanegas › Tareas › «Mis tareas». | «Por asignar · Customer Success» llega abierta. |
| 137 | ⏳ La valida el equipo: Andrés Pinzón | Que Nexus sugiera cerrar lo viejo, sin cerrar solo | Andrés Pinzón con su usuario: arriba de «Mis tareas», «Nexus sugiere cerrar 3 tareas que ya pasaron y nadie tocó» › «Revisar»; desmarca T-38 y «Cerrar las 2». | Aparecen T-2, T-38 y T-106, cada una con «Era para el…». Las dos marcadas dejan de verse y T-38 sigue. |
| 138 | ⏳ La valida el equipo: Caroline Bersot | Que el panel de una tarea diga si guardó | Una tarea tuya › cambia «Qué hay que hacer» y espera un segundo; cierra y vuelve a abrir. | Al pie: «Sin guardar…», «Guardando…» y «Guardado». El texto quedó. |
| 139 | ⏳ La valida el equipo: Caroline Bersot | Que una nota no se pierda al cerrar rápido | «Para ti» › una tarea tuya › escribe en «Notas» y cierra el cajón enseguida; vuelve a abrirla. | La nota quedó guardada. |
| 155 | ⏳ La valida el equipo: Lidia Flores | Que Lidia recupere lo que el tope dejó afuera | Lidia Flores con su usuario › Tareas › «Mis tareas», arriba de lo que espera tu decisión. | «De «Sprint planning de marketing» · lun 19 oct: 1 tarea tuya quedó sin proponer…» con «Revisar Nexus» y «Proponérmela». |
| 156 | ⏳ La valida el equipo: Alejandra Ortega | Que Alejandra recupere sus 4 | Alejandra Ortega con su usuario › el mismo lugar › «Proponérmelas». | Las 4 (Elaborar Reportes SAP · Montar Google Search · Entregar Casos Éxito · Enviar Copies Videos). Al tocar: «Te llegaron 4 propuestas más. Decide tú.» y aparecen en lo que espera su decisión, bajo la reunión. |
| 160 | ⏳ La valida el equipo: Caroline Bersot | Que marcar una tarea como hecha sea al instante | Tu usuario › Tareas › «Mis tareas» › «Esta semana» › toca el círculo de una tarea. | Se marca en el acto, sin esperar. |
| 161 | ⏳ La valida el equipo: Caroline Bersot | Que deshacer no diga que otra persona la cambió | La misma tarea: toca el círculo otra vez enseguida, varias veces rápido. También en «Hechas (2 semanas)» y en «Para ti» › «Tus tareas de hoy». | Se marca y se desmarca en el acto y nunca sale «Otra persona cambió esta tarea…». Con una tarea de HubSpot, en HubSpot queda el último estado que marcaste. |
| 163 | ⏳ La valida el equipo: Caroline Bersot | Que el estado del cajón cambie al instante | Abre una tarea (el cajón) › «Estado»: «Hecha» y enseguida «Pendiente». | El botón cambia al instante y queda en «Pendiente», sin el aviso. Al pie, «Guardado». |
| 268 | ⏳ La valida el equipo: Caroline Bersot | Que las propuestas se decidan por reunión en Tareas | Con tu usuario › Tareas › «Por decidir», en un grupo con dos o más propuestas, «Usar las N». | Cada grupo dice «De «reunión» · fecha · cliente», sin «Decidir en la reunión». «Usar las N» las deja en tu semana y dice «Quedaron N en tu semana». |
| 269 | ⏳ La valida el equipo: Caroline Bersot | Que la página de una sesión quede para leer | Una sesión con tareas propuestas › «Lo que dejó esta reunión». | «Tus tareas propuestas» se ven como texto, con «Decidir en Tareas». La minuta, los pedidos y la ficha se siguen decidiendo ahí; «Usar todo» ya no habla de tus tareas. |
| 273 | Por validar | Que una propuesta de tarea se decida fácil | Con «Ver como» Caroline Bersot › Tareas › «Por decidir» › abre una propuesta (por ejemplo, la de los informes de activaciones de Honda). | Arriba, «Honda Costa Rica – Configurar…» (no «T-9») y «T-9 · Nexus te la propone». Una caja azul con qué propone Nexus, debajo «Para · Vence · Cliente» y de qué reunión salió. Abajo, en el pie, «Descartar», «Más adelante» y «Usar». «Cambiar otros detalles» abre el formulario entero. |

### Kickoff y cronograma <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|

### Preventa y exploración <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 104 | ⏳ La valida el equipo: Liliana Moreno | Que se pueda regenerar una sola pregunta | Distribuidora Larce › Exploración › sesión 2 › Preparación › «La guía»: en una pregunta, ⋯ › «Regenerar». Después, en una pregunta «Del asistente», ⋯ › «Regenerar». | La pregunta cambia por otra del mismo tema, marcada «Regenerada»; la «Del asistente» regenerada pasa a «Regenerada» (antes seguía diciendo «Del asistente»). «Volver a la de la guía» aparece solo en una pregunta de la guía. Una tuya editada por ti sigue diciendo «Tuya». |
| 113 | ⏳ La valida el equipo: Liliana Moreno | Que el asistente ofrezca pedidos al abrirse | Larce › Preparación › «La guía» › «Mejorar con el asistente». | Arriba del campo, de 3 a 4 pedidos en botones armados con la guía real (la pregunta con menos repreguntas, las dimensiones sin preguntar, lo primero que falta para proponer). Un clic llena el campo; lo mandas tú. |
| 114 | ⏳ La valida el equipo: Liliana Moreno | Que el chat numere como la pantalla y respete el tope | Larce › «La guía», vista «En orden» › «Mejorar con el asistente». Pide «Quita la última pregunta». Después «Agrega tres preguntas sobre cómo miden el pipeline». | «Quitar la N» apunta a la misma pregunta que ves última (la del presupuesto). Con las tres: la lista trae solo las que entran y dice que la guía llega a 8 preguntas sumadas (tuyas o del asistente); al aplicar entran sin avisos. |
| 172 | Por validar | Que la guía nueva del proyecto sea corta | Botón «Actualizar la guía». | Unas 5 preguntas de estrategia y escala, cada una con su ⓘ, más de 3 a 5 de lo vendido. El aviso ámbar desaparece. |
| 175 | ⏳ La valida el equipo: Liliana Moreno | Que regenerar, agregar y el asistente funcionen en el proyecto | Cemaco, después de actualizar: ⋯ › «Regenerar»; «+ Agregar pregunta» y otra vez «Actualizar la guía»; «Mejorar con el asistente». | La pregunta cambia y dice «Regenerada»; la tuya dice «Tuya» y sigue después de actualizar; el chat de Cemaco abre con la guía y de 3 a 4 pedidos en botones. |
| 178 | ⏳ La valida el equipo: Liliana Moreno | Que «Lo que cubre la guía» sume lo vendido | Cemaco, «Lo que cubre la guía». | Retos, Resultados que persigue y Obstáculos, y debajo «Piezas de lo vendido que pregunta:» con sus temas. |
| 247 | ⏳ La valida el equipo: Liliana Moreno | Que cambiar el objetivo proponga preguntas | Cemaco Internacional - CRM › Exploración › próxima sesión › Preparación › «Objetivo de la sesión» › «Editar»: «Enfocar la sesión en marketing y en lo que pidió Marco: volúmenes de leads y tasa de conversión» › «Guardar». | «Nexus está pensando preguntas para este objetivo» y después «Nexus propone 3 preguntas para este objetivo», en azul con la chispa, sobre leads, conversión y volumen. |
| 248 | ⏳ La valida el equipo: Liliana Moreno | Que las preguntas del objetivo se usen o se descarten | En ese bloque azul, «Usar» en una y «Descartar» en otra; después «Pedir otras». | La usada entra a «La guía» con la marca «Por el objetivo»; la descartada no vuelve. |
| 249 | ⏳ La valida el equipo: Liliana Moreno | Que la guía se refresque sola con el asistente | La misma sesión › «Mejorar con el asistente» › «quita las preguntas de ventas» › aplica la lista. | La guía cambia en pantalla, sin recargar. |
| 250 | ⏳ La valida el equipo: Liliana Moreno | Que las preguntas se arrastren | «La guía» › «En orden»: arrastra una pregunta por los puntitos de la izquierda; repite con el teclado (Tab hasta el asa, Espacio, flechas, Espacio). Después abre «En vivo» y toca «Actualizar la guía». | La pregunta queda donde la soltaste y arriba dice «Van en el orden que elegiste» con «Volver al orden de la guía». «En vivo» muestra el mismo orden y actualizar la guía lo mantiene (lo nuevo va al final). |
| 251 | ⏳ La valida el equipo: Andrés Pinzón | Lo mismo en la preventa | Distribuidora Larce › Exploración › próxima sesión: repite la 247, la 249 y la 250. | Lo mismo que en Cemaco. |
| 257 | ⏳ La valida el equipo: Liliana Moreno | Que el asistente de la guía use todas las sesiones | Cemaco Internacional - CRM › Exploración › guía de la sesión 5 › «Mejorar con el asistente» › «¿Qué otras preguntas agregarías para la próxima sesión?». | Preguntas sobre cuántos contactos o leads llegan por canal al mes y cuántos se vuelven clientes; ninguna sobre quién coordina con las agencias. |
| 258 | ⏳ La valida el equipo: Liliana Moreno | Que no repita lo que ya se habló | El mismo chat › «Agrega más preguntas sobre las 5 agencias». | Preguntas nuevas (qué quieren hacer ellos mismos, mensajes que se contradicen entre agencias), no la de cuántas personas coordinan con ellas. |
| 259 | ⏳ La valida el equipo: Liliana Moreno | Que «Actualizar la guía» retome lo acordado | La misma guía › «Actualizar la guía». | El objetivo de la sesión habla de las volumetrías de cada canal y la apertura retoma lo acordado el 19 oct. |
| 260 | ⏳ La valida el equipo: Andrés Pinzón | Lo mismo en la preventa | Preventa de Tecnosagot › guía de la próxima sesión › «Mejorar con el asistente» › «¿Qué otras preguntas agregarías para la próxima sesión?». | Retoma la meta de ventas que quedó sin preguntar y no vuelve a preguntar quién da el visto bueno. |

### La cuenta: encargado, proyectos y ficha <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 13 | ⏳ La valida el equipo: Caroline Bersot | Que el riel separe herramientas y entregables | Clientes › «Teamnet» › en la columna de la izquierda, el proyecto «Teamnet - Reimplementación CRM». Después «kölbi» › «Kolbi \| Marketing y ventas» (es SmartLoop). | Teamnet: «HERRAMIENTAS DEL PROYECTO» (Resumen, Cronograma, Cuestionarios, Exploración, Ejecución) y debajo «ENTREGABLES» (Kickoff, Diagnóstico, Planificación, Integraciones), y «Ver 1 pieza más +» con la Entrega. kölbi: Resumen y Cronograma sin rótulo, y el grupo «CICLO · <etapa>» con sus piezas; sin Kickoff. |
| 14 | ⏳ La valida el equipo: Caroline Bersot | Que generar un Diagnóstico y un Kickoff siga igual | Clientes › «Spectrum» › proyecto «Spectrum - MKT + SALES» (tiene handoff y no tiene diagnóstico). En el riel, «Ver N piezas más +» › Diagnóstico › «Activar» › «Generar diagnóstico»; espera. Después Kickoff › «Generar kickoff». | El diagnóstico con sus secciones (Diagnóstico, Situación actual, Objetivos, Desafío principal… hasta «El siguiente paso»). El kickoff llena Bienvenida, Objetivos, Alcance, Métricas, Próximos pasos…; «El equipo del proyecto», «Sesiones y horarios», «Canales de atención» y «Cierre» quedan con lo que ya tenían. |
| 15 | ⏳ La valida el equipo: Caroline Bersot | Que la cuenta muestre sus reuniones y sus tareas por equipo | Clientes › «Honda Costa Rica» › La cuenta › Tareas. | Arriba, «Próximas reuniones · próximos 8 días» (o «Nada agendado… Se miró el calendario de …»). Debajo, el total de abiertas y por decidir; primero «Customer Success» (las de Caroline, con «Reunión con el cliente»), después «Ventas» (T-72 de Andrés, con chip HubSpot) y al final las hechas, plegadas. Nada «Solo para mí» de otra persona. |
| 16 | ⏳ La valida el equipo: Caroline Bersot | Que el chip diga cómo está la cuenta, sin plata para el CSE | «Ver como» Alexander Vanegas › Clientes › «BLUESAT» › toca el chip «Señales de riesgo · 3» de la cabecera. Repite con «Ver como» Heiver Gomez. | Alexander: 3 motivos (el atraso por Smarteam, «8 facturas vencidas ($3,800)…» y las licencias sin asignar) y «Ver la cuenta en Éxito del cliente →». Heiver: «Señales de riesgo · 2», los mismos sin el de facturas y sin ese enlace. |
| 116 | ⏳ La valida el equipo: Alexander Vanegas | Que el CSE encargado se cambie y quede | Éxito del cliente › Cartera › fila de Librería Internacional › «CSE encargado»: elige otra persona y después vuelve a Caroline. | Las dos veces la celda queda con la persona elegida, sin volver al nombre anterior. |
| 117 | ⏳ La valida el equipo: Alex Vanegas | Que Alex cambie el encargado desde su cartera | Alex Vanegas con su usuario: «Para ti» › «La cartera» › una cuenta con proyecto de implementación › en la línea «CSE:», elige a otra persona (y después devuélvela). | Hay un desplegable. A la persona nueva le llega en «Para ti» «Quedaste como encargado de…», y a la anterior, «… pasó a …». |
| 118 | ⏳ La valida el equipo: Alexander Vanegas | Que un CSE no pueda cambiar el encargado | «Ver como» Caroline Bersot › «Para ti» › «Tu cartera». | La línea «CSE:» se ve como texto, sin desplegable. |
| 204 | ⏳ La valida el equipo: Alexander Vanegas | Que lo que eliges gane | Liliana: toca «CEMACO» en esa línea y recarga. | Se queda en «CEMACO». |
| 205 | ⏳ La valida el equipo: Caroline Bersot | Que «Preparar» lleve al proyecto propio | «Ver como» Liliana › agenda › una reunión con Cemaco › «Preparar» › enlace a la ficha. | Llega a «Cemaco Internacional - CRM». |
| 207 | ⏳ La valida el equipo: Alexander Vanegas | Que el CSE encargado quede al cambiarlo | En esa celda, elige otra persona de CS; cierra el desplegable y recarga. Después devuélvela a Caroline. | Queda la persona elegida, también después de recargar. |
| 210 | ⏳ La valida el equipo: Alexander Vanegas | Que el pase mueva lo abierto | Tras pasar una cuenta con tareas de seguimiento: Tareas › esa tarea › historia; «Para ti» de quien la recibe. | «Cambió de manos: pasó de X a Y por el pase de cuenta», la tarea en la semana de la persona nueva y el aviso «Quedaste como encargado…» con «Te pasaron N tareas abiertas…». |
| 213 | ⏳ La valida el equipo: quien cambie el CSE en HubSpot | Que un cambio hecho en HubSpot también pase todo | Cambia el «CSE Encargado» directo en HubSpot y abre la ficha en Nexus. | A la persona nueva le llega «Quedaste como encargado de … Cambió en HubSpot», y sus tareas se movieron. |

### SmartLoop y el servicio recurrente <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 28 | ⏳ La valida el equipo: Alexander Vanegas | Que el cronograma del ciclo pida confirmar el arranque | Honda Costa Rica › «FACO · SmartLoop (prueba)». 1) Resumen › tarjeta de la etapa › «Editar el ciclo»: «Desde», «Hasta» y «Meta del ciclo» › «Guardar». 2) La cuenta › Casos de uso › «Sumar un caso de uso»: título, «Criterio de aceptación» y «Dónde va: Al ciclo 1 de «FACO · SmartLoop (prueba)»» › «Sumar». 3) En el proyecto › Cronograma › «Armar la fase» › «Sí, arranca ese día». 4) En el caso, «+ Dependencia del cliente» › «Sumar». 5) «Aprobar esta versión». | El diálogo «Fecha de arranque del cronograma» dice «El cronograma arranca el [Desde]. ¿Lo confirmas?». Arriba del Gantt, «Cronograma del ciclo 1» con el caso, sus semanas y «Depende del cliente: …». Al aprobar: «Quedó como la versión aprobada.» y «Versión aprobada v1 · [fecha] · [tu correo]». |
| 29 | ⏳ La valida el equipo: Alexander Vanegas | Que cerrar el ciclo saque lo que no se cumplió | Después de la 28, abre el mismo proyecto en dos pestañas, las dos en Aprendizaje. En la A: en el caso, «Qué se decide: No se cumplió» y «Lo medido»; en la meta, «¿Se cumplió?» y «Cómo se evaluó»; después «La propuesta del siguiente ciclo». «Cerrar el ciclo 1» › «Cerrar el ciclo». En la B, sin recargar, cambia «Cómo se evaluó» y haz clic afuera. | En A: «El ciclo 1 quedó cerrado.» y «Ciclos anteriores» con el ciclo 1 y el caso «· No se cumplió». En el Cronograma, la dependencia de ese caso queda suspendida y sale de «Lo que debe el cliente». En B: «Este ciclo ya se cerró: recarga la página.» Cierra el ciclo 1 del proyecto de prueba. |
| 31 | ⏳ La valida el equipo: Alexander Vanegas | Que el cliente vea la ruta del servicio, sin datos internos | Honda Costa Rica › «FACO · SmartLoop (prueba)» › Resumen › «Ruta del servicio para el cliente». Después, en kölbi › «Kolbi \| Sales Hub» (SmartLoop real, con acceso), «Subir al cliente» y abre el link de «Ruta del servicio» con la contraseña. | En el de prueba dice que un proyecto de prueba no se comparte con el cliente (ya no manda a «Acceso»). En kölbi: «Compartida desde el …» y «Volver a subir»; el cliente ve cada ciclo con sus fechas, su meta y los casos como barras, sin notas ni montos. |
| 57 | ⏳ La valida el equipo: Andrés Pinzón | Que una propuesta sea proyecto o servicio recurrente | Ventas › Propuestas › «Nueva propuesta» › «1 · Empresa»: hondafaco.com › «2 · Qué se cotiza»: «Un servicio recurrente» › «SmartLoop» › «3 · Trato y nombre»: «SmartLoop — Honda Costa Rica (prueba)» › «Crear la propuesta» › «Generar la propuesta». | «Cómo opera el servicio», «Cómo trabajamos» (las 5 etapas en un círculo) y «Nivel de servicio» vienen llenas desde el catálogo. «Inversión mensual» queda vacía: la llena Ventas. Al terminar, borra la propuesta. |
| 58 | ⏳ La valida el equipo: Andrés Pinzón | Que un proyecto pase a recurrente desde la ficha | 1) Selvatura › «SB Hotels \| CRM» › Resumen › tarjeta de la etapa › «Pasar a recurrente» › «SmartLoop», lee la propuesta y «Cancelar» (confirmar escribe en el proyecto real). 2) Honda Costa Rica › «PLAN DE CONTINUIDAD \| HONDA FACO» › Resumen. | 1) «Pasar a servicio recurrente» con «¿En qué etapa del ciclo arranca?» y «Nexus propone …», y la tarea de HubSpot que quedaría («Mover «SB Hotels \| CRM» en HubSpot a SmartLoop · …»). 2) La tarjeta «Servicio recurrente · SmartLoop» con «Qué toca ahora:», «Agendar en Calendar ↗», «Ya la agendé» y «Crear las N de los próximos dos meses». |
| 59 | ⏳ Espera la 57 | Que una propuesta recurrente ganada dé de alta el servicio | Con la propuesta de la 57: «Subir al cliente», abrir su link y «Aprobar propuesta». En la cabecera de la propuesta, «Dar de alta el servicio». No toques «Crear el proyecto» (lo crea en HubSpot). | Se abre «Nuevo proyecto» con hondafaco.com ya buscado y, en «Siguiente», el tipo «SmartLoop» marcado. Los casos de uso de la propuesta quedan en el plan al crear el proyecto. |

### Propuestas <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 24 | ⏳ La valida el equipo: Andrés Pinzón | Que la propuesta traiga los casos de uso | Propuestas › «Nueva propuesta» › dominio credit-force.com › «Buscar la empresa», deja «Usarla como contexto», «Un proyecto» › «Implementación de HubSpot», nombre «CreditForce · prueba (borrar)» › «Crear la propuesta» › «Generar la propuesta». Repite con cemaco.co.cr. | En «2 · Propuesta», «Casos de uso incluidos», sin precio. CreditForce: «Sistematiza tu proceso comercial con HubSpot», «Alinea Marketing y Ventas…» y «Estandariza y controla tus cotizaciones comerciales». Cemaco: «Sistematiza…», «Reactiva tu inversión en HubSpot» y «Migra a HubSpot sin perder datos ni continuidad». Borra la de Cemaco; la de CreditForce sirve para la 27, 62, 63 y 95. |
| 27 | ⏳ La valida el equipo: Andrés Pinzón | Que lo publicado no cambie y el PDF lleve el IVA | (1) «RSM Costa Rica - Soporte Hubspot Continuo» › «2 · Propuesta» › Inversión, sin editar. (2) «Universidad Monterrey - Hubspot Refresh» › «3 · Compartir» › «Copiar el link», ábrelo, y «Descargar PDF». (3) El link y el PDF de «CreditForce · prueba (borrar)» después de la 95. | (1) El selector «IVA» con «⚠ No sabemos si el cliente es de Costa Rica…». (2) Sin IVA, igual que antes. (3) «Montos sin IVA (+ 13%)»; «Pago único + IVA» $8,500 · IVA $1,105 · total $9,605; «Por mes + IVA» $1,000 · IVA $130 · total $1,130, igual en el link y en el PDF. |
| 62 | ⏳ La valida el equipo: Andrés Pinzón | Que los módulos se agreguen con un clic | En «CreditForce · prueba (borrar)», al pie: «+ Agregar una sección propia», en «Qué clase de sección» «Casos de uso por proyecto» › «Agregar»; igual con «Comparación de licencias» y «Fases u opciones». En casos, «+ Proyecto» dos veces y «Desde el catálogo de casos»; en licencias, «Agregar plan» dos veces, «Recomendar» en uno y «Agregar fila»; en fases, «Agregar fase» dos veces y «Opciones (elegir una)». «Descargar PDF». | Pestañas 01 y 02 con sus casos; la tabla con «Recomendado» sobre el plan elegido; tarjetas 01, 02 que pasan a A, B. En el PDF, los dos proyectos uno debajo del otro, sin pestañas, y la tabla entera. |
| 63 | ⏳ La valida el equipo: Andrés Pinzón | Que un módulo hecho a mano se reuse en otra propuesta | En «El Molino Aditivos - CRM + Marketing», sobre «Arquitectura del sistema»: «⧉ Guardar como módulo» › «Guardar». En «CreditForce · prueba (borrar)»: «⧉ Agregar módulo de la biblioteca» › «Agregar» y «✨ Adaptar a esta empresa». Al final, «Archivar» en la biblioteca, «3 · Compartir» › «Revocar el link» y borra la propuesta de prueba. | Al guardar: «Este módulo trae datos de esta empresa», «Nombra a «molino».» y «Guardar igual». En la biblioteca, el aviso de que nombra a «molino». «Adaptar» muestra cada texto tachado y el nuevo, y «Aplicar N» cambia solo los textos; el diseño queda igual. |

### Comisiones <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
| 278 | Por validar | Que la página de comisiones diga lo cerrado con Marco | Finanzas › Modelos › Comisiones › «Cómo funciona» y «Simulación». | Arriba, «Modelo en prueba…». En el bono de liderazgo, «¿Por qué se calculan distinto?» y los ejemplos 133, 0, 500 y 750. «Pendientes» con dos preguntas y «Lo que no cuadra» con la oferta de Liz. En «Simulación», la tabla «Techos» (solo tú). |
|---|---|---|---|---|
| 95 | Por validar | Que la aprobación quede y el cliente no la vea | En «CreditForce · prueba (borrar)» (la de la 24) › «2 · Propuesta» › Inversión: «Montos en» USD; en Servicios, «precio de lista» 10000 y «dcto» 15%; en Licencias, «Agregar línea» «Sales Hub Professional» 1000; IVA «+ IVA (13%)». Espera a que se guarde y toca «Aprobar el descuento». Después «Descargar PDF», «Subir al cliente» y «3 · Compartir» › «Copiar el link», y ábrelo. | «Descuento aprobado.» y la franja dice «…lo aprobó Elías González el 19/10/2026, hasta el 15 %.» En el link y en el PDF no está la franja ni el botón; la línea sí muestra «−15%», $10,000 tachado y $8,500. |

### Finanzas <span class="prioridad">Alta</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
| 279 | ⏳ La valida el equipo: María José Zamora | Que una comisión de partner acepte cero y diga si es estimada o real | Finanzas › Comisiones de partner › Atom: monto 0. Después, Coby (kölbi): registra su factura con el monto real. | Atom queda en cero, sin error. Coby pasa de «Estimado» a «Real de la factura», con el número de la factura. |
| 280 | ⏳ La valida el equipo: Alex Arrieta | Que «Actualizar» traiga lo conciliado y lo cobre | Concilia una factura en Odoo; en Nexus, Conciliación › «Actualizar». | Dice cuántas facturas cambiaron y la cuota pagada queda cobrada en el momento. Sin tocar nada, lo pagado se cobra cada hora de 7:00 a 19:00. |
|---|---|---|---|---|
| 32 | ⏳ La valida Admin | Que solo se cobre lo pagado que confirmas | Finanzas › Conciliación › «Lo pagado». Desmarca una cuota y confirma con tu firma. | Las cuotas que Odoo y Mercury dan por pagadas, con el día del pago. Las de Mercury sin entrada de plata van a «Pagadas sin el día del pago» y no se cobran. Solo se cobran las marcadas. |
| 33 | ⏳ La valida Admin | Que los montos de las licencias se lean bien | Finanzas › Punto de equilibrio › «Licencias revendidas» › en la fila de kölbi, «Editar». Escribe solo «Lo que se le paga» y «Guardar». | Guarda: la moneda es la del contrato y la frecuencia «Cada mes», a la vista y solo si hay monto. Cada contrato tiene «Editar» en su fila. (Arreglado el 19 oct: antes «Guardar» quedaba apagado.) |
| 35 | ⏳ La valida Admin | Que Mercury esté en la facturación por cliente | Finanzas › Conciliación › enlace «Odoo» (al lado de su copia) › «Facturación por cliente». Busca un cliente, filtra «Facturado por: Mercury» y toca la columna «Facturas» › «Ver». | Los clientes de Mercury junto a los de Odoo; la columna «Facturas» abre sus facturas y «Ver» el detalle de cada una. (Arreglado el 19 oct: estaba escondido detrás de un triángulo.) |
| 36 | ⏳ La valida el equipo: Admin | Que las facturas de Odoo se peguen solas | Finanzas › Conciliación › «Lo pagado». | Las cuotas que ya estaban cobradas sin número (Corrugando FAC/2026/0221, Grupo Servica 0268) dicen «Ya cobrada» y, al confirmarlas, reciben el número de su factura pagada sin volver a cobrarse. Transportes Juanva 0197 y 0230 siguen como choque: Odoo las da sin pagar. (Medido: 13 cuotas, 4 de Odoo y 9 de Mercury.) |

### Éxito del cliente <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 41 | ⏳ La valida el equipo: Alexander Vanegas | Que la lista de limpieza de HubSpot diga quién arregla qué | Éxito del cliente › «Limpieza de HubSpot», arriba a la derecha. | Unas 27 cosas, con chips «Encargado que ya no está», «Sin encargado», «Servicio sin proyecto» y «Excliente con algo activo». Por persona: Alexander Vanegas (lidera el sprint) con la mayoría, cada una con «Abrir en HubSpot ↗» o «Abrir la cuenta», y Heiver Gomez con Wherex. («Etapa quieta» y «Sin actividad» todavía no aparecen: esos datos llegan con el deploy.) |
| 142 | ⏳ La valida el equipo: Alex Vanegas | Que lo decidido salga al instante | Alex con su usuario: en esa lista, «Descartar» en una fila; vuelve a «Para ti». | La fila desaparece con «Descartada: … sigue «En fricción»». En «Para ti» dice 8 proyectos. |
| 143 | ⏳ La valida el equipo: Alexander Vanegas | Que la ficha no mezcle salud y estado de HubSpot | Éxito del cliente › Areyá › pestaña «Proyectos». | «Salud: de «En fricción» a «En riesgo» · lo propone el vigía · Decidir», «Estado en HubSpot: A tiempo» y aparte el aviso de «Atraso por cliente» con «Pasar el estado a «Retrasado» en HubSpot». |
| 217 | ⏳ La valida el equipo: Alexander Vanegas | Que «Agendar» lleve a la agenda | Esa página › una cuenta «Sin sesión agendada» › «Agendar». | «Para ti» con el borrador del evento abierto, con la gente de la última reunión. |
| 220 | ⏳ La valida el equipo: Alexander Vanegas | Que cada tema diga de dónde sale | Esa página › BLUESAT. | Cuatro temas de la reunión del 16 oct, cada uno con su enlace y el día. |
| 221 | ⏳ La valida el equipo: Alexander Vanegas | Que los filtros funcionen | Botones «Sin sesión agendada» y «Sin siguiente paso». | Filtran, con el número de cada uno. |

### El chat de Nexus <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 17 | ⏳ La valida el equipo: Caroline Bersot | Que el chat trabaje solo sobre esa cuenta y no ofrezca lo que no se puede | Clientes › Ferretería Noelito › botón «Nexus». 1) «¿Qué está pendiente con esta cuenta?». 2) «Por WhatsApp me dijeron que mandan la base mañana»: desmarca la nota y el siguiente paso (escriben en HubSpot) y toca «Aplicar…» dos veces seguidas. 3) «Genera el diagnóstico de Ferretería Noelito \| Implementación CRM + Conexión SAP»: mira la línea y desmárcala, no la apliques. 4) «Genera el kickoff de Add-on desarrollo de misceláneos SAP». | 1) Solo habla de Noelito. 2) El botón se apaga mientras aplica y dice «Listo: 1 tarea creada.»; la tarea aparece una sola vez en La cuenta › Tareas, con «Chat de Nexus», vence mañana y la hace el cliente. 3) La línea dice «Generar Diagnóstico de «…» con la plantilla «Diagnóstico estratégico» — se arma en unos minutos…». 4) No entra a la lista y dice «⚠ No quedó en la lista: Este proyecto no tiene handoff generado: el kickoff sale del handoff.» |
| 18 | ⏳ La valida el equipo: Caroline Bersot | Que «Sugerencias» diga qué hacer, con el mensaje listo | Después de la 17: en la ficha de Ferretería Noelito, toca «Sugerencias». | «Lo que Nexus te sugiere en Ferretería Noelito», con hasta 5 cosas. La de la 17 sale como «Recuérdale al cliente: …», con el mensaje de WhatsApp a la vista, «Copiar mensaje» y «Abrir WhatsApp». Las otras traen «Pedírselo a Nexus», sin mensaje. |
| 75 | ⏳ La valida el equipo: Caroline Bersot | Que el chat lea las notas de HubSpot | Clientes › RC Inmobiliaria › botón «Nexus». Pregunta: «¿Qué notas y llamadas hay de esta empresa en HubSpot?». | Las 13 notas de HubSpot, de la más nueva a la más vieja (11 sep a 1 jul), con su día, quién la escribió (Marco Salas, Lorena Osorio, Alejandro) y el comienzo del texto. No hay llamadas: las 3 del 11 sep son notas sin autor que dicen «Llamada realizada…». Si responde solo con 5, contestó de memoria y no buscó: falla. |
| 234 | ⏳ La valida el equipo: Valentina Sandoval | Que el chat del cronograma sepa lo que se habló con el cliente | Clientes › Cayalá › «Cayalá - WhatsApp Nativo» › Cronograma › el chat. 1) «¿Qué acordamos con Cayalá sobre el arranque? ¿El cronograma lo refleja?». 2) «Agrega en la fase de Configuración WhatsApp una tarea del cliente: dar acceso al número de WhatsApp Business» › aplica la lista. | 1) Dice que el arranque se acordó para el lunes 19 de octubre (reunión del 9 oct) y que el cronograma ya arranca ese día, sin que hayas elegido reuniones. 2) Una lista con un cambio; al aplicarla, la tarea aparece en la primera semana de «Configuración WhatsApp», a cargo del cliente. |

### La escala <span class="prioridad">Media</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 19 | ⏳ La valida el equipo: Alexander Vanegas | Que la escala de la cuenta muestre su evidencia y su historia | Clientes › Cemaco Internacional (la del proyecto «Cemaco Internacional - CRM») › La cuenta › La escala. Toca una dimensión de Ventas. | Arriba: «Hoy · La Exploración de «Cemaco Internacional - CRM»». Ventas con «6 de 8 dimensiones con nivel · 6 con evidencia»; cada una con «✓ Con evidencia · Lo dijo el cliente en una reunión» y, al tocarla, la frase entre «». «La escala en el tiempo» con «Hoy» y «17 oct 2026 · Primera versión». «El camino de crecimiento»: «Ventas todavía no está ubicada: faltan 2 dimensiones…». |
| 23 | ⏳ La valida el equipo: Andrés Pinzón | Que la escala de la preventa diga de dónde sale y qué explorar | Ventas › Preventa › CreditForce › La escala, en la pestaña de Ventas, sin ninguna dimensión abierta. | «De dónde sale cada nivel»: cada dimensión con su nivel, «✓ evidencia» u «○ hipótesis», de dónde sale y la frase. «Qué explorar en la próxima sesión», con sus rótulos («Hipótesis», «Lo frena»…) y «Llevar a la próxima sesión». |
| 45 | ⏳ La valida el equipo: Alexander Vanegas | Que la escala se arme desde un proyecto con handoff, sin preventa ni exploración | Clientes › ALMOTEC › La cuenta › La escala › «Actualizar escala» › «Actualizar» (espera sin salir). | Antes: «La empresa todavía no está posicionada en la escala». «Sobre qué se ubica» = «Almotec - CRM», con su venta. Mientras corre, las fases junto al botón. Al terminar, «El agente propone N niveles en la Exploración de «Almotec - CRM»», con «De dónde sale» (el handoff, HubSpot…). Crea la exploración del proyecto de ALMOTEC. |
| 47 | ⏳ La valida el equipo: Alexander Vanegas | Que el camino de crecimiento proponga casos de uso | Clientes › pestaña «Prospectos» › CreditForce › La cuenta › La escala › «El camino de crecimiento» › «Sumar a los sugeridos» en «Sistematiza tu proceso comercial con HubSpot». Después La cuenta › Casos de uso. | Ventas Deficiente → Funcional, con lo que la frena y 3 casos. Aviso «Quedó como sugerido en La cuenta › Casos de uso.»; el botón pasa a «Ya está en Casos de uso» y el caso aparece en «Sugeridos». |
| 52 | ⏳ La valida el equipo: Alexander Vanegas | Que «Actualizar escala» funcione en un cliente sin proyecto ni preventa | Clientes › Forestales Latinoamericanos › La cuenta › La escala › «Actualizar escala». | Antes: «La empresa todavía no está posicionada en la escala». En el panel, «Sobre qué se ubica» = «La cuenta entera · Sin proyecto ni preventa» y «Venta» con sus 9 ventas, marcada la más reciente. Al tocar «Actualizar»: aviso «El agente está leyendo todo lo que Nexus sabe de la empresa…» y las fases junto al botón. Al terminar, «El agente propuso N niveles: revísalos acá abajo…». Cuesta US$0,05–0,20. |
| 53 | ⏳ La valida el equipo: Alexander Vanegas | Que con varios proyectos se elija sobre cuál se ubica | Clientes › Plastimex › La cuenta › La escala › «Actualizar escala» › «Sobre qué se ubica». | «Plastimex | SAP + HUBSPOT» primero, con su venta ya marcada. Los cerrados («Plastimex - Limpieza de base de datos» y «PLASTIMEX | POTENCIANDO…») al final, con «· Terminado». Después «La cuenta entera». (Arreglado el 19 oct: los cerrados no se reconocían.) |
| 54 | Por validar | Que lo propuesto se confirme en la misma pantalla y quede en la historia | Al terminar la 52 (o en Tecnosagot, que ya tiene 2 propuestos): en el recuadro azul «El agente propone N niveles…», abre «Ver la frase y el nivel» en uno, toca «Usar» y después «Usar los N». | Cada nivel con su porqué, «De dónde sale» y la frase. Aviso «Nivel usado.» / «Usaste los N niveles.». Lo usado aparece en su área con «✓ Con evidencia». En «La escala en el tiempo», una fila de hoy «Se confirmó un nivel». Lo no usado no entra a la historia. |
| 55 | ⏳ La valida el equipo: Alexander Vanegas | Que se entienda con qué edición y perfil se mide | Clientes › Cemaco Internacional (la del proyecto «Cemaco Internacional - CRM») › La cuenta › La escala › «Se mide con la escala general» › «Corregir» › Industria «Ecommerce y retail», Cómo vende «Mixta», Después de la venta «Recompra» › «Guardar». | Antes: «Porque no hay una edición de su industria…». Después: aviso «Listo: la escala se lee con la edición y el perfil nuevos.», título «Se mide con la edición Ecommerce y retail y el perfil mixta · recompra», chip «La eligió una persona» y lo que cambia frente a la general. Queda guardado en la exploración de Cemaco. |
| 56 | ⏳ La valida el equipo: Alexander Vanegas | Que la historia se ate a la venta | Cemaco Internacional › La cuenta › La escala › «Guardar esta versión» › De qué momento es «Al vender» › «Guardar». | Aviso «Versión guardada.». En «La escala en el tiempo», la fila «27 sep 2026 · Al vender · Guardada a mano · venta «Cemaco Internacional - CRM»». |
| 108 | Por validar | Que cada nivel de cada edición hable de su industria | Lee `docs/escala/personalizacion-de-las-ediciones.md` y su lista «Para mirar con calma» (4 criterios). Si te calza, la publico (8.9.1). Después: Escala › Ventas › vista «Matriz» › Industria «Turismo», fila 1.7 «Seguimiento de cotizaciones y reservas». | En Inicial: «Cuando una cotización no se contesta o una reserva no se paga, cada persona del equipo decide si insiste y cómo: no hay un paso acordado.» (Comprobado contra el documento: ninguna de las 720 celdas queda sin personalizar.) |

### Rentabilidad, la meta y el uso <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 37 | Por validar | Que la foto del margen quede guardada por mes | Éxito del cliente › Rentabilidad, período «Trimestre» (jul – sep 2026) › recuadro «De dónde salen los números». En la fila «jul 2026» toca «Tomar la foto». | Antes: «sep 2026» dice «Desde su foto · Tomada el 17 oct 2026 por el sistema»; jul y ago dicen «En vivo · Sin foto…»; arriba, «1 de 3 meses desde su foto; el resto, en vivo». Al tomarla: aviso «Foto tomada: N cuenta(s)…», jul pasa a «Desde su foto · Tomada el 19 oct 2026 por egonzalez» y arriba dice «2 de 3 meses desde su foto». La foto de julio queda guardada en producción. |
| 38 | Por validar | Que rehacer una foto pida motivo y la cuenta diga de dónde sale | Rentabilidad › «De dónde salen los números» › fila «sep 2026» › «Volver a tomar». Toca «Volver a tomar la foto» con el motivo vacío; después escribe «versión 2» y tócalo otra vez. Luego, en «Margen por cuenta», abre Librería Internacional y mira «Mes a mes». | Vacío: aviso rojo «Para volver a tomar la foto, escribe por qué.» y nada cambia. Con motivo: «Foto tomada: N cuenta(s)…» y la fila dice «Tomada el 19 oct 2026 por egonzalez · versión 2»; desaparece el aviso «sep 2026: Esta foto es de antes de contar las reuniones fuera de Meet…». En la cuenta, «De dónde sale» dice «Foto del 19 oct» en sep y «En vivo» en ago. |
| 39 | Por validar | Que se vea qué usa y qué desestima cada equipo | Para ti › «Uso de Nexus» (arriba a la derecha). Pestaña «Equipo»: baja hasta «Qué usa cada equipo, en las últimas 4 semanas». Después abre «Para qué se usa». | Seis pestañas: Equipo · Para qué se usa · IA por cliente · Procesos de IA · Conclusiones · Reuniones sin grabar. En «Qué usa cada equipo», cada celda es «personas que la abrieron/personas del equipo» (Customer Success: «Para ti» 2/7) y «—» donde nadie la abrió. En «Para qué se usa»: «Qué usa y qué desestima cada equipo» con «usó · desestimó», y «Quién decide», por equipo y en orden alfabético. |
| 40 | Por validar | Que se vea cuánto cuesta la IA y si sirve | Uso de Nexus › «IA por cliente» (cambia entre «30 días» y «90 días», arriba a la derecha) › «Procesos de IA» › «Conclusiones». | IA por cliente: «Gasto en IA» unos US$ 92 en 30 días y unos US$ 139 en 90, en «Clientes y prospectos» y «Smarteam y aliados» con lo que propuso Nexus («N % usado»). Procesos de IA: «Proceso por proceso» con gasto, llamadas, errores y «% usado». Conclusiones: agrupadas, cada una con «Para mirar», «Para saber» o «Va bien». |
| 83 | Por validar | Que la meta se cambie desde la pantalla | Éxito del cliente › Rentabilidad › tarjeta «La meta del año» (arriba de las pestañas). Hoy dice «US$ 2,3 M en 2027». Toca «Cambiar la meta» › Año «2027», «Meta en dólares» «2.500.000», «Por qué (opcional)» «prueba» › «Guardar». Después toca «Ver la historia». Al terminar, vuelve a dejarla en 2.300.000 con «Cambiar la meta». | Aviso «Meta de 2027 guardada.». El título pasa a «US$ 2,5 M en 2027», la barra punteada dice «Meta · US$ 2,5 M» y «Por mes» dice US$ 208.333. «Ver la historia» (aparece recién con dos metas) muestra la de hoy con «prueba» y la del 18 oct. Cada cambio queda: la meta nunca se borra. |
| 84 | Por validar | Que las horas salgan solas, también fuera de Meet | Primero haz la 38. Rentabilidad › período «Mes» (sep 2026) › «Margen por cuenta»: filas de Librería Internacional y Teamnet, columna «Horas reales», y la barra «De dónde salen las horas». | En «Horas reales»: «N reun. (X fuera de Meet) · …» (Librería unas 24,5 h, Teamnet unas 9). En la barra: «Del calendario (X h fuera de Meet) · %». kölbi y Club de Amantes del Vino no llevan «(… fuera de Meet)». |
| 86 | Por validar | Que Nexus lea los números y proponga | Rentabilidad › pestaña «Lectura de los números» › «Leer los números» (llama a Claude y guarda en producción). Espera hasta un minuto. En una propuesta toca «Desestimar», escribe por qué y confirma con «Desestimar». | Aviso «N señales · M propuestas nuevas.» (sin señales: «No hay nada que no progrese: no se llamó al modelo.»). Cada propuesta con qué ve, qué hacer e «Inversión: US$ …», con «Usar» y «Desestimar» (apagado hasta escribir el motivo). Al desestimar pasa a «Decidido en los últimos 90 días · Desestimada por … · tu motivo». |

### El gasto de la IA <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 67 | Por validar | Que la factura de Anthropic se compare con lo medido | Integraciones › tarjeta de Claude › «Ver el gasto» › pestaña «Factura». En «Anotar la factura de un mes»: Mes «2026-09», «Monto (US$)» el total de septiembre de la consola de Anthropic, «Anotar». «Borrar» en la tabla la quita. | Aviso «Factura anotada.». En «Lo medido contra lo facturado», septiembre con «Medido» unos US$ 33,27, tu monto y la diferencia con su %. Si se aleja más de US$ 5 y más del 10 %, sale con ⚠ en ámbar. |

### Equipo, acceso y datos <span class="prioridad">Baja</span>

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 231 | Por validar | Que «Ver como» esté al lado del nombre | Equipo › Miembros. | «Ver como» en la segunda columna, al lado del nombre; también en Marco Salas y Alexander Arrieta, y no en tu propia fila. |
| 232 | Por validar | Que puedas ver como Marco | Equipo › «Ver como» en Marco Salas › «Para ti». | Su meta de 400.000 (lleva 301.536), su cartera y lo de Finanzas. Un cambio responde «es solo lectura». |
| 233 | ⏳ La valida el equipo: Claude, con el código | Que mirar como otra persona no le marque nada | Mirando como otra persona, abre un reporte suyo en Feedback y vuelve a tu usuario. | El reporte sigue sin leer para esa persona. |

## Pruebas con IA

Las que corre la IA (Claude) sin pantalla: con los datos de producción, en solo lectura, compruebo que cada pantalla diga lo que dicen la base, el calendario y HubSpot, que las tareas salgan para la persona y el equipo correctos, que las copias y los jobs corran y que no se mezclen clientes. Se vuelve a correr con `scripts/validar-*.ts`; la última está en `docs/validacion-2026-10-19.md`.

**La próxima pasada:** las tareas de las reuniones con clientes leídas con la regla nueva (190, 192 y 193, el 20 oct en la tarde), que el cobro automático y la copia de HubSpot corran solos (103 y 81) y los indicadores de «Cómo va Nexus», cada semana.

### Para ti y la agenda

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 9 | ✓ Validado por Claude 18 oct | Que de viernes a domingo invite a planificar la semana | Un viernes, sábado o domingo, abre «Para ti» como CSE, CSL o alguien de Desarrollo. | Debajo de «Lo que importa hoy»: el viernes «Es viernes: planifica la semana que viene», el sábado «Es sábado: planifica la semana que viene» y el domingo «Mañana empieza la semana: planifícala». Lleva a «Planifica tu semana» (prueba 20). La agenda abre en la semana. |
| 50 | ✓ Validado por Claude 19 oct | Que un excliente salga de todo | Éxito del cliente › pestaña «Cartera» › «Fuera de la cartera». Para marcar uno: Éxito del cliente › «Cartera» › columna «Tipo de relación» › «Excliente» (la CSL y dirección). | Wherex aparece ahí, marcado «Excliente», con el aviso de su proyecto activo. No está en ninguna alerta, cartera ni en «Lo que importa hoy»; solo en la lista de limpieza de Heiver, que pide cerrar su proyecto en HubSpot. (Lo marqué hoy a tu nombre: cerró sus 4 alertas.) |
| 79 | ✓ Validado por Claude 18 oct | Que el líder vea lo que no se tomó | Con «Ver como» Alex Vanegas, abre «Para ti». | Una línea por cuenta: «Larce: N compromisos sin tomar hace más de 48 horas», con el enlace a cada tarea. |
| 121 | ✓ Validado por Claude 19 oct | Que la agenda traiga los eventos sin invitados | «Ver como» Andrés Pinzón › «Para ti» › Agenda, semana del 19 al 23 oct: lunes, jueves y viernes. | Lunes «Convocatoria ICB» 13:00–14:00 y «Tenis» 6:00–7:30; jueves «Cita Médica» 13:00–14:30; viernes «Sale Juan del colegio» 10:30 y «Entrega de notas» 11:30. Ningún espacio libre ni bloque azul encima. |
| 122 | ✓ Validado por Claude 19 oct | Que lo de todo el día vaya arriba | La misma semana, arriba del miércoles. | «Aniversario de Marco Salas» como evento de todo el día, sin ocupar horas. |
| 123 | ✓ Validado por Claude 19 oct | Que dos eventos a la misma hora se vean los dos | La misma semana, lunes 8:00. | «SPRINT COMERCIAL» al lado de «Sprint Comercial \| Planeamos la semana», cada uno con su título. |
| 180 | ✓ Validado por Claude 19 oct | Que una reunión agendada cuente como siguiente paso | «Ver como» Liliana Moreno › «Para ti» › «Lo que importa hoy». | Bloque «Reuniones con tus cuentas» con «Cemaco Internacional: … — Mañana» y «Preparar». No aparece «falta el siguiente paso»; los otros bloques dicen «Todas tus cuentas tienen su siguiente paso.» y «Nada prometido sin tomar…». |
| 184 | ✓ Validado por Claude 19 oct | Que vea lo prometido sin tomar | «Ver como» Heiver Gomez › «Para ti» › «Pendientes sin seguimiento». | Primero los compromisos de TEC sin tomar y después «TEC: 2 tareas vencidas», con T-45. |
| 186 | ✓ Validado por Claude 19 oct | Que la CSL vea los tres bloques por CSE | «Ver como» Alexander Vanegas › «Para ti». | En cada bloque, una línea por CSE («Heiver Gomez: 6 cuentas sin siguiente paso», «Sin CSE: …»), con enlaces. |
| 188 | ✓ Validado por Claude 19 oct | Que en Ventas la reunión también cuente | «Ver como» Andrés Pinzón › «Para ti» › «Tu cartera» › «Para mover hoy». | Un negocio cuya empresa tiene reunión esta semana no pide «Definir siguiente paso» y dice «Siguiente paso: reunión …». |
| 223 | ✓ Validado por Claude 19 oct | Que a la CSL le llegue la limpieza que rompe la asignación | «Ver como» Alexander Vanegas › «Para ti» › «Lo que importa hoy». | Primero «Cuentas sin dueño en HubSpot · 27» con «Ver la lista de limpieza» y tres líneas: «20 proyectos sin encargado en HubSpot», «6 cuentas cobran un servicio sin proyecto en HubSpot» y «1 cosa abierta en una cuenta excliente». |
| 224 | ✓ Validado por Claude 19 oct | Que cada línea diga quién y qué | El mismo bloque › «20 proyectos sin encargado en HubSpot». | «9 encargado que ya no está · 11 sin encargado», con 11 enlaces a HubSpot y «y 9 más en la lista». Wherex dice «(le toca a Heiver Gomez)». |
| 225 | ✓ Validado por Claude 19 oct | Que no se repita en «Esta semana» | «Para ti» de Alexander › «Esta semana». | Ya no aparecen «HubSpot: 26 cosas por poner al día» ni «8 proyectos de Customer Success sin encargado». |
| 226 | ✓ Validado por Claude 19 oct | Que el CSE siga con sus tres bloques | «Ver como» Heiver Gomez › «Para ti». | Sus tres bloques iguales; en «También para hoy», «HubSpot: 1 cosa por resolver hoy» (Wherex). |
| 252 | ✓ Validado por Claude 20 oct | Que cada compromiso le llegue a quien le toca | Repartí con la regla nueva los compromisos de 41 lecturas de 14 días y los comparé con las 92 propuestas vivas (`scripts/a-quien-le-llegan-las-propuestas.ts`). | Ninguna le llegó a otra persona. El único aviso ajeno de hoy era el de Valentina (T-117, de Marco) y ya no le sale; 5 avisos propios que no le llegaban a nadie ahora sí (4 de Marco y T-102 de Alexander). |
| 253 | ✓ Validado por Claude 20 oct | Que los desplegables de la barra queden encima, para todos | Página de prueba con el sidebar real, midiendo punto por punto qué queda arriba de cada panel abierto. | Super Admin en 5 pantallas, 2 temas y la barra abierta y colapsada: 20 de 20 sin un punto tapado. Los otros 6 roles en Clientes: 24 de 24. Antes del arreglo, con la barra colapsada, 167 de 273 puntos tapados. |
| 274 | ✓ Validado por Claude 20 oct | Por qué la guía de Fundauna salía vacía | La cuenta con los datos de producción, en solo lectura. | Fundauna no tenía siguiente paso de Customer Success (su reunión ES el siguiente paso), ni pendientes del cliente, ni negocios, y la reunión del 20 oct dejó notas sin minuta: no había de dónde sacar un objetivo. Ahora, sin nada de eso, el objetivo es el tema del título de la invitación («Cubrir el tema de la invitación: Conexiones de…»). |
| 276 | ✓ Validado por Claude 20 oct | Que las alertas no salten encima de la pantalla | El código del shell y la prueba que lo vigila (`lib/cs/ficha-reglas.test.ts`). | El notificador de alertas del vigía se fue: las alertas siguen en Éxito del cliente y en «Para ti» de la CSL; encima de la pantalla solo salen errores y confirmaciones de lo que haces. |
| 277 | ✓ Validado por Claude 20 oct | Por qué Andrés ya no ve a Universidad Monterrey | Las tareas de la cuenta en producción. | Sus dos compromisos (T-37 y T-38) se cerraron el 19 oct a las 16:23 como «Nadie la decidió», en la limpieza de «Menos tareas a la vista»: ya no hay nada que avisar. |
| 271 | ✓ Validado por Claude 20 oct | Que la IA escriba un buen nombre corto | 40 tareas abiertas reales de producción, con el pedido final, sin escribir nada. | 40 de 40 con nombre, en unos 20 s y US$0,014 por tanda de 40: «Pedirle a Ana el inventario actualizado», «Agendar sesión de e-commerce con Álvaro», «Dar seguimiento a lo que prometió el cliente». La primera versión dejaba nombres colgando («…Josseline los»): se corrigió el recorte. |
| 272 | ✓ Validado por Claude 20 oct | Que el job ponga los nombres cortos | Producción, después del deploy de `c5659704`: las tareas abiertas con `tituloCorto` y las corridas del job. | La primera corrida nombró las 127 tareas abiertas en 4 pedidos (40, 40, 40 y 7), sin ninguna sin nombre, por US$0,039 en total. |

### Tareas

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 190 | ⏳ La corre la IA el 20 oct en la tarde | Que de una reunión con cliente salgan pocas tareas | Liliana Moreno con su usuario › Tareas › «Mis tareas», después de la próxima reunión de Cemaco. | Como mucho 3 propuestas, con títulos cortos que empiezan con un verbo, como «Enviar el reporte a CEMACO». Lo que el cliente espera de Smarteam sale como tarea suya, no como «Recordarle a…». |
| 192 | ⏳ La corre la IA el 20 oct en la tarde | Que no salgan tareas de coordinación interna | Marco Salas, después de una reunión con un cliente. | No aparecen «Realizar reunión interna» ni «Estar disponible el…». |
| 193 | ⏳ La corre la IA el 20 oct en la tarde | Que lo descartado no vuelva | Un CSE descarta una propuesta y espera la próxima reunión de esa cuenta donde se hable de lo mismo. | No vuelve, ni a él ni a otra persona de esa cuenta. Si la deja vencer sin decidir, sí puede volver. |
| 198 | ✓ Validado por Claude 19 oct | Que el sprint siga igual | Alejandra Ortega, después de la reunión del sprint de marketing. | Siguen saliendo hasta 5 por persona. |

### Kickoff y cronograma

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 254 | ✓ Validado por Claude 20 oct | Por qué Cayalá salía con tareas vencidas y los años 1900 | La base en solo lectura: los cambios del cronograma de Cayalá, Cemaco y Spectrum, y toda columna de fecha. | El campo de fecha guardaba en cada tecla: escribir «2026» dejaba el año 0026 (1926 en el calendario). Cayalá estuvo en el año 0026 del 15 al 17 oct: por eso todo salía vencido. Hoy hay 0 fechas antes del 2000 en toda la base. |
| 255 | ✓ Validado por Claude 20 oct | Que la portada no se descuadre | Página de prueba con la portada real, en edición y en lectura. | Cada dato mide 53 px al editar y al presentar; el calendario flota sin mover nada; «+ Tag» en la línea de las etiquetas. |

### Preventa y exploración

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 170 | ✓ Validado por Claude 19 oct | Que una guía de proyecto vieja avise | Clientes › Cemaco Internacional › «Cemaco Internacional - CRM» › Exploración › próxima sesión › «Preparación». | Arriba, en ámbar: «Se armó antes de «Lo que ya sabemos»…» con «Actualizar la guía». La guía sigue igual (9 preguntas). |
| 171 | ✓ Validado por Claude 19 oct | Que el proyecto tenga «Lo que ya sabemos» | La misma pestaña, «Lo que ya sabemos». | 5 líneas: dos de reuniones y Retos, Resultados que persigue y Obstáculos, con «Confirmado en la estrategia». |
| 173 | ✓ Validado por Claude 19 oct | Que la guía de base también sea corta | Ferreteria Noelito › «Implementación CRM + Conexión SAP» › Exploración › Sesión 1 › «Preparación». | 5 preguntas (Retos, Resultados que persigue, Obstáculos y dos de la escala), ya no 8. |
| 174 | ✓ Validado por Claude 19 oct | Que cierre pensando en los resultados | Cualquiera de esas guías, tramo «Cerrar». | «¿Hay algo que no hayamos hablado y que deba saber para que el proyecto llegue a esos resultados?» |
| 256 | ✓ Validado por Claude 20 oct | Cuánto cuesta proponer preguntas para un objetivo | Cemaco, con el objetivo real de Liliana y con «…volúmenes de leads y tasa de conversión» (`scripts/medir-preguntas-del-objetivo.ts`, sin escribir). | Unos US$0,021 y de 9 a 11 s por corrida; 3 preguntas válidas (leads al mes, tasa de conversión, volumen que se quiere alcanzar). |
| 261 | ✓ Validado por Claude 20 oct | Por qué el asistente de la guía se quedaba en un tema | El contexto que recibía con Cemaco, en solo lectura (`scripts/ver-contexto-de-la-guia.ts`). | No recibía ninguna sesión, ni el objetivo de la próxima, el handoff, el kickoff ni la memoria del proyecto. Lo que pidió Marco estaba en un acuerdo de la minuta del 19 oct que la memoria recortaba a 560 caracteres. |
| 262 | ✓ Validado por Claude 20 oct | Que el asistente proponga lo que falta y no repita | Conversaciones reales con Cemaco y Tecnosagot, en hilos de prueba que se borraron. | Cemaco: en 3 de 4 corridas propuso leads por canal y su conversión, y nunca repreguntó por las agencias. Tecnosagot: retomó la meta de ventas y los leads de ferias. El primer turno cuesta US$0,09–0,15 y tarda 18–24 s; los siguientes, US$0,025–0,04. |
| 263 | ✓ Validado por Claude 20 oct | Que las preguntas del objetivo no nombren al equipo | Cemaco con «…lo que pidió Marco…», ya con todo junto en `main`. | «¿Cuál es hoy tu tasa de conversión de lead a venta?» (antes: «…que maneja Marco como referencia?»). US$0,021 y 8 s. |

### La cuenta: encargado, proyectos y ficha

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 115 | ✓ Validado por Claude 19 oct | Que Librería Internacional quede con un solo encargado | Clientes › «Librería Internacional»: abre la ficha y espera unos segundos. | La celda «CSE encargado» dice solo Caroline Bersot, ya no Heiver Gómez, y queda un solo «Librería Internacional \| HubSpot Refresh» activo (la fila vieja, fusionada en HubSpot, se da de baja sola en la primera sincronización). |
| 165 | ✓ Validado por Claude 19 oct | Que Lili entre directo a su proyecto | «Ver como» Liliana Moreno › Clientes › Cemaco Internacional. | Abre en «Cemaco Internacional - CRM», con su cronograma de 7 fases. |
| 166 | ✓ Validado por Claude 19 oct | Que cada quien entre a su proyecto | «Ver como» Breiner › la misma ficha. Después tu usuario. | Breiner: abre en «CEMACO » (Desarrollo). Tú: abre en la cuenta, con los dos proyectos en el riel. |
| 168 | ✓ Validado por Claude 19 oct | Que Cemaco y Total Finco queden en una sola ficha | Clientes › busca «Cemaco» y «Total Finco». Después Finanzas › Cobranza › Clientes. | Una sola «Cemaco Internacional» y una sola «Total Finco». En Cobranza, la cuenta de cobro de Cemaco con su servicio y sus 4 cobros, y la de Total Finco con la suya. |
| 200 | ✓ Validado por Claude 19 oct | Que cada quien abra en su proyecto | Clientes › Cemaco Internacional con «Ver como» Liliana Moreno, Alejandro Salas y Heiver Gomez; después Alexander Vanegas y tú. | Liliana y Heiver abren en «Cemaco Internacional - CRM»; Alejandro en «CEMACO»; Alex y tú en la cuenta. Arriba: «Esta cuenta tiene otro proyecto: …» con el enlace. |
| 206 | ✓ Validado por Claude 19 oct | Que Librería muestre a su encargada | Clientes, busca «libr», columna «CSE encargado». | «Caroline Bersot», sin «+1», y ya no aparece «Implementación HubSpot Refresh». |
| 209 | ✓ Validado por Claude 19 oct | Que el CSE de una cuenta nunca sea el desarrollador | Éxito del cliente › Cartera › Cemaco Internacional. | El CSE es Liliana, no Breiner. |

### SmartLoop y el servicio recurrente

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 30 | ✓ Validado por Claude 19 oct | Que Nexus recomiende SmartLoop al llegar a la entrega | 1) «Ver como» Juan Carlos Armijos › Para ti › «Esta semana». 2) Sal de «Ver como»: Selvatura › «SB Hotels \| CRM» › Resumen. | 1) «Propónle a Selvatura seguir con SmartLoop» (y otras cuentas en entrega), con «Ver la recomendación». 2) En el Resumen, aunque «Qué sigue» pida otra cosa, el bloque «Después de la entrega» con la recomendación, el porqué y «Dejar la tarea», «Abrir el alta» y «Descartar». Las de Ferretería Noelito y Cicadex (encargado que ya no está) le llegan a Alexander Vanegas. |

### Propuestas

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 25 | ✓ Validado por Claude 19 oct | Que el IVA se calcule bien en los dos sentidos | Inversión de una propuesta: una línea de servicios de 10000; «+ IVA (13%)»; después 11300 e «IVA incluido (13%)». | Con «+ IVA»: «IVA (13%) $1,300» y «Total con IVA $11,300». Con «IVA incluido»: «Monto sin IVA $10,000» e «IVA (13%) $1,300». (Las 14 pruebas de la cuenta pasan.) |
| 26 | ✓ Validado por Claude 19 oct | Que el IVA también vaya en lo mensual y en la forma de pago | Servicios 10000 (cobro único), licencia 1000 (mensual), «+ IVA»: el cierre de Inversión y «Forma de pago». | «Pago único + IVA» $10,000 · IVA $1,300 · total $11,300; «Por mes + IVA» $1,000 · IVA $130 · total $1,130. En «Forma de pago»: «Inversión de la implementación + IVA». |
| 60 | ✓ Validado por Claude 19 oct | Que cada licencia tenga su precio de lista y su margen, sin que el cliente lo vea | En una propuesta, licencia de 1000 al mes; en «Interno · precio de lista del proveedor»: 800, «al mes», «La factura Smarteam (reventa)»; después 1200. | «Margen: $200 al mes (20 %)…» en verde; con 1200, «Pierdes: $200 al mes (-20 %)…» en ámbar. No aparece en el link ni en el PDF (lo cuidan 18 pruebas de la frontera). |

### Comisiones

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 88 | ✓ Validado por Claude 18 oct | Que el caso de Marco se entienda | Finanzas › Modelos › Comisiones › «Cómo funciona» › «Descuentos y recurrencia». | 33.600 − 2.400 = 31.200, y al 5 %: US$1.560 en vez de US$1.680. |
| 89 | ✓ Validado por Claude 18 oct | Que la calculadora reaccione | La misma sección, a la derecha: deja 3.000 y 2.800; después baja «Lo que se cerró al mes» de 2.700. | «Hoy» US$1.680 y «Con la propuesta» US$1.560. Bajo 2.700 aparece «Lo aprueba Marco». |
| 90 | ✓ Validado por Claude 19 oct | Que estén las preguntas para Marco | Finanzas › Modelos › Comisiones › «Cómo funciona», al final, «Decisiones pendientes». | Las tres primeras: «¿Un descuento de más del 10 % lo aprueba Marco?», «¿Lo recurrente pesa 1,2 veces en la meta?» y «¿El descuento sale entero de la base de la comisión, o solo una parte?». |
| 91 | ✓ Validado por Claude 18 oct | Que la simulación muestre cada venta | «Simulación» › caja «Descuento y valor de 12 meses». | Cada venta con Tipo, Al mes, Valor 12 meses, Descuento, Para la meta y «antes → ahora». |
| 92 | ✓ Validado por Claude 19 oct | Que un descuento baje la comisión | «Simulación», vendedor «Andrés Pinzón», caja «Descuento y valor de 12 meses», fila «RC Inmobiliaria - Acuerdo Macro» (ya en «Al mes», 2.800): escribe 2400 en «Descuento 12 meses». | «Lo escribiste tú · 6,7 %». La comisión pasa a «US$ 1.680,00 → US$ 1.560,00» («5 % de US$ 31.200») y «Por sus ventas» de US$ 9.420 a US$ 9.300. (Lo simulé con los datos de hoy.) |
| 93 | ✓ Validado por Claude 19 oct | Que las decisiones se puedan probar | Con el descuento de la 92, en «Lo que falta decidir»: «¿El descuento sale entero…?» › «La mitad» y después «Nada»; «¿Lo recurrente pesa 1,2 veces…?» › «Como cualquier venta». | «La mitad»: «US$ 1.680,00 → US$ 1.620,00». «Nada»: sin diferencia. «Como cualquier venta»: RC «Para la meta» baja de US$ 40.320 a US$ 33.600 y octubre sigue en 5 %. (Lo simulé con los datos de hoy.) |
| 94 | ✓ Validado por Claude 19 oct | Que un descuento grande pida aprobación | Ventas › Propuestas › «Grupo Monge - Nuevo tipo de objeto Deal» › «2 · Propuesta», Inversión, debajo de los servicios. No edites nada. | «Descuento del 13,4 % en los servicios ($900 en 12 meses): pasa el 10 % y lo aprueba Marco antes de enviarla.» y «Aprobar el descuento». (Lo calculé con la misma función de la pantalla.) |

### Finanzas

| # | Estado | Prueba | Pasos | Resultado esperado |
| 281 | ✓ Validado por Claude 21 oct | Por qué la factura de AMVAC seguía pendiente | Las cuotas pendientes con factura en Odoo, contra Odoo en vivo. | No era el IVA: la cuota (1.848) y la factura sin IVA (1.848) se emparejaban. Odoo la dio pagada en el «Actualizar» de Alex de las 16:15, y el cobro de lo pagado ya había corrido a las 7:00. Lo mismo con Fomento Urbano. Las otras 30 pendientes con factura están impagas también en Odoo. |
| 282 | ✓ Validado por Claude 21 oct | Que AMVAC y Fomento quedaran cobradas | El cobro de lo pagado en producción, después del deploy de `da1fd3bf`. | AMVAC septiembre (US$1.848, FAC/2026/0354) cobrada el 14 oct y Fomento octubre (US$300, FAC/2026/0363) el 16 oct, con la firma del sistema y las fechas reales del pago en Odoo. |
|---|---|---|---|---|
| 34 | ✓ Validado por Claude 19 oct | Que las comisiones de Stripe y transferencias sumen como gasto | Conciliación › Gastos y Mercury › «Gastos financieros». Confirma una. | 81 comisiones para confirmar (US$350,67), sin duplicados; la suscripción de Mercury ya no sale (es la herramienta «Mercury») y la comisión por compras en el exterior dice «Comisión del banco». Lo confirmado suma como gasto financiero. Confirmarlas es de Admin. |
| 100 | ✓ Validado por Claude 18 oct | Que las ventas sin cobranza cuadren mejor | Punto de equilibrio › «De la venta a la caja» › «Dónde se queda la plata» › «ventas ganadas sin respaldo en cobranza» › «Ver las ventas». | US$171.059,93 en 44 ventas: 15 sin nada cargado, 25 que facturan menos de lo vendido y 4 de empresas que no están en Nexus. Aparte, US$68.321,61 ya cargados en cuotas sin facturar. (Antes se llamaba «Lo que no cuadra»; lo comprobé con los datos.) |
| 103 | ⏳ Lo reviso yo después del deploy | Que el cobro automático corra cada mañana | Integraciones › «Jobs del servidor», el día siguiente del deploy, desde las 7:00. | «El cobro de lo pagado en Odoo y Mercury» con punto verde y la fecha de la corrida. |

### Éxito del cliente

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 140 | ✓ Validado por Claude 19 oct | Que el aviso del vigía diga qué propone | «Ver como» Alex Vanegas › «Para ti» › «Lo que importa hoy». | «El vigía propone pasar 9 proyectos a «En riesgo»», debajo «La que más espera: Areyá · Areya - MKT + CRM: de «En fricción» a «En riesgo» (…)» y el botón «Decidir una por una». |
| 141 | ✓ Validado por Claude 19 oct | Que las propuestas se decidan en un solo lugar | Toca «Decidir una por una». También: Éxito del cliente › arriba a la derecha › «Propuestas del vigía». | «Propuestas del vigía» con 9 filas, la de Areyá resaltada y un solo botón azul «Confirmar «En riesgo»». |
| 215 | ✓ Validado por Claude 19 oct | Que el CSE entre a «Seguimiento de cuentas» | «Ver como» Juan Carlos Armijos › menú › Éxito del cliente. | Llega a «Seguimiento de cuentas» con «Las que llevas» (16), sin montos ni uso de HubSpot. |
| 216 | ✓ Validado por Claude 19 oct | Que la CSL vea el seguimiento de toda la cartera | «Ver como» Alexander Vanegas › Éxito del cliente › «Seguimiento de cuentas». | 48 cuentas, 35 sin sesión y 34 sin siguiente paso, con el filtro por CSE. Cada fila: «Próxima sesión», «Siguiente paso», «Temas que se están tratando» y «Última reunión». |
| 222 | ✓ Validado por Claude 19 oct | Que Ventas, Desarrollo y Marketing no entren | «Ver como» Andrés Pinzón y alguien de Desarrollo › menú. | No ven «Éxito del cliente» ni entran a la página. |

### El chat de Nexus

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 76 | ✓ Validado por Claude 18 oct | Que lea una nota entera | El mismo chat: «Lee la primera entera». | La nota completa, con su fecha y su autor. |
| 77 | ✓ Validado por Claude 18 oct | Que conteste lo prometido sin mezclar empresas | Clientes › kölbi › chat: «¿Qué le prometimos al cliente que sigue abierto?». | Los compromisos abiertos de kölbi, nada de otra empresa. |
| 235 | ✓ Validado por Claude 20 oct | Que el chat del cronograma lea la memoria del proyecto | Cayalá - WhatsApp Nativo (6 reuniones vinculadas, 0 elegidas): el material del chat y una conversación de verdad con dos pedidos, en un hilo de prueba que se borró. | El bloque trae los acuerdos de las 3 reuniones con el cliente (2.558 caracteres, sin el handoff interno). El chat contestó el arranque del 19 oct citando la reunión del 9 oct (7,9 s) y propuso la tarea del cliente (6,2 s); aplicada en memoria, sin rechazos. |

### La escala

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 46 | ✓ Validado por Claude 18 oct | Que la escala guarde su historia | En Cemaco › La cuenta › La escala, mira «La escala en el tiempo». Confirma un nivel en La escala de su Exploración, vuelve y toca «Guardar esta versión»; tócalo otra vez. | La versión del 17 oct ya está. Después de confirmar, «Qué cambió desde el 17 oct» dice qué dimensión subió o bajó. La segunda vez: «Esta versión ya estaba guardada: nada cambió desde la última». |
| 51 | ✓ Validado por Claude 19 oct | Que las ediciones Turismo y Automotriz digan lo que pasa en esas industrias | Escala › Ventas › «Industria» › Turismo o Automotriz. | Publicadas en la 8.9.0 (19 oct, a tu nombre): las dos ediciones se ven en la escala y Nexus reconoce esas industrias al elegir la edición de una empresa. |

### Rentabilidad, la meta y el uso

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 61 | ✓ Validado por Claude 18 oct | Que lo vendido llegue a Finanzas | Finanzas › Punto de equilibrio › «Licencias revendidas». | Las 6 propuestas ganadas y ninguna entra todavía, cada una con su porqué: Areyas, Cemaco y Spectrum no dicen quién factura la licencia ni su precio de lista; Multiquímica no tiene montos en la Inversión; Cayalá y RC Inmobiliaria no venden licencias. |
| 82 | ✓ Validado por Claude 18 oct | Que la meta se vea contra lo facturado | Éxito del cliente › Rentabilidad, arriba de las pestañas. | «La meta del año: US$ 2,3 M en 2027», una barra por año desde 2021 con lo facturado y «Qué falta para la meta de 2027» (US$2.183.572). ⚠ 2023 no tiene facturas y 2024 solo 8: la copia de Odoo de esos años parece incompleta. |
| 85 | ✓ Validado por Claude 18 oct | Que se vea el margen por persona | Rentabilidad › Costo de la hora › Por persona. | Las columnas «Generado» y «Margen», por nombre, en orden alfabético. |
| 87 | ✓ Validado por Claude 18 oct | Que el punto de equilibrio muestre la meta y lo que falta | Finanzas › Punto de equilibrio, al final. | La misma barra de la meta y una tabla mes a mes: Por facturar, Recurrencia, Proyectos, Expansiones y Falta. |

### El gasto de la IA

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 64 | ✓ Validado por Claude 18 oct | Que el gasto de la IA se vea por mes | Integraciones › Gasto en IA › «Por mes». | Agosto US$26,49 (desde el 17), septiembre US$33,27 y octubre US$78,73, lo automático y lo humano por separado. (Las cifras las comprobé yo; si quieres, mira el gráfico.) |
| 65 | ✓ Validado por Claude 18 oct | Que el tope diario esté a la vista | La misma pestaña, «El tope diario». | Automático US$10 y humano US$20, «solo avisa», cuántos días lo pasaron y el tope sugerido. |
| 66 | ✓ Validado por Claude 18 oct | Que se proyecte el gasto de los próximos meses | Pestaña «Proyección»: prende y apaga los escenarios. | Hoy unos US$86 al mes; con los hechos prendidos, unos US$98, y con los hechos y las tres palancas de ahorro, unos US$85 (sin los hechos, las palancas lo bajan a unos US$80). Nada se guarda al recargar. |

### Equipo, acceso y datos

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 42 | ✓ Validado por Claude 18 oct | Que «Ver como» no deje escribir como otra persona | Equipo › una persona › «Ver como»; navega un poco y toca «Volver a mi usuario». | Nexus como lo ve esa persona, sin poder escribir como ella. «Volver a mi usuario» te devuelve. |
| 81 | ⏳ Lo reviso yo después del deploy | Que la copia corra sola | Integraciones › «Jobs del servidor», el día siguiente del deploy, entre las 6:00 y las 20:00. | «La copia de los correos, notas y llamadas de HubSpot» con punto verde y la hora de la corrida. |

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
| 15 | María José o Alex Arrieta | Cobranza › Fundauna: la factura FAC/2026/0359 (pagada) cubre dos cuotas sin el número anotado; anotarlo en las dos para que se cobren |
| 16 | María José o Alex Arrieta | Cobranza › Honda, septiembre: la cuota apunta a la FAC/2026/0347, que Odoo anuló; cambiarla a la 0348 |
| 17 | María José o Alex Arrieta | Ferretería Noelito INV-60: pagada en Mercury sin una entrada de plata con su fecha; confirmar el día del pago a mano |


## Hecho

Lo que ya está en producción, por tema. Cada tarjeta se abre para ver el detalle; las pruebas que ya validaste están al final.

### Para ti y la agenda <span class="estado">En producción</span>

1. [hecho] Un inicio por equipo: Ventas (meta, negocios y cartera), Customer Success (sus cuentas), la CSL (toda la cartera), Desarrollo y Marketing (sus tareas).
2. [hecho] «Lo que importa hoy» del CSE y la CSL en tres bloques: reuniones de los próximos días, cuentas sin siguiente paso y pendientes sin seguimiento. A la CSL le llega primero la limpieza de HubSpot que deja cuentas sin dueño.
3. [hecho] Una reunión agendada cuenta como el siguiente paso, también para Ventas.
4. [hecho] La agenda es la de Google Calendar: todos los eventos, lado a lado si se pisan, de lunes a viernes, sin abrir nada solo.
5. [hecho] Crear eventos y «Agendar» desde la agenda, con el borrador en Nexus antes de abrir Calendar; sugerencias del tamaño de cada tarea que respetan el almuerzo.
6. [hecho] Un evento propio o una reunión interna que nombra una cuenta se abre en el panel con lo de esa cuenta.
7. [hecho] La meta de HubSpot de cada vendedor, copiada cada hora, y el aviso cuando no hay meta.
8. [hecho] Lo que sale de una reunión le llega a quien le toca: lo de venta o negociación al dueño del negocio, y el aviso de las 48 horas a quien se le propuso, no a quien lleva la cuenta.
9. [hecho] Los menús de la barra lateral (el del avatar y los desplegables) se abren siempre encima del contenido, en todas las pantallas y temas.
10. [hecho] «Preparar» abre el panel de la reunión en la agenda, con la guía, la búsqueda en las reuniones y los pendientes que se marcan hechos, se desestiman o se agendan ahí mismo.
11. [hecho] «Ya la agendé» en una cuenta sin siguiente paso: se elige la reunión del calendario y Nexus la verifica; cuenta como siguiente paso hasta 30 días.
12. [hecho] Las tareas nuevas de las reuniones llegan en una sola línea a Tareas, y el espacio libre nombra cada tarea «Cliente – nombre corto».
13. [hecho] Las alertas del vigía ya no saltan encima de la pantalla: siguen en Éxito del cliente y en «Para ti» de la CSL.
14. [hecho] La agenda muestra solo de 8:00 a 17:00, con «Ver el calendario completo».
15. [hecho] La guía de una reunión sin otra fuente toma el tema del título de la invitación.

### Tareas <span class="estado">En producción</span>

1. [hecho] En la ficha de cada cliente, todas las tareas de Smarteam con esa cuenta, por equipo.
2. [hecho] Cada equipo configura su sprint; de su reunión salen hasta 5 tareas por persona, y lo que el tope deja afuera se recupera con «Proponérmelas».
3. [hecho] De las reuniones y los correos con clientes salen como mucho 3 tareas esenciales por persona («Enviar el reporte a CEMACO»), y lo descartado no vuelve.
4. [hecho] Un seguimiento por reunión y cuenta para lo que prometió el cliente; lo rápido plegado por cuenta; Nexus sugiere cerrar lo viejo.
5. [hecho] Marcar hecha y deshacer al instante; el panel de la tarea dice si guardó.
6. [hecho] «Planifica tu semana», de viernes a domingo.
7. [hecho] Las propuestas se deciden solo en Tareas, con «Usar las N» por reunión; la página de la sesión las muestra para leer.
8. [hecho] El nombre corto de cada tarea lo escribe la IA cada 10 minutos (job «titulos-cortos»).
9. [hecho] Una propuesta de tarea abre corta, con «Descartar», «Más adelante» y «Usar» abajo; el cajón se titula con el nombre de la tarea.

### Preventa y exploración <span class="estado">En producción</span>

1. [hecho] La guía lleva a la siguiente pregunta lógica: «Lo que ya sabemos», unas 5 preguntas cortas con su ⓘ y el cierre con lo que falta para proponer.
2. [hecho] Regenerar, editar, borrar y agregar preguntas, y el asistente que las mejora con un clic.
3. [hecho] La exploración de los proyectos de clientes con lo mismo, sobre la estrategia del cliente y lo vendido.
4. [hecho] El correo de seguimiento y la próxima reunión sugerida después de cada sesión.
5. [hecho] En la guía de una sesión (proyecto y preventa): el objetivo propone unas tres preguntas para usar o descartar, las preguntas se arrastran y la pantalla se pone al día sola cuando el asistente las cambia.
6. [hecho] El asistente y el agente de la guía leen todas las sesiones de la exploración (lo respondido, lo acordado para la próxima), el kickoff y la memoria del proyecto; en la preventa, lo de HubSpot.

### La cuenta: encargado, proyectos y ficha <span class="estado">En producción</span>

1. [hecho] «Quién lleva la cuenta» sale de una sola regla; el CSE se cambia desde la ficha, Éxito del cliente y la cartera de la CSL, y queda.
2. [hecho] El pase de cuenta mueve lo abierto al encargado nuevo, también cuando cambia en HubSpot.
3. [hecho] Con varios proyectos, cada quien abre en el suyo, con el aviso «Esta cuenta tiene otro proyecto».
4. [hecho] Los proyectos fusionados en HubSpot se dan de baja solos; Cemaco, Total Finco y Librería Internacional quedaron en una sola ficha.
5. [hecho] El riel separa herramientas y entregables; los documentos tienen plantillas.

### SmartLoop y el servicio recurrente <span class="estado">En producción</span>

1. [hecho] Un catálogo de servicios recurrentes con su cadencia y sus rutinas; la guía del servicio en el Resumen y SmartLoop como ciclo.
2. [hecho] El cronograma del ciclo, el aprendizaje y el cierre, y la ruta del servicio para el cliente.
3. [hecho] Pasar un proyecto a recurrente desde la ficha, y la recomendación de SmartLoop al llegar a la entrega.

### Propuestas y comisiones <span class="estado">En producción</span>

1. [hecho] Proyecto o servicio recurrente al crear la propuesta; la plantilla recurrente con lo que se vendía a mano.
2. [hecho] Licencias aparte, con su precio de lista y su margen, que el cliente no ve; lo vendido llega a Finanzas.
3. [hecho] Módulos nativos (casos de uso, licencias, fases) y una biblioteca de módulos con «Adaptar a esta empresa».
4. [hecho] «+ IVA» o «IVA incluido» para Costa Rica.
5. [hecho] La propuesta de comisiones que cuida el valor de la cuenta, con su simulación, y la aprobación de descuentos de más del 10 %.
6. [hecho] El modelo de comisiones cerrado con Marco: sin el factor 1,2, el descuento contra la primera propuesta, el bono de liderazgo por persona, ventas que se caen en 90 días, renovaciones, venta compartida, techos (solo Super Admin) y quién ve qué.

### Finanzas <span class="estado">En producción</span>

1. [hecho] Lo pagado y conciliado en Odoo y Mercury se cobra solo cada mañana.
2. [hecho] El menú simplificado, Conciliación en una sola fila y el punto de equilibrio con solo lo del año.
3. [hecho] Licencias revendidas, gastos financieros y el detalle de cada factura.
4. [hecho] Las comisiones de partners aceptan cero y dicen si el monto es estimado o el real de la factura del aliado.
5. [hecho] «Actualizar» trae Odoo y Mercury y cobra lo pagado en el momento; las copias y el cobro corren cada hora de 7:00 a 19:00.
6. [hecho] Una cuota cargada con IVA que tiene el número de su factura queda unida a ella y espera en «Lo pagado».

### Éxito del cliente y rentabilidad <span class="estado">En producción</span>

1. [hecho] «Seguimiento de cuentas»: próxima sesión, siguiente paso y temas por cuenta; el CSE entra solo a esta página.
2. [hecho] Las propuestas del vigía se deciden en un solo lugar y dicen de qué a qué.
3. [hecho] La lista de limpieza de HubSpot, los exclientes fuera de todo y la cartera por proyectos.
4. [hecho] El margen por cuenta y por persona con las horas del calendario y las tareas, la meta del año y la lectura de los números.

### Kickoff y cronograma <span class="estado">En producción</span>

1. [hecho] La fecha de arranque del kickoff se elige en un calendario (propone la reunión de kickoff) y ya no deja años como 0026 o 1926; el servidor rechaza fechas fuera de 2000–2100.
2. [hecho] La fila de datos de la portada se edita como las etiquetas (agregar, quitar, reordenar, editar texto y etiqueta), alineada al editar y al presentar.
3. [hecho] Una sección oculta queda oculta aunque no se publique, y el cliente y el PDF ven lo mismo que por dentro.
4. [hecho] El chat del cronograma lee la memoria del proyecto: sabe lo que se habló con el cliente aunque nadie haya elegido reuniones.
5. [hecho] El calendario de la fecha de arranque se abre encima de la sección siguiente.

### Reuniones, memoria y la escala <span class="estado">En producción</span>

1. [hecho] Cada reunión se lee una vez y queda como memoria de la cuenta; los correos, notas y llamadas de HubSpot también entran.
2. [hecho] Cada reunión con su página, sus tareas y su correo de seguimiento.
3. [hecho] La escala con ediciones por industria (Turismo y Automotriz nuevas), «Actualizar escala» con todo el contexto y la historia amarrada a la venta.
4. [hecho] El chat de Nexus sobre la cuenta, con sugerencias y documentos con plantilla.
5. [hecho] El gasto de la IA por mes, con su proyección, el tope que frena y la factura.

### Pruebas que ya validaste

#### Para ti y la agenda

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 1 | ✓ Validado 17 oct | Que cada persona vea su propio inicio | Con «Ver como» Andrés, abre «Para ti»; después repite con un CSE. | Arriba, los números del día; al centro, la agenda como Google Calendar; a la derecha, «Tu cartera» (Andrés) o «Tus cuentas» (el CSE). |
| 2 | ✓ Validado 19 oct | Que las notas de una reunión no se pierdan y sean privadas | Con tu usuario, en «Para ti» › «Tu día», toca en la agenda una reunión tuya con un cliente de hoy y otra que ya pasó. Escribe algo en «Tus notas» y espera «Guardado». Cierra el panel y vuelve a abrirlo. Después, con «Ver como» Liliana Moreno, abre en su agenda una reunión de ella con un cliente. | En las dos aparece «Tus notas» y la nota sigue ahí al volver. Con «Ver como» Liliana, el panel trae su guía y lo pendiente; en lugar de las notas dice «Las notas son de cada persona: mientras ves Nexus como otra persona no se ven ni se escriben.» |
| 3 | ✓ Validado 17 oct | Que una cuenta sin acción ni reunión aparezca | Con «Ver como» un CSE que tenga una cuenta sin tarea esta semana, mira la primera tarjeta de «Para ti». | La línea «Sin acción ni reunión» con esa cuenta y el botón «Agendar». |
| 4 | ✓ Validado 17 oct | Que Marketing vea sus tareas internas | Con «Ver como» alguien de Marketing, abre «Para ti». | Sus tareas internas, ordenadas por ámbito (Smarteam, SmartAgro). |
| 5 | ✓ Validado 17 oct | Que «Lo que importa hoy» tenga como mucho 5 cosas | Abre «Para ti» con tu usuario y mira la primera tarjeta. Si una cuenta tiene varias cosas, abre su «+N». | Como mucho 5 cosas, una por cuenta. Lo demás de esa cuenta queda plegado en «+N en esta cuenta», y lo que no entra va a «También para hoy». |
| 6 | ✓ Validado 17 oct | Que se pueda crear un evento desde la agenda | Toca una hora vacía de hoy (por ejemplo, las 10). Escribe un título, busca un contacto por su nombre o su empresa, elígelo y toca «Abrir en Google Calendar». | Aparece un bloque azul «borrador» de una hora. Al elegir el contacto, la cuenta se llena sola. Google Calendar se abre con el título, la hora, el invitado y el enlace a la cuenta en la descripción. El bloque queda «abierto en Calendar, sin guardar», con «Ya lo guardé». |
| 10 | ✓ Validado 17 oct | Que el CSE tenga su cartera, armada con sus proyectos | Con «Ver como» un CSE, toca «Tu cartera». Prueba «Todos los proyectos», el buscador y una cuenta que le compartieron. | Sus empresas en «Para atender», cada una con el nombre grande, sus proyectos y su etapa, el último contacto, la próxima reunión y la acción de la semana (✓ u ○). Una compartida dice «Compartida», sin color ni monto. |
| 11 | ✓ Validado 17 oct | Que Alex vea toda la cartera de Customer Success, y no la de Ventas | Con «Ver como» Alex, abre «Para ti» › «La cartera». Abre «Por CSE»; después filtra «Pipeline» › Desarrollo. | No aparece la cartera de Ventas ni «Negocios traídos de HubSpot». «Por CSE» trae un bloque por CSE, en orden alfabético, con sus cuentas en riesgo, sin acción y sin contacto, y «Sin CSE» al final. Con el filtro, solo las empresas con un proyecto de desarrollo. |
| 12 | ✓ Validado 18 oct | Que el monto solo lo vea quien vende | Con «Ver como» Andrés, abre «Para ti» › «Tu cartera» y busca una empresa con un negocio abierto. Después, con «Ver como» un CSE que lleve esa empresa, mírala en su cartera. | Andrés ve «N negocios abiertos · US$ …» en la fila. El CSE ve la misma empresa sin el monto. (Con tu usuario no hay cartera: la tienen quienes venden y quienes llevan cuentas.) |
| 49 | ✓ Validado 19 oct | Que el CSE planifique la acción desde su cartera y vea el uso de HubSpot | Con «Ver como» Juan Carlos Armijos, «Para ti» › «Tu cartera» › vista «Para atender». En «ALFA+ (LISJ)» toca «Planificar acción». No lo guardes en Calendar. | Cada cuenta dice «Uso de HubSpot N de 100» con «↑ sube», «↓ baja» o «→ igual» (ALFA+: 55, baja); una cuenta sin relación gestionada lo dice con la fecha. Al tocar «Planificar acción» pasas a «Tu día», con un borrador en la agenda y su cuadro abierto («Reunión con ALFA+ (LISJ)», la hora, la cuenta y el contacto) y «Abrir en Google Calendar» y «Descartar». |
| 145 | ✓ Validado 19 oct | Que Liz vea su meta | «Ver como» Liz Navarro › «Para ti». | La tarjeta «Tu meta 2026» con «0 %» y «US$0 de 30K». En «Tu cartera», la primera tarjeta es «Tu meta 2026» con «0 % según HubSpot». |
| 150 | ✓ Validado 19 oct | Que un evento propio se abra en el panel | «Ver como» Andrés Pinzón › «Para ti» › semana del 19 al 23 oct › toca «Tenis». | El panel de la derecha con «Tenis», el día y la hora, «Evento tuyo, sin otros invitados» y «Abrir en Google Calendar» como enlace. No se abre otra pestaña. |
| 152 | ✓ Validado 19 oct | Que un evento personal no se asigne a un cliente | La misma agenda › toca «Cita Médica». | Solo el título, la hora y el enlace a Calendar, sin cuenta. |
| 153 | ✓ Validado 19 oct | Que las notas de un evento propio queden | Tu agenda, sin «Ver como» › un evento tuyo › escribe en «Tus notas» y vuelve a abrirlo. | Dice «Guardado» y la nota sigue ahí. |
| 8 | ✓ Validado 20 oct | Que los espacios libres sugieran con qué usarlos | En la agenda (semana), toca un «Espacio libre» punteado de hoy o de un día que viene. Toca «Usar» en una sugerencia. Después toca una hora vacía y mira «Evento nuevo». Toca afuera o la X. | La agenda es de lunes a viernes (un sábado o domingo muestra la semana que viene) y de 8 a 5. El panel dice «Espacio libre» y «Con qué usar este espacio»: tus tareas que caben, «Reunión con…» de una cuenta sin reunión y el siguiente paso. «Usar» deja el borrador lleno en esa hora. Una hora vacía trae las mismas sugerencias, y la usada dice «✓ Usando». Tocar afuera o la X lo suelta. |
| 78 | ✓ Validado 20 oct | Que avise de lo prometido sin tomar, y no de lo ya agendado ni de lo interno | Con «Ver como» Andrés Pinzón, abre «Para ti». Después, con «Ver como» Caroline Bersot. | A Andrés: «Universidad Monterrey: un compromiso en una reunión lleva N días sin que nadie lo tome» y lo mismo de Tecnosagot. Accesos Automáticos no avisa: la demo del 21 oct ya está en su calendario. A Caroline: los compromisos de Honda Costa Rica sin tomar. No avisan una reunión interna ni una mención de «la sesión» (T-103 de Seléctrica). |
| 80 | ⏳ La valida el equipo | Que el aviso se vaya al resolverlo | Juan Carlos Armijos, con su usuario (con «Ver como» no se puede usar una tarea): en «Para ti», «Metzger Supplies: un compromiso … sin que nadie lo tome» › «Tomarlo o decidir», y en la tarea toca «Usar». | La línea de Metzger ya no aparece en su «Para ti», ni en el de Alex. (La regla «si alguien la tomó, no avisa» está probada.) |
| 120 | ✓ Validado 20 oct | Que no se abra ninguna reunión sola | «Ver como» Andrés Pinzón › «Para ti». | No se abre ningún panel a la derecha hasta que tocas un evento o un espacio. |
| 124 | ✓ Validado 20 oct | Que las sugerencias sean del tamaño de la tarea y respeten el almuerzo | La misma semana: un bloque azul «Avanza T-…»; después mira de 12:00 a 13:00 cualquier día. | El bloque dice «Sugerido 13:00–14:00» (el tamaño de la tarea), nunca un espacio de varias horas. De 12:00 a 13:00 no hay sugerencias (Andrés no tiene almuerzo marcado). |
| 129 | ✓ Validado 20 oct | Que lo opcional o «quizás» se vea más claro | Con alguien que tenga un evento con «quizás» u opcional, en su agenda. | Ese evento se ve más claro y al pasar el mouse dice que igual ocupa su tiempo. |
| 148 | ✓ Validado 20 oct | Que las metas de antes sigan igual | «Ver como» Andrés Pinzón y Marco Salas › «Para ti». | «Tu meta 2026» con su avance: Andrés unos US$220K de 335K, Marco unos US$301K de 400K. |
| 151 | ✓ Validado 20 oct | Que una reunión interna que nombra una cuenta la muestre | «Ver como» Andrés Pinzón › «Para ti» › agenda › mié 21 › «Preparar demo para Accesos Automáticos» (9:00–10:00). Después «Andrés: rol, metas y esquema de comisiones». | Debajo del título, «Interna · Accesos Automáticos · prospecto», con «Unirse a Meet», «Abrir en Calendar» e «Ir a la cuenta», y más abajo «La próxima reunión», «El siguiente paso», «Pendiente», «La última vez» y «El negocio». La otra sigue «Interna», sin cuenta. |
| 182 | ✓ Validado 20 oct | Que el CSE vea las cuentas sin siguiente paso | «Ver como» Juan Carlos Armijos › «Para ti» › «Cuentas sin siguiente paso» › «Ver las 13 en la cartera». | 3 cuentas con «Agendar», «se ven 3 de 13…» y el enlace; sin «Estabilizar». La cartera abre en «Sin siguiente paso» y las cuentas con reunión dicen «✓ Siguiente paso: reunión …». |
| 187 | ✓ Validado 20 oct | Que «Sugerencias» no pida el paso si hay reunión | Ficha de Cemaco › chat de Nexus › «Sugerencias». | No aparece «Fija el siguiente paso de Customer Success con …». |
| 230 | ✓ Validado 20 oct | Que sin meta la tarjeta lo diga | «Ver como» Alexander Arrieta › «Para ti» y «Tu cartera». | La tarjeta «Tu meta 2026» con «—» y «Aún no tienes una meta configurada.» |
| 264 | ✓ Validado 20 oct | Que «Preparar» abra el panel de la reunión | Con «Ver como» Caroline Bersot › «Para ti» › «Lo que importa hoy» › en «Reuniones con tus cuentas», «Preparar» en una. | Se abre el panel a la derecha, sin cambiar de página, con la guía de la reunión, quién viene, «Pendiente» y «Buscar en las reuniones». Si la reunión es de otro día, la agenda va a ese día. |
| 267 | ✓ Validado 20 oct | Que las tareas nuevas lleguen en una sola línea | Con «Ver como» Caroline Bersot › «Para ti». | Una línea «Tienes tareas nuevas de las reuniones con …» con «Revisar en Tareas», que lleva a Tareas. Ningún botón de «Para ti» lleva a la página de una sesión para decidir; «Tomarlo o decidir» abre la tarea. |

#### Kickoff y cronograma

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 242 | ✓ Validado 20 oct | Que la fila de datos se edite como las etiquetas | La portada › «+ Dato»: escribe «3 integraciones» con la etiqueta «Alcance»; quita «Hoja de ruta» con la ×; arrastra el dato nuevo al primer lugar; recarga. | La fila queda en ese orden, también después de recargar. |
| 244 | ✓ Validado 20 oct | Que la portada se vea alineada | La portada, al editar y al presentar. | «+ Tag» en la misma línea que la última etiqueta y «+ Dato» al final de la fila de datos; todos los datos del mismo alto. |
| 245 | ✓ Validado 20 oct | Que una sección oculta siga oculta sin subir | Cualquier sección del kickoff › el ojo › ocultarla. No subas; recarga la página (y al día siguiente, otra vez). | Sigue oculta. |
| 246 | ✓ Validado 20 oct | Que el cliente vea lo mismo que por dentro | «Subir al cliente» y abre el enlace del cliente; después «Exportar PDF». | La portada con la fecha de arranque y los mismos datos que por dentro, en el enlace y en el PDF. |
| 241 | ✓ Validado 20 oct | Que la fecha de arranque se elija en un calendario | Clientes › Cayalá › «Cayalá - WhatsApp Nativo» › Kickoff › en la portada, clic en «26 oct 2026». Elige el 2 de noviembre y después vuelve al 26 de octubre. | Se abre un calendario en octubre de 2026, sin un campo encimado, y la fila no se mueve. La portada y el Gantt dicen la fecha elegida, sin años raros. (Arreglado el 20 oct: el calendario quedaba debajo de la sección siguiente.) |

#### Preventa y exploración

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 68 | ✓ Validado 18 oct | Que la guía arranque con lo que el cliente ya dijo | Ventas › Preventa › Distribuidora Larce › Exploración › la próxima sesión (si no hay: «+ Agregar sesión» › una sin reunión todavía) › Preparación. | Arriba de «La guía», «Lo que ya sabemos» con 5 líneas en palabras del cliente. La primera: «Cuando un deal se enfría no hay red de contención…», con «Nota del 15 oct» al lado. |
| 69 | ✓ Validado 18 oct | Que las preguntas sean cortas, con su fuente en un ⓘ | Larce › Exploración › la próxima sesión › Preparación › «La guía» › «Preguntar». Pasa el mouse por el ⓘ de una pregunta. | Cada pregunta es solo la pregunta, corta, sin «Dijiste que…» ni «En el diagnóstico dijeron…». El ⓘ muestra lo que dijo el cliente, con sus palabras, y de dónde sale. «Lo que ya sabemos» sigue con las palabras del cliente. |
| 70 | ✓ Validado 18 oct | Que la guía nueva lleve a la siguiente pregunta lógica | El aviso de arriba › «Actualizar la guía». Espera unos segundos. | 5 preguntas que nombran lo que dijo el cliente y preguntan cuánto le costó, cómo lo quiere resolver o con qué. Ninguna de «Para cuándo», porque ya se sabe. |
| 71 | ✓ Validado 19 oct | Que las repreguntas se mejoren con el asistente | En la guía › «Mejorar con el asistente» › escribe: «Mejora las repreguntas de la pregunta 2 para que bajen a números» › Aplicar. | El chat de la cuenta abre con la guía en foco y propone las repreguntas nuevas en una lista; al aplicar, la pregunta 2 trae esas repreguntas. |
| 72 | ✓ Validado 18 oct | Que siempre cierre | Baja a «Cerrar», al final de la guía. | La pregunta de cierre, el siguiente paso con fecha y lo que falta para proponer, sin espacios por completar. |
| 73 | ✓ Validado 18 oct | Que lo que cubre la guía vaya pegado a ella | Larce › Preparación, arriba de «Retos de su industria». Después quita una pregunta. | «Lo que cubre la guía»: los siete puntos para proponer (verde listo, azul lo cubre la guía, punteado no) y las dimensiones que pregunta. Al quitar la pregunta, cambia al instante. En el panel derecho queda solo «N de 7 listos». |
| 74 | ✓ Validado 18 oct | Que funcione igual en otras preventas | Ventas › Preventa › CreditForce (o Cicadex) › Exploración › Preparación › «Actualizar la guía». | «Lo que ya sabemos» con frases del test y 4 o 5 preguntas que parten de ahí. (Lo validé yo, en seco: CreditForce pasó de 7 a 4 preguntas y Cicadex de 7 a 5, y Cicadex ya no pregunta «para cuándo» porque ya se sabía.) |
| 105 | ✓ Validado 19 oct | Que se puedan agregar preguntas a mano | En la guía › «+ Agregar pregunta»: escribe una, guárdala, edítala. Después toca «Actualizar la guía». | La pregunta aparece al final marcada «Tuya» y sigue ahí después de actualizar la guía. Se puede quitar. |
| 106 | ✓ Validado 19 oct | Que el asistente arme la guía con lo que pides | En la guía › «Mejorar con el asistente» › «Agrega dos preguntas de la escala sobre cómo miden el pipeline» › Aplicar. | La caja dice «2 cambios para aplicar», sin repetir la lista en el texto, y responde en unos segundos. Al aplicar: «Listo: …», dos preguntas nuevas, cortas, marcadas «Del asistente», y «Lo que cubre la guía» suma esas dimensiones. Ninguna repite lo que ya dijo el cliente. |
| 107 | ✓ Validado 19 oct | Que el asistente no invente lo interno | En el mismo chat: «Agrega una pregunta sobre el presupuesto que nos dijeron». | No pone montos ni lo interno como si lo hubiera dicho el cliente: pregunta el rango o contra qué lo comparan. (Validada el 18 oct; el chat cambió después.) |

#### SmartLoop y el servicio recurrente

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 44 | ✓ Validado 17 oct | Que el paso de «Continuidad» a SmartLoop encuentre los proyectos | `npx tsx scripts/migrar-continuidad-a-smartloop.ts` (lo corrí yo, en simulacro) | Ministerio de Economía y TEC, los dos en Diagnóstico, a confirmar con Customer Success. No escribe nada. |

#### Finanzas

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 96 | ✓ Validado 18 oct | Que el menú quede en lo que usas | Menú › Finanzas. | No están Pendientes, Comisiones de vendedor, Aguinaldo, Rentabilidad, Tipo de cambio ni Integraciones. Sí: Planilla, Conciliación, Punto de equilibrio, Caja neta, Reportes de cobranza y Comisiones. |
| 97 | ✓ Validado 19 oct | Que Odoo y Mercury estén dentro de Conciliación | Finanzas › Conciliación. Debajo del botón «Actualizar desde Odoo y Mercury» toca «Odoo», vuelve, y después «Mercury» e «Integraciones». | Una sola fila de pestañas: «Lo que no cuadra · Lo pagado · Emparejar · Libro de Alex · Gastos y Mercury». Debajo del botón: «Odoo: copia del … · Mercury: copia del … · Integraciones». Cada página abre con «‹ Conciliación» arriba del título, que te devuelve. El menú sigue marcando Conciliación. |
| 99 | ✓ Validado 18 oct | Que el tipo de cambio esté dentro del punto de equilibrio | Punto de equilibrio › arriba a la derecha › «Tipo de cambio». | La página del tipo de cambio con «← Punto de equilibrio» para volver. |
| 101 | ✓ Validado 18 oct | Que las hojas viejas de Costos lleven a la nueva | Escribe `/finanzas/costos` en la barra de direcciones; después `/finanzas/costos/tarjetas`. | Te lleva a Recurrentes, y la segunda a Tarjetas. |
| 102 | ✓ Validado 18 oct | Que «Volver» no lleve a una hoja vieja | Planilla › Comisiones de vendedor › «Volver». | Vuelve a la Planilla. |

#### Rentabilidad, la meta y el uso

| # | Estado | Prueba | Pasos | Resultado esperado |
|---|---|---|---|---|
| 43 | ✓ Validado 17 oct | Que la foto de los meses pasados se pueda armar | `npx tsx scripts/fotografiar-meses-del-margen.ts` (lo corrí yo, en simulacro) | Nueve meses, de enero a septiembre, cada uno con lo cobrado y facturado, la planilla y las horas, y «Simulacro: no se escribió nada». |

## Cómo funciona Nexus

En pocas palabras, para ubicarse. El detalle está en la Documentación de Nexus y en `docs/DECISIONS.md`.

- **La cuenta es el centro.** Todo lo que Smarteam hace con un cliente cuelga de su ficha: proyectos, reuniones, tareas, la escala, las propuestas, lo que se cobra.
- **Cada reunión se lee una vez** y deja su minuta, sus tareas propuestas y sus hechos; eso es la memoria de la cuenta, que leen los agentes, la preventa, el chat y los documentos. Los correos y notas de HubSpot entran igual.
- **El siguiente paso de una cuenta** es su próxima tarea con fecha o su próxima reunión agendada. Sin eso, la cuenta aparece en «Para ti» de quien la lleva.
- **Quién lleva la cuenta** sale de HubSpot («CSE Encargado») y de una sola regla en Nexus; de ahí salen las alertas, «Para ti», las carteras y las tareas.
- **«Para ti»** es lo primero que ve cada persona: lo que importa hoy, su agenda (la de Google Calendar) y su cartera.
- **Nexus propone y una persona decide.** Lo que propone la IA (tareas, niveles de la escala, campos de la ficha) espera un «Usar» o un «Descartar»; lo descartado no vuelve.
- **La escala** dice dónde está cada cliente y qué lo mueve: Ventas la usa para vender y Customer Success para planear cada ciclo.
- **Nada escribe solo en HubSpot, Google Calendar u Odoo** sin una persona, salvo el cobro de lo ya pagado y conciliado.

**Cómo se construye:** lo que cambia seguido es configuración y no código; una sola puerta por cosa; nada corre solo ni para todos; SQL solo aditivo, antes del deploy; cada regla es una función pura con su prueba; cada agente nuevo se mide desde el primer día; sin sobreingeniería.

## Cómo se mantiene este roadmap

1. **Lo edita una sola sesión: la que junta las ramas en `main`.** Las demás terminan con un bloque «Para el roadmap» y la que junta lo copia.
2. **El roadmap tiene solo lo que falta.** Lo que llega a producción pasa a «Hecho», por tema, en el mismo commit en que se despliega.
3. **Una prueba entra cuando su código está en `main`**, con el camino exacto, el cliente o la persona y un resultado que se ve en la pantalla.
4. **Antes de pedirte una prueba, la compruebo yo** con los datos de producción. Lo que se comprueba sin pantalla va a «Pruebas con IA». A ti te llegan solo las que piden tu criterio de producto; lo de pantalla de todos los días lo valida quien lo usa (Elías, 20 oct: «no tengo tanto tiempo»).
5. **Cuando algo validado cambia, vuelve a «↻ Validar otra vez».** Los números de prueba no se reusan.
6. **Cada vez que se junta algo:** tsc en 0, la suite en verde, «Estado hoy» al día y la vista publicada en la misma dirección (`node scripts/roadmap-vista.mjs` y el artefacto).
