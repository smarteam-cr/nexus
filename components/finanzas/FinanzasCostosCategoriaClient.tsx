"use client";

/**
 * components/finanzas/FinanzasCostosCategoriaClient.tsx
 *
 * Wrapper de una HOJA de costos acotada a una categoría (Herramientas ·
 * Planillas · Costos fijos). Gemelo de FinanzasCostosClient: sostiene el estado
 * y monta el MISMO CostosPanel con `categoria`, para que el burn y la regla de
 * "qué quema" tengan una sola implementación (dos copias es como el total del
 * resumen y el de la hoja empiezan a contar historias distintas).
 *
 * El re-fetch trae TODOS los costos y filtra en el cliente: es el mismo endpoint
 * que ya existe, la lista es de decenas de filas, y evita un segundo lugar donde
 * se conteste "qué costos existen".
 */
import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui";
import { fetchJson } from "@/lib/api/fetch-json";
import type { CostoRecurrenteDTO } from "@/lib/cobranza";
import CostosPanel from "@/components/cobranza/CostosPanel";

export default function FinanzasCostosCategoriaClient({
  categoria,
  titulo,
  descripcion,
  leyenda,
  accion,
  initialCostos,
  todayISO,
}: {
  categoria: string;
  titulo: string;
  descripcion: string;
  leyenda: string;
  /**
   * CTA del encabezado. Nace para el botón «Historial» de Planillas: la hoja
   * dice qué se paga por mes y el botón lleva a lo que se pagó de verdad.
   * Es un ReactNode y no un `{href,label}` porque una hoja futura puede
   * necesitar otra cosa (un menú, dos botones) y el contenedor no tiene por
   * qué enterarse.
   */
  accion?: React.ReactNode;
  initialCostos: CostoRecurrenteDTO[];
  todayISO: string;
}) {
  const [costos, setCostos] = useState(initialCostos);

  const refreshCostos = useCallback(async () => {
    try {
      const d = await fetchJson<{ costos: CostoRecurrenteDTO[] }>("/api/cobranza/costos");
      setCostos(d.costos.filter((c) => c.categoria === categoria));
    } catch {}
  }, [categoria]);

  // Si el usuario cambia la categoría de un costo desde el form, el re-fetch lo
  // saca de esta hoja — por eso el filtro también corre acá y no solo en la page.
  const propios = useMemo(() => costos.filter((c) => c.categoria === categoria), [costos, categoria]);

  return (
    <div>
      <PageHeader title={titulo} description={descripcion} action={accion} />
      <CostosPanel
        costos={propios}
        gastos={[]}
        todayISO={todayISO}
        categoria={categoria}
        leyenda={leyenda}
        onCostosChanged={refreshCostos}
        onGastosChanged={refreshCostos}
      />
    </div>
  );
}
