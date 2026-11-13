"use client";

/**
 * components/finanzas/PlanillaEnDolares.tsx — la planilla en dólares al tipo de cambio de hoy, y el aviso cuando el tipo
 * de cambio se mueve contra el de referencia (2026-11-13, lib/finanzas/tipo-cambio-planilla.ts).
 *
 * Dos usos: en Planillas, con la plata (`planilla`); en Tipo de cambio, solo el aviso (sin `planilla`: esa página la ve
 * quien no ve salarios). Los topes los cambia solo Super Admin (`puedeEditarTopes`).
 */
import { useState } from "react";
import { Alert, Button, Field, Input, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { textoDeMontos } from "@/lib/cobranza/odoo/diferencias";
import {
  errorDeUmbrales,
  nombreDelMes,
  textoDelMovimiento,
  type MovimientoDelTipoDeCambio,
  type PlanillaEnDolares as Planilla,
} from "@/lib/finanzas/tipo-cambio-planilla";
import type { UmbralesGuardados } from "@/lib/finanzas/tipo-cambio-planilla-server";
import { fmtFecha } from "@/components/cobranza/format";

const tasa = (n: number) => `₡${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toLocaleString("es-CR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} %`;
const usd = (n: number) => textoDeMontos([{ moneda: "USD", monto: n }]);

const TITULO = { normal: "Tipo de cambio estable", vigilar: "Vigilar el tipo de cambio", decidir: "Decidir: el tipo de cambio se movió" } as const;
const VARIANTE = { normal: "info", vigilar: "warning", decidir: "danger" } as const;

export default function PlanillaEnDolares({
  movimiento,
  umbrales: inicial,
  planilla,
  puedeEditarTopes,
}: {
  movimiento: MovimientoDelTipoDeCambio | null;
  umbrales: UmbralesGuardados;
  /** null = no se muestra la plata (la página no es de salarios) o no hay con qué convertir. */
  planilla?: Planilla | null;
  puedeEditarTopes: boolean;
}) {
  const [umbrales, setUmbrales] = useState(inicial);
  const [editando, setEditando] = useState(false);

  // Con los topes recién cambiados el nivel se recalcula acá, igual que en el servidor.
  const nivel = !movimiento
    ? null
    : Math.abs(movimiento.pct) >= umbrales.decidirPct
      ? "decidir"
      : Math.abs(movimiento.pct) >= umbrales.vigilarPct
        ? "vigilar"
        : "normal";

  return (
    <section aria-label="La planilla y el tipo de cambio" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-sm font-semibold text-fg">{planilla !== undefined ? "La planilla en dólares" : "El tipo de cambio y la planilla"}</h2>
        <span className="text-xs text-fg-muted">
          Avisa desde {pct(umbrales.vigilarPct)} (vigilar) y desde {pct(umbrales.decidirPct)} (decidir), para arriba o para abajo.
        </span>
        {puedeEditarTopes && (
          <button type="button" className="ml-auto text-xs font-semibold text-brand hover:text-brand-light" onClick={() => setEditando(true)}>
            Cambiar los topes
          </button>
        )}
      </div>

      {!movimiento || !nivel ? (
        <p className="text-[13px] text-fg-muted">
          Todavía no hay con qué comparar: falta el tipo de cambio de esta semana o el de algún mes ya cerrado. Lo trae el BCCR cada día
          (Finanzas › Tipo de cambio).
        </p>
      ) : (
        <>
          <Alert variant={VARIANTE[nivel]} title={TITULO[nivel]}>
            {textoDelMovimiento(movimiento)}
            {planilla && planilla.colones > 0 && planilla.diferencia !== 0 && (
              <>
                {" "}
                La planilla {planilla.diferencia > 0 ? "sube" : "baja"} <strong className="font-semibold">{usd(Math.abs(planilla.diferencia))}</strong> al mes.
              </>
            )}
          </Alert>

          <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-surface-muted p-3">
              <dt className="text-xs text-fg-muted">Tipo de cambio de hoy</dt>
              <dd className="text-lg font-semibold tabular-nums text-fg">{tasa(movimiento.hoy.venta)}</dd>
              <dd className="text-xs text-fg-muted">Venta del BCCR del {fmtFecha(movimiento.hoy.fecha)}.</dd>
            </div>
            <div className="rounded-lg border border-line bg-surface-muted p-3">
              <dt className="text-xs text-fg-muted">Tipo de cambio de referencia</dt>
              <dd className="text-lg font-semibold tabular-nums text-fg">{tasa(movimiento.referencia.crcPorUsd)}</dd>
              <dd className="text-xs text-fg-muted">
                Promedio de la venta del BCCR de {nombreDelMes(movimiento.referencia.periodo)}, el último mes cerrado
                {movimiento.referencia.completo ? "" : ` (le faltan días: tiene ${movimiento.referencia.dias})`}. Cambia el primer día de cada mes.
              </dd>
            </div>
            <div className="rounded-lg border border-line bg-surface-muted p-3">
              <dt className="text-xs text-fg-muted">Movimiento</dt>
              <dd className="text-lg font-semibold tabular-nums text-fg">
                {movimiento.pct > 0 ? "+" : movimiento.pct < 0 ? "−" : ""}
                {pct(Math.abs(movimiento.pct))}
              </dd>
              <dd className="text-xs text-fg-muted">
                (hoy − referencia) ÷ referencia. Negativo: el colón se fortaleció y lo que se paga en colones cuesta más dólares.
              </dd>
            </div>
          </dl>

          {planilla && (
            <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-3">
              <div className="rounded-lg border border-line p-3">
                <dt className="text-xs text-fg-muted">La planilla de un mes, en dólares, hoy</dt>
                <dd className="text-lg font-semibold tabular-nums text-fg">{usd(planilla.totalAlDeHoy)}</dd>
                <dd className="text-xs text-fg-muted">
                  {planilla.enDolares === 1 ? "1 salario" : `${planilla.enDolares} salarios`} en dólares ({usd(planilla.dolares)}) más{" "}
                  {planilla.enColones === 1 ? "1" : planilla.enColones} en colones ({textoDeMontos([{ moneda: "CRC", monto: planilla.colones }])}) pasados a
                  dólares al tipo de cambio de hoy ({usd(planilla.colonesAlDeHoy)}). Cada salario sigue guardado en su moneda.
                </dd>
              </div>
              <div className="rounded-lg border border-line p-3">
                <dt className="text-xs text-fg-muted">La misma planilla, a la referencia</dt>
                <dd className="text-lg font-semibold tabular-nums text-fg">{usd(planilla.totalAlDeReferencia)}</dd>
                <dd className="text-xs text-fg-muted">Los colones pasados con el promedio de {nombreDelMes(movimiento.referencia.periodo)} ({usd(planilla.colonesAlDeReferencia)}).</dd>
              </div>
              <div className="rounded-lg border border-line p-3">
                <dt className="text-xs text-fg-muted">Cuánto cambia al mes</dt>
                <dd className={`text-lg font-semibold tabular-nums ${planilla.diferencia > 0 ? "text-danger-ink" : planilla.diferencia < 0 ? "text-success-ink" : "text-fg"}`}>
                  {planilla.diferencia > 0 ? "+" : planilla.diferencia < 0 ? "−" : ""}
                  {usd(Math.abs(planilla.diferencia))}
                </dd>
                <dd className="text-xs text-fg-muted">
                  La planilla de hoy menos la de referencia. Solo se mueve la parte en colones: {planilla.enColones === 0 ? "hoy no hay salarios en colones." : "lo que está en dólares no cambia."}
                </dd>
              </div>
            </dl>
          )}
        </>
      )}

      {editando && (
        <TopesModal
          umbrales={umbrales}
          onClose={() => setEditando(false)}
          onGuardados={(u) => {
            setUmbrales(u);
            setEditando(false);
          }}
        />
      )}
    </section>
  );
}

function TopesModal({
  umbrales,
  onClose,
  onGuardados,
}: {
  umbrales: UmbralesGuardados;
  onClose: () => void;
  onGuardados: (u: UmbralesGuardados) => void;
}) {
  const toast = useToast();
  const [vigilar, setVigilar] = useState(String(umbrales.vigilarPct));
  const [decidir, setDecidir] = useState(String(umbrales.decidirPct));
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const valores = { vigilarPct: Number(vigilar), decidirPct: Number(decidir) };
  const error = vigilar.trim() && decidir.trim() ? errorDeUmbrales(valores) : "Escribe los dos porcentajes.";

  const guardar = async () => {
    setGuardando(true);
    setErrorServidor(null);
    try {
      const r = await fetchJson<{ umbrales: UmbralesGuardados }>("/api/finanzas/tipo-de-cambio/umbrales", {
        method: "PUT",
        body: JSON.stringify(valores),
      });
      toast.success("Topes guardados.");
      onGuardados(r.umbrales);
    } catch (e) {
      setErrorServidor(e instanceof ApiError ? e.message : "No se pudo guardar. Prueba de nuevo.");
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Los topes del aviso"
      description="Cuánto se puede mover el tipo de cambio de hoy contra el de referencia antes de avisar. Cuentan para arriba y para abajo."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={guardando || !!error} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Vigilar (amarillo), en %" hint="Lo acordado: 3 %.">
          <Input type="number" min="0" step="0.01" value={vigilar} onChange={(e) => setVigilar(e.target.value)} />
        </Field>
        <Field label="Decidir (rojo), en %" hint="Lo acordado: 5 %." error={error ?? errorServidor}>
          <Input type="number" min="0" step="0.01" value={decidir} onChange={(e) => setDecidir(e.target.value)} />
        </Field>
        {umbrales.actualizadoPor && umbrales.actualizadoEn && (
          <p className="text-xs text-fg-muted">
            Los cambió {umbrales.actualizadoPor.split("@")[0]} el {fmtFecha(umbrales.actualizadoEn)}.
          </p>
        )}
      </div>
    </Modal>
  );
}
