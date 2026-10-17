"use client";

/**
 * components/finanzas/GastosFinancieros.tsx — Conciliación › «Gastos y Mercury» › Gastos financieros (plan «Un solo libro
 * financiero», paso 4, 2026-10-17).
 *
 * Las comisiones de Stripe, de las transferencias internacionales y del banco, una por movimiento de Mercury: quien
 * revisa confirma cada una como gasto financiero (con su monto) o la descarta. Las confirmadas suman al punto de
 * equilibrio en su propio rubro. La regla de qué es candidato: lib/finanzas/gastos-financieros.ts.
 * ⛔ Nada entra solo, y nada se escribe en Mercury.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, ListSkeleton } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { ETIQUETA_TIPO, type CandidatoFinanciero, type GastoFinancieroDecidido, type TipoGastoFinanciero } from "@/lib/finanzas/gastos-financieros";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";

interface Revision {
  pendientes: CandidatoFinanciero[];
  decididos: GastoFinancieroDecidido[];
  totales: Record<TipoGastoFinanciero, number>;
  desde: string;
  sePuedeDecidir: boolean;
}

const COMO: Record<CandidatoFinanciero["como"], string> = {
  CARGO: "cargo exacto",
  CALZA: "diferencia con la factura",
  ESTIMADO: "estimado",
};

const BOTON = "rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-fg-secondary hover:bg-surface-hover disabled:opacity-50";

export default function GastosFinancieros({ puedeEditar }: { puedeEditar: boolean }) {
  const toast = useToast();
  const [datos, setDatos] = useState<Revision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verDecididos, setVerDecididos] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const d = await fetchJson<Revision>("/api/finanzas/gastos/financieros");
      setDatos(d);
      setMontos(Object.fromEntries(d.pendientes.map((c) => [c.movimientoId, c.montoPropuesto.toFixed(2)])));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar la lista.");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const decidir = async (c: CandidatoFinanciero, decision: "GASTO" | "NO_ES") => {
    const monto = Number((montos[c.movimientoId] ?? "").replace(",", "."));
    if (decision === "GASTO" && !(monto > 0)) {
      toast.error("Escribe el monto de la comisión.");
      return;
    }
    setOcupado(c.movimientoId);
    try {
      await fetchJson("/api/finanzas/gastos/financieros", {
        method: "POST",
        body: JSON.stringify({ movimientoId: c.movimientoId, decision, monto: decision === "GASTO" ? monto : null }),
      });
      toast.success(decision === "GASTO" ? `Anotado como gasto financiero: ${fmtMonto(monto, "USD")}.` : "Descartado: no es un gasto financiero.");
      await cargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(null);
    }
  };

  const deshacer = async (d: GastoFinancieroDecidido) => {
    setOcupado(d.id);
    try {
      await fetchJson(`/api/finanzas/gastos/financieros/${d.id}`, { method: "DELETE" });
      toast.success("Deshecho: vuelve a la lista.");
      await cargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo deshacer.");
    } finally {
      setOcupado(null);
    }
  };

  if (error && !datos) return <Alert variant="danger" title="No se pudieron cargar los gastos financieros">{error}</Alert>;
  if (!datos) return <ListSkeleton rows={4} />;

  const total = datos.totales.STRIPE + datos.totales.TRANSFERENCIA_INTERNACIONAL + datos.totales.BANCO;
  const editable = puedeEditar && datos.sePuedeDecidir;

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line px-4 py-2.5">
        <h3 className="text-sm font-semibold text-fg">Gastos financieros · {datos.pendientes.length} por revisar</h3>
        <p className="mt-0.5 text-xs text-fg-muted">
          Las comisiones de Stripe, de las transferencias internacionales y del banco, una por movimiento de Mercury desde el{" "}
          {fmtFecha(datos.desde)}. Confirma cada una con su monto (o descártala): las confirmadas suman al punto de equilibrio
          como gasto financiero. Confirmado hasta hoy: {fmtMonto(total, "USD")}
          {total > 0 &&
            ` (${(Object.keys(datos.totales) as TipoGastoFinanciero[])
              .filter((t) => datos.totales[t] > 0)
              .map((t) => `${ETIQUETA_TIPO[t].toLowerCase()} ${fmtMonto(datos.totales[t], "USD")}`)
              .join(" · ")})`}
          .
        </p>
      </header>

      {!datos.sePuedeDecidir && (
        <div className="px-4 pt-3">
          <Alert variant="warning" title="Falta el SQL de los gastos financieros">
            La lista se ve, pero no se puede decidir hasta aplicar scripts/sql/2026-10-17-ficha-f-libro-financiero.sql.
          </Alert>
        </div>
      )}

      {datos.pendientes.length === 0 ? (
        <p className="px-4 py-3 text-xs text-fg-muted">Nada por revisar: cada comisión de Mercury ya tiene su decisión.</p>
      ) : (
        <ul>
          {datos.pendientes.map((c) => (
            <li key={c.movimientoId} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-2.5 first:border-t-0">
              <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
                <span className="text-sm font-semibold text-fg">
                  {ETIQUETA_TIPO[c.tipo]} · {fmtFecha(c.fecha)}
                </span>
                <span className="text-[13px] leading-[19px] text-fg-secondary">{c.descripcion}</span>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-fg-muted" title={`Lo que propone Nexus: ${COMO[c.como]}.`}>
                US$
                <Input
                  className="w-24 text-right tabular-nums"
                  inputMode="decimal"
                  value={montos[c.movimientoId] ?? ""}
                  disabled={!editable}
                  onChange={(e) => setMontos((m) => ({ ...m, [c.movimientoId]: e.target.value }))}
                  aria-label="Monto de la comisión"
                />
                <span>{COMO[c.como]}</span>
              </label>
              {editable && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" disabled={ocupado !== null} onClick={() => void decidir(c, "GASTO")}>
                    Es gasto financiero
                  </Button>
                  <button type="button" className={BOTON} disabled={ocupado !== null} onClick={() => void decidir(c, "NO_ES")}>
                    No es
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {datos.decididos.length > 0 && (
        <div className="border-t border-line">
          <button
            type="button"
            onClick={() => setVerDecididos((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold text-fg-secondary hover:bg-surface-hover"
          >
            <span className="text-fg-muted">{verDecididos ? "▾" : "▸"}</span> Ya revisados ({datos.decididos.length})
          </button>
          {verDecididos && (
            <ul>
              {datos.decididos.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-[13px]">
                  <span className="min-w-0 flex-[1_1_320px] text-fg-secondary">
                    {ETIQUETA_TIPO[d.tipo]} · {fmtFecha(d.fecha)} · {d.descripcion}
                  </span>
                  <span className="tabular-nums text-fg">{d.decision === "GASTO" ? fmtMonto(d.monto, d.moneda) : "No es"}</span>
                  <span className="text-xs text-fg-muted">{d.decididoPor}</span>
                  {editable && (
                    <button type="button" className={BOTON} disabled={ocupado !== null} onClick={() => void deshacer(d)}>
                      Deshacer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
