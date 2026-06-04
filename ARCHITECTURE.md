# Nexus — Constitución arquitectónica

> Este documento es **la fuente de verdad** sobre cómo se construye y evoluciona Nexus. Cualquier cambio importante debe poder defenderse contra estas reglas. Si una regla deja de tener sentido, el documento se cambia *antes* del código.

## 0. Contexto

Nexus es la plataforma interna del equipo de Customer Success Engineers (CSE) de Smarteam, una consultora de HubSpot. Hoy es **puramente interna** (acceso solo del equipo), pero estamos por abrir el primer módulo con **superficie externa a clientes finales** (onboarding con su propio login). En el futuro, la app podría evolucionar hacia un SaaS — las decisiones de hoy no deben cerrar esa puerta.

**Dos planos de acceso (interno y externo), con roles dentro del interno. Una sola identidad (Supabase Auth):**

1. **Equipo interno** (`AppUser.kind="INTERNAL"`, vinculado a un `TeamMember`). Un solo plano, con distintos roles internos:
   - `CSE`, `PM`, `SALES`: acceso a clientes donde son owner en HubSpot, más overrides explícitos otorgados por un admin.
   - `ADMIN`, `SUPER_ADMIN`: acceso total para soporte/testing y para gestionar overrides. El Super Admin no es un plano distinto, es un rol elevado dentro del mismo plano interno.
2. **Cliente externo final** (`AppUser.kind="EXTERNAL"`, vinculado a un `Client`). Acceso *solo* a sus propios datos, en endpoints `app/api/external/...` con RLS de Supabase como segunda barrera.

---

## 1. Estructura por módulo

**Regla**: cada módulo funcional vive en una "rebanada vertical" repetible, siempre con la misma forma. Si un módulo no respeta esta forma, hay que arreglarlo o explicar por qué la rompe.

**Forma estándar de un módulo `foo`:**

```
app/
  foo/                     # rutas UI del módulo (Server Components)
    page.tsx
    [id]/page.tsx
  api/foo/                 # endpoints HTTP del módulo
    route.ts
    [id]/route.ts
    [id]/<action>/route.ts
components/foo/            # componentes React específicos del módulo
lib/foo/                   # lógica de dominio del módulo
  index.ts                 # exports públicos
  queries.ts               # lecturas Prisma del módulo (cachéables)
  mutations.ts             # escrituras Prisma del módulo
  schema.ts                # schemas Zod para inputs/outputs del módulo
  agents/                  # (si aplica) prompts y orquestación IA del módulo
prisma/schema.prisma       # los models del módulo viven acá con comentario de sección
```

**Excepción permitida**: los core helpers (`lib/db`, `lib/auth`, `lib/anthropic`, `lib/integrations/*`) no son módulos, son infra compartida.

**Por qué**: con esta forma, cualquiera que entra a un módulo nuevo encuentra todo en 60 segundos. Hoy `lib/sessions/` se acerca a este patrón; `clients/` y `projects/` no, y se refactoran como parte de la deuda urgente.

---

## 2. Schema Prisma como fuente única de verdad

**Reglas**:

1. **Una fila = una fuente de verdad para su contenido.** Prohibido duplicar campos derivables. Si `SessionMinute.summary` ya existe, **no** se mantiene `Project.lastSessionSummary` en paralelo.
2. **FKs siempre obligatorias salvo razón explícita comentada.** Una FK nullable debe llevar comentario `// nullable porque ...`.
3. **Sin "FK suaves" (campos `xxxId: String?` sin relación Prisma).** Si necesita FK, declárese con `@relation`. Si es ID externo (HubSpot, Google), prefíjese: `externalHubspotPortalId` etc.
4. **Naming consistente**: camelCase Prisma. FKs internas terminan en `Id`. Booleans empiezan con `is`/`has`/`should`. Timestamps son `createdAt` / `updatedAt` / `xxxAt`.
5. **Relaciones N:N siempre con tabla pivote**, nunca con `Json[]`. Ejemplo correcto: `SessionProject`. Ejemplo erróneo histórico que se elimina: `Project.pendingItems: Json?`.
6. **Enums Prisma para estados.** Prohibido tener `status: String` y validar con if/else en código.
7. **Cascadas explícitas.** Cada `@relation` declara `onDelete` con uno de: `Cascade`, `SetNull`, `Restrict`. Nunca dejar el default.
8. **Comentarios de sección y de modelo obligatorios.** Cada modelo abre con un comentario de 1 línea explicando para qué existe.
9. **No hay "campos legacy" perpetuos.** Si un campo está deprecated, va con `// DEPRECATED — eliminar después de <fecha o evento>`. Si pasa la fecha, se elimina o se actualiza el deadline con justificación.

**Por qué**: la deuda actual del schema (FKs duales `accountId+clientId`, `Project.canvas`, `pendingItems Json`) viene de saltarse estas reglas durante migraciones que nunca se cerraron. La regla 9 fuerza el cierre.

---

## 3. Validación en las fronteras

**Regla**: **ningún dato entra a la lógica de negocio sin pasar por un schema Zod**. La frontera es donde el dato cruza de externo (HTTP body, query, params, env vars críticos) a interno.

**Implementación obligatoria:**

- Helper compartido `lib/api/parse.ts`:
  ```ts
  export async function parseBody<T>(req: Request, schema: z.ZodSchema<T>): Promise<T> {
    let raw: unknown;
    try { raw = await req.json(); } catch { throw new BadRequestError("JSON inválido"); }
    const result = schema.safeParse(raw);
    if (!result.success) throw new BadRequestError(formatZodError(result.error));
    return result.data;
  }
  ```
- Cada route que recibe body **debe** llamarlo. Sin excepciones.
- Los schemas viven en `lib/<modulo>/schema.ts` y se exportan junto con tipos derivados (`z.infer<typeof Schema>`).
- Validar también `params` cuando son ids (deberían ser cuids: `z.string().cuid()`).

**Por qué**: hoy hay ~90 endpoints con validación manual heterogénea, payloads corruptos llegan a Prisma, errores de Prisma se filtran al usuario, y los bugs son invisibles. Zod ya está instalado pero sin uso — esto cierra la brecha sin agregar dependencias.

---

## 4. Autenticación y autorización

**Modelo de identidad**: **Supabase Auth es el único sistema** de identidad. La distinción interno/externo es un atributo del usuario, no dos sistemas de auth diferentes.

### 4.1 Identidad unificada con Supabase Auth

- **Cada persona** que entra a Nexus (CSE de Smarteam o cliente final) tiene un `auth.users` en Supabase. La cookie/sesión la maneja `@supabase/ssr`.
- **Tabla `AppUser`** vincula `auth.users.id` con el contexto interno de Nexus:
  ```prisma
  model AppUser {
    id           String   @id @default(cuid())
    authUserId   String   @unique           // FK suave a auth.users.id de Supabase
    email        String   @unique
    kind         AppUserKind                // INTERNAL | EXTERNAL
    teamMemberId String?  @unique           // si INTERNAL → FK a TeamMember
    clientId     String?                    // si EXTERNAL → FK a Client (su organización)
    createdAt    DateTime @default(now())
  }
  enum AppUserKind { INTERNAL EXTERNAL }
  ```
- Helpers en `lib/auth/`:
  - `requireUser()` → devuelve `AppUser` o lanza 401.
  - `requireInternalUser()` → devuelve `{ user: AppUser, teamMember: TeamMember, role }` o lanza 403.
  - `requireExternalUser()` → devuelve `{ user: AppUser, clientId: string }` o lanza 403.
- **El selector "Soy X" se elimina.** Cada persona se loguea con su propia cuenta Supabase. No hay impersonación de "soy otro CSE" — ni siquiera para Super Admin. El Super Admin accede a todos los clientes a través de su rol (ver 4.2), no asumiendo otra identidad.

### 4.2 Roles internos

`TeamMember` gana `role: TeamRole`:
```prisma
enum TeamRole { CSE PM SALES ADMIN SUPER_ADMIN }
```

- **Super Admin / Admin**: acceso a todos los clientes y a otorgar permisos.
- **CSE / PM / Sales**: acceso por defecto solo a clientes donde son owner o tienen override (ver 4.3).

### 4.3 Asignación CSE ↔ Cliente — sistema dual

**Granularidad: el acceso se otorga a nivel CLIENTE, no a nivel proyecto.** Si un CSE es owner en HubSpot de al menos un proyecto de un cliente, tiene acceso a **todos** los proyectos y datos de ese cliente, incluidos los proyectos donde otros CSE son owner. Esta decisión es intencional: el equipo es pequeño y colaborativo, y compartimentar por proyecto generaría silos innecesarios — el contexto completo del cliente (otras conversaciones, otras decisiones, otros riesgos en paralelo) es deseable para que cualquier CSE colabore inteligentemente. Si en el futuro aparece un caso real donde se necesite confidencialidad entre proyectos de un mismo cliente (ej. un consultor freelance que solo puede ver un proyecto), esta regla debe revisarse — pero hoy se decide explícitamente lo contrario.

**Default automático**: el campo ya existente `Project.hubspotOwnerEmail` define qué CSE es owner de cada proyecto. Por extensión, ese CSE tiene acceso al cliente (y por la regla de granularidad de arriba, a todos los proyectos del cliente). Cambio cero en datos: aprovechamos lo que ya viene de HubSpot.

**Override manual bidireccional**: tabla `ClientAssignment`
```prisma
model ClientAssignment {
  id          String   @id @default(cuid())
  clientId    String
  teamMemberId String
  kind        AssignmentKind                  // GRANT | REVOKE
  grantedById String                          // FK a TeamMember admin/super
  reason      String?  @db.Text
  createdAt   DateTime @default(now())

  @@unique([clientId, teamMemberId])
}
enum AssignmentKind { GRANT REVOKE }
```

- `GRANT`: admin le da acceso a un CSE a un cliente que NO es su owner en HubSpot.
- `REVOKE`: admin le quita acceso a un CSE a un cliente que SÍ es su owner en HubSpot (raro pero útil).

**Permiso "ver todos los clientes"** otorgado por admin (caso "Pedro necesita ver el portfolio entero esta semana"):
```prisma
model TeamMember {
  // ...
  canViewAllClients Boolean @default(false)
  canViewAllExpiresAt DateTime?              // opcional, para grants temporales
}
```

### 4.4 Helper de ownership

```ts
// lib/auth/access.ts
export async function requireAccessToClient(clientId: string): Promise<{
  user: AppUser;
  reason: "super-admin" | "admin" | "view-all" | "hubspot-owner" | "granted" | "external-owner";
}>
```

Lógica de resolución:
1. Si el user no está logueado → 401.
2. Si es `EXTERNAL` y `user.clientId === clientId` → OK (reason: external-owner). Si no, 403.
3. Si es `INTERNAL` con role `SUPER_ADMIN` → OK.
4. Si tiene `canViewAllClients=true` (y no expiró) → OK.
5. Si existe `ClientAssignment(clientId, teamMemberId, kind=REVOKE)` → 403, fin.
6. Si tiene `ClientAssignment(clientId, teamMemberId, kind=GRANT)` → OK.
7. Si el cliente tiene algún `Project.hubspotOwnerEmail === user.email` → OK.
8. Si no → 403.

**Endpoints internos** llaman a `requireAccessToClient(clientId)` en la primera línea. **Endpoints externos** viven en `app/api/external/<modulo>/...` y filtran por `clientId` del JWT sin excepción.

### 4.5 Row Level Security en Supabase

**Estado actual (junio 2026, post-Fase 1 del módulo externo)**: lock-down total.

**Regla simple**: **TODAS las tablas del schema `public` tienen RLS habilitado** (31 de 31, excepto `_prisma_migrations` que es metadata interna de Prisma y no se expone vía PostgREST). La mayoría sin policies SELECT — con anon/JWT no se lee nada. Solo bypassean los roles `postgres` (que usa Prisma) y `service_role`, ambos con `BYPASSRLS=true`.

**Por qué TODAS y no solo las cliente-visibles**: descubrimos durante la verificación que Supabase, por default, auto-otorga `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon`. Eso significa que **cualquier tabla sin RLS habilitado es leíble con la publishable key**, que está en el bundle JS del browser y por lo tanto disponible para cualquier persona. Antes del lock-down total, `FirefliesSession` (15.385 transcripts), `TeamMember` (16 emails internos), `AgentRun` (61 outputs IA crudos) y `KnowledgeDocument` (contenido propietario) eran extraíbles con una llamada `supabase.from(t).select('*')` desde cualquier máquina. El plan original había declarado "alcance quirúrgico, solo las 5 tablas de la superficie externa" — eso fue diagnóstico incorrecto. La regla correcta es "RLS en todo, policies SELECT solo donde se necesite acceso externo legítimo".

**Tabla con policy explícita (1)**:
- `HubspotAccount` tiene `deny_all_non_superuser` AS `RESTRICTIVE FOR ALL TO PUBLIC USING (false)`. Bloquea TODO para cualquier rol no-superuser, incluso si después alguien agrega policies permisivas (las RESTRICTIVE se AND, las PERMISSIVE se OR — `false AND anything = false`). Defensa en profundidad para los tokens OAuth de HubSpot (que hoy están en texto plano — deuda 🟡 #17).

**Cómo conviven RLS y los dos modos de acceso a DB**:
- **Queries internas** usan Prisma con `DATABASE_URL` privilegiado (rol `postgres` con `BYPASSRLS`). RLS las ignora. Los helpers `requireInternalUser()` + `requireAccessToClient()` son la primera barrera.
- **Queries externas** (cuando existan) deberán usar el cliente Supabase con JWT del usuario externo (no `service_role`). RLS hace de segunda barrera incluso si un endpoint olvida filtrar.
- **Las 5 tablas de la superficie externa futura** (`Project`, `Client`, `ClientContextCard`, `ActionItem`, `SessionMinute`) son donde se agregarán policies SELECT cuando se construya el landing — filtros tipo `EXISTS (... project_id = jwt.project_id)`. El resto de las 31 tablas se quedan permanentemente con lock-down (sin policy SELECT) porque el cliente externo nunca debe leerlas.

**Verificación de aislamiento (debe correrse después de tocar policies)**:
```js
// Con NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable):
const supabase = createClient(url, anonKey);
for (const t of ALL_PUBLIC_TABLES) {
  const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
  console.log(t, count); // Debe ser 0 en TODAS hasta que existan policies SELECT del landing.
}
```

**Por qué**: hoy la app confía 100% en autenticación a nivel app y 0% en autorización a nivel DB. Cuando llegue el cliente externo, esa confianza explota — un usuario externo malicioso podría editar el ActionItem de otro cliente con un `curl`. El modelo dual (auth unificada + ownership por HubSpot + override + RLS) cierra el boquete con redundancia. Y mientras tanto, el lock-down total protege contra extracción casual con la publishable key (que NO es un secreto — está en el bundle del cliente).

---

## 5. Aislamiento de módulos

**Regla**: los módulos se comunican **solo** a través de sus exports públicos. Está prohibido importar archivos internos de otro módulo.

**Lo permitido**:
- `lib/foo/index.ts` exporta las funciones públicas del módulo `foo`.
- `lib/bar/algo.ts` puede importar `from "@/lib/foo"` y obtener solo lo expuesto.
- Cualquier módulo puede importar de `lib/db`, `lib/auth`, `lib/api`, `lib/anthropic`, `lib/integrations/*`.

**Lo prohibido**:
- `lib/bar/algo.ts` importando `from "@/lib/foo/queries"` directamente (rompe encapsulación).
- Components React importando `prisma` directo. Use los exports del módulo (`lib/foo/queries.ts`) o un endpoint API.
- Ciclos. Si dos módulos se necesitan mutuamente, extraer la parte común a un tercero o a `lib/api/shared/`.

**Verificable con regla de ESLint** (a configurar): `import/no-internal-modules` con patrón que solo permita `lib/<modulo>/index.ts` cruzando módulos.

**Por qué**: hoy hay god routes (`app/api/clients/[id]/analyze/route.ts` con 1500 líneas mezclando 4 dominios) y god components (`ProjectCanvasPanel.tsx` con 1000 líneas) que serían imposibles de mantener si crece el equipo. Forzar aislamiento empuja a partir responsabilidades.

---

## 6. Capa de IA (Anthropic / Claude)

**Reglas**:

1. **Una sola instancia del SDK**: `lib/anthropic.ts` exporta el cliente lazy. Prohibido instanciar `new Anthropic()` en otro lado.
2. **System prompts viven en `Agent.systemPrompt` (DB)** cuando se quieren editar sin redeploy. Si el agente es interno-permanente y nunca cambia, puede vivir como constante en `lib/<modulo>/agents/<name>.ts` — pero documentado.
3. **Parsing de output JSON pasa por un helper compartido**: `lib/ai/parse-json-output.ts`:
   ```ts
   export function parseJsonOutput<T>(rawText: string, schema: z.ZodSchema<T>): T | null
   ```
   Maneja: extracción del primer `{...}` balanceado, intento de reparación si está truncado, validación con Zod del schema esperado. Reemplaza los ~6 lugares que hacen `JSON.parse(rawText.match(/\{[\s\S]*\}/)[0])` por separado.
4. **Cada agente vive en `lib/<modulo>/agents/<nombre>.ts`** y exporta una función `run<Nombre>Agent(input: T): Promise<R>`. La función es la única abstracción que conoce el shape del prompt + parseo + persistencia para ese agente.
5. **Cada ejecución persiste un `AgentRun`** con `agentId`, `sourceSessionIds`, `output`, `status`, `clientId`/`projectId` — trazabilidad obligatoria.
6. **Rate limiting + tracking de costos** (deuda): wrapper `callClaude(params, ctx: { agentId, clientId })` que registra tokens consumidos en un nuevo modelo `ClaudeUsage`. A implementar antes del primer proyecto que dispare >50 llamadas/día.

**Por qué**: la IA es un costo variable y un punto único de error. Centralizar el parseo evita 6 maneras distintas de fallar; centralizar el tracking evita facturas sorpresa.

---

## 7. Integraciones externas (HubSpot, Google, Fireflies)

**Regla**: una carpeta por integración, una interfaz pública por integración, y **ninguna llamada HTTP a un tercero fuera de esa carpeta**.

**Estructura**:
```
lib/integrations/
  hubspot/
    client.ts        # getHubspotClient(accountId), getSystemHubspotClient()
    companies.ts     # consultas tipadas a /crm/v3/objects/companies
    deals.ts
    projects.ts      # objeto custom "Projects"
    index.ts         # re-exports públicos
  google/
    auth.ts
    calendar.ts
    drive.ts
    meet-enrichment.ts
    index.ts
  fireflies/
    sync.ts
    index.ts
  anthropic/         # alias o move desde lib/anthropic.ts
```

**Reglas duras**:

1. **Tokens y secretos viven solo en env vars o en `HubspotAccount.accessToken` (cifrado a futuro, hoy plano).** Prohibido hardcodear, prohibido logger.
2. **Endpoints externos NUNCA se llaman sincronicamente desde una route del usuario** si pueden tardar >2s. Use `Promise.allSettled` + degradación graceful (devolver lo que tengamos local) o background job (queue).
3. **Cacheo de respuestas externas obligatorio para reads repetidos**: `unstable_cache` + `revalidateTag` con tag por entidad (`hubspot-company:${domain}`). Hay un buen ejemplo en `lib/cache/clients.ts`.
4. **Errores de integración no rompen la response del usuario.** Catch, log, devolver lo que se tiene + flag `partial: true` en la respuesta.
5. **Cada integración expone tipos propios y NO devuelve los tipos crudos del SDK del tercero.** Aislamos a Nexus de cambios upstream.

**Por qué**: hoy HubSpot es la integración mejor centralizada y se nota — es la que menos se rompe. Generalizar ese patrón a todas las integraciones.

---

## 8. Server Components, Client Components y data flow

**Regla**: data fetching tiene **dos modos** y ninguno más.

1. **Server Components leen de `lib/<modulo>/queries.ts`** (que internamente usa Prisma). Pasan datos serializables a Client Components como props.
2. **Client Components fetchean de `app/api/<modulo>/...`** cuando hay interactividad / mutaciones.

**Prohibido**:
- Client Components importando `prisma`.
- Server Components haciendo `fetch("/api/...")` a sí mismos (ineficiente: pasar por el módulo local).
- Server Components escribiendo a Prisma directo. Las mutaciones van por API routes o Server Actions tipadas.

**Server Actions** (`"use server"`): permitidas para mutaciones simples. Reglas iguales que API routes: validar input con Zod, verificar ownership.

**Por qué**: separar lectura de mutación + concentrar acceso a DB en `queries.ts`/`mutations.ts` hace los componentes testeables y los flujos de datos predecibles.

---

## 9. Convenciones de TypeScript y código

- **Sin `any` salvo justificación inline con `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- razón`**.
- **Sin `as Foo` salvo en límites con APIs externas tipadas como `unknown`**.
- **Verificación obligatoria antes de dar un cambio por terminado**: correr `npx tsc --noEmit` y comparar contra el baseline declarado en el commit anterior. Hoy son 29 errores; se acepta hasta cerrar la deuda de salud, pero **un cambio que suba el número se considera incompleto** (no se mergea, no se publica, se queda en branch hasta arreglarlo). No hay CI corriendo esto automáticamente; el chequeo es manual antes de cerrar el cambio.
- **Imports absolutos con `@/`**, prohibidos los `../../../`.
- **Naming**: archivos kebab-case (`post-process.ts`), componentes React PascalCase (`ProjectGPS.tsx`), tipos PascalCase, funciones y variables camelCase.

> *Para cuando el equipo crezca*: configurar CI (GitHub Actions) que falle si el contador de errores TS sube respecto a `main`. Hoy con un solo dev, el chequeo manual es suficiente y agregar CI sería overhead innecesario.

---

## 10. Tests y verificación

**Mínimo exigible hoy** (single dev + Claude Code):

- **Todo módulo NUEVO nace con `lib/<modulo>/*.test.ts` (Vitest)** que cubre el happy path y al menos un error path del helper público principal. Sin esto, el módulo no está terminado.
- **Antes de dar por terminado un cambio en un módulo con tests**, correr `npm test -- lib/<modulo>` y verificar que pasen.
- **Si tocás `prisma/schema.prisma`**: correr `npx prisma db push` contra la DB de dev + un smoke check manual (abrir alguna ruta que use el modelo y ver que carga) o un script de verificación rápido en `scripts/`.

**Hoy hay 0 tests en módulos existentes**. Se acepta el statu quo para no detener todo, pero módulos retroactivos se cubren cuando se tocan: si vas a modificar `lib/sessions/post-process.ts` por una razón, agrega al menos un test del caso que tocás antes de cerrar el cambio.

> *Para cuando el equipo crezca*: tests de integración HTTP de los endpoints críticos (sales, post-process, analyze-participants) corriendo en CI con DB de prueba dedicada. Hoy es overhead para un solo dev; los tests unitarios cubren lo crítico.

---

## 11. Cómo se evoluciona este documento

Como Nexus lo construye una sola persona apoyada por Claude Code, no hay reviewer humano que controle el cumplimiento. Las reglas son:

- **Cuando una regla deja de tener sentido por un cambio de contexto, se edita este documento ANTES de escribir el código que la viola.** Si descubrís que una regla no calza en medio de implementar algo, parás, actualizás esta página, y seguís.
- **Antes de dar un cambio significativo por terminado, contrastarlo contra este documento.** Una forma práctica: pedirle a Claude Code "revisá este cambio contra ARCHITECTURE.md y decime qué reglas viola, si alguna". Claude actúa como el reviewer que no tenemos.
- **Llevar un mini-changelog al final de este archivo** con cada cambio relevante (fecha, qué cambió, por qué). No es burocracia — es lo que evita olvidarse por qué una regla está como está.

> *Para cuando el equipo crezca*: convertir esto en PRs con reviewer humano + el archivo entra al code-owners de CODEOWNERS para que cambios requieran aprobación explícita.

---

## 12. Deuda pendiente (lo que el código actual no cumple)

El criterio para separar las dos listas: **¿impide esto exponer datos a un cliente externo de forma segura?** Si sí, es bloqueante. Si no, es deuda normal (igual hay que cerrarla, pero no detiene el lanzamiento del módulo externo).

### 🔴 Bloqueante para abrir la superficie externa

Nada de lo siguiente puede quedar pendiente cuando se exponga el primer cliente final:

1. ~~**Migrar autenticación a Supabase Auth + `AppUser` + `TeamMember.role`**~~ ✅ **HECHO** (junio 2026 — Fases A-E del plan).
2. ~~**Implementar `requireAccessToClient(clientId)`** y aplicarlo en los endpoints que el módulo de onboarding va a tocar.~~ ✅ **HECHO** (Fase F del plan — ~30 endpoints protegidos).
3. ~~**Agregar autenticación a `PUT /api/projects/[projectId]/current-step`**~~ ✅ **HECHO** (Fase F).
4. ~~**Habilitar RLS en Supabase** para las tablas que la superficie externa va a tocar **y** policy DENY explícita en tablas con secretos (`HubspotAccount.accessToken`, `refreshToken`) para cualquier rol distinto de `service_role`. Segunda barrera por si un endpoint olvida filtrar.~~ ✅ **HECHO** (junio 2026 — Fase A del plan Fase 1 del módulo externo). Lock-down inicial: RLS en `Project`, `Client`, `ClientContextCard`, `ActionItem`, `SessionMinute`; policy RESTRICTIVE en `HubspotAccount`. Policies SELECT para el cliente externo se agregan cuando se construya el landing.
5. ~~**Crear `ClientAssignment` + campo `canViewAllClients` en `TeamMember`.**~~ ✅ **HECHO** (Fase A del plan).

### 🟡 Deuda que conviene cerrar pronto pero no bloquea el onboarding

Cosas que duelen, pero el módulo externo puede abrirse sin tenerlas resueltas (siempre que los 5 anteriores estén OK):

6. **Adoptar Zod en todos los endpoints POST/PATCH/PUT** vía `parseBody(req, schema)`. Empezar por los del módulo externo (esos sí en la 🔴), después barrer el resto.
7. **Migrar `accountId` → `clientId` en `Audit`, `Implementation`, `Knowledge`** y borrar el campo viejo (deuda declarada hace meses).
8. **Borrar `Project.canvas`** (marcado DEPRECATED, no se usa).
9. **Refactor de `app/api/clients/[id]/analyze/route.ts` (1500 líneas)** en submódulos `lib/agents/`.
10. **Refactor de `components/clients/ProjectCanvasPanel.tsx` (1000 líneas)** dividiendo responsabilidades.
11. **Centralizar parseo JSON de Claude** en `lib/ai/parse-json-output.ts` y migrar los ~6 callers actuales.
12. **Resolver los 29 errores TypeScript baseline.** Bajar el contador progresivamente, no agregar nuevos.
13. **Sincronizar `ActionItem.done` con `status === "DONE"`** o eliminar uno. Quedarse con `status` (más expresivo).
14. **Eliminar `Project.lastSessionSummary`** y leer siempre de `SessionMinute` (último primario).
15. **Test suite mínimo** para `lib/sessions/`, `lib/projects/`, `lib/canvas/` cuando se toquen.
16. **Rate limiting + `ClaudeUsage` tracking** antes de cualquier flujo que dispare >50 llamadas/día.
17. **Cifrado en reposo de `HubspotAccount.accessToken`** (Supabase Vault).
18. **Cerrar el `__strategy__` magic string** en una constante exportada.
19. **Borrar `Project.pendingItems`** (Json deprecated) tras confirmar 0 lectores.
20. **Reconciliar `lib/matching/cascade.ts` vs `lib/sessions/categorize.ts`** (nombres similares, conceptos solapados).
21. **Rotar la `sb_secret_...` de Supabase Auth** (quedó en transcript de chat al pegarla durante setup). No urgente porque hoy no se usa server-side activamente, pero higiénico.
22. **Aplicar `requireAccessToClient` al resto de endpoints fuera del onboarding**: `/api/hubspot/*`, `/api/knowledge/*`, `/api/agents/*`, `/api/sales/*`, `/api/audits/*`. Hoy quedan con `requireConsultantSession` (gate por sesión) pero sin ownership.

---

## 13. Por dónde empezar

No intentes todo a la vez. La secuencia mínima para no atorarte es:

1. ~~**Base de identidad**: Supabase Auth + `AppUser` + `TeamMember.role` + helpers de auth.~~ ✅ **HECHO**.
2. ~~**Helper `requireAccessToClient`**: implementarlo y aplicarlo solo en los endpoints que el módulo de onboarding va a tocar.~~ ✅ **HECHO**.
3. ~~**Resto de los 🔴**: tapar `current-step` sin auth, crear `ClientAssignment` + `canViewAllClients`.~~ ✅ **HECHO**.
4. ~~**RLS** + DENY de tablas con secretos.~~ ✅ **HECHO** (lock-down inicial — junio 2026).

**Ya no quedan ítems 🔴 sin tachar.** Los cimientos de seguridad están listos para abrir el módulo de onboarding por capas. Próximos planes a encarar (en orden sugerido, cada uno con su propio documento de plan):

a. ~~**Mecanismo de acceso del cliente externo** (token + contraseña por proyecto)~~ ✅ **HECHO** (Fase 1 del módulo externo, junio 2026). Modelo `ProjectExternalAccess` + endpoints `/api/projects/[id]/external-access` (CSE) + `/api/external/verify-access` (cliente) + página mínima `/external/verify/[token]`.
b. ~~**Agente de handoff Sales→CS + cronograma estructurado**~~ ✅ **HECHO** (Fase 2 del módulo externo, junio 2026). Agente "Análisis inicial" reorientado a "Handoff Sales→CS" con 8 secciones laser-focused (formato block). Canvas "Handoff" agregado a `DEFAULT_PROJECT_CANVASES` + migrado retroactivamente. Modelos `ProjectTimeline` + `TimelinePhase` + enum `TimelinePhaseSource`. Endpoints `GET/PUT/DELETE /api/projects/[id]/timeline`. El agente NUNCA pisa el cronograma existente al re-ejecutarse — la propuesta queda en `AgentRun.output` para trazabilidad.
c. **Landing real del cliente externo** — pendiente. Decide:
   - Cómo se mueve el token fuera de la URL (cookie HTTP-only post-verify, header Authorization, magic link a sesión Supabase EXTERNAL).
   - Qué tablas se exponen y con qué policies SELECT (filtro por `projectId` derivado del JWT/session claim).
   - Qué UI tiene (cronograma calculado con `anchorStartDate + sum(durationWeeks)*7d`, cards del Handoff publicadas, docs, minutas REVIEWED).
d. **Publicación selectiva** desde el panel del CSE al landing (qué bloques del Handoff van al landing, modelo de approval).

La regla operativa para futuro: **no exponer ningún endpoint externo nuevo sin que su tabla destino tenga RLS habilitado con policy SELECT específica** que filtre por el contexto del cliente externo (no por anon abierto).

### ⚠ Recordatorios operativos (lessons learned)

- **Prisma `db push` NO habilita RLS automáticamente** en tablas nuevas. Cada vez que agregás una tabla al schema, corré explícitamente `ALTER TABLE "X" ENABLE ROW LEVEL SECURITY` después del push. Verificá con `SELECT rowsecurity FROM pg_tables WHERE tablename='X'`. Sin esto, anon puede leer la tabla con la publishable key del bundle — abre el agujero que cerramos en Fase 1.
- **Reiniciar el dev server después de cambios al schema** o de regenerar el cliente Prisma. Si no, el endpoint sigue usando el cliente viejo cacheado y revienta silenciosamente al usar modelos nuevos.
- **El gate `useBlockFormat` en `analyze/route.ts`** es la llave que decide si un agente escribe `ClientContextCard` (canvas Resumen) o `CanvasBlock` (canvases custom como Diagnóstico/Handoff). Agentes que apuntan a canvases custom DEBEN estar en `BLOCK_FORMAT_AGENT_IDS` y su prompt debe devolver `{ sections: [{ key, blocks: [...] }] }`. Sino sus cards se persisten pero NO se renderizan.

---

## Changelog

- **2026-06-01** — Documento creado. Sección 12 refleja el estado post-migración a Supabase Auth (Fases A-F del plan ejecutadas; queda solo RLS para abrir el módulo externo).
- **2026-06-02** — Fase 1 del módulo externo COMPLETA (Fases A-E del plan).
  - **Fase A**: RLS habilitado en `Project`, `Client`, `ClientContextCard`, `ActionItem`, `SessionMinute` (lock-down sin policies SELECT). `HubspotAccount` recibe policy `deny_all_non_superuser` AS `RESTRICTIVE`. Sección 4.5 reescrita con el estado real. Ítem 🔴 #4 marcado ✅ HECHO. Ya no quedan ítems 🔴 sin tachar.
  - **Fase A.4 (ampliación post-verificación anon)**: la verificación con la publishable key reveló que las otras 25 tablas eran totalmente leíbles por `anon` (Supabase auto-otorga `GRANT SELECT` a `anon` sobre todo `public` en el setup inicial). Por ejemplo, `FirefliesSession` filtraba 15.385 transcripts completos. Ampliación del alcance: RLS habilitado en TODAS las tablas restantes (`Agent`, `AgentRun`, `AppUser`, `Audit`, `CanvasBlock`, `CanvasSection`, `CanvasSuggestion`, `ClientAssignment`, `ClientDocument`, `ExecutionLog`, `FirefliesSession`, `Implementation`, `Knowledge`, `KnowledgeDocument`, `KnowledgeEmbedding`, `KnowledgeTag`, `Message`, `ProjectCanvas`, `ProjectExternalAccess`, `ProjectParticipantSnapshot`, `SessionCategory`, `SessionProject`, `StageNote`, `TeamMember`, `_KnowledgeDocumentToKnowledgeTag`) en transacción atómica. Total: 31/31 tablas de `public` con RLS (`_prisma_migrations` queda como única excepción — metadata Prisma). Re-verificación con publishable key: las 30 tablas verificadas devuelven 0 rows. Regla 4.5 reescrita a "lock-down total + policies SELECT solo donde se necesite acceso externo legítimo".
  - **Fase B**: modelo `ProjectExternalAccess` (1:1 con Project) agregado al schema con campos `accessToken` (64 hex), `passwordHash` (bcrypt 12 rounds), `enabledAt`, `revokedAt`, `lastUsedAt`, `createdById`. Dependencia `bcrypt` + `@types/bcrypt` instalada.
  - **Fase C**: `app/api/projects/[projectId]/external-access/route.ts` con POST (genera/regenera, password autogenerada con `crypto.randomInt` + alphabet sin ambiguos, devuelve la password en plano UNA vez), GET (estado sin exponer hash) y DELETE (marca `revokedAt`, no borra). Guarded con `guardAccessToProject`.
  - **Fase D**: middleware acepta `/external/` y `/api/external/` como públicos. `POST /api/external/verify-access` valida token+pass con rate limit in-memory (5 fallos/5min → 10min bloqueo, 429) y protección anti-timing-leak. Página pública `/external/verify/[token]` con form de password (cero recursos externos: Next.js self-hostea Geist en build, sin CDN ni Google Fonts en runtime). Componente `ExternalAccessButton` agregado al toolbar de `ProjectCanvasPanel` (al lado de "Compartir" legacy — son features distintas).
  - **Fase E**: TS baseline mantenido en 29 errores. Smoke E2E confirmado: generar acceso → URL + pass → cliente entra en incógnito → password mala denegada → revocar bloquea acceso → regenerar permite entrada nueva. Sección 13 reorganizada para listar los próximos planes del módulo externo (landing real, agente de handoff, publicación).
  - **Sigue abierto** (intencionalmente, no son 🔴): policies SELECT para el cliente externo (se deciden al diseñar el landing), cifrado de tokens HubSpot (deuda 🟡 #17), token-en-URL como debt de seguridad (mitigado por la contraseña hoy, hay que evaluar mover el token fuera de la URL al construir el landing).
- **2026-06-03** — Fase 2 del módulo externo: agente "Análisis inicial" reorientado a **"Handoff Sales→CS"** (id `cmmla1g1x00005wijix3qnr7u` preservado; agentGroup `preparacion`→`handoff`; 9 cards→8 secciones laser-focused; sin `suggestions`). Canvas **"Handoff"** agregado a `DEFAULT_PROJECT_CANVASES` con 8 secciones (`acuerdos_promesas` primero por criticidad), migrado retroactivamente a 109 proyectos. Modelos nuevos: **`ProjectTimeline`** (1:1 con Project, anchorStartDate opcional, FK a AgentRun que lo generó) + **`TimelinePhase`** (name, order, durationWeeks, sessionCount, notes, enum source AGENT/MODIFIED/HUMAN). Endpoints `GET/PUT/DELETE /api/projects/[id]/timeline` con guard + diff bulk transaccional + validador inline. Categoría `🤝 Handoff` agregada como **primera** en `lib/agent-groups.ts` (UI). Agente migrado al **block format** (`useBlockFormat` ahora es un `Set` que incluye al Handoff) — los canvases custom renderizan `CanvasBlock`, no `ClientContextCard`. Helper `persistTimelineFromAgentOutput` extraído para llamarse desde ambos branches del endpoint analyze. El agente **NUNCA pisa el cronograma existente** al re-ejecutarse — la propuesta queda solo en `AgentRun.output`. Ya no quedan ítems 🔴, ya no queda ítem (a)/(b) de los próximos planes externos.
  - **Fixes post-deploy del Handoff** (mismo día): el filtro de sesiones del agente Handoff pasó por 4 iteraciones hasta quedar en una clasificación **híbrida title-based + fallback Sales** (`HANDOFF_EXCLUDE_TITLE_KEYWORDS`/`HANDOFF_INCLUDE_TITLE_KEYWORDS` en `analyze/route.ts`): excluye Kickoff/implementación/review aunque tengan un Sales presente, incluye Hand Off/discovery/demo aunque sean mixtas. Últimos 90 días. Además `fetchTranscriptContent` ahora lee `summary.sections` de Gemini Notes (antes ignoraba el array donde vive el detalle real de la reunión) + complementa con transcript crudo si el summary queda <1500 chars. Slice de transcripts de ventas subido a 12000 chars para el Handoff.
- **2026-06-04** — Lectura automática de documentos en "Información del cliente" → Documentos:
  - **Helper compartido `lib/documents/extract-text.ts`**: extrae texto de PDF (pdf-parse), TXT/CSV (nativo) y **DOCX/XLSX/PPTX/ODT/ODS/ODP** (`officeparser`). Reemplaza la función inline del endpoint de upload. De paso limpió el error de tipos de pdf-parse `.default` (baseline 29→28).
  - **Links de Google Drive** (`lib/google/drive-files.ts` + `POST /api/projects/[id]/documents/link`): el CSE pega un link de Docs/Slides/Sheets/Drive → se extrae el texto vía `drive.files.export()` (con el scope `drive.readonly` YA existente — sin scopes nuevos ni re-consent DWD), impersonando al **usuario logueado** (menor privilegio). Errores tipados (NO_ACCESS/NOT_FOUND/TOO_LARGE/UNSUPPORTED). Sheets export = primera hoja (limitación de Drive).
  - **Lectura de páginas web** (`lib/documents/fetch-web-page.ts`): propuestas que viven como URL web se leen con `html-to-text` + guard SSRF (bloquea localhost/IPs privadas/metadata 169.254). Best-effort: SPAs JS-rendered devuelven poco texto. PDFs servidos por web se reusan vía el extractor.
  - **Dedup por (projectId, url)**: pegar un link existente actualiza el doc (re-lee contenido) en vez de duplicar.
  - **Storage lazy + resiliente** (`lib/storage/client.ts`): el módulo hacía `createClient(url, "")` al import y explotaba con "supabaseKey is required" si faltaba `SUPABASE_SECRET_KEY` (perdida en la migración de keys), tumbando con 500 el GET/DELETE/upload de documents. Ahora `getStorageClient()` es lazy y degrada con gracia (upload→503 claro, getSignedUrl→null). Fallback de credenciales a `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (proyecto principal). Bucket `client-documents` creado en el proyecto principal.
  - **Integración con el agente**: los docs con `content` ya alimentan a los agentes vía `docsContent` (query por clientId, cross-proyecto). Límite subido a **12000 chars para el Handoff** (la propuesta comercial es fuente primaria de "¿qué vendimos?"), 3000 para el resto.
  - Deps: `officeparser`, `html-to-text` + `@types/html-to-text`. `.env.example` actualizado con `GOOGLE_SERVICE_ACCOUNT_KEY`/`GOOGLE_ADMIN_EMAIL` (faltaban) + `SUPABASE_URL`/`SUPABASE_SECRET_KEY` opcionales. TS baseline: 28.
- **2026-06-04** — **Integración Fireflies eliminada** (Nexus solo usa Google Workspace). La fuente única de sesiones/transcripts pasa a ser Google Meet vía la caché local (que conserva el nombre de modelo `FirefliesSession`).
  - **Borrados**: sub-pestaña "Sesiones" en "Información del cliente"; los 4 endpoints `app/api/integrations/fireflies/*` (sync/status/check-new/sync-sessions); `lib/fireflies/sync.ts`; `FirefliesSyncButton` + la card de Fireflies en `/integrations`; `app/api/clients/[id]/sessions` (endpoint **huérfano** — único consumidor directo de la API de Fireflies, lo usaba solo el ya-removido `ClientSessionCards`); el fallback a la API de Fireflies en `analyze/route.ts` (`fetchFirefliesPage`/`fetchMatchingTranscripts`/rama `else if (apiKey)`) → ahora la **única fuente de transcripts es la caché DB**; el sync en background al crear cliente; `FIREFLIES_API_KEY` de `.env.example`/README.
  - **Refactor del módulo mixto**: `lib/fireflies/sync.ts` mezclaba la integración con helpers de matching neutrales (`tokenizeTitle`, `extractEmail`, tipo `RawTranscript`) que usa el pipeline de categorización de sesiones. Se movieron a su fuente canónica `lib/utils/matching.ts`; consumidores `lib/matching/cascade.ts` y `gps/route.ts` actualizados.
  - **Se mantuvo** (decisión del usuario): el nombre del modelo `FirefliesSession` + sus 15.897 filas (todas `source="google_meet"`) y la lectura de esa tabla (`searchFirefliesFromDB`, fuente real vía Google Meet). `source` cambió a `@default("google_meet")` (DB sincronizada con `prisma db push`).
  - TS baseline: **27** (era 28; −1 por borrar el endpoint huérfano), 0 errores nuevos.
