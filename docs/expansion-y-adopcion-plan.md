# Lo que pide el cliente y la adopción — plan

> Áreas E y F del roadmap (`docs/roadmap.md`). Escrito el 2026-10-24 contra el código y la base en solo lectura.
> **Nada construido.** E convierte lo que pide el cliente en su siguiente caso de uso; F asegura que lo entregado se
> use, que es lo que vuelve recurrente un servicio temporal.

## Lo que hay hoy

**Los pedidos fuera de alcance** (`PedidoFueraDeAlcance`):
- Los propone la lectura de cada reunión, con su cita y quién lo pidió. Un pedido no se repite por cliente.
- **Los decide el CSE:** al confirmarlo, se avisa a la CSL y al dueño en HubSpot
  (`lib/sessions/solicitudes-server.ts`).
- Sus estados: pedido, confirmado, cotizado, aprobado, rechazado, descartado e incluido.
- **En producción, el 24 oct:** 40 sin decidir, 11 descartados, 4 cotizados y 2 aprobados.
- **No hay unión con un caso de uso.** El caso de uso tiene el origen «pedido», pero nada lo escribe y no guarda de qué
  pedido salió. Hoy no hay ningún caso de uso aplicado a un cliente: 0 filas.

**La adopción:**
- En SmartLoop es una etapa del ciclo y un tipo de documento (`cycle-adoption`). Su guía pide el uso diario y los
  hábitos, y el catálogo de servicios tiene una rutina quincenal de adopción.
- El reporte de entrega y el documento del servicio recurrente **no tienen una sección de adopción**.
- La única sección de adopción está en la Planificación: `rutinas_adopcion`.

## Decisiones que ya están

- **En una implementación es «fuera de alcance»: lo acepta o lo descarta el CSE, y la CSL (Alex) siempre revisa lo
  aceptado** (2026-10-24), con dos salidas: es una extensión o necesita a Ventas. En SmartLoop el mismo pedido se llama
  «solicitud» y puede volverse un caso del backlog del cliente.
- **Los avisos de fuera de alcance siguen como avisos** (22 oct): lo único que llega a Tareas es la revisión de la CSL.
- **No se quitan las piezas que vuelven recurrente un servicio temporal:** la adopción es una de ellas.

## Etapas

1. **E1 · Decidir cada pedido.**
   - Etapa 1: decidido el 2026-10-24: **el CSE puede aceptar un pedido o una solicitud, y la CSL siempre la
     revisa.** Al aceptarlo, le nace a la CSL una tarea de revisión. Hoy el CSE ya decide y la CSL solo recibe un
     aviso: falta la tarea. Se escribe en DECISIONS antes del código.
   - Etapa 2: «Volver caso de uso» en una solicitud de SmartLoop. Crea un `CasoDeUso` con origen «pedido», unido al
     pedido por una columna nueva (SQL aditivo, nula), y el pedido pasa a «incluido».
   - Etapa 3: levantar la mano (sumar un pedido a mano) visible donde trabaja el CSE.
   - Etapa 4: los 40 pedidos sin decidir, revisados con la CSL una sola vez.
2. **E2 · Un agente por cliente que une lo que pide con la biblioteca** (depende de A2 y E1).
   - Primero por reglas: los síntomas de cada caso del catálogo contra el texto del pedido, con pruebas.
   - Después con IA y la memoria de la cuenta, medida antes de abrirla.
   - Lo acumulado alimenta el camino de crecimiento del cliente (R12).
3. **F1 · La revisión de adopción en cada caso** (depende de A0 y de Q2, el acceso al portal).
   - Etapa 1: una actividad fija en la etapa de adopción de cada caso: armar en el portal del cliente el reporte de uso
     del equipo y revisarlo con él. Entra al catálogo en el ejercicio A0.
   - Etapa 2: una sección «Adopción» en el reporte de entrega (nueva definición en `entrega.defs.ts`, con su registro
     congelado), que lee las rutinas de la Planificación y lo que dejó la revisión.
   - Etapa 3: la rutina que adoptó el equipo del cliente vive en un solo lugar, `rutinas_adopcion` de la Planificación,
     y el documento de adopción de SmartLoop la lee. No se duplica.
   - Etapa 4 (más adelante): con los portales de los clientes conectados, el uso se lee solo.

## Criterio de éxito

- Cada pedido tiene la decisión del CSE en menos de 5 días hábiles, y la revisión de la CSL en 5 más. Hoy hay 40 sin
  decidir; la meta es 0 con más de 5 días.
- En SmartLoop, al menos un pedido se vuelve un caso del backlog, con su origen guardado.
- Cada caso que termina tiene su revisión de adopción, vista con el cliente.

## Preguntas para Elías

1. ✓ El CSE acepta y la CSL siempre revisa, con una tarea (2026-10-24).
2. Los 40 pedidos que nadie decidió, ¿los revisa Alex en una sola sesión?
3. La revisión de adopción, ¿es una sesión con el cliente, o un reporte que el CSE manda y comenta?
4. ¿Qué cuenta como «adoptado»: que el equipo entre a HubSpot, o que use lo que se le configuró (por ejemplo, que
   registre los motivos de pérdida)?

## Riesgos

- Sin el acceso al portal (Q2) no hay reporte de uso: F1 espera a Q2.
- Un agente que sugiere casos sin reglas probadas puede proponer cosas que no se venden: primero reglas, después IA.
