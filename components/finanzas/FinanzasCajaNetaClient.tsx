"use client";

/**
 * components/finanzas/FinanzasCajaNetaClient.tsx
 *
 * Wrapper "tonto" de /finanzas/caja-neta — mismo patrón que
 * FinanzasCostosClient. Monta CajaNetaPanel (components/cobranza/) sin tocarlo.
 */
import { useCallback, useState } from "react";
import { PageHeader } from "@/components/ui";
import { fetchJson } from "@/lib/api/fetch-json";
import type { CajaNetaDTO, SnapshotSerieDTO } from "@/lib/cobranza";
import CajaNetaPanel from "@/components/cobranza/CajaNetaPanel";

export default function FinanzasCajaNetaClient({
  initialCajaNeta,
  initialSeries,
}: {
  initialCajaNeta: CajaNetaDTO;
  initialSeries: SnapshotSerieDTO[];
}) {
  const [cajaNeta, setCajaNeta] = useState(initialCajaNeta);

  const refreshCajaNeta = useCallback(async () => {
    try {
      const d = await fetchJson<{ cajaNeta: CajaNetaDTO }>("/api/cobranza/caja-neta");
      setCajaNeta(d.cajaNeta);
    } catch {}
  }, []);

  return (
    <div>
      <PageHeader
        title="Caja neta"
        description="Entra menos sale por bucket — ingresos proyectados de la cartera menos costos fijos estimados."
      />
      <CajaNetaPanel cajaNeta={cajaNeta} series={initialSeries} onRefresh={refreshCajaNeta} />
    </div>
  );
}
