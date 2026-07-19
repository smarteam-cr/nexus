/**
 * lib/ui/page-shell-coverage.ts — REGISTRO DE CONTENEDOR POR RUTA.
 *
 * Cada ruta con `page.tsx` bajo `app/(shell)/` declara acá QUÉ contenedor usa.
 * `lib/ui/page-shell-coverage.test.ts` falla si una ruta no está declarada, y
 * para las declaradas con `shell` verifica que el page.tsx realmente importe esa
 * constante — la deriva de padding (`px-8` donde todos usan `px-6`) no puede
 * volver a entrar en silencio. Mismo mecanismo que skeleton-coverage.
 *
 * Cómo declarar una ruta nueva:
 *   - `shell: "SHELL_DEFAULT" | "SHELL_NARROW" | "SHELL_WIDE" | "SHELL_FULL"` →
 *     el page.tsx importa esa constante de lib/ui/page-shell (el default deseable).
 *   - `custom: razón` → contenedor propio legítimo (workspace full-viewport, el
 *     layout del área lo pone, redirect puro…) — con la razón escrita.
 */

export type ShellDecl =
  | { shell: "SHELL_DEFAULT" | "SHELL_NARROW" | "SHELL_WIDE" | "SHELL_FULL" }
  | { custom: string };

/** Clave = directorio de la ruta relativo a `app/(shell)/`. */
export const PAGE_SHELL_COVERAGE: Record<string, ShellDecl> = {
  // ── Índices con constante (el estándar) ─────────────────────────────────────
  audits: { shell: "SHELL_DEFAULT" },
  "business-cases": { shell: "SHELL_DEFAULT" },
  clients: { shell: "SHELL_DEFAULT" },
  cobranza: { shell: "SHELL_DEFAULT" },
  "customer-success": { shell: "SHELL_DEFAULT" },
  "customer-success/[clientId]": { shell: "SHELL_DEFAULT" },
  "finanzas/caja-neta": { shell: "SHELL_DEFAULT" },
  "finanzas/costos": { shell: "SHELL_DEFAULT" },
  integrations: { shell: "SHELL_DEFAULT" },
  knowledge: { shell: "SHELL_DEFAULT" },
  roles: { shell: "SHELL_DEFAULT" },

  // ── Contenedor propio legítimo ──────────────────────────────────────────────
  "clients/[id]": { custom: "workspace full-viewport con scroll interno y tab bar sticky" },
  "clients/[id]/projects/[projectId]": { custom: "workspace del proyecto (mismo motor que clients/[id])" },
  "clients/[id]/settings": { custom: "client component con contenedor angosto propio (candidato a SHELL_NARROW)" },
  "clients/[id]/documents": { custom: "vista de documentos con contenedor propio" },
  "clients/[id]/stage/[stageNum]": { custom: "stage page con overlay propio" },
  "clients/[id]/stage/[stageNum]/audit/[auditId]": { custom: "detalle de auditoría dentro del stage" },
  "clients/[id]/projects/[projectId]/stage/[stageNum]": { custom: "stage page del proyecto" },
  "roles/[id]": { custom: "página web del rol renderizada por el motor de landing (.stl)" },
  "business-cases/[id]": { custom: "workspace del BC (header propio + canvas)" },
  "business-cases/new": { custom: "formulario de creación con contenedor propio (candidato a SHELL_NARROW)" },
  "sessions/[id]": { custom: "lectura larga con max-w-5xl propio (candidato a SHELL_WIDE)" },
  "agents/[id]": { custom: "formulario del agente con contenedor propio (candidato a SHELL_NARROW)" },
  "audits/[id]": { custom: "detalle de auditoría con contenedor propio" },
  "implementation/[id]/execute": { custom: "vista de ejecución full-viewport" },
  "implementation/[id]/plan": { custom: "vista de plan full-viewport" },

  // ── El layout del área pone el contenedor ───────────────────────────────────
  "marketing/contenido": { custom: "el layout de marketing pone header + tabs + contenedor" },
  "marketing/generacion": { custom: "el layout de marketing pone el contenedor" },
  "marketing/ideas-de-campana": { custom: "el layout de marketing pone el contenedor" },
  "marketing/temas": { custom: "el layout de marketing pone el contenedor" },
  "marketing/personas": { custom: "el layout de marketing pone el contenedor" },
  "marketing/fuentes": { custom: "el layout de marketing pone el contenedor" },
  "marketing/voz": { custom: "el layout de marketing pone el contenedor" },
  "marketing/icp": { custom: "el layout de marketing pone el contenedor" },
  "cobranza/importar": { custom: "wizard de importación con contenedor propio" },

  // ── Redirects puros / legacy ────────────────────────────────────────────────
  marketing: { custom: "redirect a /marketing/contenido" },
  "marketing/ideas": { custom: "redirect (nombre viejo)" },
  "marketing/campanas": { custom: "redirect (nombre viejo)" },
  "marketing/pilares": { custom: "redirect (nombre viejo)" },
  archived: { custom: "vista legacy de archivados (candidata a SHELL_DEFAULT)" },
  sales: { custom: "delega el shell entero a SalesClient (candidata a SHELL_DEFAULT)" },
  "sales/use-cases": { custom: "admin de casos de uso con contenedor propio" },
  sessions: { custom: "layout propio de dos paneles (aside + detalle)" },
  "sessions/categories": { custom: "hereda el layout de sesiones" },
  settings: { custom: "página de ajustes con contenedor propio (candidata a SHELL_NARROW)" },
  team: { custom: "página de equipo con contenedor propio (candidata a SHELL_NARROW)" },
  agents: { custom: "catálogo con contenedor propio (candidata a SHELL_DEFAULT — ola B5)" },
};
