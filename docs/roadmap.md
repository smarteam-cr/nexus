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
| Por desplegar | Nada: todo lo de `main` está en producción. La lectura de hechos y el corte de cobranza, prendidos. |
| En curso | Lo que encontraste al validar «Para ti»: la agenda, la cartera del CSE y los exclientes (Inicio, pasos 8 a 10; Customer Success, paso 9). Tres sesiones en paralelo. |
| La base | Tiene todo lo que necesita lo que está en `main`: los SQL ya se aplicaron. |
| En rojo en producción | Un proyecto en un pipeline sin declarar, un cliente apuntando a una empresa fusionada en HubSpot y el corte de cobranza, que nunca corrió. |
| Revisión de código | Hecha el 17 oct sobre los 31 cambios de entonces: 57 problemas encontrados, unos 50 corregidos y en `main`. Ninguno mezclaba clientes. |

**Lo siguiente en todo Nexus:** validar en producción (pestaña «Lo que validas»). Yo corro lo que va después del deploy: cerrar las alertas sueltas, limpiar las reuniones con texto de otra, rescatar las transcripciones y guardar la primera versión de la escala.

En cada paso: **[hecho]** está hecho (en producción si la tarjeta lo dice); **[en curso]** lo está construyendo una sesión ahora.

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
8. [en curso] La agenda, con lo que encontraste al validar: más rápida; un sábado o un domingo muestra la semana siguiente; un hueco elegido se suelta tocando afuera o la X; «Agendar» arma la reunión en Nexus antes de abrir Calendar; «Tus notas» también en las reuniones que ya pasaron.
9. [en curso] La cartera del CSE: «Planificar acción» en las cuentas sin acción, que la pone en la agenda; el uso de HubSpot de cada cuenta (si sube o baja, por los hubs que compró); y un botón con nombre claro en vez de «Abrir cuenta».
10. [en curso] Que nada quede fuera de «Lo que importa hoy»: si a un CSE le piden atención más cuentas de las que entran, «Estabilizar N cuentas», y a la CSL le llega para repartir o acompañar.

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
7. Licencias y precio de cada caso de uso.

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
2. [hecho] SmartLoop: cargar el plan de FACO en el proyecto de prueba.
3. [hecho] SmartLoop: el cronograma del ciclo.
4. [hecho] SmartLoop: aprendizaje y cierre del ciclo (comprometido para el 6 nov).
5. [hecho] SmartLoop: recomendar la recurrencia al llegar a la entrega y la ruta del servicio para el cliente.
6. SmartLoop: pasar los recurrentes de hoy (el script ya está; la etapa de cada uno la confirma Customer Success).
7. [hecho] Los documentos del proyecto con plantillas (la primera: «Diagnóstico estratégico»), sin tocar los kickoffs y diagnósticos que ya existen.
8. [hecho] La foto del margen de cada mes, en carga y rentabilidad.
9. [en curso] Un excliente (Wherex) fuera de toda alerta y cartera: la CSL lo confirma como «Excliente» y solo se ve en «Fuera de la cartera», marcado. Mientras siga un proyecto activo en HubSpot, la lista de limpieza le pide cerrarlo.

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

### 2 · La ficha del cliente

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 13 | Por validar | Que el riel separe herramientas y entregables | Abre un cliente › un proyecto de implementación y mira la columna de la izquierda. Después abre un proyecto SmartLoop. | Arriba, «Herramientas del proyecto» (Resumen, Cronograma, Cuestionarios, Exploración, Ejecución); debajo, «Entregables» (Kickoff, Diagnóstico, Planificación, Integraciones, Entrega). En el SmartLoop, igual que antes: el grupo «Ciclo · etapa». |
| 14 | Por validar | Que generar un Diagnóstico y un Kickoff siga igual | En un proyecto con handoff, toca «Generar» en el Diagnóstico y después en el Kickoff. | Se generan y se ven igual que siempre; el kickoff con sus secciones de equipo y horarios intactas. |
| 15 | Por validar | Que la cuenta muestre sus reuniones y sus tareas por equipo | Abre un cliente activo › La cuenta › Tareas. | Arriba, «Próximas reuniones» con el día, la hora y quién de Smarteam va. Debajo, las tareas por equipo (Customer Success primero): abiertas, por decidir y hechas en 30 días, con quién la tiene, para cuándo y de dónde viene. Lo «Solo para mí» de otros no aparece. |
| 16 | Por validar | Que el chip diga cómo está la cuenta, sin plata para el CSE | Con «Ver como» Alex, abre una cuenta en rojo o amarillo y pasa el mouse por el chip. Repite con «Ver como» el CSE de esa cuenta. | El color y hasta tres motivos. El CSE ve lo mismo, pero sin montos. |
| 17 | Por validar | Que el chat trabaje solo sobre esa cuenta y genere un entregable | En la ficha, toca «Nexus». Pregunta «¿Qué está pendiente con esta cuenta?». Escribe «Por WhatsApp me dijeron que mandan la base el viernes» y toca «Aplicar» dos veces seguidas. Después pide «Genera el diagnóstico del proyecto X» y aplícalo. | Contesta solo con lo de esa cuenta. La tarea aparece en La cuenta › Tareas como «Chat de Nexus», una sola vez. El diagnóstico queda en la lista con la plantilla «Diagnóstico estratégico» y aparece en el proyecto en unos minutos. En un proyecto sin handoff, el kickoff no se ofrece y dice por qué. |
| 18 | Por validar | Que «Sugerencias» diga qué hacer, con el mensaje listo | En la ficha, toca «Sugerencias». | Hasta 5 cosas que te tocan en esa cuenta, cada una con el mensaje de WhatsApp listo para copiar. |
| 19 | Por validar | Que la escala de la cuenta muestre su evidencia y su historia | Abre un cliente con una exploración con niveles confirmados › La cuenta › La escala. Toca «Regenerar con el agente». | Cada nivel con de dónde sale (la fuente y la frase). «La escala en el tiempo» con sus versiones fechadas. El agente solo propone: no cambia los niveles confirmados. Abajo, el camino de crecimiento con casos sugeridos. |

### 3 · Tareas y reuniones

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 20 | Por validar | Que «Planifica tu semana» arme la semana por cuenta | Tareas › «Planifica tu semana» como un CSE. En una cuenta, cambia el día de la reunión sugerida, toca «Agendar», guárdala en Calendar y toca «Ya lo guardé». En otra, toca «Usar» o «Crear la acción». | Una fila por cuenta con la acción y la reunión de la semana; lo que sugiere Nexus en azul, con «De dónde sale». Google Calendar se abre con título, hora, invitados y objetivo. Después de guardarla: «Quedó en tus tareas como reunión con la cuenta». La acción queda con su T- y el día. |
| 21 | Por validar | Que un líder configure la reunión de su sprint | Tareas › Semana del equipo › «La reunión del sprint» › Configurar. Elige la reunión semanal, deja «Quiénes están» vacío y guarda. | Solo ofrece reuniones recurrentes de puertas adentro en las que estuviste. La próxima reunión de esa serie deja como mucho 5 tareas por persona, marcadas «Sprint interno». |
| 22 | Por validar | Que cada reunión tenga su página y su correo de seguimiento | Sesiones › una reunión con un cliente de esta semana. Toca «Armar el correo». Abre la misma reunión en otra pestaña, cambia el correo en las dos y guarda. | La agenda, los avisos y las tareas con su responsable. «Armar el correo» deja un borrador que no se envía. La próxima reunión sugerida, con su enlace a Google Calendar. La segunda pestaña avisa «El correo cambió: recarga la página». |

### 4 · Ventas

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 23 | Por validar | Que la escala de la preventa diga de dónde sale y qué explorar | Ventas › Preventa › una con reuniones leídas › La escala. | «De dónde sale cada nivel» y «Qué explorar en la próxima sesión». |
| 24 | Por validar | Que la propuesta traiga los casos de uso | Propuestas › Nueva, con una empresa que tenga preventa › Generar. Repite con una sin preventa. | La sección «Casos de uso incluidos». Sin preventa, los sugeridos de la biblioteca, sin precio. |
| 25 | Por validar | Que el IVA se calcule bien en los dos sentidos | En una propuesta de un cliente de Costa Rica, en la Inversión pon una línea de $10.000 y elige «+ IVA (13%)»; después cambia la línea a $11.300 y elige «IVA incluido (13%)». | Con «+ IVA»: «IVA (13%) $1,300» y «Total con IVA $11,300». Con «IVA incluido»: «Monto sin IVA $10,000» e «IVA (13%) $1,300», y el total no cambia. |
| 26 | Por validar | Que el IVA también vaya en lo mensual y en la forma de pago | En una propuesta con una implementación y una licencia mensual, elige «+ IVA» y mira «Forma de pago». | «Pago único + IVA» y «Por mes + IVA», cada uno con su IVA y su total. En «Forma de pago», «Inversión total + IVA». |
| 27 | Por validar | Que lo publicado no cambie y el PDF lleve el IVA | Abre la Inversión de un cliente sin país conocido. Después abre por su link una propuesta ya publicada y baja el PDF; publica la de la validación 25 y haz lo mismo. | Sin país: el selector está, con «⚠ No sabemos si el cliente es de Costa Rica…». La publicada de antes se ve igual, sin IVA. La de la validación 25 trae «Montos sin IVA (+ 13%)» y el mismo desglose, en el link y en el PDF. |

### 5 · SmartLoop

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 28 | Por validar | Que el cronograma del ciclo pida confirmar el arranque | FACO › el proyecto de prueba › Cronograma › «Armar las fases». Confirma la fecha de arranque y toca «Aprobar esta versión». | Sin fecha de arranque, primero pregunta «El cronograma arranca el … ¿Lo confirmas?». El cronograma del ciclo queda arriba del Gantt con su versión aprobada. |
| 29 | Por validar | Que cerrar el ciclo saque lo que no se cumplió | En Aprendizaje, marca un caso «no cumplido» y toca «Cerrar el ciclo». Después, en una pestaña que tenía el ciclo abierto, cambia la meta. | El ciclo queda en «Ciclos anteriores» y la fase de ese caso queda suspendida (ya no sale atrasada). La pestaña vieja avisa «Este ciclo ya se cerró: recarga la página». |
| 30 | Por validar | Que Nexus recomiende SmartLoop al llegar a la entrega | Abre un proyecto de implementación en «Entrega» › Resumen y toca «Dejar la tarea». En otro en «Entrega», toca «Abrir el alta». Mira «Para ti» del CSE encargado. | En «Qué sigue»: «propónle a … seguir con SmartLoop», con el porqué y los botones. «Dejar la tarea» crea la tarea y la recomendación desaparece. «Abrir el alta» abre Nuevo proyecto con «SmartLoop» elegido. En «Para ti» del CSE, la misma recomendación. |
| 31 | Por validar | Que el cliente vea la ruta del servicio, sin datos internos | En un SmartLoop con ciclo › Resumen, toca «Subir al cliente» en «Ruta del servicio para el cliente». Abre el enlace del cliente con `?next=ciclos` y entra con la contraseña. En un proyecto que no es SmartLoop, abre «Acceso». | «Compartida desde el …» y «Volver a subir». El cliente ve cada ciclo con sus fechas y su meta, los casos como barras y «De tu parte: …», sin notas ni montos. En el que no es SmartLoop, la fila «Ruta del servicio» no aparece. |

### 6 · Finanzas

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 32 | Por validar | Que solo se cobre lo pagado que confirmas | Finanzas › Conciliación › «Lo pagado». Desmarca una cuota y confirma con tu firma. | Las cuotas que Odoo y Mercury dan por pagadas, con el día del pago. Las de Mercury sin entrada de plata van a «Pagadas sin el día del pago» y no se cobran. Solo se cobran las marcadas. |
| 33 | Por validar | Que los montos de las licencias se lean bien | Punto de equilibrio › «Licencias revendidas» › kölbi › Editar. Escribe «70.000» en «Lo que se le paga» y mira «Para decidir». | kölbi con su parte de servicio y el mismo margen. Debajo del campo, «Se guarda: 70.000». En «Para decidir», cómo cuentan las licencias. |
| 34 | Por validar | Que las comisiones de Stripe y transferencias sumen como gasto | Conciliación › Gastos y Mercury › «Gastos financieros». Confirma una. | Las comisiones para confirmar una por una. Lo confirmado suma al punto de equilibrio como gasto financiero. |
| 35 | Por validar | Que Mercury esté en la facturación por cliente | Cobranza › Odoo › Facturación por cliente. Busca un cliente de Mercury y toca «Ver el detalle» en una factura. | Los clientes de Mercury junto a los de Odoo, y el detalle de cada factura. |
| 36 | Por validar | Que las facturas de Odoo se peguen solas | Abre Cobranza › Odoo. | Las facturas que Odoo da por emitidas ya están pegadas a su cuota, sin hacer nada. |

### 7 · Dirección: Rentabilidad y Uso de Nexus

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 37 | Por validar | Que la foto del margen quede guardada por mes | Éxito del cliente › Rentabilidad › «De dónde salen los números». En un mes, toca «Tomar la foto». Después elige «Trimestre». | Antes de tomarla, cada mes dice «En vivo». Al tomarla: «Foto tomada: N cuentas» y el mes pasa a «Desde su foto», con la fecha y tu nombre. En el trimestre: «1 de 3 meses desde su foto; el resto, en vivo». |
| 38 | Por validar | Que rehacer una foto pida motivo y la cuenta diga de dónde sale | En un mes con foto, toca «Volver a tomar» sin motivo y después con motivo. Abre una cuenta y mira «Mes a mes». | Sin motivo no deja; con motivo, «Tomada el… · tu motivo». En la cuenta, «De dónde sale» dice «Foto del …» o «En vivo». |
| 39 | Por validar | Que se vea qué usa y qué desestima cada equipo | Para ti › «Uso de Nexus». Baja hasta el final de «Equipo» y abre «Para qué se usa». | Seis pestañas. «Qué usa cada equipo» con «3/7» en cada cruce. «Qué usa y qué desestima cada equipo» y «Quién decide» por nombre, agrupado por equipo. |
| 40 | Por validar | Que se vea cuánto cuesta la IA y si sirve | Abre «IA por cliente» (cambia entre 30 y 90 días), «Procesos de IA» y «Conclusiones». | El gasto de IA por empresa con lo que se usó; por proceso, con errores y «% usado»; y conclusiones cortas «Para mirar», «Para saber» o «Va bien», cada una con su enlace. |

### 8 · Éxito del cliente y Equipo

| # | Estado | Qué validas | Pasos | Resultado esperado |
|---|---|---|---|---|
| 41 | Por validar | Que la lista de limpieza de HubSpot diga quién arregla qué | Éxito del cliente › «Limpieza de HubSpot», como Alex o con tu usuario. | Lo que hay que poner al día en HubSpot, por responsable, cada cosa con su enlace. |
| 42 | Por validar | Que «Ver como» no deje escribir como otra persona | Equipo › una persona › «Ver como»; navega un poco y toca «Volver a mi usuario». | Nexus como lo ve esa persona, sin poder escribir como ella. «Volver a mi usuario» te devuelve. |

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
