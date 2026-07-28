/**
 * lib/business-cases/pdf-job-token.ts — CASCARÓN. El token vive en `lib/print/job-token.ts`.
 *
 * El mecanismo (un solo uso, 60s, para que Puppeteer entre a la página de impresión sin
 * cookies de sesión) nunca tuvo nada de específico de un caso de negocio, así que se
 * generalizó a (docType, docId) para servir a los ocho documentos del motor.
 *
 * Esto queda solo para no tocar a los dos llamadores del business case en el mismo commit
 * que la migración. Se borra en la fase de limpieza, cuando la ruta `/print/business-case`
 * pase a la genérica.
 */
import { createPrintJobToken, consumePrintJobToken } from "@/lib/print/job-token";

const DOC_TYPE = "business-case";

export function createPdfJobToken(
  businessCaseId: string,
  opts?: { canvasId?: string | null; createdByEmail?: string | null },
): Promise<string> {
  return createPrintJobToken(DOC_TYPE, businessCaseId, opts);
}

export function consumePdfJobToken(
  token: string,
  businessCaseId: string,
): Promise<{ ok: true; canvasId: string | null } | { ok: false }> {
  return consumePrintJobToken(token, DOC_TYPE, businessCaseId);
}
