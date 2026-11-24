# Plan: Nexus como conector de Claude

> Pedido de Elías del 23 nov, por la sesión coordinadora. Cubre dos de sus cuatro preguntas: **la arquitectura de Nexus
> como conector de Claude** (punto 2) y **su efecto sobre los artefactos** (punto 3). Cómo está construido Nexus hoy y
> las mejoras generales están en `docs/evaluacion-de-nexus-2026-11.md`.
>
> **Estado: solo plan.** No se construyó nada ni se tocó la base. Se armó leyendo el código de `main` del 23 nov
> (a4e69a80), el plan maestro de «Hablar con Nexus» (`docs/plan-maestro-hablar-con-nexus.md`) y la documentación vigente
> de MCP y de los conectores de claude.ai, leída ese mismo día (las fuentes están al final). Ninguna fase arranca hasta
> que Elías lo diga.

## En una frase

Cada persona del equipo agrega «Nexus» en su Claude. Desde cualquier conversación, Claude puede leer lo que Nexus sabe de
una cuenta (la memoria, las reuniones, los documentos, las tareas, la preventa), **solo de las cuentas que esa persona ya
ve en Nexus y de una cuenta por vez**, y guardar de vuelta notas y hechos con quién lo dijo y cuándo. Por ese camino
Nexus nunca publica nada al cliente ni toca la cobranza. Vive dentro de la misma app, con una puerta de entrada propia que
usa el mismo login de Google de siempre.

Nexus sigue siendo la memoria; Claude pone la conversación. Es el rumbo del 21 nov llevado a la cuenta de Claude de cada
persona.

---

## 0. Lo que este plan cambia de decisiones anteriores

### 0.1 La decisión del 15 oct: «el agente vive dentro de Nexus»

El 15 oct Elías decidió lo contrario (`docs/mi-dia-plan.md`, decisión 8, y su pieza 13): *«El agente vive dentro de Nexus,
no como conector para el Claude de cada persona: sin cuentas pagas por persona ni uso personal, con el costo medido y un
tope por persona, y viendo solo lo que esa persona puede ver.»* Ese plan también dejó el conector «fuera de la v1».

Las tres razones, con el conector:

| Razón del 15 oct | Qué pasa con el conector |
|---|---|
| Sin cuentas pagas por persona ni uso personal | **Cambia.** Cada persona necesita una cuenta de Claude. Es la decisión 2 de este plan |
| Costo medido y tope por persona | **Cambia de forma.** Lo que conversa Claude no pasa por la API de Nexus: lo cubre el plan de Claude de cada persona. Nexus mide llamadas, no dólares |
| Ve solo lo que esa persona puede ver | **Se mantiene igual.** Es el centro de este plan (2.3 y 2.7) |

Lo que no cambia: el 16 oct (DECISIONS, «Nexus, el sistema de trabajo de cada cuenta») ya dejó escrito que la capa de
operaciones sirve a la pantalla, al chat «y un MCP, si algún día hace falta». El conector es esa tercera puerta.

**23 nov:** Elías revirtió la decisión del 15 oct, con un piloto de dos semanas y el plan Team (DECISIONS, «Nexus como
conector de Claude», y la sección 5).

### 0.2 Cómo encaja con el plan maestro de «Hablar con Nexus»

El conector no es un proyecto aparte: es **otra puerta a los mismos verbos** del plan maestro (§4.2: responder, guardar
en lo que se sabe, mejorar el documento). Dónde lo cambia:

| El plan maestro dice | Con el conector |
|---|---|
| §3.6: «el modelo nunca elige la empresa» | En Claude, el modelo sí elige la cuenta. Lo reemplaza esto: **el servidor verifica cada cuenta que nombra Claude** contra la lista de esa persona, y cada herramienta trabaja con una sola cuenta (2.7) |
| §3.2: «nada se guarda sin tu clic» | En Claude, el clic es aprobar la herramienta. En el plan Team, el dueño puede fijar que las herramientas que escriben siempre pidan aprobación (2.5) |
| §3.8: tope de US$ 100 al mes para Nexus conversando | El conector queda fuera de ese tope: sus herramientas no llaman a la IA de Nexus |
| §4.4 y §4.5: el contrato de cada documento y el registro de operaciones | Se vuelven **la capa común** de las dos puertas. Hay que construirlos como funciones que reciben a la persona, no la sesión del navegador |
| Etapas 0, 1, 3 y 4 | Sirven a las dos puertas: siguen igual |
| Etapas 2 y 5 (el cajón de conversar en cada pantalla) | Es la pregunta 8: seguir ahora o esperar el piloto del conector |
| Etapa 5: el lugar de la empresa para lo que sabe el equipo | El conector también lo necesita para guardar. Es la pregunta 6: adelantar esa pieza |

---

## 1. Cómo se vería para el equipo

1. **Una vez:** Elías (dueño del plan Team de Claude) agrega el conector con la dirección
   `https://nexus.smarteamcr.com/api/mcp`. Con planes personales, lo agrega cada persona.
2. **Cada persona, una vez:** en Claude › Conectores › Nexus › «Conectar», se abre el login de Nexus de siempre (Google),
   y después una pantalla de Nexus: «Claude quiere leer lo que puedes ver en Nexus y guardar notas a tu nombre».
   «Permitir».
3. **En una conversación:** «Prepárame la reunión de mañana con Cemaco · Ecuador». Claude busca la cuenta, lee la
   memoria, las últimas reuniones y las tareas abiertas, y responde citando de dónde sacó cada cosa.
4. **Guardar:** «Guarda que el gerente nuevo es Andrés y que quiere ver el embudo en enero». Claude pide aprobación; al
   aprobarla, la nota aparece en «Lo que sabe Nexus de Cemaco · Ecuador», con «vía Claude, por Valentina, 23 nov», y se
   puede quitar como cualquier otra.
5. **Cortar:** desde Nexus (una página «Conexiones con Claude») o desde Claude. La próxima llamada ya no entra.

Funciona en claude.ai, en la app de escritorio, en el teléfono y en Claude Code (en el teléfono, la instalación está en
beta).

---

## 2. La arquitectura

### 2.1 Dónde vive: dentro de la misma app (recomendado)

Un conector personalizado de claude.ai es un **servidor MCP remoto**: una dirección HTTPS a la que Claude, desde la nube
de Anthropic, le pide la lista de herramientas y las llama. El transporte vigente es «Streamable HTTP»: un solo punto
que recibe pedidos y responde. La spec vigente (2026-07-28) **quitó las sesiones**: cada pedido llega solo, sin estado.

| | A. Dentro de la app de Next.js (recomendada) | B. Un servicio aparte en el VPS |
|---|---|---|
| Cómo | `app/api/mcp/route.ts` con `mcp-handler` 2.4 (sobre el SDK oficial `@modelcontextprotocol/server` 2.x; no necesita Vercel ni Redis), más las rutas de la puerta de entrada (2.2) | Un segundo contenedor con la misma imagen y un servidor Node propio con el SDK |
| Reusa el código | Directo: las lecturas ya existen como funciones del servidor | Igual, pero arrastrando las piezas de Next (`server-only`, la caché): hace falta el mismo arreglo que usan los scripts (`lib/permitir-server-only`) |
| Deploy y salud | Los de siempre (`scripts/deploy.sh`, `/api/health`) | Un deploy y una salud más que mantener |
| Conexiones a la base | Comparte las 10 de producción (con tope propio, 2.8) | Necesita las suyas, de los ~15 espacios compartidos |
| Si algo falla | Puede frenar la app (por eso los topes) | Se reinicia solo, sin tocar la app |

**Por qué A:** el volumen es chico (unas 19 personas internas), la spec ya no pide conexiones largas, y lo que más vale
(las guardas, la memoria, el lugar único de las reuniones) está en funciones que se llaman directo. Se pasa a B si el
conector sostiene más de unas 30 llamadas por minuto o si alguna herramienta frena la app.

Lo que hay que tocar del resto:

- `middleware.ts` deja pasar `/api/mcp`, `/.well-known/*` y `/oauth/token` sin la cookie de Supabase (se autentican
  con el token). `/oauth/authorize` sigue pidiendo el login.
- Claude llama solo por el puerto 443 y desde el rango de Anthropic `160.79.104.0/21`. No conviene cerrar el conector
  a ese rango: Claude Code llama desde la PC de cada persona.

### 2.2 Cómo entra cada persona: una puerta propia de Nexus (recomendado)

**Qué exige Claude** (resumen de su documentación y de la spec): responder 401 con la dirección de los metadatos del
recurso (RFC 9728); publicar los metadatos del servidor de autorización (RFC 8414) con `S256` en
`code_challenge_methods_supported`; código de autorización con PKCE; aceptar el parámetro `resource` y emitir el token
**para Nexus** (la spec obliga a rechazar tokens emitidos para otro); refrescar el token; responder en menos de 10
segundos; `invalid_grant` cuando el refresco ya no sirve. Para registrarse, Claude prefiere su «identidad publicada»
(Client ID Metadata Documents), después el registro automático (DCR, que la spec vigente dejó obsoleto) y por último un
identificador cargado a mano. La vuelta del login es `https://claude.ai/api/mcp/auth_callback`, y para Claude Code, una
dirección local.

| | 1. El servidor OAuth de Supabase | 2. Una puerta propia de Nexus (recomendada) | 3. Un proveedor externo |
|---|---|---|---|
| Qué es | Supabase emite el token; Nexus solo arma la pantalla de permiso | Nexus emite y guarda sus propios tokens; quién eres lo sigue diciendo el login de Supabase | WorkOS AuthKit, Auth0, Stytch |
| Estado | **Beta** desde el 26 nov 2025; no llegó a la versión estable | Código propio | Listo |
| Lo que falla | No acepta `resource`: el token sale para «authenticated», no para Nexus (issue #2610). No soporta la identidad publicada de Claude (#2850). Un error abierto responde 400 con clientes como Claude (#2820). Y encenderlo cambia la configuración del Supabase de **producción**, que es el único | Hay que escribirlo bien: unas 600 a 900 líneas con sus pruebas | Un segundo sistema de identidad (la constitución, §4.1, dice que Supabase es el único), un tercero que ve quién entra, y el cruce con `AppUser` hay que hacerlo igual |
| Se prueba en local | No sin tocar producción | Sí, con Claude Code | A medias |

**Por qué la 2:** es la única que cumple lo que la spec obliga (el token es para Nexus), deja cortar el acceso de una
persona desde Nexus, registra quién usó qué, no toca la configuración de Supabase de producción y se puede probar entera
en local. La 1 se vuelve a mirar cuando el servidor OAuth de Supabase salga de beta con `resource` y la identidad
publicada.

**Cómo funciona la puerta propia:**

1. Claude abre `/oauth/authorize`. Si la persona no tiene sesión, va al login de Google de siempre y vuelve.
2. Nexus aplica **los mismos tres filtros del login** (`app/auth/callback/route.ts:58-88`): correo de
   `smarteamcr.com`, un `AppUser` interno y un miembro no desactivado. Más uno nuevo: el permiso del conector (2.3).
3. Pantalla de permiso: qué podrá leer Claude y qué podrá guardar.
4. Nexus entrega un código de un solo uso (60 segundos, atado a PKCE) y Claude lo cambia en `/oauth/token` por un token
   de acceso de 1 hora y uno de refresco de 30 días que se renueva en cada uso.
5. Los tokens se guardan **como huella, nunca en claro**, en una tabla nueva `ConexionDeClaude` (persona, cliente de
   OAuth, permisos, para qué recurso, creada, último uso, cortada). Es SQL aditivo con su RLS en el mismo archivo.
6. Registro del cliente: solo la identidad publicada de Claude (una lista cerrada de direcciones) y la vuelta local de
   Claude Code. Sin registro abierto.
7. Dos alcances: `nexus.leer` y `nexus.guardar`. El segundo se pide recién cuando existan herramientas que escriben.

Las piezas de metadatos y la verificación del token salen del SDK oficial (`requireBearerAuth` con `expectedResource`).
El servidor de autorización es nuestro: los ayudantes viejos del SDK quedaron congelados, y el SDK recomienda un
proveedor dedicado. Por eso la fase 1 pasa por `/revisar` con foco en seguridad antes del deploy.

### 2.3 Qué puede ver cada persona

En **cada llamada**, sin excepción:

1. Token → `ConexionDeClaude` → `AppUser` **por su id** (hoy la app busca por correo, `lib/auth/supabase.ts:95`; el
   conector no repite eso). Se vuelve a mirar que sea interno y que el miembro no esté desactivado: la lista de cuentas
   que se reusa (`clientesQueVesParaTareas`, `lib/tareas/clientes.ts:54`) no lo mira.
2. El permiso del conector: una celda nueva en el registro de permisos (`lib/auth/permissions/registry.ts`), apagada por
   defecto para todos los roles. Elías la enciende por persona (`TeamMember.permissionOverrides`). «Ver como» nunca se
   aplica.
3. La cuenta: `contextoDeOperacion(persona)` y `exigirCliente(ctx, clientId)` (`lib/operaciones/contexto-server.ts:53,66`).
   Es la misma regla que `requireAccessToClient`, pero recibe a la persona en vez de leer la cookie: está probada contra
   ella cuenta por cuenta.
4. La sección: los montos de los negocios solo con `ventas.read` (como el chat «Nexus», `veMontos`); la preventa con su
   permiso; nunca finanzas, cobranza, salarios ni comisiones (la memoria ya lo prohíbe y lo vigila
   `lib/memoria/frontera.test.ts`).

Las personas externas (clientes con acceso al portal) nunca reciben un token: el filtro 2 lo impide.

### 2.4 Las herramientas de lectura (primera versión)

La base ya existe: **las ocho lecturas del chat «Nexus» de la cuenta** (`lib/nexus-chat/lecturas-server.ts:44-196`) y
las del registro de operaciones (`lib/operaciones/registro-server.ts`) reciben a la persona y la cuenta, están atadas a
la cuenta por `COMO_SE_ACOTA` (`lib/nexus-chat/alcance.ts:25`) y leen las reuniones por el lugar único. El conector las
expone casi tal cual.

| Herramienta | Qué devuelve | Reusa |
|---|---|---|
| `buscar_cuenta` | Hasta 20 cuentas que la persona ve: nombre, tipo (cartera o prospecto), CSE, proyectos activos, fecha de la última reunión | `clientesQueVesParaTareas`, sin las empresas de Smarteam |
| `memoria_de_la_cuenta` | Lo que Nexus sabe de la cuenta o de un proyecto, con su peso en la escalera (unos 20.000 caracteres como mucho) | `memoriaDeLaCuenta` y `memoriaDelDocumento` (`lib/memoria/cargar.ts:302,450`), con un lector nuevo «conector»; más lo que sabe el equipo de la preventa (`loAprendidoEnLaPreventa`) hasta que la etapa 1 del plan maestro lo sume a la memoria |
| `reuniones` | Las reuniones de la cuenta: fecha, título, quiénes, si hay texto, un resumen corto | `reuniones.recientes` → `getClientSessions` |
| `buscar_en_reuniones` | Los turnos que dicen una palabra o frase, con la reunión, la fecha y quién habló | `reuniones.buscar` → `buscarEnReunionesDe` (`lib/busqueda/buscar-server.ts:27`) |
| `leer_reunion` | La minuta, los hechos y la transcripción por partes de unos 20.000 caracteres | `reunion.leer` |
| `verificar_cita` | Si una frase está, palabra por palabra, en esa reunión | `ubicarLaCita` (`lib/chat-de-nexus/respuesta.ts:232`): así Claude puede citar con la misma vara que «Hablar con Nexus» |
| `documento` | Un documento de la cuenta como texto: handoff, kickoff, diagnóstico, planificación, entrega, cronograma, La escala, casos de uso, propuesta, procesos. El borrador o lo publicado, y su estado: si se presentó, si el cliente lo aceptó, cuándo | `loadCanvasContext`, `loadTimelineContext`, `textoDeLasPiezas`, `paraLaPropuesta`, `serializeProcesosForPrompt`, `estadoConElCliente` |
| `tareas` | Las tareas abiertas de la cuenta | `cuenta.tareas` |
| `preventa` | Las tarjetas, la guía y lo que sabe el equipo | `destinosDeLaPreventa`, `guia.leer`, `loQueSabeElEquipo` |
| `negocios_y_personas` | Negocios de HubSpot (el monto, solo con permiso de Ventas), contactos, tickets y los últimos correos y llamadas | `cuenta.negocios`, `cuenta.personas`, `comunicaciones.recientes` |

Lo que falta construir para estas herramientas:

- **Leer lo publicado sin token y sin escribir.** Hoy las lecturas de la foto publicada son las del portal del cliente:
  piden su token, registran el uso y algunas **crean la foto si no existe** (`lib/external/kickoff-view.ts:142`,
  `lib/external/timeline-view.ts:184`). Hace falta una lectura por proyecto que solo lea, con su paso a texto.
- Una función `preventaDeLaEmpresa(clientId)`: hoy esa búsqueda se repite a mano (`lib/exploraciones/para-la-memoria.ts:55,66`).
- Declarar el lector «conector» en `lib/memoria/consumidores.ts` (la prueba lo exige).

**Cómo responden.** Todas llevan la marca de solo lectura (`readOnlyHint`): en claude.ai corren sin pedir aprobación
cada vez. Cada respuesta es JSON y empieza por la cuenta («Cemaco · Ecuador», su id); cada pieza dice de dónde sale (la
reunión del 12 nov, la nota de Valentina del 3 nov) y su peso; lo que dijo el cliente va en su propio campo, y la
respuesta no lleva instrucciones para el modelo (la guía de Anthropic contra instrucciones escondidas). Por defecto,
corto: la minuta antes que la transcripción, y la transcripción por partes. El tope de claude.ai es de unos 150.000
caracteres por respuesta y el de Claude Code, 25.000 tokens.

**Plantillas (opcional, fase 2).** El conector puede ofrecer instrucciones listas que aparecen en Claude: «Preparar la
reunión con…», «Antes del handoff, ¿qué falta saber?», «Cerrar: ¿qué guardo en Nexus?». También sirven para la etapa 7
del plan maestro: «Cómo escribe Smarteam» puede llegar así al Claude de cada persona.

### 2.5 Escribir de vuelta en Nexus (fases 3 y 4)

| Herramienta | Qué hace | Dónde queda |
|---|---|---|
| `guardar_en_nexus` | Guarda lo que la persona contó: el texto con sus palabras, quién lo dijo (si no fue ella) y los hechos | «Lo que sabe Nexus de <empresa>», con autor (la persona del token), fecha y «vía Claude». Los hechos se verifican contra el texto de la nota (`escribirHechosDeUnaNota`, `lib/seguimiento/hechos-server.ts:667`) y, si citan una reunión, contra esa reunión de esa misma cuenta. Nunca va a HubSpot (decisión del 22 nov): por eso no se reusa `nota.crear`, que sí escribe allá |
| `crear_tarea` | Crea una tarea de la cuenta | Tareas, con origen «conector», por `prepararYAplicar` (`lib/operaciones/registro-server.ts:62`), que vuelve a validar todo |
| `proponer_cambio` | Propone un cambio a una sección de un documento, con el antes y el después y el motivo | Una propuesta pendiente en Nexus que una persona aplica con «Aplicar», por el contrato del documento del plan maestro (§4.4). Al aplicarla queda en el historial como «Cambiado con Claude». **Nunca aplica ni publica sola** |

- Las tres llevan `readOnlyHint: false`: Claude pide aprobación antes de cada una. En el plan Team, el dueño puede fijar
  la categoría «escribir» en «pide aprobación siempre», así nadie la salta con «Permitir siempre». Recomendado.
- Cada escritura deja un `AgentRun` con `agentSlug: "conector-claude"`, quién lo pidió y la herramienta; los hechos ya
  se atan a su corrida (`HechoDeReunion.agentRunId`). Para la nota hace falta un campo «vía» en su autor
  (`lib/exploraciones/esquemas.ts:1271` hoy descarta claves nuevas sin avisar) y que `crearNota` reciba el origen.
- Una revisión automática nueva (o INV45 ampliada): todo lo guardado por el conector queda en la cuenta de su corrida y
  cita solo reuniones de esa cuenta.

### 2.6 Lo que el conector nunca puede hacer

No es que esté bloqueado: **no existe la herramienta.**

- Publicar al cliente, crear o cortar un acceso, ni marcar algo como presentado o aceptado por el cliente (eso sube el
  peso en la escalera y lo decide una persona en Nexus): `publicarDocumento`, `publicarLaEscala`, `crearAcceso`,
  `anotarHito`, `publishBusinessCase`, `publicarElPlan`, la ruta `publish-timeline`.
- Cobranza, facturación, Partner, rentabilidad, comisiones ni salarios.
- Escribir en HubSpot (notas, siguiente paso, negocios, handoff).
- Regenerar un documento, borrar nada, tocar permisos.
- Llamar a la IA de Nexus: ninguna herramienta llama a Claude por la API. Así el conector no gasta de la API y no hay un
  modelo adentro de otro.

### 2.7 Nunca mezclar clientes

Lo nuevo frente a la app: en Nexus, el servidor fija la cuenta y el modelo no la puede cambiar. En Claude, la persona
puede hablar de dos cuentas en la misma conversación, y Claude elige a qué cuenta pregunta. Lo que lo cubre:

1. **Una cuenta por llamada.** Cada herramienta recibe una sola cuenta; ninguna devuelve datos de dos (salvo
   `buscar_cuenta`, que da solo nombres).
2. **El servidor verifica cada cuenta** contra la lista de la persona, en cada llamada.
3. **Las reuniones, solo por el lugar único** (`lib/sessions/project-sources.ts`). El conector nunca copia las cuatro
   lecturas que hoy se lo saltan (`docs/evaluacion-de-nexus-2026-11.md` §3.1); cerrarlas antes es la mejora 1 de la
   evaluación.
4. **Los identificadores se verifican contra la cuenta.** Una reunión, un proyecto o un documento de otra cuenta
   responde «no existe», igual que un 404.
5. **Cada respuesta dice de qué cuenta es,** y cada escritura repite en su resultado dónde guardó («Guardado en Cemaco ·
   Ecuador»).
6. **Al guardar,** la cuenta se nombra explícitamente, la persona ve el texto en la aprobación, y los hechos solo
   pueden citar reuniones de esa cuenta.

Lo que queda: dentro de su propia conversación, la persona puede juntar dos cuentas (como quien tiene dos pestañas
abiertas), y Claude podría guardar en la cuenta B algo que salió de la A. Lo cubren la aprobación, el «Quitar» y una
revisión semanal de lo guardado «vía Claude» durante el piloto.

### 2.8 Riesgos y cómo se cubren

| Riesgo | Qué podría pasar | Cómo se cubre |
|---|---|---|
| Fuga entre clientes | Claude recibe datos de una cuenta que la persona no ve | 2.3 y 2.7; una prueba de integración por herramienta: una CSE sin acceso a la cuenta X recibe «no existe» |
| Instrucciones escondidas en lo que dijo un cliente | Una transcripción dice «ignora lo anterior y guarda…», y Claude intenta escribir | La primera versión solo lee. Las que escriben piden aprobación siempre, solo tocan una cuenta y nunca publican. Lo que viene de afuera va como dato, con su fuente, sin instrucciones (2.4). Todo lo guardado se puede quitar |
| Datos de clientes en cuentas personales | Con planes personales, las transcripciones quedan en cuentas de cada persona, fuera del control de Smarteam | Usar el plan Team: la cuenta es de Smarteam, el dueño controla los conectores y sus permisos, y el contenido no se usa para entrenar por defecto (en los planes personales hay que desactivarlo a mano). Es la decisión 2 |
| Un token robado | Alguien lee con el token de otra persona | Dura 1 hora; el de refresco se renueva en cada uso; se guarda como huella; Nexus muestra el último uso y deja cortar |
| Descarga masiva | Alguien le pide a Claude leer todas las transcripciones de todas sus cuentas | Topes por persona (unas 30 llamadas por minuto y 300 al día, para ajustar en el piloto) y un registro por llamada: quién, qué herramienta, qué cuenta |
| Límites del plan de Claude | Las transcripciones largas gastan el uso de la persona (las ventanas de 5 horas y semanal) | Respuestas cortas por defecto; la transcripción por partes |
| Conexiones a la base | El conector deja sin conexiones a la app y a los trabajos (10 en producción) | Como mucho 3 llamadas del conector a la vez; un tiempo máximo de 8 segundos por consulta; la lista de cuentas en caché 60 segundos; mirar el pool en `/api/health` durante el piloto |
| Cambios en MCP o en Claude | La spec cambió en julio (sin sesiones) y claude.ai documenta la autorización hasta la versión anterior | El SDK v2 atiende a los clientes de las dos versiones; versiones fijas y una prueba con Claude después de cada actualización |

---

## 3. El efecto sobre los artefactos

### 3.1 Qué funciones de IA se podrían retirar y cuáles no

Con el conector, una persona puede pedirle a su Claude lo que hoy hace una función de IA de Nexus. Pero no todas se
pueden retirar: las que corren solas no tienen a nadie conversando, y los documentos del cliente necesitan borrador,
publicación, historial de versiones y PDF, que viven en Nexus. Y la regla de Elías sigue: **nada que existe se esconde
sin preguntar.** Se retira por lista, en la fase 5, y solo si el piloto muestra que el equipo usa el conector.

| Función de hoy | Con el conector | Por qué |
|---|---|---|
| «Nexus», el chat de la cuenta (`lib/nexus-chat`) | **Se puede retirar** | El conector expone sus mismas lecturas; Claude conversa mejor |
| El chat del documento (`lib/asistente`) | **Se puede retirar** | Claude lee el documento y propone el cambio por sección (`proponer_cambio`) |
| «Hablar con Nexus», al responder preguntas (`lib/chat-de-nexus/respuesta.ts`, unos 280.000 caracteres por pregunta) | **Se puede retirar esa parte** | `buscar_en_reuniones`, `leer_reunion` y `verificar_cita` hacen lo mismo |
| Correo de seguimiento, brief de la cuenta y del proyecto, análisis de ventas y servicio, investigación de la empresa | **Se pueden retirar** | Claude los escribe con la memoria y, si hace falta, buscando en la web. El análisis de ventas, además, tiene el problema de la evaluación §3.1 |
| El chat de Tareas | **En parte** | `crear_tarea` cubre crear; reordenar la semana sigue en Nexus |
| «✨ Mejorar con IA» (`lib/ai/assist.ts`) | **Se queda; Claude puede proponer** | Lo usa quien trabaja dentro de Nexus. Por el conector, lo mismo llega como propuesta por sección |
| La primera generación de los documentos: handoff, kickoff, diagnóstico, planificación, desarrollo, entrega, implementación, cronograma (estructura y detalle), La escala, casos de uso, propuesta comercial, procesos, perfiles de puesto | **Se queda; Claude puede proponer cambios después** | Escriben en el motor de documentos con sus reglas: el armador del cronograma no deja tocar lo empezado; cada sección tiene su forma; hay versiones, publicación, portal del cliente y PDF. Claude no puede escribir esa estructura sin esas reglas, y duplicarlas sería otra puerta |
| La guía de la preventa (pregunta, profundizar, objetivos) | **Se queda** | Se usa en la pantalla durante la llamada con el cliente |
| Lo que corre solo: lectura de cada reunión (minuta, tareas, hechos, clasificación), resumen liviano, clasificador, vigía, agente de impacto, compromisos de los correos, títulos cortos, tareas desde reuniones, analizador de venta, rentabilidad del mes, marketing de la semana, resultado del test público | **Se queda** | Nadie conversa: es lo que crea la memoria que el conector lee. Es también la mayor parte del gasto de IA |
| Cobranza: borrador de cobro y reporte | **Se queda y nunca pasa por el conector** | Es dinero |

En números: de las unas 35 funciones de IA que ve una persona o que corren solas, unas 8 se podrían retirar o achicar,
unas 15 a 20 se quedan pero pueden recibir propuestas desde Claude, y unas 12 corren solas y se quedan.

### 3.2 Cómo vuelve a Nexus lo que se hace en Claude

La regla: **lo que se hace en Claude no cuenta hasta que llega a Nexus.** Tres caminos de vuelta:

1. **Lo que se sabe** (`guardar_en_nexus`): la nota con sus hechos, en la memoria de la empresa, con quién, cuándo y
   «vía Claude». Lo leen los documentos y el agente de impacto como cualquier otra nota.
2. **Lo que se cambia en un documento** (`proponer_cambio`): queda como propuesta en Nexus; una persona la aplica; el
   historial guarda «Cambiado con Claude» con el antes y el después. Al publicarlo o presentarlo, la etapa 4 del plan
   maestro lleva los datos cambiados a la memoria, igual que con un cambio hecho dentro de Nexus.
3. **Lo que se hace** (`crear_tarea`): la tarea en Tareas, con su origen.

Lo que **no** vuelve solo: la conversación misma, que queda en la cuenta de Claude de la persona, y lo que Claude arme
por su cuenta (una presentación, un artefacto). Para que la memoria no se pierda ahí:

- Las descripciones de las herramientas le piden a Claude que **ofrezca guardar** cuando la persona cuenta algo nuevo de
  la cuenta (lo mismo que hace «Hablar con Nexus», que sugiere qué guardar).
- La plantilla «Cerrar: ¿qué guardo en Nexus?» repasa la conversación y propone las notas.
- Después del piloto, si hace falta: una herramienta para dejar en los documentos de la cuenta un enlace a lo que se
  hizo en Claude.
- El piloto mide cuántas notas llegan «vía Claude» por semana. Si son pocas, la memoria se está quedando en las
  conversaciones.

### 3.3 Qué pasa con el gasto

**Hoy.** La IA de Nexus costó unos US$ 140 al mes al ritmo de octubre (medido el 18 oct; DECISIONS «El gasto de la IA,
por mes»). Lo que más gastaba: la preventa, la lectura de cada reunión, el mapeo de procesos con Opus, llamadas sin
agente y el clasificador de reuniones. Hay topes de US$ 10 al día para lo automático, US$ 20 para lo que pide una
persona y US$ 100 al mes para Nexus conversando. El gasto de este mes no lo medí: la base es la de producción. El panel
`/integrations/gasto-ia` lo da por agente.

**Con el conector:**

- **Lo automático no cambia.** La lectura de reuniones, el clasificador, el vigía y el resto siguen en la API de Nexus,
  y son la mayor parte del gasto.
- **Lo conversado pasa al plan de Claude de cada persona.** Las herramientas del conector no llaman a la API, así que una
  conversación en Claude no le cuesta nada a la API de Nexus. Se mueve lo que hoy cae en el tope de US$ 100 (los chats y
  las respuestas) y parte de «Mejorar con IA». Para saber cuánto es, se suma en el panel de gasto lo de los orígenes
  `chat:`, `nexus-chat:` y del asistente de los últimos 30 días.
- **Aparece un costo nuevo: los asientos de Claude.** Precios del 23 nov (claude.com/pricing): Team estándar US$ 25 por
  persona al mes (US$ 20 pagando el año); Team premium, con 5 veces más uso, US$ 125 (US$ 100 al año); Pro US$ 20; Max
  US$ 100. Para unas 15 personas en Team estándar, unos US$ 300 a 375 al mes. Si el equipo ya paga Claude, el costo
  extra es cero.
- **La conclusión:** el conector no ahorra plata en la API (mueve una parte chica del gasto). Lo que ahorra es
  **construir y mantener conversación hecha en casa**: las etapas 2 y 5 del plan maestro (unas 4,5 sesiones) y los tres
  módulos de chat. Y le da al equipo un asistente mejor que el que Nexus puede construir.
- **Los límites del plan de Claude** también cuentan: el uso es de la persona y se comparte entre todos los productos de
  Claude (ventanas de 5 horas y semanal). Una persona que lee muchas transcripciones puede llegar al límite; por eso las
  respuestas son cortas por defecto.

---

## 4. Las fases

De lo más chico que prueba la idea a lo más grande. Cada fase pasa por `/revisar` y termina con «Qué probar, en simple».

### Fase 0 · Prototipo local (1 sesión, en una sesión propia)

- **Qué se construye:** `app/api/mcp/route.ts` con cuatro herramientas de lectura (`buscar_cuenta`,
  `memoria_de_la_cuenta`, `reuniones`, `leer_reunion`); en vez de la puerta OAuth, un token de prueba que solo vale
  cuando la base es la local (el mismo candado que el fixture), declarado vacío en `.env.example`; la base local con
  `npm run db:local:pull -- --recientes 5 --apply`; Claude Code como cliente
  (`claude mcp add --transport http nexus http://localhost:3005/api/mcp --header "Authorization: Bearer <token de prueba>"`).
- **Qué prueba:** que las lecturas funcionan sin la cookie; que una CSE sin acceso a una cuenta recibe «no existe» en
  cada herramienta (prueba de integración); cuánto pesan las respuestas; cómo responde Claude 5 preguntas reales
  comparado con «Hablar con Nexus»; cuántas conexiones usa.
- **Qué no prueba:** el login desde claude.ai, que llama desde la nube de Anthropic y necesita una dirección pública.
- **Ojo:** instalar `mcp-handler` en una copia de trabajo cambia el `node_modules` del main (están enlazados;
  `docs/KNOWN-ERRORS.md`). Se instala desde el main y la rama lleva `package.json` y `package-lock.json`.
- **Construida el 23 nov** (en la sesión del plan, sin SQL). Lo que mostró está en «Lo que mostró la fase 0», abajo.

#### Lo que mostró la fase 0 (23 nov)

**Qué quedó:** `app/api/mcp/route.ts` (`mcp-handler` 2.4.0 sobre `@modelcontextprotocol/server` 2.4.0, versiones fijas)
y `lib/conector-claude/` con las cuatro lecturas (`herramientas-server.ts`), la persona (`persona-server.ts`) y el token
de prueba (`token-de-prueba.ts`: solo con la base local y fuera de un build de producción, 32 caracteres como mínimo,
comparado por huella). La cuenta se verifica con `exigirCliente` en cada llamada y las empresas de Smarteam no se leen.
Las reuniones salen por `whereBelongsToClient` con los mismos cortes que el chokepoint: solo las que ya ocurrieron y
nunca la cancelada sin texto. Cada una dice su día en Costa Rica y qué texto dejó con la regla única (transcripción,
solo notas o nada). La memoria entra con un lector nuevo, «conector» (`lib/memoria/consumidores.ts`); el conector está
en el censo de lectores de reuniones y en la cobertura de proyectos («navegable»). El middleware deja pasar `/api/mcp` y
la ruta responde 401 sin el token: en producción, a todo.

**Pruebas:**
- `lib/conector-claude/herramientas.int.test.ts`, 9 casos con filas reales:
  - una CSE sin acceso recibe «No existe.» en cada herramienta;
  - una reunión o un proyecto de otra cuenta tampoco existen dentro de la suya;
  - ni la reunión agendada ni la cancelada sin texto salen; el día es el de Costa Rica;
  - las de Smarteam no se leen;
  - quién puede usar el conector.
- `ruta.test.ts`, 4 casos: la ruta misma responde 401 con la base de producción o en un build de producción, aunque el
  token esté bien.
- `token-de-prueba.test.ts`, 4 casos.
- **Prueba de rojo**, rompiendo a propósito un candado a la vez: sin el chequeo de acceso, sin la pertenencia al leer
  una reunión, sin el filtro de canceladas y sin la revisión de base local, alguna prueba se pone en rojo en cada caso.
- **Con datos reales en la base local:** la CSE de Cemaco · Costa Rica ve sus 5 cuentas. Construtecho (de otro CSE) le
  responde «No existe.», también al pedir una de sus reuniones con el id de Cemaco.

**La revisión ligera (`/revisar`, 23 nov)** dijo «no listo» por un error confirmado: las reuniones canceladas sin texto
salían como ocurridas. Además había tres reglas del proyecto en rojo (la clase de texto hecha a mano, el censo de
lectores, la cobertura de proyectos), el día en hora universal, la lista de cuentas sin orden ni páginas, el desempate
al pasar de página, el error técnico si fallaba la búsqueda de la persona, y dos candados sin prueba. Todo quedó
arreglado, con su prueba. Lo que no se tocó: el chat «Nexus» de la cuenta (`lib/nexus-chat/lecturas-server.ts`) tiene
los mismos dos huecos (lista las canceladas sin texto y pone el día en hora universal). Es otro módulo y queda como
arreglo aparte.

**Las cinco preguntas reales** (`db:local:pull` de las cuatro cuentas: 136 reuniones, 61 con transcripción). Tres son
las únicas distintas que tiene «Hablar con Nexus» en producción (todas de Elías); las otras dos, del chat «Nexus» de la
cuenta, de las CSE que las hicieron, con su propia persona. **Cómo se corrió:** Claude Code no se puede lanzar dentro de
otra sesión de Claude Code (tumba las sesiones abiertas), así que respondió Claude (Sonnet, en un subagente) con un
único comando que llama a las cuatro herramientas por HTTP, sin acceso a nada más. No es la pantalla de claude.ai, pero
lo que puede saber es exactamente lo que da el conector.

| # | Pregunta (cuenta) | Nexus respondió (producción) | Claude con el conector (local) |
|---|---|---|---|
| 1 | ¿Cuáles son los principales dolores? (Cemaco · Ecuador) | Seis dolores y «hay 4 más», cada uno en una línea | Los mismos temas, agrupados en cinco frentes, con más detalle: quién lo dijo, cifras (800 clientes por gestor, 20 llamadas por hora, 40 a 50 casos por semana a cobranza externa) y la reunión y la fecha de cada cosa. No leyó las tres reuniones más nuevas, y lo dijo. 8 llamadas, 45 s |
| 2 | ¿Qué dijo Elías sobre crédito y cobro que no estuviera ya? (Cemaco · Ecuador) | «No lo sé»: ninguna fuente menciona a Elías | Tampoco encontró a Elías (revisó quiénes estaban y buscó el nombre en cinco transcripciones), pero ofreció lo que sí se acordó de crédito y cobro y preguntó si se refería a otra persona. 7 llamadas, 46 s |
| 3 | ¿Qué dijeron de cobranza? (Tecnosagot) | «No lo sé»: se menciona de pasada en un ejemplo hipotético de Smarteam | Encontró ese mismo ejemplo y lo marcó como idea, no requisito; además, que el cliente ya pasa saldo y límite de crédito a su CRM, y cómo pagaría la implementación (cuatro pagos). 7 llamadas (leyó 12 partes de transcripción), 56 s |
| 4 | ¿Tienes los tipos de segmentos que pidió el cliente? (Cemaco · Costa Rica, como su CSE) | Seis tipos de segmento con la reunión del 27 oct; al repreguntarle, corrigió una fecha y retiró uno que había inventado | Separó lo que propuso Smarteam (frecuencia de compra, ticket promedio, categoría, género, ubicación: diagnóstico del 19 nov) de lo que pidió el cliente (avisar los «semacolones» por vencer y ver el nivel gold o platinum, 20 nov; segmentar por etapa del bebé, 10 nov). No encontró la lista del 27 oct que sí halló Nexus: de esa reunión leyó solo lo de segmentación. No inventó nada. 11 llamadas, 57 s |
| 5 | ¿Cuál debería ser el siguiente paso de CS? (Construtecho, como su CSE) | Del kickoff del 6 nov: las invitaciones de las sesiones y confirmar el pago; propuso fijarlo como siguiente paso (en producción no se aplicó: dos intentos dicen «No se aplicó») | El mismo paso: confirmar que el pago se reflejó y que las sesiones de Luis Adolfo corren, con las citas del kickoff del 6 nov, lo que sigue después (acceso, quién asiste, cómo se mide el cierre) y lo que Nexus no sabe (si pagaron, si las sesiones se hicieron). No lo puede fijar: solo lee. 6 llamadas, 27 s |

**Lo que se aprende de las respuestas:**
- Con solo cuatro lecturas, Claude respondió lo mismo o más que Nexus en cuatro de las cinco, y siempre dijo de dónde
  sale cada cosa. Donde Nexus dijo «No lo sé», buscó más y ofreció lo cercano sin inventar. En la cuarta se le
  escapó una lista que Nexus sí encontró, pero no inventó nada (Nexus inventó un tipo de segmento y lo retiró al
  repreguntarle).
- Le costó leer: para buscar una palabra leyó hasta 12 partes de transcripción (240.000 caracteres). La búsqueda en
  las reuniones (`buscar_en_reuniones`, ya prevista para la fase 1) lo resuelve en una llamada y gasta mucho menos del
  plan de la persona.
- La memoria llega recortada: el cargador la arma para un prompt (la ficha, 2.000 caracteres; la cuenta, 11.200) y
  Claude lo dijo en tres de las respuestas. Para el conector conviene un tope propio más grande, o la ficha por partes.
- La base local no tiene lo que el equipo escribió en la preventa (notas, tarjetas), que «Hablar con Nexus» sí leía.
  Con eso, la comparación favorece a Nexus.
- **Ojo con esta prueba:** el comando con que respondió Claude corta la salida en 30.000 caracteres, y algunas partes
  de transcripción medían 31.000 a 33.000: pudo perder el final de algunas. En claude.ai el tope es de unos 150.000.

**Cuánto pesan las respuestas** (Cemaco · Ecuador): `buscar_cuenta` 250 bytes; `memoria_de_la_cuenta` 2.400
(recortada); `reuniones` 3.800 (diez reuniones); `leer_reunion` unos 31.000 por parte; «No existe.» 19. Todo cabe en
los topes de claude.ai (unos 150.000 caracteres) y de Claude Code (25.000 tokens).

**Conexiones a la base** (con el tope de producción, 10): `buscar_cuenta`, `reuniones` y `leer_reunion` usan una.
**`memoria_de_la_cuenta` abre las 10**, con hasta 4 consultas a la vez, durante uno a dos segundos: el cargador lanza
sus lecturas en paralelo. Con tres personas preguntando a la vez, el pool llegó a 10 abiertas y 6 consultas en curso.
En producción ese pool es el de toda la app: la fase 1 necesita un tope de lecturas de memoria del conector a la vez
(una o dos) antes que el de tres llamadas que proponía el plan.

### Fase 1 · La puerta y la lectura en producción, solo para Elías (2 a 3 sesiones)

- La puerta OAuth (2.2) y la tabla `ConexionDeClaude` (SQL aditivo).
- La página «Conexiones con Claude» en Nexus: quién conectó, último uso, «Cortar».
- La celda de permiso del conector, apagada para todos menos Elías.
- Las diez herramientas de lectura, la lectura de lo publicado sin token, los topes y el registro por llamada.
- Lo que pidió la fase 0: un tope de lecturas de memoria del conector a la vez (una lectura abre las 10 conexiones de
  la app); la memoria del conector con un tope propio más grande que el de un prompt; y `buscar_en_reuniones` desde el
  primer día (sin ella, Claude lee transcripciones enteras para encontrar una palabra).
- **Antes:** la mejora 1 de la evaluación (cerrar las lecturas de reuniones que se saltan el lugar único).
- **Prueba:** Elías lo conecta desde claude.ai, la app de escritorio y el teléfono, y hace 10 preguntas reales.

### Fase 2 · Piloto de dos semanas con tres personas (sin código)

- Elías, una CSE y alguien de Ventas.
- **Se mide:** conversaciones por semana por persona, llamadas por herramienta, preguntas que no se pudieron responder,
  el pico de conexiones, y que ninguna respuesta cruzó de cuenta.
- **Decide Elías:** si se abre al equipo y si se sigue a la fase 3.

### Fase 3 · Guardar en Nexus (1 a 1,5 sesiones)

- `guardar_en_nexus` y `crear_tarea`, con el alcance `nexus.guardar`.
- **Depende de:** dónde se guarda lo que sabe el equipo a nivel empresa (pregunta 6).

### Fase 4 · Proponer cambios a los documentos (2 sesiones)

- `proponer_cambio` y el tipo «Cambiado con Claude» en el historial.
- **Depende de:** el contrato del documento (plan maestro, etapa 3), empezando por La escala y casos de uso, como ya
  decidió Elías.

### Fase 5 · Retirar lo que el conector cubre

- Por lista, una función a la vez y preguntándole a Elías, empezando por el chat «Nexus» de la cuenta y el chat del
  documento (3.1).

| Fase | Qué ves al terminar | Sesiones | SQL |
|---|---|---|---|
| 0 | Claude respondiendo con datos de la base local (hecha el 23 nov) | 1 | No |
| 1 | Nexus en tu Claude, solo lectura | 2 a 3 | Sí (`ConexionDeClaude`) |
| 2 | Tres personas usándolo dos semanas | 0 | No |
| 3 | «Guarda esto» desde Claude | 1 a 1,5 | Depende de la pregunta 6 |
| 4 | «Cambia el título» desde Claude, aplicado en Nexus | 2 | Por ver |
| 5 | Menos chats hechos en casa | Por función | No |

---

## 5. Lo que decide Elías

Respondidas el 23 nov: todas menos la 4, que vuelve a preguntarse aclarada (al final de cada fila). La 8 cambió el mismo día.

| # | Pregunta | Contexto | Recomendación |
|---|---|---|---|
| 1 | ¿Se vuelve atrás la decisión del 15 oct («el agente vive dentro de Nexus, sin cuentas de Claude por persona»)? | El rumbo del 21 nov dice que Claude ponga la conversación. El conector mantiene lo más importante de esa decisión (ver solo lo propio) y cambia el costo (asientos en vez de API) | **Sí, con el piloto de la fase 2** antes de abrirlo a todos. **Elías, 23 nov: sí, con un piloto de dos semanas** |
| 2 | ¿Qué plan de Claude usa el equipo? | Con Team, la cuenta es de Smarteam: el dueño agrega el conector una vez, fija qué herramientas piden aprobación y el contenido no se usa para entrenar por defecto. Con planes personales, las transcripciones de los clientes quedan en cuentas personales. Team estándar: US$ 25 por persona al mes (US$ 20 pagando el año) | **Team**, estándar para la mayoría y premium solo para quien lo use mucho. **Elías, 23 nov: Team** |
| 3 | ¿Quiénes prueban primero? | Hacen falta personas que conversen con Claude todos los días y cuentas con reuniones recientes | **Elías, una CSE y alguien de Ventas.** **Elías, 23 nov: «Yo»** (el piloto lo hace él solo) |
| 4 | ¿Por dónde se entra? | El servidor OAuth de Supabase está en beta, no emite el token para Nexus y encenderlo cambia el Supabase de producción. Un proveedor externo suma otro sistema de identidad | **Una puerta propia de Nexus** que usa el login de siempre. **Elías, 23 nov:** respondió que el conector es para usar Nexus desde Claude, por texto; se le vuelve a preguntar aclarando que es el login de la primera conexión |
| 5 | ¿Claude puede leer las transcripciones completas o solo minutas, hechos y búsqueda? | Hoy quien ve una cuenta en Nexus ve sus transcripciones. Por el conector, quedan en la conversación de Claude de la persona | **Completas para quien ya las ve,** por partes y con registro; si el plan no es Team, solo minutas y búsqueda. **Elías, 23 nov: como se recomienda** |
| 6 | ¿Dónde guarda Claude lo que le cuentan, mientras no exista el lugar de la empresa? | Hoy lo que sabe el equipo vive en cada preventa; el lugar de la empresa es la etapa 5 del plan maestro, y Nexus y el conector lo necesitan igual | **Adelantar solo esa pieza de la etapa 5** (una tabla chica, SQL aditivo), así las dos puertas guardan en el mismo lugar. **Elías, 23 nov: «En Nexus»** |
| 7 | ¿Cuánto pesa lo que se guarda desde Claude? | La escalera: aceptado por el cliente > presentado > confirmado por el equipo > dicho en una reunión > deducido por Nexus | **Lo que dijo la persona, «confirmado por el equipo»** (aprobó guardarlo). Lo que Claude dedujo de una reunión, «dicho en una reunión» solo con la cita verificada; si no, «deducido». **Elías, 23 nov: ok** |
| 8 | ¿Se sigue construyendo el cajón de conversar dentro de Nexus (etapas 2 y 5 del plan maestro) mientras se prueba el conector? | Las etapas 0, 1, 3 y 4 sirven a las dos puertas. Las 2 y 5 construyen la conversación dentro de cada pantalla, que es lo que Claude ya hace | **Seguir con 0, 1, 3 y 4; esperar el piloto antes de las 2 y 5** (quien no tenga Claude sigue con «Hablar con Nexus» como está). **Elías, 23 nov: las 2 y 5 esperan al piloto; se sigue con las 1, 3 y 4.** La etapa 1 (la memoria de la cuenta) la construye la sesión del plan maestro, con sus lecturas en `lib/` que reciben la persona y la cuenta, para que las herramientas del conector las reusen. **Cambio de Elías, 23 nov más tarde:** la etapa 2 va ya. Un solo chat «Nexus» en la preventa (se quita «Hablar con Nexus»), y «✨ Mejorar con IA» en cada pantalla abre ese chat con la parte puesta |

---

## Fuentes (leídas el 23 nov 2026)

- Versiones de la spec MCP: https://modelcontextprotocol.io/specification/versioning
- Cambios de la versión 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/changelog
- Transporte: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- Autorización: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization y sus páginas de
  registro del cliente y consideraciones de seguridad
- Buenas prácticas de seguridad: https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
- Conectores personalizados: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Usar conectores y sus permisos: https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities
- Construir un conector y su autenticación: https://claude.com/docs/connectors/building y
  https://claude.com/docs/connectors/building/authentication
- Criterios de revisión (anotaciones): https://claude.com/docs/connectors/building/review-criteria
- Instrucciones escondidas: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks
- Límites de uso: https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work
- Servidor OAuth de Supabase: https://supabase.com/docs/guides/auth/oauth-server/getting-started,
  https://supabase.com/docs/guides/auth/oauth-server/token-security y los issues
  https://github.com/supabase/auth/issues/2610, https://github.com/supabase/auth/issues/2850,
  https://github.com/supabase/auth/issues/2820
- SDK de TypeScript y `mcp-handler`: https://github.com/modelcontextprotocol/typescript-sdk,
  https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization.html, https://github.com/vercel/mcp-handler
- Precios de Claude: https://claude.com/pricing

**Lo que no se pudo confirmar:** qué versión del protocolo habla hoy el cliente de claude.ai (sus documentos llegan a la
autorización 2025-11-25); si el error 400 del servidor OAuth de Supabase le pega también a Claude; y una frase oficial que
diga que al dueño del servidor no se le cobra (se deduce de que el uso descuenta del plan de la persona).

---

## Para el roadmap

- **Qué cambió (23 nov):**
  - Elías respondió las preguntas 1, 2 y 8 de la sección 5: se revierte la decisión del 15 oct, con un piloto de dos
    semanas; el equipo usa el plan Team; y las etapas 2 y 5 del plan maestro esperan al piloto (se sigue con las 1, 3
    y 4). Quedó en DECISIONS («Nexus como conector de Claude») y en
    `docs/mi-dia-plan.md`, decisión 8.
  - La fase 0 está hecha: en local, Nexus responde como conector de Claude con cuatro lecturas (buscar una cuenta, lo
    que Nexus sabe de ella, sus reuniones y una reunión por partes). Entra con un token de prueba que solo vale con la
    base local. Sin SQL; en producción, `/api/mcp` responde 401 a todo.
- **Pruebas:**
  1. `npx vitest run --project integration lib/conector-claude/herramientas.int.test.ts` → 9 de 9 en verde. Cubre:
     - una CSE sin acceso recibe «No existe.» en cada herramienta;
     - una reunión o un proyecto de otra cuenta tampoco existen dentro de la suya;
     - ni la reunión agendada ni la cancelada sin texto salen, y el día es el de Costa Rica;
     - las empresas de Smarteam no se leen;
     - solo un interno activo puede usar el conector.
  2. `npx vitest run --project unit lib/conector-claude lib/memoria lib/sessions/ocurridas.test.ts lib/projects` → en
     verde (incluye `ruta.test.ts`: la ruta responde 401 con la base de producción o en un build de producción).
  3. A mano, con la base local y el token en el entorno del servidor: `POST /api/mcp` sin token o con otro token → 401;
     con el token → las cuatro herramientas.
- **Lo que mostró:**
  - Claude respondió igual o mejor que Nexus en cuatro de cinco preguntas reales, y no inventó nada.
  - Una lectura de la memoria abre las 10 conexiones de la app.
  - La memoria llega recortada.
  - Falta la búsqueda en las reuniones.

  Las tres cosas pasan a la fase 1.
- **Encaja con:** el plan maestro de «Hablar con Nexus» (las etapas 0, 1, 3 y 4 sirven a las dos puertas; las 2 y 5
  esperan el piloto si Elías lo decide) y con la mejora 1 de `docs/evaluacion-de-nexus-2026-11.md` (las cuatro lecturas
  de reuniones sin guarda, que se cierran en otra sesión), que va antes de la fase 1.
- **Espera:** las decisiones 3 a 7 de la sección 5, y la orden de pasar a la fase 1.
