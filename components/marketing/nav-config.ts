/**
 * Topología de navegación de Marketing — el submenú del sidebar (NavFlyout).
 *
 * Rediseño del 2026-10-04 (sistema «Nexus · interfaz interna»): antes eran 3 grupos («Generación de contenido»,
 * «Audiencia», «Voz de marca») con pestañas adentro, y todas las páginas se titulaban «Marketing». Ahora cada
 * entrada es una página con su propio título, en dos bloques: lo que hay que REVISAR (lo que propone el agente) y
 * lo que LEE el agente para escribir. Generación va suelta al final. La única página con pestañas es Audiencia
 * (ICP, buyer personas y position statement), por eso su entrada se marca activa en sus tres rutas.
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
  /** La entrada pide este permiso (el menú; la seguridad está en la página). */
  permiso?: { section: string; action: string };
}

export const MARKETING_NAV: readonly MarketingNavItem[] = [
  { href: "/marketing/contenido", label: "Publicaciones", section: "Revisar" },
  { href: "/marketing/ideas-de-campana", label: "Ideas de SEM", section: "Revisar" },
  // K10 (2026-10-27): las empresas que llegaron por el test, con cuántas áreas y cuántas pasaron a preventa.
  // Pide `preventa.read`: muestra a los contactos de cada prospecto, lo mismo que «Llegaron por el test» de Ventas.
  { href: "/marketing/leads-del-test", label: "Leads del test", section: "Resultados", permiso: { section: "preventa", action: "read" } },
  { href: "/marketing/temas", label: "Temas", section: "Lo que lee el agente" },
  {
    href: "/marketing/icp",
    label: "Audiencia",
    section: "Lo que lee el agente",
    match: ["/marketing/icp", "/marketing/personas", "/marketing/posicionamiento"],
  },
  { href: "/marketing/voz", label: "Voz de marca", section: "Lo que lee el agente" },
  { href: "/marketing/fuentes", label: "Fuentes", section: "Lo que lee el agente" },
  { href: "/marketing/generacion", label: "Generación" },
] as const;
