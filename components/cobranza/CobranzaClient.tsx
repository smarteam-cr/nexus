"use client";

/**
 * components/cobranza/CobranzaClient.tsx
 *
 * Contenedor client del módulo: 3 tabs in-page (useState local, no rutas —
 * variante del patrón MarketingSectionTabs). El estado de alertas Y el de
 * cartera viven acá: el badge del tab se actualiza cuando AlertasCobranza
 * resuelve, el digest puede refrescarlas tras un corte, y cambiar de tab no
 * pierde la cartera (los tabs desmontan; si viviera en PanelCartera, volver
 * al panel lo remontaría con las props stale del server render — fue el bug
 * del doble "Configurar cuenta").
 */
import { useCallback, useState } from "react";
import type { AlertaDTO, CarteraRow, SnapshotDTO } from "@/lib/cobranza";
import { fetchJson } from "@/lib/api/fetch-json";
import PanelCartera from "./PanelCartera";
import AlertasCobranza from "./AlertasCobranza";
import DigestPanel from "./DigestPanel";

type Tab = "cartera" | "alertas" | "digest";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "cartera", label: "Panel de cartera" },
  { key: "alertas", label: "Alertas" },
  { key: "digest", label: "Digest semanal" },
];

export default function CobranzaClient({
  initialCartera,
  initialAlertas,
  initialSnapshot,
  todayISO,
}: {
  initialCartera: CarteraRow[];
  initialAlertas: AlertaDTO[];
  initialSnapshot: SnapshotDTO | null;
  todayISO: string;
}) {
  const [tab, setTab] = useState<Tab>("cartera");
  const [cartera, setCartera] = useState(initialCartera);
  const [alertas, setAlertas] = useState(initialAlertas);
  const abiertas = alertas.filter((a) => a.estado === "ABIERTA").length;

  // Tras un corte manual el set de alertas puede cambiar → re-sincronizar el tab.
  const refreshAlertas = useCallback(async () => {
    try {
      const d = await fetchJson<{ alertas: AlertaDTO[] }>(
        "/api/cobranza/alertas?estados=ABIERTA,VISTA",
      );
      setAlertas(d.alertas);
    } catch {
      // best-effort: si falla, el tab conserva lo que tenía
    }
  }, []);

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-line mb-6">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                active
                  ? "border-brand text-fg font-medium"
                  : "border-transparent text-fg-muted hover:text-fg-secondary"
              }`}
            >
              {t.label}
              {t.key === "alertas" && abiertas > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] px-1 py-px rounded-full text-[10px] font-semibold text-red-600 bg-red-500/10 border border-red-500/30">
                  {abiertas}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "cartera" && <PanelCartera rows={cartera} setRows={setCartera} todayISO={todayISO} />}
      {tab === "alertas" && <AlertasCobranza alertas={alertas} setAlertas={setAlertas} />}
      {tab === "digest" && (
        <DigestPanel initialSnapshot={initialSnapshot} onDigestDone={refreshAlertas} />
      )}
    </div>
  );
}
