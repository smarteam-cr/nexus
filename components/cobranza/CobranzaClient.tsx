"use client";

/**
 * components/cobranza/CobranzaClient.tsx
 *
 * Contenedor client del módulo: 3 tabs in-page (useState local, no rutas) con
 * la COLA DE COBROS como landing — la vista de trabajo diaria de quien cobra.
 * TODO el estado de datos vive acá (cola, cartera, alertas, riesgo): los tabs
 * desmontan y un useState local en el hijo volvería stale al cambiar de tab y
 * volver (fue el bug del doble "Configurar cuenta").
 *
 * Rediseño de Finanzas (2026-10-03, docs/finanzas-rediseno-plan.md): Cobranza es la página de TRABAJO de quien registra.
 * Proyección, Reportes y Corte quincenal se mudaron a Finanzas › Reportes de cobranza (son de quien supervisa); Aliados
 * vive en Finanzas › Comisiones de aliados; Odoo y Mercury, en Conciliación e Integraciones.
 *
 * También viven acá, porque los comparten varios tabs:
 *  - el CuentaDrawer (lo abren la cola, la tabla de clientes y las alertas),
 *  - el chokepoint client `registrarPago` (cola + buscador global → PATCH
 *    estado=COBRADO vía cambiarEstadoCobro, INV3 intacto),
 *  - el botón global "Registrar pago" (slot action del PageHeader) y sus
 *    modales (BuscarPagoModal → RegistrarPagoDialog).
 */
import { useCallback, useState } from "react";
import { Button, PageHeader } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import type {
  AlertaDTO,
  CarteraRow,
  ColaCobroRow,
  RiesgoPagoItem,
} from "@/lib/cobranza";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { esAlertaDeRecurrencia } from "@/lib/cobranza/engine";
import ColaCobros from "./ColaCobros";
import PanelCartera from "./PanelCartera";
import AlertasCobranza from "./AlertasCobranza";
import CuentaDrawer from "./CuentaDrawer";
import BuscarPagoModal from "./BuscarPagoModal";
import RegistrarPagoDialog from "./RegistrarPagoDialog";
import RegistrarPagoManualDialog from "./RegistrarPagoManualDialog";

type Tab = "cobros" | "clientes" | "alertas";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "cobros", label: "Cobros" },
  { key: "clientes", label: "Clientes" },
  { key: "alertas", label: "Alertas" },
];

const porFecha = (a: ColaCobroRow, b: ColaCobroRow) =>
  a.fechaProgramada.localeCompare(b.fechaProgramada) || a.id.localeCompare(b.id);

export default function CobranzaClient({
  initialCola,
  initialCartera,
  initialAlertas,
  initialRiesgo,
  puedeEditar,
  abrirPago = false,
  todayISO,
}: {
  initialCola: ColaCobroRow[];
  initialCartera: CarteraRow[];
  initialAlertas: AlertaDTO[];
  initialRiesgo: RiesgoPagoItem[];
  /** `cobranza.write` resuelto en el servidor. Decide qué se DIBUJA, no qué se permite. */
  puedeEditar: boolean;
  /** Abrir el buscador de «Registrar pago» al entrar (llega desde Pendientes). */
  abrirPago?: boolean;
  todayISO: string;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("cobros");
  const [cola, setCola] = useState(initialCola);
  const [cartera, setCartera] = useState(initialCartera);
  const [alertas, setAlertas] = useState(initialAlertas);
  const [riesgo, setRiesgo] = useState(initialRiesgo);

  // UI compartida entre tabs (drawer + flujo global de registrar pago).
  const [openCuentaId, setOpenCuentaId] = useState<string | null>(null);
  const [pagoTarget, setPagoTarget] = useState<ColaCobroRow | null>(null);
  const [buscadorOpen, setBuscadorOpen] = useState(abrirPago);
  const [manualOpen, setManualOpen] = useState(false);

  // Cuentas configuradas para el pago manual (fuente = el cartera ya cargado).
  const cuentasConfiguradas = cartera
    .filter((r) => r.cuentaId !== null)
    .map((r) => ({ cuentaId: r.cuentaId as string, clienteNombre: r.clienteNombre }));

  // Badge del tab: solo lo OPERATIVO abierto — el backlog de configuración
  // (CUENTA_SIN_DATOS) no es urgencia del día. La recurrencia que se apaga sí (etapa 14).
  const abiertas = alertas.filter(
    (a) => a.estado === "ABIERTA" && (a.tipo !== "CUENTA_SIN_DATOS" || esAlertaDeRecurrencia(a)),
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

  /* El riesgo de pago de cada cliente: lo usa la cola para marcar «en riesgo». */
  const refreshRiesgo = useCallback(async () => {
    try {
      const r = await fetchJson<{ riesgo: RiesgoPagoItem[] }>("/api/cobranza/riesgo");
      setRiesgo(r.riesgo);
    } catch {}
  }, []);

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
        void refreshRiesgo();
      } catch (e) {
        setCola((rs) => [...rs, row].sort(porFecha));
        toast.error(e instanceof ApiError ? e.message : "No se pudo registrar el pago.");
      }
    },
    [toast, refreshCola, refreshCartera, refreshRiesgo],
  );

  return (
    <div>
      <PageHeader
        title="Cobranza"
        description="Registra los pagos que entran, mira qué está vencido y lleva el control de cada cliente."
        action={
          <Button variant="primary" onClick={() => setBuscadorOpen(true)}>
            Registrar pago
          </Button>
        }
      />

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
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] px-1 py-px rounded-full text-[10px] font-semibold text-danger-ink bg-danger-surface border border-danger-line">
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
      {tab === "alertas" && (
        <AlertasCobranza alertas={alertas} setAlertas={setAlertas} onOpenCuenta={setOpenCuentaId} />
      )}
      {/* ── Superficies compartidas entre tabs ── */}
      <CuentaDrawer
        cuentaId={openCuentaId}
        todayISO={todayISO}
        puedeEditar={puedeEditar}
        onClose={() => {
          setOpenCuentaId(null);
          // El drawer pudo cambiar cobros/estados → re-sincronizar lo visible.
          void refreshCola();
          void refreshCartera();
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
            void refreshRiesgo();
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
