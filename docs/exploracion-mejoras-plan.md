# Explorar mejor: preventa y clientes — plan

> Plan del área K del roadmap (`docs/roadmap.md` › «Propuesta por aprobar»). Sale del feedback de Ventas (Marco, Andrés y
> Liz) y de Customer Success (Liliana), entregado el 2026-10-23, y de la nota «SKILL Preparar diagnóstico» de Andrés.
> **Nada construido.** Cada mejora se validó contra el código y la base de producción en solo lectura el 2026-10-23.
>
> **Vale para los dos lugares donde se explora:** la preventa (un prospecto, `projectId` nulo) y la exploración de un
> proyecto de cliente (implementación o SmartLoop). Son el mismo lienzo y las mismas sesiones
> (`lib/exploraciones/`). Cada etapa dice si toca los dos o uno solo.

## Lo que ya está (no se rehace)

- **El equipo del cliente en cada sesión** (23 oct, `lib/exploraciones/equipos.ts`): seis equipos (Dirección, Ventas,
  Marketing, Servicio al cliente, Operaciones, Tecnología), la guía de ese equipo, la hora con «Contarle» y el panel
  «Por equipo». En los dos lugares.
- **La investigación de la empresa** («Radiografía», `radiografia-pedido.ts`): búsqueda web (sitio, noticias,
  industria) y lectura del sitio; guarda sector, modelo de negocio, herramientas e hitos de 18 meses con su enlace.
  Solo en la preventa, y solo si hay empresa en HubSpot.
- **El contexto a mano:** documentos pegados o subidos (fuente M), notas por sesión y por pregunta, e «Instrucciones
  adicionales de la exploración», que van al agente de la guía con más peso. En los dos lugares.
- **Las notas y correos de HubSpot** entran a la preventa como fuentes H (`hubspot.ts`). El proyecto no lee HubSpot.
- **Los ajustes de la guía** quedan guardados por sesión, con quién los hizo (tú, el asistente, «Regenerar»).

## Las mejoras, con su estado y su plan

### K1 · Explorar por departamento, con la escala y el dinero (a medias · los dos)

**Hoy:** los seis equipos existen y la guía se adapta. Falta:
- el equipo **Financiero**;
- un tema de **inversión** por equipo («cuánto invierten, en qué y por qué»): hoy solo hay una repregunta en Marketing y
  el presupuesto con Dirección;
- que **cada tema apunte a las dimensiones de la escala** del área: hoy solo «dónde duele» se cambia por una dimensión;
- en las preguntas de base: telefonía (Tecnología), retención y rotación (Servicio).

**Etapas:**
1. Financiero como séptimo equipo, sin área de la escala por ahora (como Operaciones), con sus temas: cómo se factura y
   se cobra, cierre contra facturado contra cobrado (la distinción de la nota de Andrés), qué reportes usa la gerencia.
2. El tema «inversión» en cada equipo: cuánto, en qué, por qué y cómo saben si vale la pena.
3. Cada tema de un equipo con área dice qué dimensiones de la escala ayuda a ubicar; la guía elige la pregunta que más
   ubica las dimensiones sin evidencia del área.
4. Las preguntas de base que faltan (telefonía, ERP y WhatsApp con sus fallas; retención, tiempos de respuesta y rotación).
5. **Depende del banco de Andrés** (`departamentos.md`): cuando llegue, se contrasta tema por tema con `equipos.ts` y se
   suma lo que falta. Sin el banco se puede hacer todo lo anterior.

### K2 · Prospectos sin contexto: la primera sesión abre la puerta (a medias · solo preventa)

**Hoy:** el modo `desdeCero` se calcula solo (sin test, sin evidencia, primera sesión) y abre con preguntas de conexión.
No se puede marcar un prospecto como **conexión en frío** o **referido**, y no existe una primera sesión para «abrir la
puerta».

**Etapas:**
1. Un dato del prospecto, «Cómo llegó»: test, en frío, referido (con quién refirió), evento. Lo propone Nexus desde el
   origen de HubSpot y lo confirma el consultor.
2. Con «en frío» o «referido» y sin sesiones, la primera sesión es de **abrir la puerta**: 10 minutos para presentar a
   Smarteam con el position statement (K3), 35 para que el cliente cuente lo que le pasa, y unas 3 preguntas al final.
   La preparación lo dice arriba y la guía no trae el plan de diagnóstico.
3. Desde la segunda sesión, la guía de siempre (por equipo o de la empresa).

### K3 · La investigación arma el position statement (a medias · solo preventa)

**Hoy:** la investigación web existe y alimenta la «Hipótesis de valor» y el pitch de «Estrategia de conexión». No busca
contrataciones, y **no existe un position statement de Smarteam** en Nexus.

**Etapas:**
1. El position statement base de Smarteam, escrito una vez y guardado en la configuración (lo escriben Elías y Ventas:
   ver «Lo que decides tú»).
2. La investigación suma las contrataciones (vacantes abiertas como señal de crecimiento o de dolor) y corre también sin
   empresa en HubSpot cuando hay dominio.
3. En «Conexión», el position statement personalizado: el base adaptado con dos o tres hechos de la empresa, cada uno con
   su fuente, para que el consultor llegue mostrando que conoce el negocio.

### K4 · Clientes similares para presentarse (no existe · solo preventa)

**Choque:** «Contarle» prohíbe a propósito nombrar casos de otros clientes (`contarle.ts`). Se resuelve así: la lista
es **solo para el consultor**, en la preparación; nunca sale en un documento para el cliente, y el consultor decide qué
mencionar.

**Etapas:**
1. Desde HubSpot (las empresas con negocio ganado) y Nexus (la industria de cada cliente), los clientes de la misma
   industria del prospecto, con qué se les hizo (el tipo de proyecto o los casos de uso).
2. Se muestra en «Conexión», con un aviso: «Para ti; antes de nombrarlo, confirma que el cliente lo permite».

### K5 · Asociar sesiones solas, con duda cuando la hay (a medias · los dos)

**Hoy:** en un prospecto sin proyecto, toda reunión de la empresa ya entra sola. En un cliente con historia o en la
exploración de un proyecto, solo entra lo que alguien une a mano. Lo agendado se ve en «+ Agregar sesión», con un clic.
Lo que llega solo no aparece sin recargar.

**Etapas:**
1. En un cliente o un proyecto, una reunión del calendario con invitados de la empresa, cuyo título o fecha calza con
   una sesión planeada, se **sugiere** arriba del lienzo: «¿Es la sesión 2 con Marketing?» con «Sí» y «No».
2. Se asocia sola solo cuando no hay duda: la empresa no tiene reuniones de Customer Success en las últimas semanas y el
   título dice exploración, diagnóstico o el nombre de la sesión. Con duda, siempre sugerencia. Nunca cruza clientes
   (pasa por el chokepoint `lib/sessions/project-sources.ts`).
3. El lienzo abierto se pone al día solo cuando entra una sesión (cada minuto mientras está a la vista, o al volver a la
   pestaña).

### K6 · Contexto a mano (existe · los dos)

**Hoy:** documentos, notas e instrucciones adicionales llegan a la guía. Dos detalles que conviene cerrar con K7:
- un documento llega a la guía como el resumen de su lectura (hasta 900 caracteres), no entero;
- una nota suelta, no atada a una sesión, no entra a «Lo que ya sabemos».

**Etapa única:** un botón visible «Agregar algo que sabes» en la preparación (lo que Marco le contó a Liz), que guarda
una nota de la exploración y entra entera a la guía cuando es corta.

### K7 · La siguiente pregunta lógica, de calidad (a medias · solo preventa)

**Hoy:** las notas de HubSpot entran como fuente, pero a la guía llegan de forma indirecta. Lo visto en producción
(Distribuidora Larce): la guía tomaba las opciones marcadas en el test como si el cliente las hubiera dicho («Dijiste
que…») y no había una pregunta que validara el test ni que buscara la causa. «Diagnóstico virtual» no aparece en Nexus:
se asume que es el test en línea que deja la nota «📊 Diagnóstico de Rendimiento» en HubSpot (confirmar con Marco).

**Etapas:**
1. Una respuesta del test es algo **a validar**, no palabra dicha: la guía abre con «En el diagnóstico marcaste…; ¿cómo
   se ve eso en el día a día?».
2. La nota del test y las notas de HubSpot recientes llegan a la guía con su texto, no solo como citas.
3. Cada pregunta de impacto busca la causa, con la secuencia de Andrés (K8).
4. Revisar con Marco cinco guías reales después del cambio.

### K8 · Lo que sirve del método de Andrés (a medias · los dos)

De la nota «SKILL Preparar diagnóstico», lo que entra a los agentes de preparación y exploración, sin copiarla:

| Del método | En Nexus hoy | Qué se suma |
|---|---|---|
| Confirmado, hipótesis y pendiente, con fuente | «Lo que ya sabemos» y lo propuesto contra lo confirmado | Que la guía marque cada pregunta con el vacío o la hipótesis que investiga |
| Recorrer un caso real de punta a punta (responsable, herramienta, datos, tiempos, excepciones, entrega a otra área) | Una pregunta «de punta a punta» por equipo | El caso como columna del tramo «Preguntar», con lo que hay que capturar en cada paso |
| La secuencia para profundizar una fricción: ejemplo → frecuencia → efecto → cómo lo miden → causa → qué falta comprobar → resultado | Pasos situación, impacto y solución | Las repreguntas siguen esa secuencia (K7) |
| Distinguir cifras: trabajando o esperando, contactos o personas, cerrado, facturado o cobrado, reporte deseado o indicador medido; pedir período, fuente y definición | No está | En las instrucciones del agente y en la lectura de la reunión |
| No asumir falta de adopción (puede ser utilidad, jefatura, formación, conectividad, proceso) | No está | En las instrucciones del agente que lee la reunión |
| Evidencia que conviene ver en cada pregunta (reportes, registros; nunca contraseñas) | No está | Un campo «qué pedir que te muestren» por pregunta |
| Cierre: devolver lo entendido, confirmar fricciones, acordar evidencia faltante con responsable y fecha | «Cerrar» y el correo de seguimiento | El cierre propone la evidencia que falta, con responsable |
| Varias áreas: un mapa de entregas entre departamentos | «Por equipo» | Preguntas de contraste entre dos equipos cuando ya hay sesiones de los dos |
| Sin área: un mapa de áreas y sesiones separadas sugeridas | No está | En la primera sesión «de la empresa», sugerir qué sesiones por equipo siguen |
| Agenda de 60 minutos con 20 de caso real | 0–5 abrir · 5–40 preguntar · 40–50 contarle · 50–60 cerrar | Se queda la de Nexus (Ventas pidió «Contarle»); el caso real va dentro de «Preguntar» |

**Depende de dos archivos que todavía no tenemos:**
- **`departamentos.md`** (el banco de preguntas por departamento, con las extensiones financieras y técnicas): K1 etapas 1,
  2 y 5, y la riqueza de las preguntas de base por equipo. Hoy `equipos.ts` tiene un banco propio, armado con la nota de
  Andrés del 9 oct.
- **`aprendizajes-smarteam.md`** (de dónde sale el método y qué tiene evidencia): no bloquea nada; sirve para decidir
  qué preguntas pesan más.
- **El cuestionario de ocho preguntas inspirado en Tecnosagot:** opcional; no se construye sin el original.

### K9 · Aprender de cómo el equipo ajusta las guías (largo plazo · los dos)

**Hoy:** los ajustes se guardan (sumadas, reescritas, quitadas, orden), solo el estado actual, sin historial ni fecha.
La guía original queda en `propuesta.guias`. En producción hay muy pocos (10 sumadas, 9 quitadas, casi todas de CEMACO).

**Etapas:**
1. Guardar cada ajuste con su fecha y la guía de antes (historial), sin cambiar cómo se ve.
2. Cuando haya volumen, un informe mensual: qué preguntas se quitan siempre, cuáles se suman, por equipo.
3. Con eso, ajustar los temas y las instrucciones del agente (a mano primero, después sugerido por Nexus).

### K10 · Los leads del test, por empresa (a medias · preventa y Marketing)

**Hoy:** «Llegaron por el test» ya agrupa por empresa, pero muestra un solo contacto y un área (el último intento). Los
intentos sin empresa en HubSpot se descartan. Los reportes de marketing de Nexus no leen estos leads.

**Etapas:**
1. En la fila de la empresa, quién llenó el test de cada área («Ventas: Sonia · Marketing: Pedro»), con el nombre siempre
   junto a la empresa.
2. Los intentos sin empresa: agrupados por el dominio del correo, con «Crear la empresa en HubSpot».
3. Un reporte de marketing por empresa: cuántas empresas llegaron por el test, con cuántas áreas, y cuántas pasaron a
   preventa.

## Orden

1. K7 y K1 (lo que más pide Ventas para cada sesión), con K8 dentro: las instrucciones del agente se reescriben una vez.
2. K5 (deja de buscar sesiones a mano) y K6.
3. K2 y K3 juntas (la primera sesión en frío necesita el position statement), y K4.
4. K10.
5. K9, cuando haya volumen.
