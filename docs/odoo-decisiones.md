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
