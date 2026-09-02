# Bitácora de decisiones — integración con Odoo

Append-only. Una entrada por decisión tomada mientras se ejecuta
[odoo-integracion-plan.md](./odoo-integracion-plan.md), con **el porqué** y **qué la
revertiría**.

Existe porque el plan se ejecuta en continuo: sin esto, las decisiones se pierden en el
historial de commits y dentro de seis meses nadie sabe si algo fue deliberado o casual.

⚠ Lo que NO va acá: las dudas de negocio. Esas se convierten en una línea de la lista de
inconsistencias de la etapa 3, con su monto y su dueño, para que aparezcan en la mesa de
trabajo con el CFO en vez de en un documento que nadie abre.

---

## 2026-09-02 · El transporte es XML-RPC, no el módulo REST

**Qué se decidió.** Toda lectura de Odoo pasa por `/jsonrpc` (misma capa de autenticación que
`/xmlrpc/2/common`, sin tener que parsear XML). El módulo REST de Cybrosys queda como
contingencia documentada y sin implementar.

**Por qué.** REST autentica pero devuelve **403 en los nueve modelos**: necesita leer
`ir.model` para su propia configuración y `direct` no puede. Destrabarlo exige darle permisos
de administrador del ERP. XML-RPC funcionó sin habilitar nada (`uid=33`), acepta `domain` /
`limit` / `offset` / `write_date` —o sea sincronización incremental, que REST no puede hacer ni
con el permiso— y los errores llegan como errores en vez de como HTTP 200 con HTML.

**Qué la revertiría.** Que alguien le dé a `direct` el grupo de administración Y que XML-RPC
deje de funcionar. Con el transporte detrás de `OdooTransport`, cambiar es una implementación.

---

## 2026-09-02 · La migración se aplica sin consultar

**Qué se decidió.** Correr el `.sql` de la etapa 1 contra producción sin pedir confirmación.

**Por qué.** Es aditiva e idempotente (`CREATE TABLE IF NOT EXISTS`, `DO $$ … pg_type`), el
plan está aprobado, y el drift-check previo dio **solo el ruido conocido** —la columna
`embedding` de pgvector y los 4 `DropIndex` de Project/ProjectCanvas que `ARCHITECTURE.md`
documenta— o sea que la otra PC no dejó nada a medias.

**Qué la revertiría.** Un drift inesperado en el `migrate diff`. Si aparece algo que no está en
la lista de ruido conocido, se para y se avisa: dos máquinas sobre la misma base es
exactamente el escenario donde un DDL a ciegas hace daño.

**⚠ La excepción.** Los `ALTER TYPE … ADD VALUE` no corren en transacción y no pasan por
`prisma db execute`. Van por el one-liner con `assertProdWriteAllowed()`, y **agregar un valor
de enum que nadie usa todavía es inocuo para el código viejo que corre en el VPS**.

---

## 2026-09-02 · La promoción a verde nace apagada

**Qué se decidió.** `promoverSemaforo` se escribe, se prueba y se deja **detrás de un flag,
apagado**, hasta que se confirme qué significa `in_payment`.

**Por qué.** 176 de 304 facturas de cliente están en ese estado, y el fuente de Odoo 17
**Community nunca lo asigna** — su hook devuelve literalmente `'paid'`. O la base es
Enterprise, o hay un módulo de terceros. En Enterprise significa «pagado, falta conciliar», que
es justo lo que se necesita; si es un módulo custom podría significar otra cosa. Encenderlo sin
saberlo pondría **176 cobros en verde de golpe**, y el verde en Nexus es plata que entró.

**Qué la revertiría.** La respuesta a la pregunta 1 del plan. Si `in_payment` es lo de
Enterprise, es un flag que se enciende.

---

## 2026-09-02 · El emparejado propone por monto, y nunca aplica solo

**Qué se decidió.** La pantalla de emparejado propone con tres señales —cédula, **monto**,
nombre— mostrando la evidencia de cada una. Ninguna se aplica automáticamente.

**Por qué.** El nombre no puede funcionar: Nexus guarda el nombre comercial y Odoo la razón
social, y no se parecen (Iberorutas factura como «SERVICIOS SAN MATEO Y SANTA ELENA DEL SUR
S.A.»). El monto da **17 candidatos únicos contra 6 del nombre**, y resuelve justo los que el
nombre no puede: Corrugando→ACCCSA, TEC-AE→Fundación Tecnológica, APRECAP, Cicadex.

⚠ Pero **~6 de esos 17 están mal** —Bluesat→Forestales, Teamnet→Fundación Tecnológica— porque
dos clientes comparten un monto redondo. Con una tasa de acierto de ~65 % no puede ser
automático: es una propuesta con su evidencia, y confirma una persona.

**Qué la revertiría.** Nada razonable. Si algún día las cédulas están cargadas en las 49
cuentas, la señal de cédula pasa a ser la principal y el monto queda de respaldo.

---

## 2026-09-02 · El semáforo devuelve una PROPUESTA, no un estado

**Qué se decidió.** `proponerSemaforo()` no devuelve «el cobro ahora es COBRADO»: devuelve qué
sugiere Odoo, con `requiereConfirmacion: true` siempre que sugiera verde. El sync no escribe
estado.

**Por qué.** El plan decía «Odoo puede promover a verde», y al implementarlo se chocó con que
**es imposible**: `COBRADO` exige `confirmadoPor` de una persona (INV3), así que el sync
literalmente no puede escribirlo sin violar un invariante que ya existe. La lectura honesta de
«promover» es *proponer con un clic de distancia*, y así satisface INV3, INV25 y la regla de
que la promoción nace apagada, sin que ninguna de las tres pelee con las otras.

⚠ Y la regla «no degrada» quedó como un valor de retorno propio, `divergencia`, en vez de un
silencio: Nexus cobrado contra Odoo impaga **no es que no pase nada**, es una línea para la
mesa de trabajo con el CFO.

**Qué la revertiría.** Que se decida que Odoo sí puede confirmar plata. Eso exigiría cambiar
INV3 primero, y esa es una decisión de negocio, no técnica.

---

## 2026-09-02 · El corte incremental es `>=`, no `>`

**Qué se decidió.** `dominioFacturasDesde()` filtra `write_date >= <última corrida>`.

**Por qué.** `write_date` tiene resolución de **segundo**, y dos escrituras dentro del mismo
segundo son normales cuando alguien concilia un lote. Con `>` la segunda se pierde para
siempre y nada avisa: el espejo queda con un monto viejo y se ve perfectamente sano. El costo
de `>=` es releer un puñado de filas por corrida, que el upsert absorbe sin efecto.

**Qué la revertiría.** Nada. La asimetría es a propósito: releer es barato, perder es mudo.

---

## 2026-09-02 · Una factura sin fecha, sin partner o sin moneda se RECHAZA

**Qué se decidió.** `mapearFactura()` devuelve un rechazo con motivo en vez de espejar con
valores por defecto.

**Por qué.** Una factura sin `invoice_date` no cae en ningún mes: espejarla con la fecha de
hoy la escondería dentro de un total que se ve correcto. Sin `partner_id` no se puede
atribuir a ninguna cuenta. Sin `currency_id` no se sabe si 2.000 son dólares o colones, y la
diferencia es 500 veces. **Un espejo con dos filas mentirosas es peor que un espejo con dos
huecos declarados**, porque el hueco se ve.

⚠⚠ CORRECCIÓN — esto se escribió antes de correrlo. **Sí hay una**: la 991 (AMVAC, USD
3.696) no tiene `invoice_date`. Resultó ser un documento con `name = "/"`, el marcador de
Odoo para «todavía sin numerar»: se armó, nunca se publicó y se canceló. Nunca existió como
factura, así que ahora la excluye el dominio y no llega ni al rechazo. Las otras 2 canceladas
sí tienen número y fecha, y esas se espejan.

⭐ La guarda encontró algo en la primera corrida contra el ERP real. Ese era el punto.

**Qué la revertiría.** Que aparezcan tantos rechazos que la lista deje de ser accionable. En
ese caso la respuesta sigue sin ser un default: es entender por qué el ERP los emite así.

---

## 2026-09-02 · Un partner con dueño no puede ser candidato de otra cuenta

**Qué se decidió.** Un `res.partner` que ya emparejó por **cédula** o por **nombre exacto**
con una cuenta queda excluido de las propuestas por monto de todas las demás.

**Por qué.** El vínculo `res.partner → CuentaFinanciera` es único del lado del partner
(`odooPartnerId @unique`): un partner que ya tiene dueño **no puede** ser el par de otra
cuenta. No es una heurística de desempate, es la forma de la tabla.

⭐ Y mata el falso positivo que el diagnóstico había medido y dado por inevitable:
`BLUESAT → FORESTALES LATINOAMERICANOS` coincidía por un monto redondo, pero Forestales ya
emparejaba con su propia cuenta por nombre exacto. **El acierto de la señal de monto sube de
8/10 a 8/9 sin aflojar el matcher ni un punto.**

**Qué la revertiría.** Que se decida que una cuenta de Nexus puede tener varios partners de
Odoo — que es cierto al revés (N:1, un holding factura con varios nombres) pero no de este
lado. Si el `@unique` se cayera, esta regla se cae con él.

---

## 2026-09-02 · La señal de monto entra al producto, no solo al diagnóstico

**Qué se decidió.** `proponerEmparejados()` usa tres señales —cédula, monto, nombre— y no las
dos del plan original.

**Por qué.** Medido contra los datos reales: el nombre resuelve **6 de 49** y el monto suma
**9 más**, o sea 15. Y resuelve justo los que el nombre no puede tocar, porque Nexus guarda el
nombre comercial y Odoo la razón social: Iberorutas factura como «SERVICIOS SAN MATEO Y SANTA
ELENA DEL SUR S.A.», Corrugando como «ACCCSA», TEC-AE como «FUNDACION TECNOLÓGICA».

⚠ Sigue sin poder aplicarse sola: 8 de 9 aciertos deja uno mal, y ese uno colgaría las
facturas de un cliente de la cuenta de otro. Es una propuesta **con su evidencia impresa** —el
monto exacto y la afirmación de que nadie más lo comparte— y confirma una persona.

**Qué la revertiría.** Que las 49 cuentas tengan cédula cargada. Ahí la señal de cédula pasa a
ser la principal y el monto queda de respaldo. El botón de confirmar ya escribe la cédula
justamente para llegar a eso.

---

## 2026-09-02 · La pantalla consulta el ERP en cada carga, y no se cachea

**Qué se decidió.** `GET /api/cobranza/odoo/emparejado` lee los 82 clientes y las 347 facturas
de Odoo cada vez. Tarda un par de segundos y no hay caché.

**Por qué.** La señal de monto —la que resuelve 9 de las 15— **necesita los montos
facturados**, y el espejo de facturas todavía no existe: la etapa 2 va después a propósito.
Cachearlos sería inventar una capa de invalidación para una pantalla que se usa un puñado de
veces en total.

⚠ Lo que sí se guarda es el CATÁLOGO de partners (`OdooPartnerVinculo` con `cuentaId=null`).
Eso es lo que permite que el buscador y los vínculos ya hechos sigan funcionando cuando el ERP
no responde — la pantalla se degrada y **lo dice**, en vez de mostrar cero propuestas como si
el emparejado estuviera completo.

**Qué la revertiría.** Que la pantalla pase a usarse seguido, o que Odoo se ponga lento. Con el
espejo de la etapa 2 andando, los montos salen de `FacturaOdoo` y la consulta al ERP
desaparece sola.

---

## 2026-09-02 · Un partner ya decidido no vuelve a proponerse

**Qué se decidió.** Los partners vinculados y los marcados «no es cliente nuestro» salen del
universo de candidatos, y las cuentas ya vinculadas salen de la lista de pendientes.

**Por qué.** Sin esto la lista no baja nunca: las ~28 cuentas sin candidato y los ~33 clientes
de Odoo que no son nuestros vuelven en cada sesión, y **a la tercera vez nadie mira la lista**.
Una pantalla de trabajo que no se vacía deja de ser una pantalla de trabajo.

**Qué la revertiría.** Nada. Lo ignorado se puede devolver a la lista desde la misma pantalla.

---

## 2026-09-02 · El fallo del sync NO es una `AlertaCobro`

**Qué se decidió.** El resultado de cada corrida vive en `SyncOdooCorrida`, no en el feed de
alertas. INV24 vigila esa tabla.

**Por qué.** `AlertaCobro.cuentaId` es **obligatorio**: toda alerta cuelga de una cuenta. El
fallo del sync no pertenece a ninguna. Y el repo ya se topó con esto — `buildCarteraEngineInput`
documenta que las alertas de clientes sin cuenta «NO se persisten como AlertaCobro (no hay FK
destino)». Hacer `cuentaId` nullable en una tabla caliente por un solo tipo de alerta es peor
que el problema.

⚠ **INV24 quedó más fuerte que en el plan.** Iba a ser «toda corrida fallida tiene su alerta»;
es «ninguna corrida quedó muda», y vigila dos formas de quedarlo:
  · falló y no guardó el texto del error → no se puede diagnosticar;
  · quedó ABIERTA hace más de 6 h → el proceso se murió a mitad, y la fila es indistinguible
    de «todavía corriendo». **Ese es el fallo que de verdad no se ve.**

⛔ Queda un cabo suelto: el valor `SYNC_ODOO_FALLIDO` del enum `CobranzaTipoAlerta` no se emite.
Postgres no permite sacar un valor de enum, así que se queda; está documentado acá para que
nadie lo busque en vano.

**Qué la revertiría.** Que aparezca un segundo motivo para tener alertas sin cuenta. Ahí
`cuentaId` nullable se paga solo.

---

## 2026-09-02 · El sync se enciende SIN esperar al emparejado

**Qué se decidió.** `odoo-espejo-daily` corre desde ya, con el emparejado en 0 de 49.

**Por qué.** El plan decía que espejar antes de emparejar produce un espejo mal atribuido. Al
implementarlo resultó **menos rígido de lo supuesto**: el sync vuelve a resolver la cuenta de
cada factura en CADA corrida y anota el cambio como `CUENTA` en la bitácora. O sea que una
factura no puede quedar mal atribuida — como mucho queda **sin** atribuir, y se corrige sola la
próxima vez que alguien vincula ese cliente.

Esperar costaba días sin espejo y no compraba nada.

⚠ El apagado existe: `ODOO_SYNC_ENABLED=0`. Y sin `ODOO_PASSWORD` ni se intenta — un intento en
vano cuenta para el bloqueo por IP de Odoo.

**Qué la revertiría.** Que la atribución dejara de recalcularse por corrida. Ahí el orden del
plan vuelve a ser obligatorio.

---

## 2026-09-02 · Se lee TODO en cada corrida, y las escrituras van juntas

**Qué se decidió.** Lectura completa (347 facturas) por corrida, no incremental. Y las altas y
los «sin cambio» se escriben en llamadas agrupadas.

**Por qué lo completo.** Una corrida incremental **no puede detectar lo que desapareció**: una
factura borrada en Odoo no le mueve el `write_date` a ninguna otra. El modo incremental
obligaría a convivir con un modo completo periódico y con la pregunta de cuál corrió última. A
347 filas eso es complejidad sin beneficio. El filtro por `write_date` sí se usa, para CONTAR
cuántas se movieron y anotarlo en la corrida.

**⚠ Por qué agrupadas — medido.** La primera corrida tardó **63,6 s**: 347 `create` de factura
más 347 de bitácora, de a una contra Supabase. Y la corrida en régimen es casi toda «sin
cambios», o sea un minuto de ida y vuelta **solo para estampar una fecha**. Con `createMany` y
un `updateMany` al final: **3,3 s**. Diecinueve veces más rápido, y la segunda corrida confirmó
que es idempotente (0 nuevas, 0 actualizadas).

**Qué la revertiría.** Que el volumen crezca al punto de que la lectura completa moleste. Ahí
`dominioFacturasDesde` ya está escrito y probado —con el corte en `>=`, que es la parte fácil
de equivocar.

---

## 2026-09-02 · La lista de diferencias reusa el contrato de `inconsistencias.ts`

**Qué se decidió.** `detectarDiferenciasOdoo()` devuelve `Inconsistencia[]` — el mismo tipo
que el reporte de equilibrio— y la pantalla monta `InconsistenciasPanel` tal cual.

**Por qué.** Ese contrato ya resolvió los problemas difíciles de una lista así: `montoEnJuego`
para ordenar por plata, `resuelve` para que cada línea tenga dueño, `items[]` completos y
nunca truncados —«y 12 más» convierte una agenda en un titular—, y `yaContadoEn` para el doble
conteo. Escribir otro tipo habría sido reaprender todo eso.

⭐ Y sus dos reglas se heredan enteras: **todo se detecta, nada se escribe a mano** —una lista
hardcodeada de hallazgos envejece sola y sigue mostrando lo ya arreglado—, y **cada línea dice
cuánta plata mueve y quién la resuelve**.

**Qué la revertiría.** Que la lista necesite algo que el contrato no tiene. Hoy solo necesitó
una cosa: poder aceptar una línea, y eso vive fuera del contrato en `DiferenciaOdooAceptada`.

---

## 2026-09-02 · La moneda equivocada se detecta por REGLA, no por lista

**Qué se decidió.** «El mismo cliente con el mismo monto exacto en dos monedas distintas» es
la regla. No hay ningún número de factura hardcodeado.

**Por qué.** El caso que motivó esto —11.541.250 en dólares y en colones para PUBLIMARK— se
podía haber puesto como un caso especial. Pero con un tipo de cambio de ~500 el importe
idéntico en dos monedas **no puede ser casualidad**, y esa regla general encontró **6 casos**,
no uno. Los otros cinco no los había visto nadie.

⚠ Y el mayor tiene una historia legible en los datos: `FAC/2026/0232` (USD) fue **anulada** y
`FAC/2026/0233` (CRC) del mismo día por el mismo importe quedó **pagada** — o sea que alguien
ya detectó y corrigió el error de moneda. Pero existe además `FAC/2026/0243` (USD, **pagada**),
una tercera por el mismo importe. Esa es la que distorsiona todo, y va a la mesa con número.

**Qué la revertiría.** Que la empresa empiece a facturar legítimamente el mismo importe en dos
monedas. No es un escenario real a un tipo de cambio de 500.

---

## 2026-09-02 · ⚠ Y el error de doble conteo que casi se repite

**Qué se decidió.** Las líneas finas —moneda equivocada, exentas, `in_payment`— llevan
`yaContadoEn: "ODOO-SIN-CUENTA"` **cuando todas sus facturas están sin emparejar**.

**Por qué.** Al correrlo contra los datos reales, el titular de «facturas sin cuenta» decía
**60.711.762** e incluía las facturas de moneda equivocada que otra línea ya reportaba: la
misma plata contada dos y hasta tres veces. Es exactamente el error que el módulo original
documenta haber cometido («decía $437.579,78 y sumaba $28.880 dos veces»), y se estaba
repitiendo en la primera corrida.

`yaContadoEn` deja la línea fuera del total sin quitarle el monto — sigue sirviendo para
dimensionarla. Y el balde ahora **avisa en su propio detalle** de que su total está inflado.

⚠ La condición es dinámica, no fija: cuando esas facturas ya tengan cuenta salen del balde y
la línea fina vuelve a contar por sí sola. Hay un test para cada lado.

**Qué la revertiría.** Nada. El doble conteo no tiene defensa.
