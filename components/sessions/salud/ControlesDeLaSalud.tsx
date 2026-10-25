"use client";

/**
 * Las pestañas y el periodo del tablero de salud de las reuniones (T1). Viven en `?vista=` y `?dias=` de la misma ruta,
 * así que las pestañas van en modo estado (el modo navegación de `Tabs` marca activo por prefijo de ruta), como en «Uso
 * de Nexus». El periodo se conserva al cambiar de pestaña y al revés.
 */
import { useRouter } from "next/navigation";
import { Segmentado, Tabs } from "@/components/ui";
import { direccionDeLaSalud, type PeriodoDeLaSalud, type VistaDeLaSalud } from "@/lib/sessions/salud-de-las-reuniones";

export function PeriodoDeLaSalud({ vista, dias }: { vista: VistaDeLaSalud; dias: PeriodoDeLaSalud }) {
  const router = useRouter();
  return (
    <Segmentado<"14" | "30" | "90">
      etiqueta="Periodo"
      opciones={[
        { clave: "14", etiqueta: "Últimos 14 días" },
        { clave: "30", etiqueta: "30 días" },
        { clave: "90", etiqueta: "90 días" },
      ]}
      valor={String(dias) as "14" | "30" | "90"}
      onCambio={(k) => router.push(direccionDeLaSalud(vista, Number(k) as PeriodoDeLaSalud))}
    />
  );
}

export function PestanasDeLaSalud({ vista, dias, soloTuyas, sinEmpresa }: { vista: VistaDeLaSalud; dias: PeriodoDeLaSalud; soloTuyas: boolean; sinEmpresa: number }) {
  const router = useRouter();
  return (
    <Tabs<VistaDeLaSalud>
      aria-label="Vistas del tablero"
      value={vista}
      onChange={(v) => router.push(direccionDeLaSalud(v, dias))}
      items={[
        { key: "personas", label: soloTuyas ? "Tus reuniones" : "Por persona" },
        { key: "empresas", label: "Por empresa" },
        { key: "motivos", label: "Sin texto: por qué" },
        { key: "sin-empresa", label: "Sin empresa", ...(sinEmpresa ? { count: sinEmpresa } : {}) },
      ]}
    />
  );
}
