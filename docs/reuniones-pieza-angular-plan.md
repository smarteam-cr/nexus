# Las reuniones, la pieza angular del contexto — plan

> Elías, 2026-10-23: «el módulo que obtiene las sesiones es de lo más importante de Nexus: es el creador de contexto de
> cada empresa, la pieza angular». Este plan junta en un solo lugar todo lo que hace que una reunión llegue completa a su
> empresa y se lea. Medido en producción en solo lectura el mismo día. **Nada construido.** En el roadmap es el área T.

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

**El caso de Liliana** (no encontró una reunión que tenía texto) está por identificar. Hay dos causas probables, ya vistas en
el código:
- una reunión con solo notas aparece como «sin transcripción»: el buscador marca así todo lo que no es transcripción;
- una reunión que quedó en otra empresa no aparece en la lista «De la empresa», y si Liliana no estaba invitada, tampoco en
  «De tu calendario».

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
   - Por persona y por empresa: con transcripción, solo notas, sin nada (con el motivo) y sin empresa; leídas o no.
   - Una invariante nueva en `check:invariants`: ninguna reunión con texto e invitados de fuera sin empresa por más de 48
     horas.
   - Lo ve la CSL y los super admin; cada persona ve las suyas.
2. **T2 · Las notas de Gemini cuentan** (antes L1): la lectura acepta notas largas; la minuta y los hechos salen de ellas;
   el buscador deja de decir «sin transcripción» cuando hay notas.
3. **T3 · Las 67 reuniones sin empresa:** Nexus propone la empresa, o crea el prospecto desde la empresa de HubSpot del
   dominio (con los leads, B3). Se decide en /sessions con un clic.
4. **T4 · Las 404 sin nada:**
   - el motivo de cada una: Gemini sin activar, la organizó el cliente, fue presencial o se canceló;
   - un aviso el mismo día a quien la organizó, con cómo activar las notas la próxima vez;
   - la configuración de Google para toda la organización está en «Lo que configuras tú».
5. **T5 · La reunión presencial:**
   - subir el texto ya existe («Leer una reunión»);
   - subir el audio y transcribirlo pide elegir un servicio (ver «Lo que decides tú»).

   Es el caso de la reunión de Grupo Avis.
6. **T6 · La copia de Meet cada hora,** sin depender de que alguien abra Nexus (hoy corre al abrir la app, con 20 minutos
   de espera). Antes estaba en H1 y en P5.
7. **T7 · Quiénes de Smarteam estuvieron:** cada reunión guarda sus participantes del equipo con su papel (organizó o
   asistió).
8. **T8 · Encontrar cualquier reunión de la empresa:** el buscador muestra también las reuniones de la empresa en las que
   la persona no estuvo, y las que quedaron en otra empresa con el mismo dominio, con «Mover a esta empresa». Va junto con
   la asociación automática de K5.

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

Fuera de la IA, transcribir audio de reuniones presenciales con Speech-to-Text cuesta del orden de 1 a 2 centavos de
dólar por minuto (por confirmar con el precio vigente).

## Orden

T1 y T2 primero: dicen la verdad y recuperan 301 reuniones. Después T3 y T6, y luego T4, T7, T8 y T5.

## Se cruza con

- **L1:** pasa a ser T2.
- **K5:** la asociación automática a una sesión.
- **H1 y P5:** leer todas las sesiones de cada persona; T6 es su base.
- **S:** el analizador de venta usa T7 y la salud de T1.
- **B3:** los leads de HubSpot, para T3.
