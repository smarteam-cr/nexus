"use client";

/**
 * components/cobranza/ServicioForm.tsx
 *
 * Crear/editar un ServicioContratado + su plan de pago activo. Al elegir un
 * proyecto con anchorStartDate, pre-llena fechaInicioFacturacion (copia
 * editable — no se re-sincroniza; la divergencia la detecta ARRANQUE_CAMBIADO).
 * El plan tiene campos dinámicos por template; guardar hace POST/PATCH del
 * servicio + PUT del plan. "Generar cobros" es explícito y aparte.
 */
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import DatePickerField from "@/components/ui/DatePickerField";
// Motor puro (sin Prisma) — suma-vs-total en vivo para avisar descuadres al capturar.
import { sumaPlanExpandido, type PlanEngineInput } from "@/lib/cobranza/engine";
import type { CuentaDetailDTO, ServicioDTO } from "@/lib/cobranza";
import {
  COBRANZA_TIPOS_SERVICIO,
  COBRANZA_MODALIDADES,
  COBRANZA_MONEDAS,
  COBRANZA_PLAN_TEMPLATES,
  COBRANZA_CUOTA_BASES,
  COBRANZA_ESTADOS_SERVICIO,
  TIPO_SERVICIO_LABEL,
  PLAN_TEMPLATE_LABEL,
} from "@/lib/cobranza/schema";
import { MODALIDAD_LABEL, ESTADO_SERVICIO_LABEL, INPUT_CLS, SELECT_CLS, LABEL_CLS } from "./format";

interface CuotaRow {
  orden: string;
  base: string;
  valor: string;
  offsetMeses: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const BASE_LABEL: Record<string, string> = {
  PORCENTAJE: "% del total",
  MONTO_FIJO: "Monto fijo",
};

export default function ServicioForm({
  cuentaId,
  servicio,
  proyectos,
  monedaCuenta,
  onSaved,
  onCancel,
  onGenerar,
  generando,
}: {
  cuentaId: string;
  servicio: ServicioDTO | null;
  proyectos: CuentaDetailDTO["proyectos"];
  monedaCuenta: string;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
  /** Solo en edición: generar cobros desde el último plan GUARDADO. */
  onGenerar?: () => void;
  generando?: boolean;
}) {
  const toast = useToast();
  const plan = servicio?.planActivo ?? null;
  const entradaPrevia = plan?.template === "ENTRADA_Y_RESTO"
    ? plan.cuotas.find((c) => c.orden === 1)
    : undefined;

  const [tipoServicio, setTipoServicio] = useState(servicio?.tipoServicio ?? "IMPLEMENTACION");
  const [modalidad, setModalidad] = useState(servicio?.modalidad ?? "PROYECTO");
  const [montoTotal, setMontoTotal] = useState(servicio ? String(servicio.montoTotal) : "");
  const [moneda, setMoneda] = useState(servicio?.moneda ?? monedaCuenta);
  const [projectId, setProjectId] = useState(servicio?.projectId ?? "");
  const [fechaInicio, setFechaInicio] = useState(servicio?.fechaInicioFacturacion ?? "");
  const [anchorNote, setAnchorNote] = useState(false);
  const [duracionMeses, setDuracionMeses] = useState(
    servicio?.duracionMeses != null ? String(servicio.duracionMeses) : "",
  );
  const [estado, setEstado] = useState(servicio?.estado ?? "ACTIVO");
  const [descripcion, setDescripcion] = useState(servicio?.descripcion ?? "");

  const [template, setTemplate] = useState(plan?.template ?? "PAREJO");
  const [numCuotas, setNumCuotas] = useState(plan?.numCuotas != null ? String(plan.numCuotas) : "");
  const [pctEntrada, setPctEntrada] = useState(entradaPrevia ? String(entradaPrevia.valor) : "");
  const [cuotas, setCuotas] = useState<CuotaRow[]>(
    plan?.template === "PERSONALIZADO"
      ? plan.cuotas.map((c) => ({
          orden: String(c.orden),
          base: c.base,
          valor: String(c.valor),
          offsetMeses: String(c.offsetMeses),
        }))
      : [],
  );
  const [planNotas, setPlanNotas] = useState(plan?.notas ?? "");
  const [saving, setSaving] = useState(false);

  // Suma en vivo del plan vs monto total (aviso de MONTOS_DESCUADRADOS al capturar).
  const sumaPlan = useMemo(() => {
    const total = round2(Number(montoTotal));
    if (!total || total <= 0 || template === "SUSCRIPCION") return null;
    const planInput: PlanEngineInput = {
      template: template as PlanEngineInput["template"],
      numCuotas: numCuotas.trim() ? Number(numCuotas) : null,
      cuotas:
        template === "ENTRADA_Y_RESTO"
          ? Number(pctEntrada) > 0
            ? [{ orden: 1, base: "PORCENTAJE" as const, valor: Number(pctEntrada), offsetMeses: 0 }]
            : []
          : template === "PERSONALIZADO"
            ? cuotas
                .filter((c) => c.orden && c.valor)
                .map((c) => ({
                  orden: Number(c.orden),
                  base: c.base as "PORCENTAJE" | "MONTO_FIJO",
                  valor: Number(c.valor),
                  offsetMeses: Number(c.offsetMeses) || 0,
                }))
            : [],
    };
    return sumaPlanExpandido(
      { montoTotal: total, duracionMeses: duracionMeses.trim() ? Number(duracionMeses) : null },
      planInput,
    );
  }, [montoTotal, template, numCuotas, pctEntrada, cuotas, duracionMeses]);
  const totalNum = round2(Number(montoTotal));
  const descuadre = sumaPlan != null && totalNum > 0 && Math.abs(sumaPlan - totalNum) > 0.01;

  function elegirProyecto(id: string) {
    setProjectId(id);
    const p = proyectos.find((x) => x.id === id);
    if (p?.anchorStartDate) {
      setFechaInicio(p.anchorStartDate);
      setAnchorNote(true);
    } else {
      setAnchorNote(false);
    }
  }

  function buildPlanBody(): Record<string, unknown> | null {
    const notas = planNotas.trim() || null;
    if (template === "PAREJO") {
      const n = numCuotas.trim() ? Number(numCuotas) : null;
      return { template, numCuotas: n, cuotas: [], notas };
    }
    if (template === "ENTRADA_Y_RESTO") {
      const pct = Number(pctEntrada);
      const n = Number(numCuotas);
      if (!pct || pct <= 0 || pct >= 100) {
        toast.error("Indicá el porcentaje de entrada (entre 0 y 100).");
        return null;
      }
      if (!n || n < 1) {
        toast.error("Indicá en cuántas cuotas va el resto.");
        return null;
      }
      return {
        template,
        numCuotas: n,
        cuotas: [{ orden: 1, base: "PORCENTAJE", valor: pct, offsetMeses: 0 }],
        notas,
      };
    }
    if (template === "SUSCRIPCION") {
      return { template, cuotas: [], notas };
    }
    // PERSONALIZADO
    if (cuotas.length === 0) {
      toast.error("Agregá al menos una cuota al plan personalizado.");
      return null;
    }
    const parsed = cuotas.map((c) => ({
      orden: Number(c.orden),
      base: c.base,
      valor: Number(c.valor),
      offsetMeses: Number(c.offsetMeses),
    }));
    if (parsed.some((c) => !c.orden || c.orden < 1 || !c.valor || c.valor <= 0 || c.offsetMeses < 0 || Number.isNaN(c.offsetMeses))) {
      toast.error("Revisá las cuotas: orden y valor positivos, offset en meses desde el arranque.");
      return null;
    }
    if (new Set(parsed.map((c) => c.orden)).size !== parsed.length) {
      toast.error("Los órdenes de cuota deben ser únicos.");
      return null;
    }
    return { template, cuotas: parsed, notas };
  }

  async function guardar() {
    if (saving) return;
    const monto = round2(Number(montoTotal));
    if (!monto || monto <= 0) {
      toast.error("Indicá el monto total del servicio.");
      return;
    }
    const planBody = buildPlanBody();
    if (!planBody) return;

    setSaving(true);
    try {
      const servicioBody = {
        tipoServicio,
        modalidad,
        montoTotal: monto,
        moneda,
        fechaInicioFacturacion: fechaInicio || null,
        duracionMeses: duracionMeses.trim() ? Number(duracionMeses) : null,
        projectId: projectId || null,
        descripcion: descripcion.trim() || null,
      };

      let servicioId = servicio?.id ?? null;
      if (servicioId) {
        await fetchJson(`/api/cobranza/servicios/${servicioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...servicioBody, estado }),
        });
      } else {
        const d = await fetchJson<{ servicio: { id: string } }>(
          `/api/cobranza/cuentas/${cuentaId}/servicios`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(servicioBody),
          },
        );
        servicioId = d.servicio.id;
      }

      await fetchJson(`/api/cobranza/servicios/${servicioId}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planBody),
      });

      toast.success(servicio ? "Servicio actualizado." : "Servicio creado con su plan.");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar el servicio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* ── Servicio ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL_CLS}>Tipo de servicio</label>
          <select value={tipoServicio} onChange={(e) => setTipoServicio(e.target.value)} className={SELECT_CLS}>
            {COBRANZA_TIPOS_SERVICIO.map((t) => (
              <option key={t} value={t}>{TIPO_SERVICIO_LABEL[t] ?? t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Modalidad</label>
          <select value={modalidad} onChange={(e) => setModalidad(e.target.value)} className={SELECT_CLS}>
            {COBRANZA_MODALIDADES.map((t) => (
              <option key={t} value={t}>{MODALIDAD_LABEL[t] ?? t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Monto total</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={montoTotal}
            onChange={(e) => setMontoTotal(e.target.value)}
            placeholder="0.00"
            className={INPUT_CLS}
          />
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
          <label className={LABEL_CLS}>Proyecto vinculado</label>
          <select value={projectId} onChange={(e) => elegirProyecto(e.target.value)} className={SELECT_CLS}>
            <option value="">Sin proyecto</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Duración (meses)</label>
          <input
            type="number"
            min={1}
            max={120}
            value={duracionMeses}
            onChange={(e) => setDuracionMeses(e.target.value)}
            placeholder="Opcional"
            className={INPUT_CLS}
          />
        </div>
      </div>

      <div>
        <label className={LABEL_CLS}>Inicio de facturación</label>
        <DatePickerField value={fechaInicio} onChange={(ymd) => setFechaInicio(ymd)} placeholder="Elegir fecha" />
        {anchorNote && (
          <p className="mt-1 text-[10px] text-fg-muted">Leída del cronograma del proyecto — editable.</p>
        )}
      </div>

      {servicio && (
        <div>
          <label className={LABEL_CLS}>Estado del servicio</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={SELECT_CLS}>
            {COBRANZA_ESTADOS_SERVICIO.map((t) => (
              <option key={t} value={t}>{ESTADO_SERVICIO_LABEL[t] ?? t}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className={LABEL_CLS}>Descripción</label>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej. Implementación CRM fase 1 (opcional)"
          className={INPUT_CLS}
        />
      </div>

      {/* ── Plan de pago ── */}
      <div className="rounded-lg border border-line bg-surface-muted/40 p-3 space-y-3">
        <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-widest">Plan de pago</p>
        <div>
          <label className={LABEL_CLS}>Plantilla</label>
          <select value={template} onChange={(e) => setTemplate(e.target.value)} className={SELECT_CLS}>
            {COBRANZA_PLAN_TEMPLATES.map((t) => (
              <option key={t} value={t}>{PLAN_TEMPLATE_LABEL[t] ?? t}</option>
            ))}
          </select>
        </div>

        {template === "PAREJO" && (
          <div>
            <label className={LABEL_CLS}>Número de cuotas</label>
            <input
              type="number"
              min={1}
              max={120}
              value={numCuotas}
              onChange={(e) => setNumCuotas(e.target.value)}
              placeholder="Vacío = usa la duración del servicio"
              className={INPUT_CLS}
            />
          </div>
        )}

        {template === "ENTRADA_Y_RESTO" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>% de entrada</label>
              <input
                type="number"
                min={1}
                max={99}
                value={pctEntrada}
                onChange={(e) => setPctEntrada(e.target.value)}
                placeholder="Ej. 40"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Cuotas del resto</label>
              <input
                type="number"
                min={1}
                max={120}
                value={numCuotas}
                onChange={(e) => setNumCuotas(e.target.value)}
                placeholder="Ej. 3"
                className={INPUT_CLS}
              />
            </div>
          </div>
        )}

        {template === "SUSCRIPCION" && (
          <p className="text-[11px] text-fg-muted">
            El monto total se interpreta como monto <span className="font-medium text-fg-secondary">mensual</span>;
            el horizonte de cobros se extiende solo en cada corte.
          </p>
        )}

        {template === "PERSONALIZADO" && (
          <div className="space-y-2">
            {cuotas.length > 0 && (
              <div className="grid grid-cols-[3rem_1fr_1fr_4.5rem_1.5rem] gap-1.5 text-[10px] text-fg-muted">
                <span>Orden</span>
                <span>Base</span>
                <span>Valor</span>
                <span>+meses</span>
                <span />
              </div>
            )}
            {cuotas.map((c, i) => (
              <div key={i} className="grid grid-cols-[3rem_1fr_1fr_4.5rem_1.5rem] gap-1.5 items-center">
                <input
                  type="number"
                  min={1}
                  value={c.orden}
                  onChange={(e) => setCuotas(cuotas.map((x, j) => (j === i ? { ...x, orden: e.target.value } : x)))}
                  className="px-2 py-1.5 text-xs bg-surface border border-line rounded-md text-fg focus:outline-none focus:border-brand"
                />
                <select
                  value={c.base}
                  onChange={(e) => setCuotas(cuotas.map((x, j) => (j === i ? { ...x, base: e.target.value } : x)))}
                  className="px-2 py-1.5 text-xs bg-surface border border-line rounded-md text-fg focus:outline-none focus:border-brand"
                >
                  {COBRANZA_CUOTA_BASES.map((b) => (
                    <option key={b} value={b}>{BASE_LABEL[b] ?? b}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={c.valor}
                  onChange={(e) => setCuotas(cuotas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                  placeholder={c.base === "PORCENTAJE" ? "%" : "Monto"}
                  className="px-2 py-1.5 text-xs bg-surface border border-line rounded-md text-fg focus:outline-none focus:border-brand"
                />
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={c.offsetMeses}
                  onChange={(e) =>
                    setCuotas(cuotas.map((x, j) => (j === i ? { ...x, offsetMeses: e.target.value } : x)))
                  }
                  className="px-2 py-1.5 text-xs bg-surface border border-line rounded-md text-fg focus:outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => setCuotas(cuotas.filter((_, j) => j !== i))}
                  title="Quitar cuota"
                  className="text-fg-muted hover:text-red-500 text-sm leading-none"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setCuotas([
                  ...cuotas,
                  {
                    orden: String(cuotas.length + 1),
                    base: "MONTO_FIJO",
                    valor: "",
                    offsetMeses: String(cuotas.length),
                  },
                ])
              }
              className="text-[11px] font-medium text-brand hover:opacity-80"
            >
              + Agregar cuota
            </button>
          </div>
        )}

        {sumaPlan != null && totalNum > 0 && (
          <p className={`text-[11px] ${descuadre ? "text-amber-600 font-medium" : "text-fg-muted"}`}>
            Suma del plan: {sumaPlan.toLocaleString("es-CR")} de {totalNum.toLocaleString("es-CR")}
            {descuadre
              ? ` — descuadre de ${(Math.round((sumaPlan - totalNum) * 100) / 100).toLocaleString("es-CR")} (el corte lo va a marcar como alerta)`
              : " ✓"}
          </p>
        )}

        <div>
          <label className={LABEL_CLS}>Notas del plan</label>
          <input
            value={planNotas}
            onChange={(e) => setPlanNotas(e.target.value)}
            placeholder="Ej. acordado con el cliente en el kickoff (opcional)"
            className={INPUT_CLS}
          />
        </div>
      </div>

      {/* ── Acciones ── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={saving}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando…" : servicio ? "Guardar servicio y plan" : "Crear servicio y plan"}
        </button>
        {servicio && onGenerar && (
          <button
            type="button"
            onClick={onGenerar}
            disabled={saving || generando}
            title="Genera desde el último plan guardado"
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-40"
          >
            {generando ? "Generando…" : "Generar cobros"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-fg-muted hover:text-fg ml-auto"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
