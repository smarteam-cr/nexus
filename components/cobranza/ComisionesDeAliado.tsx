"use client";

/**
 * components/cobranza/ComisionesDeAliado.tsx
 *
 * La lista de comisiones de aliado con su alerta y su flujo de confirmación, en UN solo
 * lugar. La usan las dos pantallas donde aparecen:
 *
 *   · `/finanzas/comisiones-partner` — donde además se dan de alta y se administran los
 *     aliados. Es EL lugar donde se crean.
 *   · `/cobranza`, pestaña «Aliados» — donde se cobran, junto al resto de la cobranza.
 *
 * ⚠ POR QUÉ COMPARTIDO Y NO COPIADO. La decisión escrita del módulo es que no puede
 * haber dos maneras de registrar lo mismo: "o partner es EL lugar, o quedaban dos
 * maneras y ningún total cerraría" (docs/DECISIONS.md). Dos implementaciones del mismo
 * flujo de confirmación son eso mismo un poco más tarde — la segunda se olvida de una
 * regla y las dos pantallas empiezan a contar historias distintas.
 *
 * Lo que esta lista NO hace, a propósito: crear, editar ni borrar. Confirmar un cobro es
 * una acción de cobranza; dar de alta una comisión es una de finanzas. La pestaña de
 * cobranza recibe solo esto, así que no se convierte en un segundo lugar donde crear.
 */
import { useState, type ReactNode } from "react";
import { Button, Modal, Field, Input } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import { comisionesPorCobrar } from "@/lib/cobranza/comisiones-partner";
import type { ComisionPartnerDTO } from "@/lib/cobranza";

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-fg-muted";
const TD = "px-3 py-2 text-xs text-fg";

type CobroForm = {
  id: string;
  partner: string;
  moneda: string;
  fechaCobro: string;
  /** El NETO que entró al banco. Obligatorio: es la plata. */
  monto: string;
  /** El BRUTO que reportó el aliado. Opcional — con él, la retención se deriva. */
  montoBruto: string;
};

export default function ComisionesDeAliado({
  comisiones,
  todayISO,
  onCambio,
  extraAcciones,
}: {
  comisiones: ComisionPartnerDTO[];
  /** Hoy, por parámetro: la alerta no lee el reloj (ver lib/cobranza/comisiones-partner.ts). */
  todayISO: string;
  /** Qué hacer después de confirmar o revertir. Cada pantalla refresca lo suyo. */
  onCambio: () => Promise<void> | void;
  /** Acciones extra por fila (editar, borrar). Solo la pantalla de finanzas las pasa. */
  extraAcciones?: (c: ComisionPartnerDTO) => ReactNode;
}) {
  const toast = useToast();
  const [cobro, setCobro] = useState<CobroForm | null>(null);
  const [guardando, setGuardando] = useState(false);

  const vencidas = comisionesPorCobrar(comisiones, todayISO);

  /**
   * Confirma que la plata entró. Pasa por el chokepoint `/estado`, que es el ÚNICO
   * escritor del estado — INV20 exige que una comisión COBRADA lleve la firma de quien
   * lo confirmó, y con dos escritores el invariante se rompe por el que nadie mira.
   */
  async function confirmar() {
    if (!cobro) return;
    const monto = Number(cobro.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("El monto que entró tiene que ser un número positivo.");
      return;
    }
    setGuardando(true);
    try {
      await fetchJson(`/api/cobranza/comisiones-partner/${cobro.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: "COBRADO",
          fechaCobro: cobro.fechaCobro,
          monto,
          // Vacío = no se sabe. Va null y no cero: cero afirmaría que no hubo retención.
          montoBruto: cobro.montoBruto.trim() === "" ? null : Number(cobro.montoBruto),
        }),
      });
      setCobro(null);
      await onCambio();
      toast.success("Cobro confirmado.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo confirmar el cobro.");
    } finally {
      setGuardando(false);
    }
  }

  /** Deshace la confirmación: limpia fecha y firma, como el revert de un cobro. */
  async function revertir(id: string) {
    try {
      await fetchJson(`/api/cobranza/comisiones-partner/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "POR_COBRAR" }),
      });
      await onCambio();
      toast.success("La comisión volvió a «por cobrar».");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo revertir.");
    }
  }

  return (
    <div className="space-y-3">
      {/* ── La alerta: plata que ya debería estar ─────────────────────────────
          Va acá y no en la pestaña de Alertas porque se resuelve acá: el botón que
          la cierra está en la fila de abajo. Una alerta que manda a otra pantalla se
          lee dos veces y se atiende una. */}
      {vencidas.length > 0 && (
        <div className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2">
          <p className="text-xs text-warn-ink">
            <span className="font-medium">
              {vencidas.length} comisión{vencidas.length === 1 ? "" : "es"} sin confirmar
            </span>{" "}
            — la fecha ya pasó y nadie dijo que entró.{" "}
            {vencidas
              .map((v) => `${v.partner} ${fmtMonto(v.monto, v.moneda as "CRC" | "USD")} del ${fmtFecha(v.fecha)}`)
              .join(" · ")}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="bg-surface-muted border-b border-line">
            <tr>
              <th className={TH}>Aliado</th>
              <th className={TH}>Concepto</th>
              <th className={TH}>Fecha</th>
              <th className={`${TH} text-right`}>Monto</th>
              <th className={TH}>Estado</th>
              <th className={TH}></th>
            </tr>
          </thead>
          <tbody>
            {comisiones.map((c) => (
              <tr key={c.id} className="border-b border-line last:border-b-0">
                <td className={TD}>
                  {c.partner}
                  {c.clienteNombre && (
                    <span className="ml-1.5 text-[11px] text-fg-muted">· {c.clienteNombre}</span>
                  )}
                </td>
                <td className={`${TD} text-fg-secondary`}>{c.concepto ?? "—"}</td>
                <td className={`${TD} text-fg-secondary whitespace-nowrap`}>{fmtFecha(c.fecha)}</td>
                <td className={`${TD} text-right tabular-nums whitespace-nowrap`}>
                  <span className={c.montoEsProyeccion ? "text-fg-muted" : ""}>
                    {fmtMonto(c.monto, c.moneda as "CRC" | "USD")}
                  </span>
                  {/* Un monto proyectado se ve distinto de uno medido: los $51.000
                      redondos eran una estimación tecleada y hasta acá se mostraban
                      igual que los $45.921,72 que sí se contaron. */}
                  {c.montoEsProyeccion && (
                    <span className="ml-1.5 text-[10px] text-fg-muted font-normal">estimado</span>
                  )}
                  {c.retencion && (
                    <p className="text-[10px] text-fg-muted font-normal">
                      bruto {fmtMonto(c.montoBruto!, c.moneda as "CRC" | "USD")} · retención{" "}
                      {fmtMonto(c.retencion.monto, c.moneda as "CRC" | "USD")} ({c.retencion.pct}%)
                    </p>
                  )}
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  {c.estado === "COBRADO" ? (
                    <span className="text-[11px] px-1.5 py-0.5 rounded border border-line bg-surface-muted text-fg-secondary">
                      Cobrada{c.fechaCobro ? ` · ${fmtFecha(c.fechaCobro)}` : ""}
                    </span>
                  ) : (
                    <span className="text-[11px] px-1.5 py-0.5 rounded border border-warn-line bg-warn-surface text-warn-ink">
                      Por cobrar
                    </span>
                  )}
                </td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <div className="flex justify-end gap-1.5">
                    {c.estado === "COBRADO" ? (
                      <Button variant="secondary" size="sm" onClick={() => revertir(c.id)}>
                        Revertir
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() =>
                          setCobro({
                            id: c.id,
                            partner: c.partner,
                            moneda: c.moneda,
                            // Arranca en la fecha esperada y con el monto registrado —
                            // los dos se corrigen antes de firmar, que es el punto.
                            fechaCobro: c.fecha,
                            monto: String(c.monto),
                            montoBruto: c.montoBruto !== null ? String(c.montoBruto) : "",
                          })
                        }
                      >
                        Registrar cobro
                      </Button>
                    )}
                    {extraAcciones?.(c)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cobro && (
        <Modal
          open
          onClose={() => setCobro(null)}
          title={`Registrar cobro · ${cobro.partner}`}
          description="La fecha en que entró la plata y el monto NETO que llegó al banco. Lo registrado antes era una proyección: casi nunca coincide con lo que entra."
        >
          <div className="space-y-3">
            <Field label="Fecha en que entró">
              <Input
                type="date"
                value={cobro.fechaCobro}
                onChange={(e) => setCobro({ ...cobro, fechaCobro: e.target.value })}
              />
            </Field>
            <Field label={`Monto neto que entró (${cobro.moneda})`}>
              <Input
                type="text"
                inputMode="decimal"
                value={cobro.monto}
                onChange={(e) => setCobro({ ...cobro, monto: e.target.value })}
              />
            </Field>
            <Field label={`Monto bruto que reportó el aliado (${cobro.moneda}) — opcional`}>
              <Input
                type="text"
                inputMode="decimal"
                value={cobro.montoBruto}
                onChange={(e) => setCobro({ ...cobro, montoBruto: e.target.value })}
                placeholder="Si lo sabés, la retención sale sola"
              />
            </Field>
            <p className="text-[11px] text-fg-muted">
              Confirmar deja tu nombre firmando que esta plata entró. Con la fecha, la comisión pasa a
              la caja del mes que corresponde.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setCobro(null)}>
                Cancelar
              </Button>
              <Button onClick={confirmar} disabled={guardando || !cobro.fechaCobro}>
                Confirmar cobro
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
