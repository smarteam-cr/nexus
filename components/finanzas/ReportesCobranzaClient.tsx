"use client";

/**
 * components/finanzas/ReportesCobranzaClient.tsx
 *
 * Finanzas › Reportes de cobranza (rediseño 2026-10-03, docs/finanzas-rediseno-plan.md): Proyección, Reportes y Corte
 * quincenal, que eran pestañas de Cobranza. Cobranza quedó como la página de trabajo de quien registra; esto es lo que
 * mira quien supervisa. Los paneles son los mismos de antes: solo cambiaron de casa.
 */
import { useCallback, useState } from "react";
import { PageHeader, Tabs } from "@/components/ui";
import type { ColaCobroRow, ProyeccionIngresos, RiesgoPagoItem, SnapshotDTO, SnapshotSerieDTO } from "@/lib/cobranza";
import { fetchJson } from "@/lib/api/fetch-json";
import ProyeccionPanel from "@/components/cobranza/ProyeccionPanel";
import ReportesPanel from "@/components/cobranza/ReportesPanel";
import DigestPanel from "@/components/cobranza/DigestPanel";

type Pestana = "proyeccion" | "reportes" | "corte";

export default function ReportesCobranzaClient({
  initialProyeccion,
  initialSeries,
  initialRiesgo,
  initialSnapshot,
  cola,
  role,
  todayISO,
}: {
  initialProyeccion: ProyeccionIngresos;
  initialSeries: SnapshotSerieDTO[];
  initialRiesgo: RiesgoPagoItem[];
  initialSnapshot: SnapshotDTO | null;
  /** La cola de hoy: «Estado de hoy» de Reportes se calcula con ella. */
  cola: ColaCobroRow[];
  role: string;
  todayISO: string;
}) {
  const [tab, setTab] = useState<Pestana>("proyeccion");
  const [proyeccion, setProyeccion] = useState(initialProyeccion);
  const [series, setSeries] = useState(initialSeries);
  const [riesgo, setRiesgo] = useState(initialRiesgo);

  const refreshProyeccion = useCallback(async () => {
    try {
      const d = await fetchJson<{ proyeccion: ProyeccionIngresos }>("/api/cobranza/proyeccion");
      setProyeccion(d.proyeccion);
    } catch {}
  }, []);

  /* Después de un corte, las tendencias tienen un punto más. */
  const refreshReportes = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        fetchJson<{ series: SnapshotSerieDTO[] }>("/api/cobranza/series"),
        fetchJson<{ riesgo: RiesgoPagoItem[] }>("/api/cobranza/riesgo"),
      ]);
      setSeries(s.series);
      setRiesgo(r.riesgo);
    } catch {}
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader recorrido="finanzas-reportes"
        title="Reportes de cobranza"
        description="Lo que va a entrar en las próximas quincenas, cómo se mueve lo vencido y el corte de cada quincena."
      />
      <div data-recorrido="fin.reportes.pestanas">
      <Tabs
        aria-label="Reportes de cobranza"
        variant="underline"
        value={tab}
        onChange={(k) => setTab(k as Pestana)}
        items={[
          { key: "proyeccion", label: "Proyección", title: "Lo que va a entrar, quincena por quincena." },
          { key: "reportes", label: "Reportes", title: "Cómo se mueve lo vencido y cuánto tarda cobrar." },
          { key: "corte", label: "Corte quincenal", title: "La foto de cada quincena: qué apareció y qué se resolvió." },
        ]}
      />
      </div>
      {tab === "proyeccion" && <ProyeccionPanel proyeccion={proyeccion} onRefresh={refreshProyeccion} />}
      {tab === "reportes" && <ReportesPanel series={series} riesgo={riesgo} role={role} cola={cola} todayISO={todayISO} />}
      {tab === "corte" && <DigestPanel initialSnapshot={initialSnapshot} onDigestDone={refreshReportes} todayISO={todayISO} />}
    </div>
  );
}
