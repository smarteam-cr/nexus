/**
 * lib/business-cases/resolve-template.ts
 *
 * Resolución CANÓNICA del tipo/template de un Business Case:
 *   columna `caseType` → entry `__meta` del Json del canvas v0 → default (hubspot).
 *
 * El fallback `__meta` existe por el setup dual-PC: si un `db push` ajeno dropea la
 * columna y luego se re-crea (null para todas las filas), el tipo se recupera del
 * Json del v0 — y se re-escribe la columna (write-back de auto-reparación).
 *
 * El templateId prefiere el de `__meta` (refleja la estructura REAL con la que se
 * sembró el v0 — briefs y secciones viven por sus keys) sobre el derivado del tipo.
 */
import { prisma } from "@/lib/db/prisma";
import { resolveBcType, type BcTypeDef } from "./case-types";
import { templateMetaFrom } from "./template-meta";

export interface ResolvedCaseType {
  typeDef: BcTypeDef;
  caseType: string | null;
  caseSubtype: string | null;
  templateId: string;
}

export function resolveCaseTypeFor(
  bc: { id: string; caseType?: string | null; caseSubtype?: string | null },
  v0Sections?: unknown,
): ResolvedCaseType {
  let caseType = bc.caseType ?? null;
  let caseSubtype = bc.caseSubtype ?? null;

  const meta = v0Sections != null ? templateMetaFrom(v0Sections) : null;

  if (!caseType && meta?.caseType) {
    caseType = meta.caseType;
    caseSubtype = caseSubtype ?? meta.caseSubtype ?? null;
    // Write-back best-effort (columna null + __meta con valor = columna re-creada
    // tras un drop dual-PC). Fire-and-forget: la resolución no depende de esto.
    prisma.businessCase
      .update({ where: { id: bc.id }, data: { caseType, caseSubtype } })
      .catch(() => {});
  }

  const typeDef = resolveBcType(caseType);
  return {
    typeDef,
    caseType,
    caseSubtype,
    templateId: meta?.templateId ?? typeDef.templateId,
  };
}
