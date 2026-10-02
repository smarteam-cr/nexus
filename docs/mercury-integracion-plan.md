# Integración con Mercury — plan

Pedido de Elías (2026-10-02): lo internacional se factura en Mercury desde noviembre de 2025 y Nexus no lo veía. El
objetivo es el mismo que con Odoo: **ordenar las finanzas**. Que cada factura de Mercury esté al lado de su cobro en
Nexus, que la plata que entró se vea el día que entró, y que **todo lo que no cuadra aparezca en una lista, con su
salida, y vuelva a aparecer en cada copia mientras no se arregle**.

El molde es la integración con Odoo (`docs/odoo-integracion-plan.md`, `lib/cobranza/odoo/`). Las decisiones, con su
porqué, en `docs/mercury-decisiones.md`.

## Lo medido antes de empezar (2026-10-02, solo lectura)

- 76 facturas (INV-1 a INV-72), de noviembre de 2025 a hoy; 30 clientes; 3 cuentas (dos corrientes y una de ahorro).
- 2026: US$187.232 facturados, US$142.953 pagados, US$44.279 por cobrar.
- De los 106 cobros de las 24 cuentas que facturan por Mercury, solo 20 tienen número de factura; los 20 existen.
- 44 facturas de 2026 que ningún cobro nombra. Solo 7 de 30 clientes se parecen al nombre de su cuenta en Nexus.
- La factura no dice cuándo se pagó: el día sale de los movimientos (22 de 43 pagadas tienen una entrada por el mismo
  monto; el resto llega con comisiones descontadas o en un solo pago).

## Etapas

| | Etapa | Qué deja | Estado |
|---|---|---|---|
| 1 | **La copia** | Facturas, clientes y movimientos de Mercury en Nexus cada mañana (`mercury-espejo-daily`), a mano con `scripts/mercury-sync-manual.ts`. Token de solo lectura. Corridas registradas, candado, nunca se borra nada. | ✅ `901f1fa7` |
| 2 | **Emparejar** | Cada cliente de Mercury con su cuenta de Nexus (propuestas por número, nombre y monto; el resto a mano), o «no es cliente nuestro». Al emparejar, el cliente queda como sociedad de la cuenta para los cobros. | ✅ |
| 3 | **Lo que no cuadra** | Todas las diferencias entre Mercury y Nexus en una lista, cada una con dónde se arregla y los pasos. «Está bien así» por fila con motivo; vuelve sola si cambia un número. Botón «Actualizar desde Mercury». Página Cobranza › Mercury. | ✅ |
| 4 | **Finanzas** | El punto de equilibrio y «Facturación por cliente» cuentan lo facturado en Mercury que Nexus no tiene. Invariantes de la copia. | ⬜ |

**Medido con Mercury en vivo y los cobros de producción (2026-10-02, solo lectura)**, emparejando cada cliente con su
propuesta por número o nombre: 59 filas en 7 líneas. Las de más plata: 4 clientes sin cuenta con US$16.865 por cobrar,
Multiquímica INV-38 (US$3.400 cobrada en Nexus y sin pagar en Mercury), 14 cobros a los que les falta el número (con su
factura propuesta) y 13 cobros facturados sin factura en Mercury por ese monto (Club de Amantes, AMC, Spectrum, el doble
de Real Shipping).

## Lo que no cuadra (etapa 3)

Cada línea dice dónde se arregla (Mercury, Nexus o preguntando), cuánta plata mueve y qué hacer:

- Facturas de Mercury de clientes sin emparejar.
- Cuentas que facturan por Mercury y no tienen cliente de Mercury.
- Cobros con un número de factura que no existe en Mercury, o que es de otra cuenta.
- Cobros facturados sin número, con la factura de Mercury que les corresponde (propuesta).
- Cobros facturados sin ninguna factura en Mercury.
- Facturas de Mercury que ningún cobro de Nexus tiene.
- Pagada en Mercury y por cobrar en Nexus (con el día que entró la plata, si se encuentra).
- Cobrada en Nexus y sin pagar en Mercury.
- Anulada en Mercury con un cobro que la sigue nombrando.
- Monto distinto entre la factura y sus cobros (una factura puede cubrir varias cuotas).
- Plata que entró de un cliente y no corresponde a ninguna factura.

## Lo que NO hace

- **No escribe en Mercury.** El token no puede. Si algún día hace falta (marcar una factura pagada desde Nexus), es
  otra decisión, con otro token y su propio archivo.
- **No marca cobros como cobrados solo.** Propone y una persona confirma (INV3), igual que con Odoo.
