# Roadmap — Los cuatro contextos

> Plan aprobado: `~/.claude/plans/deep-spinning-lagoon.md`. Diagnóstico del 2026-08-15.
> **Este archivo se mantiene al día en cada tanda** — es el resumen para Elías, en castellano de
> negocio. El detalle técnico vive en los mensajes de commit y en `docs/DECISIONS.md`.
>
> Última actualización: **2026-08-19**, punta `3638d13`. **Todo pusheado y deployado**, incluido
> lo de las otras tandas (medidor de IA, incidente REMPRO, retiro de etapas, atribución por
> título y el espejo de ventas ganadas).

---

## De qué se trata

Reorganizar lo que Nexus entiende de un cliente y de un proyecto en **cuatro ejes**: qué se vendió,
cómo va hoy, qué se habló con el cliente, y qué se habló puertas adentro.

El diagnóstico concluyó que **no hacía falta una arquitectura nueva**: tres de los cuatro ejes ya
existían como dato y se tiraban en el último metro. Lo que sí apareció fue peor y reordenó todo:

| Medición sobre producción (15-ago) | |
|---|---|
| Reuniones de los últimos 3 meses sin transcripción | **52,7 %** — y el 84 % nunca se grabó |
| Proyectos activos con la foto del plan congelada | **14 de 132** → en 9 de cada 10 no se puede medir si el trabajo creció |
| Desviaciones convertidas en tarea | **0 de 28** |

El patrón: **cada circuito se rompe en el último paso, no en el primero.**

---

## Estado por fase

| Bloque | Fase | Qué hace, en criollo | Estado |
|---|---|---|---|
| **I — Que no falte información** | 1 · Pantalla de sesiones | Reuniones que antes eran invisibles (internas, sin transcripción, agendadas a futuro) ahora se ven y se pueden asignar a un cliente. Avisa cuánto falta grabar y transcribir. | ✅ Hecho |
| | 2 · Cable a los documentos | El estado de HubSpot (bloqueado, prioridad, motivo del atraso) llega a los documentos que arma la IA. Antes lo veían solo dos pantallas internas. | ✅ Hecho |
| | 3 · Etiquetar conversaciones | Cada reunión queda marcada como «con el cliente» o «puertas adentro», para que los documentos entiendan quién dijo qué. | ✅ Hecho |
| **II — Que el estado se vea y se corrija** | 4 · Estado y Etapa hacia HubSpot | Nexus propone el estado real de un proyecto (atrasado, bloqueado, en espera) y su etapa; el CSE confirma y se escribe en HubSpot de un clic. | ✅ Hecho *(la base determinística)* |
| | 5 · Resumen del proyecto | Cada proyecto tiene un resumen automático de «cómo va», con cada afirmación citando de dónde salió. Sin fuente, la afirmación se descarta. | ✅ Hecho |
| **III — Medir si el trabajo creció** | 6 · Aprobar el cronograma | Se puede sellar el plan prometido al cliente, y desde ahí el sistema detecta el trabajo que se agregó después y no estaba prometido. | ✅ Hecho *(falta aplicarlo a los proyectos viejos — fase 12)* |
| | 7 · Desviaciones abierto/cerrado | Que un problema detectado en el cronograma se pueda dar por resuelto y deje de pedir trabajo. | ✅ Hecho |
| | 8 · Reuniones → tareas | Que lo que se acuerda en una reunión se convierta en tareas del cronograma, pasando por revisión humana. | ⛔ **Frenada** — necesita una decisión tuya (ver abajo). ✅ Su tramo independiente (8.1) ya está hecho |
| | 9 · Lo que se habló pero no se vendió | Detectar en las reuniones lo que el cliente pidió y no está en el contrato: protege el alcance y marca oportunidades de venta. | ✅ Hecho — ⚠ la sección sale vacía hasta re-sembrar el prompt post-deploy |
| | 10 · Qué logramos antes | Que el cierre de un proyecto alimente el handoff del siguiente proyecto del mismo cliente. | ✅ Hecho — el próximo handoff del cliente ya cita la Entrega anterior |
| **Extra** | Auditoría del rango | Revisión adversarial de todo lo construido, buscando lo que los tests y el build no ven. Encontró y arregló 8 fallas reales. | ✅ Hecho |
| | ⛔ La fuga del handoff | Dos caminos podían mandarle al cliente el handoff entero —que es un documento interno con riesgos y acuerdos comerciales—. Era el prerrequisito de la fase 9 y se tapó aparte, porque vale aunque esa fase no se haga. | ✅ Hecho |
| | 11 · **Validar en pantalla** | Abrir Nexus y probar a mano, sobre un proyecto real, las cuatro cosas que ningún test puede responder: (1) ¿el resumen automático del proyecto dice algo que no sabías? (2) ¿la sugerencia de estado le pega, y al aceptarla cambia de verdad en HubSpot? (3) ¿un CSE que no es admin ve solo lo suyo? (4) ¿aprobar el cronograma congela el plan, de modo que una tarea agregada después salga marcada como trabajo agregado? | 🔜 **Ya deployado — lo siguiente es que Elías lo pruebe** |
| | 12 · Aplicarlo retroactivamente | **La «foto del plan» es el cronograma tal como se le prometió al cliente**: sin ella no hay contra qué comparar, así que no se puede decir cuánto creció el trabajo respecto de lo vendido. Hoy 118 proyectos nunca la tuvieron. La fase les toma la foto AHORA, con el aviso escrito adentro del documento de que es de hoy y no del arranque. | ⏳ Después de la 11 |
| | 1.7 · Minuta de reunión interna | Un botón que destile la minuta de una reunión puntual de puertas adentro. | ⏳ Diferido |

---

## El asistente que conversa — el roadmap del chat

Diseñado con Elías el 2026-08-19 sobre el mapa real del código. El plan completo, con las decisiones
y el porqué de cada una, está en `~/.claude/plans/deep-spinning-lagoon.md` (arriba de todo).

**La idea en una línea:** hoy le pedís un cambio a la IA y se genera; si no era lo que querías, te
enterás después. El chat lo conversa antes — y sabe qué se puede y qué cuesta cada cosa.

| # | Etapa | Qué resuelve | Estado |
|---|---|---|---|
| 1 | **Un solo molde** | Cuatro documentos más pasan a poder modificarse con IA (Diagnóstico, Planificación, Implementación, Entrega) | ✅ Hecho · probado en pantalla |
| 2 | **El chat del cronograma** | Habla, propone, consensúa, aplica | ✅ En uso · **18 operaciones** (2026-08-21) |
| 3 | **El chat de documentos** | Conversa, acuerda y aplica sobre los 6 documentos | ✅ 2026-08-21 |
| 4 | **El chat de procesos** | *«conectá el nodo Desarrollo con el de CRM»* | ⚠ Antes: decisión de alcance |
| 3.5 | **El chat sobre la Propuesta comercial** | Hoy la propuesta (incluida la de sitio web) ya se modifica con IA por el mismo motor, pero sin conversarlo antes. Falta montarle el panel | ⬜ |
| 3.6 | **Exploración entra al assist** | Arreglar el borrado silencioso de las marcas «ya la pregunté» — y de paso arregla el que YA ocurre al regenerar | ⬜ |
| 3.7 | **El handoff se puede conversar** | El único con otro motor: hay que decidir si se le tipan las secciones o si lleva un assist de texto libre | ⬜ ⚠ decisión de diseño |
| 5 | **Agregar secciones** | *«creame una tabla comparativa»* — de los tipos que ya existen. Hoy el motor solo MODIFICA lo que ya está | ⬜ |
| 6 | **Que sepa responder** | El chat busca el dato puntual cuando la pregunta lo exige | ⬜ |
| 7 | **¿Alcanza un modelo más barato?** | ⚠ La medición del 2026-08-19 lo dio vuelta: ver abajo | 🟡 La premisa cambió |

### ⭐ Qué motor tiene cada documento, y dónde hay chat *(2026-08-21)*

Pregunta de Elías: *«los canvas de sitio web… no entiendo por qué solo se generaron algunos y no
el de exploración ni el de handoff ni el de propuestas, y en realidad deberían estar hechos con el
mismo motor por debajo»*.

⚠ **Primero, una precisión de vocabulario que cambia la respuesta**: «sitio web» es un **tipo de
Propuesta comercial** (`website_v1`, 8 secciones — `lib/business-cases/case-types.ts:82`), no un
canvas de proyecto. El pipeline «Sitios web» es otra cosa.

**Y la respuesta corta: el motor YA es el mismo en 7 de los 9.** `runDocumentAssist`
(`lib/ai/assist.ts`) es el único núcleo, y la Propuesta comercial lo usa igual que el kickoff.

| Documento | Motor | ¿«Pedir cambio con IA»? | ¿Chat? |
|---|---|---|---|
| Kickoff · Diagnóstico · Planificación · Implementación · Entrega · Requerimientos técnicos | `runDocumentAssist` | ✅ | ✅ |
| **Propuesta comercial** (incluida la de sitio web) | `runDocumentAssist` — **el mismo**, por otra ruta: su documento cuelga del Business Case y no de un proyecto | ✅ | ⬜ **falta montar el panel** |
| Cronograma | El suyo (`/timeline/assist`) — vocabulario de operaciones, no secciones | ✅ | ✅ |
| **Exploración** | El mismo almacenamiento y el mismo editor que los demás | ⛔ **bloqueada** | ⛔ |
| **Handoff** | ⚠ **El único que de verdad es otro**: sus secciones no tienen esquema — el contenido es texto libre en N bloques markdown, no una ficha con campos | ⬜ | ⬜ |

**Por qué Exploración está bloqueada, y es un bug de una función de 12 líneas.** Al aplicar una
propuesta solo sobreviven los campos del PRIMER nivel (`preserveNonSchemaKeys`,
`lib/ai/section-schema.ts:50`); las marcas «ya la pregunté» viven anidadas dentro del plan de
sesiones. ⚠ Y el borrado **ya pasa hoy al regenerar** — con aviso en pantalla. Lo que el assist
agregaría es que pase **sin** aviso.

**Por qué Handoff es el caso caro.** Los otros ocho declaran cada sección con su esquema de campos,
y de ahí sale el contrato que se le da a la IA. El handoff no tiene ninguno: sus 11 secciones son
`{key, label}` y su contenido es prosa. Sin esquema no hay contrato — habría que tipar las
secciones, o darle un assist de texto libre, que es otro diseño.

**Lo que el motor NO puede hacer en ningún documento: crear una sección nueva.** Modifica las que
ya existen —de los 20 tipos registrados: fichas, tablas de inversión, texto, diagramas— pero el
contrato se arma iterando lo que ya está en la base. Eso es la etapa 5.

### Etapa 2, tramo por tramo

| | Tramo | Qué deja andando | Estado |
|---|---|---|---|
| 2a | **El hilo persiste** | La conversación sobrevive a cambiar de pestaña | ✅ **Verificado contra producción** (`scripts/probar-asistente.ts`) |
| 2b | **El chat responde** | El turno, con el contexto chico | ✅ Probado contra el modelo (`--conversar`) |
| 2c | **El panel** | El cajón que convive con el documento, sin bloquearlo | ✅ No modal, por portal, z-45 |
| 2d | **Propone y aplica** | La instrucción acordada va al modificador de siempre | ✅ En el cronograma. En documentos: copiar y pegar (etapa 3) |
| 2e | **El vocabulario completo** | De 10 a 18 operaciones, y el chat VE las tareas | ✅ 2026-08-21 · auditado y probado contra el modelo |
| 2f | **No se olvida de lo acordado** | Contestar una pregunta dejó de costar la otra mitad del pedido | ✅ 2026-08-21 · ver abajo |

### ⭐ Etapa 2e — «que se puedan hacer muchas cosas» *(2026-08-21, 5 commits)*

Pedido de Elías después de la primera semana de uso real. Leídos **los 16 turnos que escribió de
verdad**, de **9 pedidos distintos el chat solo podía ejecutar 3**:

| Lo que pidió | Antes | Ahora |
|---|---|---|
| «dejala en 4 semanas» · «pasa a 2 y redistribuye» | ✅ | ✅ |
| «hay semanas sin tareas, **quítalas**» | 🟡 aproximaba acortando | ✅ `fase.quitar-semana` |
| «pasa **al final** lo de sesión de cierre» | ❌ | ✅ |
| «**agrega tareas** de HubSpot Academy en la 3ra semana» | ❌ | ✅ `tarea.crear` |
| «**borra** la última base que tiene un nombre raro» | ❌ | ✅ (o dice por qué no puede) |
| «**unifica** dos fases» | ❌ | 🟡 ofrece el equivalente y avisa la consecuencia |
| «las **atrasadas** a la 3ra semana» | ❌ | ✅ una operación por tarea, nombrada |

⭐ **La causa no era que faltara vocabulario.** Tres operaciones de tarea estaban escritas y
testeadas, e **inalcanzables**: el contexto no mandaba ni un id, el enum de la tool tenía 7 de 10, y
el traductor de la cajita azul corría contra tareas *fabricadas*. Ahora la guarda del enum compara
**en los dos sentidos**, así que una operación construida que nadie puede pedir sale en rojo.

**Lo medido, que decidió el diseño:**

- **314 semanas vacías** en 29 de los 46 cronogramas activos → quitar una semana del medio no era
  un capricho: era el pedido más común, y el ejemplo que el propio prompt usaba como «imposible».
- **453 tareas atrasadas** en 22 de 46 → el pedido de las atrasadas toca la mitad de la cartera.
- **0 colisiones** nombrando tareas por los últimos 5 caracteres del id, contra **1.063** por los
  primeros 8 (los cuid de una misma carga comparten prefijo).
- Prefijo real de los 51 cronogramas: mediana 4.906, **máximo 9.918**, techo 13.000, **0 se pasan**.

⛔ **Y un defecto peor que la función que faltaba**: «borrá esa tarea» sobre una tarea hecha o
cargada a mano **no borraba nada y nadie avisaba** — el cronograma la protege, y la cajita azul ya
había dicho «Se elimina «X»». Ahora se rechaza antes, diciendo por qué y adónde ir.

**La auditoría del rango**: 5 lentes en paralelo, 20 hallazgos, **16 confirmados** por un escéptico
por hallazgo, 2 rompían datos (un NaN que atravesaba todas las guardas de rango, y `mergeServerIds`
perdiendo la procedencia). Todos arreglados con su guarda rota a propósito.

⚠ **La lección de método**: el traductor de la cajita y el ejecutor son dos simulaciones del mismo
lote y **divergen**. Un arreglo mío hizo que la cajita dijera «semana 2» mientras el ejecutor ponía
la tarea en la 3. Ningún test lo vio. Lo cazó correr el pedido real contra el modelo.

### ⭐ Tramo 2f — el chat deja de olvidarse de lo que ya acordaron *(2026-08-21)*

**Lo que pasó, en el hilo real de producción:**

| Hora | |
|---|---|
| 18:20:59 | Elías pide **dos** cosas |
| 18:21:00 | El asistente pregunta una y propone la otra. **Acuerdo: 2 operaciones** |
| 18:22:30 | Elías **contesta la pregunta** |
| 18:22:31 | El asistente propone. **Acuerdo: 1 operación** — reemplazó al anterior |
| 18:24:29 | Se aplicó esa 1. **Las 2 primeras se perdieron en silencio** |

**Contestar una pregunta le costó la otra mitad de su pedido.** Y no fue un bug: el prompt decía,
textual, *«cada propuesta reemplaza a la anterior»*. El modelo obedeció.

⭐ **El hallazgo que decidió el diseño**: el dato que distingue «esto ya se aplicó» de «esto sigue
pendiente» **ya estaba escrito en cada fila desde el día uno**. El desenlace es el único turno del
asistente que se guarda con `shaDeContexto = null`, porque `agregarTurno` es el único escritor de
mensajes y esa rama nunca le pasa la huella. O sea que el arreglo funciona también sobre los hilos
que ya existían — un marcador nuevo no habría podido.

**Lo que cambió:**

1. **El acuerdo ACUMULA.** El último acuerdo del hilo contiene siempre todo lo acordado y no
   aplicado. Con eso, «el botón vive en el último turno» deja de ser una coincidencia frágil y pasa
   a ser correcto por construcción.
2. **Compone la app, no el modelo.** El modelo emite SOLO lo nuevo y declara lo que suelta
   (`descartar`). Si el modelo se olvidara de algo, sería invisible; si la app arrastra algo
   cancelado, es un renglón más con su casilla. El error cae sobre la superficie de revisión que ya
   existe.
3. **El botón sigue al ESTADO, no a la posición.** Un desenlace fallido ya no apaga nada (no entró
   nada) y un acuerdo retomado se apaga aunque no haya desenlace. ⛔ Como mucho uno está vivo, y hay
   una guarda que lo hace cumplir sobre cuatro formas de hilo distintas.
4. **Lo que se arrastra se REVALIDA.** Si alguien borró a mano la fase que un pendiente nombra, ese
   cambio se cae **con su motivo escrito**. Sin eso, un pendiente inválido dejaría fallando todos
   los applies siguientes: un rechazo tumba el lote entero.
5. **La caja lo dice**: *«2 de estos 3 cambios ya los habías acordado y no se aplicaron»*, y lista
   aparte lo que ya no va.

**Tres pérdidas sueltas que aparecieron en el mismo análisis, ninguna del bug:**

- ⛔ `leerAcuerdo` cortaba con `indexOf`. El modelo VE el marcador crudo en su historial y puede
  imitarlo; si lo escribía en su texto, **la cajita azul desaparecía entera** — el mismo síntoma que
  Elías reportó como «contesta pero no pasa nada». Una palabra.
- ⛔ El aviso *«⚠ N tareas tienen trabajo hecho encima y se pierden»* de `fase.borrar` **no se pintó
  nunca**: el traductor recibía tareas sin `status` ni `source`, así que `isKept` daba false para
  todas. Era exactamente la red que su propio comentario decía estar tendiendo.
- El desenlace parcial decía un número (*«3 de 5»*); ahora **nombra** lo que quedó afuera. Sin eso,
  el modelo lee «faltan dos» y no sabe cuáles.

**⭐ Y lo que corrigió la primera prueba en pantalla** (Elías, el mismo día): el chat ofrecía
aplicar la parte clara **mientras la pregunta seguía sin contestar**. Él aplicó esa mitad, contestó,
y el pedido terminó en **dos escrituras** sobre un cronograma que el cliente ve. Textual: *«es mejor
que no dé la oportunidad de aplicar hasta que no haya resuelto las dudas… que solo haya una
aplicación»*. Tenía razón, y corrige una decisión de diseño: acumular **y** dejar aplicar resuelve
media mitad del problema.

Ahora el modelo marca `preguntaAbierta` y la caja queda **sin casillas y sin botón** hasta que no
quede nada por resolver — los cambios se siguen registrando y el libro los arrastra, así que no se
pierde nada. **Una sola aplicación por pedido.**

Y de la misma prueba salió el arreglo visual: el mensaje del asistente numera los ASUNTOS y la lista
numera las OPERACIONES, así que quedaban **dos listas numeradas pegadas** sin nada que las separe.
Ahora el rótulo («2 cambios») aparece siempre que haya mensaje arriba, y el prompt le prohíbe
repetir la lista cuando pregunta.

### ⭐ Tercera vuelta — menos cuadro, más conversación *(2026-08-21, mismo día)*

Elías probó el arreglo en pantalla otra vez y encontró tres cosas más:

1. **El textarea no crecía.** Pegar un párrafo largo lo dejaba tapado detrás de dos líneas de
   scroll. Ahora crece con lo que se escribe o se pega, con un techo de ~10 líneas antes de
   scrollear adentro — mismo patrón que `TaskDetailDrawer`.
2. **El cuadro amarillo de «Ya no va» sobraba en la conversación normal.** Textual: *«cuando se
   consensúan otras cosas, no hace falta el cuadro amarillo… busco que la experiencia sea más como
   hablar contigo, normal»*. Y tenía razón: cuando el CSE dice «no, mejor X», el modelo descarta lo
   anterior y **su propio resumen ya lo explica** («Descarto la propuesta anterior de… En su
   lugar…») — la caja amarilla repetía la misma información. Se sacó esa categoría del campo
   `descartadas`. Lo que SÍ se conserva: un pendiente que se cae porque alguien tocó el Gantt a
   mano mientras se conversaba — eso el modelo nunca lo puede narrar, así que es la única categoría
   que de verdad se perdería en silencio.
3. **La caja de un acuerdo ya aplicado no necesita repetir toda la explicación.** Textual: *«no
   hace falta que se vea el cuadro… con toda la explicación larga… sino más como: Aplicado, ¿Hay
   que cambiar algo más?»*. Ahora una caja `aplicado` colapsa a esa línea corta, y una `retomado`
   no repite nada (el encabezado ya lo dice). El detalle no se pierde — sigue en el cronograma.

⚠ **Dos guardas nacieron decorativas otra vez** — una cortaba su ventana de lectura en el primer
`;` del archivo, que caía DENTRO de un callback anidado antes de llegar a lo que había que prohibir;
la otra afirmaba sobre una clase CSS que aparece en otros tres lugares del componente. Las dos
pasaban en verde con el arreglo roto. Se cazaron con el mismo ritual: romper, ver que no salta,
corregir la ventana de la guarda, romper de nuevo.

⚠ **Y una lección de método**: tres de las guardas nuevas nacieron **decorativas** —anclaban en un
símbolo que también aparece en la línea de `import`, así que daban verde con el arreglo apagado— y
solo se cazaron rompiéndolas a propósito. Ahora afirman sobre el texto que se pinta y sobre el
fuente sin sus imports.

### ⭐ Etapa 3 — el chat de documentos *(2026-08-21)*

El diagnóstico era «falta cablear el Aplicar». Al abrirlo, el problema era otro y más de fondo:
**el chat de documentos no podía cerrar un acuerdo NUNCA**, por tres razones encadenadas.

1. El prompt no recibía la pieza, así que sobre un kickoff el modelo leía el vocabulario de fases
   y semanas del cronograma.
2. La única herramienta pedía `operaciones` — no había ningún campo para una instrucción.
3. Y el turno exigía `operaciones.length > 0`, así que descartaba el acuerdo **en silencio**: el
   CSE leía «voy a dejar lista la instrucción» y no aparecía ninguna cajita.

⚠ Los tres eslabones estaban bien por separado. Lo encontró correr un pedido real contra el
modelo, no la suite.

**El «Aplicar», sin abrir un segundo camino de escritura.** El cajón lo monta el panel del
proyecto; el aplicador de documentos vive dentro de cada workspace. Se resolvió haciendo que el
aplicador **se anuncie** y el chat lo llame — registrándose el propio `DocumentAssist`, no cada
workspace, así que los seis quedaron cableados sin tocar ninguno.
⛔ Lo que se descartó: que el chat llame a `canvas-assist` y escriba por su cuenta. Sería un
segundo camino de escritura para lo mismo — no interfaz duplicada, lógica de pérdida de datos
duplicada.

**Y antes de la etapa 3, el hueco más caro del cronograma:** aplicar dejó de ser todo-o-nada. Cada
línea tiene su casilla, con cascada — desmarcar la fase que se crea tacha sus tareas a la vista,
porque dejarlas produce operaciones que apuntan a una fase inexistente y **un solo rechazo aborta
el lote entero**.

### ⭐ Lo que la medición contra producción cambió (2026-08-19)

El contexto del chat se midió con datos reales, no estimado. El peor cronograma de la cartera
(Wherex, 10 fases) son **3.481 caracteres — un 58 % del techo**. En tokens:

| Modelo | Tokens del turno | Mínimo para que la caché funcione | ¿Cachea? |
|---|---:|---:|---|
| Sonnet 5 | 1.662 | 1.024 | ✅ sí |
| Haiku 4.5 | 1.199 | 4.096 | ❌ **no, y en silencio** |

**Dos consecuencias que dan vuelta el plan:**

1. El plan proyectaba un prefijo de ~20.000 tokens y $7,4–10,5 por día *con* caché. El contexto
   liviano lo dejó en ~1.700 → el chat cuesta **un orden de magnitud menos** de lo presupuestado.
2. ⚠ **Haiku 4.5 no cachea un prompt de este tamaño** (su mínimo es 4.096 tokens, el más alto de
   toda la familia). O sea que paga el prefijo entero en CADA turno, mientras Sonnet 5 lo lee
   cacheado a 0,1×. El modelo «barato» puede terminar saliendo **más caro** en una conversación
   larga — es exactamente la pregunta de la etapa 7, y la respuesta se dio vuelta antes de
   llegar. ⚠ Falta el otro lado: la salida de Haiku sigue siendo 3× más barata, y en un chat
   las respuestas son cortas. Se decide con las dos mitades medidas, no con esta sola.

### Las decisiones que ya se tomaron

- ⭐ **El chat entiende la INTENCIÓN; el editor tiene el CONTEXTO.** El chat no carga el handoff ni
  las minutas — eso ya lo tiene el editor. Así el chat es chico, rápido y barato.
- **Hablar → proponer → consensuar → aplicar**, como el modo plan.
- ⛔ **El chat NO escribe.** Emite una instrucción; aplicar pasa por el editor de siempre, con su
  vista previa y su aceptación ítem por ítem. El permiso vive en el botón, no en la conversación.
- **Toda propuesta que mueva una fecha lo DICE.** Y si no la mueve, también.
- **Los botones de IA del cronograma se los come el chat** — pero ⛔ **solo cuando pueda todo lo que
  ellos pueden.** Si se van antes, se pierde capacidad en silencio.
- **El chat se come el PEDIDO, no la curación**: arrastrar 40 tareas entre columnas no se conversa.

### ⛔ El techo, para no re-discutirlo

**El chat llena formas que existen; no puede inventarlas.** Hay 22 tipos de sección programados; uno
que nadie programó no sale de una conversación. Cuando alguien lo pida, la respuesta correcta es
decirlo, no intentarlo.

### ⚠ Lo que el mapeo encontró y NO depende del chat

- **`ProjectActionsPanel` no lo importa nadie** — código muerto, se borra.
- **`ProjectActionsLine` ya emite un cartel falso** cuando hay una propuesta del assist: dice que los
  cambios «salieron del último handoff» cuando los pidió el consultor hace diez segundos, y su botón
  lleva a un ancla que no existe. Con un chat que propone por turno, ese cartel aparecería siempre.
  **Se arregla antes, no después.**
- **Exploración no se puede sumar todavía**: una propuesta que toque su plan de sesiones borra las
  marcas de «ya la pregunté», sin aviso. Es un arreglo propio.

---

## El plan de lo que falta

**El orden lo fijó Elías (2026-08-16): primero validar en pantalla, después lo retroactivo.**
Tiene una razón fuerte: lo retroactivo escribe sobre 118 proyectos y no se deshace solo. Si algo de
lo construido está mal, es mucho más barato descubrirlo con un clic que con 118 filas escritas.

### Fase 11 · Validar en pantalla *(ya se puede hacer — deploy hecho el 2026-08-18)*

Ya no hay nada bloqueando: el push y el deploy se hicieron el 2026-08-18 (junto con la tanda del
medidor de IA). Las **cuatro migraciones SQL ya están aplicadas**. El recorrido está en
`docs/CHECKLIST-PRUEBA-CLICKEADA-CONTEXTOS.md`, ordenado por pantalla.

Lo que la validación tiene que responder, y ningún test puede:

1. **¿El resumen de un proyecto me dice algo que no sabía?** Si la respuesta es no, el problema es
   el prompt, no el código.
2. **¿La sugerencia de estado le pega?** Aceptarla y confirmar **en HubSpot** que cambió.
3. **¿El CSE ve su pantalla y nada más?** Con un usuario que no sea super admin.
4. **¿Aprobar el plan congela lo que tiene que congelar?** Agregar una tarea después y ver que
   aparece como trabajo agregado.

### Fase 12 · Aplicarlo retroactivamente *(después de la 11)*

Los 118 proyectos sin foto reciben una tomada hoy. **El aviso va escrito adentro del propio
documento**: *«Línea base tomada el 16 de agosto de 2026; no refleja los cambios anteriores a esa
fecha.»* Sin ese cartel el número miente por omisión — diría que el proyecto no creció cuando en
realidad nadie estaba mirando.

Se corre con simulación primero (se lee el resultado antes de escribir nada) y necesita el permiso
explícito de escritura sobre producción.

### Fase 7 · Desviaciones abierto/cerrado *(en curso, no depende del deploy)*

Hoy una desviación detectada en el cronograma **no se puede cerrar**: queda para siempre, y
«descartarla» la borra físicamente. Gana dos estados y un cierre con fecha y autor.

⚠ **El relevamiento (2026-08-16) encontró que el diseño original no cerraba.** 12 problemas
graves, y tres cambian el diseño:

1. **El agente vuelve a proponer lo cerrado, para siempre.** Cada corrida re-lee los mismos
   transcripts; lo único que evita que repita una desviación es un bloque del prompt que lista
   «las ya registradas». Si una cerrada sale de esa lista, vuelve a proponerse en cada corrida —
   duplicación infinita. Si se queda, la decisión de «crear una nueva» no hace nada.
   **Se resuelve así:** la cerrada **sigue en la lista, rotulada** («esto se cerró el <fecha>; si
   volvió a pasar, devolvé la misma huella y decí qué cambió»).
2. **¿Cerrar tiene que bajar el número de semanas?** El relevamiento lo planteó como un
   problema; mirándolo de cerca, la respuesta es que **no**, y eso corrige al plan. Un atraso de
   3 semanas que se resolvió movió el plan 3 semanas igual: el cronograma ya se corrió y cerrarlo
   no lo devuelve. Restarlo haría que la frase «el plan se movió N semanas» contradiga al Gantt
   que está justo arriba, y si se cierran todas, el cliente perdería la única línea donde ve la
   fecha de cierre nueva — el número mentiría hacia abajo, que es la peor dirección para un papel
   que el cliente archiva. **Lo que se apaga al cerrar es el trabajo pendiente**: deja de figurar
   como algo que alguien tiene que perseguir.
3. **El cliente sigue leyendo la foto vieja.** Lo que el cliente abre es un snapshot congelado:
   cerrar algo no lo saca de ahí y el aviso interno de «falta re-subir» no se mueve. **Ese aviso
   se cablea al cierre**, o la fase no cambia nada para ningún cliente ya publicado.

Las dos decisiones que sí sobreviven del diseño original: una desviación sin estado (todas las de
hoy) **cuenta como abierta**, y el estado se define **en un solo lugar** — es lo que evita que la
columna se escriba y ninguna pantalla la mire, que es literalmente lo que ya pasó con otro campo
de esta misma tabla.

Trae **migración SQL (#4)**, con default: sin eso, los cronogramas históricos pierden su bitácora
o revienta la lectura.

**Cómo va:**

| | |
|---|---|
| El dato existe y todo lo que lee desviaciones sabe preguntarle | ✅ `2db22ca` |
| El botón de cerrar y reabrir | ✅ `1eae91d` |
| Que el agente no vuelva a proponer lo que ya se cerró | ✅ `1eae91d` |
| Que el cliente vea «resuelta» y el aviso de re-subir se encienda | ✅ `ad3ec42` |

### Fase 8 · Reuniones → tareas *(⛔ frenada: necesita una decisión de Elías)*

El plan pedía mirar el circuito de pendientes antes de sumarle una segunda fuente. **Medido el
2026-08-16** (detalle en `docs/notas-fase8-pendientes.md`):

| | |
|---|---|
| Pendientes vivos | **3.211** · hechos **26 (0,8 %)** · descartados **1** |
| De ellos, del agente post-reunión | **3.169 (98,7 %)**, con 0,8 % de cierre |
| Los 3.185 sin hacer, ¿son viejos? | **No: TODOS son de los últimos 90 días** |
| Escritos a mano | 2, de los cuales 1 hecho (**50 %**) |

**Lo que muestra:** no es un cementerio viejo ni un problema de datos —tres de cada cuatro tienen
dueño—, y tampoco es que no se vean. Es **volumen**: el agente emite ~35 por día extrayendo todo lo
que suena a próximo paso, y una lista de 340 en un solo cliente no se recorre. Lo que una persona
escribe a mano sí se cierra (50 %); lo que extrae el agente, no.

**Por eso la fase se frena:** agregar una segunda fuente automática sobre un circuito con 0,8 % de
cierre no suma capacidad, duplica el ruido — y encima se lo mete al cronograma, que hoy sí se usa.
El «mínimo» que preveía el plan (que la tarea cierre el pendiente que la originó) arregla la
contabilidad, no el volumen.

**La pregunta, que es de negocio:** ¿qué es un pendiente que vale la pena registrar? Tres salidas,
de menor a mayor esfuerzo: subir la vara del agente (solo compromisos con dueño y fecha dichos en
la reunión) · que caduquen solos si nadie los toca · o aceptar que son notas y sacarlos de todo
contador que prometa accionabilidad.

⚠ **Ninguna limpieza masiva mientras tanto**: borrar 3.185 filas que el equipo nunca decidió
descartar es tomar por ellos una decisión que es suya.

#### ✅ Tramo 8.1 — la primera generación del cronograma ahora se revisa *(hecho, `aae8e5d`)*

Era la única puerta del cronograma que escribía sin que nadie mirara — y justo la que más tareas
crea de un saque. Ahora la primera generación y «Regenerar todo el cronograma» son el mismo botón
con otro nombre: las dos abren el acordeón donde se arrastra, se edita y se saca lo que no va, y
nada se guarda hasta confirmar.

Tres cosas se habrían perdido mudas al mudar el camino, y las tres están cubiertas:

| Lo que se perdía | Cómo se nota si falla | Estado |
|---|---|---|
| Las 5 tareas fijas de la Semana 0 (accesos, base de datos, usuarios, Academy) | El proyecto arranca sin pedirle nada al cliente; se descubre en el kickoff | ✅ Entran a la revisión como una propuesta más |
| El tipo de actividad de cada fase | Las barras del Gantt pierden su color y la leyenda que ve el cliente queda sin sentido | ✅ Viaja en la propuesta; nunca pisa lo elegido a mano |
| ⚠ El permiso | El CSE veía la propuesta y no podía aplicarla | ✅ La vara ahora mide qué hay para romper: cronograma vacío = crear, no rehacer |

⚠ **Lo que vas a ver distinto al probarlo:** «Genera las tareas» ya no las crea de una — abre la
ventana de revisión. El botón de adentro dice **«Crear las tareas»**.

### ✅ Fase 9 · Lo que se habló pero no se vendió *(hecha, `71a6749`)*

El handoff gana una sección: **«Se conversó y no se vendió»**, justo después de «¿Qué vendimos?».
Lista lo que el cliente pidió en la venta y quedó afuera, con quién lo dijo, cuándo, y si fue por
precio, por plazo o por decisión de alcance.

Sirve a **dos cosas a la vez**: defender el alcance cuando un pedido reaparece como *«esto ya lo
habíamos hablado»*, y saber qué ofrecerle al cliente más adelante.

⛔ **Es interna, y es lo más caro de filtrar del documento.** Mandarle al cliente un apartado
titulado «lo que pediste y no te vendimos» no es una fuga de datos: es un problema comercial en un
papel que él archiva. La fuga que lo hacía posible se tapó antes (`a276eb0`), y ahora hay una guarda
que **descubre** las listas de los documentos del cliente en vez de transcribirlas — así que una
séptima lista queda cubierta el día que exista.

**Dos agujeros que se taparon de paso, y los dos fallaban en verde:**

| Agujero | Qué pasaba | Cómo se veía |
|---|---|---|
| El test que se aprobaba solo | Verificaba que cada sección estuviera en el prompt buscando el texto que el propio generador escribe. Estaba siempre, hubiera instrucción o no | Una sección nueva salía a producción con la instrucción literal «undefined» |
| El prompt del agente de CS | Está escrito a mano y nada lo ataba a la plantilla | Una sección nueva quedaba vacía **para siempre**, sin error en ningún lado |

⚠ **Y el seed más peligroso del repo dejó de pisar.** El prompt del agente que arranca todos los
proyectos —y que además escribe las fases del cronograma— vive en la base para poder calibrarlo sin
deploy. El script lo sobreescribía sin preguntar: una corrida por reflejo borraba esa calibración
sin dejar rastro. Ahora compara, avisa, y hay que forzarlo a propósito.

### ✅ Fase 10 · Qué logramos antes *(hecha, `d149e2a`)*

El documento de Entrega se escribía, se publicaba, y ningún otro documento lo volvía a leer.
Ahora el handoff del **próximo proyecto del mismo cliente** cita la Entrega publicada más
reciente — cañería, sin dato nuevo, con munición de cross-selling ya escrita (la sección «El
siguiente proyecto» de la Entrega, pensada exactamente para esto).

**Solo cuatro secciones entran**, nunca el documento entero: el antes/después, qué quedó
implementado, los objetivos alcanzados, y esa sección de continuidad. Afuera a propósito: los
números de negocio (de OTRO proyecto, sin que el CSE los vetee para éste), lo que quedó abierto
(interno, no es historia para afuera) y el cierre (es un CTA, no contenido).

**Tres candados, para que no se cuele nada indebido:**
1. Solo la Entrega que el CSE efectivamente **publicó** al cliente — nunca un borrador.
2. Solo lo que el CSE **confirmó** dentro de esa Entrega.
3. Nunca el proyecto que se está generando ahora mismo (para que una Entrega no termine
   citándose a sí misma).

---

## Al lado del plan — lo que se construyó el 2026-08-18

No son fases del plan: son tandas propias que salieron de problemas reales del día. Se listan acá
porque comparten el push pendiente y porque **dos piden un paso de Elías después del deploy**.

| Commit | Qué resuelve | ¿Pide algo? |
|---|---|---|
| `4ad0c8b` `537097d` | Venderle a un prospecto lo convierte en cliente, y el buscador deja de mentir (REMPRO) | — |
| `0767361` | Una reunión que todavía no ocurrió deja de contar como evidencia. Eran 468 de 7.161, y como los lectores ordenan por fecha, iban PRIMERO: 42 % del contexto de Multiquímica, 35 % de SmartAgro | — |
| `ae83455` | Un proyecto deja de nacer sin ninguna reunión vinculada. Aplicado a producción: Discover Puerto Rico recuperó 2 vínculos, Kamalio 3 | — |
| `457619d` | El modificador del cronograma deja de estar a ciegas: ve el handoff, el requerimiento técnico y la operativa de HubSpot, con la regla de frontera que impide que eso cruce al texto que lee el cliente | — |
| `39d0b07` | Su prompt sale del código y entra a la tabla `Agent` — calibrable sin deploy — y el formato de salida gana dueño y tipo de tarea | ⚠ **Post-deploy**: `npx tsx scripts/seed-timeline-assist-agent.ts` |
| `ff1bbd7` | La propuesta del modificador deja de ser todo-o-nada: cada cambio se descarta de a uno y «Aplicar» escribe solo lo que quedó | 🖱 Probar con las manos (abajo) |

**La prueba clickeada de las dos últimas**, sobre un proyecto con cronograma generado:

1. «Pedir cambio con IA» → un pedido acotado («atrasá Setup una semana»). En la vista previa
   violeta aparece **«Revisar uno por uno (N)»**.
2. Abrirlo: cada cambio con su ✓/✗. Descartar uno → el botón pasa a decir **«Aplicar 3 de 4»** y
   arriba avisa cuántos quedaron afuera.
3. Aplicar → en el Gantt está lo aceptado y **no** está lo descartado.
4. ⚠ **La regresión que importa**: una fase que la propuesta NO tocaba tiene que quedar con TODAS
   sus tareas, incluidas las marcadas como hechas. Es el modo de falla que el módulo cuida.
5. Sin descartar nada, «Aplicar cambios» tiene que comportarse **exactamente** como antes.
6. Una tarea nueva creada por el modificador ahora nace **con dueño** (Cliente / Smarteam / Ambos /
   Desarrollo) y con su tipo — antes había que ponérselo a mano.

---

## El 2026-08-21 — el CSE de la cuenta, y un agujero de acceso que nadie había visto

Empezó como un detalle visual: Elías reasignó kölbi a Heiver y la columna «CSE encargado» del
listado seguía mostrando **«Breiner Salas Salas +1»**. Tirando de ahí apareció una regla de negocio
que el código no conocía, y debajo, un problema de permisos.

### La regla, en palabras de Elías

> *«Los customer success del pipeline de implementación de hubspot son los customer success de la
> cuenta. Todo lo que está en proyecto de desarrollo se podría decir que son proyectos hermanos o
> proyectos hijos del proyecto que están customer success. Eso se hizo para poder mapear los
> proyectos de desarrollo de mejor forma y poder tener un cronograma específico. Entonces las
> cuentas tienen que estar en el ownership de las personas del pipeline de hubspot.»*

Un proyecto de **Desarrollo** o **Sitios web** cuelga como hijo de una implementación y tiene su
propio `csl_encargado` —a veces un desarrollador— **solo** para que ese pipeline tenga su propio
cronograma técnico. No representa una cuenta ni un CSE.

### ⛔ Lo que eso destapó: no era cosmético

`Project.hubspotOwnerEmail` se resuelve desde `csl_encargado` **igual para los tres pipelines**, y
`lib/auth/access.ts` lo consultaba sin distinguir cuál. Un desarrollador dueño de un proyecto hijo
obtenía razón `"hubspot-owner"` sobre el **cliente entero**: la cartera de CS, y —vía
`requireHandoffAccess`, que llama a `ownsClient`— permiso para editar el handoff y el cronograma.

Arreglado en `0f4846b` con un átomo nuevo en `lib/projects/scope.ts` (`esProyectoDePipelineCS`),
usado en tres lugares:

| Dónde | Qué pasaba |
|---|---|
| `lib/auth/access.ts` (3 funciones) | El agujero de acceso |
| La columna CSE de `/clients` | El síntoma visible — y la pestaña «Mis clientes», que usaba los mismos arrays |
| `scripts/verify-cse-scoping.ts` | El script que dice verificar ese gate **tenía la misma falta de filtro**: no lo detectaba, lo repetía |

### ⭐ Y encima, la columna se volvió editable

Pedido de Elías en la misma conversación. La celda «CSE encargado» pasa a ser un select: elegís a
alguien del equipo y se escribe `csl_encargado` en **todos** los proyectos del cliente que están en
el pipeline de Implementación de HubSpot — nunca en los hijos de Desarrollo.

Es productizar lo que ese mismo día se hizo a mano con dos scripts (kölbi y Grupo Inve).

**Las dos decisiones de negocio, tomadas por Elías:**

| Pregunta | Elegido |
|---|---|
| ¿Quién puede reasignar? | **Solo liderazgo** (CSL + admin). Mover cartera no es operativo — y como `csl_encargado` gobierna la visibilidad, un CSE que pudiera reasignar podría quitarse el acceso a una cuenta solo |
| ¿A quién se puede elegir? | **Todo el equipo activo**, sin filtrar por rol (acotarlo a `CSE` dejaría fuera a los CSL, que hoy llevan cuentas) |

⚠ **Riesgos que el diseño acepta, escritos:** son N PATCH independientes contra HubSpot y **no hay
rollback en ninguna parte de esta base**. Si el tercero de cinco falla, los dos primeros ya quedaron
escritos — por eso el error dice **cuántos entraron**, en vez de un «falló» que mandaría a
reintentar creyendo que no se escribió nada.

### ⚠ La lección de método de la jornada

**Siete guardas nuevas nacieron decorativas** a lo largo del día — pasaban en verde con el arreglo
roto — y las siete se cazaron con el mismo ritual: romper de verdad, ver que NO salta, corregir la
guarda, romper otra vez. Los tres modos de falla, todos reales:

1. **Anclar en un símbolo que también aparece en la línea de `import`** (`marcaDeDesenlace`,
   `textoVisible`): el `.includes()` sobre el archivo entero da verde aunque nadie lo llame.
2. **Cortar la ventana de lectura en un separador que se repite** (el primer `;`, el primer
   `) : (`): la ventana termina midiendo un tramo que no es el que se quería proteger.
3. **Afirmar sobre una forma que nunca existió** (`DEFAULT_MATRIX.CSL.proyectos` como array,
   cuando `grant()` devuelve un mapa sección→acción→bool): `.toContain()` sobre `[]` pasa siempre.

---

## La noche del 2026-08-19 — el retiro de etapas y la medición de atribución

Plan aprobado por Elías para correr desatendido, con una regla: **nada que escriba en producción,
nada de push, nada que necesite una decisión suya.**

| Commit | Qué |
|---|---|
| `2ce3f62` | Las 5 puertas que llevaban a pantallas huérfanas o inexistentes + la guarda de navegación viva |
| `1896a85` | El widget deja de inventar la etapa en 68 de 138 proyectos activos |
| `4206d24` | 50 scripts escribían en producción sin pedir permiso, e INV12 daba verde → trinquete |
| `c8c30d7` | Las capacidades del cronograma salen del prompt y pasan a ser un módulo compartido |
| `b578967` | La medición del match por título: la regla que propuse era mala, y el dato dijo cuál sirve |
| `b3b035b` | El subsistema de etapas se retira: 24 archivos |

### ⭐ Lo que la medición cambió, y es el resultado más valioso de la noche

La regla que iba a aplicar —«si el nombre del cliente da para dos palabras, que hagan falta dos»—
**costaba 316 atribuciones correctas para arreglar dos**. La medición lo mostró antes de escribir
una fila. La que el dato respalda es otra: **gana quien nombró más de su propio nombre**, y **la
casa no le gana a un cliente** (34 pérdidas, todas empates reales, y 20 correcciones).

⛔ **No se aplicó nada.** El código está, la guarda está, el informe está en
`docs/informe-match-por-titulo.txt`. La decisión de cambiar la regla de atribución de las 12.500
reuniones es de Elías.

### ⚠ Lo que quedó abierto

- **INV2 oscila**: el backfill lo deja en cero y vuelve a 8, con las MISMAS 8 reuniones
  (Smarteam −8 · Culebras +6 · Pico Blanco +1 · APRECAP +1). Algo las reescribe. No lo causó esta
  noche — el matcher nuevo no está cableado.
- **INV1**: 6 vínculos que cruzan cliente. Esperan la decisión del matcher: borrarlos ahora
  escondería el defecto.
- **INV16 (a) y (c)**: rojos esperados hasta drenar los transcripts de Meet.
- `ClientContextCards.tsx` (~1.000 líneas) y `poll-agent-run.ts` quedaron huérfanos por cascada.
  No rompen nada; es limpieza propia.

---

## ✅ La preparación, ya hecha

✅ **Las cuatro migraciones SQL ya se aplicaron** (2026-08-16), verificadas con
`check-invariants`: INV7 en verde — las columnas de los 87 modelos existen todas en la base. Más
`prisma generate` y la siembra del agente del resumen. **No hace falta correr nada.**

⚠ Para la próxima: en Prisma 7 el comando **no lleva `--schema`** — el destino sale de
`prisma.config.ts`. La forma correcta es `ALLOW_PROD_WRITE=1 npx prisma db execute --file <archivo>`.

| # | Archivo | Qué agregó |
|---|---|---|
| 1 | `2026-08-16-duenio-manual-procedencia.sql` | Quién y cuándo le puso dueño a una reunión |
| 2 | `2026-08-16-estado-y-etapa-propuestos.sql` | Dónde guardar la sugerencia de estado y etapa |
| 3 | `2026-08-16-project-brief.sql` | La tabla del resumen por proyecto |
| 4 | `2026-08-16-particularidad-estado.sql` | Que una desviación se pueda dar por resuelta |
| 5 | `2026-08-19-hilos-de-chat.sql` | ✅ Aplicada el 2026-08-19 — las dos tablas de la conversación del asistente. INV7 verde con 101 modelos |

⚠ Si el servidor del 3004 venía levantado, **reinicialo**: tiene el cliente de Prisma viejo en
memoria y las escrituras fallan en silencio.

---

## Los 36 commits

| Commit | Fase | Qué |
|---|---|---|
| `ac8873c` | 1 | El material que falta deja de ser invisible en /sessions |
| `4a23794` | 2 | Los documentos dejan de ignorar que el proyecto está trabado |
| `6ae9c5b` `dd40387` | 3 | El avance y el handoff saben con quién se habló cada cosa |
| `bf97899` | 3 | Las reuniones vacías dejan de comerse el espacio del prompt |
| `2eaefee` | 1 | Queda registrado quién le puso dueño a una reunión — **SQL #1** |
| `332d430` | 1 | Una reunión vacía deja de pintarse verde en el Contexto |
| `d3639f7` `97d65dd` `0015682` `6484ae3` | 4 | Qué se puede proponer · cómo se escribe · el circuito · el chip — **SQL #2** |
| `48384a9` | 5 | Cuatro agentes que terminaban sin avisarle a nadie |
| `608f6d2` | 5 | Ver todos los clientes deja de ser lo mismo que hacer éxito del cliente |
| `80e3cc2` `e3f53d8` `27cd8a1` `a8d9e74` `e7d3c7e` `c84d81c` | 5 | El resumen por proyecto, de la garantía de citas a la pantalla — **SQL #3** |
| `151e3f3` | 6 | ⭐ La foto del plan deja de tragarse lo que se agregó después |
| `7d30816` `a4875e0` | 6 | Aprobar el plan es un acto propio, con su botón |
| `db7e115` | — | Auditoría: los 6 defectos graves que ni los tests ni el build ven |
| `2eb91eb` | — | Los cuatro controles que el CSE veía y no podía apretar |
| `25a8870` | — | El resumen del proyecto no leía el handoff |
| `60bf6d5` | — | Este roadmap y el recorrido de validación |
| `a276eb0` | 9 (prerrequisito) | ⛔ Dos caminos le podían mandar al cliente el handoff entero |
| `f44c500` | 7 | El relevamiento de la fase 7, con los 12 problemas graves |
| `2db22ca` | 7 | El dato ABIERTA/CERRADA — **SQL #4** |
| `1eae91d` | 7 | El botón de dar por resuelta, y reabrir en vez de clonar |
| `1156666` | — | Las 4 migraciones aplicadas + el comando documentado que no corría |
| `ad3ec42` | 7 | El cliente ve «Resuelta»; el aviso de subir deja de ser ciego |
| *(medición)* | 8 | El circuito de pendientes, medido — y por qué frena la fase |
| `71a6749` | 9 | «Se conversó y no se vendió» + las dos guardas que se aprobaban solas |
| `6e8eb17` `aae8e5d` | 8.1 | La primera generación del cronograma también se revisa antes de escribirse |

---

## Lo que NO se hace, y por qué

| No hacer | Motivo |
|---|---|
| Una tanda de «arquitectura de contexto» antes de los ejes | Ya se intentó con la pieza más chica: costó 9× más código del que sacó |
| Que Nexus escriba las columnas espejadas de HubSpot | El sync las revierte en 10 minutos. La escritura va **hacia** HubSpot y se espera el espejo |
| Datos de partner, cobranza o costos en cualquier contexto de agente | Prohibido por los términos con HubSpot, con guarda y allowlist vacía a propósito |
| Que la fecha estimada toque cobranza | Convertiría una estimación que se mueve sola en un input de facturación |
