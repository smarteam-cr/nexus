"use client";

/**
 * components/cobranza/RegistrarPagoManualDialog.tsx — registrar un pago que NO
 * salió de un plan. El schema exige que todo cobro cuelgue de un servicio, así
 * que el flujo es: elegir cliente (cuenta configurada) → servicio → monto,
 * moneda, fecha del pago (retroactiva), período y referencia → POST crea un
 * cobro MANUAL ya COBRADO (por el chokepoint, INV3). No hay pago flotante ni
 * alta al vuelo: si el cliente no tiene servicios, se lo manda a configurarlo.
 */
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { Modal, Spinner } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { CuentaDetailDTO } from "@/lib/cobranza";
import { TIPO_SERVICIO_LABEL } from "@/lib/cobranza/schema";
import { INPUT_CLS, SELECT_CLS, LABEL_CLS, ESTADO_SERVICIO_LABEL } from "./format";

interface CuentaOpcion {
  cuentaId: string;
  clienteNombre: string;
}
type Servicio = CuentaDetailDTO["servicios"][number];

export default function RegistrarPagoManualDialog({
  cuentas,
  todayISO,
  onCancel,
  onDone,
  onOpenCuenta,
}: {
  cuentas: CuentaOpcion[];
  todayISO: string;
  onCancel: () => void;
  onDone: () => void;
  onOpenCuenta: (cuentaId: string) => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [cuenta, setCuenta] = useState<CuentaOpcion | null>(null);
  const [servicios, setServicios] = useState<Servicio[] | null>(null); // null = sin cargar
  const [loadingServicios, setLoadingServicios] = useState(false);
  const [servicioId, setServicioId] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("CRC");
  const [fecha, setFecha] = useState(todayISO);
  const [periodo, setPeriodo] = useState(todayISO.slice(0, 7));
  const [referencia, setReferencia] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? cuentas.filter((c) => c.clienteNombre.toLowerCase().includes(needle))
      : cuentas;
    return [...list].sort((a, b) => a.clienteNombre.localeCompare(b.clienteNombre)).slice(0, 30);
  }, [cuentas, q]);

  async function elegirCuenta(c: CuentaOpcion) {
    setCuenta(c);
    setServicios(null);
    setServicioId("");
    setLoadingServicios(true);
    try {
      const d = await fetchJson<{ cuenta: CuentaDetailDTO }>(`/api/cobranza/cuentas/${c.cuentaId}`);
      const servs = d.cuenta.servicios;
      setServicios(servs);
      if (servs.length === 1) {
        setServicioId(servs[0].id);
        setMoneda(servs[0].moneda);
      }
    } catch {
      toast.error("No se pudieron cargar los servicios del cliente.");
      setServicios([]);
    } finally {
      setLoadingServicios(false);
    }
  }

  function elegirServicio(id: string) {
    setServicioId(id);
    const s = servicios?.find((x) => x.id === id);
    if (s) setMoneda(s.moneda);
  }

  const montoNum = Number(monto);
  const puedeGuardar =
    !!servicioId && Number.isFinite(montoNum) && montoNum > 0 && !!fecha && fecha <= todayISO && !submitting;

  async function submit() {
    if (!puedeGuardar) return;
    setSubmitting(true);
    try {
      await fetchJson("/api/cobranza/cobros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicioId,
          monto: Math.round(montoNum * 100) / 100,
          moneda,
          fechaCobro: fecha,
          periodo,
          referenciaExterna: referencia.trim() || null,
        }),
      });
      toast.success("Pago manual registrado a tu nombre.");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar el pago.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onCancel}
      z="z-[70]"
      title="Registrar un pago manual"
      description="Un pago que no salió de un plan. Se registra a tu nombre sobre un servicio del cliente."
      footer={
        <>
          <button type="button" onClick={onCancel} className="text-xs text-fg-muted hover:text-fg px-2 py-1.5">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!puedeGuardar}
            onClick={submit}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Registrando…" : "Registrar pago"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Paso 1: cliente */}
        {!cuenta ? (
          <div>
            <label className={LABEL_CLS}>Cliente</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscá el cliente…"
              className={INPUT_CLS}
              autoFocus
            />
            <ul className="mt-2 max-h-[38vh] overflow-y-auto divide-y divide-line rounded-lg border border-line">
              {matches.length === 0 ? (
                <li className="px-3 py-3 text-xs text-fg-muted text-center">Ningún cliente configurado matchea.</li>
              ) : (
                matches.map((c) => (
                  <li key={c.cuentaId}>
                    <button
                      type="button"
                      onClick={() => elegirCuenta(c)}
                      className="w-full text-left px-3 py-2 text-xs text-fg hover:bg-surface-hover transition-colors"
                    >
                      {c.clienteNombre}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : (
          <>
            {/* Cliente elegido + cambiar */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
              <span className="text-xs font-medium text-fg">{cuenta.clienteNombre}</span>
              <button
                type="button"
                onClick={() => {
                  setCuenta(null);
                  setServicios(null);
                  setServicioId("");
                }}
                className="text-[11px] text-fg-muted hover:text-fg"
              >
                Cambiar
              </button>
            </div>

            {/* Paso 2: servicio + campos */}
            {loadingServicios ? (
              <div className="flex items-center gap-2 text-xs text-fg-muted py-3">
                <Spinner /> Cargando servicios…
              </div>
            ) : servicios && servicios.length === 0 ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-3 space-y-2">
                <p className="text-xs text-amber-600">
                  Este cliente no tiene servicios configurados. Configuralo primero para poder
                  registrarle un pago.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenCuenta(cuenta.cuentaId)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
                >
                  Abrir cuenta
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className={LABEL_CLS}>Servicio</label>
                  <select value={servicioId} onChange={(e) => elegirServicio(e.target.value)} className={SELECT_CLS}>
                    <option value="">Elegí el servicio…</option>
                    {servicios?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {TIPO_SERVICIO_LABEL[s.tipoServicio] ?? s.tipoServicio}
                        {s.descripcion ? ` · ${s.descripcion}` : ""}
                        {s.estado !== "ACTIVO" ? ` (${ESTADO_SERVICIO_LABEL[s.estado] ?? s.estado})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Monto</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      placeholder="0.00"
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Moneda</label>
                    <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={SELECT_CLS}>
                      <option value="CRC">CRC (₡)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS}>¿Cuándo entró el pago?</label>
                    <input
                      type="date"
                      value={fecha}
                      max={todayISO}
                      onChange={(e) => {
                        setFecha(e.target.value);
                        if (e.target.value) setPeriodo(e.target.value.slice(0, 7));
                      }}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Período</label>
                    <input
                      type="month"
                      value={periodo}
                      onChange={(e) => setPeriodo(e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>

                <div>
                  <label className={LABEL_CLS}>Referencia externa (opcional)</label>
                  <input
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    placeholder="Id de transacción Mercury / factura Odoo"
                    maxLength={200}
                    className={INPUT_CLS}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
