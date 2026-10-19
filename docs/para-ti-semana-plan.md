# «Para ti»: planificar el fin de semana y la agenda en semana (validación 9, 2026-10-18)

Elías lo quiso validar un domingo y no pudo: la invitación a planificar salía solo los viernes y la agenda abría en el
día (un domingo, el lunes que viene).

## 1. La invitación sale de viernes a domingo

- Regla pura `invitacionAPlanificar(hoyISO)` en `lib/mi-dia/planificar.ts`, al lado de `semanaAPlanificar` (que ya
  planifica la semana que viene desde el viernes). Devuelve el título o `null`, con el día de Costa Rica (`hoyISO` ya
  viene en hora de Costa Rica).
  - viernes: «Es viernes: planifica la semana que viene»
  - sábado: «Es sábado: planifica la semana que viene»
  - domingo: «Mañana empieza la semana: planifícala»
  - lunes a jueves: `null`.
- `InicioDelDia.tsx` la usa en vez de `esViernes`. Sigue siendo para CSE, CSL y Desarrollo (`conCuentas`) y lleva a
  `/tareas/planificar`.
- Prueba: los siete días de una semana.

## 2. La agenda abre en semana

- Hoy la vista sale de la dirección (`?agenda=semana`); no hay nada guardado por persona. El defecto pasa a ser la
  semana: sin `?agenda`, semana; `?agenda=dia`, día. `agenda-navegable.ts` escribe `agenda=dia` al pasar a día y lo
  borra al volver a semana. Los enlaces viejos con `?agenda=semana` siguen abriendo la semana.
- En fin de semana ya se muestra la semana que viene (`diaDeEntradaDeLaAgenda`): no cambia.
- Lo que dependía de abrir en el día:
  - «Con qué avanzar» (los huecos libres de hoy) se pintaba solo en la vista de día. Pasa a pintarse también en la
    columna de hoy de la semana. Si no, el defecto nuevo lo escondía.
  - La página pedía aparte la agenda de hoy cuando la vista no era el día de hoy (para los números, el resumen y la
    reunión que se abre sola). Con la semana de hoy en pantalla, lo de hoy sale de esa misma semana: no se lee el
    calendario dos veces en cada visita.
- Pruebas: el defecto de la vista (`vistaPedidaDeLaAgenda`) y sacar lo de hoy de la semana (`reunionesDelDia`).

## Lo demás

- DECISIONS «La semana: agenda por cuenta y "Planifica tu semana"»: la invitación de viernes a domingo y la agenda en
  semana por defecto.
- No hay recorrido de «Para ti» en `lib/recorridos`: no hay nada que actualizar.
- Sin SQL.
