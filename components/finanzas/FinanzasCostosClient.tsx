"use client";

/**
 * components/finanzas/FinanzasCostosClient.tsx
 *
 * Wrapper "tonto" de /finanzas/costos: sostiene el estado que antes vivía en
 * CobranzaClient y monta CostosPanel (components/cobranza/) SIN tocarlo — sus
 * imports internos son relativos, moverlo de carpeta los rompería. Cruzar el
 * módulo así es una excepción deliberada (ver DECISIONS.md, sección Cobranza).
 */
import { useCallback, useState } from "react";
import { PageHeader } from "@/components/ui";
import { fetchJson } from "@/lib/api/fetch-json";
import type { CostoRecurrenteDTO, GastoPuntualDTO } from "@/lib/cobranza";
import CostosPanel from "@/components/cobranza/CostosPanel";

export default function FinanzasCostosClient({
  initialCostos,
  initialGastos,
  todayISO,
}: {
  initialCostos: CostoRecurrenteDTO[];
  initialGastos: GastoPuntualDTO[];
  todayISO: string;
}) {
  const [costos, setCostos] = useState(initialCostos);
  const [gastos, setGastos] = useState(initialGastos);

  const refreshCostos = useCallback(async () => {
    try {
      const d = await fetchJson<{ costos: CostoRecurrenteDTO[] }>("/api/cobranza/costos");
      setCostos(d.costos);
    } catch {}
  }, []);

  const refreshGastos = useCallback(async () => {
    try {
      const d = await fetchJson<{ gastos: GastoPuntualDTO[] }>("/api/cobranza/gastos");
      setGastos(d.gastos);
    } catch {}
  }, []);

  return (
    <div>
      <PageHeader
        title="Costos y gastos"
        description="Costos fijos y gastos puntuales de referencia — no es contabilidad ni planilla."
      />
      <CostosPanel
        costos={costos}
        gastos={gastos}
        todayISO={todayISO}
        onCostosChanged={refreshCostos}
        onGastosChanged={refreshGastos}
      />
    </div>
  );
}
