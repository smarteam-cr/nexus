"use client";

/**
 * components/finanzas/IngresoVariableForm.tsx — registrar/editar un INGRESO
 * VARIABLE: plata que entró fuera del ciclo quincenal y que NO cuelga de un
 * servicio contratado.
 *
 * ⚠ Por qué no reusa `RegistrarPagoManualDialog`: ese crea un `Cobro`, y el
 * schema de Cobro exige `servicioId` y `cuentaId` OBLIGATORIOS — o sea, exige
 * cliente Y servicio configurado. Un ingreso "de forma general" (una comisión
 * suelta, un reembolso, una venta puntual sin contrato) no entra ahí sin
 * inventarle un servicio fantasma que ensuciaría cartera, semáforo y proyección.
 * Por eso el cliente acá es OPCIONAL.
 *
 * Drawer presentacional: al guardar llama onSaved() y el contenedor re-fetchea.
 */
import { useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { IngresoVariableRow } from "@/lib/cobranza";
import { Drawer } from "@/components/ui";
import { INPUT_CLS, SELECT_CLS, LABEL_CLS } from "@/components/cobranza/format";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function IngresoVariableForm({
  ingreso,
  clientes,
  todayISO,
  onClose,
  onSaved,
}: {
  /** null = registrar; con valor = editar (solo filas propias, tipo REGISTRADO). */
  ingreso: IngresoVariableRow | null;
  clientes: Array<{ id: string; name: string }>;
  todayISO: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [concepto, setConcepto] = useState(ingreso?.concepto ?? "");
  const [monto, setMonto] = useState(ingreso ? String(ingreso.monto) : "");
  const [moneda, setMoneda] = useState(ingreso?.moneda ?? "USD");
  const [fecha, setFecha] = useState(ingreso?.fechaCobro ?? todayISO);
  const [clientId, setClientId] = useState(ingreso?.clientId ?? "");
  const [notas, setNotas] = useState(ingreso?.notas ?? "");
  const [saving, setSaving] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const montoNum = Number(monto);
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;
  const puedeGuardar = concepto.trim().length > 0 && montoValido && !!fecha && !saving;

  async function submit() {
    if (!puedeGuardar) return;
    setSaving(true);
    setServerError(null);
    const body = {
      concepto: concepto.trim(),
      monto: round2(montoNum), // el Zod exige multipleOf 0.01
      moneda,
      fecha,
      clientId: clientId || null, // "" = ingreso general, sin cliente
      notas: notas.trim() ? notas.trim() : null,
    };
    try {
      if (ingreso) {
        await fetchJson(`/api/cobranza/ingresos-variables/${ingreso.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetchJson("/api/cobranza/ingresos-variables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : "No se pudo guardar el ingreso. Prueba de nuevo.",
      );
      setSaving(false);
    }
  }

  async function borrar() {
    if (!ingreso) return;
    setBorrando(true);
    setServerError(null);
    try {
      await fetchJson(`/api/cobranza/ingresos-variables/${ingreso.id}`, { method: "DELETE" });
      onSaved();
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : "No se pudo borrar el ingreso. Prueba de nuevo.",
      );
      setBorrando(false);
    }
  }

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={ingreso ? "Editar ingreso" : "Registrar ingreso"}
      description="Plata que entró fuera del ciclo quincenal, sin servicio contratado detrás."
      footer={
        <>
          {/* El boton se queda MONTADO y deshabilitado: cambiarlo por un span
              perdia el `mr-auto` y el pie entero saltaba mientras corria el
              DELETE (el footer del Drawer es justify-end). */}
          {ingreso && (
            <button
              type="button"
              onClick={borrar}
              disabled={borrando}
              className="text-xs text-red-600 hover:text-red-500 px-2 py-1.5 mr-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {borrando ? "Borrando…" : "Borrar"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-fg-muted hover:text-fg px-2 py-1.5"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!puedeGuardar}
            onClick={submit}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Guardando…" : ingreso ? "Guarda los cambios" : "Registra el ingreso"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={LABEL_CLS}>Concepto</label>
          <input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej. Reembolso, venta puntual, cuenta rescatada…"
            maxLength={160}
            className={INPUT_CLS}
            autoFocus
          />
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
              <option value="USD">USD ($)</option>
              <option value="CRC">CRC (₡)</option>
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL_CLS}>Fecha en que entró</label>
          <input
            type="date"
            value={fecha}
            max={todayISO}
            onChange={(e) => setFecha(e.target.value)}
            className={INPUT_CLS}
          />
          <p className="text-[11px] text-fg-muted mt-1">
            La fecha real del ingreso — se registra días después, no siempre es hoy.
          </p>
        </div>

        <div>
          <label className={LABEL_CLS}>Cliente (opcional)</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">Ingreso general (sin cliente)</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-fg-muted mt-1">
            Relaciónalo con un cliente si la plata vino de una cuenta; déjalo general si no.
          </p>
        </div>

        <div>
          <label className={LABEL_CLS}>Notas (opcional)</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="De dónde vino, con qué se relaciona…"
            className={`${INPUT_CLS} resize-y`}
          />
        </div>

        {/* La regla que evita el doble conteo, dicha donde se decide. */}
        <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[11px] text-fg-muted">
          Si la plata vino de un <strong className="text-fg-secondary">servicio contratado</strong>,
          no va acá: se registra como pago en Cobranza y aparece solo en esta lista.
        </div>

        {serverError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600">
            {serverError}
          </div>
        )}
      </div>
    </Drawer>
  );
}
