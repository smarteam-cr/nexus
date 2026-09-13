"use client";

/**
 * components/cobranza/CronogramaCobros.tsx
 *
 * Cronograma de cobros de un servicio (superficie de ADMINISTRACIÓN — la vía
 * rápida del día a día es la cola de cobros del landing): cuota, período, fecha,
 * monto, semáforo, badge de catch-up y select de estado. Cambios optimistas con
 * revert en error (patrón AlertsFeed). Marcar COBRADO abre el RegistrarPagoDialog
 * compartido — se registra a nombre de quien confirma (INV3) con fecha del pago
 * y referencia externa opcional. SACARLO de COBRADO abre el RevertirCobroDialog: motivo
 * obligatorio, fecha real de la factura y bitácora con quién lo había confirmado.
 *
 * NOTA: `semaforoCobro` se importa de lib/cobranza/engine (motor puro, sin
 * Prisma) y NO del barrel lib/cobranza, que re-exporta módulos `server-only`.
 */
import { useState } from "react";
import { IconCheck } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { marcaPromesa, semaforoCobro } from "@/lib/cobranza/engine";
import type { CobroDTO } from "@/lib/cobranza";
import { COBRANZA_ESTADOS_COBRO, ESTADO_COBRO_LABEL } from "@/lib/cobranza/schema";
import { fmtFecha, fmtMonto, PROMESA_CHIP, SEMAFORO_META } from "./format";
import BorradorCobroModal from "./BorradorCobroModal";
import RegistrarPagoDialog from "./RegistrarPagoDialog";
import PromesaDialog from "./PromesaDialog";
import MarcarFacturadoDialog, { mensajeDeFactura, type DatosDeFactura } from "./MarcarFacturadoDialog";
import RevertirCobroDialog, { type DatosDeReversion } from "./RevertirCobroDialog";
import { faltaNumeroDeFactura } from "@/lib/cobranza/numero-factura";

/**
 * Las señales de Odoo en castellano. ⚠ «Pagada sin conciliar» NO es lo mismo que pagada: el
 * pago está registrado pero todavía no se cruzó contra el banco, y son 188 facturas.
 */
const ETIQUETA_SENAL: Record<string, string> = {
  PAGADA: "pagada",
  PAGADA_SIN_CONCILIAR: "pagada, falta conciliar",
  PARCIAL: "pago parcial",
  IMPAGA: "impaga",
  ANULADA_POR_NOTA_DE_CREDITO: "anulada por nota de crédito",
  DESCONOCIDA: "estado desconocido",
};

/**
 * La explicación al pasar el mouse. El vocabulario de arriba es corto para que entre en una
 * línea, pero «pagada, falta conciliar» no se entiende sin contexto — y la diferencia entre
 * esa y «anulada» es la diferencia entre plata que entró y plata que no.
 */
const AYUDA_SENAL: Record<string, string> = {
  PAGADA: "Odoo registró el pago y ya lo cuadró contra el extracto bancario.",
  PAGADA_SIN_CONCILIAR:
    "Está registrado que el cliente pagó, pero todavía nadie ató ese pago a la línea del banco. La plata entró; falta el último paso de contabilidad.",
  PARCIAL: "El cliente pagó una parte. El resto sigue pendiente.",
  IMPAGA: "Odoo no registra ningún pago sobre esta factura.",
  ANULADA_POR_NOTA_DE_CREDITO:
    "⚠ La factura ya no debe nada, pero NO porque alguien pagara: se anuló con una nota de crédito. Acá no entró plata.",
  DESCONOCIDA: "Odoo devolvió un estado de pago que este espejo no conoce.",
};

export default function CronogramaCobros({
  cobros,
  todayISO,
  onRefresh,
  creditoDias,
  puedeEditar = true,
}: {
  /**
   * `cobranza.write`. Apagado, la fila se vuelve de solo lectura: los estados y las fechas se
   * siguen viendo, pero desaparecen los controles que escriben.
   *
   * ⚠ Default `true` a propósito: el enforcement de verdad vive en los endpoints, y un default
   * `false` haría que cualquier montaje que se olvide de pasarlo se vea roto en vez de seguro.
   */
  puedeEditar?: boolean;
  cobros: CobroDTO[];
  todayISO: string;
  /** Recarga el detalle (tras COBRADO trae confirmadoPor fresco). */
  onRefresh: () => void;
  /** Crédito resuelto de la cuenta (cuenta.creditoDias ?? DEFAULT_CREDITO_DIAS). */
  creditoDias: number;
}) {
  const toast = useToast();
  const [items, setItems] = useState(cobros);
  const [confirmCobro, setConfirmCobro] = useState<CobroDTO | null>(null);
  const [borradorCobro, setBorradorCobro] = useState<CobroDTO | null>(null);
  const [promesaCobro, setPromesaCobro] = useState<CobroDTO | null>(null);
  const [facturarCobro, setFacturarCobro] = useState<CobroDTO | null>(null);
  const [revertirCobro, setRevertirCobro] = useState<{ cobro: CobroDTO; estado: string } | null>(null);

  // Re-sincronizar cuando el padre recarga el detalle (patrón oficial de
  // "adjusting state when props change" — setState durante render, sin effect).
  const [prevCobros, setPrevCobros] = useState(cobros);
  if (cobros !== prevCobros) {
    setPrevCobros(cobros);
    setItems(cobros);
  }

  async function applyEstado(
    cobro: CobroDTO,
    estado: string,
    extra?: {
      referenciaExterna?: string | null;
      fechaCobro?: string;
      fechaEmision?: string | null;
      reversion?: { motivo: string; numeroFactura: string | null };
      sinNumeroFacturaMotivo?: string;
    },
  ) {
    const prevEstado = items.find((c) => c.id === cobro.id)?.estado;
    setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, estado } : c)));
    try {
      await fetchJson(`/api/cobranza/cobros/${cobro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado, ...(extra ?? {}) }),
      });
      if (estado === "COBRADO") {
        toast.success("Pago registrado a tu nombre.");
        onRefresh(); // trae confirmadoPor/confirmadoEn frescos
      } else if (extra?.reversion) {
        toast.success(
          `Pasó a ${ESTADO_COBRO_LABEL[estado] ?? estado}. Quedó en la bitácora a tu nombre, con quién lo había confirmado.`,
        );
        onRefresh(); // la confirmación se limpió y la marca de facturado puede haber cambiado de firma
      }
    } catch (e) {
      if (prevEstado) {
        setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, estado: prevEstado } : c)));
      }
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el cobro.");
    }
  }

  async function applyPromesa(cobro: CobroDTO, promesaPago: string | null) {
    const prev = items.find((c) => c.id === cobro.id)?.promesaPago ?? null;
    setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, promesaPago } : c)));
    try {
      await fetchJson(`/api/cobranza/cobros/${cobro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promesaPago }),
      });
      toast.success(
        promesaPago
          ? "Promesa registrada: la factura sigue en el vencido, marcada con esa fecha."
          : "Promesa retirada.",
      );
    } catch (e) {
      setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, promesaPago: prev } : c)));
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la promesa.");
    }
  }

  // Marcar facturado / agregar número / revertir: sin gate de estado (única superficie que ve
  // COBRADO — es donde se hace el backfill de facturación histórica). `null` = revertir, que limpia
  // también el número: el chokepoint deja el viejo en la bitácora.
  async function applyFacturar(cobro: CobroDTO, datos: DatosDeFactura | null) {
    const antes = items.find((c) => c.id === cobro.id);
    const previo = antes
      ? {
          fechaEmision: antes.fechaEmision,
          numeroFactura: antes.numeroFactura,
          sinNumeroFacturaMotivo: antes.sinNumeroFacturaMotivo,
        }
      : null;
    const nuevo = datos ?? { fechaEmision: null, numeroFactura: null, sinNumeroFacturaMotivo: null };
    setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, ...nuevo } : c)));
    try {
      await fetchJson(`/api/cobranza/cobros/${cobro.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos ?? { fechaEmision: null }),
      });
      toast.success(mensajeDeFactura(datos, antes?.numeroFactura ?? null));
      onRefresh(); // trae facturadoPor/numeroFacturaPor frescos
    } catch (e) {
      if (previo) setItems((cs) => cs.map((c) => (c.id === cobro.id ? { ...c, ...previo } : c)));
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la factura.");
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-fg-muted rounded-lg border border-dashed border-line px-3 py-3 text-center">
        Sin cobros generados todavía — guardá el plan y apretá &quot;Generar cobros&quot;.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-1.5">
        {items.map((c) => {
          const sem = SEMAFORO_META[
            semaforoCobro(
              {
                estado: c.estado,
                fechaProgramadaISO: c.fechaProgramada,
                fechaEmisionISO: c.fechaEmision,
              },
              todayISO,
              creditoDias,
            )
          ];
          const marca = marcaPromesa(
            { estado: c.estado, fechaEmisionISO: c.fechaEmision, promesaPagoISO: c.promesaPago },
            todayISO,
          );
          return (
            <li key={c.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-fg tabular-nums flex-shrink-0">
                  {c.numCuota != null ? `#${c.numCuota}` : "—"}
                </span>
                <span className="text-[11px] text-fg-muted flex-shrink-0">{c.periodo}</span>
                <span className="text-[11px] text-fg-secondary flex-shrink-0">{fmtFecha(c.fechaProgramada)}</span>
                <span className="text-xs text-fg tabular-nums flex-shrink-0">{fmtMonto(c.monto, c.moneda)}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${sem.chip}`}>
                  {sem.label}
                </span>
                {c.origen === "CATCH_UP" && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-amber-600 bg-amber-500/10 border-amber-500/30 flex-shrink-0">
                    catch-up
                  </span>
                )}
                {c.estado !== "COBRADO" && c.promesaPago && (
                  <span
                    title={PROMESA_CHIP[marca ?? "sinFactura"].title}
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${PROMESA_CHIP[marca ?? "sinFactura"].chip}`}
                  >
                    prometió {fmtFecha(c.promesaPago)}
                  </span>
                )}
                {!puedeEditar ? null : c.fechaEmision ? (
                  <>
                    {/* Los 144 facturados de antes de la etapa 7 no tienen número: se agrega acá. */}
                    {faltaNumeroDeFactura(c) && (
                      <button
                        type="button"
                        onClick={() => setFacturarCobro(c)}
                        title="Esta factura no tiene número: elegilo de Odoo o tecleálo"
                        className="ml-auto text-[11px] font-medium px-2 py-1 rounded-md border border-warn-line text-warn-ink bg-warn-surface hover:opacity-90 transition-opacity flex-shrink-0"
                      >
                        Agregar número
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => applyFacturar(c, null)}
                      title="Revertir la marca de facturado (el número, si tiene, queda en la bitácora)"
                      className={`${faltaNumeroDeFactura(c) ? "" : "ml-auto "}text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0`}
                    >
                      Revertir factura
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFacturarCobro(c)}
                    title="Marcar que ya se emitió la factura de este cobro"
                    className="ml-auto text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                  >
                    Marcar facturado
                  </button>
                )}
                {puedeEditar && c.estado !== "COBRADO" && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPromesaCobro(c)}
                      title="Registrar la fecha en que el cliente prometió pagar (la factura sigue en el vencido)"
                      className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                    >
                      Prometió
                    </button>
                    <button
                      type="button"
                      onClick={() => setBorradorCobro(c)}
                      title="Generar borrador de correo de cobro (lo revisás y lo enviás vos)"
                      className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors flex-shrink-0"
                    >
                      Borrador
                    </button>
                  </>
                )}
                <select
                  value={c.estado}
                  onChange={(e) => {
                    const estado = e.target.value;
                    if (estado === c.estado) return;
                    if (estado === "COBRADO") setConfirmCobro(c);
                    /* Sacar de verde no es un click: pide motivo y deja rastro de quién lo había
                       confirmado. Antes era un cambio optimista sin confirmación ni bitácora. */
                    else if (c.estado === "COBRADO") setRevertirCobro({ cobro: c, estado });
                    else applyEstado(c, estado);
                  }}
                  className="text-[11px] border border-line rounded-md px-1.5 py-1 bg-surface text-fg focus:outline-none focus:border-brand flex-shrink-0"
                >
                  {COBRANZA_ESTADOS_COBRO.map((e) => (
                    <option key={e} value={e}>{ESTADO_COBRO_LABEL[e] ?? e}</option>
                  ))}
                </select>
              </div>
              {c.fechaEmision && c.facturadoPor && (
                <p className="mt-1 text-[10px] text-sky-600">
                  <IconCheck className="w-3 h-3 mr-1 align-middle" />
                  Facturado por {c.facturadoPor} · {fmtFecha(c.fechaEmision)}
                  {c.numeroFactura ? (
                    <>
                      {" "}
                      · <span className="font-medium">{c.numeroFactura}</span>
                    </>
                  ) : c.sinNumeroFacturaMotivo ? (
                    <span className="text-fg-muted"> · sin número: {c.sinNumeroFacturaMotivo}</span>
                  ) : null}
                  {puedeEditar && !faltaNumeroDeFactura(c) && (
                    <button
                      type="button"
                      onClick={() => setFacturarCobro(c)}
                      title="Corregir el número de la factura (queda en la bitácora a tu nombre)"
                      className="ml-1.5 text-fg-muted underline decoration-dotted hover:text-fg"
                    >
                      cambiar
                    </button>
                  )}
                </p>
              )}
              {c.estado === "COBRADO" && c.confirmadoPor && (
                <p className="mt-1 text-[10px] text-emerald-600">
                  <IconCheck className="w-3 h-3 mr-1 align-middle" />
                  Confirmado por {c.confirmadoPor}
                  {c.referenciaExterna && (
                    <span className="text-fg-muted"> · ref. {c.referenciaExterna}</span>
                  )}
                </p>
              )}
              {/* La factura REAL de Odoo, al lado del cobro. Es un espejo: no cambia el estado
                  ni el semáforo — eso lo sigue moviendo una persona (INV25). */}
              {c.facturaOdoo && (
                <p className="mt-1 text-[10px] text-fg-muted">
                  Odoo: <span className="text-fg-secondary">{c.facturaOdoo.numero}</span> ·{" "}
                  {fmtFecha(c.facturaOdoo.invoiceDate)} ·{" "}
                  <span
                    title={AYUDA_SENAL[c.facturaOdoo.senal] ?? undefined}
                    className="underline decoration-dotted"
                  >
                    {ETIQUETA_SENAL[c.facturaOdoo.senal] ?? c.facturaOdoo.senal}
                  </span>
                  {/* ⚠ El total CON impuesto se muestra solo cuando difiere del neto. Los cobros
                      de Nexus están cargados sin IVA, y el cliente recibe una factura que sí
                      puede traerlo: ver los dos números es lo que evita la llamada incómoda. */}
                  {c.facturaOdoo.montoTotal !== c.facturaOdoo.montoNeto && (
                    <span>
                      {" "}
                      · con impuesto {c.facturaOdoo.moneda}{" "}
                      {c.facturaOdoo.montoTotal.toLocaleString("es-CR", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  {c.facturaOdoo.sinConciliar && <span className="text-amber-600"> · sin conciliar en Odoo</span>}
                  {c.facturaOdoo.estadoPropuesto === "COBRADO" && (
                    <span className="text-emerald-600"> · Odoo dice que ya está pagada</span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {confirmCobro && (
        <RegistrarPagoDialog
          cobro={confirmCobro}
          todayISO={todayISO}
          onCancel={() => setConfirmCobro(null)}
          onConfirm={async ({ fechaCobro, referenciaExterna }) => {
            const cobro = confirmCobro;
            setConfirmCobro(null);
            await applyEstado(cobro, "COBRADO", { fechaCobro, referenciaExterna });
          }}
        />
      )}

      {revertirCobro && (
        <RevertirCobroDialog
          cobro={revertirCobro.cobro}
          etiquetaNueva={ESTADO_COBRO_LABEL[revertirCobro.estado] ?? revertirCobro.estado}
          estadoNuevo={revertirCobro.estado}
          todayISO={todayISO}
          onCancel={() => setRevertirCobro(null)}
          onConfirm={async ({ motivo, fechaEmision, numeroFactura, sinNumeroFacturaMotivo }: DatosDeReversion) => {
            const { cobro, estado } = revertirCobro;
            setRevertirCobro(null);
            await applyEstado(cobro, estado, {
              reversion: { motivo, numeroFactura },
              // Solo si cambió: la bitácora dice «fecha corregida» únicamente cuando lo fue.
              ...(fechaEmision !== cobro.fechaEmision ? { fechaEmision } : {}),
              // Ponerle fecha a un cobro que no la tenía es marcar facturado: sin número, va el motivo.
              ...(sinNumeroFacturaMotivo ? { sinNumeroFacturaMotivo } : {}),
            });
          }}
        />
      )}

      {borradorCobro && (
        <BorradorCobroModal cobro={borradorCobro} onClose={() => setBorradorCobro(null)} />
      )}

      {promesaCobro && (
        <PromesaDialog
          cobro={promesaCobro}
          onCancel={() => setPromesaCobro(null)}
          onSave={async (promesaPago) => {
            const cobro = promesaCobro;
            setPromesaCobro(null);
            await applyPromesa(cobro, promesaPago);
          }}
        />
      )}

      {facturarCobro && (
        <MarcarFacturadoDialog
          cobro={facturarCobro}
          todayISO={todayISO}
          onCancel={() => setFacturarCobro(null)}
          onConfirm={async (datos) => {
            const cobro = facturarCobro;
            setFacturarCobro(null);
            await applyFacturar(cobro, datos);
          }}
        />
      )}
    </>
  );
}
