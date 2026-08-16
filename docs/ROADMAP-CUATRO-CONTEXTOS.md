# Roadmap — Los cuatro contextos

> Plan aprobado: `~/.claude/plans/deep-spinning-lagoon.md`. Diagnóstico del 2026-08-15.
> **Este archivo se mantiene al día en cada tanda** — es el resumen para Elías, en castellano de
> negocio. El detalle técnico vive en los mensajes de commit y en `docs/DECISIONS.md`.
>
> Última actualización: **2026-08-16**, punta `25a8870`. **26 commits sin push.**

---

## De qué se trata

Reorganizar lo que Nexus entiende de un cliente y de un proyecto en **cuatro ejes**: qué se vendió,
cómo va hoy, qué se habló con el cliente, y qué se habló puertas adentro.

El diagnóstico concluyó que **no hacía falta una arquitectura nueva**: tres de los cuatro ejes ya
existían como dato y se tiraban en el último metro. Lo que sí apareció fue peor y reordenó todo:

| Medición sobre producción (15-ago) | |
|---|---|
| Reuniones de los últimos 3 meses sin transcripción | **52,7 %** — y el 84 % nunca se grabó |
| Proyectos activos con la foto del plan congelada | **14 de 132** → en 9 de cada 10 no se puede medir si el trabajo creció |
| Desviaciones convertidas en tarea | **0 de 28** |

El patrón: **cada circuito se rompe en el último paso, no en el primero.**

---

## Estado por fase

| Bloque | Fase | Qué hace, en criollo | Estado |
|---|---|---|---|
| **I — Que no falte información** | 1 · Pantalla de sesiones | Reuniones que antes eran invisibles (internas, sin transcripción, agendadas a futuro) ahora se ven y se pueden asignar a un cliente. Avisa cuánto falta grabar y transcribir. | ✅ Hecho |
| | 2 · Cable a los documentos | El estado de HubSpot (bloqueado, prioridad, motivo del atraso) llega a los documentos que arma la IA. Antes lo veían solo dos pantallas internas. | ✅ Hecho |
| | 3 · Etiquetar conversaciones | Cada reunión queda marcada como «con el cliente» o «puertas adentro», para que los documentos entiendan quién dijo qué. | ✅ Hecho |
| **II — Que el estado se vea y se corrija** | 4 · Estado y Etapa hacia HubSpot | Nexus propone el estado real de un proyecto (atrasado, bloqueado, en espera) y su etapa; el CSE confirma y se escribe en HubSpot de un clic. | ✅ Hecho *(la base determinística)* |
| | 5 · Resumen del proyecto | Cada proyecto tiene un resumen automático de «cómo va», con cada afirmación citando de dónde salió. Sin fuente, la afirmación se descarta. | ✅ Hecho |
| **III — Medir si el trabajo creció** | 6 · Aprobar el cronograma | Se puede sellar el plan prometido al cliente, y desde ahí el sistema detecta el trabajo que se agregó después y no estaba prometido. | ✅ Hecho *(falta aplicarlo a los proyectos viejos — fase 12)* |
| | 7 · Desviaciones abierto/cerrado | Que un problema detectado en el cronograma se pueda dar por resuelto, y deje de contar. | 🔨 **En curso** |
| | 8 · Reuniones → tareas | Que lo que se acuerda en una reunión se convierta en tareas del cronograma, pasando por revisión humana. | ⏳ Pendiente |
| | 9 · Lo que se habló pero no se vendió | Detectar en las reuniones lo que el cliente pidió y no está en el contrato: protege el alcance y marca oportunidades de venta. | ⏳ Pendiente |
| | 10 · Qué logramos antes | Que el cierre de un proyecto alimente el handoff del siguiente proyecto del mismo cliente. | ⏳ Pendiente |
| **Extra** | Auditoría del rango | Revisión adversarial de todo lo construido, buscando lo que los tests y el build no ven. Encontró y arregló 8 fallas reales. | ✅ Hecho |
| | 11 · **Validar en pantalla** | Probar con las manos lo construido, sobre datos reales, antes de tocar nada retroactivo. | 🔜 **Lo siguiente para Elías** |
| | 12 · Aplicarlo retroactivamente | Sellar el plan de los 118 proyectos que nunca tuvieron foto, avisando en el propio documento que la foto es de hoy. | ⏳ Después de la 11 |
| | 1.7 · Minuta de reunión interna | Un botón que destile la minuta de una reunión puntual de puertas adentro. | ⏳ Diferido |

---

## El plan de lo que falta

**El orden lo fijó Elías (2026-08-16): primero validar en pantalla, después lo retroactivo.**
Tiene una razón fuerte: lo retroactivo escribe sobre 118 proyectos y no se deshace solo. Si algo de
lo construido está mal, es mucho más barato descubrirlo con un clic que con 118 filas escritas.

### Fase 11 · Validar en pantalla *(requiere deploy — lo hace Elías)*

Bloqueada por: los 26 commits sin push y las **tres migraciones SQL pendientes** (ver abajo). El
recorrido está en `docs/CHECKLIST-PRUEBA-CLICKEADA-CONTEXTOS.md`, ordenado por pantalla.

Lo que la validación tiene que responder, y ningún test puede:

1. **¿El resumen de un proyecto me dice algo que no sabía?** Si la respuesta es no, el problema es
   el prompt, no el código.
2. **¿La sugerencia de estado le pega?** Aceptarla y confirmar **en HubSpot** que cambió.
3. **¿El CSE ve su pantalla y nada más?** Con un usuario que no sea super admin.
4. **¿Aprobar el plan congela lo que tiene que congelar?** Agregar una tarea después y ver que
   aparece como trabajo agregado.

### Fase 12 · Aplicarlo retroactivamente *(después de la 11)*

Los 118 proyectos sin foto reciben una tomada hoy. **El aviso va escrito adentro del propio
documento**: *«Línea base tomada el 16 de agosto de 2026; no refleja los cambios anteriores a esa
fecha.»* Sin ese cartel el número miente por omisión — diría que el proyecto no creció cuando en
realidad nadie estaba mirando.

Se corre con simulación primero (se lee el resultado antes de escribir nada) y necesita el permiso
explícito de escritura sobre producción.

### Fase 7 · Desviaciones abierto/cerrado *(en curso, no depende del deploy)*

Hoy una desviación detectada en el cronograma **no se puede cerrar**: queda para siempre. Gana dos
estados y un cierre con fecha y autor. Tres decisiones ya tomadas:

- Si el mismo problema se vuelve a detectar sobre una fila ya cerrada, **se crea una nueva** y la
  cerrada queda como historia. Reabrir en silencio algo que alguien dio por resuelto es peor.
- Una desviación sin estado (todas las de hoy) **cuenta como abierta**. Ningún dato viejo cambia de
  significado.
- El cliente deja de ver las cerradas — pero **una publicación ya hecha no se actualiza sola**: hay
  que volver a subirla, y la pantalla lo avisa.

Trae **migración SQL (#4)**.

### Fase 8 · Reuniones → tareas

Que lo que se acuerda en una reunión se convierta en tareas del cronograma. **La primera generación
pasa por revisión humana**, como todo el resto.

⚠ Antes de sumar tareas hay que mirar un número: de 3.185 pendientes vivos salidos de reuniones,
solo el 0,8 % está marcado como hecho. Sin resolver ese circuito, esto crea un tercer cementerio.
El mínimo: que una tarea creada desde una reunión **cierre** el pendiente que la originó.

### Fase 9 · Lo que se habló pero no se vendió

⛔ **Primero se tapa una fuga que ya existe hoy**: hay un camino de regeneración parcial que lee el
handoff sin el filtro que sí aplica la generación completa. Un apartado que liste «pedidos que NO se
vendieron» entraría por ahí a un documento que ve el cliente. Se tapa aunque el resto de la fase no
se haga.

### Fase 10 · Qué logramos antes

El documento de Entrega se escribe, se publica, y ningún otro documento lo vuelve a leer. Se
enchufa al handoff del proyecto siguiente del mismo cliente. Es cañería: no hay dato nuevo.

---

## ⚠ Lo que espera a Elías

**Tres migraciones SQL, todas aditivas** (el código viejo las ignora, así que son seguras de correr
antes del deploy). Después de cada una: `npx prisma generate` y **reiniciar el servidor de dev** —
saltárselo hace que las escrituras fallen en silencio.

| # | Archivo | Qué agrega |
|---|---|---|
| 1 | `scripts/sql/2026-08-16-duenio-manual-procedencia.sql` | Quién y cuándo le puso dueño a una reunión |
| 2 | `scripts/sql/2026-08-16-estado-y-etapa-propuestos.sql` | Dónde guardar la sugerencia de estado y etapa |
| 3 | `scripts/sql/2026-08-16-project-brief.sql` | La tabla del resumen por proyecto |

**Post-deploy**: `npx tsx scripts/create-project-brief-agent.ts` — sin eso, el resumen del proyecto
responde «el agente no está sembrado» (correcto, no es una falla).

---

## Los 26 commits

| Commit | Fase | Qué |
|---|---|---|
| `ac8873c` | 1 | El material que falta deja de ser invisible en /sessions |
| `4a23794` | 2 | Los documentos dejan de ignorar que el proyecto está trabado |
| `6ae9c5b` `dd40387` | 3 | El avance y el handoff saben con quién se habló cada cosa |
| `bf97899` | 3 | Las reuniones vacías dejan de comerse el espacio del prompt |
| `2eaefee` | 1 | Queda registrado quién le puso dueño a una reunión — **SQL #1** |
| `332d430` | 1 | Una reunión vacía deja de pintarse verde en el Contexto |
| `d3639f7` `97d65dd` `0015682` `6484ae3` | 4 | Qué se puede proponer · cómo se escribe · el circuito · el chip — **SQL #2** |
| `48384a9` | 5 | Cuatro agentes que terminaban sin avisarle a nadie |
| `608f6d2` | 5 | Ver todos los clientes deja de ser lo mismo que hacer éxito del cliente |
| `80e3cc2` `e3f53d8` `27cd8a1` `a8d9e74` `e7d3c7e` `c84d81c` | 5 | El resumen por proyecto, de la garantía de citas a la pantalla — **SQL #3** |
| `151e3f3` | 6 | ⭐ La foto del plan deja de tragarse lo que se agregó después |
| `7d30816` `a4875e0` | 6 | Aprobar el plan es un acto propio, con su botón |
| `db7e115` | — | Auditoría: los 6 defectos graves que ni los tests ni el build ven |
| `2eb91eb` | — | Los cuatro controles que el CSE veía y no podía apretar |
| `25a8870` | — | El resumen del proyecto no leía el handoff |

---

## Lo que NO se hace, y por qué

| No hacer | Motivo |
|---|---|
| Una tanda de «arquitectura de contexto» antes de los ejes | Ya se intentó con la pieza más chica: costó 9× más código del que sacó |
| Que Nexus escriba las columnas espejadas de HubSpot | El sync las revierte en 10 minutos. La escritura va **hacia** HubSpot y se espera el espejo |
| Datos de partner, cobranza o costos en cualquier contexto de agente | Prohibido por los términos con HubSpot, con guarda y allowlist vacía a propósito |
| Que la fecha estimada toque cobranza | Convertiría una estimación que se mueve sola en un input de facturación |
