/**
 * lib/artefactos/generar-server.ts — GENERAR UNA COPIA con IA, por id (etapa V3 de docs/artefactos-plan.md). SERVIDOR.
 *
 * El documento de siempre de cada tipo sigue con su runner (lib/canvas/*-generate.ts, por /analyze), que lo busca por
 * `slug`: no sabe escribir en otro. Una copia (y los tipos nuevos, que solo tienen copias) se genera acá, con lo mismo
 * que lee un documento de su tipo:
 *   · el handoff, con la allowlist del tipo (lo que el cliente puede leer);
 *   · el «Contexto adicional» de su tipo (las reuniones elegidas y las notas, por el chokepoint; son POR TIPO hasta V3b)
 *     y las instrucciones de ESTA copia (su `__doc.brief`), no las del documento de siempre;
 *   · la memoria de la cuenta y del proyecto;
 *   · los documentos de los tipos que lo alimentan (el diagnóstico para la planificación…), con todas sus copias
 *     (`loadCanvasContext`);
 *   · el template de su plantilla, recortado a las secciones que la copia tiene.
 * Escribe un bloque CARD por sección en el lugar (como el requerimiento técnico), con la foto de antes
 * (`guardarVersionDelDocumento`). Lo curado (el cierre) no se toca: el agente no lo escribe.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { bloqueDeInstruccionesDeDoc, docBriefFrom } from "@/lib/business-cases/section-briefs";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { loadCanvasContext, loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";
import { bloqueDeInstruccionesDelPedido, plantillaDelDocumento } from "@/lib/entregables/registro";
import { memoriaDelDocumento, type LectorDeMemoria } from "@/lib/memoria";
import { relacionToDiagram, specToDiagram } from "@/lib/flowchart/spec-to-diagram";
import { tipoDeArtefacto, plantillaDelTipo, type TipoDeArtefacto } from "./tipos";
import { tipoDelDocumento } from "./copias";
import { handoffKeysDelTipo, templateDelTipo } from "./catalogo";
import { ErrorDelArtefacto } from "./copias-server";
import { mensajeDeLaCopia, TIPOS_QUE_LO_ALIMENTAN, TOPE_DE_CADA_FUENTE } from "./mensaje";

/**
 * El lector de la memoria de cada tipo (lib/memoria/consumidores.ts): el mismo que el documento de siempre de ese tipo,
 * así una copia de un documento que lee el cliente recibe la memoria recortada como él. Escrito como `{ lector: "…" }` a
 * propósito: lib/memoria/consumidores.test.ts busca esa forma en cada archivo declarado.
 */
const LECTOR: Record<NonNullable<TipoDeArtefacto["contextoDe"]>, { lector: LectorDeMemoria }> = {
  diagnosis: { lector: "diagnosis" },
  planning: { lector: "planning" },
  kickoff: { lector: "kickoff" },
  exploration: { lector: "exploracion-del-proyecto" },
  "tech-requirements": { lector: "tech-requirements" },
  delivery: { lector: "delivery" },
};

/** La copia que se va a generar, o el motivo por el que no se puede. */
export async function copiaParaGenerar(projectId: string, canvasId: string) {
  const c = await prisma.projectCanvas.findFirst({
    where: { id: canvasId, projectId, disabledAt: null },
    select: {
      id: true,
      slug: true,
      tipoArtefacto: true,
      name: true,
      sections: true,
      canvasSections: { select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, select: { data: true, source: true }, take: 1 } } },
    },
  });
  if (!c) throw new ErrorDelArtefacto(404, "Ese documento no es de este proyecto.");
  // El documento de siempre se genera con su runner (por /analyze): acá solo las copias.
  if (c.slug || !c.tipoArtefacto) throw new ErrorDelArtefacto(400, "Ese documento se genera con su botón de siempre.");
  const tipo = tipoDeArtefacto(tipoDelDocumento(c));
  if (!tipo) throw new ErrorDelArtefacto(400, "Ese documento no es de un tipo que se genere.");
  const yaTieneDeLaIa = c.canvasSections.some((s) => s.blocks[0]?.source === "AGENT");
  return { canvas: c, tipo, yaTieneDeLaIa };
}

export async function generarCopia(o: {
  projectId: string;
  canvasId: string;
  agentRunId: string | null;
  /** Lo que pidió quien genera, para esta corrida. */
  instrucciones?: string | null;
  alFase?: (fase: string) => void;
}): Promise<{ sectionCount: number }> {
  const { canvas, tipo } = await copiaParaGenerar(o.projectId, o.canvasId);
  const guardada = plantillaDelDocumento(tipo.id, canvas.sections);
  const plantilla = (guardada?.guardada ? guardada.plantilla : null) ?? plantillaDelTipo(tipo.id);
  const base = templateDelTipo(tipo.id, plantilla?.id ?? null);
  const keysDeLaCopia = new Set(canvas.canvasSections.map((s) => s.key));
  // El template, recortado a lo que la copia tiene: no se paga por escribir secciones que no se van a guardar.
  const template = { ...base, sections: base.sections.filter((s) => keysDeLaCopia.has(s.key)) };

  o.alFase?.(`Leyendo el contexto de ${tipo.conArticulo}…`);
  const doc = tipo.contextoDe ? documentoConContexto(tipo.contextoDe) : null;
  const proyecto = await prisma.project.findUnique({
    where: { id: o.projectId },
    select: { clientId: true, tags: true, client: { select: { name: true, company: true, industry: true } } },
  });
  const [handoff, material, alimentan] = await Promise.all([
    loadHandoffContext(o.projectId, { onlyConfirmed: false, includeKeys: handoffKeysDelTipo(tipo.id) }),
    doc ? cargarMaterialDelDocumento(o.projectId, doc) : Promise.resolve(null),
    Promise.all(
      (TIPOS_QUE_LO_ALIMENTAN[tipo.id] ?? []).map(async (t) => ({
        tipo: t,
        texto: (await loadCanvasContext(o.projectId, t, { onlyConfirmed: false, soloVisibles: true }).catch(() => "")).slice(0, TOPE_DE_CADA_FUENTE),
      })),
    ),
  ]);
  const memoria = tipo.contextoDe
    ? await memoriaDelDocumento(o.projectId, { ...LECTOR[tipo.contextoDe], clientId: proyecto?.clientId ?? null, yaLeidas: material?.sesionesUsadas ?? [] })
    : null;

  const mensaje = mensajeDeLaCopia({
    pedido: bloqueDeInstruccionesDelPedido(o.instrucciones),
    // Las instrucciones de ESTA copia: las del documento de siempre son de otro documento.
    instruccionesDeLaCopia: bloqueDeInstruccionesDeDoc(docBriefFrom(canvas.sections)),
    tipo,
    nombreDeLaCopia: canvas.name,
    empresa: proyecto?.client?.name ?? proyecto?.client?.company ?? "el cliente",
    industria: proyecto?.client?.industry ?? null,
    handoff,
    reuniones: material?.reuniones ?? "",
    avisoSinReuniones: material?.avisoSinReuniones ?? "",
    notas: material?.notas ?? "",
    memoria: memoria?.texto ?? "",
    alimentan,
    cierreDeFrontera: material?.cierreDeFrontera ?? "",
  });

  // Carry-forward, como los runners de siempre: sin la data previa, `coerceToSchema` borraría lo que está fuera del schema.
  const prevDataByKey: Record<string, unknown> = {};
  for (const s of canvas.canvasSections) {
    const d = s.blocks[0]?.data;
    if (d && typeof d === "object") prevDataByKey[s.key] = d;
  }

  o.alFase?.(`Escribiendo ${tipo.conArticulo}…`);
  const gen = await generateSectionsForTemplate(template, mensaje, undefined, undefined, prevDataByKey);

  await guardarVersionDelDocumento(o.canvasId, { origen: "Antes de regenerar" });

  const idPorKey = new Map(canvas.canvasSections.map((s) => [s.key, s.id]));
  let sectionCount = 0;
  for (const s of gen.sections) {
    const sectionId = idPorKey.get(s.key);
    if (!sectionId) continue;
    // Los diagramas no los dibuja la IA: salen de la spec, como en el requerimiento técnico.
    if (s.key === "arquitectura" || s.key === "relacion_objetos") {
      const { diagram } = s.key === "arquitectura" ? specToDiagram(s.data) : relacionToDiagram(s.data);
      (s.data as Record<string, unknown>).diagram = diagram;
    }
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
          ...(o.agentRunId ? { agentRunId: o.agentRunId } : {}),
        },
      }),
    ]);
    sectionCount++;
  }
  if (sectionCount > 0) await prisma.projectCanvas.update({ where: { id: o.canvasId }, data: { contentUpdatedAt: new Date() } }).catch(() => {});
  return { sectionCount };
}
