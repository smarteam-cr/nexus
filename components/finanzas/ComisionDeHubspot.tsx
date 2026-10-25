"use client";

/**
 * components/finanzas/ComisionDeHubspot.tsx — la comisión del próximo pago de HubSpot, armada desde HubSpot Partner
 * (U25, 2026-10-25). Va en Finanzas › Comisiones de partner, arriba de la lista.
 *
 * Dice tres cosas: cuánto estima Partner para el próximo pago (con el detalle por cuenta), qué pasa con la comisión
 * anotada de ese pago, y la comprobación contra el último pago que entró. El monto REAL sigue saliendo de la
 * liquidación de HubSpot: se registra con «Registrar factura» en la lista, como siempre.
 * ⛔ INTERNO: la comisión por cuenta es dato de partner.
 */
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import type { ComisionDeHubspotDTO } from "@/lib/cobranza/comision-hubspot-server";

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-fg-muted";
const TD = "px-3 py-2 text-xs text-fg";

const usd = (n: number) => fmtMonto(n, "USD");

export default function ComisionDeHubspot({ data }: { data: ComisionDeHubspotDTO }) {
  const { estimado, fila, comprobacion } = data;
  return (
    <section data-recorrido="fin.partner.hubspot" className="space-y-2">
      <h2 className="text-sm font-semibold text-fg">HubSpot: la comisión desde Partner</h2>
      <div className="rounded-xl border border-line bg-surface px-4 py-3 space-y-2">
        {!estimado ? (
          <p className="text-xs text-fg-secondary">
            {data.ultimaCopia
              ? `La última copia de HubSpot Partner es del ${fmtFecha(data.ultimaCopia.slice(0, 10))}: con datos viejos no se estima. Cuando vuelva a correr la copia, el estimado aparece solo.`
              : "Todavía no hay copia de HubSpot Partner: sin ella no hay de dónde estimar la comisión."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-fg-muted">
                  Pago del {fmtFecha(data.pago.fecha)} · {data.pago.trimestre}
                </p>
                <p className="mt-0.5 text-xl font-semibold text-fg tabular-nums">{usd(estimado.total)}</p>
                <p className="text-[11px] text-fg-muted">estimado desde HubSpot Partner</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-fg-muted">Comisión de este mes</p>
                <p className="mt-0.5 text-sm text-fg tabular-nums">{usd(estimado.mensual)}</p>
                <p className="text-[11px] text-fg-muted">
                  {estimado.cuentas.length} cuenta{estimado.cuentas.length === 1 ? "" : "s"} con comisión
                </p>
              </div>
              {fila && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-fg-muted">Anotada en la lista</p>
                  <p className="mt-0.5 text-sm text-fg tabular-nums">{usd(fila.monto)}</p>
                  <p className="text-[11px] text-fg-muted">
                    {fila.estado === "COBRADO"
                      ? "cobrada"
                      : !fila.montoEsProyeccion
                        ? "con la factura de HubSpot"
                        : fila.montoDesdePartner
                          ? "la arma Partner"
                          : "escrita a mano"}
                  </p>
                </div>
              )}
            </div>
            <p className="text-[11px] text-fg-muted">
              {data.queHace} Cada cuenta suma su comisión del mes por cada mes del trimestre en que la venta ya existía.
              El monto real sale de la liquidación de HubSpot: regístralo con «Registrar factura».
            </p>
            {comprobacion && (
              <p className="text-[11px] text-fg-muted">
                Comprobación: con las cuentas de hoy, el pago del {fmtFecha(comprobacion.fecha)} ({comprobacion.trimestre}) se
                habría estimado en {usd(comprobacion.estimadoConLasDeHoy)}; entró {usd(comprobacion.cobrado)} (
                {comprobacion.diferenciaPct > 0 ? "+" : ""}
                {comprobacion.diferenciaPct.toLocaleString("es-CR")} %).
              </p>
            )}
            {estimado.otrasMonedas.length > 0 && (
              <p className="text-[11px] text-fg-muted">
                Aparte, sin sumar:{" "}
                {estimado.otrasMonedas.map((o) => `${o.mensual.toLocaleString("es-CR")} ${o.moneda} al mes (${o.cuentas})`).join(" · ")}.
              </p>
            )}
            <CollapsibleSection title="Por cuenta" count={estimado.cuentas.length} defaultOpen={false}>
              <div className="rounded-xl border border-line bg-surface overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="bg-surface-muted border-b border-line">
                    <tr>
                      <th className={TH}>Cuenta</th>
                      <th className={TH}>Vendida desde</th>
                      <th className={`${TH} text-right`}>Al mes</th>
                      <th className={`${TH} text-right`}>Meses</th>
                      <th className={`${TH} text-right`}>Del trimestre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimado.cuentas.map((c) => (
                      <tr key={c.id} className="border-b border-line last:border-b-0">
                        <td className={TD}>
                          {c.nombre}
                          {c.gestionada && <span className="ml-1.5 text-fg-muted">· gestionada</span>}
                        </td>
                        <td className={`${TD} text-fg-secondary`}>{c.ventaDesde ? fmtFecha(c.ventaDesde) : "—"}</td>
                        <td className={`${TD} text-right tabular-nums`}>{usd(c.comisionMensual)}</td>
                        <td className={`${TD} text-right tabular-nums text-fg-secondary`}>{c.meses}</td>
                        <td className={`${TD} text-right tabular-nums`}>{usd(c.aporte)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>
          </>
        )}
      </div>
    </section>
  );
}
