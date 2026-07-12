"use client";

/**
 * components/cobranza/CobranzaClient.tsx
 *
 * Contenedor client del módulo: 6 tabs in-page (useState local, no rutas) con
 * la COLA DE COBROS como landing — la vista de trabajo diaria de quien cobra.
 * TODO el estado de datos vive acá (cola, cartera, alertas, proyección, serie,
 * riesgo): los tabs desmontan y un useState local en el hijo volvería stale al
 * cambiar de tab y volver (fue el bug del doble "Configurar cuenta").
 *
 * También viven acá, porque los comparten varios tabs:
 *  - el CuentaDrawer (lo abren la cola, la tabla de clientes y las alertas),
 *  - el chokepoint client `registrarPago` (cola + buscador global → PATCH
 *    estado=COBRADO vía cambiarEstadoCobro, INV3 intacto),
 *  - el botón global "Registrar pago" (slot action del PageHeader) y sus
 *    modales (BuscarPagoModal → RegistrarPagoDialog).
 */
import { useCallback, useState } from "react";
import { PageHeader } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import type {
  AlertaDTO,
  CajaNetaDTO,
  CarteraRow,
  ColaCobroRow,
  CostoRecurrenteDTO,
  GastoPuntualDTO,
  ProyeccionIngresos,
  RiesgoPagoItem,
  SnapshotDTO,
  SnapshotSerieDTO,
} from "@/lib/cobranza";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import ColaCobros from "./ColaCobros";
import PanelCartera from "./PanelCartera";
import AlertasCobranza from "./AlertasCobranza";
import DigestPanel from "./DigestPanel";
import ProyeccionPanel from "./ProyeccionPanel";
import ReportesPanel from "./ReportesPanel";
import CostosPanel from "./CostosPanel";
import CajaNetaPanel from "./CajaNetaPanel";
import CuentaDrawer from "./CuentaDrawer";
import BuscarPagoModal from "./BuscarPagoModal";
import RegistrarPagoDialog from "./RegistrarPagoDialog";
import RegistrarPagoManualDialog from "./RegistrarPagoManualDialog";

type Tab =
  | "cobros"
  | "clientes"
  | "proyeccion"
  | "alertas"
  | "reportes"
  | "corte"
  | "costos"
  | "caja";

// superAdminOnly (privacidad, capa 3 de 3): el nav FILTRA estos tabs con
// isCostosRole — jamás comparar contra el literal "SUPER_ADMIN" acá.
const TABS: Array<{ key: Tab; label: string; superAdminOnly?: boolean }> = [
  { key: "cobros", label: "Cobros" },
  { key: "clientes", label: "Clientes" },
  { key: "proyeccion", label: "Proyección" },
  { key: "alertas", label: "Alertas" },
  { key: "reportes", label: "Reportes" },
  { key: "corte", label: "Corte semanal" },
  { key: "costos", label: "Costos y gastos", superAdminOnly: true },
  { key: "caja", label: "Caja neta", superAdminOnly: true },
];

const porFecha = (a: ColaCobroRow, b: ColaCobroRow) =>
  a.fechaProgramada.localeCompare(b.fechaProgramada) || a.id.localeCompare(b.id);

export default function CobranzaClient({
  initialCola,
  initialCartera,
  initialAlertas,
  initialSnapshot,
  initialProyeccion,
  initialSeries,
  initialRiesgo,
  initialCostos,
  initialCajaNeta,
  initialGastos,
  role,
  todayISO,
}: {
  initialCola: ColaCobroRow[];
  initialCartera: CarteraRow[];
  initialAlertas: AlertaDTO[];
  initialSnapshot: SnapshotDTO | null;
  initialProyeccion: ProyeccionIngresos;
  initialSeries: SnapshotSerieDTO[];
  initialRiesgo: RiesgoPagoItem[];
  // null para todo rol que no sea SUPER_ADMIN (la page ni ejecuta las queries).
  initialCostos: CostoRecurrenteDTO[] | null;
  initialCajaNeta: CajaNetaDTO | null;
  initialGastos: GastoPuntualDTO[] | null;
  role: string;
  todayISO: string;
}) {
  const toast = useToast();
  const canCostos = isCostosRole(role);
  const [tab, setTab] = useState<Tab>("cobros");
  const [cola, setCola] = useState(initialCola);
  const [cartera, setCartera] = useState(initialCartera);
  const [alertas, setAlertas] = useState(initialAlertas);
  const [proyeccion, setProyeccion] = useState(initialProyeccion);
  const [series, setSeries] = useState(initialSeries);
  const [riesgo, setRiesgo] = useState(initialRiesgo);
  const [costos, setCostos] = useState(initialCostos);
  const [cajaNeta, setCajaNeta] = useState(initialCajaNeta);
  const [gastos, setGastos] = useState(initialGastos);

  // UI compartida entre tabs (drawer + flujo global de registrar pago).
  const [openCuentaId, setOpenCuentaId] = useState<string | null>(null);
  const [pagoTarget, setPagoTarget] = useState<ColaCobroRow | null>(null);
  const [buscadorOpen, setBuscadorOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  // Cuentas configuradas para el pago manual (fuente = el cartera ya cargado).
  const cuentasConfiguradas = cartera
    .filter((r) => r.cuentaId !== null)
    .map((r) => ({ cuentaId: r.cuentaId as string, clienteNombre: r.clienteNombre }));

  // Badge del tab: solo lo OPERATIVO abierto — el backlog de configuración
  // (CUENTA_SIN_DATOS) no es urgencia del día.
  const abiertas = alertas.filter(
    (a) => a.estado === "ABIERTA" && a.tipo !== "CUENTA_SIN_DATOS",
  ).length;

  // ── Refresh best-effort por dataset (si falla, el tab conserva lo que tenía) ──
  const refreshCola = useCallback(async () => {
    try {
      const d = await fetchJson<{ cola: ColaCobroRow[] }>("/api/cobranza/cola");
      setCola(d.cola);
    } catch {}
  }, []);

  const refreshCartera = useCallback(async () => {
    try {
      const d = await fetchJson<{ rows: CarteraRow[] }>("/api/cobranza/cuentas");
      setCartera(d.rows);
    } catch {}
  }, []);

  const refreshAlertas = useCallback(async () => {
    try {
      const d = await fetchJson<{ alertas: AlertaDTO[] }>(
        "/api/cobranza/alertas?estados=ABIERTA,VISTA",
      );
      setAlertas(d.alertas);
    } catch {}
  }, []);

  const refreshProyeccion = useCallback(async () => {
    try {
      const d = await fetchJson<{ proyeccion: ProyeccionIngresos }>("/api/cobranza/proyeccion");
      setProyeccion(d.proyeccion);
    } catch {}
  }, []);

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

  // Costos/caja neta: early-return por rol — un no-SUPER_ADMIN jamás dispara
  // estos fetches (cero 403s de fondo). Los call sites llaman sin gatear.
  const refreshCostos = useCallback(async () => {
    if (!canCostos) return;
    try {
      const d = await fetchJson<{ costos: CostoRecurrenteDTO[] }>("/api/cobranza/costos");
      setCostos(d.costos);
    } catch {}
  }, [canCostos]);

  const refreshCajaNeta = useCallback(async () => {
    if (!canCostos) return;
    try {
      const d = await fetchJson<{ cajaNeta: CajaNetaDTO }>("/api/cobranza/caja-neta");
      setCajaNeta(d.cajaNeta);
    } catch {}
  }, [canCostos]);

  const refreshGastos = useCallback(async () => {
    if (!canCostos) return;
    try {
      const d = await fetchJson<{ gastos: GastoPuntualDTO[] }>("/api/cobranza/gastos");
      setGastos(d.gastos);
    } catch {}
  }, [canCostos]);

  const onDigestDone = useCallback(() => {
    void refreshAlertas();
    void refreshReportes();
    void refreshCola();
    void refreshCajaNeta();
  }, [refreshAlertas, refreshReportes, refreshCola, refreshCajaNeta]);

  /**
   * CHOKEPOINT client de registrar pago (cola + buscador global): optimista en
   * la cola (la fila sale YA, los cards se recalculan solos), PATCH al server
   * (cambiarEstadoCobro — INV3), revert + toast si falla. La cartera/proyección/
   * riesgo se re-fetchean best-effort (su semáforo depende de TODOS los cobros
   * de la cuenta — jamás se parchea a mano).
   */
  const registrarPago = useCallback(
    async (row: ColaCobroRow, data: { fechaCobro: string; referenciaExterna: string | null }) => {
      setCola((rs) => rs.filter((r) => r.id !== row.id));
      try {
        await fetchJson(`/api/cobranza/cobros/${row.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: "COBRADO", ...data }),
        });
        toast.success("Pago registrado a tu nombre.");
        void refreshCola();
        void refreshCartera();
        void refreshProyeccion();
        void refreshReportes();
        void refreshCajaNeta();
      } catch (e) {
        setCola((rs) => [...rs, row].sort(porFecha));
        toast.error(e instanceof ApiError ? e.message : "No se pudo registrar el pago.");
      }
    },
    [toast, refreshCola, refreshCartera, refreshProyeccion, refreshReportes, refreshCajaNeta],
  );

  return (
    <div>
      <PageHeader
        title="Cobranza"
        description="Registrá los pagos que entran, mirá qué está vencido y llevá el control de cada cliente."
        action={
          <button
            type="button"
            onClick={() => setBuscadorOpen(true)}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
          >
            Registrar pago
          </button>
        }
      />

      <div className="flex flex-wrap gap-1 border-b border-line mb-6">
        {TABS.filter((t) => !t.superAdminOnly || canCostos).map((t) => {
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

      {tab === "cobros" && (
        <ColaCobros
          rows={cola}
          setRows={setCola}
          riesgo={riesgo}
          todayISO={todayISO}
          onRegistrarPago={setPagoTarget}
          onOpenCuenta={setOpenCuentaId}
        />
      )}
      {tab === "clientes" && (
        <PanelCartera
          rows={cartera}
          todayISO={todayISO}
          onOpenCuenta={setOpenCuentaId}
          onRefresh={refreshCartera}
        />
      )}
      {tab === "proyeccion" && <ProyeccionPanel proyeccion={proyeccion} onRefresh={refreshProyeccion} />}
      {tab === "alertas" && (
        <AlertasCobranza alertas={alertas} setAlertas={setAlertas} onOpenCuenta={setOpenCuentaId} />
      )}
      {tab === "reportes" && <ReportesPanel series={series} riesgo={riesgo} role={role} />}
      {tab === "corte" && (
        <DigestPanel initialSnapshot={initialSnapshot} onDigestDone={onDigestDone} />
      )}
      {/* Doble candado (privacidad): además del filtro del nav, el body exige
          rol + datos — forzar el tab por devtools renderiza NADA. */}
      {tab === "costos" && canCostos && costos && gastos && (
        <CostosPanel
          costos={costos}
          gastos={gastos}
          todayISO={todayISO}
          onCostosChanged={() => {
            void refreshCostos();
            void refreshCajaNeta();
          }}
          onGastosChanged={() => {
            void refreshGastos();
            void refreshCajaNeta();
          }}
        />
      )}
      {tab === "caja" && canCostos && cajaNeta && (
        <CajaNetaPanel cajaNeta={cajaNeta} series={series} onRefresh={refreshCajaNeta} />
      )}

      {/* ── Superficies compartidas entre tabs ── */}
      <CuentaDrawer
        cuentaId={openCuentaId}
        todayISO={todayISO}
        onClose={() => {
          setOpenCuentaId(null);
          // El drawer pudo cambiar cobros/estados → re-sincronizar lo visible.
          void refreshCola();
          void refreshCartera();
          void refreshProyeccion();
          void refreshCajaNeta();
        }}
      />

      {buscadorOpen && (
        <BuscarPagoModal
          rows={cola}
          onClose={() => setBuscadorOpen(false)}
          onSelect={(row) => {
            setBuscadorOpen(false);
            setPagoTarget(row);
          }}
          onManual={() => {
            setBuscadorOpen(false);
            setManualOpen(true);
          }}
        />
      )}

      {pagoTarget && (
        <RegistrarPagoDialog
          cobro={pagoTarget}
          todayISO={todayISO}
          onCancel={() => setPagoTarget(null)}
          onConfirm={(data) => {
            const target = pagoTarget;
            setPagoTarget(null);
            void registrarPago(target, data);
          }}
        />
      )}

      {manualOpen && (
        <RegistrarPagoManualDialog
          cuentas={cuentasConfiguradas}
          todayISO={todayISO}
          onCancel={() => setManualOpen(false)}
          onDone={() => {
            setManualOpen(false);
            void refreshCola();
            void refreshCartera();
            void refreshProyeccion();
            void refreshReportes();
            void refreshCajaNeta();
          }}
          onOpenCuenta={(id) => {
            setManualOpen(false);
            setOpenCuentaId(id);
          }}
        />
      )}
    </div>
  );
}
