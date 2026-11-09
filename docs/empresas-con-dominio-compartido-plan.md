# Empresas con varias unidades — plan

> **Estado (2026-11-07):** plan aprobado con las recomendaciones (kölbi corregido: es un cliente con proyectos, medido en
> sus 77 transcripciones). **U1 y U6 construidas** en la rama `claude/unidades-u1-u6-f29d44`, sin deploy ni `--apply`:
> `scripts/separar-en-unidades.ts` (TEC y CEMACO, simulacros corridos) y la regla del título en el clasificador, con
> `scripts/repartir-reuniones-sin-proyecto.ts` para kölbi. La parte 1 (el TEC en dos
> fichas, 29 oct) está en main desde el 6 nov y sube con la ola 1, apagada: no actúa hasta separar el TEC, y esa
> separación espera la etapa U1 de este plan. DECISIONS: «Dos fichas que comparten dominio» y «Una empresa con varias
> unidades».

## Parte 2 · Cualquier empresa con varias unidades (pedido del 6 nov)

Elías, 6 nov: «Hoy Nexus asume que un dominio de correo es un cliente. Eso falla cuando, bajo el mismo dominio, hay
varios clientes que para nosotros son distintos […] la solución tiene que servir para cualquiera, no solo para estos
tres […] Debe [ser] lo más fácil e intuitivo que Nexus identifique esto y lo separe automáticamente.» Eligió las
recomendaciones de este plan sin cambios.

### En una frase

Una **unidad** es una ficha de Nexus; una **empresa** es su ficha principal (la del dominio y la empresa de HubSpot)
más las unidades que le cuelgan. Como todo en Nexus ya se separa por ficha, cada unidad queda aislada sola. Lo nuevo es
poco: separar con un solo flujo, el aviso de que un dominio parece tener varios clientes, la vista de la empresa entera y
la convención de títulos.

### Unidad o proyecto: la regla

Tres preguntas, sobre el cliente y no sobre cómo trabajamos nosotros:

1. ¿Decide y paga la misma gente (el mismo contrato o la misma negociación)?
2. ¿Del lado del cliente trabajamos con la misma gente?
3. ¿Lo de uno se le puede mostrar al otro sin problema?

Las tres en sí: **un cliente con proyectos**. Una en no, y sobre todo la 1 o la 3: **unidades**. Que el cliente tenga
áreas internas con jefes distintos no alcanza: en kölbi, Ventas y Marketing tienen jefaturas propias y son un solo
cliente (abajo). La gente es la señal con que Nexus sospecha (U3) y reparte una reunión sin nombre; la decisión es de una
persona, con estas tres preguntas.

### Lo medido en producción (solo lectura, 2026-11-06)

| Empresa | Hoy en Nexus | Lo que separa | Lo que queda para una persona |
|---|---|---|---|
| **TEC** | «TEC» (`tec.ac.cr`, `itcr.ac.cr`, 188 reuniones, 2 proyectos) y «TEC- AE» vacía | El nombre decide 86 %; la gente separa perfecto (0 de 41 personas en las dos) | 5 reuniones de las dos (simulacro del 30 oct: AE 90, TAE 122) |
| **CEMACO** | «Cemaco Internacional» (`cemaco.co.cr`, 28 reuniones, 2 proyectos, 1 propuesta) | Las del diagnóstico de Ecuador («SUKASA + CEMACO + COMOHOGAR \| TI, Cobranza, Ecommerce, Marketing») traen gente de `sukasa.com` y `comohogar.com`, nadie de `cemaco.co.cr`: con su ficha, el dominio las separa solo | La del 30 oct, con los tres dominios |
| **kölbi** | «kölbi» (`ice.go.cr`, 230 reuniones, 3 proyectos: Ventas, Marketing, InfoClic); 145 reuniones sin proyecto | No son unidades (decisión 5). Entre sus proyectos, solo el título separa: 20 de 45 personas del ICE van a Ventas y a Marketing | Las que no nombran ningún proyecto (U6) |

### Las decisiones (tomadas el 7 nov, con la recomendación)

1. **Unidad = ficha propia.** Sin tabla de empresas. La ficha principal es la del dominio y la empresa de HubSpot.
2. **Qué se comparte entre unidades: nada de lo que alimenta a un agente.** Contexto, memoria, ficha del cliente,
   contactos aprendidos, escala y cuenta de cobro son de cada unidad. La vista de la empresa junta para mirar.
3. **Una reunión de dos unidades** va a una sola, elegida por una persona, y la otra unidad puede elegirla a mano para un
   documento (misma empresa y elección explícita: la única puerta entre unidades).
4. **HubSpot no se reorganiza.** Una empresa de HubSpot para todas: vive en la principal, y sus correos, contactos y
   tickets llegan ahí. Una empresa por unidad: cada unidad la suya. Los proyectos nuevos van a la unidad que nombran al
   inicio; sin nombre, aviso.
5. **kölbi es UN cliente con tres proyectos: Ventas, Marketing e InfoClic** (Elías, 7 nov, después de leer sus 77
   transcripciones, sep 2025 a nov 2026). Las tres preguntas: decide y negocia una sola persona (Priscilla Sanabria,
   jefa de Publicidad y Marca); hubo dos contratos con dos partidas (Marketing desde oct 2025, Ventas como anexo desde
   feb 2026), pero el 5 nov ella pidió uno solo desde enero y se cobra con una sola cuenta; trabajan en un solo HubSpot,
   con los mismos pipelines, Marketing genera los leads que atiende Ventas y nadie pide separar información. Ventas
   (Diana Villalobos y Catalina Díaz, bajo un director comercial) y Marketing (Grace Camacho, Breyssy Martínez y César
   Vargas) son áreas del mismo cliente. Lo que kölbi necesita es U6, no unidades.
6. **CEMACO son «Cemaco · Costa Rica» (la principal, `cemaco.co.cr`) y «Cemaco · Ecuador» (`sukasa.com`,
   `comohogar.com`).** El proyecto de Desarrollo y la propuesta «CRM + ERP» se proponen en el simulacro (por su gente,
   hoy son de Costa Rica).
7. **Quién separa:** el TEC y CEMACO, Claude con simulacro y el OK de Elías. El botón «Separar en unidades» llega con
   el aviso (U3).

### La convención de títulos (para el equipo)

- **La unidad (o el proyecto) primero, después «|» y el tema:** «TAE | Reportes», «AE | Limpieza de base», «Cemaco CR |
  Sales Hub», «Cemaco EC | Marketing». En un cliente con varios proyectos, el proyecto: «kölbi Ventas | Pipelines»,
  «kölbi Marketing | Campaña de recargas», «kölbi InfoClic | Integración».
- **Interna:** «[Interna] AE | …».
- **De dos unidades:** «Cemaco CR + EC | Kickoff». Queda por decidir y una persona la asigna (decisión 3).
- **El nombre de una unidad solo va en los títulos de sus reuniones.**

### Etapas

Cada una cierra con `tsc`, `eslint`, la suite, `/revisar` y `check:invariants`; las escrituras van en simulacro primero.

**U0 · Que suba lo del TEC.** Viene con la ola 1 (SQL `2026-10-29-dominio-compartido.sql` antes del deploy). Los scripts
`separar-tec` y `reubicar-reuniones-compartidas` NO se aplican: los reemplaza U1.
*Terminado cuando:* producción corre el resolver con `comparteDominioConId` y ninguna ficha lo tiene puesto.

**U1 · Separar en unidades, para cualquier empresa.** `separar-tec.ts` sin nombres fijos: recibe la ficha principal y
las unidades (nombre, siglas, dominios propios) y propone, para cada proyecto, propuesta, preventa, reunión, tarea y
hecho, a qué unidad va y por qué (título, gente, dominio, a mano). El simulacro deja una tabla para Elías; con su OK,
`--apply` mueve todo junto (la reubicación de reuniones de `reubicar-reuniones-compartidas.ts` corre en el mismo paso).
Las reuniones sin pista quedan por decidir en /sessions. Se corre en el TEC y después en CEMACO.
*Terminado cuando:* en las dos empresas INV1 e INV2 no marcan nada, cada proyecto ve solo reuniones de su unidad y lo
por decidir está a la vista en /sessions.
*Construido (7 nov):* `scripts/separar-en-unidades.ts --empresa tec|cemaco`, con las empresas en `scripts/lib/unidades.ts`.
Simulacro en producción, solo lectura y con la separación en memoria: el TEC da AE 91, TAE 124 y 5 por decidir (igual que
el 30 oct); CEMACO da Costa Rica 19, Ecuador 4 (las «SUKASA + CEMACO + COMOHOGAR», por el dominio) y 5 por decidir (la
del 30 oct y cuatro que solo dicen «CEMACO»). El resolver suma tres reglas: una unidad con dominio propio vive en el suyo,
el título que cae en una unidad se reparte, y en una empresa con marca la sigla vale solo junto a la marca (DECISIONS).

**U2 · La puerta de las reuniones de dos unidades.** El chokepoint (`lib/sessions/project-sources.ts`) deja pasar a un
documento una reunión de otra unidad de la misma empresa solo si una persona la eligió en su contexto adicional. Prueba
de integración: la misma reunión, sin elegir, no pasa; de otra empresa, no pasa aunque se elija.
*Terminado cuando:* esas pruebas están en verde y `check:invariants` no cambia.

**U3 · El aviso y el botón.** Una revisión semanal mira cada dominio con una sola ficha: grupos de gente de afuera que
nunca coinciden en una reunión (cada grupo con 5 reuniones o más) o proyectos y propuestas cuyo nombre abre distinto
(«AE |», «TAE |»). Le avisa a Elías en «Para ti», con la razón, «Separar en unidades» (abre el simulacro de U1) y «Es
una sola» (no vuelve a avisar por esa empresa).
*Terminado cuando:* contra producción, en solo lectura, el TEC de antes de separarse sale en la lista y una empresa
normal (con un solo grupo de gente) no.

**U4 · Los proyectos nuevos de HubSpot, a su unidad.** La copia de proyectos de la principal reparte por las siglas al
inicio del nombre del proyecto; sin siglas, el proyecto queda en la principal con un aviso para moverlo.
*Terminado cuando:* la prueba de la copia con un HubSpot simulado manda «AE | X» a AE y avisa por «Proyecto Y».

**U5 · La vista de la empresa.** Arriba de cada unidad, «Parte de TEC · 2 unidades», con enlace a una página de solo
lectura: cada unidad con sus proyectos, las horas dedicadas, la cobranza sumada y su escala. Ningún agente la lee.
*Terminado cuando:* la página existe con su `loading.tsx` y sus registros (§1-UI), y un escaneo prueba que ningún agente
importa su lectura.

**U6 · Dentro de un cliente, el título manda el proyecto.** Antes de la IA que reparte una reunión entre los proyectos
de su ficha (`classify-session-project.ts`), una regla: si el título nombra a un solo proyecto activo de esa ficha (las
palabras propias de su nombre, sin el nombre del cliente: «Ventas», «Marketing», «InfoClic»), la reunión va a ese
proyecto como principal; si nombra a dos o a ninguno, sigue la IA de hoy. Después, el mismo flujo de propuesta y
confirmación de U1 reparte las 145 reuniones de kölbi que no tienen proyecto: título, después la IA, y lo dudoso a la
vista para asignar a mano.
*Terminado cuando:* una prueba manda «kölbi Marketing | Campaña» al proyecto de Marketing aunque la gente sea la de
Ventas, y en kölbi no queda ninguna reunión del último trimestre sin proyecto ni propuesta.

**Lo que no se construye:** una tabla de empresas, reescribir los lectores de contexto, reorganizar HubSpot, repartir
los correos y tickets de HubSpot entre unidades (hasta que haga falta) y una IA que decida la unidad.

---

## Parte 1 · El TEC en dos fichas (29 oct)

> Estado: **el TEC se separa en dos fichas** (decisión del 29 oct). Código y scripts en la rama
> `claude/tec-ae-tae-202486`; el SQL, el deploy y los `--apply` van en el orden de la sección 6. Grupo INVE, Honda/Faco
> y los otros pares siguen abiertos (sección 7). Medido en producción (solo lectura) y en HubSpot el 2026-10-28 y el
> 2026-10-29.
>
> Lo pidió Elías el 28 oct: el TEC y la AE «usan el mismo dominio, pero son casi empresas distintas, son escuelas
> dentro del TEC que funcionan como empresas separadas»; lo mismo con Grupo INVE y AnalisaLab. «Es importante que no
> se mezcle el contexto de un proyecto en otro […] que un diagnóstico salga solamente del TEC- AE y no del TAE».
>
> El mismo 28 oct dijo que bastaba con separar por proyectos (la forma A de la sección 2). **El 29 oct cambió:** «Que
> el TEC se separe en dos clientes, uno para el AE y otro para el TAE, cada uno con sus sesiones y proyectos. Hoy Nexus
> los mezcla y no se puede ver bien cómo va cada uno.» Es la forma B, sin el grupo arriba por ahora (etapa futura).
> DECISIONS: «Dos fichas que comparten dominio».

### En una frase

El TEC pasa a ser **dos fichas**: «TEC · TAE» (la vieja «TEC», con los dominios y la empresa de HubSpot) y «TEC · AE»
(la vieja «TEC- AE»), cada una con su proyecto y sus reuniones. AE no tiene dominio propio: **comparte** el de TAE
(`Client.comparteDominioConId`). Cuando una reunión llega por ese dominio, el resolver único (`categorize.ts`) la
reparte: primero por el **nombre** de la reunión (las siglas «AE» y «TAE»), después por **la gente** de cada una, y si
no hay pista queda **por decidir**, para asignarla a mano. Nunca va a la ficha más vieja.

Con dos fichas, la pared sale gratis: todo lo que hoy se lee «de la cuenta» (la memoria, las lecturas de la cuenta
entera, el chokepoint) ya se separa por ficha, así que la sección 4 deja de hacer falta para el TEC.

---

### 1. Lo que encontré

Medido el 28 oct, antes de la decisión del 29. Donde dice «el plan», es la forma A (una ficha).

#### 1.1 Cómo decide Nexus de quién es una reunión, y dónde se mezcla un caso como el del TEC

| # | Lugar | Qué hace hoy | Qué pasa con dos entidades en una ficha |
|---|---|---|---|
| 1 | `categorize.ts`, paso 3 (dominio) | Recorre las fichas en orden de creación (`ORDEN_DE_CLIENTES_PARA_ATRIBUIR`) y se queda con **la primera** que tenga un dominio de la reunión. | Gana siempre la ficha más vieja. Por eso «TEC- AE» (creada el 22 jul, sin dominio) nunca recibió una reunión. Con la regla nueva (sección 3), el dominio de un grupo se reparte entre sus fichas. |
| 2 | `categorize.ts`, paso 5 (HubSpot) | Dominio → empresa de HubSpot → la ficha que la tiene. | Un dominio es UNA empresa de HubSpot, y una empresa es de UNA ficha (índice único de R7b). |
| 3 | Clasificador de proyecto (`classify-session-project.ts`, IA) | Con 2+ proyectos, le pasa a la IA el título, los correos de los participantes, los nombres de los proyectos y el texto. Vincula un proyecto principal y otros como secundarios (confianza ≥ 0,4). | La IA **ve** «AE |» y «TEC TAE |» en los nombres y aun así cruza: las reuniones de AE quedan como secundarias en TAE y al revés. Las personas le llegan como correos sueltos, sin saber de qué proyecto es cada una. |
| 4 | Chokepoint (`project-sources.ts`) | Filtra por ficha: deja pasar toda reunión cuya dueña sea la ficha del proyecto. | Una reunión de AE vinculada al proyecto de TAE pasa el filtro: es de la misma ficha. |
| 5 | Lo que lee cada vínculo | Handoff: principal, o secundario ≥ 0,4 si aplica la relevancia de venta. Avance del cronograma y hechos: principal o secundario ≥ 0,4. La lectura después de la reunión (minuta, tareas, pedidos fuera de alcance, etapa): el principal. | Todo lo que cruzó por el punto 3 alimenta al otro proyecto. |
| 6 | Documentos «solo elegidas» (diagnóstico, planificación, ejecución, kickoff, integraciones, entrega) | Solo leen las reuniones que una persona eligió para ese documento. | Las reuniones están a salvo si la persona elige bien, **pero su memoria de la cuenta es de toda la ficha** (punto 7). |
| 7 | Memoria de la cuenta (`lib/memoria/cargar.ts`, `memoriaDeLaCuenta`) | Ficha de datos, procesos, hechos y compromisos de la cuenta, correos y timeline de HubSpot, personas y tickets, notas del equipo, lo aprendido en la preventa, lo fuera de alcance, la entrega publicada de otro proyecto, la auditoría del portal. | Todo es por ficha: el diagnóstico de AE leería los hechos y compromisos de TAE, sus correos de HubSpot y la entrega publicada del otro proyecto. |
| 8 | Lecturas de la cuenta entera (`getClientSessions`) | 21 archivos fuera de pruebas: preventa, análisis de la venta, agente de procesos, ficha propuesta, exploración, preguntas de contexto, servicio recurrente, `analyze`… | Leen todas las reuniones de la ficha, de los dos proyectos. |
| 9 | Copia de proyectos de HubSpot (`sync-projects.ts`) | Trae a la ficha los proyectos asociados a su empresa. | Los dos proyectos del TEC cuelgan del ITCR en HubSpot y llegan a «TEC». Con las dos fichas, el de AE se mueve una vez y la copia ya no le cambia la ficha (actualiza por `hubspotServiceId`). |

Conclusión del código: la ficha es la única pared que existe hoy. Para que el proyecto sea pared hacen falta **dos
cosas**: que el clasificador no cruce (puntos 3 y 5), y que lo que se lee «de la cuenta» se lea del proyecto
(puntos 7 y 8). La primera sola no alcanza: con una clasificación perfecta, el diagnóstico de AE igual leería los
hechos, compromisos y correos de TAE por la memoria de la cuenta.

#### 1.2 Los casos

Medido el 2026-10-28. «Reuniones con los dos» = reuniones con gente de los dominios de las dos fichas.

**TEC (Instituto Tecnológico de Costa Rica): AE y TAE**

- **En Nexus:** ficha «TEC» (`tec.ac.cr`, `itcr.ac.cr`; empresa de HubSpot 59180429929) con dos proyectos, los dos de
  Heiver en SmartLoop: «TEC TAE | RE-IMPLEMENTACIÓN CRM» y «AE | RE-IMPLEMENTACION HUBSPOT». Además está la ficha
  «TEC- AE» (creada el 22 jul, sin dominio, empresa 56463266574). No tiene reuniones, ni bloques en «Información del
  cliente», ni proyectos de trabajo.
- **En HubSpot:** «INSTITUTO TECNOLOGICO DE COSTA RICA» (`itcr.ac.cr`) absorbió **seis** empresas, entre ellas la
  56463266574 de «TEC- AE». No usa empresas madre e hija. FUNDATEC (`fundatec.ac.cr`) es una empresa aparte.
- **Reuniones:** 185 de «TEC» (+ 4 a mano). Las de FUNDATEC: 8 a «TEC» y 3 sin dueña.
- **Mezcla, ya:** de 77 reuniones vinculadas a los dos proyectos, **25 están en los dos**: 9 tienen «AE» en el
  nombre, 8 «TAE» y 8 no dicen ninguno. 2 reuniones de AE son la principal del proyecto de TAE. Escrito en el
  proyecto de TAE con reuniones de AE: **18 hechos** («AE | Limpieza BBDD», «AE | Reportes de Ventas» y «Revisión
  conexión Fundatec - Hubspot | AE») y **3 tareas** (de la última). Los dos handoff tienen 18 bloques de IA cada uno;
  el de TAE salió de una reunión de TAE. Ningún diagnóstico, planificación ni kickoff tiene reuniones elegidas todavía.

**Grupo INVE y AnalisaLab**

- **En Nexus:** ficha «Grupo Inve» (`grupoinve.com`, empresa 28248924427) con seis proyectos, dos de AnalisaLab
  («AnalisaLab - Grupo INVE» y «Reimplementación - AnalisaLab»). Ficha aparte «Analisalab» (`analisalab.com`, empresa
  54896366149, creada el 10 jul) con «Integración con SAP | Analisalab».
- **En HubSpot:** las dos empresas existen por separado (AnalisaLab en etapa «opportunity»); ninguna es madre de la otra.
- **Reuniones:** 394 de «Grupo Inve». Las **23** reuniones con gente de `analisalab.com` traen también gente de
  `grupoinve.com`, y **las 23 son de «Grupo Inve»** (la ficha más vieja). «Analisalab» tiene 11, todas por título.
- **Mezcla:** el contexto de AnalisaLab está **partido en dos fichas**: sus dos proyectos principales y sus reuniones
  con el cliente en «Grupo Inve»; su integración con SAP en «Analisalab», que solo ve 11 reuniones. Dentro de «Grupo
  Inve», 9 reuniones de AnalisaLab alimentan como secundarias a «Éxito de cliente (add on)».

**Honda Costa Rica y Faco** (cambió hoy, urgente)

- **En Nexus:** «Honda Costa Rica» (`hondafaco.com`, `company` hondacostarica.com) y **«Faco», creada hoy 28 oct a las
  18:35** (`facocr.com`), con dos proyectos de HubSpot nuevos («FACO» y «FACO - Integración Intelisis»). En Honda queda
  el proyecto de prueba «FACO · SmartLoop (prueba)» y «PLAN DE CONTINUIDAD | HONDA FACO».
- **Reuniones:** 53 con gente de las dos → «Honda Costa Rica» (la más vieja); 50 solo con `facocr.com` → «Faco».
- **Mezcla, ya:** **15 reuniones que ahora son de Faco siguen vinculadas a proyectos de Honda** (9 al plan de
  continuidad, 6 al de prueba). El chokepoint las deja afuera, así que esos dos proyectos de Honda perdieron esas
  reuniones de golpe, y es probable que INV1 esté en rojo por eso.

**Otros con gente de dos fichas en la misma reunión** (los decide la ficha más vieja):

| Fichas | Reuniones con las dos | Quién gana |
|---|---|---|
| Clínica Oceánica + Grupo Petroil | 30 | Clínica Oceánica |
| Real Shipping & Trade + Logistics Plus | 10 | Real Shipping |
| Secure Title Latin America + Seguro Global | 8 | Secure Title |
| Credix + 4am Saatchi & Saatchi (agencia) | 5 | Credix |

Y «STLA TRUST SERVICES S.A.» (ficha manual del 5 oct, sin dominio, 2 reuniones), del grupo de Secure Title.
DISTELSA y Distribuidora Larce tienen fichas y dominios propios y no comparten reuniones: siguen bien como están.

#### 1.3 ¿Alcanza el nombre de la reunión? Medido en el TEC

Elías propuso que pese primero el nombre y después las personas (Ivania en AE, Marco en el otro). Medido sobre las 185
reuniones de «TEC»:

- **El nombre decide 159 de 185** (86 %): 91 dicen «TAE», 68 dicen «AE», 1 dice los dos y 25 no dicen ninguno.
- **La gente separa perfecto.** De las 41 personas del TEC que estuvieron en una reunión con nombre, **ninguna**
  aparece en reuniones de los dos proyectos: 26 solo en las de AE y 15 solo en las de TAE. Ivania Brenes está en 14 de
  AE y 0 de TAE. Marco Martínez está en 56 de **TAE** y 0 de AE.
- **De las 25 sin nombre, la gente decide 22**: 13 van a AE («Kick Off | TEC & Smarteam», «ANTEPROYECTO |
  EVALUACIONES»…) y 9 a TAE («Cena | Marco Martinez + Smarteam», «Lanzamiento de Workflow | RESCATE»…).
- **Quedan 3 con gente de los dos**: «Visita FUNDATEC», «Conversemos I Fundatec» y «Charlas I Unbound 2026». Son de
  verdad de los dos (FUNDATEC y un evento), y no hay regla que las reparta bien.
- **Lo que no sirve:** la gente de Smarteam. Heiver lleva los dos proyectos.

Con la regla «nombre → gente → por decidir», **las 25 reuniones que hoy están en los dos proyectos habrían quedado
en uno solo**: 17 por el nombre y 8 por la gente.

### 2. Las formas de modelarlo

#### A · Una ficha, con el proyecto como pared (la que se eligió el 28 oct, descartada el 29)

AE y TAE seguían en «TEC», con la marca «contexto por proyecto»: el clasificador de proyecto decidía por nombre y
gente, y los lectores «de la cuenta» (las 11 partes de la memoria y los 21 archivos de `getClientSessions`) aprendían a
leer solo el proyecto. Era lo que menos tocaba HubSpot, pero el trabajo grande estaba en enseñarle la pared a cada
lector, y un lector nuevo nacía leyendo la cuenta entera.

#### B · Cada entidad es su propia ficha (la que eligió Elías el 29 oct)

- **Gana:** el aislamiento sale gratis, porque todo ya se separa por ficha. Cada una tiene su cartera, su color, su
  memoria y sus documentos, y se ve cómo va cada una.
- **Cuesta, y cómo se resolvió:**
  - *Una empresa de HubSpot sirve a dos fichas.* Una empresa es de una sola ficha (R7b), así que la del ITCR queda en
    TAE y AE se queda sin empresa (sección 5). Lo que llega por la empresa (negocios, contactos, correos, tickets) sigue
    llegando a TAE.
  - *Hay que cambiar el resolver de cliente.* Sí, en un solo lugar: la regla de la sección 3, en `categorize.ts`.
  - *Hay que mover proyectos y re-resolver reuniones.* Dos scripts con simulacro (sección 6).
  - *De qué entidad es un proyecto nuevo del ITCR.* Lo copia TAE, la ficha de la empresa: AE solo actualiza los suyos.
    Un proyecto nuevo de AE se mueve a mano (sección 7, pregunta 1).
- **El grupo arriba, para la reportería, queda como etapa futura** (sección 6, E3): hoy nada necesita ver el TEC entero
  en un número, y cada ficha se reporta por su lado.

### 3. La regla de las reuniones

#### 3.1 Cómo decide el resolver (lo construido)

Vive en `lib/sessions/categorize.ts`, el resolver único (invariante 2), en los pasos 3 (dominio) y 5 (HubSpot), y en
ningún otro lado. Solo actúa cuando la ficha que dio el dominio es de un **grupo**: una dueña y las fichas que tienen
`comparteDominioConId` apuntándole. Las fichas sin grupo siguen como siempre.

1. **Lo que decidió una persona** gana siempre (`manualClientId`, paso 1 de la cascada, como hoy).
2. **El nombre de la reunión.** Si nombra a UNA sola ficha del grupo (sus `siglas`, o su nombre, con el mismo matcher
   del paso 6 acotado al grupo), es de esa. «TAE» no se lee como «AE»: la sigla es la palabra entera. Si nombra a las
   dos, por decidir.
3. **La gente.** Si todas las personas de afuera que se conocen son de la misma ficha, es de esa. La gente se aprende
   SOLO del nombre de las reuniones: ni de las que decidió la gente ni de las asignadas a mano, así que asignar una no
   mueve otras. Quien estuvo en las dos cuenta para la que tiene al menos el doble; parejo no cuenta. La gente de Smarteam
   tampoco (Heiver lleva las dos). La carga `resolve-client.ts` y /sessions la arma igual.
4. **Si nada decide**, la reunión queda **por decidir**: `resolvedClientId` null. En /sessions aparece en el grupo
   «Por decidir: TEC · TAE o TEC · AE», donde se asigna a mano. No alimenta a ninguna ficha mientras tanto.

Los contactos de HubSpot asociados al trato o al proyecto (la segunda fuente de gente que proponía la forma A) no se
usaron: el nombre y la gente de las reuniones ya deciden casi todo (sección 6).

#### 3.2 Lo que Elías preguntó si se le escapa

- **El nombre pesa, pero no es todo:** sin la gente, 26 reuniones del TEC quedarían por decidir. Con la gente bajan a 5.
- **Algunas reuniones son de verdad de las dos** (FUNDATEC, un evento, la del dominio de HubSpot). Quedan por decidir y
  las asigna una persona.
- **HubSpot sigue con una empresa para las dos.** Sus correos, tickets y contactos llegan a TAE. AE no los ve.

### 4. Lo que la forma A tenía que cerrar, y por qué ya no hace falta para el TEC

La tabla de la versión del 28 oct (la memoria de la cuenta, los 21 lectores de `getClientSessions`, la entrega
publicada de otro proyecto, lo aprendido en la preventa, lo fuera de alcance, las notas) era el trabajo de enseñarle
al código que el proyecto es una pared. Con dos fichas, cada una de esas lecturas ya filtra por ficha. Lo único que
sigue compartido es lo que llega por la empresa de HubSpot (sección 5), y eso queda en TAE.

Si Grupo INVE o Honda/Faco terminan siendo una ficha con proyectos separados (sección 7), la forma A vuelve a aplicar
para ellos, y esta sección es su punto de partida.

### 5. Qué pasa con «TEC- AE» y su empresa fusionada

- La ficha «TEC- AE» **no se fusiona**: es la ficha de AE («TEC · AE»). La pregunta 35 del roadmap («¿fusiono las dos
  TEC?») pasa a **no**, y la 6 (reapuntar «TEC- AE») se cierra sin reapuntar.
- Su empresa de HubSpot (56463266574) **ya no existe por sí sola**: HubSpot la fusionó en el ITCR (59180429929), una
  fusión de empresas no se deshace, y el ITCR ya es de TAE (un reapunte que choca con otra ficha responde 409, R7b).
  Además responde 200 con los datos del ITCR, así que cada lector y escritor de la empresa cruzaba con TAE. Por eso AE se
  queda **sin empresa**. El registro de Partner del portal de AE (51047287) y su cuenta de cobro ya cuelgan de esta ficha
  y no dependen de eso. INV13 e INV54, que marcaban «TEC- AE», se ponen en verde solas.

### 6. Etapas

Cada etapa se cierra con `tsc`, `eslint`, la suite, `/revisar` y `check:invariants`. Las escrituras van en simulacro
primero.

#### E1 · El TEC en dos fichas (construido el 29 oct)

> ⚠ `scripts/separar-tec.ts` y `scripts/reubicar-reuniones-compartidas.ts` ya no existen (7 nov): los reemplaza
> `scripts/separar-en-unidades.ts --empresa tec`, que hace las dos cosas en un solo paso, con simulacro (etapa U1). Lo de
> abajo queda como historia de qué movía cada uno.

- SQL aditivo `scripts/sql/2026-10-29-dominio-compartido.sql`: `Client.comparteDominioConId` (llave a `Client`, SET
  NULL) y su índice. Va ANTES del deploy: el resolver lee la columna.
- La regla de la sección 3.1 en `categorize.ts`, con su carga en `resolve-client.ts` y en /sessions
  (`cargar-sesiones-categorizadas.ts`). Pruebas: `lib/sessions/dominio-compartido.test.ts`.
- `scripts/separar-tec.ts`, después del deploy: «TEC» → «TEC · TAE» (sigla «TAE»), «TEC- AE» → «TEC · AE» (sigla «AE»,
  comparte el dominio de TAE), y el proyecto «AE | RE-IMPLEMENTACION HUBSPOT» a AE con cada fila que tiene `clientId` y
  `projectId` (el handoff, 10 alertas, 14 tareas, 48 hechos, la telemetría), más la propuesta «AE - Smartloop» y su
  preventa.
- `scripts/reubicar-reuniones-compartidas.ts`, justo después: cada reunión del grupo al dueño que dice el resolver, con
  sus vínculos a proyectos (al proyecto equivalente; los de una reunión por decidir se sueltan) y cada fila con
  `clientId` y `sessionId` (hechos, tareas, pendientes). La reunión manda sobre el proyecto. La lógica pura y sus
  pruebas: `lib/sessions/reubicar-entre-entidades.ts`.
- La copia de proyectos de las dos corre contra la empresa de la dueña y cada una toca solo lo suyo
  (`lib/hubspot/entidades-en-la-copia.ts`, con prueba de integración contra un HubSpot simulado). Las propuestas de estas
  fichas no suman reuniones sin dueño por dominio, y la agenda reparte por el título.
- **Simulacro del 30 oct** (con la separación simulada en memoria, porque la columna todavía no existe): **217
  reuniones**, las 185 de «TEC» y 32 que traen las siglas desde afuera («Hand Off | AE», «TAE - interno»; 31 sin dueña y
  1 de Smarteam). **AE 90** (77 por el nombre, 13 por la gente), **TAE 122** (110 por el nombre, 8 por la gente, 4
  asignadas a mano) y **5 por decidir**: «Dominio HubSpot / AE & TAE» (el nombre dice las dos), «Visita FUNDATEC»,
  «Charlas I Unbound 2026», «Conversemos I Fundatec» y «Reunión Duplicados Atom <> Fundatec» (gente de las dos).
  Vínculos: 2 se mueven al proyecto de AE, 25 se sueltan porque la reunión ya tenía el del otro proyecto, 2 por quedar
  por decidir, 3 por ser de un proyecto de otra ficha, 4 pasan a principal y se crean 134 (60 en AE y 74 en TAE). Filas:
  32 hechos, 3 tareas y 2 pendientes viejos cambian de ficha. Una reunión de BLUESAT que nombra al AE conserva a su dueña
  a mano: las siglas no le quitan nada a una ficha de afuera.
- **Terminado cuando:** después de los `--apply`, INV1 e INV2 no marcan nada del TEC, el proyecto de AE ve sus
  reuniones y el de TAE no ve ninguna de AE.

#### E2 · Lo que llega por la empresa de HubSpot, repartido (si hace falta)

- Los negocios, contactos, correos y tickets del ITCR llegan a TAE. Si AE necesita ver los suyos, se reparten por la
  gente de cada ficha (la misma que aprende el resolver). No se construye hasta que Elías lo pida.

#### E3 · El grupo arriba, para la reportería (futuro)

- Una vista por encima de las fichas («Instituto Tecnológico»: AE + TAE) para la cartera, la rentabilidad y el uso de
  Nexus, sin mezclar el contexto de los documentos. Hoy no existe y nada la necesita.

### 7. Preguntas de la parte 1

Respondidas el 7 nov por la parte 2: la 1 es la etapa U4; la 2 y la 3 se deciden cuando el aviso de U3 las muestre, con
el mismo flujo de U1; la 4 sigue abierta.

1. **Un proyecto nuevo del ITCR en HubSpot:** lo copia TAE. ¿Alcanza con moverlo a mano cuando es de AE, o quieres que
   la copia lo decida por el nombre («AE |»)?
2. **Honda y Faco (urgente):** ¿son la misma cuenta con proyectos aparte, o dos cuentas? Hoy se creó «Faco» y 15
   reuniones quedaron colgando de proyectos de Honda (INV1 en rojo por eso). Con la regla nueva, si son dos fichas,
   Faco puede compartir el dominio de Honda como AE comparte el de TAE.
3. **Grupo INVE y AnalisaLab:** ¿la integración con SAP de AnalisaLab pasa a «Grupo Inve» como un proyecto más, o
   AnalisaLab es su propia ficha y comparte el dominio de Grupo Inve? Sus 23 reuniones con el cliente ya están en
   «Grupo Inve».
4. **Otros pares:** Clínica Oceánica y Grupo Petroil (30 reuniones juntas), Real Shipping y Logistics Plus (10),
   Secure Title y Seguro Global (8). Tienen dominios distintos: la regla nueva no los toca. ¿Alguno es una sola cuenta?
