# Las reuniones, la pieza angular del contexto — plan

> Elías, 2026-10-23: «el módulo que obtiene las sesiones es de lo más importante de Nexus: es el creador de contexto de
> cada empresa, la pieza angular». Este plan junta en un solo lugar todo lo que hace que una reunión llegue completa a su
> empresa y se lea. Medido en producción en solo lectura el mismo día. **Nada construido de este plan**, pero hay piezas
> que ya existen a medias: la lectura de hechos de las reuniones con solo notas (T2), el motivo de las que no tienen
> texto en `lib/google/por-que-falta.ts` (T4) y la reunión agregada a mano (`lib/sessions/reunion-a-mano.ts`, T9). En
> el roadmap es el área T.

## Lo que se midió (últimos 90 días)

| Qué | Cuántas |
|---|---|
| Reuniones en total | 2.020 |
| Con una empresa dueña | 1.264 |
| De esas, con transcripción | 545 (43 %) |
| De esas, solo con notas de Gemini | **301 (24 %)**: Nexus las trata como sin texto |
| De esas, sin nada (de hace más de 2 días) | 404 (32 %) |
| Sin empresa dueña y con invitados de fuera | 121 |
| De esas, con texto | **67**: contexto que no llega a ninguna empresa |
| De esas, con el dominio de una empresa de Nexus | 0: son empresas que Nexus no tiene, aliados o correos personales |

**El caso de Camosa (23 oct) está bien en todo el camino:**
- La reunión es de CAMOSA (por `camosa.com`) y tiene transcripción completa.
- La preventa la unió a su sesión 1 y su agente la leyó.
- También se leyó para tareas.
- La organizó Liz Navarro, y Marco y Andrés fueron invitados: hoy Nexus solo guarda al organizador como «de quién es».

**El caso de Liliana, resuelto el 2026-10-24:** era «Cemaco | Data Hub» del 22 oct, organizada por ella. Está en
Cemaco y unida a sus proyectos, pero sin texto. La API de Meet dice que ocurrió (de 8:58 a 9:46, con 7 personas) y que
no hubo transcripción ni notas: nadie las activó. Además, Nexus la guarda a la hora del evento (3 de la tarde) y no a
la real; U3 lo corrige con la hora de la conferencia. De ahí nace T9: que la persona aporte el contexto.

## Decisiones

- **Una reunión llega completa o avisa por qué no.** Cada reunión con alguien de fuera tiene que terminar en uno de estos
  estados, a la vista:
  - leída, con su empresa;
  - sin texto, con el motivo;
  - sin empresa, esperando que alguien decida.
- **Las notas de Gemini cuentan como texto:** se leen igual, marcadas «solo notas».
- **Ninguna reunión con texto queda sin empresa en silencio:** Nexus propone a qué empresa va (por el dominio, el título o
  HubSpot) o crea el prospecto desde HubSpot. Una persona confirma.
- **Una reunión presencial también entra:** se sube la grabación o el texto, y Nexus la toma como cualquier otra. Para el
  audio hace falta un servicio de transcripción, que hoy Nexus no tiene.
- **La reunión dice quiénes de Smarteam estuvieron,** no solo quién la organizó: sirve al analizador de venta, a la carga
  de cada persona y a «Para ti».
- **Sigue la invariante de siempre:** cada reunión tiene un solo dueño y todo lee por el chokepoint
  (`lib/sessions/project-sources.ts`).

## Etapas

1. **T1 · El tablero de salud de las reuniones.**
   - Por persona y por empresa: con transcripción, solo notas, sin nada (con el motivo, desde el primer día) y sin
     empresa; leídas o no.
   - Una invariante nueva en `check:invariants`, INV47: ninguna reunión **de los últimos 14 días** con texto e invitados
     de fuera sin empresa por más de 48 horas (la ventana, como INV44). Si al nacer cuenta alguna, entra como «no
     bloquea» (el patrón de INV4, INV6 e INV13) hasta su primer verde. Las 67 de antes las resuelve T3.
   - Pruebas: un `*.int.test.ts` (una reunión de 3 días da rojo, una de 30 no). Entra a `invariants-daily`.
   - Lo ve la CSL y los super admin; cada persona ve las suyas. El tablero lleva gate de permiso y va declarado en
     `skeleton-coverage` y `page-shell-coverage`.
2. **T2 · Las notas de Gemini cuentan** (antes L1).
   - Hoy: la lectura ya toma las reuniones con solo notas de 400 caracteres o más cuando `SEGUIMIENTO_HECHOS=1` está
     prendida (lo está: 581 hechos, 153 sacados de notas), pero solo saca hechos, no minuta ni tareas
     (`motivoParaNoEncolar`, `lib/lecturas/reglas.ts`).
   - T2 suma la minuta y separa «lee solo notas» con su propia bandera, que también es la vuelta atrás.
   - Un predicado único «tiene texto» en `lib/sessions/` reemplaza los ~10 filtros `transcript: { not: null }`
     sueltos; T1 usa el mismo. El buscador deja de decir «sin transcripción» cuando hay notas.
   - Las de más de 14 días van por el modo de recuperación («Cómo se trae lo que ya existe»).
   - **Antes de contar las notas como texto:** verificar «Cemaco | Data Hub» del 22 oct. Tiene 8.336 caracteres de
     notas que la API de Meet dice que no generó, y puede ser texto de otra reunión de la misma serie (KNOWN-ERRORS,
     primera entrada).
   - Prueba: unit de `motivoParaNoEncolar` con notas sobre y bajo el piso.
3. **T3 · Las 67 reuniones sin empresa:** Nexus propone la empresa, o crea el prospecto desde la empresa de HubSpot del
   dominio. Lo decide quien la organizó, con un clic (2026-10-24). *Depende de:* R7.
   - La propuesta reusa las piezas de `categorize.ts` (`extractParticipantDomains`, `buildHubspotDomainMap`), sin un
     matching nuevo.
   - Confirmar escribe `manualClientId` con `manualClientSource = humano` por `reResolveSession`. Lo mismo vale para
     «Mover a esta empresa» de T8.
   - Una reunión de más de 14 días no se lee sola: va por el modo de recuperación.
   - Un escaneo estructural comprueba que T3 y T8 no eligen empresa fuera de `categorize.ts`.
4. **T4 · Las 404 sin nada:**
   - el motivo de cada una ya lo calcula `lib/google/por-que-falta.ts`, con 11 motivos y quién lo arregla, pero solo lo
     usa un script: falta guardarlo y mostrarlo (T1 lo muestra desde el primer día), más «cancelada» (U1) y «no
     ocurrió» (U3);
   - el aviso va en la reunión misma, en Nexus, para quien la organizó (2026-10-24), con cómo activar las notas la
     próxima vez;
   - la configuración de Google para toda la organización está en «Lo que configuras tú».
5. **T5 · La reunión presencial:**
   - subir el texto ya existe («Leer una reunión»);
   - subir el audio y transcribirlo pide elegir un servicio (ver «Lo que decides tú»).

   Es el caso de la reunión de Grupo Avis.
6. **T6 · La copia de Meet cada 10 minutos (es U1),** sin depender de que alguien abra Nexus (hoy corre al abrir la
   app, con 20 minutos de espera). Antes estaba en H1 y en P5.
7. **T7 · Quiénes de Smarteam estuvieron:** cada reunión guarda sus participantes del equipo con su papel (organizó o
   asistió). Hoy se guardan los invitados y `participantes.ts` ya cuenta los del equipo; quién estuvo sale de la API de
   Meet. *Depende de:* U3.
8. **T8 · Encontrar cualquier reunión de la empresa:** el buscador muestra también las reuniones de la empresa en las que
   la persona no estuvo, y las que quedaron en otra empresa con el mismo dominio, con «Mover a esta empresa». Va junto con
   la asociación automática de K5.

9. **T9 · La persona aporta el contexto** (2026-10-24). En cada reunión sin texto, o con poco, Nexus le hace a quien
   estuvo dos o tres preguntas armadas con lo que sabe de las otras reuniones de la empresa. Lo que responde se guarda
   como el texto de esa reunión, marcado «lo contó una persona», y se lee como cualquier otro. Pasa por el chokepoint de
   siempre: la pregunta solo usa reuniones de la misma empresa. La base ya existe: `lib/sessions/reunion-a-mano.ts`,
   con la marca `aMano`; en producción, 0 usos.

## Lo que cuesta (IA, estimado el 2026-10-24)

Con el costo real por llamada de los últimos 30 días: US$118 en 2.051 llamadas. Una reunión con transcripción leída
entera (la post-sesión, los hechos, la lectura de tareas y el clasificador) cuesta unos US$0,21, y una con solo notas,
unos US$0,10. Las APIs de Google (Meet, Calendar, Workspace Events) y la de HubSpot no cobran; Pub/Sub entra en la capa
gratis.

**Una sola vez, para traer lo que ya existe:**

| Qué | Cuánto | US$ |
|---|---|---|
| Leer las reuniones con solo notas (T2) | 301 | ~30 |
| El rescate de las que se leyeron antes de terminar (U1) | 177 | ~37 |
| Los resúmenes de reuniones y llamadas de HubSpot (U7) | hasta 1.416, sin las que ya llegan por Meet | 25 a 50 |
| Las reuniones con texto sin empresa: clasificar y leer (T3) | 67 | ~15 |
| La investigación de cada empresa con búsqueda web (R5) | 200 | ~25 |
| El TAM y los datos de la empresa (R1) | 200 | ~2 |
| El analizador de venta sobre las de los últimos 90 días (S) | 31 | ~4 |
| **Total** | | **~150 a 180** |

**Al mes, de más:**
- unos US$45 si el equipo transcribe las reuniones que hoy no (unas 215 más por mes);
- unos US$10 por leer las notas;
- y unos US$8 entre los resúmenes nuevos de HubSpot, el analizador y rehacer la investigación cada 6 meses.

Son **unos US$55 a 65 al mes** sobre los US$118 de hoy. Los ahorros de U21 a U23 (el precio de Sonnet 5, los lotes y
la caché) devuelven entre US$20 y 30 al mes.

**La forma más barata (recomendada):**
- **Las empresas activas** (con un proyecto activo o una preventa abierta) son 71 de 200, pero tienen casi todo: 285 de
  las 301 reuniones con solo notas y 513 de las 544 reuniones del último mes. Recortar a ellas casi no baja lo de las
  reuniones, y sí lo de la investigación (71 en vez de 200) y lo de HubSpot (sus últimos 6 meses).
- **Lo que no es urgente va por lotes,** que cuestan la mitad: todo lo de traer lo que ya existe lo es.
- **Las demás empresas se traen solas** cuando alguien las abre o les llega una reunión nueva.

Así, **una sola vez cuesta unos US$45 a 55** (en vez de 150 a 180), y **al mes, unos US$35 a 45 más** (las lecturas que
no son urgentes también van por lotes). Depende de que los lotes funcionen (U22).

**Cómo se trae lo que ya existe (el modo de recuperación):**
- Las reuniones de más de 14 días (`DIAS_DE_FRESCURA`) se leen sacando minuta y hechos, **sin propuestas de Tarea ni
  pedidos fuera de alcance**. Con `sinCorteDeFrescura` llegarían cientos de tareas de agosto a «Por decidir».
- No pasan por la cola `seguimiento-reuniones` ni por el presupuesto automático de 10 USD por día: van por lotes, con
  su tope por corrida. Una carga por los jobs se comería unos 8 días de ese tope.
- El script es `scripts/encolar-lecturas-pendientes.ts`, con un modo nuevo `--recuperacion --desde --limite` y
  simulacro. Primero se corre con 10 y se mira la salida.
- Se mide cuántas se leyeron, el costo por lote y cuántas quedaron sin texto.
- Se vuelve atrás con una bandera; lo que ya se leyó queda.
- El costo de la tabla de arriba se recalcula sin la lectura de tareas.
- Si alguna carga corriera por los jobs, se sube `PRESUPUESTO_IA_AUTOMATICO_USD_DIA` mientras dure (en el `.env` del
  VPS; está en «Lo que configuras tú» del roadmap).

Fuera de la IA, transcribir audio de reuniones presenciales con Speech-to-Text cuesta del orden de 1 a 2 centavos de
dólar por minuto (por confirmar con el precio vigente).

## Criterio de éxito

- **El indicador 4** (reuniones con cliente que dejan texto) pasa del 72 % (149 de 207, que ya cuenta las notas) al
  90 %. La fuente es «Reuniones sin grabar» de Uso de Nexus, con 14 días fijos: `scripts/medir-transcripciones-faltantes.ts`
  no lo imprime, o la primera tarea de T1 es que lo imprima. Las que no ocurrieron salen del denominador desde U3, y
  ese día se anota cuánto subió solo por eso.
- **T1:** INV47 en verde 7 días seguidos.
- **T2:** el 95 % de las reuniones con solo notas tiene lectura y minuta (hoy 0 de 301), y el buscador no dice «sin
  transcripción» cuando hay notas.
- **T3:** al menos 2 de cada 3 propuestas de empresa confirmadas en 48 horas.
- **T9:** «lo contó una persona» en la mitad de las reuniones sin texto que lo preguntan.

## Orden

T1 y T2 primero: dicen la verdad y recuperan 301 reuniones. Después T3 y T6, y luego T4, T7, T8 y T5.

## Se cruza con

- **L1:** pasa a ser T2.
- **K5:** la asociación automática a una sesión.
- **H1 y P5:** leer todas las sesiones de cada persona; T6 es su base.
- **S:** el analizador de venta usa T7 y la salud de T1.
- **B3:** los leads de HubSpot, para T3.
