"use client";

/**
 * Tabs in-page del grupo activo de Marketing. El submenú del sidebar
 * (MarketingFlyout) solo tiene los 3 grupos; navegar entre las sub-secciones
 * DENTRO de un grupo (ej. Contenido/Generación/Ideas de campaña/Temas/Fuentes
 * dentro de "Generación de contenido") es esto. No se renderiza nada si el
 * grupo activo no tiene hijos (Voz de marca es una página directa).
 *
 * Piloto del modo NAVEGACIÓN de <Tabs> (todos los items con href → <nav> +
 * aria-current, activo por pathname).
 */
import { usePathname } from "next/navigation";
import { Tabs } from "@/components/ui";
import { MARKETING_NAV_GROUPS } from "@/components/marketing/nav-config";

export default function MarketingSectionTabs() {
  const pathname = usePathname();
  const activeGroup = MARKETING_NAV_GROUPS.find(
    (g) => g.children.some((c) => pathname.startsWith(c.href)) || pathname.startsWith(g.href),
  );

  if (!activeGroup || activeGroup.children.length === 0) return null;

  return (
    <Tabs
      aria-label="Secciones de marketing"
      className="mb-6"
      items={activeGroup.children.map((c) => ({ key: c.href, label: c.label, href: c.href }))}
    />
  );
}
