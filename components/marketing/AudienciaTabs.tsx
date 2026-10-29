"use client";

/**
 * Las pestañas de Audiencia: el cliente ideal (/marketing/icp), las buyer personas (/marketing/personas) y el position
 * statement (/marketing/posicionamiento, K3 del 2026-10-28). Son rutas (hay enlaces pegados) y una sola entrada del
 * submenú, así que se navega con <Tabs> en modo navegación. Los números los cuenta el servidor; el position statement no
 * lleva número.
 */
import { Tabs } from "@/components/ui";

export default function AudienciaTabs({ icp, personas }: { icp: number; personas: number }) {
  return (
    <Tabs
      aria-label="Audiencia"
      items={[
        { key: "icp", label: "Cliente ideal (ICP)", href: "/marketing/icp", count: icp },
        { key: "personas", label: "Buyer personas", href: "/marketing/personas", count: personas },
        { key: "posicionamiento", label: "Position statement", href: "/marketing/posicionamiento" },
      ]}
    />
  );
}
