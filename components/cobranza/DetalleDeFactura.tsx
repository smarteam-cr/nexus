"use client";

/**
 * components/cobranza/DetalleDeFactura.tsx — el detalle de una factura de Odoo o de Mercury en un panel (plan «Un solo
 * libro financiero», paso 5, 2026-10-17): sus líneas, su nota y el mes del servicio que dice la nota.
 *
 * Se lee del sistema al abrirlo (GET /api/cobranza/facturas/detalle): no se guarda. ⛔ Solo mira.
 */
import { useEffect, useState } from "react";
import { Alert, Drawer, ListSkeleton } from "@/components/ui";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import type { DetalleDeFactura as Detalle } from "@/lib/cobranza/detalle-de-factura";
import { etiquetaMes, fmtFecha, fmtMonto } from "./format";

export interface FacturaParaVer {
  fuente: "ODOO" | "MERCURY";
  id: string;
  numero: string;
  /** El total que dice la copia, para compararlo con la suma de las líneas. */
  monto: number;
  moneda: string;
}

const DE = { ODOO: "Odoo", MERCURY: "Mercury" } as const;

export default function DetalleDeFactura({ factura, onClose }: { factura: FacturaParaVer | null; onClose: () => void }) {
  /* Lo leído queda con la clave de su factura: al abrir otra, lo de la anterior no se muestra. */
  const [leido, setLeido] = useState<{ clave: string; detalle: Detalle | null; error: string | null } | null>(null);
  const clave = factura ? `${factura.fuente}:${factura.id}` : null;

  useEffect(() => {
    if (!factura || !clave) return;
    let vivo = true;
    fetchJson<Detalle>(`/api/cobranza/facturas/detalle?fuente=${factura.fuente}&id=${encodeURIComponent(factura.id)}`)
      .then((d) => vivo && setLeido({ clave, detalle: d, error: null }))
      .catch((e) => vivo && setLeido({ clave, detalle: null, error: e instanceof ApiError ? e.message : "No se pudo leer la factura." }));
    return () => {
      vivo = false;
    };
  }, [factura, clave]);

  const detalle = leido && leido.clave === clave ? leido.detalle : null;
  const error = leido && leido.clave === clave ? leido.error : null;

  const descuadre = detalle && factura && Math.abs(detalle.totalLineas - Math.abs(factura.monto)) > 0.01;

  return (
    <Drawer open={factura !== null} onClose={onClose} size="lg" title={factura ? `${factura.numero} · ${DE[factura.fuente]}` : ""}>
      {!detalle && !error && (
        <div className="space-y-2">
          <p className="text-xs text-fg-muted">Leyendo la factura en {factura ? DE[factura.fuente] : "el sistema"}…</p>
          <ListSkeleton rows={4} lines={1} />
        </div>
      )}
      {error && <Alert variant="danger" title="No se pudo leer la factura">{error}</Alert>}
      {detalle && (
        <div className="space-y-4">
          <p className="text-xs text-fg-muted">
            {detalle.fecha ? `Del ${fmtFecha(detalle.fecha)}. ` : ""}Leído de {DE[detalle.fuente]} ahora, sin impuestos. Nexus no lo guarda.
          </p>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="text-xs text-fg-muted">Mes del servicio</div>
              <div className="text-sm font-semibold text-fg">
                {detalle.mesDelServicio ? etiquetaMes(detalle.mesDelServicio) : "La factura no lo dice"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="text-xs text-fg-muted">Suma de las líneas</div>
              <div className="text-sm font-semibold tabular-nums text-fg">{fmtMonto(detalle.totalLineas, detalle.moneda)}</div>
            </div>
          </div>

          {descuadre && (
            <Alert variant="warning" title="Las líneas no suman el total de la copia">
              La copia dice {fmtMonto(Math.abs(factura!.monto), factura!.moneda)} y las líneas suman {fmtMonto(detalle.totalLineas, detalle.moneda)}.
              Puede ser un descuento global o un redondeo; si no, vuelve a copiar desde {DE[detalle.fuente]}.
            </Alert>
          )}

          {detalle.lineas.length === 0 ? (
            <p className="text-sm text-fg-muted">La factura no trae líneas.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-fg-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Descripción</th>
                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-2 text-right font-medium">Precio</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.lineas.map((l, i) =>
                    l.tipo === "linea" ? (
                      <tr key={i} className="border-b border-line align-top last:border-0">
                        <td className="px-3 py-2">
                          <div className="whitespace-pre-line text-fg">{l.descripcion || "—"}</div>
                          {(l.producto || l.cuenta) && (
                            <div className="text-xs text-fg-muted">{[l.producto, l.cuenta].filter(Boolean).join(" · ")}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg-secondary">{l.cantidad ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg-secondary">
                          {l.precioUnitario === null ? "—" : fmtMonto(l.precioUnitario, detalle.moneda)}
                          {l.descuentoPct ? <div className="text-xs text-fg-muted">−{l.descuentoPct}%</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">{l.subtotal === null ? "—" : fmtMonto(l.subtotal, detalle.moneda)}</td>
                      </tr>
                    ) : (
                      <tr key={i} className="border-b border-line last:border-0">
                        <td colSpan={4} className={l.tipo === "seccion" ? "bg-surface-muted px-3 py-1.5 text-xs font-semibold text-fg-secondary" : "px-3 py-1.5 text-xs italic text-fg-muted"}>
                          {l.descripcion}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          <section>
            <h3 className="text-sm font-semibold text-fg">Nota de la factura</h3>
            <p className="mt-1 whitespace-pre-line text-sm text-fg-secondary">{detalle.nota ?? "Sin nota."}</p>
          </section>
        </div>
      )}
    </Drawer>
  );
}
