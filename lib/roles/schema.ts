/**
 * lib/roles/schema.ts
 *
 * Schemas Zod + metadata de secciones del módulo Roles (perfiles de puesto del
 * equipo). Client-safe: solo `zod` y constantes — lo importan tanto las routes
 * (validación en la frontera, ARCHITECTURE §3) como los componentes de UI (para
 * las labels de la plantilla fija). NO importa Prisma ni nada server-only.
 */
import { z } from "zod";

/** Cuerpo markdown de una sección: opcional, hasta 8k, se permite vacío. */
const mdBody = z.string().trim().max(8000);

export const roleCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  area: z.string().trim().max(120).nullish(),
  summary: z.string().trim().max(500).nullish(),
  profile: mdBody.nullish(),
  responsibilities: mdBody.nullish(),
  kpis: mdBody.nullish(),
  successPaths: mdBody.nullish(),
  failurePaths: mdBody.nullish(),
  maturityPath: mdBody.nullish(),
  transitionPeriod: mdBody.nullish(),
});

export const rolePatchSchema = roleCreateSchema.partial().extend({
  active: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export type RoleCreateInput = z.infer<typeof roleCreateSchema>;
export type RolePatchInput = z.infer<typeof rolePatchSchema>;

/**
 * Plantilla FIJA de secciones (fuente única de labels + orden) — la usan el form
 * de edición y la página de rol. El `key` matchea 1:1 la columna del modelo.
 */
export const ROLE_SECTIONS = [
  { key: "profile", label: "Perfil de puesto" },
  { key: "responsibilities", label: "Responsabilidades" },
  { key: "kpis", label: "KPIs" },
  { key: "successPaths", label: "Caminos de éxito" },
  { key: "failurePaths", label: "Caminos de fracaso" },
  { key: "maturityPath", label: "Ruta de madurez" },
  { key: "transitionPeriod", label: "Período de transición y crecimiento" },
] as const;

export type RoleSectionKey = (typeof ROLE_SECTIONS)[number]["key"];
