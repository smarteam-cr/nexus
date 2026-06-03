/**
 * lib/documents/extract-text.ts
 *
 * Extracción de texto plano de archivos por mimeType. Helper compartido entre:
 *   - app/api/projects/[projectId]/documents/upload  (archivos subidos)
 *   - lib/google/drive-files.ts                       (binarios que viven en Drive)
 *
 * Formatos soportados:
 *   - PDF            → pdf-parse
 *   - TXT / CSV      → TextDecoder nativo
 *   - DOCX/XLSX/PPTX → officeparser (una sola dependencia para los 3)
 *   - cualquier otro → null
 *
 * Patrón "falla silenciosa": si la extracción falla (PDF escaneado, archivo
 * corrupto, formato no soportado), devuelve null en vez de lanzar — el caller
 * guarda el documento sin `content`.
 */

export const MAX_EXTRACTED_CHARS = 50_000;

// MimeTypes de Office (OOXML) soportados por officeparser.
const OFFICE_MIME_TYPES = new Set([
  // Word
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  // Excel
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls (officeparser lo intenta; si falla → null)
  // PowerPoint
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.ms-powerpoint", // .ppt
  // OpenDocument (officeparser también los soporta)
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
]);

/**
 * Extrae texto de un buffer según su mimeType. Devuelve el texto (truncado a
 * MAX_EXTRACTED_CHARS) o null si el formato no se soporta o la extracción falla.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  try {
    // Plain text / CSV
    if (mimeType === "text/plain" || mimeType === "text/csv") {
      const text = new TextDecoder().decode(buffer).trim();
      return text ? text.slice(0, MAX_EXTRACTED_CHARS) : null;
    }

    // PDF — pdf-parse.
    // La librería expone la función como `default` en CJS, pero el .d.ts ESM
    // generado no lo refleja → cast en el límite de la librería externa
    // (permitido por ARCHITECTURE.md §9 para APIs externas tipadas como unknown).
    if (mimeType === "application/pdf") {
      const pdfParse = (await import("pdf-parse") as unknown as {
        default: (b: Buffer, o?: { max?: number }) => Promise<{ text?: string }>;
      }).default;
      const result = await pdfParse(buffer, { max: 100 }); // max 100 pages
      const text = result.text?.trim();
      if (!text || text.length < 10) return null; // Probablemente PDF escaneado
      return text.slice(0, MAX_EXTRACTED_CHARS);
    }

    // DOCX / XLSX / PPTX / ODT / ODS / ODP — officeparser (v7: OfficeParser.parseOffice)
    if (OFFICE_MIME_TYPES.has(mimeType)) {
      const { OfficeParser } = await import("officeparser");
      const ast = await OfficeParser.parseOffice(buffer);
      const text = ast.toText()?.trim();
      if (!text || text.length < 10) return null;
      return text.slice(0, MAX_EXTRACTED_CHARS);
    }

    return null;
  } catch {
    // Extracción falló silenciosamente (corrupto, escaneado, formato raro).
    return null;
  }
}
