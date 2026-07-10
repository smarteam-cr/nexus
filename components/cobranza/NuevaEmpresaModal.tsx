"use client";

/**
 * components/cobranza/NuevaEmpresaModal.tsx
 *
 * Alta de una empresa LIVIANA + su cuenta financiera desde el panel de cartera
 * (AccountSource "manual" — puerto 1). Para las cuentas que hoy viven solo en el
 * Sheet y no tienen proyecto en Nexus. Al crear, refresca la cartera y abre el
 * CuentaDrawer de la cuenta nueva para seguir configurando.
 */
import { useState } from "react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import {
  COBRANZA_TIPOS_CUENTA,
  COBRANZA_VIAS_COBRO,
  COBRANZA_MONEDAS,
  COBRANZA_TERMINOS_PAGO,
  TIPO_CUENTA_LABEL,
} from "@/lib/cobranza/schema";
import { VIA_COBRO_LABEL, TERMINOS_PAGO_LABEL, INPUT_CLS, SELECT_CLS, LABEL_CLS } from "./format";

export default function NuevaEmpresaModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Recibe el cuentaId nuevo para abrir el drawer + refrescar la cartera. */
  onCreated: (cuentaId: string) => void;
}) {
  const toast = useToast();
  const [nombre, setNombre] = useState("");
  const [dominio, setDominio] = useState("");
  const [correoCobro, setCorreoCobro] = useState("");
  const [tipo, setTipo] = useState("NACIONAL");
  const [viaCobro, setViaCobro] = useState("ODOO");
  const [moneda, setMoneda] = useState("CRC");
  const [terminosPago, setTerminosPago] = useState("ANTICIPADO");
  const [diaCobroAncla, setDiaCobroAncla] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setNombre("");
    setDominio("");
    setCorreoCobro("");
    setTipo("NACIONAL");
    setViaCobro("ODOO");
    setMoneda("CRC");
    setTerminosPago("ANTICIPADO");
    setDiaCobroAncla("");
  }

  async function crear() {
    if (saving) return;
    if (nombre.trim().length < 2) {
      toast.error("Indicá el nombre de la empresa.");
      return;
    }
    setSaving(true);
    try {
      const d = await fetchJson<{ cuentaId: string; clientCreado: boolean }>(
        "/api/cobranza/cuentas/crear-empresa",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: nombre.trim(),
            dominio: dominio.trim().toLowerCase() || null,
            correoCobro: correoCobro.trim().toLowerCase() || null,
            tipo,
            viaCobro,
            moneda,
            terminosPago,
            diaCobroAncla: diaCobroAncla.trim() ? Number(diaCobroAncla) : null,
          }),
        },
      );
      toast.success(
        d.clientCreado
          ? "Empresa creada con su cuenta. Completá los servicios."
          : "La empresa ya existía — se abrió su cuenta.",
      );
      reset();
      onCreated(d.cuentaId);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear la empresa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva empresa"
      description="Alta de una cuenta de cobro sin proyecto en Nexus (ej. suscripciones que hoy viven solo en el Sheet)."
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-xs text-fg-muted hover:text-fg px-2 py-1.5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={crear}
            disabled={saving}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50"
          >
            {saving ? "Creando…" : "Crear empresa"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={LABEL_CLS}>Nombre de la empresa</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Ferretería Noelitto"
            className={INPUT_CLS}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Dominio (opcional)</label>
            <input
              value={dominio}
              onChange={(e) => setDominio(e.target.value)}
              placeholder="empresa.com"
              className={INPUT_CLS}
            />
            <p className="mt-1 text-[10px] text-fg-muted">
              Con dominio, las sesiones del cliente se vinculan solas.
            </p>
          </div>
          <div>
            <label className={LABEL_CLS}>Correo de cobro (opcional)</label>
            <input
              value={correoCobro}
              onChange={(e) => setCorreoCobro(e.target.value)}
              placeholder="pagos@empresa.com"
              className={INPUT_CLS}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={SELECT_CLS}>
              {COBRANZA_TIPOS_CUENTA.map((t) => (
                <option key={t} value={t}>{TIPO_CUENTA_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Vía de cobro</label>
            <select value={viaCobro} onChange={(e) => setViaCobro(e.target.value)} className={SELECT_CLS}>
              {COBRANZA_VIAS_COBRO.map((t) => (
                <option key={t} value={t}>{VIA_COBRO_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Moneda</label>
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={SELECT_CLS}>
              {COBRANZA_MONEDAS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Términos de pago</label>
            <select value={terminosPago} onChange={(e) => setTerminosPago(e.target.value)} className={SELECT_CLS}>
              {COBRANZA_TERMINOS_PAGO.map((t) => (
                <option key={t} value={t}>{TERMINOS_PAGO_LABEL[t] ?? t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={LABEL_CLS}>Día de cobro ancla (1–31, opcional)</label>
          <input
            type="number"
            min={1}
            max={31}
            value={diaCobroAncla}
            onChange={(e) => setDiaCobroAncla(e.target.value)}
            placeholder="1–31 · vacío = día del arranque"
            className={INPUT_CLS}
          />
        </div>
      </div>
    </Modal>
  );
}
