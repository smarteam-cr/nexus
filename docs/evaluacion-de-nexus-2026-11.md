# Evaluación de Nexus: cómo está construido hoy y qué mejorar (noviembre 2026)

> Pedido de Elías del 23 nov, por la sesión coordinadora. Cubre dos de sus cuatro preguntas: **cómo está construido
> Nexus hoy** (punto 1) y **las oportunidades de mejora** (punto 4). Las otras dos (Nexus como conector de Claude y su
> efecto sobre los artefactos) están en `docs/plan-conector-claude.md`.
>
> **Cómo se midió:** sobre `main` del 23 nov (a4e69a80), leyendo el código con búsquedas y conteos, sin tocar la base
> (el `.env` apunta a producción). Cada número trae el archivo de donde sale. Lo que no se pudo medir sin la base (el
> gasto de IA de este mes, cuántas veces se usa cada pantalla) se dice como tal.

## En una frase

Nexus está bien cimentado donde más importa (cada persona ve solo sus clientes, la IA pasa por una sola puerta con
medidor y topes, 64 revisiones automáticas de los datos, más de mil pruebas), pero **crece más rápido de lo que se
ordena**: dos rutas todavía dejan ver reuniones de cualquier cliente, los documentos que guían a Claude ya no caben y
dicen números viejos, cada cambio de base se aplica a mano y sin registro, decenas de sesiones en paralelo se pisan, y
hay unas 35 funciones de IA hechas en casa que mantener.

---

## 1. Los números de hoy

| Qué | Hoy | Lo que dice `ARCHITECTURE.md` |
|---|---|---|
| Código (sin pruebas) | 666.791 líneas en 3.533 archivos (`lib` 371.585, `components` 218.624, `app` 76.582) | — |
| Pantallas y rutas | 158 `page.tsx` y 609 `route.ts` | 128 y 512 (Parte 0 · cap. B) |
| Base de datos | 237 modelos, 107 enums, 9.519 líneas en `prisma/schema.prisma` | 197 y 92 |
| Carpetas en `lib/` | 102 | 90 |
| Pruebas | 1.102 archivos: 1.021 unitarias y 81 de integración | 1.021 (este sí está al día) |
| Permisos | 31 secciones y 73 acciones (`lib/auth/permissions/registry.ts`) | 13 secciones (§4.2) |
| Trabajos automáticos | 48 (`lib/jobs/defs.ts:1537`) | El RUNBOOK dice 18 (`docs/RUNBOOK.md:302`) |
| Llamadas a Claude | 77 en 57 archivos; 12 trabajos automáticos usan IA | — |
| Revisiones de datos | 64 en `npm run check:invariants`; 16 cuidan que no se mezclen clientes | — |
| Cambios de base a mano | 178 `.sql` en `scripts/sql/`, 42 nuevos en 30 días | — |
| Ritmo | 539 commits en 30 días (184 uniones de ramas); 202 ramas `claude/*` y 95 copias de trabajo | — |
| Documentos | `docs/DECISIONS.md` 1,6 MB (16.443 líneas); `docs/roadmap.md` 378 KB; `docs/RUNBOOK.md` 133 KB | — |
| Gasto de IA | ~US$ 140 al mes al ritmo de octubre (medido el 18 oct, DECISIONS «El gasto de la IA, por mes») | — |

---

## 2. Dónde cumple

Lo que está bien hecho y conviene cuidar:

- **Una sola puerta a la IA.** No hay ningún `new Anthropic()` fuera de `lib/anthropic.ts` (lo vigila
  `lib/ai/chokepoint.test.ts`). Cada llamada pasa por el presupuesto y queda anotada en `LlmCall` con su costo, su agente
  y su cliente. Hay caché de prompt en 10 flujos y la API Batch (a mitad de precio) para el vigía.
- **Cada persona ve solo sus clientes.** De las 595 rutas internas de `app/api`, las 595 llaman a una guarda; las 10
  públicas lo son a propósito (portal del cliente, salud, webhooks de HubSpot). `lib/auth/project-api-guards.test.ts`
  (1.028 líneas) revisa el texto de cada ruta de proyectos y clientes.
- **La regla de oro tiene quien la cuide.** 16 de las 64 revisiones automáticas (`lib/invariantes/*`) miran que nada
  cruce de cliente: vínculos de reuniones, tareas, hechos, pedidos, investigaciones, enlaces. Corren cada día.
- **Las integraciones están encerradas.** HubSpot tiene un solo transporte (`lib/hubspot/transporte.ts`, con prueba
  propia) y nadie fuera de `lib/hubspot` usa su librería; lo mismo con Google. Solo 3 llamadas a terceros quedan fuera de
  su carpeta (`lib/auditoria-portal/lecturas.ts:175`, `lib/finanzas/tipo-cambio-server.ts:63`,
  `lib/ventas/sicop-archivos.ts:328`).
- **El deploy se defiende solo.** `scripts/deploy.sh` guarda la imagen anterior, espera a que la nueva esté sana y
  vuelve atrás sola si `/api/health` falla; desde el 30 sep, la salud falla si a la base le falta algo que el código usa.
- **El código es ordenado en lo básico.** `tsc` en 0 errores, 26 líneas con `any` en 666 mil, 299 de 300 relaciones de
  la base dicen qué pasa al borrar, RLS encendido en todas las tablas.
- **La superficie que ve el cliente está bien cerrada.** Contraseña con bcrypt, límite de intentos guardado en la base
  (5 fallos en 5 minutos bloquean el enlace), comparación en tiempo constante, cookie solo para `/external`.
- **Módulos modelo:** `lib/desarrollo` (la forma exacta de la constitución), `lib/roles`, `lib/business-cases`,
  `lib/cobranza` (con 78 pruebas) y `lib/memoria` (de afuera entran 22 imports por su índice y 1 por dentro).

---

## 3. Los desafíos, de lo que más duele a lo que menos

| # | Desafío | Cuánto duele | La evidencia en una línea |
|---|---|---|---|
| 1 | Reuniones que se pueden leer sin mirar el cliente | Grave, poco frecuente | 2 rutas sirven o resumen la transcripción de cualquier reunión a cualquier interno |
| 2 | Los documentos que guían a Claude ya no caben y dicen números viejos | Todos los días, en cada sesión | `DECISIONS.md` 1,6 MB y el archivo más cambiado (366 commits en 60 días) |
| 3 | Muchas sesiones en paralelo sobre lo mismo, y el CI no frena | Varias veces por semana | 95 copias de trabajo; el CI corre después de subir a `main` |
| 4 | Cada cambio de base se aplica a mano, sin registro | Cada semana (42 `.sql` en 30 días) | 4 entradas de errores conocidos por columnas o tablas que faltaban |
| 5 | Unas 35 funciones de IA hechas en casa, cada una con sus reglas | Costo de mantener, constante | 77 llamadas, 4 modelos, 3 módulos de chat, defensa contra instrucciones dispareja |
| 6 | Archivos gigantes que todos tocan | Choques y regresiones | 66 archivos de más de 1.000 líneas; `analyze/route.ts` sigue creciendo |
| 7 | Todo corre en un proceso, sin respaldo probado | Raro, pero catastrófico | 48 trabajos en un contenedor; nunca se probó restaurar la base |
| 8 | Candados de fondo a medio cerrar | Riesgo latente | Tokens de HubSpot en claro; 3 tablas sin RLS en su propio SQL |
| 9 | Pocas conexiones a la base para todos | Medio | ~15 espacios compartidos; 72 scripts viejos abren hasta 10 cada uno |
| 10 | La forma del código se aleja de la constitución | Lento | 74 de 102 carpetas sin la forma estándar; 115 rutas sin validar lo que reciben |

### 3.1 Reuniones que se pueden leer sin mirar el cliente

**Qué pasa.** La regla medular número 1 es que nunca se mezcle el contexto entre clientes y que toda lectura de
reuniones pase por un solo lugar (`lib/sessions/project-sources.ts`). Casi todo la cumple: 83 archivos usan ese lugar.
Quedan cuatro excepciones:

- `app/api/sessions/[id]/enrich/route.ts:7-25`: cualquier persona interna que mande el número de una reunión recibe su
  transcripción completa, sea del cliente que sea. Lo verifiqué leyendo la ruta.
- `app/api/sessions/[id]/summarize/route.ts:7-28`: igual, pero manda la transcripción a Claude y devuelve el resumen.
  Las dos están anotadas como deuda conocida en `lib/seguimiento/guardas.test.ts:35`.
- `lib/business-cases/feeding.ts:82-125`: la propuesta comercial arma sus reuniones con su propia regla, fuera del lugar
  único. No trae reuniones de otro cliente con dueño, pero suma reuniones sin dueño que coinciden por dominio.
- `app/api/sales/analyze/route.ts:86-155`: recibe la lista de reuniones del navegador; las que no tienen dueño llegan a
  Claude para cualquiera con permiso de Ventas.

Además, `/sessions` lista título y participantes de todas las reuniones de todos los clientes a cualquier interno
(`lib/sessions/cargar-sesiones-categorizadas.ts:32`). Es a propósito, pero no cuadra con que una CSE vea solo su cartera.

**Por qué duele.** Mezclar clientes es lo que más incidentes dio en la historia de Nexus (unas 10 de las 38 entradas de
`docs/KNOWN-ERRORS.md`). Y el conector de Claude abriría una puerta nueva: si alguien la copia de estas rutas, el error
se multiplica.

### 3.2 Los documentos que guían a Claude ya no caben y dicen números viejos

**Qué pasa.**

- `docs/DECISIONS.md` pesa 1.647.289 bytes (16.443 líneas). Es el archivo más cambiado del repo: 366 commits en 60
  días. Le siguen `ARCHITECTURE.md` (323) y `docs/roadmap.md` (123). Casi toda sesión los edita, y ahí chocan.
- `ARCHITECTURE.md` dice cosas que ya no son: 197 modelos (son 237), 512 rutas (609), 13 secciones de permisos (31), un
  `lib/data-lake` que ya no existe (§7), un `ClaudeUsage` que nunca se construyó (§6) en vez de `LlmCall`. El RUNBOOK
  dice 18 trabajos automáticos y son 48. El comentario de `.github/workflows/ci.yml:10` dice «~70 errores» y la línea de
  base es 16.
- `docs/CHANGELOG.md` tuvo 3 commits en 60 días: en la práctica, se abandonó.
- `docs/KNOWN-ERRORS.md` tiene 38 entradas y crece (28 commits en 60 días).

**Por qué duele.** Cada sesión de Claude paga en contexto lo que lee, y un documento que miente lleva a repetir el error
que el documento creía resuelto. La prueba `lib/docs/doc-sync.test.ts` vigila algunos números, pero no estos.

### 3.3 Muchas sesiones en paralelo sobre lo mismo, y el CI no frena

**Qué pasa.**

- Hay 95 copias de trabajo y 202 ramas `claude/*`. En 30 días se juntaron 184 ramas en `main`, en la PC, y se subieron
  directo: el CI (`.github/workflows/ci.yml`) corre **después** de que el cambio ya está en `main`.
- El CI no corre las pruebas de integración (81 archivos), ni `next build`, ni las revisiones de datos. El único build
  de verdad es el del deploy, en el VPS que comparten unas 15 apps (`docs/RUNBOOK.md:231`; el 21 sep la CPU llegó al
  821 %; el 16 nov un build falló porque no bajó una letra de Google, `docs/KNOWN-ERRORS.md:66`).
- Las copias comparten estado: el 29 oct, al archivar 108 sesiones, se vació el `node_modules` del main
  (`docs/KNOWN-ERRORS.md:172`); el 12 nov, un `prisma generate` en una copia cambió el cliente del main (`:178`); todas
  usan la misma base de pruebas `nexus_test` (`:65`). Cuatro entradas más son por fines de línea de Windows.

**Por qué duele.** Son los fallos que más tiempo le quitan a Elías: algo se rompe sin que nadie lo haya tocado, y la
causa está en otra sesión.

### 3.4 Cada cambio de base se aplica a mano, sin registro

**Qué pasa.** Los cambios de la base son `.sql` escritos a mano (178, 42 en el último mes) que se corren antes del
deploy. No hay tabla que diga cuáles ya corrieron (`ARCHITECTURE.md`, Parte 0 · cap. D). `npm run check:esquema` dice qué
falta, y si el deploy sale sin el SQL, la salud responde 503 y el deploy vuelve atrás, pero mientras tanto el contenedor
nuevo atiende con errores durante 75 a 90 segundos (`docs/RUNBOOK.md:197`). Cuatro entradas de errores conocidos son por
esto (`docs/KNOWN-ERRORS.md:50, 54, 59, 178`).

**Por qué duele.** Es un paso a mano por cada entrega con base nueva, y Elías decidió que no quiere correrlos él.

### 3.5 Unas 35 funciones de IA hechas en casa, cada una con sus reglas

**Qué pasa.**

- 77 llamadas a Claude en 57 archivos. Unos 44 prompts viven en el código y unos 29 en la tabla `Agent`.
- Cuatro modelos mezclados, escritos a mano en cada sitio: Sonnet 4.6 en unos 44, Haiku 4.5 en 17, Sonnet 5 en una
  constante (`lib/asistente/turno.ts:222`), Opus 5.5 en 3.
- **Seis puertas para hablarle a la IA** (las cuenta el plan maestro, `docs/plan-maestro-hablar-con-nexus.md` §2.1) y
  tres módulos de chat con motores distintos: `lib/nexus-chat`, `lib/chat-de-nexus` y `lib/asistente`.
- La defensa contra instrucciones escondidas en lo que dice un cliente es dispareja. El chat «Nexus» la hace bien
  (`lib/nexus-chat/bucle.ts:31-34`: etiqueta cada resultado y le dice al modelo que es dato). Pero el generador de
  documentos más grande (`app/api/clients/[id]/analyze/route.ts:1897-1995`) pega las transcripciones en el mismo mensaje
  que sus órdenes, y la lectura de cada reunión (`lib/sessions/post-process.ts:524-546`) no dice que el texto es dato.
- 16 lecturas de JSON a mano sobre la respuesta del modelo en 13 archivos; el ayudante común
  (`lib/ai/parse-json-output.ts`) no existe.

**Por qué duele.** Cada función nueva de IA trae su propio prompt, su modelo y su forma de fallar. Es justo lo que el
rumbo del 21 nov quiere dejar de hacer («antes de construir algo, preguntarse si Claude ya lo hace»).

### 3.6 Archivos gigantes que todos tocan

**Qué pasa.** 66 archivos pasan de 1.000 líneas y 238 de 500. Los que más duelen son los grandes que además cambian
seguido (commits en 60 días):

| Archivo | Líneas | Commits |
|---|---|---|
| `components/canvas/CronogramaCanvas.tsx` | 4.969 | 49 |
| `lib/timeline/borrador.ts` | 4.632 | 49 |
| `app/api/clients/[id]/analyze/route.ts` | 3.494 (eran 3.385 el 24 oct) | 40 |
| `components/clients/ProjectCanvasPanel.tsx` | 1.560 (eran 1.364) | 43 |
| `lib/exploraciones/agente.ts` | 2.026 | 67 |

`lib/exploraciones` tiene 147 archivos y cuatro de ellos están entre los 10 más cambiados del repo.

**Por qué duele.** Dos sesiones que tocan el mismo archivo gigante chocan, y una regresión ahí cae en el centro del
trabajo (el cronograma, la preventa, la generación de documentos).

### 3.7 Todo corre en un proceso, sin respaldo probado

**Qué pasa.** Los 48 trabajos automáticos corren dentro del mismo contenedor que atiende a las personas (un reloj de 60
segundos, `lib/jobs/scheduler.ts`), con 2 núcleos y 3 GB (`docker-compose.yml:53-74`). El VPS tiene 4 núcleos y 16 GB
para unas 15 apps. El respaldo tiene huecos declarados: no se sabe si Supabase guarda la base minuto a minuto, nunca se
probó restaurarla y no hay copia del `.env` del VPS (`docs/RUNBOOK.md:1207-1210, 1251`). Las alertas de Sentry para los
trabajos que no corren se configuran a mano y no consta que estén puestas (`docs/RUNBOOK.md:225`).

**Por qué duele.** Pasa poco, pero si se pierde la base o el VPS, hoy nadie sabe cuánto se recupera ni en cuánto tiempo.

### 3.8 Candados de fondo a medio cerrar

- Los tokens de HubSpot se guardan en claro (`prisma/schema.prisma:1710-1711`, deuda #17), y el token del portal del
  cliente también (`app/external/verify-access/route.ts:84`).
- Tres tablas no encienden su RLS en su propio SQL (`ProjectBrief`, `LlmCall`, `HiloDeChat`/`MensajeDeChat`): dependen
  de que alguien vuelva a correr `npm run db:policies`, y ninguna revisión automática mira que toda tabla lo tenga.
- Nueve tipos de enlace para el cliente funcionan solo con el token en la dirección, y la mayoría no caduca.
- La persona se busca por su correo y no por su identificador de Supabase (`lib/auth/supabase.ts:95`); los filtros de
  dominio y de persona activa viven solo en el login (`app/auth/callback/route.ts:58-88`).
- Algunos registros escriben correos completos y títulos de reuniones (`app/auth/callback/route.ts:97,106`,
  `lib/google/meet-enrichment.ts:496`).
- No existe una prueba que exija guarda en toda ruta nueva de `app/api`: hoy las 595 la tienen por disciplina.

### 3.9 Pocas conexiones a la base para todos

Producción usa hasta 10 conexiones (`lib/db/prisma.ts:18-20`) de unos 15 espacios que comparte con las dos PCs y los
scripts (`docs/RUNBOOK.md:59-69`). En julio hubo 147 rechazos por falta de espacio. Hoy 72 scripts viejos crean su
propio pool sin tope (hasta 10 conexiones cada uno; por ejemplo `scripts/assign-team-roles.ts:49`), y la revisión que lo
detecta (INV6) solo avisa. Importa para el conector: cada pregunta de Claude usaría esas mismas conexiones.

### 3.10 La forma del código se aleja de la constitución

- **Módulos (§1):** de 102 carpetas de `lib/`, 5 tienen la forma completa y 74 no tienen ninguno de sus cuatro
  archivos. `lib/sessions`, que la constitución pone de ejemplo, no tiene ninguno.
- **Aislamiento (§5):** en los 10 módulos que tienen índice, 61 imports entran por él y 299 por dentro. La regla de
  ESLint que lo frenaría no está configurada.
- **Validación (§3):** de 467 rutas que reciben datos, 248 validan con Zod; 115 leen lo que llega sin validarlo. Cuatro
  de los ocho puntos públicos validan a mano, y la constitución dice empezar justo por ellos.
- **Base (§2):** 156 campos `Json`, 36 estados guardados como texto libre en vez de lista cerrada, 3 marcas
  `DEPRECATED` con fecha vencida (`prisma/schema.prisma:180, 539, 2408`).
- **Deuda §12 que no se movió:** el ítem 9 (`analyze/route.ts`) y el 10 (`ProjectCanvasPanel.tsx`) crecieron; siguen el
  7 (`accountId` en `Audit` y `Knowledge`), el 8 (`Project.canvas`), el 14 (`lastSessionSummary`, 2 lectores), el 19
  (`pendingItems`, 30 apariciones en 8 archivos), el 22 (`/api/hubspot`, `/knowledge`, `/agents` sin guarda de cliente),
  el 23 y el 24 (tarjetas viejas de contexto) y el 25 (Node 22 en Docker, 24 en CI). Se cerraron el 12, el 13 y, en la
  práctica, el 15 y el 16.
- **Código muerto:** `lib/matching/` no lo importa nadie (borrarla cierra el ítem 20); `lib/guia-exploracion/agente.ts`
  y `generateBlocks` de `lib/business-cases/agent.ts` no tienen quién los llame.

---

## 4. Oportunidades de mejora, ordenadas por impacto

Los costos son en sesiones de Claude (una sesión ≈ una tarde de trabajo de un agente) y en dinero cuando lo hay.

| # | Oportunidad | Qué ganarías | Costo | Riesgo |
|---|---|---|---|---|
| 1 | **Cerrar las cuatro lecturas de reuniones que se saltan la regla** (3.1) y sumar una prueba que exija el lugar único en toda lectura de reuniones para IA | La regla medular sin excepciones, antes de abrir la puerta del conector | ½ sesión | Bajo: puede dejar sin uso el botón «Resumir» de una reunión ajena (hay que ver quién lo usa) |
| 2 | **Nexus como conector de Claude** (plan aparte: `docs/plan-conector-claude.md`) | El equipo trabaja en su Claude con la memoria de Nexus; parte de la IA hecha en casa se puede retirar | Prototipo local: 1 sesión. Primera versión real, solo lectura: unas 3 sesiones. Asientos de Claude si el equipo no los tiene | Medio: es una puerta nueva a los datos; el plan la diseña para que no mezcle clientes |
| 3 | **Documentos que caben y no mienten:** partir `DECISIONS.md` en un archivo por módulo con un índice, y que `doc-sync` vigile también permisos, trabajos y carpetas | Menos choques entre sesiones (es el archivo más cambiado) y menos contexto gastado en cada sesión | 1 sesión, casi toda mecánica | Bajo: cambian las rutas que citan los documentos y la indicación de `CLAUDE.md` |
| 4 | **Registro de los SQL aplicados** y un deploy que no arranca si falta uno (en vez de arrancar y volver atrás) | Se acaban los 503 de esquema atrasado y el «¿ya corrió este SQL?» | 1 sesión | Bajo: no automatiza aplicar SQL en producción, solo lo registra y frena |
| 5 | **CI que frena antes de `main`:** correr `next build` y las pruebas de integración en el CI, y que la sesión que junta ramas corra lo mismo antes de subir | Los errores de build y de integración aparecen en la PC, no en el deploy | 1 sesión | Bajo; puede pasar el cupo gratis de minutos de GitHub (por confirmar con el plan de la cuenta) |
| 6 | **Copias de trabajo que no se pisan:** un script de limpieza que suelta los enlaces antes de borrar, una base de pruebas por copia y un candado para `prisma generate` | Menos fallos «que nadie tocó» | ½ a 1 sesión | Bajo |
| 7 | **«Lo que dice el cliente es dato, no orden» en toda llamada:** un ayudante común para envolver transcripciones, correos y documentos, empezando por `analyze/route.ts` y la lectura de cada reunión | Defensa pareja contra instrucciones escondidas; prerrequisito para que Claude escriba en Nexus por el conector | ½ sesión | Bajo: la salida puede cambiar un poco; se compara con 3 reuniones |
| 8 | **Modelos nuevos y más baratos:** primero el modelo en una sola constante por uso; después pasar Sonnet 4.6 a Sonnet 5.5 y Haiku 4.5 a Haiku 5.5 donde se mida igual o mejor | Sonnet 5.5 cobra un tercio menos por token (US$ 2 y 10 por millón contra 3 y 15) y Haiku 5.5 un 90 % menos (0,10 y 0,50 contra 1 y 5). Pero los modelos nuevos pueden contar el mismo texto con más tokens (hasta un 35 % con el tokenizador nuevo): con Sonnet el ahorro real va de casi nada a un tercio, y hay que medirlo. Con Haiku el ahorro es seguro, pero Haiku es una parte chica del gasto | 2 a 3 sesiones más unos US$ 10 a 20 en pruebas | Medio: los modelos nuevos rechazan forzar una herramienta (unas 42 llamadas en 38 archivos lo hacen) y, con el SDK nuevo, el parámetro `temperature` (13 sitios); la calidad de cada documento se vuelve a medir |
| 9 | **Respaldo probado:** confirmar la copia minuto a minuto de Supabase, ensayar una restauración a la base local una vez al mes, guardar el `.env` del VPS en un gestor de claves, poner las alertas de Sentry | Saber cuánto se recupera y en cuánto tiempo | ½ sesión y una hora de Elías; la copia minuto a minuto de Supabase tiene costo mensual (por confirmar) | Bajo |
| 10 | **Candados de fondo:** cifrar los tokens de HubSpot, guardar el token del portal como huella, una revisión que exija RLS en toda tabla, caducidad en los enlaces de solo token, Zod en los cuatro puntos públicos, una prueba que exija guarda en toda ruta | Defensa en profundidad si algo se filtra | 1 a 2 sesiones | Medio: migrar los tokens de HubSpot no puede cortar la sincronización |
| 11 | **Conexiones:** pasar los 72 scripts viejos al pool con tope y que INV6 falle en vez de avisar | Que un script no deje a producción sin conexiones; espacio para el conector | ½ sesión, casi mecánica | Bajo |
| 12 | **Borrar lo muerto:** `lib/matching`, el agente viejo de la guía, `generateBlocks`, `Project.canvas`, `pendingItems`, `lastSessionSummary`, los 3 `DEPRECATED` vencidos, el literal `__strategy__` (22 líneas) | Menos que leer y mantener; cierra cuatro ítems de la deuda | 1 sesión | Bajo: cada borrado con su búsqueda de lectores |
| 13 | **Partir los archivos gigantes al tocarlos,** con pruebas que congelen la salida antes: `analyze/route.ts` primero (deuda #9) | Menos choques y regresiones en el centro del trabajo | 2 a 4 sesiones por archivo | Medio-alto. Conviene esperar: el conector y el plan maestro pueden retirar partes de `analyze` |
| 14 | **Node 24 en los tres entornos** (deuda #25) | Lo mismo en la PC, el CI y producción | ½ sesión y un deploy propio | Medio: es el único cambio que toca el motor de producción |

**Lo que recomiendo empezar ya:** la 1 (es barata y protege la regla de oro antes del conector), la 3 y la 4 (quitan
fricción de todas las sesiones), y el prototipo local de la 2.

---

## Para el roadmap

- **Qué cambió:** nada en el código. Este documento mide cómo está construido Nexus el 23 nov y propone 14 mejoras
  ordenadas por impacto.
- **Encaja con:** «Hablar con Nexus» (el plan maestro) y el conector de Claude (`docs/plan-conector-claude.md`).
- **Pruebas:** ninguna; cada mejora trae las suyas.
- **Espera:** que Elías elija cuáles entran y en qué orden.
