"use client";

/**
 * Las pestañas de /feedback: Bandeja · Hoja de ruta · Personas. Viven en `?vista=` de la misma ruta, así
 * que van en modo estado (el modo navegación de `Tabs` marca activo por prefijo de ruta, y las tres
 * comparten `/feedback`).
 */
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";

export type Vista = "bandeja" | "hoja" | "personas";

export default function PestanasDeFeedback({ vista }: { vista: Vista }) {
  const router = useRouter();
  return (
    <Tabs<Vista>
      aria-label="Secciones de Feedback"
      value={vista}
      onChange={(v) => router.push(v === "bandeja" ? "/feedback" : `/feedback?vista=${v}`)}
      items={[
        { key: "bandeja", label: "Bandeja" },
        { key: "hoja", label: "Hoja de ruta" },
        { key: "personas", label: "Personas" },
      ]}
    />
  );
}
