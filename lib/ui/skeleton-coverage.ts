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
  // Las 3 hojas por categoría comparten el MISMO skeleton (CostosCategoriaSkeleton),
  // pero se declaran `own` y no `inherits`: su forma NO es la del Resumen (que
  // promete pills + gastos + movimientos), y heredarlo sería prometer otra pantalla.
  "finanzas/costos/herramientas": { modo: "own" },
  "finanzas/costos/planillas": { modo: "own" },
  "finanzas/costos/fijos": { modo: "own" },
  // La hoja de tarjetas tiene forma PROPIA (tarjetas apiladas con tres datos
  // cada una, no una lista de costos): heredar el skeleton de categoría
  // prometería una pantalla que no llega.
  "finanzas/costos/tarjetas": { modo: "own" },
  // El historial se agrupa por mes con dos bloques de quincena: su forma no es la
  // de ninguna de las hojas de categoría, ni la de su propia madre (Planillas).
  "finanzas/costos/planillas/historial": { modo: "own" },
  "finanzas/costos/aguinaldo": { modo: "own" },
  // Tres bloques (devengado + liquidado + reglas): no es la forma de ninguna
  // hoja de categoría ni la del libro.
  "finanzas/costos/comisiones-vendedor": { modo: "own" },
  "finanzas/caja-neta": { modo: "own" },
  "finanzas/ingresos-variables": { modo: "own" },
  "finanzas/comisiones-partner": { modo: "own" },
  // Siete indicadores + dos charts + una tabla de 12×10: no se parece a ninguna
  // otra hoja de finanzas.
  "finanzas/equilibrio": { modo: "own" },

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
  documentacion: { modo: "own" },
  roles: { modo: "own" },
  "roles/[id]": { modo: "inherits", de: "roles" },
  team: { modo: "own" },
  settings: { modo: "own" },
  // La pantalla de gasto son tres números en grilla + dos tablas; heredar el de
  // /settings (tres paneles apilados) prometería otra forma.
  "settings/gasto-ia": { modo: "own" },
  integrations: { modo: "own" },
  knowledge: { modo: "own" },
  agents: { modo: "own" },
  "agents/[id]": { modo: "inherits", de: "agents" },
  audits: { modo: "own" },
  "audits/[id]": { modo: "inherits", de: "audits" },

  // ── Implementación ──────────────────────────────────────────────────────────
};
