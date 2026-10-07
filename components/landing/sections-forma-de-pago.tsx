"use client";

/**
 * components/landing/sections-forma-de-pago.tsx — la sección «Forma de pago» de la propuesta
 * (2026-10-07). Va debajo de «Inversión» y responde lo que el cliente pregunta después del precio:
 * cuántos pagos, cuándo y de cuánto, qué descuentos se aplicaron y qué se paga por mes después.
 *
 * ⭐ Los montos NO viven acá: salen de la Inversión del mismo documento por `ctx.propuesta.inversion`
 * (lib/landing/forma-de-pago.ts) y se recalculan en vivo. Esta sección guarda solo la forma: cuántas
 * cuotas, cuándo cae cada una, si alguna lleva un porcentaje fijo, qué cubre y desde cuándo corren
 * las mensualidades. El molde visual es el que Andrés armó a mano para ABG.
 */
import type { FC } from "react";
import { Editable } from "./inline";
import { landingLang, t } from "./i18n";
import type { SectionProps } from "./types";
import { formatRango } from "@/lib/landing/money";
import { cuotasDe, MAX_CUOTAS, planDePago, type FormaDePagoData, type PagoDeLaForma } from "@/lib/landing/forma-de-pago";

const dosDigitos = (n: number) => String(n).padStart(2, "0");

export const FormaDePagoSection: FC<SectionProps<FormaDePagoData>> = ({ data, ctx, editable, onChange }) => {
  const lang = landingLang(ctx.lang);
  const d: FormaDePagoData = data ?? {};
  const n = cuotasDe(d);
  const plan = planDePago(d, ctx.propuesta?.inversion ?? null, lang);
  const dinero = (r: { min: number; max: number }) => formatRango(r, plan.moneda);
  const set = (next: Partial<FormaDePagoData>) => onChange?.({ ...d, ...next });

  /** Escribe UN campo de UN pago, completando los anteriores para que el índice no se corra. */
  const setPago = (i: number, campo: keyof PagoDeLaForma, valor: string) => {
    const pagos = Array.from({ length: Math.max(n, d.pagos?.length ?? 0) }, (_, j) => ({ ...(d.pagos?.[j] ?? {}) }));
    pagos[i] = { ...pagos[i], [campo]: valor };
    set({ pagos });
  };

  const unidad = n === 1 ? t(lang, "fpPago") : t(lang, "fpPagos");
  const primero = plan.pagos[0];
  const formaNota = n === 1 ? "" : plan.iguales ? t(lang, "fpIguales") : `${primero.nombre}: ${primero.porcentaje} %.`;
  const hayCalendario = n > 1 || plan.recurrentes.length > 0;

  return (
    <div className="stl-fp">
      {editable && (
        <div className="stl-fp-edit">
          <span className="stl-fp-edit-label">{t(lang, "fpCuantosPagos")}</span>
          <div className="stl-fp-cuotas" role="radiogroup" aria-label={t(lang, "fpCuantosPagos")}>
            {Array.from({ length: MAX_CUOTAS }, (_, i) => i + 1).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === n}
                className={`stl-fp-cuota${k === n ? " is-on" : ""}`}
                onClick={() => set({ cuotas: String(k) })}
              >
                {k}
              </button>
            ))}
          </div>
          {!plan.total && (
            <span className="stl-fp-edit-aviso">
              {plan.pendientes > 0
                ? `Hay ${plan.pendientes === 1 ? "una línea" : `${plan.pendientes} líneas`} de «Inversión» sin un monto que se pueda sumar: completa los montos y aquí se reparten solos.`
                : "Pon los montos en «Inversión» y aquí se reparten solos, con sus descuentos."}
            </span>
          )}
          {plan.problema && <span className="stl-fp-edit-aviso is-error">{plan.problema}</span>}
        </div>
      )}

      {/* ── El resumen: cuánto, en cuántos pagos y de cuánto cada uno ─────────────────── */}
      <div className="stl-fp-resumen">
        {plan.total && (
          <div className="stl-fp-card is-total">
            <span className="stl-fp-card-label">{t(lang, "fpInversionTotal")}</span>
            <span className="stl-fp-card-value">
              {dinero(plan.total)}
              {plan.moneda && <span className="stl-fp-card-moneda"> {plan.moneda}</span>}
            </span>
            <Editable
              as="span"
              className="stl-fp-card-note"
              value={d.resumen ?? ""}
              editable={editable}
              placeholder="Qué cubre: lo que se implementa, en una línea"
              onCommit={(v) => set({ resumen: v })}
            />
          </div>
        )}
        <div className="stl-fp-card">
          <span className="stl-fp-card-label">{t(lang, "fpFormaDePago")}</span>
          <span className="stl-fp-card-value">{`${n} ${unidad}`}</span>
          {formaNota && <span className="stl-fp-card-note">{formaNota}</span>}
        </div>
        {plan.total && primero.monto && (
          <div className="stl-fp-card">
            <span className="stl-fp-card-label">{plan.iguales ? t(lang, "fpValorPorPago") : primero.nombre}</span>
            <span className="stl-fp-card-value">{dinero(primero.monto)}</span>
            <span className="stl-fp-card-note">
              {plan.iguales ? `${plan.moneda ? `${plan.moneda} ` : ""}${t(lang, "fpPorCuota")}` : `${primero.porcentaje} % ${t(lang, "fpDelTotal")}`}
            </span>
          </div>
        )}
      </div>

      {/* ── El beneficio comercial: los descuentos por línea de la Inversión ──────────── */}
      {plan.beneficio && (
        <div className="stl-fp-beneficio">
          <div className="stl-fp-beneficio-num">
            <span className="stl-fp-card-label">{t(lang, "fpBeneficio")}</span>
            <span className="stl-fp-beneficio-valor">−{dinero(plan.beneficio)}</span>
          </div>
          <div className="stl-fp-beneficio-detalle">
            <span className="stl-fp-beneficio-titulo">{t(lang, "fpDescuentosAplicados")}</span>
            <div className="stl-fp-chips">
              {plan.descuentos.map((x, i) => (
                <span key={i} className="stl-fp-chip">
                  {x.concepto} <b>−{dinero(x.monto)}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Los pagos ──────────────────────────────────────────────────────────────── */}
      <div className="stl-fp-tabla" role="table">
        <div className="stl-fp-fila is-head" role="row">
          <span role="columnheader">{t(lang, "fpPagoCol")}</span>
          <span role="columnheader">{t(lang, "fpMomentoCol")}</span>
          <span role="columnheader" className="stl-fp-valor">
            {plan.total ? t(lang, "fpValorCol") : "%"}
          </span>
        </div>
        {plan.pagos.map((p, i) => (
          <div key={i} className="stl-fp-fila" role="row">
            <span className="stl-fp-pago" role="cell">
              <span className="stl-fp-num">{dosDigitos(i + 1)}</span>
              <span className="stl-fp-nombre">{p.nombre}</span>
            </span>
            <span className="stl-fp-momento" role="cell">
              <Editable
                as="span"
                value={d.pagos?.[i]?.momento ?? ""}
                editable={editable}
                placeholder={p.momento}
                onCommit={(v) => setPago(i, "momento", v)}
              />
              {!editable && !(d.pagos?.[i]?.momento ?? "").trim() && p.momento}
              {editable && (
                <span className="stl-fp-edit-fila">
                  <label>
                    {t(lang, "fpEnElCalendario")}
                    <input
                      value={d.pagos?.[i]?.cuando ?? ""}
                      placeholder={p.cuando}
                      onChange={(e) => setPago(i, "cuando", e.target.value)}
                      aria-label={`${p.nombre}: rótulo del calendario`}
                    />
                  </label>
                  <label>
                    %
                    <input
                      value={d.pagos?.[i]?.porcentaje ?? ""}
                      placeholder="parejo"
                      inputMode="decimal"
                      onChange={(e) => setPago(i, "porcentaje", e.target.value)}
                      aria-label={`${p.nombre}: porcentaje fijo (vacío = parte igual)`}
                    />
                  </label>
                </span>
              )}
            </span>
            <span className="stl-fp-valor" role="cell">
              {p.monto ? dinero(p.monto) : `${p.porcentaje} %`}
            </span>
          </div>
        ))}
        {plan.total && (
          <div className="stl-fp-fila is-total" role="row">
            <span className="stl-fp-total-texto" role="cell">
              <b>{t(lang, "fpTotalImplementacion")}</b>
              <span>{t(lang, "fpTotalNota")}</span>
            </span>
            <span role="cell" />
            <span className="stl-fp-valor stl-fp-total-valor" role="cell">
              {dinero(plan.total)}
            </span>
          </div>
        )}
      </div>

      {/* ── Lo que se paga por mes después: no entra en los pagos ──────────────────── */}
      {plan.recurrentes.map((r, i) => (
        <div key={i} className="stl-fp-recurrente">
          <span className="stl-fp-recurrente-icono" aria-hidden>
            ⇄
          </span>
          <span className="stl-fp-recurrente-texto">
            <b>{r.concepto}</b>
            <span>
              {lang === "en" ? "Starts from " : "Inicia a partir del "}
              <Editable
                as="span"
                value={d.recurrenteDesde ?? ""}
                editable={editable}
                placeholder={plan.recurrenteDesde}
                onCommit={(v) => set({ recurrenteDesde: v })}
              />
              {!editable && !(d.recurrenteDesde ?? "").trim() && plan.recurrenteDesde}
              {lang === "en" ? ", once the implementation is complete." : ", una vez finalizada la implementación."}
              {r.detalle ? ` ${r.detalle}` : ""}
            </span>
          </span>
          {r.monto && (
            <span className="stl-fp-recurrente-monto">
              <b>{dinero(r.monto)}</b>
              <span>{`${plan.moneda ? `${plan.moneda} ` : ""}/ ${t(lang, "fpMes")}`}</span>
            </span>
          )}
        </div>
      ))}

      {/* ── El calendario ──────────────────────────────────────────────────────────── */}
      {hayCalendario && (
        <div className="stl-fp-calendario">
          <span className="stl-fp-card-label">{t(lang, "fpCalendario")}</span>
          <ol className="stl-fp-linea">
            {plan.pagos.map((p, i) => (
              <li key={i}>
                <span className="stl-fp-punto">{dosDigitos(i + 1)}</span>
                <b>{p.cuando}</b>
                <span>{p.monto ? dinero(p.monto) : `${p.porcentaje} %`}</span>
              </li>
            ))}
            {plan.recurrentes.length > 0 && (
              <li className="is-recurrente">
                <span className="stl-fp-punto">↻</span>
                <b>{`${t(lang, "fpDesde")} ${plan.recurrenteDesde}`}</b>
                <span>
                  {plan.recurrentes.every((r) => r.monto)
                    ? `${dinero({
                        min: plan.recurrentes.reduce((a, r) => a + (r.monto?.min ?? 0), 0),
                        max: plan.recurrentes.reduce((a, r) => a + (r.monto?.max ?? 0), 0),
                      })} / ${t(lang, "fpMes")}`
                    : t(lang, "fpMensual")}
                </span>
              </li>
            )}
          </ol>
        </div>
      )}

      {(d.nota || editable) && (
        <Editable
          as="p"
          className="stl-fp-nota"
          value={d.nota ?? ""}
          editable={editable}
          placeholder="Condiciones: impuestos, facturación, moneda de pago (opcional)"
          onCommit={(v) => set({ nota: v })}
        />
      )}
    </div>
  );
};
