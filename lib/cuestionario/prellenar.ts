import "server-only";

/**
 * lib/cuestionario/prellenar.ts — Nexus contesta de antemano lo que YA sabe.
 *
 * Lee el handoff (solo las secciones aptas para el cliente) y el kickoff del proyecto y propone respuestas SOLO para las preguntas que esas
 * fuentes contestan de forma explícita. El cliente ve cada una como «Esto es lo que entendimos»
 * y la confirma o la corrige: así el cuestionario le pregunta de verdad solo lo que no sabemos.
 *
 * Reglas:
 *   · Nunca pisa una respuesta que ya existe (del cliente, del CSE o de un prellenado anterior).
 *   · Nunca toca una pestaña enviada.
 *   · No prellena las etapas del proceso: son el relato del cliente, no un dato del handoff.
 *   · Ante la duda, no contesta. Una suposición prellenada que el cliente confirma por apuro es
 *     peor que una pregunta vacía.
 *
 * Corre FUERA del request (tarda lo que tarda una llamada a Claude): el POST lo arranca y la
 * pantalla sigue el estado por `prellenandoDesde` / `prellenadoAt` / `prellenadoError`.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { KICKOFF_HANDOFF_KEYS } from "@/components/landing/configs/kickoff.defs";
import { loadCanvasContext, loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { prisma } from "@/lib/db/prisma";
import { PRELLENADO_VENCE_MS } from "./prellenado-estado";
import { estaContestada, leerPreguntas, leerRespuestas, type Respuestas } from "./tipos";

export const MODELO_PRELLENADO = "claude-sonnet-4-6";

const TOOL: Anthropic.Messages.Tool = {
  name: "registrar_respuestas",
  description:
    "Registra las respuestas que las fuentes contestan de forma EXPLÍCITA. Llámala una sola vez. " +
    "Si ninguna pregunta tiene respuesta en las fuentes, mándala con la lista vacía.",
  input_schema: {
    type: "object",
    properties: {
      respuestas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pregunta_id: { type: "string", description: "El id exacto de la pregunta, tal como aparece en la lista." },
            respuesta: {
              type: "string",
              description:
                "La respuesta, breve y concreta, escrita como la diría el cliente (primera persona del plural: «usamos…», «somos…»). Sin adornos.",
            },
          },
          required: ["pregunta_id", "respuesta"],
        },
      },
    },
    required: ["respuestas"],
  },
};

const SYSTEM = `Eres el asistente de Smarteam, una consultora que implementa HubSpot. Antes de las sesiones de exploración, le mandamos al cliente un cuestionario. Tu tarea: dejar prellenadas las preguntas que YA están contestadas en lo que el cliente nos dijo antes (handoff de ventas y kickoff), para que no tenga que repetirlo. El cliente verá cada respuesta como «Esto es lo que entendimos» y la confirmará o corregirá.

Reglas estrictas:
- Contesta SOLO lo que las fuentes dicen de forma explícita. Si hay que deducir, suponer o completar, NO contestes esa pregunta.
- Respuestas cortas (una o dos frases), concretas, con los números y nombres tal como aparecen.
- Escribe en español neutro, como lo diría el cliente («Usamos Gmail», «Somos 8 vendedores»).
- Nunca incluyas información interna de Smarteam (precios, márgenes, opiniones del equipo, riesgos comerciales).
- Mejor pocas respuestas seguras que muchas dudosas.`;

interface PreguntaAbierta {
  pestanaId: string;
  id: string;
  texto: string;
  pestanaTitulo: string;
}

export async function prellenarCuestionario(projectId: string): Promise<{ prellenadas: number }> {
  const c = await prisma.cuestionario.findUnique({
    where: { projectId },
    include: { pestanas: { orderBy: { orden: "asc" } } },
  });
  if (!c) throw new Error("El proyecto no tiene cuestionario");

  const abiertas: PreguntaAbierta[] = [];
  for (const p of c.pestanas) {
    if (p.enviadaAt) continue;
    const respuestas = leerRespuestas(p.respuestas);
    for (const q of leerPreguntas(p.preguntas)) {
      if (!estaContestada(respuestas[q.id])) abiertas.push({ pestanaId: p.id, id: q.id, texto: q.texto, pestanaTitulo: p.titulo });
    }
  }
  if (abiertas.length === 0) return { prellenadas: 0 };

  const [handoff, kickoff, project] = await Promise.all([
    // ⛔ Allowlist del KICKOFF, no el handoff entero: lo prellenado lo lee el CLIENTE sin que nadie
    // lo revise en el medio (lib/canvas/handoff-al-cliente.test.ts). Riesgos, acuerdos comerciales y
    // por qué nos eligieron no pueden llegar a su pantalla ni como «esto es lo que entendimos».
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: KICKOFF_HANDOFF_KEYS }),
    loadCanvasContext(projectId, "kickoff", { onlyConfirmed: false }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, client: { select: { name: true, industry: true } } },
    }),
  ]);
  if (!handoff && !kickoff) throw new Error("No hay handoff ni kickoff de dónde sacar respuestas.");

  const lista = abiertas.map((q) => `- [${q.id}] (${q.pestanaTitulo}) ${q.texto}`).join("\n");
  const respuesta = await getAnthropic().messages.create({
    model: MODELO_PRELLENADO,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [
      {
        role: "user",
        content:
          `Cliente: ${project?.client.name ?? "—"} · Industria: ${project?.client.industry ?? "—"} · Proyecto: ${project?.name ?? "—"}\n\n` +
          `=== PREGUNTAS SIN RESPUESTA ===\n${lista}\n\n` +
          `=== HANDOFF DE VENTAS ===\n${handoff || "(sin handoff)"}\n\n` +
          `=== KICKOFF ===\n${kickoff || "(sin kickoff)"}`,
      },
    ],
  });

  const bloque = respuesta.content.find((b) => b.type === "tool_use" && b.name === TOOL.name);
  const crudas = (bloque && bloque.type === "tool_use" ? (bloque.input as { respuestas?: unknown }).respuestas : null) ?? [];
  if (!Array.isArray(crudas)) return { prellenadas: 0 };

  const porId = new Map(abiertas.map((q) => [q.id, q]));
  const ahora = new Date().toISOString();
  const porPestana = new Map<string, Respuestas>();
  for (const r of crudas) {
    const id = typeof r?.pregunta_id === "string" ? r.pregunta_id : "";
    const valor = typeof r?.respuesta === "string" ? r.respuesta.trim().slice(0, 2000) : "";
    const q = porId.get(id);
    if (!q || !valor) continue; // un id inventado o una respuesta vacía no entran
    const m = porPestana.get(q.pestanaId) ?? {};
    m[id] = { valor, origen: "prellenado", actualizadoAt: ahora };
    porPestana.set(q.pestanaId, m);
  }

  // Se relee cada pestaña justo antes de escribir: mientras corría la IA, el cliente pudo haber
  // contestado. Lo suyo gana siempre.
  let prellenadas = 0;
  for (const [pestanaId, nuevas] of porPestana) {
    await prisma.$transaction(async (tx) => {
      const fila = await tx.cuestionarioPestana.findUnique({ where: { id: pestanaId } });
      if (!fila || fila.enviadaAt) return;
      const actuales = leerRespuestas(fila.respuestas);
      for (const [id, r] of Object.entries(nuevas)) {
        if (estaContestada(actuales[id])) continue;
        actuales[id] = r;
        prellenadas++;
      }
      await tx.cuestionarioPestana.update({
        where: { id: pestanaId },
        data: { respuestas: actuales as unknown as Prisma.InputJsonValue },
      });
    });
  }
  return { prellenadas };
}

/**
 * Arranca el prellenado sin esperar. Devuelve false si ya hay uno en curso (y no venció).
 * El resultado queda en la fila: la pantalla lo lee por el GET.
 */
export async function arrancarPrellenado(projectId: string): Promise<boolean> {
  const c = await prisma.cuestionario.findUnique({ where: { projectId } });
  if (!c) return false;
  const enCurso =
    c.prellenandoDesde &&
    (!c.prellenadoAt || c.prellenandoDesde > c.prellenadoAt) &&
    Date.now() - c.prellenandoDesde.getTime() < PRELLENADO_VENCE_MS;
  if (enCurso) return false;

  await prisma.cuestionario.update({
    where: { id: c.id },
    data: { prellenandoDesde: new Date(), prellenadoError: null },
  });

  void prellenarCuestionario(projectId)
    .then(() => prisma.cuestionario.update({ where: { id: c.id }, data: { prellenadoAt: new Date() } }))
    .catch(async (e) => {
      console.error("[cuestionario] prellenado falló:", e instanceof Error ? e.message : e);
      await prisma.cuestionario
        .update({
          where: { id: c.id },
          data: {
            prellenadoAt: new Date(),
            prellenadoError: e instanceof Error ? e.message.slice(0, 300) : "Falló el prellenado",
          },
        })
        .catch(() => {});
    });
  return true;
}
