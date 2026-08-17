# Fase 8 — la medición que va ANTES del código

Medido contra producción el **2026-08-16**. El plan decía, textual: *«antes de sumar tareas, mirar
los 3.185 pendientes vivos con 0,8 % de cierre: si no se resuelve ese circuito, esto crea un tercer
cementerio»*. Esto es esa mirada.

## Los números

| | |
|---|---|
| Pendientes vivos | **3.211** |
| Marcados hechos | **26 (0,8 %)** |
| Borrados / descartados | **1** |
| Sin hacer | **3.185** |
| …de ellos, creados en los últimos 90 días | **3.185 — o sea, TODOS** |

**Por origen:**

| Origen | Vivos | Hechos |
|---|---|---|
| `agent:post-session` | **3.169 (98,7 %)** | 25 (0,8 %) |
| `legacy` | 20 | 0 |
| Secciones del kickoff/handoff | 19 | 0 |
| `manual` | 2 | 1 (50 %) |

**Calidad del dato:** 2.439 tienen dueño · 1.862 tienen fecha · 2.738 tienen proyecto.

**Concentración:** repartidos en 56 clientes. Los cinco más cargados: Smarteam 340 · Grupo Inve 268
· Wherex 234 · Teamnet 210 · AMC 194.

## Qué dicen esos números

**1 · No es un cementerio viejo: es un flujo activo que nunca se cierra.** Los 3.185 sin hacer son
TODOS de los últimos 90 días — no hay ni uno anterior. O sea que el sistema viene generando ~35 por
día y el cierre acumulado es de 26 en total. No se está drenando un pasivo histórico: se está
llenando en tiempo real.

**2 · El problema NO es la calidad del dato.** Tres de cada cuatro tienen dueño, y más de la mitad
tienen fecha. Están bien formados. Tampoco es que no se vean: se leen desde el widget del proyecto
y desde el vigilante de Éxito del cliente, y existe el endpoint para marcarlos hechos.

**3 · Y tampoco es que la gente no cierre nada.** El único origen con cierre real es `manual`: 1 de
2 (50 %). Los que una persona escribió a mano se cierran; los que extrae el agente, no.

**4 · Entonces el problema es de VOLUMEN, y viene de un solo lado.** El 98,7 % sale de
`agent:post-session`, que extrae los «próximos pasos» de cada reunión. A 35 por día, una lista de
340 pendientes en un solo cliente no es una lista de trabajo: es ruido. Y una lista que nadie puede
recorrer no se recorre — que es exactamente lo que muestra el 0,8 %.

## ⛔ Por qué esto frena la fase 8 tal como está escrita

La fase 8 agrega una **segunda** fuente automática de trabajo pendiente (reuniones → tareas del
cronograma). Sobre un circuito donde la primera fuente tiene 0,8 % de cierre, eso no suma capacidad:
duplica el ruido y le quita credibilidad al cronograma, que hoy sí se usa.

El plan ya lo anticipaba con un mínimo — *«que una tarea creada desde una reunión CIERRE el
pendiente que la originó»*—, pero la medición muestra que ese mínimo **no alcanza**: cerrar el
circuito de vuelta arregla la contabilidad, no el volumen. Si el agente sigue emitiendo 35 por día y
solo un puñado se convierte en tarea, los otros 34 siguen ahí.

## La decisión que hay que tomar antes (es de negocio, no técnica)

**¿Qué es un pendiente que vale la pena registrar?** Hoy el agente registra todo lo que suena a
próximo paso. Tres salidas posibles, en orden de esfuerzo:

1. **Subir la vara del agente** — que solo emita compromisos con dueño y fecha explícitos dichos en
   la reunión, y descarte lo demás. Es un cambio de prompt: barato, reversible, y se mide en una
   semana mirando cuántos emite.
2. **Que caduquen solos** — un pendiente sin tocar en N días se archiva con su motivo. No decide
   qué vale: decide que lo que nadie miró en un mes no lo va a mirar nunca.
3. **Aceptar que son notas, no tareas** — renombrarlos y sacarlos de todo contador que pretenda
   accionabilidad. Es la opción honesta si la respuesta es «nunca se van a trabajar uno por uno».

⚠ **Lo que NO se hace mientras tanto:** ninguna limpieza masiva. Borrar 3.185 filas que el equipo
nunca decidió descartar es tomar por ellos una decisión que es suya, y el `deletedAt = 1` dice que
hasta hoy nadie descartó nada a propósito.

## Lo que sí se puede hacer sin esperar la decisión

De la fase 8, el tramo **8.1** es independiente y no suma volumen: hoy la primera generación del
detalle del cronograma escribe las tareas **directo**, sin pasar por la curación que sí tiene todo
el resto. Ese arreglo vale por sí solo y no depende de qué se decida sobre los pendientes.
