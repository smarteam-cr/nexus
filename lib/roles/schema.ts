/**
 * lib/roles/schema.ts
 *
 * Schemas Zod del módulo Roles (perfiles de puesto del equipo): la validación en la
 * frontera (ARCHITECTURE §3) de `app/api/roles/**`. Server-side.
 *
 * C-24 (2026-09-04): las CONSTANTES puras (tipos de documento, rótulos, las 12 secciones)
 * viven en `./roles-ui.ts`, que es lo que importan los componentes de cliente y el template
 * config del motor. Antes vivían acá, y como este archivo importa zod, cada `"use client"`
 * que quería un rótulo se llevaba los 266 KB de zod al navegador. Un componente de cliente
 * NO importa este archivo (lo vigila lib/auth/client-safe.test.ts).
 *
 * El contenido de cada rol vive como JSON estructurado por sección en
 * `RoleProfile.content` — un mapa `{ [sectionKey]: data }` cuyo shape lo definen los
 * componentes del motor (prose {md}, cards {items}, kpis, niveles). Acá el `content`
 * se valida como objeto opaco (la forma la garantizan los componentes, no la API).
 */
import { z } from "zod";
import { ROLE_DOC_TYPES } from "./roles-ui";

export const roleCreateSchema = z.object({
  docType: z.enum(ROLE_DOC_TYPES).default("PERFIL"),
  title: z.string().trim().min(1).max(120),
  area: z.string().trim().max(120).nullish(),
  summary: z.string().trim().max(500).nullish(),
  // Contenido estructurado por sección (mapa key → data). Objeto opaco: la forma la
  // garantizan los componentes de sección, no la frontera HTTP.
  content: z.record(z.string(), z.unknown()).optional(),
});

/**
 * ⚠ `docType` se OMITE a propósito: el tipo se elige al crear y no se cambia después.
 * Cambiarlo dejaría el `content` lleno de keys que la otra plantilla no renderiza (y sin
 * las que sí necesita) — un documento a medias, en silencio.
 */
export const rolePatchSchema = roleCreateSchema.omit({ docType: true }).partial().extend({
  active: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export type RoleCreateInput = z.infer<typeof roleCreateSchema>;
export type RolePatchInput = z.infer<typeof rolePatchSchema>;
