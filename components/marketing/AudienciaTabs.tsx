"use client";

/**
 * Las pestañas de Audiencia: el cliente ideal (/marketing/icp) y las buyer personas (/marketing/personas). Son dos
 * rutas (hay enlaces pegados a las dos) y una sola entrada del submenú, así que se navega con <Tabs> en modo
 * navegación. Los números los cuenta el servidor.
 */
import { Tabs } from "@/components/ui";

export default function AudienciaTabs({ icp, personas }: { icp: number; personas: number }) {
  return (
    <Tabs
      aria-label="Audiencia"
      items={[
        { key: "icp", label: "Cliente ideal (ICP)", href: "/marketing/icp", count: icp },
        { key: "personas", label: "Buyer personas", href: "/marketing/personas", count: personas },
      ]}
    />
  );
}
