import "server-only";

/**
 * lib/guia-exploracion/agente.ts — el agente de la guía de exploración. PROPONE; el CSE confirma.
 *
 *   · «preparar» (al crear la guía, o a pedido): lee el handoff, el kickoff, los cuestionarios de cada
 *     persona y dónde quedó el diagnóstico preliminar, y propone los resultados que el cliente
 *     necesita, cómo opera y dónde se traba cada equipo contratado, a quién involucrar, el plan de
 *     sesiones (cada pregunta atada a un objetivo), lo que no hay que repreguntar, lo que cae fuera de
 *     lo contratado y las contradicciones entre personas.
 *   · «leer» («Leer la última reunión»): lee la última reunión del proyecto que todavía no leyó y
 *     propone qué preguntas del plan ya quedaron respondidas, con la frase literal de la reunión.
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
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { prisma } from "@/lib/db/prisma";
import { ubicacionPreviaDelProyecto } from "@/lib/exploraciones/para-el-cuestionario";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { sanitizeTags } from "@/lib/tags/catalog";
import {
  EQUIPOS,
  HUB_DEL_EQUIPO,
  NOMBRE_DEL_EQUIPO,
  ROLES,
  fusionarPropuestas,
  leerContenido,
  leerPropuesta,
  type ClaveDeEquipo,
} from "./contenido";
import { leerLaRespuesta, type FuenteDeTexto } from "./lectura";
import { ErrorDeGuia, asegurarGuia, corridaEnCurso } from "./servidor";

export const MODELO_DE_LA_GUIA = "claude-sonnet-4-6";


async function fuentesParaPreparar(projectId: string, equipos: ClaveDeEquipo[]): Promise<FuenteDeTexto[]> {
  const [handoff, kickoff, cuestionarios, previo] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: EXPLORACION_HANDOFF_KEYS }).catch(() => ""),
    loadCanvasContext(projectId, "kickoff", { onlyConfirmed: false }).catch(() => ""),
    loadCuestionarioContext(projectId).catch(() => ""),
    ubicacionPreviaDelProyecto(projectId).catch(() => null),
  ]);
  const out: FuenteDeTexto[] = [];
  if (handoff) out.push({ id: "H1", etiqueta: "Handoff", texto: handoff });
  if (kickoff) out.push({ id: "K1", etiqueta: "Kickoff", texto: kickoff });
  if (cuestionarios) out.push({ id: "C1", etiqueta: "Cuestionarios del cliente", texto: cuestionarios });
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
  void equipos;
  return out;
}

/** La última reunión (que ya pasó) que la guía todavía no leyó. */
async function reunionSinLeer(projectId: string, leidas: string[]): Promise<{ id: string; titulo: string; texto: string } | null> {
  const { sessions } = await getProjectMemberSessions(projectId);
  const ahora = Date.now();
  const candidata = sessions
    .filter((s) => s.date <= ahora && !leidas.includes(s.id))
    .sort((a, b) => b.date - a.date)[0];
  if (!candidata) return null;
  const texto = await fetchTranscriptContent(candidata.id, candidata.title, { maxChars: 60_000 });
  return texto ? { id: candidata.id, titulo: candidata.title, texto } : null;
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

function herramienta(ids: string[], equipos: ClaveDeEquipo[], modo: "preparar" | "leer", preguntaIds: string[]): Anthropic.Messages.Tool {
  const fuentes = FUENTES(ids.length ? ids : ["H1"]);
  const texto = { type: "array", items: { type: "object", properties: { texto: { type: "string" }, fuentes }, required: ["texto", "fuentes"] } };
  const porEquipo = equipos.length
    ? { type: "array", items: { type: "object", properties: { equipo: { type: "string", enum: equipos }, texto: { type: "string" }, fuentes }, required: ["equipo", "texto", "fuentes"] } }
    : null;
  const properties: Record<string, unknown> = {
    resultados: {
      type: "array",
      description: "Resultados que el cliente necesita lograr: qué, quién lo necesita y para qué. SIEMPRE dentro de lo contratado; si no, alcance «fuera» o «duda».",
      items: {
        type: "object",
        properties: {
          que: { type: "string" },
          quien: { type: "string" },
          paraQue: { type: "string" },
          alcance: { type: "string", enum: ["dentro", "duda", "fuera"] },
          fuentes,
        },
        required: ["que", "alcance", "fuentes"],
      },
    },
    ...(porEquipo ? { opera: { ...porEquipo, description: "Cómo opera HOY cada equipo contratado (hechos, no suposiciones)." } } : {}),
    ...(porEquipo ? { trabas: { ...porEquipo, description: "Dónde se traba cada equipo contratado." } } : {}),
    personas: {
      type: "array",
      description: "A quién involucrar. Rol solo si la fuente lo dice; si no, null (queda sin confirmar).",
      items: {
        type: "object",
        properties: { nombre: { type: "string" }, rol: { type: ["string", "null"], enum: [...ROLES, null] }, sabe: { type: "string" }, fuentes },
        required: ["nombre", "fuentes"],
      },
    },
    noRepreguntar: { ...texto, description: "Hechos ya AFIRMADOS en la fuente que no hay que volver a preguntar. Pocos y concretos." },
    fueraDeAlcance: { ...texto, description: "Lo que el cliente pide o espera y NO está en lo contratado (para el AM, no para la exploración)." },
    contradicciones: {
      ...texto,
      description: "Dos personas del cliente que dicen cosas incompatibles. El texto nombra a las dos y lo que dice cada una; DOS fuentes con su cita.",
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
    description: "Registra lo que propones para la guía de exploración. Llámala una sola vez. Lo que no tenga respaldo en las fuentes, no lo propongas.",
    input_schema: { type: "object", properties, required: [] } as Anthropic.Messages.Tool["input_schema"],
  };
}

const SYSTEM = `Eres el CSE senior de Smarteam (consultora de HubSpot) y preparas la GUÍA DE EXPLORACIÓN de un cliente: el lienzo que el ejecutivo usa DURANTE las sesiones para saber qué explorar y con quién. No es un informe: es una herramienta de trabajo, corta y accionable.

La guía tiene tres objetivos:
1. Los RESULTADOS que el cliente necesita: qué quiere lograr, quién lo necesita y para qué. Parte del resultado que capturó el handoff y se mantiene dentro de lo contratado.
2. Cada EQUIPO contratado (solo los hubs del proyecto): cómo opera hoy y dónde se traba.
3. La ESCALA: lo que el diagnóstico preliminar ubicó es punto de partida, no evidencia; las preguntas del plan cierran lo que falta confirmar.

Reglas duras:
- Nunca inventes hechos, personas, sistemas ni cifras. Todo lo que propones cita su fuente; si hay frase literal, cópiala tal cual en «cita».
- Sin repetir: un tema va en UN solo lugar. «No repreguntar» es corto: solo hechos afirmados que quemarían una sesión si se volvieran a preguntar.
- Los riesgos comerciales y de alcance NO son el centro: lo que cae fuera de lo contratado va a «fueraDeAlcance» y nada más.
- Las preguntas del plan son literales, abiertas, piden ejemplos reales; cada una dice a qué objetivo apunta.
- Español neutro, tuteo.`;

/** Arranca una corrida sin esperar. Error si ya hay una en curso. */
export async function lanzarCorrida(projectId: string, modo: "preparar" | "leer"): Promise<void> {
  const f = await asegurarGuia(projectId);
  if (corridaEnCurso(f)) throw new ErrorDeGuia("El agente ya está trabajando en esta guía.", 409);
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
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true, tags: true, client: { select: { name: true, industry: true } } } }),
  ]);
  const tags = sanitizeTags(project?.tags ?? []);
  const equipos = EQUIPOS.filter((e) => tags.includes(HUB_DEL_EQUIPO[e]));
  const contenido = leerContenido(fila.contenido);
  const propuesta = leerPropuesta(fila.propuesta);

  let fuentes: FuenteDeTexto[];
  let leida: string | null = null;
  if (modo === "leer") {
    const r = await reunionSinLeer(projectId, propuesta.leidas);
    if (!r) throw new Error("No hay reuniones nuevas del proyecto para leer.");
    fuentes = [{ id: "R1", etiqueta: `Reunión: ${r.titulo}`, texto: r.texto }];
    leida = r.id;
  } else {
    fuentes = await fuentesParaPreparar(projectId, equipos);
    if (fuentes.length === 0) throw new Error("No hay handoff, kickoff ni cuestionarios de dónde preparar la guía.");
  }

  const plan = contenido.sesiones
    .map((s) => `### ${s.titulo} (con ${s.conQuien || "—"})\n${s.preguntas.map((q) => `- [${q.id}] ${q.texto}${q.hecha ? " (ya hecha)" : ""}`).join("\n")}`)
    .join("\n");
  const yaConfirmado = [
    contenido.resultados.length ? `Resultados: ${contenido.resultados.map((r) => r.que).join(" · ")}` : "",
    contenido.personas.length ? `Personas: ${contenido.personas.map((p) => p.nombre).join(" · ")}` : "",
    contenido.noRepreguntar.length ? `No repreguntar: ${contenido.noRepreguntar.map((d) => d.texto).join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const preguntaIds = contenido.sesiones.flatMap((s) => s.preguntas.filter((q) => !q.hecha).map((q) => q.id));

  const res = await getAnthropic().messages.create({
    model: MODELO_DE_LA_GUIA,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [herramienta(fuentes.map((f) => f.id), equipos, modo, preguntaIds)],
    tool_choice: { type: "tool", name: "proponer" },
    messages: [
      {
        role: "user",
        content:
          `Cliente: ${project?.client.name ?? "—"} · Industria: ${project?.client.industry ?? "—"} · Proyecto: ${project?.name ?? "—"}\n` +
          `Equipos contratados: ${equipos.map((e) => NOMBRE_DEL_EQUIPO[e]).join(", ") || "ninguno de ventas, marketing o servicio"}\n\n` +
          (yaConfirmado ? `=== YA CONFIRMADO EN LA GUÍA (no lo repitas) ===\n${yaConfirmado}\n\n` : "") +
          (plan ? `=== PLAN DE SESIONES ACTUAL ===\n${plan}\n\n` : "") +
          fuentes.map((f) => `=== [${f.id}] ${f.etiqueta} ===\n${f.texto}`).join("\n\n") +
          (modo === "leer"
            ? "\n\nLee la reunión y propone: qué preguntas del plan ya quedaron respondidas (con la frase literal), y lo nuevo que apareció (trabas, personas, resultados, lo que cae fuera de lo contratado, contradicciones)."
            : "\n\nPrepara la guía siguiendo tus instrucciones."),
      },
    ],
  });
  const bloque = res.content.find((b) => b.type === "tool_use");
  const corridaId = `c-${Date.now().toString(36)}`;
  const en = new Date().toISOString();
  const { items, descartadas } = leerLaRespuesta(bloque && bloque.type === "tool_use" ? bloque.input : {}, fuentes, equipos, contenido.sesiones, corridaId, en);

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
