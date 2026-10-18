# Finanzas: terminar de simplificar — validación (18 oct 2026)

Para decidir la iniciativa 5 de «La siguiente serie» (`docs/roadmap.md`). Es análisis: no se construyó nada.

**En una línea:** el menú se simplificó a medias y se deshizo en parte el 8 oct, pero lo que de verdad pidieron Alex y
Marco no es un menú más corto: es dejar de llevar dos libros. El 16 oct se decidió que Odoo y Mercury mandan y que Nexus
muestra lo que ellos dicen. Simplificar el menú sigue valiendo, pero va detrás de eso.

Fuentes: 24 reuniones de 2026 con Alex Arrieta o Marco Salas donde se habló de Finanzas en Nexus (del 7 jul al 16 oct),
`docs/finanzas-rediseno-plan.md`, `docs/odoo-decisiones.md`, `docs/mercury-decisiones.md`, la ficha F, DECISIONS, el
código de hoy y lo que cada persona escribió en Finanzas. Todo leído con la base en solo lectura.

## 1. Qué se planeó simplificar y por qué

- **Julio: sacar costos y caja de Cobranza.** Alex, 13 jul: «costos y gastos y caja neta no debería estar dentro de
  cobranza completa». De ahí nació «Finanzas» como agrupador.
- **27 jul: el menú creció.** Elías lo dijo en la reunión con Alex: el menú «se hizo mucho más grande».
- **3 oct: un menú por persona** (`docs/finanzas-rediseno-plan.md`). Dinia registra y entra a Pendientes; Alex revisa y
  cierra el mes y entra a Supervisión; dirección mira y entra al Punto de equilibrio. Cada uno veía solo lo suyo.
- **16 oct: el cambio de fondo.** Alex: «tratamos de convertir Nexus en un ERP y no es un ERP; es un visualizador de
  datos». Elías: simplificar Finanzas para «que solo nos sirva para lo que ocupamos». Se decidió que Odoo y Mercury son
  la verdad y Nexus valida (plan «Un solo libro financiero»).

⚠ En ninguna reunión Marco ni Alex pidieron menos entradas en el menú. Lo que pidieron es menos reproceso: no cargar lo
mismo en Odoo, en el Excel y en Nexus.

## 2. Qué se hizo, qué quedó a medias y qué se deshizo

| | Qué | Evidencia |
|---|---|---|
| Hecho | Cobranza en cuatro pestañas: Quién nos debe, Cobros, Clientes, Alertas | `CobranzaClient.tsx`; «Quién nos debe» es del 16 oct (d641cc39), pedido de Marco y Alex |
| Hecho | Proyección, reportes y corte salieron de Cobranza a «Reportes de cobranza» | `/finanzas/reportes` |
| Hecho | Una sola lista de lo que no cuadra con Odoo y Mercury | `/finanzas/conciliacion`, con «Lo pagado» y «Gastos y Mercury» |
| Hecho | Una sola entrada de Planilla (calendario, historial, salarios, aguinaldo y comisiones de vendedor adentro) | `nav-config.tsx` |
| Hecho | Supervisión, Cierre del mes y Pendientes | Alex cerró enero a septiembre el 16 oct y revisó 21 registros |
| Hecho | El gasto ya no sale del Excel desde octubre | `EGRESOS_DESDE_NEXUS` |
| Hecho | Odoo y Mercury mandan, primera parte: la factura se pega sola a su cuota y lo pagado se cobra en lote | d2d33746; el script se aplicó el 17 oct |
| A medias | Las hojas viejas de Costos (Costos, Fijos, Herramientas, Tarjetas) salieron del menú, pero siguen vivas y hay enlaces que llevan ahí | «Recurrentes» manda a `/finanzas/costos` como «Costos y gastos»; «Volver» de Comisiones de vendedor también |
| A medias | Cobranza › Odoo, Mercury e Importar están fuera del menú, pero se llega desde Integraciones, Conciliación, Reportes y la cartera | `integraciones/page.tsx`, `ConciliacionClient.tsx`, `RendimientoCobranza.tsx`, `PanelCartera.tsx` |
| A medias | Que lo pagado en Odoo y Mercury se cobre solo cada día | Etapa C del libro, sin empezar: espera tu decisión de cobrar sin firma |
| Deshecho | El menú por persona, para los Super Admin | b418c243, 8 oct: «los super admins deberían poder ver todo». Hoy un Super Admin ve 20 entradas; Dinia sigue con el menú recortado por sus permisos |

**Lo que no se puede medir todavía.** «Uso de Nexus» empezó a contar el 16 oct y cuenta Finanzas como una sola sección:
no dice qué página se abre. Alex la abrió 8 veces el 16 oct; Marco, 1; Dinia, ninguna desde el 16. Lo que sí se ve es
quién escribe en cada parte:

| Lo que se hace en Finanzas | Quién, desde el 1 oct |
|---|---|
| Planilla (quincenas pagadas) | Alex, 45 |
| Cierre del mes y revisión | Alex: 9 cierres y 21 revisiones |
| Recurrentes (cambios) | Alex, 10 |
| Facturas marcadas y números | Dinia 13 y 13 (la última, el 6 oct); Alex 2; Elías 38 y 37 (por scripts y pruebas) |
| Pagos registrados | Dinia 4 (la última, el 6 oct); Elías 27 |
| Gastos del mes | Solo los que cargó un script (20) |
| Comisiones de aliados, Otros ingresos, Tarjetas, Importar | Casi nada: la importación del 14 sep; 3 otros ingresos de Elías el 16 oct |

Dinia no escribe nada en Finanzas desde el 8 oct. El 16 oct se dijo que **María José** concilia cada mañana: no tiene
cuenta en Nexus.

## 3. Lo que dijeron Marco y Alex

**Lo que les duele: el doble trabajo**
- 13 jul, Alex: lo de conciliar en Odoo y repetirlo en Nexus «va a ser un reproceso».
- 19 ago, Alex: «irme a Odoo desde enero más Google Sheets enero más Nexus enero e ir haciendo cotejo con los tres».
- 19 ago, Alex: «lo único que a mí de esto me duele... es la cantidad de tiempo».
- 16 oct, Alex: «estoy caminando por todos los sistemas haciendo el reproceso».
- 16 oct, Alex: «Nexus está generando duda para que la persona revise», cuando debería decir que ya está.
- 16 oct, Alex: «yo no voy a seguir llenando Google Sheets».

**Lo que pidieron y está hecho**
- 2 sep, Alex: un botón para actualizar desde Odoo cuando termina de facturar. Hecho: «Actualizar desde Odoo».
- 25 sep: «Está bien así» por cada fila de lo que no cuadra, con motivo. Hecho.
- 29 sep, Alex: poder fusionar clientes y editar nombres. Hecho (fusión de fichas, 1 oct).
- 6 oct: un pago posterior no marca el mes como cambiado; Alex: «me parece bien». Hecho.
- 6 oct: avisar en Cobranza cuando el proyecto está pausado. Hecho.
- 16 oct, Alex sobre Cobranza: «Está bien para ir haciendo check, pero no para análisis»; quería ver quién debe. Hecho el
  mismo día: «Quién nos debe».
- 16 oct, Marco y Alex: marcar varias series del gráfico a la vez. Hecho (ea3cf26b).

**Lo que decidieron**
- 16 oct: Odoo y Mercury son la verdad; lo pagado y conciliado con el banco cuenta como cobrado sin otra firma. Alex:
  «definitivo».
- 16 oct, Alex: «nosotros no podemos depender de las comisiones, tenemos que depender de las ventas». Quedó guardado:
  los aliados no cubren el piso.
- 16 oct, Marco: el punto de equilibrio es ingresos contra egresos; se segmenta después.
- 16 oct, Alex: Planilla, Aguinaldo, Comisiones, Tarjetas, Gastos del mes, Recurrentes, Aliados y Otros ingresos están
  «a tope y cerrados». Falta cerrar Cobranza.

**Lo que quedó abierto**
- 16 oct, Marco: códigos de división en la facturación (recurrencia, continuidad, soporte web) para ver la utilidad por
  servicio.
- 16 oct, Marco: una línea de metas de venta en el gráfico, con las metas de HubSpot.
- 16 oct, Marco: esperaba unos US$90.000 de ventas ganadas sin cobranza y Nexus dice US$218.000.
- 16 oct: que el punto de equilibrio cuente solo ventas y facturas del año. Hoy suma lo de diciembre facturado en enero.
- 16 oct: los gastos que cambian cada mes (Meta, de 100 a 300) se toman de Mercury, no de un monto fijo.
- 15 oct, Marco: las comisiones de licencias se pagan «cada trimestre», todas juntas, porque si no «está sacando plata del
  flujo de caja».

## 4. Qué falta y qué recomiendo

| # | Qué | Recomiendo | Por qué |
|---|---|---|---|
| 1 | Que lo pagado en Odoo y Mercury se cobre solo cada día (etapa C del libro) | **Seguir, primero** | Es lo que Alex llamó «definitivo» y lo que le quita el reproceso. Sin esto, simplificar el menú no le ahorra nada |
| 2 | Retirar las hojas viejas de Costos: que lleven a su página nueva | **Seguir** | Hoy hay dos lugares para lo mismo, y dos enlaces mandan al viejo. Es poco trabajo y sin riesgo de datos |
| 3 | Odoo y Mercury como pestañas de Conciliación | **Seguir** | «Emparejar» y «Facturación por cliente» son trabajo de conciliar. El 6 oct Alex no sabía si la conciliación «es la de Nexus o la de Odoo» |
| 4 | Importar (el CSV y la comparación con el libro de Alex) | **Dejar por ahora y retirar después** | Sirve mientras exista el libro de Alex. Cuando él deje el Sheet, sobra |
| 5 | Reportes de seis a tres | **Seguir** | Rentabilidad vive en Éxito del cliente; Tipo de cambio cabe dentro del Punto de equilibrio; Integraciones, dentro de Conciliación |
| 6 | Caja neta | **Preguntar a Alex** | El 13 jul Elías dijo «yo ni siquiera entiendo de qué va»; nadie la mencionó después. Puede ir dentro del Punto de equilibrio |
| 7 | Comisiones de vendedor y Aguinaldo dentro de Planilla | **Seguir** | Para un Super Admin ya están dentro de Planilla; salen dos veces en el menú solo por la regla del 8 oct |
| 8 | El menú de los Super Admin | **No volver a recortar por vista**: ocultar solo lo que es de quien registra | Alex usa casi todo (planilla, cierre, supervisión, cobranza, equilibrio). Con los puntos 2 a 7 el menú baja de 20 a unas 13 entradas sin esconderle nada |
| 9 | Que el punto de equilibrio cuente solo el año, y la diferencia de ventas sin cobranza (US$218.000 contra 90.000) | **Seguir** | Es el número que Marco mira. Si no le cuadra, deja de creerle al resto |
| 10 | Una cuenta para quien concilia cada mañana | **Seguir** | Se acordó que concilie cada día y no tiene acceso |

## 5. Lo que tienes que decidir

1. **¿Cobramos sin firma lo que Odoo y Mercury dan por pagado y conciliado con el banco?**
   a) Sí, cada día y solo (lo que Alex dijo el 16 oct) · b) No, sigue el clic diario en «Lo pagado» · c) Solo Mercury
   sin firma; Odoo con clic.
2. **¿Qué ve un Super Admin en el menú de Finanzas?**
   a) Todo, como hoy (20) · b) Todo menos lo de quien registra: Pendientes, Comisiones de vendedor y Aguinaldo (lo
   recomendado) · c) Volver al menú por vista del 3 oct.
3. **¿Dónde van Odoo y Mercury?**
   a) Como pestañas de Conciliación (lo recomendado) · b) Dentro de Integraciones · c) Como están, fuera del menú.
4. **¿Las hojas viejas de Costos?**
   a) Llevan a su página nueva (lo recomendado) · b) Se quedan.
5. **¿Reportes?**
   a) Tres: Punto de equilibrio (con Tipo de cambio adentro), Reportes de cobranza y Comisiones; Rentabilidad solo en
   Éxito del cliente (lo recomendado) · b) Como están.
6. **¿Caja neta?**
   a) Dentro del Punto de equilibrio · b) Sola, como hoy · c) Se retira.
7. **¿Quién concilia cada mañana?**
   a) Dinia · b) María José, con una cuenta nueva · c) Alex.
8. **¿En qué orden?**
   a) Primero el libro (puntos 1, 9 y 10) y después el menú (lo recomendado) · b) Primero el menú · c) Los dos a la vez.

## 6. Qué probar, en simple

En el 3004, entrando como tú (Super Admin, vista Dirección). Nada de Wherex.

| # | Dónde | Qué deberías ver |
|---|---|---|
| 1 | Menú de la izquierda › Finanzas | Te lleva al Punto de equilibrio. El panel tiene 20 entradas, de Pendientes a Comisiones |
| 2 | Finanzas › Cobranza › «Quién nos debe» | Una fila por cliente con lo vencido, lo que está en plazo y lo que falta facturar, en dólares y colones por separado. El 16 oct eran 37 clientes. Tocar uno muestra sus cuotas |
| 3 | Cobranza › Cobros | «Falta facturar» arriba de todo (hoy 18 cuotas con la fecha ya pasada), después lo vencido, «Esta quincena» y «Más adelante» |
| 4 | Cobranza › Alertas | Vencidos y promesas incumplidas; ninguna alerta sobre un cobro que ya está cobrado |
| 5 | Finanzas › Conciliación, arriba | Odoo y Mercury actualizados el 17 oct a las 6:00 (el domingo, el 18) |
| 6 | Conciliación › «Lo que no cuadra» | Cada fila con «Está bien así» y su motivo; las que marcaste, en «Marcadas» |
| 7 | Conciliación › «Lo pagado» | Las cuotas que Odoo y Mercury dan por pagadas, con el día del pago. Solo se cobran las que marcas al confirmar |
| 8 | Conciliación › «Gastos y Mercury» | Lo que cobra la tarjeta cada mes, con su recurrente al lado, y las comisiones de Stripe para confirmar |
| 9 | Finanzas › Planilla | El calendario: hasta septiembre todo pagado. La primera quincena de octubre ya pasó y tiene 1 de 16 pagada: o falta marcarla o falta pagarla (pregúntale a Alex). La segunda, sin pagar |
| 10 | Planilla › «Historial» y «Aguinaldo» | Las quincenas pagadas por persona; el aguinaldo de cada uno, de diciembre a noviembre entre doce |
| 11 | Finanzas › Cierre del mes | Enero a septiembre «Cerrado» por Alex el 16 oct; octubre, en curso |
| 12 | Finanzas › Punto de equilibrio | Enero a septiembre con ✓; en «Para decidir», los aliados ya decididos: no cubren el piso. Se marcan varias series a la vez |
| 13 | Punto de equilibrio › «Licencias revendidas» | Dos licencias activas, entre ellas kölbi, con su parte de servicio |
| 14 | Finanzas › Tipo de cambio | La venta del BCCR hasta el 17 oct, día por día |
| 15 | Finanzas › Reportes de cobranza | La proyección por quincena y por mes, en dólares y colones separados |
| 16 | Finanzas › Supervisión | Lo que registró Dinia, con lo que Alex ya revisó como «Está bien» |
| 17 | Escribe en la barra de direcciones `/finanzas/costos` | Abre la hoja vieja de Costos: es lo que el punto 2 de la tabla de arriba retira |
| 18 | Pídele a Dinia que entre a Finanzas | Entra a Pendientes y su menú no tiene Planilla salvo que se la hayas dado en Equipo |

Si algo de esto no aparece como dice la tabla, mándame una captura.
