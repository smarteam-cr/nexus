"use client";

/**
 * components/clients/ExploracionDeVentaColumn.tsx — la cuarta columna del contexto del handoff.
 *
 * La exploración de venta que le corresponde al proyecto (Ventas → Exploraciones), resumida: el
 * nivel ESTIMADO de cada área, las metas y lo que se eligió para la propuesta. Entra al handoff
 * rotulada como estimado: le dice al CSE dónde mirar, no reemplaza su diagnóstico. Si al proyecto
 * no le corresponde ninguna, la columna no se muestra.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ContextColumnList, ContextRow } from "./context-column";

export interface ResumenDeLaExploracion {
  id: string;
  edicion: string | null;
  areas: { nombre: string; base: string | null; produccion: string | null; objetivo: string | null }[];
  metas: string[];
  casosDeUso: string[];
  puedeAbrir: boolean;
}

/** La exploración del proyecto, o null mientras carga o si no le corresponde ninguna. */
export function useExploracionDeVenta(projectId: string): ResumenDeLaExploracion | null {
  const [datos, setDatos] = useState<ResumenDeLaExploracion | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/exploracion-de-venta`);
        if (!res.ok) return;
        const data = (await res.json()) as { exploracion?: ResumenDeLaExploracion | null };
        if (vivo) setDatos(data.exploracion ?? null);
      } catch {
        /* sin la columna: el resto del contexto sigue igual */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [projectId]);
  return datos;
}

export function ExploracionDeVentaResumen({ datos }: { datos: ResumenDeLaExploracion }) {
  const filas = [
    ...datos.areas.map((a) => (
      <ContextRow
        key={`area-${a.nombre}`}
        meta="Nivel estimado"
        title={a.nombre}
        snippet={[a.base && `Base ${a.base}`, a.produccion && `Producción ${a.produccion}`, a.objetivo && `Objetivo ${a.objetivo}`].filter(Boolean).join(" · ") || "Sin estimar"}
        badge={{ label: "Estimado", tone: "amber" }}
      />
    )),
    ...datos.metas.map((m, i) => <ContextRow key={`meta-${i}`} meta="Meta del cliente" title={m} />),
    ...(datos.casosDeUso.length ? [<ContextRow key="casos" meta="Casos de uso elegidos" title={datos.casosDeUso.join(" · ")} />] : []),
  ];
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-fg-muted">
        Entra al handoff como <span className="font-medium text-fg-secondary">estimado</span>: dice dónde mirar, no es evidencia.
        {datos.edicion ? ` Edición de la escala: ${datos.edicion}.` : ""}
      </p>
      <ContextColumnList empty="La exploración todavía no tiene nada confirmado.">{filas}</ContextColumnList>
      {datos.puedeAbrir && (
        <Link href={`/sales/exploraciones/${datos.id}`} className="block text-[11px] font-semibold text-brand hover:text-brand-dark">
          Abrir la exploración
        </Link>
      )}
    </div>
  );
}
