# Checklist de prueba clickeada — «Los cuatro contextos» (2026-08-16)

26 commits sin subir. El gate automático ya pasó (tsc · 2.930 tests · build · lint en la línea
base) y la auditoría adversarial encontró y arregló **8 defectos reales** que ni los tests ni el
build ven. Lo que sigue es lo único que ninguna máquina puede hacer: **mirarlo con los ojos**.

> ### ⛔ Antes de empezar — el orden importa
>
> **1.** Aplicar las **tres migraciones SQL** (son aditivas: el código viejo las ignora, así que se
> pueden correr antes del deploy). Después de cada una: `npx prisma generate` y **reiniciar el
> servidor de dev**. Saltarse el reinicio hace que las escrituras fallen **en silencio**.
>
> ```bash
> npx prisma db execute --file scripts/sql/2026-08-16-duenio-manual-procedencia.sql --schema prisma/schema.prisma
> ```
> ```bash
> npx prisma db execute --file scripts/sql/2026-08-16-estado-y-etapa-propuestos.sql --schema prisma/schema.prisma
> ```
> ```bash
> npx prisma db execute --file scripts/sql/2026-08-16-project-brief.sql --schema prisma/schema.prisma
> ```
>
> **2.** Sembrar el agente del resumen por proyecto (si no, el botón responde «el agente no está
> sembrado», que es correcto pero no prueba nada):
> ```bash
> npx tsx scripts/create-project-brief-agent.ts
> ```
>
> **3.** Levantar contra la base real: `npm run dev:prod` (puerto **3004**). Es el mismo dato que
> vas a ver después del deploy.

> ⚠ Todo lo de abajo es seguro salvo donde diga **ESCRIBE**. Los dos que escriben afuera están
> marcados y van al final a propósito.

---

## 1 · `/sessions` — que el material dejara de ser invisible

Es el hallazgo que reordenó el plan entero: **el 52,7 % de las reuniones de los últimos 3 meses no
tiene transcripción, y el 84 % de ésas nunca se grabó.** Lo que se ve, baja.

### 1.1 La alerta de cobertura
Abrí **`/sessions`**.
- ✅ Arriba tiene que haber un cartel ámbar con el porcentaje **partido**: cuánto falta con el
  cliente y cuánto puertas adentro.
- ✅ El número de puertas adentro debería ser **peor** que el del cliente (61 % vs 46 % al medirlo).
  Es el dato que justifica el empujón interno.

### 1.2 Las internas subieron y tienen buscador
- ✅ El grupo **«Interna»** tiene que estar **arriba**, no al final después de los 169 clientes.
- ✅ Su rótulo dice su volumen y su cobertura.
- ✅ Abrir el selector de cliente: ahora tiene **campo de búsqueda**. Escribí tres letras de un
  cliente y confirmá que filtra. (Antes eran 169 nombres en un scroll de 224 px, sin input.)
- ✅ Abrir un grupo grande no cuelga el navegador: pagina de a 100 con «Ver más».

### 1.3 Los tres estados de una reunión
Recorré la lista buscando los tres puntos de color:
- ✅ **Con transcripción** · **sin transcripción** · **sin contenido** (el punto gris, que estaba
  escrito hace meses y nunca se había renderizado).
- ✅ Una reunión **futura** aparece **marcada como futura**, no escondida. Hay 459 en el corpus por
  la agenda recurrente de Google; antes se cortaban en silencio.
- ✅ El contador del encabezado **no las mezcla** con las que ya pasaron.

### 1.4 Queda registrado quién reasigna **ESCRIBE (en Nexus)**
1. Tomá una reunión interna sin dueño y asignale un cliente.
2. ✅ Después de recargar, la reunión tiene que mostrar **quién** la reasignó y **cuándo**, y
   distinguir si fue una decisión humana o una adopción automática.
   > Esto es lo que hace reversible el incidente del demo: antes, una reunión adoptada
   > desaparecía del buscador **para siempre** y no había forma de saber si alguien lo había
   > decidido o si había pasado solo.

---

## 2 · El widget del proyecto — el resumen y la sugerencia de estado

Elegí un proyecto **trabado de verdad** (uno con atraso o bloqueo real). Los dos bloques nuevos
viven ahí.

### 2.1 El resumen del proyecto **← la prueba de fondo**
1. En el widget, buscá el bloque **«Cómo va este proyecto»** y apretá **Regenerar** (~30 s; te
   avisa al terminar).
2. **Leelo con los ojos y hacete UNA pregunta: ¿me dice algo que no sabía?**
   - Si la respuesta es **no**, el problema es el prompt, no el código — avisame y lo ajusto.
   - Si dice algo **falso**, es más grave: significa que una afirmación pasó sin fuente válida.
     Copiámelo tal cual.
3. ✅ Cada afirmación tiene que **citar de dónde salió** (una reunión, el handoff, el estado de
   HubSpot, una desviación).
4. ✅ Si descartó una parte de lo que el modelo escribió (por citar mal), **lo dice**. Es el único
   indicador de calidad del circuito: sin él, un resumen corto se lee como «proyecto tranquilo».
5. ✅ **Que mencione el handoff.** Es el arreglo del último commit: antes el resumen se armaba sin
   el único documento que dice qué se prometió.
6. Generá una reunión nueva o regenerá el handoff, y volvé al widget.
   - ✅ El resumen tiene que decir **por qué** quedó viejo, no un cartel genérico.

### 2.2 La sugerencia de estado de HubSpot
En la **ficha de cuenta** (`/customer-success/<cliente>`), en la fila del proyecto:
- ✅ Si el estado y el motivo cargados en HubSpot **se contradicen** (ej.: motivo «Atraso por X»
  pero estado «En curso»), tiene que aparecer un chip ofreciendo el estado correcto.
- ✅ Si no se contradicen, **no aparece nada**. El chip no es decorativo.
- ⚠ El chip **no tiene «Descartar»** a propósito: los dos valores salen del mismo registro de
  HubSpot, así que descartar escondería la contradicción en vez de arreglarla. La otra salida
  legítima (borrar el motivo viejo en HubSpot) está escrita en el propio chip.

---

## 3 · Permisos — que el CSE entre a su pantalla y a nada más

> ⛔ **Con un usuario que NO sea super admin.** El super admin pasa todos los permisos y no prueba
> absolutamente nada. Prendé el permiso en `/team`, **recargá la página** (se cachea por sesión) y
> entrá con ese usuario.

### 3.1 El CSE entra
- ✅ **`/customer-success`** abre. Antes el CSE era el único rol operativo que **no podía entrar a
  su propia pantalla**, mientras Ventas, Desarrollo y Marketing entraban por ser «roles que ven
  todo».
- ✅ Ve **solo sus clientes**, no la cartera entera.
- ✅ **No** ve uso, licencias ni MRR de partner (eso sigue siendo de CSL y super admin, por los
  términos con HubSpot).

### 3.2 Los controles que no le tocan **← el arreglo de la auditoría**
Con ese mismo usuario CSE, en `/customer-success`:
- ✅ **No** aparecen los botones «Actualizar señales de HubSpot» ni «Correr watchdog».
  > Antes se pintaban, y al apretarlos daban un toast azul de «puede tardar un par de minutos»
  > seguido de un 403.
- ✅ El chip de salud de un proyecto **no es clickeable** (es texto, no un botón deshabilitado).
- ✅ En la ficha de cuenta, el chip rojo «En riesgo (propuesto por el agente)» **se sigue viendo**
  —la información sirve— pero **sin** Confirmar/Descartar, y dice quién lo resuelve.

### 3.3 Y con un usuario que SÍ cura (CSL o super admin)
- ✅ Los cuatro controles **vuelven a aparecer** y funcionan.
- ✅ Fijá la salud de un proyecto a mano: si el servidor rechazara, la fila **tiene que volver a
  su valor anterior**. Antes se quedaba mostrando el valor nuevo con un toast rojo de 4 segundos
  al lado: si no lo veías, creías que había quedado registrado.

### 3.4 Regresión — que nadie perdió nada
- ✅ Entrá con **Ventas**, **Desarrollo** y **Marketing**: los tres tienen que seguir viendo
  Éxito del cliente igual que antes.

---

## 4 · El cronograma — aprobar el plan y medir si creció

Es la parte con **más consecuencia**: de 132 proyectos activos, solo 14 tenían la foto del plan
congelada, así que en 9 de cada 10 el trabajo excedido era **inmedible**.

### 4.1 Aprobar el plan **ESCRIBE (en Nexus)**
1. Abrí un proyecto con cronograma y **fecha de arranque** definida → pestaña **Cronograma**.
2. ✅ Junto a **«Confirmar detalle»** tiene que estar **«Aprobar el plan»**.
3. Apretalo.
   - ✅ Confirma que quedó aprobado.
   - ✅ Apretalo **de nuevo**: tiene que decir **«ya estaba aprobado»** — ni error, ni una versión
     nueva celebrada. Aprobar dos veces el mismo plan no versiona, y está bien.
4. En un proyecto **sin** fecha de arranque:
   - ✅ El botón **no aparece**. Un botón que solo sirve para dar error enseña a ignorar los
     botones.

### 4.2 ⭐ La foto deja de tragarse lo nuevo **← el punto crítico de todo el bloque**
Sobre el proyecto que acabás de aprobar:
1. **Agregá una tarea a mano** a cualquier fase.
2. Andá a la cartera (`/customer-success`) y mirá ese proyecto.
   - ✅ Tiene que aparecer como **trabajo agregado** (alcance excedido).
   > Antes daba **cero para siempre**: cada vez que se regeneraba una fase, la foto absorbía las
   > tareas nuevas con sus ids, así que el proyecto podía duplicar su trabajo y el control decía
   > que no había crecido nada.
3. Ahora **regenerá esa fase** con la IA.
   - ✅ El número de trabajo agregado **no explota**: una tarea que ya estaba en la foto sigue
     siendo la misma promesa aunque cambie de id. Solo cuenta lo genuinamente nuevo.
4. **Borrá** una tarea que estaba en el plan aprobado.
   - ✅ La promesa **sigue registrada**. Borrar la evidencia sería la forma más silenciosa de que
     el alcance cierre siempre.

---

## 5 · Los documentos — que dejaran de ignorar lo que ya sabíamos

### 5.1 El handoff menciona el bloqueo
1. Elegí un proyecto que en HubSpot esté **bloqueado o atrasado con motivo cargado**.
2. Regenerá su handoff.
3. ✅ **Leelo**: el documento tiene que mencionar ese estado. Antes ningún redactor lo veía,
   aunque el dato estuviera espejado hacía meses.

### 5.2 Los documentos saben quién dijo qué
En cualquier documento generado hoy (handoff o avance del cronograma):
- ✅ Cuando cita una reunión, tiene que poder distinguir **lo que dijo el cliente** de **lo que
  dijimos nosotros**. Buscá alguna frase donde eso se note.
- ✅ Una reunión **sin transcripción** no debería producir afirmaciones sobre su contenido — que
  ocurrió es un hecho, qué se habló no.

---

## 6 · Lo que escribe AFUERA — va al final a propósito

### 6.1 Aceptar la sugerencia de estado **ESCRIBE EN HUBSPOT**
1. Sobre el chip de la sección 2.2, apretá **Aceptar**.
2. ✅ **Abrí HubSpot y miralo con los ojos.** El estado del proyecto tiene que haber cambiado.
3. Volvé a Nexus y recargá.
   - ✅ La pantalla muestra **lo que volvió de HubSpot**, no lo que pediste. Si HubSpot lo
     normalizó o lo rechazó en silencio, tenés que ver el resultado real.

### 6.2 La carrera que el circuito tiene que ganar
1. Antes de aceptar una sugerencia, **cambiá ese mismo campo a mano en HubSpot**.
2. Volvé a Nexus (sin recargar) y aceptá la sugerencia vieja.
   - ✅ Tiene que **negarse**, y decirte **qué dice HubSpot ahora**.
   > Es la garantía propia de esta función: la copia que Nexus tiene puede tener días, así que
   > aceptar sobre una copia vieja revertiría en silencio algo que acabás de decidir a mano — el
   > peor resultado posible para algo cuyo argumento de venta es «mantené el tablero al día».

### 6.3 Cortar la red a mitad
1. Con las herramientas del navegador, cortá la red y aceptá una sugerencia.
   - ✅ **No** puede decir «listo». Tiene que decir que falló.

---

## Si algo falla

Copiame **el texto exacto** del error o del cartel y en qué pantalla estaba. Los tres modos de
falla que más me interesan, en orden:

1. **Un número que miente sin avisar** (el resumen dice algo falso, el alcance dice cero, un
   contador no cuadra). Es lo más caro: nada se rompe, simplemente el dato está mal.
2. **Un botón que da error.** Significa que quedó un control ofrecido a alguien que no puede
   usarlo — la familia entera que la auditoría acaba de cerrar.
3. **Un documento vacío o genérico.** Ahí el problema suele ser el prompt, y se arregla sin deploy.

---

## Y después

Recién cuando esto pase, la **fase 12**: sellar el plan de los **118 proyectos** que nunca tuvieron
foto. Va con simulación primero, y el aviso escrito adentro del propio documento
(*«línea base tomada el <fecha>; no refleja los cambios anteriores»*). Ese orden lo pediste vos y
tiene razón: escribe sobre 118 proyectos y no se deshace solo.
