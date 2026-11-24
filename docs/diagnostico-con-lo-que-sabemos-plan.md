# La página de La escala para un cliente, con lo que ya sabemos — plan

> Planificado el 2026-11-24 con Elías, en una sesión aparte. Lo ejecuta la conversación de North Star | Nexus.
> Estado: **diagnóstico hecho; D1–D4 decididas por Elías el 2026-11-24 (lo recomendado)**. Nada construido. Se empieza
> por la etapa 0.
>
> **Elías, 24 nov (más tarde):** «ejecútalo de forma autónoma hasta el final para poder ver esto en producción. Yo sé que
> el plan habla de probar en local, pero mandémoslo a producción». La etapa 0 se hace como simulacro de solo lectura
> contra producción, sin base local y sin frenar la construcción.

## Qué se quiere

Armar la página de La escala (el Resumen y la página de cada área, la que ve el cliente) para **cualquier empresa**:

- un prospecto con preventa y sesiones de exploración (esto ya funciona: Tecnosagot);
- un cliente que tuvo sesiones de exploración;
- **un cliente sin sesiones de exploración pero con reuniones de entrega** (el caso de hoy: TEC · AE y TEC · TAE).

El flujo: en la preventa del cliente, «rellenar con lo que ya sabemos» y sacar una **primera versión** (MVP) del
diagnóstico. Después, si se hacen una o dos sesiones de exploración, se suman y se mejora o se rehace, sin perder lo
editado a mano. Al final se publica al cliente con «Acceso».

No es la escala general de Nexus (Escala › …). Es la página de resultados de la preventa
(`components/exploraciones/PaginaDeLaEscala.tsx`).

## Diagnóstico: cómo funciona hoy

Una escala es una fila de `ExploracionDeVenta` (DECISIONS «Una sola escala», 2026-10-28). Para un cliente hay dos
lugares donde puede vivir. Cada uno tiene la mitad de lo que hace falta.

| | **Preventa** del cliente (`projectId` null) | **La escala de la cuenta** (ficha › La escala, contenedor «Información del cliente») |
|---|---|---|
| Se puede abrir para un cliente | Sí: Preventa › «Planificar» (`app/api/sales/exploraciones/route.ts`). No hay filtro por prospecto. Una viva por ficha | Sí, se abre sola desde la ficha |
| Qué lee el agente para ubicar | «Ubicar con las reuniones» (`agente.ts › posicionarLaEscala`): **solo** la transcripción de SUS sesiones (4 de 40.000 caracteres), más memoria, ventas, propuestas, tareas y HubSpot | «Actualizar escala»: el **resumen** de las 8 reuniones más recientes de la empresa (entregas incluidas, 3.000 caracteres cada una), la memoria, las tareas, las ventas y, si se elige un proyecto de contexto, su handoff, cuestionarios y cronograma (`posicionar-fuentes.ts:108`) |
| Sin sesiones de exploración | **Falla**: «Ninguna sesión de esta preventa tiene transcripción o notas todavía» (`agente.ts:682`) | Funciona |
| Hipótesis y tarjetas por dimensión | Sí | No: solo niveles con cita |
| Resumen para el cliente | Sí, con las transcripciones de sus sesiones (`resumen-de-la-escala-server.ts:367`) | **No**: la cuenta no tiene sesiones, da 409 |
| «Cuánto pierde», notas, «Lo que hicimos» | Sí | No |
| Publicar / Acceso | Sí | Sí |
| Reuniones que entran solas | Solo en la preventa de un **prospecto** (`fuentes.ts:386`). En un cliente, solo las que alguien suma como sesión | — |

Lo que ya sirve:

- **Una reunión de entrega se puede sumar a mano a la preventa** como «sesión que ya pasó» (`…/[id]/sesiones`, por el
  chokepoint). Con eso ya funcionan «Ubicar», el Resumen y Publicar. Es el camino de hoy, sin código.
- **Mejorar después ya funciona**: «Ubicar» de nuevo nunca pisa un nivel confirmado; si ve otro, lo propone con su
  porqué (`contenido.ts:999`). «Rehacer con IA» respeta lo escrito y lo quitado a mano (`juntarConLoEditado`) y deja el
  anterior en el historial. Lo publicado no cambia hasta que alguien aprieta «Publicar».
- **Lo confirmado es lo único que ve el cliente** (`escala-para-el-cliente.ts:139`).

Lo que falta o sale mal:

1. **La preventa de un cliente no sabe «rellenar con lo que ya sabemos».** Sin sesiones no ubica nada, y con sesiones no
   lee las reuniones de entrega, el handoff ni los cuestionarios del proyecto.
2. **Sumar reuniones de entrega como sesiones engaña al cliente.** La página dice cuántas sesiones se hicieron
   («Así entendimos tu negocio»): las capacitaciones y revisiones de avance contarían como exploración.
3. **Muchas reuniones de entrega se leen mal.** El Resumen marca «mal leída» la reunión donde la empresa habla menos del
   28 % (`PARTE_MINIMA_DEL_CLIENTE`, `resumen-de-la-escala.ts:501`). En una capacitación habla sobre todo Smarteam.
   Hay que elegir bien cuáles; hoy nadie las sugiere.
4. **TI no entra.** La preventa ubica solo Ventas, Marketing y Servicio (`areas-en-prueba.ts`, decisión del 19 nov:
   TI «primero solo en La escala»).
5. **Detalles menores**: el mensaje del 409 dice «esta preventa» aunque estés en la cuenta. El campo `posicionar: true`
   de `app/api/clients/[id]/escala/route.ts:41` no lo lee nadie.

### Los datos del TEC (producción, solo lectura, 24 nov)

- **TEC · AE**: cliente, sin empresa de HubSpot (comparte el dominio de TAE). Proyecto «AE | SMARTLOOP» en Adopción.
  92 reuniones, **31 con transcripción**. Ya tiene **una preventa viva** (abierta el 21 oct por Alex, antes de separar
  el TEC): edición Educación, **sin áreas, sin sesiones, sin niveles confirmados**, sin Acceso. Su primera preparación
  leyó reuniones de HubSpot de TAE, porque entonces eran una sola ficha. Elías la tocó el 24 nov (usó 11 casillas).
- **TEC · TAE**: cliente, con la empresa de HubSpot del ITCR. Proyecto «TAE | SMARTLOOP» en Adopción. 131 reuniones,
  **41 con transcripción** (muchas «Capacitación de ventas» sin texto). **No tiene ninguna exploración**: ni preventa ni
  escala de la cuenta.
- Referencia de una preventa completa: **Tecnosagot** (prospecto, 4 reuniones con texto, publicada el 21 nov).

## La propuesta (con D1 = la preventa)

La idea: **la preventa de un cliente parte de lo que ya sabemos**. Las reuniones de entrega entran como base, separadas
de las sesiones de exploración. Todo lo demás (Resumen, descripciones, historial, Acceso, Publicar) se reusa como está.

### Etapa 0 · Probar el camino de hoy con AE, en la base local (sin código)

Para ver la calidad antes de programar.

1. `npm run db:local:pull -- --client "TEC · AE,TEC · TAE" --apply`.
2. En el 3005, en la preventa de AE: elegir áreas, sumar 3–4 reuniones de entrega con texto como sesiones (cada una
   con su equipo), «Ubicar», usar lo propuesto, elegir los equipos en «Acceso» y «Armar el Resumen con IA».
3. Anotar qué sale mal: qué dimensiones quedan sin nivel, qué reuniones salen «mal leídas» y qué dice «Lo que hicimos».

Sale con una lista corta de lo que la etapa 1 tiene que arreglar sí o sí.

### Etapa 1 · «Ubicar con lo que ya sabemos» en la preventa de un cliente

- En `posicionarLaEscala` (`lib/exploraciones/agente.ts:664`), en la preventa de una ficha que **no es prospecto**:
  - si no hay sesiones con texto, en vez de fallar, lee como la cuenta: `reunionesEnResumen` de la empresa, la memoria
    y, si se elige, el proyecto de contexto (handoff, cuestionarios, cronograma). Reusar `fuentesParaPosicionar` sin
    `reuniones` y con `proyectoDeContexto`;
  - si hay sesiones, lee las dos cosas: sus transcripciones primero (pesan más) y la base en resumen.
- Mantiene hipótesis y tarjetas (son de la preventa). La regla «sin una pista del cliente no hay nivel» no cambia.
- Botón: «Ubicar con lo que ya sabemos» mientras no haya sesiones de exploración. Con sesiones, el de siempre.
- Selector «Con el contexto de» (proyecto), el mismo de la ficha (`EscalaDeLaCuenta.tsx`).
- Prueba: con AE en local, ubica las tres áreas sin ninguna sesión y cada nivel trae su cita.

### Etapa 2 · Reuniones de entrega como base, no como sesiones

- Una sesión sumada a mano puede marcarse como **«de lo que ya sabemos»** (un campo en la sesión de `contenido`, sin SQL).
  Cuenta para «Ubicar» y para el Resumen igual que una sesión, con su equipo. **No cuenta** como sesión de exploración
  en la página del cliente: «Lo que hicimos» la nombra aparte (copy: ver D4).
- **Nexus sugiere cuáles**: las reuniones con texto de la empresa, ordenadas por cuánto habla el cliente (la misma
  medida del 28 %), por equipo y por fecha. Se eligen con un clic al «Agregar sesión › Una que ya pasó».
- Prueba: el Resumen de AE se arma solo con reuniones de entrega y «Lo que hicimos» no dice «N sesiones de exploración».

### Etapa 3 · Mejorar al sumar sesiones de exploración

Casi todo ya existe. Falta:

- que el aviso «Hay N reuniones nuevas» de la línea de la escala (`linea-de-la-escala.ts:99`) cuente también las
  sesiones de exploración nuevas sobre una base de entrega;
- que el Resumen, al rehacerse, dé más peso a las sesiones de exploración que a la base, y que «Lo que hicimos» sume
  las dos;
- una prueba de punta a punta: base → publicar → sesión de exploración → ubicar → rehacer → publicar, sin perder lo
  editado a mano.

### Etapa 4 · Que la ficha vea lo mismo (después, si hace falta)

Hoy la escala de la cuenta copia la de la preventa solo si la cuenta no midió nada (`punto-de-partida.ts`). TAE nunca
midió, así que la tomaría bien. Juntar las dos escalas de una vez es otro tema (DECISIONS «Una sola escala»): no entra
aquí.

## Decisiones de Elías (2026-11-24: lo recomendado en las cuatro)

- **D1 · Dónde vive el diagnóstico de un cliente: en la preventa de cada ficha.** Tiene Resumen, hipótesis y Acceso;
  solo le falta leer lo que ya sabemos. *Se descartó* darle sesiones y Resumen a la escala de la cuenta: contradice
  DECISIONS «la cuenta no tiene sesiones».
- **D2 · La preventa vieja de AE se usa**, revisando lo que propuso (la armaron con reuniones de TAE, antes de separar
  el TEC). No se archiva.
- **D3 · TI queda fuera** de la preventa, como dice la decisión del 19 nov.
- **D4 · «Lo que hicimos» dice «N reuniones de trabajo juntos y N sesiones de diagnóstico»**: las de entrega nunca se
  presentan como exploración.

## Reglas que no se tocan

- Invariante 1: toda reunión entra por `lib/sessions/project-sources.ts`. AE y TAE son dos fichas: nunca se mezclan
  sus reuniones (DECISIONS «Dos fichas que comparten dominio»).
- Nada de un cliente real cambia en producción sin avisarle antes a Elías. Las etapas se prueban en `nexus_local`.
- Lo confirmado nunca lo pisa el agente; lo propuesto se usa a mano.
- Antes de cambiar el comportamiento, corregir en DECISIONS la sección de la preventa que corresponda.

## Para el roadmap

Iniciativa nueva: «La escala de un cliente con lo que ya sabemos» (etapas 0 a 3). La pide el TEC (AE y TAE). Prueba
final: la preventa de AE, sin sesiones de exploración, publica un Resumen y la página de cada área; después de una
sesión de exploración, se rehace y se vuelve a publicar sin perder lo editado.
