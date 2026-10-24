# Los tests del Diagnóstico de Rendimiento, dentro de Nexus — plan

> Pedido de Elías del 2026-10-23: migrar a Nexus el test público de cada departamento, con mejores preguntas,
> personalizadas por industria, y una página de resultados más atinada con la escala nueva. **Nada construido.** En el
> roadmap es el área O. El diagnóstico de la aplicación de hoy se hizo el 2026-10-23 sobre una copia de lo publicado, en
> solo lectura.

## Lo que hay hoy

**La aplicación** (`dev.smarteamcr.com/diagnostico-rendimiento`, en el VPS, en `/var/www/dev.smarteamcr.com/`):
- Es estática, de HTML y JavaScript sin build, con un backend aparte en Vercel (`escala-diagnostico.vercel.app`) para la
  IA y la nota en HubSpot.
- **El flujo:**
  - un formulario con nombre, correo de trabajo, dominio, teléfono, puesto e industria (52 opciones);
  - elegir un área (Ventas, Marketing o Servicio);
  - 8 preguntas, una por dimensión, con un «matiz» opcional;
  - el resultado.
- **No pregunta** el tamaño, el país ni el perfil de negocio. La industria solo se le pasa a la IA como contexto.
- **El banco usa la escala vieja (v4):**
  - un solo banco por área, sin industria ni perfil;
  - cada opción es un nivel;
  - las áreas se numeran distinto (7, 8 y 9);
  - la producción lleva los nombres «Loop» (Express, Tailor, Amplify, Evolve), que la escala de hoy marca como escala vieja;
  - en tres dimensiones no se puede elegir Funcional, cuando la escala de hoy dice que todas tienen los cinco niveles.
- **El puntaje:** el nivel de la capa es el de su dimensión más débil, y la IA mueve el puntaje dentro de la banda. La
  escala de hoy pone cada dimensión en la mitad de su banda y calcula la capa como promedio.
- **El resultado** sale entero de la URL, comprimido. Muestra:
  - el nivel, la curva de cinco niveles, el radar de ocho ejes y las barras;
  - «Para llegar a Funcional», fortalezas y recomendaciones de la IA;
  - la agenda para una sesión de 30 minutos.

  No habla de casos de uso, ni de riesgos, ni de una sola recomendación.
- **HubSpot:**
  - el formulario nativo crea el contacto y la empresa (industria y dominio);
  - el backend deja una nota y la dirección del resultado en el contacto (`url_ultimo_diag_sales|marketing|service`);
  - no hay secretos expuestos.

**En Nexus ya existe la mitad del motor:**
- **El cuestionario de la escala** (`lib/cuestionario/escala.ts`, `escala-armado.ts`):
  - se arma solo desde la escala publicada, con la edición de la industria y el perfil de negocio;
  - el nivel lo calcula Nexus con el chequeo (`lib/escala/chequeo.ts`), no la IA;
  - el cliente nunca ve identificadores ni nombres de nivel.

  Hoy solo se usa con clientes de un proyecto, por enlace.
- **«Llegaron por el test»** y la preventa leen el resultado del test desde la dirección guardada en HubSpot
  (`lib/exploraciones/test-de-marketing.ts`) y lo traducen de la v4 a la escala de hoy.

## Decisiones

- **Un solo motor.** El test público usa el mismo armado y el mismo chequeo que el cuestionario del cliente. Cuando se
  publique la 9.0, el test la toma solo, sin tocar código.
- **Las preguntas se escriben para el cliente,** no son la descripción del nivel. Una o dos por dimensión, en su idioma,
  con «No lo sé» (que cuenta como el nivel más bajo). Cada opción sigue apuntando a un nivel, solo del lado nuestro.
- **La industria elige la edición.** Con la industria, el test usa las palabras, las preguntas y los criterios de su
  edición (Ecommerce y retail, Banca, Educación, Inmobiliaria, Turismo, Automotriz), y la escala general si no tiene.
- **El perfil se pregunta corto:** cómo cierra la venta y qué pasa después (las dos preguntas de la escala), y el tráfico
  de su sitio (la condición nueva de la 9.0, N4). Lo que no aplica a su perfil no se pregunta.
- **El resultado lo calcula Nexus; la IA solo lo escribe.** El nivel y el puntaje salen del chequeo. La IA redacta la
  síntesis con lo que respondió la persona, sin mover números.
- **Todo se guarda en Nexus.** La respuesta y el resultado quedan en la base, unidos a la empresa. HubSpot recibe lo mismo
  que hoy, para no romper la preventa ni Marketing.
- **Es una página del cliente:** tema claro, en tuteo, sin el sistema interno. Se reusan el radar, la curva y el
  formulario de la aplicación de hoy.

## Etapas

1. **O1 · El test dentro de Nexus.**
   - Una ruta pública por área, sin sesión y con protección contra abuso.
   - El mismo armado del cuestionario, sin proyecto: la persona y su empresa (prospecto).
   - Una tabla nueva para guardar cada intento, con SQL aditivo.
   - Se mantiene la experiencia de hoy: una pregunta por pantalla, el matiz, el guardado al avanzar y el aviso de abandono.
2. **O2 · Mejores preguntas, por industria.**
   - Una pregunta por dimensión en la web, escrita para el cliente, con su versión por edición (las de Marketing esperan
     «Lo que decides tú» 29 del roadmap).
   - Las dos preguntas del perfil y la del tráfico.
   - Nunca se veta un nivel.
   - Las revisa Elías antes de publicarlas.
3. **O3 · La página de resultados.**
   - El chequeo de la escala de hoy: cada dimensión a mitad de su banda, la capa y el área como promedio, y «estimado».
   - Los riesgos activos, el costo de quedarse y **una sola recomendación** con su razón.
   - Los casos de uso que la mueven (la regla de aterrizaje y expansión, `lib/casos-de-uso/camino.ts`), sin precio.
   - La lectura «Preparación para engagement avanzado» cuando aplica (N6).
   - La síntesis escrita por la IA.
   - La invitación a la sesión.
4. **O4 · HubSpot y la preventa.**
   - El formulario nativo (contacto y empresa), la nota y la dirección del resultado, como hoy.
   - Además, el resultado entra directo a la preventa de la empresa en Nexus, sin decodificar la dirección.
   - Las respuestas del test llegan a la guía como algo a validar (K7).
   - Los leads, agrupados por empresa con quién llenó cada área (K10).
5. **O5 · Tres versiones del test** (Elías, 2026-10-24; el detalle, abajo en «Las versiones del test»):
   - la de Marketing, de 4 preguntas, para conseguir el lead;
   - la web, de 8, una por dimensión;
   - la completa, que llena el consultor, por equipo (la del cuestionario).
   - De dónde salen las 4 de Marketing y dónde va el perfil corto es «Lo que decides tú» 29 del roadmap.
6. **O6 · El corte.**
   - Los enlaces viejos (`resultado.html#…`, `v:1`) se siguen leyendo.
   - La dirección pública pasa a Nexus, con los píxeles de anuncios y el formulario de HubSpot intactos.
   - Se mide cuántos empiezan, cuántos abandonan y en qué pregunta, y cuántos terminan.
   - Se apagan el backend de Vercel y la página estática.

## Las versiones del test (Elías, 2026-10-24)

1. **La de Marketing:** 4 preguntas fáciles de responder, para conseguir el lead.
2. **La web:** 8 preguntas, una por dimensión. La usan Marketing y Ventas para conseguir la primera reunión.
3. **La completa:** la llena el consultor de Customer Success en la exploración profunda, según el caso de uso o en
   una exploración general. **Va por equipo:** la escala ubica a un equipo, así que una empresa puede tener varias
   (Ventas, servicio, Customer Success, sus clientes).

Las preguntas las revisa Elías, y el equipo opina al usarlas.

## Depende de

- **N1 (publicar la 8.9.1):** el test arranca con la escala publicada y toma la 9.0 sola cuando salga.
- **N4 (la condición de tráfico)** para la pregunta del tráfico, y **B1 (los datos de la empresa)** para guardar el perfil y
  llevarlo a HubSpot.
- **K7 y K10** usan lo que deja el test.

## Lo que no entra

- Cambiar la escala: el test la lee, no la define.
- Un test de Dirección, Operaciones, Tecnología o Financiero: la escala solo mide Ventas, Marketing y Servicio.
