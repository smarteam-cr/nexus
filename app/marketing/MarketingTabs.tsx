"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/marketing/contenido", label: "Contenido" },
  { href: "/marketing/ideas", label: "Ideas" },
  { href: "/marketing/campanas", label: "Campañas" },
  { href: "/marketing/pilares", label: "Pilares" },
  { href: "/marketing/fuentes", label: "Fuentes" },
  { href: "/marketing/personas", label: "Buyer personas" },
  { href: "/marketing/icp", label: "ICP" },
  { href: "/marketing/voz", label: "Voz de marca" },
] as const;

export default function MarketingTabs() {
  const pathname = usePathname();
  return (
    <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              active
                ? "border-brand text-fg font-medium"
                : "border-transparent text-fg-muted hover:text-fg-secondary"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
