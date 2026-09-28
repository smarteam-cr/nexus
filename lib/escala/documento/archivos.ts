/**
 * lib/escala/documento/archivos.ts — los archivos de la escala en el repo (`docs/escala/`).
 *
 * ⛔ Lo leen SOLO el script que publica y los tests (usa `fs`): NUNCA la app. La imagen de
 * producción no lleva ningún `.md`; la app lee la versión PUBLICADA en la base
 * (`vigente.ts`). El repo es por donde entra una versión nueva y contra lo que se prueba el lector.
 */
import fs from "node:fs";
import path from "node:path";
import { documentoPorClave, type DocumentoDeLaEscala } from "./documentos";

export const CARPETA_DE_LA_ESCALA = path.join(process.cwd(), "docs", "escala");

export function rutaDelArchivo(documento: DocumentoDeLaEscala): string {
  return path.join(CARPETA_DE_LA_ESCALA, documentoPorClave(documento).archivo);
}

export function leerArchivoDeLaEscala(documento: DocumentoDeLaEscala): string {
  return fs.readFileSync(rutaDelArchivo(documento), "utf8");
}

export const RUTA_DE_LAS_PRUEBAS = path.join(CARPETA_DE_LA_ESCALA, "pruebas_escala.py");
