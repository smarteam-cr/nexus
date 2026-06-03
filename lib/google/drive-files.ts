/**
 * lib/google/drive-files.ts
 *
 * Lectura de archivos de Google Drive a partir de su URL, impersonando al
 * usuario logueado (DWD). Permite que el CSE pegue un link a una propuesta
 * (Google Docs/Slides/Sheets o un archivo binario en Drive) y que su contenido
 * se extraiga automáticamente para alimentar a los agentes.
 *
 * Decisiones (ver plan Fase 3):
 *   - Usa drive.files.export() con el scope drive.readonly ya configurado —
 *     NO requiere scopes nuevos de Slides/Sheets.
 *   - Impersona al usuario LOGUEADO (menor privilegio): solo lee lo que esa
 *     persona ya puede ver. Si no tiene acceso → error NO_ACCESS.
 *   - Sheets se exporta a CSV (primera hoja — limitación conocida de Drive).
 *   - Binarios (PDF, etc.) se descargan con alt=media y se pasan al extractor
 *     compartido (lib/documents/extract-text).
 */

import { google } from "googleapis";
import { getImpersonatedAuth } from "@/lib/google/auth";
import { extractText, MAX_EXTRACTED_CHARS } from "@/lib/documents/extract-text";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type DriveFileKind = "document" | "spreadsheet" | "presentation" | "drive-file";

export type DriveErrorCode = "NOT_FOUND" | "NO_ACCESS" | "TOO_LARGE" | "UNSUPPORTED";

export class DriveFileError extends Error {
  code: DriveErrorCode;
  constructor(code: DriveErrorCode, message: string) {
    super(message);
    this.name = "DriveFileError";
    this.code = code;
  }
}

export interface ExtractedDriveFile {
  title: string;
  mimeType: string;
  content: string | null;
}

// ── Parseo de URL ─────────────────────────────────────────────────────────────

/**
 * Extrae { fileId, kind } de una URL de Google. Devuelve null si la URL no
 * corresponde a un archivo de Google reconocible.
 *
 * Formatos soportados:
 *   docs.google.com/document/d/{id}/...        → document
 *   docs.google.com/spreadsheets/d/{id}/...    → spreadsheet
 *   docs.google.com/presentation/d/{id}/...    → presentation
 *   drive.google.com/file/d/{id}/...           → drive-file (binario)
 *   drive.google.com/open?id={id}              → drive-file
 *   drive.google.com/...?id={id}               → drive-file
 */
export function parseGoogleDriveUrl(
  url: string,
): { fileId: string; kind: DriveFileKind } | null {
  const trimmed = url.trim();

  // docs.google.com/{type}/d/{id}
  const docsMatch = trimmed.match(
    /docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/,
  );
  if (docsMatch) {
    const typeMap: Record<string, DriveFileKind> = {
      document: "document",
      spreadsheets: "spreadsheet",
      presentation: "presentation",
    };
    return { fileId: docsMatch[2], kind: typeMap[docsMatch[1]] };
  }

  // drive.google.com/file/d/{id}
  const driveFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch) {
    return { fileId: driveFileMatch[1], kind: "drive-file" };
  }

  // drive.google.com/open?id={id}  |  ...&id={id}  |  uc?id={id}
  const openMatch = trimmed.match(/drive\.google\.com\/[^?]*\?(?:[^&]*&)*id=([a-zA-Z0-9_-]+)/);
  if (openMatch) {
    return { fileId: openMatch[1], kind: "drive-file" };
  }

  return null;
}

// ── Extracción ────────────────────────────────────────────────────────────────

// Google Workspace native mimeTypes → mimeType de export y método.
const GOOGLE_NATIVE_EXPORT: Record<string, { exportMime: string }> = {
  "application/vnd.google-apps.document": { exportMime: "text/plain" },
  "application/vnd.google-apps.presentation": { exportMime: "text/plain" },
  "application/vnd.google-apps.spreadsheet": { exportMime: "text/csv" }, // primera hoja
};

/**
 * Mapea un error de la Drive API a un DriveFileError tipado.
 */
function toDriveError(err: unknown): DriveFileError {
  // googleapis lanza errores con .code (number) o .response.status
  const e = err as { code?: number; response?: { status?: number }; message?: string };
  const status = e?.code ?? e?.response?.status;
  if (status === 404) return new DriveFileError("NOT_FOUND", "El archivo no existe en Drive.");
  if (status === 403) return new DriveFileError("NO_ACCESS", "Sin acceso al archivo.");
  if (status === 413) return new DriveFileError("TOO_LARGE", "El archivo es demasiado grande para exportar.");
  return new DriveFileError("NO_ACCESS", e?.message ?? "Error accediendo al archivo en Drive.");
}

/**
 * Extrae título + mimeType + texto de un archivo de Drive, impersonando al
 * usuario dado. Lanza DriveFileError si no se puede acceder o procesar.
 */
export async function extractGoogleDriveFile(
  userEmail: string,
  fileId: string,
): Promise<ExtractedDriveFile> {
  const auth = getImpersonatedAuth(userEmail);
  const drive = google.drive({ version: "v3", auth });

  // 1. Metadata (nombre + mimeType). Acá saltan 403/404 si no hay acceso.
  let name: string;
  let mimeType: string;
  try {
    const meta = await drive.files.get({
      fileId,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });
    name = meta.data.name ?? "Documento de Drive";
    mimeType = meta.data.mimeType ?? "application/octet-stream";
  } catch (err) {
    throw toDriveError(err);
  }

  // 2a. Google Workspace nativo → export a texto/CSV
  const nativeExport = GOOGLE_NATIVE_EXPORT[mimeType];
  if (nativeExport) {
    try {
      const res = await drive.files.export(
        { fileId, mimeType: nativeExport.exportMime },
        { responseType: "text" },
      );
      const text = (res.data as string)?.trim() ?? "";
      return {
        title: name,
        mimeType,
        content: text ? text.slice(0, MAX_EXTRACTED_CHARS) : null,
      };
    } catch (err) {
      throw toDriveError(err);
    }
  }

  // 2b. Tipos nativos de Google sin export a texto (Forms, Drawings, etc.)
  if (mimeType.startsWith("application/vnd.google-apps")) {
    throw new DriveFileError(
      "UNSUPPORTED",
      `Tipo de Google no soportado para lectura de texto: ${mimeType}`,
    );
  }

  // 2c. Binario (PDF, DOCX, XLSX, PPTX subido a Drive) → descargar + extractText
  try {
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    const content = await extractText(buffer, mimeType);
    return { title: name, mimeType, content };
  } catch (err) {
    throw toDriveError(err);
  }
}
