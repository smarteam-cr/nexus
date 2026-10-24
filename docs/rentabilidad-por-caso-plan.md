# Horas, rentabilidad y capacidad por caso de uso — plan

> Área G del roadmap (`docs/roadmap.md`). Escrito el 2026-10-24 contra el código y la base en solo lectura. **Nada
> construido.** Sigue a `docs/rentabilidad-y-carga-plan.md` (el rediseño del 7 oct, ya en producción) y a
> `docs/actividades-plan.md` (los dos tiempos de cada actividad).

## Lo que hay hoy

- **El margen** (`lib/rentabilidad/margen.ts`) es lo facturado menos el costo de las horas reales, con tres formas de
  costear: por persona, por equipo y cargado.
  - Las horas reales son las reuniones del calendario, la preparación y el trabajo del cronograma. Para ese trabajo se
    usa la respuesta de «¿cuánto te tomó?» si existe, y la estimación si no.
  - Las horas planeadas son las del cronograma, no las vendidas.
- **La carga del CSE** (`lib/carga/entrega.ts`): cada tarea «Smarteam» del cronograma cuenta las horas de su tipo de
  fase, por el factor de complejidad de la cuenta. «Ambos» cuenta la mitad. Las horas por defecto están en
  `lib/carga/config.ts`:

  | Tipo de fase | Horas por tarea |
  |---|---|
  | Configuración | 2 |
  | Planificación | 1,5 |
  | Exploración | 1 |
  | Adopción | 1 |
  | Seguimiento | 0,5 |
  | Sin tipo | 1,5 |

- **«¿Cuánto te tomó?»** (`PreguntaDeTiempo`) existe, pero **nunca se prendió**: no hay ninguna encuesta activa y hay 0
  preguntas en producción (24 oct).
- **Ni las tareas ni lo vendido saben de qué actividad o caso son.** Por eso hoy no se puede medir por caso.

## Decisiones que ya están

- **Para el precio cuenta lo que debería durar** (el tiempo a mano); **para la rentabilidad, lo que de verdad duró**,
  al costo de la planilla.
- **Las sesiones se miden solas** con el calendario de Google.
- **La capacidad no se mide en número de casos**, sino en horas.

## Etapas

1. **G0 · Prender «¿cuánto te tomó?»** (ya, sin depender de nada).
   - Activar el momento «tarea hecha» para un grupo chico (Elías y un CSE). Es la única fuente del tiempo real del
     trabajo que no es una reunión.
   - Medir cuántas se responden en dos semanas antes de abrirlo a todos.
2. **G1 · Tiempo estimado y real por tarea** (va con D2).
   - Lo estimado sale de la actividad (sus minutos a mano). Lo real sale, en este orden:
     1. la duración de la reunión, si la tarea es una sesión;
     2. el bloque que la persona agendó desde Tareas;
     3. «¿cuánto te tomó?».
   - Una función pura con sus pruebas decide qué fuente usar; la pantalla solo muestra.
3. **G2 · Rentabilidad por caso** (depende de G1 y C2).
   - Lo estimado contra lo real por caso, al lado de lo que se cobró por ese caso (lo vendido congelado de C2), al
     costo de la planilla.
   - Mientras no haya datos, cada estimación dice cuánto riesgo de rentabilidad asume.
   - Las tareas de gestión del cliente (seguimientos, preparar sesiones) se miden aparte, como el costo de servir la
     cuenta (decisión 11 pendiente).
4. **G3 · La capacidad con las horas de las actividades** (depende de A2).
   - La carga usa las horas de cada actividad vendida; el promedio por tipo de fase queda solo de respaldo para los
     proyectos de antes del corte.
   - Calibrar con kölbi y FACO, los primeros datos reales de recurrencia.

## Criterio de éxito

- Por cada caso entregado: lo estimado contra lo real y su margen, con datos de al menos dos proyectos.
- La carga de cada CSE en horas de actividades.
- «¿Cuánto te tomó?» con al menos la mitad de las preguntas respondidas.

## Preguntas para Elías

1. ¿Prendemos «¿cuánto te tomó?» ya, contigo y con un CSE?
2. ¿Se pregunta en toda tarea, o solo en las que salen de lo vendido?
3. Las tareas de gestión del cliente, ¿se cobran o solo se miden? («Lo que decides tú» 11)
4. ¿Quién ve la rentabilidad por caso: solo los super admin, o también la CSL?

## Riesgos

- Sin respuestas a «¿cuánto te tomó?» la rentabilidad mide solo reuniones y se ve mejor de lo que es: G0 va primero
  y se mide.
- Pedir el tiempo de cada tarea cansa: se pregunta poco, en el momento, y nunca se bloquea nada por no responder.
