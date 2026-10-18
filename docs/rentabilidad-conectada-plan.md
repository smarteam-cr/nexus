# La rentabilidad, conectada con las agendas y las tareas

Iniciativa C de `docs/roadmap.md` (lo que dejó la reunión con Marco del 17 oct). Plan del 2026-10-18.

**Para qué.** Marco quiere saber con datos cuánto deja cada cuenta y cómo produce cada persona, y llegar a
US$2,3 millones en 2027. Nexus ya sabe, sin que nadie marque tiempo, qué reuniones tiene cada persona y con qué
cliente, y qué tareas cerró. Con eso se arma el margen, y Nexus lee los números y propone qué hacer; una persona valida.
Es de uso interno: todo lo que tiene montos de personas es solo de dirección (`guardCostosAccess`, `veRentabilidad`).

## 1 · De dónde sale cada hora

Hoy Rentabilidad cuenta (lib/rentabilidad/queries.ts): las reuniones de Meet copiadas en `FirefliesSession`, la
preparación de cada reunión, la entrega del cronograma (respondida en «¿cuánto te tomó?» o estimada). Le faltan dos
fuentes que Nexus ya tiene:

| Fuente | Qué es | Cómo se lee | Rótulo en pantalla |
|---|---|---|---|
| Reuniones de Meet | Lo que ya se contaba (`FirefliesSession`, con su dueño `resolvedClientId`) | igual que hoy | Calendario |
| **Otras reuniones del calendario** | Presenciales, Zoom, Teams, llamadas: eventos SIN Meet, que la sync de Meet no copia | el calendario de cada persona del equipo, mes por mes (`calendar.readonly`, solo lectura), con el resolvedor único `cuentaDelEvento` (lib/mi-dia/agenda.ts) | Calendario (sin Meet) |
| Preparación | `preparacionMin` por reunión con un cliente, también de las nuevas | igual que hoy | Estimada |
| Entrega del cronograma | respondida o estimada, igual que hoy | igual que hoy | Respondida / Estimada |
| **Tareas internas hechas** | `Tarea` en estado `hecha`, de una cuenta CLIENTE, clase «accion» | lo que duraron sus bloques en la agenda (`agendaBloques`); sin bloque, su `minutosEstimados` | Tarea (agenda) / Estimada |

### Las reglas que evitan doble conteo

1. **Un evento con Meet nunca entra por el calendario**: ya está en `FirefliesSession` (lo copia la sync). Tampoco uno
   cuyo id ya es el `googleEventId` de una sesión.
2. **Una reunión agregada a mano** (`source = manual`) del mismo cliente que empieza a ±30 minutos de un evento del
   calendario deja fuera al evento: es la misma reunión.
3. **Un bloque de tarea en el calendario** (`esBloqueDeTarea`) nunca cuenta como reunión: cuenta por su tarea.
4. **Una tarea de clase «reunion» nunca cuenta**: sus horas son las de la reunión que se hizo (`reunionHechaId`) o la
   del calendario. Es la regla que pide la iniciativa.
5. **El mismo evento en dos calendarios** suma las horas de cada persona que fue (es lo que cuesta) y cuenta como una
   sola reunión.
6. **Un evento de un invitado que es de varias empresas no es de nadie** (`cuentaDelEvento`, invariante 1): sin una
   empresa sola, el evento no le carga horas a ninguna cuenta.
7. Mismo tope que hoy: un evento de 8 h o más es de día completo y no cuenta; los demás se topan en 4 h. Se cuenta
   solo a quien no lo rechazó y solo mientras estuvo en el equipo.

⚠ Lo que NO se puede separar: una tarea interna que es la misma que una tarea del cronograma («configurar el
pipeline» en los dos lados). Se muestran en columnas distintas para que se vea; no se adivina cuál es cuál.

### Cuándo se lee el calendario

Leer el calendario de 16 personas es un pedido a Google por persona y por mes. Se lee **solo para los meses del rango
que no tienen foto** (la foto del día 3 lo guarda), y lo leído se guarda 15 minutos en memoria por persona y mes. Sin
Google (local), esa fuente sale en cero y la pantalla lo dice. Nada se escribe en el calendario ni en
`FirefliesSession`.

## 2 · El margen por cuenta y por persona

- **Por cuenta**: lo de hoy, con las horas nuevas. Cada fila dice de dónde sale cada hora: calendario (con y sin Meet),
  tarea, respondida, estimada.
- **Por persona** (nuevo, en «Costo de la hora»): lo que generaron sus horas (el ingreso de cada cuenta repartido por
  la parte de horas que puso esa persona) menos lo que costaron, al costo de su hora. Orden alfabético, sin ranking. No
  es productividad: dice cuánto dejaron las cuentas en las que trabajó.
- **La foto del mes** guarda las horas nuevas (columnas aditivas) y sube a la versión 2. La foto de septiembre (v1) no
  las tenía: se lee como cero y la pantalla avisa que «Volver a tomar» la completa.

## 3 · La meta del año como barra

- **Dónde se guarda**: tabla `MetaDeFacturacion` (una fila por cada vez que se define, append-only; la vigente es la
  última de cada año). La edita dirección desde la pantalla, con su nota. El SQL deja la de 2027 en US$2.300.000, firmada
  por Elías con la nota de la reunión con Marco. Cambiarla no pide código ni deploy.
- **Contra qué se compara**: lo facturado de cada año con lo que haya en la base. Los libros mandan (Odoo y Mercury,
  decisión del 16 oct): Odoo = facturas publicadas menos notas de crédito, en su moneda; Mercury = facturas no
  canceladas. Más las comisiones de aliados con monto confirmado (Marco cuenta facturación y comisiones). Por moneda,
  sin convertir en el motor (`lib/finanzas/meta.ts`). Para la barra en dólares, la presentación convierte con la tasa de
  cada mes (`convertir`, el único punto) y dice cuánto quedó sin convertir.
- **Qué se ve**: una barra por año (2021 → hoy), la del año en curso con lo facturado más lo programado sin factura, y la
  de la meta. Un año sin datos se dice («2023: no hay facturas en la base»), no se dibuja en cero.
- Va en Rentabilidad (arriba de las pestañas) y en el punto de equilibrio (debajo del reporte).

## 4 · La línea de «por facturar»

La línea que sube al final del año son las cuotas programadas sin factura (`pendienteFacturar` del reporte). Se parte en:

- **Recurrencia**: cuotas de servicios `RECURRENTE`.
- **Proyectos**: cuotas de servicios `PROYECTO` (lo vendido que falta facturar).
- **Expansiones en el pipeline**: los negocios abiertos de HubSpot de empresas que ya son clientes, por su monto ×
  probabilidad, en el mes de su cierre. No es por facturar todavía: se muestra al lado, punteado.
- **Lo que falta para la meta**: la meta del año ÷ 12, menos lo facturado y lo programado de cada mes.

La parte de cada modalidad sale de las cuotas crudas, y se escala al número del reporte de cada mes: así la suma da
exactamente la línea del gráfico (el reporte ya descuenta las licencias revendidas).

## 5 · La lectura de los números

Un agente que mira lo agregado y propone. **Nexus detecta, una persona valida.**

- **Qué mira**: la línea de solvencia (meses que no cubren el piso, la brecha), el margen de cada cuenta (las que pierden
  o bajan mes a mes), las horas sin facturar (cuentas con horas y sin ingreso, la parte de horas con clientes), y el
  avance hacia la meta.
- **Primero el código, después el modelo**: las señales las calcula una función pura (`detectarSenales`); el modelo
  recibe solo esas señales y los agregados, y escribe qué hacer y cuánto invertir. Si no hay señales, no se llama.
- **Qué nunca entra al prompt**: salarios ni la planilla de una persona, nombres de personas, correos, el costo de la
  hora por persona. Sí entra el costo de la hora del equipo (directo y cargado), como hoy en pantalla. Lo vigila una
  prueba que arma el contexto con datos llenos de marcas y busca que no aparezcan.
- **Medido**: `AgentRun` (agentSlug `rentabilidad-lectura`, sin cliente) y cada llamada en `LlmCall`
  (`conContextoDeIA`). Familia «Finanzas» en Uso de Nexus.
- **Cuándo corre**: a mano («Leer los números») o una vez por mes (job `rentabilidad-lectura-mensual`, día 4 desde las
  8:00, después de la foto). Nunca cada día. El job mira el presupuesto automático antes de llamar.
- **Lo propuesto**: cada propuesta es una fila (`PropuestaDeRentabilidad`) con su estado: pendiente, usado,
  desestimado; vence a los 30 días. Una persona la usa o la desestima con un motivo. Solo vale lo usado: lo pendiente se
  muestra como «Nexus propone». Entra a Uso de Nexus como un tipo más de lo propuesto.

## Qué no se hace

- No se cambia la carga del equipo (lib/carga): sigue con las reuniones de Meet. Llevarle las otras reuniones y las
  tareas es un paso aparte.
- No se escribe en el calendario, ni se copian los eventos sin Meet a `FirefliesSession`: no son sesiones.
- No se inventan horas: una tarea hecha sin bloque y sin estimado no suma (se cuenta cuántas son).
- No se cambia qué cuenta como ingreso de una cuenta ni el punto de equilibrio: la iniciativa lee su reporte.
  `lib/finanzas/equilibrio.ts` no se toca (otra sesión lo está cambiando); se usan `convertir` y `periodosDelAnio`.
- No se evalúa a nadie: el margen por persona va en orden alfabético y el agente no recibe nombres.
- La lectura no ejecuta nada: propone. Usarla no cambia ningún número.

## Cómo se prueba

- Funciones puras con su prueba: el calendario (las 7 reglas), las tareas, el margen por persona, la meta por año, la
  línea de por facturar, las señales y el contexto del agente (lo que nunca entra).
- Los golden de Finanzas no se tocan.
- SQL `scripts/sql/2026-10-18-rentabilidad-conectada.sql`, aditivo, con RLS y política restrictiva; sin aplicar.
