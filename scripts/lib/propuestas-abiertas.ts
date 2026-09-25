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

/** E3: los tipos de cambio que solo escribe E3 (los dicta el chat). */
export const TIPOS_DE_E3: readonly string[] = ["tarea-cambia", "fase-se-va"];

/**
 * E3: ¿el v1 trae algo que E2c no maneja bien? Un tipo de E3 (E2c lo lee como desconocido y bloquea),
 * `excluidos` no vacío o algún `porChat`. Los dos últimos E2c los ignora en silencio: una pantalla
 * vieja volvería a marcar lo desmarcado en otra computadora, y aplicaría lo del chat con la vara de la
 * IA. La vuelta atrás a E2c (`--desde-e3`) limpia estos. Se mira el JSON crudo.
 */
export function traeAlgoDeE3(json: unknown): boolean {
  if (!esBorradorV1(json)) return false;
  if (Array.isArray(json.excluidos) && json.excluidos.length > 0) return true;
  const cambios = Array.isArray(json.cambios) ? json.cambios : [];
  return cambios.some((c) => {
    const x = c as { tipo?: unknown; porChat?: unknown } | null;
    return (typeof x?.tipo === "string" && TIPOS_DE_E3.includes(x.tipo)) || x?.porChat === true;
  });
}

/**
 * ¿Es un v1 «solo de fases»? No espera tareas (`tareas` null o ausente) y no trae ningún cambio
 * `tarea-*`. Así lo escribe el handoff desde E2b, y E1 lo lee bien: son sus cuatro tipos de cambio.
 * La vuelta atrás lo deja; limpiarlo tiraría sugerencias del handoff que nadie revisó.
 * Se mira el JSON crudo: un `tarea-*` que esta versión no conoce (el lector lo descarta como
 * desconocido) igual cuenta. E3: uno del handoff que el chat tocó (una fase que se va, casillas
 * guardadas, algo `porChat`) ya no lo lee bien E1: tampoco es «solo de fases».
 */
export function esV1SoloDeFases(json: unknown): boolean {
  if (!esBorradorV1(json)) return false;
  if (json.tareas !== null && json.tareas !== undefined) return false;
  if (traeAlgoDeE3(json)) return false;
  const cambios = Array.isArray(json.cambios) ? json.cambios : [];
  return !cambios.some((c) => {
    const tipo = (c as { tipo?: unknown } | null)?.tipo;
    return typeof tipo === "string" && tipo.startsWith("tarea-");
  });
}
