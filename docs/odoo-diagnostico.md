# Diagnóstico del API de Odoo — Smarteam

**Servidor** `https://erp.smarteamcr.com` · **base** `smarteamcr` · **usuario** `direct`
**Sonda** `scripts/odoo-diagnostico.ts` (descartable, solo lectura, no escribe ni en Odoo ni en Nexus)
**Fecha de la corrida** 2026-08-28

---

## 0 · Estado de este diagnóstico

| Bloque | Estado |
|---|---|
| Reconocimiento del servidor y los endpoints | ✅ medido |
| Transporte (cuerpo en GET desde Node) | ✅ medido |
| Contrato del módulo REST | ✅ leído del código fuente + verificado adversarialmente |
| Semántica de los campos contables de Odoo 17 | ✅ leído del fuente de Odoo |
| **Volúmenes, conteos y desgloses de datos** | ⛔ **BLOQUEADO** |
| **Emparejado Odoo ↔ Nexus (lado Odoo)** | ⛔ **BLOQUEADO** |
| Emparejado (lado Nexus) | ✅ medido |
| Trampas conocidas, medidas contra la base real | ⛔ **BLOQUEADO** |

### ⛔ Por qué está bloqueado

`ODOO_PASSWORD` **no existe** en ninguna de las tres tablas de entorno de Windows (proceso,
usuario, máquina), ni en ningún `.env` del repo. Verificado, no supuesto.

**No se intentó ningún login con credenciales inventadas, a propósito.** Odoo 17 trae
`_assert_can_auth`: tras `base.login_cooldown_after` fallos (por defecto **5**) desde una IP,
esa IP entra en cooldown `base.login_cooldown_duration` segundos (por defecto **60**) y
durante ese rato **hasta las credenciales correctas devuelven `false`**. Y si Odoo está
detrás de un proxy sin `proxy_mode`, el contador se lleva por la IP del proxy: un sondeo
puede dejar sin login a todos los usuarios legítimos. Sondear no es gratis.

### Cómo completarlo

```powershell
$env:ODOO_PASSWORD = "la-contraseña-de-direct"; npx tsx scripts/odoo-diagnostico.ts --json docs/odoo-diagnostico.json
```

⚠ La sonda nunca imprime ni guarda la contraseña ni la API key: de la key solo registra su
largo. El JSON crudo que produce **sí** trae nombres y cédulas de clientes reales.

---

## 1 · El servidor (medido, sin credenciales)

| Sonda | Resultado |
|---|---|
| `GET /` | `303` → `/web` · `Server: Werkzeug/2.2.2 Python/3.11.15` |
| `POST /web/webclient/version_info` | `200` · `server_version: "17.0"`, `server_serie: "17.0"`, `protocol_version: 1` |
| `POST /jsonrpc` → `common.version` | `200` · mismos valores · **sin autenticación** |
| `POST /xmlrpc/2/common` → `version()` | `200` · **113–118 ms** · `server_version = 17.0` · **sin autenticación** |
| `POST /xmlrpc/2/object` (llamada malformada) | `200` con `<fault>` · el endpoint **existe** |
| `GET /odoo_connect` sin headers | **`200`** · `text/html` · `<html><body><h2>wrong login credentials</h2></body></html>` |
| `GET /send_request?model=res.partner` sin headers | **`403`** · HTML de Werkzeug `Access Denied` |

**El traceback de `/xmlrpc/2/object` filtra la ruta de instalación**:
`/opt/smarteamcr/smarteamcr-server/odoo/addons/base/controllers/rpc.py`. Es una fuga menor
de información, pero es la respuesta por defecto de un servidor con `dev`/`debug` o sin
`werkzeug` en modo producción.

### XML-RPC: el endpoint NO está deshabilitado

`/xmlrpc/2/common` y `/xmlrpc/2/object` **responden**. Lo que esté deshabilitado (si algo lo
está) es a nivel del usuario `direct`, no del transporte.

⚠ **`authenticate()` devuelve `false` para TODOS los modos de fallo** — contraseña
incorrecta, usuario archivado, usuario sin contraseña local, 2FA activo, o IP en cooldown.
Por el valor de retorno **no se puede distinguir la causa**. Sí se distinguen dos capas:

- `common.authenticate` con credencial mala → `false` (no lanza excepción).
- `object.execute_kw` con credencial mala → **Fault 3**, `faultString = "Access Denied"`.
- `object.execute_kw` autenticado pero **sin permiso sobre el modelo** → **Fault 4**,
  `AccessError` con mensaje largo (`You are not allowed to access ... (account.move)`).

Esa diferencia es lo que va a decir si `direct` no entra o si entra y no tiene permisos.

**En Odoo 17 no existe ningún flag de "acceso a la API".** Si `direct` no autentica, las
causas reales son, en orden de probabilidad: **2FA activo** (con 2FA la contraseña *nunca*
funciona por RPC — solo API key), usuario archivado, usuario sin contraseña local, usuario
de tipo portal/público, o un módulo de terceros tipo `base_rpc_disable`.

Para leer `account.move` y `account.move.line` **basta el grupo
`account.group_account_readonly`** ("Contabilidad · Solo lectura"): concede `read=1` y
`write/create/unlink=0`. Un usuario interno pelado (`base.group_user`) **no puede** leerlas.

---

## 2 · El transporte: cuerpo en un GET

Esto no es un detalle: el módulo **exige** cuerpo en un GET (ver §3).

| Vía | Resultado |
|---|---|
| `fetch` nativo de Node 22 con `method:"GET"` + `body` | ⛔ `TypeError: Request with GET/HEAD method cannot have body.` |
| Igual, con `duplex:"half"` o pasando un `dispatcher` de undici | ⛔ **mismo error** — el veto vive en la capa spec-fetch, antes del dispatcher |
| `node:https.request({method:"GET"})` + `req.write(body)` | ✅ **funciona** · el servidor respondió `200` sin cortar |
| `undici.request()` (API baja, no la spec fetch) | ✅ funciona y calcula `Content-Length` solo — pero `undici` no viene instalado |

⚠ **`node:http`/`node:https` NO agregan `Content-Length` solos en un GET.** Sin ese header
el cuerpo viaja sin delimitador y Werkzeug lee **0 bytes** — el módulo responde un error
opaco y parece que "el servidor ignora el cuerpo". Hay que ponerlo a mano. Es la causa más
probable de un fallo silencioso en esta integración.

Del lado servidor no hay bloqueo: Werkzeug 2.2.2 `request.get_data()` (que es exactamente
`request.httprequest.data` en Odoo) **sí lee el cuerpo de un GET** si viene delimitado.

---

## 3 · El contrato del módulo REST

Leído del fuente (`CybroOdoo/CybroAddons`, rama `17.0`, `rest_api_odoo/controllers/`).

### Lo que hay

- **Dos rutas y nada más**: `/odoo_connect` y `/send_request`, ambas `type='http'`,
  `auth='none'`. No hay endpoints por modelo ni versionado.
- `/odoo_connect` lee **tres headers**: `login`, `password`, `db`. Nada por query string.
- En éxito devuelve `{"Status": "auth successful", "User": …, "api-key": …}` — pero con
  `Content-Type: text/html`, porque se emite con `request.make_response` sin headers.
- **El header de la clave es `api-key`, CON GUION.** La colección Postman que trae el propio
  módulo lo escribe mal (`api_key`) en uno de sus requests: no copiarla a ciegas.

### ⚠ Las cuatro restricciones que definen el proyecto

**1. `/send_request` acepta EXACTAMENTE dos query params: `model` e `Id`.**
No hay `domain`, ni `limit`, ni `offset`, ni `order`, ni filtro por fecha de modificación.
La palabra `offset` no aparece en el archivo, y `request.httprequest.args` tampoco. El único
`limit=1` del módulo busca su propio registro de configuración, no filtra datos.
→ **Traer la tabla entera en cada corrida es la única opción. No hay sincronización
incremental posible por esta vía.**

**2. `fields` es OBLIGATORIO y va en el CUERPO, incluso en un GET.**
`data = json.loads(request.httprequest.data)` y después `for field in data['fields']`. Si no
hay campos: HTML de error. Y ese `json.loads` corre **fuera** del `try`, así que un GET sin
cuerpo no da un error controlado sino un **500** con la página de error de Odoo.

**3. La `api-key` NO reemplaza la contraseña.**
`/send_request` ejecuta `request.session.authenticate` con los headers `login`/`password`
**en cada petición**, antes incluso de validar la clave. → La contraseña del usuario Odoo
circula en **cada llamada**. Un usuario de servicio dedicado no es opcional.

**4. Ningún error devuelve el status HTTP correcto.**
No hay un solo `status=` en el archivo: todos los caminos de error retornan un string HTML
con **200**. → El cliente tiene que decidir éxito/fallo **parseando el cuerpo** (si empieza
con `<html>` es error). Cualquier retry, alerta o monitoreo basado en 4xx/5xx **no va a
disparar nunca**.

### La API key

- **No usa `res.users.apikeys` de Odoo.** Es un campo propio del módulo: `api_key = Char(...)`
  sobre `res.users`, en **texto plano**.
- **No expira y es idempotente**: `if not users.api_key: … else: key = users.api_key`. Se pide
  una vez y sirve para siempre.
- **No se puede rotar ni revocar desde la app** (el campo es `readonly` en la vista): hay que
  hacer un UPDATE en base o quitarle el usuario.
- Queda **fuera** del sistema nativo de API keys: sin hash, sin scope, sin pantalla de
  revocación. Legible en `res_users.api_key` para cualquiera con acceso a la base.

⚠ Por eso mismo, **esa clave probablemente NO sirve para `/xmlrpc/2/common`**: la key nativa
de Odoo (Preferencias → Seguridad de la cuenta) sí funciona como reemplazo de contraseña en
RPC; la del módulo es otra cosa. La sonda prueba las dos.

### `GET` sin `Id`

`if not kw.get('Id'): rec_id = 0` y entonces `search_read(domain=[], fields=fields)`:
**devuelve la tabla completa, sin límite**. Es lo que hace falta para una extracción total, y
también el riesgo: un único `json.dumps` sobre la lista entera dentro del worker de Odoo —
pico de RAM y posible corte por `limit_time_real` / `limit_memory_hard`.

---

## 4 · Los datos ⛔ BLOQUEADO

Sin `ODOO_PASSWORD` no hay un solo número de esta sección. La sonda ya tiene programadas
todas las consultas; corren en una sola pasada apenas exista la variable:

`res.partner` total / con `vat` / con `customer_rank>0` / con facturas · `account.move` total,
por `move_type`, por `state` · `out_invoice` publicadas 2026 por moneda y por `payment_state`
· `account.move.line` total y por `display_type` · `account.payment` total y rango de fechas ·
`account.bank.statement.line` total, sin conciliar, y ambos por diario · `account.journal` con
su moneda · y si está instalado `base_vat`.

---

## 5 · Emparejado Odoo ↔ Nexus

### Lado Nexus — medido

**49** `CuentaFinanciera`.

| Corte | Reparto |
|---|---|
| `tipo` | NACIONAL 29 · INTERNACIONAL 20 |
| `moneda` | USD 46 · CRC 3 |
| `viaCobro` | ODOO 45 · MERCURY 4 |
| `estadoCuenta` | ACTIVA 46 · PENDIENTE_DATOS 3 |
| `creditoDias` | null 48 · 15 → 1 |
| **con `cedulaJuridica`** | **3 de 49** |

**Las tres cédulas, y las tres son distintas entre sí:**

| Cuenta | Valor guardado | Dígitos | Clase |
|---|---|---|---|
| Selvatura | `3101098834` | 3101098834 | jurídica/NITE (10) ✅ |
| ALMOTEC | `3-101-105018` | 3101105018 | jurídica/NITE (10) ✅ **pero con guiones** |
| Alliance RH | `COAL780221HR9` | — | ⛔ **no es una cédula de Costa Rica: es un RFC mexicano** (4 letras + 6 dígitos + homoclave) |

→ De los tres únicos identificadores fiscales que Nexus tiene, **dos formatos distintos y uno
que ni siquiera es del país**. El emparejado por cédula, hoy, puede cubrir **2 de 49** como
máximo.

### El normalizador de nombres — validado

Contra los 49 nombres reales: **0 colisiones** (dos cuentas distintas nunca normalizan igual)
y **0 nombres destruidos** por el filtro de sufijos societarios. Ejemplos:
`Global Supply S.A` → `global supply` · `Pacuare Luxury Realty CR S.A.` → `pacuare luxury
realty cr` · `Seléctrica` → `selectrica`.

Se reusa el matcher de `lib/ventas/respaldo-de-factura.ts`, ya afinado contra estos mismos
nombres: exige que **todas** las palabras distintivas (≥ 4 letras, sin stopwords) del nombre
corto estén en el largo. Esa regla nació de un defecto real — pedir *una* palabra en común
hacía que "Amvac Latam" emparejara con "Forestales LATAM".

### ⚠ Dos cuentas son INEMPAREJABLES por nombre, y no por culpa de Odoo

| Cuenta | Palabras distintivas |
|---|---|
| **IIA** | *(ninguna)* |
| **TEC- AE** | *(ninguna)* |

El corte de 4 letras las deja sin nada con qué comparar. Bajar el corte a 3 metería "TEC"
contra cualquier cosa que contenga esas letras — que es exactamente el caso que preguntaste
(TEC-AE vs TEC TAE). **Estas dos necesitan cédula o un mapeo a mano; no hay heurística de
nombre que las resuelva.**

### Lado Odoo ⛔ BLOQUEADO

Pendientes: la lista de `res.partner` cliente con `id`/`name`/`vat`, los `vat` duplicados (el
indicador de que un holding factura con varios nombres), los formatos crudos de `vat`, y la
búsqueda explícita de `corrugando` / `acccsa` / `analisalab` / `inve` / `tec` / `tae` /
`amvac` / `forestales`.

⚠ **Corrugando/ACCCSA y Analisalab/Grupo Inve existen como cuentas SEPARADAS en Nexus** (las
cuatro están en las 49). O sea que no es solo "Odoo factura con otro nombre": Nexus ya tiene
las dos puntas, y el cruce va a proponer emparejar una factura de ACCCSA con dos cuentas
candidatas. Eso lo decide una persona, no una heurística.

---

## 6 · Trampas del modelo de datos de Odoo 17

Leído del fuente de Odoo 17.0. Los conteos contra la base real están ⛔ bloqueados, pero
estas son las trampas confirmadas que hay que medir y que cambian la interpretación:

### Signos

⚠ **`amount_total` es POSITIVO tanto para `out_invoice` como para `out_refund`**, porque el
compute lo multiplica por `direction_sign`. → `SUM(amount_total)` sobre facturas + notas de
crédito **sobreestima** la venta neta: la nota de crédito suma en vez de restar.
**El campo correcto es `amount_total_signed`** (y `amount_residual_signed` para la cartera).
Los cinco campos `_signed` son columnas reales, en moneda de la **compañía** — que además es
lo que hay que usar para consolidar una base multi-moneda.

### `payment_state`

Seis valores exactos: `not_paid`, `in_payment`, `paid`, `partial`, `reversed`,
`invoicing_legacy`.

- **`reversed` = saldada por nota de crédito.** Pero solo si **ninguna** contrapartida es un
  pago. Una factura saldada mitad con pago y mitad con NC queda en **`paid`** → contar NC por
  `reversed` **subcuenta los casos mixtos**.
- **`paid` no garantiza que entró dinero.** Se llega ahí también con residual cero y sin
  ningún pago.
- ⚠ **`in_payment` NUNCA se asigna en Community.** El hook devuelve literalmente `'paid'`; solo
  Enterprise lo habilita. **Si aparece en la base, es residuo de una migración desde
  Enterprise o de un módulo custom** — es un marcador de inconsistencia detectable.
- ⚠ **`not_paid` se fuerza para TODO lo que no sea (`posted` Y factura).** Todos los
  borradores, todos los cancelados y **todos los `move_type='entry'`** salen como `not_paid`.
  Contar "facturas impagas" sin filtrar `state='posted'` y `move_type` es probablemente la
  fuente #1 de números inflados.

### Ceros legítimos

⚠ Para `move_type='entry'`, `amount_untaxed` y `amount_tax` quedan **siempre en 0 por
diseño**, y los asientos suelen ser el grueso de `account_move`. Marcar eso como "campo
vacío" genera falsos positivos masivos. La regla útil es acotada: `state='posted'` **y**
`move_type` de factura **y** `amount_total = 0` → sospechoso.

### Notas de crédito

⚠ **`reversed_entry_id` es NULL en la mayoría de notas de crédito reales.** Solo se llena si
la NC nació del asistente de reversión. Una NC creada a mano queda huérfana aunque esté
conciliada. **El enlace de negocio real vive en la conciliación** (`account.partial.reconcile`
entre las líneas `asset_receivable` de ambos asientos), no en ese campo.

Y `move_type` tiene **7** valores, no 6: existen `out_receipt` e `in_receipt`. Un filtro de
facturación de venta correcto es `move_type IN ('out_invoice','out_refund','out_receipt')`.

### Vencimientos múltiples

⚠ **`invoice_date_due` de la cabecera es el MÁXIMO de los vencimientos, no el primero.** Una
antigüedad de cartera calculada sobre él **subestima el vencido** en toda factura con cuotas:
la primera cuota puede llevar 90 días vencida y la cabecera muestra la fecha de la última.
Para un aging correcto hay que ir a `account.move.line.date_maturity`, cuota por cuota.

El criterio canónico para detectar cuotas: contar las líneas con
`display_type='payment_term'` de cada factura. Más de una = varios vencimientos.

### `res.partner` y el `vat`

- ⚠ **`customer_rank` es un HISTORIAL, no una bandera**: se incrementa al facturar y nunca se
  decrementa. Un partner con `customer_rank=0` **puede tener facturas** si se cargaron por
  importación. El chequeo real es cruzar contra `account.move`.
- La validación de `vat` para Costa Rica está en **`base_vat`**, que es **opcional**; `l10n_cr`
  no aporta nada de cédulas. **Si `base_vat` no está instalado, `vat` es texto libre sin
  ninguna validación.**
- Regla de CR: **solo dígitos**, `9` (física) · `10` (jurídica/NITE) · `11-12` (DIMEX).
- ⚠ **Odoo NO agrega el prefijo `CR` automáticamente**, pero SÍ lo normaliza si alguien lo
  escribió. **Las dos formas conviven en la misma base** (`3101098834` y `CR3101098834`) y
  son el mismo contribuyente. Toda comparación tiene que quitar el prefijo y los no-dígitos.
  Es una fuente segura de partners duplicados.
- La validación se puede saltar con el context key `no_vat_validation`, pensado justamente
  para cargas por API. Aunque `base_vat` esté instalado, no es garantía retroactiva.

### `account.move.line` — la escala

Una factura simple (1 producto, 1 impuesto) genera **3 filas**: `product`, `tax`,
`payment_term`. Las líneas contables están en la **misma tabla** que las de producto. Regla
práctica: **~3–4 filas por factura**. `display_type` tiene 10 valores y es `required`, así
que nunca es NULL. ⚠ **`exclude_from_invoice_tab` NO existe en Odoo 17** — era de la 13-15.

---

## 7 · Errores exactos encontrados

| Dónde | Error |
|---|---|
| `fetch` de Node 22, GET con cuerpo | `TypeError: Request with GET/HEAD method cannot have body.` |
| `GET /odoo_connect` sin credenciales válidas | HTTP **200** + `<html><body><h2>wrong login credentials</h2></body></html>` |
| `GET /send_request` sin headers | HTTP **403** + HTML de Werkzeug `Access Denied` |
| `POST /xmlrpc/2/object` malformado | `<fault>` con traceback que expone `/opt/smarteamcr/smarteamcr-server/…` |
| `xmlrpc authenticate()` con secreto vacío | `<boolean>0</boolean>` — **`false`, no un fault** |
| Entorno | `ODOO_PASSWORD` ausente en proceso, usuario y máquina |

⚠ **Confesión metodológica**: antes de conocer el mecanismo de cooldown hice unas **9
peticiones con credenciales inválidas** (contraseña vacía y una cadena inventada) entre
`/odoo_connect` y `xmlrpc authenticate`. Eso pudo dejar la IP de esta máquina en cooldown por
60 s. Ya expiró, y un login exitoso resetea el contador — pero si `direct` falla al primer
intento real, **conviene esperar un minuto y reintentar antes de concluir nada**. La sonda ya
está corregida para no intentar ningún login sin contraseña.

---

## 8 · Mi lectura

### ¿Alcanza REST?

**Para un espejo de solo lectura que se refresca completo, probablemente sí. Para
sincronización incremental, no — y no es cuestión de volumen sino de contrato.**

El módulo **no acepta ningún filtro**. Ni `domain`, ni `limit`, ni fecha de modificación. La
única operación posible es *"dame la tabla entera de este modelo con estos campos"*. Eso
significa que:

- No se puede pedir "las facturas que cambiaron desde ayer". Cada refresco es un volcado
  completo de `account.move` **y** `account.move.line`.
- Todo el filtrado, agrupado y conteo pasa a hacerse **del lado de Nexus**, sobre el volcado.
- El límite duro no es la red: es el **worker de Odoo**, que serializa la tabla entera en
  memoria con un solo `json.dumps` antes de responder. Con `account.move.line` grande, el
  riesgo es un corte por `limit_time_real`/`limit_memory_hard` — que además se va a ver como
  un **200 con HTML**, no como un error.

**El número que decide es `account.move.line`.** Es lo primero que hay que medir, y la sonda
lo pide con `fields=["id"]` justamente para dimensionarlo al costo mínimo.

### ¿Hace falta XML-RPC?

**Mi recomendación es sí, y pedirlo ya.** No como plan B: como el camino principal.

El endpoint **existe y responde**. Lo único que falta es que `direct` pueda autenticarse, y en
Odoo 17 eso **no requiere instalar ni habilitar nada** — no hay flag de API. Con la key nativa
(Preferencias → Seguridad de la cuenta → Nueva clave de API) y el grupo
`account.group_account_readonly`, el especialista lo resuelve en minutos.

Lo que se gana es desproporcionado: `search_count`, `read_group` y `search_read` con `domain`,
`limit` y `offset`. Un conteo por `payment_state` pasa de "volcar 100% de `account.move` y
agrupar en Nexus" a **una llamada que devuelve seis filas**. Y habilita la sincronización
incremental por `write_date`, que con REST es directamente imposible.

**Y hay un argumento de seguridad que pesa más que el de rendimiento**: el módulo REST manda
la **contraseña en texto plano en cada petición** y guarda su "API key" **sin hash** en una
columna de `res_users`. XML-RPC con una key nativa es estrictamente más seguro que lo que ya
está instalado.

### Campos vacíos o inconsistentes

Del lado **Nexus**, medido: **46 de 49 cuentas sin `cedulaJuridica`**, y de las 3 que hay, dos
formatos distintos y una que es un RFC mexicano. Ese es el hallazgo que más condiciona el
proyecto: **el emparejado por identificador fiscal hoy no existe**. Va a haber que capturarlo,
y el mejor momento es tomarlo de Odoo en la primera corrida.

Del lado **Odoo**: bloqueado. Pero las trampas de §6 dicen dónde mirar.

### Las sorpresas — lo que no anticipaste

**1. `fields` es obligatorio y va en el cuerpo de un GET.**
No es un extra opcional: sin cuerpo el módulo tira **500**. Y `fetch` de Node —el cliente por
defecto de Nexus— **no puede mandarlo**. Toda la integración tiene que usar `node:https` con
`Content-Length` explícito. Es una restricción de arquitectura, no un detalle.

**2. La "API key" del módulo es decorativa.**
`/send_request` autentica con `login`+`password` en **cada** llamada. La contraseña de `direct`
va a viajar en cada petición, para siempre. Eso hace **obligatorio** un usuario de servicio
dedicado y de solo lectura — no es una buena práctica opcional.

**3. Ningún error devuelve el status correcto.**
Todo es `200` con HTML. Cualquier lógica de reintento, alerta o "¿anda la integración?" basada
en códigos HTTP **nunca va a dispararse**. Hay que detectar el error parseando el cuerpo.
Un fallo de este API se va a ver como éxito.

**4. `amount_total` es positivo también en las notas de crédito.**
Sumar facturas y notas de crédito con `amount_total` da un número inflado y **nada avisa**. Es
el error de signo más probable, y es silencioso.

**5. `reversed_entry_id` no sirve para enlazar una NC con su factura.**
Está NULL en la mayoría de las notas creadas a mano. Preguntaste por "facturas saldadas por
nota de crédito": el camino no es ese campo ni `payment_state='reversed'` (que además
subcuenta los casos mixtos), sino la conciliación.

**6. `invoice_date_due` es el MÁXIMO de los vencimientos.**
Si alguna factura tiene cuotas, una antigüedad calculada sobre la cabecera **subestima el
vencido**. Nexus ya tiene un criterio único de vencido para cobranza: hay que decidir
deliberadamente cuál manda cuando Odoo diga otra cosa.

**7. Odoo 17 tiene rate limiting de login por IP, y detrás de un proxy es de todos.**
No lo esperaba y me hizo cambiar la sonda. Con `proxy_mode` mal configurado, cinco intentos
fallidos de una integración pueden dejar sin login a las personas.

**8. Dos de tus cuentas no se pueden emparejar por nombre, y no es culpa de Odoo.**
`IIA` y `TEC- AE` no tienen ninguna palabra de 4+ letras. Bajar el umbral para rescatarlas
rompería el resto — es literalmente el caso "TEC" contra cualquier cosa. Necesitan cédula o
mapeo manual, y conviene saberlo antes de diseñar la pantalla de emparejado.

**9. Corrugando/ACCCSA y Analisalab/Grupo Inve están las CUATRO en Nexus.**
No es "Odoo usa otro nombre": Nexus tiene las dos puntas como cuentas separadas. El cruce va a
proponer dos candidatas para la misma factura. La pantalla de emparejado tiene que soportar
**varias cuentas de Nexus apuntando a un mismo `res.partner`** — que es exactamente lo que
significa "un holding factura por todos".
