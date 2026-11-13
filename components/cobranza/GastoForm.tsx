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
import { Drawer, Segmentado, Selector } from "@/components/ui";
import {
  ETIQUETA_RUBRO,
  ETIQUETA_TIPO,
  RUBROS_DE_GASTO,
  RUBROS_PERMITIDOS,
  TIPOS_DE_GASTO,
  avisosDelGasto,
  rubroDe,
  tipoDe,
  type RubroDeGasto,
  type TipoDeGasto,
} from "@/lib/finanzas/reglas-de-gasto";
import { INPUT_CLS, SELECT_CLS, LABEL_CLS } from "./format";
import TagsInput from "./TagsInput";

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function GastoForm({
  gasto,
  todayISO,
  allGastos,
  apiBase = "/api/cobranza/gastos",
  onClose,
  onSaved,
}: {
  /** La ruta contra la que guarda. Gastos del mes (rediseño de Finanzas, 2026-10-03) usa /api/finanzas/gastos. */
  apiBase?: string;
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
  // Las reglas de gasto (2026-11-13, lib/finanzas/reglas-de-gasto.ts): qué clase de gasto es, en qué fue y si se avisó.
  const [tipo, setTipo] = useState<TipoDeGasto>(tipoDe(gasto?.tipo));
  const [rubro, setRubro] = useState<RubroDeGasto | null>(rubroDe(gasto?.rubro));
  const [avisoPrevio, setAvisoPrevio] = useState(gasto?.avisoPrevio ?? false);
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
  // Lo que la regla diría de este gasto, mientras se llena (la factura se pide aparte, en la lista).
  const avisosDeLaRegla = avisosDelGasto(
    { fecha, tipo, rubro, avisoPrevio, comprobante: "-", pasoAFijo: !!gasto?.pasoAFijo },
    todayISO,
  );

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
      tipo,
      rubro,
      avisoPrevio: tipo === "REPRESENTACION" ? avisoPrevio : false,
    };
    try {
      if (gasto) {
        await fetchJson(`${apiBase}/${gasto.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetchJson(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : "No se pudo guardar el gasto. Prueba de nuevo.",
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
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-fg hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Guardando…" : gasto ? "Guarda los cambios" : "Agrega el gasto"}
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
          <label className={LABEL_CLS}>Qué clase de gasto es</label>
          <Segmentado
            etiqueta="Qué clase de gasto es"
            opciones={TIPOS_DE_GASTO.map((t) => ({ clave: t, etiqueta: ETIQUETA_TIPO[t] }))}
            valor={tipo}
            onCambio={setTipo}
            lleno
          />
          <p className="text-[11px] text-fg-muted mt-1">
            {tipo === "REPRESENTACION"
              ? "Representación: solo combustible, alimentación y equipo, y con aviso previo."
              : tipo === "TARJETA_CORPORATIVA"
                ? "Tarjeta corporativa: solo suscripciones y software. Una suscripción se vuelve fijo, con su presupuesto."
                : "Sin regla de rubro. Igual lleva su factura."}
          </p>
        </div>

        <div>
          <label className={LABEL_CLS}>En qué fue</label>
          <Selector
            etiqueta="En qué fue"
            placeholder="Elige en qué fue"
            opciones={RUBROS_DE_GASTO.map((r) => ({
              value: r,
              label: ETIQUETA_RUBRO[r],
              ...(tipo !== "OTRO" && !RUBROS_PERMITIDOS[tipo].includes(r) ? { hint: "Fuera de la regla de este tipo" } : {}),
            }))}
            valor={rubro}
            onElegir={(v) => setRubro(rubroDe(v))}
          />
        </div>

        {tipo === "REPRESENTACION" && (
          <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
            <input type="checkbox" checked={avisoPrevio} onChange={(e) => setAvisoPrevio(e.target.checked)} className="accent-current" />
            Se avisó antes de hacer el gasto
          </label>
        )}

        {avisosDeLaRegla.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs text-warn-ink">
            {avisosDeLaRegla.map((a) => (
              <li key={a.clave}>
                <span className="font-semibold">{a.rotulo}:</span> {a.texto} Se guarda igual y queda marcado.
              </li>
            ))}
          </ul>
        )}

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
