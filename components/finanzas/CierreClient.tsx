"use client";

/**
 * components/finanzas/CierreClient.tsx — Finanzas › Cierre del mes (rediseño de Finanzas, 2026-10-03, etapa «Cierre del
 * mes»).
 *
 * La tira del año (cómo está cada mes), lo que falta para cerrar el elegido —lo que frena y lo que solo se muestra—, el
 * tipo de cambio (el del Banco Central desde 2026-10-05; para confirmar o cambiar, en un mes sin días del BCCR o con
 * días que faltan —decisión de Elías del 2026-10-05—), y los botones de cerrar y reabrir. Cerrar no congela nada:
 * guarda quién, cuándo y los números de ese momento (lib/finanzas/cierre.ts).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input, Modal, PageHeader, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { fmtFecha } from "@/components/cobranza/format";
import { etiquetaMes } from "@/lib/finanzas/gastos";
import type { EstadoEnElAnio, GrupoDeCierre, ItemDeCierre } from "@/lib/finanzas/cierre";
import type { CierreDelMesDTO } from "@/lib/finanzas/cierre-server";

const TILE: Record<EstadoEnElAnio, string> = {
  CERRADO: "border border-success-line bg-success-surface text-success-ink",
  LISTO: "border border-warn-line bg-warn-surface text-warn-ink",
  EN_CURSO: "border border-info-line bg-info-surface text-info-ink",
  FALTA: "border border-dashed border-line bg-surface-muted text-fg-muted",
  FUTURO: "border border-line bg-surface text-fg-muted",
};
const GRUPOS: GrupoDeCierre[] = ["Costos y gastos", "Revisión", "Ingresos", "Conciliación"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function Marca({ item }: { item: ItemDeCierre }) {
  if (item.listo) return <span aria-label="Listo" className="w-[18px] shrink-0 text-center text-sm leading-5 text-success-ink">✓</span>;
  if (item.bloquea) return <span aria-label="Falta" className="w-[18px] shrink-0 text-center text-sm leading-5 text-warning">●</span>;
  return <span aria-label="No frena el cierre" className="w-[18px] shrink-0 text-center text-sm leading-5 text-fg-muted">○</span>;
}

export default function CierreClient({ d }: { d: CierreDelMesDTO }) {
  const router = useRouter();
  const toast = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [reabriendo, setReabriendo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [otroTipo, setOtroTipo] = useState(false);
  const [tasa, setTasa] = useState("");
  const [fuente, setFuente] = useState("");

  const mes = etiquetaMes(d.periodo);
  const anio = d.periodo.slice(0, 4);
  const cerrado = d.cierre?.estado === "CERRADO";
  const listas = d.items.filter((i) => i.listo).length;
  const tc = d.tipoCambio;
  /** Al Banco Central le faltan días del mes: se cierra confirmando la tasa (2026-10-05). */
  const bccrIncompleto = tc?.bccr && !tc.bccr.completo ? tc.bccr : null;

  async function enviar(clave: string, url: string, body: unknown, ok: string) {
    setOcupado(clave);
    try {
      await fetchJson(url, { method: "POST", body: JSON.stringify(body) });
      toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  const porQueNo = cerrado
    ? null
    : !d.terminado
      ? "Se cierra cuando termine el mes"
      : d.faltan > 0
        ? d.faltan === 1
          ? "Falta 1 cosa"
          : `Faltan ${d.faltan} cosas`
        : null;

  return (
    <div className="space-y-6">
      <PageHeader recorrido="finanzas-cierre"
        title={`Cierre del mes · ${etiquetaMes(d.periodo, true)}`}
        description={
          cerrado
            ? `${mes[0]!.toUpperCase()}${mes.slice(1)} está cerrado. Si algo del mes cambia después, el punto de equilibrio lo marca.`
            : `Lo que falta para cerrar ${mes}. Cuando no falte nada, lo cierras y el punto de equilibrio lo da por bueno.`
        }
        action={
          <div data-recorrido="fin.cierre.boton" className="flex flex-col items-end gap-1">
            {cerrado ? (
              <Button variant="secondary" onClick={() => setReabriendo(true)} disabled={ocupado !== null}>
                Reabrir {mes}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={porQueNo !== null || ocupado !== null}
                onClick={() => void enviar("cerrar", "/api/finanzas/cierre", { accion: "CERRAR", periodo: d.periodo }, `${etiquetaMes(d.periodo, true)} quedó cerrado.`)}
              >
                {ocupado === "cerrar" ? "Cerrando…" : `Cerrar ${mes}`}
              </Button>
            )}
            {porQueNo && <span className="text-xs text-fg-muted">{porQueNo}</span>}
          </div>
        }
      />

      {cerrado && d.cierre && (
        <div className="rounded-xl border border-success-line bg-success-surface px-4 py-3 text-[13px] text-success-ink">
          ✓ Cerrado por {d.cierre.cerradoPor ?? "—"} el {fmtFecha(d.cierre.cerradoEn)}, con los números de ese día.
        </div>
      )}
      {!cerrado && d.cierre?.reabiertoPor && (
        <div className="rounded-xl border border-info-line bg-info-surface px-4 py-3 text-[13px] text-fg">
          Lo reabrió {d.cierre.reabiertoPor} el {fmtFecha(d.cierre.reabiertoEn)}: «{d.cierre.motivo}».
        </div>
      )}

      <section data-recorrido="fin.cierre.anio" aria-label={`${anio}, mes por mes`} className="space-y-2.5 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[15px] font-semibold text-fg">{anio}, mes por mes</span>
          <Link href={`/finanzas/cierre?mes=${Number(anio) - 1}-12`} className="text-xs font-semibold text-brand hover:text-brand-light">
            ‹ {Number(anio) - 1}
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
          {d.meses.map((m, i) => (
            <Link
              key={m.periodo}
              href={`/finanzas/cierre?mes=${m.periodo}`}
              aria-current={m.periodo === d.periodo ? "page" : undefined}
              className={`flex min-h-[52px] flex-col gap-0.5 rounded-lg p-2 ${TILE[m.estado]} ${m.periodo === d.periodo ? "ring-2 ring-brand ring-offset-1 ring-offset-surface" : ""}`}
            >
              <span className="text-xs font-semibold">
                {m.estado === "CERRADO" ? "✓ " : ""}
                {MES_CORTO[i]}
              </span>
              <span className="text-[11px] leading-[14px]">{m.texto}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-fg-muted">
          <span>
            <span className="font-semibold text-success-ink">✓</span> Cerrado
          </span>
          <span>
            <span className="font-semibold text-warn-ink">●</span> Completo, falta cerrarlo
          </span>
          <span>
            <span className="font-semibold text-info-ink">●</span> En curso
          </span>
          <span>
            <span className="font-semibold">○</span> Falta un dato
          </span>
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <section data-recorrido="fin.cierre.falta" aria-label={`Para cerrar ${mes}`} className="min-w-0 flex-[2_1_560px] rounded-xl border border-line bg-surface">
          <div className="flex items-baseline gap-2.5 px-4 pb-2 pt-4">
            <h2 className="text-lg font-semibold text-fg">Para cerrar {mes}</h2>
            <span className="text-xs text-fg-muted">
              {d.items.length} cosas · {listas} {listas === 1 ? "lista" : "listas"}
            </span>
          </div>
          {GRUPOS.map((g) => {
            const items = d.items.filter((i) => i.grupo === g);
            if (items.length === 0) return null;
            return (
              <div key={g}>
                <div className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{g}</div>
                {items.map((it) => (
                  <div key={it.clave} className="flex items-start gap-3 border-t border-line px-4 py-3">
                    <Marca item={it} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-semibold leading-5 text-fg">{it.titulo}</span>
                      <span className="text-[13px] leading-[19px] text-fg-secondary">{it.detalle}</span>
                      {!it.bloquea && !it.listo && <span className="text-xs text-fg-muted">No frena el cierre.</span>}
                    </div>
                    <span className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-fg-secondary">{it.quien}</span>
                    {!it.listo && (
                      <Link href={it.href} className="shrink-0 pt-px text-[13px] font-semibold text-brand hover:text-brand-light">
                        {it.accion}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          {tc?.bccr?.completo ? (
            <section
              data-recorrido="fin.cierre.tc"
              id="tipo-de-cambio"
              aria-label={`Tipo de cambio de ${mes}`}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Tipo de cambio de {mes}</span>
              <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">
                ₡{tc.crcPorUsd.toLocaleString("es-CR", { maximumFractionDigits: 2 })} por dólar
              </span>
              <span className="text-[13px] leading-[19px] text-fg-secondary">
                {`✓ El promedio de la venta del Banco Central de los ${tc.bccr.dias} días. Cada cobro y cada pago con fecha se convierte con la tasa de su día.`}
              </span>
              <Link href="/finanzas/tipo-de-cambio" className="text-[13px] font-semibold text-brand hover:text-brand-light">
                Ver el histórico
              </Link>
            </section>
          ) : (
          <section data-recorrido="fin.cierre.tc"
            id="tipo-de-cambio"
            aria-label={`Tipo de cambio de ${mes}`}
            className={`flex flex-col gap-2 rounded-xl border p-4 ${
              tc?.confirmadoPor ? "border-line bg-surface" : "border-warn-line bg-warn-surface"
            }`}
          >
            <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${tc?.confirmadoPor ? "text-fg-muted" : "text-warn-ink"}`}>
              Tipo de cambio de {mes}
            </span>
            <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">
              {tc ? `₡${tc.crcPorUsd.toLocaleString("es-CR", { maximumFractionDigits: 2 })} por dólar` : "Sin tipo de cambio"}
            </span>
            <span className={`text-[13px] leading-[19px] ${tc?.confirmadoPor ? "text-fg-secondary" : "text-warn-ink"}`}>
              {tc?.confirmadoPor
                ? `✓ Confirmado por ${tc.confirmadoPor} el ${fmtFecha(tc.registradoEn)}. ${tc.fuente}`
                : bccrIncompleto
                  ? `● Solo ${bccrIncompleto.dias === 1 ? "1 día tiene" : `${bccrIncompleto.dias} días tienen`} la tasa del Banco Central: faltan días del mes. Para cerrarlo, confirma este promedio o pon otra tasa.`
                  : tc
                    ? `● Sin confirmar: ${tc.fuente}`
                    : "Sin él, lo que está en colones no se suma al mes."}
            </span>
            {tc?.confirmadoPor && bccrIncompleto && (
              <span className="text-xs leading-[17px] text-fg-muted">
                Al Banco Central le faltan días de {mes}: manda la tasa confirmada, hasta que el Banco Central tenga el mes completo.
              </span>
            )}
            {!otroTipo ? (
              <div className="flex flex-wrap items-center gap-2">
                {tc && !tc.confirmadoPor && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={ocupado !== null}
                    onClick={() =>
                      void enviar("tasa", "/api/finanzas/cierre/tipo-cambio", { periodo: d.periodo }, "Tipo de cambio confirmado.")
                    }
                  >
                    {ocupado === "tasa" ? "Confirmando…" : `Confirmar ₡${tc.crcPorUsd.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setOtroTipo(true)} disabled={ocupado !== null}>
                  {tc ? "Poner otro" : "Poner el tipo de cambio"}
                </Button>
                {bccrIncompleto && (
                  <Link href="/finanzas/tipo-de-cambio" className="text-[13px] font-semibold text-brand hover:text-brand-light">
                    Ver el histórico
                  </Link>
                )}
              </div>
            ) : (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const n = Number(tasa.replace(",", "."));
                  if (!(n > 0)) return toast.error("El tipo de cambio tiene que ser un número mayor que cero.");
                  if (await enviar("tasa", "/api/finanzas/cierre/tipo-cambio", { periodo: d.periodo, crcPorUsd: n, fuente }, "Tipo de cambio guardado.")) {
                    setOtroTipo(false);
                    setTasa("");
                    setFuente("");
                  }
                }}
              >
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-fg">Colones por dólar</span>
                  <Input inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="505,30" autoFocus />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-fg">De dónde sale</span>
                  <Input value={fuente} onChange={(e) => setFuente(e.target.value)} placeholder="BCCR venta, promedio del mes" maxLength={300} />
                </label>
                <div className="flex gap-2">
                  <Button type="submit" variant="secondary" size="sm" disabled={ocupado !== null || !tasa || fuente.trim().length < 3}>
                    {ocupado === "tasa" ? "Guardando…" : "Guardar"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOtroTipo(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </section>
          )}

          <section data-recorrido="que-sigue" aria-label="Qué sigue" className="flex flex-col gap-1.5 rounded-xl border border-info-line bg-info-surface p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-info-ink">Qué sigue</span>
            <span className="text-[13px] leading-[19px] text-fg">
              {cerrado
                ? `El punto de equilibrio muestra ${mes} como cerrado. Si después cambia un número del mes, lo marca como «cambió después del cierre».`
                : `Cuando no falte nada, aprietas «Cerrar ${mes}». El punto de equilibrio lo muestra como cerrado y su margen deja de ser preliminar.`}
            </span>
            <span className="text-[13px] leading-[19px] text-fg">
              {cerrado ? "Si hay que corregir algo, reabres el mes con un motivo." : `Si después aparece algo de ${mes}, reabres el mes con un motivo.`}
            </span>
          </section>
        </aside>
      </div>

      <Modal
        open={reabriendo}
        onClose={() => setReabriendo(false)}
        title={`Reabrir ${etiquetaMes(d.periodo, true)}`}
        description="El mes vuelve a estar abierto. Los números con que se cerró quedan guardados y el motivo queda escrito."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReabriendo(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={motivo.trim().length < 3 || ocupado !== null}
              onClick={async () => {
                if (await enviar("reabrir", "/api/finanzas/cierre", { accion: "REABRIR", periodo: d.periodo, motivo }, `${etiquetaMes(d.periodo, true)} quedó abierto.`)) {
                  setReabriendo(false);
                  setMotivo("");
                }
              }}
            >
              {ocupado === "reabrir" ? "Reabriendo…" : "Reabrir"}
            </Button>
          </>
        }
      >
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-fg">Por qué se reabre</span>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Por ejemplo: apareció una factura de septiembre que no estaba."
            autoFocus
          />
        </label>
      </Modal>
    </div>
  );
}
