# Rediseño de Finanzas — plan y decisiones

Pedido de Elías (2026-10-03): «Rediseña el módulo. Lo consensuamos y luego lo aplicamos», y después de revisar el diseño
(https://claude.ai/artifact/FrTEMDHbxw7NmyG5Qjovfy, sistema «Nexus · interfaz interna»): «Aplícalo a todo».

La idea en una línea: **se entra igual que hoy (Finanzas, en el menú de la izquierda), pero el panel cambia según quién
entra, y cada persona llega a una pantalla hecha para su trabajo**. Dinia registra, Alex revisa, decide y cierra el mes,
dirección mira el resultado.

## Las tres vistas

| Vista | Quién (por defecto) | Entra a | Su panel |
|---|---|---|---|
| **Registra** | todo el que tiene Cobranza y no es SUPER_ADMIN (Dinia, ADMIN) | Pendientes | Mi día · Ingresos · Costos y gastos (sin planilla) · Cuadre |
| **Supervisa** | SUPER_ADMIN (Alex, y Elías mientras no elija otra) | Supervisión | Mi área (Supervisión, Cierre del mes) · Ingresos · Costos y gastos con Planilla · Cuadre · Reportes |
| **Dirección** | un SUPER_ADMIN que lo elige en Equipo | Punto de equilibrio | Reportes (Punto de equilibrio, Caja neta, Integraciones) |

La vista decide el **menú** y la **pantalla de entrada**; los permisos siguen decidiendo qué se puede abrir. Un SUPER_ADMIN
en vista Dirección puede abrir cualquier página por su enlace: solo no la tiene en el menú.

## Decisiones tomadas al aplicarlo (Elías no las contestó; se tomó lo recomendado)

1. **Dinia no ve salarios.** Planilla, aguinaldo, comisiones de vendedor y los costos de categoría Salario siguen solo para
   SUPER_ADMIN, con su guarda de privacidad intacta. Dinia ve el total de la planilla del mes, sin el detalle por persona.
   Para lo demás (gastos del mes, recurrentes que no son salarios, tarjetas) hay rutas nuevas que **nunca leen un salario**,
   con un permiso propio, `gastos` (lectura y edición), que ADMIN trae concedido.
2. **Alex revisa pagos y gastos**, no las facturas marcadas: esas ya se comparan solas contra Odoo y Mercury en
   Conciliación. Revisar es «Está bien» o «Devolver» con comentario; lo devuelto le llega a Dinia en Pendientes.
   Lo que registra un SUPER_ADMIN no pasa por revisión.
3. **El cierre del mes no congela nada.** Guarda quién cerró, cuándo y los números de ese momento. Si después cambia un
   número del mes, el punto de equilibrio lo dice («cambió después del cierre») en vez de bloquear la edición.
   Bloquean el cierre: planilla, gastos del mes, tipo de cambio confirmado y revisión al día. Lo de Conciliación, los pagos
   que Odoo o Mercury ya dan por pagados y las comisiones vencidas se muestran, pero no bloquean: hoy son 145 filas y
   el mes no se cerraría nunca.
4. **El gasto deja de venir del Excel desde octubre de 2026.** De octubre en adelante el punto de equilibrio lee los gastos
   de Nexus (recurrentes y gastos del mes); enero a septiembre se quedan con lo que ya se cargó del Excel de egresos.
5. **Cualquier mes se puede cerrar**, también los pasados (abril a julio están completos). No hay carga hacia atrás.

## Etapas

| | Etapa | Qué deja | Base de datos |
|---|---|---|---|
| ✅ | **Menú por persona** | La vista de cada uno, el panel por vista y la entrada `/finanzas`; Cobranza más corta; «Reportes de cobranza» | columna `vistaFinanzas` |
| ✅ | **Pendientes y Conciliación** | La entrada de Dinia y la lista única de lo que no cuadra (Odoo + Mercury) | — |
| ✅ | **Dinia en gastos** | Gastos del mes, Recurrentes y Tarjetas sin salarios; quién anotó cada gasto | columna `registradoPor` del gasto |
| ✅ | **Revisión** | Supervisión de Alex: decisiones, revisión con «Devolver», cobranza que se complica | tabla `RevisionRegistro` |
| ✅ | **Cierre del mes** | Cerrar y reabrir; tipo de cambio en pantalla; meses cerrados en el punto de equilibrio | tabla `CierreMes` |
| ✅ | **Gasto sin Excel** | El punto de equilibrio lee los gastos de Nexus desde octubre; Mercury en el punto de equilibrio y en «Actualizar» | — |
| ✅ | **Punto de equilibrio para dirección** | La página rehecha para RevOps, el CFO y el CEO (ver abajo) | tabla `DecisionFinanzas` |
| ✅ | **Tipo de cambio del BCCR** | La tasa de cada día, del Banco Central, y su histórico (ver abajo) | tabla `TipoCambioDia` |

## Cómo funciona la revisión

- Entra lo que registró alguien del equipo que **no** es Super Admin desde el 1 de agosto de 2026 (el primer mes en que
  Dinia registró pagos): los pagos que dio por cobrados (`Cobro.confirmadoPor`) y los gastos que anotó
  (`GastoPuntual.registradoPor`). Las firmas de importación (libro de Alex, planilla de facturaciones) no son de nadie
  del equipo y no entran.
- «Está bien» guarda la **huella** de los números (monto, moneda, fecha en que entró, referencia y factura del pago;
  nombre, monto, moneda y fecha del gasto). Si cambian, vuelve con «Cambió después de tu revisión». La huella se calcula
  en el servidor, nunca la manda la pantalla.
- «Devolver» pide un comentario y le llega a quien lo registró en Pendientes, con «Ir a corregirlo» y «Ya lo corregí».
  Devolver no deshace nada. Lo corregido vuelve a Supervisión marcado.
- Avisos: registrado más de 30 días después de entrar la plata (o del gasto), una fecha de entrada posterior al
  registro, un cobro sin factura marcada, un gasto a futuro.

## Cómo funciona el cierre

- `/finanzas/cierre` abre en el mes anterior al de hoy. La tira del año dice cómo está cada mes: cerrado, completo y sin
  cerrar, en curso, por venir, o qué le falta.
- Frenan el cierre: las dos quincenas de planilla; los gastos (desde octubre de 2026 el aviso de Dinia, antes lo que el
  punto de equilibrio dice que le falta al Excel de egresos, sin la planilla); el tipo de cambio firmado por una persona
  (el que cargó el script no cuenta hasta que alguien lo confirma); la revisión de ese mes al día. Lo de Ingresos y
  Conciliación se muestra con «No frena el cierre».
- Solo se cierra un mes que terminó. Cerrar guarda quién, cuándo y los números del punto de equilibrio en dólares
  (egresos, facturado, cobrado, ingresos). Reabrir pide un motivo y deja guardados los números del cierre.
- El punto de equilibrio marca cada mes (✓ Cerrado · Cambió después del cierre · sin cerrar · qué le falta) y el margen
  a la fecha dice por qué es preliminar.
- La calidad de cada mes sale de la misma lista de egresos que el reporte (`cargarEgresosDelAnio`).

## Cómo funciona el gasto sin Excel

- Desde octubre de 2026 (`EGRESOS_DESDE_NEXUS`) el punto de equilibrio arma el gasto de cada mes con los recurrentes que
  no son salarios (vigentes ese mes; un anual pesa 1/12) y los gastos del mes, sumados por moneda como costo fijo. La
  planilla y la reserva de aguinaldo siguen igual. Las filas del Excel de octubre a diciembre dejan de contar.
- La tarjeta deja de ser un rubro aparte: en Nexus lo que se paga con tarjeta es un recurrente o un gasto del mes.
- Un mes de Nexus está completo con las dos quincenas de planilla y el aviso de que los gastos están todos (o el mes
  cerrado); si no, sale parcial con «gastos del mes sin confirmar».
- Medido el 2026-10-04 en prod: los recurrentes de Nexus dan US$3.907 al mes (herramientas 1.796 + fijos 2.111) contra
  US$4.107 del Excel para octubre; la diferencia es la tarjeta (US$131) y ajustes chicos.
- «Lo que no cuadra» del punto de equilibrio suma «por cobrar en Mercury de clientes sin emparejar» (sin sumar al total:
  no se sabe si el tablero ya lo cuenta). «Actualizar» ya trae también Mercury.

## Cómo funciona el punto de equilibrio (2026-10-05)

- Se lee como la reunión: la respuesta (¿alcanza lo facturado para el piso?, el margen a la fecha y lo que viene), el año
  mes a mes (líneas, barras o tabla, con la venta, lo facturado, lo cobrado, el gasto y los aliados; resaltar una serie
  desde la leyenda), de la venta a la caja, qué tan firmes son los números y la agenda para decidir.
- El margen es **preliminar** hasta que el CFO cierre los meses que cuenta y confirme el tipo de cambio; el «¿Por qué es
  preliminar?» lo dice con los meses reales (`porQueEsPreliminar`).
- La agenda (`armarAgenda`) reparte cada línea de «lo que no cuadra» a quien la decide: CEO, CFO o RevOps. Las que ya
  tienen su lugar en la página (ventas sin cobranza, Odoo, Mercury, egresos incompletos) no se repiten.
- Si lo de los aliados cuenta para el piso se decide **en la página** (tabla `DecisionFinanzas`, quién y cuándo). Sin
  decisión vale el criterio de siempre, `PARTNERSHIP_CUBRE_EL_PISO`.
- Línea nueva de «lo que no cuadra»: la planilla del piso contra la última pagada, si difieren más de 10 %.
- «¿Y si…?» simula lo que queda del año (facturar más o menos por mes, contar lo estimado de los aliados, un costo nuevo)
  sin guardar nada.
- Los componentes viejos (EquilibrioClient, CurvaEquilibrio, TablaMeses, InconsistenciasPanel, DesgloseIngresos,
  EstructuraCostos, ConfiabilidadDato) quedan sin uso; se borran cuando la otra sesión termine lo que tiene abierto en
  ellos. RendimientoCobranza sigue en uso, dentro de «Ver la cobranza contra el Excel».

## Cómo funciona el tipo de cambio (2026-10-05)

- `/finanzas/tipo-de-cambio` muestra la venta y la compra de referencia del BCCR día por día, el promedio de cada mes y
  la tasa cargada a mano que se usaba antes (el ₡500), para ver la diferencia. En el menú, en Reportes.
- Cada cobro, factura, quincena de planilla, comisión e ingreso que no es venta se convierte con la tasa de su día; lo
  que es de un mes entero, con el promedio de los días del mes. Un mes sin días del BCCR sigue con la tasa cargada a
  mano, y el punto de equilibrio lo dice en «Lo que todavía no está».
- Lo trae solo el job `tipo-cambio-daily`. Sin `BCCR_TOKEN` usa el API de Hacienda: la tasa de hoy siempre, el histórico
  cuando Hacienda lo sirve (el 2026-10-05 respondía 503). Con el token del BCCR, el histórico desde 2023 llega en la
  primera corrida.
- El cierre del mes ya no pide confirmar el tipo de cambio cuando el mes tiene todos sus días del BCCR.

Todo el SQL va en un solo archivo, `scripts/sql/2026-10-03-finanzas-rediseno.sql`, **antes del deploy**. ⚠ La columna de
`TeamMember` la lee cada página de Nexus: sin el SQL aplicado, nada carga (el deploy lo detecta y vuelve atrás solo).
El punto de equilibrio suma `scripts/sql/2026-10-05-decisiones-de-finanzas.sql`, también antes del deploy (sin él la
página carga igual, pero no se puede guardar la decisión de los aliados). El tipo de cambio diario suma
`scripts/sql/2026-10-05-tipo-de-cambio-diario.sql`, antes del deploy (sin él todo sigue con la tasa cargada a mano).
