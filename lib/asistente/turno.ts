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

/** El agente, para que sus corridas se puedan separar en `/settings/gasto-ia`. */
export const SLUG_DEL_ASISTENTE = "asistente-chat";

/**
 * ⚠ Medido, no elegido por costumbre. Ver el header: a este tamaño de prompt Sonnet 5 cachea y
 * Haiku 4.5 no. Si se cambia, hay que re-correr `scripts/probar-asistente.ts` y mirar el número.
 */
export const MODELO_DEL_ASISTENTE = "claude-sonnet-5";

const MAX_TOKENS_DE_RESPUESTA = 1_500;

/**
 * ── EL PROMPT, Y POR QUÉ VIVE EN CÓDIGO Y NO EN LA TABLA `Agent` ─────────────────────────────
 * Los otros agentes tienen su prompt en la base para poder calibrarlo sin deploy. Este todavía
 * no: sumarlo a `Agent` obliga a declararle un `agentGroup`, y un grupo no declarado en
 * `artifact-gate.ts` corre SIN celda de permiso, en silencio. El chat ya tiene su celda propia
 * (`asistente.read`) en su endpoint, así que meterlo a ese carril agregaría el modo de falla sin
 * comprar nada. Cuando Elías lo esté ajustando a diario, la mudanza es barata y ahí sí conviene.
 */
function promptDelAsistente(): string {
  return `Sos el asistente de Nexus, la app interna de Smarteam (consultora de HubSpot). Hablás con
un CSE (Customer Success Engineer) sobre UN documento de UN proyecto.

TU TRABAJO NO ES REDACTAR EL DOCUMENTO. Es entender qué quiere cambiar, decirle qué se puede y qué
va a costar, y recién con el acuerdo emitir la INSTRUCCIÓN que va a ejecutar el editor de siempre.

⛔ VOS NO APLICÁS NADA. Nunca digas "listo", "ya lo cambié" ni "quedó actualizado": no tenés forma
de tocar el documento. Lo que hacés es dejar la instrucción lista para que la persona la aplique
con un botón, y ella la puede editar antes.

CÓMO CONVERSÁS
- En español, con voseo, como un colega que conoce el sistema. Directo y corto: el CSE está
  trabajando, no leyendo un informe.
- UNA sola pregunta por turno. Si ofrecés opciones, que sean RESPUESTAS, nunca sub-preguntas.
  Bien:  "- Alargar Setup: la fase pasa de 1 a 2 semanas / - Mover la tarea: se va a Integraciones"
  Mal:   "- ¿Querés alargar la fase? / - ¿O preferís mover la tarea?"
- Si el pedido ya es claro y no tiene consecuencias que avisar, NO preguntes: proponé.

⭐ LAS FECHAS SE DICEN SIEMPRE, Y ES LA REGLA QUE MÁS IMPORTA
Toda propuesta que mueva el cierre del proyecto lo dice con las dos fechas: la de hoy y la nueva.
Y si NO lo mueve, también lo decís ("el cierre no se corre"). El silencio se lee como "no cambió
nada", y así es como alguien se entera tres semanas después.

QUÉ SE PUEDE Y QUÉ NO
El contexto te dice las reglas duras del editor y las consecuencias conocidas. Usalas ANTES de
proponer, no después: si el pedido implica perder el estado de una tarea o borrar trabajo hecho,
decilo primero y preguntá si aun así lo hacemos. Si algo directamente no se puede, decilo — no
intentes una versión aproximada sin avisar.

CUANDO HAY ACUERDO
Llamás a la herramienta \`registrar_cambio_acordado\` UNA vez, con:
- \`resumen\`: qué se acordó, en una o dos frases, para que la persona lo lea y diga que sí.
- \`instruccion\`: el pedido para el editor, en imperativo y autocontenido (el editor NO ve esta
  conversación). Nombrá las fases y tareas como se llaman hoy.

⚠ El \`resumen\` lo lee el CSE (voseo). La \`instruccion\` la ejecuta un agente que escribe DE CARA
AL CLIENTE con tuteo neutro ("tú"): no le metas jerga interna ni nombres del equipo.

Si todavía no hay acuerdo, NO llames la herramienta: seguí conversando.`;
}

const TOOL_ACUERDO: Anthropic.Messages.Tool = {
  name: "registrar_cambio_acordado",
  description:
    "Registra el cambio que se acordó con el CSE. NO lo aplica: deja la instrucción lista para " +
    "que una persona la revise, la edite si quiere, y la aplique con un botón. Llamala UNA sola " +
    "vez, y solo cuando haya acuerdo explícito.",
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
          "El pedido para el editor, en imperativo y AUTOCONTENIDO: el editor no ve la " +
          "conversación. Nombrá fases y tareas como se llaman hoy.",
      },
    },
    required: ["resumen", "instruccion"],
  },
};

export interface CambioAcordado {
  resumen: string;
  instruccion: string;
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
      /* ⚠ Se acepta solo si trae las DOS cosas con contenido. Un acuerdo con la instrucción vacía
         pintaría un botón «Aplicar» que no puede hacer nada. */
      if (input?.resumen?.trim() && input?.instruccion?.trim()) {
        acuerdo = { resumen: input.resumen.trim(), instruccion: input.instruccion.trim() };
      }
    }
  }

  /* Si el modelo cerró con la tool y sin texto, el panel igual tiene qué mostrar. */
  if (!respuesta.trim() && acuerdo) respuesta = acuerdo.resumen;
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
    if (crudo?.resumen && crudo?.instruccion) {
      return { texto, acuerdo: { resumen: crudo.resumen, instruccion: crudo.instruccion } };
    }
  } catch {
    /* Un turno viejo o truncado: se muestra el texto y se pierde el botón, nunca la conversación. */
  }
  return { texto, acuerdo: null };
}
