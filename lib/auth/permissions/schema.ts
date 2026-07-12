/**
 * lib/auth/permissions/schema.ts — validación en la FRONTERA. CLIENT-SAFE (zod).
 *
 * Dos modos, mismo criterio que el resto de Nexus:
 *   - ESCRITURA (PUT plantilla / PATCH overrides): zod ESTRICTO contra el
 *     registry — clave desconocida o valor no-boolean → 400 (patrón
 *     BusinessCaseBlock.content). Acepta mapas SPARSE (toda celda es opcional;
 *     plantillas y overrides comparten schema).
 *   - LECTURA (Json de DB): tolerante — celdas desconocidas se ignoran,
 *     `v !== 1` o shape roto → null (cae a la capa anterior), NUNCA 500
 *     (patrón ProjectCanvas.sections).
 */
import { z } from "zod";
import type { PermissionMap } from "./types";
import { PERMISSION_SECTIONS } from "./registry";

function buildSectionsShape() {
  const shape: Record<string, z.ZodType> = {};
  for (const s of PERMISSION_SECTIONS) {
    const actions: Record<string, z.ZodType> = {};
    for (const a of s.actions) actions[a.key] = z.boolean().optional();
    shape[s.key] = z.strictObject(actions).optional();
  }
  return z.strictObject(shape);
}

/**
 * Schema de ESCRITURA: {v:1, sections} sparse, estricto contra el registry.
 * El shape se arma dinámico desde el registry → zod infiere `unknown`; el cast
 * al tipo real es seguro porque el runtime valida exactamente ese shape.
 */
export const permissionMapWriteSchema = z.strictObject({
  v: z.literal(1),
  sections: buildSectionsShape(),
}) as unknown as z.ZodType<PermissionMap>;

/**
 * Lectura TOLERANTE de un Json de DB (plantilla u overrides). Devuelve un mapa
 * sparse con SOLO las celdas conocidas y booleanas, o null si el valor no es
 * un mapa v1 usable (→ el engine cae a la capa anterior).
 */
export function parsePermissionMapLoose(raw: unknown): PermissionMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1) return null;
  const out: PermissionMap = { v: 1, sections: {} };
  const rawSections = obj.sections;
  if (!rawSections || typeof rawSections !== "object" || Array.isArray(rawSections)) return out;
  for (const s of PERMISSION_SECTIONS) {
    const rs = (rawSections as Record<string, unknown>)[s.key];
    if (!rs || typeof rs !== "object" || Array.isArray(rs)) continue;
    for (const a of s.actions) {
      const v = (rs as Record<string, unknown>)[a.key];
      if (typeof v === "boolean") (out.sections[s.key] ??= {})[a.key] = v;
    }
  }
  return out;
}
