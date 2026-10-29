# Empresas que comparten dominio sin compartir contexto — plan

> Estado: **plan, sin código ni datos tocados**. Medido en producción (solo lectura) y en HubSpot el 2026-10-28.
> Lo pidió Elías ese día: el TEC y la AE «usan el mismo dominio, pero son casi empresas distintas, son escuelas
> dentro del TEC que funcionan como empresas separadas»; lo mismo con Grupo INVE y AnalisaLab. «Es importante que no
> se mezcle el contexto de un proyecto en otro […] que un diagnóstico salga solamente del TEC- AE y no del TAE».
>
> **Corregido el mismo 28 oct con la respuesta de Elías** a la primera versión (que proponía una ficha por entidad):
> «con la separación de proyectos debería bastar. Ahí el tema está en que Nexus y el analizador de sesiones entienda
> bien la diferencia de sesiones entre proyectos […] lo que más pesa debería ser el nombre de la sesión». Y para
> compartir algo entre entidades: **cada documento tiene su propia área para hacerlo**, sin una vista de grupo.

## En una frase

La pared pasa a ser el **proyecto**. AE y TAE siguen en la ficha «TEC». En las fichas marcadas como **«contexto por
proyecto»**, el clasificador decide el proyecto de cada reunión primero por su **nombre** y después por **la gente
de cada proyecto**. Cuando no puede decidir, la reunión queda **por decidir** y no alimenta a ningún proyecto.
Además, todo lo que hoy se lee «de la cuenta» (la memoria y las lecturas de la cuenta entera) se lee solo del
proyecto. Las fichas sin la marca siguen como hoy.

No se re-litiga lo decidido (DECISIONS «Sesión → cliente → proyecto»): que una reunión de una entidad del mismo grupo
caiga en la otra **no es un leak de seguridad** (es el mismo cliente, con el mismo acceso). Lo nuevo es otra cosa: para
las fichas que Elías marque, esa reunión **sí es mezcla de contexto** para los documentos. El resolver de cliente
(`categorize.ts`, invariante 2) **no se toca**: la reunión sigue siendo de la ficha «TEC», y lo nuevo vive un paso más
abajo, en la elección del proyecto.

---

## 1. Lo que encontré

### 1.1 Cómo decide Nexus de quién es una reunión, y dónde se mezcla un caso como el del TEC

| # | Lugar | Qué hace hoy | Qué pasa con dos entidades en una ficha |
|---|---|---|---|
| 1 | `categorize.ts`, paso 3 (dominio) | Recorre las fichas en orden de creación (`ORDEN_DE_CLIENTES_PARA_ATRIBUIR`) y se queda con **la primera** que tenga un dominio de la reunión. | Gana siempre la ficha más vieja. Por eso «TEC- AE» (creada el 22 jul, sin dominio) nunca recibió una reunión. Con el plan da igual: AE vive en «TEC». |
| 2 | `categorize.ts`, paso 5 (HubSpot) | Dominio → empresa de HubSpot → la ficha que la tiene. | Un dominio es UNA empresa de HubSpot, y una empresa es de UNA ficha (índice único de R7b). |
| 3 | Clasificador de proyecto (`classify-session-project.ts`, IA) | Con 2+ proyectos, le pasa a la IA el título, los correos de los participantes, los nombres de los proyectos y el texto. Vincula un proyecto principal y otros como secundarios (confianza ≥ 0,4). | La IA **ve** «AE |» y «TEC TAE |» en los nombres y aun así cruza: las reuniones de AE quedan como secundarias en TAE y al revés. Las personas le llegan como correos sueltos, sin saber de qué proyecto es cada una. |
| 4 | Chokepoint (`project-sources.ts`) | Filtra por ficha: deja pasar toda reunión cuya dueña sea la ficha del proyecto. | Una reunión de AE vinculada al proyecto de TAE pasa el filtro: es de la misma ficha. |
| 5 | Lo que lee cada vínculo | Handoff: principal, o secundario ≥ 0,4 si aplica la relevancia de venta. Avance del cronograma y hechos: principal o secundario ≥ 0,4. La lectura después de la reunión (minuta, tareas, pedidos fuera de alcance, etapa): el principal. | Todo lo que cruzó por el punto 3 alimenta al otro proyecto. |
| 6 | Documentos «solo elegidas» (diagnóstico, planificación, ejecución, kickoff, integraciones, entrega) | Solo leen las reuniones que una persona eligió para ese documento. | Las reuniones están a salvo si la persona elige bien, **pero su memoria de la cuenta es de toda la ficha** (punto 7). |
| 7 | Memoria de la cuenta (`lib/memoria/cargar.ts`, `memoriaDeLaCuenta`) | Ficha de datos, procesos, hechos y compromisos de la cuenta, correos y timeline de HubSpot, personas y tickets, notas del equipo, lo aprendido en la preventa, lo fuera de alcance, la entrega publicada de otro proyecto, la auditoría del portal. | Todo es por ficha: el diagnóstico de AE leería los hechos y compromisos de TAE, sus correos de HubSpot y la entrega publicada del otro proyecto. |
| 8 | Lecturas de la cuenta entera (`getClientSessions`) | 21 archivos fuera de pruebas: preventa, análisis de la venta, agente de procesos, ficha propuesta, exploración, preguntas de contexto, servicio recurrente, `analyze`… | Leen todas las reuniones de la ficha, de los dos proyectos. |
| 9 | Copia de proyectos de HubSpot (`sync-projects.ts`) | Trae a la ficha los proyectos asociados a su empresa. | Los dos proyectos del TEC cuelgan del ITCR en HubSpot y llegan a «TEC». Con el plan, eso **está bien**: HubSpot no cambia. |

Conclusión del código: la ficha es la única pared que existe hoy. Para que el proyecto sea pared hacen falta **dos
cosas**: que el clasificador no cruce (puntos 3 y 5), y que lo que se lee «de la cuenta» se lea del proyecto
(puntos 7 y 8). La primera sola no alcanza: con una clasificación perfecta, el diagnóstico de AE igual leería los
hechos, compromisos y correos de TAE por la memoria de la cuenta.

### 1.2 Los casos

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

### 1.3 ¿Alcanza el nombre de la reunión? Medido en el TEC

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

## 2. Las formas de modelarlo

### A · Una ficha, con el proyecto como pared (recomendada, la que eligió Elías)

AE y TAE siguen en «TEC». La ficha lleva la marca «contexto por proyecto», y cada proyecto, los nombres con que el
equipo lo llama en los títulos («AE», «TAE»). Con la marca:

1. El clasificador decide un solo proyecto por reunión, sin secundarios automáticos.
2. Los lectores «de la cuenta» leen solo el proyecto que les toca.
3. Para compartir algo entre proyectos, una persona lo trae a propósito al área de contexto de ese documento.

- **Gana:**
  - HubSpot no cambia: una empresa, la del ITCR, y los proyectos colgando de ella como hoy.
  - No se mueve ninguna reunión de ficha. El resolver de cliente no se toca.
  - La cobranza y los hermanos (`resolverHermanos`) siguen dentro de una ficha.
  - Es lo que el equipo ya hace: los títulos dicen «AE |» y «TAE |».
- **Cuesta:**
  - Hay que enseñarle la pared a los lectores de la cuenta: las 11 partes de la memoria y los 21 archivos que usan
    `getClientSessions`.
  - Un lector nuevo nace leyendo la cuenta entera. Por eso la pared necesita una guarda que obligue a cada lector a
    declarar qué hace con la marca (como ya pasa con `lib/memoria/consumidores.ts`). Si no, se repite el problema
    de DISTELSA: la regla copiada en varios lugares.

### B · Cada entidad es su propia ficha, con un grupo arriba (la recomendación anterior)

- **Gana:** el aislamiento sale gratis, porque todo ya se separa por ficha.
- **Cuesta:**
  - Una empresa de HubSpot sirve a varias fichas.
  - Hay que mover proyectos, re-resolver reuniones y cambiar el resolver de cliente.
  - Hay que decidir de qué entidad es un proyecto nuevo del ITCR.

Elías la descartó: el TEC trabaja como **una** cuenta con proyectos distintos, y la separación que importa es la de
los documentos.

## 3. Recomendación

**La A.** El nombre de la reunión y la gente ya separan al TEC casi solos (sección 1.3): el clasificador solo tiene
que dejar de adivinar cuando hay una pista firme. El trabajo grande no está en el clasificador sino en la sección 4:
lo que hoy se lee «de la cuenta».

### 3.1 Cómo decide el clasificador, con la marca

Va **antes** de la IA, en `classify-session-project.ts`, y solo en fichas con la marca:

1. **Lo que decidió una persona** gana siempre, como hoy (los vínculos tocados a mano no se tocan).
2. **El nombre de la reunión.** Si el título dice el nombre de **un solo** proyecto (sus «nombres en los títulos»,
   como `Client.siglas` pero por proyecto), va a ese, como principal y **sin secundarios**. No se llama a la IA, así
   que también ahorra.
3. **La gente del proyecto.** Si el título no dice ninguno, se miran los participantes del cliente (los que no son de
   Smarteam). La gente de un proyecto se toma de dos lados:
   - las reuniones de ese proyecto que decidió el nombre o una persona. Nunca las que decidió la IA, para que un
     error no se alimente a sí mismo;
   - los contactos que HubSpot asocia al trato o al proyecto. Hoy Nexus no los copia: solo copia los contactos de la
     empresa, que en el TEC son de los dos.

   Si **todas** las personas conocidas apuntan al mismo proyecto, va a ese. Una persona que ya estuvo en los dos no
   cuenta.
4. **Si nada decide** (título con los dos nombres, gente de los dos o nadie conocido), la reunión queda **por
   decidir**. La IA puede proponer un proyecto, pero hasta que una persona lo confirme no alimenta a ninguno. Aparece
   en el panel de reuniones de los proyectos de la ficha con «¿De qué proyecto es?». En el TEC serían 3 de 185.

Secundarios: con la marca, **solo los pone una persona**. Así una reunión de verdad compartida (FUNDATEC) puede ir a
los dos, y el que la puso sabe que lo hizo.

### 3.2 Lo que Elías preguntó si se le escapa

- **El nombre pesa, pero no es todo:** sin la gente, 25 reuniones del TEC (14 %) quedarían en manos de la IA. Con la
  gente bajan a 3.
- **Algunas reuniones son de verdad de los dos** (FUNDATEC, eventos, un kickoff general). Necesitan un lugar: por
  decidir, o en los dos si una persona lo dice.
- **Lo que más pesa no es el clasificador.** Con las reuniones bien separadas, el diagnóstico de AE igual leería los
  hechos, compromisos y correos de TAE por la memoria de la cuenta. Eso se cierra en la sección 4.
- **HubSpot sigue con una empresa para los dos.** Sus correos, tickets y contactos llegan juntos. Se filtran por la
  gente de cada proyecto (sección 4).

## 4. Lo que separar por proyecto todavía no cubre, y qué lo cierra

Todo esto aplica solo a fichas con la marca. Sin la marca, todo sigue igual.

| Lo que hoy se lee de toda la ficha | Qué lo cierra con la marca |
|---|---|
| **Vínculos secundarios del clasificador** (25 reuniones del TEC en los dos proyectos) | Sin secundarios automáticos: solo los pone una persona (sección 3.1). |
| **Hechos y compromisos de la cuenta** (memoria) | `memoriaDeLaCuenta` con `projectId` lee los del proyecto (`leerHechos(clientId, projectId)` ya existe y lo usa la memoria del proyecto). |
| **Personas, tickets y correos de HubSpot** (memoria) | Solo los de la gente del proyecto (sección 3.1, paso 3). Un correo o ticket sin nadie del proyecto no entra. |
| **Entrega publicada de otro proyecto** (memoria) | No se lee. |
| **Lo aprendido en la preventa** (memoria) | Solo la del trato del proyecto. |
| **Lo fuera de alcance** (memoria) | Solo los pedidos del proyecto. Los que no tienen proyecto quedan fuera. |
| **Notas del equipo** (memoria) | Solo las del proyecto, si la nota lo tiene; las de la cuenta, no. |
| **Procesos y ficha de datos** (memoria) | Se comparten. Son de la institución, y en el TEC están vacíos hoy. Si Elías quiere separarlos, ver la pregunta 4. |
| **Auditoría del portal** (memoria) | Se comparte: es el mismo portal de HubSpot. |
| **`getClientSessions`** (21 archivos) | Los lectores que corren para un proyecto pasan a `getProjectMemberSessions`. Los que son de verdad de la cuenta (ficha propuesta, preguntas de contexto, exploración de la cuenta) piden el proyecto o leen solo las reuniones por decidir. Cada uno lo declara en un registro con prueba, como `consumidores.ts`. |
| **Compartir entre proyectos** (la junta) | En el área de contexto de cada documento: una persona elige una reunión o un hecho del otro proyecto y queda rotulado «de otro proyecto». No hay vista de grupo. |

## 5. Qué pasa con «TEC- AE» y su empresa fusionada

- La empresa 56463266574 **ya no existe por sí sola**: HubSpot la fusionó en el ITCR (59180429929), y una fusión de
  empresas no se deshace. **Reapuntarla no se puede**: el ITCR ya es de «TEC», y un reapunte que choca con otra ficha
  responde 409 (R7b).
- Con el plan, AE vive en «TEC», así que la ficha «TEC- AE» sobra. Está vacía: 0 reuniones, 0 bloques, 0 proyectos de
  trabajo. **Recomendación: fusionarla en «TEC»** con `scripts/merge-duplicate-clients.ts`, en simulacro primero. No
  arrastra nada y pone verde INV13 para este caso.
- En el roadmap: la **pregunta 35** («¿fusiono las dos TEC?») pasa a **sí**, y la **6** (reapuntar «TEC- AE») se
  retira porque ya no se puede ni hace falta.

## 6. Etapas

Cada etapa se cierra con `tsc`, `eslint`, la suite, `/revisar` y, como toca el contexto de las reuniones,
`check:invariants`. Las escrituras masivas van en simulacro primero.

### E0 · Contener lo que ya se mezcló (sin código)

- En el proyecto de TAE, quitar las reuniones de AE con la «X» del panel, y al revés: las 25 en los dos proyectos.
  17 se reparten por el nombre y 8 por la gente (sección 1.3). Las 2 de AE que son principal en TAE pasan a AE. El
  clasificador respeta lo que tocó una persona.
- Honda / Faco (pregunta 2) antes de que esos dos proyectos de Honda generen algo sin las 15 reuniones.
- **Terminado cuando:** una consulta de solo lectura no encuentra reuniones con «AE» en el nombre vinculadas a TAE,
  ni al revés, y INV1 no marca nada entre Faco y Honda.

### E1 · La marca y los nombres del proyecto

- SQL aditivo:
  - `Client.contextoPorProyecto Boolean @default(false)`;
  - `Project.nombresEnTitulos String[] @default([])`, que escribe una persona; la pantalla sugiere lo que va antes
    de la «|» en el nombre de HubSpot («AE», «TEC TAE»).
- Pantalla: en la ficha, el interruptor «Cada proyecto tiene su propio contexto» (solo con permiso de configurar la
  ficha); en cada proyecto, sus nombres en los títulos.
- Fusionar «TEC- AE» en «TEC» (sección 5).
- **Terminado cuando:** «TEC» y «Grupo Inve» tienen la marca y sus proyectos tienen nombres; INV13 ya no marca
  «TEC- AE».
- **Pruebas:** `check:esquema` ve las columnas; prueba unitaria del matching de nombres de proyecto en títulos, que
  reusa `match-por-titulo.ts` sin copiarlo, incluido «TAE» que contiene «AE».

### E2 · El clasificador con nombre y gente

- El pre-paso de la sección 3.1 en `classify-session-project.ts`: lo decidido por una persona, después el nombre,
  después la gente, y si no, por decidir. Sin secundarios automáticos con la marca. Las fichas sin marca no cambian.
- La gente del proyecto sale de las reuniones decididas por nombre o por una persona. Los contactos de HubSpot
  asociados al trato o al proyecto entran en una segunda vuelta: hay que leer las asociaciones del objeto 0-970 y del
  trato a contactos, que hoy no se copian.
- «Por decidir»: un estado visible en el panel de reuniones de la ficha, con la propuesta de la IA y un botón por
  proyecto.
- **Terminado cuando:** el simulacro sobre «TEC» da unas 159 por nombre, 22 por gente y 3 por decidir, y en «Grupo
  Inve» reparte lo de AnalisaLab como Elías espera. Delta 0 en las fichas sin marca.
- **Pruebas:** casos unitarios: nombre de un proyecto; los dos nombres → por decidir; sin nombre con gente de uno;
  gente de los dos → por decidir; lo decidido por una persona no se toca; sin marca → igual que hoy. Una prueba que
  impida que la gente se aprenda de vínculos puestos por la IA.

### E3 · La memoria y las lecturas de la cuenta, con la marca

- `memoriaDeLaCuenta` con `projectId` y la marca: cada parte se lee según la tabla de la sección 4. `consumidores.ts`
  ya declara a cada lector; se le suma qué hace con la marca.
- Los 21 lectores de `getClientSessions` se reparten entre los que pasan a leer el proyecto y los que son de la
  cuenta. Un registro con prueba estructural obliga a todo lector nuevo a declararse.
- **Terminado cuando:** el diagnóstico de AE no cambia si se le agrega una reunión, un hecho o un compromiso de TAE.
- **Pruebas:** integración con una ficha con la marca y dos proyectos (memoria, chokepoint y lecturas de la cuenta);
  escaneo estructural de los lectores de `getClientSessions`; `frontera.test.ts` sigue verde.

### E4 · Limpiar lo mezclado

- Reclasificar «TEC» y «Grupo Inve» con el clasificador nuevo (simulacro → `--apply`).
- Los hechos que quedan en el proyecto equivocado se mueven o se desestiman. Las 3 tareas de AE en TAE se mueven a
  mano o con INV42.
- Los handoff ya generados no se rehacen solos: se le muestra al CSE la lista de los que leyeron reuniones del otro
  proyecto, y él decide.
- Invariante nueva: en una ficha con la marca, ninguna reunión cuyo nombre dice un proyecto alimenta a otro, ni le
  deja hechos o tareas.
- **Terminado cuando:** esa invariante y INV1 están verdes.

### E5 · Compartir a propósito, en cada documento

- En el área de contexto de cada documento (la que ya existe por documento), una persona puede traer una reunión o un
  hecho de otro proyecto de la misma ficha. Se ve rotulado «de otro proyecto», y queda guardado quién lo trajo.
- **Terminado cuando:** Elías arma un documento de AE con una reunión de TAE elegida a mano y la ve rotulada; sin
  elegirla, no aparece.

## 7. Preguntas que siguen abiertas

Ya no preguntamos lo que la respuesta del 28 oct dejó claro:
- si HubSpot separa las escuelas: no, queda como está;
- qué ve la junta: cada documento comparte lo suyo;
- si el TEC son fichas aparte: no, son proyectos de una ficha.

1. **El TEC:** ¿hay un tercer proyecto aparte, FUNDATEC por ejemplo? Las 3 reuniones que no se pueden repartir son de
   FUNDATEC y de un evento. ¿Van a los dos proyectos o quedan por decidir?
2. **Honda y Faco (urgente):** ¿son la misma cuenta con proyectos aparte, o dos cuentas? Hoy se creó «Faco» y 15
   reuniones quedaron colgando de proyectos de Honda. Con este plan, lo natural sería una ficha con la marca.
3. **Grupo INVE y AnalisaLab:** ¿la integración con SAP de AnalisaLab pasa a «Grupo Inve» como un proyecto más, con
   la marca, y la ficha «Analisalab» se fusiona? Sus 23 reuniones con el cliente ya están en «Grupo Inve».
4. **Lo que se comparte en la ficha:** ¿los procesos y la ficha de datos del TEC son uno solo para la institución, o
   AE y TAE tienen procesos distintos? Hoy los dos están vacíos.
5. **Otros pares:** Clínica Oceánica y Grupo Petroil (30 reuniones juntas), Real Shipping y Logistics Plus (10),
   Secure Title y Seguro Global (8). ¿Alguno es una sola cuenta con proyectos que hay que separar?
6. **«TEC- AE»:** ¿la fusiono en «TEC»? Está vacía, así que no se pierde nada.
