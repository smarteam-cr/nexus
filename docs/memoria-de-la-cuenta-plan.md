# Memoria de la cuenta y lectura de reuniones: auditoría y plan

Para Elías · 9 de octubre de 2026 · corregido con la revisión adversarial y con tus respuestas a las 8 decisiones (§6).

Solo leí código y consulté producción en modo lectura. No escribí nada en el repo ni en la base. Antes de usarlas, volví a abrir en el código las líneas que más pesan. Lo que no pude verificar está marcado.

**Una advertencia antes de leer.** El árbol local tiene unos 360 cambios sin commitear y 12 commits sin subir. Entre ellos están `lib/sessions/post-process.ts`, `prisma/schema.prisma` (+654 líneas) y todo el módulo de Tareas. Marco **(en el árbol)** lo que todavía no está en producción. Los números de producción los medí sobre la versión desplegada.

## En cinco líneas

1. **La lectura de cada reunión al llegar ya existe.** Es el post-proceso. Además, Tareas ya tiene una tabla para leer cada reunión una vez (en el árbol). No hace falta un agente nuevo ni otra tabla: hay que arreglar el post-proceso y compartir esa tabla.
2. **Lo que falla es revisar.** De 533 minutas, 2 están revisadas. El 98 % de las acciones sigue abierto. Hay 21 propuestas de ficha sin confirmar contra 2 confirmadas. Por eso la revisión va antes que cualquier propuesta nueva.
3. **La memoria de la cuenta casi no existe.** La ficha está confirmada en 2 de 168 clientes, y los agentes que más la necesitan (handoff, kickoff, cronograma, vigía) no la leen.
4. **Tu arquitectura de tres capas se sostiene con cuatro correcciones.**
   - El handoff es memoria del proyecto, no de la cuenta.
   - El resumen vivo tiene que salir de lo ya leído, no volver a leer reuniones.
   - «Leídas enteras» sirve solo para pocas reuniones elegidas, con tope y con la regla de no usar precios.
   - Hay un solo sistema de alertas con varios detectores; la lectura le da la evidencia al vigía.
5. **Propongo etapas que se despliegan por separado (§5).** La primera no lleva SQL ni diseño nuevo. Las otras fuentes (HubSpot, notas, correos) quedan fuera hasta medir cómo dispararlas.

**Con tus respuestas (§6):** la exploración abre en una página de inicio con sus sesiones (sin lista general de reuniones); el handoff se congela y sigue recibiendo sugerencias; `ActionItem` se retira y los próximos pasos pasan a Tareas, por CSE; lo que se aprende en la preventa se guarda en la empresa desde el primer día; todo lo que propone Nexus se puede desestimar y tu panel de «Para ti» mide cómo se usa.

---

## Roadmap general (9 de octubre)

Todo lo que pide la memoria de la cuenta, en orden de construcción. La primera tabla son las etapas del plan (§5). La segunda, lo que el plan todavía no cubría. En las columnas «Por decidir», el valor entre paréntesis es el que aplico mientras no digas otra cosa. La columna «Estado» y la de «Cuándo» dicen cómo quedó cada cosa el 10 de octubre: casi todo está en el código, sin commit ni deploy. Al final de esta sección van los pasos para desplegar y las decisiones abiertas.

**Antes de desplegar cualquier etapa** (lo haces tú):
1. Que las sesiones con trabajo sin commitear lo commiteen: Seis mejoras, cartera de la CSL, exploración del proyecto, «Contexto adicional», Tareas (1A.1, 1A.2, 1B) y Feedback. Estas etapas tocan los mismos archivos, así que un commit de una etapa se llevaría cambios ajenos.
2. Correr `npm run check:esquema` y aplicar en producción, en orden, los SQL que diga que faltan. Al 9-oct estaban sin aplicar o sin verificar: `2026-10-06-config-carga`, `2026-10-06-cuotas-comision-vendedor`, los seis del `2026-10-07` (`clasificacion-de-cuenta`, `contexto-de-cada-documento`, `exploracion-del-proyecto`, `nota-de-la-alerta`, `presentacion-del-diagnostico` y `solicitudes-fuera-de-alcance`), `2026-10-08-escala-como-datos`, `2026-10-08-metas-y-vendedor`, `2026-10-09-cartera-de-la-csl`, `2026-10-09-queja-del-cliente`, `2026-10-09-tareas` y `2026-10-09-tareas2-contexto`. El 10-oct `check:esquema` ya no pide ninguno de esos: solo los dos nuevos de este plan (ver «Para desplegar», al final de esta sección).
3. Autorizar `calendar.events.owned` en Google Admin (lo pide Tareas).

### Las etapas

| # | Qué | Depende de | SQL | Qué haces tú | Por decidir (lo que aplico) | Estado |
|---|---|---|---|---|---|---|
| — | **DECISIONS y GLOSSARY**: pasada única = post-proceso; frontera Tareas ↔ agentes; las reglas nuevas de la exploración; handoff congelado; un sistema de alertas con 3 detectores; frontera en los documentos; solo las elegidas | — | No | Leer las enmiendas | — | Hecho, sin commit. Corregido el 10-oct contra el código |
| 0 | **Arreglos y limpieza**: el resumen del proyecto y el análisis de ventas pasan por el chokepoint; el handoff lee la ficha recortada; el kickoff y el detalle dejan de armar contexto que tiran; el panel dice cuántas reuniones lee; se retiran 5 rutas sin pantalla, `CanvasSuggestion` y las 3 secciones muertas | — | No | Regenerar 2 o 3 handoffs de prueba y comparar con «Versiones» | Retirar `/api/sessions/analyze` y el modo «análisis» de /sessions (**sí**: 4 corridas en total, la última el 18-jun) · «Análisis de ventas» de /sales (**se queda**, con `ventas.read` y un solo dueño) | Hecho, sin commit. Falta lo tuyo: revisar los pedidos con el script, pasar a Borrador los dos agentes de análisis y, después de migrarla, retirar la guía vieja |
| A | **Exploración por sesiones**: página de inicio con sus sesiones, fuentes e instrucciones; sin lista general de reuniones; en un prospecto las reuniones entran solas y se sacan en lote; en un cliente, «+ Agregar sesión»; una sesión se une al evento del calendario y espera su transcripción | — (la lectura sola, de la 2) | No | Probar con una reunión real que la sesión unida a un evento se liga sola | «Una que ya pasó» lista **toda la empresa** · ligar por fecha **sí, marcada** · calendario de **quien busca y quien la lleva** · **6 h** esperando la transcripción · tope de **20** sesiones · «Lo que la IA ya sabe» **desde la etapa 3** | Hecho, sin commit. Falta: probarla con una reunión real |
| 4 | **La frontera en los documentos**: los 7 documentos reciben la regla de no usar precios ni lo dicho puertas adentro; el chat de los documentos marca lo que copia del material | — | No | Regenerar un kickoff con una llamada de venta con precio y ver que no aparezca | «Red tras generar» (**no por ahora**) | Hecho, sin commit |
| 1 | **Una sola revisión por reunión**: «Lo que dejó esta reunión» en «Para ti» y en la reunión; todo se puede desestimar; vence a los 30 días; «Uso de Nexus» en tu panel | 0 | No | — | Minuta desestimable (**no**: es memoria, se corrige) · medir quién decidió la etapa (**no por ahora**, sin tabla) · la página de una reunión da **404** sin acceso al cliente · las reuniones de prospectos **no** entran a «Para ti» · los 30 días **desde la fecha de la reunión** | Hecho, sin commit. «Uso de Nexus» tiene los datos y el script; la pantalla espera el panel de dirección de «Para ti» |
| 2 | **La lectura, durable**: cola en `LecturaDeReunion` compartida con Tareas, job con presupuesto, salida por herramienta, citas verificadas; **`ActionItem` se retira** y los próximos pasos pasan a Tareas; las reuniones con solo notas se vinculan a su proyecto | 0 · Tareas en producción | **Sí**: 5 columnas `seguimiento*` | Correr el SQL; `scripts/comparar-lectura-de-reuniones.ts` (≈US$1,6); `scripts/revisar-pedidos-fuera-de-alcance.ts` (de la etapa 0) | Lo del cliente que frena el plan (**Tarea de seguimiento marcada «frena el plan»**; el cronograma, en la 6) · seguimiento en un prospecto (**a quien lleva la preventa**; sin preventa, solo lo de Smarteam) · las propuestas vencen a los **14 días** · pendientes del proyecto con la visibilidad de Tareas (**sí**) | Hecho, sin commit. Falta: el SQL en producción. La bandera viene prendida |
| 3 | **La memoria, un solo cargador**: `memoriaDeLaCuenta` y `memoriaDelProyecto`, versión interna y versión para el cliente; ficha propuesta con su fuente; lo de la preventa a la ficha desde el día uno | 0 (y 2 para los compromisos) | No | Regenerar un handoff, un kickoff y una entrega de prueba | Las metas de la preventa quedan **dentro de retos** (la ficha no las acepta en resultados) | Hecho, sin commit. Todos los lectores conectados (el vigía, el 10-oct) |
| 3b | **El handoff se congela**: «Congelar» o al aplicar su cronograma; sigue editable; lo nuevo llega como sugerencia a pedido | 3 | No | Decidir si se congelan los 53 handoffs existentes (script en simulacro) | Dónde se guarda (**hito + foto protegida**, sin SQL) · quién congela (**la celda `handoff.congelar`: el CSE, la CSL, Ventas y dirección**; corregido el 10-oct) · §4 contra 3b (**sugerencias a pedido y aditivas; el enrutador nunca escribe en el handoff**) · «Rehacer desde cero» **vuelve a congelar** | Hecho, sin commit. Falta: decidir si congelas los handoffs que ya existen |
| 5 | **Sondeo de hechos** (script, sin deploy) | 2 | — | Correrlo (≈US$3,5) y revisar la calidad | Variante y modelo (**lo decides con el sondeo**) | Hecho, sin correr |
| 6 | **Hechos, enrutador y novedades**: `HechoDeReunion`, el enrutador en código, novedades en la tarjeta, el riel y «Qué sigue»; se leen las de solo notas | 1 · 2 · 4 · 5 | **Sí**: `HechoDeReunion` | Correr el SQL; prenderla después de mirar el sondeo | La queja la levanta **la lectura** y el vigía recibe el riesgo como evidencia · prospecto con preventa: propone a la ficha **solo la preventa** · un resultado va **a los documentos** (diagnóstico y kickoff), nunca al handoff · «Usar» una novedad: **al aplicar o con «Listo»** | Hecho, apagado por bandera (`SEGUIMIENTO_HECHOS`) y con el SQL sin aplicar. Falta: el canal al cronograma y la pantalla de acuerdos vigentes |
| 7 | **Solo las elegidas** en los 6 documentos del proyecto (la exploración pasa a sus sesiones en la A), leídas enteras con tope; las sugeridas, calculadas | 3 · 4 · 6 · A | No | Avisar al equipo el día del deploy | Topes de lectura entera (**160k en total, 60k por reunión, 6 enteras**) | Hecho, sin commit ni deploy, con su migración (`scripts/migrar-reuniones-de-los-documentos.ts`). Quedan abiertas, sin frenar el deploy, las minutas en borrador y el impacto de la entrega |

### Lo que el plan no cubría

| Área | Qué falta | Depende de | SQL | Cuándo |
|---|---|---|---|---|
| Frontera Tareas ↔ agentes | Los agentes internos pueden leer una proyección de las tareas (título, fecha, estado, lado), nunca la cita ni lo privado; nada que ve el cliente lee tareas | Bloquea 2 y 3 | No | **Hecho, sin commit** (con la 2): la puerta es `lib/tareas/para-agentes.ts` |
| Niveles de sensibilidad | La memoria no lleva facturación, montos de Partner ni rentabilidad a ningún documento; eso sigue siendo del vigía | 3 | No | **Hecho, sin commit** (con la 3): lo vigila `lib/memoria/frontera.test.ts` |
| Historia de la ficha | Fecha, autor y fuente por campo; los descartes quedan registrados | 3 | No (Json con versión) | **Hecho, sin commit** (con la 3): formato 2 de `Client.ficha` |
| Lo de la preventa a la ficha | Herramientas, quién decide y personas, con lo interno marcado | 3 | No | **Hecho, sin commit** (con la 3): `lib/exploraciones/a-la-ficha.ts` |
| Auditoría del portal | Los hallazgos confirmados entran a la memoria interna | 3 | No | **Hecho, sin commit** (con la 3), como contexto interno, no como propuesta |
| Pase de cuenta con memoria | El resumen del pase suma ficha, compromisos y pedidos abiertos | 3 | No | **A medias, sin commit**: el aviso se corta a 280 caracteres y lleva una línea de conteos. Falta tu decisión: un segundo aviso o una vista |
| La fusión no muda toda la memoria | Mudar pedidos, licencias, clasificación, correcciones y asignaciones; test que lea el esquema | — | No | **Hecho, sin commit**: lo vigila `lib/clients/fusion-cubre-el-esquema.test.ts`. Falta tu decisión sobre la foto semanal de Tareas |
| Costo por reunión | Atribuir cada llamada a su reunión | Antes de la 2 | No, si alcanza `origen` | **Hecho, sin commit** (con la 2): `LlmCall.origen = "reunion:<id> › <sitio>"` |
| Acuerdos vigentes | Cada acuerdo con su cita y si otro lo reemplazó | 6 | Va dentro de `HechoDeReunion` | La columna **hecha** (en el SQL de los hechos, sin aplicar); la pantalla, **falta** |
| Reunión que cambia de dueño | Lo derivado se marca «no aplica» y se vuelve a leer en el cliente nuevo | 2 · 6 | No | **Hecho para los hechos** (se retiran solos). Lo que dejó la lectura (tareas y pedidos) se corrige a mano con INV42 e INV46: falta tu decisión |
| Reuniones viejas a pedido | Encolar reuniones de más de 14 días, con tope | 2 | No | **A medias**: `scripts/encolar-lecturas-pendientes.ts --sesion <id>` lee una sin el corte de 14 días; sin pantalla |
| Uso de Nexus | La cuenta con lo que existe | 1 | No | **Datos hechos, sin commit** (`lib/lo-propuesto` y `scripts/uso-de-nexus.ts`; desde el 10-oct cuenta también novedades, Procesos y sugerencias del handoff). La pantalla, **falta** |
| Notas, tickets y negocios de HubSpot | Si los tickets abiertos cuentan en la memoria | 3 | No | Falta tu decisión |
| Reuniones internas sobre una cuenta | Si dejan hechos internos en su memoria o solo tareas | 2 | No | Falta tu decisión (hoy: solo tareas) |
| Escala de la cuenta con historia | Juntar las 5 escalas y su historia; pasar los agentes a la 8.8 | 3 | Sí, tabla nueva | Falta (para después); necesita tus decisiones |
| Plan de cuenta (land and expand) | Objetivo, siguiente expansión, oportunidades con estado | 3 | Probablemente | Falta (para después); necesita definición y pantalla |
| Mapa de personas | Una persona por fila, con papel y postura, que se actualice | 3 · 6 | Probablemente | Falta (para después); necesita tu decisión (HubSpot o Nexus) |
| Valor entregado en el tiempo | Línea de tiempo de lo entregado y logrado | 3 | No (vista) | Falta (para después) |
| Estado de la cuenta en la memoria | El color y el momento, con historia | 3 | Sí para la historia | Falta (para después) |
| Reuniones de HubSpot | Adaptador a la lectura única, disparo por cuenta activa | 2 | Probablemente | Falta (para después); medir el disparo (caída del 21-sep) |
| Correos con el cliente | Adaptador a la lectura única | 2 · 6 | Probablemente | Falta (para después) |
| Notas pegadas y documentos | Adaptador a la lectura única | 2 | Sí, mínimo | Falta (para después) |
| Procesos con la lectura única | Procesos consume hechos o justifica su lectura con Opus | 5 · 6 | No | **Decidido**: Procesos conserva su lectura con Opus; un hecho de cómo trabaja hoy solo avisa «Volver a mapear» |
| Cuestionarios como memoria | Lo que responde el cliente, como propuesta con fuente | 3 | No | Falta tu decisión |
| Preventas sobre clientes | La preventa de un cliente arranca de la memoria; un pedido aprobado abre una preventa | 3 | Probablemente | Falta (para después) |
| Publicación unificada | Qué pasa al aplicar una novedad en cada documento | 6 | No para avisar | Falta (para después) |
| El chat consulta la memoria | «¿Qué dijo Ana sobre SAP?» | 3 · 6 | No | Falta (para después) |
| Ciclos de un servicio recurrente | Un ciclo con su handoff, resultados y entrega | 3b | Probablemente | Falta (para después); necesita tu decisión |
| Alertas de cobranza con el mismo ciclo | Nota al cerrar y «vuelve con señal nueva» | — | Sí | Lo decide Finanzas (Alex) |

### Para desplegar (lo haces tú, en orden)

Medido el 10 de octubre: a producción solo le faltan los dos SQL de este plan (`npm run check:esquema`). Todo lo demás de esta lista son pasos tuyos o scripts que corres desde tu PC.

**Antes del deploy**

1. Que cada sesión commitee lo suyo, también estas olas: el árbol tiene unos 600 cambios sin commitear de varias sesiones. Despliega con las dos PCs al día: la ficha pasa al formato 2, y el código viejo, al escribirla, borra `origenPorCampo` y `historia`.
2. `npm run check:esquema`. Tiene que pedir solo los dos SQL del paso 3.
3. Los SQL, en este orden, desde tu PC. Cada uno: `$env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/<archivo>; Remove-Item Env:ALLOW_PROD_WRITE`.
   1. `scripts/sql/2026-10-10-hechos-de-reunion.sql`: la tabla `HechoDeReunion`. Solo necesita el de Tareas, que ya está aplicado. Va aunque la etapa 6 quede apagada, porque el código ya conoce la tabla.
   2. `scripts/sql/2026-10-10-lectura-de-seguimiento.sql`: las 5 columnas `seguimiento*` de `LecturaDeReunion`.
   Después, `npm run check:esquema` en verde. Sin estos dos SQL, `/api/health` responde 503 y el deploy se revierte solo.
   3. Justo después de los SQL, y antes de que nadie regenere un documento: `npx tsx scripts/migrar-reuniones-de-los-documentos.ts` en seco y después con `$env:ALLOW_PROD_WRITE="1"; ... --apply --firma <tu correo>` (pide `pg_dump` o `SIN_RESPALDO=1`). En cada documento con contenido elige las 6 reuniones más recientes que leía con la regla de antes y que tienen algo que leer (el kickoff y las integraciones generados antes del 2026-10-07 no se migran: entonces no leían reuniones), y pasa a sesión lo que el agente de la exploración ya leyó en Meet en clientes y proyectos. El simulacro del 10-oct revisó 81 proyectos activos y 69 documentos con contenido: 85 elecciones en 45 reuniones (36 dejan de reclasificarse) y 3 sesiones nuevas. Una sola ventana, antes del deploy; lo migrado queda anotado y no se vuelve a migrar. Pasos en el RUNBOOK («Migrar las reuniones de los documentos»).
4. Scripts que solo leen, antes de decidir:
   - `npx tsx scripts/comparar-lectura-de-reuniones.ts --max 20` (≈US$1,6): compara las minutas nuevas con las de hoy. Con eso decides si despliegas con la lectura nueva prendida, que es lo recomendado.
   - `npx tsx scripts/medir-contexto-de-documentos.ts` (`--todos`, `--json`): cuántas reuniones alimentan hoy cada documento (cuenta los documentos con alguna reunión que los alimenta; la migración cuenta los que tienen bloques generados, por eso las cifras no coinciden). El 10-oct eran 52 documentos de 32 proyectos, con 1.361 reuniones y ninguna elegida.
   - `npx tsx scripts/backfill-resolved-client.ts` en simulacro: tiene que dar `changed=0`, porque la lectura toma el dueño de `resolvedClientId`.
   - `npx tsx scripts/uso-de-nexus.ts` (opcional): la foto de cómo se usa lo propuesto antes del cambio.
   - Si quieres probar con la base local: `npm run db:local -- up` y `npm run test:int`. Nunca corre contra producción.
5. Las banderas, en el `.env` del VPS. Cambiar una pide `bash scripts/deploy.sh`, que recrea el contenedor:
   - `SEGUIMIENTO_REUNIONES_ENABLED`: vacía = prendida. Es la lectura nueva de cada reunión, durable, que deja los compromisos en Tareas. Con `0` vuelve el post-proceso viejo, que escribe `ActionItem` que ninguna pantalla muestra: úsalo solo como retroceso de emergencia.
   - `SEGUIMIENTO_HECHOS`: solo `1` la prende. Son los hechos, el enrutador, las novedades y su cuenta en «Para ti» y en «Uso de Nexus». Vacía o con otro valor, queda apagada. Déjala apagada hasta correr el sondeo.
6. El deploy: `cd /opt/smartflow/Nexus && bash scripts/deploy.sh`.

**Después del deploy**

7. `npx tsx scripts/encolar-lecturas-pendientes.ts` en seco y después con `--apply` y `ALLOW_PROD_WRITE=1` (pide `pg_dump` o `SIN_RESPALDO=1`). Encola las reuniones frescas que se enriquecieron antes de que existiera la cola: el 10-oct eran 6 de 92. Con `--sesion <id>` relee una que quedó en error.
8. Regenera 2 o 3 handoffs (nunca Wherex) y compáralos con «Versiones». Haz lo mismo con el resumen de 3 proyectos.
9. Prueba una reunión real en la exploración: une una sesión a un evento agendado y mira que, cuando ocurre, se liga sola y el agente la lee.
10. `npx tsx scripts/congelar-handoffs-aplicados.ts` en simulacro. Tú decides: `--apply` congela el grupo A (los que tienen aplicada una propuesta del handoff) y `--tambien-creados` suma el B (el handoff creó el cronograma directo). Wherex queda afuera.
11. `npx tsx scripts/revisar-pedidos-fuera-de-alcance.ts` en simulacro. Tú decides `--asignar`, `--descartar-prospectos` y `--reabrir-los-de-la-ia`. Cada uno pide `--firma <tu correo>` y, para escribir, `--apply` con `ALLOW_PROD_WRITE=1`.
12. `npx tsx scripts/migrar-guia-de-exploracion.ts` en seco y después con `--apply`. Después se pueden retirar `lib/guia-exploracion` y su ruta.
13. En /agents, pasa a Borrador `agent-sales-analysis` y `agent-service-analysis`: su pantalla ya no existe.
14. Para prender la etapa 6: `npx tsx scripts/sondeo-de-hechos.ts --por <tu correo>` (≈US$3,5; con `--solo-elegir` ves la lista sin costo). Con su `resumen.md` decides la variante y el modelo. Después, `SEGUIMIENTO_HECHOS=1` y `bash scripts/deploy.sh`.
15. Si INV45 se pone en rojo: `npx tsx scripts/hechos-fuera-de-su-cliente.ts` en simulacro y, revisado, con `--apply` y `ALLOW_PROD_WRITE=1`.
16. A los días: `npx tsx scripts/uso-de-nexus.ts` (`--dias N`) para ver qué se usa, qué se desestima y qué vence.

De otra sesión, no de este plan: `scripts/migrar-cse-encargado.ts` (la cartera de la CSL), con sus pasos en el RUNBOOK.

**Qué avisar al equipo el día del deploy**

- Los seis documentos del proyecto (kickoff, diagnóstico, planificación, ejecución, integraciones y entrega) leen solo las reuniones elegidas en su «Contexto adicional». Sin elegidas, se generan con la memoria del proyecto y sin transcripciones.
- Lo ya generado no cambia, y cada documento con contenido ya trae elegidas sus 6 reuniones más recientes con el cliente (la migración). Antes de regenerar, revisen esa lista: el panel sugiere las demás y el buscador ofrece las reuniones «Del proyecto».
- La exploración abre en su página de inicio, con sus sesiones. En un cliente o un proyecto nada entra solo: se usa «+ Agregar sesión». Lo que el agente ya había leído pasó a sesión con la migración (desde un mes antes del alta, en las preventas); lo de antes queda en «Fuera de la exploración».
- Los próximos pasos de las reuniones ahora son tareas: se deciden en Tareas, y los «Pendientes recientes» del Resumen salen de ahí. Las acciones viejas ya no se ven.
- Cada reunión tiene su tarjeta «Lo que dejó esta reunión», en su página y en «Para ti»: una sola revisión por reunión.
- La página de una reunión pide acceso al cliente dueño de la reunión.
- El handoff se congela. «Congelar» y «Buscar lo nuevo» los tienen el CSE, la CSL, Ventas y dirección. «Rehacer desde cero» pide un motivo.
- /sessions ya no tiene la pestaña «Análisis».

### Decisiones abiertas

Lo que quedó con un valor por defecto. Cambiar uno, antes del deploy, es corregir texto o una línea de código.

**Etapas 0 y A**
- El «Análisis de ventas» de /sales sigue reescribiendo el prompt de su agente en la base en cada llamada, hasta tu OK.
- El canvas de empresa (`Client.canvas`, `StageNote`, `CanvasSuggestion`) queda DEPRECATED hasta el 2026-12-31, sin DROP.
- La lectura sola de una sesión unida, en proyectos y en preventas de clientes, cobra contra el presupuesto automático: ≈US$0,20–0,35 por sesión, sin medir.
- Las fuentes manuales siguen llegando al Diagnóstico aunque no estén unidas a una sesión.
- Una reunión de puertas adentro elegida a mano cuenta como fuente del cliente; va rotulada [PUERTAS ADENTRO].
- El selector dice «leída al llegar, en la memoria del proyecto» en los proyectos y «leída al llegar» en la preventa.

**Etapa 1**
- Un pedido «Ya estaba incluida» cuenta como usado en «Uso de Nexus».
- «Venció sin revisar» se ve solo en la tarjeta de la reunión, no en las pantallas de cada módulo.
- No se mide quién respondió la etapa: pediría una tabla.
- «Usar todo» toca solo lo que se ve (8 pedidos, 10 tareas) y deja afuera los pedidos de prospectos y los que no tienen proyecto.
- «Uso de Nexus» no tiene pantalla: espera el panel de dirección de «Para ti».

**Etapa 2**
- Las reuniones con dueño Smarteam (cliente INTERNO) dan 404 a un CSE sin acceso a ese cliente: 123 reuniones en 90 días.
- Los proyectos internos y de aliados se quedan sin minuta, porque esas reuniones no se leen: 5 proyectos y 22 minutas en 60 días.
- Una reunión ya leída que cambia de dueño no se vuelve a leer. Sus tareas y pedidos se corrigen a mano, con INV42 e INV46.
- Lo que el cliente promete y frena el plan es solo una marca en la tarea de seguimiento. No avisa en el cronograma.
- Las propuestas vencen, y una reunión deja de ser fresca, a los 14 días.
- La X de «Pendientes recientes» guarda el motivo fijo «Se sacó de los pendientes del proyecto.».
- «Agregar pendiente» crea una tarea tuya sin semana, en «Más adelante».
- Las tareas privadas de otras personas no salen en el Resumen ni en la tarjeta de la reunión, tampoco para dirección.
- Ningún renglón de «Para ti» avisa de una tarea aceptada que ya venció.
- «Uso de Nexus» sigue contando los compromisos viejos de `ActionItem`.

**Etapa 3**
- El handoff no recibe la postura de las personas.
- En lo que va al cliente y al handoff, la memoria deja afuera los acuerdos con montos o negociación. En lo que va al cliente, también las minutas sin revisar.
- Una viñeta de persona con menos de cuatro partes llega al cliente solo con el nombre.
- La ficha ya no toma propuestas de reuniones de puertas adentro.
- La propuesta comercial de un cliente que ya existe no lee los procesos validados.
- Recortes por lector: la entrega, sin desviaciones ni historia; integraciones, sin desviaciones ni resultados; el correo, solo la ficha.
- Lo que la preventa propone al preparar queda en la ficha aunque el vendedor lo descarte en el lienzo: lo saca el CSE.
- A0 entra en toda empresa que no es prospecto, también aliados e internas.
- El avance y el resumen del proyecto ya no leen transcripciones de reuniones viejas sin minuta.
- El pase de cuenta manda una línea de conteos, porque el aviso se corta a 280 caracteres. Falta decidir un segundo aviso o una vista.
- El vigía lee la memoria desde el 10-oct: como mucho unos 9.000 caracteres más por proyecto en cada corrida.

**Etapa 3b**
- La primera generación del handoff, cuando crea el cronograma directo, no congela.
- «Buscar lo nuevo» no lee HubSpot.
- El CSE pide sugerencias, pero no las usa ni las descarta: eso es editar el handoff.
- Dev y Marketing no ven «Congelar» ni «Buscar lo nuevo». Se les prende desde /team.
- Los handoffs que ya existen siguen sin congelar hasta que corras el script.

**Etapas 5 y 6**
- La lectura de hechos va aparte, con caché, con Sonnet 4.6, hasta que decidas con el sondeo.
- Un prospecto sin preventa viva recibe propuestas a la ficha desde los hechos.
- Si la lectura de hechos falla, el avance, la ficha y la etapa corren por el camino de siempre. Si después el reintento la lee, puede proponerlos dos veces.
- Al prender la bandera no se releen las reuniones de antes: no hay barrido inicial.
- «Usar todo» da por usadas las novedades que puedes decidir; el documento no cambia.
- Al aplicar un acuerdo del chat, quedan usadas todas las novedades de los mensajes desde el último acuerdo aplicado.
- Una queja sacada de las notas de Gemini, o con un hablante dudoso, va como evidencia al vigía y no levanta alerta.
- Que un acuerdo reemplaza a otro lo marca la persona al usar la novedad. No hay pantalla de acuerdos vigentes.
- El canal al cronograma del compromiso que frena el plan no está construido.

**Etapa 7**
- Resuelto por la migración del 10-oct (`scripts/migrar-reuniones-de-los-documentos.ts`, DECISIONS «La migración (2026-10-10)»): los documentos con contenido quedan con sus 6 reuniones más recientes con algo que leer elegidas (las que leían con la regla de antes, solo donde nadie decidió; el kickoff y las integraciones de antes del 2026-10-07 no, porque no leían reuniones) y el panel sugiere desde el día del deploy las demás reuniones con el cliente del proyecto («Reunión con el cliente en este proyecto», las 8 más recientes), también en proyectos nuevos. Ya no hace falta esperar.
- Sigue abierta, sin frenar el deploy: que la memoria para el cliente lea también los acuerdos y las decisiones de las minutas en borrador (cuenta para lo que nadie eligió). El 10-oct había 4 minutas revisadas y 689 en borrador.
- Pendiente de Elías: el candado de una reunión migrada la congela entera, no solo el vínculo (el clasificador ya no la reasigna a un proyecto nuevo del cliente). El simulacro del 10-oct: 36 reuniones. Por eso son solo 6 por documento; la otra opción es correr antes el reclasificador de los clientes con proyectos nuevos.
- Decidido (Elías, 10-oct): el kickoff y las integraciones de antes del 2026-10-07 no se migran, porque no leían reuniones. Se quedan con el handoff y las sugerencias.
- Decidido (Elías, 10-oct): la X sobre una elegida la devuelve a `null` y reaparece como sugerencia. Para que no vuelva se usa «Descartar».
- La entrega sin elegidas deja vacía la sección de impacto. Hoy solo se avisa; la otra opción es sacar el impacto de las cifras de las minutas revisadas.
- Se acepta que la generación no revise lo que escribe: no hay «red tras generar».
- Topes de lectura entera: 160.000 caracteres en total, 60.000 por reunión y 6 enteras. Las siguientes van en resumen (2.000 cada una) dentro del total, y pasadas las 24 no entra ninguna.
- «Descartar» una sugerencia no es para siempre: si el clasificador rehace el vínculo, puede volver.
- «Mejorar con IA» del diagnóstico lee las elegidas en resumen y sin búsqueda web.

**Otras**
- La fusión de dos fichas no muda la foto semanal de Tareas (`ResultadoDeSemana.fotoCliente`).
- Al fusionar, la clasificación de la cartera conserva la de la ficha que sigue y toma de la otra lo que no tiene confirmado.
- Una persona nombrada como fuente («según Ronald») no se marca con «⚠ revisa».
- En «Uso de Nexus», una sugerencia del handoff que ya no está en el documento cuenta como desestimada, aunque la haya reemplazado otra búsqueda. Una novedad de un documento todavía vacío cuenta como pendiente.
- Las áreas de la tabla de arriba marcadas «Falta tu decisión».

---

## 1. Lo que encontramos

### 1.1 Quién lee reuniones hoy

| Grupo | Cuántos lectores | Qué leen | Lo importante |
|---|---|---|---|
| **Al llegar una reunión de Meet** (automático) | 7: resumen IA, post-proceso, clasificador, avance, ficha, etapa, preventa | La misma reunión, cada uno por su cuenta | Una reunión dispara hasta **7 llamadas**. Cuatro leen la transcripción (resumen IA 60k, post-proceso 60k, clasificador 30k, preventa hasta 60k). Tres leen el resumen de Gemini (avance, ficha, etapa) |
| **Documentos del proyecto** (a pedido) | 13: handoff, kickoff, diagnóstico, planificación, ejecución, integraciones, entrega, exploración y los cuatro del cronograma, más el resumen del proyecto | Las reuniones de su «Contexto adicional» | Ninguno lee la reunión entera. Casi todos leen el resumen de Gemini y **ninguno lee la minuta** |
| **Tareas internas** (en el árbol) | 1 | Las reuniones de la persona, también las de cliente (`app/api/tareas/leer-reunion/route.ts:1-7`) | Ya tiene la tabla `LecturaDeReunion`: «cada reunión se lee UNA vez» (`prisma/schema.prisma:6641-6694`) |
| **Cuenta, Éxito del cliente y otros módulos** | Unos 15 | Cada uno con su propio corte de «las más recientes» | Dos se saltan el chokepoint del todo y uno a medias |
| **Rutas vivas sin pantalla** | 4 | — | Nadie las llama |

**Qué lee de verdad un documento.** Casi todos usan `fetchTranscriptContent` (`lib/sessions/transcript.ts:15-90`):
- Arma la reunión con las notas de Gemini (hasta unos 4.900 caracteres priorizados).
- Usa la transcripción solo si el resumen tiene menos de 1.500 caracteres, y entonces toma los primeros 5.000 (`transcript.ts:56-79`).
- No lee la minuta de Nexus: su consulta trae solo `summary`, `transcript` y `title` (`transcript.ts:24-27`).

**Defectos de la cadena automática** (los verifiqué en el código):

| Defecto | Dónde |
|---|---|
| El post-proceso vuelve a calcular de quién es la reunión, sin la guarda de nombres ambiguos ni el mapa de HubSpot (pasa `hubspotCompaniesByDomain: new Map()`). Choca con el invariante 1: la fuente única del dueño es `resolvedClientId` | `lib/sessions/post-process.ts:116-142` (`:131`); los campos opcionales en `lib/sessions/categorize.ts:40-60` |
| No mira qué tipo de empresa es. En un prospecto crea minuta, acciones, pedidos fuera de alcance (sin nada vendido contra qué compararlos) y propuesta de ficha; después la preventa vuelve a leer la reunión entera | `post-process.ts:118-121`; `lib/exploraciones/agente.ts:1015-1035` |
| Se dispara sin esperar resultado, en dos pasadas de hasta 120 reuniones cada una, y si falla nadie lo reintenta | `lib/google/meet-enrichment.ts:56`, `:403-407`, `:498`, `:515` |
| Lee el JSON con una regex, con `max_tokens` de 6000 | `post-process.ts:266`, `:281-290` |
| Guarda los compromisos y los pedidos fuera de alcance con la cita sin verificar | `lib/sessions/compromisos-y-alcance.ts:63-104` |
| En una reunión de dos proyectos, solo el principal recibe avance y etapa | `post-process.ts:159-160`, `:456`, `:501` |
| El avance vuelve a leer las 12 últimas reuniones del proyecto con cada reunión nueva. No mirar lo elegido es a propósito, según su comentario | `lib/sessions/project-sessions.ts:48-57` |
| La llamada del avance no queda registrada a nombre de ningún agente (le falta `conContextoDeIA`) | `lib/timeline/regenerate-progress.ts:358` |
| Una reunión con solo notas de Gemini **ni siquiera se vincula a su proyecto**. La sincronización de Meet le pone dueño con `resolveSessionClientId` y no reclasifica, y el clasificador al llegar corre solo dentro del post-proceso, que exige transcripción. `reResolveSession` sí reclasifica al cambiar el dueño, pero la sincronización no pasa por ahí | `lib/google/meet-sync.ts:31`; `post-process.ts:159`; `lib/sessions/resolve-client.ts:131-137` |
| Reuniones que nunca pasan por el post-proceso: las que tienen solo notas, las de más de 14 días, las grabadas en HubSpot y las que no tienen dueño | `post-process.ts:96`, `:143-149`; `meet-enrichment.ts:61`, `:401` |

Consecuencia del penúltimo: el 21 % de las reuniones con cliente (las de solo notas) no llega al resumen, al vigía, al avance ni a ningún «Contexto adicional».

**Lectores que se saltan el chokepoint** (invariante 1):
- **Resumen del proyecto.** Lee 12 reuniones sin `included` ni `belongsToClient`, así que entran también las que una persona sacó (`lib/projects/project-brief.ts:81`, `:94-101`).
- **Análisis de ventas.** Solo pide sesión iniciada, no comprueba de quién es la reunión (`app/api/sales/analyze/route.ts:70`, `:108`).
- **Vigía del proyecto, a medias.** Ya filtra `included: true` (`lib/cs/watchdog-context.ts:198-201`); le falta `belongsToClient`.

**La propuesta comercial tiene su regla propia, y está bien.** Su suplemento por dominio admite reuniones sin dueño de un prospecto todavía no resuelto, nunca las de otro cliente (`lib/business-cases/feeding.ts:84-92`). Cumple el invariante 1. Pasarla por `getClientSessions` perdería esas reuniones. Hay que documentarla, no cambiarla.

**Una lectura que se paga y se tira.** Para el kickoff y el detalle del cronograma, `/analyze` arma igual el contexto general: tratos, línea de tiempo de HubSpot y 12 reuniones leídas (`app/api/clients/[id]/analyze/route.ts:1157`, `:1285`, `:1333-1389`). Después reemplaza el mensaje entero (`:1975`, `:2055`). No gasta tokens del modelo, pero sí llamadas a HubSpot y a la base.

### 1.2 Cuánto cuesta (medido en `LlmCall`, últimos 30 días, producción)

| Lector | US$ / mes | Por reunión |
|---|---|---|
| Post-proceso | 15,12 | ≈0,080 |
| Clasificador | 5,74 | ≈0,025 |
| Avance del cronograma (atribuido por cercanía en el tiempo: no lleva nombre) | ≈6,34 | ≈0,065 |
| Ficha · etapa · resumen IA | 0,59 · 0,08 · ≈0,52 | — |
| **Cadena automática por reunión** | **≈28,39** | **≈0,15** |
| Preventa (preparar, leer, guía, búsqueda web) | 16,09 | casi todo con persona |
| Procesos (Opus) | 13,86 | con persona |
| Documentos · cronograma · handoffs · vigía | 2,51 · 1,97 · 1,46 · 1,31 | — |
| Otros (sin nombre de agente o no listados) | ≈8,60 | — |
| **Total de IA** | **74,19** | — |

- `LlmCall` empieza el 18 de agosto, y el 38 % de las llamadas no tiene nombre de agente.
- **Por reunión, leer una vez cuesta poco** (≈US$0,15). El post-proceso es la línea automática más cara, y es la que se queda.
- **Lo que sobra son las relecturas**: el avance relee 12 reuniones por cada reunión nueva. En el total del mes pesa más lo que se pide a mano (preventa y procesos con Opus).
- Los costos que salieron de los topes del código (0,23 a 0,30 por reunión) quedaron por arriba de lo medido. Me quedo con lo medido.

### 1.3 Qué memoria existe y qué falta

**Existe pero casi no se usa:**
- **Ficha del cliente** (`Client.ficha`).
  - La leen solo el diagnóstico (`lib/canvas/diagnostico-fuentes.ts:82`), la planificación (`lib/canvas/planificacion-generate.ts:138`), la exploración del proyecto (`lib/exploraciones/fuentes-del-proyecto.ts:53-61`) y la propuesta de resultados (`lib/handoff/proponer-resultados.ts:62`).
  - El handoff la **escribe** (`analyze/route.ts:3272-3276`) pero no la lee. En su lugar recibe el canvas viejo vacío, presentado como «conocimiento validado» (`analyze/route.ts:1647`, `:1903-1905`).
  - `fichaParaPrompt` devuelve vacío si la ficha no está confirmada (`lib/clients/ficha.ts:568-569`).
- **Resumen del proyecto** (`ProjectBrief`). Está en 22 de 79 proyectos activos y solo lo muestra la pantalla (`app/api/projects/[projectId]/gps/route.ts:446`). Se regenera entero cada vez.
- **Resumen de la cuenta** (`CsAccountBrief`). Solo pantalla (`lib/cs/load-account.ts:185`).
- **Minuta** (`SessionMinute`). La leen 4 lectores: el material del cronograma (`lib/contexto/cargar.ts:348`), el vigía, la cuenta y su resumen. Ningún documento.
- **Resultados medibles** (`Project.handoffResultados`). Están en 3 de 79 proyectos.

**Ya hay dos lecturas por reunión que guardan lo leído:**
- **Procesos.** Guarda la lectura de cada reunión en un `AgentRun` `procesos-lectura`, con citas verificadas, y al volver a mapear solo lee las nuevas (`lib/procesos/agente.ts:8-16`).
- **Tareas** (en el árbol). `LecturaDeReunion` ya tiene `sessionId` opcional, texto pegado, estados (`en_espera | leyendo | lista | sin_texto | copia | error | sin_ia`), reintentos, «colgada» a los 10 minutos, gemelas (`copiaDeId`) y huella del texto (`prisma/schema.prisma:6641-6694`).

**Está muerto, pero sigue entrando al prompt:**
- `Client.canvas`, `ClientContextCard` («CANVAS DEL PROYECTO … PRIORIDAD MÁXIMA», `analyze/route.ts:1650-1685`, `:1907-1910`) y `StageNote` (`analyze/route.ts:698`).
- La orden «PRIORIDAD DEL CANVAS» se agrega a todo agente que no sea el detalle del cronograma, también al kickoff, que no trae ninguna sección de canvas (`analyze/route.ts:1602-1607`).

**La misma información vive en muchos lugares:**
- Personas: 6 lugares.
- Resultados: 7.
- Dolor: 6.
- Compromisos: 6.
- El resumen de una misma reunión: hasta 5.

**Lo que un consultor estratégico necesita y no está en ningún lado:**
- Un estado de la cuenta que lean los agentes.
- La escala de la cuenta, junta y con su historia.
- Un plan de cuenta.
- Los acuerdos y decisiones vigentes, juntos.
- Un mapa de personas que se actualice.
- El valor entregado a lo largo del tiempo.
- Lo que pasa en reuniones de HubSpot, en correos y en notas pegadas a mano.
- Lo que aprendió la preventa: solo llega a la ficha desde una exploración de proyecto (`app/api/sales/exploraciones/[id]/route.ts:87`).

### 1.4 Artefactos que leen de más o de menos

| Artefacto | Lee de más | Le falta |
|---|---|---|
| Handoff | El canvas vacío, `ClientContextCard` y una base de conocimiento genérica | La ficha confirmada |
| Kickoff | El armado que se tira, y la orden «PRIORIDAD DEL CANVAS» sin canvas. Por defecto, también las llamadas de venta, con precios (lo prohíbe en su mensaje, `analyze/route.ts:1964`) | Las personas de la ficha y los acuerdos posteriores a la venta |
| Diagnóstico y planificación | Las llamadas de venta, por el default «sugerido» | El diagnóstico no tiene ninguna regla de no usar precios: ni en `components/landing/configs/diagnostico.defs.ts:539-548` ni en `lib/canvas/diagnostico-fuentes.ts:99`, que llama a las reuniones «la fuente principal». No verifiqué el prompt guardado en la base |
| Ejecución, integraciones y entrega | — | La ficha. Integraciones, además, los procesos y la planificación |
| Avance del cronograma | 12 reuniones por cada reunión nueva | La lectura que ya hizo el post-proceso |
| Resumen del proyecto | Reuniones que una persona sacó | Minutas, compromisos abiertos y la ficha |
| Correo de seguimiento | Vuelve a sacar «lo que acordamos» | La minuta y los compromisos. Sus entradas están limitadas por un censo (`insumosDelCorreo`, puerta `correo-al-cliente` en `lib/exploraciones/lectores.test.ts`) |
| Preventa: Resumen, La escala y Propuesta | Muestran reuniones que ningún agente lee (`components/exploraciones/LienzoDeExploracion.tsx:487-491`) | Si la empresa ya es cliente, la ficha (`lib/exploraciones/fuentes.ts:308`) |
| Preventa: Casos de uso | La lista de reuniones, que su agente no lee | — Sus instrucciones **sí** las lee el agente (`LienzoDeExploracion.tsx:60-64`; `agente.ts:512`): se quedan |
| Exploración del proyecto | Hasta 30 reuniones sugeridas (`fuentes-del-proyecto.ts:97-109`). Cada reunión suelta se vuelve su propia pestaña (`lib/exploraciones/guia.ts:186-203`) | — |

### 1.5 Números de producción (consultas de solo lectura, 9-oct)

| Dato | Valor |
|---|---|
| Reuniones con cliente en 90 días | 1.252 (≈417 por mes). Con transcripción: 45 %. Solo notas de Gemini: 21 %. Sin nada: 34 % |
| Largo de la transcripción | promedio 40.292 caracteres. El 13 % pasa de 60.000 y el post-proceso la corta ahí |
| Minutas | 533 de 568 reuniones con transcripción (94 %). **Revisadas: 2** |
| Acciones | 2.066 del post-proceso, **98 % abiertas**. 263 compromisos, todos abiertos. Medido de nuevo el 9-oct, sin fecha de corte: **3.994 vivas, 46 tocadas por una persona (1 %)**, 550 creadas en los últimos 30 días, 589 sin proyecto. Por lado: 169 de Smarteam, 94 del cliente y 3.731 sin lado (las anteriores al campo) |
| Pedidos fuera de alcance | 50, **33 sin revisar**. Medido con la versión en producción, donde el estado lo escribía el modelo; en el árbol, el post-proceso ya escribe siempre `"PEDIDO"` y no pisa una decisión del CSE (`git diff lib/sessions/post-process.ts`). **10 sin proyecto y 3 en prospectos** (9-oct) |
| Ficha del cliente | 21 de 168 clientes tienen algo. **2 confirmadas**. 21 propuestas sin confirmar |
| Proyectos activos | 79. Con handoff, 53. Con resumen del proyecto, 22. Con resultados, 3 |
| Reuniones por proyecto | promedio 21,8, máximo 93 (DISTELSA). **Noelito: 45** |
| Columnas `*Override` | **7 de 9 sin una sola fila tocada**. El handoff es la única con uso real (62 proyectos). Ojo: cuatro de esas siete nacieron el 2026-10-07 (`lib/sessions/destinos-de-contexto.ts:25-26`), así que no prueba que nadie las use |
| Instrucciones adicionales | 5 canvas, todos de cronograma |

---

## 2. Qué es de la cuenta, qué es de cada proyecto y qué se guarda de cada reunión

**La regla:** si el dato seguiría siendo cierto en otro proyecto, es de la cuenta. Cada dato vive en un solo nivel. Lo que nace en el proyecto se resume hacia la cuenta, como ya hacen los resultados con `resultadosQuePersigue` (`lib/clients/ficha.ts:58-68`).

| Tema | Memoria de la CUENTA (fuente única) | Memoria de cada PROYECTO |
|---|---|---|
| Quién es y a qué se dedica | Ficha: a qué se dedica, herramientas, estructura | — |
| Personas | Ficha › stakeholders (quién es quién, quién decide, cambios de interlocutor) | Quién participa en este proyecto (kickoff › equipo) |
| Qué quiere lograr | Ficha › resultados de negocio (resumen de los proyectos) | Resultados medibles del handoff, objetivos del diagnóstico, métricas del kickoff |
| Qué le duele | Ficha › dolor y retos | El desafío de este alcance (diagnóstico) |
| Cómo trabaja | Procesos de hoy (mapas) | Cómo va a funcionar (planificación) |
| Escala | La escala de la cuenta, con su historia (hoy no existe) | El nivel que se estimó en la preventa o la exploración |
| Relación | Satisfacción, quejas, alertas, clasificación, uso y licencias | Salud del proyecto, desviaciones |
| Oportunidades | Ficha › oportunidades, TAM. Los pedidos fuera de alcance de todos sus proyectos se siguen acá («Fuera de alcance» de La cuenta) | **Fuera de alcance nace en un proyecto**: se compara contra lo que se vendió en ESE proyecto y lleva su `projectId` |
| Lo vendido | — | **El handoff: la foto fija de lo vendido**, congelada (decisión 2) |
| Acuerdos y decisiones | — | Acuerdos y decisiones vigentes, juntos (hoy solo minuta por minuta) |
| Próximos pasos | — | Tareas del módulo de Tareas, por CSE (decisión 7; `ActionItem` se retira) |
| Avance | — | Cronograma, avance, desviaciones, compromisos abiertos |
| Historia | Proyectos anteriores y su última entrega (`lib/canvas/load-canvas-context.ts:79-141`) | Versiones e hitos de cada documento |

**Interna o para el cliente.** La ficha ya marca qué campo puede ver el cliente y con qué recorte (`lib/clients/ficha.ts:128-139`: de los stakeholders, «solo nombre, cargo y papel; NUNCA la postura»). La memoria tiene que salir en dos versiones: completa para los agentes internos y recortada para los documentos que ve el cliente.

**Un próximo paso, un solo destino: Tareas** (decisión 7). `ActionItem` es una acción del proyecto (los «Pendientes» del Resumen, «Para ti», la página de la reunión y el vigía), no del cronograma, y no se usa: de 3.994 vivas, una persona tocó 46. Se deja de crear y los próximos pasos pasan al módulo de Tareas:
- **Lo que se comprometió Smarteam** → propuesta de `Tarea` para quien la dijo; si es del cliente pero sin dueño claro, para el CSE del proyecto.
- **Lo que se comprometió el cliente** → propuesta de `Tarea` de seguimiento para el CSE («Recordarle a Ana el acceso a SAP»), con la cita. Si además frena el plan, el avance lo propone como tarea del cliente en el cronograma, que es el destino que ya existe para un insumo del cliente.
- **Lo que ya existe** queda como histórico, marcado `DEPRECATED`, sin DROP y sin borrar nada.

Esto adelanta la fase 3 del plan de Tareas (`docs/tareas-plan.md:1329`), que dejaba `ActionItem` para los compromisos del cliente. Va en DECISIONS antes de tocar las salidas del post-proceso, y en el recorrido de Tareas con pasos para el CSE.

**Según qué empresa es la reunión:**

| Empresa | Qué hace la lectura |
|---|---|
| Cliente | Todo lo de esta sección |
| Prospecto | Minuta y hechos de la cuenta. **Sin fuera de alcance**: no hay nada vendido. La preventa sigue leyendo la reunión entera como memoria propia de su artefacto. Lo que se aprende (Preparación, Resumen) se guarda en la empresa desde el primer día (decisión 8) |
| Aliado | No la lee |
| Interna (100 % Smarteam, nunca se atribuye a un cliente, `lib/sessions/categorize.ts:14`) | No la lee la lectura de seguimiento; la lee Tareas. Una interna vinculada a mano llega como [PUERTAS ADENTRO] y nunca alimenta lo que ve el cliente |

**Qué se guarda de cada reunión:**

| Se guarda | Dónde |
|---|---|
| Cómo va la lectura (en espera, leyendo, lista, sin texto, error) | `LecturaDeReunion`, compartida con Tareas (en el árbol). No una tabla nueva |
| La minuta (resumen, acuerdos, decisiones, riesgos) | `SessionMinute`, como hoy |
| Compromisos del cliente, con la cita verificada | Propuesta de `Tarea` de seguimiento para el CSE |
| Compromisos de Smarteam | Propuesta de `Tarea` para quien se comprometió |
| Pedidos fuera de alcance, con la cita verificada | `PedidoFueraDeAlcance` |
| **Los hechos**: una frase, a quién pertenece (cuenta o proyecto), su tipo, su cita literal y su estado (abierto, aplicado, no aplica) | Nuevo: `HechoDeReunion` |

**Lo que deja de guardarse aparte:**
- La ficha y la etapa ya no vuelven a leer la reunión: salen de los hechos.
- Las novedades para los documentos no se guardan: se calculan al mostrarlas. Lo que una persona decidió se guarda en el estado del propio hecho, sin otra tabla.

### 2.1 Cómo se arma el contexto general (decisión 3)

**La idea en una línea:** cada reunión se lee una sola vez, al llegar, y lo que deja se guarda en la memoria. Ninguna pieza vuelve a leer «todas las reuniones»: cada una lee la memoria más lo poco que eligió.

**Lo que lee cualquier agente, sin que nadie elija nada:**
1. **La memoria de la cuenta:** la ficha (confirmado y propuesto, cada dato con su fuente), los procesos, la historia de los proyectos, lo fuera de alcance y lo aprendido en la preventa.
2. **La memoria del proyecto:** el handoff congelado, los resultados, el cronograma y su avance, y lo que dejó cada reunión al llegar (minuta, acuerdos, compromisos abiertos y, más adelante, los hechos).

**Lo que elige cada pieza (su foco):**
- **Exploración:** sus sesiones, leídas enteras contra su guía, más sus fuentes manuales e instrucciones. Se configuran en la página de inicio de la exploración (diseño v13). Ya no hay una lista general de reuniones: las demás están en la memoria.
- **Casos de uso y La escala:** no leen reuniones; leen el lienzo y la memoria.
- **Documentos del proyecto** (kickoff, diagnóstico, planificación, ejecución, integraciones, entrega): la memoria más las reuniones que se elijan, leídas enteras. Nexus sugiere cuáles (etapa 7).
- **Cronograma:** como hoy, solo las elegidas.

**Para que sirva en partes nuevas de Nexus, el circuito tiene cinco piezas, cada una en un solo lugar:**

| Pieza | Qué hace | Para sumar algo nuevo |
|---|---|---|
| **Una entrada** | Cada fuente (Meet hoy; HubSpot, correos y notas pegadas después) entra por su adaptador a la misma cola, `LecturaDeReunion` | Un adaptador nuevo, sin tocar lo demás |
| **Una salida estándar** | La lectura devuelve siempre lo mismo: minuta, compromisos, pedidos, señales y hechos con su cita verificada | Nada: la salida es la misma para todas las fuentes |
| **Un registro de destinos** | Cada módulo declara qué tipos de hecho le sirven y dónde los muestra. El código reparte; el modelo solo clasifica | El módulo nuevo se suma al registro, con un test que lo congela |
| **Un solo cargador de memoria** | `memoriaDeLaCuenta` y `memoriaDelProyecto`, en versión interna y en versión para el cliente | El agente nuevo llama al cargador; no arma su propio contexto |
| **Un ciclo de vida de lo propuesto** | Todo lo que propone Nexus queda pendiente, usado, desestimado o vencido, con quién y cuándo. De ahí sale «Uso de Nexus» | Cualquier propuesta nueva usa los mismos cuatro estados |

Es la misma regla de DECISIONS («un clasificador sobre una pasada que ya existe»), llevada a todas las fuentes y a todos los módulos.

---

## 3. Las tres capas, validadas

### Capa 1 · Memoria de la cuenta: se sostiene, con cuatro correcciones

1. **El handoff no es memoria de la cuenta.** Es la foto fija de lo vendido en *un* proyecto. Además, hoy no es fijo:
   - Se regenera cuando se aprieta el botón, y su salida también propone las fases del cronograma (`lib/contexto/cargar.ts:254`; `analyze/route.ts:2709`).
   - Sus bloques nacen confirmados (`analyze/route.ts:2650-2656`), así que no hay un momento de «confirmar».
   - Tiene a propósito un bloque «después del cierre» alimentado por reuniones posteriores (`analyze/route.ts:1373-1378`).
   Para que sea una foto fija hay que congelarlo en un momento que siempre exista (decisión 2).
2. **«La lee todo» no aplica a lo que ve el cliente.** Los documentos publicables reciben solo la versión recortada.
3. **El resumen vivo existe (`ProjectBrief`), pero no sirve como memoria así como está.** Nadie lo lee, se rehace entero y vuelve a leer 12 reuniones. Tiene que armarse con lo ya leído (minutas primero, hechos después) y lo tienen que leer los agentes.
4. **Conectar lectores a la ficha da poco mientras siga vacía.** Hoy hay 2 confirmadas. Leer lo propuesto ayuda, pero tiene una trampa: el handoff propone a la ficha (`analyze/route.ts:3272-3276`) y la propuesta se acumula (`ficha.ts:392-393`). Si el handoff lee lo propuesto, en la regeneración siguiente lee lo que él mismo inventó (decisión 4).

### Capa 2 · Lectura de cada reunión una vez: se sostiene, y ya existe

- Es el post-proceso. La regla ya decía «UN clasificador sobre una pasada que ya existe, NUNCA N agentes por destino» (`docs/DECISIONS.md:118-120`). Lo que está mal es que esa línea nombra al agente de avance como esa pasada. Hay que corregir DECISIONS antes del código, como pide ARCHITECTURE §11.
- **No hace falta otra tabla.** Tareas ya armó `LecturaDeReunion` para leer cada reunión una vez (en el árbol). Como `sessionId` es único, la lectura de seguimiento y la de Tareas tienen que ser la misma fila: una sola pasada con dos salidas, que es justo lo que decidió la fase 3 de Tareas.
- **El cuello de botella es la revisión.** Si la capa 2 suma propuestas sin juntarlas, se repite lo de las minutas, las acciones y la ficha. Por eso la tarjeta única por reunión va antes que los hechos.
- **Procesos ya lee cada reunión con citas verificadas** (`lib/procesos/agente.ts:8-16`). O los hechos de tipo «cómo trabajan hoy» lo alimentan, o se escribe por qué procesos necesita su propia lectura.
- Antes de apoyarse en el post-proceso hay que arreglar sus defectos (sección 1.1).

### Capa 3 · Memoria propia de cada artefacto: se sostiene en dos niveles

- **Foco:** las reuniones elegidas, leídas enteras, con tope. Hoy ningún documento lee entero. Una transcripción promedio son unos 12.500 tokens, así que cuatro elegidas suman unos US$0,15 por generación. Es razonable porque se genera a mano (los documentos gastaron US$2,51 en el mes).
- **Contexto:** el resto llega por la memoria (minutas y hechos), nunca como transcripción.
- Es el mismo modelo que ya se decidió para la exploración (diseño v13: las sesiones se leen enteras; lo demás llega por la memoria).
- **Primero la frontera.** Una transcripción entera trae precios y lo dicho puertas adentro. `FRONTERA_DEL_MATERIAL` solo se usa en el material del cronograma (`lib/contexto/material-cronograma.ts:112`, `:854-881`, `:1473`). Sin esa regla en los documentos, leer entero empeora el riesgo.
- **El prellenado no puede escribir `true`.** `isLockedLink` trata `…Override === true` como un candado humano: el clasificador ya no toca ese vínculo (`lib/sessions/session-project-locks.ts:56-71`). El panel lo rotula «agregada a mano» (`destinos-de-contexto.ts:163`). Lo que propone la lectura tiene que ser una sugerencia calculada.
- **El modo sugerido tiene su razón escrita:** si el diagnóstico arranca vacío, sale sin reuniones cada vez que alguien se olvida de elegir (`destinos-de-contexto.ts:18-22`). Pasar a «solo las elegidas» exige responder eso en DECISIONS.
- **«Contexto adicional» solo donde un agente lo usa:** sí. En la preventa, Resumen, La escala y Propuesta muestran reuniones que nadie lee.
- El avance no usa lo elegido a propósito (`project-sessions.ts:49-54`). Con la capa 2 deja de necesitar las 12: le alcanza con la reunión nueva y lo ya leído.

---

## 4. Cómo cada reunión dice qué conviene actualizar (el enrutador)

**El circuito:**
1. La reunión llega y queda en la cola (`LecturaDeReunion`).
2. Una sola lectura saca la minuta, los compromisos, los pedidos y dos señales (cronograma y etapa).
3. Los **hechos** salen en una llamada aparte, o en la misma guardando lo que llegó completo. Así, si la respuesta se corta, no se pierde la minuta. Cada hecho trae su cita literal.
4. El código verifica las citas y descarta lo que no aparece en el texto.
5. El código reparte: el modelo clasifica, **el código rutea**, según el tipo de empresa (sección 2).

| Tipo de hecho | Va a | Quién actúa | Cómo se aplica |
|---|---|---|---|
| Dato de la cuenta (herramienta, estructura, reto) | Propuesta a la ficha | CSE confirma | Con su confirmación propia: confirmar escribe en HubSpot (`lib/clients/ficha-hubspot.ts:11-13`) |
| Persona | Ficha › stakeholders (cuenta) o kickoff › equipo (proyecto) | CSE | Propuesta o novedad. Con la guarda que descarta al equipo de Smarteam |
| Queja o riesgo | La queja verificada la levanta la lectura como `CsAlert` QUEJA (un detector más); el riesgo va como evidencia con cita al vigía, que decide si lo levanta | CSL o CSE | Un solo sistema, tres detectores (decisión 5). Enmienda la entrega 2 de la cartera (`docs/exito-del-cliente-cartera-plan.md:62-68`), que se la daba solo al vigía |
| Cómo trabajan hoy | Procesos: «vuelve a mapear» | CSE | El agente de procesos ya lee solo lo nuevo (`lib/procesos/agente.ts:12-13`) |
| Decisión (pipeline, propiedades, integración…) | Novedad en planificación o integraciones, en la sección que corresponde (nunca ejecución: sus pipelines y propiedades se retiraron el 2-oct) | CSE | Con el chat de la sección |
| Alcance acordado | Novedad en kickoff › alcance, diagnóstico › alcance acordado o integraciones › requerimiento. **Nunca el handoff** | CSE | Chat; si es un pedido nuevo, va a fuera de alcance |
| Resultado o métrica | Diagnóstico › objetivos y kickoff › métricas. Nunca el handoff ni la ficha: «Resultados que persigue» sale de los resultados confirmados de cada proyecto | CSE | Novedad |
| Compromiso de Smarteam | Propuesta de `Tarea` | La persona | Como en Tareas |
| Compromiso del cliente | Propuesta de `Tarea` de seguimiento para el CSE, con la marca «frena el plan» si aplica (etapa 2); la tarea del cliente en el cronograma, desde la etapa 6 | CSE | Como en Tareas; el cronograma, por su propuesta |
| Señal de cronograma | Avance de cada proyecto vinculado que cumple `linkFeedsAvance` (incluida y principal, o secundaria con confianza de 0,4 o más). Corregido: la política del handoff (`linkFeedsHandoff`) filtra por relevancia de venta y dejaría afuera las reuniones de implementación | CSE aplica | El avance corre **solo con señal** |
| Señal de etapa | Encuesta de la etapa | CSE | Solo por la encuesta: «Nexus escribe la etapa SOLO por la encuesta» (`docs/DECISIONS.md:5680`) |

**Una novedad no se guarda: se calcula** a partir de los hechos abiertos, la tabla de ruteo y los documentos que ya tienen contenido (`lib/pieces/piece-content.ts:69`). Se ofrece con tres acciones:
- «Cambiar con el chat» (`components/asistente/chat-de-seccion.tsx:68`, `:103`).
- «Sumar la reunión al contexto del documento», como sugerencia (nunca escribiendo `true` en la columna).
- «No aplica».

**Reglas de la revisión:**
- «Usar todo» **nunca** incluye la ficha ni la etapa: las dos escriben en HubSpot o tienen su propia puerta.
- Lo que nadie revisa vence a los 30 días.
- **Cada documento publica distinto, y hay que decirlo antes de ofrecer novedades.** Kickoff y cronograma congelan lo que ve el cliente al «Subir» (ARCHITECTURE §1-WEB.7). Integraciones se lee **vivo**: «NO hay staging» (`lib/external/desarrollo-view.ts:14-16`), así que aplicar una novedad ahí es publicarla. No verifiqué cómo publican diagnóstico, planificación y entrega.
- **El chat de los documentos no pasa por el detector de frontera.** `lib/asistente/turno.ts:1204` y `:1212` aplican `lineasConFrontera` solo con `esCronograma`. Hay que sumarlo antes de ofrecer «Cambiar con el chat».

**Ejemplos reales.** Lo que sigue sobre el contenido de las reuniones es ilustrativo; no leí esas transcripciones.

- **Ferretería Noelito (proyecto, exploración con marco cs).**
  - *Hoy:* el proyecto tiene 45 reuniones vinculadas. La exploración arranca con hasta 30 sugeridas, y el riel convierte cada reunión suelta en su propia pestaña (`guia.ts:186-203`). Así salen «sesiones» que no son de la exploración.
  - *Con el enrutador:* una reunión de implementación llega, se lee una vez y deja sus hechos. Si se acordó un cambio en un pipeline, aparece una novedad en planificación › pipelines y en ejecución › pipelines. Esa reunión **no entra** a la exploración. Solo entra la reunión unida a una sesión de la exploración, y esa se lee entera.
- **CreditForce (preventa, prospecto).**
  - La reunión del 28 de septiembre existe solo en HubSpot (`docs/DECISIONS.md:5994`). Hoy la lee la preventa cuando alguien abre el lienzo, como mucho cada 30 minutos y con unos 15 pedidos a HubSpot por mirada (`lib/exploraciones/reuniones-de-hubspot.ts:7-9`, `:24-25`). Eso no cambia en este plan: las reuniones de HubSpot quedan fuera hasta resolver su disparo.
  - Como es un prospecto, la lectura no propondría fuera de alcance.
  - La llamada del 2 de octubre duró 6 minutos y solo se dijo «Sí. Ok.» (`DECISIONS.md:5615`). La lectura la deja como «sin texto» y no propone nada.
  - Andrés Pinzón, el vendedor, quedó confirmado como «Quién decide» (`DECISIONS.md:5643`). La guarda que descarta al equipo de Smarteam ya existe en la preventa; el enrutador aplica la misma a los hechos de tipo persona.
- **Un cliente con dos proyectos.** Hoy solo el principal recibe avance (`post-process.ts:159-160`). Con hechos atados a un proyecto, cada uno recibe lo suyo, siempre que su vínculo cumpla `linkFeedsAvance`. Un hecho que apunta a un proyecto no vinculado pasa a la cuenta.
- **Wherex no entra al sondeo ni a las pruebas.** Hizo churn y es el cliente de prueba de Nexus (`DECISIONS.md:6407`).

---

## 5. Plan por etapas

**Orden de construcción (decisión del 9-oct):** primero las enmiendas de DECISIONS y GLOSSARY; después 0, A y 4, en paralelo; luego 1, 2, 3, 3b, 5, 6 y 7. **La 2 va antes de la 3**: la memoria del proyecto lee los compromisos abiertos desde Tareas, por la puerta `lib/tareas/para-agentes.ts`.

| Etapa | Depende de | SQL |
|---|---|---|
| 0 · Arreglos y limpieza | — | No |
| A · Exploración por sesiones (en paralelo con 0 y 4) | — (su segunda mitad, de la 2) | No |
| 4 · La frontera en los documentos (en paralelo con 0 y A) | — | No |
| 1 · Una sola revisión por reunión, con lo que ya existe | 0 | No |
| 2 · La lectura, durable y bien hecha | 0, y Tareas en producción | **Sí: 5 columnas `seguimiento*`** en `LecturaDeReunion` |
| 3 · La memoria como un solo cargador | 0 y 2 (los compromisos abiertos salen de Tareas) | No |
| 3b · El handoff se congela | 3 | No (un hito con su foto protegida) |
| 5 · Sondeo de hechos (sin deploy) | 2 | — |
| 6 · Hechos, enrutador y novedades | 1, 2, 4 y 5 | Sí: `HechoDeReunion`, con la columna `reemplazaAId` |
| 7 · Solo las elegidas en los documentos del proyecto (6: la exploración pasa a sus sesiones en la A) | 3, 4, 6 y A | No |
| Fuera por ahora · Otras fuentes | Medir el disparo | — |

**Antes de empezar:** correr `npm run check:esquema` y confirmar que están aplicados en producción el SQL del 2026-10-07 y el de Tareas (`scripts/sql/2026-10-09-tareas.sql`, hoy sin commitear). No lo verifiqué.

Todo el SQL es aditivo, con RLS y política RESTRICTIVE en cada tabla nueva, y se corre antes del deploy.

### Etapa 0 · Arreglos y limpieza

- **Qué cambia:**
  1. El post-proceso toma el dueño de `resolvedClientId` y no vuelve a categorizar. Sin dueño, no lee (`post-process.ts:116-149`).
  2. El resumen del proyecto (`project-brief.ts:81`, `:94`) y el análisis de ventas (`sales/analyze/route.ts:108`) pasan por el chokepoint. La regla propia de la propuesta comercial se documenta, no se cambia (`feeding.ts:84-92`).
  3. **El vigía queda fuera de esta etapa.** Otra sesión está cambiando `lib/cs/watchdog-context.ts` (git diff: +16 −7) y construyendo `lib/cs/cita-de-alerta.ts` y `lib/cs/alertas-reglas.ts`, sin commitear. Cuando entre la entrega 2 de cartera, se le suma `belongsToClient`. ✅ Ya está (revisión del 2026-10-10): `lib/cs/watchdog-context.ts` filtra con `whereBelongsToClient`.
  4. La llamada del avance queda registrada con su nombre de agente (`regenerate-progress.ts:358`).
  5. El handoff lee la ficha confirmada (`fichaParaPrompt`) y deja de recibir `Client.canvas`, `ClientContextCard` y `StageNote` (`analyze/route.ts:698`, `:1647-1685`, `:1897-1913`). La orden «PRIORIDAD DEL CANVAS» deja de agregarse donde no hay canvas, empezando por el kickoff (`:1602-1607`).
  6. El kickoff y el detalle dejan de armar el contexto que después tiran (`analyze/route.ts:1157`, `:1285`, `:1333-1389`).
  7. En la preventa, la lista de reuniones desaparece de Resumen, La escala, Propuesta y Casos de uso. En Casos de uso **se quedan las instrucciones**, porque su agente las lee (`LienzoDeExploracion.tsx:60-64`, `:487-491`; `agente.ts:512`).
  8. El panel de los documentos dice cuántas reuniones lee (24) y que las lee en resumen (`components/canvas/DocumentoContextSection.tsx:15-16`; `lib/contexto/documento.ts:122-126`). Lo reemplazó la etapa 7: el panel dice que lee enteras las elegidas y qué le llega sin elegidas.
  9. DECISIONS: la pasada única es el post-proceso (`docs/DECISIONS.md:118-120`).
  10. **Limpieza** (antes era la etapa 7):
      - Se retiraron 5 rutas sin pantalla: `process-session`, los dos `canvas/refresh` (cliente y proyecto), `integrations/summarize` y `canvas/suggestions`. `guia-exploracion` sigue hasta correr `scripts/migrar-guia-de-exploracion.ts`, pero desde el 10-oct su PATCH y su POST (que lanzaba el agente de la guía vieja y cobraba) responden 410: queda solo el GET.
      - Se deja de crear las 3 secciones muertas de «Información del cliente» (`lib/canvas/strategy-project.ts:82-85`).
      - Se retira `CanvasSuggestion`.
      - `GuiaDeExploracion` como respaldo (`load-canvas-context.ts:383-391`) se retira solo después de correr `scripts/migrar-guia-de-exploracion.ts`.
      - Las columnas se quedan marcadas `DEPRECATED`, sin DROP (ARCHITECTURE §2.9).
      - Decidido el 9-oct: `/api/sessions/analyze` y el modo «análisis» de /sessions se retiraron.
- **Qué se deja de hacer:** mandar plantillas vacías al prompt, llamar a HubSpot para tirar el resultado y leer reuniones que una persona sacó.
- **Riesgo:** bajo. Cambia el texto que recibe el handoff, así que conviene regenerar 2 o 3 en proyectos de prueba.
- **Cómo se verifica:** tsc en 0, eslint, `npm test`, `npm run test:int` (chokepoint) y `npm run check:invariants`. Comparar el resumen del proyecto antes y después en 3 proyectos.
- **Costo:** neutro. Menos llamadas a HubSpot.

### Etapa A · Exploración por sesiones (en paralelo; diseño v13)

- **Qué cambia:**
  - Una reunión es de la exploración solo si está unida a una de sus sesiones.
  - **Al abrir Exploración, una página de inicio** (diseño v13): la próxima sesión con «Preparar la sesión», la lista de sesiones con su reunión y su estado, «+ Agregar sesión» (una agendada, una que ya pasó o sin reunión), las fuentes manuales, las instrucciones y «Lo que la IA ya sabe» (la memoria). **Sin lista general de reuniones.**
  - **Prospecto:** cada reunión nueva con la empresa entra sola como sesión, salvo las internas y las de series. Se sacan una o varias a la vez y quedan en «Fuera de la exploración», plegado.
  - **Cliente:** nada entra solo. Una reunión pasa a ser sesión cuando alguien la agrega desde «+ Agregar sesión».
  - Cada sesión se puede unir a su evento del calendario antes de que ocurra.
  - El riel deja de crear pestañas por reuniones sueltas (`guia.ts:186-203`).
  - La exploración deja de arrancar sugerida (`destinos-de-contexto.ts:47-55`; `fuentes-del-proyecto.ts:97-109`).
  - Casos de uso y La escala dicen que no leen reuniones.
  - **Primera versión, chica:** la regla, «Agregar sesión», la X en todas, las reuniones con solo notas y el tope de id de 60 a 200.
  - **Después:** el calendario de 6 semanas y la lectura sola de la reunión de una sesión en proyectos (necesita la etapa 2).
- **Archivos:** `lib/exploraciones/guia.ts`, `fuentes-del-proyecto.ts`, `fuentes.ts`, `lib/sessions/destinos-de-contexto.ts`, `components/exploraciones/*`.
- **SQL:** no, vive en el JSON `contenido`. Antes hay que corregir las 4 reglas de DECISIONS que esto cambia.
- **Qué se deja de hacer:** las 30 reuniones sugeridas por defecto y las pestañas fantasma.
- **Riesgo:** cambia la vista de las 2 exploraciones de proyecto (Cemaco y Noelito) y de las 15 preventas. Las sesiones planeadas se conservan; las reuniones sueltas pasan a «otras reuniones», plegadas, y no se borra nada.
- **Cómo se verifica:** en Noelito, el riel muestra solo sus sesiones. Tests de `pestanasDeSesiones`.
- **Costo:** baja, porque la preparación lee menos.

### Etapa 1 · Una sola revisión por reunión, con lo que ya existe

- **Por qué va antes de los hechos:** las propuestas nuevas caerían en colas que ya nadie revisa.
- **Qué cambia:**
  - **«Lo que dejó esta reunión»:** una tarjeta por reunión, en «Para ti» y en la reunión, con lo que ya existe: minuta, acciones, compromisos, pedidos fuera de alcance y la propuesta de ficha de esa reunión.
  - «Usar todo» = la minuta revisada + los pedidos confirmados + tus tareas propuestas de esa reunión. Corregido el 9-oct: las acciones (`ActionItem`) no se aceptan (no tienen ese estado y se retiran en la etapa 2): van plegadas y solo para leer. La ficha, la etapa, la fecha del diagnóstico y las alertas van con su propia confirmación, con un enlace.
  - **Todo se puede desestimar** (decisión 6): cada propuesta tiene «Usar» y «Desestimar», también las alertas y las tareas propuestas. La minuta no se desestima: es memoria y se corrige.
  - **Vencer se calcula por fecha:** a los 30 días la tarjeta deja de pedir revisión. No cambia el `ActionItem`.
  - **«Uso de Nexus»** en tu panel de «Para ti» (el centro de comando): por módulo y por persona, cuánto se usó, se desestimó o venció. Sale de los estados que ya guarda cada propuesta, sin tabla nueva.
- **Archivos:** `lib/seguimiento/tarjeta.ts` (pura, con tests) y una fuente nueva de «Para ti».
- **SQL:** no. Lo acumulado en `ActionItem` no hace falta cerrarlo: con la etapa 2 deja de mostrarse y queda como histórico.
- **Qué se deja de hacer:** revisar minuta, acciones, pedidos y ficha en pantallas distintas.
- **Riesgo:** ruido. Lo baja un tope por reunión y mostrar solo lo que pide decisión.
- **Cómo se verifica:** test de qué entra a la tarjeta y de que «Usar todo» nunca toca la ficha ni la etapa.
- **Costo:** US$0.

### Etapa 2 · La lectura, durable y bien hecha

- **Qué cambia:**
  - La cola es `LecturaDeReunion`, compartida con Tareas: una fila por reunión, una pasada con dos salidas. El estado del seguimiento va en 5 columnas propias (`seguimiento*`): `estado` es la salida de Tareas. La cola (`lib/lecturas/cola.ts`) es el segundo escritor de esa tabla. Job `seguimiento-reuniones`: 2 reuniones por tick, en paralelo, con 420 s de tope cada una (el tope corta la lectura; corregido el 2026-10-10, con 120 s toda lectura que se cortaba seguía viva por detrás), toma atómica y reintento. Una reunión de puertas adentro no entra. El enriquecimiento solo encola (`meet-enrichment.ts:404`).
  - **El job comprueba el presupuesto automático y se salta la tanda si no alcanza.** No depende de `PRESUPUESTO_IA_BLOQUEA`: por defecto la guardia solo avisa (`lib/ai/presupuesto.ts:59`, `:72`).
  - La salida pasa a tool use en vez de regex. Si se corta, se reintenta una vez con más tope, sin pasar 21.333 (el límite sin streaming de DECISIONS); si vuelve a cortarse, queda en error.
  - Citas verificadas en compromisos y pedidos (`citaEstaEnLasFuentes`, `lib/timeline/limites.ts:378-395`).
  - Las reuniones con solo notas que ya ocurrieron se vinculan a su proyecto desde el job (solo el clasificador), no desde la sincronización de Meet, que crea eventos futuros sin contenido. Hoy no pasa (`meet-sync.ts:31`).
  - Rutea por tipo de empresa: sin fuera de alcance en prospectos, sin lectura en aliados. Un pedido fuera de alcance solo nace en una reunión de un cliente con proyecto principal. Los 10 que hoy no tienen proyecto (3 de ellos en prospectos) los ubica o los descarta una persona (`scripts/revisar-pedidos-fuera-de-alcance.ts` (de la etapa 0)).
  - **`ActionItem` se retira** (decisión 7): el post-proceso deja de crearlas y escribe propuestas de `Tarea` (las de Smarteam para quien se comprometió; las del cliente, de seguimiento para el CSE, con la marca «frena el plan» si aplica). En un prospecto, el seguimiento va a quien lleva la preventa viva; sin preventa, solo se proponen los compromisos de Smarteam. Las propuestas vencen a los 14 días (la regla de Tareas). Los «Pendientes» del Resumen, «Para ti», la página de la reunión y el vigía leen Tareas, con la visibilidad de Tareas. Lo histórico queda `DEPRECATED`, sin DROP. El recorrido de Tareas suma pasos para el CSE. **El canal al cronograma** de lo que frena el plan pasa a la etapa 6: acá es solo la marca.
  - **La frontera Tareas ↔ agentes:** los agentes internos (el vigía, la memoria interna del proyecto, el avance) leen una proyección de las tareas por una sola puerta, `lib/tareas/para-agentes.ts` (título, para cuándo, estado y lado; nunca la cita, el contexto, las notas ni lo privado). Nada que ve el cliente lee tareas. El censo de `lib/tareas/guardas.test.ts` se enmienda con esa puerta.
  - **El costo por reunión** se atribuye con `LlmCall.origen = "reunion:<sessionId>"`, sin SQL.
  - Se deja de pedir `stageProgress` (`post-process.ts:53`).
  - **Todavía no** amplía la cobertura: leer las de solo notas y el avance por proyecto vinculado esperan a la etapa 6, cuando el avance corra solo con señal.
- **Archivos:** `lib/sessions/post-process.ts`, `compromisos-y-alcance.ts`, `lib/google/meet-enrichment.ts`, `lib/google/meet-sync.ts`, `lib/jobs/defs.ts`, `lib/tareas/*` (la parte compartida), RUNBOOK (tabla de jobs).
- **SQL:** sí, 5 columnas aditivas `seguimiento*` en `LecturaDeReunion` (`seguimientoEstado`, `seguimientoDesde`, `seguimientoIntentos`, `seguimientoLeidaAt`, `seguimientoError`), con su CHECK y su índice: `scripts/sql/2026-10-10-lectura-de-seguimiento.sql`, después del SQL de Tareas y antes del deploy. Reusar `estado` rompería la salida de Tareas. Requisito: el SQL y el código de Tareas en producción.
- **Qué se deja de hacer:** «dispara y olvida» y dos pasadas de hasta 120 post-procesos en paralelo.
- **Riesgo:** medio, porque toca la cadena automática y el módulo de Tareas. Va con una bandera de entorno para volver al camino viejo (`SEGUIMIENTO_REUNIONES_ENABLED=0`), y con un script en seco que compara minutas viejas y nuevas sobre 20 reuniones (`scripts/comparar-lectura-de-reuniones.ts`).
- **Cómo se verifica:** **INV44**: toda reunión con un cliente o un prospecto, de 14 días o menos y con transcripción, tiene su lectura (lista, sin texto, copia o error) o su minuta dentro de 24 h. El invariante de los hechos de la etapa 6 pasa a ser **INV45**. Comparar `LlmCall` antes y después, contando todas las llamadas que dispara cada reunión.
- **Costo:** neutro (misma cobertura). Vincular las de solo notas suma el clasificador en unas 88 reuniones por mes (≈US$2, estimado con el costo medido de ≈0,025).

### Etapa 3 · La memoria como un solo cargador, con lo que ya existe

- **Qué cambia:**
  - `memoriaDeLaCuenta(clientId, { paraElCliente })` y `memoriaDelProyecto(projectId)`. Juntan la ficha (recortada para el cliente; lo propuesto según la decisión 4), los procesos, la historia, lo fuera de alcance, las minutas (hay 533), los compromisos abiertos, las desviaciones y los resultados. Cuando existan los hechos, los suman. Los compromisos abiertos salen de Tareas (la etapa 2 va antes), solo en la versión interna y por `lib/tareas/para-agentes.ts`. Tres alcances, no dos: para el cliente, sin lo interno (el handoff) e interno.
  - Se conectan al kickoff, ejecución, integraciones, entrega, avance, propuesta comercial y a la preventa de un cliente que ya existe (`fuentes.ts:308`). El vigía, cuando entre la entrega 2 de cartera: ya entró, y el vigía lee la memoria desde el 10-oct (`lib/cs/watchdog-cuenta.ts`, sin las reuniones, los compromisos ni los resultados, que lee por su lado).
  - **El correo de seguimiento** recibe la memoria con `paraElCliente`, actualizando a propósito su censo (`lib/exploraciones/lectores.test.ts`).
  - El resumen del proyecto lee minutas en vez de releer reuniones (`project-brief.ts:94`).
  - El avance lee la reunión nueva entera más las minutas anteriores (`project-sessions.ts:57`).
  - Lo aprendido en una preventa (Preparación, Resumen, la escala estimada) se guarda en la empresa desde el primer día, como propuesta a la ficha, con la marca de qué es interno (decisión 8). Hoy solo llega desde una exploración de proyecto (`exploraciones/[id]/route.ts:87`).
  - Los agentes internos leen también la ficha propuesta, con la fuente de cada campo (decisión 4). Nunca lo que propuso el mismo agente que lee, y nunca en lo que ve el cliente.
- **SQL:** no.
- **Qué se deja de hacer:** que cada agente arme su propio contexto de la cuenta, y las relecturas de 12 reuniones.
- **Riesgo:** que algo interno llegue a un documento del cliente. Lo frenan `paraElCliente` (`ficha.ts:128-139`), la etapa 4 y un test.
- **Cómo se verifica:** el tamaño del prompt de cada agente antes y después, y un kickoff y una entrega regenerados en un proyecto de prueba.
- **Costo:** unos 2.000 a 4.000 tokens más por generación (≈US$0,01), y se ahorran las relecturas.

### Etapa 3b · El handoff se congela (decisión 2)

- **Qué cambia:**
  - El handoff se congela con un botón «Congelar» del CSE o solo, la primera vez que se aplica el cronograma que propone.
  - Congelado sigue siendo editable a mano. La IA ya no lo regenera: lo nuevo que salga de las reuniones (un alcance acordado, un cambio de fechas) aparece como sugerencia sobre el handoff, con su cita, y el CSE la usa o la desestima. Un pedido nuevo va a fuera de alcance.
  - Rehacerlo entero desde cero pide un motivo.
- **Lo que hay que resolver al diseñar:**
  - qué reemplaza al aviso de «desactualizado», que hoy depende de que el handoff cambie (`canvases/route.ts:62`, `piezaDesactualizadaPorHandoff`): con el handoff quieto, el aviso pasa a salir de las sugerencias usadas;
  - el bloque «después del cierre», que se vuelve sugerencias;
  - los proyectos recurrentes: se congela cada ciclo.
- **SQL:** no. Decidido el 9-oct: el congelado es un hito del canvas del handoff con su foto protegida (`HitoDeDocumento`, `VersionDeDocumento.protegida`, del SQL del 2026-10-02), porque la fila de `Handoff` no siempre existe. Congela quien tiene la celda `handoff.congelar` (el CSE, la CSL, Ventas y dirección; corregido el 10-oct: antes era quien podía regenerar, y el CSE quedaba afuera); lo nuevo llega como sugerencias a pedido y aditivas, y el enrutador de la etapa 6 nunca escribe en el handoff; «Rehacer desde cero» vuelve a congelar al terminar.
- **Riesgo:** bajo; cambia cuándo corre el agente del handoff, no lo que escribe.
- **Cómo se verifica:** test de que un handoff congelado no se regenera solo y de que aplicar el cronograma lo congela una vez.

### Etapa 4 · La frontera en los documentos

- **Qué cambia:**
  - El bloque de reuniones de `lib/contexto/material-del-documento.ts` suma la regla de no usar precios ni lo dicho puertas adentro, con el precedente de `lib/business-cases/money-brief.ts`.
  - El chat de los documentos pasa por `lineasConFrontera`, como el del cronograma (`turno.ts:1204`, `:1212`). No verifiqué si el material de los documentos trae lo interno separado para calcular las huellas; si no, hay que armarlo.
- **SQL:** no.
- **Por qué va antes de la 6 y la 7:** las dos mandan más texto de reuniones a documentos que ve el cliente.
- **Cómo se verifica:** un test con una reunión que trae un precio y un documento que no lo repite; un test del chat de documentos con una línea marcada.
- **Costo:** US$0.

### Etapa 5 · Sondeo de hechos (sin deploy)

- `scripts/sondeo-de-hechos.ts` corre la lectura de hechos sobre unas 30 reuniones recientes, sin Wherex, verifica las citas e imprime cómo se reparten por tipo y destino.
- Compara contra lo que encuentran hoy el Haiku de la ficha y la lectura de procesos.
- Mide el costo de la llamada aparte, con la transcripción en caché y sin ella.
- Cuesta unos US$3 a 4 (estimado). Es el sondeo que pide DECISIONS (`:125-126`). Revisas la calidad antes de seguir.
- Deja cada hecho con su cita y su destino en `backups/<fecha>-sondeo-de-hechos/`. Con eso eliges la variante (aparte con caché, aparte sin caché o en la misma llamada) y el modelo; hasta entonces, la etapa 6 se despliega con la lectura de hechos apagada (`SEGUIMIENTO_HECHOS=0`, RUNBOOK).

### Etapa 6 · Hechos, enrutador y novedades

- **Qué cambia:**
  - Los hechos se guardan en `HechoDeReunion`, con su estado (abierto, aplicado, no aplica). Sin tabla aparte para las decisiones. La tabla lleva desde el primer día la columna `reemplazaAId`, para los acuerdos vigentes (un acuerdo posterior que reemplaza a otro); la pantalla, después.
  - El enrutador en código (sección 4):
    - la ficha se propone desde los hechos (`proponerCambiosALaFicha` ya acepta fuentes, `lib/clients/ficha-propuesta.ts:154-160`);
    - etapa y avance corren solo con señal; el avance, para cada proyecto vinculado que cumple `linkFeedsAvance` (incluida y principal, o secundaria con confianza de 0,4 o más). Corregido: no es la política del handoff, que filtra por relevancia de venta y dejaría afuera las reuniones de implementación;
    - la queja verificada la levanta la lectura (un detector más) y el riesgo va como evidencia al vigía;
    - «cómo trabajan hoy» alimenta a procesos (o se justifica por qué no);
    - los compromisos (de Smarteam y del cliente) siguen yendo a Tareas, como desde la etapa 2.
  - Las novedades se ven en la tarjeta de la etapa 1, en el riel junto a la pieza (`app/api/projects/[projectId]/canvases/route.ts:62` → `components/clients/ProjectCanvasPanel.tsx:557`), arriba del documento y en «Qué sigue» (`lib/clients/que-sigue-del-proyecto.ts:126-132`).
  - **Recién acá se amplía la cobertura:** se leen las reuniones con solo notas, y en las transcripciones largas se suman las notas priorizadas de Gemini (`lib/sessions/notas-de-gemini.ts:67`).
  - Invariante INV45: todo hecho es del cliente de su reunión (INV44 es la lectura, desde la etapa 2).
  - El canal al cronograma del compromiso del cliente que frena el plan (viene de la etapa 2, donde es solo una marca).
- **SQL:** sí, `HechoDeReunion`, con la columna `reemplazaAId`.
- **Qué se deja de hacer:** Haiku releyendo la reunión para la ficha (30k caracteres) y para la etapa, y el avance corriendo con cada reunión.
- **Riesgo:** perder datos que el Haiku de la ficha sí encontraba (se compara en el sondeo), y ruido (lo bajan un tope de novedades por documento y mostrar solo documentos con contenido).
- **Cómo se verifica:** un test que congela las claves del ruteo contra las definiciones de cada documento, y un escaneo que impide que `app/external/**` lea hechos.
- **Costo:** sube por los hechos y por las reuniones con solo notas (unas 88 por mes); baja por el avance sin señal (hasta unos US$6) y las relecturas de ficha y etapa (≈US$0,7). El neto sale del sondeo; no lo comprometo antes.

### Etapa 7 · Solo las elegidas en los documentos del proyecto

Son 6: kickoff, diagnóstico, planificación, ejecución, integraciones y entrega. La exploración pasa a sus sesiones en la etapa A.


- **Qué cambia:**
  - Una reunión sin tocar deja de entrar (`linkFeedsDocumento`, `destinos-de-contexto.ts:107-111`).
  - Las elegidas se leen enteras, con tope (`lib/contexto/material-del-documento.ts:65-105` cambia el resumen de Gemini por transcripción más minuta).
  - **Las que propone la lectura aparecen como sugerencia calculada**, con un clic para usarlas. Nunca se escribe `true` en la columna: eso significa «la tocó una persona» y bloquea al clasificador (`session-project-locks.ts:56-71`).
  - El diagnóstico sugiere las sesiones de la exploración.
  - El panel dice qué le llega sin elegidas (`queLeeSinElegidas`, `lib/contexto/documento.ts`): «Sin elegidas, no lee ninguna reunión: de las demás le llegan solo los acuerdos y las decisiones de las minutas revisadas». En la entrega suma que la sección de impacto sale vacía, y en la ejecución, que lee sus minutas y los compromisos abiertos.
- **SQL:** no.
- **DECISIONS:** corregir los «arrancan SUGERIDOS» del 2026-09-28, del 2026-09-29 y del 2026-10-07, y responder la razón del modo sugerido (`destinos-de-contexto.ts:18-22`): con la memoria de la etapa 3, un documento sin reuniones elegidas ya no sale vacío. (Hecho el 9-oct: en DECISIONS solo estaba escrito el del 2026-10-07; los otros dos viven en el comentario de `destinos-de-contexto.ts`, que se corrige con el código.)
- **Qué se deja de hacer:** que las llamadas de venta, con precios, entren por defecto a documentos que ve el cliente.
- **Riesgo:** un documento regenerado con menos material. Por eso va después de las etapas 3 y 4.
- **Costo:** unos US$0,04 más por reunión elegida y por generación, sin las 24 lecturas en resumen. Entre neutro y unos US$3 más por mes (estimado).

### Fuera por ahora · Otras fuentes

Entran cuando tengan un disparo definido, la deduplicación contra Meet y una medición:
- **Reuniones de HubSpot.** No avisan cuando llegan (`reuniones-de-hubspot.ts:7-9`). Cada mirada son unos 15 pedidos a HubSpot (`:24-25`); una pasada por los 79 proyectos son unos 1.200. DECISIONS ata esto a la caída del 21-sep (`:4151-4156`, `:4165`). La transcripción completa pide `crm.extensions_calling_transcripts.read`, que no está concedido.
- **Correos de HubSpot**, con `sales-email-read`. La preventa ya los lee (`lib/exploraciones/hubspot.ts:521`) y el vigía empieza a leerlos (`lib/cs/watchdog-cuenta.ts:96`).
- **Notas pegadas a mano** (`HandoffSource`, `TimelineSource`, `NotaDeContexto`, `ExploracionDocumento`, `BusinessCaseTranscript`). `LecturaDeReunion` ya acepta texto sin `sessionId`, así que no pedirían tabla nueva.
- Lo que encuentra la auditoría del portal, como propuesta a la ficha.
- Reuniones de más de 14 días, a pedido.

**Efecto total en costo.** Lo automático hoy cuesta unos US$28 por mes. Lo que sube y lo que baja está en cada etapa; el neto se mide en el sondeo. El costo no es la razón del cambio: las razones son la cobertura, las citas y la revisión.

---

## 6. Lo que decidiste (9 de octubre)

1. **Una sola lectura por reunión: el post-proceso ampliado, compartiendo `LecturaDeReunion` con Tareas.** Sí, con una condición: que la arquitectura sirva para las partes nuevas de Nexus. Eso es el circuito de cinco piezas de §2.1 (una entrada con adaptadores, una salida estándar, un registro de destinos, un solo cargador de memoria y un ciclo de vida de lo propuesto). Antes del código se corrige DECISIONS (`:118-120`, `:125-126`).
2. **El handoff se congela** con «Congelar» o al aplicar el cronograma que propone. Sigue editable y los agentes le sugieren lo nuevo (etapa 3b). No al publicar el kickoff: es opcional, y 27 de 32 proyectos con handoff no lo tenían publicado (`docs/DECISIONS.md:486-496`).
3. **El contexto general es la memoria, no una lista de reuniones** (§2.1). La exploración abre en una página de inicio con solo sus sesiones, las fuentes manuales y las instrucciones (diseño v13). Los documentos del proyecto pasan a «la memoria más las elegidas» en la etapa 7, con las sugerencias calculadas.
4. **Los agentes internos leen también la ficha propuesta**, con la fuente de cada campo. Nunca lo que propuso el mismo agente que lee, y nunca en lo que ve el cliente (etapa 3).
5. **Un solo sistema de alertas, con varios detectores.** Lo tomé así, como te lo recomendé; si no te convence, se cambia antes de la etapa 6. Todas las alertas viven en `CsAlert`, con el mismo ciclo (abierta, resuelta o descartada con nota, y vuelve solo con una señal nueva, que ya existe). Los detectores son tres: reglas en código (hoy, los avisos de renovación; mañana las que se sumen), la lectura de cada reunión (deja la queja o el riesgo con su cita) y el vigía con IA, que juzga la cuenta entera y decide. Cobranza conserva sus alertas aparte, con el mismo ciclo. No conviene un solo agente que lo haga todo: las reglas cuestan US$0 y son exactas, y el vigía solo se paga donde hace falta juicio.
6. **Todo lo que propone Nexus se puede desestimar** (tareas, alertas, novedades, propuestas de ficha), y tu panel de «Para ti» muestra el uso: qué se usa, qué se desestima y qué vence, por módulo y por persona (etapa 1).
7. **`ActionItem` se retira; los próximos pasos van a Tareas, por CSE** (§2 y etapa 2). Lo de Smarteam, para quien se comprometió; lo del cliente, como seguimiento para el CSE, y si frena el plan, también en el cronograma. Lo histórico queda sin borrar. Va en el recorrido de Tareas para el CSE.
8. **Lo de la preventa se guarda en la empresa desde el primer día** (etapa 3), con lo interno marcado. **Fuera de alcance es de un proyecto**: nace comparando contra lo que se vendió en ese proyecto y lleva su `projectId`; se sigue en La cuenta porque es una oportunidad de la empresa. Por eso un prospecto no tiene: los 3 que hay hoy se revisan a mano.

---

## Anexo A · Lectores de reuniones

| Lector | Disparo | Qué reuniones | Texto | Modelo / max_tokens | Chokepoint | Escribe en |
|---|---|---|---|---|---|---|
| Resumen IA | Al llegar, sin notas de Gemini (`meet-enrichment.ts:379-389`) | La que llega | Transcripción 60k (`lib/ai/summarize-session.ts:21`, `:30`) | Haiku 4.5 / 2048 (`:37-38`) | — | `FirefliesSession.summary` |
| Post-proceso | Al llegar, con transcripción y 14 días o menos (`meet-enrichment.ts:61`, `:401-407`) | La que llega, una vez (`post-process.ts:101-114`) | Transcripción 60k + overview + alcance + 15 acciones (`:194-249`) | Sonnet 4.6 / 6000 (`:264-266`) | **No** (`:116-142`) | Minuta, acciones, compromisos, pedidos (`:304-444`) |
| Clasificador | Al llegar, solo dentro del post-proceso (`post-process.ts:159`); en lote al crear un proyecto, un handoff, un alta o al cambiar el dueño (`resolve-client.ts:131-137`) | La que llega; en lote, 30 a 60 | Transcripción 30k (`lib/sessions/classify-session-project.ts:248`) | Sonnet 4.6 / 1200 (`:261-263`) | Recibe el cliente | `SessionProject` |
| Avance | Desde el post-proceso (`post-process.ts:456-466`) | 12 más recientes del proyecto (`project-sessions.ts:48-57`) | Resumen de Gemini ×12 | Sonnet 4.6 / 6000 (`regenerate-progress.ts:358-361`) | Parcial | `pendingProgress` |
| Ficha | Desde el post-proceso (`:468-478`) | La que llega | Resumen de Gemini 30k (`ficha-propuesta.ts:47`) | Haiku 4.5 / 6000 | Usa el cliente del post-proceso | `ficha.propuesta` |
| Etapa | Desde el post-proceso (`:498-510`) | La que llega, 21 días o menos | Resumen de Gemini 30k (`lib/projects/etapa-desde-reunion.ts:27`) | Haiku 4.5 / 600 | Por id | `etapaPropuesta*` |
| Preventa: leer | Desde el post-proceso (`:512-521`) | La que llega, mientras se vende (`exploraciones/agente.ts:1015-1035`) | Transcripción entera hasta 60k (`fuentes.ts:414-425`) | Sonnet 4.6 / 8000 | Sí (`fuentes.ts:211-217`) | `propuesta` |
| Tareas internas (en el árbol) | Botón (`app/api/tareas/leer-reunion/route.ts:60-61`) | Las de la persona, también de cliente | «Próximos pasos» o conversación hasta 150k | Haiku 4.5 | Propio | `LecturaDeReunion`, `Tarea` |
| Handoff | Botón | `getProjectHandoffSessions` + relevancia (`analyze/route.ts:1277-1304`) | Resumen de Gemini, 16k + 16k (`lib/handoff/session-budget.ts:71-77`) | Sonnet 4.6 / 16000 (`analyze/route.ts:2152-2154`) | Sí | Canvas Handoff |
| Kickoff, diagnóstico, planificación, ejecución, integraciones, entrega | Botón | Sugeridas (`destinos-de-contexto.ts:107-111`) | 24 reuniones, 48k, resumen de Gemini (`documento.ts:119-131`) | Sonnet 4.6 / entre 10000 y 21000 (cada `*.defs.ts`) | Sí | `CanvasBlock` |
| Exploración del proyecto | Botón | Hasta 30 sugeridas + elegidas (`fuentes-del-proyecto.ts:97-109`) | Al leer, 2 enteras hasta 60k (`fuentes.ts:389-414`) | Sonnet 4.6 / 8000 | Sí | `propuesta` |
| Cronograma: detalle y revisor | Botón | Solo elegidas (`lib/timeline/session-feeding.ts:33-38`) | Resumen + minuta, 48k (`cargar.ts:334-367`) | Sonnet 4.6 / 24000 y 3000 | Sí | Propuesta `borrador-v1` |
| Chat del cronograma | Cada turno | Elegidas | 16k (`material-cronograma.ts:1311`) | Sonnet 5 | Sí | Lista acordada |
| Resumen del proyecto | Al abrir el Resumen o con botón | 12 más recientes (`project-brief.ts:39`, `:81`, `:94-101`) | Resumen de Gemini ×12 | Sonnet 4.6 / 5000 | **No** | `ProjectBrief` |
| Resultados | Después del handoff o del diagnóstico | 8 más recientes (`proponer-resultados.ts:38`, `:57`) | Resumen de Gemini 4k | Sonnet 4.6 / 4000 | Sí | `handoffResultados` |
| Vigía del proyecto | Cron, debounce, al entrar | 5 más recientes, con `included` (`watchdog-context.ts:198-211`) | Minuta 400 o extracto de 1.200 | Sonnet 4.6 / 2500 (`lib/cs/watchdog.ts:283-284`) | Sí (`whereBelongsToClient`, desde la entrega 2 de la cartera) | `CsAlert` |
| Vigía de la cuenta | La misma corrida | 8 de 45 días (`lib/cs/watchdog-cuenta.ts:33-34`, `:217-235`) | Minuta 360 o extracto | La misma | Sí | `CsAlert` |
| Resumen de la cuenta | Botón | 5 con minuta (`load-account.ts:193-206`) | Solo la minuta | Sonnet 4.6 / 5000 | Sí | `CsAccountBrief` |
| Procesos | Botón | 40 con transcripción (`lib/procesos/agente.ts:55-57`) | Transcripción entera; lo leído se guarda, con citas verificadas (`:8-16`) | Opus 5.5 / 32000 | Sí | Mapas + `AgentRun` |
| Propuesta comercial | Botón | Ventas en la sala y sin proyecto (`feeding.ts:141-146`) | Transcripción entera, sin tope (`generate/route.ts:161`) | Sonnet 4.6 / 12000 | Regla propia, documentada (`feeding.ts:84-92`) | Canvas de la propuesta |
| Correo de seguimiento | Botón | Una | Resumen de Gemini 14k + transcripción, 40k en total | Sonnet 4.6 / 2000 | Sí | `propuesta.correos` |
| Análisis de ventas | Botón | Los ids que manda el navegador (`sales/analyze/route.ts:108`) | 12k | Sonnet 4.6 / 8000 | **No** (`:70`) | No guarda |
| Rutas sin pantalla | — | — | — | — | — | Se retiraron `process-session`, los dos `canvas/refresh`, `integrations/summarize` y `canvas/suggestions`. `guia-exploracion` queda con su GET (el PATCH y el POST responden 410 desde el 10-oct) |

## Anexo B · Memoria que existe

| Pieza | Nivel | Dónde | Quién la escribe | Quién la lee | Estado |
|---|---|---|---|---|---|
| Ficha del cliente | Cuenta | `Client.ficha` (`prisma/schema.prisma:190-194`; `lib/clients/ficha.ts:29-171`) | La IA propone (handoff, cada reunión, botón, exploración); el CSE confirma y se escribe en HubSpot | Diagnóstico, planificación, exploración, resultados | 2 de 168 confirmadas |
| Canvas viejo | Cuenta | `Client.canvas` (`schema.prisma:188-189`) | Nadie (sin pantalla) | Prompt de `/analyze` (`analyze/route.ts:1647`, `:1905`) | Muerto, pero entra al prompt |
| Procesos | Cuenta | Sección `procesos` de `client-info` | Agente de procesos y editor | Diagnóstico, planificación, ejecución, entrega, auditoría | Vivo; envejece |
| Lectura de procesos | Reunión | `AgentRun` `procesos-lectura` (`lib/procesos/agente.ts:8-16`) | Agente de procesos | El mismo agente | Vivo, con citas verificadas |
| Documentos | Cuenta | `ClientDocument` (`schema.prisma:1305-1335`) | Subida y adjuntos | `/analyze` (20 sin origen, `analyze/route.ts:702-730`) | 11 filas, ninguna con origen |
| Tarjetas viejas | Cuenta | `ClientContextCard` (`schema.prisma:1338`) | `/analyze` y `/api/sessions/analyze` | Prompt de `/analyze` (`:1650-1685`) | A medias |
| Notas por etapa | Cuenta | `StageNote` (`schema.prisma:1289`) | Nadie | `analyze/route.ts:698` | Muerta, pero entra al prompt |
| Señales y uso | Cuenta | `ClientCsSignals`, `ClientPartnerSnapshot` | Jobs diarios | Vigía, cartera | Vivas si el job corre |
| Alertas | Cuenta | `CsAlert` (`schema.prisma:2892`) | Vigía, avisos | Éxito del cliente | Vivas |
| Resumen de la cuenta | Cuenta | `CsAccountBrief` (`schema.prisma:3051`) | Agente, a pedido | Solo pantalla | Nadie más lo lee |
| Fuera de alcance | Cuenta | `PedidoFueraDeAlcance` (`schema.prisma:2346`) | Post-proceso y CSE | Resumen del proyecto, pantalla | 33 de 50 sin revisar (medido con la versión en producción) |
| Preventa | Cuenta (hasta la venta) | `ExploracionDeVenta` | Vendedor y agente | Propuesta comercial, handoff | No llega a la ficha |
| Handoff | Proyecto | `Handoff` (`schema.prisma:628`) + canvas | Agente | Unos 20 lectores | No está congelado; nace confirmado (`analyze/route.ts:2650-2656`) |
| «Qué se vendió» | Proyecto | `Project.handoffResumen` (`schema.prisma:302-303`) | `lib/handoff/resumen.ts` | Vigía, procesos, auditoría | 53 de 79 |
| Resultados | Proyecto | `Project.handoffResultados` (`schema.prisma:310`) | `lib/handoff/resultados.ts` | Vigía, cuenta, ficha | 3 de 79 |
| Resumen del proyecto | Proyecto | `ProjectBrief` (`schema.prisma:3074`) | Agente (`project-brief.ts:215-310`) | Solo pantalla | 22 de 79; se salta el chokepoint |
| Cronograma y límites | Proyecto | `ProjectTimeline` (`schema.prisma:743-804`) | CSE y agentes | Varios | Vivo |
| Exploración del proyecto | Proyecto | Canvas + `GuiaDeExploracion` + marco cs | — | `load-canvas-context.ts:383-391` | Tres generaciones conviviendo |
| Cuestionarios | Proyecto (lo que preguntan es de la cuenta) | `Cuestionario` (`schema.prisma:5839-5905`) | Cliente e IA | Diagnóstico, planificación, exploración | Vivos |
| Minuta | Reunión | `SessionMinute` (`schema.prisma:2276`) | Post-proceso (`post-process.ts:315`) | 4 lectores | 2 revisadas |
| Acciones | Reunión | `ActionItem` (`schema.prisma:2299`); estados sin «vencida» (`:2269-2274`) | Post-proceso | GPS, «Para ti», vigía | 98 % abiertas |
| Lectura de la reunión | Reunión | `LecturaDeReunion` (`schema.prisma:6641-6694`) | Tareas | Tareas | En el árbol, sin producción |
| Vínculo reunión ↔ proyecto | Reunión | `SessionProject` (`schema.prisma:2406-2462`) | Clasificador y CSE | Chokepoint | 7 de 9 columnas sin uso (4 de ellas nacieron el 2026-10-07) |

## Anexo C · Lo que no verifiqué

- Los prompts de los agentes guardados en la base: post-proceso, diagnóstico y planificación completos.
- Cómo publican lo que ve el cliente el diagnóstico, la planificación y la entrega.
- Si el material de los documentos trae lo interno separado, para calcular las huellas de la frontera en su chat.
- Si están aplicados en producción el SQL del 2026-10-07 y el de Tareas (`npm run check:esquema` lo dice).
- El costo exacto del avance: está atribuido por cercanía en el tiempo.
- Si `procesos-mapeo` incluye las lecturas de procesos.
- El 39 de Noelito: medí 45 reuniones vinculadas y 0 sesiones planeadas, no reproduje ese número.
- Las banderas de los jobs en el `.env` de producción.
- La revisión no volvió a medir los números de producción; son los de la consulta del 9-oct.

**Respondido con la revisión** (antes estaba en esta lista):
- El chat de los documentos **no** pasa por el detector de frontera (`turno.ts:1204`, `:1212`).
- `ActionItem` **no** tiene un estado para «vencida» (`schema.prisma:2269-2274`).
- El suplemento por dominio de la propuesta comercial tiene su razón escrita y cumple el invariante 1 (`feeding.ts:84-92`).

---

## Lo que cambió con la revisión

- **No hay tabla nueva de lectura:** Tareas ya tiene `LecturaDeReunion` (en el árbol), y la lectura de seguimiento comparte su fila. Se suma la frontera `ActionItem` / `Tarea` que ya decidió Tareas.
- **Las alertas de queja las levanta el vigía**, como dice el plan de cartera; la lectura le da la evidencia. El vigía sale de la etapa 0 hasta que entre la entrega 2 de cartera.
- **Nueva etapa 4, la frontera en los documentos**, antes de mandarles transcripciones enteras o novedades por chat: hoy el chat de documentos no pasa por el detector y el diagnóstico no tiene regla de precios.
- **El orden cambió:** la revisión única, con lo que ya existe, va antes que los hechos; la memoria arranca con las minutas; la cobertura se amplía recién cuando el avance corre solo con señal.
- **Correcciones de diseño:** el handoff se congela en un momento que siempre exista (no al publicar el kickoff); el prellenado es una sugerencia calculada, nunca `true`; «Usar todo» no toca la ficha ni la etapa; Integraciones publica en vivo.
- **Cobertura que faltaba:** las reuniones con solo notas ni siquiera se vinculan a su proyecto; se rutea por tipo de empresa (prospectos, aliados, internas); procesos ya lee cada reunión con citas.
- **Más chico:** las otras fuentes (HubSpot, correos, notas) salen del plan hasta medir el disparo; `DecisionDeNovedad` se reemplaza por un estado en el hecho; la limpieza entra en la etapa 0.
- **Números y citas corregidos:** cuatro lectores leen la transcripción, no tres; el total de IA tiene una fila «otros» de US$8,60; dos pasadas de hasta 120; rutas `lib/handoff/session-budget.ts` y `lib/timeline/session-feeding.ts`; cada dato marcado como «en producción» o «en el árbol».

## Lo que cambió con tus respuestas

- **El contexto general es la memoria** (§2.1), con un circuito de cinco piezas que sirve para partes nuevas de Nexus.
- **La exploración abre en una página de inicio** con sus sesiones (diseño v13), sin lista general de reuniones.
- **Nueva etapa 3b:** el handoff se congela y recibe sugerencias.
- **`ActionItem` se retira en la etapa 2:** los próximos pasos van a Tareas, por CSE. Ya no hace falta cerrar lo acumulado.
- **Un solo sistema de alertas con tres detectores**; todo lo propuesto se puede desestimar, y «Uso de Nexus» lo mide.
- **La preventa guarda en la empresa desde el primer día**; fuera de alcance queda atado a su proyecto.
- **Números nuevos (9-oct):** 3.994 acciones vivas y 46 tocadas; 10 pedidos fuera de alcance sin proyecto y 3 en prospectos.
