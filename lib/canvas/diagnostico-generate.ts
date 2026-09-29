/**
 * lib/canvas/diagnostico-generate.ts
 *
 * Runner del canvas "Diagnóstico" (informe PARA EL CLIENTE). Self-contained, calcado de
 * `exploracion-generate.ts`: asegura el canvas, arma el input desde las fuentes, corre el agente
 * tipado y persiste 1 CARD por sección EN EL LUGAR.
 *
 * ── LAS FUENTES (2026-09-28, «el agente escucha») ────────────────────────────────
 * El diagnóstico se escribe DESPUÉS de las encuestas y de las sesiones de exploración, así que lee:
 *   1. Las REUNIONES de su «Contexto» (lib/contexto/material-del-documento.ts): arranca con toda
 *      reunión del proyecto con el cliente y el CSE saca o agrega. Lo que el panel dice que alimenta
 *      es exactamente lo que se lee. Antes no leía NINGUNA reunión.
 *   2. Las NOTAS que el CSE pegó en ese mismo Contexto.
 *   3. Las respuestas a la ENCUESTA previa (lib/cuestionario/contexto.ts).
 *   4. La FICHA del cliente CONFIRMADA, sin sus campos internos (`fichaParaPrompt` con
 *      `paraDocumentoDelCliente`): apertura a la asesoría, motivación y oportunidades no entran.
 *   5. El HANDOFF con allowlist RESTRICTIVA (cliente-safe), ahora con «Resultados que el cliente
 *      necesita alcanzar»: de ahí salen los objetivos.
 *   6. La EXPLORACIÓN completa (interna), con la regla dura de que lo «sin verificar» no se afirma.
 *   7. Los PROCESOS REALES del cliente (dolores marcados ⚠).
 *   8. El CRONOGRAMA, solo lectura: el punto de partida del proyecto (qué dura y qué entrega).
 *
 * ── LO QUE YA NO HACE ────────────────────────────────────────────────────────────
 * No ubica en la Escala (llega la 7.0), no describe cómo va a operar (Planificación) y no recomienda
 * (Ejecución). Al regenerar, OCULTA esas secciones de un diagnóstico viejo
 * (SECCIONES_RETIRADAS_DEL_DIAGNOSTICO) sin borrar sus datos — la Entrega lee de ahí la Escala —,
 * y antes guarda una versión del documento entero (lib/canvas/versiones.ts).
 *
 * Lo dispara el botón del header (CANVAS_PRIMARY_AGENT, async) vía POST /analyze.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { DIAGNOSTICO_CANVAS, diagnosticoSectionSequence } from "@/lib/canvas/canvas-defs";
import {
  createOnDemandCanvas,
  reconcileOnDemandCanvasSections,
} from "@/lib/canvas/default-canvases";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import {
  DIAGNOSTICO_TEMPLATE,
  SECCIONES_RETIRADAS_DEL_DIAGNOSTICO,
} from "@/components/landing/configs/diagnostico.defs";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { ordenarObjetivosDelDiagnostico } from "@/lib/canvas/diagnostico-hilo";
import { fuentesDelDiagnostico } from "@/lib/canvas/diagnostico-fuentes";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { patchSectionEntry } from "@/lib/business-cases/section-briefs";

/** Asegura el canvas "Diagnóstico" del proyecto + reconcilia sus secciones. Idempotente. */
export async function ensureDiagnosticoCanvas(projectId: string): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: canvasOfNested(DIAGNOSTICO_CANVAS.slug, { projectId }),
    select: { id: true },
  });
  const canvasId = existing?.id ?? (await createOnDemandCanvas(projectId, DIAGNOSTICO_CANVAS));
  await reconcileOnDemandCanvasSections(canvasId, DIAGNOSTICO_CANVAS, diagnosticoSectionSequence);
  return canvasId;
}

/**
 * Genera (o regenera) el informe de diagnóstico con IA. `agentRunId` se atribuye a los
 * bloques (trazabilidad). Devuelve canvasId + secciones escritas.
 */
export async function runDiagnosticoGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;
  const [canvasId, fuentes] = await Promise.all([
    opts.canvasId ?? ensureDiagnosticoCanvas(projectId),
    fuentesDelDiagnostico(projectId),
  ]);
  // Las MISMAS fuentes que lee «Mejorar el diagnóstico con IA» (lib/canvas/diagnostico-fuentes.ts).
  const userMessage = [
    fuentes,
    "",
    "Escribe el informe siguiendo tus instrucciones: el hilo completo con sus códigos (S, F, OBJ), sin escala de madurez, sin cómo va a operar y sin recomendaciones.",
  ].join("\n");

  // Carry-forward: sin la data previa, `coerceToSchema` descartaría lo curado fuera de
  // schema (portada del hero, marcas) al regenerar.
  const prevDataByKey: Record<string, unknown> = {};
  const prevSecs = await prisma.canvasSection.findMany({
    where: { canvasId },
    select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  for (const s of prevSecs) {
    const d = s.blocks[0]?.data;
    if (d && typeof d === "object") prevDataByKey[s.key] = d;
  }

  const generado = await generateSectionsForTemplate(DIAGNOSTICO_TEMPLATE, userMessage, undefined, undefined, prevDataByKey);
  // Los OBJ en orden (cuantitativos primero, seguidos) y sus menciones reescritas: no se le pide al
  // modelo, se ordena acá (lib/canvas/diagnostico-hilo.ts).
  const gen = { ...generado, sections: ordenarObjetivosDelDiagnostico(generado.sections) };

  // La foto ANTES de tocar nada (lib/canvas/versiones.ts): la IA ya respondió bien, y lo que había
  // queda consultable, se puede traer por sección o restaurar entero.
  await guardarVersionDelDocumento(canvasId, { origen: "Antes de regenerar" });

  // Persistir 1 CARD/sección EN EL LUGAR. Las solo-lectura y el `cierre` (agentGenerated:false)
  // no vienen en gen.sections → sus bloques quedan intactos hasta el retiro de abajo.
  const sectionMap = new Map(prevSecs.map((s) => [s.key, s.id]));
  let sectionCount = 0;
  for (const s of gen.sections) {
    const sectionId = sectionMap.get(s.key);
    if (!sectionId) continue;
    await prisma.$transaction([
      prisma.canvasBlock.deleteMany({ where: { sectionId } }),
      prisma.canvasBlock.create({
        data: {
          sectionId,
          blockType: "CARD",
          content: null,
          data: (s.data ?? {}) as Prisma.InputJsonValue,
          order: 0,
          source: "AGENT",
          status: "CONFIRMED",
          ...(opts.agentRunId ? { agentRunId: opts.agentRunId } : {}),
        },
      }),
    ]);
    sectionCount++;
  }

  /* El retiro: un diagnóstico regenerado con la estructura nueva no puede seguir MOSTRANDO la escala,
     las causas sueltas o las recomendaciones de la versión anterior — se contradicen con el hilo.
     ⛔ Pero se OCULTAN, no se borran (Elías, 2026-09-28): la Entrega lee de la sección `escala` el
     punto de partida del cliente, y borrarla lo dejaba sin él. Ocultas no salen al cliente ni al PDF,
     y sus datos siguen ahí. Solo si la generación escribió algo. */
  if (sectionCount > 0) {
    const retiradas = prevSecs
      .filter((s) => (SECCIONES_RETIRADAS_DEL_DIAGNOSTICO as readonly string[]).includes(s.key))
      .map((s) => s.key);
    if (retiradas.length) {
      const c = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } });
      let entradas: unknown = c?.sections;
      for (const key of retiradas) entradas = patchSectionEntry(entradas, key, { hidden: true });
      await prisma.projectCanvas.update({
        where: { id: canvasId },
        data: { sections: entradas as Prisma.InputJsonValue, contentUpdatedAt: new Date() },
      });
    }
  }
  return { canvasId, sectionCount };
}
