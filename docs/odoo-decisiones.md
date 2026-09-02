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

---

## 2026-09-02 · La factura al lado del cobro se aparea AL VUELO, no por vínculo confirmado

**Qué se decidió.** El cronograma calcula qué factura corresponde a cada cobro con `cruzar()`
—el mismo módulo que arma la lista de diferencias— en vez de leer `CobroFacturaOdoo`.

**Por qué.** Dos razones, y la primera es la que importa:

1. **Que las dos pantallas no puedan contradecirse.** Si el cronograma tuviera su propia regla
   de apareo, una diría «este cobro ya está facturado» y la otra lo listaría como «cobro sin
   factura». Ninguna de las dos sería creíble, y no habría forma de saber cuál mirar.
2. Funciona desde el minuto en que alguien empareja un cliente, sin un segundo paso de
   confirmación por cada uno de los 347 documentos.

⚠ La tabla `CobroFacturaOdoo` queda creada y sin usar. Sirve para el día que haga falta fijar
un vínculo a mano contra lo que el apareo automático decide — pero no se llenó «por si acaso»:
una tabla con datos que nadie escribe ni lee es peor que una vacía.

⛔ Nada de esto escribe: el cobro conserva su estado y su `confirmadoPor` (INV25).

**Qué la revertiría.** Que aparezca un caso donde el apareo automático se equivoque y alguien
tenga que corregirlo a mano. Ahí `CobroFacturaOdoo` pasa a ser la excepción que pisa al cálculo.

---

## 2026-09-02 · `/settings/odoo` es solo lectura

**Qué se decidió.** La pantalla muestra el estado de la conexión y las últimas 20 corridas, y
no tiene ningún interruptor.

**Por qué.** Las dos banderas (`ODOO_SYNC_ENABLED`, `ODOO_PROMOCION_VERDE`) viven en el `.env`
del servidor. Un interruptor en pantalla daría a entender que se apaga desde ahí, y después de
un redeploy volvería al valor del entorno **sin que nadie entienda por qué**. Un control que
miente es peor que no tener control.

⚠ Y el texto del fallo va en su propio bloque, NO como tooltip de la celda roja: el punto de
guardar cada corrida es poder decir «viene fallando hace tres días», y eso no se lee pasando el
mouse por encima de siete filas. Lo señaló el trinquete de errores rojos ad-hoc, que tenía
razón — un error persistente va en `<Alert variant="danger">`.

**Qué la revertiría.** Mover las banderas a la base. Ahí el interruptor sería honesto.

---

## 2026-09-02 · ⚠⚠ INCIDENTE: Odoo dejó de aceptar el usuario, y qué se aprendió

**Qué pasó.** El sync corrió bien a las 07:17 UTC (347 facturas). Media hora después,
`authenticate` empezó a devolver `false` con la misma contraseña. `.env` no se había tocado
desde el día anterior; `version()` seguía respondiendo HTTP 200.

**⭐ Lo que la medición descartó.** Una sonda cronometrada midió **8 ms de sobrecosto sobre la
red** en el rechazo, contra una línea base de 103 ms. Odoo **ni evaluó la contraseña**: un
chequeo real corre PBKDF2, que cuesta cientos de milisegundos. Fue un rechazo de cortocircuito.

Eso **descarta que la contraseña esté mal**. Odoo busca el usuario y recién ahí compara el
hash; si comparara y fallara, tardaría. Un rechazo instantáneo deja dos causas: el usuario ya
no existe o está archivado, o el ERP está aplicando su bloqueo por intentos. Ninguna de las dos
se arregla desde el código.

**⛔ Y lo que la medición NO confirmó.** Se sospechó que el volumen de logins de esta
integración lo había provocado. **La evidencia no lo sostiene**: `SyncOdooCorrida` tiene solo
2 filas, las dos manuales y las dos exitosas — el cron nunca llegó a correr. El total de
autenticaciones fue del orden de quince, casi todas exitosas, y los logins exitosos no cuentan
para el contador de fallos. La causa quedó del lado del ERP.

**Pero la auditoría encontró tres bombas de tiempo reales**, y las tres están arregladas:

1. **El cron reintentaba ante CUALQUIER fallo.** `shouldRun` es `hour >= 6` y el scheduler
   tickea cada 60 s: con la autenticación rechazada eso son **~1080 reintentos por día**, uno
   por minuto — y el período del tick es igual al del bloqueo de Odoo, así que el bloqueo se
   sostiene solo mientras el bucle corra. Era el único job del scheduler que liberaba el claim
   sin mirar la causa. Ahora solo lo libera si el fallo es de RED o la corrida fue parcial.
2. **`uid ??= await autenticar()` no serializa.** Cachea el resultado, no la promesa, así que
   dos llamadas concurrentes autentican las dos. La pantalla hacía dos lecturas en paralelo:
   una apertura costaba 2 logins, y 4 con el doble render de React en desarrollo.
3. **No había freno tras un fallo.** El error se mostraba, el botón quedaba habilitado, y la
   reacción natural —recargar— sumaba más intentos.

⭐ **Y el arreglo de fondo hizo desaparecer el problema entero**: la pantalla **ya no llama al
ERP**. Los montos salen de `FacturaOdoo` y los clientes del catálogo guardado — las dos cosas
están en la base desde que existe el sync. Abrir `/cobranza/odoo` ahora cuesta **cero
autenticaciones**. Solo el botón «Actualizar lista desde Odoo» y el cron diario tocan el ERP.

**Qué lo revertiría.** Nada de esto. La única parte discutible es la sesión compartida a nivel
de módulo, que contradice una decisión anterior de este mismo archivo («cachear por instancia,
no en el módulo»). Ese razonamiento estaba incompleto: pesaba el riesgo de arrastrar un uid
viejo —que se detecta solo, porque la operación siguiente falla— y no pesaba que el costo de
re-autenticar no es tiempo sino **cuota contra un ERP que castiga el volumen de logins**.

---

## 2026-09-02 · La guarda del 50 % protegía de la catástrofe y dejaba pasar el desastre

**Qué se decidió.** Se agregó `esBorradoMasivo()`: si de golpe desaparecen más de 5 facturas
—o más del 5 % del espejo— **no se marca ninguna** como DESAPARECIDA y la corrida lo reporta.

**Por qué.** `esCorridaParcial` corta en el 50 %, pero una corrida que trae el **60 %** pasa ese
filtro y después marca el 40 % restante como desaparecido: **cientos de facturas borradas del
espejo por un fallo que no fue un borrado**. El umbral protegía del caso extremo y dejaba
abierto el rango 50-99 %, que es el más probable.

⚠ La asimetría es deliberada: perder la marca de una factura realmente borrada es recuperable
—vuelve en la corrida siguiente—; marcar 200 vivas como desaparecidas vacía el cronograma de
medio año y nadie sabe por qué.

**Qué la revertiría.** Que aparezca una purga legítima y masiva en Odoo. Ahí hay que subir el
umbral a mano y dejar dicho por qué, no sacar la guarda.

---

## 2026-09-02 · La pantalla se parte en tres pestañas, y una solo explica

**Qué se decidió.** `/cobranza/odoo` tiene **Cómo funciona · Emparejar · Lo que no cuadra**, y
abre en la pestaña donde está el trabajo.

**Por qué la que explica.** Esta pantalla la abre alguien que no la construyó, cada varias
semanas, para una tarea puntual. Sin una página que diga qué hace la integración —y sobre todo
**qué NO hace**— cada visita empieza reconstruyendo el modelo mental desde cero. Las dos
preguntas que aparecen siempre son «¿esto le escribe a Odoo?» y «¿esto mueve mis cobros?»; las
dos respuestas son que no, y ahora están escritas grandes y en negativo.

**Qué la revertiría.** Que la integración deje de ser algo que se toca cada tanto.

---

## 2026-09-03 · ⛔ Se abandona `InconsistenciasPanel`, y el motivo importa

**Qué se decidió.** La lista de diferencias tiene su propio componente. La decisión anterior
—«reusar `InconsistenciasPanel` tal cual»— queda revertida.

**Por qué.** No sobrevivió al contacto con el uso. Ese panel **no admite acciones por línea**,
así que «marcar como está bien así» terminó siendo un formulario suelto al pie con **un
desplegable de códigos crudos** (`ODOO-SIN-CUENTA`, `ODOO-MONEDA`) desconectado de las líneas
sobre las que actuaba. Nadie que abriera la pantalla podía saber qué era ni para qué servía.

⭐ **Reusar un componente no vale un control que la gente no entiende.** Ahora la acción vive en
la línea, con su nombre, y con **lo que significa aceptarla escrito al lado del botón** — antes
de apretarlo, no después.

**Qué la revertiría.** Que `InconsistenciasPanel` aprenda acciones por línea. Ahí conviene
volver, porque la lista del reporte de equilibrio va a necesitar lo mismo.

---

## 2026-09-03 · Cada diferencia trae DÓNDE y CÓMO se arregla

**Qué se decidió.** `DiferenciaOdoo` extiende el contrato con `donde` (Odoo · Nexus ·
preguntando) y `pasos[]`.

**Por qué.** El contrato original trae `queHacer`, que es **una oración**. Alcanza para un
titular y no para ejecutar: quien abre la pantalla necesita saber en qué sistema entrar, qué
buscar y qué hacer con lo que encuentre. **Una lista de diferencias sin salida se lee, se
asiente, y no se cierra nunca.**

Y la primera pregunta de todas es en qué sistema se toca. Sin responderla, cada línea obliga a
abrir los dos para averiguarlo.

**Qué la revertiría.** Nada. Si algo, faltan enlaces directos al documento en Odoo.

---

## 2026-09-03 · ⚠ Una línea aceptada NO desaparece: se marca

**Qué se decidió.** `detectarDiferenciasOdoo` devuelve también las aceptadas, con
`aceptada: true`, y la pantalla las deja plegadas al final.

**Por qué.** Al principio se filtraban en el detector. Eso hacía que **«volver a abrir» fuera
inalcanzable**: la línea quedaba cerrada para siempre por un clic, sin superficie donde
deshacerlo. El bug estaba en mi propio diseño y lo encontré recorriendo la pantalla, no
leyendo el código.

⚠ Los totales y el badge sí las excluyen: están cerradas, no son trabajo pendiente. Lo que no
se puede es esconderlas.

**Qué la revertiría.** Nada.

---

## 2026-09-03 · Auditoría de buenas prácticas: 63 hallazgos, 11 defectos distintos

87 agentes sobre nueve dimensiones —idempotencia, integridad, fallos parciales,
observabilidad, seguridad, contrato con el ERP, tiempo/moneda, acoplamiento, pruebas— con
verificación adversarial. 63 confirmados, 15 refutados. Deduplicados, **once defectos**.

### ⚠⚠ El que encontraron SIETE auditorías por separado

Una factura que Odoo **sí devuelve** pero que `mapearFactura` rechaza —le falta la fecha, el
partner o la moneda— salía de `vistas`, y `vistosIds` se armaba de ahí. El sync concluía que
había desaparecido del ERP: la marcaba DESAPARECIDA, con lo que **sale del cronograma del
cliente y de la mesa del CFO**, y la bitácora afirmaba que Odoo la borró — que es falso.

Ahora `vistosIds` sale de las CRUDAS. Que no la sepamos leer es un problema nuestro, y se
cuenta aparte en `rechazadas`, que antes solo iba al log del contenedor.

### ⚠⚠ El espejo se congelaba con un neto viejo, para siempre

`calcularDeltas` comparaba total, residual, estados, fecha y cuenta — pero **no `montoNeto` ni
`moneda`**. Y como el UPDATE solo corre cuando hay algún delta, una corrección de esos campos
en Odoo **nunca llegaba**.

`montoNeto` es justamente el campo que se cruza contra `Cobro.monto`. O sea que **el descuadre
que el espejo existe para detectar era el que no podía ver.** Y `moneda` es el error que más
plata distorsiona: hay 6 facturas emitidas en la moneda equivocada, una de 11.541.250.

### ⭐ Y exigir la moneda en el emparejado sacó el último falso positivo

`candidatosPorMonto` ignoraba la moneda, saltándose la misma regla que `cruzar()` ya aplicaba
—«USD 2.000 y CRC 2.000 no son el mismo hecho, son 500 veces distintos»—. El noveno candidato,
`Apptividad → Border Freight` (mexicana), coincidía por un monto en otra moneda.

La señal pasó de **9 propuestas con 8 aciertos a 8 propuestas con 8 aciertos**. Una menos y
cero errores — el cambio que uno quiere, y que la pantalla no habría delatado nunca porque un
falso positivo se ve idéntico a un acierto hasta que alguien lo confirma.

### Los demás

- **El `faultCode` se leía como uid.** Una respuesta de error de XML-RPC trae
  `faultCode → <int>3</int>`, y el regex matcheaba cualquier `<int>`: un error se leía como un
  login exitoso con uid=3, **y reseteaba el freno**. Ahora el fault se mira primero.
- **El freno tiraba un `Error` pelado**, que aguas arriba se clasificaba como PROTOCOLO. El
  cron entonces retenía su turno: **un bloqueo de un minuto costaba la corrida del día**.
- **La corrida parcial reintentaba cada 60 s.** Arreglé el caso de autenticación y dejé este
  abierto: 1080 corridas por día llenando la tabla y enterrando la última corrida buena.
- **La fila y su bitácora se escribían por separado.** Un corte entre las dos dejaba la fila
  actualizada sin rastro, y la corrida siguiente ya no encontraba deltas: el cambio se perdía
  **para siempre**, y re-correr el sync no lo reparaba. Ahora es una escritura anidada.
- **La resurrección no dejaba rastro**, al revés de lo que prometía su propio comentario: con
  `deltas` vacío el bucle no iteraba.
- **`vinculadas` mezclaba dos universos** (crudas menos mapeadas) y se inflaba con cada
  rechazo. Ese número va a pantalla.
- **La pasada de monto exacto no tenía ventana de fechas**: un cobro recurrente se apareaba con
  la factura de hace tres años y el de este mes quedaba «sin factura».
- **El apareo dependía del orden en que Postgres devolvía las filas.** Sin `ORDER BY` eso no
  está garantizado: la lista del CFO podía cambiar entre corridas sin que nadie tocara nada.
- **Las 6 tablas del espejo no estaban en `policies.sql`.** El bucle les habilita RLS, pero la
  policy explícita vivía solo en el `.sql` de la migración — que se corre una vez, mientras que
  esa red se corre siempre. Reconstruir el proyecto desde cero las habría dejado afuera.

**Qué revertiría todo esto.** Nada. Son defectos, no decisiones.
