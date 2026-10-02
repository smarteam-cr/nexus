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
