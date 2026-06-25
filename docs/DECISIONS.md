# Decisiones (ADR-lite) — no re-litigar

Decisiones ya tomadas, con el porqué. Si vas a cambiar una, primero entendé por qué se tomó.

## Sesión → cliente → proyecto
- **Fuente única de ownership = `FirefliesSession.resolvedClientId`** (materialización de
  `categorizeSession`, el MISMO cascade que /sessions). Todos los consumidores la leen vía el
  chokepoint `lib/sessions/project-sources.ts`. *Por qué:* la resolución estaba dispersa en
  3-4 implementaciones (una con title-match débil) → leak cross-empresa (handoff de DISTELSA
  con sesiones de Tiendas Monge / CAV / AMVAC). Se unificó y se borraron las re-implementaciones
  (`sessionMatchesClient` de `analysis-context.ts`, `searchFirefliesFromDB` de `analyze`).
- **Cascade (`categorize.ts`), orden:** manual → 100% interna + título → dominio
  (`emailDomains` + `company`) → categoría → **HubSpot→Client** (dominio→company ligada vía
  `Client.hubspotCompanyId`) → título (fallback débil) → orphan. El **dominio manda antes que
  el título**.
- **HubSpot→Client es ADITIVO, no "corte":** si la company de HubSpot NO está ligada a un Client,
  en la materialización cae al título (no a null). *Por qué:* el "corte" perdía sesiones
  legítimas de clientes cuyo dominio real está en HubSpot pero NO registrado en el Client
  (Mr Wings→tecnofood.com.mx, Honda→facocr.com). Fix de raíz: registrar esos dominios en
  `emailDomains` → resuelven por dominio (fuerte) y se puede endurecer a "corte". El flag
  `groupUnlinkedHubspotCompany` activa el bucket "hubspotCompany" SOLO en el display de /sessions.
- **Regla de oro stopwords (title-match):** solo conectores/proceso genéricos (`para`,
  `pruebas`, `sesion`, `demo`, `cierre`…). **NUNCA** un token que sea el nombre distintivo de un
  cliente real — medido: stopwordear `smarteam` tira 2342 sesiones a 0; `distribuidora`/`materiales`
  rompen DISTELSA.
- **NO registrar dominios COMPARTIDOS** (genéricos gmail/hotmail, o de agencias que trabajan con
  varios clientes) en `emailDomains` de un solo cliente: sería un leak con otra cara — le colaría
  las sesiones de todos los que usen ese dominio. Solo se registran dominios ÚNICOS por empresa,
  confirmados a mano.
- **Entidades del MISMO GRUPO no son leak.** Ej.: "Distribuidora Larce" ⊂ Grupo DISTELSA →
  que una sesión de Larce resuelva a DISTELSA es CORRECTO, no cross-empresa. (Se había tratado
  como residual del catch-all de título; en realidad la resolución estaba bien.) Antes de
  "arreglar" una resolución sospechosa, verificá si las entidades pertenecen al mismo grupo/holding.
- **`categorize.ts` (ownership) vs `lib/matching/cascade.ts` (sync):** son DOS matchers distintos
  a propósito (cascade.ts es más estricto, con contactos HubSpot, para sync/GPS/process-session).
  Reconciliarlos es deuda trackeada (ARCHITECTURE.md #20); no se tocó en el fix del leak.

## Handoff / generación
- **Relevancia de sesión para handoff:** título de handoff/kickoff O Ventas en la sala
  (`lib/handoff/session-relevance.ts`). Override por sesión (`SessionProject.handoffOverride`):
  lo manual manda; la "X" del panel solo SACA del handoff (no desvincula del proyecto).
- **`hasHandoff` = bloques generados > 0**, no existencia del entity Handoff (un entity vacío no
  cuenta — evita el "ya tiene handoff" fantasma tras un reset).
- **Owner = Lorena solo al CREAR de cero** (vía `HUBSPOT_HANDOFF_OWNER_ID`), no al adjuntar.

## Infra
- **Una sola Supabase** (local == PROD). Migraciones a mano. Scripts destructivos/masivos
  dry-run-first; el usuario aprueba el `--apply`.
