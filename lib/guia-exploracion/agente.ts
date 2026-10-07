import "server-only";

/**
 * lib/guia-exploracion/agente.ts — el agente de las SESIONES de exploración. PROPONE; el CSE confirma.
 *
 *   · «preparar» (a pedido): lee el handoff, el kickoff, los cuestionarios de cada persona, lo que ya
 *     dice Información del cliente y dónde quedó el diagnóstico preliminar, y propone el plan de
 *     sesiones (cada pregunta atada a un objetivo) y las contradicciones entre personas.
 *   · «leer» («Leer la reunión»): lee la última reunión del proyecto que todavía no leyó y propone qué
 *     preguntas del plan ya quedaron respondidas, con la frase literal de la reunión.
 *
 * Lo NUEVO que aparece sobre el cliente (resultados, dolores, personas, herramientas) NO lo propone
 * este agente: cada reunión ya pasa por la ficha (lib/clients/ficha-propuesta.ts, puerta de cada
 * sesión) y lo que el CSE anota como «lo que averiguaste» también (lib/guia-exploracion/a-la-ficha.ts).
 * Dos agentes proponiendo lo mismo en dos lugares era la guía que se retiró el 2026-10-05.
 *
 * Nada de lo que devuelve escribe en lo confirmado: va a `propuesta` (lib/guia-exploracion/contenido.ts).
 * Cada propuesta cita su fuente; una cita que no aparece LITERAL en la fuente se descarta (la propuesta
 * de «ya respondida» y la contradicción la exigen).
 *
 * Corre FUERA del request (lo que tarda una llamada a Claude): la pantalla sigue el estado por la fila.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { EXPLORACION_HANDOFF_KEYS } from "@/components/landing/configs/exploracion.defs";
import { loadCanvasContext, loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { CAMPOS_DE_LA_FICHA, etiquetaDeApertura, leerFicha, valorVigente } from "@/lib/clients/ficha";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { prisma } from "@/lib/db/prisma";
import { ubicacionPreviaDelProyecto } from "@/lib/exploraciones/para-el-cuestionario";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { sanitizeTags } from "@/lib/tags/catalog";
import { EQUIPOS, HUB_DEL_EQUIPO, NOMBRE_DEL_EQUIPO, fusionarPropuestas, leerContenido, leerPropuesta } from "./contenido";
import { leerLaRespuesta, type FuenteDeTexto } from "./lectura";
import { ErrorDeGuia, asegurarGuia, corridaEnCurso, ultimaReunionSinLeer } from "./servidor";

export const MODELO_DE_LA_GUIA = "claude-sonnet-4-6";

/** Lo que ya dice la ficha del cliente: lo confirmado y, marcado, lo que propuso la IA sin confirmar. */
function fichaComoFuente(fichaCruda: unknown): string {
  const ficha = leerFicha(fichaCruda);
  return CAMPOS_DE_LA_FICHA.flatMap((c) => {
    const v = valorVigente(ficha, c.clave).trim();
    const mostrado = c.destino.tipo === "lista" ? etiquetaDeApertura(v) : v;
    if (!mostrado) return [];
    const sinConfirmar = v !== ficha.valores[c.clave].trim() ? " (propuesta de la IA, sin confirmar)" : "";
    return [`### ${c.etiqueta}${sinConfirmar}\n${mostrado}`];
  }).join("\n\n");
}

async function fuentesParaPreparar(projectId: string, fichaCruda: unknown): Promise<FuenteDeTexto[]> {
  const [handoff, kickoff, cuestionarios, previo] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: EXPLORACION_HANDOFF_KEYS }).catch(() => ""),
    loadCanvasContext(projectId, "kickoff", { onlyConfirmed: false }).catch(() => ""),
    loadCuestionarioContext(projectId).catch(() => ""),
    ubicacionPreviaDelProyecto(projectId).catch(() => null),
  ]);
  const ficha = fichaComoFuente(fichaCruda);
  const out: FuenteDeTexto[] = [];
  if (handoff) out.push({ id: "H1", etiqueta: "Handoff", texto: handoff });
  if (kickoff) out.push({ id: "K1", etiqueta: "Kickoff", texto: kickoff });
  if (cuestionarios) out.push({ id: "C1", etiqueta: "Cuestionarios del cliente", texto: cuestionarios });
  if (ficha) out.push({ id: "F1", etiqueta: "Información del cliente", texto: ficha });
  if (previo && Object.keys(previo.porDimension).length) {
    out.push({
      id: "P1",
      etiqueta: "Diagnóstico preliminar",
      texto:
        "Niveles estimados ANTES de la exploración (punto de partida, no evidencia), por dimensión de la escala:\n" +
        Object.entries(previo.porDimension)
          .map(([d, v]) => `- ${d}: ${v.nivel} (${v.fuente === "test" ? "test en línea" : "exploración de venta"})`)
          .join("\n"),
    });
  }
  return out;
}

const FUENTES = (ids: string[]) => ({
  type: "array",
  description: "De qué fuente sale, con la frase LITERAL que lo respalda cuando la hay.",
  items: {
    type: "object",
    properties: { id: { type: "string", enum: ids }, cita: { type: "string", description: "Frase copiada tal cual de la fuente." } },
    required: ["id"],
  },
});

function herramienta(ids: string[], modo: "preparar" | "leer", preguntaIds: string[]): Anthropic.Messages.Tool {
  const fuentes = FUENTES(ids.length ? ids : ["H1"]);
  const properties: Record<string, unknown> = {
    contradicciones: {
      type: "array",
      description: "Dos personas del cliente que dicen cosas incompatibles. El texto es UNA pregunta para cerrarlo en sesión, que nombra a las dos y lo que dice cada una; DOS fuentes con su cita.",
      items: { type: "object", properties: { texto: { type: "string" }, fuentes }, required: ["texto", "fuentes"] },
    },
  };
  if (modo === "preparar") {
    properties.sesiones = {
      type: "array",
      description: "El plan de sesiones: 2 a 4, en orden, cada una con con quién y 4 a 8 preguntas literales, abiertas.",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          objetivo: { type: "string" },
          conQuien: { type: "string" },
          preguntas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                texto: { type: "string" },
                repregunta: { type: "string", description: "Qué preguntar si la respuesta sale vaga." },
                objetivo: { type: "string", description: "«resultados», un equipo (ventas, marketing, servicio) o «escala:<id de la dimensión>»." },
              },
              required: ["texto"],
            },
          },
          fuentes,
        },
        required: ["titulo", "objetivo", "conQuien", "preguntas", "fuentes"],
      },
    };
  } else if (preguntaIds.length) {
    properties.respondidas = {
      type: "array",
      description: "Preguntas del plan que la reunión YA contestó. Con la frase literal de la reunión.",
      items: {
        type: "object",
        properties: { preguntaId: { type: "string", enum: preguntaIds }, respuesta: { type: "string" }, fuentes },
        required: ["preguntaId", "respuesta", "fuentes"],
      },
    };
  }
  return {
    name: "proponer",
    description: "Registra lo que propones para las sesiones de exploración. Llámala una sola vez. Lo que no tenga respaldo en las fuentes, no lo propongas.",
    input_schema: { type: "object", properties, required: [] } as Anthropic.Messages.Tool["input_schema"],
  };
}

const SYSTEM = `Eres el CSE senior de Smarteam (consultora de HubSpot) y preparas las SESIONES DE EXPLORACIÓN de un cliente: qué preguntar en cada sesión y con quién. No es un informe: es el guion que el ejecutivo usa DURANTE las reuniones, corto y accionable.

Cada pregunta apunta a uno de tres objetivos:
1. Los RESULTADOS que el cliente necesita: qué quiere lograr, quién lo necesita y para qué, dentro de lo contratado.
2. Cada EQUIPO contratado (solo los hubs del proyecto): cómo opera hoy y dónde se traba.
3. La ESCALA: lo que el diagnóstico preliminar ubicó es punto de partida, no evidencia; las preguntas cierran lo que falta confirmar.

Reglas duras:
- Nunca inventes hechos, personas, sistemas ni cifras. Todo lo que propones cita su fuente; si hay frase literal, cópiala tal cual en «cita».
- No preguntes lo que ya está afirmado en el handoff o en «Información del cliente»: quema una sesión. Pregunta por lo que falta o por lo que solo es supuesto.
- Las preguntas son literales, abiertas y piden ejemplos reales; cada una dice a qué objetivo apunta.
- Lo que cae fuera de lo contratado no se explora: no hagas preguntas para venderlo.
- Español neutro, tuteo.`;

/** Arranca una corrida sin esperar. Error si ya hay una en curso. */
export async function lanzarCorrida(projectId: string, modo: "preparar" | "leer"): Promise<void> {
  const f = await asegurarGuia(projectId);
  if (corridaEnCurso(f)) throw new ErrorDeGuia("El agente ya está trabajando en estas sesiones.", 409);
  await prisma.guiaDeExploracion.update({
    where: { projectId },
    data: { corriendoDesde: new Date(), corridaModo: modo, corridaError: null },
  });
  void correr(projectId, modo)
    .then(() => prisma.guiaDeExploracion.update({ where: { projectId }, data: { corridaTerminoAt: new Date() } }))
    .catch(async (e) => {
      console.error("[guia-exploracion] la corrida falló:", e instanceof Error ? e.message : e);
      await prisma.guiaDeExploracion
        .update({
          where: { projectId },
          data: { corridaTerminoAt: new Date(), corridaError: e instanceof Error ? e.message.slice(0, 300) : "Falló el agente" },
        })
        .catch(() => {});
    });
}

async function correr(projectId: string, modo: "preparar" | "leer"): Promise<void> {
  const [fila, project] = await Promise.all([
    prisma.guiaDeExploracion.findUniqueOrThrow({ where: { projectId } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true, tags: true, client: { select: { name: true, industry: true, ficha: true } } } }),
  ]);
  const tags = sanitizeTags(project?.tags ?? []);
  const equipos = EQUIPOS.filter((e) => tags.includes(HUB_DEL_EQUIPO[e]));
  const contenido = leerContenido(fila.contenido);
  const propuesta = leerPropuesta(fila.propuesta);

  let fuentes: FuenteDeTexto[];
  let leida: string | null = null;
  if (modo === "leer") {
    const r = await ultimaReunionSinLeer(projectId, propuesta.leidas);
    if (!r) throw new Error("No hay reuniones nuevas del proyecto para leer.");
    const texto = await fetchTranscriptContent(r.id, r.titulo, { maxChars: 60_000 });
    if (!texto) throw new Error(`La reunión «${r.titulo}» no tiene transcripción para leer.`);
    fuentes = [{ id: "R1", etiqueta: `Reunión: ${r.titulo}`, texto }];
    leida = r.id;
  } else {
    fuentes = await fuentesParaPreparar(projectId, project?.client.ficha);
    if (fuentes.length === 0) throw new Error("No hay handoff, kickoff, cuestionarios ni ficha de dónde preparar las sesiones.");
  }

  const plan = contenido.sesiones
    .map((s) => `### ${s.titulo} (con ${s.conQuien || "—"})\n${s.preguntas.map((q) => `- [${q.id}] ${q.texto}${q.hecha ? " (ya hecha)" : ""}`).join("\n")}`)
    .join("\n");
  const preguntaIds = contenido.sesiones.flatMap((s) => s.preguntas.filter((q) => !q.hecha).map((q) => q.id));

  const res = await getAnthropic().messages.create({
    model: MODELO_DE_LA_GUIA,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [herramienta(fuentes.map((f) => f.id), modo, preguntaIds)],
    tool_choice: { type: "tool", name: "proponer" },
    messages: [
      {
        role: "user",
        content:
          `Cliente: ${project?.client.name ?? "—"} · Industria: ${project?.client.industry ?? "—"} · Proyecto: ${project?.name ?? "—"}\n` +
          `Equipos contratados: ${equipos.map((e) => NOMBRE_DEL_EQUIPO[e]).join(", ") || "ninguno de ventas, marketing o servicio"}\n\n` +
          (plan ? `=== PLAN DE SESIONES ACTUAL (no repitas sesiones ni preguntas que ya están) ===\n${plan}\n\n` : "") +
          fuentes.map((f) => `=== [${f.id}] ${f.etiqueta} ===\n${f.texto}`).join("\n\n") +
          (modo === "leer"
            ? "\n\nLee la reunión y propone qué preguntas del plan ya quedaron respondidas (con la frase literal) y las contradicciones que aparecieron entre personas del cliente."
            : "\n\nPrepara las sesiones siguiendo tus instrucciones."),
      },
    ],
  });
  const bloque = res.content.find((b) => b.type === "tool_use");
  const corridaId = `c-${Date.now().toString(36)}`;
  const en = new Date().toISOString();
  const { items, descartadas } = leerLaRespuesta(bloque && bloque.type === "tool_use" ? bloque.input : {}, fuentes, contenido.sesiones, corridaId, en);

  // Se guarda con la fila bloqueada y sobre lo ÚLTIMO confirmado: mientras corría, el CSE pudo confirmar algo.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "GuiaDeExploracion" WHERE "projectId" = ${projectId} FOR UPDATE`;
    const actual = await tx.guiaDeExploracion.findUniqueOrThrow({ where: { projectId } });
    const p = leerPropuesta(actual.propuesta);
    const fusion = fusionarPropuestas(p, leerContenido(actual.contenido), items, { id: corridaId, modo, en, propuestas: items.length, descartadas });
    if (leida) fusion.leidas = [...new Set([...fusion.leidas, leida])];
    await tx.guiaDeExploracion.update({ where: { projectId }, data: { propuesta: fusion as unknown as Prisma.InputJsonValue } });
  });
}
