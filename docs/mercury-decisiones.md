# Integración con Mercury — decisiones

Cada decisión con su porqué y lo que la revertiría. El plan está en `docs/mercury-integracion-plan.md`.

## 2026-10-02 · La copia (etapa 1)

**Qué se decidió.**
- **API REST v1 con un token «Read Only».** Mercury no deja escribir con él y no pide IP fija, así que el servidor lo
  usa sin configurar nada más. `transporte-http.ts` es el único archivo que habla con Mercury y solo pide GET (lo vigila
  `guardas.test.ts`). El token nunca se imprime: ni en los logs ni en los errores, aunque Mercury lo repita.
- **Tablas propias** (`FacturaMercury`, `ClienteMercury`, `MovimientoMercury`, `SyncMercuryCorrida`) y ninguna tabla
  existente cambia. Así el SQL es aditivo y el código que corre hoy no se entera hasta el deploy.
- **El emparejado vive en `ClienteMercury`** (cuenta, vía, «no es cliente», firma) y no en `OdooPartnerVinculo`. Al
  emparejar se enlaza además la sociedad de Mercury de la cuenta (`sociedadId`), que es lo que eligen los cobros.
- **La cuenta de una factura no se copia en la factura**: sale del cliente emparejado al leer. Con 76 facturas no hace
  falta, y una copia de la cuenta puede quedar vieja (INV30 existe por eso en Odoo).
- **Los movimientos se copian desde 2025-01-01, entradas y salidas.** Lo anterior no tiene facturas con qué cruzarse;
  las salidas servirán para cruzar gastos.
- **Las mismas promesas que la copia de Odoo:** se lee todo antes de escribir; menos de la mitad de lo conocido es una
  lectura parcial y no se copia nada; nunca se borra una fila (queda DESAPARECIDA, y si desaparecen muchas de golpe no
  se marca ninguna); una corrida abre y cierra su fila pase lo que pase; una sola copia a la vez.
- **Qué entrada de plata es un cliente pagando** (`esEntradaDeCliente`): afuera las transferencias entre cuentas
  propias, intereses, cashback y el pago automático de la tarjeta («Mercury …»), las devoluciones de compras con
  tarjeta, y lo que viene de Smarteam. Medido sobre las 110 entradas de 2026.

**Por qué.** La factura de Mercury no dice cuándo se pagó; el movimiento sí. Y lo internacional (US$187.232 en 2026)
no se veía en ninguna pantalla.

**Qué la revertiría.** Que Mercury dé el pago dentro de la factura: los movimientos dejarían de hacer falta para eso.
Que Elías decida escribir en Mercury: va con otro token y otro archivo, nunca en `transporte-http.ts`.

## 2026-10-02 · Emparejar y lo que no cuadra (etapas 2 y 3)

**Qué se decidió.**
- **La pantalla es la de Odoo.** `DiferenciasOdoo` recibe `fuente="mercury"` y lee `/api/cobranza/mercury/diferencias`,
  que contesta con el mismo contrato (`DiferenciaOdoo`). Las marcas «Está bien así» van a la misma tabla
  (`DiferenciaOdooMarca`), con líneas `MERCURY-*`: así la huella, el «vuelve solo si cambia un número» y «Marcadas»
  son los mismos, probados. La ruta de Mercury solo marca y deshace líneas `MERCURY-*`.
- **Nada se guarda como hallazgo.** Cada carga vuelve a cruzar la copia de Mercury con los cobros de hoy: lo arreglado
  sale solo y lo que sigue mal sigue. Es lo que pidió Elías («que cada vez que corran vuelvan a aparecer»).
- **Emparejar parte del cliente de Mercury** (unos treinta), no de la cuenta. Propuestas por número (un cobro de la
  cuenta ya nombra una factura del cliente), por nombre (cuenta, razón social o sociedad de Mercury) y por monto, esta
  última solo entre cuentas que facturan por Mercury (abierta a todas proponía Honda para Patagonia Camp).
- **Emparejar pide lectura de Cobranza, marcar pide edición**, igual que en Odoo.
- **La comisión del banco:** una entrada paga una factura si es hasta un 3 % menor (mín. US$20, máx. US$60), nunca
  mayor. Visual Branding pagó US$1.760 por US$1.780.
- **Redondeo:** la factura que le falta a un cobro se propone con hasta US$1 de diferencia y la fila lo avisa (ACCCSA:
  cobros de US$712, facturas de US$712,50).
- **Historia y pagadas sin cuenta, como Odoo:** una factura ya pagada de antes del primer cobro de su cuenta no se acusa;
  un cliente sin cuenta con todo pagado no es una fila (está en «Emparejar»). Las líneas dicen cuántas dejaron fuera.
- **«INVOICE-1» también es un número de Mercury** (Intercert numeró a mano).

**Qué la revertiría.** Que Alex quiera ver la historia pagada (se quita `esHistoria`). Que la comisión sea otra (se
cambia `COMISION_DEL_BANCO`; «Cómo funciona» lee los mismos números).
