/**
 * lib/timeline/fuentes-de-la-explicacion.ts — LAS FUENTES NUEVAS DE LA PROPUESTA, leídas de la base (L6, 2026-09-26).
 * SERVER-ONLY.
 *
 * Lo llama la ruta del paso 2 (app/api/clients/[id]/analyze/route.ts) a través de `extras.explicar` de la fusión
 * (borrador-del-detalle.ts), que lo corre con tope de 15 s antes de escribir la propuesta. Lo puro (qué es nuevo, el
 * mensaje, la validación) vive en explicacion-de-la-propuesta.ts. Acá:
 *   · la generación anterior (D8): la corrida de `ProjectTimeline.detailGeneratedByAgentRunId` (la última APLICADA),
 *     con lo que leyó (`fuentesDeLaGeneracion` en su salida) o, si es anterior a L6, sus reuniones y el
 *     `previousBrief` del `__doc` (aproximado);
 *   · las reuniones que leyó ESTA corrida y no la anterior, con su resumen (`resumenDeReunion`, ≤ 600);
 *   · las notas del cronograma cargadas desde la anterior;
 *   · el último handoff (D6: `whereCorridasDeDocumento`), solo si corrió después de la anterior.
 * Sin fuentes nuevas no se llama al modelo. ⛔ Nunca importa de `lib/google` (ni la raíz de `googleapis`).
 */
import { prisma } from "@/lib/db/prisma";
import { whereCorridasDeDocumento } from "@/lib/agents/historial-corridas";
import { DOC_BRIEF_KEY, parseSectionEntries } from "@/lib/business-cases/section-briefs";
import { resumenDeReunion } from "@/lib/contexto/material-cronograma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { canvasOf } from "@/lib/pieces/canvas-query";
import type { Cambio, Vivo } from "./borrador";
import {
  anteriorDeLaCorrida,
  cambiosParaExplicar,
  explicarLaPropuesta,
  fuentesNuevas,
  type AnteriorDeLaGeneracion,
  type ExplicacionSinSello,
  type FuenteNueva,
  type FuentesDeLaGeneracion,
} from "./explicacion-de-la-propuesta";
import { fasesDelHandoff, leerSalidaGuardada } from "./referencias-de-la-propuesta";

/** Las notas vivas del cronograma cargadas en (desde, hasta] (tolera que la tabla falte, como cargar.ts). */
async function notasEntre(projectId: string, desde: Date | null, hasta: Date) {
  if (!modeloDisponible(prisma.timelineSource)) return [];
  try {
    const notas = await prisma.timelineSource.findMany({
      where: { projectId, deletedAt: null, createdAt: { lte: hasta, ...(desde ? { gt: desde } : {}) } },
      orderBy: { createdAt: "asc" },
      select: { title: true, content: true, createdAt: true },
    });
    return notas.map((n) => ({ titulo: n.title, fecha: n.createdAt.toISOString(), texto: n.content }));
  } catch (e) {
    if (esquemaDesactualizado(e)) return [];
    throw e;
  }
}

/**
 * Las reuniones (de las que leyó esta corrida) que la anterior no leyó, con su resumen. Le hablan a un MODELO: cortan
 * por fecha otra vez (censo de lib/sessions/ocurridas.test.ts), aunque el paso 2 ya leyó solo las que ocurrieron.
 */
async function reunionesNuevas(leidas: FuentesDeLaGeneracion, anterior: AnteriorDeLaGeneracion | null) {
  const previas = new Set(anterior?.sesiones ?? []);
  const ids = leidas.sesiones.filter((id) => !previas.has(id));
  if (ids.length === 0) return [];
  const filas = await prisma.firefliesSession.findMany({
    where: { id: { in: ids }, date: { lte: new Date(leidas.en) } },
    orderBy: { date: "asc" },
    select: {
      id: true,
      title: true,
      date: true,
      summary: true,
      minute: { select: { summary: true, decisions: true, agreements: true, risks: true, status: true } },
    },
  });
  return filas.map((f) => ({
    id: f.id,
    titulo: f.title,
    fecha: f.date.toISOString(),
    texto: resumenDeReunion({ title: f.title, summary: f.summary, minuta: f.minute }).texto,
  }));
}

/** El último handoff, si corrió después de la anterior: sus fases y semanas, en texto. */
async function handoffNuevo(projectId: string, desde: Date | null, hasta: Date) {
  const corrida = await prisma.agentRun.findFirst({
    where: { ...whereCorridasDeDocumento(projectId, "handoff"), status: "DONE", createdAt: { lte: hasta, ...(desde ? { gt: desde } : {}) } },
    orderBy: { createdAt: "desc" },
    select: { output: true, createdAt: true },
  });
  if (!corrida) return null;
  const fases = fasesDelHandoff(leerSalidaGuardada(corrida.output));
  if (fases.length === 0) return null;
  return {
    fecha: corrida.createdAt.toISOString(),
    texto: `Fases del handoff: ${fases.map((f) => `${f.name} (${f.durationWeeks} semanas)`).join("; ")}`,
  };
}

/**
 * La lista cerrada de fuentes nuevas de ESTA corrida (`leidas`: lo que leyó al armar su mensaje, no «lo de ahora»), y
 * la fecha de la generación anterior (null = primera generación).
 */
export async function cargarFuentesNuevas(i: {
  projectId: string;
  timelineId: string;
  corrida: string;
  leidas: FuentesDeLaGeneracion;
}): Promise<{ fuentes: FuenteNueva[]; desde: string | null }> {
  const [tl, canvas] = await Promise.all([
    prisma.projectTimeline.findUnique({ where: { id: i.timelineId }, select: { detailGeneratedByAgentRunId: true } }),
    prisma.projectCanvas.findFirst({ where: { projectId: i.projectId, ...canvasOf("timeline") }, select: { sections: true } }),
  ]);
  const idAnterior = tl?.detailGeneratedByAgentRunId ?? null;
  const corridaAnterior =
    idAnterior && idAnterior !== i.corrida
      ? await prisma.agentRun.findUnique({ where: { id: idAnterior }, select: { output: true, sourceSessionIds: true, createdAt: true } })
      : null;
  const doc = parseSectionEntries(canvas?.sections).find((e) => e.key === DOC_BRIEF_KEY);
  const anterior = anteriorDeLaCorrida(corridaAnterior, typeof doc?.previousBrief === "string" ? doc.previousBrief : null);
  const desde = anterior ? new Date(anterior.en) : null;
  const hasta = new Date(i.leidas.en);
  const [reuniones, notas, handoff] = await Promise.all([
    reunionesNuevas(i.leidas, anterior),
    notasEntre(i.projectId, desde, hasta),
    handoffNuevo(i.projectId, desde, hasta),
  ]);
  return { fuentes: fuentesNuevas({ leidas: i.leidas, anterior, reuniones, notas, handoff }), desde: anterior?.en ?? null };
}

/**
 * ⭐ `extras.explicar` de la fusión: las fases que cambian, las fuentes nuevas y, solo si hay de las dos, UNA llamada
 * (`llamar`, que la ruta arma con Haiku, medida y con su tope). Deja en el log qué quedó (sin el texto: los motivos de
 * lo descartado, cuántas fases con frase y cuántas sin material, y cuánto tardó), para la medición de Elías.
 */
export async function explicarConLasFuentesNuevas(i: {
  projectId: string;
  timelineId: string;
  corrida: string;
  leidas: FuentesDeLaGeneracion;
  vivo: Vivo;
  cambios: readonly Cambio[];
  llamar: (sistema: string, mensaje: string) => Promise<string>;
}): Promise<ExplicacionSinSello> {
  const t0 = Date.now();
  const cambios = cambiosParaExplicar(i.vivo, i.cambios);
  if (cambios.length === 0) return { general: null, fases: [], sinMaterial: [], desde: null };
  const { fuentes, desde } = await cargarFuentesNuevas(i);
  let descartes: string[] = [];
  const e = await explicarLaPropuesta({ fuentes, cambios, desde, llamar: i.llamar, alDescartar: (d) => (descartes = d) });
  console.info("[explicacion-de-la-propuesta]", {
    corrida: i.corrida,
    fuentes: fuentes.map((f) => f.id),
    conFrase: e.fases.length,
    general: e.general !== null,
    sinMaterial: e.sinMaterial.length,
    descartes,
    ms: Date.now() - t0,
  });
  return e;
}
