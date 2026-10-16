"use client";

/**
 * Las pestañas de «Uso de Nexus»: Equipo · Para qué se usa · Reuniones sin grabar. Viven en `?vista=` de la misma
 * ruta, así que van en modo estado (el modo navegación de `Tabs` marca activo por prefijo de ruta).
 */
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import type { VistaDeUso } from "@/lib/uso/vistas";

const direccionDe = (v: VistaDeUso) => (v === "equipo" ? "/para-ti/uso" : `/para-ti/uso?vista=${v}`);

export default function PestanasDeUso({ vista, sinGrabar }: { vista: VistaDeUso; sinGrabar: number | null }) {
  const router = useRouter();
  return (
    <Tabs<VistaDeUso>
      aria-label="Secciones de Uso de Nexus"
      value={vista}
      onChange={(v) => router.push(direccionDe(v))}
      items={[
        { key: "equipo", label: "Equipo" },
        { key: "propuesto", label: "Para qué se usa" },
        { key: "reuniones", label: "Reuniones sin grabar", ...(sinGrabar ? { count: sinGrabar } : {}) },
      ]}
    />
  );
}
