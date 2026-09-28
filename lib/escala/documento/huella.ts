/**
 * lib/escala/documento/huella.ts — la huella (sha256) del texto de un documento publicado.
 *
 * Con ella se sabe si una versión publicada es la misma que la del repo, y la app parsea cada
 * versión una sola vez. Aparte de `vigente.ts` porque aquel es solo del servidor de Next y el
 * script de publicación también la necesita.
 */
import { createHash } from "node:crypto";

export function huellaDe(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}
