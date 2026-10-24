# Odoo, Mercury, Stripe, Claude y el resto — plan

> Pedido de Elías del 2026-10-23: revisar si cada integración aprovecha lo que su API permite (en Mercury no lo hacíamos).
> Investigado el 2026-10-24 contra el código, la base, Odoo y Mercury en solo lectura, y la documentación oficial.
> **Nada construido.** En el roadmap es el área U (U15 a U24).

## Odoo

**Hoy:**
- lee 14 campos de las facturas y 7 de los clientes, y copia todas las facturas en cada corrida;
- para el día del pago encadena tres lecturas;
- no lee los pagos (`account.payment`), las líneas del banco ni los diarios.

**Lo que se encontró, en vivo:**
- El campo `invoice_payments_widget` de la factura ya trae cada pago con su fecha, su diario (el banco: «BAC Colones») y
  si es una diferencia de cambio. **Es el gemelo del error de Mercury:** Nexus lo reconstruye a mano.
- **Hay 98 líneas del banco sin conciliar** (eran 14 en septiembre): plata que entró y no está atada a ninguna factura,
  que Nexus no ve.
- `is_matched` de cada pago explica cuándo una factura queda «en proceso de pago» (`in_payment`). Eso resuelve la duda
  que dejó apagado ese caso.

**Mejoras:**
1. **U15 · Las líneas del banco sin conciliar,** como una razón más en «Lo que no cuadra» (solo lectura).
2. **U16 · El día del pago y el banco desde `invoice_payments_widget`,** comparado contra lo de hoy antes de cambiar.
3. **U17 · El verde de «en proceso de pago» con `is_matched`,** con simulacro: mueve 176 cobros.
4. **Más adelante:** Odoo 19 deja obsoleto el protocolo de hoy, que se retira en 2028. El servidor es Odoo 17 y el
   transporte ya está aislado: no hay apuro.

## Mercury

**Hoy:** solo lee facturas, clientes y movimientos. La decisión del 22 oct está bien: la factura no trae fecha de pago y
la API no tiene endpoints de pagos.

**Mejoras:**
1. **U18 · Buscar el depósito de una factura solo en su cuenta de destino** (`destinationAccountId`; hay 2 cuentas).
2. **U19 · Revisar con Alex el ritmo de los movimientos:** desde el 16 de octubre llega más o menos uno por día. Hay que
   comparar un día contra el panel de Mercury.
3. **No vale la pena:** los webhooks de Mercury no traen nada de facturas.

## Stripe (cuando llegue la clave de Alex)

1. **U20 · Una clave restringida de solo lectura** y una copia cada hora de:
   - los cobros (el día exacto del pago con tarjeta);
   - los movimientos del saldo (comisión y neto);
   - las liquidaciones (qué cobros forman cada depósito al banco).
2. **Antes de construir:** preguntarle a Alex si los pagos con tarjeta de las facturas de Mercury caen en la cuenta de
   Stripe de Smarteam o en una que maneja Mercury. 56 de las 84 facturas aceptan tarjeta.

## Claude (Anthropic)

**Hoy:**
- US$118 en 30 días, en 2.051 llamadas;
- ya se usan la caché, los lotes (construidos), las salidas con esquema, las herramientas y la búsqueda web.

**Lo que se encontró:**
- **El panel de gasto sobrecobra Sonnet 5:** lo cobra a US$3/US$15 por millón y el precio vigente es US$2/US$10
  (`lib/ai/precios.ts`).
- **El ahorro por lotes nunca corrió:** está desplegado desde el 18 oct y hay 0 filas en `PedidoEnLote`. El vigía ya
  está conectado (`VIGIA_BARRIDO_POR_LOTE = true`), pero solo encola los proyectos sin novedad y con huella
  (`lib/cs/watchdog.ts:1044-1051`), y en una semana hizo 34 llamadas en el momento.
- **Una caché que solo escribe:** 1,18 millones de tokens escritos y 33 mil leídos. Se paga el recargo sin ahorrar.
- **La exploración de venta,** el agente que más gasta, no usa caché.

**Mejoras** (el ahorro realista es de US$20 a US$30 al mes; vale más por el orden que por la plata):
1. **U21 · Corregir el precio de Sonnet 5.** ✓ Corregido el 24 oct (90 llamadas); falta el deploy.
2. **U22 · Que el ahorro por lotes corra.** Primero se mide por qué el vigía no encola. Va en dos partes:
   - **en el paso uno del roadmap,** las lecturas de reuniones van por lotes, antes de traer las 301 con solo notas, las
     177 del rescate y la investigación de las 71 empresas activas: es lo que abarata la carga;
   - **en el paso 2,** que el vigía entre por los lotes, y después la post-sesión y el avance del cronograma.
3. **U23 · La caché donde ahorra:**
   - quitar la que solo escribe;
   - cachear el contexto que repite la exploración de venta;
   - el clasificador a Haiku, después de compararlo (antes en «Lo que conecta a los equipos» del roadmap).

## El resto

- **Apify:** mandar el token en la cabecera y no en la dirección (sin riesgo). Con este volumen no compensa buscar otro
  actor.
- **Supabase:** la sesión se verifica dos veces por pedido contra Supabase. Con claves asimétricas se verificaría en
  Nexus. Antes hay que ver qué clave usa el proyecto.
- **U24 · Sentry Crons:** que avise cuando un job deja de correr, no solo cuando falla. Eso habría mostrado lo de los
  lotes. Antes hay que ver si producción tiene el DSN.

## Criterio de éxito

- **U15:** las líneas del banco sin conciliar se ven en una fila aparte de «Lo que no cuadra».
- **U21:** el gasto que muestra Nexus queda a ±5 % de la factura de Anthropic.
- **U22:** al menos una llamada en lote por día.
- **U23:** la caché leída queda por encima de la escrita.
- **U24:** se vio avisar una vez.

## Orden

1. U21 (✓ hecho), U15 y el token de Apify (sin riesgo); la parte de U22 de las lecturas de reuniones.
2. El resto de U22 y U24 (que lo que corre solo se vea).
3. U16, U18 y U23.
4. U17, con su simulacro.
5. U20, cuando llegue la clave de Alex y se sepa de quién es la cuenta.
