# «Para ti» por equipo — plan y roadmap

> Pedido de Elías del 2026-10-14, a partir de lo que Andrés Pinzón armó por fuera («Jarvis», con
> Todoist). El 2026-10-15, con las etapas 0 a 3 en producción, el plan se amplió: Customer Success
> tiene que poder administrar su cartera con Nexus, y Nexus tiene que ser el agente que conoce a cada
> cliente (ver «Lo que encontró la revisión del 2026-10-15» y «Decisiones (Elías, 2026-10-15)»). La
> página se sigue llamando «Para ti»; «Mi día» es el nombre de trabajo de lo que muestra. Arriba va el
> roadmap; debajo, el detalle de cada pieza y cómo fue cada etapa.

## Roadmap

### Hacia dónde va

Nexus pasa de mostrar información a trabajar con el equipo: lee cada reunión, mantiene al día lo que
se sabe de cada cliente y responde preguntas sobre la cartera. Para Customer Success, que sepa qué
atender hoy en cada cuenta sin armarlo a mano; para Ventas, lo mismo con sus negocios.

Tres principios ordenan el roadmap:

1. **Medir antes de construir más.** Hoy no se sabe quién usa qué, y sin eso no se puede decidir qué
   sigue.
2. **Pedirle menos al equipo.** Lo que propone la IA se usa como borrador y sirve aunque nadie lo
   revise; lo que confirma una persona manda.
3. **Llevar Nexus a donde ya está el equipo**: su calendario, su correo y un chat que responde.

### Dónde estamos (medido el 2026-10-15)

| Indicador | Hoy |
|---|---|
| Lo que Nexus propuso en 30 días y alguien usó | 22 de 1.140 (2 %), decidido por 2 personas |
| Minutas revisadas (las únicas que leen los documentos del cliente) | 4 de 797 |
| Reuniones con clientes que dejaron transcripción | 171 de 378 (45 %); 94 sin nada |
| Proyectos activos sin CSE encargado | 20 (11 sin nadie, 9 de personas que se fueron) |
| Cuentas con siguiente paso vigente | 0 (la función salió el 15 oct) |
| Quién abre Nexus y cuánto tiempo | No se mide |

### El roadmap por horizonte

Sin fechas, a propósito: el código de una etapa sale en uno a cuatro días de trabajo (el tamaño: chico es 1,
mediano 2, grande 3 a 4), pero lo que define cuándo se pasa a la siguiente es desplegarla y probarla con el equipo.
Un horizonte arranca cuando el anterior está desplegado y probado.

| Horizonte | Etapa | Qué entrega | Para quién | Tamaño | Estado |
|---|---|---|---|---|---|
| **Hecho** | 0 | Propiedades de siguiente paso en HubSpot, permiso de tareas, Google Calendar | — | — | ✅ 14 oct |
| | 1 | Negocios abiertos, «Para ti» de Ventas, pregunta de cierre y monto | Ventas | — | ✅ En producción |
| | 2 | Siguiente paso por equipo, en Nexus y en HubSpot | Todos | — | ✅ En producción |
| | 3 | Tareas de HubSpot en Nexus, en los dos sentidos | Ventas y CS | — | ✅ En producción · falta probarla con Andrés |
| | 4a | Medir el uso y completar la cartera | Dirección y CSL | Mediano | ✅ En producción (16 oct) |
| | 4b | La IA como borrador; lo confirmado manda | Todos los agentes | Mediano | ✅ En producción (16 oct) · falta prender los hechos |
| | 4f | Agregar una reunión a mano (la transcripción o lo que recuerdas) y asignarla a un cliente y sus proyectos | Todos los equipos | Mediano | ✅ En producción (16 oct) |
| | 6a | Contactos y tickets de HubSpot en Nexus | Base del resumen y del agente | Mediano | ✅ En producción (16 oct) |
| | 4c | «Para ti» del CSE y el resumen antes de cada reunión | CSE y Ventas | Grande | ✅ En producción (16 oct) · falta «lo de hoy en 5 cosas» y planificar la semana |
| | 4d | Después de cada reunión, un paso de dos minutos | CSE y Ventas | Chico | ✅ En producción (16 oct) |
| **Ahora** | — | **Medir el uso dos semanas** (en paralelo con lo que sigue) | — | — | Desde el 16 oct |
| **Siguiente** | 4e | Correo de la mañana, probado en 4 pasos | Todos | Mediano + 3 semanas de prueba | Paso 1 en producción (16 oct): se ve en Nexus, no se envía · el paso 2 espera el permiso de Gmail |
| | 5 | Notas de la cuenta (WhatsApp, llamadas), a HubSpot y al contexto | CSE y Ventas | Mediano | Construida (16 oct), sin desplegar |
| | 6b | El agente dentro de Nexus | Todos | Grande | Pendiente |
| **Más adelante** | 7 | «Para ti» de Dev, Marketing y Finanzas | Esos equipos | Mediano | Pendiente |
| | 8 | Acciones sugeridas por persona en el chat | Todos | Mediano | Pendiente |

La 6a sube antes de la 4c: el resumen antes de cada reunión necesita saber quién viene y con qué cargo.

### Cómo escala a todos los equipos

Lo que sirve para seguir una cuenta en Customer Success sirve también para Ventas, Desarrollo y, en parte,
Finanzas. Por eso el roadmap se construye una vez y cada equipo se suma con su configuración:

- **Lo de la cuenta es de la cuenta, no del equipo.** Las reuniones (también las que se agregan a mano), las
  notas, la memoria, el siguiente paso y el agente se guardan en la cuenta y los usa cualquier equipo que la
  vea. Ninguna de estas piezas pregunta de qué equipo eres para guardar algo.
- **Un solo registro de equipos.** Hoy hay cuatro definiciones distintas (los sprints de Tareas, los equipos del
  siguiente paso, los frentes de «Para ti» y los frentes de los proyectos). La 4c las junta en una: cada equipo
  declara quién es parte de él, cuál es su cartera, qué siguiente paso lleva y qué ve en «Para ti».
- **Sumar un equipo es sumar una entrada.** La 4c arma el molde con Customer Success y Ventas; la 7 (Dev,
  Marketing y Finanzas) pasa a ser agregar sus entradas al registro, no construir pantallas nuevas.
- Las etapas 4a, 4b, 4f, 4d, 5 y 6b ya sirven para todos los equipos desde el primer día.

### Las etapas que faltan, una por una

**4a · Medir el uso y completar la cartera** (pieza 7)
- **Para qué**: saber quién usa Nexus y qué decide, y que ningún proyecto activo quede sin CSE.
- **Qué se construye**: el registro de uso, con lo mínimo para saber si se usa: por persona, por sección
  de Nexus (Para ti, Clientes, Preventa, Tareas…) y por día, cuántas veces la abrió y a qué hora fue la primera
  y la última. No guarda qué cliente ni qué documento miró, ni minutos. La pantalla «Uso de Nexus» para dirección; la propuesta de CSE para los 20 proyectos, que confirma la CSL y Nexus escribe
  en HubSpot; la lista de quién organiza reuniones con clientes que no quedan grabadas.
- **Qué cambia para el equipo**: la cartera de cada CSE queda completa, que es lo que lee «Para ti».
  Dirección ve qué se usa y qué no.
- **Depende de**: nada. Lleva una tabla nueva.
- **Riesgo**: que se lea como vigilancia. Se mide para mejorar Nexus; el detalle por persona lo ve
  solo dirección.
- **Lista cuando**: hay una semana de registro y ningún proyecto activo sin CSE.

**4b · La IA como borrador; lo confirmado manda** (pieza 8)
- **Para qué**: que lo que se habló en las reuniones llegue a los documentos y a los agentes aunque
  nadie revise las minutas.
- **Qué se construye**: la regla nueva en DECISIONS; los documentos del cliente leen también las
  minutas en borrador, con la frontera y sin montos; cuando algo nuevo contradice lo confirmado, Nexus
  pregunta en «Para ti» o en el chat; el sondeo de hechos (unos US$3,5) y prender la lectura de hechos.
- **Qué cambia para el equipo**: los documentos salen con todo lo conversado; el CSE corrige solo lo
  que está mal, en vez de aprobar cada cosa.
- **Depende de**: tu confirmación de la regla nueva.
- **Riesgo**: que un borrador lleve al documento algo que el cliente no debe ver. La frontera lo corta
  en código (precios, lo dicho puertas adentro) y el CSE revisa el documento antes de publicarlo.
- **Lista cuando**: un diagnóstico generado en un proyecto real usa lo de sus reuniones sin que nadie
  haya revisado las minutas.

**4f · Agregar una reunión a mano** (pieza 14)
- **Para qué**: que una reunión que no pasó por Meet (Zoom, Teams, presencial, una llamada) cuente
  igual que una de Meet.
- **Qué se construye**: «+ Agregar reunión» en Sesiones y en la ficha del cliente: título, fecha, quién
  estuvo, cliente, proyectos y lo que pasó, de la forma que se tenga: la transcripción (pegada o en un
  archivo) o lo que la persona recuerda (un resumen, unas notas, lo que sea). Queda como una reunión más,
  con el cliente fijado a mano, y pasa por la misma lectura que las de Meet (minuta, tareas, pedidos fuera
  de alcance, hechos). Lo que se recuerda se marca así: la lectura no lo toma como palabras del cliente.
- **Qué cambia para el equipo**: esas reuniones llegan a la memoria, al resumen antes de la próxima
  reunión, a los documentos y al agente. Hoy, lo sumado a mano solo lo lee la pieza donde se sumó.
- **Depende de**: nada. Usa la lectura que ya existe.
- **Riesgo**: que la misma reunión quede dos veces (a mano y desde Meet). Nexus avisa si ya hay una del
  mismo cliente ese día con los mismos invitados.
- **Lista cuando**: una reunión de Zoom sumada a mano tiene su minuta y sus tareas propuestas.

**6a · Contactos y tickets** (pieza 12)
- **Para qué**: que Nexus sepa quiénes son las personas del cliente y qué problemas tiene abiertos.
- **Qué se construye**: una copia de solo lectura de los contactos y los tickets de HubSpot, cada hora
  y solo de las empresas que están en Nexus; el cruce de los contactos con las reuniones por el correo
  de los invitados.
- **Qué cambia para el equipo**: la cuenta muestra quién es quién, cuándo habló por última vez cada
  persona y los tickets abiertos.
- **Depende de**: nada. Los permisos de HubSpot ya están. Lleva 2 tablas.
- **Riesgo**: el volumen de contactos de prospección; por eso entran solo las empresas de Nexus.
- **Lista cuando**: las reuniones del último mes muestran a sus invitados con nombre y cargo.

**4c · «Para ti» del CSE y el resumen antes de cada reunión** (piezas 6 y 9)
- **Para qué**: que el CSE sepa qué atender hoy y llegue preparado a cada reunión sin armarlo a mano.
- **Qué se construye**: su vista de «Para ti» (lo de hoy en 5 cosas, su cartera, la agenda del día con
  la empresa de cada reunión, planificar la semana en su calendario); el resumen de cada reunión (quién
  viene, de qué se habló, lo pendiente de los dos lados, el siguiente paso, las alertas y los tickets),
  cada dato con su fuente; la búsqueda de texto completo en las transcripciones, partidas por turnos.
- **Qué cambia para el equipo**: abrir Nexus en la mañana alcanza para saber el día, y el resumen
  reemplaza releer notas antes de una llamada. Ventas recibe el mismo resumen.
- **Depende de**: 4a (la cartera completa), 4b (el borrador) y 6a (quién viene).
- **Riesgo**: que el resumen cite mal o mezcle clientes. Las reuniones salen del chokepoint y cada
  frase citada se verifica contra la transcripción.
- **Lista cuando**: los CSE abren el resumen antes de sus reuniones (lo dice el registro de uso).

**4d · Después de cada reunión** (pieza 10)
- **Para qué**: que lo que dejó una reunión se cierre ese mismo día.
- **Qué se construye**: al terminar una reunión, «Para ti» muestra en corto el siguiente paso propuesto,
  las tareas y el correo de seguimiento, con «Usar todo». Usa la tarjeta «Lo que dejó esta reunión», que
  ya existe.
- **Qué cambia para el equipo**: dos minutos por reunión en vez de cuatro pantallas.
- **Depende de**: 4b.
- **Riesgo**: bajo; si nadie lo mira, igual queda como borrador.
- **Lista cuando**: la mitad de las reuniones con clientes tienen su siguiente paso decidido en 24 h.

**Pausa de dos semanas.** Se mira el registro de uso y lo decidido. Si los CSE no abren «Para ti», se
ajusta antes de construir más.

**4e · Correo de la mañana** (pieza 11)
- **Para qué**: llevar el día al correo, donde el equipo ya está.
- **Qué se construye**: un correo a las 7:00 con las reuniones del día y su resumen, lo que vence hoy y
  lo que espera tu decisión, como mucho 5 cosas. Cada línea lleva a Nexus.
- **Depende de**: 4c (el contenido) y el permiso de Gmail en Google Admin, o un proveedor de correo.
- **Riesgo**: mandar algo que la persona no debe ver. Solo lleva lo que ya ve en Nexus, y se prueba en
  4 pasos: en Nexus sin enviar → solo a Elías una semana → Elías, un CSE y Andrés → todos.
- **Lista cuando**: pasa los 4 pasos sin un error.

**5 · Notas de la cuenta** (pieza 5)
- **Para qué**: que lo que pasa por WhatsApp, una llamada o un correo no se pierda.
- **Qué se construye**: anotar en la cuenta (texto, canal y fecha); la nota va a HubSpot y entra al
  contexto de la cuenta; Nexus sugiere notas después de una reunión de Meet y desde el chat.
- **Depende de**: 4b, para que la nota también deje hechos. Lleva una tabla nueva.
- **Riesgo**: duplicar la nota al volver de HubSpot; Nexus guarda su id.
- **Lista cuando**: el equipo anota cada semana y usa las notas sugeridas.

**6b · El agente dentro de Nexus** (piezas 4 y 13)
- **Para qué**: preguntarle a Nexus cualquier cosa de un cliente o de la cartera y que responda bien.
- **Qué se construye**: el chat del menú, que lee la memoria de la cuenta, busca en las reuniones y
  consulta negocios, contactos, tickets, tareas, siguientes pasos y la escala; responde citando de dónde
  sacó cada cosa; propone escribir (una nota, un siguiente paso, el cierre y el monto, un cambio a la
  ficha, agendar) y la persona aplica; le pregunta al CSE cuando algo no cierra.
- **Depende de**: 4b, 4c (la búsqueda), 6a y 5.
- **Riesgo**: mostrar algo que la persona no puede ver, mezclar clientes o disparar el costo. Ve solo
  los clientes de esa persona, uno por respuesta, nunca finanzas; costo medido por persona y tope diario.
- **Lista cuando**: el equipo le pregunta, las respuestas traen cita y las conversaciones terminan
  aplicando algo.

**7 · «Para ti» de Dev, Marketing y Finanzas** (pieza 6): cada equipo con su cartera, con el mismo
molde de la 4c.

**8 · Acciones sugeridas** (pieza 4): al abrir el chat, el agente sugiere qué hacer hoy con los datos
de «Para ti». Depende de la 6b.

### Cómo medimos el éxito

Las metas son una propuesta: las confirmas tú.

| Indicador | Hoy | Meta propuesta | Se mide desde |
|---|---|---|---|
| CSE que abren «Para ti» al menos 4 de 5 días | No se mide | Todos | 4a |
| Proyectos activos sin CSE | 20 | 0 | 4a |
| Reuniones con clientes con transcripción | 45 % | 80 % | Google Workspace |
| Reuniones que llegan a los documentos | 4 minutas revisadas | Todas, como borrador | 4b |
| Cuentas de CS con siguiente paso vigente | 0 | 8 de cada 10 | 4c |
| Reuniones con el siguiente paso decidido en 24 h | No se mide | La mitad | 4d |
| Preguntas al agente respondidas con cita | — | Se define al empezar la 6b | 6b |

### Riesgos del roadmap

- **Adopción.** Es el riesgo principal y no es técnico. La pausa después de la 4d y el registro de uso
  deciden si seguir.
- **Reuniones sin transcripción.** Más de la mitad no la tiene, y eso limita todo lo que lee reuniones.
  Se arregla en Google Workspace, no en el código.
- **Información que cruza donde no debe.** Al cliente o entre clientes. Lo cubren la frontera en código,
  el chokepoint de reuniones y el acceso por cliente.
- **Costo de la IA.** El resumen, los hechos y el agente suman llamadas. Medidor por persona y topes.

### Decisiones que faltan (tuyas)

1. Confirmar las metas de «Cómo medimos el éxito».
2. Que la 6a suba antes de la 4c.
3. Con el resultado del sondeo de hechos, elegir la variante y el modelo.
4. Correo de la mañana: Gmail de Smarteam o un proveedor.
5. Con quién se prueba primero el agente.

### Fuera de la v1

- Páginas a la medida que arma el agente desde el chat (como un artefacto de Claude).
- Subir el audio de una reunión y que Nexus lo transcriba (pide un servicio de transcripción aparte).
- Búsqueda por significado (vectores), salvo que la de palabras no alcance.
- Un conector para que cada persona use Nexus desde su propio Claude.
- Escribir contactos y tickets en HubSpot.

### Lo que no es código

- **Google Workspace**: que las reuniones con clientes queden grabadas con transcripción (94 de 378 no
  dejaron nada en el último mes). Lo mira Elías.
- **Google Admin**: autorizar enviar correos con Gmail, o elegir un proveedor, para la 4e.
- **Andrés**: probar la etapa 3 (completar o cambiar la fecha de una tarea en Nexus y verla en
  HubSpot).
- **El deploy** de cada etapa.

## Para qué

Que cada persona abra Nexus y vea su día: su cartera, qué cierra o qué toca, sus reuniones, sus
tareas (las de Nexus y las de HubSpot) y el siguiente paso de cada cuenta. Y que lo que pasa fuera de
una reunión (un WhatsApp, una llamada) se pueda contar por chat y quede en la cuenta y en HubSpot.

Elías quiere bajar el ritmo de desarrollo y enfocarse en el uso. Por eso el plan **conecta piezas que
ya existen** y construye lo mínimo nuevo. Cada etapa se despliega sola y tiene su métrica.

## Lo que ya existe

- **«Para ti»** (`lib/para-ti`): qué es tuyo, frentes, fuentes, avisos. Sirve de base para «Mi día».
- **Tareas** (`lib/tareas`): las tareas guardan su fuente (`origen`); planificador de huecos
  (`proponerHorarios`) y bloques en Google Calendar (`lib/google/agenda.ts`). Sigue en piloto.
- **Chat de tareas** (`lib/tareas/chat`): un hilo por persona, una lista que se revisa y se aplica de
  una vez. Es la base del chat general.
- **Memoria de la cuenta** (`lib/memoria`), **propuestas a la ficha** (`proponerCambiosALaFicha`, acepta
  cualquier texto) y **hechos** (`HechoDeReunion`, con `sessionId` opcional).
- **Encuesta de la etapa**: el molde para que Nexus pregunte y, con la respuesta, escriba en HubSpot.
- **Notas a HubSpot**: Nexus ya escribe notas en la empresa (`lib/clients/ficha-hubspot.ts`).
- **Metas comerciales** (`lib/ventas/metas.ts`): calculadas por persona, sin pantalla.
- **Preventa**: ya pregunta el presupuesto y para cuándo lo necesita el cliente, y lee las reuniones
  de HubSpot.

## Lo que falta (medido el 2026-10-14)

- Nexus **no guarda los negocios abiertos** ni el **dueño de cada empresa** en HubSpot: solo los
  ganados. Por eso no existe «la cartera de un vendedor».
- De los 42 negocios abiertos de Andrés: 23 cierran el 31 de octubre y 11 el 30 de noviembre (la
  fecha se pone a fin de mes), 5 tienen el cierre vencido (febrero a junio), 13 de 40 no tienen monto
  y 29 de 40 traen siguiente paso en HubSpot (`hs_next_step`), que Nexus no lee.
- Nexus **no lee tareas de HubSpot**.
- **No hay «siguiente paso» por cliente** que escriba una persona. El «Qué sigue» del proyecto es
  calculado y solo existe en el navegador.
- El chat **no lee la memoria de la cuenta** ni escribe en ella.
- **Dev** no ve nada propio en «Para ti»: el alcance solo mira proyectos del pipeline de Customer
  Success. Los proyectos de Desarrollo e integración y Sitios web tienen dueño en HubSpot (8 de
  bsalas, 6 de asalas, 4 de arodriguez, 2 de lflores; 5 sin dueño).

## Lo que encontró la revisión del 2026-10-15

Elías preguntó si, con este plan, Customer Success va a poder administrar sus pendientes, la atención
de cada cuenta y su cartera, y lo mismo Ventas. Medido en producción (solo lectura, últimos 30 días):

- **Lo que Nexus propone casi no se decide.** Propuso 1.140 cosas (minutas, tareas, alertas, campos de
  la ficha, pedidos fuera de alcance), se usaron 22 y solo 2 personas decidieron algo. Minutas: 4
  revisadas de 797. Tareas que salieron de reuniones: 63, ninguna decidida. Alertas de cuentas: 145
  abiertas y 15 cerradas. Avisos de «Para ti»: casi ninguno leído.
- **Eso tranca el contexto.** Los documentos que ve el cliente leen solo las minutas revisadas, y hay
  4. La lectura de hechos (`SEGUIMIENTO_HECHOS`) está apagada: 0 hechos guardados.
- **Faltan reuniones.** De 378 reuniones con clientes en el mes, 171 tienen transcripción, 113 solo
  las notas de Gemini y 94 nada.
- **La cartera de los CSE está casi completa.** De los proyectos activos de clientes, 11 no tienen CSE
  encargado (6 de Implementación, 3 de Sitios web, 1 de Customer Success CRM y 1 de Desarrollo) y 9
  están a nombre de gente que ya se fue: 20 en total. Los otros 77 «sin encargado» son los proyectos
  internos que Nexus crea para cada cliente (`__strategy__`), que no son proyectos de HubSpot.
- **No se puede medir el uso.** Nexus no registra quién abre qué pantalla (las sesiones de Supabase se
  renuevan solas). La señal más cercana, usar la IA a mano: los CSE, entre 0 y 5 días al mes cada uno.
- **Lo que hay para el agente.** Nexus guarda la transcripción completa de cada reunión (2.407, 95
  millones de caracteres, tope de 150.000 por reunión, que pasó una sola). La base pesa 159 MB y la
  extensión `vector` ya está instalada en Supabase. Faltan como entidades los **contactos** (hoy son
  texto en la ficha) y los **tickets** (hoy solo se cuentan).

La lectura: el plan construía las pantallas correctas, pero lo que falla no son las funciones. Nexus
produce mucho, casi nadie lo decide y por eso el contexto no llega a los agentes. Hay que pedirle
menos al equipo, llevarle Nexus a donde ya está (su calendario, su correo) y hacer que el agente
conteste con lo que Nexus sabe.

## Decisiones (Elías, 2026-10-15)

1. **Nexus es un analizador de reuniones, un administrador de proyectos y un agente que conoce a cada
   cliente.** Se le pregunta algo y responde bien, como Breeze sobre HubSpot. Por eso importa que la
   arquitectura tenga bien las relaciones: empresas, contactos, negocios, tickets, tareas, sugerencias
   y escala.
2. **Lo que llena la IA es un borrador que se usa desde el primer momento; lo que confirma una persona
   manda.** La IA nunca pisa lo confirmado, y si ve algo que lo contradice, pregunta. El chat también
   le puede preguntar al CSE. Esto cambia una decisión escrita (los documentos del cliente leen solo
   minutas revisadas): va primero en DECISIONS.
3. **Antes de cada reunión, un resumen**; **después, un solo paso** de dos minutos. Valen para CSE y
   Ventas.
4. **Correo de la mañana con «tu día»**, pero se prueba muy bien antes de mandarlo a todos.
5. **Higiene antes de construir**: los 20 proyectos sin CSE (se asignan en Nexus y Nexus los escribe en
   HubSpot), las reuniones sin transcripción (Elías lo mira en Google Workspace) y registrar el uso.
6. **Para buscar, se guarda todo lo que se dijo** en cada reunión (ya se guarda; se puede subir el
   tope).
7. **Contactos y tickets de HubSpot en Nexus**, para que el agente los cruce con las reuniones.
8. **El agente vive dentro de Nexus**, no como conector para el Claude de cada persona: sin cuentas
   pagas por persona ni uso personal, con el costo medido y un tope por persona, y viendo solo lo que
   esa persona puede ver.
9. **Los artefactos a la medida desde el chat** (una página que arma el agente, como un artefacto de
   Claude) **no van en la v1**. Se pueden hacer después, con la API: el modelo escribe el contenido y
   Nexus lo guarda y lo muestra.
10. **La 4f va en «Ahora».** Agregar una reunión puede ser con la transcripción o con lo que la persona
    recuerda: un resumen, unas notas, cualquier contexto de la reunión.
11. **El registro de uso guarda lo mínimo** que sirva para verificar el uso básico.
12. **Sondeo de hechos aprobado** (unos US$3,5).
13. **Todo tiene que escalar a todos los equipos**: lo que sirve para seguir cuentas en Customer Success
    aplica a Ventas y a Desarrollo, y parte a Finanzas. Ver «Cómo escala a todos los equipos».

## Decisiones (Elías, 2026-10-14)

1. **Nexus pregunta la fecha de cierre y el monto** de un negocio que no los tiene (o los tiene
   vencidos), solo cuando Ventas está trabajando ese negocio. Propone el valor desde las reuniones y la
   actividad del CRM, y la respuesta se escribe en HubSpot.
2. **El siguiente paso es estándar en HubSpot**: la misma propiedad, con el mismo nombre, en cada
   empresa, cada negocio y cada proyecto. Hay uno por equipo, con persona y fecha: se ve que el de
   Ventas lo lleva Andrés y el de CS lo lleva otra persona. El de la empresa sirve cuando tiene varios
   proyectos y para retomar a un excliente. `hs_next_step` queda como sugerencia.
3. **Tareas de HubSpot**: Nexus las lee, las escribe y las actualiza; todas las de cada persona,
   también las de secuencias, cada una diciendo que viene de HubSpot. Elías habilita el permiso.
4. **Chat en el menú.** Después, que sugiera acciones para cada persona según su cartera, sus
   proyectos y sus tareas.
5. **Las notas de la cuenta llegan a HubSpot**, y Nexus también las sugiere y las guarda en su
   contexto.
6. **«Mi día» es distinto por equipo:**
   - Ventas y CSE ven su cartera.
   - La CSL ve Éxito del cliente (la cartera entera).
   - Dev ve su cartera: los clientes con un proyecto de desarrollo activo.
   - Marketing ve sus tareas internas, asociadas a las empresas Smarteam y SmartAgro.

## Las piezas

### 1. Negocios abiertos y preguntas de cierre y monto

- **Copia de los negocios abiertos** (tabla nueva `NegocioAbierto`): los tres pipelines de venta
  propia, con dueño, empresa, etapa, fecha de cierre, monto (con su moneda y en USD con la tasa de
  Nexus), probabilidad, `hs_next_step`, próxima actividad y última actividad. La trae un job diario y
  se refresca al abrir «Mi día» si tiene más de una hora. Cubre prospectos y clientes.
- **Dueño de cada empresa** en `Client` (copiado de HubSpot): sin él no hay «cartera» de un
  vendedor.
- **La pregunta** (molde de la encuesta de la etapa): un negocio abierto del vendedor, sin fecha de
  cierre, con la fecha vencida o sin monto, que tuvo interacción en los últimos 14 días (una reunión
  con la empresa o actividad en HubSpot). Aparece en «Mi día» y en la ficha:
  - «¿Cuándo cierra «Casagri – Nuevo tipo de objeto»? Nexus propone 30 nov: «la gerencia decide antes
    de fin de mes» (reunión del 12 oct)».
  - Responder escribe la fecha o el monto en el negocio de HubSpot (`crm.objects.deals.write`, que ya
    tenemos). «Ahora no» la calla por 7 días.
- **De dónde sale lo que propone**: las minutas y los resúmenes de las reuniones con la empresa, las
  notas de HubSpot y, si hay preventa, sus casillas de presupuesto y de cuándo lo necesita. Lo propone
  un modelo pequeño solo cuando se muestra la pregunta, con la frase copiada tal cual. No se agrega una
  lectura más por reunión.
- **Señales del negocio** (sin IA): cierre vencido, sin monto, sin siguiente paso, sin actividad hace
  21 días.

### 2. Siguiente paso, por equipo

- **En HubSpot**: un grupo de propiedades «Nexus · Siguiente paso», con los MISMOS nombres internos en
  empresas (0-2), negocios (0-3) y proyectos (0-970). Por cada equipo: qué, fecha y responsable (un
  campo de tipo usuario, como `cse_encargado`):
  - `siguiente_paso_ventas`, `siguiente_paso_ventas_fecha`, `siguiente_paso_ventas_responsable`
  - `siguiente_paso_cs`, `siguiente_paso_cs_fecha`, `siguiente_paso_cs_responsable`
  - `siguiente_paso_dev`, `siguiente_paso_dev_fecha`, `siguiente_paso_dev_responsable`

  Las de empresas y negocios las puede crear un script (la app tiene permiso de escribir esos
  esquemas). Las de proyectos las crea un administrador en HubSpot, porque la app no tiene permiso de
  escribir el esquema de proyectos.
- **El de la empresa** no repite al del negocio o el proyecto: es el de la cuenta entera. Sirve cuando
  hay varios proyectos y para una cuenta sin nada abierto, como un excliente que se quiere retomar.
- **En Nexus** (tabla nueva `SiguientePaso`): cada cambio es una fila con objeto, equipo, responsable,
  qué, fecha, quién lo escribió y de dónde salió (a mano, chat, reunión, HubSpot). El vigente de cada
  equipo se escribe en HubSpot. Así queda la historia en Nexus y lo de hoy en HubSpot.
- **Quién lo escribe**: cada persona, el suyo. Nexus lo sugiere desde la minuta de la última reunión,
  desde el chat y desde `hs_next_step` (en negocios). La persona lo usa o lo cambia. Nexus nunca
  escribe `hs_next_step`: lo llena HubSpot.
- **Dónde se ve**: en la ficha del cliente (los de todos los equipos, juntos), en el negocio, en el
  proyecto y en «Mi día» como «Tu siguiente movimiento». Una cuenta sin siguiente paso vigente, o con
  la fecha pasada, es una señal.
- **Con fecha**, se puede agendar: «Agendar» lo pasa a una tarea y a tu calendario.

### 3. Tareas de HubSpot

- **Primero, una prueba de solo lectura**: buscar las tareas abiertas de una persona en HubSpot con la
  conexión del sistema y medir cuántas son. Con eso se ve qué permiso pide HubSpot. Si hace falta uno
  nuevo, se declara «Opcional» en la app pública y se reconecta desde Integraciones (el código lo pide
  después, nunca antes).
- **Entran como `Tarea`** con `origen = "hubspot"` y el id de HubSpot, para que vivan en la misma
  lista, la misma semana y la misma agenda. Las tareas de HubSpot ya tienen dueño, así que no son
  propuestas. Entran todas las abiertas de cada persona del equipo (también las que crean las
  secuencias), más las completadas de los últimos 7 días.
- **Se leen y se escriben**: completar, cambiar la fecha o el título desde Nexus lo escribe en
  HubSpot. La copia trae lo cambiado allá cada 15 minutos (por fecha de modificación). Si los dos
  cambiaron la misma tarea, gana lo último y queda en la bitácora de la tarea.
- **La fuente se ve**: un chip «HubSpot» (o «HubSpot · secuencia») con enlace a la tarea y a su
  negocio o empresa.
- **Tareas sale del piloto** para Ventas y CSE.
- No se crean en HubSpot las tareas que nacen en Nexus (salvo que se decida lo contrario).

### 4. Chat en el menú

Desde el 2026-10-15 esta pieza es la cara del agente (pieza 13): las acciones de abajo son lo que el
agente puede proponer escribir.

- **«Chat»** en el menú, para todos los internos con `asistente.read`. Es el chat de tareas ampliado,
  con un hilo por persona.
- **Lee**: tu cartera (según tu equipo), y de la cuenta que nombras, su memoria (alcance interno, se
  declara en `lib/memoria/consumidores.ts`), sus negocios, sus siguientes pasos y sus tareas.
- **Acciones nuevas**, que se revisan y se aplican de una vez:
  - anotar en la cuenta (pieza 5);
  - fijar un siguiente paso;
  - poner fecha de cierre o monto a un negocio (se escribe en HubSpot);
  - proponer un cambio a la ficha (origen «Chat»);
  - agendar.
- **Después** (etapa 8): al abrir el chat sugiere acciones para ti, con los datos de «Mi día».
- Tiene su propio medidor y un tope de mensajes por persona al día, como el chat de tareas.

### 5. Notas de la cuenta

- **Anotar** algo de un WhatsApp, una llamada o un correo (tabla nueva `NotaDeLaCuenta`): texto,
  canal, fecha, autor, empresa y, si aplica, el negocio o el proyecto.
- **Va a HubSpot** como nota de la empresa (y del negocio o el proyecto), a nombre de quien la
  escribió. Nexus guarda el id de la nota, y al leer HubSpot no la vuelve a traer como si fuera nueva.
- **Entra al contexto**: la memoria interna de la cuenta suma «Notas del equipo». Con la lectura de
  hechos prendida, la nota también deja hechos (`HechoDeReunion` sin reunión), y de ahí salen
  propuestas a la ficha y novedades. La ve todo el que ve la cuenta; nunca le llega al cliente.
- **Nexus sugiere notas** para HubSpot:
  - después de una reunión de Meet (lo acordado, para el registro de HubSpot, porque esas reuniones
    no quedan allá);
  - desde el chat, cuando cuentas algo.

  Se usa o se descarta, como todo lo propuesto.

### 6. «Mi día» por equipo

La misma página para todos; lo que ve cada persona depende de su equipo. El equipo sale del rol
(`TeamRole`). Un Super Admin elige el suyo (Marco vende, así que ve el de Ventas).

| Equipo | Su cartera | Lo que ve |
|---|---|---|
| Ventas | Empresas donde es dueño en HubSpot, más las empresas donde tiene un negocio abierto aunque no sea dueño de la empresa | Cierres más cerca, preguntas de cierre y monto, siguiente paso por negocio, agenda, tareas (Nexus y HubSpot), meta del año y lo ponderado |
| CSE | Proyectos donde es CSE encargado | Siguiente paso de CS, agenda, tareas, lo de hoy de «Para ti» (reuniones, cronograma, etapa), relación con HubSpot por vencer |
| CSL | Toda la cartera de CS | Éxito del cliente, su frente, agenda y tareas |
| Dev | Clientes con un proyecto activo de Desarrollo e integración o Sitios web donde es dueño | Siguiente paso de Dev, agenda, tareas |
| Marketing | Smarteam y SmartAgro | Tareas internas de esas empresas, agenda, publicaciones por revisar |
| Finanzas | — | Lo de su frente (después) |

- **Cartera ordenada**: con negocio y fecha de cierre, después con monto, después solo con negocio, y
  al final sin negocio. Cada cuenta muestra su siguiente paso y sus señales.
- **Agenda del día**: tus eventos de Google Calendar, con la empresa de cada reunión (reconocida por
  los dominios de los invitados, con la misma regla de la exploración) y «Preparar».
- **Planificar la semana**: el lunes, Nexus propone bloques para tus tareas y tus siguientes pasos con
  fecha, en tus huecos (el planificador que ya existe). Escribir en el calendario necesita que Google
  Admin autorice `calendar.events.owned` (pendiente desde el módulo de Tareas).

### 7. Medir el uso y completar la cartera (2026-10-15)

- **Registro de uso**: quién abre qué pantalla y cuántos minutos, una fila por persona, pantalla y día.
  Está diseñado (el «latido» del centro de comando), no construido. Sin él no se puede saber si «Para
  ti» sirve.
- **«Uso de Nexus»**, para dirección: qué propone Nexus, qué se usa, qué se descarta y qué vence, por
  módulo y por persona. Los números ya se calculan (`usoDeLoPropuesto`); falta la pantalla.
- **Los 20 proyectos sin CSE**: Nexus propone el CSE de cada uno (el de la cuenta, o quien más
  reuniones tuvo con ella), la CSL lo confirma y Nexus lo escribe en HubSpot con el pase de cuenta que
  ya existe.
- **Reuniones sin transcripción**: una lista de solo lectura con quién organiza las reuniones con
  clientes que no quedan grabadas, para arreglarlo en Google Workspace.

### 8. La IA como borrador; lo confirmado manda (2026-10-15)

- **Lo que propone la IA se usa desde el primer momento**, marcado como borrador, y lo que confirma
  una persona lo reemplaza. Nada se pierde porque nadie lo revisó.
- **Los documentos que ve el cliente leen también las minutas en borrador**, con la frontera y sin
  montos (era la decisión pendiente de la etapa 7 de la memoria de la cuenta).
- **Si algo nuevo contradice lo confirmado, Nexus no lo pisa: pregunta.** «La reunión del 12 dice X;
  la ficha dice Y. ¿Cuál vale?», en «Para ti» o en el chat.
- **Prender la lectura de hechos**: correr el sondeo (unos US$3,5), elegir la variante y prender
  `SEGUIMIENTO_HECHOS`.
- Cambia una regla escrita, así que va primero en DECISIONS.

### 9. Antes de cada reunión (2026-10-15)

- **Un resumen de la cuenta para la reunión de hoy**, en «Para ti» y en la agenda («Preparar»): quién
  viene (con su cargo, de los contactos), de qué se habló la última vez, lo pendiente de los dos lados,
  el siguiente paso, las alertas y los tickets abiertos, y el negocio si hay. Cada dato con su fuente
  (la reunión y la frase, la ficha o HubSpot).
- **Búsqueda en las reuniones**: texto completo en español con Postgres (sin servicio nuevo), sobre las
  transcripciones partidas por turnos, para citar la frase exacta. La búsqueda por significado
  (vectores) solo si la de palabras se queda corta. Subir el tope de 150.000 caracteres por reunión.
- Para CSE y para Ventas.

### 10. Después de cada reunión (2026-10-15)

- **Un solo paso de dos minutos**: al terminar, «Para ti» muestra lo que dejó la reunión en corto: el
  siguiente paso propuesto, las tareas y el correo de seguimiento. «Usar todo» o cambiar algo.
- Si nadie lo mira, igual queda como borrador (pieza 8).
- Para CSE y para Ventas.

### 11. Correo de la mañana (2026-10-15)

- **A las 7:00, «tu día»**: tus reuniones con su resumen, lo que vence hoy y lo que espera tu decisión,
  como mucho 5 cosas. Cada línea lleva a Nexus.
- Sale de una cuenta de Smarteam (Google Admin autoriza enviar con Gmail) o de un proveedor de correo.
- **Se prueba en 4 pasos** antes de mandarlo a todos:
  1. se arma y se ve en Nexus, sin enviar;
  2. solo a Elías, una semana;
  3. a Elías, un CSE y Andrés;
  4. a todos, con un enlace para dejar de recibirlo.
- Solo lleva lo que esa persona ya puede ver: nunca otro cliente ni finanzas.

### 12. Contactos y tickets (2026-10-15)

- **Copia de solo lectura de HubSpot**, como la de los negocios, y solo de las empresas que están en
  Nexus.
- **Contactos**: nombre, cargo, correo, empresa, dueño y última actividad. Se cruzan con las reuniones
  por el correo de los invitados: quién vino y cuándo habló por última vez cada persona.
- **Tickets**: asunto, estado, prioridad, fecha, dueño y empresa.
- Los leen la ficha, la memoria de la cuenta y el agente. Nexus no los escribe (por ahora).

### 13. El agente dentro de Nexus (2026-10-15)

- **Se le pregunta cualquier cosa de un cliente o de tu cartera** y responde con lo que Nexus sabe,
  diciendo de dónde lo sacó (la reunión y la frase, la ficha, HubSpot). Es el chat del menú (pieza 4).
- **Lo que puede leer**: la memoria de la cuenta, la búsqueda en las reuniones (pieza 9), los negocios,
  los contactos y los tickets, las tareas, los siguientes pasos y la escala.
- **Lo que puede escribir**: las acciones de la pieza 4, siempre como propuesta que la persona aplica.
- **Le pregunta al CSE** cuando algo no cierra (pieza 8).
- **Vive en Nexus**: sin cuentas de Claude por persona, con el costo medido por persona y un tope
  diario. Ve solo los clientes que esa persona puede ver, nunca mezcla dos clientes en una respuesta y
  no lee finanzas ni salarios.

### 14. Agregar una reunión a mano (2026-10-15)

- **Hoy**: las reuniones solo nacen de Google Meet. A una reunión de Meet se le puede cambiar el cliente
  (Sesiones) y sumar a un proyecto, pero una de Zoom, Teams, presencial o por teléfono no existe en
  Nexus. «Sumar una sesión o un documento» del «Contexto adicional» guarda el texto como fuente de esa
  pieza y como documento de la empresa: no es una reunión, así que no tiene minuta, no deja tareas ni
  hechos, no entra a la memoria y no aparece en Sesiones.
- **Lo nuevo**: «+ Agregar reunión» en Sesiones y en la ficha del cliente, con título, fecha, quién
  estuvo, cliente, proyectos y el contenido (transcripción pegada, archivo de texto, Word, subtítulos
  o notas escritas). Se guarda como una reunión con origen «a mano» (`FirefliesSession.source`), el
  cliente fijado por la persona y los proyectos vinculados a mano, y entra a la cola de la lectura de
  cada reunión.
- **Lo sumado en «Contexto adicional»**: cuando lo que se suma es una reunión, se ofrece crearla como
  reunión de verdad; un documento sigue siendo un documento.
- **Duplicados**: si ya hay una reunión del mismo cliente ese día con los mismos invitados, Nexus avisa
  antes de crearla.
- Lo puede hacer quien tiene acceso a ese cliente.

## Respuestas de Elías (2026-10-14)

1. `hs_next_step`: como sugerencia.
2. El siguiente paso va también en la empresa: por si tiene varios proyectos y para retomar
   exclientes.
3. Marketing y su propio siguiente paso: pendiente (ver abajo).
4. Cartera de Ventas: las dos, incluida la empresa donde tiene un negocio abierto sin ser dueño.
5. Tareas de HubSpot: todas, diciendo de dónde vienen.
6. El nombre se queda «Para ti».

Marketing no lleva siguiente paso propio (Elías, 2026-10-14).

## Etapa 0, cómo va (2026-10-14)

- **Google Calendar**: autorizado. Nexus ya obtiene el permiso `calendar.events.owned` (se pidió un
  token, sin escribir nada).
- **Tareas de HubSpot**: leer, crear, completar y borrar ya funcionan con la conexión de hoy (probado
  con una tarea a nombre de Elías, borrada enseguida). `crm.objects.tasks.write` se pide como opcional
  pero HubSpot no lo concedió; hoy no hace falta.
- **Propiedades de siguiente paso**: creadas el 2026-10-14 en empresas, negocios y proyectos (grupo
  «Nexus · Siguiente paso», 9 por objeto), con `scripts/hubspot-crear-propiedades-siguiente-paso.ts`
  sobre la lista de `lib/siguiente-paso/propiedades.ts`. HubSpot se reconectó ese día con
  `crm.schemas.projects.write`.

La etapa 0 está cerrada.

**Las tareas de HubSpot hoy** (medido el 2026-10-14, solo lectura): 1.062 abiertas en el portal y
casi todas vencidas. 485 no tienen dueño, unas 300 son de personas que ya no están, Lidia Flores
tiene 117, Alexander Arrieta 56, Alejandra Ortega 46 y Andrés Pinzón 9 (3 vencidas). Ese mismo día
Elías las borró en HubSpot y dejó solo las 9 de Andrés (verificado: 9 abiertas en todo el portal). La
etapa 3 arranca con la lista limpia; si vuelven a juntarse vencidas, se resuelve entonces.

## Etapa 1, cómo va (2026-10-14)

En producción desde el 2026-10-15 (`1de1ea53`) (las reglas, en DECISIONS ««Para ti» de Ventas: los negocios abiertos…»):
- La copia: `NegocioAbierto` + `Client.hubspotOwnerId/Email`, `lib/ventas/sync-negocios-abiertos.ts`, job
  `negocios-abiertos` (cada hora, 6:00 a 20:00) y `scripts/sync-negocios-abiertos.ts` para la carga inicial.
- Las reglas: `lib/ventas/negocios.ts` (señales, temperatura, pregunta, cierres más cerca, ponderado, cartera).
- «Para ti»: `components/para-ti/VentasDeParaTi.tsx` (Tu día · Tu cartera, la meta, lo ponderado, el pipeline y la
  pregunta) y la fuente `lib/para-ti/fuentes/negocios.ts`.
- La pregunta escribe en HubSpot (`/api/sales/negocios/[id]/respuesta`) y Nexus propone el valor
  (`/api/sales/negocios/[id]/propuesta`, `lib/ventas/propuesta-de-cierre*.ts`).

Medido el 2026-10-14 contra HubSpot (solo lectura): 201 negocios abiertos (123 de Marco, 42 de Andrés, 10 de Alex
Vanegas), todos con fecha de cierre, 61 sin monto.

El 2026-10-15, después de verla en uso: «Para ti» saluda con el nombre y la fecha, y «Tu cartera» pasa a cuatro vistas
(para mover hoy, pipeline, por limpiar, sin negocio) con buscador, filtros y una acción por fila. Los pausados salen
del pipeline y de lo ponderado. Con los datos de Andrés: 24 para mover hoy, 37 en el pipeline, 6 por limpiar y 49
sin negocio.

Para ponerla en marcha: el SQL `scripts/sql/2026-10-14-negocios-abiertos.sql`, `npx prisma generate`, reiniciar el
dev server, la carga inicial con `scripts/sync-negocios-abiertos.ts --apply` y, con el deploy, el job sigue solo.

## Etapa 2, cómo va (2026-10-15)

En producción desde el 2026-10-15 (`1de1ea53`) (las reglas, en DECISIONS «El siguiente paso de cada equipo, en Nexus y en HubSpot»):
- La tabla `SiguientePaso` (SQL `scripts/sql/2026-10-15-siguiente-paso.sql`, ya aplicado en producción).
- `lib/siguiente-paso`: las reglas (`reglas.ts`), la escritura en HubSpot (`escritura-server.ts`), la lectura
  (`lectura-server.ts`) y lo que vuelve de HubSpot en la copia de los negocios (`copia-server.ts`).
- La API: `POST /api/siguiente-paso`, `POST /api/siguiente-paso/[id]/hecho`, `GET /api/siguiente-paso/personas` y
  `GET /api/clients/[id]/siguientes-pasos`.
- La pantalla: el diálogo (`components/siguiente-paso`), la cartera de «Para ti», el panel de «Información del
  cliente» y el pendiente «Tu siguiente movimiento» (`lib/para-ti/fuentes/siguientes-pasos.ts`).

Probado el 2026-10-15 contra HubSpot: un paso de prueba en la empresa Smarteam se escribió (texto, fecha y
responsable) y se borró. La copia lee las propiedades de los 201 negocios sin error.

## Etapa 3, cómo va (2026-10-15)

En producción desde el 2026-10-15 (`1de1ea53`) (las reglas, en DECISIONS «Las tareas de HubSpot viven en Tareas internas, en los dos
sentidos»):
- Las columnas en `Tarea` (SQL `scripts/sql/2026-10-15-tareas-de-hubspot.sql`, ya aplicado en producción) y el origen
  «hubspot».
- `lib/tareas-hubspot`: las reglas (`reglas.ts`, la comparación de los tres) y la copia (`sync-server.ts`); lo que llega
  de HubSpot lo escribe el escritor único de Tareas.
- El job `tareas-hubspot` (cada 15 minutos) y la escritura enseguida al guardar una tarea de HubSpot en Nexus.
- El chip «HubSpot» y los enlaces en el cajón. Tareas, en el menú de Ventas y Customer Success.

Carga inicial el 2026-10-15: 13 tareas de Andrés (9 abiertas y 4 completadas esta semana). Falta probar con Andrés
que completar o cambiar la fecha en Nexus llega a HubSpot.

## Etapa 4f, cómo va (2026-10-15)

Construida el 2026-10-15 (las reglas, en DECISIONS «Agregar una reunión a mano: la transcripción o lo que se recuerda»):
- Las reglas puras: `lib/sessions/reunion-a-mano.ts` (la marca `summary.aMano`, quién estuvo, la fecha en hora de Costa
  Rica, los subtítulos de Zoom y Teams a turnos, qué se puede guardar). La escritura: `lib/sessions/reunion-a-mano-server.ts`.
- La API: `GET/POST /api/clients/[id]/reuniones-a-mano` (opciones del cliente y agregar). Un archivo .txt, .vtt o .srt
  se lee en el navegador (no sube al servidor); Word y PDF se copian y se pegan.
- La pantalla: «+ Agregar reunión» arriba de la lista de Sesiones y «+ Reunión» en la cabecera de la ficha del cliente
  (`components/sessions/AgregarReunion.tsx`).
- La lectura: la cola acepta un recuerdo con su propio piso; la lectura de cada reunión lo lee entero con un
  encabezado que dice que no es una transcripción; la lectura de hechos lo toma como texto sumado a mano; una persona
  anotada sin correo cuenta como de afuera.
- Sin SQL.

Falta: probarla en la app con sesión (el navegador del preview no está logueado), el commit y el deploy. Pendiente de
diseño: ofrecerla desde el «Contexto adicional».

## Etapa 4b, cómo va (2026-10-15)

Construida el 2026-10-15 (las reglas, en DECISIONS «La IA como borrador; lo confirmado manda»):
- Las minutas en borrador llegan a todos los lectores, marcadas; a los documentos del cliente, solo sus acuerdos y
  decisiones sin montos ni negociación (`lib/memoria/consumidores.ts`, `lib/memoria/armar.ts`,
  `lib/contexto/material-del-documento.ts`).
- Toda memoria lleva la regla «lo confirmado manda» (`LO_CONFIRMADO_MANDA`).
- La ficha pregunta «¿Cuál vale?» cuando la propuesta deja de decir algo confirmado (`lib/clients/contradice.ts`,
  `components/clients/FichaDelCliente.tsx`).
- El sondeo de hechos corrió el 2026-10-15 (resultado en `backups/2026-10-15-sondeo-de-hechos/`, no sale de la PC).

Falta: que Elías elija la variante y el modelo de la lectura de hechos con el sondeo y la prenda
(`SEGUIMIENTO_HECHOS=1` en el servidor); llevar la pregunta a «Para ti» y al chat; probar en la app, commit y deploy.

## Etapa 4a, cómo va (2026-10-16)

Construida el 2026-10-16 (las reglas, en DECISIONS «Medir el uso y completar la cartera»):
- El latido: cada sección que abre cada persona, por día (`UsoDeNexus`, `lib/uso/`,
  `components/layout/LatidoDeUso.tsx`, `POST /api/uso`). El SQL `2026-10-16-uso-de-nexus.sql` ya se aplicó en
  producción: empieza a contar con el deploy.
- «Uso de Nexus» (`/para-ti/uso`, solo dirección, enlace arriba de «Para ti»): Equipo, Para qué se usa y Reuniones sin
  grabar.
- La propuesta de CSE para las cuentas sin encargado, en Éxito del cliente › Equipo (`lib/cs/sin-cse.ts`). Medido el
  2026-10-16: 13 cuentas con 16 proyectos sin CSE; Nexus propone a alguien en 7 (5 por llevar otros proyectos de la
  cuenta, 2 por haber estado en sus reuniones).

Falta: desplegar, que la CSL confirme los CSE y, después de una semana de registro, mirar «Uso de Nexus».

## Etapa 6a, cómo va (2026-10-16)

Construida el 2026-10-16 (las reglas, en DECISIONS «Contactos y tickets de HubSpot en Nexus»):
- La copia de cada hora (`ContactoDeHubspot`, `TicketDeHubspot`, `lib/contactos/`, `lib/hubspot/contactos-y-tickets.ts`,
  job `contactos-y-tickets`). El SQL `2026-10-16-contactos-y-tickets.sql` ya se aplicó y la carga inicial ya corrió:
  185 empresas, 1.405 contactos y 418 tickets.
- La cuenta › Personas y tickets, y los invitados con nombre y cargo en la página de cada reunión.
- La memoria de la cuenta suma las personas y los tickets abiertos, solo en el alcance interno.
- Medido el 2026-10-16: de las 336 reuniones con clientes del último mes, 319 muestran al menos un invitado con nombre;
  790 de 1.259 invitados de afuera tienen nombre y 498, cargo.

Falta: desplegar.

## Etapa 4c, cómo va (2026-10-16)

Construida el 2026-10-16 (las reglas, en DECISIONS «"Para ti" del CSE y el resumen antes de cada reunión»):
- El registro de equipos (`lib/equipos/registro.ts`): el siguiente paso que escribe cada rol ya sale de ahí.
- En «Para ti»: la agenda de hoy con la empresa de cada reunión y «Preparar» (Ventas, CS, Dev y dirección), y las
  cuentas del CSE con su siguiente paso de CS y sus tickets.
- El resumen antes de cada reunión (`/para-ti/reunion/[evento]`) y la búsqueda en las transcripciones partidas en turnos
  (`lib/busqueda`, job `indice-de-reuniones`). El latido mide «Preparar una reunión» aparte, para saber si se abre.

Falta: desplegar; que Google Admin autorice `calendar.events.owned` para planificar la semana en el calendario (hoy
«Planificar la semana» lleva al calendario de Tareas); lo de hoy en 5 cosas (hoy «Para hoy» muestra todo).

## Etapa 4d, cómo va (2026-10-16)

Construida el 2026-10-16 (las reglas, en DECISIONS «Después de cada reunión, un paso de dos minutos»): «Después de tus
reuniones» en «Para ti» (`lib/mi-dia/despues-server.ts`, `components/para-ti/DespuesDeTusReuniones.tsx`), con «Usar
todo» y el siguiente paso propuesto desde tus tareas de la reunión.

Falta: desplegar; el correo de seguimiento para las reuniones que no son de una exploración (hoy solo lo arman las
sesiones de la preventa y de la exploración del proyecto).

## Etapa 4e, cómo va (2026-10-16)

Paso 1 de 4 construido el 2026-10-16 (las reglas, en DECISIONS «El correo de la mañana, paso 1»): el correo se arma
(`lib/mi-dia/correo.ts`, puro) y se ve en «Para ti» › «Correo de la mañana» (`/para-ti/correo`). No se envía.

Falta: el paso 2 (mandárselo solo a Elías una semana), que necesita el permiso de Gmail en Google Admin o un proveedor
de correo; después los pasos 3 y 4.

## Etapa 5, cómo va (2026-10-16)

Construida el 2026-10-16 (las reglas, en DECISIONS «Notas de la cuenta»):
- La cuenta › Notas (`components/clients/NotasDeLaCuenta.tsx`, `/api/clients/[id]/notas`): anotar, la lista del equipo
  y las notas escritas directo en HubSpot. La tabla `NotaDeLaCuenta` (SQL `2026-10-16-notas-de-la-cuenta.sql`).
- La escritura en HubSpot (`lib/notas/escritura-server.ts`), con el reintento en el job `contactos-y-tickets`.
- «Notas del equipo» en la memoria interna de la cuenta.
- La nota para HubSpot sugerida después de una reunión, en la tarjeta de la reunión y en «Después de tus reuniones»
  (`/api/sessions/[id]/nota-para-hubspot`), y como tipo de «Uso de Nexus».

Falta: aplicar el SQL, desplegar y probar una nota real (que llegue a HubSpot asociada a la empresa, al negocio y al
proyecto). Después: que la nota deje hechos cuando se prenda `SEGUIMIENTO_HECHOS`, y sugerirla desde el chat (6b).
