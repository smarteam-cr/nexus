"use client";

/**
 * components/finanzas/ComisionesPartnerPanel.tsx
 *
 * Lo que Smarteam GANA de cada aliado comercial. Es un INGRESO: superficie ADMIN
 * (gate `cobranza.read`), al lado de Ingresos variables.
 *
 * ⚠ Este panel NUNCA muestra comisiones de VENDEDOR. Son remuneración de una
 * persona, viven en otra ruta con otro guard y las carga otro loader.
 *
 * ⚠ Los totales van por moneda SEPARADA, también los de cada partner: CRC y USD
 * no se suman en ningún lado del módulo.
 */

import { useState } from "react";
import type { ComisionesPartnerDTO } from "@/lib/cobranza";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Button, PageHeader, EmptyState, Modal, Field, Input, Select } from "@/components/ui";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import { COBRANZA_MONEDAS } from "@/lib/cobranza/schema";

interface ClienteLite {
  id: string;
  name: string;
  kind: string;
}

interface Props {
  initial: ComisionesPartnerDTO;
  clientes: ClienteLite[];
}

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-fg-muted";
const TD = "px-3 py-2 text-xs text-fg";

type FormState = {
  partner: string;
  concepto: string;
  monto: string;
  moneda: string;
  fecha: string;
  clientId: string;
  notas: string;
};

export default function ComisionesPartnerPanel({ initial, clientes }: Props) {
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [form, setForm] = useState<FormState | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function refrescar() {
    try {
      const r = await fetchJson<{ data: ComisionesPartnerDTO }>("/api/cobranza/comisiones-partner");
      setData(r.data);
    } catch {
      toast.error("No se pudo refrescar la lista. Recargá la página.");
    }
  }

  async function guardar() {
    if (!form) return;
    const monto = Number(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("El monto tiene que ser un número positivo.");
      return;
    }
    const body = {
      partner: form.partner.trim(),
      concepto: form.concepto.trim() || null,
      monto,
      moneda: form.moneda,
      fecha: form.fecha,
      clientId: form.clientId || null,
      notas: form.notas.trim() || null,
    };
    setGuardando(true);
    try {
      await fetchJson(
        editandoId
          ? `/api/cobranza/comisiones-partner/${editandoId}`
          : "/api/cobranza/comisiones-partner",
        {
          method: editandoId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setForm(null);
      setEditandoId(null);
      await refrescar();
      toast.success(editandoId ? "Comisión actualizada." : "Comisión registrada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la comisión.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    try {
      await fetchJson(`/api/cobranza/comisiones-partner/${id}`, { method: "DELETE" });
      await refrescar();
      toast.success("Comisión eliminada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar la comisión.");
    }
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones de partner"
        description="Lo que Smarteam gana con cada aliado comercial. Es un ingreso — no entra a la caja neta todavía."
        action={
          <Button
            onClick={() => {
              setEditandoId(null);
              setForm({
                partner: "",
                concepto: "",
                monto: "",
                moneda: "USD",
                fecha: hoy,
                clientId: "",
                notas: "",
              });
            }}
          >
            Registrar comisión
          </Button>
        }
      />

      {data.porPartner.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.porPartner.map((p) => (
            <div
              key={`${p.partner}-${p.moneda}`}
              className="rounded-xl border border-line bg-surface px-3 py-2"
            >
              <p className="text-[11px] font-medium text-fg-secondary truncate">{p.partner}</p>
              <p className="mt-0.5 text-sm text-fg tabular-nums">
                {fmtMonto(p.total, p.moneda as "CRC" | "USD")}
              </p>
              <p className="text-[11px] text-fg-muted">
                {p.cuantas} pago{p.cuantas === 1 ? "" : "s"} · {p.moneda}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
        <p className="text-[11px] text-fg-muted">
          Total del período:{" "}
          {Object.keys(data.totales).length === 0 ? (
            <span className="text-fg-secondary">—</span>
          ) : (
            <span className="text-fg-secondary tabular-nums">
              {Object.entries(data.totales)
                .map(([m, v]) => fmtMonto(v, m as "CRC" | "USD"))
                .join(" · ")}
            </span>
          )}{" "}
          · CRC y USD nunca se suman entre sí
        </p>
      </div>

      {data.comisiones.length === 0 ? (
        <EmptyState
          title="Todavía no hay comisiones registradas"
          description="Registrá lo que cada aliado te paga y aparece acá, agrupado por partner."
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-surface-muted border-b border-line">
              <tr>
                <th className={TH}>Partner</th>
                <th className={TH}>Concepto</th>
                <th className={TH}>Fecha</th>
                <th className={`${TH} text-right`}>Monto</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {data.comisiones.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td className={TD}>
                    {c.partner}
                    {c.clienteNombre && (
                      <span className="ml-1.5 text-[11px] text-fg-muted">· {c.clienteNombre}</span>
                    )}
                  </td>
                  <td className={`${TD} text-fg-secondary`}>{c.concepto ?? "—"}</td>
                  <td className={`${TD} text-fg-secondary whitespace-nowrap`}>{fmtFecha(c.fecha)}</td>
                  <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                    {fmtMonto(c.monto, c.moneda as "CRC" | "USD")}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditandoId(c.id);
                          setForm({
                            partner: c.partner,
                            concepto: c.concepto ?? "",
                            monto: String(c.monto),
                            moneda: c.moneda,
                            fecha: c.fecha,
                            clientId: c.clientId ?? "",
                            notas: c.notas ?? "",
                          });
                        }}
                      >
                        Editar
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => borrar(c.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal
          open
          onClose={() => {
            setForm(null);
            setEditandoId(null);
          }}
          title={editandoId ? "Editar comisión" : "Registrar comisión de partner"}
          description="Lo que te pagó un aliado comercial. Si el aliado no está en la cartera, dejá el cliente vacío."
        >
          <div className="space-y-3">
            <Field label="Partner">
              <Input
                value={form.partner}
                onChange={(e) => setForm({ ...form, partner: e.target.value })}
                placeholder="Ej. HubSpot"
              />
            </Field>
            <Field label="Concepto">
              <Input
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                placeholder="Ej. Comisión Q1"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Monto">
                <Input
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  inputMode="decimal"
                />
              </Field>
              <Field label="Moneda">
                <Select
                  value={form.moneda}
                  onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                >
                  {COBRANZA_MONEDAS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Fecha">
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Cliente (opcional)" hint="Solo si el aliado ya existe en la cartera.">
              <Select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">Sin ligar a un cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.kind === "ALIADO" ? " (aliado)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notas">
              <Input
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(null);
                  setEditandoId(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={guardar} disabled={guardando || !form.partner.trim()}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
