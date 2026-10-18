"use client";

/**
 * components/finanzas/PestanasDeConciliacion.tsx — Odoo, Mercury e Integraciones como pestañas de Conciliación
 * (2026-10-18, decisión de Elías sobre docs/finanzas-simplificacion.md).
 *
 * Son las mismas páginas de siempre (/cobranza/odoo, /cobranza/mercury, /finanzas/integraciones): no se movieron las
 * rutas, porque son identidad y hay enlaces que llevan ahí. Lo que cambia es que se llega a ellas desde Conciliación, y
 * el menú las ilumina como Conciliación. Integraciones es solo de Super Admin: a los demás no se les ofrece.
 */
import { Tabs } from "@/components/ui";

export default function PestanasDeConciliacion({ conIntegraciones }: { conIntegraciones: boolean }) {
  return (
    <Tabs
      aria-label="Partes de Conciliación"
      variant="pill"
      size="sm"
      items={[
        { key: "conciliacion", label: "Conciliación", href: "/finanzas/conciliacion", title: "Lo que no cuadra, lo pagado, emparejar, el libro de Alex y los gastos." },
        { key: "odoo", label: "Odoo", href: "/cobranza/odoo", title: "La copia de Odoo: qué es, emparejar, lo que no cuadra y la facturación por cliente." },
        { key: "mercury", label: "Mercury", href: "/cobranza/mercury", title: "La copia de Mercury: facturas, clientes y pagos." },
        ...(conIntegraciones
          ? [{ key: "integraciones", label: "Integraciones", href: "/finanzas/integraciones", title: "Si las copias de Odoo, Mercury y HubSpot están al día." }]
          : []),
      ]}
    />
  );
}
