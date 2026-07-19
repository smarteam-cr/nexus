"use client";

/**
 * components/cobranza/GastoForm.tsx — crear/editar un GASTO PUNTUAL (fase 4.5,
 * SUPER_ADMIN). Un gasto único y circunstancial (un evento, una compra puntual) —
 * NO es un costo recurrente. Fecha FUTURA = compra planificada → entra a la caja
 * neta (lado sale); fecha PASADA = solo registro/reporting. Los tags son de
 * vocabulario abierto (se normalizan a slug). Drawer presentacional (primitiva
 * de components/ui; el padre lo monta condicionalmente): al guardar llama
 * onSaved() y el contenedor re-fetchea (sin optimista).
 */
import { useMemo, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { GastoPuntualDTO } from "@/lib/cobranza";
import { Drawer } from "@/components/ui";
import { INPUT_CLS, SELECT_CLS, LABEL_CLS } from "./format";
import TagsInput from "./TagsInput";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function GastoForm({
  gasto,
  todayISO,
  allGastos,
  onClose,
  onSaved,
}: {
  /** null = crear; con valor = editar. */
  gasto: GastoPuntualDTO | null;
  todayISO: string;
  allGastos: GastoPuntualDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(gasto?.nombre ?? "");
  const [monto, setMonto] = useState(gasto ? String(gasto.monto) : "");
  const [moneda, setMoneda] = useState(gasto?.moneda ?? "CRC");
  const [fecha, setFecha] = useState(gasto?.fecha ?? todayISO);
  const [tags, setTags] = useState<string[]>(gasto?.tags ?? []);
  const [notas, setNotas] = useState(gasto?.notas ?? "");
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Sugerencias de tags = los slugs distintos ya usados en el resto de los gastos.
  const sugerencias = useMemo(() => {
    const set = new Set<string>();
    for (const g of allGastos) for (const t of g.tags) set.add(t);
    return [...set].sort();
  }, [allGastos]);

  const montoNum = Number(monto);
  const montoValido = Number.isFinite(montoNum) && montoNum > 0;
  const puedeGuardar = nombre.trim().length > 0 && montoValido && !!fecha && !saving;
  const esPlanificado = !!fecha && fecha > todayISO;

  async function submit() {
    if (!puedeGuardar) return;
    setSaving(true);
    setServerError(null);
    const body = {
      nombre: nombre.trim(),
      monto: round2(montoNum), // el Zod exige multipleOf 0.01
      moneda,
      fecha,
      tags,
      notas: notas.trim() ? notas.trim() : null,
    };
    try {
      if (gasto) {
        await fetchJson(`/api/cobranza/gastos/${gasto.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetchJson("/api/cobranza/gastos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : "No se pudo guardar el gasto. Probá de nuevo.",
      );
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={gasto ? "Editar gasto" : "Agregar gasto"}
      description="Gasto único y circunstancial — referencia estimada, no contabilidad."
      footer={
        <>
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
            {saving ? "Guardando…" : gasto ? "Guardá los cambios" : "Agregá el gasto"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={LABEL_CLS}>Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Evento en San José"
            maxLength={120}
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
              <option value="CRC">CRC (₡)</option>
              <option value="USD">USD ($)</option>
            </select>
          </div>
        </div>

        <div>
          <label className={LABEL_CLS}>Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={INPUT_CLS}
          />
          <p className="text-[11px] text-fg-muted mt-1">
            Fecha futura = compra planificada: entra a la caja neta. Fecha pasada = solo registro.
          </p>
          {esPlanificado && (
            <span className="inline-flex items-center mt-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-600">
              Planificado
            </span>
          )}
        </div>

        <div>
          <label className={LABEL_CLS}>Tags</label>
          <TagsInput value={tags} onChange={setTags} suggestions={sugerencias} />
        </div>

        <div>
          <label className={LABEL_CLS}>Notas (opcional)</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Contexto del gasto…"
            className={`${INPUT_CLS} resize-y`}
          />
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
