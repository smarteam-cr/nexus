/**
 * Topología de navegación de Marketing — el submenú del sidebar (NavFlyout).
 *
 * Rediseño del 2026-10-04 (sistema «Nexus · interfaz interna»): antes eran 3 grupos («Generación de contenido»,
 * «Audiencia», «Voz de marca») con pestañas adentro, y todas las páginas se titulaban «Marketing». Ahora cada
 * entrada es una página con su propio título, en dos bloques: lo que hay que REVISAR (lo que propone el agente) y
 * lo que LEE el agente para escribir. Generación va suelta al final. La única página con pestañas es Audiencia
 * (ICP y buyer personas), por eso su entrada se marca activa en las dos rutas.
 *
 * Las rutas no cambian (son identidad: hay enlaces pegados); cambian los nombres que se ven.
 */
export interface MarketingNavItem {
  href: string;
  label: string;
  /** Bloque del submenú (NavChildConfig.section). Sin bloque = hoja suelta, con divisor. */
  section?: string;
  /** Prefijos que la marcan activa (default: [href]). */
  match?: readonly string[];
}

export const MARKETING_NAV: readonly MarketingNavItem[] = [
  { href: "/marketing/contenido", label: "Publicaciones", section: "Revisar" },
  { href: "/marketing/ideas-de-campana", label: "Ideas de SEM", section: "Revisar" },
  { href: "/marketing/temas", label: "Temas", section: "Lo que lee el agente" },
  {
    href: "/marketing/icp",
    label: "Audiencia",
    section: "Lo que lee el agente",
    match: ["/marketing/icp", "/marketing/personas"],
  },
  { href: "/marketing/voz", label: "Voz de marca", section: "Lo que lee el agente" },
  { href: "/marketing/fuentes", label: "Fuentes", section: "Lo que lee el agente" },
  { href: "/marketing/generacion", label: "Generación" },
] as const;
