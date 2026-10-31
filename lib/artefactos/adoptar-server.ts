/**
 * lib/artefactos/adoptar-server.ts — EL PRIMERO DE UN TIPO ES SU DOCUMENTO DE SIEMPRE (Elías, 30 oct). SERVIDOR.
 *
 * Desde que la lista arranca solo con el cronograma y el kickoff, todo lo demás se crea en «Nuevo artefacto». Si eso creara
 * siempre una copia, el documento de siempre seguiría vacío y los lugares que lo buscan por `slug` (el «Qué sigue», los
 * botones de generar, lo que lee los agentes de su pieza) no verían lo que el equipo escribió. Por eso, con una plantilla de
 * siempre y sin nada escrito, «crear» es tomar ese documento: lo activa si hace falta, le aplica la plantilla y le pone el
 * nombre. El nombre es también lo que lo deja en la lista (lib/flow/reparto-del-riel.ts). null = no hay nada que tomar: va
 * una copia, como siempre.
 *
 * ⛔ Nunca toma un documento con algo escrito (también a mano, en una sección sembrada), publicado, con nombre propio o
 * apagado: ahí la copia es lo correcto. Aplicar la plantilla recorta secciones.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { entregableDe } from "@/lib/entregables/registro";
import { empezarEnBlanco, ErrorDelEntregable, selectorDelKickoff } from "@/lib/entregables/generar-server";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { ensurePieceCanvas, PieceNotActivatableError } from "@/lib/pieces/ensure-canvas";
import { exploracionVivaDelDocumento } from "@/lib/exploraciones/del-proyecto";
import { loadCanvasesConContenido, loadCanvasesTocados } from "@/lib/pieces/piece-content";
import { pieceBySlug } from "@/lib/pieces/registry";
import { ErrorDelArtefacto, type CopiaCreada } from "./copias-server";
import { tituloLimpio } from "./copias";
import { admiteCopias, plantillaDelTipo, plantillasDelTipo, tipoDeArtefacto } from "./tipos";

/** Las plantillas con que se arma el documento de siempre de un tipo. Las demás son solo de las copias. */
function plantillasDeSiempre(tipo: string): readonly string[] {
  return (entregableDe(tipo)?.plantillas ?? plantillasDelTipo(tipo).slice(0, 1)).map((p) => p.id);
}

export async function adoptarElDeSiempre(o: {
  projectId: string;
  tipo: string;
  plantillaId?: string | null;
  nombre?: string | null;
  porEmail: string | null;
}): Promise<CopiaCreada | null> {
  const t = tipoDeArtefacto(o.tipo);
  const pieza = t?.pieza ? pieceBySlug(t.pieza) : null;
  if (!t || !pieza || pieza.hasCanvas === false || !admiteCopias(o.tipo)) return null;
  const plantillaId = o.plantillaId ?? plantillaDelTipo(o.tipo)?.id ?? null;
  const deSiempre = plantillasDeSiempre(o.tipo);
  if (plantillaId && deSiempre.length && !deSiempre.includes(plantillaId)) return null;

  const actual = await prisma.projectCanvas.findFirst({
    where: { projectId: o.projectId, ...canvasOf(o.tipo) },
    select: { id: true, slug: true, titulo: true, disabledAt: true, sections: true },
  });
  if (actual?.disabledAt || actual?.titulo?.trim()) return null;
  // La exploración se escribe en su lienzo: con el lienzo abierto, el documento de siempre ya está tomado aunque el canvas esté vacío.
  if (o.tipo === "exploration" && (await exploracionVivaDelDocumento(o.projectId, null))) return null;
  if (actual) {
    const fila = { id: actual.id, slug: actual.slug, tipoArtefacto: null, sections: actual.sections };
    if ((await loadCanvasesConContenido(o.projectId, [fila])).has(actual.id) || (await loadCanvasesTocados([fila])).has(actual.id)) return null;
    if (o.tipo === "kickoff" && !(await selectorDelKickoff(o.projectId)).sinTocar) return null;
  }

  let canvasId: string;
  try {
    ({ canvasId } = await ensurePieceCanvas(o.projectId, o.tipo));
    // Solo los que tienen más de una forma de armarse pasan por acá; los demás nacen con su canon.
    if (plantillaId && ["diagnosis", "planning", "kickoff"].includes(o.tipo)) {
      ({ canvasId } = await empezarEnBlanco({ projectId: o.projectId, slug: o.tipo, plantillaId, porEmail: o.porEmail }));
    }
  } catch (e) {
    if (e instanceof PieceNotActivatableError) return null;
    if (e instanceof ErrorDelEntregable) throw new ErrorDelArtefacto(e.status === 404 ? 404 : e.status === 409 ? 409 : 400, e.message);
    throw e;
  }
  const nombre = tituloLimpio(o.nombre ?? "") || t.nombre;
  await prisma.projectCanvas.update({ where: { id: canvasId }, data: { titulo: nombre } });
  return { canvasId, nombre };
}
