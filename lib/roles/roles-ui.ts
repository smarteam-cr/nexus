/**
 * lib/roles/roles-ui.ts — las constantes del módulo Roles, listas para pintar. PURO y CLIENT-SAFE.
 *
 * C-24 (2026-09-04): antes vivían en `./schema.ts` junto a los esquemas zod, y como un
 * `"use client"` que importa un VALOR de un módulo se lleva sus imports, cada componente que
 * quería un rótulo (`ROLE_DOC_TYPE_LABEL`) o la lista de secciones (`ROLE_SECTIONS`) metía los
 * 266 KB de zod en el bundle del navegador. Misma disciplina que `lib/lifecycle/etapa-ui.ts`:
 * lo que pinta la UI no puede colgar de zod ni de Prisma. Sin imports a propósito.
 */

/**
 * Los dos tipos de documento que viven en `RoleProfile`. Espejo client-safe del enum
 * `RoleDocType` de Prisma (que no se puede importar acá sin arrastrar el cliente).
 * El tipo NO es cosmético: decide con qué PLANTILLA del motor se renderiza la fila.
 */
export const ROLE_DOC_TYPES = ["PERFIL", "PROPUESTA"] as const;
export type RoleDocTypeValue = (typeof ROLE_DOC_TYPES)[number];

export const ROLE_DOC_TYPE_LABEL: Record<RoleDocTypeValue, string> = {
  PERFIL: "Perfil de puesto",
  PROPUESTA: "Propuesta",
};

/**
 * Las secciones de CONTENIDO de la plantilla (fuente única de labels + orden + las
 * `key` del mapa `content`). El hero (title/area/summary) NO está acá — vive en las
 * columnas de metadatos, no en `content`. El template config del motor
 * (`roles.defs.ts`) deriva sus defs de esta lista.
 *
 * El bloque del medio implementa **4DX** (The 4 Disciplines of Execution), pero la página
 * es una GUÍA DE TRABAJO, no un curso: los `label` están en lenguaje llano y en primera
 * persona (responden lo que la persona se pregunta), el término técnico vive en el
 * `eyebrow` de `roles.defs.ts` y la teoría solo en el tooltip ⓘ. Por eso NO hay una
 * sección de metodología: explicar 4DX no es tarea de la página de un puesto.
 *
 * Orden deliberado: la meta (D1) → lo que hago cada semana (D2 lead) → cómo sé si funciona
 * (D2 lag) → dónde lo veo (D3) → con quién me reúno (D4). Las acciones van ANTES del
 * resultado: lo primero que alguien necesita al abrir su rol es qué hacer.
 */
export const ROLE_SECTIONS = [
  { key: "profile", label: "Perfil de puesto" },
  { key: "responsibilities", label: "Responsabilidades" },
  { key: "wig", label: "La meta que persigo" },
  { key: "leadMeasures", label: "Lo que hago cada semana" },
  { key: "lagMeasures", label: "Cómo sé si está funcionando" },
  { key: "scoreboard", label: "Dónde lo veo en HubSpot" },
  { key: "cadencia", label: "Con quién me reúno y de qué" },
  { key: "successPaths", label: "Caminos de éxito" },
  { key: "failurePaths", label: "Caminos de fracaso" },
  { key: "maturityPath", label: "Ruta de madurez" },
  { key: "transitionPeriod", label: "Período de transición y crecimiento" },
] as const;

export type RoleSectionKey = (typeof ROLE_SECTIONS)[number]["key"];
