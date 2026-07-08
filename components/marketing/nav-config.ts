/**
 * Topología de navegación de Marketing — fuente única compartida por el
 * submenú flyout del sidebar (MarketingFlyout, solo muestra los 3 grupos) y
 * las tabs in-page del grupo activo (MarketingSectionTabs, solo se muestran
 * si el grupo tiene 2+ hijos — "Voz de marca" no tiene, es una página directa).
 */
export interface MarketingNavChild {
  href: string;
  label: string;
}
export interface MarketingNavGroup {
  key: string;
  label: string;
  href: string; // destino del grupo: el primer hijo, o la página directa si no tiene hijos
  children: readonly MarketingNavChild[];
}

export const MARKETING_NAV_GROUPS: readonly MarketingNavGroup[] = [
  {
    key: "content",
    label: "Generación de contenido",
    href: "/marketing/contenido",
    children: [
      { href: "/marketing/contenido", label: "Contenido" },
      { href: "/marketing/generacion", label: "Generación" },
      { href: "/marketing/ideas-de-campana", label: "Ideas de SEM" },
      { href: "/marketing/temas", label: "Temas" },
      { href: "/marketing/fuentes", label: "Fuentes" },
    ],
  },
  {
    key: "audience",
    label: "Audiencia",
    href: "/marketing/icp",
    children: [
      { href: "/marketing/icp", label: "ICP" },
      { href: "/marketing/personas", label: "Buyer personas" },
    ],
  },
  {
    key: "voice",
    label: "Voz de marca",
    href: "/marketing/voz",
    children: [],
  },
] as const;
