"use client";

/**
 * components/finanzas/ComisionesVendedorPanel.tsx
 *
 * Lo que Smarteam le PAGA a quien vendió. SUPER_ADMIN-only: es remuneración de
 * una persona, la misma sensibilidad que un salario.
 *
 * ⚠ NUNCA muestra comisiones de PARTNER (esas son un ingreso y viven en otra
 * ruta, con otro guard y otro loader).
 *
 * Tres bloques, en el orden en que se usan: lo DEVENGADO (lo que hay para pagar,
 * derivado de los cobros), el HISTORIAL de lo liquidado (agrupado por mes, como
 * el historial de planilla) y las REGLAS (el %).
 *
 * ⚠ La quincena en la que cae cada comisión la resuelve el SERVER con la política
 * (`quincenaDePagoDeComision`) y llega en `quincenaSugerida`. Este panel la
 * MUESTRA y la reenvía; no la calcula. Si la calculara, la comisión terminaría
 * enganchada a la quincena que dijo el navegador.
 */

import { Fragment, useMemo, useState } from "react";
import type {
  ComisionesVendedorDTO,
  ComisionLiquidadaDTO,
  DevengadaConQuincena,
} from "@/lib/cobranza";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Button, PageHeader, EmptyState, Modal, Field, Input, Select } from "@/components/ui";
import { etiquetaMes, fmtFecha, fmtMonto } from "@/components/cobranza/format";

interface Lite {
  id: string;
  name: string;
}

interface Props {
  initial: ComisionesVendedorDTO;
  personas: Lite[];
  clientes: Lite[];
}

const BASE = "/api/cobranza/costos/comisiones-vendedor";
const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-fg-muted";
const TD = "px-3 py-2 text-xs text-fg";

type ReglaForm = {
  teamMemberId: string;
  clientId: string;
  porcentaje: string;
  vigenteDesde: string;
  vigenteHasta: string;
  notas: string;
};

export default function ComisionesVendedorPanel({ initial, personas, clientes }: Props) {
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [form, setForm] = useState<ReglaForm | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  async function refrescar() {
    try {
      const r = await fetchJson<{ data: ComisionesVendedorDTO }>(BASE);
      setData(r.data);
    } catch {
      toast.error("No se pudo refrescar. Recargá la página.");
    }
  }

  function toggle(clave: string) {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }

  async function guardarRegla() {
    if (!form) return;
    const porcentaje = Number(form.porcentaje);
    if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje > 100) {
      toast.error("El porcentaje va entre 0 y 100.");
      return;
    }
    const body = {
      teamMemberId: form.teamMemberId,
      clientId: form.clientId || null,
      porcentaje,
      vigenteDesde: form.vigenteDesde,
      vigenteHasta: form.vigenteHasta || null,
      notas: form.notas.trim() || null,
    };
    setGuardando(true);
    try {
      await fetchJson(editandoId ? `${BASE}/${editandoId}` : BASE, {
        method: editandoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setForm(null);
      setEditandoId(null);
      await refrescar();
      toast.success(editandoId ? "Regla actualizada." : "Regla creada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la regla.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarRegla(id: string) {
    try {
      await fetchJson(`${BASE}/${id}`, { method: "DELETE" });
      await refrescar();
      toast.success("Regla borrada. Lo ya liquidado no se toca.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar la regla.");
    }
  }

  /**
   * Liquidar. `pagoPlanillaId` sale de la sugerencia del SERVER, no de una cuenta
   * hecha acá: la comisión queda enganchada exactamente a la quincena que la
   * persona vio en pantalla. Sin sugerencia se liquida suelta y el motivo ya está
   * escrito arriba del botón.
   */
  async function liquidar(d: DevengadaConQuincena) {
    try {
      await fetchJson(`${BASE}/liquidar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamMemberId: d.teamMemberId,
          periodo: d.periodo,
          moneda: d.moneda,
          pagoPlanillaId: d.quincenaSugerida?.id ?? null,
        }),
      });
      await refrescar();
      toast.success(
        d.quincenaSugerida
          ? `Comisión liquidada y enganchada a la quincena del ${fmtFecha(d.quincenaSugerida.fechaProgramada)}.`
          : "Comisión liquidada, sin quincena enganchada.",
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo liquidar.");
    }
  }

  async function deshacer(comisionId: string) {
    try {
      await fetchJson(`${BASE}/liquidar?comisionId=${comisionId}`, { method: "DELETE" });
      await refrescar();
      toast.success("Liquidación deshecha. Los cobros vuelven a devengar.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo deshacer.");
    }
  }

  /**
   * El historial, agrupado por mes. `liquidadas` ya viene ordenada por período
   * descendente desde el loader, así que agrupar en orden alcanza — re-ordenar
   * acá sería una segunda opinión sobre el orden y podrían divergir.
   */
  const mesesLiquidados = useMemo(() => {
    const porMes = new Map<
      string,
      { periodo: string; filas: ComisionLiquidadaDTO[]; totales: Record<string, number> }
    >();
    for (const c of data.liquidadas) {
      let g = porMes.get(c.periodo);
      if (!g) {
        g = { periodo: c.periodo, filas: [], totales: {} };
        porMes.set(c.periodo, g);
      }
      g.filas.push(c);
      g.totales[c.moneda] = Math.round(((g.totales[c.moneda] ?? 0) + c.monto) * 100) / 100;
    }
    return [...porMes.values()];
  }, [data.liquidadas]);

  const hoy = new Date().toISOString().slice(0, 10);
  const nuevaRegla = (): ReglaForm => ({
    teamMemberId: personas[0]?.id ?? "",
    clientId: "",
    porcentaje: "",
    vigenteDesde: hoy,
    vigenteHasta: "",
    notas: "",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones de vendedor"
        description="Lo que Smarteam le paga a quien vendió, como porcentaje de lo cobrado. Lo devengado se calcula solo; liquidar lo congela."
        backHref="/finanzas/costos"
        action={
          <Button
            onClick={() => {
              setEditandoId(null);
              setForm(nuevaRegla());
            }}
            disabled={personas.length === 0}
          >
            Nueva regla
          </Button>
        }
      />

      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
        <p className="text-[11px] text-fg-muted">
          Devengado sin liquidar:{" "}
          {Object.keys(data.totalesDevengado).length === 0 ? (
            <span className="text-fg-secondary">nada</span>
          ) : (
            <span className="text-fg-secondary tabular-nums">
              {Object.entries(data.totalesDevengado)
                .map(([m, v]) => fmtMonto(v, m as "CRC" | "USD"))
                .join(" · ")}
            </span>
          )}{" "}
          · la base es lo COBRADO, y CRC y USD nunca se suman
        </p>
      </div>

      {/* ── Devengado ─────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Por liquidar</h2>
        {data.devengadas.length === 0 ? (
          <EmptyState
            title="No hay nada devengado"
            description={
              data.reglas.length === 0
                ? "Cargá una regla para que los cobros empiecen a devengar comisión."
                : "Ningún cobro cobrado cae bajo una regla vigente todavía."
            }
          />
        ) : (
          <div className="rounded-xl border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-surface-muted border-b border-line">
                <tr>
                  <th className={TH}>Vendedor</th>
                  <th className={TH}>Período</th>
                  <th className={`${TH} text-right`}>Base cobrada</th>
                  <th className={`${TH} text-right`}>%</th>
                  <th className={`${TH} text-right`}>Comisión</th>
                  <th className={TH}>Se paga</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {data.devengadas.map((d) => {
                  const clave = `${d.teamMemberId}::${d.periodo}::${d.moneda}`;
                  const abierta = abiertas.has(clave);
                  const moneda = d.moneda as "CRC" | "USD";
                  return (
                    <Fragment key={clave}>
                      <tr className="border-b border-line">
                        <td className={TD}>
                          <button
                            type="button"
                            onClick={() => toggle(clave)}
                            className="text-left hover:text-brand"
                          >
                            {abierta ? "▾" : "▸"} {d.vendedorNombre}
                          </button>
                        </td>
                        <td className={`${TD} text-fg-secondary`}>
                          {d.periodo} · {d.moneda}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{fmtMonto(d.base, moneda)}</td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {d.porcentaje}%
                          {d.porcentajesDistintos > 1 && (
                            <span
                              className="ml-1 text-fg-muted"
                              title="La regla cambió dentro del período: éste es el porcentaje efectivo. El detalle tiene la cuenta real."
                            >
                              ⓘ
                            </span>
                          )}
                        </td>
                        <td className={`${TD} text-right tabular-nums font-medium`}>
                          {fmtMonto(d.monto, moneda)}
                        </td>
                        <td className={`${TD} whitespace-nowrap`}>
                          {d.quincenaSugerida ? (
                            <span className="text-fg-secondary">
                              {fmtFecha(d.quincenaSugerida.fechaProgramada)}
                            </span>
                          ) : (
                            // El motivo se DICE. Un guion suelto obligaría a
                            // adivinar por qué no se va a enganchar a nada.
                            <span className="text-fg-muted" title={d.motivoSinQuincena ?? ""}>
                              sin quincena ⓘ
                            </span>
                          )}
                        </td>
                        <td className={`${TD} text-right`}>
                          <Button size="sm" onClick={() => liquidar(d)}>
                            Liquidar
                          </Button>
                        </td>
                      </tr>
                      {abierta &&
                        d.detalle.map((det) => (
                          <tr key={det.cobroId} className="border-b border-line bg-surface-muted">
                            <td className={`${TD} pl-11 text-fg-secondary`} colSpan={2}>
                              {det.clienteNombre}
                            </td>
                            <td className={`${TD} text-right tabular-nums text-fg-secondary`}>
                              {fmtMonto(det.monto, moneda)}
                            </td>
                            {/* 7 columnas en la cabecera: 2 + 1 + 4. */}
                            <td className={`${TD} text-right text-fg-muted`} colSpan={4}>
                              cobrado el {fmtFecha(det.fechaCobro)}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Historial ─────────────────────────────────────────────────────── */}
      {data.liquidadas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg">Historial</h2>
          <p className="text-[11px] text-fg-muted">
            Lo liquidado mes a mes. Cada mes suma por moneda: CRC y USD nunca se juntan.
          </p>
          <div className="rounded-xl border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-surface-muted border-b border-line">
                <tr>
                  <th className={TH}>Vendedor</th>
                  <th className={`${TH} text-right`}>Base cobrada</th>
                  <th className={`${TH} text-right`}>%</th>
                  <th className={`${TH} text-right`}>Comisión</th>
                  <th className={TH}>Liquidó</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {mesesLiquidados.map((mes) => (
                  <Fragment key={mes.periodo}>
                    <tr className="border-b border-line bg-surface-muted">
                      <td className={`${TD} font-medium`} colSpan={3}>
                        {etiquetaMes(mes.periodo)}
                      </td>
                      <td className={`${TD} text-right tabular-nums font-medium`} colSpan={3}>
                        {Object.entries(mes.totales)
                          .map(([m, v]) => fmtMonto(v, m as "CRC" | "USD"))
                          .join(" · ")}
                      </td>
                    </tr>
                    {mes.filas.map((c) => (
                      <tr key={c.id} className="border-b border-line">
                        <td className={TD}>{c.vendedorNombre}</td>
                        <td className={`${TD} text-right tabular-nums text-fg-secondary`}>
                          {fmtMonto(c.base, c.moneda as "CRC" | "USD")}
                        </td>
                        <td className={`${TD} text-right tabular-nums text-fg-secondary`}>
                          {c.porcentaje}%
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {fmtMonto(c.monto, c.moneda as "CRC" | "USD")}
                        </td>
                        <td className={`${TD} text-fg-muted`}>
                          {c.liquidadoPor} · {fmtFecha(c.liquidadoEn.slice(0, 10))}
                          {/* Enganchada o suelta: es lo que decide si aparece en el
                              historial de planilla y si el aguinaldo la cuenta. */}
                          {c.pagoPlanillaId ? (
                            <span className="ml-1.5 text-fg-secondary">· con la planilla</span>
                          ) : (
                            <span className="ml-1.5 text-fg-muted">· suelta</span>
                          )}
                        </td>
                        <td className={`${TD} text-right`}>
                          <Button variant="secondary" size="sm" onClick={() => deshacer(c.id)}>
                            Deshacer
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-fg-muted">
            Un cobro que entró en una liquidación no se puede revertir hasta deshacerla.
          </p>
        </section>
      )}

      {/* ── Reglas ────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Reglas</h2>
        {data.reglas.length === 0 ? (
          <EmptyState
            title="Sin reglas cargadas"
            description="Una regla dice qué porcentaje le toca a quién, sobre qué cliente y desde cuándo. La del cliente le gana a la general."
          />
        ) : (
          <div className="rounded-xl border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-surface-muted border-b border-line">
                <tr>
                  <th className={TH}>Vendedor</th>
                  <th className={TH}>Cliente</th>
                  <th className={`${TH} text-right`}>%</th>
                  <th className={TH}>Vigencia</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {data.reglas.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-b-0">
                    <td className={TD}>{r.vendedorNombre}</td>
                    <td className={`${TD} text-fg-secondary`}>
                      {r.clienteNombre ?? "Todos los clientes"}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{r.porcentaje}%</td>
                    <td className={`${TD} text-fg-secondary whitespace-nowrap`}>
                      {fmtFecha(r.vigenteDesde)} → {r.vigenteHasta ? fmtFecha(r.vigenteHasta) : "sin fin"}
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setEditandoId(r.id);
                            setForm({
                              teamMemberId: r.teamMemberId,
                              clientId: r.clientId ?? "",
                              porcentaje: String(r.porcentaje),
                              vigenteDesde: r.vigenteDesde,
                              vigenteHasta: r.vigenteHasta ?? "",
                              notas: r.notas ?? "",
                            });
                          }}
                        >
                          Editar
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => borrarRegla(r.id)}>
                          Borrar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form && (
        <Modal
          open
          onClose={() => {
            setForm(null);
            setEditandoId(null);
          }}
          title={editandoId ? "Editar regla" : "Nueva regla de comisión"}
          description="El porcentaje se aplica sobre lo COBRADO. Sin cliente, la regla vale para todos; con cliente, le gana a la general."
        >
          <div className="space-y-3">
            <Field label="Vendedor">
              <Select
                value={form.teamMemberId}
                onChange={(e) => setForm({ ...form, teamMemberId: e.target.value })}
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cliente" hint="Vacío = todos los clientes (la regla general).">
              <Select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">Todos los clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Porcentaje">
                <Input
                  value={form.porcentaje}
                  onChange={(e) => setForm({ ...form, porcentaje: e.target.value })}
                  inputMode="decimal"
                  placeholder="13"
                />
              </Field>
              <Field label="Desde">
                <Input
                  type="date"
                  value={form.vigenteDesde}
                  onChange={(e) => setForm({ ...form, vigenteDesde: e.target.value })}
                />
              </Field>
              <Field label="Hasta" hint="Vacío = sin fin.">
                <Input
                  type="date"
                  value={form.vigenteHasta}
                  onChange={(e) => setForm({ ...form, vigenteHasta: e.target.value })}
                />
              </Field>
            </div>
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
              <Button onClick={guardarRegla} disabled={guardando || !form.teamMemberId}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
