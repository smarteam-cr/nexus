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
  viejo (no entra por HMR) o la columna no se aplicó a PROD a mano. *Guarda:* tras `npm run db:sync`
  reiniciar el dev server; aplicar la migración a mano a PROD.
- **CSS/estilos rotos tras `git pull`.** *Causa:* caché de Turbopack stale. *Guarda:* `rm -rf .next`
  + reiniciar (un restart solo no alcanza).
- **El preview del navegador no está logueado** → middleware redirige al login. *Guarda:* el E2E de
  UI autenticada lo hace el usuario por HMR; el bar de Claude = tsc+lint + dev compila.
- **Migración legacy `migrate-sessions-to-projects.ts`** linkeó sesiones a proyectos de forma gruesa
  → links cross-client. *Guarda:* `scripts/cleanup-cross-client-session-projects.ts` (dry-run).
