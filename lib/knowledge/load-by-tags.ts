/**
 * lib/knowledge/load-by-tags.ts — conocimiento RELEVANTE para un agente, por tags.
 *
 * El retrieval viejo de /analyze junta "los 15 documentos editados más recientemente" —
 * sin ninguna relación con el proyecto — y encima el bloque entero se corta a 4.000
 * caracteres al inyectarse, así que un solo documento grande fijado se come el espacio y
 * borra el resto. Los runners nuevos (Diagnóstico, Planificación, Implementación) cargan
 * por acá: documentos PUBLICADOS cuyo tag coincide, contenido completo hasta el tope.
 *
 * DRAFT nunca entra (es la semántica declarada del estado: "no visible para agentes") —
 * y es lo que permite sembrar borradores sin que un agente los tome por verdad.
 */
import { prisma } from "@/lib/db/prisma";

export interface KnowledgeBlock {
  title: string;
  content: string;
}

/**
 * Documentos publicados que matchean alguno de los `tagValues` (valores de KnowledgeTag,
 * p.ej. "breeze_agents", "sales_hub"). `cap` limita el TOTAL de caracteres; los
 * documentos se incluyen enteros en orden de actualización hasta agotarlo — un documento
 * truncado a la mitad confunde más de lo que aporta, así que el que no entra completo se
 * omite y se anota.
 */
export async function loadKnowledgeByTags(
  tagValues: string[],
  cap = 15000,
): Promise<{ text: string; count: number }> {
  if (!tagValues.length) return { text: "", count: 0 };

  const docs = await prisma.knowledgeDocument.findMany({
    where: {
      status: "PUBLISHED",
      tags: { some: { value: { in: tagValues } } },
    },
    orderBy: { updatedAt: "desc" },
    select: { title: true, content: true },
  });
  if (!docs.length) return { text: "", count: 0 };

  const bloques: string[] = [];
  let usado = 0;
  let omitidos = 0;
  for (const d of docs) {
    const bloque = `## ${d.title}\n${d.content.trim()}`;
    if (usado + bloque.length > cap) {
      omitidos++;
      continue;
    }
    bloques.push(bloque);
    usado += bloque.length;
  }
  if (omitidos > 0) {
    bloques.push(`(${omitidos} documento(s) más no entraron en el presupuesto de contexto.)`);
  }
  return { text: bloques.join("\n\n"), count: docs.length - omitidos };
}
