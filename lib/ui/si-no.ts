/**
 * lib/ui/si-no.ts — el vocabulario "sí/no" de las casillas del motor de landing.
 *
 * Vive en `lib/` y no en el componente porque ahora lo necesitan los dos lados:
 * `components/landing/inline.tsx` (que lo re-exporta, para no romper a sus callers) y
 * los helpers puros de `lib/canvas/**` que cuentan casillas marcadas sin renderizar
 * nada — y `lib/` no puede importar de un archivo `"use client"`.
 *
 * POR QUÉ STRINGS Y NO BOOLEANS: `coerceToSchema` (lib/ai/section-schema.ts) aplana
 * toda hoja del schema a string, así que un `true` del agente llegaría como `""`. Las
 * casillas hablan "si"/"no" para round-trippear por ese embudo.
 */

/** Valores que cuentan como "sí" (tolerante a lo que emita el agente o data vieja). */
export function isSi(v: string | undefined | null): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "si" || s === "sí" || s === "true" || s === "1" || s === "x";
}
