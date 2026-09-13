"use client";

/**
 * components/cobranza/NumerosFacturaOdoo.tsx — «Números», dentro del lote del libro de Alex (etapa 11).
 *
 * El número de factura propuesto para cada cuota que no lo tiene (lib/cobranza/odoo/numero-propuesta.ts):
 *   · del LIBRO: el número y el mes llevan a la cuota de esa cuenta con el mismo monto;
 *   · del ESPEJO: una cuota facturada que el libro no nombra, con la factura de Odoo del mismo monto y la
 *     fecha más cercana.
 *
 * «Es esta» escribe UNA fila, por el PATCH del cobro: el chokepoint normaliza el número, frena con un 409
 * si ya está en otra cuenta y firma con el email de quien lo toca (lib/cobranza/numero-factura.ts). Si la
 * factura tiene otra fecha, la fecha de emisión pasa a ser la del documento, y la fila lo dice antes.
 *
 * ⛔ Lo que se manda es `opcion.patch`, que por tipo no tiene lugar para un estado: anotar el número de una
 * factura no dice si se cobró. Lo vigila numero-propuesta.test.ts sobre este archivo.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { CuotaParaNumerar } from "@/lib/cobranza/odoo/numero-propuesta";
import type { RespuestaDeNumeros } from "@/lib/cobranza/libro-alex-server";
import { etiquetaMes, fmtFecha, fmtMonto } from "./format";

const ETIQUETA_ESTADO: Record<string, string> = { PROGRAMADO: "Programado", POR_COBRAR: "Por cobrar", COBRADO: "Cobrado", SIN_DATO: "Sin dato" };

export default function NumerosFacturaOdoo({ importId }: { importId: string }) {
  const toast = useToast();
  const [datos, setDatos] = useState<RespuestaDeNumeros | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anotadas, setAnotadas] = useState<ReadonlySet<string>>(new Set());
  const [guardando, setGuardando] = useState<string | null>(null);
  const [verSinCuota, setVerSinCuota] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const d = await fetchJson<RespuestaDeNumeros>(`/api/cobranza/import/${importId}/numeros`);
        if (vigente) setDatos(d);
      } catch (e) {
        if (vigente) setError(e instanceof ApiError ? e.message : "No se pudieron proponer los números.");
      }
    })();
    return () => {
      vigente = false;
    };
  }, [importId]);

  const grupos = useMemo(() => {
    const porCuenta = new Map<string, CuotaParaNumerar[]>();
    for (const q of datos?.numeros.cuotas ?? []) {
      if (anotadas.has(q.cobroId)) continue;
      porCuenta.set(q.cuentaNombre, [...(porCuenta.get(q.cuentaNombre) ?? []), q]);
    }
    return [...porCuenta];
  }, [datos, anotadas]);

  async function esEsta(q: CuotaParaNumerar) {
    if (guardando) return;
    setGuardando(q.cobroId);
    try {
      await fetchJson(`/api/cobranza/cobros/${q.cobroId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(q.opcion.patch),
      });
      setAnotadas((s) => new Set(s).add(q.cobroId));
      toast.success(`Factura ${q.opcion.numero} anotada a tu nombre en ${q.cuentaNombre}.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo anotar el número.");
    } finally {
      setGuardando(null);
    }
  }

  if (error) {
    return (
      <Alert variant="warning">
        <p className="text-xs">{error}</p>
      </Alert>
    );
  }
  if (!datos) return <p className="text-xs text-fg-muted">Buscando en el libro el número de cada cuota…</p>;

  const { numeros, faltaSqlNumeros } = datos;
  const pendientes = grupos.reduce((n, [, qs]) => n + qs.length, 0);

  return (
    <div className="space-y-3">
      <Alert variant="info">
        <p className="text-xs">
          Cada número sale del libro: el número y el mes llevan a la cuota de la cuenta con el mismo monto. Revisalo y tocá «Es
          esta»: queda anotado a tu nombre, cuota por cuota. Las cuotas facturadas que el libro no nombra traen la factura del
          espejo de Odoo con el mismo monto y la fecha más cercana. Montos sin IVA, igual que los cobros.
        </p>
      </Alert>
      {faltaSqlNumeros && (
        <Alert variant="warning">
          <p className="text-xs">
            Todavía no se puede guardar: la base no tiene los números de factura de los cobros (falta el SQL de la etapa 7). La
            propuesta se ve igual.
          </p>
        </Alert>
      )}

      <p className="text-[11px] text-fg-muted">
        {pendientes} cuotas con número propuesto · {anotadas.size} anotadas ahora · {numeros.yaAnotados} documentos del libro ya
        estaban anotados · {numeros.sinCuota.length} sin cuota
      </p>

      {grupos.length === 0 && <p className="text-xs text-fg-muted">No quedan cuotas con un número para anotar.</p>}

      {grupos.map(([cuenta, cuotas]) => (
        <div key={cuenta} className="space-y-1.5">
          <p className="text-xs font-semibold text-fg">{cuenta}</p>
          <ul className="space-y-1.5">
            {cuotas.map((q) => (
              <li key={q.cobroId} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-line bg-surface px-3 py-2">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-xs text-fg">
                    <span className="font-medium">{etiquetaMes(q.periodo)}</span> · {fmtMonto(q.monto, q.moneda)} ·{" "}
                    {ETIQUETA_ESTADO[q.estado] ?? q.estado}
                    {q.numCuota != null && ` · cuota #${q.numCuota}`}
                  </p>
                  <p className="truncate text-[10px] text-fg-muted">{q.servicio}</p>
                </div>
                <div className="min-w-[14rem] flex-[2] space-y-0.5">
                  <p className="flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-semibold text-fg">{q.opcion.numero}</span>
                    <span className="text-fg-secondary">
                      {fmtFecha(q.opcion.fechaFactura)} · {fmtMonto(q.opcion.montoFactura, q.opcion.moneda)}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                        q.opcion.origen === "LIBRO"
                          ? "border-success-line bg-success-surface text-success-ink"
                          : "border-info-line bg-info-surface text-info-ink"
                      }`}
                    >
                      {q.opcion.origen === "LIBRO" ? "del libro" : "del espejo"}
                    </span>
                    {q.opcion.cuotas > 1 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line bg-surface-muted text-fg-muted">
                        una factura para {q.opcion.cuotas} cuotas
                      </span>
                    )}
                    {!q.opcion.enEspejo && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-warn-line bg-warn-surface text-warn-ink">
                        todavía no está en el espejo
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-fg-muted">{q.opcion.detalle}</p>
                  {q.opcion.patch.fechaEmision && (
                    <p className="text-[10px] text-warn-ink">
                      {q.fechaEmision
                        ? `La fecha de emisión pasa de ${fmtFecha(q.fechaEmision)} a ${fmtFecha(q.opcion.patch.fechaEmision)}, la de la factura.`
                        : `Queda marcada facturada el ${fmtFecha(q.opcion.patch.fechaEmision)}, la fecha de la factura.`}
                    </p>
                  )}
                  {q.sinNumeroFacturaMotivo && (
                    <p className="text-[10px] text-fg-muted">Reemplaza «no tengo el número» ({q.sinNumeroFacturaMotivo}).</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void esEsta(q)}
                  disabled={faltaSqlNumeros || guardando !== null}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {guardando === q.cobroId ? "Anotando…" : "Es esta"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {numeros.sinCuota.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <button type="button" onClick={() => setVerSinCuota((v) => !v)} className="text-xs font-medium text-fg-secondary hover:text-fg">
            {verSinCuota ? "Ocultar" : "Ver"} los {numeros.sinCuota.length} documentos del libro sin cuota, y por qué
          </button>
          {verSinCuota && (
            <ul className="mt-2 space-y-1">
              {numeros.sinCuota.map((s) => (
                <li key={s.numero} className="text-[11px]">
                  <span className="font-medium text-fg">{s.numero}</span>{" "}
                  <span className="text-fg-muted">
                    {s.cliente}
                    {s.periodo ? ` · ${etiquetaMes(s.periodo)}` : ""}
                  </span>{" "}
                  — <span className="text-fg-secondary">{s.motivo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
