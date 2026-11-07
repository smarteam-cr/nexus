"use client";

/**
 * Las pestañas de «Uso de Nexus»: Equipo · Para qué se usa · IA por cliente · Procesos de IA · Conclusiones · Reuniones
 * sin grabar. Viven en `?vista=` de la misma ruta, así que van en modo estado (el modo navegación de `Tabs` marca activo
 * por prefijo de ruta). Las de IA llevan además el período (`?dias=30|90`), que se conserva al cambiar entre ellas;
 * «Equipo» lleva el suyo (`?periodo=mes|trimestre|semestre|anio`).
 */
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/Tabs";
import { Segmentado } from "@/components/ui/Segmentado";
import { VISTAS_CON_PERIODO, direccionDeUso, type DiasDeIa, type VistaDeUso } from "@/lib/uso/vistas";
import { PERIODOS, type Periodo } from "@/lib/uso/periodo";

export default function PestanasDeUso({
  vista,
  sinGrabar,
  dias,
  periodo,
}: {
  vista: VistaDeUso;
  sinGrabar: number | null;
  dias: DiasDeIa;
  periodo: Periodo;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <Tabs<VistaDeUso>
        aria-label="Secciones de Uso de Nexus"
        value={vista}
        onChange={(v) => router.push(direccionDeUso(v, dias, periodo))}
        items={[
          { key: "equipo", label: "Equipo" },
          { key: "propuesto", label: "Para qué se usa" },
          { key: "clientes", label: "IA por cliente" },
          { key: "procesos", label: "Procesos de IA" },
          { key: "conclusiones", label: "Conclusiones" },
          { key: "reuniones", label: "Reuniones sin grabar", ...(sinGrabar ? { count: sinGrabar } : {}) },
        ]}
      />
      {vista === "equipo" && (
        <Segmentado<Periodo>
          etiqueta="Período"
          opciones={PERIODOS}
          valor={periodo}
          onCambio={(k) => router.push(direccionDeUso("equipo", dias, k))}
        />
      )}
      {VISTAS_CON_PERIODO.includes(vista) && (
        <Segmentado<"30" | "90">
          etiqueta="Período"
          opciones={[
            { clave: "30", etiqueta: "30 días" },
            { clave: "90", etiqueta: "90 días" },
          ]}
          valor={String(dias) as "30" | "90"}
          onCambio={(k) => router.push(direccionDeUso(vista, Number(k) as DiasDeIa))}
        />
      )}
    </div>
  );
}
