/**
 * scripts/lib/propuestas-abiertas.ts — lo PURO de scripts/propuestas-abiertas.ts: en qué formato está
 * cada propuesta abierta, cuáles frenan el deploy y cuáles deja la vuelta atrás.
 *
 * Vive aparte, sin base ni efectos, para que el project `unit` lo pruebe
 * (lib/timeline/propuestas-abiertas.test.ts): el script corre `main()` apenas se importa.
 */
import { esBorradorGuardado, esBorradorV1 } from "../../lib/timeline/borrador";
import { origenDePropuesta } from "../../lib/timeline/proposal-deltas";

export type Formato = "v1" | "viejo-con-tasks" | "viejo-contexto" | "viejo-handoff" | "ilegible";
export const FORMATOS: readonly Formato[] = ["viejo-contexto", "viejo-handoff", "viejo-con-tasks", "v1", "ilegible"];

/**
 * Los que frenan el deploy de E2b. El v1 ya no frena: desde E2b todo v1 se lee, y lo escriben también
 * el handoff y «Regenerar» de una fase. El viejo del handoff tampoco: su lector vive hasta E4.
 * Sí frenan el viejo de «contexto» (E2b borra la cadena que lo seguía), el viejo con `tasks` y lo
 * ilegible.
 */
export const FRENAN_EL_DEPLOY: readonly Formato[] = ["viejo-contexto", "viejo-con-tasks", "ilegible"];

/** En qué formato está lo guardado. */
export function formatoDe(json: unknown): Formato {
  if (esBorradorV1(json)) return "v1";
  const fases = (json as { phases?: unknown } | null)?.phases;
  if (!Array.isArray(fases)) return "ilegible";
  if (!esBorradorGuardado(json)) return "viejo-con-tasks";
  return origenDePropuesta(json as { origen?: unknown }) === "contexto" ? "viejo-contexto" : "viejo-handoff";
}

/**
 * ¿Es un v1 «solo de fases»? No espera tareas (`tareas` null o ausente) y no trae ningún cambio
 * `tarea-*`. Así lo escribe el handoff desde E2b, y E1 lo lee bien: son sus cuatro tipos de cambio.
 * La vuelta atrás lo deja; limpiarlo tiraría sugerencias del handoff que nadie revisó.
 * Se mira el JSON crudo: un `tarea-*` que esta versión no conoce (el lector lo descarta como
 * desconocido) igual cuenta.
 */
export function esV1SoloDeFases(json: unknown): boolean {
  if (!esBorradorV1(json)) return false;
  if (json.tareas !== null && json.tareas !== undefined) return false;
  const cambios = Array.isArray(json.cambios) ? json.cambios : [];
  return !cambios.some((c) => {
    const tipo = (c as { tipo?: unknown } | null)?.tipo;
    return typeof tipo === "string" && tipo.startsWith("tarea-");
  });
}
