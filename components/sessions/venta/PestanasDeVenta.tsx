"use client";

/**
 * Las pestañas de «Reuniones de venta» (S1 y S2): «Por empresa» y «El criterio», en `?vista=` de la misma ruta (modo
 * estado, como el tablero de salud).
 */
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui";

export type VistaDeVenta = "empresas" | "criterio";

export function PestanasDeVenta({ vista }: { vista: VistaDeVenta }) {
  const router = useRouter();
  return (
    <Tabs<VistaDeVenta>
      aria-label="Vistas de las reuniones de venta"
      value={vista}
      onChange={(v) => router.push(v === "empresas" ? "/sessions/venta" : "/sessions/venta?vista=criterio")}
      items={[
        { key: "empresas", label: "Por empresa" },
        { key: "criterio", label: "El criterio" },
      ]}
    />
  );
}
