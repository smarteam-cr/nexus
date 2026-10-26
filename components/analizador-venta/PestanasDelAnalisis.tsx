"use client";

/**
 * Las pestañas de «Análisis de la venta» (S7, 2026-10-27; vinieron de «Reuniones de venta» en Sesiones, que se retiró: S6):
 * «Por vendedor» y «El criterio», en `?vista=` de la misma ruta (modo estado).
 */
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui";

export type VistaDelAnalisis = "vendedores" | "criterio";

export function PestanasDelAnalisis({ vista }: { vista: VistaDelAnalisis }) {
  const router = useRouter();
  return (
    <Tabs<VistaDelAnalisis>
      aria-label="Vistas del análisis de la venta"
      value={vista}
      onChange={(v) => router.push(v === "vendedores" ? "/sales/analisis" : "/sales/analisis?vista=criterio")}
      items={[
        { key: "vendedores", label: "Por vendedor" },
        { key: "criterio", label: "El criterio" },
      ]}
    />
  );
}
