# Comisiones que cuiden el valor de la cuenta — plan

Iniciativa D del roadmap, pasos 1 a 4. Se construye en la página del modelo de comisiones
(Finanzas › Modelos › Comisiones, `/finanzas/modelo-de-comisiones`), que **explica y simula, no paga**. Es para cerrarlo
con Marco antes de construir el pago. Solo Super Admin, como hoy.

## El caso de Marco

Un vendedor bajó una recurrencia de US$ 3.000 a US$ 2.800 al mes: regaló US$ 2.400 al año y cobró el 100 % de la
comisión (5 % de 12 × 2.800 = US$ 1.680). Con la propuesta: 12 × 2.800 = 33.600, menos los 2.400 descontados = 31.200;
al 5 %, **US$ 1.560**. El vendedor también pone parte del descuento.

## Las reglas (una sola fuente: `lib/finanzas/modelo-comisiones/reglas.ts`)

1. **Valor de 12 meses.** Una venta tiene una parte única (implementación, una expansión de una vez) y una parte
   recurrente al mes. Su valor = único + 12 × mensual (`MESES_DEL_VALOR = 12`). Sin propuesta ni ajuste, la venta es
   toda única y vale su monto de HubSpot: el cálculo de hoy no se mueve.
2. **El descuento sale de la base.** Lo descontado = la parte única descontada + 12 × lo descontado al mes. Base de la
   comisión = valor − lo descontado × la parte que sale (`descuentoFuera`: entero, la mitad o nada; la propuesta dice
   entero). El descuento NO baja lo que cuenta para la meta: la meta mide lo que se cerró.
3. **La recurrencia pesa más en la meta.** Lo que cuenta para la meta = único + 12 × mensual × `FACTOR_DE_RECURRENCIA`
   (1,2). Solo mueve el cumplimiento (y con él, el porcentaje); la comisión se calcula sobre la base, sin el factor.
4. **Una expansión grande cuenta por su tamaño total.** Una venta única cuenta completa en el mes en que se firma,
   aunque se cobre en partes. Con el factor, una recurrencia de US$ 1.000 al mes cuenta 14.400 para la meta y una
   expansión de US$ 20.000 cuenta 20.000: el factor no hace que convenga más vender recurrencia chica.

«Antes» y «después» salen de la misma función: «antes» es la propuesta del 15 de octubre (factor 1, descuento dentro
de la base); «después», con las tres reglas. Así la simulación muestra la diferencia venta por venta.

## De dónde sale el descuento

- **De la propuesta**, cuando el trato de HubSpot de la venta tiene una propuesta: su Inversión ya guarda el precio de
  lista y lo cobrado por línea (`montoDeLinea`: `bruto` y `rango`). Se leen solo los **servicios** (`lineas`): las
  licencias pagan aparte (10 % × 3 meses) y su descuento lo da HubSpot. Lo lee una función pura nueva,
  `lib/business-cases/descuento.ts` (`descuentoDeServicios`), con la carga de propuestas ganadas que ya existe
  (`cargarPropuestasGanadas`, lib/finanzas/lo-vendido-server.ts, sin tocarla).
- **A mano en la simulación**: tipo (única o recurrente), el valor al mes y lo descontado al año, por venta. No se
  guarda, como todo lo de la simulación.

## La aprobación de un descuento de más del 10 %

- `UMBRAL_DE_APROBACION = 10` (por ciento, sobre el precio de lista de 12 meses de los servicios), en
  `lib/business-cases/descuento.ts`. Lo usan la propuesta y la simulación.
- En el editor de la Inversión, si el descuento pasa el umbral, una franja dice «Descuento del N %: lo aprueba Marco
  antes de enviarla». Quien tiene el rol de dirección (Super Admin) ve «Aprobar el descuento»; los demás, a quién
  pedírselo. Es chrome del editor: no llega al cliente ni al PDF.
- **Dónde queda, sin SQL**: entry reservada `__descuento` del Json `ProjectCanvas.sections` del canvas v0 de la
  propuesta (el mismo contrato que `__meta`). Se escribe por una ruta propia
  (`POST /api/business-cases/[id]/descuento`, solo Super Admin) que calcula el porcentaje en el servidor con la versión
  activa, y guarda quién, cuándo y hasta qué porcentaje aprobó. El v0 no se regenera: la aprobación sobrevive a una
  versión nueva.
- **Vale mientras el descuento no suba**: si después alguien sube el descuento por encima de lo aprobado, vuelve a
  pedir la aprobación. Se guardan las últimas 10.
- La simulación marca «Sin aprobar» una venta con más del 10 % sin aprobación, y «Lo escribiste tú» cuando el descuento
  es a mano (no se sabe si se aprobó).

## La página

- **Cómo funciona**: una sección nueva, «Descuentos y recurrencia», con el caso de Marco en números («de cada US$ 100…»)
  y una calculadora (precio de lista, lo cerrado) con el antes y el después; y el ejemplo de la expansión contra la
  recurrencia chica. Tres preguntas nuevas en «Decisiones pendientes»: el umbral del 10 %, el factor 1,2 y si el
  descuento sale entero o en parte de la base.
- **Simulación**: una caja «Descuento y valor de 12 meses» con cada venta de servicios (tipo, valor al mes, lo
  descontado, de dónde sale, la aprobación, lo que cuenta para la meta, la base y la comisión antes → después), una
  cifra con la diferencia del año, y en «Lo que falta decidir» el factor (1,2 o 1) y el descuento fuera (entero, la
  mitad o nada).

## Lo que NO se toca

`lib/finanzas/equilibrio.ts`, la rentabilidad, `docs/roadmap.md`, lo que se paga hoy. Sin SQL. Sin push ni deploy.

## Preguntas que quedan para Marco

El umbral del 10 %, el factor 1,2, cuánto del descuento sale de la base, y si el umbral se mide sobre el total de los
servicios o línea por línea (hoy: el total, porque es lo que el cliente se ahorra).
