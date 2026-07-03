/**
 * components/landing/i18n.ts
 *
 * Rótulos FIJOS de los componentes de sección que ve el CLIENTE ("Retos actuales",
 * "Fuera de alcance", "Recurrente mensual"…): deben seguir el idioma de la
 * propuesta. El agente declara el idioma detectado en `__lang` (key no-schema del
 * data del hero) → las páginas lo pasan por ctx.lang → t() resuelve.
 *
 * Cobertura: español (default) e inglés; cualquier otro idioma cae a inglés
 * (mejor que quedar en español si la propuesta va en alemán). El CONTENIDO lo
 * escribe el agente directamente en el idioma pedido — esto es solo el chrome.
 */

export type LandingLang = "es" | "en";

/** "en", "en-US", "EN" → en · null/"es"/desconocido-vacío → es · otro → en. */
export function landingLang(raw?: string | null): LandingLang {
  const l = (raw ?? "").trim().toLowerCase();
  if (!l || l.startsWith("es")) return "es";
  return "en";
}

const STRINGS = {
  retosActuales: { es: "Retos actuales", en: "Current challenges" },
  porQue: { es: "Por qué", en: "Why" },
  objetivo: { es: "Objetivo", en: "Goal" },
  fueraDeAlcance: { es: "Fuera de alcance", en: "Out of scope" },
  opcionales: { es: "Opcionales / a futuro", en: "Optional / future" },
  resultado: { es: "Resultado", en: "Outcome" },
  hoy: { es: "Hoy", en: "Today" },
  conImplementacion: { es: "Con la implementación", en: "With the implementation" },
  conHubspotSmarteam: { es: "Con HubSpot + Smarteam", en: "With HubSpot + Smarteam" },
  // Inversión (website)
  montosEn: { es: "Montos en", en: "Amounts in" },
  nota: { es: "Nota", en: "Note" },
  inversionFase: { es: "Inversión única — Fase 1", en: "One-time investment — Phase 1" },
  rangoFase: { es: "Rango Fase 1", en: "Phase 1 range" },
  extrasOpcionales: { es: "Extras opcionales", en: "Optional add-ons" },
  opcional: { es: "Opcional", en: "Optional" },
  recurrenteMensual: { es: "Recurrente mensual", en: "Monthly recurring" },
  // Cards del template hubspot
  hubsIncluidos: { es: "Hubs incluidos", en: "Hubs included" },
  integracionesClave: { es: "Integraciones clave", en: "Key integrations" },
  casosDeUsoPrincipales: { es: "Casos de uso principales", en: "Main use cases" },
  usuariosAfectados: { es: "Usuarios afectados", en: "Affected users" },
  licenciasHubspot: { es: "Licencias HubSpot / año", en: "HubSpot licenses / year" },
  implementacionSmarteam: { es: "Implementación Smarteam", en: "Smarteam implementation" },
  credencial: { es: "Credencial", en: "Credential" },
  experiencia: { es: "Experiencia", en: "Experience" },
  referenciaSectorial: { es: "Referencia sectorial", en: "Industry reference" },
  equipoAsignado: { es: "Equipo asignado", en: "Assigned team" },
} as const;

export type LandingStringKey = keyof typeof STRINGS;

export function t(lang: LandingLang, key: LandingStringKey): string {
  return STRINGS[key][lang];
}
