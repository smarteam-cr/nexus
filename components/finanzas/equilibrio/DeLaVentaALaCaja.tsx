"use client";

/**
 * components/finanzas/equilibrio/DeLaVentaALaCaja.tsx — la pregunta de RevOps: ¿la venta se está convirtiendo en
 * plata? (rediseño del punto de equilibrio, 2026-10-05). Vendido → facturado → cobrado, y dónde se queda la plata entre
 * un paso y el otro. A la derecha, lo facturado por servicio y lo de los aliados.
 */
import Link from "next/link";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import type { ReporteEquilibrio } from "@/lib/finanzas/equilibrio";
import type { Inconsistencia } from "@/lib/finanzas/inconsistencias";
import { nombreDelMes } from "@/lib/finanzas/lectura-equilibrio";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`);

export default function DeLaVentaALaCaja({
  moneda,
  hoyISO,
  indicadores: ind,
  meses,
  porServicio,
  inconsistencias,
  etiquetasDeServicio,
  onAbrirLinea,
}: {
  moneda: string;
  hoyISO: string;
  indicadores: ReporteEquilibrio["indicadores"];
  meses: ReporteEquilibrio["meses"];
  porServicio: ReporteEquilibrio["ingresosPorServicio"];
  inconsistencias: readonly Inconsistencia[];
  etiquetasDeServicio: Record<string, string>;
  onAbrirLinea: (codigo: string) => void;
}) {
  const usd = (n: number) => fmtMontoLibro(Math.round(n), moneda);
  const sinRespaldo = inconsistencias.find((l) => l.codigo === "VENTAS_SIN_COBRANZA");
  /* Lo programado de este mes en adelante todavía está a tiempo; lo de meses que ya terminaron, no. */
  const programadoPorVenir = meses.filter((m) => m.periodo >= hoyISO.slice(0, 7)).reduce((s, m) => s + m.pendienteFacturar, 0);
  const mayorServicio = Math.max(1, ...porServicio.map((s) => s.facturado));

  const pasos = [
    {
      titulo: "Vendido",
      clave: { borderTop: "2px dashed var(--serie-2)" },
      monto: usd(ind.vendidoTotal),
      nota:
        ind.ventasSinMonto > 0
          ? `${ind.ventasConMonto} tratos ganados. Otros ${ind.ventasSinMonto} no tienen monto en HubSpot y cuentan como cero.`
          : `${ind.ventasConMonto} tratos ganados.`,
    },
    {
      titulo: "Facturado",
      clave: { borderTop: "2px solid var(--serie-1)" },
      monto: usd(ind.facturadoTotal),
      nota: "Sin IVA. Lo facturado, no lo vendido, es lo que se compara con el piso.",
    },
    {
      titulo: "Cobrado",
      clave: { borderTop: "2px solid var(--serie-3)" },
      monto: usd(ind.cobradoTotal),
      nota: `${pct(ind.cobranza.sobreFacturado)} de lo facturado; ${pct(ind.cobranza.sobreExigible)} de lo que ya se podía cobrar.`,
    },
  ];

  return (
    <section aria-label="De la venta a la caja" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">De la venta a la caja</span>
        <h2 className="text-lg font-semibold text-fg">¿La venta se está convirtiendo en plata?</h2>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        <article className="flex min-w-0 flex-[2_1_600px] flex-col gap-4 rounded-xl border border-line bg-surface p-5">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_20px_minmax(0,1fr)]">
            {pasos.map((p, i) => (
              <div key={p.titulo} className="contents">
                {i > 0 && (
                  <span aria-hidden className="hidden self-center text-center text-lg text-fg-muted sm:block">
                    ›
                  </span>
                )}
                <div className="flex flex-col gap-1 rounded-[10px] border border-line bg-surface-muted p-3.5">
                  <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                    <span aria-hidden className="inline-block w-3.5" style={p.clave} />
                    {p.titulo}
                  </span>
                  <span className="text-[22px] font-bold leading-7 text-fg">{p.monto}</span>
                  <span className="text-xs leading-[17px] text-fg-secondary">{p.nota}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col">
            <span className="pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Dónde se queda la plata</span>
            {sinRespaldo && sinRespaldo.montoEnJuego !== null && (
              <Fuga
                titulo={`${sinRespaldo.items.length === 1 ? "1 venta ganada" : `${sinRespaldo.items.length} ventas ganadas`} sin respaldo en cobranza.`}
                detalle="Se vendieron y no tienen plan de cobro, o facturan menos de lo vendido."
                monto={usd(sinRespaldo.montoEnJuego)}
                accion={
                  <button type="button" onClick={() => onAbrirLinea("VENTAS_SIN_COBRANZA")} className="text-[13px] font-semibold text-brand hover:text-brand-light">
                    Ver las ventas
                  </button>
                }
              />
            )}
            {ind.pendienteFacturarTotal > 0 && (
              <Fuga
                titulo="Programado y todavía sin factura."
                detalle={
                  programadoPorVenir > 0
                    ? `${usd(programadoPorVenir)} son de ${nombreDelMes(hoyISO.slice(0, 7))} en adelante; el resto ya debió facturarse.`
                    : "Ya debió facturarse."
                }
                monto={usd(ind.pendienteFacturarTotal)}
                accion={
                  <Link href="/cobranza" className="text-[13px] font-semibold text-brand hover:text-brand-light">
                    Ir a Cobranza
                  </Link>
                }
              />
            )}
            {ind.porCobrarTotal > 0 && (
              <Fuga
                titulo="Facturado y sin cobrar."
                detalle={ind.porCobrarVencidoTotal > 0 ? `${usd(ind.porCobrarVencidoTotal)} ya pasaron su plazo.` : "Nada pasó su plazo todavía."}
                monto={usd(ind.porCobrarTotal)}
                accion={
                  <Link href="/cobranza" className="text-[13px] font-semibold text-brand hover:text-brand-light">
                    Ver lo vencido
                  </Link>
                }
              />
            )}
          </div>
        </article>

        <article className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-xl border border-line bg-surface p-5">
          <span className="text-[15px] font-semibold text-fg">Lo facturado, por servicio</span>
          {porServicio.map((s) => (
            <div key={s.tipoServicio} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2 text-[13px]">
                <span className="text-fg">{etiquetasDeServicio[s.tipoServicio] ?? s.tipoServicio}</span>
                <span className="tabular-nums text-fg-secondary">
                  {usd(s.facturado)} · {s.pctDelFacturado.toLocaleString("es-CR", { maximumFractionDigits: 1 })} %
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-hover">
                <div className="h-1.5 rounded-full" style={{ width: `${(s.facturado / mayorServicio) * 100}%`, background: "var(--serie-1)" }} />
              </div>
            </div>
          ))}
          <span className="mt-auto border-t border-line pt-2.5 text-xs leading-[17px] text-fg-secondary">
            Aliados: {usd(ind.partnershipCobradoTotal)} cobrados en el año.
            {ind.partnershipProyectadoTotal > 0 && ` Hay ${usd(ind.partnershipProyectadoTotal)} más estimados que no cuentan hasta que se confirmen.`}
          </span>
        </article>
      </div>
    </section>
  );
}

function Fuga({ titulo, detalle, monto, accion }: { titulo: string; detalle: string; monto: string; accion: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 border-t border-line py-2.5">
      <span className="min-w-0 flex-[1_1_320px] text-sm leading-5 text-fg">
        <strong className="font-semibold">{titulo}</strong> <span className="text-fg-secondary">{detalle}</span>
      </span>
      <span className="text-sm font-semibold tabular-nums text-fg">{monto}</span>
      {accion}
    </div>
  );
}
