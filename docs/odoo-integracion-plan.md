# Integración Nexus ↔ Odoo — plan de implementación

**Fecha** 2026-09-02 · **Diagnóstico que lo respalda** [odoo-diagnostico.md](./odoo-diagnostico.md)

Este documento tiene dos lectores. La sección 1 es para quien necesita entender qué cambia en
su trabajo; de la 2 en adelante es para quien lo va a implementar. La última sección son
preguntas abiertas que necesitan respuesta antes de arrancar.

---

## 1 · Qué problema resuelve

Hoy Alexander lleva la misma información en cuatro lugares: el banco, Odoo, Nexus y una hoja
de Google. Cuando emite una factura la anota en Odoo, y después vuelve a Nexus a marcar el
cobro como facturado. Cuando entra un pago, lo ve en el banco, lo concilia en Odoo, y
después vuelve a Nexus a marcarlo cobrado. Nadie hizo nada mal: simplemente los dos sistemas
no se hablan, y la única conexión entre ellos es una persona copiando datos.

Eso tiene dos costos. El primero es el tiempo. El segundo, más caro, es que **los dos
sistemas se separan sin que nadie se entere**: Nexus puede estar diciendo que un cliente debe
plata que ya pagó, o que hay que facturar algo que ya se facturó. Y como el semáforo de
cobranza alimenta el dashboard de gerencia, esa diferencia sube hasta la reunión de dirección.

**Lo que hace esta integración**: Nexus va a leer de Odoo, solo. Cada mañana va a traer las
facturas emitidas y los pagos recibidos, y a ponerlos al lado de lo que Nexus ya sabía. Ni
una escritura hacia Odoo, nunca.

### Qué deja de hacerse a mano

- **Marcar «facturado» en Nexus.** Si la factura existe en Odoo, Nexus lo sabe solo.
- **Marcar «cobrado».** Si Odoo dice que la factura está pagada, Nexus lo refleja.
- **Buscar por qué no cuadra.** Hoy, cuando un número no coincide, hay que abrir los dos
  sistemas y comparar a ojo. Va a haber una lista que lo dice.

### Qué van a ver distinto

**Alexander**, en Cobranza:

- Una pantalla nueva, **una sola vez**, para decir qué cliente de Odoo es qué cuenta de Nexus.
  Es trabajo de una tarde y no se repite.
- En el cronograma de cada cliente, al lado de cada cobro, **la factura de Odoo que le
  corresponde** — con su número y su estado real.
- Una lista de diferencias ordenada por plata: *«este cobro no tiene factura en Odoo»*,
  *«esta factura no tiene cobro en Nexus»*, *«el monto no coincide»*.
- Cobros que se ponen en verde solos cuando Odoo confirma el pago.

**Marco**, en el dashboard: los mismos números, pero sostenidos por la facturación real en vez
de por lo que alguien alcanzó a marcar. Y cuando algo no cuadra, una lista concreta en vez de
una sensación.

### Lo que NO hace, y es a propósito

**Nexus sigue siendo dueño del plan de pago.** Odoo no sabe —ni tiene por qué saber— que a
Wherex había que cobrarle en dos cuotas, ni cuándo. Ese es el `Cobro` con su `fechaProgramada`
y sigue viviendo acá. El espejo **completa** el modelo, no lo reemplaza: Odoo es dueño de los
hechos (factura emitida, pago recibido, IVA), Nexus es dueño de la intención (qué debería
facturarse y cuándo).

---

## 2 · Los números que deciden el enfoque

Medidos el **2026-09-02** contra `erp.smarteamcr.com`, base `smarteamcr`, usuario `direct`.

| | |
|---|---|
| `account.move` | **1.421** (972 asientos · 304 facturas de cliente · 44 notas de crédito · 100 de proveedor) |
| **`account.move.line`** | **3.579** ← el número que iba a decidir si el volumen era viable |
| `res.partner` | 169 · **82** con `customer_rank>0` · **73** con al menos una factura |
| `account.payment` | 209, de 2022-07-09 a 2026-07-08 |
| `account.bank.statement.line` | 497 · **14 sin conciliar** |
| `account.journal` | 18 (4 en USD explícito, el resto en moneda de compañía) |
| `out_invoice` publicadas 2026 | **111** — 104 USD · 7 CRC |

**El volumen no es problema.** 3.579 líneas es una base chica: cualquiera de los dos
transportes la soporta.

### Pero el transporte lo decidió el permiso, no el volumen

**REST devuelve 403 en los nueve modelos habilitados.** Autentica bien y entrega su API key,
pero después:

> `No puede acceder a los registros 'Modelos' (ir.model). Esta operación está permitida para
> los siguientes grupos: Administración/Permisos de acceso`

El módulo de Cybrosys necesita leer `ir.model` para resolver su propia configuración, y
`direct` no puede. Destrabarlo exige darle **permisos de administrador del ERP** — mucho más
de lo que esta integración necesita.

**XML-RPC funciona hoy, sin habilitar nada.** `authenticate` devolvió `uid=33` con la
contraseña que ya está en `.env`, y `execute_kw` leyó las 1.421 facturas. Además acepta
`domain`, `limit`, `offset` y filtro por `write_date` — o sea **sincronización incremental**,
que REST no puede hacer ni con el permiso otorgado.

→ **El plan va por XML-RPC.**

> **Contingencia.** Si algún día se decide darle a `direct` el grupo de administración, REST
> queda a un cambio de implementación de distancia: el transporte vive detrás de la interfaz
> `OdooTransport` (§5) y nada aguas arriba lo sabe. No es trabajo de fase 1 y no vale la pena
> hacerlo salvo que XML-RPC se caiga: es más frágil (errores como HTTP 200 con HTML), manda la
> contraseña en cada petición y no permite filtrar.

---

## 3 · El emparejado dio peor de lo esperado

Esta es la sección que cambia el alcance de la primera pantalla.

| Resultado | Cuentas |
|---|---|
| Emparejan por **cédula** | **2** |
| Emparejan por **nombre exacto** | **4** |
| Candidato dudoso (hay que revisar) | 8 |
| **Sin ningún candidato** | **33** |
| Inemparejables por nombre (`IIA`, `TEC- AE`) | 2 |

**6 de 49 se resuelven solas. El 88 % lo tiene que decidir una persona.**

Por qué: Nexus guarda el nombre comercial (`ALMOTEC`, `Wherex`, `Teamnet`) y Odoo la razón
social (`CORPORACION ALMOTEC SOCIEDAD ANONIMA`). El matcher es conservador a propósito —
aflojarlo trae de vuelta el bug de «Amvac Latam» contra «Forestales LATAM».

### Consecuencia para el diseño

**La pantalla de emparejado NO puede ser «confirmá estas 49 propuestas».** Con 6 propuestas y
43 huecos, eso sería una pantalla vacía. Tiene que ser:

1. **Un buscador**, primero. Alexander escribe «almotec» y ve los `res.partner` que matchean
   por nombre, por vat o por correo. Ese es el flujo principal, no el de excepción.
2. **Las propuestas arriba**, como atajo para las 14 que sí tienen candidato.
3. **Poder marcar «este partner de Odoo no es cliente nuestro»** — Odoo tiene 82 clientes y
   Nexus 49 cuentas; la diferencia no es un error, es historia.

### Los casos que ya se sabía que fallan — confirmados, y con matices

| Caso | Resultado real |
|---|---|
| **Corrugando ↔ ACCCSA** | «Corrugando» **no existe en Odoo**. Sí existe `[35] ACCCSA REVISTA & PUBLICACIONES S.A.` (vat 3101497341, 44 facturas). Nexus tiene las dos como cuentas separadas → el vínculo lo tiene que hacer una persona. |
| **Analisalab ↔ Grupo Inve** | «Analisalab» **no existe en Odoo**. «Inve» trae 4 candidatos, ninguno obviamente correcto. Requiere decisión humana. |
| **TEC-AE ↔ TEC TAE** | «tae» **no existe en Odoo**. «tec» trae 9 candidatos ruidosos. Confirma el diagnóstico: sin palabras distintivas, no hay heurística. |

### Y un hallazgo nuevo: 8 vat duplicados en Odoo

Confirma que el vínculo `res.partner → CuentaFinanciera` es **N:1**. Pero además hay
duplicados literales que son suciedad de datos, no holdings:

```
3006087315 → FUNDACION TECNOLÓGICA DE COSTA RICA | Nancy Solano | FUNDACIÓN TECNOLÓGICA DE COSTA RICA
3007219667 → JUNTA DE DESARROLLO ... | JUNTA DE DESARROLLO ... (copia)
3014042104 → MUNICIPALIDAD DE CARRILLO GUANACASTE | MUNICIPALIDAD DE CARRILLO GUANACASTE
```

⚠ Y **`base_vat` no está instalado**: el `vat` de Odoo es texto libre sin validar. De 123
partners con vat, **46 no tienen un solo dígito**. Los formatos conviven: `3101497341`,
`3-101-105018`, `31010746160` (11 dígitos, probablemente un typo).

---

## 4 · Las trampas, medidas contra la base real

| Trampa | Medición | Consecuencia |
|---|---|---|
| Campos de monto poblados | `amount_untaxed=0` en **0** de 345 · `amount_total=0` en **0** de 345 | ✅ los montos vienen completos |
| `amount_tax = 0` | **30** de 345 | exentos o 0 % — hay que confirmarlo, no asumir error |
| `amount_residual = 0` | 279 de 345 | la mayoría está saldada |
| Notas de crédito | 44, y solo **15** con `reversed_entry_id` | **29 huérfanas (66 %)** — ese campo NO sirve para enlazar |
| Facturas con varios vencimientos | **0** de 345 | el caso no existe hoy; el modelo igual lo soporta |
| `invoicing_legacy` | 0 | ✅ sin residuos de migración vieja |

### ⚠⚠ El hallazgo grande: `in_payment` en 176 de 304 facturas de cliente

El fuente de Odoo 17 **Community** nunca asigna ese estado: su hook devuelve literalmente
`'paid'`. Que aparezca en 176 facturas significa que **esta base no es Community pura** — o
vino de Enterprise, o tiene un módulo de terceros.

Y es exactamente el dato que hacía falta. `in_payment` significa **«el pago está registrado
pero todavía no se concilió contra el banco»**. Es decir: *ya pagaron, falta el trabajo
administrativo*. Eso implementa directamente la regla del semáforo:

```
paid        → Nexus puede promover a verde
in_payment  → Nexus promueve a verde Y marca la fila «sin conciliar en Odoo»
not_paid    → Nexus NO degrada: cae a su propio estado y marca «sin conciliar»
partial     → no degrada; muestra las dos cifras
reversed    → saldada por nota de crédito, no por pago
```

⚠ Antes de encender hay que confirmar de dónde sale `in_payment` (§10, pregunta 1). Si es un
módulo custom, su semántica podría no ser la de Enterprise.

---

## 5 · Arquitectura

### El transporte, detrás de una interfaz

`lib/cobranza/odoo/transporte.ts` — puerto, cero Prisma:

```ts
export interface OdooTransport {
  buscarYLeer(modelo: string, dominio: unknown[], campos: string[], opts?: { limit?: number; offset?: number; order?: string }): Promise<Record<string, unknown>[]>;
  contar(modelo: string, dominio: unknown[]): Promise<number>;
  agrupar(modelo: string, dominio: unknown[], campos: string[], por: string[]): Promise<Record<string, unknown>[]>;
}
```

Implementación `transporte-xmlrpc.ts`. La sonda `scripts/odoo-diagnostico.ts` ya tiene el
cliente JSON-RPC funcionando (`jsonrpc()`, `xmlrpcAuth()`) — se porta desde ahí, no se
reescribe. Copiar también el `crudo()` con `Content-Length` explícito.

⚠ **`fetch` de Node 22 no puede mandar cuerpo en un GET** (`TypeError: Request with GET/HEAD
method cannot have body.`). XML-RPC/JSON-RPC van por POST, así que esto **no aplica** al
camino elegido — pero sí aplicaría a la contingencia REST.

### El módulo puro

`lib/cobranza/odoo/espejo.ts` — sin Prisma, sin red, sin reloj. Contiene:

- `mapearFactura(cruda)` → el DTO del espejo, **en moneda nativa**.
- `promoverSemaforo(estadoNexus, paymentState)` → la regla de «promueve, nunca degrada».
- `vencimientoDe(invoiceDate, creditoDias)` → `invoice_date + creditoDias`. **No usa
  `invoice_date_due`** (es el máximo de los vencimientos, y los 90 días de Colby no están
  configurados en ninguno de los dos lados).
- `calcularDeltas(previa, nueva)` → la bitácora, copiando la serialización de
  `sync-ganadas.ts:343-360` (`"(sin monto)"`, `"(ninguno)"`, fechas `slice(0,10)`).
- `esCorridaParcial(traidas, conocidas)` → la guarda del 50 %.

⚠ **Este módulo NO puede convertir moneda.** El test estructural `equilibrio.test.ts` §K
prohíbe `crcPorUsd`/`TipoCambioMes` dentro de los motores de cobranza. El espejo guarda el
monto nativo y `convertir()` (`lib/finanzas/equilibrio.ts:316`) sigue siendo el único punto de
conversión. Cuando el cobro y la factura estén en monedas distintas: **marcar la fila y mostrar
las dos cifras**, nunca cuadrarlas.

---

## 6 · Esquema nuevo

Sigue el molde de `VentaGanada` (`prisma/schema.prisma:3953`): identidad por id externo con
`@unique` de una columna —no el par `fuente/fuenteIdExterno`, que ya está ocupado con `"sheet"`
en 45 de 49 cuentas y es un solo par—, nunca borra sino que marca, y bitácora aparte.

```prisma
enum FacturaOdooEstadoEspejo {
  VIGENTE       // vuelve del sync, normal
  DESAPARECIDA  // ya no vuelve de Odoo. NUNCA se borra la fila.
}

enum FacturaOdooCambioTipo {
  ALTA
  MONTO
  RESIDUAL
  ESTADO_PAGO   // payment_state
  ESTADO        // state (draft/posted/cancel)
  FECHA
  CUENTA        // se resolvió o cambió a qué CuentaFinanciera pertenece
  DESAPARECIDA
}

enum OdooVinculoVia { CEDULA  NOMBRE  MANUAL }

model FacturaOdoo {
  id           String  @id @default(cuid())
  odooMoveId   Int     @unique   // la identidad: re-sincronizar actualiza, nunca duplica
  numero       String            // account.move.name
  moveType     String            // out_invoice | out_refund | out_receipt
  state        String            // draft | posted | cancel
  paymentState String            // not_paid | in_payment | paid | partial | reversed | invoicing_legacy

  invoiceDate    DateTime  @db.Date
  // Se guarda para poder AUDITAR la diferencia, pero el vencimiento se calcula con
  // invoice_date + CuentaFinanciera.creditoDias. Ver §4 y la pregunta 2 de §10.
  invoiceDateDue DateTime? @db.Date

  // TODOS en moneda NATIVA del documento. Nada se convierte acá.
  montoTotal       Decimal @db.Decimal(14, 2)
  montoResidual    Decimal @db.Decimal(14, 2)
  montoImpuesto    Decimal @db.Decimal(14, 2)
  // Con signo: amount_total es POSITIVO también en las notas de crédito.
  montoTotalSigned Decimal @db.Decimal(14, 2)
  moneda           String  // NO el enum CobranzaMoneda: Odoo puede traer otras

  odooPartnerId     Int
  odooPartnerNombre String  // snapshot autosuficiente
  cuentaId          String?
  cuenta            CuentaFinanciera? @relation(fields: [cuentaId], references: [id], onDelete: SetNull)

  estadoEspejo    FacturaOdooEstadoEspejo @default(VIGENTE)
  sincronizadoEn  DateTime
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  cambios  FacturaOdooCambio[]  @relation("CambiosDeFactura")
  vinculos CobroFacturaOdoo[]

  @@index([cuentaId])
  @@index([invoiceDate])
  @@index([paymentState, invoiceDate])
}

model FacturaOdooCambio {
  id         String       @id @default(cuid())
  facturaId  String?      // nullable + SetNull: la historia sobrevive a la factura
  factura    FacturaOdoo? @relation("CambiosDeFactura", fields: [facturaId], references: [id], onDelete: SetNull)
  odooMoveId Int          // snapshot autosuficiente
  numero     String

  tipo     FacturaOdooCambioTipo
  anterior String?
  nuevo    String?
  // ⚠ El molde VentaGanadaCambio NO tiene este campo porque su bitácora la escribe
  // siempre el sync. Acá el emparejado lo edita una persona, y sin esto no se puede
  // distinguir "lo movió Odoo" de "lo movió Alexander".
  registradoPor String?
  detectadoEn   DateTime @default(now())

  @@index([facturaId])
  @@index([detectadoEn])
}

// N:M: una factura puede cubrir varias cuotas, y una nota de crédito ninguna.
model CobroFacturaOdoo {
  id        String      @id @default(cuid())
  cobroId   String
  cobro     Cobro       @relation(fields: [cobroId], references: [id], onDelete: Cascade)
  facturaId String
  factura   FacturaOdoo @relation(fields: [facturaId], references: [id], onDelete: Cascade)

  // false = lo propuso el sistema y nadie lo confirmó todavía.
  confirmado    Boolean   @default(false)
  vinculadoPor  String?
  vinculadoEn   DateTime  @default(now())
  // Cobro y factura en monedas distintas: se marca, NO se cuadra.
  monedaDispar  Boolean   @default(false)

  @@unique([cobroId, facturaId])
  @@index([facturaId])
}

// N:1: varios res.partner de Odoo pueden apuntar a una CuentaFinanciera (un holding
// factura con varios nombres). Por eso el @unique va del lado del partner.
model OdooPartnerVinculo {
  id                String  @id @default(cuid())
  odooPartnerId     Int     @unique
  odooPartnerNombre String
  odooVat           String?

  cuentaId String?
  cuenta   CuentaFinanciera? @relation(fields: [cuentaId], references: [id], onDelete: SetNull)

  via            OdooVinculoVia?
  // true = "este partner de Odoo no es cliente nuestro". Odoo tiene 82 clientes y
  // Nexus 49 cuentas: la diferencia es historia, no un hueco que haya que llenar.
  ignorado       Boolean   @default(false)
  confirmadoPor  String?
  confirmadoEn   DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([cuentaId])
}

// CronJobState guarda ESTADO, no historia: una fila por job, el claim se estampa ANTES
// de correr, y no hay campo de error. Con eso no se puede decir "viene fallando hace
// tres días". Esta tabla es fila-por-corrida.
model SyncOdooCorrida {
  id           String    @id @default(cuid())
  iniciadaEn   DateTime  @default(now())
  terminadaEn  DateTime?
  ok           Boolean   @default(false)
  parcial      Boolean   @default(false)
  disparadaPor String    // "cron" | "manual:<email>"

  facturasVistas Int @default(0)
  creadas        Int @default(0)
  actualizadas   Int @default(0)
  desaparecidas  Int @default(0)
  vinculadas     Int @default(0)

  error      String? @db.Text
  duracionMs Int?

  @@index([iniciadaEn])
  @@index([ok, iniciadaEn])
}
```

### Cambios a lo que ya existe

- `CobranzaOrigenCobro` gana **`ODOO`** como quinto valor.
- `CobranzaTipoAlerta` gana **`SYNC_ODOO_FALLIDO`** y **`FACTURA_SIN_COBRO`**.
- `CuentaFinanciera` gana la relación inversa `facturasOdoo` y `vinculosOdoo`.
- `Cobro` gana la relación inversa `facturasOdoo`.

⚠ **Un valor de enum nuevo se toca en TRES lugares** y los tres se desincronizan en silencio:
`prisma/schema.prisma`, el espejo client-safe de `lib/cobranza/schema.ts:43`, y la unión
literal de `AlertaDraft.tipo` en `lib/cobranza/engine.ts:70-86`.

⚠ `CobranzaOrigenCobro` **no tiene espejo client-safe** hoy (es `string` con comentario). Vale
crear `COBRANZA_ORIGENES_COBRO` de paso y arreglar el comentario obsoleto de `queries.ts:804`.

---

## 7 · La migración

`scripts/sql/2026-09-XX-espejo-odoo.sql`, siguiendo el flujo aditivo del repo
(`ARCHITECTURE.md` Parte 0 · cap. D). Molde: `scripts/sql/2026-08-19-espejo-ventas-ganadas.sql`
y `2026-08-23-sicop-adjuntos.sql`.

Contenido, en orden:

1. Encabezado en prosa: fecha, qué hace, y la nota **«ADITIVA e inocua»** con los pasos de
   aplicación (el molde de `sicop-adjuntos.sql:23-30`).
2. Los 3 enums nuevos con el patrón idempotente `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_type ...)`.
3. Las 5 tablas con `CREATE TABLE IF NOT EXISTS`, sus índices y sus FK.
4. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en las 5 — **ningún DDL lo habilita solo**.
5. Las policies `RESTRICTIVE deny_all_non_superuser`, y agregarlas también a
   `prisma/policies.sql` (la red idempotente).
6. `ALTER TABLE "FacturaOdoo" ALTER COLUMN "updatedAt" DROP DEFAULT;` — sin esto el detector
   de drift arrastra una línea permanente.

⚠ **Los dos `ALTER TYPE ... ADD VALUE` van aparte**: no corren en transacción, así que no
pasan por `prisma db execute`. Es la excepción documentada — one-liner `npx tsx -e` llamando
`assertProdWriteAllowed()` a mano. Y hay que coordinarlo con la otra PC.

Aplicación:

```
1. git pull                               (la base la comparten 2 PCs)
2. npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
3. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-XX-espejo-odoo.sql
4. los dos ALTER TYPE por el one-liner con guard
5. npx prisma generate                    (NUNCA db push)
6. ALLOW_PROD_WRITE=1 npm run db:policies
7. reiniciar el dev server                (el cliente viejo no entra por HMR)
8. npm run check:invariants
```

---

## 8 · Invariantes

Van al final de `main()` en `scripts/check-invariants.ts`, antes del `return violations`.
Próximo libre: **INV23** (INV19 no existe).

**INV23 · ninguna factura espejada tiene su monto convertido.**
Toda `FacturaOdoo` cuya `moneda` no esté en `('CRC','USD')` es un dato que el espejo no supo
leer; y toda fila cuyo `montoTotal` no coincida con lo que Odoo reporta hoy es una escritura
que no vino del sync. Verifica que el espejo sigue siendo espejo.

**INV24 · ninguna corrida fallida quedó muda.**
Toda `SyncOdooCorrida` con `ok=false` de los últimos 7 días tiene su `AlertaCobro` de tipo
`SYNC_ODOO_FALLIDO`. Es el invariante que existe porque hoy **un job roto solo va al log del
contenedor** y nadie se entera.

**INV25 · Odoo nunca confirma plata.**
Ningún `Cobro` tiene `confirmadoPor` que empiece con `odoo:`. La promoción a verde la propone
el espejo; confirmarla sigue siendo de una persona (misma doctrina que INV3, y la misma regla
del importador de comisiones: si `confirmadoPor` lo puso una persona, Odoo no pisa).

Formato: `✗ INVnn VIOLADO: …` con la lista de ofensores indentada con `    · ` y la línea
`Remedio: <comando exacto>`; `✓ INVnn: …` cuando pasa.

---

## 9 · Tests

Convención del repo: nombre en español frase-concepto, docblock con el defecto medido que
motiva el archivo, casos como oración que afirma la conducta, datos reales de producción.

| Archivo | Qué cubre |
|---|---|
| `lib/cobranza/odoo/espejo.test.ts` | **`promoverSemaforo`**: `paid`/`in_payment` promueven a verde; `not_paid`/`partial` **no degradan** — caen al estado propio de Nexus y marcan «sin conciliar». Los 6 valores de `payment_state`, con los conteos reales (176 `in_payment`, 50 `not_paid`, 59 `paid`, 3 `partial`, 16 `reversed`). |
| ídem | **`vencimientoDe`**: usa `invoice_date + creditoDias`, **nunca** `invoice_date_due`. Caso que fija que con `creditoDias` null cae a `DEFAULT_CREDITO_DIAS`=15 — hoy 48 de 49 cuentas. |
| ídem | **`esCorridaParcial`**: umbral `< 50 %` estricto y solo si ya hay filas conocidas. Un timeout de Odoo no puede vaciar el año. |
| ídem | **Monedas dispares**: cobro en USD contra factura en CRC → `monedaDispar=true` y las dos cifras, nunca una suma. |
| `lib/cobranza/odoo/emparejado.test.ts` | Los 49 nombres reales contra los 82 partners reales: afirma **2 por cédula, 4 por nombre exacto, 8 dudosas, 33 sin candidato, 2 inemparejables**. Si el matcher se afloja y sube el número, se pone rojo y hay que declarar por qué. Casos nominales para Corrugando/ACCCSA, Analisalab/Inve y TEC-AE. |
| ídem | **8 vat duplicados** → el vínculo es N:1 y varios partners pueden apuntar a la misma cuenta. |
| `lib/cobranza/odoo/guardas.test.ts` | Guarda de texto: el espejo **no importa** `lib/finanzas/equilibrio` ni menciona `crcPorUsd` (extiende la lista `MOTORES` del test §K de `equilibrio.test.ts`). Y el sync **no escribe** `confirmadoPor`. |
| `lib/cobranza/odoo/transporte.test.ts` | Guarda de armado: `lib/cobranza/odoo/` no importa `node:https` fuera de `transporte-xmlrpc.ts` — el transporte queda detrás de la interfaz. |

⚠ **Deuda heredada del molde**: `lib/ventas/sync-ganadas.ts` no tiene un solo test porque
mezcla I/O con decisión y el project `unit` prohíbe red. Para no heredarlo, las tres
decisiones del sync nuevo (`esCorridaParcial`, `calcularDeltas`, `promoverSemaforo`) nacen como
funciones puras en `espejo.ts`, y el sync solo las orquesta.

---

## 10 · Orden de entrega

### Etapa 1 · Pantalla de emparejado — ~2 días

**Primero esto, y el sync no se enciende hasta que esté hecho.** Con 3 cédulas de 49,
encender el sync antes produce un espejo mal atribuido que cuesta más limpiar que hacerlo bien.

- Migración (§7) + `OdooPartnerVinculo`.
- Transporte XML-RPC + lectura de `res.partner`.
- Pantalla en Cobranza: buscador primero, propuestas arriba, botón «no es cliente nuestro».
- ⚠ **Al confirmar un vínculo, escribe la `cedulaJuridica` en la `CuentaFinanciera` desde el
  `vat` de Odoo**, normalizada a solo dígitos. Es lo que convierte una tarde de trabajo manual
  en un emparejado que después se sostiene solo.
- Tests de emparejado.

**Entregable visible**: Alexander puede vincular las 49 cuentas.

### Etapa 2 · El sync — ~3 días

- `SyncOdooCorrida` + el job en `lib/jobs/defs.ts`.
- Lectura incremental por `write_date`, con la guarda del 50 %.
- Bitácora `FacturaOdooCambio`.
- Alerta `SYNC_ODOO_FALLIDO` + INV24.
- Tests del espejo.

**Entregable visible**: las facturas de Odoo aparecen al lado de los cobros.

### Etapa 3 · Semáforo y listas de cruce — ~2 días

- `promoverSemaforo` cableado, con la marca «sin conciliar».
- **La primera lista es «cobro sin factura»** — es la que Alexander dijo que más le sirve.
  Después: «factura sin cobro», «monto distinto», «moneda dispar».
- Todas viven **dentro de cobranza, en una sola lista ordenada por la plata que mueve**,
  reusando `InconsistenciasPanel` tal cual (recibe `Inconsistencia[]` + `moneda` y nada más).
- INV23 e INV25.

**Entregable visible**: el dashboard de gerencia deja de arrastrar data vieja.

### Etapa 4 · Configuración — ~1 día

- `/settings/odoo`, **solo SUPER_ADMIN** (`requireInternalUser()` + `isCostosRole`, el patrón
  de `/settings/gasto-ia`).
- El resultado del sync —cuándo corrió, qué trajo, qué falló— lo ve **quien cobra**
  (`cobranza.read`), dentro de Cobranza.
- El espejo de facturas es **solo finanzas**: no aparece en CS.

**Total: ~8 días.** Fase 1 son **facturas y pagos**; egresos no.

---

## 11 · Riesgos

| Riesgo | Cómo se detecta | Mitigación |
|---|---|---|
| **Un timeout de Odoo vacía el año** | La corrida sale `parcial=true` y no reclasifica nada | Guarda del 50 %, copiada de `sync-ganadas.ts:271`. El claim del día se libera para reintentar. |
| **El sync falla y nadie se entera** | Hoy: no se detecta. Ese es el punto. | `SyncOdooCorrida` + alerta `SYNC_ODOO_FALLIDO` + INV24 |
| **Un espejo mal atribuido** (factura colgada de la cuenta equivocada) | La lista «factura sin cobro» se llena de cosas que sí tienen cobro | Emparejado ANTES del sync (etapa 1 antes que la 2) |
| **`in_payment` no significa lo que creemos** | 176 facturas saltan a verde de golpe en la primera corrida | Correr la etapa 3 en modo solo-lectura una semana antes de cablear la promoción |
| **Odoo cambia un monto ya facturado** | La bitácora `FacturaOdooCambio` lo registra con tipo `MONTO` | El cobro confirmado por una persona NO se pisa; se registra la divergencia |
| **Se suman CRC y USD sin avisar** | El test §K se pone rojo si el espejo toca `crcPorUsd` | Monto nativo siempre; `monedaDispar` marca la fila |
| **La contraseña de `direct` circula** | — | Ver pregunta 8 de §12 |
| **La otra PC aplica el SQL a medias** | `npx prisma migrate diff` muestra drift | Coordinar los `ALTER TYPE`; el repo lo comparten 2 máquinas |

---

## 12 · Lo que NO está decidido y necesita tu respuesta

Esta sección es la que más importa. No asumí nada de acá.

**1. ¿Por qué hay `in_payment` en 176 facturas?**
Odoo 17 Community nunca asigna ese estado. O esta base es Enterprise, o hay un módulo de
terceros. Cambia qué significa: en Enterprise es «pagado, falta conciliar» —que es justo lo
que necesitamos—, pero si es un módulo custom puede significar otra cosa. **Sin esto no se
puede cablear la promoción a verde.**

**2. `creditoDias` está en null en 48 de 49 cuentas.**
La regla acordada es `invoice_date + creditoDias`. Con 48 cuentas en null, todas van a usar el
default de 15 días. **Los 90 días de Colby no están configurados en Nexus tampoco** — no es
solo que falten en Odoo. ¿Se cargan los términos reales antes de encender, o se acepta que 48
cuentas venzan a 15 días?

**3. El emparejado son 43 decisiones manuales.**
¿Alexander las hace todas de una, o se arranca con las cuentas activas (46 de 49) y las 3
`PENDIENTE_DATOS` quedan para después?

**4. Odoo tiene 82 clientes y Nexus 49 cuentas.**
¿Los ~33 que facturan en Odoo y no existen en Nexus son historia que se ignora, o hay negocio
ahí que Nexus no está viendo? Cambia si «factura sin cuenta» es una lista de trabajo o ruido.

**5. Hay duplicados literales en Odoo.**
`MUNICIPALIDAD DE CARRILLO GUANACASTE` dos veces, `JUNTA DE DESARROLLO ... (copia)`,
`FUNDACION TECNOLÓGICA` con dos grafías. ¿Se limpian en Odoo, o Nexus los tolera apuntando
los dos al mismo lugar?

**6. `amount_tax = 0` en 30 de 345 facturas.**
¿Son exentos legítimos —servicios al exterior, por ejemplo— o falta cargar el impuesto? Si es
lo segundo, el espejo va a mostrar un IVA que no existe.

**7. 29 de 44 notas de crédito no tienen factura de origen.**
`reversed_entry_id` está vacío en el 66 %. ¿A qué cuenta se atribuye una nota de crédito
huérfana? Se puede por `partner_id`, pero entonces no se sabe qué cobro corrige.

**8. `direct` es un usuario con contraseña personal.**
XML-RPC acepta una **API key nativa** en lugar de la contraseña (Preferencias → Seguridad de la
cuenta). Es estrictamente mejor: se puede revocar sin cambiar la contraseña de nadie. ¿Se pide,
o se arranca con la contraseña y se migra después?

**9. ¿El sync corre solo desde el arranque?**
El job entra en `lib/jobs/defs.ts` con el lock que ya existe, pero puede nacer detrás de un
flag de entorno (patrón `COBRANZA_CRON_ENABLED`) y encenderse a mano cuando el emparejado esté
completo. Recomiendo eso; confirmame.

---

## Verificación

```powershell
npx tsx scripts/odoo-diagnostico.ts                 # la sonda, ya funciona
npm run check:invariants                            # INV23, INV24, INV25
npx vitest run lib/cobranza/odoo --project unit     # los tests del espejo
npx tsc --noEmit; npm run build
npx tsx scripts/run-scheduler-tick.ts --at 2026-09-03T13:00:00Z   # dry-run del job
```

End-to-end, en el navegador: vincular una cuenta en la pantalla de emparejado, correr el sync
a mano, y ver la factura aparecer en el cronograma de ese cliente con su número de Odoo.
