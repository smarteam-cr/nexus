/**
 * lib/auditoria-portal/analisis/prompt.ts — EL PEDIDO DEL ANÁLISIS DE LA AUDITORÍA.
 *
 * Vive en CÓDIGO y no en una fila de `Agent`, a propósito (ARCHITECTURE §6.2): es un prompt interno
 * que cambia junto con la forma de los hechos y de la respuesta, y así queda versionado con ellos.
 * Reemplaza al prompt del agente `agent-audit-portal` (que vivía solo en la base, sin semilla, y
 * pedía comparar contra «benchmarks» sin fuente). Esa fila quedó sin lectores.
 *
 * Lo que devuelve es un INFORME, no una lista de comentarios (2026-10-04, segunda vuelta):
 *  · el estado del portal: un veredicto y su explicación, para entender la cuenta en dos minutos;
 *  · una lectura por sección y una por cada reporte de la pantalla (qué revela ese reporte);
 *  · hallazgos con su cifra, por qué importan, qué hacer y una decisión;
 *  · preguntas para el cliente.
 * Cruza secciones y, si hay, lo que Nexus sabe del cliente (diagnóstico, planificación): nunca
 * compara contra la «industria».
 * PURO: arma el pedido, no llama a nadie.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { DECISIONES, SECCIONES_CON_LECTURA, SECCIONES_DE_HALLAZGO, SEVERIDADES } from "../foto";
import type { DefDeReporte } from "../reportes";
import type { HechosDelPortal } from "./hechos";

/** Un análisis por auditoría, pocas veces al mes: el modelo más capaz, con esfuerzo alto. */
export const MODELO_DEL_ANALISIS = "claude-opus-5-5";

export const SLUG_DEL_ANALISIS = "auditoria-portal";

export const SYSTEM_DEL_ANALISIS = [
  "Eres consultor senior de RevOps en Smarteam, partner de HubSpot en Costa Rica.",
  "Escribes el informe de auditoría de un portal de HubSpot, casi siempre al empezar una reimplementación: el cliente viene de otro partner y el equipo de Customer Success tiene que entender rápido cómo está la cuenta, qué funciona, qué está roto o abandonado y qué conviene hacer con cada cosa.",
  "Escribes en español neutro con tuteo («Revisa», «Define»). Nunca voseo. Frases cortas, en lenguaje de negocio, sin jerga técnica innecesaria.",
].join(" ");

export const INSTRUCCIONES_DEL_ANALISIS = `Arriba están los HECHOS del portal (cada uno con su clave entre corchetes), el DETALLE (listas de workflows, pipelines y propiedades), los REPORTES que el equipo ve en pantalla y, si hay, LO QUE NEXUS SABE DEL CLIENTE (sale de los documentos del proyecto, no del portal).

Devuelve:
- estado:
  · titular: el veredicto sobre el portal en una frase de 10 a 18 palabras («El portal registra mucho, pero la venta se sigue fuera de HubSpot»). Sin cifras.
  · parrafo: 3 o 4 frases: qué funciona, qué está roto o abandonado y qué significa para la reimplementación. Con las dos o tres cifras que más pesan.
- secciones: una lectura por cada sección (ciclo, propietarios, propiedades, pipelines, workflows, usuarios) con datos leídos: 1 o 2 frases sobre cómo está el portal en eso y qué significa. Que no repita el titular de un hallazgo.
- reportes: una lectura por CADA reporte de la lista: una sola frase, de 12 a 30 palabras, con la cifra más reveladora de ese reporte y lo que significa para la cuenta. No describas el gráfico («el gráfico muestra…»): di lo que revela («Dos personas tienen el 90 % de los contactos: la cartera depende de ellas»).
- hallazgos: entre 6 y 10, ordenados por impacto en la reimplementación (lo más importante primero). Cada uno:
  · seccion: dónde vive.
  · severidad: «critico» si traba la reimplementación o la operación del cliente, «atencion» si hay que resolverlo, «bien» si funciona y conviene conservarlo. Incluye al menos un «bien» si los datos lo muestran.
  · titulo: el hallazgo como afirmación, máximo 10 palabras, en lenguaje de negocio.
  · dato: la cifra que lo resume, con un rótulo de 1 a 3 palabras («8 workflows», «46,5 %», «58 propiedades»). Cadena vacía si ninguna cifra lo resume.
  · hallazgo: lo que se vio, en 1 o 2 frases cortas con las cifras que lo prueban.
  · porQueImporta: 1 frase: qué le pasa al negocio del cliente o a la reimplementación si no se atiende.
  · recomendacion: 1 frase que empiece con un verbo («Define…», «Apaga…», «Pregunta…»).
  · decision: qué haría Smarteam al reimplementar: conservar, corregir, apagar o investigar (cuando el portal no alcanza para decidir).
  · evidencia: las claves de los hechos en que se apoya (las de los corchetes; al menos una).
  · pregunta: si hace falta confirmarlo con el cliente, la pregunta exacta; si no, cadena vacía.
- preguntas: de 3 a 6 preguntas para el cliente que el portal no puede responder y que más cambian la reimplementación.

Reglas de evidencia (obligatorias):
- Usa SOLO los hechos, el detalle y lo que Nexus sabe del cliente. Cada cifra que escribas tiene que estar tal cual en ellos: no calcules cifras nuevas, no restes, no redondees a «mil». Si necesitas una proporción, usa el porcentaje que ya viene escrito.
- «no se pudo leer» NO es cero: no concluyas nada de eso. Si importa, conviértelo en pregunta o en un hallazgo «investigar».
- Lo que Nexus sabe del cliente NO es el portal: úsalo para comparar (lo planificado contra lo que hay; lo que el cliente dice que hace contra lo que el portal muestra) y dilo («según el Diagnóstico», «según la Planificación»).
- No compares contra promedios de la industria ni «benchmarks»: no hay ninguno en los datos.
- No juzgues a quien configuró el portal («mal hecho», «descuidado»): describe el hecho y su efecto. El informe puede llegar al cliente.

Qué busca un buen análisis (cruza secciones; ahí está lo que no se ve gráfico por gráfico):
- Ciclo de vida: etapas que no se usan o se saltan, contactos y empresas que no coinciden, qué workflows ponen la etapa.
- Pipelines: dónde se acumulan los abiertos, etapas sin registros, abiertos sin ningún cambio en 90 días, pipelines de prueba o abandonados, pipelines que no son de venta ni de servicio, qué etapas mueve la automatización y qué corre al entrar a cada una. Si hay Planificación: las etapas planificadas que faltan y las que sobran.
- Workflows: cadenas (uno escribe lo que dispara a otro: tocar uno cambia el otro), posibles bucles, avisos a personas que ya no están, varios escribiendo la misma propiedad, encendidos sin cambios hace años, los más editados (lo más usado o lo más frágil), código propio o webhooks.
- Propiedades: lo que creó gente que ya no está, duplicados por nombre, propiedades en el objeto equivocado.
- Propietarios y usuarios: reparto, contactos sin dueño, si la asignación acompaña a lo que se crea, administradores de más, dominios ajenos con acceso.
- Actividad: cuánto de la base está viva y qué parte del trabajo comercial ocurre fuera de HubSpot.
- No repitas un hallazgo en dos secciones. Nada de obviedades («el portal tiene contactos»).`;

/** El esquema de la respuesta (salida estructurada). Los reportes van como lista cerrada: no se puede inventar uno. */
export function esquemaDelAnalisis(reportes: readonly DefDeReporte[]) {
  const ids = reportes.length ? reportes.map((r) => r.id) : ["ninguno"];
  return {
    type: "object",
    properties: {
      estado: {
        type: "object",
        properties: { titular: { type: "string" }, parrafo: { type: "string" } },
        required: ["titular", "parrafo"],
        additionalProperties: false,
      },
      secciones: {
        type: "array",
        items: {
          type: "object",
          properties: { seccion: { type: "string", enum: [...SECCIONES_CON_LECTURA] }, lectura: { type: "string" } },
          required: ["seccion", "lectura"],
          additionalProperties: false,
        },
      },
      reportes: {
        type: "array",
        items: {
          type: "object",
          properties: { reporte: { type: "string", enum: ids }, lectura: { type: "string" } },
          required: ["reporte", "lectura"],
          additionalProperties: false,
        },
      },
      hallazgos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            seccion: { type: "string", enum: [...SECCIONES_DE_HALLAZGO] },
            severidad: { type: "string", enum: [...SEVERIDADES] },
            titulo: { type: "string" },
            dato: { type: "string" },
            hallazgo: { type: "string" },
            porQueImporta: { type: "string" },
            recomendacion: { type: "string" },
            decision: { type: "string", enum: [...DECISIONES] },
            evidencia: { type: "array", items: { type: "string" } },
            pregunta: { type: "string" },
          },
          required: ["seccion", "severidad", "titulo", "dato", "hallazgo", "porQueImporta", "recomendacion", "decision", "evidencia", "pregunta"],
          additionalProperties: false,
        },
      },
      preguntas: { type: "array", items: { type: "string" } },
    },
    required: ["estado", "secciones", "reportes", "hallazgos", "preguntas"],
    additionalProperties: false,
  } as const;
}

/** Los hechos como texto, con su clave entre corchetes. */
export function hechosComoTexto(h: HechosDelPortal): string {
  const lineas = h.hechos.map((x) => `[${x.clave}] ${x.texto}`);
  return `=== HECHOS ===\n${lineas.join("\n")}${h.detalle ? `\n\n=== DETALLE ===\n${h.detalle}` : ""}`;
}

export function pedidoDelAnalisis(opts: {
  hechos: HechosDelPortal;
  reportes: readonly DefDeReporte[];
  /** Criterios propios de Smarteam para este portal, si hay (base de conocimiento de la cuenta). */
  criterios?: readonly { titulo: string; contenido: string }[];
}): Anthropic.Messages.MessageStreamParams {
  const criterios = opts.criterios?.length
    ? `=== CRITERIOS DE SMARTEAM (aplícalos si los datos los activan) ===\n${opts.criterios.map((c) => `- ${c.titulo}: ${c.contenido}`).join("\n")}\n\n`
    : "";
  const reportes = `=== REPORTES DE LA PANTALLA (una lectura para cada uno) ===\n${opts.reportes.map((r) => `[${r.id}] ${r.titulo} — ${r.queMuestra}`).join("\n")}`;
  const cliente = opts.hechos.cliente?.trim()
    ? `\n\n=== LO QUE NEXUS SABE DEL CLIENTE (documentos del proyecto, no el portal) ===\n${opts.hechos.cliente.trim()}`
    : "";
  return {
    model: MODELO_DEL_ANALISIS,
    // El pensamiento sale de este mismo presupuesto. Va por streaming (servidor.ts): sin stream el SDK
    // no acepta más de ~21k, y con el razonamiento de un portal grande 16k se quedaba corto.
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system: SYSTEM_DEL_ANALISIS,
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: esquemaDelAnalisis(opts.reportes) as unknown as Record<string, unknown> },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${criterios}${hechosComoTexto(opts.hechos)}\n\n${reportes}${cliente}` },
          { type: "text", text: `\n\n${INSTRUCCIONES_DEL_ANALISIS}` },
        ],
      },
    ],
  };
}
