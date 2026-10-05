"use client";

/**
 * components/finanzas/equilibrio/PanelesDelEquilibrio.tsx — los paneles laterales del punto de equilibrio (rediseño
 * 2026-10-05): el detalle de un mes, el «¿y si…?» de lo que queda del año, el detalle de un punto de la lista y la
 * decisión sobre los aliados. Ninguno escribe salvo la decisión, que va firmada.
 */
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { etiquetaRubro, RUBROS, type FilaMes } from "@/lib/finanzas/equilibrio";
import type { Inconsistencia } from "@/lib/finanzas/inconsistencias";
import { rolDeLinea } from "@/lib/finanzas/agenda-equilibrio";
import { esFaltanteDePlanilla } from "@/lib/finanzas/cierre";
import { faltanteLegible, nombreDelMes, rangoDeMeses, simular, type EstadoDeMes } from "@/lib/finanzas/lectura-equilibrio";
import { Button, Drawer, Input, Modal, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";
const titulo = (periodo: string) => `${nombreDelMes(periodo).replace(/^./, (c) => c.toUpperCase())} ${periodo.slice(0, 4)}`;

/** Un mes, desarmado: qué entró, qué salió y qué falta para darlo por bueno. */
export function DetalleDelMes({
  m,
  estado,
  moneda,
  etiquetasDeServicio,
  anterior,
  siguiente,
  onIr,
  onClose,
}: {
  m: FilaMes | null;
  estado: EstadoDeMes | null;
  moneda: string;
  etiquetasDeServicio: Record<string, string>;
  anterior: string | null;
  siguiente: string | null;
  onIr: (periodo: string) => void;
  onClose: () => void;
}) {
  const usd = (n: number) => fmtMontoLibro(Math.round(n), moneda);
  if (!m || !estado) return null;
  const servicios = Object.entries(m.facturadoPorServicio).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const mayor = Math.max(1, ...servicios.map(([, n]) => n));
  const faltaPlanilla = m.faltantes.some(esFaltanteDePlanilla);
  const completo = estado.clave === "cerrado" || estado.clave === "cambio" || estado.clave === "sinCerrar";
  const brecha = m.ingresosTotales - m.egresos;
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={titulo(m.periodo)}
      description={estado.detalle}
      footer={
        <div className="flex w-full justify-between gap-2">
          <Button variant="secondary" size="sm" disabled={!anterior} onClick={() => anterior && onIr(anterior)}>
            ‹ {anterior ? nombreDelMes(anterior) : ""}
          </Button>
          <Button variant="secondary" size="sm" disabled={!siguiente} onClick={() => siguiente && onIr(siguiente)}>
            {siguiente ? nombreDelMes(siguiente) : ""} ›
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {completo && (
          <p className={cn("rounded-lg border px-3 py-2 text-[13px]", brecha >= 0 ? "border-success-line bg-success-surface text-success-ink" : "border-warn-line bg-warn-surface text-warn-ink")}>
            {brecha >= 0 ? `Cubrió su gasto y le sobraron ${usd(brecha)}.` : `No cubrió su gasto: le faltaron ${usd(-brecha)}.`}
          </p>
        )}
        <section className="flex flex-col gap-2.5">
          <span className={ROTULO}>Lo que entró</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              ["Facturado", m.facturado, m.partnership > 0 ? `y ${usd(m.partnership)} de aliados` : "sin IVA"],
              ["Cobrado", m.cobrado, "la plata que entró en el mes, sea de la factura que sea"],
              ["Por cobrar", m.porCobrar, m.porCobrarVencido > 0 ? `${usd(m.porCobrarVencido)} ya pasaron su plazo` : "nada vencido"],
              ["Programado sin factura", m.pendienteFacturar, "cuotas del mes que todavía no se facturan"],
            ].map(([t, n, nota]) => (
              <div key={t as string} className="flex flex-col gap-0.5 rounded-[10px] border border-line p-3">
                <span className="text-xs text-fg-muted">{t}</span>
                <span className="text-lg font-bold leading-6 text-fg">{usd(n as number)}</span>
                <span className="text-xs leading-4 text-fg-secondary">{nota}</span>
              </div>
            ))}
          </div>
          {m.vendido > 0 && <span className="text-[13px] text-fg-secondary">Se vendieron {usd(m.vendido)} en tratos que cerraron este mes.</span>}
          {m.partnershipProyectado > 0 && <span className="text-[13px] text-fg-secondary">Hay {usd(m.partnershipProyectado)} estimados de aliados, que no suman hasta que se confirmen.</span>}
          {servicios.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[13px] font-semibold text-fg">Lo facturado, por servicio</span>
              {servicios.map(([k, n]) => (
                <div key={k} className="flex items-center gap-2.5 text-[13px]">
                  <span className="w-[120px] shrink-0 text-fg">{etiquetasDeServicio[k] ?? k}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-surface-hover">
                    <div className="h-1.5 rounded-full" style={{ width: `${(n / mayor) * 100}%`, background: "var(--serie-1)" }} />
                  </div>
                  <span className="w-20 text-right tabular-nums text-fg-secondary">{usd(n)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-1 border-t border-line pt-4">
          <span className={cn(ROTULO, "pb-1.5")}>Lo que salió</span>
          {faltaPlanilla && (
            <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2.5 text-[13px] text-fg-muted">
              <span>○</span>
              <span className="flex-1">Planilla</span>
              <span>falta {faltanteLegible(m.faltantes.find(esFaltanteDePlanilla)!).replace(/^la /, "")}</span>
            </div>
          )}
          {RUBROS.filter((r) => m.egresosPorRubro[r] > 0).map((r) => (
            <div key={r} className="flex items-center gap-2.5 border-b border-line px-3 py-2 text-[13px]">
              <span className="flex-1 text-fg first-letter:uppercase">{etiquetaRubro(r)}</span>
              <span className="tabular-nums text-fg-secondary">{usd(m.egresosPorRubro[r])}</span>
            </div>
          ))}
          <div className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-semibold text-fg">
            <span className="flex-1">{m.estado === "COMPLETO" ? "Gasto del mes" : "Anotado hasta hoy"}</span>
            <span className="tabular-nums">{usd(m.egresos)}</span>
          </div>
        </section>

        {estado.clave !== "cerrado" && estado.clave !== "porVenir" && (
          <section className="flex flex-col gap-2 rounded-xl border border-info-line bg-info-surface p-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-info-ink">Para darlo por bueno</span>
            <span className="text-[13px] leading-[19px] text-fg">
              {estado.clave === "sinCerrar"
                ? "El gasto está completo. Cuando el CFO lo cierre, este mes deja de ser preliminar."
                : estado.clave === "cambio"
                  ? "Algún número cambió después del cierre: hay que mirarlo y, si está bien, volver a cerrarlo."
                  : `${estado.detalle} Con eso completo, el CFO lo puede cerrar.`}
            </span>
            <Link href={`/finanzas/cierre?mes=${m.periodo}`} className="text-[13px] font-semibold text-brand hover:text-brand-light">
              Ir al cierre de {nombreDelMes(m.periodo)}
            </Link>
          </section>
        )}
      </div>
    </Drawer>
  );
}

/** «¿Y si…?» del mes en curso a diciembre. Nada se guarda. */
export function SimularLoQueQueda({
  open,
  base,
  piso,
  moneda,
  onClose,
}: {
  open: boolean;
  base: Array<{ periodo: string; facturado: number; estimadoAliados: number }>;
  piso: number;
  moneda: string;
  onClose: () => void;
}) {
  const usd = (n: number) => fmtMontoLibro(Math.round(n), moneda);
  const inicial = Object.fromEntries(base.map((b) => [b.periodo, Math.round(b.facturado)]));
  const [valores, setValores] = useState<Record<string, number>>(inicial);
  const [contarEstimado, setContarEstimado] = useState(false);
  const [extra, setExtra] = useState(0);
  const leer = (t: string) => Number(t.replace(/[^\d]/g, "")) || 0;
  const s = simular(
    base.map((b) => ({ ...b, facturado: valores[b.periodo] ?? 0 })),
    piso,
    { contarEstimado, costoExtra: extra },
  );
  const estimado = base.filter((b) => b.estimadoAliados > 0);
  const sobra = s.diferencia >= 0;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="lg"
      title={`¿Y si…? · ${rangoDeMeses(base.map((b) => b.periodo))}`}
      description="Mueve lo que se factura cada mes y mira si alcanza el piso. Arranca con lo facturado y lo ya programado. Nada de esto se guarda."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => { setValores(inicial); setContarEstimado(false); setExtra(0); }}>
            Volver a lo programado
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setValores(Object.fromEntries(base.map((b) => [b.periodo, Math.max(0, Math.round(piso + extra - (contarEstimado ? b.estimadoAliados : 0)))])))
            }
          >
            Igualar cada mes al piso
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <section className={cn("flex flex-col gap-1 rounded-xl border p-4", sobra ? "border-success-line bg-success-surface" : "border-warn-line bg-warn-surface")}>
          <span className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", sobra ? "text-success-ink" : "text-warn-ink")}>
            {sobra ? "✓ Cubre el piso" : "● Le falta para el piso"}
          </span>
          <span className="text-[22px] font-bold leading-7 text-fg">
            {sobra ? "Sobran" : "Faltan"} {usd(Math.abs(s.diferencia))}
          </span>
          <span className="text-[13px] leading-[19px] text-fg">
            {usd(s.total)} contra {usd(s.pisoDelPeriodo)} de piso{sobra ? "." : `: ${usd(s.faltaPorMes)} más por mes entre vender y facturar.`}
          </span>
        </section>
        <div className="flex flex-col">
          {base.map((b, i) => {
            const v = valores[b.periodo] ?? 0;
            const ms = s.meses[i]!;
            return (
              <div key={b.periodo} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-3">
                <div className="flex min-w-0 flex-[1_1_160px] flex-col gap-0.5">
                  <label htmlFor={`sim-${b.periodo}`} className="text-sm font-semibold text-fg first-letter:uppercase">
                    {nombreDelMes(b.periodo)}
                  </label>
                  <span className="text-xs text-fg-muted">Programado: {usd(b.facturado)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="secondary" size="sm" aria-label={`Restar 5.000 a ${nombreDelMes(b.periodo)}`} onClick={() => setValores((x) => ({ ...x, [b.periodo]: Math.max(0, v - 5000) }))}>
                    −
                  </Button>
                  <Input
                    id={`sim-${b.periodo}`}
                    inputMode="decimal"
                    value={v.toLocaleString("es-CR").replace(/\s/g, ".")}
                    onChange={(e) => setValores((x) => ({ ...x, [b.periodo]: leer(e.target.value) }))}
                    className="w-28 text-right tabular-nums"
                  />
                  <Button variant="secondary" size="sm" aria-label={`Sumar 5.000 a ${nombreDelMes(b.periodo)}`} onClick={() => setValores((x) => ({ ...x, [b.periodo]: v + 5000 }))}>
                    +
                  </Button>
                </div>
                <span className={cn("w-36 text-right text-xs font-semibold tabular-nums", ms.alcanza ? "text-success-ink" : "text-warn-ink")}>
                  {ms.alcanza ? "✓ alcanza" : `● faltan ${usd(ms.falta)}`}
                </span>
              </div>
            );
          })}
        </div>
        {estimado.length > 0 && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-[19px] text-fg">
            <input type="checkbox" checked={contarEstimado} onChange={() => setContarEstimado((c) => !c)} className="mt-0.5 h-4 w-4" />
            <span>
              Contar lo estimado de aliados: {estimado.map((b) => `${usd(b.estimadoAliados)} en ${nombreDelMes(b.periodo)}`).join(" y ")}.{" "}
              <span className="text-fg-muted">Hoy no cuenta: nadie confirmó el monto.</span>
            </span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="sim-extra" className="flex-[1_1_200px] text-[13px] leading-[19px] text-fg">
            Costo que se suma cada mes <span className="text-fg-muted">(una contratación, una herramienta)</span>
          </label>
          <Input id="sim-extra" inputMode="decimal" value={extra ? extra.toLocaleString("es-CR").replace(/\s/g, ".") : ""} placeholder="0" onChange={(e) => setExtra(leer(e.target.value))} className="w-28 text-right tabular-nums" />
        </div>
      </div>
    </Drawer>
  );
}

/** Un punto de la lista, entero: qué es, qué hacer y todos sus casos, con su monto y sus enlaces. Nunca se trunca. */
export function DetalleDeLinea({ linea, moneda, onClose }: { linea: Inconsistencia | null; moneda: string; onClose: () => void }) {
  if (!linea) return null;
  const usd = (n: number) => fmtMontoLibro(Math.round(n), moneda);
  return (
    <Drawer open onClose={onClose} size="lg" title={linea.titulo} description={`Lo decide: ${rolDeLinea(linea.codigo)}`}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-[19px] text-fg-secondary">{linea.detalle}</p>
        <div className="flex flex-col gap-1 rounded-xl border border-info-line bg-info-surface p-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-info-ink">Qué hacer</span>
          <span className="text-[13px] leading-[19px] text-fg">{linea.queHacer}</span>
        </div>
        {linea.items.length > 0 && (
          <ol className="flex flex-col divide-y divide-line rounded-lg border border-line" aria-label={`${linea.items.length} casos`}>
            {linea.items.map((it, k) => (
              <li key={k} className="flex items-start gap-2 px-3 py-2">
                <span className="w-6 shrink-0 pt-px text-right text-[11px] tabular-nums text-fg-muted">{k + 1}.</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 break-words text-[13px] text-fg">{it.texto}</span>
                    {it.monto !== undefined && <span className="ml-auto whitespace-nowrap text-[13px] tabular-nums text-fg">{usd(it.monto)}</span>}
                  </div>
                  {it.nota && <p className="mt-0.5 break-words text-xs text-fg-muted">{it.nota}</p>}
                  {it.enlaces && it.enlaces.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
                      {it.enlaces.map((e) => (
                        <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">
                          {e.etiqueta} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Drawer>
  );
}

/** La decisión de dirección: si lo que pagan los aliados cuenta para cubrir el piso. Queda firmada. */
export function DecidirAliados({
  open,
  actual,
  onClose,
  onDecidido,
}: {
  open: boolean;
  /** Lo que rige hoy (decidido o por defecto). */
  actual: boolean;
  onClose: () => void;
  onDecidido: () => void;
}) {
  const toast = useToast();
  const [valor, setValor] = useState<boolean>(actual);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    try {
      await fetchJson("/api/finanzas/decisiones", {
        method: "POST",
        body: JSON.stringify({ clave: "aliados-cubren-piso", valor: valor ? "SI" : "NO", nota: nota.trim() || null }),
      });
      toast.success(valor ? "Decidido: los aliados cuentan para cubrir el piso." : "Decidido: los aliados no cuentan para cubrir el piso.");
      onDecidido();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la decisión.");
    } finally {
      setGuardando(false);
    }
  }
  const opcion = (v: boolean, t: string, d: string) => (
    <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-lg border p-3", valor === v ? "border-brand bg-info-surface" : "border-line")}>
      <input type="radio" name="aliados" checked={valor === v} onChange={() => setValor(v)} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fg">{t}</span>
        <span className="text-[13px] leading-[19px] text-fg-secondary">{d}</span>
      </span>
    </label>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="¿Lo que pagan los aliados cuenta para cubrir el piso?"
      description="Cambia el margen, la brecha de cada mes y si un mes cubre su gasto. La caja no cambia: lo que entró, entró."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar la decisión"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        {opcion(true, "Sí, cuentan", "Lo que pagan los aliados (confirmado) suma a los ingresos del mes, como lo facturado.")}
        {opcion(false, "No, solo la venta a clientes", "Se sigue mostrando, pero el piso se mide solo contra lo facturado.")}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-fg">Por qué (opcional)</span>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={1000} />
        </label>
      </div>
    </Modal>
  );
}
