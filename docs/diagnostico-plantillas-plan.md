# El Diagnóstico: todo el contexto, dos plantillas y un documento liviano (2026-10-23)

Pedido de Elías para la sesión de diagnóstico de CEMACO con Customer Success (23 oct). Seis frentes (A–F). Este plan
dice qué se encontró, qué se decide y en qué orden se aplica. Las decisiones quedan además en `docs/DECISIONS.md` ›
«El Diagnóstico: todo el contexto, dos plantillas y un documento liviano».

## Lo que se encontró (medido el 2026-10-23, producción en solo lectura)

`npx tsx scripts/medir-contexto-del-diagnostico.ts --cliente "CEMACO"` (script nuevo, solo lectura).

- **Cemaco Internacional** tiene tres proyectos: «Cemaco Internacional - CRM» (implementación, Sales Hub + Data Hub +
  desarrollo a medida), «CEMACO » (el segundo que llegó de HubSpot el 19 oct, vacío) y el contenedor «Información del
  cliente». El diagnóstico **no está activado** en ninguno.
- **La exploración del proyecto CRM** tiene 5 sesiones (6, 8, 13, 19 y 20 oct), las cinco con su reunión unida (tres
  elegidas a mano, dos por su evento del calendario) y las cinco leídas por el agente. Lo confirmado es mucho: 16 retos,
  11 resultados que persigue, 10 obstáculos, 28 particularidades y 6 niveles de la escala con evidencia. Quedan sin
  decidir 8 particularidades, 10 «no explorado», 1 siguiente paso y 5 criterios.
- **La ficha del cliente no está confirmada** (9 campos propuestos por Nexus). El diagnóstico lee solo la ficha
  confirmada: hoy no le llega nada de la ficha.
- **Los 5 resultados medibles del handoff están sin confirmar**: los objetivos cuantitativos saldrían todos «Por
  validar».
- **Los 2 procesos del cliente son borradores del agente**: el cliente no los validó.
- **Ninguna reunión está elegida en el «Contexto» del diagnóstico.** El mensaje de hoy (49.211 caracteres) dice «SIN
  REUNIONES ELEGIDAS»: **las transcripciones de las cinco sesiones de la exploración no entran**. Le llega solo el
  resumen de cada sesión (lo que leyó el agente), lo confirmado de la exploración, el handoff, los resultados, los
  procesos, el cronograma y la memoria (acuerdos de minutas en borrador, recortados).

Del código:

- `fuentesDelDiagnostico` (lib/canvas/diagnostico-fuentes.ts) lee las reuniones ELEGIDAS enteras. Las de la
  exploración son solo una sugerencia del panel («Usar»): si nadie la toca, no entran.
- `textoDeLaExploracionDelProyecto` manda lo confirmado y no lo que Nexus propuso y nadie decidió.
- La «Política rectora» pinta el aviso «Revisada…» en medio del contenido, en edición; en lectura y en el PDF no sale.
- El subtítulo y la intro de las secciones de prosa (`KickoffProseSection`) no tienen X ni manija. Las intros de las
  secciones propias del diagnóstico y de la planificación, tampoco. Dejan un placeholder vacío que separa el título del
  contenido.
- La portada y el cierre del diagnóstico son `noHide`: no se pueden ocultar.
- Las secciones de prosa son tarjetas blancas anchas en dos columnas, también sobre el fondo oscuro.
- Las plantillas ya existen (lib/entregables/registro.ts, fase 5 del 17 oct): una por entregable, se anota en el Json
  del canvas (`__plantilla`), `/analyze` acepta `plantilla`. Falta la segunda del diagnóstico y el selector. Al
  regenerar sin plantilla se usa «la de siempre», no la del documento.

## Decisiones

### A. El diagnóstico toma todo lo que se sabe

1. **Las reuniones de las sesiones de la exploración entran solas y enteras.** Una reunión unida a una sesión (a mano o
   por su evento) ya la eligió una persona: es la misma regla que usa la sugerencia («Sesión N de la exploración»).
   Salen por el chokepoint (`getProjectMemberSessions`) y la regla pura `reunionesDeLasSesiones`. «Descartar» en el
   panel la saca (`false`). El panel lo dice: «Entran solas al diagnóstico».
2. **Lo que Nexus propuso entra rotulado como supuesto**: los campos propuestos de la ficha (solo los que van al
   cliente, sin la postura de nadie, sin lo marcado interno) y lo que la exploración propuso y nadie decidió (retos,
   resultados, obstáculos y particularidades). Con la regla de siempre: lo supuesto nunca se afirma como hecho.

### B. Avisar cuando casi nada está confirmado

3. **«Antes de generar»**: un resumen de lo que Nexus propuso y nadie confirmó (ficha, resultados del handoff,
   procesos, exploración) con dónde se revisa. Se ve en el diagnóstico vacío (con el selector) y, generado, en una
   franja plegable.
4. **Casi nada confirmado** = de las cuatro piezas que tienen algo, menos de la mitad tienen algo confirmado (o no hay
   ninguna fuente). Con eso, «Generar» (el selector, el botón de arriba y regenerar) pide confirmación: «El diagnóstico
   va a salir de supuestos que nadie validó». El servidor lo vuelve a mirar (`/analyze` responde 409
   `SUPUESTOS_SIN_VALIDAR` sin `aSabiendas`). CEMACO hoy: 1 de 4 → pide confirmación.

### C. «Política rectora» pasa a llamarse «Enfoque de la solución»

5. Cambia todo lo visible (rótulo, eyebrow, avisos, mensajes de presentar, prompts). La clave `politica_rectora` y
   `revisadaAt` no cambian. Los rótulos guardados de los documentos de antes se leen con el nombre nuevo
   (`rotuloVigente`) y el runner los pone al día al regenerar.
6. El aviso de revisión va arriba a la derecha de la sección, compacto, solo en edición. «Volver a sugerencia» pasa a
   **«Dejar que la IA la reescriba»**; sin revisar: **«Marcar como revisado»**.
7. Diseño propio: la pregunta del enfoque justo debajo del título, grande, y los principios numerados.

### D. Todo se mueve y se borra

8. **Piezas de una sección** (`components/landing/partes.tsx`): el subtítulo, la intro y el cuerpo de una sección son
   piezas con manija y X en edición. Quitada, no se pinta ni deja hueco; vuelve con «+ Subtítulo» / «+ Introducción»
   al pie. Una pieza opcional vacía tampoco deja placeholder: se agrega con el mismo botón. El orden y lo quitado viven
   en `data.__partes` (fuera del esquema del agente: sobrevive a regenerar; no cuenta como contenido).
9. Lo usan la prosa (`KickoffProseSection`, todos los documentos) y las secciones del diagnóstico, la ejecución y la
   planificación que tienen intro.
10. Los síntomas, las causas, las consecuencias y los grupos del alcance se arrastran (SortableItems).
11. La portada y el cierre del diagnóstico se pueden ocultar (sin `noHide`). Un enfoque oculto no frena presentar.
12. Las intros se piden cortas: una frase, menos de 25 palabras.

### E. Mejor diseño (contrato §1-WEB: hex literal, claro, PDF sin JS)

13. `SectionDef.diseno` (como `chips` e `invest`, entra por la definición): la prosa del diagnóstico deja las tarjetas
    anchas. «Situación actual» = datos en tres columnas; «Desafío principal» = la pregunta grande y las situaciones
    numeradas; «Fortalezas» = lista con check; «Enfoque de la solución» = principios numerados. Mismo esquema y mismo
    `sectionType`: el chat y los agentes no cambian.

### F. Dos plantillas

14. **Diagnóstico esencial** (liviana, recomendada): Portada · Objetivos · Explicación del problema · Desafío principal ·
    Enfoque de la solución · Acciones coherentes · El siguiente paso. Cuenta por qué el cliente tiene los resultados que
    tiene y qué vamos a hacer. Listas en el mínimo de cada rango.
15. **Diagnóstico completo** (avanzada, id `diagnostico-estrategico`, la de siempre): las quince de hoy. Los
    diagnósticos que ya existen (Wherex) se leen con esta, como hasta hoy.
16. Al abrir un diagnóstico sin generar: el selector (dos tarjetas con radio, dibujo, para qué sirve y «Secciones · N»),
    «Generar con esta plantilla». Regenerar usa la del documento.
17. Con la esencial, el documento tiene solo sus secciones: las vacías de afuera se borran; las que tienen contenido se
    ocultan (nada se pierde). La reconciliación (`ensurePieceCanvas`, `ensureDiagnosticoCanvas`) respeta la plantilla
    del documento.

## Etapas

1. Medición y fuentes (A): script de medición, reuniones de la exploración, propuestas como supuestos.
2. Lo confirmado (B): `lib/canvas/diagnostico-confirmado.ts` (puro, con test) + servidor + ruta + 409 en `/analyze`.
3. Enfoque de la solución (C) y ocultar todo (D.11).
4. Piezas de la sección (D) y diseño (E).
5. Plantillas y selector (F).
6. Tests, tsc, eslint, build, DECISIONS, GLOSSARY.

## SQL

Ninguno: la plantilla vive en el Json del canvas (`__plantilla`), las piezas en el Json del bloque (`__partes`) y la
revisión del enfoque en `revisadaAt`, como hasta hoy.

## Lo que queda fuera

- No se toca la Preventa ni la asociación de una sesión a un equipo del cliente (otra sesión).
- Cambiar la plantilla de un diagnóstico ya generado desde la pantalla: hoy se hace desde el chat
  («documento.generar» con plantilla). Si hace falta un botón, es otra tanda.
- Reordenar filas de tablas (preguntas, equipos): se quitan con la X; arrastrar `<tr>` es otra tanda.
