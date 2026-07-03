"use client";

/**
 * Navegación de Marketing en 2 niveles (reemplaza la fila plana de 8 pestañas):
 *   1. Generación de contenido — Contenido · Generación · Ideas de campaña · Temas · Fuentes
 *   2. Audiencia — ICP · Buyer personas
 *   3. Voz de marca — directo, sin hijos
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavChild {
  href: string;
  label: string;
}
interface NavGroup {
  key: string;
  label: string;
  href: string; // destino del grupo (el primer hijo, o la página directa si no tiene hijos)
  children: readonly NavChild[];
}

const GROUPS: readonly NavGroup[] = [
  {
    key: "content",
    label: "Generación de contenido",
    href: "/marketing/contenido",
    children: [
      { href: "/marketing/contenido", label: "Contenido" },
      { href: "/marketing/generacion", label: "Generación" },
      { href: "/marketing/ideas-de-campana", label: "Ideas de campaña" },
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

export default function MarketingNav() {
  const pathname = usePathname();
  const activeGroup =
    GROUPS.find((g) => g.children.some((c) => pathname.startsWith(c.href))) ??
    GROUPS.find((g) => pathname.startsWith(g.href));

  return (
    <div className="mt-4">
      {/* Nivel 1: grupos */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {GROUPS.map((g) => {
          const active = activeGroup?.key === g.key;
          return (
            <Link
              key={g.key}
              href={g.href}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                active
                  ? "border-brand text-fg font-medium"
                  : "border-transparent text-fg-muted hover:text-fg-secondary"
              }`}
            >
              {g.label}
            </Link>
          );
        })}
      </div>

      {/* Nivel 2: sub-secciones del grupo activo (si tiene hijos) */}
      {activeGroup && activeGroup.children.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {activeGroup.children.map((c) => {
            const active = pathname.startsWith(c.href);
            return (
              <Link
                key={c.href}
                href={c.href}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  active
                    ? "bg-brand/10 text-brand font-medium"
                    : "text-fg-muted hover:text-fg-secondary hover:bg-surface-hover"
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
