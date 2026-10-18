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
| Producción | Corre la versión del 16 oct a las 16:10 (`918e2fdb`). Sana. |
| Por desplegar | 31 cambios en `main`: las fases 0 y 1 del sistema de trabajo, Odoo y Mercury, y las dos tandas (las fichas A a H). |
| La base | Tiene todo lo que necesita lo que está en `main`: los SQL ya se aplicaron. |
| En rojo en producción | Un proyecto en un pipeline sin declarar, un cliente apuntando a una empresa fusionada en HubSpot y el corte de cobranza, que nunca corrió. |
| Revisión de código | Hecha el 17 oct sobre los 31 cambios: 57 problemas encontrados, unos 50 corregidos (sin commitear). Ninguno mezclaba clientes. |

**Lo siguiente en todo Nexus:** probar en el 3004 y desplegar lo que está en `main`. Los SQL ya están en producción. Prender la lectura de hechos y el corte de cobranza. Después del deploy yo cierro las alertas sueltas, limpio las reuniones con texto de otra y rescato las transcripciones.

En cada paso: **[hecho]** está en `main`, falta desplegar; **[en curso]** lo está construyendo una sesión ahora.

## Lo que conecta a los equipos

### Tareas <span class="estado">Por desplegar</span>

Todo lo que Smarteam tiene que hacer con un cliente, de cualquier equipo, es una tarea con su cuenta. Por ahora, las tareas de seguimiento de la cuenta; las de configuración (propiedades, pipelines) quedan para después.

1. [hecho] En la ficha de cada cliente, todas las tareas de Smarteam con esa cuenta, por equipo: qué es, para cuándo y de dónde viene.
2. [hecho] Que cada equipo configure su sprint: Customer Success, Marketing y Desarrollo eligen su reunión de sprint y quiénes están.
3. [hecho] De cada reunión, Nexus propone hasta 5 tareas por persona, y cada tarea dice de dónde viene: una reunión con el cliente o el sprint interno.
4. «Planifica tu semana», la pantalla de los viernes.

### Inicio («Para ti») <span class="estado">Por desplegar</span>

Lo primero que ve cada persona al entrar: lo que importa hoy, sus cuentas y sus reuniones. Un mismo módulo, una página por equipo.

1. [hecho] El inicio de Ventas y del CSE, con el diseño de [«Para ti · Ventas y CSE»](https://claude.ai/artifact/FMYuGJ3vN9UyBhyABhnnLm): una guía fácil de consultar, la agenda del día como Google Calendar y cada reunión en un panel al costado.
2. [hecho] El inicio de los demás: la CSL ve toda la cartera, Desarrollo los clientes con proyecto de desarrollo activo y Marketing sus tareas internas (Smarteam y SmartAgro).
3. [hecho] Crear eventos desde la agenda: tocar una hora arma un evento de una hora con su contacto y abre Google Calendar ya lleno; «Agendar» lo pone en la agenda primero; los huecos, solo de lunes a viernes de 8 a 5.
4. [hecho] La cartera de Customer Success como la de Ventas, por proyectos (implementación, SmartLoop y desarrollo): el cliente grande, quién lo lleva, el estado de la cuenta, la última comunicación y el monto solo si hay un negocio abierto.
5. Que Nexus sugiera con qué avanzar en los huecos de la agenda, con las tareas pendientes, para ponerlo en la agenda.
6. Medir la adopción: qué usa cada equipo y qué se desestima, en «Uso de Nexus».
7. El correo de la mañana con lo mismo, bien probado antes de mandarlo (espera decidir Gmail o un proveedor).

### Reuniones y memoria <span class="estado">Por desplegar</span>

Cada reunión se lee una vez y queda como memoria de la cuenta: la usan la ficha, las tareas, los documentos y los agentes.

1. Prender la lectura de hechos de cada reunión (va con el deploy).
2. [hecho] Que no falte ninguna transcripción: que Google Workspace las cree solas en todas las reuniones, también las de Desarrollo.
3. [hecho] Arreglar las reuniones que quedaron con texto de otra reunión, y regenerar los handoffs de RC Inmobiliaria, AMC, DISTELSA y Grupo Printer.
4. La agenda de cada cuenta: qué clientes tienen reunión y planear una desde Nexus.
5. [hecho] Cada reunión con su página: su agenda, sus avisos y sus tareas con responsable.
6. [hecho] Después de cada reunión con un cliente: el correo de seguimiento y la próxima reunión sugerida.

### La escala y los casos de uso <span class="estado">Por desplegar</span>

Dónde está cada cliente y qué lo mueve. Es lo que une a Ventas con Customer Success: Ventas la usa para vender y Customer Success para planear cada ciclo.

1. [hecho] Comprobar con casos reales que la escala se calcula bien y que su agente usa toda la información de Nexus para llenarla.
2. [hecho] Pintar la escala del cliente con su evidencia: de dónde sale cada nivel.
3. [hecho] Que sugiera qué explorar en las próximas reuniones, según lo que cambió en la escala.
4. [hecho] La misma escala en la ficha del cliente, con su histórico: verla, regenerarla y activar el agente desde ahí. El diagnóstico de cada ciclo también la actualiza.
5. [hecho] El camino de crecimiento de cada cliente: qué sigue en la escala y por qué.
6. [hecho] Casos de uso sugeridos, inspirados en la biblioteca de casos de uso (con tu lista de títulos).
7. Licencias y precio de cada caso de uso.

### El chat de Nexus <span class="estado">Por desplegar</span>

Un solo chat que hace lo mismo que las pantallas, sobre la cuenta en la que estás.

1. [hecho] El chat sobre la memoria y las tareas de la cuenta, dentro de Nexus y con su costo controlado.
2. [hecho] Contarle lo que pasó por WhatsApp o una llamada y que sugiera lo que hay que cambiar, para aplicarlo de una vez.
3. [hecho] Acciones sugeridas a cada persona según sus cuentas y sus tareas, con el mensaje de WhatsApp listo.
4. Que genere los documentos con su plantilla.

## Por equipo

### Ventas <span class="estado">Por desplegar</span>

La preventa, las propuestas y los negocios. Usa el inicio, la escala y la memoria de las reuniones.

1. [hecho] Armar la propuesta desde la preventa, con una sección de casos de uso.
2. [hecho] Esa sección también en una propuesta sin preventa: casos de uso inspirados en la biblioteca, con el contexto del prospecto o cliente.
3. [hecho] Que la preventa sugiera el siguiente paso: agendar la próxima sesión de exploración y, si ya está agendada, planificarla.
4. En la propuesta, «+IVA» o «IVA incluido» para clientes de Costa Rica, con los cálculos de ahí.

### Customer Success <span class="estado">Por desplegar</span>

Los proyectos, los documentos, la cartera y el servicio recurrente. Usa las tareas, el inicio, la escala y la memoria.

1. [hecho] Cada cuenta con su acción de la semana y su reunión agendada; si falta, aparece en el inicio.
2. [hecho] SmartLoop: cargar el plan de FACO en el proyecto de prueba.
3. [hecho] SmartLoop: el cronograma del ciclo.
4. [hecho] SmartLoop: aprendizaje y cierre del ciclo (comprometido para el 6 nov).
5. SmartLoop: recomendar recurrencia, el Gantt de la cuenta para el cliente y pasar los recurrentes de hoy.
6. Los documentos del proyecto con plantillas, sin tocar los kickoffs y diagnósticos que ya existen.
7. La foto del margen de cada mes, en carga y rentabilidad.

### Finanzas <span class="estado">Por desplegar</span>

Cobranza, planilla, punto de equilibrio y comisiones, cruzados con Odoo y Mercury. Plan: [«Un solo libro financiero»](https://claude.ai/artifact/Gbo7THjPG4GZTa5J8ChQzd).

1. Desplegar que Odoo y Mercury marquen solos lo facturado y lo pagado.
2. [hecho] Cada mañana, lo pagado listo para cobrar con un clic.
3. [hecho] El porcentaje de servicio y licencia de cada contrato, y a qué clientes les pagamos licencias y por cuánto.
4. [hecho] Las comisiones de Stripe y las transferencias internacionales como gasto financiero.
5. [hecho] El detalle de cada factura de Odoo y de Mercury.
6. [hecho] Mercury en la facturación por cliente.
7. Pagar comisiones con el modelo nuevo (espera las respuestas de Marco).

### Marketing y Desarrollo <span class="estado">Por desplegar</span>

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

## Lo que configuras tú en Google Workspace

El 53 % de las reuniones con clientes del último mes no tiene transcripción. Una parte la arregla Nexus; esto es de la
consola de Google:

1. Gemini «Tomar notas» y «Transcribir la reunión» activados para toda la organización, Desarrollo incluido, y que arranquen solos al empezar la reunión.
2. Que las notas se compartan con todos los invitados de la organización, no solo con quien las tomó.
3. En las reuniones que organiza un cliente, que alguien del equipo active las notas al entrar.

## Lo que pruebas tú al final

Lo que construimos, por área y en el orden en que conviene probarlo, todo en el 3004. Cuando pruebes algo, dime el número
y lo marco: **✓ Probado** (anda), **↻ Otra vez** (cambió después de que lo probaste) o **Por probar**. Para entrar como
otra persona: Equipo › la persona › «Ver como»; «Volver a mi usuario» te devuelve.

### 1 · «Para ti»: Ventas y Customer Success

| # | Estado | Dónde | Cómo probarlo | Qué deberías ver |
|---|---|---|---|---|
| 1 | ✓ Probado | «Para ti» de Andrés y de un CSE | Entra con «Ver como» Andrés y abre «Para ti»; después repite con un CSE. | Arriba, los números del día; al centro, la agenda como Google Calendar; a la derecha, «Tu cartera» (Andrés) o «Tus cuentas» (el CSE). |
| 2 | ↻ Otra vez | El panel de una reunión | Como un CSE, toca en la agenda de hoy una reunión con un cliente. Escribe algo en «Tus notas», cierra el panel y vuelve a abrirlo. Después, con «Ver como» otra persona, abre una reunión suya. | Un panel al costado con la guía, el objetivo, quién viene, la última vez y lo pendiente. La nota sigue ahí al volver a abrir. Con «Ver como» otra persona, sus notas no aparecen ni se puede escribir. |
| 3 | ✓ Probado | «Lo que importa hoy» de un CSE con una cuenta sin tarea esta semana | Con «Ver como» ese CSE, mira la primera tarjeta de «Para ti». | La línea «Sin acción ni reunión» con esa cuenta y el botón «Agendar». |
| 4 | ✓ Probado | «Para ti» de alguien de Marketing | Con «Ver como» alguien de Marketing, abre «Para ti». | Sus tareas internas, ordenadas por ámbito (Smarteam, SmartAgro). |
| 5 | Por probar | «Lo que importa hoy», con tu usuario | Abre «Para ti» y mira la primera tarjeta. Si una cuenta tiene varias cosas, abre su «+N». | Como mucho 5 cosas, una por cuenta. Lo demás de esa cuenta queda plegado en «+N en esta cuenta», y lo que no entra va a «También para hoy». |
| 6 | Por probar | La agenda › crear un evento | Toca una hora vacía de hoy (por ejemplo, las 10). En el cuadro escribe un título, busca un contacto por su nombre o su empresa, elígelo y toca «Abrir en Google Calendar». | Al tocar, aparece un bloque azul «borrador» de una hora. Al elegir el contacto, la cuenta se llena sola. Google Calendar se abre con el título, la hora, el invitado y, en la descripción, el enlace a la cuenta en Nexus. En la agenda, el bloque queda «abierto en Calendar, sin guardar», con «Ya lo guardé». |
| 7 | Por probar | «Lo que importa hoy» › «Agendar» | Con «Ver como» el CSE del punto 3, toca «Agendar» en «Sin acción ni reunión». | El borrador aparece en la agenda en tu primera hora libre de trabajo, con la cuenta y su contacto, y Google Calendar se abre con ese evento listo para guardar. |
| 8 | Por probar | Los huecos de la agenda | Mira la agenda después de las 16:00 o en fin de semana. En un día con espacio, toca el «Hueco libre» punteado. | Fuera de horario no aparece ningún «Hueco libre», y «Agendar» propone el siguiente día hábil a las 8:00. Al tocar el hueco, el panel dice «Tienes libre de X a Y», con «Crear un evento aquí», sin sugerir una tarea. |
| 9 | Por probar | «Tu cartera» de un CSE | Con «Ver como» un CSE, toca «Tu cartera» arriba a la derecha. Prueba la vista «Todos los proyectos», el buscador y una cuenta que le compartieron. | Sus empresas en «Para atender», cada una con el nombre grande, sus proyectos con su etapa, el último contacto, la próxima reunión y su acción de la semana (✓ u ○). Una cuenta compartida dice «Compartida», sin color ni monto. |
| 10 | Por probar | «La cartera» de Alex Vanegas | Con «Ver como» Alex, abre «Para ti» › «La cartera». Abre «Por CSE»; después filtra «Pipeline» › Desarrollo. | Ya no aparece la cartera de Ventas ni «Negocios traídos de HubSpot». «Por CSE» trae un bloque por CSE, en orden alfabético, con cuántas cuentas tiene en riesgo, sin acción y sin contacto, y «Sin CSE» al final. Con el filtro quedan solo las empresas con un proyecto de desarrollo. |
| 11 | Por probar | El monto en la cartera | Con tu usuario, busca en la cartera una empresa con un negocio abierto; después mira la misma con «Ver como» un CSE. | «N negocios abiertos · US$ …» en la fila. El CSE no ve el monto. |

### 2 · La ficha del cliente

| # | Estado | Dónde | Cómo probarlo | Qué deberías ver |
|---|---|---|---|---|
| 12 | Por probar | La cuenta › Tareas | Abre un cliente activo › La cuenta › Tareas. | Las tareas agrupadas por equipo (Customer Success primero): abiertas, por decidir y hechas en los últimos 30 días. Cada una dice quién la tiene, para cuándo y de dónde viene (reunión con el cliente, sprint interno, HubSpot, chat…). Lo «Solo para mí» de otras personas no aparece. |
| 13 | Por probar | El chip «Cómo está la cuenta» | Con «Ver como» Alex, abre una cuenta en rojo o en amarillo y pasa el mouse por el chip. Repite con «Ver como» el CSE de esa cuenta. | El color y hasta tres motivos, en vez de alertas sueltas. El CSE ve lo mismo, pero sin montos. |
| 14 | Por probar | El chat «Nexus» | En la ficha, toca «Nexus». Pregunta «¿Qué está pendiente con esta cuenta?». Después escribe «Por WhatsApp me dijeron que mandan la base el viernes», revisa la lista y toca «Aplicar». Prueba tocar «Aplicar» dos veces seguidas. | Contesta solo con lo de esa cuenta. Arma una lista con casillas, y al aplicar, la tarea aparece en La cuenta › Tareas como «Chat de Nexus». El segundo clic no la crea dos veces. |
| 15 | Por probar | El botón «Sugerencias» | En la ficha, toca «Sugerencias». | Hasta 5 cosas que te tocan en esa cuenta, cada una con el mensaje de WhatsApp listo para copiar. |
| 16 | Por probar | La cuenta › La escala | Abre un cliente con una exploración que tenga niveles confirmados › La cuenta › La escala. Toca «Regenerar con el agente». | Cada nivel con de dónde sale (la fuente y la frase). «La escala en el tiempo» con sus versiones fechadas. El agente solo propone: no cambia los niveles confirmados. Abajo, el camino de crecimiento con casos sugeridos. |

### 3 · Tareas y reuniones

| # | Estado | Dónde | Cómo probarlo | Qué deberías ver |
|---|---|---|---|---|
| 17 | Por probar | Configurar el sprint | Tareas › Semana del equipo › «La reunión del sprint» › Configurar. Elige la reunión semanal del equipo, deja «Quiénes están» vacío y guarda. | Solo te ofrece reuniones recurrentes de puertas adentro en las que estuviste. Con la lista vacía cuentan los del área más quien lidera. La próxima reunión de esa serie deja como mucho 5 tareas por persona, marcadas «Sprint interno». |
| 18 | Por probar | La página de una reunión | Sesiones › una reunión con un cliente de esta semana. Toca «Armar el correo». Abre la misma reunión en otra pestaña, cambia el correo en las dos y guarda. | La agenda (de la invitación o escrita), los avisos y las tareas con su responsable. «Armar el correo» deja un borrador que no se envía. La próxima reunión sugerida, con su enlace a Google Calendar. La segunda pestaña avisa «El correo cambió: recarga la página». |

### 4 · Ventas

| # | Estado | Dónde | Cómo probarlo | Qué deberías ver |
|---|---|---|---|---|
| 19 | Por probar | La escala de una preventa | Ventas › Preventa › una con reuniones leídas › La escala. | «De dónde sale cada nivel» y «Qué explorar en la próxima sesión». |
| 20 | Por probar | Casos de uso en una propuesta | Propuestas › Nueva, con una empresa que tenga preventa › Generar. Repite con una empresa sin preventa. | La sección «Casos de uso incluidos». Sin preventa, los sugeridos de la biblioteca, sin precio. |

### 5 · SmartLoop (FACO, proyecto de prueba)

| # | Estado | Dónde | Cómo probarlo | Qué deberías ver |
|---|---|---|---|---|
| 21 | Por probar | El cronograma del ciclo | Abre FACO › el proyecto de prueba › Cronograma › «Armar las fases». Confirma la fecha de arranque y toca «Aprobar esta versión». | Sin fecha de arranque, primero pregunta «El cronograma arranca el … ¿Lo confirmas?». El cronograma del ciclo queda arriba del Gantt con su versión aprobada. |
| 22 | Por probar | Cerrar el ciclo | En Aprendizaje, marca un caso de uso «no cumplido» y toca «Cerrar el ciclo». Después, en una pestaña que tenía el ciclo abierto, cambia la meta. | El ciclo queda en «Ciclos anteriores», y la fase de ese caso queda suspendida (ya no aparece atrasada en el Gantt). La pestaña vieja avisa «Este ciclo ya se cerró: recarga la página». |

### 6 · Finanzas

| # | Estado | Dónde | Cómo probarlo | Qué deberías ver |
|---|---|---|---|---|
| 23 | Por probar | Conciliación › «Lo pagado» | Finanzas › Conciliación › «Lo pagado». Desmarca una cuota y confirma con tu firma. | Las cuotas que Odoo y Mercury dan por pagadas, con el día del pago. Las de Mercury sin entrada de plata quedan en «Pagadas sin el día del pago» y no se cobran. Solo se cobran las marcadas. Si Odoo no contesta, aparece el aviso «Odoo no contestó» y lo de Mercury sigue. |
| 24 | Por probar | Punto de equilibrio › «Licencias revendidas» | Abre kölbi › Editar y escribe «70.000» en «Lo que se le paga». Mira «Para decidir». | kölbi con su parte de servicio y el mismo margen que antes. Debajo del campo, «Se guarda: 70.000». En «Para decidir», cómo cuentan las licencias. |
| 25 | Por probar | Conciliación › Gastos y Mercury › «Gastos financieros» | Abre la pestaña y confirma una comisión. | Las comisiones de Stripe y de las transferencias, para confirmar una por una. Lo confirmado suma al punto de equilibrio como gasto financiero. |
| 26 | Por probar | Cobranza › Odoo › Facturación por cliente | Busca un cliente de Mercury y toca «Ver el detalle» en una factura. | Los clientes de Mercury junto a los de Odoo. El detalle de la factura se lee del sistema al abrirlo. |
| 27 | Por probar | Cobranza › Odoo | Abre la lista de facturas. | Las facturas que Odoo da por emitidas ya están pegadas a su cuota, sin hacer nada. |

### 7 · Éxito del cliente y Equipo

| # | Estado | Dónde | Cómo probarlo | Qué deberías ver |
|---|---|---|---|---|
| 28 | Por probar | Éxito del cliente › «Limpieza de HubSpot» | Abre la pestaña como Alex o con tu usuario. | Lo que hay que poner al día en HubSpot, agrupado por responsable, cada cosa con su enlace a HubSpot. |
| 29 | Por probar | «Ver como» | Equipo › una persona › «Ver como»; navega un poco y toca «Volver a mi usuario». | Nexus como lo ve esa persona, sin poder escribir como ella. «Volver a mi usuario» te devuelve. |

Si algo de esto no aparece como dice la tabla, mándame una captura.

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
