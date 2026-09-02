# Diagnóstico del API de Odoo — Smarteam

**Servidor** `https://erp.smarteamcr.com` · **base** `smarteamcr` · **usuario** `direct`
**Sonda** `scripts/odoo-diagnostico.ts` (descartable, solo lectura, no escribe ni en Odoo ni en Nexus)
**Fecha de la corrida** 2026-08-28 (protocolo) · **2026-09-02** (datos, con la contraseña ya cargada)

---

## 0 · Estado de este diagnóstico

| Bloque | Estado |
|---|---|
| Reconocimiento del servidor y los endpoints | ✅ medido |
| Transporte (cuerpo en GET desde Node) | ✅ medido |
| Contrato del módulo REST | ✅ leído del código fuente + verificado adversarialmente |
| Semántica de los campos contables de Odoo 17 | ✅ leído del fuente de Odoo |
| **Volúmenes, conteos y desgloses de datos** | ✅ medido (2026-09-02) |
| **Emparejado Odoo ↔ Nexus (lado Odoo)** | ✅ medido (2026-09-02) |
| Emparejado (lado Nexus) | ✅ medido |
| Trampas conocidas, medidas contra la base real | ✅ medido (2026-09-02) |

### ✅ Se completó el 2026-09-02

`ODOO_PASSWORD` se cargó en `.env` y la sonda corrió entera. Los resultados están abajo; el
plan que sale de ellos vive en [odoo-integracion-plan.md](./odoo-integracion-plan.md).

⚠ **El transporte lo decidió el PERMISO, no el volumen.** REST autentica y entrega su API key,
pero devuelve **403 en los nueve modelos**: el módulo de Cybrosys necesita leer `ir.model` para
resolver su propia configuración y `direct` no puede. El mensaje literal de Odoo:

> `No puede acceder a los registros 'Modelos' (ir.model). Esta operación está permitida para
> los siguientes grupos: Administración/Permisos de acceso`

Destrabarlo exige darle a `direct` permisos de **administrador del ERP**. XML-RPC, en cambio,
funcionó sin habilitar nada: `authenticate` devolvió `uid=33` y `execute_kw` leyó las 1.421
facturas. Todos los números de las secciones 4 a 6 salieron por ahí.

⚠ Durante el sondeo previo, antes de conocer el mecanismo de cooldown, se hicieron ~9
peticiones con credenciales inválidas. Odoo 17 corta por IP a los 5 fallos durante 60 s
(`base.login_cooldown_after` / `_duration`), y detrás de un proxy sin `proxy_mode` ese corte lo
comparten todos los clientes. La sonda ya se niega a intentar login sin contraseña.

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

## 4 · Los datos — medido el 2026-09-02

Todo por XML-RPC (`uid=33`). REST no pudo leer un solo modelo.

| Modelo | Total | Desglose |
|---|---|---|
| `account.move` | **1.421** | `entry` 972 · `out_invoice` 304 · `in_invoice` 100 · `out_refund` 44 · `in_refund` 1 |
| `account.move` por `state` | | `posted` 1.389 · `draft` 27 · `cancel` 5 |
| **`account.move.line`** | **3.579** | ← el número que decidía la viabilidad por volumen |
| `res.partner` | 169 | **123** con `vat` · **82** con `customer_rank>0` · **73** con al menos una factura |
| `account.payment` | 209 | de **2022-07-09** a **2026-07-08** |
| `account.bank.statement.line` | 497 | **14 sin conciliar** |
| `account.journal` | 18 | 4 en USD explícito; el resto hereda la moneda de la compañía |

**`out_invoice` publicadas de 2026: 111** — 104 en USD, 7 en CRC.
Por `payment_state`: `paid` 53 · `not_paid` 42 · `reversed` 16.

⚠ **`base_vat` NO está instalado**: el `vat` de Odoo es texto libre, sin ninguna validación.

**Los 18 diarios**: `INV` (facturas de cliente) · `FACTU` (proveedores) · `MISCE` · `CAMBI`
(diferencia de cambio) · `BNK1`–`BNK8` (BAC y BCR, colones y dólares, más 4 tarjetas AMEX) ·
`V24C`/`V24D`/`V32C`/`V32D` (VISA) · `CSH1` (efectivo) · `CABA`.

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

### Lado Odoo — medido, y el resultado es peor de lo esperado

**Odoo: 169 `res.partner`, 82 con `customer_rank>0`.** Contra las 49 cuentas de Nexus:

| Resultado | Cuentas |
|---|---|
| Emparejan por **cédula** | **2** — Selvatura → `[137] INVERSIONES TURISTICAS MONTEVERDE S.A.` · ALMOTEC → `[179] CORPORACION ALMOTEC S.A.` |
| Emparejan por **nombre exacto** | **4** — Transportes Juanva · Forestales Latinoamericanos · Global Supply · Pacuare Luxury Realty |
| Candidato dudoso | 8 — ACCCSA, Ecoquintas, Electrocaribe, APRECAP, MTS, Grupo Servica, Eurostone, Cicadex |
| **Sin ningún candidato** | **33** |
| Inemparejables por nombre | 2 — `IIA`, `TEC- AE` |

→ **6 de 49 se resuelven solas. El 88 % necesita una decisión humana.** Nexus guarda el nombre
comercial y Odoo la razón social; el matcher es conservador a propósito.

### Los tres casos que ya se sabían — confirmados

| Caso | Resultado |
|---|---|
| **Corrugando ↔ ACCCSA** | «Corrugando» NO existe en Odoo. Sí `[35] ACCCSA REVISTA & PUBLICACIONES S.A.` (vat 3101497341, 44 facturas). |
| **Analisalab ↔ Grupo Inve** | «Analisalab» NO existe en Odoo. «Inve» trae 4 candidatos, ninguno obvio. |
| **TEC-AE ↔ TEC TAE** | «tae» NO existe en Odoo. «tec» trae 9 candidatos ruidosos. |

### ⚠ 8 vat duplicados — el vínculo es N:1, confirmado

```
3002662018 → ASOCIACION PRO PREVENCION ... CANCER DE PROSTATA | Lisseth Arguedas
3101690307 → ELECTROCARIBE S&C S.A. | Adrey Chavez
3006087315 → FUNDACION TECNOLÓGICA DE COSTA RICA | Nancy Solano | FUNDACIÓN TECNOLÓGICA DE COSTA RICA
3007219667 → JUNTA DE DESARROLLO REGIONAL ... | JUNTA DE DESARROLLO REGIONAL ... (copia)
3014042104 → MUNICIPALIDAD DE CARRILLO GUANACASTE | MUNICIPALIDAD DE CARRILLO GUANACASTE
3101028741 → PUBLIMARK S.A. | PUBLIMARK S.A.
3102797760 → RELEVA CONSULTORES S.R.L. | RELEVA CONSULTORES S.R.L.
3102456875 → TRANSPORTES REFRIGERADOS HL S.R.L. | Raquel Lobo
```

Algunos son holdings reales; otros son **duplicados literales** («(copia)», dos grafías de la
misma fundación). Los dos casos existen y el emparejado tiene que tolerar ambos.

### Los formatos de `vat`, sin validación que los ordene

| Forma | Cuántos |
|---|---|
| 10 dígitos (jurídica/NITE) | 108 |
| **sin un solo dígito** | **46** |
| 9 dígitos (física) | 13 |
| 11–12 dígitos (DIMEX) | 2 |

Conviven `3101497341`, `3-101-105018` y `31010746160` (11 dígitos — probablemente un typo).

---

## 6 · Trampas del modelo de datos de Odoo 17

### Lo que dieron al medirlas (2026-09-02, sobre 345 facturas de venta publicadas)

| Trampa | Medición |
|---|---|
| `amount_untaxed = 0` | **0** de 345 ✅ |
| `amount_total = 0` | **0** de 345 ✅ |
| `amount_tax = 0` | **30** de 345 — exentos o 0 %, hay que confirmarlo |
| `amount_residual = 0` | 279 de 345 — la mayoría saldada |
| Notas de crédito | 44, y solo **15** con `reversed_entry_id` → **29 huérfanas (66 %)** |
| Facturas con **varios vencimientos reales** | **0** de 345 — el caso no existe hoy |
| `invoicing_legacy` | 0 ✅ |
| Términos de pago definidos | 10, de los cuales 2 con más de una cuota: «30% Now, Balance 60 Days» y «E1» |
| Facturas con término de pago asignado | 17 de 345 |

### ⚠⚠ `in_payment` en 176 de 304 facturas de cliente

El fuente de Odoo 17 **Community** nunca asigna ese estado — su hook devuelve literalmente
`'paid'`. Que aparezca en 176 facturas significa que **esta base no es Community pura**: o vino
de Enterprise, o tiene un módulo de terceros.

Y es justo el dato que hacía falta: `in_payment` significa «el pago está registrado pero
todavía no se concilió contra el banco». Es decir, **ya pagaron y falta el trabajo
administrativo** — exactamente la situación que el semáforo de Nexus no debe castigar.

Distribución completa de `payment_state` sobre `out_invoice`:
`in_payment` **176** · `paid` 59 · `not_paid` 50 · `reversed` 16 · `partial` 3.

⚠ Antes de cablear la promoción a verde hay que confirmar de dónde sale ese estado. Si es un
módulo custom, su semántica podría no ser la de Enterprise.


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

### El transporte

**XML-RPC, y no por preferencia: es el único de los dos que hoy lee datos.** REST autentica
pero devuelve 403 en los nueve modelos, y destrabarlo exige darle a `direct` permisos de
administrador del ERP — mucho más de lo que la integración necesita. XML-RPC funcionó con la
contraseña que ya estaba, sin habilitar nada, y encima acepta `domain`/`limit`/`offset` y filtro
por `write_date`, o sea sincronización incremental, que REST no puede hacer ni con el permiso.

El volumen resultó irrelevante para la decisión: **3.579 líneas** en `account.move.line` es una
base chica que cualquiera de los dos transportes soportaría.

### Campos vacíos o inconsistentes

- **Lado Nexus**: 46 de 49 cuentas sin `cedulaJuridica`, y **48 de 49 sin `creditoDias`** — o
  sea que el vencimiento de casi toda la cartera va a calcularse con el default de 15 días.
  Los 90 días de Colby no están configurados **en Nexus tampoco**.
- **Lado Odoo**: `base_vat` no instalado, 46 de 123 `vat` sin un solo dígito, 8 vat duplicados,
  y 29 de 44 notas de crédito sin factura de origen.

### Las sorpresas

**1. REST está bloqueado por permisos, no por volumen.** Era el candidato «que no depende de
nadie» y resultó el único que necesita que alguien habilite algo.

**2. `in_payment` en 176 facturas, en una base que dice ser Community.** Es el hallazgo más
importante para el diseño del semáforo, y también el que más hay que confirmar.

**3. 6 de 49 cuentas emparejan solas.** El emparejado no es una pantalla de confirmación: es
una tarde de trabajo manual con buscador.

**4. Ninguna factura tiene varios vencimientos.** La trampa de `invoice_date_due` como máximo
existe en el modelo pero no en estos datos — igual conviene no depender de ese campo.

**5. `amount_total` positivo en las notas de crédito** sigue siendo el riesgo silencioso: con
44 notas por sumar mal, el vendido del año se infla y nada avisa.

**6. Hay duplicados literales en Odoo** —«(copia)», dos grafías de la misma fundación— que no
son holdings sino suciedad de datos.

---

**El plan que sale de todo esto**: [odoo-integracion-plan.md](./odoo-integracion-plan.md).
