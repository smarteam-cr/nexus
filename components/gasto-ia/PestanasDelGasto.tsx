"use client";

/**
 * Las pestañas de /integrations/gasto-ia: Por mes · Proyección · Factura · Últimos 30 días. Viven en `?vista=` de la
 * misma ruta (modo estado de `Tabs`: el modo navegación marca activo por prefijo de ruta).
 */
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";

export type VistaDelGasto = "mes" | "proyeccion" | "factura" | "detalle";

export const VISTAS_DEL_GASTO: readonly VistaDelGasto[] = ["mes", "proyeccion", "factura", "detalle"];

export default function PestanasDelGasto({ vista, facturasPorRevisar }: { vista: VistaDelGasto; facturasPorRevisar: number }) {
  const router = useRouter();
  return (
    <Tabs<VistaDelGasto>
      aria-label="Secciones del gasto en IA"
      value={vista}
      onChange={(v) => router.push(v === "mes" ? "/integrations/gasto-ia" : `/integrations/gasto-ia?vista=${v}`)}
      items={[
        { key: "mes", label: "Por mes" },
        { key: "proyeccion", label: "Proyección" },
        { key: "factura", label: "Factura", ...(facturasPorRevisar ? { count: facturasPorRevisar } : {}) },
        { key: "detalle", label: "Últimos 30 días" },
      ]}
    />
  );
}
