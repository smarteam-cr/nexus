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
import { describirOperaciones, type Operacion } from "@/lib/timeline/operaciones";

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
function promptDelAsistente(): string {
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
1. Las listas van SIEMPRE NUMERADAS (1. 2. 3.), nunca con guiones ni viñetas.
2. Negrita solo para el dato que decide: una fecha, un número de semanas, un nombre de fase.
3. Párrafos cortos. El CSE está trabajando, no leyendo un informe.

CÓMO CONVERSAS
1. UNA sola pregunta por turno. Si ofreces opciones, que sean RESPUESTAS, nunca sub-preguntas.
   Bien: "1. Alargar Setup: la fase pasa de 1 a 2 semanas · 2. Mover la tarea: se va a Integraciones"
   Mal:  "1. ¿Quieres alargar la fase? · 2. ¿O prefieres mover la tarea?"
2. Las consecuencias se AVISAN en la misma respuesta que propone, no en una pregunta previa.

⭐ LAS FECHAS SE DICEN SIEMPRE, Y ES LA REGLA QUE MÁS IMPORTA
Toda propuesta que mueva el cierre del proyecto lo dice con las dos fechas: la de hoy y la nueva.
Y si NO lo mueve, también lo dices ("el cierre no se corre"). El silencio se lee como "no cambió
nada", y así es como alguien se entera tres semanas después.

⚠ Si no puedes calcular la fecha nueva con certeza (las fases pueden solaparse), NO la estimes:
di cuántas semanas se corre y que la vista previa muestra la fecha exacta. Un rango inventado es
peor que un número menos — el CSE lo repite en una llamada y queda comprometido.

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

Si la persona pide otra cosa después, propones de nuevo: cada propuesta reemplaza a la anterior.

CÓMO SE EMITE LA PROPUESTA
Llamas a \`registrar_cambio_acordado\` UNA vez, con un "resumen" de una o dos frases y las
OPERACIONES a ejecutar. Se aplican en milisegundos, así que no describas el cambio: nómbralo.

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
se recrean y pierden si estaban hechas — ¿lo hago igual, o preferís unificarlas a mano?».

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

Solo NO llamas la herramienta cuando hiciste una pregunta de desambiguación, cuando el pedido no
entra en el vocabulario, o cuando estás pidiendo esa confirmación.`;
}

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
      operaciones: {
        type: "array",
        description:
          "Las operaciones a ejecutar, en orden. ⛔ Es un vocabulario CERRADO: si lo que te " +
          "piden no se puede expresar con estas operaciones, NO llames esta herramienta — decilo " +
          "y ofrecé lo más cercano que sí se pueda.",
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
                "pierde su estado y sus fechas propias, avisalo antes. " +
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
                "Para tarea.tipo y tarea.crear usá SESSION o TASK. Para fase.tipo usá uno de los " +
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

export interface CambioAcordado {
  resumen: string;
  /** El camino rápido: se ejecutan en milisegundos, sin volver a llamar a un modelo. */
  operaciones?: unknown[];
  /**
   * Las operaciones ya traducidas a castellano, calculadas EN EL SERVIDOR contra el cronograma
   * tal como estaba al acordar.
   *
   * ⭐ Es lo que vuelve hermética la cajita: lo que la persona LEE sale del mismo objeto que se
   * va a ejecutar, no de una prosa que el modelo escribe aparte y puede divergir.
   */
  lineas?: string[];
  /**
   * ⚠ LEGACY. Los hilos anteriores al 2026-08-20 guardaron una instrucción en castellano que un
   * segundo modelo releía. Se conserva para que esas conversaciones sigan pintándose — no para
   * emitirla de nuevo.
   */
  instruccion?: string;
}

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
export async function correrTurno(
  hilo: HiloConTurnos,
  mensajeDelCse: string,
): Promise<ResultadoDelTurno> {
  const ctx = await contextoDeLaPieza(hilo.projectId, hilo.pieza);
  const sha = huellaDeContexto(ctx.texto);

  /* El historial tal cual quedó guardado, más lo que el CSE acaba de escribir. */
  const messages: Anthropic.Messages.MessageParam[] = [
    ...hilo.turnos.map((t) => ({
      role: (t.rol === "CSE" ? "user" : "assistant") as "user" | "assistant",
      content: t.contenido,
    })),
    { role: "user" as const, content: mensajeDelCse },
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
          { type: "text", text: promptDelAsistente() },
          {
            type: "text",
            text: `CONTEXTO DE ESTE DOCUMENTO\n\n${ctx.texto}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [TOOL_ACUERDO],
        messages,
      }),
  );

  let respuesta = "";
  let acuerdo: CambioAcordado | null = null;
  for (const b of msg.content) {
    if (b.type === "text") respuesta += b.text;
    if (b.type === "tool_use" && b.name === TOOL_ACUERDO.name) {
      const input = b.input as Partial<CambioAcordado>;
      /* ⚠ Se acepta solo si trae resumen Y al menos una operación. Un acuerdo vacío pintaría un
         botón «Aplicar» que no puede hacer nada — peor que no ofrecerlo. */
      const ops = Array.isArray(input?.operaciones) ? input.operaciones : [];
      if (input?.resumen?.trim() && ops.length > 0) {
        /* ⭐ LAS LÍNEAS SE CALCULAN ACÁ, EN EL SERVIDOR, contra el cronograma tal como está al
           acordar. Es lo que vuelve hermética la cajita: lo que la persona lee sale del MISMO
           objeto que se va a ejecutar, no de una prosa que el modelo escribe aparte. */
        /* ⛔ ACÁ SE FABRICABAN TAREAS FALSAS —`{id:"", title:"", weekIndex:0}`— porque el
           contexto solo mandaba el CONTEO. Funcionaba mientras el vocabulario del chat era solo
           de fases; en cuanto entraron las de tarea, la cajita azul habría dicho «Se elimina
           «cms6949pw00sj»» en vez del título. La persona aprobaría algo que no puede leer, que es
           peor que la prosa que este mecanismo vino a retirar. */
        const paraTraducir = (ctx.fases ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          durationWeeks: f.durationWeeks,
          tasks: f.items.map((t) => ({ id: t.id, title: t.title, weekIndex: t.weekIndex })),
        }));
        acuerdo = {
          resumen: input.resumen.trim(),
          operaciones: ops,
          lineas: describirOperaciones(paraTraducir, ops as Operacion[]),
        };
      }
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

/**
 * El acuerdo se guarda DENTRO del turno del asistente, con una marca que se puede volver a leer.
 * Así el hilo releído desde la base sigue mostrando el botón de aplicar — sin columna nueva y sin
 * una segunda tabla que pueda quedar desincronizada del texto que la explica.
 */
export const MARCA_DE_ACUERDO = "<<<ACUERDO>>>";

export function marcaDeAcuerdo(a: CambioAcordado): string {
  return `${MARCA_DE_ACUERDO}${JSON.stringify(a)}`;
}

/** Separa el texto visible del acuerdo embebido. PURO — es lo que lee el panel al recargar. */
export function leerAcuerdo(contenido: string): { texto: string; acuerdo: CambioAcordado | null } {
  const i = contenido.indexOf(MARCA_DE_ACUERDO);
  if (i === -1) return { texto: contenido, acuerdo: null };
  const texto = contenido.slice(0, i).trim();
  try {
    const crudo = JSON.parse(contenido.slice(i + MARCA_DE_ACUERDO.length)) as Partial<CambioAcordado>;
    /* ⛔ EL LECTOR TIENE QUE ACEPTAR LO QUE EL PRODUCTOR EMITE, Y ESTO SE ROMPIÓ UNA VEZ.
       Al pasar la herramienta a operaciones (2026-08-20) esta condición siguió exigiendo
       `instruccion`, que ya no existe: el acuerdo se GUARDABA bien y se leía como `null`, así que
       la cajita azul nunca aparecía. Elías lo vio como «el asistente contesta pero no pasa nada».

       ⚠ Y los tests no lo cazaron porque su fixture era del shape VIEJO: probaban que la ida y
       vuelta funcionaba para algo que el productor ya no emitía. Por eso ahora hay un test que
       arranca del shape REAL. */
    const ops = Array.isArray(crudo?.operaciones) ? crudo.operaciones : null;
    if (crudo?.resumen && (ops?.length || crudo?.instruccion)) {
      return {
        texto,
        acuerdo: {
          resumen: crudo.resumen,
          ...(ops?.length ? { operaciones: ops } : {}),
          ...(crudo.lineas?.length ? { lineas: crudo.lineas } : {}),
          ...(crudo.instruccion ? { instruccion: crudo.instruccion } : {}),
        },
      };
    }
  } catch {
    /* Un turno viejo o truncado: se muestra el texto y se pierde el botón, nunca la conversación. */
  }
  return { texto, acuerdo: null };
}
