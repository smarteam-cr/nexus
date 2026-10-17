# Roadmap de Nexus

**Corte:** 2026-10-17

## Para qué

Hoy Nexus se usa poco y está desconectado: lo que más se usa es el kickoff y el cronograma, y la preventa también,
pero le faltan ajustes. El objetivo es que Nexus amarre los puntos: entrar a un cliente y ver todo lo que Smarteam
está haciendo con él.

- **Construimos todo y probamos al final.** El camino está en orden; tú decides qué se ejecuta y cuándo.
- **Sin tiempos ni semanas.** Cada paso se hace cuando lo pones a correr.
- **Los kickoffs y los diagnósticos no se tocan como datos.** Se pueden cambiar las pantallas, pero lo que ya existe se sigue consultando en el mismo lugar.

**Lo siguiente en todo Nexus:** desplegar lo que está en `main`: las dos tandas (el inicio de cada equipo, las tareas de cada cliente y los sprints, la escala con su evidencia y sus versiones, la página de cada reunión, el chat de Nexus, SmartLoop y Finanzas). Los SQL ya están en producción. Prender la lectura de hechos y el corte de cobranza. Después del deploy yo cierro las alertas sueltas, limpio las reuniones con texto de otra y rescato las transcripciones.

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
3. Medir la adopción: qué usa cada equipo y qué se desestima, en «Uso de Nexus».
4. El correo de la mañana con lo mismo, bien probado antes de mandarlo (espera decidir Gmail o un proveedor).

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

Lo que construimos. Se suma lo nuevo a medida que sale.

| # | Dónde | Qué deberías ver |
|---|---|---|
| 1 | «Para ti» (con «Ver como» Andrés y después un CSE) | Arriba los números del día; la agenda como Google Calendar; a la derecha «Tu cartera» o «Tus cuentas» |
| 2 | «Para ti» › la agenda › tocar una reunión con un cliente | Un panel al costado con la guía de la reunión, su objetivo, quién viene, la última vez y lo pendiente |
| 3 | «Para ti» de un CSE con una cuenta sin tarea esta semana | «Sin acción ni reunión» en «Lo que importa hoy», con «Agendar» |
| 4 | «Para ti» como Alex Vanegas y como alguien de Marketing | La cartera entera con quién lleva cada cuenta; las tareas internas de Marketing por ámbito |
| 5 | La ficha de un cliente › La cuenta › Tareas | Sus tareas por equipo, cada una con quién la tiene, para cuándo y de dónde viene |
| 6 | Tareas › Semana del equipo › «La reunión del sprint» › Configurar | Eliges la reunión del sprint y quiénes están |
| 7 | La ficha de un cliente › botones «Nexus» y «Sugerencias» | El chat contesta solo con lo de esa cuenta; «Por WhatsApp me dijeron…» arma una lista que se aplica con un clic |
| 8 | Sesiones › una reunión con un cliente | Agenda, avisos y tareas con responsable; «Armar el correo» y la próxima reunión con su enlace a Google Calendar |
| 9 | Una preventa › La escala | «De dónde sale cada nivel» y «Qué explorar en la próxima sesión» |
| 10 | La ficha de un cliente › La cuenta › La escala | Cada nivel con su evidencia, «La escala en el tiempo», «Regenerar con el agente» y el camino de crecimiento |
| 11 | Propuestas › una propuesta nueva › Generar | La sección «Casos de uso incluidos» |
| 12 | La ficha de FACO › proyecto de prueba › Cronograma y Aprendizaje | El cronograma del ciclo arriba del Gantt con «Aprobar esta versión»; «Cerrar el ciclo» lo deja en «Ciclos anteriores» |
| 13 | Finanzas › Conciliación › «Lo pagado» | Las cuotas que Odoo y Mercury dan por pagadas; desmarcas, confirmas con tu firma y solo se cobran las marcadas |
| 14 | Finanzas › Punto de equilibrio › «Licencias revendidas» | kölbi con su parte de servicio y el mismo margen que antes; en «Para decidir», cómo cuentan las licencias |
| 15 | Conciliación › Gastos y Mercury › «Gastos financieros» | Las comisiones de Stripe y de transferencias para confirmar una por una |
| 16 | Cobranza › Odoo › Facturación por cliente | Los clientes de Mercury; cada factura con «Ver el detalle» |
| 17 | Equipo › una persona › «Ver como» | Nexus como lo ve esa persona; «Volver a mi usuario» te devuelve |

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
