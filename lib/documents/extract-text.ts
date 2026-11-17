/**
 * lib/documents/extract-text.ts
 *
 * Extracción de texto plano de archivos por mimeType. Helper compartido entre:
 *   - app/api/projects/[projectId]/documents/upload  (archivos subidos)
 *   - lib/google/drive-files.ts                       (binarios que viven en Drive)
 *
 * Formatos soportados:
 *   - PDF            → pdf-parse v2 (`PDFParse`; la v1 exportaba `default`, ver textoDePdf)
 *   - TXT / CSV      → TextDecoder nativo
 *   - DOCX/XLSX/PPTX → officeparser (una sola dependencia para los 3)
 *   - cualquier otro → null
 *
 * Patrón "falla silenciosa": si la extracción falla (PDF escaneado, archivo
 * corrupto, formato no soportado), devuelve null en vez de lanzar — el caller
 * guarda el documento sin `content`.
 */

export const MAX_EXTRACTED_CHARS = 50_000;

/** Páginas de PDF que se leen cuando quien llama no pide más que MAX_EXTRACTED_CHARS. */
export const MAX_PDF_PAGES = 100;

/**
 * Techo de páginas cuando quien llama pide más texto (la preventa: una transcripción de varias horas son
 * unas 100 a 300 páginas). pdf.js corre en el MISMO hilo que el servidor: un PDF de 20.000 páginas lo
 * congela más de un minuto, y ni `conTope` lo corta porque su reloj también queda esperando. El techo de
 * páginas es el tope real.
 */
export const MAX_PDF_PAGES_COMPLETO = 1_000;

/** A-17: tope para que un PDF o un Office enorme o malicioso no deje el request colgado. */
export const EXTRACT_TIMEOUT_MS = 20_000;

/**
 * Devuelve `null` si `promesa` no resolvió dentro de `ms`. No cancela el trabajo (pdf-parse y
 * officeparser no se pueden interrumpir) pero sí destraba al caller: el documento se guarda
 * sin `content`, igual que cuando la extracción falla. Solo corta trabajo que suelta el hilo: un
 * cálculo largo y sincrónico (pdf.js sobre miles de páginas) frena también este reloj — para eso
 * están los topes de páginas.
 */
export async function conTope<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promesa, tope]);
  } finally {
    clearTimeout(timer);
  }
}

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
 * Extrae texto de un buffer según su mimeType. Devuelve el texto (truncado a `maxChars`, por defecto
 * MAX_EXTRACTED_CHARS; la preventa pide más para recortar una transcripción por el medio) o null si el formato no se soporta o la extracción falla.
 */
export async function extractText(buffer: Buffer, mimeType: string, maxChars: number = MAX_EXTRACTED_CHARS): Promise<string | null> {
  try {
    return await conTope(extraerSinTope(buffer, mimeType, maxChars), EXTRACT_TIMEOUT_MS);
  } catch {
    return null;
  }
}

async function extraerSinTope(buffer: Buffer, mimeType: string, maxChars: number): Promise<string | null> {
  try {
    // Plain text / CSV
    if (mimeType === "text/plain" || mimeType === "text/csv") {
      const text = new TextDecoder().decode(buffer).trim();
      return text ? text.slice(0, maxChars) : null;
    }

    // PDF — pdf-parse v2. Quien pide más que el tope normal (la preventa, para una transcripción de
    // varias horas) quiere el PDF entero: esas pasan de las 100 páginas. Entero, pero con techo.
    if (mimeType === "application/pdf") {
      const paginas = maxChars > MAX_EXTRACTED_CHARS ? MAX_PDF_PAGES_COMPLETO : MAX_PDF_PAGES;
      const text = (await textoDePdf(buffer, paginas))?.trim();
      if (!text || text.length < 10) return null; // Probablemente PDF escaneado
      return text.slice(0, maxChars);
    }

    // DOCX / XLSX / PPTX / ODT / ODS / ODP — officeparser (v7: OfficeParser.parseOffice)
    if (OFFICE_MIME_TYPES.has(mimeType)) {
      const { OfficeParser } = await import("officeparser");
      const ast = await OfficeParser.parseOffice(buffer);
      const text = ast.toText()?.trim();
      if (!text || text.length < 10) return null;
      return text.slice(0, maxChars);
    }

    return null;
  } catch (e) {
    // Falla silenciosa para quien llama (corrupto, formato raro…), pero con rastro en el log: sin él,
    // una librería rota se ve igual que un PDF escaneado (así pasó inadvertido el cambio a pdf-parse v2).
    // Solo tipo, tamaño y mensaje: nunca el contenido.
    console.warn(`[extractText] falló la extracción (${mimeType}, ${buffer.length} bytes): ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    return null;
  }
}

/**
 * Texto de las primeras `maxPaginas` páginas del PDF. API v2 de pdf-parse: la v1 exportaba una función
 * `default` que en la v2 ya no existe — llamarla tiraba TypeError y TODO PDF terminaba «sin texto».
 * `pageJoiner: ""` = sin los separadores «-- 1 of N --» que la v2 mete por defecto. pdf.js copia el
 * Buffer que recibe: el de quien llama queda intacto (lo fija una prueba).
 */
async function textoDePdf(buffer: Buffer, maxPaginas: number): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText({ first: maxPaginas, pageJoiner: "" })).text;
  } finally {
    await parser.destroy();
  }
}
