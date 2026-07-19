/**
 * lib/ui/skeleton-coverage.ts — REGISTRO DE COBERTURA DE SKELETONS.
 *
 * Cada ruta con `page.tsx` bajo `app/(shell)/` declara acá cómo resuelve su estado de
 * carga. `lib/ui/skeleton-coverage.test.ts` falla si una ruta NO está declarada, así que
 * agregar una página obliga a decidir su skeleton — la omisión no puede pasar en
 * silencio (mismo mecanismo que el registry de permisos).
 *
 * Cómo declarar una ruta nueva:
 *   - `own`      → tiene su propio loading.tsx. Es el default deseable.
 *   - `inherits` → usa el loading.tsx de un ancestro. SOLO es legítimo si la forma de
 *                  la pantalla es la misma; si no, el skeleton promete otra cosa.
 *   - `exempt`   → no necesita (redirect puro, o server trivial sin espera perceptible),
 *                  con la razón escrita.
 */

export type Cobertura =
  | { modo: "own" }
  | { modo: "inherits"; de: string }
  | { modo: "exempt"; razon: string };

/** Clave = directorio de la ruta relativo a `app/(shell)/` ("" = la raíz del grupo). */
export const SKELETON_COVERAGE: Record<string, Cobertura> = {
  // ── Clientes ────────────────────────────────────────────────────────────────
  clients: { modo: "own" },
  "clients/[id]": { modo: "own" },
  "clients/[id]/projects/[projectId]": { modo: "inherits", de: "clients/[id]" },
  "clients/[id]/settings": { modo: "inherits", de: "clients/[id]" },
  "clients/[id]/documents": { modo: "inherits", de: "clients/[id]" },
  "clients/[id]/stage/[stageNum]": { modo: "inherits", de: "clients/[id]" },
  "clients/[id]/stage/[stageNum]/audit/[auditId]": { modo: "inherits", de: "clients/[id]" },
  "clients/[id]/projects/[projectId]/stage/[stageNum]": { modo: "inherits", de: "clients/[id]" },

  // ── Sesiones ────────────────────────────────────────────────────────────────
  sessions: { modo: "own" },
  "sessions/[id]": { modo: "own" },
  "sessions/categories": { modo: "inherits", de: "sessions" },

  // ── Cobranza y Finanzas ─────────────────────────────────────────────────────
  cobranza: { modo: "own" },
  "cobranza/importar": { modo: "inherits", de: "cobranza" },
  "finanzas/costos": { modo: "own" },
  "finanzas/caja-neta": { modo: "own" },

  // ── Customer Success ────────────────────────────────────────────────────────
  "customer-success": { modo: "own" },
  "customer-success/[clientId]": { modo: "own" },

  // ── Marketing (el layout mantiene header + tabs; el loading cubre el slot) ───
  marketing: { modo: "exempt", razon: "redirect a /marketing/contenido" },
  "marketing/contenido": { modo: "inherits", de: "marketing" },
  "marketing/generacion": { modo: "inherits", de: "marketing" },
  "marketing/ideas-de-campana": { modo: "inherits", de: "marketing" },
  "marketing/ideas": { modo: "exempt", razon: "redirect a /marketing/contenido" },
  "marketing/campanas": { modo: "exempt", razon: "redirect a /marketing/ideas-de-campana (nombre viejo)" },
  "marketing/pilares": { modo: "exempt", razon: "redirect a /marketing/temas (nombre viejo)" },
  "marketing/temas": { modo: "inherits", de: "marketing" },
  "marketing/personas": { modo: "inherits", de: "marketing" },
  "marketing/fuentes": { modo: "inherits", de: "marketing" },
  "marketing/voz": { modo: "inherits", de: "marketing" },
  "marketing/icp": { modo: "inherits", de: "marketing" },

  // ── Ventas ──────────────────────────────────────────────────────────────────
  sales: { modo: "own" },
  "sales/use-cases": { modo: "inherits", de: "sales" },
  "business-cases": { modo: "own" },
  "business-cases/[id]": { modo: "inherits", de: "business-cases" },
  "business-cases/new": { modo: "inherits", de: "business-cases" },

  // ── Documentación y administración ──────────────────────────────────────────
  roles: { modo: "own" },
  "roles/[id]": { modo: "inherits", de: "roles" },
  team: { modo: "own" },
  settings: { modo: "own" },
  integrations: { modo: "own" },
  knowledge: { modo: "own" },
  agents: { modo: "own" },
  "agents/[id]": { modo: "inherits", de: "agents" },
  audits: { modo: "own" },
  "audits/[id]": { modo: "inherits", de: "audits" },
  archived: { modo: "inherits", de: "" },

  // ── Implementación ──────────────────────────────────────────────────────────
  "implementation/[id]/plan": { modo: "inherits", de: "" },
  "implementation/[id]/execute": { modo: "inherits", de: "" },
};
