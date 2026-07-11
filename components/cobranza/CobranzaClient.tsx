"use client";

/**
 * components/cobranza/CobranzaClient.tsx
 *
 * Contenedor client del módulo: 4 tabs in-page (useState local, no rutas —
 * variante del patrón MarketingSectionTabs). El estado de alertas, el de
 * cartera Y el de proyección viven acá: el badge del tab se actualiza cuando
 * AlertasCobranza resuelve, el digest puede refrescarlas tras un corte, y
 * cambiar de tab no pierde nada (los tabs desmontan; si el estado viviera en
 * PanelCartera/ProyeccionPanel, volver al tab lo remontaría con las props
 * stale del server render — fue el bug del doble "Configurar cuenta").
 */
import { useCallback, useState } from "react";
import type {
  AlertaDTO,
  CarteraRow,
  ProyeccionIngresos,
  RiesgoPagoItem,
  SnapshotDTO,
  SnapshotSerieDTO,
} from "@/lib/cobranza";
import { fetchJson } from "@/lib/api/fetch-json";
import PanelCartera from "./PanelCartera";
import AlertasCobranza from "./AlertasCobranza";
import DigestPanel from "./DigestPanel";
import ProyeccionPanel from "./ProyeccionPanel";
import ReportesPanel from "./ReportesPanel";

type Tab = "cartera" | "proyeccion" | "alertas" | "reportes" | "digest";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "cartera", label: "Panel de cartera" },
  { key: "proyeccion", label: "Proyección" },
  { key: "alertas", label: "Alertas" },
  { key: "reportes", label: "Reportes" },
  { key: "digest", label: "Digest semanal" },
];

export default function CobranzaClient({
  initialCartera,
  initialAlertas,
  initialSnapshot,
  initialProyeccion,
  initialSeries,
  initialRiesgo,
  role,
  todayISO,
}: {
  initialCartera: CarteraRow[];
  initialAlertas: AlertaDTO[];
  initialSnapshot: SnapshotDTO | null;
  initialProyeccion: ProyeccionIngresos;
  initialSeries: SnapshotSerieDTO[];
  initialRiesgo: RiesgoPagoItem[];
  role: string;
  todayISO: string;
}) {
  const [tab, setTab] = useState<Tab>("cartera");
  const [cartera, setCartera] = useState(initialCartera);
  const [alertas, setAlertas] = useState(initialAlertas);
  const [proyeccion, setProyeccion] = useState(initialProyeccion);
  const [series, setSeries] = useState(initialSeries);
  const [riesgo, setRiesgo] = useState(initialRiesgo);
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

  // Cambios de cobros (drawer, materialización) pueden mover la proyección.
  const refreshProyeccion = useCallback(async () => {
    try {
      const d = await fetchJson<{ proyeccion: ProyeccionIngresos }>("/api/cobranza/proyeccion");
      setProyeccion(d.proyeccion);
    } catch {
      // best-effort: si falla, el tab conserva lo que tenía
    }
  }, []);

  // Un corte nuevo agrega un punto a la serie y puede mover el riesgo.
  const refreshReportes = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        fetchJson<{ series: SnapshotSerieDTO[] }>("/api/cobranza/series"),
        fetchJson<{ riesgo: RiesgoPagoItem[] }>("/api/cobranza/riesgo"),
      ]);
      setSeries(s.series);
      setRiesgo(r.riesgo);
    } catch {
      // best-effort: si falla, el tab conserva lo que tenía
    }
  }, []);

  const onDigestDone = useCallback(() => {
    void refreshAlertas();
    void refreshReportes();
  }, [refreshAlertas, refreshReportes]);

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
      {tab === "proyeccion" && <ProyeccionPanel proyeccion={proyeccion} onRefresh={refreshProyeccion} />}
      {tab === "alertas" && <AlertasCobranza alertas={alertas} setAlertas={setAlertas} />}
      {tab === "reportes" && <ReportesPanel series={series} riesgo={riesgo} role={role} />}
      {tab === "digest" && (
        <DigestPanel initialSnapshot={initialSnapshot} onDigestDone={onDigestDone} />
      )}
    </div>
  );
}
