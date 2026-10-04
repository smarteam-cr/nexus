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
| ⬜ | **Menú por persona** | La vista de cada uno, el panel por vista y la entrada `/finanzas`; Cobranza más corta; «Reportes de cobranza» | columna `vistaFinanzas` |
| ⬜ | **Pendientes y Conciliación** | La entrada de Dinia y la lista única de lo que no cuadra (Odoo + Mercury) | — |
| ⬜ | **Dinia en gastos** | Gastos del mes, Recurrentes y Tarjetas sin salarios; quién anotó cada gasto | columna `registradoPor` del gasto |
| ⬜ | **Revisión** | Supervisión de Alex: decisiones, revisión con «Devolver», cobranza que se complica | tabla `RevisionRegistro` |
| ⬜ | **Cierre del mes** | Cerrar y reabrir; tipo de cambio en pantalla; meses cerrados en el punto de equilibrio | tabla `CierreMes` |
| ⬜ | **Gasto sin Excel** | El punto de equilibrio lee los gastos de Nexus desde octubre; Mercury en el punto de equilibrio y en «Actualizar» | — |

Todo el SQL va en un solo archivo, `scripts/sql/2026-10-03-finanzas-rediseno.sql`, **antes del deploy**. ⚠ La columna de
`TeamMember` la lee cada página de Nexus: sin el SQL aplicado, nada carga (el deploy lo detecta y vuelve atrás solo).
