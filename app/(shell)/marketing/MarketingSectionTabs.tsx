"use client";

/**
 * Tabs in-page del grupo activo de Marketing. El submenú del sidebar
 * (MarketingFlyout) solo tiene los 3 grupos; navegar entre las sub-secciones
 * DENTRO de un grupo (ej. Contenido/Generación/Ideas de campaña/Temas/Fuentes
 * dentro de "Generación de contenido") es esto. No se renderiza nada si el
 * grupo activo no tiene hijos (Voz de marca es una página directa).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MARKETING_NAV_GROUPS } from "@/components/marketing/nav-config";

export default function MarketingSectionTabs() {
  const pathname = usePathname();
  const activeGroup = MARKETING_NAV_GROUPS.find(
    (g) => g.children.some((c) => pathname.startsWith(c.href)) || pathname.startsWith(g.href),
  );

  if (!activeGroup || activeGroup.children.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 border-b border-line mb-6">
      {activeGroup.children.map((c) => {
        const active = pathname.startsWith(c.href);
        return (
          <Link
            key={c.href}
            href={c.href}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              active
                ? "border-brand text-fg font-medium"
                : "border-transparent text-fg-muted hover:text-fg-secondary"
            }`}
          >
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}
