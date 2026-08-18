# Errores conocidos — síntoma → causa → guarda

No tropezar dos veces. Si pisás uno nuevo, agregalo acá.

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
  Si ves la misma empresa como 2 `Client`, mergealos (`scripts/merge-duplicate-clients.ts`), no
  los dejes conviviendo: inflan falsos ambiguos y diluyen las señales.
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
