/**
 * lib/clients/documentos-de-la-empresa.ts — de qué empresa es un documento (R3, 2026-10-25). PURO.
 *
 * Un documento (`ProjectCanvas`) puede ser de un proyecto, de una propuesta comercial o, desde el 25 oct, de la EMPRESA
 * sin ninguno de los dos (un diagnóstico para un prospecto, el documento de resultados de la preventa). La empresa es
 * siempre la dueña: la del proyecto, la de la propuesta o la del documento. Una sola regla para saberlo, en vez de que
 * cada lector mire `project.clientId` y se olvide de los otros dos caminos. La base impide las dos cosas a la vez
 * (CHECK `ProjectCanvas_un_solo_dueno`) e INV51 vigila que ninguno quede sin dueño. Decisión: DECISIONS › «La empresa,
 * parte 2».
 */

export interface DuenoDelDocumento {
  clientId: string | null;
  project: { clientId: string } | null;
  businessCase: { clientId: string } | null;
}

export type DeQuienEsElDocumento = { clientId: string; via: "empresa" | "proyecto" | "propuesta" } | null;

/** La empresa dueña de un documento, y por qué camino. null = sin dueño (INV51 lo marca). */
export function empresaDelDocumento(d: DuenoDelDocumento): DeQuienEsElDocumento {
  if (d.clientId) return { clientId: d.clientId, via: "empresa" };
  if (d.project) return { clientId: d.project.clientId, via: "proyecto" };
  if (d.businessCase) return { clientId: d.businessCase.clientId, via: "propuesta" };
  return null;
}

/** El `select` que necesita `empresaDelDocumento`. */
export const SELECT_DEL_DUENO = { clientId: true, project: { select: { clientId: true } }, businessCase: { select: { clientId: true } } } as const;
