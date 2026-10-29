# Empresas que comparten dominio sin compartir contexto — plan

> Estado: **plan, sin código ni datos tocados**. Medido en producción (solo lectura) y en HubSpot el 2026-10-28.
> Lo pidió Elías ese día: el TEC y la AE «usan el mismo dominio, pero son casi empresas distintas, son escuelas
> dentro del TEC que funcionan como empresas separadas»; lo mismo con Grupo INVE y AnalisaLab. «Es importante que no
> se mezcle el contexto de un proyecto en otro […] que un diagnóstico salga solamente del TEC- AE y no del TAE».

## En una frase

Hoy la única pared que Nexus sabe levantar es la **ficha** (`Client`): todo lo de una ficha (sus reuniones, su
memoria, su ficha de datos, sus procesos, sus tareas) se comparte entre sus proyectos. Cuando dos entidades viven en
una sola ficha, se mezclan; cuando viven en dos fichas con el mismo dominio, **la ficha más antigua se queda con todas
las reuniones** y la otra queda vacía. El plan es que cada entidad sea su propia ficha, con un **grupo** arriba que
junta a las del mismo dominio solo para la reportería y para decidir de quién es una reunión.

No se re-litiga lo decidido (DECISIONS «Sesión → cliente → proyecto»): que una reunión de una entidad del mismo grupo
caiga en la otra **no es un leak de seguridad** (es el mismo cliente, con el mismo acceso). Lo nuevo es otra cosa: para
los grupos que Elías declare «de contexto separado», esa misma reunión **sí es mezcla de contexto** para los documentos.
Los grupos que nadie declara siguen como hoy (Distribuidora Larce → DISTELSA por título sigue estando bien).

---

## 1. Lo que encontré

### 1.1 Cómo decide Nexus de quién es una reunión, y dónde se mezcla un caso como el del TEC

| # | Lugar | Qué hace hoy | Qué pasa con dos entidades del mismo dominio |
|---|---|---|---|
| 1 | `categorize.ts`, paso 3 (dominio) | Recorre las fichas en orden de creación (`ORDEN_DE_CLIENTES_PARA_ATRIBUIR`) y se queda con **la primera** que tenga un dominio de la reunión. | Gana siempre la ficha más vieja. «TEC- AE» (creada el 22 jul, sin dominio) nunca recibe una reunión; si le pusieras `itcr.ac.cr`, igual seguiría ganando «TEC» (19 may). |
| 2 | `categorize.ts`, paso 5 (HubSpot) | Dominio → empresa de HubSpot → la ficha que la tiene. | Un dominio es UNA empresa de HubSpot, y una empresa es de UNA ficha (índice único de R7b). No hay forma de que lleve a dos. |
| 3 | `categorize.ts`, paso 6 (título) y `siglas` | Solo corre si los pasos de dominio no encontraron nada. | Las siglas («AE», «TAE») existen pero **llegan tarde**: el dominio ya decidió. |
| 4 | `computeAmbiguousNameTokens` | Ignora en el título palabras que están en dos empresas distintas («grupo»). | No ayuda aquí: el problema no es el título sino el dominio. |
| 5 | Clasificador de proyecto (`classify-session-project.ts`, IA) | Dentro de la ficha, vincula la reunión a un proyecto principal y a otros como secundarios (confianza ≥ 0,4). | Las reuniones de AE quedan como secundarias en el proyecto de TAE y al revés. **No hay pared entre proyectos de una ficha.** |
| 6 | Chokepoint (`project-sources.ts`) | Filtra por ficha: deja pasar toda reunión cuya dueña sea la ficha del proyecto. | Una reunión de AE vinculada al proyecto de TAE pasa el filtro: es de la misma ficha. |
| 7 | Lo que lee cada vínculo | Handoff: principal, o secundario ≥ 0,4 si aplica la relevancia de venta. Avance del cronograma y hechos: principal o secundario ≥ 0,4. La lectura después de la reunión (minuta, tareas, pedidos fuera de alcance, etapa): el principal. | Todo lo que cruzó por el punto 5 alimenta al otro proyecto. |
| 8 | Documentos «solo elegidas» (diagnóstico, planificación, ejecución, kickoff, integraciones, entrega) | Solo leen reuniones que una persona eligió para ese documento. | Las reuniones están a salvo si la persona elige bien, **pero su memoria de la cuenta es de toda la ficha** (punto 9). |
| 9 | Memoria de la cuenta (`lib/memoria/cargar.ts`) | Ficha de datos, procesos, hechos de la cuenta, compromisos de la cuenta, correos y timeline de HubSpot, personas y tickets, lo aprendido en la preventa, lo fuera de alcance, la auditoría del portal. | Todo es por ficha: el diagnóstico de AE leería los procesos, hechos y compromisos de TAE. |
| 10 | Lecturas de la cuenta entera (`getClientSessions`) | 21 archivos fuera de pruebas: preventa, análisis de la venta, agente de procesos, ficha propuesta, exploración, preguntas de contexto, servicio recurrente, `analyze`. | Igual que el punto 9: leen todas las reuniones de la ficha. |
| 11 | Copia de proyectos de HubSpot (`sync-projects.ts`) | Trae a la ficha los proyectos asociados a su empresa. Al actualizar un proyecto que ya existe **no le cambia la ficha**. | Los proyectos de AE llegan a «TEC» porque en HubSpot cuelgan del ITCR. Moverlos a mano a otra ficha sí dura. `resolverHermanos` (desarrollo ↔ implementación, define qué se factura) solo mira dentro de una ficha. |

Conclusión del código: **la ficha es la unidad de aislamiento**, y la defienden el chokepoint, INV1, la frontera de la
memoria y los permisos por ficha. Dentro de una ficha, el aislamiento entre proyectos es blando (lo decide la IA y se
cruza en secundarios), y todo lo que se lee «de la cuenta» es compartido.

No hay hoy dos fichas con el mismo dominio declarado (0 en `emailDomains` y en `company`): el problema se ve como
**una ficha que se queda con todo** o **una ficha vacía**.

### 1.2 Los casos

Medido el 2026-10-28. «Reuniones con los dos» = reuniones con gente de los dominios de las dos fichas.

**TEC (Instituto Tecnológico de Costa Rica): AE y TAE**

- **En Nexus:** ficha «TEC» (`tec.ac.cr`, `itcr.ac.cr`; empresa de HubSpot 59180429929) con dos proyectos, los dos de
  Heiver en SmartLoop: «TEC TAE | RE-IMPLEMENTACIÓN CRM» y «AE | RE-IMPLEMENTACION HUBSPOT». Ficha aparte «TEC- AE»
  (creada el 22 jul, sin dominio, empresa 56463266574) con solo «Información del cliente», **0 reuniones**.
- **En HubSpot:** «INSTITUTO TECNOLOGICO DE COSTA RICA» (`itcr.ac.cr`) absorbió **seis** empresas, entre ellas la
  56463266574 de «TEC- AE». No usa empresas madre e hija. FUNDATEC (`fundatec.ac.cr`) es una empresa aparte.
- **Reuniones:** 185 de «TEC» (+ 4 a mano); 691 con gente de `itcr.ac.cr` y 159 con `tec.ac.cr`, todas de «TEC». Las
  de FUNDATEC: 8 a «TEC» y 3 sin dueña.
- **Mezcla, ya:** de 77 reuniones vinculadas a los dos proyectos, **25 están en los dos**. 2 reuniones de AE son la
  principal del proyecto de TAE; 8 de AE alimentan a TAE como secundarias (≥ 0,4) y 8 de TAE alimentan a AE. Escrito
  en el proyecto de TAE con reuniones de AE: **18 hechos** («AE | Limpieza BBDD», «AE | Reportes de Ventas» y «Revisión
  conexión Fundatec - Hubspot | AE») y **3 tareas** (de la última); la lectura del 27 oct de esa reunión corrió en el
  proyecto de TAE. Los dos handoff tienen 18 bloques de IA cada uno; el de TAE salió de una reunión de TAE. Ningún
  diagnóstico, planificación ni kickoff tiene reuniones elegidas todavía.

**Grupo INVE y AnalisaLab**

- **En Nexus:** ficha «Grupo Inve» (`grupoinve.com`, empresa 28248924427) con seis proyectos, dos de AnalisaLab
  («AnalisaLab - Grupo INVE» y «Reimplementación - AnalisaLab»). Ficha aparte «Analisalab» (`analisalab.com`, empresa
  54896366149, creada el 10 jul) con «Integración con SAP | Analisalab».
- **En HubSpot:** las dos empresas existen por separado (AnalisaLab en etapa «opportunity»); ninguna es madre de la otra.
- **Reuniones:** 394 de «Grupo Inve». Las **23** reuniones con gente de `analisalab.com` traen también gente de
  `grupoinve.com`, y **las 23 son de «Grupo Inve»** (la ficha más vieja). «Analisalab» tiene 11, todas por título.
- **Mezcla:** el contexto de AnalisaLab está **partido en dos fichas**: sus dos proyectos principales y sus reuniones
  con el cliente en «Grupo Inve»; su integración con SAP en «Analisalab», que solo ve 11 reuniones. Dentro de «Grupo
  Inve», 9 reuniones de AnalisaLab alimentan como secundarias a «Éxito de cliente (add on)». Hechos y tareas: cada
  proyecto tiene solo los de su entidad.

**Honda Costa Rica y Faco** (cambió hoy)

- **En Nexus:** «Honda Costa Rica» (`hondafaco.com`, `company` hondacostarica.com) y **«Faco», creada hoy 28 oct a las
  18:35** (`facocr.com`), con dos proyectos de HubSpot nuevos («FACO» y «FACO - Integración Intelisis»). En Honda queda
  el proyecto de prueba «FACO · SmartLoop (prueba)» y «PLAN DE CONTINUIDAD | HONDA FACO».
- **Reuniones:** 53 con gente de las dos → «Honda Costa Rica» (la más vieja); 50 solo con `facocr.com` → «Faco».
- **Mezcla, ya:** **15 reuniones que ahora son de Faco siguen vinculadas a proyectos de Honda** (9 al plan de
  continuidad, 6 al de prueba). El chokepoint las deja afuera, así que esos dos proyectos de Honda perdieron esas
  reuniones de golpe, y es probable que INV1 esté en rojo por eso. Hay que decidir si Honda y Faco son la misma empresa.

**Otros con gente de dos fichas en la misma reunión** (los decide la ficha más vieja):

| Fichas | Reuniones con las dos | Quién gana |
|---|---|---|
| Clínica Oceánica + Grupo Petroil | 30 | Clínica Oceánica |
| Real Shipping & Trade + Logistics Plus | 10 | Real Shipping |
| Secure Title Latin America + Seguro Global | 8 | Secure Title |
| Credix + 4am Saatchi & Saatchi (agencia) | 5 | Credix |

Y «STLA TRUST SERVICES S.A.» (ficha manual del 5 oct, sin dominio, 2 reuniones), del grupo de Secure Title.
DISTELSA y Distribuidora Larce tienen fichas y dominios propios y no comparten reuniones: siguen bien como están.
Ninguna ficha tiene declarado si es casa matriz o filial (`estructura` vacía en las 202).

---

## 2. Las formas de modelarlo

### A · Cada entidad es su propia ficha, con un grupo arriba (recomendada)

Una tabla de grupos (o `Client.grupoId`), con la marca «contexto separado». AE, TAE y AnalisaLab son fichas; el TEC y
Grupo INVE son el grupo. El resolver aprende una sola regla nueva: si el dominio de una reunión es de un grupo, decide
**entre las fichas de ese grupo** (a mano → persona → siglas o título → proyecto), y si no puede, la deja «por decidir
en el grupo», nunca en la ficha más vieja.

- **Gana:** el aislamiento sale **gratis en todos lados**, porque todo lo de los puntos 5 a 11 ya se separa por ficha:
  el chokepoint, la memoria, los hechos, las tareas, la cobranza, los permisos y el acceso externo. INV1 vigila la
  mezcla sin una invariante nueva. La reportería del grupo se arma a propósito, sumando fichas.
- **Cuesta:** HubSpot tiene una empresa para varias fichas (el ITCR), y el índice único dice una empresa = una ficha.
  La ficha «titular» del grupo se queda con la empresa; las demás quedan sin empresa (o con una empresa hija, si se
  crea en HubSpot). Un proyecto nuevo del ITCR llega al titular y alguien dice de qué entidad es. `resolverHermanos`
  tiene que mirar dentro del grupo. Hay que mover proyectos y re-resolver reuniones (con simulacro).

### B · Una ficha, con proyectos amurallados

Se quedan en «TEC» los dos proyectos, y se marca cada uno como «contexto aparte»: el clasificador no cruza vínculos, la
lectura después de la reunión y los hechos se quedan en uno, y la memoria del proyecto deja de leer lo de la cuenta.

- **Gana:** HubSpot no cambia; no se mueve nada.
- **Cuesta:** hay que enseñarle la pared a **todo** lo que hoy lee por ficha: la memoria (9 partes), los 21 archivos
  que leen la cuenta entera, la ficha de datos, los procesos, Tareas, la cobranza y la reportería. Cada lector nuevo
  nace mezclando, porque lo compartido es el default. Es el mismo problema que causó el leak de DISTELSA (la regla
  repetida en varios lugares), ahora un nivel más abajo.

### C · Unidades dentro de la ficha

Un modelo nuevo de unidad (con sus dominios, siglas y personas) debajo de la ficha; la reunión gana una unidad dueña
además de la ficha.

- **Gana:** la ficha sigue siendo la empresa de HubSpot y la cuenta de cobro.
- **Cuesta:** lo mismo que B (todo lector tiene que aprender la unidad), más un segundo resolver. Es A con más trabajo.

## 3. Recomendación

**La A.** Nexus ya tiene una pared que funciona y está vigilada; el plan es usarla en lugar de construir otra. Lo único
nuevo de verdad es cómo se decide la dueña de una reunión cuando el dominio es compartido, y eso vive en un solo lugar
(`categorize.ts`, como exige la invariante 2). La reportería a la junta se hace mirando el grupo a propósito, nunca
porque un documento de una entidad lea lo de otra.

## 4. Qué pasa con «TEC- AE» y su empresa fusionada

- La empresa 56463266574 **ya no existe por sí sola**: HubSpot la fusionó en el ITCR (59180429929), y una fusión de
  empresas no se deshace.
- **Reapuntarla no se puede**: el ITCR ya es de la ficha «TEC», y desde R7b un reapunte que choca con otra ficha
  responde 409. Lo que Elías aprobó en la pregunta 6 del roadmap queda sin efecto, y la pregunta 35 («¿fusiono las dos
  TEC?») es justo lo contrario de este plan: **no hay que fusionarlas**.
- Con la forma A: «TEC- AE» **es** la ficha de la AE. En la etapa 1 se le quita la empresa fusionada (queda sin
  empresa, o con una empresa hija nueva si Elías elige separarla también en HubSpot). Eso pone verde INV13 para este
  caso. Su proyecto «AE | RE-IMPLEMENTACION HUBSPOT» se muda de «TEC» a ella en la etapa 3.

## 5. Etapas

Cada etapa se cierra con `tsc`, `eslint`, la suite, `/revisar` y, como toca de quién es una reunión,
`check:invariants`. Las escrituras masivas van en simulacro primero.

### E0 · Contener lo que ya se mezcló (sin código)

- En «TEC», sacar a mano (la «X» del panel de reuniones del proyecto) las 16 reuniones que cruzan como secundarias y
  cambiar la principal de las 2 de AE que están en TAE. El clasificador respeta lo que tocó una persona.
- Decidir Honda / Faco (pregunta 4) antes de que esos dos proyectos de Honda generen algo sin las 15 reuniones.
- **Terminado cuando:** 0 reuniones de AE vinculadas a TAE y al revés (consulta de solo lectura); INV1 sin Faco ↔ Honda.

### E1 · El grupo y sus fichas

- SQL aditivo: el grupo (nombre, marca «contexto separado», dominios compartidos, ficha titular) y `Client.grupoId`
  nullable, con RLS. Pantalla mínima en la ficha: «Es parte del grupo X» y, para quien tenga permiso, armar un grupo.
- «TEC- AE» suelta la empresa fusionada; las fichas que faltan se crean (TAE, si Elías confirma que es otra entidad).
- **Terminado cuando:** existen los grupos TEC e INVE con sus fichas; INV13 ya no marca «TEC- AE».
- **Pruebas:** `check:esquema` ve la tabla; una invariante nueva: dos fichas con el mismo dominio efectivo tienen que
  estar en el mismo grupo (hoy da 0; protege el futuro); prueba unitaria del catálogo del grupo.

### E2 · El resolver con dominio compartido

- En `categorize.ts`, el paso 3 deja de quedarse con la primera ficha: si el dominio es de un grupo «contexto
  separado», decide entre sus fichas en este orden: a mano → la persona (un correo que se asignó a una entidad) →
  siglas o nombre en el título → si la reunión ya está elegida en un proyecto de una de ellas; si nada decide, queda
  sin dueña con la marca «por decidir en el grupo X» y aparece para asignar. Sin grupo, todo sigue como hoy.
- Se mide antes de prender: el simulacro de `resolveAllSessions` (deltas por ficha) se le muestra a Elías.
- **Terminado cuando:** el simulacro reparte las reuniones del TEC y de INVE como Elías espera, y el resto de las
  fichas no se mueve (delta 0 fuera de los grupos).
- **Pruebas:** casos unitarios de `categorize` (dominio de grupo con siglas, con persona, sin pista → por decidir; sin
  grupo → igual que hoy); integración del chokepoint con dos fichas del mismo grupo.

### E3 · Proyectos y HubSpot

- Mover «AE | RE-IMPLEMENTACION HUBSPOT» a «TEC- AE» y los dos proyectos de AnalisaLab a «Analisalab» (script en
  simulacro, `--apply` después). La copia de HubSpot ya no les cambia la ficha.
- Un proyecto nuevo de HubSpot que llega a la ficha titular de un grupo pregunta de qué entidad es (o, si Elías eligió
  empresas hijas en HubSpot, llega solo a la suya).
- `resolverHermanos` busca hermanos dentro del grupo, para que la cobranza del desarrollo no cambie al mover.
- **Terminado cuando:** cada proyecto está en la ficha de su entidad, la cobranza de esos proyectos da el mismo número
  antes y después, y una corrida completa de la copia de HubSpot no los devuelve ni los apaga.
- **Pruebas:** prueba de la copia (un proyecto movido no vuelve); prueba de hermanos dentro del grupo; simulacro de
  cobranza antes y después.

### E4 · Limpiar lo mezclado

- Re-resolver con el resolver nuevo (simulacro → `--apply`), re-clasificar las fichas que ganaron reuniones, y dejar
  que los hechos que cambian de dueña se desestimen solos (`alCambiarDeDueno`). Las 3 tareas de AE en TAE se mueven a
  mano o con INV42.
- Los handoff ya generados no se rehacen solos: la lista de los que leyeron reuniones de otra entidad se le muestra al
  CSE para que decida.
- **Terminado cuando:** 0 hechos, tareas y vínculos de una entidad en un proyecto de otra del mismo grupo; INV1 verde.

### E5 · La vista del grupo para la junta

- En la ficha del grupo, un resumen que suma sus entidades (proyectos, avance, lo pendiente, lo cobrado), marcado como
  «del grupo». Un documento de una entidad nunca lo lee solo; si algún día hace falta, es un botón explícito con rótulo.
- **Terminado cuando:** Elías ve el TEC y Grupo INVE enteros en un lugar, y el diagnóstico de AE no cambia si se
  agrega una reunión de TAE.
- **Pruebas:** la frontera de la memoria (`frontera.test.ts`) impide que la vista del grupo entre a un documento.

## 6. Preguntas que solo Elías puede responder

1. **El TEC:** ¿cuántas entidades se trabajan aparte? ¿AE y TAE, y algo más (FUNDATEC)? ¿La ficha «TEC» de hoy es la
   de TAE, o es el grupo y TAE necesita su propia ficha?
2. **HubSpot:** ¿quieres que HubSpot también las separe (una empresa hija por escuela debajo del ITCR, y cada proyecto
   colgado de la suya) o que la separación viva solo en Nexus?
3. **Grupo INVE:** las 23 reuniones donde están las dos empresas, ¿son de AnalisaLab o del grupo? ¿Muevo los dos
   proyectos de AnalisaLab a la ficha «Analisalab»?
4. **Honda y Faco:** ¿son la misma empresa (las fusiono en una) o dos que se trabajan aparte? Hoy se creó «Faco» y 15
   reuniones quedaron colgando de proyectos de Honda.
5. **Otros pares:** Clínica Oceánica y Grupo Petroil (30 reuniones juntas), Real Shipping y Logistics Plus (10),
   Secure Title y Seguro Global (8): ¿son del mismo grupo? ¿alguno necesita el contexto aparte?
6. **Una reunión sin pista** (gente de las dos escuelas y un título que no dice cuál): ¿prefieres que quede «por
   decidir» hasta que alguien la asigne, o que vaya a la entidad principal del grupo?
7. **La junta:** ¿qué necesita ver del grupo entero (avance, horas, cobro, riesgos) y quién lo ve?
8. **El roadmap:** ¿retiro la pregunta 35 (fusionar las dos TEC) y cambio la 6 por este plan?
