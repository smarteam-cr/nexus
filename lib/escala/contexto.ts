/**
 * lib/escala/contexto.ts — lo que cada documento le da a su agente sobre la Escala. SERVIDOR.
 *
 * Los generadores pasan por acá, y también `scripts/verificar-escala-agentes.ts`: la verificación
 * mira EXACTAMENTE el bloque que recibe cada agente, no una copia armada aparte que podría decir
 * otra cosa.
 *
 *   · Diagnóstico → el reglamento completo: ubica dimensión por dimensión.
 *   · Propuesta y Kickoff → el resumen para posicionar: hablan del nivel, no lo asignan. El Kickoff
 *     suma el estimado que dejó la propuesta del trato.
 *   · Entrega → no recibe Escala: su sección la escribe el runner con lo que midió el Diagnóstico.
 *
 * Todos preguntan primero `usaEscala(tags)`. Con el trato marcado «Sin Escala», el bloque dice eso
 * y nada más, y la sección de Escala de ese documento no se genera.
 */
import { prisma } from "@/lib/db/prisma";
import { loadKnowledgeByTags } from "@/lib/knowledge/load-by-tags";
import { usaEscala } from "@/lib/tags/catalog";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import {
  ETIQUETA_ESCALA_COMPLETA,
  ETIQUETA_ESCALA_RESUMEN,
  NIVELES_ESCALA,
  TOPE_ESCALA_COMPLETA,
  TOPE_ESCALA_RESUMEN,
} from "./fuente";
import { leerPosicion, posicionParaPrompt, type PosicionEnLaEscala } from "./posicion";

export interface BloqueDeEscala {
  /** El trato se trabaja con la Escala. */
  usa: boolean;
  /** El texto tal cual entra al mensaje del agente. */
  texto: string;
  /** Documentos de conocimiento que entraron. 0 con Escala = el agente trabaja con el respaldo. */
  documentos: number;
}

/** La sección de Escala de cada documento: la que no se genera con «Sin Escala». */
export const SECCION_DE_ESCALA = {
  propuesta: "posicion_escala",
  kickoff: "punto_de_partida",
  diagnostico: "escala",
  entrega: "escala",
} as const;

const NIVELES = NIVELES_ESCALA.map((n, i) => `${i + 1} ${n}`).join(" · ");

const BLOQUE_SIN_ESCALA: BloqueDeEscala = {
  usa: false,
  texto:
    "=== SIN ESCALA DE RENDIMIENTO ===\n" +
    "Este trato se trabaja SIN la Escala de Rendimiento (así se vendió). No ubiques niveles ni menciones la Escala en ninguna sección.",
  documentos: 0,
};

/** Diagnóstico: el reglamento completo, la vara con que ubica al cliente. */
export async function escalaParaElDiagnostico(tags: unknown): Promise<BloqueDeEscala> {
  if (!usaEscala(tags)) return BLOQUE_SIN_ESCALA;
  const escala = await loadKnowledgeByTags([ETIQUETA_ESCALA_COMPLETA], TOPE_ESCALA_COMPLETA);
  /* Se decide por `count`, NO por `text`. Cuando ningún documento entra en el presupuesto de
     contexto, `loadKnowledgeByTags` igual devuelve texto: la nota "(N documento(s) más no
     entraron…)". Preguntar por `text` la tomaba como escala válida y el respaldo no se usaba
     nunca — el agente puntuaba al cliente, en un informe que se le presenta, sin la vara. Es el
     mismo criterio que usa implementacion-generate.ts. */
  const cuerpo =
    escala.count > 0
      ? escala.text
      : `(El reglamento de la Escala no está publicado en la base de conocimiento. Usá los nombres canónicos —${NIVELES}—, ubicá por capa solo donde la evidencia alcance y dejá sin nivel el resto.)`;
  return {
    usa: true,
    texto: `=== ESCALA DE RENDIMIENTO 5.2 — TU VARA DE MEDICIÓN (el reglamento completo) ===\n${cuerpo}`,
    documentos: escala.count,
  };
}

/**
 * Propuesta y Kickoff: el resumen para posicionar. `antecedente` es lo que ya se dijo antes en el
 * trato (el estimado de la propuesta, para el Kickoff), y va rotulado como antecedente: el agente
 * lo retoma, no lo trata como una medición.
 */
export async function escalaParaPosicionar(
  tags: unknown,
  antecedente?: { titulo: string; posicion: PosicionEnLaEscala | null },
): Promise<BloqueDeEscala> {
  if (!usaEscala(tags)) return BLOQUE_SIN_ESCALA;
  const resumen = await loadKnowledgeByTags([ETIQUETA_ESCALA_RESUMEN], TOPE_ESCALA_RESUMEN);
  const partes = [
    "=== ESCALA DE RENDIMIENTO 5.2 — resumen para posicionar ===",
    resumen.count > 0
      ? resumen.text
      : `(El resumen de la Escala no está publicado. Usá solo los nombres de los niveles —${NIVELES}— y no estimes ninguna capa que las fuentes no respalden.)`,
  ];
  if (antecedente) {
    partes.push(
      "",
      `=== ${antecedente.titulo} ===`,
      antecedente.posicion
        ? posicionParaPrompt(antecedente.posicion)
        : "(No hay un estimado anterior en este trato: no lo inventes.)",
    );
  }
  return { usa: true, texto: partes.join("\n"), documentos: resumen.count };
}

/** Lo que midió el Diagnóstico del proyecto: el punto de partida que devuelve la Entrega. */
export async function posicionDelDiagnostico(projectId: string): Promise<PosicionEnLaEscala | null> {
  const bloque = await prisma.canvasBlock.findFirst({
    where: {
      blockType: "CARD",
      section: { key: SECCION_DE_ESCALA.diagnostico, canvas: canvasOfNested("diagnosis", { projectId }) },
    },
    orderBy: { order: "asc" },
    select: { data: true },
  });
  return leerPosicion(bloque?.data);
}

/**
 * El estimado que dejó la PROPUESTA del trato — el antecedente del Kickoff. La propuesta se une al
 * proyecto por el deal, igual que la propagación de etiquetas del handoff, y siempre dentro del
 * mismo cliente (`hubspotDealId` no es único en BusinessCase).
 */
export async function posicionDeLaPropuesta(projectId: string): Promise<PosicionEnLaEscala | null> {
  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true, hubspotDealId: true },
  });
  if (!proyecto?.hubspotDealId) return null;
  const bloque = await prisma.canvasBlock.findFirst({
    where: {
      blockType: "CARD",
      section: {
        key: SECCION_DE_ESCALA.propuesta,
        canvas: {
          isActive: true,
          businessCase: { hubspotDealId: proyecto.hubspotDealId, clientId: proyecto.clientId },
        },
      },
    },
    orderBy: { section: { canvas: { createdAt: "desc" } } },
    select: { data: true },
  });
  return leerPosicion(bloque?.data);
}
