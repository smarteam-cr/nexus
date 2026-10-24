# Los entregables de Customer Success y sus plantillas — plan

> Áreas I y J del roadmap (`docs/roadmap.md`). Escrito el 2026-10-24 contra el código. **Nada construido**, salvo las
> dos plantillas del diagnóstico (23 oct, `docs/diagnostico-plantillas-plan.md`). J es un ejercicio con Elías; I es lo
> que se programa con lo que salga de J.

## Lo que hay hoy

- **El registro de entregables** (`lib/entregables/registro.ts`, `ENTREGABLES`) dice qué plantillas tiene cada uno, y la
  primera de la lista es la de por defecto. Sumar una plantilla es:
  1. una entrada en ese registro;
  2. su relación con la definición en `lib/entregables/plantillas.ts`.
- **El diagnóstico tiene dos plantillas:**
  - la esencial (recomendada, 7 partes);
  - la completa.
- **La Planificación tiene una sola.** Tiene propiedades, pilotos y rutinas de adopción, y lee las Acciones coherentes
  del diagnóstico; no tiene sesiones ni entrenamientos (L4).
- **El kickoff** tiene su propia plantilla de recurrente pendiente (M1) y dos secciones nuevas pendientes (Q).

## Etapas

1. **J1 · Qué necesita Customer Success para cada entregable** (ejercicio con Elías; va antes de I2).
   - Un chat por entregable: kickoff, diagnóstico, planificación, entrega y adopción.
   - De cada uno sale una tabla:
     - qué información necesita;
     - de dónde sale (una sesión, HubSpot, la escala o la empresa);
     - qué escribe Nexus solo;
     - qué revisa el CSE;
     - cuánto debería tardar con Nexus (la meta de A0).
   - Se guarda en este plan y alimenta las actividades del catálogo (A0): cada entregable es el artefacto que acelera
     una o más actividades.
   - Después, con Caroline: poner al día las tareas de cada cliente (qué se hizo, cuánto tomó y qué sigue según lo
     vendido).
2. **I1 · El selector de plantilla en cada entregable.**
   - El diagnóstico ya lo tiene.
   - Para los demás, la misma forma: una entrada en el registro, su definición, y el registro congelado por prueba.
   - Las plantillas de hoy siguen siendo las de por defecto.
   - Cambiar la plantilla de un documento ya generado queda en «Lo que falta» (preventa y diagnóstico, 3).
3. **I2 · Dos plantillas de Planificación** (con L4).
   - Una esencial y una completa, como el diagnóstico.
   - La sección «Sesiones y entrenamientos» sale de las actividades vendidas cuando existan.
4. **I3 · Plantillas por caso de uso** (depende de A0 y J1).
   - El diagnóstico corto de cada caso: solo las partes que ese caso necesita. Una por caso de aterrizaje primero.

## Criterio de éxito

Cada entregable principal tiene escrito qué necesita, de dónde sale y qué escribe Nexus solo, aprobado por Elías; cada
entregable deja elegir plantilla; hay al menos un diagnóstico corto por caso de aterrizaje.

## Preguntas para Elías

1. ¿Cuándo hacemos el chat por entregable, y empezamos por cuál? Te propongo el kickoff, porque es el primero que ve
   el cliente.
2. ¿Quién del equipo de Customer Success se suma a ese ejercicio: Caroline, Liliana o las dos?
3. ¿Qué entregable debería tardar menos de una hora con Nexus desde ya?

## Riesgos

- Plantillas por caso antes de cerrar el catálogo (A0) se rehacen: I3 espera.
- Muchas plantillas confunden al CSE: siempre una recomendada, a la vista.
