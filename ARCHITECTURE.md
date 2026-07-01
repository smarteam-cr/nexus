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
23. **Re-apuntar el agente `preparacion` (DEUDA del retiro del Resumen).** El grupo `preparacion` todavía emite `ClientContextCard` a `canvasSection="procesos"` (vía `GROUP_TO_SECTION` en `app/api/clients/[id]/analyze/route.ts`) — un sistema RETIRADO: el canvas Resumen se eliminó y "procesos" ahora vive como `CanvasBlock` en "Información del cliente". Mientras esto no se cierre, **cada corrida de `preparacion` escribe cards que ya no se renderizan en ningún lado**. Cerrar = migrar el agente a block-format y rutear su salida a la sección `procesos` del canvas de Información del cliente (cross-project: el strategy project `__strategy__` del cliente). La data EXISTENTE ya se migró con `scripts/migrate-procesos-to-blocks.ts`.
24. **Limpiar el subsistema de cards muerto en `ProjectCanvasPanel.tsx`.** Tras el retiro del Resumen, `isResumenCanvas` es siempre false y toda la grilla masonry de cards + las effects de `canvas-cards` + sus handlers quedan como código muerto (gateado y marcado DEPRECATED). Borrarlo junto al endpoint `app/api/projects/[id]/canvas-cards` y `DEFAULT_SECTIONS`. (Relacionado con el ítem 10.)

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
- **`prisma db push` NO regenera el cliente Prisma en este setup** (Prisma 7 + `prisma.config.ts`): su salida no dice "Generated Prisma Client". Tras agregar/cambiar un enum o modelo, corré **`npm run db:sync`** (encadena `prisma db push && prisma generate`) — o `npx prisma generate` suelto si ya hiciste el push — y después reiniciá el dev server. Síntoma si te lo saltás: `PrismaClientValidationError: Invalid value for argument 'X'. Expected <Enum>` y el write **falla en silencio**. Caso real: agregamos `MODIFIED` a `BlockSource` con solo `db push` → toda edición de bloque AGENT lanzaba en el PUT y la corrección del CSE no persistía (Handoff, Kickoff y Diagnóstico/Planificación).

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
- **2026-06-04** — **Kickoff Fase A (interno)**: vista del handoff + agente/canvas/landing de Kickoff. Tres capas del onboarding: Handoff (interno, lo cura el CSE) → Agente de kickoff (lee el handoff curado + cronograma) → Render landing (interno ahora; externo en Fase C). Fase A construye SOLO lo interno; chat asistente = Fase B; publish externo + RLS = Fase C.
  - **Vista lineal del Handoff**: nuevo `components/canvas/CanvasLinearView.tsx` (secciones/bloques apilados, sin grilla; reusa `BlockRenderer`) + hook compartido `components/canvas/useCanvasSections.ts` (fetch + accept/reject/aceptar-todos + editar/agregar/eliminar bloque, contra los endpoints existentes). El canvas "Handoff" se renderiza con esta vista (branch `activeCanvas?.name === "Handoff"` en `ProjectCanvasPanel`). **`SectionBlockList` NO se tocó** (sigue sirviendo a Diagnóstico/Planificación/etc. en grilla).
  - **`MODIFIED`**: nuevo valor en `enum BlockSource` (AGENT/HUMAN/MODIFIED). El PUT de `canvas-sections/[sectionId]/blocks` marca `source=MODIFIED` cuando el CSE edita content/data de un bloque AGENT (replica el patrón de `timeline`); aceptar/rechazar (solo status) no toca source. Badge "Modificado"/"Manual" visible en `BlockRenderer`. `prisma db push` aplicado.
  - **Agente Kickoff** (`agent-kickoff-canvas`, grupo `kickoff`): primer agente que consume `CanvasBlock` CONFIRMED como input. Nuevo `lib/canvas/load-canvas-context.ts` (`loadCanvasContext` serializa un canvas a markdown + `loadTimelineContext` serializa el cronograma). En `analyze/route.ts`: agregado a `BLOCK_FORMAT_AGENT_IDS` + rama de input **gateada por id** que arma el user-message desde el Handoff curado + cronograma (no fuentes crudas). Reglas de disciplina en el systemPrompt: métricas como propuesta de Smarteam; alcance/objetivos sin inflar (ante vacío, marca para el CSE); `proximos_pasos` no reproduce el cronograma; sin secciones internas. Seed: `scripts/seed-kickoff-agent.ts`.
  - **Canvas Kickoff**: 6 secciones cliente-facing (`bienvenida`, `objetivos`, `alcance`, `tu_rol`, `metricas_exito`, `proximos_pasos`) en `DEFAULT_PROJECT_CANVASES`. Migrado a 109 proyectos con `scripts/migrate-add-kickoff-canvas.ts --apply` (654 secciones). Grupo `kickoff` (🏁) en `lib/agent-groups.ts`. `AGENT_GROUP_TO_CANVAS` **centralizado**: ahora vive solo en `lib/canvas/default-canvases.ts` y `analyze/route.ts` la importa (se eliminó la copia duplicada).
  - **Landing Kickoff (Camino C)**: `components/canvas/KickoffLanding.tsx` — componente presentacional reutilizable (hero + secciones tono cliente + banda de cronograma leída directo de `ProjectTimeline`, con offsets desde `anchorStartDate` o etiquetas relativas "Semana N–M" si es null). Prop `editable` (Fase A: true) habilita accept/editar/agregar in-situ vía el hook. Branch `activeCanvas?.name === "Kickoff"` en `ProjectCanvasPanel`. El cronograma NO se regenera como bloques (fuente única = ProjectTimeline). Fase C reusará este componente con `editable=false` en ruta pública.
  - TS baseline: **27** (0 errores nuevos). El cronograma del Kickoff lo pinta la plantilla, no el agente (evita doble fuente de verdad).
- **2026-06-04** — **Fix: la edición manual de bloques no persistía** (Handoff, Kickoff y Diagnóstico/Planificación). Causa raíz: al agregar `MODIFIED` a `enum BlockSource` (Fase A) se corrió solo `prisma db push` (sincronizó el enum en Postgres) pero NO se regeneró el cliente Prisma; el cliente cargado solo conocía `AGENT/HUMAN`, así que el PUT de `canvas-sections/[sectionId]/blocks` —que setea `source=MODIFIED` al editar content/data de un bloque AGENT— lanzaba `PrismaClientValidationError` y el `content` nunca se escribía. El editor cerraba optimista + el refetch revertía → parecía guardado. Fix: `npx prisma generate` + restart del dev server (cero cambio en el endpoint, que estaba correcto). Endurecimiento: `useCanvasSections` ahora chequea `res.ok`, loggea y expone `error` (banner en `CanvasLinearView` y `KickoffLanding`) para que un fallo de guardado no vuelva a ser silencioso — fue el silencio lo que ocultó el bug. `SectionBlockList` no se tocó (no usa el hook). Recordatorio operativo agregado: en este setup (Prisma 7 + `prisma.config.ts`) `db push` NO autogenera el cliente.
- **2026-06-04** — **Bloque de fundación del onboarding: Handoff como entidad cliente-level + arranque de proyecto** (Fases 1-4 hechas; Fase 5 HubSpot write pendiente de re-auth).
  - **Entidad `Handoff`** (`prisma/schema.prisma`): 1:N bajo `Client`, **1:1** con `Project` (`projectId @unique`) y con el deal ancla (`hubspotDealId @unique`). Sync a HubSpot: `hubspotProjectId`, `hubspotSyncStatus` (pending/synced/failed), `hubspotSyncError`, `generatedByAgentRunId`. El **contenido** del handoff sigue viviendo en el canvas "Handoff" del Project (no se duplica). Migración `scripts/migrate-create-handoff-entities.ts` (idempotente, excluye `__strategy__`): 1 Handoff por proyecto con canvas Handoff no vacío → **2 entidades** creadas (Grupo Inve, Almotec-CRM). `db push` aplicado.
  - **Handoff fuera del set de canvas de proyecto** (`lib/canvas/default-canvases.ts`): se quitó de `DEFAULT_PROJECT_CANVASES` (renumera Kickoff 0/ancla, Diagnóstico 1, Planificación 2, Cronograma 3). Se extrajo `HANDOFF_CANVAS` (fuente única de las 8 secciones) + helper `createHandoffCanvas`. `AGENT_GROUP_TO_CANVAS` **mantiene** `handoff→"Handoff"` y `loadCanvasContext` NO cambió → el Kickoff sigue leyendo el handoff (verificado: 2 canvases, 14/14 y 10/10 bloques CONFIRMED). El GET `/api/projects/[id]/canvases` filtra `name != "Handoff"` (fuera del dropdown del proyecto). `createDefaultCanvases`/`createHandoffCanvas` aceptan un cliente de transacción (`db: Prisma.TransactionClient`) para atomicidad.
  - **Vista a nivel cliente**: `GET /api/clients/[id]/handoffs` (entidades + `canvasId` del canvas Handoff) + `components/clients/ClientHandoffsPanel.tsx` (listado + selector si >1 + badge de sync + `CanvasLinearView` para editar — reusa editor/persistencia ya probados) + tab **"Handoffs"** en el workspace (sentinel `__handoffs__`, cliente-level junto a "Información del cliente"). `clientName` drillado page→WorkspaceClient→panel.
  - **CTA de creación** (`POST /api/handoffs`, orquestador atómico `$transaction`): resuelve/crea Client (existente por `clientId`; nuevo por `companyId`+`companyName`, find-or-create por `hubspotCompanyId`) → Project (+`hubspotDealId`) + canvases del set + canvas Handoff + entidad Handoff (`status=pending`); guard de deal duplicado. `GET /api/handoffs/lookup?domain=` busca la company en el **HubSpot SISTEMA** (CRM de Smarteam) + sus deals (`lib/hubspot/deals.ts` `fetchCompanyDeals`). `components/clients/NewHandoffButton.tsx`: modal 2 modos (cliente existente → tab Handoffs; cliente nuevo nombre+dominio → header de `/clients`). Tras crear, dispara el agente handoff (POST analyze, reintentable). **NO escribe en HubSpot** (Fase 5).
  - **Agente handoff** (`analyze/route.ts`): + marco breve de relación previa (proyectos/handoffs previos del cliente, ~2.5k chars, aditivo, gateado a `isHandoffAgent`).
  - **Fase 5 — 🔴 DEPENDIENTE de la re-auth de Elías**: escribir el record en el CRM de Smarteam (pipeline "Customer Success CRM" `826270797`, etapa "Hand off" `1225193551`) + propiedad en la company requiere `crm.objects.projects.write` (NO concedido hoy). El handoff queda `hubspotSyncStatus="pending"` y se reconcilia con retry cuando el scope esté. NO se intenta el write antes de confirmar el scope (token-info).
  - TS baseline: **27** (0 errores nuevos). Verificación de UI autenticada PENDIENTE (preview sin sesión: login Google OAuth) — el click-through de los 2 formularios + el render del tab Handoffs los confirma Elías.
- **2026-06-05** — **Fase 5 del bloque de fundación: escritura del handoff a HubSpot** (re-auth concedida — 🔴 desbloqueada).
  - **Fix de scope**: `app/api/auth/hubspot/route.ts` (`HUBSPOT_SCOPES`) pedía `crm.objects.projects.read` pero NO `...write` → ningún re-consent lo concedía (el token quedaba read-only). Agregado `crm.objects.projects.write`. Tras re-consent del sistema (`/api/auth/hubspot?system=1`), token-info (`getPortalInfo`) confirma read+write en portal 6553628 / app 36930623.
  - **`lib/hubspot/handoff-sync.ts`**: `syncHandoffToHubspot(handoffId)` IDEMPOTENTE — crea el record `projects` (objectType **0-970**, nombre **hs_name**) en pipeline **826270797** "Customer Success CRM" / etapa **1225193551** "Hand off" SOLO si falta `hubspotProjectId`; asocia a la company (+ deal ancla) con asociación **default v4** (upsert, no duplica); marca el checkbox **`nexus`=true** en la company (confirmado por Elías — "true" era el valor, no el internal name). Gate `hasProjectsWriteScope()` por token-info — no escribe sin el scope. `retryPendingHandoffs()` reconcilia los pending.
  - **`POST /api/handoffs/sync`**: reintenta un handoff (`{handoffId}`) o todos los pending/failed (guard interno). `NewHandoffButton` dispara el sync tras crear (idempotente, no-op sin scope).
  - **E2E verificado** contra el CRM de Smarteam: Almotec (project `561415852914`) y Grupo Inve (`561435414881`) creados en pipeline/etapa correctos, asociados a su company, `nexus=true`, `hubspotSyncStatus="synced"`. **Idempotencia**: retry x2 → `created` true→false→false, mismo id, +1 project por company (sin duplicado). `scripts/inspect-hubspot-projects.ts` (diagnóstico read-only) + `scripts/e2e-handoff-sync.ts` (E2E). tsc=**27**.
  - **Bloque de fundación COMPLETO (Fases 1-5).** Pendientes documentados: deuda 🟡 #23 (re-apuntar agente `preparacion`), Fase B (chat), Fase C (publish externo). El click-through autenticado de la UI (CTA + tab Handoffs) lo confirma Elías.
- **2026-06-05** — **Fix: el handoff duplicaba el proyecto (loop F5 ↔ sync-projects)**.
  - **Causa**: el objeto `projects`/0-970 que F5 creaba es el MISMO que `sync-projects.ts` lee como fuente de verdad (keyed por `Project.hubspotServiceId`). F5 guardaba el record solo en `Handoff.hubspotProjectId` sin tocar `Project.hubspotServiceId` → al abrir el cliente, `sync-projects` lo re-importaba como Project nuevo. Agravado en handoffs migrados (su Project ya tenía un record real previo → F5 creaba un 2º en HubSpot). El deal-guard + el índice `Handoff_hubspotDealId_key` funcionaban (NO era el CTA).
  - **Fix** (`lib/hubspot/handoff-sync.ts`): `syncHandoffToHubspot` se integra con `Project.hubspotServiceId`. Si el Project ya tiene record → linkea (sin crear ni regresar etapa). Si no → crea y setea `Project.hubspotServiceId` = nuevo id (secuencial, self-healing) para que `sync-projects` lo ACTUALICE, no lo duplique. Idempotencia dura (`hubspotProjectId` set → skip). Nuevo status `"linked"`.
  - **UX** (`NewHandoffButton.tsx`): en 409 (deal con handoff existente) muestra el mensaje + link "Abrir el handoff existente".
  - **Limpieza** (`scripts/cleanup-handoff-dup-projects.ts`, dry-run→apply): borró 1 Project re-import (Almotec, 0 bloques), archivó 2 records 0-970 dup (`561415852914`, `561435414881` → papelera HubSpot), reconcilió 2 handoffs al record real. Protege Projects con bloques (no los toca).
  - **Verificado**: post-limpieza `syncProjectsForClient` para Almotec/Grupo Inve → **created=0** (loop roto), `handoff.hubspotProjectId == project.hubspotServiceId` en ambos. tsc=**27**.
- **2026-06-13** — **Handoff por-proyecto: sección dedicada dentro del proyecto + scope por sus sesiones** (reemplaza la pestaña global cliente-level).
  - **Modelo de UX**: el handoff es algo que se hace **para 1 proyecto** (hecho o no). Ya no vive en una pestaña global "Handoffs" del cliente, sino como **sección dedicada siempre visible** dentro de cada proyecto (`components/clients/ProjectHandoffSection.tsx`, montada en `ProjectCanvasPanel` justo bajo el `ProjectGPS`). Estado claro con badge: **Generado** (verde) / **No generado** (gris) / **Generando…** (ámbar). Botón "Generar handoff"/"Regenerar" + "Ver documento" (toggle del `CanvasLinearView` del canvas Handoff). El modelo `Handoff` ya era 1:1 con Project — no cambió.
  - **Scope de sesiones al proyecto** (`analyze/route.ts`): para `isHandoffAgent && bodyProjectId`, la fuente de transcripciones son **EXACTAMENTE** las sesiones vinculadas vía **`SessionProject`** (`prisma.sessionProject.findMany` → `firefliesSession.findMany({ where:{ id:{ in } } })`), traídas directo por id. **No** se usa el keyword/domain-search (`searchFirefliesFromDB`) ni el clasificador heurístico `classifyForHandoff`+90d: esos existían para *adivinar* el scope cuando no había vínculo explícito. **Sin fallback client-wide**: guard temprano que corta con `{ error: "NO_PROJECT_SESSIONS" }` (400) si el proyecto tiene 0 sesiones. Así cada handoff investiga **todas las transcripciones de ese proyecto** aunque haya varias de ventas. El handoff legacy sin proyecto conserva el clasificador híbrido.
  - **Fix (mismo día)**: la primera versión intersectaba `SessionProject` con `searchFirefliesFromDB` y luego corría `classifyForHandoff`+90d → el agente quedaba con 0 transcripciones y el run terminaba en ERROR ("El handoff falló durante la generación"). Confirmado en DB: el proyecto *AnalisaLab - Grupo INVE* tenía 6 sesiones vinculadas pero solo 1 caía en el keyword-search, y esa única con transcript (37k chars) la excluía el clasificador por contener **"revisión"** en el título (`HANDOFF_EXCLUDE_TITLE_KEYWORDS`). La fuente directa por id elimina ambos filtros.
  - **Endpoint nuevo** `app/api/projects/[projectId]/handoff/route.ts`: GET (estado: `handoffId`, `canvasId`, `generated` = canvas con ≥1 bloque, `sourceSessions[]` del último run, `projectSessionCount`) + POST (ensure idempotente de entidad `Handoff` + canvas "Handoff" vía `createHandoffCanvas`, sin correr el agente). La generación corre el agente vía `/analyze` **async + `pollAgentRun`**; el sync a HubSpot queda best-effort (sigue gateado por scope).
  - **Removido**: tab global "Handoffs" + sentinel `__handoffs__` en `WorkspaceClient.tsx`, botón "Nuevo handoff" (`NewHandoffButton`) en `/clients`, componentes `ClientHandoffsPanel.tsx` y `NewHandoffButton.tsx` (borrados). `clientName` dejó de drillarse a `ProjectSection`. El canvas Handoff sigue **excluido** del dropdown del proyecto (se ve por la sección dedicada). tsc=**26** (baseline intacto).
- **2026-06-13** — **Resiliencia del workspace + cronograma re-generable en proyectos en curso.**
  - **Diagnóstico del crash `enqueueModel`:** `TypeError: Cannot read properties of null (reading 'enqueueModel')` al recargar el workspace. `enqueueModel` vive **solo** en `react-server-dom-turbopack` (Flight client de RSC); el overlay decía "(stale)" y no hubo error server-side → **build de dev desincronizado** tras editar/borrar componentes cliente con el dev vivo. El contenido SÍ se había generado (handoff 11 bloques, cronograma 4 fases, kickoff 6). Remediación del síntoma: reinicio limpio del dev (`.next`).
  - **Error boundary (resiliencia):** no existía ninguno. Nuevo `app/clients/[id]/error.tsx` (segmento del workspace; envuelto por el layout → header/rail sobreviven; Reintentar/Recargar, tokens semánticos) + `app/global-error.tsx` (backstop de layouts raíz, estilos inline).
  - **Cronograma re-generable (proyectos en curso):** al re-correr el agente sobre un proyecto que YA tiene `ProjectTimeline`, `persistTimelineFromAgentOutput` descartaba la propuesta en silencio. Ahora la guarda como **propuesta pendiente aplicable, NO destructiva**. Schema: `ProjectTimeline.pendingProposal Json?` + `pendingProposalRunId String?` (`db push`). La propuesta se reconcilia contra las fases actuales (match por nombre normalizado; si no, por posición → llevan el `id` existente) y **omite `tasks`** en todas las fases → al aplicar (PUT) se preservan tareas y estados (verificado: el PUT salta el diff de tareas cuando `tasks===undefined`). Modo aditivo: las fases existentes no matcheadas se re-emiten (el re-run nunca borra). `GET /timeline` expone `pendingProposal`; el PUT (aplicar / guardado humano) lo limpia (`Prisma.DbNull`); nuevo `DELETE /api/projects/[projectId]/timeline/proposal` para descartar sin escribir. `CronogramaCanvas` reusa el banner preview/apply existente (load → `setProposal(pendingProposal)`; `discardProposal` → DELETE). Script read-only `scripts/inspect-timeline-proposal.ts`. tsc=**26**.
- **2026-06-26** — **Apartado "Desarrollo e integraciones" en el handoff + canvas Handoff self-healing + limpieza de cascarones.**
  - **Sección nueva** `desarrollo` ("Desarrollo e integraciones") en `HANDOFF_CANVAS` (tras `alcance_contratado`, 9→10 secciones): el agente DETERMINA si el proyecto lleva integraciones / es una integración y, si sí, detalla objetivo, alcance, sistemas (ej. HubSpot ↔ SAP), fechas/tiempos, dependencias y lo conversado (prompt en `scripts/seed-handoff-agent.ts`).
  - **Canvas Handoff self-healing**: nuevo `reconcileHandoffCanvasSections` (en `lib/canvas/default-canvases.ts`) que el "ensure" de `POST /handoff` invoca ANTES de generar → crea las secciones canónicas faltantes (NUNCA borra bloques) para que el agente no descarte en silencio una sección que el canvas viejo no tenía. Mata el bug de drop silencioso (se descubrió: 110/113 canvases sin la sección `fecha_inicio_kickoff`). Reemplaza el approach de migración one-time.
  - **Limpieza**: `scripts/delete-empty-handoff-shells.ts` (dry-run-first, guard 0-bloques) borró **111 cascarones Handoff vacíos** — restos del enfoque viejo que pre-creaba el canvas en TODOS los proyectos (incl. 21 sentinels `__strategy__`). Conservados los 2 con contenido (Multiquimica, Almotec). Los proyectos recrean el canvas fresco on-demand al generar (`createHandoffCanvas`). + `scripts/inspect-handoff-content.ts` (diagnóstico read-only). tsc=**27**.
- **2026-06-30** — **Rol `DEV` (equipo técnico) = idéntico a Ventas + fuente única del whitelist del área de Ventas.**
  - **Enum**: `TeamRole += DEV` (`prisma db push` a PROD, additivo, sin data-loss). Capacidades de DEV = las de VENTAS (`seeAllClients`, `handoffAnywhere`, `createHandoff`, `editTimeline`, `deleteTimeline`) → ve todos los clientes y puede ver/editar/**borrar** cronogramas y editar handoffs. `ROLE_RANK.DEV=2` (=VENTAS), `ROLE_LABEL.DEV="Dev"`. `isDevMember` (eje análisis, `lib/sessions/areas.ts`) ahora cuenta `roleEnum==="DEV"` como delivery. Sitios de enum actualizados: los 3 `Record<TeamRole>` de `roles.ts`, `TEAM_ROLES` (Zod de assignments), `TeamManager`/`ClientSharing` (labels/opciones), `verify-cse-scoping` (SEE_ALL).
  - **Fuente única del área de Ventas** (`lib/auth/sales-roles.ts`, NUEVO, client-safe): `SALES_AREA_ROLES = ["VENTAS","DEV","CSL","SUPER_ADMIN"]` + `isSalesAreaRole()`. Una auditoría adversarial (workflow) reveló que el whitelist estaba **duplicado inline en 6 sitios** que quedaron stale al sumar DEV → mal-autorización UI vs API: las 3 páginas de Business Cases hacían `redirect("/clients")` para DEV (expulsión real), y `clients/page.tsx` + `Sidebar` le ocultaban el acceso. Los 6 (+ `guardSalesAccess` en api-guards) ahora derivan de la fuente única; el Sidebar suma DEV a los nav gates donde VENTAS ya estaba (Agentes/Cartera/Auditoría por paridad; `canSeeConfig` NO — VENTAS tampoco). Regla a futuro: gates del área de Ventas van por `isSalesAreaRole`, no re-declarar el array.
  - **Asignación (pendiente de deploy)**: `arodriguez@`, `asalas@` → DEV (dry-run listo); `bsalas@` **no existe como TeamMember** (alta primero). ⚠ **Secuencia obligatoria**: como local==PROD (una DB), asignar `roleEnum=DEV` a una cuenta ANTES de que el PROD desplegado tenga el client con DEV rompe la lectura de esa fila → **desplegar primero, `assign-team-roles.ts --apply` después**. tsc=**27**.
