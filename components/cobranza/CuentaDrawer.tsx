"use client";

/**
 * components/cobranza/CuentaDrawer.tsx
 *
 * Drawer de detalle de una CuentaFinanciera: (a) form de la cuenta (cambiar
 * estadoCuenta pide confirmación y queda registrado), (b) servicios contratados
 * (cards expandibles con plan + cronograma + generar), (c) alta de servicio,
 * (d) bitácora de gestión. Patrón Drawer de components/marketing/*Client.
 */
import { useCallback, useEffect, useState } from "react";
import { Drawer, ConfirmDialog, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { CuentaDetailDTO, ServicioDTO } from "@/lib/cobranza";
import {
  COBRANZA_TIPOS_CUENTA,
  COBRANZA_VIAS_COBRO,
  COBRANZA_MONEDAS,
  COBRANZA_TERMINOS_PAGO,
  COBRANZA_ESTADOS_CUENTA,
  BITACORA_TIPOS,
  TIPO_CUENTA_LABEL,
  ESTADO_CUENTA_LABEL,
  TIPO_SERVICIO_LABEL,
  PLAN_TEMPLATE_LABEL,
} from "@/lib/cobranza/schema";
import {
  fmtFecha,
  fmtMonto,
  VIA_COBRO_LABEL,
  TERMINOS_PAGO_LABEL,
  MODALIDAD_LABEL,
  ESTADO_SERVICIO_LABEL,
  BITACORA_TIPO_LABEL,
  INPUT_CLS,
  SELECT_CLS,
  LABEL_CLS,
} from "./format";
import ServicioForm from "./ServicioForm";
import CronogramaCobros from "./CronogramaCobros";

interface GenerateResult {
  created: number;
  updated: number;
  deleted: number;
  catchUp: number;
  untouched: number;
}

interface CuentaForm {
  tipo: string;
  viaCobro: string;
  moneda: string;
  terminosPago: string;
  diaCobroAncla: string;
  estadoCuenta: string;
  excluidaOperacion: boolean;
  responsableCobroTerceros: string;
  notas: string;
}

function formFrom(c: CuentaDetailDTO): CuentaForm {
  return {
    tipo: c.tipo,
    viaCobro: c.viaCobro,
    moneda: c.moneda,
    terminosPago: c.terminosPago,
    diaCobroAncla: c.diaCobroAncla != null ? String(c.diaCobroAncla) : "",
    estadoCuenta: c.estadoCuenta,
    excluidaOperacion: c.excluidaOperacion,
    responsableCobroTerceros: c.responsableCobroTerceros ?? "",
    notas: c.notas ?? "",
  };
}

const SECTION_TITLE_CLS =
  "text-[11px] font-semibold text-fg-muted uppercase tracking-widest";

export default function CuentaDrawer({
  cuentaId,
  todayISO,
  onClose,
}: {
  cuentaId: string | null;
  todayISO: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<CuentaDetailDTO | null>(null);
  const [form, setForm] = useState<CuentaForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmEstado, setConfirmEstado] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [generando, setGenerando] = useState<string | null>(null);
  const [bitTipo, setBitTipo] = useState<string>("NOTA");
  const [bitContenido, setBitContenido] = useState("");
  const [bitBusy, setBitBusy] = useState(false);

  // Solo mostramos el detail si corresponde al cuentaId abierto (evita el flash
  // de la cuenta anterior al reabrir el drawer con otra cuenta).
  const cuenta = detail && detail.id === cuentaId ? detail : null;

  const load = useCallback(
    async (resetForm: boolean) => {
      if (!cuentaId) return;
      try {
        const d = await fetchJson<{ cuenta: CuentaDetailDTO }>(`/api/cobranza/cuentas/${cuentaId}`);
        setDetail(d.cuenta);
        if (resetForm) setForm(formFrom(d.cuenta));
        else setForm((prev) => prev ?? formFrom(d.cuenta));
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo cargar la cuenta.");
      }
    },
    [cuentaId, toast],
  );

  useEffect(() => {
    if (!cuentaId) return;
    // Reset de UI al abrir otra cuenta (el form se repuebla en el load).
    load(true);
  }, [cuentaId, load]);

  function closeDrawer() {
    setExpandedId(null);
    setEditingId(null);
    setAdding(false);
    setForm(null);
    onClose();
  }

  // ── (a) Cuenta ────────────────────────────────────────────────────────────────

  async function saveCuenta() {
    if (!cuentaId || !form || saving) return;
    setSaving(true);
    try {
      await fetchJson(`/api/cobranza/cuentas/${cuentaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: form.tipo,
          viaCobro: form.viaCobro,
          moneda: form.moneda,
          terminosPago: form.terminosPago,
          diaCobroAncla: form.diaCobroAncla.trim() ? Number(form.diaCobroAncla) : null,
          estadoCuenta: form.estadoCuenta,
          excluidaOperacion: form.excluidaOperacion,
          responsableCobroTerceros: form.responsableCobroTerceros.trim() || null,
          notas: form.notas.trim() || null,
        }),
      });
      toast.success("Cuenta actualizada.");
      await load(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la cuenta.");
    } finally {
      setSaving(false);
    }
  }

  function onGuardarCuenta() {
    if (!cuenta || !form) return;
    if (form.estadoCuenta !== cuenta.estadoCuenta) setConfirmEstado(true);
    else saveCuenta();
  }

  // ── (b) Servicios ─────────────────────────────────────────────────────────────

  async function generarCobros(servicioId: string) {
    if (generando) return;
    setGenerando(servicioId);
    try {
      const d = await fetchJson<{ result: GenerateResult }>(
        `/api/cobranza/servicios/${servicioId}/generar`,
        { method: "POST" },
      );
      const r = d.result;
      const partes = [
        `${r.created} nuevo${r.created !== 1 ? "s" : ""} (${r.catchUp} catch-up)`,
        `${r.updated} ajustado${r.updated !== 1 ? "s" : ""}`,
      ];
      if (r.deleted > 0) partes.push(`${r.deleted} eliminado${r.deleted !== 1 ? "s" : ""}`);
      toast.success(`Cobros generados: ${partes.join(", ")}.`);
      await load(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron generar los cobros.");
    } finally {
      setGenerando(null);
    }
  }

  // ── (d) Bitácora ──────────────────────────────────────────────────────────────

  async function addBitacora() {
    if (!cuentaId || !bitContenido.trim() || bitBusy) return;
    setBitBusy(true);
    try {
      await fetchJson(`/api/cobranza/cuentas/${cuentaId}/bitacora`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: bitTipo, contenido: bitContenido.trim() }),
      });
      setBitContenido("");
      await load(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar la entrada.");
    } finally {
      setBitBusy(false);
    }
  }

  return (
    <>
      <Drawer
        open={!!cuentaId}
        onClose={closeDrawer}
        size="xl"
        title={cuenta ? cuenta.clienteNombre : "Cuenta financiera"}
        description="Datos de cobro, servicios contratados y bitácora."
      >
        {!cuenta || !form ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-8">
            {/* ── (a) Datos de la cuenta ── */}
            <section className="space-y-3">
              <h3 className={SECTION_TITLE_CLS}>Datos de la cuenta</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className={SELECT_CLS}
                  >
                    {COBRANZA_TIPOS_CUENTA.map((t) => (
                      <option key={t} value={t}>{TIPO_CUENTA_LABEL[t] ?? t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Vía de cobro</label>
                  <select
                    value={form.viaCobro}
                    onChange={(e) => setForm({ ...form, viaCobro: e.target.value })}
                    className={SELECT_CLS}
                  >
                    {COBRANZA_VIAS_COBRO.map((t) => (
                      <option key={t} value={t}>{VIA_COBRO_LABEL[t] ?? t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Moneda</label>
                  <select
                    value={form.moneda}
                    onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                    className={SELECT_CLS}
                  >
                    {COBRANZA_MONEDAS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Términos de pago</label>
                  <select
                    value={form.terminosPago}
                    onChange={(e) => setForm({ ...form, terminosPago: e.target.value })}
                    className={SELECT_CLS}
                  >
                    {COBRANZA_TERMINOS_PAGO.map((t) => (
                      <option key={t} value={t}>{TERMINOS_PAGO_LABEL[t] ?? t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Día de cobro ancla (1–31)</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.diaCobroAncla}
                    onChange={(e) => setForm({ ...form, diaCobroAncla: e.target.value })}
                    placeholder="Día del arranque"
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Estado de la cuenta</label>
                  <select
                    value={form.estadoCuenta}
                    onChange={(e) => setForm({ ...form, estadoCuenta: e.target.value })}
                    className={SELECT_CLS}
                  >
                    {COBRANZA_ESTADOS_CUENTA.map((t) => (
                      <option key={t} value={t}>{ESTADO_CUENTA_LABEL[t] ?? t}</option>
                    ))}
                  </select>
                  {cuenta.estadoActualizadoPor && (
                    <p className="mt-1 text-[10px] text-fg-muted">
                      Actualizado por {cuenta.estadoActualizadoPor}
                      {cuenta.estadoActualizadoEn ? ` · ${fmtFecha(cuenta.estadoActualizadoEn)}` : ""}
                    </p>
                  )}
                </div>
              </div>
              {form.viaCobro === "OTRA" && (
                <div>
                  <label className={LABEL_CLS}>Responsable del cobro (terceros)</label>
                  <input
                    value={form.responsableCobroTerceros}
                    onChange={(e) => setForm({ ...form, responsableCobroTerceros: e.target.value })}
                    placeholder="¿Quién cobra por fuera?"
                    className={INPUT_CLS}
                  />
                </div>
              )}
              <div>
                <label className={LABEL_CLS}>Notas</label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  rows={2}
                  placeholder="Contexto de cobro de esta cuenta…"
                  className={INPUT_CLS}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.excluidaOperacion}
                    onChange={(e) => setForm({ ...form, excluidaOperacion: e.target.checked })}
                    className="accent-current"
                  />
                  Excluir de la operación (sale del panel y de las alertas)
                </label>
                <button
                  type="button"
                  onClick={onGuardarCuenta}
                  disabled={saving}
                  className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50"
                >
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </section>

            {/* ── (b) Servicios contratados ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className={SECTION_TITLE_CLS}>Servicios contratados</h3>
                {!adding && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(true);
                      setEditingId(null);
                    }}
                    className="text-[11px] font-medium text-brand hover:opacity-80"
                  >
                    + Agregar servicio
                  </button>
                )}
              </div>

              {cuenta.servicios.length === 0 && !adding && (
                <p className="text-xs text-fg-muted rounded-lg border border-dashed border-line px-3 py-4 text-center">
                  Sin servicios todavía. Agregá el primero para armar el plan de pago.
                </p>
              )}

              {cuenta.servicios.map((s) => (
                <ServicioCard
                  key={s.id}
                  servicio={s}
                  todayISO={todayISO}
                  expanded={expandedId === s.id}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  editing={editingId === s.id}
                  onEdit={() => {
                    setEditingId(s.id);
                    setAdding(false);
                    setExpandedId(s.id);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await load(false);
                  }}
                  onGenerar={() => generarCobros(s.id)}
                  generando={generando === s.id}
                  onRefresh={() => load(false)}
                  cuenta={cuenta}
                />
              ))}

              {adding && (
                <div className="rounded-xl border border-brand/30 bg-surface p-3">
                  <p className="text-xs font-semibold text-fg mb-2">Nuevo servicio</p>
                  <ServicioForm
                    cuentaId={cuenta.id}
                    servicio={null}
                    proyectos={cuenta.proyectos}
                    monedaCuenta={cuenta.moneda}
                    onSaved={async () => {
                      setAdding(false);
                      await load(false);
                    }}
                    onCancel={() => setAdding(false)}
                  />
                </div>
              )}
            </section>

            {/* ── (d) Bitácora ── */}
            <section className="space-y-3">
              <h3 className={SECTION_TITLE_CLS}>Bitácora</h3>
              <div className="flex items-start gap-2">
                <select
                  value={bitTipo}
                  onChange={(e) => setBitTipo(e.target.value)}
                  className="text-xs border border-line rounded-lg px-2 py-2 bg-surface text-fg focus:outline-none focus:border-brand flex-shrink-0"
                >
                  {BITACORA_TIPOS.map((t) => (
                    <option key={t} value={t}>{BITACORA_TIPO_LABEL[t] ?? t}</option>
                  ))}
                </select>
                <input
                  value={bitContenido}
                  onChange={(e) => setBitContenido(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addBitacora();
                  }}
                  placeholder="Registrá una llamada, correo o nota…"
                  className={INPUT_CLS}
                />
                <button
                  type="button"
                  onClick={addBitacora}
                  disabled={bitBusy || !bitContenido.trim()}
                  className="flex-shrink-0 text-xs font-medium px-3 py-2 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-40"
                >
                  {bitBusy ? "Guardando…" : "Agregar"}
                </button>
              </div>
              {cuenta.bitacora.length === 0 ? (
                <p className="text-xs text-fg-muted">Sin entradas todavía.</p>
              ) : (
                <ul className="space-y-2">
                  {cuenta.bitacora.map((b) => (
                    <li key={b.id} className="rounded-lg border border-line bg-surface px-3 py-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted">
                          {BITACORA_TIPO_LABEL[b.tipo] ?? b.tipo}
                        </span>
                        <span className="text-[10px] text-fg-muted">{fmtFecha(b.createdAt)}</span>
                        {b.usuarioEmail && (
                          <span className="text-[10px] text-fg-muted">· {b.usuarioEmail}</span>
                        )}
                      </div>
                      <p className="text-xs text-fg-secondary mt-1 whitespace-pre-wrap">{b.contenido}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmEstado}
        z="z-[60]"
        variant="default"
        title="¿Cambiar el estado de la cuenta?"
        description={
          form && cuenta
            ? `La cuenta pasa de "${ESTADO_CUENTA_LABEL[cuenta.estadoCuenta] ?? cuenta.estadoCuenta}" a "${ESTADO_CUENTA_LABEL[form.estadoCuenta] ?? form.estadoCuenta}". El cambio queda registrado a tu nombre.`
            : undefined
        }
        confirmLabel="Cambiar estado"
        onCancel={() => setConfirmEstado(false)}
        onConfirm={async () => {
          setConfirmEstado(false);
          await saveCuenta();
        }}
      />
    </>
  );
}

// ── Card expandible de un servicio (plan + cronograma + acciones) ───────────────

function ServicioCard({
  servicio,
  cuenta,
  todayISO,
  expanded,
  onToggle,
  editing,
  onEdit,
  onCancelEdit,
  onSaved,
  onGenerar,
  generando,
  onRefresh,
}: {
  servicio: ServicioDTO;
  cuenta: CuentaDetailDTO;
  todayISO: string;
  expanded: boolean;
  onToggle: () => void;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => Promise<void>;
  onGenerar: () => void;
  generando: boolean;
  onRefresh: () => void;
}) {
  const plan = servicio.planActivo;
  const arranqueMovido =
    servicio.anchorActual !== null &&
    servicio.fechaInicioFacturacion !== null &&
    servicio.anchorActual !== servicio.fechaInicioFacturacion;

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors rounded-xl"
      >
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-secondary flex-shrink-0">
          {TIPO_SERVICIO_LABEL[servicio.tipoServicio] ?? servicio.tipoServicio}
        </span>
        <span className="text-xs text-fg font-medium truncate flex-1 min-w-0">
          {servicio.descripcion || servicio.projectName || MODALIDAD_LABEL[servicio.modalidad] || servicio.modalidad}
        </span>
        <span className="text-xs text-fg-secondary tabular-nums flex-shrink-0">
          {fmtMonto(servicio.montoTotal, servicio.moneda)}
          {plan?.template === "SUSCRIPCION" ? "/mes" : ""}
        </span>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${
            servicio.estado === "ACTIVO"
              ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/30"
              : "text-fg-muted bg-surface-muted border-line"
          }`}
        >
          {ESTADO_SERVICIO_LABEL[servicio.estado] ?? servicio.estado}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-fg-muted flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-line px-3 py-3 space-y-3">
          {editing ? (
            <ServicioForm
              cuentaId={cuenta.id}
              servicio={servicio}
              proyectos={cuenta.proyectos}
              monedaCuenta={cuenta.moneda}
              onSaved={onSaved}
              onCancel={onCancelEdit}
              onGenerar={onGenerar}
              generando={generando}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div>
                  <span className="text-fg-muted">Proyecto: </span>
                  <span className="text-fg-secondary">{servicio.projectName ?? "—"}</span>
                </div>
                <div>
                  <span className="text-fg-muted">Modalidad: </span>
                  <span className="text-fg-secondary">
                    {MODALIDAD_LABEL[servicio.modalidad] ?? servicio.modalidad}
                  </span>
                </div>
                <div>
                  <span className="text-fg-muted">Inicio facturación: </span>
                  <span className="text-fg-secondary">{fmtFecha(servicio.fechaInicioFacturacion)}</span>
                </div>
                <div>
                  <span className="text-fg-muted">Duración: </span>
                  <span className="text-fg-secondary">
                    {servicio.duracionMeses != null ? `${servicio.duracionMeses} meses` : "—"}
                  </span>
                </div>
              </div>

              {arranqueMovido && (
                <p className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
                  El arranque del cronograma cambió a {fmtFecha(servicio.anchorActual)} y difiere de la
                  facturación configurada ({fmtFecha(servicio.fechaInicioFacturacion)}). Revisá si hay que ajustar.
                </p>
              )}

              <p className="text-xs text-fg-secondary">
                <span className="text-fg-muted">Plan: </span>
                {plan ? (
                  <>
                    {PLAN_TEMPLATE_LABEL[plan.template] ?? plan.template}
                    {plan.numCuotas ? ` · ${plan.numCuotas} cuota${plan.numCuotas !== 1 ? "s" : ""}` : ""}
                    {plan.template === "PERSONALIZADO" ? ` · ${plan.cuotas.length} cuota${plan.cuotas.length !== 1 ? "s" : ""} definidas` : ""}
                    {plan.notas ? ` · ${plan.notas}` : ""}
                  </>
                ) : (
                  "sin plan configurado — editá el servicio para definirlo"
                )}
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onEdit}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
                >
                  Editar servicio
                </button>
                <button
                  type="button"
                  onClick={onGenerar}
                  disabled={generando || !plan}
                  title={!plan ? "Configurá el plan primero" : undefined}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-40"
                >
                  {generando ? "Generando…" : "Generar cobros"}
                </button>
              </div>

              <CronogramaCobros cobros={servicio.cobros} todayISO={todayISO} onRefresh={onRefresh} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
