/**
 * lib/servicios/cierre-server.ts — CERRAR el ciclo abierto de un proyecto recurrente (docs/smartloop-plan.md, etapa 4;
 * ficha E). Servidor.
 *
 * Cerrar es el final de la sesión de aprendizaje. Pide lo que pide la regla de cierre (lib/servicios/cierre.ts ›
 * faltaParaCerrar) y hace, en este orden:
 *  1. CONGELA los documentos del ciclo: una foto protegida (VersionDeDocumento) de cada uno que tenga contenido. Las
 *     protegidas no se borran nunca; el siguiente ciclo sigue escribiendo en los mismos documentos.
 *  2. En una transacción, releyendo el ciclo: aplica la decisión de cada caso de uso (lo que «pasa» vuelve al plan del
 *     proyecto con la marca, y entra solo al ciclo que se abra), guarda el cierre (los casos, la meta evaluada, la
 *     propuesta del siguiente ciclo, las fotos y la foto del cronograma del ciclo) y deja el ciclo cerrado.
 *
 * Después de cerrar no hay ciclo abierto: el proyecto vuelve a Diagnóstico, y el ciclo siguiente se abre solo al
 * cambiar algo (ciclos-server.ts › actualizarCiclo) o con «Abrir el ciclo N».
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { pieceBySlug, slugForCanvas } from "@/lib/pieces/registry";
import { fotoParaAprobar } from "@/lib/timeline/ciclo";
import { PIEZAS_DEL_CICLO } from "./ciclo";
import { armarCierre, estadoTrasLaDecision, esDecisionAlCerrar, faltaParaCerrar, type DocumentoCongelado } from "./cierre";
import { ErrorDelCiclo } from "./ciclos-server";
import { cargarCronogramaDelCiclo } from "./cronograma-del-ciclo-server";

/** Los documentos del ciclo que viven en un canvas (los propios del ciclo y los Cuestionarios no). */
export const DOCUMENTOS_QUE_SE_CONGELAN: readonly string[] = PIEZAS_DEL_CICLO.filter((s) => pieceBySlug(s)?.hasCanvas === true);

async function documentosDelProyecto(projectId: string) {
  const canvases = await prisma.projectCanvas.findMany({
    where: { projectId },
    select: { id: true, name: true, slug: true, businessCaseId: true },
  });
  return canvases
    .map((c) => ({ ...c, slugDePieza: c.slug ?? slugForCanvas(c) }))
    .filter((c): c is typeof c & { slugDePieza: string } => !!c.slugDePieza && DOCUMENTOS_QUE_SE_CONGELAN.includes(c.slugDePieza));
}

export async function cerrarCiclo(projectId: string, por: string, ahora = new Date()): Promise<{ numero: number; congelados: number }> {
  const c = await prisma.cicloDeProyecto.findFirst({
    where: { projectId, estado: "abierto" },
    select: {
      id: true, numero: true, meta: true, metaResultado: true, metaEvaluada: true, siguienteCiclo: true,
      casosDeUso: {
        where: { estado: { not: "descartado" } },
        orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
        select: { id: true, titulo: true, criterio: true, criterioMedido: true, decisionAlCerrar: true },
      },
    },
  });
  if (!c) throw new ErrorDelCiclo("No hay un ciclo abierto para cerrar.", 409);
  const falta = faltaParaCerrar({ ...c, casos: c.casosDeUso });
  if (falta.length) throw new ErrorDelCiclo(`Todavía no se puede cerrar: ${falta[0]}`, 409);

  // 1. Congelar los documentos (fuera de la transacción: la foto nunca tumba nada, y se guarda antes de cerrar).
  const documentos: DocumentoCongelado[] = [];
  for (const d of await documentosDelProyecto(projectId)) {
    const foto = await guardarVersionDelDocumento(d.id, { origen: `Al cerrar el ciclo ${c.numero}`, creadaPor: por, protegida: true });
    documentos.push({ slug: d.slugDePieza, nombre: pieceBySlug(d.slugDePieza)?.label ?? d.name, canvasId: d.id, versionId: foto.id ?? null });
  }
  const cronograma = await cargarCronogramaDelCiclo(projectId, ahora).catch(() => null);

  // 2. Cerrar, releyendo: si otra pestaña lo cerró o cambió una decisión, se vuelve a validar sobre lo de ahora.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CicloDeProyecto" WHERE "id" = ${c.id} FOR UPDATE`;
    const ahoraCiclo = await tx.cicloDeProyecto.findUnique({
      where: { id: c.id },
      select: {
        estado: true, meta: true, metaResultado: true, metaEvaluada: true, siguienteCiclo: true,
        casosDeUso: {
          where: { estado: { not: "descartado" } },
          orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
          select: { id: true, titulo: true, criterio: true, criterioMedido: true, decisionAlCerrar: true },
        },
      },
    });
    if (!ahoraCiclo || ahoraCiclo.estado !== "abierto") throw new ErrorDelCiclo("El ciclo ya se cerró.", 409);
    const borrador = { ...ahoraCiclo, casos: ahoraCiclo.casosDeUso };
    const faltaAhora = faltaParaCerrar(borrador);
    if (faltaAhora.length) throw new ErrorDelCiclo(`Todavía no se puede cerrar: ${faltaAhora[0]}`, 409);
    for (const caso of ahoraCiclo.casosDeUso) {
      if (!esDecisionAlCerrar(caso.decisionAlCerrar)) continue;
      const { estado, alPlan } = estadoTrasLaDecision(caso.decisionAlCerrar);
      await tx.casoDeUso.update({
        where: { id: caso.id },
        // «pasa» vuelve al plan del proyecto con la marca: ciclos-server.ts › abrirCiclo lo suma al ciclo nuevo.
        data: alPlan ? { estado, cicloId: null, faseId: null } : { estado },
      });
    }
    const cierre = armarCierre(borrador, documentos, "aprendizaje", cronograma ? fotoParaAprobar(cronograma.cronograma) : null);
    await tx.cicloDeProyecto.update({
      where: { id: c.id },
      data: { estado: "cerrado", etapa: "aprendizaje", cerradoAt: ahora, cerradoPor: por, cierre: cierre as unknown as Prisma.InputJsonValue },
    });
  });
  return { numero: c.numero, congelados: documentos.filter((d) => d.versionId).length };
}
