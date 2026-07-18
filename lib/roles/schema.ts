/**
 * lib/roles/schema.ts
 *
 * Schemas Zod + metadata de secciones del módulo Roles (perfiles de puesto del
 * equipo). Client-safe: solo `zod` y constantes — lo importan tanto las routes
 * (validación en la frontera, ARCHITECTURE §3) como los componentes de UI y el
 * template config del motor de landing (`components/landing/configs/roles.defs.ts`).
 * NO importa Prisma ni nada server-only.
 *
 * El contenido de cada rol vive como JSON estructurado por sección en
 * `RoleProfile.content` — un mapa `{ [sectionKey]: data }` cuyo shape lo definen los
 * componentes del motor (prose {md}, cards {items}, kpis, niveles). Acá el `content`
 * se valida como objeto opaco (la forma la garantizan los componentes, no la API).
 */
import { z } from "zod";

export const roleCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  area: z.string().trim().max(120).nullish(),
  summary: z.string().trim().max(500).nullish(),
  // Contenido estructurado por sección (mapa key → data). Objeto opaco: la forma la
  // garantizan los componentes de sección, no la frontera HTTP.
  content: z.record(z.string(), z.unknown()).optional(),
});

export const rolePatchSchema = roleCreateSchema.partial().extend({
  active: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export type RoleCreateInput = z.infer<typeof roleCreateSchema>;
export type RolePatchInput = z.infer<typeof rolePatchSchema>;

/**
 * Las 7 secciones de CONTENIDO de la plantilla (fuente única de labels + orden + las
 * `key` del mapa `content`). El hero (title/area/summary) NO está acá — vive en las
 * columnas de metadatos, no en `content`. El template config del motor
 * (`roles.defs.ts`) deriva sus 7 defs de esta lista.
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
