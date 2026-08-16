"use client";

/**
 * components/finanzas/LibroPlanillaPanel.tsx
 *
 * El LIBRO: lo que se pagó, agrupado por mes y partido en Q1 (1–15) y Q2
 * (16–fin) — la misma lectura que la cola de cuentas por cobrar, que era el
 * pedido: "deben verse similar a las cuentas por cobrar, por meses (15 y 30s)".
 *
 * Molde: el encabezado de grupo con totales por moneda SEPARADOS viene de
 * `ColaCobros`, y la fila expandible de `ProyeccionPanel` (Set de keys abiertas
 * + toggle inmutable). Al abrir una fila se ve el desglose: base + cada comisión
 * con su origen.
 *
 * ⚠ Una quincena PAGADA es intocable — sin editar y sin borrar. Es plata que ya
 * salió; el server lo frena con 409 y acá directamente no se ofrece el control.
 */

import { Fragment, useMemo, useState } from "react";
import type { LibroPlanillaDTO, PagoPlanillaDTO } from "@/lib/cobranza";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Button, PageHeader, EmptyState, Modal, Field, Input } from "@/components/ui";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import { periodoDe, quincenaDe } from "@/lib/cobranza/planilla";

interface Props {
  initialLibro: LibroPlanillaDTO;
  todayISO: string;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-08" → "agosto 2026". Sin `new Date`: determinístico SSR y browser. */
function etiquetaPeriodo(p: string): string {
  const m = Number(p.slice(5, 7));
  return `${MESES[m - 1] ?? p} ${p.slice(0, 4)}`;
}

/** Totales por moneda SEPARADOS — CRC y USD jamás se suman (regla del módulo). */
function totalesPorMoneda(pagos: PagoPlanillaDTO[]): { CRC: number; USD: number } {
  const t = { CRC: 0, USD: 0 };
  for (const p of pagos) {
    if (p.moneda === "CRC" || p.moneda === "USD") t[p.moneda] += p.totalConComisiones;
  }
  return { CRC: Math.round(t.CRC * 100) / 100, USD: Math.round(t.USD * 100) / 100 };
}

export default function LibroPlanillaPanel({ initialLibro, todayISO }: Props) {
  const toast = useToast();
  const [libro, setLibro] = useState(initialLibro);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [generando, setGenerando] = useState(false);
  const [pagando, setPagando] = useState<PagoPlanillaDTO | null>(null);

  const periodoHoy = periodoDe(todayISO);
  const quincenaHoy = quincenaDe(todayISO);

  const grupos = useMemo(() => {
    const porPeriodo = new Map<string, PagoPlanillaDTO[]>();
    for (const p of libro.pagos) {
      const lista = porPeriodo.get(p.periodo);
      if (lista) lista.push(p);
      else porPeriodo.set(p.periodo, [p]);
    }
    // Del más nuevo al más viejo: lo que se está pagando ahora va arriba.
    return [...porPeriodo.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [libro.pagos]);

  function toggle(id: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refrescar() {
    try {
      const data = await fetchJson<{ libro: LibroPlanillaDTO }>(
        "/api/cobranza/costos/pagos-planilla",
      );
      setLibro(data.libro);
    } catch {
      toast.error("No se pudo refrescar el libro. Recargá la página.");
    }
  }

  async function generar() {
    setGenerando(true);
    try {
      const r = await fetchJson<{
        resultado: { creadas: number; yaExistian: number; sinPersona: number };
      }>("/api/cobranza/costos/pagos-planilla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo: periodoHoy, quincena: quincenaHoy }),
      });
      await refrescar();
      const { creadas, yaExistian, sinPersona } = r.resultado;
      toast.success(
        `${creadas} quincena${creadas === 1 ? "" : "s"} generada${creadas === 1 ? "" : "s"}` +
          (yaExistian > 0 ? ` · ${yaExistian} ya estaba${yaExistian === 1 ? "" : "n"}` : "") +
          (sinPersona > 0 ? ` · ${sinPersona} salario${sinPersona === 1 ? "" : "s"} sin persona ligada` : ""),
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo generar la quincena.");
    } finally {
      setGenerando(false);
    }
  }

  const pendientes = libro.pagos.filter((p) => p.estado === "PENDIENTE");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historial de planilla"
        description="Lo que se pagó de verdad, quincena por quincena. Lo que cuesta por mes con la configuración de hoy está en Planillas."
        backHref="/finanzas/costos/planillas"
        action={
          <Button onClick={generar} disabled={generando}>
            {generando ? "Generando…" : `Generar ${etiquetaPeriodo(periodoHoy)} · Q${quincenaHoy}`}
          </Button>
        }
      />

      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
        <p className="text-[11px] text-fg-muted">
          Cobertura del libro: <span className="text-fg-secondary">{libro.cobertura.texto}</span>
          {pendientes.length > 0 && (
            <> · {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"} de pagar</>
          )}
        </p>
      </div>

      {libro.pagos.length === 0 ? (
        <EmptyState
          title="El libro está vacío"
          description="Generá la quincena corriente para materializar las filas de cada persona con salario activo."
        />
      ) : (
        <div className="space-y-5">
          {grupos.map(([periodo, pagos]) => (
            <div key={periodo} className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">
                {etiquetaPeriodo(periodo)}
              </p>
              {([1, 2] as const).map((q) => {
                const delQ = pagos.filter((p) => p.quincena === q);
                if (delQ.length === 0) return null;
                const t = totalesPorMoneda(delQ);
                return (
                  <div key={q} className="rounded-xl border border-line bg-surface overflow-hidden">
                    <div className="flex items-baseline gap-2 flex-wrap px-3 py-2 bg-surface-muted border-b border-line">
                      <p className="text-[11px] font-medium text-fg-secondary">
                        {q === 1 ? "Q1 · del 1 al 15" : "Q2 · del 16 al fin de mes"}
                      </p>
                      <span className="text-[11px] text-fg-muted">({delQ.length})</span>
                      <span className="ml-auto text-[11px] text-fg-muted tabular-nums">
                        {[
                          t.CRC > 0 ? fmtMonto(t.CRC, "CRC") : null,
                          t.USD > 0 ? fmtMonto(t.USD, "USD") : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <ul>
                      {delQ.map((p) => (
                        <Fragment key={p.id}>
                          <FilaPago
                            p={p}
                            abierto={abiertos.has(p.id)}
                            onToggle={() => toggle(p.id)}
                            onPagar={() => setPagando(p)}
                          />
                        </Fragment>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {pagando && (
        <PagarModal
          pago={pagando}
          todayISO={todayISO}
          onClose={() => setPagando(null)}
          onPagado={async () => {
            setPagando(null);
            await refrescar();
          }}
        />
      )}
    </div>
  );
}

function FilaPago({
  p,
  abierto,
  onToggle,
  onPagar,
}: {
  p: PagoPlanillaDTO;
  abierto: boolean;
  onToggle: () => void;
  onPagar: () => void;
}) {
  const moneda = p.moneda as "CRC" | "USD";
  const pagado = p.estado === "PAGADO";
  const tieneDetalle = p.comisiones.length > 0;

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2">
        <button
          type="button"
          onClick={tieneDetalle ? onToggle : undefined}
          className={`flex items-center gap-1.5 min-w-0 ${
            tieneDetalle ? "cursor-pointer hover:underline" : "cursor-default"
          }`}
          title={tieneDetalle ? "Ver el desglose" : undefined}
        >
          <svg
            className={`w-3 h-3 shrink-0 text-fg-muted transition-transform ${
              abierto ? "rotate-90" : ""
            } ${tieneDetalle ? "" : "invisible"}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-xs font-medium text-fg truncate">{p.sujetoNombre}</span>
        </button>

        <span className="text-[11px] text-fg-muted flex-shrink-0">
          {fmtFecha(p.fechaProgramada)}
        </span>

        {pagado ? (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-emerald-600 bg-emerald-500/10 border-emerald-500/30 flex-shrink-0"
            title={
              p.confirmadoPor
                ? `Registrado por ${p.confirmadoPor}${p.fechaPago ? ` · pagado el ${fmtFecha(p.fechaPago)}` : ""}`
                : undefined
            }
          >
            Pagado
          </span>
        ) : (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line bg-surface-muted text-fg-muted flex-shrink-0">
            Pendiente
          </span>
        )}

        <span className="ml-auto text-xs text-fg tabular-nums flex-shrink-0">
          {fmtMonto(p.totalConComisiones, moneda)}
          {tieneDetalle && (
            <span className="ml-1 text-[11px] text-fg-muted">
              (base {fmtMonto(p.monto, moneda)})
            </span>
          )}
        </span>

        {!pagado && (
          <Button variant="secondary" size="sm" onClick={onPagar} className="flex-shrink-0">
            Registrar pago
          </Button>
        )}
      </div>

      {abierto && tieneDetalle && (
        <div className="px-3 pb-2 pl-10 space-y-1">
          <p className="text-[11px] text-fg-muted">
            Salario base {fmtMonto(p.monto, moneda)}
          </p>
          {p.comisiones.map((c) => (
            <p key={c.id} className="text-[11px] text-fg-secondary">
              Comisión {fmtMonto(c.monto, c.moneda as "CRC" | "USD")} —{" "}
              {c.porcentaje}% sobre {fmtMonto(c.base, c.moneda as "CRC" | "USD")} cobrados
              {c.moneda !== p.moneda && (
                <span className="text-warn-ink"> · en otra moneda, no suma al total</span>
              )}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}

function PagarModal({
  pago,
  todayISO,
  onClose,
  onPagado,
}: {
  pago: PagoPlanillaDTO;
  todayISO: string;
  onClose: () => void;
  onPagado: () => void;
}) {
  const toast = useToast();
  const [fecha, setFecha] = useState(todayISO);
  const [guardando, setGuardando] = useState(false);

  async function pagar() {
    setGuardando(true);
    try {
      await fetchJson(`/api/cobranza/costos/pagos-planilla/${pago.id}/pagar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaPago: fecha }),
      });
      toast.success("Quincena registrada a tu nombre.");
      onPagado();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar el pago.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Pagar la quincena de ${pago.sujetoNombre}`}
      description="Queda registrada a tu nombre y no se puede editar después."
    >
      <div className="space-y-3">
        <p className="text-xs text-fg-secondary">
          {fmtMonto(pago.monto, pago.moneda as "CRC" | "USD")} · Q{pago.quincena} de{" "}
          {etiquetaPeriodo(pago.periodo)}
        </p>
        <Field label="Fecha del pago" hint="Se puede poner hacia atrás: la plata suele salir antes de registrarse.">
          <Input
            type="date"
            value={fecha}
            max={todayISO}
            onChange={(e) => setFecha(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={pagar} disabled={guardando}>
            {guardando ? "Registrando…" : "Registrar pago"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
