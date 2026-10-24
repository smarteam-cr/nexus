# Errores conocidos — síntoma → causa → guarda

No tropezar dos veces. Si pisás uno nuevo, agregalo acá.

- **Una reunión tiene el texto, la minuta o las tareas de OTRA reunión (a veces de otro cliente).** *Causa:* sin
  documento adjunto, el enriquecimiento tomaba de Drive el archivo más nuevo con las dos primeras palabras del título,
  y cuando llegaba el documento correcto la lectura no se rehacía. *Guarda:* `lib/google/drive-candidatos.ts` +
  `lib/sessions/reanalizar.ts`. *Señal:* la primera línea de la transcripción nombra otra reunión, o la minuta se creó
  antes del último `enrichedAt`. Lo viejo: `scripts/limpiar-analisis-de-otra-reunion.ts`.
- **Una reunión de una hora o más quedó sin transcripción aunque Gemini la tomó.** *Causa:* hasta el 2026-10-17 se
  leía una hora después del inicio y se sellaba vacía. *Guarda:* `listaParaLeer` + la espera de 48 horas. Lo viejo:
  `recuperar-transcripts-meet.ts --solo-antes-de-terminar`.
- **Un test de guarda que busca «
}
» falla solo en Windows.** *Causa:* con `core.autocrlf` los archivos llegan con
  CRLF. *Guarda:* el test normaliza los fines de línea al leer (`lib/tareas/guardas.test.ts`).

- **Handoff con sesiones de OTRA empresa** (leak cross-cliente). *Causa:* resolución
  sesión→cliente dispersa + title-match con catch-all (`para` matcheaba "Empresa para pruebas"
  y DISTELSA) + la generación confiaba ciego en links `SessionProject` legacy. *Guarda:*
  chokepoint `lib/sessions/project-sources.ts` (todo el ownership pasa por ahí) + stopwords
  genéricos **y** `computeAmbiguousNameTokens` en `categorize.ts` (ignora en el title-match
  cualquier token presente en 2+ EMPRESAS DISTINTAS — `grupo`, `para`… SIN hardcodear lista) +
  `npm run check:invariants` (falla si un `SessionProject` cruza cliente).
  *OJO 1:* entidades del mismo grupo/holding NO son leak (ej. Distribuidora Larce ⊂ Grupo DISTELSA
  → "Larce→DISTELSA" es correcto). Verificá el grupo antes de "arreglar" una resolución sospechosa.
  *OJO 2:* el detector es subset-aware a propósito — los registros DUPLICADOS de la misma empresa
  (un token-set ⊆ del otro) NO cuentan como ambiguos (si no, "Construtecho"/"MINEC" caían a 0).
  Si ves la misma empresa como 2 `Client`, fusiónalos (`scripts/merge-duplicate-clients.ts`, que desde
  el 2026-10-01 también une sus cuentas de cobro; ver RUNBOOK › Cobranza), no los dejes conviviendo:
  inflan falsos ambiguos y diluyen las señales.
- **Un cliente real cae a 0 (o pierde) sesiones al re-resolver.** *Causa:* su dominio real no
  está en `emailDomains` y HubSpot lo tiene como company no ligada → con el "corte" las sesiones
  caen a null. *Guarda:* HubSpot→Client es ADITIVO (cae al título, no corta); registrar el
  dominio real (solo si es ÚNICO por empresa); el backfill avisa si un cliente real queda en 0.
- **Registrar un dominio COMPARTIDO en un cliente = leak con otra cara.** Un dominio genérico
  (gmail) o de agencia apuntado a un solo cliente le cuela las sesiones de todos. *Guarda:* solo
  dominios únicos por empresa, confirmados a mano.
- **Token de HubSpot del sistema da 401 aunque `expiresAt` diga válido.** *Causa:* clock skew /
  rotación entre PROD y local (comparten la cuenta del sistema). *Guarda:* `forceRefreshSystemToken`
  + retry-on-401 en `/api/handoffs/lookup`.
- **"Unknown field" / P2022 tras cambiar el schema.** *Causa:* el dev server tiene el Prisma client
  viejo (no entra por HMR) o la columna no se aplicó a PROD a mano. *Guarda:* tras aplicar el `.sql`
  correr `npx prisma generate` y reiniciar el dev server (flujo completo: ARCHITECTURE Parte 0 ·
  cap. D); INV7 de `check:invariants` detecta la columna sin aplicar.
- **Un módulo nuevo revienta con P2021 en el `dev:prod` (3004) en vez de decir «falta el SQL».** *Causa:* el
  aviso miraba solo `modeloDisponible` (que el CLIENTE conozca el modelo); en el 3004 el cliente está regenerado y la
  base de producción todavía no tiene las tablas. Pasó con Tareas el 2026-10-09. *Guarda:* mirar las dos puntas — el
  cliente Y la base (`tareasDisponible()` consulta el catálogo con `to_regclass`, guardado) — y atrapar
  `esquemaDesactualizado(e)` en la carga de la página y en el traductor de errores de las rutas.
- **Un test de integración falla con «la columna X no existe» y el código está bien.** *Causa:* `nexus_test` quedó
  atrás de `scripts/sql/` (pasó el 2026-10-10 con `LecturaDeReunion.seguimientoIntentos`: siete tests de Tareas en
  rojo). Y el bootstrap no la ponía al día: un `.sql` que no se podía correr dos veces
  (`2026-08-17-cortes-aguinaldo-atribucion.sql`) lo frenaba desde agosto en toda base que ya existía. *Guarda:*
  `test/global-setup.integration.ts` aplica los `.sql` posteriores al baseline antes de cada `npm run test:int`, y
  si uno falla al reaplicarse lo dice con su nombre: se arregla el `.sql`, no se saltea.
- **CSS/estilos rotos tras `git pull`.** *Causa:* caché de Turbopack stale. *Guarda:* `rm -rf .next`
  + reiniciar (un restart solo no alcanza).
- **El preview del navegador no está logueado** → middleware redirige al login. *Guarda:* el E2E de
  UI autenticada lo hace el usuario por HMR; el bar de Claude = tsc+lint + dev compila.
- **Migración legacy `migrate-sessions-to-projects.ts`** linkeó sesiones a proyectos de forma gruesa
  → links cross-client. *Guarda:* `scripts/cleanup-cross-client-session-projects.ts` (dry-run).
- **Turbopack no re-lee CSS importado con `@import` en dev** (`globals.css` → `landing-engine.css` /
  `kickoff-landing.css`) — un error de compilación viejo queda pegado aunque el archivo ya esté bien.
  *Guarda:* si `npm run build` corrió con el dev server encendido, eso envenena `.next` (comparten
  caché) y sobrevive a reiniciar y a `rm -rf .next` — nunca buildear con el dev arriba. Para destrabar
  una caché ya envenenada: tocar `app/globals.css` (el punto de entrada) re-parsea toda la cadena.
- **Editar archivos CRLF con Python duplica los retornos de carro, y ni `tsc` ni los tests lo cazan**
  — solo el build (PostCSS), y encima señala un archivo que no se tocó. *Causa:* escribir con
  `newline="\r\n"` sobre una cadena que YA trae `\r\n` duplica a `\r\r\n`. *Guarda:* escribir en
  binario sin traducción (`io.open(p,"wb").write(s.encode("utf-8"))`); antes de commitear una tanda
  de ediciones por script: `for f in $(git diff --name-only); do grep -qU $'\r\r' "$f" && echo "⚠ $f"; done`.
- **Una regex escrita a un `.ts` desde Python pierde sus `\b`, y el código compila igual.** *Causa:* en una cadena de
  Python sin `r`, `"\b"` es un retroceso (`\x08`): la regex queda con ese carácter y nunca matchea. Pasó el 2026-10-19
  en `loEsperaDeSmarteam`; lo cazó la prueba. *Guarda:* cadenas `r"…"` (o el Write del agente) para todo lo que lleve
  barras; para buscar: `python -c "import glob;[print(f) for f in glob.glob('lib/**/*.ts',recursive=True) if '\x08' in open(f,encoding='utf-8').read()]"`.
- **Re-sembrar el prompt de un agente puede borrar una edición humana irrecuperable** (sin backup).
  *Guarda:* antes de correr cualquier seed de agente, comparar el sha256 del `systemPrompt` en prod
  contra TODAS las versiones del script en git (`scripts/comparar-prompt-vivo.ts`); si no coincide
  con ninguna, lo editó un humano y no se corre. Los `.ts` del repo miden distinto por CRLF vs LF en
  la base — no comparar por longitud.
- **El backfill de atribución de sesiones (`resolvedClientId`) no "pega" si se corre antes del
  deploy.** *Causa:* el backfill corre con el código LOCAL; producción re-resuelve sola con el código
  DEPLOYADO — si difieren, cada uno pisa al otro y el dry-run se repite igual después de aplicado.
  *Guarda:* backfill SIEMPRE después del deploy. Señal de que está pasando: el delta no baja tras
  aplicar y el `updatedAt` de las filas es posterior al apply. *OJO:* el script de limpieza de
  vínculos cruzados puede borrar vínculos CORRECTOS si la reunión de verdad nombra a dos clientes en
  el título — ahí el vínculo está bien y lo que está mal es el dueño asignado; se corrige a mano en
  `/sessions`, no borrando el vínculo.
- **Se cambia el CSE encargado y la celda vuelve al anterior.** *Causa (2026-10-19, Librería Internacional):* (1) un
  proyecto fusionado en HubSpot responde 200 con el id y los datos del que sigue, así que la reconciliación lo daba por
  vivo y su fila quedaba activa con el encargado viejo; (2) después de escribir, la sincronización del pase se la saltaba
  el piso de 60 s (la ficha se sincroniza sola al abrirse). *Guarda:* `fusionadoEn` en la verificación del espejo y la
  relectura dirigida del pase (`lib/hubspot/proyecto-fusionado.ts`); `scripts/proyectos-fusionados-en-hubspot.ts` lista
  (y con `--apply` da de baja) los que quedaron.
  ⚠ *La segunda vez, el mismo día, con ese arreglo ya en producción:* la relectura dirigida pide el id fusionado y HubSpot
  devuelve el del que sigue (también en `batch/read`), así que actualizaba la fila NUEVA y dejaba la vieja activa: solo la
  corrida completa la daba de baja, y el piso la saltaba. Y el listado juntaba los dueños de todos los proyectos activos y
  mostraba el primero. *Guarda:* el espejo dirigido da de baja la fila del id pedido cuando vuelve otro
  (`lib/hubspot/sync-projects.ts`), la columna sale de la regla única (`lib/cuentas/encargado.ts`) y la ruta del pase
  responde 409 si después de sincronizar Nexus no lee a la persona nueva.
- **«Perdí el cronograma (y el kickoff, el handoff…)» de un cliente, y los datos están.** *Causa (2026-10-19, Cemaco):* le llegó de HubSpot un segundo proyecto (Desarrollo, «CEMACO ») y la ficha, que con un solo proyecto abría directo en él, pasó a abrir en la cuenta; la CSE entró al proyecto nuevo, vacío. *Guarda:* con varios proyectos la ficha abre en el de quien mira, o en el del tipo de su equipo, y arriba dice «Esta cuenta tiene otro proyecto» (`lib/clients/proyecto-inicial.ts`). *Antes de «recuperar» nada:* contar `TimelineTask` y `CanvasBlock` por proyecto del cliente; si están en el otro, no hay nada que mover.
- **La misma empresa dos veces: una con los proyectos y otra creada en Cobranza.** *Causa:* «Nueva empresa» de Cobranza busca la empresa por su id de origen, por la que confirma la persona o por el dominio, nunca por el nombre: sin dominio y sin confirmar, crea una ficha `source = "manual"` sin empresa de HubSpot (Cemaco y Total Finco, sep 2026). *Guarda:* `scripts/merge-duplicate-clients.ts`, quedándose con la que tiene la empresa de HubSpot y los proyectos.
- **"Creé un proyecto en HubSpot y Nexus no lo ve."** *Causa:* la empresa se fusionó en HubSpot — el
  id viejo sigue respondiendo 200 con los datos del sobreviviente (nombre, dominio, fecha, todo
  correcto), pero las asociaciones (proyectos) se mudaron; no hay 404 ni ningún campo que lo marque.
  *Guarda:* comparar el id que Nexus guarda contra el que devuelve HubSpot ANTES de revisar
  asociaciones o permisos. *OJO:* un 404 no es señal de fusión (también lo da un id borrado, de otro
  portal, o mal tipeado).
- **Un alta puede quedar trabada para siempre sin romper nada visible** (no cobra, no aparece en
  cartera, no le nace nada — ni tipos, ni build, ni tests lo cazan). *Causa:* el motor compara el
  pipeline contra un campo que un camino de alta ("Traer de HubSpot") nunca llega a escribir, así que
  la comparación da distinto siempre. *Guarda:* ningún alta puede llevar más de 12h a medio hacer
  (INV14). *OJO:* `altaEstado != null` no significa "en curso" — `listo` también se persiste ahí.
- **Push rechazado por la otra PC: si el conflicto muestra el archivo ENTERO en rojo, casi nunca es
  un conflicto real.** *Causa:* un lado quedó en CRLF y el otro en LF — git ve todas las líneas como
  distintas aunque el contenido real difiera en 2-3 bloques. *Guarda:* antes de resolver, mirar la
  diferencia real (`diff <(tr -d '\r' < A) <(tr -d '\r' < B)`); elegir "un lado" a ciegas borra en
  silencio el trabajo del otro. Correr tsc + suite + build sobre lo YA mezclado antes de pushear — el
  rebase puede compilar y aun así haber perdido asserts.
- **Dos números que deberían "cuadrar" y no cuadran a veces está bien así** (ej.: "Con proyecto
  abierto" en `/clients` no coincide con Éxito del cliente, a propósito — usan criterios distintos por
  diseño). *Guarda:* antes de "alinear" dos números que no calzan, confirmar si el criterio es
  realmente el mismo — alinearlos a ciegas puede apagar un filtro sin que nada avise.
- **La fecha estimada de arranque nunca se escribe en `anchorStartDate`.** *Causa:* ese campo dispara
  cobranza (factura desde ahí), alertas de "el arranque cambió" cuando no cambió, y marca proyectos
  como estancados el mismo día — se lee 222 veces en 46 archivos como dato CONFIRMADO. *Guarda:* una
  fecha deducida se muestra y se pregunta; el campo se escribe SOLO con un clic humano explícito.
- **Si un arreglo solo funciona desactivando otra cosa, el arreglo está mal, no la otra cosa.**
  *Causa real:* un aviso de fusión de fases del cronograma solo aparecía rompiendo el matching
  posicional que evitaba duplicados — cuanto más se parecían los nombres, peor el resultado. *Guarda:*
  si una funcionalidad nueva obliga a reordenar o apagar una guarda existente para poder probarse, es
  señal de que no tiene un lugar real, no de que falta ajustar el orden.
- **Un script de consola muere al cargar con «Cannot find module 'server-only'».** *Causa:* `server-only` lo resuelve Next, no es un paquete; un script (`npx tsx scripts/...`) que llega de rebote a un módulo con `import "server-only"` no arranca, y tsc no lo ve. Pasó el 2026-10-10: `lib/lecturas/cola.ts` lo sumó y 24 scripts (check-invariants entre ellos) dejaron de arrancar. *Guarda:* `import "./lib/permitir-server-only";` después de `dotenv/config`, y `lib/db/scripts-server-only.test.ts`, que recorre los imports de cada script y falla si llega a `server-only` sin el shim.
- **INV1 en rojo con reuniones de un prospecto colgadas de proyectos de Smarteam.** *Causa:* la reunión se resolvió
  primero a un cliente (por título, «… + SMARTEAM») y el clasificador la vinculó a sus proyectos; cuando después ganó su
  dueño real (el dominio del prospecto), los vínculos viejos quedaron. El clasificador solo suelta vínculos al volver a
  clasificar, y un prospecto sin proyectos nunca se clasifica. Pasó el 2026-10-16 con 17 vínculos (CasaMax, Polaris,
  Quálitas…). *Guarda:* `scripts/cleanup-cross-client-session-projects.ts`, revisando antes caso por caso si el que está
  mal es el dueño (STLA: el handoff de Secure Title quedó por título en una ficha de cobro del mismo grupo; ahí se
  corrige el dueño en /sessions, no el vínculo).
- **Una reunión que ya pasó aparece con fecha futura (INV16 a) y su transcript es de otro día.** *Causa:* alguien movió
  el MISMO evento del calendario a una fecha nueva después de la reunión; la sync de Meet le pisa `date` a la fila y
  conserva el transcript viejo (`cambiosDeSesion`). Si la reunión nueva trae otro Doc de Gemini, el reset por Doc nuevo
  borra el transcript viejo. Visto el 2026-10-16 (kickoff de Spectrum, seguimiento CS + RevOps). Sin guarda todavía.
- **Una sesión de Claude Code se queda sin contexto a las pocas horas.** *Causa:* `CLAUDE.md` importaba con `@` el
  DECISIONS, el GLOSSARY y el RUNBOOK: 411.000 tokens (41 % de la ventana) cargados antes del primer mensaje, medido el
  2026-10-20. *Guarda:* esos tres son punteros con su condición; con `@` solo van ARCHITECTURE y este archivo. Antes de
  sumar un `@` a `CLAUDE.md`, medir el archivo (`wc -c`).
- **`npx tsc --noEmit` muere con «JavaScript heap out of memory» en la PC** (2026-10-24). *Causa:* el chequeo de tipos ya
  pide más de 4 GB (RUNBOOK › «BUILD FALLO»), y Node 24 arranca con un tope cercano a ese. No es un error del código:
  no dice nada de los tipos. *Guarda:* `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p .` (PowerShell:
  `$env:NODE_OPTIONS="--max-old-space-size=8192"`).
