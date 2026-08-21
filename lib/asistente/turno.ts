/**
 * lib/asistente/turno.ts — UN TURNO DE LA CONVERSACIÓN.
 *
 * Arma el pedido, llama a Claude por el chokepoint de siempre (`lib/anthropic.ts`, que mide y
 * topea), persiste los dos turnos y devuelve la respuesta. ⛔ NO ESCRIBE EL DOCUMENTO: cuando hay
 * acuerdo, el modelo emite una **tool call** con la instrucción, y aplicarla es otro acto, con
 * otro botón y otro permiso.
 *
 * ── POR QUÉ UNA TOOL Y NO «## PROPUESTA» EN PROSA ────────────────────────────────────────────
 * El borde entre «seguimos hablando» y «hay acuerdo» tiene que ser detectable POR MÁQUINA. Un
 * `tool_use` lo es; un encabezado en prosa se rompe la primera vez que el modelo escribe
 * «## Propuesta:» con dos puntos. Y la tool NO ejecuta nada — emite texto, igual que
 * `runDocumentAssist`, cuyo docblock ya dice que la persistencia es del caller.
 *
 * ── EL MODELO, Y ESTÁ MEDIDO ─────────────────────────────────────────────────────────────────
 * Sonnet 5. La medición del 2026-08-19 contra producción: el prefijo del peor cronograma de la
 * cartera son **1.662 tokens**, arriba del mínimo cacheable de Sonnet 5 (1.024) — así que la
 * caché de prefijo SÍ funciona y los turnos 2+ leen a 0,1×.
 *
 * ⚠ Y por eso Haiku 4.5 NO es la opción barata que parece: su mínimo cacheable es **4.096**, el
 * más alto de la familia. A este tamaño de prompt no cachea NUNCA —sin error y sin log— así que
 * paga el prefijo entero en cada turno. En una conversación larga puede salir más caro que
 * Sonnet. Cambiar de modelo acá no es cambiar una constante: hay que volver a medir.
 *
 * ⛔ Y el modelo es FIJO POR HILO (`lib/asistente/hilo.ts`): es parte de la clave de la caché.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { agregarTurno, huellaDeContexto, type HiloConTurnos } from "./hilo";
import { contextoDeCronograma, contextoDeDocumento } from "./contexto";
import { PIEZA_CRONOGRAMA } from "./piezas";
import { describirOperaciones, type Operacion } from "@/lib/timeline/operaciones";
import { leerAcuerdo, marcaDeAcuerdo, type CambioAcordado } from "./acuerdo";
import {
  bloqueDePendientes,
  fusionarPendientes,
  pendientesDelHilo,
  podarIrresolubles,
} from "./acuerdo-vivo";

/**
 * ⚠ RE-EXPORTADO POR COMPATIBILIDAD. Los marcadores se mudaron a `acuerdo.ts` para cortar un
 * ciclo de imports: el libro de pendientes necesita LEERLOS y este archivo necesita al libro.
 * Los consumidores siguen importando desde acá, que es donde vivían.
 */
export {
  leerAcuerdo,
  marcaDeAcuerdo,
  MARCA_DE_ACUERDO,
  leerDesenlace,
  marcaDeDesenlace,
  MARCA_DE_DESENLACE,
  textoVisible,
} from "./acuerdo";
export type { CambioAcordado, Desenlace } from "./acuerdo";

/** El agente, para que sus corridas se puedan separar en `/settings/gasto-ia`. */
export const SLUG_DEL_ASISTENTE = "asistente-chat";

/**
 * ⚠ Medido, no elegido por costumbre. Ver el header: a este tamaño de prompt Sonnet 5 cachea y
 * Haiku 4.5 no. Si se cambia, hay que re-correr `scripts/probar-asistente.ts` y mirar el número.
 */
export const MODELO_DEL_ASISTENTE = "claude-sonnet-5";

/**
 * ⚠ NO ES EL LARGO DE LA RESPUESTA: es el presupuesto de salida ENTERO, y el razonamiento del
 * modelo sale de ahí.
 *
 * ⛔ ESTE NÚMERO ESTUVO EN 1.500 Y ROMPÍA EL CHAT EN SILENCIO. Medido el 2026-08-20 con el pedido
 * real de Elías («en Integraciones hay semanas sin tareas, quítalas; y Reportería y Data pasa de
 * 4 a 2 semanas»): el modelo gastó los 1.500 tokens PENSANDO —`thinking_tokens: 1500`,
 * `stop_reason: "max_tokens"`— y no le quedó nada para escribir. El único bloque que devolvió fue
 * `thinking`: cero texto, cero herramienta.
 *
 * La falla es peor que un error: un pedido difícil se veía igual que uno que el asistente no supo
 * contestar. Los pedidos simples andaban —pensaban poco— así que el chat parecía funcionar y
 * fallaba justo cuando más se lo necesitaba.
 *
 * En los modelos nuevos el pensamiento viene ENCENDIDO por defecto y no se topea aparte: hay que
 * dejarle lugar. Lo que el CSE lee sigue siendo corto (lo pide el prompt); esto es el techo del
 * turno completo. Y `stop_reason: "max_tokens"` ahora se reporta en vez de degradar a un mensaje
 * mudo.
 */
const MAX_TOKENS_DE_RESPUESTA = 8_000;

/**
 * ── EL PROMPT, Y POR QUÉ VIVE EN CÓDIGO Y NO EN LA TABLA `Agent` ─────────────────────────────
 * Los otros agentes tienen su prompt en la base para poder calibrarlo sin deploy. Este todavía
 * no: sumarlo a `Agent` obliga a declararle un `agentGroup`, y un grupo no declarado en
 * `artifact-gate.ts` corre SIN celda de permiso, en silencio. El chat ya tiene su celda propia
 * (`asistente.read`) en su endpoint, así que meterlo a ese carril agregaría el modo de falla sin
 * comprar nada. Cuando Elías lo esté ajustando a diario, la mudanza es barata y ahí sí conviene.
 */
/**
 * ⛔ EL PROMPT SE BIFURCA POR PIEZA, y hasta hoy no lo hacía.
 *
 * El vocabulario de OPERACIONES es del cronograma: fases, semanas, tareas. Sobre un kickoff no
 * significa nada — y peor, la herramienta solo sabía emitir operaciones, así que en un documento
 * el chat podía conversar pero **no podía cerrar un acuerdo NUNCA**: no tenía dónde poner la
 * instrucción. Conversaba y no terminaba en nada, que es exactamente la queja que lo originó.
 *
 * La cabeza —rol, idioma, formato, cómo conversa, la regla de avisar consecuencias— es común. Lo
 * que cambia es CÓMO se emite la propuesta y qué se puede pedir.
 */
function promptDelAsistente(esCronograma: boolean): string {
  return `Eres el asistente de Nexus, la app interna de Smarteam (consultora de HubSpot). Hablas con
un CSE (Customer Success Engineer) sobre UN documento de UN proyecto.

TU TRABAJO NO ES REDACTAR EL DOCUMENTO. Es entender qué quiere cambiar, decirle qué se puede y qué
va a costar, y solo con el acuerdo emitir la INSTRUCCIÓN que va a ejecutar el editor de siempre.

⛔ TÚ NO APLICAS NADA. Nunca digas "listo", "ya lo cambié" ni "quedó actualizado": no tienes forma
de tocar el documento. Lo que haces es dejar la instrucción lista para que la persona la aplique
con un botón, y ella la puede editar antes.

⭐ IDIOMA (OBLIGATORIO): español neutro con TUTEO ("tú"): "puedes", "tienes", "quieres", "dime".
⛔ PROHIBIDO el voseo y el coloquialismo rioplatense: NUNCA digas "podés", "tenés", "querés", "decime", "dale", "vos" ni "che".
Es el mismo español neutro que usan los documentos que ve el cliente.

FORMATO (te renderizan como Markdown, así que se ve)
1. ⭐ SE NUMERAN LOS ASUNTOS, NO LAS OPCIONES. Un asunto es cada cosa que vas a hacer o cada
   cosa que necesitas que te contesten. Si el pedido trae dos, tu mensaje va numerado 1. y 2. —
   así la persona responde «la 2» sin transcribir la frase entera.
   ⛔ Los valores candidatos NO son una lista numerada: van en la MISMA línea del asunto,
   separados por comas. Numerarlos hace que «la 2» sea ambiguo — ¿el segundo cambio o la segunda
   fase? — que es justo lo que la numeración vino a evitar.

     ✅ 1. ¿A qué fase te refieres con «el fin del proyecto»? Las de cierre son: Cierre y
           entrega, Capacitación y cierre Service, Cierre con junta directiva.
        2. Extiendo Configuración Marketing Hub de 2 a 3 semanas y agrego ahí «Revisar todo
           muy bien».

     ⛔ Sigo necesitando saber a qué fase… Las fases de cierre que tengo son:
        1. Cierre y entrega
        2. Capacitación y cierre Service
        3. Cierre con junta directiva
        Mientras tanto, dejo lista la otra parte: …

   Fuera de ese caso, cualquier lista va numerada (1. 2. 3.), nunca con guiones ni viñetas.
2. Negrita solo para el dato que decide: una fecha, un número de semanas, un nombre de fase.
3. Párrafos cortos. El CSE está trabajando, no leyendo un informe.

CÓMO CONVERSAS
1. UNA sola pregunta por turno. Si ofreces opciones, que sean RESPUESTAS, nunca sub-preguntas.
   Bien: "¿Alargar Setup (pasa de 1 a 2 semanas), o mover la tarea a Integraciones?"
   Mal:  "¿Quieres alargar la fase? ¿O prefieres mover la tarea?"
   ⚠ Las opciones van en la misma línea, separadas por comas — la numeración se reserva para los
   ASUNTOS (ver FORMATO, arriba). Numerar las dos cosas hace ambiguo el «la 2».
2. Las consecuencias se AVISAN en la misma respuesta que propone, no en una pregunta previa.

⭐ LAS FECHAS SE DICEN SIEMPRE, Y ES LA REGLA QUE MÁS IMPORTA
Toda propuesta que mueva el cierre del proyecto lo dice con las dos fechas: la de hoy y la nueva.
Y si NO lo mueve, también lo dices ("el cierre no se corre"). El silencio se lee como "no cambió
nada", y así es como alguien se entera tres semanas después.

⚠ Y si hay cambios pendientes arrastrados, la fecha que digas tiene que contemplarlos: son parte
del mismo lote. Si no puedes, no des un número — di cuántos cambios tiene la lista en total.

⚠ Si no puedes calcular la fecha nueva con certeza (las fases pueden solaparse), NO la estimes:
di cuántas semanas se corre y que la fecha exacta se ve en el cronograma al aplicar. Un rango
inventado es peor que un número menos — el CSE lo repite en una llamada y queda comprometido.

⛔ Y NO PROMETAS UNA «VISTA PREVIA»: los cambios que emites como operaciones se escriben directo,
en un instante. No hay un paso intermedio donde revisar y aceptar. Lo que se revisa es la lista
numerada que la persona lee ANTES de apretar el botón — eso es todo el control que hay, y por eso
lo que dices tiene que coincidir con ella.

QUÉ SE PUEDE Y QUÉ NO
El contexto te dice las reglas duras del editor y las consecuencias conocidas. Úsalas ANTES de
proponer, no después: si el pedido implica perder el estado de una tarea o borrar trabajo hecho,
dilo primero y pregunta si aun así lo hacemos. Si algo directamente no se puede, dilo — no
intentes una versión aproximada sin avisar.

⚠ EL EDITOR REESCRIBE EL CRONOGRAMA ENTERO, así que una instrucción que reacomoda muchas tareas
tarda varios minutos y tiene más chances de salir mal. Cuando un pedido se pueda partir en pasos
chicos, dilo y propón el primero.

⭐ PROPÓN EN EL PRIMER TURNO. NO PIDAS CONFIRMACIÓN.
Si entendiste qué quiere, llamas la herramienta YA, en la misma respuesta en que explicas el
cambio y su impacto. ⛔ Nunca cierres con "¿confirmas?", "¿avanzamos?" ni "¿lo hago?": el botón
que aparece con tu propuesta ES la confirmación, y preguntar antes obliga a la persona a decir
que sí dos veces para el mismo cambio.

Preguntas SOLO si el pedido admite dos lecturas distintas que producen cronogramas distintos, y
entonces la pregunta ofrece las lecturas como opciones — no como un "¿seguimos?".

⭐ LO QUE YA SE ACORDÓ Y NO SE APLICÓ SE ARRASTRA SOLO, Y ES LA REGLA QUE MÁS CUIDADO PIDE.
Cuando quede algo pendiente lo vas a ver en un bloque [LO QUE SIGUE PENDIENTE] que escribe la app,
numerado P1, P2… La app lo suma sola al acuerdo que emitas.

1. En "operaciones" pones SOLO lo nuevo de este turno. ⛔ Repetir lo pendiente duplica tareas: el
   vocabulario no deshace nada, así que dos "tarea.crear" iguales son dos tareas.
2. Si algo pendiente ya no corresponde —la persona lo canceló, o tu propuesta nueva lo reemplaza—
   lo pones en "descartar" y lo DICES en tu mensaje. Soltar algo en silencio es exactamente lo que
   este mecanismo vino a impedir.
3. Si la persona te pide otra cosa distinta, eso NO cancela lo anterior: se suma.

${esCronograma ? COLA_DEL_CRONOGRAMA : COLA_DE_DOCUMENTO}`;
}

/** Lo que solo aplica al CRONOGRAMA: el vocabulario cerrado de operaciones. */
const COLA_DEL_CRONOGRAMA = `CÓMO SE EMITE LA PROPUESTA
Llamas a \`registrar_cambio_acordado\` UNA vez, con un "resumen" de una o dos frases y las
OPERACIONES a ejecutar. Se aplican en milisegundos, así que no describas el cambio: nómbralo.

⛔ Y CUANDO EMITES LA HERRAMIENTA, TU MENSAJE NO REPITE LA LISTA.
La pantalla ya muestra cada operación traducida y numerada, sacada de las operaciones mismas.
Si además las enumeras en tu texto, la persona lee lo mismo dos veces seguidas y deja de leer
las dos. Tu mensaje en ese turno es UNA O DOS FRASES, y contiene SOLO lo que la lista no puede
decir: cuánto se corre el cierre, qué supuesto tomaste, qué ajustaste de lo que te pidieron, qué
se pierde.

⛔ REGLA MECÁNICA, para que no dependa del criterio: tu mensaje NO puede contener dos o más
títulos de tarea. Si al releerlo aparecen dos, está mal y lo reescribes antes de enviarlo. Habla
en bloque: «la fase con sus 3 tareas», «las 4 tareas atrasadas».

  ✅ «Creo la fase al final con sus 3 tareas. La dejo en 1 semana porque entran cómodas, y el
     cierre se corre una semana. Puse "Presentación y entrega" a cargo de Smarteam: CSE no es un
     valor del sistema.»
  ⛔ «Creo la fase con 3 tareas: revisión conjunta (cliente), revisión de integración (dev) y
     presentación y entrega (Smarteam).»  ← la lista de abajo dice exactamente eso

⚠ Y los títulos de las tareas son los que te dictaron, no una versión mejorada: si te dicen
«revisión conjunta», la tarea se llama «Revisión conjunta». Adornarlos hace que la persona no
reconozca lo que pidió.

Las fases y las tareas se referencian por su ID, el que va entre corchetes en el contexto.
⛔ Nunca por nombre: hay proyectos con fases casi homónimas y tareas repetidas entre fases, y
elegir la parecida sería adivinar.

⭐ CREAR UNA FASE Y SUS TAREAS ES UN SOLO ACUERDO, NO DOS.
En "fase.crear" pon un "ref" (una palabra corta que inventes) y usa ese mismo valor como
"phaseId" en los "tarea.crear" que siguen. Nunca contestes «primero creo la fase y después le
agrego las tareas»: es un viaje de más para un pedido que es uno solo.

⚠ Y si no te dijeron cuántas semanas dura, NO preguntes solo por eso: propón la duración más
chica que aguante las tareas (una semana entra cómoda con hasta 4 o 5) y dilo como supuesto —
«la dejo en 1 semana; si necesitas más, avísame». Cambiar un número después es un clic; esperar
una respuesta para recién ahí proponer es una conversación entera.

⭐ SÍ SE PUEDE SACAR O AGREGAR UNA SEMANA DEL MEDIO.
"fase.quitar-semana" y "fase.insertar-semana" existen. ⚠ No las confundas con "fase.duracion":
acortar saca las ÚLTIMAS semanas, quitar saca LA QUE DIGAS y sube las de abajo. Si la persona
señala una semana concreta —«la 3 está vacía»— es quitar-semana, no duración.

⭐ PARA MOVER O BORRAR TAREAS, EMITE UNA OPERACIÓN POR TAREA, ENUMERADAS.
Si te piden «pasa las atrasadas a la última semana», mira el contexto, decide cuáles son y emite
un "tarea.mover-semana" por cada una. Es a propósito: así la persona lee EXACTAMENTE qué tareas
se mueven antes de apretar, en vez de aprobar un criterio y descubrir el alcance después.
Si son muchas, dilo en el resumen con el número.

⛔ EL VOCABULARIO ES UNA LISTA CERRADA, Y ES LA REGLA QUE MÁS CUIDADO PIDE.
Si lo que te piden NO se puede expresar con esas operaciones, **no llames la herramienta**: dilo
y ofrece lo más cercano que sí se pueda, para que la persona elija.

Ejemplo real: «marca esa tarea como hecha». NO se puede, y no es un olvido: el estado de una
tarea lo escribe una persona en el Gantt, nunca un agente. Lo correcto es decirlo y señalar dónde
se hace, no buscar la operación más parecida.

Otro: «unifica estas dos fases en una». Tampoco existe como operación. Lo más cercano sí se puede
armar —mover sus tareas a la otra fase y borrar la que queda vacía— pero mudarlas las RECREA y
pierden su estado. Eso se dice ANTES: «puedo mover las 6 tareas de A a B y borrar A, pero las 6
se recrean y pierden si estaban hechas — ¿lo hago igual, o prefieres unificarlas a mano?».

⭐ DOBLE CONFIRMACIÓN CUANDO SE BORRA TRABAJO DE ALGUIEN
Antes de emitir un "fase.borrar", mira el contexto: si esa fase tiene tareas HECHAS, dilo con el
número y pide confirmación explícita — «esa fase tiene 4 tareas hechas, ¿la borro igual?». Solo
con el sí emites la operación.

⛔ Y CON UNA TAREA SUELTA NO ALCANZA CON CONFIRMAR: NO SE PUEDE.
Una tarea hecha, en curso o cargada a mano NO se borra desde el chat — la operación se rechaza
sola. Si te piden borrar una así, dilo antes de intentarlo: «esa la marcó alguien como hecha, hay
que borrarla desde el Gantt». Una fase entera sí se puede; una tarea protegida, no.

⚠ Es la ÚNICA excepción a «propón en el primer turno», y por eso se aguanta: no se pregunta por
rutina, se pregunta cuando está en juego trabajo que alguien hizo.

⭐ PREGUNTAR Y PROPONER EN EL MISMO TURNO ES LO ESPERADO, no la excepción.
Cuando el pedido trae dos asuntos y solo uno es ambiguo, preguntas por ese y propones el otro —es
el ejemplo ✅ de FORMATO, arriba—. Preguntar nunca cuesta perder la parte que ya estaba clara.

⛔ Y EN ESE TURNO PONES "preguntaAbierta": true. Es OBLIGATORIO cuando tu mensaje termina en una
pregunta. Con eso los cambios quedan registrados pero NO se ofrece aplicarlos: se acumulan con lo
que venga después y se aplican TODOS JUNTOS al final. Una sola aplicación por pedido.
Sin ese campo, la persona aplica media cosa, te contesta, y aplica la otra media — dos escrituras
sobre un cronograma que el cliente ve.

⛔ Y CUANDO PREGUNTAS, TU MENSAJE ES LA PREGUNTA Y NADA MÁS. No describas los cambios que dejas
listos: la lista de abajo ya los dice, uno por renglón. Si además los cuentas, quedan dos listas
numeradas pegadas —la tuya y la de la lista— y «la 2» vuelve a ser ambiguo, que es justo lo que la
numeración vino a evitar.

  ✅ «¿A qué fase te refieres con «el fin del proyecto»? Las de cierre son: Cierre y entrega,
     Capacitación y cierre Service, Cierre con junta directiva. Lo de Marketing Hub lo dejo
     preparado acá abajo.»
  ⛔ «1. ¿A qué fase te refieres…?  2. Mientras tanto, extiendo Configuración Marketing Hub de 2 a
     3 semanas y agrego ahí «Revisar todo muy bien»…»  ← la lista de abajo dice exactamente eso

Solo NO llamas la herramienta cuando el pedido no entra en el vocabulario, cuando estás pidiendo la
confirmación de un borrado, o cuando no hay nada nuevo que agregar y tampoco nada pendiente.`;

/**
 * Lo que solo aplica a los DOCUMENTOS (kickoff, diagnóstico, planificación, requerimiento
 * técnico, implementación, entrega).
 *
 * ⚠ Acá NO hay operaciones: el modificador de documentos recibe una instrucción en castellano y
 * devuelve una propuesta POR SECCIÓN, que la persona acepta o descarta una por una. Por eso la
 * instrucción es el producto, y por eso tiene que ser precisa — es lo que se ejecuta tal cual.
 */
const COLA_DE_DOCUMENTO = `CÓMO SE EMITE LA PROPUESTA
Llamas a \`registrar_cambio_acordado\` UNA vez, con un "resumen" de una o dos frases y la
"instruccion" que va a ejecutar el editor del documento.

⭐ LA INSTRUCCIÓN ES EL PRODUCTO, no un resumen de la charla. Se ejecuta TAL CUAL, sin que nadie
la interprete de nuevo, así que:
1. Nombra las SECCIONES exactamente como aparecen en el contexto. El editor trabaja por sección:
   una instrucción que no dice cuál toca, toca las que el modelo decida.
2. Di qué cambia y qué NO. «Reescribe el alcance en dos párrafos, sin tocar las fechas» ejecuta
   mejor que «mejora el alcance».
3. No repitas la conversación adentro. La instrucción se lee sola, semanas después.

QUÉ PUEDE HACER EL EDITOR DEL DOCUMENTO, Y QUÉ NO
Puede reescribir el contenido de las secciones que YA existen: acortar, ampliar, cambiar el tono,
reordenar ideas, sumar un punto que falta.
⛔ NO puede crear secciones nuevas ni cambiar la estructura del documento: los tipos de sección
están programados, y uno que nadie programó no sale de una conversación. Si te lo piden, dilo —
no lo intentes con la sección más parecida.
⛔ NO toca lo que el CSE curó a mano en otra parte de la app (fechas del cronograma, tags,
particularidades): si el pedido es de eso, decí dónde se hace.

⭐ LO QUE PASA DESPUÉS, Y CONVIENE DECIRLO
Al aplicar, el editor propone los cambios SECCIÓN POR SECCIÓN y la persona acepta o descarta cada
una. Así que una instrucción que toca tres secciones no es un riesgo: es tres decisiones. Cuando
el pedido sea grande, dilo — «esto toca cuatro secciones, las vas a poder revisar de a una».

⭐ PREGUNTAR Y PROPONER EN EL MISMO TURNO ES LO ESPERADO, no la excepción.
Cuando el pedido trae dos asuntos y solo uno es ambiguo, preguntas por ese y dejas la instrucción
del otro. Preguntar nunca cuesta perder la parte que ya estaba clara — y acá cuesta más que en el
cronograma, porque la instrucción se reescribe entera en cada turno: lo que no vuelvas a nombrar,
no se hace.

Solo NO llamas la herramienta cuando el pedido no se puede hacer, o cuando estás pidiendo una
confirmación.`;

/**
 * ── LA HERRAMIENTA EMITE OPERACIONES, NO UN TEXTO ────────────────────────────────────────────
 * Medido el 2026-08-20: el camino viejo —una instrucción en castellano que un SEGUNDO modelo
 * releía para reescribir el cronograma entero— tardaba **217 segundos**. Las operaciones se
 * ejecutan en **1 ms**, porque no hay segunda llamada: el chat ya entendió la intención, y
 * expresarla como parámetros en vez de como prosa es todo lo que hacía falta.
 *
 * ⛔ Y no es solo velocidad. Reescribir el documento entero para cambiar una duración soltó el
 * `startWeek` de seis fases y corrió el cierre 70 días. Una operación toca lo que nombra.
 *
 * ── LAS DE TAREA ENTRARON EL 2026-08-21, Y ERAN LA MITAD DE LO QUE SE PEDÍA ──────────────────
 * Estaban en el vocabulario desde el día uno y el chat no podía emitir ninguna: no estaban en
 * este enum, y el contexto no le mandaba ni un id. Leídos los 16 turnos reales del CSE, de nueve
 * pedidos distintos el chat solo podía ejecutar tres — «pasá la sesión de cierre al final»,
 * «borrá la última base», «las atrasadas a la última semana» caían todos del mismo lado.
 *
 * ⚠ Las tareas se nombran por HANDLE (los últimos caracteres del id, ver `handle-de-tarea.ts`),
 * no por el cuid entero: con el id completo, 7 de los 51 cronogramas no entraban en el techo del
 * prefijo.
 */
/**
 * La herramienta para los DOCUMENTOS: emite una INSTRUCCIÓN, no operaciones.
 *
 * ⛔ Sin esto el chat de documentos no podía cerrar un acuerdo: la única herramienta que existía
 * pedía `operaciones` —un vocabulario de fases y semanas que en un kickoff no significa nada— y
 * no tenía ningún campo donde poner la instrucción. Conversaba y no terminaba en nada.
 *
 * ⚠ El nombre es el MISMO (`registrar_cambio_acordado`) a propósito: `leerAcuerdo` no tiene que
 * saber de qué pieza vino, y un hilo que cambia de pieza no puede pasar por dos formatos.
 */
const TOOL_ACUERDO_DE_DOCUMENTO: Anthropic.Messages.Tool = {
  name: "registrar_cambio_acordado",
  description:
    "Registra el cambio acordado como una INSTRUCCIÓN para el editor del documento. NO lo " +
    "aplica: la persona la lee, la puede editar, y la aplica con un botón. Llámala UNA sola vez.",
  input_schema: {
    type: "object",
    properties: {
      resumen: {
        type: "string",
        description: "Qué se acordó, en una o dos frases, para que el CSE lo confirme de un vistazo.",
      },
      instruccion: {
        type: "string",
        description:
          "La instrucción que va a ejecutar el editor, TAL CUAL. Nombra las secciones exactamente " +
          "como aparecen en el contexto, di qué cambia y qué no, y escríbela para que se lea sola " +
          "—sin la conversación alrededor—. Es lo que se ejecuta, no un resumen de lo hablado.",
      },
    },
    required: ["resumen", "instruccion"],
  },
};

const TOOL_ACUERDO: Anthropic.Messages.Tool = {
  name: "registrar_cambio_acordado",
  description:
    "Registra el cambio acordado como OPERACIONES sobre el cronograma. NO lo aplica: la persona " +
    "las lee traducidas a castellano y las aplica con un botón. Llámala UNA sola vez.",
  input_schema: {
    type: "object",
    properties: {
      resumen: {
        type: "string",
        description: "Qué se acordó, en una o dos frases, para que el CSE lo confirme de un vistazo.",
      },
      preguntaAbierta: {
        type: "boolean",
        description:
          "true si tu mensaje termina con una pregunta que la persona todavía no contestó. " +
          "Mientras sea true NO se ofrece aplicar: los cambios quedan registrados, se acumulan " +
          "con lo que venga después, y se aplican TODOS JUNTOS cuando ya no quede nada por " +
          "resolver. Omítelo (o false) cuando el pedido esté cerrado.",
      },
      descartar: {
        type: "array",
        items: { type: "string" },
        description:
          "SOLO si el bloque PENDIENTE trae cosas que ya no corresponden: sus etiquetas (P1, P2…). " +
          "Se usa cuando la persona canceló ese cambio, o cuando tu propuesta nueva lo reemplaza. " +
          "Lo que no pongas acá sigue pendiente y la app lo incluye sola: no lo repitas en " +
          "\"operaciones\".",
      },
      operaciones: {
        type: "array",
        description:
          "SOLO lo que se acaba de acordar. ⛔ NO repitas lo que ya está en el bloque PENDIENTE: " +
          "la app lo suma sola, y repetirlo duplicaría tareas. ⛔ Es un vocabulario CERRADO: si lo que te " +
          "piden no se puede expresar con estas operaciones, NO llames esta herramienta — dilo " +
          "y ofrece lo más cercano que sí se pueda.",
        items: {
          type: "object",
          properties: {
            op: {
              type: "string",
              enum: [
                "fase.duracion",
                "fase.renombrar",
                "fase.borrar",
                "fase.redistribuir",
                "fase.mover",
                "fase.arranque-relativo",
                "fase.crear",
                "fase.quitar-semana",
                "fase.insertar-semana",
                "fase.tipo",
                "tarea.mover-semana",
                "tarea.mover-fase",
                "tarea.borrar",
                "tarea.crear",
                "tarea.renombrar",
                "tarea.duenio",
                "tarea.tipo",
                "arranque",
              ],
              description:
                "fase.duracion: cambia cuántas semanas dura (semanas). " +
                "fase.renombrar: le cambia el nombre (nombre). " +
                "fase.borrar: la elimina con sus tareas. " +
                "fase.redistribuir: reparte sus tareas parejo entre sus semanas. " +
                "fase.mover: la cambia de lugar en el orden (posicion, base 0). " +
                "fase.arranque-relativo: en qué semana del proyecto arranca (semana, o null = " +
                "cuando termina la anterior). " +
                "fase.crear: agrega una fase NUEVA (nombre, semanas, posicion opcional base 0). " +
                "⭐ Si le pones un `ref` —una palabra corta que inventes, por ejemplo nueva1— puedes " +
                "usar ese mismo valor como phaseId en las operaciones siguientes del MISMO " +
                "acuerdo: así creas la fase y le pones sus tareas de una sola vez. " +
                "fase.quitar-semana: saca UNA semana del medio (phaseId, semana base 0) y acorta " +
                "la fase; las tareas de esa semana pasan a la anterior. ⚠ NO confundir con " +
                "fase.duracion, que saca las ÚLTIMAS. " +
                "fase.insertar-semana: abre una semana vacía en esa posición y corre el resto. " +
                "fase.tipo: cambia el tipo de actividad (EXPLORACION, PLANIFICACION, " +
                "CONFIGURACION, ADOPCION o SEGUIMIENTO). " +
                "tarea.mover-semana: pasa UNA tarea a otra semana de su misma fase (taskId, " +
                "semana base 0). " +
                "tarea.mover-fase: pasa UNA tarea a otra fase (taskId, phaseId). ⚠ la recrea: " +
                "pierde su estado y sus fechas propias, avísalo antes. " +
                "tarea.borrar: elimina UNA tarea (taskId). ⚠ si tiene trabajo humano encima " +
                "—hecha, en curso, o cargada a mano— se rechaza sola: no se puede borrar desde acá. " +
                "tarea.crear: agrega una tarea NUEVA (phaseId, titulo, semana base 0, y opcional " +
                "duenio = CLIENTE|SMARTEAM|AMBOS|DEV y tipo = SESSION|TASK). " +
                "tarea.renombrar: le cambia el título (taskId, titulo). " +
                "tarea.duenio: cambia quién la hace (taskId, duenio). " +
                "tarea.tipo: la vuelve sesión o tarea (taskId, tipo). " +
                "arranque: cambia la fecha de inicio del proyecto (fecha AAAA-MM-DD).",
            },
            phaseId: {
              type: "string",
              description: "El ID de la fase, tal como aparece entre corchetes en el contexto.",
            },
            semanas: { type: "integer", description: "Para fase.duracion. Mínimo 1." },
            nombre: { type: "string", description: "Para fase.renombrar." },
            posicion: { type: "integer", description: "Para fase.mover. Base 0." },
            semana: {
              type: ["integer", "null"],
              description: "Para fase.arranque-relativo. Base 0, o null para automático.",
            },
            taskId: {
              type: "string",
              description:
                "El identificador de la TAREA, tal como aparece entre corchetes junto a su " +
                "título en el contexto. Para tarea.mover-semana, tarea.mover-fase y tarea.borrar.",
            },
            ref: {
              type: "string",
              description:
                "Solo para fase.crear: una etiqueta corta que inventes para poder referirte a esa " +
                "fase nueva en las operaciones siguientes del mismo acuerdo (como phaseId).",
            },
            titulo: {
              type: "string",
              description: "Para tarea.crear y tarea.renombrar. El título que ve el cliente.",
            },
            duenio: {
              type: "string",
              enum: ["CLIENTE", "SMARTEAM", "AMBOS", "DEV"],
              description: "Para tarea.duenio, y opcional en tarea.crear. Quién ejecuta la tarea.",
            },
            tipo: {
              type: "string",
              enum: [
                "SESSION",
                "TASK",
                "EXPLORACION",
                "PLANIFICACION",
                "CONFIGURACION",
                "ADOPCION",
                "SEGUIMIENTO",
              ],
              description:
                "Para tarea.tipo y tarea.crear usa SESSION o TASK. Para fase.tipo usa uno de los " +
                "cinco tipos de actividad. ⛔ No los mezcles: el ejecutor rechaza el que no " +
                "corresponde a la operación.",
            },
            fecha: { type: "string", description: "Para arranque. AAAA-MM-DD." },
          },
          required: ["op"],
        },
      },
    },
    required: ["resumen", "operaciones"],
  },
};

export interface ResultadoDelTurno {
  respuesta: string;
  /** Presente solo cuando el modelo dio el cambio por acordado. */
  acuerdo: CambioAcordado | null;
  /** La huella del prefijo con el que se contestó — se guarda con los dos turnos. */
  shaDeContexto: string;
}

/** El contexto que corresponde a la pieza sobre la que se está conversando. */
async function contextoDeLaPieza(projectId: string, pieza: string) {
  return pieza === "timeline"
    ? contextoDeCronograma(projectId)
    : contextoDeDocumento(projectId, pieza);
}

/**
 * Un turno: el CSE dice algo, el asistente contesta, los dos quedan guardados.
 *
 * ⚠ Los dos turnos se persisten SIEMPRE que el modelo haya contestado — aunque el navegador se
 * cierre en el medio. El hilo es del servidor, no de la pantalla.
 */
/**
 * El resumen que pone la app cuando el modelo solo preguntó y hay cambios pendientes.
 *
 * ⚠ En TUTEO NEUTRO: es la VOZ DEL ASISTENTE aunque lo escriba la app, igual que los desenlaces.
 * Mezclarlo con el voseo de la interfaz haría que el asistente cambie de registro solo.
 */
const RESUMEN_DE_ARRASTRE = "Esto sigue acordado y sin aplicar.";

export async function correrTurno(
  hilo: HiloConTurnos,
  mensajeDelCse: string,
): Promise<ResultadoDelTurno> {
  const esCronograma = hilo.pieza === PIEZA_CRONOGRAMA;
  const ctx = await contextoDeLaPieza(hilo.projectId, hilo.pieza);
  const sha = huellaDeContexto(ctx.texto);

  /**
   * ⭐ EL CRONOGRAMA DE HOY, traducible, y arriba de todo.
   *
   * Antes se armaba adentro del `if` que atendía la tool. Ahora hace falta ANTES de llamar al
   * modelo, porque lo que quedó pendiente de turnos anteriores se revalida y se le cuenta contra
   * el cronograma tal como está AHORA, no como estaba cuando se acordó.
   *
   * ⛔ ACÁ SE FABRICABAN TAREAS FALSAS —`{id:"", title:"", weekIndex:0}`— porque el contexto solo
   * mandaba el CONTEO. Funcionaba mientras el vocabulario era solo de fases; en cuanto entraron
   * las de tarea, la cajita azul habría dicho «Se elimina «cms6949pw00sj»» en vez del título.
   */
  const paraTraducir = (ctx.fases ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    durationWeeks: f.durationWeeks,
    /**
     * ⛔ `status` Y `source` VIAJAN, y sin ellos una guarda entera no existía.
     *
     * `describirOperaciones` usa los dos para la línea de `fase.borrar`: «⚠ N tienen trabajo hecho
     * encima y se pierden». Como acá se armaban tareas sin esos campos, `isKept` daba false para
     * TODAS y el aviso NUNCA se pintó — justo la red que su propio comentario dice estar tendiendo
     * para cuando el modelo se olvida de la doble confirmación.
     */
    tasks: f.items.map((t) => ({
      id: t.id,
      title: t.title,
      weekIndex: t.weekIndex,
      status: t.status,
      /* ⚠ `null` -> `undefined`: el contexto lo trae como `string | null` (así sale de la base) y
         `TareaActual` lo declara opcional. `isKept` compara contra "HUMAN", así que los dos
         valores vacíos se comportan igual — pero el tipo no los mezcla. */
      source: t.source ?? undefined,
    })),
  }));

  /**
   * ⭐ EL LIBRO: lo que se acordó y NO se aplicó, revalidado contra el cronograma de hoy.
   *
   * Es lo que arregla el bug del 2026-08-21 — contestar una pregunta dejaba de ser el último turno
   * y el acuerdo anterior perdía su botón para siempre. La app lo lleva; el modelo solo emite lo
   * nuevo. Ver `acuerdo-vivo.ts` para el porqué de que componga la app y no el modelo.
   *
   * ⚠ `lineasCrudas` se calcula ANTES de podar: es la única forma de NOMBRAR lo que se cayó.
   */
  const pendientesCrudos = esCronograma ? pendientesDelHilo(hilo.turnos) : [];
  const lineasCrudas =
    pendientesCrudos.length > 0 ? describirOperaciones(paraTraducir, pendientesCrudos) : [];
  const libro = podarIrresolubles(pendientesCrudos, paraTraducir);
  const lineasVivas =
    libro.vivas.length > 0 ? describirOperaciones(paraTraducir, libro.vivas) : [];

  /* El historial tal cual quedó guardado, más lo pendiente, más lo que el CSE acaba de escribir.

     ⛔ EL BLOQUE DE PENDIENTES VA ACÁ Y NUNCA EN `system`. El breakpoint de caché está al final
     del bloque de contexto; meter en el prefijo algo que cambia en cada turno invalidaría la
     caché entera SIN ERROR Y SIN LOG, y se vería solo en la factura. */
  const messages: Anthropic.Messages.MessageParam[] = [
    ...hilo.turnos.map((t) => ({
      role: (t.rol === "CSE" ? "user" : "assistant") as "user" | "assistant",
      content: t.contenido,
    })),
    { role: "user" as const, content: `${bloqueDePendientes(lineasVivas)}${mensajeDelCse}` },
  ];

  const msg = await conContextoDeIA(
    {
      agentSlug: SLUG_DEL_ASISTENTE,
      projectId: hilo.projectId,
      triggeredByEmail: hilo.usuarioEmail,
    },
    () =>
      anthropic.messages.create({
        model: hilo.modelo,
        max_tokens: MAX_TOKENS_DE_RESPUESTA,
        /* ⭐ El breakpoint va al FINAL del bloque de contexto y en ningún otro lado. El prompt
           solo (~700 tok) cae bajo el mínimo cacheable: marcarlo ahí sería una escritura de caché
           pagada que nunca se lee, sin error y sin log. Juntos llegan a ~1.700 y sí cachean. */
        system: [
          { type: "text", text: promptDelAsistente(esCronograma) },
          {
            type: "text",
            text: `CONTEXTO DE ESTE DOCUMENTO\n\n${ctx.texto}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [esCronograma ? TOOL_ACUERDO : TOOL_ACUERDO_DE_DOCUMENTO],
        messages,
      }),
  );

  let respuesta = "";
  let resumenDelModelo = "";
  let instruccionDelModelo = "";
  let opsNuevas: Operacion[] = [];
  let descartar: unknown[] = [];
  let preguntaAbierta = false;

  for (const b of msg.content) {
    if (b.type === "text") respuesta += b.text;
    if (b.type === "tool_use" && b.name === TOOL_ACUERDO.name) {
      const input = b.input as {
        resumen?: string;
        operaciones?: unknown;
        instruccion?: string;
        descartar?: unknown;
        preguntaAbierta?: boolean;
      };
      resumenDelModelo = typeof input?.resumen === "string" ? input.resumen.trim() : "";
      preguntaAbierta = input?.preguntaAbierta === true;
      instruccionDelModelo = typeof input?.instruccion === "string" ? input.instruccion.trim() : "";
      opsNuevas = Array.isArray(input?.operaciones) ? (input.operaciones as Operacion[]) : [];
      descartar = Array.isArray(input?.descartar) ? input.descartar : [];
    }
  }

  let acuerdo: CambioAcordado | null = null;

  if (!esCronograma) {
    /* ⚠ Un DOCUMENTO emite una INSTRUCCIÓN y ninguna operación. Este `if` exigía operaciones, así
       que el modelo llamaba la herramienta, el turno la descartaba en silencio, y el CSE leía «voy
       a dejar lista la instrucción» sin que apareciera ninguna cajita. El chat de documentos
       conversaba y no terminaba en nada. Medido contra el modelo el 2026-08-21.

       ⛔ Y el libro NO aplica acá: el vocabulario de operaciones es del cronograma; un documento
       emite una instrucción entera que se reescribe cada vez. */
    if (resumenDelModelo && instruccionDelModelo) {
      acuerdo = { resumen: resumenDelModelo, instruccion: instruccionDelModelo };
    }
  } else {
    /**
     * ⭐ LA COMPOSICIÓN: lo pendiente que sigue en pie + lo que se acaba de acordar.
     *
     * ⛔ Y LAS LÍNEAS SE RECALCULAN SOBRE EL CONJUNTO FUSIONADO, que es el que se va a ejecutar.
     * Calcularlas sobre `opsNuevas` mostraría MENOS de lo que se escribe: la persona aprobaría
     * cambios que no leyó, y ahí se cae la única garantía de todo el diseño.
     */
    const fusion = fusionarPendientes(libro.vivas, opsNuevas, descartar);
    if (fusion.operaciones.length > 0) {
      /* Lo que se soltó, dicho. Un descarte tiene que ser tan legible como una operación: si el
         modelo se equivoca al soltar algo, o si el cronograma cambió debajo, la persona lo ve. */
      const soltadas = [
        ...libro.caidas.map((c) => {
          const i = pendientesCrudos.indexOf(c.operacion);
          const linea = i >= 0 ? lineasCrudas[i] : null;
          return `${linea ?? "Un cambio anterior"} — ya no se puede aplicar: ${c.motivo}`;
        }),
        ...fusion.descartadas.map((i) => lineasVivas[i]).filter(Boolean),
      ];
      acuerdo = {
        /* Si el modelo no llamó la herramienta —porque solo preguntó— la app sintetiza el acuerdo
           con el libro tal cual. Sin esto, un turno de desambiguación deja lo pendiente sin botón:
           es literalmente el turno que produjo el bug. */
        resumen: resumenDelModelo || RESUMEN_DE_ARRASTRE,
        operaciones: fusion.operaciones,
        lineas: describirOperaciones(paraTraducir, fusion.operaciones),
        ...(preguntaAbierta ? { enEspera: true } : {}),
        ...(fusion.arrastradas.length > 0 ? { arrastradas: fusion.arrastradas } : {}),
        ...(soltadas.length > 0 ? { descartadas: soltadas } : {}),
      };
    }
  }

  /* Si el modelo cerró con la tool y sin texto, el panel igual tiene qué mostrar. */
  if (!respuesta.trim() && acuerdo) respuesta = acuerdo.resumen;

  /* ⛔ UNA RESPUESTA CORTADA NO PUEDE VERSE COMO UNA RESPUESTA VACÍA. Con el presupuesto viejo
     esto pasaba en todo pedido difícil, y el CSE leía «el asistente no devolvió texto» — que se
     lee como «no supo», cuando en realidad se quedó sin lugar a mitad de pensar. Decirlo permite
     la única acción útil: partir el pedido en dos. */
  if (msg.stop_reason === "max_tokens" && !respuesta.trim()) {
    respuesta =
      "Me quedé sin espacio antes de poder contestar: el pedido tiene muchas partes. " +
      "Probemos de a una — ¿por cuál empezamos?";
  }
  if (!respuesta.trim()) respuesta = "(el asistente no devolvió texto)";

  await agregarTurno(hilo.id, { rol: "CSE", contenido: mensajeDelCse, shaDeContexto: sha });
  await agregarTurno(hilo.id, {
    rol: "ASISTENTE",
    contenido: acuerdo ? `${respuesta}\n\n${marcaDeAcuerdo(acuerdo)}` : respuesta,
    shaDeContexto: sha,
  });

  return { respuesta, acuerdo, shaDeContexto: sha };
}
